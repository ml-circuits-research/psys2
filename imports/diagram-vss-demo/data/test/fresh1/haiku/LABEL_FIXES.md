# Label fixes for fresh1/haiku (fh-0001 .. fh-0500)

Label checker: Sonnet agent. Only wires were changed; texts, ids, domains and names are byte-identical to `texts/` (checked by script). No reader, reader output, other test set or git operation was used; counts were taken from the corrected training data in `training/sketch/llm_train/` (sonnet_msg, haiku_msg, sonnet_msg2, haiku_msg2, sonnet_long; 2640 messages).

`->` separates before and after; `+` joins two wires written for one old wire. Wire notation: `type:action key=value [trigger] «span»` (`f` = fact, `c` = command, `q` = question).

## 1. Counts

- Messages: 500. Wires before: 2506, after: 2514. Messages with a wire change: 40.
- Of the 2506 original wires 2472 are unchanged and 34 were touched (26 changed, 8 removed); 16 wires were added.
- (A changed wire that was split in two counts as one change and one add. Section 3 lists every operation.)

| kind of fix | changed | added | removed |
|---|---|---|---|
| statement of a relation -> fact (move -> fact) | 4 | 0 | 0 |
| canvas-place statement, missing move added | 0 | 8 | 0 |
| statement of a relation, missing fact added | 0 | 4 | 0 |
| missing fact added | 0 | 2 | 0 |
| span | 10 | 0 | 0 |
| missing move added | 0 | 1 | 0 |
| conditional request without wire | 0 | 0 | 1 |
| relation the legend lacks ('sits on') -> no wire | 0 | 0 | 7 |
| in front of -> toFront | 1 | 0 | 0 |
| on top of -> toFront | 1 | 0 | 0 |
| trigger | 1 | 0 | 0 |
| span/trigger | 1 | 0 | 0 |
| created shape -> $new | 4 | 0 | 0 |
| pairing next -> chain | 2 | 0 | 0 |
| chain incomplete | 1 | 0 | 0 |
| chain from separate clauses split | 1 | 1 | 0 |
| total | 26 | 16 | 8 |

## 2. Rulings used (counted on the corrected training data, 2640 messages)

- Statement of how things are, `X is <relation> Y` -> fact position + anchor: 19 of 19 wired statements (sm-0208, hm-0066, hm-0074, hm-0431, hm2-0064 ... sl-0219). `X goes / should be / must be <relation> Y` is a request -> move: 32 of 33. `sits / stands <relation>` alone has no majority (see owner list 1); it was written as fact, following the conventions' definition of a fact ("the user states how something IS") and the sonnet_long ruling for "sits left of".
- Statement of a canvas place (`X is at the bottom`, `X sits in the middle`, `it's on the left`) with no later request that repeats it -> move: 41 wired against 8 unwired (84%); the legend has no fact with a canvas place (0 of 51 facts).
- `next to`, `beside`, `close to` -> near: 46 of 46 (next to), 20 of 20 (beside create / move).
- `put X in front of Y`, `X goes in front` -> toFront X: 31 of 34 wires with "in front". `put X on top of Y` -> toFront: 6 of 9 (exactly 2/3; 6 of 7 without a self-correction and an explicit "above"). `behind` -> toBack 4 / move below 4 (no majority: no `behind` request changed). A relation the legend lacks (`sits on`, `behind` as a statement, `in front of` as a statement) gets no wire: no existing wire maps `sits on` to above (0 cases).
- Statement of links (`X goes to Y`, `feeds`, `leads to`, `drops into`, `rises into`) with no later request that repeats it -> connect (136 of 182 statement sentences carry a connect; the 46 without all have a later request that repeats them). In this set the statements that a later "Connect ..." repeats stay without wire (fh-0028 `Clean should follow Ingest`, fh-0050, fh-0113, fh-0127, fh-0189, fh-0194, fh-0209, fh-0229, fh-0230, fh-0231, fh-0282, fh-0343, fh-0348, fh-0420, fh-0462). `goes to the top right corner` (fh-0193) is a canvas place, so move, not connect.
- Conditional requests: `Undo X if it looks bad` is wired (sm-0451, sm-0456, sm-0467, sm2-0505; hedged ones are not: sl-0018, sl-0028), `disconnect X if there is a link` is wired (5 of 5), `If so / If not, <request>` after a question is wired (17 of 17), `Delete X if <subjective condition>` has no wire (5 of 5). So only fh-0041 changed; every conditional undo (45 in this set) stays a wire (owner list 6).
- `in order` -> chain (10 of 12; the 2 `next` wires say "each to the next"), `one after the other / another` -> chain (45 of 45), `each to the next` -> next.
- A chain is written only for a continuing sequence in text order: 588 of 588 existing chain wires list the shapes in text order.
- Loop = chain plus a separate closing connect (4 of 4 + 13 in sm2); all 9 loops of this set already follow it.
- `A and B are (both) <colour / shape>` -> ONE fact with `target: "A,B"`: 21 existing facts with several targets, 0 split.
- Spans: polite lead-ins ("please", "can you") are left out of the span: 41 of 58. Verb ellipsis, move: trigger = the position phrase (180 of 205). A shape created earlier in the message is `$new` in every later wire (87 of 87).
- Counts as digits, `swap` with comma target, `arrange` without target for "everything", recency mentions (`newest`, `oldest` for "first"), `arrange` for "in a row / column" (6 of 6): already as in the training data, no change needed (checked on all 500 messages).
## 3. Changes (one line per wire change, grouped by kind)

### statement of a relation -> fact (move -> fact)

- fh-0168: command:move target=Dev1,Dev2 position=below anchor=Lead [sit below] «Dev1 and Dev2 sit below Lead» -> fact: target=Dev1,Dev2 position=below anchor=Lead [sit below] «Dev1 and Dev2 sit below Lead»
  - reason: statement 'X is/sits <relation> Y' says how things are -> fact position+anchor (existing: 'X is <relation> Y' is a fact in 19 of 19 wired statements; 'goes/should be <relation>' is a request = move 32 of 33; sonnet_long applied the same rule to 'sits left of'; 'sits <relation>' alone has no majority, see owner list 1)
- fh-0168: command:move target=Lead position=below anchor=Boss [sits below] «Lead sits below Boss» -> fact: target=Lead position=below anchor=Boss [sits below] «Lead sits below Boss»
  - reason: statement 'X is/sits <relation> Y' says how things are -> fact position+anchor (existing: 'X is <relation> Y' is a fact in 19 of 19 wired statements; 'goes/should be <relation>' is a request = move 32 of 33; sonnet_long applied the same rule to 'sits left of'; 'sits <relation>' alone has no majority, see owner list 1)
- fh-0228: command:move target=Meeting position=rightOf anchor=Desk [is next to] «Meeting is next to Desk, to the right» -> fact: target=Meeting position=rightOf anchor=Desk [is next to] «Meeting is next to Desk, to the right»
  - reason: statement 'X is/sits <relation> Y' says how things are -> fact position+anchor (existing: 'X is <relation> Y' is a fact in 19 of 19 wired statements; 'goes/should be <relation>' is a request = move 32 of 33; sonnet_long applied the same rule to 'sits left of'; 'sits <relation>' alone has no majority, see owner list 1) ('next to ..., to the right' keeps rightOf)
- fh-0292: command:move target=Sensor position=above anchor=Hub [sits above] «Sensor sits above Hub» -> fact: target=Sensor position=above anchor=Hub [sits above] «Sensor sits above Hub»
  - reason: statement 'X is/sits <relation> Y' says how things are -> fact position+anchor (existing: 'X is <relation> Y' is a fact in 19 of 19 wired statements; 'goes/should be <relation>' is a request = move 32 of 33; sonnet_long applied the same rule to 'sits left of'; 'sits <relation>' alone has no majority, see owner list 1)

### canvas-place statement, missing move added

- fh-0009: (none) -> command:move target=Kitchen position=topLeft [is at] «The Kitchen is at the top left»
  - reason: statement of a canvas place ('X is at the bottom', 'X sits in the middle') with no later request that repeats it -> move (existing: 41 move wires against 8 unwired = 84%; the legend has no fact with a canvas place, 0 of 51 facts)
- fh-0026: (none) -> command:move target=Lobby position=bottomLeft [is at] «The Lobby is at the bottom left corner»
  - reason: statement of a canvas place ('X is at the bottom', 'X sits in the middle') with no later request that repeats it -> move (existing: 41 move wires against 8 unwired = 84%; the legend has no fact with a canvas place, 0 of 51 facts) ('I want it to stay there' is still a statement of the place)
- fh-0038: (none) -> command:move target=Good position=left [on the left] «it's on the left»
  - reason: statement of a canvas place ('X is at the bottom', 'X sits in the middle') with no later request that repeats it -> move (existing: 41 move wires against 8 unwired = 84%; the legend has no fact with a canvas place, 0 of 51 facts); span = the clause that says the place (verb ellipsis, move: trigger = the position phrase, 180 of 205)
- fh-0042: (none) -> command:move target=Door position=bottomLeft [is at] «Door is at the bottom left»
  - reason: statement of a canvas place ('X is at the bottom', 'X sits in the middle') with no later request that repeats it -> move (existing: 41 move wires against 8 unwired = 84%; the legend has no fact with a canvas place, 0 of 51 facts) ('I can't move it' is chatter)
- fh-0102: (none) -> command:move target=Trailhead position=bottom [is at] «Trailhead is at the bottom»
  - reason: statement of a canvas place ('X is at the bottom', 'X sits in the middle') with no later request that repeats it -> move (existing: 41 move wires against 8 unwired = 84%; the legend has no fact with a canvas place, 0 of 51 facts)
- fh-0155: (none) -> command:move target=Wr1,Wr2 position=right [on the right side] «Wr1 and Wr2 are both on the right side»
  - reason: statement of a canvas place ('X is at the bottom', 'X sits in the middle') with no later request that repeats it -> move (existing: 41 move wires against 8 unwired = 84%; the legend has no fact with a canvas place, 0 of 51 facts)
- fh-0193: (none) -> command:move target=Entry position=bottom [is at] «Entry is at the bottom»
  - reason: statement of a canvas place ('X is at the bottom', 'X sits in the middle') with no later request that repeats it -> move (existing: 41 move wires against 8 unwired = 84%; the legend has no fact with a canvas place, 0 of 51 facts)
- fh-0195: (none) -> command:move target=Plant position=center [is in the middle] «Plant is in the middle»
  - reason: statement of a canvas place ('X is at the bottom', 'X sits in the middle') with no later request that repeats it -> move (existing: 41 move wires against 8 unwired = 84%; the legend has no fact with a canvas place, 0 of 51 facts)

### statement of a relation, missing fact added

- fh-0042: (none) -> fact: target=Table1 position=near anchor=Door [is next to] «Table1 is next to the Door»
  - reason: statement 'X is/sits <relation> Y' says how things are -> fact position+anchor (existing: 'X is <relation> Y' is a fact in 19 of 19 wired statements; 'goes/should be <relation>' is a request = move 32 of 33; sonnet_long applied the same rule to 'sits left of'; 'sits <relation>' alone has no majority, see owner list 1); the statement had no wire and no later request repeats it; 'next to' -> near (46 of 46 create/move wires)
- fh-0354: (none) -> fact: target=Rice,Pasta position=leftOf anchor=Jar [sit left of] «Rice and Pasta sit left of Jar»
  - reason: statement 'X is/sits <relation> Y' says how things are -> fact position+anchor (existing: 'X is <relation> Y' is a fact in 19 of 19 wired statements; 'goes/should be <relation>' is a request = move 32 of 33; sonnet_long applied the same rule to 'sits left of'; 'sits <relation>' alone has no majority, see owner list 1); the statement had no wire and no later request repeats it
- fh-0387: (none) -> fact: target=Apple2,Orange2 position=near anchor=Banana [sit next to] «Apple2 and Orange2 sit next to Banana»
  - reason: statement 'X is/sits <relation> Y' says how things are -> fact position+anchor (existing: 'X is <relation> Y' is a fact in 19 of 19 wired statements; 'goes/should be <relation>' is a request = move 32 of 33; sonnet_long applied the same rule to 'sits left of'; 'sits <relation>' alone has no majority, see owner list 1); the statement had no wire and no later request repeats it; 'next to' -> near (46 of 46)
- fh-0413: (none) -> fact: target=Goat,Pig position=near anchor=Pond2 [are both near] «Goat and Pig are both near Pond2»
  - reason: statement 'X is/sits <relation> Y' says how things are -> fact position+anchor (existing: 'X is <relation> Y' is a fact in 19 of 19 wired statements; 'goes/should be <relation>' is a request = move 32 of 33; sonnet_long applied the same rule to 'sits left of'; 'sits <relation>' alone has no majority, see owner list 1); the statement had no wire and no later request repeats it

### missing fact added

- fh-0408: (none) -> fact: target=A1,B1 color=red shape=square [are both] «A1 and B1 are both red squares»
  - reason: statement 'A and B are both <colour/shape>' -> one fact wire (existing: 21 facts with several targets 'A and B are (both) <colour/shape>', e.g. sm2-0183 'Amy and Bo are both purple', sl-0139; 0 split into one wire per shape; fh-0147 of this set has the wire); the statement had no wire
- fh-0483: (none) -> fact: target=Round3,Round4 color=green [are both] «Round3 and Round4 are both green»
  - reason: statement 'A and B are both <colour/shape>' -> one fact wire (existing: 21 facts with several targets 'A and B are (both) <colour/shape>', e.g. sm2-0183 'Amy and Bo are both purple', sl-0139; 0 split into one wire per shape; fh-0147 of this set has the wire); the statement had no wire

### span

- fh-0006: command:label target=Blocked label=Waiting on vendor [label] «please label Blocked as "Waiting on vendor"» -> command:label target=Blocked label=Waiting on vendor [label] «label Blocked as "Waiting on vendor"»
  - reason: polite lead-in ('please', 'can you') is chatter, not part of the request: in 41 of 58 existing wires where the text has it before the request the span starts at the verb (71%)
- fh-0009: command:resize target=Livingroom [enlarge] «can you enlarge it a little» -> command:resize target=Livingroom [enlarge] «enlarge it a little»
  - reason: polite lead-in ('please', 'can you') is chatter, not part of the request: in 41 of 58 existing wires where the text has it before the request the span starts at the verb (71%)
- fh-0026: question:extreme superlative=mostConnected [most connections] «Can you show me the shape with the most connections» -> question:extreme superlative=mostConnected [most connections] «show me the shape with the most connections»
  - reason: polite lead-in ('please', 'can you') is chatter, not part of the request: in 41 of 58 existing wires where the text has it before the request the span starts at the verb (71%)
- fh-0049: command:set target=mention(notcolor=teal,quantifier=all) color=gray [make] «make it gray» -> command:set target=mention(notcolor=teal,quantifier=all) color=gray [make] «Anything not teal, make it gray»
  - reason: span includes the description of the target (mention(notcolor=teal,quantifier=all) is stated in 'Anything not teal')
- fh-0113: question:describe  [describe the whole diagram] «can you describe the whole diagram for my notes» -> question:describe  [describe the whole diagram] «describe the whole diagram for my notes»
  - reason: polite lead-in ('please', 'can you') is chatter, not part of the request: in 41 of 58 existing wires where the text has it before the request the span starts at the verb (71%)
- fh-0155: question:list shape=circle [list] «can you list all the circles» -> question:list shape=circle [list] «list all the circles»
  - reason: polite lead-in ('please', 'can you') is chatter, not part of the request: in 41 of 58 existing wires where the text has it before the request the span starts at the verb (71%)
- fh-0201: command:connect from=Likes to=Posts style=dotted [connect] «connect to Posts too, with a dotted line» -> command:connect from=Likes to=Posts style=dotted [connect] «Likes should connect to Posts too, with a dotted line»
  - reason: span starts at the subject of the statement (as fh-0191 'Feed should connect to Post and Profile'); the subject Likes is the 'from' of the connect
- fh-0315: command:arrange target=Table1,Table2,Table3 layout=row [go in a row] «go in a row by the window» -> command:arrange target=Table1,Table2,Table3 layout=row [go in a row] «Table1, Table2 and Table3 go in a row by the window»
  - reason: span includes the arranged shapes (as fh-0061 'Table1, Table2 and Table3 go in a row under them')
- fh-0383: command:connect from=Bulb to=Battery [connects back to] «connects back to Battery» -> command:connect from=Bulb to=Battery [connects back to] «Bulb connects back to Battery»
  - reason: closing link of a loop: the span carries its subject Bulb (the from of the connect)
- fh-0456: command:arrange target=Tile1,Tile2,Tile3,Tile4 layout=grid [arranged] «be arranged in a grid» -> command:arrange target=Tile1,Tile2,Tile3,Tile4 layout=grid [arranged] «Tile1, Tile2, Tile3 and Tile4 should be arranged in a grid»
  - reason: span includes the arranged shapes (target Tile1..Tile4 was outside the span)

### missing move added

- fh-0038: (none) -> command:move target=Ideas,Actions position=below anchor=Good,Bad [go below] «Ideas and Actions go below both of them»
  - reason: 'X goes <relation> Y' is a request = move (22 of 22 'goes <relation>' statements are move); 'both of them' -> list anchor 'Good,Bad' (6 of 6 existing list anchors for above/below/rightOf: sm-0044, sm-0280, sm2-0487, sl-0033, sl-0098, sl-0130)

### conditional request without wire

- fh-0041: command:delete target=Closed [Delete] «Delete the Closed shape if nobody uses it» -> (removed)
  - reason: conditional delete with a subjective condition ('if nobody uses it'): existing delete-if requests with a subjective condition have no wire in 5 of 5 (sl-0026, sl-0039, sl-0127, sm-0177, sm-0377); only answer-dependent 'If so, delete' is wired

### relation the legend lacks ('sits on') -> no wire

- fh-0106: fact: target=Beaker position=above anchor=Stand [sits on] «Beaker sits on Stand» -> (removed)
  - reason: 'X sits on Y' / 'sits on top of': the legend has no 'on' relation and no existing wire maps it to above (0 cases); 'put X on top of Y' is toFront in 6 of 9; relation the legend lacks -> no wire; see owner list 2
- fh-0323: fact: target=Kettle position=above anchor=Tray [sits on] «Kettle sits on the Tray» -> (removed)
  - reason: 'X sits on Y' / 'sits on top of': the legend has no 'on' relation and no existing wire maps it to above (0 cases); 'put X on top of Y' is toFront in 6 of 9; relation the legend lacks -> no wire; see owner list 2
- fh-0334: command:move target=Topper position=above anchor=Tier3 [sits on top of] «Topper sits on top of Tier3» -> (removed)
  - reason: 'X sits on Y' / 'sits on top of': the legend has no 'on' relation and no existing wire maps it to above (0 cases); 'put X on top of Y' is toFront in 6 of 9; relation the legend lacks -> no wire; see owner list 2
- fh-0363: fact: target=Owl position=above anchor=Tree2 [sits on] «Owl sits on Tree2» -> (removed)
  - reason: 'X sits on Y' / 'sits on top of': the legend has no 'on' relation and no existing wire maps it to above (0 cases); 'put X on top of Y' is toFront in 6 of 9; relation the legend lacks -> no wire; see owner list 2
- fh-0368: fact: target=Stamp position=above anchor=Letter [sits on] «Stamp sits on the Letter» -> (removed)
  - reason: 'X sits on Y' / 'sits on top of': the legend has no 'on' relation and no existing wire maps it to above (0 cases); 'put X on top of Y' is toFront in 6 of 9; relation the legend lacks -> no wire; see owner list 2
- fh-0422: fact: target=Mast position=above anchor=Hull [sits on] «Mast sits on Hull» -> (removed)
  - reason: 'X sits on Y' / 'sits on top of': the legend has no 'on' relation and no existing wire maps it to above (0 cases); 'put X on top of Y' is toFront in 6 of 9; relation the legend lacks -> no wire; see owner list 2
- fh-0434: fact: target=Lid2 position=above anchor=Jar2 [sits on] «Lid2 sits on Jar2» -> (removed)
  - reason: 'X sits on Y' / 'sits on top of': the legend has no 'on' relation and no existing wire maps it to above (0 cases); 'put X on top of Y' is toFront in 6 of 9; relation the legend lacks -> no wire; see owner list 2

### in front of -> toFront

- fh-0366: command:move target=Pawn position=above anchor=King2 [goes in front of] «Pawn goes in front of King2» -> command:toFront target=Pawn [in front of] «Pawn goes in front of King2»
  - reason: 'X goes/put X in front of Y' is toFront X: 31 of 34 wires with 'in front' are toFront (the other 3: sm-0397 'Barre in front of it' = near and two self-corrections); existing 'X goes in front' = toFront (sm2-0485, sm2-0547)

### on top of -> toFront

- fh-0260: command:move target=Cheese,Sauce position=above anchor=Oven [put] «put Cheese and Sauce on top of the Oven» -> command:toFront target=Cheese,Sauce [on top of] «put Cheese and Sauce on top of the Oven»
  - reason: 'put X on top of Y' is toFront X: 6 of 9 'on top of' wires (sm2-0044, 0096, 0175, 0266, 0390, 0525) = exactly 2/3, 6 of 7 without the self-correction sm2-0341 and the explicit 'above' of sl-0107; the other is sm-0404 (above)

### trigger

- fh-0177: command:move target=Contact position=rightOf anchor=About [Contact] «Contact to the right of About» -> command:move target=Contact position=rightOf anchor=About [to the right of] «Contact to the right of About»
  - reason: verb ellipsis, move: trigger = the position phrase of the own span (existing 180 of 205)

### span/trigger

- fh-0287: command:connect from=TeamC to=TeamA [TeamC to TeamA] «and TeamC to TeamA» -> command:connect from=TeamC to=TeamA [TeamC to] «TeamC to TeamA»
  - reason: closing link of a loop: own span without the connective 'and', trigger = leading words (sm2-0262 'C to A' / trigger 'C to')

### created shape -> $new

- fh-0045: command:connect from=Pay to=Error style=dashed [Connect] «Connect Pay to Error with a dashed line» -> command:connect from=Pay to=$new style=dashed [Connect] «Connect Pay to Error with a dashed line»
  - reason: a shape created earlier in the same message is written $new in every later wire (single create: 87 $new, 0 literal; sl rulings)
- fh-0045: command:move target=Error position=below anchor=Pay [Move] «Move Error below Pay» -> command:move target=$new position=below anchor=Pay [Move] «Move Error below Pay»
  - reason: a shape created earlier in the same message is written $new in every later wire (single create: 87 $new, 0 literal; sl rulings)
- fh-0049: command:duplicate target=Piece1 count=3 [duplicate] «duplicate Piece1 three times» -> command:duplicate target=$new count=3 [duplicate] «duplicate Piece1 three times»
  - reason: a shape created earlier in the same message is written $new in every later wire (single create: 87 $new, 0 literal; sl rulings)
- fh-0049: command:connect from=Board to=Piece1 [Connect] «Connect Board to Piece1» -> command:connect from=Board to=$new [Connect] «Connect Board to Piece1»
  - reason: a shape created earlier in the same message is written $new in every later wire (single create: 87 $new, 0 literal; sl rulings)

### pairing next -> chain

- fh-0258: command:connect from=Station1,Station2,Station3 pairing=next [Connect] «Connect the stations one after another, in order» -> command:connect from=Station1,Station2,Station3 pairing=chain [Connect] «Connect the stations one after another, in order»
  - reason: 'in order' / 'one after another' -> chain ('in order': chain 10 of 12, the 2 next wires say 'each to the next'; 'one after the other/another': chain 45 of 45); next only where the text says 'each to the next'
- fh-0344: command:connect from=Week1,Week2,Week3,Week4 pairing=next [Connect] «Connect them in order, so the season flows from one week to the next» -> command:connect from=Week1,Week2,Week3,Week4 pairing=chain [Connect] «Connect them in order, so the season flows from one week to the next»
  - reason: 'in order' / 'one after another' -> chain ('in order': chain 10 of 12, the 2 next wires say 'each to the next'; 'one after the other/another': chain 45 of 45); next only where the text says 'each to the next'

### chain incomplete

- fh-0397: command:connect from=Intake2,Filter2 pairing=chain [feeds] «Intake2 feeds Filter2, and Filter2 feeds Tap» -> command:connect from=Intake2,Filter2,Tap pairing=chain [feeds] «Intake2 feeds Filter2, and Filter2 feeds Tap»
  - reason: chain lacked the last shape: 'Intake2 feeds Filter2, and Filter2 feeds Tap' = from Intake2,Filter2,Tap

### chain from separate clauses split

- fh-0496: command:connect from=Knight,Village4,Cave pairing=chain [connects to] «Village4 connects to Cave and Knight connects to Village4» -> command:connect from=Village4 to=Cave [connects to] «Village4 connects to Cave»  +  command:connect from=Knight to=Village4 [connects to] «Knight connects to Village4»
  - reason: a chain is written only for a continuing sequence in text order (588 of 588 existing chain wires list the shapes in text order); here the clauses run backwards (Village4->Cave, then Knight->Village4) -> two connects with their own spans

## 4. Checked and left as written (with the count behind it)

- Flagged "goes to" in fh-0193 ("Exit goes to the top right corner"): a canvas place, move is right (canvas statements: move 41 of 49).
- fh-0289 `Agenda sits above Action` (fact) against fh-0292 `Sensor sits above Hub` (was move): both fact now (changed above).
- fh-0338 / fh-0344 `in order`: both chain now. fh-0258 `one after another, in order`: chain.
- Conditional undo (fh-0049, 0135, 0195, 0201, 0251, 0278, 0458, 0489 and 37 more): kept as wires (owner list 6). Conditional label / move after a question (fh-0006, fh-0009, fh-0193): kept, the `If so / If not` pattern is wired in 17 of 17 existing cases. Conditional disconnect (fh-0028): kept (5 of 5).
- Taken-back requests without wire (fh-0033 "skip that", fh-0038 "No, leave it", fh-0049 "skip that", fh-0093 "drop that line", fh-0120, fh-0026 "don't delete it"): no wire, as in the existing data.
- Questions the legend cannot express stay without wire: "Is Mass the same size as Force", "Is Box2 the same color as Box1" (fh-0047, fh-0064), "Show me the list of small shapes" (fh-0342, no size filter), "Count how many days are shaded".
- `Is X next to Y` -> check near (fh-0133, fh-0204): `next to` = near in 46 of 46 create / move wires; no existing two-shape question, so no precedent against it.
- Several-to-one, one-to-several and `A to B and B to C` chains, `arrow=none` only after "plain line", plain arrow without `arrow` key (fh-0241): all as in the training data.
- fh-0009 `all the rooms arranged in a grid` -> `arrange` with target `mention(quantifier=all)` (sm2-0312 `Arrange all the cards in a row`); "Arrange everything" has no target (hm-0018, sl-0003 ...). Lists of names for collective nouns ("the singers", "every animal") kept: 226 of 244 existing arrange wires list the names.

## 5. Owner list (not decided: fewer than 5 existing cases, a majority under 2/3, or a conflict between existing cases)

1. `X sits / stands <relation> Y` as a statement (25 fact wires in this set after the fix; before the fix the writer had fact 20, move 3 (fh-0168 x2, fh-0292), no wire 2 (fh-0354, fh-0387) plus 'are both near' without wire (fh-0413)): existing standalone cases: fact 2 (sm2-0206 x2 wires, sl-0159), move 1 (hm2-0186), no wire 3 (sm2-0434, 0447, 0535). No majority and under 5, so this is NOT a counted ruling. Applied: fact, because "is <relation>" is fact 19 of 19 and a statement says how things are. If the owner prefers move or no wire, change the 25 wires with "sit/stand" in the trigger (fh-0063, 0168, 0252, 0289, 0292, 0303, 0317, 0332, 0338, 0354, 0370, 0387, 0389, 0404, 0429, 0445, 0453, 0463, 0466, 0478).
2. `sits on`, `goes on`, `on top of` as a statement (0 existing cases; removed 7 wires: fh-0106, 0323, 0334, 0363, 0368, 0422, 0434). If the owner decides "on" = above, restore them as fact above (move above for fh-0334). Not wired in this set either way: fh-0309 ("Top goes on the Filling, and the Filling sits on the Base" is written as a chain connect Top,Filling,Base by the writer; it is a placement statement, not a link; left as written), fh-0459, fh-0331, fh-0394. `go onto` / `go on the` read as a link (fh-0484, left as written; sm2 has 3 such statements, all before an explicit connect).
3. `put X on top of Y` -> toFront (6 of 9, exactly 2/3, applied to fh-0260 `put Cheese and Sauce on top of the Oven`); the writer meant "above" (pizza). If the owner treats "on top of" as above, fh-0260 becomes move above Oven. `behind`: no majority (toBack 4, move below 4), no `behind` request here changed. `Driver sits in front of Seat5` (fh-0380, statement of a z-order): no wire, 0 existing cases.
4. Two positions in one statement: `Book4 and Book5 are left and right of Group` (fh-0470), `Dog2 and Cat2 should be left and right of Room6` (fh-0398), `Art and Gym should be next to each other on the right` (fh-0203), `Room1 and Room2 should be next to each other on the right side` (fh-0026), `Floor3 sits under all of them` (fh-0362, a fact with a list anchor: 0 existing facts with a list anchor), `Section1 and Section2 sit on each side of Field2` (fh-0475), `Vent2 and Fan2 sit on the side` (fh-0325): no wire, existing cases under 3.
5. A named shape as the subject of a link verb: `Bridge3 links Woods and Castle3` (fh-0391, chain Woods,Bridge3,Castle3), `Index links Word1 and Word2` (fh-0423, Index to both), `Hall connects Gate1 and Gate2` (fh-0248, Hall to both), `River connects Source to Sea` (fh-0293, River left out), `Trail connects Trailhead to Camp, and Camp to Peak` (fh-0255, Trail left out), `Player1 hits Ball4 to Player2` (fh-0395), `Ball3 rolls down the Ramp to the Floor2` (fh-0333): 1 existing case (sm2-0113, unwired), so left as the writer wrote them; the file is inconsistent on this construction until the owner decides.
6. Conditional undo (`Undo the last connect if the order is wrong`; 45 wires): existing wired 4 (sm-0451, 0456, 0467, sm2-0505) against unwired 3 (sm-0212 answer-dependent, sl-0018 and sl-0028 hedged): 4 of 7, under 2/3 and under 5 clean cases, so all 45 stay as wires. If the owner rules "conditional on the person's later judgement = no wire", remove them.
7. Statements of links with verbs that have no existing wire: `Cfo should report to Board` (fh-0003, org chart), `Notify should happen after Deploy and it should be a dotted line` (fh-0016), `Archive should only get data from Report` (fh-0028), `Customers flow from there to the exit` (fh-0031, no shape): 0 or 1 existing cases (sm-0548 `Ann follows Bo` unwired), no wire added. fh-0016 and fh-0028 may be missing a connect (Deploy to Notify dotted; Report to Archive).
8. fh-0046 `Undo the last two things`: one undo wire; 0 existing multi-step undo (sm2-0570 `Redo everything I undid today` is the only neighbour). fh-0131 `Move Subnet2 to the right of Subnet1. Oops, I want the subnets in a column instead`: the move is treated as replaced, no wire (0 existing cases).
9. fh-0344 `Connect them in order, so the season flows from one week to the next`: chain by the `in order` majority; the 2 existing `next` wires say "each to the next", this text says "from one week to the next". If the owner reads it as "each to the next", pairing next.
10. fh-0038 `Ideas and Actions go below both of them` was added as move with the list anchor Good,Bad (6 of 6 existing list anchors for above / below / rightOf are commands with a plural anchor); the list anchor as a fact has 0 cases (fh-0362).
11. Triggers of fact wires differ in style (`is` / `sits above` / `are both`); existing data has both, not normalised. Triggers of resize `Make X bigger` stay on the comparative word (as in haiku_msg2).
12. Spans that start with `just` (fh-0026, fh-0105) or `I'd like` (fh-0009): kept (`just`: 13 in the span against 11 outside, no majority).

## 6. Checks after the changes

Script `validate` run over the 10 files (output below):
- 10 files parse as JSON Lines (500 messages, 2514 wires).
- Text, id, domain and names of every message are byte-identical to `texts/texts_01..10.jsonl`.
- Every span is a substring of its text; every trigger is inside its span.
- No two wires of a message share a span, no spans overlap, wires are in text order (first occurrence of the span in the text).
- No wire key outside the legend; counts and distances are digits; every shape created in a message is `$new` in later wires.

```
{ messages: 500, wires: 2514, problems: 0 }
```
