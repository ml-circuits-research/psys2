"""Act + roles tagger (P3, spec 21): one encoder, a sentence head for the act and a token head for BIO role spans (thing, set, attribute, value, place, amount).

  python -m psys2_train.act_tagger --size distilbert|minilm6|minilm4 [--data training/data/act-tagger] [--epochs 5] [--bs 256]
        [--out training/runs/act-tagger/<size>] [--results training/results/act-tagger-<size>.json]

Data: scripts/gen-act-tagger-data.mjs (train / dev / test-seen / test-held jsonl: words, tags, act). All training and scoring run on CUDA in bf16.
Sizes: distilbert = distilbert-base-uncased (6 layers, 768); minilm6 = nreimers/MiniLM-L6-H384-uncased (6 layers, 384); minilm4 = the first 4 layers of the same model.
After training: ONNX export (opset 17, dynamic axes, inputs input_ids / attention_mask, outputs act_logits [b,A], tag_logits [b,t,T]) and onnxruntime dynamic int8 quantisation
(per-channel weights), written to <out>/model.int8.onnx with tokenizer vocab and meta.json. Accuracy is scored on CUDA with fp32/bf16 weights AND with the weights fake-quantised to int8
(per channel, quantise-dequantise) as a stand-in for the int8 graph, which can run on CPU only; the int8 graph itself is checked for agreement in the phone-profile run.
"""
from __future__ import annotations
import argparse, json, math, random, time
from pathlib import Path
import numpy as np
import torch
from torch import nn
from transformers import AutoModel, AutoTokenizer, AutoConfig

ROOT = Path(__file__).resolve().parents[2]
ACTS = ["ask", "change", "connect", "copy", "group", "load", "make", "pick", "place", "redo", "remove", "save", "send", "undo", "none"]
ROLES = ["thing", "set", "attribute", "value", "place", "amount"]
TAGS = ["O"] + [f"{p}-{r}" for r in ROLES for p in "BI"]
SIZES = {"distilbert": ("distilbert-base-uncased", None), "minilm6": ("nreimers/MiniLM-L6-H384-uncased", None), "minilm4": ("nreimers/MiniLM-L6-H384-uncased", 4)}


class Tagger(nn.Module):
    def __init__(self, base, layers=None, from_pretrained=True):
        super().__init__()
        self.backbone = AutoModel.from_pretrained(base)
        if layers:
            enc = self.backbone.encoder
            enc.layer = nn.ModuleList(list(enc.layer)[:layers]); self.backbone.config.num_hidden_layers = layers
        h = self.backbone.config.hidden_size
        self.drop = nn.Dropout(0.1)
        self.act_head = nn.Linear(h, len(ACTS))
        self.tag_head = nn.Linear(h, len(TAGS))

    def forward(self, input_ids, attention_mask):
        h = self.backbone(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
        h = self.drop(h)
        return self.act_head(h[:, 0]), self.tag_head(h)


def read(path):
    """Rows of a jsonl file; rows of an act this tagger has no class for (the grammar's `own`: a world's own reader form, not a universal act) are left out."""
    return [r for r in (json.loads(l) for l in Path(path).read_text().splitlines() if l.strip()) if r["act"] in ACTS]


def encode(tok, rows, max_len=64):
    enc = tok([r["words"] for r in rows], is_split_into_words=True, truncation=True, max_length=max_len, padding=False)
    ids, labs, firsts = [], [], []
    for i, r in enumerate(rows):
        wid = enc.word_ids(i); prev = None; lab = []; fs = []
        for k, w in enumerate(wid):
            if w is None or w == prev: lab.append(-100)
            else: lab.append(TAGS.index(r["tags"][w])); fs.append(k)
            prev = w
        ids.append(enc["input_ids"][i]); labs.append(lab); firsts.append(fs)
    return ids, labs, firsts


def batches(ids, labs, acts, order, bs, dev, pad):
    for s in range(0, len(order), bs):
        idx = order[s:s + bs]; T = max(len(ids[i]) for i in idx)
        x = torch.full((len(idx), T), pad, dtype=torch.long); m = torch.zeros((len(idx), T), dtype=torch.long); y = torch.full((len(idx), T), -100, dtype=torch.long)
        for j, i in enumerate(idx):
            n = len(ids[i]); x[j, :n] = torch.tensor(ids[i]); m[j, :n] = 1; y[j, :n] = torch.tensor(labs[i])
        yield x.to(dev), m.to(dev), y.to(dev), torch.tensor([acts[i] for i in idx]).to(dev), idx


def spans(tags):
    out, cur = set(), None
    for i, t in enumerate(list(tags) + ["O"]):
        if cur and not (t.startswith("I-") and t[2:] == cur[0]):
            out.add((cur[0], cur[1], i)); cur = None
        if t.startswith("B-") or (t.startswith("I-") and cur is None): cur = (t[2:], i)
    return out


@torch.no_grad()
def predict(model, tok, rows, dev, bs=1024):
    ids, labs, firsts = encode(tok, rows)
    order = list(range(len(rows))); pa, pt = [None] * len(rows), [None] * len(rows)
    model.eval()
    for x, m, y, a, idx in batches(ids, labs, [ACTS.index(r["act"]) for r in rows], order, bs, dev, tok.pad_token_id):
        with torch.autocast("cuda", dtype=torch.bfloat16):
            la, lt = model(x, m)
        ap = la.argmax(-1).cpu().tolist(); tp = lt.argmax(-1).cpu().tolist()
        for j, i in enumerate(idx):
            pa[i] = ACTS[ap[j]]; pt[i] = [TAGS[tp[j][k]] for k in firsts[i]]
    return pa, pt


def score(model, tok, rows, dev):
    pa, pt = predict(model, tok, rows, dev)
    acc = float(np.mean([p == r["act"] for p, r in zip(pa, rows)]))
    tp = fp = fn = 0; exact = 0; per = {r: [0, 0, 0] for r in ROLES}
    for p, r in zip(pt, rows):
        g = spans(r["tags"]); q = spans(p); tp += len(g & q); fp += len(q - g); fn += len(g - q); exact += g == q
        for role in ROLES:
            gg = {s for s in g if s[0] == role}; qq = {s for s in q if s[0] == role}
            per[role][0] += len(gg & qq); per[role][1] += len(qq - gg); per[role][2] += len(gg - qq)
    f1 = lambda a, b, c: 2 * a / max(1, 2 * a + b + c)
    byw = {}
    for i, r in enumerate(rows):
        w = "synth.*" if r["world"].startswith("synth") else r["world"]
        byw.setdefault(w, []).append(pa[i] == r["act"])
    byw = {w: {"n": len(v), "act_acc": float(np.mean(v))} for w, v in byw.items()}
    return {"n": len(rows), "act_acc": acc, "span_f1": f1(tp, fp, fn), "sentence_exact": exact / len(rows), "role_f1": {k: f1(*v) for k, v in per.items()}, "by_world": byw}


def real_score(model, tok, rows, dev):
    """Scores on real pieces: act accuracy, span F1 on accepted pieces (the labels of the executor's reading), none-class precision / recall, message agreement (every piece of a message right)."""
    pa, pt = predict(model, tok, rows, dev)
    n = len(rows); acc = sum(p == r["act"] for p, r in zip(pa, rows)) / max(1, n)
    tp = fp = fn = 0
    for p, r in zip(pt, rows):
        if r["act"] == "none": continue
        g = spans(r["tags"]); q = spans(p); tp += len(g & q); fp += len(q - g); fn += len(g - q)
    f1 = 2 * tp / max(1, 2 * tp + fp + fn)
    gn = [r["act"] == "none" for r in rows]; pn = [p == "none" for p in pa]
    ntp = sum(a and b for a, b in zip(gn, pn)); nprec = ntp / max(1, sum(pn)); nrec = ntp / max(1, sum(gn))
    acc_rows = [(p, r) for p, r in zip(pa, rows) if r["act"] != "none"]
    acc_act = sum(p == r["act"] for p, r in acc_rows) / max(1, len(acc_rows))
    msgs = {}
    for p, r in zip(pa, rows): msgs.setdefault(r["msg"], []).append(p == r["act"])
    agree = sum(all(v) for v in msgs.values()) / max(1, len(msgs))
    byact = {}
    for p, r in zip(pa, rows): byact.setdefault(r["act"], []).append(p == r["act"])
    return {"pieces": n, "messages": len(msgs), "act_acc": acc, "act_acc_on_accepted": acc_act, "accepted_pieces": len(acc_rows), "span_f1": f1, "none_pieces": sum(gn), "none_precision": nprec, "none_recall": nrec, "message_agreement": agree,
            "by_act": {k: {"n": len(v), "acc": sum(v) / len(v)} for k, v in sorted(byact.items())}}


def fake_quant_int8(model):
    """Weights of every Linear and Embedding rounded to int8 per output channel (quantise then dequantise): a CUDA stand-in for the int8 ONNX graph."""
    with torch.no_grad():
        for mod in model.modules():
            if isinstance(mod, nn.Linear) or isinstance(mod, nn.Embedding):
                w = mod.weight.data; s = (w.abs().amax(dim=-1 if isinstance(mod, nn.Linear) else -1, keepdim=True) / 127).clamp(min=1e-8)
                mod.weight.data = (w / s).round().clamp(-127, 127) * s


class Wrap(nn.Module):
    def __init__(self, m): super().__init__(); self.m = m
    def forward(self, input_ids, attention_mask): return self.m(input_ids, attention_mask)


def export(model, tok, out):
    from onnxruntime.quantization import quantize_dynamic, QuantType
    out.mkdir(parents=True, exist_ok=True)
    m = Wrap(model).cpu().eval(); ids = torch.ones(2, 9, dtype=torch.long)
    with torch.no_grad():
        torch.onnx.export(m, (ids, torch.ones_like(ids)), str(out / "model.onnx"), input_names=["input_ids", "attention_mask"], output_names=["act_logits", "tag_logits"], opset_version=17, dynamo=False,
                          dynamic_axes={"input_ids": {0: "b", 1: "t"}, "attention_mask": {0: "b", 1: "t"}, "act_logits": {0: "b"}, "tag_logits": {0: "b", 1: "t"}})
    quantize_dynamic(str(out / "model.onnx"), str(out / "model.int8.onnx"), weight_type=QuantType.QInt8, per_channel=True)
    vocab = sorted(tok.get_vocab().items(), key=lambda kv: kv[1])
    (out / "vocab.txt").write_text("\n".join(t for t, _ in vocab) + "\n")
    return {"fp32_mb": (out / "model.onnx").stat().st_size / 1e6, "int8_mb": (out / "model.int8.onnx").stat().st_size / 1e6}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", required=True, choices=list(SIZES)); ap.add_argument("--data", default=str(ROOT / "training/data/act-tagger"))
    ap.add_argument("--epochs", type=int, default=5); ap.add_argument("--bs", type=int, default=256); ap.add_argument("--lr", type=float, default=None)
    ap.add_argument("--out", default=None); ap.add_argument("--results", default=None); ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--real", default=None, help="dir with real-train / real-test-seen / real-test-held jsonl (scripts/gen-act-tagger-real.mjs); enables the real-data round")
    ap.add_argument("--real-rep", type=int, default=20, help="copies of the real training pieces mixed into every epoch")
    ap.add_argument("--synth", type=int, default=0, help="use only this many synthetic training rows (0 = all)")
    a = ap.parse_args()
    assert torch.cuda.is_available(), "CUDA is required: training and scoring never run on CPU"
    torch.manual_seed(a.seed); random.seed(a.seed); np.random.seed(a.seed)
    dev = torch.device("cuda"); out = Path(a.out or ROOT / f"training/runs/act-tagger/{a.size}"); res_path = Path(a.results or ROOT / f"training/results/act-tagger-{a.size}.json")
    base, layers = SIZES[a.size]
    tok = AutoTokenizer.from_pretrained(base)
    model = Tagger(base, layers).to(dev)
    nparams = sum(p.numel() for p in model.parameters())
    data = {k: read(Path(a.data) / f"{k}.jsonl") for k in ["train", "dev", "test-seen", "test-held"]}
    realdata = {}
    if a.real:
        realdata = {k: read(Path(a.real) / f"real-{k}.jsonl") for k in ["train", "test-seen", "test-held"]}
        if a.synth: random.shuffle(data["train"]); data["train"] = data["train"][:a.synth]
        data["train"] = data["train"] + realdata["train"] * a.real_rep
    ids, labs, _ = encode(tok, data["train"]); acts = [ACTS.index(r["act"]) for r in data["train"]]
    lr = a.lr or (5e-5 if a.size == "distilbert" else 1.5e-4)
    opt = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    steps = a.epochs * math.ceil(len(ids) / a.bs); warm = int(0.06 * steps)
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: (s + 1) / warm if s < warm else max(0.0, (steps - s) / max(1, steps - warm)))
    ce = nn.CrossEntropyLoss(ignore_index=-100); t0 = time.time(); log = []; step = 0; best = (-1, None)
    for ep in range(a.epochs):
        model.train(); order = list(range(len(ids))); random.shuffle(order); tot = 0; n = 0
        for x, m, y, ya, _ in batches(ids, labs, acts, order, a.bs, dev, tok.pad_token_id):
            with torch.autocast("cuda", dtype=torch.bfloat16):
                la, lt = model(x, m)
                loss = ce(la.float(), ya) + ce(lt.float().reshape(-1, len(TAGS)), y.reshape(-1))
            opt.zero_grad(set_to_none=True); loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0); opt.step(); sched.step(); step += 1
            tot += loss.item(); n += 1
        d = score(model, tok, data["dev"], dev)
        log.append({"epoch": ep + 1, "loss": tot / n, "dev_act": d["act_acc"], "dev_f1": d["span_f1"], "elapsed_s": time.time() - t0})
        print(json.dumps(log[-1]), flush=True)
        if d["act_acc"] + d["span_f1"] > best[0]: best = (d["act_acc"] + d["span_f1"], {k: v.detach().clone() for k, v in model.state_dict().items()})
    model.load_state_dict(best[1])
    res = {"size": a.size, "base": base, "layers": layers or AutoConfig.from_pretrained(base).num_hidden_layers, "params_m": nparams / 1e6, "epochs": a.epochs, "bs": a.bs, "lr": lr, "train_rows": len(ids), "train_seconds": time.time() - t0, "log": log,
           "acts": ACTS, "tags": TAGS, "gpu_bf16": {k: score(model, tok, data[k], dev) for k in ["dev", "test-seen", "test-held"]}}
    out.mkdir(parents=True, exist_ok=True); torch.save(model.state_dict(), out / "best.pt")
    q = Tagger(base, layers).to(dev); q.load_state_dict(model.state_dict()); fake_quant_int8(q)
    if a.real:
        res["real"] = {k: real_score(model, tok, v, dev) for k, v in realdata.items() if k != "train"}
        res["real_int8_weights"] = {k: real_score(q, tok, v, dev) for k, v in realdata.items() if k != "train"}
        res["real_train_pieces"] = len(realdata["train"]); res["real_rep"] = a.real_rep
        dump = {}
        for k in ["test-seen", "test-held"]:
            pa, pt = predict(model, tok, realdata[k], dev)
            dump[k] = [{"text": r["text"], "gold": r["act"], "pred": p, "msg": r["msg"], "world": r["world"], "source": r["source"], "gold_tags": r["tags"], "pred_tags": t} for r, p, t in zip(realdata[k], pa, pt)]
        (out / "real-predictions.json").write_text(json.dumps(dump))
    res["gpu_int8_weights"] = {k: score(q, tok, data[k], dev) for k in ["test-seen", "test-held"]}
    res["onnx"] = export(model, tok, out)
    (out / "meta.json").write_text(json.dumps({"acts": ACTS, "tags": TAGS, "base": base, "layers": res["layers"], "max_len": 64, "lowercase": True}, indent=1))
    res_path.parent.mkdir(parents=True, exist_ok=True); res_path.write_text(json.dumps(res, indent=1))
    print(json.dumps({k: res[k] for k in ["size", "params_m", "onnx"]}), json.dumps({k: (v["act_acc"], v["span_f1"]) for k, v in res["gpu_bf16"].items()}), json.dumps({k: (v["act_acc"], v["span_f1"]) for k, v in res["gpu_int8_weights"].items()}))


if __name__ == "__main__":
    main()
