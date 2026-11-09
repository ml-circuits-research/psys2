# Label fixes for the fresh test set `fresh2/opus_b` (150 messages, fo-0151 .. fo-0300)

Label checker: Sonnet agent. File: `batch_01.jsonl`. Rules: `training/sketch/LABEL_CONVENTIONS.md`, `training/sketch/llm_train/TRAIN_MSG_SPEC.md`, `training/sketch/llm_bench/SPEC.md`; majorities counted by script on the corrected training sets `sonnet_msg`, `haiku_msg`, `sonnet_msg2`, `haiku_msg2`, `sonnet_long` (2640 messages).

No reader code, model, result document or score was opened. Nothing was committed or staged. `id`, `domain`, `names` and `text` were not changed (checked against `opus_b/texts/texts_01.jsonl`, see section 5).

## 1. Counts

- Messages: 150. Wires before: 472. Wires now: 468 (changed 4, added 0, removed 4). Messages with a change: 4 (fo-0188, fo-0217, fo-0223, fo-0250).

| kind of fix | changed | added | removed |
|---|---|---|---|
| correction folded into the wire it corrects | 3 | 0 | 3 |
| one verb, two attributes -> one set wire | 1 | 0 | 1 |

The writer's wires otherwise followed the conventions: `$new` for created shapes (also several in one key, see below), chains and the closing connect as a separate wire (fo-0230), several-to-one and one-to-several as one connect, `extreme` for superlative questions, `arrow: none` exactly where the text says line/lines (script check both ways), `mention(...)` keys in alphabetical order, spans inside the text, in order, triggers inside spans.

## 2. Rulings used

- A correction of a just-made request, even in the next sentence or after one other wire, is folded into the wire it corrects; no separate `set`. Training: sm-0004 ("draw a yellow circle called Retry ... connect Running to it. Wait, actually make that circle orange" -> create orange), sm-0205 ("Oops, wrong color, make the Charger teal" -> create teal), sm-0230 ("Hmm, make Characters small instead" -> create small), sm2-0280, sm2-0472: 5 of 5 folded, 0 as a separate set. The writer folded most corrections here (fo-0165, fo-0174, fo-0204, fo-0242, fo-0248, fo-0290) but not three; those three changed. When the correction sentence directly follows the request, the span is widened to include it (sm2-0280, sm2-0472); when another wire sits between, the span stays (sm-0004, sm-0205).
- One verb with two attributes ("Make Rain blue and a triangle") -> ONE `set` wire with both keys (36 multi-key facts / sets against 1 split, sonnet_long LABEL_FIXES; "Make Rejected a red octagon... a red hexagon" style). Two verbs ("make the Sun huge and then paint it gold", "make Urchin small and paint it purple", "make Business large and colour it navy") stay two wires.
- Several new shapes referenced later are each written `$new` (`$new,$new`, `$new,$new,$new`), also a shape that is not the latest one created (sm-0269 "Dress,$new", sm2-0298 "$new,$new", sl-0012 "$new,$new", sl-0015 `$new` for the first of three). The writer follows this everywhere (fo-0154, fo-0160, fo-0217, fo-0237, fo-0263, fo-0264, fo-0284, fo-0290, fo-0297). Unchanged.
- Copies after a duplicate -> `$new` (fo-0282 "copy it twice, and put the copies below Route": `target=$new`). Unchanged.
- "Is X ...? It should be." gets no extra wire: 3 of 3 in the training sets (sm-0208, sm2-0109, sl-0007). fo-0160, fo-0199 ("Sun should be at the top"), fo-0247, fo-0289, fo-0295 unchanged. (fresh1/sonnet added a `set` for fs-0003; one case against these three.)
- Judgement calls named in the brief: "Is X connected to anything" -> `degree` (not in this file); yes/no superlative -> `extreme` (not asked in this file); conditionals ("If it's not, colour it brown", "If not, swap them", "If not, make Owl large", "If it's above Sea, move it ...") stay plain commands (sm2-0225, 0279, 0399, 0505, sm-0451); group words ("above both of us", "Connect Head to all of them", "Connect Party to all three") -> names or `$new` lists. All unchanged.
- Requests taken back ("Delete Artist, no wait, keep it", "Make King a little bigger? No, actually leave the sizes", "If there's a gray thing below it just delete it. Wait no don't delete it") get no wire. Unchanged.

## 3. Changes (id [kind]: before -> after (reason))

### correction folded into the wire it corrects (3)

- fo-0223 [correction folded]: create Mum shape=rectangle color=red «please add a red rectangle named Mum to the left of Dad» + set target=$new color=pink «actualy make it pink» -> ONE create Mum color=pink, span «please add a red rectangle named Mum to the left of Dad. actualy make it pink» (trigger «add» kept)  (reason: 5 of 5 corrections in the training data fold; the sentence "actualy make it pink, red looks angry" directly follows the request)
- fo-0250 [correction folded]: create count=2 shape=circle size=small color=lime below Secretary «please add two small lime circles below Secretary» + set target=$new shape=square «actually make them squares» -> ONE create shape=square, span «please add two small lime circles below Secretary. Hmm, actually make them squares»  (reason: same; "Hmm, actually make them squares" directly follows)
- fo-0217 [correction folded]: create Music shape=circle color=orange «an orange one named Music above it» + set target=$new shape=star «Music should be a star» -> create Music shape=star color=orange (span unchanged); set wire removed  (reason: "Hmm Music should be a star actually" corrects the circle just asked for; as in sm-0004 the connect wire in between does not stop the fold, and the span of the create stays)

### one verb, two attributes (1)

- fo-0188 [one set wire]: set Rain color=blue «Make Rain blue» + set Rain shape=triangle «and a triangle» -> ONE set Rain color=blue shape=triangle, span «Make Rain blue and a triangle», trigger «Make»  (reason: one request, one wire, one span; the second span «and a triangle» had no verb of its own)

## 4. Open cases (no clear majority; left as written)

- Statements of a canvas place that describe the existing diagram, not a request: fo-0178 "Principal is at the top and the three department boxes ... are at the bottom", fo-0243 "Business is in the centre", fo-0264 "Weather is in the middle already", fo-0217 "Party is the middle", fo-0290 "Me is the centre", fo-0184 "Brain is the center node". No wire in any of them. fresh1/sonnet turned 13 such statements into `move`, but my own count over the five training sets of "X is / sits / stays in|at|on the <place>" gives 18 with a move wire against 19 without (e.g. sm-0134, sm2-0078, sl-0020, sl-0051 without; sm-0254, sl-0015 with). No majority, so none added. If the coordinator decides for `move`, fo-0178 gets two (Principal top; Maths,Science,Art bottom) and the mind-map centres one each (center).
- fo-0169 "What is connected to Hobbies? I want Music, Sport and Art all on it.": read as an expectation (like "There should be four"), no wire; it could also be `connect` Hobbies to Music,Sport,Art (direction not stated).
- fo-0235 "Could you check whether Granny is a circle? I want all the grandparents as circles.": no `set` for the wish (names has only Granny among grandparents); fo-0087 in opus_a wires the analogous "I want Wake to be one as well" only because the target is named.
- fo-0168 "Can you swap Mom and Uncle? Mom should be on the left.": the second sentence describes the result of the swap; no wire. fo-0288 "Finance should be on the right" likewise.
- fo-0154 "Draw a line between Dad and Mom" is `from=$new to=$new` and "Arrows from Dad and Mom to Me" is `from=$new,$new to=$new` (three created shapes, each written `$new`, as in sl-0015); how the reader resolves several `$new` in one wire is the scorer's matter, the written form follows the training data.
- fo-0156 "Both should be arrows pointing down": direction of an arrow is not in the legend; no wire.
- fo-0243 / fo-0285 "make Business large and colour it navy", "Make the Sun really big, like huge, and colour it yellow": two verbs, written as two `set` wires (no counter-example); left.

## 5. Check of the untouched fields

For all 150 lines: `id`, `domain`, `names` and `text` equal the lines of `opus_b/texts/texts_01.jsonl` (compared as parsed JSON and the `text` strings also as UTF-8 bytes): identical. Also verified by script after the edit: every `span` is a substring of `text`, every `trigger` a substring of its span, wires in text order.
