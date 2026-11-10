# 15 — The reasoner host layer (sopworld), stage 1

Implementation: `src/reasoner/`, the vendored library `src/vendor/sopworld/`, per-world `matrix.sop` + `fns.mjs`. Browser-safe. Task: SOPWORLD-1 (worker-tasks). The numbers of stage 1 are in `worker-log.md`.

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
4. The matrices (`matrix.sop`) and the functions of `fns.mjs` (`export const fns`). The library has **one function registry per World** (its builtins `add`, `sub`, `count`, ... are in it), so a world registers its functions under its short name: `tasks.add`, `shop.revise`.

`matrix.sop`, `mapping.sop` and the library's own wires are read by the library's parser (which accepts `#` comments); the files our parser reads (`patterns.sop`, `templates.sop`, `operations.sop`) have no comments.

## Matrix-mode extras of a world
`matrix.patterns.sop`, `matrix.operations.sop` and `matrix.templates.sop` are appended to the world's patterns, operations and templates **only** when the engine runs with `matrix` and the world opts in; templates go first, because the renderer tries the templates of a status in file order. An operation with `impl=matrix` has no function in `ops.mjs` (the validator accepts it). New phrasing follows ADR-007 (phrase groups, shapes).

## Session wires
`Session.add(wires)` tells the library every wire whose type its schema knows (not `core.question`, `core.request`, `core.answer`, `core.observation`). Our wires are serialized with short keys and parsed by the library. A wire the library refuses (a deny, a conflict) is recorded in `session.rs.refused` and the library stays as it was; our memory keeps the wire as before. `Session.clone()` forks the World (nothing is copied until one of the two changes), so dry runs, validation and snapshots never touch the original.

## Questions and requests
`Interpreter.resolve` asks the library when the question type belongs to a matrix world (the longest world id that prefixes it) or the request's action is declared by one; otherwise, and when the library answers `unsupported`, the operations answer as before.
- `world.query(wire)` / `world.act(wire)` -> our envelope (spec 04): statuses map 1:1 (`supported`, `conflicting`, `missing`, `budget`); `refused` -> `conflicting` with `reason=precondition_failed` and the deny's `why`; `no` -> `supported` with value `no`; `unknown` -> `missing`; `done` -> `supported` with the action's result fields. `via` is `core.matrix`; `from` is the library's `from`.
- **Words around the numbers.** The envelope of a library answer has no prose. The owning world's `voice(ctx)` (exported by `fns.mjs`) puts the words on it (`note`, `unit`, `status`, `vars`) from `ctx.where`, `ctx.env`, `ctx.query(...)` (the library) and `ctx.find(type)`. The existing templates are unchanged and read the envelope as before; `env.vars` are template variables, `env.why` is `{why}`.
- **A missing argument.** `core.action ... required=<key> ask.<key>="..." template.<key>="add <x> to my list"`: the library answers `missing`; the envelope carries `ask` and `pending = { world, key, template }`, so the discourse layer (spec 11 section 3) keeps the question open and the next message completes the command.
- **Mirrors.** `mirror=<type>` (repeatable, `core.world.mirror`) in `world.sop`: after a library answer, wires of these types are copied from the library's World to the session memory in our shape (a wire the action removed is retracted there), so worlds that read the memory (charts, documents) see what the matrix actions wrote, as they saw what `ops.mjs` emitted.

## Budget
One budget per turn. Every library call gets `{ steps: left }` where `left` is what is left of the turn's budget (`budget.remaining('sopworld')`); afterwards the steps it took, per library site, are ticks of the turn budget at `sopworld.<site>` (`match`, `chase`, `negation`, `aggregate`, `fluent`, `withdraw`, `validate`, ...). An excess ends the turn like any other site (`BudgetExceeded`); a library call that ran out answers `budget` and left the world as it was. The library's own loops carry ticks, and `tests/reasoner.test.mjs` runs its loop scanner on the vendored file; `tests/loop-guard.test.mjs` does not scan `src/vendor/`.

## What the matrix adds (matrix mode only)
| Say | What happens | How |
| --- | --- | --- |
| "add to my list" | "What shall I put on the list?", the next message completes it | `ask.item`, `template.item`, pending fill |
| "I buy a ball", "three of them" | the purchase becomes 3 balls, the money follows | action `shop.revise`: `replace` of the last purchase |
| "undo that" | the last thing told is taken back with everything that followed | `ReasonerSession.undo`: `retract` of the wires the turn told (discourse `meta`, only when something was told in the last six turns) |
| "why?" | what the answer rests on | `explain` of the answer's `from`, the leaves with their `core.source` mapped to what the user said (`Discourse._because`) |
| "I got 5 lei back for a book, what did I pay?" | 17 | `shop.gotBack` tells the purchase with its change as a goal, `shop.whatPaid` runs `abduce` over the `paid` key |

## Stage 1 limits
- The library holds the facts of the three worlds; the operations' per-world `state` (and the `referents`/`summary` hooks that read it) is not updated for them in matrix mode. The other worlds keep their engines and state.
- The old operations are not removed, and `ops` stays the default.
- A statement the library refuses is not reported to the user (it is in `session.rs.refused` and the trace); the library follow-ups close the listed arith cases.
