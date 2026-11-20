# calendar tab: human utterance sources (220 items)
Corpora (licence checked against each dataset's LICENSE file or official README):
- MASSIVE 1.1 en-US (Amazon), CC BY 4.0: https://github.com/alexa/massive (official tarball, LICENSE file).
  Pool: calendar_set 1150, calendar_query 794, calendar_remove 426. Used 88. SLURP and HWU64 were not
  sampled separately because MASSIVE en-US derives from SLURP and overlaps HWU64.
- CLINC150, CC BY 3.0: https://github.com/clinc/oos-eval. Pool: schedule_meeting, calendar_update,
  calendar, meeting_schedule (150 each). Used 35.
- SMCalFlow 1.0 validation, CC BY-SA 4.0 (licence from the official README):
  https://github.com/microsoft/task_oriented_dialogue_as_dataflow_synthesis (the official blob host
  did not resolve, so the HF mirror KaiLv/UDR_SMCalFlow was used). First turns only, classified by
  program root: create 1246, update 218, delete 203, find 1021, other 958. Used 97.
All items redistributable=true (every licence is permissive).
Sampling: per stratum, a seeded shuffle of the pool, then the first N in order (scripts/sample.py writes
scripts/cands.txt). Skipped only: duplicates and wake-word variants, near-paraphrases of an item already
taken, off-domain lines, template placeholders ("thing at time", "person a"), and past-event lookups that
cannot be seeded. Nothing was skipped for difficulty. Vague, garbled, abusive and out-of-scope turns are
kept with a no_change or plausible-action expectation. About 95% of sampled candidates were usable.
Mix by expected effect: create 86 (39%), query 54 (25%), change/move 37 (17%), remove 37 (17%),
no_change 6; 5 multi-request. Many MASSIVE calendar_set lines are reminder edits, which is why create
sits below 45%.
Adaptation (43 of 220; the rest are verbatim with their lowercase, typos and wake words):
- Dates of events that must already exist moved into the seed week 2026-11-23..29 (tomorrow/today ->
  monday etc., this week -> next week, "march 1st" -> "november 24th"). Dates in create requests are
  kept and resolve relative to Friday 2026-11-20.
- Names are kept verbatim; the people, rooms and meetings they refer to are seeded in context, with
  distractor events where the utterance discriminates.
- Effect values are free-form ("+Lisa,Emma,Martha", "3 days before", "wednesday|friday"). Attrs beyond
  the schema: location, reminder, recurrence, calendar, count.
Build: scripts/cal_spec.py (hand-written per-item spec) and scripts/cal_build.py.
