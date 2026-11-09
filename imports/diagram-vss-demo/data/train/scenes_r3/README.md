# scenes_r3: 16 step-by-step scenes (training)

Training data for the learned readers (SOP-BERT, VSS): each scene is drawn step by step from plain English commands, so every step is a
command a person would type, in a rich context of named shapes, relative positions, groups, colours, sizes, panels and z-order.
Held-out scenes of the same kind: `../../llm_bench/scenes_test` (4 scenes). Every scene is also a demo example in the + menu's "Scenes": `docs/js/scenes-extra.js`
(these 16, the 4 of `scenes_r3b` and the 4 test scenes, which stay test data).

## Files

| file | what |
|---|---|
| `msg_01.jsonl` .. `msg_16.jsonl` | one scene per file, 701 steps, 714 requests (wire format of `opus_ext_1`, plus `groups`) |
| `texts/texts_01.jsonl` .. `texts_16.jsonl` | the texts (id, domain, text), saved before the gold |

## Scenes

| scene | theme | kind | file | steps | requests | exact / relative placement | Rules: steps read exactly | shapes at the end | groups |
|---|---|---|---|---|---|---|---|---|---|
| 01 | farm | cartoon landscape | scenes_r3/msg_01.jsonl | 51 | 51 | 19 / 9 | 23/51 | 28 | 5 |
| 02 | city street | city view | scenes_r3/msg_02.jsonl | 49 | 49 | 21 / 6 | 21/49 | 30 | 6 |
| 03 | space station | cartoon scene | scenes_r3/msg_03.jsonl | 48 | 47 | 13 / 7 | 22/48 | 22 | 3 |
| 04 | underwater reef | cartoon landscape | scenes_r3/msg_04.jsonl | 46 | 46 | 19 / 4 | 21/46 | 28 | 6 |
| 06 | pump skid schematic | technical drawing | scenes_r3/msg_05.jsonl | 45 | 44 | 6 / 12 | 26/45 | 13 | 1 |
| 07 | circuit board | technical drawing (board) | scenes_r3/msg_06.jsonl | 42 | 42 | 6 / 9 | 22/42 | 22 | 2 |
| 08 | apartment floor plan | floor plan | scenes_r3/msg_07.jsonl | 44 | 45 | 24 / 3 | 14/44 | 28 | 2 |
| 09 | sales bar chart | chart | scenes_r3/msg_08.jsonl | 42 | 48 | 19 / 2 | 19/42 | 17 | 1 |
| 11 | board game | game board | scenes_r3/msg_09.jsonl | 43 | 47 | 3 / 9 | 14/43 | 18 | 2 |
| 12 | geometric composition | abstract composition | scenes_r3/msg_10.jsonl | 43 | 43 | 3 / 18 | 24/43 | 21 | 1 |
| 13 | concert poster | poster with big text | scenes_r3/msg_11.jsonl | 41 | 43 | 3 / 15 | 15/41 | 22 | 1 |
| 15 | sunrise of hope | emotional (sunrise of hope) | scenes_r3/msg_12.jsonl | 41 | 40 | 4 / 15 | 20/41 | 21 | 2 |
| 16 | recycling infographic | infographic (cycle) | scenes_r3/msg_13.jsonl | 42 | 45 | 2 / 7 | 20/42 | 13 | 1 |
| 17 | winter village | cartoon landscape | scenes_r3/msg_14.jsonl | 40 | 40 | 6 / 14 | 15/40 | 28 | 4 |
| 18 | pirate ship | cartoon scene | scenes_r3/msg_15.jsonl | 42 | 42 | 7 / 16 | 19/42 | 20 | 2 |
| 19 | robot factory | cartoon / technical | scenes_r3/msg_16.jsonl | 42 | 42 | 3 / 13 | 24/42 | 22 | 4 |

Placement and sizing requests: exact values (at, width / height, a distance with a direction) 158, relative (a position with an anchor or a
canvas place, optionally with one gap length, size words, resize, equalize, align, distribute) 159 (50% relative). The early scenes
(01-09) lean on coordinates, the later ones on relative placement (owner, 2026-11-03: about half and half).
Requests by kind: create 267, set 71, label 41, group 40, connect 40, check 33, move 26, count 24, undo 17, toFront 15, extreme 15,
delete 12, list 11, describe 11, property 10, resize 9, path 9, nearest 9, rename 8, duplicate 7, neighbors 6, members 5, groupOf 5,
equalize 4, degree 3, swap 3, align 3, distribute 3, cycle 2, reverse 2, disconnect 1, arrange 1, exists 1.
Steps: 1 request 655, 2 requests 21, 3+ requests 5, chatter only 20.

## How the scenes were made

- Written by an Opus agent on 2026-11-03 (the owner's idea: complex scenes drawn step by step from plain English commands are realistic
  training data for SOP-BERT and VSS). Not committed; the coordinator reviews and commits.
- 20 scenes of mixed kinds (owner, 2026-11-03): landscapes, a city view, an interior, technical drawings (a pump skid, a circuit board, a
  floor plan), a chart and an infographic, a map, a game board, an abstract composition, a poster with big text, two emotional drawings
  (a heart card, a sunrise of hope), cartoon scenes. Original characters only. 16 scenes are training data (`llm_train/scenes_r3`), 4 are
  held out (`llm_bench/scenes_test`: living room, town map, heart card, playground; one interior, one map, one emotional, one cartoon).
- One row per step: `id` (`sc3-<scene>-<step>`), `domain`, `names` (the shapes on the canvas before the step, as the engine has them),
  `groups` (the groups before the step, `{name: members}`, the field of `ops_groups`), `text`, `wires` (span / trigger / type / args, the wire
  format of `opus_ext_1`). Conventions: `LABEL_CONVENTIONS.md`, `TRAIN_MSG_SPEC.md` (its last section: new forms, the "all" target).
- Texts first: each scene's texts were saved in `texts/texts_NN.jsonl` (id, domain, text) before its gold was written. `names` and `groups`
  are not in the texts files: they are what the engine holds after running the gold of the earlier steps. Byte check: `id`, `domain`,
  `text` of every annotated row equal the saved texts (701/701 training, 166/166 test).
- Texts changed after a scene's gold was first run (to fix a scene that looked wrong, to vary repeated frames, to remove overlaps with the
  test sets, or so that each request states its own values): every change is listed at the end of `llm_train/scenes_r3/README.md`; the
  texts files were re-saved after each change.

## Validation by execution

Each scene's gold wires were run in order through `docs/js/logic.js` (`createSystem`, `engine.run`, as `test_start_diagram.mjs` does;
`$new` = the value of the latest create / duplicate wire of the step, `mention(...)` = a mention node). Every step runs without an engine
error (867 / 867). The final drawing of each scene was checked: nothing off the 800 x 500 canvas, no two items overlapping unless they are
in the same group (a character's parts) or the overlap is meant (scene 01: Cloud2 in front of Sun). One PNG per scene (a small renderer of
the final state with the palette of logic.js, group frames dashed, the canvas edge in red):
`/tmp/claude-0/-home-claude/8941735c-db18-5907-b7c8-a224e2065054/scratchpad/scenes/scene_NN_<theme>.png`.
One execution aid that is not gold: a `resize` whose span says shrink / smaller has no `scale` in the gold (conventions: target only), so
the runner passes `scale=0.67` (the Rules' reading), otherwise the engine enlarges.

## Gold decisions (beyond the conventions)

- Verbless create ("huge red square at 170,330, call it Walls"): trigger = the shape noun ("square"). Measured with convert_check
  (EXTRA_DIRS=scenes_r3): the noun gives 53.6% round trip, the leading noun phrase ("huge red square") 46.4% (no event token for the
  create).
- A name stated as a prefix ("Tank: blue rectangle ...", "Wardrobe: brown rectangle ...") is the `name` when later steps use it.
- A pronoun or description pointing to an earlier step ("rename it Cloud2", "make them gray", "the copy", "the title") -> the name it means
  (the reference the context rule fills; SOP-BERT's round trip counts it as "reference only").
- "the stars", "the captions" -> `mention(quantifier=all,shape=...)` when every shape of that kind is meant; "the bubbles", "the LEDs",
  "the seats" (a subset) -> their names.
- Gaps are numbers ("2 px above House1", "16 px left of Belt"); "no gap" was rewritten as a number. Values of an elided request are
  restated in its own span ("Wheel2, also tiny and black, a circle at 620,435").
- A taken-back request gets no wire (sc3-17-029, sc3-19-027); 24 steps are chatter only ("Thanks, that's the farm!").
- Not used: "inside X" (no position value in the legend), "half the height of", rotation (no key). "as big as X" / "the same size as X" ->
  `equalize property=size anchor=X`.

## Measurements (2026-11-03)

- Frame repetition (`data_repetition.py`): distinct message frames / messages 0.880, distinct span frames / requests 0.818, top frame
  `is N right of N ?` (7), messages in frames shared by more than 2: 10.3%. Inside a scene no two steps share a frame.
- Overlap with the test sets (`synth/gen_rules_cover.py test_texts`, which now lists `llm_bench/scenes_test`): none (exact text or token
  set); 39 texts that were exact copies of test texts ("undo", "How many arrows are there?" ...) were reworded with scene context, the
  request words kept (listed below).
- The Rules (`synth/check_file.py --mode report`): 319 / 701 steps read exactly as the gold (45.5%). The largest difference: the Rules
  read nothing in 148 steps (verbless creates "huge red square at ...", "Name: description" lines, pronouns across steps); then panels
  (layer / fill / width / height are not read), names after "call it", group phrasings. The gold was not changed toward the Rules.
- VSS conversion (`convert_check.py`, LEGEND_EXT=1 VAL_PICK=specific DIAGRAM_OPS=1 NEW_DISTINCT=1, EXTRA_DIRS=llm_train/scenes_r3):
  round trip 54.8% (every shape 0.6%, no world 7.0% = group commands and group questions, no event token 8.4%, differs 29.3%). Without
  the scenes in EXTRA_DIRS (fronts learned from the base data only): 37.8%. Per key (rows that reproduce the gold value / gold values):
  at 86%, width 100%, height 100%, distance 28% (with a direction 15/16; with a position and an anchor 0/38: the world row never carries a
  gap), direction 95%, size 86%, count 46% (number words "three", "six" lost), comparison 100%, position 87%, anchor 87%, layout 96%,
  fill 56%, layer 100%.
- SOP-BERT (`training/neural/roles_roundtrip.py`, EXTRA_DIRS=llm_train/scenes_r3): round trip right 86.1%, right or reference only 99.6%
  (13.4% are references the context rule fills), asked 0.3%, silent wrong labels 0.1% (1 row: "label it ..." with the pronoun's target).
  Per key: at, width, height, distance, direction, size, count, comparison, layout, fill, layer 100%; position 96%, anchor 93% (anchors
  that are pronouns).

## Engine findings (docs/js/logic.js, reported, not changed)

1. `set` / `resize` of a panel (zone or background) that holds items moves the panel: the re-placement check after a restyle treats the
   items on it as obstacles ("make the grass lime" moved Grass from y 375 to 205). Panels were not restyled after items were put on them.
2. `set` / `resize` of an item that overlaps or is within 6 px of another item re-places it (a bar 6 px above the axis jumped 46 px up when
   recoloured; an eye on a face would leave the face). Composite characters are not restyled after their parts overlap.
3. A horizontal gap under 14 px ("4 px right of Hen") is not kept: relSpot's obstacle padding (14 px) pushes the shape further away.
4. `duplicate` drops an explicit width / height (a copied 12 x 130 lamp pole became a 99 x 62 box).
5. `align direction=down` (bottom edges) of May and Jun moved May sideways (x 560 -> 758).
6. A template asked for on a full canvas is drawn in a new frame, off the visible canvas (heart template at x 1057..1505).
7. `check` with a group as target is refused ("Snowman is a group, not a shape"), while groups work as anchors.
8. A zone or panel created without a shape word is a circle (drawn as an ellipse): "a light green zone" needs "rectangle".

## Text changes after a scene's gold was first run

- s01 step 35: '40 px left of Bessie' -> 'below Silo' (the hen landed far left among the fence posts and its beak under the fence)
- s02 step 1: 'background panel' -> 'background rectangle' (no shape word: the engine makes a circle panel, drawn as an ellipse)
- s02 steps 41-43: 'copy the whole Lamp group / put the copy at 640,300 / What's in Lamp2?' -> 'copy Bulb / put the copy at 640,300 / Give it a post too: ...' (duplicate drops a shape's explicit width/height: the copied pole became a 99x62 box; engine finding)
- s05 step 20: 'right above the pot' -> '6 px above the pot' (the default gap of 72 px left the leaves floating)
- s09 step 7: 'Apr, 60 by 250, at 460,295' -> 'Apr, a 60 by 250 rectangle, at 460,295' (without a shape word the bar was a circle drawn as an ellipse)
- s09 step 30: text moved from 170,110 to 200,110 (it covered the Y axis)
- s08 step 8: caption "Kitchen" moved from 440,58 to 455,46 (the fridge, after the swap, covered it)
- s09: X axis 428 -> 440 and month names 442 -> 458 (recolouring a bar that sits 6 px above the axis moved the bar 46 px up: set/resize re-place a shape near another one)
- s09 step 22/24/26: Jun 'right of May' + ', 40 px gap'; 'line up the bottom edges of Jan, ..., Jun' -> 'move Jun down 20 so its bottom lines up with the others' (align direction=down of May and Jun moved May to x=758, right of Jun); "Jun" text at 660,458
- s08 step 3: 'light yellow' -> 'a light yellow rectangle' (no shape word: the zone was a circle)
- s13 steps 18-19: 'group SpeakerL, SpeakerR and Stage as Sound / move Sound down a bit' -> 'group SpeakerL and SpeakerR as Sound / move Sound up a bit' (the speakers came down onto the spotlights)
- s14 step 24: 'add a heart of Kindness, Cookies and Stories in the bottom left' -> 'add a small purple hexagon near MyBody, a present for her' (the heart template found no room and was drawn in a new frame to the right of the canvas)
- s15 step 24: 'above Tower' -> 'right above Tower, no gap' (the lamp floated 72 px above the tower)
- s17 step 25: 'Is Snowman right of Home3?' -> 'Is Base right of House3?' (a check on a group target is refused by the engine: "Snowman is a group, not a shape")
- s16 step 25: 'move Stats up a bit' -> 'move Stats a bit to the left' (80 px up put the stat boxes on the hexagon ring)
- s04 step 38: 'bring Finn to the front' -> 'Finn should swim in front of everything else' (frame variety)
- s07 step 30: 'bring Cpu to the front' -> 'raise Cpu above the traces and everything' (frame variety)
- s13 step 17: 'bring Burst to the front' -> 'put Burst on top of the other layers' (frame variety)
- s16 step 41: 'Bring Stats to the front' -> 'Stats on top, please' (frame variety)
- s17 step 34: 'bring Snowman to the front' -> 'Snowman goes in front of everything' (frame variety)
- s19 step 29: 'bring Conveyor to the front' -> 'raise Conveyor to the top layer' (frame variety)
- s06 step 41: 'Bring Legend to the front' -> 'Legend must sit above everything else, bring it forward' (frame variety)
- s06 step 17: 'Is there a path from Tank to Outlet?' -> 'Can I get from Tank to Outlet following the arrows?' (frame variety)
- s07 step 22: 'Is there a path from Battery to Ram2?' -> 'does a route exist from Battery to Ram2?' (frame variety)
- s16 step 18: 'Is there a path from Collect to Make?' -> 'Can you reach Make starting from Collect?' (frame variety)
- s18 step 35: 'Is there a path from Flag to Chest?' -> 'Is Chest reachable from Flag?' (frame variety)
- s19 step 20: 'Is there a path from Panel to Head1?' -> 'Does anything lead from Panel to Head1?' (frame variety)
- s07 step 41: 'Describe Cpu.' -> 'Tell me about Cpu.' (frame variety)
- s13 step 40: 'Describe Burst.' -> 'what do you know about Burst?' (frame variety)
- s18 step 41: 'Describe Hull.' -> 'Give me a description of Hull.' (frame variety)
- s19 step 39: 'Describe Panel.' -> 'describe the Panel for me' (frame variety)
- s08 step 9: '"Bath" at 625,58' -> 'and "Bath" near the top of the bath, at 625,58' (frame variety)
- s15 step 26: 'group Tower and Lamp as Lighthouse' -> 'Tower plus Lamp make one group, Lighthouse' (frame variety)
- s19 step 8: 'group Body1, Head1 and Antenna1 as Bot1' -> 'put Body1, Head1 and Antenna1 into one group named Bot1' (frame variety)
- s20 step 17: 'group Crown and Stem as Tree' -> 'Crown and Stem belong together: make them a group called Tree' (frame variety)
- s02 step 46: 'Undo that.' -> 'Undo that, huge looks silly over the stars.' (the text was in a test set)
- s03 step 43: 'Which shape is the biggest?' -> "Which shape is the biggest? I bet it's the planet." (the text was in a test set)
- s03 step 46: 'Are there any cycles?' -> 'Are there any cycles in these connections?' (the text was in a test set)
- s04 step 33: 'How many ellipses are there?' -> 'How many ellipses are there? Fish bodies count too.' (the text was in a test set)
- s04 step 34: 'which shapes are pink?' -> 'which shapes are pink in my reef?' (the text was in a test set)
- s04 step 44: "What's the topmost shape?" -> "What's the topmost shape? Probably a bubble." (the text was in a test set)
- s06 step 18: 'How many arrows are there?' -> 'How many arrows are there on the sheet?' (the text was in a test set)
- s06 step 37: 'Which shape has the most connections?' -> 'Which shape has the most connections, Pump or Valve?' (the text was in a test set)
- s06 step 44: 'Describe the diagram.' -> 'Describe the diagram, I want to check it before sending.' (the text was in a test set)
- s07 step 19: 'How many gold shapes are there?' -> 'How many gold shapes are there on the board?' (the text was in a test set)
- s08 step 40: 'undo' -> 'undo, pink pillows clash with the blue bed' (the text was in a test set)
- s08 step 41: 'Which is the biggest shape?' -> 'Which is the biggest shape in the flat?' (the text was in a test set)
- s08 step 42: 'count the circles' -> 'count the circles in the plan' (the text was in a test set)
- s09 step 27: 'how many rectangles are there now?' -> 'how many rectangles are there now, axes included?' (the text was in a test set)
- s11 step 17: 'how many squares are there?' -> 'how many squares are there with the dice?' (the text was in a test set)
- s11 step 39: 'Which is the rightmost shape?' -> 'Which is the rightmost shape on the board?' (the text was in a test set)
- s12 step 21: 'Which shape is the biggest?' -> 'Which shape is the biggest now, the hexagon?' (the text was in a test set)
- s12 step 31: 'which shapes are white?' -> 'which shapes are white at this point?' (the text was in a test set)
- s12 step 35: 'make all the circles purple' -> 'make all the circles purple, even Disc' (the text was in a test set)
- s13 step 25: 'Which shapes are pink?' -> 'Which shapes are pink on the poster?' (the text was in a test set)
- s13 step 33: 'undo' -> 'undo, the notes should stay' (the text was in a test set)
- s13 step 34: "What's the topmost shape?" -> "What's the topmost shape on the poster?" (the text was in a test set)
- s13 step 38: 'how many stars are there?' -> 'how many stars are there, Burst included?' (the text was in a test set)
- s15 step 22: 'Which shapes are white?' -> 'Which shapes are white on the sea?' (the text was in a test set)
- s15 step 30: 'how many triangles are there?' -> 'how many triangles are there with the gulls?' (the text was in a test set)
- s15 step 38: 'which shape is the largest?' -> 'which shape is the largest in the picture?' (the text was in a test set)
- s16 step 26: 'how many hexagons are there?' -> 'how many hexagons are there in the ring?' (the text was in a test set)
- s16 step 37: 'how many arrows are there?' -> 'how many arrows are there after all that?' (the text was in a test set)
- s16 step 38: 'Which shape has the most connections?' -> 'Which shape has the most connections in the cycle?' (the text was in a test set)
- s17 step 32: 'Which shape is closest to the moon?' -> 'Which shape is closest to the moon now that it moved?' (the text was in a test set)
- s17 step 38: 'how many squares are there?' -> 'how many squares are there, houses only I think?' (the text was in a test set)
- s18 step 29: 'How many circles are there?' -> 'How many circles are there, portholes included?' (the text was in a test set)
- s18 step 36: 'How many groups are there?' -> 'How many groups are there on the canvas?' (the text was in a test set)
- s19 step 31: 'Which shape has the most connections?' -> 'Which shape has the most connections, the joint?' (the text was in a test set)
- s19 step 33: 'how many squares are there?' -> 'how many squares are there with the three robots?' (the text was in a test set)
- s10 step 33: 'rename Market to Bazaar' -> "rename Market to Bazaar, that's what locals call it" (the text was in a test set)
- s14 step 22: 'how many circles do we have?' -> 'how many circles do we have on the card?' (the text was in a test set)
- s20 step 20: 'how many circles are there?' -> 'how many circles are there on the playground?' (the text was in a test set)
- s20 step 28: 'undo' -> 'undo, the seats look too small' (the text was in a test set)
- s01: 'another one, Spot2, at 505,385' -> 'another tiny black circle, Spot2, at 505,385' (each request states its own values; 'no gap' written as a number)
- s02: 'and the green one, GreenLight, at 470,280' -> 'and the tiny green one, GreenLight, at 470,280' (each request states its own values; 'no gap' written as a number)
- s02: 'Wheel2 at 620,435' -> 'Wheel2, also tiny and black, a circle at 620,435' (each request states its own values; 'no gap' written as a number)
- s03: 'and a matching one on the right side of Core, PanelR' -> 'and a blue rectangle 120 by 40 on the right side of Core, PanelR' (each request states its own values; 'no gap' written as a number)
- s04: 'ClawR at 270,430' -> 'ClawR, a tiny red circle too, at 270,430' (each request states its own values; 'no gap' written as a number)
- s04: 'And another one, a bit shorter, 14 by 80, at 100,385, Weed2.' -> 'And another green rectangle, a bit shorter, 14 by 80, at 100,385, Weed2.' (each request states its own values; 'no gap' written as a number)
- s07: 'Ram2 is the same, 34 by 90, gray, 20 px right of Ram1' -> 'Ram2 is the same, a gray rectangle 34 by 90, 20 px right of Ram1' (each request states its own values; 'no gap' written as a number)
- s07: 'and C2 right of C1' -> 'and C2, another small blue hexagon, right of C1' (each request states its own values; 'no gap' written as a number)
- s08: '"Kitchen" at 455,46' -> '"Kitchen" at 455,46 in small letters' (each request states its own values; 'no gap' written as a number)
- s08: 'and "Bath" near the top of the bath, at 625,58' -> 'and a small "Bath" near the top of the bath, at 625,58' (each request states its own values; 'no gap' written as a number)
- s08: '"Bedroom" at 75,288 and "Hall" at 430,288' -> 'small "Bedroom" at 75,288 and small "Hall" at 430,288' (each request states its own values; 'no gap' written as a number)
- s08: 'Pillow2 at 240,355' -> 'Pillow2, a small white rectangle as well, at 240,355' (each request states its own values; 'no gap' written as a number)
- s09: 'then "Feb" at 260,458, "Mar" at 360,458' -> 'then small "Feb" at 260,458, small "Mar" at 360,458' (each request states its own values; 'no gap' written as a number)
- s09: '"Apr" at 460,458 and "May" at 560,458' -> 'small "Apr" at 460,458 and small "May" at 560,458' (each request states its own values; 'no gap' written as a number)
- s13: 'Speakers: a navy rectangle named SpeakerL left of Burst, and SpeakerR right of Burst' -> 'Speakers: a navy rectangle named SpeakerL left of Burst, and a navy rectangle SpeakerR right of Burst' (each request states its own values; 'no gap' written as a number)
- s13: 'and another one near rectangle3' -> 'and another small white star near rectangle3' (each request states its own values; 'no gap' written as a number)
- s15: 'Two seagulls: tiny black triangles near the sun, Gull1 left of Sun and Gull2 right of Sun, both 30 px away' -> 'Two seagulls: a tiny black triangle Gull1 30 px left of Sun and a tiny black triangle Gull2 30 px right of Sun' (each request states its own values; 'no gap' written as a number)
- s15: 'lamp on top: tiny yellow circle right above Tower, no gap, called Lamp' -> 'lamp on top: tiny yellow circle 2 px above Tower, called Lamp' (each request states its own values; 'no gap' written as a number)
- s17: 'right above House1, no gap' -> '2 px above House1' (each request states its own values; 'no gap' written as a number)
- s17: 'Roof2 on top of it, brown triangle, no gap either' -> 'Roof2 on top of it, a brown triangle 2 px above House2' (each request states its own values; 'no gap' written as a number)
- s17: 'Roof3: brown triangle right above House3, no gap' -> 'Roof3: brown triangle with a 2 px gap above House3' (each request states its own values; 'no gap' written as a number)
- s17: 'Pine2 between Home1 and Home2' -> 'a green triangle Pine2 between Home1 and Home2' (each request states its own values; 'no gap' written as a number)
- s18: 'black flag: small black triangle above Mast, no gap, called Flag' -> 'black flag: small black triangle just 2 px above Mast, called Flag' (each request states its own values; 'no gap' written as a number)
- s18: 'and a medium green star on top of Trunk for the leaves, no gap, named PalmTop' -> 'and a medium green star 3 px above Trunk for the leaves, named PalmTop' (each request states its own values; 'no gap' written as a number)
- s18: 'two white ovals for clouds, one left of Sun and one in the top left' -> 'two white ovals for clouds, one left of Sun and a white oval in the top left' (each request states its own values; 'no gap' written as a number)
- s19: 'two gray circles as rollers, RollerL left of Belt and RollerR right of Belt, each with a 16 px gap' -> 'rollers: a gray circle RollerL 16 px left of Belt and a gray circle RollerR 16 px right of Belt' (each request states its own values; 'no gap' written as a number)
- s19: 'First robot body: a medium blue square named Body1 right above Belt, no gap' -> 'First robot body: a medium blue square named Body1 2 px above Belt' (each request states its own values; 'no gap' written as a number)
- s19: 'its head, a small blue square named Head1, right above Body1, no gap' -> 'its head, a small blue square named Head1, with a 2 px gap above Body1' (each request states its own values; 'no gap' written as a number)
- s19: 'and a tiny red circle on top of Head1 for the antenna, no gap, named Antenna1' -> 'and a tiny red circle 2 px on top of Head1 for the antenna, named Antenna1' (each request states its own values; 'no gap' written as a number)
- s19: 'two medium gray hexagons for gears: GearA in the top center, and GearB right of GearA' -> 'two medium gray hexagons for gears: GearA in the top center, and a medium gray hexagon GearB right of GearA' (each request states its own values; 'no gap' written as a number)
- s05: 'ArmL at 190,385 and ArmR at 470,385' -> 'ArmL at 190,385 and another green 30 by 60 rectangle ArmR at 470,385' (each request states its own values; 'no gap' written as a number)
- s14: 'my body: an orange rectangle MyBody right below MyHead, no gap' -> 'my body: an orange rectangle MyBody 2 px below MyHead' (each request states its own values; 'no gap' written as a number)
- s14: 'her body, a purple rectangle called GranBody, directly below GranHead with no gap' -> 'her body, a purple rectangle called GranBody, directly below GranHead with a 2 px gap' (each request states its own values; 'no gap' written as a number)
- s14: 'and the same above GranHead' -> 'and the same tiny red diamond above GranHead' (each request states its own values; 'no gap' written as a number)
- s20: 'and its trunk, a brown rectangle named Stem right below Crown, no gap' -> 'and its trunk, a brown rectangle named Stem 2 px below Crown' (each request states its own values; 'no gap' written as a number)
- s07 step 2: '120x90' -> '120 x 90'; s08 step 5: '360x210' -> '360 x 210'; s09 step 6: '60x200' -> '60 by 200' (one token NxM: the roles labels mapped the height to another number)
