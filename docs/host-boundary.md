# Host boundary: what stays in PSys2, what moves out

Written 2026-11-13 from the owner's rule (worker-tasks 22:30, 22:40, 22:50): PSys2 is an application. Everything general leaves it: facts and SOP-Lang-only
worlds go to **sop-knowledge-worlds** (SKW), mechanisms that need functions go to the **sopworld library** (`std.*`, versioned and vendored). The library
session writes the same contract from its side (its Round 24); the two documents must agree, and where they differ the library's wording of the interface wins
and this table is corrected.

Legend: **stays** = application; **lib** = moves to the sopworld library; **SKW** = moves to sop-knowledge-worlds. Hand-over packages for the "lib" and "SKW"
items are in `handover/<module>/` (copies; the bridges here are deleted when the vendored or looked-up version lands). Line counts are `wc -l` at main 9e370c47.

## `src/`

| path | verdict | reason |
| --- | --- | --- |
| `src/soplang/` | stays (vendored library) | PSys2's browser build of SOP Lang; `src/vendor/sopworld/` is the library itself, vendored; the long-term source is the library only. |
| `src/vendor/` | stays (vendored) | copy of the library with licences; replaced on each library release. |
| `src/legends/` | stays until the library covers it | legend loading; general SOP-Lang plumbing, becomes the library's loader when equal. |
| `src/interpreter/` | stays until the library covers it | runs worlds (hooks, memory, render); general but already mirrored by the library's interpreter; delete on switch. |
| `src/reasoner/` | stays (host adapter) | glue between the turn and the library's reasoner / `world.veto`; the library does the reasoning. |
| `src/worlds/` | stays | the world set, validation, lexicon and canonical forms of this application. |
| `src/astra/` | split | `frames.mjs` (fill / confirm / choice / mode), `focus.mjs`, `where.mjs`, `moves.mjs`, `registry.mjs` are general (dialogue state): lib (`std.focus`, `std.dialogue`). `persist.mjs` (snapshot to localStorage), `session.mjs`, `log.mjs` stay (host storage and session). |
| `src/dialog/` | split | see "Turn pipeline" below. `dialogue.mjs` lib (`std.dialogue`); `meta-worlds.mjs`, `symbolic-router.mjs` lib (`std.route`); `knowledge-lookup.mjs` lib (`std.knowledge`); `budget*.mjs`, `world-aware.mjs`, `continuation.mjs`, `discourse.mjs`, `value-check.mjs`, `dispatch-validate.mjs` lib in their general parts. Stays: `index.mjs` (the engine host), `normalizer-runtime.mjs`, `encoder-dispatch.mjs`, `word-reader.mjs`, `reader-route.mjs`, `runtime-config.mjs`, `time-limits.mjs`, `test-runner.mjs`, `meta.mjs`, `scene-referents.mjs`, `surprise.mjs`, `followup.mjs` (English reading, normalizer, encoder, UI). |
| `src/formalizer/` | stays | English reading: rules, spelling, wordpiece, ONNX client, normalizer glue (AGENTS.md: English is the host's job). |
| `src/translate/` | stays | boundary translation (Romanian etc.): application layer, never in worlds. |
| `src/knowledge/` | lib | `catalog.mjs`, `facts.mjs`, `faces.mjs`, `learned.mjs` -> `std.knowledge`; `commonsense.mjs` -> `std.knowledge` (its facts to SKW); `layouts.mjs` -> `std.space`. |
| `src/loaders/` | split | `knowledge-source.mjs`, `knowledge-cache.mjs`, `bundle-loader.mjs` lib (`std.knowledge`); `fs-loader.mjs` stays (host file access). |
| `src/server/` | stays | the HTTP server of this application. |
| `src/cli.mjs` | stays | application CLI (`test-world`, ...); the generic `test-world` runner moves to the library's CLI when it covers it. |

## `worlds/`

| path | verdict | reason |
| --- | --- | --- |
| `worlds/core/` | stays (bridge) | bootstrap legend; the library's own `core` replaces it. |
| `worlds/acts/` | lib (`std.acts`) | acts, roles, executor, schema, generators, graded fallback; no tab named in it. English forms go as its English pack. `handover/acts/`. |
| `worlds/space/` | lib (`std.space`) | selection, relations, layouts, solver, pieces; its `KNOWLEDGE` table to SKW k.layouts / k.scenes. `handover/space/`. |
| `worlds/session.things/` | lib (`std.things`) | one thing across views; the registry is host-independent. `handover/session.things/`. |
| `worlds/session.dialogue/` | lib (`std.dialogue`) | focus, turn kinds, why-answers on `std.focus` / `std.fill`. `handover/session.dialogue/`. |
| `worlds/session.conversation/` | stays (bridge) | the conversation wiring of this application's session; revisit when `std.dialogue` lands. |
| `worlds/common.sense/` | SKW (facts) | 62 general facts; become k.scenes / k.commonsense entries. `handover/common.sense/`. |
| `worlds/meta.worlds/` | lib (rules, `std.route`); cards stay generated here | the routing rules are general; the cards (kb.sop, 509 lines) are facts about this application's worlds. `handover/meta.worlds/`. |
| `worlds/lang.common/` | split | number words, colour words and similar to SKW (k.values); `core.phrase` groups of yes / no / politeness / the English dialogue phrases stay (ADR-007, English host content). |
| `worlds/plan.seating/`, `worlds/plan.timeline/` | SKW (schemas) | SOP-only reusable schemas; generated files stay host. `handover/sop-knowledge-worlds/`. |
| `worlds/art.draw/` | stays (tab) | drawing tool schema and renderer glue; its colour tables, plurals, `BUILTIN` drawings and `things.catalog.mjs` are general facts to SKW (k.objects, k.values, k.words) and are removed by KNOWLEDGE-OUT. |
| `worlds/diagram.sketch/` | stays (tab) | diagram tool; its lexicon colours and ask forms read knowledge by lookup. |
| `worlds/data.charts/`, `worlds/docs.editor/`, `worlds/docs.reader/`, `worlds/ui.avatar/` | stay (tabs) | tool schemas and renderers; their colour names and default face come from the catalog. |
| `worlds/geo.map/` | stays (tab); kb to SKW | the map tool stays; 1,001 cities, 250 countries and 38 regions are k.geo. |
| `worlds/kids.animals/`, `kids.shapes/`, `kids.time/` | stay as thin tab worlds; kb to SKW | knowledge to k.animals, k.shapes, k.colours, k.time; question patterns become the `ask` act (one implementation). |
| `worlds/kids.arith/`, `kids.shop/`, `kids.tasks/`, `kids.common/` | stay | rule worlds that are this application's own content (shop's 26 prices are marked sample data); `kids.common` datagen holds word tables (plurals, number words, names) that go to SKW. |
| `worlds/games.*`, `worlds/media.music/` | stay | own content (games, sample songs). |
| `worlds/talk/` | stays (tab) | the Talk tab: knowledge by lookup; its cards stay generated. |
| `worlds/ui.help/`, `ui.shell/`, `user.profile/` | stay | facts about the application and the user, not general knowledge. |

## Other directories that generate or evaluate

| path | verdict | reason |
| --- | --- | --- |
| `worlds-pilot/` | stays | pilot output of the schema generators (art.draw, diagram.sketch) used for the switch measurements; deleted with the bridges. |
| `scripts/build-schema-world.mjs`, `build-acts-lexicon.mjs`, `act-agreement-rules.mjs`, `gen-act-tagger-data.mjs`, `coverage-grid.mjs`, `build-space-lexicon.mjs` | lib (`std.acts` / `std.space` tools) | schema generators and the coverage grid. |
| `scripts/build-thing-catalog.mjs`, `build-knowledge-lookup-set.mjs` | lib (`std.knowledge` tools) | catalog and bundle generation (the bundle generator must grow beyond objects). |
| `scripts/analyze-failures.mjs`, `build-failure-ledger.mjs` | lib (`tools/`): format and grouper; stay: cause signals and replays | `handover/failure-ledger/`. |
| `scripts/build-world-cards.mjs` | lib (card generator) when the card type is agreed | cards from a world's own wires. |
| other `scripts/` (evals, training exports, webchat builds, MT, normalizer) | stay | application measurement and build. |
| `training/`, `docs/`, `specs/`, `tests/` | stay | the application's training, documentation, contract, tests (module tests are copied into `handover/*/tests/` and move with the module). |

## Turn pipeline: general pieces by file and function

Order inside one turn, and where each general piece sits (copies in `handover/turn-pipeline/fn/`). Details in `handover/turn-pipeline/README.md`.

| step | what and why | file and function |
| --- | --- | --- |
| compute budget | every turn has a deterministic tick budget so that nothing freezes; exceeded work stops with evidence | `src/dialog/budget.mjs` `createBudget` / `installBudget` / `tick`; limits `budget-limits.mjs` |
| dry run | "would this be understood completely?" on a forked state with its own budget, without touching the real session, so the UI can validate while typing | `src/dialog/index.mjs` `_dryRun`, `forkForValidation`, settled-answer cache |
| reading (host) | English reading, translation, normalizer, encoder: stays | `src/formalizer/`, `src/translate/`, `normalizer-runtime.mjs`, `encoder-dispatch.mjs` |
| routing | which world reads each clause: card scoring with a context prior, optional encoder re-rank | `meta-worlds.mjs` `loadMetaWorlds`, `symbolic-router.mjs` `createSymbolicRouter`, `rerankPrediction` |
| fill | a fragment's missing roles by tier said > focus > scene > knowledge > default, the source kept for the why-answer | `dialogue.mjs` `fill`; `continuation.mjs`; `discourse.mjs` |
| veto | each reading is checked against the world's state (no referent, no running game, nothing to continue, library veto, words left out); a vetoed clause says why and may offer a rewrite | `world-aware.mjs` `vetoOf`, `reviewSegments`, `reviewOne`; `src/reasoner/index.mjs` `world.veto` |
| all-or-nothing | when a clause cannot be read, the readable clauses are held too, because a later clause may rest on an earlier one; the reply says which clause was not read | `world-aware.mjs` `reviewSegments` (`HOLDS`, `held` veto) |
| execution | the act is applied to the world's state with undo and a diff | `worlds/acts/acts.mjs` `createExecutor` |
| graded fallback | the most specific honest answer first (explanation, the world's `outOfScope`, did you mean, examples), never silence | `src/dialog/index.mjs` `_send` fallback block, `world-aware.mjs` `explainUnparsed`; `acts.mjs` `not-here` / `question` / cannot-do |
| why | the trace of the last turn explained in plain words with an offer to undo | `dialogue.mjs` `why` / `explain`; `worlds/space/pieces.mjs` `why` |
| reply and translation (host) | rendering and the boundary translation of the reply: stays | `src/interpreter/render.mjs`, `src/translate/` |

## General lines still in PSys2 (per module, report per landing)

| module | SOP | code | generators | target |
| --- | --- | --- | --- | --- |
| acts | 458 | 1,117 | 580 | std.acts |
| space | 293 | 1,648 | 28 | std.space |
| session.things | 263 | 460 | 0 | std.things |
| session.dialogue | 151 | 529 | 0 | std.dialogue |
| common.sense | 565 | 62 | 0 | SKW + std.knowledge |
| meta.worlds | 407 | 308 | 0 | std.route |
| knowledge-loader | 0 | 931 | 119 | std.knowledge |
| turn-pipeline | 0 | about 900 general of 2,764 in the files | 0 | std.turn |
| failure-ledger | 0 | 0 | 160 | tools |
| plan.seating, plan.timeline | 264 | 0 | 0 | SKW |
| **total** | **2,401** | **about 6,000** | **887** | |
