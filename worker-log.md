# Worker log

Append-only, written by the worker. One entry per task:

```
## Tn — <title> — done | partial | blocked (<date time>)
Commands: ...
Results: key numbers (link to training/results/*.json)
Commit: <hash>
Deviations / choices: ...
```

## T0 — Environment — done (2026-11-08 10:50)
Commands:
- `python3 -m venv .venv && . .venv/bin/activate`
- `pip install torch --index-url https://download.pytorch.org/whl/cu130`
- `pip install -r training/requirements.txt onnx onnxruntime`
- `python training/check_env.py`
- `npm test`; `node src/cli.mjs test-world all`
- `bash training/smoke_test.sh` (venv active)
- tokenizer + model load and one GPU forward pass for answerdotai/ModernBERT-base and distilbert-base-uncased
Results:
- node v22.23.2, python 3.12.3, GPU NVIDIA GB10 (119.6 GB unified), driver 580.178.04, torch CUDA 13.0, bf16 supported
- torch 2.14.1+cu130, transformers 5.22.2, peft 0.21.2, datasets 5.1.0, accelerate 1.15.0, safetensors 0.8.0, onnx 1.23.2, onnxruntime 1.31.1 (CPU provider), numpy 2.5.4, scikit-learn 1.9.1
- torch.cuda.is_available() True; 512x512 matmul on cuda works (sm_121 wheel OK)
- check_env.py: all libraries present, cuda_available true, backbone ModernBERT-base config loads (hidden 768, 22 layers)
- npm test: 523 pass, 0 fail
- test-world all: 21 worlds, 1333/1333 passed
- smoke test: `smoke test OK` (runs on CPU, tiny random model, as written)
- model downloads: ModernBERT-base and distilbert-base-uncased both load and run a forward pass on GPU
Commit: (filled by coordinator)
Deviations / choices: venv with the cu130 aarch64 wheel chosen over the NGC container because the wheel sees the GPU. No training code changed. .gitignore already contains `.venv/`. HF Hub warns about unauthenticated requests (no HF_TOKEN); downloads work anyway.
