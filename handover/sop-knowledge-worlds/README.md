# SOP-only reusable worlds -> sop-knowledge-worlds

SOP Lang only, no functions: they are data that other projects can reuse.

| world | what | copy | lines |
| --- | --- | --- | --- |
| `plan.seating` | schema of a seating plan: kinds table, seat, guest; attributes name, colour, place; acts make, remove, change, place, connect, group, pick, ask, copy | `plan.seating/schema.sop` (+ legend, lexicon, tests) | schema 13, all 4 files about 130 |
| `plan.timeline` | schema of a timeline: moments in a row by time; acts make, remove, change, ask, copy, send, undo, redo; `limit.items=60` | `plan.timeline/schema.sop` (+ legend, lexicon, tests) | schema 12, all 4 files about 134 |

The generated files of these worlds (patterns, operations, templates, `ops.mjs`, matrix) are NOT handed over: they are output of the acts generator
(`handover/acts/generators/build-schema-world.mjs`) and are regenerated from `schema.sop`. `ops.mjs` is a 25-line binding to the executor and stays host.

**Value words and act words.** The colour values (`COLOURS` in `worlds/acts/acts.mjs`, colour names in at least 10 files) go to k.values / k.colours; the act verbs
(`worlds/acts/lexicon.sop`, `verbs.generated.mjs`) are generated from k.actions and need no hand-over; the number words of `worlds/lang.common/lexicon.sop`
(259 entries, 5,468 lines in the world) go to k.values (222 number words there). The inventory script reports what k.* still lacks.

**Dependencies.** The `acts.schema` type (from the `std.acts` legend). **Tests to carry.** each world's `tests.sop`.
**Host keeps.** The generated world files and the choice of which schemas an application mounts.
**General lines still in PSys2:** 264 SOP (copies in the folders).
