# Label fixes for the fresh test set `fresh2/opus_d` (150 messages, fo-0451 .. fo-0600)

Label checker: Sonnet agent. File: `batch_01.jsonl`. Rules: `training/sketch/LABEL_CONVENTIONS.md`, `training/sketch/llm_train/TRAIN_MSG_SPEC.md`; majorities counted by script (own count) on the corrected training sets `sonnet_msg`, `haiku_msg`, `sonnet_msg2`, `haiku_msg2`, `sonnet_long`, or quoted from `fresh1/sonnet/LABEL_FIXES.md`.

No reader code, model, result document or score was opened. Nothing was committed or staged. Ids, domains, names and texts are unchanged (checked byte-identical against `texts/texts_01.jsonl`).

## 1. Counts

- Messages: 150. Wires before: 455. Wires now: 456 (changed 3, added 1, removed 0). Messages with a change: 4.

| kind of fix | changed | added | removed |
|---|---|---|---|
| "linked to anything" -> degree | 1 | 0 | 0 |
| trigger of a tag question | 1 | 0 | 0 |
| rename follow-up | 1 | 0 | 0 |
| "should sit" after a question -> move | 0 | 1 | 0 |

## 2. Changes

- fo-0460 [linked to anything -> degree]: question neighbors target=Closing [linked to] «Is Closing linked to anything yet» -> ask=degree target=Closing. Reason: "is X connected / linked to anything" is degree (sl-0025, sl-0071: 2 of 2); neighbors is for "what is linked to X" / "does anything touch X".
- fo-0498 [trigger]: check target=Screen position=above anchor=Stage, trigger [right] «Screen is above Stage, right» -> trigger [above]. Reason: the trigger names the question kind; the tag "right" is not it. Check-position questions use the position word (above 25, near 29, between 22, left of 14, ...), and tag-question extremes use the superlative (sm2-0575, sl-0007). The wire args are unchanged.

- fo-0574 [rename follow-up]: set target=Mentor shape=star [make] «make it a star» -> target=Wizard. Reason: after "rename Mentor to Wizard" the follow-up (also a pronoun) uses the NEW name (sm-0113, sm-0181, sm-0263, sm-0559, sm2-0240; fresh1/sonnet fixed 7 such wires).
- fo-0534 [should sit -> move, added]: (no wire) -> command move target=Moss position=below anchor=Fern [sit under] «It should sit under it». Reason: "X should be / sit ..." is a request, never a fact (69 'should be / must / needs to be' spans in training: 26 set, 11 move, 29 rule, 0 facts); the same ruling added fs-0003 in fresh1 ("It should be one" after a check question). The sentence has its own content (sit under), unlike fo-0580 (open case 8).

## 3. Judgement calls checked and left as written (a clear majority backs the writer)

- "around X" as position near: fo-0542 (create, 15 of 15 "around" create/move wires are near: sm-0057, sm-0113, sm-0211, sl-0169 ...); fo-0528 "around Hub" is dropped inside an arrange (sm-0134, sm-0283: 6 of 6 arrange spans with "around" carry target + layout only). "beside / next to X" as near: fo-0539, fo-0549.
- "how many shapes / things are connected / linked to X", "how many arrows does X have / touch X" as degree: fo-0462, fo-0482, fo-0497, fo-0521 (4 of 4 in training: sm-0185, sm2-0074, sl-0044, sl-0169). "how many arrows are there" without a target: count kind=edge (fo-0453).
- Yes/no superlative as extreme: fo-0484 "whats the biggest thing on here, is it Tank?", fo-0494 "whether Question is the smallest shape" (95 extreme against 2 other in training).
- "is Y reachable from X" as path: fo-0457 (path from Spawn to Cave); "what can be reached from X" as reachable: fo-0482.
- Conditional commands wired as the plain command (fo-0453 "either way", fo-0504, fo-0507 "If not, add a dotted arrow"): same as sm2-0225, 0279, 0399, 0505, sm-0451.
- Self-corrections with one span (fo-0457 black -> navy, fo-0467 "called... no, just", fo-0472, fo-0524 three -> five, fo-0492 cross -> square) and taken-back requests (fo-0487 "Set Decoder to whatever Encoder is... never mind", fo-0503 "Is Flip lined up with Pan? Never mind"): final value only, no wire for the withdrawn part.
- Group words resolved to names: fo-0472 "both of them" -> Opening,Finale; fo-0477 "the bedrooms" -> Bed1,Bed2; fo-0528 "all four of them" -> Desert,Jungle,Snow,Ocean; fo-0508 "all the tables" -> Table1..Table4 (see open case 2).
- "X is ..." as fact: fo-0398, fo-0500, fo-0502 (attribute); "should be / needs to be" as a command (fo-0456, fo-0457, fo-0513).
- A pronoun after a rename keeping the original mention: none in this file (fo-0483 is a plain rename).
- Loops and chains: fo-0489 (pairing next), fo-0497, fo-0502 (loop closed by a second chain, no repeated name), fo-0523 (Station, Loop, Junction chain), one connect for several-to-one / one-to-several (fo-0475, fo-0516, fo-0520).

## 4. Open cases (no clear majority; left as written)

1. Verbless connect triggers: fo-0497 "Milk to Foam, and Foam into Cup too" [Milk to], fo-0503 "Batter to Pan as well" [Batter to], fo-0523 "then Junction to both Yard and Station" [Junction to], fo-0525 "arrow from Dog to Ball" [arrow] / "another from Kid to Ball" [another]. Training count (own, connect wires whose trigger is a name): 56 "Name to" against 40 name only; not settled.
2. Plural description as target without shape or colour ("the bedrooms", "all the tables"): comma-joined names (training sl-0169 "the three animals around it" -> names, no count).
3. fo-0528 "Hub is the middle.": a statement of a canvas place (would be move to center by the fresh1 ruling) but phrased as structure before "Desert ... around Hub"; no wire. 1 case. Also "Is everything connected now?" (no wire, not expressible).
4. fo-0479 "I want it to read left to right and Invite should be first.": no wire; could be a move of Invite to the left.
5. fo-0489 "Does Bean go back to Carrot after that?": written as `connected` (Bean, Carrot); `path` from Bean to Carrot is the other reading.
6. fo-0513 "how many scenes don't have any arrows": not expressible in the legend, no wire.
7. fo-0512 "there should be an arrow from Wash to Soak and one from Soak to Cook ... Can you add them?": one chain wire with one long span (the request is the closing "add them").
8. fo-0580 "Is Rest between Grill and Slice? It should be.": "It should be" has no content of its own (the place is only in the question), so no wire; the alternative is a move between Grill,Slice. Answer expectations such as fo-0552 "should be." (a path) are likewise not wired.
9. fo-0557 "Do both bases connect to Mid?": one `connected` wire with target "RedBase,BlueBase"; the alternative is two wires. No training count for a comma-joined target of `connected`.
10. fo-0543 "Put the three days in a column. hmm the column looks weird. undo that. Instead put them in a row.": three wires (arrange column, undo, arrange row); the undo is a stated action, not a withdrawn request. 0 training cases.
11. fo-0567 chains stated one hop per sentence (connect Lunch to Fight. Then Fight goes to Office. Office to Home): separate connects, as the text states separate requests (fresh1 open case 8).

## 5. Checks (script, after the changes)

- 150 messages, 455 wires; id, domain, names and text identical to `opus_d/texts/texts_01.jsonl` (0 differences).
- Every span is a substring of its text, every trigger a substring of its span, spans in text order, no overlaps: 0 failures.
- All named targets / anchors are in `names`, `$new` or a mention.
