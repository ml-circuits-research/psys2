# Questions from the worker

The worker appends questions here and never deletes them. The reviewer removes a question only after answering it in a new round of `worker-tasks.md`.

Format:

```
## Q<n> (task Tn, <date>)
Question: ...
Context: what was tried, what the options are.
Blocking: yes/no. If no: the choice taken meanwhile.
```

## Q1 (SOPWORLD, every world on the library, 2026-11-11): how should the library be generalized? Ten proposals for review

Context: 18 of 24 worlds now run on sopworld behind the flag (ops is the baseline). Each wave measured the library against the custom `ops.mjs` code and wrote "Library improvements" in `worker-log.md` (about 50 items). Below they are grouped into ten proposals, ordered by the evidence. For each one: should it go to the library session as a task, in this order, or is something in our host the better fix?

1. **Structural sharing instead of copy-on-write of the whole world.** This is the main cost in every wave. The first write after `mark()`/`fork()` copies every index (`_detach`), so a turn costs about 10 µs per wire present. Measured examples:
   - geo.map with 1,250 place wires: 37 ms against 6 ms in ops;
   - the avatar kb with 1,140 wires: 170 ms against 76 ms for nine turns;
   - all 24 legends in one World: 75 ms against 11.6 ms.

   Proposal: a frozen base layer (kb, legends, matrix) shared by every fork, plus a small overlay of changes, possibly a persistent map, so a change costs O(changed). Question: is this the first library task (P2 of Round 5, extended), before any of the features below?
2. **External or frozen fact sources.** Big static tables (places, avatar variants, colour names) should be readable by rules and denies without being wires in the instance. Today we work around it with `kb=lookup`, a JS index invisible to rules. Proposal:
   - `World({ facts: { type: provider } })`, matched like wires but never copied; or
   - `core.table from=<lexicon>`;
   - plus `core.check fn=member` over a many-valued wire.

   Question: provider in the library, or keep `kb=lookup` in the host?
3. **Undo/redo as library features.** Every world rebuilt the same pieces in the host:
   - redo (`redo=` + the function `rewind` returns);
   - steps that are not undoable (`isView`, `passive`, untracked writes);
   - labels for the step taken back (`undoWords`);
   - undo by unit (one note instead of a whole turn);
   - a timeline that survives a watchdog restart (today a real regression in matrix mode).

   Proposal:
   - `mark(label)`, `world.marks()`, `world.redo()`;
   - `transient=true` types and `applyPatch(.., { track: false })`;
   - `rewind(mark, { only: type })`;
   - `world.toJSON({ timeline: true })` / `fromJSON`.

   Question: library, or one host module shared by all worlds?
4. **Aggregates and lists in rules and reasons.** Repeated in five waves:
   - aggregates need a separate anchor, and anchoring on a member made one count quadratic (433 ms against 11 ms);
   - an empty group has no 0;
   - there is no rank ("the 2nd chapter");
   - there is no join, so a reason cannot say "Shapes on the canvas: A, B" or "Mouths can be grill, speaker…";
   - ties in argmax have no "all" mode.

   Proposal: `core.aggregate … default=0`, `core.distinct` as an anchor, `core.rank`, `fn=join` / `?x:and` in reasons, `ties=all`. Question: one "aggregates v2" task?
5. **Multi-valued answers.** Two cases the library cannot answer today:
   - in value mode, a key with several values answers `conflicting`, so kids.animals cannot move "where does it live / what covers it";
   - an `is_a` check returns the supposed value instead of yes or no.

   Proposal: `many=true` / `answer=list` on the slot, and `mode=check`. Question: accepted as specified in the worker-log (with a minimal repro)?
6. **Better refusals.** Four requests:
   - bound variables in `why` (`violations[i].vars`, and filters such as `?n:ordinal`);
   - a rank on denies, because a refused chess move breaks three rules and the host ranks them by regex;
   - `why=` on slot violations (`type=`, `domain`, dangling refs);
   - referential integrity and uniqueness as slot kinds (`kind=ref to=…`, `unique=true`), which would replace 8 of the 17 denies in draw/diagram.

   Question: which of these first?
7. **Value kinds.** Two kinds, plus one patch operation:
   - `kind=blob` / opaque values, never tokenized and compared by hash, for big analysis JSON;
   - `kind=json` with path variables, for state kept next to the facts;
   - `replace` / upsert in `applyPatch` keeping the id. Today a retract plus a tell of the same id is refused as duplicate-id, so worlds invent revisions such as `chess.g_1`.

   Question: are these in scope for the library, or do we keep JSON strings?
8. **Cost control for rules.** Three proposals:
   - lazy rules (`lazy=true`, derived on query or check): chess re-derives the attack structure every turn, most of its +2 ms;
   - `index=false` slots, so a patch that touches only unread values skips the rules pass (1,000 moved things: 91 ms);
   - `core.action pure=true`, so an action that reads no cell skips the `assumptions()` pass.

   Question: worth it, or is proposal 1 enough?
9. **Expressions and builtins.** One rule needs 17 `core.calc` and 9 `core.check` wires to test "strictly between two squares". Proposal: `expr=` in calc/check plus `between`, `sign`, `abs`, and string checks (`matches`, `startsWith`, `lower`). Question: is a small expression language acceptable in SOP Lang v1.2?
10. **A public API for what the host reads privately.** The host reads `_rests` (assumptions), `_compiled().slots` (can anything be filled) and uses the stamp for "did anything change". Proposal:
    - a public `world.assumptions(ids)` and `canComplete()`;
    - a stamp that does not move when an instance is born or replays shared wires;
    - per-attribute tiers from the host (`tempo=100~default`), so "I assumed a bar chart" becomes possible.

    Question: OK to ask for these as one "host API" task?

Blocking: no. Meanwhile the host keeps its workarounds (`kb=lookup`, `redo=`/`isView`/`passive`, generated tables, regex ranking). The per-world numbers are in `sop_world_status.md` ("Per-world comparison"). The next host fix on our side is the undo timeline after a restart, saved with the state (proposal 3, last bullet).

Q1 answered by the reviewer in worker-tasks.md ("Answer to Q1 ... RE-VENDOR 0.7.1 + namespaces", 2026-11-11 23:35). The worker keeps this file append-only, so the reviewer may remove Q1.

## Q2 (FORMALIZE-FROM-WORLDS and E2, 2026-11-12): six proposals from today's results, for review

1. **Descriptions must not become memorization.** DESCRIBE-ALL for tictactoe, hangman and guess reached parity by copying every pattern alternative into a `core.word` wire. The descriptions came out 3 to 24 times longer than the hand-written patterns (guess: 11,939 lines for 500). That is memorization in another notation, not the generalization the user asked for. Proposal:
   - a description may only reference shared vocabulary: `lang.common` phrase groups, the world's lexicons, and one `core.word` per real word, never per phrase;
   - a world that reaches parity only by enumerating phrases is reported as a gap;
   - add a size gate to the DESCRIBE-ALL report: description lines plus words must not exceed the pattern lines.

   Agree? Already applied to the conversation worlds now in progress. `describe.sop` is no longer shipped in the webchat (8dd5d7f).
2. **The veto scales only with world hooks.** Today only art.draw and diagram.sketch answer "does this thing exist?" (`checkReferents`), and the library's fallback judgement needs arguments mapped to slots, so most readings stay unjudged. Proposal: every world declares, in SOP and English only, an argument-to-slot mapping for its operations (`core.describe.arg of=` already has most of it). The host then derives `checkReferents` and the library's `judgedBy` for every world from that one declaration, with no per-world JS. Agree?
3. **Joiners per language belong in the translation layer.** E3b showed that "listă cu lapte și ouă" and "titlu A, B și C" mis-split because the clause and list splitters know only English joiners. Since Romanian stays out of the worlds, the fix is the translator: make sure "și", "apoi" and "plus" become "and" and "then" before segmentation, and add a test set of Romanian compounds. Agree that this goes into RO-TRANSLATE-FALLBACK's follow-up?
4. **About 207 Romanian replies still end as the fixed line** ("Nu am încă o formulare…") without a real Translator. The browser Translator covers them in Chrome. Should the rules translator keep growing templates by frequency, or do we accept the fixed line as the no-API fallback and stop there?
5. **Two small behaviour choices, both neutral in the A/B:**
   - (a) "Yes" to an offer, then "Undo that". The library returns to the open offer (`pending`, `inputMode=confirm`), while ops forgets it. Proposal: an undo of a confirmation also closes the offer it answered.
   - (b) A tab switch or a setting is a timeline step, so a run of "undo" also takes back "let's play tic tac toe". Keep it?
6. **Games are the slowest group (+3.5 ms at p50).** `lib.act` takes 2.4 ms per turn and `_state` 0.9 ms (7.8 derivations per turn). Proposal: cache `toState` per instance stamp across a turn, which is safe because it is a pure function of the instance. The library item is a cheaper `act` transaction for actions that change one wire. OK to do the host part?

Blocking: no. Meanwhile: (1) is applied; the veto is being made the default (user decision 2026-11-12) with the false `no-game` vetoes fixed first; (2)–(6) wait for the answer.

## Q3 (WORLD-OF-WORLDS, 2026-11-13): what sopworld lacks for ranking worlds with reasons

The rules of `meta.worlds` (worlds/meta.worlds/matrix.sop) run in the library: `core.rule` with `not=` works (a block that disappears when a fact is told later), joins over many-valued keys work, and a derived wire can be the input of another rule. Four things were missing, each worked around by the host (blocking: no):
1. **Text in a derived wire.** `core.rule ... then=` cannot interpolate variables into a string (only a `core.deny`'s `why` can). The plain-words reason is therefore a table of `meta.worlds.say` wires (rule -> text with `{via}` and `{name}`) that the host fills. Proposal: `say="the ?x is in your ?w"` on `core.rule`, kept in the derived wire's `meta`, so `explain` returns it.
2. **A sum per key.** `core.calc fn=sum over=` gives one total for the whole pattern, not one per world, so the host adds the points of the votes per world. Proposal: `group=?w` on `core.calc`.
3. **Soft scores in `rank`.** `rank` orders readings by consistency, referents, lacks, words left out and assumptions, never by points. A router needs weighted evidence, so the order is the host's (`score` desc). Proposal: a `weight` on rules that `rank` can use as a last criterion.
4. **A cap per rule.** A rule fires once per binding (a long message that names two things votes twice). The host caps votes per rule. Proposal: `limit=2` on `core.rule`.
## 2026-11-13 — SPACE: what sopworld lacks for the module `space` (library items; no blocker, host functions used)

The module `space` (worlds/space/, specs/18) is rules in JavaScript (`space.mjs`) over a projection `space.item` / `space.frame`; none of its arithmetic is a declared host function of sopworld yet, because the library lacks what a selection needs. Please pass to the library:

1. **Ordering of a set of wires by a number** (a `core.calc` that sorts by a key and returns the n-th, or the rank of each wire): "the second from the left", "the first in reading order". Today: `readingOrder` in space.mjs.
2. **Median / middle element of a set along a key** (`fn=median`, and the element at the median): "the middle house". Today: sort and pick in space.mjs; an even count has no middle and the host asks.
3. **Argmin / argmax over a set** (the wire with the smallest or largest value of a key, with all ties returned): "the biggest", "the nearest to X". Today: sort in space.mjs.
4. **Pairwise functions over two sets** (distance between two boxes, overlap test) as a calc that ranges over pairs: "next to", "no overlap". Today: `gap`, `overlaps` in space.mjs.
5. **A fixed-point / iteration** for "tidy up" (push apart until nothing overlaps): today a bounded loop in space.mjs.

Meanwhile: the module is host-function style (pure functions imported by the hosts), the spatial words are real `core.lexicon` groups (generated from the tables, checked by a test), and the schema (`space.item`, `space.frame`) is declared in `worlds/space/legend.sop` so a later matrix version can derive the same answers from wires. Blocking: no.

## Q3 (worker, 2026-11-13 16:40) — SPACE-2: the owner's request for a smarter shared space (FYI, starting after SCENE-NATURAL P2/P4 lands)
The owner asked (16:35) that the `space` module be general enough for every host, the avatar included, with consistency rules:
1. natural overlap avoidance that knows the real **surface of each piece** (outline or polygon, not only the bounding box);
2. **joining**: pieces that are close are joined naturally (snap and touch: a roof sits on the walls, a wheel touches the road); they stay apart when the user says so ("don't join them", "leave a gap");
3. **layouts from general knowledge**: arrangements the common-sense and knowledge worlds suggest (a face: eyes above the nose, mirrored; a house: roof on top; a table with chairs around it; a family in a row by height), not only row/column/grid/circle;
4. the rules expressed in SOP Lang as far as sopworld allows (ordering, median, argmin and fixed points are missing, see the SPACE note above), with host functions only for geometry.
The worker will start SPACE-2 when P2/P4 (which edits the same module) has merged, and the avatar agent already uses `space` inside the face frame. Reviewer: please add acceptance criteria or a task block if you want a different scope.

## Q4 (worker, 2026-11-13 16:40) — review request
All of today's blocks are on main at ba14b58 (summary in worker-log "READY FOR REVIEW"). Please validate and write the next tasks. Two decisions are yours and the owner's: (1) WORLD-OF-WORLDS: the decision rule is not met; the worker suggests C (symbolic + encoder prior) for dialogues once the cards are richer, see the tables; (2) the owner's test policy (smoke per landing, full suite in periodic bug-fix sessions) replaces "full suite before each publish".


## 2026-11-13 gaps for sop-knowledge-worlds from E-T1 (Talk coverage, local fixture catalog)
Missing knowledge, by domain, as asked by the 301 questions (full rows in training/eval/failures.jsonl): animals (legs, size, habitat, diet for spider, ant, owl, lion, whale, penguin, octopus, crocodile...: k.animals and k.commonsense not local); food (what is X made of, is a tomato a fruit, colour of food: k.food, is-a in k.words); places (capital of X, is X big, Sahara, Mount Everest: only geo has countries; no mountains, deserts, rivers); space (moons per planet, "which planet has rings", "why is Mars red", star, sun, moon facts); body (fingers of a hand, teeth, bones, what the heart or brain does, parts of hand/eye/ear); words (meanings, synonyms, opposites, kind of word, is a dog an animal: k.words sense and is-a); units (centimetres in a metre, longer than, kilogram, litre); things (size class for most catalog things: "which is bigger a table or a plane" has no size fact; counts of parts such as windows and legs; the part-kind words "ball", "kite", "tent", "comet" are missing or have no object).

## Q5 (worker, 2026-11-13 19:40) — SPACE-2 build: my view and objections before building (17:40 block)
View: agreed on the three layers; I build them as two browser-safe files next to `space.mjs` (`worlds/space/pieces.mjs`: pieces, anchors, relations as facts, the rule set with tiers and refusals; `worlds/space/solver.mjs`: the stable solver) and `src/knowledge/layouts.mjs` (reads `k.layouts`), all plain data in and out so a host keeps the facts in its own state (and undo snapshots them). Objections, none blocking:
1. **`k.layouts` does not exist yet and no format is published.** I define the minimum I need as a proposal and read it through the catalog's source (`k.layouts/shards/layouts.sop`, same as `k.faces`): `@layout.<id> k.layouts.layout name= synonym= generator=<row|column|grid|ring|corners|stack|flow|tree|landscape|scatter|face> sort=<none|height|size|reading> when="..."`, and a layout with no code at all as slot rows `slot="<fx> <fy>"` (fractions of the frame, in order) plus optional `rel="<slot> <relation> <slot>"`. A layout with slots only is E-S6 (usable with no PSys2 change). If the knowledge repo chooses another shape, only `parseLayouts` changes. The generic knowledge reader (`facts.mjs`) is not on main: I read `k.layouts` through the existing catalog source and a local fixture (`tests/fixtures/k.layouts.sop`); the local table stays the fallback.
2. **Outlines are convex hulls of part points, not true shapes** (limit to be said in the report); concave things (an L-shaped house) are over-approximated, so "next to" may leave a little more air than the eye wants.
3. **`on` after a move.** Moving the carrier moves what is on / attached to / in it. Moving the carried thing itself: if it ends off its support the fact is dropped and said ("the cup is no longer on the table"), never silently kept false. Please confirm this is the wanted rule (alternative: refuse until the user says "take it off").
4. **Tiers need a source on each fact.** said > focus > scene > knowledge > default; equal tier: the newer wins; a lower tier never overrides a higher one but is reported as a refusal with its reason. `apart` is a fact of tier `said` and stays until the user removes it.
5. **Rules in SOP Lang:** the rule rows (`space.rule`) stay declarative; the geometry and the ranking are host functions. `std.relations` (sopworld 0.16) is not vendored in my worktree, so I do not move rules there now.
6. **Avatar:** I expose `anchorsOf`, `faceLayout(slots)` and `attachAt` as the API (no edit of ui.avatar).
7. **Ledger classes:** of the 17 ledger rows in place / relation / amount / distribute / default-place / space, about half are causes outside space (translation sense, an unknown kind with no stand-in, the swing as a thing). I measure all of them before and after with `scripts/measure-ledger-space.mjs` and name which group each change moves; I do not touch the kind or translation groups here.
## 2026-11-13 (worker, ACTS x SCHEMAS A1-A4): objections, risks, cost estimate (not blocking; building now)
**What I build first (decision, say if wrong):** `worlds/acts/acts.mjs` is pure and browser-safe (schema parsing, act reader table, executor, fallback), with injected hooks for knowledge, focus and where-else (`know`, `focus`, `whereActs`); sopworld 0.16.0 `std.fill` / `std.focus` are NOT vendored in this branch, so the hooks are the thin adapter and nothing in acts.mjs imports the library. A schema world gets its patterns, operations and templates GENERATED from `schema.sop` by `scripts/build-schema-world.mjs` (generated files, stale-checked like the world cards); its `ops.mjs` is a generated stub over the executor. Reason: the engine, routing, undo, tests and both reasoners already run worlds from those files, so no change to the engine is needed to prove the idea.
**Objections / risks**
1. *Phrasing variety.* The act grammar is a finite table of forms (about 40 forms for 12 acts). It will miss "get rid of", "I'd rather have it green", "swap". Mitigation: words come from `core.phrase` groups (one place), the fallback names the guessed act instead of failing, every miss is a ledger row of class "act phrase" (one fix, all worlds gain). It will NOT match the hand-written coverage of art.draw (hundreds of patterns, years of owner logs) at first: P1 must be judged on the logs, not on today's test sets alone.
2. *Ambiguity between acts that share words.* "make table 2 blue" is `change`, "make a table" is `make`, "add 2 seats to table 1" is `change more`. The generated forms resolve it by priority and by the schema's own words (attribute and value lexicons are generated per world), so a world with a kind named like a colour will confuse them. Acceptable; the executor re-reads `make X <value>` as `change` when X resolves to an existing instance and the tail is a value of one of its attributes.
3. *Bland replies.* One reply template per act ("I removed the glasses") is correct but flat. Mitigation: replies are built from the act + roles + the state difference, with the schema's `noun` and `say` words; variation is a phrase group per act, selected deterministically (not random: tests and undo must be stable). Real flavour (avatar's "Ta-da" etc.) stays out on purpose (M4 says no interjections).
4. *Per-turn cost.* Generated patterns are about 40 per world, not 400, so matching is cheaper than hand-written worlds; the executor is O(items). The extra cost is the state snapshot for undo per mutating act (structuredClone of `items`); bounded by `limits.history` (default 30) and `limits.items`. Expect under 1 ms per turn for worlds under 200 things; a world with thousands of things (draw) needs diff-based undo, not snapshots: that is an A6 item, not A3.
5. *sopworld vs host split.* Needed from sopworld and expected to be there in 0.16.0: `std.fill` (tiers said > focus > scene > knowledge > default, with the source recorded), `std.focus`, relations as facts, would-be-refused dry run, all-or-nothing groups. Host-side forever: the act grammar (English), the renderer, schema-to-patterns generation, value parsers. Proposal for the library: a `core.schema` declaration (kinds, attributes, value types, acts) and a generic `apply act` so the executor is the library's, and the host only keeps the English. Until then the executor is host code and must not grow rules that belong to the library.
7. *Overlap with FORMALIZE-FROM-WORLDS and describe.sop.* describe.sop already generates patterns from operation descriptions (verbs, slots). The schema is the same idea one level up: describe.sop describes ONE operation, the schema declares kinds and attributes and the acts apply to all of them. Proposal: `describe.sop` stays for worlds with their own operations (rule worlds, games); a schema world needs no describe.sop. The generator writes the same pattern wires FORMALIZE-FROM-WORLDS would, so the two can be merged later (generator = a describe provider).
8. *Undo granularity.* One step per request means "add 3 guests" is one undo step, not three: the snapshot is taken per request (the operation call), and a compound message ("add a table and remove a guest") is two requests, two steps, as in the engine today.
9. *The act set is not closed.* Games, arithmetic, shop are rule worlds and keep their moves; chart "bar for each month" needs a `make` over a series (set role) which the executor supports only as "N things of one kind"; layouts ("arrange in a circle") belong to `place` with `space` (agent b), which `place` calls through the hook `layout(items, kind)`; not implemented here.
**Cost estimate (worker time, one agent):** A1+A2 (grammar, schema format, generators) about 1.5 days of work to a standard where P2 (60 requests) can be run; A3+A4 executor and fallback about 1.5 days; the first version in this session is the smallest honest slice of each (12 acts declared, executor for make/remove/change/place/connect/group/pick/ask/copy/undo/save, send/load as effects). P1 (avatar + diagram on schema) is 3-4 days because the avatar's face slots need `space` and `k.faces`, and diagram has arrows with labels (connect with attributes). A5 grid generator 1 day after A3. P3 tagger training: data generation 1 day, Spark run half a day.

## Q6 (worker, 2026-11-13 21:30) — sopworld Q26 handover and a beta-mark question
1. **sopworld Q26:** our hand-written patterns.sop files (22 worlds, 4747 patterns) and spec 03 are copied into a sopworld checkout on branch `compat-psys2-patterns` (commit 811d6e7, under `compat/psys2/`), not pushed because the worker has no rights on that repo. diagram.sketch is left out (its file is generated); data.charts, geo.map and media.music contain committed "R2" sweep blocks. Lexicons are not copied: it is for measuring the matcher's index only. Tell us where to deliver it (a patch file, or push rights).
2. **Beta marks after M4:** the round trip with M4 puts every language under 80 (nl 73.1, fr 73.1, it 72.7), partly because the English reference itself fell to 90.7% (19 avatar cases and one weather question fail on main after the avatar rebuild). Should the gate use right / englishRight (nl would be 80.6%)? The rule is unchanged until you decide.

## Q7 (worker, 2026-11-13) — TRANSFER proposal: objections and risks (not blocking; building the first slice now)
1. *Aspects are only as good as the knowledge.* `k.attributes` is not in the catalog yet (the fixture has k.objects, k.commonsense, k.words, k.geo, k.time, k.people, k.animals only). Until it arrives the aspects of a kind are read from what exists (parts = visual+spatial, k.geo wires = geographic, k.time = temporal, k.people = social, commonsense usually_count / animals legs = numeric), from the aspects the view's own schema gives its kinds and attributes, and from a small table marked temporary. The table is deleted when k.attributes lands.
2. *Textual and relational are universal.* Every named thing can be listed and linked, so those two aspects do not filter. A view that shows only textual / relational aspects (a document, a diagram) accepts everything; what refuses a thing is then the view's own kinds (the seating plan seats tables and guests). "Not applicable" therefore has two causes, said differently: no shared aspect, or the view has no such kind (and where it does exist).
3. *Three views are few.* T1 is 3x3, T2 can use only two other views per fact (the third would need art.draw, diagram or charts as views). I report T2 as taught-in-one, used-in-two and say so; the three-views reading needs art.draw as a view first.
4. *A copy, not a shared object.* A thing adopted by a view becomes an item of that view's executor (so undo, difference, reply and why-answer work unchanged) linked to the store thing by id; the store is the identity and the attributes are synchronised after every act, not a live two-way binding. A change made in view B reaches view A at the next show / sync, not on the same turn.
5. *Learned facts are per session, the catalog is shared.* The learned wires live in the session (state of session.things, saved with it) and are overlaid on the catalog for that session's operations (`src/knowledge/learned.mjs`), so no session can change what another reads. Taught facts are only as understood as the three sentence forms I read (is a kind of, called, can / live in); a fourth form is a ledger row, not a patch.
6. *Overlap with user.profile.* "My dog is called Rex" is a profile-like fact. I store it as a learned wire (`session.learned.own`) and do not touch user.profile fields; merging the two is a later decision (they would share the wire format).
7. *Talk transfers.* Only the targets that are views (avatar, seating) go through selection. draw, diagram and map stay on their per-pair code until art.draw / diagram / map are views; I do not fake them with adapters.
## Q7 (worker, 2026-11-13, P1 round 2) — for sopworld: what std.acts needs before PSys2 can apply acts through it (thin bridge kept)
Not switched yet: `worlds/acts/acts.mjs` still applies the acts. Reasons, in sopworld's question format. What the adapter needs from `std.acts` / `std.schema` (0.18.0):
1. **A reply from the diff.** `act()` returns `{ ok, result, diff }`; PSys2 needs the English sentence of every act ("I added table 1 and table 2", "I made table 2 blue (it was white)") and the why-answer, which today come from the executor's log (act + roles + diff + the user's text). Asked: `act(req, { say: true })` or a documented `explain(diff)` so the sentence is not rebuilt per host.
2. **Referents by words.** Roles arrive as the user's words ("table 2", "Ann", "the blue ones", "it"); today the executor resolves them (kind synonyms, ordinals, spelling slips of one letter, coordination, focus). Asked: `std.fill`-style resolution of a phrase to ids with the tier it came from (said, focus, scene, knowledge, default), so the guess can be said.
3. **Domain effects.** Worlds whose state is not wires (the avatar's `state.face`, the diagram engine's shapes) need `act()` to call a registered effect for a kind and return its diff, instead of editing wires: `std.acts.effect(kind, act, fn)`.
4. **Undo of one request, several acts.** One sentence can be several acts ("make the avatar an angry boy"): asked `act([...])` that is one undo step with one combined diff.
5. **Decline.** `accepts(act, roles)` before routing, so a world can say "this is not mine" (PSys2 added it to the formalizer: a world exports `accepts({ action, mode, roles, text, state })`, false drops its reading before routing).
6. **Reserved state keys.** The executor keeps `items, counter, history, future, saved, log, links, groups, focus, outbox, lastAct, pending, inputMode` in the world state; a world that has its own state with such keys (the diagram engine has `last`, `groups`, `pending`) clashed once (`last`). Asked: keep the library's bookkeeping under one key.

## Q8 (worker, 2026-11-13 22:40) — review request and open decisions
On main since your last validation (84e7b16): M4 as the only translation path (all languages beta under the current gate, see Q6), P2 plan.seating + Talk on the real catalog (E-T1 fact found 43% → 81%), M1 session.dialogue (+ world-first why answers), avatar probe causes (bundled face with all slots, tab-owns-act rule, undo ignores questions, k.layouts published format), TRANSFER first slice (session.things, session.learned; T1 22/38/0, T2 8/29/3), P1 round 2, P3 act tagger table (training/results/act-tagger-p3.md), art.draw acts pilot (77% of its tests; opt-in). The avatar switch to the generated world is held back: it captured other worlds' sentences (34 world-test failures, e.g. "my name is ..." saved a face) and is being fixed.
Decisions wanted:
1. P3: compound messages — segment first (dispatcher) or tag several acts? A "none" class for non-doing turns? Owner asked whether one small model could replace DistilBERT for segmentation + world prior too: the worker can run that as an experiment if you want it.
2. P3 size: the table suggests the 6x384 MiniLM (23 MB, 21 ms/message on the phone profile, −0.25 held-out span F1); owner decides.
3. art.draw pilot decisions (worker-log): multi-act through act([...]), parts of a thing as kinds from k.objects, undo phrasing from lang.undo.*, a generated matrix.sop for schema worlds, `accepts` reading the segment text (done, small general fix).


## 2026-11-13 TRANSFER (charts, document, timeline): for the reviewer
1. A view that takes things (chart, document, timeline) publishes none of its own. Should the rows of a chart and the sections of a document become things (so T1 has rows in them), or stay sinks? I left them sinks.
2. The named-world tier of routing (`routing.mjs`) lets "send table 1 to the chart" be read by the chart's data pattern with a number, ahead of the seating plan's `send` on its own tab. A general answer would be `tabClaim` on the generated `send` patterns of schema worlds (acts.mjs, not touched here) or "a send verb never starts chart data". Which?
3. The view words in `lex.session.things.views` repeat what each view declares. Generating that lexicon from the `view` operations is the clean form; I left it TEMPORARY.

## 2026-11-13 KNOWLEDGE-OUT 4a: missing catalog items, for the knowledge repository
Found while moving the colour and number-word tables out of the worlds (k.values read by one reader, `src/knowledge/values.mjs`):
1. **Colour names the worlds used and k.values lacks:** `gray` (US spelling of grey, only `grey` exists), `skin`, `golden`, `ginger`, `caramel`, `blonde`, `auburn`, `off white`, `light red`, `light gray`, `dark gray` (the last three are shade + basic colour: the tools make them with their own shade words). `gray` and the chat shorthand (`grn blu blk org pnk gry prp ylw wht brn`) sit in ONE spelling table in `values.mjs` until the catalog has `core.word` wires for them.
2. **A marker for the colour sense of a name that is also a thing or a verb** (violet, rose, coral, lemon are meant as colours; tomato, plum, salmon, wheat, rust, tan, mint, sand, snow are things or verbs): without it "I want to learn Rust" and "colour of tomatoes" were read as colour requests. PSys2 derives `thing=` (a k.objects name or a k.words verb sense) and `core=` (listed in k.colours) at build time and keeps four names (`COLOUR_FIRST`) by hand until the marker exists. Names now left out of the formalizer lexicon (the reader still knows them): chocolate, charcoal, bronze, cherry, copper, salmon, tomato, wheat, jade, mint, plum, rust, sand, snow, tan.
3. **Drawings** for the built-in kinds of the drawing board that k.objects lacks: circle, square, rectangle, triangle, line, arrow, oval (k.shapes has the shapes; the board draws them as primitives).
4. **Number words:** `third` is both an ordinal and a fraction (one text, two kinds): fine, but the reader keys by text and kind; `a dozen`, `a couple` are `group` words, read as numbers by no world yet.
5. **Usable RGB for a drawing board:** the CSS value of `red` is #FF0000 and of `green` #008000; the board now paints with them (the old hand palette was softer). If the catalog has a softer "crayon" set, say which wire.

## Q9 (2026-11-13, model ablation): decisions for the reviewer and the owner

Report `training/results/model-ablation-2026-11-13.md`. All models together buy 95 right answers in 6,099 (1.6 points) over no model, at 165 MB, 165 s cold load at 1 MB/s and 4.8 times the time per message; the wrong count does not go down. Decisions wanted:
1. **NX hybrid reader** (default today): it reads 10 turns of 6,744, rescues 6, breaks 9. Set the default `nxStrategy` to `rules`? (Recommended: yes. `neural` loses 126 right, adds 136 wrong; keep selectable only.)
2. **Segmentation model**: it is the encoder's whole operational advantage (+19 of 1296) and nothing on dialogues. Build the card-driven clause cutter (cut at a joiner when the right side starts with an action word or question frame of any world) and re-measure, then decide whether the dispatcher model stays? (Recommended: yes, one task; the dispatcher stays until then.)
3. **Routing**: C when the encoder is on, B when it is off, A not a candidate (end to end the three are within 3 messages; A hurts knowledge probes, and its world-level number drifted from 981 to 915 on the operational set since the first experiment). Make B the documented fallback when the model is not loaded?
4. **T5 normalizer** (97 MB): +28 right (0.5 point), 9 broken, cold load 97 s. Make it an optional, user-triggered download, never part of the first load on a phone profile? (Recommended: yes.)
5. **Prototypes ready for review** (flags off, spec 03 7.17): suspect-word leniency (`suspectWords`) and "also" as a joiner: +21 right, -14 wrong, no regression on operational / dialogues / minimal pairs. Switch on by default? Also candidate: READER-ROUTE `fill` (+14, no regression above 1).
6. **Act tagger P3**: not wired, no checkpoint kept, 72 to 74 % agreement with the generated patterns. Drop as a runtime reader and keep the generator for schema authoring only?
7. **Bug F1 (needs an owner)**: `facts.thing('legs')` is unbounded on the online catalog checkout b705b3c: the Talk tab freezes and runs out of memory on "How many legs does a spider have?" against that catalog. A step budget and a cap on wires per lemma are needed before the online catalog meets real input. The ablation used the repository catalog.
8. **Translation**: rules-only Romanian reads 75.9 % against 78.0 % shipped; MT stays for every language without a rules pack. No change proposed.

## Q (worker, 2026-11-13): shared things / taught tier / catalog from sopworld 0.23.0: confirm the order before the consumers are rewritten
0.23.0 is vendored (build-bundle included). The library's catalog and things TELL wires into a World; our `facts.mjs`, `learned.mjs` and `session.things` give synchronous JS records to about 25 consumers and registry items of tabs that run in our interpreter, so the "thin adapter, delete ours" step is a rewrite of the consumers (details and the proposed order a, b, c in worker-log "sopworld 0.23.0 vendored"). Please confirm: (1) wait for KNOWLEDGE-OUT to land before touching `facts.mjs`; (2) order a (taught tier through a session World with both stores compared), then b (catalog wires), then c (tab worlds as schema worlds, art.draw first); (3) acceptable that session.things is deleted only when the last tab has moved.

## Q10 (worker, 2026-11-14 01:10) — owner-agreed proposal: tracked scaling indicators, and ENGLISH AS A WORLD
**Owner (paraphrased from Romanian):** agrees with the indicators below, but not necessarily as the main measure: a small LLM or BERT may be good enough for language; our focus is the symbolic world model and rules that compose across worlds. Still, if we solve language better through our own worlds — if what is known about English grammar is encapsulated as a sopworld world — that would be very interesting. "Propose it."

**1. Scaling indicators (tracked at each landing, next to the existing tables; not the only gate):**
- a new world from a schema alone: share of 60 natural requests (written without seeing the grammar) answered right — today 31/60 (plan.seating);
- robustness sets: typos 840/987, loose words 335/643, paraphrases-rt 22/146 (rules default);
- cross-world captures per landing (a world answering another world's sentence; the invariant and test-world catch them) — target 0;
- the richest world on acts: art.draw pilot 81% of its tests, owner logs not worse — the switch is the proof.

**2. ENGLISH AS A WORLD (proposal).** Today English knowledge is scattered: the act grammar (`worlds/acts` FORMS), lang.common phrase groups, the clause splitter and card-driven cutter, one-anaphora and pronoun rules, the ellipsis/continuation rules of session.dialogue, value parsers, plural tables, number words. Proposal: one reusable world `lang.en` (SOP Lang facts + rules in sop-knowledge-worlds; the few functions it needs in the library as `std.grammar`) holding what is known about English, independent of any app:
- morphology (inflection, plurals, irregulars; from k.words where present), word classes and lemma lookup;
- argument structure of verbs (who does what to what, with which preposition) — the roles of the acts come from here, k.actions supplies the verbs;
- noun phrases: determiners, quantifiers ("each", "all the", "three different"), modifiers, possession ("the legs of the crocodile", "the house's door"), relative clauses;
- coordination and ellipsis ("a white house and a green one", "red and blue", "move it and the tree");
- anaphora and reference (it / them / one / that one / the other), deixis ("here", "there", "this");
- negation, questions (wh-, yes/no, tag), imperatives, politeness and fillers;
- spatial and temporal prepositions as relations (feeding the space and time modules);
- clause structure: conjunctions, "then", "also", conditionals ("if ... then"), frame leads ("from now on").
The act reader, the dialogue module and the cutter then read with `lang.en` instead of their own English rules (PSys2 keeps only the UI strings); other languages could be added as sibling worlds later, with translation staying the default path.
**Measure:** the same four indicators plus the ledger groups "act phrase", "fragment/list", "translation reader-gap"; and a head-to-head on the robustness sets: `lang.en` rules vs the small encoder vs both. The model stays as a fallback where it measurably wins; the owner's point stands that a small model may be good enough, so the experiment decides.
**First slice suggested:** noun phrases + coordination/ellipsis + anaphora (the largest causes in the owner logs and the art.draw pilot), moved out of acts.mjs / dialogue.mjs into `lang.en`, with no change in numbers as the gate, then grow it.
Reviewer: please accept, change or order this; the worker can start the first slice in a parallel worktree.
## Q11 (worker, 2026-11-14): what still keeps `acts.mjs` from applying acts through sopworld 0.24.0 `std.acts` (the bridge, listed)
`act([...])` (one undo step, all or nothing) and `actReply` exist now; four things of Q7 are still missing, so the executor stays a thin bridge (`worlds/acts/acts.mjs`: English grammar, value parsers, generators, the executor over host state, `group()` for several acts as one undo step). For sopworld, in its question format:
1. **Replies from the diff in the host's words.** `actReply` says "I made a house (house1)"; the worlds say "I drew a yellow house." and answer "why" from the diff, the roles and the user's text. Asked: `act(req, { say })` taking a template per act and kind, or a documented `explain(diff)` over the changed wires with the user's words kept.
2. **Referents by words.** Roles are the user's words ("table 2", "the blue ones", "it"); resolution (synonyms, ordinals, one-letter slips, coordination, focus) with the tier it came from is still host code. Asked: a `std.fill`-style `resolve(phrase) -> ids + tier`.
3. **Domain effects.** Worlds whose state is not wires (the drawing board's objects, the diagram engine's shapes, the avatar's face) need `std.acts.effect(kind, act, fn)` returning its diff, so that `act()` can drive them.
4. **Reserved names.** `kind`, `world`, `id` are reserved slots and the executor's bookkeeping lives in the world state (`items`, `history`, `future`, `log`, `focus` ...); asked: all bookkeeping under one key.
5. **Group rollback with host state.** The library rolls back a failed group; the bridge cannot (earlier acts of the group stay one undo step). With effects (3) the library could do it.
Also for the knowledge repository: `handover/k.actions-missing.md` (verbs and one act, `redo`, that the readers still take from small tables).
## Q (worker, 2026-11-14): KNOWLEDGE-OUT step 4 rest: what the catalog lacks, and why the kids kb files are not deleted yet
List for the knowledge repository: `handover/knowledge-out/catalog-lacks.md` (137 city names and 16 country names of the map kb, `around` joins, region boxes, face-part flag, kids facts as a child book states them).
Why kids.animals / kids.shapes / kids.time / geo.map keep their kb: (1) games.guess and games.hangman read kids.animals wires through `reads=world.kids.animals`; (2) both reasoners load kb.sop synchronously at engine build while the catalog arrives later and asynchronously; (3) the 500 + 480 + 220 expected texts of their tests are the fixture wording. Decision wanted: do the games read animals by lookup too (then kids.animals can lose its kb and its question patterns, and ask goes to Talk), and may their tests become "same facts, any wording"? Talk already answers 74-83% of their test inputs from the catalog (see worker-log).

## Q11 status (worker, 2026-11-14): sopworld 0.29.0 vendored; effects, group rollback and reserved names taken; what is still bridge
Vendored 0.29.0 (library commit d1f8121, build 1f23ee172960). The bridge uses `std.schema.effect` (worlds/acts/effects.mjs). Of the five items of Q11: (3) domain effects: done for the drawing board, the diagram engine, the face and the chart (every mutating domain act is a library effect with its `diff.effects`); (5) group rollback with host state: done (`act([...])`, a snapshot of the session state as the undo of the sentence; `executor.group` and the parts of one act are all or nothing); (4) reserved names: nothing to move (the executor's bookkeeping is keys of the session state, never wires, so there is no clash; this holds only while the state stays off the wires). (1) replies from the diff: the library side exists (`actReply` templates), the host side does not use it: the replies of the four domain worlds are written by their engines, not made from a diff, and the generic executor's replies read host items. (2) referents by words: still host code. Asked of sopworld, in its format: (a) an effect that can say it is called inside a sentence (`ctx.inSentence`), so a host takes its snapshot only then (now: the host knows the sentence length itself, which is enough but duplicated); (b) an undo the library takes for the host: `effect` with `state=<key>` so the library snapshots and restores a host object (now `structuredClone` of the session state in `effects.mjs`, about 40 lines); (c) the library's required-arguments check runs before an effect, so a host whose request is a sentence passes placeholders (`thing`, `attr`, `value`, `x`, `rel`, `ref`, `a`, `b`, `things`, `to`): an effect should be able to declare `args=none`; (d) a throw in an effect comes back as an `error` refusal, which hides host bugs and budget stops: the host rethrows them (a library option `rethrow=true` would remove that code).
