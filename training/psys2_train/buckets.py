"""Per-length-bucket segmentation metrics (G6): omissions, duplicates, lost dependencies, final correctness.

Buckets by gold segment count: 1, 2-3, 4-5, 6-8, long (>= 9). Each predicted segment is assigned to the gold segment it overlaps most.
  omission    = gold segment that no predicted segment is assigned to (it was merged into a neighbour or dropped)
  duplicate   = predicted segments beyond the first assigned to one gold segment (a command cut into pieces)
  lost dep    = a gold segment marked `dep` (second command that refers to an earlier one) whose exact span is not predicted
  final       = exact spans AND the top-1 world of every segment is right (end-to-end)
`selection_guard(candidate, baseline)` lists buckets where the candidate regresses (the many short cases cannot hide long ones).
"""
from __future__ import annotations

BUCKETS = [("1", 1, 1), ("2-3", 2, 3), ("4-5", 4, 5), ("6-8", 6, 8), ("long", 9, 10 ** 9)]


def bucket_of(n):
    return next(name for name, a, b in BUCKETS if a <= n <= b)


def span_errors(gold, pred):
    """gold/pred: lists of (start, end). Returns (omitted gold indices, duplicates, extra predicted segments overlapping no gold)."""
    assigned = {i: 0 for i in range(len(gold))}; extra = 0
    for ps, pe in pred:
        best, bo = None, 0
        for i, (gs, ge) in enumerate(gold):
            o = min(pe, ge) - max(ps, gs)
            if o > bo:
                best, bo = i, o
        if best is None:
            extra += 1
        else:
            assigned[best] += 1
    return [i for i, c in assigned.items() if c == 0], sum(max(0, c - 1) for c in assigned.values()), extra


class Buckets:
    def __init__(self):
        self.d = {name: dict(n=0, segs=0, exact=0, final=0, omitted=0, msgs_omit=0, dup=0, msgs_dup=0, extra=0, deps=0, deps_lost=0) for name, _, _ in BUCKETS}

    def add(self, msg, top, world_ok):
        gold = [(s["start"], s["end"]) for s in msg["segments"]]; pred = [(s["start"], s["end"]) for s in top]
        om, dup, extra = span_errors(gold, pred)
        b = self.d[bucket_of(len(gold))]
        ok = pred == gold
        b["n"] += 1; b["segs"] += len(gold); b["exact"] += ok; b["final"] += ok and world_ok
        b["omitted"] += len(om); b["msgs_omit"] += bool(om); b["dup"] += dup; b["msgs_dup"] += bool(dup); b["extra"] += extra
        ps = set(pred)
        for i, s in enumerate(msg["segments"]):
            if s.get("dep"):
                b["deps"] += 1; b["deps_lost"] += gold[i] not in ps

    def report(self):
        out = {}
        for name, b in self.d.items():
            n = max(b["n"], 1)
            out[name] = {"n": b["n"], "segments": b["segs"], "exact_segmentation": b["exact"] / n, "final_correct": b["final"] / n,
                         "omitted_segments": b["omitted"], "messages_with_omission": b["msgs_omit"], "omission_rate": b["omitted"] / max(b["segs"], 1),
                         "duplicate_segments": b["dup"], "messages_with_duplicate": b["msgs_dup"], "extra_segments": b["extra"],
                         "dependencies": b["deps"], "lost_dependencies": b["deps_lost"]}
        return out


def selection_guard(cand, base, tol=0.005, min_n=20):
    """Buckets (with >= min_n messages) where `cand` final_correct or exact_segmentation falls more than `tol` below `base`."""
    bad = []
    for k, c in cand.items():
        b = base.get(k)
        if not b or c["n"] < min_n:
            continue
        for m in ("final_correct", "exact_segmentation"):
            if c[m] < b[m] - tol:
                bad.append((k, m, b[m], c[m]))
    return bad


def worst_bucket(rep, min_n=20):
    """Lowest final_correct among buckets with enough messages (used in the dev score so short cases cannot mask long ones)."""
    v = [r["final_correct"] for r in rep.values() if r["n"] >= min_n]
    return min(v) if v else 0.0
