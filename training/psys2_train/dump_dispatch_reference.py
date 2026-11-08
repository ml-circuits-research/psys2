"""Reference dispatcher predictions for the JS-vs-Python check (D4).

  python -m psys2_train.dump_dispatch_reference --ckpt training/runs/dispatcher-distilbert --export training/runs/export/dispatcher-distilbert [--n 50] [--out <export>/reference.jsonl]

For n fixed-seed test items (records and multi-command messages) writes, per item and per backend ("torch" = PyTorch CUDA fp32, "fp32" and
"int8" = onnxruntime CPU), the output of the same decoding the JS runtime implements: candidate segmentations (best first, log-prob score, spans)
and the top-3 worlds with probabilities of every distinct segment. scripts/verify-dispatcher-js.mjs compares the JS runtime with it.
"""
from __future__ import annotations
import argparse, json, random
from pathlib import Path
from transformers import AutoTokenizer
from .dispatch_predict import collect_inputs
from .dispatcher import require_cuda
from .export_onnx import load_torch, Backend, OrtModel, TorchImpl, dispatch_once


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ckpt", required=True); ap.add_argument("--export", required=True); ap.add_argument("--out", default=None)
    ap.add_argument("--n", type=int, default=50); ap.add_argument("--seed", type=int, default=5)
    a = ap.parse_args(argv)
    dev = require_cuda()
    model, meta = load_torch(a.ckpt, dev); worlds = meta["worlds"]
    tok = AutoTokenizer.from_pretrained(Path(a.ckpt) / "tokenizer")
    ex = Path(a.export)
    backs = {"torch": Backend(tok, "torch", TorchImpl(model, dev)), "fp32": Backend(tok, "onnx", OrtModel(ex / "model.onnx", 1)), "int8": Backend(tok, "onnx", OrtModel(ex / "model.int8.onnx", 1))}
    items = collect_inputs("test"); random.Random(a.seed).shuffle(items)
    multi = [i for i in items if i["kind"] == "multicmd"][: a.n // 2]; single = [i for i in items if i["kind"] != "multicmd"][: a.n - len(multi)]
    out = Path(a.out or ex / "reference.jsonl")
    with open(out, "w") as f:
        for it in single + multi:
            ctx = {"tab": it["context"].get("tab"), "recent_worlds": it["context"].get("recent_worlds", [])}
            rec = {"text": it["text"], "context": ctx}
            for k, be in backs.items():
                cands, seen = dispatch_once(be, it["text"], ctx, worlds)
                rec[k] = [{"score": sc, "segments": [{"start": x, "end": y, "text": it["text"][x:y], "worlds": [{"world": w, "score": p} for w, p in seen[it["text"][x:y]]]} for x, y in segs]} for sc, segs in cands]
            f.write(json.dumps(rec) + "\n")
    print("wrote", out)


if __name__ == "__main__":
    main()
