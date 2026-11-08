# ADR-005: Dispatcher proposes, rule formalizers validate

Status: accepted (Stage 1 of the dispatcher experiment; the verdict is in `training/RESULTS.md`)

## Context
The rule formalizers are exact and cheap but brittle on paraphrases (T2 baseline: 88.3 % exact SOP routed overall, 30.4 % on paraphrases) and the rule router fails when no pattern of any world matches. Training one model per world (LoRA adapters, ADR-002) is expensive to build and to ship. The cheaper idea: a single small shared model, the **dispatcher**, only has to say *where* a piece belongs, not what it means: it cuts a message into pieces, ranks the top-3 worlds per piece with the application state as context, and optionally proposes a simplified text. The exact world rules then decide whether a proposal is acceptable.

## Decision
- The dispatcher's output is a **proposal**: up to 4 segmentations (log-prob), per piece the top-3 worlds (probabilities) and an optional simplified text (JSONL contract in spec 03 section 7.1). It never emits circuits.
- A validation layer (`src/dialog/dispatch-validate.mjs`, browser-safe, deterministic) checks every candidate with the rule formalizer **restricted to the candidate world and its imports**, in a fresh session seeded with the record's context, and with the interpreter. A candidate is valid when all of it parses and the interpreter does not answer `unsupported` or `error`.
- The choice is the segmentation with the best total score: dispatcher log-probabilities plus a fixed penalty per piece no candidate validates (log-domain form of "dispatcher score x validity"; weights are options; formula in spec 03 section 7.3). Ties are broken by the routing policy tiers of ADR-004, by re-running the router over the tied worlds, not by a second implementation.
- When nothing validates the best candidate is returned as "not understood" with its candidate worlds, for `ui.help` ("Did you mean ...?"). Every decision comes with a trace of all candidates and the reason for the winner.
- Interpreter refusals of a fully parsed sentence (an illegal chess move, a drawing command on an empty canvas) are reported separately (`refused`). The strict default follows the task statement; `acceptRefused` is the lenient variant and both are evaluated.
- Evaluation runs offline: Python writes predictions, `scripts/eval-dispatch.mjs` replays them through the validation layer (spec 03 section 7.6 defines the exact-SOP comparison, including multi-command messages).

## Consequences
- A wrong dispatcher top-1 is harmless when the right world is in the top 3 and its rules parse the piece: the wrong world's rules usually do not, and the validation recovers candidate 2 or 3. A wrong top-1 that the wrong world's rules also parse is accepted (counted as `wrong_top1_accepted` in the evaluation); only the routing tiers can then help.
- The ceiling is the rule coverage: where the rules of the right world cannot parse even the simplified text (a rule gap) the dispatcher cannot help; the evaluation lists these as their own failure class and so shows where rules are missing.
- The interpreter check is state dependent, so in the strict mode it can reject correct readings (illegal moves, empty canvas). The evaluation reports it separately (modes B / Bni / Br) so the policy can be chosen on evidence.
- Cost: up to 4 x pieces x 3 x 2 rule runs per message, each in a fresh seeded session (cached by context, committed prefix, world and text). Rule runs are cheap; the cache keeps the multi-segmentation beam near the cost of one.
- No generative model is involved at C2; the dispatcher is a classifier / tagger. The validation layer has no `node:*` imports and can run in the webchat.
