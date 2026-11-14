# 25. Random as a world (host side of `std.sample`)

Status: implemented with sopworld 0.59 (vendored 0.62) (`sample`, `diversity`). Code: `src/dialog/sampler.mjs`, the worker op `sample` in `docs/webchat/ui/engine-worker.mjs`, the host in `docs/webchat/app.mjs`. Tests: `tests/sampler.test.mjs`. Measurement: `scripts/measure-dice.mjs` (rows in `training/eval/dice-samples.jsonl`).

## Rule
No hard-coded examples and no generator of our own. The dice, the example chips and the action buttons all come from the library's `sample`. Deleted by this spec: `docs/webchat/surprise-pool.json` (214 hand-validated texts, a 25-minute build), `src/dialog/surprise.mjs` (pool build and picker), `tests/surprise.test.mjs`, the welcome examples (`EXAMPLES` in app.mjs), the empty-state lists of the Talk, Charts, Editor and Documents tabs and the "Try: ..." hints of the Map and the editor view, and the generator of `scripts/coverage-grid.mjs` (forms x verbs x kinds, with its placeholders).
When the library has no sampler, `available` is false, every call returns `[]` and the host shows no dice result, no chips.

## The library interface (0.59, confirmed against `docs/api.md` and the source)
`sample(world, { seed, n, mode: 'one' | 'few' | 'actions', prefer: { world, thing }, seen, realise, read })` returns `{ frames: [{ action, args, world, why }], tried, kept, roundTrip? }`. The frames are language-free and legal in the world's state (a dry run on a fork). It reads `std.schema.kind` (acts per kind), `core.slot` (enum, range, join), `std.schema.kinds from=` (open kinds from facts) and the things of the world, and weighs recency, novelty (`seen`, the history) and chance. `diversity(frames)` counts acts, kinds, attributes.
Differences from the first description of this spec: the library takes a `World` the host built (not a host object), the language world is the host's (`realise`/`read` are optional hooks), and `mode: 'one'` draws a frame among several (`undo` is offered even when the host has nothing to undo).

## What the host states to the library (`sampleWorldOf`)
Per schema world (`acts.schema`, spec 21), rebuilt for each call from the session:
- a type and a `std.schema.kind` per kind, with the acts of the kind, minus the acts the schema marks `dice.not=<act>` on the kind (acts that need words, a second thing or data: a heading needs its text, an arrow two shapes, a route two places); `make` of an open kind (`any`) comes from its nouns as facts (`std.schema.kinds`), minus the generic words (object, item, shape, thing); `make` of a kind that lives `in` a numbered/named container needs that container; `make` of `group` is the act group.
- a `core.slot` per attribute: enum and colour values as plain words (at most 14, no `light_red` forms), a number with its `min`/`max`; a text attribute has no slot (the host does not invent words).
- one wire per thing of the session (the world's `referents`, at most 40), typed with the schema kind it belongs to.
Schema attribute added: `dice.not=<act>` on `acts.kind` (`worlds/acts/acts.mjs`, parseSchema; the generated `ops.mjs` carries it).

## Host checks the library cannot make
`undo` only when the world has history; a `change` to the value the thing already has is dropped; the label of a thing is the world's own (`executor.labels`), made unique by its colour or its name when two things read alike, and dropped when it stays ambiguous; attributes named like prepositions (`to`, `from`) are not said as "Set X to to V".

## Rendering
`realise(frame)`: make "Add a K." / remove "Remove L." / copy "Copy L." / pick "Select L." / undo "Undo that." / change "Set L attr to V." / ask "What is the attr of L?" (no attribute: no sentence). These are the forms every schema world reads; when w.lang.en gets realisation frames they move there (question in `questions.md`). The round trip (`read`) is not used yet: the measurement judges by state instead.

## Host uses
1. Dice in the input bar: `rollDice(view)`, worker op `sample` mode `one`: the open tab's world, else a world used lately, else any loaded schema world; a sample of another world's tab opens that tab first.
2. Talk: 3-4 examples (`few`) from the worlds of the session, refreshed after each turn; the welcome message shows the same.
3. Every other tab: the acts that fit the selected (salient) or newest thing (`actions`), in the strip above the input, refreshed after each turn and on each tab change.
4. A small dice in the corner of every tab panel but Talk (full-screen tabs), the same `rollDice(tabId)`.
5. Empty states of Talk, Charts, Editor, Documents ask `host.sample('few', { tab })`.
6. `scripts/coverage-grid.mjs` (grid v3): the cells of a world are a walk of the sampler (`--per`, default 40) with the walk before a cell as its setup.

## Measurement (2026-11-14)
`node scripts/measure-dice.mjs --per 23` presses the dice in one session per tab world, with the tab open, and judges by state: a changing act must change the state of any world except the conversation's own bookkeeping, and must not answer with a counter-question; a question must be answered and supported. 207 samples across 9 tab worlds: see `docs/lessons.md` and `worker-log.md` for the result and the diversity (acts, kinds, attributes), and `training/eval/dice-samples.jsonl` for the rows.

## Known limits
Every schema world publishes its referents the same way: the default `referents` of the executor reads `state.items`, and a world whose things live elsewhere declares WHERE in `schema.sop` with `thing=<state path>:<kind>[:<id key>[:<name key>[:dice]]]` (a fifth field `dice` marks things that only the dice names: pronouns and "the last one" do not resolve to them; the reader's documents, whose own context is its search results and sections) (data.charts `thing=charts:chart`, geo.map `thing=markers:pin` and `thing=highlighted:place:cc:name`, media.music `thing=current:song`, docs.reader `thing=docs:document::title`). The executor derives id, kind (the entry's own `kind` when the schema has it), name (named kinds only), `n` (the position in the list: "chart 2" is the second chart, "list 2" the second list of the document, never the digits of an id) and the schema attributes the entry carries. A hook `referents` (art.draw, diagram.sketch, docs.editor) still wins. Kinds whose acts the world cannot do from a sentence are marked `dice.not=<act>` (a document cannot be re-added, a pin has no colour, a song is not changed or removed by name).
The avatar world has no sampleable kind; its dice falls back to another world.
