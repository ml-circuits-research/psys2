# CPU-only in-memory semantic weight migration

target-type-weight-migration.py applies the reviewed
sop.key-reader-weight-migration/1 plan to caller-supplied old/fresh CPU state
dictionaries. It performs no file/checkpoint I/O, model construction, GPU
transfer, optimizer loading, training or artifact publication. Supplying actual
trained weights or selecting another training run remains outside this task.

## API and trust boundary

apply_weight_migration(old_config,new_config,plan,old_state,fresh_state,
max_elements=10000000,max_tensors=10000,max_rows=100000) returns either
{ok:true,state,optimizerState:None,stats,...} or
{ok:false,state:None,optimizerState:None,issues,stats}.
The source and fresh dictionaries/tensors are never mutated. Successful output
has independent tensor storage; failures expose no partial state.

Configs must be the exact old key-reader/1 and reviewed target-type candidate
version. Keys/BIO keys and typed bank entries must be unique, registry coverage
complete, reserved ABSENT/UNKNOWN entries explicit, and shared key semantics
unchanged apart from their declared value lists. Canonical typed entries keep
number1, string"1", booleantrue, literal"<ABSENT>" and the reserved absent
state distinct. Encoder path and every declared file SHA256 must match exactly.
These are caller-supplied immutable provenance assertions; the helper does not
read files to independently establish them.

The semantic plan is checked against the configs, rather than trusted merely
because it has the right format tag. Every expected shared row mapping must
appear exactly once with no extra or missing mappings. New class rows are
checked against the explicit initializer plan. A positional permutation that
changes a semantic row is refused.

State dictionaries must have exactly the expected key/presence/BIO/class tensor
names and identical encoder tensor-name sets. Head dimensions must agree with
registry/BIO/bank counts and hidden width; encoder shapes and hidden widths
must match. Only dense real CPU tensors are admitted. All supplied tensor
values, including retained fresh rows, must be finite.

## Application and bounds

All config/plan/name/shape/value checks finish before writing even temporary
output tensors. The helper clones the entire fresh state, copies matching
encoder tensors under exact provenance, then applies the explicit semantic row
pairs. New key embeddings, presence rows and target-type class rows remain
fresh. Class ModuleDict names change by full registry identity; their row
indices change by typed bank entry identity. BIO blocks remain O/B/I triples
of the same semantic key.

A dtype promotion is accepted only if roundtripping back reproduces every used
source value exactly. Lossy conversions refuse the whole result. Optimizer
state is never accepted in the state dictionary and is not returned.
Unspecified/foreign tensor names are refused.

The elements budget charges finite-value scans, fresh clones, copies and dtype
roundtrips; row and tensor counts have separate bounds. Limits are checked
before each corresponding operation. The small default deliberately refuses a
real full encoder unless a later authorized caller supplies a suitable explicit
work budget. Allocation/budget/conversion failure returns no partial state.

## Fixtures

With CUDA_VISIBLE_DEVICES='' run the existing Python environment on
training/sop-bert/candidates/target-type/test_target_type_weight_migration.py.

Nine fixtures use only tiny synthetic tensors. They verify permuted registry
and BIO keys, typed/reordered class banks, unchanged linear logits, preserved
new rows and independent storage; exact encoder provenance, duplicate identities,
missing/foreign/mismatched/nonfinite tensors, malformed plans, work exhaustion,
and exact-versus-lossy dtype conversion. A meta-device tensor exercises refusal
without allocating GPU memory. No actual checkpoint weights are migrated.

## Explicit preflight allowance

estimate_migration_work(old_state,fresh_state,plan) inspects CPU tensor metadata
only, with its own tensor/row limits. For a valid plan it returns exactly:

old elements + 2 × fresh elements
+ 3 × (copied encoder elements + copied head-row elements).

This matches the applier's scans/clones/copies/dtype-roundtrip accounting.
The estimate is not semantic validation and does not scan values; the applier
still verifies all configs, plan mappings and finite values independently.
A caller can inspect the breakdown and explicitly provide max_elements equal
to or above the estimate. The default remains10M and is never raised silently.
A roughly67M-parameter model needs roughly six model-sized element passes,
so its real allowance would be hundreds of millions, not10M.

Work allowance is distinct from memory capacity or allocation bytes.
peakMemoryBytes is explicitly unknown; callers must establish a separate memory
reserve before actual large migration. This candidate task does not authorize
that operation. The extra tiny fixture proves estimate==actual successful work,
exact allowance success and one-less atomic refusal, without large tensors or
model/checkpoint reads. Total fixture count is now10.
