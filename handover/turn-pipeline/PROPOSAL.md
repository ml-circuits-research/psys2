## Q-H9 (hand-over from PSys2, 2026-11-13): the language-free turn pipeline as `std.turn`

Question: will the library offer the general turn mechanisms: compute budget, dry run, veto with all-or-nothing holds, tiered fill, graded fallback, why-answer, value check?
Context: see `handover/turn-pipeline/README.md` (table by file and function). All of it works over a "segments" structure that any host produces (clause text, wires,
match, unparsed flag, veto). Each piece was measured in PSys2 (owner logs, ledger groups); the budget and the all-or-nothing hold are the ones other projects
will hit first (a hung turn; a half-done multi-clause message). Replies are English strings today and must become templates keyed by language.
Options: (a) one `std.turn` module with the pieces as separate functions; (b) separate modules `std.budget`, `std.veto`, `std.why`. PSys2 prefers (b) for the budget
(it is used outside turns too) and (a) for the rest.
Blocking: no. Meanwhile: PSys2 keeps the code in `src/dialog/`.
