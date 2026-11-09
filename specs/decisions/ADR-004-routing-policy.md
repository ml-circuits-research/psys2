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

## Amendment (engine improvements)
- Tier 3 exception is now "clearly more specific wins": the tab's catch-all loses to another world's zero-wildcard match that is not of lower priority and has two more literals or a higher priority; catch-alls of other worlds and lower-priority literal matches never steal from the tab.
- `ui.shell` game controls on a game tab are rewritten to the game's own action (manifest keys `gameNew`/`gameGiveUp`/`gameHint`/`gameUndo`, fallback `tab*`), so the dataset has one label per meaning (reviewer decision Q5). Off a game tab the shell form stays.
- Patterns may declare `tabOnly`, `tabPriority` and `yieldsTo`; bare tempo words yield to the music world (tier 2b) without any priority change.
- Emit filter `{slot|cap}` and four-word lexicon entries (spec 03 section 2).

## Amendment (RD2: naming a world wins, bare words follow the tab)
A real session showed two failures of tier 3 as a blanket rule: "the avatar should be a women" typed while the charts tab was open went to `data.charts` (its catch-all "I do not see X in the chart"), and a bare "next" on the drawing tab started a song.
- **Tier 3a, named world.** A message that names a world's object or tab after a determiner ("the avatar", "my chart", "the picture", "the chess board") orders a non-catch-all match of that world before the matches of the active tab. Names come from the tab manifests (`tab`, `tabAlias`, `tabTitle`) and the built-in tabs; `namingTables(set)` and `namedWorlds(tokens, names)` in `routing.mjs`. It does not apply when the tab's own world is named too, to verb uses without a determiner ("paint yourself green") and to formats ("download it as a picture"). Measured on the pattern examples that name their world, run on 9 tabs: 1117 of 1323 routed to the named world before, 1145 after, no example moved the other way.
- **Tier 3b, bare readings.** Patterns declare `tabFollow=true` when they are a bare coordinate ("b1", "e4"): from tier 5 (a world of another tab) they are dropped, so only the active tab, the active game and the recent worlds read them. The music world's bare "next / another one / more" needs `needsState=playing`, the document reader's bare "next / previous" needs an open search (`needsState=search`). A first version that dropped every one-word match of a tab world was measured and rejected: it lowered the routed held-out set and the routing set, because bare words such as "Center" or a hangman word are legitimate without a tab.

## Amendment (DIAG2: tier T, the active tab's world wins a complete reading whatever the dispatcher proposes)
The rule router (tiers 1 to 5) already puts the active tab's world first in rules mode. In encoder and encoder+n1 modes the dispatcher proposes candidate worlds, and a world it does not know (a new world such as `diagram.sketch`) was never proposed, so a sentence the tab's own rules read completely ended in another world ("draw a blue rectangle called Api" on the Diagram tab went to `art.draw`).
- **Tier T (tab first), in the validation layer** (`tabFirst` in `src/dialog/dispatch-validate.mjs`, policy `tabTier`, default on). Before the dispatcher's candidates are consulted, the whole message is formalized with the rule router of all worlds in the session's routing context. If the message is one clause, parsed, and its winning match belongs to the world of the active tab (not `ui.shell`, not a catch-all: wildcard tokens do not outnumber literals) and the interpreter accepts the reading, that one-piece reading (class 0) is the winner. The dispatcher's segmentations are not evaluated. No modal world may be open.
- It never overrides tiers 1 to 3a (a modal input, a navigation or setting request, a message that names another world: those matches are not of the tab's world, so tier T does not apply) and it never fires on a partial, spell-corrected, simplified or normalized reading: those still go through the dispatcher.
- Tests: `tests/dispatch-validate.test.mjs` runs, for every world that owns a tab, its own pattern examples against a hostile dispatcher (wrong top world) and asserts the tab world wins.
- `DialogSession.context().gameWorld` also falls back to the game the session was playing (a game tab was opened or a game world answered) while that game's state says it is running (a free cell and no winner, status playing, the guessing game asking), so a bare coordinate ("B1") is its move even when another world spoke last (tier 4).
