# ops_formulations: the 744 formulations of the high-level layout operations, kept where the Rules read them exactly

Source: `training/sketch/ops/formulations.jsonl` (written for HIGH_LEVEL_OPS.md; template-made formulations of every operation, its
words and parameters: **synthetic**). Checked by `LOGIC_REV=worktree python3 training/sketch/synth/check_file.py
training/sketch/ops/formulations.jsonl training/sketch/llm_train/ops_formulations --mode rules` (logic.js working tree sha256
27a2145c4956ef03, with the ops patch): read exactly by the Rules 719 / 744; kept 700 (19 removed as test-set overlap: short3 10,
llm_short 6, hand 1, new_identities 1, blind 1; 25 not read exactly: `synth/ops_formulations_check.json` lists each verdict).
The input file writes the wires under "gold"; check_file.py now reads that key as "wires" (the training format).
