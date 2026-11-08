# Worker tasks — DGX Spark training session

This file is the single entry point for the worker agent that runs on the DGX Spark machine.
Read it from top to bottom before doing anything, then work through the tasks in order.

## 0. Protocol (read first, follow always)

Three files coordinate the worker and the reviewer:

| File | Who writes | Rules |
|---|---|---|
| `worker-tasks.md` (this file) | reviewer only | **Append-only.** The worker never edits it. The reviewer never changes earlier text; new tasks, answers and corrections are appended at the end as new sections (`## Round N`). A later section overrides an earlier one when they conflict. |
| `questions.md` | worker appends, reviewer removes | The worker appends a question whenever it is blocked or a decision is not covered here, and **never deletes** anything. The reviewer removes a question only after answering it in a new section of `worker-tasks.md`. |
| `worker-log.md` | worker only | Append-only progress log: one entry per task with status (`done` / `partial` / `blocked`), commands run, key numbers, commit hash, deviations. |

Working rules:

1. Everything written to disk is in English (AGENTS.md). Read `AGENTS.md`, `training/README.md`, `specs/08-training-data.md` and `specs/10-paraphrase-data.md` before starting.
2. Work directly on `main`, commit after each task with the message `Tn: <summary>`, and push. No pull requests.
3. Never commit checkpoints, datasets or large files: `training/runs/` and `training/dataset/` stay out of git. Commit only code, small metric files (`training/results/*.json`) and `training/RESULTS.md`.
4. When a question is not blocking, write it to `questions.md`, take the most reasonable choice, note the choice in `worker-log.md`, and continue. Stop only when a task cannot be done without an answer; then move on to the next task that does not depend on it.
5. Do not change world rules (`worlds/*`) or the JS runtime (`src/*`) except where a task says so. Training code lives in `training/psys2_train/`.
6. Every number reported must come from a command that is written in `worker-log.md`, so the reviewer can rerun it.
7. Fix the random seeds (`--seed 1`, dataset seed 1337). When something is noisy, run 3 seeds and report the mean ± std.
8. When all tasks are done (or blocked), append a final entry `SESSION END` to `worker-log.md` with a summary table and stop.

## 1. Context in five lines

PSys2 turns sentences into SOP Lang circuits per *world*; the rule formalizer is the baseline. Today we train small encoders (ModernBERT, DistilBERT, LoRA) on three sources: generator data (`training/data`), Haiku-written human-like paraphrases with labels anchored on a canonical command (`training/paraphrases/out`), and phrase logs (`training/phrase-logs`, possibly empty).

The working hypothesis: on small worlds, **rules plus a small learned front-end** (routing, sentence splitting, normalization towards canonical phrasings) can match a per-world neural formalizer. Today's results must say how far rules alone go, what each model adds, and at what size and latency.

## 2. Tasks

Each task has: goal, steps, validation (what the reviewer will check), outputs.

### T0 — Environment

Goal: a working GPU Python environment and Node.js on the DGX Spark (aarch64, Grace Blackwell, unified memory).

Steps:
1. `git pull`. Check `node --version` (≥ 20) and `python3 --version` (≥ 3.10).
2. Prefer NVIDIA's PyTorch container from NGC (aarch64 with CUDA) or an aarch64 CUDA wheel. In it run `pip install -r training/requirements.txt`, then `python training/check_env.py`.
3. `npm test` and `node src/cli.mjs test-world all` must pass (they check the rule baseline you will compare against).
4. `bash training/smoke_test.sh` (tiny random model, no download) must end with `smoke test OK`.
5. Check that `answerdotai/ModernBERT-base` and `distilbert-base-uncased` download. Write the versions of torch, transformers and peft, the CUDA version and the GPU name to `worker-log.md`.

Validation: log lists the versions, the test counts, and smoke test OK.

### T1 — Dataset rebuild and sanity

Steps:
1. `git pull` again first: rule improvements may land on `main` while T0 runs. Record the commit hash you build from in `worker-log.md`; it is the baseline commit for every later number. After that, do not pull again until T9 unless a new round in this file asks you to.
2. `node scripts/export-training.mjs`, `node scripts/collect-paraphrases.mjs training/paraphrases/inbox --report`, then `node scripts/build-dataset.mjs`.
3. Compare `training/dataset/stats.json` with the committed version and explain any large difference.
4. Check that no group (`group` field) appears in two splits; write a short script `training/psys2_train/check_splits.py` for this.

Validation: the split check passes, and stats are logged per world, split and source.

### T2 — Rule baseline on the test splits

Goal: the number every model has to beat.

Steps:
1. Write `scripts/eval-rules.mjs` (Node). For each `training/dataset/<world>/test.jsonl` record, run the rule formalizer with the record's routing context: fresh session, active tab from the record, setup sentences if any. Compare the produced SOP with the target after id normalization; reuse the comparison in `scripts/collect-paraphrases.mjs`.
2. Report exact-SOP accuracy per world and per source (generator / paraphrase). Also report world-routing accuracy on `routing.jsonl` test rows.
3. Save the results to `training/results/rules.json` and a table in `training/RESULTS.md`.

Validation: the reviewer reruns `node scripts/eval-rules.mjs` and gets the same numbers.

### T3 — Fix the target design (compositional skeletons)

Problem found yesterday: the model classifies the whole circuit skeleton as one class, and many dev and test skeletons never occur in train. Only 41% of kids.arith dev skeletons are seen in train, 75% for art.draw. A classifier cannot predict an unseen class.

Steps:
1. Measure the unseen-skeleton rate per world (dev and test) with the current scheme; `python -m psys2_train.oracle` is a starting point.
2. Implement a compositional target: predict **per wire** (wire type + key set) with a multi-label or pointer-style head, plus BIO slot tags for values. Decode back to SOP with the same `sop.py` decoder, extended as needed. Keep the old scheme behind a flag (`--target circuit|wire`).
3. Report the oracle ceiling for both schemes per world (what exact-SOP accuracy a perfect tagger would get).

Validation: the oracle ceiling for the `wire` scheme is ≥ the `circuit` scheme on every world, and unit tests in `training/tests/` cover encode/decode round trips on 50 random records per world.

### T4 — Routing head

Steps:
1. Train routing (text + context → world) with ModernBERT-base: LoRA r=16, then full fine-tune. Try with and without context (`--no-context`).
2. Report accuracy, macro-F1 and a confusion matrix of the top confusions, compared with the rule router from T2.

Validation: results go to `training/results/routing-*.json`. Target: ≥ 0.97 test accuracy with context, and better than rules. If the target is missed, analyse the errors and report.

### T5 — Per-world formalizers

Steps:
1. Start with kids.arith, then every world. Use ModernBERT-base + LoRA r=16 with the best target scheme from T3.
2. Metrics per world on test: exact-SOP match, slot F1, wire-type F1. Report separately for generator records and paraphrase records; paraphrases are the interesting part.
3. Compare per world with the rules (T2).
4. Also try **one shared model for all worlds** (world id as a prefix token or as context) and compare with per-world adapters.

Validation: `training/results/sop-<world>-<model>.json` for each run, plus a table in RESULTS.md (world × {rules, per-world LoRA, shared}).

### T6 — DistilBERT vs ModernBERT ablation

Run the same splits and seeds for:
- DistilBERT full fine-tune (`--model distilbert-base-uncased --no-lora --lr 5e-5`);
- ModernBERT LoRA;
- ModernBERT full fine-tune.

Run them on routing and on 4 worlds: kids.arith, ui.avatar, games.chess, docs.editor.

Report:
- accuracy (exact SOP, slot F1, routing accuracy);
- trainable parameters;
- training time;
- size after int8 ONNX export (see T8);
- CPU latency per sentence, batch 1, on the Grace CPU.

Validation: a table in RESULTS.md with 3 seeds where noise matters.

### T7 — Learned front-end: segmenter + canonicalizer (the main hypothesis)

Goal: test the architecture in which a single small model, shared by all worlds, cleans the input and routes it, and the rules still do the formalization:
1. It splits a message into sentences/commands.
2. It routes each piece to a world.
3. It normalizes a messy phrasing towards a canonical phrasing that the world's rules understand.

Steps:
1. **Canonicalizer by retrieval.** Embed all canonical phrasings and pattern `example=` lines of the world. For a variant, retrieve the nearest canonical in that world. Then fill its slots with the variant's values, using the T5 slot tagger or a simple aligner. Run the rules on the rewritten sentence.
2. Measure end-to-end exact SOP on paraphrase test records for:
   - rules only;
   - retrieval + rules;
   - retrieval + slot transfer + rules;
   - full neural (T5).
3. **Segmenter.** Build multi-command messages by joining 2–3 test sentences with "and", "then" or punctuation. Train a token boundary tagger, or reuse the routing model with a B/I tag head. Report segmentation F1, and end-to-end accuracy when each segment goes to rules.
4. Optional: a small seq2seq normalizer (e.g. a T5-small-size model) trained on variant → canonical pairs, if time remains.

Validation: one table — rules only vs front-end + rules vs full neural, per world group (kids, avatar/shell/editor, music/draw/map/charts, games, documents). This table answers the hybrid-vs-neural question; the conclusion goes in RESULTS.md.

### T8 — Export and runtime

Steps:
1. Finish `training/psys2_train/export_onnx.py`: export the best routing model and the best per-world (or shared) model to ONNX, with int8 dynamic quantization.
2. Check numerically that ONNX and PyTorch agree on 200 test sentences (same predictions on ≥ 99.5%).
3. Measure size and latency with `onnxruntime` on CPU. If time remains, load the model in Node with `onnxruntime-node` or transformers.js.
4. Stretch goal: implement `createEncoderFormalizer` in `src/formalizer/strategy.mjs` against the ONNX model, so that `collect-paraphrases.mjs --strategy encoder` works. Keep rules as the fallback (spec 06). Only do this if T2–T7 are done.

Validation: the files go to `training/runs/export/`, not git. Commit the numbers, the export code and any `src/` change with tests.

### T9 — Results report

Write `training/RESULTS.md` with:
- setup (hardware, versions, commands);
- tables from T2 and T4–T8;
- the hybrid vs neural conclusion (T7), with numbers;
- error analysis: 20 typical model errors and 20 typical rule errors, with the sentence and the predicted vs expected SOP;
- recommendations: which worlds need a learned formalizer and which do fine with rules plus the front-end;
- next steps.

Validation: every number in RESULTS.md traces back to a `training/results/*.json` file and a command in `worker-log.md`.

## 3. Priorities if time runs short

T0 → T1 → T2 → T3 → T4 → T5 (kids.arith, ui.avatar, games.chess, docs.editor first) → T7 → T6 → T8 → T9. Always write T9 at the end, even if partial.

## 4. Reviewer validation (what happens after the session)

The reviewer will:
- rerun `npm test`, `node src/cli.mjs test-world all`, `node scripts/eval-rules.mjs`, the split check, and one training run picked at random with the logged command (on a smaller `--max-steps`);
- check that RESULTS.md matches the JSON results.

Then the reviewer appends a new round here with corrections and further tasks.

## Round 1 — priority change: the front-end comes first (reviewer, before the session starts)

This section overrides the priorities in §3. The main goal of this session is the **shared learned front-end**: one encoder shared by all worlds, with the rules still doing the formalization.

New order: T0 → T1 → T2 → T3 (measurement only: unseen rate and oracle; the implementation can wait) → T4 (routing) → **T7 extended (below)** → T5 → T6 → T8 → T9.

### T7 extended — a shared encoder with three heads

Use one encoder (ModernBERT-base first, then DistilBERT for comparison) with three heads trained jointly or one after another. Report each head on its own and the whole chain end to end.

1. **Segmentation head** — token tagging B/I. It splits a message into commands, using the joined multi-command messages built as in T7 step 3. Metric: segment boundary F1.
2. **World head** — sequence classification. Each segment, plus its context, goes to a world (this is the T4 model; reuse it). Metric: accuracy.
3. **Simplification head** — edit tagging, not generation. An encoder cannot write free text, so per token predict:
   - `KEEP`, `DELETE` (fillers, politeness, hesitations: "um", "could you please", "for me");
   - `REPLACE:<w>`, with `<w>` from a small replacement vocabulary built from the data ("hrs" → hours, "whats" → what is, number words, frequent synonyms that map onto the pattern vocabulary).
   
   This is the edit-tagging approach used in grammar correction. Build the training targets by aligning each paraphrase variant with its task's canonical phrasing (or with its rewrite into pattern vocabulary). Keep only alignments that the rules then parse into the target SOP; report how many survive.
   - Metric: the share of rewritten variants that the rules formalize to the target SOP.
   - Compare with retrieval + slot transfer (T7 step 1) and with rules alone.

End-to-end table, per world group: rules only · world head + rules · segmentation + world + simplification + rules · full neural per-world (T5, if done).

Also report the size and CPU latency of the shared encoder (int8 ONNX, T8 method). The whole front-end has to stay small enough for the browser.

## Round 2 — session scope: Stage 1 = the dispatcher only (reviewer, overrides §2–§3 and Round 1)

**The goal of this session is to avoid training per-world models.** We validate one idea first: a single small shared model, the **dispatcher**, proposes candidates, and the existing rule formalizers validate them. No per-world LoRA in this session.

### Stage 1 (this session)

Tasks, in order:

1. **T0, T1, T2** as written. T2 is the baseline: rules only, with the current rule router.
2. **D1 — dispatcher model.** One encoder (ModernBERT-base; DistilBERT as the comparison, same data) with three heads:
   - **segmentation:** a boundary probability per token. It cuts messages into small pieces (commands, clauses);
   - **world candidates:** for each piece, a ranked list of the **top-k worlds with scores** (k = 3), using the context (active tab, recent worlds);
   - **simplification (optional head):** KEEP / DELETE / REPLACE edit tags as in Round 1. It produces a cleaner variant of each piece. The original piece is always kept as a candidate too.

   Train with LoRA or full fine-tune, whichever is better for this single model. Training data: `routing.jsonl`, multi-command messages built from test-disjoint sentences (join 2–3 with "and", "then", commas, periods), and the edit-tag alignments of Round 1.
3. **D2 — validation layer (JS, in `src/`).** It takes the dispatcher output (candidate segmentations, top-k worlds per piece, optional simplified text) and **checks the candidates with the rule formalizers**:
   - Build candidate segmentations: the most likely one plus alternatives from uncertain boundaries (a small beam, ≤ 4).
   - For each piece, try the candidate worlds in score order, on both the original and the simplified text. Restrict the rule formalizer to that world (and its `extends`).
   - A candidate is **valid** when the world's rules parse it completely (no unparsed tokens left) and the interpreter does not return `unsupported` or `error`.
   - Choose the segmentation with the best total score (dispatcher score × validity, with a penalty for unparsed pieces). Ties are broken by the routing policy tiers (ADR-004: modal, navigation, active tab, …).
   - If nothing validates, return the best candidate as "not understood" together with the candidate worlds. `ui.help` can then say "Did you mean …?".
   - Write the trace: candidates, which ones validated, why the winner won.
   - Spec: new section in `specs/03` (or a new spec) plus ADR-005. Unit tests.

   For the evaluation, the dispatcher can run offline: Python writes the predictions to JSONL, and Node (`scripts/eval-dispatch.mjs`) runs the validation layer over them. The reviewer must be able to rerun the Node part from the committed predictions file of one world group.
4. **D3 — evaluation.** Per world group and source (generator / paraphrase / multi-command), on the test splits:
   - **oracle coverage:** is the right world in the top-1 / top-3 candidates; is the right segmentation in the beam;
   - **end-to-end exact SOP:** rules only (T2) · dispatcher top-1 + rules · dispatcher top-3 + validation · top-3 + simplification + validation;
   - **segmentation F1** on multi-command messages;
   - how often the validation layer **rejects a wrong top-1 and recovers** with candidate 2 or 3;
   - error analysis: 30 failures, sorted into causes: the right world not among the candidates · segmentation wrong · the rules cannot parse even the simplified text (= a rule gap, which tells us where rules are missing) · other.
5. **D4 — size and speed.** The dispatcher as int8 ONNX (T8 method): size, CPU latency per message, PyTorch/ONNX agreement on 200 sentences. If time remains, run it in Node (onnxruntime-node or transformers.js) behind `createEncoderFormalizer`, so the webchat build can use it later.
6. **T9 — RESULTS.md**, limited to Stage 1, with a clear verdict: is dispatcher + rules good enough on its own? Per world group, say which groups are satisfied and which are not, and why (rule gaps vs dispatcher errors).

### Acceptance targets for Stage 1 (what "good enough" means)

The verdict is against these numbers:
- world top-3 coverage ≥ 0.99 and top-1 ≥ 0.97 on test, with context;
- segmentation F1 ≥ 0.95 on multi-command messages;
- end-to-end exact SOP with dispatcher + validation clearly above rules only on paraphrase records. Report the gain per world group;
- dispatcher int8 ONNX ≤ 150 MB and ≤ 50 ms per message on the Grace CPU.

### Stage 2 (NOT in this session)

Stage 2 runs only if Stage 1 is not satisfactory, and only for the world groups that fail:
- T3 compositional targets;
- T5 per-world or shared formalizers;
- the T6 ablation beyond the dispatcher;
- a seq2seq normalizer.

Do not start them. If you finish Stage 1 early, write in `questions.md` which Stage 2 task you would run first, with the evidence from D3, and stop.
