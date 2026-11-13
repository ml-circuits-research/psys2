# Lessons: how worlds are made

Standing direction (owner, 2026-11-13): accumulate experience in how worlds are made, improve sopworld, generalise, accumulate cases, learn to combine worlds.
After every landing, 3 to 5 lines: what generalised, what did not and why, which mechanism should exist in the library or the knowledge repo instead.
Newest landing first when appended; the first block below is the backlog of the landings up to 2026-11-14.

Marks: **[LIB]** = a mechanism for the sopworld library (the reviewer forwards these lines); **[KNOW]** = belongs in the knowledge repo (sop-knowledge-worlds / catalog); no mark = stays in PSys2 or is a note about method.
The numbers behind each line are in `worker-log.md` (entries named in brackets) and the table of the measures that count (`node scripts/landing-table.mjs`, `docs/system-map.html`); cases are in `training/eval/cases.jsonl`.

## LANG-EN first slice: noun phrases, coordination / ellipsis, anaphora read from English facts (worker-log "LANG-EN first slice")
- Generalised: the closed classes of English were written again in seven modules (5 lists of determiners, 5 of pronouns, 4 of prepositions, 2 of ordinals, 2 of singularisation); as facts with a view per old list, one 214-line module (`src/lang/en.mjs`) replaced them and 187 lines of code in 12 files (the algorithms moved, so the code did not shrink; the gain is one place for every word list); test-world (34 worlds, both reasoners), owner logs a / b / c, the robustness sets and the coverage grid are identical row by row, which is what "knowledge moved, behaviour did not" should look like.
- Did not generalise: the views differ by accident (`dialogue` has `many few several`, `routing` has `new`, `acts` lacks `his her its their`), so the facts could not be unified without moving numbers; the algorithms (split a coordination, shared argument, one-anaphora) are still code, only their word lists and limits are facts; negation of an act, relative clauses, "the other one" and "some of the tables" are in no module at all.
- **[LIB]** `std.grammar` should ship the facts-lookup functions first (views, inflect, fragment, agent), then the three algorithms with these cases, then a chart parser measured against the generated patterns; a `grammar.diff(viewA, viewB)` makes unifying a measured decision. The proposal is `handover/lang.en/std-grammar.md`.
- **[KNOW]** `w.lang.en` is `handover/lang.en` (schema, 11 shards: 176 argument frames, 79 phrase groups of lang.common, rules with `status=hole` for the English nothing reads); `lang.common` mixes grammar with world-specific lead-ins (`i_want_to_make_the`), which belong to the worlds that asked for them.
- Method: when a list is copied into facts, keep one named view per old copy and diff the whole gate; a differential test of the old and new function over 2,116 words found the lemmatizer equal before any suite ran.

## Avatar switch: the avatar became the generated world (worker-log "P1 round 3", "P1 round 4")
- Generalised: one generator (`build-avatar-schema.mjs`) turns k.faces into a schema; the same generator features (canonical examples, lead and tail fillers, `tabClaim`, `accepts` decline, `outOfScope` with a clue) then served every later schema world.
- Did not generalise at first: a generated world's catch-all reading (a free text slot) captured sentences of eight other worlds on the default tab (34 test-world failures). The fix was a rule about readings, not about the avatar: a reading with free text yields to a reading with none unless the world holds the focus.
- **[LIB]** A world that declares a free-text capture needs a library-level arbitration contract ("claim" vs "decline" vs "focus"); today each host re-invents `accepts`. The library should ship the decline rule and a test that no schema world takes another world's sentence.
- **[LIB]** One undo step for several acts of one sentence (`severalActs`) and the generated-world tests (canonical examples must be readable by the world itself) are generator output, not host code.
- Catalog cost was a hidden half of the switch (steps of one turn 11,725 to 6,099 after an index by type and value in `facts.wires`): **[LIB]** `std.knowledge` readers should index a shard once and memoise a lookup within a turn.

## Diagram switch: the diagram became a schema world on a vendored engine (worker-log "diagram switch", "P1 round 3")
- Generalised: five schema keys (`tabUndo`, `claim`, `signal`, `boost`, `accepts`) and frame forms (a sentence that names the diagram is the diagram's whatever the tab); 759 of 771 old tests pass, 13 rows are in the ledger with their cause.
- Did not generalise: ask modes of the engine (path, extreme, cycle, rules) and clause cuts at commas inside name lists ("arrange A, B and C"); the diagram has no place semantics, so nothing asks the knowledge tier (11 of 20 T3 cells).
- **[LIB]** The clause splitter and the act reader disagree about commas and "and" (a name list, a rule frame, "add X and connect A to it"); the library needs one segmenter that knows the act forms, with "keep a comma after a rule frame" as a rule rather than a patch.
- **[LIB]** A schema should be able to declare a relation kind (spatial, containment, flow) that the space module and the knowledge tier can read; without it the diagram stays a drawing with arrows.
- Method: the switch rule was relaxed to 10% once removing hand-written language code became the goal; accuracy sets are a guard.

## TRANSFER slices: things, views, taught facts, rules (worker-log "TRANSFER first slice", "charts and the document", "the map", "T2", "T3")
- Generalised: one operation `things.show`, one registry (`session.things`), and views declared by a schema (`view`, `adopt`, aspect) make every new view a column of the matrix for 0 lines of per-pair code (seating, Talk, avatar, chart, document, timeline, map: 204 cells, 97 right, 107 said plainly, 0 wrong). T3 and T2 moved by changing the one lookup of where a kind usually is (`commonsense.mjs`) and the overlay of taught facts.
- Did not generalise: facts that no view has a use for ("ducks float", "penguins cannot fly") are said plainly, which is right, but the verb claim of a tab ("put on", "seat") is still read by another world first (9 T2 cells); the diagram has no use for place facts (T3 diagram 0 of 11).
- **[LIB]** Views, aspects and `show` belong in `std.things`; the registry here is a copy of items made by tab worlds, so it needs a `sync` that goes away only when tab worlds are schema worlds. The experiment harness (cells with an expectation written from common sense, three outcomes right / not applicable said plainly / wrong, wrong to the ledger by cause) should be a library tool: cells in, ledger rows out.
- **[LIB]** The act verb claim ("this world has no use for this kind, so it declines the verb") is a library concern; it caused the T2 and T3 drawing misses.
- **[KNOW]** Catalog gaps found by the experiments: friend has no entry; sister, brother, uncle have `drawing=person` but no is-a person; the knowledge tier needs `k.attributes` (the attribute table and ability seed are marked TEMPORARY here).

## KNOWLEDGE-OUT: colours, number words, arrangement, catalog reading (worker-log "KNOWLEDGE-OUT steps 1-3, 4a", "step 4 (rest), 5, 6, 7")
- Generalised: ONE reader per kind of knowledge (`values.mjs`, `arrangement.mjs`) seeded from a small bundled subset and replaced by the catalog when reachable; the gain set (200 requests, 42 then 160 right) measures it. Deleted tables: 63 colour entries, the `KNOWLEDGE` table of space (28), 26 common.sense facts.
- Did not generalise: the diagram keeps its own 18-colour palette (a vendored engine), kids.animals / kids.shapes cannot go until Talk has the frames (baby-name, covered-in, sound with "say", yes/no with a count, list by class), and the map needs `k.geo` (137 city names missing).
- **[LIB]** `std.knowledge` needs a "bundled subset then catalog" source with a `reachable()` flag and a synchronous read for the first paint; PSys2 wrote `bundled-source.mjs` for it. A word form listed only as a `core.word` (ants = ant) and a schema shard id that is its own path were reader bugs that every host would hit.
- **[KNOW]** `handover/knowledge-out/catalog-lacks.md` is the list; the kids kb files stay until the games read animals by lookup.
- Inventory test as method: a baseline file that only shrinks makes "no new general fact in a world" enforceable.

## Ablation: every model switched on and off, end to end (worker-log "MODEL ABLATION")
- Generalised result: on 6,100 gold turns, rules alone read 4,978 right (39 ms per message); the encoder adds about 60 right (its whole advantage is model segmentation), the T5 normalizer +28, the NX hybrid reader net -3. The three routers are within 3 messages end to end.
- Did not generalise: the NX gate and the normalizer break made-up-word probes; router A drifted (981 to 915). A model that reads 10 of 6,744 turns is not worth its latency.
- **[LIB]** The clause splitter, not the model, was what the encoder bought: the library's segmenter should be the cut point so that hosts need no encoder for clause cuts. The ablation harness (configurations x sets, cause groups from the ledger) is reusable as a library tool.
- Method: the cause key must be shared by every report (`scripts/lib/failure-cause.mjs`), otherwise group counts disagree across tools.

## M1: session.dialogue on std.focus and std.fill (worker-log "M1 session.dialogue")
- Generalised: one dialogue module absorbed five scattered pieces (`Discourse._repair`, `_feedback`, `_whyFact`, followup, continuation grammar); dialogue turns right 2079 to 2084 of 2241, 5 better 0 worse; two general fixes (a completion that turns a request into a question is refused; a referent the sentence already says is no referent).
- Did not generalise: Romanian rows of log b stay broken by translation (M4), not by turn kind; a modal reader (docs.reader) takes why-questions first; "no, I meant the red star, make that one bigger" (correction plus a new request) is two turns in one.
- **[LIB]** The turn kinds (why, correction, ellipsis, continuation, list) and the focus log are `std.dialogue`; the host should only name its cue phrases. A modal world needs a declared way to let the dialogue module see a turn first.
- The session facts hook (`ctx.sessionFacts()`) must also exist on the dry-run fork or every request that depends on it is judged missing: **[LIB]** a fork must copy every context hook, tested once.

## SPACE-2: shared space with pieces, relations as facts, a stable solver, k.layouts (worker-log "SPACE-2")
- Generalised: pieces, relations as facts with tiers, a solver that keeps the last valid state with the reason, layouts read from knowledge ("like a family photo" worked with no PSys2 change); 40/40 near pairs joined, 40/40 unrelated left, 0 px displacement of unmentioned pieces.
- Did not generalise: the drawing host still has `placeRelative`, `moveGroupRel` and `defaultSpot` (about 65 lines) because the solver does not do single placements yet; arrows with ports and flow / tree layouts are not reachable from a diagram sentence; 23 of 210 drawing turns still overlap; 200 pieces do not fit the frame.
- **[LIB]** `std.space` should own single placement (relative to a thing, to a region, default spot) so a host drops its placement code; outlines are convex hulls only. The ledger classes (distribute, place, amount, relation) are mostly NOT space causes: unknown kinds and translation residue; a cause group before a mechanism, always.
- **[KNOW]** `k.layouts` with slots and sort keys is the published format; usual place and size of a kind (`k.scenes`) is still a small table here.

## Recurring lessons across landings
- A fix is accepted when it names a cause group and reports the group's count before and after; most "bugs" in the ledger are one group seen many times (boundary 1,656 of 2,504 failing cases: translation and typing, not the pipeline).
- A pair of worlds that cooperate is worth more than a feature inside one world: T1 shows 11 of 15 world pairs working with no per-pair code.
- What each landing deleted is the real measure: lines of hand-written language, general lines still in PSys2, knowledge items still in worlds. The table makes it visible; the accuracy sets only guard.
