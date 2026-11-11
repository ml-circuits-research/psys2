# sopworld in PSys2: status and observations

Owner: the worker session. Updated as SOPWORLD work lands. Last update: 2026-11-11 (after SOPWORLD-1b items 1, 3, 7).

## How it is switched

- sopworld is a **strategy behind a flag**, not the default. The default reasoner is `ops`.
- Switch:
  - Webchat: Settings › Developer › Reasoner (`ops` / `matrix`).
  - CLI and evaluations: `--reasoner ops|matrix`, or the environment variable `PSYS2_REASONER=matrix`.
- Only worlds that opt in with `reasoner=matrix` (plus a `matrix.sop` and a `fns.mjs`) use the library: today `kids.shop`, `kids.arith` and `kids.tasks`. Every other world takes the `ops` path in both modes.
- `games.guess#030.ro` seemed to change outcome with the switch. Cause: not that world. The eval counted kids.arith's lazily created empty state as a change in ops mode only. Fixed (a matrix world's state now appears with its first answer, as in ops); a test asserts identical replies, statuses and state for a non-matrix world under both settings.
- The library is vendored as one file in `src/vendor/sopworld/` and loaded lazily, only in matrix mode. The host layer is `src/reasoner/index.mjs` and the spec is 15.

## The experiment: what sopworld gains

- `scripts/eval-reasoner.mjs` runs the same cases in both modes:
  - the per-turn audit, which counts turns that leave the world in violation;
  - the coherence set, 30 reviewer cases: undo, default revision, abduction, explain, assumptions;
  - turn time.
- `scripts/map-ops-sopworld.mjs` writes `docs/sopworld-map.html`, which estimates how much world code the library can replace.

### Stage 1 results (sopworld 0.4.0, commit a7a8e16, reviewer rerun 2026-11-10)

| Measure | ops | matrix |
| --- | --- | --- |
| Turns that leave the world in violation | 21 of 761 (2.8%) | 2 of 745 (0.3%) |
| Coherence set (30 cases) | 17 | 19 |
| Undo | 0/3 | 2/3 |
| Default revision | 1/3 | 2/3 |
| Abduction | 0/2 | 1/2 |
| Explain | 0/3 | 0/3 |
| Turn time, three worlds, p50 | 14.4 ms | 15.7 ms (+9%) |
| Bundle | — | +196 kB raw / +55 kB gzip, matrix mode only |
| Replaceable code across all worlds | — | 32% of 15,764 lines; above 50% in ten worlds |

- `test-world --reasoner matrix`: kids.shop 147/147, kids.tasks 232/232, kids.arith 210/217. The 7 failures are listed in `worker-log.md` (SOPWORLD-1).
- Webchat in real Chrome (`scripts/test-webchat-matrix.mjs`): 18/18.

### After SOPWORLD-1b items 1, 3, 7 (sopworld 0.6.1, commit 775dfe7, 2026-11-11)

| Measure | ops | matrix |
| --- | --- | --- |
| Operational, three worlds | 219/226 | 219/226 |
| Operational, other worlds | 1020/1070 | 1020/1070 (identical) |
| Operational-ro, three worlds | 397/452 (6 wrong) | 397/452 (8 wrong) |
| Dialogues, three worlds | 220/232 | 220/232 |
| Dialogues, other worlds | 1954/2009 | 1954/2009 (identical) |
| Turns that leave a violation | 21 (2.8%) | 6 (0.8%, all are impossible events kept and flagged on purpose) |
| Coherence set (30) | 17 | **22** |
| Undo | 0/3 | **3/3** |
| Default revision | 1/3 | 2/3 |
| Abduction | 0/2 | 1/2 |
| Explain | 0/3 | 0/3 |
| Turn time p50, three worlds | 14.6 ms | 17.2 ms (+18%) |
| Library bundle (matrix only) | — | 271 kB raw / 77 kB gzip; host layer 7.6 kB gzip |

- `test-world --reasoner matrix`: kids.shop 147/147, kids.tasks 232/232, **kids.arith 217/217** (the 7 old failures are gone). Under ops: the same counts.
- Webchat in real Chrome (`scripts/test-webchat-matrix.mjs`): 18/18.
- Workarounds removed: function prefixes, second queries in `voice`, rebuilding wires for a refusal and for "three of them", the audit by re-telling (now `world.check()`), abduction (`mode=abduce`), unknown start (`delta`), ties (`ambiguous`), impossible events (`soft=true` + `issues()`), rounding (`core.precision`).
- Still in our code, on purpose: reply wording (plurals, articles), splitting "milk, eggs and bread" and list names in kids.tasks `fns.mjs`.
- One undo: in matrix mode "undo that", "that's wrong" + "yes" and repair all call the library's `mark` / `rewind`; the state of all three worlds is derived from the library; tests assert library = session state = memory.
- The 8 coherence failures left are formalizer or reply matters, not reasoner ones ("Why do I have nothing left?", "No, she gives him 4", "Tom had some apples", "Why?", "Remove eggs.", the debt refusal's wording). They are agent B's work in progress.
- Reading: matrix wins on consistency (violations 2.8% → 0.8%), undo and coherence (+5 of 30) with no change on the operational and dialogue sets; it costs about 2.6 ms per turn and 77 kB gzip loaded only in matrix mode.

### After SOPWORLD-1b item 2 (formalizer gaps closed in ops, 2026-11-11)

- Coherence set, ops: 17 → **24 of 30** (measured before merging with items 1, 3, 7; the combined rerun is part of the A/B experiment).
- The ops rules now read "Ana gives him some", "Tom had some apples", "He ate 2 and now has 3", "No, she gives him 4", "No, to my to-do list", "I buy something", "Which list did you put it on?", "three of them"; "why?" answers from the facts behind the answer; impossible statements are refused with the reason and retracted; ties and an unknown start get the same wording as matrix mode. All in Romanian too.
- Still failing in ops: undo ×3 (only the library has it), shop abduction, and `coh.arith.01`, which now fails by design: the impossible statement is refused when told, so the later question is consistent rather than `conflicting`.
- Consequence for the comparison: most of matrix mode's earlier lead came from features stage 1 built only on the matrix side. With the gaps closed in both, the remaining differences are what the library brings by itself: undo, abduction, default revision, and the per-turn consistency audit.
- The language switch "treci pe engleză" and its variants are recognized by shape (`src/translate/language-command.mjs`).

### After items 4, 5, 10 (2026-11-11 afternoon)

| Measure | ops | matrix |
| --- | --- | --- |
| Operational and dialogue sets, all worlds | identical except 1 case (`dlg.kidsA#010#1`) | |
| Turns leaving a violation | 15 (1.9%) | 6 (0.8%) |
| Coherence set (now 33 cases) | 25/33 | **28/33** |
| assumption-visible | 4/6 | 6/6 |
| undo | 0/3 | 3/3 |
| default revision | 3/3 | 2/3 |
| explain | 3/3 | 2/3 |
| Answers that rested on an assumption / said so | 0 / 0 | 3 / 2 (the third had already been said) |
| ms per turn, three worlds, p50 / p95 | 13.9 / 80.4 | 17.4 / 82 |

- Certainty: in matrix mode "I buy the ball" assumes 1 and the reply says "I assumed 1 ball." ("Am presupus 1 minge."); the phrase log records `assumptions`.
- games.tictactoe runs on the matrix (173/173): illegal moves are refused with the reason, "undo" takes back the move and the answer, "why did you play there?" explains. A scripted 28-message game gives identical replies and board in both modes. Chrome: 31/31.
- SOP Lang v1.1: one language and one parser; `matrix.sop` goes through our parser to the library as wires; all 177 world files parse as before.
- Reviewer (9ce4f5d): the item 2 fixes must also hold in matrix mode (where "why?" should use the library's `explain`). The two new Romanian wrong answers must be fixed. Being done now.

### Wave 2 (done, kept for history)

- Item 4: certainty in replies ("I assumed 1 ball.") plus the `assumption-visible` coherence hint.
- Item 5: `games.tictactoe` in matrix mode: illegal moves refused with the reason, undo, "why did you play there?".
- Item 10: SOP Lang v1.1. Our parser reads variables and `#` comments, and `matrix.sop` goes through our parser to the library as wires, so the product has one parser.

### Why the stage 1 comparison was not fair

- **Shared formalizer gaps.** Many coherence cases fail in both modes because the rules do not read the sentence: "Ana gives him some", "Tom had some apples", "He ate 2 and now has 3", "No, she gives him 4", "why?". A failure there says nothing about the reasoner.
- **Workarounds.** Version 0.4.0 needed ten workarounds in our host layer: function prefixes, second queries, rebuilding the answer wire, an audit done by re-telling, and others. The library has since fixed them as its tasks W1–W8, G11 and L1.
- **Nothing reported assumptions,** so "certainty in replies" scored 0 of 46 in both modes.
- **No line of world code has been removed yet.** Matrix mode gains only where stage 1 built the feature.

## SOPWORLD-1b, in progress (started 2026-11-11)

- **Re-vendor** at the library's main `775dfe7`: version 0.6.1, build c034e3804d4e, 265 kB raw / 75.7 kB gzip. It includes the one-language syntax (SOP Lang v1.1), so the old item 10 no longer waits.
- **Migrate** the three matrices to the new syntax and remove the workarounds the library now covers.
- **One undo:** in matrix mode the dialogue layer's undo calls the library, and the world state is derived from the library.
- **Close the formalizer gaps** in `ops` as well, so the coherence set can compare the two reasoners:
  - "why?" gives the facts behind the answer;
  - impossible statements are refused with the reason;
  - ties get "They have the same";
  - an unknown start gets "I don't know how many Tom had; he got 2".
- **Next:**
  - certainty in replies ("I assumed 1 ball.") and `assumptions` in the phrase log;
  - `games.tictactoe` as a visible matrix world: illegal moves refused with the reason, undo of a move, "why did you play there?".

### After SOPWORLD-1b item 2 in both strategies (2026-11-11)

| Measure | ops | matrix |
| --- | --- | --- |
| Coherence set (33) | 25 | **31** |
| Contradiction | 6/7 | 6/7 (the last case, arith.01, answers 3 after a refused event: by design in both) |
| Default revision | 3/3 | 3/3 (was 2/3) |
| Explain | 3/3 | 3/3 (was 2/3) |
| Abduction | 1/2 | **2/2** (was 1/2) |
| Undo, assumptions | 0/3, 4/6 (no such feature in ops) | 3/3, 6/6 |
| Turns that leave a violation | 15 (1.9%) | 0 (statements the library cannot take are refused when told) |
| Operational-ro, three worlds wrong | 6 (was 8) | 6 (was 8) |

- In matrix mode a statement that cannot be true is refused when told (the library's deny or a new soft issue, then a `rewind`), a correction is `retract` plus the corrected statement, and "why?" quotes the told leaves of the library's `explain`. See spec 15, "Coherence in matrix mode".
- Remaining in both: "Remove eggs." in the robot tab is read by another world (coh.tasks.09), and arith.01 expects `conflicting` at the question after the refusal.

## Planned full A/B experiment (done, results in "Full A/B experiment (2026-11-11)" below)

One combined run in both modes, started only after the pending changes are merged, so the results are not invalidated:

1. `test-world` for every world.
2. The user's regression sets and the gold paraphrases.
3. A replay of the user's real phrase logs.
4. The coherence set and the per-turn audit.
5. Turn time (p50 and p95) and bundle size.

For every case whose result differs between the modes, the transcript is kept, so the report shows concretely where sopworld wins and where it loses. The results are added to this file.

## Full A/B experiment (2026-11-11)

One combined run, `ops` against `matrix`, on commit c5a42ed (sopworld 0.6.1), rules formalizer, no model, no network. Tools: `node src/cli.mjs test-world all`, `scripts/eval-reasoner.mjs` (audit, coherence, parity), and the new `scripts/ab-sopworld.mjs`, which runs both engines in one process and replays every set turn by turn in one session per case. Raw data: `training/results/sopworld-ab-2026-11-11.json`; every difference as a transcript: `training/results/sopworld-ab-2026-11-11.md`; the reviewer-style classes with notes: `sopworld-ab-2026-11-11.classes.json`; the audit, coherence and parity JSON: `sopworld1-{ops,matrix}-2026-11-11.json`.

What was run (6,806 sessions, about 10,600 turns, each in both modes):

| Set | Sessions | Differ in reply or outcome | State view only |
| --- | --- | --- | --- |
| operational | 1,296 | 1 (greeting phrasing, not a matrix world) | 103 |
| operational-long | 154 | 0 | 7 |
| operational-ro (Romanian) | 2,480 | 2 (the same greeting) | 185 |
| dialogues (turns in one session) | 470 | 5 | 40 |
| loose-words | 670 | 0 | 14 |
| typos | 1,394 | 0 | 27 |
| real phrases 09c, 09d, 09e (the user's regression sets) | 6 | 1 (random song) | 2 |
| real dialogue exports (txt, 2 sessions) | 2 | 1 (random avatar look) | 1 |
| mobile phone export (108 Romanian voice fragments, one session) | 1 | 0 | 0 |
| gold, `training/nx/gold/pilot-300.jsonl` (150 rules, 100 paraphrase, 50 real) | 300 | 2 (random song) | 17 |
| coherence set (33) | 33 | 7 | 16 |
| **Total** | **6,806** | **19** | |

- "State view only" means replies and statuses are identical and only `session.state()` differs: a matrix world mirrors the library's facts into the state (kids.shop money and purchases, kids.arith holdings, tic-tac-toe history), ops keeps them in wires. These are not differences of outcome.
- The "65 gold paraphrases" of the reviewer's browser run are not in the repository (the probe script lived outside it). The gold set above is the nearest in-repo one, with 100 paraphrases. If the 65 phrases are given, `ab-sopworld.mjs` takes them as one more set.
- The user's phrase logs: the repository holds the 09c/d/e exports, the two real-dialogue text files and the 09f mobile export. No other exports exist (`training/phrase-logs/` is empty).

Results:

| Measure | ops | matrix |
| --- | --- | --- |
| `test-world`, 24 worlds | all pass | all pass; 22 worlds byte-identical lines, kids.shop 160 -> 164 and games.tictactoe 160 -> 173 tests (matrix adds its own tests) |
| Operational (1,296), outcome per case | 259/269 right on the four worlds, 980/1,027 elsewhere | identical case by case |
| Operational-long, operational-ro | same | identical case by case |
| Dialogue turns, the four worlds | 292 right, 8 not understood, 4 wrong | 292 right, 7 not understood, 5 wrong (one turn: same reply, other label, see below) |
| Dialogue turns, other worlds | 1,882 right | identical |
| Turns that leave the world in violation (audit) | 15 of 774 (1.9%) | 0 of 758 (0.0%) |
| Coherence set (33) | 25 | **31** |
| Undo / abduction / assumption-visible | 0/3, 1/2, 4/6 | 3/3, 2/2, 6/6 |
| Answers that rested on an assumption / said so | 0 / 0 (of 53) | 3 / 2 (of 51) |
| Turn time p50 / p95 ms, four matrix worlds | 12.2 / 113.4 | 14.0 / 116.2 (+15% at p50) |
| kids, other worlds | 13.3 / 104.5 | 15.0 / 104.4 (+13%) |
| avatar, shell, editor | 11.5 / 73.5 | 12.7 / 75.3 (+10%) |
| music, draw, map, charts | 12.4 / 56.6 | 13.7 / 58.3 (+10%) |
| games | 10.6 / 36.9 | 11.7 / 39.1 (+10%) |
| documents | 24.9 / 77.4 | 26.9 / 78.7 (+8%) |
| other (core, profile, help) | 10.4 / 38.6 | 11.7 / 42.5 (+13%) |
| Bundle | none | library 271 kB raw / 77.3 kB gzip, host layer 31.8 kB raw / 10.1 kB gzip: 87.4 kB gzip, loaded only in matrix mode |

Times: each session ran in both modes, alternating which went first, on a quiet machine. Matrix is 1 to 2 ms slower in every group, **including worlds that do not use the library**. So part of the cost is per-turn work of the matrix engine, not only the library's reasoning. The cause is not yet found (only measured).

Differences by class (19 sessions that differ in a reply, a status or an outcome):

| Class | Count | What |
| --- | --- | --- |
| matrix better | 6 | all in the coherence set: undo x3, an assumption said (x2), "what did I pay?" |
| ops better | 2 | one dialogue ("what did you do?" explains less in matrix), one coherence case (bare "OK." on a purchase) |
| neutral wording | 11 | 3 greetings ("how are you" picks another phrasing), 1 dialogue with the same reply and another label, 7 random outputs (random song, random avatar look, two runs of ops differ too) |
| other worlds | 0 real | all differences outside the four worlds are phrasing or random choices; nothing is caused by the library |

Representative transcripts. Matrix better:

1. Undo (coh.shop.04): "I have 20 lei." "I buy a kite." "Undo that." ops: "There is nothing to undo." then "You have 10 lei left." matrix: "OK, I took that back: "I buy a kite"." then "You have 20 lei now."
2. Undo, tasks (coh.tasks.03): "Add bread to my shopping list" then "Undo that." ops: "There is nothing to undo." matrix: "OK, I took that back: "Add bread to my shopping list"."
3. Undo, arith (coh.arith.04): "Tom eats 2 apples" then "Undo that." ops: nothing to undo; matrix: "OK, I took that back: "Tom eats 2 apples"."
4. Assumption (coh.shop.11): "I have 20 lei." "I buy the ball." "How much money do I have?" ops: "I took that as: "i buy a ball" OK, you bought 1 ball." then "You have 15 lei left." matrix: "OK." then "You have 15 lei left. I assumed 1 ball." (coh.shop.13 is the same.)
5. Reading ("what did I pay?", coh.shop.06): "I got 5 lei back for a book. What did I pay?" ops: "OK, you got 5 lei. I do not know your name yet. Tell me: "my name is ...". (I read "pay" as "say")" matrix: "OK, you got 5 lei back for a book. You paid 17 lei."

Ops better:

1. Explain (dlg.kidsB#016): after "how much do 2 puzzles cost", "what did you do?" ops: "You said "how much do 2 puzzles cost", so I answered it. What I answered: 2 puzzles cost 22 lei. I worked that out from what you told me: "A puzzle costs 11 lei"." matrix stops after "22 lei".
2. Purchase reply (coh.shop.12): "I buy the ball." ops: "I took that as: "i buy a ball" OK, you bought 1 ball." matrix: "OK." Both pass the case, but the matrix reply says nothing about what was bought; the assumption is said only at the next answer ("I assumed 1 ball."), which this case never asks for.
3. No third case. The 3,900 operational cases and dialogue turns have no other difference in outcome, so there is no wider "ops better" list to show.

Neutral:

1. "how are you" (operational kids.common#029, plus the two Romanian twins): ops "I am fine, thank you!" matrix "I am great! What shall we do?". kids.common is not a matrix world; another phrasing of the same greeting was picked.
2. "play" / "give yourself a random look" on the music and avatar tabs: random choices, they also differ between two runs of ops.
3. dlg.kidsA#010: "Zoe eats 8. How many marbles are left?" both reply "OK, Zoe ate 8 marbles. I did not understand ..."; matrix also holds Zoe = 6 marbles in the state, which the checker turns from "not understood" into "wrong" for that one turn. The reply is the same.

Verdict, in plain words:

- **What sopworld wins.** It keeps the world consistent (no turn left in violation, against 1.9%), it can undo (3/3 against 0/3), it says what it assumed, it reads a few more coherence cases (31 against 25 of 33), and it does this with no loss on any of the 3,900 operational cases and 2,240 dialogue turns, none of the user's real phrases, none of the 108 Romanian voice fragments, and none of the other worlds (their `test-world` output and their replies are the same).
- **What it costs.** About 1.2 to 1.8 ms more per turn (+8 to +15% at p50, same p95), also in worlds that do not use it; 87 kB gzip more when the matrix is loaded; two replies that are slightly poorer than ops (the bare "OK." on a purchase, the explain without its source). A second engine and a second state representation to keep in step.
- **What the experiment does not show.** The gain is concentrated on the coherence set and the audit, which were written to test exactly these features. On everything users actually type (operational sets, dialogues, real phrases) the two modes give the same answers. So the experiment shows no regression, and a gain only for the dialogue features undo, assumptions and refusal reasons. It does not show a gain in understanding.
- **Switching the default for the four worlds.** Nothing argues against it on correctness: no case where matrix is wrong and ops right apart from the two wording points above. What argues for it: undo, certainty, consistency. What still argues for waiting: the speed cost is not explained, the real-phone load time of 77 kB has not been measured, the formalizer is the same in both so understanding does not improve, and the real phrase logs hold few sessions on these four worlds (the mobile export is Romanian voice on map, draw and music tabs, with no arithmetic or shopping). The next honest test is a real session with the matrix on, in Chrome, on a phone. The default stays `ops`.
- Caveat: rules formalizer only; the hybrid model path was not run (it changes the formalizer, not the reasoner).

## Open questions and risks

- The library adds 75.7 kB gzip in matrix mode. It is acceptable while the bundle loads lazily, but it should be measured on a phone.
- Matrix mode is 9% slower per turn (p50). It must be rechecked with 0.6.1 and inside the compute budgets (`src/dialog/budget-limits.mjs`).
- The default stays `ops` until the A/B experiment shows a clear gain with no regression on the user's real phrases.

## Turn-time cost of matrix mode (2026-11-11)

The A/B experiment saw `matrix` 8-15% slower per turn (p50, 1-2 ms) in every world group, including the 20 worlds that do not use the library. Reproduced and explained with `scripts/bench-reasoner.mjs` (operational + dialogue sets, 1,766 sessions, 12,072 turns per mode per run, warm-up, 3 interleaved repetitions; `--instrument` times every `ReasonerSession` method and library call per world group; data in `training/results/reasoner-bench-2026-11-11.json`).

**Cause.** `ReasonerSession.tell` runs `world.complete({ defaults: true })` after every `session.add(wires)`, including adds of wires the library never sees (answers, questions, observations, the wires of non-matrix worlds), and dry runs / validations fork the session (`ReasonerSession.fork`) and each fork completed again from scratch. In the profile (500 cases) 14,237 of 18,189 completings were for non-matrix worlds: 2.4 s of 3.2 s, about 0.17 ms each, several per turn. That is the whole non-matrix slowdown. Nothing else is done per turn for such worlds apart from `beginTurn` (one `mark()` and one `ofType('core.issue')`, 0.01 ms), `_state` (the derivation of the four matrix worlds' state, now memoized per library stamp) and one fork per session (+0.4 ms per session, not per turn).

**Fix** (`src/reasoner/index.mjs` only, outputs identical): `_defaults` is skipped while the library's `stamp` equals the stamp after its last completing (`completedAt`, copied by `fork`, cleared when the completing ran out of budget); `_state` skips a world whose session state already equals the JSON `toState` gave for the same stamp. Verified: the replies, statuses and final state of 1,799 sessions (operational, dialogues, coherence) in matrix mode are byte-identical before and after (only the four known random-output sessions differ, as they do between two runs of the same code); `npm test`, `test-world all` and the four matrix worlds in matrix mode pass.

| p50 / mean ms per turn (ops -> matrix) | before | after |
| --- | --- | --- |
| non-matrix worlds, all groups together | 9.2-11.8 -> 1.12-1.17x p50, 1.06-1.12x mean | 1.00-1.03x p50, 1.00-1.01x mean (noise) |
| kids-other | 10.54 -> 11.78 (1.12x) | 10.13 -> 10.28 (1.02x) |
| games | 9.52 -> 10.65 (1.12x) | 8.78 -> 8.79 (1.00x) |
| music/draw/map/charts | 9.82 -> 11.21 (1.14x) | 9.92 -> 10.24 (1.03x) |
| the four matrix worlds | 9.78 -> 11.81 (1.21x p50, 1.14x mean) | 9.97 -> 11.12 (1.12x p50, 1.10x mean) |
| all turns | 9.85 -> 11.18 (1.14x) | 9.65 -> 9.93 (1.03x) |

p95 is within 1-4% in every group before and after. Session creation: matrix 1.4 ms against 1.0 ms (a library `World` fork and the `ReasonerSession` state, once per session; unchanged).

**What remains for the four matrix worlds (about 1.1-1.2 ms per turn that tells or asks the library; the profile, after the fix):** `lib.tell` 380 ms and `lib.complete` 134 ms for 2,133 tells (0.2 ms each), `rs.resolve` 300 ms for 1,100 library answers (query 130 ms, act 120 ms), `lib.check` 27 ms for 84 calls. Not ours to remove: the cost of a first change after a `mark()` or `fork()` is the library's copy-on-write `_detach` (see the library issue in worker-log.md). Non-matrix worlds still tell their `core.agent` wires (the user, the people named) because a later matrix question may rest on them; one such tell costs the same detach (0.07 ms) once per turn that introduces an agent.
