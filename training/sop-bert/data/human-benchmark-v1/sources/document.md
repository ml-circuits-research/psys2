# document tab: sources (207 items = 201 scored + 6 setup turns, 6 sessions)

| corpus | licence (verified) | url | pool | items |
|---|---|---|---|---|
| DocEdit-PDF (Mathur et al., AAAI 2023), test split user requests | Adobe Research DocEdit Dataset License 1.0, non-commercial (LICENSE in repo) | https://github.com/adobe-research/DocEdit-Dataset | 3,563 | 81 |
| PPTC (Guo et al., ACL Findings 2024), human-written turns | MIT (LICENSE in repo) | https://github.com/gydpku/PPTC | 1,808 turns / 279 sessions | 57 |
| OpenAssistant oasst1, English root prompts | Apache-2.0 (HF card) | https://huggingface.co/datasets/OpenAssistant/oasst1 | 22,850 roots | 48 |
| databricks-dolly-15k | CC BY-SA 3.0 (HF card) | https://huggingface.co/datasets/databricks/databricks-dolly-15k | 15,011 | 15 |

Owner instruction (relayed): licences are not a blocker, so all items are `redistributable: true`; the licence is still recorded per item. Raw data is kept only under SCRATCH/hb/raw. For DocEdit and PPTC, only the CSV/JSON files were extracted, not the images.
TERTiUS (aka.ms/tertius -> github.com/microsoft/toward-interactive-dictation) returns 404, and I found no mirror, so it is not used. CoEdIT, EditEval and IteraTeR were skipped because their instructions are templated ("Fix grammar:") or are intent labels, not free human commands. WikiDocEdits was skipped because it consists of edit summaries, not commands.

Sampling (python random, fixed seeds; scripts in SCRATCH/hb/scripts/doc_sample.py, doc_oa_edit.py, doc_build.py):
- DocEdit: uniform sample of 140 rows. Kept in sample order: 81 (58%). Within the sample, 32% are about page numbers, headers or footers; these are capped at 8 items and the rest skipped. Also skipped: 20% about charts or figures (no referent in a document) and table-cell edits (tables cannot be seeded). Bullet and task-box edits use a minimal invented setup turn (`setup: true`, 4 turns).
- PPTC: uniform sample of 85 turns, of which 47 were kept (55%). Skipped: inserting shapes, chart turns, background-only turns, and duplicates. Added two consecutive 5-turn sessions (session_0 and session_55, which carry real anaphora and table follow-ups), plus 2 real preceding turns as table setups, plus 2 neighbouring turns.
- OASST1: regex filter for writing/editing verbs. The compose pool (720 prompts, 400 characters or less) was sampled at 80, and 28 were kept, almost all of them relevant. The edit pool (136 prompts) was sampled at 45, and 20 were kept (about 45% relevant; the rest were code, role-play or advice questions).
- Dolly: no-context creative_writing, summarization, general_qa and brainstorming items with writing verbs. The pool of 152 was sampled at 40, and 15 were kept.
- Mix: about 40% format/structure edits (align, marks, merge, split, move, remove, list, table), about 25% create/insert text or sections, about 10% rewrite tone or length, and about 27% compose by genre. 41 items are multi-request, because PPTC and DocEdit turns often hold two commands.

Adaptation rules:
- Human wording is kept verbatim, including typos, the past-tense DocEdit "requests", "emmm" and "ohno".
- PPTC slide nouns were changed: slide -> section, page or document; content part -> paragraph or a named section; slide N -> section N.
- Pasted text in OASST was moved into seeded paragraphs, and "this"/"the following" now refers to them. The very long quotes were truncated.
- DocEdit referents (quoted headings and sentences) were seeded verbatim as heading or paragraph blocks. Footnotes, text boxes and footers were seeded as paragraph or quote blocks.
- Requests that are out of capability (page numbers, watermark, header date, pictures, background colour, notes, columns) are kept, and their expected outcomes are described.
