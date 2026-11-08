"""Leak check for training/dataset/ (written by scripts/build-dataset.mjs).

Per world: no `group` may appear in two of train/dev/test. In routing.jsonl rows carry no `group`; a normalized
(text, world) pair must not appear in two splits (exact duplicates were dropped by the builder, so any crossing is a leak).
A routing text crossing splits is only a WARNING by default (the builder splits by group, rows carry none; same text with another context
may land in two splits); use --strict-routing to fail on it. Prints a per-world, per-split, per-source count table. Exit code 1 on any group leak.

Usage (from training/): python -m psys2_train.check_splits [--root DIR]
"""
from __future__ import annotations
import argparse, sys
from collections import Counter, defaultdict
from pathlib import Path
from .data import DATASET, read_jsonl

SPLITS = ("train", "dev", "test")


def norm(text):
    return " ".join(str(text).lower().split())


def check(root=DATASET):
    root = Path(root)
    leaks, warns, table = [], [], {}
    worlds = sorted(p.name for p in root.iterdir() if p.is_dir())
    for w in worlds:
        where = defaultdict(set)
        cnt = {s: Counter() for s in SPLITS}
        for s in SPLITS:
            for r in read_jsonl(root / w / f"{s}.jsonl"):
                cnt[s][r.get("source", "?")] += 1
                if r.get("group"):
                    where[r["group"]].add(s)
        table[w] = cnt
        for g, ss in where.items():
            if len(ss) > 1:
                leaks.append(f"{w}: group {g!r} in {sorted(ss)}")
    rt = {s: Counter() for s in SPLITS}
    seen = defaultdict(set)
    has_group = False
    for r in read_jsonl(root / "routing.jsonl"):
        s = r.get("split")
        rt[s][r.get("source", "?")] += 1
        if r.get("group"):
            has_group = True
            seen[("g", r["group"])].add(s)
        seen[("t", r.get("world"), norm(r.get("text", "")))].add(s)
    for k, ss in seen.items():
        if len(ss) > 1:
            (leaks if k[0] == "g" else warns).append(f"routing: {k[1:]} in {sorted(ss)}")
    return worlds, table, rt, leaks, warns, has_group


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(DATASET))
    ap.add_argument("--strict-routing", action="store_true", help="treat routing text overlap between splits as a leak")
    a = ap.parse_args()
    worlds, table, rt, leaks, warns, has_group = check(a.root)
    if a.strict_routing:
        leaks, warns = leaks + warns, []
    if warns:
        per = Counter(w.split("'")[1] for w in warns)
        print(f"WARNING: {len(warns)} routing (world, text) pairs occur in two splits; per world: {dict(sorted(per.items()))}")
    srcs = sorted({k for c in list(table.values()) for s in c.values() for k in s} | {k for s in rt.values() for k in s})
    print(f"{'world':18s} {'split':6s} " + " ".join(f"{k:>13s}" for k in srcs) + "   total")
    for w in worlds + ["routing"]:
        cnt = rt if w == "routing" else table[w]
        for s in SPLITS:
            print(f"{w:18s} {s:6s} " + " ".join(f"{cnt[s][k]:13d}" for k in srcs) + f"   {sum(cnt[s].values()):5d}")
    print(f"routing rows carry group: {has_group} (otherwise checked by world+normalized text)")
    if leaks:
        print(f"LEAKS: {len(leaks)}")
        for l in leaks[:50]:
            print("  " + l)
        return 1
    print("split check OK: no group or routing text crosses splits")
    return 0


if __name__ == "__main__":
    sys.exit(main())
