# Worker tasks — DGX Spark training session

This file is the single entry point for the worker agent that runs on the DGX Spark machine.
Read it from top to bottom before doing anything, then work through the tasks in order.

## 0. Protocol (read first, follow always)

Three files coordinate the worker and the reviewer:

| File | Who writes | Rules |
|---|---|---|
| `worker-tasks.md` (this file) | reviewer only | The worker never edits it. **The reviewer manages it:** after validating a task, the reviewer deletes it (it moves to "Validated" at the end as one line). When a task fails review, the reviewer rewrites it with what must be fixed. Answers and new tasks go into the relevant task or a new round. **Always read the current version: `git pull` before starting each task.** |
| `questions.md` | worker appends, reviewer removes | The worker appends a question whenever it is blocked or a decision is not covered here, and **never deletes** anything. The reviewer removes a question after answering it in this file. |
| `worker-log.md` | worker only | Append-only progress log: one entry per task with status (`done` / `partial` / `blocked`), commands run, key numbers, commit hash, deviations. Write the entry and push as soon as a task is done: the reviewer validates from it. |

Baseline freeze: the current baseline commit is given in §2. The reviewer does not change `worlds/` or `src/` after it, except through a task in this file. So pulling before each task is always safe.

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

## 2. Current state, answers and corrections (reviewer, 11:00)

**T0, T1 and T2 passed review.** I reran `scripts/eval-rules.mjs` at c95e250: all 818 numbers were identical. See "Validated".

**New baseline: c989cd1 (my error, sorry).** The reviewer pushed a rule-widening commit after you had recorded 055fbeb, breaking the freeze. The commit widens rules in 18 worlds, fixes dictation stop, the avatar apology and chess moves on the Music tab, and relabels the paraphrases. These rules are what the validation layer will use, so take c989cd1 as the baseline. `worlds/` and `src/` are frozen from now on.

**Contamination.** The rules were widened by reading **all** paraphrase records, including the test split. From now on, rule numbers on paraphrase test records are optimistic. That makes the comparison unfair in favour of rules alone; it does not touch the dispatcher's training data.

The clean measure is a fresh **held-out paraphrase set** that nobody has used for rules: `training/paraphrases/heldout/`. **It has landed (11:20):** 21 batches, 210 tasks, 2,100 variants, one batch per world (two for docs.reader), labelled at c989cd1. Rules understand 45% of these variants, against 55% on the training paraphrases. In the games the rules were tuned on the training paraphrases: 80–93% there, 36–44% here. Five docs.reader canonicals fail or are partial; their variants are flagged `needs_review`. Exclude them from metrics and count them. (Update 11:45: this set may now be used for training; see the data principle below.)

### Data principle (reviewer, 11:45): read the new section in AGENTS.md; it overrides earlier purity rules

We are building an engineering system that learns as it is used, not doing fundamental research. What matters is what users experience. Concretely, this replaces earlier instructions:
- **Train on all the data we have**, including `training/paraphrases/heldout/` and the routing rows that overlap dev/test. Withdraw the Q1 instruction to drop overlapping routing rows. Keep dev only for early stopping and for picking hyperparameters.
- The held-out set may go into training once its "before" number is reported. Mark later numbers on it as "seen". When we need a fresh clean number, the reviewer generates a new held-out batch.
- **Headline metric = user-perceived understanding:** the share of realistic user messages (paraphrases, held-out, multi-command, later phrase logs) that end in the right action/answer through the full pipeline (dispatcher → validation → rules). Report it per world group, next to how many messages fall back to "Did you mean …?".
- Contamination warnings are no longer needed in RESULTS.md beyond one line per table saying what was trained on.

### D5 — learning loop (new, after D3; small and practical)

Write `scripts/learn-from-logs.mjs` plus a README section. It takes phrase-log exports (`training/phrase-logs/*.jsonl`) and the failure traces of the evaluation scripts, then:
1. **Self-labels** messages that the dispatcher + validation layer resolved validly with a clear margin. They go to `training/phrase-logs/labelled/` with `label_status=self-validated`.
2. Queues the rest in `training/phrase-logs/review.jsonl`, grouped by world candidate and by the closest pattern example. A coding agent or the reviewer turns them into new patterns or canonical tasks.
3. Rebuilds the dataset and retrains the dispatcher in one command (`--retrain`).

Simulate one loop with the held-out set as fake logs, and report the before/after headline metric.

### Answers and notes (reviewer, 11:30)

- **Q3 (`acceptRefused`): yes, make it the default.** A complete parse whose action the current state refuses is a correct understanding, and the refusal is the reply: an illegal chess move, drawing on an empty canvas. Make Br the default policy and keep strict as an option. Keep three cases apart where the status allows it:
  - a state refusal (an operation exists, the precondition fails) is **valid**, with a small penalty used only to break ties;
  - `unsupported` because no operation or legend key handles the wires is **invalid**;
  - `error` (an exception) is **invalid**.

  If the current statuses cannot tell the first two apart, add a reason field in `dispatch-validate.mjs`, not in the worlds, and report how often each case occurs. Update spec 03 §7 and ADR-005.
- **build-dataset wipes `training/dataset/multicmd/`:** change `scripts/build-dataset.mjs` so that it removes only the world directories it writes, or move multi-command data generation into build-dataset itself (preferred: one command builds everything). Note it in the D1 log entry.
- **Use `--jobs` wisely:** evaluations reproduce exactly. The reviewer reruns subsets with `--limit`, so keep `--limit` deterministic: the first N records in a fixed order.

## 3. Stage 1 tasks — the dispatcher (this session)

**The goal of this session is to avoid training per-world models.** We validate one idea first: a single small shared model, the **dispatcher**, proposes candidates, and the existing rule formalizers validate them. No per-world LoRA in this session.

Order: D3 → D1b → D5 → T9 (Stage 1 only). D1, D2 and D4 are done.

2. **D1 — dispatcher model:** done and validated (segmentation + world heads; DistilBERT kept as the main model).
   **D1b — simplification head (still open, do after D3).** It is the third head of Round 1: KEEP / DELETE / REPLACE edit tags, learned from aligning the paraphrase variants with their canonical phrasings. D3 will show how many failures are rule gaps on messy wording; this head targets exactly those. Add it to the DistilBERT dispatcher, export it in the same ONNX model, and use it in the validation layer: try the simplified text when the original does not validate. Report the headline metric before and after.
3. **D2 — validation layer:** done and validated. The default policy changes to accept state refusals (see the answer to Q3).
4. **D3 — evaluation.** Per world group and source (generator / paraphrase / multi-command), on the test splits:
   - **oracle coverage:** is the right world in the top-1 / top-3 candidates; is the right segmentation in the beam;
   - **end-to-end exact SOP:** rules only (T2) · dispatcher top-1 + rules · dispatcher top-3 + validation · top-3 + simplification + validation;
   - **segmentation F1** on multi-command messages;
   - how often the validation layer **rejects a wrong top-1 and recovers** with candidate 2 or 3;
   - error analysis: 30 failures, sorted into causes: the right world not among the candidates · segmentation wrong · the rules cannot parse even the simplified text (= a rule gap, which tells us where rules are missing) · other.
5. **D4 — size and speed:** done and validated (int8 63.9 MB, about 4 ms per pass, runs in the browser).
6. **T9 — RESULTS.md**, limited to Stage 1, with a clear verdict: is dispatcher + rules good enough on its own? Per world group, say which groups are satisfied and which are not, and why (rule gaps vs dispatcher errors).


Details for the simplification head (edit tagging):


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

### Acceptance targets for Stage 1 (what "good enough" means)

The verdict is against these numbers:
- world top-3 coverage ≥ 0.99 and top-1 ≥ 0.97 on test, with context;
- segmentation F1 ≥ 0.95 on multi-command messages;
- end-to-end exact SOP with dispatcher + validation clearly above rules only on paraphrase records. Report the gain per world group;
- dispatcher int8 ONNX ≤ 150 MB and ≤ 50 ms per message on the Grace CPU.


For D3, lead with the user-perceived headline metric (see the data principle in §2). Then report the held-out "before" number and the test splits.

### T9 — Results report (Stage 1 only)

Write `training/RESULTS.md` with:
- setup (hardware, versions, commands);
- tables from T2 and T4–T8;
- the hybrid vs neural conclusion (T7), with numbers;
- error analysis: 20 typical model errors and 20 typical rule errors, with the sentence and the predicted vs expected SOP;
- recommendations: which worlds need a learned formalizer and which do fine with rules plus the front-end;
- next steps.

Validation: every number in RESULTS.md traces back to a `training/results/*.json` file and a command in `worker-log.md`.


## 4. Stage 2 — parked, NOT in this session

Stage 2 runs only if Stage 1 is not satisfactory, and only for the world groups that fail:
- T3 compositional targets;
- T5 per-world or shared formalizers;
- the T6 ablation beyond the dispatcher;
- a seq2seq normalizer.

Do not start them. If you finish Stage 1 early, write in `questions.md` which Stage 2 task you would run first, with the evidence from D3, and stop.


Reference descriptions of the Stage 2 tasks:

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


## 5. Reviewer validation

After each task the reviewer reruns the logged commands, where feasible on a smaller `--max-steps`, and compares the numbers in RESULTS.md with the JSON results. Then the task is either moved to "Validated" or rewritten here with what must be fixed.

## Validated

- T0 — Environment: torch 2.14.1+cu130 on GB10, tests and smoke test pass (055fbeb).
- T1 — Dataset rebuild and split check (6852ee8); routing text overlap answered in §2 Q1.
- T2 — Rule baseline at 055fbeb (c95e250): 88.3% exact SOP routed, paraphrases 30.4%, routing 89.7%. The numbers reproduced exactly.
- B1 — Rebaseline at c989cd1 (b24ac56): rules 93.4% routed, held-out 50.4%, routing 95.3%. The rules.json numbers reproduced exactly.
- D2 — Validation layer (68ec94d): tests pass. An oracle rerun on 1,500 records shows the same pattern (games 97.1% top-1 / 61.1% strict / 97.1% accepting refusals).
- D1 — Dispatcher (e43813c): DistilBERT top-1 0.971 / top-3 0.994 / seg F1 0.985 (test); held-out top-1 0.934. ModernBERT gives no gain, so DistilBERT stays. Tests pass; the result JSON matches the log. Training was not rerun (no GPU on the reviewer side).
- D4 — Export and browser runtime (9a1e635): int8 63.9 MB, 4.2 ms per pass. JS and Python agree. 547 tests pass, the webchat scenario passes with rules. The int8/fp32 world agreement of 98.97% is accepted, because the top-3 candidate sets are unchanged.
- D4b — Model published in the repo (32fd79d). Reviewer check in headless Chrome with Encoder selected: multi-command, typo and tab-routing messages answered correctly, no console errors. Still add the D4b log entry, including the check on the public Pages URL.
