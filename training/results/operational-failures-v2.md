# Operational set failures, dispatcher distilbert v2 (full pipeline)

Run: `node scripts/eval-operational.mjs --ort <onnxruntime-node> --model-dir docs/webchat/models/dispatcher --verbose --no-write` on 1234 messages of `training/eval/operational.jsonl` (commit 215677c): right 91.2%, partly 3, wrong 35, not understood 71 (109 failing items). The rules-only run (`--rules-only`) fails on 166 items; 105 of the 109 full-pipeline failures also fail there, and 4 fail only with the encoder (docs.editor#038, kids.animals#074, ui.avatar#082, ui.shell#034, see class B and A). The operational set was not changed; gold corrections are listed under class D.

Note: `--json` suppresses the per-item lines, so the run used `--verbose` instead. Every item was classified by hand from the message, setup, gold, the reply and the failing check; probes with `node src/cli.mjs formalize "<text>"` showed which world's pattern captures a message.

## Summary

| Class | Meaning | Items | Share of failures |
| --- | --- | --- | --- |
| A | real gap, rules | 55 | 50% |
| B | real gap, dispatch / world selection / segmentation | 25 | 23% |
| C | wrong action | 20 | 18% |
| D | gold error | 6 | 6% |
| E | out of scope or unanswerable | 0 | 0% |
| F | ambiguous or garbled | 3 | 3% |
| total | | 109 | |

**Effective accuracy** (D, E, F counted as acceptable): (1125 + 9) / 1234 = 91.9% (headline 91.2%). Dropping them from the denominator instead: 1125 / 1225 = 91.8%.

**Answer to the question:** 100 of 109 failures (92%) are relevant: reasonable requests in a world's scope. Only 9 (8%) are bad test items and none is plain gibberish or out of scope (class E is empty: the set was written from each world's scope). The failures are not test noise. Most important findings:
1. **20 wrong actions, 5 of them harmful** (a side effect in another world, or a confident wrong answer). Two renamed the robot because the "my name is" pattern of ui.avatar captured unrelated sentences (kids.time#096, ui.avatar#107); chess#039 added a reminder and drew squares; docs.editor#034 added "a" to a to-do list; kids.arith#106 states a wrong sum.
2. **Generic patterns of other worlds win over the right world** (class B): `pat.media.music.melody.add.bare` ("add <anything>"), `pat.data.charts.r2.ren.c` ("<x> should be <y>"), `pat.data.charts.r2.val.q2` ("how many <x> do I have"), `pat.media.music.song` ("give me <x>"), `pat.art.draw.recolor` (colour verbs without the object being present). They are greedy and have no check that the object exists, so the avatar, editor and map worlds lose.
3. **Self-correction ("X, no, Y")** is split at the comma and the stray "no" goes to games.guess ("We are not playing twenty questions"): 8 items across 8 worlds; 2 harmful (chess played the wrong move, tic-tac-toe placed the wrong mark) and hangman consumed a wrong guess.
4. **Compound questions with a buy clause** in kids.shop (6 items, one pattern family) are the largest single rules gap.

## Counts per world

| World | Items | A | B | C | D | E | F |
| --- | --- | --- | --- | --- | --- | --- | --- |
| art.draw | 14 | 8 | 4 | 1 | 1 | 0 | 0 |
| data.charts | 5 | 2 | 0 | 3 | 0 | 0 | 0 |
| docs.editor | 12 | 3 | 3 | 6 | 0 | 0 | 0 |
| docs.reader | 2 | 0 | 1 | 0 | 1 | 0 | 0 |
| games.chess | 4 | 0 | 2 | 1 | 1 | 0 | 0 |
| games.guess | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| games.hangman | 4 | 2 | 1 | 0 | 1 | 0 | 0 |
| games.tictactoe | 6 | 2 | 1 | 0 | 2 | 0 | 1 |
| geo.map | 3 | 1 | 1 | 1 | 0 | 0 | 0 |
| kids.animals | 4 | 4 | 0 | 0 | 0 | 0 | 0 |
| kids.arith | 7 | 6 | 0 | 1 | 0 | 0 | 0 |
| kids.common | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| kids.shapes | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| kids.shop | 7 | 6 | 1 | 0 | 0 | 0 | 0 |
| kids.tasks | 1 | 0 | 1 | 0 | 0 | 0 | 0 |
| kids.time | 7 | 6 | 0 | 1 | 0 | 0 | 0 |
| media.music | 4 | 3 | 0 | 1 | 0 | 0 | 0 |
| ui.avatar | 24 | 10 | 8 | 4 | 0 | 0 | 2 |
| ui.shell | 2 | 0 | 1 | 1 | 0 | 0 | 0 |

## Fix list for class A (missing phrasing patterns, deduplicated)

Priority H = common real phrasing, M = plausible, L = contrived or rare.

| Priority | Family | Items | World |
| --- | --- | --- | --- |
| H | Buy clause inside the question: "how much money do I have left after I buy N <item>" | kids.shop#018, 019, 020, 021, 022, 024 | kids.shop |
| H | Subtraction phrasing "take N away from M"; word-problem verb "X gives away N" | kids.arith#026, #071 | kids.arith |
| H | Unit elided in word problems ("Ana has 3", "what is left for Mia"): resolve the unit from the previous clause; currently also gives a wrong answer (C: kids.arith#106) | kids.arith#105, #106 | kids.arith |
| M | Filler prefix "quick one:" and similar lead-ins (strip or add as optional prefix in all worlds) | kids.time#041, 042, 066, 073, games.tictactoe#005 | kids.time, games.tictactoe |
| M | Typo repair for common function words and domain words ("wat", "hw", "mak", "ther", "pluss", "spidr"); protect valid domain words from wrong repair ("boat"->"coat", "flute"->"flat", "ben"->"bin", "draw"->"drag") | kids.arith#138, kids.animals#032, art.draw#008, #013, data.charts#005, media.music#009, games.hangman#002 | several |
| M | Elliptical follow-ups: "make it cyclops", "and make them square", "and the day after that", "make that list numbered", "go back to round eyes" | ui.avatar#086, #087, #025, kids.time#090, docs.editor#006 | ui.avatar, kids.time, docs.editor |
| M | Avatar part phrasing: "put a dish on your head", "give yourself a pair of visor eyes", "swap your eyes for cyclops ones", "your mouth could be a zigzag", "what mouths are there" | ui.avatar#011, #103, #105, #108, #109, #067 | ui.avatar |
| M | Wish phrasing: "I would rather see it as a pie", "i think you would look better with square eyes" | data.charts#053, ui.avatar#104 | data.charts, ui.avatar |
| M | Document phrasing: "start the document with a title: X", "scratch the last thing i added" (undo wording) | docs.editor#004, #007 | docs.editor |
| M | Bare noun requests "a purple tree please", "i want a clean page", "slide the house over to the right" | art.draw#019, #097, #040 | art.draw |
| M | Questions: "what is middle C", "how many letters does the word have", "do dolphins breathe air or are they fish", "how are you" (small talk), undo for tic-tac-toe | media.music#035, games.hangman#026, kids.animals#078, kids.common#029, games.tictactoe#031 | several |
| M | Knowledge: ball is a sphere | kids.shapes#054 | kids.shapes |
| L | "squared", chained operations "7 plus 5 minus 2", "the day after tomorrow if today is Monday" | kids.arith#052, #053, kids.time#094 | kids.arith, kids.time |
| L | Coordinates and notes: "put the house at 200, 300", "45.5 north 25 east", "play A4 for 2 beats", "put a boat on the water", "make it look like night time" | art.draw#083, #092, #098, geo.map#081, media.music#060 | several |
| L | Contrived questions: "how many legs is it that a spider walks on", "what sound does a dog make and does a cat" | kids.animals#076, #074 | kids.animals |

## Class B: dispatch, world selection, segmentation

Subgroups: (1) greedy generic patterns of another world (music add.bare, charts ren.c / val.q2, draw recolor, music song) capture the message; (2) self-correction split; (3) compound messages (segment boundary); (4) context: the last-used world should win ("remove it"); (5) encoder-only failures (the rules-only run is right): ui.avatar#082, docs.editor#038, ui.shell#034.

## Class D: proposed gold corrections (operational set not changed)

| Id | Message | Problem | Proposed correction |
| --- | --- | --- | --- |
| art.draw#085 | draw a dragon | "draw a dragon": the world has no dragon kind, gold asks for objects[kind=dragon]; correct behaviour is a polite "I cannot draw that" and nothing drawn (system drew nothing; its reply is misleading, it read "draw" as "drag") | Expect objects.length=0 and a reply that says it cannot draw a dragon (drop the objects[kind=dragon] check). |
| games.chess#028 | take the pawn on d5 | "take the pawn on d5" after 1.e4: there is no pawn on d5 and the engine had not replied yet (we say "I am still thinking"). Gold history.length>1 is not reachable; the system's answer is acceptable. Fix: a setup that places a pawn on d5, or drop the case | Use a setup that puts a pawn on d5 (for example e4 then wait for the reply and play d5 by hand), or delete the case. |
| games.tictactoe#029 | new game | "new game" worked; gold board.4=null but empty cells are the empty string. Fix: board.4= (empty) or a different check | Replace board.4=null by an empty-string check (board.4=) as the board uses empty strings. |
| games.tictactoe#033 | row 5 column 5 | "row 5 column 5": the system correctly refuses with the board limits; gold board.0=null fails only because empty cells are the empty string. Fix: board.0= (empty) | Replace board.0=null by an empty-string check (board.0=). |
| games.hangman#025 | tell me a fact about it | "tell me a fact about it": gold wants the answer "lion" (the secret word); the system gave a hint ("it is a mammal"), which is the right behaviour. Fix: expect a hint text instead | Expect a hint text (no answer "lion"): revealing the word is wrong. |
| docs.reader#018 | Show the first result. | setup is "count the witch" (a count, no result list), so "Show the first result" has nothing to show. Fix: setup find "witch" | Change the setup to find "witch" so a result list exists. |

Also note: games.tictactoe#031 (class A) has the same null-versus-empty-string problem in its gold, so fix both the gold and the missing undo.

## Class F: ambiguous

- ui.avatar#060 "go back one": "go back one" is ambiguous (previous tab or undo the last change)
- ui.avatar#118 "i would rather talk to a human": "i would rather talk to a human": could mean a request for a human operator or for the person character; no clear intended action
- games.tictactoe#016 "i want to know lower right": "i want to know lower right" reads as a question; gold treats it as a move

## Class E

Empty. Every item has a plausible intended action in some world.

## Class C: wrong action (harmful first)

### C art.draw

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| art.draw#081 | draw 1.5 houses | wrong: Ta-da! I drew 2 yellow houses.  | state:objects.length=1 (got 2) | "draw 1.5 houses": drew 2 houses silently rounded; the gold itself says it must not be silently rounded |

### C data.charts

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| data.charts#036 | make it a pie chart then undo (after: make a chart: apples 5, pears 3, plums 8) | wrong: OK, it is a pie chart now. There is nothing to undo. This could also be read in another way (Chess); I used the "Drawing board (rough.js)" reading.  | state:charts.0.type=bar (got pie) | near miss: "make it a pie chart then undo" left the pie; undo answered "nothing to undo" |
| data.charts#039 | a chart of cats 2 and dogs 7 as a pie | wrong: OK, here is a bar chart with 1 item: cats 2. I did not understand "dogs 7 as a pie". Did you mean "Legs of a dog, a spider and a bee as a chart." or " | state:charts.0.type=pie (got bar); state:charts.0.labels.length=2 (got 1) | near miss: "a chart of cats 2 and dogs 7 as a pie" built a bar chart with only cats; the second item was dropped (but reported) |
| data.charts#052 | can you chart apples 5, pears 3 and plums 8 for me | wrong: OK, here is a bar chart with 2 items: apples 5 and pears 3. I skipped "plums 8 for me" because I found no number.  | state:charts.0.labels.length=3 (got 2) | near miss: "can you chart apples 5, pears 3 and plums 8 for me" lost plums because of the trailing "for me" (reported) |

### C docs.editor

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| docs.editor#034 | add a list and make it numbered | wrong: Done! I added a to your to-do list. I did not understand "make it numbered". Did you mean "Add a numbered list with wake up, eat and play."?  | state:blocks.0.kind=list (got undefined); state:blocks.0.style=numbered (got undefined) | harmful: "add a list and make it numbered" added "a" as a to-do item in kids.tasks |
| docs.editor#010 | put a heading called Notes at the top | wrong: OK, I added the heading "Notes at the top".  | state:blocks.0.text==Notes (got Notes at the top) | near miss: "put a heading called Notes at the top" made the heading text "Notes at the top" |
| docs.editor#016 | hey add a heading Plans pls | wrong: OK, I added the heading "Plans pls".  | state:blocks.0.text==Plans (got Plans pls) | near miss: "hey add a heading Plans pls" made the heading text "Plans pls" (politeness suffix) |
| docs.editor#028 | add a heading Shopping and a paragraph hello world | wrong: OK, I added the heading "Shopping and a paragraph hello world".  | state:blocks.0.text=Shopping (got Shopping and a paragraph hello world); state:blocks.1.text==hello world (got | near miss: "add a heading Shopping and a paragraph hello world" made one heading with the whole sentence |
| docs.editor#029 | add a heading A, a heading B and a heading C | wrong: OK, I added the heading "A, a heading B and a heading C".  | state:blocks.length=3 (got 1) | near miss: "add a heading A, a heading B and a heading C" made one heading with the whole text |
| docs.editor#041 | read para 1 (after: Add a heading Shopping / Add a paragraph hello world / Add a list: milk, eggs, bread) | wrong: OK, reading paragraph.  | answer:hello world | near miss: "read para 1" reads a paragraph but ignores the number (does not give "hello world") |

### C games.chess

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| games.chess#039 | i will open with the king pawn two squares (after: Let's play chess.) | wrong: OK, I will keep i will open with the in your reminders. I cannot ring a bell, but you can ask me: What are my reminders? Ta-da! I drew 2 blue squares. | state:history.0=e4 (got undefined) | harmful: "i will open with the king pawn two squares" added a reminder and drew 2 blue squares (two unrelated side effects), no chess move |

### C geo.map

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| geo.map#078 | mark Paris then undo | wrong: OK, I put a marker on Paris. There is nothing to undo.  | state:markers.length=0 (got 1) | near miss: "mark Paris then undo" kept the marker; undo answered "nothing to undo" (undo is not applied to the first segment of the same message) |

### C kids.arith

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| kids.arith#106 | Tom has 2 apples and Ana has 3. How many apples altogether? | wrong: OK, Tom has 2 apples. I did not understand "Ana has 3". Did you mean "Tom gets 3 from Ana." or "Ana gives Tom 3 apples."? There are 2 apples altogethe | answer:5 | harmful: states a confident wrong answer (2 instead of 5) because "Ana has 3" (unit elided) is dropped |

### C kids.time

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| kids.time#096 | name the month that follows March | wrong: Nice! From now on my name is the month that follows March.  | answer:April | harmful: "name the month that follows March" renamed the robot ("my name is the month that follows March") |

### C media.music

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| media.music#065 | make it faster then undo (after: Play Twinkle Twinkle.) | wrong: Playing again at 125 beats per minute (it was 100). Your melody is empty.  | state:tempo=100 (got 125) | near miss: "make it faster then undo" kept the faster tempo (undo not applied) |

### C ui.avatar

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| ui.avatar#107 | let us try a grill for the mouth | wrong: Nice! From now on my name is try a grill for the mouth.  | state:robot.mouth=grill (got smile) | harmful: "let us try a grill for the mouth" renamed the robot ("my name is try a grill for the mouth") |
| ui.avatar#056 | rename yourself to Bolt | wrong: Nice! From now on my name is to Bolt.  | state:name=Bolt (got to Bolt) | near miss: "rename yourself to Bolt" gives the name "to Bolt" |
| ui.avatar#057 | your name is Zed from now on | wrong: Nice! From now on my name is Zed from now on.  | state:name=Zed (got Zed from now on) | near miss: "your name is Zed from now on" gives the name "Zed from now on" |
| ui.avatar#122 | put your eyes back like they were (after: Give yourself visor eyes.) | wrong: There you go! I have square eyes now. I understood only part of that: I did not use "put" and "like they were".  | state:robot.eyes=round (got square) | near miss: "put your eyes back like they were" set square eyes instead of restoring the previous round eyes |

### C ui.shell

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| ui.shell#017 | open the documents tab | wrong: OK, here is the Editor tab.  | state:activeTab=documents (got editor) | near miss: "open the documents tab" opened the Editor tab (check which tab id "documents" is, gold activeTab=documents) |

## Class B items by world

### B art.draw

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| art.draw#002 | draw a red house and also how many days are in a week | partly: I did not understand where to put it ("and also"). You can say, for example, "in the top right corner", "next to the sun" or "under the tree". There a | state:objects[kind=house].color=red (got undefined) | compound across worlds: "and also" stays attached to the draw segment, so the house is not drawn (the answer half is right) |
| art.draw#003 | draw a red house and also what do red and yellow make | partly: I did not understand where to put it ("and also"). You can say, for example, "in the top right corner", "next to the sun" or "under the tree". Red and | state:objects[kind=house].color=red (got undefined) | same as art.draw#002 |
| art.draw#073 | draw a blue car, no, a red one | not_understood: I did not understand where to put it ("no a red one"). You can say, for example, "in the top right corner", "next to the sun" or "under the tree".  | state:objects[kind=car].color=red (got undefined); state:objects.length=1 (got 0) | self-correction "draw a blue car, no, a red one" |
| art.draw#094 | the house should be blue instead (after: Draw a red house.) | not_understood: There is no chart yet. Say, for example: "make a chart: apples 5, pears 3, plums 8".  | state:objects[kind=house].color=blue (got red) | "the house should be blue instead" hijacked by data.charts rename-point pattern (pat.data.charts.r2.ren.c) |

### B docs.editor

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| docs.editor#009 | add a title Trip plan | not_understood: I could not read "title" as a note. Use the letters A to G, with sharp or flat, for example "C D E F sharp G".  | state:blocks.0.kind=heading (got undefined); state:blocks.0.text==Trip plan (got undefined) | "add a title Trip plan" hijacked by media.music melody.add.bare ("I could not read title as a note") |
| docs.editor#038 | How many lists are there? (after: Add a heading Shopping / Add a paragraph hello world / Add a list: milk, eggs, bread) | wrong: You do not have any lists yet. You can say: Add milk to my shopping list.  | answer:1 list | "How many lists are there?" went to kids.tasks (answered "you do not have any lists"), a wrong answer; encoder-only failure (rules-only is right) |
| docs.editor#040 | how many headings do i have (after: Add a heading Shopping / Add a paragraph hello world / Add a list: milk, eggs, bread) | not_understood: There is no chart yet. Say, for example: "make a chart: apples 5, pears 3, plums 8".  | answer:1 | "how many headings do i have" hijacked by data.charts valueOf |

### B docs.reader

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| docs.reader#023 | words in the story, no, sections | wrong: "Hansel and Gretel" has 685 words. We are not playing twenty questions. Say "guess my animal" to start. I did not understand "sections". Did you mean  | answer:4 | self-correction "words in the story, no, sections" |

### B games.chess

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| games.chess#025 | knight to f3, no, knight to c3 (after: Let's play chess.) | wrong: You play knight to f3. We are not playing twenty questions. Say "guess my animal" to start. I am still thinking about my move. One moment, please.  | state:history.0=Nc3 (got Nf3) | harmful: self-correction "knight to f3, no, knight to c3" played Nf3 |
| games.chess#008 | move my e pawn two squares (after: Let's play chess.) | not_understood: Where should it go? You can say, for example, "move the tree to the left", "put the cat next to the house" or "move it to the top right corner".  | state:history.0=e4 (got undefined) | "move my e pawn two squares" hijacked by art.draw move ("Where should it go?") |

### B games.guess

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| games.guess#021 | yes, no wait, no (after: I am thinking of an animal) | wrong: Good. Question 2: Does it eat only plants? OK. Question 3: Can it swim? OK. Question 4: Does it live in the forest? (I read "wait" as "wat") (I read " | state:asked.0.answer=no (got yes) | self-correction "yes, no wait, no": answered three questions with "yes"; borderline garbled |

### B games.hangman

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| games.hangman#017 | e, no, z (after: Play hangman with the word lion.) | wrong: No, there is no E. 5 wrong guesses left. - - - - We are not playing twenty questions. Say "guess my animal" to start. No, there is no Z. 4 wrong guess | state:guessed.0=z (got e) | self-correction "e, no, z": both letters were guessed, the wrong guess E was consumed |

### B games.tictactoe

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| games.tictactoe#027 | top left, no, center (after: Start a new tic tac toe game.) | wrong: You took top middle. I took the center. Your move.  | state:board.4=X (got O) | harmful: self-correction "top left, no, center" placed X at top middle (spellcheck/segment mix) and the system took center |

### B geo.map

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| geo.map#090 | colour Spain in | not_understood: I do not know what "Spain" is. You can say the house, the tree, the sun, it, or everything.  | state:highlighted.0.name=Spain (got undefined) | "colour Spain in" hijacked by art.draw recolor |

### B kids.shop

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| kids.shop#040 | A pencil costs 2 lei. tell me what 3 pencils cost, no, 4 pencils | wrong: OK, one pencil costs 2 lei. 3 pencils cost 6 lei. We are not playing twenty questions. Say "guess my animal" to start. I did not understand "4 pencils | answer:8 | self-correction "tell me what 3 pencils cost, no, 4 pencils": split at ", no," and the stray "no" went to games.guess ("twenty questions") |

### B kids.tasks

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| kids.tasks#032 | remove it (after: add milk to my shopping list) | not_understood: I do not know what you mean by "it" yet. Draw something first, or say which thing you mean.  | answer:removed | "remove it" right after "add milk to my shopping list" went to art.draw ("Draw something first"); the last-used world should win |

### B ui.avatar

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| ui.avatar#006 | give me plus shaped eyes | not_understood: I do not know a song called "plus shaped eyes". I know Twinkle, Twinkle, Little Star, Happy Birthday to You, Ode to Joy, Frère Jacques and Mary Had a  | state:robot.eyes=plus (got round) | "give me plus shaped eyes" hijacked by media.music play-any ("I do not know a song called ...") |
| ui.avatar#018 | remove the thing on your chest | not_understood: I can not find a thing in your picture. Your picture is empty. Try "draw a red house".  | state:robot.chest=none (got buttons) | "remove the thing on your chest" hijacked by art.draw |
| ui.avatar#019 | add vents to your chest | not_understood: I could not read "vents" as a note. Use the letters A to G, with sharp or flat, for example "C D E F sharp G".  | state:robot.chest=vents (got buttons) | "add vents to your chest" hijacked by media.music melody.add.bare |
| ui.avatar#027 | Make my body colour blue please. (after: make your body green) | not_understood: I can not find a body in your picture. Your picture is empty. Try "draw a red house".  | state:robot.colors.body=74c0fc (got 69db7c) | "make my body colour blue please" hijacked by art.draw recolor ("I can not find a body in your picture") while the robot tab is active |
| ui.avatar#034 | your body should be a bit darker | not_understood: There is no chart yet. Say, for example: "make a chart: apples 5, pears 3, plums 8".  | state:robot.colors.body!=74c0fc (got 74c0fc) | "your body should be a bit darker" hijacked by data.charts rename-point pattern; avatar also has no "darker" operation |
| ui.avatar#082 | change your eyes to visor then change them back | wrong: Done! I have visor eyes now. There is no chart yet. Say, for example: "make a chart: apples 5, pears 3, plums 8".  | state:robot.eyes=round (got visor) | "change your eyes to visor then change them back": second segment went to data.charts; encoder-only failure (rules-only is right) |
| ui.avatar#113 | turn your whole body green | not_understood: I can not find a body in your picture. Your picture is empty. Try "draw a red house".  | state:robot.colors.body=69db7c (got 74c0fc) | "turn your whole body green" hijacked by art.draw recolor |
| ui.avatar#114 | i prefer you in yellow | not_understood: There is no chart yet. Say, for example: "make a chart: apples 5, pears 3, plums 8".  | state:robot.colors.body=ffd43b (got 74c0fc) | "i prefer you in yellow" hijacked by art.draw recolor.wish while the robot tab is active |

### B ui.shell

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| ui.shell#034 | open the map, no, the music | not_understood: There is no music to show yet. Try "play Twinkle Twinkle".  | state:activeTab=music (got robot) | self-correction "open the map, no, the music"; encoder-only failure (rules-only is right) |

## Class A items by world

### A art.draw

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| art.draw#008 | mak the hous green (after: Draw a red house.) | not_understood: OK, a hous is green. I understood only part of that: I did not use "mak".  | state:objects[kind=house].color=green (got red) | typo "mak" not repaired next to a valid "hous" (replied "a hous is green") |
| art.draw#013 | a purple boat please | wrong: I don't know what covers a purple. You can teach me: A purple has fur. (I read "boat" as "coat")  | state:objects[kind=boat].color=purple (got undefined); state:objects.length=1 (got 0) | bare "a purple boat please" and spellcheck turns "boat" into "coat" |
| art.draw#019 | a purple tree please | wrong: I don't know what color a tree is, so I can't say whether it is purple. I understood only part of that: I did not use "a".  | state:objects[kind=tree].color=purple (got undefined); state:objects.length=1 (got 0) | bare "a purple tree please" read as a colour question |
| art.draw#040 | Slide the house over to the right. (after: Draw a red house.) | not_understood: A thing can not be next to itself!  | state:objects[kind=house].x>500 (got 500) | move phrasing "slide the house over to the right" |
| art.draw#083 | put the house at 200, 300 (after: Draw a red house.) | not_understood: I did not understand where to move it ("at 200 300"). Try "to the left", "a bit higher", "next to the sun" or "to the top right corner".  | state:objects[kind=house].x=200 (got 500); state:objects[kind=house].y=300 (got 492) | absolute coordinates "put the house at 200, 300" |
| art.draw#092 | put a boat on the water | not_understood: I can not find "the water" in your picture.  | state:objects[kind=boat].kind=boat (got undefined) | "put a boat on the water": anchor "the water" is not an object in the picture; should still draw the boat |
| art.draw#097 | i want a clean page (after: Draw a tree.) | not_understood: I did not understand "i want a clean page". For example: "Draw a red house." or "Draw three trees."  | state:objects.length=0 (got 1) | "i want a clean page" (clear the picture) |
| art.draw#098 | make it look like night time | not_understood: There is no chart yet. Say, for example: "make a chart: apples 5, pears 3, plums 8". (I read "time" as "lime")  | state:mood=night (got null) | "make it look like night time" (mood=night): no pattern in any world; reply came from charts |

### A data.charts

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| data.charts#005 | mak it a pie chrt (after: make a chart: apples 5, pears 3, plums 8) | not_understood: I could not find numbers in "mak it a pie". Say it like this: "make a chart: apples 5, pears 3, plums 8". (I read "chrt" as "chart")  | state:charts.0.type=pie (got bar) | typo "mak" with "chrt" repaired |
| data.charts#053 | i would rather see it as a pie (after: make a chart: apples 5, pears 3, plums 8) | not_understood: I did not understand "i would rather see it as a pie". For example: "Make a chart: apples 5, pears 3, plums 8." or "Number of bars?"  | state:charts.0.type=pie (got bar) | wish phrasing "i would rather see it as a pie" |

### A docs.editor

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| docs.editor#004 | start the document with a title: My trip | not_understood: I did not understand "start the document with a title: My trip". Did you mean "Start a new document." or "Make the title Our Trip."?  | state:blocks.0.text==My trip (got undefined) | "start the document with a title: My trip" |
| docs.editor#006 | make that list numbered (after: Add a list: milk, eggs) | not_understood: I did not understand "make that list numbered". Did you mean "Add a numbered list with wake up, eat and play." or "Make the list a task list."?  | state:blocks.0.style=numbered (got bullet) | "make that list numbered" (reference to the last list) |
| docs.editor#007 | scratch the last thing i added (after: Add a heading Top / Add a paragraph body) | not_understood: I did not understand "scratch the last thing i added". Did you mean "Add a list with milk, eggs and bread." or "Can you add milk eggs and bread as a l | state:blocks.length=1 (got 2) | "scratch the last thing i added" (undo wording) |

### A games.hangman

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| games.hangman#002 | is ther an e (after: Play hangman with the word lion.) | not_understood: I did not understand "is ther an e". Did you mean "Is there an E?" or "Is e in there?"?  | state:guessed.0=e (got undefined) | typos "is ther an e" |
| games.hangman#026 | how many letters does the word have (after: Play hangman with the word lion.) | not_understood: I did not understand "how many letters does the word have". Did you mean "How many words does it have?" or "How many letters are hidden?"?  | answer:4 | "how many letters does the word have" |

### A games.tictactoe

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| games.tictactoe#005 | quick one: center (after: Start a new tic tac toe game.) | not_understood: I did not understand "quick one: center". For example: "Center." or "Top left."  | state:board.4=X (got ) | filler prefix "quick one: center" |
| games.tictactoe#031 | undo (after: Start a new tic tac toe game. / center) | not_understood: There is nothing to undo.  | state:board.4=null (got X) | "undo" after a move answers "nothing to undo" (no undo in the tictactoe rules, or routed elsewhere); gold also says null but empty cells are the empty string |

### A geo.map

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| geo.map#081 | show me 45.5 north 25 east | not_understood: I did not understand "show me 45.5 north 25 east". Did you mean "Go to coordinates 45.5 25.3." or "Show me the cast."?  | state:center.lat=45.5 (got 25); state:center.lon=25 (got 10) | "show me 45.5 north 25 east" (lat/lon with compass words; state ended on wrong coordinates) |

### A kids.animals

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| kids.animals#032 | hw many legs does a spidr have | not_understood: I did not understand "hw many legs does a spidr have". Did you mean "Does a spider have how many legs" or "How many legs does a spider have?"?  | answer:8 | typos "hw", "spidr" not repaired |
| kids.animals#074 | what sound does a dog make and does a cat | partly: A dog goes woof. I did not understand "does a cat". Did you mean "Cat where?" or "Find the cat."?  | answer:meow | elliptical coordination "what sound does a dog make and does a cat" (full pipeline: partial answer woof, second half lost) |
| kids.animals#076 | how many legs is it that a spider walks on | not_understood: I did not understand "how many legs is it that a spider walks on". Did you mean "How many legs on a spider" or "Spiders how many legs pls"?  | answer:8 | contrived phrasing "how many legs is it that a spider walks on" |
| kids.animals#078 | do dolphins breathe air or are they fish | not_understood: I did not understand "do dolphins breathe air or are they fish". Did you mean "Dolphins what are they like?"?  | answer:mammal | alternative question "do dolphins breathe air or are they fish" |

### A kids.arith

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| kids.arith#026 | take 3 away from 7 | not_understood: There is no chart yet. Say, for example: "make a chart: apples 5, pears 3, plums 8".  | answer:4 | subtract phrasing "take N away from M" |
| kids.arith#052 | what is 12 squared | not_understood: There is no chart yet. Say, for example: "make a chart: apples 5, pears 3, plums 8". I understood only part of that: I did not use "squared".  | answer:144 | "squared" operator |
| kids.arith#053 | what is 7 plus 5 minus 2 | not_understood: I did not understand "what is 7 plus 5 minus 2". Did you mean "What is 7 plus 5?" or "Whats 7 plus 5 for me?"?  | answer:10 | chained operations "7 plus 5 minus 2" |
| kids.arith#071 | Ben has 8 apples. Ben gives away 6. How many apples does Ben have left? | wrong: OK, Ben has 8 apples. I do not know what "gives away 6" is. You can say the car, the tree, the sky, the grass, or everything. Ben has 8 apples. (I rea | answer:2 | word problem verb "X gives away N" (also spellcheck turns the name "Ben" into "bin") |
| kids.arith#105 | whats left for Mia (after: Mia has five marbles. / She lost two marbles.) | not_understood: I did not understand "whats left for Mia". Did you mean "What is left to do?" or "What's left to buy?"?  | answer:3 | question "what's left for <name>" after a word problem with the unit omitted |
| kids.arith#138 | wat is 7 pluss 5 | not_understood: I did not understand "wat is 7 pluss 5". Did you mean "What is 7 plus 5?" or "Can u do 7 plus 5?"?  | answer:12 | typos "wat"/"pluss" not repaired |

### A kids.common

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| kids.common#029 | how are you | not_understood: I did not understand "how are you". For example: "Give yourself visor eyes." or "Body color?"  | status:supported | small talk "how are you" (gold: any friendly reply) |

### A kids.shapes

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| kids.shapes#054 | what shape is a ball | not_understood: I don't know which shape a ball looks like. You can teach me: A ball is a circle.  | answer:sphere | knowledge gap, not phrasing: kids.shapes does not know that a ball is a sphere (it asks to be taught "a ball is a circle") |

### A kids.shop

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| kids.shop#018 | I have 12 lei. A pencil costs 2 lei. How much money do I have left after I buy 2 pencils? | not_understood: OK, you have 12 lei. OK, one pencil costs 2 lei. I did not understand "How much money do I have left after I buy 2 pencils". Did you mean "How much mo | answer:8 | question with a buy clause inside: "how much money do I have left after I buy N <item>" (six items, one family) |
| kids.shop#019 | I have 17 lei. A kite costs 4 lei. How much money do I have left after I buy 2 kites? | not_understood: OK, you have 17 lei. OK, one kite costs 4 lei. I did not understand "How much money do I have left after I buy 2 kites". Did you mean "How much money  | answer:9 | same family |
| kids.shop#020 | I have 36 lei. A puzzle costs 11 lei. How much money do I have left after I buy 1 puzzle? | not_understood: OK, you have 36 lei. OK, one puzzle costs 11 lei. I did not understand "How much money do I have left after I buy 1 puzzle". Did you mean "How much mo | answer:25 | same family |
| kids.shop#021 | I have 23 lei. A sandwich costs 6 lei. How much money do I have left after I buy 2 sandwiches? | not_understood: OK, you have 23 lei. OK, one sandwich costs 6 lei. I did not understand "How much money do I have left after I buy 2 sandwiches". Did you mean "How mu | answer:11 | same family |
| kids.shop#022 | I have 21 lei. A ball costs 5 lei. How much money do I have left after I buy 3 balls? | not_understood: OK, you have 21 lei. OK, one ball costs 5 lei. I did not understand "How much money do I have left after I buy 3 balls". Did you mean "How much money  | answer:6 | same family |
| kids.shop#024 | I have 14 lei. A kite costs 4 lei. How much money do I have left after I buy 3 kites? | not_understood: OK, you have 14 lei. OK, one kite costs 4 lei. I did not understand "How much money do I have left after I buy 3 kites". Did you mean "How much money  | answer:2 | same family |

### A kids.time

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| kids.time#041 | quick one: what day is 3 days after Friday | not_understood: I did not understand "quick one: what day is 3 days after Friday". Did you mean "What day is 3 days after Friday?" or "What day will it be in 3 days?" | answer:Monday | filler prefix "quick one:" |
| kids.time#042 | quick one: what day is 5 days before Thursday | not_understood: I did not understand "quick one: what day is 5 days before Thursday". Did you mean "Day 5 days before weds." or "What day is 2 days before Monday?"?  | answer:Saturday | filler prefix "quick one:" |
| kids.time#066 | quick one: what month is 5 months after July | not_understood: I did not understand "quick one: what month is 5 months after July". Did you mean "What month is 3 months after May?" or "What are the options for you | answer:December | filler prefix "quick one:" |
| kids.time#073 | quick one: how many days are in June | not_understood: I did not understand "quick one: how many days are in June". Did you mean "How many days june has?" or "How many days in june right?"?  | answer:30 | filler prefix "quick one:" |
| kids.time#090 | and the day after that (after: Today is Tuesday. / what day is it tomorrow) | not_understood: I did not understand "the day after that". Did you mean "after Monday day?" or "The day after Monday?"?  | answer:Thursday | elliptical follow-up "and the day after that" (needs the previous answer as the anchor) |
| kids.time#094 | what is the day after tomorrow if today is Monday | not_understood: I did not understand "what is the day after tomorrow if today is Monday". Did you mean "If today is Friday, what day is tomorrow?" or "What day is it  | answer:Wednesday | "what is the day after tomorrow if today is Monday" (conditional clause) |

### A media.music

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| media.music#009 | chang the instrument to flut | not_understood: I could not find "the instrument" in the document. (I read "chang" as "change" and "flut" as "flat")  | state:instrument=flute (got piano) | typo "flut" repaired to "flat" instead of "flute" (domain words are not protected) |
| media.music#035 | What is middle C? | not_understood: I did not understand "What is middle C". Did you mean "What hertz is middle C?" or "What is the frequency of middle C?"?  | answer:261.6 | "what is middle C" (the world answers "what hertz is middle C") |
| media.music#060 | play A4 for 2 beats | not_understood: I do not know a song called "4 for 2 beats". I know Twinkle, Twinkle, Little Star, Happy Birthday to You, Ode to Joy, Frère Jacques and Mary Had a Lit | state:playing=true (got false) | "play A4 for 2 beats" (note with octave and duration) |

### A ui.avatar

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| ui.avatar#011 | put a dish on your head | not_understood: I do not know head like "dish". Ask me what head I can have.  | state:robot.top=dish (got antenna) | "put a dish on your head": avatar rules do not read "put X on your head" with the part value "dish" |
| ui.avatar#025 | go back to round eyes (after: Give yourself visor eyes.) | not_understood: I did not understand "go back to round eyes". Did you mean "Go back to normal." or "Make your eyes round."?  | state:robot.eyes=round (got visor) | "go back to round eyes" |
| ui.avatar#067 | what mouths are there | not_understood: A robot has no mouth color.  | answer:grill; answer:speaker; answer:zigzag | options query "what mouths are there" answered as a mouth colour question |
| ui.avatar#086 | make it cyclops (after: Give yourself visor eyes.) | not_understood: I did not understand "make it cyclops". For example: "Give yourself visor eyes." or "Body color?"  | state:robot.eyes=cyclops (got visor) | elliptical "make it cyclops" (it = the eyes) |
| ui.avatar#087 | and make them square (after: Give yourself visor eyes.) | not_understood: I did not understand "make them square". Did you mean "Which square did you take last?"?  | state:robot.eyes=square (got visor) | elliptical "and make them square" |
| ui.avatar#103 | can you give yourself a pair of visor eyes | not_understood: I did not understand "can you give yourself a pair of visor eyes". Did you mean "Give yourself visor eyes." or "Give yourself bigger eyes."?  | state:robot.eyes=visor (got round) | "can you give yourself a pair of visor eyes" |
| ui.avatar#104 | i think you would look better with square eyes | not_understood: I did not understand "i think you would look better with square eyes". Did you mean "What do your eyes look like?"?  | state:robot.eyes=square (got round) | wish phrasing "i think you would look better with square eyes" |
| ui.avatar#105 | swap your eyes for cyclops ones | not_understood: I do not know eyes like "for cyclops ones". My eyes can be round, square, visor, cyclops, happy, sleepy or plus.  | state:robot.eyes=cyclops (got round) | "swap your eyes for cyclops ones" |
| ui.avatar#108 | your mouth could be a zigzag | not_understood: I did not understand "your mouth could be a zigzag". For example: "Give yourself visor eyes." or "Body color?"  | state:robot.mouth=zigzag (got smile) | "your mouth could be a zigzag" |
| ui.avatar#109 | i would like you to wear a dish on top of your head | not_understood: I did not understand "i would like you to wear a dish on top of your head". Did you mean "Would like a dish on the top" or "Dish on top please."?  | state:robot.top=dish (got antenna) | long wish "i would like you to wear a dish on top of your head" |

## Class F and D details

### D art.draw

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| art.draw#085 | draw a dragon | not_understood: Where should it go? You can say, for example, "move the tree to the left", "put the cat next to the house" or "move it to the top right corner". (I re | state:objects[kind=dragon].kind=dragon (got undefined) | "draw a dragon": the world has no dragon kind, gold asks for objects[kind=dragon]; correct behaviour is a polite "I cannot draw that" and nothing drawn (system drew nothing; its reply is misleading, it read "draw" as "drag") |

### D docs.reader

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| docs.reader#018 | Show the first result. (after: count the witch) | not_understood: There is no search yet. Say, for example: find "witch".  | answer:Result 1 | setup is "count the witch" (a count, no result list), so "Show the first result" has nothing to show. Fix: setup find "witch" |

### D games.chess

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| games.chess#028 | take the pawn on d5 (after: Let's play chess. / e2 to e4) | wrong: I am still thinking about my move. One moment, please.  | state:history.length>1 (got 1) | "take the pawn on d5" after 1.e4: there is no pawn on d5 and the engine had not replied yet (we say "I am still thinking"). Gold history.length>1 is not reachable; the system's answer is acceptable. Fix: a setup that places a pawn on d5, or drop the case |

### D games.hangman

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| games.hangman#025 | tell me a fact about it (after: Play hangman with the word lion.) | wrong: Here is a hint: It is a mammal.  | answer:lion | "tell me a fact about it": gold wants the answer "lion" (the secret word); the system gave a hint ("it is a mammal"), which is the right behaviour. Fix: expect a hint text instead |

### D games.tictactoe

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| games.tictactoe#029 | new game (after: Start a new tic tac toe game. / center) | wrong: New game of tic-tac-toe. You are X and you go first. I play at the easy level. Say a place like "center" or "top left", or a coordinate like B2 (lette | state:board.4=null (got ) | "new game" worked; gold board.4=null but empty cells are the empty string. Fix: board.4= (empty) or a different check |
| games.tictactoe#033 | row 5 column 5 (after: Start a new tic tac toe game.) | not_understood: The board has columns A to C and rows 1 to 3, for example B2.  | state:board.0=null (got ) | "row 5 column 5": the system correctly refuses with the board limits; gold board.0=null fails only because empty cells are the empty string. Fix: board.0= (empty) |

### F games.tictactoe

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| games.tictactoe#016 | i want to know lower right (after: Start a new tic tac toe game.) | not_understood: There is no chart yet. Say, for example: "make a chart: apples 5, pears 3, plums 8". I understood only part of that: I did not use "right".  | state:board.8=X (got ) | "i want to know lower right" reads as a question; gold treats it as a move |

### F ui.avatar

| Id | Message | What happened | Expected | Note |
| --- | --- | --- | --- | --- |
| ui.avatar#060 | go back one (after: your mouth should be a grill) | not_understood: There is no previous tab to go back to.  | state:robot.mouth=smile (got grill) | "go back one" is ambiguous (previous tab or undo the last change) |
| ui.avatar#118 | i would rather talk to a human | not_understood: I did not understand "i would rather talk to a human". For example: "Give yourself visor eyes." or "Body color?"  | state:character=person (got robot) | "i would rather talk to a human": could mean a request for a human operator or for the person character; no clear intended action |


## Addendum after rebase

Upstream commit 8866230 made the operational checker treat an empty cell as equal to null. That removes the null-versus-empty-string problem described for games.tictactoe#029, #033 (class D) and #031 (gold part); those corrections are no longer needed and the items may now pass. The analysis above is of the run before that change.
