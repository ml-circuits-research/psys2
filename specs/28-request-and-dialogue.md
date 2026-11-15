# 28. What was asked is a world: `w.request`, `w.dialogue`, honour declarations

Status: being built (owner GO 2026-11-15 14:00, reviewer blocks 13:55 and 14:00 of `worker-tasks.md`). Code: `src/dialog/request.mjs` (the host side),
the request step in `src/dialog/index.mjs` (`_send`), `worlds/<tab world>/request.sop` (honour declarations), the planners in the tab worlds' hooks
(`hooks.request`). Tests: `tests/request-properties.test.mjs` (P1–P8). Knowledge: `w.request`, `w.dialogue` (schemas) and `k.expect` (defaults and scales)
in the knowledge repository; the mechanisms `readRequest`, `reviseRequest`, `planRequest`, `sayRequest` in the library (soplang-words-lib).

## 1. Why
Before this spec the main path matched surface patterns and patched after failure: nothing represented what was asked, so negation ("not a circle"),
a count or a range ("5-10 nodes"), size ("a small pond"), manner ("better layout") and a reaction to the last result ("not all circles") were invisible.
The owner's English session of 2026-11-15 (about 3 of 10 right) is the evidence. This spec replaces per-sentence fixes with one representation.

## 2. `w.request`: the meaning of one request (one live instance per turn)
A request is a set of facts about one act:

| key | value | example |
| --- | --- | --- |
| `act` | a k.actions act: make, arrange, change, remove, show, write, play | "draw", "add", "create" = make; "break in layers" = arrange |
| `target` | the kind of the whole thing (`diagram`, `pond`, `story`, `map`), `new`, `present`, or `last` (the last result) | "a diagram", "it" |
| `kind` | a kind wanted; `neg=yes` not wanted; `all=yes neg=yes` not all of one kind | "squares", "not a circle", "not all circles" |
| `count` | `n`, or `min` / `max` (a range; "a few" = 3–4, "many" = 8–12 from k.expect) | "5 nodes", "5-10 nodes" |
| `size` / `extent` | a step of the scale (tiny, small, default, big, huge) with its factor from k.expect | "a small pond", "in a corner" |
| `attr` | `name=value` | "red", "dashed" |
| `place` | a place by name (map) or a region of the canvas | "Tenerife", "in a corner" |
| `manner` | nice, better, tidy, random, logical (a manner is a soft constraint: a layout, varied kinds) | "nice layout" |
| `layout` | a named arrangement (k.layouts) or `layers` with the regions | "in 3 layers: water, land and sky" |
| `with` | parts that must be in the result | "with arrows", "with water plants and a duck" |
| `about` | a topic | "about ancient hobbits" |
| `length` | `n` with `unit` (words, chapters, paragraphs) or a scale step | "5 chapters", "a short story" |
| `unread` | a content word of the message no fact explains | "stupid" |

Rule: every content word of the message ends in a fact or in `unread` (nothing is silently dropped). A reading whose arguments are leftover text is
never complete and is never executed (a catch-all).
The readers that fill the request are, in order: the library's `readRequest(world, text, { schema, dialogue })` when the vendored library has it; the
existing patterns of the worlds (the first reading of the turn: its act, its kind and its count become facts); the bridge reader of `src/dialog/request.mjs`
(cue words from the `lang.request.*` phrase groups of `worlds/lang.common`, kind words from the open world's schema and honour declarations). The bridge
reader is host code only until the library release; it reads, it never decides.

## 3. `w.dialogue`: the conversation as state (one live instance per session)
Per tab world: the last request, the result it produced (a summary of the state after: counts by kind, extent, words), the state of that world before the
result (so it can be replaced), the assumptions said and what was not honoured. It is part of the session snapshot (undo and the intent step's copy).
A turn is either a **new request** or a **reaction** to the last result: reject ("no", "wrong", "not this"), reduce ("too much", "you overdid it", "smaller"),
enlarge ("more", "bigger"), refine (a request with only constraints and no new thing: "not all circles, better layout"), redo ("again", "another one"),
thanks, frustration ("this is stupid"). "My expectation was … not a circle" is a refine carrying a whole constraint set.
A reaction **revises the last request** (library `reviseRequest`): constraints are added, a negated kind flips a wanted kind, reduce and enlarge move the
size step and the count, reject marks the last kind as not wanted. The tab world then redoes the revised request on the state before the last result: the
last result is **replaced, never piled on**. Thanks and frustration change nothing; frustration with constraints is a refine.

## 4. The per-turn flow
1. The first reading runs as before (the existing readers; the turn may already change the open world).
2. The request is built from the English of the turn and the first reading (section 2).
3. `w.dialogue` decides: a reaction to the last result of the open tab, or a new request.
4. The result of the first reading is **checked against the request** with the open world's `check` (the constraints it declares it honours). A new
   request whose result satisfies every honoured constraint is kept as it is (the existing readers did the work).
5. Otherwise (a constraint violated, a reaction, a catch-all reading, a make of the world's whole thing with constraints) the session goes back to before
   the turn (for a reaction: to before the last result) and the open tab's world receives the request as a goal: its planner (`hooks.request`, which
   uses std.plan / k.procedures where they exist and the library's `planRequest` when it lands) satisfies the constraints; what was not said comes from
   the defaults of `k.expect` (typical counts and kinds, scale factors). "Random" samples inside the typical range with the session's generator.
6. The result is recorded in `w.dialogue`.
7. The reply is composed from the request and the result (library `sayRequest` when it lands): what was made, what was assumed (a default used),
   and each constraint that could not be honoured, by its words.

## 5. Honour declarations (`worlds/<world>/request.sop`)
Each tab world declares, per act, the request keys it honours:

    @diagram.sketch.honour.make w.honour act=make keys=kind,count,size,layout,with,manner target=diagram

and its defaults where `k.expect` has none yet (`w.expect` facts: `of=diagram count=5..9 kinds=circle,square,diamond with=arrow layout=tree`). A key the world
does not honour, when a request carries it, is named in the reply ("I cannot do 'in red' on the map yet"), never ignored. Declared today:
- Diagram (`diagram.sketch`): make — kind, count, size, layout, with (arrows), manner, about; arrange — layout, manner.
- Drawing (`art.draw`): make — scene parts (kind, with), count, size / extent, place; arrange — layers by scene regions (water, land, sky).
- Documents (`docs.editor`): write — about, kind (story, poem, report), length (chapters, words, short / long).
- Map (`geo.map`): show — place by name (countries, cities, islands and regions of k.geo).
- Charts (`data.charts`): make — kind (bar, line, pie), count (items).
- Music (`media.music`): play — manner (happy, sad), kind (song, scale).

## 6. Properties (acceptance; `tests/request-properties.test.mjs`)
Over sentences generated from the honour declarations of every tab world, for make / arrange / change, in English and in Romanian (through the rules
translator):
- **P1** "not X" never yields X; "not all X" yields more than one kind.
- **P2** a count or a range is respected.
- **P3** small < default < big, in parts and in extent.
- **P4** a reaction after a result changes that result in the stated direction and does not add a second result.
- **P5** every content word is in the request or named as unread in the reply.
- **P6** no catch-all reading executes.
- **P7** "random" twice gives two different results, both inside the typical range.
- **P8** a constraint the world cannot honour is named in the reply.
The test prints the pass count per property; the baseline before any change is recorded in `worker-log.md`.

## 7. Library interface the host is written against
`readRequest(world, text, { schema, dialogue }) -> { act, target, facts: [{ key, value, neg?, min?, max?, unit? }], unread: [] }`;
`reviseRequest(dialogue, turn) -> { request, replace: true }`; `planRequest(world, request, { expect }) -> { steps, assumed, cannot }`;
`sayRequest(request, result) -> text`. Until the release, the host's bridge (`src/dialog/request.mjs`) fills the same shapes; it is replaced, not extended,
when the library lands.

## 8. Keys of the knowledge worlds (catalog 0966924e)
The host shapes map one to one onto `w.request` / `w.dialogue` / `k.expect` of the catalog: a host fact `{ key, value, neg, all, n, min, max, unit, step }` is a `w.request.constraint` with `on=key`, `want=yes|no|not_all` (neg / all), `value`, `number` / `min` / `max`, `unit`, `amount`=step; `unread` is `w.request.unread`; the host reactions are the `w.dialogue.turn reaction` values (reject, reduce, enlarge, refine, redo, thanks, frustration; put_back is still the intent step's); the record of `RequestDialogue` is `w.dialogue.tab last_request / last_result` with `result status current|replaced`. `w.expect` of request.sop is the stand-in for `k.expect make` facts (min/max/typical, kinds_min/max, layout, parts with min/max/needed): next step, the planner reads `k.expect` from the pin first and request.sop only for what it lacks; the cue facts `w.lang.en.cue` replace the `lang.request.*` phrase groups when the library reader lands.

## 9. On sopworld 0.150 (the switch)
The bridge reader, the host revision and the host reply are gone. Per turn: the host corrects slips of the request vocabulary (data: the live world's kinds, k.actions verbs, cue words); the library reads (`readRequest` over the live world and the language World), revises (`reviseRequest` with w.dialogue.revision), plans (`planRequest`, sources said > dialogue > induced > world > expect > sampled, with its reasoning cycle) and says (`sayRequest`). The language World is `src/knowledge/bundled-request.mjs` (scripts/build-bundled-request.mjs, part of build-lang-en) plus the local cue rows of `src/lang/en.request.local.mjs` (Q39). Each tab world's `request.sop` is its live request World in the library's vocabulary (std.schema kinds and slots, std.schema.honours, k.expect.make / part, core.word, and declarations its executor reads: std.schema.fill, std.schema.drawn, std.schema.region). A world carries out a plan with its operation `planRequest(ctx, goal)` (goal = the plan's roles and steps, `src/dialog/request.mjs goalOf`, and the declarations); the diagram fills its parts from k.diagrams (declared `std.schema.fill`), the board draws the items of the steps (drawn as its own kinds), the documents compose. A plan the reasoning rejects is not carried out: the reader's result is taken back and the reasons are said. The host still checks what a reader already did against the request (violations) before it plans.

## 10. The door (reviewer 2026-11-15 16:40; owner 17:40, 17:55) — supersedes the flow of section 4
- A **declared tab** is a tab world with `request.sop` and an operation `planRequest` (Diagram, Drawing, Documents). On it every message is read first by the library's `readRequest` (sopworld 0.151, `spell` on: repairWords is one candidate source) over the tab's live World, with the English of the turn (another language: the candidates of every translator, chosen by the request reading — the fewest unread words). Old surface patterns are not a source.
- `reviseRequest` against the open tab's last **planned** result says new request or revision (a thing named with "the" that the open world holds is not a new request). `planRequest` plans; a plan that drops a thing or a key said in the turn, or breaks a said count of a kind, is not carried out (P9). The world's executor carries the plan out; `sayRequest` says the revision, what the world did, what was assumed (not what the world's reply already says) and what was not honoured.
- **No fallback:** what the door cannot take is said honestly (unread words, an act or a thing the world does not declare, a question, a plan it cannot keep). The old readers of a declared world never run. Worlds without declarations (the shell, help, the conversation, Charts, Map, Music) still answer through `_sendRead`, marked `trace.legacy = true` with the reason in `trace.door`; the share of legacy turns is reported with every landing.
- `psys2.door world=<name> whole=<kind>` (request.sop) names the wholes a world plans; the catalog's wholes made in the world (k.expect.make made_in = its std.schema.world name) are added as its kinds (host stand-in until capabilitiesOf reads them, questions.md Q40).
- Tests that pin a reader, a wording or a route the door replaced are on the legacy list (`tests/legacy-list.json`, or `legacyOnly` in the file): run and reported apart by `scripts/run-tests.mjs`, never counted. Properties P1–P11 run through `Session.send`.

## 11. The timeline of the door (reviewer 2026-11-15 19:05, 19:40)
- **One plan = one undo step.** The door takes the state of every world and the library's mark of the turn *before* it carries a plan out (`_doorBegin`), and the turn records a
  frame of the request (`Discourse.recordDoorFrame`, the same frame a reader's request leaves), so "undo", "undo the whole message", "undo the house" and "what did you do?" see
  it. A **revision replaces** the step of the result it revises (its state before is that step's). A **question** is no step; an undo or a redo is no step.
- **Undo / redo are acts of the session timeline** (k.actions undo / redo, read by readRequest): the timeline answers first (redo, the whole message, a named step and its
  yes / no question), else the world's own undo / redo declared in request.sop (`psys2.op world= act=undo op=<operation>`). An undo that names something no step did takes
  nothing back; an undo with unread words takes nothing back.
- **Tool binding** (request.sop): `psys2.op world= act= [of=<kind>] op=<operation>` binds an act (and the whole it makes) to one operation of the world: a new page is the board's
  fresh sheet (`act=make of=page op=newDrawing`), carried out inside the turn as one step. Host until the library publishes the binding (questions.md Q42 [LIB]).
- **Things said together** ("a sky and a sun") are planned kind by kind and carried out as one request each (each its own step in the world's history), stand-in `coordinated`.
- **A partly read turn never acts**: the reply names the clauses understood and those not understood ("I understood "clear everything", but not "zork the plimp", so I did
  nothing"), cut at the joiners of the language world.

## 12. The open state as facts; acts on things (owner 2026-11-15 19:10; coordinator 19:30)
- **The open state is facts of the live request World**: the things the open world shows (its `referents` operation: id, kind, name, attributes) are told into a fork of its
  request World as instances of its declared kinds (`stateWorld`). The fork is a candidate source of the spell repair (the names of things) and the world a new request is planned
  over (its things are places and referents). Host stand-in until readRequest marks `refers=present` with thing ids (questions.md Q42 [LIB]).
- **References** (`referTo`): a thing's name in the unread words; a kind said (plural: all of them; one there: it; several: the salient, else the world asks which); the world's own
  whole (the kind its `std.schema.world` name means: "the drawing", "the diagram"); a pronoun of the language world with `refers=all` ("everything"); "it" / "them" (the last act's
  things, else what the last result made, else the salient things). Definiteness is the language world's (`w.lang.en.det definite=yes`).
- **Acts on things** (place, change, remove; k.actions): declared per act and kind in request.sop (`std.schema.honours act=place|change|remove on= of=`), carried out by the one
  operation the world binds to the act (`psys2.op act= op=`) with one argument shape `{ act, ids, place: { value, relation, ids }, attribute, value, size: { value, step } }`.
  "make X red" is the change sense of the verb when X is there and named definitely or by "it"; a turn of only roles after an act on things continues it ("higher"); an act with no
  object takes the last act's things. A key the act does not honour is named; a thing that is not there is said; nothing is guessed.
- **Make**: an indefinite pronoun with `refers=any` ("something", "whatever you want") names the world's own whole; a general whole is sampled among the wholes the world plans (its own
  `psys2.door` wholes before the catalog's); a place said by a kind the world makes that is not there is made by the world; a place that names the world itself is the world.
- **Tools and their binding (coordinator 20:xx; reviewer general-mechanisms item 3)**: a world's tools are small operations on its state with **no words** (arguments: ids of its
  things, a direction, a region id, ids of a thing to go next to, an attribute and a value or a step; result `{ status, changed, added }` or `{ status: 'missing', code }`):
  Drawing `removeThings`, `moveThings`, `setThings`; Diagram `removeShapes`, `moveShapes`, `setShapes` (the engine's own commands). The **binding** is SOP in request.sop:
  `psys2.tool world= act= op= when="<role path>[=<value>]" arg="<argument>:<role path>" effect= reply=` — the first row whose preconditions hold runs; the arguments come
  from the roles of the request (`things`, `place.value`, `place.relation`, `place.ids`, `attribute`, `value`, `size.value`, `size.step`). **Replies** are the language
  world's reply facts (`w.lang.en.reply name=done.place.up|done.place.next|done.place.region|done.place.into|done.change|done.change.size.up|done.remove|done.none|
  done.added.band|cannot.*|ask.which`, said by the library's `replyFrom`; local rows in src/lang/en.request.local.mjs until the catalog has them); names of things stay
  names in every language. One host path (`bindingFor`, `_doorTool`) until the library's runPlan carries bindings out (questions.md Q42 (3), (14)).

## 13. Reactions before acts; the source repair (reviewer 2026-11-15 21:10; Q39 S3)
- **A reaction with no change request never runs a plan.** On every declared tab, a turn whose reading is a reaction cue of the dialogue world (w.dialogue.revision `does=none`: thanks, praise) with no act, no thing, no unread word and no constraint but the praise word itself (a manner cue made of the cue's own words, "nice") is answered with the dialogue's reply (`welcome`), with or without a result, and is no undo step (property P12: the view is unchanged and "undo" after it takes back the work before it). Cue words are data (`w.lang.en.cue reaction.thanks`, local rows in `src/lang/en.request.local.mjs`, [KNOW]).
- **Romanian words are repaired against the live worlds before translation** as one candidate source of the door's reading: spec 05 "Contextual repair of the source".
