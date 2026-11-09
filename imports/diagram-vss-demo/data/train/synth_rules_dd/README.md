# synth_rules_dd: llm_train/synth_rules with the repeated request formulations thinned (round 2, 2026-11-03)

**Derived data, not new data**: every message here is a message of `llm_train/synth_rules` (same id, same text, same gold); see that folder's README
for what it is and how it was made. Built by `python3 training/sketch/data_repetition.py --keep 2 --apply _dd llm_train/synth_rules` (TRAIN_PLAN_R2.md
section 7; owner 2026-11-03: many current problems come from poor, repetitive data).

The rule (explicit, no tuning): a request's **frame** is its span lower-cased with the mechanical tokens abstracted (names -> N, quoted texts
-> Q, digits -> #); value words (colours, shapes, sizes, positions ...) stay, because they are what the readers learn. The messages are visited
in the order of sha256(id); a message is **dropped when every one of its request spans has a frame that 2 kept messages already carry**, and
kept otherwise. So every formulation is kept at least twice (with two different fills), a message that brings one formulation not yet
seen twice is kept whole, and what is dropped differs from kept messages only in names, numbers or quoted texts.

| | messages | requests | distinct span frames / requests | most frequent span start |
|---|---|---|---|---|
| synth_rules | 8404 | 11707 | 0.717 | `what is the` (139) |
| synth_rules_dd | 7350 | 10468 | 0.802 | `what is the` (127) |

1054 messages dropped (their ids are in DEDUP.json). Checks: the messages are byte-identical copies of the source's (the Rules
verdicts, the overlap removal and the README of `synth_rules` hold); VSS `convert_check.py` and SOP-BERT `roles_roundtrip.py` were run on this folder
with job 073 / 074's switches (TRAIN_PLAN_R2.md section 4).
