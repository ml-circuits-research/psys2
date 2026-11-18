# 33 — Observed Drawing property changes

## Compiling the request

Authored SOP and admitted reader proposals provide the same `std.request` graph to the capability compiler. An existing target can supply a positive equality selector separately from the desired property equality. The compiled result retains candidate observations, mapping support, the selected identity, and any remaining obligations.

The application execution policy joins the semantic concept `colour` to the observed binding `drawing.object.color` and native parameter `color`. The complete pinned colour family supplies exact RGB literals. Equivalent facts can support one value. Conflicting or approximate-only mappings leave the value unresolved. The compiler checks a selector against the versioned pre-state. For an explicit equality selector, Drawing's change mode requires one match and conclusive mismatches for the other eligible candidates. An unresolved stored value cannot prove equality or uniqueness. For requests without a selector, the compiler can use focus or recency and disclose the choice.

## Tool input and observed state

The interpreter in `worlds/art.draw/declared-host.mjs` receives the selected `std.capability.call` and its reachable typed arguments. Complete editor controls use the same interpreter. The application checks the selected live instance, version and source identity before invoking the concrete operation. The tool checks the invocation revision and its declared native arguments. Drawing's `drawing.object.change` takes explicit object IDs and an RGB literal or a null override. Knowledge labels are resolved upstream.

The canonical Drawing SOP world owns the resulting object state. Observation exposes detached stored slots with each object's identity, incarnation and observation version. A null or missing colour override has no stored value. Renderer defaults are separate from the stored property. A successful native change creates one undo record. An equal stored value yields an unchanged receipt and no extra undo record. A replay uses the historical receipt without applying the effect again. State and arguments must pass the shared native tool's bounded data validation.

## Effect evidence

The application observes the same selected object after the tool call and checks the native value against the compiled argument. The equality profile can retain a `std.reply.property` claim supported by the original request, the declared value mapping, and correlated `std.trace` records for the operation and before/after observations. The session journal keeps the latest 128 such records and Worlds can inspect them. A property claim describes the observed stored value. Appearance also depends on the renderer and the object's parts.

`tests/property-selection.test.mjs` checks exact selector outcomes, ambiguous or unknown observations, and detached invocation handling through the declared compiler. `tests/tool-sop-boundary-declared-host.test.mjs` checks actual SOP dispatch against canonical Drawing state, including the stored override, unchanged peers, stale invocation handling and Undo.
