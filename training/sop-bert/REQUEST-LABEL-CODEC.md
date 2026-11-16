# Lossless labels for supported request graphs

`request-label-codec.mjs` is a training preparation component, not a learned reader. It encodes an already supplied graph; it does not interpret text or create annotations. It shares the application's pinned library and validates against `std.request@0.198.0`. The single-request profile accepts all published moods (`do`, `propose`, `check`, `ask`), including explicit query projections for values, count, existence and members. It preserves selector/result closures, logical scope and source intervals; `inspectRequest` decides graph validity. An underspecified ask can remain structurally valid without becoming answerable. Several requests remain separate graphs; their dependency envelope is not inferred by this codec.

Input is `{request, wires, unresolved}`, where `request` identifies the sole root and each wire has `{id, type, attrs}`. Each attribute is an ordered array of original SOP tokens, as returned by the library parser. `requestGraphFromSop(text, requestId)` provides that projection and rejects pattern wires. `unresolved` is an explicitly diagnostic sidecar, described below. All references must identify nodes in this self-contained graph; external/dangling references are refused.

`encodeRequestGraph` produces an envelope with format `psys2.request-labels/2`, profile, contract version, state, root pointer, identity and token tables, nodes and unresolved diagnostics. A node retains its structural type and ordered fields. Each field occurrence is tagged either `{ref: nodeIndex}` or `{token: tokenIndex}`. Symbols are open strings: there is no per-domain action, kind, concept or value vocabulary in the codec.

| Original distinction | Label representation and roundtrip |
| --- | --- |
| Absent optional root/field | No field entry; valid absence stays absent. |
| Literal `none`, `false`, `0` | Explicit token entry, including index zero; no sentinel collision. |
| Numeric spelling `01` or `-0.00` | Exact original token, without conversion through a floating-point number. |
| Quoted string, escaped newline/quote, or quoted `"$t"` | Exact lexical token; a quoted dollar string is not a graph reference. |
| Empty quoted string `""` | Present string value, distinct from absence. |
| Repeated `member` references | Ordered repeated occurrences retained where the schema permits them; no deduplication. |
| Two targets with equal names | Distinct identity-table entries and graph pointers. |
| Selector versus desired-state root | Different named fields/pointers; the published validator checks ownership and disjoint closures. |
| Bound target or logical group | Original nodes and edges, including binder scope, retained exactly. |
| Source interval | Original scalar-offset tokens; the validator rejects UTF-16 offsets that exceed the Unicode-scalar range. |

`decodeRequestLabels` returns the normalized graph with explicit `unresolved: []` when complete. Record property insertion order is immaterial. Wire sequence, identities, field occurrences, literal spellings, sources and offsets are retained. This is stricter than semantic equivalence: the codec does not reorder or alpha-rename a graph, simplify logic, or decide that two different requests mean the same thing.

An attribute occurrence array `[]` is rejected: it has no faithful SOP field occurrence to serialize. Use an absent optional field for absence or `['""']` for an explicit empty string. Unknown fields, unsupported record types and patterns are not discarded.

## Complete graphs and unresolved diagnostics

A complete envelope is checked by loading the public graph and calling `inspectRequest`. `state: complete` means structurally valid under this profile, not that its open symbols are known, its constraints are true, or execution is authorized. Those later decisions require resolution in the instance and evidence of effects.

An unresolved entry is `{wire, field, source, start, end, reason, candidates}`. It identifies a missing declared field, its Unicode-scalar source interval and open candidate strings. This is a whole-field diagnostic, not per-occurrence masking within a partially supplied list. The field must be absent; it cannot simultaneously have a concrete token. Candidate and reason strings are retained, including an empty candidate list. They are model diagnostics, not new public `std.request` fields.

An envelope with unresolved entries is explicitly `state: unresolved`. It may contain other incomplete or structurally invalid graph relationships; the codec makes **no public-graph validity claim** for it. `requestLabelsToSop` refuses it. Simply changing its state flag also fails. Filling a field and removing its diagnostic requires a fresh complete encode/validation, so an unrelated selector/scope/cycle error cannot bypass validation. This sidecar is a lossless record of uncertainty, not a training-ready target.

## Bounds and failure behavior

The codec caps 256 nodes, 8,192 counted values/table entries, 262,144 string code units, 256 unresolved entries and 64 candidates per unresolved field. Both stored tables and their expanded uses are bounded before constructing a large decoded graph; repeated small pointers cannot bypass the limit. Bounds cause refusal, never truncation. Sparse arrays, invalid/noninteger/negative/out-of-range indices, duplicated identities/fields, unused token table entries, references disguised as literals and silent extra record fields are refused.

`LabelCodecError.code` distinguishes codec shape failures, unsupported profiles, incomplete diagnostics and public graph validation failures. The SOP projection helper can also report native parser syntax errors. No decode path chooses a nearby symbol or supplies an omitted operator/value. The neural head architecture in Q110 remains a proposal; this codec does not select it, train a model or establish a preview path.

Run `node --test tests/request-label-codec.test.mjs` for portable conformance checks. They use structural fixtures, including unknown open symbols and deliberately malformed graphs; they are not provisional real-session labels.


## Label format revision

Version 2 uses profile `single-request` and contract `std.request@0.198.0`. Version 1 labels are rejected explicitly rather than silently reinterpreted. Existing version 1 graphs can be regenerated from their preserved source annotations; this change does not migrate or alter active bootstrap checkpoints, which use a different candidate/span representation. The codec remains a lossless representation for supervised targets, not a source of graph gold or a neural decoder.
