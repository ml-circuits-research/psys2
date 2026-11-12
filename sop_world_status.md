# sopworld in PSys2: status and observations

> **User decision 2026-11-11 (evening):** every world moves to sopworld behind the flag. The comparison is per world against the custom `ops.mjs` code: reach at least its correctness and speed, or say exactly what the library lacks and how to generalize it. Results go into the table "Per-world comparison" below as each wave lands.

Owner: the worker session. Updated as SOPWORLD work lands. Last update: 2026-11-11 (after SOPWORLD-1b items 1, 3, 7).

## How it is switched

- **User decision 2026-11-11: sopworld (`matrix`) is the default reasoner.** `ops` stays available behind the same flag as the fallback.
- Switch:
  - Webchat: Settings › Developer › Reasoner (`matrix` default / `ops`); settings version 4 migrates a saved `ops` once to `matrix`.
  - CLI and evaluations: `--reasoner ops|matrix` (default `matrix`), or the environment variable `PSYS2_REASONER=ops`.
- Only worlds that opt in with `reasoner=matrix` (plus a `matrix.sop` and a `fns.mjs`) use the library: today `kids.shop`, `kids.arith` and `kids.tasks`. Every other world takes the `ops` path in both modes.
- `games.guess#030.ro` seemed to change outcome with the switch. Cause: not that world. The eval counted kids.arith's lazily created empty state as a change in ops mode only. Fixed (a matrix world's state now appears with its first answer, as in ops); a test asserts identical replies, statuses and state for a non-matrix world under both settings.
- The library is vendored as one file in `src/vendor/sopworld/` and loaded lazily (a dynamic import in the engine worker), only in matrix mode, which is now the default. The host layer is `src/reasoner/index.mjs` and the spec is 15.

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

Times: each session ran in both modes, alternating which went first, on a quiet machine. Matrix is 1 to 2 ms slower in every group, **including worlds that do not use the library**. So part of the cost is per-turn work of the matrix engine, not only the library's reasoning. The cause was found and fixed afterwards: see "Turn-time cost of matrix mode".

**Refreshed 2026-11-11 (after matrix became the default, the two wording fixes, stage 2 worlds hangman/guess/shapes, and the perf work below).** Same command, 6,806 sessions, 908 s. 20 sessions differ, **0 unjudged**: matrix better 6 (all coherence, the same six), ops better **0**, neutral wording 14 (dialogues 6, gold 4, coherence 2, real-09c 1, real-dialogue 1). Outcomes on the expectation sets are the same in both modes (dlg.kidsA#010 differs only by the state-view label). The old "ops better" cases are resolved: dlg.kidsB#016 ("what did you do?") now says what ops says and adds "and from the price list" (right in both, matrix not worse); coh.shop.12 now answers "OK, you bought 1 ball. I assumed 1 ball." (ops quotes its reading). New neutral cases: dlg.drm#026 (random song), two gold paraphrases and coh.shop.08 (not understood in both; only the "did you mean" candidates differ, matrix offers "What did I pay?"). The three stage-2 worlds add no difference in reply or outcome in any set. Data: `training/results/sopworld-ab-2026-11-11.{json,md,classes.json}`.

Differences by class in the first run (19 sessions that differ in a reply, a status or an outcome):

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
- Matrix mode was 8-15% slower per turn in every group; found and fixed (see "Turn-time cost of matrix mode"): now within noise for non-matrix worlds and +10-12% (about 1.1 ms) on turns that use the library. Budgets were re-measured: library sites peak at 5,880 ticks per turn.
- **Decided 2026-11-11: the default is `matrix`.** The two wording points where ops was better in the A/B are fixed ("what did you do?" keeps its source sentence; a purchase without a count says "OK, you bought 1 ball. I assumed 1 ball.").

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

### Second round: the +8-9 ms the reviewer saw (2026-11-11)

Why the two measurements disagreed: `bench-reasoner.mjs` runs the operational set, where most sessions are a single statement or question (one dry-run fork, library mostly untouched), and its 'four' group is mostly shop/arith questions. The `ab-sopworld` sets (coherence, dialogues, gold) are multi-turn sessions that tell facts and run actions: every statement turn pays tells in 3-4 forks, and the games run whole actions (hangman, guess) in dry runs. Per-turn profile (`ONLY=matrix`, instrumented, 3 reps; ms per turn):
- kids.shop (170 turns): `rs._defaults` -> `lib.complete` 3.4 (1.1 ms per call, about 3 per statement turn: one in each of 3 dry-run forks and one in the real session), `lib.tell` 1.9, `lib.query` 0.5, `rs._state` 0.1. Mark/fork/rewind/detach, `_wire`, `beginTurn`, `commitTurn`: below 0.1 each.
- games.hangman (143 turns): `lib.complete` 2.6, `lib.act` 2.0 (the action functions plus their tells), `lib.tell` 0.6.
- games.guess (162 turns, "new game" tells about 70 animal wires): `lib.act` 7.1 (new game 7.4 ms in a dry-run fork, 3.7 ms in the real session: the fork's first change pays the library's `_detach`), `lib.complete` 3.5, `lib.tell` 2.2, plus 0.4 in our `host.view` key lookups.
- The ~1 ms per `complete` is the library walking every cell of the world (`assumptions()` in `_next`) before it finds nothing to fill. It does so also when the only open slot can never be filled (the built-in user's `name` is always open).

Fixes (outputs byte-identical; 4,733 sessions of the operational, operational-ro, operational-long, dialogue, coherence and gold sets compared turn by turn, reply, statuses and state, matrix before and after: only 7 sessions differ, all random output; `npm test`, `test-world all` in both reasoners, Chrome matrix test 50/50):
1. `ReasonerSession._mayFill`: a completing runs only when some wire has an empty slot that has a candidate (a default, or for a required slot an enum, a type or a range); otherwise nothing can be filled and the stamp is recorded as completed. Same test as the library's, in one pass over the wires.
2. `DialogSession._dryStatuses` (src/dialog/index.mjs): the spelling stage and the name repair dry-ran the same reading of the same message on separate forks, executing every action twice more; now once per reading per turn (both reasoners).
3. `host.view` memoizes `legends.tryResolveKey` per (type, key) (the games' tables ask thousands of times per turn).

`ab-sopworld --sets coherence,dialogues,gold`, p50 ms, ops | matrix, before -> after:

| world group | before | after |
| --- | --- | --- |
| four matrix worlds | 8.6 \| 13.4 | 9.2 \| 11.2 |
| games | 8.6 \| 13.1 | 8.0 \| 10.6 |
| kids-other | 8.8 \| 9.4 | 9.2 \| 9.9 |
| avatar/shell/editor | 9.4 \| 10.2 | 8.9 \| 9.4 |
| music/draw/map/charts | 10.2 \| 10.5 | 9.6 \| 10.3 |
| documents | 11.0 \| 11.5 | 9.8 \| 10.4 |
| other | 10.9 \| 11.4 | 9.1 \| 9.8 |

The gap of the matrix worlds went from +4.8 to +2.0 ms (four) and from +4.5 to +2.6 ms (games) on this machine (the reviewer's box shows about twice the absolute numbers); p95 is within noise. What remains is library cost: the first change of a fork or after a mark (`_detach`, grows with the size of the world: the knowledge-base wires and the game's animals), `tell` propagation, `act`. These grow with the number of wires in the base, which matters as more worlds move to the library: see the worker-log issue.

## Stage 2: kids.time, kids.animals, user.profile (2026-11-11)
- Ten worlds now run on the matrix (spec 15 "Stage 2, continued"). test-world: kids.time 227, kids.animals 506, user.profile 139 under matrix (217 / 497 / 126 under ops); all worlds pass in both modes.
- Bench (p50 ms, matrix, same interleaved ops control; shared machine): before: four 11.1, kids-other 9.9, other 10.1, all 9.9; after kids.time: 10.9 / 10.4 / 9.8 / 10.0; after kids.animals: 11.6 / 11.0 / 9.4 / 10.2; after user.profile: 12.1 / 11.5 / 11.1 / 10.8 against ops controls 9.8 / 10.4 / 9.2 / 9.4 (profile sessions add about 1 ms per turn: one library transaction per state change; its legend and kb add about 1.1 ms to session creation in the combined base, which the per-world split removes).


## One library World per world (user decision 2026-11-11)
Design in spec 15, "One instance per world". A session holds one World per world that was used (created on first use, a fork of that world's base, built once per engine); worlds are isolated; what several worlds know (`core.agent`, and the facts of a world another one `reads=`) is copied into the instances that know the type and replayed into one created later; undo is a session timeline of the instances each turn changed.

### Behaviour: before and after, ten matrix worlds
`scripts/dump-turns.mjs` (new): the operational, dialogues, coherence and gold sets (2 099 sessions, 4 591 turns, matrix mode, all worlds) as one JSON line per turn (reply, statuses, state), run on main (9815977) and on this change, task ids normalised. Two runs of main differ in 48 turns (random output: songs, looks), so those turns are noise. **Result: one differing turn of 4 591, and it is random output** ("play a random song"). Replies, statuses and state of the ten matrix worlds are byte-identical. `npm test`, `test-world all` (both reasoners), the webchat matrix scenarios (68/68) and `npm run test:browser` pass.

Intended differences: none in behaviour. One world file changed because the isolation exposed a real cross-world rule: `kids.arith/matrix.sop` counts what the user buys in the shop (`arith.shop`: a `kids.shop.purchase` is a buy), which only worked because both worlds were in one World. `kids.arith` now says `reads=world.kids.shop` (new key `core.world.reads`: the other world's legend and facts are in this instance, its matrix is not). Hosts: `core.world.compose` (composite worlds, specified and implemented, no world uses it) and `core.world.reads`.

### Turn time (`bench-reasoner.mjs --reps 3`, 12 072 turns, ms, same machine and run, main = 9815977)
| group | n | ops p50 | main matrix p50 | per-world p50 | main p95 | per-world p95 | main mean | per-world mean |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| four (shop, arith, tasks, tictactoe) | 1989 | 9.67 | 12.08 | 9.28 | 49.4 | 45.6 | 19.7 | 15.7 |
| avatar/shell/editor | 2529 | 8.59 | 9.28 | 7.89 | 31.3 | 27.1 | 12.7 | 11.3 |
| kids-other | 1488 | 9.91 | 11.24 | 9.90 | 69.2 | 63.7 | 20.4 | 19.0 |
| music/draw/map/charts | 3228 | 9.29 | 10.03 | 8.84 | 33.2 | 30.9 | 13.3 | 11.9 |
| games | 1356 | 8.23 | 10.90 | 8.96 | 24.5 | 20.8 | 12.1 | 9.9 |
| documents | 687 | 9.95 | 10.38 | 9.71 | 49.7 | 48.0 | 16.7 | 15.6 |
| other | 795 | 9.28 | 11.29 | 10.04 | 42.0 | 39.2 | 19.3 | 17.4 |
| all | 12072 | 9.13 | 10.71 | 8.98 | 37.9 | 33.4 | 15.6 | 13.6 |

Session creation (matrix): 2.09 ms before, 1.03 ms now (ops 1.01): a session creates no World until a world is used. The matrix is now at or under the operations on p50 in every group (the copy-on-write after a fork is paid for the size of one world, and the legends of the ten worlds are no longer loaded together). The first use of a world in an engine builds its base (a few ms, once per engine).

## Verdict of the all-worlds move (2026-11-11, after wave 4)

- **Coverage.** 21 of the 24 worlds have a sopworld version, behind the flag, and pass all their tests in both modes. The other three have no logic of their own (`core`, `lang.common`, `kids.common`). The worlds are grouped into one conversation instance (kids.*, user.profile), one instance per game, and one per tab world.
- **Correctness: equal or better everywhere.** Every existing test passes in both modes. Each world adds matrix-only gains:
  - refusals with a reason instead of a silent accept or a vague "I did not catch that";
  - an undo that names what it took back and walks back across worlds;
  - assumptions said once;
  - "why?" with sources.

  Measured on the first worlds: the coherence set went from 25 to 31 of 33, and turns that leave the world inconsistent went from 1.9% to 0%.
- **Speed: not yet at the custom code's level.** Matrix mode is slower on every world, by about 1–3.6 ms per turn at p50 (examples: chess 7.2 → 9.1 ms, diagram 8.9 → 12.5 ms, shell 9.5 → 12.7 ms). The main cause is the library's copy-on-write of the whole instance at the first write after each mark, and the per-turn state takeover.
- **Code: nothing replaced yet.** No line of any `ops.mjs` was deleted. Every matrix version is a layer of state and validation over the engines, and the share expressed as rules is 0–10% in the engine worlds. What keeps the code custom is consistent across worlds:
  - text and strings;
  - large tables, which are too expensive as wires;
  - move generation and geometry;
  - the redo / view-step bookkeeping.
- **What would close the gap** is the library generalizations listed in `questions.md` Q1, in this order:
  1. structural sharing instead of copying, which is the speed fix for every world;
  2. external or frozen fact sources;
  3. undo and redo in the library;
  4. aggregates and lists;
  5. multi-valued answers;
  6. better refusals;
  7. value kinds;
  8. cost control for rules;
  9. expressions;
  10. a public host API.

  After 1 and 2 land, rerun the bench. Then, world by world, delete the `ops.mjs` code that the rules now cover. Only then is the comparison "library vs custom code" on equal terms.
- **Fixed (RESTORE-1):** the undo timeline now survives a watchdog restart. Each committed turn carries the instances' logs, about 48 KB for 40 turns. Writing costs 0.8 ms per turn and a restore about 58 ms. Redo is not restored across a restart.

## Per-world comparison (all worlds on sopworld vs custom code)

| World | Tests ops / matrix | p50 ms ops / matrix | ops.mjs replaced by rules | Stayed custom (why) | Library improvement needed |
| --- | --- | --- | --- | --- | --- |
| docs.editor | 221 / 221 (+9 matrix-only in `tests/reasoner-docs.test.mjs`) | bench group avatar/shell/editor: 8.87 / 10.29 (before the move 9.17 / 9.35); 18-turn editor session 7.8-8.6 / 9.8-10.1, mean 9.2-10.4 / 10.7-11.1 | 0 of 1,292 lines deleted: the editing operations still change the state they were written for. New in the library: the state and its validation, 109 lines of `matrix.sop` and 199 of `fns.mjs` (document, blocks, selection, tombstones, counts, 5 invariants, target denies, undo and redo words) | The whole text engine (`ops.mjs`, `model.mjs`, `target.mjs`: editing, reference resolution, marks, tables, statistics, dictation, creating documents from other worlds' facts): strings and geometry of strings, nothing the rules can do. `guard` only reads `kind` + number and `chapter N`; "it", words, sentences, "the last ..." are resolved by the engine | See worker-log "Library improvements" (opaque values, bound variables in `why`, `core.rank`, transient wires, upsert, empty-set aggregates) |
| docs.reader | 209 / 209 (+6 matrix-only) | bench group documents: 10.24 / 11.48 (before 11.02 / 11.14); 18-turn reader session 5.0-5.4 / 7.6-8.7, mean 9.0 / 10.2-10.5 | 0 of 974 lines deleted. New: the shelf, the open document, the reading position and the search as 69 lines of `matrix.sop` and 177 of `fns.mjs` (3 invariants, denies for a sentence, paragraph, section or document that is not there, undo words) | Analysis of a text (`analyze.mjs` 972 lines), BM25 and TF-IDF (`text.mjs`), English forms, every answer and its wording, search stepping, modal free questions. The sentences, entities and events stay session facts (`untold=`: 250 wires per document cost about 1 ms per turn and no rule reads them) | Same list; plus a way to hold a big immutable value (the analysis, 28 kB) in an instance without copying or re-escaping it |
| geo.map | 441 / 459 | 5.9 / 7.8 (probe script, 9 turns x 10 sessions); whole bench group music/draw/map/charts 10.22 / 10.56 before, 9.56 / 10.11 after (ratio 1.03 -> 1.06) | state (view, markers, highlights, lines, focus) as wires, counts and total line length as aggregates, 6 claim denies with reasons, 5 state denies; about 10% of ops.mjs (918 lines) is replaced by rules; none of its code is removed | geometry (fit, zoom, pan, haversine), the place index and all questions about places, formatting, geolocation effect, undo/redo (the session timeline now). The 1,250-place kb is a static index (`kb=lookup`): as wires a turn took 37 ms vs 6 | copy-on-write cost independent of world size (structural sharing); an external fact source for big tables; redo of a rewind (now served by the host's `redo=`); bulk sync of a collection |
| data.charts | 267 / 277 | 9.2 / 10.0 (probe, 9 turns x 10 sessions) | charts and numbers as wires; label/chart/series totals, max/min, tie sets as rules and aggregates; 8 question ops (extreme, total, average, difference, compare, percent, valueOf, count: about 90 of 983 lines) answered from the derived wires; duplicate-label deny (a gain: ops keeps two bars with one name) | parsing, building from other worlds, styling, pictures, `interceptInput`, `chartView`, undo/redo; percent and average divided in JS (the library's decimal division differs at the half); the default chart type is set in ops, so "assumed once" is not done | tier `default` for a value told by the host; JSON value kind with path access (the `obj` payload duplicates flat keys); ties option for aggregates in rules |
| games.chess | 257 / 269 (12 matrix-only) | 7.2 / 9.1 (16-turn game; mean 8.7 / 10.9) | about 8 % of ops.mjs by lines (explainMove, between, checkReason, the status part of refresh: 77 of 935 lines); by behaviour all the refusals that name a piece and a square, the turn, the game over, check / checkmate / stalemate / draw, material and captured pieces | The move generator and the search (chess.js: legal moves, the engine's choice, castling, en passant, promotion, repetition, the FEN), reading "knight to f3", the questions about the position, the engine protocol (effects, `settle`). Piece-move rules CAN be rules (knight L, bishop diagonal, rook straight, king one step, pawn forward / diagonal capture, what is in the way, a king left in check: 52 rules and denies, agree with chess.js on 137 000 candidate moves of random games); they CANNOT yet be the generator (see right) | A cross product, a box test and an `abs` are 17 `core.calc` + 9 `core.check` wires per rule: expression calcs (`expr="(?pf-?ef)*(?kr-?er)-..."`) and `between` / `sign` builtins; `replace` in a patch (a retract and a tell of one id in one patch is a `duplicate-id`: the world invents revisions `chess.g_1`); rank / priority of denies (`world.check` lists violations unordered: the host ranks by rule name); lazy rules (`core.rule lazy=true`: derive on a query, not on every change: the check status is re-derived on every move, which is most of the 2 ms a turn costs over ops); a json / object slot (the tab's transient state is a JSON string); enumeration of candidates (legal moves = the rules over the 4096 square pairs: a `core.each` generator or backward chaining)  |
| media.music | 401 / 413 (12 matrix-only) | 7.5 to 8.0 / 9.1 to 9.3 (16-turn session, interleaved runs; mean 7.2 to 7.5 / 8.9) | about 2 % of ops.mjs by lines (`setBpm` and the unknown key / instrument branches); the settings, the player, the tempo marking, the melody queue, the defaults and where each setting came from are wires and rules, and the refusals (tempo out of 30..240, a key with no signature, an instrument it does not have) are denies | The sound engine: notes, chords, scales, the songs as ABC, transposing, composing, the effects the host plays, reading the user's words, theory questions (tonal): a function of the notes (ABC text), not a relation over wires | "Said once" is a flag the world keeps itself (`music.said`) and the source of a setting is three attributes (`tsrc` ...): a per-attribute tier that survives a retract and a tell (`tempo=100~default`, or `applyPatch` entries with a tier) and `world.tier` readable from a rule; undo by unit (one note) beside undo by turn (`undo=` rewinds a whole turn: "Add A B" then undo removes both notes): `rewind(mark, { only: 'music.note' })` or a `core.undo unit=music.note`; the lexicon of the world as facts (the 24 instrument names and the 30 key signatures are generated into `matrix.sop` and also stand in `lexicon.sop`): `core.table from=lex.media.music.instruments`; a json slot (the score, the settings history); the `act` bookkeeping (assumptions, `_complete`) costs about 0.5 ms a turn: `core.action pure=true` to skip it for an action that reads no cell |
| art.draw | 562 / 562 (+8 matrix-only in `tests/reasoner-draw-diagram.test.mjs`) | 16-turn board session 7.8 / 9.8 (probe, 5 sessions, loaded machine); bench group music/draw/map/charts 10.32 / 11.96 after (before the move 9.91 / 11.18; ratio 1.128 -> 1.159, the group has the other three media worlds too) | 0 of 1,574 lines deleted (`ops.mjs` gained one `export` line). New in the library: the scene as wires, 8 denies (duplicate id, size, selection and "it" on the canvas, kind, ground, mood), a count of things and of each kind, `draw.count` and `draw.exists` answered from them (about 30 of ops.mjs's lines), the refusal of a thing that is not there, undo and redo with the board's words; 105 lines of `matrix.sop`, 182 of `fns.mjs` | The whole drawing engine: vocabulary, noun phrases ("the second tree", "the big one on the left"), placement and relations, geometry of 26 kinds (`scene.mjs`), moods, pictures. The hint of a refusal ("But there is a red circle, so you can say the circle") needs a grouped description the rules cannot build; the count of a colour is a filter over the wires (260 colour names) | Group-by aggregates (an aggregate anchored on a member counted its group once per member: 433 ms vs 11 ms at 1,000 things), referential integrity as a slot kind, string aggregation for hints, a timeline that survives a restart (see worker-log "Library improvements", art.draw and diagram.sketch) |
| diagram.sketch | 756 / 756 (+9 matrix-only in `tests/reasoner-draw-diagram.test.mjs`, 3 shared with art.draw) | 16-turn diagram session 8.9 / 12.5 (probe, 5 sessions, loaded machine); bench group other 9.95 / 13.02 after (before the move 10.14 / 13.17, ratio 1.298 -> 1.309: in matrix mode the world already paid the mark and adoption overhead of a non-matrix world) | 0 of 569 lines deleted (`ops.mjs` and the 5,012-line engine untouched). New in the library: the diagram as wires, 9 denies (arrow to or from a shape that is not there, two arrows for one pair, duplicate name or id, group member, selection, "it", shape kind), the degree of every shape (rules and aggregates, read by no operation yet), the refusal of a repeated arrow before the engine runs, undo and redo; 101 lines of `matrix.sop`, 140 of `fns.mjs` | Everything else: the reader of sentences, commands, 17 questions with their own Datalog reasoner (degree, neighbours, paths, cycles: they are bound to the reader and to highlights), layouts, templates, arrow routing. The library adds little here: the engine already refuses an arrow to a missing shape and a repeated arrow, so the denies are a guarantee and the one visible gain is the wording | Same list; plus a deny that can list the things that are there ("Shapes on the canvas: A, B"), bulk sync of a collection (14 + 20 wires adopted per turn), labels on timeline marks |
| ui.shell | 64 / 64 (+7 matrix-only in `tests/reasoner-ui.test.mjs`, +1 browser scenario) | own 9-turn session, CPU ms per turn: 9.5 / 12.7 (turns of the session 4.5-15 ops, 6-22 matrix); bench group avatar/shell/editor p50 9.18 / 10.77 before, 8.98 / 11.26 after | 0 of 180 lines deleted: the operations still change the state they were written for. New: the tab and the settings as one wire, 77 lines of `matrix.sop` (the refusals of a tab, a game, a game control with no game, "go back", a language, a Settings tab) and 110 of `fns.mjs`, plus a generated kb of 107 wires (tabs from the manifests, the words that name them, the games, the languages, the Settings tabs) | Resolving a word to a tab with the manifests' merge (`refresh`), starting a game through the game worlds (`ctx.request`), the phrase log and Settings effects, the speech-rate arithmetic. The host-set keys (`activeTab` of a click, `handsFree` without `listening`) cannot be rules on the state: the host breaks every candidate invariant (a tab id is not checked, `handsFree` implies `listening` is not a rule) | Frozen shared kb (cost per kb wire); untracked writes (`passive` is the host's workaround: a tab another world brings forward is not a step); `why=` on slot violations; see worker-log "ui.shell, ui.avatar and ui.help" |
| ui.avatar | 327 / 327 (+6 matrix-only) | own 9-turn session, CPU ms per turn: 8.4 / 11.4 (a turn that changes the look +4.7: 7.0 / 11.8); the first turn and the questions cost the same as ops (no instance until the look changes) | 0 of 1,066 lines deleted. New: the look as wires (a look wire, a wire for each part and color of the characters that were shown), 70 lines of `matrix.sop` (the glow of a robot is not its body, none only where a part is optional, a character and a slot that exist, the refusals of a color nobody knows and of the color of a part that has none, with what the part can be) and 183 of `fns.mjs`, plus a generated kb of 243 wires and 92 lines of legend | The resolution of spoken words to a character, part and variant (2,143 words), the nearest palette color, the moods, the seeded random looks, the offers and the modal yes/no, every sentence. The 581 variants and 251 palette entries are not wires: each kb wire costs about 10 us per turn (with them 170 ms per nine turns against 76 for ops) | Frozen shared kb; `member` check over a many-valued wire; list rendering in `why`; a default that is a whole object (the start look); a generic redo |
| ui.help | 87 / 87 (83 + 4 for the new request; +3 matrix-only) | own 9-turn session, CPU ms per turn: 13.2 / 14.6 | 0 of 366 lines deleted. New: the state as one passive wire and the question "what can you do in the map?" as a lookup in a generated kb of 70 wires; 10 lines of `matrix.sop`, 33 of `fns.mjs`. The library adds little here and the world is kept thin | Choosing what to show (the rotation of examples, "how do I ...?" scoring with stemming and edit distance, the rules and live state of the games, the capability sentence, identity answers, `didYouMean`): ranking and matching over patterns, which are not wires | A way to query the patterns' canonical examples as wires without paying for them every turn (frozen shared kb); `core.calc fn=join` for the capability sentence |

### Wave 2 of the per-world move: art.draw and diagram.sketch (2026-11-11)
- Both worlds are `reasoner=matrix`; `test-world all` passes in both modes (art.draw 562 / 562, diagram.sketch 756 / 756, every other world unchanged); Chrome `test-webchat-matrix.mjs` with the new scenarios `draw` and `diagram` (`scripts/test-webchat-draw-matrix.mjs`); `npm test` green after three adjustments listed in the worker log (the restart-then-undo case is a real limit: the library's timeline is session memory).
- Turn time, `bench-reasoner --reps 3`, p50 ms, ops / matrix, 12,072 turns, machine load average 6-10 from other agents (only the ratio inside one run means something): all worlds 9.92 / 11.91 before, 10.08 / 12.20 after; music/draw/map/charts (art.draw) 9.91 / 11.18 before, 10.32 / 11.96 after; other (diagram.sketch) 10.14 / 13.17 before, 9.95 / 13.02 after; session creation 1.06 / 1.37 before, 1.05 / 1.39 after. On the worlds' own 16-turn probe sessions (5 sessions, p50): art.draw 7.8 / 9.8, diagram.sketch 8.9 / 12.5, so the matrix costs +2.0 and +3.6 ms there: `adoptState` 2.1 ms (draw) and 1.4 ms (diagram) per turn, `_state` 0.6 ms, the guard of a connect 0.3 ms.
- Size: a board of 32 things = 62 wires and 4.7 kB of state; a diagram of 20 shapes, 14 arrows and 4 groups = 83 wires and 5.9 kB. Scaling of a takeover (synthetic boards of stars; told all / one thing moved / every thing moved): 50 things 3 / 1 / 3 ms, 200 things 9 / 2.5 / 15 ms, 1,000 things 39 / 11 / 91 ms; a diagram of 400 shapes and 399 arrows 47 / 8 / 59 ms. The first version of art.draw counted each kind with an aggregate anchored on a thing of the kind and took 433 ms for one moved thing at 1,000 (the group is counted once per member); anchored on static kind facts it takes 11 ms. Large or high-churn data (shape geometry, routes, point lists) is never a wire: scene.mjs and the engine compute it from `kind`, `size`, `x`, `y`.
- What the library did not need to do here: art.draw's engine and diagram.sketch's 5,012-line engine are geometry, language and a Datalog interpreter of their own; neither lost a line. The honest account is in the table rows and in the worker log.

### Wave 1 of the per-world move: docs.editor and docs.reader (2026-11-11)
- Both worlds are `reasoner=matrix`; `test-world all` passes in both modes (docs.editor 221, docs.reader 209, every other world unchanged); Chrome `test-webchat-matrix.mjs` 79/79 (scenarios `editor` and `reader` added, in `scripts/test-webchat-docs.mjs`).
- Turn time, `bench-reasoner --reps 3`, p50 ms, ops / matrix, group "avatar/shell/editor" (the editor): before 9.17 / 9.35, after 8.87 / 10.29; group "documents" (the reader): before 11.02 / 11.14, after 10.24 / 11.48; all worlds 9.61 / 10.19 before, 9.42 / 10.77 after; session creation p50 1.03 / 1.33 (after). On the two worlds' own sessions (18 turns, 5 sessions) the matrix costs +1.4 to +2.3 ms (editor) and +2.1 to +3.4 ms (reader) at p50 and +0.4 to +1.9 / +1.2 to +1.5 ms at the mean. The first version cost +3 / +5 ms: the host stringified the whole state (the analysis of a text, the TipTap JSON, 50 snapshots) several times per turn, the 250 sentence wires were told to the instance and written around by every patch, and `canon` compared long values after re-encoding them. Fixed generically: `stateKey`, `untold=`, direct comparison. What is left is the fixed matrix-turn cost (marks, `adoptState` three times a turn, the rules' pass after each patch, `guard`'s dry run, 0.2 ms).
- The numbers drift by +-0.5 ms with other agents on the machine.
## The conversation instance and undo across instances (user decision 2026-11-11, WORLDS-APART + UNDO-1)
Design in spec 15, "The conversation instance" and "The session timeline and undo across instances". One conversation instance per session (`worlds/session.conversation`, `compose=` of kids.shop, kids.arith, kids.tasks, kids.time, kids.animals, kids.shapes, user.profile), one instance per game, agents shared as copies; `kids.arith` no longer says `reads=`.

Replies, statuses and state compared with `scripts/dump-turns.mjs` before/after on 4 591 turns (2 099 sessions): **13 replies differ, all intended or random**:
- 5 are the fix of a leniency bug (a reading the capability check had just found wrong came back through the recent worlds): "what is on my shopping list" after a removal no longer says "No, is is not on your shopping list. I understood only part of that" (2 turns: kids.tasks#013, coh.tasks.05), and "is reading on my to-do list?" no longer answers "Done! I added reading to your to-do list. I understood only part of that: I did not use is" but "No, reading is not on your to-do list." (3 turns).
- 8 are random choices (a random song, a random avatar look; they differ between any two runs).
- State: the internal ids of tasks in `state['kids.tasks']` are numbered from the conversation World's counter (`task_401` instead of `task_3`, 151 turns); nothing reads the number.

Bench (`bench-reasoner --reps 3`, machine load average 12-15 from other agents, so only the matrix/ops ratio in the same run is meaningful): all p50 ops 10.06 -> 9.69, matrix 10.77 -> 10.81 (ratio 1.07 -> 1.12). The conversation group (shop, arith, tasks, tic-tac-toe) p50 11.3 -> 12.95 (ratio 1.09 -> 1.26): the conversation World is larger (the kbs and matrices of seven worlds), so the first write after a dry-run fork copies more; its mean is lower (20.5 -> 20.1), games unchanged (1.134 -> 1.139), avatar/shell/editor, documents and music/draw/map/charts at or below their ratio. Session creation 1.10 -> 1.07 ms. If the conversation group needs to be cheaper, the next step is the library's copy-on-write of a fork (not patched here).


Bench after games.chess and media.music (`node scripts/bench-reasoner.mjs --reps 3`, 1766 sessions, p50 ms ops / matrix; the machine is shared with other agents, so the absolute numbers drift by about 0.5 ms; ops of the same run is the baseline):

| Group | Before (7730d42) | After |
| --- | --- | --- |
| all | 9.61 / 10.23 (x1.065) | 9.42 / 10.32 (x1.096) |
| games (tic-tac-toe, hangman, guess, chess) | 8.66 / 9.98 (x1.15) | 8.31 / 10.39 (x1.25) |
| music/draw/map/charts | 10.25 / 10.51 (x1.025) | 9.68 / 10.53 (x1.088) |
| four, avatar/shell/editor, kids-other, documents, other | unchanged within the noise | unchanged within the noise |
| session creation | 1.05 / 1.07 | 1.04 / 1.08 |

The two worlds cost 1.2 to 1.3 times their ops turn (chess 7.2 vs 9.1 ms, music 7.5 to 8.0 vs 9.1 to 9.3 ms in the per-world measure above); the rest of the matrix is unchanged. Ideas to get under ops speed are in the "Library improvements" entry of `worker-log.md` (lazy rules, `core.action pure=true`, expression calcs).

### Wave 3 of the per-world move: ui.shell, ui.avatar and ui.help (2026-11-11)
- All three are `reasoner=matrix`; `test-world all` passes in both modes (ui.shell 64, ui.avatar 327, ui.help 87, every other world unchanged); `npm test` 1332 pass, 0 fail; Chrome `test-webchat-matrix.mjs` 101/101 (scenarios `shell`, `avatar`, `help` added, in `scripts/test-webchat-ui-matrix.mjs`), `test-webchat-language.mjs` 54/54.
- Turn time, `bench-reasoner --reps 3`, p50 ms, ops / matrix, before (b22cd4b) and after: group "avatar/shell/editor" 9.18 / 10.77 and 8.98 / 11.26; all worlds 9.47 / 10.94 and 9.48 / 11.38; "games" 8.38 / 10.05 and 8.79 / 11.20 (a game session starts with the shell's switch of the tab: one more wire written); session creation p50 1.04 / 1.35 and 1.05 / 1.40. The two runs overlapped in time on a loaded machine (load 6-12): +-0.5 ms. On the worlds' own sessions (9 turns, CPU time, mean per turn) the matrix costs +3.2 ms (shell), +2.7 ms (avatar; +4.7 on a turn that changes the look, 0 on a question: no instance), +1.3 ms (help). It does not reach ops speed: what is paid per turn is the dialog wires told to the instance, the transaction (mark, validation) and the derivation of the state; the first avatar with all the variants and palettes as wires cost +10 ms per turn.
- ops is unchanged (replies and state, scripted sessions of all three worlds, both modes, in `tests/reasoner-ui.test.mjs`).

## Re-vendor sopworld 0.7.1 and 0.9.0, and the host workarounds removed (2026-11-12)

Commits on top of main: 0.7.1 (93362d7), the workarounds below, then 0.9.0 (f062052, build 807d8bde76f3). Numbers: `bench-reasoner.mjs --reps 3` (12,072 turns), the old tree and the new tree run at the same time on the same loaded machine, so both see the same noise. The machine was not quiet (load 5-20 from other agents): absolute ms vary between runs, the gap and the ratio between modes inside one run are what to read.

### Does the matrix gap close? p50 ms, ops / matrix, gap

| World group | Before (main ef58f35, 0.6.1) | 0.7.1 (run 1, paired with its own "before") | Final (0.9.0 + workarounds removed; paired with a second "before") |
| --- | --- | --- | --- |
| four (shop, arith, tasks, tictactoe) | 11.0 / 15.4, +4.5 (x1.41) | 10.8 / 12.8, +2.0 (x1.19) | 9.4 / 11.6, +2.2 (x1.24) (before in that run +3.5, x1.35) |
| kids-other | 11.2 / 14.5, +3.4 | 10.7 / 12.2, +1.5 | 9.8 / 11.4, +1.6 (before +2.7) |
| avatar/shell/editor | 10.5 / 13.1, +2.5 | 9.8 / 11.3, +1.5 | 8.8 / 10.4, +1.6 (before +2.2) |
| music/draw/map/charts | 11.3 / 14.1, +2.9 | 12.0 / 14.0, +2.0 | 9.7 / 11.9, +2.2 (before +2.5) |
| games | 8.8 / 12.0, +3.2 | 9.7 / 12.7, +3.0 | 8.3 / 11.2, +2.9 (before +2.9) |
| documents | 11.2 / 13.5, +2.3 | 11.4 / 12.8, +1.4 | 10.5 / 12.1, +1.6 (before +1.8) |
| other | 10.7 / 14.0, +3.3 | 11.0 / 12.8, +1.8 | 9.6 / 11.7, +2.1 (before +3.3) |
| all | 10.7 / 13.7, +3.0 (x1.28) | 10.6 / 12.5, +1.9 (x1.18) | 9.2 / 11.2, +2.0 (x1.22) (before in that run +2.6, x1.27) |

**Answer: the gap closes by about a third overall (+3.0 to +1.9-2.0 ms), by half in the four matrix worlds, kids-other and the editor group, and not at all in games.** Moving 0.7.1 to 0.9.0 added about 0.1-0.3 ms (the second "before" run is also quicker than the first: the figures of different runs are not comparable, the paired ones are). Replies and states: `dump-turns.mjs` over 4,591 turns is identical before and after every step except the random ones (a random song, a random avatar seed: they differ between two runs of the same code). A/B outcomes (coherence, dialogues, gold): `training/results/sopworld-ab-before-071.json` and `sopworld-ab-after-090.json`.

### What changed in host code (replaced by library APIs)

| Area | Library API | Lines (host code, net) | Notes |
| --- | --- | --- | --- |
| `_mayFill` and the compiled-slot walk | `canComplete()` (P1) | -26 in `src/reasoner` | same decisions, one call |
| `x.r1`, `chess.g_1`, `gm.mk_m1.2` revisions | `applyPatch({ replace })`, `ctx.replace` (R6.9) | about -4 per `fns.mjs` in 10 worlds (chess, music, docs.editor, docs.reader, geo.map, art.draw, diagram.sketch, data.charts, user.profile, ui.avatar), the `newest()` revision readers gone | the adopt plan has a fourth part, `replace` |
| `kb=lookup`, `kbView`, `ctx.host.kb`, `core.world.kb` | the kb as wires (P2 copy-on-write); R6.13 providers not needed | -37 in `src/reasoner` + `src/worlds`, -1 key in the core legend | measured: 205 geo.map/data.charts sessions, 928 turns, p50 14.6 ms both ways, p95 49.0 / 47.5, first turn and snapshot size equal; the geo kb now derives 250 `shown` wires (cost included in the numbers) |
| "has two", "third" post-processing in the two docs guards | filters `ordinal`, `count` (R6.5) | -6 each in docs.editor and docs.reader `fns.mjs`; `ord=` attribute and slot gone | |
| the editor's six copies of the count rule | `core.aggregate by= / default=` (R6.6) | -21 in `docs.editor/matrix.sop` | |
| JSON text in `json`, `rest`, `obj` | `kind=blob` (R6.4) | 0 lines, 39 keys | out of the indexes; tests and turns unchanged |
| kids.animals value mode | `many=true` (R6.1) | the test now expects `supported` | see below: the wording stays |

Totals against ef58f35 (code only, no generated files, no E3): `src/reasoner/index.mjs` +13 -53; the ten `fns.mjs` about +100 -125; `docs.editor/matrix.sop` +10 -31. Small: the workarounds were never more than 3 % of the host layer; the real gain of the move is behaviour and the simpler adopt, not volume.

### Not replaced, and why

- **`redo=` / `isView` / `passive` and the restart timeline (RESTORE-1).** The session timeline is `mark()` / `rewind()` of several instances plus a shared log (one turn can change the conversation, the game and the editor). `world.redo()` follows only `world.undo()` of one world, and `transient=true` is passed over by `undo(n)` but not by `rewind(mark)`. The 0.9.0 timeline in `toJSON({ timeline: true })` was measured on a real session: every log carries the base (geo.map 507 kB per log, session.conversation 235 kB, kids 65 kB) and `World.fromJSON` replays it from empty (geo.map 96 ms per log, one per open mark). Our record shares one base between all marks and replays only the difference. So `world.log` and `_replay` stay in `timelineJSON` / `restoreJSON`; `tests/reasoner-restore.test.mjs` and the Chrome restart-undo scenario pass on 0.9.0. Library items 1 and 2 below.
- **kids.animals lives / covered / is_a as questions of the matrix.** The answer is now a list in value mode, but the sentence needs a phrase table ("in the sea", "covered in fur") applied to each value: that is our template engine (a `{values:habitat}` filter), not the library. `mode=check` would answer "is a whale a fish?" with the actual value; the templates for `no` with `actual` do not exist yet. Left in ops.
- **art.draw kind anchors.** `core.aggregate by=` gives no group for a kind with no object, and the tally needs its 0 (library item 3).
- **`core.rank` for "the 2nd chapter".** The chapter number is a told `sec` attribute that guards and `gone` wires read; deriving it changes what is told. Not attempted.
- **"I assumed a bar chart" by per-key assumptions (R6.16)** and **adopt through `world.sync` (R6.14).** Not attempted: no matrix-mode host code produces that sentence (data.charts keeps its own note in ops), and `sync` would replace the per-world minimal-diff adopt but needs one list per type; neither is on the critical path.

### Where a world still loses to ops

Games (+2.9 ms p50, x1.35) did not move and the cause is not diagnosed; the instance work per turn (fork, mirror of the conversation, `_state`) is the same for every group, so the games' lower ops time (8.3 ms) makes the same fixed cost visible. `bench-reasoner.mjs --instrument` is the next step. All other groups are within +1.6-2.2 ms.

A/B in one process (`ab-sopworld.mjs --sets coherence,dialogues,gold`, matrix minus ops p50 ms per group, before -> after): four +3.4 -> +2.2, kids-other +2.9 -> +1.9, avatar/shell/editor +2.1 -> +1.6, music/draw/map/charts +2.9 -> +2.2, games +3.1 -> +3.1, documents +1.7 -> +1.0, other +2.8 -> +2.2. Outcomes are identical (dialogues: ops 292 + 1,882 right, matrix 292 + 1,878 right, same wrong and not-understood counts as before); 33 coherence, 470 dialogue and 300 gold sessions differ in the same 33 places as before.
