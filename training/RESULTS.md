# Training results

## Operational headline

The single measure of success: **the share of messages whose final state/answer is right**, through the pipeline in the webchat configuration (encoder formalizer = dispatcher via onnxruntime-node from the published `docs/webchat/models/dispatcher/`, spellcheck, partial understanding, acceptRefused). Fixed committed set `training/eval/operational.jsonl` (1234 messages, built from `training/eval/cases/*.mjs` by `scripts/build-operational.mjs`; expectations written by judgment of the correct outcome, not recorded from output; `known_gap` marks things the world cannot support yet: they still count). Runner: `node scripts/eval-operational.mjs [--rules-only] --ort <onnxruntime-node entry> [--model-dir D] [--edit-tau T] [--json]`; results in `training/results/operational-{rules-only,full}.json`. Outcomes: right / partly right / wrong action (it acted or answered, result wrong: worse) / not understood.

No real phrase-log messages were available (`training/phrase-logs/` is empty); the set is authored. Rules-only run: 1 min; full pipeline: 11.6 min (single thread).

| config | n | right % | partly % | wrong % | not understood % | latency mean / p50 / p95 ms |
|---|---|---|---|---|---|---|
| rules-only (spell+partial) | 1234 | 84.3 | 1.9 | 3.6 | 10.3 | 41 / 13 / 162 |
| full pipeline (current main) | 1234 | 89 | 0.5 | 4.3 | 6.2 | 519 / 337 / 1566 |

Excluding the 117 known-gap messages: rules-only right 87.5 %, full 92.5 % (wrong 2.1 / 2.7 %).

### By world group (rules-only | full)

| group | n | right % rules | right % full | wrong % rules | wrong % full | not understood % rules | not understood % full | partly % rules | partly % full |
|---|---|---|---|---|---|---|---|---|---|
| kids | 501 | 89.2 | 93.2 | 1.6 | 2 | 6.6 | 4.6 | 2.6 | 0.2 |
| avatar/shell/editor | 232 | 76.3 | 78.9 | 6.9 | 9.1 | 15.9 | 11.2 | 0.9 | 0.9 |
| music/draw/map/charts | 332 | 81 | 89.8 | 3.3 | 3.6 | 13.3 | 5.7 | 2.4 | 0.9 |
| games | 145 | 86.2 | 88.3 | 5.5 | 6.2 | 8.3 | 5.5 | 0 | 0 |
| documents | 24 | 91.7 | 91.7 | 4.2 | 4.2 | 4.2 | 4.2 | 0 | 0 |

### By world (right %, rules-only | full)

| world | n | rules | full |
|---|---|---|---|
| art.draw | 99 | 71.7 | 82.8 |
| data.charts | 57 | 82.5 | 89.5 |
| docs.editor | 43 | 65.1 | 72.1 |
| docs.reader | 24 | 91.7 | 91.7 |
| games.chess | 41 | 87.8 | 87.8 |
| games.guess | 29 | 96.6 | 96.6 |
| games.hangman | 32 | 84.4 | 84.4 |
| games.tictactoe | 43 | 79.1 | 86 |
| geo.map | 94 | 88.3 | 94.7 |
| kids.animals | 80 | 90 | 93.8 |
| kids.arith | 145 | 90.3 | 91.7 |
| kids.common | 36 | 94.4 | 94.4 |
| kids.shapes | 62 | 87.1 | 96.8 |
| kids.shop | 43 | 83.7 | 83.7 |
| kids.tasks | 38 | 86.8 | 97.4 |
| kids.time | 97 | 89.7 | 94.8 |
| media.music | 82 | 82.9 | 92.7 |
| ui.avatar | 124 | 69.4 | 73.4 |
| ui.help | 20 | 95 | 90 |
| ui.shell | 45 | 97.8 | 95.6 |

### By family (right %, rules-only | full; families overlap)

| family | n | rules | full |
|---|---|---|---|
| abbrev | 24 | 70.8 | 75 |
| compare | 8 | 100 | 100 |
| coordinates | 14 | 64.3 | 71.4 |
| count | 6 | 100 | 100 |
| decimal | 15 | 86.7 | 86.7 |
| ellipsis | 8 | 75 | 75 |
| messy | 231 | 93.5 | 97 |
| multi | 197 | 71.6 | 92.9 |
| negative | 21 | 95.2 | 95.2 |
| negative-numbers | 1 | 100 | 100 |
| number-words | 7 | 100 | 100 |
| paraphrase | 174 | 77 | 78.7 |
| probe | 55 | 74.5 | 76.4 |
| reference | 28 | 71.4 | 75 |
| repeat-undo | 26 | 65.4 | 61.5 |
| self-correction | 20 | 20 | 30 |
| shared-arg | 13 | 53.8 | 69.2 |
| triple | 22 | 72.7 | 100 |
| typo | 38 | 60.5 | 68.4 |
| user-example | 7 | 100 | 100 |
| word-problem | 86 | 87.2 | 87.2 |
| world-switch | 188 | 80.3 | 99.5 |

Reading: the dispatcher mainly helps multi-command and world-switching messages (multi 71.6 to 92.9, world-switch 80.3 to 99.5) and draw/music/charts; self-correction (20 / 30 %), shared argument, typos, repeat-undo and the avatar world stay weak, and the full pipeline raises wrong actions slightly (3.6 to 4.3 %).


All numbers trace to `training/results/*.json`. Two rule baselines are kept side by side:

- **before widening (055fbeb)**: `training/results/rules-055fbeb.json`. Its test splits come from the dataset built at that commit.
- **c989cd1 (current baseline, B1)**: `training/results/rules.json`; worlds/ and src/ are unchanged since (only `src/dialog/dispatch-validate.mjs` was added by D2). Dataset rebuilt at c989cd1 in `training/dataset/` (40,748 records: train 31,442 / dev 4,684 / test 4,622), so the test splits differ from the 055fbeb ones (different record sets, hence the n columns).

**Contamination.** The c989cd1 rules were widened by reading all paraphrase records, including the test split, so the c989cd1 paraphrase test numbers are optimistic. The clean paraphrase measure is the held-out set (below).

## T2 - Rule baseline on the test splits

Command: `node scripts/eval-rules.mjs` (about 30 s on 20 cores, deterministic: two runs give identical rules.json; failures go to `training/runs/rules-failures.jsonl`, gitignored). One run now produces the test splits, the routing rows and the held-out set.

- **restricted**: rule formalizer limited to the record's world (and imports): the ceiling of the rule formalizer.
- **routed**: dialog session over all worlds with the current rule router and the record's tab: the baseline every model must beat.
- Positive correct = all segments parsed and id-normalized SOP equals the target. Negative correct = the record's world does not claim the text (restricted: nothing parsed; routed: no segment matched by that world or its imports).
- Context: the record's `context` messages are formalized first, in a fresh session; the tab is the record's tab (generator and rule-derived records have none).

### Exact-SOP accuracy (%), 055fbeb (before widening) vs c989cd1

**Total and by source (positives n / restricted % / routed %)**

| | 055fbeb pos n | restr % | routed % | c989cd1 pos n | restr % | routed % | 055fbeb neg restr/routed | c989cd1 neg restr/routed |
|---|---|---|---|---|---|---|---|---|
| all | 4242 | 88.7 | 88.3 | 4301 | 94.1 | 93.4 | 98.1 / 98.1 (412) | 97.5 / 97.5 (321) |

**by source**

| | 055fbeb pos n | restr % | routed % | c989cd1 pos n | restr % | routed % | 055fbeb neg restr/routed | c989cd1 neg restr/routed |
|---|---|---|---|---|---|---|---|---|
| paraphrase | 684 | 30.1 | 30.4 | 636 | 60.4 | 61.0 | - | - |
| rule-derived | 314 | 100.0 | 94.0 | 422 | 100.0 | 94.3 | - | - |
| generator | 3244 | 100.0 | 100.0 | 3243 | 100.0 | 99.7 | 98.1 / 98.1 (412) | 97.5 / 97.5 (321) |

**By world group**

| | 055fbeb pos n | restr % | routed % | c989cd1 pos n | restr % | routed % | 055fbeb neg restr/routed | c989cd1 neg restr/routed |
|---|---|---|---|---|---|---|---|---|
| kids | 1557 | 93.3 | 93.3 | 1589 | 97.9 | 97.8 | 99.7 / 99.7 (291) | 99.5 / 99.5 (200) |
| avatar/shell/editor | 511 | 84.3 | 84.3 | 501 | 88.6 | 88.6 | 100.0 / 100.0 (24) | 100.0 / 100.0 (24) |
| music/draw/map/charts | 1041 | 84.9 | 83.5 | 1068 | 86.8 | 85.3 | 97.6 / 97.6 (41) | 97.6 / 97.6 (41) |
| games | 827 | 83.6 | 83.8 | 837 | 97.5 | 96.4 | 89.3 / 89.3 (56) | 89.3 / 89.3 (56) |
| documents | 306 | 100.0 | 98.7 | 306 | 100.0 | 98.7 | - | - |

**By world**

| | 055fbeb pos n | restr % | routed % | c989cd1 pos n | restr % | routed % | 055fbeb neg restr/routed | c989cd1 neg restr/routed |
|---|---|---|---|---|---|---|---|---|
| art.draw | 215 | 70.2 | 64.2 | 215 | 69.8 | 64.6 | 97.6 / 97.6 (41) | 97.6 / 97.6 (41) |
| data.charts | 270 | 96.3 | 95.9 | 276 | 96.4 | 96.0 | - | - |
| docs.editor | 115 | 67.8 | 67.8 | 116 | 70.7 | 70.7 | - | - |
| docs.reader | 306 | 100.0 | 98.7 | 306 | 100.0 | 98.7 | - | - |
| games.chess | 366 | 92.3 | 92.9 | 375 | 96.3 | 96.8 | - | - |
| games.guess | 135 | 60.0 | 60.0 | 130 | 99.2 | 99.2 | 89.3 / 89.3 (28) | 89.3 / 89.3 (28) |
| games.hangman | 188 | 100.0 | 100.0 | 188 | 100.0 | 100.0 | 89.3 / 89.3 (28) | 89.3 / 89.3 (28) |
| games.tictactoe | 138 | 60.9 | 60.9 | 144 | 95.8 | 88.2 | - | - |
| geo.map | 341 | 95.6 | 95.6 | 341 | 95.9 | 95.9 | - | - |
| kids.animals | 258 | 93.0 | 93.0 | 260 | 98.9 | 98.9 | - | - |
| kids.arith | 230 | 93.0 | 93.0 | 240 | 98.8 | 98.8 | 100.0 / 100.0 (28) | 100.0 / 100.0 (28) |
| kids.common | 54 | 16.7 | 16.7 | 61 | 68.8 | 65.6 | 100.0 / 100.0 (147) | 100.0 / 100.0 (147) |
| kids.shapes | 196 | 86.7 | 86.7 | 203 | 96.1 | 96.1 | 99.1 / 99.1 (116) | 96.0 / 96.0 (25) |
| kids.shop | 259 | 100.0 | 100.0 | 264 | 100.0 | 100.0 | - | - |
| kids.tasks | 293 | 100.0 | 100.0 | 294 | 100.0 | 100.0 | - | - |
| kids.time | 267 | 100.0 | 100.0 | 267 | 100.0 | 100.0 | - | - |
| media.music | 215 | 68.4 | 67.9 | 236 | 78.0 | 76.3 | - | - |
| ui.avatar | 79 | 67.1 | 67.1 | 71 | 88.7 | 88.7 | - | - |
| ui.help | 95 | 100.0 | 100.0 | 95 | 100.0 | 100.0 | - | - |
| ui.shell | 222 | 92.3 | 92.3 | 219 | 93.2 | 93.2 | 100.0 / 100.0 (24) | 100.0 / 100.0 (24) |

**Positives by world and source, c989cd1 (restricted / routed %, n)**

| world | generator | paraphrase | rule-derived |
|---|---|---|---|
| art.draw | 100.0 / 100.0 (49) | 45.4 / 48.7 (119) | 100.0 / 68.1 (47) |
| data.charts | 100.0 / 100.0 (247) | 9.1 / 9.1 (11) | 100.0 / 94.4 (18) |
| docs.editor | 100.0 / 100.0 (51) | 22.7 / 22.7 (44) | 100.0 / 100.0 (21) |
| docs.reader | 100.0 / 100.0 (292) | - | 100.0 / 71.4 (14) |
| games.chess | 100.0 / 100.0 (292) | 68.2 / 72.7 (44) | 100.0 / 100.0 (39) |
| games.guess | 100.0 / 100.0 (45) | 98.7 / 98.7 (74) | 100.0 / 100.0 (11) |
| games.hangman | 100.0 / 100.0 (188) | - | - |
| games.tictactoe | 100.0 / 77.5 (49) | 91.9 / 91.9 (74) | 100.0 / 100.0 (21) |
| geo.map | 100.0 / 100.0 (299) | 36.4 / 36.4 (22) | 100.0 / 100.0 (20) |
| kids.animals | 100.0 / 100.0 (228) | 86.4 / 86.4 (22) | 100.0 / 100.0 (10) |
| kids.arith | 100.0 / 100.0 (199) | 85.0 / 85.0 (20) | 100.0 / 100.0 (21) |
| kids.common | - | 64.8 / 61.1 (54) | 100.0 / 100.0 (7) |
| kids.shapes | 100.0 / 100.0 (159) | 75.0 / 75.0 (32) | 100.0 / 100.0 (12) |
| kids.shop | 100.0 / 100.0 (251) | - | 100.0 / 100.0 (13) |
| kids.tasks | 100.0 / 100.0 (293) | - | 100.0 / 100.0 (1) |
| kids.time | 100.0 / 100.0 (264) | - | 100.0 / 100.0 (3) |
| media.music | 100.0 / 100.0 (50) | 33.3 / 33.3 (78) | 100.0 / 96.3 (108) |
| ui.avatar | - | 61.9 / 61.9 (21) | 100.0 / 100.0 (50) |
| ui.help | 100.0 / 100.0 (92) | - | 100.0 / 100.0 (3) |
| ui.shell | 100.0 / 100.0 (195) | 28.6 / 28.6 (21) | 100.0 / 100.0 (3) |

### Held-out paraphrase set (primary paraphrase metric)

`training/paraphrases/heldout/out/*.jsonl`, never used for rules or training. Evaluated like the test splits (record context and tab, target = `expected_circuit`), as source `heldout`, in the `heldout` section of rules.json. `needs_review` records are excluded: **73** (by world: data.charts 1, docs.reader 66, games.guess 1, games.hangman 1, games.tictactoe 2, geo.map 1, kids.common 1). Evaluated: 2255 positives. Overall: restricted 49.4%, routed 50.4%. (The reviewer's 45% figure counts variants only, from the labelling pass; this table includes the canonical records and uses exact SOP.)

| | n | restricted % | routed % |
|---|---|---|---|
| group kids | 770 | 58.1 | 57.9 |
| group avatar/shell/editor | 440 | 38.9 | 40.5 |
| group music/draw/map/charts | 440 | 41.8 | 42.3 |
| group games | 440 | 57.5 | 62.1 |
| group documents | 165 | 35.1 | 32.7 |
| art.draw | 110 | 38.2 | 38.2 |
| data.charts | 110 | 46.4 | 46.4 |
| docs.editor | 110 | 35.4 | 35.4 |
| docs.reader | 165 | 35.1 | 32.7 |
| games.chess | 110 | 54.5 | 54.5 |
| games.guess | 110 | 68.2 | 75.4 |
| games.hangman | 110 | 56.4 | 61.8 |
| games.tictactoe | 110 | 50.9 | 56.4 |
| geo.map | 110 | 47.3 | 47.3 |
| kids.animals | 110 | 47.3 | 47.3 |
| kids.arith | 110 | 55.5 | 54.5 |
| kids.common | 110 | 53.6 | 53.6 |
| kids.shapes | 110 | 71.8 | 71.8 |
| kids.shop | 110 | 60.9 | 60.9 |
| kids.tasks | 110 | 45.5 | 45.5 |
| kids.time | 110 | 71.8 | 71.8 |
| media.music | 110 | 35.4 | 37.3 |
| ui.avatar | 110 | 47.3 | 46.4 |
| ui.help | 110 | 26.4 | 29.1 |
| ui.shell | 110 | 46.4 | 50.9 |

### World routing (routing.jsonl, test rows, rule router), 055fbeb vs c989cd1

Correct = routed world (world of the first parsed segment) equals `world` or is in `alt_worlds`; a row nothing parses counts as wrong. Context per row: tab, recent_worlds, session messages.

| subset | 055fbeb | c989cd1 |
|---|---|---|
| all | 3804/4241 = 89.7% (353 not parsed) | 4096/4300 = 95.3% (112 not parsed) |
| text not in routing train (Q1) | 3636/4052 = 89.7% (344 not parsed) | 3867/4054 = 95.4% (108 not parsed) |
| text also in train | 168/189 = 88.9% (9 not parsed) | 229/246 = 93.1% (4 not parsed) |
| real context (paraphrases, not synthetic) | 292/684 = 42.7% (347 not parsed) | 483/636 = 75.9% (105 not parsed) |
| group kids | 1446/1557 = 92.9% (94 not parsed) | 1547/1589 = 97.4% (24 not parsed) |
| group avatar/shell/editor | 438/511 = 85.7% (63 not parsed) | 452/501 = 90.2% (37 not parsed) |
| group music/draw/map/charts | 922/1040 = 88.6% (82 not parsed) | 978/1067 = 91.7% (42 not parsed) |
| group games | 696/827 = 84.2% (110 not parsed) | 817/837 = 97.6% (5 not parsed) |
| group documents | 302/306 = 98.7% (4 not parsed) | 302/306 = 98.7% (4 not parsed) |

## D3 - Dispatcher + validation, end-to-end evaluation

Commit/inputs: DistilBERT dispatcher (`training/runs/dispatcher-distilbert`, D1), predictions `training/runs/dispatch-pred/{test,heldout}.jsonl` (10,877 messages: 4,622 world test records, 4,000 multi-command messages, 2,255 held-out paraphrases), rules at baseline c989cd1. Command: `node scripts/eval-dispatch.mjs --name distilbert` (about 9 minutes with 20 workers), report `training/results/dispatch-distilbert.json` (ModernBERT: `dispatch-modernbert-full.json`). Rerun identical (byte for byte on the kids sample). Reviewer rerun from committed files (kids sample, 347 messages, 0.9 MB, about 30 s): `node scripts/eval-dispatch.mjs --pred training/results/dispatch-pred-kids-sample.jsonl --name kids-sample` (needs the dataset: `node scripts/build-dataset.mjs && python -m psys2_train.multicmd`); the sample is made by `node scripts/make-dispatch-sample.mjs`. Simplification mode (C): not available yet, no prediction carries a `simplified` text, so C = B in every table.

Policies: **Br** = dispatcher top-3 + validation, `acceptRefused` on (lead policy, Q3); **B** = the same with the strict rule. **R** = rules only (the current router, one dialog session over all worlds, no dispatcher). **Brf** = Br followed by the engine fallback of spec 03 section 7.7: when the validator does not understand the message, the rules over all worlds read it (R). Brf is approximated on the whole message; the real engine retries only the pieces nobody validated.

### Headline: user-perceived understanding (realistic messages)

Share (%) of realistic positive messages that end in: **right** (exact SOP) / **fallback** ("not understood / Did you mean ...?") / **wrong** (understood, other SOP, confidently wrong). Trained on: the dispatcher on `routing.jsonl` train rows (generator, rule-derived, paraphrase train split) plus multi-command messages built from train sentences; **the held-out set was NOT in training for these numbers (the "before" number)**. The rules were widened with the paraphrase train and test records in view, so rule numbers on the paraphrase test are optimistic.

| group | n | Br right / fallback / wrong | Brf right / fallback / wrong | B (strict) right / fallback / wrong | R rules only right / fallback / wrong |
|---|---|---|---|---|---|
| **all realistic** | 6891 | **68.5 / 22.8 / 8.7** | 69.1 / 18.4 / 12.5 | 64.7 / 27.2 / 8.1 | 43.0 / 25.5 / 31.5 |
| kids | 898 | **60.5 / 35.9 / 3.7** | 60.7 / 33.0 / 6.3 | 60.2 / 36.1 / 3.7 | 60.0 / 33.1 / 6.9 |
| avatar/shell/editor | 526 | **37.6 / 51.7 / 10.7** | 38.4 / 44.3 / 17.3 | 35.0 / 55.9 / 9.1 | 39.4 / 44.5 / 16.2 |
| music/draw/map/charts | 670 | **40.6 / 36.3 / 23.1** | 40.6 / 32.5 / 26.9 | 40.6 / 37.5 / 21.9 | 41.6 / 32.7 / 25.7 |
| games | 632 | **66.8 / 27.2 / 6.0** | 68.3 / 20.4 / 11.2 | 66.8 / 27.5 / 5.7 | 70.6 / 20.4 / 9.0 |
| documents | 165 | **32.7 / 64.2 / 3.0** | 35.1 / 53.3 / 11.5 | 32.7 / 64.8 / 2.4 | 32.7 / 54.5 / 12.7 |
| multi-command | 4000 | **80.8 / 11.5 / 7.8** | 81.4 / 7.5 / 11.1 | 74.7 / 18.1 / 7.2 | 36.0 / 19.8 / 44.3 |

Reading the headline:
- **Multi-command: the dispatcher is the win.** Right 36.0 % (rules only) to 80.8 % (Br), confidently wrong 44.3 % to 7.8 %. The rules alone cannot cut a message; the residual 11.5 % fallback is rule gaps (the D2 oracle ceilings, 68.0 B / 74.6 Br, were measured on the earlier multi-command build and are not comparable).
- **Single sentences (paraphrase test, held-out): no gain in "right", fewer confident errors.** Held-out (before): right 50.4 % (R) against 49.2 % (Br), wrong 11.8 % against 7.7 %, fallback 37.8 % against 43.1 %; paraphrase test 61.0 against 59.6 right. The limit is rule gaps (69 % of the failures), not the dispatcher (held-out world top-3 98.9 %). The dispatcher + validation layer turns some confident errors into "did you mean" answers; it cannot read what the rules cannot read. With the engine fallback (Brf) the fallback share drops to 18.4 % overall, at the price of the rules' wrong readings (12.5 %).
- **Where the dispatcher loses to rules alone** (a few points of "right"): avatar/shell/editor, music/draw/map/charts, games on single sentences. Causes: world not in the top-3 for short or typo-ridden texts, a wrong-world top-1 that also parses, and single sentences cut into two pieces (segmentation top-1 is only 94.5 % on held-out single sentences against 99.6 % on generator text). Brf closes most of this gap.
- **Strict (B) against acceptRefused (Br):** +3.8 points of right overall, +6.1 on multi-command and +14.4 points of exact SOP in games on the full test (68.2 to 82.6) (the strict rule rejects illegal or state-dependent moves, which are correct understandings). Br is the right default.

By source (same columns):

| source | n | Br | Brf | B | R |
|---|---|---|---|---|---|
| paraphrase | 636 | **59.6 / 22.6 / 17.8** | 59.8 / 18.4 / 21.9 | 59.6 / 22.8 / 17.6 | 61.0 / 18.4 / 20.6 |
| held-out (before) | 2255 | **49.2 / 43.1 / 7.7** | 50.1 / 37.6 / 12.4 | 48.5 / 44.6 / 6.9 | 50.4 / 37.8 / 11.8 |
| multi-command | 4000 | **80.8 / 11.5 / 7.8** | 81.4 / 7.5 / 11.1 | 74.7 / 18.1 / 7.2 | 36.0 / 19.8 / 44.3 |

By source and group (Br right / fallback / wrong against R):

| source | group | n | Br | Brf | R |
|---|---|---|---|---|---|
| paraphrase | kids | 128 | 73.4 / 24.2 / 2.3 | 74.2 / 21.1 / 4.7 | 72.7 / 21.1 / 6.3 |
| paraphrase | avatar/shell/editor | 86 | 33.7 / 52.3 / 14.0 | 33.7 / 45.4 / 20.9 | 33.7 / 45.4 / 20.9 |
| paraphrase | music/draw/map/charts | 230 | 38.7 / 23.5 / 37.8 | 38.7 / 19.6 / 41.7 | 40.4 / 19.6 / 40.0 |
| paraphrase | games | 192 | 87.0 / 7.3 / 5.7 | 87.0 / 3.1 / 9.9 | 90.1 / 3.1 / 6.8 |
| heldout | kids | 770 | 58.3 / 37.8 / 3.9 | 58.4 / 34.9 / 6.6 | 57.9 / 35.1 / 7.0 |
| heldout | avatar/shell/editor | 440 | 38.4 / 51.6 / 10.0 | 39.3 / 44.1 / 16.6 | 40.5 / 44.3 / 15.2 |
| heldout | music/draw/map/charts | 440 | 41.6 / 43.0 / 15.4 | 41.6 / 39.3 / 19.1 | 42.3 / 39.6 / 18.2 |
| heldout | games | 440 | 58.0 / 35.9 / 6.1 | 60.2 / 28.0 / 11.8 | 62.1 / 28.0 / 10.0 |
| heldout | documents | 165 | 32.7 / 64.2 / 3.0 | 35.1 / 53.3 / 11.5 | 32.7 / 54.5 / 12.7 |
| multi-command | multi-command | 4000 | 80.8 / 11.5 / 7.8 | 81.4 / 7.5 / 11.1 | 36.0 / 19.8 / 44.3 |

### Oracle coverage (positives, DistilBERT, with context)

Trained on: as above. `segmentation in beam` = a segmentation of the beam (4) matches the gold one (same piece count, character IoU >= 0.6); world top-1/top-3 are checked on the matching segmentation, every piece.

| group / source | n | segmentation top-1 | segmentation in beam | world top-1 | world top-3 | seg F1 (top-1) |
|---|---|---|---|---|---|---|
| **all** | 10556 | 97.5 | 99.9 | 92.4 | 98.3 | 0.9816 |
| kids | 2359 | 97.6 | 100.0 | 97.3 | 99.9 | 0.9751 |
| avatar/shell/editor | 941 | 97.3 | 100.0 | 88.2 | 96.4 | 0.9759 |
| music/draw/map/charts | 1508 | 97.8 | 100.0 | 92.5 | 98.4 | 0.98 |
| games | 1277 | 96.2 | 99.9 | 95.1 | 99.2 | 0.9577 |
| documents | 471 | 99.4 | 100.0 | 96.4 | 98.7 | 0.9968 |
| multi-command | 4000 | 97.5 | 99.9 | 89.1 | 97.4 | 0.9874 |
| source: generator | 3243 | 99.6 | 100.0 | 96.1 | 99.2 | 0.9952 |
| source: rule-derived | 422 | 98.1 | 99.8 | 81.3 | 94.5 | 0.9836 |
| source: paraphrase | 636 | 96.5 | 100.0 | 95.4 | 99.5 | 0.9691 |
| source: heldout | 2255 | 94.5 | 100.0 | 94.1 | 98.9 | 0.9452 |
| source: multi-command | 4000 | 97.5 | 99.9 | 89.1 | 97.4 | 0.9874 |

Multi-command messages: segmentation F1 (top-1, IoU >= 0.6) **0.9874**, right segmentation in the beam 99.9 %. Note that "world top-1" on multi-command is the share of messages where every piece has the right world first (a message of 3 pieces needs 3 hits), hence 89.1 %.

### End-to-end exact SOP (%), all positives with a target

Trained on: as above. A = dispatcher top-1 + rules (no interpreter); B = top-3 + validation, strict; Br = acceptRefused; R = rules only; Brf = Br + rules fallback. Simplification mode: not yet available.

| group / source | n | R rules only | A top-1 + rules | B strict | Br | Brf |
|---|---|---|---|---|---|---|
| **all** | 10556 | 62.5 | 75.3 | 74.2 | **78.5** | 79.4 |
| kids | 2359 | 84.8 | 83.6 | 84.8 | **85.0** | 85.0 |
| avatar/shell/editor | 941 | 66.1 | 58.6 | 59.7 | **62.0** | 64.7 |
| music/draw/map/charts | 1508 | 72.8 | 66.7 | 69.8 | **70.0** | 71.4 |
| games | 1277 | 84.6 | 80.0 | 68.2 | **82.6** | 84.0 |
| documents | 471 | 75.6 | 76.0 | 76.4 | **76.4** | 77.3 |
| multi-command | 4000 | 36.0 | 76.1 | 74.7 | **80.8** | 81.4 |
| source: generator | 3243 | 99.7 | 95.8 | 93.0 | **98.5** | 99.4 |
| source: rule-derived | 422 | 94.3 | 80.8 | 84.6 | **88.4** | 93.4 |
| source: paraphrase | 636 | 61.0 | 58.3 | 59.6 | **59.6** | 59.8 |
| source: heldout | 2255 | 50.4 | 48.3 | 48.5 | **49.2** | 50.1 |
| source: multi-command | 4000 | 36.0 | 76.1 | 74.7 | **80.8** | 81.4 |

Negative records (321 generator negatives; correct = no world understands the text; stricter than eval-rules, which only asks that the record's own world does not claim it): R 46.1 %, A 62.0 %, B 62.0 %, Br 62.0 %.

### Validation: rejecting a wrong top-1 and recovering

"Recoverable" = the top-1 segmentation is right, some piece has the wrong world first and the right world within the top 3. "Rejected" = the validator refuses the wrong top-1 candidate of every such piece (so the wrong world cannot win by itself); "recovered" = the final SOP is exact; "accepted" = a wrong top-1 passes validation (its world's rules parse the text too).

| group | recoverable | Br rejected | Br recovered exact | Br wrong accepted | B rejected | B recovered exact |
|---|---|---|---|---|---|---|
| **all** | 606 | 450 (74.3 %) | 305 (50.3 %) | 156 | 460 | 286 |
| kids | 60 | 41 (68.3 %) | 27 (45.0 %) | 19 | 44 | 25 |
| avatar/shell/editor | 76 | 67 (88.2 %) | 29 (38.2 %) | 9 | 67 | 29 |
| music/draw/map/charts | 89 | 60 (67.4 %) | 45 (50.6 %) | 29 | 61 | 45 |
| games | 50 | 38 (76.0 %) | 32 (64.0 %) | 12 | 39 | 32 |
| documents | 11 | 10 (90.9 %) | 2 (18.2 %) | 1 | 10 | 2 |
| multi-command | 320 | 234 (73.1 %) | 170 (53.1 %) | 86 | 239 | 153 |

Of the 803 positive messages with a wrong world-1 piece (or wrong segmentation), 606 are recoverable; validation rejects the wrong top-1 in 74.3 % and ends exact in 50.3 %. The rest are texts the rules of the right world cannot read (rule gap), so the recovery cannot finish.

### Failure analysis

Failures of Br on the realistic sources (paraphrase, held-out, multi-command), by cause (classes in the JSON `definitions`): rule gap 1496, segmentation wrong 5, sop differs 433, world not in candidates 116, wrong reading chosen 121. Over all sources: rule gap 1496, segmentation wrong 6, sop differs 433, world not in candidates 163, wrong reading chosen 170.

**Rule gaps by world** (right world and segmentation found, but the rules of that world cannot parse the piece; count over realistic records, most frequent content words, example phrasings). This is where rules are missing:

| world | gaps | frequent words | examples |
|---|---|---|---|
| docs.editor | 143 | heading (35), second (32), paragraph (30), milk (18), bread (17), middle (16) | "read the 2nd paragraph"; "word example link example dot com"; "scroll to the 2nd heading" |
| kids.common | 143 | name (61), u (23), are (18), know (14), thanks (14), have (12) | "intro yourself pls"; "helper's name?"; "did u learn my name yet" |
| art.draw | 132 | house (30), left (18), u (18), pls (17), cat (16), where (16) | "5 stars pls"; "dog the other way"; "no outline, solid heart" |
| docs.reader | 105 | story (15), pls (12), search (10), forest (9), next (9), section (9) | "what is the beginning like"; "short summary of section 2"; "what towns are mentioned" |
| kids.arith | 102 | she (30), breaks (26), zoe (23), leo (22), broke (21), how (20) | "how many does leo have after losing some"; "all the stickers total?"; "between leo and zoe who has more" |
| media.music | 88 | g (23), minor (23), major (16), e (15), c (12), which (12) | "E note pls"; "birthday song with bells"; "make it much lower, two octaves" |
| ui.shell | 88 | game (22), clue (8), games (8), want (8), now (7), play (7) | "chess board tab pls"; "tell me how many phrases i said"; "back to english" |
| kids.animals | 87 | called (21), legs (19), got (14), rex (13), name (12), dog (11) | "spider legs?"; "6 legs animals"; "can u tell me if an ostrich can fly" |
| ui.avatar | 77 | mouth (42), one (15), back (14), before (12), go (10), u (10) | "can u put sunglasses on"; "i want your mouth as a grill"; "what kind of hair u got pls" |
| geo.map | 76 | map (12), line (10), bolivia (8), country (8), germany (8), how (7) | "pull up kyoto"; "bolivia landlockd?"; "can you tell me how far madrid is from lisbon" |
| games.tictactoe | 63 | board (14), x (10), go (9), row (9), start (7), by (6) | "um, top right I think"; "me first, x please"; "any tip for my move?" |
| games.chess | 62 | white (11), moves (10), g1 (7), knight (7), move (7), pieces (7) | "can u list the legal moves of the queen"; "i play which one, white or black"; "what white has on the board" |
| ui.help | 58 | chess (12), examples (10), how (8), explain (7), rules (7), did (6) | "what u can do"; "i need examples"; "chess how to play" |
| kids.shapes | 53 | secondary (13), green (12), brown (10), make (10), how (8), orange (7) | "triangle a polygon?"; "whats a pentagon"; "a leaf could be blue right" |
| kids.shop | 43 | lei (28), puzzle (16), kite (11), kites (11), how (8), much (7) | "i got 40 lei in my purse"; "spent 2 lei just now"; "kite = 4 lei" |
| games.hangman | 42 | word (8), about (6), fact (6), hangman (5), animal (4), giraffe (4) | "giraffe is the word"; "tigre?"; "fact?" |
| data.charts | 39 | chart (9), legs (6), pls (6), plums (6), spider (6), bee (5) | "new chart bikes 4 scooters 9 kites 2"; "can u do a pie of what each kid has"; "plums in half" |
| kids.tasks | 36 | garden (11), reading (11), list (10), done (8), finished (7), homework (6) | "garden list: socks"; "reading finished"; "remove the socks from my garden" |
| kids.time | 31 | days (12), how (9), many (8), sunday (7), after (6), day (5) | "how many days in june right"; "if its sunday what day in 4 days"; "if its march, what month in 4 months" |
| games.guess | 28 | dont (5), know (5), start (4), question (3), that (3), again (2) | "begin the guess game pls"; "time to guess, start"; "cant say, dont know" |

**30 failures** (Br, realistic sources, round-robin over groups and classes, file order; `got` is the validated result, `R` the rules-only outcome on the same message):

| # | cause | group / source | tab (context) | sentence | dispatcher top-1 | got | expected | R |
|---|---|---|---|---|---|---|---|---|
| 1 | rule gap | kids / heldout | robot | spider legs? | kids.animals/ui.avatar/kids.common: spider legs? | not understood | spider legs? => type=kids.animals.animal ; seek=legs ; where.name=spider | fallback |
| 2 | rule gap | avatar/shell/editor / heldout | editor (2 msg) | read the 2nd paragraph | docs.editor/docs.reader/media.music: read the 2nd paragraph | not understood | read the 2nd paragraph => action=doc.read ; arg.n=2 ; arg.kind=paragraph | fallback |
| 3 | rule gap | music/draw/map/charts / heldout | draw | 5 stars pls | art.draw/games.chess/ui.avatar: 5 stars pls | not understood | 5 stars pls => action=draw.add ; arg.n=5 ; arg.kind=star ; arg.kt="stars" | fallback |
| 4 | rule gap | games / heldout | chess (1 msg) | can u list the legal moves of the queen | games.chess/games.hangman/games.tictactoe: can u list the legal moves of the queen | not understood | can u list the legal moves of the queen => action=chess.moves ; arg.piece=queen | fallback |
| 5 | rule gap | documents / heldout | documents (1 msg) | what is the beginning like | docs.reader/docs.editor/games.tictactoe: what is the beginning like | not understood | what is the beginning like => action=docr.part ; arg.at=begin | fallback |
| 6 | rule gap | multi-command / multi-command | robot | purple banana true then align the heading in the middle of the page please which season does december fall in | kids.shapes/ui.avatar/kids.animals: purple banana true // docs.editor/docs.reader/games.tictactoe: align the heading in the middle of the page // kids.time/docs.reader/kids.tasks: please which season does december fall in | not understood (partial: kids.shapes: purple banana true => type=kids.shapes.thing ; seek=is_color ; where.name=banana ; where.is_color=purple || kids.time: please which season does december fall in => type=kids.time.monthinfo ; seek=season ; where.name=december) | purple banana true => type=kids.shapes.thing ; seek=is_color ; where.name=banana ; where.is_color=purple || align the heading in the middle of the page => action=doc.align ; arg.t="the heading" ; arg.how=center || please which season does december fall in => type=kids.time.monthinfo ; seek=season ; where.name=december | fallback |
| 7 | sop differs | kids / heldout | robot | cows say what | kids.animals/games.guess/kids.arith: cows say what | kids.animals: cows say what => kids.animals.animal ; kids.animals.animal.name=cow ; kids.animals.animal.sound=what | cows say what => type=kids.animals.animal ; seek=sound ; where.name=cow | wrong |
| 8 | sop differs | avatar/shell/editor / heldout | editor (2 msg) | can u make paragraph two bold | docs.editor/games.tictactoe/games.hangman: can u make paragraph two bold | docs.editor: can u make paragraph two bold => action=doc.format ; arg.t="paragraph two" ; arg.mark=bold | can u make paragraph two bold => action=doc.format ; arg.t="the second paragraph" ; arg.mark=bold | wrong |
| 9 | sop differs | music/draw/map/charts / heldout | draw | i want 5 stars added | art.draw/ui.avatar/games.chess: i want 5 stars added | art.draw: i want 5 stars added => action=draw.add ; arg.n=5 ; arg.kind=star ; arg.kt="stars" ; arg.where="added" | i want 5 stars added => action=draw.add ; arg.n=5 ; arg.kind=star ; arg.kt="stars" | wrong |
| 10 | sop differs | games / heldout | chess (1 msg) | h8? | games.chess/games.tictactoe/games.hangman: h8? | games.chess: h8? => action=chess.move ; arg.tf=h ; arg.tr=8 | h8? => action=chess.square ; arg.ff=h ; arg.fr=8 | wrong |
| 11 | world not in candidates | documents / heldout | documents (1 msg) | hey look up oven | kids.common/ui.avatar/media.music: hey look up oven | not understood | hey look up oven => action=docr.search ; arg.q="oven" | fallback |
| 12 | segmentation wrong | multi-command / multi-command | editor | what animals still possible and then perfect please highlight the house pls | games.guess/kids.animals/games.hangman: what animals still possible // games.tictactoe/games.guess/games.chess: perfect // docs.editor/art.draw/games.tictactoe: please highlight the house pls | games.guess: what animals still possible => action=guess.remaining || games.tictactoe: perfect => action=ttt.level ; arg.level=perfect || docs.editor: please highlight the house pls => action=doc.format ; arg.t="the house pls" ; arg.mark=highlight | what animals still possible => action=guess.remaining || perfect please => action=ttt.level ; arg.level=perfect || highlight the house pls => action=draw.select ; arg.kind=house ; arg.kt="house" | fallback |
| 13 | wrong reading chosen | kids / heldout | robot | tell me about you, who are u | kids.common/ui.avatar/kids.animals: tell me about you // kids.common/ui.avatar/kids.animals: who are u | kids.common: tell me about you => action=chat.who || kids.common: who are u => action=chat.who | tell me about you, who are u => action=chat.who | wrong |
| 14 | world not in candidates | avatar/shell/editor / heldout | robot | I want a dish on top. | data.charts/docs.editor/games.tictactoe: I want a dish on top. | not understood | I want a dish on top. => action=avatar.setPart ; arg.part=top ; arg.value=dish ; arg.text="dish" | right |
| 15 | world not in candidates | music/draw/map/charts / heldout | music | hpy birthday on bels | kids.time/kids.arith/kids.common: hpy birthday on bels | not understood | hpy birthday on bels => action=music.playAny ; arg.title="Happy Birthday" ; arg.inst=bell | fallback |
| 16 | world not in candidates | games / heldout | guess (1 msg) | which are left in the list | kids.tasks/docs.editor/data.charts: which are left in the list | kids.tasks: which are left in the list => action=tasks.add ; arg.item="which are left" ; arg.list=to-do | which are left in the list => action=guess.remaining | wrong |
| 17 | wrong reading chosen | documents / heldout | documents (1 msg) | where does the story happen, list places | docs.reader/media.music/kids.time: where does the story happen // docs.reader/kids.tasks/data.charts: list places | docs.reader: where does the story happen => action=docr.places || docs.reader: list places => action=docr.places | where does the story happen, list places => action=docr.places | wrong |
| 18 | sop differs | multi-command / multi-command | editor | move it to the key of a minor then i want a violin sound | media.music/games.chess/docs.editor: move it to the key of a minor // media.music/ui.shell/games.chess: i want a violin sound | media.music: move it to the key of a minor => action=music.transposeTo ; arg.root=a ; arg.m=minor || media.music: i want a violin sound => action=music.instrument ; arg.inst=violin | move it to the key of a minor => action=music.transposeTo ; arg.root=a ; arg.m=minor || i want a violin sound => action=music.instrument ; arg.inst=flute | wrong |
| 19 | rule gap | kids / heldout | robot | legs on a spider | kids.animals/ui.avatar/kids.common: legs on a spider | not understood | legs on a spider => type=kids.animals.animal ; seek=legs ; where.name=spider | fallback |
| 20 | wrong reading chosen | avatar/shell/editor / heldout | editor (2 msg) | Read paragraph 2. | docs.reader/docs.editor/media.music: Read paragraph 2. | docs.reader: Read paragraph 2. => action=docr.read ; arg.u=paragraph ; arg.n=2 | Read paragraph 2. => action=doc.read ; arg.n=2 ; arg.kind=paragraph | right |
| 21 | wrong reading chosen | music/draw/map/charts / heldout | charts | spiders and cows legs bar chart | games.guess/data.charts/kids.animals: spiders // data.charts/ui.avatar/games.guess: cows legs bar chart | games.guess: spiders => action=guess.reveal ; arg.animal="spiders" || data.charts: cows legs bar chart => action=chart.fromText ; arg.text="cows legs bar" | spiders and cows legs bar chart => action=chart.fromLegs ; arg.what="spiders and cows" | wrong |
| 22 | wrong reading chosen | games / heldout | chess (1 msg) | make the engine stronger, level five | games.chess/games.tictactoe/ui.shell: make the engine stronger // games.chess/games.tictactoe/media.music: level five | games.chess: make the engine stronger => action=chess.level ; arg.name=stronger || games.chess: level five => action=chess.level ; arg.n=5 | make the engine stronger, level five => action=chess.level ; arg.n=5 | wrong |
| 23 | rule gap | documents / heldout | documents (1 msg) | start of the story? | docs.reader/docs.editor/media.music: start of the story? | not understood | start of the story? => action=docr.part ; arg.at=begin | fallback |
| 24 | world not in candidates | multi-command / multi-command | editor | Add cat food, ice cream and apples to my shopping list and then remove the lines pls | kids.tasks/docs.editor/kids.arith: Add cat food, ice cream and apples to my shopping list // docs.editor/ui.avatar/kids.tasks: remove the lines pls | not understood (partial: kids.tasks: Add cat food, ice cream and apples to my shopping list => action=tasks.add ; arg.item="cat food, ice cream and apples" ; arg.list="shopping") | Add cat food, ice cream and apples to my shopping list => action=tasks.add ; arg.item="cat food, ice cream and apples" ; arg.list="shopping" || remove the lines pls => action=geo.clearLines | wrong |
| 25 | sop differs | kids / heldout | robot | does a cow eat plants | kids.animals/kids.arith/kids.shapes: does a cow eat plants | kids.animals: does a cow eat plants => type=kids.animals.animal ; seek=food ; mode=exists ; where.name=cow ; where.food=plants | does a cow eat plants => type=kids.animals.animal ; seek=is_a ; where.name=cow ; where.is_a=herbivore | wrong |
| 26 | rule gap | avatar/shell/editor / heldout | editor (2 msg) | read number two paragraph pls | docs.editor/docs.reader/kids.tasks: read number two paragraph pls | not understood | read number two paragraph pls => action=doc.read ; arg.n=2 ; arg.kind=paragraph | fallback |
| 27 | rule gap | music/draw/map/charts / heldout | draw | more stars, like 5 | art.draw/data.charts/kids.arith: more stars, like 5 | not understood | more stars, like 5 => action=draw.add ; arg.n=5 ; arg.kind=star ; arg.kt="stars" | fallback |
| 28 | rule gap | games / heldout | chess (1 msg) | could you show what squares my queen can reach | games.chess/games.tictactoe/kids.shapes: could you show what squares // games.chess/games.tictactoe/games.hangman: my queen can reach | not understood (partial: games.chess: my queen can reach => action=chess.moves ; arg.piece=queen) | could you show what squares my queen can reach => action=chess.moves ; arg.piece=queen | fallback |
| 29 | world not in candidates | documents / heldout | documents (2 msg) | next match | games.tictactoe/games.chess/ui.shell: next match | not understood | next match => action=docr.searchStep ; arg.dir=next | right |
| 30 | wrong reading chosen | multi-command / multi-command | draw | Make your mouth bigger | ui.avatar/art.draw/kids.common: Make your mouth bigger | ui.avatar: Make your mouth bigger => action=avatar.resizePart ; arg.part=mouth ; arg.dir=bigger | Make your mouth bigger => action=draw.resize ; arg.t="your mouth" ; arg.d=bigger | right |

Reading the 30 (the sample is balanced over groups and causes, not proportional; the proportions are in the counts above): 11 rule gaps, 6 "sop differs", 6 world not in candidates, 6 wrong reading chosen, 1 segmentation. Rule gaps are the bulk of the real failures (about 69 % of the realistic ones): politeness and abbreviations (`pls`, `u`), numerals (`2nd`, `two`, `number two`), reordered phrasings (`legs on a spider`, `start of the story?`), typos. "sop differs" are texts the rules parse but only partly (`i want 5 stars added` keeps `where="added"`, `cows say what` becomes a statement, `h8?` is read as a move instead of a square) or where the paraphrase label is arguable; no dispatcher can fix them. "World not in candidates" are short or typo-ridden texts (`next match`, `hpy birthday on bels`, `which are left in the list`); in two of them (#14, #29) the rules alone read the message correctly, which is what the Brf fallback recovers. "Wrong reading chosen" are single sentences cut into two pieces that both parse (#13, #17, #22) and a wrong-world top-1 whose rules also parse and which validation therefore accepts (#20 `Read paragraph 2.` on the editor tab goes to docs.reader).

### ModernBERT (full) against DistilBERT

Same data, seeds, heads and validation. ModernBERT-base full fine-tune (149 M parameters, 698 s) against DistilBERT (66 M, 194 s, 63.9 MB int8). Trained on: as above, held-out not in training.

| dispatcher | world top-1 / top-3 (all positives) | held-out top-1 / top-3 | multi-command seg F1 | headline Br right / fallback / wrong | headline Brf right | Br exact SOP all |
|---|---|---|---|---|---|---|
| DistilBERT | 92.4 / 98.3 | 94.1 / 98.9 | 0.9874 | 68.5 / 22.8 / 8.7 | 69.1 | 78.5 |
| ModernBERT full | 91.8 / 98.0 | 94.1 / 98.3 | 0.9916 | 68.1 / 22.9 / 8.9 | 68.7 | 78.3 |


## F1 - paraphrase labels keep each variant's own parameters (review F1)

**Problem.** `labelVariant` copied the canonical's target onto every variant that the rules read differently or not at all, so a variant with other values got the canonical's values ("a key with 4 sharps?" was labelled `n=3, acc=flat`). **Fix** (spec 10 section 3): the operation family (goal, used for splits) is separated from the semantic instance (`instance_id`); a variant that the rules parse completely and whose slot values all occur in its text (and whose numbers are all used) is labelled with the rules' own SOP (`rules-own`); the canonical's target is inherited (`rules-differ` / `rules-fail`) only when the canonical's values match the variant's text; everything else is `needs_review` (no target, out of training, `label_reason` says why). Code: `scripts/collect-paraphrases.mjs` (`labelVariant`, `slotsOf`, `slotsFaithful`, `valuesMatch`). Audit: `scripts/audit-f1-labels.mjs` -> `training/results/f1-label-audit.json`. Tests: `tests/paraphrases.test.mjs` (the three music examples, minimal pairs with one changed argument for the time, shapes, shop, map, arithmetic and music families, and unit cases).

**Audit of the committed labels (old policy), train / held-out.**

| | train (7500 variants) | held-out (2100 variants) |
| --- | ---: | ---: |
| old targets copied from the canonical (`target_from=canonical`) | 2298 | 1104 |
| of which the canonical's values do not match the variant's text (**labelling errors**: wrong or unverifiable) | 801 (35%) | 267 (24%) |
| of those, the rules' current own reading is faithful to the text (**certainly wrong labels**) | 577 | 98 |
| of those, a number of the variant is missing from the canonical's values | 88 | 16 |
| variants the rules parse completely but read unfaithfully (**parser errors or lexicon normalizations**: "grow" -> `d=bigger` is counted too) | 430 | 207 |
| of those, a number of the text is dropped or changed (**real parser errors**, e.g. "rotate the car 45 degrees" -> flip) | 33 | 20 |
| variants the rules do not parse at all (**parser gaps**) | 357 | 129 |

Labelling errors are mostly tasks whose variants change the parameters (canonical "Draw a red house." with variants "draw me 3 trees", "a tiny green tree"): they are different instances, now `rules-own`. Parser errors are a small share (33+20 real number errors; the rest are mostly normalizations the faithfulness check cannot see and go to `needs_review` only when the canonical does not match either). The "before" figures below are the committed outputs, produced with older rules, so the shift mixes the new labelling with rule progress since those outputs (the old `rules-fail` rows that now parse become `rules-agree`).

**Counts per label status, before -> after (variants only; agree / own / differ / fail / unverified / needs_review; `trainable` = no review flag and a target).** T = `training/paraphrases/out`, H = `heldout/out` (both rerun, including the new `*.h5.json` and `docs.editor.h7.json` batches).

| set world | variants | before agree/own/differ/fail/unverified/needs_review | after (same order) |
| --- | ---: | --- | --- |
| H art.draw | 100 | 32/0/20/48/0/0 (trainable 100) | 83/11/0/1/0/5 (trainable 95) |
| H data.charts | 100 | 41/0/31/28/0/0 (trainable 100) | 87/13/0/0/0/0 (trainable 100) |
| H docs.editor | 100 | 29/0/24/47/0/0 (trainable 100) | 92/7/0/0/0/1 (trainable 99) |
| H docs.reader | 200 | 39/0/21/136/4/0 (trainable 150) | 141/4/0/31/24/0 (trainable 160) |
| H games.chess | 100 | 50/0/15/35/0/0 (trainable 100) | 96/4/0/0/0/0 (trainable 100) |
| H games.guess | 100 | 77/0/8/15/0/0 (trainable 100) | 98/0/0/0/0/2 (trainable 98) |
| H games.hangman | 100 | 62/0/12/26/0/0 (trainable 100) | 99/1/0/0/0/0 (trainable 100) |
| H games.tictactoe | 100 | 53/0/17/30/0/0 (trainable 100) | 80/5/0/0/0/15 (trainable 85) |
| H geo.map | 100 | 42/0/10/48/0/0 (trainable 100) | 96/4/0/0/0/0 (trainable 100) |
| H kids.animals | 100 | 42/0/12/46/0/0 (trainable 100) | 98/1/0/0/0/1 (trainable 99) |
| H kids.arith | 100 | 50/0/7/43/0/0 (trainable 100) | 95/1/0/3/0/1 (trainable 99) |
| H kids.common | 100 | 52/0/8/40/0/0 (trainable 100) | 92/4/0/4/0/0 (trainable 100) |
| H kids.shapes | 100 | 69/0/2/29/0/0 (trainable 100) | 100/0/0/0/0/0 (trainable 100) |
| H kids.shop | 100 | 57/0/7/36/0/0 (trainable 100) | 97/0/0/1/0/2 (trainable 98) |
| H kids.tasks | 100 | 40/0/27/33/0/0 (trainable 100) | 74/25/0/0/0/1 (trainable 99) |
| H kids.time | 100 | 69/0/1/30/0/0 (trainable 100) | 94/1/1/3/0/1 (trainable 99) |
| H media.music | 100 | 31/0/27/42/0/0 (trainable 100) | 89/9/0/1/0/1 (trainable 99) |
| H ui.avatar | 100 | 41/0/14/45/0/0 (trainable 100) | 91/9/0/0/0/0 (trainable 100) |
| H ui.help | 100 | 24/0/15/61/0/0 (trainable 100) | 89/11/0/0/0/0 (trainable 100) |
| H ui.shell | 100 | 46/0/18/36/0/0 (trainable 100) | 92/5/1/2/0/0 (trainable 100) |
| T art.draw | 520 | 133/0/134/133/0/0 (trainable 400) | 341/159/1/6/5/8 (trainable 502) |
| T data.charts | 520 | 175/0/122/103/0/0 (trainable 400) | 393/93/0/20/0/14 (trainable 506) |
| T docs.editor | 720 | 151/0/196/253/0/0 (trainable 590) | 241/306/11/118/0/44 (trainable 666) |
| T docs.reader | 120 | - | 65/18/0/37/0/0 (trainable 110) |
| T games.chess | 420 | 241/0/40/19/0/0 (trainable 300) | 322/57/3/26/0/12 (trainable 408) |
| T games.guess | 320 | 186/0/11/3/0/0 (trainable 200) | 264/32/1/17/0/6 (trainable 314) |
| T games.hangman | 320 | 182/0/13/5/0/0 (trainable 200) | 276/26/2/16/0/0 (trainable 320) |
| T games.tictactoe | 320 | 180/0/13/7/0/0 (trainable 200) | 283/25/0/10/0/2 (trainable 318) |
| T geo.map | 520 | 114/0/92/194/0/0 (trainable 400) | 405/103/0/0/0/12 (trainable 508) |
| T kids.animals | 320 | 156/0/8/36/0/0 (trainable 200) | 305/5/0/7/0/3 (trainable 317) |
| T kids.arith | 320 | 158/0/5/37/0/0 (trainable 200) | 238/12/1/63/0/6 (trainable 314) |
| T kids.common | 320 | 127/0/48/25/0/0 (trainable 200) | 248/67/0/5/0/0 (trainable 320) |
| T kids.shapes | 320 | 141/0/9/50/0/0 (trainable 200) | 312/1/0/5/0/2 (trainable 318) |
| T kids.shop | 320 | 150/0/13/37/0/0 (trainable 200) | 270/6/0/20/0/24 (trainable 296) |
| T kids.tasks | 320 | 89/0/56/55/0/0 (trainable 200) | 206/75/3/18/0/18 (trainable 302) |
| T kids.time | 320 | 171/0/5/24/0/0 (trainable 200) | 302/4/2/6/0/6 (trainable 314) |
| T media.music | 520 | 169/0/195/36/0/0 (trainable 400) | 308/190/2/0/0/20 (trainable 500) |
| T ui.avatar | 520 | 179/0/62/159/0/0 (trainable 400) | 291/116/9/81/0/23 (trainable 497) |
| T ui.help | 120 | - | 90/17/0/13/0/0 (trainable 120) |
| T ui.shell | 320 | 93/0/30/77/0/0 (trainable 200) | 213/58/0/40/0/9 (trainable 311) |
| TOTAL | 9600 | 3741/0/1348/2107/4/0 (trainable 7140) | 7256/1485/37/554/29/239 (trainable 9291) |

Commands to rebuild everything derived from these labels (not run here): `node scripts/export-training.mjs && node scripts/build-dataset.mjs`, then `node scripts/build-edit-tags.mjs` (usual options) and, once it exists (N1), `scripts/build-normalizer-pairs.mjs`, and re-run `node scripts/eval-rules.mjs --heldout` for the held-out rules metrics.
