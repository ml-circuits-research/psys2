# training/eval

## form-pairs.jsonl

Aligned pairs `{canonical, variant, same_meaning, source, judged, id}` for learning paraphrase (form) operators. Built from existing data only by
`node scripts/build-form-pairs.mjs` (reproducible; deduped on canonical+variant; tests in `tests/form-pairs.test.mjs`). No text is written by hand.

| source | pairs | same_meaning | how judged |
| --- | --- | --- | --- |
| `paraphrases-rt` | 146 | 85 true, 61 false | `meaning` field of `paraphrases-rt-2026-11-12.jsonl` (judged by hand earlier): canonical = original, variant = round-trip text |
| `owner-log` | 4 | true | adjacent owner turns (same tab, within 90 s): a failed fragment, then the turn that worked (canonical). `judged:"reading"` where the failed turn's content words all survive in the fix and its annotation says what was meant; `"unsure"` without annotation (none today) |
| `cousins` | 584 | false | failed cousins (outcome not right) in `training/results/cousins/*.json` against their canonical case (`dimension`: filler kind / aspect); a cousin changes the meaning by construction, `judged:"reading"` |

Total 734. The owner logs carry no `correction`/`correctionOf` flags (those exist only in live phrase records, not in the committed logs), so the owner-log
source is small; more will appear when phrase logs with correction flags are exported (extend `ownerPairs`). Cousins that passed are not included.
