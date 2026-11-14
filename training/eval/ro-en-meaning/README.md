# ro-en-meaning: a Romanian <-> English parallel set at the level of the app's requests and questions, with the MEANING of each row

Built 2026-11-14 for questions.md Q13 (translation by grammar worlds, meaning first). **10,259 rows**, each a Romanian sentence, the English it means, the tab and the setup it is said in, and the **meaning of the English side as the current rules reader reads it** (world, act, every role). "Meaning kept" is then judged by comparing readings, not strings: a translation path turns the Romanian into English, the same reader reads that English in the same tab and state, and the reading must equal the reference reading. Fluency is not scored. Romanian appears here only as DATA of the corpus (AGENTS.md language rule); every key and comment is English.

Files: `rows.jsonl` (the set), `gold-real.tsv` (English glosses written by hand for real owner phrases), `real-ro.tsv` (the Romanian phrases of the owner logs and the failure ledger, with the English the old paths produced, for reference), `gold-talk.tsv` (the Talk questions, English and hand-written Romanian), `hand-checked.tsv` (the rows read by a person), `results-2026-11-14.json` (the measured table). Rebuild: `node scripts/build-ro-en-meaning.mjs --bergamot <cache dir>`; measure: `node scripts/measure-ro-en-meaning.mjs ...`; merge the table: `node scripts/ro-en-merge-report.mjs <rows files>`.

## Sources (rows per source; the reference reading is complete for the rows in brackets)

| source | rows | Romanian from | English from | notes |
| --- | --- | --- | --- | --- |
| `operational` | 2,480 (2,222) | `training/eval/operational-ro.jsonl` (written by an agent earlier: diacritics and casual variants, 1,240 sources) | `training/eval/operational.jsonl` message, with its tab and its setup | the DEV SET of the rules translator: it was tuned on these sentences |
| `canon` | 1,761 (1,638) | `training/paraphrases/ro/*.canon.jsonl` (three Romanian renderings per English sentence, the last casual) | the `en` of the canon file, in the main tab of its world | not the dev set of the rules translator, but the same authoring hand |
| `real` | 161 (141) | the owner's real phrases (owner logs 11-13, failure ledger, real-phrase files): typos, no diacritics, speech-to-text slips | **glossed by hand** (`gold-real.tsv`: what the owner meant) | 161 of 381 candidate phrases glossed; the rest are fragments, other languages or speech noise and were left out |
| `talk` | 118 (108) | hand-written Romanian (`gold-talk.tsv`) | the Talk questions of `scripts/exp-talk.mjs` plus the frequent templates | tab `talk` |
| `template` | 1,438 (1,368) | `scripts/ro-en-templates.mjs`: hand-curated templates with the morphology done by small tables (gender, plural, definite, genitive, colour agreement, number + noun), NOT by the repository's translators | the template's English side | in-distribution for the grammar prototype (written by the same hand, same frames): read its numbers as a ceiling |
| `grid` | 4,009 (3,581) | **machine**: the rules translator en -> ro (`.r`) and the on-device model en -> ro (`.m`) | the sentences the coverage grid generates from the schemas (`docs/webchat/coverage-grid.json`: forms x k.actions verbs x kinds) in the world's tab with its setup | the Romanian is often poor ("Un Lay shoulders a chemat Yan"): these rows measure robustness to noisy Romanian, not translation of a person |
| `roundtrip` | 292 (270) | **machine**, as for `grid` | the `original` English of `paraphrases-rt-2026-11-12.jsonl` (stories, mixed questions) | |

`ro_by` says who wrote the Romanian: `authored`, `hand`, `owner` (5,477 reference-read rows: the "hand Romanian" part of the tables) or `rules-en-ro`, `bergamot-en-ro` (machine, 3,851). 931 rows have no complete reference reading (the rules reader does not read the English: spelling slips in the owner's phrases, frames only the neural reader knows); they stay in the file with `ref.complete: false` and are left out of the measures.

## How the meaning is derived

`scripts/lib/meaning.mjs`: the rules formalizer reads the English on a FORK of a session in the row's tab and with the row's setup replayed (English, same session state for the reference and for every candidate), nothing is executed. The reading is the segments' (world, wires): `world | type action arg.role=value ...`, with the sentence text, the pattern id, the source span and the sequence number dropped (surface only), strings lower-cased, a leading article dropped from a value, number words turned into digits. Two English sentences "mean the same" when these strings are equal; a candidate is `kept` (same reading), `act` (the same act, another role value: often a synonym, "near" / "next to", "a" / "the"), `other` (another act) or `unread` (the reader does not read it completely); a path that produced nothing is `abstain`. `kind` of a row (`command`, `question`, `fragment`, `multi`) comes from the reference reading (a question wire or an `ask` act; more than one segment; a short sentence with a setup).

## What was checked by hand, and the limits

- `hand-checked.tsv`: 81 rows (a stratified sample, `node scripts/ro-en-sample.mjs 9 7`) read by a person (the coding agent), Romanian against English against the reading: 65 ok, 11 `ro-broken` (all machine Romanian: `grid` and `roundtrip`), 5 `ref-doubtful` (Romanian and English agree, the rules reader's reading of the English is itself odd, e.g. "give me 5 clouds" read as a drawing placed at "me", "make the body green and the eyes square" read as one thing). Every hand-written row of the sample (operational, canon, real, talk, template) had the right meaning.
- The reading is the INSTRUMENT, not a gold standard: the rules reader is the only formalizer measured. English the neural dispatcher / normalizer would understand but the rules do not counts as `unread`: the numbers below are the share the RULES reader reads as the reference, a lower bound for the app's real chain (which has the neural reader behind the rules). Strict by design: a different role value counts as not kept.
- `operational` is the rules translator's development set: its numbers are optimistic for the rules paths. `template` is the grammar prototype's development set. Report `canon`, `real` and `talk` for the paths that were not tuned on them.
- Rows are not deduplicated across casual / diacritic variants and across the three renderings of a canon sentence (they are different inputs for the same meaning).

## Measured today (9,328 rows with a reference reading; kept % / act-kept % = same act, any roles)

| path | all | hand Romanian (5,477) | machine Romanian (3,851) | command | question | multi | fragment |
| --- | --- | --- | --- | --- | --- | --- | --- |
| rules translator | 51.5 / 68.8 | 63.0 / 74.5 | 35.0 / 60.6 | 42.5 | 57.8 | 72.8 | 58.2 |
| on-device model (Bergamot ro-en, raw) | 43.6 / 63.6 | 49.2 / 64.3 | 35.6 / 62.7 | 42.8 | 46.8 | 34.5 | 45.6 |
| M4 rules + repaired (no model) | 51.4 / 68.9 | 63.2 / 74.9 | 34.7 / 60.4 | 42.5 | 58.0 | 72.8 | 57.9 |
| M4 with the model (the shipped chain) | 55.7 / 77.2 | 65.6 / 80.5 | 41.6 / 72.5 | 49.9 | 63.5 | 64.3 | 56.5 |
| grammar prototype alone (answers 19.7 % of rows) | 16.9 / 18.9 | 25.8 / 28.5 | 4.4 / 5.1 | 19.3 | 19.5 | 16.1 | 5.7 |
| grammar, then rules | 52.7 / 68.9 | 65.0 / 74.8 | 35.1 / 60.6 | 44.6 | 58.2 | 73.2 | 58.5 |
| grammar, then M4 with the model | 58.0 / 78.2 | 69.4 / 82.3 | 41.9 / 72.3 | 52.7 | 65.2 | 68.8 | 57.5 |
| best of (rules, model, grammar), a bound | 65.9 / 78.0 | 76.6 / 83.8 | 50.7 / 69.7 | 59.8 | 71.4 | 77.6 | 70.2 |

By source (kept %): operational rules 71.3, model 42.9, M4+model 69.4; canon rules 42.2, model 49.8, M4+model 58.2, grammar chain 58.5; real 34.8 / 36.9 / 41.8 / 44.7; talk 50.9 / 63.9 / 70.4 / 74.1; template 78.4 / 58.9 / 70.3 / 82.4; grid 35.8 / 36.7 / 42.4 / 42.6; roundtrip 24.1 / 20.7 / 31.1 / 31.5 (full table: `results-2026-11-14.json`).

The browser Translator API does not exist in Node: it is not measured here (the owner's log rows carry its English where it ran; `scripts/m4-measure.mjs --logged` replays it).

On the 1,839 rows the grammar path answered, every path on the same rows: grammar 85.9 kept, rules 79.7, M4+model 74.0, model 58.8 (template rows 90.5 / 81.1 / 75.2 / 62.9; hand-written, non-template rows 83.1 / 81.8 / 74.5 / 49.2).
