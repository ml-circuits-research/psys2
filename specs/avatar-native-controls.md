# Avatar composition editor

Avatar is the fifth permanent application tab, after Drawing, Diagram, Calendar and Documents. Its native state remains `ui.avatar`'s existing `state.face`; its canvas and sidebar inspector render that one state. The controls invoke declared native tools directly, and the application captures each mutation's readable command, exact typed SOP intent, receipt and independently observed effect. No legacy face-language parser is used by these controls.

## Knowledge and capabilities

`createAvatarHost({state,instanceId,knowledge,data})` uses the caller's loaded `k.faces` data (explicit data or `knowledge.peekFaces()`), with the existing bundled face as the offline fallback. `avatarCapabilities(data)` derives selectable presets, expressions, slots, variants and colours from that data. It does not introduce a copied vocabulary. Only presets whose constituent variants have drawable geometry, and only variants with drawable parts, are exposed. The bundled fallback therefore exposes the complete default preset and fewer variants until the knowledge catalog arrives.

The native adapter reuses `face.mjs` primitives: `wearPreset`, `putPart`, `setParts`, `takeOff`, `moveParts`, `undoStep`, `redoStep`. Size grades and move directions are exported from the existing primitive's accepted values. Knowledge is loaded by the application; the native store performs no network access or language reading.

## Tools and observation

| Operation | Typed arguments |
|---|---|
| `avatar.face.compose` | optional fixed `id=face`, catalog `characterKind` and/or composition `base`; explicit edits retained |
| `avatar.face.preset` | optional fixed `id=face`, a drawable declared `preset` |
| `avatar.face.expression` | optional fixed `id=face`, declared `expression` |
| `avatar.face.name` | optional fixed `id=face`, nonempty `name`, at most 40 characters |
| `avatar.part.add` | absent optional-part `id`, drawable `variant` of that exact slot |
| `avatar.part.change` | observed `ids`, optional `variant`, `colour`, accepted `size` grade |
| `avatar.part.feature` | observed `id`, catalog feature `property` and `value`; resolves a compatible actual variant |
| `avatar.part.move` | observed `ids`, accepted `place` direction |
| `avatar.part.remove` | observed `ids`; a required part cannot be removed |
| `avatar.observe`, `avatar.undo`, `avatar.redo` | no arguments |

Face observations have identity `face`, source type `ui.avatar.face`, and preset, expression and display-name values. Present parts have the slot id, source type `ui.avatar.part`, and variant, colour, size and place values exposed by the existing tool view. Identity/version/incarnation and atomic staging follow the shared native host. A rejected colour or variant never partially changes state. Undo/redo remains the existing face history, and the application can additionally record its cross-area undo unit.

## Composition interaction

Character kind, composition base and emotion are compact property controls. Whole-face preset galleries and expression chips are absent. A part selector and picture choices expose the catalog directly; colour, size, removal and directional moves act on the selected observed part. Mouse selection and keyboard arrow keys use the selected part identity. No UI action sends a manufactured sentence to a fallback reader. The generated human command appears in chat and its expected typed intent is retained for training/effect comparison by the application.

Shared role colours explicitly address every visible part in that role; the UI lists the scope and passes every affected id. Incomplete scopes refuse as `shared-colour-scope-required`. Raw part observations include `dx`, `dy`, `scale` and `tintRole`. Resize-related geometry scope is derived from the existing `neighbours` attachment calculation and declared as `effectScope.related` rows with conditional target membership, required `size` parameter, related id and `dx/dy/scale` keys. Secondary attachment movements remain unverified secondary conditions until their complete expected geometry is projected; they must not become false verified matches or unrelated-change mismatches.

Character kinds come from the catalog preset `kind` field. Composition changes replace uncustomized defaults while preserving explicitly edited variants/removals, role colours, paint, size grades and placement. Explicitness is stored in native state, with old states inferred once by comparison with their actual catalog base. The legacy preset replacement tool remains available for existing callers.

The knowledge world exports sparse `k.faces.expression_goal` facts (expression, slot, property, value). Emotion resolution selects drawable constituent variants satisfying each slot's goals, preserving a current compatible variant; there is no runtime branch by emotion name. A happy face can retain either a closed or open smiling mouth. Poses and motion keep their separate compatibility fields. Resolved expression variants are stored and observed as the same variants the renderer uses. Unknown/unavailable combinations refuse atomically. Feature selectors expose actual variant features and invoke the same typed primitive, while current feature values remain visible.
