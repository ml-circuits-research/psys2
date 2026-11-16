# Exact-label audit of the frozen historical reader

This audit asks whether the original labels could reconstruct their gold requests even if every predicted label were correct. It does not run trained weights, measure model accuracy or claim a new reader. It reuses the original `make_roles.py`, extracts and executes the original `Layout.class_targets` method through Python's AST (without importing torch), then sends those targets as gold logits through the original browser decoder and original tokenizer.

The label/head stage receives the annotated spans explicitly. This isolates label encoding, token alignment, decoding and the historical context rule from cutter errors. Independently, the original B/I/O cut labels are decoded by the original cutter and compared with the source spans. An overlapping or unmappable span is retained as unsupported. Unlike the later upstream audit's nearest-row fallback, this harness never assigns a plausible training row to a different cut unit.

Every source message and request in the original training, historical held-out and sample populations is accounted for. Canonical equality follows the frozen benchmark (including case normalization, reference/mention representation and its declared order-free relations); it is not byte equality of the user's text. The audit also requires the same request type and rejects extra output keys. Missing labels, changed values and unsupported requests remain failures; successful requests are not the denominator by themselves.

| Population | Messages | Requests | Exact canonical label/decode roundtrip | Changed | Unsupported | Messages whose cut differs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Original training | 5,269 | 15,683 | 14,475 | 1,205 | 3 | 3 |
| Historical held-out | 585 | 1,711 | 1,611 | 100 | 0 | 0 |
| Original sample | 1,000 | 4,858 | 4,439 | 417 | 2 | 2 |

The exact roundtrip gate **fails**. The five unsupported requests have overlapping or unlocatable spans under the original one-span-per-request representation; they remain in the counts. No row loses words to the 128-wordpiece request limit in this population. This does not establish that longer future requests are safe.

The original loss function encodes **530 explicit `arrow=none` values as absence** because the class list has both a leading no-value sentinel and a legitimate value spelled `none`; `vals.index` always finds the sentinel. This is a representational failure even with perfect model predictions. One explicit `desc:notColor=navy` in the sample also becomes absence because that description-head value is absent from the training-derived vocabulary (`sm-0315`, wire 3). It must not be silently repaired using the sample. The later source commit `903a84f` separately fixes the sentinel search starting at index 1; that change is not applied to the historical baseline here.

Field-loss counts are target 711, from 274, anchor 183, arrow 530, position 41, to 154, distance 1 and count 1. A request can lose several fields, so these counts must not be added as though they were separate failed requests. The retained per-request `want`, `got`, differences and status provide the evidence. Reference/description/context losses require structural review for the general reader; a single mutable “last shape” is not a general resolution contract.

## Reproduce

Use the isolated environment and pinned original model/tokenizer described in README. From the PSys2 root:

```sh
python3 training/sop-bert/audit-labels.py --work ../.session-control/sop-bert-label-audit
node training/sop-bert/audit-decode.mjs \
  ../.session-control/diagram-vss-demo/training/laptop/node_modules/@huggingface/transformers/dist/transformers.node.mjs \
  ../.session-control/diagram-vss-demo/docs/model/neural/sop-bert \
  ../.session-control/sop-bert-label-audit \
  ../.session-control/sop-bert-label-audit/roundtrip --require-exact
```

The final command writes all evidence, then **exits 2** because the frozen original labels fail the exact gate. Without `--require-exact`, it completes a diagnostic run with exit 0 while preserving `gate: fail` in the summary. This is not permission to train the general reader on lossy labels. Source, generated label layout and audit input hashes are checked; no remote model access, learned weights or Rules fallback is used. `results/label-roundtrip.jsonl` retains all 6,854 messages, not just examples of failures.

## Historical score discrepancy

An additional controlled run changes only the inference intra-op thread count from four to one (the optional fifth argument to `reproduce.mjs`). All 585 per-message records are byte-identical, including decoded readings. `results/historical-single-thread.json` records that run. Thus thread count did not explain the 83.9% versus 83.8% discrepancy. The historical risk-coverage collector and the copied outcome functions have the same pairing/scoring behavior; no original per-turn risk-coverage records were found in the source repository's `gpu-runs` tree. This does not prove a platform cause. Review 9 accepts the baseline with this discrepancy retained and closes its investigation; no additional attempt to match the headline is planned.

The new general reader needs distinct absence/explicit-value/unrepresentable states, lossless structures for references and constraints, and a roundtrip gate before training. Historical baseline data and a future final unseen holdout are different populations. Calibration must remain separate from the latter; no threshold fitting occurs in this audit.

Review 9 (origin 95573696) subsequently accepted the historical reproduction with the measured discrepancy retained and instructed the worker to stop investigating it. That closes the baseline reproduction task; it does not prove that numerical noise caused the difference. Review also confirmed separate training/calibration/final-unseen populations. The exact-label audit remains a separate prerequisite for retargeting.
