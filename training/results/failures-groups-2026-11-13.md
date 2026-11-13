# Failure groups (2026-11-13)

Ledger: `training/eval/failures.jsonl`, 846 rows. Produced by `node scripts/analyze-failures.mjs`. Rule (worker-tasks NO POINT FIXES): a change names a group below, is a general mechanism, and reports the group's count before and after plus what it broke elsewhere. The cause key is derived from the row's class and general signals in what happened (see `causeOf`), not from phrases.

## Rows per source

| source | rows |
| --- | --- |
| round-trip-cases-keep-2026-11-13 | 461 |
| E-T1 scripts | 129 |
| dialogues | 115 |
| owner-log-2026-11-13b | 52 |
| owner-log-2026-11-13 | 33 |
| world-routing-2026-11-13 | 25 |
| owner-log-2026-11-13c | 14 |
| minimal-pairs-2026-11-12 | 10 |
| coherence-2026-11-10 | 4 |
| E-T3 scripts | 3 |

## Groups by cause

| group | rows | share | regressions (was_passing) |
| --- | --- | --- | --- |
| roundtrip: translation changed meaning | 291 | 34.4% | 0 |
| roundtrip: translation kept meaning, reader gap | 151 | 17.8% | 0 |
| Talk: no fact in the catalog / frame not read | 132 | 15.6% | 0 |
| continuation / correction / why-question | 69 | 8.2% | 0 |
| dialogue: other turn kinds | 49 | 5.8% | 0 |
| wrong world routing (confusion pair) | 25 | 3.0% | 0 |
| translation residue / wrong sense / source typo | 22 | 2.6% | 0 |
| amount / relation / set distribution | 19 | 2.2% | 0 |
| roundtrip: answer wording only | 19 | 2.2% | 0 |
| fragment / list split | 10 | 1.2% | 0 |
| foreign-world reading | 8 | 0.9% | 0 |
| other / wrong result | 7 | 0.8% | 0 |
| region as a thing / ground replaced | 7 | 0.8% | 0 |
| minimal pair (order) | 6 | 0.7% | 0 |
| unknown kind (no drawing / stand-in) | 5 | 0.6% | 0 |
| acted on a partly understood sentence | 4 | 0.5% | 0 |
| avatar part not an operation of the avatar world | 4 | 0.5% | 0 |
| default place | 3 | 0.4% | 0 |
| session as content (about the discussion) | 3 | 0.4% | 0 |
| not understood (no cause key) | 2 | 0.2% | 0 |
| no reply | 2 | 0.2% | 0 |
| minimal pair (comparison) | 2 | 0.2% | 0 |
| minimal pair (direction) | 2 | 0.2% | 0 |
| coherence (contradiction) | 1 | 0.1% | 0 |
| coherence (default-revision) | 1 | 0.1% | 0 |
| coherence (deduce) | 1 | 0.1% | 0 |
| coherence (assumption-visible) | 1 | 0.1% | 0 |

### roundtrip: translation changed meaning (291)

Classes: roundtrip:mt-wrong 291

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| Donnez-moi des yeux en plus |  | fr | I do not know how to look like that. I understood only part of that: I did not use "more". [back-translation:  | give me plus shaped eyes -> ["robot.eyes=plus"] | round-trip-cases-keep-2026-11-13#ui.avatar#006/fr |
| Sirène sur le dessus |  | fr | I did not understand "Mermaid on the top". For example: "Try the next mouth." or "What character is on screen? | Siren on top -> ["robot.top=siren"] | round-trip-cases-keep-2026-11-13#ui.avatar#012/fr |
| ôtez la chose sur votre poitrine |  | fr | Where should it go? You can say, for example, "move the tree to the left", "put the cat next to the house" or  | remove the thing on your chest -> ["robot.chest=none"] | round-trip-cases-keep-2026-11-13#ui.avatar#018/fr |
| Faites tourner vos yeux |  | fr | I did not understand "Turn your eyes". For example: "Try the next mouth." or "What character is on screen?" [b | Make your eyes round -> ["robot.eyes=round"] | round-trip-cases-keep-2026-11-13#ui.avatar#024/fr |
| Retour en arrière une |  | fr | There is no previous tab to go back to. [back-translation: Back one] | go back one -> ["robot.mouth=smile"] | round-trip-cases-keep-2026-11-13#ui.avatar#060/fr |

### roundtrip: translation kept meaning, reader gap (151)

Classes: roundtrip:reader-gap 151

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| Ana a 8 crayons. Ben donne 6 crayons Ana. Combien de crayons Ana a-t-i |  | fr | OK, Ana has 8 crayons. I did not understand "Ben gives 6 Ana pencils". Did you mean "Ben bought a pencil." or  | Ana has 8 pencils. Ben gives Ana 6 pencils. How many pencils does Ana have? -> [ | round-trip-cases-keep-2026-11-13#kids.arith#067/fr |
| Tom a 11 crayons. Leo a 1 crayon. Combien de crayons ont-ils au total  |  | fr | OK, Tom has 11 crayons. OK, Leo has 1 pencil. There are 1 pencil altogether. [back-translation: Tom has 11 cra | Tom has 11 pencils. Leo has 1 pencil. How many pencils do they have altogether?  | round-trip-cases-keep-2026-11-13#kids.arith#073/fr |
| Ana a 13 autocollants. Tom donne l'autocollant Ana 1. Combien d'autoco |  | fr | OK, Ana has 13 stickers. I did not understand "Tom gives the sticker Ana 1". Did you mean "Ana gave Tom an app | Ana has 13 stickers. Tom gives Ana 1 sticker. How many stickers does Ana have? - | round-trip-cases-keep-2026-11-13#kids.arith#097/fr |
| que font le rouge et le jaune alors combien de côtés un hexagone a-t-i |  | fr | I did not understand "what do red and yellow do so how many sides does a hexagon have pls". Did you mean "What | what do red and yellow make then how many sides does a hexagon have pls -> ["ora | round-trip-cases-keep-2026-11-13#kids.shapes#011/f |
| Les manchots peuvent-ils voler et ensuite quel son une vache fait, que |  | fr | No, a penguin cannot fly. A cow goes moo. I did not understand "what do red". Did you mean "What do red and ye | can penguins fly and then what sound does a cow make, what do red and yellow mak | round-trip-cases-keep-2026-11-13#kids.animals#031/ |

### Talk: no fact in the catalog / frame not read (132)

Classes: undefined 132

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| Which is bigger, a train or a tent? | talk | en | I don't know that yet. [frame read, no fact in the local catalog] | an answer from the knowledge of the domain (things), with a card where the frame | E-T1 scripts/exp-talk.mjs (things, seed) |
| How many legs does a ant have? | talk | en | I don't know that yet. [frame read, no fact in the local catalog] | an answer from the knowledge of the domain (animals), with a card where the fram | E-T1 scripts/exp-talk.mjs (animals, seed) |
| What is cheese made of? | talk | en | I don't know that yet. [frame read, no fact in the local catalog] | an answer from the knowledge of the domain (food), with a card where the frame h | E-T1 scripts/exp-talk.mjs (food, seed) |
| Is Brazil big? | talk | en | I cannot talk about that here. I can talk about things you can draw, their parts and sizes, and the order of m | an answer from the knowledge of the domain (places), with a card where the frame | E-T1 scripts/exp-talk.mjs (places, seed) |
| How many moons does Mercury have? | talk | en | I don't know that yet. [frame read, no fact in the local catalog] | an answer from the knowledge of the domain (space), with a card where the frame  | E-T1 scripts/exp-talk.mjs (space, seed) |

### continuation / correction / why-question (69)

Classes: dialogue:confirmation 14, dialogue:reference 12, dialogue:clarification 11, dialogue:ellipsis 11, dialogue:correction 6, continuation 4, correction 3, dialogue:feedback 3

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| nu si peste apa | draw | ro | Nothing I just did reaches the lake. | the last action (blue sky) must not cover the water: undo that part only; not 'r | owner-log-2026-11-13#58 |
| pe lac | draw | ro | I did not understand "pe lac". Did you mean "Îl fă noapte." or "Fă soarele uriaș."? | move the duck (last thing) onto the lake | owner-log-2026-11-13b#3 |
| why? | charts | en | You said "1000 cars", so I answered it. What I answered: There! I drew 12 red cars (12 is plenty!). | why no chart: explain the last turn, not an older one | owner-log-2026-11-13c#18 |
| Zoe eats 8. How many marbles are left? | kids.arith | en | OK, Zoe ate 8 marbles. I did not understand "How many marbles are left". Did you mean "How many pieces are lef | answer:6 | dialogues#dlg.kidsA#010/1 |
| dar lasa lacul | draw | ro | The lake is still there as before. | keep the lake (the grass must not replace it); a constraint on the last action | owner-log-2026-11-13#62 |

### dialogue: other turn kinds (49)

Classes: dialogue:topic 15, dialogue:real 9, dialogue:noise 8, dialogue:explain 8, dialogue:multistep 6, dialogue:userfacts 3

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| what was the sum again? | kids.time | en | I did not understand "what was the sum again". Did you mean "What was the question?" or "What was your last mo | answer:12 | dialogues#dlg.kidsA#015/3 |
| lol ok and how many days r in a wek | kids.time | en | I did not understand "how many days r in a wek". Did you mean "How many days are in a week?" or "How many days | answer:7 | dialogues#dlg.kidsA#019/1 |
| how many things are on it? | kids.tasks | en | Your picture is empty. There is nothing in it yet. [wrong] | answer:2 | dialogues#dlg.kidsB#033/1 |
| Give yourself visor eyes. | robot | en | I do not know eyes like "visor". My eyes can be round, narrow or big. [wrong] | state:robot.eyes=visor (got round) | dialogues#dlg.avt#003/0 |
| Also a siren on top. | robot | en | I have no top on my face yet. I understood only part of that: I did not use "Also". [not_understood] | state:robot.top=siren (got antenna) | dialogues#dlg.avt#003/1 |

### wrong world routing (confusion pair) (25)

Classes: world-routing 25

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| (aggregate: 54 operational turns) | kids.arith | en | routed to ui.avatar by router B | stay in kids.arith | world-routing-2026-11-13#kids.arith -> ui.avatar |
| (aggregate: 51 operational turns) | kids.arith | en | routed to talk by router B | stay in kids.arith | world-routing-2026-11-13#kids.arith -> talk |
| (aggregate: 39 operational turns) | ui.avatar | en | routed to diagram.sketch by router B | stay in ui.avatar | world-routing-2026-11-13#ui.avatar -> diagram.sket |
| (aggregate: 38 operational turns) | art.draw | en | routed to diagram.sketch by router B | stay in art.draw | world-routing-2026-11-13#art.draw -> diagram.sketc |
| (aggregate: 36 operational turns) | kids.tasks | en | routed to docs.editor by router B | stay in kids.tasks | world-routing-2026-11-13#kids.tasks -> docs.editor |

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

### roundtrip: answer wording only (19)

Classes: roundtrip:judge-strict 19

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| qu'est-ce que 20 moins 8, qu'est-ce que 9 fois 3 pls |  | fr | It will be 8:20. 9 times 3 is 27. [back-translation: What is 20 mins 8, what is 9 times 3 pls] | what is 20 minus 8, what is 9 times 3 pls -> ["12","27"] | round-trip-cases-keep-2026-11-13#kids.arith#127/fr |
| des mots dans l'histoire ? |  | fr | I can't find Works in on any of your lists, so I cannot mark it as done. (I read "words" as "works") [back-tra | words in the story? -> ["685"] | round-trip-cases-keep-2026-11-13#docs.reader#006/f |
| Parole nella storia? |  | it | I can't find Works in on any of your lists, so I cannot mark it as done. (I read "words" as "works") [back-tra | words in the story? -> ["685"] | round-trip-cases-keep-2026-11-13#docs.reader#006/i |
| Entfernung Paris nach rom in km pls |  | de | Paris and Homs are about 3,215 km (1,998 miles) apart, as the crow flies. (I read "rom" as "hom") [back-transl | distance paris to rome in km pls -> ["1,107"] | round-trip-cases-keep-2026-11-13#geo.map#059/de |
| Was ist der relative Nebenfach von C-Moll |  | de | C minor is already minor. Its relative major is Eb major. [back-translation: What is the relative minor of C m | What is the relative minor of C major -> ["A minor"] | round-trip-cases-keep-2026-11-13#media.music#020/d |

### fragment / list split (10)

Classes: list 2, fragment 2, refine 1, repair 1, kind-of 1, list+constraint 1, dialogue:confirmation 1, dialogue:correction 1

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| sa fie diferite | draw | ro | I am not sure how “It is different” fits what we were doing. Please say the whole request. | make the 3 houses just drawn differ from each other (colour, size) | owner-log-2026-11-13#42 |
| o casa si 2 pesti | draw | ro | I am not sure how “A house” fits what we were doing. Please say the whole request. Here you go! I drew 2 orang | draw a house and 2 fish | owner-log-2026-11-13b#6 |
| eyeglasses | robot | en | I did not understand "eyeglasses". For example: "Try the next mouth." or "What character is on screen?" | glasses: add or ask which | owner-log-2026-11-13c#1 |
| Yes please. | robot | en | I am not sure how “Yes please” fits what we were doing. Please say the whole request. [not_understood] | state:character=person (got robot); state:person.facialHair!=none (got none); an | dialogues#dlg.avt#002/1 |
| crocodilii | draw | ro | I am not sure how “The crocodiles” fits what we were doing. Please say the whole request. | the user corrects the unknown word of the previous turn: redo 'move the crocodil | owner-log-2026-11-13#46 |

### foreign-world reading (8)

Classes: active-tab 2, self-repair 1, list 1, complaint 1, avatar-accessory+foreign-world 1, dialogue:noise 1, dialogue:correction 1

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| an old woman | robot | en | I did not understand "an old woman". For example: "Try the next mouth." or "What character is on screen?" [che | on the Avatar tab after 'a person': become an old woman, or say what characters  | owner-log-2026-11-13#28 |
| fa-mu un desen cu un lac, o rata, o vila, nori, soare ,iarba | draw | ro | I did not understand "fa-mu un desen cu un lac, o rata, o vila, nori, soare ,iarba". Did you mean "Draw a diag | draw lake, duck, villa(house), clouds, sun, grass as one scene | owner-log-2026-11-13b#0 |
| put a hat | robot | en | Sure! I have a red cap now. | put a hat on the avatar; no art.draw | owner-log-2026-11-13c#5 |
| mke it a siren | robot | en | We are not playing hangman. Say "play hangman" to start. I understood only part of that: I did not use "make". | state:robot.top=siren (got antenna) | dialogues#dlg.avt#007/1 |
| make it happy | robot | en | I am not sure how “make it happy” fits what we were doing. Please say the whole request. | on the Avatar tab: make the avatar happy; never the diagram | owner-log-2026-11-13#31 |

### other / wrong result (7)

Classes: repeat 2, typo-referent 2, help 1, part 1, add-synonym 1

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| cum pot schimba forma unei diagrame | diagram | ro | Which shape should I change? Name it, e.g. "change circle1". I understood only part of that: I did not use "Ho | say how to change the shape of a diagram node (an example of that), not generic  | owner-log-2026-11-13#17 |
| inca un crocodil | draw | ro | There! I drew a green crocodile. | add one more crocodile (repeat the last add) | owner-log-2026-11-13#35 |
| fa picioarele corocilului negre | draw | ro | Nice! The legs of the crocodile are black now. There are 3 crocodiles, so I took the last one. You can say "th | make the legs of the crocodile black; the imported crocodile has parts, name the | owner-log-2026-11-13#38 |
| move corcodiles in lake | draw | ro | Here you go! I moved the crocodiles in the blue lake. (I read "corcodiles" as "crocodiles") | 'corcodiles' is one edit from 'crocodiles', which are in the picture: move them  | owner-log-2026-11-13#44 |
| muta corcodilii in lac | draw | ro | There! I moved the crocodiles in the blue lake. (I read "corcodilii" as "crocodiles") | same: the crocodiles in the picture | owner-log-2026-11-13#45 |

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

### unknown kind (no drawing / stand-in) (5)

Classes: catalog 1, referent-kind 1, kind-of+relation 1, kind-of 1, default-place 1

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| deseneaza o minge | robot | ro | Ta-da! I drew a red circle. [check: reply_not:red circle] | draw a ball from the catalog, not a red circle | owner-log-2026-11-13#33 |
| muta copilul linga leagan, in stinga | draw | ro | Done! I moved the person on the left. | child = the person drawn; next to swing, left side | owner-log-2026-11-13b#25 |
| fa un bunic linga rata | draw | ro | I did not understand "fa un bunic linga rata". For example: "Desenează o casă roșie." or "Desenează un pește m | grandfather (person variant) next to the duck | owner-log-2026-11-13b#37 |
| deseneaza un bunic | draw | ro | I don't know how to draw a grandfather yet. | grandfather = old man person | owner-log-2026-11-13b#38 |
| deseneaza o capra | draw | ro | I don't know how to draw a goat yet. | goat on the ground | owner-log-2026-11-13b#40 |

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

### not understood (no cause key) (2)

Classes: part 1, typo 1

| text | tab | lang | happened | expected | source |
| --- | --- | --- | --- | --- | --- |
| fa piciorul corcodilului albastru de culoare neagra | draw | ro | I did not understand "fa piciorul corcodilului albastru de culoare neagra". Did you mean "Fă cerul albastru în | make the leg of the blue crocodile black; one request, nothing for the map; no w | owner-log-2026-11-13#40 |
| Chnage the tile of the document to Disucssion | editor | en | I could not find "the tile of the document" in the document. (I read "chnage" as "change") | set the document title to Discussion | owner-log-2026-11-13c#20 |

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

