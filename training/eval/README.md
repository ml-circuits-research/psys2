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

## typos-real-2026-11-15.jsonl

The REAL typo set that measures the contextual spell repair (reviewer 2026-11-15 16:50, Q39 S1). Every row is a real user message (no synthetic noise), hand-judged: rows come from the real set (`real-2026-11-15.jsonl`: owner logs a/b/c, phrase-log exports, first dialogues, real dialogues) and the two owner sessions (`owner-2026-11-15T0734-checks.jsonl` Romanian, `owner-2026-11-15T1143-checks.jsonl` English; ids `o0734-tNN`, `o1143-tNN`). Row: `{id, source, lang, text, tab, typos:[{from, to, why}], confidence}`; `to` is the intended word judged from the message, the tab and the previous turns. `confidence` is `sure` or `likely` (doubtful: real-word slips such as sare/soare, had/hat, or unclear intent). Control rows have `typos: []` and a `control` note: names, node labels, app words, numbers, tic-tac-toe cells, British spellings and Romanian without diacritics (stinga, pamint, creaza: NOT typos); a repair on them is wrong. Speech-recognition garble of the voice logs is not included (it is not a typo of one word).

Counts: 100 rows = 63 typo rows (80 typo words) + 37 controls. By language: typo rows ro 28, en 35; controls ro 17, en 20. By source (typo / control): owner-log 27 / 9, phrase-log exports 11 / 9, first dialogues 12 / 4, owner sessions 13 / 12, real dialogues 0 / 3. Typo rows: sure 50, likely 13.

Metric: run the repair on `text` (with the tab as context) and score each row as `right` (every typo repaired to `to`, nothing else changed), `wrong` (a changed word that is not the intended one, or any change on a control row), `asked` (the system asked instead of repairing) or `missed` (no repair, no question). Report counts of right / wrong / asked / missed, per language and per confidence. A wrong repair counts most: the primary figure is the wrong rate (it should stay near zero, controls included); the second is right / typo rows; `asked` is acceptable and better than wrong. `likely` rows are reported separately and never gate.
