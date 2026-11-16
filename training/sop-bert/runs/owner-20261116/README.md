# Owner-authorized inventory bootstrap, 2026-11-16

Status: full corrected corpus run in progress; no full metrics or deployed reader claimed. `run-manifest.json` records source data, mapping, script and encoder provenance plus the previous interrupted/smoke scope. All 134 inventory keys have field supervision; unmapped/non-scalar source fields remain in diagnostics. Key coverage is not graph coverage.

The checkpoint is a non-executable, oracle-field-instance-conditioned candidate-score/span model. A separate frozen-checkpoint evaluator will report per-key support, confusion, positive precision/recall and aligned span accuracy. Calibration is a deterministic source-row partition, not fresh final unseen evaluation. Model/data logs and checkpoints remain local ignored artifacts to avoid publishing hundreds of megabytes of generated files.

The initial full attempt stopped on a disk-full checkpoint write after 16000 candidate examples; its log/manifest remain. The corrupt incomplete checkpoint alone was removed. The corrected run uses compact atomic weights-only checkpoints with a reserve check. A prior 256-row smoke is compatibility evidence only. Original generated Haiku data is unchanged. Earlier derived JSONL splits were losslessly archived after decompressed SHA-256 verification.
