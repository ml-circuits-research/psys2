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

## Facing

A drawn thing faces `left` or `right` (delivered 2026-11-20). `drawing.object.make`, `drawing.catalog.make` and `drawing.object.change` declare `facing` (closed list left, right) and `toward` (the code of an object on the page). `drawing.object.flip ids=` turns each listed object to the opposite side (`worlds/art.draw/native-interface.sop`).

- Storage: the key `art.draw.facing` on `w.drawing.object`. The catalog's `w.drawing` schema has no facing slot, so the art.draw rule files declare the slot under the area's own open key namespace (`core.namespace prefix=art.draw. open=true`). `worlds/sop-area-adapter.mjs` reads a carrier with every namespace and instance-type slot that an area's rule files declare. When a catalog bump adds `facing` to `w.drawing.object`, the key moves there.
- Effective facing (`render-projection.sop`, `ui.draw.facing`): the given facing, else the drawing's own (`ui.draw.natural drawing=<kind>`, declared for the hand-made drawings that look to one side: cat, dog and fish look left; bird, car and arrow look right). A drawing with no declared orientation is taken to face right (`ui.draw.natural default=true`). Every object is observed with input `facing`, so the effect check can verify `facing` and `flip`.
- Rendering: an object whose facing differs from its drawing's is mirrored about its own vertical middle by a signed horizontal scale (`ui.draw.boxscale sx<0`). This applies to its parts, its edited and reshaped parts, its looks (a person's face and figure, mirrored slots included) and its side faces. Its label and its ground shadow stay as they are. Part observation, part placement, part extraction and look placement map page x through the same signed scale. A part therefore keeps its page place on a mirrored object.
- Toward: an SOP rule compares the x of the two objects (for a new object, the requested or placed x). The thing faces right when the other object is to its right and left when it is to its left. At equal x the facing is unchanged. An unknown code is refused (`facing-target-not-on-page`). `toward` is a one-shot resolution, not a stored relation, so its argument stays unverified by observation.
- Not yet: the deployed reader (bindings `2794fa05…`) has no facing, flip or orientation key. Its `drawn.direction` is a move step. "facing left", "flip the car" and "facing the boy" in text therefore do not reach these parameters until the reader inventory gains a key that matches a parameter named `facing` (completion rule 1 of `src/dialog/declared-bindings.mjs`), or `toward`. The orientation of the imported catalog drawings (openmoji, mulberry) is not declared. They default to right.

`tests/drawing-facing.test.mjs` checks the stored and observed facing, the mirrored transforms, flip and toward, part placement on a mirrored object, and a mirrored catalog person.
