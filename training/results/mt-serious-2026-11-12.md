# MT-SERIOUS (2026-11-12): an on-device translation model for browsers without a Translator API

Data: `training/results/mt-serious-2026-11-12.json` (the 80-reply sample for the reviewer to read is in it: `repliesSample` has the English reply and the Romanian reply the pipeline shows; `opusVsBergamotReplies` has the same 80 English replies through both engines with the checker's verdict). All Romanian numbers are the 2480-case `training/eval/operational-ro.jsonl`, the same judge as every operational run (right / partly / wrong / not understood), reasoner `matrix` unless a column says `ops`.

## 1. Baseline today, phone mode (no Translator API, no model)

`browserApis: { translator: false }` in the Chrome harness; `check-ro-replies --phone` and `measure-ro-fallback --phone` run the webchat's switch translator with no browser backend.

| | right | wrong | not understood | replies ending in the fixed line "Nu am încă o formulare…" |
| --- | --- | --- | --- | --- |
| matrix | 2029 (81.8%) | 77 | 326 | 207 of 2480 (8.3%) |
| ops | 2037 (82.1%) | 60 | 335 | 205 |

Nothing is rejected by a checker (there is no Translator); everything the rules and templates cannot say becomes the fixed line. Desktop mode with the harness's fake Translator (an ORACLE for ro to en, so an upper bound): matrix 2198 right (88.6%), 52 wrong, 192 not understood, 86 fixed lines, 297 readings and 142 replies by the Translator; ops 89.0%, 39 wrong, 84 fixed lines.

## 2. The engine for the no-Translator case: Bergamot, chosen

| | (a) Bergamot (bergamot-translator 0.4.9 WASM + Mozilla tiny models) | (b) Opus-MT quantized ONNX |
| --- | --- | --- |
| Licence | MPL-2.0 (engine, models) | CC-BY-4.0 (models), MIT (our onnxruntime-web) |
| Models for ro | `roen` and `enro` exist (tiny, flores BLEU 39.5 / 40.4; the Firefox registry has 54 languages with both directions) | `Xenova/opus-mt-en-ro` exists; `opus-mt-ro-en` does not (401): `opus-mt-ROMANCE-en` (a multilingual model) is the only ro to en |
| Download, ro pair, both directions | **29.7 MB** (gzip) + 5.2 MB WASM once | **about 220 MB** (en-ro 50 + 57 MB, ROMANCE-en 53 + 60 MB), plus our own decode loop and SentencePiece code to write |
| First load | Node 0.4 s (warm cache) to 1.6 s; Chrome 1x CPU 5.3 s, 4x CPU 11.2 s (gunzip, checksum, WASM start, two models; measured while the machine ran other jobs, files from disk) | Node 3.0 s per model; Chrome not measured (no browser build) |
| Per sentence | Node ro to en p50 25 ms (p95 73), en to ro p50 50 ms (p95 244); Chrome 4x CPU ro to en p50 55 ms (p95 233), en to ro p50 99 ms (p95 144) | Node (native onnxruntime) ro to en p50 185 ms (p95 513), en to ro p50 402 ms (p95 3640); WASM in a browser is slower still |
| ro to en reading, MT output only (identity stub in place of the rules), 2480 messages | right 1576 (**63.5%**), wrong 211, not understood 592 | right 1385 (**55.8%**), wrong 248, not understood 755 |
| en to ro replies, 80 sample replies, our checker | 80 of 80 pass | 66 of 80 pass |
| Reply quality | reads naturally on simple replies; errors on idioms ("A pig goes oink" gives "se înspăi", "3 flats" gives "3 apartamente", "Drew a green cat" gives "A escrocat"), see the sample | similar quality on simple sentences, "Open the diagram" gives "Open the bar", numbers written as words in ro to en ("Gather four by eight") fail the number checker |

Bergamot wins on every measured axis and on size by a factor of 7. Opus-MT is not worth a vendored decode loop. One caveat on the quality column: both are small distilled models; the numbers say what a phone gets, not what a large model would give.

## 3. What was integrated

See spec 06 "On-device translation model". Order: (a) the browser Translator for a pair it supports, (b) the on-device model, loaded lazily when the language is selected (never on the first-paint path, own worker, per-call deadline 2.5 s, restart after a missed deadline, Cache Storage, sha256 check, visible banner "Downloading the translation model for Romanian (30 MB)… 42%" with Retry on failure, a message sent meanwhile waits stoppably and the turn clock starts after), (c) nothing else. The checker keeps numbers, names, negation and question form; it was made less strict where it rejected good translations (names translated by the model such as Japan to Japonia, auxiliary verbs read as question words in our own replies, German noun capitalisation) and stricter for mangled quotes. The engine reads and writes any language; only Romanian has rules.

Chrome at 4x CPU, phone mode (`scripts/test-webchat-phone.mjs`): lazy (no request with English selected), five Romanian messages answered in Romanian without the fixed line (first message 457 ms when the model is already on disk, 2.5 s for the longest diagram reply), model reused from Cache Storage after a reload, an unreachable bucket gives the banner with Retry and the rules still answer.

## 4. Remove the hacks: NOT done, the model is not at least equal

| reading of `operational-ro` | right | wrong | not understood |
| --- | --- | --- | --- |
| rules only (today) | 81.8% | 77 | 326 |
| **model only** (the state after deleting the rules translator) | **63.5%** | 211 | 592 |
| rules first, the model for a poor reading (integrated) | **85.4%** | 85 | 242 |
| ops reasoner: rules / model only / hybrid | 82.1% / 64.2% / 82.1% | 60 / 201 / 60 | 335 / 584 / 335 |

Deleting the Romanian tables, the pre-pass and the Romanian reading patches would lose 18 points of right answers and add 134 wrong ones. Per the task's rule nothing was deleted: no Romanian table, no template, no `userWordMap`, no `ro-generic` line (it stays as the last resort of a Romanian session; for any other language the reply stays English, never that line). Replies (check-ro-replies classification of what is shown, 2480 cases, matrix):

| replies | Romanian | English kept | mixed | broken quotes | fixed line |
| --- | --- | --- | --- | --- | --- |
| phone today (rules, templates, fixed line) | 2323 | 0 | 0 | 0 | **207** |
| integrated (rules and templates, then the model) | 2323 | 0 | 0 | 0 | **25** |
| model only (Romanian templates switched off) | 2323 | 0 | 0 | 0 | 175 |

Replies by the model only already end in the fixed line less often than the templates alone (175 against 207), so a removal of the reply templates is closer than the reading: what holds it back is the 175 replies the checker or the English-leftover test rejects (mostly "English words left" for app words such as "visor" and "bar chart", and numbers written as words). The reading is the real gap: 18 points. A next step that could close it: train or adapt the model on the app's phrases (a fine-tune of the Marian student on our paraphrase data), which only the training side can do.

## 5. Languages (item 6)

The registry gives 54 languages with both directions with English, 29.5 to 75.3 MB per pair (download size, gzip; `vendor/bergamot/registry.json`): af ar be bg bn ca cs da de el es et eu fa fi fr gl gu he hi hu id is it ja kn ko lt lv ml mr ms nb nl no pl pt ro ru sk sl sq sv ta te th tl tr ug uk ur vi zh zh_hant. mt and nn have one direction only and are not listed. The browser Translator's list cannot be measured here: headless Chrome 157 and Chromium 154 in this sandbox expose no `Translator`; the code asks `Translator.availability()` per pair live, for the registry's languages and Romanian.

Gate: the English operational sample (216 cases, every 6th) is translated English to X and back by the model and read by the English engine; English itself reads 95.8% right. **No language reaches 80%.** The best are fr 75.9%, it 74.5%, nb 73.1%, de 72.7%, nl 72.2%, is 71.8%, bg 71.3%, es 71.3%; Romanian 61.1%; the worst are ug 38.4%, ml 50.0%, zh_hant 50.9%. The gate is implemented as asked, so the selector shows English and Romanian (Romanian is always listed: it has its own rules, the round trip does not describe it), and Settings > Language has "Show every language of the translation engine" to list the others with their number; Settings > About lists every language with its number. **Decision needed**: lower the gate (for example 70%, which lists fr, it, nb/no, de, nl, is, bg, es, tl, pt: 11 codes) or keep 80% and improve the model. The round trip is a harsh test (two translations, a strict judge on UI words), so 80% may be too high for tiny models; it is a one-constant change (`QUALITY_GATE` in `ui/translation-ui.mjs`, the number is also in `quality.json`).

Speech follows the selector: the recognition and synthesis tag comes from the language code (`zh_hant` is `zh-TW`, `tl` is `fil-PH`); where the browser has no voice for the language one note says so once and typing keeps working. Not done: spoken switch commands for the new languages ("speak German": `lex.ui.shell.langs` has en and ro only; the selector is the way).
