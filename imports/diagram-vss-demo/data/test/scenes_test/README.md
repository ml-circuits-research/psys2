# scenes_test: 4 held-out step-by-step scenes (test set)

Test data: keep out of training. The 4 scenes are shown in the demo (+ menu, "Scenes", marked test; `docs/js/scenes-extra.js`); that does not make them training data. `training/sketch/synth/gen_rules_cover.py test_texts` lists `llm_bench/scenes_test` (batches and saved
texts), so every builder that removes test overlaps removes these texts from training folders. The training scenes of the same kind are
`../../llm_train/scenes_r3` (16 scenes, same writer, same conventions); its README has the method, the gold decisions, the engine findings
and the list of text changes (scenes 05, 10, 14, 20 are these four).

## Files

| file | what |
|---|---|
| `batch_01.jsonl` .. `batch_04.jsonl` | one scene per file, 166 steps, 163 requests |
| `texts/texts_01.jsonl` .. `texts_04.jsonl` | the texts (id, domain, text), saved before the gold |

## Scenes

| scene | theme | kind | file | steps | requests | exact / relative placement | Rules: steps read exactly | shapes at the end | groups |
|---|---|---|---|---|---|---|---|---|---|
| 05 | living room | interior | scenes_test/batch_01.jsonl | 40 | 40 | 18 / 4 | 20/40 | 18 | 3 |
| 10 | town map | map | scenes_test/batch_02.jsonl | 43 | 42 | 3 / 15 | 22/43 | 19 | 1 |
| 14 | heart card | emotional (heart card) | scenes_test/batch_03.jsonl | 41 | 40 | 5 / 13 | 24/41 | 19 | 3 |
| 20 | playground | cartoon scene | scenes_test/batch_04.jsonl | 42 | 41 | 6 / 13 | 19/42 | 22 | 3 |

Placement and sizing: exact 32, relative 45 (58% relative). Steps: 1 request 161, 2 requests 1, chatter only 4.

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

- Frame repetition: distinct message frames / messages 0.946, distinct span frames / requests 0.933.
- Overlap with the other test sets and with scenes_r3: none.
- The Rules: 85 / 166 steps read exactly as the gold (51.2%).
- VSS conversion (convert_check, the same switches, EXTRA_DIRS=llm_train/scenes_r3): round trip 56.4% (no world 8.6%, no event token
  8.0%, differs 26.4%); per key: at 81%, width / height 100%, distance 25% (with a position and an anchor 0/9), size 76%, count 50%,
  position 82%, anchor 88%, fill 60%, layer 100%. SOP-BERT's roles_roundtrip.py has no option for this folder (its test folders are fixed):
  not measured.
