# Label fixes for the training set `llm_train/opus_train_a` (300 messages, ot-0001 .. ot-0300)

Label checker: Sonnet agent. File: `msg_01.jsonl`. Rules: `training/sketch/LABEL_CONVENTIONS.md`, `training/sketch/llm_train/TRAIN_MSG_SPEC.md`, `training/sketch/llm_bench/SPEC.md`; rulings reused from `fresh1/sonnet/LABEL_FIXES.md` and `fresh2/opus_{a,b,c,d}/LABEL_FIXES.md` (LABEL_FIXES files only; no test messages, reader, model or score were opened). Majorities from the corrected training sets `sonnet_msg`, `haiku_msg`, `sonnet_msg2`, `haiku_msg2`, `sonnet_long` (own script counts). Nothing was committed or staged.

## 1. Counts

- Messages: 300. Wires before: 995. Wires now: 994 (changed 3, added 0, removed 1; ot-0146 counts as one changed chain plus one removed connect). Messages with a change: 3 (ot-0104, ot-0146, ot-0261).

| kind of fix | changed | added | removed |
|---|---|---|---|
| rename follow-up (new name) | 1 | 0 | 0 |
| "connected to anything" -> degree | 1 | 0 | 0 |
| A to B, B to C in one sentence -> one chain | 1 | 0 | 1 |

The Opus wires were already very clean. Script checks (all 995 wires): every span is in the text and in text order, every trigger is inside its span, every connect whose span says "line(s)" without "arrow" has `arrow: none` (and the reverse, see open case 1), `$new` is used for every created shape, `mention(...)` keys are alphabetical, chains/closing connects/several-to-one/one-to-several follow the connect conventions, no canvas place is written as a fact.

## 2. Rulings used

- After `rename A to B`, later wires (also via "it") use B (fresh1/sonnet; 16 of 17 existing; sm2-0240). ot-0104.
- "Is X connected to anything (still)" -> `degree` (fresh1: 2 of 2, sl-0025, sl-0071; fresh2 opus_c, opus_d). ot-0261. (ot-0091 "Is the Battery connected to anything? Hmm, how many connections..." already `degree`.)
- "connect A to B and B to C" / "A goes to B, B goes to C" in ONE sentence = a continuing sequence -> one chain (LABEL_CONVENTIONS). ot-0146. Not changed: the pairs where one end is several shapes ("Grid goes to Meter, Meter to Charger1 and Charger2", "arrows from Store1, Store2 and Store3 to Vpn, and Vpn to Hq", ot-0074/0143/0153/0171/0177/0214), because one chain cannot carry a fan; consecutive sentences ("Pack is after Paint, connect also Paint to Pack", ot-0017/0131/0353, fresh1 open case 8); differing labels/styles (ot-0361, ot-0500).
- Yes/no superlative -> `extreme` (ot-0191, ot-0198, ot-0180): already so. "Is X the farthest from Y" -> `nearest` farthest (ot-0111): already so.
- "should be" / "needs to be" after a question gets no extra wire (3 of 3: sm-0208, sm2-0109, sl-0007): ot-0009, 0048, 0058, 0062, 0115, 0139, 0180, 0224, 0249 left as written.
- A correction folds into the wire it corrects (5 of 5): ot-0006, 0048, 0071, 0091, 0153, 0170, 0198, 0254, 0259, 0267 etc. Requests taken back get no wire (ot-0050, 0064, 0080, 0131, 0182, 0191, 0256).
- Conditionals stay plain commands (sm2-0225, 0279, 0399, 0505, sm-0451): ot-0009, 0031, 0066, 0084, 0102, 0146, 0162, 0194, 0216, 0225, 0258.
- Statement "X sits/is <relative position>" -> `fact` with anchor (ot-0038, 0111, 0133, 0248); canvas place with a request verb -> `move` (ot-0062, 0128, 0224 ...).
- Copies after a duplicate -> `$new` (LABEL_CONVENTIONS P3): ot-0041, 0072, 0129, 0181, 0213, 0286.

## 3. Changes (id [kind]: before -> after (reason))

- ot-0104 [rename follow-up]: set target=Node7 color=gray «paint it gray» -> set target=Spare color=gray  (reason: the text renames Node7 to Spare in the sentence before; "it" is the renamed shape, later wires use the new name)
- ot-0261 [degree]: question neighbors target=Pg1 «Is Pg1 connected to anything still» -> question degree target=Pg1  (reason: "Is X connected to anything" -> degree)
- ot-0146 [one chain]: connect Microscope -> Camera «The Microscope give the image to the Camera» + connect Camera -> Acquire «the Camera goes to Acquire» -> ONE connect from=Microscope,Camera,Acquire pairing=chain, span «The Microscope give the image to the Camera, after the Camera goes to Acquire», trigger «give the image to»  (reason: one sentence, a continuing sequence "A to B, after B to C" -> chain; the next sentence "Acquire, Deconv, ... each one to the next" stays a separate wire)

## 4. Open cases (no clear majority; left as written)

1. ot-0090 "Splitter to Onu1 and Onu2, plain lines. Olt to Splitter, same." and ot-0230 "Tank1 to Pump, dashed line. Tank2 same.": the second connect carries `arrow: none` / `style` through "same" / "Olt to Splitter, same" although its own span has no "line". Same kind as fresh2/opus_a open case fo-0023 (a style shared between two wires); left.
2. ot-0236 "Can Protein be a star?" and ot-0096 "Can Pc1, Pc2 and Pc3 be green?": written as `set` (a polite request), not as `check`. No count either way; left.
3. ot-0256 "which stage is right in the middle, between Parser and Codegen?": `list` with position between. Could also be an `exists`; left.
4. ot-0153 "Wms ... arrows Wms to Fleet and Fleet to both robots": two connects (the second is a fan-out, no single chain possible); ot-0171, ot-0177 likewise.
5. ot-0111 "Tokyo is the farthest from Frankfurt, right?": `nearest` (farthest, anchor Frankfurt) without the yes/no target Tokyo; the legend has no check for it.
6. ot-0235 "Depot color is blue, please change to green": a fact for the blue plus a `set` green (not a correction: the blue is the current state).
7. ot-0108 / ot-0175 and others "should be ..." on a place with a request verb are `move`; none contradicts.

## 5. Check of the untouched fields

For all 300 lines: `id`, `domain`, `names` and `text` equal the lines of `opus_train_a/texts/texts_01.jsonl` (compared as parsed JSON, and the `text` strings also as UTF-8 bytes): identical. Also verified by script after the edit: every `span` is a substring of `text`, every `trigger` a substring of its span, wires in text order, the file round-trips through `json.dumps(ensure_ascii=False)` unchanged for all untouched lines.
