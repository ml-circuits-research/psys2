# Failure groups (2026-11-13)

Ledger: `training/eval/failures.jsonl`, 2113 rows. Produced by `node scripts/analyze-failures.mjs`. Rule (worker-tasks NO POINT FIXES): a change names a group below, is a general mechanism, and reports the group's count before and after plus what it broke elsewhere. The cause key is derived from the row's class and general signals in what happened (see `causeOf`), not from phrases.

## Rows per source

| source | rows |
| --- | --- |
| ablation-rules-C | 596 |
| round-trip-m4-2026-11-13 | 578 |
| round-trip-cases-keep-2026-11-13 | 461 |
| E-T1 scripts | 129 |
| dialogues | 115 |
| owner-log-2026-11-13b | 52 |
| owner-log-2026-11-13 | 33 |
| P2 scripts | 29 |
| world-routing-2026-11-13 | 25 |
| T3 rule transfer (matrix) scripts | 19 |
| T3 rule transfer (ops) scripts | 19 |
| owner-log-2026-11-13c | 14 |
| minimal-pairs-2026-11-12 | 10 |
| T2 taught-fact transfer (matrix) scripts | 10 |
| T2 taught-fact transfer (ops) scripts | 10 |
| coherence-2026-11-10 | 4 |
| E-T3 scripts | 3 |
| reviewer Chrome probe 2026-11-13 20:55 | 3 |
| test-world media.music sh04 | 1 |
| worlds | 1 |
| reviewer Chrome probe 2026-11-13 20:55 (default face, catalog unreachable) | 1 |

## Groups by cause

| group | rows | share | regressions (was_passing) |
| --- | --- | --- | --- |
| roundtrip: translation changed meaning | 545 | 25.8% | 4 |
| roundtrip: translation kept meaning, reader gap | 278 | 13.2% | 1 |
| roundtrip: English original not read | 179 | 8.5% | 0 |
| robustness: loose-words / not-read | 143 | 6.8% | 0 |
| Talk: no fact in the catalog / frame not read | 134 | 6.3% | 0 |
| robustness: loose-words / read-as-another-intent | 97 | 4.6% | 0 |
| robustness: paraphrases-rt / read-as-another-reading | 82 | 3.9% | 0 |
| other / wrong result | 73 | 3.5% | 2 |
| continuation / correction / why-question | 69 | 3.3% | 0 |
| robustness: loose-words / junk-acted-on | 69 | 3.3% | 0 |
| robustness: typos / not-corrected | 62 | 2.9% | 0 |
| robustness: typos / read-as-another-command | 59 | 2.8% | 0 |
| dialogue: other turn kinds | 49 | 2.3% | 0 |
| robustness: typos / corrected-to-another-word | 42 | 2.0% | 0 |
| robustness: paraphrases-rt / phrasing-not-read | 42 | 2.0% | 0 |
| roundtrip: answer wording only | 37 | 1.8% | 0 |
| wrong world routing (confusion pair) | 25 | 1.2% | 0 |
| not understood (no cause key) | 24 | 1.1% | 0 |
| translation residue / wrong sense / source typo | 22 | 1.0% | 0 |
| amount / relation / set distribution | 19 | 0.9% | 0 |
| fragment / list split | 10 | 0.5% | 0 |
| foreign-world reading | 9 | 0.4% | 1 |
| unknown kind (no drawing / stand-in) | 7 | 0.3% | 0 |
| region as a thing / ground replaced | 7 | 0.3% | 0 |
| minimal pair (order) | 6 | 0.3% | 0 |
| acted on a partly understood sentence | 4 | 0.2% | 0 |
| avatar part not an operation of the avatar world | 4 | 0.2% | 0 |
| default place | 3 | 0.1% | 0 |
| session as content (about the discussion) | 3 | 0.1% | 0 |
| no reply | 2 | 0.1% | 0 |
| minimal pair (comparison) | 2 | 0.1% | 0 |
| minimal pair (direction) | 2 | 0.1% | 0 |
| coherence (contradiction) | 1 | 0.0% | 0 |
| coherence (default-revision) | 1 | 0.0% | 0 |
| coherence (deduce) | 1 | 0.0% | 0 |
| coherence (assumption-visible) | 1 | 0.0% | 0 |

### roundtrip: translation changed meaning (545)

Classes: roundtrip:mt-wrong 291, roundtrip-m4:mt-wrong 254

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| Donnez-moi des yeux en plus |  | fr | I do not know how to look like that. I understood only part of that: I did not use "more". [back-translation:  | give me plus shaped eyes -> ["robot.eyes=plus"] | round-trip-cases-keep-2026-11-13#ui.avatar#006/fr |
| ähm, welchen Klang macht eine Kuh auch Ägypten in Afrika | map | de | I did not understand "ähm, welchen Klang macht eine Kuh auch Ägypten in Afrika". Did you mean "What sound does | um what sound does a cow make also is Egypt in Africa -> ["moo","Yes"] | round-trip-m4-2026-11-13#kids.animals#017/de |
| Sirène sur le dessus |  | fr | I did not understand "Mermaid on the top". For example: "Try the next mouth." or "What character is on screen? | Siren on top -> ["robot.top=siren"] | round-trip-cases-keep-2026-11-13#ui.avatar#012/fr |
| Welchen Tag kommt nach Montag und welche Jahreszeit kommt nach dem Win | music | de | The day after Monday is Tuesday. I did not understand "Welchen Tag kommt nach Montag und welche Jahreszeit kom | um what day comes after Monday and which season comes after winter -> ["Tuesday" | round-trip-m4-2026-11-13#kids.time#020/de |
| ôtez la chose sur votre poitrine |  | fr | Where should it go? You can say, for example, "move the tree to the left", "put the cat next to the house" or  | remove the thing on your chest -> ["robot.chest=none"] | round-trip-cases-keep-2026-11-13#ui.avatar#018/fr |

### roundtrip: translation kept meaning, reader gap (278)

Classes: roundtrip:reader-gap 151, roundtrip-m4:reader-gap 127

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| Ana a 8 crayons. Ben donne 6 crayons Ana. Combien de crayons Ana a-t-i |  | fr | OK, Ana has 8 crayons. I did not understand "Ben gives 6 Ana pencils". Did you mean "Ben bought a pencil." or  | Ana has 8 pencils. Ben gives Ana 6 pencils. How many pencils does Ana have? -> [ | round-trip-cases-keep-2026-11-13#kids.arith#067/fr |
| 4 und 8 hinzufügen |  | de | I did not understand "4 und 8 hinzufügen". Did you mean "Add bananas at 4." or "Add 4 bananas to the chart."?  | add 4 and 8 -> ["12"] | round-trip-m4-2026-11-13#kids.arith#001/de |
| Tom a 11 crayons. Leo a 1 crayon. Combien de crayons ont-ils au total  |  | fr | OK, Tom has 11 crayons. OK, Leo has 1 pencil. There are 1 pencil altogether. [back-translation: Tom has 11 cra | Tom has 11 pencils. Leo has 1 pencil. How many pencils do they have altogether?  | round-trip-cases-keep-2026-11-13#kids.arith#073/fr |
| Zoe hat 4 Birnen. Zoe kauft 1 mehr. Wie viele Birnen hat Zoe? |  | de | I did not understand "Zoe hat 4 Birnen. Zoe kauft 1 mehr. Wie viele Birnen hat Zoe". Did you mean "A zebra has | Zoe has 4 pears. Zoe buys 1 more. How many pears does Zoe have? -> ["5"] | round-trip-m4-2026-11-13#kids.arith#085/de |
| Ana a 13 autocollants. Tom donne l'autocollant Ana 1. Combien d'autoco |  | fr | OK, Ana has 13 stickers. I did not understand "Tom gives the sticker Ana 1". Did you mean "Ana gave Tom an app | Ana has 13 stickers. Tom gives Ana 1 sticker. How many stickers does Ana have? - | round-trip-cases-keep-2026-11-13#kids.arith#097/fr |

### roundtrip: English original not read (179)

Classes: roundtrip-m4:original-fails 179

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| Geben Sie mir plus geformte Augen | robot | de | I did not understand "Geben Sie mir plus geformte Augen". For example: "Rename yourself to Pixel." or "What na | give me plus shaped eyes -> ["robot.eyes=plus"] | round-trip-m4-2026-11-13#ui.avatar#006/de |
| Sirene oben | robot | de | I did not understand "Sirene oben". For example: "Rename yourself to Pixel." or "What name do you go by?" [Eng | Siren on top -> ["robot.top=siren"] | round-trip-m4-2026-11-13#ui.avatar#012/de |
| Entfernen Sie das Ding auf Ihrer Brust | robot | de | I can not find a thing in your picture. Your picture is empty. Try "draw a red house". [English read: Remove t | remove the thing on your chest -> ["robot.chest=none"] | round-trip-m4-2026-11-13#ui.avatar#018/de |
| Machen Sie Ihre Augen rund | robot | de | I did not understand "Machen Sie Ihre Augen rund". Did you mean "What sound does a cow make?"? [English read:  | Make your eyes round -> ["robot.eyes=round"] | round-trip-m4-2026-11-13#ui.avatar#024/de |
| Körperfarbe sollte rot sein | robot | de | I took that as: "remember Body color is red" OK, a body is red. [English read: Body color should be red] | body color should be red -> ["robot.colors.body=ff9d9d"] | round-trip-m4-2026-11-13#ui.avatar#030/de |

### robustness: loose-words / not-read (143)

Classes: robust:loose-words:not-read 143

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| 4 8 add pls |  | en | I did not understand "4 8 add pls". Did you mean "Add bananas at 4." or "Add 4 bananas to the chart."? [asked] | the same state and answer as "Add 4 and 8." | ablation-rules-C#loose-words/loose#1 |
| subtract 5 12 ok |  | en | I did not understand "subtract 5 12 ok". For example: "Add a hat." or "What is the colour of hat?" [nu] | the same state and answer as "Subtract 5 from 12." | ablation-rules-C#loose-words/loose#22 |
| multiply 3 4 yo |  | en | I did not understand "multiply 3 4 yo". For example: "Add a hat." or "What is the colour of hat?" [nu] | the same state and answer as "Multiply 3 by 4." | ablation-rules-C#loose-words/loose#23 |
| tomorrow friday | draw | en | I did not understand "tomorrow friday". For example: "Draw a red house." or "Draw a small blue fish." [nu] | the same state and answer as "If today is Friday, what day is tomorrow?" | ablation-rules-C#loose-words/loose#32 |
| yesterday sunday |  | en | I did not understand "yesterday sunday". For example: "Add a hat." or "What is the colour of hat?" [nu] | the same state and answer as "What day was yesterday if today is Sunday?" | ablation-rules-C#loose-words/loose#33 |

### Talk: no fact in the catalog / frame not read (134)

Classes: undefined 134

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| Which is bigger, a train or a tent? | talk | en | I don't know that yet. [frame read, no fact in the local catalog] | an answer from the knowledge of the domain (things), with a card where the frame | E-T1 scripts/exp-talk.mjs (things, seed) |
| How many legs does a ant have? | talk | en | I don't know that yet. [frame read, no fact in the local catalog] | an answer from the knowledge of the domain (animals), with a card where the fram | E-T1 scripts/exp-talk.mjs (animals, seed) |
| What is cheese made of? | talk | en | I don't know that yet. [frame read, no fact in the local catalog] | an answer from the knowledge of the domain (food), with a card where the frame h | E-T1 scripts/exp-talk.mjs (food, seed) |
| Is Brazil big? | talk | en | I cannot talk about that here. I can talk about things you can draw, their parts and sizes, and the order of m | an answer from the knowledge of the domain (places), with a card where the frame | E-T1 scripts/exp-talk.mjs (places, seed) |
| How many moons does Mercury have? | talk | en | I don't know that yet. [frame read, no fact in the local catalog] | an answer from the knowledge of the domain (space), with a card where the frame  | E-T1 scripts/exp-talk.mjs (space, seed) |

### robustness: loose-words / read-as-another-intent (97)

Classes: robust:loose-words:read-as-another-intent 97

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| apples tom how many pls |  | en | You can try, for example: "Tom had some apples", "Tom ate 2 apples" or "Ana gave Tom an apple". I understood o | the same state and answer as "How many apples does Tom have?" | ablation-rules-C#loose-words/loose#0 |
| ana ate apple |  | en | I can't count the apples yet, because I don't know how many everyone has. Please tell me, for example: Tom has | the same state and answer as "Ana ate an apple." | ablation-rules-C#loose-words/loose#14 |
| lemons ben 2 bought |  | en | I can't find lemons ben 2 on any of your lists, so I cannot mark it as done. [wrong] | the same state and answer as "Ben bought 2 lemons." | ablation-rules-C#loose-words/loose#25 |
| april days how many | music | en | You can try, for example: "How many days has April" or "April has how many days". I understood only part of th | the same state and answer as "How many days has April?" | ablation-rules-C#loose-words/loose#43 |
| hours day how many |  | en | You can try, for example: "What are the weekend days", "Which days are the weekend" or "How many days are in a | the same state and answer as "How many hours does a day have?" | ablation-rules-C#loose-words/loose#45 |

### robustness: paraphrases-rt / read-as-another-reading (82)

Classes: robust:paraphrases-rt:read-as-another-reading 82

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| Ana has 8 crayons. Ben gives Ana 6 pencils. How many pencils does Ana  | kids.arith | en | OK, Ana has 8 crayons. OK, Ben gave Ana 6 pencils. I don't know how many pencils Ana had; Ana got 6 from Ben.  | {"answer":["14"]} | ablation-rules-C#paraphrases-rt/rt#001 |
| Tom has 11 crayons. Leo has 1 pencil. How many pencils do they have in | kids.arith | en | OK, Tom has 11 crayons. OK, Leo has 1 pencil. There are 1 pencil altogether. [wrong] | {"answer":["12"]} | ablation-rules-C#paraphrases-rt/rt#002 |
| Ana has 13 stickers. Tom gives an Ana 1 sticker. How many stickers doe | kids.arith | en | OK, Ana has 13 stickers. I did not understand "Tom gives an Ana 1 sticker". Did you mean "Ana gave Tom an appl | {"answer":["14"]} | ablation-rules-C#paraphrases-rt/rt#003 |
| The color of the body should be red | robot | en | I can not find a red body in your picture. Your picture is empty. Try "draw a red house". [wrong] | {"state":["robot.colors.body=ff9d9d"]} | ablation-rules-C#paraphrases-rt/rt#004 |
| Wearing a hat | robot | en | I took off a bow hat. [wrong] | {"state":["person.head=hatBeanie"]} | ablation-rules-C#paraphrases-rt/rt#005 |

### other / wrong result (73)

Classes: undefined 44, act phrase 10, referent 9, repeat 2, typo-referent 2, help 1, part 1, add-synonym 1

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| cum pot schimba forma unei diagrame | diagram | ro | Which shape should I change? Name it, e.g. "change circle1". I understood only part of that: I did not use "Ho | say how to change the shape of a diagram node (an example of that), not generic  | owner-log-2026-11-13#17 |
| Wear glasses. | robot | en | not read: wear is not a verb of the act make in k.actions (read as the noun "hear glasses") | I put on round glasses | worlds/ui.avatar/tests.sop#n07 |
| put a guest named Maria at table 1 | plan.seating | en | There is no named maria guest here. | a guest Maria is added and seated at table 1 ("put a guest named X at table N") | P2 scripts/exp-seating.mjs (conversation 1, reques |
| seat Tom at table 2 | plan.seating | en | There is no tom in the seating plan. I can work with tables and guests; they have seats and colour. | Tom is added as a guest and seated at table 2 (a name the plan does not know, wi | P2 scripts/exp-seating.mjs (conversation 1, reques |
| give table 1 six seats | plan.seating | en | Send table 1 where? | table 1 gets 6 seats ("give X N seats" read as send) | P2 scripts/exp-seating.mjs (conversation 1, reques |

### continuation / correction / why-question (69)

Classes: dialogue:confirmation 14, dialogue:reference 12, dialogue:clarification 11, dialogue:ellipsis 11, dialogue:correction 6, continuation 4, correction 3, dialogue:feedback 3

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| nu si peste apa | draw | ro | Nothing I just did reaches the lake. | the last action (blue sky) must not cover the water: undo that part only; not 'r | owner-log-2026-11-13#58 |
| pe lac | draw | ro | I did not understand "pe lac". Did you mean "Îl fă noapte." or "Fă soarele uriaș."? | move the duck (last thing) onto the lake | owner-log-2026-11-13b#3 |
| why? | charts | en | You said "1000 cars", so I answered it. What I answered: There! I drew 12 red cars (12 is plenty!). | why no chart: explain the last turn, not an older one | owner-log-2026-11-13c#18 |
| Zoe eats 8. How many marbles are left? | kids.arith | en | OK, Zoe ate 8 marbles. I did not understand "How many marbles are left". Did you mean "How many pieces are lef | answer:6 | dialogues#dlg.kidsA#010/1 |
| dar lasa lacul | draw | ro | The lake is still there as before. | keep the lake (the grass must not replace it); a constraint on the last action | owner-log-2026-11-13#62 |

### robustness: loose-words / junk-acted-on (69)

Classes: robust:loose-words:junk-acted-on 69

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| tuesday 4 apples minus pls |  | en | I did not understand "tuesday 4 apples minus pls". For example: "Add a hat." or "What is the colour of hat?" [ | nothing done | ablation-rules-C#loose-words/loose#26 |
| cake 3 ben lost gives sum |  | en | I did not understand "cake 3 ben lost gives sum". Did you mean "Ben lost 3 marbles yesterday." or "Mia lost 3  | nothing done | ablation-rules-C#loose-words/loose#27 |
| big 5 purple | draw | en | I did not understand "big 5 purple". For example: "Draw a red house." or "Draw a small blue fish." [wrong] | nothing done | ablation-rules-C#loose-words/loose#28 |
| sweet times lemon 7 ana half |  | en | I did not understand "sweet times lemon 7 ana half". For example: "Add a hat." or "What is the colour of hat?" | nothing done | ablation-rules-C#loose-words/loose#29 |
| tuesday 3 plus spring |  | en | I did not understand "tuesday 3 plus spring". For example: "Add a hat." or "What is the colour of hat?" [wrong | nothing done | ablation-rules-C#loose-words/loose#56 |

### robustness: typos / not-corrected (62)

Classes: robust:typos:not-corrected 62

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| Remove the glass. | draw | en | I can't find “glass” in the picture. The picture is empty. [nu] | the same state and answer as "Remove the grass." | ablation-rules-C#typos/typo#18 |
| Were are the trees? | draw | en | I did not understand "Were are the trees". Did you mean "Where is the second tree?"? [asked] | the same state and answer as "Where are the trees?" | ablation-rules-C#typos/typo#26 |
| Paint the roof brown on the hosue. | draw | en | I can't find “hosue” in the picture. The picture is empty. [nu] | the same state and answer as "Paint the roof brown on the house." | ablation-rules-C#typos/typo#37 |
| What is the smalles? | charts | en | I don't know what a smalles is. [nu] | the same state and answer as "What is the smallest?" | ablation-rules-C#typos/typo#80 |
| What is the smallets? | charts | en | I don't know what a smallets is. [nu] | the same state and answer as "What is the smallest?" | ablation-rules-C#typos/typo#81 |

### robustness: typos / read-as-another-command (59)

Classes: robust:typos:read-as-another-command 59

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| Draw a red horse. | draw | en | I cannot draw a horse yet. I can draw a cat, a dog, a fish or a bird. What would you like? [wrong] | the same state and answer as "Draw a red house." | ablation-rules-C#typos/typo#3 |
| Get that bark please. | draw | en | OK, that bark. I understood only part of that: I did not use "Get". [wrong] | the same state and answer as "Get that back please." | ablation-rules-C#typos/typo#46 |
| Make a chart: apples 5, peras 3, plums 8. | charts | en | OK, here is a bar chart with 3 items: apples 5, peras 3 and plums 8. [wrong] | the same state and answer as "Make a chart: apples 5, pears 3, plums 8." | ablation-rules-C#typos/typo#65 |
| Make a chart: apples 5, bears 3, plums 8. | charts | en | OK, here is a bar chart with 3 items: apples 5, bears 3 and plums 8. [wrong] | the same state and answer as "Make a chart: apples 5, pears 3, plums 8." | ablation-rules-C#typos/typo#66 |
| Can we stat a new chart. | charts | en | I could not find numbers in "stat a new". Say it like this: "make a chart: apples 5, pears 3, plums 8". [wrong | the same state and answer as "Can we start a new chart." | ablation-rules-C#typos/typo#90 |

### dialogue: other turn kinds (49)

Classes: dialogue:topic 15, dialogue:real 9, dialogue:noise 8, dialogue:explain 8, dialogue:multistep 6, dialogue:userfacts 3

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| what was the sum again? | kids.time | en | I did not understand "what was the sum again". Did you mean "What was the question?" or "What was your last mo | answer:12 | dialogues#dlg.kidsA#015/3 |
| lol ok and how many days r in a wek | kids.time | en | I did not understand "how many days r in a wek". Did you mean "How many days are in a week?" or "How many days | answer:7 | dialogues#dlg.kidsA#019/1 |
| how many things are on it? | kids.tasks | en | Your picture is empty. There is nothing in it yet. [wrong] | answer:2 | dialogues#dlg.kidsB#033/1 |
| Give yourself visor eyes. | robot | en | I do not know eyes like "visor". My eyes can be round, narrow or big. [wrong] | state:robot.eyes=visor (got round) | dialogues#dlg.avt#003/0 |
| Also a siren on top. | robot | en | I have no top on my face yet. I understood only part of that: I did not use "Also". [not_understood] | state:robot.top=siren (got antenna) | dialogues#dlg.avt#003/1 |

### robustness: typos / corrected-to-another-word (42)

Classes: robust:typos:corrected-to-another-word 42

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| Make a chrat: apples 5, pears 3, plums 8. | charts | en | OK, here is a bar chart with 3 items: apples 5, pears 3 and plums 8. (I read "chrat" as "chart") [wrong; corre | the same state and answer as "Make a chart: apples 5, pears 3, plums 8." | ablation-rules-C#typos/typo#64 |
| Hwo many words | documents | en | There are 0 words. (I read "hwo many" as "how many") [wrong; corrections: Hwo many>how many] | the same state and answer as "How many words" | ablation-rules-C#typos/typo#211 |
| Were Hansel goes? | documents | en | Hansel is mentioned 36 times, in 28 sentences. (I read "goes" as "toes") [wrong; corrections: goes>toes] | the same state and answer as "Where Hansel goes?" | ablation-rules-C#typos/typo#229 |
| Whats the more history? | chess | en | I can't find Thats the more on any of your lists, so I cannot mark it as done. (I read "whats" as "thats") [wr | the same state and answer as "Whats the move history?" | ablation-rules-C#typos/typo#296 |
| Yse, but only on Sundays. | guess | en | We are not playing twenty questions. Say "guess my animal" to start. We are not playing twenty questions. Say  | the same state and answer as "Yes, but only on Sundays." | ablation-rules-C#typos/typo#311 |

### robustness: paraphrases-rt / phrasing-not-read (42)

Classes: robust:paraphrases-rt:phrasing-not-read 42

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| How much is left on my list of things to do | kids.tasks | en | I did not understand "How much is left on my list of things to do". Did you mean "How much money is left?" or  | {"answer":["1"]} | ablation-rules-C#paraphrases-rt/rt#007 |
| Move the house upsides | draw | en | Where should it go? You can say, for example, "move the tree to the left", "put the cat next to the house" or  | {"state":["objects[kind=house].y<492"]} | ablation-rules-C#paraphrases-rt/rt#009 |
| What is the C E G | music | en | I did not understand "What is the C E G". Did you mean "C E G is what chord" or "what do E G C spell"? [nu] | {"answer":["C major"]} | ablation-rules-C#paraphrases-rt/rt#013 |
| Move the first paragraph | editor | en | Where should it go? You can say, for example, "move the tree to the left", "put the cat next to the house" or  | {"state":["blocks.1.text~One"]} | ablation-rules-C#paraphrases-rt/rt#016 |
| Um what sound does a cow make Egypt in Africa | map | en | I did not understand "what sound does a cow make Egypt in Africa". Did you mean "What sound does a cow make?"  | {"answer":["moo","Yes"]} | ablation-rules-C#paraphrases-rt/rt#020 |

### roundtrip: answer wording only (37)

Classes: roundtrip:judge-strict 19, roundtrip-m4:judge-strict 18

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| qu'est-ce que 20 moins 8, qu'est-ce que 9 fois 3 pls |  | fr | It will be 8:20. 9 times 3 is 27. [back-translation: What is 20 mins 8, what is 9 times 3 pls] | what is 20 minus 8, what is 9 times 3 pls -> ["12","27"] | round-trip-cases-keep-2026-11-13#kids.arith#127/fr |
| Entfernung Paris nach rom in km pls | map | de | Paris and Homs are about 3,215 km (1,998 miles) apart, as the crow flies. (I read "rom" as "hom") [English rea | distance paris to rome in km pls -> ["1,107"] | round-trip-m4-2026-11-13#geo.map#059/de |
| des mots dans l'histoire ? |  | fr | I can't find Works in on any of your lists, so I cannot mark it as done. (I read "words" as "works") [back-tra | words in the story? -> ["685"] | round-trip-cases-keep-2026-11-13#docs.reader#006/f |
| Was ist der relative Nebenfach von C-Moll | music | de | C minor is already minor. Its relative major is Eb major. [English read: What is the relative minor of C minor | What is the relative minor of C major -> ["A minor"] | round-trip-m4-2026-11-13#media.music#020/de |
| Parole nella storia? |  | it | I can't find Works in on any of your lists, so I cannot mark it as done. (I read "words" as "works") [back-tra | words in the story? -> ["685"] | round-trip-cases-keep-2026-11-13#docs.reader#006/i |

### wrong world routing (confusion pair) (25)

Classes: world-routing 25

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| (aggregate: 54 operational turns) | kids.arith | en | routed to ui.avatar by router B | stay in kids.arith | world-routing-2026-11-13#kids.arith -> ui.avatar |
| (aggregate: 51 operational turns) | kids.arith | en | routed to talk by router B | stay in kids.arith | world-routing-2026-11-13#kids.arith -> talk |
| (aggregate: 39 operational turns) | ui.avatar | en | routed to diagram.sketch by router B | stay in ui.avatar | world-routing-2026-11-13#ui.avatar -> diagram.sket |
| (aggregate: 38 operational turns) | art.draw | en | routed to diagram.sketch by router B | stay in art.draw | world-routing-2026-11-13#art.draw -> diagram.sketc |
| (aggregate: 36 operational turns) | kids.tasks | en | routed to docs.editor by router B | stay in kids.tasks | world-routing-2026-11-13#kids.tasks -> docs.editor |

### not understood (no cause key) (24)

Classes: act phrase 12, undefined 10, part 1, typo 1

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| fa piciorul corcodilului albastru de culoare neagra | draw | ro | I did not understand "fa piciorul corcodilului albastru de culoare neagra". Did you mean "Fă cerul albastru în | make the leg of the blue crocodile black; one request, nothing for the map; no w | owner-log-2026-11-13#40 |
| Chnage the tile of the document to Disucssion | editor | en | I could not find "the tile of the document" in the document. (I read "chnage" as "change") | set the document title to Discussion | owner-log-2026-11-13c#20 |
| which table is Ann at? | plan.seating | en | I did not understand "which table is Ann at". For example: "What should I call you?" or "Who am I chatting wit | the table Ann sits at ("which table is X at": an ask for the place of a guest) | P2 scripts/exp-seating.mjs (conversation 2, reques |
| generate a guest Bob at table 3 | plan.seating | en | I did not understand "generate a guest Bob at table 3". For example: "What should I call you?" or "Who am I ch | a guest Bob is added at table 3 (verb "generate", a verb of k.actions for make t | P2 scripts/exp-seating.mjs (conversation 3, reques |
| produce a guest Eve at table 3 | plan.seating | en | I did not understand "produce a guest Eve at table 3". For example: "What should I call you?" or "Who am I cha | a guest Eve is added at table 3 (verb "produce", k.actions make) | P2 scripts/exp-seating.mjs (conversation 3, reques |

### translation residue / wrong sense / source typo (22)

Classes: mt-residue 6, mt-wrong-sense 4, typo-source 2, amount 2, active-tab 1, part 1, typo-referent 1, typo-source+kind-of 1

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| an old woman | robot | ro | I did not understand "an old woman". Did you mean "Am 34 de ani."? I did not know the words: old, woman. [chec | on the Avatar tab after 'a person': become an old woman, or say what characters  | owner-log-2026-11-13#27 |
| desneaza o vila | draw | ro | I did not understand "desneaza o vila". For example: "Desenează o casă roșie." or "Desenează un pește mic și a | draw a villa = house stand-in | owner-log-2026-11-13b#5 |
| piicorul corocilului albastru | draw | ro | I did not understand "piicorul corocilului albastru". For example: "Desenează o casă roșie." or "Desenează un  | the leg of the blue crocodile (a referent in the picture); never the document ed | owner-log-2026-11-13#39 |
| fa un cel cu 5 nori si un soare | draw | ro | I did not understand "fa un cel cu 5 nori si un soare". For example: "Desenează o casă roșie." or "Desenează u | a sky with 5 clouds and a sun | owner-log-2026-11-13b#13 |
| pune iraba pe sub case | draw | ro | I do not know what "iraba" is. You can say the house, the tree, the sun, it, or everything. [check: reply_not: | 'iraba' = 'iarba' (grass): put grass under the houses | owner-log-2026-11-13#55 |

### amount / relation / set distribution (19)

Classes: space 5, dialogue:degree 5, distribute 2, set-attribute 2, relation+no-partial 1, relation 1, place 1, distribute+typo 1

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| muta prima casa mai la stinga si mai jos | draw | ro | Look at that! I moved the house left. Nice! I moved the house down. | move the first house left and down, both directions, a small step each | owner-log-2026-11-13#64 |
| fa niste iarba deauspa lacului | draw | ro | Done! I drew a blue lake on the ground. | grass above the lake; nothing replaced | owner-log-2026-11-13b#9 |
| make random colours | draw | en | I did not understand "make random colours". Did you mean "Which colors make purple?" or "What color do blue an | each car a random colour | owner-log-2026-11-13c#11 |
| Make your body green. | robot | en | OK! My shirt is green now. [wrong] | state:robot.colors.body=69db7c (got 74c0fc) | dialogues#dlg.avt#004/0 |
| muta si mai la stinga | draw | ro | Voila! I moved the house left. | move the same house further left (follow-up on the last move) | owner-log-2026-11-13#65 |

### fragment / list split (10)

Classes: list 2, fragment 2, refine 1, repair 1, kind-of 1, list+constraint 1, dialogue:confirmation 1, dialogue:correction 1

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| sa fie diferite | draw | ro | I am not sure how “It is different” fits what we were doing. Please say the whole request. | make the 3 houses just drawn differ from each other (colour, size) | owner-log-2026-11-13#42 |
| o casa si 2 pesti | draw | ro | I am not sure how “A house” fits what we were doing. Please say the whole request. Here you go! I drew 2 orang | draw a house and 2 fish | owner-log-2026-11-13b#6 |
| eyeglasses | robot | en | I did not understand "eyeglasses". For example: "Try the next mouth." or "What character is on screen?" | glasses: add or ask which | owner-log-2026-11-13c#1 |
| Yes please. | robot | en | I am not sure how “Yes please” fits what we were doing. Please say the whole request. [not_understood] | state:character=person (got robot); state:person.facialHair!=none (got none); an | dialogues#dlg.avt#002/1 |
| crocodilii | draw | ro | I am not sure how “The crocodiles” fits what we were doing. Please say the whole request. | the user corrects the unknown word of the previous turn: redo 'move the crocodil | owner-log-2026-11-13#46 |

### foreign-world reading (9)

Classes: active-tab 2, self-repair 1, list 1, complaint 1, avatar-accessory+foreign-world 1, dialogue:noise 1, dialogue:correction 1, foreign-world-reading 1

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| an old woman | robot | en | I did not understand "an old woman". For example: "Try the next mouth." or "What character is on screen?" [che | on the Avatar tab after 'a person': become an old woman, or say what characters  | owner-log-2026-11-13#28 |
| fa-mu un desen cu un lac, o rata, o vila, nori, soare ,iarba | draw | ro | I did not understand "fa-mu un desen cu un lac, o rata, o vila, nori, soare ,iarba". Did you mean "Draw a diag | draw lake, duck, villa(house), clouds, sun, grass as one scene | owner-log-2026-11-13b#0 |
| put a hat | robot | en | Sure! I have a red cap now. | put a hat on the avatar; no art.draw | owner-log-2026-11-13c#5 |
| mke it a siren | robot | en | We are not playing hangman. Say "play hangman" to start. I understood only part of that: I did not use "make". | state:robot.top=siren (got antenna) | dialogues#dlg.avt#007/1 |
| could you maybe switch the instrument to flute | music | en | instrument stays piano (read as diagram.swap) | instrument=flute | test-world media.music sh04 |

### unknown kind (no drawing / stand-in) (7)

Classes: undefined 2, catalog 1, referent-kind 1, kind-of+relation 1, kind-of 1, default-place 1

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| deseneaza o minge | robot | ro | Ta-da! I drew a red circle. [check: reply_not:red circle] | draw a ball from the catalog, not a red circle | owner-log-2026-11-13#33 |
| muta copilul linga leagan, in stinga | draw | ro | Done! I moved the person on the left. | child = the person drawn; next to swing, left side | owner-log-2026-11-13b#25 |
| seat the penguins | seating | en | I don't know how to draw penguins yet. | the taught fact "penguins cannot fly" (taught in talk) is used or refused plainl | T2 taught-fact transfer (matrix) scripts/exp-trans |
| seat the penguins | seating | en | I don't know how to draw penguins yet. | the taught fact "penguins cannot fly" (taught in talk) is used or refused plainl | T2 taught-fact transfer (ops) scripts/exp-transfer |
| fa un bunic linga rata | draw | ro | I did not understand "fa un bunic linga rata". For example: "Desenează o casă roșie." or "Desenează un pește m | grandfather (person variant) next to the duck | owner-log-2026-11-13b#37 |

### region as a thing / ground replaced (7)

Classes: region 5, region-thing 2

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| draw a lake | draw | ro | Ta-da! I drew a blue lake. | a lake is a thing with a place and a size, not water over the whole ground | owner-log-2026-11-13#43 |
| deseneaza un lac | draw | ro | Ta-da! I drew a blue lake. | a lake as a thing in the scene, ground kept | owner-log-2026-11-13b#1 |
| muta casele deasupra lacului | draw | ro | Look at that! I moved the houses above the blue lake. | the lake was just drawn: it must be a thing with a place; move the houses above  | owner-log-2026-11-13#48 |
| fa si un lac mic in stinga | draw | ro | There are 2: the left lake and the right lake. Which one do you mean? | second, small lake on the left | owner-log-2026-11-13b#20 |
| muta casele deasupra apei | draw | ro | Nice! I moved the houses above the blue lake. | 'the water' = the lake; move the houses above it | owner-log-2026-11-13#49 |

### minimal pair (order) (6)

Classes: minimal-pair:order 6

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| mark Paris and then Rome | map | en | OK, I put a marker on Paris. Here is Rome: capital of Italy · 2.3 million people. [partly] | state:markers.1.name=Rome (got undefined) | minimal-pairs-2026-11-12#mp#087 |
| mark Rome and then Paris | map | en | OK, I put a marker on Rome. Here is Paris: capital of France · 2.1 million people. [partly] | state:markers.1.name=Paris (got undefined) | minimal-pairs-2026-11-12#mp#088 |
| move chapter 2 before chapter 3 | editor | en | Where should it go? You can say, for example, "move the tree to the left", "put the cat next to the house" or  | state:blocks.1.text==Chapter 3 (got Chapter 2); state:blocks.2.text==Chapter 2 ( | minimal-pairs-2026-11-12#mp#109 |
| move chapter 1 after chapter 2 | editor | en | Where should it go? You can say, for example, "move the tree to the left", "put the cat next to the house" or  | state:blocks.0.text==Chapter 2 (got Chapter 1); state:blocks.1.text==Chapter 1 ( | minimal-pairs-2026-11-12#mp#111 |
| swap the first and the second paragraph | editor | en | Your picture is empty. Try "draw a red house". [not_understood] | state:blocks.0.text==Two (got One.); state:blocks.1.text==One (got Two.) | minimal-pairs-2026-11-12#mp#115 |

### acted on a partly understood sentence (4)

Classes: wrong-action 3, variation 1

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| fă un layout mai frumos | diagram | ro | Drew a circle. [check: state:shapes.length=$+0 reply_not:Drew] | tidy the layout of the diagram; never draw a new circle | owner-log-2026-11-13#9 |
| make a better layout | diagram | en | Drew a circle. [check: state:shapes.length=$+0 reply_not:Drew] | same | owner-log-2026-11-13#13 |
| paint three new nodes | diagram | en | Done. But: What should change about circle 1, square 1, square 2, square 3, square 4, circle 2 and circle 3? T | add three new nodes to the diagram | owner-log-2026-11-13#23 |
| deseneaza 3 case diferite | draw | ro | Voila! I drew a gold house, a brown house and a yellow house. | draw 3 houses that differ in colour or size, not 3 identical ones | owner-log-2026-11-13#41 |

### avatar part not an operation of the avatar world (4)

Classes: avatar-accessory 3, avatar-accessory+typo 1

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| remove eyegases | robot | en | I can't find “eyegases” in the picture. The picture is empty. | remove the glasses of the avatar | owner-log-2026-11-13c#0 |
| remove eyeglasses | robot | en | I can't find “eyeglasses” in the picture. The picture is empty. | remove the glasses the avatar is drawn with | owner-log-2026-11-13c#3 |
| add eyeglasses | robot | en | I did not understand "add eyeglasses". Did you mean "add to my eyeglasses list" or "add eyeglasses to my list" | add glasses | owner-log-2026-11-13c#4 |
| put a hat | robot | en | Sure! I have a red cap now. | hat on the avatar | owner-log-2026-11-13c#32 |

### default place (3)

Classes: default-place 3

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| deseneaza o casa | draw | ro | There! I drew a yellow house. | house on the ground, not in water | owner-log-2026-11-13b#7 |
| deseneaza un soare | draw | ro | Look at that! I drew a yellow sun. | sun drawn in the sky | owner-log-2026-11-13b#17 |
| desenaza o vaca | draw | ro | I did not understand "desenaza o vaca". Did you mean "Desenaza este vaca mea" or "Desenaza este vaca"? I did n | cow on the ground | owner-log-2026-11-13b#49 |

### session as content (about the discussion) (3)

Classes: about-discussion 3

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| draw a nice chart a bout the current discussion | draw | en | I took that as: "a chart of draw nice and bout current as a discussion" I could not find numbers in "draw nice | a picture or chart summarising the conversation so far | owner-log-2026-11-13c#16 |
| create a chart about the current discussion | charts | en | I could not find numbers in "the current discussion". Say it like this: "make a chart: apples 5, pears 3, plum | a chart of the conversation (things drawn, counts) | owner-log-2026-11-13c#17 |
| Create a docuemnt about the current discussion | editor | en | I do not know a group of animals called "the current discussion". Try sea animals, farm animals, birds or inse | a document summarising the conversation | owner-log-2026-11-13c#19 |

### no reply (2)

Classes: silent+correction 1, silent 1

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| nu inlocui lacul, deasupra, ai loc | draw | ro | (no reply) | do not replace the lake; grass above it | owner-log-2026-11-13b#10 |
| muta vaca mai jos, sa nu mai zboare | draw | ro | (no reply) | cow lower, onto the ground | owner-log-2026-11-13b#50 |

### minimal pair (comparison) (2)

Classes: minimal-pair:comparison 2

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| make the cat bigger than the square | draw | en | I did not understand where to put it ("bigger than the square"). You can say, for example, "in the top right c | state:objects[kind=cat].size>@objects[kind=square].size (got 130) | minimal-pairs-2026-11-12#mp#077 |
| make the square bigger than the cat | draw | en | I did not understand where to put it ("bigger than the cat"). You can say, for example, "in the top right corn | state:objects[kind=square].size>@objects[kind=cat].size (got 130) | minimal-pairs-2026-11-12#mp#078 |

### minimal pair (direction) (2)

Classes: minimal-pair:direction 2

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| go from Berlin to Vienna | map | en | I did not understand "go from Berlin to Vienna". For example: "Show latitude 48.8 longitude 2.3." or "Is Paris | state:lines.0.from.name=Berlin (got undefined) | minimal-pairs-2026-11-12#mp#091 |
| go from Vienna to Berlin | map | en | I did not understand "go from Vienna to Berlin". For example: "Show latitude 48.8 longitude 2.3." or "Is Paris | state:lines.0.from.name=Vienna (got undefined) | minimal-pairs-2026-11-12#mp#092 |

### coherence (contradiction) (1)

Classes: coherence:contradiction 1

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| Tom has 3 apples. / Tom eats 5 apples. / How many apples does Tom have | robot | en | Tom has 3 apples. | Eating more than he has is impossible: flagged with the reason (conflicting), ne | coherence-2026-11-10#coh.arith.01 |

### coherence (default-revision) (1)

Classes: coherence:default-revision 1

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| Add milk to my list. / No, to my to-do list. / What is on my shopping  | robot | en | Your shopping list is empty. You can say: Add milk to my shopping list. | The correction moves the item: the shopping list is empty and the to-do list has | coherence-2026-11-10#coh.tasks.05 |

### coherence (deduce) (1)

Classes: coherence:deduce 1

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| Add milk, eggs and bread to my shopping list. / Remove eggs. / How man | robot | en | You have 3 things on your shopping list. | 2. | coherence-2026-11-10#coh.tasks.09 |

### coherence (assumption-visible) (1)

Classes: coherence:assumption-visible 1

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| I have 20 lei. / I buy the ball. / Three of them. / How much money do  | robot | en | You have 5 lei left. | 'Three of them' tells the count: the assumption is gone, the answer (5 lei) rest | coherence-2026-11-10#coh.shop.12 |

