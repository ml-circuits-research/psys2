# 22 — session.dialogue: the kind of every turn, the focus, the trace (WORLDS-AS-MODULES M1)

Implementation: `src/dialog/dialogue.mjs` (browser-safe), world directory `worlds/session.dialogue/` (cue phrase groups `dialogue.*`, no patterns, never a routing target), hooks in `DialogSession._sendCore`. Tests: `tests/dialogue.test.mjs` (both reasoners).

## Contract
One contract for every tab: the tab receives a complete request or nothing. The module reads the kind of a turn before any tab world:
- **why-question / complaint** ("why did you do that", "how did you get to chess", "that is wrong", "thats wrong, I asked X"): answered from the trace of the LAST turn (what was said, which reading and why, fixed words, ignored words, the filled roles and their source, the world's own `why` hook, the reply) plus an offer to undo; never an action.
- **bare yes / no** with nothing pending: right after an action a refusal is a rejection (offer to undo); otherwise "Yes to what?". A word some world reads as a request of its own ("stop") is that request.
- **scene / history question** ("did you draw a cat before?"): answered from the referents of the scene and the log.
- **correction**: `I said / I meant / I mistyped X`, `that is X, not Y`, `V X, not Y` (the not-clause is not handed to the tab), and the INPUT-HISTORY flag `send(text, { correction: { of } })` (the last request is taken back, the edited one is read as a request of its own). They call `Discourse._repair`.
- **continuation / list** (after `disc.meta`, `ellipsis` and `pronoun` could not complete the turn): a fragment without verb or thing is completed from the focus (`complete`), a list inherits the verb of its first read item (`completeList`). A completion is accepted only if the thread's world reads it completely, nothing ignored, every content word known, dry run supported. The thread ends with another world, a cancellation, a bare answer, a question the system asked, or 12 turns.
- **the session as content** (`sessionContent`): "a chart / a paragraph about the current discussion" becomes the session facts in the form the reading world accepts (list of counts, or prose).

## Relative continuations (class B of the real set, sopworld `resolveEllipsis`)
Implementation: `src/dialog/relative.mjs`, step 7 of `Dialogue.turn`. Tests: `tests/relative-moves.test.mjs`.
- **What**: right after a move of things of any world with a `referents` hook (the last effectful action at most 3 turns old whose request names a direction of `lex.acts.dir`), a turn that continues it ("even higher", "move it even further to the left", "further to the right") or corrects its thing ("not the first house, the one in the middle", "no, the last one").
- **Gate (structural)**: the turn has no word of its own outside the closed classes (continuation.mjs `GRAMMAR`), the directions, the amount words (more, further, even, again, still, bit, little, slightly), the negations, the ordinals and positions, the colours and the nouns of the world's referents; the only verb allowed is the verb of the move, and with it no noun of the scene (then it is a request of its own).
- **Roles by the library**: a sopworld World of the scene (each referent typed `scene.<kind>` with its `x`; `w.lang.en.lex name=acts.dir`, `w.lang.en.neg`, `w.lang.en.ordinal` from the language world) and `resolveEllipsis(world, text, { act: move, args: { thing, dir } })`: the direction the turn names (else the move's own when `relative.more`), the thing by its position among the things of the moved thing's kind ordered by `x` (first, middle, last, an ordinal), the clause with a negation rejected.
- **Realised** as the world's own request, verb of the move + the referent (`describeReferent`, or "the <noun>s" for several) + the direction ("to the left", "higher"); it must be read completely by that world and (not for a correction) its dry run supported, else the step does nothing. A turn whose move changed nothing (a thing at the edge) continues the salient things.
- **Correction**: a negated clause dropped and a thing picked: the last move is taken back (`Discourse.undoAction`) and the new request is one step for the user. The info says `how: relative`, `via: sopworld.resolveEllipsis`.

## Focus and gaps on sopworld 0.17.0
Every turn is a plain record in `dialogue.log` (JSON, in `memoryJSON` and in the undo snapshot). `fill(roles)` writes the log as `std.focus.turn` / `std.focus.mention` wires and the lacking roles as `std.fill.need`s of the new turn (scene offers in tier `scene`); the library chooses and returns value, tier and source, which the why-answer says. The verb of a place comes from the focus, else from the acts words (`acts.verb.place`, temporary seed until `k.actions`). The acts executor takes the focus through `ctx.dialogueFocus()` when its own is empty, and schema worlds export `referents`.

## Facts (ABOUT-THE-DISCUSSION)
`facts()` gives `things` (noun, count, world), `items` (identity `world:id`, kind, noun, aspects: the shape a `session.things` store holds), `topics`, `games`, `places`, `asked`.
