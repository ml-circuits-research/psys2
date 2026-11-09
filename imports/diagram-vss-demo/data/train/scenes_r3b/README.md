# scenes_r3b: 4 more step-by-step scenes (training), for the forms the readers fail on

Training data for the learned readers (SOP-BERT, VSS), the same kind as `../scenes_r3` (same row format, conventions and validation; read
that README first). Written on 2026-11-03 by an Opus agent for `../../scenes_r3/ROOT_CAUSES.md`: the failures of the shipped readers on the
scenes and on the demo's examples come mostly from forms the training data does not hold. These scenes hold them on purpose, inside
ordinary scenes (no padding, one request per step as a person types it):

| form | why (ROOT_CAUSES.md) | steps here |
|---|---|---|
| coordinates with a space or in brackets: "at 400, 120", "at (110, 258)" | the demo's "Little house" writes "at 400, 300"; VSS loses the y of a create with many values (3 of 8 house creates); scenes_r3 has 0 such steps, the shipped training folders 4 + 14 | 33 |
| sizes in several word orders: "780 wide and 230 tall", "120 x 40", "160 by 60", "at 150, 300, 220 wide and 30 tall" | the shipped SOP-BERT has no width / height tags: the numbers of "150 by 90" are tagged as `at`, four spans, and the decoder drops `at` (31 of its 36 lost `at` on the scenes) | 20 |
| a gap with a relation, also in words: "2 px above Hut", "forty px right of Gull", "two px below Sign", "thirty px away" | VSS rows never carried a gap with a relation (fixed: GAP_ROLE=1); SOP-BERT has no `distance` for create; number words for gaps occur in no training folder | 16 |
| bare "right of X" / "left of X" | the VSS front end of the shapes world does not learn "right of" (precision 0.78 < 0.8): "Add a yellow diamond named Valid right of Form" loses the position and the anchor | 12 |
| panels: pale / faint / light, background / zone | the shapes front end has no fill_* / layer_* value; SOP-BERT's fill head has only `light` | 6 |
| counts in words: "Three small yellow squares", "Four tiny red circles" | "three" is not a value of the shapes front end (precision 0.75) | 2 |

## Files

| file | what |
|---|---|
| `msg_21.jsonl` .. `msg_24.jsonl` | one scene per file, 96 steps, 94 requests (wire format of `opus_ext_1`, plus `names` and `groups`) |
| `texts/texts_21.jsonl` .. `texts_24.jsonl` | the texts (id, domain, text), saved before the gold was written |

| scene | theme | steps | requests | shapes at the end | groups |
|---|---|---|---|---|---|
| 21 | harbour at dusk | 27 | 27 | 17 | 2 |
| 22 | kitchen plan | 24 | 23 | 13 | 1 |
| 23 | bus stop street | 22 | 22 | 16 | 3 |
| 24 | garden plan | 23 | 22 | 14 | 1 |

Ids `sc3b-<scene>-<step>`. Steps: 1 request 90, 2 requests 2, chatter only 4.

## Validation (as scenes_r3)

- Texts first: `texts/` was written before the gold; the `id`, `domain`, `text` of every row equal the saved texts (96 / 96, checked by
  the build script). No text was changed after the gold was written.
- Every span is a substring of its text and every trigger a substring of its span.
- The gold of every step was run in order through `docs/js/logic.js` (`createSystem`, `engine.run`; `names` and `groups` of each row are
  what the engine holds before the step): 96 / 96 steps without an engine error; the final drawings have nothing off the 800 x 500 canvas
  and no two items overlapping outside a group (the panels Sky, Sea, Floor, Street, Road, Lawn are layers).
- Overlap with the test sets and with scenes_r3 (lower case, punctuation stripped, every `llm_bench` file): none.
- Frame repetition (`data_repetition.py`): distinct message frames / messages 0.979, distinct span frames / requests 0.926.
- The shipped readers on these scenes (`../../scenes_r3/scene_readers.mjs`, gold context; per requested action): Rules 53.2% right,
  VSS 45.7%, SOP-BERT 54.3%, VSS-BERT executing everything 56.4%, VSS-BERT at its gate 37.2% right with 1 wrong. The Rules read 53 / 96
  steps exactly as the gold.

## Gold decisions

The conventions of scenes_r3 (its README, "Gold decisions"). Additionally:
- A framing prefix that states a position the `at` overrides ("Lighthouse on the right: a white rectangle ... at 740, 300", "The table goes
  in the middle: a large brown circle ... at 330, 290", "Counter along the top: ...") is left out of the span; the request is the create.
- "pale" -> `fill=light` (as scenes_r3 sc3-01-001); "faint" -> `fill=faint`.
- A gap in words is a number in the gold ("forty px" -> `distance=40`, "two px" -> 2, "thirty px away" -> 30, "ten px down" -> 10).
- "the title" (sc3b-21-024) -> `text1`, the name the engine gave the text.
