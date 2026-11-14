# REAL failures by cause (2026-11-15)

Work list from real user turns only (owner logs a/b/c, voice and mobile phrase logs, real dialogues). Set: 649 turns (training/eval/real-2026-11-15.jsonl). Replayed on the current main, matrix reasoner (default); "both" = also failing on ops. Synthetic sets are secondary diagnostics, not targets. Built by `node scripts/real-set.mjs report`.

Caveat: Romanian turns are replayed with the rules translator only (no browser Machine Translation in node), so part of the Romanian causes (1, 2) is the missing translation backend, not the reader.

Failing turns: matrix 190, ops 190 (0 fail on ops only). Ledger rows flagged real that are not turns of the set (feedback, live-demo findings): 1.

| # | cause | turns | both | examples |
| --- | --- | ---: | ---: | --- |
| 1 | Romanian turn not read (translation or reader) | 46 | 46 | "muta crocodilii mai jos" (draw); "pune si un lac" (draw); "muta capra mai jos" (draw) |
| 2 | translation residue / wrong sense / source typo | 31 | 31 | "she knows what their grandma could trade charcoal Chicago" (diagram); "an old woman" (robot); "capra zoboara, fixeaza" (draw) |
| 3 | sentence not read by any world (no cause key) | 17 | 17 | "now be a human" (robot); "Become an emoji" (robot); "how many legs has a cow" (robot) |
| 4 | judged wrong (state / answer expected is not there): dialogues:dlg.rp3 | 15 | 15 | "make the avatar an emoji" (robot); "mcdavatara human" (robot); "make the avatar an emoji" (robot) |
| 5 | fragment / list split | 13 | 13 | "eyeglasses" (robot); "tata" (draw); "enervant da" (draw) |
| 6 | judged wrong (state / answer expected is not there): dialogues:dlg.real | 11 | 11 | "Sînică" (robot); "coming back to knowing me, what questions do you have?" (robot); "draw a red circle" (diagram) |
| 7 | a world other than the open tab took the turn | 9 | 9 | "a women" (robot); "Tom has 15 apples. He gives 12 to Ana. How many apples does " (robot); "Tom has 5 apples. He gives 8 to Ana. How many apples does To" (robot) |
| 8 | continuation / correction / why-question | 8 | 8 | "ar trebui sa schimbi aceste voila si ta-da ca faci numai pro" (draw); "cum ai ajuns a deschisi joculd e sah? e ridicol" (chess); "mai jos, sta pe leagan nu pe el" (draw) |
| 9 | foreign-world reading | 6 | 6 | "an old woman" (robot); "ce" (tictactoe); "b1" (robot) |
| 10 | bare word or two-word fragment not read | 6 | 6 | "mcdavatara human" (robot); "20" (profile); "What?" (profile) |
| 11 | judged wrong (state / answer expected is not there): dialogues:dlg.gaps | 6 | 6 | "would you say you are happy" (robot); "would you say you are sad" (robot); "whats on u" (robot) |
| 12 | acted on a partly understood sentence | 5 | 5 | "fă un layout mai frumos" (diagram); "make a better layout" (diagram); "paint three new nodes" (diagram) |
| 13 | amount / relation / set distribution | 4 | 4 | "muta si mai la stinga" (draw); "nu prima acasa, cea din mijloc" (draw); "muta capra mai jos , si mai in stinga" (draw) |
| 14 | Talk: no fact in the catalog / frame not read | 3 | 3 | "what is a monster?" (talk); "what is an elephant?" (talk); "draw 2 elephants" (talk) |
| 15 | unknown word (a word of the request is not known) | 3 | 3 | "face un caca" (draw); "desene asta" (map); "desene asta o" (map) |
