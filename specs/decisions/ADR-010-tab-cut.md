# ADR-010 — The tab cut (2026-11-15)

Status: accepted (owner, 2026-11-14 19:37; reversible: everything stays in git history, tag `pre-tab-cut`).

## Decision
Several tabs were not relevant and not maintained; games and document analysis would need their own approach. Removed with their worlds, patterns, words, tests, specs and assets:
- **Chess** (`games.chess`, the Stockfish and chessground vendor files, chess.js), **Tic-tac-toe** (`games.tictactoe`), **Hangman** (`games.hangman`), **Guess the animal** (`games.guess`), the **Profile** tab and world (`user.profile`: the questionnaire, the CV card; the user's name stays in `kids.common` state, which is all that still needs it), and **document analysis** (`docs.reader`: file search, read aloud, the sample texts, PDF.js and mammoth).
- Kept: Talk, Drawing, Diagram, Map, Charts, Seating, Timeline, Music, and ONE Documents tab = `docs.editor` plus the composition and the summary (moved out of `docs.reader`, `specs/09-documents.md`).

## What stays as inert plumbing (no world uses it; candidates for a later cut)
The generic game-tab mechanism: `tabKind=game` and `gameControls` of a manifest, `activeGame` / `gameWorld` in the dialog context, the idle-game veto of `src/dialog/world-aware.mjs`, the game-tab rules of `src/formalizer/routing.mjs` and `rules/index.mjs`, `ui.playGame` for declared tabs, the world-of-worlds `run=needs` rule, the declared-schema mechanism (`declare=yes`, `schema.declared.mjs`), the `slot=` of `core.describe.arg`, the game guard of `worlds/ui.shell/fns.mjs`. The Romanian reply tables of `src/translate/replies.en-ro.mjs` still hold reply patterns of the removed worlds.

Removed by the architecture review (2026-11-15, `docs/architecture-review-2026-11-15.md`): the idle-game veto (`no-game`) and the host's game ordering of `src/dialog/world-aware.mjs`, the yes/no and "why?" game branches of `src/dialog/discourse.mjs` and `dialogue.mjs`, the "x și zero" sound-alike of `src/dialog/index.mjs`. Still inert: `gameWorld` in the context (always null), the game-tab rules of `src/formalizer/routing.mjs` and `rules/index.mjs`, the game controls of `worlds/ui.shell`, `tabKind=game` / `gameControls` in `src/worlds/index.mjs`.

## Consequences
- `docs.editor` owns "write a report/essay/story ...", "summarize the following ...", "condense the document".
- The removed worlds' keywords no longer compete in arbitration (a chess, tic-tac-toe or hangman reading of a sentence that belongs elsewhere is not possible any more).
- The specs of the removed worlds are gone from `specs/` (12-profile.md removed; 09-documents.md rewritten); older specs keep historical mentions.
