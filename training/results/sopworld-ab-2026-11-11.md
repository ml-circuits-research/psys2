# ops against matrix: every difference (2026-11-11)

6806 sessions, 19 differ in a reply, a status or an outcome. Written by `scripts/ab-sopworld.mjs`, formatted by `scripts/ab-sopworld-report.mjs`. Random output (a random song or look) is marked and counted as neutral.

## Per set

| set | sessions | turns | differing | state view only |
| --- | --- | --- | --- | --- |
| operational | 1296 | 1783 | 1 | 103 |
| operational-long | 154 | 163 | 0 | 7 |
| operational-ro | 2480 | 3310 | 2 | 185 |
| dialogues | 470 | 2241 | 5 | 40 |
| loose-words | 670 | 801 | 0 | 14 |
| typos | 1394 | 1394 | 0 | 27 |
| real-09c | 2 | 68 | 1 | 1 |
| real-09d | 1 | 10 | 0 | 0 |
| real-09e | 3 | 67 | 0 | 1 |
| mobile | 1 | 108 | 0 | 0 |
| real-dialogue | 2 | 63 | 1 | 1 |
| gold | 300 | 468 | 2 | 17 |
| coherence | 33 | 99 | 7 | 16 |

"State view only": the replies and statuses are identical; `session.state()` differs because a matrix world mirrors the library facts into it (kids.shop.money, kids.arith.holdings, tic-tac-toe history) and ops keeps them in wires.

## By class

| class | count | sets |
| --- | --- | --- |
| neutral wording | 11 | operational 1, operational-ro 2, dialogues 4, real-09c 1, real-dialogue 1, gold 2 |
| ops better | 2 | dialogues 1, coherence 1 |
| matrix better | 6 | coherence 6 |

## matrix better (6)

### coherence:coh.shop.04 (kids.shop, tab robot)

Outcome: ops "failed", matrix "passed"

> I have 20 lei.
  - ops: OK, you have 20 lei.
  - matrix: OK, you have 20 lei.
> I buy a kite.
  - ops: OK, you bought 1 kite.
  - matrix: OK, you bought 1 kite.
**>** Undo that.
  - ops: There is nothing to undo.
  - matrix: OK, I took that back: "I buy a kite". (status ops missing, matrix supported)
  - state: ui.avatar.portrait: ops {"colors":{"hair":"2c1b18","skin":"edb98a"},"beard":"none","earrings": / matrix absent; ui.avatar.cartoon: ops {"colors":{"base":"f9c9b6","earring":"f9c9b6","eyeShadow":"d2eff3","gl / matrix absent; ui.avatar.kid: ops {"colors":{"hair":"220f00","skin":"ffe4c0"},"accessories":"none","eyes / matrix absent; ui.avatar.pixel: ops {"colors":{"accessories":"daa520","clothing":"5bc
**>** How much money do I have?
  - ops: You have 10 lei left.
  - matrix: You have 20 lei now.
  - state: ui.avatar.portrait: ops {"colors":{"hair":"2c1b18","skin":"edb98a"},"beard":"none","earrings": / matrix absent; ui.avatar.cartoon: ops {"colors":{"base":"f9c9b6","earring":"f9c9b6","eyeShadow":"d2eff3","gl / matrix absent; ui.avatar.kid: ops {"colors":{"hair":"220f00","skin":"ffe4c0"},"accessories":"none","eyes / matrix absent; ui.avatar.pixel: ops {"colors":{"accessories":"daa520","clothing":"5bc

### coherence:coh.shop.06 (kids.shop, tab robot)

Outcome: ops "failed", matrix "passed"

**>** I got 5 lei back for a book. What did I pay?
  - ops: OK, you got 5 lei. I do not know your name yet. Tell me: "my name is ...". (I read "pay" as "say")
  - matrix: OK, you got 5 lei back for a book. You paid 17 lei. (status ops supported, matrix supported,supported)

### coherence:coh.arith.04 (kids.arith, tab robot)

Outcome: ops "failed", matrix "passed"

> Tom has 5 apples.
  - ops: OK, Tom has 5 apples.
  - matrix: OK, Tom has 5 apples.
> Tom eats 2 apples.
  - ops: OK, Tom ate 2 apples.
  - matrix: OK, Tom ate 2 apples.
**>** Undo that.
  - ops: There is nothing to undo.
  - matrix: OK, I took that back: "Tom eats 2 apples". (status ops missing, matrix supported)
  - state: ui.avatar.portrait: ops {"colors":{"hair":"2c1b18","skin":"edb98a"},"beard":"none","earrings": / matrix absent; ui.avatar.cartoon: ops {"colors":{"base":"f9c9b6","earring":"f9c9b6","eyeShadow":"d2eff3","gl / matrix absent; ui.avatar.kid: ops {"colors":{"hair":"220f00","skin":"ffe4c0"},"accessories":"none","eyes / matrix absent; ui.avatar.pixel: ops {"colors":{"accessories":"daa520","clothing":"5bc
**>** How many apples does Tom have?
  - ops: Tom has 3 apples.
  - matrix: Tom has 5 apples.
  - state: ui.avatar.portrait: ops {"colors":{"hair":"2c1b18","skin":"edb98a"},"beard":"none","earrings": / matrix absent; ui.avatar.cartoon: ops {"colors":{"base":"f9c9b6","earring":"f9c9b6","eyeShadow":"d2eff3","gl / matrix absent; ui.avatar.kid: ops {"colors":{"hair":"220f00","skin":"ffe4c0"},"accessories":"none","eyes / matrix absent; ui.avatar.pixel: ops {"colors":{"accessories":"daa520","clothing":"5bc

### coherence:coh.tasks.03 (kids.tasks, tab robot)

Outcome: ops "failed", matrix "passed"

> Add milk to my shopping list.
  - ops: Done! I added milk to your shopping list.
  - matrix: Done! I added milk to your shopping list.
> Add bread to my shopping list.
  - ops: Done! I added bread to your shopping list.
  - matrix: Done! I added bread to your shopping list.
**>** Undo that.
  - ops: There is nothing to undo.
  - matrix: OK, I took that back: "Add bread to my shopping list". (status ops missing, matrix supported)
  - state: ui.avatar.portrait: ops {"colors":{"hair":"2c1b18","skin":"edb98a"},"beard":"none","earrings": / matrix absent; ui.avatar.cartoon: ops {"colors":{"base":"f9c9b6","earring":"f9c9b6","eyeShadow":"d2eff3","gl / matrix absent; ui.avatar.kid: ops {"colors":{"hair":"220f00","skin":"ffe4c0"},"accessories":"none","eyes / matrix absent; ui.avatar.pixel: ops {"colors":{"accessories":"daa520","clothing":"5bc
**>** What is on my shopping list?
  - ops: On your shopping list: milk and bread.
  - matrix: On your shopping list: milk.
  - state: ui.avatar.portrait: ops {"colors":{"hair":"2c1b18","skin":"edb98a"},"beard":"none","earrings": / matrix absent; ui.avatar.cartoon: ops {"colors":{"base":"f9c9b6","earring":"f9c9b6","eyeShadow":"d2eff3","gl / matrix absent; ui.avatar.kid: ops {"colors":{"hair":"220f00","skin":"ffe4c0"},"accessories":"none","eyes / matrix absent; ui.avatar.pixel: ops {"colors":{"accessories":"daa520","clothing":"5bc

### coherence:coh.shop.11 (kids.shop, tab robot)

Outcome: ops "failed", matrix "passed"

> I have 20 lei.
  - ops: OK, you have 20 lei.
  - matrix: OK, you have 20 lei.
**>** I buy the ball.
  - ops: I took that as: "i buy a ball" OK, you bought 1 ball.
  - matrix: OK.
  - state: kids.shop: ops absent / matrix {"money":15,"purchases":[{"id":"w2","item":"ball","count":1}]}
**>** How much money do I have?
  - ops: You have 15 lei left.
  - matrix: You have 15 lei left. I assumed 1 ball.
  - state: kids.shop: ops absent / matrix {"money":15,"purchases":[{"id":"w2","item":"ball","count":1}]}

### coherence:coh.shop.13 (kids.shop, tab robot)

Outcome: ops "failed", matrix "passed"

> I have 20 lei.
  - ops: OK, you have 20 lei.
  - matrix: OK, you have 20 lei.
**>** I buy the ball.
  - ops: I took that as: "i buy a ball" OK, you bought 1 ball.
  - matrix: OK.
  - state: kids.shop: ops absent / matrix {"money":15,"purchases":[{"id":"w2","item":"ball","count":1}]}
**>** How much money do I have?
  - ops: You have 15 lei left.
  - matrix: You have 15 lei left. I assumed 1 ball.
  - state: kids.shop: ops absent / matrix {"money":15,"purchases":[{"id":"w2","item":"ball","count":1}]}
> How much money do I have?
  - ops: You have 15 lei left.
  - matrix: You have 15 lei left.

## ops better (2)

### dialogues:dlg.kidsB#016 (kids.shop)

Note: 'what did you do?' in ops also says what the answer rested on (A puzzle costs 11 lei); matrix says only what was answered

Outcome: ops ["right","right","right","right"], matrix ["right","right","right","right"]

> A puzzle costs 11 lei.
  - ops: OK, one puzzle costs 11 lei.
  - matrix: OK, one puzzle costs 11 lei.
> how much do 2 puzzles cost?
  - ops: 2 puzzles cost 22 lei.
  - matrix: 2 puzzles cost 22 lei.
**>** what did you do?
  - ops: You said "how much do 2 puzzles cost", so I answered it. What I answered: 2 puzzles cost 22 lei. I worked that out from what you told me: "A puzzle costs 11 lei".
  - matrix: You said "how much do 2 puzzles cost", so I answered it. What I answered: 2 puzzles cost 22 lei.
> how much do 5 puzzles cost?
  - ops: 5 puzzles cost 55 lei.
  - matrix: 5 puzzles cost 55 lei.

### coherence:coh.shop.12 (kids.shop, tab robot)

Note: both pass; ops answers 'I buy the ball' with 'you bought 1 ball', matrix with a bare 'OK.' (it says 'I assumed 1 ball.' only at the next answer, which this case does not reach)

Outcome: ops "passed", matrix "passed"

> I have 20 lei.
  - ops: OK, you have 20 lei.
  - matrix: OK, you have 20 lei.
**>** I buy the ball.
  - ops: I took that as: "i buy a ball" OK, you bought 1 ball.
  - matrix: OK.
  - state: kids.shop: ops absent / matrix {"money":15,"purchases":[{"id":"w2","item":"ball","count":1}]}
> Three of them.
  - ops: OK, that makes 3 balls.
  - matrix: OK, that makes 3 balls.
> How much money do I have?
  - ops: You have 5 lei left.
  - matrix: You have 5 lei left.

## neutral wording (11)

### operational:kids.common#029 (kids.common)

Note: kids.common is not a matrix world; 'how are you' has several phrasings and the two engines picked different ones

Outcome: ops "right", matrix "right"

**>** how are you
  - ops: I am fine, thank you!
  - matrix: I am great! What shall we do?

### operational-ro:kids.common#029.ro (kids.common)

Note: same as the English case: another phrasing of the same greeting

Outcome: ops "right", matrix "right"

**>** Ce mai faci?
  - ops: I am great! What shall we do?
  - matrix: Sunt bine, mulțumesc că ai întrebat!

### operational-ro:kids.common#029.roc (kids.common)

Note: same as the English case: another phrasing of the same greeting

Outcome: ops "right", matrix "right"

**>** ce mai faci
  - ops: Sunt bine, mulțumesc!
  - matrix: Sunt bine, mulțumesc că ai întrebat!

### dialogues:dlg.kidsA#010 (kids.arith)

Note: identical replies; the label differs only because matrix mirrors the library's fact (Zoe 6 marbles) into the state view while the reply says it did not understand the question

Outcome: ops ["right","not_understood","right","right","right"], matrix ["right","wrong","right","right","right"]

> Zoe has 14 marbles.
  - ops: OK, Zoe has 14 marbles.
  - matrix: OK, Zoe has 14 marbles.
**>** Zoe eats 8. How many marbles are left?
  - ops: OK, Zoe ate 8 marbles. I did not understand "How many marbles are left". Did you mean "How many pieces are left?" or "How many guesses are left?"?
  - matrix: OK, Zoe ate 8 marbles. I did not understand "How many marbles are left". Did you mean "How many pieces are left?" or "How many guesses are left?"?
  - state: kids.arith: ops absent / matrix {"holdings":{"e.zoe":{"marble":6}}}
> Zoe finds 5 more. How many marbles does she have now?
  - ops: OK, Zoe got 5 marbles. Zoe has 11 marbles.
  - matrix: OK, Zoe got 5 marbles. Zoe has 11 marbles.
> Leo has 4 marbles.
  - ops: OK, Leo has 4 marbles.
  - matrix: OK, Leo has 4 marbles.
> how many marbles do they have together?
  - ops: There are 15 marbles altogether.
  - matrix: There are 15 marbles altogether.

### dialogues:dlg.doc#031 (media.music, tab music)

Note: random output (differs between two runs of ops)

Outcome: ops ["right","right","right","right","right","right","right"], matrix ["right","right","right","right","right","right","right"]

**>** Play.
  - ops: Playing "Ode to Joy" on the piano at 108 beats per minute. It is in C major.
  - matrix: Playing "Old MacDonald Had a Farm" on the piano at 110 beats per minute. It is in C major.
  - state: media.music.tempo: ops 108 / matrix 110; media.music.current.title: ops "Ode to Joy" / matrix "Old MacDonald Had a Farm"; media.music.current.abc: ops "X:1\nT:Ode to Joy\nC:Ludwig van Beethoven\nM:4/4\nL:1/4\nQ:1/4=108\nK / matrix "X:1\nT:Old MacDonald Had a Farm\nC:Traditional folk song\nM:4/4\nL:1/; media.music.current.notes: ops ["G3","C4","D4","E4","F4","G4"] / matrix ["C4","D4","E4","G4","A4"
> Play middle C
  - ops: Playing middle C (C4), 261.6 Hz, on the piano.
  - matrix: Playing middle C (C4), 261.6 Hz, on the piano.
**>** Set the tempo to 90.
  - ops: Playing again at 90 beats per minute (it was 108).
  - matrix: Playing again at 90 beats per minute (it was 110).
  - state: media.music.settingHistory: ops [{"tempo":108,"tempoLocked":false,"volume":70,"instrument":"piano"}] / matrix [{"tempo":110,"tempoLocked":false,"volume":70,"instrument":"piano"}]
> Make it a bit louder.
  - ops: OK, the volume is 75 percent.
  - matrix: OK, the volume is 75 percent.
> Make it much quieter.
  - ops: OK, the volume is 50 percent.
  - matrix: OK, the volume is 50 percent.
> Let's draw a house.
  - ops: Ta-da! I drew a yellow house.
  - matrix: Ta-da! I drew a yellow house.
> Back to the music.
  - ops: Back to Music. Now playing middle C in C major on the piano, at 90 beats per minute.
  - matrix: Back to Music. Now playing middle C in C major on the piano, at 90 beats per minute.

### dialogues:dlg.rd#001 (ui.avatar, tab robot)

Note: random output (differs between two runs of ops)

Outcome: ops ["right","right","right","right","right","right","right","right","right","right","right","right","right","right","not_understood","not_understood","not_understood","right","not_understood","not_understood","right","right","right","right","right","right","right","not_understood","right","right","right","right","right","right","right","right","right","right","right","right","partly","partly","right","right","right","right","right","right","right"], matrix ["right","right","right","right","right","right","right","right","right","right","right","right","right","right","not_understood","not_understood","not_understood","right","not_understood","not_understood","right","right","right","right","right","right","right","not_understood","right","right","right","right","right","right","right","right","right","right","right","right","partly","partly","right","right","right","right","right","right","right"]

> i want a human as avatar
  - ops: Okay! Now I am a person. I have a smile expression and short side-parted hair.
  - matrix: Okay! Now I am a person. I have a smile expression and short side-parted hair.
> make a human
  - ops: I am a person already.
  - matrix: I am a person already.
> what command do tou recognise
  - ops: I can chat, talk about shapes and colors, shopping, animals and time, draw pictures, charts and diagrams, do sums, keep your lists, edit documents, answer questions about your documents, play chess, guess the animal, hangman, tic-tac-toe and music, show places on a map, change my face, and get to know you and keep your profile. Ask me "what can I say here?" for examples.
  - matrix: I can chat, talk about shapes and colors, shopping, animals and time, draw pictures, charts and diagrams, do sums, keep your lists, edit documents, answer questions about your documents, play chess, guess the animal, hangman, tic-tac-toe and music, show places on a map, change my face, and get to know you and keep your profile. Ask me "what can I say here?" for examples.
> show me bucharest
  - ops: Here is Bucharest: capital of Romania · 1.9 million people.
  - matrix: Here is Bucharest: capital of Romania · 1.9 million people.
> transform my avatar in a human
  - ops: I am a person already.
  - matrix: I am a person already.
> make bigger yes and a red had
  - ops: Okay! A person's eyes follow the expression, so I made it wide-eyed. Ta-da! I have a ginger beanie now. I do not have red for that; ginger is the closest.
  - matrix: Okay! A person's eyes follow the expression, so I made it wide-eyed. Ta-da! I have a ginger beanie now. I do not have red for that; ginger is the closest.
> use the cyclops eye
  - ops: A person has no cyclops eyes, but the robot does. Say "yes" to become the robot and do that.
  - matrix: A person has no cyclops eyes, but the robot does. Say "yes" to become the robot and do that.
> why you turned it in a robot, this ia wrong
  - ops: I am a person now, not a robot.
  - matrix: I am a person now, not a robot.
> turn it in a human again
  - ops: I am a person already.
  - matrix: I am a person already.
> make blue eyes
  - ops: A person has no eye color, but the robot does: its eyes glow in any color. Say "yes" to become the robot and do that.
  - matrix: A person has no eye color, but the robot does: its eyes glow in any color. Say "yes" to become the robot and do that.
> help
  - ops: The Avatar tab lets you change my face. You can say, for example: "Try the next mouth", "What character is on screen" or "Make your body lighter". Ask "what can you do?" for the whole list, "more examples" for others, or "how do I ...?" to find a command.
  - matrix: The Avatar tab lets you change my face. You can say, for example: "Try the next mouth", "What character is on screen" or "Make your body lighter". Ask "what can you do?" for the whole list, "more examples" for others, or "how do I ...?" to find a command.
> what can i say here
  - ops: On the Avatar tab you can say, for example: "What name do you go by", "What colors can your screen be", "What seed is this look from", "What colors can you change" or "Is your face happy". Say "more examples" for others.
  - matrix: On the Avatar tab you can say, for example: "What name do you go by", "What colors can your screen be", "What seed is this look from", "What colors can you change" or "Is your face happy". Say "more examples" for others.
> look suprised
  - ops: Sure! Now I look surprised. (I read "suprised" as "surprised")
  - matrix: Sure! Now I look surprised. (I read "suprised" as "surprised")
**>** give tourself a random look
  - ops: Done! Surprise! My new look has the seed hvdzf5. (I read "tourself" as "yourself")
  - matrix: Ta-da! Surprise! My new look has the seed mk50wn. (I read "tourself" as "yourself")
  - state: ui.avatar.seed: ops "hvdzf5" / matrix "mk50wn"; ui.avatar.person.head: ops "mediumBangs" / matrix "turban"; ui.avatar.person.expression: ops "smileLOL" / matrix "monster"; ui.avatar.person.accessories: ops "none" / matrix "glasses"; ui.avatar.person.facialHair: ops "moustache6" / matrix "none"; ui.avatar.person.colors.skin: ops "d08b5b" / matrix "ffdbb4"; ui.avatar.person.colors.headContrast: ops 
> fa-mi avatarul ca om
  - ops: I did not understand "fa-mi avatarul ca om". For example: "Try the next mouth." or "What character is on screen?"
  - matrix: I did not understand "fa-mi avatarul ca om". For example: "Try the next mouth." or "What character is on screen?"
> fa avatarul ca om
  - ops: I did not understand "fa avatarul ca om". For example: "Try the next mouth." or "What character is on screen?"
  - matrix: I did not understand "fa avatarul ca om". For example: "Try the next mouth." or "What character is on screen?"
> fa-i ochii mari
  - ops: I did not understand "fa-i ochii mari". For example: "Try the next mouth." or "What character is on screen?"
  - matrix: I did not understand "fa-i ochii mari". For example: "Try the next mouth." or "What character is on screen?"
> eys express fear
  - ops: Ta-da! Now I look scared. (I read "eys" as "eyes")
  - matrix: Ta-da! Now I look scared. (I read "eys" as "eyes")
> fa ochii mari
  - ops: I did not understand "fa ochii mari". For example: "Try the next mouth." or "What character is on screen?"
  - matrix: I did not understand "fa ochii mari". For example: "Try the next mouth." or "What character is on screen?"
> fa ochi visatori
  - ops: I did not understand "fa ochi visatori". For example: "Try the next mouth." or "What character is on screen?"
  - matrix: I did not understand "fa ochi visatori". For example: "Try the next mouth." or "What character is on screen?"
> make bigger eyes
  - ops: Okay! A person's eyes follow the expression, so I made it wide-eyed.
  - matrix: Okay! A person's eyes follow the expression, so I made it wide-eyed.
> make eyes sleepy
  - ops: There you go! A person's eyes follow the expression, so I made it sleepy-eyed.
  - matrix: There you go! A person's eyes follow the expression, so I made it sleepy-eyed.
> b1
  - ops: You took top middle. I took the center. Your move.
  - matrix: You took top middle. I took the center. Your move.
> c3
  - ops: You took bottom right. I took middle left. Your move.
  - matrix: You took bottom right. I took middle left. Your move.
> c1
  - ops: You took top right. I took middle right. I win this time! Say "new game" to play again.
  - matrix: You took top right. I took middle right. I win this time! Say "new game" to play again.
> make a chart: apples 5, pears 3, plums 8
  - ops: OK, here is a bar chart with 3 items: apples 5, pears 3 and plums 8.
  - matrix: OK, here is a bar chart with 3 items: apples 5, pears 3 and plums 8.
> add a cloud nect to a house
  - ops: Ta-da! I drew a yellow house and a cloud next to the yellow house. (I read "nect" as "next")
  - matrix: Ta-da! I drew a yellow house and a cloud next to the yellow house. (I read "nect" as "next")
> next
  - ops: I did not understand "next". Did you mean "What is next to the sun?" or "Put the cat next to the house."?
  - matrix: I did not understand "next". Did you mean "What is next to the sun?" or "Put the cat next to the house."?
> add a cloud next to a house
  - ops: Here you go! I drew a cloud next to the yellow house.
  - matrix: Here you go! I drew a cloud next to the yellow house.
> add a sun
  - ops: There! I drew a yellow sun.
  - matrix: There! I drew a yellow sun.
> move the cloud near sun
  - ops: Done! I moved the cloud next to the yellow sun. There are 2 clouds, so I took the last one. You can say "the first cloud" or "all the clouds".
  - matrix: Done! I moved the cloud next to the yellow sun. There are 2 clouds, so I took the last one. You can say "the first cloud" or "all the clouds".
> add more clouds
  - ops: Look at that! I drew 2 clouds.
  - matrix: Look at that! I drew 2 clouds.
> more
  - ops: Nice! I drew 2 clouds.
  - matrix: Nice! I drew 2 clouds.
> more
  - ops: Voila! I drew 2 clouds.
  - matrix: Voila! I drew 2 clouds.
> draw a girl
  - ops: Ta-da! I drew a girl.
  - matrix: Ta-da! I drew a girl.
> a man
  - ops: Here you go! I drew a man.
  - matrix: Here you go! I drew a man.
> draw 2 people
  - ops: There! I drew 2 blue people.
  - matrix: There! I drew 2 blue people.
> draw another house
  - ops: Done! I drew a yellow house.
  - matrix: Done! I drew a yellow house.
> a bigger house
  - ops: Look at that! I drew a big yellow house (bigger than the house I had).
  - matrix: Look at that! I drew a big yellow house (bigger than the house I had).
> draw a bigger house
  - ops: Nice! I drew a big yellow house (bigger than the house I had).
  - matrix: Nice! I drew a big yellow house (bigger than the house I had).
> bugger house pls
  - ops: Voila! I made the house bigger. There are 4 houses, so I took the last one. You can say "the first house" or "all the houses". (I read "bugger" as "bigger")
  - matrix: Voila! I made the house bigger. There are 4 houses, so I took the last one. You can say "the first house" or "all the houses". (I read "bugger" as "bigger")
> bigger house please
  - ops: Ta-da! I made the house bigger. There are 4 houses, so I took the last one. You can say "the first house" or "all the houses".
  - matrix: Ta-da! I made the house bigger. There are 4 houses, so I took the last one. You can say "the first house" or "all the houses".
> draw a red house
  - ops: Here you go! I drew a red house.
  - matrix: Here you go! I drew a red house.
> make a happy man
  - ops: There! I drew a happy man.
  - matrix: There! I drew a happy man.
> transform the avatar in a man
  - ops: Ta-da! A person shows being a man through hair, so I gave myself short neat hair and a short beard.
  - matrix: Ta-da! A person shows being a man through hair, so I gave myself short neat hair and a short beard.
> now in a women
  - ops: Sure! A person shows being a woman through hair, so I gave myself long hair and no beard.
  - matrix: Sure! A person shows being a woman through hair, so I gave myself long hair and no beard.
> the avatar
  - ops: You are already on the Avatar tab.
  - matrix: You are already on the Avatar tab.
> the avatar should be a women
  - ops: Sure! A person shows being a woman through hair, so I gave myself long hair and no beard.
  - matrix: Sure! A person shows being a woman through hair, so I gave myself long hair and no beard.
> make the avatar a women
  - ops: Sure! A person shows being a woman through hair, so I gave myself long hair and no beard.
  - matrix: Sure! A person shows being a woman through hair, so I gave myself long hair and no beard.

### dialogues:dlg.rp3#009 (media.music, tab music)

Note: random output (differs between two runs of ops)

Outcome: ops ["right","right","right","right"], matrix ["right","right","right","right"]

> open the music tab
  - ops: You are already on the Music tab.
  - matrix: You are already on the Music tab.
**>** play
  - ops: Playing "Row, Row, Row Your Boat" on the piano at 100 beats per minute. It is in C major.
  - matrix: Playing "Brahms' Lullaby" on the piano at 80 beats per minute. It is in D major.
  - state: media.music.tempo: ops 100 / matrix 80; media.music.current.title: ops "Row, Row, Row Your Boat" / matrix "Brahms' Lullaby"; media.music.current.abc: ops "X:1\nT:Row, Row, Row Your Boat\nC:Traditional nursery rhyme\nM:6/8\nL / matrix "X:1\nT:Brahms' Lullaby\nC:Johannes Brahms\nM:3/4\nL:1/8\nQ:1/4=80\nK:; media.music.current.notes: ops ["C4","D4","E4","F4","G4","C5"] / matrix ["D4","E4","F#4","G4",
**>** play a random song
  - ops: Playing "Ode to Joy" on the piano at 108 beats per minute. It is in C major.
  - matrix: Playing "London Bridge Is Falling Down" on the piano at 110 beats per minute. It is in C major.
  - state: media.music.tempo: ops 108 / matrix 110; media.music.current.title: ops "Ode to Joy" / matrix "London Bridge Is Falling Down"; media.music.current.abc: ops "X:1\nT:Ode to Joy\nC:Ludwig van Beethoven\nM:4/4\nL:1/4\nQ:1/4=108\nK / matrix "X:1\nT:London Bridge Is Falling Down\nC:Traditional English nursery r; media.music.current.notes: ops ["G3","C4","D4","E4","F4","G4"] / matrix ["C4","D4","E4","F4"
**>** surprise me
  - ops: Playing "Brahms' Lullaby" on the piano at 80 beats per minute. It is in D major.
  - matrix: Playing "Ode to Joy" on the piano at 108 beats per minute. It is in C major.
  - state: media.music.tempo: ops 80 / matrix 108; media.music.current.title: ops "Brahms' Lullaby" / matrix "Ode to Joy"; media.music.current.abc: ops "X:1\nT:Brahms' Lullaby\nC:Johannes Brahms\nM:3/4\nL:1/8\nQ:1/4=80\nK: / matrix "X:1\nT:Ode to Joy\nC:Ludwig van Beethoven\nM:4/4\nL:1/4\nQ:1/4=108\nK; media.music.current.notes: ops ["D4","E4","F#4","G4","A4","B4","C#5","D5"] / matrix ["G3","C4","D4","E4","F

### real-09c:real-09c#s1 (docs.editor)

Note: random output (differs between two runs of ops)

> set title to Title 1
  - ops: OK, the title is now "Title 1".
  - matrix: OK, the title is now "Title 1".
> create chapter one
  - ops: OK, I started chapter 1, "One".
  - matrix: OK, I started chapter 1, "One".
**>** play
  - ops: Playing "Mary Had a Little Lamb" on the piano at 110 beats per minute. It is in C major.
  - matrix: Playing "Twinkle, Twinkle, Little Star" on the piano at 100 beats per minute. It is in C major.
  - state: media.music.tempo: ops 110 / matrix 100; media.music.current.title: ops "Mary Had a Little Lamb" / matrix "Twinkle, Twinkle, Little Star"; media.music.current.abc: ops "X:1\nT:Mary Had a Little Lamb\nC:Traditional tune\nM:4/4\nL:1/4\nQ:1/ / matrix "X:1\nT:Twinkle, Twinkle, Little Star\nC:Traditional\nM:4/4\nL:1/4\nQ:; media.music.current.notes: ops ["C4","D4","E4","G4"] / matrix ["C4","D4","E4","F
> play a random song
  - ops: Playing "London Bridge Is Falling Down" on the piano at 110 beats per minute. It is in C major.
  - matrix: Playing "London Bridge Is Falling Down" on the piano at 110 beats per minute. It is in C major.
> play
  - ops: Playing "London Bridge Is Falling Down" again on the piano at 110 beats per minute.
  - matrix: Playing "London Bridge Is Falling Down" again on the piano at 110 beats per minute.
> play
  - ops: Playing "London Bridge Is Falling Down" again on the piano at 110 beats per minute.
  - matrix: Playing "London Bridge Is Falling Down" again on the piano at 110 beats per minute.
> play
  - ops: Playing "London Bridge Is Falling Down" again on the piano at 110 beats per minute.
  - matrix: Playing "London Bridge Is Falling Down" again on the piano at 110 beats per minute.
> Little Star
  - ops: Playing "Twinkle, Twinkle, Little Star" on the piano at 100 beats per minute. It is in C major.
  - matrix: Playing "Twinkle, Twinkle, Little Star" on the piano at 100 beats per minute. It is in C major.

### real-dialogue:rd#real-dialogue-2026-11-09.txt (session, tab robot)

Note: random output (differs between two runs of ops)

> i want a human as avatar
  - ops: Okay! Now I am a person. I have a smile expression and short side-parted hair.
  - matrix: Okay! Now I am a person. I have a smile expression and short side-parted hair.
> make a human
  - ops: I am a person already.
  - matrix: I am a person already.
> what command do tou recognise
  - ops: I can chat, talk about shapes and colors, shopping, animals and time, draw pictures, charts and diagrams, do sums, keep your lists, edit documents, answer questions about your documents, play chess, guess the animal, hangman, tic-tac-toe and music, show places on a map, change my face, and get to know you and keep your profile. Ask me "what can I say here?" for examples.
  - matrix: I can chat, talk about shapes and colors, shopping, animals and time, draw pictures, charts and diagrams, do sums, keep your lists, edit documents, answer questions about your documents, play chess, guess the animal, hangman, tic-tac-toe and music, show places on a map, change my face, and get to know you and keep your profile. Ask me "what can I say here?" for examples.
> show me bucharest
  - ops: Here is Bucharest: capital of Romania · 1.9 million people.
  - matrix: Here is Bucharest: capital of Romania · 1.9 million people.
> transform my avatar in a human
  - ops: I am a person already.
  - matrix: I am a person already.
> make bigger yes and a red had
  - ops: Okay! A person's eyes follow the expression, so I made it wide-eyed. Ta-da! I have a ginger beanie now. I do not have red for that; ginger is the closest.
  - matrix: Okay! A person's eyes follow the expression, so I made it wide-eyed. Ta-da! I have a ginger beanie now. I do not have red for that; ginger is the closest.
> use the cyclops eye
  - ops: A person has no cyclops eyes, but the robot does. Say "yes" to become the robot and do that.
  - matrix: A person has no cyclops eyes, but the robot does. Say "yes" to become the robot and do that.
> why you turned it in a robot, this ia wrong
  - ops: I am a person now, not a robot.
  - matrix: I am a person now, not a robot.
> turn it in a human again
  - ops: I am a person already.
  - matrix: I am a person already.
> make blue eyes
  - ops: A person has no eye color, but the robot does: its eyes glow in any color. Say "yes" to become the robot and do that.
  - matrix: A person has no eye color, but the robot does: its eyes glow in any color. Say "yes" to become the robot and do that.
> help
  - ops: The Avatar tab lets you change my face. You can say, for example: "Try the next mouth", "What character is on screen" or "Make your body lighter". Ask "what can you do?" for the whole list, "more examples" for others, or "how do I ...?" to find a command.
  - matrix: The Avatar tab lets you change my face. You can say, for example: "Try the next mouth", "What character is on screen" or "Make your body lighter". Ask "what can you do?" for the whole list, "more examples" for others, or "how do I ...?" to find a command.
> what can i say here
  - ops: On the Avatar tab you can say, for example: "What name do you go by", "What colors can your screen be", "What seed is this look from", "What colors can you change" or "Is your face happy". Say "more examples" for others.
  - matrix: On the Avatar tab you can say, for example: "What name do you go by", "What colors can your screen be", "What seed is this look from", "What colors can you change" or "Is your face happy". Say "more examples" for others.
> look suprised
  - ops: Sure! Now I look surprised. (I read "suprised" as "surprised")
  - matrix: Sure! Now I look surprised. (I read "suprised" as "surprised")
**>** give tourself a random look
  - ops: There you go! Surprise! My new look has the seed u01182. (I read "tourself" as "yourself")
  - matrix: There you go! Surprise! My new look has the seed 8d82ez. (I read "tourself" as "yourself")
  - state: ui.avatar.seed: ops "u01182" / matrix "8d82ez"; ui.avatar.person.head: ops "medium2" / matrix "shaved2"; ui.avatar.person.expression: ops "cyclops" / matrix "calm"; ui.avatar.person.facialHair: ops "chin" / matrix "none"; ui.avatar.person.colors.skin: ops "d08b5b" / matrix "edb98a"; ui.avatar.person.colors.clothing: ops "fdea6b" / matrix "9ddadb"; ui.avatar.person.colors.headContrast: ops "e8e1e1"
> fa-mi avatarul ca om
  - ops: I did not understand "fa-mi avatarul ca om". For example: "Try the next mouth." or "What character is on screen?"
  - matrix: I did not understand "fa-mi avatarul ca om". For example: "Try the next mouth." or "What character is on screen?"
> fa avatarul ca om
  - ops: I did not understand "fa avatarul ca om". For example: "Try the next mouth." or "What character is on screen?"
  - matrix: I did not understand "fa avatarul ca om". For example: "Try the next mouth." or "What character is on screen?"
> fa-i ochii mari
  - ops: I did not understand "fa-i ochii mari". For example: "Try the next mouth." or "What character is on screen?"
  - matrix: I did not understand "fa-i ochii mari". For example: "Try the next mouth." or "What character is on screen?"
> eys express fear
  - ops: Ta-da! Now I look scared. (I read "eys" as "eyes")
  - matrix: Ta-da! Now I look scared. (I read "eys" as "eyes")
> fa ochii mari
  - ops: I did not understand "fa ochii mari". For example: "Try the next mouth." or "What character is on screen?"
  - matrix: I did not understand "fa ochii mari". For example: "Try the next mouth." or "What character is on screen?"
> fa ochi visatori
  - ops: I did not understand "fa ochi visatori". For example: "Try the next mouth." or "What character is on screen?"
  - matrix: I did not understand "fa ochi visatori". For example: "Try the next mouth." or "What character is on screen?"
> make bigger eyes
  - ops: Okay! A person's eyes follow the expression, so I made it wide-eyed.
  - matrix: Okay! A person's eyes follow the expression, so I made it wide-eyed.
> make eyes sleepy
  - ops: There you go! A person's eyes follow the expression, so I made it sleepy-eyed.
  - matrix: There you go! A person's eyes follow the expression, so I made it sleepy-eyed.
> b1
  - ops: B1 looks like a game move. Do you want to play tic-tac-toe or chess?
  - matrix: B1 looks like a game move. Do you want to play tic-tac-toe or chess?
> c3
  - ops: C3 looks like a game move. Do you want to play tic-tac-toe or chess?
  - matrix: C3 looks like a game move. Do you want to play tic-tac-toe or chess?
> c1
  - ops: C1 looks like a game move. Do you want to play tic-tac-toe or chess?
  - matrix: C1 looks like a game move. Do you want to play tic-tac-toe or chess?
> make a chart: apples 5, pears 3, plums 8
  - ops: OK, here is a bar chart with 3 items: apples 5, pears 3 and plums 8.
  - matrix: OK, here is a bar chart with 3 items: apples 5, pears 3 and plums 8.
> add a cloud nect to a house
  - ops: I did not understand where to put it ("nect to a house"). You can say, for example, "in the top right corner", "next to the sun" or "under the tree".
  - matrix: I did not understand where to put it ("nect to a house"). You can say, for example, "in the top right corner", "next to the sun" or "under the tree".
> next
  - ops: I did not understand "next". Did you mean "Try the next mouth." or "What is next to the sun?"?
  - matrix: I did not understand "next". Did you mean "Try the next mouth." or "What is next to the sun?"?
> add a cloud next to a house
  - ops: Ta-da! I drew a yellow house and a cloud next to the yellow house.
  - matrix: Ta-da! I drew a yellow house and a cloud next to the yellow house.
> add a sun
  - ops: Here you go! I drew a yellow sun.
  - matrix: Here you go! I drew a yellow sun.
> move the cloud near sun
  - ops: There! I moved the cloud next to the yellow sun.
  - matrix: There! I moved the cloud next to the yellow sun.
> add more clouds
  - ops: Done! I drew 3 clouds.
  - matrix: Done! I drew 3 clouds.
> more
  - ops: Look at that! I drew 2 clouds.
  - matrix: Look at that! I drew 2 clouds.
> more
  - ops: Nice! I drew 2 clouds.
  - matrix: Nice! I drew 2 clouds.
> draw a girl
  - ops: Voila! I drew a girl.
  - matrix: Voila! I drew a girl.
> a man
  - ops: Ta-da! I drew a man.
  - matrix: Ta-da! I drew a man.
> draw 2 people
  - ops: Here you go! I drew 2 blue people.
  - matrix: Here you go! I drew 2 blue people.
> draw another house
  - ops: There! I drew a yellow house.
  - matrix: There! I drew a yellow house.
> a bigger house
  - ops: Done! I drew a big yellow house (bigger than the house I had).
  - matrix: Done! I drew a big yellow house (bigger than the house I had).
> draw a bigger house
  - ops: Look at that! I drew a big yellow house (bigger than the house I had).
  - matrix: Look at that! I drew a big yellow house (bigger than the house I had).
> bugger house pls
  - ops: Nice! I made the house bigger. There are 4 houses, so I took the last one. You can say "the first house" or "all the houses". (I read "bugger" as "bigger")
  - matrix: Nice! I made the house bigger. There are 4 houses, so I took the last one. You can say "the first house" or "all the houses". (I read "bugger" as "bigger")
> bigger house please
  - ops: Voila! I made the house bigger. There are 4 houses, so I took the last one. You can say "the first house" or "all the houses".
  - matrix: Voila! I made the house bigger. There are 4 houses, so I took the last one. You can say "the first house" or "all the houses".
> draw a red house
  - ops: Ta-da! I drew a red house.
  - matrix: Ta-da! I drew a red house.
> make a happy man
  - ops: Here you go! I drew a happy man.
  - matrix: Here you go! I drew a happy man.
> transform the avatar in a man
  - ops: Ta-da! A person shows being a man through hair, so I gave myself short neat hair and a short beard.
  - matrix: Ta-da! A person shows being a man through hair, so I gave myself short neat hair and a short beard.
> now in a women
  - ops: Sure! A person shows being a woman through hair, so I gave myself long hair and no beard.
  - matrix: Sure! A person shows being a woman through hair, so I gave myself long hair and no beard.
> the avatar
  - ops: You are already on the Avatar tab.
  - matrix: You are already on the Avatar tab.
> the avatar should be a women
  - ops: Sure! A person shows being a woman through hair, so I gave myself long hair and no beard.
  - matrix: Sure! A person shows being a woman through hair, so I gave myself long hair and no beard.
> make the avatar a women
  - ops: Sure! A person shows being a woman through hair, so I gave myself long hair and no beard.
  - matrix: Sure! A person shows being a woman through hair, so I gave myself long hair and no beard.

### gold:real#rp3-17 (media.music, tab music)

Note: random output (differs between two runs of ops)

> open the music tab
  - ops: You are already on the Music tab.
  - matrix: You are already on the Music tab.
**>** play
  - ops: Playing "Frère Jacques" on the piano at 120 beats per minute. It is in C major.
  - matrix: Playing "Twinkle, Twinkle, Little Star" on the piano at 100 beats per minute. It is in C major.
  - state: media.music.tempo: ops 120 / matrix 100; media.music.current.title: ops "Frère Jacques" / matrix "Twinkle, Twinkle, Little Star"; media.music.current.abc: ops "X:1\nT:Frère Jacques\nC:Traditional French nursery rhyme\nM:4/4\nL:1/ / matrix "X:1\nT:Twinkle, Twinkle, Little Star\nC:Traditional\nM:4/4\nL:1/4\nQ:; media.music.current.notes: ops ["G3","C4","D4","E4","F4","G4","A4"] / matrix ["C4","D4","

### gold:real#rp3-18 (media.music, tab music)

Note: random choice of a song ("play a random song"); the two modes drew different songs

> open the music tab
  - ops: You are already on the Music tab.
  - matrix: You are already on the Music tab.
**>** play a random song
  - ops: Playing "Mary Had a Little Lamb" on the piano at 110 beats per minute. It is in C major.
  - matrix: Playing "Row, Row, Row Your Boat" on the piano at 100 beats per minute. It is in C major.
  - state: media.music.tempo: ops 110 / matrix 100; media.music.current.title: ops "Mary Had a Little Lamb" / matrix "Row, Row, Row Your Boat"; media.music.current.abc: ops "X:1\nT:Mary Had a Little Lamb\nC:Traditional tune\nM:4/4\nL:1/4\nQ:1/ / matrix "X:1\nT:Row, Row, Row Your Boat\nC:Traditional nursery rhyme\nM:6/8\nL; media.music.current.notes: ops ["C4","D4","E4","G4"] / matrix ["C4","D4","E4","F4","G4

