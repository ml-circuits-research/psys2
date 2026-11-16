# Clean inventory bootstrap, 2026-11-16

Completed one full clean auxiliary epoch: 872,071 training candidate pairs, 99,566 calibration pairs, 27,253 optimizer steps. Fixed-threshold candidate accuracy 95.2604%; aligned source-span exact 94.0396% over 5,805 spans. These are oracle-field-instance-conditioned score/span metrics, not request-graph accuracy, calibrated request confidence or an executable reader. 72 inventory concepts and 134 key entries are reported in summary.json; drawing.drawn.kind has zero calibration support and remains explicit.

The final checkpoint SHA-256 is 68ca1038ccca8932282aede8f430cf261655a8543ba21230ee531794676b4d08. Reusable verify-bootstrap.py checked its completed epoch/step, all 308 source file hashes, script/data hashes and zero excluded-ID overlap across both prepared splits. All 1,648 functional development IDs are excluded before labels/candidate-bank construction. Exact exclusion manifest SHA-256: 66b1ab7f205bedf08c15e3e83f98e3de217922d179e89ae8b99c29a938e29e77, published at 63adee65:training/eval/functional-matrix/exclude-from-training.json.

summary.json retains every key/concept/head-metadata/area support/confusion/precision/recall/span result and exact frozen provenance. Calibration ran CUDA BF16 at fixed logit 0; it is not browser/q8 calibration or final unseen evaluation. Generated pairs, logs and checkpoints remain local ignored artifacts; small provenance/reports are tracked.

Historical attempts remain recorded separately: 256-row smoke only; first disk-full attempt interrupted at 16,000 examples; later full-v2 stopped at 729,600 examples when the owner designated the development exclusion. Its 22,500-step checkpoint is contaminated/ineligible and was never resumed. Full-v3-clean restarted from the original pretrained encoder. Raw Haiku inputs and meaningful model/data artifacts are preserved; old derived splits were losslessly gzipped after decompressed SHA verification.

Reproduce final verification from repository root using the recorded environment:

    .venv/bin/python training/sop-bert/verify-bootstrap.py --run training/sop-bert/runs/owner-20261116/full-v3-clean --exclude-ids training/eval/functional-matrix/exclude-from-training.json

Use the run manifest arguments to prepare/train or rerun frozen calibration. A separate utterance/graph decoder, exact graph roundtrip and real functional evaluation remain necessary for SOP-BERT to act as the sole reader. No grammar graph is relabeled as model output.
