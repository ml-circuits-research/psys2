## Q-H11 (hand-over from PSys2, 2026-11-13, task: SOP-only reusable worlds)
Question: will you host the schemas `plan.seating` and `plan.timeline` as reusable worlds, and check the number words and colour values PSys2 holds against k.values?
Context: `handover/sop-knowledge-worlds/` has the two schemas (`acts.schema` wires, 13 and 12 lines) with legend, lexicon and tests. They are worlds, not
knowledge, so a `w.*` folder beside `k.*` may fit better; your call. Number words: `worlds/lang.common/lexicon.sop` (259 entries, number words, yes / no,
politeness); colours: `COLOURS` in acts.mjs and 10 more files. Please say which of the number words and colours k.values lacks.
Blocking: no. Meanwhile: PSys2 keeps the schemas as fixtures and the words in lang.common.
