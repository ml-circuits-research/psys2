# UI parity after the move to generic SOP areas

Purpose: the Avatar, Drawing, Diagram, Documents and Calendar tabs were rebuilt on generic SOP areas (commits `75e94269`, `9381a3d4`, `de0645ea`, `d4918747`, `fb3166cd`). The migration replaced the old hand-written tab UIs with a generic inspector and lost most of their controls. Owner decision (2026-11-20): the UI should not have changed; what changes is how requests are resolved. Each tab's original UI is restored from history with the same look and interactions, and adapted to the new back end: it reads state only from the SOP area projection (`projectSopArea`: objects, observed inputs `inputs`, boxes, options, frame, SVG) and sends every action as the tab's declared native command through the chat route (`host.tool`), so undo, journal, verification and training coverage stay consistent. Domain values (placement, sizes, colours, layouts) come from the SOP rules; the UI only presents them and sends commands. This file is the restoration checklist: one row per old control, with the selection state in which it was shown, the exact native operation and arguments it sent through `host.tool(operation, args)`, the new declaration or gesture that replaces it, and its status. Every restored control is also a training case: the gesture and the native call it produces are a paired example for the reader (the same operation and arguments a spoken request must produce).

Sources (read from history only): Avatar `75e94269~1:docs/webchat/ui/avatar.mjs` (editor mode, mounted by `ui/tabs/avatar.mjs`); Drawing `9381a3d4~1:docs/webchat/ui/tabs/draw.mjs` (`draw/render.mjs` only paints); Diagram `de0645ea~1:docs/webchat/ui/tabs/diagram.mjs` plus `e2369fa4~1:docs/webchat/ui/tabs/diagram/groups.mjs` (the group panel; deleted one commit before the diagram move); Documents `d4918747~1:docs/webchat/ui/tabs/editor.mjs` (the files `tabs/editor/toolbar.mjs`, `tabs/editor/view.mjs` and `ui/editor.mjs` existed at that commit but were not imported by the tab plugin, so they are not listed); Calendar `fb3166cd~1:docs/webchat/ui/tabs/calendar.mjs`.

Conventions: "local only" means no native call (view state, download, splitter). `undo`/`redo` written bare were sent bare, not with a world prefix. In the Documents tab, `*.x` means `document.section.x` when the selected block is a heading of level 1 or 2 and `document.block.x` otherwise. Coordinates are in the area's logical units (Drawing: 1000 x 700 page; Diagram: SVG user units). Every tab also had the inspector splitter (`pane-splitter.mjs`: drag, arrow keys, double-click reset; local only, width persisted per tab).

## Avatar

| Old control | Shown when | Operation and arguments | New declaration / gesture | Status |
| --- | --- | --- | --- | --- |
| Click a part in the preview | always | `avatar.part.select {id: slot}` | click `[data-avatar-slot]` in the projection SVG -> `avatar.part.select {id}` | restored |
| Click the face outside any part | always | `avatar.face.select {id: 'face'}` | click empty face area -> `avatar.face.select {id:'face'}` | restored |
| Corner resize handles (nw, ne, sw, se) drag; scale = start scale x distance-from-centre ratio, clamped to capability min/max; live preview local; sent on pointer up if changed | part or whole face selected | part: `avatar.part.resize {ids: [slot], scale}`; face: `avatar.face.resize {id: 'face', scale}` | selection overlay from projection boxes; drag -> `avatar.part.resize {ids, scale}` / `avatar.face.resize`, limits from `host.tools()` | restored |
| Arrow keys on a focused resize handle (Up/Right +0.01, Down/Left -0.01; Shift x10) | part or face selected | same as resize handles | same, on the overlay handles | restored |
| Arrow keys on the preview | part selected (not face) | `avatar.part.move {ids: [slot], place: left/right/up/down}` | `avatar.part.move {ids, place}` | restored |
| Delete or Backspace on the preview | part selected (not face) | `avatar.parts.remove {ids: [slot]}` | `avatar.parts.remove {ids}` | restored |
| Select "Character kind" | always | `avatar.face.compose {characterKind}` | `avatar.face.compose {characterKind}`: act rule `choose.kind` keeps a base of that kind (nothing changes), else composes the first preset of the kind in the catalog's sequence (`core.select=first`); a named `base` wins | restored (explicit part edits are not carried over to the new base, see Still missing) |
| Select "Composition base" (presets of the current kind) | always | `avatar.face.compose {base}` | `avatar.face.compose {base}`, list from host.tools enum, filtered by the observed `app.observe.input id=preset key=<preset> value=<kind>` (rule `observe.preset.kind`) | restored |
| Select "Emotion" (Neutral, emotions, current legacy pose) | always | `avatar.face.expression {expression}` (`''` for Neutral) | `avatar.face.expression {expression}`; expression chips now shown too | improved |
| Select "Selection" (Choose an object, Whole avatar, slots with variants) | always | Whole avatar: `avatar.face.select {id: 'face'}`; slot: `avatar.part.select {id: slot}`; none: `avatar.part.select {id: null}` | `avatar.face.select` / `avatar.part.select {id or null}` | restored |
| "Object ID" readout | always | local only (shows selected id or "none") | from `state.selected` | restored |
| Button "Identify IDs" | always | `avatar.ids.show {mode: 'temporary'}` | `avatar.ids.show {mode:'temporary'}` (declared duration) | restored |
| Checkbox "Always show IDs" | always | `avatar.ids.show {mode: 'always' or 'off'}` | `avatar.ids.show {mode:'always'|'off'}` | restored |
| Number "Scale" (min/max from capabilities, out-of-range rejected locally) | part or face selected | part: `avatar.part.resize {ids: [slot], scale}`; face: `avatar.face.resize {id: 'face', scale}` | same commands as the handles; whole-avatar zoom is a view key | restored |
| Button "Clear avatar" | always | `avatar.clear {ids: [every slot with a variant other than none, incl. expression parts]}` | `avatar.clear {ids: present parts from the projection}` | restored |
| Button "Recompose" | always | `avatar.face.preset {preset: current base}` | `avatar.face.preset {preset: base}` | restored |
| Button "Undo" | always | `avatar.undo {}` | `avatar.undo {}` | restored |
| Select "Feature <property>" (one per feature property of the slot) | part selected; disabled if the part is absent | `avatar.part.feature {id: slot, property, value}` | `avatar.part.feature {id, property, value}`; options from the observed `features.<prop>` inputs (values the slot's variants offer, `ui.avatar.feature` over shape, size, length, feel, age, kind), current values from `feature.<prop>`; enums `avatar.features`/`avatar.featureValues` from the same facts. Rules `feature.change`/`feature.add`: a part that has the feature keeps its variant, else the first variant of its slot and style with it; an absent part is added; none: `unavailable-feature-combination` | restored |
| "Current features" / "Colour affects" / "Resizing also adjusts the attached parts" notes | part selected | local only (from `avatarColourScope`, `avatarResizeScope`) | observed `feature.<prop>` and `colourScope` (every shown part with a shape of the face colour the part's tint sets, `ui.avatar.tone`; an untinted part: itself); `resizeRelated` is not observed | restored (features, colour); resizing note needs a rule, see Still missing |
| Select "<colour role> colour" or "Part colour" | part selected; disabled if absent or no colours | `avatar.part.change {ids: avatarColourScope(slot, colour), colour}` | `avatar.part.change {ids: [slot], colour}` (the tint rule sets the face colour, which reaches the whole scope); label from observed `colourRole`, list from observed `colours` (the catalog colours of the tint, or the colours an untinted part's shapes offer) | restored |
| Select "Size preset" | part selected; disabled if absent | `avatar.part.change {ids: [slot], size}` | `avatar.part.change {ids, size}` | restored (verification reports a mismatch: preset name vs observed scale) |
| Buttons arrows (Move <part> left/up/down/right) | part selected; disabled if absent | `avatar.part.move {ids: [slot], place: direction}` | `avatar.part.move {ids, place}` | restored |
| Button "Delete selected part" | part selected; disabled if absent | `avatar.parts.remove {ids: [slot]}` | `avatar.parts.remove {ids}` | restored |
| Disclosure "Words for <part>" (label and aliases) | part selected | local only | slot name and the observed `word` inputs (catalog `core.word` facts meaning the slot name, rule `observe.word`) | restored |
| Variant card "Remove" | part selected and slot optional | `avatar.parts.remove {ids: [slot]}` | `avatar.parts.remove {ids}`, shown when the observed `optional` input is true (`k.faces.slot optional=true`) | restored |
| Variant cards (pictures of each variant) | part selected | part present: `avatar.part.change {ids: [slot], variant}`; absent: `avatar.part.add {id: slot, variant}` | `avatar.part.change {ids, variant}` / `avatar.part.add {id, variant}` | restored; only the current variant has a thumbnail (others need a per-variant preview projection) |
| ID labels over the preview | `idDisplay` always, or temporary until expiry | local only (display of state) | from view key ids and projection boxes | restored |

New: a Length select (`avatar.part.change {ids, length}`) from the change command's declared enum. Dropped: motion (`emit`/`setSpeaking`), the motion engine was deleted and needs a SOP motion projection. Not shown in the old editor mode: the expression chips and the faces row (built but never attached); their phrases (`presetSay`, `expressionSay`, `variantSay`) were used only by tests.

## Drawing

| Old control | Shown when | Operation and arguments | New declaration / gesture | Status |
| --- | --- | --- | --- | --- |
| Button "Add" (opens the add chooser at the page centre 500, 350) | always (enabled after libraries load) | local only | opens the chooser (rough.js page) | restored |
| Chooser: one button per shape kind (enum of `drawing.object.make.kind`) | chooser open | `drawing.object.make {kind, x, y}` (chooser point) | `drawing.object.make {kind,x,y}`, kinds from host.tools enum (fallback observed `options.kind`) | restored |
| Chooser: search "Find a word in knowledge" with suggestions (words of `k.objects`, `k.people`, `k.scenes` from `vocab.json`) | chooser open | local only | suggestions from k.objects words (the names `drawing.catalog.make` can make) | improved |
| Chooser: "Add from knowledge" button or Enter in the search | chooser open | `drawing.catalog.make {name, x, y}` | `drawing.catalog.make {name,x,y}` | restored |
| Chooser: "Cancel" or Escape | chooser open | local only | local | restored |
| Toggle "Select multiple" (taps toggle membership) | always | local only (mode) | local mode; sends `drawing.objects.select {ids}` | restored |
| Button "Undo"; Ctrl/Cmd+Z on the canvas | always | `undo {}` | `drawing.undo {}` | restored |
| Button "Redo"; Ctrl/Cmd+Shift+Z on the canvas | enabled if `drawing.redo` is declared | `drawing.redo {}` | `drawing.redo {}` | restored |
| Button "Clear drawing" | always | `drawing.page.clear {}` | `drawing.page.clear {}` | restored |
| Buttons "Save PNG", "Save SVG" | always | local only (download; also effect `draw.download`) | rough canvas PNG (2x) / rough SVG; `draw.download` effect kept | restored |
| Button "Identify IDs" | always | `drawing.ids.show {mode: 'temporary'}` | `drawing.ids.show {mode:'temporary'}` | restored |
| Checkbox "Show IDs" | always | `drawing.ids.show {mode: 'always' or 'off'}` | `drawing.ids.show {mode}` | restored |
| Click or tap an object | always | `drawing.object.select {id}`; inside the selected part: `drawing.part.select {id, index}` | `drawing.object.select {id}` (a group member selects its group); inside the selected part `drawing.part.select` | restored |
| Ctrl/Cmd/Shift-click, or tap in "Select multiple" mode | always | `drawing.objects.select {ids: selection with id toggled}` | `drawing.objects.select {ids}`; multi-selection kept in the UI; touch long-press also toggles | improved |
| Drag an object (threshold 3 px mouse, 8 px touch); live preview local | always | `drawing.objects.transform {ids: selection if it contains the object else [id], x, y, width, height}` (bounds translated) | one: `drawing.object.place {ids,x,y}`; several or a group: `drawing.objects.transform` (new SOP rule fits the combined box) | restored |
| Drag inside the selected part | part selected | `drawing.part.place {id, index, x, y}` | `drawing.part.place {id,index,x,y}` (new SOP rule: offsets stored on w.drawing.part) | restored |
| Resize handles (8: nw, n, ne, e, se, s, sw, w) on the selection bounds | 1+ selected, no part selected | `drawing.objects.transform {ids, x, y, width, height}` (new bounds, min 1) | `drawing.objects.transform {ids,x,y,width,height}` (new SOP rule) | restored |
| Box select: drag on empty space (a click on empty space is an empty box) | always | `drawing.objects.select {ids: objects fully inside}`; with modifier or multi mode: union with current selection | marquee -> `drawing.objects.select {ids}` from projection boxes | restored |
| Double-click an object | always | `drawing.object.select {id}`, then focus Label | select, then focus Label | restored |
| Double-click empty space (opens the chooser at the point) | always | local; then chooser rows with that `x, y` | chooser at the point | restored |
| Arrow keys (step 2, Shift 20) | 1+ selected | `drawing.objects.transform {ids, x: x0+dx, y: y0+dy, width, height}`; part selected: `drawing.part.place {id, index, x, y}` | place / transform | restored |
| Delete key (Backspace not handled) | 1+ selected | `drawing.object.remove {ids}`; part selected: `drawing.part.remove {id, index}` | `drawing.object.remove {ids}` or `drawing.part.remove`; Backspace too | improved |
| Enter key (focus Label) | object selected | local only | local | restored |
| Escape key | always | closes chooser; `drawing.object.select {id: null}` | `drawing.object.select {id:null}` | restored |
| Second finger down; pointer cancel | during a gesture | local only (drag or box aborted, nothing sent) | touchcancel and pinch change nothing | restored |
| "ObjectID" readout (read-only input) | one selected | local only | from the selection | restored |
| Text "Label" (Enter returns to canvas) | one selected | `drawing.object.change {ids: [id], label}` | `drawing.object.change {ids,label}` | restored |
| Number "Size" | one selected | `drawing.object.change {ids, size}` | `drawing.object.change {ids,size}` | restored |
| Number "Width" / "Height" | 1+ selected | one: `drawing.object.change {ids, width}` or `{ids, height}`; 2+: `drawing.objects.transform {ids, x: x0, y: y0, width, height}` | one: `drawing.object.change`; several: `drawing.objects.transform` | restored |
| Colour input "Colour" | 1+ selected | `drawing.object.change {ids, color: '#rrggbb'}` | `drawing.object.change {ids,color}`; current value from observed `fill` | restored |
| Select "Named colour" (Original colours, Custom (disabled), colour names) | 1+ selected | `drawing.object.change {ids, color: hex of name, or null for Original}` | `drawing.object.change {ids,color}`, names from observed `options.colour` (k.colours) | restored, except "Original colours": `color:null` is sent but needs a SOP rule to clear a stored value (compile drops null arguments; std.acts has no unset) |
| Button "Delete selection" | 1+ selected | `drawing.object.remove {ids}` | `drawing.object.remove {ids}` | restored |
| Select "Group member" (members, or back to the parent group) | one selected that is a group or a group member | `drawing.object.select {id: member or group}` | `drawing.object.select` on the member or its group | restored |
| Select "Object part" (Whole object, "n. role · primitive") | one selected | Whole: `drawing.object.select {id}`; part: `drawing.part.select {id, index}` | `drawing.part.select {id,index}` from observed parts | restored |
| Numbers "Part X" / "Part Y" | part selected | `drawing.part.place {id, index, x, y}` | `drawing.part.place` (observed part x/y) | restored |
| Numbers "Part width" / "Part height" | part selected | `drawing.part.change {id, index, width}` or `{id, index, height}` | `drawing.part.change {width|height}` (new SOP rule, was refused) | restored |
| Colour input "Part colour" | part selected | `drawing.part.change {id, index, color}` | `drawing.part.change {color}` | restored |
| Button "Extract part" | part selected | `drawing.part.extract {id, index}` | `drawing.part.extract` (new SOP rule for rectangle/square/circle/oval/triangle parts; polygon and line parts refused `part-extract-shape-not-declared`) | restored |
| Button "Delete part" | part selected | `drawing.part.remove {id, index}` | `drawing.part.remove` | restored |
| Text "Group label" | 2+ selected | local only (used by Group objects) | local | restored |
| Button "Group objects" | 2+ selected | `drawing.object.group {ids, name: label or 'Group', label}` | `drawing.object.group {ids,name,label}` (the group is selected) | restored |
| Button "Ungroup" | one selected with members or more than one part | `drawing.object.ungroup {id}` | `drawing.object.ungroup {id}` for groups | restored for groups; taking apart a single multi-part object is dropped: needs a take-apart SOP rule |
| ID labels over objects | `idDisplay` always, or temporary until expiry | local only (display of state) | drawn on the canvas from view key ids and boxes | restored |

## Diagram

| Old control | Shown when | Operation and arguments | New declaration / gesture | Status |
| --- | --- | --- | --- | --- |
| Button "Add node" (toggles the node chooser) | always | local only | toggles the chooser | restored |
| Chooser: text "Optional label or text" | chooser open | local only (label of the new node) | label sent with make | restored |
| Chooser: shape buttons (rectangle, circle, ellipse, square, diamond, triangle, hexagon, star, text) | chooser open | opened by double-click: `diagram.node.make {kind, x, y, label?}` at that point; opened by button: enters add mode | shapes from host.tools enum of `diagram.node.make.kind` | restored |
| Add mode: tap or click the canvas | after choosing a shape | `diagram.node.make {kind, x, y, label?}`, then back to select mode | `diagram.node.make {kind,x,y,label?}` | restored |
| Chooser: "Cancel" | chooser open | local only | local | restored |
| Toggle "Select multiple" | always | local only (mode) | mode; `diagram.node.select {ids, edges}` | restored |
| Toggle "Connect": tap source node, then destination node | always | source: `diagram.node.select {ids: [from]}`; destination: `diagram.link.make {from, to}` | `diagram.link.make {from,to}`; new: drag from a node's connect handle onto another node | improved |
| Button "Clear diagram" | always | `diagram.page.clear {}` | `diagram.page.clear {}` | restored |
| Button "Chart" (opens the numeric group draft) | always | local only | numeric group form -> `diagram.group.chart.make` | restored; pie and doughnut refused by the rules (`chart-layout-not-declared`), refusal shown |
| Zoom buttons "-", "+", percentage; Ctrl/Cmd+wheel; two-finger pinch; keys "+", "-", "0" (fit) | always | local only | view only; change no state | restored |
| Toggle "Object ID" | always | `diagram.ids.show {mode: 'off' or 'always'}` | `diagram.ids.show {mode}`; codes drawn by the SOP rules | restored (codes start hidden, the area default) |
| Buttons "Undo", "Redo" | always | `undo {}`, `redo {}` | `diagram.undo {}`, `diagram.redo {}` | restored |
| Buttons "Save SVG", "Save PNG" | always | local only (download; also effect `diagram.download`) | projection SVG cropped to the drawing; `diagram.download` kept | restored |
| Click a node | always | `diagram.node.select {ids: [id], edges: []}` | `diagram.node.select {ids, edges}` | restored |
| Shift/Ctrl/Cmd-click a node, or tap in multi mode | always | `diagram.node.select {ids: selection with id toggled, edges: current edges}` | `diagram.node.select`; multi-selection is now SOP view state (`selected.<code>=true`, verified) | improved |
| Click a connection (plain or with modifier) | always | `diagram.link.select {ids: [id] or toggled, nodes: [] or current nodes}` | `diagram.link.select {ids}` | restored |
| Click a group frame or label | always | `diagram.group.select {id}` | `diagram.group.select {id}` | restored |
| Click a chart | chart present | `chart.select {id}` | none | dropped: legacy saved charts no longer exist in the area (charts are numeric groups) |
| Click empty canvas | always | `diagram.node.select {ids: []}` | `diagram.node.select {ids:[]}` (new SOP rule clears the selection) | restored |
| Enter or Space on a focused node, connection, group or chart | always | same as the matching click | select | restored |
| Drag a node (threshold 4 px mouse, 8 px touch); live preview local | always | `diagram.node.place {ids: selection if it contains the node else [id], x, y}` (centroid + delta) | `diagram.node.place {ids,x,y}` | restored |
| Drag a group frame, or a member of the selected group | always | `diagram.group.place {id, x, y}` (members' centroid + delta) | `diagram.group.place {id,x,y}` | restored |
| Drag a chart | chart present | `chart.place {id, x, y}` | none | dropped: legacy charts (see Click a chart) |
| Resize handle (bottom-right square per selected node) drag; symmetric, 8 to 4096; circle/square/sector uniform | node(s) selected | `diagram.node.resize {ids: [id], width, height}`; a click without drag: `diagram.node.select {ids: [id]}` | `diagram.node.resize {ids,width,height}`; Shift or equal sides keep the ratio | restored |
| Box select: drag on empty canvas | always | `diagram.node.select {ids: nodes fully inside, edges: edges with both ends inside}`; with modifier or multi mode: union with current | `diagram.node.select {ids}` | restored |
| Double-click empty canvas (chooser at the point) | always | local; then chooser row | chooser at the point | restored |
| Double-click a node (opens the label/value box) | always | local; saved by "Save label" | label box -> `diagram.node.change {label}` | restored |
| Escape key | always | closes chooser, select mode; if anything selected `diagram.node.select {ids: []}` | `diagram.node.select {ids:[]}` | restored |
| Delete or Backspace key | always | same as "Delete selection" | `selection.remove` / `node.remove` / `link.remove` / `group.remove` | restored |
| Arrow keys (10 units, Shift 1) | node(s) or group selected; none selected pans locally | `diagram.node.place {ids, x, y}`; group selected: `diagram.group.place {id, x, y}` | place commands; pan when nothing is selected | restored |
| Selected identity readout (label · id) | something selected | local only | from the projection | restored |
| "Object ID" readout (node edit box) | 1+ node, no group | local only | from the projection | restored |
| Text "Label", number "Numeric value", "Save label" (submit) | one node (or after double-click) | `diagram.node.change {ids: [id], label, value?}` | `diagram.node.change {ids,label,value}` | restored |
| Numbers "Width" / "Height" | 1+ node, no group | `diagram.node.resize {ids, width, height}` | `diagram.node.resize` | restored |
| Select "Node colour" (enum of `diagram.node.change.colour`) | 1+ node, no group | `diagram.node.change {ids, colour}` | `diagram.node.change {colour}` (enum) | restored |
| Select "Node size" (enum of `diagram.node.change.size`; current px shown) | 1+ node, no group | `diagram.node.change {ids, size}` | `diagram.node.change {size}` (enum) | restored |
| Numbers "Node X" / "Node Y" | 1+ node, no group | `diagram.node.place {ids, x, y}` | `diagram.node.place` | restored |
| Button "Delete node" | never (built hidden) | `diagram.node.remove {ids: [id]}` | `diagram.node.remove` | restored (was always hidden; Delete selection covers it) |
| Button "Delete selection" | enabled with nodes, connections or an active chart | chart: `chart.remove {ids: [chart]}`; group: `diagram.group.remove {id}`; nodes and links: `diagram.selection.remove {nodes, links}`; nodes: `diagram.node.remove {ids}`; links: `diagram.link.remove {ids}` | `diagram.selection.remove {nodes,links}` | restored |
| "Connection Object ID" readout | 1+ connection | local only | from the projection | restored |
| Selects "From node" / "To node" | exactly one connection (disabled for 2+); also shown for 2+ nodes | `diagram.link.change {ids, from}` or `{ids, to}` | `diagram.link.change {from|to}` | restored |
| Text "Connection label" | 1+ connection | `diagram.link.change {ids, label}` | `diagram.link.change {label}` | restored |
| Select "Connection colour" (enum of `diagram.link.change.colour`) | 1+ connection | `diagram.link.change {ids, colour}` | `diagram.link.change {colour}` | restored |
| Select "Line style" (solid, dashed, dotted) | 1+ connection | `diagram.link.change {ids, style}` | `diagram.link.change {style}` | restored |
| Select "Arrowheads" (forward, both, none) | 1+ connection | `diagram.link.change {ids, arrow}` | `diagram.link.change {arrow}` | restored |
| Number "Line width" (0.5 to 12) | 1+ connection | `diagram.link.change {ids, width}` | `diagram.link.change {width}` | restored |
| Button "Connect nodes" | 2+ nodes, no connection selected; enabled when from differs from to | `diagram.link.make {from, to}` | `diagram.link.make` | restored |
| Draft: "Numeric group label", select "Chart layout" (bar, line, pie, doughnut), textarea "Chart data" (label, number per line), "Create numeric group" | after "Chart" | `diagram.group.chart.make {label, labels, values, layout}`; Cancel local | `diagram.group.chart.make {label,labels,values,layout}` | restored (pie/doughnut refused, see Chart) |
| Button "Convert to editable group" | a saved (legacy) chart active | `diagram.group.chart.adopt {id}` | none | dropped: no legacy charts in the area; the rules refuse `chart.adopt` |
| "Group Object ID" readout (group id, or next free `g<n>`) | group selected or 2+ nodes | local only | from the projection | restored |
| Text "Group label" | group selected or 2+ nodes | group: `diagram.group.change {id, label}`; else used by Group selected | `diagram.group.change {label}` / used by group.make | restored |
| Button "Group selected" | 2+ nodes, no group selected | `diagram.group.make {name: next free g<n>, label: label or 'Group', ids}` | `diagram.group.make {name,label,ids}` (the group is selected) | restored |
| Select "Group layout" (enum of `diagram.group.layout.layout`) | group selected | `diagram.group.layout {id, layout}` | `diagram.group.layout {id,layout}` | restored |
| Selects "Group colour" / "Group size" (enums of `diagram.group.change`) | group selected | `diagram.group.change {id, colour}` or `{id, size}` | `diagram.group.change {colour|size}` | restored |
| Numbers "Group X" / "Group Y" | group selected | `diagram.group.place {id, x, y}` | `diagram.group.place` | restored |
| Number "Scale group" (0.05 to 20) | group selected | `diagram.group.resize {id, scale}` | `diagram.group.resize {id,scale}`; current scale now observed (`inputs.<g>.scale`) | restored |
| Button "Ungroup" | group selected | `diagram.group.ungroup {id}` | `diagram.group.ungroup {id}` | restored |
| Button "Delete group" | group selected | `diagram.group.remove {id}` | `diagram.group.remove {id}` | restored |
| Member buttons (label · id) | group selected | `diagram.node.select {ids: [member]}` | `diagram.node.select` | restored |

## Documents

| Old control | Shown when | Operation and arguments | New declaration / gesture | Status |
| --- | --- | --- | --- | --- |
| Implicit document creation before any add | no document yet | `document.write {title: 'Untitled document', blocks: []}` | `document.write {title}` before the first add; also a New document button | improved |
| Button "+ Chapter" (then inline edit of the new heading) | always | `document.section.make {parent: textId, text: '', level: 1}` | `document.section.make`, levels from the interface; inline edit of the new heading | restored |
| Button "+ Subchapter" | always | `document.section.make {parent, text: '', level: 2, after?: last block of the chapter containing the selection}` | `document.section.make {after}`; last block of the chapter found via observed `in` | restored |
| Button "+ Paragraph" | always | `document.block.make {parent, kind: 'paragraph', text: ''}` | `document.block.make`; new id = block observed after but not before | restored |
| Button "+ Heading" | always | `document.block.make {parent, kind: 'heading', text: '', level: 3}` | `document.block.make` (level = declared minimum) | restored |
| Button "+ Quote" | always | `document.block.make {parent, kind: 'quote', text: ''}` | `document.block.make {kind:'quote'}` | restored |
| Button "+ List" (dialog: one item per line) | always | `document.list.make {parent, style: 'bullet', items}` | `document.list.make` | restored |
| Button "+ Table" (dialog: tab-separated cells, one row per line) | always | `document.table.make {parent, rows, header: true}` | `document.table.make`; cells split by tab or `|` | improved |
| Buttons "B", "I", "U", "S", "Code", "Highlight" | a character range selected in the inline editor | `*.mark {id, at, from, to, mark, enabled: true}`; highlight adds `attrs: {color: '#fff2a8'}` | `*.mark` on the textarea range; marks from the interface enum; new highlight colour picker and Link (`attrs.color`/`attrs.href`) | improved |
| Button "Clear format" | range selected | six calls `*.mark {id, at, from, to, mark, enabled: false}` (bold, italic, underline, strike, code, highlight) | `*.mark {enabled:false}` per mark | restored |
| Button "Clear document" | always | `document.block.remove {ids: all block ids}` | `document.block.remove {ids: all blocks}` | restored |
| Buttons "Undo", "Redo" | always | `document.undo {}`, `document.redo {}` | `document.undo`, `document.redo` | restored |
| Text "Document title" | always | `document.title.change {id: textId, title}`; no document: `document.write {title, blocks: []}` | `document.title.change` (or `document.write`) | restored |
| Click a block, or its handle button | always | `*.select {id, at: '0', from: 0, to: 0}` | `document.block.select` / `document.section.select` | restored; `effectScope.selection key=selected` declared for both operations in docs.editor native-interface.sop: the selected and deselected blocks verify, the character range (from, to, at) is a view key and stays unverified |
| Drag a block handle onto another block (drop above or below its middle) | always | `document.block.reorder {ids: full new order}` | `document.block.reorder {ids}`; pointer-based (mouse and touch) instead of HTML5 drag-and-drop | improved |
| Alt+Up / Alt+Down on a focused block | always | `document.block.reorder {ids}` | `document.block.reorder {ids}` | restored |
| Double-click text (block, list item, table cell): inline textarea | always | local; saved as below | inline textarea on the observed text container | restored |
| Inline textarea: blur or Ctrl/Cmd+Enter saves; Escape cancels; text selection sets the range | editing | `document.container.change {id: JSON.stringify([blockId, at]), text}` (only if changed; `at` is `'0'`, item index, or `'row:col'`) | `document.container.change {id, text}` (and list items, table cells) | restored |
| Task-list checkbox | list with style task | `document.list.change {id, checked: [booleans]}` | `document.list.change {id, checked}` | restored |
| Outline buttons (headings of level 1 and 2) | always | `document.section.select {id, at: '0', from: 0, to: 0}`, then scroll | `document.section.select` | restored (same verification note as block select) |
| Text "Block label" | block selected | `*.change {id, name}` | `*.change {id, name}` | restored |
| Select "Block type" (paragraph, heading, quote; sections: heading only) | paragraph, heading or quote selected | `*.change {id, kind, level?}` (heading: section level or 3) | `*.change {id, kind}`, options from the enum | restored |
| Select "Heading level" (sections 1-2, other headings 3-6) | heading selected | `*.change {id, level}` | `*.change {id, level}`, levels from the interface | restored |
| Select "Alignment" (left, center, right, justify) | block selected | `*.align {id, align}` | `*.align {id, align}` | restored |
| Buttons "Move up" / "Move down" | block selected | `document.block.reorder {ids}` | `document.block.reorder {ids}` | restored |
| Button "Delete block" / "Delete section" | block selected | `*.remove {ids: [id]}` | `*.remove {ids}` | restored |
| Button "Edit text" | paragraph, heading or quote selected | local (opens inline editor) | opens the inline editor | restored |
| Select "List style" (bullet, numbered, task) | list selected | `document.list.change {id, style}` | `document.list.change {id, style}` | restored |
| Button "Edit list items" (dialog) | list selected | `document.list.change {id, items}` | `document.list.change {id, items}` | restored |
| Button "Edit table cells" (dialog) | table selected | `document.table.change {id, rows}` | `document.table.change {id, rows}`; new header-row toggle (`header`) | improved |
| "Selected characters from-to" readout | block selected | local only | observed selectionFrom/To; new word count from the document `length` input | improved |

## Calendar

| Old control | Shown when | Operation and arguments | New declaration / gesture | Status |
| --- | --- | --- | --- | --- |
| Button "Clear events" | always | `calendar.events.remove {ids: all meeting ids}` | `calendar.events.remove {ids}` | restored |
| Button "Undo" | always | `undo {}` | `undo {}`; new Redo button (`redo {}`) | improved |
| Button "+ New event" (opens an empty form, 09:00-10:00 on the selected day) | always | if an event is selected: `calendar.event.select {id: null}`; form local | deselects, then the form sends `calendar.event.add` | restored |
| Buttons "‹" / "›" (week back / forward), "Today" | always | local only | view only | restored |
| Date input "Selected date" | always | local only | view only | restored |
| Day header button (select the day) | always | local only | view only | restored |
| Click an event chip | always | `calendar.event.select {id}`, then opens its form | `calendar.event.select {id}` | restored |
| Drag an event chip onto another day column | always | `calendar.meeting.move {id, start: new day at the same time}` | `calendar.meeting.move {id, start}`; pointer-based, works with touch | improved |
| Arrow keys on a focused event chip (Left/Right ±1 day; Up/Down ±30 min, Shift ±15 min) | always | `calendar.meeting.move {id, start}` | `calendar.meeting.move` | restored |
| Agenda row button "Edit" | event on the selected day | `calendar.event.select {id}` | `calendar.event.select {id}` | restored |
| Form "Title", "Date", "End date", "Start time", "End time", "Notes (optional)", "Save" (end after start checked locally) | form open | new: `calendar.event.add {id: random UUID, title, start, duration, notes}`; existing: `calendar.meeting.change {id, title, start, duration, notes}` (ms) | `calendar.event.add` / `calendar.meeting.change {id,title,start,duration,notes}` | restored |
| Button "Delete" | existing event form | `calendar.meeting.remove {id}` | `calendar.meeting.remove {id}` | restored |
| Button "Cancel" | form open | existing: `calendar.event.select {id: null}`; new: local | `calendar.event.select {id:null}`; new SOP rule `@deselect` in time.calendar act-rules (a null id clears `selected`) | restored |
| Time-zone readout | always | local only | view only | restored |

## Old touch test

`9381a3d4~1:tests/mobile-editors-touch-browser.test.mjs` mounted the real Drawing and Diagram tab modules on a 390 x 844 viewport, routed `host.tool` through `performGesture` (native SOP), made `host.send` throw (gestures had to use declared tools), and drove genuine CDP touch input. Drawing: Add, then chooser "house" (`drawing.object.make`); one-finger drag moved it left (`drawing.objects.transform`); Add "circle"; "Select multiple" and tap the house gave 2 selected (`drawing.objects.select`); "Group objects" gave 1 object, "Ungroup" gave 2; a touch move ended by touch cancel changed nothing. Diagram: "Add node", rectangle and circle placed by taps (`diagram.node.make`); "Select multiple" with taps (`diagram.node.select`); "Group selected", then "Ungroup" (groups 1, then 0); "Connect" and two taps (`diagram.link.make`, 1 edge); a two-finger pinch left the shapes unchanged. It asserted every control was visible and inside the viewport, every call returned `ok` with an intent record whose `wires` start with `@` and verification `verified` or `unverified`, and no console errors or warnings.

Restored (2026-11-20): `tests/mobile-editors-touch-browser.test.mjs` again starts both tabs empty and drives the same steps with genuine CDP touch on the restored UIs: Drawing Add "house", one-finger drag left (`drawing.object.place`), Add "circle", "Select multiple" and a tap (heading "2 objects", `drawing.objects.select`), "Group objects" / "Ungroup", touch cancel without effect, "Delete selection", "Clear drawing"; Diagram "Add node" rectangle and circle by taps, "Select multiple", "Group selected" / "Ungroup", "Connect" with two taps (one edge), pinch without effect, "Clear diagram". Every call returns `ok` with an intent record and `verified` or `unverified`, with no console errors or warnings. `tests/sop-area-editor-projection.test.mjs` checks the projection values the inspectors show (a selected drawing object's colour, size, sides, label and box; a selected diagram node's label, shape and colour).

## New in the SOP rules for parity

- Drawing (`worlds/art.draw/act-rules.sop`, `render-projection.sop`): part move and resize stored on `w.drawing.part` (offsets and sizes in the part frame, drawn by `ui.draw.partgeo`); part extract for basic shapes; `drawing.objects.transform` fits the combined box of the listed objects; make, catalog make, group and part extract select what they made; observed part x, y, width and height, object `fill` and `options.colour`. `effectScope projection=composite` for part place/change and objects select.
- Diagram (`worlds/diagram.sketch`): `diagram.node.change kind` changes the node's shape; selecting nothing clears the selection; multi-selection is area state (`selected.<code>=true`, `selected` the primary id) with `effectScope.selection`; observed group scale.
- Calendar (`worlds/time.calendar/act-rules.sop`): `calendar.event.select` without an id clears the selection.

## Still missing (each control is present and sends its command; the effect needs the SOP piece)

- Drawing "Original colours": clearing a stored value (`color: null`) needs an unset act (compile drops null arguments).
- Drawing take-apart of a single multi-part object: needs a take-apart rule (polygon parts have no basic shape).
- Avatar per-variant thumbnails: only the shown variant has a picture; needs a per-variant preview projection (draw facts for each variant of the selected slot, rendered one picture per variant by `sop-primitives`).
- Avatar "Resizing also adjusts the attached parts": a part resize changes only the listed parts; needs a resize rule over a declared attachment relation (parts inside or resting on a slot) and its `resizeRelated` observation.
- Avatar compose by kind or base keeps no explicit part edits (`specs/avatar-native-controls.md` says explicit edits are retained): the preset rules replace every part; needs explicit-edit facts in the w.face instance and rules that keep them over a new base.
- Diagram pie and doughnut charts are refused by the rules (`chart-layout-not-declared`).
