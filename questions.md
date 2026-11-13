# Questions from the worker

The worker appends questions here and never deletes them. The reviewer removes a question only after answering it in a new round of `worker-tasks.md`.

Format:

```
## Q<n> (task Tn, <date>)
Question: ...
Context: what was tried, what the options are.
Blocking: yes/no. If no: the choice taken meanwhile.
```

## Q1 (SOPWORLD, every world on the library, 2026-11-11): how should the library be generalized? Ten proposals for review

Context: 18 of 24 worlds now run on sopworld behind the flag (ops is the baseline). Each wave measured the library against the custom `ops.mjs` code and wrote "Library improvements" in `worker-log.md` (about 50 items). Below they are grouped into ten proposals, ordered by the evidence. For each one: should it go to the library session as a task, in this order, or is something in our host the better fix?

1. **Structural sharing instead of copy-on-write of the whole world.** This is the main cost in every wave. The first write after `mark()`/`fork()` copies every index (`_detach`), so a turn costs about 10 µs per wire present. Measured examples:
   - geo.map with 1,250 place wires: 37 ms against 6 ms in ops;
   - the avatar kb with 1,140 wires: 170 ms against 76 ms for nine turns;
   - all 24 legends in one World: 75 ms against 11.6 ms.

   Proposal: a frozen base layer (kb, legends, matrix) shared by every fork, plus a small overlay of changes, possibly a persistent map, so a change costs O(changed). Question: is this the first library task (P2 of Round 5, extended), before any of the features below?
2. **External or frozen fact sources.** Big static tables (places, avatar variants, colour names) should be readable by rules and denies without being wires in the instance. Today we work around it with `kb=lookup`, a JS index invisible to rules. Proposal:
   - `World({ facts: { type: provider } })`, matched like wires but never copied; or
   - `core.table from=<lexicon>`;
   - plus `core.check fn=member` over a many-valued wire.

   Question: provider in the library, or keep `kb=lookup` in the host?
3. **Undo/redo as library features.** Every world rebuilt the same pieces in the host:
   - redo (`redo=` + the function `rewind` returns);
   - steps that are not undoable (`isView`, `passive`, untracked writes);
   - labels for the step taken back (`undoWords`);
   - undo by unit (one note instead of a whole turn);
   - a timeline that survives a watchdog restart (today a real regression in matrix mode).

   Proposal:
   - `mark(label)`, `world.marks()`, `world.redo()`;
   - `transient=true` types and `applyPatch(.., { track: false })`;
   - `rewind(mark, { only: type })`;
   - `world.toJSON({ timeline: true })` / `fromJSON`.

   Question: library, or one host module shared by all worlds?
4. **Aggregates and lists in rules and reasons.** Repeated in five waves:
   - aggregates need a separate anchor, and anchoring on a member made one count quadratic (433 ms against 11 ms);
   - an empty group has no 0;
   - there is no rank ("the 2nd chapter");
   - there is no join, so a reason cannot say "Shapes on the canvas: A, B" or "Mouths can be grill, speaker…";
   - ties in argmax have no "all" mode.

   Proposal: `core.aggregate … default=0`, `core.distinct` as an anchor, `core.rank`, `fn=join` / `?x:and` in reasons, `ties=all`. Question: one "aggregates v2" task?
5. **Multi-valued answers.** Two cases the library cannot answer today:
   - in value mode, a key with several values answers `conflicting`, so kids.animals cannot move "where does it live / what covers it";
   - an `is_a` check returns the supposed value instead of yes or no.

   Proposal: `many=true` / `answer=list` on the slot, and `mode=check`. Question: accepted as specified in the worker-log (with a minimal repro)?
6. **Better refusals.** Four requests:
   - bound variables in `why` (`violations[i].vars`, and filters such as `?n:ordinal`);
   - a rank on denies, because a refused chess move breaks three rules and the host ranks them by regex;
   - `why=` on slot violations (`type=`, `domain`, dangling refs);
   - referential integrity and uniqueness as slot kinds (`kind=ref to=…`, `unique=true`), which would replace 8 of the 17 denies in draw/diagram.

   Question: which of these first?
7. **Value kinds.** Two kinds, plus one patch operation:
   - `kind=blob` / opaque values, never tokenized and compared by hash, for big analysis JSON;
   - `kind=json` with path variables, for state kept next to the facts;
   - `replace` / upsert in `applyPatch` keeping the id. Today a retract plus a tell of the same id is refused as duplicate-id, so worlds invent revisions such as `chess.g_1`.

   Question: are these in scope for the library, or do we keep JSON strings?
8. **Cost control for rules.** Three proposals:
   - lazy rules (`lazy=true`, derived on query or check): chess re-derives the attack structure every turn, most of its +2 ms;
   - `index=false` slots, so a patch that touches only unread values skips the rules pass (1,000 moved things: 91 ms);
   - `core.action pure=true`, so an action that reads no cell skips the `assumptions()` pass.

   Question: worth it, or is proposal 1 enough?
9. **Expressions and builtins.** One rule needs 17 `core.calc` and 9 `core.check` wires to test "strictly between two squares". Proposal: `expr=` in calc/check plus `between`, `sign`, `abs`, and string checks (`matches`, `startsWith`, `lower`). Question: is a small expression language acceptable in SOP Lang v1.2?
10. **A public API for what the host reads privately.** The host reads `_rests` (assumptions), `_compiled().slots` (can anything be filled) and uses the stamp for "did anything change". Proposal:
    - a public `world.assumptions(ids)` and `canComplete()`;
    - a stamp that does not move when an instance is born or replays shared wires;
    - per-attribute tiers from the host (`tempo=100~default`), so "I assumed a bar chart" becomes possible.

    Question: OK to ask for these as one "host API" task?

Blocking: no. Meanwhile the host keeps its workarounds (`kb=lookup`, `redo=`/`isView`/`passive`, generated tables, regex ranking). The per-world numbers are in `sop_world_status.md` ("Per-world comparison"). The next host fix on our side is the undo timeline after a restart, saved with the state (proposal 3, last bullet).

Q1 answered by the reviewer in worker-tasks.md ("Answer to Q1 ... RE-VENDOR 0.7.1 + namespaces", 2026-11-11 23:35). The worker keeps this file append-only, so the reviewer may remove Q1.

## Q2 (FORMALIZE-FROM-WORLDS and E2, 2026-11-12): six proposals from today's results, for review

1. **Descriptions must not become memorization.** DESCRIBE-ALL for tictactoe, hangman and guess reached parity by copying every pattern alternative into a `core.word` wire. The descriptions came out 3 to 24 times longer than the hand-written patterns (guess: 11,939 lines for 500). That is memorization in another notation, not the generalization the user asked for. Proposal:
   - a description may only reference shared vocabulary: `lang.common` phrase groups, the world's lexicons, and one `core.word` per real word, never per phrase;
   - a world that reaches parity only by enumerating phrases is reported as a gap;
   - add a size gate to the DESCRIBE-ALL report: description lines plus words must not exceed the pattern lines.

   Agree? Already applied to the conversation worlds now in progress. `describe.sop` is no longer shipped in the webchat (8dd5d7f).
2. **The veto scales only with world hooks.** Today only art.draw and diagram.sketch answer "does this thing exist?" (`checkReferents`), and the library's fallback judgement needs arguments mapped to slots, so most readings stay unjudged. Proposal: every world declares, in SOP and English only, an argument-to-slot mapping for its operations (`core.describe.arg of=` already has most of it). The host then derives `checkReferents` and the library's `judgedBy` for every world from that one declaration, with no per-world JS. Agree?
3. **Joiners per language belong in the translation layer.** E3b showed that "listă cu lapte și ouă" and "titlu A, B și C" mis-split because the clause and list splitters know only English joiners. Since Romanian stays out of the worlds, the fix is the translator: make sure "și", "apoi" and "plus" become "and" and "then" before segmentation, and add a test set of Romanian compounds. Agree that this goes into RO-TRANSLATE-FALLBACK's follow-up?
4. **About 207 Romanian replies still end as the fixed line** ("Nu am încă o formulare…") without a real Translator. The browser Translator covers them in Chrome. Should the rules translator keep growing templates by frequency, or do we accept the fixed line as the no-API fallback and stop there?
5. **Two small behaviour choices, both neutral in the A/B:**
   - (a) "Yes" to an offer, then "Undo that". The library returns to the open offer (`pending`, `inputMode=confirm`), while ops forgets it. Proposal: an undo of a confirmation also closes the offer it answered.
   - (b) A tab switch or a setting is a timeline step, so a run of "undo" also takes back "let's play tic tac toe". Keep it?
6. **Games are the slowest group (+3.5 ms at p50).** `lib.act` takes 2.4 ms per turn and `_state` 0.9 ms (7.8 derivations per turn). Proposal: cache `toState` per instance stamp across a turn, which is safe because it is a pure function of the instance. The library item is a cheaper `act` transaction for actions that change one wire. OK to do the host part?

Blocking: no. Meanwhile: (1) is applied; the veto is being made the default (user decision 2026-11-12) with the false `no-game` vetoes fixed first; (2)–(6) wait for the answer.

## 2026-11-13 — SPACE: what sopworld lacks for the module `space` (library items; no blocker, host functions used)

The module `space` (worlds/space/, specs/18) is rules in JavaScript (`space.mjs`) over a projection `space.item` / `space.frame`; none of its arithmetic is a declared host function of sopworld yet, because the library lacks what a selection needs. Please pass to the library:

1. **Ordering of a set of wires by a number** (a `core.calc` that sorts by a key and returns the n-th, or the rank of each wire): "the second from the left", "the first in reading order". Today: `readingOrder` in space.mjs.
2. **Median / middle element of a set along a key** (`fn=median`, and the element at the median): "the middle house". Today: sort and pick in space.mjs; an even count has no middle and the host asks.
3. **Argmin / argmax over a set** (the wire with the smallest or largest value of a key, with all ties returned): "the biggest", "the nearest to X". Today: sort in space.mjs.
4. **Pairwise functions over two sets** (distance between two boxes, overlap test) as a calc that ranges over pairs: "next to", "no overlap". Today: `gap`, `overlaps` in space.mjs.
5. **A fixed-point / iteration** for "tidy up" (push apart until nothing overlaps): today a bounded loop in space.mjs.

Meanwhile: the module is host-function style (pure functions imported by the hosts), the spatial words are real `core.lexicon` groups (generated from the tables, checked by a test), and the schema (`space.item`, `space.frame`) is declared in `worlds/space/legend.sop` so a later matrix version can derive the same answers from wires. Blocking: no.
