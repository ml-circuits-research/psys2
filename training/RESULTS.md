# Training results

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
