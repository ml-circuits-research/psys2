# Raw structural checkpoint export and inference

export-structural.py loads the exact frozen trainer's build_model, configuration
and checkpoint after mandatory SHA256 checks. It exports every v1 head:
presence, request count, condition counts, 29 typed categorical banks, and nine
span heads with state/start/end outputs: 59 named outputs in total. Metadata maps
every name/rank and preserves typed banks, ABSENT/UNKNOWN indices, capacities
and overflow. A value's spelling never turns it into a sentinel.

A fixture export has artifactRole=fixture; a completed immutable trained
checkpoint exports as trained-unverified. Both have executionEligible=false and
no whole-graph confidence. Trained export requires matching frozen
checkpoint/config/trainer/run metadata and a completed checkpoint epoch.
Tokenizer/encoder configuration and all source hashes are rechecked. Existing
outputs are never replaced.

Legacy ONNX export freezes PyTorch MultiheadAttention sequence reshapes.
Export-only lowering preserves loaded Q/K/V and output projection weights,
using dynamic tensor dimensions, scaled softmax and key-padding masks. Only the
checked default layout is supported: evaluation mode, zero attention dropout,
batch-first, equal Q/K/V dimensions, no bias K/V or zero-attention extension.
The trainer and checkpoint are unchanged. Before publishing, all 59 heads must
match the original CPU FP32 forward numerically and in argmax across multiple
batch/sequence lengths and padding. This establishes neither CUDA bfloat16
calibration nor semantic graph accuracy.

Export is FP32 only: one ONNX file, no external weights, optimizer or q8 copy.
Preflight reserves twice checkpoint size for output/writer growth plus 512 MiB
free. Actual growth and free storage are checked before and after publication;
only the exporter's own new partial output is removed on post-publication
reserve failure. Trained source checkpoints remain untouched.

createStructuralInference({tokenizer, model, manifest, offsetAuthority}) exposes
propose(text, {area, context}), returning psys2.raw-structural-predictions/1.
infer additionally exposes selected head logits/indices and truncation metadata.
These are auxiliary decisions, not graph-correctness probabilities. The input
pair contains only source text and actual supplied area/context JSON, sorted and
compact. Gold field identities, counts and annotation queries are never inputs.

Learned counts choose slots. Overflow is unresolved without clipping; presence
and count disagreement or exact argmax ties are unresolved. Typed ABSENT omits a
field, UNKNOWN records unresolved, and value records retain their JSON type.
Pointers must identify non-special sequence-zero source tokens with ordered
endpoints. Child anchors must lie inside their predicted request span.
Raw values and wider value spans are retained; source-backed value normalization
remains the raw bridge's separate authority.

Offsets require an injected exact tokenizer authority: Unicode scalar offsets,
sequence IDs, special-token flags, actual token IDs/attention mask and
profile/tokenizer provenance. The adapter checks ID/mask parity, monotonic source
ranges, source membership and request containment. Transformers.js 3.8 provides
no exact offsets by default, so absent authority remains explicitly unresolved.
No WordPiece guess or Python browser dependency is introduced. A future portable
normalizer map requires independent tokenizer/Unicode verification.

Source/context truncation makes coverage incomplete. Without an authority that
distinguishes segments, source and context truncation are reported as unknown
rather than assigned arbitrarily. Fixture artifacts always remain incomplete.
Canonical binding, graph validation, resolution, assessment and deployment
calibration are separate.

Tests consume the shared Python/JS raw-normalization fixture. CPU exporter
integration uses SOP_STRUCTURAL_TRAINER for the exact trainer and creates only a
seeded tiny untrained attention fixture. Role/config/seed, hashes and parity
metadata survive separately from temporary fixture weights.
