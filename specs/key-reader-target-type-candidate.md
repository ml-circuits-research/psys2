# Candidate: explicit target family class

This is an isolated source candidate, not a change to the running key-reader/1.
Baseline fb37a609 / published45268e9c:
preparer3565277de7f349ce5a63b578c6b74eb4b4364c0a30f7e8ce45f1819062b50ced,
trainer eb0a0ef595e1587da2be4ad4aea3a90ce1ba8829b89385be90ace4b13810d01f.
The fixture is an exact copy of authoritative heads/inventory.json, SHA256
5e5c4404d392774b6e4754a31988fc2ba943d90289e9a083a6e23ba6cba21832.

## Supervision

The preparer appends request.target.type as a closed class, derived exclusively
from the inventory's domain family declaration keys. Current domains declare
four Drawing, five Diagram, three Document and three Calendar families.
The bank is the sorted unique union of their names; per-area admissibility is
retained independently. Future shared names therefore get one class identity,
not duplicate IDs. Corpus strings never enlarge the bank.

Existing v2 target.type annotations provide labels only when admissible in the
annotation's actual area. Invalid/cross-area annotations become UNKNOWN while
the original rawRequest remains intact. Missing v2 type and nonempty v1 type
metadata are masked; no family is inferred from kind, names, properties or
sentence content. No-request examples remain ABSENT in both versions.
Open target.kind remains an independent source/candidate identity; type=drawn
does not mean kind=circle, nor does kind=circle prove type=drawn.

This head has bio:false: structural family names are usually not literal words
in the utterance. No BIO anchor or invented source span is supervised.
Existing raw rows/request lists, source IDs, splits, exclusions and source
manifest/output checks remain on the baseline preparation path.

## Explicit candidate formats

Preparation: sop.per-key-supervision/2-target-type-candidate.
Model: sop.key-reader/2-target-type-candidate.
Raw codec: sop.key-reader-raw-codec/2-target-type-candidate.
Run: sop.key-reader-run/2-target-type-candidate.

For the pinned inventory this means135keys,122BIO streams,63class banks;
the new class bank has17entries: ABSENT, UNKNOWN,15declared values.
The config records inventory/family provenance and baseline trainer hash.
The current baseline predictor intentionally rejects this config version.
No adapter or trained checkpoint is supplied, and executionEligible is false.
Any future adapter must decode class entries by typed state/value, validate
per-area membership, and keep source kind binding separate.

## Compatible-weight migration plan

weight_migration_plan(old,new) is pure metadata and reads no tensors/checkpoint.
A future applier starts with fresh candidate initialization and checks tensor
ranks, all non-row dimensions, encoder architecture and exact provenance.
Shared key embeddings/presence rows are copied by full registry key identity.
BIO rows are copied as explicit O/B/I blocks by semantic BIO key.
classes ModuleDict names are remapped from old key index to new key index;
class rows are joined by the complete typed state/value entry, never ordinals.
For example numeric1, string"1", literal"<ABSENT>" and reserved absent are
distinct entries. Newly introduced keys/classes keep fresh initialization.
Optimizer state is discarded; unspecified tensors are never copied by position.
This candidate provides the reviewable plan only, not an unsafe partial applier.
The existing CLI warmstart still loads encoder weights only, so it does not
pretend to apply this semantic migration.

## Checks and limits

Run the fixture suite with the existing Python environment:
.venv/bin/python training/sop-bert/candidates/target-type/test_target_type_candidate.py
Thirteen pure/CPU tests cover exact inventory provenance/all15families,
shared-label deduplication and area membership, v1 masking, v2 annotations,
absence, invalid/missing metadata, independent kind, no BIO anchors, explicit
format rejection boundary and reordered key/BIO/class-bank migration.
CPU encoding uses tiny synthetic token IDs only; no encoder/model/checkpoint is
loaded or saved. No full corpus preparation, GPU work, model binary, activation
or score claim is part of this change. Review remains required before selecting
the next training architecture/run; the active baseline is immutable.

## Published candidate isolation

Reviewed source commit: `8a96d6f9`. Main publication places the reviewed sources
under `training/sop-bert/candidates/target-type/`; baseline root tools remain
byte-identical. The following SHA256 values identify the published candidate:

- `prepare-key-reader.py`: `7fd568b19bcda8c637ea74ee1cb2e025209a435c215bac3a7207706d2b626792`
- `train-key-reader.py`: `95686469d7a1185b389bd71f9951120ab092e8b138dbf5b1b1b57f9e8375084b`
- `test_target_type_candidate.py`: `0db3a49293355ad6edd6c76152d00ecbee35c1017653d22a53709297bc6aeea4`
- `tests/fixtures/target-type-inventory.json`: `5e5c4404d392774b6e4754a31988fc2ba943d90289e9a083a6e23ba6cba21832`

## Training-source revision

The original source hashes above remain the reviewed preparation snapshot at `ae0a30fd`. Current candidate training sources incorporate `41e1a653` and `3581441c`: preparer `5cab868172f89f29f51d35894aebfbae0c71011cc97bd3ad4b3b1c29a96fa477`, trainer `a011d8c60e4504c8eb842492cffcda048a7d7b07f4a8f0c443baf356be425ccd`. Their tensor model and raw codec stay `/2`; compressed supervision and completed-run provenance are explicitly `/3`. See [training-source contract](target-type-training-source-v3.md). The independently frozen baseline root tools remain unchanged. Current CLI semantic migration is explicit and hash-bound; the original encoder-only CLI limitation describes the historical preparation snapshot, not the new training source.
