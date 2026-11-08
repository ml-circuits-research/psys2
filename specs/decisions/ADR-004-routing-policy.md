# ADR-004: Routing policy with application state

Status: accepted

## Context
`rankMatches` ranked readings by pattern priority plus a small focus bonus (+3 active tab world, +1 recent worlds). A priority-14 pattern of another world still beat the priority-10 pattern of the open tab, so "Make it bigger" on the drawing tab could zoom the map and "Play B3" on the music tab could place a tic-tac-toe move.

## Decision
A router stage (`src/formalizer/routing.mjs`) orders the candidate matches of all worlds using a context object built by the dialog session (`DialogSession.context()`): active tab, owner world of the tab, world with a modal input, world with an active game, recent worlds, last answered world. It is deterministic and explains itself: the decision (tier, reason, winner, runner-up) is stored on every segment and in `trace.routing`.

Tiers (smaller wins): 1 modal intercept; 2 navigation/meta (2a naming a tab always wins; 2b settings win over equal or lower priority); 3 active tab (with the catch-all exception and the game controls of `ui.shell`); 4 active game and recent worlds; 5 priority. Exact definitions are in spec 03 section 4.

The module exports `createRouter({ id, model })`. `route({ matches, context, scores, tokens })` returns `{ matches, decision }`; a learned router (ModernBERT/LoRA routing head trained on state + text) implements the same method, and `model(features)` already lets it order tier 5. `createPriorityRouter()` keeps the old context-free order for comparisons. The legacy `focus` option of `formalize` is still accepted and converted to a context.

## Consequences
- The tab decides ambiguous commands ("Play B3", "Repeat that", "Start over", "Make it bigger"); cross-world questions still work when the tab world has no match.
- Tier 2b yields to a higher priority so that phrases such as "Hurry up" (chess) or "Where am I?" (map) keep their world.
- Training export (`--routing-context`) labels cross-world ties with the generator's world as active tab. Agreement over all generator records, 300 per world: 96.7% without routing context, 98.8% with it (tic-tac-toe 69.7% to 100%, guess 98.3% to 100%, hangman 94.3% to 96.0%). On the music tab "Play knight to f3" now stays a music request, which the music generator lists as a negative.
