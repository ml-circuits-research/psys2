## Q-H2 (hand-over from PSys2, 2026-11-13): relations and the space solver as `std.space`

Question: will the library take `handover/space/` as `std.space` (selection, moves, placement relations, layouts, piece facts, solver)?
Context: general code written for the drawing board and the diagram tab; nothing in it names a tab. It takes items with boxes and a frame and returns planned
moves with reasons (`why(f, names)`). Its only knowledge is the `KNOWLEDGE` table and `usualPlace` (to move to k.layouts / k.scenes and read through
`std.knowledge`). The relation facts (on, in, next_to, left_of, ..., apart_from) have conflicts and a rule set, which maps onto wires with tiers.
Options: (a) port as functions in the standard pack with relation wires as SOP Lang (`std.space.rel`); (b) keep it as a plain module of the library outside
`std.*` and load it as a host function module. PSys2 prefers (a) for the relations and (b) for the numeric solver.
Blocking: no. Meanwhile: PSys2 keeps its bridge.
