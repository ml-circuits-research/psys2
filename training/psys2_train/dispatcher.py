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
  * simplification (edit tags, D1b): per-word KEEP / DELETE / R:<text> / P:<text> / A:<text> over the SEGMENT words of the same input
    as the world head (`tab: .. ; recent: .. ;; <segment>`), so one encoder pass per piece gives the world scores AND the edit tags.
    Labels sit on the first sub-token of every word (psys2_train/edit.py). Training data: training/dataset-edit/ (scripts/build-edit-tags.mjs:
    rule-verified alignments + identity examples; held-out paraphrases are trained on too unless --no-heldout-train). `simplified` of a segment is
    the rewritten text when it differs from the original. Disabled with --no-edit (then the model is the plain D1 dispatcher).
Training (reviews F4/F6/F7/F8): every head has an explicit step budget (--steps-routing/--steps-seg/--steps-edit, default = every optimizer
step; batches are spread evenly), loss = world + segmentation + edit_weight * edit, bf16 autocast, CUDA only (asserted).
Routing: all rows every epoch plus a reserved share (--focus-frac) for recent failures (probed after every evaluation), contrastive near-misses
(mined: one word differs, other world) and a replay pool of solved rows, plus a per-source floor (psys2_train/sampling.py). Segmentation:
multi-command messages (concatenations + compositional programs, psys2_train/compositional.py) are REGENERATED every pass. What was shown is
logged per head, kind, source, world and family (metrics.json "shown", shown.json). The best --keep-ckpts checkpoints by the dev score are
judged on the operational set through the whole pipeline (psys2_train/selection.py: scripts/eval-operational.mjs when it exists, else a local
stub set) together with the simplifier threshold; the winner becomes best.pt and its tau goes to meta.json. Inputs over the model limits
(192 segmentation, 128 routing tokens) are read by overlapping windows (psys2_train/windows.py, mirrored in src/formalizer/dispatcher-runtime.mjs).
Routing train rows are augmented with a fixed 15% lowercased/punctuation-stripped copy (meaning-preserving, safe_noise.py).
"""
from __future__ import annotations
import argparse, json, platform, random, re, shutil, sys, time, itertools
from collections import Counter
from pathlib import Path
import torch
from torch import nn
from torch.utils.data import DataLoader
from transformers import AutoModel, AutoTokenizer, get_linear_schedule_with_warmup
from .data import DATASET, read_jsonl, routing_text, data_hash, leak_count, norm_text
from .model import LORA_TARGETS
from .metrics import world_metrics, boundary_prf
from .multicmd import load_multicmd, trim_segment, build_mix, MULTICMD
from .sampling import EpochSampler, Budget, ShownLog
from .selection import select, eval_stub, load_stub, run_script, script_available, export_ckpt, DEFAULT_CMD, TAUS
from . import edit as ed
from .windows import window_spans, merge_window_probs

RESULTS = Path(__file__).resolve().parents[1] / "results"
RUNS = Path(__file__).resolve().parents[1] / "runs"


class Dispatcher(nn.Module):
    def __init__(self, backbone, n_worlds, n_edit=0, dropout=0.1):
        super().__init__()
        self.backbone = backbone
        h = backbone.config.hidden_size
        self.drop = nn.Dropout(dropout)
        self.seg_head = nn.Linear(h, 2)
        self.world_head = nn.Linear(h, n_worlds)
        if n_edit:
            self.edit_head = nn.Linear(h, n_edit)   # per-token edit tag logits (KEEP, DELETE, R:/P:/A: vocabulary)

    def encode(self, input_ids, attention_mask):
        return self.drop(self.backbone(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state)

    def seg_logits(self, input_ids, attention_mask):
        return self.seg_head(self.encode(input_ids, attention_mask))

    def world_logits(self, input_ids, attention_mask):
        return self.world_head(self.encode(input_ids, attention_mask)[:, 0])

    def world_edit_logits(self, input_ids, attention_mask):
        h = self.encode(input_ids, attention_mask)
        return self.world_head(h[:, 0]), self.edit_head(h)

    def edit_logits(self, input_ids, attention_mask):
        return self.edit_head(self.encode(input_ids, attention_mask))


def build(model_name, n_worlds, lora, lora_r=16, n_edit=0):
    backbone = AutoModel.from_pretrained(model_name)
    if lora:
        from peft import LoraConfig, get_peft_model
        targets = LORA_TARGETS.get(backbone.config.model_type, ["query", "value"])
        backbone = get_peft_model(backbone, LoraConfig(r=lora_r, lora_alpha=2 * lora_r, lora_dropout=0.05, target_modules=targets, bias="none"))
    return Dispatcher(backbone, n_worlds, n_edit)


def param_counts(model):
    return {"trainable": sum(p.numel() for p in model.parameters() if p.requires_grad), "total": sum(p.numel() for p in model.parameters())}


def require_cuda():
    assert torch.cuda.is_available(), "CUDA is required: this task must run on the GPU (never fall back to CPU)"
    return torch.device("cuda")


# ---- data ----------------------------------------------------------------------------------------------------------
def plain_text(s):
    # review F3: never destroy decimals, times or quoted payload (see safe_noise.py)
    from .safe_noise import plain
    return plain(s)


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


def encode_edit(tok, rows, tag_id, max_len, use_context):
    """Edit examples -> tokens + labels on the first sub-token of every segment word (-100 elsewhere)."""
    texts = [routing_text(r, use_context) for r in rows]
    enc = tok(texts, truncation=True, max_length=max_len, return_offsets_mapping=True)
    out = []
    for r, t, ids, offs in zip(rows, texts, enc["input_ids"], enc["offset_mapping"]):
        words = ed.words_of(r["text"]); assert len(words) == len(r["tags"]), r["id"]
        lab = [-100] * len(ids)
        for k, ti in enumerate(ed.word_tokens(offs, len(t) - len(r["text"]), words)):
            if ti is not None:
                lab[ti] = tag_id.get(r["tags"][k], -100)
        out.append({"input_ids": ids, "labels": lab, "weight": 1.0})
    return out


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


def world_items(tok, items_text, ctxs, use_context, max_len):
    """Routing inputs of segment texts; a segment whose input exceeds `max_len` tokens becomes overlapping windows of its own text
    (review F8; each window keeps the context prefix). Returns [(parent index, text, ctx, windowed)]."""
    full = tok([routing_text({"text": t, "context": c}, use_context) for t, c in zip(items_text, ctxs)], truncation=False)["input_ids"]
    out = []
    for i, (t, c, ids) in enumerate(zip(items_text, ctxs, full)):
        if len(ids) <= max_len:
            out.append((i, t, c, False)); continue
        prefix = len(tok(routing_text({"text": "", "context": c}, use_context), truncation=False)["input_ids"]) - 2 if use_context else 0
        te = tok(t, truncation=False, return_offsets_mapping=True)
        offs = [o for o in te["offset_mapping"] if o[1] > o[0]]
        for a, b in window_spans(len(offs), max(max_len - 2 - prefix, 16)):
            out.append((i, t[offs[a][0]:offs[b - 1][1]], c, True))
    return out


@torch.no_grad()
def run_world(model, tok, items_text, ctxs, use_context, dev, max_len=128, bs=512, topk=3, worlds=None, edit_tags=None, edit_tau=0.5):
    """items_text: segment texts, ctxs: context dicts. Returns per item list of (world, prob) top-k.
    With `edit_tags` (the tag vocabulary) it returns per item (top-k, simplified|None, tags): the edit head runs in the same pass.
    A word gets its best non-KEEP tag only when that tag's softmax probability is >= `edit_tau` (0.5 = plain argmax), else KEEP.
    An input longer than `max_len` tokens is routed by overlapping windows (world probabilities averaged, review F8); such a
    segment gets no simplification (all KEEP)."""
    model.eval()
    wi = world_items(tok, items_text, ctxs, use_context, max_len)
    rows = [{"text": t, "context": c} for _, t, c, _ in wi]
    enc = encode_world(tok, rows, {w: i for i, w in enumerate(worlds)}, max_len, use_context, with_target=False) if rows else []
    if edit_tags and rows:
        offs_all = tok([routing_text(r, use_context) for r in rows], truncation=True, max_length=max_len, return_offsets_mapping=True)["offset_mapping"]
    order = sorted(range(len(enc)), key=lambda i: len(enc[i]["input_ids"]))
    probs = [None] * len(enc); etags = [None] * len(enc); pad = tok.pad_token_id or 0
    col = make_collate(pad)
    for s in range(0, len(order), bs):
        idx = order[s:s + bs]; b = to_dev(col([enc[i] for i in idx]), dev)
        with torch.autocast("cuda", dtype=torch.bfloat16):
            if edit_tags:
                lg, elg = model.world_edit_logits(b["input_ids"], b["attention_mask"])
                ep = torch.softmax(elg.float(), -1); nkp, nki = ep[..., 1:].max(-1); et = torch.where(nkp >= edit_tau, nki + 1, torch.zeros_like(nki)).cpu().tolist()
            else:
                lg = model.world_logits(b["input_ids"], b["attention_mask"])
        p = torch.softmax(lg.float(), -1).cpu()
        for j, i in enumerate(idx):
            probs[i] = p[j]
            if edit_tags:
                etags[i] = et[j]
    res = [None] * len(items_text)
    by_parent = {}
    for k, (i, _, _, windowed) in enumerate(wi):
        by_parent.setdefault(i, []).append(k)
    for i, ks in by_parent.items():
        windowed = wi[ks[0]][3]
        p = torch.stack([probs[k] for k in ks]).mean(0)
        v, ix = p.topk(topk, -1)
        top = [(worlds[x], float(y)) for x, y in zip(ix.tolist(), v.tolist())]
        if edit_tags:
            text = items_text[i]; words = ed.words_of(text)
            if windowed:
                tags = ["KEEP"] * len(words)
            else:
                k = ks[0]; prefix = len(routing_text(rows[k], use_context)) - len(text)
                tags = ["KEEP" if t is None else edit_tags[etags[k][t]] for t in ed.word_tokens(offs_all[k], prefix, words)]
            res[i] = (top, ed.simplified_text(text, words, tags), tags)
        else:
            res[i] = top
    return res


@torch.no_grad()
def run_seg(model, tok, msgs, dev, max_len=192, bs=256):
    """Returns per message (offsets, per-token P(B)). A message longer than `max_len` tokens is read by overlapping windows
    (review F8): each window is [CLS] + tokens + [SEP], a token takes the edge-distance weighted mean over the windows that see it."""
    model.eval()
    enc = tok([m["text"] for m in msgs], truncation=False, return_offsets_mapping=True)
    cls_id, sep_id = tok.cls_token_id, tok.sep_token_id
    items, owner = [], []   # one item per window; owner = (message index, window span)
    spans_of = {}
    for mi, ids in enumerate(enc["input_ids"]):
        if len(ids) <= max_len:
            spans_of[mi] = None; items.append({"input_ids": ids, "weight": 1.0}); owner.append(mi)
        else:
            spans = window_spans(len(ids) - 2, max_len - 2); spans_of[mi] = spans
            for a, b in spans:
                items.append({"input_ids": [cls_id] + ids[1 + a:1 + b] + [sep_id], "weight": 1.0}); owner.append(mi)
    order = sorted(range(len(items)), key=lambda i: len(items[i]["input_ids"]))
    pr = [None] * len(items); col = make_collate(tok.pad_token_id or 0)
    for s in range(0, len(order), bs):
        idx = order[s:s + bs]; b = to_dev(col([items[i] for i in idx]), dev)
        with torch.autocast("cuda", dtype=torch.bfloat16):
            lg = model.seg_logits(b["input_ids"], b["attention_mask"])
        p = torch.softmax(lg.float(), -1)[..., 1].cpu().tolist()
        for j, i in enumerate(idx):
            pr[i] = p[j][:len(items[i]["input_ids"])]
    out = [None] * len(msgs); k = 0
    for mi in range(len(msgs)):
        spans = spans_of[mi]
        if spans is None:
            out[mi] = (enc["offset_mapping"][mi], pr[k]); k += 1
        else:
            n = len(enc["input_ids"][mi]) - 2
            wp = [pr[k + w][1:1 + (b - a)] for w, (a, b) in enumerate(spans)]; k += len(spans)
            out[mi] = (enc["offset_mapping"][mi], [0.0] + merge_window_probs(n, spans, wp) + [0.0])
    return out


def dispatch(model, tok, msgs, use_context, dev, worlds, n_beam=4, k_unc=6, edit_tags=None, edit_tau=0.5):
    """Full chain for messages {text, context}: segmentation candidates + top-3 worlds per segment.
    Returns per message {token_probs, candidates: [{score, segments: [{start, end, text, worlds: [(w, p)], simplified?}]}]}.
    `simplified` (edit head, when `edit_tags` is given) is present only when the rewrite differs from the segment text."""
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
    ws = run_world(model, tok, [uniq[k][0] for k in keys], [uniq[k][1] for k in keys], use_context, dev, worlds=worlds, edit_tags=edit_tags, edit_tau=edit_tau)
    if edit_tags:
        wmap = {k: r[0] for k, r in zip(keys, ws)}; smap = {k: r[1] for k, r in zip(keys, ws)}
    else:
        wmap = dict(zip(keys, ws)); smap = {}
    out = []
    for m, (offs, probs), cs in zip(msgs, seg, allc):
        ctx = m.get("context") or {}; ck = json.dumps([ctx.get("tab"), ctx.get("recent_worlds")])
        def seg_dict(a, b):
            d = {"start": a, "end": b, "text": m["text"][a:b], "worlds": [{"world": w, "score": p} for w, p in wmap[(m["text"][a:b], ck)]]}
            if smap.get((m["text"][a:b], ck)):
                d["simplified"] = smap[(m["text"][a:b], ck)]
            return d
        cands = [{"score": sc, "segments": [seg_dict(a, b) for a, b in segs]} for sc, segs in cs]
        tokens = [{"start": s, "end": e, "p_boundary": probs[i], "word_start": ws_} for i, s, e, ws_ in token_info(m["text"], offs)]
        out.append({"tokens": tokens, "candidates": cands})
    return out


# ---- evaluation ----------------------------------------------------------------------------------------------------
def eval_world(model, tok, rows, use_context, dev, worlds, train_texts):
    res = run_world(model, tok, [r["text"] for r in rows], [r["context"] for r in rows], use_context, dev, worlds=worlds)
    return world_metrics(rows, [[w for w, _ in r] for r in res], train_texts)


def eval_seg(model, tok, msgs, use_context, dev, worlds, with_chain=True, edit_tags=None, edit_tau=0.5):
    outs = dispatch(model, tok, msgs, use_context, dev, worlds, n_beam=1, k_unc=0, edit_tags=edit_tags, edit_tau=edit_tau)
    gold_starts, pred_starts, exact, chain, by_var, by_n, by_fam, chain_fam = [], [], [], [], {}, {}, {}, {}
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
        by_fam.setdefault(m.get("family", "?"), []).append(ok); chain_fam.setdefault(m.get("family", "?"), []).append(wok)
    res = {"n": len(msgs), "boundary": boundary_prf(gold_starts, pred_starts), "exact_segmentation": sum(exact) / len(exact),
           "end_to_end_exact": sum(chain) / len(chain),
           "exact_by_variant": {k: sum(v) / len(v) for k, v in by_var.items()}, "exact_by_n_segments": {str(k): sum(v) / len(v) for k, v in sorted(by_n.items())},
           "exact_by_family": {k: sum(v) / len(v) for k, v in sorted(by_fam.items())}, "end_to_end_by_family": {k: sum(v) / len(v) for k, v in sorted(chain_fam.items())},
           "n_by_family": {k: len(v) for k, v in sorted(by_fam.items())}}
    return res


@torch.no_grad()
def eval_edit(model, tok, rows, tag_id, use_context, dev, max_len=128, bs=512):
    """Tag accuracy / F1 of the edit head on edit examples (word level, labels on the first sub-token)."""
    model.eval()
    items = encode_edit(tok, rows, tag_id, max_len, use_context)
    col = make_collate(tok.pad_token_id or 0)
    n_words = correct = tp = pred_nk = gold_nk = 0
    exact, kinds = [], {}
    rmb = {"recovered": 0, "misled": 0, "not_recovered_unchanged": 0, "kept_ok": 0, "broken": 0}   # review F7
    for s0 in range(0, len(items), bs):
        b = to_dev(col(items[s0:s0 + bs]), dev)
        with torch.autocast("cuda", dtype=torch.bfloat16):
            lg = model.edit_logits(b["input_ids"], b["attention_mask"])
        pred = lg.float().argmax(-1); lab = b["labels"]; m = lab != -100
        ok = (pred == lab) & m
        n_words += int(m.sum()); correct += int(ok.sum())
        tp += int((ok & (lab > 0)).sum()); pred_nk += int(((pred > 0) & m).sum()); gold_nk += int(((lab > 0) & m).sum())
        ex = ((pred == lab) | ~m).all(1).cpu().tolist()
        chg = ((pred > 0) & m).any(1).cpu().tolist()
        for j, e in enumerate(ex):
            exact.append(e); kinds.setdefault(rows[s0 + j]["kind"], []).append(e)
            if rows[s0 + j]["kind"] in ("variant", "synthetic"):   # the text needed a rewrite
                rmb["recovered" if e else ("misled" if chg[j] else "not_recovered_unchanged")] += 1
            else:                                                  # the text was fine: any rewrite breaks it
                rmb["kept_ok" if e else "broken"] += 1
    p = tp / pred_nk if pred_nk else 0.0; r = tp / gold_nk if gold_nk else 0.0
    return {"n": len(rows), "words": n_words, "tag_accuracy": correct / max(n_words, 1), "edit_precision": p, "edit_recall": r,
            "edit_f1": 2 * p * r / (p + r) if p + r else 0.0, "exact_sentences": sum(exact) / max(len(exact), 1),
            "recovered_misled_broken": rmb, "exact_by_kind": {k: sum(v) / len(v) for k, v in sorted(kinds.items())}, "n_by_kind": {k: len(v) for k, v in sorted(kinds.items())}}


def edit_stream(aligned, identity, tok, tag_id, a, pad, dev):
    """Endless edit batches: every round = all aligned examples (+ a lowercase/no-punctuation copy of a fraction) and a fresh random
    identity sample of `identity_ratio` x the aligned count."""
    rng = random.Random(a.seed + 7); col = make_collate(pad)
    while True:
        aug = [x for x in (ed.plain_example(r) for r in aligned if rng.random() < a.edit_aug) if x]
        pool = ed.sample_epoch(aligned + aug, identity, a.identity_ratio, rng)
        items = encode_edit(tok, pool, tag_id, a.max_len, not a.no_context)
        for i in range(0, len(items), a.edit_batch):
            yield to_dev(col(items[i:i + a.edit_batch]), dev), [r["kind"] for r in pool[i:i + a.edit_batch]]


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
    ap.add_argument("--no-edit", action="store_true", help="plain D1 dispatcher without the simplification head")
    ap.add_argument("--edit-dir", default=str(ed.EDIT_DIR)); ap.add_argument("--edit-batch", type=int, default=48); ap.add_argument("--edit-weight", type=float, default=1.0)
    ap.add_argument("--identity-ratio", type=float, default=3.0, help="identity (all KEEP) examples per aligned example in every edit round")
    ap.add_argument("--edit-aug", type=float, default=0.15, help="fraction of aligned edit examples duplicated as lowercase/no-punctuation")
    ap.add_argument("--no-heldout-train", action="store_true", help="do NOT train on the held-out paraphrases (clean held-out evaluation)")
    ap.add_argument("--steps-routing", type=int, default=0, help="explicit step budget of the routing head (batches over the run; 0 = every optimizer step)")
    ap.add_argument("--steps-seg", type=int, default=0, help="explicit step budget of the segmentation head (0 = every optimizer step)")
    ap.add_argument("--steps-edit", type=int, default=0, help="explicit step budget of the simplification head (0 = every optimizer step)")
    ap.add_argument("--eval-every", type=int, default=0, help="optimizer steps between dev evaluations (0 = one routing epoch, or total/epochs with --max-steps)")
    ap.add_argument("--focus-frac", type=float, default=0.15, help="reserved extra share of a routing epoch: recent failures / contrastive near-misses / replay (F6)")
    ap.add_argument("--source-floor", default="paraphrase=0.15,rule-derived=0.05,heldout=0.02", help="minimum share per routing source, repeats rows of under-represented sources")
    ap.add_argument("--probe-n", type=int, default=20000, help="train rows probed after every evaluation to find recent failures and solved cases")
    ap.add_argument("--seg-n", type=int, default=0, help="multi-command messages per segmentation pass (0 = size of multicmd/train.jsonl); regenerated every pass (F4/F6)")
    ap.add_argument("--seg-seed", type=int, default=1337); ap.add_argument("--no-regen", action="store_true", help="use multicmd/train.jsonl as is instead of regenerating the combinations")
    ap.add_argument("--keep-ckpts", type=int, default=3, help="best dev-score checkpoints kept for the operational selection (F7)")
    ap.add_argument("--select-cmd", default=None, help="operational evaluator command template (see selection.py); default scripts/eval-operational.mjs when it exists, else the local stub set")
    ap.add_argument("--multicmd", default=str(MULTICMD), help="directory with the multicmd train/dev/test jsonl (python -m psys2_train.multicmd --out ...)")
    ap.add_argument("--no-select", action="store_true", help="skip the operational selection: use the best dev-score checkpoint and tau 0.5")
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
    mc = {s: load_multicmd(s, a.multicmd) for s in ("train", "dev", "test")}
    assert mc["train"], "run `python -m psys2_train.multicmd` first"
    train_texts = {norm_text(r["text"]) for r in sp["train"]}
    n_overlap = leak_count(rows)  # all train rows are kept; the overlap with dev/test is reported (unseen_text subset)
    print("routing train rows whose (text, tab) also occur in dev/test (kept, reported):", n_overlap, flush=True)

    tok = AutoTokenizer.from_pretrained(a.model); pad = tok.pad_token_id or 0
    rng = random.Random(a.seed)
    aug = [dict(r, text=plain_text(r["text"])) for r in sp["train"] if rng.random() < a.aug]
    use_edit = not a.no_edit
    ho_rows = [] if a.no_heldout_train else ed.heldout_routing_rows()
    ho_rows = [r for r in ho_rows if r["world"] in w_id]
    wtrain = encode_world(tok, sp["train"] + aug + ho_rows, w_id, a.max_len, use_ctx)
    strain = encode_seg(tok, mc["train"], 192)
    edit_tags = ed.load_vocab(a.edit_dir) if use_edit else None
    tag_id = {t: i for i, t in enumerate(edit_tags)} if use_edit else None
    if use_edit:
        etrain = ed.load_edit_examples("train", a.edit_dir) + ([] if a.no_heldout_train else ed.load_edit_examples("heldout", a.edit_dir))
        e_aligned = [r for r in etrain if r["kind"] in ("variant", "synthetic")]; e_ident = [r for r in etrain if r["kind"] not in ("variant", "synthetic")]
        edev = ed.load_edit_examples("dev", a.edit_dir)
        estream = edit_stream(e_aligned, e_ident, tok, tag_id, a, pad, dev)
        print("edit tags", len(edit_tags), "aligned train", len(e_aligned), "identity pool", len(e_ident), "dev", len(edev), "heldout world rows trained", len(ho_rows), flush=True)
    model = build(a.model, len(worlds), a.lora, a.lora_r, len(edit_tags) if use_edit else 0).to(dev)
    pc = param_counts(model)
    print("model", a.model, "lora", a.lora, pc, "device", torch.cuda.get_device_name(0), "world train", len(wtrain), "seg train", len(strain), flush=True)

    # ---- streams (review F6): explicit budgets, controlled routing exposure, regenerated multi-command combinations -----------
    train_rows = sp["train"] + aug + ho_rows                      # parallel to wtrain
    for r in train_rows:
        r.setdefault("source", "?")
    floors = {k: float(v) for k, v in (kv.split("=") for kv in a.source_floor.split(",") if kv)} if a.source_floor else {}
    sampler = EpochSampler(train_rows, seed=a.seed + 11, focus_frac=a.focus_frac, source_floor=floors)
    print("sampler: rows", len(train_rows), "near-miss pool", len(sampler.contrastive), "phenomena", dict(Counter(t for ts in sampler.tags for t in ts)), flush=True)
    shown = ShownLog()
    state = {"failures": [], "solved": [], "route_epoch": 0, "seg_epoch": 0, "inject": []}
    col = make_collate(pad)
    n_route_plan = len(sampler.epoch())                           # size of an epoch plan without failures (the scheduler horizon)
    steps_per_epoch = -(-n_route_plan // a.batch_size)
    total = a.max_steps or steps_per_epoch * a.epochs
    eval_every = a.eval_every or (max(total // a.epochs, 1) if a.max_steps else steps_per_epoch)
    budgets = {"routing": Budget(total, a.steps_routing or total), "seg": Budget(total, a.steps_seg or total), "edit": Budget(total, (a.steps_edit or total) if use_edit else 0)}
    print("budgets (batches over", total, "optimizer steps):", {k: v.n for k, v in budgets.items()}, "eval every", eval_every, flush=True)

    def route_stream():
        while True:
            plan = sampler.epoch(state["failures"], state["solved"]); state["route_epoch"] += 1
            k = 0
            while k < len(plan):
                if state["inject"]:   # a probe just found recent failures: reserve exposure for them in the rest of this epoch
                    rest = plan[k:] + state["inject"]; state["inject"] = []
                    sampler.rng.shuffle(rest); plan = plan[:k] + rest
                chunk = plan[k:k + a.batch_size]; k += a.batch_size
                sampler.log_plan(shown, chunk)
                yield col([wtrain[i] for _, i in chunk])

    seg_n = a.seg_n or len(mc["train"])

    def seg_stream():
        while True:
            ep = state["seg_epoch"]; state["seg_epoch"] += 1
            msgs = mc["train"] if a.no_regen else build_mix(sp["train"], "train", seg_n, a.seg_seed, ep)   # new combinations every pass
            items = encode_seg(tok, msgs, 192)
            order = list(range(len(items))); random.Random(a.seed + 100 + ep).shuffle(order)
            for k in range(0, len(order), a.batch_size):
                ch = order[k:k + a.batch_size]
                for x in ch:
                    shown.add("seg", msgs[x].get("family", "?"), tags=[f"n_segments:{msgs[x]['n_segments']}"])
                yield col([items[x] for x in ch])

    def log_edit(kinds):
        for k in kinds:
            shown.add("edit", k)

    @torch.no_grad()
    def probe():
        """Recent failures / solved cases among a random sample of train routing rows (top-1 world, soft alternatives accepted)."""
        model.eval()
        idx = random.Random(a.seed + 1000 + len(history)).sample(range(len(train_rows)), min(a.probe_n, len(train_rows)))
        res = run_world(model, tok, [train_rows[i]["text"] for i in idx], [train_rows[i]["context"] for i in idx], use_ctx, dev, worlds=worlds, topk=1)
        fail, ok = [], []
        for i, r in zip(idx, res):
            w = train_rows[i]
            (ok if r[0][0] == w["world"] or r[0][0] in w.get("alt_worlds", []) else fail).append(i)
        state["failures"], state["solved"] = fail, ok
        state["inject"] = sampler.inject(fail, ok, int(a.focus_frac * eval_every * a.batch_size))
        return len(fail), len(ok)

    body = [p for n, p in model.named_parameters() if p.requires_grad and n.startswith("backbone.")]
    heads = [p for n, p in model.named_parameters() if p.requires_grad and not n.startswith("backbone.")]
    opt = torch.optim.AdamW([{"params": body, "lr": lr}, {"params": heads, "lr": a.head_lr}], weight_decay=0.01)
    sched = get_linear_schedule_with_warmup(opt, int(0.06 * total), total)
    seg_w = torch.tensor([1.0, 2.0], device=dev)
    edit_w = torch.tensor([1.0] + [2.0] * (len(edit_tags) - 1), device=dev) if use_edit else None

    def dev_score():
        wm = eval_world(model, tok, sp["dev"], use_ctx, dev, worlds, train_texts)
        sm = eval_seg(model, tok, mc["dev"], use_ctx, dev, worlds)
        em = eval_edit(model, tok, edev, tag_id, use_ctx, dev) if use_edit else None
        return wm, sm, em, wm["top1"] + sm["boundary"]["f1"] + (0.5 * em["edit_f1"] if em else 0.0)

    step, history, done = 0, [], False
    ckpts = []   # [(score, step, path)] best dev-score checkpoints (kept for the operational selection)
    le, lw, ls = [], [], []
    route_it, seg_it = route_stream(), seg_stream()
    t0 = time.time()
    model.train()
    while not done:
        wb = sb = eb = None
        loss = 0.0
        with torch.autocast("cuda", dtype=torch.bfloat16):
            if budgets["routing"].active(step):
                wb = to_dev(next(route_it), dev); wlg = model.world_logits(wb["input_ids"], wb["attention_mask"])
            if budgets["seg"].active(step):
                sb = to_dev(next(seg_it), dev); slg = model.seg_logits(sb["input_ids"], sb["attention_mask"])
            if use_edit and budgets["edit"].active(step):
                eb, kinds = next(estream); log_edit(kinds); elg = model.edit_logits(eb["input_ids"], eb["attention_mask"])
        if wb is not None:
            lossw = (-(wb["target"] * torch.log_softmax(wlg.float(), -1)).sum(-1) * wb["weights"]).mean(); loss = loss + lossw; lw.append(lossw.item())
        if sb is not None:
            lossg = nn.functional.cross_entropy(slg.float().transpose(1, 2), sb["labels"], weight=seg_w, ignore_index=-100); loss = loss + lossg; ls.append(lossg.item())
        if eb is not None:
            losse = nn.functional.cross_entropy(elg.float().transpose(1, 2), eb["labels"], weight=edit_w, ignore_index=-100); loss = loss + a.edit_weight * losse; le.append(losse.item())
        if torch.is_tensor(loss):
            loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step(); sched.step(); opt.zero_grad(set_to_none=True)
        step += 1
        if step % 20 == 0:
            print(f"step {step}/{total} world {sum(lw[-20:]) / max(len(lw[-20:]), 1):.4f} seg {sum(ls[-20:]) / max(len(ls[-20:]), 1):.4f} edit {(sum(le[-20:]) / max(len(le[-20:]), 1) if le else 0):.4f} elapsed {time.time() - t0:.0f}s", flush=True)
        done = step >= total
        if step % eval_every == 0 or done:
            wm, sm, em, score = dev_score()
            nfail, nsolved = probe()
            history.append({"epoch": len(history) + 1, "step": step, "world_loss": sum(lw[-eval_every:]) / max(len(lw[-eval_every:]), 1), "seg_loss": sum(ls[-eval_every:]) / max(len(ls[-eval_every:]), 1),
                            "dev_top1": wm["top1"], "dev_top3": wm["top3"], "dev_seg_f1": sm["boundary"]["f1"], "dev_exact_seg": sm["exact_segmentation"], "dev_seg_by_family": sm["exact_by_family"],
                            "probe_failures": nfail, "probe_solved": nsolved, "dev_score": score})
            if em:
                history[-1].update({"edit_loss": sum(le[-eval_every:]) / max(len(le[-eval_every:]), 1), "dev_edit_f1": em["edit_f1"], "dev_tag_acc": em["tag_accuracy"], "dev_edit_exact": em["exact_sentences"], "dev_edit_rmb": em["recovered_misled_broken"]})
            print("epoch", json.dumps(history[-1]), flush=True)
            print("shown so far (kinds):", {h: {k: v for k, v in c.items() if k.startswith("kind:") or k == "total"} for h, c in shown.summary().items()}, flush=True)
            if len(ckpts) < a.keep_ckpts or score > min(c[0] for c in ckpts):
                path = out / f"ckpt-step{step}.pt"; torch.save(model.state_dict(), path); ckpts.append((score, step, path))
                if len(ckpts) > a.keep_ckpts:
                    worst = min(ckpts, key=lambda c: c[0]); ckpts.remove(worst); worst[2].unlink(missing_ok=True)
            model.train()
    train_seconds = time.time() - t0
    ckpts.sort(key=lambda c: -c[0])
    shutil.copy(ckpts[0][2], out / "best.pt")   # best by the dev score; the operational selection may replace it below
    meta = {"model": a.model, "lora": a.lora, "lora_r": a.lora_r, "context": use_ctx, "worlds": worlds, "max_len": a.max_len, "edit_tags": edit_tags, "edit_threshold": 0.5}
    (out / "labels.json").write_text(json.dumps({"worlds": worlds})); (out / "meta.json").write_text(json.dumps(meta))
    tok.save_pretrained(out / "tokenizer")
    if use_edit:
        (out / "edit-vocab.json").write_text((Path(a.edit_dir) / "edit-vocab.json").read_text())

    # ---- selection by the whole pipeline on the operational set (review F7) ---------------------------------------------------
    selection, best_tau = None, 0.5
    if not a.no_select:
        cmd = a.select_cmd or DEFAULT_CMD
        use_script = script_available(cmd)
        stub = None if use_script else load_stub()

        def evaluate(c, tau):
            model.load_state_dict(torch.load(c["path"], map_location=dev))
            if use_script:
                d = out / "select" / c["name"]; d.mkdir(parents=True, exist_ok=True)
                for f in ("labels.json", "edit-vocab.json"):
                    if (out / f).exists():
                        shutil.copy(out / f, d / f)
                shutil.copytree(out / "tokenizer", d / "tokenizer", dirs_exist_ok=True); shutil.copy(c["path"], d / "best.pt")
                (d / "meta.json").write_text(json.dumps(dict(meta, edit_threshold=tau)))
                if "{export}" in cmd:
                    export_ckpt(d, d / "export")
                return run_script(cmd, d / "export", d, tau)
            return eval_stub(model, tok, dev, worlds, use_ctx, edit_tags=edit_tags, edit_tau=tau, recs=stub)

        cands = [{"name": p.stem, "path": p, "score": sc, "step": st} for sc, st, p in ckpts]
        best_c, best_tau, table = select(cands, evaluate, taus=TAUS if use_edit else (0.5,), log=lambda m: print(m, flush=True))
        selection = {"evaluator": "script" if use_script else "stub", "chosen": best_c["name"], "tau": best_tau, "table": table, "dev_scores": {c["name"]: c["score"] for c in cands}}
        shutil.copy(best_c["path"], out / "best.pt")
        meta["edit_threshold"] = best_tau; (out / "meta.json").write_text(json.dumps(meta))
        print("selected", best_c["name"], "tau", best_tau, "by", selection["evaluator"], flush=True)
    model.load_state_dict(torch.load(out / "best.pt", map_location=dev))
    res = {"model": a.model, "name": name, "lora": a.lora, "context": use_ctx, "lr": lr, "params": pc, "train_seconds": train_seconds, "steps": step,
           "gpu": torch.cuda.get_device_name(0), "gpu_peak_mem_gb": torch.cuda.max_memory_allocated() / 2 ** 30,
           "command": "python -m psys2_train.dispatcher " + " ".join(argv if argv is not None else sys.argv[1:]),
           "data_hash": data_hash([root / "routing.jsonl", Path(a.multicmd) / "train.jsonl", Path(a.multicmd) / "test.jsonl"] + ([Path(a.edit_dir) / "train.jsonl", Path(a.edit_dir) / "edit-vocab.json"] if use_edit else [])),
           "edit": {"enabled": use_edit, "tags": len(edit_tags) if use_edit else 0, "heldout_in_training": not a.no_heldout_train, "heldout_world_rows": len(ho_rows),
                    "edit_batch": a.edit_batch, "identity_ratio": a.identity_ratio, "edit_weight": a.edit_weight, "aligned_train": len(e_aligned) if use_edit else 0} , "seed": a.seed, "routing_train_overlap_with_dev_test": n_overlap, "routing_train_rows": len(sp["train"]),
           "versions": {"python": platform.python_version(), "torch": torch.__version__}, "history": history,
           "budgets": {k: {"budget": v.n, "used": v.used} for k, v in budgets.items()}, "shown": shown.summary(), "selection": selection,
           "sampler": {"focus_frac": a.focus_frac, "source_floor": floors, "near_miss_pool": len(sampler.contrastive), "routing_epochs_started": state["route_epoch"], "seg_passes_started": state["seg_epoch"], "regen": not a.no_regen}}
    for split in ("dev", "test"):
        res[split] = {"world": eval_world(model, tok, sp[split], use_ctx, dev, worlds, train_texts), "segmentation": eval_seg(model, tok, mc[split], use_ctx, dev, worlds, edit_tags=edit_tags, edit_tau=best_tau)}
        if use_edit:
            res[split]["edit"] = eval_edit(model, tok, ed.load_edit_examples(split, a.edit_dir), tag_id, use_ctx, dev)
            res[split]["edit_aligned_only"] = eval_edit(model, tok, [r for r in ed.load_edit_examples(split, a.edit_dir) if r["kind"] == "variant"], tag_id, use_ctx, dev)
    if use_edit:
        res["heldout_edit"] = {"trained_on": not a.no_heldout_train, "all": eval_edit(model, tok, ed.load_edit_examples("heldout", a.edit_dir), tag_id, use_ctx, dev)}
        (out / "edit-vocab.json").write_text((Path(a.edit_dir) / "edit-vocab.json").read_text())
    # world accuracy of the test routing rows, with the context prefix removed at inference only (diagnostic)
    res["test"]["world_inference_without_context"] = {k: v for k, v in eval_world(model, tok, sp["test"], False, dev, worlds, train_texts).items() if k in ("top1", "top3", "macro_f1")}
    (out / "shown.json").write_text(json.dumps(shown.summary(), indent=1))
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
