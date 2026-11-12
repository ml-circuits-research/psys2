# 16. World-aware reading (FORMALIZE-FROM-WORLDS, E2)

Status: experiment, behind an option, **off by default** (user decision pending). Code: `src/dialog/world-aware.mjs`, `ReasonerSession.score` / `peek` in `src/reasoner/index.mjs`, the `pick` hook in `src/formalizer/rules/index.mjs`, the `checkReferents` hooks of `worlds/art.draw/ops.mjs` and `worlds/diagram.sketch/ops.mjs`. Measurement: `scripts/e2-world-aware.mjs`, results in `training/results/e2-world-aware-2026-11-12.{json,md}`.

## 1. What it is for

The formalizer reads a message into wires without looking at the state of any world. The error audit (E1) says that most English errors are of the kind the state or the schema could settle (classes c, d, e, h), and that a wrong answer is worse than "not understood". This layer looks at the reading the pipeline is about to act on, and at the other readings it found, and judges them against the world instances **without telling anything** (the library's `world.score`, which runs each candidate in a transaction that is undone). It never invents a reading. It can only (a) refuse to act on a reading, saying why, and (b) prefer one of the readings the formalizers already found.

## 2. The option

`worldAware` is a session option of `engine.createSession` (`'off' | 'veto' | 'choose' | 'observe' | 'veto-strict' | 'choose-strict'`, default `'off'`; a per-message option of `send` overrides it). The environment variable `PSYS2_WORLD_AWARE` sets the default of command-line tools; `scripts/e1-collect.mjs --world-aware <mode>` passes it to the evaluation. With `off` nothing in this spec runs: the turn is byte for byte the shipped one.

| mode | what it does |
| --- | --- |
| `veto` | A reading that fails one of the checks of section 3 is not acted on. The clause becomes "not understood", or a question or explanation built from the world. |
| `choose` | `veto`, and where the rules (or the best-effort reader) found several readings of one clause, they are scored and put in the order of section 4. |
| `observe` | Diagnostic: judges and records on the segment (`wa`, `pick`), changes nothing. |
| `veto-strict`, `choose-strict` | The same, and a reading that leaves out content words through the partial-understanding window (`words-partial`) is vetoed too. Measured to lose more right answers than it prevents wrong ones (section 6), so it is not part of `veto`. |

## 3. The veto (a reading is dropped for a named reason)

Each reason is recorded on the replaced segment as `veto: { kind, why, say?, offer? }` and in the trace.

1. **`no-referent`**: the reading names something the world does not have. The world says so through an optional read-only hook `checkReferents(ctx, { action, args })` in its `ops.mjs` (the same kind of hook as `referents`, `summary`: spec 11). It returns `{ missing: [{ name, kind }], here, where, offer? }`. The host composes the reply, nothing else:
   - with `offer`: "There is no shape called End. Shall I add it?" and a pending offer whose "yes" runs `offer` (the diagram: `add a rectangle called End and connect Start to End`);
   - without: "There is no dragon in the picture. In the picture: a yellow house." (or "The picture is empty.").
   Today `art.draw` (`draw.remove`, and the noun phrases `t` and `o` of the others) and `diagram.sketch` (`diagram.connect`) have the hook. A world that has none is not checked. The hook may not change state: the host removes the empty state key that the hook's context creates for a world that has none.
2. **`no-game`**: the reading is a move in a game (`tabKind=game` in the manifest, or a `games.*` world), the game is not running in this session, its tab is not the open one, and the action is not the one that starts a game (`gameControls.new`). "Put it in the top right corner" on the Drawing tab is not a tic-tac-toe move. The reply says no game is running.
3. **`words-best-effort`**: the best-effort reader (spec 03 section 7.15) executes a guess of loose words and says "I did not use ...". With the option on, a first candidate that leaves out content words is not executed: the reply is "Did you mean ...?" with the candidates (`suggestions`). A word is **content** unless it is a filler (`FILLER` in the module: please, now, just, hesitations and chat abbreviations), a word of two letters or fewer, a Romanian word of three letters or fewer (a function word the translator left), or a word that the reading spells another way (edit distance 1, or 2 from six letters: "lie" for "like", "abort" for "about", a corrected typo is not a word left out).
4. **`words-partial`** (`-strict` modes only): the same test for the readings of the partial-understanding window (spec 03 section 7.10).

**Nothing is half done.** When a clause of a message is vetoed, the readable clauses of the same message are held back too (`veto.kind = held`, "I did not act on ... because I could not read all of your message. Please say it again."): a later clause may rest on an earlier one ("Azi este vineri. Mâine ce zi este?" must not tell the first and lose the second). Clauses the formalizer already left unparsed keep the shipped partial execution.

What the library's `score` adds to the veto: for a reading that is a request or question of a matrix world whose action or question the matrix declares, `score` runs it on the instance (`ok`, `violations`, `lacks`, `action.available`, `answer`). A refusal by the world's rules ("There is nothing to undo", "that does not add up") is already the right answer with a reason, so it is **recorded** (`wa`) and **not vetoed**: vetoing it would turn a correct explanation into "not understood" (measured: 98 right against 7 wrong among the refused readings). Most actions are still the operations' (spec 15: the matrix declares few of them), so `score` cannot judge them (`wa.judged = false`); that is why `no-referent` and `no-game` read the worlds' own state through hooks and the session context.

## 4. The choice (the library's order, one host change)

For one clause, the candidate readings are: the distinct rules readings (`pick` hook of `formalize`, at most four, in the router's order), and the verified candidates of the best-effort reader. Each is scored with `ReasonerSession.score` (the library's `score` on the instance of the world that owns its request or question, or on a fork of the base when the session has none: the same state, `peek`), and ordered with the library's `rank` and its default `RANKING`: **consistent, referents left ambiguous, lacks, words left out, assumptions**, then the order given (the router's). Every place has an explanation (`why`, `on`, `lostTo`), recorded in `seg.pick`.

Host changes to the library's order, both documented here and both reported where they change the result (`pick.libraryDefault` is the library's own first choice):
1. **A question whose answer is not known yet lacks nothing.** The library counts the answer a question cannot give yet as a lack; that makes "what did gretel say" lose to a statement that tells nonsense ("a gretel goes what"). The measure of `lacks` is zero for a question reading; the others are unchanged.
2. **A move in a game that is not running comes last** (the `no-game` test of section 3), before the library's criteria, when another reading exists.

`choose` reorders only when the library's first reading differs from the router's (a tie keeps the router's order). Not implemented, and why: the dispatcher's top-k (the encoder strategy returns one reading per clause), the library's split candidates for compound messages (`interpret` needs `core.word` facts, and no world has them yet: E3), the dialogue layer's follow-up readings (the discourse layer changes its state before it reads, so a second reading would have to be undone), the Romanian translator route (one candidate).

## 5. Rules of the layer

- Read-only: `score` and `peek` do not change the instance (`version`, wires and log are unchanged; `tests/world-aware.test.mjs`); a hook changes nothing in the session state.
- Bounded: every loop of the layer ticks the turn budget (`world-aware.segment`, `world-aware.pick`); at most four readings are scored per clause; the library's own `score` takes the turn's budget.
- Never throws: a failure to judge keeps the reading.
- Quoting: the clarifying replies quote the user's words ("There is no dragon in the picture"), as the undo replies do.
- English only inside the layer; a Romanian message is judged on its English reading, and its leftover words (the translator's) of three letters or fewer are not content.

## 6. Results

See `training/results/e2-world-aware-2026-11-12.md`. Per set, per mode (`rules` and `encoder+n1`), off against `veto`, `veto-strict`, `choose`: right / wrong / not understood, wrong to not understood and right to not understood reported separately, every changed case listed, the reviewer's named cases, and every disagreement between the library's order and the host's.
