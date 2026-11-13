# handover/lang.en: the English grammar of PSys2 as facts and rules (for `w.lang.en`)

Task 2 of the reviewer entry "2026-11-14 01:00" (English as a world, questions.md Q10). What PSys2 knows about English is spread over seven modules; this directory collects it in the **SOP format of
sop-knowledge-worlds** so that the knowledge repository can publish it as the world `w.lang.en`, and the library can apply it with `std.grammar` (proposal: [std-grammar.md](std-grammar.md)). English only; open-class words
(nouns, verbs, adjectives, numbers, colours) are not here, they are `k.words`, `k.actions`, `k.values`.

```
schema.sop            module w.lang.en: the types and slots (closed types; the small ones still need their slot lines from the repository's validator pass)
shards/               determiners  pronouns  prepositions  numbers  morphology  ellipsis  np  clauses  frames-acts  phrases
std-grammar.md        the functions that apply the facts (a chart or rule-driven parser) in sopworld's format
```

## What each PSys2 piece maps to

"read" = PSys2 already runs on these facts (through `src/lang/en.mjs`, the first slice, generated into `src/lang/en.facts.generated.mjs` by `scripts/build-lang-en.mjs`); "extracted" = collected here, PSys2 still uses its own copy.

| English knowledge | PSys2 piece today | Shard | State |
| --- | --- | --- | --- |
| determiners and quantifiers (7 lists) | `acts.mjs DET / DET_WORDS / NUMBER_START`, `expand.mjs DETERMINERS`, `dialogue.mjs DETERMINERS`, `discourse.mjs DETERMINERS`, `routing.mjs DETERMINERS` | `determiners.sop` (`in=` names the view) | read; the seven views kept exact, unifying them is a decision (see holes) |
| pronouns, referents (5 lists) | `acts.mjs PRONOUN`, `dialogue.mjs PRONOUNS`, `continuation.mjs PRONOUN`, `astra/focus.mjs PRONOUNS`, `matcher.mjs PERSONAL_PRONOUNS`, `session.mjs PRONOUNS` (agent by gender) | `pronouns.sop` | read |
| anaphoric noun phrases ("that one", "this animal") | the two regexes of `discourse.mjs pronoun` and `_backTo` | `pronouns.sop` (`anaphor`, ordered) | read |
| prepositions as relations (4 lists) | `acts.mjs PREP_CUT / REL_WORDS`, `dialogue.mjs PREPOSITIONS`, `discourse.mjs PREPOSITIONS`, `routing.mjs FORMAT_PREPOSITIONS` | `prepositions.sop` (`rel`, `space`, `role`) | read |
| ordinals, small numbers | `acts.mjs ORD / NUMW`, `astra/focus.mjs ORDINALS`, `discourse.mjs ORDINAL_RE`; the whole system is `k.values.number` (`src/knowledge/values.mjs`) | `numbers.sop` (seed, must agree with `k.values`) | read |
| plural and singular, irregulars, exceptions | `acts.mjs singular`, `formalizer/rules/lemma.mjs` | `morphology.sop` (`inflect` rules in order, `irregular`, `noun.exception`) | read (singular); `pluralize` and the contractions are extracted only |
| contractions | `formalizer/rules/normalize.mjs CONTRACTIONS` | `morphology.sop` | extracted |
| coordination of noun phrases, "tables 1 and 2" | `acts.mjs splitThings`, `resolve` | `np.sop` (`coord.*` rules and `coord.sep` / `coord.param` facts) | read |
| shared argument ("make your eyes and body blue") | `expand.mjs sharedArgument` | `np.sop` (`coord.shared-suffix`), `ellipsis.sop` params | moved into `src/lang/en.mjs`, read |
| verb ellipsis, one-anaphora ("and a yellow one") | `expand.mjs ellipsisPrefixes`, `oneAnaphora`, `index.mjs oneAnaphoraEnv` (the lexicon classes and the `lang.elide.*` groups stay with the worlds) | `np.sop` (`ellipsis.*`), `ellipsis.sop` | moved into `src/lang/en.mjs`, read |
| fragment markers ("and what about", "too", "again") | `discourse.mjs LEADS / TRAILS / REPEATS / SENTENCE_STARTERS` | `ellipsis.sop` | read |
| pronoun resolution, focus | `acts.mjs focusOf / resolveOne`, `discourse.mjs pronoun`, `session.dialogue` | `np.sop` (`anaphora.*` rules) | rules extracted; the resolution code stays |
| clause joiners, cutter, frame leads | `index.mjs splitClauses / cardCuts / FRAME_LEADS / JOINER_WORDS` | `clauses.sop` | extracted |
| self-correction markers, bare answers | `expand.mjs MARKERS / BARE_ANSWER / LEAD_ONLY / selfCorrect` | `clauses.sop` | extracted |
| question words, auxiliaries, question frames | `normalize.mjs QUESTION_WORDS`, `discourse.mjs QUESTION_START`, the `ask.*` forms | `clauses.sop` (`wh`, `aux`, `qframe`) | extracted |
| negation | `dialog/value-check.mjs NEG`, `lang.neg.*` | `clauses.sop`, `phrases.sop` | extracted |
| imperatives, lead-ins | `dialogue.mjs verbOf` | `clauses.sop` | extracted |
| argument frames of the acts (who does what to what, with which preposition) | `worlds/acts/acts.mjs FORMS`, `forms.more.mjs FORMS_MORE` (176 forms) | `frames-acts.sop` (generated once from the code; hand-maintained here from now on) | extracted; the schema worlds still generate their patterns from `FORMS` |
| politeness, fillers, answers, degree, comparison, `elide.*`, request and question phrases | `worlds/lang.common` (79 grammar groups, 1,394 items; `lang.intent.*`, `lang.doc.*`, `lang.game.*`, `lang.talk.*` stay in the apps) | `phrases.sop` | extracted; the worlds still `import` lang.common |
| verbs | `k.actions` (`worlds/acts/verbs.generated.mjs`) | not here | knowledge repository |

## How PSys2 reads it

`src/lang/en.mjs` is the thin local module: `en.words(type, view)`, `en.ordinals`, `en.refers`, `en.anaphorRegex`, `en.singular(word, set)`, `en.leads/trails/repeats/starters`, `en.splitList`, `en.splitThings`,
`en.bareDistributes`, `en.sharedArgument`, `en.ellipsisPrefixes`, `en.oneAnaphora`. It reads wires; `createLangEn(texts|wires)` takes another version of the world (the catalog's, later). After editing a shard:
`node scripts/build-lang-en.mjs` (`tests/lang-en.test.mjs` fails when the generated file is stale). Gate for the slice: no change in `test-world all` (both reasoners), the owner logs, the robustness sets, the coverage grid
(numbers in worker-log "LANG-EN first slice").

## Holes the extraction made visible (English the system does not read, or reads in several ways)

- **Seven views of determiners, five of pronouns, four of prepositions** differ only by accident (`dialogue` takes `many few several` and numerals, `routing` takes `new`, `discourse` has no `these those`, `acts` has no `his her its their`).
  Each is kept as a view; the library should report the differences (`grammar.diff`) so unifying is measured, not guessed.
- No rule reads: relative clauses ("the table that is red"), "some of the tables", "the other table", "a red or a blue house", tag questions, negated acts ("do not add a table": minimal pairs mp#012/022/023/025/027), possessive "of" and 's
  beyond the part-of hooks, temporal prepositions as relations (`before`, `after`, `during` appear only in the Talk phrases). They are rules with `status=hole` in `np.sop` and a line in `clauses.sop`.
- `lang.common` lead-ins are partly world-specific text seeded from the per-world lists (`i_want_to_make_the`, `can_i_read_the`): they belong to the worlds that asked for them, not to the grammar; a cleanup pass should
  split `lead.polite` into the grammar part (`can you`, `could you`, `i would like you to`, `please`) and the leftovers.
- Number words appear twice (`numbers.sop` seed and `k.values.number`); the seed exists only because the act reader must work before the catalog is reachable.
- The slot declarations for the small types (`neg`, `ellipsis.*`, `coord.*`, `qframe`) are minimal in `schema.sop`; the repository's validator pass should complete them.
