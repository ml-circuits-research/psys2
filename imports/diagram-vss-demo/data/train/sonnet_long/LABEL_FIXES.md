# Label review of sonnet_long (240 messages, sl-0001..sl-0240)

Reviewer: label-review agent (Sonnet). Files: `msg_01.jsonl .. msg_12.jsonl`. Rules: `training/sketch/LABEL_CONVENTIONS.md`; the model for the counting of majorities is `sonnet_msg2/LABEL_FIXES.md`. Majorities were counted on `sonnet_msg`, `haiku_msg`, `sonnet_msg2` only (not `haiku_msg2`).

No test set, reader output or `haiku_msg2` was opened. Nothing was committed. Message texts were changed only for the 29 messages the coordinator told me to restore (section 2); no message was dropped.

## 1. Counts

- Messages: 240. Wires before the review: 2595. Wires now: 2562.
- Net, comparing the writer's files with the final files (wire matched by identical JSON, then by identical span): unchanged 2138, changed in place 241, added 183, removed 216. Messages with any wire change: 176. Texts restored: 29.
- Edit operations in the log (section 3; 610 wire-level diffs: changed 273, added 152, removed 185). One edit can be counted under more than one kind and a later edit can undo part of an earlier one, so these are operation counts, not the net numbers above.

| kind of fix | changed | added | removed |
|---|---|---|---|
| restored texts (re-annotation of the 29 restored messages) | 66 | 14 | 9 |
| 'X should be Y' -> set, not fact | 35 | 13 | 16 |
| per-attribute fact wires merged into one fact / missing facts added | 54 | 103 | 162 |
| trigger of an elided-verb wire | 159 | 55 | 95 |
| span (widened for contentless requests, split, trimmed) | 26 | 14 | 23 |
| loop = chain + separate closing connect | 3 | 17 | 14 |
| canvas-place statements -> move; missing moves / sets / commands | 11 | 32 | 18 |
| row / column / group layouts -> arrange | 14 | 5 | 9 |
| yes/no superlative -> extreme | 1 | 7 | 0 |
| copy mentions | 11 | 4 | 4 |
| connect wires split or merged (parallel pairs, several-to-one, pairs) | 1 | 7 | 5 |
| arrow key / restyle / taken-back requests | 8 | 0 | 1 |
| rename follow-up and created-name -> $new | 7 | 0 | 0 |

## 1b. Rulings used (counted on the existing corrected data; each is also in the reason of the entries)

- Yes/no superlative ('Is Lisbon the rightmost?') -> `extreme` with the superlative only (94 of 96). A superlative question the writer takes back ('Is Ash the topmost? Eh, rather: which one...') gets only the wire of the final question (sl-0195, sl-0214, sl-0231).
- 'X should be Y', 'X has to be Y', 'X gets Y' -> command `set`, never a fact (0 facts among 69 should-be sentences). 'X is Y' / 'the Y a gray square' -> fact.
- One statement with several attributes ('The Park is green, a circle') -> ONE fact wire with all keys, span the whole statement (36 multi-key facts against 1 split). 'a gray one' / 'a big white one' carries the shape of the line before ('one' = the shape; 12 of 12 existing 'a <color> one' wires have a shape key).
- A statement of a canvas place ('X goes at the top', 'Y is in the middle') with no later request that repeats it -> `move` (18 of 22). A statement 'X is above Y' -> fact position + anchor (8 of 8).
- A statement of links with no later request that repeats it -> `connect` (136 of 182 statement sentences carry a connect wire; the 46 without all have a later request that repeats them).
- A loop is a chain plus a separate closing connect (4 of 4); the closing connect gets its own span ('back to Player', 'ending at the Chief').
- Several to one is ONE connect (6 of 6); one to several is ONE connect with comma-joined `to`.
- Copies: 'the copies' (plural) -> `mention(quantifier=all,recency=newest)` (6 of 7); a single 'the copy / the new one' -> `mention(recency=newest)`.
- 'in a row / in a column [below / on the left / at the top of X]' is a layout -> `arrange` with target + layout only, no position (6 of 6 with an anchor: sm-0156, sm-0234, sm-0415, sm2-0171, sm2-0272, sm2-0434; sm-0331 'go at the top, in a row' and sm-0046 'in a column on the left' also arrange only). With a verb of its own the trigger is that verb ('Put'), otherwise 'in a row'.
- Verb ellipsis: each request has its own span and its trigger is a word of that span: move -> the position phrase (180 of 205: 'on the right', 'at the bottom'), set / fact / create -> the leading words (136 of 137, 43 of 43), extreme / nearest -> the superlative (12 of 12). A span that has its own verb ('Put Cut at the left', 'The Wall goes in the middle') keeps the verb as trigger.
- A plain line with no statement of 'no arrowhead / plain / without arrows' gets no `arrow` key (bare 'line' 177 of 183 without arrow key); `arrow=none` is kept only where the message says plain / no arrowheads / not arrows, also in a neighbouring sentence.
- Contentless request ('Make her that', 'set it that way', 'set it', 'change it', 'add it anyway'): the span is widened to the words that carry its content (sm2-0195, sm2-0216). A request that names its content with a pronoun target ('set it to huge', 'make it red') is not widened.
- After a rename the follow-up uses the new name as written (16 of 17).
- Every shape created in the message is written `$new` in every later wire, also when two shapes are created in the message (single create: 87 `$new`, 0 literal; `$new,$new` in one key, e.g. sm2-0298, sl-0012).
- A restyle of an existing link ('make that dotted' on a link already drawn) and a request the writer withdraws ('Delete X... no, keep it') get no wire.

## 2. Restored texts (coordinator override): 29 texts restored

The writer changed these texts after annotating them; each original comes from the writer's own `scratchpad/long/fix*.py` call. Only the changed words are shown (`old` => `restored`, with a few words of context); the full restored text is in the data. 'wires re-annotated' counts the wire-level diffs of the re-annotation (changed + added + removed).

- **sl-0162**: wires re-annotated 4 (changed 4, added 0, removed 0).
  - text: ...so colour it red. [Make the] => [The]
  - text: ...Make the two sources [(nothing)] => [should]
- **sl-0167**: wires re-annotated 6 (changed 3, added 2, removed 1).
  - text: ...then Door to Vault. [Make the] => [The]
  - text: ...Vault. Make the Vault [a gold star,] => [is gold,]
  - text: ...gold star, a big [one,] => [star,]
  - text: ...a big one, naturally. [(nothing)] => [Make it so, colour and shape and size.]
- **sl-0153**: wires re-annotated 2 (changed 2, added 0, removed 0).
  - text: ...Barge a brown square. [Make the] => [The]
  - text: ...square. Make the Port [(nothing)] => [is]
- **sl-0155**: wires re-annotated 3 (changed 3, added 0, removed 0).
  - text: ...HallB a blue square. [Make the] => [The]
  - text: ...square. Make the Lobby [(nothing)] => [is]
- **sl-0152**: wires re-annotated 6 (changed 6, added 0, removed 0).
  - text: ...triangle, a big one. [Make the] => [The]
  - text: ...one. Make the Tower [(nothing)] => [is]
  - text: ...the Tower a gray [rectangle, and put it] => [rectangle]
  - text: ...it left of the [Rocket. Make] => [Rocket, and]
  - text: ...the Rocket. Make Control [(nothing)] => [is]
  - text: ...Control a lime ellipse [and put it] => [(nothing)]
  - text: ...Tower to the Rocket. [Add the countdown,] => [The countdown is]
  - text: ...called Timer, near the [Control,] => [Control. Add it,]
- **sl-0149**: wires re-annotated 7 (changed 1, added 3, removed 3).
  - text: ...Report a white rectangle. [Make the] => [The]
  - text: ...rectangle. Make the Room [(nothing)] => [is]
  - text: ...a big green square. [Make] => [(nothing)]
  - text: ...green square. Make Tutor [(nothing)] => [is]
- **sl-0147**: wires re-annotated 5 (changed 1, added 2, removed 2).
  - text: ...that is the beam. [Make the] => [The]
  - text: ...beam. Make the Keeper [(nothing)] => [is]
- **sl-0145**: wires re-annotated 4 (changed 4, added 0, removed 0).
  - text: ...a gold star, large. [Make] => [(nothing)]
  - text: ...star, large. Make Support [(nothing)] => [is]
- **sl-0112**: wires re-annotated 2 (changed 2, added 0, removed 0).
  - text: ...blue triangle. Right, and [add] => [(nothing)]
  - text: ...and add the ship's [AI,] => [AI is]
  - text: ...a purple hexagon named [Hal,] => [Hal that sits]
- **sl-0107**: wires re-annotated 1 (changed 1, added 0, removed 0).
  - text: ...Cake needs a candle, [so add] => [which will be]
  - text: ...yellow triangle called Candle [(nothing)] => [on top of the Cake. Place it]
- **sl-0116**: wires re-annotated 2 (changed 2, added 0, removed 0).
  - text: ...behind the model, so [put it] => [(nothing)]
- **sl-0114**: wires re-annotated 2 (changed 2, added 0, removed 0).
  - text: ...and uh the Count [should be] => [(nothing)]
- **sl-0104**: wires re-annotated 4 (changed 1, added 3, removed 0).
  - text: ...that's the fertiliser route. [Also add] => [Don't forget]
- **sl-0082**: wires re-annotated 3 (changed 3, added 0, removed 0).
  - text: ...for little kids, so [make it] => [(nothing)]
  - text: ...it a small pink [circle.] => [circle sounds right to me. Change the Carousel that way.]
  - text: ...the Food to the [Carousel,] => [Carousel. I'd show them]
- **sl-0093**: wires re-annotated 4 (changed 4, added 0, removed 0).
  - text: ...a red one. Hmm, [red, because] => [red hexagon, and make]
  - text: ...Hmm, red, because it [is] => [dashed from Main to Hotfix, meaning]
  - text: ...Dev? Can you reach [Hotfix] => [Topic]
  - text: ...you reach Hotfix from [Dev?] => [Main?]
- **sl-0092**: wires re-annotated 3 (changed 3, added 0, removed 0).
  - text: ...just go with solid. [Make the] => [The]
  - text: ...solid. Make the Bot [(nothing)] => [is]
  - text: ...a small gray circle. [(nothing)] => [Please set it up.]
  - text: ...tiny, make it small. [Set Agent to] => [Agent:]
  - text: ...to medium and green. [Turn Customer into] => [Customer:]
- **sl-0088**: wires re-annotated 3 (changed 3, added 0, removed 0).
  - text: ...in Publish. That's four [shapes. Please connect those four,] => [shapes,]
  - text: ...connect those four, each [(nothing)] => [leading]
  - text: ...to the next one. [(nothing)] => [Please draw it that way.]
  - text: ...and Legal to Publish. [Make the] => [The]
  - text: ...Make the Publish box [large] => [should be larger than the rest]
  - text: ...deserves a big box. [(nothing)] => [Make it so.]
  - text: ...is just a tiny [thing, so turn Tip into a tiny] => [(nothing)]
  - text: ...a tiny gray circle. [(nothing)] => [Set it that way.]
- **sl-0087**: wires re-annotated 1 (changed 1, added 0, removed 0).
  - text: ...a new Vice, so [add] => [I'd like]
  - text: ...Vice below the President, [no] => [oh]
  - text: ...the President, no wait, [(nothing)] => [between the President and the others? That does not work with two reports. Just put it]
- **sl-0071**: wires re-annotated 1 (changed 1, added 0, removed 0).
  - text: ...Yes, make Milk white. [Add a] => [A]
  - text: ...a tiny gray circle [(nothing)] => [named Tip jar]
  - text: ...gray circle near the [Counter for the tip jar, and] => [Counter, hmm, no spaces in names, so]
  - text: ...and call it Jar. [(nothing)] => [Add it.]
- **sl-0077**: wires re-annotated 2 (changed 2, added 0, removed 0).
  - text: ...goes back to Idle, [I forgot that one.] => [so one more arrow there.]
  - text: ...two moving states should [become blue diamonds.] => [be diamonds, which I would like in blue.]
- **sl-0076**: wires re-annotated 3 (changed 3, added 0, removed 0).
  - text: ...before I code anything. [Put the] => [The]
  - text: ...anything. Put the Player [(nothing)] => [starts]
  - text: ...at the bottom left. [Put the] => [The]
  - text: ...left. Put the Door [(nothing)] => [is]
  - text: ...top right. The Key [goes] => [sits]
- **sl-0060**: wires re-annotated 3 (changed 3, added 0, removed 0).
  - text: ...on either side, so [put] => [(nothing)]
- **sl-0056**: wires re-annotated 3 (changed 3, added 0, removed 0).
  - text: ...positions for Saturday's gig. [Put the] => [(nothing)]
  - text: ...the middle, naturally. Drums [go] => [(nothing)]
  - text: ...so top of the [canvas.] => [canvas, and Bass and Guitar left and right of the Singer.]
- **sl-0042**: wires re-annotated 2 (changed 2, added 0, removed 0).
  - text: ...Deploy one after the [other, and] => [other. While you're at it,]
  - text: ...last one should be [different.] => [different, so let's make the connection between Test and Deploy dashed and leave the rest.]
  - text: ...undo it and then [connect] => [do the]
  - text: ...connect Test to Deploy [with a dashed line, nothing else.] => [one.]
- **sl-0013**: wires re-annotated 1 (changed 1, added 0, removed 0).
  - text: ...it red. Oh, and [make] => [(nothing)]
  - text: ...Oh, and make it [(nothing)] => [should be]
- **sl-0012**: wires re-annotated 3 (changed 3, added 0, removed 0).
  - text: ...Input to Check. Then [put] => [(nothing)]
  - text: ...the success case, and [drop] => [(nothing)]
- **sl-0015**: wires re-annotated 2 (changed 1, added 1, removed 0).
  - text: ...right of Signup. Align [the two buttons] => [Signup and Login]
- **sl-0006**: wires re-annotated 1 (changed 1, added 0, removed 0).
  - text: ...After that, line up [everything] => [the three copies]
- **sl-0018**: wires re-annotated 6 (changed 0, added 3, removed 3).
  - text: ...Villain to Island too. [Make] => [The Villain, being]
  - text: ...Island too. Make the [Villain black, no wait,] => [bad one, should be black. Hmm, would purple be better? Let's say]
  - text: ...black looks too heavy. [Take] => [Now rename]
  - text: ...heavy. Take the Map [to the front. Now rename it] => [(nothing)]
  - text: ...3" on the Island. [I might] => [Take the Compass to the front. Oh and]
  - text: ...I might undo the [rename later,] => [last thing if it was a mistake,]
  - text: ...rename later, I'm not [sure yet.] => [sure.]

- Note on sl-0018: its original was first unrecoverable; the coordinator later supplied it from the writer's first Write call (`scratchpad/sl_orig_texts.json`). Hedged 'undo the last thing if it was a mistake, I'm not sure' gets no wire.

## 3. Every change, by message

Format: `before -> after`. `(no wire)` = the wire did not exist before / does not exist now.

### sl-0005 [statement]
Reason: statement of links with no later request repeating it -> connect (existing: 136 of 182 statement sentences carry a connect wire; the 46 without all have a later request that repeats them)
- added: `(no wire)` -> `command:connect from=Source,Parser,Sink pairing=chain [feeds] «Source feeds Parser and Parser feeds Sink»`

### sl-0006 [restored]
Reason: text restored to the writer's original (coordinator); wire re-annotated (the three copies of the Hall: 'the copies' = mention(quantifier=all,recency=newest), 6 of 7 existing)
- changed: `command:align target=mention(quantifier=all) axis=horizontal [line up] «line up everything horizontally»` -> `command:align target=mention(quantifier=all,recency=newest) axis=horizontal [line up] «line up the three copies horizontally»`

### sl-0007 [superlative]
Reason: yes/no superlative question -> extreme with the superlative only, no target (existing: 94 of 96 'Is X the leftmost/biggest...')
- added: `(no wire)` -> `question:extreme superlative=biggest [biggest] «the Db is the biggest thing here, right»`

### sl-0008 [move -> arrange]
Reason: 'in a row / column [below X]' states a layout -> arrange row/column, target + layout only (existing: 6 of 6 arrange, 0 move: sm-0156, sm-0234, sm-0415, sm2-0171, sm2-0272, sm2-0434)
- changed: `command:move target=mention(quantifier=all,shape=star) position=above anchor=Ideas [Put] «Put both stars above Ideas, in a row»` -> `command:arrange target=mention(quantifier=all,shape=star) layout=row [Put] «Put both stars above Ideas, in a row»`

### sl-0009 [fact split / should-be]
Reason: 'Make it navy and huge' is one request = one set with color and size (existing: one wire for 'green and huge'); 'X should be Y' is a request to change it -> command set/move (existing: 26 set + 11 move + 29 rule of 69 spans with should/must/needs to be; 0 facts)
- removed: `command:set target=Castle color=navy [navy] «navy»` -> `(no wire)`
- removed: `command:set target=Castle size=huge [huge] «huge»` -> `(no wire)`
- added: `(no wire)` -> `command:set target=Castle color=navy size=huge [Make] «Make it navy and huge»`
- changed: `fact:None target=Village color=green [should be] «the Village should be green»` -> `command:set target=Village color=green [should be] «the Village should be green»`

### sl-0012 [restored]
Reason: text restored to the writer's original (coordinator); wire re-annotated; verbless creates 'Then a green square named Welcome ... and a red square named Denied ...' get their own spans, trigger = leading words (create 43/43 existing); 'Start should be a circle' = set ('X should be Y' is a request to change it -> command set/move (existing: 26 set + 11 move + 29 rule of 69 spans with should/must/needs to be; 0 facts))
- changed: `fact:None target=Start,End shape=circle [should be] «Start should be a circle and End too»` -> `command:set target=Start,End shape=circle [should be] «Start should be a circle and End too»`
- changed: `command:create shape=square color=green name=Welcome position=rightOf anchor=Check [put] «put a green square named Welcome to the right of Check»` -> `command:create shape=square color=green name=Welcome position=rightOf anchor=Check [a green square] «a green square named Welcome to the right of Check»`
- changed: `command:create shape=square color=red name=Denied position=below anchor=Check [drop] «drop a red square named Denied below Check»` -> `command:create shape=square color=red name=Denied position=below anchor=Check [a red square] «a red square named Denied below Check»`

### sl-0013 [restored]
Reason: text restored to the writer's original (coordinator); wire re-annotated ('it should be huge too' = set, 'X should be Y' is a request to change it -> command set/move (existing: 26 set + 11 move + 29 rule of 69 spans with should/must/needs to be; 0 facts))
- changed: `command:set target=Amp size=huge [make] «make it huge too»` -> `command:set target=Amp size=huge [should be] «it should be huge too»`

### sl-0014 [fact split]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires)
- removed: `fact:None target=Earth color=blue [blue] «blue»` -> `(no wire)`
- removed: `fact:None target=Earth size=medium [medium] «medium»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Earth color=blue size=medium [is] «The Earth is blue and medium sized»`

### sl-0015 [restored / superlative]
Reason: text restored to the writer's original (coordinator); wire re-annotated (two shapes created in the message = '$new,$new', like sm2-0298/0383/0431); yes/no superlative question -> extreme with the superlative only, no target (existing: 94 of 96 'Is X the leftmost/biggest...')
- changed: `command:align target=mention(quantifier=all,shape=ellipse) axis=horizontal [Align] «Align the two buttons horizontally»` -> `command:align target=$new,$new axis=horizontal [Align] «Align Signup and Login horizontally»`
- added: `(no wire)` -> `question:extreme superlative=biggest [biggest] «Am I right that Content is the biggest block now»`

### sl-0015 [canvas]
Reason: statement of a canvas place ('X goes/sits/is at the top') -> move (existing: 18 of 22 canvas-place statements are move wires, 4 unwired) ('that's already how they sit' states the places; no later move request repeats them)
- added: `(no wire)` -> `command:move target=Header position=top [stays] «Header stays on top»`
- added: `(no wire)` -> `command:move target=Sidebar position=left [on the left] «Sidebar on the left»`
- added: `(no wire)` -> `command:move target=Content position=center [in the middle] «Content in the middle»`

### sl-0016 [should-be]
Reason: 'X should be Y' is a request to change it -> command set/move (existing: 26 set + 11 move + 29 rule of 69 spans with should/must/needs to be; 0 facts)
- changed: `fact:None target=Water color=teal [should be] «The Water should be teal»` -> `command:set target=Water color=teal [should be] «The Water should be teal»`

### sl-0016 [created-name -> $new]
Reason: shapes created in the message are written $new in every later wire, also when two shapes are created (existing: single create 87 $new / 0 literal; two $new in one key are written '$new,$new' as sm2-0298, sl-0012; the rule line in LABEL_CONVENTIONS)
- changed: `command:create shape=star color=yellow name=Bread position=above anchor=Oven [add] «add a yellow star called Bread above the Oven»` -> `command:create shape=star color=yellow name=Bread position=above anchor=$new [add] «add a yellow star called Bread above the Oven»`
- changed: `command:connect from=Oven to=$new [connect] «connect Oven to it»` -> `command:connect from=$new to=$new [connect] «connect Oven to it»`
- changed: `question:neighbors target=Oven [connect to] «What does the Oven connect to»` -> `question:neighbors target=$new [connect to] «What does the Oven connect to»`

### sl-0018 [restored]
Reason: text restored to the writer's original (coordinator); wire re-annotated; self-correction ('should be black ... Let's say purple') -> set purple over the whole passage; follow-up after the rename uses the new name as written ('Take the Compass to the front', 16/17); 'undo the last thing if it was a mistake, I'm not sure' is hedged and conditional -> no wire (listed for the owner)
- removed: `command:set target=Villain color=purple [Make] «Make the Villain black, no wait, purple»` -> `(no wire)`
- removed: `command:toFront target=Map [to the front] «Take the Map to the front»` -> `(no wire)`
- removed: `command:rename target=Map name=Compass [rename] «rename it to Compass»` -> `(no wire)`
- added: `(no wire)` -> `command:set target=Villain color=purple [should be] «The Villain, being the bad one, should be black. Hmm, would purple be better? Let's say purple»`
- added: `(no wire)` -> `command:rename target=Map name=Compass [rename] «rename the Map to Compass»`
- added: `(no wire)` -> `command:toFront target=Compass [to the front] «Take the Compass to the front»`

### sl-0021 [trigger]
Reason: verb ellipsis, create: trigger = leading words of the own span (existing 43 of 43)
- changed: `command:create shape=hexagon color=green name=Minor position=below anchor=Ward [Minor] «a green hexagon named Minor below the Ward»` -> `command:create shape=hexagon color=green name=Minor position=below anchor=Ward [a green hexagon] «a green hexagon named Minor below the Ward»`

### sl-0024 [canvas / trigger]
Reason: statement of a canvas place ('X goes/sits/is at the top') -> move (existing: 18 of 22 canvas-place statements are move wires, 4 unwired); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- added: `(no wire)` -> `command:move target=Bride,Groom position=top [sit at] «The Bride and the Groom sit at the top»`
- changed: `command:move target=Table2 position=right [Table2] «Table2 on the right»` -> `command:move target=Table2 position=right [on the right] «Table2 on the right»`

### sl-0027 [span split]
Reason: two requests in one span: 'it is in the center' (move, statement of a canvas place ('X goes/sits/is at the top') -> move (existing: 18 of 22 canvas-place statements are move wires, 4 unwired)) and 'it should be big' (set, 'X should be Y' is a request to change it -> command set/move (existing: 26 set + 11 move + 29 rule of 69 spans with should/must/needs to be; 0 facts); big -> large 27/28)
- removed: `command:move target=Hub position=center [it is in the center] «it is in the center and it should be big»` -> `(no wire)`
- added: `(no wire)` -> `command:move target=Hub position=center [is in] «it is in the center»`
- added: `(no wire)` -> `command:set target=Hub size=large [should be] «it should be big»`

### sl-0028 [fact / copy]
Reason: a stated 'X is a big rectangle' is a fact (existing: sm2-0068/0527 added, 200 single + 36 multi-key facts); statement 'X is above / sits left of Y' -> fact position+anchor (existing: 8 of 8); original + its copies: 'Name,mention(recency=newest)' (+quantifier=all for plural 'all/the copies'), existing 9 mixes (e.g. sm-0549, sm2-0348)
- added: `(no wire)` -> `fact:None target=Stage size=large shape=rectangle [is] «the Stage is a big rectangle»`
- added: `(no wire)` -> `fact:None target=Piano position=leftOf anchor=Stage [sits] «the Piano sits on its left»`
- changed: `command:arrange target=mention(quantifier=all,color=brown) layout=circle [Arrange] «Arrange all of them in a row, hmm, no, in a circle»` -> `command:arrange target=Chair,mention(quantifier=all,recency=newest) layout=circle [Arrange] «Arrange all of them in a row, hmm, no, in a circle»`

### sl-0030 [should-be]
Reason: 'X should be Y' is a request to change it -> command set/move (existing: 26 set + 11 move + 29 rule of 69 spans with should/must/needs to be; 0 facts); elided 'Seal gray' keeps the set action
- changed: `fact:None target=Whale color=navy [should be] «Whale should be navy»` -> `command:set target=Whale color=navy [should be] «Whale should be navy»`
- changed: `fact:None target=Seal color=gray [Seal] «Seal gray»` -> `command:set target=Seal color=gray [Seal] «Seal gray»`

### sl-0035 [should-be]
Reason: 'X should be Y' is a request to change it -> command set/move (existing: 26 set + 11 move + 29 rule of 69 spans with should/must/needs to be; 0 facts)
- changed: `fact:None target=Test shape=hexagon [should be] «Test should be a hexagon»` -> `command:set target=Test shape=hexagon [should be] «Test should be a hexagon»`

### sl-0038 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Clinic position=rightOf anchor=Park [Clinic] «the Clinic to the right»` -> `command:move target=Clinic position=rightOf anchor=Park [to the right] «the Clinic to the right»`
- changed: `command:move target=Market position=below anchor=Park [Market] «the Market under the Park»` -> `command:move target=Market position=below anchor=Park [under] «the Market under the Park»`

### sl-0040 [superlative]
Reason: yes/no superlative question -> extreme with the superlative only, no target (existing: 94 of 96 'Is X the leftmost/biggest...')
- added: `(no wire)` -> `question:extreme superlative=biggest [biggest] «Is the Guest the biggest one»`

### sl-0042 [restored / span]
Reason: text restored to the writer's original (coordinator); wire re-annotated; wire spans re-cut to the original text (the restyle sentence is folded into the chain connect, as sm2-0375/0472; the last connect is 'do the Test to Deploy one', the dashed style comes from the sentence before)
- changed: `command:connect from=Commit,Build,Test,Deploy pairing=chain style=dashed [connect] «connect Commit, Build, Test and Deploy one after the other, and make the arrows dashed»` -> `command:connect from=Commit,Build,Test,Deploy pairing=chain style=dashed [connect] «connect Commit, Build, Test and Deploy one after the other. While you're at it, make the arrows dashed»`
- changed: `command:connect from=Test to=Deploy style=dashed [connect] «connect Test to Deploy with a dashed line»` -> `command:connect from=Test to=Deploy style=dashed [do] «do the Test to Deploy one»`

### sl-0046 [parallel pairs]
Reason: two independent links 'Mammal to Lion' and 'Bird to Eagle' are two connects with their own spans; a from list plus a to list is read as every-to-every (6 of 6 existing multi-to-multi connects are 'both to both'), so 'Mammal,Bird -> $new,$new' would create 4 links
- removed: `command:connect from=Mammal,Bird to=$new,$new [Link] «Link Mammal to Lion and Bird to Eagle»` -> `(no wire)`
- added: `(no wire)` -> `command:connect from=Mammal to=$new [Link] «Link Mammal to Lion»`
- added: `(no wire)` -> `command:connect from=Bird to=$new [Bird to] «Bird to Eagle»`

### sl-0046 [move -> arrange]
Reason: 'in a row / column [below X]' states a layout -> arrange row/column, target + layout only (existing: 6 of 6 arrange, 0 move: sm-0156, sm-0234, sm-0415, sm2-0171, sm2-0272, sm2-0434)
- changed: `command:move target=Mammal,Bird,Fish position=below anchor=Animal [Put] «Put Mammal, Bird and Fish in a row below it»` -> `command:arrange target=Mammal,Bird,Fish layout=row [Put] «Put Mammal, Bird and Fish in a row below it»`

### sl-0047 [fact]
Reason: statement 'X is above / sits left of Y' -> fact position+anchor (existing: 8 of 8)
- added: `(no wire)` -> `fact:None target=Auth,Orders,Billing position=below anchor=Gateway [hang] «Auth, Orders and Billing hang below it»`

### sl-0048 [loop split / fact split]
Reason: closing link of a loop is a separate connect after the chain (LABEL_CONVENTIONS; 4 of 4 existing + 13 in sm2); a repeated name in one chain is a self-loop in logic.js; one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires)
- removed: `command:connect from=Battery,Switch,Bulb,Battery pairing=chain [Connect] «Connect Battery to Switch, Switch to Bulb, and Bulb back to Battery»` -> `(no wire)`
- added: `(no wire)` -> `command:connect from=Battery,Switch,Bulb pairing=chain [Connect] «Connect Battery to Switch, Switch to Bulb»`
- added: `(no wire)` -> `command:connect from=Bulb to=Battery [Bulb back to] «Bulb back to Battery»`
- removed: `fact:None target=Switch size=small [small] «small»` -> `(no wire)`
- removed: `fact:None target=Switch shape=square [square] «square»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Switch size=small shape=square [is] «The Switch is a small square»`

### sl-0049 [should-be]
Reason: 'X should be Y' is a request to change it -> command set/move (existing: 26 set + 11 move + 29 rule of 69 spans with should/must/needs to be; 0 facts); elided 'the rest navy' keeps the set action, trigger = leading words
- changed: `fact:None target=Paid color=green [should be] «Paid should be green»` -> `command:set target=Paid color=green [should be] «Paid should be green»`
- changed: `fact:None target=mention(notcolor=green,quantifier=all) color=navy [rest] «the rest navy»` -> `command:set target=mention(notcolor=green,quantifier=all) color=navy [the rest] «the rest navy»`

### sl-0050 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Food position=below anchor=Spanish [Food] «Food below it»` -> `command:move target=Food position=below anchor=Spanish [below] «Food below it»`

### sl-0051 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Stavanger position=below anchor=Bergen [Stavanger] «Stavanger below Bergen»` -> `command:move target=Stavanger position=below anchor=Bergen [below] «Stavanger below Bergen»`

### sl-0052 [trigger]
Reason: verb ellipsis, create: trigger = leading words of the own span (existing 43 of 43); elided connect 'Initech too': leading phrase (sm2 'Soil too')
- changed: `command:create shape=circle color=green size=large name=Newco position=center [placed] «a big green circle called Newco, placed at the center»` -> `command:create shape=circle color=green size=large name=Newco position=center [a big green circle] «a big green circle called Newco, placed at the center»`
- changed: `command:connect from=Initech to=$new style=dashed [Initech] «Initech too, but Initech with a dashed line»` -> `command:connect from=Initech to=$new style=dashed [Initech too] «Initech too, but Initech with a dashed line»`

### sl-0054 [should-be / statement]
Reason: 'X should be Y' is a request to change it -> command set/move (existing: 26 set + 11 move + 29 rule of 69 spans with should/must/needs to be; 0 facts); statement of links with no later request repeating it -> connect (existing: 136 of 182 statement sentences carry a connect wire; the 46 without all have a later request that repeats them)
- added: `(no wire)` -> `command:connect from=Request to=Review [goes to] «A Request comes in and goes to Review»`
- changed: `fact:None target=Approve color=green [should be] «Approve should be green»` -> `command:set target=Approve color=green [should be] «Approve should be green»`
- changed: `fact:None target=Reject color=red [Reject] «Reject red»` -> `command:set target=Reject color=red [Reject] «Reject red»`

### sl-0056 [restored]
Reason: text restored to the writer's original (coordinator); wire re-annotated; the first two moves are verbless canvas-place requests (own span, trigger = position phrase, verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)); 'Bass and Guitar left and right of the Singer' is repeated by the next sentence 'Place Bass ...' so it gets no wire of its own
- changed: `command:move target=Singer position=center [Put] «Put the Singer in the middle»` -> `command:move target=Singer position=center [in the middle] «Singer in the middle»`
- changed: `command:move target=Drums position=top [go] «Drums go at the back, so top of the canvas»` -> `command:move target=Drums position=top [top of the canvas] «Drums at the back, so top of the canvas»`
- changed: `command:move target=Guitar position=rightOf anchor=Singer [Guitar] «Guitar to the right of Singer»` -> `command:move target=Guitar position=rightOf anchor=Singer [to the right of] «Guitar to the right of Singer»`

### sl-0060 [restored / copy]
Reason: text restored to the writer's original (coordinator); wire re-annotated; verbless moves 'ChairA on the left of the Table and ChairB on the right' (trigger = position phrase); 'all the chairs' = ChairA,ChairB + the copies: original + its copies: 'Name,mention(recency=newest)' (+quantifier=all for plural 'all/the copies'), existing 9 mixes (e.g. sm-0549, sm2-0348)
- changed: `command:move target=ChairA position=leftOf anchor=Table [put] «put ChairA on the left of the Table»` -> `command:move target=ChairA position=leftOf anchor=Table [on the left of] «ChairA on the left of the Table»`
- changed: `command:move target=ChairB position=rightOf anchor=Table [ChairB] «ChairB on the right»` -> `command:move target=ChairB position=rightOf anchor=Table [on the right] «ChairB on the right»`
- changed: `command:align target=ChairA,ChairB axis=vertical [line up] «line up the chairs vertically»` -> `command:align target=ChairA,ChairB,mention(quantifier=all,recency=newest) axis=vertical [line up] «line up the chairs vertically»`

### sl-0062 [span]
Reason: 'Change it' carries no content: the span starts at the sentence that says what to change to (sm2-0195/0216 precedent)
- changed: `command:set target=Database color=gold shape=star [Change] «Change it»` -> `command:set target=Database color=gold shape=star [Change] «The Database is the crown jewel, so a gold star would be perfect. Change it»`

### sl-0063 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Mine position=topLeft [Mine] «the Mine to the top left»` -> `command:move target=Mine position=topLeft [to the top left] «the Mine to the top left»`

### sl-0064 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Dev position=right [Dev] «Dev at the right side»` -> `command:move target=Dev position=right [at the right side] «Dev at the right side»`

### sl-0066 [should-be]
Reason: 'X should be Y' is a request to change it -> command set/move (existing: 26 set + 11 move + 29 rule of 69 spans with should/must/needs to be; 0 facts)
- changed: `fact:None target=Repair color=orange [should be] «Repair should be orange»` -> `command:set target=Repair color=orange [should be] «Repair should be orange»`

### sl-0068 [span split / trigger]
Reason: 'as a long blue ellipse in the middle' holds two requests (set shape+color, move to the canvas centre); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- removed: `command:set target=River shape=ellipse color=blue [I'd like] «I'd like the River as a long blue ellipse in the middle»` -> `(no wire)`
- added: `(no wire)` -> `command:set target=River shape=ellipse color=blue [I'd like] «I'd like the River as a long blue ellipse»`
- added: `(no wire)` -> `command:move target=River position=center [in the middle] «in the middle»`
- changed: `command:move target=Meadow position=bottom [Meadow] «the Meadow at the bottom»` -> `command:move target=Meadow position=bottom [at the bottom] «the Meadow at the bottom»`

### sl-0069 [should-be / fact split]
Reason: 'X should be Y' is a request to change it -> command set/move (existing: 26 set + 11 move + 29 rule of 69 spans with should/must/needs to be; 0 facts); one request = one wire with all keys; verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Frame position=center [Frame in the center] «Frame in the center»` -> `command:move target=Frame position=center [in the center] «Frame in the center»`
- removed: `fact:None target=Wheel size=large [big] «big»` -> `(no wire)`
- removed: `fact:None target=Wheel color=gray [gray] «gray»` -> `(no wire)`
- removed: `fact:None target=Wheel shape=circle [circle] «circle»` -> `(no wire)`
- added: `(no wire)` -> `command:set target=Wheel size=large color=gray shape=circle [should be] «The Wheel should be a big gray circle»`
- changed: `command:move target=Wheel position=rightOf anchor=Frame [original] «the original to the right»` -> `command:move target=Wheel position=rightOf anchor=Frame [to the right] «the original to the right»`

### sl-0070 [should-be]
Reason: 'Jazz is gold, no wait, Jazz should be purple': the correction is a request to change -> set purple ('X should be Y' is a request to change it -> command set/move (existing: 26 set + 11 move + 29 rule of 69 spans with should/must/needs to be; 0 facts))
- changed: `fact:None target=Jazz color=purple [should be] «Jazz is gold, no wait, Jazz should be purple»` -> `command:set target=Jazz color=purple [should be] «Jazz is gold, no wait, Jazz should be purple»`

### sl-0070 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Pop position=bottom [Pop] «Pop at the bottom»` -> `command:move target=Pop position=bottom [at the bottom] «Pop at the bottom»`

### sl-0071 [restored]
Reason: text restored to the writer's original (coordinator); wire re-annotated; the create span covers the whole self-correction ('Tip jar' -> Jar), sm2-0280 precedent
- changed: `command:create shape=circle color=gray size=tiny name=Jar position=near anchor=Counter [Add] «Add a tiny gray circle near the Counter for the tip jar, and call it Jar»` -> `command:create shape=circle color=gray size=tiny name=Jar position=near anchor=Counter [Add] «A tiny gray circle named Tip jar near the Counter, hmm, no spaces in names, so call it Jar. Add it»`

### sl-0073 [should-be / trigger]
Reason: 'X should be Y' is a request to change it -> command set/move (existing: 26 set + 11 move + 29 rule of 69 spans with should/must/needs to be; 0 facts); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Bass position=right [Bass] «Bass to the right»` -> `command:move target=Bass position=right [to the right] «Bass to the right»`
- changed: `command:move target=Alto,Tenor position=between anchor=Soprano,Bass [Alto] «Alto and Tenor in the middle»` -> `command:move target=Alto,Tenor position=between anchor=Soprano,Bass [in the middle] «Alto and Tenor in the middle»`
- changed: `fact:None target=Alto color=pink [should be] «The Alto should be pink»` -> `command:set target=Alto color=pink [should be] «The Alto should be pink»`
- changed: `fact:None target=Soprano color=gold [Soprano] «Soprano gold»` -> `command:set target=Soprano color=gold [Soprano] «Soprano gold»`
- changed: `fact:None target=Tenor color=blue [Tenor] «Tenor blue»` -> `command:set target=Tenor color=blue [Tenor] «Tenor blue»`
- changed: `fact:None target=Bass color=gray [Bass] «Bass gray»` -> `command:set target=Bass color=gray [Bass] «Bass gray»`

### sl-0074 [loop split / restyle]
Reason: closing link of a loop is a separate connect after the chain (LABEL_CONVENTIONS; 4 of 4 existing + 13 in sm2); a repeated name in one chain is a self-loop in logic.js; 'connect them again with two-way arrows' restyles links that already exist: connect on an existing pair only reports 'already exists' (logic.js), so no wire (sm2 restyle precedent: 8 removed, e.g. sm2-0178, sm2-0218) -> owner list
- changed: `command:connect from=Earth,Sat1,Sat2,Relay,Earth pairing=chain [Link] «Link the Earth to Sat1, Sat1 to Sat2, Sat2 to the Relay and the Relay to the Earth»` -> `command:connect from=Earth,Sat1,Sat2,Relay pairing=chain [Link] «Link the Earth to Sat1, Sat1 to Sat2, Sat2 to the Relay»`
- changed: `command:connect from=Earth,Sat1,Sat2,Relay,Earth pairing=chain arrow=both [connect] «connect them again with two-way arrows»` -> `command:connect from=Relay to=Earth [the Relay to] «the Relay to the Earth»`

### sl-0074 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Sat2 position=above anchor=Sat1 [Sat2] «Sat2 above Sat1»` -> `command:move target=Sat2 position=above anchor=Sat1 [above] «Sat2 above Sat1»`

### sl-0076 [restored]
Reason: text restored to the writer's original (coordinator); wire re-annotated; statements of canvas places are move wires (statement of a canvas place ('X goes/sits/is at the top') -> move (existing: 18 of 22 canvas-place statements are move wires, 4 unwired))
- changed: `command:move target=Player position=bottomLeft [Put] «Put the Player at the bottom left»` -> `command:move target=Player position=bottomLeft [starts at] «The Player starts at the bottom left»`
- changed: `command:move target=Door position=topRight [Put] «Put the Door on the other side of the level, top right»` -> `command:move target=Door position=topRight [is on] «The Door is on the other side of the level, top right»`
- changed: `command:move target=Key position=center [goes] «The Key goes somewhere in the middle»` -> `command:move target=Key position=center [sits] «The Key sits somewhere in the middle»`

### sl-0077 [restored]
Reason: text restored to the writer's original (coordinator); wire re-annotated ('should be diamonds ... in blue' = one set, 'X should be Y' is a request to change it -> command set/move (existing: 26 set + 11 move + 29 rule of 69 spans with should/must/needs to be; 0 facts)); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:set target=MovingUp,MovingDown shape=diamond color=blue [become] «The two moving states should become blue diamonds»` -> `command:set target=MovingUp,MovingDown shape=diamond color=blue [should be] «The two moving states should be diamonds, which I would like in blue»`
- changed: `command:move target=MovingDown position=below anchor=Idle [MovingDown] «MovingDown below it»` -> `command:move target=MovingDown position=below anchor=Idle [below] «MovingDown below it»`

### sl-0078 [canvas / fact]
Reason: statement of a canvas place ('X goes/sits/is at the top') -> move (existing: 18 of 22 canvas-place statements are move wires, 4 unwired); statement 'X is above / sits left of Y' -> fact position+anchor (existing: 8 of 8); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- added: `(no wire)` -> `command:move target=Entrance position=bottom [is at] «The Entrance is at the bottom of the plan»`
- added: `(no wire)` -> `fact:None target=Gallery position=above anchor=Entrance [the Gallery] «the Gallery above it»`
- changed: `command:move target=Shop position=rightOf anchor=Gallery [Shop] «the Shop right of it»` -> `command:move target=Shop position=rightOf anchor=Gallery [right of] «the Shop right of it»`

### sl-0081 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=TrenchB position=topRight [TrenchB] «TrenchB at the top right»` -> `command:move target=TrenchB position=topRight [at the top right] «TrenchB at the top right»`

### sl-0082 [restored]
Reason: text restored to the writer's original (coordinator); wire re-annotated; 'Change the Carousel that way' carries no content, the span starts at the sentence that gives it; the dotted-lines sentence is folded into the last connect (sm2-0152/0247), the first two links form a chain (continuing sequence)
- changed: `command:set target=Carousel size=small color=pink shape=circle [make] «make it a small pink circle»` -> `command:set target=Carousel size=small color=pink shape=circle [Change] «The Carousel is for little kids, so a small pink circle sounds right to me. Change the Carousel that way»`
- changed: `command:connect from=Gate to=Food style=dotted arrow=none [connect] «connect the Gate to Food»` -> `command:connect from=Gate,Food,Coaster pairing=chain style=dotted arrow=none [connect] «connect the Gate to Food, the Food to the Coaster»`
- changed: `command:connect from=Food to=Coaster,Carousel style=dotted arrow=none [Food] «the Food to the Coaster, and also the Food to the Carousel, as dotted lines, not arrows»` -> `command:connect from=Food to=Carousel style=dotted arrow=none [the Food to] «the Food to the Carousel. I'd show them as dotted lines, not arrows»`

### sl-0083 [span]
Reason: span covers the self-correction chain that gives the names and the final value two-way (sm2-0160 precedent)
- changed: `command:connect from=Pay to=$new arrow=both [link] «link them with a two-way arrow instead»` -> `command:connect from=Pay to=$new arrow=both [send] «send an arrow from Pay to it. And back, from Retry to Pay, so link them with a two-way arrow instead»`

### sl-0084 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Woods position=right [Woods] «the Woods on the right»` -> `command:move target=Woods position=right [on the right] «the Woods on the right»`

### sl-0085 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Read position=right [Read] «Read the last on the right»` -> `command:move target=Read position=right [on the right] «Read the last on the right»`

### sl-0086 [superlative]
Reason: yes/no superlative question -> extreme with the superlative only, no target (existing: 94 of 96 'Is X the leftmost/biggest...')
- added: `(no wire)` -> `question:extreme superlative=topmost [topmost] «Is the Peak the topmost»`

### sl-0087 [restored]
Reason: text restored to the writer's original (coordinator); wire re-annotated; create span covers the self-correction chain, final value near the President (sm2-0280 precedent)
- changed: `command:create shape=square color=teal name=Vice position=near anchor=President [add] «add a teal square named Vice below the President, no wait, near the President»` -> `command:create shape=square color=teal name=Vice position=near anchor=President [I'd like] «I'd like a teal square named Vice below the President, oh wait, between the President and the others? That does not work with two reports. Just put it near the President»`

### sl-0088 [restored]
Reason: text restored to the writer's original (coordinator); wire re-annotated; request with no content of its own ('Draw it', 'Set it that way', 'Change it'): the span starts at the sentence that carries the content (sm2-0195/0216 precedent)
- changed: `command:connect from=Tip,Draft,Edit,Publish pairing=next [connect] «connect those four, each to the next one»` -> `command:connect from=Tip,Draft,Edit,Publish pairing=next [draw] «It starts as a Tip, becomes a Draft, goes through Edit, and ends up in Publish. That's four shapes, each leading to the next one. Please draw it that way»`
- changed: `command:set target=Publish size=large color=gold [Make] «Make the Publish box large and gold»` -> `command:set target=Publish size=large color=gold [Make] «The Publish box should be larger than the rest and gold, big news deserves a big box. Make it so»`
- changed: `command:set target=Tip size=tiny color=gray shape=circle [turn] «turn Tip into a tiny gray circle»` -> `command:set target=Tip size=tiny color=gray shape=circle [Set] «Tip is just a tiny gray circle. Set it that way»`

### sl-0089 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Depot position=center [Depot] «the Depot in the middle»` -> `command:move target=Depot position=center [in the middle] «the Depot in the middle»`

### sl-0089 [span]
Reason: contentless request ('change it', 'add it anyway') -> span widened to the words that carry its content (precedent sm2-0195 / sm2-0216)
- changed: `command:set target=Depot shape=hexagon [change] «change it»` -> `command:set target=Depot shape=hexagon [change] «Would it make sense for the Depot to be a hexagon? I think so, change it»`

### sl-0090 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Brass position=center [Brass] «the Brass to the center»` -> `command:move target=Brass position=center [to the center] «the Brass to the center»`
- changed: `command:move target=Drums position=top [Drums] «the Drums to the top»` -> `command:move target=Drums position=top [to the top] «the Drums to the top»`

### sl-0092 [restored]
Reason: text restored to the writer's original (coordinator); wire re-annotated; request with no content of its own ('Draw it', 'Set it that way', 'Change it'): the span starts at the sentence that carries the content (sm2-0195/0216 precedent); the verbless 'Agent: ...' / 'Customer: ...' continue the 'set it up' request: set, trigger = leading words
- changed: `command:set target=Bot size=small color=gray shape=circle [Make] «Make the Bot a small gray circle»` -> `command:set target=Bot size=small color=gray shape=circle [set] «The Bot is a small gray circle. Please set it up»`
- changed: `command:set target=Agent size=medium color=green [Set] «Set Agent to medium and green»` -> `command:set target=Agent size=medium color=green [Agent] «Agent: medium and green»`
- changed: `command:set target=Customer size=large color=orange shape=star [Turn] «Turn Customer into a big orange star»` -> `command:set target=Customer size=large color=orange shape=star [Customer] «Customer: a big orange star, our hero»`

### sl-0093 [restored]
Reason: text restored to the writer's original (coordinator); wire re-annotated ('Can you reach Topic from Main' - follow-up after a rename uses the name as written, 16/17 existing); the dashed restyle of the existing Main-Hotfix link has no wire (sm2 restyle precedent); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:connect from=Main to=Hotfix [Main] «Main to Hotfix»` -> `command:connect from=Main to=Hotfix [Main to] «Main to Hotfix»`
- changed: `command:move target=Dev position=below anchor=Main [Dev] «Dev below it»` -> `command:move target=Dev position=below anchor=Main [below] «Dev below it»`
- changed: `command:move target=Feature position=below anchor=Dev [Feature] «Feature below Dev»` -> `command:move target=Feature position=below anchor=Dev [below] «Feature below Dev»`
- changed: `question:path from=Dev to=Hotfix [reach] «Can you reach Hotfix from Dev»` -> `question:path from=Main to=Topic [reach] «Can you reach Topic from Main»`

### sl-0094 [superlative]
Reason: yes/no superlative question -> extreme with the superlative only, no target (existing: 94 of 96 'Is X the leftmost/biggest...')
- added: `(no wire)` -> `question:extreme superlative=smallest [smallest] «Is the Pool the smallest»`

### sl-0094 [span]
Reason: contentless request ('change it', 'add it anyway') -> span widened to the words that carry its content (precedent sm2-0195 / sm2-0216)
- changed: `command:create shape=circle color=cyan name=Pool position=below anchor=Garage [add] «add it anyway and name it Pool, below the Garage»` -> `command:create shape=circle color=cyan name=Pool position=below anchor=Garage [add] «a pool, a cyan circle, which I find hilarious, but add it anyway and name it Pool, below the Garage»`

### sl-0095 [canvas]
Reason: statement of a canvas place ('X goes/sits/is at the top') -> move (existing: 18 of 22 canvas-place statements are move wires, 4 unwired)
- added: `(no wire)` -> `command:move target=Hub position=center [in the middle] «Hub in the middle»`

### sl-0095 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=PcB position=bottomLeft [PcB] «PcB at the bottom left»` -> `command:move target=PcB position=bottomLeft [at the bottom left] «PcB at the bottom left»`
- changed: `command:move target=PcC position=bottomRight [PcC] «PcC at the bottom right»` -> `command:move target=PcC position=bottomRight [at the bottom right] «PcC at the bottom right»`

### sl-0096 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205); fact: trigger = the copula
- changed: `command:move target=Swing position=topRight [Swing] «the Swing at the top right»` -> `command:move target=Swing position=topRight [at the top right] «the Swing at the top right»`
- changed: `command:move target=Sandbox position=center [Sandbox] «the Sandbox in the center»` -> `command:move target=Sandbox position=center [in the center] «the Sandbox in the center»`
- changed: `fact:None target=Slide color=blue [Slide] «the Slide is blue»` -> `fact:None target=Slide color=blue [is] «the Slide is blue»`

### sl-0097 [loop split]
Reason: closing link of a loop is a separate connect after the chain (LABEL_CONVENTIONS; 4 of 4 existing + 13 in sm2); a repeated name in one chain is a self-loop in logic.js (sm2-0445 form: the closing span carries the request sentence)
- removed: `command:connect from=North,South,East,Walk,North pairing=chain [Connect] «Connect all of that in one go»` -> `(no wire)`
- added: `(no wire)` -> `command:connect from=North,South,East,Walk pairing=chain [goes to] «North goes to South, South goes to East, East goes to Walk»`
- added: `(no wire)` -> `command:connect from=Walk to=North [goes back to] «Walk goes back to North, a loop of four. Connect all of that in one go»`

### sl-0098 [trigger]
Reason: verb ellipsis: connect 'Hera to' (sm2 'Core to'); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:connect from=Hera to=Ares [Hera] «Hera to Ares as well»` -> `command:connect from=Hera to=Ares [Hera to] «Hera to Ares as well»`
- changed: `command:move target=Ares,Athena position=below anchor=Zeus,Hera [Ares] «Ares and Athena below them»` -> `command:move target=Ares,Athena position=below anchor=Zeus,Hera [below] «Ares and Athena below them»`

### sl-0099 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205); set: leading words of the own span
- changed: `command:move target=Path position=center [Path] «the Path in the middle»` -> `command:move target=Path position=center [in the middle] «the Path in the middle»`
- changed: `command:move target=TowerB position=below anchor=Path [TowerB] «TowerB below it»` -> `command:move target=TowerB position=below anchor=Path [below] «TowerB below it»`
- changed: `command:set target=TowerB shape=triangle color=blue [TowerB] «blue for TowerB»` -> `command:set target=TowerB shape=triangle color=blue [blue] «blue for TowerB»`

### sl-0100 [fact split]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires)
- removed: `fact:None target=Menu color=white [white] «white»` -> `(no wire)`
- removed: `fact:None target=Menu shape=rectangle [rectangle] «rectangle»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Menu color=white shape=rectangle [is] «The Menu is a white rectangle»`

### sl-0101 [taken back]
Reason: request taken back ('ignore me') gets no wire (LABEL_CONVENTIONS)
- removed: `command:delete target=mention(color=red,quantifier=all) [Delete] «Delete the red shapes»` -> `(no wire)`

### sl-0104 [restored / fact]
Reason: text restored to the writer's original (coordinator); wire re-annotated; stated facts had no wire (sm2-0068/0527 'missing fact' precedent)
- added: `(no wire)` -> `fact:None target=Bed1,Bed2,Bed3 color=green shape=rectangle [are] «The beds are green rectangles, all of them»`
- added: `(no wire)` -> `fact:None target=Bed2 color=green [is] «Bed2 is already green»`
- added: `(no wire)` -> `fact:None target=Bed3 color=brown [is] «Bed3 is, I think, brown»`
- changed: `command:create shape=triangle color=blue size=small name=Can position=between anchor=Bed1,Bed2 [add] «add the little watering can, a small blue triangle named Can between Bed1 and Bed2»` -> `command:create shape=triangle color=blue size=small name=Can position=between anchor=Bed1,Bed2 [Don't forget] «Don't forget the little watering can, a small blue triangle named Can between Bed1 and Bed2»`

### sl-0105 [span / trigger]
Reason: span starts at the subject; verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:set target=Gateway size=large color=teal shape=hexagon [should be] «should be a large teal hexagon»` -> `command:set target=Gateway size=large color=teal shape=hexagon [should be] «The Gateway should be a large teal hexagon»`
- changed: `command:move target=S2 position=leftOf anchor=Gateway [S2] «S2 left»` -> `command:move target=S2 position=leftOf anchor=Gateway [left] «S2 left»`
- changed: `command:move target=S3 position=below anchor=Gateway [S3] «S3 below»` -> `command:move target=S3 position=below anchor=Gateway [below] «S3 below»`

### sl-0106 [fact split / trigger]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- removed: `fact:None target=Lead size=large [big] «big»` -> `(no wire)`
- removed: `fact:None target=Lead color=gold [gold] «gold»` -> `(no wire)`
- removed: `fact:None target=Lead shape=diamond [diamond] «diamond»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Lead size=large color=gold shape=diamond [is] «The Lead is a big gold diamond»`
- changed: `command:move target=Queue position=top [Queue] «the Queue at the top»` -> `command:move target=Queue position=top [at the top] «the Queue at the top»`

### sl-0107 [restored]
Reason: text restored to the writer's original (coordinator); wire re-annotated; the description of the candle and 'Place it above the Cake' form one create (position above)
- changed: `command:create shape=triangle color=yellow size=small name=Candle position=above anchor=Cake [add] «add a small yellow triangle called Candle above the Cake»` -> `command:create shape=triangle color=yellow size=small name=Candle position=above anchor=Cake [Place] «a small yellow triangle called Candle on top of the Cake. Place it above the Cake»`

### sl-0108 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Follow position=right [Follow] «the Follow on the right»` -> `command:move target=Follow position=right [on the right] «the Follow on the right»`
- changed: `command:move target=Follow direction=left distance=100 [Follow] «the Follow 100 pixels to the left»` -> `command:move target=Follow direction=left distance=100 [to the left] «the Follow 100 pixels to the left»`

### sl-0110 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Assembly position=bottom [Assembly] «the Assembly at the bottom»` -> `command:move target=Assembly position=bottom [at the bottom] «the Assembly at the bottom»`

### sl-0112 [restored / should-be]
Reason: text restored to the writer's original (coordinator); wire re-annotated; 'X should be Y' is a request to change it -> command set/move (existing: 26 set + 11 move + 29 rule of 69 spans with should/must/needs to be; 0 facts); a statement that introduces a shape which is not on the canvas ('the ship's AI is a purple hexagon named Hal that sits between ...') is read as a create (existing: 0 facts about a name not on the canvas, 0 verbless creates, so no precedent; owner list)
- changed: `fact:None target=Medic color=white [should be] «Medic should be white»` -> `command:set target=Medic color=white [should be] «Medic should be white»`
- changed: `command:create shape=hexagon color=purple name=Hal position=between anchor=Pilot,Engineer [add] «add the ship's AI, a purple hexagon named Hal, between the Pilot and the Engineer»` -> `command:create shape=hexagon color=purple name=Hal position=between anchor=Pilot,Engineer [named] «the ship's AI is a purple hexagon named Hal that sits between the Pilot and the Engineer»`

### sl-0113 [span / should-be]
Reason: the move span no longer contains the next request ('make it a square'); 'X should be Y' is a request to change it -> command set/move (existing: 26 set + 11 move + 29 rule of 69 spans with should/must/needs to be; 0 facts)
- changed: `command:move target=Signal position=right [Put] «Put the Signal at the right and make it a square»` -> `command:move target=Signal position=right [Put] «Put the Signal at the right»`
- changed: `fact:None target=Track shape=square [should be] «Track should be a square too»` -> `command:set target=Track shape=square [should be] «Track should be a square too»`

### sl-0114 [restored]
Reason: text restored to the writer's original (coordinator); wire re-annotated; verbless 'the Count a gold star' = set with trigger = leading words; verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:set target=Count color=gold shape=star [Count] «uh the Count should be a gold star»` -> `command:set target=Count color=gold shape=star [the Count] «the Count a gold star»`
- changed: `command:move target=Count position=right [Count] «the Count to the right side»` -> `command:move target=Count position=right [to the right side] «the Count to the right side»`

### sl-0116 [restored / copy]
Reason: text restored to the writer's original (coordinator); wire re-annotated; verbless 'so above her' = own span 'above her', trigger = the position phrase (verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)); 'the lights' = original + copies with quantifier=all (original + its copies: 'Name,mention(recency=newest)' (+quantifier=all for plural 'all/the copies'), existing 9 mixes (e.g. sm-0549, sm2-0348))
- changed: `command:set target=Light,mention(recency=newest) color=yellow [Colour] «Colour the lights yellow»` -> `command:set target=Light,mention(quantifier=all,recency=newest) color=yellow [Colour] «Colour the lights yellow»`
- changed: `command:move target=Backdrop position=above anchor=Model [put] «put it above her»` -> `command:move target=Backdrop position=above anchor=Model [above] «above her»`

### sl-0116 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Model position=center [Model] «the Model in the middle»` -> `command:move target=Model position=center [in the middle] «the Model in the middle»`

### sl-0117 [loop split]
Reason: closing link of a loop is a separate connect after the chain (LABEL_CONVENTIONS; 4 of 4 existing + 13 in sm2); a repeated name in one chain is a self-loop in logic.js
- removed: `command:connect from=River,Cloud,Rain,River pairing=chain [connect] «connect River, Cloud, Rain and back to River»` -> `(no wire)`
- added: `(no wire)` -> `command:connect from=River,Cloud,Rain pairing=chain [connect] «connect River, Cloud, Rain»`
- added: `(no wire)` -> `command:connect from=Rain to=River [back to] «back to River»`

### sl-0119 [should-be / missing moves]
Reason: 'X should be Y' is a request to change it -> command set/move (existing: 26 set + 11 move + 29 rule of 69 spans with should/must/needs to be; 0 facts); 'I'd like the Pilot on top, the Copilot right below, ... the Attendant at the bottom' are placement requests (the Purser has no position word, so no wire); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- added: `(no wire)` -> `command:move target=Pilot position=top [I'd like] «I'd like the Pilot on top»`
- added: `(no wire)` -> `command:move target=Copilot position=below anchor=Pilot [below] «the Copilot right below»`
- added: `(no wire)` -> `command:move target=Attendant position=bottom [at the bottom] «then the Attendant at the bottom»`
- changed: `fact:None target=Pilot color=gold [should be] «The Pilot should be gold»` -> `command:set target=Pilot color=gold [should be] «The Pilot should be gold»`
- changed: `fact:None target=Copilot color=gray [Copilot] «the Copilot silver, well, gray»` -> `command:set target=Copilot color=gray [Copilot] «the Copilot silver, well, gray»`

### sl-0120 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Gripper position=top [Gripper] «the Gripper at the top»` -> `command:move target=Gripper position=top [at the top] «the Gripper at the top»`
- changed: `command:move target=Joint2 direction=down distance=30 [Joint2] «the Joint2 30 pixels down»` -> `command:move target=Joint2 direction=down distance=30 [down] «the Joint2 30 pixels down»`

### sl-0121 [should-be / trigger]
Reason: 'X should be Y' is a request to change it -> command set/move (existing: 26 set + 11 move + 29 rule of 69 spans with should/must/needs to be; 0 facts); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `fact:None target=Cooler color=teal [should be] «The Cooler should be teal»` -> `command:set target=Cooler color=teal [should be] «The Cooler should be teal»`
- changed: `fact:None target=Beans color=brown [should be] «Beans should be brown»` -> `command:set target=Beans color=brown [should be] «Beans should be brown»`
- changed: `command:move target=Bagger position=right [Bagger] «the Bagger to the far right»` -> `command:move target=Bagger position=right [to the far right] «the Bagger to the far right»`

### sl-0122 [should-be]
Reason: 'X should be Y' is a request to change it -> command set/move (existing: 26 set + 11 move + 29 rule of 69 spans with should/must/needs to be; 0 facts); elided items keep the set action
- changed: `fact:None target=Alert color=red [should be] «Alert should be red»` -> `command:set target=Alert color=red [should be] «Alert should be red»`
- changed: `fact:None target=Triage color=orange [Triage] «Triage orange»` -> `command:set target=Triage color=orange [Triage] «Triage orange»`
- changed: `fact:None target=Contain color=yellow [Contain] «Contain yellow»` -> `command:set target=Contain color=yellow [Contain] «Contain yellow»`
- changed: `fact:None target=Recover color=green [Recover] «Recover green»` -> `command:set target=Recover color=green [Recover] «Recover green»`
- changed: `fact:None target=Review color=blue [Review] «Review blue»` -> `command:set target=Review color=blue [Review] «Review blue»`

### sl-0122 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Review position=right [Review] «Review at the right»` -> `command:move target=Review position=right [at the right] «Review at the right»`

### sl-0124 [fact / should-be]
Reason: 'The Chest is gold' is a statement (fact), 'it should be a star' a request to change (set): 'X should be Y' is a request to change it -> command set/move (existing: 26 set + 11 move + 29 rule of 69 spans with should/must/needs to be; 0 facts)
- removed: `command:set target=Chest color=gold shape=star [should be] «The Chest is gold, of course, and it should be a star»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Chest color=gold [is] «The Chest is gold»`
- added: `(no wire)` -> `command:set target=Chest shape=star [should be] «it should be a star»`

### sl-0124 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Start position=topLeft [Start] «the Start in the top left»` -> `command:move target=Start position=topLeft [in the top left] «the Start in the top left»`

### sl-0125 [span]
Reason: 'set them that way' carries no content: the span starts at the sentence that gives it (sm2 precedent)
- changed: `command:set target=Turbine1,Turbine2,Turbine3 color=white shape=triangle [set] «set them that way»` -> `command:set target=Turbine1,Turbine2,Turbine3 color=white shape=triangle [set] «The turbines are white triangles, all three, set them that way»`

### sl-0126 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Exit position=right [Exit] «the Exit on the right»` -> `command:move target=Exit position=right [on the right] «the Exit on the right»`

### sl-0127 [fact split / trigger]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- removed: `fact:None target=Script size=small [small] «small»` -> `(no wire)`
- removed: `fact:None target=Script color=gray [gray] «gray»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Script size=small color=gray [is] «The Script is small and gray»`
- changed: `command:move target=Premiere position=bottomRight [Premiere] «the Premiere at the bottom right»` -> `command:move target=Premiere position=bottomRight [at the bottom right] «the Premiere at the bottom right»`

### sl-0127 [missing fact]
Reason: 'Casting stays a plain box' is a statement of how it is -> fact (cf. sl-0063 'the Port stays blue'; stated facts: sm2-0068/0527)
- added: `(no wire)` -> `fact:None target=Casting shape=rectangle [stays] «Casting stays a plain box»`

### sl-0128 [fact split]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires)
- removed: `fact:None target=Base color=blue [blue] «blue»` -> `(no wire)`
- removed: `fact:None target=Base shape=square [square] «square»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Base color=blue shape=square [is] «The Base is a blue square»`

### sl-0128 [should-be / span]
Reason: 'X should be Y' is a request to change it -> command set/move (existing: 26 set + 11 move + 29 rule of 69 spans with should/must/needs to be; 0 facts); the create span starts at the sentence that gives shape, colour and name
- removed: `fact:None target=Lodge color=brown [brown] «brown»` -> `(no wire)`
- removed: `fact:None target=Lodge shape=hexagon [hexagon] «hexagon»` -> `(no wire)`
- added: `(no wire)` -> `command:set target=Lodge color=brown shape=hexagon [should be] «Lodge should be a brown hexagon»`
- changed: `command:create shape=circle color=pink name=School position=between anchor=Lodge,Base [put] «put it between the Lodge and the Base»` -> `command:create shape=circle color=pink name=School position=between anchor=Lodge,Base [put] «The ski school is a pink circle called School, put it between the Lodge and the Base»`

### sl-0130 [span / trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205); verb ellipsis, create: trigger = leading words of the own span (existing 43 of 43); the create span no longer contains the connect request that follows
- changed: `command:move target=H1,H2 position=center [hidden] «the hidden units in the middle»` -> `command:move target=H1,H2 position=center [in the middle] «the hidden units in the middle»`
- changed: `command:move target=Out position=right [Out] «Out on the right»` -> `command:move target=Out position=right [on the right] «Out on the right»`
- changed: `command:align target=H1,H2 axis=vertical [H1] «same for H1 and H2»` -> `command:align target=H1,H2 axis=vertical [same for] «same for H1 and H2»`
- changed: `command:create shape=circle color=yellow name=Bias position=above anchor=H1,H2 [add] «add a bias node. A yellow circle called Bias above the hidden layer, connected to H1 and H2 with a dashed line»` -> `command:create shape=circle color=yellow name=Bias position=above anchor=H1,H2 [A yellow circle] «A yellow circle called Bias above the hidden layer»`

### sl-0131 [missing set]
Reason: 'tiny and orange' are two requested attributes of the Mitochondria and had no wire (own span, elided verb: set, trigger = leading words)
- removed: `command:move target=Mitochondria position=near anchor=Nucleus [put] «put the Mitochondria near the Nucleus, tiny and orange»` -> `(no wire)`
- added: `(no wire)` -> `command:move target=Mitochondria position=near anchor=Nucleus [put] «put the Mitochondria near the Nucleus»`
- added: `(no wire)` -> `command:set target=Mitochondria size=tiny color=orange [tiny] «tiny and orange»`

### sl-0132 [should-be / fact split]
Reason: 'X should be Y' is a request to change it -> command set/move (existing: 26 set + 11 move + 29 rule of 69 spans with should/must/needs to be; 0 facts)
- removed: `fact:None target=Broker color=gray [gray] «gray»` -> `(no wire)`
- removed: `fact:None target=Broker shape=hexagon [hexagon] «hexagon»` -> `(no wire)`
- added: `(no wire)` -> `command:set target=Broker color=gray shape=hexagon [should be] «The Broker should be a gray hexagon»`

### sl-0134 [loop split]
Reason: closing link of a loop is a separate connect after the chain (LABEL_CONVENTIONS; 4 of 4 existing + 13 in sm2); a repeated name in one chain is a self-loop in logic.js
- removed: `command:connect from=Dino,Space,Ocean,Gift,Dino pairing=chain [connect] «connect Dino to Space to Ocean to Gift, and then Gift back to Dino»` -> `(no wire)`
- added: `(no wire)` -> `command:connect from=Dino,Space,Ocean,Gift pairing=chain [connect] «connect Dino to Space to Ocean to Gift»`
- added: `(no wire)` -> `command:connect from=Gift to=Dino [Gift back to] «Gift back to Dino»`

### sl-0135 [fact split / trigger]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Ops,Finance position=below anchor=Board [Ops] «Ops and Finance below it»` -> `command:move target=Ops,Finance position=below anchor=Board [below] «Ops and Finance below it»`
- changed: `command:move target=Fleet,Drivers position=bottom [Fleet] «Fleet and Drivers at the bottom»` -> `command:move target=Fleet,Drivers position=bottom [at the bottom] «Fleet and Drivers at the bottom»`
- removed: `fact:None target=Ops size=large [large] «Ops is a large»` -> `(no wire)`
- removed: `fact:None target=Ops color=teal [teal] «teal»` -> `(no wire)`
- removed: `fact:None target=Ops shape=square [square] «square,»` -> `(no wire)`
- removed: `fact:None target=Finance color=gold [gold] «Finance a gold»` -> `(no wire)`
- removed: `fact:None target=Finance shape=square [square] «gold square»` -> `(no wire)`
- removed: `fact:None target=Fleet,Drivers size=small [small] «small»` -> `(no wire)`
- removed: `fact:None target=Fleet,Drivers color=gray [gray] «gray»` -> `(no wire)`
- removed: `fact:None target=Fleet,Drivers shape=circle [circles] «circles»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Ops size=large color=teal shape=square [is] «Ops is a large teal square»`
- added: `(no wire)` -> `fact:None target=Finance color=gold shape=square [Finance] «Finance a gold square»`
- added: `(no wire)` -> `fact:None target=Fleet,Drivers size=small color=gray shape=circle [are] «Fleet and Drivers are small gray circles»`

### sl-0135 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205) (arrange: the layout word)
- changed: `command:arrange target=Fleet,Drivers layout=row [Fleet] «Fleet and Drivers too»` -> `command:arrange target=Fleet,Drivers layout=row [too] «Fleet and Drivers too»`

### sl-0136 [loop split / fact split / missing move]
Reason: closing link of a loop is a separate connect after the chain (LABEL_CONVENTIONS; 4 of 4 existing + 13 in sm2); a repeated name in one chain is a self-loop in logic.js; one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); 'move the Gold 70 pixels up. That's too much, move it 20 pixels down': two sequential moves (the second is relative to the new place), the first had no wire
- removed: `command:connect from=Player,Quest,Gold,Shop,Player pairing=chain [Connect] «Connect Player, Quest, Gold, Shop and back to Player so it closes»` -> `(no wire)`
- added: `(no wire)` -> `command:connect from=Player,Quest,Gold,Shop pairing=chain [Connect] «Connect Player, Quest, Gold, Shop»`
- added: `(no wire)` -> `command:connect from=Shop to=Player [back to] «back to Player so it closes»`
- removed: `fact:None target=Shop color=green [green] «green»` -> `(no wire)`
- removed: `fact:None target=Shop shape=hexagon [hexagon] «hexagon»` -> `(no wire)`
- removed: `fact:None target=Quest color=orange [orange] «The Quest is an orange»` -> `(no wire)`
- removed: `fact:None target=Quest shape=diamond [diamond] «diamond»` -> `(no wire)`
- removed: `fact:None target=Player color=blue [blue] «the Player a blue»` -> `(no wire)`
- removed: `fact:None target=Player shape=circle [circle] «blue circle»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Shop color=green shape=hexagon [is] «The Shop is a green hexagon»`
- added: `(no wire)` -> `fact:None target=Quest color=orange shape=diamond [is] «The Quest is an orange diamond»`
- added: `(no wire)` -> `fact:None target=Player color=blue shape=circle [the Player] «the Player a blue circle»`
- added: `(no wire)` -> `command:move target=Gold direction=up distance=70 [move] «move the Gold 70 pixels up»`

### sl-0137 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Keg position=right [Keg] «Keg on the far right»` -> `command:move target=Keg position=right [on the far right] «Keg on the far right»`

### sl-0138 [fact split / span]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); the Canyon fact span no longer contains the next request
- changed: `fact:None target=Canyon color=red [is] «The Canyon is red, red rock, and make it a triangle»` -> `fact:None target=Canyon color=red [is] «The Canyon is red»`
- removed: `fact:None target=Motel size=small [small] «small»` -> `(no wire)`
- removed: `fact:None target=Motel color=gray [gray] «gray»` -> `(no wire)`
- removed: `fact:None target=Motel shape=square [square] «square»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Motel size=small color=gray shape=square [is] «The Motel is a small gray square»`

### sl-0138 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Motel position=topRight [Motel] «the Motel at the top right»` -> `command:move target=Motel position=topRight [at the top right] «the Motel at the top right»`

### sl-0139 [should-be / fact split]
Reason: 'X should be Y' is a request to change it -> command set/move (existing: 26 set + 11 move + 29 rule of 69 spans with should/must/needs to be; 0 facts); one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires)
- changed: `command:connect from=Router to=Push [Push] «Router to Push too»` -> `command:connect from=Router to=Push [Router to] «Router to Push too»`
- removed: `fact:None target=Store color=teal [teal] «Store should be a teal»` -> `(no wire)`
- removed: `fact:None target=Store shape=rectangle [rectangle] «rectangle»` -> `(no wire)`
- removed: `fact:None target=Push color=pink [pink] «Push a pink»` -> `(no wire)`
- removed: `fact:None target=Push shape=star [star] «pink star»` -> `(no wire)`
- removed: `fact:None target=Client,Socket size=small [small] «small»` -> `(no wire)`
- removed: `fact:None target=Client,Socket shape=circle [circles] «circles»` -> `(no wire)`
- added: `(no wire)` -> `command:set target=Store color=teal shape=rectangle [should be] «Store should be a teal rectangle»`
- added: `(no wire)` -> `command:set target=Push color=pink shape=star [Push] «Push a pink star»`
- added: `(no wire)` -> `fact:None target=Client,Socket size=small shape=circle [are] «The Client and the Socket are both small circles»`

### sl-0139 [superlative]
Reason: yes/no superlative question -> extreme, superlative only (existing 94 of 96): 'Is Router the most connected?' was not wired
- added: `(no wire)` -> `question:extreme superlative=mostConnected [most connected] «Is Router the most connected»`

### sl-0140 [trigger]
Reason: verb ellipsis, set: trigger = the position phrase of the own span (existing 180 of 205) (set: leading words)
- changed: `command:set target=mention(notcolor=blue,quantifier=all,shape=rectangle) shape=square [squares] «all the boxes that are not blue into squares»` -> `command:set target=mention(notcolor=blue,quantifier=all,shape=rectangle) shape=square [all the boxes] «all the boxes that are not blue into squares»`

### sl-0142 [trigger / missing fact]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205); verb ellipsis, create: trigger = leading words of the own span (existing 43 of 43); stated fact 'The City is a gray rectangle' had no wire (sm2-0068/0527 precedent)
- added: `(no wire)` -> `fact:None target=City color=gray shape=rectangle [is] «The City is a gray rectangle»`
- changed: `command:move target=Hero position=leftOf anchor=City [Hero] «the Hero left of it»` -> `command:move target=Hero position=leftOf anchor=City [left of] «the Hero left of it»`
- changed: `command:move target=Nemesis position=rightOf anchor=City [Nemesis] «the Nemesis right of it»` -> `command:move target=Nemesis position=rightOf anchor=City [right of] «the Nemesis right of it»`
- changed: `command:create shape=circle color=gold name=Twin position=near anchor=Nemesis [placed] «a gold circle called Twin, placed near the Nemesis»` -> `command:create shape=circle color=gold name=Twin position=near anchor=Nemesis [a gold circle] «a gold circle called Twin, placed near the Nemesis»`

### sl-0142 [connect pairs]
Reason: three independent links (Hero->City, Sidekick->Hero, Nemesis->City): 'from Hero,Sidekick,Nemesis to City' would also create Sidekick->City; one connect per link, own spans
- removed: `command:connect from=Hero,Sidekick,Nemesis to=City [Draw] «Draw an arrow from Hero to City, one from Sidekick to Hero, and one from Nemesis to City»` -> `(no wire)`
- added: `(no wire)` -> `command:connect from=Hero to=City [Draw] «Draw an arrow from Hero to City»`
- added: `(no wire)` -> `command:connect from=Sidekick to=Hero [one from] «one from Sidekick to Hero»`
- added: `(no wire)` -> `command:connect from=Nemesis to=City [one from] «one from Nemesis to City»`

### sl-0143 [missing command]
Reason: conditional request 'If not, enlarge the Tank' had no wire (conditionals are wired: sm2-0225/0279/0399/0505)
- added: `(no wire)` -> `command:resize target=Tank [enlarge] «enlarge the Tank»`

### sl-0144 [span / trigger]
Reason: 'set all of them' carries no content: the span starts at the sentence that gives it; verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:set target=Dock1,Dock2,Dock3 color=green shape=circle [set] «set all of them»` -> `command:set target=Dock1,Dock2,Dock3 color=green shape=circle [set] «The docks are green circles, set all of them»`
- changed: `command:move target=Dock1 position=top [Dock1] «Dock1 at the top»` -> `command:move target=Dock1 position=top [at the top] «Dock1 at the top»`
- changed: `command:move target=Dock2 position=bottomLeft [Dock2] «Dock2 at the bottom left»` -> `command:move target=Dock2 position=bottomLeft [at the bottom left] «Dock2 at the bottom left»`
- changed: `command:move target=Dock3 position=bottomRight [Dock3] «Dock3 at the bottom right»` -> `command:move target=Dock3 position=bottomRight [at the bottom right] «Dock3 at the bottom right»`

### sl-0145 [restored / rename follow-up]
Reason: text restored to the writer's original (coordinator); wire re-annotated ('Support is a cyan circle' is a statement = fact); follow-up after a rename uses the name as written ('Is the Reserve a star', 16/17 existing); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Support position=leftOf anchor=Captain [Support] «Support to the left of the Captain»` -> `command:move target=Support position=leftOf anchor=Captain [to the left of] «Support to the left of the Captain»`
- changed: `command:move target=Carry position=rightOf anchor=Captain [Carry] «Carry to the right»` -> `command:move target=Carry position=rightOf anchor=Captain [to the right] «Carry to the right»`
- changed: `question:check target=mention(recency=newest) shape=star [Is] «Is the Reserve a star»` -> `question:check target=Reserve shape=star [Is] «Is the Reserve a star»`
- changed: `command:set target=Support color=cyan shape=circle [Make] «Make Support a cyan circle»` -> `fact:None target=Support color=cyan shape=circle [is] «Support is a cyan circle»`

### sl-0147 [restored]
Reason: text restored to the writer's original (coordinator); wire re-annotated ('The Keeper is a small gray circle placed just below the Tower' = fact + position fact, statement 'X is above / sits left of Y' -> fact position+anchor (existing: 8 of 8)); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Lamp position=above anchor=Tower [Lamp] «the Lamp above it»` -> `command:move target=Lamp position=above anchor=Tower [above] «the Lamp above it»`
- removed: `command:move target=Keeper position=below anchor=Tower [placed] «placed just below the Tower»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Keeper size=small color=gray shape=circle [is] «The Keeper is a small gray circle»`
- added: `(no wire)` -> `fact:None target=Keeper position=below anchor=Tower [placed] «placed just below the Tower»`

### sl-0147 [restored]
Reason: text restored to the writer's original (coordinator); wire re-annotated; the writer's set 'Make the Keeper a small gray circle' is replaced by the two facts above (statement of how the Keeper is)
- removed: `command:set target=Keeper size=small color=gray shape=circle [Make] «Make the Keeper a small gray circle»` -> `(no wire)`

### sl-0149 [restored]
Reason: text restored to the writer's original (coordinator); wire re-annotated; 'The Room is a big green square. Tutor is a purple circle and Student an orange one' are statements = facts; the connect span covers the self-correction chain (sm2-0280 precedent)
- changed: `command:connect from=Student,Tutor to=Room [connect] «connect Student and Tutor to the Room»` -> `command:connect from=Student,Tutor to=Room [connect] «Draw it as a chain from Student to Tutor to Room to Report. No wait, the Room comes after the Tutor only in the sense that they meet there, so make it a three-way link: connect Student and Tutor to the Room»`
- removed: `command:set target=Student color=orange shape=circle [Student] «Student an orange one»` -> `(no wire)`
- removed: `command:set target=Room size=large color=green shape=square [Make] «Make the Room a big green square»` -> `(no wire)`
- removed: `command:set target=Tutor color=purple shape=circle [Make] «Make Tutor a purple circle»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Room size=large color=green shape=square [is] «The Room is a big green square»`
- added: `(no wire)` -> `fact:None target=Tutor color=purple shape=circle [is] «Tutor is a purple circle»`
- added: `(no wire)` -> `fact:None target=Student color=orange shape=circle [Student] «Student an orange one»`

### sl-0152 [restored]
Reason: text restored to the writer's original (coordinator); wire re-annotated ('The Tower is a gray rectangle left of the Rocket, and Control is a lime ellipse at the top right' = facts, a stated 'X is a big rectangle' is a fact (existing: sm2-0068/0527 added, 200 single + 36 multi-key facts); position fact statement 'X is above / sits left of Y' -> fact position+anchor (existing: 8 of 8); canvas place -> move, statement of a canvas place ('X goes/sits/is at the top') -> move (existing: 18 of 22 canvas-place statements are move wires, 4 unwired)); the create span starts at the sentence that carries the content; verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Rocket position=above anchor=Pad [Rocket] «the Rocket right above it»` -> `command:move target=Rocket position=above anchor=Pad [above] «the Rocket right above it»`
- changed: `command:set target=Tower color=gray shape=rectangle [Make] «Make the Tower a gray rectangle»` -> `fact:None target=Tower color=gray shape=rectangle [is] «The Tower is a gray rectangle»`
- changed: `command:move target=Tower position=leftOf anchor=Rocket [put] «put it left of the Rocket»` -> `fact:None target=Tower position=leftOf anchor=Rocket [left of] «left of the Rocket»`
- changed: `command:set target=Control color=lime shape=ellipse [Make] «Make Control a lime ellipse»` -> `fact:None target=Control color=lime shape=ellipse [is] «Control is a lime ellipse»`
- changed: `command:move target=Control position=topRight [put] «put it at the top right»` -> `command:move target=Control position=topRight [at the top right] «at the top right»`
- changed: `command:create shape=circle color=red name=Timer position=near anchor=Control [Add] «Add the countdown, a red circle called Timer, near the Control»` -> `command:create shape=circle color=red name=Timer position=near anchor=Control [Add] «The countdown is a red circle called Timer, near the Control. Add it»`

### sl-0153 [restored]
Reason: text restored to the writer's original (coordinator); wire re-annotated ('The Port is a gold star' is a statement = fact); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Port position=right [Port] «the Port at the right»` -> `command:move target=Port position=right [at the right] «the Port at the right»`
- changed: `command:set target=Port color=gold shape=star [Make] «Make the Port a gold star»` -> `fact:None target=Port color=gold shape=star [is] «The Port is a gold star»`

### sl-0154 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Stove position=topRight [Stove] «the Stove at the top right»` -> `command:move target=Stove position=topRight [at the top right] «the Stove at the top right»`
- changed: `command:move target=Sink position=bottom [Sink] «the Sink at the bottom»` -> `command:move target=Sink position=bottom [at the bottom] «the Sink at the bottom»`

### sl-0155 [restored]
Reason: text restored to the writer's original (coordinator); wire re-annotated ('The Lobby is a small white circle' is a statement = fact); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=HallA,HallB position=above anchor=Lobby [halls] «the halls above it side by side»` -> `command:move target=HallA,HallB position=above anchor=Lobby [above] «the halls above it side by side»`
- changed: `command:move target=Cinema position=top [Cinema] «the Cinema at the very top»` -> `command:move target=Cinema position=top [at the very top] «the Cinema at the very top»`
- changed: `command:set target=Lobby size=small color=white shape=circle [Make] «Make the Lobby a small white circle»` -> `fact:None target=Lobby size=small color=white shape=circle [is] «The Lobby is a small white circle»`

### sl-0157 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Incubator position=right [Incubator] «the Incubator on the right»` -> `command:move target=Incubator position=right [on the right] «the Incubator on the right»`

### sl-0158 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Tour position=below anchor=Home [Tour] «Tour below Home»` -> `command:move target=Tour position=below anchor=Home [below] «Tour below Home»`

### sl-0159 [fact / trigger]
Reason: statement 'X is above / sits left of Y' -> fact position+anchor (existing: 8 of 8); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=R1,R2,R4 position=above anchor=R3 [others] «the others above it»` -> `command:move target=R1,R2,R4 position=above anchor=R3 [above] «the others above it»`
- added: `(no wire)` -> `fact:None target=R4 position=near anchor=R3 [sits] «R4 sits near R3»`

### sl-0160 [superlative]
Reason: yes/no superlative question -> extreme with the superlative only, no target (existing: 94 of 96 'Is X the leftmost/biggest...')
- added: `(no wire)` -> `question:extreme superlative=rightmost [rightmost] «Is Lisbon the rightmost»`

### sl-0161 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Throne position=center [Throne] «Throne in the middle»` -> `command:move target=Throne position=center [in the middle] «Throne in the middle»`
- changed: `command:move target=Sword position=rightOf anchor=Throne [Sword] «Sword to its right»` -> `command:move target=Sword position=rightOf anchor=Throne [to its right] «Sword to its right»`
- changed: `command:move target=Crown position=above anchor=Throne [Crown] «Crown above it»` -> `command:move target=Crown position=above anchor=Throne [above] «Crown above it»`

### sl-0162 [restored / take-back]
Reason: text restored to the writer's original (coordinator); wire re-annotated ('should look alike, both gray rectangles' = set, 'X should be Y' is a request to change it -> command set/move (existing: 26 set + 11 move + 29 rule of 69 spans with should/must/needs to be; 0 facts)); 'Never mind the dashes' takes the dashed style back -> plain arrow, span covers the correction; verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205); verb ellipsis, create: trigger = leading words of the own span (existing 43 of 43)
- changed: `command:move target=Report position=right [Report] «the Report on the right»` -> `command:move target=Report position=right [on the right] «the Report on the right»`
- changed: `command:create shape=diamond color=yellow name=Monitor position=above anchor=Etl [placed] «a yellow diamond called Monitor placed above the Etl»` -> `command:create shape=diamond color=yellow name=Monitor position=above anchor=Etl [a yellow diamond] «a yellow diamond called Monitor placed above the Etl»`
- changed: `command:connect from=Report to=$new style=dashed [link] «link Report to Monitor with a dashed arrow»` -> `command:connect from=Report to=$new [link] «link Report to Monitor with a dashed arrow. Never mind the dashes»`
- changed: `command:set target=Crm,Erp color=gray shape=rectangle [Make] «Make the two sources look alike, both gray rectangles»` -> `command:set target=Crm,Erp color=gray shape=rectangle [should look alike] «The two sources should look alike, both gray rectangles»`

### sl-0163 [copy mention]
Reason: 'the copies' / 'all of them' (= the copies) -> mention(quantifier=all,recency=newest) (6 of 7 existing plural copies); the writer's mention(quantifier=all) would be every shape
- changed: `command:move target=mention(recency=newest) position=below anchor=Nest [Put] «Put the copies below the Nest»` -> `command:move target=mention(quantifier=all,recency=newest) position=below anchor=Nest [Put] «Put the copies below the Nest»`
- changed: `command:align target=mention(quantifier=all) axis=horizontal [line] «line all of them up horizontally»` -> `command:align target=mention(quantifier=all,recency=newest) axis=horizontal [line] «line all of them up horizontally»`

### sl-0164 [several to one / trigger]
Reason: 'Connect Ladder to Platform and Slide to Platform' = several to one: ONE connect from 'Ladder,Slide' to Platform, one span (LABEL_CONVENTIONS); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- removed: `command:move target=Roof position=above anchor=Platform [Roof] «the Roof above it»` -> `(no wire)`
- removed: `command:connect from=Ladder to=Platform arrow=none [Connect] «Connect Ladder to Platform»` -> `(no wire)`
- removed: `command:connect from=Slide to=Platform arrow=none [Slide] «Slide to Platform with plain lines»` -> `(no wire)`
- added: `(no wire)` -> `command:move target=Roof position=above anchor=Platform [above] «the Roof above it»`
- added: `(no wire)` -> `command:connect from=Ladder,Slide to=Platform arrow=none [Connect] «Connect Ladder to Platform and Slide to Platform with plain lines»`
- changed: `command:move target=Ladder position=leftOf anchor=Platform [Ladder] «the Ladder to the left of it»` -> `command:move target=Ladder position=leftOf anchor=Platform [to the left of] «the Ladder to the left of it»`

### sl-0165 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205); elided connect: leading phrase
- changed: `command:move target=Lea,Tom position=bottom [Lea] «Lea and Tom at the bottom»` -> `command:move target=Lea,Tom position=bottom [at the bottom] «Lea and Tom at the bottom»`
- changed: `command:connect from=Lea to=Tom arrow=none [Lea] «Lea to Tom, plain lines»` -> `command:connect from=Lea to=Tom arrow=none [Lea to] «Lea to Tom, plain lines»`

### sl-0167 [restored / fact]
Reason: text restored to the writer's original (coordinator); wire re-annotated; 'Make it so' carries no content -> span starts at the statement; 'Camera is ... , the Guard a green triangle' are statements = facts; statement of a canvas place ('X goes/sits/is at the top') -> move (existing: 18 of 22 canvas-place statements are move wires, 4 unwired)
- changed: `command:set target=Camera size=small color=white shape=circle [is] «Camera is a small white circle»` -> `fact:None target=Camera size=small color=white shape=circle [is] «Camera is a small white circle»`
- changed: `command:set target=Guard color=green shape=triangle [Guard] «the Guard a green triangle»` -> `fact:None target=Guard color=green shape=triangle [the Guard] «the Guard a green triangle»`
- changed: `command:move target=Guard,Camera position=near anchor=Door [Guard] «the Guard and the Camera on either side of the Door»` -> `command:move target=Guard,Camera position=near anchor=Door [on either side of] «the Guard and the Camera on either side of the Door»`
- removed: `command:set target=Vault color=gold shape=star size=large [Make] «Make the Vault a gold star, a big one»` -> `(no wire)`
- added: `(no wire)` -> `command:set target=Vault color=gold shape=star size=large [Make] «The Vault is gold, a big star, naturally. Make it so, colour and shape and size»`
- added: `(no wire)` -> `command:move target=Door position=center [sits in] «which sits in the middle»`

### sl-0168 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Agent position=bottom [Agent] «the Agent at the bottom»` -> `command:move target=Agent position=bottom [at the bottom] «the Agent at the bottom»`

### sl-0169 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Cow,Pig,Hen position=near anchor=Barn [animals] «the three animals around it»` -> `command:move target=Cow,Pig,Hen position=near anchor=Barn [around] «the three animals around it»`

### sl-0170 [copy mention]
Reason: 'the copies' -> mention(quantifier=all,recency=newest) (6 of 7 existing)
- changed: `command:move target=mention(recency=newest) position=below anchor=$new [Put] «Put the copies below the original one»` -> `command:move target=mention(quantifier=all,recency=newest) position=below anchor=$new [Put] «Put the copies below the original one»`

### sl-0171 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Bale position=right [Bale] «the Bale on the right»` -> `command:move target=Bale position=right [on the right] «the Bale on the right»`

### sl-0172 [canvas / trigger]
Reason: statement of a canvas place ('X goes/sits/is at the top') -> move (existing: 18 of 22 canvas-place statements are move wires, 4 unwired); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- added: `(no wire)` -> `command:move target=Lobby position=center [in the middle] «Lobby in the middle»`
- changed: `command:move target=Hall2 position=rightOf anchor=Lobby [Hall2] «Hall2 right of it»` -> `command:move target=Hall2 position=rightOf anchor=Lobby [right of] «Hall2 right of it»`
- changed: `command:move target=Snacks position=below anchor=Lobby [Snacks] «the Snacks below»` -> `command:move target=Snacks position=below anchor=Lobby [below] «the Snacks below»`

### sl-0173 [fact split / trigger]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- removed: `fact:None target=Park color=green [is] «The Park is green, a circle»` -> `(no wire)`
- removed: `fact:None target=Park shape=circle [circle] «a circle»` -> `(no wire)`
- removed: `fact:None target=Finish size=huge [huge] «a huge»` -> `(no wire)`
- removed: `fact:None target=Finish color=red [red] «red»` -> `(no wire)`
- removed: `fact:None target=Finish shape=square [square] «square»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Park color=green shape=circle [is] «The Park is green, a circle»`
- added: `(no wire)` -> `fact:None target=Finish size=huge color=red shape=square [is] «The Finish is a huge red square»`
- changed: `command:move target=Finish position=right [Finish] «the Finish to the far right»` -> `command:move target=Finish position=right [to the far right] «the Finish to the far right»`

### sl-0174 [arrow]
Reason: 'line' with no statement of no arrowheads -> no arrow key (existing: bare 'line' 177 of 183 carry no arrow key; arrow=none only with an explicit plain / no arrowhead / without arrow)
- changed: `command:connect from=Plant to=Factory color=red style=dashed arrow=none [Draw] «Draw a red dashed line from the Plant straight to the Factory»` -> `command:connect from=Plant to=Factory color=red style=dashed [Draw] «Draw a red dashed line from the Plant straight to the Factory»`

### sl-0175 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Pear position=bottom [Pear] «the Pear at the bottom»` -> `command:move target=Pear position=bottom [at the bottom] «the Pear at the bottom»`
- changed: `command:move target=Plum position=between anchor=Apple,Pear [Plum] «the Plum between them»` -> `command:move target=Plum position=between anchor=Apple,Pear [between them] «the Plum between them»`

### sl-0177 [fact / trigger]
Reason: a stated 'X is a big rectangle' is a fact (existing: sm2-0068/0527 added, 200 single + 36 multi-key facts); the set request keeps only the colour its span says; verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- removed: `command:set target=Mum,Dad,Kid1,Kid2 color=blue shape=circle [make] «make Mum, Dad, Kid1 and Kid2 blue»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Mum,Dad,Kid1,Kid2 color=blue shape=circle [are] «The people are all blue circles»`
- added: `(no wire)` -> `command:set target=Mum,Dad,Kid1,Kid2 color=blue [make] «make Mum, Dad, Kid1 and Kid2 blue»`
- changed: `command:move target=Mum,Dad position=top [parents] «the parents on top, side by side»` -> `command:move target=Mum,Dad position=top [on top] «the parents on top, side by side»`

### sl-0178 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Hawk position=right [Hawk] «the Hawk to the right edge»` -> `command:move target=Hawk position=right [to the right edge] «the Hawk to the right edge»`

### sl-0179 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Publish position=right [Publish] «Publish at the far right»` -> `command:move target=Publish position=right [at the far right] «Publish at the far right»`

### sl-0180 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Pad1 position=left [Pad1] «Pad1 on the left»` -> `command:move target=Pad1 position=left [on the left] «Pad1 on the left»`
- changed: `command:move target=Pad2 position=right [Pad2] «Pad2 on the right»` -> `command:move target=Pad2 position=right [on the right] «Pad2 on the right»`

### sl-0181 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Gate position=bottom [Gate] «the Gate at the bottom»` -> `command:move target=Gate position=bottom [at the bottom] «the Gate at the bottom»`

### sl-0183 [fact split / trigger]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- removed: `fact:None target=Customs color=blue [blue] «Customs is a blue hexagon»` -> `(no wire)`
- removed: `fact:None target=Customs shape=hexagon [hexagon] «hexagon»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Customs color=blue shape=hexagon [is] «Customs is a blue hexagon»`
- changed: `command:move target=Exit position=right [Exit] «the Exit on the far right»` -> `command:move target=Exit position=right [on the far right] «the Exit on the far right»`
- changed: `command:move target=Interview position=below anchor=Passport [Interview] «the Interview below Passport»` -> `command:move target=Interview position=below anchor=Passport [below] «the Interview below Passport»`

### sl-0184 [fact split]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires)
- removed: `fact:None target=Solar color=yellow [yellow] «The Solar is a yellow rectangle»` -> `(no wire)`
- removed: `fact:None target=Solar shape=rectangle [rectangle] «rectangle»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Solar color=yellow shape=rectangle [is] «The Solar is a yellow rectangle»`

### sl-0188 [fact split / trigger]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); arrange with elided verb: trigger = the layout phrase
- removed: `command:arrange target=Choir,Board,Youth layout=row [others] «the others in a row below»` -> `(no wire)`
- removed: `fact:None target=Choir size=large [large] «The Choir is a large»` -> `(no wire)`
- removed: `fact:None target=Choir color=purple [purple] «purple»` -> `(no wire)`
- removed: `fact:None target=Choir shape=circle [circle] «circle»` -> `(no wire)`
- removed: `fact:None target=Board color=gray [gray] «the Board a gray»` -> `(no wire)`
- removed: `fact:None target=Board shape=square [square] «square»` -> `(no wire)`
- removed: `fact:None target=Youth size=small [small] «the Youth a small»` -> `(no wire)`
- removed: `fact:None target=Youth color=lime [lime] «lime»` -> `(no wire)`
- removed: `fact:None target=Youth shape=star [star] «star»` -> `(no wire)`
- added: `(no wire)` -> `command:arrange target=Choir,Board,Youth layout=row [in a row] «the others in a row below»`
- added: `(no wire)` -> `fact:None target=Choir size=large color=purple shape=circle [is] «The Choir is a large purple circle»`
- added: `(no wire)` -> `fact:None target=Board color=gray shape=square [the Board] «the Board a gray square»`
- added: `(no wire)` -> `fact:None target=Youth size=small color=lime shape=star [the Youth] «the Youth a small lime star»`

### sl-0189 [trigger]
Reason: verb ellipsis, set: leading words of the own span (existing 136 of 137)
- changed: `command:set target=Guard color=red shape=triangle [Guard] «the Guard a red triangle»` -> `command:set target=Guard color=red shape=triangle [the Guard] «the Guard a red triangle»`

### sl-0190 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Tropics position=bottom [Tropics] «the Tropics at the bottom»` -> `command:move target=Tropics position=bottom [at the bottom] «the Tropics at the bottom»`

### sl-0191 [group arrange / trigger]
Reason: 'in a column' states a layout -> arrange, target only the group + layout (existing: sm-0046 'Arrange TeamA and TeamB in a column on the left', sm2-0272 'Put the profs in a column to the right of Dean' are arrange only, no move; 3 cases, listed for the owner); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Flour,Milk,Egg position=left [Put] «Put the three ingredients in a column on the left»` -> `command:arrange target=Flour,Milk,Egg layout=column [Put] «Put the three ingredients in a column on the left»`
- changed: `command:move target=Batter position=center [Batter] «the Batter in the middle»` -> `command:move target=Batter position=center [in the middle] «the Batter in the middle»`
- changed: `command:move target=Pancake position=right [Pancake] «the Pancake on the right»` -> `command:move target=Pancake position=right [on the right] «the Pancake on the right»`

### sl-0193 [missing fact / trigger]
Reason: 'it's a gold star' is a stated colour and shape that no later request repeats -> fact (R_FACTSTAT); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=North position=above anchor=Capital [North] «North above it»` -> `command:move target=North position=above anchor=Capital [above] «North above it»`
- changed: `command:move target=South position=below anchor=Capital [South] «South below it»` -> `command:move target=South position=below anchor=Capital [below] «South below it»`
- changed: `command:move target=East position=rightOf anchor=Capital [East] «East on the right»` -> `command:move target=East position=rightOf anchor=Capital [on the right] «East on the right»`
- changed: `command:move target=West position=leftOf anchor=Capital [West] «West on the left»` -> `command:move target=West position=leftOf anchor=Capital [on the left] «West on the left»`
- added: `(no wire)` -> `fact:None target=Capital color=gold shape=star [it's] «it's a gold star»`

### sl-0194 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Chat position=right [Chat] «the Chat on the right»` -> `command:move target=Chat position=right [on the right] «the Chat on the right»`
- changed: `command:move target=Swipe,Match position=between anchor=Profile,Chat [Swipe] «Swipe and Match between them»` -> `command:move target=Swipe,Match position=between anchor=Profile,Chat [between them] «Swipe and Match between them»`

### sl-0195 [arrow]
Reason: 'line' with no statement of no arrowheads -> no arrow key (existing: bare 'line' 177 of 183 carry no arrow key; arrow=none only with an explicit plain / no arrowhead / without arrow)
- changed: `command:connect from=Queen,Rook,Pawn to=King arrow=none [Draw] «Draw a line from each of the other pieces to the King»` -> `command:connect from=Queen,Rook,Pawn to=King [Draw] «Draw a line from each of the other pieces to the King»`

### sl-0195 [fact split]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires)
- removed: `fact:None target=Queen size=large [large] «The Queen is large and purple»` -> `(no wire)`
- removed: `fact:None target=Queen color=purple [purple] «purple»` -> `(no wire)`
- removed: `fact:None target=Rook size=medium [medium] «the Rook medium and gray»` -> `(no wire)`
- removed: `fact:None target=Rook color=gray [gray] «gray»` -> `(no wire)`
- removed: `fact:None target=Pawn size=tiny [tiny] «the Pawn tiny and white»` -> `(no wire)`
- removed: `fact:None target=Pawn color=white [white] «white»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Queen size=large color=purple [is] «The Queen is large and purple»`
- added: `(no wire)` -> `fact:None target=Rook size=medium color=gray [the Rook] «the Rook medium and gray»`
- added: `(no wire)` -> `fact:None target=Pawn size=tiny color=white [the Pawn] «the Pawn tiny and white»`

### sl-0195 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Queen,Rook,Pawn position=near anchor=King [others] «the others around him»` -> `command:move target=Queen,Rook,Pawn position=near anchor=King [around] «the others around him»`

### sl-0196 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Speaker position=right [Speaker] «the Speaker on the far right»` -> `command:move target=Speaker position=right [on the far right] «the Speaker on the far right»`

### sl-0197 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Sensor position=above anchor=Controller [Sensor] «the Sensor above it»` -> `command:move target=Sensor position=above anchor=Controller [above] «the Sensor above it»`
- changed: `command:move target=Fan position=left [Fan] «the Fan on the left»` -> `command:move target=Fan position=left [on the left] «the Fan on the left»`
- changed: `command:move target=Heater position=right [Heater] «the Heater on the right»` -> `command:move target=Heater position=right [on the right] «the Heater on the right»`

### sl-0198 [fact split / missing move]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); 'the others around X' -> move position=near anchor X, trigger 'around' (as sl-0195)
- removed: `fact:None target=Heir color=gold [gold] «The Heir is a gold diamond»` -> `(no wire)`
- removed: `fact:None target=Heir shape=diamond [diamond] «diamond»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Heir color=gold shape=diamond [is] «The Heir is a gold diamond»`
- added: `(no wire)` -> `command:move target=Butler,Cook,Gardener,Heir position=near anchor=Victim [around] «the others around»`

### sl-0199 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Cats position=right [Cats] «the Cats to the right»` -> `command:move target=Cats position=right [to the right] «the Cats to the right»`
- changed: `command:move target=Fish position=top [Fish] «the Fish to the top»` -> `command:move target=Fish position=top [to the top] «the Fish to the top»`
- changed: `command:move target=Cashier position=bottom [Cashier] «the Cashier to the bottom»` -> `command:move target=Cashier position=bottom [to the bottom] «the Cashier to the bottom»`

### sl-0200 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205) / set: leading words
- changed: `command:move target=Tag,Author,Comment position=near anchor=Article [other three] «the other three around it»` -> `command:move target=Tag,Author,Comment position=near anchor=Article [around] «the other three around it»`

### sl-0201 [move -> arrange]
Reason: 'in a row / column [below X]' states a layout -> arrange row/column, target + layout only (existing: 6 of 6 arrange, 0 move: sm-0156, sm-0234, sm-0415, sm2-0171, sm2-0272, sm2-0434)
- changed: `command:move target=Mage,Rogue,Healer position=below anchor=Master [lieutenants] «the three lieutenants in a row below him»` -> `command:arrange target=Mage,Rogue,Healer layout=row [in a row] «the three lieutenants in a row below him»`

### sl-0203 [move -> arrange / fact split / trigger]
Reason: 'in a row / column [below X]' states a layout -> arrange row/column, target + layout only (existing: 6 of 6 arrange, 0 move: sm-0156, sm-0234, sm-0415, sm2-0171, sm2-0272, sm2-0434); one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Stand position=rightOf anchor=Stage [Stand] «the Stand right of it»` -> `command:move target=Stand position=rightOf anchor=Stage [right of] «the Stand right of it»`
- changed: `command:move target=Stage position=center [Stage] «with the Stage in the center»` -> `command:move target=Stage position=center [in the center] «with the Stage in the center»`
- removed: `command:move target=mention(quantifier=all,recency=newest) position=below anchor=Stage [Line up] «Line up all the copies in a row below the Stage»` -> `(no wire)`
- removed: `fact:None target=Stage size=large [big] «The Stage is a big purple rectangle»` -> `(no wire)`
- removed: `fact:None target=Stage color=purple [purple] «purple»` -> `(no wire)`
- removed: `fact:None target=Stage shape=rectangle [rectangle] «rectangle»` -> `(no wire)`
- added: `(no wire)` -> `command:arrange target=mention(quantifier=all,recency=newest) layout=row [Line up] «Line up all the copies in a row below the Stage»`
- added: `(no wire)` -> `fact:None target=Stage size=large color=purple shape=rectangle [is] «The Stage is a big purple rectangle»`

### sl-0204 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Lamp position=bottomRight [Lamp] «the Lamp on the bottom right»` -> `command:move target=Lamp position=bottomRight [on the bottom right] «the Lamp on the bottom right»`

### sl-0205 [fact split]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires)
- removed: `fact:None target=Band color=red [red] «The Band is a red star»` -> `(no wire)`
- removed: `fact:None target=Band shape=star [star] «star»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Band color=red shape=star [is] «The Band is a red star»`

### sl-0206 [loop split]
Reason: closing link of a loop is a separate connect after the chain (LABEL_CONVENTIONS; 4 of 4 existing + 13 in sm2); a repeated name in one chain is a self-loop in logic.js; the closing link takes the span 'ending at the Chief' (as sl-0097, sl-0117)
- removed: `command:connect from=Chief,Block1,Block2,Block3,Chief pairing=chain [Connect] «Connect all of that in one chain ending at the Chief»` -> `(no wire)`
- added: `(no wire)` -> `command:connect from=Chief,Block1,Block2,Block3 pairing=chain [Connect] «Connect all of that in one chain»`
- added: `(no wire)` -> `command:connect from=Block3 to=Chief [ending at] «ending at the Chief»`
- changed: `command:move target=Block1,Block2,Block3 position=near anchor=Chief [blocks] «the three blocks around»` -> `command:move target=Block1,Block2,Block3 position=near anchor=Chief [around] «the three blocks around»`

### sl-0207 [fact split / canvas / trigger]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); statement of a canvas place ('X goes/sits/is at the top') -> move (existing: 18 of 22 canvas-place statements are move wires, 4 unwired); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- added: `(no wire)` -> `command:move target=Hub position=center [in the middle] «The Hub is in the middle»`
- removed: `fact:None target=Rome,Oslo,Lima,Cairo color=blue [are] «The cities are blue circles, all four of them»` -> `(no wire)`
- removed: `fact:None target=Rome,Oslo,Lima,Cairo shape=circle [circles] «circles»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Rome,Oslo,Lima,Cairo color=blue shape=circle [are] «The cities are blue circles, all four of them»`
- changed: `command:move target=Lima position=bottom [Lima] «Lima at the bottom»` -> `command:move target=Lima position=bottom [at the bottom] «Lima at the bottom»`
- changed: `command:move target=Rome position=right [Rome] «Rome on the right»` -> `command:move target=Rome position=right [on the right] «Rome on the right»`
- changed: `command:move target=Cairo position=left [Cairo] «Cairo on the left»` -> `command:move target=Cairo position=left [on the left] «Cairo on the left»`

### sl-0208 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Inspect position=center [Inspect] «Inspect in the middle»` -> `command:move target=Inspect position=center [in the middle] «Inspect in the middle»`
- changed: `command:move target=Refund,Restock position=right [other two] «the other two on the right»` -> `command:move target=Refund,Restock position=right [on the right] «the other two on the right»`

### sl-0209 [fact split / trigger / missing arrange]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205); 'one above the other' = a column, a stated layout -> arrange column (R_ROW precedent)
- removed: `fact:None target=Pay color=gold [gold] «Pay is a gold star, big»` -> `(no wire)`
- removed: `fact:None target=Pay shape=star [star] «star»` -> `(no wire)`
- removed: `fact:None target=Pay size=large [big] «big»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Pay color=gold shape=star size=large [is] «Pay is a gold star, big»`
- changed: `command:move target=Adjuster position=near anchor=Claim [Adjuster] «the Adjuster next to it»` -> `command:move target=Adjuster position=near anchor=Claim [next to] «the Adjuster next to it»`
- changed: `command:move target=Pay position=right [Pay] «Pay on the far right»` -> `command:move target=Pay position=right [on the far right] «Pay on the far right»`
- added: `(no wire)` -> `command:arrange target=Approve,Deny layout=column [one above the other] «the two outcomes one above the other»`

### sl-0210 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Court1 position=left [Court1] «Court1 on the left»` -> `command:move target=Court1 position=left [on the left] «Court1 on the left»`
- changed: `command:move target=Court2 position=right [Court2] «Court2 on the right»` -> `command:move target=Court2 position=right [on the right] «Court2 on the right»`
- changed: `command:move target=Parking position=bottom [Parking] «Parking at the bottom»` -> `command:move target=Parking position=bottom [at the bottom] «Parking at the bottom»`

### sl-0211 [fact split / trigger]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); 'a blue one' = a blue circle (the one of the line before) -> shape circle; verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- removed: `fact:None target=Cut color=gray [gray] «Cut is a gray»` -> `(no wire)`
- removed: `fact:None target=Cut shape=square [square] «square»` -> `(no wire)`
- removed: `fact:None target=Pin size=tiny [tiny] «Pin a tiny»` -> `(no wire)`
- removed: `fact:None target=Pin color=yellow [yellow] «yellow»` -> `(no wire)`
- removed: `fact:None target=Pin shape=circle [circle] «circle»` -> `(no wire)`
- removed: `fact:None target=Stitch color=blue [blue] «Stitch a blue one»` -> `(no wire)`
- removed: `command:move target=Cut position=left [Put] «Put Cut at the left»` -> `(no wire)`
- removed: `command:move target=Hem position=right [Hem] «Hem at the right»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Cut color=gray shape=square [is] «Cut is a gray square»`
- added: `(no wire)` -> `fact:None target=Pin size=tiny color=yellow shape=circle [Pin] «Pin a tiny yellow circle»`
- added: `(no wire)` -> `fact:None target=Stitch color=blue shape=circle [blue] «Stitch a blue one»`
- added: `(no wire)` -> `command:move target=Cut position=left [at the left] «Put Cut at the left»`
- added: `(no wire)` -> `command:move target=Hem position=right [at the right] «Hem at the right»`

### sl-0212 [fact split / trigger]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- removed: `fact:None target=User color=green [green] «The User is a green circle»` -> `(no wire)`
- removed: `fact:None target=User shape=circle [circle] «circle»` -> `(no wire)`
- removed: `fact:None target=Form color=white [white] «the Form a white square»` -> `(no wire)`
- removed: `fact:None target=Form shape=square [square] «square»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=User color=green shape=circle [is] «The User is a green circle»`
- added: `(no wire)` -> `fact:None target=Form color=white shape=square [the Form] «the Form a white square»`
- changed: `command:move target=Auditor position=topRight [Auditor] «the Auditor at the top right»` -> `command:move target=Auditor position=topRight [at the top right] «the Auditor at the top right»`
- changed: `command:move target=Archive position=bottomRight [Archive] «the Archive at the bottom right»` -> `command:move target=Archive position=bottomRight [at the bottom right] «the Archive at the bottom right»`

### sl-0213 [fact split / copy mention / trigger]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); original + its copies: 'Name,mention(recency=newest)' (+quantifier=all for plural 'all/the copies'), existing 9 mixes (e.g. sm-0549, sm2-0348) ('the copies' says no shape); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Attic position=above anchor=Hall [Attic] «the Attic above it»` -> `command:move target=Attic position=above anchor=Hall [above] «the Attic above it»`
- removed: `fact:None target=Cellar color=purple [purple] «The Cellar is a purple circle»` -> `(no wire)`
- removed: `fact:None target=Cellar shape=circle [circle] «circle»` -> `(no wire)`
- removed: `fact:None target=Attic color=orange [orange] «the Attic an orange triangle»` -> `(no wire)`
- removed: `fact:None target=Attic shape=triangle [triangle] «triangle»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Cellar color=purple shape=circle [is] «The Cellar is a purple circle»`
- added: `(no wire)` -> `fact:None target=Attic color=orange shape=triangle [the Attic] «the Attic an orange triangle»`
- changed: `command:move target=mention(recency=newest,shape=star) position=rightOf anchor=Hall [put] «put the copies on the right of the Hall»` -> `command:move target=mention(quantifier=all,recency=newest) position=rightOf anchor=Hall [put] «put the copies on the right of the Hall»`

### sl-0214 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Stove position=right [Stove] «the Stove at the far right»` -> `command:move target=Stove position=right [at the far right] «the Stove at the far right»`
- changed: `command:move target=Food position=near anchor=Stove [Food] «the Food next to the Stove»` -> `command:move target=Food position=near anchor=Stove [next to] «the Food next to the Stove»`

### sl-0215 [fact split]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires)
- removed: `fact:None target=Wallet color=blue [blue] «Wallet is a blue»` -> `(no wire)`
- removed: `fact:None target=Wallet shape=circle [circle] «circle»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Wallet color=blue shape=circle [is] «Wallet is a blue circle»`

### sl-0216 [fact split / trigger]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); the sizes 'big' / 'huge' are in the span -> size key; verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- removed: `fact:None target=Voters color=yellow [yellow] «The Voters are a big yellow»` -> `(no wire)`
- removed: `fact:None target=Voters shape=circle [circle] «circle»` -> `(no wire)`
- removed: `fact:None target=Result color=gold [gold] «the Result a huge gold»` -> `(no wire)`
- removed: `fact:None target=Result shape=star [star] «star»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Voters size=large color=yellow shape=circle [are] «The Voters are a big yellow circle»`
- added: `(no wire)` -> `fact:None target=Result size=huge color=gold shape=star [the Result] «the Result a huge gold star»`
- changed: `command:move target=Candidate1,Candidate2 position=center [candidates] «the candidates in the middle»` -> `command:move target=Candidate1,Candidate2 position=center [in the middle] «the candidates in the middle»`
- changed: `command:move target=Result position=top [Result] «the Result at the top»` -> `command:move target=Result position=top [at the top] «the Result at the top»`

### sl-0217 [fact split]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); Belt: the final value 'one gray triangle' gives colour and shape
- removed: `fact:None target=Terra color=blue [blue] «Terra is the old homeworld, a blue circle, big»` -> `(no wire)`
- removed: `fact:None target=Terra shape=circle [circle] «circle»` -> `(no wire)`
- removed: `fact:None target=Terra size=large [big] «big»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Terra color=blue shape=circle size=large [is] «Terra is the old homeworld, a blue circle, big»`
- changed: `fact:None target=Belt color=gray [gray triangle] «The Belt is a bunch of gray triangles, but for now it's one gray triangle»` -> `fact:None target=Belt color=gray shape=triangle [gray triangle] «The Belt is a bunch of gray triangles, but for now it's one gray triangle»`

### sl-0218 [trigger]
Reason: 'the others around X' -> move position=near anchor X, trigger 'around' (as sl-0195)
- changed: `command:move target=Sun,Water,Soil position=near anchor=Plant [three] «the three around it»` -> `command:move target=Sun,Water,Soil position=near anchor=Plant [around] «the three around it»`

### sl-0219 [trigger / missing moves]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205); statement of a canvas place ('X goes/sits/is at the top') -> move (existing: 18 of 22 canvas-place statements are move wires, 4 unwired) ('both at the bottom', 'in the center'); the fact keeps only the position+anchor statement
- changed: `command:move target=Pier2 position=right [Pier2] «Pier2 on the right»` -> `command:move target=Pier2 position=right [on the right] «Pier2 on the right»`
- changed: `fact:None target=Tower position=above anchor=Deck [above] «The Tower is above the Deck, in the center»` -> `fact:None target=Tower position=above anchor=Deck [above] «The Tower is above the Deck»`
- added: `(no wire)` -> `command:move target=Tower position=center [in the center] «in the center»`
- added: `(no wire)` -> `command:move target=Pier1,Pier2 position=bottom [at the bottom] «both at the bottom»`

### sl-0220 [fact split]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires)
- removed: `fact:None target=Clay color=brown [brown] «Clay is a brown»` -> `(no wire)`
- removed: `fact:None target=Clay shape=circle [circle] «circle»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Clay color=brown shape=circle [is] «Clay is a brown circle»`

### sl-0221 [fact split / span / trigger]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); contentless request ('Make her that', 'set it that way', 'set it') -> span widened to the sentence that carries its content (precedent sm2-0195 / sm2-0216); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Knight position=rightOf anchor=Stage [Knight] «the Knight on the right»` -> `command:move target=Knight position=rightOf anchor=Stage [on the right] «the Knight on the right»`
- removed: `fact:None target=Knight size=small [small] «The Knight is a small»` -> `(no wire)`
- removed: `fact:None target=Knight color=gray [gray] «gray»` -> `(no wire)`
- removed: `fact:None target=Knight shape=square [square] «square»` -> `(no wire)`
- removed: `command:set target=Princess color=pink shape=star [Make] «Make her that»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Knight size=small color=gray shape=square [is] «The Knight is a small gray square»`
- added: `(no wire)` -> `command:set target=Princess color=pink shape=star [Make] «the Princess should be pink, a pink star. Make her that»`

### sl-0222 [fact split / span]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); contentless request ('Make her that', 'set it that way', 'set it') -> span widened to the sentence that carries its content (precedent sm2-0195 / sm2-0216)
- removed: `fact:None target=Plane size=huge [huge] «Plane is a huge white»` -> `(no wire)`
- removed: `fact:None target=Plane color=white [white] «white»` -> `(no wire)`
- removed: `fact:None target=Plane shape=ellipse [ellipse] «ellipse»` -> `(no wire)`
- removed: `command:set target=Belt color=gray shape=rectangle [set] «set it that way»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Plane size=huge color=white shape=ellipse [is] «Plane is a huge white ellipse»`
- added: `(no wire)` -> `command:set target=Belt color=gray shape=rectangle [set] «Belt a long gray rectangle, set it that way»`

### sl-0224 [fact split / span / trigger]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); contentless request ('Make her that', 'set it that way', 'set it') -> span widened to the sentence that carries its content (precedent sm2-0195 / sm2-0216); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:set target=Test shape=diamond [set] «set it»` -> `command:set target=Test shape=diamond [set] «Test has to be a diamond, set it»`
- removed: `fact:None target=Add color=yellow [yellow] «The Add step is a yellow»` -> `(no wire)`
- removed: `fact:None target=Add shape=rectangle [rectangle] «rectangle»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Add color=yellow shape=rectangle [is] «The Add step is a yellow rectangle»`
- changed: `command:move target=End position=right [End] «End on the right»` -> `command:move target=End position=right [on the right] «End on the right»`

### sl-0225 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Striker position=top [Striker] «the Striker to the top»` -> `command:move target=Striker position=top [to the top] «the Striker to the top»`
- changed: `command:move target=Mid position=center [Mid] «the Mid to the middle»` -> `command:move target=Mid position=center [to the middle] «the Mid to the middle»`
- changed: `command:move target=Back1,Back2 position=above anchor=Keeper [both] «both above the Keeper»` -> `command:move target=Back1,Back2 position=above anchor=Keeper [above] «both above the Keeper»`

### sl-0226 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205) (arrange: the layout phrase)
- changed: `command:move target=Gym position=right [Gym] «Gym on the right»` -> `command:move target=Gym position=right [on the right] «Gym on the right»`
- changed: `command:arrange target=Flat1,Flat2,Flat3 layout=column [flats] «the flats in the middle in a column»` -> `command:arrange target=Flat1,Flat2,Flat3 layout=column [in a column] «the flats in the middle in a column»`

### sl-0227 [fact split / missing moves]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); statement of a canvas place ('X goes/sits/is at the top') -> move (existing: 18 of 22 canvas-place statements are move wires, 4 unwired) (statement not repeated by a later move request; 'in between' -> between Surface,Abyss)
- removed: `fact:None target=Surface size=small [small] «The Surface is a small yellow»` -> `(no wire)`
- removed: `fact:None target=Surface color=yellow [yellow] «yellow»` -> `(no wire)`
- removed: `fact:None target=Surface shape=star [star] «star»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Surface size=small color=yellow shape=star [is] «The Surface is a small yellow star»`
- added: `(no wire)` -> `command:move target=Surface position=top [at the top] «Surface is at the top»`
- added: `(no wire)` -> `command:move target=Abyss position=bottom [at the bottom] «Abyss at the bottom»`
- added: `(no wire)` -> `command:move target=Twilight,Midnight position=between anchor=Surface,Abyss [in between] «Twilight and Midnight in between»`

### sl-0228 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Ceremony position=right [Ceremony] «the Ceremony on the far right»` -> `command:move target=Ceremony position=right [on the far right] «the Ceremony on the far right»`

### sl-0229 [fact split / trigger]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- removed: `fact:None target=Board size=large [big] «Board is a big»` -> `(no wire)`
- removed: `fact:None target=Board color=green [green] «green»` -> `(no wire)`
- removed: `fact:None target=Board shape=square [square] «square»` -> `(no wire)`
- removed: `fact:None target=Post size=small [small] «Post is a small»` -> `(no wire)`
- removed: `fact:None target=Post color=gray [gray] «gray»` -> `(no wire)`
- removed: `fact:None target=Post shape=rectangle [rectangle] «rectangle»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Board size=large color=green shape=square [is] «Board is a big green square»`
- added: `(no wire)` -> `fact:None target=Post size=small color=gray shape=rectangle [is] «Post is a small gray rectangle»`
- changed: `command:move target=Board position=right [Board] «Board at the right»` -> `command:move target=Board position=right [at the right] «Board at the right»`

### sl-0230 [fact split / trigger]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- removed: `fact:None target=House color=lime [lime] «The House is a lime»` -> `(no wire)`
- removed: `fact:None target=House shape=square [square] «square»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=House color=lime shape=square [is] «The House is a lime square»`
- changed: `command:move target=House position=right [House] «the House on the right»` -> `command:move target=House position=right [on the right] «the House on the right»`

### sl-0230 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Drone1,Drone2 position=between anchor=Depot,House [drones] «the drones between them, one above the other»` -> `command:move target=Drone1,Drone2 position=between anchor=Depot,House [between] «the drones between them, one above the other»`

### sl-0231 [fact split / trigger]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); Ash 'a small one' -> size small only; verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- removed: `fact:None target=Magma color=red [red] «Magma is a red»` -> `(no wire)`
- removed: `fact:None target=Magma shape=circle [circle] «circle»` -> `(no wire)`
- removed: `fact:None target=Magma size=huge [huge] «huge»` -> `(no wire)`
- removed: `fact:None target=Chamber size=large [large] «the Chamber a large»` -> `(no wire)`
- removed: `fact:None target=Chamber color=orange [orange] «orange»` -> `(no wire)`
- removed: `fact:None target=Chamber shape=ellipse [ellipse] «ellipse»` -> `(no wire)`
- removed: `fact:None target=Vent color=gray [gray] «The Vent is a gray»` -> `(no wire)`
- removed: `fact:None target=Vent shape=rectangle [rectangle] «rectangle»` -> `(no wire)`
- removed: `fact:None target=Ash color=black [black] «Ash is black, a small»` -> `(no wire)`
- removed: `fact:None target=Ash size=small [small] «small»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Magma color=red shape=circle size=huge [is] «Magma is a red circle, huge»`
- added: `(no wire)` -> `fact:None target=Chamber size=large color=orange shape=ellipse [the Chamber] «the Chamber a large orange ellipse»`
- added: `(no wire)` -> `fact:None target=Vent color=gray shape=rectangle [is] «The Vent is a gray rectangle»`
- added: `(no wire)` -> `fact:None target=Ash color=black size=small [is] «Ash is black, a small one»`
- changed: `command:move target=Ash position=top [Ash] «Ash at the top»` -> `command:move target=Ash position=top [at the top] «Ash at the top»`

### sl-0232 [fact split / span]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); contentless request ('Make her that', 'set it that way', 'set it', 'arrange them that way') -> span widened to the sentence that carries its content (precedent sm2-0195 / sm2-0216)
- removed: `fact:None target=Badge color=gold [gold] «Badge is a gold»` -> `(no wire)`
- removed: `fact:None target=Badge shape=star [star] «star»` -> `(no wire)`
- removed: `fact:None target=Badge size=large [big] «big»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Badge color=gold shape=star size=large [is] «Badge is a gold star, big»`
- removed: `fact:None target=Lesson color=green [green] «Lesson is a green»` -> `(no wire)`
- removed: `fact:None target=Lesson shape=circle [circle] «circle»` -> `(no wire)`
- removed: `command:arrange layout=circle [arrange] «arrange them that way»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Lesson color=green shape=circle [is] «Lesson is a green circle»`
- added: `(no wire)` -> `command:arrange layout=circle [arrange] «The cycle should be laid out in a circle, so arrange them that way»`

### sl-0233 [move -> arrange]
Reason: 'in a row / column [below X]' states a layout -> arrange row/column, target + layout only (existing: 6 of 6 arrange, 0 move: sm-0156, sm-0234, sm-0415, sm2-0171, sm2-0272, sm2-0434)
- changed: `command:move target=Law,Tech,Money position=below anchor=Chair [Put] «Put the three advisors below, in a row»` -> `command:arrange target=Law,Tech,Money layout=row [Put] «Put the three advisors below, in a row»`

### sl-0234 [fact split / missing move]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); statement of a canvas place ('X goes/sits/is at the top') -> move (existing: 18 of 22 canvas-place statements are move wires, 4 unwired) ('The Heart is the center' split from 'a big red star': one span per wire)
- removed: `fact:None target=Heart color=red [red] «The Heart is the center, a big red»` -> `(no wire)`
- removed: `fact:None target=Heart size=large [big] «big»` -> `(no wire)`
- removed: `fact:None target=Heart shape=star [star] «star»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Heart color=red size=large shape=star [big red star] «a big red star»`
- added: `(no wire)` -> `command:move target=Heart position=center [is the center] «The Heart is the center»`

### sl-0234 [trigger]
Reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Body position=bottom [Body] «the Body at the bottom»` -> `command:move target=Body position=bottom [at the bottom] «the Body at the bottom»`

### sl-0235 [move -> arrange / fact split / trigger]
Reason: 'in a row / column [below X]' states a layout -> arrange row/column, target + layout only (existing: 6 of 6 arrange, 0 move: sm-0156, sm-0234, sm-0415, sm2-0171, sm2-0272, sm2-0434) (also sm-0331 'go at the top, in a row' -> arrange only); one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)
- changed: `command:move target=Taco,Noodle,Crepe position=top [Put] «Put the three stalls in a row at the top»` -> `command:arrange target=Taco,Noodle,Crepe layout=row [Put] «Put the three stalls in a row at the top»`
- changed: `command:move target=Cart position=center [Cart] «the Cart in the center»` -> `command:move target=Cart position=center [in the center] «the Cart in the center»`
- changed: `command:move target=Fans position=bottom [Fans] «the Fans at the bottom»` -> `command:move target=Fans position=bottom [at the bottom] «the Fans at the bottom»`
- removed: `fact:None target=Fans color=white [white] «The Fans are a white circle»` -> `(no wire)`
- removed: `fact:None target=Fans shape=circle [circle] «circle»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Fans color=white shape=circle [are] «The Fans are a white circle»`

### sl-0236 [fact split]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires)
- removed: `fact:None target=Dune color=gold [gold] «Dune is a gold»` -> `(no wire)`
- removed: `fact:None target=Dune shape=star [star] «star»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Dune color=gold shape=star [is] «Dune is a gold star»`

### sl-0237 [fact split / trigger]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); 'the others around X' -> move position=near anchor X, trigger 'around' (as sl-0195)
- removed: `fact:None target=Dock size=small [small] «The Dock is a small gray»` -> `(no wire)`
- removed: `fact:None target=Dock color=gray [gray] «gray»` -> `(no wire)`
- removed: `fact:None target=Dock shape=circle [circle] «circle»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Dock size=small color=gray shape=circle [is] «The Dock is a small gray circle»`
- changed: `command:move target=Kitchen,Living,Bedroom position=near anchor=Dock [rooms] «the rooms around it»` -> `command:move target=Kitchen,Living,Bedroom position=near anchor=Dock [around] «the rooms around it»`

### sl-0238 [fact split / trigger]
Reason: one statement 'X is A and B' = one fact wire with all keys, span the whole statement, trigger the copula (existing: 36 multi-attribute facts, 0 split into per-attribute wires); 'the others around X' -> move position=near anchor X, trigger 'around' (as sl-0195)
- removed: `fact:None target=Hive size=large [big] «The Hive is a big brown»` -> `(no wire)`
- removed: `fact:None target=Hive color=brown [brown] «brown»` -> `(no wire)`
- removed: `fact:None target=Hive shape=square [square] «square»` -> `(no wire)`
- added: `(no wire)` -> `fact:None target=Hive size=large color=brown shape=square [is] «The Hive is a big brown square»`
- changed: `command:move target=Bee,Flower,Honey position=near anchor=Hive [other three] «the other three around it»` -> `command:move target=Bee,Flower,Honey position=near anchor=Hive [around] «the other three around it»`

## 4. Checked and left as it was (decided without change)

- Statements of a flow that a later request repeats ('The Cactus feeds the Mouse... Join them in a chain'): no extra wire (46 of 182 existing statements have none, all repeated later). Doubt 7 is therefore not a missing-wire case.
- Hints and reasons ('the Bridge is the famous bit', 'it's a backup link'): no wire.
- Requests the legend cannot express ('make that dotted' for an existing link, 'a thin red line', 'so it closes', 'side by side', 'the drones one above the other' kept as `move between`): no wire, or only the part the legend can say.
- Elided-verb connect wires ('Medic to the Bridge', 'Interview to Exit as well'): trigger left as the writer put it, the existing data is not settled ('Core to' 21, leading name 12 of 33).
- degree / count edge / neighbors, extreme, nearest, check, notColor (question key) against notcolor (mention key), and 'left of / right of / far left': checked in all 240 messages, no break found. All keys of every wire are legal for its action.
- 'a bit larger than the Outline' + 'Enlarge the Draft' (sl-0179): one `resize` wire for the request that is made.

## 5. For the owner (not decided: fewer than 5 existing cases or under 2/3)

- A description that names one particular shape instead of a name, 'Make the star huge' (sl-0193, target `Capital`): existing wires with 'the <shape>' and a command target are 5 name against 4 mention. I left the name (the pronoun-like reading). 1 case in sonnet_long, so the choice costs little, but the convention should say which.
- 'in a row / in a column at the top / on the left' (sl-0191 'in a column on the left', sl-0235 'in a row at the top'): I wrote `arrange` only (sm-0046, sm-0331 and 4 more, all arrange only, 0 with both). The place half of the sentence is lost; the alternative is two wires with two spans. Existing cases with a canvas place: 2 (sm-0046, sm-0331), so under 5.
- 'one above the other' (sl-0209, no existing case): written as `arrange column` on the two shapes. The other reading is no wire.
- `connect` between two shapes that are both created in the message ('connect Oven to it', sl-0016): I wrote `from=$new, to=$new` by the rule 'every created shape is `$new`'. No existing case; the scorer cannot tell the two shapes apart. Alternative: name the first one.
- A statement of how the canvas already is ('that's already how they sit', sl-0015): I wrote three `move` wires by the 18 of 22 rule. The writer's meaning is 'no change needed'; 1 case.
- Contentless request with a pronoun target and a statement before it ('The Factory takes the most power... set it to huge', sl-0174; 'make it red'): not widened. Only 2 existing widening cases (sm2-0195, sm2-0216) are about a request with no content at all, so the line between the two is the owner's to draw.
- Facts about several shapes at once ('The people are all blue circles', sl-0177; 'The cities are blue circles, all four of them', sl-0207): one fact with a comma-joined `target`. Existing plural-subject facts: fewer than 5 counted; the scorer takes comma-joined lists, so I kept one wire.
- Elided-verb `connect` triggers (see section 4): 33 existing cases, no majority.
- sl-0018: 'Oh and undo the last thing if it was a mistake, I'm not sure' is hedged and conditional; I wrote no wire (1 case, no precedent). The alternative is `undo`.
