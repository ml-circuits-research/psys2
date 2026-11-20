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
| `diagram.link.change` (geometry) | `ids`, `fromSide`, `toSide` (auto, top, right, bottom, left, centre), `head`, `tail` (arrow, open, diamond, circle, none), `labelAt` (start, middle, end), `labelPosition` (0-1), `fromX`/`fromY`, `toX`/`toY` (a free end's point), `fromPort`/`toPort` (a named port of the node at that end) | where each end is attached, the mark at each end (a kind shows that end: the direction gains it; none takes it away), where the label sits along the line, a free end's point [no-such-port] | "make e2 go from the left side of A", "into the top of Check", "make the arrow double-headed", "a diamond at the end", "no arrow at the start", "move the label of e3 to the middle" |
| `diagram.link.attach` | `ids`, `node`, `end` (from, start, source, tail / to, end, target, head / left, right, top, bottom: the end drawn there), `at` (the node the end is at now), `side`, `port` (a name the node's shape gives a side: every shape's in and out, a decision's yes, no, else, a database's lid, base) | attach that end (the target when neither is said) to the node, at the side or port (auto when none); a free end gets its node again [missing-endpoint, no-such-port] | "connect the arrow to Review instead of Test", "move the end of e1 to the top of Check", "attach the right end to the database" |
| `diagram.link.detach` | `ids`, `end`, `at`, `x`, `y` | the end has no node any more and is free at the point (no point: 40 beyond its tip, away from its node); the link is made again under its code without that end (std.acts cannot take a reference away), carrying its keys and bends; a free end moves to the point said [already-free without a point] | "detach e1 from Start", "free the end of that arrow" |
| `diagram.link.bend.add` | `ids`, `x`, `y`, `after` (0: before the first bend; none: after the last) | a bend the link passes through | "add a bend to e1 at 300, 200", "route e1 through 300, 200" |
| `diagram.link.bend.move` | `ids`, `bend` (1 = the first along the link), `x`, `y` | move that bend [missing-target] | "move the first bend of e1 to 320, 180" |
| `diagram.link.bend.remove` | `ids`, `bend` | remove that bend, or every bend | "straighten e1", "remove the bends of that arrow" |
| `diagram.link.improve` | `ids` | the declared tidy look of a link: orthogonal route (through the gaps of a top-down flow, an elbow otherwise), solid, 2 wide; the reply says what was changed | "make the line e1 look better", "tidy this arrow", "clean up that connector" |
| `diagram.link.reverse` | `ids` | swap the ends, with their sides, ports, marks and free points; the bends are passed the other way (a link with a free end is made again, its ends swapped) | "reverse the arrow", "flip the direction of e2" |
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
| `diagram.group.chart.make` | `label`, `labels`, `values` (both optional), `layout`, `dimension`, `measure`, `aggregate` (count, sum, avg, min, max), `top`, `above`, `below` | make a chart. Its categories: the said labels with their values (pairing up [invalid-chart-data]); labels without values take sample values; no labels: the typical categories of the said dimension (`k.charts.category`: months, quarters, regions, roles, payment methods ... 41 dimensions), else the dimension's name with A-D, else A, B, C, all with sample values, the group marked `sample=true` and the reply saying so. Only the `top` largest, or the categories above/below a value, are drawn. The dimension is the x axis title, the measure (with its aggregate: "total sales", "number of staff") the y axis title | "add a bar chart of sales by month: January 10, February 20", "a pie chart of the votes", "a bar chart of staff by rank", "revenue per region, top 3" |
| `diagram.chart.value` | `id`, `category` (label or code), `value` | set one value [missing-category] | "make March 40", "set the value of Yes to 7" |
| `diagram.chart.category.add` | `id`, `label`, `value` | a category at the end | "add a column for April with 25", "add a slice Other 3" |
| `diagram.chart.category.remove` | `id`, `category` | remove a category | "remove February", "delete the last bar" |
| `diagram.chart.category.rename` | `id`, `category`, `label` | rename a category | "rename Jan to January" |
| `diagram.chart.format` | `id`, `title`, `xLabel`, `yLabel`, `valueLabels`, `gridlines`, `legend` (none, right, bottom), `yMax` (top of the value axis; values above it drawn at the top), `layout` (bar, line, area, pie, doughnut: the chart type changed in place), `palette` (a `k.styles` theme: each category takes the theme's next swatch, in category order) | formatting [missing-property] | "call the chart Sales 2026", "label the y axis Units", "hide the values", "show gridlines", "put the legend on the right", "cap the y axis at 100", "convert that graph to a pie", "use a pastel palette" |
| `diagram.chart.format` (chart-format.sop) | number properties `fontSize` (6-40, 12), `lineWidth` (0.5-12, 2), `markerSize` (2-40, 12), `markerEdge` (0-8, 1.5), `barWidth` (the share of the category's room, 0.1-1), `barGap` (the same slot the other way round), `pieRadius` (30-300, 90), `precision` (0-4 decimals); named properties `titleWeight` (normal, bold), `titleColour`, `titlePosition` (top, top_left, bottom), `axisSide` (left, right: the value axis with its numbers), `invert` (none, x: categories from the right, y: bars from the top), `axisScale` (linear, log: decades, log10 from powers of ten and an interpolated mantissa table), `tickFormat` (plain, magnitude: 1.2k 3M, power: 10³ 2.5×10³), `lineStyle` (solid, dashed, dotted, dash_dot), `gridStyle` (solid, dashed, dotted) | a number property takes a number within its declared limits; a reader's comparative ("bigger font", "thinner line": operator delta, step more/less) is one step of the scale of size (`k.expect.scale`, x1.4 / x0.7) from the value the chart is observed with (its own or the usual one), declared by `app.execution.values`/`observedMeasure` as for a drawn object's size. `barGap` takes words: a `k.values` comparative moves the bar width one step the other way (x0.8 / x1.25), none fills the room, medium/normal the usual width; any other word is refused [unknown-degree]. Number properties are observed as drawn, named ones when the chart has them | "make the font bigger", "put the y axis on the right", "invert the x axis", "dashed line", "log scale", "show the ticks as powers of ten", "one decimal place", "wider bars", "no gap between the bars", "a bigger pie", "make the title bold dark blue" |
| `diagram.page.change` | `background` (a colour name of `k.colours`), `title` | the page's background and its title (drawn centred at the top) [missing-property] | "give the diagram a green background", "name this page Bean Ledger" |
| `diagram.chart.highlight` | `id`, `test` (below, above), `value`, `colour` | conditional colours: each category whose value is below (above) the threshold takes the colour | "make the months below 20 red", "colour the losing quarters red", "highlight values over 50 in green" |
| `diagram.chart.sort` | `id`, `order` (ascending, descending, label) | reorder the categories | "sort the bars from highest to lowest", "sort alphabetically" |
| `diagram.group.layout` | `id`, `layout` | chart type | "make it a line chart", "turn it into a doughnut", "show it as an area chart" |
| `diagram.node.change` / `diagram.style.apply` | colour, `theme="highlight"` on a category | colour or highlight one bar or slice | "make the March bar red", "highlight the biggest slice" |

The reader's chart keys reach these operations through declared key alignments (`execution-policy.sop`
`app.execution.keyBinding`/`keyValue`, specs/semantic-frame.md §5): `chart.grid` → `gridlines` (show/hide),
`chart.show_values`/`showValues` → `valueLabels`, `chart.legend`/`showLegend` → `legend` (show → right, hide → none,
right, bottom), `chart.max` → `yMax`, `chart.sort` → `diagram.chart.sort order` (desc, asc, alpha), `chart.type` →
`layout`, `chart.palette` → `palette` (pastel, monochrome, sunset, dark, forest, ocean, classic, vivid; warm → sunset,
cool → ocean, rainbow and default → vivid), `chart.id` and `point.chart` → the group's `id` (the chart named).
`chart.title` → the group's `label` (the label a new chart is made with; `diagram.chart.format` takes `label` too),
`chart.values` → `values` read as numbers; a list said with coordinators ("Q2 and Sample") is split into its items.
A chart made with values only numbers its categories ("1", "2"); one made without values starts from the sample values
3, 5, 2, which the reply names. (Sample categories named "A", "B", "C" made the reader read the article of a later
"add a pie chart" as the node named A.) A chart point named without a kind word ("set March to 40", "add September
with 58") stays unbound: it needs a chart-point class in the binding table and a declared verification of the bars a
value change re-lays out.
The data drops' chart frames (management/data-drop dg-batch-01..05 `needs`) are declared as reader keys for v9 and
bound the same way: `chart.fontSize`, `chart.lineWidth`, `chart.markerSize`, `chart.markerEdge`, `chart.barWidth`,
`chart.barHeight` (→ `barWidth`), `chart.barGap` (words), with comparatives labelled as steps (operator delta) for the number keys, `chart.pieRadius`, `chart.precision`, `chart.titleWeight`,
`chart.titleColour`, `chart.titlePosition`, `chart.axisSide`, `chart.invert` (off → none), `chart.axisScale` (both
log → log), `chart.tickFormat` (powers of ten → power, magnitudes → magnitude), `chart.lineStyle` (dash-dot →
dash_dot), `chart.gridStyle` → `diagram.chart.format`; `chart.dimension`, `chart.measure`, `chart.aggregate`,
`chart.top`, `chart.above`, `chart.below` → `diagram.group.chart.make`; `diagram.background`, `page.background`,
`page.title` → `diagram.page.change`.
`chart.min`, `chart.horizontal`, `chart.stacked`, `chart.width`/`height` and `chart.effect` stay unbound and are
disclosed: the catalog's `w.diagram.group` (closed, hand-core) has no slot for a value axis minimum, a bar
orientation, stacking or a chart size, so no rule can keep them (needs catalog slots in sop-knowledge-worlds).

Not yet (each needs a rule set or a mechanism, listed honestly; from the owner's request and
management/data-drop/pilot/FEATURE-REQUESTS.md B1-B12):
- several series per chart (grouped and stacked bars, several lines, series rename/recolour/reorder/merge, a second
  value axis): needs `w.diagram.series` and `w.diagram.datum` facts and grouped/stacked placement rules;
- horizontal bars, tick density, trend lines and moving averages (least-squares sums in rules), callout annotations;
- error bars and their caps (needs an error value per category: `w.diagram.node` has none), colour bars, panels,
  marker shapes and marker intervals, legend position for bar and line charts (a single series has no legend),
  the x axis on top, a chart's place on the page by region ("on the left", "below the image"), bins (a histogram
  needs the raw values, not categories), aggregation over records (no table of records in the Diagram tab: the
  aggregate names the y axis title only), a filter on category names ("only 2023");
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
| Toolbar "Line" (route, arrowheads, dash): the look of new connections; with connections selected, also theirs | new: the arguments of `diagram.link.make`; selected: `diagram.link.change {ids, route|style|arrow|head}` |
| Hover a node: its ports (the middle of each side); drag from a port and release on a node (snapping to a port within 16 px) | `diagram.link.make {from, to, fromSide, toSide?, ...line type}`; released over empty space: nothing is made |
| Selected connection: drag an end handle onto a node or port | `diagram.link.attach {ids, end, node, side?}`; released over empty space: `diagram.link.detach {ids, end, x, y}` (the end stays free there) |
| Selected connection: drag a middle handle (or the line), a bend handle; double-click a bend | `diagram.link.bend.add {ids, x, y, after}`, `diagram.link.bend.move {ids, bend, x, y}`, `diagram.link.bend.remove {ids, bend}` |
| Selected connection: drag its label | `diagram.link.change {ids, labelPosition}` (the fraction of the line nearest the drop) |
| Inspector: Start side, End side, End mark, Start mark, Label position; Remove bends, Detach start, Detach end | `diagram.link.change {ids, fromSide|toSide|head|tail|labelPosition}`, `diagram.link.bend.remove {ids}`, `diagram.link.detach {ids, end}` |

## Status (2026-11-20)

Link geometry (`worlds/diagram.sketch/link-schema.sop`, `link-geometry.sop`; `tests/diagram-link-geometry-declared-host.test.mjs`,
9 tests; browser `tests/diagram-link-edit-browser.test.mjs`): a link with a side, a free end or a bend, every curved or
elbow-routed link between two units, and links sharing their two nodes are drawn by the area's router, not the page's
gap routing (which keeps top-down flows, links inside a group and loops). Orthogonal pieces choose the least costly of
four plain ways, then of corridors 24 beyond each node a plain way crosses (10000 per node crossed or passed within 6,
400 per end against its stub, length, 20 per turn); curves without bends choose their bow (0.2 to 0.9 either side) by the
fewest sample points near other nodes; links between the same nodes fan out (14 apart along a side, 12 for straight
lines, 0.35 more bow). A free end has no node (the link is made again without it). Moving the nodes at both ends of a
link moves its bends; while a node is dragged its links follow (a dashed line for a link with one end moved). Named
ports (in, out; yes, no, else; lid, base) are declared in link-geometry.sop until k.diagrams carries them. The keys are
the area's own (`diagram.sketch.*` on `w.diagram.edge`, the kind `diagram.sketch.bend`), queued for `w.diagram` at a later
knowledge pin. Measured: a 12-node grid with 15 orthogonal links, 1.0 s per command (0.2 s without the router).

Delivered and tested (`tests/diagram-capabilities-declared-host.test.mjs`, 10 tests): every operation above except the
items listed as not yet. Layouts are checked by geometry (no overlaps, a ring of equal radii, outer rings for deeper
levels, directions, exact alignment, equal distribution, crossings 1 -> 0 after improve). Organic (force-like) layout
through std.problem/Z3 is not implemented: the library's internal search enumerates the grid of every variable
(at most 2,000,000 combinations, so 2 or 3 nodes), and Z3 runs only asynchronously in an isolated browser page, while
an area command compiles synchronously; it needs an asynchronous solve step for a whole-page problem in the
application route (src/dialog, owned elsewhere). Crossing reduction is the level layout's own ordering (first
parents) plus improve; there is no crossing-count objective. Geometry without sine and square root uses Bhaskara's
sine and the alpha-max-plus-beta-min length (rules in layout-modes.sop), since a library change was not needed.
