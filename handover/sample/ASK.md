# Ask to sopworld: `std.sample`

Random frames for the host's dice, example chips and action buttons.

`sample(world, { kind: 'command' | 'actions', count, tab, recent: { worlds, acts }, subject, seed, novelty })` -> `[{ text, frame, act, kind, attrs, world }]`

- Frames are drawn under the schemas, the world's state and its knowledge (things that exist, values in range), weighted by recency and novelty.
- Rendered by the language world; kept only if the text reads back to the same frame and a dry run on a copy of the state is not refused.
- `kind: 'actions'` with `subject`: the acts applicable to that thing (house: colour, move, take apart, add a door).
- Seedable (deterministic with a seed). Exposed as `sample` on the module (or `std.sample`).
- Needed for: dice, Talk examples, tab buttons, the coverage grid; replaces `docs/webchat/surprise-pool.json`. Spec: `specs/25-random-as-a-world.md`.
