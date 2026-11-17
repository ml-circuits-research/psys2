# Completed selected-checkpoint export and immutable packaging

This source increment prepares the completed Review23 run's selected epoch 7,
which differs from last epoch 10. It does not load a trained checkpoint, export a
trained graph, select new bindings, activate an app model, or inherit calibration.
Synthetic tests do not establish trained-model profiles or numerical quality.

## Authority before actual export

`export-selected-reader.py:verify_selected_metadata(paths, hashes)` reads only
config, trainer, preparer, data manifest and completed-run JSON. It reuses the
published `candidates/target-type/artifact-provenance.py` completed-run validator,
including policy, warmstart, encoded-data chain and selected-epoch checks. Exact
file hashes and the expected checkpoint hash are explicit. First-epoch proofs
are rejected on this completed-selected path. `checkpointRead=false` is literal:
this metadata proof cannot establish a model/checkpoint association.

An authorized caller MUST next use the existing strict `load_verified_artifact`
CPU loader with these exact paths/hashes and the checkpoint, before calling
`export_selected_components`. It must preserve the loader's pre/post checkpoint,
config, source, data and encoder checks; require its completed-run role/selected
checkpoint epoch; bind the returned model/config to that provenance; and recheck
all hashes after export. Passing an arbitrary module is not proof that its weights
came from the claimed checkpoint. The component receipt explicitly names this
trusted loader boundary. No trainer/helper source is changed here.

Actual metadata-only verification on the frozen run passed: run complete,
selected 7 of 10, config `b7b03ad5...`, expected checkpoint `20198a4169...`.
The local receipt is `.session-control/review26-selected-metadata-verification.json`;
no checkpoint was opened by that check. Actual weight loading/export still needs
root review/authorization of this source and storage plan.

## Export and peak disk

`key_graph_bytes(model,config,examples)` exports encoder then heads through the
existing CPU FP32 BytesIO/ModelProto exporter and its pinned ORT in-memory
quantizer. It never exports the cutter or supplies an FP32 model pathname. It
validates declared predicted-query ranges/roles through the shared layout helper.
Only final q8 bytes are written. The prior real encoder's FP32 ONNX was 267118432
bytes, not the BF16 checkpoint's approximately 135 MB; an FP32 disk temporary is
therefore outside this plan. RAM capacity and actual backend parity remain a
separate preflight; prior complete RAM measurement peaked at about 3.64 GB RSS.

`verify_frozen_cutter` pins the old manifest, unchanged q8 graph and separate
completed cutter proof, including checkpoint/config/trainer chains. It accepts
only a regular, non-symlink, read-only graph. `export_selected_components` creates
a NEW exclusive directory, emits only encoder/heads, hardlinks the verified
cutter under a local filename, and records exact original key-run/cutter-proof
bytes. It does not load a cutter checkpoint. All new files become read-only.
The original old asset paths and immutable first-epoch proof remain untouched.
It freezes/rechecks exporter/layout source hashes and source metadata. Any failure
removes only its exclusive new output; originals and reused inode bytes survive.

The explicit **non-writer** activity budget approved by root is 80 MiB maximum
new final assets, 96 MiB future Git allocation, and 64 MiB operational reserve:
240 MiB initial free, 160 MiB remaining during final asset writes. There is no
active checkpoint writer. This does not change the existing 303537434-byte
checkpoint-writer reserve for future training. The API requires explicit bounds,
checks free space before creation and every write, and refuses rather than
lowering them. The budget covers the eventual complete new metadata/bindings too;
its use by a component-only invocation does not authorize spending the remainder
elsewhere. All later assembly must charge remaining bytes against the same cap.

Prior measured q8 encoder+heads total 67784484 bytes; sizes can change and are
not an export guarantee. Reused cutter contributes 66756266 logical bytes but no
new data allocation. Tokenizer/config and new separately published bindings must
be verified individually; no old binding is labelled current. `components.json`
reports `newBytesBeforeReceipt`; the function's returned `totalNewBytes` includes
that receipt. There is no circular self-size/hash claim.

## Manifest and packaging ABI

The eventual runtime manifest retains its existing format, exact UTF8 configJSON
strings, tensor/bank layout and rawRoutes. New encoder/heads/checkpoint hashes
change identity. It must explicitly include `runComplete:true`, `selectedEpoch:7`
and `immutableProofSha256` of exact completed key-run bytes, with no first-epoch
completion claim. Separate proofs are declared as:

```json
{"componentProofs":{
  "key":{"profile":"completed-run-selected","path":"key-run.json","sha256":"<key-run hash>","checkpointSha256":"<selected checkpoint hash>","selectedEpoch":7},
  "cutter":{"profile":"frozen-cutter","path":"cutter-proof.json","sha256":"<cutter proof hash>","checkpointSha256":"<frozen cutter checkpoint hash>"}
}}
```

`package-reader-browser.mjs` preserves the old first-epoch manifest path/profile
and adds correlation checks for the selected completed-run and independent cutter
proofs. Its opaque-byte validation does not replace the full Python metadata
validator or strict weight loader. Unlisted files, corrupt bytes, mismatched
source/config/epoch chains, unsafe filenames and symlinks refuse. Final bindings
are selected by the separate published declaration lane before assembly; this
increment contains no binding regeneration or fallback selection.

`linkReaderAssets(plan,budget)` / CLI `--link` stages the verified complete bundle
at `models/sop-bert/<manifestSHA>/` by hardlinking read-only files, with no duplicate
export/app data copy. The directory is exclusive, parents cannot be symlinks,
source identity is rechecked, and explicit Git/margin/reserve bounds apply. It
never stages Git or writes deployment.json. Once linked, both content-addressed
paths are immutable: future content goes into a NEW directory, never in-place
writes or chmod of shared inodes. Legacy `--copy` remains available but is not
part of this resource plan. A main build must bind implementation/vendor identity
separately. Package identity or numerical parity is not calibrated confidence,
intent truth, graph correctness or execution approval.

## Checks

- `node --test training/sop-bert/tests/package-reader-browser.test.mjs`
- `PYTHONDONTWRITEBYTECODE=1 TMPDIR=<workspace> <venv-python> training/sop-bert/tests/test-export-selected-reader.py`

Seven Node and six Python tests cover legacy/selected proofs, selected epoch 7
versus last 10, hash/config/refusal boundaries, exclusive writes, cleanup after
partial failure, byte limits, symlink/path refusal, shared inode staging, and
actual tiny synthetic CPU Torch→ONNX→ORT encoder/heads at multiple shapes with
FP32 disk writes disabled. No trained-model quality or output profile is inferred.
