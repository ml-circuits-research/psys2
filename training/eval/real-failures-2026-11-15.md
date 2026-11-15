# REAL failures by cause (2026-11-15)

Work list from real user turns only (owner logs a/b/c, voice and mobile phrase logs, real dialogues). Set: 651 turns (training/eval/real-2026-11-15.jsonl). Replayed in the SHIPPED configuration (mode shipped: formalizer encoder, the webchat's settings and send options; catalog at the pinned commit ab3b2ab868ba; seed 20261115; build e838d108, tree dd1c47bb365b0b58), matrix reasoner (default); "both" = also failing on ops. Synthetic sets are secondary diagnostics, not targets. Built by `node scripts/real-set.mjs report`.

Headline (in scope, judged): 131/181 right (partly 13, wrong 37); retired line (ADR-010, clean refusal expected): 64/72. Diagnostic, rules formalizer only: 129/181.

Caveat: Romanian turns are replayed with the rules translator only (no browser Machine Translation in node: --bergamot runs the on-device model), so part of the Romanian causes is the missing translation backend, not the reader. Lazy world loading is not replayed (every world is loaded, as `?psys2lazy=0`).

Failing turns: matrix 242, ops 242 (0 fail on ops only). Ledger rows flagged real that are not turns of the set (feedback, live-demo findings): 1.

| # | cause | turns | both | examples |
| --- | --- | ---: | ---: | --- |
| 1 | Romanian turn not read (translation or reader) | 66 | 66 | "desenează o casă albă și una verde" (robot); "deseneaza o casa verde" (robot); "deseneaza o casa verde" (robot) |
| 2 | bare word or two-word fragment not read | 30 | 30 | "mcdavatara human" (robot); "yes" (guess); "no" (guess) |
| 3 | translation residue / wrong sense / source typo | 27 | 27 | "she knows what their grandma could trade charcoal Chicago" (diagram); "an old woman" (robot); "desneaza o capra" (draw) |
| 4 | sentence not read by any world (no cause key) | 26 | 26 | "now be a human" (robot); "let’s play guess the animal" (guess); "start x and 0" (tictactoe) |
| 5 | a world other than the open tab took the turn | 25 | 25 | "draw a sun and a house" (tictactoe); "yes, it eats meat" (draw); "Tom has 15 apples. He gives 12 to Ana. How many apples does " (robot) |
| 6 | judged wrong (state / answer expected is not there): dialogues:dlg.rp3 | 15 | 15 | "make the avatar an emoji" (robot); "mcdavatara human" (robot); "make the avatar an emoji" (robot) |
| 7 | judged wrong (state / answer expected is not there): dialogues:dlg.real | 9 | 9 | "draw a red circle" (diagram); "create a diagram" (diagram); "add a box" (diagram) |
| 8 | continuation / correction / why-question | 8 | 8 | "sa fie diferite" (draw); "ar trebui sa schimbi aceste voila si ta-da ca faci numai pro" (draw); "cum ai ajuns a deschisi joculd e sah? e ridicol" (chess) |
| 9 | unknown word (a word of the request is not known) | 8 | 8 | "enervant da" (draw); "face un caca" (draw); "asta" (draw) |
| 10 | fragment / list split | 5 | 5 | "eyeglasses" (robot); "a women" (robot); "new game" (guess) |
| 11 | judged wrong (state / answer expected is not there): dialogues:dlg.gaps | 5 | 5 | "would you say you are happy" (robot); "would you say you are sad" (robot); "what is on you" (robot) |
| 12 | acted on a partly understood sentence | 4 | 4 | "paint three new nodes" (diagram); "a person" (robot); "what character is on screen" (robot) |
| 13 | amount / relation / set distribution | 4 | 4 | "muta si mai la stinga" (draw); "muta casa din mijloc mai la dreapta" (draw); "nu prima acasa, cea din mijloc" (draw) |
| 14 | judged wrong (state / answer expected is not there): dialogues:dlg.ellipsis1 | 3 | 3 | "draw two cats and a big one" (draw); "draw a house and another yellow one" (draw); "draw a sun" (draw) |
| 15 | Talk: no fact in the catalog / frame not read | 2 | 2 | "draw a car" (talk); "draw 2 elephants" (talk) |
