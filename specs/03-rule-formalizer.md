# 03 — The rule-based formalizer (`formalization=rules`)

A light formalization strategy built from patterns and heuristics, declared per world. It runs on any CPU and in the browser, needs no model, and is used to bootstrap worlds quickly, to generate and check training data for the encoder strategy (vision §5–6), for tests, and wherever speed matters more than full coverage of natural language. See ADR-001. Input is English (other languages are translated first, spec 05).

Implementation: `src/formalizer/rules/` (browser-safe). Interface:

```js
formalize(text, { worlds, session, source }) -> {
  segments: [{ text, span:[start,end], isQuestion, worlds:[{id, score}], match: { patternId, worldId, slots } | null,
               wires: Wire[], unparsed: boolean }],
  wires: Wire[]          // all emitted wires, in order
}
```

## 1. Normalization and segmentation
1. Split into sentences on `.`, `!`, `?` (not inside numbers like `3.5`), keeping offsets; `?` marks a question. A sentence that starts with a question word (`how`, `what`, `who`, `where`, `when`, `which`, `why`, `is`, `are`, `does`, `do`, `can`, `did`) is also a question.
2. Tokenize: words, numbers, `'s`, and the arithmetic symbols `+ - * / × ÷ =` (`×` and `÷` become `*` and `/`) when they stand between two numbers (`7+5`, `12 - 4`, `3 × 4`) or `=` right after a number (`7 + 5 =`); anywhere else they are dropped. A `-` directly before a digit and not after a word or digit is a negative number (`-3`). Keep the original casing of each token (needed for names) and a lowercase form for matching.
3. Expand contractions (`doesn't` → `does not`, `isn't` → `is not`, `I'm` → `I am`, `what's` → `what is`, `don't` → `do not`, `can't` → `can not`).
4. Number words to digits: `zero`…`twenty`, tens, `hundred`, `thousand`, combinations (`twenty-one`, `one hundred and five`), `half` → `0.5`, `a dozen` → `12`.
5. Drop filler tokens anywhere: `please`, `ok`, `okay`, `well`, `so` (sentence-initial), `um`; drop sentence-initial `and`, `then`, `after that`.

## 2. Patterns
```
@pat.arith.has core.pattern
    match="{who:agent} [has|have|had|got] {n:number} {item:noun}"
    emit="@{_} kids.arith.holding owner={who} count={n} item={item}"
    kind=statement
    priority=10
    example="Tom has 5 apples."
```
### Match syntax (token level, anchored to the whole sentence without its final punctuation)
| Element | Meaning |
| --- | --- |
| `word` | literal token (case-insensitive) |
| `[a\|b\|c]` | exactly one of the alternatives; an alternative may be multi-word with `_` (`[how_many\|how_much]`) |
| `[a\|b]?` | optional alternative |
| `{name:class}` | capture one item of the given class |
| `{name:class?}` | optional capture |
| `{name:class(args)}` | class with arguments: `words(20)`, `recent(<lexicon>,<agent slot>)` |
| `...` | skip 0–4 arbitrary tokens (lazy) |

### Slot classes
| Class | Accepts | Captured value |
| --- | --- | --- |
| `number` | one numeric token | atom (`5`, `2.5`, `-3`) |
| `word` | any single token | atom (lowercase) |
| `words` | 1–12 tokens, lazy; `words(N)` sets the maximum to N | string (original text) |
| `recent(<lexicon id>,<agent slot>)` | zero tokens: ellipsis. The item of that lexicon most recently mentioned together with the agent captured by `<agent slot>` (an earlier slot of the pattern), else the one most recently mentioned in the session. No such item: the pattern does not match (no guessing) | atom: the lexicon entry |
| `noun` | a single word, or a multi-word lexicon noun | atom: singular lemma, `_` joins multi-word (`ice_cream`) |
| `<lexicon id>` (e.g. `lex.kids.animals.names`) | a word (or multi-word entry) whose singular lemma is in that lexicon | atom: the lexicon entry |
| `agent` | a person: a capitalized token that is not a known lowercase word, or a name from any `class=name` lexicon, or a pronoun | reference to an agent entity (`$e.tom`) |
| `unit` | a token in any `class=unit` lexicon or the quantity unit table | atom |
| `rest` | all remaining tokens up to the end of the sentence (1 or more), commas kept in the text; use it last, for free text (dictation, titles) | string (original text) |

Singular lemma: irregular plurals from `plural=` lexicon entries first; (and a few built-in Latin plurals: `cacti`, `octopi`, `fungi`); then `ies`→`y`, `ves`→`f`, `(ch\|sh\|x\|ss)es`→drop `es`, `-us` plurals (`octopuses`, `buses`, `viruses`, `walruses`, `cactuses`)→drop `es`, `s`→drop. Singular nouns ending in `ss`, `us` or `is` (`glass`, `octopus`, `iris`) keep their `s`; a short list of `-is` plurals (`kiwis`, `taxis`) still loses it. The lemma is used for matching lexicons and in emitted atoms.

Optional elements and lazy skips are tried in a backtracking matcher; the first full match in left-to-right, prefer-consume order wins for one pattern.

### Emit templates
`emit` is SOP Lang with placeholders:
- `{slot}` → the slot value (atom, or `$id` for agents); inside a string (`"{slot}"`) the original text, JSON-escaped.
- Ellipsis: the formalizer remembers, per session, the item (value of a lexicon slot) mentioned with each agent; `recent(...)` slots read it. Example: `Tom has 5 apples. He gives 2 to Ana.` reads the second sentence as `give who=Tom to=Ana count=2 item=apple`.
- `{_}`, `{_1}`, `{_2}`, … → fresh wire ids, unique per session (`w17`, `w18`).
- An optional slot that was not captured removes the whole `key={slot}` entry.

The engine adds to every emitted wire: `core.via=$<patternId>`, `core.source="<source>#<start>-<end>"`, `core.seq=<n>` (strictly increasing per session; it orders events) and `core.in=$<worldId>`.

### Pattern kinds
- `statement` — asserts facts or events into session memory.
- `question` — emits a `core.question` (spec 04).
- `request` — emits a `core.request` (an action or task).
- `chat` — conversational acts (greetings, thanks); emits `core.request action=<op>` handled by a world operation.

## 3. Entities and reference
- An `agent` slot creates (first mention) or reuses an entity wire `@e.<lowercase name> core.agent name="Tom"` in session memory, with `gender=m|f` if a name lexicon says so.
- Pronouns: `he`/`him`/`his` → most recent agent with gender `m` or unknown; `she`/`her` → `f` or unknown; `they`/`them` → most recent agent; `I`/`me`/`my` → `e.user`; `you` → `e.assistant`. An unresolvable pronoun makes the pattern fail for that sentence (no guessing).
- Mentions are tracked in order of appearance; questions also update recency.

## 4. Choosing a reading
For each sentence:
1. Try every pattern of every loaded world (patterns are cheap).
2. Rank full matches by: `priority` (higher first), then number of literal tokens matched, then fewer `...`/`words` captures, then router score of the world.
3. If no pattern matches the whole sentence, split it into clauses at `,`, `and`, `then`, `but` (one level) and match each clause; a clause that still fails is reported as unparsed.
4. Equal-rank matches from different worlds that emit different wires are kept as **alternatives**; the dialog layer reports the ambiguity instead of choosing silently (vision §7).

## 5. Router
Scores every loaded world for each sentence: `+5` if one of its patterns matches the sentence, `+1` for each token whose lemma is in one of its lexicons (`trigger` entries `+2`). Worlds with score > 0 are candidates (top 3 reported). The router is used for reporting, for ordering ties, and later for restricting the encoder strategy, which cannot afford to try every world.

## 6. Training-data export
Because every emitted wire carries `core.source` offsets and the slot spans, the rule formalizer can export encoder training records (vision §6: text, mentions, key spans, references, label status `generator-backed` or `rule-derived`). `scripts/export-training.mjs` writes JSONL for `training/`.
