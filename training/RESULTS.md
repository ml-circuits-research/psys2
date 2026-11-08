# Training results

All numbers trace to `training/results/*.json`. Baseline commit 055fbeb (worlds/ and src/ frozen); dataset in `training/dataset/` (test splits).

## T2 - Rule baseline on the test splits

Command: `node scripts/eval-rules.mjs` (about 10 s on 20 cores, deterministic; failures go to `training/runs/rules-failures.jsonl`, gitignored). Result: `training/results/rules.json`.

- **restricted**: rule formalizer limited to the record's world (and imports): the ceiling of the rule formalizer.
- **routed**: dialog session over all worlds with the current rule router and the record's tab: the baseline every model must beat.
- Positive correct = all segments parsed and id-normalized SOP equals the target. Negative correct = the record's world does not claim the text (restricted: nothing parsed; routed: no segment matched by that world or its imports).
- Context: the record's `context` messages are formalized first, in a fresh session; the tab is the record's tab (generator and rule-derived records have none).

### Exact-SOP accuracy (%)

**Total and by source**

| | positives | restricted % | routed % | negatives | restricted % | routed % |
|---|---|---|---|---|---|---|
| all | 4242 | 88.7 | 88.3 | 412 | 98.1 | 98.1 |
| paraphrase | 684 | 30.1 | 30.4 | 0 | - | - |
| rule-derived | 314 | 100.0 | 94.0 | 0 | - | - |
| generator | 3244 | 100.0 | 100.0 | 412 | 98.1 | 98.1 |

**By world group**

| | positives | restricted % | routed % | negatives | restricted % | routed % |
|---|---|---|---|---|---|---|
| kids | 1557 | 93.3 | 93.3 | 291 | 99.7 | 99.7 |
| avatar/shell/editor | 511 | 84.3 | 84.3 | 24 | 100.0 | 100.0 |
| music/draw/map/charts | 1041 | 84.9 | 83.5 | 41 | 97.6 | 97.6 |
| games | 827 | 83.6 | 83.8 | 56 | 89.3 | 89.3 |
| documents | 306 | 100.0 | 98.7 | 0 | - | - |

**By world**

| | positives | restricted % | routed % | negatives | restricted % | routed % |
|---|---|---|---|---|---|---|
| art.draw | 215 | 70.2 | 64.2 | 41 | 97.6 | 97.6 |
| data.charts | 270 | 96.3 | 95.9 | 0 | - | - |
| docs.editor | 115 | 67.8 | 67.8 | 0 | - | - |
| docs.reader | 306 | 100.0 | 98.7 | 0 | - | - |
| games.chess | 366 | 92.3 | 92.9 | 0 | - | - |
| games.guess | 135 | 60.0 | 60.0 | 28 | 89.3 | 89.3 |
| games.hangman | 188 | 100.0 | 100.0 | 28 | 89.3 | 89.3 |
| games.tictactoe | 138 | 60.9 | 60.9 | 0 | - | - |
| geo.map | 341 | 95.6 | 95.6 | 0 | - | - |
| kids.animals | 258 | 93.0 | 93.0 | 0 | - | - |
| kids.arith | 230 | 93.0 | 93.0 | 28 | 100.0 | 100.0 |
| kids.common | 54 | 16.7 | 16.7 | 147 | 100.0 | 100.0 |
| kids.shapes | 196 | 86.7 | 86.7 | 116 | 99.1 | 99.1 |
| kids.shop | 259 | 100.0 | 100.0 | 0 | - | - |
| kids.tasks | 293 | 100.0 | 100.0 | 0 | - | - |
| kids.time | 267 | 100.0 | 100.0 | 0 | - | - |
| media.music | 215 | 68.4 | 67.9 | 0 | - | - |
| ui.avatar | 79 | 67.1 | 67.1 | 0 | - | - |
| ui.help | 95 | 100.0 | 100.0 | 0 | - | - |
| ui.shell | 222 | 92.3 | 92.3 | 24 | 100.0 | 100.0 |

**By world and source, positives (restricted / routed %, n)**

| world | generator | paraphrase | rule-derived |
|---|---|---|---|
| art.draw | 100.0 / 100.0 (49) | 46.2 / 46.2 (119) | 100.0 / 72.3 (47) |
| data.charts | 100.0 / 100.0 (247) | 9.1 / 9.1 (11) | 100.0 / 91.7 (12) |
| docs.editor | 100.0 / 100.0 (51) | 15.9 / 15.9 (44) | 100.0 / 100.0 (20) |
| docs.reader | 100.0 / 100.0 (292) | - | 100.0 / 71.4 (14) |
| games.chess | 100.0 / 100.0 (292) | 36.4 / 40.9 (44) | 100.0 / 100.0 (30) |
| games.guess | 100.0 / 100.0 (61) | 27.0 / 27.0 (74) | - |
| games.hangman | 100.0 / 100.0 (188) | - | - |
| games.tictactoe | 100.0 / 100.0 (26) | 49.1 / 49.1 (106) | 100.0 / 100.0 (6) |
| geo.map | 100.0 / 100.0 (299) | 31.8 / 31.8 (22) | 100.0 / 100.0 (20) |
| kids.animals | 100.0 / 100.0 (228) | 18.2 / 18.2 (22) | 100.0 / 100.0 (8) |
| kids.arith | 100.0 / 100.0 (199) | 20.0 / 20.0 (20) | 100.0 / 100.0 (11) |
| kids.common | - | 16.7 / 16.7 (54) | - |
| kids.shapes | 100.0 / 100.0 (159) | 18.8 / 18.8 (32) | 100.0 / 100.0 (5) |
| kids.shop | 100.0 / 100.0 (251) | - | 100.0 / 100.0 (8) |
| kids.tasks | 100.0 / 100.0 (293) | - | - |
| kids.time | 100.0 / 100.0 (264) | - | 100.0 / 100.0 (3) |
| media.music | 100.0 / 100.0 (58) | 17.1 / 17.1 (82) | 100.0 / 98.7 (75) |
| ui.avatar | - | 18.8 / 18.8 (32) | 100.0 / 100.0 (47) |
| ui.help | 100.0 / 100.0 (92) | - | 100.0 / 100.0 (3) |
| ui.shell | 100.0 / 100.0 (195) | 22.7 / 22.7 (22) | 100.0 / 100.0 (5) |

### World routing (routing.jsonl, test rows, rule router)

Correct = routed world (world of the first parsed segment) equals `world` or is in `alt_worlds`; a row nothing parses counts as wrong. Context per row: tab, recent_worlds, session messages.

| subset | accuracy | not parsed |
|---|---|---|
| all | 3804/4241 = 89.7% | 353 |
| text not in routing train (Q1) | 3636/4052 = 89.7% | 344 |
| text also in train | 168/189 = 88.9% | 9 |
| real context (paraphrases, not synthetic) | 292/684 = 42.7% | 347 |
| group kids | 1446/1557 = 92.9% | 94 |
| group avatar/shell/editor | 438/511 = 85.7% | 63 |
| group music/draw/map/charts | 922/1040 = 88.6% | 82 |
| group games | 696/827 = 84.2% | 110 |
| group documents | 302/306 = 98.7% | 4 |

