# Review26: presence/BIO consistency training candidate

Source-only candidate in the isolated review26-training worktree, based on the
exact Review23 trainer SHA f9e5794fd939ce5a202be2c4cdfdacc7e8e48e68ded4d50d97453108bcc6a69c.
No actual weights, corpus, encoder, checkpoint, GPU training or export is read or
run. Existing completed Review23 sources and artifacts remain immutable.

## Alternatives and mechanism sources

1. Squared agreement between the existing presence sigmoid and a max source-B
   pool. Consistency regularization is exemplified by [Laine and Aila, Temporal
   Ensembling](https://arxiv.org/abs/1610.02242). This would be a new two-head
   application, not that paper's ensemble/augmentation method. Simple and bounded;
   squared probability differences can have weak saturated-logit gradients.
2. Symmetric Bernoulli Jensen–Shannon divergence, following the divergence in
   [Lin, Divergence measures based on the Shannon entropy](https://ieeexplore.ieee.org/abstract/document/61115/authors).
   Chosen: bounded by ln(2), with stable log-domain two-class calculations. Both
   heads receive gradients. This does not eliminate saturation; existing teacher
   losses remain necessary. The presence-to-max-B relationship is our explicit
   training regularizer, not a result established by that paper.
3. A logical presence iff some span penalty, inspired by [Xu et al., A Semantic
   Loss Function for Deep Learning with Symbolic Knowledge](https://proceedings.mlr.press/v80/xu18h.html).
   An exact assignment-based objective or a noisy-OR relaxation adds independence,
   length and normalization choices. We do not implement semantic loss or claim a
   valid span probability. Low per-token B mass can accumulate with length under
   noisy-OR; the chosen maximum avoids that inflation.

This is a general method over declared BIO keys and explicit supervision. There
are no key/domain/phrase exceptions, host operations, values or new span labels.
A new area/language uses the same masks and objective. No previous successes or
risk thresholds are presumed; model-quality evidence requires a future authorized
full run and downstream evaluation.

## Exact objective

Let p=sigmoid(existing presence logit). For each eligible row/key, q is the
maximum existing BIO softmax B score over valid source tokens. Max ties use the
first source token deterministically. Compute JSD(Bernoulli(p),Bernoulli(q)),
using natural logarithms and log-sigmoid/log-softmax/log-add-exp. The complement
of q comes from the chosen token's O/I log-sum-exp, not `log(1-q)` subtraction.
No I-only chain is treated as proof of a span or silently repaired.

For each key, average eligible rows separately for gold presence0 and1, average
supported strata, then average supported keys. This balancing is per batch,
not a claim of equal epoch-wide support. Zero eligible support yields a
mathematically differentiable zero. Final loss is exactly baseline_loss +
0.1*consistency. Existing per-key BIO class weights, presence strata and class/
per-mention queries are unchanged; the auxiliary is outside their existing mean.
The fixed0.1 coefficient is a declared hyperparameter, never a calibration result.
Theoretical contribution lies in [0,0.1*ln(2)] up to floating-point rounding.

Eligibility requires all of:

- a declared BIO key whose existing role is domain/global and bio is enabled;
- known existing gold presence0/1;
- nontruncated source/context pair, with at least one actual source token;
- every source token has actual supervised O/B/I, legal I transitions, and gold
  B existence agrees with that gold presence label.

Source tokens come from actual sequence0 IDs, positive scalar offset intervals
and attention1. Specials, context and padding never contribute. Unknown/partial
BIO rows, inconsistent labels and truncated examples contribute zero to this
auxiliary only; their original masks, records and other supervision remain.
Class-only global target.type and per-mention metadata get no synthetic BIO or
extra CLS class query. Active nonfinite logits refuse; ignored nonfinite tokens
are masked before softmax. Work is vectorized over rows per key, O(B*K*L), rather
than adding a Python/CUDA synchronization loop per row.

The two internal normalized distributions are training scores. This is neither
whole-request probability nor browser/q8 calibration, a confidence protocol or
execution/admission authority.

## Provenance and compatibility

Model/config/raw codec remain /2 and tensorArchitectureVersion2:135 keys,122 BIO,
63 class banks. No parameter/forward/output changes. New trainingSourceFormat and
final run format are explicit /5-presence-bio-consistency-candidate. Config,
first-completed-epoch proof and final run record trainingObjective with its own
/1 format, fixed coefficient, mask/pool/normalization and frozen baseline SHA.
Actual trainer/config hashes bind the changed source. Preparation remains the
same /3 gzip JSONL profile; no data is regenerated or subsetted here.

Plateau selection, compacted-state evaluation and checkpoint writer safeguards
remain unchanged. Existing /4 run/artifact validators are NOT adapted to /5:
future integration must explicitly support and verify the new objective profile.
No current export/calibration evidence is inherited.

A future same135-key warmstart from the completed selected checkpoint would need
an independently reviewed exact same-architecture migration/provenance contract
and fresh optimizer. The existing helper is specifically134→135 and must not be
claimed to implement135→135. This candidate does not add that contract or load
such weights. Source guards and existing old-format migration refusals remain.

## Resource boundary before any launch

No model parameters or data files are added. Encoded source-mask payload adds
192*N bool bytes for N examples (plus allocator/Python overhead); exact full-run
RAM and wall-time effects are not measured here. Per-key forward scratch is
O(B*L), with O(B*K*L) mask/gradient work; no extra encoder/CLS query is run.
The immutable first-epoch pin + current selected checkpoint + one writer temp
policy and its one-compact-upper-size +128MiB free-space preflight remain.
Existing files are already reflected in measured free space. Root must approve
actual capacity and the future warmstart/profile contract before data encoding,
GPU work or any checkpoint/export allocation. This is not launch readiness.

## Source-only checks

With CUDA_VISIBLE_DEVICES='', PYTHONDONTWRITEBYTECODE=1 and TMPDIR under workspace:

```
<existing venv>/python -m unittest discover -s training/sop-bert/candidates/target-type -p test_presence_bio_consistency.py -v
<existing venv>/python -m unittest discover -s training/sop-bert/candidates/target-type -p 'test_target_type_*.py' -v
```

13 new synthetic tests and53 existing pure/tiny CPU fixtures pass. New tests
cover symmetric gradients, disagreement reduction, agreement/determinism,
unknown/partial/truncated/illegal masks, source/context/padding gradients, ignored
nonfinite tokens, finite±1000 logits, key/stratum normalization, max-pool length
behavior, exact encoding masks and unchanged base-loss integration. AST source
hashes guard the original model/plateau/compaction/writers/class-query code.
Existing checkpoint writer fixtures use ordinary tiny byte strings only, not
model weights. No bytecode directory, model download or saved model is produced.
The sparse checkout is2.5MiB, not a full repository/model copy. Full app/bundle
integration checks remain the integration owner's task; no runtime file changed.
