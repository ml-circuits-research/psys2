# human-adapted-v1 / drawing

558 labelled rows (`examples.jsonl`) and 525 gap records (`gaps.jsonl`). Each one adapts a real human line from a public corpus to the Drawing tab. Every row records its corpus, line id and licence, and the original line where the licence is permissive (withheld for non-commercial or unstated licences). `build.py` turns `authored.jsonl` (provenance, context and inline label markup) into the output files: `python3 build.py`, deterministic, no network. `validate.py` exits 0 on pass. It runs the official Validator (0 errors, 0 fixes) and checks span order and containment, count values, the primary class, duplicate texts, texts already in the official dataset, and overlap (text or source line) with the held-out benchmark items.

Sources and rows / gap-only lines:
- CoDraw teller utterances (CC BY-NC 4.0), 282 / 136. These are human training utterances retrieved verbatim in codraw-models `transcripts-eval-v1.json`; the questions come from that file's human drawer turns.
- MagicBrush dev/test edit turns (CC BY 4.0), 198 / 95. Consecutive turns of one image use `context.previous`.
- SCONE scene (no licence stated), 43 / 6. BLOCKS (no licence stated), 35 / 14. Emu Edit (CC BY-NC 4.0), 13 gap-only lines; RealEdit post titles (CC BY 4.0), 5 gap-only lines.

Sampling: lines were drawn with a seed and are disjoint from the benchmark source lines. Every line read was either labelled or recorded as a gap. To cover the usage classes, the random draws were topped up with keyword draws for corrections ("sorry"), drawer questions and quantities.

| primary class | rows | partial-gap records | gap-only lines |
| --- | --- | --- | --- |
| create | 155 | 119 | 62 |
| compose-scene | 3 | 2 | 0 |
| place-relative | 213 | 103 | 88 |
| quantify | 11 | 4 | 3 |
| refer | 46 | 4 | 2 |
| modify-attribute | 43 | 3 | 41 |
| arrange/layout/align/distribute | 4 | 0 | 7 |
| part-edit | 12 | 3 | 18 |
| formatting/effects | 0 | 0 | 24 |
| vague-aesthetic | 0 | 0 | 5 |
| correction/undo | 8 | 7 | 12 |
| question | 41 | 1 | 4 |
| compound/multi-step | 17 | 10 | 2 |
| fragment/follow-up | 5 | 0 | 1 |

Label decisions (`construction[0]` holds the primary class: derived from the labels, e.g. several requests → compound, relation → place-relative, unless set explicitly):
- Teller descriptions are creation requests: "there is a dog next to boy" is make, with trigger "there is". A bare copula ("a medium cat is …") gets no trigger. Relations follow the official banks: next to/beside/by → near, under/beneath → below. The anchor value is the anchor phrase.
- Placement regions use `drawn.at`. Vague regions ("left corner", "middle of the sky") keep their span without a class value. "medium" is a size mention with no value.
- `drawn.kind` (registered but unused in the official rows) is the result of kind replacements ("change the cat to a fox"). Plural definite edits ("remove the trees") are `fill: all`.
- Parts follow the ui-coverage convention: target type part, `name_span` is the part, and `part.id` is a selector with the owner phrase ("the laptop", "its"). SCONE colour descriptions of existing people use `target.description_span`.
- Measured moves ("two spaces", "one spot") are `drawn.distance`. Distances from page edges or anchors in placements are NOT labelled (see gaps).
- A row may leave modifiers unlabelled when no key exists, such as facing or pose. Every such row also has a gap record (`labelled_as_example: true`) naming what is missing. Lines whose main content has no key are gap-only.

Missing keys, by number of gap records:
- drawn.facing 149, drawn.pose 126, drawn.expression 103, drawn.align (to the horizon or another object's part) 94, drawn.offset (measured distance from an edge or anchor) 92, drawn.crop (cut off by the page edge) 72, drawn.holds (held or worn objects) 44, drawn.cover (occlusion) 27.
- Counted by keyword in the needs text: layouts of several objects into rows, lines or shapes (31); page-wide style, weather and lighting (18); kind corrections of the last object ("sorry it is cat", 14); part state and material (16); TV/screen content (7); comparisons against an anchor ("smaller than the sun", 5); evaluative goals ("look better", 5); adding a part (3); part length (3); new-anchor relations ("put the zebras next to a river", 4).
