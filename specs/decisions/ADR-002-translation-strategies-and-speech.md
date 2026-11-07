# ADR-002 — Translation strategies and speech in the browser demo

Status: accepted (2026-11-07). Amends vision v1 §5 (language profiles) and spec 05.

## Decision
1. Translation to English at the system boundary is a **declared strategy**, chosen per deployment:
   - `rules` — the rule-based translator in `src/translate/` (default; runs everywhere, deterministic).
   - `mt-small` — a small machine-translation model running on CPU (for example a Marian / OPUS-MT model, through transformers.js in the browser or CTranslate2/ONNX in a Python worker on the server).
   - `browser-api` — the browser's built-in on-device translation API, where available. **Demo only** (webchat); never used by the server.
2. Model-based strategies are generative, so every translated sentence must pass automatic checks before it is formalized: numbers, names and units preserved; negation preserved (source negation markers ⇒ English negation); question form preserved. A sentence that fails falls back to `rules`, and the failure is recorded in the trace. Translation models never formalize and never produce answers.
3. Evaluation criterion for all strategies: **formalization equivalence** — a sentence in another language and its English twin must produce the same canonical wires (world tests may carry twins with `language=ro`).
4. Facts stored in worlds are English. The original text is kept as an immutable source record so `core.source` can point to the exact original span through the translation alignment (model strategies provide sentence-level alignment only).
5. The webchat demo supports **speech**: a language selector (interface, recognition and synthesis language), a microphone button that dictates with the browser speech-recognition API and sends the recognized text, and a speaker toggle that reads every answer aloud with the browser speech-synthesis API. When the API is missing, the controls are disabled with an explanation. Speech is input/output only; it changes nothing in C2.
