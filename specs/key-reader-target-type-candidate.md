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

Original reviewed preparation: sop.per-key-supervision/2-target-type-candidate.
Current compressed training source uses explicit /3 supervision/run profiles;
see target-type-training-source-v3.md. Tensor model/raw codec remain /2.
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
The separately reviewed target-type-weight-migration.py helper now applies the
plan to in-memory CPU state dictionaries under exact provenance/shape/budget
checks (see target-type-weight-migration.md). The existing CLI warmstart still
loads encoder weights only; it never silently invokes this applier. No actual
checkpoint migration is authorized or performed by this candidate preparation.

## Checks and limits

Run the fixture suite with the existing Python environment:
psys2/.venv/bin/python training/sop-bert/test_target_type_candidate.py
Thirteen pure/CPU tests cover exact inventory provenance/all15families,
shared-label deduplication and area membership, v1 masking, v2 annotations,
absence, invalid/missing metadata, independent kind, no BIO anchors, explicit
format rejection boundary and reordered key/BIO/class-bank migration.
CPU encoding uses tiny synthetic token IDs only; no encoder/model/checkpoint is
loaded or saved. No full corpus preparation, GPU work, model binary, activation
or score claim is part of this change. Review remains required before selecting
the next training architecture/run; the active baseline is immutable.
