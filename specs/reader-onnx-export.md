# Actual three-graph reader export

`training/sop-bert/export-reader-onnx.py` implements real ONNX graph generation, dynamic int8 quantization and a three-file runtime bundle. It extends the source-only prototype without changing frozen trainers, data, checkpoints or their contracts. It does **not** load checkpoints: a separately approved caller must verify the immutable key epoch proof, cutter proof, all source/config/tokenizer/codec identities and resource budget, then construct matching CPU modules. No trained invocation is authorized by the synthetic tests.

## Actual installed APIs and the FP32 temporary-file trap

Tested versions: Torch2.14.1+cu130, ONNX1.23.2, ORT1.31.1. Torch's legacy `dynamo=False` export accepts a `BytesIO`; ONNX parses it in memory. The public ORT `quantize_dynamic(ModelProto,...)` still calls `save_and_reload_model_with_shape_infer`, writing a full FP32 temporary model. Even constructing internal `ONNXQuantizer` repeats that disk operation after Gemm lowering. Merely accepting ModelProto does not prove memory-only export.

The implementation therefore pins ORT1.31.1, performs ONNX shape inference in memory and tags its inference metadata, then uses the reviewed ONNXQuantizer with a scoped replacement of its file-roundtrip helper by the in-memory equivalent. A process lock serializes this internal hook, which is restored on success/refusal. It quantizes constant MatMul/Gather weights with QInt8 and dynamic QUInt8 activations, serializing q8 directly from ModelProto. Unsupported ORT versions refuse. This internal dependency must be reviewed/tested before upgrade.

Tests forbid both temporary-directory creation and ONNX file saving during actual quantization; a separate test forbids disk temporaries during Torch BytesIO export. Real int8 initializers are asserted, external tensor data refused. Only final q8 files are written. Large FP32 graphs do coexist in RAM with Torch modules and inference copies; real artifact peak RAM and q8 output/storage bounds still need a measured preflight. This is not an assertion of low memory consumption.

## Computation and dynamic interfaces

The bundle contains cutter.q8.onnx, encoder.q8.onnx and heads.q8.onnx. Cutter accepts int64 input_ids/attention_mask[B,L] and emits bio_logits[B,L,3]. Key encoder accepts the same and emits hidden[B,L,H], bio_logits[B,K,L,3] and presence_logits[B,Q]. Heads accepts hidden[L,H], int64 spans[N,2] and key_indices[N] and emits class_logits[N,sum(bank lengths)]. Dimensions are dynamic where declared. Input/output names are checked against the exported graph to detect discarded input dependencies.

Key config versions1 and2 are accepted; the unchanged prototype's validation is applied through a format-only view of the same layout, never by modifying serialized config identities. CLS, source coverage, exact domain indices, bounds, repeated/adjacent/different-key overlaps and explicit bank offsets follow `key-reader-onnx-prototype.md`. Empty query batches skip heads. The input modules must be CPU FP32; no silent backend/dtype change is applied. Trained module construction must use the frozen encoder architecture and validate any attention implementation lowering against the reference. Tiny real DistilBERT models with both eager and default SDPA attention pass batch/length/padding-mask tests; that does not prove an untested full-model lowering.

## Identity, storage and runtime

`export_bundle` accepts already verified modules, exact config bytes and frozen rawRoutes. It refuses invalid identity hashes, incompatible config/source identities, incomplete role routes, existing output directories and insufficient explicit max-output/reserve bounds. Its new output directory is exclusive; a failed export removes only its own incomplete output. No checkpoint, source or preexisting artifact is modified.

Runtime manifest format is sop.key-reader-runtime/1. It includes configJSON and exact configSha256, checkpoint/trainer/preparer/codec/tokenizer identities, encoderSha256/headsSha256, hiddenWidth, rawRoutes globals/metadata, and explicit bank offsets. Cutter config/checkpoint/trainer/codec/graph hashes are additional component fields. All three model file hashes, original config bytes and exporter/layout source hashes bind the bundle; Torch/ONNX/ORT versions are recorded. dtype=fp32 describes **outputs**, while weightRepresentation=q8-dynamic describes stored weights. Execution remains false, graphConfidence=null. Synthetic artifacts have explicit artifactRole=fixture; trained exports require explicit trained-unverified origin and immutableProofSha256.

The caller's verified module-to-checkpoint correlation is an explicit trusted boundary; fabricated identity strings are not proof. Runtime implementation/build identity must also join the actual empirical admission record. A model hash, config or exporter manifest never proves semantic correctness or implementation identity by itself.

## Measurement and remaining gates

Actual tiny CPU tests run Torch→ONNX→ORT FP32 and q8, with multiple batches, sequence lengths, padding masks and query counts. They compare logits, argmax, dynamic shapes and class-bank offsets. They include actual tiny DistilBERT eager and SDPA architectures and verify all ORT output tensors are float32. Synthetic max errors/argmax differences are reported, not inherited as trained accuracy.

Real immutable weights still require separate approved export and parity measurement: original saved/compacted Python state versus actual ORT, then browser backend, including encoder/pooling differences, BIO cuts, class argmax, absent/unknown/missing fields and complete RAW/canonical packet differences through the same codec. Independent q8 calibration and actual class×area/replay are required; no FP32/BF16/earlier auxiliary confidence is transferred. These gates remain pending. No trained checkpoint was read/exported and no GPU was used for this source increment.

Recorded synthetic attention probes: eager and SDPA both had FP32 max error2.3842e-7 and q8 max error0.0274714, with zero argmax changes for the chosen tiny inputs. This is a reproducible fixture observation, not a trained accuracy estimate or permission to omit actual model/backend parity.
