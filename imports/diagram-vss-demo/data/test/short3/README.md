# short3: short commands as real users type them (2026-11-02)

530 messages (s3-0001 .. s3-0530), 666 gold requests (wires): 510 in SOP Lang, 156 pending (op families whose SOP Lang form is not
defined yet). Written by one Opus agent, blind to the Rules reader's cues and to every training set (exposure log below).

Files
- `texts/texts_01.jsonl`: id and text only, saved before any annotation was written.
- `batch_01.jsonl`: id, domain, names, text, wires; same format as `../fresh2/*/batch_01.jsonl`. The texts are identical to
  `texts/texts_01.jsonl` (checked by script after the label check).

## What the messages are

- Short and clipped, like real use: 408 messages with 1 request (77%), 108 with 2, 14 with 3. Typos ("delte start", "conect procss
  w/ done", "triangel", "renmae"), lowercase, no punctuation, fragments ("Done red", "bigger", "line them up", "row: process, check,
  done"), arrows as shorthand ("start → orange", "start -> check"), polite ("Could you add a teal diamond between Process and
  Check?"), non-native ("a orange square please named Box2 left of Start"), dictation-like run-ons ("check up 40px pls and process
  down 40px").
- Drawing: the opening drawing Start, Process, Check, Done linked Start→Process→Check→Done. Other names exist only when the message
  creates them, or when `names` lists them (the groups Intake and Core, for 9 messages that presuppose a group). `names` = the shapes
  and groups that exist before the message, as in fresh2.
- Variety checks (script, before annotation): no two messages within a small edit distance (Levenshtein ≤ 3 or < 25% of the length,
  after lowercasing and removing punctuation), except the bare words "undo", "redo", "help", which cannot differ. Every message was
  also compared with the 94 example sentences of the user help (`docs/js/help.js`): about 70 first drafts were near copies of help
  examples (written right after reading the help) and were rewritten before annotation; "undo", "redo" and "Done red" (a ≤ 3-character
  distance from "Done is red") were kept on purpose.

## Gold

Wires as in fresh2: `{"span", "trigger", "type", "args"}`, args with the legend keys only (names as comma lists, descriptions as
`mention(...)`, `$new` for the shapes made or copied by an earlier wire of the same message). Where the SOP Lang form does not exist
yet the wire is `{"span", "pending": "<op family>", "intent": "<plain description>"}`: no type, trigger or args were invented for it.

Conventions I had to choose (not seen in the 5 fresh2 items I looked at; the coordinator may normalise them):
1. Only what the message says. No default values (no `axis=horizontal` for a plain "align"). A target outside the message ("bigger",
   "line them up", "space them evenly", "make it black instead") is left out, for the reasoning layer; a referent inside the message
   is resolved ("rename Done to End and make it a star" → target End; "copy check and put the copy below done" → `$new`).
2. Sizes from the help's numbers: bigger / larger / increase = scale 1.5, smaller / shrink = 0.67, twice / double = 2, triple = 3,
   half = 0.5; "big" = `size=large` (a set, not a resize).
3. "line" (without "arrow") = `arrow=none`; "two way" / "both directions" = `arrow=both`; "box" = rectangle; "dot", "round" = circle;
   "node" = no shape.
4. `at` written as "x,y".
5. Label of an existing arrow: `action=label` with `from`/`to`; removing it `label=""`. Its question: `ask=property property=label
   from/to`.
6. All arrows of one shape: `action=disconnect target=<shape>`; every arrow: `quantifier=all`.
7. Questions: `connected` target+anchor and `check ... comparison` target+anchor as in fresh2; `path` from/to; `reachable` from;
   `nearest` anchor; `count` of shapes / arrows / groups with `kind=shape|edge|group`; "how many connections does X have" = `degree`.
8. Facts: type `fact` with target and the stated values ("Done and Start are connected" → `linked=Start`). Rules: type `rule` with the
   shape filter and values; "forget the rules" = `action=forget`.
9. Several new shapes with their own names ("create Api and Db squares") = one create wire per shape.
10. Plural descriptions get `quantifier=all` ("remove all the stars", "the small squares"); "the circle I just made", "the last one I
    added" get `recency=newest`.
11. Trigger of a message without a verb = the value word ("Done red" → red, "check large" → large).
12. Arranging the whole drawing as a row, column, grid or circle ("grid everything", "everything in a ring") is the defined `arrange`
    action with `target=mention(quantifier=all)`. The pending `relayout` family covers what arrange cannot do: tree, layered /
    flowchart (with a direction), radial around a shape, tidy / clean up / improve / auto layout, more or less space, compact, center,
    fit to screen, straighten, untangle.

## Counts

By wire family (666 wires):

| Family | Wires | | Family | Wires |
|---|---|---|---|---|
| connect (style, heads, colour, label, chain, one-to-many) | 54 | | label a shape | 20 |
| question (17 kinds of ask) | 52 | | delete | 19 |
| recolor | 46 | | undo / redo | 18 |
| create one shape | 45 | | change kind | 17 |
| move | 41 | | create several in a layout | 17 |
| resize (scale or size) | 32 | | groups (group 11, ungroup 5) | 16 |
| align / arrange / distribute | 28 | | label an existing arrow | 15 |
| rename | 15 | | z-order | 14 |
| outline | 13 | | disconnect | 13 |
| rule (incl. forget) | 10 | | duplicate | 9 |
| fact | 8 | | swap | 5 |
| set with several values | 3 | | | |
| **pending: relayout** | 44 | | **pending: help** | 28 |
| **pending: template** (cycle, pyramid, funnel, timeline, hub and spoke, Venn, matrix, process steps, hierarchy, staircase, radial list) | 40 | | **pending: free text** (titles, headings, notes, captions) | 21 |
| **pending: edge restyle** (style, colour, heads, direction, width of an existing arrow) | 11 | | **pending: background** / **layers** | 8 / 4 |

"all / everything" appears in 52 wires. Messages: 130 are pending only, 11 mix pending and defined wires, 389 have no pending wire.
Messages by the topic they were written for: create 22, create several 14, delete 12, duplicate 6, move 18, swap 4, recolor 18,
kind 8, size 16, outline 8, rename 8, label 10, connect 22, disconnect 8, arrow label 10, arrow restyle 8, groups 10, z-order 7,
align/arrange 18, undo/redo 10, questions 38, facts 8, rules 8, re-layouts 30, free text 14, templates 26, background/layers 10,
help questions 24, 2–3 requests 135.

Split (fresh2 rule, `int(sha256(id), 16) % 3 == 0` → calibration): calibration 178 messages, 219 wires (59 pending); test 352 messages,
447 wires.

## Label check (second pass, by the writer)

Every message with a defined wire (400 messages) was re-read with its gold. Changes made: 4 triggers, no values. s3-0079 "hexagon for
start" for → hexagon; s3-0057 "red for check" red for → red; s3-0299 "done in gold" in gold → gold; s3-0041 "i want Start to be
brown" to be → want (trigger convention 11). Left as written and flagged:
- s3-0315 "Done on top" (toFront) and s3-0516 "start should be on top" (move, `position=top`): both readings are possible for both.
- s3-0476 "put "no" on the line from Check to Process" and s3-0348 "check -> process should be labeled no": the opening drawing has Process→Check,
  not Check→Process; the gold is what was asked.
- s3-0002 "put a pale blue rectangle behind everything as a background panel": pending background; it could also be read as create + toBack
  ("pale blue" is not a legend colour).

## Exposure log (what the writer read and did not read)

Read:
- `AGENTS.md`; `../fresh2/README.md`; `docs/js/help.js` in full (its prose and its 94 example sentences).
- The JSON structure of 5 fresh2 items in `../fresh2/opus_a/batch_01.jsonl`, printed with `text` and `span` masked: fo-0001..0004
  (their 12 trigger words were printed too) and fo-0083 (trigger masked as well). fo-0083 was picked by a script that scanned the args
  of all opus_a wires for the item covering the most wire kinds; only that one item was printed.
- The legend as the help's SOP Lang page lists it: `docs/js/logic.js` was loaded with node (not opened) to print the keys, their kinds
  and value names, the wire types and the plugin names. Cue words were not printed.
- The Rules reader run on the help's own example sentences (what the help's SOP Lang page does for its worked examples), to see the
  wire shape. Those outputs drop names and read several questions differently from the help, so they were not used as gold.
- Directory listings of `training/sketch/llm_bench/` and `docs/js/`.

Not opened: the source of `docs/js/logic.js`; `training/sketch/llm_train/**`; `training/sketch/synth/**`;
`training/sketch/ops/formulations.jsonl`; any `test_*.mjs`; the texts of fresh1 / fresh2 or any other test set; `SPEC.md`,
`TRAIN_MSG_SPEC.md`, `LABEL_CONVENTIONS.md`; any reader, model or result.

## Pending filled (2026-11-03)

The counts and the "pending" statements above (510 SOP Lang wires, 156 pending, the family table, the conventions list) are from the
writing day; this section supersedes them. Texts, ids, domains, names and every untouched non-pending wire are unchanged (checked by
script against the old file and against `texts/texts_01.jsonl`).

Sources used for the forms: `legend_ext/LEGEND_EXT.md` (free text, templates, help, `width/height/fill/layer`), `ops/HIGH_LEVEL_OPS.md`
(improve, arrange layout=tree/layers/radial/organic, respace, snap, fit, flip, sort, groupBy, equalize, straighten, untangle, arrow restyle,
reverse), the last sections of `LABEL_CONVENTIONS.md` / `llm_train/TRAIN_MSG_SPEC.md`, the value names of `docs/js/templates.js` and the
topics/aspects of `docs/js/help-answers.js`; all keys and enum values of the new wires were validated against the live legend
(`legend.validate` of `docs/js/logic.js`: 650 wires, 0 problems), every trigger is a substring of its span, every span of the text.
Where two readings were possible the one the documents fix was taken, not the Rules' (see "Disagreements" below). A wire that gets its
span from the old pending wire keeps that span; its trigger follows the existing convention (the verb, else the value or template noun,
for help the question lead as written).

### Counts

667 wires now (666 + 1: s3-0377 was one pending wire holding two requests and is split, see below): **650 in SOP Lang, 17 pending**
(was 510 / 156). 139 of the 156 pending wires were filled. Messages with a pending wire left: 17 (was 141). Calibration part (fresh2
hash): 178 messages, 219 wires, 5 pending; test part: 352 messages, 448 wires, 12 pending.

| family (as written on the pending wire) | pending | filled | left | what they became |
|---|---|---|---|---|
| relayout | 44 | 44 | 0 | improve 9, arrange layers 7 / tree 5 / radial 3 / auto (no layout) 2, respace 7, fit 3, straighten 3, untangle 4, distribute 1 |
| template | 40 | 35 | 5 | create template 26, arrange template (existing shapes) 6, arrange layout=radial 1 (s3-0259), label 1 (s3-0214), move $new 1 (s3-0352) |
| help | 28 | 28 | 0 | `question ask=help` with topic / aspect / about |
| free text | 21 | 20 | 1 | create shape=text 15, delete 1, label 1, move 2, resize 1 |
| edge restyle | 11 | 11 (12 wires) | 0 | set 9, reverse 2, resize 1 |
| background | 8 | 1 | 7 | create layer=background fill=light (s3-0002) |
| layers | 4 | 0 | 4 | - |
| total | 156 | 139 (140 wires) | 17 | |

### Left pending (17) and why

No form exists for them (the wire keeps its `pending` family and `intent`, nothing was invented):
- Canvas background colour / grid / lock / layers panel: no key or action sets the canvas colour or a grid, locks, hides or lists a layer, or
  puts shapes on a "new" layer (`layer` only takes background / zone / item and only on create). s3-0010 "background black", s3-0048 "white
  background please", s3-0480 "make the background light grey", s3-0507 "remove the background color", s3-0153 "add a grid to the background",
  s3-0374 wire 2 "make the background white", s3-0487 wire 1 "dark background" (background family, 7); s3-0046 "lock the background",
  s3-0055 "show layers", s3-0413 "hide the arrows layer", s3-0417 "put the shapes on a new layer" (layers family, 4). The opening drawing
  has a Backdrop panel, but the opening drawing's `names` of this set do not include it and a description ("the background") is not a
  mention, so `set target=Backdrop color=...` would invent a name. Only the explicit panel s3-0002 ("a pale blue rectangle ... as a
  background panel") has a form.
- s3-0134 "create a matrix 3 by 3 with labels": the matrix template is exactly 2x2 (4 items, `templates.js` min = max = 4); 3 by 3 is not expressible.
- s3-0154 wire 2 "label the steps Learn, Try, Fix" (steps of the cycle just made with count=3): no form gives a list of labels to the items of a
  template made by the previous wire (`label` has one text; template items are not addressable).
- s3-0296 wire 2 "put Check in the top left cell" (cell of the matrix just made): a cell of a template has no address; `position=topLeft` would mean
  the canvas corner, which is another request.
- s3-0389 "org chart with Boss and two teams under it", s3-0483 "draw a hierarchy, CEO on top with three managers below": a named root plus N unnamed
  children; `items` would need names the text does not give and `count` is only for placeholders when there are no items.
- s3-0234 wire 3 "make it bold": no key for bold.

### Judgement calls (readings the documents leave open; the gold is one of them)

- A reference to a free text by description ("the title", "the heading") is not a mention (LEGEND_EXT section 9), so those wires have no target:
  s3-0028 `delete`, s3-0167 `label label="Signup Flow"`, s3-0328 `resize`, s3-0409 `move position=left` (reference left to the reasoning layer).
- "spread them out" with no comparative (s3-0347) is `distribute target=all`, the documented convention (HIGH_LEVEL_OPS section 7), although the
  writer's intent says "increase the spacing"; "a bit" (s3-0278 "spread things out a bit") and "more/less space" are `respace`, no `scale` (not stated).
- "tidy the arrows so they're straight" (s3-0119) is `straighten`; "organize the diagram" (s3-0097) is `arrange target=all` (the cue is the arrange family);
  "use the best one" (s3-0441) is `improve`; "the diagram looks messy can you fix it" (s3-0044) is `improve` with the diagram as target (the pronoun's referent).
- "hub and spoke with Check as the hub" (s3-0259), "Start in the middle, the rest around it" (s3-0448): a link layout word on existing shapes is a
  re-layout (`arrange layout=radial anchor=...`), not a template; "hub and spoke, Core in the middle with 6 spokes" (s3-0074), "radial list with Goal in the middle"
  (s3-0504) and "hub spoke diagram with Api in the center and Web, Mobile, Batch around it" (s3-0470) name new shapes, so they are `create template=hub title=...`.
- "make a timeline with Start Process Check Done" / "put Start Process Check Done on a timeline" (s3-0093, s3-0072): all items are existing names, so `arrange template=`.
  "show the four shapes as a timeline" (s3-0215), "turn the 4 shapes into a cycle" (s3-0369), "make the diagram a pyramid" (s3-0214): `arrange template=` with
  `target=mention(quantifier=all)`. "make the existing flow into process steps with chevrons" (s3-0140): `arrange template=process`; "with chevrons" has no key and is not written.
- Template items are written in the order of the text: s3-0165 "pyramid: Base, Middle, Top" is `items=Base,Middle,Top` although the engine puts the first item on top (the
  text names no position; the order is left to the reasoning layer). s3-0107 "cycle of 6 with labels 1 to 6" is `items=1,2,3,4,5,6` without `count` (count is only for placeholders).
  s3-0027 "5 milestones as a timeline under the flow": `count=5 position=below anchor=mention(quantifier=all)` (the flow = the drawing).
  s3-0088: the connect wire keeps the literal `Plan` (a template item is named after its text; `$new` would be all the template's shapes).
- Help topics follow the order of LEGEND_EXT section 7 (template cue, specific action, family noun, value) and the realistic set `llm_train/opus_ext_1`: "can I change an arrow's color" and
  "how do i make a dashed line" -> `connections`; "can i rename a group" -> `rename`; "how do i put text inside a shape" -> `label` (text inside a shape is a label, not free text);
  "can you draw curved arrows" -> `connections` + `about=curved`; "is it possible to export as png" -> `about="export as png"` (as written); "any templates? like smartart" -> `template`, `values`,
  `about=smartart`; "what can you do" and "what commands do you understand" -> bare `ask=help`.
- s3-0377 "make the line from start to process thicker and blue": was one pending wire; it is two requests (resize, then set colour), so it is two wires with the
  spans "make the line from start to process thicker" and "blue" (the set-wire convention of fresh2 / opus_ext_1: one request, one span). This is the only span change; it
  makes the file 667 wires.
- s3-0214 wire 2 "label the levels" is `label` with no target and no text (the text is not given; the engine asks).

### Conventions normalised (the confidence study's list; every change, ids in brackets)

1. `$new` vs the new shape's name (14 messages, 19 values): fresh2 has 142 `$new` and 0 literal names for a shape created earlier in the same message (`bench-canon.js` also writes
   every reference to an earlier wire as `$new`; TRAIN_MSG_SPEC says the same "also when a later sentence refers to it by its name"). So a name that the same message created in an
   earlier wire is now `$new`: s3-0025 (from), s3-0031 (target), s3-0037 (from), s3-0059 (to, target), s3-0109 (from, to), s3-0146 (from, to), s3-0199 (to, from), s3-0212 (to),
   s3-0252 (to `$new,$new`), s3-0261 (to), s3-0288 (to), s3-0381 (from, to), s3-0399 (target), s3-0430 (to). Two shapes made by two wires are written `$new` + `$new` (as fo-0154).
2. `scale` (the scorer now skips it on both sides, so this changes no score): LABEL_CONVENTIONS says "make X bigger / smaller, enlarge, shrink -> resize, target only", and a key is
   written only when the text states it. Dropped where the text says only bigger / smaller / larger / shrink / increase / a little smaller (16 wires: s3-0082, 0131, 0144, 0193, 0201, 0257, 0281, 0297,
   0347, 0364, 0366, 0373, 0432, 0457, 0520, 0524). Kept, as a digit string, where the text states a factor (5 wires): s3-0081 "by 1.5" -> "1.5", s3-0198 "triple" -> "3", s3-0217 "half" -> "0.5",
   s3-0365 "double" -> "2", s3-0393 "twice" -> "2". (The new wires follow the same rule: no `scale` on respace for "a bit".)
3. `kind=shape` (s3-0183 "how many shapes are there"): removed; in fresh2 and all training data `count` of shapes has no `kind` (`kind` is only edge or group).
4. `undo count`: kept. LABEL_CONVENTIONS fixes it ("undo twice" -> `count=2`, the Rules' reading): s3-0062 (2), s3-0188 (2), s3-0411 "go back three steps" (3); only the type changed (digit string, below).
   Repeated words stay separate wires (s3-0026 "undo. undo. redo", s3-0137 "undo undo"); the readers' misses on `count` are reader errors, not gold.
5. Numbers as digit strings (TRAIN_MSG_SPEC "Numbers as digits"; fresh2 and the training data write strings): 24 `count`, 7 `distance` ints in 29 messages are now strings (31 values; the scorer
   lower-cases `String(v)`, so no score changes).

### Rules agreement (messages the Rules read exactly as the gold; 530 messages, calibration 178 / test 352 by the fresh2 hash split)

Two runs of the same HEAD `logic.js` (91244f7); the pending wires never agree, so "before" is mostly the 389 messages without one.
- A. `python3 training/sketch/synth/check_file.py ... --mode report` (as asked): whole **198 -> 245** (37.4% -> 46.2%); calibration 64 -> 81; test 134 -> 164.
  This run is lower than it should be: `pin_logic.py` copies HEAD's `logic.js` to `synth/.logic_<sha>.js`, and `logic.js` loads `templates.js`, `help-answers.js`, `auto-layout.js` by
  relative `require` (`optRequire`); from `synth/` they are not found, so this run has no templates, no help and no layout operations. (Not changed here; the fix is to copy the three modules next to the pinned file or to resolve them from the repository.)
- B. `node training/sketch/synth/check_rules.mjs` on the same file with `docs/js/logic.js` (identical bytes to HEAD, modules found, as the demo): whole **194 -> 258** (36.6% -> 48.7%);
  calibration 63 -> 88 (49.4%); test 131 -> 170 (48.3%). Of the 258, 61 are fully filled messages and 197 messages that never had a pending wire (194 before, +3 from the `$new` change:
  s3-0031, s3-0212, s3-0430).

### Disagreements on filled wires (B run)

63 messages whose pending wires were all filled are not read exactly. Each was re-read against its text and the documents; none of the gold was changed towards the Rules. By the Rules' first difference:
- nothing read, 14: s3-0044, 0063, 0107, 0165, 0271, 0311, 0316, 0356, 0421, 0441, 0442, 0466, 0470, 0509 (templates, a free text with "text ... above Start", "can shapes have outlines", "explain layouts and use the best one": no cue).
- fewer wires than requests, 9 (one request lost or two merged): s3-0045, 0088, 0093, 0259, 0264, 0352, 0377, 0390, 0463; more wires, 1: s3-0151 (one request read twice).
- another action, non-help, 15: free text or label read as label / set / list (s3-0028, 0167, 0387), a template read as move / set / layers / list / check (s3-0072, 0074, 0214, 0215, 0240, 0369, 0378), a re-layout read as a move
  (s3-0336, 0448, 0502), "radial list with Goal" read as a radial arrange (s3-0504); s3-0294 differs only on its non-pending wire ("make one from start to done" read as create).
- another action, help, 6: help questions read as list / describe / exists (s3-0158, 0184, 0216, 0236, 0335, 0521).
- same action, other keys, 18: missing `fill` / `layer` / `shape=text` / `label` / `template` / `items` / `about=curved` / `topic=shape` (s3-0002, 0018, 0020, 0027, 0060, 0069, 0111, 0323, 0447, 0482, 0492), a wrong item (s3-0019 `items=going up`),
  the pronoun of s3-0042 not resolved, s3-0263 `count` instead of the named circles, s3-0140 read as layers.
In every one of these the Rules are wrong or incomplete by the text. Where the Rules differ only by a reading the documents decide, the gold follows the documents: s3-0138 `about` as written ("export as png", the Rules drop "as"); s3-0409 `position=left`
(as the writer's own "to the left" wires s3-0452, s3-0494; the Rules write `direction=left`); s3-0495 `label` (text inside a shape), not `text`; s3-0504 `create template=hub` (Goal is a new name; the Rules lose it).
