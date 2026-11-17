# Random training-message diagnosis in the book's terms — 2026-11-17

## What was actually run

100 messages selected without replacement from all 30,781 prepared training messages, using the 100 smallest SHA256(seed + newline + source id), seed `1`. Selection never reads annotations or predictions. Every selected id was found in the encoded training corpus: 123 training samples / annotated requests. There are 80 one-request, 18 two-request, one three-request and one four-request messages. This differs from the previous deliberately balanced 25-per-area diagnostic.

Installed SOP-BERT epoch-7 q8 cutter/key reader, actual Node CPU inference, native hosts, observed context, application routing and execution. Loop: **31.077 seconds**, **0.311 seconds/message**. Initial model/data loading is outside the timing. No retraining or product fix during the run. Reader inputs never receive expected annotations.

Measured at PSys2 HEAD `dc9e5189`, library HEAD `792abc8`, knowledge HEAD `49f7854c`, with pre-existing uncommitted sampler/browser changes. Those changes were preserved; this is a working-tree measurement, not an immutable HEAD benchmark. `actual-reader-provider` uses the current deployment identity and clears calibrated admission while running the ordinary routing code. Reversible best effort runs; this does not validate production admission, browser numerical equivalence, or calibrated accuracy.

## Result

| Area | Messages | Complete native setup | Action-request messages | State changes |
|---|---:|---:|---:|---:|
| drawing | 36 | 5 | 32 | 0 |
| diagram | 23 | 4 | 18 | 1 |
| document | 22 | 7 | 18 | 2 |
| calendar | 19 | 1 | 13 | 1 |

All 100 went through inference, including failed setup rows. Of 81 action-request messages, 77 produced no state change. Some are undo/follow-up requests whose required history was not replayed; these are not 77 independently established model errors. The other 19 messages do not request a changing effect. Four messages changed native state: manual comparison finds one wrong act/target behavior and three incomplete outcomes. No complete intended changing outcome was demonstrated by those four.

The cutter reports complete coverage in 100/100, with the right number of requests in 99/100. This measures counts/declared coverage, not exact span correctness: for the itinerary example its boundaries and trigger differ from annotation. Raw request coverage is complete in 17/100. Eight messages reach a nonempty operational graph after best-effort projection; this is not eight semantically complete requests. Their original structural bridge reports incomplete coverage in 99/100 overall.

## Locate the failure using the book

Read against [SOP Worlds: teoria](../../../soplang-words-lib/books/sop-worlds-teorie.md), version 49. The eight stages are in §6.2; the diagnostic levels recognition, description, reference, knowledge, realization and verification are in §11.5. The book contains proposals and older refusal/grammar policies; current owner decisions make SOP-BERT the sole reader and prefer plausible reversible action with disclosed uncertainty. These findings do not propose restoring the older refusal-first behavior.

Counts below overlap and must not be added.

| Book boundary | Measured evidence | Interpretation |
|---|---|---|
| State (§6.2 stage 1), instance world (§5.1) | 83/100 incomplete native setups; 123 missing-kind mapping events; 19 `invalid_meeting` refusals | The prepared semantic context is often not the actual native state. This includes fixture limitations, not just missing product capabilities. |
| Interpretation into request (§6.3) | 83/100 reader-output issues; 63 presence/span disagreements, 17 invalid BIO continuations, 14 presence/class disagreements, 10 metadata disagreements | Head outputs are not consistently decoded into a coherent description. Good act/noun recognition does not imply complete interpretation. |
| Supervised request fields | 35/100 categorical-head mismatch rows; 19 fill, 10 act, 7 determiner, 5 quantifier, 4 mode and 4 type mismatch occurrences | There are visible differences from training targets, but altered runtime context prevents interpreting this as isolated model training accuracy. |
| Training representation vs runtime contract | 47/100 include `v1-target-type-unknown-masked` training diagnostics | Some legacy samples intentionally lack positive target-family supervision required later at runtime. This is not proof the family is globally unlearnable. |
| Concept/world binding (§4.7, §5.3, §6.3.2) | 70/100 canonical property binding issues; 68 value representation issues; 50 kind binding issues | The application does not connect many predicted raw fields to declared semantic identities and typed values. A missing property binding can cause the value error too. |
| Situating and reference (§6.4, §6.4.1) | 11/100 prior-turn limitations, 22 context-reference binding issues | A previous sentence is not an executed history/focus. Kind/name-only context also loses observed properties. |
| Request composition and planning (§6.3.2, §6.8) | 21/100 missing dependency projection; 18 query projection; 14 operator/reference projection | The bridge explicitly leaves these contracts unimplemented even when useful fields are predicted. |
| Realization and effect (§6.5, §6.9, §6.10.1) | 4 changes, one act differs from gold, three explicitly partial replies | Executing a reduced graph does not establish fulfillment of the original request. |

Even among the 17 messages whose native setup succeeds, 11 have reader-output issues and 14 have canonical property-binding issues. Missing setup alone does not explain the failures. One of those 17 also needs an unreplayed prior turn; 84/100 have either setup or prior-history limitations overall.

## Concrete examples from this run

| Message | What the reader gets / actual effect | Located failure |
|---|---|---|
| `draw a triangle on top of the square` | Existing square and triangle instantiate. Reader predicts `make`, new triangle, `drawn.anchor=the square`, `drawn.relation=on`; no change. | Property identity and relational-reference projection fail after useful interpretation. This is direct integration evidence with successful object setup. |
| `link stomata to the leaves node` | Both nodes instantiate; reader predicts `connect`, `link.from=stomata`, `link.to=the leaves node`; no change. | Endpoint property/value bindings fail before native connect. Actual approximate name resolution remains a further obligation. |
| `draw a yellow duck` | Reader predicts make/new duck/yellow. A spurious page-background presence/span issue remains; duck-kind binding is missing; no change. | Both reader coherence and semantic/native realization. Duck/pond setup also fails, although this new creation does not require finding those two objects. |
| `rename the Methods section to Approach` | Sections instantiate; reader gets change/section/Approach but adds an unresolved selector role for Methods; no change. | Both interpretation and property/value binding. |
| `triangles look odd, do a star` | Gold says change the contextual target after `make Delivered a triangle`; model says make/new; creates a third node, a star. | Act prediction and situating fail. Prior turn was supplied as text but not executed. Reply's uncertainty does not make this the requested edit. |
| `tell the team the offsite is cancelled, no hard feelings` | Reads topic and recipient; creates generic document with topic metadata, cannot apply recipient. | Genre/content/recipient realization is incomplete; creating a document does not establish writing the requested email. |
| `new doc: itinerary for the Scottish road trip, keep it simple` | Reads topic and tone but omits itinerary kind; creates generic document, cannot apply simple tone. | Both interpretation and realization. No complete itinerary established. |
| `add Omar as the new recruiter` | Reader matches make/person/name Omar/role recruiter. Adds Omar as a person, drops role recruiter with disclosure. | Concrete post-reader capability/binding loss despite a matching useful reading. |
| `book lunch with Ana on wed` | Reads make/meeting, day and Ana but loses title and has reader inconsistencies; no scheduling. | Reader plus missing field bindings/completion. Its existing meetings also fail fixture setup. |

## Exact implementation causes

- `src/dialog/raw-structural-bridge.mjs:50`: every multi-request input lacks projected request dependencies. Lines 60–64 require exact area/type/lemma bindings; 67 leaves context/history targets unresolved; 71 leaves count/ordinal projections unresolved; 77–95 require property/value contracts; 97/101 leave relational/step/anchor projections unresolved; 113–114 leave queries and turn contracts unresolved. These are explicit adapter limitations, not just low neural confidence.
- `src/dialog/native-reader-context.mjs:23`: only observed kind/name pairs are serialized to the reader; other native properties do not reach its input. The prior text is carried without executing it or rebuilding journal/focus.
- `scripts/lib/functional-native-bindings.mjs`: exact narrow native constructors cannot instantiate many training-context kinds. This diagnostic cannot prove all such kinds are absent from all knowledge worlds or fundamentally impossible for the app.
- Definite fixture inconsistency: `scripts/lib/functional-fixture-policy.mjs:5` defaults meetings to `participants=[]`; `worlds/time.calendar/calendar-tool.mjs:49` rejects zero participants. All 19 native setup refusals in this run are `invalid_meeting`. Inventing participants would conceal the missing context; the right diagnosis is insufficient fixture/resource contract.
- `src/dialog/project-create-action.mjs:22`: creation alternatives are ranked by spelling edit cost across the area's supported kinds; type compatibility only breaks ties. Lines 30/34/38 drop requirements into disclosures and 49 marks the reduced graph complete. The prior report observed face→car and donkey→rocket. This run does not repeat those particular substitutions, but its partial creations use the same reduction route. Plausible semantic alternatives require compatibility, not only spelling resemblance.

## Conclusion and next discriminating run

There are independently demonstrated faults in **interpretation**, **binding/composition of the semantic worlds**, **situating against the actual instance/history**, and **realization of the requested effect**. The strongest post-reader counterexamples are triangle/square, link endpoints, and Omar's role. The evidence does not support blaming only SOP-BERT, claiming SOP-BERT is already correct, or treating a confidence-threshold adjustment as the missing mechanism.

The immediate blocker to a clean model-only accuracy estimate is context equivalence: inference here intentionally uses the app's actual observed state, not the richer annotation context. A subsequent controlled comparison should hold these same 100 ids and weights fixed, compare reader fields under the original encoded context with current observed context, and separately pass gold descriptions through the same bridge. That isolates neural, context and adapter losses without retraining or adding sentence-specific mappings. This additional run was not performed or presented as a result here.

The previous analysis is preserved at `training/results/training-pipeline-100.md`; its deliberately balanced sample and this uniformly sampled run are different cohorts, so their percentages are not a before/after improvement claim.

## Reproduce

```sh
node scripts/diagnose-training-pipeline.mjs \
  ../.session-control/active-reader-node-spec.json \
  ../.session-control/structural-gold-review23-full/train.jsonl \
  ../.session-control/target-type-review23-data-v3-full/train.jsonl.gz \
  ../.session-control/training-pipeline-random100-seed1 1
```

Use a fresh output prefix (the row writer refuses overwrite). Adjacent selection JSON, grouped summary JSON and compressed rows retain all source ids, expected annotations, raw requests, graphs and before/after observations. This is one diagnostic run, not a new training or admission calibration.

## All 100 messages

The index is zero-based and matches the row artifact. `setup` records constructor success only, not a complete executed history. `changed` is an observed state mutation, not a semantic success label.

| Index | Area | Message | Setup | Changed | Reply |
|---:|---|---|---|---|---|
| 0 | diagram | delete the budget split pie, undo, then rename team sizes to Staff size and make it purple too | False | False | I could not identify an action to apply. Nothing changed. |
| 1 | calendar | maybe we could move grandmas visit to next week | False | False | I could not identify an action to apply. Nothing changed. |
| 2 | drawing | both ducks should be on the pond | False | False | I could not identify an action to apply. Nothing changed. |
| 3 | diagram | payroll should be called Compensation | False | False | I could not identify an action to apply. Nothing changed. |
| 4 | calendar | move the next one an hour earlier | False | False | I could not identify an action to apply. Nothing changed. |
| 5 | drawing | could you draw a little dog on the bridge, looking at the river | False | False | I could not identify an action to apply. Nothing changed. |
| 6 | document | make every heading title case except the references heading | True | False | I could not identify an action to apply. Nothing changed. |
| 7 | diagram | how many students got an A, and then compare A with B | False | False | I could not identify an action to apply. Nothing changed. |
| 8 | document | add a quote from the head of product, sounds excited | False | False | I could not identify an action to apply. Nothing changed. |
| 9 | document | how long is section 2 in words | True | False | I could not identify an action to apply. Nothing changed. |
| 10 | drawing | rename the avatar to Kit Kat | False | False | I could not identify an action to apply. Nothing changed. |
| 11 | drawing | make the flowers pink or yellow, and make the leaves green | False | False | I could not identify an action to apply. Nothing changed. |
| 12 | drawing | give the face a robot preset | False | False | I could not identify an action to apply. Nothing changed. |
| 13 | document | ok the letter reads too cold, can you warm it up a bit | False | False | I could not identify an action to apply. Nothing changed. |
| 14 | document | rewrite the bullet points as a numbered list | False | False | I could not identify an action to apply. Nothing changed. |
| 15 | diagram | yo disconnect fridge and sensor | True | False | I could not identify an action to apply. Nothing changed. |
| 16 | diagram | lol undo that wrong one | False | False | There is no earlier action to undo here. Nothing changed. |
| 17 | diagram | triangles look odd, do a star | True | True | Created a star. I used the most likely reading; you can correct it or undo. |
| 18 | diagram | which boxes have no outgoing arrow? | False | False | I could not identify an action to apply. Nothing changed. |
| 19 | calendar | hack night is a bit crowded, can we spread it over two evenings | False | False | I could not identify an action to apply. Nothing changed. |
| 20 | diagram | make a stacked bar chart of the scores i typed | False | False | I could not identify an action to apply. Nothing changed. |
| 21 | calendar | you forgot to put a room on it | False | False | I could not identify an action to apply. Nothing changed. |
| 22 | calendar | set up a band photo at 10 on sat, with everyone, and also put the drummer's kit delivery in the diary for 8 | False | False | I could not identify an action to apply. Nothing changed. |
| 23 | document | make sure the cover letter mentions none of my old employers | False | False | I could not identify an action to apply. Nothing changed. |
| 24 | drawing | lengthen the hedge along the front, and shorten the gate a little bit so it fits | False | False | I could not identify an action to apply. Nothing changed. |
| 25 | drawing | make the nose big, and make the eyes round or almond | False | False | I could not identify an action to apply. Nothing changed. |
| 26 | document | make it kinder | False | False | I could not identify an action to apply. Nothing changed. |
| 27 | drawing | make the stumps tiny | False | False | I could not identify an action to apply. Nothing changed. |
| 28 | document | rename the Methods section to Approach | True | False | I could not identify an action to apply. Nothing changed. |
| 29 | drawing | which triangles are blue | True | False | I could not identify an action to apply. Nothing changed. |
| 30 | document | bold the riad name everywhere | False | False | I could not identify an action to apply. Nothing changed. |
| 31 | drawing | octopus should go to the right of the fish, and then draw a little whale behind the octopus | False | False | I could not identify an action to apply. Nothing changed. |
| 32 | diagram | could u put the average glasses per day in the drawing app, with a little glass icon | False | False | I could not identify an action to apply. Nothing changed. |
| 33 | drawing | make the roof red and make the walls blue | False | False | I could not identify an action to apply. Nothing changed. |
| 34 | diagram | could you add an end point below Send quote | False | False | I could not identify an action to apply. Nothing changed. |
| 35 | drawing | draw a rabbit with long ears and put a red bow on the hamster | False | False | I could not identify an action to apply. Nothing changed. |
| 36 | drawing | when does the drawbridge go up | False | False | I could not identify an action to apply. Nothing changed. |
| 37 | diagram | maybe a note for the policy limit beside Over 500? | False | False | I could not identify an action to apply. Nothing changed. |
| 38 | drawing | move the sheep 50 right | False | False | I could not identify an action to apply. Nothing changed. |
| 39 | drawing | describe the face's expression in one word | False | False | I could not identify an action to apply. Nothing changed. |
| 40 | drawing | make the bushes all purple | False | False | I could not identify an action to apply. Nothing changed. |
| 41 | diagram | make every task yellow except the budget one | False | False | I could not identify an action to apply. Nothing changed. |
| 42 | drawing | the kite should go to the front, call it Skyhook | False | False | I could not identify an action to apply. Nothing changed. |
| 43 | drawing | delete everything and start over | False | False | I could not identify an action to apply. Nothing changed. |
| 44 | diagram | set the labels to Cats and Dogs | False | False | I could not identify an action to apply. Nothing changed. |
| 45 | drawing | will you be able to shrink the hill a little | False | False | I could not identify an action to apply. Nothing changed. |
| 46 | diagram | that's wrong, make the arrow to Dashboard thick | False | False | I could not identify an action to apply. Nothing changed. |
| 47 | document | could you check whether the toast still says Ben's birthday anywhere | False | False | I could not identify an action to apply. Nothing changed. |
| 48 | diagram | ugh, start over | False | False | I could not identify an action to apply. Nothing changed. |
| 49 | calendar | quick thing, is anyone in the hall at 2pm wednesday | True | False | I could not identify an action to apply. Nothing changed. |
| 50 | diagram | the order box goes in the foreground. then column layout | False | False | I could not identify an action to apply. Nothing changed. |
| 51 | document | tell the team the offsite is cancelled, no hard feelings | False | True | Created a document. I used "document" as the title. I could not apply person the team. I used document as the kind. |
| 52 | calendar | and after lunch too? | False | False | I could not identify an action to apply. Nothing changed. |
| 53 | document | make sure no section is over one page and actions isn't in a list | False | False | I could not identify an action to apply. Nothing changed. |
| 54 | diagram | lowest point on the water line? | False | False | I could not identify an action to apply. Nothing changed. |
| 55 | document | How many jobs do I list, and how many are before 2015? | False | False | I could not identify an action to apply. Nothing changed. |
| 56 | drawing | make the chairs random colours and make the table brown | False | False | I could not identify an action to apply. Nothing changed. |
| 57 | calendar | make it 9am instead | False | False | I could not identify an action to apply. Nothing changed. |
| 58 | diagram | create a region named Hot Spots around the two busiest tables and fill it with amber | True | False | I could not identify an action to apply. Nothing changed. |
| 59 | drawing | the umbrella should go up a bit, and move the lounger down | False | False | I could not identify an action to apply. Nothing changed. |
| 60 | drawing | make the handle default size and white | False | False | I could not identify an action to apply. Nothing changed. |
| 61 | drawing | flip the piglet horizontally and then make its face sad | True | False | I could not identify an action to apply. Nothing changed. |
| 62 | calendar | add a note to the long one on friday saying bring the deck | False | False | I could not identify an action to apply. Nothing changed. |
| 63 | diagram | make the energy line dashed and put the lowest month on the calendar for the review | False | False | I could not identify an action to apply. Nothing changed. |
| 64 | drawing | dance the avatar in a circle | False | False | I could not identify an action to apply. Nothing changed. |
| 65 | document | new doc: itinerary for the Scottish road trip, keep it simple | False | True | Created a document. I used "document" as the title. I could not apply tone simple. I used document as the kind. |
| 66 | calendar | natan's panel has to be before lunch, not after, and also add the head of hr to it, please | False | False | I could not identify an action to apply. Nothing changed. |
| 67 | drawing | walrus backward 21 pls | False | False | I could not identify an action to apply. Nothing changed. |
| 68 | document | make a long article on sleep for teenagers, informal, 1 chapter, around 700 words | True | False | I could not identify an action to apply. Nothing changed. |
| 69 | diagram | change the whole diagram colour to purple | False | False | I could not identify an action to apply. Nothing changed. |
| 70 | document | make a checklist of the new hires' first-week tasks | True | False | The document already has content. I left it unchanged. |
| 71 | document | add chapter 4 about the flood | False | False | I could not identify an action to apply. Nothing changed. |
| 72 | calendar | book lunch with Ana on wed | False | False | I understood a meeting, but could not apply its scheduling details. Nothing changed. |
| 73 | document | make a heading called Results and make a list under it | True | False | I could not identify an action to apply. Nothing changed. |
| 74 | calendar | every team sync this month must be at least 30 min, none of them under 20 | False | False | I could not identify an action to apply. Nothing changed. |
| 75 | drawing | could we have a flock of geese heading south over the lake? | False | False | I could not identify an action to apply. Nothing changed. |
| 76 | drawing | move the second heart up a bit | True | False | I could not identify an action to apply. Nothing changed. |
| 77 | calendar | add Omar as the new recruiter | False | True | Created a person. I could not apply role recruiter. I used me as the kind. |
| 78 | diagram | change the expense flow colour to grey | False | False | I could not identify an action to apply. Nothing changed. |
| 79 | calendar | could you find a slot for the strategy session that's the same as Tuan's | False | False | I could not identify an action to apply. Nothing changed. |
| 80 | calendar | Moving the 1:1 with Tamsin to thursday, same as before | False | False | I could not identify an action to apply. Nothing changed. |
| 81 | drawing | the cat is blue, i didn't ask that | False | False | I could not identify an action to apply. Nothing changed. |
| 82 | drawing | what colour is the background? | False | False | I could not identify an action to apply. Nothing changed. |
| 83 | diagram | move logs to ops | False | False | I could not identify an action to apply. Nothing changed. |
| 84 | calendar | it should be 30, not 45 | False | False | I could not identify an action to apply. Nothing changed. |
| 85 | calendar | could you give the homework session a quiet room for thursday | False | False | I could not identify an action to apply. Nothing changed. |
| 86 | drawing | whiskers should be long or short, cat has long ones already | False | False | I could not identify an action to apply. Nothing changed. |
| 87 | document | one line on cusco, no more | False | False | The document already has content. I left it unchanged. |
| 88 | drawing | draw a triangle on top of the square | True | False | I could not identify an action to apply. Nothing changed. |
| 89 | drawing | put a sugar bowl on the counter | False | False | I could not identify an action to apply. Nothing changed. |
| 90 | calendar | can i see my schedule for the weekend | False | False | I could not identify an action to apply. Nothing changed. |
| 91 | diagram | link stomata to the leaves node | True | False | I could not identify an action to apply. Nothing changed. |
| 92 | document | draft a polite email to accounts asking for the invoice again, short | True | False | I could not identify an action to apply. Nothing changed. |
| 93 | drawing | move it a bit to the left | False | False | I could not identify an action to apply. Nothing changed. |
| 94 | calendar | is there a gap between 2 and 4 on wed? | False | False | I could not identify an action to apply. Nothing changed. |
| 95 | document | why is the figure 3 caption here at all | False | False | I could not identify an action to apply. Nothing changed. |
| 96 | drawing | draw a yellow duck | False | False | I could not identify an action to apply. Nothing changed. |
| 97 | drawing | the tree is nice but make it greater than the house, if you can | True | False | I could not identify an action to apply. Nothing changed. |
| 98 | drawing | put the ghost in front | False | False | I could not identify an action to apply. Nothing changed. |
| 99 | document | hi there, i need you to write a complaint about my stolen package for the courier. i want the letter to be very short, and also add my order number, it's 77341 | False | False | I could not identify an action to apply. Nothing changed. |
