# 02 — Legends, worlds and the world directory format

## Legends
A legend is SOP Lang made of three wire types.

```
@legend.kids.arith core.legend
    namespace=kids.arith
    version=0.1.0
    imports=core
    imports=kids.common
    doc="Counting and simple arithmetic about things people have"

@kids.arith.holding core.type
    extends=core.state
    doc="Someone has a number of items of one kind"
    example="Tom has 5 apples."

@kids.arith.holding.owner core.key
    value=$kids.common.agent
    card=one
    ask="Who has them?"

@kids.arith.holding.count core.key
    value=integer
    card=one
    ask="How many are there?"
    observe=true
    compute=true
```

- `core.legend`: `namespace` (required), `version` (semver), `imports` (repeatable namespaces), `doc`.
- `core.type`: id is the full type name; `extends` (optional, a type name; default `core.thing`), `doc`, `example` (repeatable), `negative` (repeatable example that is *not* this type).
- `core.key`: id is `<type>.<key>`; `value` is a literal kind (`integer`, `number`, `string`, `atom`, `boolean`, `quantity.<kind>`, `time.<kind>`) or a reference to a type (`$kids.common.agent`); `card` is `one` (default) or `many`; `ask` is the English natural-language question (required); `observe` / `compute` (booleans, default `observe=true compute=false`); `required` (default false).
- Key resolution: short key `k` in a wire of type `T` resolves to `T.k`, else to `A.k` for each ancestor `A` of `T` (nearest first); `core.*` keys are always available in full form. Ambiguity or failure is a validation error.
- Validation of a wire against legends: known type; every key resolves; cardinality respected; literal kinds parse (integer, number, boolean); references point to a wire whose type is the declared type or a descendant (checked when the target is available).

The bootstrap legends `core` (`worlds/core/legend.sop`) and `quantity` live in `worlds/` like any other namespace.

## World directory
One directory per world under `worlds/`, named by namespace. Only `world.sop` and `legend.sop` are required.

| File | Contents |
| --- | --- |
| `world.sop` | One `core.world` wire (manifest) |
| `legend.sop` | The world's legend (types and keys of its namespace) |
| `lexicon.sop` | Word lists used by the rule formalizer and router (`core.lexicon` wires) |
| `patterns.sop` | Rule-formalizer patterns (`core.pattern` wires) — see spec 03 |
| `operations.sop` | Operation declarations (`core.operation` wires) — see spec 04 |
| `ops.mjs` | JavaScript implementations of the world's operations (browser-safe, no imports except relative ones inside the world) |
| `kb.sop` | Knowledge base: asserted facts, each with `core.source` |
| `templates.sop` | Answer rendering templates (`core.template` wires) |
| `tests.sop` | Competency tests (`core.test` wires) |

### Manifest
```
@world.kids.arith core.world
    namespace=kids.arith
    version=0.1.0
    legend=$legend.kids.arith
    imports=world.core
    imports=world.kids.common
    formalization=rules
    language=en
    status=fixture
    title="Counting and arithmetic (primary school)"
    summary="do sums"
    doc="Who has how many things; giving, getting, buying; adding and taking away."
```
- `summary` (optional) is a short verb phrase of what the world lets the assistant do (`do sums`, `talk about animals`, `play hangman`). The capabilities answer of `ui.help` (spec 07 section 8) is built from it: phrases are merged by their leading words, a world without `summary` is listed by its title, and `summary=""` leaves the world out.
- `imports` lists world ids; importing a world makes its legend, lexicon, patterns, operations, templates and knowledge available (vision §4: available for consideration, not automatically applicable).
- `formalization`: `rules` (spec 03) or `encoder` (vision §5; not implemented yet).
- `status`: `fixture` (hand-built platform fixture or demo), `candidate`, `accepted`.

### Lexicon
```
@lex.kids.arith.items core.lexicon
    class=noun
    word=apple word=pear word=sweet word=marble word=pencil
@lex.kids.arith.triggers core.lexicon
    class=trigger
    word=how_many word=more word=left word=altogether word=gives
```
`class` is `noun`, `name`, `verb`, `unit`, `trigger` or any world-defined class; multi-word entries use `_` between words. Plural forms are derived by the rule engine (spec 03); irregular plurals are declared as `plural=child:children`.

#### Lexicon inheritance (`extends=`, `exclude=`)
```
@lex.ui.avatar.colors core.lexicon
    class=noun
    extends=$lex.lang.colour
    exclude=navy
    word=teal
```
`extends=$<lexicon id>` (repeatable) adds every word and irregular plural of the named lexicons (any loaded world; inherit through imports by convention); `exclude=<word>` (repeatable) removes an inherited entry. The loader resolves the chain when the world set is built, in dependency order: after loading, `words` is the flat list (inherited words first, then own words, no duplicates). An unknown base, a cycle, or an `exclude` that is not an inherited word is a load error.

#### Phrase macros (`core.phrase`)
`lexicon.sop` may also hold `core.phrase` wires: named groups of literal alternatives that patterns reference as `[$id]` (spec 03 section 2.5).
```
@phrase.lang.lead.polite core.phrase
    alt=could_you_please alt=can_you alt=please
```
`frame=false` marks a phrase of content words (default `true` = frame vocabulary: lead-ins, suffixes, fillers; spec 03 section 2.5). The wire id must start with `phrase.`; the macro id is the rest (`lang.lead.polite`). Alternatives use `_` between words. The shared world `worlds/lang.common` (imported through `kids.common`) holds the common lead-in, suffix and filler phrases and the shared lexicons (`lex.lang.colour`, `ordinal`, `size`, `degree`, `direction`, `position`, `unit`). The closed word classes behind `ctx.lang` (spec 04) are `frame=false` phrases there too (`lang.yes`, `lang.assent`, `lang.no`, `lang.decline`, `lang.unsure`, `lang.cancel`, `lang.degree.*`, `lang.comparative`, `lang.shade`, `lang.size.*`, `lang.position.*`, `lang.ordinal.last`, `lang.lead.ask`). It is a `status=fixture` world with `summary=""` that claims nothing (no patterns): new common phrasing goes there, never inline in a world's patterns.

#### Request shapes (`core.shape`)
`patterns.sop` may also hold `core.shape` wires (`shape.<id>`): one declaration per operation (family `set|do|ask.value|ask.count|ask.exists|list`, `verb`, `obj`, `val`, `noun`, `emit`, ...) from which the loader generates the patterns of the request forms (imperative, question, wish, indirect, word order, short, state, options) after the lexicons are resolved. The generated patterns are `pat.<id>.<form>`, are checked like hand-written ones, and the phrase groups they use are the `lang.shape.*` macros of `lang.common`. Spec 03 section 2b has the keys and the exact templates; `node scripts/expand-patterns.mjs <world>` prints the result.

### Tests
```
@t.arith.1 core.test
    input="Tom has 5 apples. Ana gives him 3 apples. How many apples does Tom have?"
    expect="8"
@t.arith.2 core.test
    input="How many apples does Mia have?"
    expectStatus=missing
```
`expect` is a substring that must occur in the rendered answer of the last question in `input`; `expectStatus` is the answer status (spec 04). A test may give `language=ro` to exercise translation. `session=` groups tests that share one dialog session, run in id order.
`expectState="<dot.path>=<value>"` (repeatable) checks the state after the input, relative to the state of the world that owns the tests (`blocks.0.kind=heading`, `board.4=X`, `length` works on arrays), or of another world as `<worldId>:<dot.path>=<value>`; `expectEffect=<name>` (repeatable) requires that the input queued that effect (spec 07).
