# Typed UI controls as expected intent and training pairs

Every UI gesture invoking a declared native operation can be captured before execution by `describeNativeControl({operation,args,before,parameterBindings})`. It returns a readable command, typed SOP Lang wires, exact provided and defaulted arguments, and observed identity/source/version evidence. No model or surface parser participates. The output is an expected intent supplied by the UI, not a prediction of what the reader understood.

## Representation

`NATIVE_CONTROL_INTENT_SCHEMA` declares the application types `app.control.source`, `app.control.intent`, `app.control.argument`, `app.control.value` and `app.control.target`. The graph names the exact declared operation, its general act and owning source type, mood `do`, source text and baseline observation. Arguments retain their declared parameter names and JSON scalar types. Arrays retain explicit member indices; objects retain named members, nesting, nulls, empty arrays and exact strings. A value matching an observed object id also retains that object's source as identity evidence. Such equality is evidence of identity correspondence, not a guessed semantic role.

Readable text uses general act verbs and labels derived from declarations and actual parameters. It contains every non-target argument. Edits identify the exact selected ids and may include their observed display names. Source ranges count Unicode scalars and identify the rendered parameter values. The original provided arguments remain separate from defaults admitted by `validateNativeArguments`. Invalid UI arguments remain captured with `validArguments=false`; they are not relabeled as accepted training positives.

Generated identity fields are retained in wires and expected arguments but omitted from human commands. Edits prefer an observed display name over an internal id. Optional declaration metadata `intent.subject` and `intent.parameters.<parameter>.label` supply human wording; `format:unix-ms` and `format:duration-ms` explicitly render typed times and durations. `reference:true` permits an observed display label for an identity argument. Literal strings are never replaced merely because they equal an existing id. Source ranges record their origin (`text`, observed identity label or declared formatting); a generated id is never falsely attributed to the textual source.

These application wires are deliberately named `app.control.intent`, not `std.request`. Lists, nested document blocks, datasets and typed references cannot be faithfully reduced to scalar `std.request.constraint operator=eq` without further contracts. The exact typed interpreter `readNativeIntent` decodes these wires back into the declared operation and arguments. UI controls check the round trip, then submit the SOP text to shared native dispatch. Interpreted requests submit their exact tool intent through the same boundary. Dispatch reads the operation and arguments from the SOP against the receiving host’s current declarations, checks the observed instance version, and records the SOP and the actual tool receipt. This is separate from a neural prediction: text-only reader evaluation must still measure its own predicted graph and arguments.

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

## Placement compiled from live editor geometry

An admitted modern `std.request` relation can go to the shared `World.compileRequest` boundary. The adapter supplies the pinned `k.spatial2d` schema and policies, the authored project objective, observed native geometry, identity bindings and typed tool capabilities. The compiler receives the request SOP and a context wire referencing the scoped observation. It returns a concrete SOP operation and the revision, candidate costs, relation measurements and selected hypothesis. The same exact tool decoder handles these operations and manual UI controls. Unsupported relations and unbound native operations return an unresolved result.

Drawing uses its fixed canvas and current object bounds, including groups and their members. Diagram uses live renderer dimensions, group unions and visible routed endpoints in an expandable coordinate space. An undrawn endpoint retains its logical owner and has no point observation. Avatar reports the visible slot bounds and its native resize attachments. These bounds and attachments come from the native state authority and carry the instance, frame and observation revision. An unknown independent peer stops placement because it has no measured cost.

For a new object, the tool interface measures the concrete construction's footprint with its native renderer and declared arguments before the compiler selects a position. The current placement circuit supports a single subject and a single anchor. Drawing and Diagram use the shared objective for peer clearance, while group members and edge endpoints retain their distinct relations. The native adapter checks the observation revision and exact call at dispatch. The application's existing history records the mutation and Undo restores the prior state. Worlds records the evaluated policy, participants, alternatives, selected cost, concrete operation and its observed geometry.

### Authored request input

A chat message starting with a standard request declaration may contain one owned request circuit, on one line or several. Enter submits it and Shift+Enter inserts a line. The input uses the standard request schema and the normal execution and undo paths. An authored turn records its supplied request and actual execution evidence. Language inference is unnecessary. Given a house in the Drawing instance, the request can identify a new fish, the existing house and the positive relation `near`; the compiler reads the current house bounds when the turn runs. The regression `tests/authored-request-declared-host.test.mjs` supplies the complete pasteable circuit and executes it twice with no reader attached.

The inspector can show an observed component produced by a tool alongside authoritative instance objects. A tool declares the observation-only types it can produce. An owned fact with the same identity takes precedence and must match the interface type. The object panel identifies the source of the inspected fact.


## Compiled Undo and Redo

The active editor contributes observed journal heads to the history policy in `worlds/app.project/history-policy.sop`. An admitted reader graph or an authored targetless request can compile to an `app.history.restore` wire with an exact view, direction and head identity. Undo and Redo controls use the same compilation and interpreter.

The journal tool consumes the selected SOP call, checks its invocation revision and current content, and restores the saved editor state with the current view preferences. It verifies the restored content before moving the entry to the other journal stack. A reverse move assigns a fresh head identity, so an earlier call cannot run against an entry that left and reentered the stack. History does not record another undo group for the restoration. Independent edits in a composed turn share one group when the turn makes no journal moves.

Worlds attaches the compiler result to the history policy and shows the exact call and typed outcome at the journal interpreter. A stale call or conflicting editor content yields a refusal before mutation.

## Grounded creation requirements

Creation resolution supplies exact Unicode source spans, declared property mappings and the selected constructor’s parameters to the creation policy. The policy identifies lexical kind evidence and classifies grounded requirements as consumed, bound to a name, bound to a property, or unapplied. A coextensive role is consumed only when its support matches the chosen kind span. A naming parameter used to load catalog knowledge is distinct from a parameter that stores a name. Remaining grounded requirements are disclosed in the response.

The page encodes each editor gesture against its declared tool interface. The worker receives the view and SOP text, resolves the live declaration and forwards the exact instruction to the tool. The training pair and the chat expose that same instruction. A history gesture supplies a request whose compilation binds the current journal head.
## Continuation between request cuts

The source reader yields independently validated cuts sequentially so each reading can observe earlier effects. After a supported or unresolved cut, the request composition world derives whether to advance or stop. The default advances after an unresolved cut. An authored stop policy leaves later cuts unread and unapplied. Its reply identifies those spans and preserves the verified changes in the turn’s Undo group.

Chat attaches the high-level SOP query to its input and the exact dispatched executable circuit to its answer. A compound request labels each step. Read-only queries show their answer circuit. Compiler selection evidence, alternatives and explanations belong to the recorded activity in Worlds. Editors render the committed projection for each changed world after a chat turn.
## Scoped removal

A definite existing-object mention can match an exact declared kind in the current editor. When the reader's kind head has no span, the projection requires the name and description spans to coincide and match the whole phrase. The imported language world supplies available articles. The original reader failures remain in the reply trace.

An uncalibrated removal can proceed when the compiler selects a current observed identity and binds that identity as the only target of a concrete remove call. The interpreter observes the result and checks that the selected object disappeared and its peers remain. Ambiguous matches retain the chosen identity and alternates. Undo restores the removed object. Bulk clears and other actions still use their separate admission policy.
