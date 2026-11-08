"""Multi-command messages for the segmentation head (T7 step 3 / D1).

Joins 2-3 single-command sentences into one message with "and", "then", ", ", ". ", "; " and variations
(", then", " and then", ", and"). Each split uses ONLY sentences of the same split of routing.jsonl, so the test set is
disjoint from train/dev. Deterministic with --seed (default 1337).

  python -m psys2_train.multicmd            # -> training/dataset/multicmd/{train,dev,test}.jsonl

Written to training/runs/multicmd/ (mirrored to training/dataset/multicmd/ for the Node gold reader).
Record: {id, text, context{tab,recent_worlds,session,synthetic}, variant: clean|plain, n_segments,
         segments: [{start, end, text, world, alt_worlds, source_id}]}
`start`/`end` are character offsets into `text`; segment text excludes the joiner ("and", "then", ",", ";") and
the sentence punctuation that was dropped because of the joiner. Single-sentence messages have one segment.
Boundary label for tokens: B = first token of a segment other than the first; every other token is I.
`variant: plain` = lowercased with punctuation removed (robustness to unpunctuated input).
"""
from __future__ import annotations
import argparse, json, random, re
from pathlib import Path
from .data import DATASET, read_jsonl

# (joiner text, kind): kind "strip" drops the sentence-final punctuation, "keep" keeps it
JOINERS = [(" and ", "strip"), (", and ", "strip"), (" then ", "strip"), (", then ", "strip"), (" and then ", "strip"),
           (", ", "strip"), ("; ", "strip"), (". ", "keep"), (" ", "keep")]
JOINER_W = [5, 1, 3, 3, 2, 3, 2, 4, 0.0]  # the bare " " joiner is only used by the plain variant
END_PUNCT = ".!?"
SIZES = {"train": 30000, "dev": 3000, "test": 4000}
P_SINGLE, P_THREE, P_SAME_WORLD, P_PLAIN, P_LOWER_NEXT = 0.25, 0.30, 0.40, 0.20, 0.4

LEAD_RE = re.compile(r"^(?:[\s,;]+|(?:and|then)\b[\s,]*)+", re.I)
TRAIL_RE = re.compile(r"(?:[\s,;]+|\b(?:and|then)\b[\s,]*)+$", re.I)


def trim_segment(text, a, b):
    """Strip joiner words/punctuation at both ends of the char span [a, b); returns the new (a, b)."""
    s = text[a:b]
    m = LEAD_RE.match(s)
    if m and m.end() < len(s):
        a += m.end(); s = text[a:b]
    m = TRAIL_RE.search(s)
    if m and m.start() > 0:
        b = a + m.start()
    return a, b


def _plain(s):
    return re.sub(r"\s+", " ", re.sub(r"[.,;?!]", " ", s.lower())).strip()


def build_message(sents, rng, plain):
    """sents: list of routing rows. Returns text and segments (offsets)."""
    text, segs = "", []
    for i, r in enumerate(sents):
        s = r["text"].strip()
        last = i == len(sents) - 1
        j = None
        if not last:
            j, kind = rng.choices(JOINERS[:-1], weights=JOINER_W[:-1])[0]
        if plain:
            s = _plain(s)
            j = None if j is None else (" " + _plain(j) + " " if re.search(r"[a-z]", j) else " ")
        elif not last and kind == "strip":
            s = s.rstrip(END_PUNCT + " ")
        elif not last and kind == "keep":
            if s[-1] not in END_PUNCT:
                s += "."
            j = " "  # the sentence now carries its own end punctuation; the joiner is a space
        if i and not plain and rng.random() < P_LOWER_NEXT and len(s) > 1 and s[0].isupper() and not s[1].isupper() and not s.startswith("I "):
            s = s[0].lower() + s[1:]
        start = len(text)
        text += s
        segs.append({"start": start, "end": len(text), "text": s, "world": r["world"], "alt_worlds": r.get("alt_worlds", []), "source_id": r["id"]})
        if j is not None:
            text += j
    return text, segs


def build_split(rows, n, rng):
    by_world = {}
    for r in rows:
        by_world.setdefault(r["world"], []).append(r)
    worlds = sorted(by_world)
    out = []
    for k in range(n):
        if rng.random() < P_SINGLE:
            k_sent = 1
        else:
            k_sent = 3 if rng.random() < P_THREE else 2
        if k_sent > 1 and rng.random() < P_SAME_WORLD:
            w = rng.choice(worlds)
            sents = [rng.choice(by_world[w]) for _ in range(k_sent)]
        else:
            sents = [rng.choice(rows) for _ in range(k_sent)]
        plain = rng.random() < P_PLAIN
        text, segs = build_message(sents, rng, plain)
        c = sents[0]["context"]
        out.append({"id": f"mc{k:06d}", "text": text, "context": {"tab": c.get("tab"), "recent_worlds": c.get("recent_worlds", []), "session": [], "synthetic": True},
                    "variant": "plain" if plain else "clean", "n_segments": len(segs), "segments": segs})
    return out


MULTICMD = DATASET.parent / "runs" / "multicmd"


def load_multicmd(split, root=MULTICMD):
    """`root` is the multicmd directory (default training/runs/multicmd)."""
    return read_jsonl(Path(root) / f"{split}.jsonl")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dataset", default=str(DATASET)); ap.add_argument("--seed", type=int, default=1337)
    ap.add_argument("--out", default=str(MULTICMD)); ap.add_argument("--mirror", default=str(DATASET / "multicmd"), help="second copy read by scripts/lib/dispatch-gold.mjs (empty to skip)")
    a = ap.parse_args(argv)
    rows = read_jsonl(Path(a.dataset) / "routing.jsonl")
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)  # training/runs/multicmd: build-dataset.mjs wipes training/dataset/*
    for split, n in SIZES.items():
        rng = random.Random(f"{a.seed}-{split}")
        pool = [r for r in rows if r["split"] == split]
        recs = build_split(pool, n, rng)
        (out / f"{split}.jsonl").write_text("".join(json.dumps(r) + "\n" for r in recs))
        if a.mirror:
            Path(a.mirror).mkdir(parents=True, exist_ok=True); (Path(a.mirror) / f"{split}.jsonl").write_text((out / f"{split}.jsonl").read_text())
        print(split, len(recs), "messages;", sum(r["n_segments"] > 1 for r in recs), "multi-command;", sum(r["variant"] == "plain" for r in recs), "plain")


if __name__ == "__main__":
    main()
