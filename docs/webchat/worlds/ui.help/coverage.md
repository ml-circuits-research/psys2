# ui.help rule coverage

Status per request shape: **S** = supported (the example is a pattern `example=` entry, a `tests.sop` test or a `datagen.mjs` family and is checked by `npm test` / `test-world` / the export agreement), **U** = unsupported (reason given).
Chat surface noise handled by every pattern: fillers (`please`, `ok`, `um`, `hey`, `so`), modal prefixes (`can/could you`, `can u`, `tell me`, `i want to know`), suffixes (`pls`, `plz`, `thx`, `for me`, `now`), chat abbreviations (`u`, `ur`, `r`, `wat`, `whats`, `hw`), typos of known words (engine typo correction).

| Operation | Request shape | Status | Example |
| --- | --- | --- | --- |
| `chat.capabilities` | imperative | S | `tell me what you can do` |
| | question / modal question | S | `what can u do for me`, `could you tell me what you are able to do` |
| | very short | S | `capabilities?`, `abilities` |
| | abbreviations | S | `what u can do`, `what r ur abilities` |
| | word order | S | `your capabilities`, `what things can you help with` |
| | indirect wish | S | `i want to know what you can do` |
| | negation / undo | U | no meaning for a question |
| `ui.help` (examples for the tab) | imperative | S | `give me some examples`, `list the commands` |
| | question | S | `what can I say here?`, `what could i say, give examples` |
| | wish | S | `i need examples`, `i want to see examples` |
| | very short | S | `examples pls`, `commands pls` |
| | abbreviations | S | `can u give examples`, `gimme some sample commands` |
| | word order | S | `example sentences?`, `examples for me please` |
| | state / option questions | S | `what are the options`, `what should I try` |
| `ui.help count=1` | imperative / wish / short | S | `give me an example`, `example pls`, `just one example`, `can u give me an example` |
| `ui.helpMore` | imperative | S | `show me more things i can say`, `give me more examples` |
| | question | S | `anything else i can say?`, `what else can I do` |
| | very short answer | S | `more`, `more please`, `next examples please` |
| | abbreviations | S | `can u show more`, `more examples pls` |
| | rephrased | S | `more ideas of what to say`, `different ideas` |
| | ambiguity | S (limit) | bare `more` is claimed by a game hint pattern when a game tab is open (tab tier decides) |
| `ui.helpAbout` | question | S | `what does this tab do`, `what is this screen for` |
| | imperative | S | `explain this tab pls`, `tell me about this page` |
| | word order | S | `this tab what does it do` |
| | modal | S | `could you explain what this tab does` |
| | "what can I do on this page/screen" | S | gold maps page/screen to helpAbout, tab to `ui.help` (kept) |
| `ui.helpMe` | very short | S | `help`, `halp`, `sos` |
| | statement as request | S | `im lost`, `i am lost help`, `help i am lost`, `i feel lost here` |
| | wish / question | S | `i need some help`, `can u help me`, `where do i start`, `what now` |
| | chat / feelings | S | `im so lost right now`, `im confused what now`, `i dont know what to do` |
| | on a game tab | U | the tab game's own `hint` pattern wins (`games.chess` `I am lost` = chess hint) |
| `ui.helpGame` | question | S | `how do I play`, `what are the rules`, `how can I win` |
| | named game | S | `how to play chess pls`, `how do i move in chess`, `tic tac toe how do i start` |
| | imperative | S | `explain chess to me`, `tell me the rules of hangman`, `teach me to play` |
| | wish | S | `i want to learn chess how do i start` |
| | word order | S | `chess how to play`, `chess rules pls`, `rules of chess?` |
| | chat | S | `how u play chess`, `what r the rules of chess`, `can u explain chess rules` |
| | twenty questions | S | `how do i play twenty questions` (digit form `20 questions` handled by twin patterns) |
| `ui.helpHow` | question | S | `how do I change the eyes`, `how can i add a table pls` |
| | imperative | S | `tell me how to draw a circle pls`, `explain how to draw a circle` |
| | word order | S | `draw a circle how`, `i want to draw a circle, how` |
| | chat | S | `how u draw circle` |
| | plural / paraphrased `what` | U | the `what` slot keeps the user's words, no lemmatisation (`draw circles`) |
| `ui.helpWhy` | question | S | `why did you not understand that` |
| | chat / contractions | S | `why u no understand`, `why didnt you get that`, `why couldnt you understand that` |
| | statement + why | S | `you did not understand, why` |
| | what-was-wrong | S | `what did i say wrong`, `what was wrong with what i said`, `which part did you not get`, `which words did you not understand` |
| | "how come" | S | `how come you did not get it` (avatar `why did you change it` no longer takes the do/did verbs) |
| | polite | S | `could you tell me why you did not understand that` |

Known limits: held-out records labelled `chess.hint` for `i am lost` (the label was produced with the chess tab claim) cannot be met by a rule world.

**L7 (macros).** `patterns.sop` was migrated with `scripts/migrate-macros.mjs` (12 repeated lists are macros). No shape: help, what-can-you-do, how-do-I and about questions are fixed phrases with free-text or world-name captures, not an object/value family. Nothing needed to be put back.
