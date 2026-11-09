# Label fixes for the fresh test set `fresh2/opus_a` (150 messages, fo-0001 .. fo-0150)

Label checker: Sonnet agent. File: `batch_01.jsonl`. Rules: `training/sketch/LABEL_CONVENTIONS.md`, `training/sketch/llm_train/TRAIN_MSG_SPEC.md`, `training/sketch/llm_bench/SPEC.md`; majorities counted by script on the corrected training sets `sonnet_msg`, `haiku_msg`, `sonnet_msg2`, `haiku_msg2`, `sonnet_long` (2640 messages).

No reader code, model, result document or score was opened. Nothing was committed or staged. `id`, `domain`, `names` and `text` were not changed (checked byte for byte against `opus_a/texts/texts_01.jsonl`, see section 5).

## 1. Counts

- Messages: 150. Wires before: 514. Wires now: 514 (changed 3, added 0, removed 0). Messages with a change: 2 (fo-0029, fo-0042).

| kind of fix | changed | added | removed |
|---|---|---|---|
| name after a rename (new name used) | 3 | 0 | 0 |

The writer's wires already followed the conventions almost everywhere: chains and closing connects, several-to-one and one-to-several as ONE connect, `$new` for created shapes, `extreme` for superlative yes/no questions, `degree` for "Is X connected to anything", `arrow: "none"` exactly where the text says line/lines (script check: every connect whose span has "line(s)" and no "arrow" has `arrow: none`, and the reverse), spans inside the text, in order, triggers inside spans.

## 2. Rulings used

- After `rename A to B` in the same message, later wires use the name the text writes (B), not the old name (fresh1/sonnet ruling; 16 of 17 existing; sm2-0240). fo-0029 ("Rename it to Core ... create two boxes left of Core"), fo-0042 ("Rename Queue to Buffer ... Buffer feeds Worker1 and Worker2 ... RetryQueue loops back into Buffer").
- Judgement calls named in the brief, checked against the majority and left as the writer wrote them:
  - "Is X connected to anything" -> `degree` (fresh1 count: 2 of 2, sl-0025, sl-0071). fo-0104 unchanged.
  - Yes/no superlative ("Is Vpn the most connected one?", "Is Out the rightmost shape?") -> `extreme` with the superlative only (95 extreme against 2 other in the training sets). fo-0127, fo-0142 unchanged.
  - Conditional commands ("If it is, ... disconnect them", "If not, swap them", "If yes please disconnect") stay plain commands (sm2-0225, 0279, 0399, 0505, sm-0451). fo-0020, 0044, 0090, 0109, 0142 unchanged.
  - Group words resolved to names ("Put Dad above both of us" style, "them", "both of them") -> names comma-joined (LABEL_CONVENTIONS; sm2-0487). Unchanged.
  - Several new shapes as `$new,$new`: not used in this file.
  - "Is X ...? It should be." gets no extra wire: 3 of 3 in the training sets (sm-0208, sm2-0109, sl-0007). fo-0055 (EdgeFw red), fo-0010 ("Should be Footer") unchanged. (fresh1/sonnet added a `set` for fs-0003 "It should be one"; that is one case against these three.)
  - A correction spanning sentences folds into the wire it corrects ("Make Alarm red. No wait, orange" -> orange; "a teal ellipse called Mq. Sorry, make that a teal rectangle" -> rectangle; 5 of 5 corrections in the training sets that I found fold: sm-0004, sm-0205, sm-0230, sm2-0280, sm2-0472). The writer folded all of them here. Unchanged.
  - Requests taken back ("Redo... no, forget it", "get rid of Queue... Actually no, keep Queue", "Which shapes aren't connected to anything? ... Never mind") get no wire. Unchanged.
  - "X goes to A and B goes to C" in one sentence -> one chain; loop = chain + closing connect (fo-0027, fo-0045, fo-0081). Unchanged.

## 3. Changes (id [kind]: before -> after (reason))

- fo-0029 [anchor after a rename]: create name=Legacy position=leftOf anchor=Monolith -> anchor=Core  (reason: the text says "Rename it to Core. And create two boxes left of Core"; after a rename the new name is used, as written in the text)
- fo-0042 [rename follow-up]: connect from=Queue to=Worker1,Worker2 «Buffer feeds Worker1 and Worker2» -> from=Buffer  (reason: Queue was renamed to Buffer one sentence earlier and the text writes Buffer)
- fo-0042 [rename follow-up]: connect from=Retry to=Queue style=dashed «RetryQueue loops back into Buffer with a dashed arrow» -> from=RetryQueue to=Buffer  (reason: Retry -> RetryQueue and Queue -> Buffer were renamed earlier in the message and the text writes the new names)

No wire added or removed.

## 4. Open cases (no clear majority; left as written)

- fo-0023 "Sw1 is connecting to R1 and Sw2 is connecting to R3, with plain lines please": `arrow: none` is on both connects, but the words "plain lines" sit only in the second span. A style shared by two separate connect wires has no precedent in the training sets (the roughly 30 consecutive-connect pairs with a style in one wire all name the style inside that wire's own span). Left on both.
- fo-0020 / fo-0116 / fo-0125 "X should be a tiny star in the bottom right", "Gcs should be an ellipse below Dataflow": one sentence written as `set` + `move` (two wires). Same pattern in all three, no counter-example found; left.
- fo-0147 "Idle go to Dialing, ... Connected go to Ended and Ended return to Idle, it make a cycle": written as two chains (the second ends at Idle, closing the loop). The conventions only fix "A to B, B to C, C to A" inside ONE sentence; here the two sentences are joined by "Also". Left.
- fo-0010 "Which shape is bottommost now? Should be Footer.": no wire for the expectation, per the 3-of-3 above.

## 5. Check of the untouched fields

For all 150 lines: `id`, `domain`, `names` and `text` equal the lines of `opus_a/texts/texts_01.jsonl` (compared as parsed JSON and the `text` strings also as UTF-8 bytes): identical. Also verified by script after the edit: every `span` is a substring of `text`, every `trigger` a substring of its span, wires in text order.
