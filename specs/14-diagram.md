# 14 — Diagram world: short ids, arrows as objects, arrow geometry (DIAG3)

World `diagram.sketch`, tab `diagram`. The state and the execution are the engine of diagram-vss-demo (`worlds/diagram.sketch/engine/`, never edited by hand); `ops.mjs` wraps it. This spec covers what DIAG3 added on top.

## 1. Short ids
- Every shape has an id by kind: `c` circle, `r` rectangle (box), `s` square, `d` diamond, `e` ellipse, `t` triangle, `h` hexagon, `k` star, `x` text; numbered `c1, c2 ...` from the engine's own per-kind counter (`seq`). Every arrow has `a1, a2 ...` (`edgeSeq`).
- An unnamed shape is *named* by its id (`name == id`). A shape the user named keeps its name and carries the id in `shape.id`.
- Aliases: the id, the old long name (`circle1`, `rectangle1`, `box1`) and the name all resolve to the same shape (`shapeOf`). The engine's `find` is patched to resolve them, and the nodes of a request are canonicalised to names before they run.
- Replies never print ids (RO-PHONE 4): a shape the person did not name is "a circle" / "3 triangles" when drawn, "the circle" (the only one) or "circle 2" afterwards: `Drew a circle.`, `Connected the circle → the rectangle.`, `The arrow Start → Done now says “uses”.` Ids stay valid in what the person types.
- A bare "draw a diagram" / "make a random diagram" draws a sample: one of `RANDOM_DIAGRAMS` (ops.mjs: a template, sample labels, a plain unit) and says `I drew a random cycle diagram with four steps.`
- The tab draws ids small and grey at the top-left of a shape and on the middle of an arrow; the **Ids** toggle hides them (remembered per browser). Names stay as they are.

## 2. Arrows as objects
An arrow is referred to by its id (`a1`), its ends (`the arrow between c1 and r1`, `the link from A to B`), recency (`the previous / last / that link / arrow / connection / line`, also a bare `label link`), or its label (`the arrow labeled uses`). `refs.mjs` rewrites every form to `the arrow from X to Y`, which the engine's rules reader reads (`from=`, `to=`). Operations: label (a missing text asks `What should the label of a1 (c1 → r1) say?`), colour, style (solid, dashed, dotted), arrowheads (one-way, two-way, none), thickness (`thicker` / `thinner`: one step 1.5x, `a bit` 1.25x, `much` 2x, thinner is the inverse), reverse, delete, select (`select a1`, `highlight the arrow between c1 and r1`: the tab draws a halo; `state.selected = { shapes, edges }`). `thicker and dashed` runs both. Typos of the edge words (`arraw`, `lable`, `conection`) and of long aliases (`reactanle1`) are corrected before reading (`fixTypos`: known words only, one edit, never a name the person gave).

## 3. Arrow geometry (`arrows.mjs`, drawn by the tab)
- An arrow attaches to the side that faces the other end, at least 8 px from the corners of that side (CORNER); circles and ellipses take the point where the line between the centres meets the outline.
- It enters a border at an angle of at least 30 degrees (MIN_ENTRY); otherwise the first and last segments are bent to leave and enter perpendicular (a stub of 14 px).
- Parallel and opposite arrows between the same two shapes are spread 14 px apart (SPREAD).
- A segment keeps 8 px from every other shape (CLEAR); a detour bend is tried, with stubs when the angle needs them. A crowded diagram may leave a smaller gap.
- Labels sit off the line, with a halo in the background colour; the id sits on the line.
- DIAG3b: arrows that meet the same side of a shape (or the same stretch of an ellipse) are fanned out along it, ordered by where the other end lies, at least 10 px apart (APART; 20 px when the side is long enough); a template's trunk is widened to fit its attachment points. Ids drawn on the arrows are kept apart by the same spread.
- DIAG3b: a shape the person just added that lies on an arrow moves to the nearest free spot (clear of other shapes and arrows); an explicit position that is free stays.
- `tests/diagram-arrows.test.mjs` measures the minimum entry angle, the corner clearance and the clearance from other shapes over the 24 templates, the example sessions of the source and crafted fans.

## 4. Sizes and layout by voice
`make c1 a bit bigger / much bigger / the same size as r1`, `make the arrows thicker`, `change / switch the layout to a row / column / grid / circle / tree / layers / radial`, `space them out`, `tidy up`, `untangle`, `straighten the arrows`, `fit` all reach the engine's resize / equalize / arrange / distribute / improve / untangle / straighten / fit. Layout phrases are rewritten to `arrange everything in a X` (`rewriteLayout`).

## 5. Create a diagram and templates
`create / make / start a (new) diagram` with shapes on the canvas asks `Keep the current one or start empty?` and lists the 24 templates (process, cycle, hierarchy, pyramid, funnel, timeline, list, matrix, target, venn, hub, heart, burst, steps, bridge, mountain, spiral, wave, tree, road, balance, hourglass, sunrise, pillars); `keep it` / `start empty` answer it (`diagram.answerNew`, pending state `state.pending`). `clear the canvas` starts empty at once. `a tree-like shape`, `an org chart`, `a flowchart` (read as `process`), `a cycle`, `a pyramid`, `a funnel` build the template. `connect them with a dashed arrow` with no named ends connects the last two shapes drawn.

## 6. Parity with the source
`node scripts/eval-diagram.mjs` also reads every row of `data/test` and `data/bench` with the source rules reader (`imports/diagram-vss-demo/engine/logic.js`, `createSystem().formalize`, loaded by `scripts/lib/diagram-source.mjs`) and prints the parity table (act right, args right, wrong, unread; the table is in `training/RESULTS.md`).

## 7. DIAG3b: templates, ids, old names, selection
- `a tree like shape`, `tree-like`, `tree shape / structure / diagram / chart` mean the **hierarchy** template (the source reader's `tree` is the picture of a tree with roots; a plain `make a tree` keeps it). The reply names the template (`Drew a hierarchy of ... as the group Hierarchy1.`).
- Any command other than the answer to `Keep the current one or start empty?` answers it as keep: the reply starts with `Keeping the current diagram.` and a later `start empty` finds nothing to confirm.
- Shapes made by a template get short ids like any shape (`r1`, `e1`); replies never show a part name (`Tree1-trunk`, `Branch1`).
- `rectangle1`, `circle2` ... mean the Nth shape of that kind the person drew; shapes made by a template do not count (their ids follow the same numbering).
- The state exposes `kind` (circle, rectangle ...) of every shape.
- Only a selection marks shapes: `select ...`, or the answer of a question; a template or a command that makes shapes marks nothing.
- Spelling: among equally close candidates the one made of the same letters wins (`lable` is `label`, not `able`).
- "in the diagram" / "on the diagram" after a shape request (`pat.diagram.sketch.create.in`, `signal=true`) names this world: "draw three circles in the diagram" is a diagram request on the Drawing tab too, not a place for the drawing world.

## 8. Diagram shaped like a thing (DRAW-FROM-FACTS)
"A diagram shaped like a house", "make a diagram shaped like a lighthouse", "arrange the boxes as a house" (`pat.diagram.sketch.shaped`, `.shaped.arrange`, action `diagram.shapedLike`, `shapedLike` in `ops.mjs`). The thing is an open slot read after the pattern: it is looked up in the catalog of drawable things (`worlds/art.draw/things.catalog.mjs`, from `knowledge/k.objects`, spec 07 section 7). One rectangle is created per part of the object, in draw order, named after the part (`left_window`; a name that is taken gets a number) and labelled with the part name ("left window"); its position and size come from the part's box `x y w h` in the object's 0-100 frame, scaled uniformly so that the whole fits the canvas (about 700 x 410) and centred. Nothing else is created: no arrows, no extra boxes; the colours of the parts are not copied (the diagram's own defaults apply). One undo takes the whole diagram back. A layout word in the slot (row, column, grid, circle, tree ...) with shapes on the canvas is the engine's own arrange, so the existing layouts do not change; a thing with no facts is answered plainly: "I don't know how to draw a diagram shaped like a blorp yet." and nothing is created.

**Pronouns (2026-11-14).** The engine reader takes `ctx.last` as the array of names the last command made or named (`state.last`): one name is "it", several are "them". `engine.mjs` `readerCtx` passes that array (a `{ref}` object, as it did before, was read as no referent, so "make it red" failed with "Which shape should I change?" even across turns and in a clause after "add a circle and"). With it, "add a circle and colour it blue" and "add a circle then make it red" work through the shared clauses-in-sequence reading (spec 03). The other executor worlds (art.draw, docs.editor, data.charts, plan.seating) resolve a pronoun from the focus of the shared executor; geo.map and media.music have no creatable things named by a pronoun. Tests: `tests/clauses-in-sequence.test.mjs`.
