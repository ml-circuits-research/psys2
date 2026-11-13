# acts -> sopworld `std.acts`

**What it is.** About twelve universal acts (make, remove, change, place, connect, group, pick, ask, copy, send, undo, redo, save, load) over six roles
(thing, set, attribute, value, place, amount); the schema of a doing world (`acts.schema` wires: noun, acts, limits, kinds, attrs); the generic executor
that applies an act to a schema-described state, with undo, the diff, the reply and the why-answer; the graded fallback (not-here, question, cannot-do,
"the X world can"); the generators that turn a schema into a world (lexicons, patterns, operations, templates, matrix form); the coverage grid.

**API (`fn/acts.mjs`).** `parseSchema(wires)`, `serializeSchema` / `deserializeSchema`, `formsFor(schema)`, `generate(schema, ns)`, `examples`, `sentences`
(the coverage-grid input), `card(schema)`, `splitThings(text)`, `createExecutor(schema, hooks)` giving `{ run, operation, interceptInput, init, referents,
outOfScope }`. `fn/matrix.mjs`: `matrixSop`, `matrixTemplates`, `createMatrixFns` (matrix-reasoner form). `fn/forms.more.mjs`: forms and flags.
`fn/verbs.generated.mjs`: act verbs generated from k.actions by `generators/build-acts-lexicon.mjs`.

**Host dependencies (hooks, all optional and synchronous).** `know.kind`, `know.usualPlace`, `know.attrDefault`, `know.colour` (the catalog: library
`std.knowledge`), `focus` (std.focus), `whereKind` / `whereAct` (the world registry), `send` (inter-world move), `unread` (the world's own reader),
`domain.<act>` (a world's own effect). The English FORMS and TURN_WORDS in `acts.mjs` / `forms.more.mjs` are English content: they go with the module as
its English pack (language-keyed); the host's translation layer stays outside. `COLOURS` in acts.mjs is a general fact that must come from k.values.

**Tests to carry.** `tests/acts.test.mjs` (counts 15 acts), `sop/tests.sop`, the generated worlds' tests (`tests/fixtures/worlds/test.seating`, pilots
`plan.seating`, `plan.timeline`), and the coverage grid run in both reasoners (`generators/coverage-grid.mjs`).

**Host keeps.** The tabs' own schemas (`schema.sop` of art.draw and diagram.sketch), the renderers, the `viewOps` wiring to tabs, the translation layer, the
one-line bindings in `worlds/<id>/ops.mjs` (`X.operation(ctx, 'make', args)`), the call of the generators in its build.

**General lines still in PSys2:** 458 SOP (`sop/`), 1,117 code (`fn/`), 580 generator lines (`generators/`: build-schema-world 61, build-acts-lexicon 54,
coverage-grid 87, act-agreement-rules, gen-act-tagger-data).
Library side: sopworld Q27 already plans `std.acts` with `diff` / `why`; this package is the behaviour to match and the sentences to test it with.
