# Worker log

Append-only, written by the worker. One entry per task:

```
## Tn — <title> — done | partial | blocked (<date time>)
Commands: ...
Results: key numbers (link to training/results/*.json)
Commit: <hash>
Deviations / choices: ...
```

## T0 — Environment — done (2026-11-08 10:50)
Commands:
- `python3 -m venv .venv && . .venv/bin/activate`
- `pip install torch --index-url https://download.pytorch.org/whl/cu130`
- `pip install -r training/requirements.txt onnx onnxruntime`
- `python training/check_env.py`
- `npm test`; `node src/cli.mjs test-world all`
- `bash training/smoke_test.sh` (venv active)
- tokenizer + model load and one GPU forward pass for answerdotai/ModernBERT-base and distilbert-base-uncased
Results:
- node v22.23.2, python 3.12.3, GPU NVIDIA GB10 (119.6 GB unified), driver 580.178.04, torch CUDA 13.0, bf16 supported
- torch 2.14.1+cu130, transformers 5.22.2, peft 0.21.2, datasets 5.1.0, accelerate 1.15.0, safetensors 0.8.0, onnx 1.23.2, onnxruntime 1.31.1 (CPU provider), numpy 2.5.4, scikit-learn 1.9.1
- torch.cuda.is_available() True; 512x512 matmul on cuda works (sm_121 wheel OK)
- check_env.py: all libraries present, cuda_available true, backbone ModernBERT-base config loads (hidden 768, 22 layers)
- npm test: 523 pass, 0 fail
- test-world all: 21 worlds, 1333/1333 passed
- smoke test: `smoke test OK` (runs on CPU, tiny random model, as written)
- model downloads: ModernBERT-base and distilbert-base-uncased both load and run a forward pass on GPU
Commit: (filled by coordinator)
Deviations / choices: venv with the cu130 aarch64 wheel chosen over the NGC container because the wheel sees the GPU. No training code changed. .gitignore already contains `.venv/`. HF Hub warns about unauthenticated requests (no HF_TOKEN); downloads work anyway.

## T1 — Dataset rebuild and sanity — done (2026-11-08 10:42)
Commands:
```
cd /home/salboaie/work/psys2 && . .venv/bin/activate
git rev-parse HEAD
git show HEAD:training/dataset/stats.json > <scratch>/stats_old.json
node scripts/export-training.mjs
node scripts/collect-paraphrases.mjs training/paraphrases/inbox --report
node scripts/build-dataset.mjs
cd training && python -m psys2_train.check_splits      # exit 0 (group check); --strict-routing exits 1
```
Results:
- Baseline commit: 055fbeb3ce45b3e5ace37e314e2c9c7e5f1a7d80 (worlds/ and src/ untouched by the worker).
- Build: 20 worlds, 39982 records (train 30749 / dev 4579 / test 4654), routing 38150 rows (train 29549 / dev 4360 / test 4241), unlabelled 0, duplicates dropped 4752, conflicting targets 853. Source records read 44873.
- Split check: no `group` crosses splits in any world. Routing rows carry no `group` field, so routing was checked by (world, normalized text): 113 pairs occur in two splits (art.draw 10, data.charts 7, docs.editor 9, games.chess 16, games.guess 24, games.hangman 11, games.tictactoe 7, geo.map 3, kids.animals 5, kids.shapes 8, kids.shop 4, media.music 6, ui.shell 3). These are the same text with a different routing context (short texts such as "yes!", "make it blue", "undo my move."); reported as WARNING, not failure (`--strict-routing` fails on them). Routing is split by example group of the underlying rows, not by text.
- Per world, split and source (rows of training/dataset/<world>/<split>.jsonl; the routing row is the last block):
```
world              split      generator    paraphrase  rule-derived   total
art.draw           train           1595           228           163    1986
art.draw           dev              215            88             7     310
art.draw           test              90           119            47     256
data.charts        train           1383           381           113    1877
data.charts        dev              183            44            21     248
data.charts        test             247            11            12     270
docs.editor        train            260           537           107     904
docs.editor        dev               38            66            11     115
docs.editor        test              51            44            20     115
docs.reader        train           1469             0           104    1573
docs.reader        dev              239             0             8     247
docs.reader        test             292             0            14     306
games.chess        train           1520           218           316    2054
games.chess        dev              188            66            23     277
games.chess        test             292            44            30     366
games.guess        train           1051            96            12    1159
games.guess        dev              114            40             5     159
games.guess        test              89            74             0     163
games.hangman      train           1420           130             8    1558
games.hangman      dev              115            71            13     199
games.hangman      test             216             0             0     216
games.tictactoe    train           1355           108             6    1469
games.tictactoe    dev              196             0             0     196
games.tictactoe    test              26           106             6     138
geo.map            train           1479           323           113    1915
geo.map            dev              201            86            12     299
geo.map            test             299            22            20     341
kids.animals       train           1499           185            71    1755
kids.animals       dev              222            11             5     238
kids.animals       test             228            22             8     258
kids.arith         train           1543           165           139    1847
kids.arith         dev              226            21             1     248
kids.arith         test             227            20            11     258
kids.common        train           1134           159             7    1300
kids.common        dev              325             0             0     325
kids.common        test             147            54             0     201
kids.shapes        train           1486           149            47    1682
kids.shapes        dev              194            31             1     226
kids.shapes        test             275            32             5     312
kids.shop          train           1506           181           114    1801
kids.shop          dev              235            33             6     274
kids.shop          test             251             0             8     259
kids.tasks         train           1381           204            79    1664
kids.tasks         dev              258            11             1     270
kids.tasks         test             293             0             0     293
kids.time          train           1422           198            48    1668
kids.time          dev              215            21             9     245
kids.time          test             264             0             3     267
media.music        train           1382           280           181    1843
media.music        dev              180            66            42     288
media.music        test              58            82            75     215
ui.avatar          train              0           378           154     532
ui.avatar          dev                0            22            60      82
ui.avatar          test               0            32            47      79
ui.help            train            660             0            37     697
ui.help            dev              139             0             1     140
ui.help            test              92             0             3      95
ui.shell           train           1275           150            40    1465
ui.shell           dev              136            44            13     193
ui.shell           test             219            22             5     246
routing            train          23631          4064          1854   29549
routing            dev             3400           721           239    4360
routing            test            3244           684           313    4241
```
- Stats diff vs committed stats.json: same worlds (none new or missing); source_records_read unchanged (44873); totals differ by 2 rows (train 30747->30749, dev 4581->4579); routing dev 4362->4360, train 29547->29549; dedupe conflicting_targets 857->853. Only games.hangman differs per world: dev 201->199, train 1556->1558 (test 216 unchanged). No difference above 5 %. Cause: the committed training/paraphrases/out/*.jsonl were generated by an older rule state; the collector re-run relabels some paraphrases (see next item), which moves a few groups between train and dev in hangman.
- Collector rewrote committed files (NOT reverted; the coordinator must decide): training/paraphrases/out/{docs.editor,games.chess,games.hangman,kids.animals,ui.avatar,ui.shell}.jsonl and training/paraphrases/report.json. Same example_ids and record counts in every file; the line order changed in all six (games.chess and kids.animals: order only, no field changed). Content changes: games.hangman 56-64 records with changed expected_circuit/label_status/reply (variant_rules_coverage 0.565 -> 0.285: rules-agree 113 -> 57, rules-fail 77 -> 130), docs.editor ~10, ui.shell 4, ui.avatar 1-5. The cause is the rule changes in 6e81a5c (committed after the paraphrase outputs were generated) now being applied. training/dataset/stats.json also changed (the one gitignore exception). Other worlds' paraphrase files are unchanged.
- Also docs.editor still has one failing canonical (h3/docs.editor.h3.t4 "Turn dictation off again", 59/60), review 10.
Commit: (filled by coordinator)
Deviations / choices:
- check_splits.py (training/psys2_train/check_splits.py) treats group leaks as errors and routing text overlap as a warning by default, since routing rows have no group; `--strict-routing` makes it an error. Reviewer: decide whether routing needs a split by text (or group) before T4.
- No training/tests/ directory exists, so no test was added.

## T2 — Rule baseline — done (2026-11-08 11:10)
Commands:
```
node scripts/eval-rules.mjs            # writes training/results/rules.json and training/runs/rules-failures.jsonl (gitignored); about 10 s, 20 workers
node scripts/eval-rules.mjs --world ui.help --out <file>
npm test
```
Run twice: `rules.json` and the failures file are byte-identical. Wall time 9.7 to 10.1 s (20 worker threads, one per core, engine loaded once per thread).
Results (`training/results/rules.json`, tables in `training/RESULTS.md`; exact SOP, test splits at baseline 055fbeb):
- Positives (4242): restricted (rule ceiling) 88.7 %, routed (rules plus current rule router) 88.3 %. Negatives (412, all generator): 98.1 % in both modes (routed: 289 of them are parsed by no world at all).
- By source, restricted / routed: generator 100 / 100 (3244), rule-derived 100 / 94.0 (314), paraphrase 30.1 / 30.4 (684).
- By group, restricted / routed: kids 93.3 / 93.3, avatar/shell/editor 84.3 / 84.3, music/draw/map/charts 84.9 / 83.5, games 83.6 / 83.8, documents 100 / 98.7.
- Weak worlds (routed): kids.common 16.7 (paraphrases such as "see you later", "cya"), games.guess 60.0, games.tictactoe 60.9, art.draw 64.2, media.music 67.9, docs.editor 67.8, ui.avatar 67.1.
- Routing (rule router, 4241 test rows): all 89.7 % (3804), text not in routing train 89.7 % (3636 of 4052). 94 kids, 63 shell, 82 media, 110 games and 4 documents rows are not parsed at all; the rest are wrong-world (84 rows). Rows with real context (paraphrases, 684): 42.7 %.
- Failure classes in the failures file: not parsed 389 / 353 (restricted / routed), differs 89 / 87, wrong world 55 (routed), negative claimed 8 / 8, routing wrong world 84 and not parsed 353.
Commit: (filled by coordinator)
Deviations / choices:
- Added `scripts/lib/world-groups.mjs` (group mapping, also re-exported from `eval-rules.mjs`). `collect-paraphrases.mjs` untouched: `normalizedSop` was already exported.
- Only worlds listed in `training/dataset/stats.json` are evaluated: `training/dataset/multicmd/` (new, from `training/psys2_train/multicmd.py`, not part of this task) is skipped.
- Correct positive requires zero unparsed segments (stricter than `labelVariant`, which only compares the SOP of parsed segments) and compares the SOP only, not state or effects.
- Negative correct = the record's world (or its imports) does not claim the text; restricted = nothing parsed. Routing row correct = world of the first parsed segment is `world` or in `alt_worlds`; unparsed rows are wrong. The row's `recent_worlds` are set before its session messages, the tab as `ui.shell` activeTab.
- Restricted mode uses a view of the world set with only the world and its imports (own memo cache), through `formalize()` with a FormSession, no interpreter. Routed mode uses `DialogSession.send` (the dialog server path).
- Generator and rule-derived records have no tab, so routed mode runs them without a tab (the dialog default); the near-equal routed and restricted numbers show these texts are rarely ambiguous.
