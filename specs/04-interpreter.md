# 04 — Main interpreter, operations and rendering (rules profile)

Implementation: `src/interpreter/` (browser-safe). This is the JavaScript execution strategy of vision §8, restricted to what the first worlds need. Lean and solver backends plug in later behind the same envelope.

## Working memory
A **session overlay**: the session's wires (entities, facts and events from the dialog, questions, answers) on top of the knowledge bases of the loaded worlds. Indexes: by id, by type (including ancestor types from the legends), by `(type, fullKey, value)`.

## Questions
```
@w5 core.question
    type=kids.arith.holding
    seek=count
    where.owner=$e.tom
    where.item=apple
```
- `type`: the wire type asked about. `seek`: a key of that type (short or full). `where.<key>=v` (repeatable): constraints on keys of `type`. `about=$id`: ask about one specific wire instead of `where`. `mode=value` (default), `mode=exists` (yes/no), `mode=list` (all matching values), `mode=count`.
- Resolution order:
  1. If the sought key is declared `compute=true` and an operation lists it in `outputs`, run the operation(s).
  2. Otherwise **direct lookup**: wires of `type` (or a descendant) matching all `where` constraints and having the sought key. One distinct value → `supported`; several distinct values → `conflicting` (with the alternatives); none → step 3.
  3. Operations whose `outputs` include the key.
  4. Nothing applies → `missing`, with the sought key and its legend `ask` text.
- `mode=exists` returns `yes` (supported), `no` only if the type's world declares the relevant predicate closed (`closed=true` on the type in the legend), otherwise `unknown` (`missing`). Open world is the default (vision §4).
- Every answer is written to the session as
```
@a3 core.answer
    to=$w5
    value=8
    core.status=supported
    core.via=$op.kids.arith.currentCount
    core.from=$w1
    core.from=$w2
```

## Requests
`core.request action=<operation id or action name> arg.<name>=<value>...` runs the operation with `semantics=action` whose id or `action=` matches. Actions may change **session state only** (task lists, reminders, a game score); external effects need explicit capabilities (vision §8) and are out of scope for the fixture worlds.

## Operation declarations (`operations.sop`)
```
@op.kids.arith.currentCount core.operation
    outputs=kids.arith.holding.count
    inputs=kids.arith.holding.owner
    inputs=kids.arith.holding.item
    impl=currentCount
    semantics=query
    doc="The number someone has after applying, in order, every giving, getting, eating and buying event."
```
`semantics` is `query` (reads), `compute` (pure function of its inputs) or `action` (changes session state; then `action=<name>` names it). `impl` names an export of the world's `ops.mjs`.

## Operation implementations (`ops.mjs`)
```js
export function currentCount(ctx, args) {
  // args: { owner: 'e.tom', item: 'apple', question: <wire> }
  return { status: 'supported', value: 8, from: ['w1', 'w2'], assumptions: [] };
}
```
**Result envelope** (vision §14): `{ status, value?, unit?, values?, from?: string[], assumptions?: string[], missing?: string[], alternatives?: any[], note?: string, data?: object }`.
`status` ∈ `supported` · `missing` (evidence or input missing) · `conflicting` · `ambiguous` · `unsupported` (outside what the world can do) · `budget` (limit reached) · `error` (exception; never turned into `false`).

**`ctx` API** (all that `ops.mjs` may use):
| Member | Meaning |
| --- | --- |
| `ctx.find(type, where?)` | wires of `type` or descendants matching `where` (short or full keys), session and KB |
| `ctx.ordered(type, where?)` | same, sorted by `core.seq` (dialog order); KB facts first |
| `ctx.get(id)` | one wire by id |
| `ctx.val(wire, key)` | decoded value: number for `integer`/`number`, boolean, id string for references, string otherwise |
| `ctx.vals(wire, key)` | all values of a repeatable key |
| `ctx.ask(spec)` | ask the main interpreter a sub-question `{type, seek, where, mode}`; returns an envelope; depth-limited |
| `ctx.emit(sopText)` | add wires to the session (actions only) |
| `ctx.state` | a plain JSON object persisted with the session, namespaced per world |
| `ctx.ask_text(key)` | the legend question of a key |
| `ctx.name(id)` | display name of an entity |
| `ctx.effect(name, args)` | queue a client-side effect (actions only); returned by `session.send()` as `effects` (spec 07) |
| `ctx.request(action, args)` | call another world's action operation by action name or operation id (actions only); returns its envelope; its effects carry that world's id; depth-limited. Example: `ctx.request('ui.openTab', { tab: 'editor' })` |
| `ctx.patterns(worldId)` | `[{ id, kind, priority, examples }]` of a loaded world (read-only) |
| `ctx.lexicon(lexiconId)` | the words of a lexicon, `[]` when unknown |
`ctx.ask` and `ctx.find` already see every loaded world (a world may ask another one); `ctx.state` is only ever the calling world's own state. An `ops.mjs` may also export `initialState()` (seeds `ctx.state` at session start) and `interceptInput(ctx, text)` (spec 06).

Budgets: max recursion depth 8, max 10,000 wires visited per question, 200 ms per operation call in the server (best effort in the browser).

## Rendering
Templates (`templates.sop`) turn envelopes into English:
```
@tpl.arith.count core.template
    for=kids.arith.holding.count
    text="{owner} has {value} {item:plural}."
@tpl.arith.count.missing core.template
    for=kids.arith.holding.count
    status=missing
    text="I don't know how many {item:plural} {owner} has."
@tpl.arith.ack.holding core.template
    for=ack.kids.arith.holding
    text="OK, {owner} has {count} {item:plural}."
```
- `for` is a sought full key, an operation id, `action.<name>`, or `ack.<type>` (acknowledging a statement). `status` defaults to `supported`.
- Placeholders: `{value}`, any `where`/argument/wire key in short form, `{x.name}` drills into a referenced wire, entity references render as their names. Filters: `:plural`, `:singular`, `:cap`, `:a` (a/an), `:list` (comma list with "and"), `:number` (number formatting).
- Fallbacks when no template matches: supported → the value (with unit); missing → `I don't know yet. <ask of the key>`; conflicting → `I have conflicting information: <alternatives>.`; unsupported → `I can't do that yet.`; statement ack → `OK.`
- The renderer never adds facts absent from the envelope (vision §7).
