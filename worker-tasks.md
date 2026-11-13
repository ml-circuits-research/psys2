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

**NX8 — 20k more data and a retrain (the user told you directly, 10:32 local). Reviewer acceptance rules:**
1. **Data.**
   - Same NX3 pipeline: generate and label per shard, deterministic gate, rules agreement, judge on disagreements, 3% audit.
   - Weak worlds and the constants first: ui.avatar, docs.editor, kids.arith operator forms, `arg.list`, `arg.anim`, art.draw.
   - Log the items per hour, the $ (estimated) and the audit error. Keep the audit error ≤ 2%.
   - Protected texts are dropped, as before.
2. **Retrain** A (the drop-in, frozen v4 encoder) on NX1 + NX3 + NX8. Report the test op / slot F1 next to A3. The dispatcher outputs must stay identical to v4 (check int8 parity).
3. **Re-tune the gate on dev only.** Rerun the NX7 full sets with the new model in `hybrid`. The four NX6 conditions must hold, and the new model must be **at least as good as the published A3** on the rules-fail sets, with **0 added wrong** on operational, long, dialogues and Romanian.
4. **Publish only then** (a deliberate model publication). If it is not better, keep A3 and write the numbers.
5. **Tell the reviewer in `worker-log.md`** (commit list, numbers, the published sha). The reviewer validates in Chrome before the user is told: `heads2.mjs`, `gaps.mjs`, `rp5.mjs`, `diag3x.mjs`, perf.

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

### DO NOT WAIT FOR A TAG (user, 21:14; reviewer's mistake)

The library will not make git tags: its session cannot push them, and the user sees no point in them. **Start SOPWORLD-1b now.**
- Vendor the library from its `main` **at a commit hash** (today: `e387c51` or newer): copy `docs/sopworld.mjs`, and record in `src/vendor/LICENSES.md` the commit, the version and build hash from the library's `docs/version.md`, and the sha256.
- Re-vendor whenever you need a newer feature; no release ceremony.
- Wherever this file says "0.5.0 tag" or "0.6.0", read "the current main of the library".
- That `main` already has everything SOPWORLD-1b needs: tiers and `assumptions()`, `describe` / `diff`, `check` / `applyPatch`, relations, declarative actions, soft constraints (`soft=true`, `core.issue`), `revise`, `told()`, `undo` / `mark` / `rewind`, abduction through `query`, the derived answer wire in query results, violations with bindings, separate function registries, ambiguous ties, calc failure reasons, precision, fluent `delta`, and the one-language syntax (`?` only a variable; the old `?id` declarations still load with a warning: convert our three matrices with its `tools/migrate-syntax.mjs`).
- Its documentation is in `docs/language.md`, `reference.md`, `semantics.md`, `glossary.md`.

### SOPWORLD-1 review and SOPWORLD-1b (reviewer, 19:10) — after LANG-FIXED lands

**SOPWORLD-1 (4af5167 … f249989) is accepted.** It is a careful, honest report: "no line is saved yet" and "matrix mode gains only where stage 1 built the feature" are exactly the kind of statement we need.

Reviewer rerun: `test-world --reasoner matrix` kids.shop 147/147, kids.tasks 232/232, kids.arith with the listed failures; default strategy unchanged; `scripts/test-webchat-matrix.mjs` in real Chrome 18/18.

**What the numbers say:**

| Measure | ops | matrix |
| --- | --- | --- |
| Turns that leave the world in violation (per-turn audit) | 21 of 761 (2.8%) | 2 of 745 (0.3%) |
| Coherence set (30 reviewer cases) | 17 | 19 |
| Undo | 0/3 | 2/3 |
| Default revision | 1/3 | 2/3 |
| Abduction | 0/2 | 1/2 |
| Explain | 0/3 | 0/3 |
| Turn time, three worlds, p50 | 14.4 ms | 15.7 ms (+9%) |
| Bundle | — | +196 kB raw / +55 kB gzip, loaded only in matrix mode |
| Replaceable code across all worlds (the map) | — | 32% of 15,764 lines; above 50% in ten worlds |

Your ten workarounds went to the library as its tasks W1–W8, together with soft constraints (G11) and the one-language change (L1); it will tag 0.6.0.

**SOPWORLD-1b: make the comparison fair and close what stage 1 showed.** The default strategy stays `ops`.

1. **Re-vendor** the library at its current `main` now (0.5.0: tiers, `describe`, `diff`, `check` / `applyPatch`, relations, declarative actions, ambiguous ties, calc failure reasons, precision, fluent delta, defaults on optional keys), and again at 0.6.0. Remove each workaround when its W-task lands (function prefixes, second queries in `voice`, rebuilding the wire for "three of them", the audit by re-telling).
2. **Coherence failures that are ours, not the library's.** The set must be answerable in both strategies before it can compare them.
   - **Sentences the formalizer does not read, in either strategy:** "Ana gives him some", "Tom had some apples", "He ate 2 and now has 3", "Why do I have nothing left?", "I buy something", "No, she gives him 4", "No, to my to-do list", "Which list did you put it on?". Add the patterns (general shapes: an unknown amount "some", a past-tense start, "why …?" about the last answer or a named fact, a correction "no, …" that revises the last event).
   - **Explain 0/3:** "why?" must give the whole chain from `explain` (every told fact, in order), in both languages; in `ops` mode say what is known (the `from` list).
   - **A refused or impossible statement must be said to the user**, not acknowledged with "OK": "That does not add up: Tom has 3 apples, he cannot eat 5." With G11 the statement is kept and flagged.
   - **Ties:** "Who has more apples?" with equal counts → "They have the same" (the library now answers `ambiguous`).
   - **Unknown start:** "Ana gives Tom 2. How many does Tom have?" → "I don't know how many Tom had; he got 2." (the library's `delta`).
3. **One undo.** The dialogue layer's snapshots and the library must not diverge (3 dialogue turns fail). In matrix mode the dialogue layer's undo / "that's wrong" calls the library (`retract`; `undo` / `mark` / `rewind` when W8 lands) and the world state is derived from the library, for all three worlds (`toState` for shop and arith too).
4. **Certainty in replies** (item (d) was 0 of 46 because nothing reported assumptions): in matrix mode, when an answer rests on a value of tier `default` or `guessed`, the reply says so once ("I assumed 1 ball.") and the phrase log records `assumptions`. Use `world.assumptions()` and the tiers; add this to the coherence runner's hint `assumption-visible` so it is checked mechanically.
5. **A visible world for the user's eyes.** Stage 1's three worlds have no tab. Add **games.tictactoe** to matrix mode (27% replaceable: the rules of the game, whose turn it is, win / draw, legal moves as a matrix; the board UI stays). It shows consistency on something visible: an illegal move is refused with the reason, "undo" takes back a move, "why did you play there?" explains.
6. **Rerun `eval-reasoner`** after 1–5 and report the table again, with the per-case transcripts of every coherence failure that remains.
7. **The `games.guess#030.ro` difference** (a world that does not use the matrix changes outcome with the switch): find the cause; the switch must not touch other worlds.
8. Item 10 (SOP Lang v1.1) waits for the library's L1.

### LANG-FIXED — the selected language is the language; no automatic switching (user, 17:01 local) — before SOPWORLD-1

**The user's report.** The freeze is fixed on GitHub Pages. But with **Română selected**, speech recognition "goes to English by itself": sometimes Romanian is understood, sometimes not.

**The user's decision: we are too fancy with language detection. If the interface has a language selected, everything stays on it.**

**What the reviewer found by reading `docs/webchat/app.mjs`:**
- The recognizer and speech language is `speechLangTag()` = `LANG_TAGS[sessionLang ?? settings.language]`.
- `sessionLang` is set by `noteSessionLang(l)` from the **detected language of a message**; it calls `speech.refreshLang()`, which restarts the recognizer in that language.
- So one Romanian utterance that the recognizer hears as English-looking words (or a short word such as "ok", "stop", a name, an English command) flips `sessionLang` to `en`. From then on the microphone listens in **en-US** while the selector still shows Română. Romanian speech is then transcribed as English nonsense, until something flips it back. That is exactly "sometimes it understands, sometimes not".
- The `ui.shell` language operation (line ~318) and the translator's detector are further paths that can change it.

**Do:**
1. **One source of truth:** `settings.language` (the selector).
   - Remove `sessionLang` as an override for recognition, speech synthesis, reply language, the noise classifier, the dry run and the translator direction.
   - A message is always read as the selected language. With Română selected, every message goes through ro→en and every reply comes back in Romanian, with no per-message detection.
   - English words inside a Romanian sentence (names, "ok", "stop") are handled by the Romanian pipeline (pass-through of known English commands), not by switching language.
2. **Only an explicit act changes the language:**
   - the selector;
   - a clear command in either language ("vorbește în engleză", "switch to Romanian", "speak Romanian"). The command changes the selector visibly and says so ("Am trecut pe engleză.").
   - Nothing else: not detection, not the `ui.shell` state, not the translator.
3. **Remove the `auto` language mode,** and "Automatic (follows the session language)" for speech; speech follows the selector. An existing saved `auto` migrates to the browser language on first load (`ro*` → ro, otherwise en) and is saved. The Voice setting keeps only the voice and the rate, plus a regional variant where it matters (en-US / en-GB).
4. **The language detector goes off the turn path.** `LanguageDetector` and the rules detector are used for exactly one thing: a one-line hint when the selected language is Romanian and a typed message is clearly English (or the reverse): "Pare engleză — schimb limba?" with a button. Never automatic, never for voice.
5. **Consolidate the code.** One module `ui/language.mjs` owns the language: `get()`, `set(lang, reason)`, an `onChange` event, and the BCP-47 tag for the recognizer and for speech. `app.mjs`, `speech.mjs`, `translation.mjs`, `voice-noise.mjs` and the engine client read it from there. Delete the parallel variables (`sessionLang`, `speechLang` follow modes, `noteSessionLang`, the language branches in `ui.shell` sync). Report the lines removed.
6. **Evidence in the phrase log:** every voice record stores the recognizer language tag actually used (`recLang`) and the selected language, so a future export shows a mismatch at once.
7. **Tests:**
   - unit tests of `ui/language.mjs`;
   - browser, with Română selected and the fake recognizer: the tag passed to every `SpeechRecognition` start is `ro-RO` across 30 turns that include English-looking finals ("ok", "stop", "play little star", a name), an English typed message, an English reply quoted in the answer, a tab switch, a worker restart and a page reload. Symmetric for English.
   - the explicit switch command changes the selector and the tag;
   - no `LanguageDetector` call during a voice turn (spy).
   - Add to the user's regression sets: the Romanian voice session 09e replayed with `recLang` asserted.
8. Also check that the **reply voice** uses a Romanian voice when one exists, and says so in Settings when the device has none (then it speaks with the default voice rather than staying silent).

### SOPWORLD-1 — sopworld as the reasoning core, stage 1: three pilot worlds behind a setting (user decision 14:11; pilot validated 17:05) — after the open COMPUTE-BUDGET review items

**What it is.** `sopworld` (https://github.com/ml-circuits-research/soplang-words-lib, same owner, MIT) is a general library for self-consistent worlds of SOP Lang wires:
- a schema with type hierarchy;
- rules, denies, defaults;
- sequence and fluents (state changed by events);
- aggregates;
- queries with a status, written as answer wires;
- actions as transactions;
- retract and replace;
- abduction;
- explain;
- step budgets on every loop;
- a structural `fork()`.

The user wants it as the centre of the worlds, so they share one representation and one reasoner: less code, uniform behaviour, better answers. It reads our `.sop` files as they are.

**The pilot, validated by the reviewer at commit 09d310f** (in its `compat/psys2/`: our legends through a mapping file, three worlds rebuilt as matrices, run on our own test cases):

| World | Cases passed | Matrix + fns lines | Our `ops.mjs` lines |
| --- | --- | --- | --- |
| kids.shop | 147 of 147 | 71 + 0 | 159 |
| kids.arith | 207 of 217 | 114 + 0 | 237 |
| kids.tasks | 231 of 232 | 18 + 86 | 231 |

It also gives things we do not have: a missing argument asked as a question, a default withdrawn by a later statement, retract as undo, explain, abduction ("what did I pay?"). The ten arith failures are being closed there now (ambiguous ties, soft constraints, division by zero, rounding, "received 2" with an unknown start).

**Read first:** its `docs/integration.md`, `SPEC.md` and `compat/psys2/` (`mapping.sop`, `matrices/`, `run.mjs`, `demo.mjs`).

**Stage 1 (this task): no behaviour change by default.**
1. **Vendor** the built single file `docs/sopworld.mjs` at a pinned commit (start with the current `main`; the library is adding certainty tiers, `describe`, atomic patch checks and relations in its round 3, and will tag 0.5.0 — re-vendor then) into `src/vendor/sopworld/`, with its LICENSE, an entry in the vendor LICENSES notes, and the commit hash. No network at run time. The build copies it for the engine worker (versioned URL like every module).
2. **`src/reasoner/`** — a thin host layer, not a second interpreter:
   - one `World` per dialogue session;
   - our legends loaded through the mapping (copy `mapping.sop` into `worlds/core/` as data);
   - session wires told as they are produced;
   - `core.question` / `core.request` wires answered by `world.query` / actions, with the result turned into our envelope (statuses map 1:1; `refused` → `conflicting` with the reason);
   - `fork()` for dry runs and validation;
   - our step budget passed in as the library's budget (one budget per turn, sites prefixed `sopworld.`).
3. **Per-world opt-in:** a world may ship `matrix.sop` (and a small `fns.mjs` where really needed). Its `world.sop` says `reasoner=matrix`; the default stays `ops`. Bring `kids.shop`, `kids.arith` and `kids.tasks` over from the pilot's matrices (adapt, do not rewrite). Reply wording stays in our templates.
4. **A setting** (Settings › Developer › Reasoner: `ops` (default) | `matrix where available`), plus the same switch in the CLI and the eval runners.
5. **Parity gates, with the switch on:**
   - `test-world kids.shop` 147/147, `kids.tasks` ≥ 231/232, `kids.arith` ≥ 207/217 (every failure listed, linked to the library follow-up that closes it);
   - the operational set, Romanian set and dialogues unchanged for all other worlds, and within the listed failures for these three;
   - ms per turn not worse than `ops` by more than 20% on these worlds;
   - the fault-injection and loop-guard tests still green (the library has its own loop scan: run it on the vendored source in our suite).
6. **Show the gains in the webchat** with the switch on, as browser rows:
   - "add to my list" with no item asks "What shall I put on the list?" and the answer completes it;
   - "I buy a ball" then "three of them" revises the purchase;
   - "undo that" retracts the purchase and the money is back;
   - "why?" after a shop answer gives the explanation from `explain`;
   - "I got 5 lei back for a book, what did I pay?" answers 17.
7. **Report** in `worker-log.md`: the parity table, lines removed if these three `ops.mjs` were dropped, bundle size added (the file is about 110 kB before these features; report the real figure and its gzip size), turn-time comparison, and **a list of what you had to work around**, as issues for the library session (the reviewer passes them on; do not patch the vendored file).

8. **Measure both strategies on the same sets (user, 17:23: "a measurable strategy flag").** `scripts/eval-reasoner.mjs --reasoner ops|matrix` writes one table to `training/RESULTS.md` (section SOPWORLD-1) and `training/results/sopworld1-*.json`, with a column per strategy:
   - **(a) Parity:** operational, operational-ro, dialogues: right / partly / wrong / not understood, for the three worlds and for everything else (which must be identical).
   - **(b) Consistency audit:** after **every turn** of every dialogue and operational case that touches the three worlds, check the world state against the matrix (the library's `check` on the whole state): count turns that leave a violation (negative money, two values for a single-valued key, a dangling reference, a broken bound). Run it for `ops` too, by loading the `ops` session's wires and state into a World: this is the number that shows whether the current code keeps worlds coherent.
   - **(c) Coherence set:** `training/eval/coherence-2026-11-10.jsonl` (30 cases written by the reviewer: 10 per world; kinds: contradiction, missing-arg, default-revision, undo, explain, deduce, abduce, assumption-visible, stale). Each case has `turns`, an `expect` sentence and a `check` object with machine-checkable hints (`final_answer_contains`, `asks_question`, `state_unchanged`, `status`, …). Write the runner so that each hint is checked; where a hint cannot be checked mechanically, print the transcript for the reviewer. Report passed / total per kind, per strategy. The reviewer expects `ops` to fail many of them: that is the point of the comparison. Do not tune the cases; if a case is wrong, say so in `questions.md`.
   - **(d) Assumptions made visible:** how many answers relied on a default or a guess, and in how many the reply said so.
   - **(e) Cost:** ms per turn (p50, p95), bundle bytes (raw and gzip), lines of world code.
9. **What sopworld can and cannot replace, as a table per world** (all 24, not only the three): for each `ops.mjs`, classify its functions as *state and rules* (replaceable by a matrix), *queries and aggregates* (replaceable), *text handling*, *engine / geometry / search*, *reply wording* — with line counts. One page in `docs/` and in the log. This is the map for stage 2.

10. **One SOP Lang (user decision, 18:38).** Rule files and fact files must be the same language. The library is changing its syntax so that `?name` is only a variable and every declaration starts with `@` (its task L1; pattern wires become ordinary `@` wires that a rule names). When its 0.5.0 is tagged:
    - re-vendor it;
    - update `specs/01-soplang.md` to **SOP Lang v1.1** from the library's "The language" section: variables `?name` in value position (legal only in wires that a rule, deny, relation, action or query names), `#` comments, and everything else as v1;
    - make `src/soplang/` parse v1.1 (variables as a fourth value kind `{ kind: 'var', v }`, comments skipped), with the same errors as before for facts that contain variables outside a rule file;
    - `matrix.sop` files are then parsed by **our** parser and handed to the library as wires (the library accepts wires as well as text), so there is one parser in the product;
    - the editor's SOP syntax colouring and the debug view show variables.

    Do not write new matrices in the old `?id type …` form.

**Not in stage 1:** removing any `ops.mjs`, changing the default, other worlds. Stage 2 (after the user sees stage 1): the session memory and question resolution of `src/interpreter/` on the library, then kids.time, kids.animals, kids.shapes, user.profile and the game rules; the engine-heavy worlds keep their engines and move only state and validation.

### COMPUTE-BUDGET — loops and freezes made impossible by construction (user decision, 13:44 local) — P0, before anything else

**What the user decided.** Infinite loops must be prevented on principle, not one bug at a time. Every place where a loop or a repeated computation can happen gets a compute budget, and a computation that ran out of budget is not repeated. The user's tab still freezes on every command with **Reading strategy = Rules only**, so it is not the model. The reviewer cannot reproduce it headless.

The reviewer's measurements (headless Chrome, 4× throttle, rules only) show the turns are far too heavy anyway, even when they finish:
- "fă o casă verde și una galbenă": 6.3 s of main thread;
- "I have two kids": 4.2 s;
- "my favourite color is green": 3.9 s;
- "desenează un soare": 1.6 s.

1. **The engine moves off the main thread.**
   - `DialogSession`, the formalizers, translation, the interpreter and the world operations run in a dedicated module worker, like ORT. The main thread keeps only the UI, speech, rendering of effects and storage.
   - **A turn watchdog** on the main thread: if the worker has not answered within the turn limit (Settings › Developer, default 8 s), the main thread **terminates the worker** and starts a new one from the last committed state snapshot (the state before the turn). It answers "That took too long, I stopped it", and logs the stage and the input.
   - This is the only way to stop synchronous JS. It makes any remaining infinite loop harmless: the page never freezes, and Stop always works.
2. **A deterministic step budget** (ticks, not time), passed with every turn: `budget.tick(site, n = 1)`, throwing `BudgetExceeded { site, ticks }`.
   - **Where:**
     - matcher backtracking;
     - segmentation and expansion enumeration;
     - spelling candidates and corrections;
     - fixpoint loops (normalize, discourse, self-correction);
     - interpreter rule evaluation and inference chaining;
     - planning and tool chains;
     - world operations with searches (placement / free space, layout, arrow routing, untangle, chess search outside Stockfish, map lookups);
     - translator frames;
     - dry runs;
     - the dispatcher's segmentation beam;
     - the normalizer decoding loop.
   - **Per-site and per-turn limits** live in one config, with generous defaults measured as 10× the p99 of the operational set.
   - **Caught at the turn level:** the turn answers with what is complete, or with "That was too complex for me — try a shorter sentence". The site goes to the trace, the phrase log and the debug view.
3. **No repetition.** An input (normalized text + tab + stage) that exceeded the budget, timed out, or crashed the worker is remembered for the session. It is **not** run again by retries, dry runs, the voice end-of-turn check, the normalizer fallback, a worker restart or the next identical message: the stored outcome is reused.
   - Every retry path has a fixed maximum per turn (count the `_formalize` calls per turn, and assert it).
   - There are no automatic re-sends.
4. **Static enforcement.** A test (`tests/loop-guard.test.mjs`) scans `src/`, `worlds/*/ops.mjs`, `docs/webchat/ui/` and `docs/webchat/lib/`:
   - every `while`, `do`, `for (;;)`, a `for` with a non-literal bound over a growing collection, and every self-recursive function must call `budget.tick` or carry a `// bounded: <reason>` comment;
   - a new unguarded loop fails the suite.
   - List the current violations first and fix them all.
5. **Evidence from real browsers.**
   - A `PerformanceObserver('longtask')` in the page records every main-thread task > 200 ms, with the current turn stage, into the phrase log.
   - The worker records its ticks per site per turn.
   - Both are in the phrase-log export, so the user's next export shows exactly where the time went.
6. **Fault-injection tests (browser):**
   - a test-only hook injects an infinite loop in a world operation, in the matcher and in the translator;
   - for each: the UI stays responsive (echo < 100 ms), the turn ends by the watchdog or the budget, the next message works, and the same input is not run again;
   - also with voice (hands-free) on.
7. **Per-turn cost.** After the move, the main thread spends < 300 ms per turn at 4×, and the worker's turn p95 stays as today or better. Profile the 4 heavy turns above and fix the top causes. The repeated whole-state cloning / hashing per turn is a suspect.
8. **Wrong answers seen in the same run** (rules only), to add as dialogues:
   - "I like chess, music and maps" opened two tabs;
   - "I have two kids" drew 2 blue people;
   - "make your eyes blue" on the Drawing tab coloured the eyes of 3 suns;
   - "I am 45 years old" is not remembered as the age.

Done when items 1–6 pass in the browser, the reviewer's probes (`/home/claude/shot/prof.mjs`, `house.mjs`, `gaps.mjs`, `rp5.mjs`) pass with main thread < 300 ms per turn, and a fresh export from the user's browser shows no long task > 200 ms on ordinary commands.

### URGENT-FREEZE — the user's real Chrome on GitHub Pages freezes on every command, typed or spoken (user, 11:54 local) — P0

The user, on https://ml-circuits-research.github.io/psys2/webchat/ (build 2026-11-10T07:32Z, the same as main): any voice command, and the typed "fă o casă verde și una galbenă", spins the fan and blocks the tab. Clearing the phrase log did not help.

**The reviewer cannot reproduce it** with headless Chrome on the same build:
- fresh profile, app defaults (hybrid, encoder, normalizer on), 4× throttle, model loaded: 1.2–1.7 s per message, main thread 1.4–2.1 s per message;
- with a 3.6 MB phrase log: 1.7–3.3 s;
- no freeze, no errors.

So the cause is something the tests do not have. Do now:
1. **Run the real Pages URL** (not a local server) in a non-headless Chrome on the DGX if possible, or at least with HTTP caching and the Cache API as on Pages. Look for:
   - a persisted model from an older sha (Cache API `psys2-dispatcher-model`) or `meta.json 'latest'` mismatched with the new NX outputs (`op_logits`, `tag_logits`, `fetch` option);
   - an old `ui/ort-worker.mjs` from the HTTP cache with the new client (the worker URL has no version, and Pages sends max-age=600);
   - ORT worker restart loops (each restart compiles a 68 MB model: fan);
   - normalizer decoding with no deadline;
   - any synchronous loop on the main thread.
2. **Make every turn bounded on the main thread:** a long task > 500 ms must never repeat back to back. Add a CPU profile to `scripts/soak-webchat.mjs --profile` for typed commands too.
3. **Cache busting:** version the module and worker URLs with the build hash (build-info already has per-file hashes). Version the model cache by sha and output names, and evict a mismatched cache.
4. **A real-profile test:** a browser test that starts from a profile **populated by yesterday's build** (old Cache API model, old settings keys, a non-empty phrase log, profile, ASTRA state), then loads the new build and sends typed and voice commands. It must stay responsive (echo < 100 ms, no long task > 500 ms back to back).
5. Report in `worker-log.md` what the cause was, with evidence (profile, ORT stats).

Also seen: "fă o casă verde și una galbenă" → only "Gata! Am desenat o casă verde." The yellow one ("și una galbenă" = "and a yellow one") is lost. Fix the ellipsis in the translator and the formalizer.

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
- NX8 / NX3b (9ad7072, cc583bc), files match the log: accepted.
  - +19,548 records, every world above 2,000, audit error 0.5%, ~$19.76.
  - A3b alone is better than A3 (operational 64.0% vs 62.6%, Romanian 57.0% vs 50.4%), but gated D is unchanged.
  - **Correctly not published** (NX8 rule 4).
  - **URGENT-FREEZE is now the only priority**: no NX work until it is solved.
- ELLIPSIS (b602889, a7df399), files match the log: validated in Chrome. "fă o casă verde și una galbenă" → green house + yellow house.
  - **But this 2-clause message costs 3.1–3.5 s and 3.7–4.3 s of main thread at 4×** (a single `desenează un soare` costs 1.4 s). Include it in URGENT-FREEZE item 2: profile it and break up the long tasks.
  - **URGENT-FREEZE items 1–5 are not started yet. Do them now.**
- COMPUTE-BUDGET B and C (21e3c2d, 803e212, 23fcf02, c3909ca, 3027821), files match the log: accepted in part.
  - Reviewer rerun: `tests/loop-guard.test.mjs` 2 pass. `prof.mjs` in Chrome (4×, rules only): turns now cost 0.2–0.8 s of wall time (they were 0.8–4.2 s).
  - The wrong answers are fixed: "I have two kids" → "Noted: children, 2."; "I am 45 years old" → noted; "I like chess, music and maps" opens no tabs; the house command draws both houses in 0.77 s (it was 4.0 s).
  - **Still open:**
    - Main thread per turn is 0.5–3.5 s at 4× (first turn 3.5 s, "desenează un soare" 2.4 s, the avatar turn 1.8 s). The target is < 300 ms: that needs item 1 (the engine in a worker).
    - **Item 1 (worker + watchdog that terminates and restarts), item 3 (no repetition), item 5 (long tasks in the phrase-log export) and item 6 (fault-injection browser tests) are not delivered yet. They are the part that makes a freeze impossible; do them next.**
    - "make your eyes blue" still answers "turquoise … I do not have blue" on the robot (RD3 note from yesterday).
    - "my favourite color is green" is only partly understood.
- COMPUTE-BUDGET A (628ff0c, 5b8a345, ca055e7, 0ea8ac4), files match the log: **accepted, with one defect to fix now.**
  - Reviewer run of `scripts/test-webchat-budget.mjs` in real Chrome (2-vCPU host): **46/47**. The three injected infinite loops (operation, matcher, translator) are ended by the watchdog, the page stays responsive, the worker is replaced, and the same input is not run again.
  - **Defect (reproduced twice, `--only stop` gives 3/4):** `stop: the chat works afterwards` fails. The first message after Stop killed a looping worker answers "That took too long, I stopped it." On a slow machine the new worker is still starting (loading and compiling the rules) when the next message arrives, and the watchdog counts that start-up time against the turn.
    - The turn clock must start when the worker is **ready**. While it starts, show "restarting…" and queue the one message.
    - A worker that fails to become ready within a start limit is a different, visible error ("the engine could not restart — reload"), never a silent chain of kills.
    - Start the replacement worker immediately at kill time, and keep it warm.
    - Test this at `--throttle 6`.
  - **Main thread per turn**, in the reviewer's `prof.mjs` (4×, rules, total task time, rendering included): 0.4–2.4 s; it was 0.5–3.5 s. Your long-task numbers are lower because JS self time is ~40 ms and the rest is rendering. Look at what the page renders per turn: the whole message list, the phrase log, the tab canvases of hidden tabs. A plain text reply should not cost 1 s of main-thread tasks at 4×.
  - **Stale library files:** the known limit "a stale library file from the HTTP cache can pair with a fresh worker" is exactly the kind of state the user's browser may be in. Version **every** module URL the worker imports (generate the import list with hashes at build time), so no mixed build can ever load.
- COMPUTE-BUDGET D (657f112), files match the log: **accepted. The freeze cause is confirmed by the reviewer.**
  - The old `names()` regex `/(^|[.!?]\s+)|(\p{Lu}\p{L}+)/gu` loops for ever in Node on "fă o casă verde" (> 1e6 iterations, `lastIndex` stays 0). It ran after every successful on-device translation, so only in a real Chrome with the Translation API: that explains why no headless test saw it and why "Rules only" did not help.
  - `tests/translation-bridge.test.mjs` 5 pass. Fault-injection run here: 54/55.
  - **Still failing (third run): `stop: the chat works afterwards`**: the first message after Stop on a loop answers "That took too long, I stopped it." Fix it as described under COMPUTE-BUDGET A: the turn clock starts when the new worker is ready; test at `--throttle 6`.
  - **Lesson for the loop guard:** the comment on that loop said "bounded: regex exec with the g flag advances lastIndex", which was false. The static test must **refuse** `while ((m = re.exec(s)))` unless the regex provably cannot match the empty string, or the loop bumps `lastIndex` on an empty match; prefer `matchAll`. Audit every `// bounded:` comment written today the same way: a comment is a claim, so each needs a unit test or a tick.
  - **Tests need a fake on-device Translator and LanguageDetector by default** in the browser harness (success path, slow path, wrong-output path), so the code that only runs in real Chrome is always exercised.
- COMPUTE-BUDGET E (86772e8), files match the log: **accepted.** Reviewer run of `scripts/test-webchat-budget.mjs` in real Chrome: **61/61** (the stop-then-next-message defect is gone). COMPUTE-BUDGET items 1–7 are closed on the reviewer's side. Still open from D's review: the loop guard must refuse `exec` loops with possibly-empty matches, every `// bounded:` comment gets an audit, and a fake Translator runs in the harness by default. The user's confirmation on GitHub Pages is pending.
- **User confirmation (17:01):** the freeze on GitHub Pages is fixed. COMPUTE-BUDGET is closed except the three review items from D (exec-loop rule in the loop guard, audit of `// bounded:` comments, fake Translator in the harness).
- COMPUTE-BUDGET F (e569b30), files match the log: accepted. The loop guard refuses unsafe regex loops, there are no `// bounded:` comments left, and the fake on-device Translator is in the harness by default. Reviewer rerun: loop-guard test and the fault-injection browser run (see the next line). **COMPUTE-BUDGET is closed.** Next in order: LANG-FIXED, then SOPWORLD-1.
  - Reviewer fault-injection run after F: 101/102. One marginal miss on the 2-vCPU host: `on-device slow: heartbeat gap < 500 ms` measured 550 ms (0 kills). Find what holds the page for half a second while the slow translator is awaited (it should be idle), or justify the threshold; not blocking.
- SOPWORLD-1 (4af5167, 79d0cf7, 372a87c, f249989), files match the log: accepted. Reviewer rerun: matrix test-world 147/147, 232/232, arith with the listed failures; browser rows 18/18. Per-turn violations 2.8% (ops) vs 0.3% (matrix); coherence 17 vs 19 of 30. Follow-up: SOPWORLD-1b.
- LANG-FIXED (2a3c5db), files match the log: **validated** (reviewer, 20:10; the reviewer missed this commit at 19:05 because it landed inside the SOPWORLD-1 batch). `scripts/test-webchat-language.mjs --throttle 6` in real Chrome: 40/40. With Română selected, every `SpeechRecognition` start is ro-RO across 30 voice turns with English-looking finals, a typed English message, a tab switch, a hidden tab, a worker restart and a reload. The switch commands, the hint button and `recLang` in the phrase log all work. Open, small: "treci pe engleză" is not read as a switch command; add it and the common variants ("schimbă limba în engleză", "vreau în engleză", "speak Romanian please").
- BUDGET-HEARTBEAT (e4aae9f, 98a8527): accepted on the log. The 0.3–0.6 s gap on the first key of every page was the Music tab loading Tone.js; it now loads only when the Music tab is on screen.
- SOPWORLD-1b items 1, 3, 7 (0b8f928, e532e1d, 0015be9, 08b5dc8), files match the log: **accepted.**
  - Reviewer rerun: `test-world --reasoner matrix` shop 147/147, arith **217/217**, tasks 232/232; `scripts/test-webchat-matrix.mjs` in real Chrome 18/18 (it could not run on the DGX).
  - `eval-reasoner` rerun gives the logged numbers: violating turns 2.8% → 0.8% (the 6 are standing soft issues, by design); coherence 17 → 22 of 30 (undo 0 → 3/3, revision 1 → 2/3, abduction 0 → 1/2, explain 0/3 both); dialogues 220/232 both; Romanian 397/452 both (wrong 6 → 8: look at those two in item 2).
  - Seven of the ten workarounds are gone.
  - Continue with items 2, 4, 5, 6 and 10. Item 9 of "Remain" (our parser has no `#` comments) is item 10 (SOP Lang v1.1).
- SOPWORLD-1b item 2 + language switch variants (d0491c7, 26a34fb, b639f9f, 4e66043), files match the log: **accepted.**
  - Reviewer rerun of `eval-reasoner`: **ops** coherence 17 → **24/30** (explain 3/3, revision 3/3, missing-arg 3/3); `scripts/test-webchat-language.mjs` 54/54 in Chrome ("treci pe engleză" and the other variants).
  - **But matrix mode did not get the same fixes: matrix coherence is still 22/30** (explain 0/3, revision 2/3, missing-arg 2/3). The comparison is now ops 24 vs matrix 22, and the gap is only the host features, not the reasoner. **Item 2 must hold in both modes**: the why hooks, the corrections, "I buy something" and the refusal hook must work when `reasoner=matrix` (in matrix mode "why" should use the library's `explain`, which knows the chain). Rerun and report both columns; the coherence set is the measure.
  - The Romanian wrong count rose to 8 in **both** modes (was 6 in ops). Find the two new wrong cases from item 2's Romanian frames and fix them.
- SOPWORLD-1 item 10, SOP Lang v1.1 (f3803aa, be17689, f0f7b93): **accepted.** `specs/01-soplang.md` is v1.1, taken from the library's language reference. Our parser reads `?var` as `{kind:'var'}`, skips `#` comments and keeps `#` inside strings. The matrix files carry comments and are read by our parser. Matrix `test-world`: 147/147, 217/217, 232/232. One language and one parser, as the user decided.
- SOPWORLD-1b items 4 and 5 (bbacb37, 2e73527), files match the log: **accepted.**
  - Reviewer rerun: matrix `test-world` kids.shop 151/151 and games.tictactoe 173/173; `scripts/test-webchat-matrix.mjs` 31/31 in Chrome.
  - Reviewer probe with the switch on: an illegal move is refused with the reason; "why did you play there?" is explained; "undo" takes back the move and the answer; 0 errors.
  - Coherence 25/33 (ops) vs 28/33 (matrix).
  - **Still open before the combined A/B run:**
    - item 2's host fixes in matrix mode (explain is 0/3 in matrix, 3/3 in ops: "why" in matrix mode must use the library's `explain`);
    - the two new Romanian wrongs;
    - "You have 15 lei left." → "Ai 15 lei pleca." (add the reply-table entry: "Îți rămân 15 lei.").

    Then run the combined A/B experiment described in `sop_world_status.md`.
- SOPWORLD-1b item 2 in matrix mode + Romanian wrongs (a76b310, 276e7ce, c5a42ed), files match the log: **accepted.** Reviewer rerun of `eval-reasoner`:

  | | ops | matrix |
  | --- | --- | --- |
  | coherence | 25/33 | **31/33** |
  | turns leaving a violation | 15 (1.9%) | **0** |
  | dialogues | 220/232 | 220/232 |
  | operational-ro | 399/452, 6 wrong | 399/452, 6 wrong |

  **Next: the combined A/B experiment** (`sop_world_status.md`), with transcripts of every differing case. Include the user's real phrase logs (training/eval/real-phrases-2026-11-09*.json and the expectations files), the gold paraphrases, all 24 worlds' `test-world`, turn time p50/p95 at 4× in the browser (`scripts/perf-webchat.mjs` with the switch on and off), and bundle bytes. End with a recommendation on the default, stated with the numbers; the user decides.

- SOPWORLD-1b item 6, full A/B (4c047b0): accepted. Reviewer rerun of `scripts/ab-sopworld.mjs` on coherence, dialogues, gold, real-09c and real-dialogue gives the same differing counts per set (7, 5, 2, 1, 1). Matrix is better in 6 coherence cases, ops is better in 2 wordings (being fixed by agent F), and 11 differences are neutral. The full run takes more than 25 min on the reviewer box. Rerun timing: matrix p50 is 2–5 ms higher in every world group, including groups that do not use the library. This confirms what agent G is hunting. The user decided the default (matrix) through the DGX session.

## RO-MATRIX (reviewer, 2026-11-11 17:05): Romanian replies with matrix as the default

Validated: 1babc11 / dd547be (matrix as the default) and stage 2 (2aca36b, 55b9fb8, e681e49, c14dfe0).
- `npm test`: 1268 pass, 0 fail.
- In Chrome:
  - A fresh load uses matrix.
  - A saved v2 `ops` is migrated to matrix; an `ops` saved at v4 is kept.
  - "I buy the ball" → "OK, you bought 1 ball. I assumed 1 ball."
  - "what did you do?" names its sources.
  - Hangman guess + undo works.
  - 0 console errors.

Found in a Romanian session in Chrome (language = ro, `/home/claude/shot/ro-matrix.mjs` and `ro-ops.mjs`).
1. **Matrix only, regression:** "am 20 de lei / cumpăr o minge / anulează" gives "OK, I took that back: \"I buy a ball\"."
   - The reply is in English, and it quotes the English canonical sentence rather than the user's words. ops answers in Romanian.
   - Every reply the reasoner host layer writes itself must go through the same Romanian templates as the operations' replies: undo ("Am anulat: „cumpăr o minge”."), "I assumed …", the "why"/"what did you do" source lines, refusals, conflicts. Quote the user's own words.
   - Add a check-ro-replies gate in matrix mode that fails on any English reply when the language is ro.
2. **Both modes, pre-existing:**
   - (a) A bare "da" gives "Yes to what? …" in English.
   - (b) "Nu este nimic anula." should read "Nu am ce anula."
   - (c) The "did you mean" line appends the English sentence ("Open the fairy tale story.") under the Romanian one.
   - (d) "deschide magazinul" and "deschide jocul de ghicit" are not understood. The English "open the shop" and "open the guess game" work, so they need Romanian names for these tabs.
3. **Minor:** in games.guess right after "Question 1", "why?" answers the shop's last question. Inside a running game, "why?" should be about the game's last question ("I ask that to split the animals left: …").

Add rows for all of these to the RO regression set in both reasoners.
- PERF b1dc7ef: accepted for non-matrix worlds. Reviewer rerun with `ab-sopworld --sets coherence,dialogues,gold`, p50 in ms, ops vs matrix:

  | world group | ops | matrix |
  | --- | --- | --- |
  | avatar/shell/editor | 15.5 | 16.5 |
  | music/draw/map/charts | 16.7 | 16.9 |
  | documents | 19.4 | 18.8 |
  | other | 17.5 | 18.9 |
  | four matrix worlds | 14.7 | 22.4 |
  | games, now partly on the matrix | 14.5 | 23.8 |

  The remaining cost sits in the matrix worlds themselves, at about +8–9 ms per turn. Profile one kids.shop turn and one hangman turn and say where those milliseconds go: fork, mirror into state, query, or the library's own fixpoint. Reduce them if possible; p95 is unchanged.
  The differing counts grew to dialogues 6, gold 4 and coherence 8, and 6 cases are now "unjudged". dlg.kidsB#016 is still listed as "ops better" after F. Refresh the classes file after F and stage 2, and classify the new cases.
- PERF round 2 (25b7401) and A/B refresh (16f7f2a): accepted. Reviewer rerun, p50 ms, ops vs matrix (this box is slower than the DGX):

  | world group | ops | matrix | before the fix |
  | --- | --- | --- | --- |
  | four matrix worlds | 14.8 | 19.8 | 22.4 |
  | games | 15.5 | 19.4 | 23.8 |
  | other groups | | equal within 1 ms | |

  The three library issues are now Round 5 (P1 cheap complete, P2 copy-on-write detach, P3 batched tells in actions) in soplang-words-lib worker-tasks.md (9fab48c). Re-vendor when that release lands, pinned by commit. Next for this worker: RO-MATRIX (above), then src/interpreter on the library.

## UNDO-1 (reviewer, 2026-11-11 19:45): slice 1 checked in Chrome

Stage 2 slice 1 (a00977e) is accepted as a foundation. `npm test` gives 1268 pass and 1 fail. The failure is `voice-repair.test.mjs:47` ("mcdavatara human" → "make avatar human", expected "make avatar a human"). It passes when run alone, so it is load-dependent: make it deterministic, with no time budget in a unit test.

In Chrome with matrix, undo of a list add and of a purchase now works ("OK, I took that back: …"). ops says "nothing to undo", so this is a real improvement. Found (scripts in `/home/claude/shot/undo-cross*.mjs`):
1. **Matrix only.** In hangman, after one guess, "undo" twice answers "OK, I took back your last guess" both times.
   - The second undo either took back "new game" without saying so, or did nothing and claimed it did.
   - Each undo must name what it took back ("I took back the new game"), or say "There is nothing more to undo".
2. **Matrix only.** The undo history stops at a game. The sequence is: I have 20 lei → I buy a ball → add milk → open hangman → new game → guess → undo, undo. A third undo then gives "There is nothing to undo", although the milk add and the purchase were still undoable. One history across worlds, newest first, is what slice 1 promises.
3. **Both reasoners, pre-existing.** After "remove milk from my shopping list", the question "what is on my shopping list?" is read as "is it on your list" and answered "No, is is not on your shopping list. I understood only part of that: I did not use \"what\"." On a list that was never filled it answers correctly ("Your shopping list is empty"). A removed item seems to leave a referent that hijacks the reading. Add regression rows for every case above.

## WORLDS-APART (user decision, 2026-11-11 19:26): do not put every world into one library World

The user, in his words: it depends on the case, but there is no reason to combine worlds that have nothing to do with each other. Undo can be done another way. There are situations where you want to combine them, and there are needless complications if we force combining them.

What this changes:
1. **Spec 15 stage 2.** Drop the target "one World per session with every world's legend". It is not blocked on fork cost; it is not wanted. Rewrite that design bullet to match.
2. **Combine only by declaration.**
   - Worlds share one library World only when they really share facts. Example: kids.arith reads the money of kids.shop, and both use the agents.
   - The sharing is declared in world.sop (an import or a `shares=` list) and is never automatic.
   - Every other world on the matrix gets its own small World, forked on its own and loaded lazily when the world is first used.
3. **Undo across worlds without one World.**
   - The session keeps a short history of turns, each entry being {world, how to take it back}. The how is either the mark of that world's library World or the dialogue snapshot for engine worlds.
   - "undo" takes back the newest entry, whatever world it belongs to, and says which one.
   - This also fixes UNDO-1 item 2: the history stopped at a game.
4. **Keep `Memory`** as the reader's view for worlds that are not on the matrix. Move a world to the library only when it gains something there (rules, denies, defaults, derived facts), case by case, as in stage 2 so far.

Write the change in spec 15 and in worker-log.md, then go on with RO-MATRIX and UNDO-1.
- **WORLDS-APART, concrete grouping (user, 19:26): one instance per tab, plus one combined instance for the worlds that only answer in the conversation.**
  - **Conversation instance, one per session.** Members: world.core facts (the user, the people named, their names), kids.common, lang.common, kids.shop, kids.arith, kids.tasks, kids.time, kids.animals and kids.shapes. They talk about the same people and things, so "Ana has 5 lei, she buys…" or "how many does she have now?" must see one another's facts.
  - **One instance per game,** each its own World: games.tictactoe, games.hangman and games.guess. They share no facts.
  - **Tab worlds with engines** (chess, draw, charts, map, documents, music, diagram, avatar) stay as they are. Each gets its own instance only if it moves to the matrix later.
  - **user.profile has a tab but holds the user's facts.** Its facts belong to the conversation instance, and its tab reads them from there.
  - **Every instance can read the conversation instance's agents** (the user's name, the people named), so a name told once is known in every tab. Read only: a tab never writes into another instance.
  - **"undo"** uses the session history across instances (item 3 above).

## Stage 2, kids.time / kids.animals / user.profile (reviewer, 2026-11-11 20:15)

Accepted (e2bbb21, 02ed556, 3abe7d3). `npm test` 1275 pass, 0 fail. The log says the work goes to per-world instances, as WORLDS-APART asks.

In Chrome (`/home/claude/shot/stage2b.mjs` and `stage2b-ops.mjs`), matrix is better than ops on three things:
- "it is 25 o'clock" is refused with the reason; ops accepts it.
- "undo that" forgets the told day and the taught penguin fact; ops says "nothing to undo".
- After the undo, "can a penguin fly?" gives a clean "No". ops reports conflicting information.

Found, all present in **both** reasoners unless marked:
1. **Matrix: Romanian replies.** In a Romanian session, "e ora 25" is refused in English ("That does not add up. That is not an hour on a clock: 25 o'clock."). Add it to RO-MATRIX item 1: every refusal or deny text needs its Romanian template.
2. **The new profile deny does not reach the chat.** "I am 300 years old" gives "I did not quite catch that." Either the reading fails before the deny, or the deny reason is lost. The log says denies were added for an impossible age, so show the reason ("No one is 300 years old. …").
3. **"how old am I?" is not understood** right after "I am 8 years old". The reply suggests "I am 34 years old.", and the 34 comes from nowhere.
4. **Romanian profile:**
   - "am 8 ani" and "mă numesc Ana" are answered in English ("8 years old, noted.", "Ana, lovely to meet you.").
   - "câți ani am?" is read as "how many legs on a years".
   - "cum mă numesc?" is not understood.

   Move these to RO-MATRIX item 2 (pre-existing) and add regression rows for both reasoners.

## One library World per world (reviewer, 2026-11-11 20:50)

36af909 is accepted, and it follows WORLDS-APART: instances are lazy, `reads=` is declared, and no world gets every legend.
- `npm test`: 1276 pass, 1 fail. The failure is the same flaky `voice-repair.test.mjs` "mcdavatara human" (UNDO-1 item 4, still open).
- In Chrome, shared facts work: "my name is Ana" → shop → tic-tac-toe → "what is my name?" answers "Your name is Ana", and "Ana has 3 apples / she eats 1 / how many" gives 2.

**The session undo timeline does not reach the user yet** (`/home/claude/shot/undo-cross.mjs`, `shared.mjs`). UNDO-1 items 1 and 2 are unchanged:
- Hangman: after one guess, "undo" twice says "I took back your last guess" both times. A third "undo" gives "There is nothing to undo", although the milk add and the ball purchase were before it, and money stays at 15 lei.
- Tic-tac-toe: after a move, the first "undo" is right. The 2nd and 3rd say only "OK, I took that back." without saying what, and money stays at 15 lei, so the purchase was not taken back. **An undo that says it took something back must name it, and must actually change something.**

Check: the engine-backed games (hangman's and tic-tac-toe's own undo) answer "undo" before the session timeline sees it. When the game has nothing left to take back, "undo" must fall through to the timeline.

Add `undo-cross.mjs` and `shared.mjs` as Chrome scenarios with expected replies.

## RO-TRANSLATE-FALLBACK (user, 2026-11-11 21:14): use the translation API when a Romanian message or reply goes wrong

The user, in his words: even if the session is in Romanian, when the system detects such cases it may use the translation APIs to get clean English.
The selected language still decides what the user sees and hears (LANG-FIXED is unchanged). The translator is only a fallback path inside the turn.

1. **Input.** When a Romanian message is not understood, or only partly understood, translate it RO→EN with the on-device Translator. "Not understood" means "Nu am înțeles…", "I took that as: …" with a nonsense reading, a part not used, or a low-confidence reading. Then read the clean English with the English rules. Use the reading only if it succeeds and passes the existing checker (numbers, names, negation, question form, in `ui/translation.mjs`).
   - Cases from today that must pass this way: "câți ani am?", "cum mă numesc?", "deschide magazinul", "deschide jocul de ghicit", "e ora 25".
2. **Output.** Any reply that would reach a Romanian session in English gets the same treatment. This covers a missing template, a host-layer string, or a refusal text. The reply is translated EN→RO with the Translator and passed through the checker. If no template exists and the translator is unavailable or fails the checker, use the rules translator. **Never show English text in a Romanian session.**
   - Examples: "8 years old, noted.", "Ana, lovely to meet you.", "That does not add up…", "OK, I took that back…", "Yes to what?".
3. **Order.** Romanian templates and rules first. The translator is the fallback. Every reply that needed it is logged, so missing templates can be added later; it does not replace adding them.
4. **Bounds.** Keep the existing HANG3/COMPUTE-BUDGET rules: a deadline on every translator call, never waited on in the engine worker beyond the turn budget, and a clean fallback when the Translator is absent (headless, unsupported browser). Record the route in the trace and in the phrase log: `via: 'translator-in' | 'translator-out' | 'rules-translate'`.
5. **Measure.** Run `check-ro-replies` and the RO regression set before and after, with the fake on-device Translator of the harness, in both reasoners. Report how many Romanian messages are now understood, how many English replies remain (target 0), and the added p50/p95 time on the turns that used the translator.

Do this together with RO-MATRIX. Item 2 is the safety net for every RO-MATRIX template still missing.

## RO-MATRIX (686e2dd): accepted (reviewer, 2026-11-11 21:50)

`npm test` gives 1299 pass, 0 fail. In Chrome, in a Romanian session with matrix (`ro-matrix.mjs`, `stage2b.mjs`), every reply is Romanian:
- "Am anulat: „cumpăr o minge”."
- "Nu se potrivește. Asta nu este o oră de pe ceas: ora 25."
- "8 ani, notat."
- "Nimeni nu are 300 de ani. Ai vrut să spui alt număr?"
- "câți ani am?" → "Ai 8 ani."
- "cum mă numesc?" → "Te numești Ana."
- "deschide jocul de ghicit" → the Guess tab.
- A bare "da" outside a game gets a Romanian reply.

In English, "how old am I?" → "You are 8 years old."

Small notes, no separate task; fold them into RO-TRANSLATE-FALLBACK:
- (a) "OK, am uitat ce este zi azi." should read "ce zi este azi".
- (b) "deschide magazinul" opens the shopping list. That is acceptable, but check whether a shop tab was meant.
- (c) The quotes are ASCII `"…"`. Romanian uses „…”, as in the undo reply.

Still open: RO-TRANSLATE-FALLBACK (the translator as a safety net) and UNDO-1.

## Wave 1: docs.editor + docs.reader (reviewer, 2026-11-11 22:10)

Accepted (d70591e, c7ec844, 1590826). `npm test` gives 1314 pass, 0 fail. The report is honest: 0 lines of ops.mjs deleted, and matrix is about 1.2–1.4 ms slower per turn in both worlds. The library ideas are now Round 6 R6.4–R6.12 in soplang-words-lib (b7c2d9b).

In Chrome (`/home/claude/shot/docs-probe.mjs` and `docs-probe-ops.mjs`), matrix equals ops except:
- **(+)** "undo" names the change: "the heading \"Plans\" you added is gone".
- **(−)** "read sentence 900" lost the document's title: ops says "\"Hansel and Gretel\" has only 66 sentences.", matrix says "There is no sentence 900; the document has 66 sentences." Keep the title.

Both modes, pre-existing:
- "deschide documentele" opens the **Editor** tab instead of Documents.
- In Romanian, "citește propoziția 900" gives a vague "Nu este nicio propoziție acolo." The English reply says how many sentences there are.

The goal set by the user is at least ops's speed. Docs is not there yet, so list in the per-world row what would close the gap: P2 and P3 of Round 5, and R6.12.

## RE-VENDOR sopworld at 89bf69d (reviewer, 2026-11-11 22:15)

The library's Round 5 (0.6.2) and R6.1–R6.3 are validated: 213 tests, the pilot unchanged, no host names in `src/`.

What is new for us:
- **P1.** `complete()` with nothing changed takes 0.006 ms, and there is a public `canComplete()`. Replace our private `world._compiled().slots` test (`_mayFill`) with it.
- **P2.** A fork or mark followed by its first change no longer copies the world: 0.02–0.06 ms at any size.
- **P3.** The tells of an action propagate once. `ctx.flush()` and `tell(x, { now: true })` keep the old per-tell check where an action needs it.
- **R6.1.** A slot declared `many` answers all its values in value mode. This unblocks kids.animals: lives, covered, describe.
- **R6.2.** `query` has `mode=check` ("is a whale a fish?"): it answers yes, or no with the actual value.
- **R6.3.** Supposed answers carry `from` and `via`, and deny reasons can carry values.

To do:
1. Vendor the built file at commit **89bf69d** (record the hash and build id in `src/vendor/sopworld/`; no tag).
2. Run `npm test`, `test-world all` in both reasoners, `ab-sopworld --sets coherence,dialogues,gold`, and `bench-reasoner`. Report p50 per world group before and after: the goal is to close the matrix gap in the docs and matrix worlds.
3. Then move what R6.1 and R6.2 unblock in kids.animals, and remove the host workarounds the new APIs make unnecessary.

## UNDO-1 + WORLDS-APART grouping: accepted (reviewer, 2026-11-11 22:35)

Commits: fca2b67, 833469c, f1ff3a6, 1a09702. `npm test` gives 1327 pass, 0 fail. The voice-repair test is now deterministic: its bounds count work, not wall-clock time.

In Chrome (`undo-cross.mjs`, `shared.mjs`, `undo-cross3.mjs`), every undo now names what it took back, in order, across worlds:
- the guess
- the new game
- the milk add
- the ball purchase (money back to 20)
- "I have 20 lei"

The tic-tac-toe sequence is also right: the move, then the new game, then "she eats 1 apple". "what is on my shopping list?" after a removal now answers that the list is empty.

Still open: RE-VENDOR at 89bf69d (or at the end of the library's Round 6, see below), RO-TRANSLATE-FALLBACK, and the docs finding (the title is missing in "read sentence 900").

## Wave 2: geo.map + data.charts (reviewer, 2026-11-11 22:55)

Accepted (6975928). The report is honest: about 10% of the map's ops.mjs is replaced by rules and none of it is removed; the 1,250-place kb is kept out of the wires (37 ms against 6 ms); matrix is +6% per turn.
- The library ideas are now Round 6 R6.13–R6.17 (573e2c1). Copy-on-write cost and redo were done in the library's Round 5 and R6.8. **After the re-vendor, measure the kb as wires again**: P2 may make it affordable.
- In Chrome (`/home/claude/shot/map-charts.mjs matrix|ops`), matrix and ops give identical replies, EN and RO.
- The duplicate-label deny is a real gain.

Both modes, pre-existing; add these to RO-TRANSLATE-FALLBACK:
- "cât de departe e Parisul de Roma?" is answered in English.
- "care e cel mai mare?" gives "Pears is the biggest, with 5.": English, and the label is not the user's word ("pere").
- "o bară grafic" should read "un grafic cu bare".
- "show Atlantis" gives "I did not understand…". An unknown place should be said as one: "I do not know a place called Atlantis."

`npm test` result is below.
- npm test: # pass 1341
- npm test: # fail 0

## RE-VENDOR: use sopworld 0.7.0 at 72a96dd instead of 89bf69d (reviewer, 2026-11-11 23:00)

0.7.0 is validated (224 tests, pilot unchanged, benches below). It contains everything in 89bf69d plus R6.4–R6.12:
- `kind=blob`: for the docs analysis.
- Refusal `vars` and registered filters: for "has two" and "third".
- `core.aggregate` with `default=` and `by=`: remove the five copies of the editor's count rule.
- `core.rank`: for "the 2nd chapter".
- `transient` types and `world.redo()`: replace the host's `isView` and `redo=`.
- `applyPatch` replace in place: no more `x.r1` ids.
- Text functions in checks: `matches`, `startsWith` and the like.
- Hypothetical questions: `check` with an overlay.
- Unread keys are not propagated.
- Rewind is flat with world size.
- `complete({ defaults })` is 8× faster.

Library benches: fork + first tell 0.02 ms at any size; rewind 0.015 ms; 70 action tells 0.8–1.8 ms; 150 defaults 20 ms.

1. Vendor the built file at **72a96dd**, recording hash and build id. No tag.
2. Run `npm test`, `test-world all` in both reasoners, `ab-sopworld --sets coherence,dialogues,gold` and `bench-reasoner`. Report p50 per world group before and after. **The question is whether the matrix gap closes** (four matrix worlds +5 ms, games +4 ms, docs +1.2–1.4 ms).
3. Replace the host workarounds the new APIs cover, as listed above. Measure the map's kb as wires again; R6.13 fact providers (1fdbab0, not yet in a release) will be the alternative.

## Answer to Q1 (ten library proposals) + RE-VENDOR 0.7.1 + namespaces (reviewer, 2026-11-11 23:35)

**Most of Q1 is already in the library.** The numbers in Q1 were measured on the vendored 0.6.1. sopworld 0.7.0 and 0.7.1 are validated by the reviewer. Per proposal:
1. **Structural sharing.** Done: P2 copy-on-write layers. fork + first tell takes 0.02 ms at 60, 600 or 6,000 wires; rewind takes 0.015 ms, flat. Re-measure geo.map with its kb as wires, the avatar kb, and "all legends in one World" after the re-vendor.
2. **External facts.** Done in R6.13: `new World({ facts: { type: provider } })`, matched like wires and never copied. Bench: a large table builds in 1.6 ms against 58 ms, snapshot 1 kB. Replace `kb=lookup` with it. For "member of a many-valued wire", use R6.1 `many` plus a check.
3. **Undo/redo.** Partly done: `transient=true` types and `world.redo()` (R6.8). Labelled marks, `rewind({ only })` and a timeline saved in `toJSON`/`fromJSON` are now R7.1 in the library. Until then, the host's restart regression is yours to fix: save the timeline with the state.
4. **Aggregates.** Done: `core.aggregate default= by=` (R6.6), `core.rank` (R6.7), `ties=all` (R6.17). Lists in reasons and distinct anchors are R7.4.
5. **Multi-valued answers.** Done: `many` slots answer lists in value mode (R6.1), and `mode=check` (R6.2). Move kids.animals.
6. **Refusals.**
   - Done: `violations[i].vars` and registered filters (R6.5).
   - In the library's Round 7: deny priority and `why=` on slot violations (R7.2), `kind=ref` and `unique=true` (R7.3).
7. **Value kinds.** Done: `kind=blob` (R6.4), `kind=json` with paths (R6.15), replace in place in `applyPatch` (R6.9). Drop `chess.g_1`-style revisions and JSON strings.
8. **Cost control.** Unread keys skip the rules pass automatically (R6.12; bench 2.7 ms against 13 ms). Lazy rules are R7.5 and pure actions R7.6.
9. **Expressions.** `matches`, `startsWith`, `lower`, `abs` and `min` exist (R6.10). `between`, `sign` and `clamp` are R7.7. Whether `expr=` enters SOP Lang v1.2 is a language decision: the library will propose it, and the user decides.
10. **Host API.** Done: `canComplete()` (P1), per-key assumptions told by the host (R6.16, "I assumed a bar chart"). `assumptions(ids)` and a stable change stamp are R7.8.

**To do now, in this order:**
1. **RE-VENDOR sopworld 0.7.1 at 93362d7.** This replaces both 89bf69d and 72a96dd. Run `npm test`, `test-world all` in both reasoners, `ab-sopworld --sets coherence,dialogues,gold` and `bench-reasoner`. Report p50 per world group before and after. **The question is whether the matrix gap closes.**
2. **Remove workarounds per world.** Use the APIs above. Report the per-world rows again, with lines of host code removed and time. Where a world still loses to ops, file it as a library item with a minimal repro, as you did.
3. **Namespaces (user decision, 23:12).** The library will add fact namespaces (R7.9: qualified ids per instance or per tell, references local first, merges only within a namespace, `exports=`, an ambiguity warning). On our side, prepare now: give each world instance its namespace, prefix the ids generated per turn with the turn, so two requests can never merge facts, and declare `exports=` for what `reads=` uses (kids.shop for kids.arith). Implement it when the library releases R7.9.
4. Continue RO-TRANSLATE-FALLBACK and the open small findings (docs title, unknown place, RO notes).

Q1 is answered; remove it from questions.md.

## FORMALIZE-FROM-WORLDS: experiments for the morning decision (user, 2026-11-11 23:21; no default changes)

The user's priorities, in his words: less code and speed are secondary, unless it is disastrously slow. What matters is coherence and a better ability to guess the user's intent. He wants the rules that formalize language to rest on the state of the world and on the world's schema, and to look at this better now that so many worlds are formalized. Perhaps the library should do formalization from the worlds' schemas and the worlds it currently manages. Training worlds means memorization and generalization. If we know which tools we have, we should be able to generate the natural-language formalizers from the library, that is, generalize them. The gap is that we have no formal or semi-formal description of the tools yet. He decides in the morning, from data. Do these as experiments behind a flag, with results in `training/results/` and a section in `sop_world_status.md`.

**E1: Error audit of the current formalization.**
- Scope: every non-right case of `eval-operational --mode rules` and of `--mode encoder+n1` (shipped), on operational, operational-ro, dialogues, gold paraphrases, loose-words, typos and the real phrase logs.
- Classify each case by cause:
  - (a) a word is missing from the lexicon;
  - (b) a structure no pattern covers;
  - (c) ambiguity that the **state** resolves (only one referent exists, only one action applies in the open tab, one reading contradicts the facts);
  - (d) ambiguity that the **schema** resolves (slot type, enum, range, required arguments);
  - (e) intent that must be guessed (implicit object, ellipsis, follow-up);
  - (f) Romanian-specific;
  - (g) the expectation is wrong.
- Output: a table per world and per set, plus 5 examples per class.
- Reviewer's baseline in rules mode (RESULTS.md): EN 1,239/1,296 right; RO 2,037/2,480 right, of which 334 are not understood.
- The question for the user: what share of errors is (c)+(d)+(e), i.e. what world-aware reading could fix.

**E2: State-guided choice among readings, guessing intent from the world.**
- For each message, collect the candidate readings: rules top-k, the dispatcher's top-k, the translator route in Romanian, and the dialogue layer's follow-up readings.
- Score each one with the world instances, without telling anything (sopworld 0.7.x: `check` with an overlay, `query`, `canComplete`). Criteria:
  - consistent with the facts;
  - refers to entities that exist;
  - required arguments fillable from state or defaults;
  - the action is available in the open tab;
  - fewest assumptions.
- Pick by a fixed, documented order, with no learned weights yet.
- Measure right, wrong and not-understood against the shipped mode on the same sets, and list every case that changed, both gains and losses.
- Gate: no new wrong answers. A wrong answer is worse than not understood.

**E3: Semi-formal tool descriptions, and patterns generated from them.**
- Each world already has most of a description: `legend.sop` (types and slots), `lexicon.sop` (words), `operations.sop` (inputs, outputs, doc, semantics), `matrix.sop` (rules, denies, required arguments and asks), and examples in `patterns.sop`.
- For 3 worlds (kids.shop, geo.map, docs.editor), write down what is missing to make one complete description per operation:
  - argument roles;
  - the words for the action and for each argument, in EN and RO;
  - preconditions as denies;
  - effects.

  Use SOP Lang only, one language.
- Write a generator from those descriptions to patterns, EN and RO.
- Compare the generated patterns against the hand-written ones on the eval sets: coverage, right, wrong. Count the lines of hand-written patterns it would replace.
- Report what a description needs that we do not have, and how much of it can be derived automatically from the existing files.

Order: E1 first (it decides where the effort pays), then E2 and E3 in parallel. Keep RO-TRANSLATE-FALLBACK and the re-vendor of 0.7.1 going; E2 needs 0.7.1.
- **Reviewer's first pass for E1 (23:55, rules mode, current main).** Use it as a starting point; verify and extend it.
  - **Romanian.** 2,480 messages: 81.9% right, 3.1% wrong, 13.1% not understood. **351 of the 449 non-right RO cases have an English source case that is right**: 281 not understood and 59 wrong. So 78% of the Romanian errors are reading-only; the world already handles the English. Top worlds: ui.avatar 63, kids.tasks 31, ui.shell 27, tictactoe 24, art.draw 22. This bounds what the translator route (RO-TRANSLATE-FALLBACK) or generated RO patterns (E3) can win: up to about +14 points.
  - **English.** 1,296 messages: 95.4% right. The 57 non-right cases, classified by hand from `--replies`:
    - about 30 compound messages, two requests in one, segmented wrongly. "what do red and yellow make" fails only inside compounds.
    - about 11 routed to the wrong world or tab, where the open tab or the known entities would have decided. Examples: "put it in the top right corner" in draw is played as a tic-tac-toe move; "change the instrument to flute" goes to the document; "colour Spain in" goes to draw; "center and what is 3 times 3" goes to the document; "add milk … and also can penguins fly" creates a "fly" list.
    - about 6 follow-ups or ellipsis ("no, a red one", "no, sections", "make it yellow").
    - 3 "X then undo" in one message.
    - about 4 missing words (dragon, grill, siren).
    - 2 typos.

    So in English, about 17 of 57 are of the (c), (d) or (e) kind that E2 targets, and about 30 are segmentation.
  - Add a class (h), **segmentation of compound messages**. E2 can help there too: score the alternative splits against the world.

## Waves 3 and 4: games.chess, media.music, art.draw, diagram.sketch (reviewer, 2026-11-12 00:00)

Accepted. `npm test` gives 1375 pass, 0 fail. The rows are honest: 0–8% of ops.mjs replaced, and matrix is +2–4 ms per turn on the vendored 0.6.1. The re-vendor of 0.7.1 should be measured here first.

In Chrome (`/home/claude/shot/w34.mjs matrix|ops`, diff of the two runs), matrix equals ops except for two things:
- The engine's random reply to "e4" differs between the runs. That is neutral.
- **A small loss in matrix.** Chess "undo" drops "We are back at the start." Keep it.

Both modes, pre-existing. Put these in RO-TRANSLATE-FALLBACK or the E1 audit:
1. "open draw" is not understood in English, while "deschide desenul" works.
2. In Romanian, the engine's chess replies are English ("I play pawn to e6. Your move.").
3. "Ești alb și mutare prim" should read "Ești cu albele și muți primul".
4. The music title is mangled in Romanian: "Twinkle, Twinkle, stea". Song titles should stay as they are, or use a known Romanian title.
5. "connect Start to End" when End does not exist gives "A connection needs two ends, e.g. …". It should say "There is no box called End. Shall I add it?". This is a state-aware reply, an E2 case.
6. "delete the dragon" in draw lists things that are not in the picture ("the car, the sky, the grass"). It should list what is there. This is also state-aware.

## Wave 5: ui.shell, ui.avatar, ui.help + the verdict (reviewer, 2026-11-12 00:20)

Accepted (0d6a789, 477328f, dbca342, the rebase fixes, cc28209). `npm test` gives 1392 pass, 0 fail. The verdict in sop_world_status.md is honest and matches what the reviewer measured:
- correctness is equal or better everywhere;
- matrix is slower by 1–3.6 ms on the vendored 0.6.1;
- no custom code has been replaced;
- understanding is not improved, because the formalizer is the same in both modes.

That last point is exactly what the user's new direction (FORMALIZE-FROM-WORLDS) addresses. It is now the priority, after the re-vendor of 0.7.1.

In Chrome (`/home/claude/shot/ui.mjs matrix|ops`, diff), matrix equals ops except for:
- **(+)** "open the dragons tab" → "There is no dragons tab." In Romanian, "Nu există nicio filă „dragons”" is better than ops's "Nu știu o filă chema dragoni".
- **(−)** That Romanian reply quotes the English word "dragons", not the user's "dragoni". Quote the user's words, as the undo replies do.
- **(neutral)** The avatar undo lost its "Ta-da!".

Both modes, pre-existing. Add these to E1; they are intent cases:
1. **WRONG.** "fă părul roșu" is read as "make it red": the body turns light red and "părul" is dropped. The English "make the hair red" correctly offers to switch to the person. A wrong state change is worse than not understood. With E2, the reading that drops a word should lose to one that uses every word.
2. "ce poți face pe hartă?" is answered in English.
3. "înapoi" gives "Nu este nicio filă anterioară merge înapoi la." (garbled).
4. "switch to klingon" is not understood. It should be refused with the languages we have; ui.shell has the kb for that now.
5. "give it a hat made of cheese" is not understood. It should say what a hat can be.

## RE-VENDOR: sopworld 0.8.1 at 23f81b0, which supersedes 0.7.1 (reviewer, 2026-11-12 00:40)

Validated: 242 tests, pilot unchanged, fork + first tell flat at 0.015–0.03 ms. It contains everything in 0.7.1 plus:
- **Namespaces with `::`** (`shop::b1`, `$other::x`, `$::x` for the default namespace; docs/language.md section 12 "Scope").
- **Undo timeline.** Labelled marks, `marks()`, rewind of one unit, and the timeline kept in snapshots. This fixes the watchdog-restart regression: carry it through `toJSON`.
- **Refusals.** Deny `priority=`, and slot reasons with variables and filters. Use them instead of the regex ranking in chess.
- **Integrity kinds.** `kind=ref to=` and `unique=`: replace the hand-written integrity denies in draw and diagram.
- **Lists and anchors.** Lists in reasons (`?xs:` with a registered joiner), and `by=` as a distinct anchor.
- **Lazy rules** (`lazy=true`): cheap turns, expensive questions. Try it for chess's attack lines, measure both sides, and keep it only where questions are rare.
- **Small functions:** `between`, `sign`, `clamp`. Use them for chess "strictly between". There is no `expr=` (decided).
- **Host API:** `assumptions(ids)`, and `world.version`, which forks and no-op statements keep. Replace the private reads.
- **`world.score(candidates)`**, the read-only scoring for E2, with the design in docs/design/formalization.md.

Order:
1. Vendor at **23f81b0** and run the gates: npm test, test-world all in both modes, ab-sopworld coherence/dialogues/gold, bench-reasoner. Report p50 per group before and after.
2. **E2 with `world.score`.**
3. Remove workarounds per world, then the namespaces on our side: one namespace per instance, and per-turn prefixes for the ids that turns generate.
4. E1 and E3 as written.

## RESTORE-1 accepted; note for the re-vendor (reviewer, 2026-11-12 00:55)

RESTORE-1 is accepted: `npm test` gives 1398 pass, 0 fail, the restart-undo Chrome scenario is in the suite, and the record is 48 KB with a 58 ms restore.

**Your log of 00:23 still says "re-vendor 0.7.1". Use 0.8.1 at 23f81b0 instead** (see the RE-VENDOR block above, 00:40). 0.8.1 R7.1 keeps labelled marks and the timeline in the library's snapshots. After the re-vendor, replace RESTORE-1's use of `world.log` and `World._replay`, and the hand-rebuilt marks, with the library's snapshot and restore. Keep the restart-undo test as the gate.

## E1 accepted (reviewer, 2026-11-12 01:10)

ba00f9e is accepted. The audit is careful: each case says how it was classified (mechanical, pairing, inspection, elimination), and the human overrides are in a file. It agrees with the reviewer's first pass: Romanian 349 of 451 have a right English source; the English core is 75.6% c+d+e+h in rules mode.

**What it changes for E2 and E3** (the reviewer's reading; the user decides in the morning):
1. **Wrong answers are the bigger problem.** In the shipped mode, gold-para has 36 wrong out of 100, loose-words 153 wrong out of 665, typos 153, operational-ro 83 and dialogues 30. A wrong answer is worse than "not understood". So the first job of E2 is a **veto**: a reading that fails `world.score` (inconsistent, refers to nothing that exists, drops content words, its action is unavailable in the open tab) becomes "not understood" or a clarifying question instead. Report the wrong → not-understood moves and the right → not-understood losses separately, per set.
2. **Then choice.** In the English core, the headroom on top of encoder+n1 is e (43) and c (15). Score the alternative readings and the follow-up readings.
3. **Romanian goes to the translator route and E3,** not to E2: 224 cases translate into in-vocabulary English that the rules do not read, and 125 leave words untranslated. For E3, also generate Romanian patterns directly from the tool descriptions plus `core.word` (now in the library's Round 9), and compare against the translator route on the same 349.
4. **gold-para b (34 in rules, 23 in encoder+n1)** are paraphrases no pattern covers. They are the test that generated patterns (E3) must pass: report E3 on gold-para by name.

## RE-VENDOR target is now sopworld 0.9.0 at f062052 (reviewer, 2026-11-12 01:25)

0.9.0 is validated: 250 tests, pilot unchanged. It contains 0.8.1 (namespaces `::`, timeline in snapshots, `score`) plus the reader core: `core.word lang= text= means=`, `world.interpret(frame)`, `rank(scored)` with a documented order and an explanation per place, splits of one message into compound candidates, and `world.examples(lang, templates)`.

Its default order puts **words left out before assumptions**. That is the "fă părul roșu" fix in principle: a reading that drops "părul" loses.

Vendor **f062052** instead of 0.8.1. The rest of the RE-VENDOR block applies unchanged. For E2, use `score` and `rank` from the library rather than a host-side ordering, and report where the library's order and yours disagree.

## E3 accepted as an experiment; three corrections before it grows (reviewer, 2026-11-12 01:45)

8bfe5a4 is accepted. The report is honest and the result is real:
- kids.shop is at parity from 127 lines of description, against 2,936 lines of hand-written patterns.
- geo.map reaches 99% of the hand-written result, docs.editor 91%.
- Every loss is traced to a description gap: missing variants and words.
- The `add` mode changes nothing in English, so generation adds no coverage today. The gain is the source of the patterns, not more coverage.

Before more worlds are described:
1. **One language: no mini-grammar inside strings.** `arg="i2:lex.kids.shop.items?*n2;prep=and|plus"` packs a second notation into a value. In it, `?` means "optional", while in SOP Lang `?` means only a variable. That is exactly what the user ruled out. `:`, `;`, `*` and `|` also get meanings of their own. Language decisions are delegated to the reviewer under the user's rule, and the decision is: **express it as wires and keys.** One `core.describe.arg` wire per argument, with `of=$describe…`, `name=i2`, `class=lex.kids.shop.items`, `optional=true`, `qty=n2`, `prep=and` (repeated key for alternatives: `prep=and prep=plus`), `unit=lei unit=leu`, `open=true` for the open classes of point 5. A repeated key is SOP Lang's existing way to give several values. Do the same for `verb=` / `rest=` lists, where the `|` alternatives become repeated keys. Same generator, no new notation. Write it in spec 03 section 2c.
2. **Use the library's words.** sopworld 0.9.0 has `core.word lang= text= means=` (Q17), with `interpret`, `rank` and `examples` built on it. Make the description words `core.word` wires (`lang=en`, `means=kids.shop.purchase`, or `means=<op>.<arg>`) instead of a host-only key, so the same words feed the generated patterns, the library's `interpret`, and E2's scoring. Report anything `core.word` cannot carry.
3. **Romanian: a decision for the user.** The report keeps Romanian out because AGENTS.md says everything in a world is English and Romanian enters through the translator. The user's direction last night was to generate the interpreters from the tool descriptions, and E1 says 349 Romanian errors are reading-only. Prepare, as a measured proposal without changing AGENTS.md:
   - the same descriptions plus `core.word lang=ro` wires kept in a language pack outside the worlds (e.g. `lang/ro/<world>.sop`);
   - the generator producing Romanian patterns from the frames, with Romanian frames for word order, articles and the "cât costă" forms;
   - a run of the 349 E1 f-cases for kids.shop, geo.map and docs.editor through generated RO patterns against the translator route.

   The user decides in the morning whether worlds may have Romanian words in a pack.

Order unchanged: RE-VENDOR 0.9.0, then E2 (veto first), then these E3 corrections.

## RO-TRANSLATE-FALLBACK accepted, with four leftovers (reviewer, 2026-11-12 02:05)

Accepted (7faf375, 69a1256, 79063eb). `npm test` gives 1415 pass, 0 fail. The measure (oracle upper bound) is honest:
- Romanian right 81.8% → 88.6%;
- wrong 78 → 53;
- English shown 311 → 0.

In Chrome (`ro-matrix.mjs`, `ui.mjs`, `w34.mjs`, `map-charts.mjs`), Romanian quotes and the user's own words („dragoni”), the chess engine lines, song titles, "ce poți face pe hartă?" and "Ești cu albele și muți primul" are all fixed.

Leftovers:
1. **An English word still leaks:** "care e cel mai mare?" gives "Perele sunt biggest, cu 5." The "no English words left" check must catch single English words inside a Romanian sentence. Use the rules translator's English lexicon as the list of words that must not appear.
2. **"înapoi"** still gives "Nu este nicio filă anterioară merge înapoi la." The log says it is fixed; it is not, in the webchat. Add the Chrome row.
3. **"fă părul roșu" is still WRONG:** the body turns light red, now with a Romanian "I took that as". This is the E2 veto case: a reading that leaves out "părul" must not act. Make it the first case of the E2 veto tests.
4. **"o bară grafic"** should read "un grafic cu bare". The distance reply falls back to the fixed line "Nu am încă o formulare…" when there is no real Translator: add the template (it is a frequent question).

## Re-vendor 0.9.0 accepted; next target 0.10.0 at 335309f (reviewer, 2026-11-12 02:30)

Accepted (0d5f87f … 04a9f3c). `npm test` gives 1415 pass, 0 fail, and `src/vendor/sopworld` records 0.9.0 build 807d8bde76f3.
- The gap went from +3.0 to about +2.0 ms p50, and the workarounds are removed.
- The kb is back as wires at the same turn time.
- kids.animals answers several values.

Your three library items are now Round 11 in soplang-words-lib: delta snapshots with `since`/`base`, redo after a rewind, and aggregate `groups=`. The fourth, the games' fixed +2.9 ms, is for you to name with `bench-reasoner --instrument` first.

**Next re-vendor target: sopworld 0.10.0 at 335309f.** Validated: 256 tests. It adds to the reader core:
- near words for typos, as assumptions, never correcting a known word;
- follow-ups (`interpret(frame, { previous })`, "the other one", corrections as revise);
- loose words under the budget;
- word forms with a host `lemma`;
- `veto(result)`, which says whether to answer or not and why.

**`veto` is what E2 needs.** Vendor 0.10.0, then run E2 with the library's `score`, `rank` and `veto`, gate no new wrong. The first test: "fă părul roșu" is not acted on.

## REGRESSION-AB (reviewer, 2026-11-12 03:00): matrix is now worse than ops in 7 dialogues. Fix before E2.

The reviewer reran `ab-sopworld --sets dialogues` on main (0.9.0 vendored; output in `/tmp/abdlg.json` on the reviewer box, reproduce with `--sets dialogues`). It shows 18 differing sessions: **7 "ops better"**, 1 "matrix better", 8 unjudged, 2 neutral. On 2026-11-11 there were 0 "ops better".
1. **Chess undo (dlg.gms#002, dlg.gms#006, dlg.doc#035): real regressions.**
   - gms#002: "Undo." in matrix gives "OK, I took back my last move. It is my move." (ops: "…your last move and my reply. We are back at the start. It is your move."). The next "Knight to c3." gets "Meanwhile I play knight to c6. You play knight to c3."
   - gms#006: "undo" gives "…your last move and my reply. It is my move." (ops: "your last move. It is your move.").
   - doc#035: "What did you do?" after an undo answers about "What is on the board" instead of the undo.

   Undo in chess takes back the wrong number of plies, or the engine's reply races the timeline. "What did you do?" then points to the wrong turn. Likely causes: the session timeline (UNDO-1 / RESTORE-1), or the 0.9.0 `transient`/redo change. Add the three as Chrome rows.
2. **Same reply, worse outcome (dlg.kidsA#010, dlg.drm#011, dlg.drm#014, dlg.drm#021).** The reply text is identical in both modes, but matrix is judged "wrong" where ops is "not understood". So the matrix **state** changed on a turn that was not understood: something was told or adopted although the reply says it was not understood. Find what changes in the state view on those turns. A turn that is not understood must not change anything.
3. **The 8 unjudged:** classify them in the classes file.

Then rerun the A/B on all three sets and add a gate to `npm test` or the browser suite: no "ops better" session in `ab-sopworld --sets dialogues --limit` on a fixed sample.

**Timing for the record** (reviewer, after the 0.9.0 re-vendor; this box is slower than the DGX). p50 ops/matrix:

| group | ops | matrix |
| --- | --- | --- |
| four matrix worlds | 12.8 | 16.8 |
| kids-other | 11.8 | 15.0 |
| avatar/shell/editor | 12.5 | 15.6 |
| music/draw/map/charts | 12.7 | 16.3 |
| games | 12.0 | 17.2 |
| documents | 14.6 | 17.8 |
| other | 13.0 | 16.8 |

Every group now pays 3–5 ms, because every world is on the library. That is acceptable under the user's rule ("secondary unless disastrous"), but games at +5.2 ms is the one to instrument.

## E3 corrections and E3b accepted (reviewer, 2026-11-12 03:25)

855088f and 6a134ca are accepted. `npm test` result is below.
- **One language.** Descriptions are now wires and repeated keys (`core.describe.arg`, `core.describe.words`), and the generated patterns are byte-identical. Every word is a `core.word`. That is the reviewer's decision implemented as asked.
- **Romanian pack (opt-in, `lang/ro/`).** On the 360 Romanian cases of the three worlds:

  | route | right | wrong | not understood |
  | --- | --- | --- | --- |
  | translator route | 309 | 26 | 25 |
  | pack first, with guard | 326 | 22 | 12 |

  It changes 0 of 236 English cases, with 0 new wrong in lenient mode. A clear gain on the described worlds.
- **The user decides** in the morning whether `lang/ro/` may hold Romanian words. Leave the flag off until then.
- **`core.word` gaps.** The canonical value per surface form is now the library's R11.4 (`value=`), and declaration order is R11.5. Role words and joiners stay with us.

**Do REGRESSION-AB first. It is still open.** Seven dialogues are "ops better" since the 0.9.0 re-vendor: chess undo, and state changes on not-understood turns. Then re-vendor 0.10.0, then E2.
- npm test: # pass 1417
- npm test: # fail 0

## E2 accepted; REGRESSION-AB is still open (reviewer, 2026-11-12 04:10)

E2 (e96ab6d, 493647b) is accepted. Reviewer spot-check with `PSYS2_WORLD_AWARE=off|veto`, `eval-operational --mode rules`:
- English: 95.4/0.8/2.2 → 95.4/0.7/2.2 (right/wrong/not understood, %).
- Romanian: 81.8/3.1/13.1 → 81.7/3.1/13.3.

This matches your report: a small, safe veto that never adds a wrong answer. "fă părul roșu" is no longer acted on. The honest limits are right too: `score` seldom judges, choice is over few readings, and splits are not used. The library gets R12.1 (a question's sought value is not a lack, which removes your `lacks` zeroing), R12.2 (a fallback judgement without declared actions: referents exist, values fit their slots, no deny fires) and R12.3 (`interpret` on words shaped like yours). With E3b's `core.word` facts, the split candidates of class h are now possible: try them in E2 after the re-vendor.

**REGRESSION-AB was not touched.** The reviewer reran `ab-sopworld --sets dialogues` at 04:00 and got the same 7 "ops better": dlg.kidsA#010, drm#011, drm#014, drm#021, gms#002, gms#006, doc#035. **Do it now, before anything else.** The user's first priority is coherence: a not-understood turn that changes state, and a chess undo that takes back the wrong plies, are coherence bugs in matrix mode.

Then re-vendor sopworld 0.11.0 at c09292a (validated: 259 tests). It adds delta snapshots (`toJSON({ since })`, `fromJSON({ base })`: use them in RESTORE-1), redo after a rewind (drop `redos`/`isView`) and aggregate `groups=`.

## Re-vendor target is now sopworld 0.11.1 at f9959ee (reviewer, 2026-11-12 04:15)

0.11.1 is validated: 261 tests. It is 0.11.0 plus canonical values for foreign words, written `core.word lang=ro text=minge means=ball of=kids.shop.item` (not `value=`; the library showed the existing form), and words kept in declaration order. Use `means= of=` in `lang/ro/*.sop`. **REGRESSION-AB first**, then vendor f9959ee.
- **REGRESSION-AB, the reviewer's diagnosis from the A/B state diffs** (04:20; `/tmp/abdlg2.json` on the reviewer box). Use it to go fast.
  1. **Chess (gms#006, and likely gms#002 and doc#035): the session timeline groups the engine's late reply with the user's next turn.** Sequence: "e4" → "Make your move." ("still thinking") → "now the knight to f3" ("Meanwhile I play knight to c6. You play knight to f3.") → "undo".
     - ops takes back Nf3 only: history ["e4","Nc6"], white to move. That is right.
     - matrix takes back Nf3 **and** Nc6: history ["e4"], `pendingEngine` true, "It is my move."
     - Because Nc6 arrived during the user's turn, it was recorded in that turn's step.

     Fix: an engine reply that lands asynchronously, or "meanwhile", is its own timeline step, or belongs to the step that caused it. It is never part of the user's next step. "What did you do?" then names the right step (doc#035).
  2. **The four "same reply, wrong outcome" cases are state-view differences, not changes made by the user's turn.**
     - kidsA#010: the matrix state view shows `kids.arith.holdings {"e.zoe":{"marble":6}}`, which the library derived from "Zoe eats 8". In ops the holding is absent.
     - drm#014, drm#011, drm#021: ops has `art.draw.history` and the matrix view does not, because the history now lives in the library timeline. The matrix has `art.draw.lastLabel` instead.

     Check whether the judge counts any state difference on a not-understood turn as "acting". If it does, mirrored or derived keys (`holdings`) and history keys moved to the timeline should be excluded from that check, or the matrix view should carry the same `history` key. Whichever it is, write it down. These four may not be bugs. The chess case is a bug.

## Re-vendor target is now sopworld 0.12.0 at 7a49329 (reviewer, 2026-11-12 04:45)

0.12.0 is validated: 265 tests. It adds to 0.11.1 three things:
- `rank` no longer counts a question's sought value as a lack. **Drop your `lacks` zeroing.**
- `score` gives `judged` and `judgedBy`, with a fallback judgement when no action is declared: referents exist, values fit their slots, no deny fires. That should make E2's veto judge far more readings.
- `examples/reader.mjs`, which reads description-shaped words. Split frames inherit the verb: "buy two pens and one ink" becomes two lines.

Order: **REGRESSION-AB** (diagnosis above), then vendor 7a49329, then rerun E2 with `judgedBy` and with the library's split candidates over your E3b `core.word` facts. Report how many more readings are judged, and the wrong/right/nu change per set, gate no new wrong.

## Namespaces accepted (reviewer, 2026-11-12 05:15)

83ce00f is accepted: one namespace per instance, turn-prefixed ids, shared agents, and library warnings in the trace. `npm test` gives 1436 pass, 0 fail. In Chrome (`shared.mjs`), the name told once is known in every tab, Ana's apples are counted right, and undo walks back across instances.

One behaviour to confirm: the third "undo" now takes back the tab switch ("OK, I am back on the Avatar tab.") before "she eats 1 apple". That is consistent with the shell's turns being steps (23607d9) and acceptable. Say in spec 15 that tab switches are undo steps.

Thank you for picking up REGRESSION-AB. The order after it is as you wrote: 0.12.0, then E2 with `judgedBy` and splits, then the RO leftovers.

## REGRESSION-AB fixed and accepted (reviewer, 2026-11-12 05:55)

d7df46e is accepted. Reviewer rerun of `ab-sopworld --sets dialogues`: **0 "ops better"** (was 7), 1 matrix better, 4 neutral, 8 unjudged. In Chrome (`/home/claude/shot/chess-undo.mjs`), matrix and ops now give the same undo and the same "What did you do?". The engine's late reply is no longer part of the user's step. The judges compare the visible state, and the A/B gate is in place. npm test result is below.

Next, as you wrote: re-vendor 0.12.0 at 7a49329, then E2 with `judgedBy` and splits, then the RO leftovers. Classify the 8 unjudged when you touch the classes file.
- npm test: 1445 pass, 0 fail.

## RO-LEFTOVERS accepted (reviewer, 2026-11-12 06:50)

711ee89 is accepted. `npm test` gives 1465 pass, 0 fail. In Chrome (Romanian, matrix):
- "cât de departe e Parisul de Roma?" → "Paris și Roma sunt la aproximativ 1.107 de km (688 de mile) distanță, în linie dreaptă."
- "un grafic cu bare"
- "care e cel mai mare?" → "Cel mai mare: pere, cu 5." (no English word)
- "înapoi" → "Nu există nicio filă anterioară la care să mă întorc."

"fă părul roșu" still acts in the default mode, as expected, because the E2 veto is off by default. The user decides about turning it on this morning.

Next: re-vendor 0.12.0 at 7a49329, then E2 with `judgedBy` and splits.

## USER DECISIONS 2026-11-12 06:50 (read this first)

1. **No Romanian in SOP Lang or in the worlds, ever.** The user, in his words: he wants nothing in Romanian in SOP Lang and the worlds; translation is always a separate layer, done in Chrome with the browser's translation APIs. The `lang/ro/` "pack" was the reviewer's proposal (E3 corrections item 3, 01:45); the user rejects it.
   - Remove `lang/ro/`, the `PSYS_GEN_LANG` flag, the Romanian frames and the `core.word lang=ro` wires, and the generator code that reads them.
   - Keep the E3b numbers in `training/results` as a record, with a line saying the approach was rejected.
   - Romanian stays only in the translation layer: the browser Translator (RO-TRANSLATE-FALLBACK) and the existing translation module. Nothing Romanian goes into `worlds/`, `.sop` files or the reasoner.
   - Check with a grep that no `.sop` file and no world file holds Romanian words. Add a test that fails if one does.
2. **Matrix (sopworld) is the default.** It already is; nothing to do.
3. **Do the next direction:**
   - **DESCRIBE-ALL.** Write descriptions (`core.describe`, `core.describe.arg`, `core.describe.words`, English `core.word` only) for the remaining worlds, one world per commit. After each world, run the operational and dialogue sets with the generated patterns in `add` and `only` modes, and record right, wrong and not understood. Gate: no new wrong answers in `add`. Report per world how many hand-written lines the description could replace.
   - **READER-ROUTE.** After the re-vendor of sopworld 0.12.0 at 7a49329: use the library's `interpret` over the English `core.word` facts as a third source of readings, next to rules and the encoder, behind a flag. Measure on gold-para (class b), typos (class a) and loose-words (class e), English only. Romanian goes through the translator first and then the same English route. Gate: no new wrong answers. List every changed case.
   - Then rerun E2 with `judgedBy` and the library's split candidates.
4. **The E2 veto as default: the user wants it explained again before deciding.** Leave it off until he decides.

## Two follow-ups to 06:50 (reviewer, 2026-11-12 07:10)

- **Words have no language.** The library will drop `lang=` from `core.word` (0.13.0). When you vendor it, drop `lang=en` from every `core.word` in `describe.sop`. Until then, keep `lang=en` but add no other language.
- **Replies that name things must use the user's words, in plain language.** The user read "There is no shape called End. Shall I add it?" and asked who would understand that.
  - For a missing box in the diagram, say: "I can't find a box called “End”. Shall I add it?" Use the user's own noun ("box", "circle") when they said one; otherwise use the world's everyday name for the thing, never "shape".
  - Review every reply the E2 veto and the no-referent hooks produce with the same eye: plain words, the user's label in quotes, one short question.
  - Add Chrome rows for "connect Start to End" and "delete the dragon", EN and RO through the translator.

## URGENT RO-PHONE (user, 2026-11-12 07:01): Romanian replies on the phone are broken

The user, on his phone, Romanian selected: "fă o diagramă random" → "Nu am încă o formulare în română pentru acest răspuns." He calls the translation strange.

Reviewer repro in Chrome (`/home/claude/shot/diag-ro.mjs`, mobile viewport):
- **With the harness's fake Translator,** "fă o diagramă random", "fa o diagrama random" and "deschide diagrama" all give word-by-word garbage: "Un curăță canvas. Ce desenează shall? Templates: process, cycle, hierarchy, …, wave, copac, drum… Îi spune exemplului pentru„ face un copac” sau just pornește…". English words are left in, the grammar is broken, and the English template names are listed. The "no English left" check let it through.
- **On the phone the real Translator is not there.** The browser Translator API is most likely desktop-only, not available in Chrome on Android. So the route ends in the fixed line: the user gets nothing at all.
- **The English side is weak too.** "make a random diagram" → "Drew c1.", and "desenează o diagramă" → "Am desenat c1.". "c1" means nothing to a user, and nothing random was made.

Do, in this order:
1. **Never send the fixed line as the whole reply.** It hides what happened. Every world needs Romanian reply templates for its frequent replies; the reply table is the translation layer and stays outside the worlds. Start with the replies the user sees most: the opening and help text of each tab (diagram, draw, map, charts, music, chess, editor, reader, avatar), "Drew …", the refusals.
   - Rank the families by frequency over the phrase logs and the eval sets, then do the top 50 first.
   - Where no template exists, say in Romanian what happened, built from the state (for example "Am deschis diagrama. Spune ce să desenez, de exemplu „un copac”."), plus the user's words. Never a dead end.
2. **The "no English left" check must reject mixed output** like the above. Measure it on all Romanian replies of the eval sets with the real fallback path, meaning **no Translator API present**, which is the phone case. Report how many replies end in the fixed line or are rejected. Target: 0 fixed lines on the top 50 families.
3. **Test as the phone does:** add a "no Translator API" mode to the harness (`browserApis: { translator: false }`) and to `check-ro-replies`, and run the Romanian sets that way. The fake Translator hides exactly this case.
4. **"a random diagram"** should make one: pick a template, fill it with sample labels, and say so in plain words ("I drew a random cycle diagram with four steps."). Never answer with ids like "c1"; use the box label or "a circle".

This comes before DESCRIBE-ALL and READER-ROUTE. The user is testing on the phone now.

## MT-SERIOUS (user decision, 2026-11-12 07:10): real translation, lazy, and the hacks go

The user wants serious translation support. The translation part loads lazily, only when the browser has no Translator API. He also wants our own translation hacks removed, because they cost too much time and are not good quality.

1. **Order in the translation layer:**
   - (a) the browser's Translator API when present (desktop Chrome);
   - (b) otherwise an on-device open-source MT model, **loaded lazily** the first time Romanian is used without (a);
   - (c) nothing else.

   The phone case is (b): Chrome on Android has no Translator API.
2. **Engine for (b):** evaluate first, then choose one and say why.
   - **Bergamot** (Mozilla; Marian models through WASM; the Firefox translation models). Check that ro→en and en→ro models exist in `mozilla/firefox-translations-models` and give their sizes and licenses.
   - **Opus-MT** in ONNX through our onnxruntime-web: `Xenova/opus-mt-en-ro` for en→ro (about 107 MB quantized), and `opus-mt-ROMANCE-en` or `opus-mt-ro-en` for ro→en.

   Measure on the Romanian sets for each candidate:
   - download size;
   - first-load and per-sentence time on a mid phone profile (Chrome throttled 4× CPU, plus the user's phone if he tests);
   - quality: ro→en reading (right/wrong/nu on operational-ro, the same judge) and en→ro replies (`check-ro-replies` and a sample read by the reviewer).

   It runs in a worker, under the turn budget with a deadline, and is cached after the first download (Cache Storage). It is never on the first-paint path.
3. **Remove the hacks once (b) is in and measured at least equal.** Delete:
   - the rules translator's Romanian tables and pre-pass;
   - the Romanian reply templates and `userWordMap` hacks;
   - the `ro-generic` fixed line;
   - the Romanian-specific reading patches in `src/translate`;
   - RO-PHONE item 1's template work (do not build more templates; stop it now).

   Keep only: the language selector, the checker that compares source and translation (numbers, names, negation, question form), and quoting the user's own words.
   - Report the lines removed.
   - Report the Romanian numbers before and after, in desktop mode (Translator API) and phone mode (no Translator API).
4. **Tests:** the harness gets a "phone" mode (no Translator API, MT model loaded) for the Romanian sets and the Chrome rows. The fake Translator stays only for unit tests of the layer's order and deadlines.
5. **Supersedes RO-PHONE items 1–3.** Item 4 stays: "a random diagram" should really draw one, described in plain words without ids. Do MT-SERIOUS before DESCRIBE-ALL and READER-ROUTE.
6. **Every language the translation layer supports goes into the interface (user, 07:12).** If the chosen engine supports more languages, the language selector offers all of them, not only English and Romanian: "if we pay the price anyway, we want the feature".
   - The language list comes from the engine: for the browser Translator, `Translator.availability()` per pair with English; for the on-device engine, the model registry, both directions with English.
   - A language appears only when both directions with English exist, because the worlds are English.
   - Each model downloads lazily, only when that language is first selected.
   - Speech follows the selector: the recognition and synthesis tag for that language where the browser has it. Where it does not, say so once and keep typing working.
   - Report which languages each engine gives, the size per language pair, and which ones pass the checker on a translated sample of the operational set (machine-translated from English, then read back). Show a language only if it reaches at least 80% right on that sample, with its number in Settings › About.
   - Keep LANG-FIXED: one selected language decides what the user sees and hears.

## Re-vendor target is now sopworld 0.13.0 at 8b9a46b (reviewer, 2026-11-12 07:25)

0.13.0 is validated: 265 tests. It is 0.12.0 with words that have no language:
- `core.word text= means= [of=]`, no `lang=`;
- `words()`, `interpret(frame)` and `examples(templates)` take no language argument;
- one `lemma(token)` function;
- English-only examples.

Vendor 8b9a46b and drop `lang=en` from every `core.word` in `describe.sop`. Order: MT-SERIOUS first; the re-vendor can go in the same session, since it is mechanical.

## MINIMAL-PAIRS and COMMON-SENSE (user, 2026-11-12 07:19)

The user asked whether we test cases where order and nuance change the meaning ("Ana gives Ion X" against "Ion gives Ana X"), negations, and general rules. He also wants warnings, not refusals, in the drawing world: fish in the sky or the grass, several suns, and similar. As an exercise, he wants a **common-sense world that can be mixed into other worlds**, so that common sense is not written a thousand times.

**1. Minimal pairs.** The reviewer added `training/eval/minimal-pairs-2026-11-12.jsonl`: 22 cases (role order: gives / gives to / gets from / takes from, both directions; negation; comparison; the shop's "I give Ana 10 lei"). Reviewer run, rules mode:
- **Role order is read right in all 11 arithmetic cases.**
- **"more than", "fewer than" and "twice as many as" are never understood** (5 cases, not understood).
- **Negated statements are not understood** ("Ana does not give Ion any apples", "I do not buy the ball"). That is safe, but they should be understood: nothing changes, and the reply says so.
- **The judge is too lax.** mp#021 "I have 20 lei. I give Ana 10 lei." is answered "You have 20 lei now", which is wrong, but it is judged right because "10" appears inside the echoed not-understood text. The same happens with mp#012 and mp#022. **Fix the judge:** match the answer only in the answer part of the reply, never inside a quoted echo of the user's words. Then rerun the operational and dialogue sets and report how many "right" cases change.
- **Tasks.** Make the comparison forms and the negated statements work in kids.arith and kids.shop, preferably through E3 descriptions and rules rather than new patterns. Grow the set to about 100 pairs over worlds where order matters: draw ("put the cat on the box" / "put the box on the cat"), map ("from Paris to Rome" / "from Rome to Paris"), chess ("knight takes pawn" / "pawn takes knight"), editor ("move chapter 2 before chapter 3"). **Every case gets its swapped twin.**

**2. Common-sense world, `world.commonsense`.** A world of plain general facts and **soft rules**: `core.deny … soft=true`, which the library records as an issue and does not refuse. It holds no host logic and is mixed into other worlds by declaration (`compose=` or `reads=`), never copied. First content, for the drawing world:
- fish live in water;
- the sun and the moon are in the sky, and there is usually one sun;
- trees and houses stand on the ground;
- birds fly in the sky, cars are on roads or on the ground;
- day and night: no sun at night.

The drawing world composes it. A soft issue becomes a short, friendly warning after doing what was asked: "Done! (Fish usually live in water, not in the sky.)" The action is still done. Write the facts as types and relations general enough for other worlds to reuse (map, kids.animals, diagram).
- Measure: the existing tests stay identical, apart from the new warnings, which are listed.
- Add Chrome rows: a fish in the sky, a second sun, a car in the sky. Check that each warning is said once and is never a refusal.
- If the library lacks something, for example a soft deny that carries an everyday reason, or a world that can be composed into several instances, write it as a library item with a repro.

Order: after MT-SERIOUS. These two can run in parallel with DESCRIBE-ALL.

## Re-vendor 0.12.0 + E2 rerun accepted (reviewer, 2026-11-12 07:55; the reviewer had missed it at 06:54)

cda014f, 81535be and 6226937 are accepted. `npm test` result is below. E2b is honest:
- the library's fallback judgement judges nothing more, because the host's action arguments are bare names;
- the library veto alone is a bad trade (57 wrong prevented, 70 right lost), so it stays out of the default set;
- the `lacks` zeroing stays;
- the split reader resolves only kids.shop's words and answers 11 of 291, with no useful new reading.

The library gets these as Round 13: J1 (question wires in `score`), J2 (declaring the parameters of host-run actions so the fallback can judge them), and N1–N6 (your six namespace defects, to be checked against 0.13.0 and fixed). When 0.13.1 lands, drop the facade workarounds item by item.

**Note on E2b:** `of=` with Romanian entity words is part of what the user rejected at 06:50. Remove it with the `lang/ro` pack.

For READER-ROUTE, the lesson of E2b is that the descriptions' `means=` must name matrix types and keys, not emit keys (geo.map 341 and docs.editor 247 `unknown-word`). Fix that in DESCRIBE-ALL, so that `interpret` can resolve the words.

## RO pack removed, DESCRIBE-ALL so far, answers to Q2 (reviewer, 2026-11-12 08:40)

Accepted: ee2fbed (no Romanian in SOP Lang or worlds: `lang/` is gone, there is a no-romanian-in-worlds test, and the only diacritics left in `worlds/` are proper names in the geo.map kb, which is right), the DESCRIBE-ALL commits (bb4f7ca … 763780a), and 5574603 (`describe.sop` is not shipped). `npm test`: 1472 pass, 0 fail.

The size table is the right measure. Five conversation worlds are at 0.35–0.60 of their pattern lines, while user.profile is at 1.01 and guess at 24×. That is memorization, as you say.

**Answers to Q2** (reviewer; the user's direction is generalization, not memorization):
1. **Agreed, fully.** A description may reference shared vocabulary only: `lang.common` groups, lexicons, and one `core.word` per real word. The size gate goes into the report: description plus words ≤ pattern lines. A world that needs phrase lists is reported as a gap. For the games, rewrite them under the gate or mark them as gaps; do not keep the 24× versions. For multi-word intents, add shared `lang.common` intent groups (profile questions, export, interview).
2. **Agreed.** One declaration per world, in SOP and English: argument → slot, through `core.describe.arg of=`. From it, derive both `checkReferents` and the library's judgement for every world, with no per-world JS. The library adds the matching mechanism as J2 of its Round 13. Use it when 0.13.1 lands.
3. **Covered by MT-SERIOUS.** With real MT, "și" and "apoi" arrive as "and" and "then". Add the Romanian compound test set ("listă cu lapte și ouă", "titlu A, B și C") and run it through the MT route in phone mode.
4. **Stop growing templates.** This was the user's decision at 07:10 (MT-SERIOUS): on-device MT replaces the rules translator and the fixed line. Do not spend more time on templates.
5. **(a) Agreed:** an undo of a confirmation also closes the offer it answered. **(b) Keep it.** Tab switches and settings are steps. Write it in spec 15.
6. **Agreed:** cache `toState` per instance stamp. The cheaper `act` for one-wire changes is noted for the library.

**On the veto default:** the user said "ok, direction looks good" at 06:54, after the veto explanation. That counts as yes. Fix the false `no-game` vetoes first, then make it the default. Tell the reviewer the numbers before and after.

## READER-ROUTE accepted; re-vendor target sopworld 0.13.1 at e586ac5 (reviewer, 2026-11-12 09:00)

READER-ROUTE (259f5c5, merge fix 7d2c48a) is accepted as an experiment, off by default. `npm test`: 1476 pass, 0 fail.
- The result is small: 4–5 not understood → right, and 1 new wrong that is a judge label artifact.
- The policy learned from the 56 new wrong answers of the first runs is sound: no free-text arguments, one-letter corrections only, an anchor word, unambiguous readings, the user's own world only.
- Your split item is the library's R14.1: an unreadable frame stays as an unresolved part.
- It will only grow with descriptions under the size gate. Do not wire it into the UI yet.

**Re-vendor target: sopworld 0.13.1 at e586ac5.** Validated: 273 tests. It is 0.13.0 (no `lang=`) plus Round 13:
- N1–N6, your six namespace defects. Drop the facade workarounds one by one, with a test each.
- J1: question wires in `score`. Drop the `lacks` zeroing.
- J2: a host-run action described by a type of its name, which the fallback then judges. Use it with the one arg→slot declaration of Q2 item 2.

Order unchanged: MT-SERIOUS first.

## Accepted this hour, and two corrections (reviewer, 2026-11-12 09:35)

Accepted: 79e0982 + 2e387b8 (veto is the default, false no-game vetoes fixed, plain replies), 63a842b (random diagram, no ids), 2fbefbd (judge fix), 13ad0b7 (sopworld 0.13.0, no `lang=`), f64419f (map echo fix), e71139e (reader without word languages). `npm test`: 1479 pass, 0 fail.

In Chrome:
- "connect Start to End" → "I can't find a box called “End”. Shall I add it?"
- "delete the dragon" → "I can't find “dragon” in the picture. In the picture I can see: a red house and 2 green trees."
- "switch to klingon" → "I do not speak klingon. The languages I have: English and Romanian."
- "make a random diagram" → "I drew a random hierarchy diagram with four boxes."

Corrections:
1. **No more Romanian templates.** 2e387b8 and 63a842b added sentences to `replies.en-ro.mjs`. The user decided at 07:10 (MT-SERIOUS) that the rules translator and its templates go away once on-device MT is in. Add nothing more there. MT-SERIOUS is now the first task, before anything else.
2. **"fă părul roșu" on the Avatar tab** now gives "Nu găsesc „părul” în imagine. Imaginea este goală. Nu am știut cuvântul: părul.". It is no longer acted on, which is good, but the answer is from the **drawing** world while the user is on the avatar, and the last sentence is confusing. With real MT, "make the hair red" goes to the avatar, which offers to switch to the person. Add it as a phone-mode Chrome row of MT-SERIOUS. The veto reply must come from the world of the open tab when that world reads the message, and never say "Nu am știut cuvântul" when another reading used the word.
3. **"fă o diagramă random"** still opens the canvas with the garbled translated help text. Same cause: no MT. It is the first phone-mode row.
4. **`ro-fallback.test.mjs`** "empty took 1539 ms against 1500" is a timing test under load. Make it count steps, as you did for voice-repair.
5. **Re-vendor target is now 0.13.1 at e586ac5.** You vendored 0.13.0; 0.13.1 adds the namespace fixes, J1 and J2.

## SHIP-NOW (user, 2026-11-12 09:24): publish the current system; the user wants to test it

The user wants to test the current system now. Publish your changes even with small regressions. Run regression-analysis agents in parallel; if regressions are only about 1–2%, that is probably not serious.
1. **Publish now.** Merge what is finished, rebuild the webchat and push to main, so GitHub Pages serves it. Then keep publishing after every finished piece, at least every hour.
2. **Make the version visible.** Show the build time and the commit hash in Settings › About, and in the first line of the debug panel. The user still sees "Nu am încă o formulare în română…" in the demo, and he reads that as nothing having been updated for a long time. He must be able to tell which build he has.
   - Check the caching: the service worker and the import-map `?v=` stamps. A new build must reach a phone after one reload. If it does not, fix the cache (versioned cache name, `skipWaiting` and `clients.claim`, or no service worker).
3. **Regressions.** After each publish, an agent runs the operational, operational-ro and dialogue sets and the A/B gate, and writes a short regression note in worker-log.md: what got worse, by how much, which cases.
   - Below about 2% on a set: keep going.
   - Above 2%, or any coherence failure (the A/B "ops better" gate, a not-understood turn that changes state): fix it first.
4. Keep MT-SERIOUS as the main work. The fixed Romanian line goes away with it.

## MT-SERIOUS accepted as stage 1 (reviewer, 2026-11-12 10:05)

Accepted: 8e5d371, 62b0791, b345559, 917fad7, 50d55ff and the merges. `npm test`: 1486 pass, 0 fail.
- Bergamot with Mozilla tiny models: ro pair 29.7 MB gzip, MPL-2.0, lazy, cached, with a visible download. That is the right choice over Opus-MT.
- Phone mode exists in the harness.
- Rules first, model for a poor reading: 85.4%. The fixed line on the phone fell from 207 to 25.
- You kept the hacks because model-only reading is 63.5% against 81.8% for the rules. That follows the rule; keep them.

Reviewer limits and findings:
- **The reviewer box cannot reach storage.googleapis.com** (proxy allowlist), so the reviewer's phone-mode probe ran without the model. The user tests on his phone.
- **Rows seen without the model:**
  - "fă o diagramă random" → the fixed line;
  - "fă părul roșu" on the Avatar tab → the drawing world's veto reply;
  - "care e capitala Franței?" → "De capitala Franța este Paris." (garbled).

  Put these rows in the phone-mode browser test with the model present, and report their replies in worker-log.md.

**Language gate: a decision for the user.** No language reaches 80% in the round trip; the best is French at 75.9%. The reviewer will ask him. Until then, the selector shows English and Romanian.

**Next re-vendor: sopworld 0.14.0 at c7247e2.** Validated: 278 tests. It brings declared host functions (`core.function`, `core.function.arg`, load checks, `pure=`, `functions()`; facts never call functions) and R14.1. Declare the functions of each world's `fns.mjs` with it. That is the tool description the formalization work wants.

## Reviewer 2026-11-12 10:25 — MINIMAL-PAIRS, COMMON-SENSE, DESCRIBE-ALL accepted; language gate decided; ROUND-TRIP-MINING

**Validated at 9b8c559:** npm test exit 0 (699 s). minimal-pairs 122 cases (rules): right 91.8%, wrong 1.6%, not understood 4.9%; avatar/shell/editor is the weak group (71.4%, wrong 14.3%). Chrome draw probe: fish in the sky, second sun, car in the sky are all drawn, with one friendly note after the action; "draw a fish" makes a pond. Accepted.

**Found in the probe (fix, with a test each):**
1. "open draw" -> "I did not understand" ("open drawing" and "open the drawing" work). Probably lost under the DESCRIBE-ALL size gate for ui.shell (8ec507b). Every tab must open by its short name ("open draw", "open chess", "open map", "open charts", "open music", "open editor", "open diagram"); add these to the shell tests so a size cut cannot drop them again.
2. "draw a sky" -> not understood (and once read as "drag"). A sky (also ground, sea, grass) is a background, not an object: draw it as a background band. The drawable things should come from sop-knowledge-worlds k.objects once it exists; for now a small list in art.draw is fine.

**Language gate (owner, 10:07): show the languages under 80% as "beta".** The selector lists English and Romanian, then every engine language with "beta" and its round-trip number. Settings › About keeps the numbers. Keep QUALITY_GATE at 80; it now separates normal from beta.

**ROUND-TRIP-MINING (new, the owner's idea).** When a round trip fails, the reason is either (a) the model translated wrongly, or (b) the English that comes back is correct, but phrased differently from what we read. Case (b) is a gap in our English reading, and the round-trip outputs are a free source of real paraphrases.
- For the 216-case sample and the 8 best languages (fr it nb de nl is bg es) plus ro, save each case as `{original, back-translation, reading, verdict}` in `training/results/round-trip-cases-2026-11-12.jsonl`. This must run on the DGX, because the reviewer box cannot reach the models.
- Classify every failure: `mt-wrong` (meaning changed), `reader-gap` (same meaning, we fail), `judge-strict` (we read it right, but the judge compares UI words). Use the judge and a hand check of 40 cases. Report the shares per language in worker-log.
- Turn `reader-gap` cases into a paraphrase eval set (`training/eval/paraphrases-rt-2026-11-12.jsonl`, deduplicated, English only), and fix the reading by world descriptions and word groups. No phrase memorization (DESCRIBE-ALL size gate applies). Fix `judge-strict` in the judge.
- Report the new gate numbers. If English reading gets better, every language gets better.

## Reviewer 2026-11-12 10:50 — on resume after the pause

- npm test on ba08e18 (reviewer box): 1 fail, the same one as yours: `not ok 671 - the webchat build writes a modulepreload block into index.html, idempotently`. Fix it first. If two tests build the webchat at the same time, give each its own output folder, or run them in sequence. A flaky test hides real failures.
- Language gate: the owner chose "beta" (10:07) after your 70% change. List en and ro normally; list every other engine language as "beta" with its number, whatever the number is. Keep one constant (80) that only separates normal from beta. The 70% cut-off is not needed.
- Then continue with the 10:25 block in this order: "open draw" + short tab names, "draw a sky", ROUND-TRIP-MINING, the re-vendor of sopworld 0.14.0 (c7247e2), DESCRIBE-ALL for the remaining worlds.

## Reviewer 2026-11-13 08:05 — KNOWLEDGE-BY-LOOKUP (owner's question; design and one experiment, after the 10:25 and 10:50 blocks)

**Owner's rule:** do not generate training data from the knowledge worlds, and do not train the encoder (DistilBERT) to know words and things. The encoder learns the *shape* of a request. The knowledge worlds supply the *words*, by lookup at run time.

**Design to build and measure:**
1. **Shape, not vocabulary.** The encoder and the rules decide the world and the action from the frame: "draw a X", "add a box shaped like a X", "what is a X", "how many legs does a X have". X is an open slot. In training data, fill open slots with a wide random set of nouns, including invented ones ("draw a blorp"), so the model cannot learn the nouns. No new rows per knowledge fact, ever.
2. **Lookup after reading.** When a reading has an open slot or words left out (sopworld already reports them), look these lemmas up in the knowledge catalog (`vocab.json` of sop-knowledge-worlds: lemma → shards). A hit loads only those shards. No model is involved in this step.
3. **Who uses the knowledge:**
   - A tab world with an action that needs a thing (art.draw "draw a house", diagram.sketch "a diagram shaped like a house") reads the parts and layout from `k.objects`, and the advice from `k.commonsense`.
   - A question with no tab action ("what is a comet?", "how many moons does Mars have?") goes to the conversation composite, which answers from the loaded shard.
   - The E2 veto asks the catalog before it says "I can't find …". The plain refusal comes only when there is no hit.
4. **Routing rule to test:** the frame decides the world; the catalog hit decides only *which knowledge to load*. A catalog hit alone never moves a message to another world.

**Experiment (report in worker-log):**
- Make a 120-case set: 40 draw/diagram requests with things that are not in any app world; 40 knowledge questions; 40 controls that must not change. Use the hand-written `k.commonsense` and `k.objects` cores from sop-knowledge-worlds when they land (Round 1 is in progress there); until then use a stub catalog of 30 objects.
- Measure: right world; knowledge loaded (yes/no, which shard); answer right; added latency per message; and the same set with invented nouns. Expected for invented nouns: right world, no hit, a plain "I don't know what a blorp is" reply.
- Gate: no regression on the operational sets (rules and encoder), 0 "ops better" in the A/B. No encoder retraining for this task. If retraining seems needed, stop and report why.

## Reviewer 2026-11-13 08:15 — DRAW-FROM-FACTS (owner: the drawing interpreters must be able to use the knowledge as stored)

**Today:** art.draw knows 26 kinds, fixed in an enum (`kind=… house tree sun …`), and each has its own hand-coded picture. diagram.sketch has its own fixed shapes. A new thing from the knowledge worlds cannot be drawn, because nothing reads parts.

**Target:** one generic renderer that draws any thing from facts. The format is `k.objects` of sop-knowledge-worlds (T5 and its amendment there): an object is a list of parts; each part has a primitive shape (rectangle, square, circle, oval, triangle, line, arc, polygon), a box `x y w h` in the object's 0–100 frame, a draw order, a colour, and points as separate wires for polygons and lines.

1. **Composite renderer (art.draw).** Add `kind=composite` with `thing=<name>`: the canvas draws the parts scaled into the object's own x, y, size, rotation and flip. The user's colour replaces the main part's colour ("a red house" → red body, the other parts keep theirs). The crayon/solid/outline fill applies to every part. All existing operations (move, resize, delete, count, undo) work on the composite as on one object.
2. **Same data for the 26 built-in kinds.** Describe the built-in kinds as `k.objects` facts too and draw them through the same renderer. Keep the hand-coded pictures only where the generic one looks clearly worse; list those in worker-log with side-by-side screenshots. Goal: one path, not two.
3. **Parts are addressable.** "make the roof blue", "add a third window", "remove the chimney" act on parts of a composite. This is new reading on existing frames (a part name is an open slot, looked up in the object's parts), per KNOWLEDGE-BY-LOOKUP. No new training rows per object.
4. **diagram.sketch.** "a diagram shaped like a house" or "arrange the boxes as a house": the diagram takes the part boxes of the object as the layout (one box per part, labelled with the part name, positions from `x y w h`). Arrows are not invented.
5. **Unknown thing.** No facts → the plain reply ("I don't know how to draw a blorp yet"), never a random shape.
6. **Tests:** a Chrome probe draws 10 things that are not in the enum from a stub of `k.objects` (use the real shards when Round 1 of sop-knowledge-worlds lands) and saves screenshots for the reviewer; unit tests for scaling, flip, colour override and part edits. Gates as usual (npm test, A/B 0 "ops better", no encoder retraining).

Order: after the 2026-11-12 10:25 and 10:50 blocks; DRAW-FROM-FACTS and KNOWLEDGE-BY-LOOKUP can share the stub catalog.

## Reviewer 2026-11-13 09:10 — resume batch accepted

**Validated at 1ce0a9e:** npm test 1507 pass, 0 fail (the modulepreload flake is gone). A/B dialogues: 0 "ops better" (1 matrix better). Minimal pairs unchanged at 91.8%. Chrome probe: every tab opens by its short name; "draw a sky" and "draw the ground" make backgrounds; the fish advice still comes after the action. Languages as beta, ROUND-TRIP-MINING: accepted.

**ROUND-TRIP-MINING, next step.** The finding is clear: about 72% of the failures are the translation model and about 25% our reading. So:
1. Do **not** retrain the encoder on the 223 round-trip rows now (owner: no over-training). Keep them as an eval set.
2. Fix the "original-fails" cases (8 to 9 per language; the English original is not read either): mixed multi-world messages and "go back one". They are world gaps and help every language.
3. For the model share, try the cheap option first: a keep-list of app words that the translator must not change (currency "lei", tab names, proper names of the worlds), applied as placeholders around the translation. Measure the gate again. A fine-tune of the Marian student is a later, separate decision for the owner.

**Order now:** KNOWLEDGE-BY-LOOKUP and DRAW-FROM-FACTS (2026-11-13 blocks) come first: sop-knowledge-worlds has `k.commonsense` and `k.objects` live (30 hand-written objects with named, drawable parts; a bulk import of over a thousand objects is in progress), catalog at `docs/worlds/index.json` + `vocab.json` of that repository (GitHub Pages). Then the re-vendor of sopworld (wait for its Round 16 release, which fixes a bug the knowledge worlds hit), then items 2 and 3 above, then DESCRIBE-ALL for the remaining worlds.

## Reviewer 2026-11-13 09:35 — sopworld 0.15.0 and the knowledge catalog are ready

- **Re-vendor sopworld at 782cd0c (0.15.0)**, not c7247e2: it includes 0.14.0 (host functions declared in SOP Lang) and Round 16 (a soft issue no longer makes the knowledge it read "conflicting"; order-independent merge across modules; `core.module version=`). The common.sense advice depends on the first fix.
- **Knowledge catalog now:** `k.objects` has 841 drawable objects (30 hand-written with named parts; 811 imported from Noto Emoji, about 20% of their parts named by a model and marked `named=model`), `k.commonsense`, `k.words` (WordNet, 318 shards). Use the real catalog for KNOWLEDGE-BY-LOOKUP and DRAW-FROM-FACTS; no stub. Imported objects have many polygon parts (12 on average, up to 40 points each): measure draw time on the phone profile.

## Reviewer 2026-11-13 10:20 — DESCRIBE-ALL second batch and DRAW-FROM-FACTS accepted, with one finding

**Validated at 65972ba:** DESCRIBE-ALL second batch: npm test 1509 pass, 0 fail. DRAW-FROM-FACTS: A/B dialogues 0 "ops better"; screenshots checked (castle and house drawn from parts and edited; a diagram shaped like a house). Accepted.

**Finding: the test suite is too slow and one test is load-sensitive.** On the reviewer box `npm test` took 1078 s for the previous tree and did not finish in 1200 s for this one (914 tests ok before the stop). One failure under load: `tests/rd10-names-capability.test.mjs` "show Pariss on map reads Paris" answered "I did not understand"; alone it passes 3 of 3. So a spelling repair has a time limit that a busy machine misses. Fix:
1. Find the deadline behind this (name repair under a budget) and make the *result* independent of machine speed: either no wall-clock budget for a step that changes the reading, or a step count instead of time.
2. Bring `npm test` back under 10 minutes on a 4-core box: report the 20 slowest test files; share world loads between tests of a file; move browser-heavy tests to a separate `npm run test:browser` that the gate still runs.

**DRAW-FROM-FACTS, next:**
- The catalog now has 2,136 drawable objects (sop-knowledge-worlds, 326 shards, about 39 MB: far too big to vendor). Load by lookup: `vocab.json` → one shard → draw. This is KNOWLEDGE-BY-LOOKUP; do it now, with the real catalog from GitHub Pages, cached in Cache Storage, and a clear reply while a shard loads or when offline.
- Imported objects have about 12 polygon parts with many points: measure draw time and scene redraw with 20 such objects on the phone profile.
- The diagram "shaped like a house" draws the roof as a rectangle. Use the part's own primitive shape where the diagram has it (triangle, circle, oval); keep the rectangle otherwise.

## Reviewer 2026-11-13 11:15 — SMOKE and FULL suites (owner)

Replace item 2 of the 10:20 block ("npm test under 10 minutes") with two suites:
- **`npm run test:smoke`: under 2 minutes on a 4-core box.** It must catch the essence: every world loads; one or two canonical messages per world and per operation family in both reasoners; the router; the veto; undo across worlds; the translation layer with a fake translator; the build is fresh; the knowledge catalog lookup. No browser, no model download, no long sets. Choose the tests by what broke in the past: go through the regressions in worker-log and make sure each *kind* has one smoke test.
- **`npm test` = full**, as today plus the browser matrix. It may be slow.
- **When to run which:** every commit runs smoke. The full suite runs before each publish of the webchat (SHIP-NOW), after a re-vendor of sopworld, and at least once a day. A publish with a failing full suite is not allowed; a commit between publishes with only smoke is fine.
- **Report** in worker-log: the smoke list with its time, and, for one week, every failure the full suite caught that smoke missed. Each such miss adds one smoke test.
- The reviewer validates with smoke on every landing and with full once per batch or publish.
- The load-sensitive name repair (item 1 of the 10:20 block) stays as written: a result must not depend on machine speed.

## Reviewer 2026-11-13 12:20 — KNOWLEDGE-BY-LOOKUP, re-vendor 0.15.0, round-trip steps 2 and 3: accepted; the name-repair failure is real

**Validated at 2069a22:** A/B dialogues 0 "ops better". `npm test`: 1458 tests ok, then the suite hit the reviewer's 1500 s limit; one failure, the same as before. The round-trip numbers (nl 80.1, it 79.2, fr 78.2, ro 65.7) and the lookup experiment (controls 40/40, knowledge answers 39/40, draw 36/40) are accepted from the report. The reviewer box cannot reach GitHub Pages, so the live catalog in the browser was not probed here; the owner tests it on the phone.

**The failure is not load.** `tests/rd10-names-capability.test.mjs` "show Pariss on map reads Paris" fails inside the full suite twice in a row (6.2 s each time) and passes alone. 6 s is the bound of one knowledge or network fetch. So inside the suite something makes this message wait for a fetch that cannot succeed, and the reading is lost when it times out. Find it. Two rules follow:
1. **A blocked or slow network must never change a reading.** The lookup is an addition after the reading; if it fails, the reading stays. Add a test that runs the name repair with every fetch rejected and with every fetch hanging.
2. **No test may touch the network** (smoke or full). Fail the suite on any real fetch: stub `fetch` in the test setup and throw on unknown hosts. The reviewer's slow runs are probably many 6 s waits.

**Lookup, next:** the 4 "box shaped like a X" gaps in diagram.sketch; the E2 "no-referent" wording needs a test in a world other than art.draw; run the encoder-mode operational set on the Spark and report.

## Reviewer 2026-11-13 12:40 — speed-independent readings, smoke suite, catalog cache: accepted

**Validated at 1999312:** `npm run test:smoke` on the reviewer box: 199 pass, 0 fail, 169 s (2 cores busy; 46 s on yours). Accepted as the per-landing gate. Step budgets instead of clocks for name repair and leniency: accepted; this was the right cause. Cache Storage, lookup notice, offline reply, diagram primitives, phone timings (scene of 20 imported objects redraws in about 6 ms): accepted from the report.

**Open, in this order:**
1. **Models and device speed.** You note that with a model on, a slow device can still read differently (encoder timeout 1500 ms, normalizer and dispatcher deadlines fall back to the rules). That is acceptable only if the user can see it. When a model call times out and the rules answer instead, say so once per session in the debug panel and count it; report how often it happens on the phone profile. Do not change the deadlines yet.
2. The full suite must not touch the network (10:53 block, rule 2) and should be run by you before each publish; write its result line in worker-log each time.
3. The remaining items of the 12:20 block (diagram "box shaped like" gaps, E2 no-referent test in another world, encoder-mode operational run on the Spark), then DESCRIBE-ALL for the worlds still missing.

## Reviewer 2026-11-13 13:20 — SETTINGS-COHERENT (owner, from testing on desktop and phone)

The owner cannot understand the Settings options and found language-specific leftovers. Fix all of this as one coherent pass.

1. **History screen on desktop** stops at the middle of the screen height for no reason. It must use the full height of its panel at every window size. Add a Chrome check (desktop 1440×900 and phone 390×844).
2. **One "Reading" choice instead of two selects.** "Formalizer" (rules | encoder) and "Reading strategy" (hybrid | neural | rules) overlap and nobody can tell them apart. Show one select, "How I read your messages": **Hybrid (default)**: rules first, the model reads what they could not; **Model first**: the model reads, rules check and fall back; **Rules only**: no model. While the model is loading or unavailable, say so next to the select; the stored choice stays. Migrate saved settings. Hybrid is the default on every device.
3. **Nothing special for Romanian anywhere in the UI or voice.** The wake-word option shows `"PSys2" or "robotule"`, and `ui/voice-noise.mjs` has a fixed list with Romanian words (robotul, robotule, asistentule, calculatorule). Make it generic: the address words are the app name plus the English words (robot, assistant, computer); for another selected language they are translated once by the translation layer and cached, and the option text shows the words for the selected language. Then **audit the whole webchat and src for Romanian-only branches, lists or texts** (`ro` checks, Romanian strings, special cases in speech, wake word, hints, examples). List each in worker-log with one of: removed, made generic for every language, or kept because it is the Romanian translation rules that MT-SERIOUS still needs (name the measurement that justifies it).
4. **Languages in the Models section.** The Models part of Settings shows the neural models but nothing about languages. Add the translation engine there: whether the browser Translator is available, and per selected language whether the on-device model is downloaded, its size, and its round-trip number (beta under 80).
5. **Every option says what it does, in plain words.** For each Settings entry, especially under Developer/experimental: one short sentence on what changes for the user, and one on when to turn it on. No internal names (dispatcher, head, nx, veto) in the label; they may appear in a small "details" line. Group: Reading, Languages and voice, Models, Privacy and history, Developer.
6. **Defaults follow the gates.** An experiment that passed its gate is on by default; the owner wants the latest accepted work active without ticking boxes. An experiment that failed its gate is not offered as a normal option: move it to Developer with its measured numbers in the text, or remove it. "Edit head" says itself that it "recovers few messages and misleads more": report its numbers (recovered, misled, on which set) in worker-log; until the owner decides, it stays off and moves to Developer. List every option with its default and the reason in worker-log as a table.
7. **Wrong-world analysis from the owner's history.** Add `scripts/analyze-phrase-log.mjs`: input is the history export of the webchat; output is a table of messages that went to a world other than the active tab or were not understood, grouped by (active tab → chosen world, pattern), with the message texts. The owner will export his history; the reviewer runs the script and writes the tasks. Also add to the export, per message, the active tab, the candidate worlds with their scores and the final choice, if they are not there yet.
Gates: smoke per commit, full before the publish, Chrome checks for the settings panel in both sizes.

## Reviewer 2026-11-13 13:50 — SCENE-NATURAL (owner's two history exports, analysed; "still too rigid")

**Data:** `training/eval/owner-log-2026-11-13.jsonl`: the owner's 64 real messages (Nov 10 and Nov 13, mostly Romanian, Drawing tab), each with what the app did, a class and, for 36 of them, what he meant (`expected`, written by the reviewer). First replay all of them on today's build and report per message: fixed already, or still wrong. Then fix by the **general means** below. No phrase lists, no rows per message, no encoder retraining. Each principle gets tests with other words than the owner's.

**P1. A fragment continues the conversation in the active tab; it never opens another world.**
- "crocodilii" (right after "I don't know what corcodilii is") went to Hangman as a word to guess; "sa fie diferite" also went to Hangman; "make it happy" on the Avatar tab went to the diagram; "the leg of the blue crocodile" went to the document editor; half of one drawing request went to the map.
- Rule: a message with no verb of its own, or a clause cut from a longer message, is read first as (a) the missing piece of the last turn of the active tab (a corrected word, an answer to a question the app asked), (b) a change to the last action. A world that is not the active tab and has nothing running (no game started, no document open, no referent of the message in its state) cannot take such a message. If nothing fits, ask in the active tab. This extends the E2 veto: "another world has no referent for this" is a veto too.
- One request stays one request: a split may not send a piece without its own verb to another world.

**P2. Follow-ups change the last action.** Read these as operations on the previous turn, in any world that has undo:
- again / one more / another X ("inca un crocodil") → repeat the last add;
- more of the same ("si mai sus", "bigger", "further left") → repeat the last move or resize, same things;
- refine the result ("sa fie diferite", "make them red") → applies to the things the last action made;
- except / not there ("nu si peste apa") → undo the part of the last action that touches the named thing; never a new unrelated action;
- keep X ("dar lasa lacul") → restore X if the last action removed or covered it.
Implement once in the dialogue layer (the discourse memory already knows the last action and its objects), not per world.

**P3. Referents are matched to the scene first, with spelling tolerance.** "corcodiles", "corcodilii", "iraba": the picture had crocodiles; the app spent up to 93,000 spelling steps and still said "I don't know what corcodilii is". Before any dictionary repair, compare an unknown noun (lemma, edit distance up to 2, both the original and the translated word) with the names of the things in the active scene, then with the things the tab can make. Say what was assumed ("I read corcodilii as the crocodiles"), as the app already does for verbs.

**P4. Places are things.** "draw a lake" turned the whole ground into water; then "move the houses above the lake" and "above the water" said "I can't find the lake". "put grass under the houses" was refused ("the sky and the ground stay where they are").
- A lake, a pond, a river, a road, a field, a patch of grass, a hill are **region objects**: a place, a size, a name; they can be moved, resized, deleted, and used in relations (in, on, above, under, next to, around). Sky and ground stay as full backgrounds only when asked as such ("make the ground green").
- Relations work on regions and on objects alike: "put the crocodiles in the lake", "the houses above the lake", "grass under the houses" (a grass region below their feet, as wide as the group).
- "put / place / add / make / I want" + a thing that is not in the picture = add it ("pune si un lac" must not ask where to move it).

**P5. Things can be taken apart and built.** The owner wants to break the composition.
- **Parts by name**, also for imported objects: "make the legs of the crocodile black". If the object has no part with that name, say which parts it has; never say "composite".
- **Take apart:** "take the house apart", "separate the roof" → the parts become objects of their own (keep shape, colour, place); undo joins them again.
- **Build:** "put these together", "this is a boat" → a group with a name, used like any object afterwards (move, copy, "draw another boat").
- **Variation:** "3 different houses" → vary colour and size (and a variant drawing when the catalog has one); "different" after the fact is P2 refine.
- "a ball" comes from the catalog (it drew a red circle).

**P6. The reply is as natural as the request.**
- Broken replies in the log: "Încă nu știu cum să desenez un A." (an article taken as the thing), "Și cerul pământul stă unde sunt. Poți muta lucrurile desena." (translation of a template with holes), "Un compozit nu are picior", "Drew c1.". Add a reply check to the eval: no internal word, no dangling article, a complete sentence in the user's language. Run it over every reply template with the on-device translator and with the rules.
- A self-repair inside one message ("draw a water ..., a lake") is one request, the last wording wins.

**P7. Translation order.** Most Romanian messages in the log went through `rules-translate` although the browser translator was working on that machine (`translator-in` appears on others), and the rules gave "Still a crocodile" (inca un = one more), "still up" (mai sus = higher), "Put and a lake", "It is different". The owner's rule since 2026-11-12: with a browser Translator available it is the translator; the rules are the fallback without it. Report why the rules ran first here, fix the order, and measure the Romanian set again with the three paths (browser translator, on-device model, rules).

**P8. Older misses to replay** (Nov 10, may be fixed): "make a better layout" drew a new circle; "paint three new nodes" asked what to change; "an old woman" on the Avatar tab was not understood; "how can I change the shape of a diagram" got generic examples; voice with Romanian selected produced English nonsense that was (rightly) ignored: check the recognizer language.

**Cost.** One message took 2.1 s and 389,000 steps, most in spelling and backtracking. After P3 report the step counts of the log again.

**Order:** replay report, P1, P3, P2, P4, P5, P6, P7. SETTINGS-COHERENT (13:20) can run in parallel in another worktree. Gates: smoke per commit, full before publish, A/B clean, and the owner-log set as a new eval (report right / wrong per class before and after).

## Reviewer 2026-11-13 14:15 — SPACE (owner): one shared module for positions, selection by position and layouts

**Owner's idea, accepted:** the drawing world should deal with drawings; where things are, which one is meant by its position, and how to arrange them should come from one place that other worlds can ask too. And there should not be more and more worlds competing for a message.

**Design.** A shared **module**, like `common.sense`, not a tab and not a routing candidate: `space` (schema, rules and words in SOP Lang; arithmetic as declared host functions, sopworld 0.14+). A host world imports it and gives it a **projection** of its objects: `space.item id= kind= x= y= w= h= z=` in a frame `space.frame w= h=`. The module answers; the host applies the result to its own objects. Hosts now: art.draw and diagram.sketch. Later: data.charts (which bar), geo.map (which marker), game boards. The module never draws and knows nothing about houses or boxes.

What it owns, once, for every host:
1. **Selection by position and order:** the first / second / last (reading order, left to right then top to bottom), the left / right / top / bottom one, the middle one (median along the axis the group spreads on), the one next to / nearest to X, the one between X and Y, the biggest / smallest, "the other one", "the two on the left". With a kind ("the middle house") and without ("the one in the middle"). If the selection is ambiguous, the host asks with the candidates named by position; it never silently takes the first (today: "there are 3 houses, so I took the first").
2. **Relative moves:** direction words, combined ("left and down" = both), with an amount: default one step (a fixed share of the frame), "a bit", "more", "a lot", "all the way", "by half"; "further / even more" repeats the last move (SCENE-NATURAL P2 calls into this module).
3. **Placements by relation:** in, on, above, under, next to, left of, right of, between, around, in the corner / centre / at the edge; relative to objects, to regions (SCENE-NATURAL P4) and to the frame. Result: a target box that does not overlap unless the relation says so.
4. **Layouts:** in a row, in a column, in a grid, in a circle, spread evenly, align (left, top, centres), same size, centre the group, swap two, "tidy up" (remove overlaps, keep the order). The diagram's layout engine stays for connected graphs; the module covers free arrangements, and "make a better layout" maps to tidy up when nothing is connected.
5. **Questions:** "what is next to the house?", "which one is in the middle?", "is the sun above the tree?", "how far apart are they?" (near / far, not pixels).
6. **Words:** the spatial vocabulary (left, right, above, under, between, middle, corner, row, grid, first, last, bigger) lives in the module's `core.word` groups and descriptions, shared by every host. Remove the duplicated spatial patterns from art.draw and diagram.sketch as the module takes them over; report the lines removed against the lines added (the DESCRIBE-ALL size gate applies: the module must be smaller than what it replaces).

**How a host uses it.** The host's reading keeps the verb and the thing ("move", "house"); the spatial part of the message ("the one in the middle", "a bit more to the right", "next to the lake") is handed to the module as one frame with open slots. So "move the middle house right" in the drawing and "move the middle box right" in the diagram are the same reading with a different host. Follow-ups and corrections ("no, not the first one, the middle one") change the selection of the last action and run it again.

**Fewer worlds, not one big world (answer to the owner).** Do not merge the tab worlds into one: every phrase would compete with every other, which is the wrong-world problem. Keep two kinds of things and say so in the specs: **tab worlds** (what the user does: one per tab) and **shared modules** that tabs import and that never compete in routing: `space`, `common.sense`, the knowledge catalog lookup, and the follow-up handling of the dialogue layer. Report which existing worlds are really modules and can stop being routing candidates (candidates in the trace today: ui.help, kids.* inside other tabs, games with no game running).

**Tests.** `training/eval/owner-log-2026-11-13.jsonl` has 5 new rows of class `space` from the owner's session of 13:09 (first house left and down; further left; the middle house; "not the first one, the middle one"; the right house). Add a generated set of 150 space requests over both hosts (selection × move × relation × layout, with 2 to 6 objects, seeded) with the expected boxes; both reasoners. Chrome probe with screenshots of 12 cases for the reviewer.

**Order:** after P1 and P3 of SCENE-NATURAL; P2 and P4 are built on this module. If sopworld lacks something (ordering, median, a function over a set), write it in questions.md of this repo and continue with a host function; the reviewer passes it to the library.

## Reviewer 2026-11-13 14:40 — UNDO-REDO (owner): redo, and one step per user request

1. **Redo.** There is undo but no redo. Add "redo" (words: redo, do it again after an undo, put it back) and a Redo button next to Undo wherever an Undo button exists. sopworld has labelled marks and redo since 0.11; the ops reasoner needs the same behaviour. A new action after an undo clears the redo list; the reply says what was redone, as undo does.
2. **Granularity: one step is one request of the user.** The owner sees several of his requests undone together. Rules:
   - one message that asks one thing = one step, however many objects it changed ("draw 3 houses" is one step);
   - one message with several requests ("draw a sky and a sun") = one step per request, undone last first; "undo" undoes the last request and says which; "undo all of that" or "undo the whole message" undoes the message;
   - effects the user did not ask for (the engine's answer in a game, advice, a pond made for a fish) belong to the step of the request that caused them;
   - never merge two messages into one step.
   Find where steps are merged today (session undo timeline of RESTORE-1, the grouping added for the chess engine reply) and report the cause.
3. **"Undo the X"** (undo a named earlier step, not the last): if the step is independent of later ones, undo only it; otherwise say what else would be undone and ask.
4. Tests in both reasoners and across worlds (undo/redo through a tab switch), a Chrome probe with the Undo/Redo buttons, and rows in the smoke suite.

## Reviewer 2026-11-13 14:55 — AVATAR-FROM-PARTS (owner): the avatar becomes a drawing made of replaceable parts

The owner finds the avatar system limited: fixed pictures from a library, few things can change. He wants a real vector face made of small elements that can be replaced, resized, moved and recoloured, built from a description, like a police sketch, with a few presets.

**Data:** the knowledge world `k.faces` of sop-knowledge-worlds (Round 6 there, in progress): slots of a face with anchor boxes, variants per slot with plain features (round, long, thick, curly, small, smiling…), presets, expressions, colour names. Loaded by lookup like `k.objects`. Start on the hand-written core when it lands; a stub of 3 variants per slot is fine until then.

**In the app:**
1. **Renderer.** The Avatar tab draws the face with the DRAW-FROM-FACTS renderer (one slot after another, mirrored pairs, colours from the face's palette). Crisp at any size; the small avatar in the header uses the same data.
2. **Describe a face.** "a woman with a long face, small green eyes, thick eyebrows and curly red hair, with glasses" → choose per slot the variant whose features match best, say what was chosen and what could not be matched ("I have no freckles yet"). Unnamed slots keep the current variant. Open slots and features are read by frame, as in KNOWLEDGE-BY-LOOKUP; no training rows per feature.
3. **Change one element.** "another nose", "the next mouth", "a bigger nose", "eyes closer together", "raise the eyebrows", "longer hair", "blue eyes", "no beard", "swap the glasses for round ones". Size, position and distance changes go through the SPACE module inside the face frame, with limits so that it stays a face. "what noses are there?" shows the variants as small pictures to tap.
4. **Expressions and talking.** happy, sad, angry, surprised, sleepy, wink switch the variants named by `k.faces.expression`; "make it happy" on the Avatar tab is this. While the voice speaks, the mouth alternates the talking pair.
5. **Presets and saving.** The presets of `k.faces` appear as today's character choices; a face the user made can be named, saved in the profile and reloaded ("save this as Grandma", "be Grandma").
6. **Shared with drawing.** "draw me in the picture" / "draw a girl with red hair" in the Drawing tab places a face (later a figure) as a composite object, addressable by parts like any other.
7. **Old avatars.** Keep the current DiceBear-based characters selectable until the new faces cover them; then remove the library. Report the bundle size before and after.
8. Everything is undoable (one step per request), works in both reasoners, and has replies in plain words.

**Tests:** 60 descriptions with the expected variant per slot (seeded from the features), 30 single-element changes, expressions, save and reload; a Chrome probe with screenshots of 12 described faces for the reviewer and the owner.
**Order:** after SPACE (it needs the module); SETTINGS-COHERENT and UNDO-REDO are independent.

## Reviewer 2026-11-13 15:25 — TALK tab (owner): a conversation that draws itself; experiments to improve the demo

**Purpose of the whole demo (owner):** show how worlds and knowledge combine. The Talk tab is where this is visible.

**What it is.** A new tab "Talk": a chat about things, where an answer can come with a small picture made from knowledge, and where the conversation itself is shown as a board of topics.

1. **Answer cards, chosen by the shape of the answer, no extra model.** The world `talk` reads the question frame, looks the things up (KNOWLEDGE-BY-LOOKUP) and picks a card:
   - what is / what does X look like → a drawing of X (`k.objects`), with its named parts on tap;
   - what is X made of / parts of X → a small part diagram (boxes from the object's parts, the SPACE module lays them out);
   - is X a Y / kinds of X → a small tree (`k.words` is-a, `k.animals`, `k.food`);
   - where is X / neighbours / capital → a small map card (`k.geo`, centre and box only);
   - which is bigger / more / how many → two or three bars or counted icons (`k.space`, `k.geo`, `k.animals`, `k.units`);
   - when / order (months, seasons, planets from the sun) → a line with points (`k.time`, `k.space`);
   - can X do Y / where does X live → the drawing in its place with a tick or a cross (`k.commonsense`, `k.animals`).
   A plain sentence always comes with the card. No fact found → a plain "I don't know that yet", no card.
2. **The topic board.** Each thing talked about becomes a node; a link goes from the topic the user came from ("and its moons?" hangs under Jupiter). Follow-ups without a subject use the current node (SCENE-NATURAL P2). Tapping a node scrolls the chat to that part; "what did we talk about?" shows the board and a one-line summary per node; the board can be saved as a picture. Layout by the SPACE module (tidy tree, no overlaps). Desktop: board beside the chat; phone: behind a button.
3. **Cards are alive and travel between worlds.** A card can be changed by talking ("make it red", "show the moons too", "bigger"), and sent to another tab: "put it in my drawing" (becomes a composite object in art.draw), "make a diagram of this" (diagram.sketch), "show it on the map" (geo.map). This is the visible combination of worlds: each transfer is one undoable step and the reply says which tab took it.
4. **"How do you know?"** on any answer shows a card with the path: the words of the question → the frame → the knowledge worlds and shards used → the facts (with their source and licence) → the card. Built from the trace that already exists; in plain words, no internal names.
5. **About the user and the session.** The same tab answers from user.profile ("what do you know about me?") and from the session ("what did I draw today?", "how many moves did I make in chess?"), each with a small card. Nothing leaves the device; say so once.
6. **The avatar reacts** (after AVATAR-FROM-PARTS): expression by the kind of turn (found, not found, surprise at a big number), and it can be asked to "look like" a topic's drawing.
7. **Honest scope.** No free chat. The opening line and the suggestion chips show what it can talk about, taken from the catalog's worlds (things, animals, food, places, space, body, words, units, time). A message outside that gets a plain refusal with two suggestions near the user's words (nearest catalog entries).

**Experiments (report each in worker-log with numbers; they decide what stays):**
- **E-T1 Coverage of real questions.** Write 300 child-level questions over the catalog's domains without looking at the facts (seeded templates × the 1,500 common things list × 10 hand-written free-form per domain). Measure: frame read, fact found, card chosen, answer right (hand check of 60). This shows which knowledge is missing; send the gaps to the reviewer for sop-knowledge-worlds.
- **E-T2 Which card helps.** For 40 answers, render sentence only vs sentence + card; the reviewer and the owner judge the screenshots. Drop card kinds that add nothing.
- **E-T3 Follow-up depth.** 30 scripted conversations of 6 turns with ellipsis and corrections ("and Saturn?", "no, the other one", "bigger than Earth?"); measure how many turns stay on the right node.
- **E-T4 Cross-world transfers.** 30 transfers of a card to art.draw / diagram.sketch / geo.map and back ("ask about this" from a drawing opens Talk on that object); all undoable; both reasoners.
- **E-T5 Cost.** Time and steps per turn on the phone profile, first hit and warm; the catalog cache size after a 30-turn conversation.

**Build order:** card kinds 1 (drawing, parts, bars, line) + the board + "how do you know" first, publish, then transfers, then the rest. It uses SPACE and P2 of SCENE-NATURAL: start after those two; the question frames and card renderers can start now in a separate worktree. Gates: smoke per commit, full before each publish, A/B clean, no encoder retraining (if routing to `talk` needs it, stop and report: the frame decides, and Talk is the active tab).

## Reviewer 2026-11-13 15:45 — network rule, model timeouts, "box shaped like", E2 test, DESCRIBE-ALL kids.common: accepted

**Validated at 18033a4:** `npm run test:smoke` 207 pass, 0 fail, 115 s on the reviewer box; A/B dialogues clean. Your diagnosis of "Pariss" is accepted (wall-clock budgets, already replaced), and the real defect you found instead (an unbounded wait for the catalog that changed "what is a comet" into "I don't know") is the more important fix. The no-network guard for tests is accepted.

Two small items:
1. **"delete the box End" deletes Start** when only Start exists (found by you, not fixed). Fix it now with SCENE-NATURAL P3: a named referent that is not in the scene is never replaced by the only object there; say that End does not exist.
2. **Model timeout rate on a phone:** the counter exists; the owner's phone shows it in the debug panel. No harness needed now.

Then the queue, in this order: SCENE-NATURAL (replay report first), SPACE, SETTINGS-COHERENT (parallel worktree), UNDO-REDO, TALK (frames and card renderers may start in parallel), AVATAR-FROM-PARTS.

## Reviewer 2026-11-13 16:00 — WORLD-OF-WORLDS (owner): an experiment in symbolic routing, so that a new world needs no retraining

**Owner's idea:** choosing the right tab is a symbolic problem. Have a world about worlds: one schema, one instance per world, and rules that pick the world from what each world is and from its state. Retraining DistilBERT for every new world does not scale and does not work well.

**Design to try.** A shared module `meta.worlds` (not a tab, never a routing candidate itself):
1. **One instance per world, generated, not hand-written** (`scripts/build-world-cards.mjs`, stale check in a test), from the world's matrix, operations, `describe.sop` and lexicon: `meta.world id= tab= kind=tab|module`, its **actions** (verb groups: draw, move, play, read, count…), the **kinds of things** it holds or makes (shape, box, piece, word, country…; for art.draw and Talk also "any thing of the knowledge catalog"), its **question frames**, its **names** ("the drawing", "the diagram", "chess"), and whether it needs something **running** (a game, an open document).
2. **Live facts each turn** (cheap, from state the host already has): the active tab; per world: is something running, the names and kinds of the things in its scene, the last action and its objects, whether it asked the user a question last turn.
3. **Routing as rules with reasons** (sopworld rank / judged readings, soft scores, all in SOP Lang):
   - the message names a world → that world;
   - the last turn asked a question → its world answers first;
   - a fragment or follow-up → the world of the last action (SCENE-NATURAL P1, P2);
   - a referent of the message is in a world's scene → that world (strongest evidence after naming);
   - the verb belongs to a world's actions and the thing is of a kind it holds → that world; among several, the active tab wins;
   - a world that needs something running and has nothing running cannot take a message that does not start it;
   - knowledge frames with no tab action → Talk (or the conversation composite until Talk exists).
   The result is a ranked list with the rule that fired, shown in the trace in plain words ("because the crocodiles are in your drawing").
4. **The encoder becomes one signal.** Its world scores enter the ranking as a prior with a weight; they never override a referent or a running-state rule. A new world is added by its card alone.

**Experiment (report in worker-log, table per set):** compare three routers: A = today (encoder dispatcher + rules validation), B = symbolic only (`meta.worlds`, encoder off), C = symbolic with the encoder as a prior. Sets: operational (all), dialogues, minimal pairs, `owner-log-2026-11-13.jsonl`, and a new **wrong-tab set** of 200 messages said on a tab other than their own (seeded: every world's canonical requests × 3 other active tabs, plus 40 fragments after a turn). Measure right world, wrong world, asked, time per message.
- **The hold-out test that matters:** remove one world from the encoder's label set without retraining (mask its outputs) and route with B and C; do it for 4 worlds in turn (art.draw, diagram.sketch, geo.map, games.chess). Then add the TALK world's card with no training at all. Report how much is lost against the trained case.
- **Decision rule for the reviewer and the owner:** if C is at least as good as A everywhere and B loses less than 3 points on the hold-outs, routing moves to `meta.worlds`, the dispatcher's world head stops being retrained for new worlds, and A stays behind a setting for comparison.

**Limits to respect:** general means only; no per-message rules; the cards must stay small (the DESCRIBE-ALL size gate counts them); both reasoners; smoke per commit. If sopworld lacks something for ranking with reasons, write it in questions.md.
**Order:** start now in a separate worktree, in parallel with SCENE-NATURAL: P1 of SCENE-NATURAL is the first rule set of this module, so build P1 inside `meta.worlds` rather than twice.

## Reviewer 2026-11-13 16:40 — WORLDS-AS-MODULES (owner): one theory for the owner's third log, no point patches

**Data:** `training/eval/owner-log-2026-11-13b.jsonl`, 63 turns in the Draw tab, each with class and `expected`. Only 11 did what the owner meant. This build did not have SCENE-NATURAL, SPACE or WORLD-OF-WORLDS yet, so first run the replay on your current worktrees and report what those already fix. Do not fix single rows; every item below is a general mechanism and is measured on this log plus the two earlier ones.

**Owner's direction:** worlds are reusable modules that are combined. A world learns to delegate: it gets reasoning, defaults and gap filling from other worlds. Rebuild from modules and reuse; do not patch each tab.

**Why the turns failed (counts on 63):** translation left source words or picked the wrong sense (10: "linga", "fetita", "in to turn off" for left, "the girl of the house" for in front of); lists and fragments read as separate sentences and taken by hangman, chess, music, tasks, docs (13 foreign-world readings, one started a chess game and changed tab); continuations and corrections not known as such (9); kinds not drawn though knowledge has a relative (villa, puddle, grandfather, donkey, baby) (5); things placed where they do not belong and then a remark every turn instead of a right default (goat, cow, house, sun) (5); lake and grass replace the ground instead of being things (3); "different corners", "a bit lower" turned into a corner (5); two turns with no reply at all; typos in the source language (5).

### The theory: a turn is five questions, each owned by one module; a tab world owns only its actions
1. **What kind of turn is it?** new request, continuation, correction, complaint, question about what happened → `session.dialogue` (new, M1).
2. **Which world takes it?** → `meta.worlds` (in work). Add the rule this log needs: an action that would be refused in its world's present state (hangman with no game) loses to every other reading; a reading from another world than the active tab must cover the whole sentence and never changes tab or starts something from a fragment.
3. **Which things, where, how many?** → `scene` (new, M2) on top of `space` (in work).
4. **What is missing?** → delegation (M3): the world states the gap, another module fills it and says where the value came from.
5. **Was the English right?** → the translation layer picks among candidates by what the reader understands (M4).

### M1 `session.dialogue` (shared module, not a tab)
Holds the focus (last thing, last action, last place, last world) and reads the turn kind before any tab world:
- **continuation:** a turn with no verb or no thing inherits them from the focus ("on the lake", "further right", "and lower", "a sun", "a house and 2 fish");
- **list:** in "V a, b, c and d" every item inherits V and the frame; items are never separate sentences;
- **correction:** "no X, Y", "not on it, on the swing", "that is centre, not right", "I said X", "I mistyped X" → undo or amend the last request and redo it with the change (uses UNDO-REDO: one step);
- **complaint or why-question:** "why is it so low", "why did you not answer", "how did you get to chess" → an answer from the trace in plain words (which reading, which default and its source) and an offer to undo; never an action in some world;
- **question about the scene:** "did you not draw a girl before?" → answered from the scene and the history.
One contract for every tab: the tab receives a complete request (verb, things, place) or nothing.

### M2 `scene` (shared module; art.draw becomes scene + shapes from knowledge + renderer)
- regions (sky, ground, water, grass) are things with an extent: several lakes, a small lake on the left, grass above the lake; adding one never replaces another unless asked;
- relations kept as facts and re-applied when things move: on, in, next to, in front of, behind, above, sitting on; "next to X, on the left" is one place;
- amounts: "a bit", "more", "further", "still" are steps from the present place; a corner only when a corner is said;
- sets: "a fish", "the fish" (all), "the first", "each in a different corner" (distribute);
- the same module serves diagram.sketch, geo.map pins, Talk cards and the avatar parts; report which hand-written move/place patterns each tab drops.

### M3 Delegation: needs and offers
A world declares what a request needs (kind drawable, place, size, colour, count); modules declare what they offer. The engine fills a gap in this fixed order and records the source on the wire: said by the user > dialogue focus > scene state > knowledge > the world's own default.
- kind not drawable → knowledge `stand_in` / kind-of / nearest drawable relative, said once ("a villa, drawn as a house"); person kinds (child, baby, boy, girl, grandfather) are variants of person and are found by any of those names later;
- place not said → usual place from knowledge (k.scenes, k.commonsense): sun in the sky, duck on water, goat and house on the ground. The remark about fish in water is given once per thing and only when the user put it there; never as a suffix on other turns;
- the same contract for size, colour, count, and for other tabs (a chart asks knowledge for units, a map asks for the capital). Write it once in the host and once as a proposal for sopworld (they get a task for needs/offers); no per-world code.

### M4 Translation chosen by understanding (all languages, nothing per language)
- produce candidates from every available translator (browser Translator, on-device model, rules) plus one candidate after source-side spelling repair (missing diacritics and near words from the model's own vocabulary);
- reject a candidate that still has source-language words (token seen in the input and not English);
- among the rest take the one the reader understands completely in the active tab; ties → the browser translator. Log all candidates in the phrase export.
- reply side: no interjections ("voilà", "Ta-da", "S-A comis", "Pst") in any language; replies generated in plain English and translated whole.

### Invariants (tests, both reasoners)
- every turn gets a reply (rows 11 and 51 gave none: find the cause and add the test);
- if any part of one sentence is not understood, nothing destructive runs from the other parts; ask instead, with the understood part named;
- no reading changes tab without the tab being named.

### INPUT-HISTORY (owner)
Arrow up in the chat box recalls earlier sent messages, arrow down goes forward, the unsent draft is kept and comes back at the end; works in every tab, per session, typed and voice turns; only when the caret is on the first line (up) or last line (down). On touch: tap a past message → it is copied to the box for editing. A recalled message that is edited and sent right after a failed turn counts as a correction (M1).

### Measure and order
- Chrome replay of the three owner logs after each module; report table per class. Targets on log b: at least 50 of 63 as expected, 0 foreign-world readings, 0 silent turns, no turn above 1.5 s warm on the reviewer profile (row 61 used 1,056,197 ticks: say why).
- A/B gate and smoke per landing as usual; the hold-out idea from WORLD-OF-WORLDS applies: add M1–M3 to one tab you did not design them on (diagram.sketch) and report what worked with no new patterns.
- Order: invariants and INPUT-HISTORY now (small); M1 inside the meta.worlds worktree; M2 continues SPACE; M3 after M2; M4 in a parallel worktree. Questions and counter-proposals in questions.md.

## Reviewer 2026-11-13 16:55 — NO POINT FIXES (owner, repeated from his message in your session; standing rule)

**Owner:** fixing failing cases one by one teaches us nothing and most of the time now goes into test runs. Failing cases are collected; when there are hundreds they are grouped and the real cause is found. The answers are system-level rules, new worlds and links between worlds, never a patch per case. This holds even for a case that passed before.

**Rule from now on:**
1. **A failing case is data, not a task.** It goes to one ledger, `training/eval/failures.jsonl` (text, tab, language, what happened, what was expected, where it came from, first seen, build). No code change for it alone. Regressions go to the same ledger with `was_passing: true`.
2. **Tests that fail on such cases do not block.** Move them to a `known-failures` list that the suite reports as a count per class; the smoke suite keeps only invariants (every turn gets a reply, nothing destructive on a partly understood sentence, no tab change without a named tab, no network effect on a reading, undo/redo, build loads). Report the new smoke time; target under 60 s on your box.
3. **Work happens per cause.** When the ledger has a few hundred rows (it has now: the three owner logs, round-trip failures, minimal pairs, coherence) run `scripts/analyze-failures.mjs`: group by cause, count, show five examples per group. A change is accepted only if it names the group, is a general mechanism (a rule at system level, a module, a link between worlds, a knowledge lookup), and reports the group's count before and after plus what it broke in other groups.
4. **Not accepted:** a new pattern, lexicon entry, synonym, exception or regex added for one phrase; a test written for one phrase; rerunning the full suite after a small change. The reviewer will read diffs for this and send such commits back.
5. **Suites:** smoke once per landing, not per commit; full suite and the replay of the ledger once per module landing or once a day, whichever is later. Say in worker-log how many minutes of the day went to test runs.
6. **Bugs that are not language cases** (a crash, no reply, the build not loading, data loss) are still fixed at once.

**First thing to deliver:** the ledger filled from what exists, the grouping report, and the smoke suite reduced to invariants. Then WORLDS-AS-MODULES in its order; its targets are per class on the ledger, not per row.

## Reviewer 2026-11-13 17:10 — validated at 1504a75; KNOWLEDGE-ALL-WORLDS; sopworld 0.16.0

**Validated at 1504a75:** `npm run test:smoke` 242 pass, 0 fail. It now takes 261 s on the reviewer box (was 115 s with 207 tests): it is growing the wrong way. Cut it to the invariants as in NO POINT FIXES, item 2. Your test policy entry matches the owner's rule; accepted.

**sopworld 0.16.0 is validated: re-vendor it.** Round 18/19 there builds what WORLDS-AS-MODULES needs as library modules: `std.fill` (delegation with tiers), `std.focus` (last thing, action, place), relations, why-answers, "would this be refused" dry run, all-or-nothing groups. Build M1 and M3 on those, not in host code; if you need one before it lands, write the need in their questions.md format in your worker-log and the reviewer forwards it.

**KNOWLEDGE-ALL-WORLDS.** The catalog has 11 worlds; the demo reads three by type-specific code (k.objects for drawing, k.commonsense and k.words in facts.mjs) and does not use `stand_in` at all. Make the reading generic:
1. `facts.mjs` reads any `k.*` wire through the catalog's index (type, keys, `core.source`), no code per world; a new world in the catalog is usable with no PSys2 change. Test with a world added to a fixture catalog.
2. Use `k.objects.stand_in` and the kind-of links for things with no drawing (M3).
3. `k.faces` (134 hand-written variants, presets, expressions, seven imported styles) is the data for AVATAR-FROM-PARTS: no face shapes in PSys2.
4. `k.scenes` (in work in the knowledge repo: usual place, relative size, person kinds) feeds M3 defaults; until it lands use k.commonsense.
5. Report a table: world, used by which tabs, by which mechanism.

## Reviewer 2026-11-13 17:40 — SPACE as one general world (owner): design, used by drawing, diagrams, avatar, Talk cards, maps

**Owner's question (also asked in your session):** can one space world be general and clever enough for every tab: avoid overlaps naturally, know the surface of each piece, join pieces that are near, keep them apart when asked, take layouts from general knowledge? Reviewer's answer: feasible, if it is split in three layers and the numbers are computed by functions, not by rules. This block replaces the earlier SPACE block and M2 of WORLDS-AS-MODULES where they differ. Write your own view and objections in questions.md before building.

**Layer 1: what a piece is (facts).** Every placeable thing, in any tab, is a `space.piece`: an extent (box) and, when known, an outline (from the part points of k.objects / k.faces), a layer (behind, in front), and named anchors (top, bottom, centre, left, right, plus anchors given by knowledge: seat of a swing, surface of a lake, chin of a head, port of a box). A piece may contain pieces (a face holds eyes; a scene holds a lake; a box holds a label), so the same facts serve an avatar, a drawing and a diagram.

**Layer 2: what must hold (relations and rules, SOP Lang, sopworld `std.relations`).** Relations are kept facts, not one-off moves: on, in, next to, left of, above, in front of, behind, attached to, aligned with, same size as, apart from, inside the frame. Rules add relations nobody said, each with its source and each defeasible by the user:
- pieces do not overlap unless one is in, on, behind or attached to the other;
- a piece stays inside its container;
- pieces that are near and of a kind that joins (wall and roof, arm and body, arrow and box, hair and head; from knowledge "part of" and anchors) become attached at matching anchors; "do not join them" / "apart" removes it and is remembered;
- usual place and usual relative size from knowledge (k.scenes) when nothing is said;
- when a piece moves, what is on it or attached to it moves with it; what was merely next to it does not.
Conflicts are ranked with the delegation tiers (said by user > focus > scene > knowledge > default) and a refused relation gives a plain reason ("the cow cannot go lower: it is on the ground").

**Layer 3: where things go (a small solver, one function for all tabs).** Input: pieces, relations, the frame. Output: positions and sizes, changing as little as possible from the present ones (stability: nothing the user placed jumps). Steps: named layout first if there is one, then relation constraints, then overlap removal by smallest moves, then a check; if no solution within the step budget, keep the last valid state and say which relation could not be kept. Deterministic, both reasoners call the same function; no wall clock.

**Layouts are knowledge, not code.** A layout is a named arrangement with slots: row, column, grid, ring, scatter, corners, stack, tree, flow left to right, landscape (sky above ground, water in ground), face (the slots of k.faces), room. They live in the knowledge repo (`k.layouts`: slots, their relations, when it is usual), are found by lookup like any fact, and "arrange them in a ring", "each in a different corner", "like a family photo" pick one. A new layout needs no PSys2 change.

**Who uses it:** art.draw (scene), diagram.sketch (boxes, arrows attached at ports, no overlaps, flow/tree layouts), ui.avatar (face layout, parts attached at anchors, resize a part and the neighbours adapt), Talk cards (board layout), geo.map (pins and labels that do not cover each other). Each tab keeps its actions and renderer and drops its own placing code; report the lines removed per tab.

**Experiments before it is made the default (report per tab, on the ledger classes place, relation, amount, distribute, default-place plus 30 new scripted scenes per tab):**
- E-S1 overlap rate and frame escapes after each of 200 scripted additions and moves: target 0 unwanted overlaps;
- E-S2 stability: mean displacement of pieces the request did not mention: target near 0;
- E-S3 joins: 40 near pairs that should join and 40 that should not: errors and whether "apart" is respected afterwards;
- E-S4 the same 20 requests ("put A next to B", "arrange in a row", "bigger", "swap A and B") in drawing, diagram and avatar with no tab-specific patterns;
- E-S5 cost in steps for 10, 50, 200 pieces on the phone profile;
- E-S6 hold-out: a layout added only in the knowledge repo is usable without a PSys2 change.

**Limits to say honestly in the report:** outlines are approximate (boxes and convex hulls first; true shapes later if E-S1 needs it); "natural" joining depends on knowledge having anchors, so list the kinds without anchors; the solver is not a physics engine.

**Order:** pieces and relations on art.draw first (it unblocks the owner's log), then the solver with row/corners/landscape, then diagram.sketch, then the avatar with k.faces. The knowledge repo gets `k.layouts` and anchors as a task; sopworld builds `std.relations`.

## Reviewer 2026-11-13 17:45 — answer to Q3 (SPACE-2)

Your `space` module (selection, amounts, relations, row/column/grid/circle; eval 150/150 in both reasoners) is accepted as the base; not yet probed in Chrome by the reviewer. **The 17:40 block is the scope and the acceptance criteria of SPACE-2**: add to the module pieces with outlines and anchors, relations kept as facts (today they are one-off placements), the rule set with sources, the stable solver, and layouts read from `k.layouts`. The missing sopworld functions (ordering, median, argmin) are in sopworld Round 17/19 (`std.order`, `std.relations`); move the rules there as they land and keep host JavaScript for geometry only. The size gate does not apply to `space`: it adds abilities; report instead the placing code each host drops.

## Reviewer 2026-11-13 18:05 — WORLD-OF-WORLDS results read; SPACE-2, TALK 2, AVATAR-FROM-PARTS, k.faces noted (not test-run by the reviewer, by the owner's rule)

**Routing decision:** the stated rule is not met, but the numbers answer the owner's priority (coherence in dialogue first): C is 82.8 overall against 74.0 for A, +14.8 on dialogue turns, +7.5 on wrong-tab, 100% on minimal pairs, and loses 1.4 on single operational messages. **Make C (symbolic + encoder, 30 points) the default router now**, A stays selectable under Developer. Say in About which router is on.

**Next experiment, on causes not cases (three general changes, same table):**
1. **Cards from more than patterns.** B fails where the card has no words (arith "less than", greetings, typos). Build the card also from the world's `describe.sop`, its operations and legend, its lexicon with near words, and the knowledge kinds it holds; no hand lists.
2. **A prior that knows when it does not know.** The encoder prior counts only when its top score is confident and the world is in its label set; for a world without a label the prior is absent, not zero. Report the hold-out again; target: masked C within 5 points of trained C.
3. **Refusal as evidence.** Use the dry run "would be refused in the present state" (sopworld Round 19) as a rule for every world, replacing the special case for games.
The 49 "wrong" of C on operational go to the ledger as one group, not fixed singly.

**SPACE-2:** matches the 17:40 block in scope (surfaces, joining with "apart", layouts from knowledge, rules in rules.sop). Still owed from that block: relations kept as facts after the move (moving the swing moves the child), the stability measure (E-S2), layouts read from the knowledge repo's `k.layouts` (arriving) rather than the local `KNOWLEDGE` table, the avatar face-layout command, diagram patterns for around / by height / stack through the module (no new per-tab patterns).
**AVATAR-FROM-PARTS:** the real `k.faces` is published (16 slots, 134 hand-written variants, 13 presets, 7 expressions, seven imported styles): switch from the stub, then remove the DiceBear library (1.36 MB) once the presets cover the old characters.
**Usual place and size:** `k.scenes` now has them for 2,033 drawable things, `k.people` has eight kinds of person, and there are hand stand-ins (villa, puddle and 88 more): use them in M3 instead of `common.sense` tables.

## Reviewer 2026-11-13 18:35 — validated at 7f0bcb3: smoke 242 pass, 0 fail (197 s on the reviewer box)

No test rerun beyond the smoke. Still waiting for, in this order: the failure ledger with the grouping report, the smoke cut to invariants, the replay of owner-log-2026-11-13b on the merged build (per class), router C as default. The knowledge repo now has `k.scenes` (61 scenes; usual place and size class for 2,033 things), `k.people` (8 kinds, 60 roles), `k.feelings` (30, 20 with a face expression): KNOWLEDGE-ALL-WORLDS item 1 (generic reading) makes them usable; "draw a farm" should then compose a scene from `k.scenes` with the SPACE solver (the knowledge previews pile things up: placing is your side).

## Reviewer 2026-11-13 18:55 — owner's fourth log (33 turns, English): USER-ACTIONS in the log, ONE AVATAR, "about the current discussion"

**Data:** `training/eval/owner-log-2026-11-13c.jsonl` (class and `expected`). It goes to the failure ledger; the items below are mechanisms, not row fixes.

### USER-ACTIONS in the phrase log (owner)
The export holds only messages, so nobody can tell which tab the owner was on or what he tapped between two messages. Record every user action as an event in the same log, in order: tab opened (by tap, by a message, by a transferred card), button and chip taps, option cards chosen, undo / redo, clear, settings changed, language changed, a recalled message (arrow history), microphone on / off, a drawing or card tapped. Each event: time, kind, target, tab before and after. `scripts/analyze-phrase-log.mjs` shows the timeline and flags every message whose reading used another tab than the one on screen. Export format version 3; old exports still load. Nothing leaves the device (as today).

### ONE AVATAR (owner): only the new vector avatar; remove the old one and the duplication
The owner sees two avatar systems and chaos: the avatar is drawn with glasses yet "remove eyeglasses", "add eyeglasses", "put a hat" are not understood (rows 1, 2, 4, 5, 6, 33), and row 6 went to art.draw.
1. **Delete the old avatar**: the DiceBear library (1.36 MB), its operations, patterns, lexicon, presets, tests and the `FACE_DELEGATES` hand-over. One state (`state.face`), one renderer, one set of operations. Old saved avatars map to the nearest preset once, then the mapping code goes too. Report lines and bytes removed.
2. **Data only from the knowledge repo's `k.faces`** (16 slots, 134 hand-written variants, 13 presets, 7 expressions; hats, glasses, earrings and other accessories are slots there; more hats are being added). Remove the local stub. Every slot and variant is usable by any of its names and synonyms from the catalog; no accessory list in PSys2.
3. **One generic operation set over slots** (not a pattern per accessory): add / wear / put on, remove / take off / without, change / next / another, which ones are there, colour, size, position; a bare slot name ("eyeglasses") asks add or remove from the present state. "remove X" for a part the face is drawn with must work for every slot: test it by looping over the catalog's slots, not by listed words.
4. **Space:** parts sit by the face layout and anchors of the shared `space` module (a hat on the top of the head, glasses on the eyes); resizing one adapts the neighbours.
5. **Routing:** on the Avatar tab a part of the face is a referent of that world (meta.worlds referent rule); art.draw never takes it.
6. The header avatar, the talking mouth and expressions use the same renderer. One Chrome probe at the end with a sheet of 12 faces and each accessory added and removed; send the sheet path in worker-log.

### ABOUT-THE-DISCUSSION (new, serves the goal: worlds combining)
"draw a nice chart about the current discussion", "create a chart about …", "create a document about the current discussion" (rows 17, 18, 20) are requests to another world with the session as the data. General mechanism: the dialogue module (M1) offers the session as facts (things drawn and their counts, topics looked up in Talk, games played and results, places shown); through delegation (M3) any world may take "the current discussion / what we did / so far" as its content: a chart of counts, a document with one section per world, a diagram of topics, a Talk card. One implementation in the module, no pattern per tab. Experiment: 20 sessions × 4 target worlds, right content yes/no.

### Classes seen again (ledger only, no single fixes)
- "why?" answered about an older turn instead of the last one (row 19) → M1 why-answers use the last turn.
- "random colours" for a set (rows 12, 13) → scene sets with an attribute per member ("each", "random", "different").
- "sudan capital" (row 31) → knowledge relation between two things in one request, by lookup (k.geo has capitals).
- "Ta-da!" is still in replies (row 9): the interjections were to go in every language.
- "I can't reach the picture catalog right now" on the owner's machine (row 17): say in worker-log why the catalog was unreachable there and what the user sees when offline.

## Reviewer 2026-11-13 19:00 — LOG WHAT HAPPENED (owner): the export must show the result, not only the reading

The owner's log misled the reviewer: for "get to to sudan capital" the export says `geo.show sudan`, no effects, and a reply that dropped "capital"; the owner says the screen did show the capital. The export cannot settle it. Add to USER-ACTIONS (export format 3), for every turn:
1. **What changed in the world, in plain structured form**: the state difference (things added, removed, moved, changed, with names and values: "map: centre Khartoum, zoom 6, marker Khartoum"; "drawing: +2 elephants"; "avatar: glasses removed"), produced by one generic diff of the world state before and after, not by code per world. `state.before/after` hashes stay.
2. **What was on screen**: the active tab after the turn, the visible result in words (the same text a screen reader would get: reuse or add the accessible description of each view), and every effect that ran, including view effects that today leave `effects: []` (map moves, tab switches, cards).
3. **All replies shown**, in order, including notices and suggestions, in the language shown and in English.
4. **The user's reaction**: the next action within the turn gap (undo, a repeat, a correction, a thumbs tap) linked to the turn, so a later analysis can count "undone" and "repeated" as signs of a wrong result.
5. Optional and off by default: a small thumbnail of the view per turn (size cap, local only), switchable under Privacy and history.
`scripts/analyze-phrase-log.mjs` prints a turn as: tab, message, reading, what changed, what was shown, reaction. The ledger takes its "what happened" from these fields. For the Sudan turn say in worker-log what really happened (did the map go to the capital?).

## Reviewer 2026-11-13 19:05 — LOG WHAT HAPPENED: reduced (owner)

Keep it small. Per turn the export needs only: the tab on screen, each reply shown **with the world it came from**, and what that world changed (the state difference in words). Drop item 5 (thumbnails) and the screen-reader description of item 2; item 4 (reaction) only as the next user action already recorded by USER-ACTIONS.

## Reviewer 2026-11-13 19:10 — PROGRESS (owner): show what is loading and what is being done, step by step

Loading is slow now; the owner does not mind the time, he minds not seeing what happens. One mechanism for every wait:
1. **One progress service** (`ui/progress.mjs`): any part of the app reports `start(id, label)`, `step(id, label, done, total)`, `end(id)`; the service owns one small panel (a bar plus the current step in plain words, and a "details" fold with the steps done and their times). No part draws its own spinner.
2. **Start-up:** the steps in order as they really happen: page code, the worlds (count), the reasoner, the reading model (MB loaded of total), the translator for the selected language, the knowledge catalog index, voices. The bar is weighted by measured sizes/times of the last start (stored locally), so it moves evenly. The chat is usable as soon as the rules can read; later steps continue in the panel ("still loading the model: answers may be simpler for a moment").
3. **New worlds and knowledge:** opening a tab or a lookup that loads a world, a shard, a face set or a layout shows the same panel with the name ("loading drawings: farm animals").
4. **Long turns:** when a turn passes 400 ms the input shows what is being done (reading, looking up knowledge, placing things, drawing), from the stages the engine already times; the input is blocked only while a state-changing action runs, typing ahead is kept and sent after, and a Stop button cancels where the step budget allows.
5. **Failures in the same place:** a step that fails or times out says so in the panel with what still works ("the picture catalog could not be reached: basic drawings only"), and the turn's reply does not repeat it more than once.
6. Texts are generated in English and translated like every reply; nothing per language. The steps are recorded as events in the phrase export (USER-ACTIONS), with durations.
7. Check with one Chrome probe at 4x CPU throttle and a slow network profile: screenshots of start-up at three moments, a world load, a long turn. Report the start-up table (step, ms, bytes) in worker-log; that table is also the list of what to speed up later.

## Reviewer 2026-11-13 19:25 — PROPOSAL for comment (owner asked for a method to generalise faster): ACTS × SCHEMAS. Do not build yet; write objections and a cost estimate in questions.md

Smoke at 3588006: 242 pass, 0 fail. (The reviewer's blocks of 16:40–19:10 reached main only at 17:00 local because of a failed push on the reviewer's side: read them all, in order.)

**The problem in one sentence.** Every world that does things (draw, diagram, avatar, Talk, charts, editor, map) is programmed by hand: its own patterns, its own operations, its own replies. So every world has its own holes ("remove eyeglasses", "delete the box End", "change the title", "random colours"), a phrase learned in one world helps no other, and a new world costs weeks.

**The idea.** What users ask of these worlds is the same dozen things. Say them once.
1. **Universal acts** (one shared module, about twelve): make, remove, change (set / more / less an attribute), place (move, put, arrange), connect, group / take apart, pick (which one), ask (what, how many, where, why), copy, send to another world, undo / redo, save / load. Each act has the same roles everywhere: thing, set, attribute, value, place, amount.
2. **A world is a schema, not a program.** It declares in SOP Lang: its kinds of things (or "any drawable thing from knowledge"), their attributes and value types, which acts apply, defaults, limits. Diagram: box, arrow, label; text, shape, colour. Avatar: the face slots; variant, colour, size. Chart: series, bar; label, value. Document: title, section, paragraph. Talk: card, topic. Draw: any k.objects kind; colour, size. The `meta.worlds` card is generated from the same schema.
3. **Roles are filled by the shared modules, the same way in every world**: thing and set by the scene and the dialogue focus (with spelling tolerance), place by `space`, kinds, synonyms, parts and defaults by knowledge, values by small value modules (colours, sizes, numbers, "random", "different"), what is missing by delegation.
4. **One reader.** Language is read into act + roles, not into a per-world pattern. The grammar of acts is written once; the words come from the schemas and from knowledge. The model is trained to tag act and roles, which do not depend on the world: every example from any world improves all of them, and a new world needs no training.
5. **One executor.** An act on a schema is applied generically (create an instance, set an attribute, relate two things). A world keeps code only for its renderer and for what is truly its own (chess legality, the hangman word). Undo, the state difference in the log, the reply ("I removed the glasses") and the why-answer all come from the act and are written once.
6. **Always something sensible.** In order: complete reading → do it; a role missing → fill it by delegation, do it, say the guess; the act does not apply here → say what does and where ("a chart has no hat; the avatar does") ; nothing → name the act and thing it guessed and ask one question. Never a bare "I did not understand".

**Why this scales with data.** Every failure falls into one cell: an act phrase not known (fix once, all worlds gain), a kind or synonym missing (knowledge), an attribute missing (one line of schema), a referent wrong (dialogue / space), an act the executor lacks (one implementation, all worlds gain). The ledger groups itself by cell. And a **coverage grid** is generated, not written: for every world × act × kind one generated sentence must work; the holes are the feature list (today it would show avatar × remove × glasses).

**Proof before any migration (three experiments, report with tables):**
- **P1 pilot on the avatar and the diagram** (the avatar is being rebuilt anyway): schema + acts only, zero world patterns. Compare with today's hand-written worlds on their test sets, the owner logs and the ledger. Pass: not worse on the old sets, better on the logs.
- **P2 a world from a schema alone**: add one small world nobody designed for (a seating plan, or a playlist) as a schema of under 60 lines, no patterns, no training. Measure how many of 60 natural requests work.
- **P3 the reader**: train the act + roles tagger on generated data from all schemas except two worlds; test on those two. Pass: within 5 points of the worlds it saw.
If P1–P3 pass: migrate draw, Talk, charts, editor, map one by one, deleting their patterns; report patterns and lines removed per world.

**What stays special:** games, arithmetic, shop: rule worlds with their own moves. They still declare their acts for routing and replies.
**Risks to answer in questions.md:** phrasing variety the act grammar misses; replies getting bland; cost per turn; what sopworld must provide (schema declarations, generic apply, `std.fill`, `std.focus`, relations) versus host code; how FORMALIZE-FROM-WORLDS and describe.sop already cover part of this.

## Reviewer 2026-11-13 19:35 — ACTS × SCHEMAS: approved by the owner. Build it. ("as flexible and intelligent as we can, with as much general knowledge as we can")

The 19:25 proposal is now the main line of work; objections still go to questions.md but do not wait for answers. It absorbs WORLDS-AS-MODULES (M1 dialogue, M2 scene/space, M3 delegation are the role fillers; M4 translation stays separate), ONE AVATAR (the avatar is pilot 1) and ABOUT-THE-DISCUSSION (the session offered as facts is one more source for roles). NO POINT FIXES holds throughout.

**Tasks, in order; parallel worktrees where marked:**
- **A1 The act module** `acts` (shared, not a tab): the acts and their roles as SOP Lang; the act grammar written once (English), words for acts taken from the knowledge repo's `k.actions` (arriving; until then a small local seed that is deleted afterwards). Spec first (one page), then code.
- **A2 The schema format** for a doing world: kinds (or "any drawable kind from knowledge"), attributes with value types, allowed acts, defaults, limits. Generate from it: the meta.worlds card, the help examples, the lexicon. Agree the format with sopworld (they have the same task from the library side); use their module when it lands.
- **A3 The generic executor**: apply an act to a schema-described state; undo, the state difference (LOG WHAT HAPPENED), the reply and the why-answer come from the act. Both reasoners.
- **A4 Graded fallback** (always something sensible): fill a missing role by delegation and say the guess; act not possible here → say where it is possible; else one question naming the guessed act and thing.
- **P1 Pilot (parallel): avatar and diagram.sketch on schema + acts, zero world patterns.** Table against today's worlds on their test sets, the four owner logs, the ledger.
- **P2 A world from a schema alone (parallel):** a seating plan (tables, seats, people; attributes name, place, colour) under 60 lines; 60 natural requests written by someone who has not seen the grammar (use the round-trip paraphraser and the knowledge words to vary them); report how many work.
- **P3 The reader:** generate training data for an act + roles tagger from all schemas × act grammar × knowledge words; train on the Spark; hold out two worlds. Compare with the dispatcher + patterns on the dialogue and operational sets. The dispatcher is not retrained per world again.
- **A5 The coverage grid**: generated world × act × kind sentences, run in both reasoners, shown as a table in worker-log and as a page in the debug panel; its holes become the feature list (replaces hand-written feature tests).
- **A6 Migration** after P1–P3 pass: draw, Talk, charts, editor, map, one per landing, patterns deleted, lines removed reported.

**General knowledge everywhere (owner):** every role may be filled or checked by lookup: kinds and synonyms, parts, usual place and size, usual colour, what joins what, layouts, person kinds, feelings → expressions, actions → acts. The knowledge repo is getting `k.actions` (verbs mapped to the acts with their roles), `k.attributes` (which attributes kinds usually have and their usual values), `k.values` (colour names, size words, amounts, "random / different / same"), `k.layouts`, anchors. Use them through the generic catalog reading (KNOWLEDGE-ALL-WORLDS item 1 comes first: it unblocks all of this).

**Report after each task:** one table (set, before, after), the grid's hole count, patterns and lines removed. Smoke per landing only.

## Reviewer 2026-11-13 19:55 — validated at 85f059a; ledger, smoke cut, INPUT-HISTORY, logging, PROGRESS, M4, router C: accepted

**Smoke at 85f059a: 58 tests, 58 pass, 0 fail, 123 s on the reviewer box** (your 21 s; this box is about six times slower: fine). Read, not test-run: the ledger (846 rows) with the grouping report, the invariants and the two real bugs they found (empty translation → no reply; a partly read sentence clearing the picture or starting chess), INPUT-HISTORY, export format 3 with events and `happened`, the progress service, M4, WORLD-OF-WORLDS 2 with C as default. The Sudan and catalog answers are accepted as written.

What the grouping says, and what follows (causes, not cases):
1. **Translation is the largest group by far** (291 changed meaning + 151 reader gaps + 22 residue of 846). M4 with the on-device model removes the residue on the owner logs (42 → 5). So: load the on-device model whenever the browser Translator is missing for the language, show it in PROGRESS, and make M4 the only path. Then rerun the round-trip numbers per language; the "beta" marks follow the new numbers.
2. **Log b on the rules path: 46 of 63 replies still say not understood.** That is the old per-world reading. Do not patch it: it is the first measure for ACTS × SCHEMAS (P1) and for M1 (continuation / correction / why: 69 rows, second non-translation group).
3. **Talk: 132 rows of no fact / frame not read**, mostly knowledge the fixture lacks: switch Talk to the real catalog through the generic reading (KNOWLEDGE-ALL-WORLDS item 1); the knowledge repo now has k.scenes, k.people, k.feelings, k.layouts, k.actions (14 acts, 291 verbs) and is adding attributes and values.
4. **Reading model: 83 s of the cold start at 1 MB/s (65 MB).** After P3 the tagger replaces the dispatcher: set a size target for it (under 25 MB) and say what is possible.
5. sopworld asks (their Q26) for your patterns.sop files and spec 03 copied into its `compat/psys2/` to measure an indexed matcher on the real set: do it (hand-written files only).
Then the ACTS × SCHEMAS order (A1, A2, A3; P1 and P2 in parallel), with sopworld 0.17.0 (`std.schema`, `std.acts`) when it lands.

## Reviewer 2026-11-13 20:00 — correction: the "under 25 MB" for the P3 tagger is not a requirement

The reviewer set that number without a measurement. Replace it by an experiment inside P3: train the act + roles tagger at three sizes (the present DistilBERT base; a 6-layer 384-wide model of the MiniLM class; a 4-layer one), each int8-quantised, and report size, cold load time at 1 MB/s, time per message on the phone profile, and accuracy on the seen and the two held-out worlds. The owner and the reviewer choose from the table.

## Reviewer 2026-11-13 20:05 — clarification on P3 (owner asked): DistilBERT stays

P3 does not remove the model. It is the same kind of encoder (DistilBERT today) trained for a different output: act + roles instead of world + per-world labels. The present dispatcher keeps running, as the prior of router C and for reading, until P3 shows on the tables that the act + roles model is at least as good on the seen worlds and better on worlds it never saw. Only then is it swapped, as an owner decision.

## Reviewer 2026-11-13 20:20 — sopworld 0.18.0 is validated: vendor it; knowledge worlds ready for use

- **sopworld 0.18.0** (validated by the reviewer: 322 tests, 0 fail): `std.fill` (tiers user, focus, scene, knowledge, default), `std.focus`, `std.relations`, `world.why`, `world.act([...])` all-or-nothing as one undo step, `PatternIndex`, `std.schema` (a doing world as data) and `std.acts` (make, remove, change, place, connect, group / ungroup, pick, ask, copy; refusals that name what is allowed and where; `diff` on every result). See its `examples/acts.mjs` (a seating plan and a face on the same acts). **Build A2 and A3 on these, not in host code**; P2 (the seating plan) can start from that example. What is missing for you goes to worker-log as a need; the reviewer forwards it (Round 21 there already has: send / save / undo as acts, schema → card, examples and replies, knowledge as a filler, sets and values, the session as facts).
- **Knowledge repo** (reviewer: npm test 2,489 pass, 0 fail; 18 worlds): new since your fixture: `k.scenes`, `k.people`, `k.feelings`, `k.layouts` (17 arrangements, 117 anchors, 171 joins), `k.actions` (14 acts, 52 roles with their markers, 291 verbs; 187 everyday actions), `k.values` (170 colour names with RGB, scales, comparatives), work hats and clothes in `k.faces`. Take the act words (A1) and the value words from there by lookup; delete the local seeds.

## Reviewer 2026-11-13 20:35 — answers to Q5 (SPACE-2 build) and to the ACTS × SCHEMAS objections

**Q5.**
1. **`k.layouts` is published; use its format, not your proposal** (github.com/ml-circuits-research/sop-knowledge-worlds, `docs/worlds/k.layouts/schema.sop`): `k.layouts.layout name= kind=repeating|fixed about= ordered= usual_for=`; `k.layouts.slot layout= name= count=one|many pair= optional= holds= arranged= x= y= w= h=` (box in a 0–100 frame, no notation inside values); `k.layouts.relation`; `k.layouts.anchor` (117 on hand-written objects; more coming, also as points on imported drawings); `k.layouts.joins` (171). 17 arrangements. Your "slots only" case (E-S6) is exactly a `fixed` layout with slot boxes: write `parseLayouts` for this shape. Repeating layouts (row, ring, grid) are named there and computed by your generators.
2. Convex hulls: accepted as the first version; say it in the report.
3. **Confirmed:** moving the carried thing off its support drops the fact and says so once; no refusal.
4. Tiers and `apart` as a said fact: accepted.
5. sopworld 0.18.0 is validated and has `std.relations`, `std.fill`, `std.focus`: vendor it in the main branch first, then move the rule rows.
6, 7: accepted.

**ACTS × SCHEMAS objections: accepted as written, with three decisions.**
- Generating patterns, operations and templates from `schema.sop` so that routing, undo and both reasoners keep working: yes, good first slice.
- **The executor is the library's, not the host's.** sopworld 0.18.0 already has `std.schema` and `std.acts` (make, remove, change, place, connect, group / ungroup, pick, ask, copy, refusals with alternatives, `diff`, `why`, `act([...])`); send / save / load / undo as acts, schema → card and replies, sets and values, and the session as facts are its Round 21. Your `acts.mjs` executor is a bridge: keep the English (act grammar, value parsers), the renderer and the generators in the host; switch the applying of acts to the library as soon as it is vendored, and do not grow rules in the bridge.
- P1 is judged on the owner logs and the ledger, as you say, not on the old per-world test sets alone. Undo per request (your item 8) is the owner's rule: correct.
- Phrasing variety: act phrases come from the knowledge repo's `k.actions` (14 acts, 52 roles with their markers, 291 verbs including "get rid of", "take off", "put on"), by lookup; misses go to the ledger as class "act phrase".
The cost estimate is accepted; publish the smallest slice of each as it works (SHIP-NOW).

## Reviewer 2026-11-13 20:55 — validated at 974af72 (smoke 58/58); reviewer's Chrome probe of the new avatar: findings (classes for the ledger and the acts pilot, not point fixes)

**Probe conditions, to read the results right:** local build served by `openChat`, reading = rules only, English, and **the knowledge catalog was unreachable from the reviewer's box** (github.io is blocked there), so the avatar ran on the bundled default face. 14 turns on the Avatar tab, no page errors.

| said | reply | verdict |
| --- | --- | --- |
| make the avatar an angry boy | "I have a round head now." | wrong: neither boy nor angry |
| add eyeglasses | not understood; offers "add eyeglasses to my list" | wrong |
| remove eyeglasses | "I can't find "eyeglasses" in the picture. The picture is empty." | wrong world (art.draw answers on the Avatar tab) |
| eyeglasses | not understood | wrong |
| put a hat | "I already have a bow hat." | plausible offline |
| remove the hat | "I can't find "hat" in the picture. The picture is empty." | wrong world |
| put on earrings | "I put on stud earrings." | right |
| make green eyes | not understood; offers colour mixing | wrong (worked in the owner's log before) |
| what hats are there? | "bow and none" | right offline |
| undo / redo | redo says: I did it again: "what hats are there" | redo of a question is not an action |
| give him a beard / without the beard | right | right |

**What this shows, as causes:**
1. **Without the catalog the avatar does not know its own slots.** The bundled default face must carry every slot name with its synonyms and at least "none" plus one variant per slot, so add / remove / bare name / colour work offline; the catalog adds variants. Say in PROGRESS when the face set is not loaded.
2. **"remove X" on the Avatar tab is answered by art.draw.** A reading from another world than the tab on screen, with an unknown thing, must lose to the tab's own "I have no X" (the meta.worlds rule set: the act is known in the active world, the thing is not found anywhere → the active world answers). Check why invariant (c) did not catch a reply coming from another world when the tab did not change; extend the invariant: the replying world is the active world unless the message names a thing or a world found elsewhere.
3. **Colour and preset + expression in one sentence** ("make green eyes", "an angry boy") fail in the interim reading: do not patch it; they are rows of the acts grid (change attribute; make from preset with a second change). They go to the ledger as class "act phrase" / "two acts in one sentence".
4. **Undo / redo count only state-changing requests** (a question is not a step).
Please run the same 14 turns with the catalog reachable and put both columns in worker-log, so the reviewer can separate offline causes from reading causes. Script: /home/claude/shot/av.mjs on the reviewer box; the turn list is the first column above.

## Reviewer 2026-11-13 21:15 — validated at 84e7b16 (smoke); A1–A4, P1 pilot, A5: read and judged

**Verdict on P1 (your table):**
- **Avatar: passes.** Its own tests 18/18, owner log a on the Avatar tab 6 right / 0 wrong against 2 / 4, hand-written lines 777 → about 145, patterns 40 → 0. **Make the pilot avatar the real one** as soon as these four general pieces are in (none is avatar-specific): (a) acts applied through sopworld `std.acts` (0.18.0 is vendored), (b) act words from `k.actions` by lookup, seed deleted, (c) the **decline** status: a world whose schema does not hold the thing declines and the next world reads ("draw a house" on the Avatar tab), (d) **several acts in one sentence** through `act([...])` ("an angry boy", "put on a hat and make it red"), one undo step. Then rerun the reviewer's 14 turns (20:55 block) online and offline.
- **Diagram: does not pass yet (192/771).** That is the honest size of what the diagram's own language does beyond the dozen acts. Do not port patterns. Close it with general acts and modules, then measure again: align / arrange / distribute / tidy = the `place` act with the SPACE world and `k.layouts` (the reserved `hooks.layout`); queries = the `ask` act over the schema (which, how many, is A connected to B, what is next to X); templates = `make` from a named arrangement in knowledge (a flow of N steps, a tree, an org chart are `k.layouts` + kinds); "new diagram" = remove all / make. What then remains (facts and rules inside a diagram) is a rule world part and may stay as `own`. Report the 771 by cause group, before and after each of the four, not as one number. Switch the diagram when it is within 5% of today.
- **Logs: 43 → 35 "not understood" of 165** with two worlds piloted: the direction is right, the size is small because draw, Talk, map, charts and the editor are not on acts yet, and because of fragments (dialogue module) and translation.

**Decisions on your findings:**
1. Redo cleared by a read-only turn: fix it in the engine for all worlds (a question is not a step; same as the reviewer's probe finding).
2. "why is it blue" → "why is blue blue": find the substitution; it is a general referent bug (pronoun replaced by the last noun-class word). Ledger group, one fix.
3. No tab open → generic "did not understand": use the `outOfScope` hook of the last world used. Yes.
4. The coverage grid is circular while its sentences come from the act forms themselves: generate them from `k.actions` verbs × the schema's kinds and attributes × `k.values` words (and the round-trip paraphraser), judged by the state difference, not by "read". That grid is the feature list.
5. The fourth owner log is the 13:09 space session (5 rows inside log a): there are three files; correct.
6. `tests/webchat-debug.test.mjs` 3 failures on `avatar.setColor`: delete or port with the avatar switch.

**Next, in order:** std.acts as the executor; k.actions words; decline; multi-act; avatar switch; the four diagram pieces with the per-group table; P2 with 60 hand-judged requests; P3 data generation. art.draw is the next world to pilot after the diagram numbers are in (it carries most of the owner's logs).

## Reviewer 2026-11-13 21:30 — TRANSFER (owner: "the current goal is transfer of knowledge between worlds; stop hard-coding details in each final world"). Proposal + first slice. Objections to questions.md, then build the slice.

**What must transfer, and where it lives so that it does (nothing per pair of worlds):**
1. **Things.** Today each tab keeps its own things, and moving one to another tab is code per pair (Talk card → drawing, → diagram, → map). Proposal: **one shared store of things for the session** (a module, `session.things`): a thing has an identity, a kind from knowledge, and attributes. A tab does not own things; it is a **view**.
2. **Aspects.** What a thing can show is decided by its attributes, grouped in aspects: visual (shape, colour, parts), spatial (place, size, relations), relational (links to other things), numeric (count, value, unit), textual (name, description), geographic (where on Earth), temporal (when), social (who, role, feeling). Which kinds have which aspects comes from knowledge (`k.attributes`, `k.geo`, `k.time`, `k.people`), not from the tab.
3. **Views.** A tab declares in its schema which aspects it shows and how: Drawing = visual + spatial; Diagram = relational + spatial + textual; Charts = numeric; Map = geographic; Document = textual; Talk = any aspect as cards; Avatar = one composite thing (a face), visual with parts. A thing appears in every view whose aspects it has. "Send the car to the diagram", "a chart of what I drew", "a document about the discussion", "show it on the map" need no code: they select things into a view. The acts work on the things; views redraw.
4. **Facts and rules belong to kinds, not to worlds.** "Fish live in water", "a house stands on the ground", "a villa is a kind of house" are knowledge about kinds (catalog, plus what the user teaches, stored in the same wire format in a local `session.learned` world). Every view gets them through the same delegation tiers: a remark in the drawing, a refusal with a reason in the diagram, an answer in Talk come from one fact.
5. **Words.** Act phrases (k.actions), kind names and synonyms, value words are shared (ACTS × SCHEMAS): a phrase understood once is understood in every view.
6. **Abilities.** What one module can compute is offered to all through delegation: layout (space), counting and arithmetic, lookup, translation, drawing a kind. A world asks; it does not reimplement.
7. **The user.** What the user said about himself and his things (name, "my car is red", saved faces) is `user.profile` knowledge that every view consults at the user tier.

**What a final world then contains:** a schema (kinds or "any kind with aspect X", attributes shown, acts allowed, limits), a renderer, and only what is truly its own (the rules of chess). Report per world the hand-written lines outside those three; the goal is that number going to zero.

**How we measure transfer (generated, both reasoners):**
- **T1 thing transfer matrix:** for 30 things made in each view, show them in every other view; cell = right / not applicable (no aspect, said so in plain words) / wrong. No per-pair code allowed; today's Talk transfers are the baseline to beat and then delete.
- **T2 taught-fact transfer:** 20 facts taught in one view ("a villa is a kind of house", "my dog is called Rex", "ducks float"), each used in three other views.
- **T3 rule transfer:** 20 common-sense facts each producing the right behaviour in drawing, diagram and Talk.
- **T4 phrase transfer:** the coverage grid from `k.actions` × kinds (already asked).
- **T5 skill transfer:** a layout from `k.layouts` used in drawing, diagram and avatar (E-S4 / E-S6).
- **T6 a new view from a schema alone** gets T1–T5 with no code (P2's seating plan, plus a timeline view: things with a temporal aspect in a row by time).

**First slice to build now (small, then measure T1 and T2):** `session.things` with identity and aspects on top of the acts executor (std.acts); the pilot avatar, the seating plan and one existing tab (Talk cards) as views of it; `session.learned` for taught facts with the knowledge tier reading it; the T1 matrix for those three. Then art.draw as a view (with its acts pilot), then charts and the document ("about the current discussion" becomes a selection of session things into those views).

**Not in scope:** rule worlds (games, arithmetic, shop) keep their state; they may publish results as things (a score, a list) but are not views.

## Reviewer 2026-11-13 22:30 — KNOWLEDGE-OUT (owner): tab worlds hold no general knowledge; review of the overlaps and the refactoring

**Owner's rule:** a tab world knows only how to drive its tool (drawing, diagram, chart, map, document, avatar). Everything about the world at large comes from the knowledge worlds by lookup. Expectation to test: the same level at least, and a clear rise in the quality and reach of answers.

**Review (reviewer's count on main today; `^@` wires in kb.sop and tables in code):**

| in PSys2 | what it is | in the knowledge repo |
| --- | --- | --- |
| geo.map kb: 1,001 cities, 250 countries, 38 regions | geography | k.geo: 238 countries, 867 cities, 1,065 rivers, 624 mountains, ranges, continents, capitals |
| kids.animals kb: 68 animals | animal facts | k.animals: 314 animals (legs, covering, habitat, diet, abilities being extended) |
| kids.shapes kb: 165 (88 families, 49 things, 12 colours, 9 shapes, 7 mixes) | shapes, colours, mixes, typical things | k.shapes (36), k.colours (33 colours, 25 mixes), k.values (170 colour names) |
| kids.time kb: 33 (months, days, seasons, lengths) | calendar facts | k.time |
| common.sense kb: 62 (lives in, supports, around, face part, place, rules) | common sense | k.scenes (usual place and size of 2,033 things), k.layouts (anchors, joins), k.attributes, k.commonsense |
| space.mjs `KNOWLEDGE` table | layouts and joins | k.layouts (17 arrangements, 117 anchors, 171 joins) |
| art.draw scene.mjs: `BUILTIN` drawings, `BASE_COLORS`, `COLOR_ALIASES`, `SHADES`, `PLURALS`, `KIND_ORDER`, `things.catalog.mjs` | drawings, colour names, plurals | k.objects (2,108 drawings), k.values, k.words |
| colour names or values in at least 10 files (art.draw, data.charts, docs.editor, talk, diagram lexicon, avatar default face, acts) | colours | k.values, k.colours |
| acts lexicon seed verbs; lang.common (259 entries: number words, yes / no, politeness) | act words, number words | k.actions (291 verbs), k.values (222 number words) |
| datagen tables (irregular plurals, number words, first names) in several worlds | words | k.words, k.values, k.people |
| kids.shop 26 prices, media.music 10 songs | sample content of a world | none: stays as the world's sample data, marked as such |
| ui.help 71, ui.shell 109, user.profile 92, meta.worlds 26 | facts about the application and the user | not general knowledge: stay |

**Refactoring, in this order (each step with a before / after table; NO POINT FIXES holds):**
1. **Inventory by script, not by hand:** `scripts/knowledge-inventory.mjs` lists every fact type in a world's kb, every data table in world code and every lexicon group that names things of the world at large, with its counterpart in the catalog (by name overlap) or "none". The table above is the seed; the script output is the checklist and a test fails when a new general fact appears in a tab world.
2. **One reading path:** all of it through the generic catalog reading (`facts.wires`, `thing()`), `std.fill` at the knowledge tier and the joins table the knowledge repo is building (one name, one thing across worlds). No world parses a knowledge shard itself.
3. **Offline and first paint:** a small bundled subset **generated from the catalog at build time** (the things of the 30 old built-in drawings, the colour names, the number words, the act verbs, the default face), never hand copies; the catalog replaces it when reachable. This also fixes the avatar not knowing its slots offline.
4. **Move, world by world, deleting as you go:** colours and number words first (they touch every world: one colour reader for all), then common.sense + space `KNOWLEDGE` (→ k.scenes, k.layouts, k.attributes), art.draw built-ins and tables, kids.shapes, kids.animals, kids.time, geo.map. What the knowledge repo lacks is listed by the script and sent to it (the reviewer has asked it to import what your kb files have and it lacks); do not keep a private copy "meanwhile" for more than one landing.
5. **kids.* worlds become thin**: their question patterns are the `ask` act over knowledge (Talk does the same): one implementation; report which of the five kids worlds still needs to exist as a tab world.
6. **Measure (same sets before and after each step):** the worlds' own tests, the three owner logs, the ledger groups, the Talk question set (301; fact found was 29%), the knowledge-lookup set (190), cold start size and time (the 5.3 MB of worlds should fall), per-turn steps. Plus one new generated set that shows the gain: 200 questions and requests about things the old kb did not have (animals beyond the 68, colours beyond the 12, places beyond the cities) in draw, Talk, map and charts.
7. Report lines and wires removed per world and the reuse number per world (own wires against shared).

## Reviewer 2026-11-13 22:40 — WHERE THE GENERAL WORLDS LIVE (owner): not in PSys2

Everything general that this work produces leaves PSys2. PSys2 keeps the application: the tabs' schemas and renderers, the host glue (English reading, translation, UI), the rule worlds that are its own content (games, shop, arithmetic), and facts about the application and the user.
- **Facts and SOP-Lang-only reusable worlds** (knowledge, common sense, layouts, the words of the acts, value words, world schemas that others can reuse such as the seating plan or the timeline) → **sop-knowledge-worlds**, loaded by lookup like every other world.
- **Reusable modules that need functions** (acts and their executor, schema, fill, focus / dialogue, relations and the space solver, shared things and views, why-answers, the reuse detector) → **the sopworld library's standard pack** (`std.*`), versioned and vendored.
So `worlds/acts`, `worlds/space`, `worlds/session.things`, `worlds/session.dialogue`, `worlds/common.sense`, `worlds/meta.worlds` (its rules; the cards stay generated here) are bridges to delete: for each, write in worker-log what moves to which repository, hand the SOP Lang and the function code over as a proposal in the target's format (questions.md there is theirs; put your hand-over under `handover/<module>/` in your repo with a note in worker-log, the reviewer forwards it), and switch to the vendored or looked-up version when it lands. Add this to the inventory script of KNOWLEDGE-OUT: a general module living in PSys2 is reported like a general fact. Report per landing: general lines still in PSys2.

## Reviewer 2026-11-13 22:50 — addition to "where the general worlds live" (owner): all general mechanisms go to the library

Owner: every general mechanism for handling and using worlds must be in the sopworld library so other projects can use it. Besides the modules of the 22:40 block, hand over (same `handover/` way): the catalog and lookup loader (`src/knowledge/catalog.mjs`, `facts.mjs`, offline bundle generator), the routing rules of `meta.worlds`, the turn pipeline pieces that are not about English or the UI (dry run, veto, fill, all-or-nothing, graded fallback, why), the schema generators and the coverage grid, the failure-ledger format and grouper. Write `docs/host-boundary.md`: for each directory of `src/` and `worlds/`, one line: stays (application), moves to the library, moves to sop-knowledge-worlds. The library session writes the host contract from its side (its Round 24); the two documents must agree.

## Reviewer 2026-11-13 23:30 — validated at 10e0cdf3 (smoke 62/62 on the reviewer box); TRANSFER slice, M1, P3, art.draw pilot, avatar causes: read; decisions

**Accepted as reported** (reviewer ran only the smoke): session.things + views + session.learned (T1 22 right / 38 not applicable / 0 wrong), M1 session.dialogue, the avatar probe causes (bundled face generated from the catalog, the act belongs to the open tab with its new invariant, undo counts only state changes), the map, charts and document as views, hand-over packages and host boundary.

**P3 verdict: promising, not a swap yet.** On generated data all three sizes transfer to unseen worlds (act 98.8–99.1%, spans within 4.4–5.8 points). On real messages agreement with today's reading is 76–87%, and the label set lacks what real turns have. Next for P3: (a) segment first, as the dispatcher does, then tag each piece; (b) add `none` (not a request to a doing world) and keep `ask` as the question act; (c) add real data: the owner logs, the ledger and round-trip paraphrases, labelled by the acts executor's accepted readings, with two worlds still held out; (d) give the tagger no tab and no history: the world stays chosen symbolically. Candidate size: 6 × 384 (23 MB, 21 ms at 4x), unless (c) separates the sizes. The dispatcher stays until the owner decides on a table from real messages.

**art.draw pilot: not switched, correctly** (77% of its tests, 4 checked log rows worse, 9 more "not understood"). Your cause groups are the plan; decisions:
1. **Several acts and several things in one sentence** → `act([...])` of std.acts with the engine's segmenter; first, since it is the largest cause of the log regression (also "an angry boy").
2. **Parts as kinds**: yes: a schema says "the parts of a thing are things" and the part names come from `k.objects` part names and `k.parts` by lookup ("give the house a blue door" is `make` of a part in a thing).
3. **Open classes are read by lookup, not by a generated lexicon**: a kind slot marked `any=knowledge` matches any word the catalog vocabulary knows as a kind (with its plural and synonyms) at reading time; this is general (one mechanism for kinds, colours, values) and removes "The crocodiles" as a cause. No thousands of words in generated files.
4. **Phrases of acts** (undo / redo, add, place fillers such as "whip up", "doodle", "slide it over", "go back one step") come from `k.actions` by lookup; what it lacks goes to the knowledge repo as a list by act (write it under `handover/k.actions-missing.md`; the reviewer forwards it). Not from lang.common, which is itself to be emptied into knowledge (KNOWLEDGE-OUT).
5. **Fillers and politeness around a request** ("um so like … yeah", "would you mind") are the dialogue module's job once, for all worlds, before the act reader.
6. `accepts` reading the segment text: yes.
7. **Matrix reasoner for schema worlds**: do not generate a matrix.sop per world; when acts are applied by the library's `std.acts`, both reasoners are the library. This is one more reason to switch the executor now.
8. "save as SVG", "deselect": attributes and modes of acts in the schema (format of save; pick with none), not patterns.
Remeasure art.draw after 1–5; switch when within 5% on its tests and not worse on the logs.

**T2 (taught facts) is weak (5 right of 40):** a taught fact must enter at the knowledge tier for every view through the same lookup the catalog uses (session.learned overlay exists): find why 7 of 20 fail even in the view where they were taught; report causes.

**Order now:** std.acts as executor (with act groups) → open classes by lookup → parts as kinds → k.actions phrases → remeasure avatar, diagram, draw → KNOWLEDGE-OUT steps 1–4 → P3 (a–c). Publish (SHIP-NOW) after the avatar switch.

## Reviewer 2026-11-13 23:55 — Q9 (model ablation): reviewer's decisions; two items wait for the owner. sopworld 0.23.0.

The ablation is exactly the measurement that was missing; accepted. Headline as reported: rules + M1 + symbolic routing 81.7% right; everything learned on top 83.2% (+95 of 6,099) for 165 MB, 165 s cold load at 1 MB/s and 4.8 times the time per message; wrong answers do not go down. Caveat you state yourself: most sets were written with the rules in mind; the models' room is on typos (+53), loose words and paraphrases.
1. **NX hybrid reader default → waits for the owner** (he decided "the default reader must be Hybrid"; your numbers say it rescues 6 and breaks 9). Do not change the default until he answers.
2. **Card-driven clause cutter → yes**, one task, then re-measure the segmentation model against it.
3. **Routing: C with the encoder, B without → yes**; document B as the fallback while the model loads (and say it in PROGRESS).
4. **T5 normalizer as an optional, user-triggered download → waits for the owner** (it is a default he sees: 97 MB for +0.5 point).
5. **Suspect-word leniency and "also" as a joiner → switch on** (+21 right, −14 wrong, no regression): passed, and the owner's rule is that accepted experiments are on by default. READER-ROUTE `fill`: on as well if its "no regression above 1" holds on the dialogue set.
6. **Act tagger: do not drop, do not wire.** The ablation says a learned reader has little to add where rules exist; its possible value is a world nobody wrote rules for. Keep one cheap experiment (P3 a–c with real data) and decide on that table; no runtime work.
7. **F1 unbounded `facts.thing`**: you fixed the walk (536f3c06); add the step budget and the cap per lemma as an invariant test against the online catalog.
8. Translation: no change.
**What this means for the plan:** the gain is not in bigger models but in the general mechanisms (acts, dialogue, knowledge by lookup). Robustness (typos, loose words, paraphrases: 835/987, 338/643, 22/146 with rules) is the weak side: send those three sets' failures to the ledger by cause; paraphrases-rt at 22–36 of 146 is the largest hole of all and is mostly words: measure it again once act phrases and kinds come from `k.actions` / the catalog by lookup.

**sopworld 0.23.0 is validated** (343 tests): shared things, aspects, views, `show`, `teach` / `forget` with a `taught` tier, `createCatalog` / `bundleReader` / `tools/build-bundle.mjs` (your knowledge loader, taken over: delete yours when vendored), the reuse detector. Its report on your worlds (`docs/reuse-reports/psys2.md` in the library) gives a reuse number of 0 for most worlds; its believed candidates: the selection / last-thing rules repeated in art.draw, diagram.sketch, docs.editor, docs.reader; the lookup actions of the kids.* worlds; game / move of chess and tic-tac-toe. They will come back as `std.*` modules.

## Reviewer 2026-11-14 00:10 — DEFAULTS BY THE NUMBERS and FEWER OPTIONS (owner: "set the defaults according to the numbers, you have a free hand; should we cut options?"); diagram switch; SYSTEM MAP

Validated: smoke 62/62 at f18f5114; sopworld 0.24.0 (354 tests, 0 fail) with `turn` (one request pipeline with graded fallback), `route`, `schemaGrid`, `complete`, `core.use as=`, the ledger tools: vendor it.

**Defaults (from the ablation; Q9 items 1 and 4 are now decided):**
1. Reading default = **rules** (with M1 and symbolic routing). The NX hybrid reader is no longer the default (it rescues 6 turns and breaks 9 of 6,744).
2. **T5 normalizer (97 MB): not loaded by default**; one optional download the user starts ("Help me with garbled sentences", with its size and what it gains).
3. The encoder (68 MB: segmentation and world prior; +60 right, +12 wrong, mostly typos) stays on in the background and never blocks, **until** the card-driven clause cutter and the suspect-word leniency are in and re-measured; if the gap is then under 0.5 point with no set worse by more than 1 point, it becomes optional too and the first load is model-free.
4. Suspect-word leniency, "also" as a joiner, READER-ROUTE `fill`: on (decided at 23:55).

**Cut options (settings must match what the numbers can tell apart):**
- Remove: "Model first" (126 fewer right, 136 more wrong), "Edit head" (failed its gate twice), router A, and any reading sub-option whose two values differ by less than 0.3 point on every set. Developer mode keeps a single "experiments" list for what is being measured, each with its last numbers and date; an experiment that loses is deleted, not kept as an option.
- The user-facing Reading group becomes: language; "use the helper model for typos and long sentences" (on / off, shows size and state); the optional garbled-sentence download; fix typos; say what was ignored. Nothing else.
- Write the rule in the settings spec: an option exists only while its values differ measurably or the user must choose for a reason other than accuracy (size, privacy, sound).
- Report the options before and after (count), and the cold-start table again.

**Diagram pilot at 741/771 (96.1%) → switch it** (its own commit, like the avatar), after its hooks stop calling the engine through text; keep the old world one landing for comparison, then delete. art.draw is not switched (81%); continue by causes.

**SYSTEM MAP (owner: "I am losing the overview").** Generate, do not write: one page (`docs/system-map.html`, also in the app under About) built from the schemas, the cards, `docs/host-boundary.md` and the library's reuse report:
- the path of a message as the fixed sequence of small decisions (kind of turn → world → act → things → what is missing and who fills it → apply → reply), with, for each step, which module decides, from which data, and how many alternatives it had on the owner logs (median);
- the worlds as a graph: tab views, shared modules (library), knowledge worlds, with an edge when one asks another for something (fill, lookup, view, layout), weighted by how often on the logs;
- three numbers per world: hand-written lines, reuse number, share of its turns answered with help from another world.
The trace of one turn ("why") uses the same vocabulary, so the page explains what the trace shows. This page is how the owner and new contributors see what the system has become; regenerate it at each landing.

## Reviewer 2026-11-14 00:40 — STANDING DIRECTION; validated at 3021d931 (smoke 62/62)

**Owner, 2026-11-13 22:54 (standing direction for all three repositories):** the goal is to accumulate experience in how worlds are made, to improve sopworld, to generalise, to accumulate cases, and to learn how to combine worlds so that coverage grows. Everything else is secondary. Small regressions are acceptable when generality and learning are gained.

What this changes in practice:
1. **Switch rule relaxed.** A pilot world on schema + acts is switched when it is within **10%** of today on its own tests and not more than 3 rows worse on the owner logs, if it removes hand-written language code. art.draw: remeasure after act groups / parts as kinds / open classes by lookup and switch at that rule. Old worlds are deleted one landing after the switch.
2. **The measures that count, reported at every landing in one table (generated, in worker-log and the system map):** worlds on schema + acts (count), hand-written language lines in tab worlds, general lines still in PSys2, reuse number per world, coverage grid holes (k.actions verbs × kinds × values, judged by diff), cross-world turns (answered with help of another world) on the logs and the ledger, cases in the corpus. Accuracy sets stay as a guard, not the goal.
3. **Cases accumulate.** Every owner log, ledger row, generated grid case and transfer experiment row goes into one case corpus with its cause group and stage (sopworld's ledger format); it only grows; a case that changes from right to wrong is listed, not hidden.
4. **Lessons are written down.** `docs/lessons.md`: after each landing, 3–5 lines: what generalised, what did not and why, which mechanism should exist in the library or the knowledge repo instead. This is the experience the owner wants to accumulate; the reviewer forwards the library-relevant lines.
5. **Combinations as the coverage lever.** Prefer work that makes a new pair of worlds cooperate (a view, a fill, a lookup, a transfer) over work inside one world. Count pairs that cooperate (T1–T6 matrix) as a headline number.

## Reviewer 2026-11-14 01:00 — validated at 4378f29a (smoke); landing table accepted; decisions: art.draw switch, Q10 English as a world, Q11, kids kb, next migrations

Read: Round 6 (open classes by lookup, parts as kinds, act groups, undo verbs, schema modes), KNOWLEDGE-OUT step 4–7 (one arrangement reader; `KNOWLEDGE` table and three common.sense types deleted; catalog reading fixes; gain set 1 → 88 of 145), the first generated landing table and the case corpus (5,081 cases, 0 right-to-wrong). Good work, and exactly the measures the owner asked for.

1. **Switch art.draw now** (relaxed rule: 94.8% of its tests, 4.9 below; log a identical 45 / 10). Its own commit; the old world stays one landing for comparison, then is deleted. The 31 left go to the corpus by cause; the unchecked log rows that differ go to the corpus as "changed", not as a block.
2. **Q10 English as a world: accepted, with the split of the owner's rule**: the grammar as facts and rules (morphology, argument frames, determiners and quantifiers, coordination and ellipsis, anaphora, negation, question frames, prepositions as relations, clause joiners, fillers) goes to **sop-knowledge-worlds as `w.lang.en`** (the reviewer gives that repository the task; you hand over what is in acts.mjs FORMS, lang.common, dialogue.mjs, the cutter, the value parsers, under `handover/lang.en/`); the functions that apply it (a chart or rule-driven parser over the facts) go to **sopworld as `std.grammar`** (task given there). Your side: the first slice (noun phrases + coordination / ellipsis + anaphora) read through them, gate = no change in the numbers, then grow. The indicators of Q10 item 1 go into the landing table.
3. **Q11**: forwarded to sopworld as written (replies from the diff in the host's words, referents by words with tier, domain effects for non-wire state, bookkeeping under one key, group rollback with effects). Switch the bridge piece by piece as each lands.
4. **Kids kb**: yes, the games read animals (and every fact) by lookup; the synchronous load is solved by the bundle generated from the catalog at build time (library `tools/build-bundle.mjs`), loaded synchronously like kb.sop is today; the test expectations follow the facts (fixture wording is not a reason to keep a copy). Then kids.animals and kids.shapes lose kb and question patterns; their questions are Talk's `ask` frames over `k.attributes` (baby name, covering, sound, yes / no with a count or a class, list by class, primary colours, shape of a thing): one general frame set, not per question. kids.time stays a tab (clock and calendar are state). geo.map: an unknown place falls back to `k.geo` by lookup.
5. **Next migrations by the landing table** (45,979 hand-written language lines): after art.draw, take the largest on schema + acts in this order: data.charts, docs.editor, geo.map, media.music, docs.reader. Each one: schema, hooks, renderer, its own, delete patterns; report its lines before and after and its grid holes.
6. Diagram hooks' structured calls instead of text: yes, with the next diagram touch.
7. Fillers pass: keep the two lead fillers in the forms; the real fix is in `w.lang.en` (politeness and fillers are facts there).
