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

**No freeze (user decision 12:52).** Rules and runtime are meant to keep changing. Widen the rules continuously, as much and as varied as possible. Every reported number carries the commit hash it was measured at; there is no baseline to confirm and nothing to ask about it. When `worlds/` or `src/` changes, rerun the evaluations that matter (rules eval, dispatcher eval) and report the new numbers next to the old ones. Do not ask permission for that.

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

### Answers and notes (reviewer, 11:30, updated 13:50)

- **Q5 (game controls in game tabs):** do your proposed engine change. On a game tab the shell emits the **active game's own action** (`ttt.new`, `hm.giveup`, …), and off a game tab the shell form stays. Relabel the dataset to match: one label per meaning, whatever the wording. The user sees the same behaviour; the labels just become consistent. Add tests for both cases, on and off the tab.

- **Q4 (baseline after the avatar changes):** confirmed. There is no baseline to confirm from now on (see "No freeze" in §0). The user's decisions are accepted: Encoder as the webchat default, automatic spelling/abbreviation normalization, partial understanding ("do what it can"), and `acceptRefused` on by default.
- **D1b policy:** in the validation layer, use the simplified text only when the original does not validate, and accept the simplified reading only if it validates and the interpreter does not refuse it (this limits the "misled" cases). Keep tau 0.5. Add mode C to the headline evaluation. Publish the simplification model in the next R1 loop if the headline (Br + C) is at least D1's.

- **Q3 (`acceptRefused`): yes, make it the default.** A complete parse whose action the current state refuses is a correct understanding, and the refusal is the reply: an illegal chess move, drawing on an empty canvas. Make Br the default policy and keep strict as an option. Keep three cases apart where the status allows it:
  - a state refusal (an operation exists, the precondition fails) is **valid**, with a small penalty used only to break ties;
  - `unsupported` because no operation or legend key handles the wires is **invalid**;
  - `error` (an exception) is **invalid**.

  If the current statuses cannot tell the first two apart, add a reason field in `dispatch-validate.mjs`, not in the worlds, and report how often each case occurs. Update spec 03 §7 and ADR-005.
- **build-dataset wipes `training/dataset/multicmd/`:** change `scripts/build-dataset.mjs` so that it removes only the world directories it writes, or move multi-command data generation into build-dataset itself (preferred: one command builds everything). Note it in the D1 log entry.
- **Use `--jobs` wisely:** evaluations reproduce exactly. The reviewer reruns subsets with `--limit`, so keep `--limit` deterministic: the first N records in a fixed order.

### Direction from the user (12:52): read this before anything else

The goal is a system that is **as fast and as complete as possible, with as little effort as possible**. Engineering, not research. Concretely:
- **Rule gaps are 69% of the failures (D3), so widening the rules is the main lever.** Widen them aggressively and in many directions: synonyms, short forms, typos, word orders, politeness, voice fillers, partial commands, coordination. Tests must pass. That is the only gate.
- Do not stop to ask about baselines, freezes, contamination or purity. Ask only when a decision really belongs to the user (UI behaviour, publishing, deleting things).
- Use parallel subagents (Sonnet for rules, Haiku for new paraphrase batches) whenever work splits by world.

### Architecture, final for this stage (user, 12:55)

- **The rules formalize everything.** Every way of asking that we can think of, for every operation of every world, must be supported by the rules.
- **DistilBERT only splits.** The dispatcher cuts large or multi-command messages into small pieces and proposes candidate worlds. It does not formalize. The rules then formalize each piece and validate the candidates.
- The simplification head is low priority: keep it as is, do not invest more in it. The effort goes into the rules.

### R2 — exhaustive rule coverage on all worlds (main task; finishes this stage)

For **every world with operations** (all 20; `core` holds only the shared legend), do this in parallel with subagents, one per world or per small group:
1. **Request-shape catalogue.** Write `worlds/<world>/coverage.md`. For every operation, list every shape a user may use, and add the world's own ones:
   - imperative ("make it red"), question ("can you make it red?", "is it red?"), wish ("I want it red", "I'd like…");
   - indirect ("it should be red", "red would be nicer"), statement-as-command ("the body is red now");
   - very short and elliptic forms ("red", "bigger", "again", "no, the other one");
   - voice style with fillers and run-ons, typos and abbreviations (u, ur, pls, thx, whats, hrs);
   - word-order variants (noun-first "eyes: blue"), synonyms and paraphrases of verbs and nouns;
   - pronouns and references ("it", "that one", "the same but bigger", "the last one");
   - quantities, units, number words; negation and undo ("don't", "not that", "undo", "go back");
   - coordination ("X and Y", "X then Y", "X, Y and Z"); politeness and chit-chat around the command ("hey could you maybe…");
   - questions about the state ("what colour is it?", "how many…?") and about the options ("what can I…?").
2. **Implement every line** with general patterns and lexicon entries, and add at least one test per line in `tests.sop`. A line that cannot be supported (a missing operation, say) is marked as such in `coverage.md`, with the reason.
3. **Measure per world** the rules-only share of all paraphrase records (training paraphrases, held-out, new batches) that formalize correctly. **Target: ≥ 90% per world, rules only, on single-sentence messages.** Generate new Haiku batches per world to probe the gaps until the target holds on a fresh batch the rules were not written from (≥ 80% there).
4. Keep `npm test` and `test-world all` green. Keep the generator agreement (`export-training`) from dropping.
5. Then retrain the dispatcher once on all data (segmentation + worlds), publish the model, rebuild the webchat, and report the headline (rules only and pipeline) per world group.

Log as `R2 <world>` entries plus one `R2 summary` table: world · catalogue lines · supported · tests · rules-only coverage before → after · fresh-batch coverage.

### Review fixes F1–F8 (from the external review of 6b0db7c, accepted by the reviewer 16:00)

The review's claims were checked: the music labels (`a key with 4 sharps?` labelled `n=3, acc=flat`), `Make your eyes and body blue` → unknown eyes "and body blue", and `itertools.cycle(sl)` in `dispatcher.py`. **F1 and F2 are P0:** they corrupt labels and metrics, so do them before the next dataset rebuild and retraining. Continue R2 in parallel: it touches the rules, not the labels.

**F1 (P0) — labels must keep each variant's own parameters.** `labelVariant` in `collect-paraphrases.mjs` copies the canonical's target onto variants that may carry different values.
- Separate the operation family (the goal) from the semantic instance (operation + arguments + context).
- A variant inherits the canonical target only when its values match it.
- When the rules parse the variant completely, use the rules' own SOP as the label if every slot value occurs in the variant's text (`label_status=rules-own`).
- Otherwise mark it `needs_review` and leave it out of training until it is relabelled.
- Audit `rules-differ` first, then `rules-fail` with inherited targets. Write a report that separates parser errors from labelling errors. Relabel and rebuild everything derived from these labels: dataset, edit tags, normalizer pairs.
- Update the Haiku instructions (spec 10): every variant keeps the instance's parameters. Varying a parameter means a new task/instance.
- Acceptance: the three music examples keep their own values, plus minimal pairs with one argument changed for every numeric family.

**F2 (P0) — SOP comparison must keep the order of actions.** `normalizedSop` drops `core.seq` and sorts lines, so "body red. body blue" equals "body blue. body red".
- Keep the relative order (and dependencies) of request/operation wires. Ids may be renumbered; facts that do not depend on each other may still be compared as a set.
- Use the same comparison everywhere: collection, simplification/normalizer pairs, dispatcher and rules evaluation.
- Optionally, also compare the final state on 2–3 relevant initial states.
- Tests: the colour pair above, create→delete, move→undo, two settings of one property. Renumbered ids must still compare equal.

**F3 (P1) — safe augmentation.** `_plain` in `multicmd.py` and `plain_text` in `dispatcher.py` destroy decimals, coordinates and literal text ("45.5" → "45 5").
- Protect numbers, decimals, negatives, times, coordinates, units, note names and quoted or dictated payload spans.
- Apply noise only to eligible zones: politeness, casing, final punctuation, abbreviations, controlled typos.
- Record the transformation and the protected spans. Test that the payload is preserved.

**F4 (P1) — compositional multi-command data.** Today it is concatenation only, with the context dropped (`session: []`) and the target recovered via `source_id`.
- Generate a small program (operations, values, references, initial context), then verbalize it in several ways.
- Add explicit families: shared argument ("eyes and body blue"), verb ellipsis ("eyes blue and body red"), self-correction ("blue, no, green"), reference to a created object ("draw a circle and put it above the square"), repetition and undo ("move left twice, then undo"), switching world.
- Keep or construct the needed context. Report full-request success per family.
- **Rules side (R2):** coordination with a shared argument and self-correction belong in the rules, through a conservative expansion before parsing ("eyes and body blue" → "eyes blue; body blue", provenance kept). The segmenter must not be asked to copy arguments.

**F5 (P1) — explicit reasons instead of "refused".** Add a shared `reason` field, set by the interpreter and read by the validator:
- `precondition_failed`: keep the reading and explain the refusal;
- `unknown_argument`: try other readings, the spell-corrected text, the normalizer;
- `unsupported_operation`: report the limit, never confirm false success;
- `execution_error`: a bug, never a valid example.

Catch-all patterns that swallow text (unknown argument) must not block recovery. Tests for each reason. This completes the Q3 answer and S1.

**F6 (P1) — training loop.**
- Replace `itertools.cycle(sl)` with an iterator that restarts the loader at exhaustion (reshuffled, no memorised batches). Regenerate multi-command combinations each epoch.
- Give explicit step budgets per head (routing / segmentation / simplification).
- Controlled sampling by source, world and phenomenon (generators are 78% of the routing data): keep all data, but reserve exposure for recent failures and contrastive near-misses (set/increase, before/after, three/thirteen, question vs command), with a replay pool of solved cases.
- Log what was actually shown to the model, per source and family.

**F7 (P1) — pick checkpoints and thresholds by the whole pipeline.** The current choice is "world top-1 + boundary F1 + 0.5 × edit F1".
- Run a compact operational set (about 1–2k realistic messages, fixed and committed) through the full pipeline (dispatcher → validation → rules) for the best 2–3 checkpoints of each run, and choose by **right / partly right / wrong / not understood / latency**.
- For simplification and the normalizer, always report recovered / misled / broken. Add contrastive pairs where every word is kept but the roles change (red eyes + blue body vs blue eyes + red body), so the value checker also checks roles, not just words.

**F8 (P2) — long messages and the learning loop.**
- Handle inputs over the runtime limits (192 tokens segmentation, 128 routing) with overlapping windows, and test them.
- D5: self-labelling from usage needs more than `supported`. Require no user correction afterwards and an observable successful effect. Keep user corrections as labels.

**Everything runs in parallel now (user, 16:00): nothing known is postponed.** Use parallel subagents.
- **The reviewer does F2, F3 and the F6 iterator fix** in this session, small and isolated, and pushes them with tests. The worker does not touch `normalizedSop`, `_plain`/`plain_text` or the segmentation iterator. Pull and use them.
- **The worker does F1, F4, F5 + S1, the rest of F6, F7, F8, R2 and N1,** in parallel.

**The single measure of success (user): the result is correct.** Build `training/eval/operational.jsonl`, a fixed, committed set of realistic messages. Each has its initial state (setup), the expected final state and/or answer, and the expected effects. Include every F4 family, the review's probes and real phrase-log messages when available. The headline is the **share of messages whose final state/answer is right**, per world, through the full pipeline in the webchat configuration. Wrong actions are counted separately: they are worse than "not understood". Every task above reports its effect on this one number.

### S1 — make simplification safe (reviewer analysis 15:35; do before the next model publication)

Why the simplification head still breaks meaning (from `dispatcher-distilbert-simp-clean.json` and the code):
1. **The rewrite competes on score with the original.** In `dispatch-validate.mjs` the simplified variant has only `simplifiedPenalty: 0.05`. A rewrite that validates in the top-1 world beats an original that validates in the rank-2 world, so a correct reading loses to a rewrite. These are the "broken" cases: original right, rewrite wrong, 56 on held-out.
2. **No check that the values survive.** A rewrite is accepted as soon as the rules parse it. The edit vocabulary contains content tags such as `R:2`, `R:3`, `R:left`, `R:and`, `R:make`, `R:add`, `R:remove`, `R:change`, `R:play`, `R:chart`, `R:clear`, `R:turn`, `R:name`, `R:count`, so the model can change numbers, directions, verbs and coordination. The rules then happily parse a different command: the "misled" cases, 91 on held-out against 72 recovered. The worst group is music/draw/map/charts: 36 misled, 9 recovered.
3. **It rewrites too much.** It changes 45% of the held-out sentences (928/2050), and only 36% of those rewrites are correct.
4. **The targets come from the task's canonical,** which is often a different wording of the goal, so the model learns to push towards the canonical template instead of minimal edits.

Fixes, in this order:
1. **Lexicographic preference.** Any valid original or spell-corrected reading in any candidate world beats any simplified reading. Use the simplified text only when nothing else validates. Unit test.
2. **Value checker** (shared with N1). Reject a rewrite if:
   - a number, a name, a lexicon value of the world (colour, direction, piece, note, place…) or a negation in the original is missing from or changed in the rewrite;
   - or if the rewrite introduces a content word that is not in the original, apart from a small whitelist of normalizations (abbreviation and typo expansions, articles, "please").
3. **Safe tag set.** Retrain the head with `DELETE`, plus `REPLACE` only towards normalization targets (abbreviations, typos, contractions, number words → digits) and `PREPEND`/`APPEND` only for function words. Drop content `R:` tags from the vocabulary.
4. **Minimal-edit targets.** Rebuild the alignments as the smallest edit that makes the rules give the target SOP: search deletions of fillers and normalizations first. Use the canonical only as a fallback.
5. Report recovered / misled / broken per group before and after each step. Target: broken = 0, misled ≤ ¼ of recovered. Keep the head disabled by default in the webchat until this holds.

### N1 — seq2seq normalizer experiment (user decision 13:16; run on the GPU in parallel with R2)

Idea: a small encoder-decoder rewrites any user sentence into the **simplest phrasing that keeps the meaning and that the rules understand**. The rules then only need to cover simple forms, and the normalizer absorbs the variety. The rules stay the formalizer (AGENTS.md exception: the output must validate with the rules and pass a value checker).

1. **Training pairs (source → simplest form).** Build `scripts/build-normalizer-pairs.mjs`. Each pair is kept only if the target formalizes to the same SOP as the source's label (verified by the rules), and as many pairs as possible:
   - Haiku paraphrase variants → their canonical, and → any pattern `example=` of the same world that formalizes to the same SOP; choose the shortest one that validates;
   - all generator / rule-derived / canonical sentences → themselves (identity pairs, so clean sentences stay as they are), plus → a shorter equivalent when the rules give the same SOP;
   - synthetic noise on clean sentences (typos, abbreviations, fillers, politeness, voice run-ons, word-order swaps) → the clean sentence: unlimited, labels known;
   - optionally, Haiku batches in the reverse direction: give Haiku existing sentences and ask for the simplest equivalent, then keep only the rule-verified ones;
   - multi-command messages are split by the dispatcher first; the normalizer sees single pieces.
2. **Models:** FLAN-T5-small (77M) first, then T5-small and ByT5-small (character-level, good at typos). Input = world candidate + tab + the piece; output = the simplified piece.
3. **In the pipeline** (`src/dialog/dispatch-validate.mjs`): try the original piece first. If it does not validate, try the normalizer output, beam 3, and accept the first candidate that validates and passes the **value checker**: numbers, names, colours and negation are preserved; reuse the translation checker idea (ADR-002).
4. **Metrics** on the paraphrase sources and on a fresh Haiku batch:
   - recovered (original fails, normalized right);
   - misled (normalized validates with a different SOP);
   - headline before → after;
   - compared with the D1b edit-tag head on the same messages.
   
   Target: misled ≤ ¼ of recovered, and a clear headline gain.
5. **Browser:** int8 ONNX export (encoder + decoder with past key values), size, latency per piece with transformers.js or onnxruntime-web. Do not publish until the reviewer has seen the numbers.

Log as `N1` with the pair counts per source, the model comparison table and the browser numbers.

### R1 — continuous rule widening (main task from now on, run in loops)

Loop until the session ends:
1. Take the rule gaps from the latest dispatcher evaluation (`rule_gaps` in `training/results/dispatch-*.json`, failure traces in `training/runs/`), worst worlds first: docs.editor, kids.common, art.draw, docs.reader, kids.arith, media.music, ui.shell, kids.animals, then the rest.
2. Widen the patterns, lexicons and ops of those worlds, in parallel per world group. Write general patterns, never one per sentence. Add representative tests. `npm test` and `test-world all` must pass.
3. Generate fresh Haiku paraphrase batches for the widened worlds: new goals, many variants. They go into training, and some become the next fresh held-out batch. Data is never too much.
4. Rebuild the dataset, retrain the DistilBERT dispatcher (with the simplification head), and rerun the headline evaluation.
5. If the headline metric improved, publish the new model (D4b procedure: same paths, one commit per model version, headline in the message) and rebuild the webchat.
6. Log each loop in `worker-log.md` as `R1 loop N`: worlds touched, rules-only and pipeline headline before → after, model published yes/no.

## 3. Stage 1 tasks — the dispatcher (this session)

**The goal of this session is to avoid training per-world models.** We validate one idea first: a single small shared model, the **dispatcher**, proposes candidates, and the existing rule formalizers validate them. No per-world LoRA in this session.

Order: everything in parallel (see the review fixes section). The headline is the operational set: a correct final result. T9 is updated at the end of the session. D1, D2, D3, D4 are done; D1b is accepted as partial, with its policy below.

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
- D3 — End-to-end evaluation (746d847): headline 68.5% right with dispatcher + validation, against 43.0% rules only; multi-command 80.8% against 36.0%. Rule gaps are 69% of the failures. Sample rerun: runs and reproduces; the numbers moved slightly with later rule commits, as expected.
- D1b — Simplification head (19afdbe), partial: +1 to +3.5 points; the JS/ONNX runtime works. Policy and publication are decided in §2 / R1.
