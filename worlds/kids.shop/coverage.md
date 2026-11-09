# kids.shop — request-shape catalogue (rule formalizer)

**S** = supported, with a test (the `doc=` of `t.shop.swNNN` tests names the class); **U** = unsupported, with the reason. Patterns: `patterns.sop`, rule-sweep families `sw.*` last. Item groups: "N items", "a/the item", "item xN", and pairs of them with and/plus/+/also (single or two items) for every question about baskets.

| Operation | Request shape | Example | Status |
| --- | --- | --- | --- |
| money | I have N lei, wallet/purse/piggy bank holds N, started with N | older tests | S |
| money | chat forms: "i got 40 lei in my purse", "40 lei is what i have", "me 40 lei", "im carrying 40 lei", "i only have 40 lei now", "fyi i have 40 lei" | | S: "statement: money in the purse" |
| money | mis-spelled number words ("fourty") | | U: `numbers.mjs` (engine) |
| income | I got / found / earned / received N lei; mom gave me N lei; grandma gave me ... today | | S: "statement: receiving money" |
| expense | I spent N lei; "i paid 2 lei for a sweet", "2 lei gone on candy", "i used 2 lei", "spent 2 lei just now", "i gave 2 lei to the shop", "i lost 2 lei buying a sweet", "minus 2 lei, i bought candy" | | S: "statement: spending" |
| price (statement) | a kite costs 4 lei; "kite 4 lei", "kite cost 4 lei fyi", "remember a kite is 4 lei", "kite price 4 lei", "4 lei for a kite", "btw a kite costs 4 lei" | | S: "statement: price of an item" |
| purchase | I buy / bought; "i just bought 3 pencils", "bought 3 pencils", "i purchased 3 pencils today", "i picked up 3 pencils", one or two items | | S: "statement: buying" (a bare "I bought some stickers" belongs to `kids.tasks`: it ticks an item off) |
| price (question) | "how much does a ball cost", "cost of the ball pls", "price of a ball?", "ball price?", "how much r balls", "how much for a ball", "whats a ball cost", "ball how much" | | S: "price of one item ..."; shape `kids.shop.price` (ask.value family) generates the question, imperative, wish, indirect, word-order and short forms: "what is the price of a pen", "tell me the cost of the pen", "i wonder what price the pen is", "do you know the price of a pen", "the price of a puzzle" (tests sh01 to sh04); the "how much ..." phrasings stay hand-written (no property noun) |
| total | N items: "whats the total for three pencils", "pencils x3 how much", "if i buy 3 pencils how much do they cost", "how much for all 3 pencils together", "altogether 3 pencils how much", "whole cost of 3 pencils?", "3 pencils altogether cost?", "how much will i pay for 3 pencils" | | S: "total for N items" |
| total | two items: "how much are 4 kites and a puzzle all together", "altogether 4 kites and puzzle price?" | | S: "total for two items" |
| total | "4 kites + puzzle = ?" (the `+` sign is dropped, no money word is left) | | U: needs the operator or a money cue; engine tokenizer |
| balance | "how many lei do I have now", "lei left in my purse?", "what is my money after shopping", "money left for me?", "after the spending, how many lei", "my purse, how much now?", "my money?", "how many lei in my pocket now", "how much money am i left with", "money i have right now?", "lei count now" | | S: "balance: money left" |
| affordability | "can I buy ...", "could i afford", "do i have the money for", "is my money good for", "enough for ... or nah", "is it possible to buy", "is a puzzle and 2 kites ok for my money", "puzzle + 2 kites, can i pay?", "is my money enough for the puzzle", "i have enough for puzzle?", "is 8 lei enough for a puzzle" | | S: "affordability ..." |
| affordability | "with 11 lei can i get a notebook" (states money and asks in one sentence) | | U: two facts in one sentence; the dispatcher splits it |
| change | "what is the change from 20 lei if I buy a kite", "how much back if i give 20 lei for a kite", "how much will i get back from 20 for a kite", "kite change from 20?", "what do i get back after paying 20 lei for the kite", "if i give 20 lei for a kite whats my change", "20 lei and a kite, what change do i get" | | S: "change from a payment" |
| change | two items: "change from thirty lei, puzzle and 2 kites", "puzzle + 2 kites with 30 lei, change pls", "if i pay 30 lei how much change for a puzzle and two kites", "give me the change, 30 lei, puzzle and 2 kites", "after 30 lei for puzzle and 2 kites how much left" | | S: "change: two items" |
| any question | questions about options ("what can I buy?") | | U: no operation; `ui.help` answers |
| any question | undo / negation ("I did not buy it") | | U: the world keeps facts, not retractions |
| any question | quantities with units other than lei (euro, dollars) | | U: one money unit (leu/lei) |

**L7 (macros, shapes).** `patterns.sop` was migrated with `scripts/migrate-macros.mjs` (lead-ins, suffixes and 111 repeated lists are macros). The total, change, affordability and balance questions combine one or two items with optional counts (about 300 of the 480 patterns are such combinations); they are not one of the shape families (their value is a list of items), so they stay hand-written. One shape (`kids.shop.price`, 8 generated patterns) replaced three hand patterns. Two hand edits keep ties as before: `w.total.pay5.a` lists its own lead-in words instead of the question macro (which has `tell_me_the` and made "tell me the price of an eraser" a total question).
