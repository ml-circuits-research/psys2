# Candidate source v4: primary plateau and completed-epoch proof

The previous3581441c source and all its artifacts remain frozen. This is a new
trainer source revision. Model/raw codec stay /2-target-type-candidate; gzip
supervision stays /3-target-type-migration-candidate. The new source/run formats
are /4-target-type-plateau-candidate. Knowledge owns the separately versioned raw
corpus containing every new reviewer row; this source performs no preparation,
subset selection, checkpoint reading or GPU work as part of its delivery.

## Stopping and best-weight selection are separate

CLI explicitly accepts --min-epochs (default3), --patience (default3) and
--max-epochs (default30). Minimum is at least3, patience is positive, and the
finite maximum is between minimum and1000. The old fixed --epochs flag is
removed. Full declared compressed train/calibration files are consumed; no
subset flag exists. Run dataRecordCounts records actual loaded sample counts.

trainingPolicy uses sop.key-reader-plateau-policy/1 with:
minEpochs,patience,maxEpochs,primary:positiveSupervisedBioGlobalExactRate,
improvement:strict-rational,ties:non-improvement.
The static trainingPolicyContract is included in regenerated configuration;
the actual CLI policy is recorded separately in config and run.

Primary improvements are compared by exact integer cross-products, not rounded
percentages or an acceptance threshold. The fixed positive supervised support
must remain unchanged between epochs. Strict improvement resets patience;
ties and regressions increment it. Stop at primary plateau only after minimum
epochs. An improving run ends at its finite cap. If plateau and cap coincide,
reason is primary-plateau and maxReached remains true. No continuation is
allowed after a finished stopping state.

Best checkpoint selection retains the declared full lexicographic criterion:
positive supervised BIO+global exact rate, then target-type present-class
accuracy, then mention F1. A secondary improvement can replace the saved best
checkpoint while still counting as non-improvement for primary plateau.
All evaluations use the exact compacted checkpoint state, not live FP32 weights.
These remain gold-cut supervised-subset metrics, never full graph confidence.

Completed run format is sop.key-reader-run/4-target-type-plateau-candidate,
trainingSourceFormat is sop.key-reader-source/4-target-type-plateau-candidate.
Existing /3 provenance fields remain, plus trainingPolicy,stopping,
bestCheckpointEpoch,dataRecordCounts. epochsCompleted is actual history length,
not the maximum requested. stopping is the final
sop.key-reader-plateau-state/1 containing epoch,support,bestPrimaryCorrect,
bestPrimarySupport,badEpochs,primaryImproved,stopReason,minimumSatisfied,
maxReached,policy. stopReason is primary-plateau or max-epochs. A completed run
still meets minimum epochs; an epoch proof below is a different artifact role.

## Proposed immutable completed-epoch proof (design, no writer enabled)

A completed first epoch can provide meaningful weights for actual source-only
inference and further calibration without claiming the whole run completed.
Proposed profile: sop.key-reader-completed-epoch/1. A future producer must emit
an immutable JSON record with:

- artifactRole:completed-epoch; epochComplete:true; runComplete:false;
- explicit runId,completedEpoch>=1,optimizerSteps,checkpointEpoch<=completedEpoch;
- exact checkpoint SHA256/byte length and config/trainer/preparer/helper hashes;
- exact data manifest SHA, encoded train/calibration hashes and sample counts;
- model/raw codec /2, preparation /3, training source/run-policy /4 identities;
- exact warmstart provenance, selectionCriterion and checkpointEvaluation;
- checkpointMetrics and its canonical-JSON SHA256, plus selection rank, from
  checkpointEpoch rather than silently attaching the latest epoch's metrics;
- observed stopping state/policy at completedEpoch, with no invented future epochs;
- an explicit approved storage/pin identity, not merely mutable checkpoint.pt;
- confidenceCalibrated:false,graphConfidence:null,executionEligible:false.

The best checkpoint can predate the most recently completed epoch. This is
represented explicitly; non-improving epochs do not magically create new
weights or justify relabeling an old checkpoint as the current epoch.
An epoch proof establishes completed computation/immutable inputs, not complete
training, calibrated confidence, full request accuracy or execution permission.
Epoch-conditioned graph/field inference and confidence calibration must still be
evaluated on the exact frozen checkpoint/runtime.

A future loader should take the exact proof SHA, verify every supplied artifact
hash before and after reading, validate completion/epoch ownership and compaction
profile, and reject missing/changed/unavailable binary content. It should accept
this exact artifact role after epoch1 independently of the completed-run minimum;
it must not rewrite a /4 completed-run record with complete:true prematurely.
The app still requires its ordinary source/graph/instance/effect gates.

## Storage policy requiring root approval before implementation

Preferred for inference while GPU training continues: content-addressed pinned
checkpoint objects. Write the already-required compact checkpoint once to a
temporary file, hash it and atomically rename it to objects/<sha>.pt; no second
binary copy. Publish the immutable proof only after the object is finalized.
Pin at most one analysis/export snapshot under an explicit pin/release identity.
The current best may be another object; aliases/metadata do not duplicate bytes.

Worst-case disk while an older object is pinned: pinned object S + current best S
+ new writer temporary S, approximately3S plus JSON/exports. When pin=current,
it is2S during a new write. Root must approve the exact cap/reserve and retention
before this policy is enabled. A meaningful pinned snapshot is never silently
deleted; release/retention is explicit. Export artifacts need a separate reserve.
No such objects, pins, extra copies or exports are created by this task.

Lower-storage alternative: pause at an explicit completed-epoch barrier and lease
the one current checkpoint for inference/calibration, verifying its hash before/
after. Training cannot replace it until the lease releases. The proof remains
immutable metadata, but after release the old binary may become unavailable;
later replay must say unavailable. This trades concurrent progress for disk.
A mutable path without pin/lease is not an immutable snapshot policy.

Root selects/approves a policy before any writer or epoch-loader implementation.
This design neither bypasses that decision nor silently retains extra binaries.

## Focused validation

Nine pure plateau fixtures cover strict improvement/reset, ties, regression,
minimum epoch gating, finite cap, secondary-only gains, immutable state and
changed-support/finished/refusal cases. Prior33candidate CPU fixtures remain
green, including compaction, semantic migration and deterministic gzip.
No model/corpus/checkpoint/GPU or binary operation is used by these checks.
