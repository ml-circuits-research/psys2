# synth_rules: synthetic short commands covering everything the Rules reader detects

**Synthetic, template-generated data** (AGENTS.md, owner 2026-11-02 22:04: the training data must cover everything the Rules reader can
detect). Not realistic LLM-written text: keep it in its own folders and name it in every result that trains on it.

| folder | messages | requests | what |
|---|---|---|---|
| `llm_train/synth_rules/` (msg_01..08) | 7822 | 10755 | the legend of LABEL_CONVENTIONS.md: 5475 one-request, 1761 two-request, 586 three-request one-liners (median 7 words) |
| `llm_train/synth_rules_ops/` (msg_01..02) | 1340 | 1409 | what the Rules detect beyond that legend: groups (field `groups`), double positions (position2/anchor2/region), outline, x/y coordinates (`at`), "X is connected to Y" / created "connected to" / count of shapes connected (`linked`), "remove all connections" (disconnect quantifier=all), arrow labels (label with from/to, label="" removes), shape label removal (label=""), create count + layout. Train these only where the converters read the keys (VSS: DIAGRAM_OPS=1 for groups and double positions; outline, at, linked, layout and label with from/to are not read by llm_to_world.py today) |

## Current version (re-run 2026-11-03, replaces the counts below where they differ)

`LOGIC_REV=worktree python3 training/sketch/synth/gen_rules_cover.py --n 9200 --n_ops 1500 --n_ext 3500` (seed 0), gold checked against the
**working-tree logic.js** (sha256 27a2145c4956ef03: the Rules fixes for the rejects below + the ops patch of `docs/js/ops-integration.md`).
Kept: synth_rules 8404 messages (11707 requests), synth_rules_ops 1374 (1470), synth_rules_ext 2783 (3664 requests; new folder, its README).
Candidates 22200, rejected 553 (2.5%; before: 1100 of 12700, 8.7%), removed as test-set overlap 477 exact + 9 token set, duplicates 1391.
Changes of the generator: "tidy (up)" -> `improve` (ops patch); shape=text left out of the core shapes (it has its own builders, ext);
new ops builders (re-layouts, arrow restyle) in synth_rules_ops; ext builders (free text, templates, help) in synth_rules_ext.

Rejects by class now (R classes fixed in the Rules: the "all" object 247 -> 0, several to one 104 -> 0, wire/attach/tie chains 54 -> 0,
verb ellipsis 45 -> 0 in this class, several objects in one create 38 -> 1, no axis word 26 -> 0, one-letter names 25 -> 4, point/part
21 -> 0, written 19 -> 0, list of three names 18 -> 0, put the label on a description 16 -> 0, is there a connection between 16 -> 0,
label it 14 -> 0, the edge of the canvas 9 -> 0, typos 129 -> 115):

| rejects | class |
|---|---|
| 115 | R a typo the Rules' spelling step does not fix (a new name, a tie between two cue words, a word mid-sentence) |
| 77 | C connect A and B: gold from=A,B; Rules from=A to=B (the Rules' reading is kept, coordinator) |
| 39 | C undo twice / 3 times: gold no count; Rules count=2 / 3 (the Rules' reading is kept) |
| 33 | R a rule with 'from now on' at the end is not read |
| 30 | R 'what is the shape of X': read as list |
| 29 | R 'draw a two-way arrow ...': read as create |
| 28 | R 'show me the connections': neighbors without a target |
| 27 | R rename followed by more words |
| 26 | R a clause merged into or split from its neighbour (incl. a template clause that swallows the next request) |
| 25 | G/R other |
| 21 | R 'is B downstream of A': from/to in text order |
| 19 | R a verbless placement with by / around / close to / left side of |
| 15 | R notColor of a described set in list/count dropped |
| 15 | R 'set the outline/border of X to C' read as a colour |
| 14 | C a shape filter on extreme |
| 25 | R smaller classes (groupOf 9, undo words 7, both ways 5, question form 5, can A reach B 4, one-letter 4, spaced dash 3, ...) |

## How it was made

`python3 training/sketch/synth/gen_rules_cover.py --n 9200 --n_ops 1500` (seed 0; about 2 minutes). Gold checked against **logic.js as committed at
ca2850a** (unchanged at 576e88a; pinned copy, `synth/pin_logic.py`; sha256 f9f2ac617b32694c). Steps:
1. Candidates from request builders, one per action / question / fact / rule, each drawing its cue words from the legend
   (`rules_inventory.mjs`) and the formalizer's own lists (RULES_COVERAGE.md), least-used first so rare cues are not starved. Target forms in
   every role: a name (sometimes "the Name", "the box Name", "the shape named Name", lower case), a list of names, a description (colour,
   shape, recency, quantifier all/every/each, the + plural, bare plural, "the X that are not C", "the blue ones", everything / all shapes /
   all / the whole diagram), a pronoun or "that one" / "the same one" pointing at the request before, a shape created earlier in the message
   ($new). Descriptions fill 56% of targets, 11% of from, 12% of to, 20% of anchors (training data before: 2%, RULES_VS_LEARNED.md).
   Variation: polite openers (1772 messages) and closers (709), capitalisation, final punctuation, one typo in 383 messages (only on words
   the Rules' spelling step corrects towards), 20 domains with their own names, `names` = the names the text uses + 0-3 others.
   Multi-request one-liners joined by and / then / and then / after that / finally / ; / a sentence end (facts, rules and questions are their
   own sentences; a verbless clause only first, since the Rules give it the earlier verb otherwise); verb ellipsis and one clause per created
   object as their own constructions.
2. Gold by LABEL_CONVENTIONS.md; where silent, the training majority (RULES_VS_LEARNED.md) or the coordinator's decision of 2026-11-02:
   "connect A and B" -> from "A,B"; several to one -> one connect from "A,B" to "C"; no axis word -> no axis; undo twice -> no count;
   extreme -> superlative only; "all / everything / the shapes / the diagram / them all" as the object -> target mention(quantifier=all), no
   target word -> no target key.
3. The Rules read every candidate (`synth/check_rules.mjs`, canonical form of `docs/js/bench-canon.js`); **only messages whose Rules wires
   equal the gold exactly are kept** (same number of requests, act, every key, no key more).
4. Overlap with the test sets removed (below), then exact duplicates inside the synthetic data.
5. Top-up: while a cue is in fewer than 5 kept requests, 2000 more candidates are made and only those holding such a cue are added (2 added).

## Counts

| step | messages |
|---|---|
| candidates (9200 core + 1500 ops + 2000 top-up) | 12700 |
| rejected: the Rules' reading differs from the gold (table below; `synth/rejects.jsonl`, each with its class, the Rules' wires and tags) | 1100 (8.7%) |
| removed: equal to a test-set message (lower case, punctuation stripped): llm_short 116, short3 42, fresh2 13, seen 6, hand 5, new_identities 5, heldout_formulations 5, broad 4 | 196 |
| removed: same token set as a test-set message: llm_short 3, seen 1 | 4 |
| reported only: Jaccard >= 0.8 with a test message: llm_short 33, short3 9, new_identities 8, seen 5, broad 3, heldout 2, fresh2 1, hand 1, blind 1 | (kept) |
| removed: exact duplicate text inside the synthetic data | 566 |
| top-up candidates that passed the Rules but were not added | 1672 |
| **kept** | **9162** (7822 + 1340) |

The removed overlaps are listed in `synth/overlap_removed.jsonl`; most are short fixed commands ("how many arrows are there", "redo that",
"describe the diagram", "undo").

**The six template test sets (hand, blind, broad, seen, new_identities, heldout_formulations) were written or generated from the same Rules
cues and templates as this data. After a reader trains on synth_rules they no longer measure generalisation for that reader, only coverage
of the Rules' wording.** llm_short, fresh2 and short3 (the new blind short-command set, `llm_bench/short3`, added to the check because it will validate) stay
independent texts: no exact or token-set copy of their messages is in this data.

### Requests per act

| act | synth_rules | synth_rules_ops |
|---|---|---|
| command:align | 190 | 0 |
| command:arrange | 301 | 0 |
| command:connect | 871 | 0 |
| command:create | 1509 | 297 |
| command:delete | 595 | 18 |
| command:disconnect | 249 | 24 |
| command:distribute | 178 | 0 |
| command:duplicate | 216 | 15 |
| command:forget | 65 | 0 |
| command:group | 0 | 205 |
| command:label | 296 | 238 |
| command:move | 1095 | 108 |
| command:redo | 52 | 0 |
| command:rename | 180 | 0 |
| command:resize | 281 | 14 |
| command:set | 1246 | 69 |
| command:swap | 161 | 0 |
| command:toBack | 127 | 16 |
| command:toFront | 188 | 12 |
| command:undo | 38 | 0 |
| command:ungroup | 0 | 78 |
| fact | 264 | 58 |
| question:check | 357 | 23 |
| question:connected | 119 | 0 |
| question:count | 229 | 61 |
| question:cycle | 75 | 0 |
| question:degree | 90 | 0 |
| question:describe | 88 | 0 |
| question:exists | 199 | 5 |
| question:extreme | 264 | 0 |
| question:groupOf | 0 | 40 |
| question:list | 216 | 26 |
| question:members | 0 | 43 |
| question:nearest | 163 | 0 |
| question:neighbors | 113 | 0 |
| question:path | 112 | 0 |
| question:property | 264 | 59 |
| question:reachable | 90 | 0 |
| question:rules | 70 | 0 |
| rule | 204 | 0 |
| **all** | 10755 | 1409 |

### Rejects by class (the Rules' first difference; C = a convention difference, R = the Rules read the construction otherwise)

The gold of a rejected message is what LABEL_CONVENTIONS.md (or the decision named) says; no generator bug was found by reading
the rows (about 150 rejects read; the earlier generator bugs were fixed before this run: articles, empty chunks, "lines" with "a", "X's colour" with a description,
a verbless clause after another request, style words on a chain). The 20 "other" rows are mixed Rules readings; read them in rejects.jsonl.

| rejects | class |
|---|---|
| 247 | R 'all' / 'them all' / 'the (whole) diagram' as the object is not read as all shapes ('all' only at the end of a clause) |
| 129 | R a typo the Rules' spelling step does not fix (capitalised word, tie, or too short) |
| 104 | C several to one (A and B to C): gold one connect from=A,B; Rules from=A to=B (C lost) |
| 54 | R 'A to B and B to C' with wire / attach / tie: the second clause is lost (only connect/link/join/hook split, logic.js 1318) |
| 47 | C connect A and B: gold from=A,B (training majority); Rules from=A to=B |
| 45 | R verb ellipsis not split (opener before the verb, a position word outside the splitter's list, or a list target) |
| 38 | R several objects in one create not split (an opener before the verb, logic.js 1310) |
| 33 | R a clause merged into or split from its neighbour (other) |
| 28 | C undo twice / 3 times: gold no count (no key in the conventions); Rules count |
| 26 | C no axis word: gold no axis; Rules axis=horizontal (default) |
| 25 | R one-letter names are not used by the clause splitters (logic.js 1315) |
| 22 | R a rule with 'from now on' at the end is not read |
| 21 | R rename followed by more words (thanks, please, then ...): the new name is read only at the end of the clause |
| 21 | R spelling step: 'point' -> 'paint', 'part' -> 'park' |
| 21 | R 'show me the connections': read as neighbors without a target |
| 21 | R 'set the outline/border of X to C' read as a colour |
| 20 | R 'what is the shape of X': 'the shape' becomes a description, the question is read as list |
| 20 | G/R other (read the row) |
| 19 | R 'what's written on X': 'written' corrected to the verb 'write' |
| 18 | R a list of three names before a value ('paint A, B and C red', 'slide A, B and C up') is split into two requests |
| 16 | R 'put the label "x" on <a description>' is read as a move (with a name it is a label) |
| 16 | R 'is there a connection between A and B': read as exists |
| 15 | R 'draw a two-way arrow ...': a hyphenated word before the arrow noun hides it (create) |
| 14 | R 'label it "x"': 'label it' is taken as the label cue, the pronoun is lost |
| 14 | R 'is B downstream of A': from/to read in text order |
| 12 | R notColor of a described set in list/count is dropped |
| 11 | R a verbless placement with a position word PLACE_ONLY does not list (by, around, close to, left side of, ...) |
| 9 | C a shape filter on extreme: gold superlative only (conventions); Rules add shape |
| 9 | R the word 'edge' in 'along the right edge' makes count/list count connections |
| 7 | R group membership / groupOf not read (a closer after the group name, 'part of') |
| 4 | R a rule frame not read |
| 4 | R an undo / redo / forget clause whose word is not a verb cue (revert, take that back, cancel, ...) is merged into the next clause |
| 4 | R an arrow named 'A - B' (spaced dash) in a question or with a typo is not read |
| 3 | R 'both ways' after a description: 'both' is read as the pronoun 'them' |
| 2 | R a question form read as another question |
| 1 | R an unquoted one-word label corrected towards a cue word ('end' -> 'send', 'hot' -> 'dot') |

Most frequent Rules findings worth a decision (each a Rules or convention question, not a data question): "all" as the object is read only
at the end of a clause ("arrange all" yes, "arrange all in a circle", "align all horizontally", "arrange them all" no: 247); several to
one and "connect A and B" (convention); "A to B and B to C" with wire/attach/tie drops the second link silently; the spelling step turns
"point" into "paint", "part" into "park", "written" into "write", an unquoted label "end" into "send"; "label it "x"" loses the pronoun;
"put the label "x" on <a description>" is a move; the word "edge" in "along the right edge" makes a count of connections.

### Every cue word, in how many kept requests (`python3 training/sketch/synth/cue_counts.py --md`)

Counted on the text: a request counts when its span holds the cue and its gold holds the value (actions: the trigger is the cue). Both
folders. Minimum 5.

| question | value | cue: requests |
|---|---|---|
| shape | circle | circle: 175, circles: 87, dot: 169, dots: 79, ball: 185, balls: 85 |
| shape | square | square: 551, squares: 201 |
| shape | rectangle | rectangle: 135, rectangles: 56, rect: 135, rects: 64, box: 125, boxes: 56, block: 138, blocks: 54 |
| shape | triangle | triangle: 534, triangles: 210 |
| shape | diamond | diamond: 270, diamonds: 229, rhombus: 249 |
| shape | ellipse | ellipse: 258, ellipses: 117, oval: 279, ovals: 121 |
| shape | hexagon | hexagon: 500, hexagons: 226 |
| shape | star | star: 520, stars: 233 |
| shape | any | shape: 277, shapes: 358, node: 108, nodes: 76, object: 11, objects: 27, thing: 11, things: 27, element: 35, elements: 75, item: 11, items: 27, one: 317, ones: 224 |
| color | red | red: 91, crimson: 74, scarlet: 68 |
| color | orange | orange: 235 |
| color | yellow | yellow: 130, amber: 112 |
| color | gold | gold: 128, golden: 112 |
| color | lime | lime: 247 |
| color | green | green: 233 |
| color | teal | teal: 123, turquoise: 101 |
| color | cyan | cyan: 120, aqua: 107 |
| color | blue | blue: 244 |
| color | navy | navy: 246 |
| color | indigo | indigo: 236 |
| color | purple | purple: 95, violet: 65, lilac: 75 |
| color | magenta | magenta: 128, fuchsia: 114 |
| color | pink | pink: 125, rose: 102 |
| color | brown | brown: 232 |
| color | gray | gray: 95, grey: 75, silver: 68 |
| color | black | black: 233 |
| color | white | white: 242 |
| size | tiny | tiny: 89, minuscule: 88 |
| size | small | small: 101, little: 97 |
| size | medium | medium: 43, normal: 52, regular: 49, average: 44 |
| size | large | large: 88, big: 92 |
| size | huge | huge: 51, giant: 43, enormous: 48, massive: 45 |
| notColor | red | not red: 21 |
| notColor | orange | not orange: 19 |
| notColor | yellow | not yellow: 20 |
| notColor | gold | not gold: 19 |
| notColor | lime | not lime: 19 |
| notColor | green | not green: 20 |
| notColor | teal | not teal: 17 |
| notColor | cyan | not cyan: 17 |
| notColor | blue | not blue: 21 |
| notColor | navy | not navy: 21 |
| notColor | indigo | not indigo: 19 |
| notColor | purple | not purple: 18 |
| notColor | magenta | not magenta: 17 |
| notColor | pink | not pink: 22 |
| notColor | brown | not brown: 19 |
| notColor | gray | not gray: 21 |
| notColor | black | not black: 18 |
| notColor | white | not white: 21 |
| position | leftOf | left of: 189, to the left of: 47, on the left of: 44, left side of: 35 |
| position | rightOf | right of: 192, to the right of: 43, on the right of: 41, right side of: 43 |
| position | above | above: 112, over: 58, on top of: 54 |
| position | below | below: 102, under: 44, underneath: 42, beneath: 43 |
| position | near | next to: 25, near: 21, beside: 23, close to: 22, by: 25, alongside: 23, around: 25 |
| position | between | between: 429 |
| position | topLeft | top left: 36, top-left: 10, upper left: 10, upper-left: 9 |
| position | topRight | top right: 33, top-right: 11, upper right: 10, upper-right: 8 |
| position | bottomLeft | bottom left: 14, bottom-left: 11, lower left: 25, lower-left: 14 |
| position | bottomRight | bottom right: 23, bottom-right: 12, lower right: 15, lower-right: 14 |
| position | center | center: 30, centre: 8, middle: 30 |
| position | top | top: 74 |
| position | bottom | bottom: 82 |
| position | left | left: 61 |
| position | right | right: 72 |
| direction | left | left: 79 |
| direction | right | right: 78 |
| direction | up | up: 46, upwards: 41 |
| direction | down | down: 46, downwards: 38 |
| style | dashed | dashed: 22, dash: 23 |
| style | dotted | dotted: 38 |
| arrow | both | two-way: 7, two way: 8, bidirectional: 8, both ways: 9, double-headed: 5, two headed: 8 |
| arrow | none | line: 82, lines: 16, plain: 23, undirected: 18, without an arrow: 11, without arrows: 14 |
| pairing | chain | in a chain: 8, one after the other: 6, one after other: 7, in sequence: 6, in order: 8 |
| pairing | next | to the next: 40, to the next one: 25, each to the next: 28 |
| pairing | all | all to each other: 17, every pair: 17, to each other: 29 |
| axis | horizontal | horizontally: 70, horizontal: 49, in a row: 66 |
| axis | vertical | vertically: 68, vertical: 62, in a column: 53, column: 53 |
| layout | row | row: 47, line: 17, horizontally: 12 |
| layout | column | column: 49, stack: 20, vertically: 12 |
| layout | grid | grid: 87, tidy: 53 |
| layout | circle | circle: 33, ring: 49 |
| superlative | biggest | biggest: 21, largest: 16 |
| superlative | smallest | smallest: 17, tiniest: 10 |
| superlative | leftmost | leftmost: 30 |
| superlative | rightmost | rightmost: 29 |
| superlative | topmost | topmost: 14, highest: 20 |
| superlative | bottommost | bottommost: 16, lowest: 18 |
| superlative | closest | closest: 41, nearest: 38 |
| superlative | farthest | farthest: 44, furthest: 40 |
| superlative | mostConnected | most connections: 5, most links: 6, most edges: 6, most arrows: 10, most connected: 8 |
| superlative | leastConnected | fewest connections: 8, least connections: 9, fewest links: 5, fewest arrows: 9, least connected: 7 |
| comparison | bigger | bigger than: 19, larger than: 19 |
| comparison | smaller | smaller than: 16 |
| recency | newest | new: 111, newest: 105, last: 104, latest: 105, most recent: 115 |
| recency | oldest | first: 106, oldest: 113, earliest: 97 |
| quantifier | all | all: 807, every: 215, each: 95, everything: 105 |
| property | color | color: 57, colour: 18 |
| property | size | size: 29, how big: 17, how large: 13, how small: 15 |
| property | shape | shape: 16 |
| property | label | label: 44, text: 29, say: 33 |
| property | position | where: 20, position: 17, location: 12 |
| kind | edge | arrows: 15, connections: 8, links: 9, edges: 7, lines: 9 |
| kind | group | groups: 12 |
| action | undo | undo: 18, revert: 9 |
| action | redo | redo: 22, reapply: 16, re-apply: 7 |
| action | create | draw: 172, create: 112, add: 207, make: 117, put: 136, place: 101, insert: 97, sketch: 97, build: 72, spawn: 69, throw: 75, slap: 64, pop: 71, stick: 73, plonk: 72 |
| action | delete | delete: 84, remove: 58, erase: 34, drop: 40, clear: 42, wipe: 17, reset: 34, get rid of: 35, kill: 34, trash: 32, axe: 36, ditch: 32, zap: 29, banish: 40, nuke: 35 |
| action | move | move: 191, shift: 93, drag: 78, push: 65, nudge: 65, slide: 61, reposition: 55, relocate: 56, scoot: 64, shove: 59, park: 66, tuck: 58 |
| action | set | set: 146, change: 162, turn: 210, color: 48, colour: 37, paint: 54, fill: 27, give: 63, recolor: 28, recolour: 26, transform: 30, convert: 33, reshape: 32, morph: 24 |
| action | resize | resize: 21, grow: 44, enlarge: 51, shrink: 68, scale: 45 |
| action | rename | rename: 147, call: 31 |
| action | label | label: 183, title: 9, caption: 11, write: 35, inscribe: 14, stamp: 12, tag: 13 |
| action | duplicate | duplicate: 40, copy: 33, clone: 29, replicate: 27, dupe: 30 |
| action | swap | swap: 55, exchange: 32, trade: 16, switch places: 39, trade places: 19 |
| action | group | group: 77, put together: 45, bundle: 36 |
| action | ungroup | ungroup: 7, split up: 9, break up: 12, dissolve: 9 |
| action | connect | connect: 98, link: 93, join: 96, wire: 74, attach: 78, hook: 83, tie: 74 |
| action | disconnect | disconnect: 14, unlink: 16, detach: 20, separate: 20, cut: 34, unhook: 15, sever: 28, snip: 28 |
| action | align | align: 88, line up: 96 |
| action | arrange | arrange: 87, layout: 34, lay out: 38, organize: 42, organise: 46, tidy: 53 |
| action | distribute | distribute: 32, space: 74, spread: 69 |
| action | toFront | bring: 169, raise: 28 |
| action | toBack | send: 143 |
| action | forget | forget: 21, discard: 9, disregard: 5 |
| ask | count | how many: 223, count: 47, number of: 20 |
| ask | exists | is there: 68, are there: 81, are any: 28, any: 111 |
| ask | list | list: 55, which: 104, show: 51, what: 32 |
| ask | property | what color: 46, what colour: 18, where: 20, how big: 17, how large: 13, how small: 15, what size: 13, what shape: 16, what does: 33, label: 44, position: 17, location: 12 |
| ask | check | is: 380, bigger than: 19, smaller than: 16 |
| ask | describe | describe: 18, summarize: 16, summarise: 6, overview: 11, tell me about: 9, what's on: 8, what is on: 14 |
| ask | neighbors | connected to: 26, linked to: 12, attached to: 11, joined to: 11, connect to: 8, link to: 10, neighbours: 11, neighbors: 13, connections: 11 |
| ask | connected | connected: 29, linked: 29, attached: 17, joined: 15, connect to: 13, link to: 16 |
| ask | degree | how many connections: 17, how many links: 23, how many arrows: 9, how many lines: 12, how many edges: 7, how many neighbours: 11, how many neighbors: 11 |
| ask | path | path: 12, route: 13, get from: 12, reachable: 9, reach: 21, lead to: 22, go from: 10, flow to: 13 |
| ask | reachable | reached: 21, reachable: 14, reach: 13, go from: 13, downstream: 17, get to: 12 |
| ask | cycle | cycle: 13, cycles: 18, loop: 18, loops: 15, circular: 11 |
| ask | rules | rules: 43, defaults: 27 |
| ask | extreme | biggest: 21, largest: 16, smallest: 17, tiniest: 10, leftmost: 30, rightmost: 29, topmost: 14, highest: 20, lowest: 18, bottommost: 16, most: 35, fewest: 22, least: 16 |
| ask | nearest | closest: 41, nearest: 38, farthest: 44, furthest: 40 |
| ask | members | what is in: 9, contain: 8, members: 9, who is in: 9, which shapes are in: 8 |
| ask | groupOf | which group: 8, what group: 21, belong to: 10, in a group: 11 |
| rule | rule | from now on: 27, by default: 23, in the future: 26, in future: 26, henceforth: 24, going forward: 20, always: 8, should be: 59, must be: 17, will be: 17 |
| fact | fact | is / are: 322 |

## What is NOT covered

- Anything the Rules read otherwise than the gold (the reject table): those constructions are absent from this data even when people use
  them ("connect A and B", "arrange all in a circle", "is there a connection between A and B" ...). They need a Rules fix or a convention
  decision, then a re-run.
- Size as a filter or inside a description ("how many big circles", "the big circle"): the Rules read it, the conventions have no key.
- The legend's style cue `dot`, property outline, `scale` amounts (resize is written without them).
- Edits of logic.js after ca2850a (uncommitted during this run: e.g. relabel / unlabel / title / caption changes, a "text" shape).
- High-level layout operations (tree, layered, radial ...): another agent writes `training/sketch/ops/formulations.jsonl`; run it through the
  same checks with `python3 training/sketch/synth/check_file.py training/sketch/ops/formulations.jsonl training/sketch/llm_train/<folder>
  --mode report` (keeps every non-overlapping message and reports the Rules' verdict) or `--mode rules` (keeps only Rules-equal ones).
- Long realistic messages: this is short-command data only; the combinations of 2-5 requests proofread by Haiku are `llm_train/synth_combo/`.

## Files

`training/sketch/synth/`: gen_rules_cover.py (generator), check_rules.mjs (the Rules vs the gold), rules_inventory.mjs (the legend and the
formalizer's lines), cue_counts.py (cue counts on the text), pin_logic.py (which logic.js), check_file.py (the same checks for another file),
validate_combo.py + BRIEF_HAIKU.md (the combination messages), RULES_COVERAGE.md, SYNTH_PLAN.md, coverage.json (summary, rejects by class
and cause, requests per act, the generator's tags generated / kept / final), rejects.jsonl, overlap_removed.jsonl. `.logic_<rev>.js` is a
cache of the pinned logic.js (do not commit).
