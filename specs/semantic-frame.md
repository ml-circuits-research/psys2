# Semantic frame: a domain-general reader representation with partial execution

Status: proposed, prototyped 2026-11-20. The frame, its compiler and the oracle study exist; the reader does not emit
frames yet and the app route is unchanged. Contract in the library: `docs/semantic-frame.md` (sopworld 0.237.0,
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

### Remaining refusal-first thresholds in the current route (to become ranked best-effort decisions)

| Where | Today | Proposed |
| --- | --- | --- |
| `reader-admission.mjs` `scoreReaderProposal` | refuses unless `coverage.complete` and `graphProposal`, zero `failures`, zero `unresolved` | admit the consistent part: per-request (and per-role) eligibility; failures become disclosures |
| `raw-structural-bridge.mjs` (29 `unresolved(...)` reasons) | any one (unbound property key, undeclared relation value, unpaired relation, ambiguous span, >1 request without annotated dependencies, unprojected population/ordinal/query, …) fails the request | drop the offending role, keep the request, disclose; default dependencies to source order |
| key-reader decoding (presence/span/BIO/act-anchor consistency) | an inconsistent head makes coverage incomplete → whole reading refused | decode per head; an inconsistent head drops that role only (the frame's ~25 heads make this simpler) |
| `reader-admission-policy.sop` | `uncalibrated-best-effort` admits only when calibration is unconfigured; a configured but unmet calibration closes the gate | ranked: admit with uncertainty note and alternatives below the threshold, refuse only for destructive acts |
| `capability-policy.sop` guards (`incomplete.coverage` for calendar) | a meeting with an unapplied detail changes nothing | create with the applied details, disclose the rest |
| placement method `request-shape` | relation + any other constraint refuses the request | split (make placed, then change), as in §5.3 |
| capability modes `requireResult`, `selectorUnique`, `targetUnique` | refuse when no result applies or the selection is not unique | most recent / focused match with the alternatives retained (already the default for existing targets), disclosed |

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
