"""Contrastive role pairs (review F7): two messages made of exactly the same words whose roles differ, so the meaning differs.

    red eyes + blue body   vs   blue eyes + red body
    7 minus 3              vs   3 minus 7
    put the circle above the square   vs   put the square above the circle

They are test data for every word-preserving check (the value checker of the simplifier/normalizer, the segmenter, the rules):
a checker that only compares the bag of words accepts the swap; a role-aware one must not. Each pair carries the atomic `steps`
of both sides (rule-verifiable) and the context needed (`setup`). The committed set is training/eval/role-pairs.jsonl, rebuilt with

    python -m psys2_train.role_pairs [--n 120] [--seed 11] [--out training/eval/role-pairs.jsonl]

Checked by training/tests/test_role_pairs.py (same bag of words, different text, different steps) and tests/role-pairs.test.mjs (the rule
formalizer gives different SOPs for the two sides).
"""
from __future__ import annotations
import argparse, json, random, re
from pathlib import Path
from .compositional import COLORS, KINDS, an

OUT = Path(__file__).resolve().parents[1] / "eval" / "role-pairs.jsonl"


def bag(text):
    return sorted(re.findall(r"[a-z0-9]+", text.lower()))


def _pair(rng, family):
    if family == "avatar_colors":
        c1, c2 = rng.sample(COLORS, 2); form = rng.choice(range(3))
        f = [lambda x, y: f"Make your eyes {x} and your body {y}.", lambda x, y: f"Eyes {x} and body {y}.", lambda x, y: f"Set your eyes to {x} and your body to {y}."][form]
        s = lambda x, y: [f"Make your eyes {x}.", f"Make your body {y}."]
        return [], (f(c1, c2), s(c1, c2)), (f(c2, c1), s(c2, c1))
    if family == "draw_colors":
        k1, k2 = rng.sample(KINDS, 2); c1, c2 = rng.sample(COLORS, 2)
        f = lambda x, y: f"Draw {an(x)} {k1} and {an(y)} {k2}."
        s = lambda x, y: [f"Draw {an(x)} {k1}.", f"Draw {an(y)} {k2}."]
        return [], (f(c1, c2), s(c1, c2)), (f(c2, c1), s(c2, c1))
    if family == "draw_relation":
        k1, k2 = rng.sample(KINDS, 2); rel = rng.choice(["above", "below"])
        f = lambda x, y: f"Put the {x} {rel} the {y}."
        return [f"Draw {an(k1)}.", f"Draw {an(k2)}."], (f(k1, k2), [f(k1, k2)]), (f(k2, k1), [f(k2, k1)])
    if family == "arith_operands":
        a, b = rng.sample(range(2, 20), 2)
        f = lambda x, y: f"What is {x} minus {y}?"
        return [], (f(a, b), [f(a, b)]), (f(b, a), [f(b, a)])
    if family == "draw_order":
        k1, k2 = rng.sample(KINDS, 2)
        f = lambda x, y: f"Draw {an(x)} and then {an(y)}."
        s = lambda x, y: [f"Draw {an(x)}.", f"Draw {an(y)}."]
        return [], (f(k1, k2), s(k1, k2)), (f(k2, k1), s(k2, k1))
    raise ValueError(family)


FAMILIES = ["avatar_colors", "draw_colors", "draw_relation", "arith_operands", "draw_order"]


def generate(n=120, seed=11):
    rng = random.Random(seed); out, seen = [], set()
    guard = 0
    while len(out) < n and guard < n * 50:
        guard += 1
        fam = FAMILIES[len(out) % len(FAMILIES)]
        setup, a, b = _pair(rng, fam)
        key = (fam, a[0], b[0])
        if key in seen or (fam, b[0], a[0]) in seen or bag(a[0]) != bag(b[0]) or a[0] == b[0]:
            continue
        seen.add(key)
        out.append({"id": f"rp{len(out):04d}", "family": fam, "setup": setup, "a": {"text": a[0], "steps": a[1]}, "b": {"text": b[0], "steps": b[1]}})
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(); ap.add_argument("--n", type=int, default=120); ap.add_argument("--seed", type=int, default=11); ap.add_argument("--out", default=str(OUT))
    a = ap.parse_args(argv)
    recs = generate(a.n, a.seed)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Path(a.out).write_text("".join(json.dumps(r) + "\n" for r in recs))
    print(len(recs), "pairs ->", a.out)


if __name__ == "__main__":
    main()
