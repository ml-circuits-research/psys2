"""Metrics: exact SOP match after decoding, slot F1, routing accuracy."""
from __future__ import annotations
from collections import Counter


def slot_f1(gold_sets, pred_sets):
    """Micro P/R/F1 over (slot, start, end) spans; `gold_sets`/`pred_sets` are lists (per example) of span tuples."""
    tp = fp = fn = 0
    for g, p in zip(gold_sets, pred_sets):
        g, p = set(g), set(p)
        tp += len(g & p); fp += len(p - g); fn += len(g - p)
    pr = tp / (tp + fp) if tp + fp else 1.0
    rc = tp / (tp + fn) if tp + fn else 1.0
    return {"precision": pr, "recall": rc, "f1": 2 * pr * rc / (pr + rc) if pr + rc else 0.0, "tp": tp, "fp": fp, "fn": fn}


def breakdown(items, key):
    """Exact-match rate per value of `key` (e.g. source) over items {exact: bool, source: ...}."""
    tot, ok = Counter(), Counter()
    for it in items:
        tot[it[key]] += 1; ok[it[key]] += it["exact"]
    return {k: {"n": tot[k], "exact": ok[k] / tot[k]} for k in tot}


def accuracy(pairs):
    pairs = list(pairs)
    return sum(a == b for a, b in pairs) / len(pairs) if pairs else 0.0
