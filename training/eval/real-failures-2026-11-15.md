# REAL failures by cause (2026-11-15)

Work list from real user turns only (owner logs a/b/c, voice and mobile phrase logs, real dialogues). Set: 651 turns (training/eval/real-2026-11-15.jsonl). Replayed in the SHIPPED configuration (mode shipped: formalizer encoder, the webchat's settings and send options; catalog at the pinned commit 7042ea706c04; seed 20261115; build e660d9a5, tree cc7c7800274f38dc), matrix reasoner (default); "both" = also failing on ops. Synthetic sets are secondary diagnostics, not targets. Built by `node scripts/real-set.mjs report`.

Headline (in scope, judged): 117/207 right (partly 6, wrong 84); 46 turns of retired records skipped. Diagnostic, rules formalizer only: 160/207.

Caveat: Romanian turns are replayed with the rules translator only (no browser Machine Translation in node: --bergamot runs the on-device model), so part of the Romanian causes is the missing translation backend, not the reader. Lazy world loading is not replayed (every world is loaded, as `?psys2lazy=0`).

Failing turns: matrix 413, ops 413 (0 fail on ops only). Ledger rows flagged real that are not turns of the set (feedback, live-demo findings): 1.

| # | cause | turns | both | examples |
| --- | --- | ---: | ---: | --- |
| 1 | Romanian turn not read (translation or reader) | 155 | 155 | "desenează o casă albă și una verde" (robot); "deseneaza o casa verde" (robot); "deseneaza o casa verde" (robot) |
| 2 | refused: the request names something the world does not support | 75 | 75 | "mcdavatara human" (robot); "now be a human" (robot); "a women" (robot) |
| 3 | translation residue / wrong sense / source typo | 30 | 30 | "desneaza o vila" (draw); "fa un cel cu 5 nori si un soare" (draw); "fa cerul alabastru" (draw) |
| 4 | judged wrong (state / answer expected is not there): dialogues:dlg.real | 24 | 24 | "draw a red circle" (diagram); "create a diagram" (diagram); "add a box" (diagram) |
| 5 | judged wrong (state / answer expected is not there): dialogues:dlg.rp3 | 21 | 21 | "make the avatar an emoji" (robot); "mcdavatara human" (robot); "make the avatar an emoji" (robot) |
| 6 | a world other than the open tab took the turn | 18 | 18 | "let’s play guess the animal" (guess); "draw a sun and a house" (tictactoe); "yes, it eats meat" (draw) |
| 7 | continuation / correction / why-question | 16 | 16 | "nu si peste apa" (draw); "pe lac" (draw); "nu inlocui lacul, deasupra, ai loc" (draw) |
| 8 | bare word or two-word fragment not read | 13 | 13 | "yes" (guess); "no" (guess); "yes" (guess) |
| 9 | acted on a partly understood sentence | 9 | 9 | "conectează toate formele" (diagram); "make a better layout" (diagram); "paint Street New nodes" (diagram) |
| 10 | amount / relation / set distribution | 9 | 9 | "fa niste iarba deauspa lacului" (draw); "deseneaza un copil pe leagan" (draw); "muta capra mai jos , si mai in stinga" (draw) |
| 11 | judged wrong (state / answer expected is not there): dialogues:dlg.ellipsis1 | 6 | 6 | "draw a green house and a yellow one" (draw); "add a red circle and a blue one" (draw); "draw a tree" (draw) |
| 12 | unknown word (a word of the request is not known) | 5 | 5 | "move corcodiles in lake" (draw); "si mai sus" (draw); "desene asta" (map) |
| 13 | foreign-world reading | 4 | 4 | "an old woman" (robot); "an old woman" (robot); "make it happy" (robot) |
| 14 | unknown kind (no drawing / stand-in) | 4 | 4 | "deseneaa un mic lac, o balta" (draw); "muta copilul linga leagan, in stinga" (draw); "fa un bunic linga rata" (draw) |
| 15 | judged wrong (state / answer expected is not there): dialogues:dlg.gaps | 4 | 4 | "would you say you are happy" (robot); "would you say you are sad" (robot); "whats on u" (robot) |

## In scope, judged wrong or partly, by cause (90 turns)

The headline's own failures (verdict wrong or partly), grouped by `judgedCause`: the area is the world the check names (else the tab's), the kind what went wrong. Every row id is listed.

| # | cause | turns | wrong | partly | both | rows (examples first) |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | diagram.sketch: acted; the state is not the expected one | 22 | 22 | 0 | 22 | r0014 "make a better layout" (diagram) -> "I added a square. I assumed square for the target. I assumed"; r0024 "paint three new nodes" (diagram) -> "I cannot do three new nodes in the diagram yet."; also r0552, r0557, r0558, r0561, r0562, r0567, r0568, r0569, r0570, r0575, r0576, r0577, r0578, r0579, r0580, r0581, r0582, r0583, r0584, r0585 |
| 2 | Romanian: art.draw: acted; the reply does not say what the check asks | 21 | 21 | 0 | 21 | r0038 "roteste crocodilul albastru la 30 de grade" (draw) -> "Nothing changed. There is no crocodile here. I could not do "; r0039 "fa picioarele corocilului negre" (draw) -> "I did not understand "legs", "corocilului" here."; also r0040, r0041, r0045, r0052, r0053, r0054, r0055, r0059, r0064, r0074, r0078, r0085, r0092, r0098, r0099, r0113, r0115, r0122, r0125 |
| 3 | ui.avatar: acted; the reply does not say what the check asks | 20 | 16 | 4 | 20 | r0029 "an old woman" (robot) -> "I did not understand that as something to do in the avatar."; r0032 "make it happy" (robot) -> "I did not understand "happy" here."; also r0511, r0512, r0513, r0514, r0515, r0516, r0517, r0518, r0520, r0521, r0522, r0523, r0525, r0592, r0593, r0595, r0596, r0645 |
| 4 | art.draw: acted; the state is not the expected one | 6 | 6 | 0 | 6 | r0631 "draw a green house and a yellow one" (draw) -> "I added a house."; r0632 "add a red circle and a blue one" (draw) -> "I cannot make circle in the drawing yet."; also r0633, r0634, r0635, r0636 |
| 5 | art.draw: acted; the reply does not say what the check asks | 4 | 4 | 0 | 4 | r0142 "10 cars" (draw) -> "I did not understand that as something to do in the drawing."; r0143 "1000 cars" (draw) -> "I did not understand that as something to do in the drawing."; also r0545, r0546 |
| 6 | docs.editor: acted; the state is not the expected one | 4 | 4 | 0 | 4 | r0527 "add a header, two chapters and a paragraph" (editor) -> "I understood "two chapters", "a paragraph", but not "add a h"; r0528 "add two chapters" (editor) -> "I added a story. I added 2 chapters. The story is called “Al"; also r0529, r0533 |
| 7 | diagram.sketch: acted; the reply does not say what the check asks | 3 | 1 | 2 | 3 | r0551 "draw a red circle" (diagram) -> "I added a red circle."; r0555 "add a box" (diagram) -> "I added a rectangle."; also r0564 |
| 8 | Romanian: art.draw: acted; the state is not the expected one | 2 | 2 | 0 | 2 | r0019 "for their grandma do it" (diagram) -> "The diagram now has 4 rectangles, 3 circles. I assumed diagr"; r0036 "inca un crocodil" (draw) -> "There is nothing in the drawing that I made and could change" |
| 9 | talk: another world took the turn (art.draw) | 2 | 2 | 0 | 2 | r0141 "draw a car" (talk) -> "I drew a red car."; r0147 "draw 2 elephants" (talk) -> "I drew 2 elephants." |
| 10 | diagram.sketch: acted; the status is not the expected one | 1 | 1 | 0 | 1 | r0563 "label link" (diagram) -> "Nothing changed. There is no link here." |
| 11 | docs.editor: acted; the reply does not say what the check asks | 1 | 1 | 0 | 1 | r0532 "on the new chapter" (editor) -> "I did not understand that as something to do in the document" |
| 12 | docs.editor: acted; the status is not the expected one | 1 | 1 | 0 | 1 | r0531 "are the new paragraph" (editor) -> "I cannot answer questions about the documents yet." |
| 13 | robot: acted; the reply does not say what the check asks | 1 | 1 | 0 | 1 | r0164 "make the avatar a angry boy" (robot) -> "I did not understand "angry" here." |
| 14 | Romanian: ui.avatar: acted; the reply does not say what the check asks | 1 | 1 | 0 | 1 | r0028 "an old woman" (robot) -> "I did not understand "year" here." |
| 15 | ui.avatar: acted; the state is not the expected one | 1 | 1 | 0 | 1 | r0646 "make the first sun blue" (draw) -> "I added a sun." |
