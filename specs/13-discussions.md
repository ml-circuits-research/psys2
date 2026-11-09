# 13 - Discussions and state management (ASTRA)

Decision: ADR-008. Library: `src/astra/` (browser-safe, no `node:*`, no model). Integration: `src/dialog/index.mjs` (`session.astra`) and one hook in `src/dialog/discourse.mjs`. Task list: worker-tasks.md section 2 "ASTRA" (A1-A11, "per tab and per world").

Goal: one core library owns discussions, world instances, the information state, expectations, focus, history and (later) plans, so that no world re-implements dialogue or state handling. SOP Lang stays the language of facts, events and plans (they are wires); ASTRA stores them, it does not parse them.

## 0. Concepts and what they replace
| ASTRA concept | Replaces / generalises today |
| --- | --- |
| Chat (one browser session of the demo) | `DialogSession` |
| Discussion | nothing (frames in `discourse.mjs` are per session, not per activity) |
| WorldInstance | `isession.state[worldId]` (one state per world per session) |
| User scope | `user.profile`, `ui.shell`, preferences (never inside a discussion) |
| Dialogue move + information state (section 3) | the ad-hoc checks in `Discourse.meta`, world `interceptInput` yes/no/cancel |
| TaskFrame + Agenda (section 4) | `Discourse.pending` (`fill`, `confirm`), `inputMode` modal worlds |
| Focus stack + entity registry (section 5) | `ctx.referents`, `Discourse.topics`, `lastByWorld` |
| EventLog + snapshot (section 6) | `Discourse.actions` (undo), `DialogSession.snapshot()` |
| `lastUnfinished` (section 8) | `Discourse._topicWorld(null, true)` ("where were we?") |

## 1. Identities (A1)
- `Discussion { id, title, goal, status, tab, instances: [instanceId], context, openQuestions, plan, revision, created, updated, lastMsg, agenda, focus }`. `status` is `active | suspended | completed | abandoned`. `id` is `d1, d2 ...` (a counter per chat, persisted).
- `WorldInstance { id, world, discussion, version, state, links }`. `id` is `i1, i2 ...`. One world can have many instances. `version` is incremented whenever the instance is saved out after a change. `state` is the saved copy; while the instance is live the truth is in the binding. `links` lists other discussions that reference the instance; they share it, they do not copy it. Two discussions never share an instance unless linked explicitly.
- **Binding** (the compatibility layer): world code still reads and writes `session.state[worldId]`. The binding `{ get(world), set(world, state), initial(world) }` is the only bridge. Per world exactly one instance is *live*: `chat.live[world] = instanceId`. Activating a discussion saves out the live instance of each world the discussion has an instance of and loads the discussion's instance into the binding. Worlds the discussion has no instance of are untouched, so the legacy behaviour (a command in one tab changes another tab's world) is unchanged. Creating a second instance of a world ("new chess game") saves out the live one and loads the fresh initial state.
- **Scopes.** `USER_SCOPE` worlds (`ui.shell`, `ui.help`, `kids.common`, `core`, `lang.common`, `user.profile`) are never instanced: their state is the user scope, shared by all discussions, and never swapped.
- **Attribution.** After each turn, `afterTurn({ msgId, text, changed, tab, moves, before })` attributes the turn: each changed non-user-scope world belongs to the discussion of its live instance; a world with no instance yet is adopted: an instance is created from the live state in the current discussion of the world's tab (lazily created, title from the world) or, for worlds without a tab, in the active discussion. Every act records `{ msgId, discussion, worlds, moves, text }`. The turn's discussion becomes the active one and the current one of its tab.
- **Per tab (user question 14:57).** `chat.tabs[tab]` is the discussion that the tab resumes. `onTabChange(tab)` activates it (swapping its instances in). `discussionsOfTab(tab)` lists the tab's discussions, the current one first.
- Acceptance: two chess games and one drawing can be suspended and resumed, also after `snapshot()`/`restore()` into a fresh session: `tests/astra-registry.test.mjs`, `tests/astra-session.test.mjs`.

## 2. Reading invariants
ASTRA never changes how a message is read. The compatibility layer only moves world state between instances on explicit discussion switches and on tab changes of tabs that already have a discussion. The only new utterances it recognises are the discussion commands of section 8, and only when they name an existing discussion (or say "new discussion" / "my discussions"). Every other text falls through to the existing pipeline. The turn guard (HANG, `src/formalizer/guard.mjs`) covers ASTRA because everything it does runs inside `send`: the session `snapshot()` and `restore()` include the ASTRA record, so an aborted turn leaves no discussion or instance change behind. ASTRA does no I/O and no awaits on the turn path (persistence is explicit, section 6).

## 3. Information state and dialogue moves (A2)
Move: `{ type, text, content?, target? }`, `type` one of `inform ask answer request correct cancel confirm resume switch`.
`recognize({ text, meta, pre, pending, segments })` derives the moves of a turn from what the pipeline already decided (it does not read text again): a consumed `fill` expectation yields `answer`; a consumed `confirm` yields `confirm` (a yes), `cancel` (no/cancel) or `answer`; meta kinds `cancel`, `repair` and `feedback` (`correct`), `topic` (`resume` when no target, else `switch`), `choice.answer` (`answer`), `offer` (`confirm`); a supported request segment yields `request`, a question segment `ask`.
`applyMove(discussion, move, { validate })` is the one update function. The information state is `discussion.context.is = { facts, qud, commitments, proposals, moves }`:
- `inform`: becomes a *proposal*; it becomes a fact only when `validate(proposal)` accepts it. Without a validator it stays a proposal.
- `ask`: pushes the question on `qud`, newest first.
- `answer`: resolves the top question, records the fact with the question as justification.
- `request`: records a commitment, never a fact.
- `correct`: marks the newest fact (or the named one) superseded with `reason: 'correction'` and records the new one when there is content.
- `cancel`: drops the top proposal or open question; never undoes state (only undo does).
- `confirm`: accepts the pending proposals (they pass through `validate`).
- `resume` / `switch`: returned as an instruction `{ switchTo }` for the chat; the discussion state is untouched.
Move recognisers come from `lang.common` through `ctx.lang` and `meta.mjs`; worlds do not parse yes/no/cancel themselves (migrating the existing world checks is A3/A10).

## 4. Task frames and the expectation agenda (A3)
`TaskFrame { id, instance, world, kind, params: { name: { type, required, value, admissible } }, completion, question, state, turn }`. `kind` is `fill` (a missing argument), `confirm` (yes/no), `choice` (options) or `mode` (dictation, a game, an interview). `completion` is declarative: `all-required`, `answered` or `explicit`. `state` is `active | suspended | done | cancelled`.
`Agenda` (per discussion): `push(frame, { interrupt })` (an interruption suspends the active frame of the same instance), `top()`, `suspend`, `resume`, `complete`, `cancel`, `provide(frameId, name, value)` (sets a parameter; the frame completes when its completion condition holds).
`route(text, { compatible, passThrough })` decides which frame an answer belongs to: first the newest active frame, then the suspended ones, most recent first, taking the first for which `compatible(frame, text)` is true. A text for which `passThrough(text)` is true (switch, help, cancel, a discussion command) is never captured by a frame. A mode belongs to the frame's instance and therefore to its discussion: it only receives messages while its discussion is active.
Adapters mirror the existing records so the migration is incremental: `frameFromPending(pending)` (`Discourse.pending`) and `frameFromModal(world, state)` (`state.inputMode`). Today `Discourse.openFill/openConfirm` are mirrored into the agenda (observational); the interceptors of `docs.editor` (dictation), the games and `user.profile` are migrated one per commit under A10.

## 5. Focus stack and entity registry (A4)
`Focus` (per discussion): a stack of `{ entity, turn }`, newest first; `touch(entity)` moves to the top. It is part of the discussion record, so switching discussion restores that discussion's focus.
`Entities.register({ id, instance, kind, noun, aliases, attrs })`, `ingest(instance, referents)` (the output of a world `referents(ctx)` hook), `resolve(phrase, { kinds })` returns `{ status: 'one' | 'ambiguous' | 'none', candidates }`. Resolution order: pronouns (`this`, `it`, `that one`) to the focus top of a compatible kind; `the other one` (the entity before the focus top of the same kind); ordinals (`the second drawing`) and attributes (colour, size, kind noun); else a name or alias match. Ambiguity keeps all candidates and `askWhich(candidates)` makes the one short question ("Which one: the red house or the blue house?").

## 6. Event log, snapshots, undo, persistence (A6)
`EventLog` is append-only per chat: `{ seq, discussion, instance?, type, msg?, data }`; types `act`, `move`, `suspend`, `resume`, `instance`, `effect`, `undo`. Current state is indexed by the registry (not recomputed from the log); the log provides history and provenance.
- `snapshot(astra)` gives `{ schema, chat, counters, discussions, instances (live states saved out), live, tabs, active, log, effects }`. `restore(astra, json)` runs `migrate(json)` (a table of `schema n -> n+1` functions), rebuilds the registry and loads the live instances into the binding. Restoring never runs effects.
- **Effects** (export, speak, download) are logged with an execution id; `shouldRun(exec)` is false for any id already logged, so a restore, a replay or an undo never repeats them.
- **Undo** is core: `act` events keep `before` snapshots of the instances they changed; `undo(discussion)` restores the newest and logs `undo`. A reversible command may declare `inverse` (`{ op, args }`) which the host can run instead; snapshot restore is the default, so every world is covered without a per-world hook.
- **Persistence**: `Storage(backend)` over a localStorage-like object, key `astra.v1.<chatKey>`; `save(astra)` / `load(astra)`; versioned schema; a corrupt or newer record is ignored (the chat starts empty). The host calls `save` when idle; the library never writes by itself. IndexedDB can implement the same three methods.

## 7. Provenance, truth maintenance, HTN, blackboard, statecharts, world contract (A5, A7-A10)
Not implemented in this stage; the data model reserves the fields: `facts[].source`, `facts[].validity`, `facts[].justification` (A7), `discussion.plan` (A8), `context.hypotheses` (A9), `world.chart` (A5), the world contract (A10). No probabilistic machinery unless the dialogue set shows ambiguity that needs it.

## 8. Discussion commands and "where were we?" (A11)
`parseCommand(text)` recognises: `new discussion`; `my discussions` / `list the discussions` / `show my discussions`; `back to the <ordinal> <noun>`, `continue the <noun> (from before)`, `go back to the <noun>`. A noun reference is resolved with `findDiscussion(ref, astra)` against discussion titles, worlds and tab words; an ordinal selects among the discussions of that world, oldest first. A command is handled only when it resolves to an existing discussion that is not the current one of its tab, or is one of the first two commands; otherwise it is not a command and the normal pipeline reads it (topic return of `Discourse`, world patterns). The closed phrase sets live in `src/astra/commands.mjs` like the recognisers of `meta.mjs` (ADR-007 concerns world patterns).
`lastUnfinished({ topics, lastByWorld, here, lastTopic })` is the definition decided in the review: **"where were we?" is the most recent unfinished activity that the user left for a digression**, not the last thing said and not the oldest topic. If the digression came out of a story the answer is the story; out of the avatar, the avatar. Inputs: recency-ordered topics (worlds), the world of the open tab (`here`, the digression), and `lastTopic` (an explicit return to an earlier activity stays there until the user digresses again). `Discourse._topicWorld(null, true)` delegates to it; behaviour is identical.
`card(discussion)` is the projection for the UI: title, goal, worlds, status, last progress, open question, next step. `panel({ tab, status })` lists discussions for a Discussions panel. The demo UI itself waits: the settings modal is being rebuilt.

## 9. Migration plan and status
A1 registry + binding + per tab; A2 moves + information state; A3 frames + agenda (library and mirrors; interceptor migration per world in A10); A4 focus + entities; A6 log + snapshot + storage + undo; A11 commands + `lastUnfinished` + card and panel data. Per-stage status is in `worker-log.md` "ASTRA (2026-11-09)". Each stage keeps readings unchanged (section 2): the operational and dialogue sets are the gate.
