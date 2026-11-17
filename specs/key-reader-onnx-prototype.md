# Two-stage key-reader ONNX prototype

This is source-only preparation for the inventory-key reader, not a trained export or browser activation. `training/sop-bert/export-key-reader.py` has no checkpoint loader. Its CLI checks an explicit SHA256 against config bytes and writes only a small JSON contract. Its explicit `prototype_export` function is not called by the CLI or tests and remains pending storage/identity/parity preflight before any trained export.

## Piece and alternatives

The missing piece is browser transport of the existing inventory-key neural computation. It unlocks no accepted execution rows yet. Three generic interfaces were considered against the existing trainer and Torch module composition:

1. A monolithic encoder-plus-heads graph repeats encoder work when predicted BIO mentions become available only after encoder inference.
2. Encoder ONNX plus JavaScript linear layers avoids a second graph, but duplicates weight transport and floating point math and still needs independent parity proof.
3. Encoder ONNX plus a small dynamic-query heads ONNX preserves the existing learned modules, with explicit host admission and bank offsets. This is the approved prototype.

No interface requires area IDs, English words, observed literal vocabularies, gold spans or request annotations. Its layout derives only from the hashed model config and the matching module. A new inventory/language changes declarations and learned weights, not export code. Config bytes (4 MiB), keys (512), individual banks (8192), concatenated width (65536), query rows (default4096), and output floats (4194304) are bounded; empty queries skip the second graph. This introduces no fallback or success claim and changes no frozen trainer, data or model. A declaration alone cannot transport the learned matrix operations. Numerical differences from pooled reduction are a loss risk requiring measurement, not an assumption of equivalence.

## Hashed layout

Only the known `sop.key-reader/1` config is accepted. Unknown versions fail rather than treating a candidate model as v1. `keys` is the unique registry/embedding order; `bioKeys` fixes BIO output order. Each class head is `model.classes[str(keys.index(key))]`. Banks begin with typed absent and unknown entries; the remaining values must exactly equal registry declarations. Literal strings that resemble controls remain ordinary value entries. Class outputs concatenate banks in **config key order**, with explicit start/end offsets and original typed banks. No literal key or bank is embedded in export code.

A complete future artifact identity must bind both ONNX file hashes, exact saved checkpoint SHA, config SHA, tokenizer files, trainer and exporter hashes, codec/decoding source identities and precision/runtime settings. The source-only contract marks unavailable file/checkpoint identities null, complete=false, calibrated=false and executable=false. It is not an admitted runtime manifest. Tokenizer/config files supplied by the hashed encoder metadata are references only; actual packaging must rehash the real files.

## Two graphs

Encoder inputs are `input_ids:int64[B,L]`, `attention_mask:int64[B,L]`; outputs are hidden `[B,L,H]`, BIO logits `[B,K,L,3]` and presence logits `[B,Q]`. The wrapper calls the original module unchanged; key and BIO widths derive from config.

Heads operates on **one request**: hidden `[L,H]`, predicted token intervals `spans:int64[N,2]` and `key_indices:int64[N]`, output class logits `[N,sum(bank lengths)]`. Domain features are mean(hidden[start:end]) plus the exact domain key embedding. Global features are hidden[0], represented only by key index -1 and span[0,1]; they never borrow a guessed domain key embedding. Every row emits all bank logits; the decoder chooses applicable heads by config role and explicit bank offsets. It must not interpret irrelevant banks as additional fired keys.

The prototype pools with a dense span mask and matrix multiplication. This expresses the same real-number mean as the Python slice reference but can have different floating reduction order. Dynamic dimensions are declared explicitly. No zero-query backend behavior is assumed.

## Host validation and trusted boundaries

`validate_queries` admits only bounded nonempty integer intervals, exact in-range domain indices, and source-only token ranges. Globals require -1 and [0,1]; metadata/global/unknown indices cannot masquerade as domain indices. Empty batches return skip=true. Repeated, adjacent and different-key overlapping source intervals are valid pooling inputs. BIO decoding/ambiguity rules remain a separate model codec responsibility.

The caller must establish from the **actual frozen tokenizer output** that token0 is CLS, every source mask bit corresponds to a nonempty sequence0 scalar-offset token, and all selected spans map to the exact supplied source text. A Boolean mask alone is not independent evidence of token origin. It must verify tensor shapes, finite values, config/model identities, source/context truncation, allowed role/head routing and query bounds before ONNX invocation. Graph assertions are not a replacement for those checks. No source-token clipping, key repair, orphan-I repair, hidden gold cuts or undeclared normalization is authorized.

## Probes and acceptance

Synthetic CPU tests compare wrapper outputs to the **actual tiny reference module**, including global CLS, adjacent/repeated same-key spans, different-key overlaps, noncontiguous bank indices, typed controls and invalid intervals/roles/masks. They create no ONNX or model binary and load no pretrained/trained weights. They establish prototype algebra/layout, not trained/backend parity.

Before real export: freeze source/config/tokenizer/checkpoint identities; reserve space for source, intermediate and output graphs plus retained checkpoints; verify the saved BF16-roundtrip state rather than inheriting live FP32 calibration. Then measure original frozen Python versus exported graph on actual ORT and browser runtimes: tensor shape/logit errors, argmax changes, decoded spans/metadata, unknown/unresolved changes, complete RAW packet equality and canonical packet differences. Include repeated/overlapping keys, absent/present/unknown classes and truncation. Pool/head and encoder differences must be reported separately. Quantized variants need their own hashes and measured calibration; no confidence or graph accuracy transfers automatically. No acceptance gate is invented here.

Heads hidden input must be the exact encoder result for that request/batch index under the same combined artifact identity, not a cached result from another request. Source text, tokenizer offsets, masks, selected spans and produced packet evidence must remain correlated. Config identity alone cannot establish that correlation.
