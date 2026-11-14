# 16. World-aware reading (FORMALIZE-FROM-WORLDS, E2)

Status: **on by default as `veto`** (user decision 2026-11-12; `worldAware: 'off'` or `PSYS2_WORLD_AWARE=off` turns it off; the constant is `DEFAULT_WORLD_AWARE` in `world-aware.mjs`). Code: `src/dialog/world-aware.mjs`, `ReasonerSession.score` / `peek` in `src/reasoner/index.mjs`, the `pick` hook in `src/formalizer/rules/index.mjs`, the `checkReferents` hooks of `worlds/art.draw/ops.mjs` and `worlds/diagram.sketch/ops.mjs`. Measurement: `scripts/e2-world-aware.mjs`, results in `training/results/e2-world-aware-2026-11-12.{json,md}`.

## 1. What it is for

The formalizer reads a message into wires without looking at the state of any world. The error audit (E1) says that most English errors are of the kind the state or the schema could settle (classes c, d, e, h), and that a wrong answer is worse than "not understood". This layer looks at the reading the pipeline is about to act on, and at the other readings it found, and judges them against the world instances **without telling anything** (the library's `world.score`, which runs each candidate in a transaction that is undone). It never invents a reading. It can only (a) refuse to act on a reading, saying why, and (b) prefer one of the readings the formalizers already found.

## 2. The option

`worldAware` is a session option of `engine.createSession` (`'off' | 'veto' | 'choose' | 'observe' | 'veto-strict' | 'choose-strict'`, default `'veto'`; a per-message option of `send` overrides it). The environment variable `PSYS2_WORLD_AWARE` sets the default of command-line tools; `scripts/e1-collect.mjs --world-aware <mode>` passes it to the evaluation. With `off` nothing in this spec runs: the turn is byte for byte the shipped one.

| mode | what it does |
| --- | --- |
| `veto` | A reading that fails one of the checks of section 3 is not acted on. The clause becomes "not understood", or a question or explanation built from the world. |
| `choose` | `veto`, and where the rules (or the best-effort reader) found several readings of one clause, they are scored and put in the order of section 4. |
| `observe` | Diagnostic: judges and records on the segment (`wa`, `pick`), changes nothing. |
| `veto-strict`, `choose-strict` | The same, and a reading that leaves out content words through the partial-understanding window (`words-partial`) is vetoed too. Measured to lose more right answers than it prevents wrong ones (section 6), so it is not part of `veto`. |

## 3. The veto (a reading is dropped for a named reason)

Each reason is recorded on the replaced segment as `veto: { kind, why, say?, offer? }` and in the trace.

1. **`no-referent`**: the reading names something the world does not have. The world says so through an optional read-only hook `checkReferents(ctx, { action, args })` in its `ops.mjs` (the same kind of hook as `referents`, `summary`: spec 11). It returns `{ missing: [{ name, kind }], here, where, offer? }`. The host composes the reply, nothing else:
   - with `offer`: "I can't find a box called “End”. Shall I add it?" (the user's label in quotes, the user's noun, else the world's everyday word, never "shape") and a pending offer whose "yes" runs `offer` (the diagram: `add a rectangle called End and connect Start to End`);
   - without: "I can't find “dragon” in the picture. In the picture I can see: a yellow house." (or "The picture is empty.").
   Today `art.draw` (`draw.remove`, and the noun phrases `t` and `o` of the others) and `diagram.sketch` (`diagram.connect`) have the hook. A world that has none is not checked. The hook may not change state: the host removes the empty state key that the hook's context creates for a world that has none.
2. **`no-game`**: (veto only when acting would be wrong) the reading is a move in a game (`tabKind=game` in the manifest, or a `games.*` world), the game is not running in this session, its tab is not the open one, and the action is not the one that starts a game (`gameControls.new`). "Put it in the top right corner" on the Drawing tab is not a tic-tac-toe move. It also requires that the open tab's own world reads the message completely (a move the router alone can read is how a game starts and its tab opens, as the world tests define: "Top right" from the Robot tab is played); the check runs the tab world's rules after the router's decision. The reply: "We are not playing Tic-tac-toe right now. Tell me you want to play it, then say your move."
3. **`words-best-effort`**: the best-effort reader (spec 03 section 7.15) executes a guess of loose words and says "I did not use ...". With the option on, a first candidate that leaves out content words is not executed: the reply is "Did you mean ...?" with the candidates (`suggestions`). A word is **content** unless it is a filler (`FILLER` in the module: please, now, just, hesitations and chat abbreviations), a word of two letters or fewer, a Romanian word of three letters or fewer (a function word the translator left), or a word that the reading spells another way (edit distance 1, or 2 from six letters: "lie" for "like", "abort" for "about", a corrected typo is not a word left out).
4. **`words-partial`** (`-strict` modes only): the same test for the readings of the partial-understanding window (spec 03 section 7.10).

**Nothing is half done.** When a clause of a message is vetoed for `no-referent`, `words-partial` or `words-best-effort`, the readable clauses of the same message are held back too (`veto.kind = held`, "I did not act on ... because I could not read all of your message. Please say it again."): a later clause may rest on an earlier one ("Azi este vineri. Mâine ce zi este?" must not tell the first and lose the second). Clauses the formalizer already left unparsed keep the shipped partial execution. A `no-game` veto does not hold the others: it is usually a spurious extra reading of a correction ("No, the editor", "sorry, I meant o"), and the other clauses of that message are the real ones.

What the library's `score` adds to the veto: for a reading that is a request or question of a matrix world whose action or question the matrix declares, `score` runs it on the instance (`ok`, `violations`, `lacks`, `action.available`, `answer`). A refusal by the world's rules ("There is nothing to undo", "that does not add up") is already the right answer with a reason, so it is **recorded** (`wa`) and **not vetoed**: vetoing it would turn a correct explanation into "not understood" (measured: 98 right against 7 wrong among the refused readings). Most actions are still the operations' (spec 15: the matrix declares few of them), so `score` cannot judge them (`wa.judged = false`); that is why `no-referent` and `no-game` read the worlds' own state through hooks and the session context.

## 4. The choice (the library's order, one host criterion)

For one clause, the candidate readings are: the distinct rules readings (`pick` hook of `formalize`, at most four, in the router's order), and the verified candidates of the best-effort reader. Each is scored with `ReasonerSession.score` (the library's `score` on the instance of the world that owns its request or question, or on a fork of the base when the session has none: the same state, `peek`), and ordered with the library's `rank` and its default `RANKING`: **consistent, referents left ambiguous, lacks, words left out, assumptions**, then the order given (the router's). Every place has an explanation (`why`, `on`, `lostTo`), recorded in `seg.pick`.

On top of the library's order, one host criterion (item 2; item 1 is the library's now) (`pick.libraryDefault` is the library's own first choice):
1. **A question whose answer is not computed yet lacks nothing** is the library's own since sopworld 0.13.1 (J1: `score` understands a question given as a wire, and a computed answer not made yet is not a lack). The host's zeroing of the `lacks` of a question reading, which sopworld 0.12 made necessary, is gone; `libraryOrder` and the host order are the same list. Gate: `training/results/e2-j1-2026-11-12.md`.
2. **A move in a game that is not running comes last** (the `no-game` test of section 3), before the library's criteria, when another reading exists.

An action the matrix does not declare is scored too (sopworld 0.12): the library judges it by a fallback (referents, slots, denies) and says so in `judged` / `judgedBy`; `ReasonerSession.score` passes both through and adds `libVeto`, the reasons of the library's `veto(result)` for the reading. `libVeto` is recorded in `wa`; it is a veto kind (`library`, every reason but `inconsistent`, `nothing` and `action-unavailable`) only when `PSYS2_WA_KINDS` asks for it (measured in `training/results/e2-world-aware-2026-11-12b.md`).

`choose` reorders only when the library's first reading differs from the router's (a tie keeps the router's order). Not implemented, and why: the dispatcher's top-k (the encoder strategy returns one reading per clause), the library's split candidates for compound messages as an acting reading (since READER-ROUTE: section 7, behind its own option), the dialogue layer's follow-up readings (the discourse layer changes its state before it reads, so a second reading would have to be undone), the Romanian translator route (one candidate).

## 5. Rules of the layer

- Read-only: `score` and `peek` do not change the instance (`version`, wires and log are unchanged; `tests/world-aware.test.mjs`); a hook changes nothing in the session state.
- Bounded: every loop of the layer ticks the turn budget (`world-aware.segment`, `world-aware.pick`); at most four readings are scored per clause; the library's own `score` takes the turn's budget.
- Never throws: a failure to judge keeps the reading.
- Quoting: the clarifying replies quote the user's words ("There is no dragon in the picture"), as the undo replies do.
- English only inside the layer; a Romanian message is judged on its English reading, and its leftover words (the translator's) of three letters or fewer are not content.

## 6. Results

Default-on measurement (veto, 2026-11-12, after the false-veto fixes): `training/results/e2-default-veto-2026-11-12.md` (0 new wrong, rules and encoder+n1).

See `training/results/e2-world-aware-2026-11-12.md` (per set, per mode, every changed case, the reviewer's named cases, every disagreement between the library's order and the host's). Totals over the judged sets (operational, operational-ro, dialogues, gold, loose-words, typos, real phrases; about 8,430 messages), right / wrong / not understood:

| mode | off | veto | choose | veto-strict |
| --- | --- | --- | --- | --- |
| rules | 7263 / 431 / 650 | 7261 / 398 / 685 | 7267 / 399 / 683 | 7194 / 361 / 790 |
| encoder+n1 | 7436 / 482 / 485 | 7439 / 456 / 509 | 7439 / 456 / 510 | 7386 / 420 / 598 |

Gate: no new wrong answer in `veto` and `choose`, in both modes (0 of 0 cases moved to wrong; the first runs had 6 and 1, all knock-on effects of the sibling hold and of the `no-game` veto of a spurious reading of a correction, both fixed: section 3). `veto-strict` has one: a later turn of a dialogue answers from a state that lacks the earlier turn that the strict veto dropped.

What it shows, honestly:
- **`veto`** turns wrong into not understood (rules 28, encoder+n1 22) and a few wrong into right (5, 6), at a cost of 7 (rules) and 3 (encoder+n1) right answers that became not understood. That is a good trade for a platform where a wrong answer is worse than not understood.
- **`words-partial`** (the `-strict` modes) is a bad trade: it prevents 36 (rules) and 35 (encoder+n1) more wrong answers and loses 70 and 56 right ones. The partial-understanding window ignores words that no world knows or that are function words, and most of what it ignores is harmless ("rly", "of them", a Romanian "la"); no cheap feature separates the harmful drops from the harmless ones (questions turned into commands, 11 right against 6 wrong, was the best).
- **`choose`** adds little over `veto`. Against `off`, rules: 26 wrong to not understood, 7 wrong to right, 1 not understood to right, 7 right to not understood, no new wrong; encoder+n1: identical to `veto` (no disagreement at all). Against `veto`, rules: 3 not understood to right and 3 partly to right (a move in an idle game loses to the reading of the open tab: "put it in the top right corner" on the Drawing tab now moves the house; "My name is not Ana, it is Irina" is read by user.profile, not by Hangman), and one case that stays wrong ("e... center": the library picked a music reading over the hangman one; wrong in `off` as well). 20 disagreements are listed for rules: 14 reorderings applied by the host criterion for an idle game, and 6 (Romanian "how many ... in total" questions) where the library's default order would pick a different reading than the router did (it counts the answer a question cannot give yet as a lack); the host's criterion keeps the router's reading, which is right in all six.
- The matrices declare few actions (spec 15), so `score` returns `judged = false` for most readings and the library's criteria alone rarely separate two readings. The named cases that need the open tab or the knowledge of another world to be decided (the document that takes "center and what is 3 times 3", "colour Spain in", "add milk ... and also can penguins fly") are not changed: the right reading is not among the readings the formalizers found.
- Romanian: not addressed here (E1: 349 of 451 are translator or lexicon cases), except where the English reading names something the world does not have.

## 7. The reader as a third source of readings (READER-ROUTE)

Code: `src/dialog/reader-route.mjs`, the stage `_withReader` of `src/dialog/index.mjs`, the loader flag in `src/worlds/index.mjs`. Measurement: `scripts/e1-collect.mjs --reader <mode>`, `scripts/reader-route-report.mjs`, `scripts/e2-splits.mjs`; results in `training/results/reader-route-2026-11-12.{json,md}`. Tests: `tests/reader-route.test.mjs`.

### 7.1 What it is

The library's reader core (`interpret` over the English `core.word` facts of a world's `describe.sop`, split candidates, `score`, `rank`) reads a clause and gives readings. They are turned into the **same dialogue wires the rules produce**: the description's own `emit` template filled with what the library found, normalized and validated like the rules' wires (`buildWires`, `normalizeWire`, `validateWire`). The segment is marked `strategy: 'reader'` and carries `reader` (the world, the operation, what was assumed, why it was taken). It is a third source next to the rules and the encoder and uses the same judging (`ReasonerSession.score`).

### 7.2 The option

`reader` is a session option of `engine.createSession` (`'off' | 'fill' | 'choose'`, default `'off'`; a per-message option of `send` overrides it; the environment variable `PSYS2_READER` sets the default of command-line tools; `scripts/e1-collect.mjs --reader <mode>` passes it to the evaluation). `describe.sop` is read by the loader only when the flag is on (as with `PSYS_GEN_PATTERNS`; it is `PSYS2_READER` at engine creation). With `off` nothing in this section runs and the turn is byte for byte the shipped one.

| mode | what it does |
| --- | --- |
| `fill` | A clause that nothing read (unparsed, after the rules, the encoder, the leniency stages and the best-effort reader) takes the reader's reading when the reader has one that passes section 7.4. |
| `choose` | `fill`, and a clause that was read takes the reader's reading when the library's `rank` (`ReasonerSession.score` over the current reading with the words it leaves out, and the reader's) puts the reader's first. A tie keeps the current reading (the given order). Only a rival reading of the world the clause was read in, or of the open tab, is considered. |

The reader reads only the worlds the user is in (the open tab's world, the modal world, the running game's world). A world with no English description is not read. After the stage, the world-aware layer (sections 2 to 5) judges the reader's reading like any other (`veto`, `choose`).

### 7.3 The mapping of `means`

The 0.12 finding: with the words told to the world's matrix instance, only kids.shop's words resolved (geo.map 341 and docs.editor 247 `unknown-word` warnings), because a `means` of a description word is an **emit key** (`geo.capital`, `doc.addHeading`), not a name the matrix declares (the matrices declare few actions, spec 15). The reader therefore keeps a small **reader world** (a library `World`, built once per loaded world set, memoized, never holding user state) in which every `means` has a place the library knows:

- every description (`core.describe`) is a **type** named by its id (not by its `op`: several descriptions may share one `op` and differ in emit and words, as a title and a heading do);
- every argument is a **slot** of that type (`op.arg` is the key the words of an argument mean; a quantity slot `qty=` is a number slot); a `number` argument is a number slot, an argument of a lexicon class (`lex.x`) is a slot that holds a wire of the class, whose wires are the lexicon's words (identifying key `name`), any other class (`rest`, `noun`, `words`) is a free string slot;
- the words of a description are told per description and role (`verb`, `tverb`, `noun`, `ask`, `rest`, `pre`, `mid`, `subject` mean the type; `prep.x`, `det.x`, `unit.x` mean the key `type.x`); a text of several words is one token with `_` (the library keeps the quotes of a quoted text), and the host merges the tokens of a clause that spell such a word or a name ("how many people live in", "new_york") before the library sees them; a plural name is read as its singular (the rules' lemma).

So a `means` that names an operation, an argument or a value always resolves (`readerCoverage` reports it per world; the tests require no `unknown-word` warning and no unused word). Where the matrix does declare the name (kids.shop) the reading is the same; the matrix is not touched: the reading is judged on the real instance afterwards, as the rules' readings are.

### 7.4 What the reader may take (the policy, `READER_POLICY`)

A reading is taken only when all of these hold; each was added because a measurement showed a wrong answer without it.

1. It leaves nothing out: every word of the clause is a word of the chosen description (role words, argument words), the value of an argument, a glue word (the host's fillers, question words, auxiliaries, prepositions), or the spelling the library corrected (`assumes`). A split candidate must read every frame of the split: since sopworld 0.13.2 (R14.1) a frame the library cannot read stays as an unresolved part (`unread: true`, its words in `unresolved`), and a split with such a part is no reading.
2. A word the library read as a near known word is corrected by one letter at most (`maxAssume`; "moved" read as "money" is not a spelling of it).
3. It rests on a content word of the description (`anchor`): one of its role words that is not glue, spelled as in the description or one letter away. "Is Kyoto" alone is not "is Kyoto landlocked".
4. It is unambiguous: no reading of another set of wires is as good on every criterion (words left out, assumptions, a verb word rather than an implied verb, words used) in a world as near the conversation. Two descriptions that emit the same wires are one reading.
5. Every number of the clause is a value of the reading.
6. No negation in the clause (the reader has no way to say it).
7. **No free text** (`freeText: false`): an argument that takes any words (class `rest`, `noun`, `words`) is not filled by the reader. The descriptions cover only part of a world, so a word they do not know may be content that the rules know ("make the heading bigger", "heading underline", "center the title" were read as headings with that text in the first measurement: 30 wrong answers). Descriptions with such an argument give the reader no reading.

### 7.5 Rules of the stage

- Read-only: `interpret`, `score` and `rank` run on the reader world and on forks; nothing is told to any world (`tests/reader-route.test.mjs`).
- Bounded: the stage ticks the turn budget (`dialog.reader`, `reader.world`, `reader.tokens`, `reader.build`); `interpret` takes the library's own limit (12 candidates a clause).
- Never throws: a failure keeps the reading.
- English only: a Romanian message is read through the translator first and then the same English route.
- The follow-up readings of the library (`previous`, `correction`, `other`) are not used: the discourse layer has already handled follow-ups before the formalizer runs.

### 7.6 Results

See `training/results/reader-route-2026-11-12.md` (and `-splits.json`). Rules / encoder+n1, over operational, operational-ro (Romanian through the rules translator), dialogues, gold, loose-words and typos, right / wrong / not understood:

| mode | rules | encoder+n1 |
| --- | --- | --- |
| reader off | 7,221 / 424 / 642 | 7,394 / 473 / 479 |
| `fill` | 4 not understood to right, 1 to wrong | 2 to right, 1 to wrong |
| `choose` | 5 to right, 1 to wrong | 2 to right, 1 to wrong |

- The one new wrong answer is a label mismatch (gold-real "on the new chapter": the reply is the rules' reply to "add a new chapter"; the gold op differs). No other case changed, in either mode, with or without the world-aware layer on top (E2 `choose`: the same 4 and 1; encoder+n1 the same 2 and 1).
- Coverage of `means`: kids.shop 173 of 173 words (0.12: 0 unknown), docs.editor 247 of 247 (0.12: 247 unknown), geo.map 344 of 344 (0.12: 341 unknown); no `unknown-word` warning after the mapping.
- The reader adds little because only three worlds have a description and it reads only the world the user is in; gold-para (class b) and loose-words (class e) gain nothing (no accepted reading of 14 and 105 messages of described worlds). Its value grows with the descriptions, with no change of code.
- The library's split candidates are read and judged; a split is taken only when every frame reads. In the measurement of the reader alone (`scripts/e2-splits.mjs`, 1,500 messages of the three worlds) 11 accepted readings are splits of compound messages; none changed an outcome.

## 8. One declaration of what an argument fills (Q2 item 2, J2; sopworld 0.13.1)

A host-run action (one the operations carry out and the matrix does not declare) is declared once, in SOP Lang and English, by `core.describe.arg` with a `slot=<type>.<key>` that names the slot of the world's legend the argument fills:

```
@describe.chess.level.set.n core.describe.arg
    of=$describe.chess.level.set
    name=n
    class=number
    slot=chess.game.level
```

- **Where.** In the world's `describe.sop`, on the `core.describe.arg` wire of the argument (a world that has wording there, like `games.chess`, adds one line to the wire it already has). `slotDeclarations(text)` (`src/worlds/describe.mjs`) cuts a `describe.sop` down to the `core.describe.arg` wires that have a `slot=` and the `core.describe` wires they belong to; the loader reads only that cut when the generator and the reader are off, and `scripts/build-webchat.mjs` ships only that cut (never the wording). A world's `argSlots` is `action -> (argument -> slot)`. A description without wording generates nothing, so a file that only declares slots is allowed.
- **The library's judgement (J2).** When the reasoner builds an instance it derives, for every declared action the matrix does not declare, a type named like the action whose slots are the arguments, with the kind, enum and range of the slot they name (`createReasoner`, "parameter types"); a slot the legends do not declare is a load problem. The library's `score` then judges a reading of that action by its fallback (a value that does not fit its slot's kind, enum or range makes it inconsistent: `judgedBy` `slots`; all that could run passing: `fallback`). Nothing else changes: no deny of the world is touched, no required parameter is declared (so none lacks).
- **A declaration is only right when the argument is canonical.** `ui.rate value` was tried against `ui.shell.view.rate` (integer, 50 to 200): the formalizer emits both "150" and "1.5" for a rate, so "Set the speech rate to 1.5" was judged out of range and `choose` made 2 new wrong answers; the declaration was removed. Likewise the enums of `art.draw` (`draw.add kind`, `draw.mood w`, `draw.ground g`) are canonical names while the arguments are the user's words ("puppy", "evening"): not declared. A canonical value needs the formalizer to emit it (an `emit` that says the canonical word), not the library to guess.
- **What is not derived (and why).** `checkReferents` (section 3) stays a hook of `art.draw` and `diagram.sketch`. Its arguments are noun phrases and a whole segment (`diagram.connect arg.text="connect A to B with a line"`, `draw.remove arg.phrase="the red house"`), which no argument-to-slot declaration can resolve: the names are inside the text, and finding them is the world's reading. It needs the patterns to emit the names as arguments (`arg.from`, `arg.to`), which changes the patterns of the diagram and the drawing and is a separate task. A hook for a referent that is a plain argument (a value outside the enum of its slot is a thing the world does not have) is what the declaration would give; no world has such an argument yet.
- **Measurement** (`training/results/e2-arg-slots-2026-11-12.md`): with `chess.level n` declared, 28 more readings are judged (`fallback`), none changes outcome, 0 new wrong in `veto` (default) and `choose`.



## 9. The typed reading step (abstraction round item 1; sopworld 0.72 `typedLexicon`)

Code: `src/dialog/typed-reader.mjs`, the stage `_withTypedReader` of `src/dialog/index.mjs` (after the rules, the best-effort and the reader route, before the knowledge lookup and the world-aware review). Tests: `tests/typed-reader.test.mjs`.

**What it does.** A clause the rules read completely and the world REFUSED is read again by the types of its words. "Change the unit of timeline 1 to day." is read by the frame `acts.change.of` with the thing "timeline" and the value "1 to day" (a free-text role stops at the number): the world answers "1 to day is not a unit I know". The step types the world from its own facts (each thing of the session as a wire with its label "timeline 1", its kind and attributes; each value an attribute can take, from the schema or, for a colour, from the colours the readers take), asks the library's `typedLexicon` for the type of every word, and reads the free-text roles of the refused reading again from the words they took together: the role of the type thing takes the words that name a thing of the session, the role of the type value takes the word typed as a value of the attribute the reading holds, and what is left must be function words (to, of, the). Word order only splits the words; the types assign them.

**It proposes; the world decides; all or nothing.**
1. It runs only when the world refuses (a run on a fork of the session, `_outcomes`: an answer with a `fallback` code and no change). A reading the world accepts, an unparsed clause and a clause nobody read are never touched.
2. Every word of the region must be placed, both roles filled, the wires rebuilt with the world's own pattern (`buildWires`) must validate, and the world must then act on the new reading on the fork (supported, not refused, something changed). Otherwise the original reading stays, whole.
3. No sentence is generated, nothing is told to any world, and no pattern, word list or lexicon entry is added: the same step reads every schema world (plan.timeline, plan.seating, art.draw ...). The segment carries `typed: { from, to, id }`.

**Library limit.** `readByTypes` returns `ask`, `find` and `act` frames whose act arguments are things; it has no frame for "set an attribute to a value", so this step uses the library's typing (`typedLexicon`) and assembles the arguments by type itself. Unparsed clauses (the paraphrases of the learning curve: "cow sound?") need the frames of `readByTypes` mapped to the world's wires: not done.
