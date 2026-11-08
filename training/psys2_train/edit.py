"""Edit tags of the simplification head (python mirror of src/formalizer/edit-tags.mjs; spec 03 section 7.2).

Words: letters/digits with inner apostrophes, every other non-blank character is its own word. One tag per word:
KEEP, DELETE, R:<text> (replace), P:<text> (prepend), A:<text> (append). The tag vocabulary is training/dataset-edit/edit-vocab.json.
The head is trained on the SAME input as the world head (`tab: .. ; recent: .. ;; <segment>`); labels sit on the first sub-token of each word of the segment.
"""
from __future__ import annotations
import json, random, re
from pathlib import Path
from .data import DATASET, read_jsonl, routing_text

EDIT_DIR = DATASET.parent / "dataset-edit"
WORD_RE = re.compile(r"[0-9A-Za-z_À-￿]+(?:['’][0-9A-Za-z_À-￿]+)*|\S")
ALNUM_RE = re.compile(r"[0-9A-Za-z_À-￿]")
BASE_TAGS = ["KEEP", "DELETE"]


def words_of(text):
    return [(m.group(0), m.start(), m.end()) for m in WORD_RE.finditer(text)]


def is_punct(w):
    return ALNUM_RE.search(w) is None


def apply_tags(text, words, tags):
    out = ""
    for (w, s, e), t in zip(words, tags):
        if t == "DELETE":
            continue
        piece = w
        if t.startswith("R:"):
            piece = t[2:]
        elif t.startswith("P:"):
            piece = t[2:] + " " + w
        elif t.startswith("A:"):
            add = t[2:]
            piece = w + ("" if is_punct(add[:1] or "a") else " ") + add
        if out and s > 0 and text[s - 1].isspace():
            out += " "
        out += piece
    return out


def simplified_text(text, words, tags):
    s = apply_tags(text, words, tags).strip()
    return s if s and s != text.strip() else None


def load_vocab(root=EDIT_DIR):
    return BASE_TAGS + json.loads((Path(root) / "edit-vocab.json").read_text())["tags"]


def word_tokens(offsets, prefix, words):
    """Per word the index of its first token (None when truncated away). offsets: tokenizer offset mapping of the FULL input;
    prefix: number of characters before the segment in that input."""
    out, i, n = [], 0, len(offsets)
    for _, s, e in words:
        s, e = s + prefix, e + prefix
        while i < n and not (offsets[i][1] > offsets[i][0] and offsets[i][1] > s):
            i += 1
        out.append(i if i < n and offsets[i][0] < e else None)
    return out


def load_edit_examples(split, root=EDIT_DIR):
    return read_jsonl(Path(root) / f"{split}.jsonl")


def plain_example(r):
    """Lowercased copy without . , ; ? ! words (tags of the dropped punctuation words are dropped with them), or None."""
    words = words_of(r["text"])
    keep = [i for i, (w, _, _) in enumerate(words) if w not in ".,;?!"]
    if len(keep) == len(words):
        text = r["text"].lower()
    else:
        text = re.sub(r"\s+", " ", re.sub(r"[.,;?!]", " ", r["text"].lower())).strip()
    nw = words_of(text)
    if len(nw) != len(keep) or not nw:
        return None
    return dict(r, text=text, tags=[r["tags"][i] for i in keep])


def sample_epoch(aligned, identity, ratio, rng):
    pool = list(aligned)
    k = min(len(identity), int(len(aligned) * ratio))
    pool += rng.sample(identity, k)
    rng.shuffle(pool)
    return pool


def heldout_routing_rows():
    """World-head training rows from the held-out paraphrase records (data principle: all good data is trained on; the held-out
    numbers of a model trained with them are reported as contaminated). Records with needs_review are skipped."""
    rows = []
    for f in sorted((DATASET.parent / "paraphrases" / "heldout" / "out").glob("*.jsonl")):
        for r in read_jsonl(f):
            if r.get("needs_review"):
                continue
            rows.append({"id": r["example_id"], "text": r["text"], "world": r["world"], "alt_worlds": [], "split": "train", "weight": 1.0, "source": "heldout",
                         "context": {"tab": r.get("tab"), "recent_worlds": [], "session": r.get("setup") or []}})
    return rows
