# Source-only request cutter

This replaces request slot assignment with a learned DistilBERT token classifier.
The input is exactly the message text, encoded once with the tokenizer single
template. Context, request annotations, gold cuts, field queries and inventory
keys are never model inputs. Each source token predicts O, B or I; special and
padding tokens have loss label -100. Character ranges use original Python Unicode
scalar offsets, with exclusive ends.

## Supervision and immutable inputs

train-request-cutter.py consumes the frozen structural-gold-v3 raw annotation
carrier, not its canonical labels. It independently verifies every original
Haiku v1/v2 file hash, original text and request list, source identity, complete
raw-row coverage, exact exclusion hash and sourceRel:ID SHA256-mod-10 split.
Reserved IDs are rejected before labels or class inventories. Empty request
lists remain negative examples.

A gold request span must occur exactly once in its original source. Missing,
ambiguous, overlapping, out-of-order or unrepresentable token-boundary spans
produce diagnostics. The row remains in the corpus; all its token loss labels
are masked. Truncated rows are also retained and masked. No sentence is
flattened, trimmed, split heuristically or discarded. Known character spans
remain eligible for span metrics even when their token labels are unsafe;
ambiguous literal spans have an explicit unscorable-gold count.

The first complete audit found 28,959 TRAIN rows (611 empty), 3,308 CAL rows
(81 empty), 33,149/3,760 requests. Three TRAIN rows contain nine ambiguous span
occurrences; no CAL ambiguity, unique-span overlap or out-of-order spans.

## Model, training and metrics

The new BIO head is randomly initialized. The encoder can start from the local
clean pretrained model or only encoder weights from the frozen clean auxiliary
checkpoint. Score/span auxiliary heads are discarded; unexpected checkpoint
roles are rejected. No request-slot state or assignment is reused.
All source/model/config/trainer/exclusion hashes and package versions are
recorded. An atomic checkpoint reserve is checked before training and saving.
The single best checkpoint is saved without optimizer state.

Production runs require at least three epochs; default five, calibration
exact-span F1 early stopping with patience two after epoch three. Inverse BIO
class weights come from TRAIN labels only. Fully masked batches produce no
optimizer update. CUDA uses BF16 autocast, recorded separately from any future
browser FP32/quantized model. A smoke run is explicitly marked, may use fewer
epochs/rows, and saves no model artifact.

Reports include token confusion (an extra unknown-prediction column), each BIO
class precision/recall/F1/support, B/I macro F1, positive-token F1/support,
exact character-span precision/recall/F1, utterance exact lower bound over all
rows, separate empty/nonempty exact rates, masked/ambiguous/truncated/unresolved
counts. O-heavy token accuracy is insufficient. Exact argmax ties are unresolved.
Calibration selects epochs; these metrics are not a confidence threshold or
complete-command correctness. Gold-cut downstream field metrics must remain
separate from the actual predicted-cutter pipeline.

## Runtime codec

The frozen codec is sop.request-cutter-codec/1. Decoding consumes source tokens
only. B begins a request, I continues an active request, O closes it. I after O
makes the entire prediction unresolved; it is never silently changed to B.
Unknown labels, invalid/nonmonotonic offsets and source truncation likewise
return no trusted cuts. No domain or English sentence rules are used.

The intended injected provider is cut(text), returning source{text,
unit:'unicode-scalar'}, spans (sorted nonoverlapping scalar ranges),
coverage{complete,truncated}, unresolved, and model{sha256,tokenizerSha256,
codecSha256,decoderVersion}. The downstream pipeline must pin all provenance.
Actual browser inference requires a verified single-template offset authority;
paired input with empty context is not equivalent. No browser activation,
graph-confidence claim or export is supplied by this training task.

## Generic-method review

Piece: learned source request boundaries, for every area and request count
representable by the fixed source token budget.
Methods considered: token BIO tagging (Ramshaw and Marcus sequence labeling),
constrained BIO Viterbi, and slot-attention assignment (Locatello et al.).
The owner selected BIO with explicit illegal-transition refusal; Viterbi could
be a separately versioned decoder, and slot attention is superseded.
The implementation uses no area IDs, sentence rules, native host properties or
per-example repair. The only structural rule is BIO validity. A new world or
language changes training coverage, not this codec. Its bounds are maxLength,
epochs, batch size and finite annotated source rows. Its losses are reported
as unsupported/missed spans rather than fabricated success.
Acceptance requires frozen source-backed training proof and actual predicted
cuts in downstream evaluation; fixture tests alone do not activate a reader.

## Targeted checks

python3 training/sop-bert/test_train_request_cutter.py
The pure suite covers scalar offsets, empty sources, ambiguous/missing spans,
overlap/order, boundary mismatch, special/pad exclusion, truncation, invalid
transitions, unknown logits, TRAIN-only weights and empty/positive metrics.
A complete audit independently verifies all frozen raw files and split IDs.
