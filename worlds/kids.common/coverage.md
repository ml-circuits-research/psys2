# kids.common: request-shape catalogue (R2)

Status: **S** = supported by general patterns, with at least one test in `tests.sop` (ids `t.kids.common.*`, the ones numbered `s###` come from the rule sweep); **U** = unsupported, with the reason.
Chat acts are `core.request action=chat.<act>`; the operations are `greet`, `name`, `who`, `meet`, `myname`, `thanks`, `bye` (`ops.mjs`).

## greet (chat.greet)
| Shape | Examples | Status |
| --- | --- | --- |
| bare greeting, imperative-free | hello, hi, hey, yo, hiya, howdy, heya, good morning/afternoon/evening | S |
| typos and stretched forms | hii, hiii, heyyy, helloo, helo, hllo, hallo, henlo, hewwo | S |
| with addressee | hello robot, hi bot, hey buddy, hello my friend, hi everyone, hey you | S |
| repeated | hello hello, hey hey hey, hi hi | S |
| with a small question inside | hello friend how are u, hey are you there (chat-engine pattern wins when a chess tab is open) | S (standalone "how are you" is deliberately **not** a greeting: it is a question) |
| "it is me" forms | hello again it's me, hi it is me again | S |
| politeness | hi there pls, hello please | S |
| other languages | hola, ahoy, salutations | S |

## name (assistant name, chat.name)
| Shape | Examples | Status |
| --- | --- | --- |
| question | what is your name, whats ur name, wat is ur name, what are you called, how are you called | S |
| imperative | tell me your name, say your name, could you say your name, give me ur name | S |
| wish / indirect | i wanna know your name, can i get your name, may i ask your name, can you tell me what your name is | S |
| elliptic | your name?, name?, ur name pls, name you go by?, name u use pls | S |
| word-order variants | your name again, name of yours, name of the helper, helper name please | S |
| synonyms of "name" | nickname, handle, first name, "what do you go by", "what do you call yourself" | S |
| other nouns for the assistant | what is the bot's name, whats the helper called, the helper is called what, what is the name of this helper, who is the name behind this chat | S |
| about how others address it | how do people call you, what do ppl call u, folks call u what, how do others know you, what should I call you, how can i call you, what do i call the assistant, how should I address u | S |
| fillers | hey, so, um, wait, yo friend, pls, plz, "quick question", "can u tell me" | S |
| who named you / who made you | (a different question, not a name request) | U (no operation) |

## who (what the assistant is, chat.who)
| Shape | Examples | Status |
| --- | --- | --- |
| question | who are you, who r u, what are you, who is this, who am i talking to (read as name by an older pattern) | S |
| imperative | introduce yourself, intro yourself pls, tell me about yourself, describe yourself, can u introduce urself, introduce yourself to me please | S |
| kind of thing | what kind of bot are you, which bot are you, what bot is this, what kinda bot u r, what type of bot you are | S |
| elliptic | bot type?, your identity?, intro | S |
| "are you a robot" | are you a robot / human / real | S for chat; the avatar world answers it when the avatar tab is the context |
| two questions in one comma-joined message | "tell me about you, who are u" | U (a message cut at the comma gives two requests; the dataset target has one; handled by the dispatcher's segmentation) |

## meet (the user says their name, chat.meet; remembered per session)
| Shape | Examples | Status |
| --- | --- | --- |
| "my name is" family | my name is Ben, my name's Ben, name is Ben, my nickname is Ben | S |
| call-me family | call me Ben, you can call me Ben, u can call me Ben, please call me Ben, you may call me Ben | S |
| they-call family | they call me Ben, everyone calls me Ben, my friends call me Ben, people call me Ben | S |
| i-am family with a capitalized or known first name | I am Ben, Im Ben, hey im Ben, i am Mia Lee, Im Mia | S |
| name first | Ben is my name, Ben here, Ben speaking, Zed is my name pls, "Ben's my name" | S |
| with lead-ins / tails | just so you know my name is Ben, hello my name is Ben by the way, name's Ben btw, hi im Ben nice to meet you | S |
| "this is" | this is Ben, hi this is Ben talking | S |
| "Ben is fine/ok for me" | Ben works, Ben would be good | S |
| lowercase unknown names ("im zed", "i am zed") | | U for the `i am` family: a lowercase word that is not a known first name is not read as a name (it would swallow "i am hungry"); the other families accept any word. Capitalized names always work. |
| case of the stored name | the name is stored as typed in the text, then capitalized by the operation | S (the dataset targets keep the original capital, so lowercase inputs cannot match them) |
| not names | I am hungry, I am tired, I am 7 years old, Im happy | S (negative tests in `datagen.mjs`) |

## myname (what is my name, chat.myname)
| Shape | Examples | Status |
| --- | --- | --- |
| question | what is my name, whats my name, what was my name again, who am i, what am i called | S |
| memory question | do you remember my name, do u know my name, can you recall my name, did u learn my name yet, do you have my name saved | S |
| recognition | do you recognize me, u recognise me or not, are you able to recognise me, can you tell if you recognise me, remember me? | S |
| imperative | say my name, remind me what is my name, tell me my name, guess my name lol do you know it | S |
| about what was said | what name did i tell u earlier, what was the name i said, remind me which name i told you, the name i told u what was it | S |
| elliptic | my name?, name of mine you know? | S |
| with context (the name said earlier in the session) | "my name is Ben. whats my name" | S |

## thanks (chat.thanks)
| Shape | Examples | Status |
| --- | --- | --- |
| bare | thanks, thank you, thx, ty, tysm, cheers, ta, many thanks | S |
| typos | thnks, thnx, thanx, thanku, tks, tnx, thankz | S |
| intensified | thanks a lot, thank you so much, thanks a ton buddy, thx a lot | S |
| with the reason | thanks for the help, thank you for helping me, thanks for answering | S |
| with a lead interjection | great thanks, awesome thanks, ok thanks, oh nice thanks a lot, cool thank you | S |
| with a compliment tail | thanks you helped, thanks buddy you are great, thanks you rock | S |
| appreciation | much appreciated, i appreciate it, that was helpful, that helped | S |
| bare compliment ("you are great") | | U (not a thanks; the thanks3 family needs "helpful/useful" words or a thanks word) |

## bye (chat.bye)
| Shape | Examples | Status |
| --- | --- | --- |
| bare | bye, goodbye, see you, see ya, cya, later, farewell, ciao, adios | S |
| abbreviations and typos | gtg, g2g, ttyl, cu, byee, byeee, bai, cyaa | S |
| announcing | gotta go, i have to go, im off, im leaving, time to go, i must go now | S |
| night | good night, nighty night, nite, off to bed | S |
| with a tail | bye for now, bye bye, bye bot, see u later bye, bye have a nice day | S |
| with a lead | ok bye, alright i am leaving, well bye, bot, bye | S |
| two farewell phrases in one message | "Alright, time to go, bye for now." | S (two requests, one per clause, as the dataset targets); without the comma the old canonical target also counts two, which one pattern cannot give: U for the 5 comma-less heldout variants (label artefact) |

## Cross-cutting shapes
| Shape | Status |
| --- | --- |
| very short / elliptic | S (see above) |
| voice fillers and run-ons ("um hey so whats your name pls") | S: two filler slots in the sweep patterns, `ok/okay/please/well/um/so` are dropped by the tokenizer |
| typos / abbreviations u, ur, yr, pls, plz, thx, whats, wat, rn | S |
| pronouns / references | n/a for chat acts; `chat.myname` reads the name stored by an earlier `chat.meet` (S) |
| numbers, units | n/a |
| negation / undo | "do not say hello", "I don't need help" are not chat acts (negative tests) |
| coordination | "hello, what is your name?", "thanks, bye" give one request per clause (S) |
| politeness | please / pls / could you / would you / can u in front of every question (S) |
| questions about the state | what is my name (S) |
| questions about the options ("what can you do") | U here: answered by `ui.help` |
