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

**Agents and tests (user decision 18:53): at most 3–4 agents in parallel.** Your machine reached load average 60 with many agents each running the full test suite, and progress slowed down.
- Group several related fixes into one agent: one agent per area, not per bug.
- Each agent runs only the **fast suite** plus the tests of the files it touched.
- The coordinator (you) merges a batch, then runs the **full suite once**.
- Only one full-suite run at a time on the machine; use a lock file (`/tmp/psys2-full-tests.lock`).

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

### NIGHT PLAN (user, 23:05 local): two tracks in parallel, at most 4 agents in total

- **Track 1, CPU and browser, 2 agents at most:**
  1. the MOBILE-VOICE review fixes (two-tab handover at 6×, noise without the dry run, the browser replay of the phone export);
  1b. FREEZE-6 (main-thread load in the soak: profile, then fix the top causes);
  2. BUSY-LOST;
  3. DIAG3b;
  4. RP5b.
- **Track 1 status (reviewer, 08:35 local): all Track 1 items are validated, see the end of the file.** (My 04:00 note missed commits that were already on main; sorry.) *Old note:* no commit for the MOBILE-VOICE review fixes, FREEZE-6, BUSY-LOST, RP5c item 1 or GAPS-1 since 23:58, except RP5b and RP5c. Track 2 is done with NX, so **move its agents to Track 1 now**, in this order: MOBILE-VOICE review fixes, BUSY-LOST, FREEZE-6, GAPS-1 (items 1–2), RP5c item 1. If something blocks, write it to `questions.md` and go on to the next item.
- **Track 2, GPU and LLM APIs, 2 agents at most:** NX below.
  - Labelling by API batches or by vLLM on the GPU loads neither the CPU nor the agent count.
  - Do not run test suites from Track 2 agents, except the NX unit tests.
- Start NX2 (the model pilot) and NX4-A (training on the labels we already have, which cost nothing) **at the same time**. While A trains, the LLM data is generated. Retrain at the end with everything.
- Work carefully: every stage is resumable, logged with its command, and committed as soon as it is done. A crash must not cost the night.

### NX — encoder formalizer experiment: learned heads vs the rule formalizer (user, 21:48–23:05 local) — experiment only, no webchat integration

**Question.** Can a small encoder produce the SOP formalization (operation + the answer to each legend question as a span of the sentence) better than the rules? Measure it at the same browser cost as today.

**The user decides on integration after seeing the numbers.** Do not change `docs/webchat`, `src/` or `worlds/` for NX.

**Browser limits, already measured by the reviewer.** See `training/experiments/browser-limits/README.md`, with the harness and the results JSON. The facts that shape the variants:
- One encoder pass is ~60 ms at 1× and ~300 ms at 4× on a 2-vCPU host, the same as dispatcher v4.
- Heads inside the graph cost almost nothing: +3.7 MB for 24 tag heads plus a 600-op head.
- Batching gives no gain (single-thread wasm), so N questions cost N passes.
- `ort.LoraAdapter` works in onnxruntime-web 1.31: a 2.66 MB adapter, swapping it costs nothing. But each adapted world needs its own pass.
- Every extra loaded session costs ~100–150 MB of RAM.

**Reviewer notes at 45a5d03 (00:35 local): good, careful work. NX1, NX2 and NX4-A are accepted, with these follow-ups:**
1. **The comparison must cover the cases where the rules fail; that is where a model can add value.** NX5-lite measures only the 829 cases whose rules outcome is `right`, where the rules win by construction. Add, with the same columns:
   - operational cases whose rules outcome is `wrong`, `partly` or `not understood`;
   - the `rules-fail` / `rules-differ` heldout paraphrases;
   - the real phrases 09c, d and e and the mobile export (English translation).

   For each: the model's operation and slots vs the expected reading. Then hybrid D on the whole set: rules first, model only when the rules have no complete reading, validator always. **D is the number the user will decide on.**
2. **The judge.** Neither judge qualified, partly because the gold has a single reading. Keep Sonnet as the judge, but put the deterministic gate and rules agreement first, so the judge only sees disagreements. Add a second accepted reading to the gold items where the judges' "false alarms" were alternative valid readings (a key given twice, constants, count=1 for "a"), and report judge precision and recall again on that gold.
3. **NX3 throughput.** Without an API key, generation runs through subagent sessions (Sonnet ~97 items/min each).
   - Use **generate-and-label in one session per shard of 300–500 seeds × K variants**.
   - Run 2 Sonnet sessions in parallel on Track 2.
   - Haiku may *generate* phrasings, which is cheaper, with Sonnet labelling them in batches, if that is faster end to end.
   - Log the items per hour, so we know by morning how much data the night produced.
   - Priority: the weak worlds first (ui.avatar, docs.editor, ui.help, games.hangman, kids.arith operation pairs), then the rest.
4. **A vs A+.** A is the only drop-in (identical v4 outputs, +0.9 MB). Retrain A on NX1 + NX3 at the end. A+ needs an operational-set rerun with its own seg/edit outputs before it could be compared as a replacement.
5. **Cleanup.** Nothing in `training/runs` was deleted, and the DGX has 49 GB free. Do the cleanup from the task (keep list), and log the freed space.

**NX1 — the label format and the free labels (do first, small).**
- One record per segment, world-agnostic:
  `{ id, group, split, world, tab, context, text, lang, op, slots: [{ key, ask, span: [s,e] | null, text, value }], label_source, labeler, judge, status }`.
  - `ask` is the key's `ask=` question from the legend (490 of 492 keys have one).
  - `value` is the canonical value after the lexicon; the model only predicts spans and the operation, and canonicalisation stays deterministic.
- Converter: extend `scripts/export-training.mjs`, or add `scripts/export-nx.mjs`. Wires already carry `core.source` and the slot spans.
- Free labels, no LLM:
  - rules-own readings of `training/paraphrases/out` and `heldout/out`, the datagen output, `training/phrase-logs`, and the ▲ feedback records;
  - the diagram source corpus `imports/diagram-vss-demo/data/train` (~49.7k messages, wires with spans and args), converted through `world-draft` to our keys.
- Data goes to `training/dataset/nx/` (outside git). Commit the code, `training/results/nx-data-report.json` (counts per world, source and status) and the tests.
- **Protected, never in training:** `training/eval/real-phrases-2026-11-09*`, the `expectations-*` files, `operational*.jsonl`, `dialogues.jsonl`, and the diagram `data/test` and `data/bench`.

**NX2 — model pilot: which labeler and which judge are good enough (first, about 1–2 h).**
- **Gold set `training/nx/gold/pilot-300.jsonl` (commit it; it is small):**
  - 150 items whose rules reading has a verified-correct outcome (operational and dialogue cases; the label = the rules' wires);
  - 100 paraphrase items where the rules fail but the canonical label is inherited and checked (`rules-differ` / `rules-fail`, spec 10);
  - 50 real phrases (09c, d, e and mobile; English translation for Romanian). Sonnet labels them, then you check each one against its expectation line by hand.
  - Spread the 300 over all worlds, the diagram included.
- **Labelers:**
  - Claude Haiku 5.5 and Claude Sonnet 5.5;
  - **two local models on the GB10 with vLLM**: one ~30B MoE and one 70–120B quantized, whatever is available or downloadable on the DGX. If no weights can be obtained, write that in the log and continue with the two Claude models.
- **Batch mode for every candidate:**
  - one request carries **25 sentences** of one world;
  - the system prompt is the world's legend (keys with `ask`, types, lexicon heads), its operations with parameters, and 10 solved examples. The system prompt is cached.
  - the output is a JSON array.
- **Report:**
  - operation accuracy;
  - slot exact-match F1;
  - span validity;
  - JSON validity;
  - abstain rate;
  - items per minute;
  - $ per 1,000 items.
- **Judges:** Haiku and Sonnet judge the labelers' outputs on the pilot, 50 items per call, answering accept / reject / fix with a reason. Report each judge's recall of wrong labels and its precision.
- **Selection rule (apply it yourself, do not wait for the reviewer):**
  - **labeler:** the cheapest model with operation accuracy ≥ 95%, slot F1 ≥ 0.92 and ≤ 2% invalid output;
  - **judge:** the cheapest model with ≥ 90% recall of wrong labels at ≥ 80% precision. If none qualifies, use Sonnet and say so.
  - Write the table to `training/RESULTS.md` (NX2) and `training/results/nx2-pilot.json`.

**NX3 — bulk generation, built for throughput (after NX2; runs while NX4-A trains).**
- **Generate and label in one call.** For each world, the chosen model receives a shard of seeds (canonical examples, pattern examples, the rules' failures from the phrase logs). It writes **K = 20 varied phrasings per seed with their labels** in the same JSON output:
  - voice-like text, typos, indirect requests, multi-command messages;
  - Romanian-translation artifacts;
  - and 20% Romanian phrasings, which go through our `ro-en` translator before labelling, so the formalizer sees English as in the app.
- **Batching:**
  - Use the **Message Batches API** when `ANTHROPIC_API_KEY` is available on the DGX: 50% cheaper, with the cached per-world system prompt.
  - Otherwise use haiku or sonnet subagents, **each processing a shard file of 200–500 items in one session** (never one call per item), at most 2 at a time on Track 2.
  - For the local model: vLLM offline batch generation over the whole shard list.
  - Shard by world; resumable; content-hash ids; a finished shard is skipped on restart.
- **Deterministic gate before any judge** (`scripts/nx-validate.mjs`, with unit tests):
  - the JSON is valid;
  - the operation exists in the world;
  - the keys belong to the operation, and the required ones are present or explicitly null;
  - every span equals the text at its offsets;
  - values canonicalise through the lexicon;
  - executing the wires on a fresh world state raises no error (interpreter dry run).
  - A record failing the gate is dropped, and the reason is counted.
- **Then the rules read every generated text:**
  - same operation and values → `agreed`;
  - otherwise → the judge, in batches of 50;
  - plus a **3% audit sample of agreed items** to the judge, so we know the noise of `agreed`.
- **Targets:**
  - ≥ 2,000 accepted items for every world;
  - the diagram from its converted corpus plus 2,000 generated items;
  - about 50k in total.
- **Splits by `group`:** the siblings of a seed stay in the same split.
- **Budget:** a hard cap of **$60 of API for the whole night**, logged per stage. At the cap, stop generating and continue with what exists.
- Commit the pipeline code, the reports (`nx3-generation.json`: per world counts, gate drops by reason, judge accept rate, audit error rate, $ and time per stage) and a 200-item sample.

**NX4 — models (DGX).**
- **A, heads on the frozen dispatcher v4 encoder (sha 6c41eb24).**
  - Add a global operation head (sequence level, same input as the world head: `tab: .. ; recent: .. ;; <segment>`) and a BIO tag head over all `world.key` labels. Train only the heads.
  - Export **one ONNX with the dispatcher heads and the new heads**, so one pass gives everything.
  - Check that the dispatcher outputs are identical to v4 (frozen backbone ⇒ no forgetting).
  - Start it now on the NX1 labels; retrain on NX1 + NX3 at the end.
- **A+, forgetting check:** the same, with the top 2 layers unfrozen and dispatcher replay. Report the dispatcher metrics before and after.
- **B, world-agnostic span extraction from the legend questions.**
  - Input `<ask> [SEP] <segment>`, output start/end or no answer.
  - The operation is scored with `<operation doc + example> [SEP] <segment>`.
  - Train on all worlds except **kids.shop, games.hangman and kids.time**, held out to measure generalization to unseen worlds.
  - Also report the number of passes per message, i.e. the browser cost.
- **C, LoRA r=8** (q, k, v, out, lin1, lin2) **plus heads, per world.** Only for diagram.sketch, media.music and art.draw.
  - Export `.onnx_adapter` files: the LoRA weights must be overridable initializers, see the README.
  - Check one in the browser harness.
- Seeds: 3 seeds for A and B when the difference to the rules is < 2 points.

**NX5 — evaluation, the same way the rules are evaluated.**
- **Pipeline:** model output → spans and operation → deterministic canonicalisation → SOP wires → validator → interpreter.
- **Sets:**
  - the operational sets;
  - `dialogues.jsonl`;
  - the real phrases 09c, d and e against their expectations, and the mobile export;
  - the diagram bench with the source project's scorer (`imports/diagram-vss-demo/reference`);
  - B's held-out worlds.
- **Report correct / wrong / abstain per set and per world for:**
  - the rules alone;
  - A, A+, B and C;
  - **D (hybrid):** the rules first, the model only when the rules have no complete reading, the validator always;
  - and "model first, rules as fallback".
- **Browser:** run `training/experiments/browser-limits` with the real exported A model (and B with its pass count) at 1× and 4×; report the size.
- Write everything to `training/RESULTS.md` (section NX) and `training/results/nx-*.json`, with the commands. End with a short recommendation. **No webchat change.**

**NX6 — integration as a strategy parallel to the rules (user decision, 01:27 local): do it only if the NX5 numbers are clear.** This replaces "no webchat integration" for model A only, under these conditions.
- **"Clear" means all four of these, measured with `scripts/eval-nx.mjs` and the operational runner, with the commands logged:**
  1. on the sets where the rules fail (operational cases not `right`, the `rules-fail` / `rules-differ` heldout paraphrases, real phrases 09c, d and e and the mobile export), hybrid D gets **at least 3 points more right** than the rules alone;
  2. on the 1296 operational set and the long set, D has **no more than +0.2 points wrong** than the current webchat mode (encoder+n1);
  3. Romanian (`operational-ro.jsonl`) and `dialogues.jsonl` do not get worse (right −0.5 points at most, wrong +0.2 at most);
  4. the browser cost is unchanged: one pass shared with the dispatcher, +≤ 1 MB, the same ready time in `scripts/perf-webchat.mjs`.
- **How to integrate:**
  - Ship the exported A file (v4 outputs identical, plus `op_logits` and `tag_logits`) in place of the dispatcher file, with `nx-meta.json`.
  - Add a formalizer strategy `heads` (`src/formalizer/`, the same interface as the rules strategy, spec 06): spans → deterministic canonicalisation → wires → the same validator.
  - Run it in parallel with the rules on every piece, at no extra pass.
  - **Selection:** a complete valid rules reading wins. The heads reading is used only when the rules have no complete reading and it validates (D). `broken = 0` must hold by construction (spec 03, lexicographic preference). The trace shows which strategy produced the wires.
  - Settings › Developer › Formalizer: `rules`, `encoder` (today), `encoder + heads` (D). Make D the default **only if** the four conditions hold.
  - Tests: unit tests for the selection; a browser test with D on (the 09c/d/e rows, a Romanian session, a diagram session); `test:browser`; the operational eval in D mode.
  - Update spec 03, spec 06 and `training/RESULTS.md`. The reviewer validates in Chrome before the user sees it.
- **If the numbers are not clear:** do not integrate. Write which condition failed and by how much, and leave D available only in `eval-nx`.
- A+, B and C are not integrated, whatever their numbers. They stay as results.

**NX7 — confidence gate for D, then recheck NX6 (reviewer, 02:05 local, after 9809b87 / 71177f8).**

NX5 is accepted. It is careful and honest: the per-item transitions and the selection-effect caveat are exactly what was needed. The NX6 check is right too: **conditions 2 and 3 fail on the wrong rate** (operational +0.6 points wrong, dialogues +1.0), so there is **no integration as things stand**. The next step tonight:
1. **The gate.**
   - D uses a model reading only when all of these hold:
     - (a) the operation probability is ≥ τ_op;
     - (b) every predicted span lies inside the candidate pattern's frame and the pattern's frame words fit the segment, with a score ≥ τ_frame;
     - (c) the rules gave **no reading at all**, i.e. unparsed or not understood. **A partial or best-effort rules answer is kept**: that alone removes the 7 right→wrong/partly losses you found.
   - Also report the variant where (c) allows a partial rules answer to be replaced only when the model covers strictly more of the segment's words, at the same operation.
2. **Tune τ only on data that is not reported:** the NX1/NX3 dev splits and `nxtest` dev. Never on operational, dialogues, gold or real. Report the τ curve (gain on `gold-para` + `nxtest-rules-fail` vs added wrongs on the dev operational-like records) and pick the point with **0 added wrong on dev**.
3. **D on top of the webchat mode.** Build D over `encoder+n1` (dispatcher + normalizer + rules, as shipped), not over the `rules` mode. Condition 2 is measured against encoder+n1, so this is the comparison that counts.
4. **Romanian.** Run `operational-ro.jsonl` through the translator into D (the model sees English, like the rules).
5. **Recheck the four NX6 conditions** with gated D on encoder+n1, with A3 (the drop-in), and report A+3 too. **If all four hold, do NX6** (integration as a parallel strategy, default only then). If not, write which condition fails and by how much, and stop NX there.
6. More NX3 data aimed at the constants (arithmetic operator forms, `arg.list`, `arg.anim`, the ui.avatar part operations) is optional, only if time remains after 1–5.

**NX6 GO (reviewer, 02:50 local, after e609df1): integrate A3 with the negation guard.**

NX7 is accepted. **A3 + guard** (τ_op 0.99, τ_frame 0.9, negation guard on, spans in frame, only on segments the shipped mode leaves not understood) meets all four conditions, even condition 1 read strictly against the shipped mode, not the rules:
- +5.2 points on the rules-fail sets over encoder+n1;
- 0 added wrong on operational, long, dialogues and Romanian (Romanian +0.6 points right);
- the same pass.

The user approved integration on these terms (01:27), so do NX6 now with exactly this configuration:
1. **Publish the A3 export** (`training/runs/export/nx-a-nx3`, int8, outputs identical to v4) as the webchat dispatcher model, with `nx-meta.json`. This is a deliberate model publication (one new model blob). Check the published sha's v4 parity in the browser harness.
2. **The `heads` strategy in `src/formalizer/`**, ported from `scripts/lib/nx-formalizer.mjs`: gate, negation guard, pattern-frame choice, the same validator and interpreter dry run on a session fork.
   - It runs only for segments that are still `unparsed` after the shipped pipeline (spelling, partial, best effort included).
   - The trace and the phrase log record `strategy: heads`, `p_op`, the frame score and the accepted operation, so real use can be audited from exported logs.
3. **Settings › Developer › Formalizer:** `rules`, `encoder` (today), `encoder + heads` (**default**). The τ values are in the config, not hard-coded.
4. **Condition 4, measured:** `scripts/perf-webchat.mjs` ready time and first answer before and after (4×), and the size (+0.9 MB).
5. **Tests:**
   - unit tests for the gate and the selection, with `broken = 0` (a complete shipped reading is never replaced);
   - a browser test with the default on: the 09c/d/e rows, a Romanian session, a diagram session, and one gold-para case the heads recover (for example from the NX7 per-item rows), shown with `strategy: heads` in the trace;
   - `test:browser`; the fast suite.
6. **Docs:** spec 03 (strategy order), spec 06 (formalizer setting), `docs/formalizer-encoder.html` (status: partially implemented, as heads on the dispatcher, gated fallback), RESULTS.
7. **Rollback must be one setting.** If the reviewer finds a regression in Chrome, the default goes back to `encoder`.

Track 1 keeps priority on its own agents. NX6 is Track 2's last task tonight; after it, if time remains, do step 6 of NX7 (data for the constants) and the DGX cleanup.

**Cleanup (user, 23:05).**
- **On the DGX, in `training/runs/`, which is not in git:**
  - Keep:
    - the published dispatcher v4 (6c41eb24) checkpoint;
    - the best v5s1–v5s4 checkpoints (R5 is pending);
    - the published normalizer (flan-t5-small v2);
    - everything NX needs.
  - Delete the other run directories: older dispatchers v2 and v3, the unpublished v4a–v4f, the ModernBERT runs, the unpublished normalizer runs, the smoke runs.
  - Log the kept list and the freed GB.
  - Do not delete datasets.
- **Git:** the working tree already holds only the current models (dispatcher v4, normalizer v2). The old versions are only in history (3 old dispatchers and 2 old normalizers, ~400 MB uncompressed).
  - The reviewer made a full backup bundle and will **not** rewrite history tonight: a force-push while your agents commit would risk losing commits.
  - History is cleaned only at a quiet moment agreed with the user, and then every clone must be reset.
  - Until then: never commit a model file except a deliberate publication.

### MIC2 — an always-open microphone, a visible command queue, a reliable mic button (user, 16:57 local; the user also told you directly — this is the reviewer's precise version)

**1. The microphone stays open once switched on.**
- A click turns listening on, and it stays on (what is called hands-free today becomes the only mode). The first click is the user's permission for this.
- It goes off only with a click on the same icon or a **mute command**. Accept many synonyms and keep them in `lang.common` as one phrase group (`lang.mic.off`):
  - English: "mute", "mute the mic", "stop listening", "microphone off", "mic off", "turn off the mic", "pause listening", "stop the microphone", "close the microphone", "go to sleep", "that's all for now";
  - Romanian: "oprește microfonul", "închide microfonul", "pune pe mute", "nu mai asculta", "taci din ascultat", "gata cu ascultatul", "microfon oprit".
- "Be quiet" / "stop talking" / "taci" stop the voice output, not the microphone.
- There is no voice command to switch it on: a muted mic cannot hear. The icon, the push-to-talk key and the Settings switch turn it on.
- Long press is no longer needed. Remove it: it is one cause of lost clicks (below).

**2. Commands queue up and run when they can.** This replaces the "no queue" rule of HANG + STOP, now that turns are bounded.
- While a turn runs, spoken and typed messages go to a **visible queue** above the input: one chip per message, in order, each with an × to drop it. A counter on the mic says how many are waiting.
- They run one by one as soon as the current turn ends. Only *sending* waits; listening and typing never stop.
- Stop ends the current turn and asks "Drop the 2 waiting messages too?" (default: keep them).
- A queued message that only made sense before (a yes/no to a question that the current turn already closed) is shown greyed with "skipped: the question was already answered".
- The phrase log keeps each message's queue wait.

**3. The mic button often ignores clicks ("I have to insist until it works").** Causes found by reading `app.mjs` at 413669e, all to fix:
- A tap longer than 600 ms (common on phones, or a slow mouse press) toggles hands-free in `pointerdown` and then swallows the `click`. Remove the long press (point 1).
- **Stop is not immediate.** `stopListening()` calls `rec.stop()`, and the UI stays "listening" until Chrome fires `onend`, which can take seconds. Meanwhile further clicks call `stop` again and do nothing. Fix:
  - flip the UI state on click at once (optimistic);
  - call `rec.abort()` if `onend` has not come within 300 ms;
  - ignore clicks for 250 ms after a state flip (no double toggles).
- **Start can also be slow.** `listenOnce()` before `onstart` leaves `mic.listening` false, so a second click starts again (no-op) or stops. Treat "starting" as its own state, shown with a spinner ring.
- While the answer is read aloud, `start()` returns early. A click during speech must stop the speech and start listening (barge-in), not do nothing.
- Log every mic click with the state before and after (Developer tab), so the next report is precise.
- **Test:** a headless fake recogniser with slow `onstart` / `onend` (1–2 s); 50 random clicks with random delays; the UI state always equals the recogniser state after 300 ms, and no click is lost.

### EOT2 — end-of-turn detection cuts "play little star" after "play" (user, 16:57; phrase log rows 63–68)

The phrase log shows "play" sent four times with `endType: pause-plausible`, `waitMs ≈ 710`: the detector thought "play" was a whole command. It is a reading with **status `missing`** (it needs an argument: "What should I play?"). Fix in `speech.mjs` / `dryRead`:
- **Plausible requires a complete reading with every required argument.** `missing` / `ambiguous` mean not plausible: wait the long pause (1.8 s, hands-free 2.5 s).
- A one-word utterance that is a verb, or any utterance whose last word is a verb, a determiner or a number ("play", "draw a", "add 3"), waits the long pause.
- If the long pause still sends a bare "play" and the next utterance comes within 3 s, read it as the continuation: "little star" answers "What should I play?". This already works, keep it.
- Data: replay the phrase log rows 61–68 through the fake recogniser with their timings; "play little star" with a 900 ms gap after "play" must be one message.

### RP3 — the user's phrase log of 2026-11-09 afternoon (68 messages): failures and the general fixes

Files (committed by the reviewer):
- the log: `training/eval/real-phrases-2026-11-09c.jsonl`;
- the expected behaviour per failing case: `training/eval/expectations-2026-11-09c.jsonl` (24 cases, with the tab and the previous messages).

Rechecked in the CLI at 413669e: still wrong are rp3-01..06, 07 (makes a heading called "Two chapters"), 08 (adds the words "add text" as a paragraph), 09–16, 17–18 (music "play" and "play a random song") and 21–24 (profile interview slot alignment).

Turn every case into a dialogue test (`dialogues.jsonl`, family `real`) and fix each as a **general** mechanism:
1. **Voice garble repair on the active tab** (rp3-01, 09, 10, 11):
   - a sound-alike and split/merge-word correction pass against the active world's vocabulary ("mcdavatara" → "make avatar a", "are/on the new" → "add the new", "Chester" → "chapter?");
   - only for `mode=voice`, after normal spelling, and never across worlds (RD1b safety);
   - ask before acting when the match is weak.
2. **Voice stutter and send words** (rp3-02, 06): drop an immediately repeated word or phrase ("the the", "avatarul o persoană avatarul o persoană"); strip trailing send words ("send", "trimite", "over", "gata") in voice mode.
3. **Avatar expressions as loose words** (rp3-03..05): "big smile", "make a big smile", "get a big smile" map to the widest smile on every character; also "small smile", "frown", "wink", "open mouth", "tongue out".
4. **Editor multi-structure requests** (rp3-07, 08): "a header, two chapters and a paragraph" creates each part. "Add text" without the text asks for it. Never write the command words into the document.
5. **Games** (rp3-12..14):
   - an answer plus extra information ("yes, it eats meat") answers the question and keeps the information as evidence;
   - "new game" restarts the game of the active tab;
   - "X and 0", "x și 0", "noughts and crosses", "x and o" are tic-tac-toe.
6. **Arithmetic word problems with typos** (rp3-15): "flyes away", "How many bee Tom has" read as 10 − 1 = 9. Add common verbs of leaving (flies / runs / swims / walks away, leaves, goes home) to the minus frames.
7. **Drawing with heavy typos** (rp3-16): "the un si up not udner clouds" moves the sun above the clouds. Typo correction inside the active world must handle 2–3 typos when the rest of the sentence fixes the reading.
8. **Music** (rp3-17, 18):
   - "play" on the Music tab plays the selected or last song, else a random one;
   - "play a random song / something / any song / surprise me" picks a random known song and names it.
9. **Profile interview** (rp3-20..24):
   - **Phrase log status.** The webchat logs every interview answer as `unknown` with no world (rows 40–52), while the CLI handles them. Answers taken by a world's frame / modal mode must be logged with that world and status `supported`; this is also why the learning loop would learn nothing from them.
   - **Slot alignment.** A non-yes/no answer to a confirmation question answers what it fits (a proper name → company); "R&D" is a field or department, not a hobby; a bare number answers the last numeric question.
   - **Resume.** "coming back to knowing me, what questions do you have?" resumes the interview.
10. **Report.** The 68 phrases and 24 expectations turn by turn, before / after, plus the operational and dialogue sets (wrong must not rise).

### DBG — a debug view per tab, in developer mode (user, 16:59 local)

**Switch.** A "Developer mode" switch in Settings › Developer, off by default and remembered. When it is on, every tab header gets a small **Debug** button (bug icon, tooltip "Debug this world").

**The Debug button** opens a **full-screen modal** (the same component as SET: × on the right, Esc / Back close it) about the world behind that tab. Its sections are tabs:
1. **Commands.** Everything this world understands, generated from the loaded world, not hand-written:
   - the canonical examples and the request shapes;
   - every pattern with its id, its examples and the operation it emits, grouped by operation;
   - a search box;
   - a "Try" button on each example that puts it in the input.
2. **Last turns.** The last 20 turns that touched this world, newest first. Each one is expandable into the whole pipeline:
   - the input;
   - language detection and translation;
   - spelling and voice corrections;
   - the dispatcher's segments with candidate worlds and scores;
   - the readings tried (pattern id, complete / partial, refusal reason, validation result);
   - the **SOP Lang wires** that were run, pretty-printed with syntax colouring;
   - the operations executed with their arguments;
   - the reply;
   - the timing per stage, and the watchdog / stop outcome if any.
   Reuse `ui/trace.mjs`.
3. **Dry run.** A text box: type a phrase and see how it would be read (segments, candidates, readings, wires, plausibility for voice end of turn) **without executing anything**. Uses `DialogSession.dryRead`.
4. **State.** This world's state as a collapsible JSON tree, with the diff of the last turn highlighted, plus the ASTRA view for this tab: discussions, instances, focus and entities, open frames and expectations.
5. **World.** The manifest (`world.sop`), legend keys, lexicons (word counts and words), operations, templates, imports, and the coverage summary (`coverage.md`).
6. **Models.** The dispatcher and normalizer versions; the last calls to them for this world with inputs, outputs and ms; the ORT worker status (HANG2 logging).

Every section has **Copy** and **Export JSON** buttons, so the user can attach a debug dump to a bug report. The phrase log gets a "debug dump" link per message when developer mode is on.

**Constraints:**
- Developer mode off means zero cost: the debug code is a lazily loaded module and nothing is recorded beyond what the trace already keeps.
- On means a ring buffer of the last 200 turns.
- Works on a phone: the sections scroll horizontally, and the wires and JSON wrap or scroll.

**Tests:** headless, developer mode on:
- every tab shows the button and opens the modal;
- Commands is not empty for any world;
- the dry run executes nothing (the state hash is unchanged);
- Last turns shows the wires of a command just sent;
- 0 console errors;
- screenshots for the reviewer.

### FB — thumbs up / down on every answer, with feedback the learning loop can use (user, 17:06 local)

**Buttons.** Under every answer, next to "Trace" and "answered in": **▲ (good)** and **▼ (not what I wanted)**.
- Small and subtle, with tooltips. One choice per answer, changeable.
- Keyboard and screen reader accessible.

**▼ opens a small inline form** under that answer. It must take a few seconds to fill:
- quick reasons as chips: "wrong action", "wrong thing / object", "wrong place / value", "did too much", "did too little", "wrong tab / world", "misheard (voice)", "too slow", "other";
- "What did you want?" (free text, optional, can also be dictated);
- a **"Show me the right result"** option for the tabs that support undo: it undoes the turn, so the user can redo it by hand or say it differently. The next accepted phrasing is linked to the ▼ record as its correction.

**Storage.** Each vote is stored in the phrase log record of that message: `feedback: { vote: 'up'|'down', reasons: [...], wanted: '...', correction: <id of the next accepted message or null>, time }`, plus:
- the turn's readings;
- the chosen SOP Lang wires;
- the world and the state hash before and after, so a reviewer can replay it.

It appears in the history list (a ▲ / ▼ mark), in the filters ("Not what I wanted"), in the Export JSON, and in DBG "Last turns".

**Learning loop** (D5 / `scripts/learn-from-logs.mjs`):
- ▼ records with a `wanted` text or a `correction` become review items with the highest priority;
- ▲ records become self-validated examples (stronger than the margin rule);
- report the counts.

The spoken "that's wrong" / "nu asta am vrut" (spec 11 negative feedback) sets the same ▼ on the last answer and opens the same form.

**Tests:**
- vote, change the vote, ▼ form with reasons and text;
- the record and the export contain it;
- `learn-from-logs` picks it up;
- 0 console errors.

**Copy as text in the phrase log does not work (user): remove it.** Keep **Export JSON** with every detail: the record, readings, wires, timings, feedback and endType. Make sure the export is complete and opens with one click on a phone (share sheet when available, a download otherwise).

### DIAG3 — Diagram: short ids, clear arrows, arrows as first-class objects, and parity with the source (user, 17:06 local)

Data:
- the user's diagram session: `training/eval/real-phrases-2026-11-09d.jsonl` (10 messages);
- the expected behaviour: `training/eval/expectations-2026-11-09d.jsonl` (15 cases, each with today's result).

CLI replay at f41aba5:
- "create a diagram" → "Drew circle2";
- "add to the diagram a tree liek shape" → "Drew circle3" (the source reader gives `template=tree`);
- "label the previous link as label1" and "label link" → "Which shape should I label?";
- "lable arraw between circle1 and rectangle1" → labels both *shapes* "and";
- `label the arraw between circle1 and reactanle1 as "label1"` → labels circle1 "and" (the source reader reads `label the arrow between A and B as "uses"` as `{action: label, from: A, to: B, label: uses}`);
- "make the arrow … thicker" → a vague "Changed the arrow …".

The user is right that we lost function compared with the source.

1. **Short automatic ids, shown subtly.**
   - Every shape gets a short id by kind: c1, c2 (circle), r1 (rectangle / box), s1 (square), d1 (diamond), e1 (ellipse), t1 (triangle), h1 (hexagon), x1 (text). Every edge gets a1, a2.
   - Ids are drawn small and grey at the shape's top-left and the arrow's midpoint, without clutter; a toggle in the tab hides them.
   - A user-given name or label is shown normally, and the id stays as a subtle tag.
   - Old long names (circle1, rectangle1) remain aliases, so data and tests keep working.
   - Every reply uses the ids ("Connected c1 → r1 (a1)").
2. **Arrows are first-class.** Refer to an edge by:
   - its id ("a1");
   - its ends ("the arrow between c1 and r1", "the link from A to B");
   - recency ("the previous / last / that link / arrow / connection / line");
   - its label.
   Every edge operation works on edges: label, recolour, style (solid / dashed / dotted), arrowheads (forward / both / none), thickness (thicker / thinner, one step per "a bit"), reverse, delete, select. Typos in edge words ("arraw", "lable", "conection") are corrected.
3. **Arrow rendering.**
   - An arrowhead must not end flush against, or nearly parallel to, the border line it enters ("too close to the perpendicular line"). Attach edges to the nearest side with a clearance of ≥ 8 px. Enter at an angle of ≥ 30° to the border, or bend the last segment to enter perpendicular.
   - Spread parallel and opposite edges between the same pair.
   - Avoid running along another node's border; keep labels off the line, with a background halo.
   - Test geometry: the minimum entry angle and clearance over all edges of the bench diagrams.
4. **Sizes and layout by voice.**
   - "make c1 a bit bigger / much bigger / the same size as r1";
   - "make the arrows thicker";
   - "change / switch the layout to a row / column / grid / circle / tree / layers / radial";
   - "space them out", "tidy up / untangle".
   Most of these exist in the engine (resize, arrange, respace, untangle, straighten, equalize, fit): make sure our patterns reach every one.
5. **"Create a diagram" and templates.**
   - "create / new diagram" starts a new diagram, asking whether to keep the current one, and offers the 24 templates.
   - "a tree-like shape / an org chart / a flowchart / a cycle / a pyramid / a funnel" build the template, and ask for the items when none are given.
6. **Parity with the source.**
   - Run the source reader (`imports/diagram-vss-demo/engine/logic.js`, `createSystem().formalize`) and ours on every message of `data/test` and `data/bench`.
   - List every act and legend key that the source reads right and we do not, by count. Fix them, the largest groups first, until ours is **≥ the source rules reader** on act and on args.
   - Report the table in RESULTS.md (source rules vs ours: act right, args right, wrong, unread).
7. **Tests:** the 15 expectations as dialogue tests (family `real`) on the Diagram tab, in the CLI and headless webchat with screenshots of the ids and arrows.

### BUSY — tabs are grey and not clickable while a turn runs (user, 17:09 local)

Clicks on the avatar (gallery, presets, parts) run late, after the spoken answer: they queue behind the speech and the effects. The rule from now on:

- **A turn lasts until everything it started has finished:** formalize and run, host effects (tab animations, map fly-to, chess engine move, music start), and the spoken answer when "read aloud" is on.
- **During that time every tab's interactive area is visibly busy:**
  - a light grey veil over the tab content;
  - pointer events off;
  - `aria-busy="true"` and `inert` on the tab panel;
  - a small spinner in the tab header.
  Clicks there do nothing; no silent queue of clicks.
- **The chat input stays usable** for typing and listening. Messages go to the visible queue of MIC2.
- **Stop (and the mute / "be quiet" commands) end the turn at once:** they cut the speech, cancel pending effects with an AbortSignal and lift the veil.
- **Exceptions that stay clickable:** the Stop button, the tab switcher (switching only shows the other tab, which is also veiled), scrolling and zoom/pan of maps and diagrams (view-only actions that change no state), and Settings.
- **One source of truth:** the turn guard's state (`busy` from HANG + STOP) extended with `effectsPending` and `speaking`. Tab plugins call `host.isBusy()` / subscribe to it instead of each having its own flags.
- **Tests (headless):**
  - send a message with read-aloud on (fake `speechSynthesis` taking 2 s), click the avatar gallery during the speech: no state change, the veil is visible;
  - after the speech ends the same click works;
  - Stop during the speech lifts the veil at once;
  - the same for a chess move while the engine thinks;
  - 0 console errors.

### FREEZE-6 — main-thread load during a long voice session (reviewer soak at 2f7cb36, 23:50 local)

**Run:** `scripts/soak-webchat.mjs --minutes 12` (4× throttle, 2-vCPU host), after the speech rewrite landed. **8/10 pass:**
- heap flat (97 → 103 MB);
- workers flat (4);
- 0 watchdog endings, 0 ORT restarts;
- echo 22 ms;
- the second tab never listens, and the first keeps receiving;
- 0 page errors.

**FAIL:** main-thread busy, **70% average, 86% worst minute** (your 30-minute run: 56% / 75%). Over 12 minutes there were 106 user messages: the soak's 67 real messages plus room talk. The UI stays responsive at the end, but a phone at this load heats up, which is what the user felt.
**Update after b4aa31d** (only idle restarts count): the reviewer's 7-minute rerun gives busy 57% on average and 78% in the worst minute (was 70 / 86); everything else passes. Your 3-minute run: 26%. The difference between the hosts is large, so profile on a throttled run that matches the reviewer's (`--throttle 6` on your machine is closer to a 2-vCPU host at 4×).
1. **Profile it.** Record a CPU profile (CDP `Profiler`) for 2 minutes in the middle of a soak and list the top 10 self-time functions with their share.
2. **Fix the biggest causes.** Likely candidates:
   - per-turn rules formalization on the main thread;
   - phrase-log or history re-rendering of the whole list on every message;
   - trace building when the trace is hidden;
   - interim-result DOM updates (throttle them to animation frames);
   - noise-classified talk still running a full turn.
3. **If formalization dominates** (more than 300 ms per turn at 4×), move `DialogSession` into a module worker, the way ORT already runs in one. The UI thread keeps only rendering and speech.
4. **Gate:** soak busy < 50% on average and < 70% in the worst minute, on your machine **and** in the reviewer's 12-minute run.

### MOBILE-VOICE / FREEZE 1–3 / NOISE — review of f15e2da + 5f56daa (23:05 local)

Files match the log.

**Validated:**
- `tests/voice-mobile.test.mjs` 18/18, including the replay of the 108 phone records through the cumulative-final fake recognizer.
- `scripts/test-webchat-voice.mjs --only mobile,persist,twotabs,noise`:
  - at throttle 1: 11/11 for twotabs and noise;
  - at `--throttle 6`: mobile 8/8 (one message per utterance, no queue, mic never live during the turn) and persist 8/8 (handsFree no longer starts the mic, hidden tab, one recognizer).

**At `--throttle 6` (the phone case) 4 of 28 checks fail:**
1. **twotabs:** after "Use it here" in the second tab, **the first tab keeps listening**. That is the cross-tab conflict the user hit. The handover must stop the first tab's recognizer within 2 s at 6×.
2. **noise:**
   - room talk → "0 greyed + 4 fragments of 8, **4 replies**";
   - the phrase log records 0 `ignored`;
   - "tap to send anyway" fails.

   It passes at throttle 1, so the classifier probably relies on the dry run, which is off on slow devices. The noise decision must not depend on the dry run: use `classifyVoice` with the cheap signals (addressee, imperative/question shape, known-command prefix, language) when the dry run is off or late.
3. **The 6× browser replay of the user's phone export is missing.** The `mobile` scenario has one utterance ("draw a heart"). Add a browser scenario that feeds `training/eval/real-phrases-2026-11-09f-mobile.json` through the fake Android cumulative-final recognizer at `--throttle 6`. It must pass:
   - ≤ 1 message per utterance;
   - queue 0;
   - 0 tab switches caused by fragments;
   - the heart and house drawn;
   - 0 page errors.

Still open from FREEZE: 4–5 (cancellable dryRead, ORT budget) and the 30-minute soak test.

### MOBILE-VOICE — on a phone, speech-to-text floods the chat with fragments and repeats (user, 21:36 local) — P0, with FREEZE

**Data.** `training/eval/real-phrases-2026-11-09f-mobile.json` (the export from the user's phone: 108 voice records in 4.5 minutes, with full detail).

**What happened** (the reviewer analysed every record):
- **The recogniser on the phone returns every growing prefix as a separate final result**, and the app sends each one. "desenează o inimioară desenează o inimă" arrived as "desenează", "o", "desenează o", "inimioară", "desenează o inimioară", "o inimioară desenează", "desenează o inimioară desenează o", …
  - 50 of the 108 messages extend or contain the previous one;
  - 45 are a single word ("o", "ce", "de", "asta", "mare", "face", "tata", "mama").
- **Every fragment executed something:**
  - "asta" → the map shows Asia;
  - "o" → "We are not playing hangman";
  - "inima" → a search in the Documents tab;
  - "ia" → music.
  The active tab switched 14 times. Tabs showed busy indicators while nearly everything failed: 56 unparsed, 22 missing, 10 unsupported, 18 supported.
- **The queue grew to 105 s of waiting** (`queueMs` 104926). With turns taking a median of 1.8 s and up to 6.6 s on the phone, the user was talking to a backlog. Room talk ("ce hai ce îl înnebunești de cap săracul…") grew the same way, a prefix at a time.
- Replies mixed languages ("Voila! I drew a red heart." in a Romanian session) and contained literal translations of interjections ("Aspect la că!").

**User decisions (they replace the MIC2 queue):**
1. **Stop listening while a request is processed.**
   - The mic pauses from the moment a message is sent until the turn, its effects and the spoken answer have finished, with a visible "working…" state.
   - Then it resumes automatically.
   - Nothing is accumulated during processing: no queue for voice. Typed text stays in the box and is sent with Enter when the turn ends.
2. **Protection against repetition and speech-to-text going wild:**
   - **One utterance = one message.** Treat a new final that extends, contains or repeats the previous final of the same recognition session as a *replacement* of the pending text, not a new message. Send only at end of turn (EOT2). Reset the recogniser's result list after each send (Android keeps cumulative results).
   - **Duplicate filter.** Drop a voice message equal or nearly equal (normalised edit distance ≤ 0.2) to one sent in the last 10 s, or a prefix or suffix of it.
   - **Fragment filter.** A one-word voice message that is a stop word, an article, a pronoun or a filler ("o", "ce", "de", "asta", "da" outside a yes/no question, "face", "mama", "tata") is ignored, unless it answers an open question (yes / no, a number, a game move on a game tab, a choice) or is a known one-word command ("stop", "undo", "help", "next").
   - **Rate guard.** At most one voice message per 2 s. If more than 4 fragments are dropped in 10 s, pause the mic with "I am hearing fragments — tap the mic to continue".
   - **No action from noise.** A message that is ignored or not understood never switches the tab and never shows busy indicators on the tabs. Only the chat shows "not understood", once, and repeated not-understood voice replies within 20 s are collapsed into one.
3. **Mobile timing.** Measure the turn time on a mid-range Android (or 6× CPU throttle). The always-on dry run (FREEZE item 4) must be off on slow devices: there, voice ends on the browser's final plus the plausibility of the text, without a full rule reading per pause.
4. **Language of replies.** Every reply in a Romanian session is Romanian, including the template interjections ("Voila!", "Look at that!" → "Gata!", "Uite!"). Add the interjections to the phrase table instead of translating them word by word.
5. **Vocabulary.** Diminutives: "inimioară" → inimă (heart), "căsuță", "norișor", "peștișor", "soricel", "floricică", "copăcel". "desenează o inimioară" draws a heart.

**Tests:**
- Replay the 108 records through the fake recogniser in the Android cumulative-final mode, with their timings, at 6× throttle. At most one message per real utterance, 0 queue, no tab switches from fragments, the mic paused during every turn, and the hearts and houses drawn.
- Unit tests for the replacement, duplicate, fragment and rate filters.

### FREEZE — after a long voice session the fan spins, the tab freezes, and other tabs (even incognito) cannot use the mic (user, 21:18 local) — P0

**What the user saw** (session `training/eval/real-phrases-2026-11-09e.jsonl`, 67 voice messages in about 10 minutes, mostly Romanian, with people talking in the room):
- the system worked for a while, then slowed down;
- the CPU fan started and the tab froze;
- other tabs of the demo froze too;
- the mic did not work even in a fresh incognito window;
- the always-on state was remembered between sessions, so every newly opened tab started listening by itself.

**Causes found by reading the code at ce60806.** Confirm each with a measurement and fix all of them.
1. **The always-on mic is persisted** (`settings.handsFree` saved in localStorage). Every new tab of the demo starts continuous recognition on load.
   - Chrome serves speech recognition from one browser-level service. Two tabs with continuous recognition abort each other.
   - In `speech.mjs`, an `aborted` error is not counted as a failure (`lastErr` ignores `no-speech` and `aborted`), and an end after more than 500 ms is not "quick". So two tabs ping-pong forever: each restarts after 150 ms and aborts the other, with no backoff and no give-up.
   - That keeps the browser's audio and speech service busy for all tabs and profiles, incognito included, which matches what the user saw.
   - **Fix:**
     - never persist the listening state; every page load starts with the mic off, and the user's click turns it on;
     - count `aborted` and `audio-capture` as failures, so the backoff applies;
     - use a cross-tab lock (`BroadcastChannel` + `navigator.locks`): only one tab of the demo may listen. A second tab shows "the microphone is in use in another tab — use it here?" and takes over only on a click.
2. **Listening in a hidden tab.** There is no `visibilitychange` / `pagehide` handling. A background tab keeps listening and restarting.
   - **Fix:** pause recognition and speech when the tab is hidden; resume only if it was on and the tab is visible again. Release everything on `pagehide`.
3. **A new `SpeechRecognition` object on every restart** (`rec = new Recognition()`, every 150 ms to 5 s for the whole session).
   - **Fix:** reuse one recognizer per page; remove all handlers from an old one before dropping it; cap restarts at 30 per minute, then pause with a visible reason.
4. **The voice dry run is never cancelled.**
   - `Promise.race([plausible(x), never(dryRunMs)])` stops waiting after 400 ms, but `dryRead` (translation plus full rule reading, synchronous on the main thread) keeps running.
   - With an always-open mic and people talking in the room, every pause starts another one. Romanian noise takes seconds each, so the main thread saturates (fan, frozen tab).
   - **Fix:** make `dryRead` cancellable and bounded (abort signal, leniency off, no translation through the browser API, at most one in flight, a newer interim text cancels the older run), or move it to a worker. Skip the dry run for texts longer than 25 words or with no world vocabulary.
5. **A possible ORT restart spiral under load.** When the CPU is loaded, model calls miss their deadlines, the worker is terminated and its ~160 MB of sessions reload, which loads the CPU further. Check `__psys2Ort.stats.restarts` after the soak test below.
   - **Fix:** a restart budget (at most 2 per 5 minutes, then the models pause and rules answer, shown in Settings › Models); deadlines scaled by measured device speed.

**Soak test (required).** Headless Chrome at 4×, fake recogniser streaming a 30-minute mix: the user's 67 messages with their timings, plus random Romanian and English background talk every few seconds, the mic always on.
- Assert flat memory (heap and worker count), main-thread busy below 50%, 0 watchdog endings, ORT restarts ≤ 2, and a responsive page (an input echo under 100 ms) at the end.
- A second tab opened in the middle must not start listening and must not break the first.
- Record the numbers in RESULTS.md.

### NOISE — an always-open mic must ignore talk that is not for it (same session)

With the mic always on, room talk reached the chat and got "I did not understand" replies: "să mi spună domnul bujii lui tata", "Dar cu cine vorbești ce vrei", "tata ce pot să zic", "unchiul", "voi", "faci tu", "enervant da", "scuze".
- A spoken message with no complete reading, few or no world words, and no direct address is **ignored silently**. It is shown greyed in the queue as "ignored (not a command)", with a tap to send it anyway. The phrase log records `ignored`.
- Typed messages are never ignored.
- Questions to the assistant ("what can I say?", "ce pot să zic?") and messages with a world word go through normally.
- Optional, in Settings › Voice: "Only respond when I say 'PSys2' / 'robotule'".
- Tests: the room-talk lines above → ignored; every real command in the session → executed.

### GAPS-1 — wrong answers seen in the reviewer's run of the 65 gold paraphrases (03:30 local, default hybrid)

Probe: `/home/claude/shot/heads.mjs`, real Chrome. Each phrase was sent on its own tab, clicked first. The model read 3 phrases correctly (see the Validated note). These are rules answers that are **confidently wrong**, worse than "not understood":
1. Tic-tac-toe tab: "best move for me?" → "How about pawn to e4? I drew an arrow on the board." (a **chess** hint on the tic-tac-toe tab). Tic-tac-toe questions on its tab must stay in games.tictactoe; the hint must answer for the active game.
2. Avatar tab: "I should tell you, today is Friday" → "Done! I added tell you and today is friday to your to-do list."
3. Avatar tab: "would you say you are happy" → "I took that as: "happy say" I don't know what sound a happy makes."
4. Avatar tab: "whats on u" → "I am playing "Happy Birthday to You" on the piano…" (the gold reading is what the avatar wears).
5. Avatar tab: "I want a puzzle and I pay 10 lei. What is the change?" → "I did not understand "I want a puzzle"" (kids.shop change).
6. Not understood although close to a known pattern: "what are tic tac toe's rules", "which one of us goes first", "can u suggest where i play" (on a fresh game), "how is a circle different from other shapes".

Fix 1 and 2 first: they act wrongly. For 2–4, prefer "not understood" or a question back over a wrong action when the reading ignores most of the sentence. Add these as dialogue cases.

### RP5c — small leftovers after 6377c61 (reviewer probe, 01:10 local)

RP5b is validated: `/home/claude/shot/rp5.mjs` and `rp5b.mjs` in real Chrome, Romanian session, default settings, 0 errors. All of these now give a Romanian reply:
- the tab names (desen, diagramă, x și zero, avatar);
- the cartoon and kid descriptions;
- the game start, the missing-place prompt;
- "în apă" (with water added);
- "o gură grătar", "Ești deja pe fila Avatar";
- "desenează trei cercuri în diagramă" → "Am desenat c1, c2 și c3.";
- a click on the Diagram tab, then "desenează trei cercuri" → diagram c1..c3.

Left:
**Update 02:15 (after 7f6f716):** items 2 and 3 are validated. **Item 1 still reproduces in the reviewer's session, but not on a fresh page.** It needs the earlier Drawing turns as context (recent world art.draw). Exact repro, Romanian, default settings, one session, in this order:
- deschide tabul avatar, fii bucuros, fii nervos, încearcă gura următoare, fii un carton, fiind copil, Fă o gură mare, fa ochi visatori;
- deschide tabul x și zero, pornește x și zero, joc a unu;
- deschide tabul desen, desenează un sare, desenează o maimuță, desenează liniuță, desenează un pește mic și albastru, mută peștele în apă, mută peștele, șterge peștii, Șterge toate cercurile roșii;
- **deschide tabul diagramă** → "Bine, iată fila Diagramă.";
- **desenează trei cercuri** → [Drawing] "Frumos! Am desenat 3 cercuri roșii."

The script is `/home/claude/shot/rp5.mjs` (`openChat`, `settings: { language: 'ro' }`). The likely cause: with art.draw as the recent world, the dispatcher's reading wins over tier T, or `activeTab` is not updated when the tab changes through the open-tab operation after many turns. Add this whole sequence as a browser row.
1. **A tab opened by a command does not count as the active tab for tier T.** In the same session: "deschide tabul diagramă" → "Bine, iată fila Diagramă." (the Diagram tab is shown), then "desenează trei cercuri" → art.draw "Am desenat 3 cercuri roșii" and the tab **switches to Drawing**. With a click instead of the command it works. The `ui.shell` open-tab operation must set `activeTab` exactly like `userTab`. Add this order to `scripts/test-webchat-ro-rp5.mjs` (open by command, then draw).
2. "deschide tabul desen" while already on Drawing → "OK, aici este desenul tablă." It should be "Ești deja pe fila Desen." (the same phrase family as Avatar; the "already here" reply of art.draw is missing from the phrase table).
3. Minor: "Nu pot găsi cerc roșu în tabloul tău." for "toate cercurile roșii" should use the plural ("Nu găsesc cercuri roșii în desen."). And "Fă o gură mare" could take the widest smile instead of refusing (you noted it).

### RP5 — Romanian voice failures from the same session

Expected behaviour per case: `training/eval/expectations-2026-11-09e.jsonl` (21 cases). The main groups, as general fixes:
- **Expressions:** "fii bucuros / vesel / trist / nervos / supărat / speriat / surprins" → the avatar's expression.
- **Voice inflections:** "becoming emoji", "fiind copil" → become / be.
- **Tic-tac-toe:** "x și zero" names it.
- **Drawing:**
  - "un sare" → soare (sound-alike on the Drawing tab);
  - "un pește mic și albastru" (post-nominal coordinated adjectives);
  - "mută peștele în apă" and its variants, plus "mută peștele" asking where;
  - "desenează liniuță";
  - "desenează o maimuță" → draw it or list the animals it can draw.
- **Untranslated text.** The translation sometimes returns the Romanian text unchanged ("șterge peștii", "Fă o gură mare", "faci un robot pește" → status unknown). The rules translator must cover the app's own verbs and nouns, and an unchanged output must be retried through the rules translator.
- **Diagram tab:** "desenează trei cercuri (în diagramă)" goes to art.draw. Tier T must apply after translation, and the words "diagramă" / "diagram" name the world.

### TEST-SPLIT — two test suites: a fast mandatory one and a full one a few times a day (user, 18:53 local; reviewer measurement)

**Measured** on the reviewer's run at c0c4cf8: 1,002 tests, 1,226 s of test time in total. **Ten exhaustive sweeps take about 950 s (77%).**

| s | file | test |
| --- | --- | --- |
| 185 | dialog.test.mjs | CLI: `test-world all` passes (runs every world's tests.sop) |
| 169 | tools.test.mjs | every pattern example of a tool world is understood |
| 165 | (generated per world) | world kids.shop / kids.arith / kids.time …: every pattern example is read by its own pattern without ambiguity |
| 155 | datagen.test.mjs | datagen agreement with the rule formalizer and export consistency |
| 65 | translate-equivalence.test.mjs | Romanian twins formalize to the same wires |
| 43 | matcher-prefilter.test.mjs | prefilter fuzz over all pattern examples |
| 38 | canonical-examples.test.mjs | every canonical example on its own tab |
| 37 + 30 | translate-session / ro-sessions | Romanian reply quality over the Romanian set |
| 29 | tools.test.mjs | expectState / expectEffect runner |

There is also **duplication**:
- `test-world all` (dialog.test) runs every world's tests.sop;
- the per-world files (draw, music, map, charts, chess, kids.*, editor, avatar …) run the same world tests again, about 120 s;
- your gates then run `test-world all` a third time.

Do this:
1. **`npm test` = the fast mandatory suite.** Target ≤ 90 s on your machine with 4 jobs.
   - Every unit and behaviour test stays.
   - The exhaustive sweeps run on a **deterministic sample**: about 10% of the pattern examples / sets, with a seed that changes daily (`PSYS2_SAMPLE_SEED`, default the date). Each day covers a different slice, and a failure is reproducible with the printed seed.
   - Exception: the worlds touched by the diff against `origin/main` (worlds, lexicons, patterns, ops) run their sweeps in full (`--changed`).
2. **`npm run test:full` = everything.**
   - all sweeps in full;
   - `test-world all` once;
   - the datagen agreement;
   - the Romanian equivalence and reply-quality sets;
   - the fuzz tests;
   - **the browser tests** (`webchat-turns`, `webchat-voice`, `webchat-ui`, `webchat-phrase-export`, with puppeteer-core).

   Run it 2–3 times a day, always before a model publication or a READY FOR REVIEW, and after merging a batch of agents. Write the result in the log.
3. **`npm run test:browser`** for the browser tests alone. Required before any push that touches `docs/webchat/` (see BUSY-LOST).
4. **Remove the duplication.**
   - The per-world "loads and its tests pass" tests and `test-world all` must not both run the same tests.sop in one suite: keep the per-world files in the fast suite (sampled where large) and `test-world all` only in full.
   - Drop `test-world all` from your gate list when `npm test` already covers it.
5. **Mechanics.** Mark full-only tests with a file suffix (`*.full.test.mjs`) or a `{ full: true }` helper that `run-tests.mjs` reads. `run-tests.mjs` gets `--full`, `--changed`, `--browser` and prints the suite name, the sample seed and the wall time.
6. **Report.**
   - wall time of each suite on your machine (4 jobs) and on 2 cores;
   - proof that the full suite still contains every test of today (count before = count after).

### BUSY-LOST — the BUSY code is not on main (reviewer at 79c5ba7, 18:30 local) — fix now

Your worker-log "BUSY" describes changes in `docs/webchat/app.mjs` (`updateBusy()`, `host.isBusy()` / `host.onBusy`, the `.is-busy` / `aria-busy` / `inert` toggling, Stop cutting the speech, `TURN_LIMITS`). **Commit e19aaa6 contains only `style.css`, `scripts/test-webchat-turns.mjs`, the spec and the log.** On main, `app.mjs` has no `updateBusy` or `onBusy`.
- In real Chrome at 4×, during a turn, no panel gets `.is-busy`, `aria-busy` or `inert`; the veil never shows.
- The JS was probably lost in a merge or rebase from the agent worktree.

Recover it from the worktree branch and land it. Also:
- **Browser tests in the gates.** The browser tests (`webchat-turns`, `webchat-voice`, `webchat-ui`, `webchat-phrase-export`) are skipped in `npm test` without `PUPPETEER_CORE`, which is how this went unnoticed. Run them in your gate before every push (`PUPPETEER_CORE=... npm test`), and write the count in the log entry.
- **Merge check.** After every merge from an agent worktree, `git diff --stat <agent-branch> main -- <files the log names>` must be empty for the files the log says were changed.

### HANG3 — the browser translator stalls Romanian turns (reviewer at cbdca37, 17:58 local) — small, do first

HANG2 is fixed: the user's session ("get me to New Youk" after the drawings) now answers in 1–3 s, rules mode makes no ORT calls, and the detached-buffer root cause is gone.

The remaining 8 s endings are **stage `translate`**. Measured on a desktop Chrome that has the `Translator` / `LanguageDetector` APIs but **no downloaded on-device model**:
- "fa ochi visatori", default settings → 8.0 s watchdog (phrase log `stage: translate`);
- with `translation: auto` → 5.3 s;
- with `translation: rules` → 1.6 s;
- "fa-i ochii mari" → 112 ms with rules translation.

Your own run found one more such ending ("repede: cate zile are iunie?").

Fix:
- The browser translation and language-detection APIs are used **only when `availability()` is `available`**. For `downloadable` / `downloading`, start the download in the background (once, never awaited by a turn) and use the rules translator and detector meanwhile.
- When the browser API is available, give it a per-call deadline of 400 ms, then fall back to rules. Cache `create()` once per language pair.
- Show the state in Settings › Language ("Browser translator: downloading… rules are used meanwhile").
- **Test:** a fake `Translator` whose `create()` never resolves, and one with `availability: 'downloadable'`. A Romanian turn answers in under 2 s with the rules translator, and 0 watchdog endings over the Romanian set sample.

### HANG2 — the model worker stops answering; the watchdog hides it (reviewer at 1375718, 15:50 local) — P0, DO FIRST

The HANG + STOP work is good: the Stop button, one message at a time, the 8 s watchdog and 918/921 tests passing (3 skipped). The chat no longer freezes forever. **But the turns that froze still do not get answered: they now end at 8 s with "That took too long, so I stopped."** That also happens **without throttling, on a fast machine**, and it repeats on every try. So the user will still see it all the time.

Reproduction (headless Chrome, default settings or `formalizer: rules`, `languageDetection: rules`, `translation: rules`; throttle 1× or 4×; the models load from localhost in 7 s):
- after "make it liek a girl" / "make a house and a man" / "draw a some clouds and 2 suns" / "show Bern city", **"get me to New Youk" → 8.0 s timeout, twice in a row**; on a fresh page the same message takes 4.4 s, then 1.2 s;
- **"fa ochi visatori" → 8.0 s timeout, three times in a row**, on a fresh page with the models loaded;
- **"fa-i ochii mari" → 8.0 s timeout**;
- "hello" right after works in 66 ms (rules fast path, no model).

What the phrase log says:
- the timed-out records carry **`stage: "ort"`** (rules mode) and **`stage: "encoder"`** (default mode);
- the turn is waiting on the onnxruntime proxy worker;
- the main thread is idle;
- no worker console errors.

Likely mechanism, to check:
- One ORT call never returns. Candidates: a normalizer decode with no step cap or no EOS, an encoder run on an input the worker rejects silently, or a deadlock between two runs in the single proxy worker.
- Every later ORT call then queues behind it.
- The watchdog abort ends the turn but not the worker's job, so the queue never clears.
- Also, `formalizer: rules` still calls ORT. Rules mode must never touch the models.

Fix:
1. **Find the stuck call.** Log every ORT request and response in the worker with an id and a time; add a test that replays these three messages.
2. **Cap every model call.** Normalizer: max decode steps (input length × 1.5 + 8) and a per-call deadline. Encoder: a per-call deadline.
3. **Recover the worker.** On timeout or abort, cancel the job in the worker. If it does not stop within 300 ms, terminate and re-create the ORT worker (sessions reload from the Cache API), so the next turn works.
4. **Rules mode makes zero ORT calls.** Assert it in a test.
5. **No turn may end in the watchdog answer for any message in the operational, Romanian, real-dialogue and fuzz sets** (browser, models loaded, 1× and 4×). Report the count of watchdog endings; the target is 0.

### DIAG2 — the Diagram world works in the CLI but not in the webchat (reviewer at c0c4cf8, 16:46 local)

**CLI** (Diagram tab opened): every probe is right.
- "draw a blue rectangle called Api and a green circle called Db" → "Drew Api and Db";
- connect with a dashed arrow → right;
- "what is connected to Db?" → "Api connects to Db";
- "make a process diagram with Plan, Build, Test, Ship" → right.

**Webchat, default settings, Diagram tab open, the same messages:**
- the create went to art.draw: "I did not understand where to put it ("called api")";
- connect → "A connection needs two ends" (no shapes exist);
- "what is connected to Db?" → "Which shape should I inspect?";
- the process diagram → the 8 s watchdog (HANG2).

Cause: the dispatcher does not know `diagram.sketch` (your log says so). Its candidates win over the rules' complete reading in the active tab's world.

Fix:
1. **The active tab's world wins whenever the rules read the whole message completely in that world,** whatever the dispatcher proposes. Generalise it as an ADR-004 tier, with tests for every tab. This also protects the next new world.
2. **Retrain and publish the dispatcher with `diagram.sketch`.**
   - Use `training/diagram/train.jsonl` plus `segments-train.jsonl` and the full rebuilt dataset.
   - The compute rule does not block this: the user asked for the world, and a world the shipped model cannot route is not shipped.
   - Report the usual sets before / after; wrong must not rise elsewhere.
3. **Raise the source test set** (`data/test`, act right 68.6%, unread 18.6%). Read the unread clauses: most have no cue word. Add patterns and shapes for the frequent forms, and report again.
4. A webchat headless test of the five probes above on the Diagram tab, with a screenshot of the drawn diagram.

**Also from the RD10 check (CLI):** after "lets play tic tac toe" and two avatar commands, "B1" answers "B1 looks like a game move. Do you want to play tic-tac-toe or chess?" although a tic-tac-toe game is running. A running game must take bare coordinates even when another world spoke last.

### HANG + STOP — the chat stays "thinking" forever (user report 10:14 local, reproduced by the reviewer at 4e75163) — P0, DO FIRST

**User session** (webchat; save it as `training/eval/real-dialogue-2026-11-09b.txt` and add it to `dialogues.jsonl` with the right tabs):
```
make it liek a girl
make a house and a man
draw a some clouds and 2 suns
show Bern city
get me to New Youk
get me to New York'
lets visit New York
B1
start game tic tac toe
B2
C2
change vatar to a man
change avatar to a man
transfrom the avatar to a man
```

**Reproduction.** Headless Chrome, 390×844, 4× CPU throttle, settings `formalizer: rules` (it also happens with encoder). Send the first five lines in order. "get me to New Youk" never gets an answer: "thinking… 450 s" and counting.
- Every later message queues behind it, so the chat is dead until reload.
- Without throttling the same message answers in about 1 s ("I did not understand"). In Node rules mode it answers in 218 ms.
- During the hang the **main thread is idle**: a CPU profile shows 2.9 s idle out of 4 s, and script time is 10 ms. So it is a promise that never settles, not a loop.
- It is not geolocation: granting the permission changes nothing. There are no console errors and no page errors.
- Strong suspect: the interpreter's time budget (`opTimeoutMs`, `BudgetError` in `src/interpreter/index.mjs`) fires only on a slow CPU. Somewhere on the path that raises it (host effect, observation loop, best effort, tab apply), a promise is left unresolved instead of rejecting to the caller. Find it with per-stage logs, fix the root cause, and add the reproduction as a headless test with 4× throttle.

**Make the chat robust whatever the cause (user request):**
1. **A Stop button.** While a message is being processed, the Send button turns into Stop (■). Stop cancels the turn through an `AbortSignal` passed down the whole pipeline: dispatcher, normalizer, rules, interpreter, effects. It answers "Stopped." and leaves the session state as it was before the message (undo snapshot). The phrase log records the message as stopped.
2. **One message at a time.** While a turn runs, the input stays editable but Send and Enter are disabled; voice input waits. Show "wait for the answer or press Stop" on Enter. No silent queue behind a stuck turn.
3. **A watchdog.** Every turn has a hard limit: 8 s at most, measured from Enter. When it trips, the turn is aborted as with Stop and the user gets a useful answer: the best reading found so far, or "That took too long, so I stopped. Try a shorter request." The watchdog also logs the stage it was in to the trace and the phrase log, so we see such cases in real use.
4. **Tests:**
   - the reproduction above answers in ≤ 8 s at 4× throttle;
   - Stop during a slow turn restores state;
   - Enter during a turn sends nothing;
   - 200 random messages from all sets at 4× throttle → no turn without an answer.

### RD10 — spell checking and "what each world can do" are still weak (user, 10:14; reviewer probes at 4e75163)

The same session shows wrong worlds and missed corrections. Treat each item as a general mechanism with tests across worlds.

**Place names are not corrected at all** (CLI and webchat):
- "show Pariss", "show New Youk", "get me to New Youk" → not understood.
- Proper names from lexicons (the gazetteer, people's names, animal names, songs, documents) must be in the correction vocabulary. Use fuzzy matching on the whole value, multi-word included: Pariss → Paris, New Youk → New York, Bucuresti → Bucharest. Prefer the active world's values.
- Apply the RD1b safety rule: never move away from a value that already exists.

**Natural wrappers around values:**
- "show Bern city" and "show the city of Bern" → not understood, while "show Bern" works.
- Accept the common wrappers around a lexicon value in the world's request shapes or `lang.common`: "X city", "the city of X", "the town of X", "X country", "the X song", "the document X".

**A world claims a sentence only if it can actually do it (capability check before claiming):**
- On the Tic-tac-toe tab, "change avatar to a man" and "change vatar to a man" answer "I could not find "avatar" in the document". docs.editor's "change X to Y" grabbed it although there is no "avatar" in the document, and the user named the avatar.
- Before a reading wins, the world's precondition must hold: the object exists, the value is known, the game is running. Otherwise the reading drops and the next candidate is tried: the named world (RD2), then the active tab, then the dispatcher's candidates.
- "change X to Y" belongs to the editor only when X is in the document or the Editor tab is open.
- Correct "vatar" → avatar, with world names and tab names in the vocabulary with high priority.

**Bare game coordinates with no game running:**
- "B1" on the Map tab → "I did not understand". It should offer: "B1 looks like a game move. Do you want to play tic-tac-toe or chess?" With yes, start the game and play B1.

**Reports:**
- recovered / misled on a new typo set of proper names, at least 300 lines from the gazetteer and other lexicons;
- the two real dialogues turn by turn;
- the operational and dialogue sets (wrong must not rise).

### LIC — the project is now AGPL-3.0-only (user decision 14:10 local; the reviewer changed LICENSE, package.json, AGENTS.md, README and the vendor LICENSES notes)

Small task, do it with HANG + STOP:
- Add a discreet "Source code (AGPL-3.0)" link to the webchat: in Settings › About and in the page footer, pointing to https://github.com/ml-circuits-research/psys2. AGPL section 13 asks that network users can get the source.
- Write `SPDX-License-Identifier: AGPL-3.0-only` in the header of the files you touch. Do not rewrite every file just for this.
- From now on, vendored libraries must be compatible with AGPL-3.0 (AGENTS.md lists the accepted licences).

### SET — Settings as a full-screen modal with one tab per topic (user, 14:53 local)

Today the settings open as one long panel with everything mixed (app.mjs `renderSettings`). Make them a **full-screen modal dialog**:
- a header with the title "Settings" and an **× close button on the right**;
- **a row of tabs, one per topic**; horizontally scrollable on a phone;
- closes with ×, Esc and the phone's back button (push a history state while open);
- keeps focus inside while open and returns it to the gear button on close (`role="dialog"`, `aria-modal`, tabs with `role="tablist"`);
- remembers the last tab;
- supports deep links (`#settings/voice`);
- changes apply at once, as now.

Tabs (move every existing control; drop nothing):
1. **Understanding** — formalizer; accept refused parses; spellcheck; fast path; partial understanding; best effort with loose words.
2. **Language** — language; translation; language detection.
3. **Voice** — speech language; voice; speech rate; hands-free mode; read answers aloud.
4. **Phrase log** — keep a log; include button presses; filter; the list; export JSONL; copy as text; clear.
5. **Models** — the status of the dispatcher and the normalizer (version, size, loaded / not loaded / loads when needed; see decision (f)); a button to load or remove them; the cache size.
6. **Developer** — show the trace of every answer; the per-stage timing overlay; build info.
7. **About** — version and build; licence AGPL-3.0 with the source link (task LIC); credits of the vendored libraries and models with their licences (from the vendor `LICENSES.md` files).

Voice and text commands (ui.shell):
- "open settings", "open the voice settings", "show the phrase log" open the modal on the right tab;
- "close settings" closes it.

Tests (headless, 390×844 and 1280×800):
- open and close with ×, Esc and back;
- every tab renders its controls;
- every setting still saves and takes effect;
- deep link;
- 0 console errors;
- screenshots of each tab for the reviewer.

### VOICE — natural end of turn for spoken messages (user, 14:57 local: in Romanian the message was never sent)

**Why it fails today** (`docs/webchat/ui/speech.mjs`, reviewer reading at 06d226d):
- A spoken message is sent only when the browser marks a result `isFinal`. The app has no end-of-turn logic of its own.
- In hands-free mode (`continuous = true`), and often for `ro-RO`, Chrome's recogniser keeps the result interim for a long time or never finalises it. The text then stays in "Listening: …" and is never sent.
- Stopping the mic does not send the interim text either.
- `rec.lang` is fixed when listening starts, from the language setting. Romanian speech with the dropdown on English is recognised as English.

**What to build** (one module, same behaviour for every language):
1. **Own end-of-turn detector on the interim text.** On every interim update, restart a pause timer. When the text has not changed for the pause, decide:
   - **Plausible complete sentence → send after a short pause (≈ 700 ms).** Plausible means the rules (dry run: formalize + validate, no execution, no effects) find a *complete* reading of the whole text (the G1 hierarchy), and the text does not end in a connector or a preposition ("and", "then", "to", "with", "și", "apoi", "la", "cu", "pe"…).
   - **Not plausible yet → wait longer (≈ 1.8 s), then send anyway.** Hands-free: ≈ 2.5 s. The user may still be thinking.
   - **The browser's `isFinal` → send at once.** Deduplicate it with the timer path, so one utterance is never sent twice.
   - **Stopping the mic → send what was heard.** If no final result arrives within 300 ms, send the interim text.
2. **Visible and cancellable.**
   - Show the interim text in the input field, with a small countdown ring on the mic while a send is pending.
   - Typing, tapping the field, or saying "stop" / "cancel" / "anulează" keeps the text for editing instead of sending it.
   - Respect HANG/STOP: while a turn runs, the spoken text waits in the field and is sent when the turn ends.
3. **Recognition language follows the session.**
   - A new "Speech language: automatic" option, the default, switches `rec.lang` to `ro-RO` when the session language turns Romanian (RD5 detection), and back to English.
   - Restart the recogniser on a switch. The explicit choices stay available.
4. **Hands-free comfort.**
   - Keep pausing recognition while the answer is read aloud.
   - Resume right after it, with no 350 ms dead zone when the answer ends a question ("Say yes to …").
5. **Phrase log.** Record for each spoken message how its turn ended: `final` / `pause-plausible` / `pause-timeout` / `mic-stop`, plus the wait in ms. This lets us tune the pauses on real use.
6. **Tests.** A fake `SpeechRecognition` in headless Chrome that streams interim events with timings:
   - an English and a Romanian plausible sentence are sent after the short pause;
   - "draw a red house and" waits for the rest;
   - a never-final stream is still sent;
   - stopping the mic sends;
   - "cancel" keeps the text;
   - no double sends;
   - the language switches to `ro-RO` after Romanian input.

### UI1 — one microphone, one "read aloud" button, tooltips everywhere (user, 15:07 local)

The user finds the controls confusing:
- "Why does the document editor have its own microphone? There should be one, the chat's: I dictate there and it does everything."
- "The speaker and headphones icons next to Settings have no tooltip. What do they do?"
- "Microphones and buttons everywhere: here it closes, there it opens."

Today (06f1a59):
- `micBtn` sits in the input bar;
- `speakerBtn` ("Read answers aloud") and `handsBtn` ("Hands-free mode") sit in the header next to the gear, with an `aria-label` but no `title`;
- the editor toolbar has its own "Dictate" button with a mic icon (`ui/tabs/editor/toolbar.mjs`, `dictation`).

Fix:
1. **The input bar holds the only voice controls**, at its left corner: **one mic button** and **one "read answers aloud" toggle** next to it.
   - Hands-free (continuous listening) becomes a mode of the same mic: long-press, or a small "keep listening" switch in the mic's popover, plus Settings › Voice. It is not a separate header icon.
   - Remove `speakerBtn` and `handsBtn` from the header. The header keeps the title, the language selector and the gear.
2. **No microphone inside tabs.**
   - Remove the editor toolbar's "Dictate" button. Dictation is a mode of the chat mic: say or type "start dictation" (as now), and while it is on, the mic and the input bar show a clear "Dictating into: <document>" state with a Stop control.
   - Check every other tab for duplicated voice or send controls and remove them.
3. **Every icon button has a tooltip** (`title`) and the same text as `aria-label`, saying what it does and what state it is in ("Read answers aloud: on"). Add a test that fails on any button without one.
4. **One place opens and closes each thing.** Settings open only from the gear (and voice commands). Panels close with their own × (SET). No second toggle elsewhere.
5. Screenshots at 390 and 1280 px of the header, the input bar, and the editor in dictation, for the reviewer.

### ED — the document editor barely obeys text or voice (user, 15:09 local; reviewer probes in the CLI at 06f1a59)

"Dictation or typing to command the editor does not really work, not even a new line to start a new chapter." The reviewer's probe:

| message | result |
| --- | --- |
| "new line", "new paragraph" (not dictating) | not understood |
| "add a new chapter called The Forest", "start a new chapter" | not understood (suggests "Create a new document …" or "Start a new melody") |
| "write Once upon a time there was a fox" | not understood ("Did you mean: Where is the white queen?") |
| "insert a new line after the title" | added a paragraph of 3 words: it wrote the words instead of a line break |
| "write a title My Story", then "read the document" | reads only "Untitled document": the title heading and the document title disagree |
| "new line" while dictating | empty reply |
| works | "add a heading Chapter 2", "start dictation" / free text / "stop dictation", "undo" |

Fix, as general editor capabilities with request shapes and tests:
- **Structure:**
  - new line, new paragraph, page break;
  - new chapter / section / heading (with or without a title: "start a new chapter called X", "chapter 3: X", "add a subheading");
  - list items ("add a bullet: milk", "numbered list");
  - "under / after / before the title / chapter 2 / the second paragraph".
- **Writing:**
  - "write …", "type …", "add the text …", "continue with …";
  - quotes and long free text without truncation;
  - in dictation, "new line" / "new paragraph" / "new chapter" / "rând nou" / "paragraf nou" work as commands with a short confirmation.
- **Editing:**
  - bold, italic, underline on the last sentence, word, paragraph or selection;
  - "change X to Y" only when X is in the document (RD10);
  - delete the last word / sentence / paragraph; move a paragraph up or down;
  - "rename the document to …"; the first heading sets the title when the document is untitled.
- **Reading:** "read the document / chapter 2 / the last paragraph" reads the content, not just the title.
- **Romanian:** the same commands in Romanian.
- **Tests:**
  - an editor dialogue set of at least 60 turns, covering a short story with chapters written by voice and by typing, plus edits;
  - every probe above;
  - the editor family in the operational set.

### DOC — say what PSys2 really is: neurosymbolic, in the browser (user, 15:09 local)

The greeting undersells the system and is now wrong. The user: "say it is a neurosymbolic model that works purely in the browser; let's be more impressive than 'explicit rules'; we do not only have explicit rules, it is more complicated."

Today's texts:
- greeting (`app.mjs:658`): "Hi, I am PSys2. I answer with explicit rules and small knowledge worlds, with no language model.";
- header (`app.mjs:102`): "no LLM · runs in your browser";
- `<title>` and meta description in `docs/webchat/index.html`.

Rewrite them; proposed wording, keep it accurate:
- **greeting:** "Hi, I am PSys2, a neurosymbolic assistant that runs entirely in your browser. Small neural models split what you say and propose meanings; symbolic worlds check every meaning against formal rules before anything happens, so I do what I understood and tell you what I did not. Talk to me or type. Try one of these:";
- **header:** "neurosymbolic · runs in your browser";
- **title / meta:** "PSys2: a neurosymbolic assistant that runs in your browser, with no server and no large language model".

Then improve the documentation where users and visitors look:
- **README top section.** What PSys2 is, in five lines. The architecture in one diagram:
  - the dispatcher (DistilBERT) cuts messages and proposes worlds;
  - the normalizer (FLAN-T5 small) rewrites only when it helps and is always validated;
  - the SOP Lang formal layer and the rule formalizer, with spell checking, best effort and the discourse layer;
  - the value checker;
  - the interpreter;
  - worlds and tabs.
  Plus what runs where (all in the browser, about 64 MB of models, cached), the headline numbers from RESULTS.md, the licence and a demo link.
- **An "About PSys2" page in the webchat** (Settings › About, SET): the same, plus what "neurosymbolic" means here, why the symbolic layer makes it safe (nothing runs unless a world validates it), the live model versions and the measured accuracy.
- **Help** ("what are you?", "how do you work?", "are you an AI?", "do you use ChatGPT?" in ui.help): short, accurate answers in the same spirit.
- **Wording rules:**
  - say "neurosymbolic", "small neural models", "formal rules / symbolic worlds";
  - never claim more than we have (no "understands everything");
  - say clearly that there is no server and no large language model.
- **specs/README.md and `docs/index.html`:** align the wording.

### DIAG — a Diagram world and tab, imported from diagram-vss-demo (user, 13:40 local)

The user wants a world and a tab for drawing diagrams, built from everything reusable in
https://github.com/ml-circuits-research/diagram-vss-demo: its data, texts, rules and examples. **Do not take its fine-tuned BERT or its VSS models;** our dispatcher reads this world like any other.

The reviewer copied what is reusable into **`imports/diagram-vss-demo/`** (staging, not loaded; commit 0514456). Read its `README.md` and `PROVENANCE.md` first. It holds:
- the source engine, unchanged (`engine/logic.js` + layout, templates, help answers, clarify, spell; runs in Node with `require('./engine/logic.js').createSystem()`);
- the SVG renderer for reference (`engine/ui.js`);
- 49,746 labelled training messages and 4,374 labelled test messages with exact spans and args;
- the bench sets, the example sessions, the labelling specs and the scorers;
- drafts in our format: `world.sop`, `legend.sop`, `lexicon.sop` (27 lexicons from the 46 legend questions), `operations.sop` (32 actions, 18 question kinds) and `legend.json`.

**Steps:**
1. **World `worlds/diagram.sketch/`.**
   - Start from `world-draft/`.
   - **`ops.mjs` wraps the source engine** instead of rewriting it. Each operation builds the SOP node `{type, args}`, runs `engine.execute`, and turns its reply, `Clarify` or `SOPError` into our reply, clarification or refusal.
   - The world state is the engine's `DiagramWorld` state.
   - Convert the engine to an ES module only as far as our bundler needs: browser-safe, no `require`.
   - Keep the file headers and provenance.
   - Map `$new` and `mention(...)` to our discourse referents.
2. **Patterns.**
   - Write `core.shape` declarations and patterns from the legend cue words and from the source rules reader (`makeFormalizer` in `logic.js`, its cue keys and normalizer).
   - Use the most frequent short spans per act in `data/train` as `example=` / canonical sentences.
   - Use L-library macros, no inline common phrasing.
3. **Tests.**
   - `tests.sop` from `data/bench/*.json` (gold args → expected request args and state), at least 5 per action and per ask.
   - The example sessions as dialogue tests.
4. **Diagram tab.**
   - Port the SVG drawing of shapes, edges, labels, groups and zones from `engine/ui.js` into `docs/webchat/ui/tabs/diagram.mjs`.
   - Pan or zoom when the diagram grows past one cell; export SVG/PNG like the drawing tab.
   - Tab follow, help examples (canonical only), SURPRISE pool entries.
5. **Data and the dispatcher.**
   - Convert `data/train` to our training format as `README.md` "Conversion of the data" says: one message = one example, the wire spans give the segments, the world is `diagram.sketch`, each wire gives a canonical request.
   - Retrain the dispatcher with this world included (all data, by the data principle).
   - Keep `data/test` and `data/bench` as this world's first measurement before training on them.
6. **Routing.**
   - "draw a rectangle called Api" goes to diagram.sketch on the Diagram tab, and to art.draw on the Drawing tab, unless the message has clear diagram signals: named shapes, arrows between names, flowchart / org chart / layout words.
   - Add those cases to the routing tests.
7. **Measure and report in RESULTS.md:**
   - the source test set (`data/test`) scored with the `reference/bench-canon.js` logic: right act, right args, extras, wrong;
   - the bench sets;
   - the operational and dialogue sets before / after (wrong must not rise in the other worlds);
   - PERF (load the diagram engine lazily, when the tab opens or the world is first chosen; the page must not get slower).

**Licence:** settled. The project is now AGPL-3.0-only, the same as the source (user decision 14:10); keep the copied files' provenance headers.

**Order from now on:**
1. MOBILE-VOICE (pause the mic while processing, one utterance = one message, duplicate / fragment / rate filters, no tab switching from noise) + FREEZE (mic persistence, cross-tab ping-pong, hidden tabs, dry-run CPU, ORT restart spiral; 30-minute soak test) + NOISE, then BUSY-LOST (land the missing app.mjs part), HANG3 (browser translator off the critical path), MIC2 + EOT2 + BUSY (always-open mic, queue, reliable button, end of turn, tabs grey while a turn runs), then DIAG2 + DIAG3 (Diagram world in the webchat, retrain, short ids, edges, rendering, parity), FB (thumbs up / down + feedback, remove Copy as text), then RP3 (phrase-log failures), then DBG (debug view per tab)
2. SET (settings modal with tabs) + UI1 (one mic, tooltips) + DOC (greeting and docs), then VOICE (end of turn)
3. ED (document editor commands)
4. RD10 together with RD1b and RD2 (they share the mechanism)
5. DIAG
6. RD5, RD9
7. PERF round 3
8. SURPRISE, AV, ASTRA

### Final review of "READY FOR REVIEW" (744c3d5) — reviewer, 2026-11-09 09:20 UTC.

**What I reran and what matched.**
- `npm test`: 885 tests, 884 pass, 0 fail, 1 skipped.
- Operational set, rules mode: 95.4% right / 0.5% wrong (1183 / 6 of 1240). Matches RESULTS.md.
- Dialogue set, rules mode: 96.4% of turns / 88.0% of dialogues (1890 / 1961 turns, 359 / 408 dialogues). You report 96.6 / 87.7; the small gap is 4 turns. Rerun it and record the exact command and hash so the numbers agree.
- Encoder modes in Node: not rerun. onnxruntime-node cannot install here because its post-install download is blocked. In the browser, dispatcher v4 (6c41eb24) loads in headless Chrome with 0 console errors, so the published models load.
- Real dialogue replayed in the CLI and the webchat; results below.

**PERF: your explanation stands.** My 33.6 s came from `networkidle0`, which includes the full model download over HTTP/1.1. It was my definition, not page ready. At 744c3d5 I reran `node scripts/perf-webchat.mjs --runs 3` (2-CPU host, 4× CPU throttle, h2, cold cache). Medians:

| mode | ready | first answer | model ready | p50 | p95 |
| --- | --- | --- | --- | --- | --- |
| rules | 3.9 s | 1.7 s | n/a | 260 ms | 625 ms |
| encoder | 4.4 s | 2.2 s | 12.7 s | 200 ms | 784 ms |
| encoder+n1 | 4.1 s | 2.2 s | 11.9 s | 186 ms | 958 ms |

- Thinking timer and "answered in 1.0 s": present and working. Validated.
- Ready ≤ 5 s and p50 ≤ 300 ms: met.
- **Still missed:**
  - first answer (1.7–2.2 s against 1.5 s);
  - p95 in encoder+n1 (958 ms against 800 ms);
  - longer multi-command phrasings: "how many legs does a spider have and what is 3 plus 4" takes 2.85 s (my perf.mjs, encoder+n1 default). The multi-clause fast path is **off by default** (`settings.fastPath === true`).

**Answers to the open decisions (questions.md "Review request").**
- **(a) Accept 4.51 MB `worlds/index.json`.** Gzip transfer is 0.64 MB and ready is under 5 s. The 2.5 MB target is retired. The real target is time: ready ≤ 5 s and first answer ≤ 1.5 s at 4× throttle, plus rules usable ≤ 5 s on Fast 4G. Do lazy per-world loading only if it is what gets first answer under 1.5 s.
- **(b) Accept 2.99 MB `patterns.sop`.** The 2 MB target is retired; the match-text reduction was the useful part.
- **(c) "Where were we?" means the most recent unfinished activity that the user left for a digression.** It is not the last thing said, and not the oldest topic.
  - If the digression came out of a story, the answer is the story; if out of the avatar, the avatar.
  - Relabel `dlg.avt#040`, `dlg.mpc#009` and `dlg.doc#045` under this one definition and make the runtime follow it.
  - ASTRA A11 will own this later; keep the same definition there.
- **(d) Relabel "What colour is the sky?"** kids.shapes answering is right for the user.
- **(e) Drop the S1 edit head from the shipped pipeline:** 3 recovered against 7 misled. Keep the code behind a flag that is off by default. Spend no more time on it.
- **(f) Shrink the slow-link cost by deferring the normalizer.**
  - Never auto-download the ~95 MB normalizer at page load. Load it the first time a message fails validation, or after 30 s idle on a fast link.
  - Skip the automatic download when `navigator.connection.saveData` is set or `effectiveType` is slower than 4g, and show "the helper model loads when needed".
  - The dispatcher stays as it is.

**Do next, in this order:**
1. **RD1b, RD2, RD5, RD9**: rewritten in the RD section below.
2. **PERF round 3** (below).
3. **SURPRISE**, then **AV**, then **ASTRA**. None of them is started: no die button, and still three DiceBear styles.

**PERF round 3.**
1. **Fast path on by default.** You report 0 reading diffs, so turn it on (keep the setting so the user can turn it off). Extend it to longer clauses joined by "and", "then", commas: "how many legs does a spider have and what is 3 plus 4" ≤ 800 ms at 4× throttle.
2. **First answer ≤ 1.5 s.**
   - Measure where the 1.7–2.2 s goes: the first-message lazy compile, the worker start, the warm-up competing with the first message.
   - Make the first message preempt the warm-up.
3. **Encoder+n1 p95 ≤ 800 ms.** The normalizer must never run for messages that a complete reading already validated.
4. **Normalizer deferral, as in (f).** Report Fast 4G cold "model ready" for the dispatcher alone.
5. **Mobile layout bug.** A long user bubble overflows the right edge on a 390 px viewport (text and time cut off). Wrap it and add a screenshot test.
6. Rerun the same table (3 runs, the same 6 messages plus the long multi-command one) and record it in RESULTS.md.

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

### AV — more avatars (user, 02:35: "only a robot and a man? that's too little")

Today `ui.avatar` has three DiceBear characters: robot (voxel-bot), person (open-peeps) and emoji (moods). The person reads as a man by default, and there is no woman, child, older person or animal-like character.
- **Vendor more DiceBear styles** the same way as now (`scripts/vendor-dicebear.mjs`, one JSON definition per style, `LICENSES.md`). Check every style's licence in its own `meta.license`. CC0 and CC BY 4.0 are compatible with our AGPL-3.0; for CC BY, show the attribution in the tab and in `vendor/README.md`. Candidates, use the ones whose licence checks out:
  - illustrated people with clear female and male looks: lorelei, notionists, adventurer, micah, personas;
  - children and friendly faces: big-smile, croodles;
  - a second robot: bottts;
  - pixel art: pixel-art;
  - a funnier emoji: fun-emoji.
- **Generate each new character's legend and lexicons** with `scripts/legend-from-dicebear.mjs`. Spoken names for the numbered variants, as was done for open-peeps, chosen by looking at the drawings.
- **Presets as descriptions, across characters (with RD3):** woman, man, girl, boy, old man/woman, with or without glasses/beard, happy, sad, cool. "make the avatar a woman", "become a little girl", "I want a pixel robot", "show me other avatars" pick a fitting style and preset, or apply the preset to the current style when it can express it. Accept misspellings (women, girll).
- **A visual gallery in the Avatar tab:** a strip of thumbnails, one per character, with a few presets each; click to switch. Voice and text do the same ("show me the characters", "the third one").
- Keep payload in check: load style definitions lazily, only when the character is first used (PERF).
- Tests: every character draws every variant; presets per character; ui.avatar world tests; 0 console errors in a headless run that cycles through all characters; screenshots for the reviewer.

### SURPRISE — a "try something" button (user, 02:33)

A discreet button next to the input (a die icon, with a tooltip "Try an example"). Each click:
- picks a random example request and puts it into the chat as if typed, marked as an example in the phrase log (not human phrasing);
- shows the answer; when the request belongs to a world with a tab, that tab opens (tab follow).

Details:
- Examples come from the canonical examples (RD6) of **all worlds except the games** (chess, tic-tac-toe, hangman, guess): game moves depend on game state and make no sense out of the blue. Include tab-less worlds (kids.*, help, profile questions that need no state).
- Prefer examples that work from a fresh state. Validate the pool at build time: each example must give a supported answer in a fresh session; drop the ones that don't.
- No immediate repeats; rotate across worlds so consecutive clicks show variety.
- The voice equivalents "surprise me with an example" / "give me an example command" do the same (ui.help).
- Test: 50 clicks in headless Chrome → 0 console errors, all answers supported, the tab switches when expected.

### ASTRA — persistent discussions and state management as a reusable core library (user, 02:33; from the attached architecture note)

Goal: one core library manages discussions, world instances, the information state, expectations, focus, history and plans, so that no world re-implements dialogue or state handling ad hoc. Today these live in pieces:
- `src/dialog/discourse.mjs` (frames, pending expectations, repairs, undo snapshots);
- world `interceptInput` modal modes, which capture input globally;
- one state object per world per session, with no instances;
- `ctx.referents` / `summary` hooks;
- dispatcher candidates in `dispatch-validate.mjs`;
- the avatar's own yes/no offers.

Consolidate them following established patterns. Keep SOP Lang as the state and event language: facts, events and plans are wires.

Write `specs/13-discussions.md` and ADR-008 first: concepts, data model and migration, mapped to the existing code. Then implement in stages. **Each stage keeps `npm test`, the operational set (right must not drop, wrong must not rise), the dialogue set and the PERF targets.** Each stage adds its own scenario tests to `training/eval/dialogues.jsonl` (new family `discussion`).

**A1 — identities: Chat, Discussion, WorldInstance.**
- A `Discussion` has: id, title, goal, status (active / suspended / completed / abandoned), linked world instances, context, open questions, plan, revision.
- A `WorldInstance` is the state of one concrete activity (a chess game, a drawing, a document) with its own id and version. One world can have many instances, and two discussions use separate instances unless explicitly linked.
- Every interpreted act keeps its message id and discussion id.
- Session state moves from "one state per world" to "instances per discussion", with a compatibility layer so worlds keep working unchanged.
- The user profile and global preferences live in a separate scope (user scope), not in a discussion.

Acceptance: two independent chess games and one drawing can be suspended and resumed correctly.

**A2 — Information State + dialogue moves (TRINDI style).**
- Every turn becomes typed moves (`inform`, `ask`, `answer`, `request`, `correct`, `cancel`, `confirm`, `resume`, `switch`), applied to the discussion's information state by one update function.
- A proposed interpretation becomes a fact or a command only after validation.
- Move recognisers come from `lang.common` and `discourse.mjs`; worlds do not parse yes/no/cancel themselves.

**A3 — task frames + expectation agenda (RavenClaw style).**
- Generalise pending expectations and the world modal modes (dictation, games, profile interview) into **frames owned by a world instance**: typed parameters, completion conditions, the current question and its admissible answers.
- An interruption suspends the frame; resuming reactivates it. The agenda decides which frame an answer belongs to (most recent, then most compatible).
- A mode belongs to the active instance and never captures every message globally; switch/help/cancel commands always pass.
- Migrate `interceptInput` users (docs.editor dictation, games, user.profile) to frames.

**A4 — focus stack + entity registry.**
- Each discussion has stable ids, aliases and recent references, generalising `ctx.referents`.
- "this", "the other one", "bigger" resolve in the active discussion. Ambiguity keeps the candidates and asks one short question.
- Switching discussion restores that discussion's focus.

**A5 — declared statecharts.** Worlds declare states and transitions in their manifest or SOP (start, user turn, finished; dictating; exercise, hint, check), including suspend/resume. Allowed moves per state come from the chart, not from ad-hoc flags in ops.

**A6 — event sourcing + snapshots; command/undo.**
- An append-only event log per discussion, with indexed current state.
- Snapshots allow resuming without re-interpreting the chat.
- Reversible commands declare their inverse; external effects (export, speak, download) keep their execution id and are never repeated on restore.
- Persist in the browser (IndexedDB or localStorage with versioned schema migration).

Acceptance: reopening the demo restores discussions and suspended activities without running old effects. Undo works the same in every world through the core, not through per-world hooks.

**A7 — provenance + truth maintenance.**
- Facts keep source, validity and justifications.
- Correcting a premise invalidates dependent conclusions and marks affected steps. Example: in kids.arith, changing a quantity recomputes the answer.
- A correction is distinguished from a real change over time. Example: in user.profile, "actually I live in Iași" is a correction; "I moved to Iași" is a change.

**A8 — HTN methods for multi-step and cross-world tasks.**
- Reusable methods decompose a goal into steps. Operations declare preconditions and expected effects.
- The plan keeps dependencies, results and blockers; observations drive continuation or replanning.
- Typed references between worlds, e.g. `chartId → docs.insertChart(documentId, chartId)`.
- Changing a shared resource makes dependent plans re-check their preconditions.
- A simple command is a one-step plan.
- Start with three real tasks: prepare data → make a chart → insert it into a document; a kids.tasks activity plan; draw-then-describe.

**A9 — one blackboard of hypotheses.**
- The parser, dispatcher candidates, reference resolution, discourse alternatives and the planner write to one typed state.
- Alternative interpretations stay hypotheses until there is enough evidence, and model scores never become facts automatically.
- Context reduces ambiguity before asking the user.
- This replaces the separate candidate lists in `dispatch-validate.mjs` and `discourse.mjs`.

**A10 — world contract + migration.**
- Document the reusable world contract: state schema and version, operations, typed parameters, preconditions, effects, completion questions, applicable planning methods, and a short user-facing state projection.
- Migrate worlds one per commit, with the L-library rules: nothing dialogue-related stays in a world.
- Each world's `coverage.md` states which patterns it reuses and which domain rules it adds.
- Measure the removed ad-hoc code (lines, interceptors, per-world yes/no and undo).

**A11 — demo UI.**
- A **Discussions** panel lists every discussion with its title, worlds, status and last progress, with filtering and one-click resume.
- A **discussion card** shows the goal, relevant objects, established facts, the open question and the next step; technical details are expandable.
- Common commands: "new discussion", "continue the drawing", "where were we?", "what is missing?", "correct …", "undo the last step".
- Routing: a message continues the active discussion by default, and a clear reference selects another one. Detecting another world does not create a new discussion by itself. A multi-intent message can produce acts for several discussions.
- Demo scenario as an automated test: start a drawing, open a chess game, then "continue the drawing and make the circle bigger" (the drawing's focus is restored, the game untouched), then "put the drawing into a document" (a docs.editor instance joins the discussion plus a small cross-world plan).

Order: A1, A2, A3, A4, A6 and A11 first; the verification is two games plus a drawing suspended and resumed correctly, also after reloading. Then A7, A8, A10. A5 and A9 come when the observed ambiguity justifies them. **No probabilistic machinery unless the dialogue set shows ambiguities that need it.**

**Per tab and per world (user question 14:57: "can each tab have dialogues that can be continued, per world and per tab?").** Not built yet. Today the discourse layer keeps frames per world inside one session, "where were we?" returns to the last unfinished activity (658acae), and nothing survives a reload. ASTRA must deliver this explicitly:
- each tab shows its own discussions: a small "Discussions" list in the tab header, with the active one first;
- switching tabs resumes that tab's active discussion: its focus, open question and world instance;
- "continue the chess game from before" or "back to the second drawing" pick the right one;
- every discussion survives a reload (A6).

Acceptance: the A11 demo scenario plus a per-tab one, all after a reload: two drawings and a chess game, switch tabs, reload, continue each.

### RD — a real user dialogue (user, 02:14) replayed by the reviewer at f48c450: what still breaks, and the general fixes

The user's 49-message session (avatar, map, chess/tic-tac-toe, chart, drawing; English with typos plus Romanian) is in `training/eval/real-dialogue-2026-11-09.txt`. Replayed in the CLI, about 20 of the 49 turns are wrong or not understood. Add it to `dialogues.jsonl` with the right tabs, expected states and answers, and treat each item below as a **general** fix with tests across worlds, not a patch for one sentence.

**Status after the final review at 744c3d5 (09:20).** RD3, RD4, RD6, RD7 and RD8 pass. RD8 was rechecked: tic-tac-toe "b1 / c3 / c1" and chess "b1 / c3" follow the active game and the engine answers. RD1, RD2 and RD5 fail; they are rewritten below. RD9 is new. Replay commands: `node src/cli.mjs chat < training/eval/real-dialogue-2026-11-09.txt`, and the same messages typed in the webchat (language dropdown left on English, as the user had it).

**RD1b — never "correct" a word that is valid in some world (FAILS; it replaces RD1).** Each of these was misled:

| message | tab | what happened |
| --- | --- | --- |
| "red house big" | Avatar | "There is nothing to redo. (I read "red" as "redo")". It should draw a big red house: BEST-EFFORT plus a valid art.draw reading. |
| "next" | CLI, after drawing | "You are welcome. (I read "next" as "neat")" |
| "fa-i ochii mari" | webchat | "I read "mari" as "mark"". The search then ran in Documents and **the tab switched to Documents**. |
| "eys express fear" | | Now read right. |

Rules:
- A word that is exact in any world's vocabulary or in lang.common is never corrected. The active world gets first try at *reading* it; if that fails, other worlds may read it exactly before any correction is tried.
- Correction only applies to tokens unknown to every world. Then the active world goes first, as RD1 said.
- A correction must never cause a tab switch on its own.

Tests: the three messages above, plus a set of valid-word inputs per world. Report misled corrections on the typo sets (target 0 misled on valid words).

**RD2 — naming a world wins (FAILS; not fixed).** CLI and webchat at 744c3d5, after "make a chart: apples 5, pears 3" (Charts tab):
- "now in a women" answers "I do not see in a women in the chart". The previous avatar frame is lost.
- "the avatar should be a women" answers "I do not see avatar in the chart".
- "make the avatar look scared" answers "I did not understand", even on a fresh session, while "look scared" works.

The task text above (the original RD2) stands. Add these three as dialogue tests with the Charts tab active.

**RD5 — Romanian sessions (FAILS).**
- *CLI* (language auto): replies are now Romanian, good. But:
  - "fa-mi avatarul ca om" and "fa avatarul ca om" are not understood ("Ai vrut să spui «Fă avatarul o femeie»?" — *om* means person/human, not woman);
  - "fa ochi visatori" is not understood;
  - "fa-i ochii mari" goes to the drawing ("Nu pot găsi un ochi în tabloul tău") on the Avatar context;
  - "fa ochii mari" works but the reply is in **English**;
  - the Romanian reply contains a broken quote and grammar: `Încearcă" desena o casă roșie"`.
- *Webchat* with the dropdown on English (the default, and what the user had): Romanian is not detected at all. "fa ochi visatori" is not understood in English, and "fa-i ochii mari" switches to Documents.
  - Strong Romanian evidence must switch the session language (and the dropdown) the same way the CLI does: clitics like fa-mi / fa-i, diacritics, two or more Romanian content words.
  - A single English word with a typo must not switch it.
- Acceptance:
  - all seven Romanian lines of the real dialogue give the right action with a Romanian reply, in both the CLI and the webchat;
  - a Romanian reply-quality check (no mixed language, no broken quotes) over the Romanian set's replies.

**RD9 — small reply and quantity bugs from the replay (new).**
- "eys express fear" answers "Now I look fear". The mood noun must turn into the adjective (scared / afraid); check every mood the avatar accepts as a noun.
- "add more clouds" draws one cloud. A plural "more X" adds a few (2–3) and says how many.
- "square eyes robot pls" works, but the reply ends with "You are already on the Avatar tab.": a loose word must not trigger a second tab reply.

- "bugger house pls" became kids.animals ("where buggers live").
- "nect to a house" was not corrected inside the position slot.
- "eys express fear" was not read as "eyes express fear".

Build a spelling vocabulary per world from its patterns, lexicons and phrase macros. Correct first against the active tab's world, then the dispatcher candidates; correct inside slot phrases too. Never correct towards a word of another world when the active world reads the sentence. Report recovered/misled on typo sets per world.

**RD2 — naming a world wins.**
- "the avatar should be a women" and "now in a women" on the chart tab went to data.charts ("I do not see avatar in the chart").
- "next" on the drawing tab played a song.

A message that names a world's object or tab (avatar, chart, map, drawing, document, chess…) must route to that world whatever the active tab is. Bare words ("next", "more", "b1") follow the active tab, and the music world claims "next" only on its tab or while a song plays. Generalise this as a routing rule (ADR-004 tier) with tests.

**RD3 — descriptors map to what the character can do instead of refusing — DONE and validated (61dc8ff).**
- "make bigger eyes", "make eyes sleepy", "fa ochi mari/visători" on the person: refused.
- "transform the avatar in a man" and "make the avatar a women" (typo for woman): "I am a person already".

Add a per-character capability map. A requested attribute the character lacks maps to the closest available one: eye size or mood → the person's expression; man/woman/girl/boy → hair and facial-hair presets; happy/sad → expression. Say what was done ("A person's eyes follow the expression, so I made it wide-eyed"). Offer switching the character only when nothing close exists. Accept common misspellings (women→woman).

**RD4 — comparatives that create — DONE and validated (cdfd06a).**
- "draw another house" → "a bigger house" / "draw a bigger house" failed.
- "draw a girl" drew a "blue person"; "a man" went to kids.common ("A has no common second name"); "make a happy man" was not understood.

Creation with a comparative ("a bigger/smaller/taller X") sizes relative to the existing X. Ellipsis after a draw ("a man") repeats the draw. People get attributes: girl/boy/man/woman → size, hair and dress presets; happy/sad → face.

**RD5 — Romanian sessions — PARTIAL (2e2846c), reviewer probes at 4e7f7ee:**
- "fa-mi avatarul ca om" is still not understood ("Did you mean: make the avatar a woman": *om* = person/human, not woman);
- "fa ochi visatori" is still not understood;
- the replies to these Romanian inputs come back in English. Expected: Romanian replies whenever the session language is Romanian, which the clitic "fa-mi" and the words avatarul/ochi/visători should make clear;
- "eys express fear" is still not understood (RD1).

The original text of RD5 follows.
- "fa-mi avatarul ca om" and "fa avatarul ca om": unknown word "avatarul".
- "fa ochi visatori": unknown "visatori".
- Replies come back in mixed Romanian/English ("Ochii mei vin cu meu expression. Pentru wider ochi…").
- "eys express fear" (English with a typo) was detected as Romanian.

Fixes:
- Translation lexicon coverage for the app's own vocabulary: avatar, ochi, mari, visători, om, femeie, bărbat, fată, desenează, casă, nor, soare, grafic…
- Language decided per session from strong evidence; an English word with a typo must not flip it.
- Back-translation of replies either fully Romanian or left in English, never mixed.
- Haiku Romanian paraphrase batches per world, plus a Romanian column in the operational report.

**RD6 — help examples must be canonical sentences — DONE and validated (5415b0d).** "help" offered "Hair colors list" and "Bolt is ur name". Mark canonical examples (`example=` from the request-shape kernel or flagged `canonical=true`) and use only those in help and "Did you mean".

**RD7 — phrase log export exports fewer messages than were typed — DONE (9809b52; headless export test in npm test).** Reproduce with the 49-message session typed in the webchat:
- compare the Settings count, the list and the JSONL lines;
- check chips/host sends, the `source` filter, the 5,000 cap, translation, and messages sent while a modal (dictation, game) intercepted.

Export must include every typed or spoken message by default. Add a webchat test that types N messages and checks N records.

**RD8 — bare game coordinates and the engine.** "b1" answered "You already have a knight on b1"; "c1" answered "I am still thinking about my move". Check which tab the user was on: coordinates must follow the active game tab. Find out why the chess engine reply hangs, then fix both.

Measure after RD1–RD8: the real dialogue right turn by turn, the dialogue set, the operational set (wrong must not rise).

### PERF — the webchat is very slow on mobile (user report 23:46; reviewer measurements at 06280ae) — TOP PRIORITY

**Reviewer re-measurement at d7fe3f0 (05:35):** page ready **33.6 s** (worse), hello 504 ms, 3 plus 4 203 ms, **multi-command 3.96 s** (worse), eyes square 202 ms, paris 637 ms, hello 154 ms. PERF has not been worked on yet; do it next, after RD1.

**Reviewer re-measurement at 2500e81 (same script, 4× throttle):**
- per message: hello 434 ms, 3 plus 4 195 ms, multi-command 2.2 s, eyes square 158 ms, paris 408 ms, hello 84 ms. Much better, but the multi-command message is still over the target.
- **page ready got worse: 29 s.** Targets still open: page usable ≤ 5 s, models after first paint, multi-command ≤ 800 ms.
- The thinking timer is not there yet.

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

### D-FIX — raise the dialogue headline — DONE and validated (493ab23): target met in every group

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
- D-FIX rounds 2–5 (0276ef9 … 493ab23): 809 tests pass. **Dialogues (rules): 96.6% of turns, 87.7% of whole dialogues right**; every group ≥ 85% (kids 86, avatar/shell/editor 88, music/draw/map/charts 86.4, games 94.7, documents 87.2, other 86). Operational 95.0% right / 0.6% wrong. Next: PERF (top priority), BEST-EFFORT, then G4/G5 retrain and the encoder modes.
- R3 (dbcfba2 … 2500e81): N1 v3 published, bound to dataset/rules/policy hashes; dispatcher v3 rejected by the operational rule (97.8 vs 98.2); `published.json` written from the shipped config. **Shipped config (encoder + N1): 98.2% right, 0.6% wrong, 1.0% not understood** on 1,240 messages; rules only 95.0%. 825 tests pass. L7 kids.time migrated (match text −82%).
- RD3 + RD4 + G6b long/medium operational set (2abee55, 61dc8ff, cdfd06a): 830 tests pass. CLI: "make bigger eyes" → wide-eyed expression; "make eyes sleepy" → sleepy-eyed; "transform the avatar in a man" / "make the avatar a women" → hair/beard presets; "draw a bigger house" → bigger than the existing one; "draw a girl", "a man", "make a happy man" draw people.
- L7 roll-out: geo.map (−70% match text), data.charts (−58%), docs.reader (−48%), games.chess (−35%), kids.time earlier (−82%), with request shapes (240239b, a3f8222, 0eda082, bd84b02): 830 tests pass; operational 95.0/0.6 and dialogues 87.7% unchanged.
- RD6 canonical help examples, RD7 phrase-log export (5415b0d, 9809b52): 859 tests pass; help now offers "Try the next mouth", "What character is on screen", "Reset your eyes". RD5 is partial (see RD5).
- **L6 + L7 complete** (request shapes, all 21 worlds migrated; summary 6f041a1): hand-written match text 6.04 MB → 1.87 MB (−69%), patterns.sop 7.1 → 3.0 MB, repeated groups 1,798 → 920, 65 shapes generating about 450 patterns. 871 tests pass; operational rules 95.4% right / 0.5% wrong / 2.3% not understood; dialogues 96.4% of turns, 88.0% of dialogues. Left in L: L9 (frame literals in routing, measured) and L10 (docs + AGENTS note).
- D5 learning loop (d203be9), L9 frame literals measured and rejected (a975872), L10 docs (d7fe3f0): 882 tests pass. **The L library is complete.**
- R4 dispatcher v4 published (d667609; sha 6c41eb24, safe S1 edit head) + T9 RESULTS summary (64e259a): 882 tests pass. **Shipped config 98.6% right, 0.4% wrong, 1.0% not understood** (1,240); long set 94.2%; dialogues 86.3% (encoder+n1); Romanian 84.8% right / 2.7% wrong. Browser check: answers correct, 0 console errors. PERF unchanged: page 32 s, multi-command 4.2 s (PERF round 2 in progress per T9).
- Final review of the batch (744c3d5, 09:20): 884/885 tests pass (1 skipped); rules operational 95.4 / 0.5 reproduced; rules dialogues 96.4 / 88.0 (claim 96.6 / 87.7, 4-turn gap to reconcile). **PERF round 2 (57b28bf) validated in part:** ready ≤ 5 s in all modes, p50 ≤ 300 ms, thinking timer and "answered in X ms" work, v4 loads in headless Chrome with 0 console errors; first answer, encoder+n1 p95 and long multi-command remain (PERF round 3). RD8 validated (game coordinates follow the active game). BEST-EFFORT validated in part ("square eyes robot pls" works; "red house big" misled → RD1b). Decisions (a)–(f) answered in §2. RD1b, RD2, RD5, RD9 open; SURPRISE, AV, ASTRA not started.
- Review decisions c/d/e + dialogue recount (658acae): 890/891 tests pass (1 skipped); "where were we?" follows the one definition; sky label fixed; S1 edit head behind `editHead`, off by default; rules dialogues 96.4 / 88.0 reconciled with the reviewer.
- HANG + STOP + LIC (dc6f310), VOICE (b482a83), RD5 + RD9 (ed13089), ED (4310363): `npm test` 918 pass / 0 fail / 3 skipped at 1375718.
  - Stop, one message at a time and the watchdog work: the reproduction no longer freezes. The root cause is NOT fixed, though: the model worker hangs → HANG2.
  - RD5: "fa-mi avatarul ca om" works with a Romanian reply in the webchat (dropdown on English); "fa ochi visatori" and "fa-i ochii mari" hit HANG2.
  - RD9 works: "Now I look scared", "I drew 2 clouds".
  - ED works in the CLI: new line, new chapter, write, bold, read the document. Webchat check pending.
  - VOICE: validated by the worker's tests (fake recognizer); a real-microphone check needs the user.

- Batch up to c0c4cf8 (SET e2bf431, UI1 c11350b, DOC c34fb27, RD10/RD1b/RD2 92162cc, AV a8c07d5, DIAG 6877c84..2cb0593, ASTRA 7b158ba..975848a): `npm test` 998 pass / 0 fail / 4 skipped.
  - **SET:** the settings modal has 7 tabs, opens by voice on the right tab, closes with Esc.
  - **UI1:** one mic and one read-aloud toggle in the input bar; no icon button without a tooltip; "Source code (AGPL-3.0)" link.
  - **DOC:** neurosymbolic greeting and header.
  - **RD10:** "show Pariss", "show New Youk", "show Bern city", "show the city of Bern", "change avatar to a man" on tic-tac-toe, "change vatar to a woman" and "B1" with no game are all right.
  - **AV:** 9 characters listed.
  - **ED:** works in the webchat (chapter, write).
  - **Open:** HANG2 (still reproduced at c0c4cf8), DIAG2, and the ASTRA review (next check-in).

- HANG2 (22bb758) + time limits (cbdca37): the ORT worker has its own deadlines, cancel and restart, and rules mode makes no model calls. Real Chrome at 1×: the user's session answers every line in 1–3 s ("get me to New Youk" → New York City), with no watchdog endings in rules mode. The remaining 8 s endings are stage `translate` → HANG3.
- RP3 item 9, the profile interview (c94b8de, files match the log). CLI replay of the user's interview:
  - "Axiologic" → organisation, and the field question is asked again;
  - "R&D" → field research and development;
  - "Reading" → hobby;
  - after "stop", the misspelled "coming back to knowning me…" resumes with the next question;
  - the summary is right.
  Small open point: the bare "20" answering "How did you get into it?" is not taken as years; the next question asks for years again.

- At 91ce510, reviewer's real Chrome check:
  - **HANG3** (205e28b): "fa ochi visatori" 1.4 s, "fa-i ochii mari" 0.9 s, no watchdog endings.
  - **PERF round 3** (51a43f1), encoder+n1 at 4×, 2 runs: ready 3.7–4.2 s, first answer 0.9–1.2 s, the long multi-command 0.48–0.58 s (was 2.85 s), p95 ≤ 850 ms.
  - **DIAG2** (10f9fd7): single-clause diagram commands work in the webchat on the Diagram tab ("Drew Api", "Connected Api → Db"), and a running game takes bare coordinates.
  - **SURPRISE** (44eb6ec): the die button works.
  - **MIC2 / EOT2** (ccca6a1): validated by your tests; the real microphone needs the user.
  - **BUSY**: still not on main (BUSY-LOST).
  - Follow-ups in SMALL.
- TEST-SPLIT (d770679, files match the log):
  - reviewer run here on 2 cores: `npm test` (fast) 201 s wall, 1,058 pass / 0 fail / 1 skipped, seed printed (before: about 12 min);
  - your machine: fast 58 s, full 470 s;
  - the full suite keeps the same 1,041 test names.
  - Open: `webchat-ui` "How many days has April?" is flaky under load; make the random-click test deterministic (seeded) or fix the cause.
- FB (e8a608f) and DBG (000d13d), files match the log: reviewer run of `scripts/test-webchat-ui.mjs --only debug,feedback` in real Chrome, 64/64, exit 0. Two small notes, to fix with the next UI change:
  - `feedback-form-phone.png` shows the ▼ marked but not the open form; take the screenshot with the form open.
  - In that screenshot, "make the eyes blue" on the robot answers "I do not have blue for that; turquoise is the closest". Blue robot eyes should simply be blue: check the robot eye palette (RD3).
- DIAG3 (9383474), files match the log: `test-webchat-diagram3.mjs` 14/14 in real Chrome. The four skipped expectation rows fail; see DIAG3b. SMALL 3 and 4 validated.
- SMALL 1–2 (4e128a6, files match the log): the surprise pool keeps only requests and questions (tests); "fa ochi visatori" now answers in Romanian, "Gata! Acum am ochi somnoroși." (real Chrome). SMALL is closed.
- RP5 (cc78918, files match the log): validated in part (see RP5b for what is validated and what still fails).
- DIAG3b (3efde88, files match the log): `test-webchat-diagram3.mjs` 15/15 in real Chrome, 0 page errors. Reviewer tree probe: hierarchy template ("Keeping the current diagram."), short ids in every reply, rectangle1 = the first rectangle the user drew, lable→label, attachments fanned out, new shapes placed in free space, `kind` exposed. DIAG3 is closed except the act parity gap (81.0 vs 82.5).
- FREEZE 4–5 (a8f55bb, files match the log): the cancellable dry run, ORT restart budget and device-speed deadlines are in (unit tests). Reviewer 12-minute soak: 8/10 pass; main-thread busy fails, see FREEZE-6.
- TIER-T-LONG (1160540) and R5b (3e0ac18), files match the log: accepted on the logged numbers. Long set 80.5 → 94.2 right, 1296 set 98.6 / 0.3; v5 is not published, v4e stays. The reviewer did not rerun them (2-vCPU host).
- NX1 (5956e32): the label format in `training/nx/README.md` is good: spans relative to the segment, BIO loss masked for `partial`, synthesized `ask` marked.
- NX2 (5214a55), NX4-A (28c5077) and NX5-lite (45a5d03), files match the log: pilot table and selection rule applied (labeler Sonnet; judge Sonnet, none qualifies); A exported with outputs identical to v4 (+0.9 MB); A+ shows no accuracy forgetting but is not a drop-in; operation agreement with verified rules readings 85.4 / 88.5%. Follow-ups are in the NX reviewer notes.
- RP5b (6377c61, files match the log): validated in real Chrome. The root cause (a tab click never told the engine the active tab) is fixed. The three leftovers are in RP5c.
- NX4-B (ebea7bd): accepted. Seen worlds: span F1 .92, operation .88. Unseen worlds do not generalise (operation .40, span F1 .41), at ~40 passes per segment. The A seeds are stable (±0.1). The reviewer confirms the real exported A model costs the same as dispatcher v4 in the browser harness (50.2 vs 49.6 ms at 32 tokens, `results-nx-a.json`).
- NX5 full evaluation + NX4-C + NX3 retrain (9809b87, 71177f8), files match the log: accepted.
  - Model alone: 62–66% on operational (rules 95.6%).
  - On paraphrases outside the patterns: 71–82% (rules 22%).
  - D: neutral on operational (+2 of 1,450), but +0.6 points wrong; NX6 conditions 2 and 3 fail, so not integrated.
  - C LoRA: diagram op .835→.956.
  - Next step: NX7 (gate, D over encoder+n1, Romanian, recheck NX6).
  - DGX cleanup still not done (the worktree symlinks `training/runs`; careful).
- RP5c (7f6f716): items 2 and 3 validated; item 1 still open (repro with context, see RP5c).
- NX3 (6c4a253), files match the log: 29,111 records, audit error 1.3%, judge accepted 97.5% of disagreements, ~$26.6 estimated (under the $60 cap). Accepted; short of the 50k target.
- NX7 (683d04a, e609df1), files match the log: accepted. The gate was tuned on dev only. Gated D over encoder+n1 adds 0 wrong anywhere; A3 + guard: +5.2 points on the rules-fail sets over the shipped mode, Romanian +0.6. Model-first is not safe (−20 points). NX6 GO with A3 + guard.
- NX-INTEGRATION (06a6d96, 7e356fe, eb5003a), files match the log: **validated in real Chrome.**
  - Default strategy `hybrid` (A3 + guard).
  - Perf at 4×, reviewer host: ready 4.6–6.0 s, first answer 1.1–1.6 s, p50 ≈ 270–310 ms. Same as before; host noise.
  - On the 65 gold paraphrases, the model read 3 correctly, with the trace showing "Read by model (operation … at 0.999, pattern …)":
    - "count the questions youve asked" → guess.count;
    - "list animals that live in water in the sea" → the sea animals;
    - "can u suggest where i play" → ttt.hint.
  - Regression probes unchanged: the Romanian session (`rp5.mjs`) and the diagram session (`diag3x.mjs`) give the same answers as before, 0 errors.
  - Rollback is one setting (Settings › Understanding › Reading strategy).
- **Track 1 validated (reviewer, 08:35 local, real Chrome):**
  - MOBILE-VOICE review fixes (d1349b3, 80a87a2): `test-webchat-voice.mjs --only mobile,persist,twotabs,noise --throttle 6` gives **28/28**. Lock theft stops the old owner, noise falls back to cheap signals, the phone export is replayed in the browser.
  - BUSY-LOST (bcd441a): `busy.mjs` shows the veil during the turn (TV), with `is-busy` on the tabs and panels.
  - FREEZE-6 (17a58a9, e3a84b2, f82d80b): 7-minute soak, main-thread busy **48% average / 66% worst minute** (was 57 / 78), inside the task gate (< 50 / < 70). Heap flat, 0 restarts, echo 28 ms. The soak script's own worst-minute check (< 50%) still fails.
  - RP5c item 1 (d1fdad2 / eebfa22): the reviewer's full Romanian sequence now gives "desenează trei cercuri" → "Am desenat c1, c2 și c3." on the Diagram tab.
  - GAPS-1 (21a8f1a, ca0bef5): all six items answer correctly in Chrome:
    - the tic-tac-toe hint is "How about the center?";
    - rules, who goes first;
    - "OK, today is Friday.";
    - "No, I do not look happy.";
    - the robot does not wear clothes;
    - the shop change;
    - circle vs other shapes.

    The heads strategy still reads its cases ("Read by model": guess count, sea animals).
- GAPS-1b (e5c026e) and the soak gate change (8c079e1), files match the log: accepted.
  - Operational and long numbers are unchanged; 3 new dialogues pass.
  - Reviewer `gaps.mjs` in Chrome: all GAPS-1 answers unchanged.
  - The two heads cases read by the model once it is loaded (`heads2.mjs`: "Read by model … 0.996 / 0.998"). Before the model is ready, hybrid falls back to the rules, as designed.
- VOICE-TIMEOUT (bd138c1), files match the log: accepted. Test infrastructure only: the replay now runs as its own test with a 420 s timeout and a 3.5 s gap cap; nothing in src changed.
