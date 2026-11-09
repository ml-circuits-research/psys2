# kids.tasks — request-shape catalogue (rule formalizer)

**S** = supported, with a test (the `doc=` of `t.tasks.swNNN` tests names the class); **U** = unsupported, with the reason. Patterns: `patterns.sop`, rule-sweep families `sw.*` last (each is generated in three list forms: "my shopping list", a named list without the word list, and the default list). List names that may be said without the word "list" are in `lex.kids.tasks.listnames`.
Routing note: when the active tab belongs to another world (the docs editor, for example), that world's own `list`-patterns win over these (tier 3 of the routing policy). Bare statements about items without the word "list" (`pls add milk`, `homework is done`, `remove milk`) are deliberately low priority because other worlds own the same words.

| Operation | Request shape | Example | Status |
| --- | --- | --- | --- |
| add | imperative with verbs add/put/write/pop/jot/stick/..., polite and chat forms | "Please write milk on my shopping list", "can u add milk to my shopping list", "pop milk onto my list pls" | S: "add: verbs, politeness, fillers" |
| add | wish / indirect: "i need milk on my list", "we need eggs on the list", "milk needs to go on my list", "milk should be on the list", "i forgot milk on my list" | | S |
| add | noun-first and list-first: "socks for the garden list please", "socks on the garden list", "garden list: socks", "garden list add socks" | | S: "add: noun-first and list-first" |
| add | list without the word list: "add bread to shopping" | | S: "add: list named without the word list" |
| add | bare "add milk" with no list | | U (deliberate): collides with the editor, music and drawing `add` commands; works on the tasks tab |
| add | coordination of several items / lists in one sentence | "add bread to my shopping list and a book to my homework list" | S through clause splitting (older tests); "milk, eggs and bread" is one item list |
| remove | imperative, "get X off", "take X away from", "toss", "drop", "cut"; polite forms | | S: "remove: verbs and word orders" |
| remove | verbless / noun-first: "milk off the shopping list", "shopping list no more milk", "shopping list minus milk" | | S |
| remove | "remove it" / "that one" (a reference to the last item) | | U: needs the last mentioned item (state in the formalizer) |
| done | statements: "i finished homework", "homework is done", "homework finished!", "all done with homework", "yay finished homework", "done with my homework" | | S: "done: statements" |
| done | tick / cross / mark / check off, strike from: "tick milk off the shopping list", "mark milk done on shopping list", "check off milk on the list pls", "strike milk from the shopping list" | | S: "done: tick / cross / mark" |
| done | "my homework's done", "my X finished" without a verb | | U: `media.music` and `ui.avatar` own "my ...'s ..." sentences by priority |
| not done | "i didnt finish my homework", "homework not finished", "homework still not done", "not finished homework", "no homework finished yet", "i havent finished homework yet" | | S: "not done: negative reports" |
| remind | verbs remind/ping/nudge/alert/notify/alarm, polite, time words ignored (later, tomorrow, tonight) | "nudge me about the dishes later", "ping me to feed the cat" | S: "remind: verbs and prepositions" |
| remind | "dont let me forget to ...", "make sure i remember to ...", "later remind me to ...", "feed the cat, remind me" | | S |
| remind | reminder nouns: "set reminder water the plants pls", "reminder: water the plants", "i need a reminder to ...", "water the plants reminder pls" | | S: "remind: reminder nouns" |
| remind | a real timer / a time of day ("remind me at 5") | | U: no timers; the time word is dropped and the reminder is only listed |
| show list | what is on / show / read / tell me / anything on, with the list word, a list name or the default list | | S: "show list", "show default list" |
| show reminders | "what reminders do i have", "tell me my reminders", "any reminders for me?", "reminders please", "do i have any reminders", "what do you remind me of" | | S: "reminders" |
| lists | "lists i got?", "what kinds of lists do i have", "show all my lists", "which lists exist", "name my lists" | | S: "lists" |
| pending | "whats left on my shopping list", "what is still on the shopping list", "remaining items on shopping list?", "what hasnt been bought yet", "whats left to buy", "still to buy?", "what am i still missing from the shopping list" | | S: "pending: what is left" |
| pending | to do: "what do i need to do still", "what's still open for me", "what's still on my to do", "what do i got left todo" | | S: "pending: to do" |
| count | "how many things r on my list", "hw many things on my list", "how long is my list", "count the things on my list", "number of items on my list?" | | S: "count" |
| count pending | "how much do i still have to do", "how many more things do i need to do", "how many things still open", "how many tasks still todo", "how many chores do we still have" | | S: "count pending" |
| clear | "clear / empty / wipe / erase / reset the list", "list empty it", "make the list blank", "remove everything from the list", "delete everything on the list", "get rid of my shopping list" | | S: "clear a list" |
| has | "is there milk on the list", "do we have milk on the list", "milk on my list or not", "check if milk is on my list", "does my list have milk", "milk on my shopping list?" | | S: "has: is X on the list" |
| check | "did i finish homework", "have i done homework", "is my homework done yet", "homework done or not", "was my homework finished", "could you tell me if i finished my homework", "finished my homework?" | | S: "check: did I finish X" |
| any | questions about options ("what can you do with lists?") | | U: `ui.help` |
| any | undo of the last change ("undo that") | | U: no undo operation |
| any | negated commands ("do not add milk") | | U on purpose: not claimed (negative training examples) |

**L7 (macros, shapes).** `patterns.sop` was migrated with `scripts/migrate-macros.mjs` (lead-ins, suffixes and 68 repeated lists are macros). Two shapes add the polite, wish, indirect and question forms for the named lists: `kids.tasks.clear` (do family: "I want to clear my shopping list", "can I empty the homework list"; tests in sh02) and `kids.tasks.show` (list family: "could you maybe show my shopping list"; test sh01). Both read only the list names of `lex.kids.tasks.listnames`; the hand patterns with `{list:words}` stay because they take any list name. The add, remove, done, remind, check, has and pending operations take a free-text item (`{item:words}`) and are not shape families.
