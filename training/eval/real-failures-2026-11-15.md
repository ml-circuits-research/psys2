# REAL failures by cause (2026-11-15)

Work list from real user turns only (owner logs a/b/c, voice and mobile phrase logs, real dialogues). Set: 651 turns (training/eval/real-2026-11-15.jsonl). Replayed in the SHIPPED configuration (mode shipped: formalizer encoder, the webchat's settings and send options; catalog at the pinned commit ab3b2ab868ba; seed 20261115; build 11cf72bf, tree cecf47720dbf180c), matrix reasoner (default); "both" = also failing on ops. Synthetic sets are secondary diagnostics, not targets. Built by `node scripts/real-set.mjs report`.

Headline (in scope, judged): 121/181 right (partly 12, wrong 48); retired line (ADR-010, clean refusal expected): 65/72. Diagnostic, rules formalizer only: 127/181.

Caveat: Romanian turns are replayed with the rules translator only (no browser Machine Translation in node: --bergamot runs the on-device model), so part of the Romanian causes is the missing translation backend, not the reader. Lazy world loading is not replayed (every world is loaded, as `?psys2lazy=0`).

Failing turns: matrix 284, ops 284 (0 fail on ops only). Ledger rows flagged real that are not turns of the set (feedback, live-demo findings): 1.

| # | cause | turns | both | examples |
| --- | --- | ---: | ---: | --- |
| 1 | Romanian turn not read (translation or reader) | 78 | 78 | "desenează o casă albă și una verde" (robot); "deseneaza o casa verde" (robot); "deseneaza o casa verde" (robot) |
| 2 | translation residue / wrong sense / source typo | 36 | 36 | "she knows what their grandma could trade charcoal Chicago" (diagram); "an old woman" (robot); "muta copilul deseneat anterior in stinga" (draw) |
| 3 | bare word or two-word fragment not read | 31 | 31 | "mcdavatara human" (robot); "yes" (guess); "no" (guess) |
| 4 | a world other than the open tab took the turn | 29 | 29 | "let’s play guess the animal" (guess); "draw a sun and a house" (tictactoe); "yes, it eats meat" (draw) |
| 5 | sentence not read by any world (no cause key) | 23 | 23 | "now be a human" (robot); "start x and 0" (tictactoe); "Become an emoji" (robot) |
| 6 | judged wrong (state / answer expected is not there): dialogues:dlg.rp3 | 15 | 15 | "make the avatar an emoji" (robot); "mcdavatara human" (robot); "make the avatar an emoji" (robot) |
| 7 | continuation / correction / why-question | 10 | 10 | "sa fie diferite" (draw); "nu inlocui lacul, deasupra, ai loc" (draw); "ar trebui sa schimbi aceste voila si ta-da ca faci numai pro" (draw) |
| 8 | amount / relation / set distribution | 10 | 10 | "muta si mai la stinga" (draw); "muta casa din mijloc mai la dreapta" (draw); "nu prima acasa, cea din mijloc" (draw) |
| 9 | judged wrong (state / answer expected is not there): dialogues:dlg.real | 9 | 9 | "draw a red circle" (diagram); "create a diagram" (diagram); "add a box" (diagram) |
| 10 | unknown word (a word of the request is not known) | 8 | 8 | "enervant da" (draw); "face un caca" (draw); "asta" (draw) |
| 11 | acted on a partly understood sentence | 6 | 6 | "fă un layout mai frumos" (diagram); "make a better layout" (diagram); "paint three new nodes" (diagram) |
| 12 | fragment / list split | 5 | 5 | "deseneaza si un magar, dar sa nu zboare, pe iarba" (draw); "eyeglasses" (robot); "a women" (robot) |
| 13 | judged wrong (state / answer expected is not there): dialogues:dlg.gaps | 5 | 5 | "would you say you are happy" (robot); "would you say you are sad" (robot); "what is on you" (robot) |
| 14 | judged wrong (state / answer expected is not there): dialogues:dlg.ellipsis1 | 5 | 5 | "add a red circle and a blue one" (draw); "draw a tree" (draw); "draw two cats and a big one" (draw) |
| 15 | unknown kind (no drawing / stand-in) | 4 | 4 | "deseneaa un mic lac, o balta" (draw); "muta copilul linga leagan, in stinga" (draw); "fa un bunic linga rata" (draw) |
