# Human-utterance benchmark and a domain-general reader representation

Status: measured, 2026-11-20. Deployed reader `b8b1a4dd…`, PSys2 `dede8b3b`, app route `routeNewEngine`. The data is
in `training/sop-bert/data/human-benchmark-v1/`.

## 1. The question and the short answer

The owner asked: *"Is there a dataset of typical utterances people make, so we take them one by one and adapt them to our
world, adding knowledge and rules? I feel we do something wrong in principle and only fix small steps."*

**Yes, such datasets exist,** for every tab except node/edge diagram editing (§2). Using real human lines as the backbone
changes the picture sharply. We built a benchmark of 1,314 real human utterances, adapted only in vocabulary to our world,
and ran it end to end through the app route. It succeeds on:

| Tab | Success |
| --- | --- |
| Drawing | 11% |
| Diagram | 5% |
| Calendar | 5% |
| Avatar | 0% |
| Document | 0% |

On the synthetic test set, the same reader reaches 34–41% complete-meaning exact match (`reports/official-v6.json`).

**The principle problem is measurable** and has three parts:
1. The reader's labels are tool parameters ("Native parameter: chart.change.colour"). There are 230 area-specific keys. The
   reader must learn, from synthetic paraphrases, which area's `colour` a word belongs to, and every new capability needs
   new keys, new data and a retrain.
2. Only 23 of the 230 keys the reader predicts have a reviewed semantic binding in the deployed `bindings.json`. Even a
   perfect parse fails in avatar, document and most of calendar and diagram.
3. A reading is all-or-nothing. One inconsistent head among about 230 makes "no candidate". This happens in 73–91% of
   failed items.

Section 6 proposes a frame-like, domain-general representation, compiled through knowledge, with human corpora as the
data backbone.

## 2. Public human-command corpora (verified 2026-11-20)

The owner's decision: corpora are used line by line as inspiration for our own adapted examples. Raw data stays local and
is never redistributed or trained on directly. Each item records its source corpus, source id and licence. For
non-commercial or unlicensed sources the original line is withheld.

| Corpus | Size (total / relevant) | Human-written | Licence | Tab | Use |
| --- | --- | --- | --- | --- | --- |
| CoDraw (Kim et al. 2019) | 9,993 dialogues, ~138k utterances / all | yes | CC BY-NC 4.0 | drawing | closest match: clipart placement ("boy wearing hat, left of tree") |
| Abstract Scenes v1.1 | 10,020 scenes | descriptions, not commands | not verified | drawing | vocabulary only |
| MagicBrush | 10,388 turns / most | yes | CC BY 4.0 | drawing, avatar | add, replace and attribute edits; person edits for avatar |
| BLOCKS (Bisk 2016) | ~16k / all spatial | yes | none stated | drawing, diagram | relative moves |
| IGLU | 6,828 single-turn | yes | MIT | drawing | quantified relative placement |
| Emu Edit test | ~3.6k | yes | CC BY-NC 4.0 | drawing, avatar | edit commands |
| Visual Genome / SpatialSense | 2.3M / 17k triplets | descriptions | CC BY 4.0 / BSD-2 | drawing | relation vocabulary |
| MASSIVE en-US (= SLURP text) | 16,521 / 2,370 calendar | yes | CC BY 4.0 | calendar | create, query and remove; date, time and person slots |
| HWU64 | 25,716 / 2,986 calendar | yes | CC BY 4.0 | calendar | overlaps SLURP |
| CLINC150 | 23,700 / 900 | yes | CC BY 3.0 | calendar | intent labels only |
| SMCalFlow | ~41.5k dialogues | yes | CC BY-SA 4.0 | calendar | the best source for move, update and references ("push it an hour later") |
| Schema-Guided Dialogue | 20k+ dialogues / Calendar_1 | paraphrased | CC BY-SA 4.0 | calendar | multi-turn add-event |
| TOP / TOPv2 | 45k / 180k (reminder 26k, event 13k) | yes | CC BY-SA | calendar | compositional intent-slot trees; the structural comparison in §6 |
| SNIPS 2017 | ~14k / 0 | yes | CC0 | – | no calendar intents |
| NLV corpus (CHI 2021) | 814 utterance sets | yes | MIT | diagram (charts) | chart specifications |
| ChartDialog (ACL 2020) | 15.7k describer turns | yes | none stated | diagram (charts) | "make the bars red" edits |
| nvBench | 25,750 | synthesized, then human-checked | MIT | diagram (charts) | data queries, not edits |
| PPTC | 279 sessions, 1,808 turns | yes | MIT | diagram, document | shape, chart and text edits |
| WildChat-1M | 1M conversations / ~0.2% diagram or chart | yes | ODC-BY | diagram | real requests for diagrams and charts |
| TeX.SE titles (flow-charts, tikz-trees) | 787 / ~37% | yes | CC BY-SA | diagram | connect, label and style how-to questions |
| SCONE Tangrams | 5k sessions | yes | CC BY-SA 4.0 | diagram | ordinal swaps and removals |
| DocEdit (Adobe) | ~28k | yes | non-commercial | document | real document edit requests |
| OASST1 / Dolly | 22.8k / 15k | yes | Apache-2.0 / CC BY-SA | document | compose and rewrite prompts |
| TERTiUS | 959 command segments | yes | – | document | the repository is gone (404) |
| CoEdIT, IteraTeR, EditEval | 70k / 4k | templated / labels only | Apache / CC0 | document | rewrite verbs only |
| RealEdit (r/PhotoshopRequest) | 50.7k posts / 7.2k face | yes | CC BY 4.0 | avatar | face, hair and accessory requests |
| CelebA-Dialog | 202k | template-generated | non-commercial | avatar | not used |

No public human corpus of node/edge diagram *editing* exists. FlowLearn and text2diagram-style sets are generated. Node
and link editing therefore comes from the owner's logs, TeX.SE titles, WildChat and SCONE, and should be collected from
our own users through the phrase log.

## 3. The benchmark (`training/sop-bert/data/human-benchmark-v1/`)

**Items.** Each item is one JSON line with these fields:
- `text`: the adapted human phrasing. Typos, hedges, fragments and politeness are kept.
- `tab`
- `context.existing`: seedable objects on the page.
- `session`: optional; ordered turns on one page.
- `source`: corpus, id and licence.
- `adaptation`: what was changed.
- `construction` tags.
- `expect`: a plain-words `description`, plus machine-checkable semantic `effects` (`create`, `change`, `move`, `remove`,
  `connect`, `layout`, `query`, `no_change`) that name kinds and objects, never tools.

**Counts.**

| Tab | Items | Corpus items | Owner items | Sources |
| --- | ---: | ---: | ---: | --- |
| Drawing | 329 | 256 | 73 | CoDraw 100, MagicBrush 126, BLOCKS 30 |
| Diagram | 333 (+45 setup) | 295 (145 charts) | 38 | PPTC 74, WildChat 59, ChartDialog 51, TeX.SE 41, NLV 32, SCONE 25, OSWorld 13 |
| Calendar | 220 | 220 | 0 | MASSIVE 88, CLINC 35, SMCalFlow 97 |
| Avatar | 228 | 220 | 8 | RealEdit 92, MagicBrush 79, Emu 49 |
| Document | 204 (+6 setup) | 201 | 3 | DocEdit 81, PPTC 57, OASST 48, Dolly 15 |

The owner items are the drawing v3/v4 replay (15 turns), the phrase-log exports of 2026-11-14/15/16 (Romanian lines
translated to English) and the Diagram session of 2026-11-20 ("ad a diagram with 5 nodes" … "make the line e1 to look
better"). The Diagram session appears both as a session and with the owner's 5-node state seeded.

**Run.**

```
node training/sop-bert/data/human-benchmark-v1/run-benchmark.mjs <bundle> <node_modules> items/<tab>.jsonl > out.jsonl
python3 score.py items.jsonl out.jsonl scored.jsonl
python3 layers.py <bindings.json> official-dataset/inventory.json tab:items:out:scored …
python3 taxonomy.py items scored
```

- `run-benchmark.mjs` is `probe-bundle.mjs --run` (the whole app route on a real area host with the site catalog) plus
  before/after observation snapshots and sessions.
- It drops the replay loader's 16 MB diagnostic budget, which otherwise turns every item after about 30 into
  `reader-diagnostic-budget`.
- The scorer is deliberately lenient: kind or name match, the property changed, the direction sign, loose relation
  geometry. The rates are therefore upper bounds. Known false negatives are synonyms such as donut/doughnut.

## 4. Results (end to end, deployed reader)

| Tab | Pass | Partial | Pass, actionable items only | Owner items |
| --- | ---: | ---: | ---: | ---: |
| Drawing | 36/329 (10.9%) | 16 | 31/324 | 11/73 |
| Diagram | 18/333 (5.4%) | 4 | 11/326 | 2/38 |
| Calendar | 11/220 (5.0%) | 0 | 7/214 | – |
| Avatar | 0/228 | 0 | 0/228 | 0/8 |
| Document | 0/204 | 0 | 0/204 | 0/3 |

"Actionable" excludes items whose only expected effect is `no_change` (chit-chat), which pass trivially.

### Failures by layer

Failures are multi-label: a failed item can show several of these. The table gives the share of failed items with each
flag.

| Flag | Drawing | Diagram | Calendar | Avatar | Document |
| --- | ---: | ---: | ---: | ---: | ---: |
| reader: heads inconsistent (presence/span/BIO/act anchor) | 73% | 85% | 78% | 87% | 91% |
| reader: key from another area | 5% | 8% | – | 18% | 10% |
| binding: predicted property key has no semantic binding | 20% | 43% | 64% | 88% | 52% |
| binding: kind word unbound | 17% | 53% | 26% | 67% | 77% |
| binding: reference (anaphor, population) not bound | 10% | 20% | 33% | 32% | 42% |
| compiler: no query/step projection, or arguments not bound | 8% + 6% | 4% + 5% | 33% + 7% | 6% | 3% |
| rule/operation missing or refused | 1% | 12% (charts refused: `chart-composition-not-in-area`) | – | – | 3% |
| executed, wrong or partial outcome | 8% | 2% | 1% | – | – |

Examples by layer:
- **Reader:**
  - "move the house down" produced `avatar.part.place` in the drawing area.
  - "move problems higher" produced `diagram.node.height`.
  - "make the hair red" (avatar) produced `drawing.drawn.colour`, and so did 36 other avatar lines.
  - "draw a cat and 2 dogs" gave two kind spans, so `ambiguous-global-mention` dropped both.
- **Binding:**
  - The deployed bindings cover only `avatar.face.name` (avatar) and `meeting.time`/`title` plus `person`/`room` names
    (calendar).
  - For diagrams they cover node colour/size, chart labels/series/values and link/group label. There is no layout, no link
    `from`/`to`, no chart type and no node label.
- **Rule/operation:** "draw a boy and a girl" and "draw a grandfather" fail with `drawing-not-in-catalog`, because people
  kinds are not in the existence rule. "give me a chart" fails with `chart-composition-not-in-area`.
- **Executed wrong:**
  - "Put a car next to the child" used the woman as the anchor.
  - "Give the car a pig logo" drew a pig.
  - "arrange the diagram's elements as a hexagon" created a hexagon node.
  - "Create a green rectangle" made the rectangle but did not apply green.

### Can the expected meaning be expressed in the current scheme?

This is a static analysis of the expected effects against `inventory.json` and the deployed `bindings.json`:

| Tab | Bound key exists | Key exists, unbound | No key in the scheme | Passes among "bound" |
| --- | ---: | ---: | ---: | ---: |
| Drawing | 168 | 14 | 147 | 35 (21%) |
| Diagram | 59 | 145 | 129 | 13 (22%) |
| Calendar | 107 | 83 | 30 | 6 |
| Avatar | 15 | 197 | 16 | 0 |
| Document | 79 | 89 | 36 | 0 |

So 45% of drawing and 39% of diagram human requests cannot be expressed at all. Examples:
- vague quantities ("some clouds")
- part add ("put eyes on the sun")
- shape ("irregular")
- region bands ("land in the background, 30% from the bottom")
- aesthetic layout ("improve layout")
- swap, and move by direction for diagrams
- possession ("the sun's rays")

Even where a bound key exists, only about a fifth succeed.

## 5. Usage-class taxonomy (drawing and diagram; charts are a kind of diagram)

Classes are multi-label, assigned heuristically from the effects, tags and text (`taxonomy.py`). "Items" counts benchmark
items in the class; "pass" is the measured pass rate.

| Class | Real examples | Needs (knowledge + capability) | Drawing items, pass | Diagram items, pass |
| --- | --- | --- | --- | --- |
| create | "add a lighthouse", "Insert a rectangle to its right." | kind lexicon → catalog kinds (people too), default size and placement | 193, 12% | 157, 7% |
| compose scene / several things | "draw a landscape with water, ground, sky, clouds, sun, 2 different houses", "create a five-bubble mind map" | scene knowledge (`k.scenes`, layout bands), coordination → request batch, one placement problem | 16, 0% | 36, 0% |
| place relative | "1 inch to the right of his knee is a medium soccer ball", "Put a car next to the child." | relation bank, landmark reference, distance with unit, parts as landmarks, Z3 placement | 134, 5% | 25, 32% |
| move / position | "move the house down", "swap shapes 3 and 4", "move summary to around the middle" | direction and amount, regions, swap, absolute position | 9, 0% | 23, 0% |
| quantify | "draw some clouds", "add 5 random nodes", "a few balloons" | numerals; vague amounts (`k.expect.amount`); repeat-make in the compiler | 35, 9% | 86, 4% |
| refer (anaphora, population, ordinal, id) | "put him on the swing", "remove shape 2", "the line e1", "all elements" | discourse referents, population and ordinal selectors, identifiers, names | 58, 5% | 111, 11% |
| modify attribute (colour, size, style, shape) | "let the cat be white", "Create a green rectangle", "the lake shape should be iregulat" | one property concept per attribute, bound per area by knowledge; shape values (`k.shapes`) | 55, 7% | 29, 0% |
| part edit (drawing) | "make the roof blue", "Give the car a pig logo", "put some yes to the sun" | `k.parts.called`, part observation, part-add operation, layout anchors | 79, 3% | 2, 0% |
| arrange / layout / align / distribute | "arrange the elements better", "split into 3 levels", "arrange as a hexagon with the circle in the middle" | layout kinds (tree, grid, circle, hexagon), bands, align/distribute, aesthetic objective | 9, 0% | 48, 0% |
| connect / structure | "connect all elements", "connect cirles with an arraw", "UML class diagram with the correct arrows" | link creation over populations, arrow style, diagram kinds (flowchart, tree, mind map) | – | 44, 0% |
| chart create | "make a bar chart of average profit by state", "Show average earnings by genre." | chart kinds; data binding (series, aggregation); chart as diagram kind | – | 88, 0% |
| chart data edit | "Insert Jan, Feb, Mar, April into the chart,", "Add a new series named \"Profit\" right next to the 'CGOS' series" | series and point references, value edit, rename, add/remove series | – | 14, 0% (mostly table edits retargeted to charts; single-value edits need authored and owner data) |
| chart formatting | "Make the bars stacked", "set origin colors to: europe, blue, …", axis labels, legend | chart properties (stacked, legend, axis title, palette, type change) | – | 48, 0% |
| remove | "Remove the car.", "remove it again" | references; undo of a removal | 12, 25% | 14, 0% |
| vague aesthetic | "make the diagram prettier", "it is ugly draw a different person" | an aesthetic objective that maps to layout, variety and style defaults; disclose the choice | 16, 6% | 31, 10% |
| correction / undo | "no, put problems back where it was", "wrong, move problems higher" | journal reference, previous position, repair of the previous reading | 9, 0% | 14, 14% |
| question | "who is eyes a cat?", "how mileage varies for different cylinder type" | query projections, explanation of the last grounding | 15, 13% | 25, 16% |
| compound / multi-step | "Create a triangle. Move it to the right side of the page." | cutter, shared arguments, dependency order | 38, 3% | 129, 3% |
| fragment / follow-up | "down", "on the lake", "and higher still", "more" | the previous request as a frame to complete | 39, 3% | 83, 1% |
| formatting / effects | "Draw shadow in a better way", "Rotate left by 90 degree.", "make the background blue on all my pages" | style and effect properties (shadow, gradient, rotation, background) | – | 5, 0% |
| conversational / complaint | "good work thanks", "you are stupid" | dialogue acts (no change, polite reply) | 10, 60% | 10, 70% |

What actually works today: single-object create, a few relative creates, remove, and replies to chit-chat. Everything
compositional is near zero.

## 6. Proposal: a domain-general semantic representation compiled through knowledge

### 6.1 What is wrong in principle

| Concern | Today | Consequence measured above |
| --- | --- | --- |
| What the reader predicts | 230 `area.type.key` heads, copied from tool parameters | the same concept is learned 4–6 times (colour: `drawn.colour`, `node.colour`, `part.colour`, `chart.colour`, …); "higher" lands in `node.height` and "down" in `avatar.part.place` |
| What a new capability costs | new key, new synthetic data, retrain, new reviewed binding | 207/230 keys still unbound; each owner log exposes the next gap |
| How meaning becomes executable | a reading counts only if every one of ~230 heads is consistent | 73–91% of failures; partial understanding is discarded silently |
| Training data | synthetic paraphrases generated from our own tool inventory | 34–41% on synthetic test, 0–11% on human lines; a whole class (vague, aesthetic, parts, regions) is missing |

TOP/TOPv2 has the same weakness: domain-specific intents and slots (`IN:CREATE_REMINDER`, `SL:DATE_TIME`). The TOPv2 paper
needed new labelled data for every new domain. Its strength, which we should keep, is compositional nesting (a slot whose
value is another intent).

Our `std.request` wires are already close to domain-general: `act`, `mood`, a target with `kind`/`determiner`/`mode`/
`fill`/`ordinal`/`count`, and constraints with `operator`/`phase`/`polarity`/`step`/`variety`. The library compiler
already matches area capabilities by concept (`std.capability.property concept=…` in `capability-method.mjs`). What is
area-specific is only `constraint.concept` and `target.type`, and those are exactly what the reader is asked to guess.

### 6.2 The representation (reader output)

The reader outputs frames per clause, with surface spans, in a fixed role set that is the same for every tab:

| Role | Contents | Example |
| --- | --- | --- |
| `act` | generic class from a small bank (create, change, move, remove, connect, arrange, swap, copy, group, ask, undo, compose, converse) plus the predicate span (open lemma) | "thicken" → change, predicate "thicken" |
| `theme` (entity mention) | head span; determiner (a, the, another, other, some, every); quantity (number, vague word, all); modifiers (spans: "old", "hot air", "pig logo", "green"); `of`/possessor (an entity mention: "the sun's rays", "roof of the house"); reference form (new, definite, pronoun, population, ordinal, identifier "e1"/"shape 2", name "Results") | "the first and last node" → ordinal first+last, head "node" |
| `attribute` | property span (optional) + value span + value type (colour, size, shape, number+unit, text, style); operator (eq, more, less, negated); degree | "make the bars blue" → colour = blue on theme "bars" |
| `spatial` | relation (bank), landmark (entity mention), region (top, bottom, background band, corner), distance (number+unit), frame (page/object) | "1 inch to the right of his knee" |
| `motion` | direction (up/down/left/right/towards), amount (degree or number) | "move problems higher" |
| `goal` | target state as a nested mention or frame ("as a hexagon", "into a man", "to Friday", "into a bar chart") | TOP-style nesting |
| `time` | date, time, duration, recurrence spans (normalised by a time value grammar) | "next tuesday at noon" |
| `manner` | aesthetic or quality objective ("better", "nicer", "natural", "readable"), degree ("a bit", "much") | "improve layout" |
| `polarity`, `mood`, question focus | as in `std.request` | "not a circle" |
| `structure` | coordination with shared arguments, sequence, instead-of; discourse function (thanks, complaint, correction "no, X", repetition "again", "more") | "a cat and 2 dogs" → one act over two themes |

The area is context, not part of the label. There are about 25 role heads in place of 230 tool keys, and a span or class
inventory that does not grow with each tool.

### 6.3 Compilation through knowledge

The compiler, not the reader, maps a frame to a declared operation:

1. **Theme head → kind.** Words map to kinds through the catalog (`k.objects`, `k.people.kind`, diagram kinds).
   Modifiers fill the head kind's declared enum slots: "old person" → `k.people.kind age=old`.
2. **Possessor.** `of`/possessor follows `k.parts.called of=…` to a part (observed part objects, or the part-add rule).
3. **Attributes.** An attribute value type and property word map to a concept (`colour`, `size`, `shape`, `label`,
   `layout`, …). The concept maps to the area's slot through `std.capability.property concept=`. That one knowledge row
   per area is the whole cost of "colour in a new tab".
4. **Spatial, motion and goal.** These map to placement problems (the Z3 solver) or layout capabilities by concept
   (`layout=hexagon`, `swap`).
5. **Quantity and manner.**
   - A numeric or vague quantity becomes repeat-make (`k.expect.amount` gives typical/min/max).
   - Manner becomes a declared aesthetic objective, for example layout with crossing minimisation and spacing, or variety
     over `k.faces` variants.
6. **Partial execution.** Missing knowledge or a missing rule yields an honest partial result. The understood roles
   execute; the dropped roles are disclosed ("I could not apply 30%"), per Review29. It never makes "no candidate".

A new capability therefore needs knowledge rows plus an area rule or operation. The reader does not change, because the
roles it predicts are the same.

### 6.4 Migration plan

1. **Schema.** Extend `std.request` with the missing roles in the library spec: theme modifiers, theme possessor/`of`,
   vague quantity, spatial region and distance, motion, goal, manner, discourse function. Publish inventory v2 as roles,
   not keys. This is library phase work and the contract for both repositories.
2. **Mechanical label conversion.** Convert `official-dataset` labels table-driven: `world.type.key` → role + concept
   (230 keys → about 30 concepts; the class banks become value types). Keys that encode a tool parameter with no concept
   (`id`, `ids`, `n`, `index`) become reference or quantity roles. Rows that cannot be converted are listed, not dropped
   silently.
3. **Binding.** Replace the per-key `bindings.json` property list with concept bindings read from the areas' declared
   `std.capability.property concept=` rows. Coverage then grows with knowledge, not with reviewed key alignments.
4. **Retrain once.** Train on converted official + `human-adapted-v1` (§7). Report the human benchmark per tab and per
   class next to the synthetic test.
5. **Remove the all-or-nothing gate.** Have the bridge emit per-role results with confidence, and let routing execute the
   consistent subset with disclosure.

### 6.5 Data strategy

- **Backbone: real human lines.** Use the corpora in §2, adapted line by line and stratified by the §5 taxonomy, plus
  every owner phrase-log line. Synthetic generation only fills structural combinations that the corpora lack. Examples:
  chart data edits ("make sales for March 40"), ordinal × part × relation combinations, and node/edge editing, which
  has no public corpus.
- **North star.** `human-benchmark-v1`, per tab and per usage class, run end to end on every candidate reader or bundle
  before deployment. Add a fresh human set when it gets contaminated (AGENTS data principle).
- **Active learning.**
  1. Owner and user phrase logs are triaged by layer with `layers.py`.
  2. Reader and representation failures become adapted training rows.
  3. Binding, knowledge and rule failures become knowledge or rule work, with no data change.

## 7. Training data from the corpora: `human-adapted-v1` (coordination note for the Diagram data agent)

Location: `training/sop-bert/data/human-adapted-v1/<tab>/`. Rows are in the official label format
(`psys2.human-adapted-example/1`). Each tab folder has `build.py` and `validate.py` (official `Validator`, zero errors and
zero fixes, span and order checks, no text in the official dataset or in the benchmark), plus `gaps.jsonl` for human lines
the current inventory cannot express and a README with a class × count table. Rows are tagged with the §5 usage class.

Readiness for inclusion in the official build (owner of `official-dataset` / ui-diagram-v2 part C): see the status table
below. The corpora are not yet wired into `official-dataset/build.py` (`MANIFEST.json`). The official-dataset owner adds
them as sources `human-adapted-v1-diagram` and `human-adapted-v1-drawing`, with the same repetition weight as the UI
corpora. Benchmark texts are excluded by construction, so `human-benchmark-v1` stays held out.

| Tab | Status | Rows / gaps | Ready for inclusion |
| --- | --- | --- | --- |
| diagram | committed with this change; `validate.py` passes (official Validator 0 errors / 0 fixes, no benchmark overlap) | 538 rows (612 requests; 176 marked `structural-fill` for chart data edits, node/edge editing, ids and quantifiers that no corpus line expresses) / 256 gaps | **ready**: `build.py` already lists `human-adapted-v1-diagram`; rebuild `official-dataset` and retrain once together with ui-diagram-v2 |
| drawing | committed (`bdf6cb06`), `validate.py` passes (official Validator 0 errors / 0 fixes, no benchmark overlap) | 558 rows / 525 gaps (CoDraw 282, MagicBrush 198, SCONE 43, BLOCKS 35) | **ready**: `build.py` already lists `human-adapted-v1-drawing`; the committed official files hold an early 28-row version, so rebuild `official-dataset` before training |
| calendar, avatar, document | deprioritised by the owner (2026-11-20); not started | – | – |

Main gaps reported by the two corpora (they confirm §4):
- **Drawing:** missing `drawn.facing` (149 records), `pose` (126), `expression` (103), `align` (94), `offset` from an edge or anchor (92), `crop` (72), `holds`/worn (44) and `cover`/occlusion (27).
- **Diagram:**
  - chart display keys such as axis scale or position, markers, line style, error bars and fonts (49)
  - node and page geometry: rotation, "a bit to the left", swap, page background (36)
  - chart data fields and filters (31)
  - conversation-level meaning (20), link details (16), generated-diagram topic (16), vague goals (15)
- **One label decision follows the official convention but should change with §6:** a whole diagram ("draw a flow chart")
  is a new `node` whose kind is the diagram kind. A `diagram` frame role would be cleaner.
