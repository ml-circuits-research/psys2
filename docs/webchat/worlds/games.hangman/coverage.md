# games.hangman: request-shape coverage

The system hides an animal word; the user guesses letters or the whole word, asks for facts and for the masked word, starts or gives up.

Every line is either supported (with the example that has a test in `tests.sop`, ids `sw###`) or unsupported with the reason. Shapes: imperative, question, wish, indirect, statement-as-command, elliptic, voice/fillers, typos/abbreviations, word order, synonyms, references, quantities, negation/undo, coordination, politeness, state questions, option questions.

## letter

| Shape | Example | Status |
| --- | --- | --- |
| question | Is there an E? | supported (test sw001) |
| question | o is there? | supported (test sw002) |
| question | is it n | supported (test sw003) |
| elliptic | L | supported (test sw004) |
| voice fillers | um, next letter, n | supported (test sw005) |
| spoken name | zed | supported (test sw006) |
| question | does z appear | supported (test sw007) |
| statement | guessing z | supported (test sw008) |
| wish | can i get an r | supported (test sw009) |
| question | any e? | supported (test sw010) |
| imperative | try the letter s | supported (test sw011) |
| word order | e in the word? | supported (test sw012) |
| abbreviations | got any s pls | supported (test sw013) |
| spoken name | try double you | supported (test sw014) |
| undo / take back a letter | undo that letter | unsupported: a guessed letter cannot be taken back in hangman |
| several letters in one message | e and a | unsupported: one letter per request; the dispatcher splits coordinated messages into pieces |

## word

| Shape | Example | Status |
| --- | --- | --- |
| question | Is it tiger? | supported (test sw015) |
| elliptic | tiger? | supported (test sw016) |
| statement | tiger, my answer | supported (test sw017) |
| question | is tiger right | supported (test sw018) |
| statement | my final answer is tiger | supported (test sw019) |
| imperative | I guess tiger | supported (test sw020) |
| multi-word animals ("polar bear") | is it a polar bear | unsupported: only single-word animals are hangman words |

## hint

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Tell me something about it. | supported (test sw021) |
| imperative | tell me a fact about it | supported (test sw022) |
| elliptic | fact? | supported (test sw023) |
| wish | i want a fact | supported (test sw024) |
| question | what is it known for | supported (test sw025) |
| imperative | tell me one thing about this animal | supported (test sw026) |
| voice fillers | uh give me something about it, not a letter | supported (test sw027) |
| question | whats a fact about the mystery animal | supported (test sw028) |
| bare "hint" | hint please | unsupported: ui.shell game control (ui.hint, executed as hm.hint) |

## status

| Shape | Example | Status |
| --- | --- | --- |
| question | How many guesses are left? | supported (test sw029) |
| question | how many letters are hidden | supported (test sw030) |
| question | what does the word look like now | supported (test sw031) |
| imperative | show me the mask | supported (test sw032) |
| imperative | display the dashes | supported (test sw033) |
| elliptic | letters still missing? | supported (test sw034) |
| question | how many spaces left in the word | supported (test sw035) |
| elliptic | hidden word view | supported (test sw036) |

## new

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Start a new hangman game. | supported (test sw037) |
| elliptic | hangman again | supported (test sw038) |
| voice fillers | play again hangman | supported (test sw039) |
| word order | hangman round two | supported (test sw040) |
| wish | lets go again with a new animal | supported (test sw041) |
| imperative | start over hangman | supported (test sw042) |
| statement | giraffe is the word | supported (test sw043) |
| imperative | make a hangman round with giraffe pls | supported (test sw044) |
| word order | hidden word: giraffe | supported (test sw045) |
| imperative | ok new hangman, its giraffe | supported (test sw046) |
| politeness | can u set the word to giraffe for hangman | supported (test sw047) |
| imperative | Play hangman with the word zebra. | supported (test sw048) |
| bare "new game" / "new game pls" / "start over" | new game pls | unsupported: ui.shell game control (ui.newGame, executed as hm.new) |

## giveup

| Shape | Example | Status |
| --- | --- | --- |
| statement | I give up the word. | supported (test sw049) |
| imperative | end the game pls | supported (test sw050) |
| "I give up", "I quit", "forget it" | I give up | unsupported: ui.shell game control wins by priority and runs hm.giveup; the hangman patterns cover the longer forms |

**L7 (macros, shapes).** `patterns.sop` was migrated with `scripts/migrate-macros.mjs`. One shape, `games.hangman.letter` (do over `lex.games.hangman.letters` with the optional word "letter" before the letter, 4 generated patterns), adds the imperative, wish, indirect and question forms of a guess ("could you maybe guess the letter e", "i want to guess e"; test sh02); the hand patterns (`is there an e`, `e in the word`, `try s`) stay because they have an optional verb or other wording. Gate finding: the migrated hint pattern `hint2` read "i want to play something" on a recent hangman world through the polite lead-in ("i want to play"), so it keeps its original list.
