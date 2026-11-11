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
