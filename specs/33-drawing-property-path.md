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

The first published profile uses library 0.192.0 and knowledge ef0a1b27. `scripts/build-new-engine-source.mjs` reconstructs a source World from pinned schemas and complete selected declaration families; the browser compiles that immutable source World once. Compiled grammar is not serialized, and live board state is not mixed into the grammar World. The application and training codec share the same library bundle and provenance hash.

`?engine=new` forwards an explicit option to the dialogue session and worker. It bypasses legacy readers and both worker fallback/retry routes. The default remains legacy. This first profile reads English imperative property changes, requiring one complete reading, one existing target, a bare or definite kind, and one positive required equality constraint. Other moods, selectors, logical structures, kinds without one live instance, unknown/ambiguous values, approximate-only values and unsupported properties produce no effect. It does not create an object to satisfy an existing-object request. Non-English input is explicitly declined by this initial profile; no untranslated input is interpreted as English.

The application composition declares the Drawing colour binding and joins a semantic value to the entire declared colour family by canonical name. Equivalent exact RGB facts can support one value; conflicting values do not select an arbitrary winner. The mapping witness retains binding ID, all matching knowledge identities and their pinned version. Before/after observations retain actual native tokens and source lifetime/version. Each turn has its own evidence World, preserving original source, lexical provenance and distinct request/trace identifiers. The published property assessor retains the immutable evidence definition and validates a `std.reply.property` claim. Reply wording comes from changed/unchanged native status, never from the step status alone.

Failed evidence construction rolls the board back before replying. Explicit invocation retries return the historical receipt without reapplying or asserting current success; the same identity with different text/area is refused. A separate new request for an already equal value gets fresh unchanged evidence and no additional undo entry. The session keeps the latest 128 journal records, including retained evidence snapshots, in normal memory serialization and undo snapshots; each reply also carries its own journal. Undo/restoration creates a fresh native observation lifetime when board state is replaced. This is a bounded session journal, not a durable global exactly-once service or proof of visual change.
