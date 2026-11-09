# Label fixes for the fresh test set `fresh2/opus_c` (150 messages, fo-0301 .. fo-0450)

Label checker: Sonnet agent. File: `batch_01.jsonl`. Rules: `training/sketch/LABEL_CONVENTIONS.md`, `training/sketch/llm_train/TRAIN_MSG_SPEC.md`; majorities counted by script (own count) on the corrected training sets `sonnet_msg`, `haiku_msg`, `sonnet_msg2`, `haiku_msg2`, `sonnet_long`, or quoted from `fresh1/sonnet/LABEL_FIXES.md`.

No reader code, model, result document or score was opened. Nothing was committed or staged. Ids, domains, names and texts are unchanged (checked byte-identical against `texts/texts_01.jsonl`).

## 1. Counts

- Messages: 150. Wires before: 471. Wires now: 471 (changed 3, added 0, removed 0). Messages with a change: 3.

| kind of fix | changed | added | removed |
|---|---|---|---|
| canvas statement -> move | 1 | 0 | 0 |
| rename follow-up | 1 | 0 | 0 |
| "connected to anything" -> degree | 1 | 0 | 0 |

## 2. Changes

- fo-0374 [canvas statement -> move]: fact target=Reception position=bottom [sits] «Reception sits at the bottom» -> command move target=Reception position=bottom [sits at] same span. Reason: a statement of a canvas place ("X sits / is at the bottom") is a move (fresh1 count: 22 move wires from such statements against 0 facts with a canvas place; every fact with a position carries an anchor). "Waiting is directly above it" in the same message stays a fact (relative position with a verb: 8 of 8 facts).
- fo-0437 [rename follow-up]: move target=mention(notcolor=pink,shape=circle) [put] «Then put it left of Visit» -> target=Organic. Reason: after a rename the follow-up uses the NEW name, also for "it" (sm-0113, sm-0181, sm-0263, sm-0559, sm2-0240: 5 of 5 where the renamed shape was first picked by a mention; the rename wire itself keeps the mention).
- fo-0447 [connected to anything -> degree]: question neighbors target=Persona [connected to anything] «Is Persona connected to anything» -> ask=degree target=Persona. Reason: "is X connected to anything" is degree (sl-0025, sl-0071: 2 of 2); neighbors is for "what is linked to X" / "does anything touch X".

## 3. Judgement calls checked and left as written (a clear majority backs the writer)

- "around X" as position near: fo-0333 (create, count 8, anchor $new). Training: 15 of 15 "around" create/move wires are near (sm-0057, sm-0113, sm-0211, sl-0169 ...).
- Verbless sets / moves with their triggers (fo-0306 "Invoice red", fo-0318 "Doing orange", fo-0409 "Order above Pick", fo-0427 "Checkout below Cart", fo-0368 "Deal at the bottom right"): each has its own span, trigger = leading words (set) or the position phrase (move), as in the existing data.
- Yes/no superlative as extreme: none in this file (fo-0309 and fo-0423 are open superlative questions, already extreme).
- "how many shapes are connected to X" as degree: fo-0335 (4 of 4 in training: sm-0185, sm2-0074, sl-0044, sl-0169).
- "how many arrows" without a target: count kind=edge (fo-0313, fo-0355, fo-0397).
- Conditional commands wired as the plain command (fo-0329, fo-0345, fo-0349, fo-0371, fo-0372, fo-0385, fo-0414): same as sm2-0225, 0279, 0399, 0505, sm-0451.
- "should be" as a command: set / move in every case (fo-0312, fo-0325, fo-0336, fo-0345, fo-0346, fo-0421 ...), 0 facts, as in the 69-span count (26 set, 11 move, 29 rule).
- "is" as a fact: fo-0322, fo-0335, fo-0375, fo-0379, fo-0390, fo-0398, fo-0400, fo-0415, fo-0418, fo-0440 (attribute or relative position with a verb); fo-0376 "Mfa is between Login and Home" fact with position between.
- Self-corrections with one span (fo-0308, fo-0318, fo-0328, fo-0340 ... fo-0403, fo-0441, fo-0446): the final value; taken-back requests (fo-0308 "Delete End ... no, keep it", fo-0313 label, fo-0344, fo-0368 Nurture to Call, fo-0397 grid, fo-0427 upsell) have no wire.
- Group words resolved to names (fo-0328 "both bedrooms" -> Bed1,Bed2; fo-0430 "the stores" -> Store1,Store2,Store3; fo-0339 "them" -> the four desks): see open case 3.
- Loops and chains (fo-0310, fo-0323, fo-0340, fo-0355, fo-0411, fo-0433, fo-0446): chain, several-to-one and one-to-several as ONE connect, as in the data.

## 4. Open cases (no clear majority; left as written)

1. Verbless connect triggers: fo-0380 "Sea dashed to Rail" [Sea], fo-0397 "Cart to Pay, Pay to Receipt" [Cart], fo-0428 "Fail to Ok, dashed arrow" [Fail], fo-0441 "Check to Approve and Approve to End" [Check]. Training count (own, connect wires whose trigger is a name): 56 "Name to" against 40 name only (and whole-phrase "Test to Deploy" triggers); not settled.
2. Statement of a canvas place that is also a comment: fo-0303 "The Lobby box in the middle is fine as it is" (no wire; the statement might be a move to center). 1 case.
3. Plural description as target without shape or colour ("the stores", "both bedrooms"): written as comma-joined names (fo-0328, fo-0430); training has sl-0169 "the three animals around it" -> names, but no count.
4. fo-0359 "the two blue squares should be the same size as the red one... make the blue ones large I guess": only the explicit `set size=large`; the "same size as" part cannot be expressed.
5. fo-0327 "Bill before Ship, not after. Swap them.": the ordering sentence has no wire, only the swap.
6. fo-0414 "Release hangs off Done with a dashed line": direction of the link (from Done to Release) is inferred from "hangs off"; fo-0423 "Unsub hangs below Subscribe" is a move.
7. fo-0333 "Arrange the circles in a circle": `mention(quantifier=all,shape=circle)` (the eight new circles plus any existing circle); `$new` would exclude existing circles. Not settled for a create with a count followed by "the circles".

## 5. Checks (script, after the changes)

- 150 messages, 471 wires; id, domain, names and text identical to `opus_c/texts/texts_01.jsonl` (0 differences).
- Every span is a substring of its text, every trigger a substring of its span, spans in text order, no overlaps: 0 failures.
- All named targets / anchors are in `names`, `$new` or a mention (only fo-0437 "Organic", the new name of a renamed shape).
