# games.guess: request-shape coverage

The system asks yes/no questions about the animal the user thinks of; the user answers, reveals the animal, or asks about the game.

Every line is either supported (with the example that has a test in `tests.sop`, ids `sw###`) or unsupported with the reason. Shapes: imperative, question, wish, indirect, statement-as-command, elliptic, voice/fillers, typos/abbreviations, word order, synonyms, references, quantities, negation/undo, coordination, politeness, state questions, option questions.

## answer

| Shape | Example | Status |
| --- | --- | --- |
| elliptic | yep | supported (test sw001) |
| voice fillers | um yeah it does | supported (test sw002) |
| statement-as-command | that is right | supported (test sw003) |
| abbreviations | ya | supported (test sw004) |
| synonyms | absolutely | supported (test sw005) |
| elliptic | nope | supported (test sw006) |
| typos/abbreviations | nop | supported (test sw007) |
| negation | no it isnt | supported (test sw008) |
| statement-as-command | no, thats wrong | supported (test sw009) |
| synonyms | not at all | supported (test sw010) |
| state | i dont know | supported (test sw011) |
| voice fillers | i really dont know | supported (test sw012) |
| voice fillers | sorry, i dont know the answer | supported (test sw013) |
| synonyms | no idea | supported (test sw014) |
| abbreviations | dunno | supported (test sw015) |
| synonyms | its possible | supported (test sw016) |
| elliptic | sometimes | supported (test sw017) |
| synonyms | sort of | supported (test sw018) |
| qualified answers ("yes, but only on Sundays") | Yes, but only on Sundays. | unsupported: covered by the existing qualified patterns (answer maybe) |
| number guesses / "higher" | higher | unsupported: this world is the animal game: there is no number to guess |

## start

| Shape | Example | Status |
| --- | --- | --- |
| statement-as-command | I have an animal in mind. | supported (test sw019) |
| imperative | Guess my animal. | supported (test sw020) |
| imperative | start twenty questions | supported (test sw021) |
| wish | ok lets play 20 questions | supported (test sw022) |
| imperative | begin the guess game pls | supported (test sw023) |
| imperative | you can start asking now | supported (test sw024) |
| imperative | start guessing | supported (test sw025) |
| wish | let's do the animal game | supported (test sw026) |
| voice fillers | time to guess, start | supported (test sw027) |
| imperative | ask me questions | supported (test sw028) |
| bare "new game" / "start over" / "play again" | new game | unsupported: ui.shell game control (ui.newGame, executed as guess.start) |
| tab words routed to ui.shell (playGame) | go ahead and start | unsupported: ambiguous with tic-tac-toe "who starts"; only resolved by the active tab (engine routing) |

## reveal

| Shape | Example | Status |
| --- | --- | --- |
| statement | It was a penguin. | supported (test sw029) |
| statement | it was a penguin, i had one in mind | supported (test sw030) |
| word order | the one i picked was a penguin | supported (test sw031) |
| statement | it was a penguin, add it | supported (test sw032) |
| elliptic | a penguin, new animal for you | supported (test sw033) |
| noisy gold with an extra avatar action ("you got it wrong, it was a tiger") | you got it wrong, it was a tiger | unsupported: the first clause is an accusation, not a command; the reveal is still parsed |

## why

| Shape | Example | Status |
| --- | --- | --- |
| question | Why did you ask that? | supported (test sw034) |
| question | why is that question being asked | supported (test sw035) |
| question | what made you pick that question | supported (test sw036) |
| question | why did you choose it | supported (test sw037) |

## remaining

| Shape | Example | Status |
| --- | --- | --- |
| question | Which animals are left? | supported (test sw038) |
| question | what can it still be | supported (test sw039) |
| imperative | list what it could be | supported (test sw040) |
| elliptic | possible ones now? | supported (test sw041) |
| question | which are left in the list | supported (test sw042) |

## count

| Shape | Example | Status |
| --- | --- | --- |
| question | How many questions have you asked? | supported (test sw043) |
| question | how many questions are you on | supported (test sw044) |

## repeat

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Repeat the question. | supported (test sw045) |
| politeness | could you repeat your question | supported (test sw046) |
| voice fillers | sorry, say that again | supported (test sw047) |
| statement | i missed it, again? | supported (test sw048) |

## giveup

| Shape | Example | Status |
| --- | --- | --- |
| statement | I give up. | supported (test sw049) |

## hint

| Shape | Example | Status |
| --- | --- | --- |
| asking for a hint | give me a hint | unsupported: the system is the guesser: guess.hint only explains that it gives no hints (ui.shell hint control) |

**L7 (macros).** `patterns.sop` was migrated with `scripts/migrate-macros.mjs`. No shape: the answers (yes, no, maybe, unsure, repeat, correct the last answer) are the `lang.yes/no/unsure` phrase groups of L8 and fixed phrases, and the animal questions are free-text. Three patterns keep their original lists because the macro lead-ins widened them: `yes` (the lead "perhaps" made "perhaps yes" a plain yes and beat `sw.maybe2`) and `sw.repeat4` ("sorry, what did you ask" read as one sentence instead of "sorry" plus the repeat request), `sw.maybe2`.
