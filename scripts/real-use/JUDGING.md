# Official real-use test — judging rubric (Stage B)

Stage A (`stage-a.mjs`) already decided the unambiguous rows deterministically (nothing changed and refused →
useless with the layer from the reader comparison and the reply reason; labels satisfied on the diff with an exact
reading and no caveat → full; a different object changed/removed → wrong; a compound with refused parts → partial).
Stage B judges only the remaining records in `<run dir>/cards/batch-NN.md`: request, context, GOLD and READER wires,
COMPILED tool calls, the world DIFF, the reply, the Stage A flags and a thumbnail (contact sheets for visual rows).

Judge the ACTUAL result of each card (reply + what changed + the PNG for drawing/diagram), as the person who typed
the text would. Do not compare labels; do not reward a correct reading that produced nothing. Look at the PNG for every
visual request (create, place, recolour, resize, chart, layout).

One JSON line per record appended to `<run dir>/judgments-b.jsonl`:
`{"id":..., "verdict":"full|partial|useless|wrong", "honest":"yes|no|n/a", "layer":..., "pattern":..., "note":...}`

verdict
- full — a reasonable user would say "yes, that's what I asked": every request done, the important properties
  (kind, name/label, colour, count, relation, target object) right; small cosmetic placement differences are fine.
  A question answered correctly; a no-request message (chit-chat) answered sensibly with no change.
- partial — useful but incomplete: one of several requests done, right object but a requested attribute/relation
  missing, a reasonable stand-in kind (generic shape for an unknown thing) with the reply saying so.
- useless — nothing useful happened and nothing was damaged: no change, refusal, "could not bind", or an irrelevant answer.
- wrong — harmful or misleading: the wrong object changed/removed, something clearly different created, a wrong
  answer, or a reply claiming success for something that did not happen.

honest — does the reply truthfully say what was and was not done? `yes`, `no` (claims more/other than happened, or
silent about a skipped part), `n/a` (full result with an accurate reply counts as yes).

layer (required unless full) — the first layer that went wrong:
`reader` (cut/act/target/value misread), `binding` (read correctly but no tool argument / capability bound: "could not
bind"), `sop-rule` (tool ran but the area's rule/placement/layout did the wrong thing), `knowledge` (unknown kind/thing,
missing catalog/property), `renderer` (state right but drawn wrong/invisible), `reply` (state right, reply wrong or
misleading), `setup` (the test could not build the context objects), `data` (the request text itself is unusable).

pattern — short kebab-case failure tag; reuse tags from the shared list in the run's `patterns.txt` when one fits
(e.g. `compound-second-request-dropped`, `relation-ignored`, `unknown-kind-generic-shape`, `followup-reference-unresolved`,
`question-unanswered`, `wrong-target-edited`, `chart-not-created`, `link-endpoints-unbound`, `attribute-ignored`).
note — at most 20 words: what was asked vs what happened.
