# turn-pipeline -> sopworld `std.turn`

The pieces of a turn that are not about English or the UI. The copied files are WHOLE files from `src/dialog/` (they mix general and English / host parts);
this README says which functions are the general mechanism. Extraction is the library's job with PSys2's tests; the host keeps the rest.

| piece | what it does | where (copied under `fn/`) | general part |
| --- | --- | --- | --- |
| compute budget | a deterministic per-turn tick budget, `BudgetExceeded`, per-site limits and totals for the trace; a turn that exceeds it is stopped, not hung | `budget.mjs` (`createBudget`, `installBudget`, `tick`), `budget-limits.mjs` | all of it |
| dry run | a turn on a forked copy of the session state with its own budget and guard: "would this message be understood completely?", never changes the real session, cached for the same text and state | `src/dialog/index.mjs`: `_dryRun` (line 359), `forkForValidation`, `DRY_MAX_WORDS`, the settled-answer cache (line 232) | the fork + own-budget + cache protocol (about 120 lines); the translation step inside it stays host |
| veto (world-aware reading) | after reading, each clause is checked against the world's state: no such referent, no running game, a fragment with nothing to continue, library veto (`world.veto`), words the reading left out; a vetoed clause becomes an unparsed clause that says why and may offer a rewrite | `world-aware.mjs`: `vetoOf` (line 155), `reviewSegments` (177), `reviewOne`, `makePicker` (choose among readings), `reviewBestEffort`, `VETO_KINDS`, modes off / veto / choose / observe / -strict; library side: `src/reasoner/index.mjs` line 877 `world.veto(r)` | the veto kinds, modes and `{ kind, why, say?, offer? }` shape; the English `say` strings are language pack |
| all-or-nothing | when one clause of a multi-clause message is vetoed for a reason that makes it unreadable, the readable clauses are held too (a later clause may rest on an earlier one); the reply says which clause was not read | `world-aware.mjs` `reviewSegments`, set `HOLDS` and the `held` veto (lines 177-190) | all of it |
| fill | roles a fragment lacks are filled by tier: said > focus > scene > knowledge > default, and the source is kept for the why-answer; built on `std.focus` / `std.fill` | `src/dialog/dialogue.mjs` `fill` (line 87), `continuation.mjs` (fragment = continuation of the last turn of the open tab), `discourse.mjs` (pending fill / confirm / choice) | `fill` and the continuation rule; the verb detection (`verbOf`) is English |
| graded fallback | an unreadable message gets the most specific honest answer first: a specific explanation ("no such language"), then the open world's `outOfScope` hook with the nearest things it can do, then "did you mean" / examples; never silence | `src/dialog/index.mjs` lines 1515-1570 (`explainUnparsed` in `world-aware.mjs` line 300, hook `outOfScope`); in a doing world `worlds/acts/acts.mjs` lines 457-515 (`not-here`, `question`, cannot-do + which world can) | the order of grades and the hook contract; the texts are language pack |
| why | the trace of the last turn (which reading, default and its source, what changed) turned into an answer plus an offer to undo; a world may add its own `why` hook | `dialogue.mjs` `why` (289), `explain` (318); `worlds/space/pieces.mjs` `why(f, names)`; the acts executor why-answer | the trace shape and composition |
| value check | a rewritten phrasing may not change numbers, names or negation of the source (used for the seq2seq normalizer) | `value-check.mjs` | the typed-value extraction and comparison |
| dispatch validation | an encoder prediction is accepted only if the world's reading really parses the text | `dispatch-validate.mjs` | the accept rule, not the encoder |

**Host dependencies.** Session object (`isession`, `engine.interp`, `forkForValidation`), the segments structure (`{ text, wires, match, unparsed, veto, wa }`),
the guard (`guard.install / check / soft`), the translator and normalizer (host), the world registry.

**Tests to carry.** `tests/world-aware.test.mjs`, `tests/budget.test.mjs`, `tests/dispatch-validate.test.mjs`, `tests/fragment-continuation.test.mjs`,
`tests/discourse.test.mjs`; the owner logs and `scripts/eval-dialogues.mjs` (not copied) as integration measures.

**Host keeps.** English reading, translation and Romanian replies, the normalizer and encoder, the UI, language detection, the guard installation.

**General lines still in PSys2:** the copied files total 2,764 lines; the general mechanism is estimated at 900 lines (budget 150, world-aware veto and holds
350, continuation and discourse 250, dry-run protocol 120, value check 100 minus English tables). The exact number is to be set by the extraction.
