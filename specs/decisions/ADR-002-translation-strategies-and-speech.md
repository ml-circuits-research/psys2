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

## Translation coverage report (Romanian -> English equivalence test)

Measured by `tests/translate-equivalence.test.mjs` (a Romanian twin must formalize to the same wires as its English example).

| Date | Result |
| --- | --- |
| 2026-11-08 before G8 | 397/413 (16 residual) |
| 2026-11-08 after G8 | 408/413 (5 residual) |

Classes fixed in G8 (rules and data in `src/translate`, not single strings):
- indefinite genitive `unei|unui|unor + noun` renders `of a ...` / `of ...` (noun phrase parser, `ofNP`); inanimate definite genitives render `the X of Y`, seasons without article (`the months of spring`);
- feminine genitive `-ii` forms of `-ră/-ă` nouns (`primăverii`, `iernii`);
- `dublat|triplat|înjumătățit` (doubled, tripled, halved); `vreun|vreo` (any, plural in English);
- a comma between frame elements is skipped (`Da, are`; `Între Tom și Ana, cine ...`); `mai puține` comparison frames; `semn de stop`; `Citește-mi-l înapoi`; `Mă gândeam la X`;
- "Numește" at sentence start is the imperative (frame `numește {np}` = `name {np}`); a bare 3rd person stays `calls`.

Residual list (5), all avatar commands: the English examples themselves are UNPARSED by the engine (no world pattern), so the failure is a world gap and not a translation error:
- Open your eyes wide. | Deschide larg ochii.
- Look at me. | Uită-te la mine.
- Stop blinking. | Nu mai clipi.
- Start blinking. | Începe să clipești.
- Turn on your antenna. | Pornește-ți antena.

Known remaining translation gaps outside the test: genitives of nouns missing from the lexicon (`mașinii`, `pomului`).
