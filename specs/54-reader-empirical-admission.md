# Reader admission from retained empirical evidence

The application uses the published library0.202 selective-calibration mechanism. `reader-routing.mjs` no longer accepts an arbitrary `requestReaderGate.accepts` callback or a model's `coverage.executable` assertion. A complete proposal remains a proposal: admission additionally requires a retained, independently evaluated report for the exact deployed identity and current area, followed by the existing native executor validation. No report or installed model is supplied by this source change.

## Constant-score baseline

`scoreReaderProposal` exports the fixed protocol `psys2.complete-unique/1`, used identically during C1 measurement and runtime routing. Eligibility requires complete graph-proposal coverage, exactly one candidate, no unresolved/failure/truncation diagnostics, public `prepareRequestBatch` validation, and exactly one source record containing the entire current input text. All other rows are ineligible and remain in the evaluation denominator. Eligible rows have score1; ineligible rows score0. Neither score is a probability.

This baseline deliberately has no fine confidence threshold: the entire eligible cohort within the retained area scope either meets the measured policy or remains closed. No failed prediction may be relabelled ineligible after inspecting correctness. A future margin score is a different protocol and identity requiring fresh fit/evaluation, not an unannounced replacement of this baseline. Correctness requires the independently reviewed complete intended request and effect, not schema validity or a receipt.

## Host configuration and identity

The host supplies `session.engine.requestReaderAdmission = {world, reference:{owner,revision}, runtimeIdentity}`. `world` contains the immutable library report; it is separate from mutable live application state. `readerCalibrationIdentity(provider.provenance(), runtimeIdentity)` creates the exact report/query identity. The provider identity includes its model/component provenance and decoder version. The host runtime identity must contain precisely these verified SHA256 values:

| Field | What the loader must authenticate |
|---|---|
| appBuildSha256 | Deployed application build |
| readerSha256 | Actual reader computation implementation |
| pipelineSha256 | Cutter/key orchestration implementation |
| packetAdapterSha256 | Packet validation and diagnostic transport |
| graphDecoderSha256 | RAW-to-canonical graph bridge/decoder implementation |
| bindingsSha256 | Exact declared canonical binding snapshot |
| executorSha256 | Native resolution, planning and effect-assessment implementation |
| backendSha256 | Actual runtime/backend/quantization profile |
| contextSerializationSha256 | Actual context input schema/serialization/offset protocol |

These hashes must be loader-verified host declarations. That actual artifact loader is not installed yet, so no runtime identity or production report is currently admitted. This adapter does not prove file authenticity from a caller-provided string or infer backend parity. If the provider already declares a binding hash it must match the runtime identity. Model, runtime, binding, context, backend or execution behavior changes require new identity and measurement.

`readerCalibrationScope(area)` produces a canonical string containing protocol `psys2.reader-area/1` and the current runtime area. The area is read through the same host options/live tab used by execution. No expected annotation or guessed functional-class tag is used to choose scope. Narrower class admission needs a separately defined runtime-derived classifier and new protocol.

## Report and decision

C1 calls the library's `retainSelectiveCalibration` with this identity/scope, an explicit support policy and source-disjoint fit/evaluation rows. Threshold selection sees only fit rows; evaluation can approve or reject but cannot retune it. The application currently requires `maxErrorRate:0` and zero observed wrong in both accepted cohorts. No minimum support is invented by the adapter; the report must declare it and the library enforces it. Zero observed wrong is empirical evidence, not a future-error guarantee or an individual prediction probability.

Runtime calls only `assessSelectiveCalibration` against the retained owner/revision and actual score/eligibility. Missing evidence, insufficient support, changed identities/scope, failed risk evaluation or forged retained summary refuse without effects. The trace retains score definition, eligibility and the library's measured admission result. Native execution can still refuse a statistically admitted graph for unsupported semantics, stale/ambiguous targets or unverified effects. The model's graph confidence stays null; cohort precision is never copied into it.

Tests use explicitly synthetic C1 labels to exercise the admission mechanism and an actual native observation/effect, not to claim real-model correctness or ship a calibration report. Real frozen predictions, independent semantic/effect labels and deployment backend parity remain necessary before any production model can be admitted.
