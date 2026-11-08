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

## Language detection without diacritics (L-RO)
`detectLanguage` (src/translate/index.mjs) scores Romanian against English evidence in points (a rough log-odds); Romanian is claimed at 2 or more points that beat the English evidence by 1, otherwise the caller keeps its session language (default English).
- Romanian evidence: a diacritic (2 per word); Romanian function words with weights (`sau`, `este`, `sunt`, `pentru`, `vreau`, `cum`, ... 2; `si`, `sa`, `cu`, `pe` 1.5; `nu`, `mai` 1.2; words that are also English, `cat`, `care`, `la`, `de`, `fa`, `pune`, `ce`, `da`, 0.3 to 1); lexicon words that are not English (0.5 to 2 by length, 2 with a Romanian ending); Romanian endings on unknown words of 5+ letters (-eaza, -easca, -ului, -ilor, -elor, -itate, -iune, ... 2; -este, -esti, -tie, -ul, -area, -irea ... 1.5); enclitics (`reseteaza-ti`, `arata-mi`).
- Collisions are resolved by context only: `cat` + (`face`/`fac` + number | `costa`, `sunt`, `este`, `e`, `ai`, `mai`, `de`, ...) is Romanian; `ce face`; `are` + number or Romanian noun and not after an English subject (`there`, `they`, `we`, `you`, `what`, `how` ...); `am` + (`o`, `un`, number, Romanian participle) when not next to `I`; `20 de`. Three or more solfege syllables (`do re mi fa sol la si`) switch the syllable weights off. The words `a`, `o`, `are`, `an`, `no`, `in`, `plus`, `ok`, `e` ... carry no evidence by themselves.
- Translation of diacritic-less text: `translateRoEn` resolves a few folded forms from the neighbours (`sa` before a subjunctive is `să`, not "his"; `tai` after a noun is `tăi`; `peste` after a determiner is `pește`; a first-word ambiguous verb is the imperative).
- Measured on the 413 Romanian equivalence twins with diacritics stripped: detected as Romanian 327 -> 387 (with diacritics 399), whole pipeline right (detect, translate, formalize to the same wires) 314 -> 377 (with diacritics 406). English: 0 of 1,647 messages (1,234 operational + the English twin side) detected as Romanian. Tests: tests/translate-diacritics.test.mjs.

## Browser language detection in the demo (2026-11-08)
User decision: where the browser has a built-in API, the demo uses it; our own code is the backup. Translation already worked this way; language detection now does too.
- `createSwitchTranslator` (docs/webchat/ui/translation.mjs) has a "Language detection" setting: `auto` (default: browser `LanguageDetector`, then the rules detector), `browser-api`, `rules`. The browser API is `self.LanguageDetector` (`availability()`, `create()`, `detect(text)`) or the older `self.ai.languageDetector`; the detector instance is cached.
- The top result is mapped to `{ lang: 'en' | 'ro' | 'unknown', confidence }`. Any other language is `unknown`, and so is a confidence below `DETECT_MIN_CONFIDENCE` = 0.5 (clear sentences score about 0.9, one or two words 0.3-0.6). The dialog engine keeps the session language on `unknown` (`DialogSession`, default English).
- The rules detector (`src/translate`) answers when the API is missing, still downloading (the first call starts the download), throws, or when the input has fewer than 3 letters (chat words such as "ok", "e", "da" are the rules detector's job). The trace shows `Detection: browser-api -> en (0.97)` or the fallback and its reason.
- `src/translate` is unchanged: the server, CLI and tests use only the rules detector. Tests: tests/webchat-detect.test.mjs (mocked `self.LanguageDetector`).
