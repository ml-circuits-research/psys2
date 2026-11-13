"""Full world distributions of the dispatcher's routing head for a list of messages (WORLD-OF-WORLDS experiment, spec 19).

  python -m psys2_train.world_scores --ckpt training/runs/dispatcher-v5s2-c3265 --inp in.jsonl --out out.jsonl

Input, one JSON object per line: {"id", "text", "context": {"tab": str|null, "recent_worlds": [str], "session": [str]}}.
Output: {"id", "p": {world: probability}} over every world of the checkpoint's label set. Runs on CUDA in large bf16 batches (never CPU).
The Node experiment (scripts/eval-world-routing.mjs) masks a world's probability to test a world the encoder was never trained on, without retraining.
"""
from __future__ import annotations
import argparse, json, time
from pathlib import Path
from .dispatch_predict import load_ckpt
from .dispatcher import run_world, require_cuda


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ckpt", required=True); ap.add_argument("--inp", required=True); ap.add_argument("--out", required=True); ap.add_argument("--bs", type=int, default=1024)
    a = ap.parse_args(argv)
    dev = require_cuda()
    model, tok, meta = load_ckpt(a.ckpt, dev)
    rows = [json.loads(l) for l in Path(a.inp).read_text().splitlines() if l.strip()]
    t0 = time.time()
    res = run_world(model, tok, [r["text"] for r in rows], [r.get("context") or {"tab": None, "recent_worlds": [], "session": []} for r in rows], meta["context"], dev,
                    max_len=meta.get("max_len", 128), bs=a.bs, topk=len(meta["worlds"]), worlds=meta["worlds"])
    with open(a.out, "w") as f:
        for r, top in zip(rows, res):
            f.write(json.dumps({"id": r["id"], "p": {w: round(p, 5) for w, p in top}}) + "\n")
    print(f"scored {len(rows)} messages in {time.time() - t0:.1f}s on {dev} (ckpt {a.ckpt}, {len(meta['worlds'])} worlds)")


if __name__ == "__main__":
    main()
