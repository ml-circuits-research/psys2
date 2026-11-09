"""NX4-A: an operation head and a BIO slot-tag head on the dispatcher v4 encoder (one encoder pass gives everything).

  python -m psys2_train.nx_heads train --mode A      --out /abs/training/runs/nx-a-seed1        # frozen encoder, heads only
  python -m psys2_train.nx_heads train --mode Aplus  --out /abs/training/runs/nx-aplus-seed1    # top 2 layers unfrozen + distillation replay
  python -m psys2_train.nx_heads export --run /abs/training/runs/nx-a-seed1 --out /abs/training/runs/export/nx-a-seed1

Data: NX records (training/nx/README.md), files /abs/training/dataset/nx/free-*.jsonl (and llm-*.jsonl when they exist). Input exactly as the
dispatcher world head: `tab: <tab> ; recent: <w1 w2> ;; <segment>`. op head: sequence level on [CLS]; tag head: per token over the
segment, labels `O`, `B-<tag>`, `I-<tag>` (tag = slot tag family). Records with status `partial` train the op head only (tag loss masked).
Only the best (by dev score) and the last head weights are saved (heads, and the top layers for Aplus), never the frozen encoder.
Every run is resumable at the epoch level (--resume reloads last.pt) and logs its command to <out>/command.txt.
"""
from __future__ import annotations
import argparse, copy, glob, json, math, random, sys, time
from collections import Counter, defaultdict
from pathlib import Path
import numpy as np
import torch
from torch import nn
from transformers import AutoTokenizer, get_linear_schedule_with_warmup

from .dispatcher import build, require_cuda
from .data import read_jsonl

_LOCAL = Path(__file__).resolve().parents[1]
TRAIN = _LOCAL if (_LOCAL / "runs").exists() else Path("/home/salboaie/work/psys2/training")   # a git worktree has no runs/ or dataset/
DISPATCH_RUN = TRAIN / "runs" / "dispatcher-distilbert-v4e"      # published dispatcher v4 = this run, ckpt-step2448 (export sha 6c41eb24)
DISPATCH_CKPT = "ckpt-step2448.pt"
NX_DIR = TRAIN / "dataset" / "nx"
MAX_LEN = 128


def routing_input(r):
    c = r.get("context") or {}
    return f"tab: {c.get('tab') or 'none'} ; recent: {' '.join(c.get('recent') or []) or 'none'} ;; "


def load_records(paths):
    rows = []
    for p in paths:
        rows += [json.loads(l) for l in open(p) if l.strip()]
    return rows


def build_vocabs(train_rows, min_tag=3):
    ops = sorted({r["op"] for r in train_rows})
    cnt = Counter(s["tag"] for r in train_rows if r["status"] == "complete" for s in r["slots"] if s["span"])
    tags = sorted(t for t, n in cnt.items() if n >= min_tag)
    labels = ["O"] + [f"{p}-{t}" for t in tags for p in "BI"]
    return ops, tags, labels


def encode_rows(tok, rows, ops, labels, with_labels=True):
    """Tokenise `prefix + text`; per token label index (O/B/I) or -100. Returns list of dicts."""
    op_id = {o: i for i, o in enumerate(ops)}
    lab_id = {l: i for i, l in enumerate(labels)}
    texts, prefixes = [], []
    for r in rows:
        pre = routing_input(r)
        prefixes.append(len(pre)); texts.append(pre + r["text"])
    enc = tok(texts, truncation=True, max_length=MAX_LEN, return_offsets_mapping=True)
    out = []
    for r, pre, ids, offs in zip(rows, prefixes, enc["input_ids"], enc["offset_mapping"]):
        item = {"input_ids": ids, "op": op_id.get(r["op"], -1), "offs": offs, "pre": pre}
        lab = [-100] * len(ids)
        usable = r["status"] != "partial"
        spans = []
        if usable:
            for s in r["slots"]:
                if s["span"] and s["tag"] and f"B-{s['tag']}" in lab_id:
                    spans.append((s["span"][0] + pre, s["span"][1] + pre, s["tag"]))
                elif s["span"]:
                    usable = False       # a slot of an unknown tag family: do not teach "O" over it
        for k, (a, b) in enumerate(offs):
            if b > a and a >= pre:
                lab[k] = lab_id["O"] if usable else -100
        if usable:
            for a, b, t in spans:
                first = True
                for k, (x, y) in enumerate(offs):
                    if y > x and x >= pre and y > a and x < b:
                        lab[k] = lab_id[("B-" if first else "I-") + t]; first = False
        item["labels"] = lab
        out.append(item)
    return out


def collate(batch, pad):
    n = max(len(b["input_ids"]) for b in batch)
    ids = torch.full((len(batch), n), pad); am = torch.zeros((len(batch), n), dtype=torch.long); lab = torch.full((len(batch), n), -100)
    for i, b in enumerate(batch):
        L = len(b["input_ids"]); ids[i, :L] = torch.tensor(b["input_ids"]); am[i, :L] = 1; lab[i, :L] = torch.tensor(b["labels"])
    return ids, am, lab, torch.tensor([b["op"] for b in batch])


class NXHeads(nn.Module):
    def __init__(self, disp, n_ops, n_labels, dropout=0.1):
        super().__init__()
        self.disp = disp
        h = disp.backbone.config.hidden_size
        self.drop = nn.Dropout(dropout)
        self.op_head = nn.Linear(h, n_ops)
        self.tag_head = nn.Linear(h, n_labels)

    def hidden(self, ids, am):
        return self.disp.backbone(input_ids=ids, attention_mask=am).last_hidden_state

    def forward(self, ids, am):
        h = self.drop(self.hidden(ids, am))
        return self.op_head(h[:, 0]), self.tag_head(h)


def load_dispatcher(dev):
    meta = json.loads((DISPATCH_RUN / "meta.json").read_text())
    disp = build(meta["model"], len(meta["worlds"]), False, 16, len(meta["edit_tags"]))
    disp.load_state_dict(torch.load(DISPATCH_RUN / DISPATCH_CKPT, map_location="cpu"))
    return disp.to(dev), meta


def decode_spans(labels_idx, offs, pre, labels):
    """Predicted (tag, start, end) in segment coordinates from per-token label indices."""
    spans, cur = [], None
    for k, (a, b) in enumerate(offs):
        if b <= a or a < pre:
            continue
        l = labels[labels_idx[k]]
        if l.startswith("B-") or (l.startswith("I-") and (cur is None or cur[0] != l[2:])):
            if cur: spans.append(cur)
            cur = [l[2:], a - pre, b - pre]
        elif l.startswith("I-") and cur and cur[0] == l[2:]:
            cur[2] = b - pre
        else:
            if cur: spans.append(cur); cur = None
    if cur: spans.append(cur)
    return [tuple(s) for s in spans]


def gold_spans(r, offs, pre):
    """Gold (tag, s, e) snapped to token boundaries (so tokenisation artefacts are not errors)."""
    out = []
    for s in r["slots"]:
        if not s["span"]:
            continue
        a, b = s["span"][0] + pre, s["span"][1] + pre
        toks = [(x, y) for x, y in offs if y > x and x >= pre and y > a and x < b]
        if toks:
            out.append((s["tag"], toks[0][0] - pre, toks[-1][1] - pre))
    return out


@torch.no_grad()
def evaluate(model, tok, rows, enc, ops, labels, dev, bs=512):
    model.eval()
    pad = tok.pad_token_id or 0
    order = sorted(range(len(enc)), key=lambda i: len(enc[i]["input_ids"]))
    op_pred = [None] * len(enc); tag_pred = [None] * len(enc)
    for s in range(0, len(order), bs):
        idx = order[s:s + bs]
        ids, am, _, _ = collate([enc[i] for i in idx], pad)
        with torch.autocast("cuda", dtype=torch.bfloat16):
            ol, tl = model(ids.to(dev), am.to(dev))
        o = ol.float().argmax(-1).cpu().tolist(); t = tl.float().argmax(-1).cpu().tolist()
        for j, i in enumerate(idx):
            op_pred[i] = o[j]; tag_pred[i] = t[j][:len(enc[i]["input_ids"])]
    by_world = defaultdict(lambda: Counter())
    tot = Counter()
    for r, e, o, t in zip(rows, enc, op_pred, tag_pred):
        w = by_world[r["world"]]
        ok = ops[o] == r["op"]
        w["n"] += 1; w["op_ok"] += ok; tot["n"] += 1; tot["op_ok"] += ok
        if r["status"] == "complete":
            g = set(gold_spans(r, e["offs"], e["pre"])); p = set(decode_spans(t, e["offs"], e["pre"], labels))
            tp = len(g & p)
            for c in (w, tot):
                c["tp"] += tp; c["fp"] += len(p - g); c["fn"] += len(g - p); c["nc"] += 1; c["exact"] += (g == p and ok)
        elif r["status"] == "filler":
            p = decode_spans(t, e["offs"], e["pre"], labels)
            for c in (w, tot):
                c["filler"] += 1; c["filler_ok"] += (ok and not p)
    def summ(c):
        P = c["tp"] / max(1, c["tp"] + c["fp"]); R = c["tp"] / max(1, c["tp"] + c["fn"])
        return {"n": c["n"], "op_acc": round(c["op_ok"] / max(1, c["n"]), 4), "slot_p": round(P, 4), "slot_r": round(R, 4),
                "slot_f1": round(2 * P * R / max(1e-9, P + R), 4), "exact_complete": round(c["exact"] / max(1, c["nc"]), 4), "n_complete": c["nc"],
                "filler_ok": round(c["filler_ok"] / max(1, c["filler"]), 4), "n_filler": c["filler"]}
    return {"overall": summ(tot), "worlds": {w: summ(c) for w, c in sorted(by_world.items())}}


# ---- dispatcher metrics (before / after), replay data ------------------------------------------------------------
def world_batches(rows, tok, bs):
    texts = [f"tab: {(r['context'] or {}).get('tab') or 'none'} ; recent: {' '.join((r['context'] or {}).get('recent_worlds') or []) or 'none'} ;; {r['text']}" for r in rows]
    enc = tok(texts, truncation=True, max_length=MAX_LEN)["input_ids"]
    return enc


def pad_batch(seqs, pad):
    n = max(len(s) for s in seqs)
    ids = torch.full((len(seqs), n), pad); am = torch.zeros((len(seqs), n), dtype=torch.long)
    for i, s in enumerate(seqs):
        ids[i, :len(s)] = torch.tensor(s); am[i, :len(s)] = 1
    return ids, am


@torch.no_grad()
def dispatcher_outputs(disp, seqs, pad, dev, bs=512):
    """world logits [n,W] (CPU float) and the per-sequence edit/seg logits are compared by the callers; here: world only."""
    disp.eval(); out = []
    order = sorted(range(len(seqs)), key=lambda i: len(seqs[i]))
    res = [None] * len(seqs)
    for s in range(0, len(order), bs):
        idx = order[s:s + bs]; ids, am = pad_batch([seqs[i] for i in idx], pad)
        with torch.autocast("cuda", dtype=torch.bfloat16):
            lg = disp.world_logits(ids.to(dev), am.to(dev))
        lg = lg.float().cpu()
        for j, i in enumerate(idx): res[i] = lg[j]
    return torch.stack(res)


@torch.no_grad()
def dispatcher_metrics(disp, tok, teacher, dev, n_world=6000, n_seg=2000):
    """World top-1 on routing test rows, world top-1 agreement with the teacher (the original v4), segmentation boundary agreement
    and boundary F1 on multicmd test, edit head argmax agreement. Both models in the same bf16 autocast."""
    pad = tok.pad_token_id or 0
    rows = [r for r in read_jsonl(NX_DIR.parent / "routing.jsonl") if r["split"] == "test"]
    random.Random(0).shuffle(rows); rows = rows[:n_world]
    worlds = json.loads((DISPATCH_RUN / "meta.json").read_text())["worlds"]
    gold = [worlds.index(r["world"]) if r["world"] in worlds else -1 for r in rows]
    seqs = world_batches(rows, tok, 512)
    lg = dispatcher_outputs(disp, seqs, pad, dev); lt = dispatcher_outputs(teacher, seqs, pad, dev)
    pred = lg.argmax(-1).tolist(); pt = lt.argmax(-1).tolist()
    ok = [(p == g) for p, g in zip(pred, gold) if g >= 0]
    m = {"world_top1": round(sum(ok) / len(ok), 4), "world_agree_with_v4": round(float(np.mean([a == b for a, b in zip(pred, pt)])), 4),
         "world_max_abs_logit_diff": round(float((lg - lt).abs().max()), 5), "n_world": len(rows)}
    mc = read_jsonl(NX_DIR.parent / "multicmd" / "test.jsonl")[:n_seg]
    seqs = tok([r["text"] for r in mc], truncation=True, max_length=192)["input_ids"]
    disp.eval(); teacher.eval()
    agree = tot = 0; tp = fp = fn = 0
    with torch.no_grad():
        for s in range(0, len(seqs), 256):
            ids, am = pad_batch(seqs[s:s + 256], pad)
            with torch.autocast("cuda", dtype=torch.bfloat16):
                a = disp.seg_logits(ids.to(dev), am.to(dev)).float().argmax(-1); b = teacher.seg_logits(ids.to(dev), am.to(dev)).float().argmax(-1)
            mask = am.to(dev).bool()
            agree += int(((a == b) & mask).sum()); tot += int(mask.sum())
            # boundary F1 vs gold: B = first token of a segment other than the first
            offs = tok([r["text"] for r in mc[s:s + 256]], truncation=True, max_length=192, return_offsets_mapping=True)["offset_mapping"]
            for k, r in enumerate(mc[s:s + 256]):
                starts = {sg["start"] for sg in r["segments"][1:]}
                for t, (x, y) in enumerate(offs[k]):
                    if y <= x: continue
                    xs = x
                    while xs < len(r["text"]) and r["text"][xs].isspace(): xs += 1
                    g = xs in starts; p = bool(a[k, t])
                    tp += g and p; fp += (not g) and p; fn += g and (not p)
    P = tp / max(1, tp + fp); R = tp / max(1, tp + fn)
    m.update({"seg_token_agree_with_v4": round(agree / tot, 4), "seg_boundary_f1": round(2 * P * R / max(1e-9, P + R), 4), "n_seg": len(mc)})
    return m


def train(a):
    dev = require_cuda()
    torch.manual_seed(a.seed); random.seed(a.seed); np.random.seed(a.seed)
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    (out / "command.txt").write_text("python -m psys2_train.nx_heads " + " ".join(sys.argv[1:]) + "\n")
    files = [f for f in sorted(glob.glob(a.data)) if not Path(f).name.startswith("_")]
    rows = load_records(files)
    train_rows = [r for r in rows if r["split"] == "train"]
    dev_rows = [r for r in rows if r["split"] == "dev"]
    test_rows = [r for r in rows if r["split"] == "test"]
    ops, tags, labels = build_vocabs(train_rows)
    (out / "vocab.json").write_text(json.dumps({"ops": ops, "tags": tags, "labels": labels, "files": files}, indent=0))
    tok = AutoTokenizer.from_pretrained(DISPATCH_RUN / "tokenizer")
    enc_tr = encode_rows(tok, train_rows, ops, labels); enc_dv = encode_rows(tok, dev_rows, ops, labels); enc_te = encode_rows(tok, test_rows, ops, labels)
    print(f"train {len(enc_tr)} dev {len(enc_dv)} test {len(enc_te)} ops {len(ops)} labels {len(labels)}", flush=True)
    disp, meta = load_dispatcher(dev)
    teacher = copy.deepcopy(disp).eval()
    for p in teacher.parameters(): p.requires_grad = False
    model = NXHeads(disp, len(ops), len(labels)).to(dev)
    before = dispatcher_metrics(disp, tok, teacher, dev)
    print("dispatcher before", before, flush=True)
    for p in disp.parameters(): p.requires_grad = False
    body = []
    if a.mode == "Aplus":
        layers = disp.backbone.transformer.layer
        for l in layers[-a.unfreeze:]:
            for p in l.parameters(): p.requires_grad = True; body.append(p)
    heads = list(model.op_head.parameters()) + list(model.tag_head.parameters())
    groups = [{"params": heads, "lr": a.lr}] + ([{"params": body, "lr": a.body_lr}] if body else [])
    opt = torch.optim.AdamW(groups, weight_decay=0.01)
    steps_per_epoch = math.ceil(len(enc_tr) / a.batch)
    total = steps_per_epoch * a.epochs
    sched = get_linear_schedule_with_warmup(opt, int(0.05 * total), total)
    pad = tok.pad_token_id or 0
    # replay (Aplus): routing texts for world+edit distillation, multicmd messages for segmentation distillation
    replay_world = replay_seg = None
    if a.mode == "Aplus":
        rr = [r for r in read_jsonl(NX_DIR.parent / "routing.jsonl") if r["split"] == "train"]
        random.Random(1).shuffle(rr); replay_world = world_batches(rr[:30000], tok, 512)
        mc = read_jsonl(NX_DIR.parent / "multicmd" / "train.jsonl"); random.Random(2).shuffle(mc)
        replay_seg = tok([r["text"] for r in mc[:8000]], truncation=True, max_length=192)["input_ids"]
    start_epoch, best = 0, -1.0
    if a.resume and (out / "last.pt").exists():
        ck = torch.load(out / "last.pt", map_location="cpu")
        model.op_head.load_state_dict(ck["op_head"]); model.tag_head.load_state_dict(ck["tag_head"])
        if "body" in ck: disp.load_state_dict(ck["body"], strict=False)
        opt.load_state_dict(ck["opt"]); sched.load_state_dict(ck["sched"]); start_epoch = ck["epoch"]; best = ck["best"]
        print(f"resumed at epoch {start_epoch}", flush=True)
    log = []
    ce = nn.CrossEntropyLoss(ignore_index=-100)
    for ep in range(start_epoch, a.epochs):
        model.train(); disp.eval() if a.mode == "A" else disp.train()
        perm = list(range(len(enc_tr))); random.Random(a.seed * 100 + ep).shuffle(perm)
        t0 = time.time(); agg = Counter()
        for s in range(0, len(perm), a.batch):
            ids, am, lab, op = collate([enc_tr[i] for i in perm[s:s + a.batch]], pad)
            ids, am, lab, op = ids.to(dev), am.to(dev), lab.to(dev), op.to(dev)
            with torch.autocast("cuda", dtype=torch.bfloat16):
                if a.mode == "A":
                    with torch.no_grad(): h = disp.backbone(input_ids=ids, attention_mask=am).last_hidden_state
                    h = model.drop(h)
                    ol, tl = model.op_head(h[:, 0]), model.tag_head(h)
                else:
                    ol, tl = model(ids, am)
                valid_op = op >= 0
                l_op = ce(ol.float()[valid_op], op[valid_op]) if valid_op.any() else ol.sum() * 0
                l_tag = ce(tl.float().reshape(-1, tl.shape[-1]), lab.reshape(-1))
                loss = l_op + a.tag_weight * l_tag
                if a.mode == "Aplus":
                    ridx = random.sample(range(len(replay_world)), a.replay_batch)
                    rid, ram = pad_batch([replay_world[i] for i in ridx], pad); rid, ram = rid.to(dev), ram.to(dev)
                    with torch.no_grad():
                        th = teacher.encode(rid, ram) if False else teacher.backbone(input_ids=rid, attention_mask=ram).last_hidden_state
                        tw = teacher.world_head(th[:, 0]); te = teacher.edit_head(th)
                    sh = disp.backbone(input_ids=rid, attention_mask=ram).last_hidden_state
                    m = ram.bool()
                    l_w = nn.functional.mse_loss(disp.world_head(sh[:, 0]).float(), tw.float())
                    l_e = nn.functional.mse_loss(disp.edit_head(sh).float()[m], te.float()[m])
                    sidx = random.sample(range(len(replay_seg)), a.replay_batch // 2)
                    sid, sam = pad_batch([replay_seg[i] for i in sidx], pad); sid, sam = sid.to(dev), sam.to(dev)
                    with torch.no_grad(): ts = teacher.seg_head(teacher.backbone(input_ids=sid, attention_mask=sam).last_hidden_state)
                    ss = disp.seg_head(disp.backbone(input_ids=sid, attention_mask=sam).last_hidden_state)
                    l_s = nn.functional.mse_loss(ss.float()[sam.bool()], ts.float()[sam.bool()])
                    l_rep = l_w + l_e + l_s
                    loss = loss + a.replay_weight * l_rep
                    agg["rep"] += float(l_rep)
            opt.zero_grad(set_to_none=True); loss.backward()
            torch.nn.utils.clip_grad_norm_([p for g in groups for p in g["params"]], 1.0)
            opt.step(); sched.step()
            agg["op"] += float(l_op); agg["tag"] += float(l_tag); agg["n"] += 1
        dv = evaluate(model, tok, dev_rows, enc_dv, ops, labels, dev)
        score = dv["overall"]["op_acc"] + dv["overall"]["slot_f1"]
        rec = {"epoch": ep + 1, "sec": round(time.time() - t0, 1), "loss_op": round(agg["op"] / agg["n"], 4), "loss_tag": round(agg["tag"] / agg["n"], 4), "loss_replay": round(agg["rep"] / agg["n"], 4), "dev": dv["overall"]}
        log.append(rec); print(json.dumps(rec), flush=True)
        state = {"op_head": model.op_head.state_dict(), "tag_head": model.tag_head.state_dict(), "epoch": ep + 1, "best": max(best, score), "opt": opt.state_dict(), "sched": sched.state_dict()}
        if a.mode == "Aplus":
            state["body"] = {k: v for k, v in disp.state_dict().items() if any(f"backbone.transformer.layer.{i}." in k for i in range(6 - a.unfreeze, 6))}
        torch.save(state, out / "last.pt")
        if score > best:
            best = score; torch.save({k: v for k, v in state.items() if k not in ("opt", "sched")}, out / "best.pt")
        (out / "log.json").write_text(json.dumps(log, indent=1))
    # final: evaluate the BEST checkpoint
    ck = torch.load(out / "best.pt", map_location="cpu")
    model.op_head.load_state_dict(ck["op_head"]); model.tag_head.load_state_dict(ck["tag_head"])
    if "body" in ck: disp.load_state_dict(ck["body"], strict=False)
    res = {"mode": a.mode, "seed": a.seed, "command": (out / "command.txt").read_text().strip(), "best_epoch": None, "files": files, "n": {"train": len(enc_tr), "dev": len(enc_dv), "test": len(enc_te)},
           "dev": evaluate(model, tok, dev_rows, enc_dv, ops, labels, dev), "test": evaluate(model, tok, test_rows, enc_te, ops, labels, dev),
           "dispatcher_before": before, "dispatcher_after": dispatcher_metrics(disp, tok, teacher, dev), "args": vars(a)}
    (out / "metrics.json").write_text(json.dumps(res, indent=1))
    print("TEST", json.dumps(res["test"]["overall"]), "\nDISPATCHER after", res["dispatcher_after"], flush=True)


class ExportWrap(nn.Module):
    """seg_logits, world_logits, edit_logits (the dispatcher's, unchanged names and order) + op_logits, tag_logits."""
    def __init__(self, m):
        super().__init__(); self.m = m

    def forward(self, input_ids, attention_mask):
        d = self.m.disp
        h = d.backbone(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
        return d.seg_head(h), d.world_head(h[:, 0]), d.edit_head(h), self.m.op_head(h[:, 0]), self.m.tag_head(h)


def export(a):
    import onnxruntime as ort
    from .export_onnx import quantize
    run, out = Path(a.run), Path(a.out); out.mkdir(parents=True, exist_ok=True)
    (out / "command.txt").write_text("python -m psys2_train.nx_heads " + " ".join(sys.argv[1:]) + "\n")
    vocab = json.loads((run / "vocab.json").read_text())
    disp, meta = load_dispatcher(torch.device("cpu"))
    model = NXHeads(disp, len(vocab["ops"]), len(vocab["labels"]))
    ck = torch.load(run / "best.pt", map_location="cpu")
    model.op_head.load_state_dict(ck["op_head"]); model.tag_head.load_state_dict(ck["tag_head"])
    if "body" in ck: disp.load_state_dict(ck["body"], strict=False)
    model.eval()
    ids = torch.ones(2, 9, dtype=torch.long)
    axes = {"input_ids": {0: "b", 1: "t"}, "attention_mask": {0: "b", 1: "t"}, "seg_logits": {0: "b", 1: "t"}, "world_logits": {0: "b"}, "edit_logits": {0: "b", 1: "t"}, "op_logits": {0: "b"}, "tag_logits": {0: "b", 1: "t"}}
    fp32, int8 = out / "model.onnx", out / "model.int8.onnx"
    with torch.no_grad():
        torch.onnx.export(ExportWrap(model), (ids, torch.ones_like(ids)), str(fp32), input_names=["input_ids", "attention_mask"],
                          output_names=["seg_logits", "world_logits", "edit_logits", "op_logits", "tag_logits"], opset_version=17, dynamo=False, dynamic_axes=axes)
    quantize(fp32, int8)
    (out / "nx-meta.json").write_text(json.dumps({"ops": vocab["ops"], "labels": vocab["labels"], "mode": "A+" if "body" in ck else "A", "input": "tab: <tab> ; recent: <w1 w2> ;; <segment>"}))
    # dispatcher outputs against v4 (fp32 reference export, and the published int8 file)
    tok = AutoTokenizer.from_pretrained(DISPATCH_RUN / "tokenizer")
    rows = [r for r in read_jsonl(NX_DIR.parent / "routing.jsonl") if r["split"] == "test"]; random.Random(3).shuffle(rows)
    seqs = world_batches(rows[:300], tok, 512)
    mc = read_jsonl(NX_DIR.parent / "multicmd" / "test.jsonl")[:100]
    seqs += tok([r["text"] for r in mc], truncation=True, max_length=192)["input_ids"]
    def run_all(path):
        so = ort.SessionOptions(); so.intra_op_num_threads = 4
        s = ort.InferenceSession(str(path), so, providers=["CPUExecutionProvider"]); res = []
        for q in seqs:
            res.append(s.run(None, {"input_ids": np.array([q], dtype=np.int64), "attention_mask": np.ones((1, len(q)), dtype=np.int64)}))
        return res
    ref32 = run_all(TRAIN / "runs" / "export" / "dispatcher-v4e-c2448" / "model.onnx"); new32 = run_all(fp32)
    pub8 = run_all(Path("/home/salboaie/work/psys2/docs/webchat/models/dispatcher/model.int8.onnx")); new8 = run_all(int8)
    def diff(x, y):
        return {n: float(max(np.abs(p[i] - q[i]).max() for p, q in zip(x, y))) for i, n in enumerate(["seg_logits", "world_logits", "edit_logits"])}
    def same(x, y):
        w = np.mean([p[1].argmax() == q[1].argmax() for p, q in zip(x, y)]); sg = np.mean([np.array_equal(p[0].argmax(-1), q[0].argmax(-1)) for p, q in zip(x, y)]); e = np.mean([np.array_equal(p[2].argmax(-1), q[2].argmax(-1)) for p, q in zip(x, y)])
        return {"world_top1_same": float(w), "seg_argmax_same": float(sg), "edit_argmax_same": float(e)}
    rep = {"mode": "A+" if "body" in ck else "A", "n_inputs": len(seqs), "fp32_vs_v4_fp32_max_abs": diff(ref32, new32), "fp32_vs_v4_fp32": same(ref32, new32),
           "int8_vs_published_int8_max_abs": diff(pub8, new8), "int8_vs_published_int8": same(pub8, new8),
           "size_mb": {"fp32": round(fp32.stat().st_size / 1e6, 1), "int8": round(int8.stat().st_size / 1e6, 1), "published_int8": round(Path("/home/salboaie/work/psys2/docs/webchat/models/dispatcher/model.int8.onnx").stat().st_size / 1e6, 1)},
           "outputs": ["seg_logits", "world_logits", "edit_logits", "op_logits", "tag_logits"], "n_ops": len(vocab["ops"]), "n_tag_labels": len(vocab["labels"])}
    # latency of one pass, 1 and 4 threads
    for th in (1, 4):
        so = ort.SessionOptions(); so.intra_op_num_threads = th
        s = ort.InferenceSession(str(int8), so, providers=["CPUExecutionProvider"]); q = seqs[0]
        feed = {"input_ids": np.array([q], dtype=np.int64), "attention_mask": np.ones((1, len(q)), dtype=np.int64)}
        for _ in range(5): s.run(None, feed)
        t = []
        for _ in range(50):
            t0 = time.time(); s.run(None, feed); t.append((time.time() - t0) * 1000)
        rep[f"int8_pass_ms_p50_{th}thread"] = round(float(np.median(t)), 1)
    (out / "export-report.json").write_text(json.dumps(rep, indent=1))
    print(json.dumps(rep, indent=1))


def main():
    ap = argparse.ArgumentParser(); sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("train")
    t.add_argument("--mode", choices=["A", "Aplus"], default="A"); t.add_argument("--out", required=True)
    t.add_argument("--data", default=str(NX_DIR / "free-*.jsonl")); t.add_argument("--epochs", type=int, default=8)
    t.add_argument("--batch", type=int, default=256); t.add_argument("--lr", type=float, default=2e-3); t.add_argument("--body-lr", type=float, default=2e-5, dest="body_lr")
    t.add_argument("--unfreeze", type=int, default=2); t.add_argument("--tag-weight", type=float, default=1.0, dest="tag_weight")
    t.add_argument("--replay-batch", type=int, default=128, dest="replay_batch"); t.add_argument("--replay-weight", type=float, default=1.0, dest="replay_weight")
    t.add_argument("--seed", type=int, default=1); t.add_argument("--resume", action="store_true")
    e = sub.add_parser("export"); e.add_argument("--run", required=True); e.add_argument("--out", required=True)
    a = ap.parse_args()
    if a.cmd == "train": train(a)
    else: export(a)


if __name__ == "__main__":
    main()
