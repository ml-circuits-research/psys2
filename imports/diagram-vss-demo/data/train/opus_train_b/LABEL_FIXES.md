# Label fixes for the training set `llm_train/opus_train_b` (300 messages, ot-0301 .. ot-0600)

Label checker: Sonnet agent. File: `msg_01.jsonl`. Rules: `training/sketch/LABEL_CONVENTIONS.md`, `training/sketch/llm_train/TRAIN_MSG_SPEC.md`, `training/sketch/llm_bench/SPEC.md`; rulings reused from `fresh1/sonnet/LABEL_FIXES.md` and `fresh2/opus_{a,b,c,d}/LABEL_FIXES.md` (LABEL_FIXES files only; no test messages, reader, model or score were opened). Majorities from the corrected training sets `sonnet_msg`, `haiku_msg`, `sonnet_msg2`, `haiku_msg2`, `sonnet_long` (own script counts). Nothing was committed or staged.

## 1. Counts

- Messages: 300. Wires before: 894. Wires now: 891 (changed 9, added 0, removed 3). Messages with a change: 9 (ot-0394, ot-0448, ot-0451, ot-0476, ot-0544, ot-0547, ot-0560, ot-0579, ot-0582).

| kind of fix | changed | added | removed |
|---|---|---|---|
| canvas statement -> move | 3 | 0 | 0 |
| "connected to anything" -> degree | 3 | 0 | 0 |
| "in a row / column [place]" -> arrange only (span widened) | 3 | 0 | 3 |

Script checks over all 894 wires: spans in the text and in text order, triggers inside spans, `arrow: none` exactly where the span says line(s) without arrow, `$new` for every created shape (also several in one key), mention keys alphabetical, chains / closing connects / several-to-one / one-to-several per the conventions, no rename follow-up with the old name, no `neighbors` for "connected to anything" left.

## 2. Rulings used

- Statement of a canvas place ("X is in the center", "X stands at the left") -> `move` to that place, not a fact (fresh1/sonnet: 22 move wires against 0 facts with a canvas place; all 35 facts with a position carry an anchor). With attributes in the same sentence ("The Box is a square in the center") the attributes stay a `fact` and the place is a separate `move` (fs-0270: fact small/brown + move bottomRight). ot-0394, ot-0448, ot-0544.
- "Is X connected to anything" -> `degree` (fresh1: 2 of 2). ot-0451, ot-0476, ot-0560.
- "in a row / in a column [below X | on the left | near the top]" is one layout -> `arrange` with target + layout only, the place phrase is not a second wire (fresh1 fs-0251; script count over the five training sets: 27 arrange spans that contain a place word, 0 of them followed by a `move` of the same targets, e.g. sm-0156, sm2-0171, sm2-0272, sl-0046, sl-0191). The span of the arrange wire takes the place phrase along (as in sm2-0434 "Put them under the Chair in a row"). ot-0547, ot-0579, ot-0582. Not changed: ot-0461 ("arrange them in a row, then move them to the top": two verbs, two wires), ot-0523, ot-0511, ot-0232 (different targets).
- Loops = chain + separate closing connect (ot-0380, 0513, 0589, 0475, 0353); several-to-one and one-to-several = ONE connect (ot-0400 "from Albert to Henry and from Rose to Henry"); "A to B and B to C" = chain (ot-0399, 0425, 0495). All already so.
- Self-corrections fold into one wire (ot-0326, 0346, 0371, 0428, 0549, 0551): the final value; withdrawn requests get no wire (ot-0308 "scratch that last arrow", ot-0375 "Remove the Museum... no, keep it"). Already so.
- Yes/no superlative -> `extreme`: ot-0593 "Which node has the highest degree" and ot-0579, 0582, 0433 are `extreme`. Already so.
- "X should be ..." after a question gets no extra wire (3 of 3): ot-0313, 0331, 0387, 0425, 0481, 0540, 0554, 0557, 0593, 0600 left as written.
- "next to / beside X" in a question -> `list` with position near (ot-0443, 0590): already so.
- Restyling an existing link is not expressible -> no wire (ot-0412 "Can you make the link into Manila dashed?"): already so.
- Copies after a duplicate -> `$new` (LABEL_CONVENTIONS P3): ot-0312, 0391, 0420, 0456, 0575.

## 3. Changes (id [kind]: before -> after (reason))

### canvas statement -> move (3)

- ot-0394 [canvas statement -> move]: fact position=left (Narrator) «stands at the left» [stands] -> command move target=Narrator position=left «stands at the left» [stands at]  (reason: statement of a canvas place -> move; the pink circle part «The Narrator is a pink circle» stays a fact)
- ot-0448 [canvas statement -> move]: fact position=center (Board) «The Board is in the center» [is] -> command move target=Board position=center, same span, trigger [is in]  (reason: same)
- ot-0544 [canvas statement -> move]: fact target=Box position=center «in the center» -> command move target=Box position=center «in the center»; «The Box is a square» stays a fact shape=square  (reason: same; attributes fact + place move, as fs-0270)

### "connected to anything" -> degree (3)

- ot-0451 [degree]: question neighbors target=$new «Is Today connected to anything» -> question degree target=$new  (reason: "Is X connected to anything" -> degree)
- ot-0476 [degree]: question neighbors target=Cache1 «is Cache1 still connected to anything» -> degree target=Cache1  (reason: same)
- ot-0560 [degree]: question neighbors target=Hawaii «Is Hawaii connected to anything» -> degree target=Hawaii  (reason: same)

### layout + place -> arrange only (3)

- ot-0547 [arrange only]: arrange Tent1,Tent2 row «they should be in a row» + move Tent1,Tent2 top «near the top» -> ONE arrange Tent1,Tent2 layout=row, span «they should be in a row near the top», trigger [in a row]  (reason: 0 of 27 place-bearing arrange spans have a move; the place belongs to the layout)
- ot-0579 [arrange only]: arrange Soup,Bread,Pie,Stew row «Please arrange Soup, Bread, Pie and Stew in a row» + move Soup,Bread,Pie,Stew below Grandma «under Grandma» -> ONE arrange ... layout=row, span «Please arrange Soup, Bread, Pie and Stew in a row under Grandma»  (reason: same, sm2-0434 / sl-0046)
- ot-0582 [arrange only]: arrange Vinegar,Soap,Soda column «Can you put Vinegar, Soap and Soda in a column» + move ... left «on the left» -> ONE arrange ... layout=column, span «Can you put Vinegar, Soap and Soda in a column on the left»  (reason: same, sl-0191 "Put the three ingredients in a column on the left")

## 4. Open cases (no clear majority; left as written)

1. Statements of a canvas place that are comments on the existing diagram, no wire: ot-0308 "The plankton at the bottom is fine as it is.", ot-0456 "The Tank in the middle is fine." (fresh2/opus_b found 18 move against 19 unwired in the training sets; "is fine" is not a request). 2 cases.
2. ot-0468 "Also make it bigger than Mercury": `resize` target Venus only (the "than Mercury" part has no key). Only one comparable training wire (sl-0088, `set` large). Left.
3. ot-0575 "how many coins is there, should be 4 total": no wire; "coins" is not a shape or colour, a `count` without filter would count every shape. Left.
4. ot-0545 "is Fish a circle or an oval?": `property` shape (either/or); fresh1/sonnet open case 5 has the same split. Left.
5. ot-0236-style "Can X be a star / pink?" (ot-0466 "Can Adverb be pink?", ot-0363): written as `set` (polite request). Left.
6. ot-0567 "The white pieces are squares and the black pieces are circles.": a statement about groups with no wire (no names); the following wires carry the actual requests. Left.
7. ot-0582 "which shapes are not connected to Bottle? Hmm, maybe that's not something you can tell me." and ot-0346 "I want to be sure every city has a route": not expressible, no wire.
8. ot-0367 "connect Cloud to Rain and Rain to River, and finally draw one from River back to Sea": chain Cloud,Rain,River plus a separate connect River -> Sea (the loop is closed to a shape outside the chain, so the "A,B,C,A" pattern does not apply). Left.
9. ot-0361 "Make a link from Ice to Water labelled "melting", then another link from Water to Steam labelled "boiling"": two connects (different labels cannot share a chain). ot-0500 likewise (different style).

## 5. Check of the untouched fields

For all 300 lines: `id`, `domain`, `names` and `text` equal the lines of `opus_train_b/texts/texts_01.jsonl` (compared as parsed JSON, and the `text` strings also as UTF-8 bytes): identical. Also verified by script after the edit: every `span` is a substring of `text`, every `trigger` a substring of its span, wires in text order; the file round-trips through `json.dumps(ensure_ascii=False)` unchanged for all untouched lines.
