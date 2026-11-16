"""finetune_roles.py: fine-tune SOP-BERT, the neural reader's joint model (one DistilBERT: it cuts the message and reads, per request, the act,
the values, the names and the descriptions), and export it for transformers.js 3.8.1.

One encoder, three heads (data: make_roles.py output):
  - act head on the [CLS] vector (as DistilBertForSequenceClassification: pre_classifier + ReLU + dropout + classifier): the act;
  - one class head per legend key with values (color, shape, size, position, style, arrow, pairing, ...), on the same [CLS] vector:
    "none" or one of the values the key takes in the training gold; and, as more class heads of the same kind (make_roles.py), "fill:<key>"
    per name-role (none / written / context / description: who fills it) and "desc:<key>" per key of the description (quantifier, color,
    notColor, shape, recency): the model reads descriptions and references itself;
  - a token head: a B / I / O tag per word for the keys whose answer is written in the request (target, anchor, from, to, name, label,
    count, distance); the tag of a word is read on its first word piece.
Loss = cross-entropy of the act + the mean cross-entropy of the class heads + the cross-entropy of the word tags. AdamW, linear warm-up and
decay, fp16 autocast on cuda, early stop on the held-out share of requests read right (fixed before training: act right, every gold class
key right, every gold role tagged on exactly its words); the best epoch is kept.

Export: torch.onnx (TorchScript exporter) of the encoder + heads with inputs input_ids, attention_mask and outputs token_logits
[batch, tokens, tags] and seq_logits [batch, acts + sum of class sizes], then dynamic 8-bit quantization as finetune.py (QUInt8, per
channel, reduce_range) -> onnx/model_quantized.onnx. config.json is the encoder's (model_type distilbert, so transformers.js loads it as
AutoModel and returns both outputs) plus "reader": the head layout (reader.json of make_roles.py). Then check_roles_node.mjs reads 50
held-out requests through docs/js/neural.js makeReader (the demo's decoding code) and compares word pieces, act, classes and tags with torch.

--base distilbert-base-uncased  (or another DistilBERT checkpoint)     --base tiny: a 2-layer DistilBERT from scratch (offline smoke test)
Reported besides the per-key counts: per filler kind (written / context / description), the share of gold name-roles whose kind the model
reads right (and, for written, also on exactly its words), and the description accuracy: described roles read as a description with every
key of the mention right (the mention the engine resolves).
Run: python3 training/neural/finetune_roles.py --base distilbert-base-uncased --name sop-bert [--data DIR] [--work DIR] [--out DIR]
"""
import argparse, collections, json, os, random, shutil, subprocess, sys, time
import numpy as np, torch
from torch import nn

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
REPO = os.path.normpath(os.path.join(HERE, "..", ".."))
LICENSE = {"distilbert-base-uncased": "Apache-2.0", "tiny": "none (random weights, smoke test)"}


def read(path): return [json.loads(l) for l in open(path, encoding="utf8") if l.strip()]


class Reader(nn.Module):
    def __init__(self, encoder, n_acts, class_sizes, n_tags):
        super().__init__()
        H = encoder.config.dim; p = getattr(encoder.config, "seq_classif_dropout", 0.1)
        self.encoder, self.class_sizes = encoder, list(class_sizes)
        self.pre = nn.Linear(H, H); self.drop = nn.Dropout(p)
        self.act = nn.Linear(H, n_acts); self.classes = nn.Linear(H, sum(class_sizes))
        self.tok_drop = nn.Dropout(getattr(encoder.config, "dropout", 0.1)); self.tags = nn.Linear(H, n_tags)
        self.cut = nn.Linear(H, 3)   # request spans over the whole message: O / B / I per word (read on the first word piece)

    def forward(self, input_ids, attention_mask):
        h = self.encoder(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
        cls = self.drop(torch.relu(self.pre(h[:, 0])))
        hd = self.tok_drop(h)
        return self.tags(hd), torch.cat([self.act(cls), self.classes(cls)], dim=-1), self.cut(hd)


def build(base, rows, n_acts, class_sizes, n_tags):
    from transformers import AutoModel, AutoTokenizer, DistilBertConfig, DistilBertModel
    if base == "tiny":
        from finetune import tiny_tokenizer
        tok = tiny_tokenizer([" ".join(r["words"]) for r in rows], None)
        enc = DistilBertModel(DistilBertConfig(vocab_size=len(tok), n_layers=2, n_heads=2, dim=64, hidden_dim=128, max_position_embeddings=512))
    else:
        tok = AutoTokenizer.from_pretrained(base)
        enc = AutoModel.from_pretrained(base, attn_implementation="eager")
    if enc.config.model_type != "distilbert": raise SystemExit(f"--base {base}: a DistilBERT checkpoint is expected (model_type {enc.config.model_type})")
    return tok, Reader(enc, n_acts, class_sizes, n_tags)


class Layout:
    def __init__(self, R):
        self.acts, self.tags, self.classes = R["acts"], R["tags"], R["classes"]
        self.act_id = {a: i for i, a in enumerate(self.acts)}; self.tag_id = {t: i for i, t in enumerate(self.tags)}
        self.class_sizes = [len(v) for _, v in self.classes]
        self.offsets = np.cumsum([len(self.acts)] + self.class_sizes).tolist()   # start of each class key in seq_logits

    def class_targets(self, row):
        return [vals.index(row["classes"][k]) if row["classes"].get(k) in vals else 0 for k, vals in self.classes]


CUT_ID = {"O": 0, "B": 1, "I": 2}


def encode(tok, rows, L, maxlen, dev, tagmap=None):
    tagmap = tagmap or L.tag_id
    enc = tok([r["words"] for r in rows], is_split_into_words=True, truncation=True, max_length=maxlen, padding=True, return_tensors="pt")
    lab, first = [], []
    for b, r in enumerate(rows):
        wid, seen, row, fw = enc.word_ids(b), set(), [], {}
        for t, w in enumerate(wid):
            if w is None or w in seen: row.append(-100); continue
            seen.add(w); fw[w] = t; row.append(tagmap.get(r["tags"][w], 0) if "tags" in r else -100)
        lab.append(row); first.append(fw)
    x = {"input_ids": enc["input_ids"].to(dev), "attention_mask": enc["attention_mask"].to(dev)}
    return x, torch.tensor(lab, device=dev), first, enc


def batches(rows, bs, shuffle, rng):
    idx = list(range(len(rows)))
    if shuffle: rng.shuffle(idx)
    for i in range(0, len(idx), bs): yield [rows[j] for j in idx[i:i + bs]]


def decode(tokl, seql, first, nwords, L):
    """one request's logits -> {act, classes: {key: value}, tags: [tag per word], spans: {key: [[i, j], ...]}} (docs/js/neural.js makeReader)"""
    a = int(np.argmax(seql[:len(L.acts)]))
    classes = {}
    for (k, vals), s in zip(L.classes, L.offsets[:-1]):
        c = int(np.argmax(seql[s:s + len(vals)]))
        if c: classes[k] = vals[c]
    tags = [L.tags[int(np.argmax(tokl[first[w]]))] if w in first else "O" for w in range(nwords)]
    return {"act": L.acts[a], "classes": classes, "tags": tags, "spans": spans_of(tags)}


def spans_of(tags):
    """word tags -> {key: [[first word, last word + 1], ...]}: B starts a role, I continues the role of the same key just before it, else starts one"""
    out, cur = collections.defaultdict(list), None
    for i, t in enumerate(tags):
        if t == "O": cur = None; continue
        p, k = t.split("-", 1)
        if p == "I" and cur == k and out[k] and out[k][-1][1] == i: out[k][-1][1] = i + 1
        else: out[k].append([i, i + 1]); cur = k
    return dict(out)


@torch.no_grad()
def predict(model, tok, rows, L, maxlen, dev, fp16, bs=128):
    model.eval(); out = []
    for part in batches(rows, bs, False, None):
        x, _, first, _ = encode(tok, part, L, maxlen, dev)
        with torch.autocast(device_type="cuda", dtype=torch.float16, enabled=fp16): tl, sl, _ = model(**x)
        tl, sl = tl.float().cpu().numpy(), sl.float().cpu().numpy()
        for b, r in enumerate(part): out.append(decode(tl[b], sl[b], first[b], len(r["words"]), L))
    return out


@torch.no_grad()
def predict_cut(model, tok, rows, L, dev, fp16, maxlen=512, bs=8):
    """whole messages -> the request spans, as [first word, last word + 1] lists (B starts a span, I continues it or starts one)"""
    model.eval(); out = []
    for part in batches(rows, bs, False, None):
        x, _, first, _ = encode(tok, part, L, maxlen, dev, CUT_ID)
        with torch.autocast(device_type="cuda", dtype=torch.float16, enabled=fp16): _, _, cl = model(**x)
        cl = cl.float().cpu().numpy()
        for b, r in enumerate(part):
            tg = ["OBI"[int(np.argmax(cl[b][first[b][w]]))] if w in first[b] else "O" for w in range(len(r["words"]))]
            out.append(cut_spans(tg))
    return out


def cut_spans(tags):
    sp = []
    for i, t in enumerate(tags):
        if t == "B" or (t == "I" and not (sp and sp[-1][1] == i)): sp.append([i, i + 1])
        elif t == "I": sp[-1][1] = i + 1
    return sp


def evaluate_cut(model, tok, rows, L, dev, fp16):
    """exact-span precision / recall / F1 of the cut, and word accuracy (inside / outside a request)"""
    if not rows: return None
    pred = predict_cut(model, tok, rows, L, dev, fp16); tp = np_ = ng = wr = nw = 0
    for r, p in zip(rows, pred):
        g = cut_spans(r["tags"]); tp += sum(x in g for x in p); np_ += len(p); ng += len(g)
        gi = {i for a, b in g for i in range(a, b)}; pi = {i for a, b in p for i in range(a, b)}
        wr += sum((i in gi) == (i in pi) for i in range(len(r["words"]))); nw += len(r["words"])
    P, R = tp / max(np_, 1), tp / max(ng, 1)
    return {"n": len(rows), "spans gold": ng, "spans predicted": np_, "exact": tp, "precision": P, "recall": R, "f1": 2 * P * R / max(P + R, 1e-9), "word accuracy": wr / max(nw, 1)}


def evaluate(model, tok, rows, L, maxlen, dev, fp16):
    """share of requests read right + per key: right / gold, and keys produced that the gold does not have"""
    if not rows: return {"n": 0, "right": 0.0, "act": 0.0, "keys": {}}
    preds = predict(model, tok, rows, L, maxlen, dev, fp16)
    keys = collections.defaultdict(lambda: [0, 0, 0]); right = act = 0; none = [0, 0, 0]   # none: rows, read as none, requests read as none
    kinds = collections.defaultdict(lambda: [0, 0, 0])   # gold filler kind -> [kind read right, gold, kind right and the value read right]
    for r, p in zip(rows, preds):
        ok = p["act"] == r["act"]; act += ok
        if r["act"] == "none": none[0] += 1; none[1] += ok
        else: none[2] += p["act"] == "none"
        for k, _ in L.classes:
            g, q = r["classes"].get(k), p["classes"].get(k)
            if g is not None: keys[k][1] += 1; keys[k][0] += g == q; ok &= g == q
            elif q is not None: keys[k][2] += 1
        gs = spans_of(r["tags"])
        for k in set(gs) | set(p["spans"]):
            g, q = gs.get(k), p["spans"].get(k)
            if g: keys[k][1] += 1; keys[k][0] += g == q; ok &= g == q
            else: keys[k][2] += 1
        right += ok
        dk = [k for k, _ in L.classes if k.startswith("desc:")]
        for k, _ in L.classes:   # per filler kind: the kind read right; written: also its words; description: also every desc key
            if not k.startswith("fill:") or k not in r["classes"]: continue
            g, q, rk = r["classes"][k], p["classes"].get(k), k[5:]
            if g == "written": good = q == "written" and gs.get(rk) == p["spans"].get(rk)
            elif g == "description": good = q == g and all(r["classes"].get(d) == p["classes"].get(d) for d in dk)
            else: good = q == g
            kinds[g][1] += 1; kinds[g][0] += q == g; kinds[g][2] += good
    return {"n": len(rows), "right": right / len(rows), "act": act / len(rows), "none": {"rows": none[0], "read as none": none[1], "requests read as none": none[2]}, "keys": {k: {"right": v[0], "gold": v[1], "extra": v[2]} for k, v in sorted(keys.items())},
            "fill kinds": {k: {"kind right": v[0], "gold": v[1], "value right": v[2]} for k, v in sorted(kinds.items())}}


def report(name, ev):
    print(f"  {name:22} n={ev['n']:5}  requests read right {ev['right']:.4f}  act {ev['act']:.4f}")
    if ev.get("none", {}).get("rows"): print(f"      none rows read as none {ev['none']['read as none']}/{ev['none']['rows']} · requests read as none (lost) {ev['none']['requests read as none']}")
    print("      " + " · ".join(f"{k} {v['right']}/{v['gold']}" + (f" +{v['extra']}" if v['extra'] else "") for k, v in ev["keys"].items()))
    fk = ev.get("fill kinds") or {}
    if fk: print("      name-roles per filler kind (kind read right / value read right / gold): " + " · ".join(
        f"{k} {v['kind right']}/{v['value right']}/{v['gold']} ({v['value right'] / max(v['gold'], 1) * 100:.1f}%)" for k, v in fk.items())
        + (f"  ->  description accuracy {fk['description']['value right']}/{fk['description']['gold']}" if "description" in fk else ""))


def export(model, tok, L, R, out, work, maxlen, enc_config):
    from onnxruntime.quantization import QuantType, quantize_dynamic
    model = model.to("cpu").eval()
    ox = os.path.join(work, "onnx_fp32"); shutil.rmtree(ox, ignore_errors=True); os.makedirs(ox)
    x = tok([["draw", "a", "red", "circle"], ["connect", "Start", "to", "Done", "with", "a", "dashed", "arrow"]], is_split_into_words=True, padding=True, return_tensors="pt")
    torch.onnx.export(model, (x["input_ids"], x["attention_mask"]), os.path.join(ox, "model.onnx"), dynamo=False, opset_version=14,
                      input_names=["input_ids", "attention_mask"], output_names=["token_logits", "seq_logits", "cut_logits"],
                      dynamic_axes={"input_ids": {0: "batch", 1: "sequence"}, "attention_mask": {0: "batch", 1: "sequence"},
                                    "token_logits": {0: "batch", 1: "sequence"}, "seq_logits": {0: "batch"}, "cut_logits": {0: "batch", 1: "sequence"}})
    import onnxruntime as ort   # the fp32 graph must give torch's numbers before it is quantized
    s = ort.InferenceSession(os.path.join(ox, "model.onnx"), providers=["CPUExecutionProvider"])
    o = s.run(None, {"input_ids": x["input_ids"].numpy(), "attention_mask": x["attention_mask"].numpy()})
    with torch.no_grad(): t = model(x["input_ids"], x["attention_mask"])
    print(f"onnx fp32 vs torch: max |diff| token {np.abs(o[0] - t[0].numpy()).max():.2e}, seq {np.abs(o[1] - t[1].numpy()).max():.2e}, cut {np.abs(o[2] - t[2].numpy()).max():.2e}")
    shutil.rmtree(out, ignore_errors=True); os.makedirs(os.path.join(out, "onnx"))
    quantize_dynamic(os.path.join(ox, "model.onnx"), os.path.join(out, "onnx", "model_quantized.onnx"), per_channel=True, reduce_range=True, weight_type=QuantType.QUInt8)
    tok.save_pretrained(out)
    for f in os.listdir(out):   # keep only what transformers.js reads: tokenizer.json, tokenizer_config.json (+ config.json below)
        if f not in ("tokenizer.json", "tokenizer_config.json", "onnx"): os.remove(os.path.join(out, f))
    cfg = enc_config.to_dict(); cfg["architectures"] = ["DistilBertModel"]
    for k in ("id2label", "label2id"): cfg.pop(k, None)
    cfg["reader"] = dict(R, max_length=maxlen)
    json.dump(cfg, open(os.path.join(out, "config.json"), "w"), indent=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True); ap.add_argument("--name", required=True)
    ap.add_argument("--data", default=os.path.expanduser("~/vss-box/ft/roles"))
    ap.add_argument("--work", default=None, help="checkpoints and caches, outside the repo (default ~/vss-box/ft/<name>)")
    ap.add_argument("--out", default=None, help="default docs/model/neural/<name>")
    ap.add_argument("--epochs", type=int, default=8); ap.add_argument("--patience", type=int, default=2)
    ap.add_argument("--lr", type=float, default=6e-5); ap.add_argument("--bs", type=int, default=32)
    ap.add_argument("--max-steps", type=int, default=0, help="stop after N optimizer steps (smoke test)")
    ap.add_argument("--seed", type=int, default=0); ap.add_argument("--no-fp16", action="store_true")
    ap.add_argument("--no-node-check", action="store_true")
    a = ap.parse_args()
    work = a.work or os.path.expanduser(f"~/vss-box/ft/{a.name}"); out = a.out or os.path.join(REPO, "docs", "model", "neural", a.name)
    os.makedirs(work, exist_ok=True); os.environ.setdefault("HF_HOME", os.path.expanduser("~/vss-box/ft/hf"))
    random.seed(a.seed); np.random.seed(a.seed); torch.manual_seed(a.seed); rng = random.Random(a.seed)
    dev = "cuda" if torch.cuda.is_available() else "cpu"; fp16 = dev == "cuda" and not a.no_fp16
    R = json.load(open(os.path.join(a.data, "reader.json"))); L = Layout(R); maxlen = R.get("max_length", 128)
    train, held = read(os.path.join(a.data, "train.jsonl")), read(os.path.join(a.data, "heldout.jsonl"))
    evals = {f[5:-6]: read(os.path.join(a.data, f)) for f in sorted(os.listdir(a.data)) if f.startswith("eval_")}
    cut = {n: read(os.path.join(a.data, f"cut_{n}.jsonl")) for n in ("train", "heldout", "eval_sample1000") if os.path.exists(os.path.join(a.data, f"cut_{n}.jsonl"))}
    tok, model = build(a.base, train + cut.get("train", []), len(L.acts), L.class_sizes, len(L.tags)); model.to(dev)
    print(f"base {a.base}: {sum(p.numel() for p in model.parameters()) / 1e6:.1f}M parameters, device {dev}, fp16 {fp16}; train {len(train)} held-out {len(held)}; "
          f"acts {len(L.acts)}, class keys {len(L.classes)} ({sum(L.class_sizes)} classes), tags {len(L.tags)}", flush=True)
    if cut.get("train"):
        npieces = [len(tok(r["words"], is_split_into_words=True)["input_ids"]) for r in cut["train"] + cut.get("heldout", [])]
        print(f"cut: {len(cut['train'])} train messages; word pieces per message: median {int(np.median(npieces))}, max {max(npieces)}; "
              f"{sum(n > 512 for n in npieces)} of {len(npieces)} exceed 512 (the words beyond are read as outside every request)", flush=True)
    cut_iter = None
    steps_per_epoch = (len(train) + a.bs - 1) // a.bs; total = a.max_steps or steps_per_epoch * a.epochs
    from transformers import get_linear_schedule_with_warmup
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=0.01)
    sch = get_linear_schedule_with_warmup(opt, int(0.06 * total), total); scaler = torch.amp.GradScaler("cuda", enabled=fp16)
    ce = nn.functional.cross_entropy
    # class balance of the act: "none" (text that is not a request) is weighted down when it would be more than 40% of the rows (no subsampling)
    n_none = sum(r["act"] == "none" for r in train); share = n_none / max(len(train), 1); act_w = None
    if "none" in L.act_id and share > 0.40:
        act_w = torch.ones(len(L.acts), device=dev); act_w[L.act_id["none"]] = 0.40 / 0.60 * (len(train) - n_none) / n_none
    print(f"act none: {n_none}/{len(train)} train rows = {share * 100:.1f}%" + (f"; > 40%, loss weight of none {act_w[L.act_id['none']].item():.3f}" if act_w is not None else "; weight 1 (not above 40%)"), flush=True)
    best, bad, step, best_state, t0, done = -1.0, 0, 0, None, time.time(), False
    for ep in range(1, a.epochs + 1):
        model.train(); loss_sum = n = 0
        for part in batches(train, a.bs, True, rng):
            x, lab, _, _ = encode(tok, part, L, maxlen, dev)
            ya = torch.tensor([L.act_id[r["act"]] for r in part], device=dev)
            yc = torch.tensor([L.class_targets(r) for r in part], device=dev)
            with torch.autocast(device_type="cuda", dtype=torch.float16, enabled=fp16):
                tl, sl, _ = model(**x)
            tl, sl = tl.float(), sl.float()
            loss = ce(sl[:, :len(L.acts)], ya, weight=act_w)
            loss = loss + sum(ce(sl[:, s:s + c], yc[:, i]) for i, (s, c) in enumerate(zip(L.offsets[:-1], L.class_sizes))) / len(L.class_sizes)
            loss = loss + ce(tl.reshape(-1, tl.shape[-1]), lab.reshape(-1), ignore_index=-100)
            if cut.get("train"):   # one batch of whole messages per step: the cut head
                if cut_iter is None: cut_iter = iter(())
                cb = next(cut_iter, None)
                if cb is None: cut_iter = batches(cut["train"], 8, True, rng); cb = next(cut_iter)
                cx, clab, _, _ = encode(tok, cb, L, 512, dev, CUT_ID)
                with torch.autocast(device_type="cuda", dtype=torch.float16, enabled=fp16): _, _, cl = model(**cx)
                loss = loss + ce(cl.float().reshape(-1, 3), clab.reshape(-1), ignore_index=-100)
            opt.zero_grad(); scaler.scale(loss).backward(); scaler.unscale_(opt); torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            scaler.step(opt); scaler.update(); sch.step(); loss_sum += loss.item(); n += 1; step += 1
            if a.max_steps and step >= a.max_steps: done = True; break
        ev = evaluate(model, tok, held, L, maxlen, dev, fp16); ec = evaluate_cut(model, tok, cut.get("heldout"), L, dev, fp16)
        score = (ev["right"] + ec["f1"]) / 2 if ec else ev["right"]   # early stop on the mean of requests read right and the cut F1
        print(f"epoch {ep}: loss {loss_sum / max(n, 1):.4f}  held-out: requests read right {ev['right']:.4f}, act {ev['act']:.4f}"
              + (f", cut F1 {ec['f1']:.4f} (P {ec['precision']:.4f} R {ec['recall']:.4f})" if ec else "") + f"  ({time.time() - t0:.0f}s)", flush=True)
        if score > best: best, bad, best_state = score, 0, {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
        else: bad += 1
        if done or bad >= a.patience: break
    model.load_state_dict(best_state); model.to(dev)
    torch.save(best_state, os.path.join(work, "best.pt"))
    print(f"\nbest epoch: held-out score {best:.4f} (mean of requests read right and cut F1; requests read right = act right, every gold class key right, every gold role on exactly its words)")
    print("per key: right/gold (+ produced where the gold has none)")
    res = {"heldout": evaluate(model, tok, held, L, maxlen, dev, fp16)}; report("heldout", res["heldout"])
    for k, rows in evals.items(): res[k] = evaluate(model, tok, rows, L, maxlen, dev, fp16); report(k, res[k])
    for k, rows in cut.items():
        res["cut_" + k] = evaluate_cut(model, tok, rows, L, dev, fp16)
        if res["cut_" + k]: print("  cut " + k + ": " + ", ".join(f"{a} {v:.4f}" if isinstance(v, float) else f"{a} {v}" for a, v in res["cut_" + k].items()))
    json.dump(res, open(os.path.join(work, "eval.json"), "w"), indent=1)
    model.to("cpu"); dev = "cpu"
    chk = held[:50]
    ref = os.path.join(work, "torch_ref.jsonl")
    with open(ref, "w") as f:
        for r, p in zip(chk, predict(model, tok, chk, L, maxlen, "cpu", False)):
            ids = tok([r["words"]], is_split_into_words=True, truncation=True, max_length=maxlen)["input_ids"][0]
            f.write(json.dumps({"text": r["text"], "words": r["words"], "ids": ids, **p}, ensure_ascii=False) + "\n")
    cref = os.path.join(work, "torch_cut_ref.jsonl"); cchk = cut.get("heldout", [])[:20]
    with open(cref, "w") as f:
        for r, sp in zip(cchk, predict_cut(model, tok, cchk, L, "cpu", False)): f.write(json.dumps({"text": r["text"], "words": r["words"], "spans": sp}, ensure_ascii=False) + "\n")
    export(model, tok, L, R, out, work, maxlen, model.encoder.config)
    q = os.path.getsize(os.path.join(out, "onnx", "model_quantized.onnx"))
    agree = None
    if not a.no_node_check and shutil.which("node"):
        r = subprocess.run(["node", os.path.join(HERE, "check_roles_node.mjs"), os.path.dirname(os.path.abspath(out)), os.path.basename(os.path.abspath(out)), ref, cref],
                           capture_output=True, text=True); print(r.stdout.strip(), r.stderr.strip()[-800:])
        agree = json.loads(r.stdout.strip().splitlines()[-1]) if r.returncode == 0 and r.stdout.strip() else None
    ho = res["heldout"]; s1 = res.get("sample1000")
    with open(os.path.join(out, "README.md"), "w") as f:
        f.write(f"""# {"SOP-BERT" if a.name == "sop-bert" else a.name}: DistilBERT fine-tuned on our requests — cuts the message, reads the action, the values, the names and the descriptions

One DistilBERT encoder with these heads (two calls per message: the cut, then all its requests in one batch):
- the act ({len(L.acts)} classes: the action of a command, the ask of a question, else `fact` or `rule`, or `none`: the text is not a request);
- {sum(":" not in k for k, _ in L.classes)} class heads, one per legend key with values ({", ".join(k for k, _ in L.classes if ":" not in k)}): `none` or a value;
- per name-role ({", ".join(R.get("ref_keys", []))}) a head `fill:<key>`: none / written (the word tags give the names) / context (a pronoun
  or vague reference: the value comes from the context rule all readers share, the last shape created or named) / description (a `mention`
  wire); and the description's own keys ({", ".join(R.get("desc_keys", []))}) as heads `desc:<key>`;
- the CUT: a second token head (`cut_logits`, O / B / I per word) reads the WHOLE message (<= 512 word pieces) and marks the request spans; the
  act / class / role heads then read the spans of the message in one batched second call (two calls per message);
- a B / I / O tag per word for the keys whose answer is written in the request ({", ".join(R["span_keys"])}).
The head layout is `reader` in config.json; docs/js/neural.js makeReader decodes it. Load with transformers.js as AutoTokenizer +
AutoModel (dtype `q8`, file `onnx/model_quantized.onnx`); outputs `token_logits` and `seq_logits`.

- Base model: `{a.base}` (license: {LICENSE.get(a.base, "see the base model's card")}); fine-tuned here, weights are a derivative of it.
- Data: {len(train)} request spans from the span-annotated messages of training/sketch (made by training/neural/make_roles.py; split by message id,
  10% of the messages held out; the fixed 1000-message sample and the docs/bench sets are never trained on).
- Held-out act accuracy (fp32 torch): {ho['act']:.4f}. Held-out requests read right (act, every gold class key incl. fill / desc, every gold role on exactly its words): {ho['right']:.4f}.
  Held-out name-roles per filler kind (value read right / gold): {", ".join(f"{k} {v['value right']}/{v['gold']}" for k, v in ho.get("fill kinds", {}).items())}.
  1000-message sample: {f"act {s1['act']:.4f}, requests read right {s1['right']:.4f}" if s1 else "not exported"}.
- Size: onnx/model_quantized.onnx {q / 1e6:.1f} MB (q8). Node check (docs/js/neural.js makeReader, q8) vs torch on {len(chk)} held-out requests: {json.dumps(agree) if agree else "not run"}.
- Trained with training/neural/finetune_roles.py (epochs <= {a.epochs}, lr {a.lr}, batch {a.bs}, fp16 on cuda, seed {a.seed}).
""")
    print(f"\nwrote {out} ({q / 1e6:.1f} MB q8); README.md inside")


if __name__ == "__main__": main()
