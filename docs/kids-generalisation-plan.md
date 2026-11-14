# Kids worlds to general worlds: audit and plan

Reviewer block 2026-11-15 08:45 ("KIDS WORLDS become serious, reusable worlds"), steps (1) audit and (2) asks. Step (3), switching the bindings and deleting the worlds, comes later, after the typed worlds land. This document changes nothing at runtime.

Sources: the `canonical=` sentences of every pattern in `worlds/kids.*` (139: common 16, shapes 4, arith 39, shop 25, tasks 25, animals 8, time 22; `tests.sop` has 1,296 rows over the seven worlds and `coverage.md` lists their request shapes); the real set `training/eval/real-2026-11-15.jsonl` (649 turns) replayed on this tree (`node scripts/real-set.mjs run --reasoner matrix --tag -kidsaudit`); the vendored sopworld 0.114.0 (`src/vendor/sopworld/sopworld.mjs`); the live knowledge catalog (https://ml-circuits-research.github.io/sop-knowledge-worlds/worlds, index 8c85b4288d43, 34 worlds).

How the "answers now" columns were measured: each canonical sentence in a fresh session (the sentences that need context get one or two set-up turns first, such as "My dog is called Rex." before "What is my dog called?"), knowledge read from the live catalog, once with every world and once with the six content kids worlds hidden from the loader (kids.common stays, because 12 worlds import it). The probe script is a scratchpad file. It does not belong in the repository.

## Summary

| Kids world | Target (reviewer block) | Canonical | Answered by the kids world now | Right with the content kids worlds hidden | Gaps: KNOW / LIB / HOST (sentences) | Real turns it answers |
| --- | --- | --- | --- | --- | --- | --- |
| kids.common | conversation world (lang.common, w.lang.en) | 16 | 15 (1 goes to Talk and fails) | 14 (kids.common itself: it is the would-be conversation world); "How are you?" goes to geo.map once the others are hidden | 13 / 0 / 16 | 19 (14 greetings, thanks, "who am I", "I need to tell you something"; 1 questionable: "cool" -> "You are welcome"; 2 fallbacks of the removed hangman tab; 2 Romanian, partial) |
| kids.shapes | k.shapes + k.colours mixing; statements are taught facts (session.things) | 4 | 4 | 0 (1 partly: "a ruler is a kind of rectangle") | 2 / 4 / 4 | 0 (r0610, r0611: shape questions nobody answers) |
| kids.arith | core.calc + storyState, quantities of catalog things | 39 | 39 | 0 | 33 / 29 / 0 | 13 (6 word-problem turns right; 7 are answers to the removed profile tab that kids.arith wrongly reads as bee problems) |
| kids.shop | w.list (quantity, unit, price) + k.units.currency + k.food | 25 | 25 | 0 | 25 / 21 / 5 | 8 (all right: price and change questions) |
| kids.tasks | w.tasks (task, status, due, owner, order) + std.acts | 25 | 23 (2 fail on main) | 0 | 25 / 2 / 0 | 1 (right: "i should call grandma") |
| kids.animals | k.animals + session.things (pets, taught facts) | 8 | 8 | 3 (session.things: "can swim", "a cat called Tom", "my dog is called Rex") | 4 / 1 / 5 | 0 (r0244 "how many legs has a cow": nobody answers) |
| kids.time | k.time + std.time | 22 | 19 (2 fail on main, 1 is Talk's and right) | 1 ("What are the seasons?" by Talk) | 18 / 14 / 4 | 2 (right: "today is Friday", "what day is tomorrow?") |
| **all** | | **139** | **133** | **4 by general worlds (+14 kids.common by itself)** | **120 / 71 / 34** | **43 turns** |

Of the 139 canonical sentences only 3 need nothing new (session.things already reads them). 5 fail on main today: "Who is speaking to me?", "What lists do I have?", "What's still open for me?", "What are the weekend days?", "What is the time?". In the HOST column, H2 (the conversation world) covers all 16 kids.common sentences. Gaps are counted per sentence, so one sentence can count in several repositories.

Distinct asks: **10 [KNOW]** (K1-K10), **5 [LIB]** (L1-L5), and 7 host items (H1-H7, PSys2's own work in step 3). They are written out in questions.md, "Q18 kids worlds -> general worlds".

## What the catalog and the library already provide

| Need | Provided | Missing |
| --- | --- | --- |
| Numbers and operations | `core.calc` builtins add, sub, mul, div, idiv, mod, min, max, round; aggregates count, sum, argmax, argmin; `core.relation` with exact `linsolve` | operator words and frames (K4); sum over quantity x price (L3) |
| Word problems | `storyState(text, {verbs, numbers, pronouns, question, all, skip})`: set / add / remove / give, "how many does X have", "together" | comparisons, unknown start, "some", negation, passive, yes/no, "a/an" = 1, "to X", a number as subject ("One flies away"), refusal when giving more than held, money as a quantity with a unit, a story spread over turns (L1); verb effects from the catalog instead of a host lexicon (K5) |
| Time | k.time v5: months with `days` and `season_north`, seasons in order, weekdays with `weekend=true`, 24 hours with `hour12`, durations; builtins `time_add`, `time_diff` (hh:mm, ISO dates) and `weekday` (ISO date) | cycle arithmetic over named weekdays and months, 12-hour clock values, `now`/`today` from the host (L2); "o'clock", "half past", "half an hour" words and "today is X" frames (K7) |
| Shapes and colours | k.shapes (36 shapes + rhombus from PSys2: sides, corners, things), k.colours (33 colours, 25 mixes, primary/secondary from PSys2) | ruler as a rectangle thing, animal colours (K8); "how is a circle different from other shapes" (L4). k.colours.mix says black + red = maroon, while kids.shapes teaches brown: the taught fact must win in the session, so this is not a catalog change |
| Animals and pets | k.animals 314 animals: legs, sound, covering, can/cannot; session.things reads "my dog is called Rex", "I have a cat called Tom", "ducks can swim"; `typedWorldOf(session)`, `std.acts` ask / teach / forget with the taught tier | "pet" as a key (K9); "X has N legs" as a taught statement (L5); questions over the session's pets (H3) |
| Lists and tasks | `std.acts` make / remove / change / ask / teach / forget / complete; `std.schema` kinds, slots, views | the schemas `w.list` and `w.tasks` (K1, K2); list and task frames (K6); the provenance of a value by act ("why is milk done?") and a default list (L3) |
| Money | k.units: 153 currencies, leu/lei = RON with ban/bani | prices are not world knowledge: the 26 sample prices stay PSys2 sample data (H1, as decided at 01:00 on 2026-11-14) |
| Conversation | w.lang.en has "thanks" only as a skipped politeness word; lang.common has the phrase groups kids.common uses | conversation frames in w.lang.en (K3, optional: lang.common can hold them, H2) |

## Real-set turns by kids world (current tree, matrix reasoner)

| World | Turns | Target and note |
| --- | --- | --- |
| kids.common | r0148 "who am I?", r0166/r0216/r0630 "hello", r0373 "hai" (ro), r0588/r0591/r0594/r0597/r0600/r0603/r0606/r0612 "thanks", r0589 "I need to tell you something", r0224 "cool" (answered "You are welcome": questionable), r0628/r0629 "which move is best" (fallback of the removed hangman tab), r0080/r0268 (Romanian, partial) | conversation world (H2, K3) |
| kids.arith | r0194, r0195, r0201 (one-line word problems), r0541-r0543 (the same problem over three turns) | storyState (L1, K4, K5): giving 8 of 5 must refuse with the reason; "One flyes away" is a lose event by the last owner; the story carries across turns |
| kids.arith (wrong) | r0205, r0206, r0207, r0208, r0212, r0213, r0214 (answers to the removed profile tab: "Sînică", "Research" ...), read as bee problems | must not be read as word problems after the switch (H7) |
| kids.time | r0586 "I should tell you, today is Friday", r0587 "what day is tomorrow?" | std.time today + cycle_add (L2, K7) |
| kids.tasks | r0590 "i should call grandma" | w.tasks add (K2, K6) |
| kids.shop | r0598/r0624 "I want a puzzle and I pay 10 lei. What is the change?", r0599/r0627 "I want 2 pencils and I give the cashier 10 lei...", r0622/r0625 "a ball and a pencil and pay with 20 lei ... change", r0623/r0626 "how much does a pencil/ball cost?" | w.list price + basket total + change (K1, K6, L3, H1) |
| nobody (domain of a target) | r0244 "how many legs has a cow" (not understood), r0610 "how is a circle different from other shapes", r0611 "what makes a square special" | k.animals ask frame order (K10); contrast of a kind (L4) |

## Every canonical sentence: target and gaps

"Answers now" lists the world that answered on this tree. "Without" is the same run with kids.shapes, kids.arith, kids.shop, kids.tasks, kids.animals and kids.time hidden. Gap ids: K = knowledge repository, L = library, H = PSys2 host (see questions.md Q18 and the host list below).

### kids.common (16 canonical sentences)

| Canonical sentence | Answers now | Without the content kids worlds | Target | Exists now | Gaps |
| --- | --- | --- | --- | --- | --- |
| Can we talk? | kids.common | kids.common | conversation (lang.common) | kids.common phrase groups | H2 |
| Can you still recall my name? | kids.common | kids.common | conversation (lang.common) + session user name | kids.common state | H2 |
| Goodbye! | kids.common | kids.common | conversation (lang.common) | kids.common | H2, K3 |
| How are you doing today? | kids.common | geo.map | conversation (lang.common) | kids.common (geo.map steals it once the content kids worlds are hidden) | H2, K3 |
| How are you? | kids.common | geo.map | conversation (lang.common) | kids.common (geo.map steals it once hidden) | H2, K3 |
| I should tell you something. | kids.common | kids.common | conversation (lang.common) | kids.common | H2 |
| I should tell you, my name is Mia. | kids.common | kids.common | conversation (lang.common) + session user name | kids.common | H2, K3 |
| My name is Mia Lee. | kids.common | kids.common | conversation (lang.common) + session user name | kids.common | H2, K3 |
| Thank you! | kids.common | kids.common | conversation (lang.common) | kids.common; w.lang.en has thanks only as a skipped politeness word | H2, K3 |
| Thanks a ton buddy. | kids.common | kids.common | conversation (lang.common) | kids.common | H2, K3 |
| What is my name? | kids.common | kids.common | conversation (lang.common) + session user name | kids.common | H2, K3 |
| What should I call you? | kids.common | kids.common | conversation (lang.common) | kids.common | H2, K3 |
| Who am I chatting with? | kids.common | kids.common | conversation (lang.common) | kids.common | H2, K3 |
| Who are you exactly? | kids.common | kids.common | conversation (lang.common) | kids.common | H2, K3 |
| Who is speaking to me? | talk | talk | conversation (lang.common) | FAILS on main: Talk answers ("I don't know that yet") | H2, K3 |
| You can call me Ana. | kids.common | kids.common | conversation (lang.common) + session user name | kids.common | H2, K3 |

### kids.shapes (4 canonical sentences)

| Canonical sentence | Answers now | Without the content kids worlds | Target | Exists now | Gaps |
| --- | --- | --- | --- | --- | --- |
| A rhombus has 4 sides. | kids.shapes | not understood | session.things teach (k.shapes.shape sides) | k.shapes has rhombus sides=4; std.acts teach; no session.things reading of "X has N <key>" | L5, H3 |
| A ruler is a rectangle. | kids.shapes | session.things | session.things teach (k.shapes thing) | session.things reads it as "a kind of rectangle" (is_a, not shape); ruler not a k.shapes thing | L5, H3, K8 |
| Black and red make brown. | kids.shapes | art.draw | session.things teach of a k.colours.mix | k.colours.mix black+red gives=maroon (the taught fact must override in the session); no reading | L5, H3 |
| Zebras are black and white. | kids.shapes | art.draw | session.things teach (colour) | k.animals has no colour key for zebra; no reading | L5, H3, K8 |

### kids.arith (39 canonical sentences)

| Canonical sentence | Answers now | Without the content kids worlds | Target | Exists now | Gaps |
| --- | --- | --- | --- | --- | --- |
| A pencil was broken by Sam. | kids.arith | not understood | core.calc + storyState | storyState: no passive | L1, K5 |
| Amy has just found 4 shells. | kids.arith | not understood | core.calc + storyState | storyState add/remove (verbs from the host; "a"=1 not read) | K5, L1 |
| Ana bought 3 of her sandwiches. | kids.arith | not understood | core.calc + storyState | storyState add/remove (verbs from the host; "a"=1 not read) | K5, L1 |
| Ana does not give Ion any apples. | kids.arith | art.draw | core.calc + storyState | storyState: no negated event (art.draw draws 3 apples when hidden) | L1 |
| Ana gave Tom an apple. | kids.arith | not understood | core.calc + storyState | storyState give ("an"=1 and "to X" not read) | L1, K5 |
| Ana gave Tom some apples. | kids.arith | not understood | core.calc + storyState | storyState: no unknown amount | L1 |
| Ana gave an apple to Tom. | kids.arith | not understood | core.calc + storyState | storyState give ("an"=1 and "to X" not read) | L1, K5 |
| Ana has 3 fewer apples than Ion. | kids.arith | not understood | core.calc + storyState (relation, linsolve) | core.relation + linsolve exist; storyState has no comparison | L1, K4 |
| Ana has 3 more apples than Ion. | kids.arith | not understood | core.calc + storyState (relation, linsolve) | core.relation + linsolve exist; storyState has no comparison | L1, K4 |
| Ana has twice as many apples as Ion. | kids.arith | not understood | core.calc + storyState (relation, linsolve) | core.relation + linsolve exist; storyState has no comparison | L1, K4 |
| Ana is holding 4 pears. | kids.arith | not understood | core.calc + storyState | storyState set (verbs from the host) | K5 |
| Ben bought a pencil. | kids.arith | not understood | core.calc + storyState | storyState add/remove (verbs from the host; "a"=1 not read) | K5, L1 |
| Ben has how many extra apples than Ana? | kids.arith | not understood | core.calc + storyState (comparison question) | aggregates argmax exist; storyState answers only "how many" and "together" | L1, K4 |
| Ben lost 3 marbles yesterday. | kids.arith | not understood | core.calc + storyState | storyState add/remove (verbs from the host; "a"=1 not read) | K5, L1 |
| Count up all the marbles. | kids.arith | docs.editor | core.calc + storyState (together) | storyState together exists; the words come from the host | K4 |
| Does Lily beat Sam in stickers? | kids.arith | talk | core.calc + storyState (comparison question) | aggregates argmax exist; storyState answers only "how many" and "together" | L1, K4 |
| Does Tom have any apples? | kids.arith | talk | core.calc + storyState (yes/no) | storyState: no yes/no question | L1 |
| Has Tom got any apples? | kids.arith | not understood | core.calc + storyState (yes/no) | storyState: no yes/no question | L1 |
| How many apples did Tom have at first? | kids.arith | not understood | core.calc + storyState (unknown start) | storyState: no inverse ("at first") | L1, K4 |
| How many apples in total? | kids.arith | talk | core.calc + storyState (together) | storyState together exists; the words come from the host | K4 |
| How much less apples has Ben than Ana? | kids.arith | not understood | core.calc + storyState (comparison question) | aggregates argmax exist; storyState answers only "how many" and "together" | L1, K4 |
| Is Ben beating Ana in apples? | kids.arith | not understood | core.calc + storyState (comparison question) | aggregates argmax exist; storyState answers only "how many" and "together" | L1, K4 |
| Mia found a coin. | kids.arith | not understood | core.calc + storyState | storyState add/remove (verbs from the host; "a"=1 not read) | K5, L1 |
| Mia lost 3 marbles. | kids.arith | not understood | core.calc + storyState | storyState add/remove (verbs from the host; "a"=1 not read) | K5, L1 |
| Sam has broken 2 pencils. | kids.arith | not understood | core.calc + storyState | storyState add/remove (verbs from the host; "a"=1 not read) | K5, L1 |
| Spread 12 between 4 groups. | kids.arith | not understood | core.calc | builtins add/sub/mul/div exist; no operator words or frames (Talk: "I don't know that yet") | K4 |
| Tom ate 2 apples and now has 3. | kids.arith | not understood | core.calc + storyState (unknown start) | storyState: no "now has" after an event with unknown start | L1 |
| Tom ate 2 apples. | kids.arith | not understood | core.calc + storyState | storyState add/remove (verbs from the host; "a"=1 not read) | K5, L1 |
| Tom had some apples. | kids.arith | not understood | core.calc + storyState | storyState: no unknown amount | L1 |
| Tom has 5 apples left. | kids.arith | not understood | core.calc + storyState | storyState set (verbs from the host) | K5 |
| Tom has eaten a cake. | kids.arith | not understood | core.calc + storyState | storyState add/remove (verbs from the host; "a"=1 not read) | K5, L1 |
| What do I get doubling 13? | kids.arith | not understood | core.calc | builtins add/sub/mul/div exist; no operator words or frames (Talk: "I don't know that yet") | K4 |
| What is 10 halved? | kids.arith | talk | core.calc | builtins add/sub/mul/div exist; no operator words or frames (Talk: "I don't know that yet") | K4 |
| What is 7 plus 5? | kids.arith | talk | core.calc | builtins add/sub/mul/div exist; no operator words or frames (Talk: "I don't know that yet") | K4 |
| What is double 6? | kids.arith | talk | core.calc | builtins add/sub/mul/div exist; no operator words or frames (Talk: "I don't know that yet") | K4 |
| What is half of 10? | kids.arith | talk | core.calc | builtins add/sub/mul/div exist; no operator words or frames (Talk: "I don't know that yet") | K4 |
| Who has more apples? | kids.arith | not understood | core.calc + storyState (comparison question) | aggregates argmax exist; storyState answers only "how many" and "together" | L1, K4 |
| Who has the most apples? | kids.arith | not understood | core.calc + storyState (comparison question) | aggregates argmax exist; storyState answers only "how many" and "together" | L1, K4 |
| Whose apples are the most? | kids.arith | not understood | core.calc + storyState (comparison question) | aggregates argmax exist; storyState answers only "how many" and "together" | L1, K4 |

### kids.shop (25 canonical sentences)

| Canonical sentence | Answers now | Without the content kids worlds | Target | Exists now | Gaps |
| --- | --- | --- | --- | --- | --- |
| Can I buy 3 pencils? | kids.shop | not understood | w.list (quantity, unit, price) + core.calc + wallet (compare) | core.calc lt/sub exist; no frames | K1, K6, L3 |
| Change for 2 balls with 5 lei? | kids.shop | not understood | w.list (quantity, unit, price) + core.calc (total of a basket, change = paid - total) | core.calc sub; aggregates sum one key only (no sum of quantity x price) | K1, K6, L3, H1 |
| Change from thirty lei, puzzle and 2 kites. | kids.shop | not understood | w.list (quantity, unit, price) + core.calc (total of a basket, change = paid - total) | core.calc sub; aggregates sum one key only (no sum of quantity x price) | K1, K6, L3, H1 |
| How much do 3 pencils cost? | kids.shop | not understood | w.list (quantity, unit, price) + core.calc (price x quantity) | core.calc mul; no price facts in the catalog (sample price list = host data) | K1, K6, H1 |
| How much money do I have left after I buy 2 pencils? | kids.shop | not understood | w.list (quantity, unit, price) + core.calc + wallet (compare) | core.calc lt/sub exist; no frames | K1, K6, L3 |
| How much money is left? | kids.shop | not understood | storyState over money (k.units.currency RON) + core.calc (question) | storyState "how many" only | L1, K6 |
| I buy 3 pencils. | kids.shop | not understood | w.list (quantity, unit, price) + core.calc + storyState over money (k.units.currency RON) + core.calc | no w.list schema; storyState has no negation / missing item ask | K1, K5, K6, L1 |
| I buy something. | kids.shop | not understood | w.list (quantity, unit, price) + core.calc + storyState over money (k.units.currency RON) + core.calc | no w.list schema; storyState has no negation / missing item ask | K1, K5, K6, L1 |
| I do not buy the ball. | kids.shop | talk | w.list (quantity, unit, price) + core.calc + storyState over money (k.units.currency RON) + core.calc | no w.list schema; storyState has no negation / missing item ask | K1, K5, K6, L1 |
| I give Ana 10 lei. | kids.shop | art.draw | storyState over money (k.units.currency RON) + core.calc | storyState add/remove/give with the host verbs; "I"/"me" as owner and the money unit not read | L1, K5, K6 |
| I got 5 lei back for a book. | kids.shop | not understood | storyState over money (k.units.currency RON) + core.calc | storyState add/remove/give with the host verbs; "I"/"me" as owner and the money unit not read | L1, K5, K6 |
| I just bought 3 pencils. | kids.shop | not understood | w.list (quantity, unit, price) + core.calc + storyState over money (k.units.currency RON) + core.calc | no w.list schema; storyState has no negation / missing item ask | K1, K5, K6, L1 |
| I just found 5 lei. | kids.shop | not understood | storyState over money (k.units.currency RON) + core.calc | storyState add/remove/give with the host verbs; "I"/"me" as owner and the money unit not read | L1, K5, K6 |
| I paid 2 lei for a sweet. | kids.shop | not understood | storyState over money (k.units.currency RON) + core.calc | storyState add/remove/give with the host verbs; "I"/"me" as owner and the money unit not read | L1, K5, K6 |
| I spent 5 lei. | kids.shop | not understood | storyState over money (k.units.currency RON) + core.calc | storyState add/remove/give with the host verbs; "I"/"me" as owner and the money unit not read | L1, K5, K6 |
| I start with 30 lei. | kids.shop | not understood | storyState over money (k.units.currency RON) + core.calc | k.units: leu/lei = RON; storyState set; no currency quantity in storyState | L1, K6 |
| I want a puzzle and I pay 10 lei. What is the change? | kids.shop | not understood | w.list (quantity, unit, price) + core.calc (total of a basket, change = paid - total) | core.calc sub; aggregates sum one key only (no sum of quantity x price) | K1, K6, L3, H1 |
| Is 2 balls affordable? | kids.shop | not understood | w.list (quantity, unit, price) + core.calc + wallet (compare) | core.calc lt/sub exist; no frames | K1, K6, L3 |
| Mom gave me 5 lei. | kids.shop | not understood | storyState over money (k.units.currency RON) + core.calc | storyState add/remove/give with the host verbs; "I"/"me" as owner and the money unit not read | L1, K5, K6 |
| My wallet has 15 lei. | kids.shop | not understood | storyState over money (k.units.currency RON) + core.calc | k.units: leu/lei = RON; storyState set; no currency quantity in storyState | L1, K6 |
| Show me my cash total. | kids.shop | not understood | storyState over money (k.units.currency RON) + core.calc (question) | storyState "how many" only | L1, K6 |
| The pencil is 3 lei. | kids.shop | not understood | w.list (quantity, unit, price) + core.calc (teach a price) | no w.list schema | K1, K6 |
| The price of a kite is 9 lei. | kids.shop | not understood | w.list (quantity, unit, price) + core.calc (teach a price) | no w.list schema | K1, K6 |
| What did I pay? | kids.shop | kids.common | storyState over money (k.units.currency RON) + core.calc (unknown paid, from change) | storyState: no inverse | L1, K6 |
| What do 3 pencils cost? | kids.shop | talk | w.list (quantity, unit, price) + core.calc (price x quantity) | core.calc mul; no price facts in the catalog (sample price list = host data) | K1, K6, H1 |

### kids.tasks (25 canonical sentences)

| Canonical sentence | Answers now | Without the content kids worlds | Target | Exists now | Gaps |
| --- | --- | --- | --- | --- | --- |
| Add a reminder about the dishes. | kids.tasks | not understood | w.tasks (task, status, due, owner, order, list) + std.acts (reminder = task with due) | no schema, no frames | K2, K6 |
| Add milk to my list. | kids.tasks | not understood | w.tasks (task, status, due, owner, order, list) + std.acts / w.list | std.acts make; no w.tasks/w.list schema, no frames | K1, K2, K6 |
| Add to my shopping list. | kids.tasks | not understood | w.tasks (task, status, due, owner, order, list) + std.acts / w.list | std.acts make; no w.tasks/w.list schema, no frames | K1, K2, K6 |
| Count the stuff on the list. | kids.tasks | not understood | w.tasks (task, status, due, owner, order, list) + std.acts (count) | aggregates count; no schema, no frames | K2, K6 |
| Did I finish my homework? | kids.tasks | not understood | w.tasks (task, status, due, owner, order, list) + std.acts (status) | std.acts ask; no schema | K2, K6 |
| Does my list have milk? | kids.tasks | not understood | w.tasks (task, status, due, owner, order, list) + std.acts (contains) | std.acts ask; no schema | K2, K6 |
| Have I finished my homework? | kids.tasks | not understood | w.tasks (task, status, due, owner, order, list) + std.acts (status) | std.acts ask; no schema | K2, K6 |
| How long is my list? | kids.tasks | media.music | w.tasks (task, status, due, owner, order, list) + std.acts (count) | aggregates count; no schema, no frames | K2, K6 |
| How many chores remain for us? | kids.tasks | not understood | w.tasks (task, status, due, owner, order, list) + std.acts (count) | aggregates count; no schema, no frames | K2, K6 |
| How many things still open? | kids.tasks | not understood | w.tasks (task, status, due, owner, order, list) + std.acts (count) | aggregates count; no schema, no frames | K2, K6 |
| I didn't buy milk. | kids.tasks | not understood | w.tasks (task, status, due, owner, order, list) + std.acts (negated: nothing changes) | no schema | K2, K6 |
| I didn't finish my homework. | kids.tasks | not understood | w.tasks (task, status, due, owner, order, list) + std.acts (negated: nothing changes) | no schema | K2, K6 |
| I just finished my reading. | kids.tasks | not understood | w.tasks (task, status, due, owner, order, list) + std.acts (mark done) | std.acts change; no schema | K2, K6 |
| Is homework on my list? | kids.tasks | art.draw | w.tasks (task, status, due, owner, order, list) + std.acts (contains) | std.acts ask; no schema | K2, K6 |
| Put bread on my list. | kids.tasks | docs.editor | w.tasks (task, status, due, owner, order, list) + std.acts / w.list | std.acts make; no w.tasks/w.list schema, no frames | K1, K2, K6 |
| Reading is over for me. | kids.tasks | docs.editor | w.tasks (task, status, due, owner, order, list) + std.acts (mark done) | std.acts change; no schema | K2, K6 |
| Remove milk from my list. | kids.tasks | not understood | w.tasks (task, status, due, owner, order, list) + std.acts / w.list | std.acts remove; no schema | K1, K2, K6 |
| Set a reminder to water the plants. | kids.tasks | art.draw | w.tasks (task, status, due, owner, order, list) + std.acts (reminder = task with due) | no schema, no frames | K2, K6 |
| Take milk off my list. | kids.tasks | not understood | w.tasks (task, status, due, owner, order, list) + std.acts / w.list | std.acts remove; no schema | K1, K2, K6 |
| What is left to do? | kids.tasks | talk | w.tasks (task, status, due, owner, order, list) + std.acts (open tasks) | "What's still open" FAILS on main (Talk) | K2, K6 |
| What lists do I have? | ui.help | ui.help | w.tasks (task, status, due, owner, order, list) + std.acts / w.list (lists) | "What lists do I have?" FAILS on main (ui.help) | K1, K2, K6 |
| What's still open for me? | talk | talk | w.tasks (task, status, due, owner, order, list) + std.acts (open tasks) | "What's still open" FAILS on main (Talk) | K2, K6 |
| Which list did you put it on? | kids.tasks | not understood | w.tasks (task, status, due, owner, order, list) + std.acts (which list, default to-do) | no schema | K2, L3 |
| Which list names exist? | kids.tasks | not understood | w.tasks (task, status, due, owner, order, list) + std.acts / w.list (lists) | "What lists do I have?" FAILS on main (ui.help) | K1, K2, K6 |
| Why is milk done? | kids.tasks | not understood | w.tasks (task, status, due, owner, order, list) + std.acts (why: the act that set the status) | no provenance of a value by act in std.acts | K2, L3 |

### kids.animals (8 canonical sentences)

| Canonical sentence | Answers now | Without the content kids worlds | Target | Exists now | Gaps |
| --- | --- | --- | --- | --- | --- |
| A zebra can swim. | kids.animals | session.things | session.things teach (k.animals can) | session.things reads it today (without kids.animals) | - |
| A zebra has 4 legs. | kids.animals | not understood | session.things teach (k.animals legs) | k.animals zebra legs=4; no reading of "X has N legs" | L5, H3 |
| Do I have a dog? | kids.animals | art.draw | session.things question (std.acts ask over typedWorldOf) | typedWorldOf / ask exist; no session.things question binding; "pet" is no k.animals key | H3, K9 |
| I have a cat called Tom. | kids.animals | session.things | session.things (pet = thing of the session) | session.things reads it today | - |
| My dog is called Rex. | kids.animals | session.things | session.things (pet = thing of the session) | session.things reads it today | - |
| Name of my pet? | kids.animals | kids.common | session.things question (std.acts ask over typedWorldOf) | typedWorldOf / ask exist; no session.things question binding; "pet" is no k.animals key | H3, K9 |
| What is my dog called? | kids.animals | not understood | session.things question (std.acts ask over typedWorldOf) | typedWorldOf / ask exist; no session.things question binding; "pet" is no k.animals key | H3, K9 |
| What pets do I have? | kids.animals | art.draw | session.things question (std.acts ask over typedWorldOf) | typedWorldOf / ask exist; no session.things question binding; "pet" is no k.animals key | H3, K9 |

### kids.time (22 canonical sentences)

| Canonical sentence | Answers now | Without the content kids worlds | Target | Exists now | Gaps |
| --- | --- | --- | --- | --- | --- |
| April has how many days? | kids.time | not understood | k.time + std.time (ask k.time.month days) | k.time.month days=30; ask exists; no frame for the order | K10 |
| Can you tell me the time? | kids.time | art.draw | k.time + std.time (now from the host) | "What is the time?" FAILS on main (Talk gives the dictionary sense) | L2, H4, H5 |
| Count hours 9 to 12. | kids.time | not understood | k.time + std.time (time_diff, 12-hour) | time_diff on hh:mm exists; no 12-hour reading | L2, K7 |
| Count the hours between 2 and 6. | kids.time | not understood | k.time + std.time (time_diff, 12-hour) | time_diff on hh:mm exists; no 12-hour reading | L2, K7 |
| Friday is how many days away? | kids.time | not understood | k.time + std.time (cycle_diff) | builtins weekday/time_diff only on ISO dates; no cycle arithmetic over k.time.weekday | L2, K10 |
| How many days has April? | kids.time | not understood | k.time + std.time (ask k.time.month days) | k.time.month days=30; ask exists; no frame for the order | K10 |
| How many days until Saturday? | kids.time | not understood | k.time + std.time (cycle_diff) | builtins weekday/time_diff only on ISO dates; no cycle arithmetic over k.time.weekday | L2, K10 |
| I should tell you, today is Friday. | kids.time | kids.common | k.time + std.time (session today / month / clock) | no session date statement; no "o'clock" words | L2, K7 |
| Name all the seasons of the year. | kids.time | not understood | k.time (Talk ask) | "What are the seasons?" answered by Talk now | K10 |
| Name the months of spring. | kids.time | not understood | k.time (ask month season_north) | k.time.month season_north; no frame | K10 |
| The clock says 4 o'clock. | kids.time | not understood | k.time + std.time (session today / month / clock) | no session date statement; no "o'clock" words | L2, K7 |
| This month is May. | kids.time | not understood | k.time + std.time (session today / month / clock) | no session date statement; no "o'clock" words | L2, K7 |
| We are in March. | kids.time | not understood | k.time + std.time (session today / month / clock) | no session date statement; no "o'clock" words | L2, K7 |
| We are on Friday today. | kids.time | not understood | k.time + std.time (session today / month / clock) | no session date statement; no "o'clock" words | L2, K7 |
| We are on Tuesday. | kids.time | not understood | k.time + std.time (session today / month / clock) | no session date statement; no "o'clock" words | L2, K7 |
| What are the seasons? | talk | talk | k.time (Talk ask) | "What are the seasons?" answered by Talk now | K10 |
| What are the weekend days? | talk | talk | k.time (weekday weekend=true) | "What are the weekend days?" FAILS on main (Talk: "I know a weekend, but not its days yet") | H4 |
| What is the time? | talk | talk | k.time + std.time (now from the host) | "What is the time?" FAILS on main (Talk gives the dictionary sense) | L2, H4, H5 |
| What time is 2 hours after 3 o'clock? | kids.time | not understood | k.time + std.time (time_add, 12-hour) | time_add on hh:mm exists; no "o'clock"/"half an hour" words, no 12-hour writing | L2, K7 |
| What time is half an hour after 3 o'clock? | kids.time | not understood | k.time + std.time (time_add, 12-hour) | time_add on hh:mm exists; no "o'clock"/"half an hour" words, no 12-hour writing | L2, K7 |
| Which days are the weekend? | kids.time | talk | k.time (weekday weekend=true) | "What are the weekend days?" FAILS on main (Talk: "I know a weekend, but not its days yet") | H4 |
| Which months are in summer? | kids.time | talk | k.time (ask month season_north) | k.time.month season_north; no frame | K10 |

## Host items (PSys2, step 3)

- **H1** The 26 sample prices of kids.shop (lei) stay PSys2 sample data, marked as such, and seed the price of `w.list` entries (or a session price table). They are not catalog facts.
- **H2** The conversation world: name, greeting, thanks, goodbye, "who are you", "how are you", "I should tell you something", with the user's name in the session. Its phrase groups go in lang.common (ADR-007). It replaces kids.common in the 12 `imports=world.kids.common` and in the boot `always` list.
- **H3** session.things bindings: questions over the session's things (what is my dog called, what pets do I have, do I have a dog, name of my pet) and the statements "X has N legs/sides", "X is <colour> (and <colour>)", "X is a <shape>", "A and B make C" as taught facts that override the catalog for the session (unless L5 gives them by type).
- **H4** Talk bindings for k.time facts that exist but are not read: weekend days (`weekend=true`), months of a season, "what is the time" (today it gives the dictionary sense).
- **H5** The clock: `now`/`today` from the host for "Can you tell me the time?", unless a stated "today is Friday" overrides it.
- **H6** Untangle the imports before deleting: art.draw imports kids.shapes; data.charts imports kids.arith, kids.shop, kids.tasks and kids.animals; docs.editor imports kids.tasks, kids.animals and kids.arith; session.conversation composes all six; 12 worlds import kids.common; about 100 files in src/, tests/, scripts/ and docs/webchat name a kids world (tests/kids-worlds.test.mjs, tests/talk-kids-frames.test.mjs, src/knowledge/learned.mjs, src/dialog/conversation.mjs, src/reasoner/index.mjs, src/translate/replies.en-ro.mjs ...).
- **H7** After the switch, the seven profile-tab answers (r0205-r0214) must not be read as word problems. A bare name with no story in focus is not a story sentence.

## Switch and delete order for step (3)

The order goes by gaps and dependencies: the worlds whose targets exist first, kids.common last because 12 worlds import it. The typed worlds (Q16) have to land first.

| Step | World | Needs before the switch | Then delete |
| --- | --- | --- | --- |
| 1 | kids.animals | H3 (pet questions, "has N legs"); K9 is optional | worlds/kids.animals; drop it from data.charts and docs.editor imports and from the session.conversation compose |
| 2 | kids.shapes | H3 (colour, shape, mix statements); L5 or host patterns; K8 optional | worlds/kids.shapes; drop it from art.draw imports |
| 3 | kids.time | L2 (std.time), K7, K10, H4, H5 | worlds/kids.time |
| 4 | kids.tasks | K2 (w.tasks), K6 (frames), L3 (why, default list) | worlds/kids.tasks; data.charts and docs.editor imports |
| 5 | kids.arith | L1 (storyState), K4, K5, H7 | worlds/kids.arith; data.charts and docs.editor imports |
| 6 | kids.shop | K1 (w.list), K6, L1 (money), L3 (basket total), H1 | worlds/kids.shop; data.charts imports |
| 7 | kids.common | H2 (the conversation world), K3 optional | worlds/kids.common; the 12 imports, `always`, session.conversation |

At every step: every canonical sentence of the world and every real-set turn it answered must still pass, and the only change in the other worlds' test-world rows may be rows that become right.

## Measure plan

Before step 1 and after each step, on the same machine:
- **Real headline**: `node scripts/real-set.mjs run --reasoner matrix` then `report`: right / judged of the real set and the 43 turns listed above (36 legitimate; the 7 profile rows must stop being read as bee problems).
- **Canonical sentences**: the 139 sentences of this document in fresh sessions with set-up turns (the probe used here). Target 139 right. Today 133 by the kids worlds plus 1 by Talk, 5 fail.
- **test-world**: `node src/cli.mjs test-world all`, raw failing rows and first failures per session. The kids worlds' own 1,296 test rows move to the target worlds' tests.sop as each world is deleted (kept, not dropped: ported when only the wording of an expectation changes).
- **Boot bytes**: requests, bytes and chat-ready time of the browser boot (the probe of the tab-cut landing). Last measured total: 213 requests, 6,655,612 bytes, 5.9 s.

Current runtime size of the kids worlds in the browser build (`docs/webchat/worlds/<id>/`, bundle.json + ops.mjs + fns.mjs; coverage.md and datagen.mjs are not runtime):

| World | bundle.json | ops.mjs | fns.mjs | runtime total | source dir (worlds/) |
| --- | --- | --- | --- | --- | --- |
| kids.common | 72,820 | 4,856 | - | 77,676 | 158,711 |
| kids.shapes | 30,477 | 358 | 466 | 31,301 | 49,276 |
| kids.arith | 209,129 | 17,859 | 7,795 | 234,783 | 341,610 |
| kids.shop | 538,115 | 10,557 | 8,550 | 557,222 | 629,569 |
| kids.tasks | 240,824 | 11,945 | 8,634 | 261,403 | 352,730 |
| kids.animals | 72,179 | 360 | 2,244 | 74,783 | 105,403 |
| kids.time | 288,681 | 8,655 | 4,896 | 302,232 | 395,651 |
| **total** | **1,452,225** | **54,590** | **32,585** | **1,539,400** | **2,032,950** |

kids.common is in the boot `always` list. session.conversation, also in `always`, composes the other six. The boot probe in step 3 must confirm how many of these bytes are actually fetched at boot, before the first switch.
