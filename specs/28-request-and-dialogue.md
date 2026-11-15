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
