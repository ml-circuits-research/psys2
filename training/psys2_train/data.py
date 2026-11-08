"""Dataset loading (training/dataset/ written by scripts/build-dataset.mjs) and the BIO tag scheme."""
from __future__ import annotations
import json, hashlib
from pathlib import Path
from .sop import align, canonical_text, NONE_INTENT

DATASET = Path(__file__).resolve().parents[1] / "dataset"


def read_jsonl(p):
    p = Path(p)
    return [json.loads(l) for l in p.read_text().splitlines() if l.strip()] if p.exists() else []


def data_hash(paths):
    h = hashlib.sha256()
    for p in sorted(map(str, paths)):
        h.update(Path(p).read_bytes())
    return h.hexdigest()[:16]


def load_world(world: str, root=DATASET, limit=None):
    """Examples of one world per split: {text, context, target, skeleton, slots, intent, weight, source, label_status}.
    Negatives (text the world must not formalize) get the NONE intent and no slots."""
    out = {}
    for split in ("train", "dev", "test"):
        rows = read_jsonl(Path(root) / world / f"{split}.jsonl")
        if limit:
            rows = rows[:limit]
        exs = []
        for r in rows:
            if r.get("negative") or not r.get("target"):
                sk, slots, tgt = NONE_INTENT, [], ""
            else:
                tgt = canonical_text(r["target"])
                sk, slots = align(r["text"], r["target"])
            exs.append(dict(r, target_raw=r.get("target") or "", target=tgt, skeleton=sk, slots=slots, intent=sk))
        out[split] = exs
    return out


class TagScheme:
    """BIO tags over slot names (`w0.owner`, `w1.count`, ...) seen in the training set; `O` is the outside tag."""

    def __init__(self, slot_names):
        self.slot_names = sorted(set(slot_names))
        self.tags = ["O"] + [f"{p}-{s}" for s in self.slot_names for p in "BI"]
        self.id = {t: i for i, t in enumerate(self.tags)}

    @classmethod
    def fit(cls, examples):
        return cls(n for ex in examples for n, _, _ in ex["slots"])

    def char_tags(self, text_len, slots):
        """Per-character tag name for a list of (slot, start, end)."""
        tags = ["O"] * text_len
        for name, a, b in slots:
            for i in range(a, b):
                tags[i] = ("B-" if i == a else "I-") + name
        return tags

    def to_dict(self):
        return {"slot_names": self.slot_names}


def token_tag_ids(scheme: TagScheme, slots, offsets, seq_ids):
    """Tag id per token from character spans; -100 for special tokens and the context segment."""
    ids = []
    for (a, b), sid in zip(offsets, seq_ids):
        if sid != 0 or a == b:
            ids.append(-100)
            continue
        lab = "O"
        for name, s, e in slots:
            if a < e and b > s:
                lab = ("B-" if a <= s else "I-") + name
                break
        ids.append(scheme.id.get(lab, 0))
    return ids


def spans_from_tags(scheme: TagScheme, pred_ids, offsets, seq_ids, text):
    """Decode a BIO tag sequence into [(slot, start, end)] character spans over `text`."""
    spans, cur = [], None
    for tid, (a, b), sid in zip(pred_ids, offsets, seq_ids):
        if sid != 0 or a == b:
            continue
        tag = scheme.tags[tid]
        if tag == "O":
            cur = None
            continue
        p, name = tag.split("-", 1)
        if p == "B" or cur is None or cur[0] != name:
            cur = [name, a, b]
            spans.append(cur)
        else:
            cur[2] = b
    return [(n, a, b) for n, a, b in spans]


def context_text(ex, max_msgs=2, tab=True):
    """Second segment of the input pair: the last context messages of the session."""
    ctx = ex.get("context") or []
    return " | ".join(ctx[-max_msgs:]) if ctx else None


def routing_text(r, use_context=True):
    """Routing input: `tab: <tab> ; recent: <worlds> ;; <text>` (context fields dropped when use_context is False)."""
    c = r.get("context") or {}
    if not use_context:
        return r["text"]
    return f"tab: {c.get('tab') or 'none'} ; recent: {' '.join(c.get('recent_worlds') or []) or 'none'} ;; {r['text']}"
