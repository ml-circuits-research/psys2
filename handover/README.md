# handover/

Hand-over packages for modules that are general and therefore leave PSys2 (worker-tasks 2026-11-13 22:40 and 22:50). Nothing here replaces code in
`worlds/` or `src/`: the files are COPIES taken at main 9e370c47. PSys2 keeps its bridges until the vendored or looked-up version lands, then deletes
them (see `docs/host-boundary.md`).

Each package: `README.md` (what it is, API, host dependencies, tests to carry, what the host keeps, general line count still in PSys2),
`sop/` (SOP Lang), `fn/` (function code), `generators/` (build scripts), `tests/` (tests to carry), and `PROPOSAL.md` (written in the target
repository's `questions.md` format; the reviewer forwards it, the target's worker numbers it on import).

| package | target | general lines still in PSys2 (copies in this folder) |
| --- | --- | --- |
| acts | sopworld `std.acts` | 458 SOP + 1,117 code + 580 generators |
| space | sopworld `std.space` | 293 SOP + 1,648 code + 28 generator |
| session.things | sopworld `std.things` | 263 SOP + 460 code |
| session.dialogue | sopworld `std.dialogue` (on `std.focus` / `std.fill`) | 151 SOP + 529 code |
| common.sense | sop-knowledge-worlds (facts) + 62 lines of reader code to the library | 565 SOP (336 of them facts) + 62 code |
| meta.worlds | sopworld `std.route` (rules and code); the cards stay generated here | 407 SOP + 308 code |
| knowledge-loader | sopworld `std.knowledge` | 931 code + 119 generators |
| turn-pipeline | sopworld `std.turn` (the pieces named in its README, not the whole files) | 2,764 lines in the copied files, general part estimated in its README |
| failure-ledger | sopworld `tools/` (format and grouper) | 160 generator lines |
| sop-knowledge-worlds | sop-knowledge-worlds | 264 SOP (plan.seating and plan.timeline schemas, legends, lexicons) |
| w.lang.ro (DRAFT, 2026-11-14, Q13) | sop-knowledge-worlds (`w.lang.ro`, a language world: Romanian as data) | 405 wires + a 632-lemma dictionary; see its README |

Counts are `wc -l` of the copied files. They are the number to report per landing and what the inventory script
(`scripts/knowledge-inventory.mjs`, KNOWLEDGE-OUT) should report as "general module living in PSys2".
