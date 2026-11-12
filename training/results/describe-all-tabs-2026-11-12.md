# DESCRIBE-ALL for the game and tab worlds (2026-11-12, partial)

Done: games.tictactoe, games.hangman, games.guess (one commit each). Not done for lack of time: games.chess, media.music, data.charts, docs.reader, ui.avatar, ui.shell, ui.help, art.draw, diagram.sketch. Data: `describe-all-tabs-2026-11-12.json`. Descriptions are English only, wires and plain/repeated keys only (spec 03 section 2c). The files were produced by a script kept outside the repository (the words are mined from the alternatives of the hand-written patterns); the output is plain SOP Lang. Default behaviour is unchanged: `describe.sop` is read only with `PSYS_GEN_PATTERNS=add|only`.

Measured with `scripts/e1-collect.mjs --mode rules --sets operational,dialogues` and `scripts/e3-compare.mjs --worlds <world>`; triple = right / wrong / not understood; "audited" = the cases of that world. Plus the world's own `tests.sop` through `test-world`.

| world | set | hand-written | `add` | `only` |
| --- | --- | --- | --- | --- |
| games.tictactoe | operational (43) | 40 / 0 / 3 | 41 / 0 / 2 | 40 / 0 / 3 |
| games.tictactoe | dialogues (72) | 72 / 0 / 0 | 72 / 0 / 0 | 72 / 0 / 0 |
| games.tictactoe | tests.sop (173) | 173 | 173 | 147 |
| games.hangman | operational (32) | 31 / 1 / 0 | 31 / 1 / 0 | 31 / 1 / 0 |
| games.hangman | dialogues (60) | 60 / 0 / 0 | 60 / 0 / 0 | 60 / 0 / 0 |
| games.hangman | tests.sop (154) | 154 | 154 | 147 |
| games.guess | operational (32) | 32 / 0 / 0 | 32 / 0 / 0 | 31 / 0 / 1 |
| games.guess | dialogues (69) | 69 / 0 / 0 | 69 / 0 / 0 | 67 / 0 / 2 |
| games.guess | tests.sop (130) | 130 | 130 | 123 |

**Gate (no new wrong answers in `add`): met for all three worlds**, after rewriting three guess descriptions that first produced new wrong answers (see gap 2). `only` has no new wrong answers either; its losses are all "right to not understood". `add` also gains one case: tictactoe "put me in the upper right corner" (was read by art.draw).

## Replaceable lines, and the size of the descriptions

| world | hand-written pattern lines of described operations | description lines | of which `core.word` wires |
| --- | --- | --- | --- |
| games.tictactoe | 705 of 719 (103 blocks) | 2,177 | 907 |
| games.hangman | 638 of 638 (96) | 3,394 | 1,354 |
| games.guess | 500 of 500 (74) | 11,939 | 5,411 |

Every hand-written line of these worlds belongs to a described operation, so the descriptions could replace all of them, modulo the gaps below. **But these worlds are not made shorter by descriptions: the descriptions are 3 to 24 times longer than the patterns.** The hand-written patterns are mass-generated phrase lists (one line holds a group of 30 to 60 whole phrases); a description spends one `core.word` wire and one role line per phrase, and a product of two lists for verb x noun. The abstraction pays where one description generates many shapes (kids.shop: 2,936 lines of patterns against 127), not where a world is a flat list of paraphrases. The rebuilt webchat bundle (`docs/webchat/worlds/index.json`) grows from 5.2 MB to 6.4 MB because it carries `describe.sop`. A role value with many alternatives in one value would fix the size but breaks "one word, one wire": a question for the reviewer.

## Description gaps that caused losses in `only` (or new wrong answers in `add` while writing)

1. **Verb-optional commands (bare position).** The hand-written patterns have every word optional except the slot ("top left", "the left side of the middle row", "um, top right I think"). The generator's `short` frame is the only verb-free form and routing drops it at tier 5 by design, so the `tests.sop` cases that run outside the tab (`n01` to `n17`, ten `sw*b` position cases) are lost in `only`: 16 of the 26 tictactoe losses. Not a bug; a decision on whether bare position phrases may reach other tabs.
2. **Mandatory words around an argument.** `unit.<arg>`, `prep.<arg>` and the noun of a query are optional in every frame, but several hand-written patterns require them ("the animal was X, add it", "i meant X", "which letters did I try": the noun). Written naively they gave new wrong answers in `add`: "yse" and "thanks" read as the animal to learn, "no, the editor." read as a qualified answer, "what did you ask?" read as the question count, "make me a sandwich" as a hangman word, "sorry, I meant o" as a reveal (and, through it, a wrong dialogue turn in hangman). Fixed by folding the mandatory word into the opener or verb phrase, and by leaving out the two reveal forms with a mandatory trailing phrase (`guess.reveal`, `sw.rev.tail*`, `sw.rev.short`). A frame key for "mandatory" would allow them.
3. **Patterns with 3 to 6 groups** (tictactoe `sw.place` "what would you do in my place", `sw.lastone`, hint variants "any tip for my move", "which move is good for me"; hangman "which letters did I try" earlier, "start a hangman game with the word tiger" earlier; guess "why is that question being asked"): a description reproduces them only as a product of lists; the ones left narrow are the remaining `only` losses (tictactoe `tests.sop`: 7 hint and 3 last/board cases; guess: 3 cases; hangman: `sw006b`, `sw014b`, `sw018b`, `sw027b` and three word-choice cases).
4. **Open class `word`.** `{w:word}` matches any token, so a frame with an optional verb or noun and a `word` slot over-matches. A `word` argument needs a mandatory verb and noun.
5. **One description per fixed value.** `ttt.level` easy / perfect, `ttt.first` user / system, `guess.correct` x4 are one description each (the `emit` carries the value); the same number of blocks as the hand-written files.

## Notes
- `PSYS_GEN_PATTERNS=add|only test-world` prints legend problems about the keys of `describe.sop` ("expected string, got a reference") for every world, kids.shop included; they exist on main and do not change the results.
- The combined `only` runs also contain the changes caused by the existing E3 descriptions of kids.shop, geo.map and docs.editor (19 right to not understood, 11 right to wrong); they are the same in every run and are not attributed to these worlds.
