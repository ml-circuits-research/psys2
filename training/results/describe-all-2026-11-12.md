# DESCRIBE-ALL under the size gate (2026-11-12)

Rewrite of the descriptions after the user direction (generalization, not memorization): a description references shared vocabulary only (`lang.common` phrase groups, the world's lexicons, one `core.word` per real word) and its size (non-blank lines of `describe.sop`, words included) must not exceed the non-blank lines of the world's `patterns.sop`. Measured with `scripts/e1-collect.mjs --mode rules --sets operational,dialogues` (one combined run per mode with every description of this table active), rows of the world's own cases (operational + dialogues), triple = right / wrong / not understood. Data: `describe-all-2026-11-12.json`. The earlier per-family sections (kids.* detail) are in git history of this file (commit 763780a and before); this file is now one table.

## One table, all worlds

| world | pattern lines | description lines (words incl.) | core.word wires | ratio | gate (description <= patterns) | hand-written right / wrong / nu | add | only | tests.sop in only | note |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |
| kids.arith | 1647 | 1025 | 162 | 0.62 | yes | 256 / 3 / 3 | 257 / 3 / 2 | 230 / 12 / 20 | 92/230 passed |  |
| kids.tasks | 1441 | 620 | 142 | 0.43 | yes | 82 / 5 / 2 | 82 / 5 / 2 | 62 / 11 / 16 | 72/241 passed |  |
| kids.time | 2260 | 837 | 128 | 0.37 | yes | 148 / 3 / 3 | 148 / 3 / 3 | 126 / 7 / 21 | 56/227 passed |  |
| kids.animals | 1663 | 697 | 130 | 0.42 | yes | 136 / 3 / 0 | 136 / 3 / 0 | 127 / 5 / 7 | 173/506 passed |  |
| kids.shapes | 975 | 544 | 109 | 0.56 | yes | 99 / 7 / 1 | 99 / 7 / 1 | 88 / 7 / 12 | 117/484 passed |  |
| kids.shop | 2944 | 576 | 173 | 0.2 | yes | 102 / 0 / 5 | 102 / 0 / 5 | 102 / 0 / 5 | 77/160 passed |  |
| geo.map | 2297 | 1274 | 344 | 0.55 | yes | 222 / 4 / 2 | 222 / 4 / 2 | 220 / 3 / 5 | 326/459 passed |  |
| docs.editor | 2741 | 1052 | 247 | 0.38 | yes | 249 / 1 / 1 | 249 / 1 / 1 | 226 / 11 / 14 | 205/221 passed |  |
| user.profile | 477 | 465 | 70 | 0.97 | yes | 218 / 7 / 5 | 218 / 7 / 5 | 203 / 14 / 13 | 121/144 passed |  |
| games.tictactoe | 705 | 469 | 73 | 0.67 | yes | 112 / 0 / 3 | 113 / 0 / 2 | 87 / 16 / 12 | 33/173 passed |  |
| games.hangman | 638 | 338 | 64 | 0.53 | yes | 91 / 1 / 0 | 91 / 1 / 0 | 86 / 2 / 4 | 111/154 passed |  |
| games.guess | 500 | 465 | 54 | 0.93 | yes | 101 / 0 / 0 | 101 / 0 / 0 | 92 / 3 / 6 | 97/130 passed |  |
| games.chess | 1760 | 1250 | 244 | 0.71 | yes | 148 / 3 / 1 | 148 / 3 / 1 | 124 / 14 / 14 | 133/269 passed |  |
| ui.shell | 778 | 592 | 141 | 0.76 | yes | 88 / 2 / 0 | 88 / 2 / 0 | 59 / 16 / 15 | 33/64 passed |  |

- **Gate.** Size: met by every world in the table (the three games, user.profile, chess and ui.shell were rewritten here; the kids.* worlds, kids.shop, geo.map and docs.editor already met it: ratios 0.20 to 0.63). **No new wrong answer in `add`** for any world of this rewrite (add rows equal the hand-written rows or gain one).
- **`only`** is the measurement mode (every hand-written pattern of a described operation is dropped). The losses are the hand-written coverage the description does not state; they are listed as gaps below, not hidden by growing the description. `only` wrong counts also contain cases the neighbouring worlds' descriptions steal (art.draw `move`, media.music `song`/interval, ui.avatar `wrong`): these are the same shape as in the earlier DESCRIBE-ALL runs and are one more reason `only` is not shipped.
- **Shared intent groups** (new in `worlds/lang.common/lexicon.sop`, one meaning each, reusable by every world, used with `phrase=$phrase.lang.intent.<name>` and the new `phr` frame of `src/worlds/describe.mjs`): newgame, giveup, hint, bestmove, lastmove, undo, status, iplayfirst, youplayfirst, easier, harder, howmanymoves, livesleft, showword, lettersused, maybe, whyquestion, repeat, whatsleft, questionsasked, imeant, startguess, interview, stopinterview, whatyouknow, howmuchknown, deleteprofile, whereilive, howoldami, whoseturn, goback, whichtab (and the existing `lang.yes`, `lang.no`, `lang.unsure`, `lang.q.whofirst`, `lang.q.suggest_move`, `lang.self.*`). Each group is hand-written by this task (about 20 to 40 alternatives), not copied from a world's patterns. They are a shared phrase list, not a per-phrase word: the honest size of the description is its own lines, and the lang.common growth is about 900 lines for 32 groups, reusable by the 8 worlds still to do.
- **`means=`.** Every word of every world means its operation (`<op>`) or an argument (`<op>.<name>`), the names of the world's `core.operation` actions; READER-ROUTE's reader world turns them into types and keys, so every word resolves there (table below: 0 unknown-word warnings in the reader world, all words mapped, for all 14 worlds). Told as-is to the matrix library, the words of worlds whose actions are not matrix types do not resolve (column "as-is unknown"); that needs a matrix type per operation, which is a library decision, and is not changed here.

### Reader-route coverage of `means=` (readerCoverage)

| world | words | mapped in reader world | reader unknown-word | as-is unknown (matrix) |
| --- | ---: | ---: | ---: | ---: |
| kids.shapes | 109 | 109 | 0 | 0 |
| kids.arith | 162 | 162 | 0 | 0 |
| kids.shop | 173 | 173 | 0 | 0 |
| kids.tasks | 142 | 142 | 0 | 53 |
| kids.animals | 130 | 130 | 0 | 0 |
| docs.editor | 247 | 247 | 0 | 247 |
| games.chess | 244 | 244 | 0 | 179 |
| games.guess | 54 | 54 | 0 | 15 |
| games.hangman | 64 | 64 | 0 | 16 |
| games.tictactoe | 73 | 73 | 0 | 15 |
| geo.map | 344 | 344 | 0 | 341 |
| kids.time | 128 | 128 | 0 | 0 |
| ui.shell | 141 | 141 | 0 | 141 |
| user.profile | 70 | 70 | 0 | 70 |

## Gaps (reported, not shipped long)

1. **Not done in this run (no description yet):** media.music, data.charts, docs.reader, ui.avatar, ui.help, art.draw, diagram.sketch. They need the same method (shared groups plus real words); ui.help and ui.avatar are mostly multi-word intents (what can you do, how do I play) that want `lang.intent` groups; art.draw, media.music, data.charts and diagram.sketch are verb + lexicon-argument worlds. Their hand-written patterns stay the only readers.
2. **Games, spelled-out letters and notation:** hangman letter names ("bee", "see": 26 patterns of the hand-written file), chess algebraic notation `o-o`, castling questions and the `s2.*` opening phrases ("move my e pawn two squares") are not in the descriptions (a letter-name lexicon with a mapping to the letter would need a value mapping a description does not have).
3. **Whole-sentence phrase lists are not matched one to one:** "put my x in the top left" (tictactoe), "start a hangman game with the word tiger" (the `with the word` form is stated, the sentence-initial `start a hangman game` with an article is not), "i concede", "make the computer easier" (chess), "how many letters does the word have". These are the `only` losses of the tables.
4. **tests.sop in `only`:** the world test files are paraphrase lists built on the hand-written patterns (tictactoe 33 of 173, hangman 111 of 154, guess 97 of 130, chess 133 of 269, ui.shell 33 of 64, user.profile 121 of 144); by the data principle (overlap is fine, contamination is not removed) these are not training data to drop, and `only` is not shipped.
5. **user.profile:** left out to fit the gate: corrections ("no, i am a teacher": `fix.*`), `rolefield`, `children`, `confirm`, `mention`, `export both`, sensitive categories and the remember forms. Profile is at 0.97 of its pattern lines; the world is mostly free-text slots and discourse context, where descriptions help least.
6. **Open class `word` arguments** (hangman words, guess animals) need a mandatory verb or opener; the descriptions use `is it`, `could the word be`, `the word is`, `use the word` for that.

## Method notes

- Descriptions are generated from a compact spec kept outside the repository (roles per operation: verbs, nouns, openers, shared groups, arguments and their prepositions); the output is plain SOP Lang. `effect=`, default `kind=` and default `priority=` lines are left out of the rewritten files to meet the gate (the documentation is in `operations.sop`).
- `phrase=` (new role): a reference to a shared `core.phrase` group of the match language; frame `phr` is `<L> <P> <A> <R?> <T>`. Spec 03 section 2c is updated in the same commit.
