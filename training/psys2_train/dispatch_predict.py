"""Export dispatcher predictions for the Node validation layer (D2; src/dialog/dispatch-validate.mjs, spec 03 7.1).

  python -m psys2_train.dispatch_predict --ckpt training/runs/dispatcher-<name> --split test --out training/runs/dispatch-pred/test.jsonl

Writes <out> (every training/dataset/<world>/<split>.jsonl record as a single-segment message, plus every
training/runs/multicmd/<split>.jsonl message) and, next to it, `heldout.jsonl` (records of
training/paraphrases/heldout/out/*.jsonl without needs_review; only with --heldout, default on for split test).
One JSON object per line:
  {
    "id":      "<dataset record id: per-world record id | multicmd id | heldout example_id>",
    "kind":    "world-record" | "multicmd" | "heldout",
    "world":   "<gold world>" (world-record / heldout only), "text": "<message>",
    "context": {"tab": str|null, "recent_worlds": [str], "session": [str]},
    "gold":    {"segments": [{"start","end","text","world","alt_worlds"}]},     # best-effort gold, for convenience
    "boundaries": [{"offset": int, "p": float}],   # every possible boundary: word-start token (not the first) -> char offset
                                                    # of the segment start and P(segment starts there)
    "segmentations": [                              # beam <= 4, best first
       {"score": float,                             # log-probability <= 0 of the boundary decisions (independent per-token model)
        "segments": [{"start": int, "end": int, "text": str,        # joiners ("and", "then", ",", ";") trimmed
                      "worlds": [{"world": str, "score": float}]}]}]   # top-3, softmax PROBABILITY in [0,1], best first
        # "simplified": reserved for the (not yet trained) simplification head
  }
Alternatives come from flipping subsets of the 6 most uncertain boundaries. Runs on CUDA in large batches.
Held-out records are never used for training or model selection.
"""
from __future__ import annotations
import argparse, json, time
from pathlib import Path
import torch
from transformers import AutoTokenizer
from .data import DATASET, read_jsonl
from .multicmd import load_multicmd, MULTICMD
from .dispatcher import build, dispatch, require_cuda


def load_ckpt(ckpt, dev):
    ckpt = Path(ckpt); meta = json.loads((ckpt / "meta.json").read_text())
    tok = AutoTokenizer.from_pretrained(ckpt / "tokenizer")
    model = build(meta["model"], len(meta["worlds"]), meta["lora"], meta.get("lora_r", 16)).to(dev)
    model.load_state_dict(torch.load(ckpt / "best.pt", map_location=dev)); model.eval()
    return model, tok, meta


def collect_heldout(root=DATASET):
    items = []
    for f in sorted((Path(root).parents[0] / "paraphrases" / "heldout" / "out").glob("*.jsonl")):
        for r in read_jsonl(f):
            if r.get("needs_review"):
                continue
            t = r.get("text") or r["message"]
            items.append({"id": r["example_id"], "kind": "heldout", "world": r["world"], "text": t,
                          "context": {"tab": r.get("tab"), "recent_worlds": [], "session": r.get("context") or []},
                          "gold": {"segments": [{"start": 0, "end": len(t), "text": t, "world": r["world"], "alt_worlds": []}]}})
    return items


def collect_inputs(split, root=DATASET):
    items = []
    for wd in sorted(p for p in Path(root).iterdir() if p.is_dir() and p.name != "multicmd"):
        for r in read_jsonl(wd / f"{split}.jsonl"):
            items.append({"id": r["id"], "kind": "world-record", "world": wd.name, "text": r["text"], "context": {"tab": r.get("tab"), "recent_worlds": [], "session": r.get("context") or []},
                          "gold": {"segments": [{"start": 0, "end": len(r["text"]), "text": r["text"], "world": r["world"], "alt_worlds": []}]}})
    for m in load_multicmd(split):
        items.append({"id": m["id"], "kind": "multicmd", "text": m["text"], "context": {"tab": m["context"].get("tab"), "recent_worlds": m["context"].get("recent_worlds", []), "session": []},
                      "gold": {"segments": [{k: s[k] for k in ("start", "end", "text", "world", "alt_worlds")} for s in m["segments"]]}})
    return items


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ckpt", required=True); ap.add_argument("--split", default="test"); ap.add_argument("--out", default=None)
    ap.add_argument("--dataset", default=str(DATASET)); ap.add_argument("--chunk", type=int, default=2048); ap.add_argument("--heldout", action="store_true", default=None)
    a = ap.parse_args(argv)
    dev = require_cuda()
    model, tok, meta = load_ckpt(a.ckpt, dev)
    out = Path(a.out or Path(a.ckpt).parent / "dispatch-pred" / f"{a.split}.jsonl"); out.parent.mkdir(parents=True, exist_ok=True)
    def write(items, path):
        t0 = time.time(); n = 0
        with open(path, "w") as f:
            for st in range(0, len(items), a.chunk):
                chunk = items[st:st + a.chunk]
                for it, res in zip(chunk, dispatch(model, tok, chunk, meta["context"], dev, meta["worlds"])):
                    f.write(json.dumps(dict(it, split=a.split, boundaries=[{"offset": t["start"], "p": t["p_boundary"]} for t in res["tokens"][1:] if t["word_start"]],
                                            segmentations=res["candidates"])) + "\n"); n += 1
        print(f"wrote {n} predictions to {path} in {time.time() - t0:.1f}s (ckpt {a.ckpt}, context={meta['context']})")

    write(collect_inputs(a.split, a.dataset), out)
    if a.heldout or (a.heldout is None and a.split == "test"):
        write(collect_heldout(a.dataset), out.parent / "heldout.jsonl")


if __name__ == "__main__":
    main()
