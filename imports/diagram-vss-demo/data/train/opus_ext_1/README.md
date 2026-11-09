# opus_ext_1: realistic training messages for the new forms (help, templates, free text, re-layout ops, arrow restyle, arrow labels)

Written by an Opus agent on 2026-11-02 for the learned readers (VSS, SOP-BERT), which have never seen these forms. Not committed;
the coordinator reviews and commits.

## Files

| file | what |
|---|---|
| `msg_01.jsonl` .. `msg_05.jsonl` | 500 messages, `oe1-0001` .. `oe1-0500`, 100 per file, wire format of `synth_combo` / `opus_gen_1` (id, domain, names, text, wires with span / trigger / type / args) |
| `texts/texts_01.jsonl` .. `texts_05.jsonl` | the texts (id, domain, names, text), each batch saved BEFORE it was annotated |

Byte check: `id`, `domain`, `names`, `text` of every annotated message equal the saved texts (500 / 500).
Changes made after saving a batch, before its annotation was final (all in the context or in a replaced message, none to fit a gold):
- oe1-0084: `Header` added to `names` (the text names it: "it's called Header"); oe1-0218: `BoardTitle` added to `names` (same reason).
- oe1-0044: the text was "straighten the lines", exactly a text of `short3` (found by the overlap check); replaced by a new message
  "straighten out all the slightly crooked lines pls" and its gold.

## Mix

- Requests per message: 1 request 305 (61%), 2 requests 146 (29%), 3 or more 48 (10%), 0 requests 1 (oe1-0380: "make every arrow
  the same colour as the one from Clip1 to Clip2", not expressible: no wire). 743 wires. Words per message: 2 to 37 (median 13); there
  are no long (10-20 sentence) messages in this set.
- Families (wires; % of the 632 new-form wires): re-layout ops + arrow restyle/reverse 168 (27%: re-layout 100, restyle `set`/`resize`
  on arrows 58, `reverse` 10), help 155 (25%), templates 142 (22%), free text and panels 93 (15%), arrow labels 74 (12%: 63 `label`
  with from/to, 11 `property=label` questions); plus 111 ordinary requests mixed in (create, set, move, connect, delete, rename, swap,
  path, extreme, nearest, count, describe, ...).
- Templates: all 24 (list 12, process 10, cycle 10, timeline 9, steps 9, heart 7, funnel 7, road 7, matrix 7, hub 7, balance 6,
  hierarchy 5, pyramid 5, target 5, wave 5, sunrise 4, burst 4, pillars 4, mountain 4, venn 4, spiral 3, hourglass 3, bridge 3, tree 2);
  17 of them `arrange template=` on existing shapes; parameters used: items, items2, title, parents, scheme (11 of 12), color, size,
  position (+ anchor), axis, count.
- Help: 71 topic values (actions, asks, keys, values, templates, plugin family nouns, `general` is not used), aspects how 56, overview 32,
  can 27, values 24, example 14, none 2; 12 without topic (bare help, "what can you do", and `about` only: pictures, PNG, dark mode, emojis,
  font, rotate, lock, shadows, calendar view, sun).
- Ops: improve 10, arrange tree 12 / radial 7 / layers 6 / organic 2 / direction only 3, respace 9, equalize 9, flip 6, fit 6, untangle 5,
  groupBy 5, snap 5, align edges 5, sort 7, straighten 3, reverse 10, arrow restyle set 47 / resize 11.
- Registers: terse, polite, chatty, typos ("whats a hourglass", "can u draw"), non-native ("Please you make for me a process ... in
  vertical"), dictation ("okay so um ... and then uh"), self-corrections (oe1-0217, 0381, 0392, 0436, 0491), taken-back requests (0084).
  452 distinct domain strings, many personas; no frame of synth_combo or formulations.jsonl was used (see the exposure log).

## Gold conventions used

From LEGEND_EXT.md section 7 (proposal), HIGH_LEVEL_OPS.md sections 2-3, LABEL_CONVENTIONS.md, and the brief:
- Help: `question ask=help [topic] [aspect] [about]`. Topic = the most specific legend thing: a template, else an action by a specific
  verb, else a family noun (arrows -> connections, text/title/note -> text, colours -> color, ...), else a value; none for "help" /
  "what can you do" (no aspect either). Where the question names an operation in other words, the topic is that operation (my decision,
  e.g. "change the direction of an arrow" -> reverse, "delete an arrow without deleting the boxes" -> disconnect, "name an arrow" /
  "change what an arrow says" / "delete a label from an arrow" -> label, "make all shapes the same size" -> equalize, "undo an undo" ->
  redo, "undo and redo" -> history). Restyling questions ("how do I make the arrows dashed") stay `connections`. `about` = the unknown
  words as written, contiguous ("export as PNG", "calendar view"); also written beside a topic when a significant unknown word is there
  ("can I make the lines curved" -> topic connections, about curved). Two questions about two things ("difference between hub and burst")
  -> the first one named.
- Templates: `create template=… items=…` (comma-joined, as written, no quotes). title for titled / called / named / around "…" / to "…"
  (road, mountain) / in the middle (cycle) / roof (pillars); items2 for the second side (balance, bridge), roots (tree), lower glass
  (hourglass), axis names (matrix), shared middle (venn), base (pillars); parents only when the text says who is under whom. Pyramid
  items are written top first even when the text lists them bottom-up ("Love at the bottom ... Independence on top" -> Independence,...,
  Love; 4 wires: 0140, 0220, 0330, 0424). Template parameters said in a following sentence of the same request ("... Make it rainbow!",
  "Use the love colours. Put it in the middle.") are folded into the one create wire, whose span then covers those sentences;
  a new verb that makes a new object ("then write "Week 1" above it") is its own wire. Existing shapes -> `arrange template=… target=…`.
  "pastel / soft" -> calm, "earthy" -> earth, "colourful" -> rainbow, "wheel / loop" -> cycle, "staircase / ladder / stairs" -> steps,
  "explosion / starburst" -> burst, "2x2 / 2 by 2 / swot" -> matrix, "mind map / hub" -> hub, "agenda / checklist" -> list.
- Free text: `create shape=text label=…` (quotes optional in the text; the words without quotes), size from the letter size words
  (big -> large, huge, small, tiny), color, position (+ anchor when placed next to a named shape: "write "START HERE" above Room1").
  "a note / caption / banner / heading / subtitle saying …" are free texts. A text ON a shape is a label of the shape (oe1-0460 "put the
  text "C" on top of it"). Panels: `create layer=zone|background fill=light …`. Text items on the canvas are named (MainTitle, Headline,
  Caption1, Subtitle, Status, Board, Banner, Footer, Text1) and edited with the ordinary actions (move, set, resize, label, delete,
  toFront, toBack).
- Re-layout ops: HIGH_LEVEL_OPS.md exactly (the ops are not in logic.js at HEAD). "all / everything / the whole thing / the drawing / the
  diagram / the map / my flowchart / the bracket / the players / the tables (= every shape there)" -> `target=mention(quantifier=all)`;
  "it / this / things / them" with nothing named before -> no target. tidy / clean up / neaten / fix the layout / make it look
  professional -> improve. "root at the left" -> direction right; "X on top / from X / X first / around X" -> anchor. "flow left to right"
  -> layers. "spread out more / bump up the spacing / roomier / double it" -> respace bigger (scale 2 only for "double it"); "compact /
  tighten" -> smaller. "center the drawing / put the whole thing in the centre" -> fit position=center. "line up the left edges / tops /
  bottoms" -> align direction=left/up/down. "turn it upside down / flip vertically" -> flip axis=vertical; "flip the arrow" -> reverse.
- Arrow restyle: `set from= to= style|color|arrow|size`, `resize from= to=` (thicker/thinner); every arrow: `kind=edge` (+
  `quantifier=all` when all/every/each is said); "the arrows from X" -> `from=X` (no kind, no quantifier); "thick / thickest" -> size
  large / huge, "thin" -> small; "normal arrow again" -> arrow forward; "no arrowheads / plain" -> arrow none; "solid" -> style solid.
  After a `reverse`, the arrow is named by its new ends (oe1-0215).
- Arrow labels: `label from=A to=B label=X`; `label=""` removes it; a pronoun or "the second one / the last arrow / that link" is resolved
  to the arrow's ends; "label the links Core-Leaf1, Core-Leaf2 and Core-Leaf3" -> from Core, to Leaf1,Leaf2,Leaf3. Questions: `property
  property=label from= to=`. All labels of every arrow: `label kind=edge quantifier=all label=""` (oe1-0167).

## Check against the Rules (`check_file.py --mode report`, logic.js at HEAD 27dda05)

Run: `LOGIC_JS=<scratch copy of docs/js at HEAD>/logic.js python3 training/sketch/synth/check_file.py <all 500> <scratch dir> --mode
report` (the working-tree logic.js is being edited by another agent, so the committed one was used from a scratch copy).
- Overlap with the test sets: 0 after replacing oe1-0044 (before: 1, exact, short3). Duplicates in the file: 0.
- Messages read exactly by the Rules: 68 / 500 (with the ops patch of `ops-integration.md` applied to a scratch copy: 128 / 500).
- Per wire (alignment by order and action), HEAD Rules: help 40 / 155 equal, templates 23 / 142, free text 38 / 93, arrow labels 25 / 74,
  ordinary 70 / 111, ops 0 / 168 (not in HEAD). With the ops patch (scratch copy only): ops 94 / 168.

338 disagreements on the four forms the committed Rules read, by class. In every class I checked the gold and kept it unless said:

| family | n | class | decision |
|---|---|---|---|
| help | 70 | Rules read a drawing question (list, describe, count, exists, check, extreme, cycle, rules, reachable, neighbors): "what's a venn", "what's the difference between …", "show me a pillars example", "explain …", "how many templates are there", "is there a dark mode", "how do I count how many cars", help after another request ("…, then tell me how do I change its colours") | gold (help) |
| help | 11 | Rules read a command ("can you add emojis to shapes" -> create, "how do I undo if …" -> set, "can the editor do undo and redo" -> redo, "Show me an example of a hub template" -> create) | gold |
| help | 7 | not read at all ("how to do arrow with two heads", "how do i undo the last thing", "explain the hub and spoke thing") | gold |
| help | 22 | topic differs: 10 by meaning (above; incl. "diagrams" -> template, "a list of words" -> template, "if two shapes are connected" -> connected); 5 Rules topics from stray words ("a little" -> small, "is there a way to" / "the way to" -> road, "lock … move" -> move); 4 Rules put a known word in about ("clear everything and start over", "add someone", "horizontal later", "cloud" with topic shape); 2 family-noun order ("what sizes can text be" size vs text; "what kinds of things can I write" text vs label); 1 two questions merged | gold; the 2 family-noun-order cases are arguable |
| help | 5 | about / aspect: about beside a topic (curved, snake, photos), Rules put chatter in about ("help pls i'm lost" -> about "pls i'm lost"), "what can I ask you" overview vs can | gold |
| templates | 28 | not read: verbless forms ("pyramid please: …", "agenda for Friday please: …", "swot matrix: …", "sunrise around …", "Launch party starburst!!"), a list after "I need", "Give me", "I'd like" | gold |
| templates | 23 | merged with a free text or a later request (title sentence read as a free text, two templates in one clause) | gold |
| templates | 19 | items: Rules glue the words before or after the list ("wedding day: ceremony,…", "my week - happy monday,…", "…, dancing under it") | gold |
| templates | 20 | items2 / parents / order: second lists ("on one side … on the other", "up top … below", "crown … roots", "For: … Against: …"), parents ("Tom and Priya under Maria"), pyramid order | gold |
| templates | 16 | arrange into a template not recognised (8), read as set / label / help (8) | gold |
| templates | 10 | template parameters in a later sentence not read (folded in the gold) | gold (convention above; the coordinator may prefer separate wires: no precedent) |
| templates | 3 | spurious parameters from item words ("Calm Thursday" -> scheme calm, "Forest" -> scheme forest, "Love" -> scheme love, "Everest at the top" / "Grandma Ivy is at the top" -> position top) | gold |
| free text | 21 | Rules write a label of the anchor shape: "write "START HERE" above Room1", "add the text "encrypted" above Vpn", "write "October" above it" | gold (a text placed next to a shape is not written on it) |
| free text | 13 | "a caption / note / banner / subtitle … under Spin": Rules create an ordinary shape with that label (no shape=text) | gold |
| free text | 12 | not read (elided verb "\"Question 2\" at the top right", "below it a subtitle …") or read as move / set | gold |
| free text | 9 | parameters: layer / fill of zones and panels missing, "above everything" -> top, "at the very bottom", "big bold letters" -> Rules color gold | gold |
| arrow labels | 21 | ends: pronoun ("label it "REST""), "the Light to Stage arrow" read as target=light,stage, ordinals ("the second one", "the first one") | gold |
| arrow labels | 16 | another action: set (8), create (4), delete (2), disconnect (1), rename (1) | gold |
| arrow labels | 10 | not read (verbless "Ocean→Cloud should say …", "Earth→Mars "225M km"") | gold |
| arrow labels | 2 | label text ("is missing", "minus" instead of the corrected "withhold") | gold |

Confident wrong readings of the HEAD Rules found here (destructive ones first): "remove all the labels on the arrows" -> `disconnect
quantifier=all` (deletes every arrow); "The labels on Gate→Ramp and Ramp→Runway: remove them both" -> `delete target=Gate,Ramp,Runway`;
"clean up please" -> `delete target=mention(quantifier=all)` (HIGH_LEVEL_OPS.md section 9, still at HEAD); "can you delete that label"
-> `delete`; "rename it to "parquet"" (an arrow) -> `rename name=parquet`; "write "Decisions" in big bold letters" -> color gold.
With the ops patch: "tighten it up" -> `distribute color=white`.

## Own label-check pass (all 743 wires)

Script checks: every key in the legend (patched legend, so the ops values count), every enum value in its list, help topics in the
generated topic legend, mention keys sorted, no quotes or padded commas in values, spans in text order and not overlapping, triggers
inside spans, names in `names` or created earlier, `$new` only after a create, free texts with words, template creates with items or count.
Then a read of every gold against its text. Fixes (4):
- oe1-0065, 0299, 0328, 0347: `quantifier=all` removed from restyle / reverse wires that name the arrows by their start ("the edges from
  Core should all be dashed", "every arrow from Base", "every arrow coming out of Router", "the lines from Hub ... make them solid"):
  HIGH_LEVEL_OPS.md writes `quantifier` only with `kind=edge`; the ends already select the arrows (the patched Rules agree).

Open cases (left as written; the coordinator decides):
1. Two named arrows in one restyle ("Make both of them dashed" after Gateway→Bank, Bank→Ledger; also 0226, 0319, 0434, 0441): written
   `from=Gateway,Bank to=Bank,Ledger`, which also matches Gateway→Ledger if it existed. No convention for a list of arrow pairs.
2. oe1-0111 "the lines between managers and VPs": ends resolved from role words to Mgr1,Mgr2,Mgr3 / Vp1,Vp2 (text order).
3. oe1-0149 "lay them out as a hub around Lead": written `arrange layout=radial anchor=Lead` (the meaning); by HIGH_LEVEL_OPS "hub" is not a
   re-layout word, so a strict reading would be `arrange template=hub`.
4. oe1-0254 "put the whole thing in the centre" -> fit position=center (HIGH_LEVEL_OPS keeps "move … to the center" as move).
5. oe1-0211 "three boxes under it called Price, Speed, Trust" -> one create count=3 name=Price,Speed,Trust (no precedent for several names).
6. oe1-0184 "Edge -> Cdn and Cdn -> Origin, both labelled "https"" read as a new chain with a label (the arrows may already exist);
   oe1-0188 "Flour, Eggs and Milk all point to Batter" read as a connect (could be a description).
7. oe1-0260 "how many groups are there?" and oe1-0380 (equal arrow colours) have no wire: the legend cannot say them.
8. oe1-0329 "make Squat the biggest one" -> set size=huge; oe1-0365 "both in green": color on both texts though the first span lacks it.
9. oe1-0378 "family tree with roots … and … as the crown" -> the tree template (roots/crown), although "family tree" is a hierarchy cue.

## Exposure log

Read (whole or the parts named): `AGENTS.md`; `training/sketch/legend_ext/LEGEND_EXT.md`; `training/sketch/ops/HIGH_LEVEL_OPS.md`;
`docs/js/ops-integration.md`; `docs/js/templates.js` (catalogue entries, schemes, legend(), parts of venn / hub / road / balance /
pillars); `docs/js/help-answers.js` (lines 1-120); `docs/js/logic.js` (grep only: HELP_LEAD, HELP_FAMILY, HELP_STOP, TPL_*, legend value
lists, the label / edge-label handler lines; never edited); `training/sketch/llm_train/TRAIN_MSG_SPEC.md`;
`training/sketch/LABEL_CONVENTIONS.md` (first 150 lines); `training/sketch/synth/check_file.py`; `training/sketch/synth/check_rules.mjs`
(first 40 lines); `training/sketch/llm_train/opus_gen_1/LABEL_FIXES.md` and the first 6 messages of `opus_gen_1/msg_01.jsonl` (format);
the first 5 messages of `training/sketch/llm_train/synth_combo/msg_01.jsonl` (to copy the wire format: these are synth_* texts, read
before writing; no frame was reused).
Run, output only seen as counts or my own ids: `check_file.py` / `check_rules.mjs` (they read the test sets for the overlap check; I saw
only that oe1-0044 matched a `short3_texts` line, i.e. my own text); the Rules on my own sentences (scratch copies of docs/js at HEAD,
and a copy patched by `training/sketch/ops/apply_ops_patch.mjs` with `ops_patch_blocks.js`, both in the scratchpad, never in the repo);
two counting scripts over `sonnet_msg`, `haiku_msg`, `sonnet_msg2`, `sonnet_long`, `opus_gen_1` for two conventions (a create "in a row":
1 match, printed; a create with several names: 0 matches).
Not read: anything under `training/sketch/llm_bench` (short3, fresh2, ...), `training/sketch/ops/formulations.jsonl` /
`formulations_texts.jsonl`, the rest of `llm_train/synth_*`, any model, score or feedback file.
Side effect handled: `check_file.py` writes `training/sketch/synth/<out dir name>_check.json`; the three it wrote were moved to the
scratchpad at once. No background process was left running.
