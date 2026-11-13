# 22 — Things, aspects and views: transfer of knowledge between worlds (TRANSFER, first slice)

Implementation: `worlds/session.things/` (module world: `things.mjs` the store, `view.mjs` the view wrapper, `ops.mjs` the operations, patterns that read what the user teaches), `src/knowledge/learned.mjs` (session.learned), a `view` declaration in a schema (spec 21, `acts.view`), thin hooks in `worlds/acts/acts.mjs` (`before`, `after`, `send` with a refusal reason) and `src/interpreter/index.mjs` (`ctx.knowledge` is the catalog with the session's learned wires overlaid). Tests: `tests/things.test.mjs`. Experiments: `scripts/exp-transfer.mjs` (T1, T2).

## 1. Why
Each tab kept its own things, and moving one to another tab was code per pair (Talk card to drawing, to diagram, to map). What a thing is does not depend on the tab that shows it. One store of things per session; a tab is a view of it.

## 2. A thing
`{ id, kind, name, label, attrs, parts, origin, shown, aspects }`. The identity (`id`) is kept across views. `kind` is a word of the knowledge ("hat", "table", "city"); `attrs` hold what the view that made it knows (colour, seats, place, name); `parts` is the picture in the 0-100 frame when it has one; `origin` is the view that made it, `shown` the views that hold it. The state of the world `session.things` is the store; it lives in the session and is saved with it.

## 3. Aspects
visual, spatial, relational, numeric, textual, geographic, temporal, social. `aspectsOf` reads, strongest first: `knowledge` (what the catalog says about the kind: parts = visual + spatial, `k.geo.*` = geographic + spatial, `k.time.*` = temporal, `k.people.*` = social + visual, `k.faces.*` = visual + spatial, `k.animals.*` and `k.units.*` and commonsense `usually_count` = numeric), `learned` (what the session was taught, and what the kind is learned to be a kind of lends), `schema` (`aspect=` of an `acts.kind`), `attribute` (an attribute the thing carries: colour is visual, a number is numeric, `seats`, `place` ... by a table marked TEMPORARY until `k.attributes` arrives). Every named thing has `textual` and `relational`: it can be listed and linked. Each aspect keeps its source, so a reply can say why.

## 4. Views
A schema world declares `acts.view` (`aspects=`, `word=`); the generator gives it two operations: `<ns>.view` (its declaration) and `<ns>.adopt` (take a thing: the act `make` of the executor with the thing's kind and name, then `change` for each attribute the schema has for that kind; one undo step per act as always). A world that is not a schema world (Talk) writes the two operations itself. The gate of `things.show` is two questions asked in this order, and each refusal is said in plain words:
1. the thing has at least one aspect the view shows ("A hat has no look to show in..." never reaches the user for a thing that has one);
2. the view has a kind for it, read at the knowledge tier: an unknown word that the knowledge says is a kind of one of the view's kinds is read as that kind ("a waiter is a kind of person", "A waiter is a kind of guest. I added guest Sam.").
The act `send` of every view (and "send it to X" of Talk) is this one operation; there is no code per pair of views. A view that does not hold the thing named in a `send` hands the words to the store, which knows every thing of the session.

## 5. Who writes what
The view that made a thing owns its kind, name, label and parts. Any view may change an attribute by an act: after every request a view publishes its things (`things.sync`, the whole list), and a view other than the origin changes an attribute only where it differs from what that view published last (`seen`), so a stale copy never overwrites what another view changed; the first publication of a view overwrites nothing. A thing that no view shows any more is dropped.

## 6. session.learned
`parseTeach` reads a taught sentence in six forms: "X is a kind of Y" / "a X is a Y", "my X is called N" / "I have a X called N", "X can / cannot V", "X V" with V an ability (seed list, TEMPORARY), "X live in Y", "X is made of Y". Each becomes a wire of the knowledge format (`@learned.N k.words.sense ... is_a=` / `k.commonsense.thing ... can= cannot= at= made_of=` / `session.learned.own kind= name= owner=user`, `core.source="user"`) in the state of `session.things`. `withLearned(catalog, read)` returns the catalog with those wires overlaid (same API: `peek`, `thing`, `wires`, plus `own(kind)` and `ancestors(word)`): a taught kind is drawn as the kind it is a kind of, a taught ability is in the commonsense record, a thing of the user is a thing of its kind under its name. The overlay belongs to the session; the shared catalog is never changed. A form that nothing reads is a ledger row, not a pattern.

## 7. Known limits of this slice
- Three views (the pilot avatar, the seating plan, Talk). Draw, diagram, map, charts and the document are not views yet; Talk's `send` to draw, diagram and map is still code per pair (about 25 lines) and goes when those worlds are views.
- Facts about animals and pets taught in a sentence that `kids.animals` also reads ("ducks float", "fish live in water", "my dog is called Rex") are stored by that world as its own wires and are not seen by other views: the same sentence has two readers and the one with the private store wins the routing. Unifying them (statement wires of every world visible to the overlay) is the next decision, not a pattern.
- `k.attributes` is not in the catalog; the attribute table in `things.mjs` and the ability seed in `learned.mjs` are marked TEMPORARY.
- A view holds a copy, not the shared object: another view sees a change at its next show or sync.
