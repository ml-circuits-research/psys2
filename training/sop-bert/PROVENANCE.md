# SOP-BERT original-reader reproduction

Source repository: https://github.com/ml-circuits-research/diagram-vss-demo.

This first port is pinned to **ac33631635314bf00e14e222809e8aa4ab934f38**, the model/code revision named in the historical 83.8% held-out result. `upstream/` preserves 204 original licence, training, decoder, scorer-dependency, benchmark and annotated-data files byte for byte. `provenance.json` records each source path, SHA-256 and size, plus the five external model artifacts. The model is 68,493,883 bytes in total; its quantized ONNX graph hashes to `57c77850a7011ed247c63f2b39ccdad163206603d07803b457e13a08ab7a8b59`. Model weights and installed dependencies stay in workspace scratch, not in the shipped browser or core dependencies.

`upstream/package.json` is the only local packaging addition: an empty module-type scope preserves the original mixed CommonJS/ES-module detection under Node 22 rather than inheriting PSys2's module type. No original source file is edited. `historical-outcomes.mjs` copies the `actOf`, `pairUp` and `outcomes` functions unchanged from `training/sketch/precision_bert_collect.mjs` at report commit **c765652**; only imports/exports and attribution are added. This avoids loading unrelated VSS models while keeping the original value-based pairing, canonicalization and scoring. Decoder, canonicalizer, pairing dependency and model have no Git difference between ac33631 and c765652.

The report at c765652 (`training/sketch/MEMORIZATION.md`) states 585 held-out messages / 1,711 requested actions, 83.8% right, 13.9% wrong, 2.3% not done, and approximately five extra actions per 100 requests. It is an execute-all historical comparison, not a calibrated execution gate.

Current upstream HEAD during acquisition was **9900d34836bf3fc913a6549f3da4c444bfa11304**. Its shipped BERT-ALL model trained on the old held-out population. Substituting that model would invalidate this reproduction. Its later training fixes, expanded data, confidence decoder and roundtrip tools are intentionally not represented as already ported by this historical baseline. They remain a separate next increment before retargeting. Original diagram-specific label heads and code remain isolated under training; they are not generic PSys2 mechanisms.

## Local evidence

`results/historical-arm64.jsonl` records all 585 per-message outcomes and decoded readings. The summary records model/data/runtime hashes, counts and platform. On Node 22.23.2, Linux arm64, `@huggingface/transformers` 3.8.1 with its pinned `onnxruntime-node` 1.21.0, CPU q8 with four intra-op threads, the run yields:

| Measure | Result |
| --- | ---: |
| Right requested actions | 1,436 / 1,711 (83.9275%) |
| Wrong requested actions | 237 / 1,711 (13.8515%) |
| Not done | 38 / 1,711 (2.2209%) |
| Extra actions | 83 (4.8510 per 100 requests) |
| Precision of execution, including extras | 81.7768% |

**The historical 83.8% is not reproduced to its reported precision:** this run rounds to 83.9%. No decoder, label, threshold or scoring rule was tuned to erase the discrepancy. Platform/numerical differences are a possibility, not an established explanation; exact historical per-turn records and runtime metadata are needed to locate it. This is not a new acceptance score, and port step 1's exact reproduction remains open in Q109.

The original split is recreated with original `make_data.py`, seed zero: 5,269 training messages / 15,683 requests, 585 held-out / 1,711 requests, and 1,000 separate sample messages / 4,858 requests. Identities are disjoint. The original `make_roles.py` also runs locally without torch. Its original diagnostics (including ten broad-benchmark multi-request rows lacking spans) are retained; a successful label build does not claim a clean roundtrip or a general request schema.

Python 3.12.3 here has no torch, numpy, transformers or tokenizers installed. Inference uses the separate Node environment; no retraining was performed. The original requirements file documents its tested Python 3.13 environment and dependencies, including pre-existing torch outside that file. An explicit reproducible training environment remains necessary before training. New general-reader calibration must use a separate calibration split; the final unseen holdout must not select thresholds, labels or rules.
