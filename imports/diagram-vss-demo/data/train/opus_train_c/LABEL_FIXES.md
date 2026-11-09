# Label fixes for the training set `opus_train_c` (300 messages, ot-0601 .. ot-0900)

Label checker: Sonnet agent. File: `msg_01.jsonl`. Rules: `training/sketch/LABEL_CONVENTIONS.md`, `training/sketch/llm_train/TRAIN_MSG_SPEC.md`, `training/sketch/llm_bench/SPEC.md`; rulings of `fresh1/*/LABEL_FIXES.md` and `fresh2/opus_*/LABEL_FIXES.md` (only these files of fresh1/fresh2 were opened); majorities counted by script on the corrected training sets `sonnet_msg`, `haiku_msg`, `sonnet_msg2`, `haiku_msg2`, `sonnet_long`.

No reader code, model, result document or score was opened. Nothing was committed or staged. `id`, `domain`, `names` and `text` were not changed (checked byte for byte against `texts/texts_01.jsonl`, section 5).

## 1. Counts

- Messages: 300. Wires before: 1059. Wires now: 1059 (changed 5, added 0, removed 0). Messages with a change: 5 (ot-0646, ot-0725, ot-0745, ot-0896, ot-0897).

| kind of fix | changed | added | removed |
|---|---|---|---|
| name after a rename (new name used) | 1 | 0 | 0 |
| canvas statement -> move | 1 | 0 | 0 |
| "X is Y" in a verbless list -> fact | 3 | 0 | 0 |

All 300 messages were read in full. The writer's wires follow the conventions almost everywhere: chains and closing connects (ot-0705, ot-0761), several-to-one / one-to-several as ONE connect, `$new` for created shapes, `extreme` for superlative questions, `arrow: none` exactly where the span says line(s) and not arrow (script check both ways: only ot-0613 "plain lines, no arrowheads" and the elliptical ot-0894 "also from Entrance to Stage, dashed too" differ from the pure word rule, both fine), self-corrections folded to the final value (ot-0620, ot-0699, ot-0731, ot-0837, ot-0852, ot-0860, ot-0879), taken-back requests without a wire (ot-0636, ot-0697, ot-0731, ot-0791, ot-0891), "should be" as a command, `degree` for "Is X connected to anything / how many links", `neighbors` only for "what is linked to X". Script checks on the whole file: legend keys per action, value vocabularies, count only 2+, spans inside the text in order, triggers inside spans, names in `names`, `$new` or a mention: 0 failures.

## 2. Changes (id [kind]: before -> after (reason))

- ot-0745 [name after a rename]: check target=Crown position=rightOf anchor=Model «is Crown to the right of Cast» -> anchor=Cast  (reason: "Rename Model to Cast. Then, is Crown to the right of Cast?" - the text writes the new name; 16 of 17 in training, fresh1/sonnet ruling, sm2-0240).
- ot-0646 [canvas statement -> move]: fact Donations position=topLeft «Donations is at the top left already» [is] -> command move Donations position=topLeft, trigger «is at»  (reason: 0 facts with a canvas place and no anchor in the five training sets, every fact with a position carries an anchor; fresh1/sonnet ruling: statement of a canvas place = move, 22 against 0; same as fresh2/opus_c fo-0374).
- ot-0725 [verbless list -> fact]: set Food size=medium «Food is medium» [Food] -> fact Food size=medium, trigger «is»  (reason: "X is <attribute>" is a fact; facts with is/are outnumber sets 100+ to 5 per set in the training sets; "should be" is the command form).
- ot-0897 [verbless list -> fact]: set Fire color=red «Fire is red» [Fire] -> fact Fire color=red, trigger «is»  (reason: same; the neighbours "Police blue, Health green" stay `set`: no "is", a verbless ellipsis).
- ot-0896 [verbless list -> fact]: set Sorter color=orange shape=hexagon «Sorter's an orange hexagon» -> fact (same keys), trigger «Sorter's» kept  (reason: "'s" is "is"; "X is a ... hexagon" is a fact, as ot-0859 "Crm is a large blue square" in this file; no precedent for "'s a" in the training sets, so the ruling is by analogy).

## 3. Judgement calls checked and left as written (a clear majority backs the writer)

- Verbless attribute lists wired as `set` with the leading name as trigger ("Roads gray", "Tuesday orange", "Water large"): 136 of 137 in the existing data (LABEL_CONVENTIONS). Kept in all the cases without a verb "is".
- "X should be / needs to be / must be Y" -> set / move, never a fact (69 spans: 26 set, 11 move, 29 rule, 0 facts): ot-0603, 0654, 0669, 0743, 0751, 0766 (the second sentence "it should be an ellipse" is `set`, the first "Referral is a rectangle" a `fact`), and many more.
- "Is X ...? It should be / Should be." gets no extra wire (3 of 3: sm-0208, sm2-0109, sl-0007): ot-0745, 0899, 0694, 0834, 0766 and others.
- Statement of a relative position with a verb -> `fact` with position + anchor (ot-0656, 0846, 0887); verbless "Pantry right of Sort" -> `move` (111 of 113).
- Conditionals ("If not, ...", "If they are, cut ...", "If yes, ...") as plain commands: ot-0663, 0667, 0686, 0702, 0749, 0867, 0890 (sm2-0225, 0279, 0399, 0505, sm-0451).
- Yes/no superlative -> `extreme` with the superlative only: ot-0741 "Is Speaker1 the leftmost", ot-0756, ot-0797, ot-0872 (95 against 2).
- "Is X connected to anything / how many links" -> `degree`: ot-0677, 0679, 0860 "Is Social linked to anything at all", ot-0707, 0761, 0826, 0848 ("how many shapes are connected to X" 4 of 4).
- Chain of "A to B, B to C" -> one chain; loop -> chain + separate closing connect (ot-0705, 0761, 0834).
- Copies after a duplicate -> `$new`, original in front (ot-0813 "Robot1,Robot2,$new").
- "next to X" in a question -> list position near (ot-0636); in a command -> position near (ot-0624).
- Rename follow-ups: only ot-0745 used the new name wrongly; ot-0605, 0625, 0660, 0698, 0899 have no later wire naming the renamed shape.

## 4. Open cases (no clear majority; left as written)

1. ot-0702 "Is Notify the last step on the right?": written `check` position=right. Could be read as the yes/no superlative `extreme` rightmost; "last step on the right" is not a superlative word, and training has check wires for canvas places (sl-0056 "in the center"). Left.
2. ot-0708 "Is Wash connected to anything besides Mix?": `neighbors` target=$new (the question is not "connected to anything"; `degree` would lose "besides Mix"). Left. The same pattern in opus_train_d ot-1114.
3. ot-0731 "Put Seating in the middle of the trucks.": no wire (no clear target: between which two trucks, or center?). A move of Seating is probably intended. Left.
4. ot-0771 "make both of them red diamonds. Hmm, make Cool a red triangle instead": a partial correction (only Cool changes). Written as two wires (Cook,Cool diamond + Cool triangle). Folding would give Cook diamond and Cool triangle; the five known corrections in training are all full corrections of one wire. Left.
5. ot-0894 "Stage stays at the top, but make it a large purple rectangle": no move wire for "stays at the top" (fresh2/opus_b counted 18 against 19 for such unchanged-place statements as move). Left.
6. Wishes after a question or statement, no wire: ot-0899 "I want Apply on the left", ot-0766 "I want Dna at the very bottom", ot-0800 "I'd like OnTime to be the biggest", ot-0844 "I want Theatres on the right". Same pattern as fresh2/opus_d fo-0479 (open there too).
7. Verbless connect triggers: ot-0677 "Portal to Doctor" [Portal to], ot-0809 "Loading to Kitchen" [Loading to], ot-0824, ot-0826, ot-0897 and others use "Name to"; ot-0710 "Nurse to Gp" likewise. Not settled (56 "Name to" against 40 name only in the training sets).
8. ot-0761 "Pos to Stock. Stock goes to Reorder when it's low. Reorder to Supplier, Supplier to Receive": one chain with one long span across sentences (the sentences state one hop each). Left, as fresh2/opus_d open case 11 in the other direction.
9. ot-0888 "Connect Safety to each of the other four with plain lines. Hmm, actually connect them all to each other": one connect pairing=all, arrow=none (the correction folds into the wire; "plain lines" stays from the corrected request).
10. ot-0850 "App and Card both talk to Gate. Gate talks to Backend. Two-way arrows for all of those": two connects with arrow=both (the arrow phrase comes from a later sentence); a chain is the other reading.

## 5. Checks (script, after the changes)

- 300 messages, 1059 wires; `id`, `domain`, `names`, `text` identical to `opus_train_c/texts/texts_01.jsonl` (compared as parsed JSON and the `text` strings as UTF-8 bytes): 0 differences. The file keeps its exact format (every line is the `json.dumps(..., ensure_ascii=False)` of its parsed form).
- Every span is a substring of its text, every trigger a substring of its span, spans in text order, no overlaps: 0 failures. All named targets / anchors are in `names`, `$new` or a mention (only ot-0745 "Cast", the new name of a renamed shape).
