# Label fixes for the fresh test set `fresh1/sonnet` (500 messages, fs-0001 .. fs-0500)

Label checker: Sonnet agent. Files: `batch_01.jsonl .. batch_10.jsonl`. Rules: `training/sketch/LABEL_CONVENTIONS.md`, `training/sketch/llm_train/TRAIN_MSG_SPEC.md`; majorities were counted on the corrected training sets `sonnet_msg`, `haiku_msg`, `sonnet_msg2`, `haiku_msg2`, `sonnet_long` (counts marked 'own count' were made by script in this review, the others are quoted from the LABEL_FIXES.md of those sets).

No reader, reader output, `docs/model`, `runs/` or older test set was opened. Nothing was committed. Texts, ids, domains and names were not changed (checked against `texts/`, see section 5).

## 1. Counts

- Messages: 500. Wires before: 3020. Wires now: 3030 (changed 37, added 10, removed 0). Messages with a change: 34.

| kind of fix | changed | added | removed |
|---|---|---|---|
| canvas statement -> move | 13 | 0 | 0 |
| comparative -> resize | 1 | 1 | 0 |
| copy mention | 1 | 0 | 0 |
| direction -> position | 1 | 0 | 0 |
| missing fact | 0 | 1 | 0 |
| missing move | 0 | 4 | 0 |
| relative-position statement -> fact | 1 | 0 | 0 |
| rename follow-up | 7 | 0 | 0 |
| row/column layout -> arrange | 1 | 0 | 0 |
| set -> fact | 3 | 0 | 0 |
| should be -> set | 0 | 1 | 0 |
| span widened | 9 | 0 | 0 |
| yes/no superlative | 0 | 3 | 0 |


Most of the 3020 writer wires already followed the conventions (the writer used `$new` for every created shape, loops as chain + closing connect, several-to-one as one connect, `extreme` for most superlative questions, etc.). The fixes are few and of a small number of kinds.

## 2. Rulings used (each is also in the reason of the entries below)

- 'X should be Y' / 'must be' / 'needs to be' -> `set` (or `move` for a place), never a fact (training: 26 set + 11 move + 29 rule of 69 spans with should / must / needs to be, 0 facts; from sonnet_long/LABEL_FIXES.md). Used for fs-0003 ('It should be one').
- Statement of a canvas place ('X is at the top', 'X sits in the center', 'X stays on the far left') -> `move` to the canvas place, not a fact (own count: 22 move wires from such statements against 0 facts with a canvas place; all 35 facts with a position carry an anchor; sonnet_long counted 18 of 22 statements wired as move, the 4 others unwired). 13 wires changed fact -> move.
- Statement of a relative position with a verb 'X is / sits above|below|left of Y' -> `fact` with position + anchor (8 of 8 in sonnet_msg2 notes, plus 4 of 4 'sits' statements; 0 as move). fs-0451 'the Api sits below Docs' changed move -> fact. A VERBLESS layout phrase ('Panel2 above Panel1', 'Shop right of the Bank') stays `move`: own count 111 move wires of 113 verbless 'X above|below|left of|right of|between Y' spans (1 arrange, 1 toFront, 1 fact).
- Attributes stated with 'X is ..., a huge gold star' / 'X is in the center, big and indigo' -> one `fact` wire with all keys (36 multi-key facts against 1 split, sonnet_long). 3 wires changed set -> fact (fs-0230, fs-0270, fs-0301).
- Yes/no superlative question ('Is X the smallest?', 'Founder is the biggest one, right?') -> `extreme` with the superlative only, no target (own count: 95 extreme against 2 other in the 5 training sets; 94 of 96 in sonnet_long). 3 missing wires added (fs-0057, fs-0189, fs-0297).
- Comparative without a target size ('larger', 'bigger', 'smaller', no 'than') -> `resize`, target only (own count: 30 of 30 resize; the only `set` cases are self-corrections that end on an absolute size). fs-0496 'the Bike larger and gold' -> resize + a separate set for the colour.
- 'Name the rat Roger', 'call it X', 'name the copy X' -> `rename` (own count: 9 of 9 spans starting with name / call are rename, 0 label). fs-0416 unchanged.
- Follow-up after a rename uses the NEW name, also for a pronoun that refers to it ('Rename Agenda to Plan and put it in the middle' -> Plan; sm2-0240 'nudge it' -> Anchor); a name written in the text is kept as written (16 of 17 existing). 7 wires changed.
- A contentless request ('cut it', 'swap them', 'Link, two way', 'draw that route', 'Connect those in a chain', 'how many') gets its span widened to the words that carry its names / filter (sm2-0195, sm2-0216, sm2-0379, sm2-0321). A request whose own words name its target with a pronoun and carry the value ('make it red') is not widened. 9 spans widened.
- Copies of a duplicate are `mention(recency=newest)`, not `$new` (20 of 20 existing). fs-0421.
- A move to a side or place without a distance is `position`, not `direction` (161 position against 0 direction without a distance, sm2-0237). fs-0259 'Put the Hen up' -> top.
- 'in a row / column [below X]' is a layout -> `arrange` with target + layout only (6 of 6: sm-0156, sm-0234, sm-0415, sm2-0171, sm2-0272, sm2-0434). fs-0251.
- Anchor 'all of them' / 'under them' = the names comma-joined in one key (LABEL_CONVENTIONS; sm2-0487, 2 cases). fs-0280, fs-0410.
- Conditionals ('If it is not, make it a diamond', 'link them if not', 'cut that link if yes') stay wired as plain commands (sm2-0225, 0279, 0399, 0505, sm-0451). Unchanged.
- Loops = chain + separate closing connect (4 of 4 + 13 in sm2); several-to-one = ONE connect; one-to-several = ONE connect; 'A to B and B to C' = chain. All writer wires follow this. Unchanged.
- A request taken back ('Delete X ... no, keep it', 'Cut the line ... Never mind', 'Link Cat to Dog? No. Don't.') gets no wire; self-corrections end on the final value. All writer wires follow this. Unchanged.
- Reachability: 'what can be reached / which shapes can X reach' -> `reachable`; 'is Y reachable from X', 'is there a route / way', 'does X reach Y' -> `path` from X to Y. All writer wires follow this. Unchanged.
- 'how many connections / links' without a target -> `count kind=edge`; 'how many links does X have', 'is X connected to anything' -> `degree` (own count: 'to anything' -> degree 2 of 2: sl-0025, sl-0071). Unchanged.

## 3. Changes (one line per wire: id [kind]: before -> after (reason))

### should be -> set (1)

- fs-0003 [should be -> set]: (no wire) -> command:set target=Sauce shape=circle [should be] «It should be one»  (reason: 'X should be Y' is a request to change it -> set (existing: 26 set + 11 move + 29 rule of 69 'should be' spans, 0 facts); 'It should be one' after the question 'Is the Sauce a circle?' states the wanted shape)

### canvas statement -> move (13)

- fs-0014 [canvas statement -> move]: fact:None target=Header position=top [is] «the Header is at the top» -> command:move target=Header position=top [is at] «the Header is at the top»  (reason: statement of a canvas place ('X is at the top') -> move (counted in the 5 training sets: 22 move wires from 'X is / sits / stays at|in|on <canvas place>' statements against 0 facts with a canvas place; all 35 facts with a position carry an anchor; sonnet_long counted 18 of 22 statements wired as move))
- fs-0014 [canvas statement -> move]: fact:None target=Footer position=bottom [is] «the Footer is at the bottom» -> command:move target=Footer position=bottom [is at] «the Footer is at the bottom»  (reason: statement of a canvas place ('X is at the top') -> move (counted in the 5 training sets: 22 move wires from 'X is / sits / stays at|in|on <canvas place>' statements against 0 facts with a canvas place; all 35 facts with a position carry an anchor; sonnet_long counted 18 of 22 statements wired as move))
- fs-0132 [canvas statement -> move]: fact:None target=Sales position=right [is] «Sales is on the far right» -> command:move target=Sales position=right [is on] «Sales is on the far right»  (reason: statement of a canvas place ('X is at the top') -> move (counted in the 5 training sets: 22 move wires from 'X is / sits / stays at|in|on <canvas place>' statements against 0 facts with a canvas place; all 35 facts with a position carry an anchor; sonnet_long counted 18 of 22 statements wired as move))
- fs-0230 [canvas statement -> move]: fact:None target=Ceo position=top [sits] «The Ceo is the boss and sits at the top» -> command:move target=Ceo position=top [sits at] «The Ceo is the boss and sits at the top»  (reason: statement of a canvas place ('X is at the top') -> move (counted in the 5 training sets: 22 move wires from 'X is / sits / stays at|in|on <canvas place>' statements against 0 facts with a canvas place; all 35 facts with a position carry an anchor; sonnet_long counted 18 of 22 statements wired as move))
- fs-0270 [canvas statement -> move]: fact:None target=Cafe position=bottomRight [is] «Cafe is in the bottom right» -> command:move target=Cafe position=bottomRight [is in] «Cafe is in the bottom right»  (reason: statement of a canvas place ('X is at the top') -> move (counted in the 5 training sets: 22 move wires from 'X is / sits / stays at|in|on <canvas place>' statements against 0 facts with a canvas place; all 35 facts with a position carry an anchor; sonnet_long counted 18 of 22 statements wired as move))
- fs-0301 [canvas statement -> move]: fact:None target=Hub position=center [is] «The Hub is in the center» -> command:move target=Hub position=center [is in] «The Hub is in the center»  (reason: statement of a canvas place ('X is at the top') -> move (counted in the 5 training sets: 22 move wires from 'X is / sits / stays at|in|on <canvas place>' statements against 0 facts with a canvas place; all 35 facts with a position carry an anchor; sonnet_long counted 18 of 22 statements wired as move))
- fs-0360 [canvas statement -> move]: fact:None target=Camp position=top [is] «at the top, is the Camp» -> command:move target=Camp position=top [is] «at the top, is the Camp»  (reason: statement of a canvas place ('X is at the top') -> move (counted in the 5 training sets: 22 move wires from 'X is / sits / stays at|in|on <canvas place>' statements against 0 facts with a canvas place; all 35 facts with a position carry an anchor; sonnet_long counted 18 of 22 statements wired as move))
- fs-0401 [canvas statement -> move]: fact:None target=Legacy position=left [stays] «The Legacy box stays on the far left» -> command:move target=Legacy position=left [stays on] «The Legacy box stays on the far left»  (reason: statement of a canvas place ('X is at the top') -> move (counted in the 5 training sets: 22 move wires from 'X is / sits / stays at|in|on <canvas place>' statements against 0 facts with a canvas place; all 35 facts with a position carry an anchor; sonnet_long counted 18 of 22 statements wired as move))
- fs-0401 [canvas statement -> move]: fact:None target=Bucket position=bottomRight [is] «The Bucket is at the bottom right» -> command:move target=Bucket position=bottomRight [is at] «The Bucket is at the bottom right»  (reason: statement of a canvas place ('X is at the top') -> move (counted in the 5 training sets: 22 move wires from 'X is / sits / stays at|in|on <canvas place>' statements against 0 facts with a canvas place; all 35 facts with a position carry an anchor; sonnet_long counted 18 of 22 statements wired as move))
- fs-0439 [canvas statement -> move]: fact:None target=Ch1 position=left [is] «Ch1 is on the left» -> command:move target=Ch1 position=left [is on] «Ch1 is on the left»  (reason: statement of a canvas place ('X is at the top') -> move (counted in the 5 training sets: 22 move wires from 'X is / sits / stays at|in|on <canvas place>' statements against 0 facts with a canvas place; all 35 facts with a position carry an anchor; sonnet_long counted 18 of 22 statements wired as move))
- fs-0439 [canvas statement -> move]: fact:None target=Ch3 position=right [is] «Ch3 is on the right» -> command:move target=Ch3 position=right [is on] «Ch3 is on the right»  (reason: statement of a canvas place ('X is at the top') -> move (counted in the 5 training sets: 22 move wires from 'X is / sits / stays at|in|on <canvas place>' statements against 0 facts with a canvas place; all 35 facts with a position carry an anchor; sonnet_long counted 18 of 22 statements wired as move))
- fs-0478 [canvas statement -> move]: fact:None target=Spawn position=topLeft [is] «The Spawn is at the top left» -> command:move target=Spawn position=topLeft [is at] «The Spawn is at the top left»  (reason: statement of a canvas place ('X is at the top') -> move (counted in the 5 training sets: 22 move wires from 'X is / sits / stays at|in|on <canvas place>' statements against 0 facts with a canvas place; all 35 facts with a position carry an anchor; sonnet_long counted 18 of 22 statements wired as move))
- fs-0478 [canvas statement -> move]: fact:None target=Gate position=bottomRight [the Gate] «the Gate at the bottom right» -> command:move target=Gate position=bottomRight [at the bottom right] «the Gate at the bottom right»  (reason: statement of a canvas place ('X is at the top') -> move (counted in the 5 training sets: 22 move wires from 'X is / sits / stays at|in|on <canvas place>' statements against 0 facts with a canvas place; all 35 facts with a position carry an anchor; sonnet_long counted 18 of 22 statements wired as move))

### missing fact (1)

- fs-0032 [missing fact]: (no wire) -> fact:None target=Button size=tiny [is] «The Button is tiny»  (reason: stated fact 'The Button is tiny' had no wire (facts with size are wired: fs-0024 'the Moon is tiny and gray'; existing sm2-0068/0527 'Mid is big' added))

### rename follow-up (7)

- fs-0041 [rename follow-up]: command:move target=Agenda position=center [put] «put it in the middle of the canvas» -> command:move target=Plan position=center [put] «put it in the middle of the canvas»  (reason: follow-up after a rename uses the new name as written, also for a pronoun (16 of 17 existing; sm2-0240 'nudge it 100 pixels right' -> new name))
- fs-0041 [rename follow-up]: command:set target=Agenda size=large color=gold [Make] «Make it big and gold» -> command:set target=Plan size=large color=gold [Make] «Make it big and gold»  (reason: follow-up after a rename uses the new name as written, also for a pronoun (16 of 17 existing; sm2-0240 'nudge it 100 pixels right' -> new name))
- fs-0041 [rename follow-up]: question:property target=Agenda property=color [what color] «tell me what color it is» -> question:property target=Plan property=color [what color] «tell me what color it is»  (reason: follow-up after a rename uses the new name as written, also for a pronoun (16 of 17 existing; sm2-0240 'nudge it 100 pixels right' -> new name))
- fs-0041 [rename follow-up]: command:create count=3 size=small color=white shape=circle position=near anchor=Agenda [Create] «Create three small white circles near it» -> command:create count=3 size=small color=white shape=circle position=near anchor=Plan [Create] «Create three small white circles near it»  (reason: follow-up after a rename uses the new name as written, also for a pronoun (16 of 17 existing; sm2-0240 'nudge it 100 pixels right' -> new name))
- fs-0041 [rename follow-up]: question:nearest anchor=Agenda superlative=farthest [farthest from] «Which shape is the farthest from it» -> question:nearest anchor=Plan superlative=farthest [farthest from] «Which shape is the farthest from it»  (reason: follow-up after a rename uses the new name as written, also for a pronoun (16 of 17 existing; sm2-0240 'nudge it 100 pixels right' -> new name))
- fs-0249 [rename follow-up]: command:duplicate target=Fan count=2 [Duplicate] «Duplicate it twice» -> command:duplicate target=Blower count=2 [Duplicate] «Duplicate it twice»  (reason: follow-up after a rename uses the new name as written, also for a pronoun (16 of 17 existing; sm2-0240 'nudge it 100 pixels right' -> new name) ('Rename the Fan to Blower. Duplicate it twice' -> it = Blower))
- fs-0331 [rename follow-up]: command:label target=Poem label=5-7-5 [label] «label it "5-7-5"» -> command:label target=Haiku label=5-7-5 [label] «label it "5-7-5"»  (reason: follow-up after a rename uses the new name as written, also for a pronoun (16 of 17 existing; sm2-0240 'nudge it 100 pixels right' -> new name) ('Rename the Poem to Haiku, then label it' -> it = Haiku))

### span widened (9)

- fs-0051 [span widened]: command:align target=Ward,Lab axis=horizontal [line up] «they line up horizontally» -> command:align target=Ward,Lab axis=horizontal [line up] «make the Ward and the Lab side by side, same height, so they line up horizontally»  (reason: span must contain the names (Ward, Lab) that the pronoun 'they' needs (sm2-0195, sm2-0216: span widened to the words that carry the content))
- fs-0071 [span widened]: command:label target=mention(recency=oldest,shape=circle) label=Theory [label] «label it Theory» -> command:label target=mention(recency=oldest,shape=circle) label=Theory [label] «give me the first one labelled Methods. Hmm, scratch that, label it Theory»  (reason: span must cover the self-correction and the referent ('the first one'): 'give me the first one labelled Methods. Hmm, scratch that, label it Theory' (sm2-0084: span covers the self-correction; sm2-0195: span holds the names the pronoun needs))
- fs-0121 [span widened]: command:connect from=Hall1,Hall2,Hall3,Cafe pairing=chain [draw] «draw that route as a chain of arrows» -> command:connect from=Hall1,Hall2,Hall3,Cafe pairing=chain [draw] «The visit begins in Hall1, goes through Hall2, then Hall3 and finally ends up in the Cafe. Can you draw that route as a chain of arrows»  (reason: span must contain the names the chain is built from ('draw that route' refers to the previous sentence; sm2-0379, sm2-0195))
- fs-0151 [span widened]: command:disconnect from=Bar to=Toilets [cut] «cut it» -> command:disconnect from=Bar to=Toilets [cut] «a link between Bar and Toilets that shouldn't be there, so cut it»  (reason: contentless request: 'cut it' needs the link it refers to (Bar, Toilets) inside the span (sm2-0195, sm2-0216))
- fs-0218 [span widened]: question:count shape=circle [how many] «how many» -> question:count shape=circle [how many] «all shapes that are circles - how many»  (reason: contentless request: 'how many' alone does not say what is counted; span widened to the words that carry the filter (sm2-0195, sm2-0216))
- fs-0276 [span widened]: command:swap target=Isle1,Isle2 [swap] «swap them» -> command:swap target=Isle1,Isle2 [swap] «Take Isle1 and Isle2 and swap them»  (reason: contentless request: 'swap them' needs the names Isle1 and Isle2 inside the span (sm2-0195, sm2-0216))
- fs-0310 [span widened]: command:connect from=Ticket,Bot,Agent,Manager pairing=chain [Connect] «Connect those in a chain please, in that order» -> command:connect from=Ticket,Bot,Agent,Manager pairing=chain [Connect] «The Ticket first goes to the Bot. If the Bot can't solve it, it goes to the Agent, and if the Agent can't, it goes to the Manager. Connect those in a chain please, in that order»  (reason: span must contain the names the chain is built from ('Connect those' refers to the three sentences before; sm2-0379, sm2-0195))
- fs-0341 [span widened]: command:connect from=Joe to=Jim arrow=both [Link] «Link, two way» -> command:connect from=Joe to=Jim arrow=both [Link] «Joe knows Jim. Link, two way»  (reason: contentless request: 'Link, two way' needs the names Joe and Jim inside the span (sm2-0195, sm2-0216))
- fs-0380 [span widened]: command:connect from=Kickoff,Design,Build,Review,Launch pairing=chain [Connect] «Connect them all one after the other» -> command:connect from=Kickoff,Design,Build,Review,Launch pairing=chain [Connect] «Kickoff is first and Launch is last, with Design, Build and Review in between in that order. Connect them all one after the other»  (reason: span must contain the names the chain is built from ('Connect them all one after the other' refers to the previous sentence; sm2-0379, sm2-0195))

### yes/no superlative (3)

- fs-0057 [yes/no superlative]: (no wire) -> question:extreme superlative=biggest [biggest] «Founder is the biggest one, right»  (reason: yes/no superlative question -> extreme with the superlative only, no target (existing: 94 of 96 'Is X the leftmost/biggest...'))
- fs-0189 [yes/no superlative]: (no wire) -> question:extreme superlative=smallest [smallest] «Is N1 the smallest»  (reason: yes/no superlative question 'Is N1 the smallest?' had no wire; it is asked as its own question, not taken back, and then re-asked as 'Which is the smallest one anyway' (existing: 94 of 96 'Is X the smallest' -> extreme with the superlative only))
- fs-0297 [yes/no superlative]: (no wire) -> question:extreme superlative=smallest [smallest] «Is Ford the smallest»  (reason: yes/no superlative question had no wire -> extreme with the superlative only, no target (existing: 94 of 96 'Is X the smallest/leftmost...'))

### missing move (4)

- fs-0080 [missing move]: (no wire) -> command:move target=Room1 position=leftOf anchor=Hall [go left] «Room1 and Room2 go left»  (reason: missing wires: 'Room1 and Room2 go left and right of the Hall' states two moves and had none ('X goes above it' is wired as move in the same message); two spans, no shared span)
- fs-0080 [missing move]: (no wire) -> command:move target=Room2 position=rightOf anchor=Hall [right of] «right of the Hall»  (reason: missing wires: 'Room1 and Room2 go left and right of the Hall' states two moves and had none ('X goes above it' is wired as move in the same message); two spans, no shared span)
- fs-0280 [missing move]: (no wire) -> command:move target=Path position=below anchor=Bed1,Bed2,Bed3 [under] «under them»  (reason: missing wire: 'the Path should be a long rectangle under them' also states the place (below the beds); the set wire stops before 'under them' (compare fs-0008 'big red circle in the middle of the canvas': set + move, two spans); anchor list comma-joined (sm2-0487))
- fs-0410 [missing move]: (no wire) -> command:move target=Burner position=below anchor=Flask1,Flask2,Flask3 [go under] «The Burner needs to go under all of them»  (reason: missing wire: 'The Burner needs to go under all of them' is a request ('needs to go' like 'must be') and had no wire; anchor 'all of them' = Flask1,Flask2,Flask3 comma-joined in one key (LABEL_CONVENTIONS; sm2-0487 'above all three'))

### set -> fact (3)

- fs-0230 [set -> fact]: command:set target=Ceo size=huge color=gold shape=star [a huge] «a huge gold star» -> fact:None target=Ceo size=huge color=gold shape=star [a huge] «a huge gold star»  (reason: stated attributes 'The Ceo is the boss ..., a huge gold star' are a statement ('X is Y, a Z'), not a request -> fact with all keys (existing: 36 multi-key facts; 'The Park is green, a circle' -> one fact))
- fs-0270 [set -> fact]: command:set target=Cafe size=small color=brown [small] «small and brown» -> fact:None target=Cafe size=small color=brown [small] «small and brown»  (reason: stated attributes 'Cafe is in the bottom right, small and brown' are a statement of how the Cafe is -> fact (existing: 36 multi-key facts; statement 'X is Y' = fact))
- fs-0301 [set -> fact]: command:set target=Hub size=large color=indigo [big] «big and indigo» -> fact:None target=Hub size=large color=indigo [big] «big and indigo»  (reason: stated attributes 'The Hub is in the center, big and indigo' are a statement of how the Hub is -> fact (existing: 36 multi-key facts; statement 'X is Y' = fact))

### row/column layout -> arrange (1)

- fs-0251 [row/column layout -> arrange]: command:move target=Table1,Table2 position=below anchor=Pass [put] «put them under the Pass, one next to the other» -> command:arrange target=Table1,Table2 layout=row [put] «put them under the Pass, one next to the other»  (reason: 'put them under the Pass, one next to the other' states a row below an anchor -> arrange row with target + layout only, no position (existing: 6 of 6 'in a row / column below|on the left|at the top of X' are arrange only: sm-0156, sm-0234, sm-0415, sm2-0171, sm2-0272, sm2-0434))

### direction -> position (1)

- fs-0259 [direction -> position]: command:move target=Hen direction=up [Put] «Put the Hen up» -> command:move target=Hen position=top [Put] «Put the Hen up»  (reason: move to a side/place without a distance is position, not direction (existing: 161 position against 0 direction without a distance; sm2-0237); 'Put the Hen up' = top, like 'the Pig down at the bottom')

### copy mention (1)

- fs-0421 [copy mention]: command:connect from=Note to=$new [connect] «connect the original to the first copy» -> command:connect from=Note to=mention(recency=newest) [connect] «connect the original to the first copy»  (reason: copies of a duplicate are labelled with mention(recency=newest), not $new (20 of 20 existing: sm2-0035, sm-0446, sm-0506, sm2-0215, sm2-0367 ...))

### relative-position statement -> fact (1)

- fs-0451 [relative-position statement -> fact]: command:move target=Api position=below anchor=Docs [sits] «the Api sits below Docs» -> fact:None target=Api position=below anchor=Docs [sits] «the Api sits below Docs»  (reason: statement 'X sits below Y' (X is/sits <relative position> Y, no request verb) is a fact with position + anchor (existing: 8 of 8 'X is above / sits left of Y' + 4 of 4 'X sits between/above Y' = 12 of 12 facts, 0 moves))

### comparative -> resize (2)

- fs-0496 [comparative -> resize]: command:set target=Bike size=large color=gold [larger] «the Bike larger and gold» -> command:resize target=Bike [larger] «the Bike larger»  (reason: comparative 'larger' without a target size is resize (existing: 30 of 30 'larger/bigger/smaller' without 'than' are resize unless a self-correction ends on an absolute size); the colour 'gold' is a separate set wire with its own span)
- fs-0496 [comparative -> resize]: (no wire) -> command:set target=Bike color=gold [and gold] «and gold»  (reason: second request of 'the Bike larger and gold' (verb ellipsis: own span, trigger = leading words of the span, 136 of 137))

## 4. Checked, no change (the writer's own doubts)

- Reachability: 88 `path` and 7 `reachable` wires; every 'is Y reachable from X / is there a route / does X reach Y' is `path`, every 'what can be reached / which things the AP reaches / everything reachable from P1' is `reachable`. No exception.
- Resize without direction: 28 `resize` wires after the fix, all target only; 'larger / bigger / smaller / shrink / enlarge / blow it up / resize ... to be larger' are resize (fs-0496 fixed). 'Make Node1 a bit smaller than Node2' (fs-0122) and 'Make the Tamer larger than the Lion' (fs-0449) resize the first shape.
- Size words: scripted check of every `size` value against the words of its span (big / large -> large, huge, small, tiny, medium): no mismatch; 'wide / long / tall' give no size (fs-0014, fs-0137, fs-0191, fs-0463).
- Comparative check: 'Is X bigger / smaller / larger than Y' -> `check` comparison + anchor in every case. A statement 'X is bigger than Y' (fs-0192, fs-0277, fs-0388) and 'which is bigger than the Court' (fs-0174), 'how far away is the Wall' (fs-0180), 'same size / same shape' (fs-0110, fs-0229, fs-0248) are not in the legend: no wire.
- Superlatives: 'which / what is the biggest|smallest|leftmost|...' -> `extreme`; 'closest / farthest / nearest' -> `nearest`; 'lowest' -> bottommost; 'Delete the biggest one' (fs-0326) has no mention form: no wire (sm2-0132).
- How many connections: 'how many connections / links (in total)' -> `count kind=edge` (65 wires); 'how many links does X have / are linked to X' -> `degree` (fs-0289, fs-0306); no mix-up.
- Corners and places: topLeft / topRight / bottomLeft / bottomRight / center / top / bottom / left / right correct in every move; 'far left' = left; 'top center' = top, 'bottom center' = bottom.
- Self-corrections and discarded requests: every self-correction ends on its final value (fs-0015, 0021, 0066, 0091, 0110, 0131, 0160, 0163, 0178, 0215, 0245, 0290, 0311, 0315, 0342, 0358, 0362, 0383, 0400, 0412, 0465, 0485 ...); discarded requests have no wire (fs-0015 delete, 0050 delete, 0210 near, 0260 dotted links, 0301 circle, 0304 remove, 0433 link, 0472 cut). One residual doubt: fs-0478 'Just put them in a row between Spawn and Gate. Hmm, one cannot put three shapes between two, I'll go without.' kept as `arrange row` (the 'between' half is dropped, the row is kept).
- Conditionals ('If so, move X', 'link them if not', 'cut that link if yes', 'resize Table3 to be larger if so'): all wired as plain commands (fs-0002, 0021, 0083, 0019, 0145, 0181, 0340, 0348, 0380, 0401, 0500); the training sets wire them too.
- Restatements: fs-0366 'The Alien is green. Alien stays green.' -> two facts kept; fs-0189 'Is N1 the smallest? Which is the smallest one anyway?' -> two `extreme` wires (first added); fs-0057 added.
- Chains: 'Home to Bus to Office. Chain.', 'A to B and B to C', 'Link A, B and C in a chain', 'each to the next' (fs-0115) -> chain / next as in the conventions; loops (fs-0056, 0205, 0394, 0446) are chain + closing connect.
- Quantified requests: expressible with a mention and kept: fs-0027 'Make everything small', fs-0078 'Remove every shape that isn't green' (notcolor=green, quantifier=all), fs-0147 'Everything that is red should become blue', fs-0313, fs-0397 'All shapes that are blue become pink', fs-0219, fs-0309, fs-0342, fs-0450, fs-0484. Not expressible, no wire: fs-0281 'Remove all shapes that are not blue and not red' (two notcolor values; a mention with only one notcolor would delete the wrong shapes).
- 'Name the rat Roger' (fs-0416) = rename (9 of 9), 'Name it Gift' (fs-0022) = rename $new.
- Elided verbs: spans are separate per request; triggers follow the training handling (set / fact / create: leading words, move: the position phrase, connect: 'Name to'). Checked by script: no shared span in the file (and no overlapping spans).
- Created shapes referred to later: the writer DID use `$new` (scripted check: 0 wires use the literal name of a shape created earlier in the same message; 0 `$new` before a create). Kept.
- Rules and forget: fs-0029, 0095, 0108, 0191, 0280, 0330, 0431, 0434 rules; fs-0202, 0431 forget; fs-0029 partial forget see owner list.
- 'undo undo undo' (fs-0415): one `undo` wire, see owner list (0 training cases of a repeated undo).
- Verbless layout phrases ('Panel2 above Panel1', 'Floor2 on top of Floor1', 'Lid on top of Pot ... above it', 'Hotel between Beach and Airport', 'Shop right of the Bank', 'stock beside bond', 'Slogan under Logo'): `move` (111 of 113 in the training sets).

## 5. For the owner (not decided: fewer than 5 existing cases or a majority under 2/3)

1. Repeated subject or target in one sentence ('Link Api to Db and Api to Cache'): written as ONE connect (one to several / several to one) in fs-0012, fs-0089, fs-0155, fs-0256, fs-0368, fs-0248 (6 wires). Training: hm2-0057 one wire, hm2-0069 / 0118 / 0180 two wires; no majority.
2. Partial forget (fs-0029 'And forget it for squares'): no wire; the legend's `forget` forgets all rules, there is no rule to forget for one shape.
3. Distributed values in one statement (fs-0086 'Rose, Tulip and Lily should be pink, purple and yellow'): three `set` wires are missing; one span cannot be shared and no clean three-way cut exists; 0 comparable training cases. Only the Daisy wire exists.
4. Yes/no questions about links to several shapes: fs-0200 ('Does the AP link to both the Laptop and the Phone?'), fs-0220 ('Is Proxy linked to both of them?'), fs-0410 ('Is the Burner linked to the others?'), fs-0430 ('Do any of the TVs connect to the Bar?'): no wire (`connected` has one anchor; 'anything / which shapes connect to X' is `neighbors` but these restrict the set). 4 cases, no precedent.
5. Either/or and relation questions: fs-0395 'Is the Rabbit above or below the Hamster?' written as `property position` (Rabbit) while fs-0361 'Is M above N, or left of it?' is two `check` wires; fs-0478 'bigger or smaller' (Tower2 vs Tower3), fs-0110 'same shape as', fs-0248 'are they same': no wire. No precedent.
6. A shape created in the message and referred to by description or ordinal: fs-0036 w7 'the green triangle' (kept mention(color=green,shape=triangle), the tree created three sentences before), fs-0071 w1 and fs-0209 w1 'the first one' / 'the first' (mention(recency=oldest,shape=circle), two circles created). Existing named creates: `$new` 87 of 87; no case with a description. 3 cases.
7. Pronoun for several created shapes: fs-0450 'Add three hexagons ... color them all teal' -> mention(quantifier=all,shape=hexagon) (alternative `$new`). 1 case.
8. Two connects vs one chain when the text states them as separate requests or in reverse order: fs-0183 'Couple the Wagon1 to the Loco, and then Wagon2 to Wagon1, chain style' (kept as two connects; a chain wire would run in creation order, the reverse), fs-0356 'link Main to Fix, and merge Fix into Dev, so link Fix to Dev' (two connects), fs-0360 'Link the Gate to Food, and then Food to both stages' (two connects, fan-out), fs-0436 (two connects with different styles). 4 cases.
9. Restyle of a link: fs-0030 ('Make the lines dotted') and fs-0117 ('Make the arrow gold') are folded into the connect wire of the same message (2 existing folds: sm-0389, sm-0234); fs-0243 'the arrow from Stage1 to Stage2 should be dashed. Just that one.' (said before the chain exists) has no wire; the chain connect carries no style.
10. Underspecified or implied requests, no wire: fs-0238 'and connect it' (to what?), fs-0349 'the others between them. Er, Method then Result.', fs-0441 'Pupil3 and Pupil4 are friends too' (implied link like 'Pupil1 and Pupil2 are friends, link them'), fs-0017 'I want them all rectangles', fs-0234 'Ghost is above Pac, and Pac is to the left of the Ghost. Wait, I want that: ...' (only the final move). 5 cases, all different.
11. 'another one / another called X' carries the shape of the previous create but the writer did not carry the colour: fs-0262, fs-0396, fs-0187 (3 cases; shape carried 12 of 12 in training for 'a gray one', colour of 'another' not counted).
12. Unfiltered 'Show all the shapes' (fs-0387) is `list` with no filter; the alternative is `describe` (sm-0334 'Show me a description of everything' is describe; no case of an unfiltered list). 1 case.
13. 'undo undo undo' (fs-0415): ONE `undo` wire; the alternative is three wires with three spans. 0 training cases of a repeated undo.
14. Copy reference 'the first copy' (fs-0421): changed to mention(recency=newest) by the 20-of-20 rule for copies, but 'first copy' of four copies is the OLDEST copy; the mention form cannot say it. 1 case.
15. Plural description as target ('Students should be small circles' fs-0104, 'all beds' fs-0280, 'the beds' fs-0454, 'the patient areas' fs-0320, 'the tables' fs-0251, 'the three rooms' fs-0080): written as comma-joined names. Training: no count.
16. Elided-verb connect triggers ('Chain' fs-0482, 'Team3 to', 'Wagon2 to' ...): not settled in training either (33 cases, 21 'Core to', 12 leading).

## 6. Checks (script, after the changes)

- All 10 files parse as JSON Lines: 500 messages, 3030 wires.
- Every id, text, domain and names value is identical to `fresh1/sonnet/texts/texts_NN.jsonl` (0 differences; ids in the same order).
- Every span is a substring of its text: 0 failures. Every trigger is a substring of its span: 0 failures.
- No two wires share a span (identical or overlapping): 0 cases.
- Wires are in text order (span start positions never decrease): 0 failures.
- Wire `type` is command / question / fact / rule everywhere; all keys of every wire are legal for its action (scripted check of size values; keys written by the writer were not changed except as logged above).
