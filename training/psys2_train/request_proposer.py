"""Request proposer (questions.md Q48 proposal 1): one small encoder that PROPOSES a w.request; the rules decide (src/dialog/proposer.mjs).

  python -m psys2_train.request_proposer [--data training/data/request-proposer] [--base nreimers/MiniLM-L6-H384-uncased] [--epochs 6] [--bs 256]
        [--out training/runs/request-proposer/<name>] [--results training/results/request-proposer-<date>.md] [--probe training/eval/request-probe-2026-11-15.jsonl]

Data: scripts/gen-request-data.mjs (train / dev jsonl: words, tags, act, reaction, refers, question). Heads on one encoder pass: act, reaction, refers (first token), question
(first token, 2 classes) and one tag per word (first word piece; DROP / UNREAD / ACT / REACT / REF / NAME / constraint keys / O). Training and scoring on CUDA in bf16.
Export: ONNX (opset 17, dynamic axes; inputs input_ids / attention_mask; outputs act_logits, reaction_logits, refers_logits, question_logits, tag_logits), onnxruntime dynamic
int8 quantisation (per channel), vocab.txt and meta.json (labels, special ids) in <out>.
"""
from __future__ import annotations
import argparse, datetime, hashlib, json, math, random, time
from pathlib import Path
import numpy as np
import torch
from torch import nn
from transformers import AutoModel, AutoTokenizer

ROOT = Path(__file__).resolve().parents[2]
HEADS = ["act", "reaction", "refers"]


class Proposer(nn.Module):
    def __init__(self, base, sizes, n_tags, layers=None):
        super().__init__()
        self.backbone = AutoModel.from_pretrained(base)
        if layers:
            self.backbone.encoder.layer = nn.ModuleList(list(self.backbone.encoder.layer)[:layers]); self.backbone.config.num_hidden_layers = layers
        h = self.backbone.config.hidden_size
        self.drop = nn.Dropout(0.1)
        self.heads = nn.ModuleList([nn.Linear(h, n) for n in sizes])
        self.question = nn.Linear(h, 2)
        self.tag = nn.Linear(h, n_tags)

    def forward(self, input_ids, attention_mask):
        h = self.drop(self.backbone(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state)
        c = h[:, 0]
        return tuple(hd(c) for hd in self.heads) + (self.question(c), self.tag(h))


def families(r):
    """The forms a row shows (for the held-out family): range (a count with two numbers), neg, not_all, frame, frame-verb (an act implied by a frame), reaction, unread."""
    f = set(); t = r["tags"]; w = r["words"]
    cnt = [x for x, g in zip(w, t) if g == "count"]
    if sum(1 for x in cnt if x[:1].isdigit() or x in NUMBER_WORDS) >= 2: f.add("range")
    if "kind.no" in t: f.add("neg")
    if "kind.not_all" in t: f.add("not_all")
    if "DROP" in t: f.add("frame")
    if r["source"] == "framed.verb": f.add("frame-verb")
    if r["reaction"] != "none": f.add("reaction")
    if "UNREAD" in t: f.add("unread")
    return f


NUMBER_WORDS = {"one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"}


def read(p):
    return [json.loads(l) for l in Path(p).read_text().splitlines() if l.strip()]


def encode(tok, rows, tags, max_len=64):
    enc = tok([r["words"] for r in rows], is_split_into_words=True, truncation=True, max_length=max_len)
    ids, labs, firsts = [], [], []
    for i, r in enumerate(rows):
        prev = None; lab = []; fs = []
        for k, w in enumerate(enc.word_ids(i)):
            if w is None or w == prev: lab.append(-100)
            else: lab.append(tags.index(r["tags"][w]) if r["tags"][w] in tags else 0); fs.append(k)
            prev = w
        ids.append(enc["input_ids"][i]); labs.append(lab); firsts.append(fs)
    return ids, labs, firsts


def batches(ids, labs, ys, order, bs, dev, pad):
    for s in range(0, len(order), bs):
        idx = order[s:s + bs]; T = max(len(ids[i]) for i in idx)
        x = torch.full((len(idx), T), pad, dtype=torch.long); m = torch.zeros((len(idx), T), dtype=torch.long); y = torch.full((len(idx), T), -100, dtype=torch.long)
        for j, i in enumerate(idx):
            n = len(ids[i]); x[j, :n] = torch.tensor(ids[i]); m[j, :n] = 1; y[j, :n] = torch.tensor(labs[i])
        yield x.to(dev), m.to(dev), y.to(dev), [torch.tensor([v[i] for i in idx]).to(dev) for v in ys], idx


@torch.no_grad()
def predict(model, tok, rows, L, dev, bs=1024):
    ids, labs, firsts = encode(tok, rows, L["tags"])
    ys = [[0] * len(rows) for _ in range(4)]
    out = [dict() for _ in rows]
    model.eval()
    for x, m, y, _, idx in batches(ids, labs, ys, list(range(len(rows))), bs, dev, tok.pad_token_id):
        with torch.autocast("cuda", dtype=torch.bfloat16):
            *hs, q, t = model(x, m)
        hp = [h.argmax(-1).cpu().tolist() for h in hs]; qp = q.argmax(-1).cpu().tolist(); tp = t.argmax(-1).cpu().tolist()
        for j, i in enumerate(idx):
            for k, name in enumerate(HEADS): out[i][name] = L[name][hp[k][j]]
            out[i]["question"] = bool(qp[j]); tg = [L["tags"][tp[j][k]] for k in firsts[i]]
            out[i]["tags"] = tg + ["O"] * (len(rows[i]["words"]) - len(tg))
    return out


def score(model, tok, rows, L, dev):
    if not rows: return {"n": 0}
    pr = predict(model, tok, rows, L, dev)
    res = {"n": len(rows)}
    for h in HEADS: res[f"{h}_acc"] = float(np.mean([p[h] == r[h] for p, r in zip(pr, rows)]))
    res["question_acc"] = float(np.mean([p["question"] == r["question"] for p, r in zip(pr, rows)]))
    tw = sum(len(r["words"]) for r in rows)
    res["tag_acc"] = sum(a == b for p, r in zip(pr, rows) for a, b in zip(p["tags"], r["tags"])) / max(1, tw)
    per = {}
    for p, r in zip(pr, rows):
        for a, b in zip(p["tags"], r["tags"]):
            for t, kind in ((b, "g"), (a, "p")):
                per.setdefault(t, {"g": 0, "p": 0, "tp": 0})[kind] += 1
            if a == b: per[b]["tp"] += 1
    res["tag_f1"] = {t: round(2 * v["tp"] / max(1, v["g"] + v["p"]), 4) for t, v in sorted(per.items())}
    res["exact"] = float(np.mean([all(p[h] == r[h] for h in HEADS) and p["question"] == r["question"] and p["tags"] == r["tags"] for p, r in zip(pr, rows)]))
    by = {}
    for p, r in zip(pr, rows):
        ok = all(p[h] == r[h] for h in HEADS) and p["question"] == r["question"] and p["tags"] == r["tags"]
        by.setdefault(r.get("source", "?"), []).append(ok)
    res["exact_by_source"] = {k: {"n": len(v), "exact": round(float(np.mean(v)), 4)} for k, v in sorted(by.items())}
    return res


class Wrap(nn.Module):
    def __init__(self, m): super().__init__(); self.m = m
    def forward(self, input_ids, attention_mask): return self.m(input_ids, attention_mask)


def export(model, tok, out):
    from onnxruntime.quantization import quantize_dynamic, QuantType
    out.mkdir(parents=True, exist_ok=True)
    m = Wrap(model).cpu().float().eval(); ids = torch.ones(2, 9, dtype=torch.long)
    names = ["act_logits", "reaction_logits", "refers_logits", "question_logits", "tag_logits"]
    dyn = {"input_ids": {0: "b", 1: "t"}, "attention_mask": {0: "b", 1: "t"}, **{n: {0: "b"} for n in names[:4]}, "tag_logits": {0: "b", 1: "t"}}
    with torch.no_grad():
        torch.onnx.export(m, (ids, torch.ones_like(ids)), str(out / "model.onnx"), input_names=["input_ids", "attention_mask"], output_names=names, opset_version=17, dynamo=False, dynamic_axes=dyn)
    quantize_dynamic(str(out / "model.onnx"), str(out / "model.int8.onnx"), weight_type=QuantType.QInt8, per_channel=True)
    vocab = sorted(tok.get_vocab().items(), key=lambda kv: kv[1])
    (out / "vocab.txt").write_text("\n".join(t for t, _ in vocab) + "\n")
    sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    return {"fp32_mb": round((out / "model.onnx").stat().st_size / 1e6, 2), "int8_mb": round((out / "model.int8.onnx").stat().st_size / 1e6, 2), "int8_sha256": sha(out / "model.int8.onnx")}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(ROOT / "training/data/request-proposer")); ap.add_argument("--base", default="nreimers/MiniLM-L6-H384-uncased")
    ap.add_argument("--layers", type=int, default=None); ap.add_argument("--epochs", type=int, default=6); ap.add_argument("--bs", type=int, default=256)
    ap.add_argument("--holdout-world", default="diagram.sketch", help="a whole world left out of training and scored apart (reviewer 00:50 item 5); '' = none")
    ap.add_argument("--holdout-family", default="range", help="one family of forms left out of training and scored apart; '' = none")
    ap.add_argument("--lr", type=float, default=1.5e-4); ap.add_argument("--seed", type=int, default=1); ap.add_argument("--out", default=None); ap.add_argument("--results", default=None)
    a = ap.parse_args()
    assert torch.cuda.is_available(), "CUDA is required"
    torch.manual_seed(a.seed); random.seed(a.seed); np.random.seed(a.seed)
    dev = torch.device("cuda")
    data = Path(a.data); train0 = read(data / "train.jsonl"); dv0 = read(data / "dev.jsonl")
    # real rows are TEST ONLY (reviewer 00:50 item 5); the held-out world and family never train
    hw, hf = a.holdout_world, a.holdout_family
    keep = lambda r: not r["source"].startswith("real") and r["world"] != hw and (not hf or hf not in families(r))
    train = [r for r in train0 if keep(r)]; dv = [r for r in dv0 if keep(r)]
    rest = [r for r in train0 + dv0 if not keep(r)]
    tests = {"real (rules-labelled, never trained)": [r for r in rest if r["source"].startswith("real")],
             f"held-out world {hw}": [r for r in rest if r["world"] == hw and not r["source"].startswith("real")][:3000] if hw else [],
             f"held-out family {hf}": [r for r in rest if hf and hf in families(r) and r["world"] != hw and not r["source"].startswith("real")] if hf else []}
    L = {h: sorted({r[h] for r in train0 + dv0}) for h in HEADS}   # label sets over all rows (roles and acts are the language's, not a world's)
    L["tags"] = ["O"] + sorted({t for r in train0 + dv0 for t in r["tags"]} - {"O"})
    name = a.out or f"minilm{a.layers or 6}-{datetime.date.today().isoformat()}"
    out = Path(a.out) if a.out else ROOT / "training/runs/request-proposer" / name
    tok = AutoTokenizer.from_pretrained(a.base)
    model = Proposer(a.base, [len(L[h]) for h in HEADS], len(L["tags"]), a.layers).to(dev)
    nparams = sum(p.numel() for p in model.parameters())
    ids, labs, _ = encode(tok, train, L["tags"])
    ys = [[L[h].index(r[h]) for r in train] for h in HEADS] + [[int(r["question"]) for r in train]]
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=0.01)
    steps = a.epochs * math.ceil(len(ids) / a.bs); warm = max(1, int(0.06 * steps))
    sched = torch.optim.lr_scheduler.LambdaLR(opt, lambda s: (s + 1) / warm if s < warm else max(0.0, (steps - s) / max(1, steps - warm)))
    ce = nn.CrossEntropyLoss(ignore_index=-100); t0 = time.time(); log = []; best = (-1, None)
    for ep in range(a.epochs):
        model.train(); order = list(range(len(ids))); random.shuffle(order); tot = n = 0
        for x, m, y, yh, _ in batches(ids, labs, ys, order, a.bs, dev, tok.pad_token_id):
            with torch.autocast("cuda", dtype=torch.bfloat16):
                *hs, q, t = model(x, m)
                loss = sum(ce(h.float(), yy) for h, yy in zip(hs, yh[:3])) + ce(q.float(), yh[3]) + 2 * ce(t.float().reshape(-1, len(L["tags"])), y.reshape(-1))
            opt.zero_grad(set_to_none=True); loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0); opt.step(); sched.step()
            tot += loss.item(); n += 1
        d = score(model, tok, dv, L, dev)
        log.append({"epoch": ep + 1, "loss": round(tot / n, 4), "dev_exact": round(d["exact"], 4), "dev_act": round(d["act_acc"], 4), "dev_tag": round(d["tag_acc"], 4), "elapsed_s": round(time.time() - t0, 1)})
        print(json.dumps(log[-1]), flush=True)
        if d["exact"] > best[0]: best = (d["exact"], {k: v.detach().clone() for k, v in model.state_dict().items()})
    model.load_state_dict(best[1]); secs = time.time() - t0
    res = {"base": a.base, "layers": a.layers or model.backbone.config.num_hidden_layers, "params_m": round(nparams / 1e6, 2), "epochs": a.epochs, "bs": a.bs, "lr": a.lr, "seed": a.seed,
           "train_rows": len(train), "dev_rows": len(dv), "train_seconds": round(secs, 1), "log": log, "labels": L,
           "data_sha256": {f: hashlib.sha256((data / f).read_bytes()).hexdigest() for f in ["train.jsonl", "dev.jsonl"]}, "dev": score(model, tok, dv, L, dev),
           "holdout": {"world": hw, "family": hf}, "tests": {k: score(model, tok, v, L, dev) for k, v in tests.items()}}
    out.mkdir(parents=True, exist_ok=True); torch.save(model.state_dict(), out / "best.pt")
    res["onnx"] = export(model, tok, out)
    meta = {**{h + "s" if h != "refers" else "refers": L[h] for h in HEADS}, "tags": L["tags"], "base": a.base, "layers": res["layers"], "max_len": 64, "lowercase": True,
            "cls_id": tok.cls_token_id, "sep_id": tok.sep_token_id, "unk_id": tok.unk_token_id, "pad_id": tok.pad_token_id}
    meta["acts"], meta["reactions"] = L["act"], L["reaction"]
    vb = data / "verbs.json"
    if vb.exists(): meta["verbs"] = json.loads(vb.read_text())
    (out / "meta.json").write_text(json.dumps(meta, indent=1))
    (out / "results.json").write_text(json.dumps(res, indent=1))
    print(json.dumps({k: res[k] for k in ["params_m", "train_rows", "train_seconds", "onnx"]}), json.dumps({k: res["dev"][k] for k in ["exact", "act_acc", "reaction_acc", "refers_acc", "question_acc", "tag_acc"]}))


if __name__ == "__main__":
    main()
