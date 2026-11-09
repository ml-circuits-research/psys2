# Training data written by Opus (2026-11-02)

Written for the owner's goal (VSS as good as fine-tuned SOP-BERT, measured on a writer it has not learned from) and FEEDBACK_PLAN.md.
Every writer read only `TRAIN_MSG_SPEC.md`, `../llm_bench/SPEC.md` and `../LABEL_CONVENTIONS.md` (plus `../feedback/BRIEF_T.md` for the
targeted data), never the fresh2 test set; texts saved before annotating (`<folder>/texts/texts_01.jsonl`), checked byte-identical by the
coordinator; label check by Sonnet agents against the conventions and the majority of the corrected training data (`<folder>/LABEL_FIXES.md`).

| Folders | Ids | What |
|---|---|---|
| `opus_train_{a,b,c,d}` | ot-0001..1200 | 1200 messages from the general brief, four slices of domains and people: the base added to every arm of FEEDBACK_PLAN.md |
| `opus_gen_{1,2}` | og-0001..0600 | 600 messages from the general brief: arm G (control) |
| `opus_tgt_{1,2}` | ox-0001..0600 | 600 messages from VSS's own list of needs (`../feedback/BRIEF_T.md`): arm T (targeted) |

opus_train label check: a 3 changed, 1 removed; b 9 changed, 3 removed; c 5 changed; d 16 changed, 1 added (3958 wires after).
opus_gen label check: 1: 10 changed, 9 removed; 2: 3 changed (2085 wires after). The same check, with the same instructions, is run on opus_tgt.
opus_tgt label check: 1 (the rewritten file; the first version set aside, FEEDBACK_PLAN amendment 19:45): 22 changed (extreme with keys the legend does not allow); 2: 6 changed.
