# DESCRIBE-ALL for the conversation worlds (2026-11-12)

One section per world, appended as each description lands. Method: `PSYS_GEN_PATTERNS=add|only`, `scripts/e1-collect.mjs --mode rules --sets operational,dialogues`, compared with `scripts/e3-compare.mjs`; base is the default (hand-written only) run. Gate: no new wrong answer in `add`. In `only` the baseline for "all worlds" is an `only` run without the world's description.

## kids.arith

- Descriptions: 28; generated patterns (add): 53.
- Hand-written patterns of the described operations: 264 (pattern wires; shapes are separate). `only` drops 264.
- Hand-written patterns dropped by `only`: 264, replaced by 53 generated ones. Of the dropped, 17 were the reading of at least one set case that got worse (the description misses what they said); the other 247 were not the winning reading of any lost case in these sets (an upper bound on what the description could replace: the sets do not exercise every pattern). Lines: describe.sop 1145, dropped patterns about 1320.

Audited world only, right/wrong/not understood (operational and dialogue sets, rules mode). Base = hand-written only.

| mode | operational base | operational gen | dialogues base | dialogues gen |
|---|---|---|---|---|
| add | 143/2/0 of 145 | 143/2/0 of 145 | 113/1/3 of 117 | 114/1/2 of 117 |
| only | 143/2/0 of 145 | 124/4/17 of 145 | 113/1/3 of 117 | 108/6/3 of 117 |

Gate (add): new wrong answers in any world: 0. Changes vs base (all worlds): {"not_understood->right":1}.

`only` changes vs the previous `only` run without this description (all worlds): {"right->not_understood":17,"partly->not_understood":1,"right->wrong":8,"not_understood->right":1}.

Description gaps that cost cases in `only` (what the hand-written patterns say and the description cannot):

- **Reversed or non-adjacent operand order**: "take 7 away from 16", "subtract 6 from 20", "2 less than 6" (the description must not claim `less than`: it reverses the operands, an early draft of it gave a new wrong answer in `add` and was removed).
- **Symbols and chains**: `/`, `-`, `*` are not SOP atoms, so "8 / 2", "14 - 8", "3*4" stay hand-written; chained arithmetic ("7 plus 5 minus 2") and "squared" have no description.
- **Two statements in one sentence** ("Ben has 12 marbles and loses 5", "gives away 6", "Tom has 2 apples and Ana has 3", "gives 3 of his pears"): needs a multi-wire emit with a second subject; descriptions state one operation per wire.
- **Hand-written shapes that already cover the phrase** ("how many pears does Ana have now?" variants with typos, "if i add eight and seven what do i get" through a shape with a lead-in).
- Added to the description after the first run: the omitted-item forms ("Tom eats 3", "Tom gets 3 more": item resolved by `recent(...)`, which the class of an argument can carry as it is), "whats left for Mia", "they/we" totals, the `to` order of give, and the new generic frame `askpred` ("what is 6 plus 3": opener, first argument, verb, second argument).
- Not found in the sets but visible in the generated patterns: optional words (`prep`, `unit`) are always optional, so an operand pair with an optional operator word reads "6 3"; the calc description therefore puts the operator words in `verb` (mandatory) and uses `pred` / `askpred`.


## kids.tasks

- Descriptions: 18; generated patterns (add): 42.
- Hand-written patterns of the described operations: 231 (pattern wires; shapes are separate). `only` drops 228.
- Hand-written patterns dropped by `only`: 228, replaced by 42 generated ones. Of the dropped, 11 were the reading of at least one set case that got worse (the description misses what they said); the other 217 were not the winning reading of any lost case in these sets (an upper bound on what the description could replace: the sets do not exercise every pattern). Lines: describe.sop 677, dropped patterns about 1140.

Audited world only, right/wrong/not understood (operational and dialogue sets, rules mode). Base = hand-written only.

| mode | operational base | operational gen | dialogues base | dialogues gen |
|---|---|---|---|---|
| add | 34/3/1 of 38 | 34/3/1 of 38 | 48/2/1 of 51 | 48/2/1 of 51 |
| only | 34/3/1 of 38 | 25/5/8 of 38 | 48/2/1 of 51 | 40/5/6 of 51 |

Gate (add): new wrong answers in any world: 0. Changes vs base (all worlds): {"not_understood->right":1}.

`only` changes vs the previous `only` run without this description (all worlds): {"wrong->right":2,"right->wrong":8,"right->not_understood":13,"wrong->not_understood":1}.

Description gaps that cost cases in `only`:

- **Optional completing words cannot be made mandatory.** `rest`, `prep`, `unit` and `tverb` are always optional in the generated pattern, so a form whose only anchor is a trailing word ("why is X done", "is X done", "is X on my list" without a list name, "add X to my list") would match any sentence with a free-text argument. Those forms stay hand-written. The first draft had a bare "add X" and `short` frames for the free-text commands; they stole sentences from other worlds in `add` ("add bananas 4 then remove pears", "ok thanks" as a reminder, "What is 7 times 8?" as a reminder), so every description here has `skip=short` and the bare form is not described.
- **The default list (no name given).** The hand-written patterns emit `arg.list=to-do` (or none, or `assumed=true`) depending on the form; a description states one emit per wire and every form of "add X" would share it, so only the forms with a named list (a lexicon of list names, `lex.kids.tasks.listnames`) are described.
- **Free-text list names** ("my birthday party list") need `{list:words}` followed by the mandatory word "list"; the generator has no mandatory trailing word, so only the lexicon of list names is used.
- **Discourse forms**: "cross milk off", "what is still on it?", "any reminders for me?", pronoun and ellipsis follow-ups, which the hand-written patterns express with `recent(...)` and context slots.
- Added after the first run: the two question forms of show and pending ("what is on my shopping list", "what is still on my shopping list") and the `asn` frame for "mark X as done".

