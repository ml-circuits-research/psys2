# sopworld in PSys2: status and observations

Owner: the worker session. Updated as SOPWORLD work lands. Last update: 2026-11-11.

## How it is switched

- sopworld is a **strategy behind a flag**, not the default. The default reasoner is `ops`.
- Switch:
  - Webchat: Settings › Developer › Reasoner (`ops` / `matrix`).
  - CLI and evaluations: `--reasoner ops|matrix`, or the environment variable `PSYS2_REASONER=matrix`.
- Only worlds that opt in with `reasoner=matrix` (plus a `matrix.sop` and a `fns.mjs`) use the library: today `kids.shop`, `kids.arith` and `kids.tasks`. Every other world takes the `ops` path in both modes.
- Known defect: `games.guess#030.ro` changes outcome when the switch flips, although that world does not use the matrix. The switch must not touch other worlds. Being fixed in SOPWORLD-1b, item 7.
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

### Why the stage 1 comparison is not yet fair

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
