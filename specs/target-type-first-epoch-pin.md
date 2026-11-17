# First completed epoch: one permanent hard-link pin

Root approved this storage policy for the new plateau source. Model/raw codec
remain2, gzip data3, completed run4. Earlier frozen sources/artifacts are not
changed. No actual snapshot or training is produced by the source fixtures.

## Replace-only weight publication

publish_compact_checkpoint receives the exact compacted CPU dictionary selected
by evaluation through its writer callback. It creates a new exclusive mkstemp
file, flushes/fsyncs it, and verifies serialized byte size and SHA256 before
os.replace publishes checkpoint.pt. It never opens the existing current file or
pin for writing. A stale temporary is not reused or overwritten.

For the selected checkpoint after the first completed epoch only, a hard link
epoch-pins/<sha256>.pt is created from that verified temporary inode. Replacing
checkpoint.pt publishes that same inode as current. The permanent pin remains
the original content inode when future best checkpoints replace current.
No later epoch creates a pin. The first proof and pin are never overwritten or
removed by ordinary successful publication.

An ephemeral hard-link rollback alias can retain the existing current inode
during replacement/fsync. It is not another epoch pin or binary copy. On failure
the old current path is restored through replacement; the permanent first pin
is unchanged. If rollback itself fails, its recovery alias is retained rather
than deleting meaningful prior data. A newly created unpublished first link can
be cleaned up if its checkpoint publication fails; a published pin is permanent.

## Allocation accounting

Let U be one compact checkpoint upper-size and R=128MiB. The writer requires:

free bytes >= U + R.

Existing current and permanent pin already occupy filesystem space and are
already reflected in free bytes; their sizes are not added again. The hard link
allocates metadata, not another copy of tensor storage. U includes compact tensor
bytes plus a conservative config/zip/pickle/alignment overhead. Actual serialized
bytes must be <=U before publication, and the reserve is checked afterward.
Metadata proof publication separately checks its own bounded bytes plus reserve.

This accounting does not waive reserve or claim that existing objects are free.
Worst allocated binary storage remains permanent pin + current + one temporary
when they are different inodes. The prior rollback alias shares current's inode.
No extra binary copy, optimizer state or model export is produced.

## Immutable completed-epoch proof

After publishing first-epoch weights, the producer emits first-epoch-proof.json
using an exclusive new temporary and hard-link creation, not overwriting an
existing proof. It verifies the permanent pin's exact SHA/size before publishing.

The profile sop.key-reader-completed-epoch/1 includes:

- artifactRole:completed-epoch,epochComplete:true,runComplete:false;
- runId,completedEpoch:1,checkpointEpoch:1,optimizerSteps;
- configSha256,trainerSha256,preparerSha256,dataManifestSha256;
- encodedDataSha256 and complete dataRecordCounts;
- modelConfigFormat/rawCodecFormat2,preparationFormat3,trainingSourceFormat4;
- checkpoint:{sha256,bytes,path:epoch-pins/<sha>.pt};
- checkpointMetrics,checkpointMetricsSha256,checkpointSelectionRank;
- selectionCriterion,checkpointEvaluation,trainingPolicy,stoppingAtEpoch,warmstart;
- storage:{policy:first-completed-epoch-hardlink/1,pinCount:1,
  retention:permanent,writer,additionalAllocationUpperBytes,reserveBytes};
- confidenceCalibrated:false,graphConfidence:null,executionEligible:false.

Metric hash is SHA256 of UTF-8 JSON with sorted keys and compact separators
(',',':'), ensure_ascii=False and nonfinite values refused. The proof describes
the actual first completed checkpoint, not a claimed completed maximum run.
The publisher refuses final-run or calibration-role forgery.

The checkpoint writer policy is recorded in config/run as
sop.key-reader-checkpoint-writer/1. Final run4 also records runId and the original
firstEpochProofSha256, and verifies that proof and pinned bytes remain unchanged.
No confidence, execution admission or cross-backend parity is inherited from a
completed epoch. A separate loader/validator can consume this role for actual
source-only evaluation while training continues, without pretending run completion.

If proof publication fails after a verified checkpoint/pin exists, training
fails safely and retains meaningful bytes; it does not publish a fake proof or
delete the pin to retry another identity. Explicit recovery can validate the
retained object and source evidence. No automatic extra pin is authorized.

## Tests

Eleven tiny ordinary-byte fixtures cover first hard-link inode identity,
permanent pin through later replacement, immutable proof/hash, stale temporary
preservation, partial writer/upper-size/replace/fsync failures and rollback,
one-allocation reserve accounting, no later pin skip, and final-run forgery
refusal. Fixtures do not read or write real model binaries. Prior42 pure/CPU
candidate fixtures remain green; no actual corpus, checkpoint or GPU run.
