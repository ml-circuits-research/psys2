# Browser reader host

`createBrowserReaderHost` assembles the existing verified provider in a browser
worker. Inputs: manifestURL/SHA, tokenizer/bindings descriptors relative to its
directory, exact tokenizerConfigArtifact descriptor, runtimeIdentity, actual-host
getContext, recordDiagnostics, and resolveURL for application-root-relative vendor
paths. It returns the provider, verified metadata and browserHost metadata. No
admission report or calibration is produced or installed.

It authenticates manifest/config bytes, applies the exact Node host BERT special
role checks, and uses the local BertTokenizer-only bundle. The verified factory
checks all graph/tokenizer/binding bytes before sessions. Existing vendored ORT
Web uses WASM, one thread and proxy=false for nonisolated Pages. Module deployment
and getContext implementation are explicitly application-trusted; the attestation
receipt is not cryptographic proof of callback implementation. Effects still need
the separate existing empirical gate.

The browser fetch helper checks status, declared length and streamed byte budget.
Artifact paths reject traversal and absolute paths. Test injection can supply fetch,
module import and assembly functions; production defaults use real imports and the
verified factory. Model/config/data/decoder semantics remain unchanged.

Targeted tests cover host assembly, exact config refusals, stream cancellation and
actual full-runtime/minimal-bundle parity for single/pair, padded arrays and tensors.
The last check is explicitly optional without local tokenizer/runtime paths; the
worker publication ran it against actual installed3.8.1, all four tests passed.
