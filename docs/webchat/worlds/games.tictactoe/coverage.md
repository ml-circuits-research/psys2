# games.tictactoe: request-shape coverage

The board is 3x3; the user is X (moves first unless asked), the system is O.

Every line is either supported (with the example that has a test in `tests.sop`, ids `sw###`) or unsupported with the reason. Shapes: imperative, question, wish, indirect, statement-as-command, elliptic, voice/fillers, typos/abbreviations, word order, synonyms, references, quantities, negation/undo, coordination, politeness, state questions, option questions.

## move

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Play the center. | supported (test sw001) |
| wish | I would like the top left corner please. | supported (test sw002) |
| question | Can I go bottom right? | supported (test sw003) |
| elliptic | top right | supported (test sw004) |
| voice fillers | um, top right I think | supported (test sw005) |
| voice fillers | uh okay gonna take the middle left | supported (test sw006) |
| abbreviations | bl pls | supported (test sw007) |
| word order | the left side of the middle row | supported (test sw008) |
| word order | middle of the bottom row | supported (test sw009) |
| synonyms | the one at the bottom in the middle | supported (test sw010) |
| synonyms | bot middle | supported (test sw011) |
| synonyms | down the bottom, middle column | supported (test sw012) |
| statement-as-command | my move is the center | supported (test sw013) |
| politeness | hey could you put my x in the top middle please | supported (test sw014) |
| coordinate | B2 | supported (test sw015) |
| coordinate | square c3 for me | supported (test sw016) |
| coordinate | gonna take c3 | supported (test sw017) |
| spoken coordinate | bee two pls | supported (test sw018) |
| number words | row two column three | supported (test sw019) |
| quantities | 3 1 | supported (test sw020) |
| ordinals | second row third column | supported (test sw021) |
| ordinals | third row, left-most square | supported (test sw022) |
| pronoun/reference ("the same one", "there") | put it there again | unsupported: no reference target: the board has no focus object |
| undo / take back a mark | undo my move | unsupported: no undo operation in this world |
| coordination of two moves | center then top left | unsupported: a move is answered by the system move in the same turn; only the first mark is taken per sentence |

## new

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Start a new tic tac toe game. | supported (test sw023) |
| imperative | Clear the board. | supported (test sw024) |
| wish | I want a fresh game | supported (test sw025) |
| elliptic | clean board | supported (test sw026) |
| voice fillers | um play again from scratch | supported (test sw027) |
| synonyms | lets start over from the beginning | supported (test sw028) |
| bare "new game" / "start over" in the tic-tac-toe tab | new game | unsupported: handled by the ui.shell game control (ui.newGame, executed as ttt.new); a world-level pattern would steal "new game" from the other games and the shell outside the tab (engine routing) |

## first

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Let me go 1st | supported (test sw029) |
| question | can I start? | supported (test sw030) |
| imperative | You go first. | supported (test sw031) |
| wish | I want you to start | supported (test sw032) |
| choosing a mark ("I am x and I start") | I am x and I start | unsupported: the mark is fixed (user X, system O); no operation to choose a mark |

## whoFirst

| Shape | Example | Status |
| --- | --- | --- |
| question | Who goes first? | supported (test sw033) |
| abbreviations | whos up first | supported (test sw034) |

## status

| Shape | Example | Status |
| --- | --- | --- |
| question | Who is winning? | supported (test sw035) |
| elliptic | winning? | supported (test sw036) |
| abbreviations | whos winning rn | supported (test sw037) |

## describe

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Describe the board. | supported (test sw038) |
| question | what's on the board right now | supported (test sw039) |
| question | where are the x's and o's | supported (test sw040) |

## hint

| Shape | Example | Status |
| --- | --- | --- |
| question | Where should I play? | supported (test sw041) |
| question | any tip for my move? | supported (test sw042) |
| indirect | what would you do in my place | supported (test sw043) |
| statement-as-command | i dont know what to play | supported (test sw044) |
| voice fillers | uh what should i do | supported (test sw045) |
| question | which move is good for me | supported (test sw046) |
| question | any advice on my move | supported (test sw047) |
| bare "hint" / "hint please" | hint please | unsupported: handled by the ui.shell game control (ui.hint, executed as ttt.hint) |

## last

| Shape | Example | Status |
| --- | --- | --- |
| question | Where did you play? | supported (test sw048) |
| question | which square did you take last | supported (test sw049) |
| voice fillers | where did you just go | supported (test sw050) |
| abbreviations | which spot did u pick | supported (test sw051) |
| imperative | tell me your last square | supported (test sw052) |

## count

| Shape | Example | Status |
| --- | --- | --- |
| question | How many moves have we made? | supported (test sw053) |

## level

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Set the level to perfect. | supported (test sw054) |
| indirect | go easy on me | supported (test sw055) |
| imperative | lower the level to easy | supported (test sw056) |
| question | can u make the computer easy | supported (test sw057) |
| imperative | dumb it down, easy level | supported (test sw058) |
| imperative | play harder | supported (test sw059) |
| negation | don't go easy on me | supported (test sw060) |
| state question | what level are you | supported (test sw061) |
| "Let us play easiest" on a tab other than tic-tac-toe | Let us play easiest. | unsupported: the avatar tab claims "let us {rest}" (name patterns); routing exception needs more literal words (engine) |

## giveup

| Shape | Example | Status |
| --- | --- | --- |
| statement-as-command | ugh I give up | supported (test sw062) |
| "I give up", "quit" | I give up | unsupported: ui.shell game control wins by priority and runs ttt.giveup; the ttt pattern covers the longer forms |

**L7 (macros, shapes).** `patterns.sop` was migrated with `scripts/migrate-macros.mjs` (lead-ins, suffixes and 13 repeated lists are macros). One shape, `games.tictactoe.move` (do over `lex.games.tictactoe.positions`, 4 generated patterns), adds the verb, wish, indirect and question forms of a move ("i want to play the center", "could you maybe play the center square"; test sh02). No hand pattern is deleted: the move patterns take an optional verb ("center", "top left", "B2", "row 2 column 3"), which is the `short` reading that a shape drops at tier 5; coordinates, rows and columns, levels, new game, undo and the state questions stay hand-written.
