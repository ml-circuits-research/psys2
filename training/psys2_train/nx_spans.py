"""NX4-B: world-agnostic extraction from the legend questions.

  python -m psys2_train.nx_spans train --out /abs/training/runs/nx-b-seed1 [--holdout kids.shop,games.hangman,kids.time]

One distilbert encoder, two heads, no world-specific parameters:
  * span head (extractive QA): input `<ask> [SEP] <segment>`, output start/end token or no answer (CLS);
  * operation head: input `<operation doc + example> [SEP] <segment>`, one relevance score; the operation is the highest scoring candidate
    of the world (hard negatives = other operations of the same world in training).
Training uses every world except the held-out ones (default kids.shop, games.hangman, kids.time) to measure generalisation to unseen worlds.
Passes per message (the browser cost) are reported: candidate operations of the world + the asks of the chosen operation.
Data: NX records (training/nx/README.md), /abs/training/dataset/nx/free-*.jsonl; operation docs training/dataset/nx/opdocs.json
(node scripts/export-nx-opdocs.mjs). Only the best and the last checkpoint are kept (a distilbert is 265 MB: 2 files).
"""
from __future__ import annotations
import argparse, glob, json, math, random, sys, time
from collections import Counter, defaultdict
from pathlib import Path
import numpy as np
import torch
from torch import nn
from transformers import AutoModel, AutoTokenizer, get_linear_schedule_with_warmup

from .dispatcher import require_cuda

_LOCAL = Path(__file__).resolve().parents[1]
TRAIN = _LOCAL if (_LOCAL / "runs").exists() else Path("/home/salboaie/work/psys2/training")
NX_DIR = TRAIN / "dataset" / "nx"
MAXLEN = 128


def load(paths):
    return [json.loads(l) for p in paths for l in open(p) if l.strip()]


def op_text(op, docs, examples):
    d = docs.get(op) or {}
    name = op.split(":", 1)[-1].replace(":", " ")
    ex = d.get("example") or examples.get(op) or ""
    return f"{name}. {d.get('doc', '')} Example: {ex}".strip()


class SpanModel(nn.Module):
    def __init__(self, name="distilbert-base-uncased"):
        super().__init__()
        self.enc = AutoModel.from_pretrained(name)
        h = self.enc.config.hidden_size
        self.drop = nn.Dropout(0.1)
        self.qa = nn.Linear(h, 2); self.op = nn.Linear(h, 1)

    def forward(self, ids, am):
        h = self.drop(self.enc(input_ids=ids, attention_mask=am).last_hidden_state)
        s, e = self.qa(h).unbind(-1)
        return s, e, self.op(h[:, 0]).squeeze(-1)


def pad(seqs, padid, extra=None):
    n = max(len(s) for s in seqs)
    ids = torch.full((len(seqs), n), padid); am = torch.zeros((len(seqs), n), dtype=torch.long)
    for i, s in enumerate(seqs):
        ids[i, :len(s)] = torch.tensor(s); am[i, :len(s)] = 1
    return ids, am


def qa_example(tok, ask, r, span):
    enc = tok(ask, r["text"], truncation="only_second", max_length=MAXLEN, return_offsets_mapping=True, return_token_type_ids=False)
    seq = enc.sequence_ids(); offs = enc["offset_mapping"]
    st = en = 0
    if span:
        a, b = span
        toks = [k for k, (x, y) in enumerate(offs) if seq[k] == 1 and y > x and y > a and x < b]
        if toks: st, en = toks[0], toks[-1]
        else: return None
    return {"ids": enc["input_ids"], "start": st, "end": en, "offs": offs, "seq": seq}


def build_qa(tok, rows, rng, neg_ratio=1.0, cap=None):
    by_world_asks = defaultdict(set)
    for r in rows:
        for s in r["slots"]: by_world_asks[r["world"]].add(s["ask"])
    out = []
    for r in rows:
        if r["status"] != "complete" or r["op"] == "none":
            continue
        mine = {s["ask"] for s in r["slots"]}
        for s in r["slots"]:
            if s["span"]:
                ex = qa_example(tok, s["ask"], r, s["span"])
                if ex: out.append(ex)
        pool = list(by_world_asks[r["world"]] - mine)
        for _ in range(int(neg_ratio + rng.random())):
            if pool:
                ex = qa_example(tok, rng.choice(pool), r, None)
                if ex: out.append(ex)
    rng.shuffle(out)
    return out[:cap] if cap else out


def build_op(tok, rows, rng, ops_by_world, optext, neg=2, cap=None):
    out = []
    for r in rows:
        if r["op"] == "none" or r["op"] not in optext: continue
        cands = [o for o in ops_by_world[r["world"]] if o != r["op"]]
        out.append(("pos", r, r["op"]))
        for o in rng.sample(cands, min(neg, len(cands))): out.append(("neg", r, o))
    rng.shuffle(out)
    out = out[:cap] if cap else out
    ex = []
    for kind, r, o in out:
        enc = tok(optext[o], r["text"], truncation="longest_first", max_length=MAXLEN, return_token_type_ids=False)
        ex.append({"ids": enc["input_ids"], "y": 1.0 if kind == "pos" else 0.0})
    return ex


@torch.no_grad()
def run_logits(model, tok, seqs, dev, bs=512):
    model.eval(); padid = tok.pad_token_id or 0
    order = sorted(range(len(seqs)), key=lambda i: len(seqs[i])); res = [None] * len(seqs)
    for k in range(0, len(order), bs):
        idx = order[k:k + bs]; ids, am = pad([seqs[i] for i in idx], padid)
        with torch.autocast("cuda", dtype=torch.bfloat16):
            s, e, o = model(ids.to(dev), am.to(dev))
        s, e, o = s.float().cpu(), e.float().cpu(), o.float().cpu()
        for j, i in enumerate(idx): res[i] = (s[j, :len(seqs[i])], e[j, :len(seqs[i])], float(o[j]))
    return res


def predict_span(sl, el, seq, offs, maxlen=12):
    """Best (start,end) inside the segment tokens vs the no-answer score at CLS. Returns char span in the segment or None."""
    sl, el = sl.numpy(), el.numpy()
    cand = [k for k in range(len(seq)) if seq[k] == 1 and offs[k][1] > offs[k][0]]
    if not cand: return None
    best, bs = None, -1e9
    for i in cand:
        for j in cand:
            if j < i or j - i >= maxlen: continue
            sc = sl[i] + el[j]
            if sc > bs: bs, best = sc, (i, j)
    if bs <= sl[0] + el[0]: return None
    return (offs[best[0]][0], offs[best[1]][1])


def evaluate(model, tok, rows, ops_by_world, optext, dev, worlds=None):
    rows = [r for r in rows if r["status"] == "complete" and r["op"] != "none"]
    # span extraction with the gold operation's asks: exact (span) match per slot with a span, no-answer for slots without one
    qa = []
    for ri, r in enumerate(rows):
        for s in r["slots"]:
            if s["span"] or s["span_source"] == "none":
                ex = qa_example(tok, s["ask"], r, s["span"] if s["span"] else None) or {"ids": tok(s["ask"], r["text"], truncation="only_second", max_length=MAXLEN)["input_ids"], "start": 0, "end": 0}
                enc = tok(s["ask"], r["text"], truncation="only_second", max_length=MAXLEN, return_offsets_mapping=True, return_token_type_ids=False)
                qa.append((ri, s, enc["input_ids"], enc.sequence_ids(), enc["offset_mapping"]))
    lg = run_logits(model, tok, [q[2] for q in qa], dev)
    per = defaultdict(Counter)
    rec_ok = defaultdict(lambda: True)
    for (ri, s, ids, seq, offs), (sl, el, _) in zip(qa, lg):
        r = rows[ri]; w = r["world"]
        p = predict_span(sl, el, seq, offs)
        if s["span"]:
            toks = [(x, y) for k, (x, y) in enumerate(offs) if seq[k] == 1 and y > x and y > s["span"][0] and x < s["span"][1]]
            g = (toks[0][0], toks[-1][1]) if toks else None
            ok = p == g
            per[w]["gold"] += 1; per[w]["tp"] += ok; per[w]["pred"] += p is not None
        else:
            ok = p is None
            per[w]["noans"] += 1; per[w]["noans_ok"] += ok
        if not ok: rec_ok[ri] = False
        if p is not None and not s["span"]: per[w]["pred"] += 1
    # operation: rank the world's candidate operations
    pairs, owners = [], []
    for ri, r in enumerate(rows):
        for o in ops_by_world[r["world"]]:
            if o in optext:
                enc = tok(optext[o], r["text"], truncation="longest_first", max_length=MAXLEN, return_token_type_ids=False)
                pairs.append(enc["input_ids"]); owners.append((ri, o))
    og = run_logits(model, tok, pairs, dev)
    best = {}
    for (ri, o), (_, _, sc) in zip(owners, og):
        if ri not in best or sc > best[ri][0]: best[ri] = (sc, o)
    n_cand = []
    for ri, r in enumerate(rows):
        ok = best.get(ri, (0, None))[1] == r["op"]
        per[r["world"]]["op_n"] += 1; per[r["world"]]["op_ok"] += ok
        if not ok: rec_ok[ri] = False
        per[r["world"]]["rec_n"] += 1; per[r["world"]]["rec_ok"] += rec_ok[ri]
        n_cand.append(len(ops_by_world[r["world"]]) + len([s for s in r["slots"]]))
    def summ(c):
        P = c["tp"] / max(1, c["pred"]); R = c["tp"] / max(1, c["gold"])
        return {"records": c["rec_n"], "op_acc": round(c["op_ok"] / max(1, c["op_n"]), 4), "span_p": round(P, 4), "span_r": round(R, 4), "span_f1": round(2 * P * R / max(1e-9, P + R), 4),
                "noanswer_ok": round(c["noans_ok"] / max(1, c["noans"]), 4), "record_exact": round(c["rec_ok"] / max(1, c["rec_n"]), 4)}
    tot = Counter()
    for w, c in per.items():
        if worlds is None or w in worlds: tot.update(c)
    return {"overall": summ(tot), "worlds": {w: summ(c) for w, c in sorted(per.items())}, "passes_per_segment_avg": round(float(np.mean(n_cand)), 1) if n_cand else None}


def train(a):
    dev = require_cuda(); rng = random.Random(a.seed); torch.manual_seed(a.seed)
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    (out / "command.txt").write_text("python -m psys2_train.nx_spans " + " ".join(sys.argv[1:]) + "\n")
    hold = set(a.holdout.split(",")) if a.holdout else set()
    files = [f for f in sorted(glob.glob(a.data)) if not Path(f).name.startswith("_")]
    rows = load(files)
    docs = json.loads((NX_DIR / "opdocs.json").read_text())
    tr = [r for r in rows if r["split"] == "train" and r["world"] not in hold]
    dv = [r for r in rows if r["split"] == "dev" and r["world"] not in hold]
    te = [r for r in rows if r["split"] == "test" and r["world"] not in hold]
    random.Random(5).shuffle(dv); dv = dv[:a.dev_n]
    ho = [r for r in rows if r["world"] in hold and r["split"] in ("dev", "test")]
    ops_by_world = defaultdict(list)
    for r in rows:
        if r["op"] != "none" and r["op"] not in ops_by_world[r["world"]]: ops_by_world[r["world"]].append(r["op"])
    examples = {}
    for r in sorted(rows, key=lambda r: len(r["text"])):
        if r["op"] != "none" and r["status"] == "complete" and r["op"] not in examples and len(r["text"]) > 12: examples[r["op"]] = r["text"]
    optext = {o: op_text(o, docs, examples) for ops in ops_by_world.values() for o in ops}
    tok = AutoTokenizer.from_pretrained("distilbert-base-uncased")
    model = SpanModel().to(dev)
    padid = tok.pad_token_id or 0
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=0.01)
    qa_all = build_qa(tok, tr, rng, cap=a.cap_qa); op_all = build_op(tok, tr, rng, ops_by_world, optext, cap=a.cap_op)
    print(f"train records {len(tr)} qa {len(qa_all)} op pairs {len(op_all)} holdout rows {len(ho)} ops {len(optext)}", flush=True)
    steps_epoch = math.ceil((len(qa_all) + len(op_all)) / a.batch); total = steps_epoch * a.epochs
    sched = get_linear_schedule_with_warmup(opt, int(0.05 * total), total)
    best, log, start = -1, [], 0
    if a.resume and (out / "last.pt").exists():
        ck = torch.load(out / "last.pt", map_location="cpu"); model.load_state_dict(ck["model"]); opt.load_state_dict(ck["opt"]); sched.load_state_dict(ck["sched"]); start, best = ck["epoch"], ck["best"]
    for ep in range(start, a.epochs):
        model.train(); t0 = time.time()
        items = [("qa", x) for x in qa_all] + [("op", x) for x in op_all]; random.Random(a.seed * 31 + ep).shuffle(items)
        lq = lo = nq = no = 0
        for k in range(0, len(items), a.batch):
            chunk = items[k:k + a.batch]; q = [x for t, x in chunk if t == "qa"]; o = [x for t, x in chunk if t == "op"]
            loss = 0
            with torch.autocast("cuda", dtype=torch.bfloat16):
                if q:
                    ids, am = pad([x["ids"] for x in q], padid); s, e, _ = model(ids.to(dev), am.to(dev))
                    msk = (am.to(dev) == 0); s = s.float().masked_fill(msk, -1e4); e = e.float().masked_fill(msk, -1e4)
                    st = torch.tensor([x["start"] for x in q], device=dev); en = torch.tensor([x["end"] for x in q], device=dev)
                    l = (nn.functional.cross_entropy(s, st) + nn.functional.cross_entropy(e, en)) / 2; loss = loss + l; lq += float(l.detach()); nq += 1
                if o:
                    ids, am = pad([x["ids"] for x in o], padid); _, _, sc = model(ids.to(dev), am.to(dev))
                    l = nn.functional.binary_cross_entropy_with_logits(sc.float(), torch.tensor([x["y"] for x in o], device=dev)); loss = loss + l; lo += float(l.detach()); no += 1
            opt.zero_grad(set_to_none=True); loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0); opt.step(); sched.step()
        ev = evaluate(model, tok, dv, ops_by_world, optext, dev)
        score = ev["overall"]["op_acc"] + ev["overall"]["span_f1"]
        rec = {"epoch": ep + 1, "sec": round(time.time() - t0), "loss_qa": round(lq / max(1, nq), 4), "loss_op": round(lo / max(1, no), 4), "dev": ev["overall"]}
        log.append(rec); print(json.dumps(rec), flush=True)
        st = {"model": model.state_dict(), "opt": opt.state_dict(), "sched": sched.state_dict(), "epoch": ep + 1, "best": max(best, score)}
        torch.save(st, out / "last.pt")
        if score > best: best = score; torch.save({"model": model.state_dict()}, out / "best.pt")
        (out / "log.json").write_text(json.dumps(log, indent=1))
    model.load_state_dict(torch.load(out / "best.pt", map_location="cpu")["model"])
    res = {"seed": a.seed, "command": (out / "command.txt").read_text().strip(), "holdout": sorted(hold), "n_train_records": len(tr),
           "test_seen_worlds": evaluate(model, tok, te, ops_by_world, optext, dev), "heldout_worlds": evaluate(model, tok, ho, ops_by_world, optext, dev) if ho else None}
    (out / "metrics.json").write_text(json.dumps(res, indent=1))
    print("TEST seen", json.dumps(res["test_seen_worlds"]["overall"]), "\nHELDOUT", json.dumps(res["heldout_worlds"]["overall"] if ho else None), flush=True)


def main():
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("train"); t.add_argument("--out", required=True); t.add_argument("--data", default=str(NX_DIR / "free-*.jsonl"))
    t.add_argument("--holdout", default="kids.shop,games.hangman,kids.time"); t.add_argument("--epochs", type=int, default=3); t.add_argument("--batch", type=int, default=128)
    t.add_argument("--lr", type=float, default=5e-5); t.add_argument("--seed", type=int, default=1); t.add_argument("--resume", action="store_true")
    t.add_argument("--dev-n", type=int, default=2500, dest="dev_n"); t.add_argument("--cap-qa", type=int, default=160000, dest="cap_qa"); t.add_argument("--cap-op", type=int, default=240000, dest="cap_op")
    a = ap.parse_args()
    train(a)


if __name__ == "__main__":
    main()
