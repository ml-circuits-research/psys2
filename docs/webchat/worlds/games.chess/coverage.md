# games.chess: request-shape coverage

The user plays against the built-in engine; moves are SAN-free spoken or typed squares, with questions about legality, piece locations, the board and the game.

Every line is either supported (with the example that has a test in `tests.sop`, ids `sw###`) or unsupported with the reason. Shapes: imperative, question, wish, indirect, statement-as-command, elliptic, voice/fillers, typos/abbreviations, word order, synonyms, references, quantities, negation/undo, coordination, politeness, state questions, option questions.

## move

| Shape | Example | Status |
| --- | --- | --- |
| elliptic | e4 | supported (test sw001) |
| imperative | Knight to f3. | supported (test sw002) |
| wish | how about d4 | supported (test sw003) |
| voice fillers | mm lets go e4 | supported (test sw004) |
| politeness | could you play e four please | supported (test sw005) |
| word order | pawn to e4 | supported (test sw006) |
| spoken | e two to e four | supported (test sw007) |
| abbreviations | b1 to c3 pls | supported (test sw008) |
| the square | knight to the f3 square | supported (test sw009) |
| file pawn | e pawn to e4 | supported (test sw010) |
| statement-as-command | my move is d4 | supported (test sw011) |
| bare square with a question mark meaning "what is on it" | h8? | unsupported: a bare square is a move (priority 13); the question mark is not visible to the rules |
| direction words ("pawn forward", "advance the e pawn") | move the pawn forward | unsupported: no target square: a direction is not enough to select one move |

## can

| Shape | Example | Status |
| --- | --- | --- |
| question | Can I move my knight to f3? | supported (test sw012) |
| wish | may i play queen h5 | supported (test sw013) |
| question | queen to h5 allowed? | supported (test sw014) |
| indirect | is h5 possible for my queen | supported (test sw015) |
| indirect | would queen to h5 be a legal move | supported (test sw016) |
| trailing "ok" ("queen h5 ok?") | queen h5 ok? | unsupported: the formalizer strips trailing "ok"/"okay" as a filler before matching, so it reads as the move |

## moves

| Shape | Example | Status |
| --- | --- | --- |
| question | What can my knight do? | supported (test sw017) |
| politeness | can u list the legal moves of the queen | supported (test sw018) |
| question | could you show what squares my queen can reach | supported (test sw019) |
| word order | my queen where can she move | supported (test sw020) |
| square | knight g1 moves? | supported (test sw021) |
| square | where can the g1 knight go | supported (test sw022) |
| square | g1 knight options | supported (test sw023) |
| square | the knight on g one, where can it go | supported (test sw024) |

## turn

| Shape | Example | Status |
| --- | --- | --- |
| state question | my colour? | supported (test sw025) |
| state question | am I white or black | supported (test sw026) |
| state question | are my pieces white | supported (test sw027) |
| state question | what colour are my pieces in this game | supported (test sw028) |

## side

| Shape | Example | Status |
| --- | --- | --- |
| imperative | switch colours with you | supported (test sw029) |
| wish | I want the other colour now | supported (test sw030) |
| voice fillers | can we swap, you take my side | supported (test sw031) |
| elliptic | black please, new game | supported (test sw032) |

## flip

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Flip the board. | supported (test sw033) |
| politeness | can u rotate the chess board | supported (test sw034) |
| indirect | show it from the other side | supported (test sw035) |
| wish | i want to see from black side | supported (test sw036) |
| indirect | turn it so i see the black side | supported (test sw037) |

## describe

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Describe the board. | supported (test sw038) |
| imperative | describe white | supported (test sw039) |
| imperative | read out the black pieces | supported (test sw040) |
| question | what white has on the board | supported (test sw041) |
| word order | white pieces please, describe | supported (test sw042) |

## where

| Shape | Example | Status |
| --- | --- | --- |
| question | Where is my king? | supported (test sw043) |
| abbreviations | where r my rooks | supported (test sw044) |
| word order | rooks where? | supported (test sw045) |
| indirect | location of my rook pieces | supported (test sw046) |
| politeness | can you tell me where my two rooks are | supported (test sw047) |

## square

| Shape | Example | Status |
| --- | --- | --- |
| question | what is on e4 | supported (test sw048) |
| question | h8 has what | supported (test sw049) |

## history

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Show the move list. | supported (test sw050) |
| elliptic | move list | supported (test sw051) |
| elliptic | history of moves | supported (test sw052) |
| elliptic | moves played till now | supported (test sw053) |
| imperative | game moves please | supported (test sw054) |

## level

| Shape | Example | Status |
| --- | --- | --- |
| imperative | Set the level to 5. | supported (test sw055) |
| wish | make it level 5 for me | supported (test sw056) |
| indirect | make the engine stronger, level five | supported (test sw057) |

## hint

| Shape | Example | Status |
| --- | --- | --- |
| question | What should I play? | supported (test sw058) |
| bare "hint" / "help" | hint please | unsupported: ui.shell game control (ui.hint, executed as chess.hint); bare "help" belongs to ui.help |

## status

| Shape | Example | Status |
| --- | --- | --- |
| question | Who is winning? | supported (test sw059) |

## check

| Shape | Example | Status |
| --- | --- | --- |
| question | Am I in check? | supported (test sw060) |

## last

| Shape | Example | Status |
| --- | --- | --- |
| question | What was your last move? | supported (test sw061) |

## draw

| Shape | Example | Status |
| --- | --- | --- |
| imperative | offer a draw | supported (test sw062) |

## new

| Shape | Example | Status |
| --- | --- | --- |
| bare "new game" / "start over" | new game | unsupported: ui.shell game control (ui.newGame, executed as chess.new) |

## resign

| Shape | Example | Status |
| --- | --- | --- |
| "I give up", "quit" | I give up | unsupported: ui.shell game control wins by priority (ui.giveUp, executed as chess.resign); chess patterns cover "I resign", "you win" |

## count

| Shape | Example | Status |
| --- | --- | --- |
| piece counts with synonyms of owners | count my pieces | unsupported: owners are kept as typed (my, you, u); the generic gold form (who=i) is not derivable |

## undo

| Shape | Example | Status |
| --- | --- | --- |
| negation ("do not move there") | no, not that | unsupported: a refusal of the last move needs the engine to ask something first |

**L7 (macros, shapes).** `patterns.sop` was migrated with `scripts/migrate-macros.mjs` (lead-ins, suffixes and 41 repeated lists are macros). The question forms `can.*` (priority 13 -> 14): the migrated `move.*` and `castle.*` patterns accept the lead-in "can I" through `lang.lead.polite`, and "can I castle?" / "may I play queen h5" must stay the ability question. One shape, `games.chess.move.piece` (do family with the target square as a raw `extra` fragment), adds the wish and indirect forms of "move the knight to f3" ("I want to move the knight to f3", "could you maybe move the pawn to e4"; tests sh01 to sh03) and replaced the hand pattern `move.piece.polite`. Chess moves, captures, castling, promotions, SAN, legality questions, piece lists, levels and sides are many-slot or notation phrasings and stay hand-written: the world already holds its repeated lists as local phrases.
