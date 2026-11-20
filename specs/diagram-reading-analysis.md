# Diagram reading analysis (owner session, phrase log v4, 2026-11-20)

The owner's Diagram session, turn by turn: what the reader produced (`read.cut`, `read.sop`), where the turn failed
(reader, bindings or compiler) and the generic piece that fixes it. Evidence was reproduced with
`training/sop-bert/probe-bundle.mjs BUNDLE NODE_MODULES PROBES.jsonl [--run]` against the deployed reader (v7, rebound
bindings) and a seeded Diagram area, and with the bridge-plus-route tests in
`tests/diagram-reading-declared-host.test.mjs`, which feed the reader's own reading (or the correct one) to the real
app route. Part B owns the Diagram operations (`specs/diagram-capabilities.md`), part C the reader's training data.

## Per turn

| Turn | Reader | Layer that failed | Fix (generic) | Status |
| --- | --- | --- | --- | --- |
| "ad a diagram with 5 nodes" | make, type=node, kind="diagram", `node.n`=5 | bindings: "diagram" has no kind row for type node; `node.n` had no alignment | **containment**: the exporter publishes `bindings.containment` from catalog slots (`w.diagram.node.diagram` is a `w.diagram.diagram`), and the bridge reads a new member named by a kind of its container family as a member of its own family; **`node.n`** aligned to the make's count (`w.request.constraint.number`, canonical `count`, bound by the declared count port) | done: 5 rectangles; also "create a flowchart with 4 steps" (ambiguous "flowchart" stays inside the container family), "make a diagram with 3 circles" |
| "add another box", "add a box" | make, kind=w.diagram.node | compiler: `diagram.node.make` needs `kind`; "box" is the node family's own word, which names no shape value (`missing-declared-seed`) | `seed.kind` is no longer required (an empty required `kind` is still refused as a missing argument); a family default in `execution-policy.sop` gives a family-only node the flowchart process shape (`k.diagrams.shape.flowchart.process`: rectangle) with the notice "I chose the shape; you can change it or undo." | done ("node", "step", "box", "boxes") |
| "add a circle", "add another circle" | make, kind=k.shapes.shape.circle | none | none | worked before; still works |
| "connect alle lements", "connect all elements" | connect, type=link, no `from`/`to` spans (`illegal-I-after-O`, `presence-span-inconsistent` on `diagram.link.from/to`) | reader: no endpoint spans and no population target; compiler: no population projection | reader (part C): train "connect all/every X" as a population target (`fill=all`, kind span) with no endpoints; compiler: a population of existing nodes with act connect binds to part B's `diagram.links.connect {ids, pattern}` with the declared default pattern `chain` (creation/reading order), disclosed and undoable | open: needs part B's `diagram.links.connect` and the reader's population reading; `connect` with explicit ends works now (below) |
| "connect cirles with an arraw" | make (!), `link.from`="ci", `node.label`="arraw" | reader: typos cut inside words | reader (part C): typo variants of kind and part words in training data; the existing spelling policy (`project-create-action.mjs`, `lexical-grounding.mjs`) only repairs a kind span of a make, not endpoint values | open (reader) |
| "improve layout" | arrange, type=page, fill=context | bindings: no kind for the diagram page; no operation for the whole diagram's layout | part B adds `diagram.layout.improve` (no parameters) and `diagram.layout`; binding: the page/diagram family to those operations and act `arrange` on an existing page | open: waits for part B's operations |
| "make the line e1 to look better" | change, type=node, name_span=e1, `node.ids`="e1" selector, vague constraint metadata | bindings: e1 is a link code read as a node; the vague "look better" has no property | **code reference** (`src/dialog/project-code-reference.mjs`): a name span equal to an observed code names that object; the reading is re-bridged with the object's own family (type corrected, the ids restatement dropped, keys moved to the object's family when it declares the same property), the object as context target, and the reply says "I took "e1" as the link e1 (the reader took it as a node)."; "look better" maps to a declared improvement operation once part B has one for links (route/straighten) | code part done ("make e1 dashed", "delete e1", "make n2 red"); the vague improvement is open |

## Further generic gaps found while reproducing

- "connect A to B" (a perfect reading) failed: `link.from`/`link.to` had no alignment and act `connect` matched no
  operation. Fixed by aligning the diagram properties (`node.label`, `link.label`, `group.label`, `link.from`,
  `link.to`, `link.style`, `link.arrow`, `link.width`, `node.kind`, `node.shape`, `node.value`, `node.n`) to their
  `w.diagram` slots with native chains, by a declared act form (`app.execution.actForm act=connect mode=new as=make`:
  connecting makes the joining line, k.actions.act.connect), and by declared reference concepts
  (`app.execution.reference`): a line's end is an observed node named by its code, label or kind; a name or kind two
  nodes share stays ambiguous and nothing is applied.
- "make the circle red" failed on the Diagram tab: the colour concept is looked up to an RGB code, while the diagram's
  colour parameter takes declared names. A parameter with declared names now takes the said name itself.
- "add an oval": the k.shapes kind is named "oval" while the diagram's `kind` enum has "ellipse" (part B's new shape
  list adds `oval`), so the kind seed finds no value; it is refused as a missing argument, not drawn as something else.
- "add an element", "add a shape", "add an item": catalog words added to `w.diagram.word.node`; they bind after the next
  PSys2 catalog pin bump and bindings regeneration.
- "add 5 nodes", "add 3 boxes": the reader marks `target.kind`/`target.count` present without spans
  (`presence-span-inconsistent`); with a correct reading (kind span and `node.n`) they compile. Reader (part C).
- A resolved code still adds "I used the most recent matching circle" when several objects share its kind: the
  execution note does not know the focus chose it (`capability-plan-execution.mjs`, owned by the quantities work).

## Bindings rebuild

`training/sop-bert/bindings/semantic-alignments-v2.json` (31 aligned properties, was 21), the exporter's containment
table (`training/sop-bert/export-structural-bindings.mjs`), then: `build-binding-source.mjs OUT.mjs`,
`regenerate-semantic-bindings.mjs SPEC.json` (inventory: the committed `official-dataset/inventory.json`), and
`rebind-reader-bundle.mjs` of the deployed v7 bundle; `docs/webchat/models/sop-bert/deployment.json` points at the
rebound bundle.

## Binding coverage and the human-utterance benchmark (2026-11-20)

The exporter now binds every Diagram and Drawing inventory key a declared operation parameter can consume
(`specs/structural-bindings.md`, native-chain coverage): Diagram 59 of 99 keys bound (was 13), Drawing 25 of 32
(was 7). Unbound keys have no native parameter: the chart, point and series keys (the area refuses chart composition),
`node.anchor/at/position/relation`, `diagram.kind`, the `*.effect` keys; Drawing `drawn.kind` (the kind a make draws is the target's), `drawn.at/direction/distance/
distanceGrade`, `group.members`, `part.owner`. `tests/binding-coverage-declared-host.test.mjs` fails when an interface
gains a parameter the deployed bindings do not bind.

Human benchmark (training/sop-bert/data/human-benchmark-v1, run-benchmark.mjs + score.py, reader v7 with the
regenerated bindings, PSys2 HEAD worlds without part B's new operations): Diagram 25/333 pass (baseline 18, measured
with reader v6), Drawing 38/329 (baseline 36; 3 items regressed, two of them reader parses). The remaining Diagram
failures are reader-layer (273): inconsistent heads; 19 bindings-layer failures are kind words — "shape(s)" (catalog
word added, active after the pin bump), page kinds as a new target ("generate a diagram", "a mind map"), "the first
shape" (no ordinal projection) and chart kinds.

Page operations (`diagram.layout`, `diagram.layout.improve`, `diagram.style.apply` without ids, `diagram.steps.number`)
are bound by key but a request needs an existing target: the area does not observe the page (`diagram.sketch.page`) as
an object, so "improve layout" / "lay out the diagram as a tree" cannot compile until it does (part B), after which the
page kinds bind to it like any family.

## Requested reader keys (management/data-drop/pilot/FEATURE-REQUESTS.md, section E)

Bindings for new keys need no hand work: once a key is in `official-dataset/inventory.json` and a declared operation
parameter consumes it (named in the key's descriptor, or a parameter of the key's name on the family's source type),
the exporter binds it and `tests/binding-coverage-declared-host.test.mjs` fails until the bundle is rebound. What each
requested key still needs is the operation parameter (area owners) and the key itself (dataset):

| Key | Needs | Compiler support present |
| --- | --- | --- |
| `drawn.becomes` | `drawing.object.change kind` (change of kind; today only the make takes `kind`) | binding automatic once a change op takes `kind` |
| `drawn.region` | a region parameter on `drawing.object.make/place` (k.scenes regions are already used by default placement) | automatic |
| `drawn.flip`, `drawn.rotate`, `node.rotate` | `flip`/`rotate` parameters on the change ops | automatic; numbers pass as numbers |
| `drawn.swap`, C3 swap | a swap operation taking two codes (`ids`); the act needs a capability mode (`act=swap target=existing`) | codes resolve through the code reference; ids take a comma list |
| `drawn.material`, `drawn.shadow` | change-op parameters | automatic |
| `part.garment`, `part.owner` | a part make on `art.draw.part` with `garment`/`owner` (owner: a reference to the object, declared like a line's ends with `app.execution.reference`) | reference lookup by code/name/kind exists |
| `page.theme`, `page.improve`, `diagram.grid` | page operations exist on the Diagram (`diagram.style.apply`, `diagram.layout.improve`, `diagram.layout`); the page must be observed as an object to be a target | bound by key once the page is observed |
| `node.width/height` numeric | `diagram.node.resize` exists; bound now | done |
| `chart.axis`, `chart.trendline`, `chart.condition`, `chart.side.series` | chart operations (the area refuses chart composition today) | automatic once declared |

Cross-cutting: C1 dependent edits reuse the focus and the previous reading (context and code references); C4 typo
tolerance is reader-side (part C) — the compiler only repairs a creation's kind spelling.

## After part B's operations (catalog 06cf9056, 51 Diagram operations)

Regenerated bindings: Diagram 69 of 99 keys bound (charts are numeric groups: `diagram.chart.format`,
`diagram.group.chart.make`, `diagram.chart.value`; page keys to `diagram.layout`, `diagram.style.apply`,
`diagram.colour.by`, `diagram.steps.number`), Drawing 25 of 32. The page families (`diagram.page`, `diagram.diagram`)
align to `w.diagram.diagram`, the observed page; a context arrangement resolves to it (reference policy `read.arrange`),
and an arrangement with nothing more said is the declared improvement (`app.execution.actOperation`
`diagram.layout.improve`, mode `arrange`), with a layout said it changes the layout (`actForm results=some`).
App route and Chromium: "improve layout" now updates the diagram. Still refused, all reader readings: "connect all
elements" (read as select), "make it pastel" (read as node colour "pastel"), "colour each level differently"
(constraint without a key), "add a bar chart of sales by month" (bar and chart cut apart), "make the line e1 to look
better" (no declared improvement for a link). Remaining unbound keys have no parameter of that name: chart
grid/min/max/showValues/sort/stacked/horizontal/palette/width/height/datasets/source/series/effect (the format operation
names them gridlines, yMax, valueLabels; renaming needs a reviewed alignment), series and point keys, node relations.
