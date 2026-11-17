# Offline request-cutter decoder comparison

compare-request-cutter.py evaluates strict greedy BIO and the published
bio-viterbi/1 helper on the same saved emissions from the frozen cutter.
The collector accepts source-only id/text records, not annotations or gold cuts.
It verifies checkpoint/config/trainer/final-verification/encoder/tokenizer
hashes, exact source offsets, model role and original calibration data hash.
Inference is bounded by batch size and maxLength; padding is fixed max_length
to match the training evaluation. All inputs/helper/tool files are checked
again after completion.

Only source-sequence tokens reach either decoder. Special/pad/context tokens
are excluded, and truncation makes both outputs unresolved. Strict greedy
preserves exact argmax ties as unknown and rejects illegal I-after-O. Viterbi
maximizes the sum of the same token emissions under legal start/transition
constraints, using the actual independently tested JavaScript helper.
Global best-path ties remain unresolved. This is structural BIO legality;
there are no sentence, word, area or request-content rules. Summed logits
are not probabilities and are not used as calibrated confidence.

Gold annotations are read for scoring only after emissions are persisted.
Reports retain both full token/span metrics, positive/empty utterance exact,
all-O negative baseline, and correct/incorrect transition counts for positive
and empty messages separately. Strict and Viterbi precision is identical
within one report. Any comparison with the original CUDA BF16 training report
must state precision/batch/padding differences explicitly. A changed decoder
has a separate version and never replaces the frozen strict baseline silently.

The tools do not change the trainer, original checkpoint, original evidence,
runtime reader, confidence gates or activation. The emitted report remains
executionEligible:false and confidenceCalibrated:false. Saved emissions and
per-row labels stay outside Git; small metrics/provenance may be published.

Targeted fixtures cover source-only input rejection, special/context/pad
exclusion, scalar offset order, retained empty-message regressions, actual
global-optimum decoding, ties and empty token sequences. The Node wrapper pins
the helper SHA before/after use and bounds rows/tokens/work.

## Frozen CUDA BF16 comparison

The single 3,308-message pass uses batch16 / max_length192 / CUDA BF16, exactly
matching the original strict evaluation. Independent per-row verification
reproduces every original strict packet's spans and unresolved reasons, as
well as all aggregate metrics. The published evidence pins helper SHA256
47cfa0acefe8d629dd7252c04a72cad0faf864b785e8d25671eb9a4f7e926e01.

Strict: TP3097 FP722 FN663, span F1 81.7258%, nonempty exact2534/3227,
empty exact74/81, total exact2608/3308; 92 unresolved.
Viterbi: TP3169 FP795 FN591, span F1 82.0559%, nonempty exact2564/3227,
empty exact74/81, total exact2638/3308; 2 unresolved global-path ties.
All-O baseline: positive exact0/3227, empty81/81, span F1 zero.

Viterbi adds 72 true spans and 73 false-positive spans. Ninety previously
unresolved messages become resolved: only30 have exact boundaries and60 still
have incorrect boundaries. The other2 stay unresolved. Every previously exact
message stays exact, but reduced refusal is not automatically safe success.
No F1-only activation decision is made; downstream calibrated whole-request
risk must assess the newly exposed incorrect proposals. Exact commands, full
metrics, provenance, original baseline and status transitions are preserved in
cutter-decoder-comparison-v1-evidence.json. Large emissions/labels remain outside
Git. No summed-logit probability or inherited calibration is claimed.
