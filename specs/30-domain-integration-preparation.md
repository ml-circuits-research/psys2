# Domain integration preparation

Status: preparation, not implemented behavior. Baseline: PSys2 `23e5a048`, reviewer instructions through `bd0c0115`; published library contract register through 0.177.0. This document does not authorize consuming proposed contract families. ADR-013 describes the actual shipped composition.

## Charts inside Diagram

| Existing boundary | Required integration |
|---|---|
| `worlds/data.charts/chart.mjs` stores chart identity, labels, datasets, presentation options, source wire IDs and a refresh recipe (`spec`). | Preserve series membership, numeric values and provenance when chart parts become diagram nodes. A rendered rectangle alone is not the observed value or its evidence. |
| `worlds/diagram.sketch/core.mjs` stores shapes, edges, groups, wholes, selection and revision; `tool.mjs` edits resolved shapes and links. | Extend the host data model through typed tool operations; do not route chart language to special host cases. Keep semantic quantity separate from the renderer's pixel height/position. |
| Chart labels and dataset labels are display strings, not guaranteed unique identities. Existing chart editing often addresses labels. | Allocate stable identities for projected series and points; duplicate labels and reordered points must remain distinguishable. Preserve identity across refresh, edits and undo according to an explicit mapping. |
| `docs/webchat/ui/tabs/charts.mjs` owns the chart renderer and effects; `diagram.mjs` renders the diagram state. | Render the projected nodes in the Diagram area, with a declared axis mapping and source links. Remove standalone registration only when create/change/read/export/undo work through the surviving area. Keep unsupported old chart kinds explicit until their semantics are implemented. |
| Existing chart refresh reads specific old worlds and its recipe. | Replace source-specific readers with declared projections and explicit input coverage. A count from an incomplete calendar observation cannot be presented as a complete count. |

The first integration should use an explicit snapshot projection with source identities and source observation version. Refresh is an explicit recomputation, not a silently live two-way relation. A user moving a bar changes its displayed position; it must not alter the underlying meeting count unless a separately declared editable mapping authorizes that effect. This is a proposed boundary for review, not a published projection contract.

Acceptance must include two series with the same display label, duplicate point labels, negative/zero values, an empty dataset, source deletion, reordered inputs, incomplete source coverage, an independent source edit during refresh, and undo after another diagram edit. The assertions must distinguish numerical facts, rendering coordinates and source links. Existing numerical queries and exports must either continue correctly or have their remaining unsupported cases recorded; a blank canvas or a hidden tab is not integration.

## Faces inside Drawing

| Existing boundary | Required integration |
|---|---|
| `worlds/ui.avatar/face.mjs` stores a catalog face: slots, variants, colours, adjustments, expression, preset and history. `facedraw.mjs` renders it from `k.faces`; this is the current renderer, not the older DiceBear path. | Reuse catalog-driven rendering as a kind of drawn object, owned by that drawing instance. Two faces must have independently identifiable parts and independent values. |
| `worlds/art.draw/engine.mjs` describes drawn objects with identity, position, size, colour, rotation, depth and a `parts` colour map. | Do not overwrite a colour map with a face's richer variant/geometry data. Add an explicit host representation for the rendered part payload and stable part ownership. Changing one face's eye must not change another face or the assistant's name. |
| `faceOf` creates/migrates/fills state; `toolView` calls it. | Separate state migration and initialization from read-only observation. Observing the scene must not manufacture a new face, rewrite a preset or consume history. |
| The input icon/popup and `avatar.animate` effects are hosted in `docs/webchat/ui/avatar.mjs` and `app.mjs`. | Move editing and object visibility to Drawing. Transient speaking/thinking motion is a view overlay, not a saved part mutation or undo step. Decide separately whether a status icon remains; it must not be a second editable face store. |
| `ui.avatar/own.mjs` also supplies the assistant's name to other worlds. | Separate assistant identity from a drawn person's name. Deleting the drawing must not erase the assistant identity or silently recreate the old popup state. |

Acceptance must include two faces from one preset, distinct edits to identically named parts, deletion/restoration of one face, a changed preset with absent parts, catalog refresh, scene save/restore, undo after an independent edit, and motion while an observation is taken. Observations must report persistent state only; rendering overlays must not appear as confirmed tool effects.

## Shared prerequisites and preview sequence

The phase-zero register explicitly says the full consumer gate is not released. At the audited version, source/request/target records and the validation hook exist, but complete request graphs, point/frame acceptance, typed trace/reply and observation/change contracts are unfinished. Existing `std.tool` bindings in this repository belong to the legacy path; similarly named book examples do not make them compatible with the new contracts.

| Dependency | Concrete consumer obligation |
|---|---|
| Point/frame and axis contracts | Diagram coordinates and face-part placement must state the frame and conversion. A pixel position is not a dimensionless conceptual point. |
| Request graph ownership and binding | Distinguish the second series' third point and one eye of a selected face without parsing those phrases in a host adapter. |
| Tool/observation and change records | Bind instance identity, state version, observation coverage, operation identity, confirmation and conditional undo. A restored old `rev` or face history counter must not validate a stale command from another lifetime. |
| Trace and reply evidence | Report what was observed and changed, including source versions for projection, rather than inferring completion from a successful renderer call. |

Independent host preparation can operate on fully resolved values and test actual state changes, as the calendar foundation does. It must not invent public wire schemas, replace structural validation with phrase matching, or claim an end-to-end new engine. Once the required published contracts are ready, the calendar is the first preview vertical slice requested by reviewer `bd0c0115`: reading, request, resolution, plan, tool, observation and evidenced reply. A preview URL and coverage metadata should appear with that working slice, not before it. Then a simple drawing request can establish the same boundary before face/chart composition is connected.

The old path remains the default until the reviewed English acceptance turns demonstrate no new wrong execution. Historical Map/Music retirement rows remain in the measurements per ADR-013. Exactly four functioning areas is an acceptance condition for the completed integration, not a claim of this preparation document.
