# Offline legal BIO decoder comparison

The frozen cutter currently uses independent token maxima and refuses an entire
message for an illegal BIO transition. `decodeBioViterbi` is a separate offline
comparison mechanism: it chooses the highest-scoring legal sequence from the
same token emissions. It neither changes the frozen training codec nor installs
an application reader. Its identity is `bio-viterbi/1`.

Each source-token row contains exactly three finite logits, in O, B, I order.
The first token cannot be I, and O cannot transition to I. Every other transition
is legal, including B after B: adjacent requests need no invented separator.
The objective is the sum of emission logits, with no learned transition weights,
word rules or sentence-specific penalties. Row-wise log-softmax would subtract
the same constant from every candidate path, preserving this objective's order.

The dynamic program retains the best score ending in each state and the number
of equally best paths, capped at two. Any tie for the globally best complete
sequence refuses with no labels. This includes distinct paths that merge into
the same final state. A local emission tie need not imply a global path tie.
Unique results contain token labels and `summedLogit`; the score is an objective,
not a probability, confidence or semantic correctness assessment. Every result
explicitly says `calibrated: false`. Empty input has one empty legal path.

The caller must first select the authenticated tokenizer's actual source tokens
and preserve their exact scalar offsets, special-token exclusions and truncation
diagnostics. This helper sees only numeric emissions and cannot validate that
selection or turn labels into text by itself. It cannot recover a truncated
request. The comparison tool must continue to refuse truncated or invalid
source coverage rather than interpreting a legal path as complete coverage.

Default limits are 4,096 source tokens and 100,000 work ticks. Input traversal,
state transitions and backtracking consume ticks. Invalid limits, malformed or
sparse rows, own accessors, nonfinite logits/sums, overflow and exhausted work
return no labels. Arrays with arbitrary proxies are outside the plain numeric
input contract; this is not a sandbox for arbitrary JavaScript objects. The
algorithm uses linear storage and time in token count with three fixed states.

Acceptance compares strict greedy and Viterbi on the *same* frozen emissions,
checkpoint, source rows, precision and tokenizer. It reports span precision,
recall and F1, positive/empty utterance exact rates, unresolved counts and the
changed cases separately. A new FP32 pass must not use the old BF16 result as its
same-emissions baseline. Any calibration or activation decision requires its own
evidence and codec identity; this implementation authorizes neither.

Tests compare the dynamic program against independent exhaustive enumeration of
all legal short paths, including merged ties, and check malformed inputs,
accessors, numerical overflow and budget exhaustion. They do not claim that a
legal sequence describes the user's intended requests.
