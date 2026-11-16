# 33 — Observed Drawing property changes

## Native host boundary

`worlds/art.draw/property-host.mjs` prepares the Drawing side of the opt-in request path. It does not read sentences, resolve knowledge, activate a preview, or assert request success. The legacy dialogue remains the default; the opt-in coordinator described below uses this host.

The declared binding `art.draw.object.colour` maps the open semantic concept `colour` to native key `color`, source type `art.draw.object`, format `rgb`. Colour names and RGB facts belong to the knowledge repository. The caller must resolve a unique exact RGB value, retaining its knowledge provenance; approximate `rgb_about` is insufficient. The native primitive accepts canonical lowercase `#rrggbb`, never a colour word. There is no per-colour table or sentence dispatch.

## Truthful observations

An observation covers the complete current collection of selectable board objects: `state.objects` excluding tagged decorations. It is not completeness over sky, scenes, parts, or every rendered pixel. Each object retains its actual ID and native kind mapping. Duplicate identities, malformed state, executable accessors, symbol keys/values, non-enumerable fields (except array length), cycles and excessive state size/depth are refused.

Each declared native slot is emitted as concrete quoted SOP tokens. Missing/null colour override is `[]`; an existing string is its exact quoted token. No inherited/default colour is invented. Thus changing a stored name to an equivalent RGB is a native-state change, not proof of a visible difference.

A caller supplies a fresh `instanceId` for each host lifetime, including recreation after a session restore. Source identity includes this lifetime and the object ID. Versions count observed state revisions, including detected external edits; they are not a durable event log and cannot establish that no unobserved ABA change occurred. Snapshots are detached copies. Observing never initializes or repairs board state.

## Mutation and undo

`setProperty({invocation, expectedVersion, target, concept, value})` compares the current observed version immediately before synchronous mutation. Unknown targets/properties, stale versions, malformed values and immutable state return a refusal without changes. A successful change stages a clone and the legacy-compatible undo record before replacing the affected board fields. Unrelated fields remain intact; one request creates one undo entry. An equal native value is unchanged and adds no undo entry.

An invocation can replay its historical receipt with `replayed: true`; a different payload using that ID is refused. Replay does not reapply an effect, and its receipt is not current observation evidence. Receipts are bounded to 10,000 per host lifetime. State traversal is limited to 100,000 visited values, depth 48, 10,000 objects and four million serialized code units by default. Excessive data is rejected rather than truncated.

## Integration contract

The coordinator must preserve original request provenance and the semantic-to-native mapping witness, observe before and after independently, and construct correlated `std.trace` input/step/observation records. Native success claims require the published library assessor, including matching request, invocation, source, type, key and exact expected token list. Reader or operation status alone cannot support a success reply. The `?engine=new` switch must bypass legacy readers and fallback retries, while unsupported or ambiguous requests leave state unchanged. The native module remains independent of parsing and reply generation; the first integrated profile is described below.

## First opt-in integration

The current first-path profile uses library 0.194.0 and knowledge ef0a1b27. `scripts/build-new-engine-source.mjs` reconstructs a source World from pinned schemas and complete selected declaration families; the browser compiles that immutable source World once. Compiled grammar is not serialized, and live board state is not mixed into the grammar World. The application and training codec share the same library bundle and provenance hash.

`?engine=new` forwards an explicit option to the dialogue session and worker. It bypasses legacy readers and both worker fallback/retry routes. The default remains legacy. This first profile reads English imperative property changes, requiring one complete reading, one existing target, a bare or definite kind, and one positive required equality constraint. Other moods, unread selectors, logical structures, kinds without one live instance, unknown/ambiguous values, approximate-only values and unsupported properties produce no effect. It does not create an object to satisfy an existing-object request. Non-English input is explicitly declined by this initial profile; no untranslated input is interpreted as English.

The application composition declares the Drawing colour binding and joins a semantic value to the entire declared colour family by canonical name. Equivalent exact RGB facts can support one value; conflicting values do not select an arbitrary winner. The mapping witness retains binding ID, all matching knowledge identities and their pinned version. Before/after observations retain actual native tokens and source lifetime/version. Each turn has its own evidence World, preserving original source, lexical provenance and distinct request/trace identifiers. The published property assessor retains the immutable evidence definition and validates a `std.reply.property` claim. Reply wording comes from changed/unchanged native status, never from the step status alone.

Failed evidence construction rolls the board back before replying. Explicit invocation retries return the historical receipt without reapplying or asserting current success; the same identity with different text/area is refused. A separate new request for an already equal value gets fresh unchanged evidence and no additional undo entry. The session keeps the latest 128 journal records, including retained evidence snapshots, in normal memory serialization and undo snapshots; each reply also carries its own journal. Undo/restoration creates a fresh native observation lifetime when board state is replaced. This is a bounded session journal, not a durable global exactly-once service or proof of visual change.

## Explicit generic-serializer profile

The 0.193 adoption supplies `PROPERTY_CHANGE_REQUEST_PROFILE` through the pinned compatibility overlay options. The snapshot builder reads both overlay and profile from that exact library commit, records both source hashes, and materializes the declarative profile without changing its mappings. The generic serializer receives this profile explicitly; the host does not rely on an implicit property-change conversion. Evidence is retained as generic `nodes` entries with graph identity, source identity and Unicode ranges. Existing request wires, native resolution, refusals, observations, claims and UI behavior stay unchanged. This adoption adds no construction and no effective/default-value inference.

The corrected profile is pinned at library commit `7587ce7acff92e0613dd0e4cec4db37aed23d986` (unchanged 0.193 runtime bundle). Provider names use string-valued graph tokens for both single-word and multiword names. This restores all 171 declared colour readings: 141 exact-value executions and 30 unresolved-value refusals match 0.192. The 83 formerly bare single-word tokens become quoted strings intentionally; decoded names and source ranges are unchanged. The host resolves declared names through `str`, while traces and the label codec preserve their actual token representation.

## Detached equality-selector preparation

The application now pins library 0.194.0 (`cabeaa6700a60d0f0aa1ba74ecafcd3b19cfc5a8`) to use its published `projectTemplates` equality guards. The reader profile and knowledge pin are unchanged. The existing English overlay still does **not** read selector-bearing phrases; this increment prepares execution of independently supplied, structurally validated request graphs through `executeRequestCandidate`.

An admitted graph has one existing target, a distinct required positive equality result at `request.root`, and optionally one assumed positive equality at `target.selector`. Both constraints address that target; selector/result overlap, logical combinations, unsupported operators/characters and unhandled attributes are refused. Result and selector concepts resolve independently through the application's property bindings. The shipped Drawing binding remains colour only; the selection module itself uses arbitrary declared bindings and exact kind identities, without inferring kind inheritance or importing English vocabulary.

The selector is evaluated against the complete pre-operation observation, never against the desired post-state. Each same-kind candidate retains its identity, original native input, observed version, normalized token array and expected token array. The expected value retains every supporting exact knowledge fact and binding identity. Canonical arrays are compared by the library's equality guard; the host does not implement a second predicate language. Indexed `guard-rejected` means a known mismatch. An absent/null slot, unresolved native stored name, missing/duplicate/incompatible input, or interrupted guard evaluation remains unknown. One match plus another unknown cannot prove uniqueness and causes no effect. Missing values are not renderer defaults. Exact native RGB spelling normalization is declared by the area; no approximate RGB fact is used.

A successful selection retains the complete considered-candidate list, observation coverage/version, mapping and library evaluation in the detached journal. Only one proved match with no unknown candidates proceeds through the existing stale-version mutation and native property assessor. This does not expand that assessor into a claim about visual appearance or full semantic truth. Detached graph invocation replay checks graph identity as well as text/area; historical receipts never produce fresh success claims.
