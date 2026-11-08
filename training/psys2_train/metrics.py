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


# ---- dispatcher metrics (D1) -------------------------------------------------------------------------------------
GROUPS = {"kids": lambda w: w.startswith("kids."),
          "avatar/shell/editor": lambda w: w.startswith("ui.") and w != "ui.help" or w == "docs.editor",
          "music/draw/map/charts": lambda w: w in ("media.music", "art.draw", "geo.map", "data.charts"),
          "games": lambda w: w.startswith("games."),
          "documents": lambda w: w.startswith("docs.") and w != "docs.editor"}


def world_group(w):
    """Group of a world; worlds in no group (ui.help) go to `other`."""
    for g, f in GROUPS.items():
        if f(w):
            return g
    return "other"


def macro_f1(gold, pred):
    labels = sorted(set(gold) | set(pred)); f = []
    for l in labels:
        tp = sum(g == l and p == l for g, p in zip(gold, pred)); fp = sum(g != l and p == l for g, p in zip(gold, pred)); fn = sum(g == l and p != l for g, p in zip(gold, pred))
        f.append(2 * tp / (2 * tp + fp + fn) if tp + fp + fn else 0.0)
    return sum(f) / max(len(f), 1)


def world_metrics(rows, top3, train_texts=frozenset()):
    """rows: routing rows (world, alt_worlds, source, text); top3: per row list of up to 3 predicted worlds, best first.
    Headline numbers are lenient: a prediction equal to one of alt_worlds counts as correct; `*_strict` count only `world`."""
    def acc(sel, f):
        sel = list(sel)
        return (sum(f(r, t) for r, t in sel) / len(sel)) if sel else None
    ok1 = lambda r, t: t[0] == r["world"] or t[0] in r.get("alt_worlds", [])
    ok3 = lambda r, t: any(x == r["world"] or x in r.get("alt_worlds", []) for x in t[:3])
    s1 = lambda r, t: t[0] == r["world"]
    s3 = lambda r, t: r["world"] in t[:3]
    pairs = list(zip(rows, top3))
    gold = [r["world"] for r in rows]; pred = [r["world"] if ok1(r, t) else t[0] for r, t in pairs]
    out = {"n": len(rows), "top1": acc(pairs, ok1), "top3": acc(pairs, ok3), "top1_strict": acc(pairs, s1), "top3_strict": acc(pairs, s3),
           "macro_f1": macro_f1(gold, pred), "macro_f1_strict": macro_f1(gold, [t[0] for t in top3])}
    def sub(keyf):
        res = {}
        for k in sorted({keyf(r) for r in rows}):
            sel = [p for p in pairs if keyf(p[0]) == k]
            res[k] = {"n": len(sel), "top1": acc(sel, ok1), "top3": acc(sel, ok3)}
        return res
    out["by_group"] = sub(lambda r: world_group(r["world"])); out["by_source"] = sub(lambda r: r["source"]); out["by_world"] = sub(lambda r: r["world"])
    from .data import norm_text
    unseen = [p for p in pairs if norm_text(p[0]["text"]) not in train_texts]
    out["unseen_text"] = {"n": len(unseen), "top1": acc(unseen, ok1), "top3": acc(unseen, ok3)}
    conf = Counter((g, p) for g, p in zip(gold, pred) if g != p)
    out["top_confusions"] = [{"gold": g, "pred": p, "count": c} for (g, p), c in conf.most_common(15)]
    return out


def boundary_prf(gold_starts, pred_starts):
    """Micro P/R/F1 over internal segment starts; arguments are lists (per message) of sets of char offsets."""
    tp = fp = fn = 0
    for g, p in zip(gold_starts, pred_starts):
        g, p = set(g), set(p); tp += len(g & p); fp += len(p - g); fn += len(g - p)
    pr = tp / (tp + fp) if tp + fp else 1.0; rc = tp / (tp + fn) if tp + fn else 1.0
    return {"precision": pr, "recall": rc, "f1": 2 * pr * rc / (pr + rc) if pr + rc else 0.0, "tp": tp, "fp": fp, "fn": fn}
