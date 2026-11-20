# Semantic frame: a domain-general reader representation with partial execution

Status: prototyped 2026-11-20; §5 partial admission is delivered on the key route (see §5). The frame, its compiler
and the oracle study exist; the reader does not emit frames yet. Contract in the library: `docs/semantic-frame.md` (sopworld 0.237.0, vendored,
`src/semantic-frame.mjs`). This spec implements the proposal of `specs/human-utterance-benchmark.md` §6.

## 1. Why

The reader labels requests with ~230 `area.type.key` heads copied from tool parameters. The same concept is learned
once per tool, every new tool needs new keys, data and a retrain, and one inconsistent head among ~230 discards the
whole reading: 73–91% of failed benchmark items carry a reader-consistency flag (§4 of the benchmark spec). The frame
replaces the heads by about 25 roles that are the same for every tab, and moves the choice of tool and parameter into
the compiler, which takes it from declarations.

## 2. The frame (reader output)

Per message: `text`, `area` (context, never a label), `previous` (the previous message and its frame), `clauses`,
`structure`. Per clause:

| Role head | Values |
| --- | --- |
| action.act | make, change, place, remove, connect, arrange, swap, copy, group, ungroup, merge, split, reverse, select, answer, undo, redo, compose, converse, show |
| action.mood / polarity / predicate / trigger | do, ask, check, propose; positive, negative; the verb as said (open); its span |
| mention.head / span | the noun as said (open span) |
| mention.determiner | definite, indefinite, demonstrative, possessive, another, other, every, none |
| mention.quantity | number, vague amount (some, few, several, many, couple, handful, dozen), all |
| mention.modifiers | spans ("old", "hot air", "pig logo") |
| mention.possessor | index of the owner or whole ("the sun's rays", "roof of the house") |
| mention.reference | new, name, description, anaphora, population, ordinal, code, context (+ name, code "e1", ordinal list, antecedent) |
| mention.role | theme, landmark, goal, possessor, member |
| attribute.concept / value_type | colour, size, label, name, shape, kind, layout, width, … (a closed concept list, ~40); value type |
| attribute.operator / step / phase | eq, degree, delta, factor, region, less.equal, greater.equal; more, much_more, less, much_less; result, selector |
| spatial.relation / landmark | left_of, right_of, above, below, on, in, near, …; mention index |
| spatial.region / side / distance | top, bottom, corner, background, …; side; number + unit |
| motion.direction / amount | up, down, left, right, closer, apart, forward, backward, in, out; number + unit or degree |
| goal | target state: concept + value, or a mention ("as a hexagon", "into a bar chart") |
| time | start, end, day, duration, recurrence (+ relation, landmark) |
| manner | objective ("better", "readable", "natural") + degree (bit, much) |
| question | count, exists, list, what, which, where, when, who, describe, why, how, how_much, compare, total, average, max, min, difference, percent |
| fragment | adds, replaces, repeats, more, less, confirms, rejects |
| discourse | thanks, greeting, complaint, correction, repetition, confirmation, rejection |
| structure | coordination (several themes in a clause), sequence, condition, instead (between clauses) |

**Compound requests** are clauses with `structure.relations`; an anaphor across clauses names its antecedent
(`reference: anaphora, antecedent: {clause, mention}`) and its request runs after the antecedent's. **Coordination**
("a cat and 2 dogs") is one clause with two theme mentions: one request per theme. **Fragments** ("down", "and higher
still", "on the lake") are clauses with `fragment`; `completeFragment` fills them from the previous frame: a fragment
with its own theme keeps the previous action, one without applies its roles to the previous theme, `more`/`less` repeat
the previous attribute or motion one step further.

## 3. Mapping to std.request (library 0.237.0)

One `std.request` graph per clause × theme, as `prepareRequestBatch` entries with `after` from the structure. New
optional slots carry what had no slot (backwards compatible; old graphs read unchanged): request `predicate`,
`polarity`, `fragment`, `discourse`, `manner`, `degree`, `question`; target `head`, `reference`, `code`, `ordinal`,
`count`, `quantity`, `modifier`, `of`, `role`; constraint `landmark`, `region`, `side`, `direction`, `step`, `variety`,
`valueType`. `frameToRequests(..., {extended:false})` writes only the older slots, which is what the vendored library
(0.236) accepts; the PSys2 prototype uses that mode until the library is re-vendored.

## 4. Concept binding from declarations (`src/dialog/frame-binding.mjs`)

`frameTable` assembles the binder's table from declarations only; nothing names a word, a sentence or a tool:

| Table part | Source |
| --- | --- |
| operations, parameters, repeats | the live tool interface (`host.capabilityFacts`, `native-interface.sop`) |
| kinds (lemma → canonical → source type) | exported kind bindings (`bindings.kinds`, knowledge catalog) and the family's make operation |
| concept rows (concept, on, parameter, canonical) | every exported property binding, named by the frame concept of its *inventory concept* (`training/sop-bert/frame/concept-roles.json`, keyed by concept, never by key spelling) and spelled in the request by its own canonical concept |
| placement (relations and their declared names) | the area's bound spatial-relation concept and its value projection |
| amounts, comparative steps, act forms | `k.expect.amount`, `comparative-projection.sop`, `execution-policy.sop` |

So a frame attribute `colour` on a theme whose kind belongs to `diagram.sketch.node` binds to `diagram.node.change
color` because a declared row says so; the same attribute on a link binds to the link's colour parameter; a vague
amount binds to `std.capability.repeat` with the amount's `typical` count; a spatial relation binds to the placement
compiler. A new tab needs its interface declarations and one concept row per (concept, source type); the reader does
not change.

## 5. Partial execution is first-class

The reading is admitted in parts, not as a whole:

1. **Binding.** `bindFrame` lists every role as bound (with the operation and parameter, placement, repeat or selector
   that takes it) or unbound with a reason (`no-declared-property`, `kind-not-declared`, `no-placement-method`,
   `undeclared-relation`, `no-declared-region`, `modifier-needs-attribute-concept`, …).
2. **Compilation.** `frameToRequests` writes the bound roles and returns every unbound role in `disclosed` with its span;
   vague amounts are in `notes` ("amount some read as 3").
3. **Execution with run-time fallback.** When the host refuses a bound request, `compileFrame` gives an ordered ladder,
   each step naming what it drops: (a) *split*: make the thing with its placement, then change the made thing's
   attributes in a second request (the placement compiler takes relations and a count only); (b) without placement and
   motion roles; (c) the theme alone. A failed sequence is rolled back.
4. **Reply.** The reply states what was done and what was not applied and why; undo covers the whole message (one
   history group); the binding keeps ranked alternatives (ambiguous kinds keep all candidates).

### Partial admission on the key route (delivered 2026-11-20)

The §5 rules run on the current key route; no retrain. Code: `src/dialog/partial-admission.mjs`,
`src/dialog/declared-bindings.mjs`, the `partial` mode of `raw-structural-bridge.mjs`, `assessPartialProposal` in
`reader-admission.mjs`, `dispatchPartial` in `reader-routing.mjs`. Every decision is declared:

| Was refusal-first | Now | Declared in |
| --- | --- | --- |
| `scoreReaderProposal` needs complete coverage, zero failures | a reading the strict path refuses is bridged again in partial mode and admitted for reversible act classes; destructive acts stay all-or-nothing | `reader-admission-policy.sop` `reader.permit.partial` |
| the bridge's `unresolved(...)` reasons fail the request | an unbound constraint, relation (with its anchor), count, ordinal, name, reference detail, turn, quantifier or question detail is dropped from its request and disclosed; only a missing action, theme kind or source stays fatal | `raw-structural-bridge.mjs` `dropUnbound` |
| a field the reader left out fails the request | defaults: mood `do`; a request without an act whose theme is new is made (a scene description); a new theme of `make`, else existing; phase result, operator eq, character requirement, polarity positive | `interpretation-policy.sop` `app.interpret.default` |
| one inconsistent head refuses the reading | the reading stays incomplete for the strict path; partial admission keeps the consistent heads. An inside tag after an outside tag starts a span (BIO repair, still reported). Adjacent kind mentions that spell a declared kind lemma are one mention ("bar" + "chart"); otherwise the first mention that names a declared kind is made and the others disclosed | `key-reader-inference.mjs`, `partial-admission.mjs` |
| calibration configured but unmet closes the gate | reversible acts are applied best-effort with an uncertainty note (also when met only under a looser error limit than the act class allows) | `reader-admission-policy.sop` `reader.permit.unmet`, `reader.permit.over` |
| placement `request-shape` (relation + other constraint) refuses | when the editor refuses a reading (partial or complete) the ladder runs: split (make placed, then change the made thing), without placement, theme only; a refused step is rolled back, the steps that ran are one undo group | `interpretation-policy.sop` `app.interpret.fallback` |
| a family the binding table leaves unresolved (diagram `node`) fails without a kind word | read as its declared class (`w.diagram.node`) | `interpretation-policy.sop` `app.interpret.family` |
| a key whose parameter appeared after the table was exported stays unbound; a class value needs a listed normalization | the deployed table is completed from the live native interfaces by the export's own rule (a parameter of the key's name on the family's source type); a parameter with a closed list takes the reader's class value | `declared-bindings.mjs` |
| an existing target named only by its family ("make the flower green", "make Start red") has no native target mapping when the family also has kind words | a family without a native family binding takes the one binding its own kind rows share; the target then matches any object of that source type by name | `declared-bindings.mjs` (completion 4: own or declared kind bindings; the family's own class as a kind keeps its arguments, a chart is a bar chart) |
| a relation anchor named without a kind word ("put Sun to the left of House") is an unresolved anchor; a family identity is never a placement kind | the anchor phrase names an observed member of the subject's family (its class, matched by that name); a family identity denotes every object of its tool's source type in placement and moves an existing member with its observed extent | `raw-structural-bridge.mjs`, `worlds/native-spatial-interface.mjs` |
| an annotated question (`question.ask`, `asked_key`) fails as `requires-declared-query-projection` | an `ask`-mood question projects through its declared head (`app.query.read.head`: what/which/list of a property → `values` of the bound asked key; count, exists, members) into a `std.request.query` on the request's target; a yes/no `check` stays unprojected (queries require ask mood) | `raw-structural-bridge.mjs`, `reference-projection.mjs` |
| a place or remove request with a selector ("the Simmer box belongs at 200, 150", "delete Start") is refused as `unsupported-target-mode` | `place` takes a selector that must pick one object (`selectorUnique`), `remove` a selector that picks the objects to remove | `capability-policy.sop` `std.capability.mode` |
| a selector on the identity parameter (`node.ids = Plan`) compares the said name with an unobserved field | a selector on a parameter the policy fills with the target's identity (`std.capability.seed source=target.list\|target.id`) is a reference concept: a code, name or kind of an observed object of its source type, observed on each object as its code | `capability-plan-adapter.mjs` `interfaceFacts` |
| a question on a family target ("what colour is Sun?", "how big is n4?") answers `unbound-query-population`; a stated relation whose slots fall in a soft-avoided column or an avoided region is rejected; a multi-word kind ("shooting star") has no placement kind | sopworld 0.238.0: a query on a family mapping takes the whole source type (named members by name); a one-relation slot steers out of hard-avoided regions; the relation placement keeps only hard `app.place.avoid` keep-outs (soft ones are default-placement preferences); a native kind of several words is a quoted string | library `capability-method.mjs`, `placement-method.mjs`; `sop-world-host.mjs`, `native-spatial-interface.mjs` |
| a diagram node placed relative to another node ("put Review below Draft", "a square over n3", "drag n4 near n2") has no relation binding (`node.position`); a target picked by its code (`node.ids = n4`) is a selector the placement compiler refuses; an anchor inside a group is skipped; the diagram's re-layout of other nodes reads as an unintended effect | `app.interpret.relation` declares the `node.position`/`node.anchor` pair like `drawn.relation` with its value names (above/on top of, below/under, left/left_of, right/right_of, near/next_to; after/before/between stay disclosed); a relation mention with its own `anchor_span` is the same pair; an identity selector becomes the target's name for placement; sopworld 0.239.0 measures an anchor in another container by its box; `effectScope reflow` (x, y) declares the diagram's re-layout on node make/place. The re-layout can still move the anchor afterwards (the relation is checked against the anchor's place before the move) | `interpretation-policy.sop`, `declared-bindings.mjs`, `raw-structural-bridge.mjs`, `spatial-placement-execution.mjs`, `native-control-intent.mjs`, diagram `native-interface.sop` |
| "connect cirles with an arraw" read as connect with a new node made a rectangle; "make the line e1 look better" (arrange a line picked by its code) found no operation; a target named by the same words as its identity selector needed an observed name | `app.execution.actForm of=` limits connect-as-make to the joining line's kind (w.diagram.edge), so a misread theme is refused instead of made; `diagram.link.improve` is the line's arrange operation (declared look: orthogonal, solid, 2 wide); arrange takes a unique selector; a target name equal to its identity selector value is left to the selector. Population ends ("connect the circles": a chain over every circle) are not done | `execution-policy.sop`, `capability-policy.sop`, diagram `native-interface.sop`, `capability-plan-adapter.mjs` |
| "make all the circles red" (fill=all) was `unprojected-population-reference`; "make it pastel" / "use a dark theme" themed one node; "connect the circles" / "connect C to all circles" made nothing | a population reference is `std.request.target reference=population` (sopworld 0.241.0: every match seeds the target list); a container's property applied through a member operation (diagram.theme, diagram.by on nodes) reads as the population of the member family (`partial-admission.mjs` containerProperty, also on complete readings); a joining act read with a population theme makes the joining line with the population as its end, and `app.execution.linkPattern` expands an end naming several objects into a chain in reading order or a star from a named end, made as one undo group | `raw-structural-bridge.mjs`, `model-graph-decoder.mjs`, `partial-admission.mjs`, `link-population.mjs`, `execution-policy.sop` |
| "draw a dog next to a tree" with no tree refused the placement; "make Checkout 150 pixels wide" / "2 cm" left the number unapplied; resizing one side of a diagram node needed both | `app.placement.hypothesis role=anchor`: an anchor named by its kind alone that no object is gets drawn first, then the subject is placed (disclosed; undone when the placement still fails; moving an existing thing next to an absent one stays refused); the anchor phrase reads after an indefinite determiner too; `app.execution.canvasUnit` (pixel words) and `lengthUnit` (inch, cm, mm at 96 px/in) convert a unit said with the number of a numeric property whose operation declares the canvas unit; `diagram.node.resize` takes either side and keeps the other | `placement-default-policy.sop`, `spatial-placement-execution.mjs`, `reference-projection.mjs`, `execution-policy.sop`, `declared-bindings.mjs`, `raw-structural-bridge.mjs`, diagram `act-rules.sop` |
| "add a step after Review" / "put Check before Draft" stayed disclosed; the diagram's re-layout moved the anchor after a relative placement | "after"/"before" are the relations next/previous, turned into a side by the page's observed flow direction (`app.execution.flow`: down → below/above, right → right/left); after a call whose declared effects include reflow, a moved anchor is put back where it was by the area's place operation (which pins it), so the relation holds. "between" (two anchors) is not done | `interpretation-policy.sop`, `execution-policy.sop`, `spatial-placement-execution.mjs` |
| "between A and B" was undeclared; "a step under Bake" had no placement kind; "what colour is the fish?" answered unobserved; "connect all elements" / "connect all the circles to each other" made nothing; a make's population target became a population | "between" is a relation said once for two anchors (an anchor phrase listing things splits by the language's coordinators); the placement turns it into a side of each, across the larger separation of the anchors; a kind its family draws with a declared default shape is placed as that shape; sopworld 0.242.0 reads the declared observed property (lowest order) and several fields as several values, and a drawn object without its own colour is observed with its parts' colours; a population is also named by the family's class words ("elements", "shapes"), and the reader's `link.pattern` (chain, cycle, star, all) chooses the pattern (all: every pair); a make keeps its existing population target's earlier reading | `raw-structural-bridge.mjs`, `reference-projection.mjs`, `interpretation-policy.sop`, `spatial-placement-execution.mjs`, `native-spatial-interface.mjs`, art.draw `act-rules.sop`, `link-population.mjs`, `partial-admission.mjs`, `execution-policy.sop` |
| a kind said as "a boat", "the trees", "star shape" or misspelled ("sqaure", "laake") was "kind words not bound"; "under the tree there" named an object "tree there"; colour answers were RGB codes | a declared raw reading reads the target kind after its determiners, by each word's singular (w.lang.en), as the first declared kind among its words (before the family's own class word), else as the one declared kind within one edit (two for words over six letters; words of four letters or more); a place deictic after an anchor noun (w.lang.en.pron deictic=place) is dropped; an RGB value is said as its nearest core k.colours name | `partial-admission.mjs` kindReadings, `reference-projection.mjs`, `raw-structural-bridge.mjs`, `values.mjs` nearestColourName, `native-query-execution.mjs` |
| the split step of the fallback ladder ("add a box called Deliver under Bake": place, then change the made thing) lost every follow-up constraint; "trash it", "drop that one" were not resolved | the follow-up keeps its constraints by id (the ladder works on a copy of the reading); the reference policy resolves a context reference of remove, copy, place, pick and select through the same focus salience as change and arrange (`app.reference.act`), and an act that says nothing more on its referent is bridged with the resolved target | `partial-admission.mjs` fallbackLadder, `reference-policy.sop`, `project-context-action.mjs` |
| a numeric property's value span with words ("size 45", "two hundred sixty") is passed as text and skipped by the tool | a property whose native parameter is a number (kind=number\|integer on its source type) takes the one number its span spells (digits or a run of declared number words, k.values); a span with two numbers or a unit word stays unnormalized. The strict reading bridges with the completed table too | `declared-bindings.mjs` (`numeric`), `key-reader-value-proof.mjs` `spelledNumberProof`, `key-reader-pipeline.mjs` |
| a reader key named differently from its native parameter (`chart.grid`, `chart.show_values`, `chart.max`, `chart.sort`, `chart.palette`) stays unbound, and one bound to a retired source type (`chart.type`, `chart.id` on `data.charts.chart`) never reaches the chart group; a said class value ("hide" for the legend) has no parameter value | a declared key alignment binds the key to the named parameter of an operation's own source type, replacing the table's row; its declared said values are its class values, each resolved by the request compiler (a lookup) to its declared parameter value (legend show/hide → right/none, grid show/hide → gridlines true/false, sort desc/asc/alpha → descending/ascending/label, palette names → a theme's swatches); a value with no counterpart (a legend on top, a scatter type) is dropped and disclosed. A context reading whose value is a class value its span only evidences is projected by the bridge | `execution-policy.sop` `app.execution.keyBinding`, `app.execution.keyValue`; `declared-bindings.mjs` (completion 5), `capability-plan-adapter.mjs`, `project-context-action.mjs` |
| a chart named without a kind word ("sort Grocery spend", "use the ocean palette for Sales") is not found: groups had no observed name | a diagram group is named by its label in the observed context (`app.readerContext.display`), so a family target matches it by name; a change of a chart's members (sorted, recoloured) is a change of the chart | `reader-context-policy.sop`; mass-eval `judge.mjs` |
| a chart point named without a kind word ("set March to 40", "add September with 58") has no family binding | the point family reads as `w.diagram.datum` (a chart's value at a category) through its declared kind binding (`diagram.chart.point.add`); chart categories are observed as `diagram.sketch.point` objects named by their label, the category label (`chart.labels`) and the chart's title (`point.chart`) are observed for selection; the point operations declare the reflow of the other points (x, y, width, height), so the re-laid-out bars verify as a declared dependent layout. Not yet: position ordinals, additive deltas | `declared-bindings.mjs` 3b/4b/4c, `chart-shape.sop`, `native-interface.sop` effectScope reflow, `execution-policy.sop` |
| a chart's axis floor, bar orientation, stacking, plot size and frame effect (`chart.min`, `chart.horizontal`, `chart.stacked`, `chart.width`/`height`, `chart.effect`) have no slot on the closed catalog group, so they stay unbound | catalog slots `y_min`, `orientation`, `stacking`, `width`, `height`, `effect` (catalog 93cf7fdf) with their parameters of `diagram.chart.format`, drawn by chart-shape.sop; key alignments with declared said values (on → horizontal, stacked/on → stacked, off → none); width and height observed as drawn so a comparative steps the scale of size | `execution-policy.sop` `app.execution.keyBinding`/`keyValue`, `worlds/diagram.sketch/chart-shape.sop` |
| a chart series ("add a series named Budget with 40 and 41", "make the Target series gray", "kill the 2024 series") has no class: its family is unresolved and its keys unbound for want of a native source type | the family reads as `w.diagram.series` (`app.interpret.family`), a class published after the table's export: its declared kind binding (`app.execution.kindBinding` without arguments: `diagram.chart.series.add`) is its provenance and family binding, and its keys bind to the parameters of their names on `diagram.sketch.series`; a series is named by its label in the reader context and picked by the label it is observed with (`app.execution.observedMeasure`) | `declared-bindings.mjs` 3b/4b/4c, `interpretation-policy.sop`, `execution-policy.sop`, `reader-context-policy.sop` |
| a scatter plot or dot plot named by its kind is disclosed as having no native layout | `k.charts.kind.scatter_plot` and `dot_plot` are drawn by `diagram.group.chart.make` with layout `scatter` (chart-shape.sop), and `chart.type` takes scatter and radar | `execution-policy.sop` `app.execution.kindBinding` |
| a kind said by its modifier alone ("make a pie chart called Poll" read as kind `pie`, type `chart`) has no kind row | a modifier of compound lemmas whose last word names the family's own class ("pie chart", "pie graph") is that kind when every such compound names the same kind | `declared-bindings.mjs` (completion 6) |
| a node or chart kind the native interface draws but no kind row names ("add a picture", "a table with 3 rows", "add a text", "make a treemap of spending") is disclosed as an unbound kind word | a closed value of the discriminator of a family's make operation (the constructor policy's `kind`; the parameter a declared kind binding sets, a chart's `layout`) that no kind row names is a kind of that family, named by the value and by the catalog's words of that value (`core.word means=<value> of=<a slot listing it>`, bundled w.diagram and k.diagrams vocabularies), its canonical the declared kind (`k.charts.kind.treemap`) or the native value, drawn by that operation with that value | `declared-bindings.mjs` (completion 8) |
| a chart named only by a reference ("bars narrower", "it", "the chart") without a trigger word stays `context-reference-not-bound` and the partial reading drops the reference; a point named by its place ("the third bar"), a value changed by an amount ("bump Thu up by 70"), an axis range said once ("from 0 to 10") are unbound | the context projection binds the reference to the observed object's kind and, when the strict bridge refuses only for what the declared partial defaults supply (an act anchored on its request), bridges with those defaults when nothing is dropped; a reading with a selector goes through the bridge too. Declared value readings before the bridge: `app.execution.amount` (delta with a step and a number → the operation's amount key: `point.add`/`point.subtract`, verified as the observed value moved, effectScope `amounts`), `app.execution.range` (two numbers in one span → low and high key, each with its own words), `app.execution.position` (a target ordinal → a selector on the family's position key, the observed place, k.values ordinals as its normalizations). "the last", a context reading of several requests, are not done | `project-context-action.mjs`, `declared-value-readings.mjs`, `declared-bindings.mjs` (7), `key-reader-pipeline.mjs`, `native-control-intent.mjs`, `execution-policy.sop` |
| a list said with coordinators ("Q2 and Sample") reaches a list parameter as one item; chart values are read as strings | a list-coded property's said value is split at the language's coordinators (`w.lang.en` `coord.sep`); a key alignment may declare its list codec (`codec="number-list"` for chart values); a chart's title is its group's label on a new chart too | `capability-plan-adapter.mjs` `saidLists`, `execution-policy.sop` `app.execution.keyBinding codec` |
| a kind the knowledge knows but the drawing catalog does not draw ("draw an impala", "a stingray in the lake") is refused `drawing-not-in-catalog`, or `placement refused (tool-binding)` in a relation placement | it is drawn as its closest drawable relative in the `k.kinds` taxonomy (a drawable `kind` parent first, else the most similar drawable kind by weighted shared parents), named after the asked kind, with the one colour the knowledge gives it; the reply says what was drawn | `art.draw/area.sop` `app.area.relative` (`worlds/sop-area.mjs` `ensureRelatives`); spec 78 |

The reply names each dropped role and why (`app.interpret.drop` wording) and offers undo; the trace carries
`partialAdmission` (disclosed roles, defaults, fallback step, or the remaining fatal diagnostics). Not done: the
`requireResult`/`selectorUnique` capability modes and the calendar `incomplete.coverage` guard are unchanged.

Declarations added with it: chart kinds of the catalog drawn by `diagram.group.chart.make` with their layout and
sample data when none is given (`execution-policy.sop` `app.execution.kindBinding`, seeds); drawing regions of the
page (`drawing.object.make at=`: sides, corners, middle, and the background/foreground bands of the ground between the
horizon and the foot of the page, `art.draw/act-rules.sop` region step 0).

## 6. Mechanical label conversion

`training/sop-bert/frame/convert_official.py` converts `official-dataset/` (unchanged) to
`training/sop-bert/data/official-frame-v1/` (generated, not committed), with `REPORT.md`/`report.json`. Roles come from
the inventory concept of each key. `check-frames.mjs` validates every converted frame with the library and compiles it
to request batches. Measured on the v8 build (2026-11-20): 60,373 rows, 97.9% converted completely, 2.0% of
constraints unconverted, all of them tool parameters with no meaning of their own (block id ranges, attrs records,
chart series indices, sketch node lists, page modes); 99.9% of valid frames compile to valid request batches.

## 7. Oracle study

`training/sop-bert/frame/bench_to_frame.py` writes each benchmark item's expected outcome as a gold frame;
`training/sop-bert/frame/oracle.mjs MODE` executes it on the real area hosts of the app route (authored requests, no
neural reader) and `score.py` scores it unchanged. Modes: `keys` (what a perfect reader of the official labels could
say: roles without a key are absent, a role whose key has no deployed binding refuses the request, no fallback),
`strict` (the frame admitted all-or-nothing) and `frame` (partial execution, §5). The results are in
`training/results/semantic-frame-oracle.md`. Measured 2026-11-20 (pass rates, lenient scorer):

| Tab | deployed reader | keys | strict | frame (partial) |
| --- | --- | --- | --- | --- |
| Drawing | 10.9% | 31.0% | 27.7% | 44.1% |
| Diagram | 5.4% | 16.8% | 14.1% | 20.1% |

Partial admission wins 54 drawing and 21 diagram items over all-or-nothing on the same frames. With a perfect reading,
the remaining failures are missing declarations and capabilities (chart kinds, regions, pose/facing, node placement,
aesthetic objectives), not representation.

## 8. Migration

1. Library 0.237.0 (published): frame contract and compiler. Re-vendor in PSys2; switch `compileFrame` to
   `extended:true`.
2. Make partial admission the default on the *current* key route first (§5 table): it does not need a retrain.
3. Reader: add frame heads to the key reader trained from `official-frame-v1` + `human-adapted-v1` frames (warm start
   from the active reader), next to the key heads; route through the frame when it measures better on
   `human-benchmark-v1` end to end, per tab.
4. Retire per-key `bindings.properties` review in favour of concept rows; grow coverage by declarations.
