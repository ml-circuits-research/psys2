# Conservative C1 teacher request expectations

`training/sop-bert/compile-teacher-expectations.mjs` is an offline C1 annotation adapter, not a reader or an execution oracle. It uses the exact deployed bindings and published raw-structure bridge plus strict `prepareRequestBatch` validation. It neither imports grammar nor supplies teacher annotations to model inference. It does not change application admission, training data, checkpoints, deployment files, or bindings.

## Output and refusal boundary

Each row retains its original source identity, text, context and complete annotations, including unsupported fields. Its origin records compiler, bridge, library and binding SHA256s. `modelInference=false`, `executionEligible=false`, and `executionCorrectness=not-assessed` are unconditional.

- `canonical-expectation`: exactly one bridge candidate, no diagnostics or unconsumed fields, and independent strict batch validation. `expectedGraphs` contains serialized batch entries (`id`, `request`, `wires`, `after`), without the bridge's model-origin/confidence metadata.
- `zero-request`: explicitly empty original annotation list, kept separate from a canonical nonempty graph.
- `unknown`: malformed annotations, unsupported v1 flat annotations, ambiguous source evidence, missing canonical declarations, unsupported roles/fields, unresolved dependencies, budget refusal or strict validation failure. No expected graph is emitted. All original leaf paths are listed as uncertified; known unsupported fields are also recorded as unconsumed.

The public row API accepts plain JSON objects only. It rejects cycles, accessors, custom prototypes, non-finite numbers and excessive depth/size with a TypeError before cloning or evaluating any getter. Invalid JSON host objects have no serializable original to retain. Absent and explicit-null annotation lists remain different states; neither means zero requests. Bindings and provenance must come from verified JSON artifacts.

The bridge currently requires a `model.kind=structural-graph` input schema stamp. The adapter supplies its compiler hash solely to satisfy that interface, labels the outer output `C1-teacher-annotations`, and strips bridge candidate origins. This stamp is not evidence of neural inference or quality. Teacher graph identity cannot imply execution correctness.

No source-word patterns, domain names or guessed naming-prefix bindings are added. Exact unique annotated source anchors are delegated to the existing bridge. Repeated ambiguous source text is unknown. `measure_span` without `unit` is explicitly unconsumed because the current bridge only consumes that evidence with a unit. Unsupported query, turn, count/group/anchor semantics stay diagnostic rather than acquiring invented graph edges.

## Reproducible corpus preparation

The CLI accepts `--corpus`, `--corpus-manifest-sha256`, `--exclusions`, `--deployment`, `--deployment-sha256`, `--web-root`, `--bridge-sha256`, `--library-sha256`, and a NEW `--out` directory. Optional `--max-output-bytes` defaults to 67108864; `--reserve-bytes` defaults to 303537434. Resource limits are never lowered automatically.

It verifies the immutable corpus manifest, split hashes, exclusion hash, source hashes, source-ID split, reserved-ID absence, deployment/model-manifest/binding identity, and exact compiler/bridge/library/decoder/data-copy dependencies. Only deployment metadata and bindings are read; graph weight artifacts and checkpoints are not opened. Every source row is retained in its split regardless of projection outcome. Input hashes are checked again after streaming. Exclusive deterministic gzip outputs have encoded/decoded hashes and all status/reason counts in a compact summary. Existing output directories are never overwritten. Encoded writes, decoded row size/depth, and free space are bounded; errors close active streams and remove only the newly created output directory.

The current source-only increment has **not** run the complete corpus. It does not compare model graphs or calculate calibration/confidence. `graphMatching=not-run` is explicit. Published library 0.203 comparison can be adopted independently later; strict local-ID graph equality is not logical equivalence, intent truth, or effect truth.

## Generic-method review

Piece: a declaration-backed relational projection of existing teacher structure, using the already published bridge. Alternatives considered: extending the original Python projector (would create a second canonical runtime), applying grammar to annotation text (would add a second interpretation), or reusing the exact deployed bridge (chosen to expose its real missing declarations/roles). The mechanism survives new worlds through source-backed binding joins, does not know sentences, and preserves unsupported records. Bounds are explicit; no currently successful runtime path changes. Synthetic probes use one invented fixture world and cover selectors, literal/reference distinction, Unicode, missing declarations and malformed structures. These are adapter fixtures, not evidence of corpus coverage or successful user effects.

Run `node --test training/sop-bert/tests/compile-teacher-expectations.test.mjs`.
