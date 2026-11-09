# fresh2: a fresh test set written by Opus (2026-11-02)

600 messages (fo-0001 .. fo-0600), 1909 gold requests after the label check, in four folders written by four Opus agents in parallel,
each on its own domains and kinds of people:

| Folder | Ids | Domains, people |
|---|---|---|
| `opus_a/` | fo-0001..0150 | networks, cloud, software, state machines, pipelines, UI wireframes; terse engineers, dictation, non-native speakers, self-corrections |
| `opus_b/` | fo-0151..0300 | school diagrams, family trees, mind maps, org charts; students, teachers, polite requests, checking questions |
| `opus_c/` | fo-0301..0450 | business processes, kanban, floor plans, supply chains, customer journeys; managers, consultants, descriptions instead of names |
| `opus_d/` | fo-0451..0600 | game maps, story boards, events, home and hobby projects, research diagrams; new users, question-heavy |

Why Opus: every reader's training data was written by Sonnet and Haiku; a different writer with the same legend and conventions tests
whether a reader learned the language or the habits of its writers (owner, 2026-11-02).

How it was made (the fresh1 recipe, `../fresh1/README.md`)
- Each writer read only `../SPEC.md`, `../../llm_train/TRAIN_MSG_SPEC.md`, `../../LABEL_CONVENTIONS.md` and `../fresh1/README.md`: no
  training data, no reader, no model, no result. Lengths decided before writing each message, never padded: about 30% one request,
  45% 2–6 sentences, 25% 7–20.
- Texts first (`<folder>/texts/texts_01.jsonl`), then the annotation (`<folder>/batch_01.jsonl`); the coordinator checked that id, domain,
  names and text are identical between the two in all 600 messages, before and after the label check.
- Label check: two Sonnet agents (a+b, c+d), blind to every reader, against LABEL_CONVENTIONS.md and the majority of the corrected training
  data (`<folder>/LABEL_FIXES.md`): opus_a 3 changed; opus_b 4 changed, 4 removed; opus_c 3 changed; opus_d 3 changed, 1 added. Cases without
  a clear majority are listed there and left as written. Wires before the check: 1912.

Use: the test set of `../../FRESH2_PLAN.md` (calibration part: int(sha256(id),16) % 3 == 0, 195 messages, 596 requests; the rest is the
test part). No reader is trained on it. Rule (AGENTS.md): nobody who works on the readers opens these messages before they are scored;
after the first score the set counts as read.

Exposure log
- 2026-11-02 19:05, the root-cause agent of FRESH2_CAUSES.md (calibration part only): before its filter existed it printed opus_a/LABEL_FIXES.md
  and the first lines of opus_a/batch_01.jsonl, and a grep over the other LABEL_FIXES.md files printed lines naming some test-part ids. It
  says none of it was analysed; nothing was trained or tuned on it. Recorded so that any later reader of these numbers knows.
