## Q-H4 (hand-over from PSys2, 2026-11-13): turn kinds, focus-and-fill glue and why-answers as `std.dialogue`

Question: will the library take `handover/session.dialogue/` as `std.dialogue`, built on `std.focus` and `std.fill`?
Context: `Dialogue.fill` already writes your `std.focus.*` and `std.fill.*` wires, so the fill logic is yours. What is general and still ours: classifying a turn
(continuation, list, correction, complaint, why-question, acknowledgement) before any world sees it, the plain per-turn record (JSON, part of undo snapshots), and
the why-answer composed from that record plus the world's own `why` hook. Replies are English strings built in code; for the library they should be templates
keyed by language. Open design point: the turn record's shape (`readAs`, `fillSources`, `effect`, `tabBefore/After`) should become a `std.focus.turn` extension.
Options: (a) `std.dialogue` ships the classifier and the why-composer, the host passes the record; (b) only the record format and why-composer, the classifier
stays with the host's English reader. PSys2 prefers (a) with the phrases in a language pack.
Blocking: no. Meanwhile: PSys2 keeps its bridge.
