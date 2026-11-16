# General request graph head proposal (review pending)

This is a proposed training architecture, not implemented behavior or a new public wire contract. It consumes the published `std.request` structural graph (module 0.183.0, source/envelope support from earlier releases) and uses `inspectRequest` as a structural gate. Point contracts published in 0.186 do not constitute the complete application integration gate. Question-answer projection, compound-request sequencing and the eventual observation/trace/reply path are still separate dependencies.

The shared DistilBERT encoder must feed reusable structural heads, not a collection of Diagram/Calendar/Drawing/Documents-specific class heads. A bounded node/edge decoder can represent several targets and repeated constraints without collapsing them into one request-wide property slot.

| Head / component | Labels or output | Boundary |
| --- | --- | --- |
| Cutter | Request span boundaries, retaining source offsets and explicit truncation/overlap diagnostics | Preserve original cutter idea; unsupported overlap cannot be assigned to a nearby request. |
| Node type | Published request, target, constraint, logical group, negation, quantifier and value structure | A model-internal representation; serialized wires use only the published schema. |
| Closed structural fields | Mood, target mode/determiner, constraint operator, group operator, quantifier kind where the contract enumerates them | Labels derive from the versioned contract, not observed words or domain examples. |
| Open symbols | Candidate-conditioned scores for acts, kinds, concepts, relations, units and declared symbolic values, with supporting source spans | `act` and `kind` are open atoms. Candidate inventories come from reviewed declarations/knowledge; no fixed per-domain enum and no sentence-specific aliases. Unknown is an explicit reading failure, not a fabricated atom. |
| Text/value extraction | Source span pointers and typed value proposals, including names and literals | No single BIO tag is asked to carry overlapping roles. Mechanical offset/number conversion must be lossless; unsupported values are retained as diagnostics. |
| Graph links | Target ownership, relation goal, binder/use, selector-root versus result-root, group membership and source links | Pointers attach to node identities. Surface order and identical labels must not merge distinct targets. |
| Confidence | Per-decision evidence and a calibrated whole-reading execution gate | Confidence stays outside the closed request wires. It cannot replace instance resolution, effect observation or reply evidence. |

Candidate-conditioned scoring is a proposal for an open-vocabulary learned mapping: the same encoder scores a span against declared candidate symbols/descriptions. Adding a concept does not require a hard-coded JavaScript branch or another domain head. It does not imply that an unseen concept will be understood correctly; coverage/unknown behavior must be measured. The available declaration/knowledge inventories and reviewed symbol alignments are prerequisites for training these scores.

Absence, an explicit value such as `none`, and an unrepresentable value require distinct model-internal states. An unrepresentable field blocks publishing a complete reading; it must not disappear into an absent optional slot. The original 530-value sentinel failure is the concrete reason for this requirement.

A source such as “make the red object blue” needs separate selector and desired-state constraints. The selector's graph closure cannot be reused as the result closure. Likewise, two named objects with the same property need separate target identities; quantifier-bound targets must stay inside their binder scope. These are structural predictions checked by the published validator, followed later by resolution in the actual instance. A high-confidence structurally valid graph alone is not execution authority. An absent optional root or an empty constraint set can be legitimate: distinguish that supported empty structure from an unresolved field or unsupported question content. Missing question projection must never be repurposed as a desired-state constraint.

## Proposed first supported subset and gates

Start with one command request and published `do`/`propose` structures, targets, selector/result closures and supported constraint/logical forms. Do not invent question projection or compound-sequencing nodes. Source requests that need those contracts remain in the dataset manifest with `pending-contract` status and a concrete reason; they are not silently removed or reworded. New symbols unsupported by reviewed declarations remain unresolved rather than mapped to the nearest known domain value.

The decoder's gold graph roundtrip must preserve node/edge structure, payloads, binders and source spans, allowing only consistent local-ID renaming and ordering declared immaterial by the contract. It is not a semantic theorem prover for arbitrary equivalent formulas. Require exact roundtrip on the reviewed representable subset and report every unsupported source request separately as an unready prerequisite. Do not inherit the old “95% roundtrip / 1% silent wrong” training shortcut.

Training, calibration and final unseen populations are separate, as review 9 confirms. Reviewed owner English sessions are development data. Provisional semantic labels are not training gold. Fit the confidence threshold only on calibration, freeze model/decoder/threshold, then read the final holdout once, reporting right/partly/asked/wrong, extras and precision of execution. Reading the historical baseline's old split is not permission to inspect the future final holdout.

## Environment and dependencies

The workspace `.venv` has torch/CUDA on NVIDIA GB10; `check-training-env.py` passes a bounded GPU arithmetic check without downloads or training. Training/export API compatibility still needs a small local architecture smoke test because the installed transformers version is newer than the archived scripts. Keep caches, datasets, outputs and manifests within the workspace, preserve the existing environment, and do not start external services or paid resources.

Before retarget implementation: review this architecture, identify the authoritative candidate inventories, and accept gold annotations for the chosen published subset. Full application integration additionally needs the remaining shared contracts and resolution/effect/reply binding. No preview or generic-reader acceptance is claimed by this proposal.
