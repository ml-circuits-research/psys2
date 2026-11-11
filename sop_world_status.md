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

## Planned full A/B experiment (after SOPWORLD-1b lands)

One combined run in both modes, started only after the pending changes are merged, so the results are not invalidated:

1. `test-world` for every world.
2. The user's regression sets and the gold paraphrases.
3. A replay of the user's real phrase logs.
4. The coherence set and the per-turn audit.
5. Turn time (p50 and p95) and bundle size.

For every case whose result differs between the modes, the transcript is kept, so the report shows concretely where sopworld wins and where it loses. The results are added to this file.

## Open questions and risks

- The library adds 75.7 kB gzip in matrix mode. It is acceptable while the bundle loads lazily, but it should be measured on a phone.
- Matrix mode is 9% slower per turn (p50). It must be rechecked with 0.6.1 and inside the compute budgets (`src/dialog/budget-limits.mjs`).
- The default stays `ops` until the A/B experiment shows a clear gain with no regression on the user's real phrases.
