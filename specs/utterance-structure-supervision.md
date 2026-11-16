# Utterance request presence and count supervision

`training/sop-bert/prepare-utterance-structure.py` reads both Haiku annotation
versions at message level. For each valid source row, `has_request` is exactly
`len(requests) > 0` and `request_count` is exactly `len(requests)`. Empty arrays
produce explicit no-request examples. No scalar field, wording, area, act or
known grammar changes those labels. The request array's members must be objects;
the preparer does not interpret their fields or claim those fields form a graph.

The source-relative path uses `training/sop-bert` as its root. The existing
inventory bootstrap's split is preserved byte for byte: SHA256 of
`source_relative_path + ':' + source_id`, first eight hex digits modulo ten;
zero is calibration and the other values are train. No new random split is made.
Each output row records source path, source ID, line number, source file hash,
annotation line hash, split, text and context. Context is retained as source
input; it is not interpreted into extra requests or labels.

The exact published `training/eval/functional-matrix/exclude-from-training.json`
list must be passed with its independently agreed SHA256. Reserved IDs are
removed immediately after source ID parsing, before request validation, label
emission, support inventories or candidate construction. Calibration rows never
contribute to the observed train label support. Request counts remain open
nonnegative integers; the train support table is not a closed deployment enum.
No final unseen set is read.

The new output directory contains `train.jsonl`, `calibration.jsonl`,
`diagnostics.jsonl` and `manifest.json`. Output is deterministic and an existing
destination is refused. Invalid JSON, missing IDs/text, wrong source world,
invalid context, duplicate source identity, absent/null/non-list requests and
non-object request entries are counted separately and recorded as malformed,
never coerced into no-request labels. The CLI exits unsuccessfully if malformed
rows were found, keeping the diagnostics and `ready: false` manifest for review.
The preparer checks source and exclusion file hashes again before publishing.

The manifest records graph node/edge supervision as explicitly unsupported.
These two labels supply utterance-level presence/count targets only. They do
not identify request spans, predict targets or constraints, or reconstruct graph
ownership. No trainer, current checkpoint, decoder, router or evaluation gate is
changed by preparation. Fitting or deployment requires separately reviewed work.

Fixture verification uses only invented annotations:
`python3 training/sop-bert/test_prepare_utterance_structure.py`.
