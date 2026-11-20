# Diagram capabilities (diagram.sketch)

Purpose: the complete inventory of what the Diagram tab can do, as declared native operations
(`worlds/diagram.sketch/native-interface.sop`), compiled by `act-rules.sop` into `std.acts` calls on the `w.diagram`
instance and drawn by `render-projection.sop`. Each row lists the operation, its parameters, what it does and the human
ways of asking for it (English, the reader's input after the translation boundary). Part A (dialog compiler,
bindings, catalog vocabulary) and part C (training data) read this file; the phrasings are examples of the requests
a reader must map to the listed call, never patterns in code.

Owner request (2026-11-20): "a natural, useful diagram editor controllable by voice: colour elements, colour styles,
control layouts; strongly extend the visual tools too." Everything here is generic: SOP rules, knowledge in the
catalog (`k.styles` themes and palettes, `k.diagrams.shape` flowchart semantics, `k.colours` colour names), no
per-diagram host code.

Conventions: `ids` lists node codes (`n1`), `id` a group code, link codes are `e<k>`. Colour values are the names of
the declared choice `diagram.colours` (k.colours names). A command that cannot apply is refused with a reason (shown
in brackets), never simulated.

## The page as an object

The page is observed as `app.observe.object id=page kind=diagram sourceType=diagram.sketch.page binding=diagram.page`
with its `layout` and `direction`, and its settings as inputs of `page` (arrange, direction, spacing, route, theme,
background, numbered, layout, flow): the target of the page-wide operations (layout, improve, themes, numbering).

## Knowledge used

- `k.styles.theme` (catalog world `k.styles`): a named visual style with `fill`, `outline`, `text`, `edge`,
  `background`, `group` (frame fill), `weight` (label weight) and `width` (line width). Themes: `pastel`, `dark`,
  `blueprint`, `monochrome`, `highlight`, `vivid`, `ocean`, `forest`, `sunset`, `print`, `flowchart`.
- `k.styles.role`: a theme's colours for the nodes of one role (the `flowchart` theme: start and end green, decision
  amber, data blue ...; `highlight`: the nodes it is applied to).
- `k.styles.swatch`: a theme's palette in order, used by "colour by level/shape/role/group" and for chart slices.
- `k.diagrams.shape` (lookup `kind=flowchart`): the usual shape of a role (start/end: oval drawn as a stadium,
  decision: diamond, data: parallelogram, document: document, subprocess: double rectangle, database: cylinder ...).

## Nodes

| Operation | Parameters | Does | Human ways to ask |
| --- | --- | --- | --- |
| `diagram.node.make` | `kind` (shape, below), `label`, `n` (1-12), `colour`, `outline`, `textColour`, `size`, `role`, `layout` (row, column, grid, circle, radial: an arrangement of the new nodes), `x`, `y` | make nodes; a `role` without a `kind` takes the role's flowchart shape from `k.diagrams.shape` | "draw a rectangle called Api", "add three red circles in a row", "add a decision node Is it hot?", "put a database called Users", "add five nodes in a circle", "add a start node" |
| `diagram.node.change` | `ids`, `colour` (fill), `outline`, `textColour`, `fontSize` (8-48), `fontWeight` (normal, bold), `size`, `label`, `value`, `kind`, `role`, `effect` (none, shadow, glow), `opacity` (0.1-1), `corner` (0-40), `rotation` (-360-360, degrees clockwise) | change what is given; nothing given [missing-property] | "make Api blue", "give it a red border", "white text on the decision", "make the labels bigger / font size 18", "bold label", "turn it into a diamond", "make Db a cylinder", "mark it as the start", "add a shadow to Api", "make it glow", "make it half transparent", "round the corners more", "rotate it 45 degrees", "tilt the label box a little" |
| `diagram.node.select` | `ids`, `edges` | the view's selection | "select Api and Db", "select nothing" |
| `diagram.node.remove` | `ids` | remove nodes with their links | "delete Api", "remove these" |
| `diagram.node.place` | `ids`, `x`, `y` | move (pin) nodes; a group member moves with its group [node-in-group-place-the-group] | "move Api to 200, 300", "drag it down" |
| `diagram.node.resize` | `ids`, `width`, `height` | exact size | "make it 200 wide and 80 high" |
| `diagram.node.layout` | `ids`, `layout` (tree, layers, row, column, grid, circle, radial) | arrange these nodes (an arrangement) or hand them back to the diagram layout | "put these in a row", "arrange them in a circle", "line them up in a column" |
| `diagram.node.duplicate` | `ids` | a copy of each node (shape, label, colours, size, role), unconnected | "duplicate Api", "copy these two" |
| `diagram.node.insert` | `link`, `kind`, `label` | a new node in the middle of a link: from -> new -> to | "insert a step Validate between Login and Home", "put a node in the middle of that arrow" |
| `diagram.node.merge` | `ids` (2+), `label` | the first node takes the others' links; links between them go; the others go | "merge Api and Gateway", "combine these nodes into one called Backend" |
| `diagram.nodes.swap` | `ids` (two) | swap their places: hand-placed ones their positions, the others their order in the layout | "swap A and B", "switch these two steps" |
| `diagram.node.scale` | `ids`, `factor` (0.1-10) | their drawn size times the factor (exact width and height) | "make it 20% bigger", "half the size", "twice as big" |
| `diagram.node.split` | `id`, `label` | a new node after it takes its outgoing links, joined to it | "split Process into two steps", "split it, call the second part Review" |

Shapes (`kind`): rectangle, rounded_rectangle, square, circle, ellipse, oval (stadium: start/end), diamond (decision),
parallelogram (input/output), hexagon (preparation), triangle, star, chevron, double_rectangle (subprocess), document,
cylinder (database), cloud, actor (person), note, text, dot.
Human names a reader maps to them: box -> rectangle; rounded box, pill -> rounded_rectangle / oval; rhombus,
decision -> diamond; input/output, data -> parallelogram; database, db, store -> cylinder; person, user, stick figure
-> actor; comment, sticky note -> note; internet, external system -> cloud; terminal, start/end -> oval.

## Links

| Operation | Parameters | Does | Human ways to ask |
| --- | --- | --- | --- |
| `diagram.link.make` | `from`, `to`, `label`, `colour`, `style`, `arrow` | connect two nodes [link-exists, missing-endpoint] | "connect Api to Db", "draw an arrow from A to B labelled yes", "a dashed line from A to B" |
| `diagram.links.connect` | `ids` (in order), `pattern` (chain, cycle, star, all), `hub`, `confirm` | many links at once; already linked pairs are kept; all-to-all over 10 links needs `confirm=true` [confirm-many-links] | "connect them in order", "chain these steps", "connect them in a loop", "connect everything to the hub / to Api", "connect every node to every other" |
| `diagram.link.change` | `ids`, `from`, `to`, `label`, `colour`, `style` (solid, dashed, dotted), `arrow` (forward, back, both, none), `width` (0.5-12), `route` (orthogonal, straight, curved) | change the link | "make that arrow red", "dashed line", "arrows at both ends", "no arrowheads", "point the arrow back", "thicker line / width 4", "curve this link", "label it yes" |
| `diagram.link.improve` | `ids` | the declared tidy look of a link: orthogonal route (through the gaps of a top-down flow, an elbow otherwise), solid, 2 wide; the reply says what was changed | "make the line e1 look better", "tidy this arrow", "clean up that connector" |
| `diagram.link.reverse` | `ids` | swap the ends | "reverse the arrow", "flip the direction of e2" |
| `diagram.link.select` | `ids`, `nodes` | the view's selection | "select the arrow from A to B" |
| `diagram.link.remove` | `ids` | remove links | "delete that connection" |

## Styles, themes and colours

| Operation | Parameters | Does | Human ways to ask |
| --- | --- | --- | --- |
| `diagram.style.apply` | `theme` (k.styles names), `ids`, `role`, `kind` | a theme's fill, outline, text colour and label weight on the named nodes, on the nodes of a role or a shape, or (none named) on every node and link plus the page background; later nodes follow the page theme | "make it pastel", "use a dark theme", "blueprint style", "make it black and white", "highlight the decision nodes", "highlight Api", "colour the circles like the ocean theme" |
| `diagram.colour.by` | `by` (level, shape, role, group), `theme` (palette; default `vivid`) | each node the palette colour of its level, shape, role or group | "colour each level differently", "colour by shape", "give every group its own colour", "colour the roles" |
| `diagram.node.change` | `colour`, `outline`, `textColour` | see Nodes | "fill it yellow", "outline in navy" |
| `diagram.group.change` | `colour`, `size`, `label` | members' colour and size, the label | "make the Birds group green" |

## Layout

| Operation | Parameters | Does | Human ways to ask |
| --- | --- | --- | --- |
| `diagram.layout` | `layout` (tree, layered, row, column, grid, circle, radial, free), `direction` (down, right, up, left), `spacing` (compact, normal, loose), `route` (orthogonal, straight, curved) | the whole diagram's layout: any layout but `free` hands every pinned node back to it; `free` pins every node where it is now; at least one parameter [missing-property] | "lay it out as a tree", "left to right", "make it flow upwards", "arrange everything in a circle", "radial layout", "put it in a grid", "more space between the nodes", "make it compact", "straight lines", "curved connectors", "orthogonal routing", "stop the automatic layout" |
| `diagram.layout.improve` | none | best effort in one step: every node and group back to the layout, layered for a page with links (grid without), orthogonal routes for every link (through the gaps of a top-down flow, elbows otherwise), normal spacing | "improve the layout", "tidy it up", "clean up the diagram", "make it neat" |
| `diagram.nodes.align` | `ids` (2+), `edge` (left, centre, right, top, middle, bottom) | the nodes' edges or centres on one line (pinned) | "align these left", "align them at the top", "centre them vertically" |
| `diagram.nodes.distribute` | `ids` (3+), `axis` (horizontal, vertical) | equal gaps between centres from the first to the last (pinned) | "space them evenly", "distribute horizontally" |
| `diagram.steps.number` | `mode` (on, off) | a step number on each node in flow order (level, then place) | "number the steps", "hide the numbers" |
| `diagram.group.layout` | `id`, `layout` (row, column, grid, circle, bar, line, pie, doughnut) | lay a group out; a chart layout needs every member's value [explicit-numeric-values-required] | "arrange the group in a circle", "show the group as a pie chart" |

Layout semantics (render-projection.sop, layout-modes.sop): tree and layered are the level layout (longest path from the roots, the
order of first parents, so a tree's edges do not cross); direction turns it (right: levels left to right; up and left
mirror). Row, column and grid place the units in creation order. Circle places them on one ring (radius from their
sizes); radial puts the roots in the middle and each level on its own ring in the level order. Spacing scales the gaps
(compact 0.6, normal 1, loose 1.6). Routes: orthogonal top-down flows go through the gaps between levels (crossing no
node); other orthogonal routes are elbows between the facing sides; straight routes are clipped at both boxes;
curved routes are quadratic curves bending to the left of the line. Every non-gap route ends in an arrowhead turned
along its last segment.

## Groups, containers and charts

| Operation | Parameters | Does | Human ways to ask |
| --- | --- | --- | --- |
| `diagram.group.make` | `name`, `label`, `ids` | a framed group (container) of nodes | "group these as Backend", "put Api and Db in a box called Server" |
| `diagram.group.select/change/place/resize/remove/ungroup` | `id` and their parameters | as named | "move the group right", "make the group twice as big", "ungroup it" |
| `diagram.group.chart.make` | `label`, `labels`, `values`, `layout` (bar, line, pie, doughnut) | a numeric group drawn as a chart (slices from the `vivid` palette, or each member's colour) | "make a pie chart of apples 3, pears 5", "doughnut chart of the votes" |

## Charts

A chart is a framed group (`w.diagram.group` with layout bar, line, area, pie or doughnut): its members are its
categories (their labels), their `value`s its data, the group's `label` its title; formatting keys are on the group
(`x_label`, `y_label`, `value_labels`, `gridlines`, `legend`). It is drawn by rules (render-projection.sop bars, lines
and points; ring-projection.sop areas, slices, gridlines, axis titles, legends). Single series.

| Operation | Parameters | Does | Human ways to ask |
| --- | --- | --- | --- |
| `diagram.group.chart.make` | `label`, `labels`, `values`, `layout` | make a chart | "add a bar chart of sales by month: January 10, February 20", "a pie chart of the votes" |
| `diagram.chart.value` | `id`, `category` (label or code), `value` | set one value [missing-category] | "make March 40", "set the value of Yes to 7" |
| `diagram.chart.category.add` | `id`, `label`, `value` | a category at the end | "add a column for April with 25", "add a slice Other 3" |
| `diagram.chart.category.remove` | `id`, `category` | remove a category | "remove February", "delete the last bar" |
| `diagram.chart.category.rename` | `id`, `category`, `label` | rename a category | "rename Jan to January" |
| `diagram.chart.format` | `id`, `title`, `xLabel`, `yLabel`, `valueLabels`, `gridlines`, `legend` (none, right, bottom), `yMax` (top of the value axis; values above it drawn at the top) | formatting [missing-property] | "call the chart Sales 2026", "label the y axis Units", "hide the values", "show gridlines", "put the legend on the right", "cap the y axis at 100" |
| `diagram.chart.highlight` | `id`, `test` (below, above), `value`, `colour` | conditional colours: each category whose value is below (above) the threshold takes the colour | "make the months below 20 red", "colour the losing quarters red", "highlight values over 50 in green" |
| `diagram.chart.sort` | `id`, `order` (ascending, descending, label) | reorder the categories | "sort the bars from highest to lowest", "sort alphabetically" |
| `diagram.group.layout` | `id`, `layout` | chart type | "make it a line chart", "turn it into a doughnut", "show it as an area chart" |
| `diagram.node.change` / `diagram.style.apply` | colour, `theme="highlight"` on a category | colour or highlight one bar or slice | "make the March bar red", "highlight the biggest slice" |

Not yet (each needs a rule set or a mechanism, listed honestly; from the owner's request and
management/data-drop/pilot/FEATURE-REQUESTS.md B1-B12):
- several series per chart (grouped and stacked bars, several lines, series rename/recolour/reorder/merge, a second
  value axis): needs `w.diagram.series` and `w.diagram.datum` facts and grouped/stacked placement rules;
- horizontal bars, tick density and logarithmic axes, trend lines and moving averages (least-squares sums in rules),
  callout annotations;
- gradients and rounded bars (the renderer has no gradient definitions; bars are rectangles of the box rules);
- swimlanes by actor (groups as full-width lanes), jump-overs at crossings, a crossing-count objective;
- organic (force) layout through std.problem/Z3 (see Status);
- batch formatting across several pages (one page per area today); "center the flow on the page" (the page is
  sized to the drawing).
Chart effects use the node effects (shadow, glow, opacity, corner, rotation).

## Page and history

`diagram.page.clear`, `diagram.ids.show {mode}`, `diagram.observe`, `diagram.undo`, `diagram.redo`, `diagram.selection.remove`.

## Visual tools (Diagram tab)

Every control sends the operation listed above through `host.tool` (the chat route), so undo, journal and verification
are shared; each is a UI case in `training/sop-bert/data/ui-coverage-v2/cases.py` (`UI_CONTROLS`).

| Control | Operation and arguments |
| --- | --- |
| Theme picker (toolbar) | `diagram.style.apply {theme}` (selection: `{theme, ids}`) |
| Colour by (toolbar menu) | `diagram.colour.by {by}` |
| Layout menu: layout, direction, spacing, routes | `diagram.layout {layout|direction|spacing|route}` |
| Improve layout button | `diagram.layout.improve {}` |
| Number steps toggle | `diagram.steps.number {mode}` |
| Shape palette (inspector, chooser) | `diagram.node.change {ids, kind}` / `diagram.node.make {kind,x,y}` |
| Fill, outline, text swatches (inspector) | `diagram.node.change {ids, colour|outline|textColour}` |
| Font size, bold (inspector) | `diagram.node.change {ids, fontSize|fontWeight}` |
| Align left/centre/right/top/middle/bottom, distribute (2+ nodes) | `diagram.nodes.align {ids, edge}`, `diagram.nodes.distribute {ids, axis}` |
| Connect in order / to the first / all (2+ nodes) | `diagram.links.connect {ids, pattern}` |
| Duplicate, merge, split (nodes) | `diagram.node.duplicate {ids}`, `diagram.node.merge {ids}`, `diagram.node.split {id}` |
| Link colour swatches, style, arrowheads, width, route (links) | `diagram.link.change {ids, ...}` |
| Effect, opacity, corner, rotation (nodes); Swap, Bigger, Smaller | `diagram.node.change {ids, effect|opacity|corner|rotation}`, `diagram.nodes.swap`, `diagram.node.scale` |
| Link tools: Tidy | `diagram.link.improve {ids}` |
| Chart: value axis top, sort, colour values below/above | `diagram.chart.format {yMax}`, `diagram.chart.sort`, `diagram.chart.highlight` |
| Chart data table: category, value, remove, add | `diagram.chart.category.rename`, `diagram.chart.value`, `diagram.chart.category.remove`, `diagram.chart.category.add` |
| Chart formatting: axis titles, values, gridlines, legend; chart type | `diagram.chart.format {...}`, `diagram.group.layout {id, layout}` |
| Reverse link, insert node in link | `diagram.link.reverse {ids}`, `diagram.node.insert {link}` |

## Status (2026-11-20)

Delivered and tested (`tests/diagram-capabilities-declared-host.test.mjs`, 10 tests): every operation above except the
items listed as not yet. Layouts are checked by geometry (no overlaps, a ring of equal radii, outer rings for deeper
levels, directions, exact alignment, equal distribution, crossings 1 -> 0 after improve). Organic (force-like) layout
through std.problem/Z3 is not implemented: the library's internal search enumerates the grid of every variable
(at most 2,000,000 combinations, so 2 or 3 nodes), and Z3 runs only asynchronously in an isolated browser page, while
an area command compiles synchronously; it needs an asynchronous solve step for a whole-page problem in the
application route (src/dialog, owned elsewhere). Crossing reduction is the level layout's own ordering (first
parents) plus improve; there is no crossing-count objective. Geometry without sine and square root uses Bhaskara's
sine and the alpha-max-plus-beta-min length (rules in layout-modes.sop), since a library change was not needed.
