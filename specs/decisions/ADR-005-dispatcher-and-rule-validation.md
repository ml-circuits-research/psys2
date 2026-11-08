# ADR-005: Dispatcher proposes, rule formalizers validate

Status: accepted (Stage 1 of the dispatcher experiment; the verdict is in `training/RESULTS.md`)

## Context
The rule formalizers are exact and cheap but brittle on paraphrases (T2 baseline: 88.3 % exact SOP routed overall, 30.4 % on paraphrases) and the rule router fails when no pattern of any world matches. Training one model per world (LoRA adapters, ADR-002) is expensive to build and to ship. The cheaper idea: a single small shared model, the **dispatcher**, only has to say *where* a piece belongs, not what it means: it cuts a message into pieces, ranks the top-3 worlds per piece with the application state as context, and optionally proposes a simplified text. The exact world rules then decide whether a proposal is acceptable.

## Decision
- The dispatcher's output is a **proposal**: up to 4 segmentations (log-prob), per piece the top-3 worlds (probabilities) and an optional simplified text (JSONL contract in spec 03 section 7.1). It never emits circuits.
- A validation layer (`src/dialog/dispatch-validate.mjs`, browser-safe, deterministic) checks every candidate with the rule formalizer **restricted to the candidate world and its imports**, in a fresh session seeded with the record's context, and with the interpreter. A candidate is valid when all of it parses and the interpreter does not answer `unsupported` or `error`.
- The choice is the segmentation with the best total score: dispatcher log-probabilities plus a fixed penalty per piece no candidate validates (log-domain form of "dispatcher score x validity"; weights are options; formula in spec 03 section 7.3). Ties are broken by the routing policy tiers of ADR-004, by re-running the router over the tied worlds, not by a second implementation.
- When nothing validates the best candidate is returned as "not understood" with its candidate worlds, for `ui.help` ("Did you mean ...?"). Every decision comes with a trace of all candidates and the reason for the winner.
- Interpreter refusals of a fully parsed sentence (an illegal chess move, a drawing command on an empty canvas) are reported separately (`refused`). The first default was strict (the task statement); the D3 evaluation showed +3.8 points overall (games 68 to 83 %) when a parse refused for a state reason counts as understood, so `acceptRefused` is now **on by default** (policy `acceptRefused: false` gives the strict variant; evaluation modes A to Bni pin it off, Br, Bs, Bp turn it on).
- Leniency (spec 03 sections 7.9 and 7.10): each candidate also has a spell-corrected text (vocabulary of the candidate world; accepted only if that world's rules then parse it) and, as policy `acceptPartial` (off in the library, on in the webchat), a partial parse is accepted when no candidate of a piece parses completely. Both are validation candidates, so the rules keep the last word.
- Evaluation runs offline: Python writes predictions, `scripts/eval-dispatch.mjs` replays them through the validation layer (spec 03 section 7.6 defines the exact-SOP comparison, including multi-command messages).

## Consequences
- A wrong dispatcher top-1 is harmless when the right world is in the top 3 and its rules parse the piece: the wrong world's rules usually do not, and the validation recovers candidate 2 or 3. A wrong top-1 that the wrong world's rules also parse is accepted (counted as `wrong_top1_accepted` in the evaluation); only the routing tiers can then help.
- The ceiling is the rule coverage: where the rules of the right world cannot parse even the simplified text (a rule gap) the dispatcher cannot help; the evaluation lists these as their own failure class and so shows where rules are missing.
- The interpreter check is state dependent, so in the strict mode it can reject correct readings (illegal moves, empty canvas). The evaluation reports it separately (modes B / Bni / Br) so the policy can be chosen on evidence.
- Cost: up to 4 x pieces x 3 x 2 rule runs per message, each in a fresh seeded session (cached by context, committed prefix, world and text). Rule runs are cheap; the cache keeps the multi-segmentation beam near the cost of one.
- No generative model is involved at C2; the dispatcher is a classifier / tagger. The validation layer has no `node:*` imports and can run in the webchat.

## Amendment F5: explicit refusal reasons
"Refused" was one bucket. The interpreter now sets `reason` (`precondition_failed`, `unknown_argument`, `unsupported_operation`, `execution_error`) and the validator reads it: preconditions keep the reading, unsupported operations keep it and report the limit, execution errors are never valid, and an `unknown_argument` reading (a catch-all swallowing text) is only a penalised last-resort fallback that never blocks recovery (other worlds, spell, simplified, partial). See specs/03 section 7.2 and specs/04.

## Amendment G1: hierarchical selection over segmentations
The lexicographic preference (original/spell before generated, complete before partial) held per piece but not between segmentations, which were compared by total score; a partial segmentation with a normalizer rewrite could beat a complete reading. Selection is now ordered by validity class first (0 original/spell complete, 1 generated complete, 2 partial or fallback, 3 invalid) and by score only inside a class; the normalizer runs only when no segmentation in the beam is complete. See specs/03 section 7.13.
