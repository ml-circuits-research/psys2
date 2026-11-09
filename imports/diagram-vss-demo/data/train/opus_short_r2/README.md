# opus_short_r2: realistic short commands of the forms the readers miss (round 2, 2026-11-03)

**Realistic data written by an Opus writer agent** (the round-2 preparation session, 2026-11-03), for TRAIN_PLAN_R2.md section 5. The forms
come from today's failure analyses (combine/VSS_BERT_FAILURES.md, combine/VSS_FROM_TO.md section 5): requests that people type when they
fall back to short literal commands, and that both readers missed, read as another action, or read confidently wrong.

255 messages, 345 requests (4 batches; 7 messages excluded, 3 removed as overlaps). Domains: the default drawing (Start, Process, Check,
Done; 90 messages) and 20 others (networks, cloud, kanban, family tree, recipes, garden, game map, floor plan, wedding, thesis ...).

| form | requests or messages | examples |
|---|---|---|
| verbless commands (the span does not start with a verb or question word) | about 230 requests | "Draft blue", "start big", "check: hexagon", "Done → gold", "Check below Start", "Firewall: red, big", "Api → Cache → Db" |
| chained short commands and gapping (2+ requests in one short message) | 70 messages | "start purple, done orange", "Header top, Footer bottom, Sidebar left", "rename Lan to Office and Wan to Internet", "Begin instead of Start please, and Finish instead of Done" |
| self-corrections and requests taken back (gold: the final value; a request taken back has no wire) | 33 messages | "red. no wait, orange", "Done in navy... no, teal", "Stopped: octagon... ok no octagon, so a hexagon", "delete Cdn. no wait, keep it and just make it small" |
| narration around the command(s) | 60 messages | "ok so now undo pls", "Ugh I clicked something and Wolf turned into a star. undo pls. Then ...", "nah the Cdn box is pointless. delete it. thanks" |
| new forms the Rules do not read | 20 outline, 20 arrow by its ends / every arrow, 14 layout operations, 7 undo / redo counts, 4 templates, 4 help, 3 at x,y, 2 size in a description | "no border on Check", "take the outline off done", "go back two steps", "back 2", "number of lines on the canvas", "call the arrow from check to done approved", "turn the arrow around, the one from process to check", "make the arrows not cross", "the small ones, delete them" |

Conventions: LABEL_CONVENTIONS.md (self-corrections: the final value; verb ellipsis: each request its own span; "A to B, B to C" one chain;
several to one: one connect) and its last section (outline, undo count, arrow by its ends, kind=edge quantifier=all, layout operations);
where the conventions are silent the short3 gold was followed (verbless set: the trigger is the value word, "Done red" -> "red"; "start
left" -> move position=left; "make a timeline with Start Process Check Done" on existing shapes -> arrange template=timeline target=...;
"no border on X" -> set outline=none). A reference ("make it a hexagon", "Physio right of it") is written as the shape it refers to.

## How it was written and checked (synth/build_opus_r2.py)

1. Texts first: `texts/texts_NN.jsonl` (id, domain, names, text) were written and saved before any annotation (AGENTS.md). One change was
   made afterwards to a canvas, not to a text: or2-0001 "Draft blue" got `Draft` added to its `names` (the text names a shape that was
   missing from the canvas list; without it the tokenizer reads the sentence-initial "Draft" as a word).
2. Annotation: `annot/annot_NN.txt`, one line per request (span | trigger | wire | paraphrase).
3. Label check: every request also has, where one exists, an explicit **paraphrase** of the same request that the Rules read ("Draft blue"
   -> "make Draft blue", "back 2" -> "undo twice"). The Rules (synth/check_rules.mjs, logic.js of commit bb575b8) read the paraphrase, and
   the reading must equal the gold exactly (bench-canon form). Result: **329 of 330 paraphrases read as the gold**; the one difference is
   the Rules' own limit ("make Start and Done circles": the Rules read "circles" as a description). 15 requests have no paraphrase the
   Rules read (outline none, a description with "it", "Content big, white, with a black border" ...): their gold was checked by hand
   against the conventions. The check found two problems in batch 1, both fixed before the build: the canvas of or2-0001 (above), and
   four paraphrases that wrote "start left" as a direction ("move Start to the left") where the gold, as short3, is a position; they were
   rewritten as "put Start on the left". No gold was changed by the check.
4. Overlap: messages whose text equals (lower case, punctuation stripped) or has the same token set as a test text (the six template sets,
   llm_short, fresh2, short3 and its saved texts) are removed: 3 (one equal to an llm_short line, two to short3 lines). No duplicate texts.
5. Excluded (no wire is certain; listed in CHECK.json): "Vision instead of Idea" (Vision is already on the canvas), "how many shapes have a
   border?" (no outline filter in the count question), "Rb behind Qb" (below or behind in drawing order), "start gets a dashed border"
   (a border style is no legend value), "every arrow dashed except Api to Db" (an exception), "Hr, Sales and Legal under Ceo in a row" and
   "make it an org chart: Ceo on top, then Cfo, Cto" (no settled convention).

## Round trips (2026-11-03, with job 073's switches and data)

- VSS (`convert_check.py`, the world rows as 073 builds them): **56.8%** of the 345 requests round-trip; 25.2% have no event token in their
  row. That is the finding this folder is for: a verbless request's event is carried by a value word or an arrow ("Done → gold"), and the
  front end learns a trigger rule only from 2 requests with the same phrase and context; these rows teach it.
- SOP-BERT (`roles_roundtrip.py --gate 95 1`): **94.2%** right, 99.7% right or reference only, 0.0% silent wrong labels (gate passed).

Files: `texts/texts_01..04.jsonl` (saved first), `annot/annot_01..04.txt`, `msg_01..04.jsonl` (the training messages), `CHECK.json` (per
batch: counts, exclusions, overlaps, the paraphrase verdicts).
