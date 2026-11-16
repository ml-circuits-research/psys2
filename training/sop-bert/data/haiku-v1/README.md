# Haiku v1 reader rows (reviewer-generated, 2026-11-16)

15,919 English messages for the four areas (drawing 3,997; diagram 3,987; document 3,998; calendar 3,937), written by 64 Claude Haiku agents from `INSTRUCTIONS.md` and `questions.json`, 16 batches per area. Each batch had a style focus (short commands, polite/indirect with propose and check, multi-request messages for the cutter, follow-ups/fragments/objections with `context.previous`, questions about the state, messy typing with typos, references by description/ordinal/quantifier/negation, relative and vague changes) and its own theme. Every row passed `validate.py` (`python3 -I validate.py OUT CLEAN`): exact spans in order, `*_span` answers inside their span, closed values from the lists, act/mood present. 81 rows were rejected and 2 duplicates dropped.

Row: `{id, world, context:{existing:[{name,kind}], previous}, text, requests:[{span, trigger, answers:{question: value}}]}`. A missing question means none. About 3% of rows have no request (cutter negatives).

Status and limits, measured, not assumed:

- These are training and calibration rows only. The final held-out set must come from a different source (the owner's reviewed English turns and an independently written set), never from these generators.
- The questions were written by hand from book chapter 7. The per-(wire type, key) inventory in `../../heads/inventory.json` (21 types, 134 keys, 72 concept heads, 18 shared across areas) shows the gap: mapped onto it, only 23 of 134 keys reach the coverage gate (at least 300 examples, every closed value at least 40), and 62 keys have no example. `../../heads/COVERAGE-haiku-v1.txt` lists every key. A v2 generation targeted at the gaps, annotated in the general request form (target, constraints with key, operator, phase, polarity, character, step), follows.
- In the first 20 batches, `mood=check` rows sometimes use a domain act instead of `act=answer` (the rule was added later); normalise check rows to `act=answer` when converting.
- `negated` holds the name of the negated question; some batches put it on a span key (`room_span`), others on a closed key (`shape`).

Use: train the cutter (B/I/O over the whole message), mood, act, target fill, and the shared heads that have coverage; map v1 questions to inventory keys with the table in `../../heads/coverage_v1.py` (M and W). Heads must follow the inventory (one head per concept, wire type as context), not this questions file.
