# Proposal: `std.grammar` (sopworld), the functions that apply `w.lang.en`

Written by PSys2, 2026-11-14, in the library's question format. Task 2 of the reviewer entry "2026-11-14 01:00" (English as a world, Q10): the grammar as facts and rules goes to sop-knowledge-worlds as
`w.lang.en` (this directory is the handover); the functions that apply it go to sopworld as `std.grammar`. PSys2 already runs a thin local module over the same facts (`src/lang/en.mjs`), so every function
below has a working reference implementation and a set of cases (section 5).

## 1. Why a library function and not a PSys2 module

Seven modules of PSys2 wrote the same closed classes again (five lists of determiners, four of pronouns, three of prepositions, two of ordinals), and three of them each implemented a piece of the same algorithm
(split a coordination, copy the shared part of a clause, expand "and a yellow one"). A host that wants English should load a world and call a function, not copy a list. The facts are data (wires, in a world); the
algorithms are small, pure and need the compute budget: they belong with `std.focus`, `std.fill` and `std.dialogue` (the reviewer's earlier lines already say "the library's segmenter should be the cut point").

## 2. What it reads: the facts of `w.lang.en`

Closed classes (`lang.en.det`, `pron`, `anaphor`, `prep`, `ordinal`, `numeral`), morphology (`inflect` rules in order, `irregular`, `noun.exception`, `contraction`), clause structure (`joiner`, `frame-lead`,
`correction`, `answer`, `wh`, `aux`, `qframe`, `neg`), ellipsis markers (`ellipsis.lead|trail|repeat|starter|param`), argument frames (`lang.en.frame`: one per way of saying an act, 176 today) and the grammar
rules (`lang.en.rule`: lhs, rhs with `? * +` and `[a|b]`, head, agree, emit; category list `lang.en.cat`). Open classes are not here: nouns come from `k.words` and the world's own lexicons, verbs from `k.actions`,
numbers and colours from `k.values`. A host passes the lexicons of the worlds in play as a **lexicon source** (word -> classes, plural, lemma); the grammar never owns a noun.

## 3. The functions (all pure, all budgeted by `core.budget`; declared as `core.function`)

```
@fn.grammar.parse core.function name=grammar.parse out.kind=list pure=true
  core.function.arg of=$fn.grammar.parse name=text kind=string
  core.function.arg of=$fn.grammar.parse name=start kind=atom           # S, NP, PP ...
  core.function.arg of=$fn.grammar.parse name=lexicon kind=ref          # the lexicon source
  core.function.arg of=$fn.grammar.parse name=limit kind=integer        # at most N parses, best first
```
| function | in | out | what it does | PSys2 reference |
| --- | --- | --- | --- | --- |
| `grammar.parse(text, start, lexicon, limit)` | words, start category | parses `[{ tree, cat, span, roles, score }]`, best first | a chart parser (CKY / Earley, whichever is simpler to bound) over `lang.en.rule`; a word has the categories of the closed class facts and of the lexicon; `emit` of a rule says which roles (`thing`, `amount`, `rel`, `place`, `set`, `ord`, `anaphor`) a node carries | the form matcher of `src/formalizer/rules/matcher.mjs` for the patterns written from `frames-acts.sop` |
| `grammar.np(text, lexicon)` | a noun phrase | `{ det, mods[], head, number, ord, count, set, name, part_of, rel_pp[] }` or null | `parse` with start NP, flattened for hosts that only want the head and modifiers | `worlds/acts/acts.mjs resolveOne` |
| `grammar.split(text, cat)` | a role text | parts `[{ head, tail }]` | the coordination of noun phrases: parts after the first start with a determiner or number, the head stops at its first `np.boundary` preposition, a number or ordinal part takes the kind of the part before | `acts.splitThings`, `resolve` |
| `grammar.clauses(tokens)` | tokens | clause index ranges `[{ from, to, joiner }]` | the clause splitter: joiners with `cut=yes`, runs of joiners count as one, a comma after a `frame-lead` does not cut, the card-driven cut where `card-cut=yes` and an act word or a `wh` word follows (the act words are an argument: `starters`) | `index.mjs splitClauses`, `cardCuts` |
| `grammar.shared(tokens)` | one clause with a coordination | proposals `[{ clauses: [{ tokens, own, copied }] }]` | shared leading verb phrase / trailing argument: "make your eyes and body blue" | `en.sharedArgument` |
| `grammar.elide(clause, anchor, env)` | an elliptic clause, the clause it continues | candidate token lists with provenance `{ copied }` | verb ellipsis (1-2 words of the anchor) and one-anaphora ("and a yellow one"); `env` = `{ leads, nouns, sameClass, isModifier }` from the lexicon source | `en.ellipsisPrefixes`, `en.oneAnaphora` |
| `grammar.fragment(text)` | a message | `{ kind: repeat\|marker\|bare, content[], marker }` or null | the fragment markers of `ellipsis.*` | `discourse.mjs splitFragment` |
| `grammar.refer(text, frames, focus)` | a sentence with a pronoun or anaphoric noun phrase | candidate rewrites `[{ pronoun, referent, rewritten, frame }]`, newest frame first | replaces the pronoun by the noun phrase of a typed slot of a frame (with its determiner), skips a referent the sentence already says; the host decides which rewrite reads | `discourse.mjs pronoun`, `_backTo` |
| `grammar.agent(word, agents)` | a pronoun | the agent it stands for or null | `refers` of `lang.en.pron` against the agents last mentioned (gender, any, user, assistant) | `session.mjs resolvePronoun` |
| `grammar.inflect(word, op, set)` | a word, `singular` or `plural` | the form | the first rule of `set` by `order` whose suffix matches; `irregular` and `noun.exception` first | `lemma.mjs`, `acts.mjs singular` |
| `grammar.frames(act)` | an act id | the frames of `lang.en.frame` for it, by priority | the argument structure: which roles an act takes and the words that say it; `needs` filters by a schema's features | `acts.mjs FORMS` |
| `grammar.read(text, frames, lexicon)` | a sentence, a frame set | `[{ frame, roles, score }]` | `parse` restricted to the frames of the worlds in play: the best frame by priority and coverage; this is what a schema world's generated patterns do today | `worlds/acts generate()` |
| `grammar.view(type, view)` | a fact type and a view name | the words | a view is the set of facts whose `in=` names it; a host that wants a different list defines a view | `en.words` |

## 4. Semantics that must hold (these are what PSys2's gates measure)

1. **Conservative.** A function proposes; the host accepts. `grammar.shared`, `grammar.elide` and `grammar.refer` never change a reading by themselves: the caller reads every proposal and accepts it only when every clause is read
   completely by one world and the unexpanded sentence was not (PSys2's rule: spec 03 section 1c). The library returns provenance (`copied` spans) so the reply can say what it assumed.
2. **No noun is owned.** An unknown word is never "wrong English": it is a word the lexicon source does not have; the parse says which word and which category it needed.
3. **Budgeted.** Every loop ticks `core.budget`; a parse that exceeds the budget returns what it has with `truncated=true`, never throws (the PSys2 rule of principled fixes for freezes).
4. **Views are explicit.** The first slice found five hand-made lists of determiners that differ by accident (PSys2 shards/determiners.sop `in=`). A view keeps each caller exact until the owner decides to unify; the library
   should report which words differ between two views (`grammar.diff(viewA, viewB)`) so that unifying is a measured decision.
5. **Order is data.** Rules and markers carry `order` or `priority`; no function sorts by length except where the fact says `order`.

## 5. Cases PSys2 carries for it (all pass today through `src/lang/en.mjs`)

`tests/lang-en.test.mjs` (facts parse, bundle fresh, views, singular, coordination, markers), `tests/ellipsis-one.test.mjs` (one-anaphora forms, noun tail, class-aware modifiers, singular noun), `tests/expand.test.mjs`
(shared argument, self-correction), `tests/acts.test.mjs`, the discourse and dialogue suites (pronoun, fragment, "back to X", ellipsis), and the case corpus `training/eval/cases.jsonl` (the groups "act phrase" and "fragment/list").
Equality gate used for the first slice: `test-world all` in both reasoners, owner logs a / b / c replayed, the three robustness sets in the rules configuration, the coverage grid; all unchanged.

## 6. Order of work proposed

1. `grammar.view`, `grammar.inflect`, `grammar.fragment`, `grammar.agent` (facts lookup; an afternoon, no search).
2. `grammar.split`, `grammar.clauses`, `grammar.shared`, `grammar.elide` (the algorithms exist, port them with the same tests).
3. `grammar.refer` (needs the frame representation of `std.dialogue`).
4. `grammar.parse` / `np` / `read` (the chart), with `lang.en.rule` as the only grammar; measure it head to head against the generated patterns on the robustness sets (typos, loose words, round-trip paraphrases) and keep
   the patterns where they win (Q10: "the experiment decides").

## 7. What stays outside

The spelling stage (one-slip tolerance, chat shorthand `ur`, `u`), translation, number-word reading (`k.values`, the host's number reader), and the answers' wording (`lang.common` UI strings). Other languages are out of scope here:
translation stays a separate layer in front of the English world (the project rule), so nothing in `w.lang.en` or `std.grammar` is language-specific beyond English.
