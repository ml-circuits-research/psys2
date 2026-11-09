# fresh1: a fresh test set (written 2026-10-31)

1000 messages: `sonnet/` (fs-0001..0500, 3030 wires) and `haiku/` (fh-0001..0500, 2514 wires), in the training format with spans
and triggers (`training/sketch/llm_train/TRAIN_MSG_SPEC.md`, `training/sketch/LABEL_CONVENTIONS.md`), so that both the whole-message
score and the reading alone (SEG=gold) can be measured. Lengths: 1 to 20 sentences (Sonnet: 24% have 10-19; Haiku: 16% have 10-20).

How it was made
- Writers: one Sonnet agent and one Haiku agent, each reading only the two files above (no training data, no other test set, no reader).
- Texts first (`<half>/texts/`), then annotation (`<half>/batch_*.jsonl`); the coordinator checked that every text, id, domain and
  `names` is byte-identical between the two.
- Disclosed by the Sonnet writer: its first texts were short, and it extended them with sentences before and after the original
  message to reach the length mix the brief asked for (the brief's fault: it gave a share of long messages); it also edited about 8
  texts that named shapes missing from `names`. Report Sonnet-half numbers also by message length.
- Label check: one Sonnet agent per half, against LABEL_CONVENTIONS.md and the majority of the corrected training data, never seeing
  a reader or its output (`<half>/LABEL_FIXES.md`: Sonnet 37 changed, 10 added; Haiku 26 changed, 16 added, 8 removed). Cases
  without a clear majority are listed there and left as written.

Rule (AGENTS.md): nobody who works on the readers or the training data opens these messages before they are scored. Every score is
logged with the model and the date; after the first score this set counts as read.
