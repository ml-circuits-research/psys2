"""Dispatcher: one shared encoder, two heads (segmentation + world), trained jointly (D1).

  python -m psys2_train.dispatcher --model distilbert-base-uncased --no-lora --lr 5e-5 --out training/runs/dispatcher-distilbert
  python -m psys2_train.dispatcher --model answerdotai/ModernBERT-base --no-lora --lr 5e-5 --out training/runs/dispatcher-modernbert-full
  python -m psys2_train.dispatcher --model answerdotai/ModernBERT-base --lora --lr 3e-4 --out training/runs/dispatcher-modernbert-lora

Heads
  * segmentation: per-token B/I classification over the raw message (B = first token of a segment other than the
    first). Trained on training/dataset/multicmd (psys2_train.multicmd). Decoding: boundary at word-start tokens with
    p(B) > 0.5; joiner words/punctuation ("and", "then", ",", ";") are trimmed from segment ends afterwards.
  * world: sequence classification (first token) over all worlds. Input `tab: <tab> ; recent: <w1 w2> ;; <segment>`
    (data.routing_text; `--no-context` feeds the bare segment). Top-3 worlds with softmax scores.
    alt_worlds: soft target, 0.5 on `world` and 0.5 spread over alt_worlds (57 rows); one-hot otherwise. Evaluation is
    lenient (a prediction in alt_worlds is correct) for the headline numbers and strict numbers are reported too.
  * simplification (KEEP/DELETE/REPLACE edit tags): NOT in this pass. TODO(simplify): add `self.edit_head` (Linear over
    tokens) once rule-validated alignments exist (worker-tasks Round 2); the batch/loss plumbing in `train()` takes any
    extra head through `Dispatcher.forward` returning another logits entry.
Training: every step takes one world batch (routing rows) and one segmentation batch (multicmd messages), two encoder
passes, loss = world + segmentation. bf16 autocast, CUDA only (asserted), DataLoader workers for collation.
Routing train rows are augmented with a fixed 15% lowercased/punctuation-stripped copy for robustness.
Best checkpoint on dev (top-1 world + boundary F1).
"""
from __future__ import annotations
import argparse, json, platform, random, re, sys, time, itertools
from pathlib import Path
import torch
from torch import nn
from torch.utils.data import DataLoader
from transformers import AutoModel, AutoTokenizer, get_linear_schedule_with_warmup
from .data import DATASET, read_jsonl, routing_text, data_hash, leak_count, norm_text
from .model import LORA_TARGETS
from .metrics import world_metrics, boundary_prf
from .multicmd import load_multicmd, trim_segment, MULTICMD

RESULTS = Path(__file__).resolve().parents[1] / "results"
RUNS = Path(__file__).resolve().parents[1] / "runs"


class Dispatcher(nn.Module):
    def __init__(self, backbone, n_worlds, dropout=0.1):
        super().__init__()
        self.backbone = backbone
        h = backbone.config.hidden_size
        self.drop = nn.Dropout(dropout)
        self.seg_head = nn.Linear(h, 2)
        self.world_head = nn.Linear(h, n_worlds)
        # TODO(simplify): self.edit_head = nn.Linear(h, n_edit_tags)  (KEEP/DELETE/REPLACE:<w>), see module docstring

    def encode(self, input_ids, attention_mask):
        return self.drop(self.backbone(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state)

    def seg_logits(self, input_ids, attention_mask):
        return self.seg_head(self.encode(input_ids, attention_mask))

    def world_logits(self, input_ids, attention_mask):
        return self.world_head(self.encode(input_ids, attention_mask)[:, 0])


def build(model_name, n_worlds, lora, lora_r=16):
    backbone = AutoModel.from_pretrained(model_name)
    if lora:
        from peft import LoraConfig, get_peft_model
        targets = LORA_TARGETS.get(backbone.config.model_type, ["query", "value"])
        backbone = get_peft_model(backbone, LoraConfig(r=lora_r, lora_alpha=2 * lora_r, lora_dropout=0.05, target_modules=targets, bias="none"))
    return Dispatcher(backbone, n_worlds)


def param_counts(model):
    return {"trainable": sum(p.numel() for p in model.parameters() if p.requires_grad), "total": sum(p.numel() for p in model.parameters())}


def require_cuda():
    assert torch.cuda.is_available(), "CUDA is required: this task must run on the GPU (never fall back to CPU)"
    return torch.device("cuda")


# ---- data ----------------------------------------------------------------------------------------------------------
def plain_text(s):
    return re.sub(r"\s+", " ", re.sub(r"[.,;?!]", " ", s.lower())).strip()


def world_soft_target(r, w_id):
    t = [0.0] * len(w_id)
    alts = [a for a in r.get("alt_worlds", []) if a in w_id and a != r["world"]]
    if alts:
        t[w_id[r["world"]]] = 0.5
        for a in alts:
            t[w_id[a]] += 0.5 / len(alts)
    else:
        t[w_id[r["world"]]] = 1.0
    return t


def encode_world(tok, rows, w_id, max_len, use_context, with_target=True):
    texts = [routing_text(r, use_context) for r in rows]
    ids = tok(texts, truncation=True, max_length=max_len)["input_ids"]
    return [{"input_ids": i, "target": world_soft_target(r, w_id) if with_target else None, "weight": float(r.get("weight", 1.0))} for i, r in zip(ids, rows)]


def seg_labels(msg, offsets):
    """Per-token labels: 1 for the first token of each non-first segment, 0 otherwise, -100 for special tokens."""
    starts = [s["start"] for s in msg["segments"][1:]]
    lab = [0 if b > a else -100 for a, b in offsets]
    for s in starts:
        for i, (a, b) in enumerate(offsets):
            if b > a and b > s:
                lab[i] = 1
                break
    return lab


def encode_seg(tok, msgs, max_len):
    enc = tok([m["text"] for m in msgs], truncation=True, max_length=max_len, return_offsets_mapping=True)
    return [{"input_ids": i, "offsets": o, "labels": seg_labels(m, o), "weight": 1.0} for i, o, m in zip(enc["input_ids"], enc["offset_mapping"], msgs)]


def make_collate(pad_id):
    def collate(batch):
        n = max(len(b["input_ids"]) for b in batch)
        ids = torch.full((len(batch), n), pad_id); am = torch.zeros((len(batch), n), dtype=torch.long)
        for i, b in enumerate(batch):
            ids[i, :len(b["input_ids"])] = torch.tensor(b["input_ids"]); am[i, :len(b["input_ids"])] = 1
        out = {"input_ids": ids, "attention_mask": am, "weights": torch.tensor([b["weight"] for b in batch])}
        if "labels" in batch[0]:
            lab = torch.full((len(batch), n), -100)
            for i, b in enumerate(batch):
                lab[i, :len(b["labels"])] = torch.tensor(b["labels"])
            out["labels"] = lab
        if batch[0].get("target") is not None:
            out["target"] = torch.tensor([b["target"] for b in batch])
        return out
    return collate


def to_dev(b, dev):
    return {k: v.to(dev, non_blocking=True) for k, v in b.items()}


def loader(items, bs, shuffle, pad_id, workers, seed=0):
    g = torch.Generator(); g.manual_seed(seed)
    return DataLoader(items, batch_size=bs, shuffle=shuffle, collate_fn=make_collate(pad_id), num_workers=workers, generator=g, drop_last=False,
                      persistent_workers=workers > 0, pin_memory=True)


# ---- decoding ------------------------------------------------------------------------------------------------------
def word_start(text, a):
    """Char offset after leading whitespace of a token span start, and whether it starts a word."""
    while a < len(text) and text[a].isspace():
        a += 1
    return a, (a == 0 or not text[a - 1].isalnum())


def token_info(text, offsets):
    """Per token (index, start char, end char, is_word_start) for real tokens; start skips the leading space BPE offsets include."""
    out = []
    for i, (a, b) in enumerate(offsets):
        if b <= a:
            continue
        s, ws = word_start(text, a)
        out.append((i, s, b, ws))
    return out


def segments_from_starts(text, starts):
    """Segments [(a, b)] trimmed of joiner words/punctuation from sorted char starts (the first is 0 or the first non-space)."""
    starts = sorted(set(starts))
    segs = []
    for k, s in enumerate(starts):
        e = starts[k + 1] if k + 1 < len(starts) else len(text)
        seg = text[s:e]
        a, b = s + (len(seg) - len(seg.lstrip())), s + len(seg.rstrip())
        if b > a:
            a, b = trim_segment(text, a, b)
            segs.append((a, b))
    return segs


def candidate_segmentations(text, offsets, probs, n_beam=4, k_unc=6):
    """probs: per-token P(B). Candidates are subsets of boundary flips over the `k_unc` most uncertain word-start tokens
    (the most likely candidate is the argmax of the independent per-token Bernoulli model). Returns [(logprob, [(a,b)])]
    best first, deduplicated by the resulting segmentation."""
    import math
    info = [(i, s, ws) for i, s, b, ws in token_info(text, offsets)]
    first = info[0][0] if info else 0
    pos = [(s, probs[i]) for i, s, ws in info if ws and i != first]  # candidate boundary positions
    base = {s for s, p in pos if p > 0.5}
    unc = sorted(pos, key=lambda x: abs(x[1] - 0.5))[:k_unc]
    def lp(starts):
        t = 0.0
        for s, p in pos:
            q = p if s in starts else 1 - p
            t += math.log(max(q, 1e-9))
        return t
    first_start = info[0][1] if info else 0
    cands = {}
    for mask in range(1 << len(unc)):
        st = set(base)
        for j, (s, _) in enumerate(unc):
            if mask >> j & 1:
                st ^= {s}
        segs = tuple(segments_from_starts(text, [first_start] + list(st)))
        score = lp(st)
        if segs not in cands or cands[segs] < score:
            cands[segs] = score
    ranked = sorted(cands.items(), key=lambda kv: -kv[1])[:n_beam]
    return [(sc, list(sg)) for sg, sc in ranked]


@torch.no_grad()
def run_world(model, tok, items_text, ctxs, use_context, dev, max_len=128, bs=512, topk=3, worlds=None):
    """items_text: segment texts, ctxs: context dicts. Returns per item list of (world, prob) top-k."""
    model.eval()
    rows = [{"text": t, "context": c} for t, c in zip(items_text, ctxs)]
    enc = encode_world(tok, rows, {w: i for i, w in enumerate(worlds)}, max_len, use_context, with_target=False) if rows else []
    order = sorted(range(len(enc)), key=lambda i: len(enc[i]["input_ids"]))
    res = [None] * len(enc); pad = tok.pad_token_id or 0
    col = make_collate(pad)
    for s in range(0, len(order), bs):
        idx = order[s:s + bs]; b = to_dev(col([enc[i] for i in idx]), dev)
        with torch.autocast("cuda", dtype=torch.bfloat16):
            lg = model.world_logits(b["input_ids"], b["attention_mask"])
        p = torch.softmax(lg.float(), -1); v, ix = p.topk(topk, -1)
        for j, i in enumerate(idx):
            res[i] = [(worlds[x], float(y)) for x, y in zip(ix[j].tolist(), v[j].tolist())]
    return res


@torch.no_grad()
def run_seg(model, tok, msgs, dev, max_len=192, bs=256):
    """Returns per message (offsets, per-token P(B))."""
    model.eval()
    enc = tok([m["text"] for m in msgs], truncation=True, max_length=max_len, return_offsets_mapping=True)
    items = [{"input_ids": i, "weight": 1.0} for i in enc["input_ids"]]
    order = sorted(range(len(items)), key=lambda i: len(items[i]["input_ids"]))
    out = [None] * len(items); col = make_collate(tok.pad_token_id or 0)
    for s in range(0, len(order), bs):
        idx = order[s:s + bs]; b = to_dev(col([items[i] for i in idx]), dev)
        with torch.autocast("cuda", dtype=torch.bfloat16):
            lg = model.seg_logits(b["input_ids"], b["attention_mask"])
        p = torch.softmax(lg.float(), -1)[..., 1].cpu().tolist()
        for j, i in enumerate(idx):
            out[i] = (enc["offset_mapping"][i], p[j][:len(items[i]["input_ids"])])
    return out


def dispatch(model, tok, msgs, use_context, dev, worlds, n_beam=4, k_unc=6):
    """Full chain for messages {text, context}: segmentation candidates + top-3 worlds per segment.
    Returns per message {token_probs, candidates: [{score, segments: [{start, end, text, worlds: [(w, p)]}]}]}."""
    seg = run_seg(model, tok, msgs, dev)
    allc = []
    for m, (offs, probs) in zip(msgs, seg):
        allc.append(candidate_segmentations(m["text"], offs, probs, n_beam, k_unc))
    uniq = {}
    for m, cs in zip(msgs, allc):
        ctx = m.get("context") or {}
        for _, segs in cs:
            for a, b in segs:
                uniq.setdefault((m["text"][a:b], json.dumps([ctx.get("tab"), ctx.get("recent_worlds")])), (m["text"][a:b], ctx))
    keys = list(uniq)
    ws = run_world(model, tok, [uniq[k][0] for k in keys], [uniq[k][1] for k in keys], use_context, dev, worlds=worlds)
    wmap = dict(zip(keys, ws))
    out = []
    for m, (offs, probs), cs in zip(msgs, seg, allc):
        ctx = m.get("context") or {}; ck = json.dumps([ctx.get("tab"), ctx.get("recent_worlds")])
        cands = [{"score": sc, "segments": [{"start": a, "end": b, "text": m["text"][a:b], "worlds": [{"world": w, "score": p} for w, p in wmap[(m["text"][a:b], ck)]]} for a, b in segs]} for sc, segs in cs]
        tokens = [{"start": s, "end": e, "p_boundary": probs[i], "word_start": ws_} for i, s, e, ws_ in token_info(m["text"], offs)]
        out.append({"tokens": tokens, "candidates": cands})
    return out


# ---- evaluation ----------------------------------------------------------------------------------------------------
def eval_world(model, tok, rows, use_context, dev, worlds, train_texts):
    res = run_world(model, tok, [r["text"] for r in rows], [r["context"] for r in rows], use_context, dev, worlds=worlds)
    return world_metrics(rows, [[w for w, _ in r] for r in res], train_texts)


def eval_seg(model, tok, msgs, use_context, dev, worlds, with_chain=True):
    outs = dispatch(model, tok, msgs, use_context, dev, worlds, n_beam=1, k_unc=0)
    gold_starts, pred_starts, exact, chain, by_var, by_n = [], [], [], [], {}, {}
    for m, o in zip(msgs, outs):
        top = o["candidates"][0]["segments"]
        gs = {s["start"] for s in m["segments"][1:]}; ps = {s["start"] for s in top[1:]}
        gold_starts.append(gs); pred_starts.append(ps)
        gold_spans = [(s["start"], s["end"]) for s in m["segments"]]
        ok = [(s["start"], s["end"]) for s in top] == gold_spans
        exact.append(ok)
        wok = ok and all(s["worlds"][0]["world"] == g["world"] or s["worlds"][0]["world"] in g.get("alt_worlds", []) for s, g in zip(top, m["segments"]))
        chain.append(wok)
        by_var.setdefault(m["variant"], []).append(ok); by_n.setdefault(m["n_segments"], []).append(ok)
    res = {"n": len(msgs), "boundary": boundary_prf(gold_starts, pred_starts), "exact_segmentation": sum(exact) / len(exact),
           "end_to_end_exact": sum(chain) / len(chain),
           "exact_by_variant": {k: sum(v) / len(v) for k, v in by_var.items()}, "exact_by_n_segments": {str(k): sum(v) / len(v) for k, v in sorted(by_n.items())}}
    return res


# ---- training ------------------------------------------------------------------------------------------------------
def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default="distilbert-base-uncased")
    ap.add_argument("--lora", dest="lora", action="store_true", default=False); ap.add_argument("--no-lora", dest="lora", action="store_false")
    ap.add_argument("--lora-r", type=int, default=16)
    ap.add_argument("--lr", type=float, default=None, help="default 5e-5 full fine-tune, 3e-4 LoRA"); ap.add_argument("--head-lr", type=float, default=1e-3)
    ap.add_argument("--epochs", type=int, default=5); ap.add_argument("--max-steps", type=int, default=0)
    ap.add_argument("--batch-size", type=int, default=128); ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--patience", type=int, default=2); ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--no-context", action="store_true", help="world input without the tab/recent prefix (routing ablation)")
    ap.add_argument("--max-len", type=int, default=128); ap.add_argument("--dataset", default=str(DATASET))
    ap.add_argument("--out", default=None); ap.add_argument("--results", default=None, help="small metrics JSON (default training/results/dispatcher-<name>.json)")
    ap.add_argument("--aug", type=float, default=0.15, help="fraction of routing train rows duplicated as lowercase/no-punctuation")
    a = ap.parse_args(argv)
    dev = require_cuda()
    random.seed(a.seed); torch.manual_seed(a.seed); torch.cuda.manual_seed_all(a.seed)
    lr = a.lr or (3e-4 if a.lora else 5e-5)
    root = Path(a.dataset)
    out = Path(a.out or RUNS / f"dispatcher-{int(time.time())}"); out.mkdir(parents=True, exist_ok=True)
    name = out.name.removeprefix("dispatcher-")
    use_ctx = not a.no_context

    rows = read_jsonl(root / "routing.jsonl")
    sp = {s: [r for r in rows if r["split"] == s] for s in ("train", "dev", "test")}
    worlds = sorted({r["world"] for r in rows}); w_id = {w: i for i, w in enumerate(worlds)}
    mc = {s: load_multicmd(s) for s in ("train", "dev", "test")}
    assert mc["train"], "run `python -m psys2_train.multicmd` first"
    train_texts = {norm_text(r["text"]) for r in sp["train"]}
    n_overlap = leak_count(rows)  # all train rows are kept; the overlap with dev/test is reported (unseen_text subset)
    print("routing train rows whose (text, tab) also occur in dev/test (kept, reported):", n_overlap, flush=True)

    tok = AutoTokenizer.from_pretrained(a.model); pad = tok.pad_token_id or 0
    rng = random.Random(a.seed)
    aug = [dict(r, text=plain_text(r["text"])) for r in sp["train"] if rng.random() < a.aug]
    wtrain = encode_world(tok, sp["train"] + aug, w_id, a.max_len, use_ctx)
    strain = encode_seg(tok, mc["train"], 192)
    model = build(a.model, len(worlds), a.lora, a.lora_r).to(dev)
    pc = param_counts(model)
    print("model", a.model, "lora", a.lora, pc, "device", torch.cuda.get_device_name(0), "world train", len(wtrain), "seg train", len(strain), flush=True)

    wl = loader(wtrain, a.batch_size, True, pad, a.workers, a.seed); sl = loader(strain, a.batch_size, True, pad, a.workers, a.seed + 1)
    steps_per_epoch = len(wl)
    total = a.max_steps or steps_per_epoch * a.epochs
    body = [p for n, p in model.named_parameters() if p.requires_grad and n.startswith("backbone.")]
    heads = [p for n, p in model.named_parameters() if p.requires_grad and not n.startswith("backbone.")]
    opt = torch.optim.AdamW([{"params": body, "lr": lr}, {"params": heads, "lr": a.head_lr}], weight_decay=0.01)
    sched = get_linear_schedule_with_warmup(opt, int(0.06 * total), total)
    seg_w = torch.tensor([1.0, 2.0], device=dev)

    def dev_score():
        wm = eval_world(model, tok, sp["dev"], use_ctx, dev, worlds, train_texts)
        sm = eval_seg(model, tok, mc["dev"], use_ctx, dev, worlds)
        return wm, sm, wm["top1"] + sm["boundary"]["f1"]

    step, best, bad, history, done = 0, -1.0, 0, [], False
    seg_iter = itertools.cycle(sl)
    t0 = time.time()
    for epoch in range(10 ** 6):
        model.train(); lw, ls = [], []
        for wb in wl:
            sb = next(seg_iter)
            wb, sb = to_dev(wb, dev), to_dev(sb, dev)
            with torch.autocast("cuda", dtype=torch.bfloat16):
                wlg = model.world_logits(wb["input_ids"], wb["attention_mask"])
                slg = model.seg_logits(sb["input_ids"], sb["attention_mask"])
            lossw = (-(wb["target"] * torch.log_softmax(wlg.float(), -1)).sum(-1) * wb["weights"]).mean()
            lossg = nn.functional.cross_entropy(slg.float().transpose(1, 2), sb["labels"], weight=seg_w, ignore_index=-100)
            loss = lossw + lossg
            loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step(); sched.step(); opt.zero_grad(set_to_none=True)
            lw.append(lossw.item()); ls.append(lossg.item()); step += 1
            if step % 20 == 0:
                print(f"step {step}/{total} world {sum(lw[-20:]) / 20:.4f} seg {sum(ls[-20:]) / 20:.4f} elapsed {time.time() - t0:.0f}s", flush=True)
            if step >= total:
                done = True; break
        wm, sm, score = dev_score()
        history.append({"epoch": epoch + 1, "step": step, "world_loss": sum(lw) / max(len(lw), 1), "seg_loss": sum(ls) / max(len(ls), 1),
                        "dev_top1": wm["top1"], "dev_top3": wm["top3"], "dev_seg_f1": sm["boundary"]["f1"], "dev_exact_seg": sm["exact_segmentation"]})
        print("epoch", json.dumps(history[-1]), flush=True)
        if score > best:
            best, bad = score, 0; torch.save(model.state_dict(), out / "best.pt")
        else:
            bad += 1
        if done or bad > a.patience:
            break
    train_seconds = time.time() - t0
    model.load_state_dict(torch.load(out / "best.pt", map_location=dev))
    res = {"model": a.model, "name": name, "lora": a.lora, "context": use_ctx, "lr": lr, "params": pc, "train_seconds": train_seconds, "steps": step,
           "gpu": torch.cuda.get_device_name(0), "gpu_peak_mem_gb": torch.cuda.max_memory_allocated() / 2 ** 30,
           "command": "python -m psys2_train.dispatcher " + " ".join(argv if argv is not None else sys.argv[1:]),
           "data_hash": data_hash([root / "routing.jsonl", MULTICMD / "train.jsonl", MULTICMD / "test.jsonl"]), "seed": a.seed, "routing_train_overlap_with_dev_test": n_overlap, "routing_train_rows": len(sp["train"]),
           "versions": {"python": platform.python_version(), "torch": torch.__version__}, "history": history}
    for split in ("dev", "test"):
        res[split] = {"world": eval_world(model, tok, sp[split], use_ctx, dev, worlds, train_texts), "segmentation": eval_seg(model, tok, mc[split], use_ctx, dev, worlds)}
    # world accuracy of the test routing rows, with the context prefix removed at inference only (diagnostic)
    res["test"]["world_inference_without_context"] = {k: v for k, v in eval_world(model, tok, sp["test"], False, dev, worlds, train_texts).items() if k in ("top1", "top3", "macro_f1")}
    (out / "labels.json").write_text(json.dumps({"worlds": worlds}))
    (out / "meta.json").write_text(json.dumps({"model": a.model, "lora": a.lora, "lora_r": a.lora_r, "context": use_ctx, "worlds": worlds, "max_len": a.max_len}))
    tok.save_pretrained(out / "tokenizer")
    (out / "metrics.json").write_text(json.dumps(res, indent=1))
    rp = Path(a.results) if a.results else RESULTS / f"dispatcher-{name}.json"
    rp.parent.mkdir(parents=True, exist_ok=True)
    slim = {k: v for k, v in res.items() if k != "history"}; slim["history"] = history
    rp.write_text(json.dumps(slim, indent=1))
    t = res["test"]
    print("FINAL test world top1 %.4f top3 %.4f macroF1 %.4f | seg F1 %.4f exact %.4f chain %.4f | train %.0fs | %s" % (
        t["world"]["top1"], t["world"]["top3"], t["world"]["macro_f1"], t["segmentation"]["boundary"]["f1"], t["segmentation"]["exact_segmentation"],
        t["segmentation"]["end_to_end_exact"], train_seconds, rp))
    return res


if __name__ == "__main__":
    main()
