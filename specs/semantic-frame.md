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
| an existing target named only by its family ("make the flower green", "make Start red") has no native target mapping when the family also has kind words | a family without a native family binding takes the one binding its own kind rows share; the target then matches any object of that source type by name | `declared-bindings.mjs` (completion 4) |
| a relation anchor named without a kind word ("put Sun to the left of House") is an unresolved anchor; a family identity is never a placement kind | the anchor phrase names an observed member of the subject's family (its class, matched by that name); a family identity denotes every object of its tool's source type in placement and moves an existing member with its observed extent | `raw-structural-bridge.mjs`, `worlds/native-spatial-interface.mjs` |
| a selector on the identity parameter (`node.ids = Plan`) compares the said name with an unobserved field | a selector on a parameter the policy fills with the target's identity (`std.capability.seed source=target.list\|target.id`) is a reference concept: a code, name or kind of an observed object of its source type, observed on each object as its code | `capability-plan-adapter.mjs` `interfaceFacts` |

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
