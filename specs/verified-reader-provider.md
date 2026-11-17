# Verified byte assembly for the neural reader

createVerifiedReaderProvider in src/dialog/verified-reader-provider.mjs assembles
the published strict cutter, key reader, BERT offset authority, packet boundary
and request pipeline. It installs no router/provider globally and creates no
admission/report/calibration record. Actual effects remain unavailable.

## Factory contract

Inputs are manifestJSON plus its independently expected manifestSha256;
tokenizerArtifact and bindingsArtifact descriptors {path,sha256,bytes?};
readArtifact(relativePath),backend{createSession,makeTensor},createTokenizer,
getContext,recordDiagnostics,runtimeIdentity,verifyHostRuntime.
Paths are explicit bounded relative virtual keys, not config.encoder paths;
the host maps them to approved local/remote resources.

readArtifact returns Uint8Array or ArrayBuffer. createSession receives a fresh
copy of verified graph bytes and {kind,path,sha256}; its returned object has
run(),inputNames,outputNames (and optionally release()). makeTensor accepts
(type,data,dims). Tokenizer input IDs/masks are converted to backend int64;
heads receive tensors created by the same backend.

createTokenizer receives {tokenizerJSON,tokenizerBytes,tokenizerSha256,
configJSON,cutterConfigJSON}. Exact JSON strings are preserved. The host may
construct the actual tokenizer using separately authenticated tokenizer_config
and runtime implementation files; this factory does not guess or load them.

getContext is only the actual trusted host observer/serializer. It is not called
during assembly, and no annotations, teacher spans, expected answers or queries
are factory inputs. Diagnostics are recorded as {component,result} copies, so
the recorder cannot alter the delivered neural packet.

## Local byte proof and bounds

The factory authenticates exact UTF-8 manifest bytes, both embedded config
strings/hashes, all three graph descriptors/hashes/sizes, tokenizer JSON hash and
binding JSON hash before creating any tokenizer or session. The manifest's
self-described identity/proof fields remain claims bound by the manifest SHA;
their underlying training/epoch proofs are separate artifact-loader obligations.

Each owned copy is bounded by its graph descriptor byte count or maxJSONBytes,
and by the remaining aggregate allowance before copying. Declared total is
checked before reads; actual total afterward. Mutable returned Buffer storage
is copied independently. Host callback allocations and backend tensor/session
memory remain outside this artifact-byte allowance and need host reserve.

UTF-8 decoding is fatal and lossless; JSON/file profiles are validated. Session
interfaces must match cutter(input_ids,attention_mask)->bio_logits,
encoder(same)->hidden,bio_logits,presence_logits and
heads(hidden,spans,key_indices)->class_logits.
A malformed session or construction failure releases every created session,
including the just-returned invalid one.

Default maxTotalBytes is256MiB, explicit maximum1GiB; maxJSONBytes defaults4MB
and cannot exceed4MB. These are artifact-byte bounds, not peak memory guarantees.

## Implementation trust is external

verifyHostRuntime receives the actual backend/tokenizer/context function
references and runtimeIdentity, and returns exactly
{verified:true,identity:runtimeIdentity,authority:nonempty string}.
This is an explicit trusted host attestation. Its receipt is NOT independent
cryptographic proof about callbacks. A caller-supplied implementation hash alone
cannot establish code identity. The host must check installed runtime inventory,
actual code/options and approved context access. Function replacement during
attestation refuses; captured function references are used afterward.

Factory metadata distinguishes locally checked artifact hashes from that
external implementation trust. It returns {provider,verified,provenance()}.
verified contains exact descriptors/sizes/hashes, config/tokenizer/binding hashes,
component/pipeline provenance, per-input offset verification policy, attestation
and deterministic assemblySha256. The main admission loader still supplies its
own verified runtime identity and empirical record. No probability, cohort
precision, threshold or execution permission is inferred here.

## Source fixtures

Eight Node fixtures use only synthetic graph bytes/session implementations and
a tiny synthetic BERT tokenizer component profile. They construct the actual
module composition and exercise all graph call stages, but are not evidence of
a trained model or real ORT parity. The trained-role metadata branch is exercised
only as a protocol fixture; no artifact or empirical acceptance is claimed.
Other tests cover corrupt manifest/config/tokenizer/binding/graph data, unsafe
paths, bounds, host refusal/function mutation, invalid second-session cleanup,
and fixture/no-effect diagnostics. No trained model files, network or GPU run.

## Persisted bundle compatibility

The real persisted manifest may declare exactly the three graph files or exactly
those graphs plus tokenizer and bindings. The five-file form requires exact
descriptor equality (path,SHA,bytes) with the independently trusted external
tokenizer/bindings descriptors; it does not turn manifest entries into their
own authority. Any unrelated extra entry or external mismatch refuses before
reads/construction. The source tests use the published candidates/target-type
fixture paths. Nine factory tests pass; no persisted artifact is rewritten.
