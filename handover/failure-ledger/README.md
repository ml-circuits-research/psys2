# failure-ledger -> sopworld `tools/` (format and grouper)

**What it is.** A failing case is data, not a task (rule "NO POINT FIXES"). The ledger is an append-only JSONL file; a grouper counts failures by cause so that
a change is accepted only if it names a group and reports its count before and after.

**Format (one JSON object per line).**
`{ text, tab, language, happened, expected, class, source, first_seen, build, was_passing }` plus `happened_then` for replays.
- `text` the user's sentence; `tab` the open tab world; `language` the input language;
- `happened` what the system did (reply, state, or "no reply"); `expected` what should have happened;
- `class` the row's failure class; `source` where it came from (an owner log, minimal pairs, dialogues, coherence, round-trip translation, routing confusions);
- `first_seen` date, `build` the build id, `was_passing` whether it passed on an earlier build.
Append-only: rows already present (key = `source` + `text` + `tab`) are never rewritten or re-added, and other agents append too. A sample is in
`sample/failures.head.jsonl` (first rows of `training/eval/failures.jsonl`).

**Grouper (`generators/analyze-failures.mjs`).** Groups rows by `class` plus a cause key derived from general signals in what happened (no reply, translation
residue, foreign-world reading, fragment / list split, continuation / correction, unknown kind, default place, region, amount, ...); prints counts per group
and five examples per group, spread over sources; `--out` writes a Markdown report. The signal rules are the application-dependent part: the library should ship
the format, the append and the counting, with a pluggable list of `(name, predicate)` cause signals (the signals above are PSys2's list).

**Replayer (`generators/build-failure-ledger.mjs`).** Replays the sources on the CURRENT build and appends failures; it calls PSys2's own eval scripts, so
only its structure (sources list, key, append-only, `--dry`, `--skip`) is general.

**Host dependencies.** The host provides the replay of each source (a function from the source to rows). Node `fs` only.

**Tests to carry.** None exist; the library should add: append-only keeps old rows, duplicates are not added, grouping is stable, five examples spread over sources.

**Host keeps.** The cause signals, the sources and their replay scripts, `training/eval/failures.jsonl`.

**General lines still in PSys2:** 160 (analyze-failures 74, build-failure-ledger 86), of which about 90 are general.
