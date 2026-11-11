# 15 — The reasoner host layer (sopworld), stage 1

Implementation: `src/reasoner/`, the vendored library `src/vendor/sopworld/` (0.6.1, see `src/vendor/LICENSES.md`), per-world `matrix.sop` + `fns.mjs`. Browser-safe. Tasks: SOPWORLD-1 and SOPWORLD-1b (worker-tasks). The numbers are in `worker-log.md`.

## Purpose
`sopworld` (https://github.com/ml-circuits-research/soplang-words-lib, MIT, same owner) is a general library for self-consistent worlds of SOP Lang wires: a schema with a type hierarchy, rules, denies, defaults, a sequence with states changed by events (fluents), aggregates, queries with a status, actions as transactions, retract and replace, abduction, explain, step budgets on every loop and a structural `fork()`. The user wants it to become the centre of the worlds, so that they share one representation and one reasoner. Stage 1 proves it on three worlds without changing any default behaviour. Stage 2 (after the user sees stage 1): the session memory and question resolution of `src/interpreter/` on the library, then more worlds.

## The switch
- **Engine level.** `createEngine({ options: { reasoner: 'ops' | 'matrix' } })`; without the option the environment variable `PSYS2_REASONER` (`ops` | `matrix`), then `ops`. The default is `ops`: nothing of this spec is loaded, no session has a World, every file of a world behaves as before.
- **Per world.** A world opts in with `reasoner=matrix` in its `world.sop` (key `core.world.reasoner`, default `ops`) and ships `matrix.sop` (and `fns.mjs` when it needs functions). A world that does not say so is never answered by the library, whatever the switch.
- **CLI and evaluators.** `--reasoner ops|matrix` (`scripts/lib/reasoner-flag.mjs` sets `PSYS2_REASONER`): `src/cli.mjs`, `scripts/eval-operational.mjs`, `scripts/eval-dialogues.mjs`, `scripts/check-ro-replies.mjs`. Any other tool follows the environment variable.
- **Webchat.** Settings › Developer › Reasoner: `Operations (default)` | `Matrix where available`. It is read when the engine starts (it chooses which files of the worlds are loaded), so changing it restarts the engine worker from the last committed state (`engineClient.restart`).

## What the library gets
Built once per engine (`createReasoner(set)`), forked per session:
1. `worlds/core/mapping.sop` (data): three `core.schema.map` wires that let the library read our legends unchanged (`core.key`, `core.type`, `core.legend`; `closed=true` also means the world knows every instance).
2. The legends of the matrix worlds and of everything they import, in dependency order, as they are (`legend.sop`).
3. The knowledge bases (`kb.sop`) of the matrix worlds, and `@e.user core.agent` (the user is a built-in agent of every session).
4. The matrices (`matrix.sop`) and the action functions of `fns.mjs` (`export const fns`), registered as the library's `actions` (a registry of their own: an action named `add` does not replace the arithmetic, so no prefix is needed).

`matrix.sop`, `mapping.sop` and the library's own wires are read by the library's parser (SOP Lang v1.1: `?` is only a variable, a pattern is an ordinary `@id` wire, `#` comments are allowed); the files our parser reads (`patterns.sop`, `templates.sop`, `operations.sop`) have no comments. A matrix re-declares keys the legend already declares with `combine=intersect`.

## Matrix-mode extras of a world
`matrix.patterns.sop`, `matrix.operations.sop` and `matrix.templates.sop` are appended to the world's patterns, operations and templates **only** when the engine runs with `matrix` and the world opts in; templates go first, because the renderer tries the templates of a status in file order. An operation with `impl=matrix` has no function in `ops.mjs` (the validator accepts it). New phrasing follows ADR-007 (phrase groups, shapes).

## Session wires
`Session.add(wires)` tells the library every wire whose type its schema knows (not `core.question`, `core.request`, `core.answer`, `core.observation`). Our wires are serialized with short keys and parsed by the library. A wire the library refuses (a deny, a conflict) is recorded in `session.rs.refused` and the library stays as it was; our memory keeps the wire as before. `Session.clone()` forks the World (nothing is copied until one of the two changes), so dry runs, validation and snapshots never touch the original.

## Questions and requests
`Interpreter.resolve` asks the library when the question type belongs to a matrix world (the longest world id that prefixes it) or the request's action is declared by one; otherwise, and when the library answers `unsupported`, the operations answer as before.
- `world.query(wire)` / `world.act(wire)` -> our envelope (spec 04): statuses map 1:1 (`supported`, `conflicting`, `ambiguous`, `missing`, `unsupported`, `budget`); `refused` -> `conflicting` with `reason=precondition_failed`, the deny's `why` (it quotes the values) and, in `vars`, the keys of the wires it was decided on (`involved`) and its `bindings`; `no` -> `supported` with value `no`; `unknown` -> `missing`; `done` -> `supported` with the action's result fields; `unsupported` with a `reason` (a calculation that cannot be done) -> `unsupported` with `why`, without a reason -> the question is not the library's and the operations answer. `via` is `core.matrix`; `from` is the library's `from`. The library's soft constraints (`soft=true`, standing `core.issue` wires) keep an impossible statement and make every answer that rests on it `conflicting` with the reason.
- **Words around the numbers.** The envelope of a library answer has no prose. The matrix puts every number a reply needs on the answer wire (the keys its rules set with `core.on=`), and the library returns that wire as `supposed`; the owning world's `voice(ctx)` (exported by `fns.mjs`) only finds the words: `ctx.supposed` (the answer wire, flat), `ctx.env`, `ctx.where`, `ctx.issues()` (the standing issues with the wire they are about), `ctx.find(type)`, `ctx.name(id)`. There are no second queries. The existing templates are unchanged and read the envelope as before; `env.vars` are template variables, `env.why` is `{why}`.
- **A missing argument.** `core.action ... required=<key> ask.<key>="..." template.<key>="add <x> to my list"`: the library answers `missing`; the envelope carries `ask` and `pending = { world, key, template }`, so the discourse layer (spec 11 section 3) keeps the question open and the next message completes the command.
- **Mirrors.** `mirror=<type>` (repeatable, `core.world.mirror`) in `world.sop`: after a library answer, wires of these types are copied from the library's World to the session memory in our shape (a wire the action removed is retracted there), so worlds that read the memory (charts, documents) see what the matrix actions wrote, as they saw what `ops.mjs` emitted.

## Budget
One budget per turn. Every library call gets `{ steps: left }` where `left` is what is left of the turn's budget (`budget.remaining('sopworld')`); afterwards the steps it took, per library site, are ticks of the turn budget at `sopworld.<site>` (`match`, `chase`, `negation`, `aggregate`, `fluent`, `withdraw`, `validate`, ...). An excess ends the turn like any other site (`BudgetExceeded`); a library call that ran out answers `budget` and left the world as it was. The library's own loops carry ticks, and `tests/reasoner.test.mjs` runs its loop scanner on the vendored file; `tests/loop-guard.test.mjs` does not scan `src/vendor/`.

## What the matrix adds (matrix mode only)
| Say | What happens | How |
| --- | --- | --- |
| "add to my list" | "What shall I put on the list?", the next message completes it | `ask.item`, `template.item`, pending fill |
| "I buy a ball", "three of them" | the purchase becomes 3 balls, the money follows | action `shop.revise`, written as wires in the matrix: the latest purchase (`core.select=latest`) has its count set; the library revises the told value and everything that followed |
| "undo that", "that's wrong" + "yes", "no, I meant ..." | one undo (below) | `mark()` / `rewind()` of the library |
| "why?" | what the answer rests on | `explain` of the answer's `from`, the leaves with their `core.source` mapped to what the user said (`Discourse._because`) |
| "I got 5 lei back for a book, what did I pay?" | 17 | `shop.gotBack` tells the purchase with its change as a goal, `shop.whatPaid` asks the library with `mode=abduce` for the open key `paid` |
| "Ana got 2 apples from Tom. How many does Ana have?" | "Ana got 2 apples from Tom. I don't know how many Ana had before." | `delta=received` on the fluent: the known change stays when the start is unknown |
| "Tom has 3, Mia has 3. Who has the most?" | `ambiguous` with both | the library's tie |
| "Tom has 2 apples. Tom gives away 5" | kept; "That does not add up. Tom only had 2 apples, so Tom cannot give away 5." | `soft=true` on the count slot; the voice reads `issues()` |

## One undo
The library is the only record of what was said. Nothing else holds state that could diverge from it:
- **State derived from the library.** Each matrix world exports `toState({ find, query })` (kids.tasks: `{ lists, counter }`; kids.shop: `{ money, purchases }`; kids.arith: `{ holdings }`). The host layer writes its result into the session state after every library change (telling a wire, an answer, a rewind), so the hooks (`referents`, `summary`) and the dialogue layer's snapshots read what the library says. Like the operations' state it comes into being when the world first answers or has something to say.
- **Marks.** `ReasonerSession.beginTurn(turn)` takes `world.mark()` at the start of every dialogue turn (a mark costs nothing until the library changes); `commitTurn(turn)` keeps it when the turn changed the library (`world.stamp`). The dialogue layer's action of that turn carries it (`act.rsMark`; a statement that changed the library is an action too, so "that's wrong" offers to take it back).
- **Taking back.** "undo that" (`ReasonerSession.undo`), the dialogue layer's `undoAction` ("that's wrong", "yes") and a repair ("no, I meant ...", `_repair`) all call `ReasonerSession.rewind(mark, session)`: library `rewind`, the dialogue wires the library no longer holds are retracted in the session memory, the state and the mirrors are derived again. `rewind` returns a function that puts it all back (a repair that finds no correction gives up with it). Without the matrix reasoner nothing changes: the saved state is restored as before.

## Stage 1 limits
- The library holds the facts of the three worlds; the other worlds keep their engines and state. The switch never touches a world without `reasoner=matrix`: the same messages give the same replies, statuses and state in both settings (`tests/reasoner.test.mjs`).
- The old operations are not removed, and `ops` stays the default.
- A statement the library refuses (a hard deny) is not reported to the user (it is in `session.rs.refused` and the trace); a soft one is kept and flagged (above). Telling the user about a refused statement is SOPWORLD-1b item 2.
- Kept in the host layer, not the library's job: reply wording (a/an, plurals, "costs" or "cost", "about", "from Tom"); the sentence for a zero divisor; which item to name when a price is missing (a lookup of the price wires); the text handling of kids.tasks (splitting "milk, eggs and bread", list names, what a named thing matches).

- A statement the library refuses is not reported to the user (it is in `session.rs.refused` and the trace); the library follow-ups close the listed arith cases.

## SOPWORLD-1b: what the default `ops` strategy does now
The coherence failures that were ours (unread sentences, "why?", impossible statements, ties, unknown start) are closed in the rules and the dialogue layer, so both strategies are measured on sentences they can read: see spec 11 section 12. The `ops` strategy keeps the `from` list of every answer and explains with it; its impossible statements are refused when told (the matrix keeps them and flags them). New rules, phrase groups (`lang.quant.some`, `lang.quant.something`, `lang.then.now`) and replies are shared by both strategies; patterns whose reading differs from a matrix extra have a lower priority than the matrix extra, so the matrix reading still wins in matrix mode.
