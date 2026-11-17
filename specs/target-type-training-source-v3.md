# Candidate training source v3: compressed data and frozen semantic warmstart

This source version is separate from the immutable running baseline and the
previously published candidate sources. Tensor architecture, model config
format and raw codec remain /2-target-type-candidate. The new supervision
manifest and completed run use /3-target-type-migration-candidate; exact source,
manifest and config hashes change normally. No existing artifact is retagged.

## Deterministic compressed supervision

Preparation requires the exact exclusion file named by the frozen source
manifest, verifies original source-output hashes and checks each source ID/split
before labels. It streams every retained row and original request list, including
empty lists; there is no subset/limit option. Original rawRequest remains intact.

Output is train.jsonl.gz and calibration.jsonl.gz, UTF-8 JSONL with gzip mtime0,
empty header filename and compression level6. No uncompressed duplicate is
written. Each dataFiles entry declares path,encoding,compression,sha256 of
encoded bytes,decodedSha256,encodedBytes,decodedBytes,records. outputs keeps
the encoded hashes. The manifest retains original source/exclusion provenance,
source row counts and script hashes. It does not claim hashes prove truth.

The preparer checks an explicit max total encoded-output budget plus disk
reserve before writing, checks growth/reserve and per-record/decoded bounds
during streaming, and rechecks input hashes before completion. Its exclusively
created partial output directory is removed on refusal. Existing outputs are
never overwritten. No full dataset preparation is authorized by this source task.

The trainer accepts only declared gzip/UTF-8 filenames. Encoded hashes/size are
verified before decompression; line/decoded-byte bounds, decoded hash and exact
record count are checked afterward. All records are loaded, with no limit flag.
Source IDs, requestIndex and split are preserved; duplicate records refuse.

## Frozen warmstart specification

CLI --warmstart-spec PATH requires --warmstart-spec-sha256 SHA.
The JSON specification has exactly:
format:sop.key-reader-frozen-warmstart/1,
optimizerPolicy:reset,elementWorkAllowance:positive integer,
files:{checkpoint,config,run,trainer,dataManifest,preparer,helper}.
Every file entry has an explicit path and SHA256. No latest/active checkpoint
discovery exists.

All seven hashes and the outer specification hash are verified before loading
weights. The source completed run must be sop.key-reader-run/1 with positive
steps and matching checkpoint/config/trainer hashes; its config must be
sop.key-reader/1 and bind its exact trainer/data manifest. The old manifest binds
the preparer SHA. Regenerating configuration from that exact old trainer/manifest
must reproduce the trained layout. Inventory and exclusion identities must
match the new candidate. A pinned final baseline run/1 summary is the completion
authority; source snapshots or intermediate checkpoints alone are insufficient.

The checkpoint is loaded CPU-only with weights_only=True. Its embedded config
must equal the frozen config. The reviewed helper derives and validates semantic
row migration, checks exact encoder provenance and all tensor conditions,
estimates work, refuses if the explicit allowance is too small, and applies the
plan in memory. Model initialization stays on CPU until migration and frozen
hash revalidation succeed. New type rows remain initialized; no optimizer state
is restored. A new AdamW optimizer is constructed afterward.

Warmstart provenance is sop.key-reader-warmstart-provenance/1:
kind,specSha256,frozenInputs,sourceModelFormat,targetModelFormat,
elementWorkAllowance,estimatedElements,stats,optimizer:fresh-AdamW,
migrationHelperSha256. The explicit pretrained-encoder alternative records null
warm spec/source/helper/work fields and empty frozenInputs. This is never
presented as semantic migration. Work allowance is not peak-memory capacity;
actual large migration still needs separately reviewed memory/disk reserve.

## Model selection

Config and run record sop.key-reader-selection/1. The predeclared lexicographic
criterion is positive supervised BIO+global subset exact rate, then target-type
present-class accuracy, then decoded mention F1. A supervised positive global
class (including type) makes a row positive even when it has no BIO anchor.
No positive supervision means selection refuses, not an empty-perfect score.
Per-family target-type class support/correct/accuracy and mention F1 remain
separate reports. Unknown/masked metadata is not newly asserted as absence.
The subset uses gold request cuts and excludes unverified graph semantics and
predicted-mention metadata correctness. It is never full-graph confidence.

## Completed run profile

Run format sop.key-reader-run/3-target-type-migration-candidate requires:
complete:true,tensorArchitectureVersion:2,preparationFormat exact/3,
modelConfigFormat exact/2,rawCodecFormat exact/2,
configSha256,trainerSha256,dataManifestSha256,preparerSha256,
encodedDataSha256:{train,calibration},epochsCompleted,steps,checkpointSha256,
selectionCriterion,bestSelectionRank,warmstart.
The final config also records trainingSourceFormat
sop.key-reader-source/3-target-type-migration-candidate and the new provenance.
Source, compressed data, encoder and frozen warmstart hashes are rechecked after
training. The baseline and previous candidate predictors need explicit /3 run
support; matching model architecture alone does not waive provenance checks.

## Validation and remaining limits

Seven new pure/tiny CPU fixtures verify deterministic compression roundtrip and
encoded/decoded provenance, retention of four tiny raw rows including negatives,
corruption/bound/refusal cleanup, synthetic warmstart success and chain/layout/
exclusion/allowance refusal, and a better-BIO-F1/wrong-type selection counterexample.
Prior13candidate and10migration fixtures remain applicable.

No actual checkpoint or file weights are read by these fixtures; they use tiny
in-memory synthetic tensors. No full corpus, pretrained model, optimizer run,
GPU work or saved model binaries are generated. This source preparation does
not authorize a training run, activation, confidence calibration or full graph
success claim. Gold-cut conditional evaluation remains distinct from future
predicted-cutter end-to-end evaluation.
