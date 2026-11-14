# training/eval

## form-pairs.jsonl

Aligned pairs `{canonical, variant, same_meaning, source, judged, id}` for learning paraphrase (form) operators. Built from existing data only by
`node scripts/build-form-pairs.mjs` (reproducible; deduped on canonical+variant; tests in `tests/form-pairs.test.mjs`). No text is written by hand.

| source | pairs | same_meaning | how judged |
| --- | --- | --- | --- |
| `paraphrases-rt` | 146 | 85 true, 61 false | `meaning` field of `paraphrases-rt-2026-11-12.jsonl` (judged by hand earlier): canonical = original, variant = round-trip text |
| `owner-log` | 4 | true | adjacent owner turns (same tab, within 90 s): a failed fragment, then the turn that worked (canonical). `judged:"reading"` where the failed turn's content words all survive in the fix and its annotation says what was meant; `"unsure"` without annotation (none today) |
| `cousins` | 476 | true | failed cousins of the loose-wording cases (`2026-11-14-paraphrases-animal-sound.json`) paired with the PASSING cousin of the clean-wording run (`2026-11-14-clean-animal-sound.json`, "what sound does a cow make", degree 3, matrix, vendored library) with the same (key, answer) = same filler and aspect. 175 `judged:"reading"` (single request in loose wording), 301 `"unsure"` (the loose case has another clause, e.g. a second question or digits; the judge scores only the sound request). 216 failed rows (ops and matrix counted separately) had no passing canonical and were dropped |

Total 626. The clean run is rerun by `node scripts/cousins.mjs --case "what sound does a cow make" --degree 3 --reasoner matrix --facts k.animals --tab talk --out training/results/cousins/2026-11-14-clean-animal-sound.json`. The owner logs carry no `correction`/`correctionOf` flags (those exist only in live phrase records, not in the committed logs), so the owner-log
source is small; more will appear when phrase logs with correction flags are exported (extend `ownerPairs`). Cousins that passed are not included.
