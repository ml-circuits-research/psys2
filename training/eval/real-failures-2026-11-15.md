# REAL failures by cause (2026-11-15)

Work list from real user turns only (owner logs a/b/c, voice and mobile phrase logs, real dialogues). Set: 649 turns (training/eval/real-2026-11-15.jsonl). Replayed on the current main, matrix reasoner (default); "both" = also failing on ops. Synthetic sets are secondary diagnostics, not targets. Built by `node scripts/real-set.mjs report`.

Caveat: Romanian turns are replayed with the rules translator only (no browser Machine Translation in node), so part of the Romanian causes (1, 2) is the missing translation backend, not the reader.

Failing turns: matrix 255, ops 255 (0 fail on ops only). Ledger rows flagged real that are not turns of the set (feedback, live-demo findings): 1.

| # | cause | turns | both | examples |
| --- | --- | ---: | ---: | --- |
| 1 | Romanian turn not read (translation or reader) | 44 | 44 | "muta crocodilii mai jos" (draw); "pune si un lac" (draw); "muta capra mai jos" (draw) |
| 2 | judged wrong (state / answer expected is not there): dialogues:dlg.real | 34 | 34 | "get to know me" (profile); "Sînică" (profile); "Researcher" (profile) |
| 3 | translation residue / wrong sense / source typo | 33 | 33 | "she knows what their grandma could trade charcoal Chicago" (diagram); "an old woman" (robot); "ar trebui sa schimbi aceste voila si ta-da ca faci numai pro" (draw) |
| 4 | sentence not read by any world (no cause key) | 23 | 23 | "now be a human" (robot); "let’s play guess the animal" (guess); "yes, it eats meat" (draw) |
| 5 | bare word or two-word fragment not read | 21 | 21 | "mcdavatara human" (robot); "yes" (guess); "no" (guess) |
| 6 | judged wrong (state / answer expected is not there): dialogues:dlg.rp3 | 21 | 21 | "make the avatar an emoji" (robot); "mcdavatara human" (robot); "make the avatar an emoji" (robot) |
| 7 | judged wrong (state / answer expected is not there): dialogues:dlg.gaps | 12 | 12 | "would you say you are happy" (robot); "would you say you are sad" (robot); "whats on u" (robot) |
| 8 | judged wrong (state / answer expected is not there): dialogues:dlg.cb-c | 10 | 10 | "I like chess, music and maps" (null); "I have two kids" (null); "I am 45 years old" (null) |
| 9 | judged wrong (state / answer expected is not there): dialogues:dlg.gaps1 | 9 | 9 | "let's play tic tac toe" (tictactoe); "best move for me?" (tictactoe); "what should I play?" (tictactoe) |
| 10 | continuation / correction / why-question | 7 | 7 | "cum ai ajuns a deschisi joculd e sah? e ridicol" (chess); "mai jos, sta pe leagan nu pe el" (draw); "nu ai desenat o feita tu mai inainte?" (draw) |
| 11 | judged wrong (state / answer expected is not there): owner-log-2026-11-13c | 6 | 6 | "i" (hangman); "o" (hangman); "u" (hangman) |
| 12 | a world other than the open tab took the turn | 6 | 6 | "Tom has 15 apples. He gives 12 to Ana. How many apples does " (robot); "Tom has 5 apples. He gives 8 to Ana. How many apples does To" (robot); "Tom has 10 bees. One flyes away. How many bee Tom has ?" (robot) |
| 13 | unknown word (a word of the request is not known) | 6 | 6 | "joc a unu" (tictactoe); "enervant da" (draw); "face un caca" (draw) |
| 14 | acted on a partly understood sentence | 5 | 5 | "fă un layout mai frumos" (diagram); "make a better layout" (diagram); "paint three new nodes" (diagram) |
| 15 | foreign-world reading | 5 | 5 | "an old woman" (robot); "start a hangman game" (editor); "new game" (guess) |
