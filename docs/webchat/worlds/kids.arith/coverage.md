# kids.arith — request-shape catalogue (rule formalizer)

Status: **S** = supported, with a test in `tests.sop` (the `doc=` text of the `t.arith.swNNN` tests is the class name used below); **U** = unsupported, with the reason.
All patterns are in `patterns.sop` (older families first, the rule-sweep families `sw.*` last); fillers, politeness and chat abbreviations come from the shared prefix/suffix alternations (`uh`, `um`, `hey`, `can u`, `pls`, `thx`, `rn`, ...).

## Statements (state changes)
| Operation | Request shape | Example | Status |
| --- | --- | --- | --- |
| holding | plain / "has got" / "now" | Tom has 5 apples. | S (older tests n1-n25) |
| holding | modifiers, possessive, noun-first, belongs-to | Ana is holding 4 pears. / Ana's got 4 pears. / 4 pears belong to Ana. / FYI Ana has 4 pears left. | S: "statement: have with modifiers" |
| holding | none / negation | Ben has zero pears. / Ben doesn't have any pears. / Ben ran out of pears. | S: "statement: has none" |
| holding | user as owner, number words | I have five marbles. | S (n13, n15, number-word tests) |
| buy | verb synonyms, fillers, tails, passive, "from the shop" | Zoe just bought 5 pencils. / 5 pencils were bought by Zoe. / Zoe got 5 pencils from the shop. | S: "statement: buy ..." |
| eat, lose, break, receive | verb synonyms, perfect tense, passive, tails (today/yesterday/now), "a/an" | Tom has just eaten 3 apples. / 3 apples were lost by Tom. / Amy has just found 4 shells. | S: "statement: eat/lose/..." |
| give | direct / "to" / "from" / "of his", verbs hand/pass/send | Ana gives Tom 3 pears. | S (older tests) |
| all change verbs | ellipsis and pronouns ("He ate 2.") | Tom has 9 apples. He ate 3. | S (older tests n11, n20) |
| any | two statements in one sentence | Tom has 5 apples and Ana has 4. | S (older); long run-ons are the dispatcher's job |

## Questions
| Operation | Request shape | Example | Status |
| --- | --- | --- | --- |
| count (holding) | standard | How many apples does Tom have? | S (n3); shape `kids.arith.holding` (ask.count with the agent as `cont`) generates the question, imperative, wish, indirect and "Tom has how many apples" forms (tests sh01 to sh03) |
| count | noun-first, fillers, "is at", number-of, possessive count, after-event, ellipsis of the item | Leo stickers how many / Uh Leo has how many stickers / How many stickers is Leo at now / What is Leo's sticker number | S: "holding question ..." |
| count | typo ("hs", "hass", "stikers") | mia hs 7 marbles | S via the typo corrector when the sentence is otherwise known; otherwise U (engine typo budget, three words per sentence) |
| has | do/does/has, "any ... for X", "is there ... with X", "do u know if", "still" | Any pears for Ben? / Do u know if Ben has pears? | S: "has-any question" |
| total (everybody) | altogether / in total / whole group / sum of everybody's / add all up | All the stickers total? / Add all the stickers up for me. | S: "total of everybody" |
| total (two people) | together / between / sum of A and B's / noun-first / "A + B" | Total marbles for Leo and Zoe. / Marbles Leo + Zoe? | S: "total of two people" |
| leader | who has the most / highest / biggest pile / person with the most / whose X are the most | Who has the highest number of stickers? | S: "who has the most" |
| leader (pair) | who has more A or B, "A or B more X?", "more X: A or B", "A vs B who wins", "between A and B who has more", "who is ahead on X" | Whos got more marbles, Leo or Zoe? | S: "who has more between two" (order of the pair follows the sentence) |
| gap | how many more/fewer, difference, lack, behind, short, "how far behind", "compared to" | How many marbles does Zoe lack compared to Leo? | S: "gap ..." |
| verdict | does A have more than B / beat / ahead of / "A has more than B, right?" | Does Lily beat Sam in stickers? | S: "verdict ..." |
| any question | no number or item | Who has more apples? | S as "unparsed": n5 (the world asks for the numbers) |

## Arithmetic
| Operation | Request shape | Example | Status |
| --- | --- | --- | --- |
| calc plus/minus/times/divide | symbol and word forms, "whats", "can u do", "calc", "for me", "is?", "equals what", words for numbers | Whats 15 minus 8 / 15 less 8 is? / 6 x 7 pls / 20 div 4 | S: "calc: ..." |
| calc | "N more/less than M", "N from M", "add N and M for me" | What is 5 more than 7? / What is 8 from 15? | S |
| divide | sharing story | If I share 20 among 4 how many each? | S |
| double / half | doubling, doubled, "give me double", halve, "in half", "half of" | Could u halve 12 for me | S: "calc: double and half" / "calc: half" ("give me double 13" loses to ui.avatar, see below) |

## Not supported
* `+`/`-` next to a word (`7 +5` is fine, `march + 4` is dropped by the tokenizer): engine, `src/formalizer/rules/normalize.mjs`.
* possessives without an apostrophe ("leos marbles", "zoes marbles"): the `agent` class needs an apostrophe form; engine.
* mis-spelled number words ("fourty"): `src/formalizer/rules/numbers.mjs`.
* "Tom vs Ana, how many more apples for Tom?" and "how many less marbles does zoe have": the second person is implicit; needs a reference to the last pair of agents.
* "give me double 13" in no-tab sessions: `ui.avatar` (`give me ...`) outranks it by priority; routing, not rules.
* a statement and a question in one run-on sentence ("tom got 5 apples and ana gave him 3 more, how many apples does tom have now"): dispatcher splitting.
* more than two people in "total" / "who has more".

**L7 (macros, shapes).** `patterns.sop` was migrated with `scripts/migrate-macros.mjs` (lead-ins, suffixes and 40 repeated lists are macros). One shape (`kids.arith.holding`, 5 generated patterns) replaced four hand patterns. The statements (holding, buy, eat, give, ...), total, leader, gap, verdict and calc questions take one or two agents, items and numbers in many orders and are not one of the shape families; they stay hand-written.
