# ui.shell rule coverage

**S** = supported (pattern `example=`, `tests.sop` test or `datagen.mjs` family, checked by `npm test` / `test-world`), **U** = unsupported (reason).
Noise handled by the new patterns: fillers, modal and wish prefixes (`can u`, `could you`, `i want to`, `i wanna`, `lets`, `let me`, `we should`), suffixes (`pls`, `plz`, `thx`, `now`, `for me`, `right now thank you`), chat abbreviations (`u`, `pls`, `hw`), number words (`one point five`, `one and a half`, `half`).

| Operation | Request shape | Status | Example |
| --- | --- | --- | --- |
| `ui.openTab` | imperative | S | `open the chess board`, `bring up the map tab` |
| | wish | S | `i want the chess board`, `i want to see the map tab`, `let me see the editor tab` |
| | modal | S | `can u show me the map`, `could you open up the chess board` |
| | very short | S | `map tab pls`, `chess board please`, `editor pls`, `map` |
| | word order | S | `chess board tab pls` |
| | pronoun "back to the editor" | S | `take me back to the editor` |
| | unknown tab name | S | refused politely by the op |
| `ui.playGame` | imperative | S | `play hangman`, `start tic tac toe` |
| | wish / modal | S | `i feel like playing hangman`, `can u play hangman with me`, `wanna play tic tac toe` |
| | very short | S | `hangman pls`, `hangman game please`, `tic tac toe time`, `hangmen game` (plural alias) |
| | `lets do hangman` | U | claimed by the hangman world (`hm.new`), shell stays out |
| `ui.chooseGame` | question | S | `what games can we play`, `which game`, `what games do you have` |
| | imperative | S | `pick a game`, `choose a game for me`, `show me the games`, `list the games` |
| | wish | S | `i want to play something`, `let me choose a game` |
| | very short | S | `games?`, `game time` |
| | `play something` | U | claimed by the music world (`play something`) |
| `ui.back` | imperative | S | `go back`, `go back to the last one`, `back one tab` |
| | very short | S | `back pls`, `previous screen`, `last tab pls` |
| | indirect | S | `return to where i was`, `take me back to where i came from` |
| `ui.whichTab` | question | S | `which tab am I on`, `where am I` |
| `ui.speaker` on/off | imperative / short / modal | S | `turn on the speaker`, `be quiet`, `mute`, `can you speak to me` |
| `ui.listening` on/off | imperative / short / modal | S | `start listening`, `turn off the microphone` |
| `ui.handsFree` on/off | imperative / short | S | `hands-free mode on`, `go hands-free` |
| `ui.rate` slower/faster | imperative | S | `slow it down`, `lower the speed`, `speed it up`, `increase the speed` |
| | statements as commands | S | `too fast, slow it`, `less fast please`, `not so slow`, `too slow` |
| | very short | S | `slower voice`, `faster voice` |
| | on a music tab | U | the music tab's own tempo patterns win (same words, different op) |
| `ui.rate` value | imperative | S | `set the speech rate to 1.5`, `make the speed 1.5` |
| | very short | S | `speech rate 1.5`, `rate 1.5 please`, `voice speed 1.5 pls` |
| | modal / wish | S | `could you set talking speed to 1.5`, `i want speech rate one and a half` |
| | number words | S | `one point five`, `one and a half`, `one and a quarter`, `half`, `three quarters`, `1,5` |
| | `speak at 1.5` | S | yes |
| `ui.language` | imperative | S | `speak english`, `switch to romanian` |
| | wish | S | `i want english`, `i prefer romanian` |
| | return forms | S | `back to english` |
| | modal / duration | S | `could you use english from now on`, `can u speak english now` |
| | very short | S | `english pls`, `in english please` |
| `ui.newGame` | imperative / short | S | existing patterns (`new game`, `play again`, `start over`) |
| `ui.giveUp` | imperative | S | `i give up`, `quit this game please` (priority 8: the tab game's own resign wins) |
| | stop forms | S | `stop game pls`, `can we stop the game`, `i want to stop the game now`, `stop the game for now` |
| | noun first | S | `game stop`, `game over`, `stop it, game over` |
| `ui.hint` | imperative / short | S | existing (`give me a hint`) |
| | `clue` forms | U | cross-world: the open game's own hint pattern owns `clue` in the labelled data |
| `ui.phraseLog` show | imperative | S | `show my phrase log`, `phrase log` |
| `ui.phraseLog` export | imperative / wish | S | `download my phrase log`, `i want a copy of my phrase log`, `export phrase log` |
| | very short / order | S | `phrase log download pls`, `phrase log to file please`, `download the phrases i said` |
| `ui.phraseLog` count | question | S | `how many phrases have i said`, `how many things have i said so far` |
| | abbreviations / order | S | `hw many phrases i said`, `number of phrases i said`, `count my phrases`, `phrase count?` |
| | polite | S | `tell me how many phrases i said` |
| negation / undo | `do not open the editor`, `never go back` | S (not claimed) | negative datagen families |

Known cross-world limits (engine routing, not rules): the same words belong to several worlds (`slow down` music tempo vs speech rate, `quit this game` chess resign vs shell give up, `pick a game`/`take me back` edited by the editor select pattern when its priority is high; the editor select patterns were kept narrow for that reason).
