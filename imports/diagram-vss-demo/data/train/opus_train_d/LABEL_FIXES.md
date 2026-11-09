# Label fixes for the training set `opus_train_d` (300 messages, ot-0901 .. ot-1200)

Label checker: Sonnet agent. File: `msg_01.jsonl`. Rules: `training/sketch/LABEL_CONVENTIONS.md`, `training/sketch/llm_train/TRAIN_MSG_SPEC.md`, `training/sketch/llm_bench/SPEC.md`; rulings of `fresh1/*/LABEL_FIXES.md` and `fresh2/opus_*/LABEL_FIXES.md` (only these files of fresh1/fresh2 were opened); majorities counted by script on the corrected training sets `sonnet_msg`, `haiku_msg`, `sonnet_msg2`, `haiku_msg2`, `sonnet_long`.

No reader code, model, result document or score was opened. Nothing was committed or staged. `id`, `domain`, `names` and `text` were not changed (checked byte for byte against `texts/texts_01.jsonl`, section 5).

## 1. Counts

- Messages: 300. Wires before: 1014. Wires now: 1015 (changed 16, added 1, removed 0). Messages with a change: 16 (ot-0903, 0995, 1050, 1098, 1106, 1109, 1119, 1141, 1150, 1163, 1166, 1172, 1185, 1188, 1195, 1199; ot-1109 holds the added wire, ot-1119 the rename, ot-1188 two changes).

| kind of fix | changed | added | removed |
|---|---|---|---|
| canvas statement -> move | 14 | 0 | 0 |
| verbless relative position -> move | 1 | 0 | 0 |
| name after a rename (new name used) | 1 | 0 | 0 |
| missing yes/no superlative question | 0 | 1 | 0 |

All 300 messages were read in full. The writer's wires follow the conventions in most respects: `$new` for created shapes (also for a shape that is not the latest created, as sl-0015), chains and closing connects (ot-1056, 1058), one connect for several-to-one / one-to-several, `extreme` for superlative questions including the yes/no and "Hmm, I mean, which is topmost?" forms (ot-1005, 1125, 1133, 1176, 1199 fold to one wire), `degree` for "Is X connected to anything" (ot-1002, 1141) and "how many arrows/links", `arrow: none` exactly where the span says line(s) and not arrow (script check both ways: 0 differences), corrections folded (ot-0948, 1031, 1049, 1066, 1185, 1102, 1124), taken-back requests without a wire, "X is <attribute>" as `fact` (ot-0999, 1018, 1064, 1066, 1116, 1146, 1151, 1165, 1173: 9 messages, all consistent), "should be / must be / goes" as commands. Script checks on the whole file: legend keys per action, value vocabularies, count only 2+, spans inside the text in order, triggers inside spans, names in `names`, `$new` or a mention: 0 failures.

## 2. Changes (id [kind]: before -> after (reason))

### canvas statement -> move (14)

Rule: a statement that puts a shape at a canvas place ("X is at the top", "is in the center", "stays in the center") is a `move` to the place, not a `fact` (0 facts with a canvas place and no anchor in the five training sets; fresh1/sonnet: 22 move wires from such statements against 0 facts; fresh2/opus_c fo-0374). Spans and triggers stay; only type and action change.

- ot-0903 «The Shed is in the top left corner» -> move Shed topLeft.
- ot-0995 «The Pitch is in the center» -> move Pitch center.
- ot-1050 «The players are in the Village, which is at the bottom left» -> move Village bottomLeft (the Forest sentence "The Forest is right of the Village" stays a `fact`: relative position with a verb, 8 of 8).
- ot-1098 «The Port is at the bottom» -> move Port bottom ("The Volcano is huge" stays a fact).
- ot-1106 «Tower is at the top right» -> move Tower topRight.
- ot-1141 «The Platform is in the middle» -> move Platform center.
- ot-1150 «Start and Finish are at the same spot, bottom left» -> move Start,Finish bottomLeft.
- ot-1163 «The Meeting room is at the top» -> move Meeting top.
- ot-1166 «The Cafe is near the entrance, at the bottom» -> move Cafe bottom, trigger «is» -> «at the bottom» (the position phrase, as for the other verbless moves).
- ot-1172 «Start and Finish are at the bottom» -> move Start,Finish bottom.
- ot-1185 «The Farm is at the bottom» -> move Farm bottom.
- ot-1188 «Lead and Follow are in the center» -> move Lead,Follow center.
- ot-1195 «The Door is at the bottom right» -> move Door bottomRight.
- ot-1199 «The Oak stays in the center» -> move Oak center.

### verbless relative position -> move (1)

- ot-1188 [layout phrase]: fact Lead leftOf Follow «Lead left of Follow» -> move Lead leftOf Follow  (reason: a verbless layout phrase "X left of Y" is `move`: 111 of 113 in the training sets, fresh1/sonnet ruling; the verb "are in the center" of the previous sentence is not repeated).

### name after a rename (1)

- ot-1119 [rename follow-up]: neighbors target=Bills «Then what's connected to it» -> target=Expenses  (reason: "Rename Bills to Expenses. Then what's connected to it?" - after a rename the new name is used, also for "it" (16 of 17 in training; sm-0113, sm-0181, sm-0263, sm-0559, sm2-0240; fresh2/opus_c fo-0437, opus_d fo-0574). ot-1012 "rename Park to Garden" and ot-1160 "rename Week6 to Final" have no later wire naming the shape.)

### missing yes/no superlative (1, added)

- ot-1109 [missing question]: added question extreme superlative=rightmost, span «Is Dance the rightmost», trigger «rightmost», between the connect and the move  (reason: "Is Dance the rightmost? I'd like it to be, so move it to the right edge." - the question is stated; yes/no superlative -> `extreme` with the superlative only, 95 against 2; the writer wired only the move. fresh1/sonnet added 3 such wires).

## 3. Judgement calls checked and left as written (a clear majority backs the writer)

- "should be / must be / goes / needs to be" -> set / move (ot-0907, 0927, 0950, 1012, 1019 "must be", 1101, 1141 "should be a red triangle", 1177): 0 facts in the 69-span count.
- Statement of a relative position with a verb -> `fact` with position + anchor: ot-0927 "The Attic sits under it", ot-0965 "The Court is below the Core", ot-1002 "The OldTown sits left of the River", ot-1074, ot-1123, ot-1050 "The Forest is right of the Village" (8 of 8 + 4 of 4 "sits").
- "Is X ...? It should be." gets no extra wire (3 of 3): ot-1034, 1116, 1188 and others. "The Core stays where it is" (ot-0965) and "Gk is fine" style comments: no wire.
- Self-corrections with one span (ot-0948 "Actually make that arrow two-way", ot-1031, ot-1049 gold, ot-1066 orange, ot-1102 cyan, ot-1124 chain with `arrow: none`, ot-1185 dashed -> dotted, ot-1199 black) fold into the wire they correct; ot-0937 "plain is fine" and ot-0971 "just make them a row" keep the final request only.
- Conditionals ("If not, ...", "if so", "If they are, cut that link", "Connect it if not", "if it isn't") as plain commands: ot-1013, 1071, 1131, 1144, 1145, 1176, 1194 (sm2-0225, 0279, 0399, 0505, sm-0451).
- Copies after a duplicate -> `$new`: ot-0922 "Chair1,$new", ot-0959, ot-1072 "Bench,$new", ot-1184 "$new" (the copies only).
- "next to X" in a question -> list near (ot-0972, ot-1009, ot-0995); in commands -> position near.
- "how many arrows/lines are there / on the board" without a target -> count kind=edge (ot-0934, 1015, 1037, 1050, 1125); "how many arrows leave X / does X have" -> degree.
- "Is X the most connected / the topmost / ...?" -> extreme: ot-1005, 1125, 1133, 1199 (the question folds with the following "just tell me which one").

## 4. Open cases (no clear majority; left as written)

1. ot-1114 "Anything connected to the Synth besides the Master?": `neighbors` target=Synth (the same pattern as opus_train_c ot-0708); `degree` would lose "besides the Master".
2. ot-1000 / ot-0910 / ot-1062: `$new` as anchor or target for a shape created earlier in the message but not the latest one created (ot-1000 "Is the Desk below the Window?" with Shelf created after Window; ot-0910 "Link the Lobby to the Atrium, the Cafe and the Stair"; ot-1062 "Connect Parking to the Library"). Same form as fresh2/opus_b open case (sl-0015, sm-0269); how the reader resolves it is the scorer's matter.
3. ot-1052 "Arrange the circles in a circle" after creating four circles: `mention(quantifier=all,shape=circle)` (any existing circle included); `$new` would exclude existing circles. Not settled (fresh2/opus_c open case 7).
4. Plural description without shape or colour as target: "the defenders" / "the midfielders" -> D1,D2,D3 / M1,M2 (ot-1082), "the others" -> names (ot-1094, ot-1188 "the four others"), "the booths" (ot-1195); written as comma-joined names, no count in training besides sl-0169.
5. No wire: ot-1074 "Is the Wall behind both?" (z-order question, not expressible); ot-1116 "The planets are in a row right of the Sun" (a description followed by its own arrange request).
6. ot-0955 / ot-1013 / ot-1028 / ot-1138 / ot-1167: triggers that repeat the whole question («is Rococo pink», «Is Sleep a circle») instead of one word; the trigger is inside the span, so left (a check question has no single verb word in these).
7. Verbless connect triggers: ot-0905 [a dashed one], ot-1137 [Room3 to], ot-1142 [Blue1 to], ot-1153 [Soul to], and others. Not settled (56 "Name to" against 40 name only).
8. ot-1071 / ot-1143 "the first circle" -> `mention(recency=oldest,shape=circle)`, as in the training sets; no conflict.
9. ot-1136 "Then duplicate it, we have two closets": duplicate without count (one copy gives two); `count` only when the text says 2 or more.
10. ot-1157 "make it a big pink heart, well, a pink star ... Make it large too": `set` pink star + `set` size large as two wires (the second has its own verb); "big" in the first request is not wired as a size (the correction replaced the whole item).

## 5. Checks (script, after the changes)

- 300 messages, 1015 wires; `id`, `domain`, `names`, `text` identical to `opus_train_d/texts/texts_01.jsonl` (compared as parsed JSON and the `text` strings as UTF-8 bytes): 0 differences. The file keeps its exact format (every line is the `json.dumps(..., ensure_ascii=False)` of its parsed form).
- Every span is a substring of its text, every trigger a substring of its span, spans in text order, no overlaps: 0 failures. All named targets / anchors are in `names`, `$new` or a mention (only ot-1119 "Expenses", the new name of a renamed shape).
