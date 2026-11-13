# common.sense -> sop-knowledge-worlds (facts) and the library (reader)

**What it is.** A world of common-sense facts (`kb.sop`, 336 lines: what lives where, what supports what, what is around what, face parts, usual places, rules),
a legend (190), and a matrix (23). `fn/commonsense.mjs` (from `src/knowledge/`, 62 lines) reads them.

**Where it goes.** The facts are general knowledge: they belong in sop-knowledge-worlds, which already has k.scenes (usual place and size of 2,033 things),
k.layouts, k.attributes and k.commonsense. The step is a diff, not a copy: import what `kb.sop` has and k.* lacks (the inventory script lists it), then delete
`kb.sop`. The legend and matrix are the shape of those facts and should be checked against k.commonsense's schema before importing (the proposal asks for a
reconciliation, not a second schema). `commonsense.mjs` is reader code and goes to the library's `std.knowledge`.

**API (`fn/commonsense.mjs`).** `ZONES` (a general table of zones, to move to k.scenes), `zoneOfWord`, `placePhrase`, `habitat(knowledge, word)`, `adviceFor(knowledge, name, placeWord)`, `habitatSentence`. The English sentence builders are language-pack content.

**Host dependencies.** None beyond the wire reader.

**Tests to carry.** `tests/commonsense.test.mjs`, `sop/tests.sop`.

**Host keeps.** Nothing of the facts. The `world.sop` registration disappears when the world is looked up from the catalog.

**General lines still in PSys2:** 565 SOP (kb 336, legend 190, matrix 23, tests 4, world 12), 62 code.
