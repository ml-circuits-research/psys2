"""Per-length-bucket multi-command evaluation of a dispatcher checkpoint (G6).

  python -m psys2_train.eval_buckets --ckpt training/runs/dispatcher-X [--weights ckpt-step2040.pt] [--multicmd DIR] [--split test]
         [--baseline result.json] --out training/results/g6-X-test-buckets.json

Reports, per bucket (1, 2-3, 4-5, 6-8, long): n, exact segmentation, final correctness (spans + world), omitted segments,
duplicates, lost dependencies. With --baseline, lists every bucket where this run regresses (selection guard; exit code 2).
"""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
import torch
from .multicmd import load_multicmd, MULTICMD
from .dispatcher import eval_seg, require_cuda
from .dispatch_predict import load_ckpt
from .buckets import selection_guard


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ckpt", required=True); ap.add_argument("--weights", default="best.pt"); ap.add_argument("--multicmd", default=str(MULTICMD))
    ap.add_argument("--split", default="test"); ap.add_argument("--baseline", default=None); ap.add_argument("--out", default=None)
    a = ap.parse_args(argv)
    dev = require_cuda()
    ck = Path(a.ckpt); meta = json.loads((ck / "meta.json").read_text())
    from transformers import AutoTokenizer
    from .dispatcher import build
    tok = AutoTokenizer.from_pretrained(ck / "tokenizer")
    model = build(meta["model"], len(meta["worlds"]), meta["lora"], meta.get("lora_r", 16), len(meta.get("edit_tags") or [])).to(dev)
    model.load_state_dict(torch.load(ck / a.weights, map_location=dev)); model.eval()
    msgs = load_multicmd(a.split, a.multicmd)
    r = eval_seg(model, tok, msgs, meta.get("context", True), dev, meta["worlds"])
    res = {"ckpt": str(ck), "weights": a.weights, "split": a.split, "n": r["n"], "boundary": r["boundary"], "exact_segmentation": r["exact_segmentation"],
           "end_to_end_exact": r["end_to_end_exact"], "exact_by_family": r["exact_by_family"], "by_bucket": r["by_bucket"]}
    print(f"{'bucket':7} {'n':>5} {'exact':>7} {'final':>7} {'omit':>6} {'dup':>5} {'deps lost':>10}")
    for k, v in r["by_bucket"].items():
        print(f"{k:7} {v['n']:5d} {v['exact_segmentation']:7.3f} {v['final_correct']:7.3f} {v['omitted_segments']:6d} {v['duplicate_segments']:5d} {v['lost_dependencies']:5d}/{v['dependencies']}")
    code = 0
    if a.baseline:
        bad = selection_guard(r["by_bucket"], json.loads(Path(a.baseline).read_text())["by_bucket"])
        res["regressions_vs_baseline"] = bad
        print("regressions vs baseline:", bad or "none"); code = 2 if bad else 0
    if a.out:
        Path(a.out).parent.mkdir(parents=True, exist_ok=True); Path(a.out).write_text(json.dumps(res, indent=1))
    return code


if __name__ == "__main__":
    sys.exit(main())
