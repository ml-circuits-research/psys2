# session.dialogue -> sopworld `std.dialogue` (on `std.focus` and `std.fill`)

**What it is.** The dialogue of a session as a shared module (spec 22, M1): the focus (last thing, action, place, world), the log of one plain record per turn,
the reading of the KIND of every turn before any tab world (continuation, list, correction, complaint, why-question, acknowledgement, scene question,
completion of a fragment), and the why-answer built from the last turn's trace (what was read, which default and its source, what came of it, an offer to undo).

**API (`fn/dialogue.mjs`).** `class Dialogue(session)`: `fill(roles, { world, scene })` (writes `std.focus.turn` / `std.focus.mention` and `std.fill.need` /
`std.fill.offer` wires; the library chooses value, tier and source), `record(turn)`, `turn(text, { pend, sid, correction })`, `amend`, `why`, `explain(rec)`,
`ack`, `sceneQuestion`, `facts`, `complete`, `completeList`; helpers `verbOf`, `placeOf`. `sop/`: legend, lexicon (the English words of correction, complaint,
why, acknowledgement as `core.phrase` groups).

**Host dependencies.** `session.engine.interp.hook(...)` (the world's own `why` hook), `session.isession` (state, form snapshot), `Discourse.pending` (the open
question), `alts(lang, group)` phrase groups from `lang.common`; the segments structure produced by the turn pipeline (README of `turn-pipeline`).
The English phrase lists are English content: ship as the English pack. Only the pieces that read `session.*` objects need an adapter.

**Tests to carry.** `tests/dialogue.test.mjs`, `tests/dialogues.test.mjs`, `sop/tests.sop`.

**Host keeps.** Language detection and translation, UI replies, `Discourse` (the host's pending-question state, until ASTRA frames are generalised too:
`src/astra/frames.mjs` kinds fill / confirm / choice / mode are also general, see `docs/host-boundary.md`).

**General lines still in PSys2:** 151 SOP, 529 code.
