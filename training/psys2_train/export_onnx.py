"""ONNX export stub: merges the LoRA adapter into the backbone and exports tag / intent / route logits.

Not exercised yet (spec: DistilBERT vs ModernBERT ablation measures int8 size and accuracy drop on the same dev set).
  python -m psys2_train.export_onnx <run dir> <model name> out.onnx
Quantization (onnxruntime.quantization.quantize_dynamic, QInt8) is the intended next step.
"""
from __future__ import annotations
import json, sys
from pathlib import Path
import torch


def export(run_dir, model_name, out_path, opset=17):
    from .model import build_model
    labels = json.loads((Path(run_dir) / "labels.json").read_text())
    m = build_model(model_name, n_tags=len(labels.get("tags", [])), n_intents=len(labels.get("intents", [])), n_routes=len(labels.get("routes", [])), lora=True)
    m.load_state_dict(torch.load(Path(run_dir) / "best.pt", map_location="cpu"))
    m.backbone = m.backbone.merge_and_unload()
    m.eval()

    class Wrap(torch.nn.Module):
        def __init__(self, m):
            super().__init__(); self.m = m
        def forward(self, input_ids, attention_mask):
            o = self.m(input_ids, attention_mask)
            return tuple(o[k] for k in ("tag_logits", "intent_logits", "route_logits") if k in o)

    names = [k for k, h in (("tag_logits", m.tag_head), ("intent_logits", m.intent_head), ("route_logits", m.route_head)) if h is not None]
    ids = torch.ones(1, 8, dtype=torch.long)
    torch.onnx.export(Wrap(m), (ids, ids), out_path, input_names=["input_ids", "attention_mask"], output_names=names, opset_version=opset,
                      dynamic_axes={"input_ids": {0: "b", 1: "t"}, "attention_mask": {0: "b", 1: "t"}, **{n: {0: "b"} for n in names}})
    return out_path


if __name__ == "__main__":
    export(*sys.argv[1:4])
