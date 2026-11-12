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

## 4. The choice (the library's order, one host change)

For one clause, the candidate readings are: the distinct rules readings (`pick` hook of `formalize`, at most four, in the router's order), and the verified candidates of the best-effort reader. Each is scored with `ReasonerSession.score` (the library's `score` on the instance of the world that owns its request or question, or on a fork of the base when the session has none: the same state, `peek`), and ordered with the library's `rank` and its default `RANKING`: **consistent, referents left ambiguous, lacks, words left out, assumptions**, then the order given (the router's). Every place has an explanation (`why`, `on`, `lostTo`), recorded in `seg.pick`.

Two host criteria on top of the library's order (`pick.libraryDefault` is the library's own first choice):
1. **A question whose answer is not computed yet lacks nothing.** sopworld 0.12 stopped counting the value a question asks for as a lack, but only when the wire the question is about exists and the question is given as `{ type, seek }`; the host's questions are wires about a computed answer (a total) that does not exist yet, so the library still reports `lacks count` and would rank "how many ... in total" below a reading that tells nothing wrong ("Ana has 6 stickers"). The measure of `lacks` is zero for a question reading (6 Romanian cases in the operational-ro set, measured again with 0.12).
2. **A move in a game that is not running comes last** (the `no-game` test of section 3), before the library's criteria, when another reading exists.

An action the matrix does not declare is scored too (sopworld 0.12): the library judges it by a fallback (referents, slots, denies) and says so in `judged` / `judgedBy`; `ReasonerSession.score` passes both through and adds `libVeto`, the reasons of the library's `veto(result)` for the reading. `libVeto` is recorded in `wa`; it is a veto kind (`library`, every reason but `inconsistent`, `nothing` and `action-unavailable`) only when `PSYS2_WA_KINDS` asks for it (measured in `training/results/e2-world-aware-2026-11-12b.md`).

`choose` reorders only when the library's first reading differs from the router's (a tie keeps the router's order). Not implemented, and why: the dispatcher's top-k (the encoder strategy returns one reading per clause), the library's split candidates for compound messages as an acting reading (measured only: `src/dialog/word-reader.mjs`, `scripts/e2-splits.mjs`; the library reads only worlds whose `core.word` `means` name matrix keys, which is kids.shop alone, and answers none of the cases the rules miss), the dialogue layer's follow-up readings (the discourse layer changes its state before it reads, so a second reading would have to be undone), the Romanian translator route (one candidate).

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
