PSys2 is an assistant that autonomously builds, uses and improves explicit computational worlds. A world contains a vocabulary, knowledge, an encoder trained to read its language, executable operations, tests and a complete learning history. Coding agents use large language models to construct and improve these artifacts in C1 and C3. During C2 operation, an encoder formalizes input and deterministic interpreters answer questions or execute authorized tasks. No generative language model formalizes operational input or supplies operational answers.

The intended deployment is a machine with a GPU that can fine-tune the encoder and world adapters locally. CPU execution remains a supported deployment profile, measured separately. The architecture is designed from the beginning for autonomous world construction, repeated improvement and a library of at least 100 worlds. Development proceeds through integration milestones; it does not replace this objective with manually maintained demonstration worlds.

This document defines the implementation contracts, the coding agent skill set, data ownership, evaluation gates and recovery mechanisms needed to make that objective concrete. Statements marked as targets are experimental acceptance criteria, not claims of achieved performance. Numerical thresholds are initial policy values; any change to them is versioned and cannot be made silently by the agent being evaluated.

The central engineering rule is that a proposed change is built in a candidate snapshot, evaluated by a separate gate and published atomically. Failed candidates remain inspectable. The active assistant continues using an accepted snapshot until a replacement passes. Every world retains the data and recipes needed for fine-tuning, and every publication or rollback is recorded in an append-only journal.

**Scope.** PSys2 must learn from textbooks, specifications, procedures, regulations and individual documents; answer domain questions; compare documents; detect contradictions and missing requirements; track events and contextual facts; and execute declared actions through explicit capabilities. Worlds can import one another and be combined within a request. Coverage grows through autonomous learning, without requiring a person to label every new world or approve routine updates.

**Meaning of autonomous learning.** “Unsupervised” describes the operational workflow: no routine human annotation or approval is required. The encoder itself is trained with supervised objectives on machine-produced and validated labels, supplemented by self-supervised objectives where useful. LLM-generated labels remain fallible evidence. Autonomous acceptance demonstrates performance on the declared tests; it does not establish that a domain interpretation is universally correct.

**Document guide.** Sections 1–4 define worlds and representation; 5–8 define formalization and execution; 9–11 define the learning skills and release history; 12 gives a complete example; 13–16 specify implementation, measurement and delivery; 17 contains contingency ideas only. Section 18 lists technical references.

# 1 System boundaries and operating modes

The system separates authoring from operation. C1 creates a world or a new foundational capability. C3 improves an existing world using episodes, new sources and coding-agent work. Both may invoke LLMs only through the coding agent and both may schedule GPU training. C2 has neither an LLM endpoint nor access to the coding agent. It runs accepted encoders, interpreters and action connectors.

| **Mode**        | **Inputs and permitted work**                                                                                                                     | **Publication authority**                                              |
|-----------------|---------------------------------------------------------------------------------------------------------------------------------------------------|------------------------------------------------------------------------|
| C1 construction | Source documents, world requests, questions and budgets; agent designs legends, code, training examples and tests; local GPU fine-tuning          | Candidate release only; independent gate publishes                     |
| C2 operation    | User messages, session documents and explicit capabilities; encoder formalization, reasoning, reporting and authorized execution                  | No changes to accepted worlds; writes episodes and session state       |
| C3 improvement  | Episodes, source changes, monitoring and optional feedback; agent diagnoses failures, acquires allowed evidence, revises artifacts and fine-tunes | Same candidate and release gates as C1; may request C1 for a new world |

The learning service owns the scheduler, source registry, candidate workspaces and GPU queue. The operation service owns sessions and accepted snapshots. A release service owns promotion and rollback. Their access rights are distinct: the coding agent may propose code and data but cannot directly move the production pointer, alter protected evaluation sets or weaken acceptance policy.

An initial installation includes the parser, bootstrap core legend, skill runner, evaluation runner, artifact registry and release service. These are the generic platform, not manually authored domain worlds. Bootstrap fixtures test the platform. Domain legends, interpreters, adapters and datasets are produced through the C1 workflow from the first integrated milestone.

LLMs may draft training annotations, generate controlled examples, propose tests, inspect source passages, write code and diagnose failures through skills. These are offline authoring activities. A draft annotation cannot become an operational fact merely because an LLM produced it. Knowledge-base ingestion runs through the accepted encoder and deterministic validators. Externally supplied structured facts use a declared deterministic import path with provenance.

C2 can answer with a supported result, expose alternative readings, identify a contradiction, report missing evidence, report an unsupported operation, or stop because a budget was exhausted. These outcomes are distinct. “I do not know” must not incorrectly imply that missing factual data is the only possible cause.

The scheduler runs C3 after configurable intervals or triggers such as repeated unsupported questions, elevated rejection rates, a changed source, execution failures or drift. It applies deduplication, per-world budgets, retry limits and backoff. Routine jobs run automatically within configured source and execution permissions. A blocked job records a reason and does not silently expand its permissions.

# 2 SOP Lang and the core data contract

SOP Lang is a minimal graph serialization. A wire has an identity, a type and key–value entries. A circuit is a set of wires connected by references. The syntax remains independent of particular domain semantics; legends and operations define how values are interpreted.

> @b1 phys.mech.body mass=2kg
>
> @f1 phys.mech.netForce on=$b1 magnitude=10N
>
> @a1 phys.mech.acceleration of=$b1
>
> @q1 core.question about=$a1 seek=phys.mech.acceleration.magnitude

Unquoted tokens are separated by whitespace. An unquoted @ begins a declaration; @ inside a quoted string is ordinary text. Strings use double quotes and JSON string escapes. Identifier segments match [A-Za-z\_][A-Za-z0-9\_-]\* and may be joined by dots. References are $ followed by an identifier. Other atoms are nonempty tokens excluding whitespace, quotes, @, $, = and backslash; excluded characters require a quoted string. The parser reports offsets and rejects malformed or duplicate declarations without silent repair. Comments are not part of version 1.

Keys can be written in short form only when the pinned legend resolves them unambiguously against the wire type and its ancestors. Fully qualified keys are canonical. Repeated keys are legal only when their declared cardinality permits them. Set-valued keys are sorted canonically; ordered collections use explicit list nodes and indices. Canonical serialization preserves strings, explicit order and reference identity and defines a stable byte representation for hashing.

Atoms such as 2kg remain opaque to the parser. The quantity module parses them into exact values where possible, checks dimensions and performs deterministic unit conversion. Decimal input uses decimal or rational semantics where the operation requires exactness. Floating-point operations declare precision, tolerance and exceptional cases; they do not inherit exact-arithmetic guarantees.

Missing values, explicit negative assertions and conflicting assertions are distinct. Optional means that a key may be absent in a stored wire; it does not mean every operation can run without it. An incomplete wire is a valid candidate when its legend permits partial records. Operational readiness is checked against the selected operation's required inputs and preconditions.

| **Core field** | **Required meaning**                                                                                 |
|----------------|------------------------------------------------------------------------------------------------------|
| core.source    | Reference to an immutable source record, including content hash and exact span or structured locator |
| core.in        | Context reference containing world snapshot, document scope, assumptions and relevant time           |
| core.from      | Explicit supporting fact or derivation references, including alternative support sets                |
| core.via       | Operation identity and exact implementation version used for a derivation                            |
| core.status    | Assertion or result status; never inferred from a confidence number                                  |

Local $id references resolve within a circuit. Cross-artifact references are typed core.ref records containing world ID, release hash and wire ID, reached through ordinary $ references. Type names are atoms; references to declarations are explicit references. A legend and a world use distinct declaration IDs, for example @legend.phys.mech and @world.phys.mech, even when both describe the phys.mech namespace.

# 3 Legends worlds and operation declarations

A legend is a versioned vocabulary of wire types and keys. Each key declares its natural-language question, value type, cardinality, normalization rule and whether it can be observed, computed or both. Type declarations include descriptions, example usages, negative examples and inheritance constraints. Questions guide encoder training and query mapping; they do not by themselves provide an inference rule.

A world is a versioned computational package. It includes pinned legends and imports, immutable sources, asserted and derived knowledge, operation declarations, implementations, model artifacts, training data, evaluation data, calibration, policies and history. Document worlds hold document-local terms and assertions while importing reusable domain operations. A world may have an empty knowledge base but must still have a data manifest and an explicit learning status.

**Every accepted world owns its fine-tuning material.** It has train and development splits, machine-readable labels, negative examples, source lineage, generation recipes, tokenizer and backbone identifiers, adapter configuration, trained heads, training logs and evaluation manifests. Shared datasets can be referenced by immutable hash rather than physically duplicated. A new world cannot be published as an encoder-capable world with only a model file and no reproducible data lineage.

Initial model isolation uses a pinned common backbone and a separately trained adapter for each world. Inheritance of vocabulary and operations does not imply merging adapters. A child adapter is trained against the same backbone using its local data plus licensed, pinned parent replay data. This increases training work but provides an explicit baseline and independent rollback. Adapter composition is a contingency research option in Section 17.

| **Operation declaration field** | **Contract**                                                                             |
|---------------------------------|------------------------------------------------------------------------------------------|
| Identity and version            | Stable operation ID, implementation hash and owning world release                        |
| Inputs                          | Typed variables, required keys, cardinalities and admissible contexts                    |
| Outputs                         | Result types and keys, multiplicity and whether results are complete                     |
| Preconditions                   | Constraints, assumptions, evidence requirements and completeness declarations            |
| Semantics                       | Pure computation, query, state transition or externally effectful action                 |
| Execution                       | Available backend, budget, deterministic cost hint and cancellation support              |
| Evidence                        | Provenance recipe, test suite, checker or theorem statement and allowed assumptions      |
| Failure contract                | Missing evidence, ambiguity, inconsistency, unsupported case, timeout or execution error |

The planner indexes operations by their declared outputs. It never guesses their capabilities by inspecting function names. For acceleration, an operation requires positive mass and a net-force value, or a force set with a justified completeness statement and vector summation. A single arbitrary force is insufficient.

Imports resolve through a lockfile to exact release hashes. Type extension is permitted only if parent invariants and operation preconditions remain valid. Overrides are explicit, scoped and tested; they do not rewrite imported history. A changed meaning receives a new identifier or a declared migration. Namespace reuse is measured for usefulness, not rewarded by a mandatory percentage that would encourage inappropriate reuse.

# 4 Context identity and knowledge consistency

A fact is meaningful within a context. Context includes its document or session, world release, applicable version or effective interval, assumptions and interpretation branch. Inference uses a context compatibility check at every join. Importing a world makes its knowledge available for consideration; it does not make every imported assertion applicable to every question.

core.same is an entity identity assertion with its own evidence, scope and confidence. It is not a command to merge all facts. An entity bridge declares which identifiers correspond and which attributes may be queried across the bridge under which conditions. Two records for valve V2 can describe the same device while retaining different limits from two specification revisions. The question's effective date or chosen revision determines applicability. If it does not, the result reports ambiguity.

The default is open-world reasoning. Closed-world reasoning is allowed for an explicitly bounded predicate, dataset snapshot and context with a completeness declaration. A world-level preference may select defaults, but cannot convert an incomplete extraction into proof of absence. “No matching item found” and “the item does not exist” therefore remain different claims.

Explicit positive and negative assertions are stored independently. The initial core uses four observable states for a queried assertion: supported, refuted, unresolved, or conflicting. It does not derive arbitrary conclusions from a contradiction. Each operation declares how it handles these states; ordinary deterministic calculations require compatible, unconflicted inputs. Specialized exception semantics are implemented by a declared backend and cannot leak into the core implicitly.

Conditional, hypothetical, quoted and reported assertions have explicit scopes. “If pressure exceeds 5 bar, close V2” stores a condition and a guarded action, not a measurement that pressure currently exceeds 5 bar. “The supplier claims X” stores an attributed claim unless a world policy and supporting evidence authorize treating X as established. Negation scope, quantification and temporal ordering are represented through the discourse and time legends.

The knowledge store distinguishes assertions, derivations, candidates and retractions. A source can support a claim without establishing its correctness; source provenance and acceptance status are separate. Candidates that fail validation remain in quarantine with diagnostics, not in the active fact index. Contradictory source material can remain as separately scoped claims and must not be deleted merely to make a consistency test pass.

Truth maintenance records support sets, not just a flat ancestor list. Retracting one support removes a conclusion only if no accepted alternative support remains. Default conclusions also depend on the absence checks and completeness snapshots that licensed them; a newly inserted exception invalidates those dependencies. Identity bridges, imported versions and operation versions are dependencies too. These rules are exercised by insertion, deletion and rollback tests before cross-world publication is enabled.

# 5 Encoder based formalization

The initial backbone is ModernBERT-base, an encoder with approximately 149 million parameters and an advertised context length of 8192 tokens [1]. Its pretrained checkpoint is not already a SOP Lang formalizer. PSys2 must train task heads and adapters and measure their behavior. The initial language profile is English; each additional language requires an explicit encoder profile, data and evaluation rather than an assumed multilingual capability.

The formalizer uses a pinned backbone, shared task heads where compatible, a world adapter and any versioned world-specific heads. Legends are supplied as query text and type descriptions. Adding a type does not force a fixed global classifier output layer, but zero-shot performance on a new type remains unproven until measured. The shared backbone is frozen within an accepted deployment snapshot.

**Type and mention detection.** The encoder identifies candidate mentions and scores them against descriptions of types in candidate legends. The output retains alternatives, scores and text spans. Detection must distinguish multiple instances of the same type in one sentence and support mentions spanning more than one token.

**Key extraction.** A key question is conditioned on the particular mention and its surrounding context, not just the key name. The model predicts a span, multiple spans when permitted, or no answer. This avoids assigning the same mass to both bodies in “A has mass 2 kg and B has mass 3 kg.” Each prediction retains offsets, mention identity and the normalization result.

**Reference resolution.** A scorer links mentions to candidate entities in the segment, session and permitted knowledge scope. Retrieval narrows the candidates; it is not evidence of identity. The model can abstain or retain several hypotheses. Negative examples include similarly named entities, incompatible document scopes and old revisions.

**Relations and scope.** Structured heads predict conditions, negation, modality, attribution, conjunction, alternatives and temporal relations. Deterministic assembly builds the circuit and checks scope consistency. Deep nesting is evaluated explicitly; a structurally valid circuit with lost scope is still a formalization failure.

**Question mapping.** User questions are mapped to typed query plans: entity selection, requested keys, aggregation, comparison, existence, constraints, explanation or an action request. A question can yield several answer wires or a typed collection. The design does not force every question into a single scalar missing key.

All normalized facts must be linked to source spans or an explicit deterministic derivation. Implicit information may be filled only by an accepted operation with recorded assumptions. No decoder LLM supplies missing values. If scope, identity or a required argument is unresolved, C2 returns a structured uncertainty or learning request. Encoder extraction prevents arbitrary token generation in a span field; it does not guarantee that the selected span has the correct role.

# 6 Per world data and local GPU training

The coding agent creates and maintains each world's training package through versioned skills. It can author candidate annotations from sources, build executable generators that produce formal situations and paired texts, mutate known examples and create adversarial contrasts. LLM annotations are draft training labels, never operational formalizations. Deterministic generators retain their symbolic seed, expected circuit and text realization parameters.

A training record contains a stable example ID, source or generator lineage, source-group ID, text, language, active legend versions, expected mentions and keys, reference links, scope graph, expected query or outcome, negative labels, validation results and split assignment. Label status distinguishes generator-backed, mechanically checked, independently corroborated and teacher-only candidates. Teacher-only candidates cannot be relabeled as verified by a simple majority vote.

Sources and problem families are partitioned before annotation expansion. Every paraphrase, numeric variant and generated sibling stays in the same split as its parent. Near-duplicate detection and generator-template grouping reduce leakage. Train and development data are visible to the training skills. Protected acceptance sets are managed by the evaluation service; the agent receives aggregate and categorized diagnostics, not their exact hidden answers. Cases disclosed for repair are retired from protected evaluation and replaced from independent families.

Data checks cover span boundaries, typing, reference integrity, scope, unit normalization, contradictions, answerability and applicability of operations. Round-trip stability is a diagnostic, not a correctness certificate. Agreement between agent-produced code and agent-produced labels can be circular; executable generators, independently sourced exercises, structured records and separately produced adversarial cases provide additional evidence. Optional expert annotations strengthen audits without becoming a prerequisite for routine learning.

Training starts with LoRA adapters and the required task heads on the local GPU. Rank, target layers, precision and batch size are benchmarked, recorded and selected using development data. Adapter size is measured from the actual configuration; it is not promised to fit an arbitrary 1–3 MB range. The full training command, code revision, seeds, data hashes, optimizer state when retained, hardware, framework versions and resulting artifact hashes are recorded.

Each job has GPU memory and time limits, checkpoints, cancellation and resumability. Inference and training have separate resource quotas; priority for active C2 requests is configurable. A GPU out-of-memory error reduces the batch or sequence budget according to a declared retry policy and records the change. A job cannot silently drop long examples or difficult labels to pass its gate.

Retraining mixes newly accepted examples with pinned replay data. Development performance selects candidates; protected evaluation controls release. Quantization and export create separately evaluated deployment artifacts. Shared-backbone updates are coordinated releases requiring evaluation of all dependent adapters. A world adapter is never silently loaded against a different backbone or tokenizer. Data acquisition permissions and dataset licences are retained in manifests, including restrictions on redistribution and training use.

# 7 Routing interpretation selection and C2 execution

A request pins a deployment snapshot at its start. Documents are segmented with overlapping context, preserving headings, paragraph structure, tables and cross-segment references. A router retrieves candidate worlds using a dedicated pinned embedding configuration and world descriptions, examples and questions. Declared worlds are included, but an explicit out-of-domain decision remains possible.

The initial router combines centroid retrieval with a calibrated reranker and an unknown-world threshold. It does not assume that every segment belongs to one of the installed worlds. Embeddings of a masked-language encoder require a defined pooling method and task evaluation. Changing one world adapter does not change the routing model; router updates are separately versioned and tested.

Candidate worlds formalize the segment through the encoder. Validation checks schema, scope, source alignment, identity and context compatibility. Candidate comparison uses scores calibrated on held-out data for those tasks, together with explicit evidence requirements. The number of filled keys is a completeness indicator, not a cross-world correctness score. A candidate does not win simply because its legend asks fewer questions or makes more fields required.

Compatible readings are retained with their contexts. Conflicting credible readings create alternative branches and an ambiguity result. The system must also preserve plausible readings that differ without a direct logical contradiction. An unsupported interpretation is rejected with a reason. Interpretation confidence is calibrated empirically; it is not proof of meaning preservation.

Working memory is a temporary world overlay over the pinned imports. The planner resolves query goals against operation declarations, binds inputs, checks scope and preconditions, and calls admissible strategies. Query caching includes the complete context and snapshot hashes. Budgets limit candidates, branches, recursion, retrieved facts and execution time. Exhaustion returns a budget status rather than a negative answer.

Results are rendered using world-owned templates, quantity formatting and structured explanation rules. The renderer cannot add facts absent from the result wires. Templates and paraphrase choices are tested with the world. Longer reports collect typed findings with evidence, applicability, severity and unresolved questions; narrative fluency is secondary to faithful rendering.

Each episode records input and access policy, source hashes, selected and rejected worlds, encoder versions, candidate circuits and scores, context branches, operations, results, timing, resource use and later feedback. Retention policy controls sensitive raw text; protected references can be stored instead. C3 can use only episodes whose policy permits training. A no-retention session does not become a hidden training source.

Routing costs grow with the world index, and evaluation of candidates grows with selected worlds and keys. The implementation therefore measures routing and full formalization separately. Batching reduces overhead but does not make many key-conditioned encoder passes equivalent to one pass.

# 8 Execution strategies guarantees and actions

The main interpreter performs indexed lookup, context-aware unification, bounded planning, memoization and provenance assembly. Its initial logical core supports finite typed relations and declared pure operations. Recursive rules must specify their supported fragment; monotone finite-domain rules can use fixed-point evaluation, while rules involving defaults require declared semantics and a suitable backend. “Equivalent to Datalog” is claimed only for the explicitly supported Datalog fragment.

Lean is the preferred reference for domain types and computations where useful. JavaScript is the portable implementation, with differential and property tests. Datalog supports relational queries; SMT supports constraints; ASP supports declared default and exception semantics; Prolog can support bounded search. Each extension is an optional backend implementing the same result contract. It is not assumed to have semantics identical to every other backend.

| **Result assurance field** | **Meaning and required evidence**                                                                             |
|----------------------------|---------------------------------------------------------------------------------------------------------------|
| Executed                   | A named implementation produced the result from recorded inputs                                               |
| Independently checked      | A separate checker verified the result or a certificate for the stated property                               |
| Proof checked              | A proof artifact for a specific proposition was accepted under the recorded Lean environment and axiom policy |
| Interpretation evidence    | Separate extraction, scope, identity and calibration information linking text to premises                     |

An answer records assurance by property, not with a single universal “verified” badge. A theorem about units does not prove the numerical answer, source interpretation or real-world applicability. Tests between JavaScript and Lean do not transfer a Lean theorem to JavaScript execution. Stronger claims require either direct use of the verified computation under declared assumptions or an independently checked result certificate.

Lean release checks include successful builds, exact proposition and input bindings, transitive axiom inspection, and rejection of sorryAx or undeclared axioms. Merely compiling code is not a proof gate. The policy records whether native computation or other trusted mechanisms are admitted and the resulting trust assumptions [3]. The interpreter records the versioned parser and translator that connected SOP Lang inputs to the checked proposition.

SMT results distinguish satisfiable, unsatisfiable and unknown. An unsatisfiable core is not called minimal unless an explicit minimization procedure establishes that property. ASP results declare whether conclusions are true in some or all accepted models. Prolog traces require explicit instrumentation. Backend translation is deterministic and tested, but its semantic fidelity remains a separate obligation.

Effectful operations declare target capabilities, preconditions, expected effects, idempotency keys, dry-run support and recovery behavior. The reasoning engine creates an action plan; an action gateway executes only capabilities authorized for the session. Observations after execution confirm or refute expected effects and become episode evidence. Rollback of a world version does not undo an email, device command or other external effect. Such actions need their own compensation or recovery operations, which may be unavailable.

# 9 Coding agent skills for C1 construction

Skills are executable procedures owned by the platform, with instructions, tool permissions, typed input and output manifests, budget, retries, acceptance checks and failure codes. The coding agent invokes them and uses LLMs inside the permitted steps. The runner records each invocation and validates its outputs. An agent-authored acceptance test cannot replace a protected platform gate.

Every skill run records skill version, job ID, source snapshot, parent artifacts, allowed capabilities, model provider and version where available, prompt or prompt hash under retention policy, tool actions, cost, outputs and diagnostics. Artifacts are content-addressed. Jobs are idempotent at a declared input manifest and can resume from accepted intermediate checkpoints.

**C1.01 Register sources and define coverage.** Inputs are documents, the learning request, existing world inventory and a budget. The skill creates immutable source records, extracts text and structure, checks acquisition permissions, proposes world boundaries and defines supported question and action families. Acceptance requires traceable source locations and an explicit coverage manifest. OCR or table-extraction uncertainty is retained; it is not hidden by downstream labels.

**C1.02 Design the legend and context model.** The agent searches pinned namespaces, proposes imports, types, keys, questions, scope structures and entity bridges. It writes representative positive, negative, ambiguous and unsupported cases. Acceptance requires resolvable symbols, compatible inheritance, context rules and representability of declared question families. A competency question can map to a structured query, not only one missing field.

**C1.03 Specify operations and expected behavior.** For every declared capability the agent writes operation contracts, constraints, preconditions, supported numeric domains and failure outcomes. Acceptance requires that every advertised capability has a resolver or an explicit unsupported status and that no operation relies on undeclared assumptions. An operation specification and its tests are versioned separately from implementation.

**C1.04 Build interpreters and checkers.** The agent generates JavaScript and Lean implementations where appropriate, test generators, certificates and backend translators. Compile–repair loops run under budgets. Acceptance requires property tests, negative tests, resource limits, applicable differential tests and the proof policy for any proof claim. Failure to prove a property lowers the declared assurance or blocks that capability according to policy; it cannot be concealed as a successful proof.

## C1 training and publication

**C1.05 Build the data package.** The agent creates source-group splits, candidate annotations, generator-backed examples, paraphrases, contrasts and out-of-domain cases. It produces all encoder task labels and provenance manifests. Acceptance requires data integrity and leakage checks, coverage across the declared phenomena and explicit evidence status for labels. Teacher-only examples remain identifiable. Data quantity is driven by coverage and learning curves rather than an arbitrary fixed count per type.

**C1.06 Fine-tune and calibrate.** The runner schedules GPU jobs for the world adapter and heads, using the training recipe and development split. It compares candidate checkpoints, calibrates no-answer and ambiguity decisions, exports a deployment artifact and reports resource use. Acceptance requires the encoder metrics, supported precision profile, reproducible artifact loading and the expected backbone compatibility.

**C1.07 Build the knowledge base and router entry.** The accepted candidate encoder reads the registered documents. Validators admit scoped assertions, quarantine unresolved cases and compute derived knowledge through declared operations. The skill builds indexes and a candidate router entry. Acceptance requires source lineage, correct query behavior and treatment of conflicts without erasing contradictory evidence.

**C1.08 Evaluate and publish.** The evaluation service runs protected tests, operation checks, end-to-end tasks, cross-world regression and deployment checks. The release service promotes the complete dependency snapshot atomically or rejects it. A partial world can be published only with an explicitly narrower coverage manifest accepted by policy; the agent cannot quietly remove failed capabilities from the original job and declare the full job complete.

The job remains accountable to its original requested scope. Unsupported capabilities create recorded follow-up work and budget decisions. An inability to finish one world must not block unrelated queued worlds, corrupt their artifacts or force C2 to use an unaccepted candidate.

The skill registry uses machine-readable manifests alongside the instructions. For example, the C1.06 manifest below declares artifact roles rather than embedding mutable filesystem paths. At job admission, every input role is bound to an immutable hash. C3.04 reuses this training skill with a correction dossier and replay manifest as additional inputs.

> {
>
> "id": "c1.train_encoder", "version": "1.0.0",
>
> "inputs": ["legend", "backbone", "train_data", "dev_data", "recipe"],
>
> "outputs": ["adapter", "heads", "calibration", "training_report"],
>
> "capabilities": ["candidate.read", "candidate.write", "gpu.train"],
>
> "acceptance": ["data_integrity", "model_compatibility", "dev_metrics"],
>
> "retry": {"max_attempts": 3, "resume_checkpoint": true},
>
> "release_authority": false
>
> }

The runner supplies explicit wall-time, GPU-time, memory and LLM-cost ceilings from the parent job. Missing ceilings fail admission. Local skill acceptance checks establish that an intermediate artifact can proceed; the protected world-release gate remains a separate step. Error codes distinguish invalid input, exhausted budget, failed acceptance, infrastructure failure and cancellation, so the scheduler does not retry a rejected candidate indefinitely.

# 10 Coding agent skills for C3 improvement

C3 uses the same coding-agent and GPU infrastructure as C1. Its special responsibility is to explain a proposed change in terms of observed behavior, preserve previous capabilities and decide whether new evidence supports a correction. It may revise legends, operations, data and adapters of an existing world. A new world or a shared foundation change becomes a linked C1 job or coordinated release, rather than an untracked side effect.

**C3.01 Triage episodes.** Inputs are eligible episodes, monitoring and source changes. The skill clusters recurring failures, separates extraction, scope, identity, knowledge, operation, routing and resource problems, and selects representative cases. Acceptance requires a reproducible failure case and a diagnosis hypothesis with evidence. Frequency prioritizes work; it does not establish which answer is correct.

**C3.02 Acquire and assess correction evidence.** The agent re-examines source passages, obtains allowed new sources, reads structured observations, checks optional feedback and generates independent challenges. It produces a correction dossier linking the old behavior, proposed behavior, supporting evidence and alternatives. A missing input cannot be filled solely because the previous run failed. User feedback and LLM suggestions are candidates to validate, not automatically authoritative facts.

**C3.03 Propose a targeted revision.** The agent creates a branch and identifies the smallest dependency-complete patch: changed source assertion, new examples, revised scope handling, new operation, bridge correction or schema migration. It predicts affected worlds and writes a regression case that fails on the old release. Acceptance requires a causal explanation, impact set and explicit treatment of old artifacts. Changed meaning triggers migration rather than identifier reuse.

**C3.04 Repair data and retrain.** Accepted correction examples enter training or development according to lineage rules; protected test items remain protected. The skill combines corrected examples with replay data, fine-tunes locally, recalibrates and rebuilds knowledge derived from affected source families. It does not simply train on the old model's preferred answer. Acceptance uses the same model and data gates as C1 plus targeted regression tests.

**C3.05 Evaluate challenge and promotion.** A separate evaluation job compares old and candidate releases on the target issue, historical tests, protected acceptance and affected cross-world tasks. New counterexamples test whether the patch merely memorizes the episode. The gate rejects regressions beyond declared tolerances and records unresolved evidence. Accepted candidates enter shadow execution before promotion where policy requires it.

**C3.06 Monitor and recover.** Monitoring compares observed failure and abstention rates with the release baseline, accounting for changes in input mix. A severe invariant failure or a configured degradation trigger initiates rollback to a compatible prior deployment snapshot. The rollback is a new journal event, followed by a diagnosis job. It does not delete the failed release or rewrite its evaluation record.

**When evidence is insufficient.** C3 may generate a better training hypothesis, but it cannot label an unsupported factual correction as established. It records the candidate, seeks further evidence within budget and retains abstention or ambiguity in C2. This is an autonomous outcome; it does not require a human to approve every unresolved case. New source evidence can reopen the job later.

**Learning closure.** Episodes are marked resolved only when an accepted release addresses the failure and its regression case passes. Other terminal statuses include unsupported by current scope, awaiting evidence, duplicate, rejected correction and budget exhausted. The journal links each episode cluster to the skills, datasets, model versions and deployment changes it caused.

# 11 Versions learning journal and rollback

A world release is an immutable manifest of artifact hashes: legend, imports, context policy, sources, knowledge snapshot, operations, implementations, adapters and heads, backbone and tokenizer, training data, evaluation record, calibration and rendering templates. A deployment snapshot pins a compatible collection of world releases, router release, runtime versions and global policies. Human-readable version numbers are labels; hashes determine identity.

The lifecycle is draft, building, evaluated, rejected or accepted, then shadow, active, superseded or quarantined. Evaluation success does not itself change the active pointer. Promotion is a compare-and-swap operation against the expected parent snapshot. Concurrent C1 or C3 jobs based on an old parent must rebase and repeat affected checks. Writes to candidate workspaces never mutate accepted releases.

| **Journal field group** | **Recorded content**                                                                 |
|-------------------------|--------------------------------------------------------------------------------------|
| Identity and time       | Event ID, parent event hash, timestamp, job, skill and actor                         |
| Motivation              | Request or episode cluster, observed failure, source change and intended improvement |
| Evidence and changes    | Sources, examples, claims added or retracted, code and schema diff, migrations       |
| Learning                | Data hashes and split lineage, model and training recipe, GPU run and costs          |
| Evaluation              | Old and new metrics, test manifests, limitations, gate decision and policy version   |
| Deployment              | Previous and new snapshots, promotion or rollback reason and affected worlds         |

Journal entries are append-only and tamper-evident through hash linking. Hash linking does not prevent an administrator from deleting storage; durability requires backups and retention. The journal answers what was learned, when, from which evidence, why the change was proposed, what was tested and which deployment used it. Failed attempts are first-class records.

Rollback switches the active deployment pointer to an available compatible snapshot. Existing requests complete against their pinned snapshot or are explicitly cancelled; a request never changes versions midway. Sessions either remain pinned or migrate through a tested conversion that preserves context and marks invalidated assertions. The system can reproduce old answers from retained inputs and artifacts, subject to privacy retention.

Source retraction triggers dependency analysis. Derived assertions lose invalid supports; adapters trained on retracted examples are marked affected and scheduled for clean-data retraining. Removing a fact from the knowledge base does not erase its influence from model weights. Until retraining passes, policy may quarantine the affected capability, retain an explicit limitation or use an unaffected release. The same applies to shared backbone training data.

All supported deployment snapshots retain the artifacts needed for rollback. Garbage collection follows reachability from active, rollback and audit retention roots. A backup-and-restore test verifies this rule. Retention expiry can make replay or rollback unavailable and must be visible in the registry.

Deterministic interpreter replay is required for a pinned environment and inputs. Bitwise equality of GPU inference or repeated training across arbitrary hardware is not promised. The system records precision, hardware and seeds, archives the produced models and measures permitted numerical variation. Reproducible artifacts and traceable outcomes are the enforceable contract.

# 12 Complete construction operation and improvement example

A C1 job receives a mechanics chapter and a request to support translational acceleration problems. The coding agent constructs the legend, defines net force and mass, writes typed operations and tests, creates the world's fine-tuning package and trains its encoder adapter on the local GPU. Generated cases include multiple bodies, distractor values, missing masses, resultant versus individual forces, unit changes and conditional statements. Protected cases include independent problem families.

The operation mech.acceleration.v1 requires a body, positive mass, a net-force vector in a declared frame and compatible context. A scalar one-dimensional profile is supported explicitly; it is not silently generalized to arbitrary mechanics. The result includes the assumptions of the chosen physical model. Lean checks selected properties of the operation, while the deployed executor and its assurance are identified separately.

C2 receives: “Body A has mass 2 kg. The net force on A is 10 N in the positive x direction. What is its acceleration?” The encoder associates the mass and force with A and constructs source-linked wires. The planner finds mech.acceleration.v1, validates the model assumptions and computes +5 m/s² along x. The renderer returns that result with its supporting spans, operation version and assurance information.

> @b1 phys.mech.body mass=2kg core.source=$src.mass core.in=$ctx1
>
> @f1 phys.mech.netForce on=$b1 magnitude=10N
>
> direction=positiveX core.source=$src.force core.in=$ctx1
>
> @a1 phys.mech.acceleration of=$b1 core.in=$ctx1
>
> @q1 core.question about=$a1 seek=phys.mech.acceleration.magnitude
>
> @r1 core.answer to=$q1 value=5m/s2 core.status=supported
>
> core.from=$b1 core.from=$f1 core.via=$op.acceleration.v1
>
> core.in=$ctx1

The excerpt omits the source, frame, context and operation declarations for readability; a stored circuit must resolve every reference. It also omits direction from the scalar answer excerpt, although the complete result retains it. Provenance must point to exact source content and operation artifacts, not only filenames.

If the input says merely “A force of 10 N acts on A,” the system does not assume this is the resultant. It returns missing evidence about the net force or completeness of the force set. If it says “If the net force becomes 10 N,” the result can be hypothetical under that condition, but is not asserted as the body's current acceleration. With “A has mass 2 kg and B has mass 3 kg,” the extraction task must bind values to the correct mention.

Suppose C3 detects repeated confusion between “total force” and “net force.” Its coding agent inspects source usage and accepted mechanics definitions, creates a correction dossier and generates contrast cases involving individual versus resultant forces. It adds validated labels, retrains the adapter with replay and evaluates on protected examples. If the release passes, a new snapshot is published and the journal records the episodes, evidence, dataset delta and metrics.

If the patch later breaks multi-body questions, a monitor or regression job can trigger rollback of the compatible snapshot. The earlier dataset and adapter remain available. By contrast, a request with no mass cannot be repaired by inventing a training label for the missing mass: it remains unresolved until additional evidence is supplied.

# 13 Runtime isolation and resource management

The orchestration core is implemented in Node.js .mjs modules. Parsing, registries, scheduling, HTTP APIs and deterministic graph operations can use standard Node modules. Model training and inference run in separate managed processes with pinned Python and machine-learning dependencies. Lean and solver backends run as external workers. “No external dependencies” applies to the core package, not to the entire system.

The supported primary deployment is a GPU host capable of local fine-tuning. Hardware discovery records available GPU memory, CPU, RAM, storage and supported precision. A smoke benchmark establishes usable batch and sequence limits before jobs are admitted. The scheduler manages training, inference, compilation and solver queues separately and exposes utilization and contention. A CPU profile is evaluated for inference where needed; GPU training is not forced onto CPU.

Generated interpreters are treated as untrusted code until and after testing. They run in an operating-system isolation boundary with explicit filesystem mounts, denied network by default, unprivileged identity, process and memory limits and enforced timeouts. A sandbox must be tested against forbidden file, network and process access. node:vm and worker_threads are not sufficient security boundaries [2]. Worker threads may still be used for trusted internal parallelism.

Coding-agent workspaces can access only permitted source locations and tools. Network access for acquiring evidence is scoped by the learning policy. LLM calls originate from the agent service, not generated interpreter code or C2. The agent cannot obtain release credentials or protected evaluation answers. Uploaded documents are treated as data, including passages that attempt to instruct the agent or override policy.

Inference workers expose a versioned local protocol for batching, adapter loading and unloading, prediction with scores and offsets, cancellation and health checks. Responses include the exact model artifacts used. Adapter caches are bounded. A request pins the loaded versions; cache eviction cannot replace them with a newer release under the same label.

Job steps write outputs to temporary locations, verify hashes and commit manifests atomically. Retries use idempotency keys. A crash during fine-tuning, indexing or promotion leaves the previous accepted snapshot intact. The job journal distinguishes a failed computation from a lost connection whose completion state is unknown. Recovery inspects committed artifacts before retrying.

Storage sizing includes models, datasets, sources, checkpoints, knowledge indexes, journal and retained releases. A small adapter does not imply a small total world package. Shared immutable artifacts are deduplicated. Resource estimates are produced from pilot automated builds and learning curves; the document does not assume that a fixed number of GPU-days will cover arbitrary domains.

# 14 Modules interfaces and deliverable contracts

| **Module**                 | **Responsibility**                                                            |
|----------------------------|-------------------------------------------------------------------------------|
| soplang and legends        | Grammar, canonicalization, symbol resolution, schemas and migrations          |
| worlds and registry        | Content-addressed artifacts, imports, snapshots, data manifests and retention |
| formalizer and router      | Segmentation, model clients, candidate worlds, graph assembly and calibration |
| interpreter and strategies | Planning, contexts, operations, solver adapters, assurance and provenance     |
| learning and skills        | C1 and C3 jobs, coding-agent invocations, source handling and GPU scheduling  |
| evaluation and release     | Protected tests, regression, policy gates, promotion and rollback             |
| episodes and journal       | Request traces, correction dossiers and append-only learning events           |
| api and actions            | Sessions, reports, job control, streaming and capability-gated execution      |

The strategy interface has describe() for its operation contracts, compile(snapshot) for a hash-addressed artifact, and run(artifact, query, context, budget) for a typed result envelope. The envelope contains status, result wires, support sets, assumptions, alternatives, assurance records, completeness and resource usage. It supports cancellation. All exceptions are mapped to declared errors; an exception is never converted to false.

The formalizer interface returns candidates rather than an unqualified circuit: spans, typed mentions, key assignments, references, scope graph, task scores, rejected hypotheses and model hashes. The data interface validates records against the same legend and context schemas used in execution. Training and inference share label definitions, tokenizer configuration and normalization rules.

| **Endpoint family**                           | **Purpose**                                                             |
|-----------------------------------------------|-------------------------------------------------------------------------|
| POST /v1/sessions and /sessions/{id}/messages | Snapshot-pinned conversation and streamed results                       |
| POST /v1/sessions/{id}/files and /v1/analyses | Temporary file analysis and batch reports; no automatic world ingestion |
| POST /v1/learn/worlds and /v1/learn/files     | Create C1 jobs from scoped requests and registered sources              |
| POST /v1/worlds/{id}/improvements             | Create C3 jobs; scheduler uses the same job contract                    |
| GET /v1/jobs/{id}                             | Stage, checkpoints, budget, evidence and outcome                        |
| GET /v1/worlds/{id}/versions and /journal     | Coverage, releases, learning history and dependencies                   |
| POST /v1/episodes/{id}/feedback               | Record optional feedback as candidate evidence                          |
| POST /v1/deployments/{id}/rollback            | Policy-authorized atomic rollback to a compatible snapshot              |

Learning requests specify sources, target capabilities, allowed acquisition channels, language, time and GPU budgets, retention policy and desired assurance. They may supply competency questions but do not require hand-labeled circuits. Every asynchronous API returns a job ID and supports cancellation. API access controls distinguish reading, learning, deployment administration and external action execution.

The system's deliverable is a runnable installation with automated skill workflows, not a collection of prompts. Each skill ships instructions, input and output schemas, runner hooks, acceptance checks, recovery behavior and at least one fixture. Each world release can be inspected, evaluated, retrained and rolled back using documented commands or APIs.

# 15 Evaluation and acceptance policy

Evaluation separates formalization, reasoning over given circuits, end-to-end answers, autonomous learning and operational behavior. No single F1 score is a substitute for these measurements. Every metric declares its denominator, dataset lineage, language, domain, hardware and budget. Confidence intervals and sample counts accompany rates, especially rare harmful errors. Small samples yield provisional evidence, not strong safety claims.

**Formalization.** Measure mention and type accuracy, role-conditioned span F1, reference accuracy, scope accuracy, query-plan accuracy and full-circuit semantic agreement. Equivalent circuits are compared after canonicalization under declared equivalence rules. Structural validity is reported separately. Negative and ambiguous cases include negation, conditions, quoted claims, multiple entities, conflicting revisions and missing inputs.

**Selective answers.** Answer coverage is answered eligible questions divided by all eligible questions. Selective error is incorrect answered questions divided by answered questions. Also report incorrect answers divided by all questions and abstention-reason accuracy. A confident answer is one admitted by the versioned acceptance policy, including calibrated interpretation thresholds and operation preconditions. Proof status alone never sets interpretation confidence.

**Autonomous construction.** Evaluate the C1 workflow on held-out world-building tasks. Within each task, the agent may use the supplied learning sources, but protected evaluation questions and source families remain separate from its training data. Report completion rate, coverage achieved, unresolved capabilities, total agent and GPU cost, and performance against independent answers where available. Machine-generated tests alone cannot establish independent real-world accuracy. Expert audits strengthen evaluation without being required for every build.

**Autonomous improvement.** Test C3 on streams containing known failure families, new source information and genuinely unanswerable cases. Measure corrected errors, useful coverage gain, unsupported corrections, regressions and time to resolution. Do not demand coverage growth on every cycle: a valid cycle may retract an incorrect belief or discover that evidence is insufficient. Compare against the frozen prior release on unchanged test families.

**Scale and composition.** Evaluate 1, 10 and 100 installed worlds using the same workload families and fixed resource profile. Measure router recall, unknown-world rejection, cross-world context errors, adapter load time, cache memory, tail latency and training interference. Report cold and warm runs. Cross-world tests include identity collisions, incompatible revisions, source retractions and default invalidation.

**Gate integrity.** The release service owns protected tests and policy thresholds. A candidate must fix its motivating regression, satisfy critical invariants, meet its declared coverage contract and remain within allowed regression tolerances. Changes to tests, thresholds or coverage are separately logged and evaluated. The agent cannot repeatedly inspect a hidden set and continue calling it unseen.

**Proof and execution.** Measure checks for the actual critical properties: applicability, dimensional correctness, domain constraints and result verification. Count properties demonstrated and assumptions required, not merely the fraction of functions with any theorem. Inject crashes, exhausted budgets, denied capabilities, partial writes and stale imports to verify failure semantics and recovery.

## Initial quantitative targets

The following targets establish an initial release policy. They are deliberately separated from guarantees. Missing a target creates a recorded research or engineering task; it does not authorize switching to generative formalization.

| **Component**      | **Initial target and measurement**                                                                                                                                                      |
|--------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Encoder            | Role-conditioned extraction F1 at least 90%; scope and reference accuracy at least 95% each on the world's protected set; report full-circuit accuracy separately                       |
| Graph assembly     | At least 95% structurally valid first-pass circuits; no silent scope repair; all invalid cases classified                                                                               |
| Router             | Correct world among top three for at least 95% of in-scope segments at 100 worlds; out-of-domain false admission at most 5% on a separately reported set                                |
| Accepted world     | At least 70% answer coverage and at most 2% selective error on declared eligible question families; report uncertainty and provisional status when sample size is insufficient          |
| Regression         | No critical invariant failures; at most 2 percentage points loss in unchanged noncritical metrics and continued compliance with all absolute error limits                               |
| C1 automation      | Complete at least 8 of 10 benchmark world-build jobs within recorded budgets, without human labeling or manual artifact edits; report coverage and error for each                       |
| C3 improvement     | Over three evaluation cycles, reduce targeted errors or increase useful coverage in aggregate, with no critical regressions and no unsupported correction promoted                      |
| C2 latency         | On a named GPU host, target median below 2 s and p95 below 5 s for a 256-token request, up to three candidate worlds, 24 key queries per world and reasoning over 100,000 indexed wires |
| Scale              | 100 registered worlds with bounded resident adapter cache; warm accuracy within the regression tolerance of isolated execution; cold load latency reported separately                   |
| Audit and recovery | Every promoted change has complete lineage; crash-safe publication and rollback succeed in all fault-injection cases in the release suite                                               |

Long documents, solver-heavy queries and external actions have separate latency classes. CPU inference is benchmarked on a named machine with the same workload and reported independently; a GPU result cannot be used as a CPU claim. The workload caps above are benchmark definitions, not limits on the final architecture.

The million-wire benchmark is a separate indexed-query and reasoning experiment. It declares query classes, selectivity and supported logic. It is not a prerequisite for beginning C1 automation, nor a promise that arbitrary million-wire reasoning takes under 100 ms.

# 16 Implementation plan for the complete system

The plan builds the complete architecture through dependency-aware milestones. Automatic world construction, data ownership, versioning and the journal are present from the first integrated release. Early benchmark worlds are produced by the same skills intended for later worlds; hand-built circuits are restricted to parser and interpreter fixtures and diagnostic baselines.

**Milestone 1 — Platform and automated job skeleton.** Implement SOP Lang, bootstrap schemas, artifact and source registries, immutable snapshots, journal, job runner, sandbox, GPU worker protocol and release gate. Install C1 and C3 skill contracts with checkpointing and structured failures. Deliver an automated job that produces and validates a candidate package, including its data manifest, even before all learned capabilities pass their targets. Exit when crash recovery and identity/version invariants pass.

**Milestone 2 — Encoder learning and executable worlds.** Implement the shared encoder tasks, local fine-tuning, world adapters, operation contracts, JavaScript execution, Lean integration and structured output. Run automated C1 builds for mechanics, laboratory procedures and technical requirements. These provide numeric, conditional and comparison workloads. Exit when each build runs without manual artifact edits and failures are traceable to concrete metrics; worlds enter production only when their coverage and error gates pass.

**Milestone 3 — C3 improvement and reversible releases.** Implement episode triage, evidence dossiers, patch generation, replay training, protected evaluation, shadow execution and rollback. Inject extraction, scope, knowledge and code failures into candidate versions. Exit when C3 can produce accepted repairs and correctly leave unsupported factual gaps unresolved, while restoring previous snapshots after injected release failures.

**Milestone 4 — Multiworld semantics and ten-world evaluation.** Implement calibrated routing, unknown-world detection, entity bridges, version-aware contexts, dependency invalidation and mixed-document questions. Expand the automated build benchmark to ten worlds, including document worlds, obligations and event structure. Exit when the router, C1 completion and mixed-world tests pass with recorded build costs. Backend-specific exception semantics are introduced only with their declared tests.

**Milestone 5 — Assistant and action integration.** Complete streaming sessions, temporary document overlays, batch reports, query families, faithful templates and capability-gated actions. Integrate end-to-end learning triggers and monitoring. Exit when C2 runs with no generative model access, action effects are auditable, and file analysis does not modify accepted worlds without a separate learning job.

**Milestone 6 — One hundred worlds and sustained autonomous operation.** Scale storage, indexes, routing, GPU scheduling, adapter caches and dependency-aware evaluation. Run long-lived C1/C3 workloads with source changes, privacy restrictions, retractions and rollback. Exit when scale, resource, audit and regression targets pass and all unresolved capability limits are visible.

Engineering of these modules can overlap where interfaces are stable. Shared-backbone training and solver integration do not wait for a manually perfected domain world. Each milestone produces executable infrastructure, retained experiments and a decision record. A failed experiment changes an implementation hypothesis through Section 17; it does not silently reduce the system's automation objective.

# 17 Contingencies and research alternatives

This chapter contains options to investigate only when measurements identify a failure. The baseline remains encoder-based formalization, coding-agent authoring in C1/C3 and local GPU fine-tuning. Generative LLM formalization and an LLM fallback in C2 are excluded. A policy change that reintroduces them would require a new architectural decision, not an automatic fallback.

| **Observed failure**                                  | **Candidate investigation**                                                                                                         | **Acceptance requirement**                                                                      |
|-------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------|
| ModernBERT capacity or language coverage insufficient | Larger or language-appropriate encoder; domain-adaptive pretraining; fuller fine-tuning                                             | Same protected semantic and resource evaluation; explicit backbone migration                    |
| Key-query passes too expensive                        | Shared passage encodings, batched key queries, learned key retrieval or multi-head extraction                                       | Preserve role binding and scope accuracy; measure end-to-end gains                              |
| Nested scope unreliable                               | Structured prediction, constrained graph decoding, longer context or deterministic domain parsing                                   | Adversarial nesting, negation and attribution tests; no silent loss of meaning                  |
| Implicit arguments remain unresolved                  | Add source-supported domain operations, discourse rules or explicit assumptions                                                     | Preserve provenance and distinguish conditional conclusions from facts                          |
| Teacher labels share systematic errors                | Stronger executable generators, independent source exercises, adversarial agents or alternative teachers within coding-agent skills | Label lineage, disagreement reporting and independent evidence; consensus alone is insufficient |
| Per-world adapters duplicate too much learning        | Branch adapters, tested delta composition, specialist heads or coordinated shared-backbone update                                   | Compatible snapshots, full affected-world regression and reliable rollback                      |
| Router confuses neighboring worlds                    | Train a dedicated classifier or retriever and improve negative examples                                                             | Recall and out-of-domain rejection improve without hidden coverage loss                         |
| Lean proofs are too costly                            | Prioritize critical properties and result checkers; keep tested execution for other operations                                      | Explicit assurance downgrade; no proof claim without a checked artifact                         |
| Nonmonotonic or probabilistic behavior is needed      | Explicit ASP semantics or a declared probabilistic backend                                                                          | Contextual semantics, dependency invalidation and calibrated outputs                            |
| C3 becomes unstable or expensive                      | Narrow repair jobs, stronger replay, evidence thresholds and lower job frequency                                                    | Preserve autonomous scheduling and measurable recovery; log unresolved work                     |

Research questions include how much task structure can be shared across worlds, which scope distinctions require additional training, how best to calibrate candidate readings, how to detect unsupported questions, and how much independent evidence can be obtained automatically at acceptable cost. These questions are evaluated with ablations and learning curves rather than answered by architectural slogans.

The formal pragmatics perspective is operational: legends define what can be asked and operations define what may be inferred or done under stated conditions. It does not require claiming that a list of key questions captures all natural-language meaning. The useful test is whether the learned representation preserves the distinctions required by the world's accepted questions and actions.

# 18 Technical references and specification status

1\. Answer.AI, “Finally, a Replacement for BERT: Introducing ModernBERT,” 19 December 2024. Initial encoder family, parameter sizes and context design. https://www.answer.ai/posts/2024-12-19-modernbert.html

2\. Node.js documentation, “VM executing JavaScript.” Explicitly states that node:vm is not a security mechanism. https://nodejs.org/api/vm.html

3\. Lean language reference, “Validating a Lean Proof” and “Axioms.” Proof checking, transitive assumptions and the distinction between a completed proof and a declaration using sorry or additional axioms. https://lean-lang.org/doc/reference/latest/ValidatingProofs/ and https://lean-lang.org/doc/reference/latest/Axioms/

These sources establish properties of the selected tools, not the performance of PSys2. Model sizes, latency, accuracy, dataset sufficiency and autonomous improvement must be measured in the implementation. Toolchain and dependency versions are pinned in release manifests because the documentation links above may change.

Candidate corpus families include QA-SRL and QANom for question-based roles, PropBank and FrameNet for roles and frames, coreference resources, discourse-relation corpora and openly licensed technical material. Their conversion into the project's labels requires explicit mappings and tests; it is not assumed to preserve all annotations automatically. Availability and licence compatibility are checked before acquisition. LDC-distributed resources must not be described as unrestricted public data.

The architecture's research claim is that coding agents can construct a growing library of explicit, testable worlds and encoder-based readers, while operation remains inspectable and independent of generative language models. The implementation must establish how well this works, how much it costs and which boundaries require abstention. Formal proofs apply to stated propositions under recorded premises. Data-derived interpretation remains empirical and is evaluated separately.

This revision fixes the baseline around automated C1/C3, encoder-only formalization, world-owned fine-tuning data, typed operation contracts, scoped cross-world reasoning and reversible deployment. Subsequent decisions are recorded as versioned changes with motivating experiments. Neither a successful test nor a failed experiment is allowed to disappear from the learning history.
