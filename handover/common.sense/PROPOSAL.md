## Q-H5 (hand-over from PSys2, 2026-11-13, task: facts out of PSys2)
Question: please import the facts of PSys2's `worlds/common.sense/kb.sop` (336 lines, 62 facts by the reviewer's count) that k.scenes / k.commonsense / k.attributes lack, and tell us which ids to look up instead.
Context: `handover/common.sense/sop/kb.sop` is the file, with its `legend.sop` and `matrix.sop`. The fact types are: lives in, supports, around, face part, usual place, and a few rules. Your k.scenes holds the usual place and size of 2,033 things, so most are probably covered; the ones that are not (rules, `around`) need a type in k.commonsense. PSys2 will delete its kb and read these through the catalog.
Blocking: no. Meanwhile: PSys2 keeps its copy (not longer than one landing).

## Q-H6 (hand-over from PSys2, 2026-11-13, task: SOP-only reusable worlds)
Question: will you take the schemas of `plan.seating` and `plan.timeline` (and the value / act words that PSys2 holds) as reusable worlds `w.plan.seating` and `w.plan.timeline`?
Context: see `handover/sop-knowledge-worlds/README.md`. They are SOP Lang only (`acts.schema` wires: kinds, attributes, acts, limits). Worlds, not knowledge, so
they may need a different top folder than `k.*`.
Blocking: no. Meanwhile: PSys2 keeps the schemas as fixtures.
