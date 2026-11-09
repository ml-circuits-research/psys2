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

**Role split (user decision 21:40): from now on the reviewer does not commit code.** The reviewer only reviews, writes and answers tasks, and validates. All code changes are the worker's. The last reviewer code commits (review-2 small fixes) are listed with merge instructions in §2 under "Merge from the reviewer".

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

### Discourse layer — LANDED (584c3d3, 26cecc7, dd35d15); reviewer agents still polish it

The reviewer is implementing dialogue continuity in a new `src/dialog/discourse.mjs`, with small hooks in `src/dialog/index.mjs`, a spec and ADR-006:
- ellipsis ("And from Berlin?", "And Ana?", "Now bigger", "the same for the tree");
- pending clarifications ("Draw" → "What should I draw?" → "a cat");
- verb distribution in coordination ("Give yourself round glasses and a beard").

Avoid conflicting edits there. Pull and rebase often. Add messages of these kinds to the operational set once it lands.

### Merge from the reviewer (21:50) — the last reviewer code; from now on all code is yours

Everything is already on `main` and rebased over your G1/G6/G8 commits. `npm test` passes 747/747 at f7e25b3. Just `git pull --rebase`. The commits:
- ac3785b `src/dialog/value-check.mjs`: typed values first (signed, decimal, `1,5`, times, notes, ordinals, spoken "minus"), operand order, from/to, coordinate order, units, colour↔part bindings.
- 8866230 `scripts/lib/operational-check.mjs`: whole signed numbers and typed answer `value`; an empty cell `null` equals `""`; refreshed `training/results/operational-rules-only.json` (1070 right / 36 wrong / 110 not understood).
- a3f19d3 `scripts/build-normalizer-pairs.mjs` + `scripts/lib/safe-noise.mjs`: safe noise shared with Python (JSON fixture); every synthetic pair audited with `checkValues` (5,822 rejected); pairs report regenerated.
- e139210 `src/dialog/dispatch-validate.mjs` (normCache) + `docs/webchat/ui/normalizer-host.mjs`: provider status `not_ready | error | ready`, only `ready` is memoised, stamp invalidation, `clearCache` clears both caches.
- 10068d4 `src/translate/index.mjs`: short or ambiguous input keeps the session language; Romanian needs diacritics or several Romanian-only words.
- 2201691, f7e25b3 `src/dialog/discourse.mjs` + games.guess tests: a bare yes/no with nothing pending and no game gives a neutral answer.

What this means for your tasks:
- **G4:** rebuild the normalizer pairs with the new noiser before retraining.
- **G1:** your selection code and e139210 both touch `dispatch-validate.mjs`; check that the normalizer status is respected in your residue-only path.
- **G5:** use the new evaluator for all three modes.
- **Language detection (new task L-RO):** Romanian typed without diacritics now stays English ("cat face 3 plus 4"). Improve the evidence, for example Romanian function words and word endings, so diacritic-less Romanian is still detected, without breaking short English input. Test both directions.
- From now on, new phrasing and shared vocabulary go into `lang.common` (L8 absorbs `src/dialog/lang.mjs`).

### PERF — the webchat is very slow on mobile (user report 23:46; reviewer measurements at 06280ae) — TOP PRIORITY together with D-FIX

Reviewer measurements (headless Chrome, 390×844 mobile viewport, 4× CPU throttling as a mid-range phone, localhost):
- page ready: **25 s** (9.1 MB `worlds/index.json` + 67 MB model);
- per message: "hello" 3.2 s, "what is 3 plus 4" 3.5 s, "spider legs and 3 plus 4" 4.6 s, "pls make ur eyes square" **10.0 s**, "show me paris" 7.2 s, "hello" again 1.4 s;
- with `formalizer: rules` in settings the times are **the same** (3.1 / 3.6 / 4.5 / 9.4 / 7.4 / 1.1 s). So either the setting is not respected, or something other than the dispatcher dominates (normalizer, spell or partial passes, validation loops, UI work).
- CPU profile of "pls make ur eyes square" without throttling: 7.3 s wall time, of which **6 s the main thread is idle**, i.e. waiting on onnxruntime worker threads or another awaited job. Main-thread work: first-message lazy `compilePattern`, `docs.reader analyzeDocument` (the sample document analysed during a message), tone.js buffers.
- In Node the same pipeline takes 11–21 ms p50, so the browser path does something the evaluator does not.

Tasks:
1. **Per-stage timing.** In the trace and in a dev overlay: load, tokenize, dispatcher passes (count and ms), validation (number of formalize calls), spell/partial passes, normalizer calls (count, beam, ms), interpreter, render, host effects. Find out why rules mode is as slow as encoder mode, and why the main thread waits 6 s.
2. **Targets on a mid-range phone (4× throttle):** first answer ≤ 1.5 s after the page is ready, typical message ≤ 300 ms p50 and ≤ 800 ms p95. The page must be usable in ≤ 5 s; the models load in the background and rules answer meanwhile.
3. **Likely fixes (measure each):**
   - run the normalizer only when nothing validates, and never on the hot path for messages the rules already read;
   - cap dispatcher passes per message; cache per text;
   - lazy-load worlds/tabs and analyse the sample document only when the Documents tab opens;
   - precompile patterns at build time (ship compiled JSON, not 9 MB of SOP text parsed at load);
   - keep ORT sessions warm; use a single-threaded WASM fallback if threads are unavailable on mobile Safari;
   - load the model after first paint.
4. **Thinking indicator (user request).** On Send, the typed message appears in the chat immediately, the input clears, and a "thinking… 0.8 s" bubble counts seconds live. When the answer arrives, show under it how long it took ("answered in 340 ms" / "in 2.1 s").
5. **Report** the before/after table on the same throttled script, kept in the repo (`scripts/perf-webchat.mjs`, puppeteer-core). The reviewer will rerun it.

### BEST-EFFORT — make the most of loose words (user request 23:46)

When the user throws words that are not a sentence ("square eyes robot pls", "paris map", "red house big"), try to do the most sensible thing instead of "not understood". Our worlds are harmless, so guessing is fine.
- When no reading validates: score candidate operations by the content words and lexicon values the input contains (verbs, objects, parts, colours, places, numbers), within the active tab first, then the dispatcher's candidate worlds.
- Build the best canonical sentence from the pattern examples or request shapes, filling its slots with the recognised values, and run it through the rules.
- Execute the best one if it clears a minimum score, and say what was understood ("I took that as: make your eyes square"). Otherwise fall back to "Did you mean …?" with the top two.
- Use the value checker so that no value is invented.
- Settings flag **"Best effort with loose words"**, **on by default**.
- Tests: word-salad sets per world, generated by Haiku; report recovered and misled on them and the effect on the operational set (wrong must not rise).

### D-FIX — raise the dialogue headline (in progress; reviewer at d05647d: 92.6% of turns, 77.5% of dialogues right on the audited set of 395. Still below 85%: avatar/shell/editor 58.7%, documents 58.3%, kids 76.7%; worst family: clarification 43.2%)

Whole dialogues are the weak spot: one wrong turn breaks the dialogue.
- Worst group: avatar/shell/editor, with 50% of dialogues and 80.6% of turns right.
- Worst families: clarification, noise, ellipsis, correction, explain.

Fix the system gaps your log lists, plus whatever the failure file shows, and add every fixed case to the dialogue set:
- "that's wrong" in chess, tic-tac-toe and guess answers "not playing twenty questions";
- "back to the animal game" does not switch the tab;
- docs.reader ellipsis ("and the last section?") and "section 3" are read as document names;
- arithmetic ellipsis "and 9 minus 2?" after another frame is mangled into "6 times 9 minus 2";
- repairs after a wrong turn.

Target: ≥ 85% of dialogues right in every group without lowering the operational set. Then run the encoder and encoder+N1 modes once the models are retrained.

### G — review 2 fixes (external review of 215677c, checked by the reviewer at 21:15: every claim reproduced)

The reviewer's agent is fixing, in parallel: the typed value checker (sign, decimals, roles), the operational evaluator (signed numbers), the N1 noiser (safe noise, value audit), the normalizer cache, language detection for short inputs, and the neutral answer to a bare yes/no. Pull those before G4/G5. Do the rest:

**G1 (P0) — global preference for complete interpretations — DONE and validated (eaef124, 85e2f4b).** `wat do red and yelow mak` gets the right answer without FLAN and a wrong one with it: an incomplete segmentation ("wat do red" + an unparsed rest, rewritten as "What do red and red make?") scores −6.34 and beats the complete spell-corrected reading (−6.53). Make selection hierarchical over all segmentations:
- complete before partial;
- original/spell readings before generated ones, whenever any complete one exists;
- neural scores only order readings within the same validity class;
- run the normalizer only on residue that has no complete reading in the beam.

Accept: this message answers "orange" with and without N1. Add tests where "and" joins objects, colours, operands or cities. Report `broken` at the level of the whole pipeline.

**G2 (P1) — self-corrections resolved before any effect.** Reproduced at fe679ca:
- `knight to f3, no, knight to c3` plays f3, then sends "no" to another game;
- `top left, no, center`, `e, no, z` and `yes, no wait, no` execute the abandoned variant first;
- `… what 3 pencils cost, no, 4 pencils` answers for 3.

Add one correction phase on the whole message, before segmentation, routing and modal interceptors, shared by rules, encoder and games. Mark the replaced fragment and the scope (value / object / whole command / modal answer), then execute only the resulting program. Test that the abandoned variant leaves no effect: move history, tries used, object count, opponent state.

**G3 (P1) — bounded free captures and context-anchored spelling — DONE and validated (3db5374).** One leftover: on the drawing tab a bare noun phrase ("a purple boat please") is now "not understood" instead of wrong. Make a bare object phrase on the drawing tab mean "draw it", as `Draw a boat` already works. Reproduced:
- avatar names "to Bolt", "Zed from now on" and "try a grill for the mouth";
- `lets play hangmn` renames the avatar to "play hangmn";
- on the drawing tab `a purple boat please` → boat corrected to coat (kids.animals).

Fixes:
- longer frame alternatives win before a `rest` capture opens; delimit prefix/value/suffix (multi-word and quoted names still allowed);
- renaming needs explicit naming cues;
- spell correction never changes a word known in the active world, and is penalised when it changes both the world and a content noun;
- add contrastive pairs across worlds (boat/coat, mouth/name, play/rename).

**G4 — retrain N1 after the fixed noiser and checker.** Then evaluate it on the actual fallback distribution of the current dispatcher. Bind the published model to the hashes of dataset, rules and acceptance policy. Keep it off in games until misled ≤ ¼ of recovered there.

**G5 (P1) — one runtime configuration factory for the webchat and the evaluator.** Today `eval-operational` builds the dispatcher without the normalizer, while the webchat enables it by default. Evaluate three modes, each report carrying model hashes and policy:
- rules;
- encoder without N1;
- encoder with N1 (the shipped default).

Version the result files and keep a manifest of the published version; `operational-full.json` is stale (89.0/4.3, old dispatcher). Report cold start, ready model and warm cache separately.

**G6 (P1) — long and medium messages in training.** `N_LONG` train is 0, the logged exposure has only 1–3 segments, and the long test family is at 21% exact segmentation.
- Add 4–8 command programs and long messages to train, built with the same windows as inference.
- Report omissions, duplicates, lost dependencies and final correctness by length bucket.
- Do not let the many short cases hide drops on long ones at checkpoint selection.

**G7 — the operational set covers the new worlds and dialogue.** Add cases for `user.profile` (interview, correction, deletion, switching tab and back, no unrequested actions) and multi-turn scenarios with returns after more than 6 messages: the encoder validator rebuilds context from a limited history, so test against full state snapshots. This merges into DLG.

**G8 (secondary) — Romanian boundary.** 16 residual failures in the equivalence test (397/413), e.g. "Cât face 6 dublat?" → "What is 6 dublat?", "prețul unei păpuși" → "price unei dolls", "Numește lunile primăverii" → "He calls the months…". Keep the residual list in the coverage report and turn the common cases into translation rules/data.

### DLG — multi-turn dialogue data and tests (new, parallel)

The operational set and the paraphrase batches are single messages. Real use is dialogue. Generate **multi-turn dialogues** with Haiku subagents: 3–8 turns each, with an initial state and the expected state/answer after every turn. Cover:
- pronouns, ellipsis ("and Ana?", "now bigger"), clarifications ("Draw" → question → "a cat");
- corrections ("no, the tree"), cancellations, ordinal and attribute references ("the red one", "the second");
- comparatives ("a bit more"), choice clarification, list-entry mode;
- repeat/explain ("what did you do?"), negative feedback ("that's wrong"), topic returns ("back to chess"), world switches mid-dialogue.

Use this phenomenon catalogue: one family per line, **every family covered in every world where it makes sense**, at least 5 dialogues per family. Write it to `training/eval/dialogue-phenomena.md` with per-family counts:
- reference: pronouns (it/them/he), demonstratives (this/that one), attributes (the red one), ordinals (the second, the last), quantifiers (both, all, each), the object just created;
- ellipsis: "and X?", "what about X", "X too", "now bigger", "again", "the same for X", "one more";
- incomplete commands and the answer to the clarification question; choice clarification ("which one?" → "the first");
- corrections ("no, I meant…", "actually…", "not that one"), cancellation ("never mind", "forget it"), undo/redo chains;
- comparatives and degree ("a bit more", "much bigger", "twice as", "the same size as");
- multi-step tasks over turns: list entry ("milk" … "that's all"), building a drawing or document step by step, a game played over many turns;
- confirmations and refusals of system offers (yes/no/sure/maybe later), answers to yes/no questions;
- questions about what happened ("what did you do?", "why?", "what's on the board?"), repeat ("what?", "say again");
- feedback ("thanks", "great", "that's wrong", "not what I asked");
- topic switches and returns ("let's draw", "back to chess", "where were we?"), cross-world references ("chart what Tom has", "put that song in the document");
- user facts used later ("my name is Ana" … "what's my name?", "I like blue" … "use my favourite colour");
- noise inside dialogue: typos, voice fillers, run-ons, two commands in one turn.

Store them in `training/eval/dialogues.jsonl`, at least 30 per world group. Extend `scripts/eval-operational.mjs` to run them turn by turn and report the share of turns right and the share of whole dialogues right. Add this as a second headline next to the operational set. The reviewer's discourse agent implements the mechanisms, so expect the numbers to rise as it lands.

### L — reusable symbolic library (feasibility analysis 18:00, verdict GO, staged)

Why: one analysis pass of the 20 worlds found **82% of the pattern match text is verbatim copies** of the same lead-in, suffix and filler lists (124 distinct lead-in lists, 233 suffix lists, 180 filler lists; one 187-alternative lead-in copied 808 times). **7% of the alternatives can never match**, because the tokenizer already drops those words. Six colour lexicons, five identical ordinal lexicons, undo/redo in 27 patterns across 6 worlds, yes/no regexes copied into ops, and about 800 boilerplate `{note}` templates. The copies also distort routing: longer copied lead-ins add literals and steal sentences. They cost 22–24 ms per matcher pass, and 7 MB of patterns ship to the browser.

The plan keeps SOP Lang, the matcher and `core.pattern`, and adds:
- phrase macros (`core.phrase`, used as `[$lang.lead.polite]?`);
- a shared world `worlds/lang.common` (phrases plus shared lexicons with `extends=`/`exclude=`), imported by everyone through `kids.common`;
- load-time generation of request shapes (`core.shape`: one declaration per operation → imperative / question / wish / indirect / word order / short / state / options forms);
- a matcher prefilter (prototype: 24 → 4.6 ms per pass);
- a `{note}` rendering fallback and `ctx.lang` helpers (yesNo, ordinal, degree, colour).

From now on, any new phrasing goes into `lang.common` or a shape, never inline.

Gates for every step: the operational set (`node scripts/eval-operational.mjs --rules-only`) must not lose "right" or gain "wrong" against the previous commit; `npm test` and `test-world all` stay green; `eval-rules` negatives and routing do not drop. **Coordinate with the reviewer's discourse agent** on L8: its pending confirmations should use `ctx.lang.yesNo`.

Run L1–L3 and L5 in parallel with R2/DLG (additive engine work). Migrate worlds (L4, L7) one per commit, in windows when no sweep is touching that world.

### L0 — baseline (½ h)
Record at the current commit: `node scripts/eval-operational.mjs --rules-only --json --no-write`; `node scripts/eval-rules.mjs --no-write` (restricted/routed/negative/held-out numbers); `time node src/cli.mjs test-world all`; pattern statistics with `node scripts/pattern-stats.mjs` (new, read-only: patterns, alternatives, repeated groups, unreachable alternatives; the script of this report). Log as `L0` with the commit hash. **Accept:** numbers in `worker-log.md`.

#### L1 — matcher prefilter and first-word index (engine only)
In `matcher.mjs`/`index.mjs`: per compiled pattern, the sets of possible first words of every mandatory element; skip patterns whose sets are not all hit by the sentence's word bag; index alternative groups by first word. No behaviour change. **Accept:** `npm test` and `test-world all` green; `eval-operational --rules-only` identical counts (1062/18/37/117 at baseline) with `latency_ms` ≤ 40; unit test that prefilter never rejects a pattern `matchTokens` would match (fuzz over all pattern examples).

#### L2 — phrase macros
`core.phrase` wire type (legend in `worlds/core/legend.sop`), parsed from `lexicon.sop`; `[$id]` / `[$id|lit]?` in `compilePattern` with a shared `alts` array and `frame: true`; `matchTokens` returns `frameLiterals` separately (ranking unchanged for now); `checkPattern` reports unknown macro ids; `vocabularyOf` includes macro words. Spec 03 §2 "Phrase macros", ADR-007. **Accept:** unit tests (expansion, optional, mixed, unknown id error, frame counts); all L0 numbers unchanged.

#### L3 — `worlds/lang.common`
Create the world (`status=fixture`, `summary=""`), imported by `kids.common`. Phrase groups listed in §2.2, built as the **union** of today's per-world lists (`scripts/pattern-stats.mjs --union lead|tail|filler`), minus the unreachable alternatives. Shared lexicons `lex.lang.colour/ordinal/size/degree/direction/position/unit`. Lexicon `extends=`/`exclude=` in `lexicon.mjs`; spec 02 "Lexicon". `tests.sop` for the world (macros resolve; nothing is claimed by `lang.common` itself). **Accept:** `test-world all` green; `eval-rules` negatives unchanged (the world claims nothing).

#### L4 — migration script and pilot `ui.avatar`
`scripts/migrate-macros.mjs <world> [--write]`: replaces every alternative group that is a subset of a macro by `[$macro]`, drops unreachable alternatives, reports groups it could not map (alternatives outside every macro are kept inline next to the macro). Run on `ui.avatar`, review the diff, then `lex.ui.avatar.colors extends=$lex.lang.colour`. **Accept:** `test-world ui.avatar` 205/205; operational right ≥ 1062 and wrong ≤ 37; `patterns.sop` of ui.avatar shrinks ≥ 60 %; one commit `L4 ui.avatar`.

#### L5 — `{note}` fallback and template cleanup
`render.mjs` `fallbackText` renders `env.note` for `missing/unsupported/error` when present; remove templates whose text is exactly `{note}`; spec 04 "Rendering". **Accept:** `npm test`, `test-world all` green; template count drops by ≈ 800; replies of the operational set byte-identical (`--verbose` diff).

#### L6 — request shapes
`core.shape` legend, `src/formalizer/rules/shapes.mjs` (families `set do ask.value ask.count ask.exists list`, forms `imp q wish ind order short state opts`, examples derived, `short` at priority-2), expansion in `buildWorld` after macro loading; `scripts/expand-patterns.mjs <world>` prints generated SOP; `checkPattern` on generated patterns at load (errors in `world.errors`). Routing: a `short`-form match is dropped at tier 5. Spec 03 §2b "Request shapes" with the exact generated templates per family. Pilot: rewrite ui.avatar colour, part and size operations as shapes; keep hand-written patterns the shapes cannot express. **Accept:** unit tests per family/form; ui.avatar 205/205 plus ≥ 1 new test per generated form; `export-training --world ui.avatar` agreement not lower; operational gate holds.

#### L7 — roll-out by biggest win
Order: media.music, kids.shop, kids.time, kids.arith, kids.tasks, docs.editor, geo.map, data.charts, docs.reader, games.chess, then the rest. Per world: `migrate-macros` (L4), lexicon `extends`, shapes for the operations the `coverage.md` catalogue lists; update `coverage.md` lines to name the shape that covers them. One commit per world, operational gate after each. **Accept:** total `patterns.sop` ≤ 2 MB; no world below its L0 `eval-rules` restricted score; headline ≥ 1062 right, ≤ 37 wrong.

#### L8 — shared yes/no/cancel and `ctx.lang`
`ctx.lang.yesNo/ordinal/degree/colour` in the interpreter context, backed by `lang.common`; replace the `YES` regex in `ui.avatar/ops.mjs`, the filler regex in `docs.reader/ops.mjs`, and let `discourse.openConfirm`/`interceptInput` consumers use it; `games.guess` yes/no patterns via `[$lang.yes]`/`[$lang.no]`/`[$lang.unsure]`. Spec 04 "ctx". **Accept:** unit tests; all four interceptor worlds' tests green; new operational cases for "sure thing", "nah", "never mind" on avatar confirm and guess.

#### L9 — frame literals in routing (measured)
`inTier` ranks by content literals, then frame literals. Run `eval-rules` routing, operational and `export-training --routing-context` with and without; keep it only if `wrong` does not rise and routing agreement does not fall. **Accept:** both result tables in the log; ADR-007 amended with the decision.

#### L10 — rebuild and document
`scripts/build-webchat.mjs`, `docs/formalizer-rules.html` and `docs/worlds.html` (macros, lang.common, shapes, `expand-patterns`), AGENTS.md note "new phrasing goes into `lang.common` or a shape, never inline". **Accept:** webchat `worlds/index.json` ≤ 2.5 MB; docs mention every new wire type; `L summary` table in `worker-log.md` (world · patterns before → after · bytes · headline before → after).

### Review fixes F1–F8 (from the external review of 6b0db7c, accepted by the reviewer 16:00)

The review's claims were checked: the music labels (`a key with 4 sharps?` labelled `n=3, acc=flat`), `Make your eyes and body blue` → unknown eyes "and body blue", and `itertools.cycle(sl)` in `dispatcher.py`. **F1 and F2 are P0:** they corrupt labels and metrics, so do them before the next dataset rebuild and retraining. Continue R2 in parallel: it touches the rules, not the labels.

**F1 (P0) — labels must keep each variant's own parameters — code DONE and validated (26316f0).** Still to do: the committed `training/paraphrases/out/*.jsonl` still hold the old labels (`a key with 4 sharps?` → n=3 flat). Rerun the collector on the whole inbox (it now merges several files), commit the outputs, then rebuild. `labelVariant` in `collect-paraphrases.mjs` copies the canonical's target onto variants that may carry different values.
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

**F4 (P1) — compositional multi-command data — DONE and validated (3424ec2 training, 0bd45a8 rules).** (Earlier note, now resolved:) `Become a robot` + `Make your eyes and body blue` still answers "I do not know eyes like 'and body blue'" at 16:45. Implement the conservative expansion in the rule formalizer, with tests, for the shared argument, verb ellipsis and self-correction ("blue, no, green"). Today it is concatenation only, with the context dropped (`session: []`) and the target recovered via `source_id`.
- Generate a small program (operations, values, references, initial context), then verbalize it in several ways.
- Add explicit families: shared argument ("eyes and body blue"), verb ellipsis ("eyes blue and body red"), self-correction ("blue, no, green"), reference to a created object ("draw a circle and put it above the square"), repetition and undo ("move left twice, then undo"), switching world.
- Keep or construct the needed context. Report full-request success per family.
- **Rules side (R2):** coordination with a shared argument and self-correction belong in the rules, through a conservative expansion before parsing ("eyes and body blue" → "eyes blue; body blue", provenance kept). The segmenter must not be asked to copy arguments.

**F5 (P1) — explicit reasons instead of "refused" — DONE and validated (6ddc7c1).** Add a shared `reason` field, set by the interpreter and read by the validator:
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
- **F2, F3 and the F6 iterator fix are DONE by the reviewer (16:10).** `normalizedSop` keeps the order of requests/questions and compares only runs of plain facts as sets. `safe_noise.plain` keeps decimals, times, accidentals and quoted payload. The segmentation loader restarts instead of `itertools.cycle`. Tests: `tests/paraphrases.test.mjs`, `training/tests/test_safe_noise.py`. **Pull, then rerun the collector, rebuild the dataset and the edit/normalizer pairs:** the labels and metrics change, because reversed-order variants no longer count as agreeing.
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
- F2, F3, F6 iterator — reviewer (a40da8d): tests pass.
- F5 — Refusal reasons (6ddc7c1): 591 tests and all world tests pass.
- F4 (training side), F6 budgets/sampling, F7 selection hook, F8 windows (3424ec2): 20 Python tests pass. F4 still needs its rules part.
- F4 rules — Pre-parse expansion (0bd45a8): "eyes and body blue" and "blue, no, green" now work in the CLI.
- Operational set (1de5a5a): 1,234 fixed messages. Reviewer rerun, rules only, at 4c60162: 85.9% right, 3.1% wrong, 9.5% not understood (worker: 84.3% before the F4 rules). This is the headline from now on.
- F1 — Label logic (26316f0): 20 tests pass. A dry run on media.music.h4 shows rules-own 58 and needs_review 8. The outputs are not yet regenerated (see F1).
- S1 + N1 + engine normalization (60d99b6, 18a9f59, a6ba84b): 655 tests pass. Operational rules-only per group: kids 90.2, avatar/shell/editor 79.3, music/draw/map/charts 85.2, games 86.2, documents 91.7, all ≥ the previous run. N1 shipped policy on the fresh set: 65.1 → 68.9, misled/recovered 0.21. Still open: the pipeline-level eval with the normalizer (`eval-dispatch --normalizer`), and games, where misled ≈ recovered: keep the normalizer off there until it improves.
- L0 baseline + L1 matcher prefilter (d26b57b, cb5c252), checked together with the discourse layer (584c3d3) and the Profile world: 668 tests pass. Operational rules-only: **86.5% right, 3.0% wrong, 9.0% not understood, p50 latency 11 ms** (was 22 ms).
- L5 — `{note}` fallback (01d1220): 661 templates removed. 680 tests pass; operational unchanged at 86.5% right / 3.0% wrong.
- Discourse phases 1 and 2 (reviewer agents): ellipsis, pending clarifications, verb distribution, repairs, cancellation, attribute/ordinal references, comparatives, choice clarification, list mode, repeat/explain, negative feedback (phrase log), topic return; `src/dialog/lang.mjs` holds the shared vocabulary that L8 should absorb into `lang.common`. Operational unchanged (1068 right / 37 wrong). Use these mechanisms in the DLG dialogues.
- L2–L4 — phrase macros, `lang.common`, `migrate-macros`, ui.avatar pilot (d6abc37, 0a28f0e, 780255c, 751f448): 717 tests pass. Operational unchanged (1068/18/37/111). The size target is reinterpreted: −60% of the whole file was unreachable (32 KB of ui.avatar is examples/emit/ids). Match text −43% is accepted. For L7, measure the **match text** and the number of repeated groups, not the file bytes.
- R2 dispatcher v2 published (215677c), chosen by the full-pipeline result: operational **right 90.0 → 91.2%, wrong 4.0 → 2.8%**. Reviewer check in headless Chrome with the Encoder: multi-command, typo, tab-routing and abbreviation messages answered correctly, no console errors.
- Review-2 small fixes by the reviewer (ac3785b, 8866230, a3f19d3, e139210, 10068d4, 2201691, f7e25b3) + worker G1/G6/G8: 747 tests pass at f7e25b3.
- G1, G2 (in the CLI), G3 (eaef124, 85e2f4b, 3db5374) + parallel evaluation (a5c241b): 759 tests pass. Probes: "rename yourself to Bolt" → Bolt; "your name is Zed from now on" → Zed; "lets play hangmn" starts hangman; "knight to f3, no, knight to c3" plays only c3; "e, no, z" guesses only Z; "wat do red and yelow mak" → orange.
- Rule widening round after review 2 (eece65c, 44b0182, 0d2dc2a, b5e5d7e, b8e619c): 764 tests pass. **Operational, rules only: 91.7% right, 1.5% wrong, 5.0% not understood** (was 86.7 / 2.9 / 8.9). Part of the gain comes from the gold corrections of 'operational failures v2'. Weakest group: music/draw/map/charts, 86.1% right and 3% wrong.
- Label repair (790c41b, b29a8a0) + rule round 2 (47f5697, c471cd4, 9d8420f, e162b65): 772 tests pass. **Operational, rules only: 94.2% right, 0.6% wrong, 3.4% not understood.**
- DLG + G7 (a5b686d): 365 multi-turn dialogues (1,709 turns, 45 for user.profile and long returns), 12 families, evaluator with the three modes. Reviewer rerun in rules mode: 90.3% of turns, 70.4% of dialogues right (identical).
- D-FIX round 1 (3713860 … d05647d): 797 tests pass. Operational rules: 94.8% right / 0.6% wrong / 2.8% not understood. Dialogues (rules): 92.6% of turns, 77.5% of dialogues, both reproduced.
- L8 — `ctx.lang` backed by `lang.common`; `src/dialog/lang.mjs` absorbed; avatar, docs.reader and games.guess use it (a745938): 797 tests pass. Operational 94.8% / 0.6% wrong; dialogues 77.6%. No regression.
