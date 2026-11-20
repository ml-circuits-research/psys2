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

A drawn thing faces `left` or `right`, and facing works through one mechanism: the horizontal mirror of `w.drawing.object` (`mirror`: none, horizontal, vertical, both; `specs/drawing-transforms-text-effects.md`). `style-projection.sop` draws the mirror about the object's centre, and the renderer applies only that mirror. `drawing.object.make`, `drawing.catalog.make` and `drawing.object.change` declare `facing` (closed list left, right) and `toward` (the code of an object on the page) (`worlds/art.draw/native-interface.sop`). Flipping is `drawing.object.change mirror=horizontal`.

- Derived facing (`render-projection.sop`, `ui.draw.facing`): the side the drawing faces (`ui.draw.natural drawing=<kind>`), or the other side when the mirror is horizontal or both. Natural facing is declared for the hand-made drawings that look to one side: cat, dog and fish look left; bird, car and arrow look right. A drawing with no declared orientation is taken to face right (`ui.draw.natural default=true`). Every object is observed with input `facing`, so the effect check verifies `facing`. No facing is stored apart from the mirror.
- Setting a side (`act-rules.sop`):
  - A new object whose requested side differs from its kind's natural facing is made with `mirror=horizontal`.
  - A changed object that faces the other way takes the horizontal mirror step of `style-rules.sop`, so a vertical mirror is kept.
  - A request for the side the object already faces is unchanged.
- Toward: an SOP rule compares the x of the two objects (for a new object, the requested or placed x) and gives the side. At equal x the facing is unchanged. An unknown code is refused (`facing-target-not-on-page`). `toward` is a one-shot resolution, not a stored relation, so its argument stays unverified by observation.
- Parts of a horizontally mirrored object: part observation, part placement, part extraction and look placement map page x through the signed page scale (`ui.draw.pagescale`). A part therefore keeps its page place.
- Not yet:
  - The natural facing belongs in knowledge (a `k.objects.object` facing slot in the catalog). Until then it is declared in art.draw.
  - The orientation of the imported catalog drawings (openmoji, mulberry) is undeclared, so they default to right.
  - The deployed reader (bindings `2794fa05…`) has no facing key. The official dataset now declares `drawing.drawn.facing` (7326d3a0), and a retrained reader binds it to the parameter `facing` by name.
  - The label and the side faces follow the object's pose, so a mirrored label reads backwards.

`tests/drawing-facing.test.mjs` checks the derived and observed facing, that only the mirror is stored, the pose transforms, change, flip and toward, a kept vertical mirror, part placement on a mirrored object, and a mirrored catalog person.
