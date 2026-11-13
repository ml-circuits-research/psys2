# space -> sopworld `std.space`

**What it is.** Relations and layout over placed things: selection by ordinal / position / size / count ("the second one on the left", "both"), moves with
amounts ("a little to the left"), placement relative to others (above, under, next to, joined, apart), layouts (row, column, grid, circle, face), overlap and
contact enforcement, spatial questions ("is the cat left of the tree?"), and the piece model (hull, anchors, attach, relation facts with conflicts, inferred
facts, part-of rules, move checks) with a constraint solver.

**API.** `fn/space.mjs`: `interpret(text, ctx)`, `parseSel` / `select`, `parseMove` / `planMove`, `parseRel` / `planPlace`, `parseLayout` / `planLayout`, `enforce`,
`parseQuestion` / `answerQuestion` / `holds`, geometry (`boxOf`, `overlaps`, `gap`, `outlineOf`). `fn/pieces.mjs`: `pieceFrom`, `anchorsOf`, `attachAt`,
`createStore`, `propose`, `retract`, `inferFacts`, `movePiece`, `checkMove`, `why`. `fn/solver.mjs`: `solve`, `arrange`, `usualPlace`. `fn/layouts.mjs` (from
`src/knowledge/`): layout knowledge reading. `sop/`: legend, lexicon and rules.

**Host dependencies.** Items come in as `{ id, kind, x, y, w, h, shape?, parts? }` with a frame `{ w, h }`; kinds come from `kindOf` callbacks. The `KNOWLEDGE`
table (space.mjs lines 143-148) and `solver.usualPlace` are general facts: they must come from k.layouts and k.scenes through `std.knowledge`. `TIERS` (said,
focus, scene, knowledge, default) must be the library's `std.fill` tiers.

**Tests to carry.** `tests/space.test.mjs`, `tests/space2-pieces.test.mjs`, `sop/tests.sop`; `scripts/eval-space.mjs` (not copied, it drives the host's dialog)
and the owner-log rows that mention places.

**Host keeps.** The tab renderers that supply items and frame, the art.draw / diagram tab ops that call `interpret`, and English word tables if the library
wants language packs (they ship as its English pack).

**General lines still in PSys2:** 293 SOP, 1,648 code (space.mjs about 990, solver, pieces 262, layouts 128), 28 generator (build-space-lexicon).
