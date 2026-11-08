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

## D2 — Validation layer — done (2026-11-08 14:00)
Commands:
```
node --test tests/dispatch-validate.test.mjs        # 10 tests
npm test                                             # 533 pass
node src/cli.mjs test-world all                      # all worlds pass
node scripts/make-oracle-pred.mjs                    # gold-derived predictions: training/runs/dispatch-oracle/oracle.jsonl (8654 records: 4654 single + 4000 multi-command)
node scripts/eval-dispatch.mjs --pred training/runs/dispatch-oracle/oracle.jsonl --name oracle          # about 100 s, 20 workers
node scripts/make-oracle-pred.mjs --noise 0.3 --split-noise 0.2 --out training/runs/dispatch-oracle/noisy.jsonl
node scripts/eval-dispatch.mjs --pred training/runs/dispatch-oracle/noisy.jsonl --name oracle-noisy
```
Files: `src/dialog/dispatch-validate.mjs` (browser-safe), `scripts/eval-dispatch.mjs`, `scripts/make-oracle-pred.mjs`, `scripts/lib/dispatch-gold.mjs`, `tests/dispatch-validate.test.mjs`, spec 03 section 7, `specs/decisions/ADR-005-dispatcher-and-rule-validation.md`, `specs/README.md`. Results: `training/results/dispatch-oracle.json`, `dispatch-oracle-noisy.json`; traces `training/runs/dispatch-<name>-traces.jsonl` (gitignored). Two runs on the same input give byte-identical results and traces.
Results (oracle predictions = gold segmentation, gold world first, no simplified text; exact SOP, modes A top-1 + rules, B top-3 + validation, C = B + simplified, Bni = B without interpreter, Br = B accepting interpreter refusals):
- Oracle coverage 100 % (segmentation, top-1, top-3), segmentation F1 1.0. All 8654 records.
- Exact SOP: A 81.9, B 76.2, C 76.2, Bni 81.9, Br 81.8 (all records). By source: generator 100 / 94.5 / 94.5 / 100 / 100; rule-derived 100 / 90.8 / 90.8 / 100 / 99.7; paraphrase 30.1 in every mode; multi-command 74.7 / 68.0 / 68.0 / 74.7 / 74.6.
- The strict interpreter check (B) loses 5.7 points against A on the oracle: it rejects correct parses (games 83.6 -> 61.2: illegal or state-dependent moves are `unsupported`; 507 records). Br recovers it. This is a finding, not a bug of the oracle.
- Noisy oracle (30 % of pieces with the gold world at rank 2/3, 20 % of records with a wrong first segmentation): world top-1 63.9 %, top-3 100 %; exact SOP A 53.4, B 74.8, Br 80.3 (Bni 80.2). Recovery: 2639 recoverable records, wrong top-1 rejected in 2506, recovered exactly in 1881; 133 wrong top-1 accepted by the wrong world's rules.
- Failure classes at the oracle (mode C): rule gap 1209, interpreter rejects correct parse 507, sop differs 248 (mostly paraphrases and multi-command `plain` variants whose gold target was made from the punctuated text), segmentation wrong / world not in candidates 0.
Commit: (filled by coordinator)
Deviations / choices:
- Added `acceptRefused` / `interpreterPenalty` to the policy and the mode Br, beyond the task text, because the strict rule (reject on `unsupported`) was shown by the oracle to cost 5.7 points. The strict rule stays the default.
- The tie-break reuses the router: the tied worlds are formalized together and `engine.router` picks (no second tier implementation).
- Scores in log domain: "dispatcher score x validity" becomes a sum of log-probabilities with a fixed penalty per invalid piece (spec 03 section 7.3).
- Multi-command gold targets come from the source record (`source_id`), so a piece whose target depended on the source record's own context messages, or `plain` variants without punctuation, can be unreachable even for the oracle (multi-command ceiling 74.7 %).
- Segmentation match = same piece count and character IoU >= 0.6 per piece (`--seg-iou`).
- The producer must write the dataset record id as `id` (per-world test id, routing row id or `mc......`); `gold` in the prediction is ignored.

## B1 — Rebaseline — done (2026-11-08)
Baseline: c989cd1 (HEAD is 68ec94d). `git diff --stat c989cd1 HEAD -- worlds src`: only `src/dialog/dispatch-validate.mjs` (+267, D2); worlds/ unchanged.
Commands: `node scripts/export-training.mjs && node scripts/build-dataset.mjs`; `python -m psys2_train.check_splits`; `node scripts/eval-rules.mjs` (twice, rules.json byte-identical); `node scripts/eval-rules.mjs --heldout`; `npm test` (534 pass).
Dataset: 20 worlds, 40,748 records (train 31,442 / dev 4,684 / test 4,622), routing 38,899, duplicates dropped 4,901 (was 4,752), conflicting targets 926 (was 853), source records read 45,769 (was 44,873). check_splits: OK, no group or routing text crosses splits. training/dataset/stats.json changed (committed one was the 055fbeb build). training/paraphrases/out/*.jsonl were NOT rewritten (git status clean there).
Warning: build-dataset DELETED the gitignored `training/dataset/multicmd/` (it wipes every directory under training/dataset). The multicmd agent must regenerate it with its own script; build-dataset should be changed to leave it alone if both are to coexist.
Rules, 055fbeb -> c989cd1 (restricted / routed %; test splits differ in content between the two builds):
- all positives: 88.7 / 88.3 -> 94.1 / 93.4; negatives 98.1 -> 97.5 (n 412 -> 321)
- paraphrase test (contaminated): 30.1 / 30.4 -> 60.4 / 61.0; rule-derived 100 / 94.0 -> 100 / 94.3; generator 100 / 100 -> 100 / 99.7
- held-out (clean, 2,255 positives, 73 needs_review excluded: docs.reader 66, tictactoe 2, 6 other worlds 1 each): 49.4 / 50.4
- routing (rows): 89.7% -> 95.3% (unseen text 89.7 -> 95.4; real-context paraphrases 42.7 -> 75.9)
- per group (restricted / routed): kids 93.3/93.3 -> 97.9/97.8; avatar/shell/editor 84.3/84.3 -> 88.6/88.6; music/draw/map/charts 84.9/83.5 -> 86.8/85.3; games 83.6/83.8 -> 97.5/96.4; documents 100/98.7 -> 100/98.7
- held-out per group (restricted / routed): kids 58.1/57.9; avatar/shell/editor 38.9/40.5; music/draw/map/charts 41.8/42.3; games 57.5/62.1; documents 35.1/32.7. Per world in training/RESULTS.md and rules.json.
Files: scripts/eval-rules.mjs (--heldout, --no-heldout, heldout section), training/results/rules.json (c989cd1), training/results/rules-055fbeb.json (from HEAD), training/RESULTS.md (side-by-side), training/dataset/stats.json (rebuilt; dataset/ itself is gitignored).
Commit: (filled by coordinator)
Deviations / choices: one run does test splits + routing + held-out (held-out inside rules.json under `heldout`); `--heldout` = held-out only, writes training/results/rules-heldout.json by default; `--no-heldout` skips it. Held-out target = `expected_circuit`, context = record `context` (identical to `setup`), tab = record `tab`. Held-out failures are appended to training/runs/rules-failures.jsonl (source `heldout`). The 49.4% differs from the reviewer's 45% (variants-only, labelling pass); mine includes the canonical records and is exact-SOP.

## D4 — Dispatcher export, size, speed, browser runtime — done (2026-11-08 12:10)
Checkpoint: training/runs/dispatcher-distilbert (D1's first run). Everything is rerunnable with `--ckpt`.
Commands:
- `cd training && python -m psys2_train.export_onnx --ckpt runs/dispatcher-distilbert` (export fp32 opset 17 + int8 dynamic quantization, agreement, latency; writes runs/export/dispatcher-distilbert/{model.onnx, model.int8.onnx, labels.json, meta.json, tokenizer/vocab.txt + tokenizer_config.json} and results/export-dispatcher-distilbert.json)
- `python -m psys2_train.dump_tokenizer_fixture --ckpt runs/dispatcher-distilbert` (tests/fixtures/wordpiece-distilbert.json, 204 cases)
- `python -m psys2_train.dump_dispatch_reference --ckpt runs/dispatcher-distilbert --export runs/export/dispatcher-distilbert`, then `node scripts/verify-dispatcher-js.mjs --export training/runs/export/dispatcher-distilbert --ort <scratch>/node_modules/onnxruntime-node/dist/index.js [--model model.onnx --against torch]`
- `node scripts/build-webchat.mjs --models` (copies model.int8.onnx, vocab.txt, meta.json to docs/webchat/models/dispatcher/, gitignored); `npm test` (547 pass), `node src/cli.mjs test-world all` (all pass).
Results:
- Size: fp32 253.3 MB, int8 63.9 MB (target <= 150 MB: met). Weights are quantized per channel (QInt8): default per-tensor int8 gave 96.2 % top-1 agreement with fp32 on 600 items, per-channel 98.5 %; excluding the FFN layers would give 99.8 % but 145 MB, static QDQ was worse (95.8 %). Gold top-1 (lenient) on the 291 gold segments of the sample: PyTorch 93.1 %, ONNX fp32 93.1 %, int8 94.2 %.
- Agreement on 200 test items (seed 7, 291 gold segments; reference PyTorch CUDA fp32): ONNX fp32: world top-1 100 %, boundary decisions 100 % (1711/1711), top-3 order 100 %, max |dp| 6e-6. ONNX int8: world top-1 98.97 % (288/291), boundary decisions 99.82 % (1708/1711; 197/200 messages with identical boundaries = 98.5 %), top-3 SET and order identical for all pieces except the 3 flips. TARGET 99.5 % NOT MET for int8 on this sample: the 3 world flips are near-ties (0.46 vs 0.45, 0.58 vs 0.53, 0.31 vs 0.27) and top-3 candidates still contain the same worlds, so the validation layer sees the same candidates; on 1000 world records per-channel int8 agreed 99.3 % with fp32.
- CPU latency, batch 1, onnxruntime CPU on Grace (other training jobs were running, numbers vary +-20 %): one encoder pass, int8: 1 thread p50 11.1 / p95 15.0 ms, 4 threads p50 4.2 / p95 5.4 ms (fp32: 31.9/49.5 and 12.0/15.8 ms). Whole dispatch of a message (segmentation pass + one world pass per distinct candidate piece, mean 6.9 distinct pieces in this multi-command-heavy sample): int8 4 threads p50 38.7 / p95 47.7 ms (target <= 50 ms met, borderline for multi-command messages), 1 thread p50 97.5 / p95 123 ms. A single-sentence message needs about 2-3 passes (about 10-15 ms at 4 threads).
- JS vs Python (Node 22, onnxruntime-node 1.31.1, 50 test items: 25 records + 25 multi-command messages): int8 model vs Python onnxruntime int8: 50/50 identical segmentation beams (spans and order), 100 % identical top-3 world names, max |p| diff 3e-7, max log-score diff 0.04 (float32 vs double softmax); fp32 model vs PyTorch fp32: top segmentation identical 50/50, world top-3 100 %, beam identical 49/50 (one swap of two near-tied candidates).
- WordPiece (src/formalizer/wordpiece.mjs): token ids AND character offsets equal the HF tokenizer on 204 sentences (dataset sentences, routing inputs, multi-command messages, edge cases: accents, CJK, long words, punctuation, unknown words).
- Real browser: headless Chromium 1xx (/usr/bin/chromium) driven with puppeteer-core (scratch dir) against `python3 -m http.server` on docs/: model loads in ~0.8 s from localhost (64 MB), then Encoder answers `What is 20 divided by 4`, a 3-sentence Tom/Ana story, `how many legs does a spider have and what is 3 plus 4` (2 pieces: kids.animals, kids.arith) and a non-understood string (falls back to rules, dispatch status not_understood) correctly; model time per message 220-315 ms with onnxruntime-web WASM single thread, 350-500 ms end to end including validation. The trace panel shows the dispatcher section (screenshot checked).
Files: training/psys2_train/export_onnx.py (rewritten), dump_tokenizer_fixture.py, dump_dispatch_reference.py; src/formalizer/wordpiece.mjs, src/formalizer/dispatcher-runtime.mjs, src/dialog/encoder-dispatch.mjs; src/dialog/index.mjs (additive: `trace.dispatch`, `segment.dispatch`, `trace.formalizer.error`); tests/wordpiece.test.mjs, dispatcher-runtime.test.mjs, encoder-dispatch.test.mjs, fixtures/wordpiece-distilbert.json; scripts/verify-dispatcher-js.mjs, scripts/build-webchat.mjs (`--models`); docs/webchat/{app.mjs, style.css, README.md, ui/dispatcher-host.mjs, ui/trace.mjs, vendor/onnxruntime/*, vendor/README.md, lib/ (rebuilt), build-info.json}; specs/03 section 7.7, specs/06; .gitignore (`docs/webchat/models/**/*.onnx`); training/results/export-dispatcher-distilbert.json.
Commit: (filled by coordinator)
Deviations / choices:
- The webchat integration (steps 3-6) was requested by the user beyond the D4 text.
- Per-channel int8 instead of the default quantize_dynamic; int8 agreement with PyTorch is 98.97 % (world) / 99.82 % (boundary), below the 99.5 % target for world top-1 (see above). The export reloads the PyTorch model after tracing, because the in-process model gave different outputs after `torch.onnx.export`.
- The model file is NOT committed (gitignored; 63.9 MB int8 fits in 70 MB: the user decides whether to commit it). vendor/onnxruntime is committed: ort.wasm.bundle.min.mjs (77 KB) + ort-wasm-simd-threaded.mjs (loader, 24 KB) + ort-wasm-simd-threaded.wasm (14.8 MB), MIT; the "bundle" build still imports its Emscripten loader at run time, so the loader file sits beside it.
- Demo policy acceptRefused = true, exposed as a webchat setting; the validator's session history is the strategy's own memory of its last 6 messages per session.
- onnxruntime-node / onnxruntime-web / puppeteer-core were installed only in the session scratch directory, not in package.json.

## D1 — Dispatcher model — done (2026-11-08 12:08)
Baseline c989cd1 dataset (commit b24ac56). All training and inference on the GPU (NVIDIA GB10, CUDA asserted, bf16 autocast, batch 128, 4 DataLoader workers; GPU utilisation 95% during training).
Commands (from training/, venv active):
- python -m psys2_train.multicmd
- python -m psys2_train.dispatcher --model distilbert-base-uncased --no-lora --lr 5e-5 --epochs 6 --out runs/dispatcher-distilbert
- python -m psys2_train.dispatcher --model answerdotai/ModernBERT-base --no-lora --lr 5e-5 --epochs 6 --out runs/dispatcher-modernbert-full
- python -m psys2_train.dispatcher --model answerdotai/ModernBERT-base --lora --lora-r 16 --lr 3e-4 --epochs 6 --out runs/dispatcher-modernbert-lora
- python -m psys2_train.dispatcher --model distilbert-base-uncased --no-lora --lr 5e-5 --epochs 6 --no-context --out runs/dispatcher-distilbert-nocontext
- python -m psys2_train.dispatch_predict --ckpt runs/dispatcher-distilbert --split test --out runs/dispatch-pred/distilbert/test.jsonl   (same for modernbert-full; copies of the DistilBERT files in runs/dispatch-pred/)
Results (test; world on routing test rows, lenient = alt_worlds accepted; seg on multicmd test, 4000 messages):
| model | top-1 | top-3 | macro-F1 | seg F1 | exact seg | trainable params | train time |
|---|---|---|---|---|---|---|---|
| DistilBERT full, context | 0.9709 | 0.9944 | 0.9597 | 0.9854 | 0.9738 | 66.4M | 194 s |
| ModernBERT full, context | 0.9681 | 0.9956 | 0.9542 | 0.9909 | 0.9840 | 149.0M | 698 s |
| ModernBERT LoRA r16, context | 0.9653 | 0.9953 | 0.9499 | 0.9851 | 0.9732 | 3.4M | 842 s |
| DistilBERT full, no context (ablation) | 0.9409 | 0.9870 | 0.9234 | 0.9853 | 0.9732 | 66.4M | 174 s |
ModernBERT: full is better than LoRA. Held-out paraphrases (clean measure, 2255 non-review records, single segment): DistilBERT top-1 0.934 top-3 0.984; ModernBERT full top-1 0.935 top-3 0.980. Per source (DistilBERT test top-1): generator 0.980, paraphrase 0.965, rule-derived 0.912; per group: kids 0.987, documents 0.987, games 0.982, music/draw/map/charts 0.953, avatar/shell/editor 0.916. Main confusions: art.draw -> ui.avatar (14), media.music -> games.hangman (13). Overlap of routing train with dev/test by (normalized text, tab): 338 rows (kept; unseen-text subset of test, n=4054: top-1 0.9726 / top-3 0.9948 for DistilBERT). End-to-end (exact segmentation and every segment's world right) on multicmd test: 0.870 DistilBERT. Full numbers incl. per-world, per-source, confusions: training/results/dispatcher-*.json.
Targets: top-3 >= 0.99 met (all models, with context); top-1 >= 0.97 met only by DistilBERT (0.9709); seg F1 >= 0.95 met by all. Context matters (-3 points top-1 without, -12 on paraphrases).
Best checkpoint: training/runs/dispatcher-distilbert (best world); runs/dispatcher-modernbert-full has the best segmentation.
Commit: (filled by coordinator)
Deviations / choices: single seed (1) only, noise not measured (differences between models are within about 0.5 point and likely noise); 6 epochs; routing train rows are augmented with a fixed 15% lowercase/no-punctuation copy; the Q1 filter was NOT applied (user: never drop data), overlap only reported; multicmd lives in training/runs/multicmd/ with a mirror in training/dataset/multicmd/ (read by scripts/lib/dispatch-gold.mjs; build-dataset.mjs wipes the mirror, rerun python -m psys2_train.multicmd). Segmentation labels: B = first token of each non-first segment; joiners trimmed after decoding. Held-out predictions: runs/dispatch-pred/heldout.jsonl. Old provisional runs (previous dataset) kept in runs/old-provisional/. Simplification head not implemented (TODO hook in dispatcher.py).

## D4b — Publish the dispatcher model — done (2026-11-08 12:35)
Commands:
- `node scripts/build-webchat.mjs --models --meta-only` (and `--models` twice, plus `--models /nonexistent`); `npm test` (553 pass); `node src/cli.mjs test-world all` (all pass).
- `curl -sI` on the live page and model; headless Chromium (puppeteer-core in a scratch dir) against the live site and a local static server on docs/.
Results:
- Model: docs/webchat/models/dispatcher/model.int8.onnx, 66,983,402 bytes (63.9 MB), sha256 d66026ded00d07e1bca91dcc05db6e10fde50ae649de60f0db513ebc00acf16e (identical to the training export). Not overwritten.
- `build-webchat.mjs --models` is idempotent (model/vocab copied only when content differs; export date taken from the export file mtime; rerun gives no diff for models/). Missing export: prints a notice, touches nothing. New `--meta-only` regenerates meta.json from the published model. meta.json now has a `version` block: checkpoint training/runs/dispatcher-distilbert, model distilbert-base-uncased, dataset baseline c989cd1, data hash a541a99bf494dd4e, export date 2026-11-08, sha256, test world top-1 0.971 / top-3 0.994, seg F1 0.985.
- README documents how to publish a new version (overwrite same paths, one commit per version with checkpoint, dataset commit, headline metric).
- Webchat (docs/webchat/app.mjs): rules remain default; if the Encoder model fails to load, one chat note ("The Encoder model could not be loaded (...); using the rules instead."), setting reverts to rules, Settings explains. Settings shows "Model version: ..., exported, sha256 prefix, test top-1/top-3/seg F1" next to the Encoder option. Webchat lib rebuilt (the rebuild also mirrors other agents' uncommitted src/formalizer and src/dialog changes into docs/webchat/lib and build-info.json).
- Live URL: page 200; model 200, content-length 66983402, access-control-allow-origin: * (Pages had already deployed on first try).
- Browser, LIVE site (headless Chromium): selected Encoder, model downloaded and started ("ready (loaded in 3-6 s)"); "how many legs does a spider have and what is 3 plus 4" -> "A spider has 8 legs. 3 plus 4 is 7."; trace shows two segments, Formalizer: encoder. Messy "um whats 3 plus 4 and also how many legs has a spider" -> cut wrongly after "also", the first piece got a "Did you mean" suggestion, the second piece was answered ("A spider has 8 legs.").
- Browser, LOCAL (docs/ static server, with the new code): Settings shows the model version line and "ready (loaded in 2.1 s)"; same first sentence answered; a messy "hey could u tell me whats seven times six pls" was not understood (Did you mean "What time is it?"), a model-quality finding, not a loading issue. The failure fallback path was not exercised in a browser (code path only; node --check passes).
Commit: model 32fd79d; code (filled by coordinator)
Deviations: the live site could not show the new Settings version line or fallback notice (they are uncommitted); verified locally only. On the live page the option list briefly reads "Encoder (not available)" until the async availability probe finishes (pre-existing behaviour).

## D3 — Evaluation — done (2026-11-08 12:50)
Commands:
```
node scripts/eval-dispatch.mjs --name distilbert                      # test.jsonl + heldout.jsonl of training/runs/dispatch-pred, 10,877 messages, about 9 min with 20 workers
node scripts/eval-dispatch.mjs --name modernbert-full --pred training/runs/dispatch-pred/modernbert-full/test.jsonl --pred training/runs/dispatch-pred/modernbert-full/heldout.jsonl
node scripts/make-dispatch-sample.mjs                                 # training/results/dispatch-pred-kids-sample.jsonl (347 messages, 0.9 MB)
node scripts/eval-dispatch.mjs --pred training/results/dispatch-pred-kids-sample.jsonl --name kids-sample    # about 30 s; run twice with different --jobs: byte-identical JSON
npm test                                                              # 553 pass
```
Results (DistilBERT dispatcher, held-out NOT in training = the "before" number; tables in training/RESULTS.md section D3, report training/results/dispatch-distilbert.json). Headline = realistic positives (paraphrase test 636, held-out 2,255, multi-command 4,000), right / fallback / wrong %:
- all realistic: rules only 43.0 / 25.5 / 31.5; Br 68.5 / 22.8 / 8.7; B strict 64.7 / 27.2 / 8.1; Brf (Br + rules fallback) 69.1 / 18.4 / 12.5.
- multi-command: R 36.0 / 19.8 / 44.3; Br 80.8 / 11.5 / 7.8. Held-out: R 50.4 / 37.8 / 11.8; Br 49.2 / 43.1 / 7.7. Paraphrase test: R 61.0 / 18.4 / 20.6; Br 59.6 / 22.6 / 17.8. Per group (single-sentence sources included) in RESULTS.md: kids Br 60.5 (R 60.0), avatar/shell/editor 37.6 (39.4), music/draw/map/charts 40.6 (41.6), games 66.8 (70.6), documents 32.7 (32.7).
- Oracle coverage (all positives): segmentation in beam 99.9, top-1 97.5; world top-1 92.4, top-3 98.3 (held-out 94.1 / 98.9; multi-command per-message 89.1 / 97.4). Multi-command segmentation F1 0.9874.
- Exact SOP, all 10,556 positives: R 62.5, A top-1 + rules 75.3, B 74.2, Br 78.5, Brf 79.4. Games B 68.2 vs Br 82.6 (strict rejects legal state refusals).
- Recovery (Br): 606 recoverable (top-1 segmentation right, a wrong top-1 world, right world in top 3); wrong top-1 rejected 450 (74.3 %), exact after recovery 305 (50.3 %), wrong top-1 accepted 156.
- Failures of Br on realistic sources: rule gap 1496, sop differs 433, wrong reading chosen 121, world not in candidates 116, segmentation wrong 5. Biggest rule gaps: docs.editor 143, kids.common 143, art.draw 132, docs.reader 105, kids.arith 102, media.music 88, ui.shell 88, kids.animals 87 (per world with frequent words and examples in RESULTS.md and the JSON `rule_gaps`).
- ModernBERT full vs DistilBERT: headline Br 68.1 vs 68.5, world top-1/top-3 91.8/98.0 vs 92.4/98.3, multi-command seg F1 0.9916 vs 0.9874: no gain that justifies 2.2x the parameters.
- Simplification mode (C): not available (no prediction has `simplified`), C = B.
Commit: (filled by coordinator)
Deviations / choices:
- scripts/eval-dispatch.mjs extended: mode R (rules only through the dialog session over all worlds, same tab/context as the record, also for multi-command), the right / fallback / wrong outcome per mode, headline section, modes Bf / Brf (validator, then the rules over all worlds when not understood; whole-message approximation of the per-piece retry in spec 03 section 7.7), failure classification for Br instead of C, recovery for B and Br, rule gaps per world, 30-failure sample round-robin over groups and causes (realistic sources only). scripts/lib/dispatch-gold.mjs: held-out gold (id = example_id, target = expected_circuit, tab and context from the record, needs_review excluded). New scripts/make-dispatch-sample.mjs. No change to src/ (no bug found in the validation layer); the default policy in dispatch-validate.mjs is still strict (Q3 asks for acceptRefused default: it is a one-line change in DEFAULT_POLICY plus test updates, left for the task that owns src).
- R on paraphrase test and held-out equals eval-rules routed (61.0 and 50.4); R on multi-command is new (one session reads the whole message).
- "Negatives" here count a negative as correct only when no world understands it (46.1 % for R, 62.0 % for the pipeline); eval-rules asks only that the record's own world does not claim it (97.5 %).
- Multi-command targets come from the source records. The D2 oracle ceilings for multi-command (B 68.0, Br 74.6) were measured on the earlier multicmd build; Br now reaches 80.8 on the rebuilt one, so they are not comparable (the oracle should be rerun on the current dataset).
- Prediction file ids: world-record ids and multicmd ids as before; held-out ids are example_id.

## D1b — Simplification head (rephraser) — partial (2026-11-08 12:50)
Status: pipeline complete and working in the browser (local scratch build), but the head is weak: it helps by a few points only. Not published (coordinator publishes).

Commands:
- `node scripts/build-edit-tags.mjs` (alignments + vocabulary + synthetic; output `training/dataset-edit/`, not wiped by build-dataset, 16 MB) ; `python -m psys2_train.dispatcher --model distilbert-base-uncased --no-lora --lr 5e-5 --epochs 6 --out runs/dispatcher-distilbert-simp` (seed 1, all data incl. held-out) and the same with `--no-heldout-train --out runs/dispatcher-distilbert-simp-clean --results results/dispatcher-distilbert-simp-clean.json` (clean held-out evaluation).
- `python -m psys2_train.simplify_predict --ckpt runs/dispatcher-distilbert-simp --out-dir runs/edit-tags/distilbert-simp` ; `node scripts/eval-simplify.mjs --pred-dir training/runs/edit-tags/distilbert-simp --merge training/results/dispatcher-distilbert-simp.json` (same for -clean; tau sweep in `training/results/dispatcher-distilbert-simp-tau-sweep.json`).
- `python -m psys2_train.dispatch_predict --ckpt runs/dispatcher-distilbert-simp --split test --out runs/dispatch-pred/simp/test.jsonl` (+ heldout.jsonl; 1204 of 2390 top-segmentation pieces of the held-out file carry `simplified`).
- `python -m psys2_train.export_onnx --ckpt runs/dispatcher-distilbert-simp` ; `python -m psys2_train.dump_dispatch_reference --ckpt ... --export runs/export/dispatcher-distilbert-simp` ; `node scripts/verify-dispatcher-js.mjs --export training/runs/export/dispatcher-distilbert-simp --ort <scratch>/onnxruntime-node/dist/index.js`.
- Webchat: `cp -r docs/webchat <scratch>/site/webchat; node scripts/build-webchat.mjs --out <scratch>/site/webchat --models training/runs/export/dispatcher-distilbert-simp` (docs/webchat/models/dispatcher was NOT touched, per the coordinator); headless Chromium + puppeteer-core in a scratch dir.

Results:
- Alignments (7140 paraphrase variants with a target, dev+train+held-out): 3420 aligned (rewrite verified by the rules), 1341 identity-only (already formalized, no verified rewrite), 2379 dropped (2357 had no verified reference phrasing the edit tags can reach, 22 rejected by the rules). Rules fail on 3493 of the variants and 1114 of those survive as aligned (32 %). Per world (aligned / failing): art.draw 87/341, data.charts 98/282, docs.editor 201/511, games.chess 29/118, games.guess 17/60, games.hangman 26/73, games.tictactoe 17/78, geo.map 76/345, kids.animals 47/102, kids.arith 28/92, kids.common 31/137, kids.shapes 57/91, kids.shop 48/94, kids.tasks 63/160, kids.time 27/59, media.music 59/302, ui.avatar 105/283, ui.shell 70/178, docs.reader 32/107, ui.help 22/80 (full table: training/dataset-edit/report.json). Plus 690 canonical and 33461 generator/rule-derived identity examples and 8000 synthetic noise examples (train only).
- Edit vocabulary: 500 R:/P:/A: tags (cap) + KEEP/DELETE = 502 channels; tag counts in the data: KEEP 287893, DELETE 20582, R 7293, A 2475, P 457.
- Tag metrics (final model): test tag accuracy 0.967, edit F1 0.270 over all examples (precision 0.29, recall 0.25); on aligned examples only F1 0.36, precision 0.64. Exact tag-sequence match on aligned examples is only 9 % (an alignment is one of several valid rewrites, so exact match is a harsh metric).
- Main metric (rules formalize to the target SOP; original / rewrite / original-or-rewrite = what the validator achieves when it tries the rewrite after the original), edit_threshold 0.5, torch fp32:
  - final model (held-out in training): dev 680: 58.5 / 17.5 / 60.6 ; test 600: 56.2 / 15.5 / 57.2 ; held-out 2050 (contaminated): 44.8 / 26.0 / 53.1.
  - clean model (held-out NOT in training): dev 58.5 / 16.2 / 59.9 ; test 56.2 / 14.7 / 56.8 ; held-out 2050: 44.8 / 16.2 / 48.3 (recovered 72 variants, 3.5 points).
  - So simplification adds +1 to +2 points on dev/test paraphrases and +3.5 on the clean held-out set. Recoveries are of the same size as "misled" cases (original fails, rewrite parses to a different SOP): dev 14 recovered vs 20 misled, held-out(clean) 72 vs 91. Lower thresholds recover more and mislead more (tau 0.15: held-out +5.8 points, misled 141); higher thresholds do neither (tau 0.95: +1.5). The coordinator should decide the policy (for example accept a simplified reading only when the interpreter does not refuse it); the value of the head is bounded by the rule gaps: 2357 failing variants have no reachable clean phrasing.
- World/segmentation vs D1 (test; dev in brackets): top-1 0.9672 vs 0.9709 (0.9643 vs 0.9622), top-3 0.9956 vs 0.9944 (0.9922 vs 0.9957), seg F1 0.9838 vs 0.9854 (0.9629 vs 0.9649), chain 0.8635 vs 0.8698; paraphrase test top-1 0.9591 vs 0.9654. Clean model: top-1 0.9684, top-3 0.9965, seg F1 0.9852. Differences are within seed noise (about half a point); no real regression, but no gain.
- ONNX: int8 64.3 MB (D1: 63.9), 4.4 ms per pass with 4 threads (about 1.6 ms encoder pass p50, dispatch of a message 16 ms p50 at 4 threads, 32 ms at 1 thread). fp32 ONNX reproduces torch on the edit head 100 % (200 sentences); int8 gives the same rewrite as torch on 87.5 % of 200 sentences (word-tag agreement 97 %), world top-1 agreement 98.5 %.
- JS runtime vs Python int8 (50 messages, 370 pieces incl. alternative segmentations): segmentations, world top-3 and `simplified` all identical (62 pieces rewritten).
- Browser (headless Chromium, int8 model from the scratch site, Encoder formalizer): "how many hrs in a day" -> rephrased "how many hours in day", answered 24 hours; "5 stars pls" -> "add 5 stars" (drew 5 stars); "can u make the roof green" -> "make the roof green"; "head north for a bit" -> "head north" (moved north); the trace panel shows `rephrased: "..."` with a "used" tag and the rephrased attempt lines. "add column weight pls" was rephrased but the original recovered via candidate 2 (not used).
Commit: (filled by coordinator)

Deviations / choices:
- The edit head reads the world-head input (tab/recent prefix + piece), so no extra encoder pass is needed per piece; labels on the first sub-token of every word.
- Tags: KEEP, DELETE, R:, plus P: (prepend) and A: (append) for insertions; vocabulary from tags used in at least 2 tasks, cap 500.
- References for alignments are other phrasings of the same task (the canonical or any variant that the rules formalize to the variant's target SOP), choosing the cheapest alignment whose rewrite the rules accept; filler words (mined plus a short fixed list) are never produced.
- Added synthetic noise training data (8000, mined fillers and word pairs applied to clean generator texts; tags undo the noise exactly). It lowered over-editing but also recall; the first version without it (kept in training/runs/v1/, not exported) recovered slightly more on dev (23 vs 9 in the clean run) and misled more.
- Identity ratio 3:1 and non-KEEP class weight 2; edit loss weight 1; held-out paraphrases were added to world and edit training in the final model (clean variant also trained for evaluation).
- `edit_threshold` (softmax gate for non-KEEP tags) lives in meta.json; Python and JS implement the same rule.
- scripts/build-webchat.mjs: copies `edit-vocab.json` and `edit_threshold` into models/dispatcher; docs/webchat/ui (dispatcher-host.mjs, trace.mjs), src/dialog/encoder-dispatch.mjs (pieces carry `simplified`, chosen text) extended. The published docs/webchat/models/dispatcher was left untouched.
- `training/dataset-edit/` (16 MB) is not gitignored: the coordinator should decide whether to commit it or ignore the large jsonl files.
- Open: the head needs more verified rewrite pairs (rule gaps) or a stricter acceptance policy for rewritten parses before it is worth publishing.
- D1b correction: the int8 timing above is encoder pass p50 1.6 ms (4 threads) / 3.2 ms (1 thread), dispatch of a message 16 ms / 32 ms p50; the "4.4 ms per pass" figure is not from this export (see training/results/export-dispatcher-distilbert-simp.json).

## R2 progress — partial (2026-11-08 15:35)
Merged on main (each: `npm test` 577/577 and `node src/cli.mjs test-world all` green at the push):
- 861565b Avatar tolerance (user examples: colour/should-be/word orders, become/make-me, bigger eyes, lip colour refusal, clause split for catch-all matches).
- e5885b6 Webchat: Encoder default, auto-load with sha256 cache and version check, spellcheck + abbreviations (§7.9), partial understanding (§7.10), `acceptRefused` default (Q3).
- 4dbc89e docs.reader sweep: held-out rules-only restricted 35.1% → 93.9% (routed 86.1%), 61/66 needs_review canonicals now parse.
- 57062ef games sweep: held-out restricted chess 54.5 → 93.6, guess 68.2 → 88.2, hangman 56.4 → 90.9, tictactoe 50.9 → 73.6.
- 9560f5f ui.shell / ui.help / ui.avatar / docs.editor sweep: held-out restricted 46.4 → 89.1, 26.4 → 87.3, 58.2 → 91.8, 35.4 → 85.5.
- 794f290 kids.common / animals / shapes sweep: held-out restricted 53.6 → 88.2, 47.3 → 98.2, 71.8 → 99.1.
- 43ebc6a cross-world fixes after merging (ui.help how6, ui.shell plog.count3 priorities, back.v3 nouns; n22 test uses real gibberish).
Held-out rules-only total after 43ebc6a: 1680/2255 restricted (74.5 %), 1700/2255 routed (75.4 %); before the sweeps 49.4 / 50.4 %.
Command: `node scripts/eval-rules.mjs --no-write` (held-out section).
Every swept world has `worlds/<world>/coverage.md` (request-shape catalogue, supported/unsupported with reasons).
Fresh Haiku batches committed: 5852bd1, 34d5fc7 (`training/paraphrases/inbox/*.h5.json`, `docs.editor.h7.json`; 20 worlds × 12 tasks × 10 variants), not yet collected.
In progress, not pushed: integration of the music/draw/map/charts and kids.arith/time/shop/tasks sweeps (cross-world conflicts being fixed); engine changes (global fillers, indirect-question lead-ins, ordinals/number words, operators, question marker; Q5 game controls with relabelling, specificity rule, tab-only priority, name capitalization); N1 normalizer (interim, FLAN-T5-small, dev: right 58.7 → 70.7 %, fallback 30.7 → 7.2 %, wrong 10.6 → 22.1 %; misled ≈ recovered, being analysed and tightened). User decision: the normalizer will be ON by default in the webchat with a Settings flag.
Then: collect the h5 batches, rebuild the dataset, retrain the dispatcher once, publish the model, rebuild the webchat, R2 summary table.

## F4 rules, F5, F4/F6/F7/F8 training, operational set — done (2026-11-08 17:10)
Merged on main, each with `npm test` and `node src/cli.mjs test-world all` green at the push (599/599 after the last one):
- 6ddc7c1 F5: interpreter `reason` (precondition_failed / unknown_argument / unsupported_operation / execution_error), validator: unknown_argument never blocks spell/simplified recovery, last-resort fallback (`unknownArgPenalty` 4.5). 0536c02: test examples changed to "Make your eyes wobbly" because F4 expansion now reads "Make your eyes and body blue".
- 3424ec2 F4/F6/F7/F8 training: compositional multi-command programs (6 families, context kept), step budgets per head, controlled sampling with failures / contrastive near-misses / replay pool, `shown` logging, pipeline checkpoint selection hook (`selection.py` → `scripts/eval-operational.mjs --model-dir --edit-tau --json`), overlapping windows (Python + dispatcher-runtime.mjs). GPU smoke only (360 steps: world top-1 0.9605, seg F1 0.9625); no final model yet. Rules verification of compositional test records: steps parse 1600/1600, composite agrees 397/1600 before F4 rules.
- 0bd45a8 F4 rules: conservative pre-parse expansion in src/formalizer/rules/expand.mjs (self-correction, repetition, verb ellipsis, shared argument; provenance in seg.expanded), spec 03 §1c; eval-rules identical per world.
- 1de5a5a Operational set: training/eval/operational.jsonl (1234 messages, expectations by judgment, 117 known_gap), scripts/eval-operational.mjs. Headline (measured before F4 rules): rules-only right 84.3 / partly 1.9 / wrong 3.6 / not understood 10.3 %; full pipeline 89.0 / 0.5 / 4.3 / 6.2 % (excluding known gaps 92.5 %). Commands: `node scripts/eval-operational.mjs --rules-only` and `node scripts/eval-operational.mjs --ort <onnxruntime-node dir>`.
Open: integration of engine normalization + N1 + routing/Q5 (branch in progress), F1 relabel (in progress); then rebuild dataset, retrain dispatcher, publish.
## N1 — seq2seq normalizer (branch worktree-agent-adbf10d6120f87865)

Commands:
- `node scripts/build-normalizer-pairs.mjs --extra-dir <collected h5/h7 out dir>` (pairs, report in training/dataset-normalizer/report.json); h5/h7 collected into a scratch dir with `node scripts/collect-paraphrases.mjs <dir with *.h5.json, docs.editor.h7.json> --out-dir <scratch>`; half of their tasks (hash parity) train, the other half is the fresh evaluation set (1040 variants).
- `TORCH_DISABLE_NATIVE_JIT=1 PYTHONPATH=training python -m psys2_train.normalizer train --model google/flan-t5-small --out training/runs/n1/flan-t5-small-v2 --epochs 4` (about 4 min per epoch on the GB10); `... predict --fp32 --ckpt ... --requests ... --out ...`
- `node scripts/eval-normalizer.mjs list --out <requests>` / `score --pred <outputs> --name <n> --d1b <edit-tags pred dir>`; `node scripts/analyze-normalizer.mjs --pred ... --name ...` (error classes)
- `python -m psys2_train.export_normalizer --ckpt ... --out ...` (int8 encoder + decoder with past key values, agreement, latency); JS runtime src/dialog/normalizer-runtime.mjs with onnxruntime-node in a scratch dir.

Pair counts (final build, rules of main bc240b2): train 191,461 / dev 4,881. Train per source: variant 1,445; variant-shorter 3,071; variant-canonical 4,213; variant-identity 414; abstain 234; canonical 304 (+180 shorter); generator 10,611 (+12,858 shorter); rule-derived 1,371 (+962 shorter); pattern example 1,190 (+4,608 shorter); synthetic noise 150,000. Dev: variant 162, variant-canonical 555, variant-shorter 440, variant-identity 57, abstain 20, generator 1,255 (+2,030), rule-derived 197 (+98), canonical 51 (+16).

Models (first build, old rules, 205k pairs): FLAN-T5-small 77M dev exact-match 0.403, T5-small 60M 0.417, ByT5-small 300M 0.398 after epoch 1 (stopped; over the 100M cap). FLAN v2 (current rules, +abstain, +half of h5/h7): 0.410.

Results (right share before -> after; recovered / misled; broken = 0 by construction, lexicographic preference). Rules of 2026-11-08 now read most phrasings, so only 431 pieces of 4,370 reach the normalizer. All splits together, FLAN v2 fp32, per world group:
- D1b head (clean model), value check on: ALL 77.7 -> 78.5, recovered 33 / misled 14; music/draw/map/charts 1/3; avatar/shell/editor 11/7; games 11/1; kids 5/3; documents 5/0.
- N1 basic checker: ALL 77.7 -> 81.8, 180 / 144 (0.80); strict: 79.3, 69 / 34 (0.49); strict + min score -0.3 (shipped): 78.9, 51 / 18 (0.35); music/draw/map/charts 2/2; avatar/shell/editor 22/7 (0.32); games 5/6; kids 20/3 (0.15); documents 2/0.
- fresh (1040, not trained on): rules 65.1; D1b 67.9 (29/10); N1 shipped policy fp32 68.9 (39/8 = 0.21), int8 JS beam 3 68.7 (37/11 = 0.30); strict without gate 70.2 (53/16); basic checker 78.0 (134/73 = 0.55).
- dev: rules 73.2; N1 shipped 74.6 (9/1), int8 74.3 (7/1); test: 12 pieces only, 0-1 recovered; held-out: 86.2 -> 86.3 (3/7: the residue is mostly unreadable text).
- Target misled <= 1/4 recovered: met on dev and fresh (fp32), not on held-out/test (tiny counts) nor in games (6/5). Not met with the basic checker.

Misled error analysis (v1 model, basic checker, dev + held-out, 522 misled vs 558 recovered, training/results/normalizer-misled-analysis-v1.json): (b) value changed 147 (e.g. "redo the last step" -> "Undo.", "can you say where the trees are" -> "Where is my house?"), (c) negation/polarity 115 ("speaker on" -> "listen", "sun up a bit" -> "Make the sun twice as big."), (d) different action 168 ("undo the undo" -> "Undo.", "i gave 2 lei to the shop" -> "I received 2 lei."), (a) label noise 22 by the automatic rule (rewrite keeps all values and reads to the same action: "can u make it a sunny day" -> "Make it a sunny day", "reading finished" -> "I finished my reading."), (f) other 70, (e) different world 0 (rules run in the gold world). By hand most (f) are the same action with a dropped item ("Austria borders what countries" -> "Who borders Austria?"), which the strict checker (known word dropped) now rejects; the true share of label noise is larger than 22 but not measured by hand. Excluding (a): ratio 0.90 -> after the strict checker and gate see the table above.

Browser (headless Chromium, onnxruntime-web WASM, 1 thread): int8 files encoder 39.0 + decoder 55.5 + tokenizer 2.4 = 97 MB (fp32 374 MB), loaded in 0.8 s from localhost, cached by sha256; beam-3 rewrite per (world, piece) 40-115 ms (median about 75 ms); onnxruntime-node (CPU, JS beam search) median 25 ms at 1 thread, python onnxruntime greedy int8 16 ms; the JS beam search equals Hugging Face on 100 pieces (fp32); int8 changes 52%% of greedy strings versus fp32 (quality of the metric above is for the int8 JS path).

Notes: with the rebased rules `eval-simplify` style numbers of D1b dropped (35 recovered over all splits). The abstain targets (input returned unchanged) are few (254) because the widened pattern examples give most variants a verified equivalent. Not done: pipeline-level eval-dispatch run with the normalizer (the --normalizer-record / --normalizer options exist in scripts/eval-dispatch.mjs, untested end to end), ByT5 beyond epoch 1, retraining with the strict checker in the loop.

## L0 — baseline at cff3f36 (2026-11-08)
- `eval-operational --rules-only --json --no-write`: n 1234, right 1066, partly 19, wrong 38, not_understood 111, latency_ms (mean) 108. (The task text quotes 1062/18/37/117; the operational set at this commit is 1234 messages, so these are the L1 reference counts.)
- `eval-rules --no-write`: positives restricted 4165/4301 (96.8%), routed 4129/4301 (96.0%); negatives restricted 264/321 (82.2%), routed 262/321 (81.6%); held-out total restricted 2165/2237 (96.8%), routed 2207/2237 (98.7%); routing 4230/4300 (0.9837), unseen text 3999/4054 (0.9864); wall 105 s.
- `time node src/cli.mjs test-world all`: all worlds green, real 3m10s.
- `node scripts/pattern-stats.mjs` (new): 21 worlds, 4520 patterns, 6,011,795 bytes of match text; 30,258 alternative groups, 713,927 alternatives, 7,448 distinct groups; 2,015 groups occur more than once (24,825 occurrences; largest copies: a 187-alternative lead-in x 808 in 3 worlds, a 51-alternative one x 692 in one world); unreachable alternatives 117,339 = 16.4% of all alternatives (counted as occurrences; fillers `please hey pls ok plz okay um well ...` and contractions, which the tokenizer drops or splits; the analysis report counted distinct alternatives per list and got 7%); union sizes lead 3,559, tail 5,273, filler 3,672 (`--union lead|tail|filler`).

## L1 — matcher prefilter (2026-11-08)
`matcher.mjs`: `prefilterNeeds` (first-word sets of mandatory literals/groups, smallest set first), `wordBag`, `prefilterPasses`; `index.mjs` `rankMatches` builds one bag per view (and per no-percent view) and skips patterns that fail it. Spec 03 "Prefilter". Fuzz test `tests/matcher-prefilter.test.mjs` (own-pattern examples over both views plus every 40th example against all 4520 patterns).
- `eval-operational --rules-only`: identical counts to L0 (1234 / right 1066 / partly 19 / wrong 38 / not understood 111); latency_ms mean 108 -> 37.
- `test-world all`: real 3m10s -> 45s, all green. `npm test` 659/659. `eval-rules`: identical to L0 (restricted 4165/4301, routed 4129/4301, negatives 264/321 | 262/321, held-out 2165/2237 | 2207/2237, routing 4230/4300).
