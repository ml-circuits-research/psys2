"""Rewrites of the edit head for the paraphrase evaluation records (input of scripts/eval-simplify.mjs).

  python -m psys2_train.simplify_predict --ckpt training/runs/dispatcher-distilbert-simp --out-dir training/runs/edit-tags/distilbert-simp

For every record of training/dataset-edit/eval-<split>.jsonl (all paraphrase variants of dev / test / heldout) the whole text is one piece
(paraphrase variants are single commands), with the record's tab and recent worlds as context. Writes <out-dir>/pred-<split>.jsonl
({id, simplified|null, tags}) in one batched CUDA pass.
"""
from __future__ import annotations
import argparse, json
from pathlib import Path
from .data import read_jsonl
from .dispatcher import run_world, require_cuda
from .dispatch_predict import load_ckpt
from .edit import EDIT_DIR


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ckpt", required=True); ap.add_argument("--out-dir", required=True); ap.add_argument("--splits", default="dev,test,heldout"); ap.add_argument("--tau", type=float, default=None, help="edit threshold (default: meta edit_threshold or 0.5)")
    a = ap.parse_args(argv)
    dev = require_cuda(); model, tok, meta = load_ckpt(a.ckpt, dev)
    assert meta.get("edit_tags"), "checkpoint has no edit head"
    out = Path(a.out_dir); out.mkdir(parents=True, exist_ok=True)
    for sp in a.splits.split(","):
        rows = read_jsonl(EDIT_DIR / f"eval-{sp}.jsonl")
        if not rows:
            continue
        res = run_world(model, tok, [r["text"] for r in rows], [r["context"] for r in rows], meta["context"], dev, worlds=meta["worlds"], edit_tags=meta["edit_tags"], edit_tau=a.tau if a.tau is not None else meta.get("edit_threshold", 0.5))
        with open(out / f"pred-{sp}.jsonl", "w") as f:
            for r, (top, simp, tags) in zip(rows, res):
                f.write(json.dumps({"id": r["id"], "simplified": simp, "tags": tags}) + "\n")
        print(sp, len(rows), "rewritten", sum(1 for _, s, _ in res if s), "->", out / f"pred-{sp}.jsonl")


if __name__ == "__main__":
    main()
