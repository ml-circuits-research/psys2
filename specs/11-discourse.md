# 11 - Discourse layer (dialogue continuity)

Implemented in `src/dialog/discourse.mjs`, hooked into `DialogSession.send` (`src/dialog/index.mjs`). Decision: ADR-006. Browser-safe, rule-based, no model.

## 1. Frames (last-frame memory)
After every request or question that the interpreter answered as `supported`, the session records a frame: `{ turn, world, patternId, kind, text, slots, args, op }`.
`text` is the sentence (a question keeps its `?`); `slots` are the pattern slots with class (lexicon id, `agent`, `number`, `words`) and character offsets inside `text`; `args` are the entries of the emitted wire with their legend key types. The newest 5 frames are kept (`session.discourse.frames`). Navigation, help and games (`ui.shell`, `ui.help`, `kids.common`, `games.*`) are never frames.

## 2. Ellipsis
A fragment is split into marker and content (`splitFragment`): leading markers (`and`, `now`, `what about`, `how about`, `the same for`, `same with`, `do the same for` ...), trailing markers (`too`, `as well`, `also`, `instead`), or a pure repetition (`again`, `once more`, `the same`). Marker-led fragments and repetitions are tried before normal routing; a message that no world parsed (one unparsed segment, at most 4 content words, not starting like a full sentence) is tried afterwards as a bare fragment.
Resolution, for each frame from the newest: copy `frame.text`, replace one slot by the content (typed slots first, rightmost first; a fragment that starts with the preposition before a slot only replaces that slot; a leading determiner is dropped when needed; free-text slots last), then run the normal rule formalizer restricted to the frame's world. The result is accepted only when it is one fully understood segment of that world and no free-text slot swallowed the replacement. Argument types are therefore checked by the slot classes themselves (agent for agent, place for place, colour or size word for the key it fits, object for the target). The segment carries `discourse = { kind: 'ellipsis', how, of, fragment, rewritten, slot, world, frameTurn }`; it is also in `trace.discourse.resolved` and `trace.segments[].discourse`.

## 3. Pending expectations
One expectation per session, valid for exactly one turn (`takePending` at the start of `send`):
- `fill`: an operation answered `status=missing` with `pending: { key, type }` in its envelope (and a clarification in `note`). The dialog stores `{ type: 'fill', world, patternId, text, key, expected, op, question }`. The next utterance is tried first as the filler: `text + " " + reply`, then the reply alone, in the pending world; accepted when fully understood by another pattern than the incomplete one. Otherwise the expectation is dropped and the utterance is routed normally (so a full command elsewhere is never blocked).
- `confirm`: a world opened a modal yes/no offer (its state has `inputMode`, e.g. the avatar's "Say yes to become ..."). It is recorded in the same structure (`trace.discourse.pending`) and answered by the world's `interceptInput` as before; it too lives one turn.
Worlds with a clarification: `art.draw` ("Draw" -> "What should I draw?"), `geo.map` ("Show me" -> "Which place should I show?"), `media.music` ("Play" -> "What should I play?"). The bare patterns have priority 11, below the chess draw offer and the tic-tac-toe "play", so on other tabs nothing changes; on the world's own tab the active-tab tier (ADR-004) selects them.

## 4. Coordination
`formalize` (spec 03 section 1c, verb ellipsis) also distributes the verb over a verbless noun phrase that another world read as a command of its own ("Give yourself round glasses and a beard": "a beard" is no hangman guess when `give yourself a beard` is read by the first clause's world).

## 5. Trace
`trace.discourse = { resolved, pending, consumed, frames }`.
