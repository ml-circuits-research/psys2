# Typed UI controls as expected intent and training pairs

Every UI gesture invoking a declared native operation can be captured before execution by `describeNativeControl({operation,args,before,parameterBindings})`. It returns a readable command, typed SOP Lang wires, exact provided and defaulted arguments, and observed identity/source/version evidence. No model or surface parser participates. The output is an expected intent supplied by the UI, not a prediction of what the reader understood.

## Representation

`NATIVE_CONTROL_INTENT_SCHEMA` declares the application types `app.control.source`, `app.control.intent`, `app.control.argument`, `app.control.value` and `app.control.target`. The graph names the exact declared operation, its general act and owning source type, mood `do`, source text and baseline observation. Arguments retain their declared parameter names and JSON scalar types. Arrays retain explicit member indices; objects retain named members, nesting, nulls, empty arrays and exact strings. A value matching an observed object id also retains that object's source as identity evidence. Such equality is evidence of identity correspondence, not a guessed semantic role.

Readable text uses general act verbs and labels derived from declarations and actual parameters. It contains every non-target argument. Edits identify the exact selected ids and may include their observed display names. Source ranges count Unicode scalars and identify the rendered parameter values. The original provided arguments remain separate from defaults admitted by `validateNativeArguments`. Invalid UI arguments remain captured with `validArguments=false`; they are not relabeled as accepted training positives.

Generated identity fields are retained in wires and expected arguments but omitted from human commands. Edits prefer an observed display name over an internal id. Optional declaration metadata `intent.subject` and `intent.parameters.<parameter>.label` supply human wording; `format:unix-ms` and `format:duration-ms` explicitly render typed times and durations. `reference:true` permits an observed display label for an identity argument. Literal strings are never replaced merely because they equal an existing id. Source ranges record their origin (`text`, observed identity label or declared formatting); a generated id is never falsely attributed to the textual source.

These application wires are deliberately named `app.control.intent`, not `std.request`. Lists, nested document blocks, datasets and typed references cannot be faithfully reduced to scalar `std.request.constraint operator=eq` without further contracts. The exact typed interpreter `readNativeIntent` decodes these wires back into the declared operation and arguments. UI controls execute that decoded result, after an exact round-trip check, through the native tool host. This is separate from a neural prediction: text-only reader evaluation must still measure its own predicted graph and arguments.

## Effect verification

`verifyNativeControlEffect({intent,before,after,receipt})` uses an independently supplied complete after-observation. It checks instance/baseline versions, receipt identity, target existence or removal, exact same-incarnation edit targets, and parameter values from native observed keys. An explicit `parameterBindings` entry may join a parameter to its declared observed `binding`/`key`; `mode:set` permits order-insensitive comparison for a declared collection while the training pair still retains the original exact array order.

Creation checks one newly observed owning-type object (and explicit id when supplied). A declaration may set `result.identityParameter:null` when its `id` parameter identifies a source rather than the created result; `intent.parameters.id.role:source` then includes that source reference in the human command. Multi-id changes/removals check every selected object; mutation of an unselected peer of that same type is a mismatch. Native parameter aliases, aggregates, nested values, hidden selection/history or fields absent from the observation remain unverified unless an explicit observation binding is available. Declarations with `effectScope.projection:composite` explicitly identify replacement/extraction effects which cannot be checked as a same-identity scalar edit; after source/version/receipt checks these remain unverified until an independent composite projection exists. The module never invents a conversion merely to improve a verification count.

| Status | Meaning |
|---|---|
| `verified` | Every expressed, observable target/value condition in this typed tool intent matched. This is not neural-reading accuracy or proof of arbitrary higher-level user intent. |
| `unverified` | Missing/stale/mismatched observation evidence, unsupported projection or unobservable intended fields prevent full verification. Individual checks remain available. |
| `refused` | The tool refused and independent before/after observations are unchanged. |
| `mismatch` | A declared value/identity/operation differs, a selected effect is missing, an unselected peer changed, or refusal mutated observed state. |

Persistence, chat display and export belong to the caller. Store the expected text/wires and exact arguments together with the real receipt and verification status. Do not promote a successful acknowledgement, reduced graph or unverified aggregate into a successful effect label. Capture failures and mismatches for diagnosis; training-positive selection must remain explicit.
