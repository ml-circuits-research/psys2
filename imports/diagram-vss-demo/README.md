# diagram-vss-demo import: the Diagram world (staging)

Everything reusable from diagram-vss-demo, brought here to become our world `diagram.sketch` and the Diagram tab. Provenance and
licence: `PROVENANCE.md`. This folder is **not loaded** by the engine: `worlds/` would load a half-made world and break the tests. The
worker moves the finished world to `worlds/diagram.sketch/` (task DIAG in `worker-tasks.md`).

## What is here

- `engine/`: the source engine, unchanged.
  - Works in Node: `const K = require('./engine/logic.js'); const sys = K.createSystem();`
  - `sys.formalize(text, ctx)` is their rules reader. `sys.engine` executes SOP nodes `{ id, type: 'command'|'question'|'fact'|'rule', args }`. `sys.world.state` is the diagram.
  - `ui.js` holds the SVG renderer.
- `data/train/` (49,746 messages, 76,637 wires) and `data/test/` (4,374 messages, 17,565 wires): realistic messages written by LLMs and label-checked. Messages can be long (1–20 sentences, with typos, self-corrections and text that is not a request). Each message has `id`, `domain`, `names` (the shapes already on the canvas), `text`, and `wires`.
  - Each wire has: `span` (the exact substring), `trigger` (the cue word), `type` (`command` / `question` / `fact` / `rule`), and `args` (legend keys: `action` or `ask`, `target`, `from`, `to`, `shape`, `color`, `position`, `anchor`, …).
  - Special values: `$new` refers to the shape created earlier in the same message. Lists are comma-separated names (`"Plate,$new,Reader"`). `mention(...)` refers to a shape by its description.
  - Conventions: `specs/LABEL_CONVENTIONS.md`, `specs/TRAIN_MSG_SPEC.md`, `specs/TEST_MSG_SPEC.md`.
- `data/bench/`: single sentences with gold args (`text`, `names`, `type`, `gold`, `template`).
- `data/examples/`: example sessions.
- `world-draft/`: `world.sop`, `legend.sop`, and the generated `lexicon.sop` and `operations.sop` in our format.
  - `lexicon.sop`: 27 lexicons and 1,554 words, from the 46 legend questions.
  - `operations.sop`: 32 actions and 18 question kinds.
  - `legend.json`: the full source legend with values and cue words.
- `reference/`: their template generator, converters and scorers (`bench-canon.js` compares a reading with gold args).

## Differences to bridge

| topic | diagram-vss-demo | here |
| --- | --- | --- |
| request wire | `{type: 'command', args: {action: 'connect', from, to, style, arrow}}` | `@{_} core.request action=diagram.connect arg.from=… arg.to=…` emitted by `patterns.sop` / `core.shape` |
| question | `type: 'question', args: {ask: 'neighbors', target}` | `action=diagram.ask.neighbors`, a query operation that answers |
| facts / rules | `type: 'fact'` / `'rule'` wires (e.g. "routers are blue") | operations `diagram.fact` / `diagram.rule` wrapping the engine's facts and rules plugins |
| values | canonical legend values; synonyms through `legend.lexicon(key)` | lexicon words; canonicalise in `ops.mjs` with the engine's legend |
| names | free proper names of shapes (`Router`, `Ap2`), `$new`, `mention(...)` | `{x:rest}` / name slots resolved against `state.shapes`; `$new` maps to our discourse referents |
| segmentation | the `span` of each wire | our dispatcher's segments (the spans give exact cut points for training) |
| execution | `engine.execute(node)`, transactional, with `Clarify` errors | `ops.mjs` calls the engine; `Clarify` and `SOPError` become our clarification and refusal replies |
| undo | the engine's history plugin | keep the engine's; later ASTRA A6 can take over |

## Conversion of the data (for the worker)

- **One message → one dispatcher example.** Its segments are the wire spans in text order, and each segment's world is `diagram.sketch`. Text outside the spans is a "no request" filler. Map each wire to our canonical request: `action` → `diagram.<action>`, `ask` → `diagram.ask.<ask>`, `fact` / `rule` → `diagram.fact` / `diagram.rule`, `args` → `arg.*`.
- **The bench sets become `tests.sop` cases and an operational-set slice.** Use a canonical sentence per action and per ask: the most frequent short `span` per act in `data/train`.
- **Measure our reading against the gold args** with `reference/bench-canon.js` scoring: the right act, the right args, extras.
