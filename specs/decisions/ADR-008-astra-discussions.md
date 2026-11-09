# ADR-008: ASTRA, discussions and state management as a core library

Status: accepted

## Context
Dialogue and state handling lived in pieces: frames and expectations in `discourse.mjs`, modal `interceptInput` modes in worlds, one state per world per session, `ctx.referents`, dispatcher candidates, undo snapshots. Nothing survived a reload and a world could not have two instances (two chess games).

## Decision
A browser-safe library `src/astra/` (spec 13) models Chat, Discussion and WorldInstance, typed dialogue moves over an information state, task frames with an expectation agenda, a focus stack with an entity registry, an append-only event log with snapshots and core undo, and discussion commands. SOP Lang stays the state and event language.
The integration is a compatibility layer: worlds keep reading and writing `session.state[worldId]`; a binding swaps the live instance of a world on explicit discussion switches and tab changes. ASTRA never changes how a message is read: it observes each turn and recognises only commands that name an existing discussion. Stages (A1...A11) land one commit each, gated by the operational set, the dialogue set and `npm test`.

## Consequences
- Two games and a drawing can be suspended and resumed, also after a reload (`snapshot`/`restore`, `Storage`).
- Worlds can later drop their own yes/no/cancel and undo code (A3, A10); until then both paths exist.
- Cost on the turn path: bookkeeping only (no I/O, no awaits); the guard's snapshot/restore covers ASTRA state.
- Not decided here: probabilistic hypotheses (A9), planning (A8), statecharts (A5); the data model reserves their fields.
