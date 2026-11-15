# REAL failures by cause (2026-11-15)

Work list from real user turns only (owner logs a/b/c, voice and mobile phrase logs, real dialogues). Set: 651 turns (training/eval/real-2026-11-15.jsonl). Replayed on the current main, matrix reasoner (default); "both" = also failing on ops. Synthetic sets are secondary diagnostics, not targets. Built by `node scripts/real-set.mjs report`.

Caveat: Romanian turns are replayed with the rules translator only (no browser Machine Translation in node), so part of the Romanian causes (1, 2) is the missing translation backend, not the reader.

Failing turns: matrix 243, ops 243 (0 fail on ops only). Ledger rows flagged real that are not turns of the set (feedback, live-demo findings): 1.

| # | cause | turns | both | examples |
| --- | --- | ---: | ---: | --- |
| 1 | Romanian turn not read (translation or reader) | 69 | 69 | "desenează o casă albă și una verde" (robot); "deseneaza o casa verde" (robot); "deseneaza o casa verde" (robot) |
| 2 | translation residue / wrong sense / source typo | 32 | 32 | "she knows what their grandma could trade charcoal Chicago" (diagram); "an old woman" (robot); "ar trebui sa schimbi aceste voila si ta-da ca faci numai pro" (draw) |
| 3 | sentence not read by any world (no cause key) | 28 | 28 | "now be a human" (robot); "let’s play guess the animal" (guess); "yes, it eats meat" (draw) |
| 4 | a world other than the open tab took the turn | 26 | 26 | "a women" (robot); "draw a sun and a house" (tictactoe); "Tom has 15 apples. He gives 12 to Ana. How many apples does " (robot) |
| 5 | bare word or two-word fragment not read | 24 | 24 | "mcdavatara human" (robot); "yes" (guess); "no" (guess) |
| 6 | judged wrong (state / answer expected is not there): dialogues:dlg.rp3 | 15 | 15 | "make the avatar an emoji" (robot); "mcdavatara human" (robot); "make the avatar an emoji" (robot) |
| 7 | judged wrong (state / answer expected is not there): dialogues:dlg.real | 9 | 9 | "draw a red circle" (diagram); "create a diagram" (diagram); "add a box" (diagram) |
| 8 | continuation / correction / why-question | 7 | 7 | "cum ai ajuns a deschisi joculd e sah? e ridicol" (chess); "mai jos, sta pe leagan nu pe el" (draw); "nu ai desenat o feita tu mai inainte?" (draw) |
| 9 | unknown word (a word of the request is not known) | 6 | 6 | "enervant da" (draw); "asta" (draw); "desene asta" (map) |
| 10 | judged wrong (state / answer expected is not there): dialogues:dlg.gaps | 6 | 6 | "would you say you are happy" (robot); "would you say you are sad" (robot); "whats on u" (robot) |
| 11 | acted on a partly understood sentence | 4 | 4 | "paint three new nodes" (diagram); "a person" (robot); "what character is on screen" (robot) |
| 12 | amount / relation / set distribution | 4 | 4 | "muta si mai la stinga" (draw); "nu prima acasa, cea din mijloc" (draw); "muta capra mai jos , si mai in stinga" (draw) |
| 13 | Talk: no fact in the catalog / frame not read | 4 | 4 | "what is a monster?" (talk); "draw a car" (talk); "what is an elephant?" (talk) |
| 14 | unknown kind (no drawing / stand-in) | 2 | 2 | "deseneaza o minge" (robot); "fa un bunic linga rata" (draw) |
| 15 | fragment / list split | 2 | 2 | "eyeglasses" (robot); "turn it in a human again" (robot) |
