# ui-diagram-v2: voice and chat control of the Diagram editor

Reader rows for almost anything a person says to control the Diagram tab: every operation of
`worlds/diagram.sketch/native-interface.sop` and of `specs/diagram-capabilities.md` (styles, themes, colour-by, whole-diagram
layout, align/distribute, step numbers, connect patterns, duplicate/insert/merge/split, reverse, routes) x parameter x
reference form x UI control, in three tiers (equivalent, complex, simplified), plus robustness variants of the same rows
(typos, missing spaces/slipped word boundaries, ASR-like substitutions and spoken codes, fillers, politeness), compound
requests and questions. Deterministic generator, no network: `python3 heldout.py && python3 generate.py && python3 validate.py`.

| File | What it is |
| --- | --- |
| `engine.py` | span markup (`[t:]` trigger, `[k:]` kind, `[n:]` written reference, `[d:]` population description, `[q:]` count, `[c:key\|words\|value\|opts]` constraint, `<<...>>` request spans), observed scenes, noise, row assembly |
| `vocab.py`, `frames.py` | surface vocabularies and the slot machinery (`{nref}`, `{npop}`, `{lref}`, `{from}`, `{colour}`, ...) |
| `cases.py` | the case catalogue: 112 cases, each with authored frames per tier |
| `inventory.json` | the reader keys this corpus adds (merged into `official-dataset/inventory.json` by its build) |
| `examples.jsonl` | the corpus (row shape of `ui-coverage-v2`; source `ui-diagram-v2` of the official dataset) |
| `heldout.py`, `heldout-voice.jsonl` | the held-out voice set: hand-written, never in the corpus or the official dataset (checked) |
| `coverage.json`, `validation.json` | rows per case and variant; validation result |

## Label contract (what the text says, verbatim spans)

- Contexts are observed scenes: nodes `n1..` (kind, optional label), links `e1..`, groups `g1..`; `context.existing` holds
  `{kind, name, id}` with the label (else the visible code) as name and the code as id. Texts use labels and visible codes
  (`n3`, `e1`, "line e1", "node n2"), never tool slot ids. A spoken code ("e one", "N 2") keeps the code as selector value.
- Written references: `name_span` plus one selector per name (`node.ids`, `link.ids`, `group.id`). Kind descriptions ("the
  diamond", "the oval"): `fill: description`, `kind`/`kind_span`. Ordinals ("the second circle", "the last one", "the one I
  just added"): `ordinal` (first ... last, newest, previous, leftmost, biggest ...), `fill: context` without a kind.
- Populations: `fill: all`; a kind word gives `kind`/`kind_span` ("all the circles", "the circles", "every box"), a generic phrase
  gives `description_span` ("all elements", "everything", "all the nodes"); explicit all/every/each/both give `quantifier`.
  The selection and pronouns ("it", "these", "these two", "the selected ones"): `fill: context` (`count_span` for "these two").
- New links between two nodes: endpoints are `link.from`/`link.to` spans of what the text says ("connect Start to n3",
  "connect it to Done"). Many links at once (specs/diagram-reading-analysis.md): the joined nodes are the request's target
  (`act: connect`, target `node`, `mode: existing`): a population (`fill: all`, "connect all elements", "connect cirles
  with an arraw"), the selection ("connect them", "connect these two") or names (`node.ids`); `link.pattern` (chain, cycle,
  star, all) for "in order", "in a loop", "to each other"; a hub is `link.from`/`link.to` ("connect Start to all the boxes"). Existing links: code, endpoint selectors (`link.from`/`link.to`, phase selector, `kind` = the link
  noun), context or ordinal.
- Container words: "add a diagram" is a new member named by its container's kind (target `node`, `kind: diagram`); "a diagram
  with five boxes" labels the member kind and `node.n`; "to the diagram", "on the canvas" carry no label.
- Charts: target `chart` (`chart.id` selector; creation with `chart.type`, `chart.title`, `chart.labels`/`chart.values`, the
  official majority form), formatting on the chart (`chart.title`, `chart.legend` show/hide/top/bottom/left/right,
  `chart.show_values`, `chart.xLabel`/`chart.yLabel`, `chart.grid`, `chart.min`/`chart.max`, `chart.stacked`,
  `chart.horizontal`, `chart.sort`, `chart.palette`, `chart.colour`, `chart.effect`), dataset items as `point` (a category:
  `chart.labels` selector or new label, `point.value`, `delta` for "increase by 5", `point.chart` for "in Sales") and `series`
  (`series.label`, `series.values`, `series.colour`). Effects on nodes/the diagram: `node.effect`, `diagram.effect`
  (shadow, gradient, glow, rounded, animation, transparent, 3d, outline; `polarity: negative` for "remove the shadow").
- Vague aesthetic requests ("improve layout", "make it look better", "tidy up", "fix the layout"): `act: arrange` on target
  `diagram` (`fill: context`) with no constraint: the declared improvement (`diagram.layout.improve`); on one object or a
  population the same reading with that target ("make the line e1 to look better": `link`, `link.ids` e1). Theme words are
  `diagram.theme` ("make it pastel", "black and white" -> monochrome, "highlight Api" -> highlight on the nodes).
- Counts of new nodes are `node.n` (the native parameter; the official build also converts `target.count` of new diagram
  nodes to `node.n`). Comparatives follow the official build (`delta` with `step`, the comparative word as value span).
- New keys (inventory.json): `diagram.{direction,spacing,route,theme,by,steps}`, `diagram.layout` +layered/free,
  `node.{outline,textColour,fontSize,fontWeight,role,edge,axis}`, `node.shape` +rounded_rectangle/oval/chevron/
  double_rectangle/document/actor/dot/text, `link.{route,pattern}`, `link.arrow` +back, acts `merge`, `split`, `reverse`
  (duplicate is `copy`, insert is `make` with `node.position` between/in/on and `node.anchor`).

## Result (measured)

See `coverage.json` and `validation.json` for the current numbers (rows per case and variant, 0 errors required).
