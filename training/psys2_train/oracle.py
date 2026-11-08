"""Sanity check of the target format: decode gold (skeleton, slots) back to a circuit and compare with the gold target.
  python -m psys2_train.oracle [world ...]   ->  per world: oracle exact-match, skeleton classes, share of values aligned to spans."""
import sys
from .data import load_world, DATASET
from .sop import ValueMap, decode, normalize


def main(worlds):
    worlds = worlds or sorted(p.name for p in DATASET.iterdir() if p.is_dir())
    for w in worlds:
        d = load_world(w)
        vm = ValueMap().fit(d["train"])
        for split in ("dev",):
            pos = [e for e in d[split] if e["target"]]
            ok = sum(decode(e["skeleton"], {n: e["text"][a:b] for n, a, b in e["slots"]}, vm) == e["target"] for e in pos)
            vals = sum(len(es) for e in pos for _, es in normalize(e["target_raw"]))
            al = sum(len(e["slots"]) for e in pos)
            print(f"{w:16s} oracle_exact {ok / max(len(pos), 1):.3f}  classes {len({e['intent'] for e in d['train']})}  aligned {al / max(vals, 1):.2f}  dev_unseen_intent {sum(e['intent'] not in {x['intent'] for x in d['train']} for e in d[split]) / max(len(d[split]), 1):.2f}")


if __name__ == "__main__":
    main(sys.argv[1:])
