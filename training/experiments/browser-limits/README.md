# Browser limits for an encoder formalizer (reviewer experiment, 2026-11-09)

The question: could a DistilBERT-sized model with formalization heads, LoRA or legend-question span extraction run in the webchat? Measured in headless Chrome with onnxruntime-web 1.31.1, the version the webchat vendors, single-threaded wasm like `ui/ort-worker.mjs`. The host had 2 vCPUs, so these are pessimistic absolute numbers. The weights are random: speed does not depend on them, and the real dispatcher v4 ran at the same speed.

## Results (ms per run, median of 8; see results-throttle1.json and results-throttle4.json)

| configuration | 1x | 4x CPU throttle |
| --- | --- | --- |
| 1 pass, 1 sentence of 32 tokens (dispatcher v4 real model) | 59 | 348 |
| 1 pass, 32 tokens (plain random encoder) | 59 | 264 |
| same + 24 tag heads (200 labels each) + 600-op head inside the graph | 108 (noisy; 75 in a first run) | 339 |
| batch of 4 x 32 tokens | 238 | 1047 |
| batch of 16 x 32 tokens | 894 | - |
| LoRA r=8 (q,k,v,out,lin1,lin2 in 6 layers) fed as graph inputs | 64 | 338 |
| LoRA via `ort.LoraAdapter` + `activeLoraAdapters`, swapping 2 adapters on every run | 62 | 285 |
| one separate head session on the hidden states (b=1, t=32) | 0.4 | 2.6 |

Sizes and memory:
- int8 encoder 67.0 MB; with the 24 heads and the op head 70.7 MB (+3.7 MB);
- a LoRA adapter (`.onnx_adapter`, fp32, r=8, all 6 targets) is 2.66 MB and creating one takes ~3 ms;
- the renderer RSS was 815 MB with 6 encoder-sized sessions loaded (554 MB with 4), so about 100–150 MB of RAM per loaded session.

## Conclusions

1. Heads inside the encoder graph are effectively free: they run in the same pass as segmentation and routing.
2. Batching gives no gain on single-threaded wasm: N questions cost N passes. Span extraction with "legend question ; sentence" costs one pass of about twice the length per question, roughly 1 s for 3–4 questions at 4x. Multi-threading needs cross-origin isolation, which GitHub Pages cannot send.
3. Runtime LoRA works in onnxruntime-web 1.31. The LoRA weights must be overridable initializers (graph inputs that also have an initializer; the JS API rejects feeding them directly as feeds unless they are required inputs). Swapping adapters costs nothing measurable. But every adapted world costs one full extra pass, and that pass cannot be shared with the dispatcher.
4. Keep one shared encoder session: every extra session costs about 100–150 MB of tab memory, which matters for FREEZE.
