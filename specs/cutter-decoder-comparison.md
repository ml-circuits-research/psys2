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
