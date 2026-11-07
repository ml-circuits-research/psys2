"""Report the training environment: Python, libraries, GPU, memory, precision, backbone availability.

Run on the training host before any job (vision §13: hardware discovery before jobs are admitted).
Exits non-zero when a required component is missing.
"""
import importlib
import json
import platform
import sys

BACKBONE = "answerdotai/ModernBERT-base"
REQUIRED = ["torch", "transformers", "peft", "datasets", "accelerate", "safetensors"]


def version(name):
    try:
        return importlib.import_module(name).__version__
    except Exception as exc:  # report, do not hide
        return f"missing ({exc.__class__.__name__})"


def main():
    report = {"python": sys.version.split()[0], "platform": platform.platform(),
              "libraries": {n: version(n) for n in REQUIRED}}
    ok = all(not v.startswith("missing") for v in report["libraries"].values())
    try:
        import torch
        report["cuda_available"] = torch.cuda.is_available()
        if torch.cuda.is_available():
            props = torch.cuda.get_device_properties(0)
            report["gpu"] = {"name": props.name, "memory_gb": round(props.total_memory / 2**30, 1),
                             "bf16": torch.cuda.is_bf16_supported()}
    except Exception as exc:
        report["torch_error"] = str(exc)
        ok = False
    try:
        from transformers import AutoConfig
        cfg = AutoConfig.from_pretrained(BACKBONE)
        report["backbone"] = {"id": BACKBONE, "model_type": cfg.model_type,
                              "hidden_size": cfg.hidden_size, "layers": cfg.num_hidden_layers}
    except Exception as exc:
        report["backbone"] = {"id": BACKBONE, "error": str(exc)}
        ok = False
    print(json.dumps(report, indent=2))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
