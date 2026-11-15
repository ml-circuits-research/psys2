# REAL failures by cause (2026-11-15)

Work list from real user turns only (owner logs a/b/c, voice and mobile phrase logs, real dialogues). Set: 651 turns (training/eval/real-2026-11-15.jsonl). Replayed in the SHIPPED configuration (mode shipped: formalizer encoder, the webchat's settings and send options; catalog at the pinned commit 085bc0dab1f6; seed 20261115; build da4b980e, tree fa34eb662f91d99a), matrix reasoner (default); "both" = also failing on ops. Synthetic sets are secondary diagnostics, not targets. Built by `node scripts/real-set.mjs report`.

Headline (in scope, judged): 177/207 right (partly 9, wrong 21); 46 turns of retired records skipped. Diagnostic, rules formalizer only: 160/207.

Caveat: Romanian turns are replayed with the rules translator only (no browser Machine Translation in node: --bergamot runs the on-device model), so part of the Romanian causes is the missing translation backend, not the reader. Lazy world loading is not replayed (every world is loaded, as `?psys2lazy=0`).

Failing turns: matrix 232, ops 232 (0 fail on ops only). Ledger rows flagged real that are not turns of the set (feedback, live-demo findings): 1.

| # | cause | turns | both | examples |
| --- | --- | ---: | ---: | --- |
| 1 | Romanian turn not read (translation or reader) | 63 | 63 | "desenează o casă albă și una verde" (robot); "deseneaza o casa verde" (robot); "deseneaza o casa verde" (robot) |
| 2 | bare word or two-word fragment not read | 32 | 32 | "mcdavatara human" (robot); "yes" (guess); "no" (guess) |
| 3 | sentence not read by any world (no cause key) | 31 | 31 | "now be a human" (robot); "become a women" (robot); "let’s play guess the animal" (guess) |
| 4 | translation residue / wrong sense / source typo | 28 | 28 | "an old woman" (robot); "desneaza o capra" (draw); "fii în boi" (robot) |
| 5 | a world other than the open tab took the turn | 25 | 25 | "draw a sun and a house" (tictactoe); "yes, it eats meat" (draw); "Tom has 15 apples. He gives 12 to Ana. How many apples does " (robot) |
| 6 | judged wrong (state / answer expected is not there): dialogues:dlg.real | 9 | 9 | "draw a red circle" (diagram); "create a diagram" (diagram); "add a box" (diagram) |
| 7 | unknown word (a word of the request is not known) | 8 | 8 | "enervant da" (draw); "face un caca" (draw); "asta" (draw) |
| 8 | continuation / correction / why-question | 7 | 7 | "ar trebui sa schimbi aceste voila si ta-da ca faci numai pro" (draw); "cum ai ajuns a deschisi joculd e sah? e ridicol" (chess); "mai jos, sta pe leagan nu pe el" (draw) |
| 9 | judged wrong (state / answer expected is not there): dialogues:dlg.rp3 | 7 | 7 | "mcdavatara human" (robot); "tongue out" (robot); "add two chapters" (editor) |
| 10 | fragment / list split | 5 | 5 | "eyeglasses" (robot); "a women" (robot); "new game" (guess) |
| 11 | acted on a partly understood sentence | 4 | 4 | "paint three new nodes" (diagram); "a person" (robot); "what character is on screen" (robot) |
| 12 | judged wrong (state / answer expected is not there): dialogues:dlg.gaps | 3 | 3 | "would you say you are happy" (robot); "would you say you are sad" (robot); "what is on you" (robot) |
| 13 | judged wrong (state / answer expected is not there): dialogues:dlg.ellipsis1 | 3 | 3 | "draw two cats and a big one" (draw); "draw a house and another yellow one" (draw); "draw a sun" (draw) |
| 14 | Talk: no fact in the catalog / frame not read | 2 | 2 | "draw a car" (talk); "draw 2 elephants" (talk) |
| 15 | foreign-world reading | 1 | 1 | "an old woman" (robot) |

## In scope, judged wrong or partly, by cause (30 turns)

The headline's own failures (verdict wrong or partly), grouped by `judgedCause`: the area is the world the check names (else the tab's), the kind what went wrong. Every row id is listed.

| # | cause | turns | wrong | partly | both | rows (examples first) |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | diagram.sketch: acted; the reply does not say what the check asks | 6 | 0 | 6 | 6 | r0551 "draw a red circle" (diagram) -> "Drew a circle."; r0555 "add a box" (diagram) -> "Drew a rectangle."; also r0557, r0561, r0569, r0582 |
| 2 | ui.avatar: not understood | 4 | 4 | 0 | 4 | r0029 "an old woman" (robot) -> "I did not understand "an old woman". For example: "Add a hat"; r0512 "mcdavatara human" (robot) -> "I did not understand "mcdavatara human". For example: "Add a"; also r0523, r0595 |
| 3 | art.draw: acted; the state is not the expected one | 3 | 3 | 0 | 3 | r0634 "draw two cats and a big one" (draw) -> "I drew 2 orange cats."; r0635 "draw a house and another yellow one" (draw) -> "I drew a yellow house. I made a copy of the house."; also r0636 |
| 4 | diagram.sketch: acted; the state is not the expected one | 2 | 2 | 0 | 2 | r0024 "paint three new nodes" (diagram) -> "What should change about circle 1, square 1, square 2, squar"; r0552 "create a diagram" (diagram) -> "I drew a random timeline diagram with four shapes. It is abo" |
| 5 | docs.editor: acted; the state is not the expected one | 2 | 1 | 1 | 2 | r0528 "add two chapters" (editor) -> "OK, I started chapter 3."; r0529 "add text" (editor) -> "What text should I add?" |
| 6 | talk: another world took the turn (art.draw) | 2 | 2 | 0 | 2 | r0141 "draw a car" (talk) -> "I drew a red car."; r0147 "draw 2 elephants" (talk) -> "I drew 2 elephants." |
| 7 | ui.avatar: acted; the reply does not say what the check asks | 2 | 1 | 1 | 2 | r0596 "what is on you" (robot) -> "There is no you here."; r0645 "make your eyes blue" (draw) -> "An eyes is a kind of thing. The sun is blue now. There are 3" |
| 8 | ui.avatar: another world took the turn (docs.editor) | 2 | 2 | 0 | 2 | r0592 "would you say you are happy" (robot) -> "I could not find "you are happy" in the document."; r0593 "would you say you are sad" (robot) -> "I could not find "you are sad" in the document." |
| 9 | art.draw: acted; the reply does not say what the check asks | 1 | 0 | 1 | 1 | r0545 "the un si up not udner clouds" (draw) -> "I drew 3 clouds." |
| 10 | diagram.sketch: another world took the turn (art.draw) | 1 | 1 | 0 | 1 | r0578 "make the arrow between A and B red and two-way" (diagram) -> "I can not find a red thing in your picture. Your picture is " |
| 11 | diagram.sketch: not understood | 1 | 1 | 0 | 1 | r0564 "lable arraw between circle1 and rectangle1" (diagram) -> "I did not catch what to do with arrow. I can add, remove, ch" |
| 12 | docs.editor: acted; the reply does not say what the check asks | 1 | 1 | 0 | 1 | r0532 "on the new chapter" (editor) -> "I could not find "new chapter" in the document." |
| 13 | docs.editor: not understood | 1 | 1 | 0 | 1 | r0533 "Chester" (editor) -> "I did not understand "Chester". Did you mean "Center."?" |
| 14 | Romanian: art.draw: acted; the reply does not say what the check asks | 1 | 1 | 0 | 1 | r0039 "fa picioarele corocilului negre" (draw) -> "I can not find a leg in your picture." |
| 15 | Romanian: ui.avatar: not understood | 1 | 1 | 0 | 1 | r0028 "an old woman" (robot) -> "I did not understand "an old woman". For example: "Add a hat" |
