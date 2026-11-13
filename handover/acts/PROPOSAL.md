## Q-H1 (hand-over from PSys2, 2026-11-13): take the acts, executor, schema generators and coverage grid into `std.acts`

Question: will `std.acts` adopt `handover/acts/` from PSys2 (copies, main 9e370c47) as its starting code and test sentences?
Context: PSys2's `worlds/acts` is the general implementation of your Q27 design: 15 acts, six roles, `parseSchema`, `createExecutor` (run, undo, redo,
diff, why-answer), the graded fallback (said > focus > scene > knowledge > default for the thing role), `generate(schema)` producing lexicons, patterns,
operations, templates and a matrix form, and `coverage-grid.mjs`, which generates one sentence per act x kind x value and judges each cell by what happened
(state changed / answered / not refused). What PSys2 found: generated worlds passed 7/7 in both reasoners for plan.seating; the grid is the cheapest honest
completeness test. English forms are in `forms.more.mjs` and need a language-keyed pack. `COLOURS` must come from `k.values`.
Options: (a) adopt the code and port to `std.acts` as functions over schema wires (your Q27 point 2); (b) take only the tests (the grid, the 15-act count)
and rewrite. PSys2 prefers (a) and will switch to the vendored version when its counts match: art.draw 594/596 and diagram 741/771 as today.
Blocking: no. Meanwhile: PSys2 keeps its bridge and deletes it on landing.
