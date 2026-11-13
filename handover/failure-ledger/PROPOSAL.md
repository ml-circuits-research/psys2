## Q-H10 (hand-over from PSys2, 2026-11-13): a failure ledger format and grouper in the library tools

Question: will the library ship the failure-ledger format (append-only JSONL, key = source + text + tab), its append and its cause grouper with pluggable cause signals, as a tool?
Context: PSys2's ledger turned "fix this sentence" work into "fix this group" work: each change names a group and reports its count before and after. Any project
built on sopworld has the same need. The format and the counting are general; the cause signals are the application's (a list of name + predicate over a row).
See `handover/failure-ledger/README.md`.
Options: (a) `tools/ledger.mjs` with `append(file, rows)`, `group(rows, signals)`, `report(groups)`; (b) document the format in SPEC only. PSys2 prefers (a).
Blocking: no. Meanwhile: PSys2 keeps its scripts.
