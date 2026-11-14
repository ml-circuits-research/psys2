# 25. Random as a world (host side of `std.sample`)

Status: host adapter implemented; the generator is **not released** (sopworld 0.56 has no `std.sample`), so the UI wiring and the measurement are blocked. The ask is in `handover/sample/ASK.md`.

## Rule
No hard-coded examples and no local generator. Every dice press, example and action button comes from `std.sample` through `src/dialog/sampler.mjs`.
When the library has no sampler, `createSampler(...).available` is false, all calls return `[]` and the host hides the dice, the example chips and the action buttons rather than falling back to a list.

## Interface (as described by the reviewer; to be confirmed with the library)
`sample(world, { kind: 'command' | 'actions', count, tab, recent: { worlds, acts }, subject, seed, novelty })` returns `[{ text, frame, act, kind, attrs, world }]`.
Each text was rendered by the language world, reads back to the same frame, and passed a dry run that is not refused. Weights: recency (the session's worlds and acts) and novelty.

## Host uses
1. Dice in the input bar: `dice(ctx)` for the open tab's world, or a recently used one.
2. Talk: `examples(ctx, 3..4)` each turn; the welcome examples too.
3. Per-tab action buttons: `actions(ctx)` with `subject` = the selected or most recent thing of the view.
4. Full-screen tabs (Drawing, Diagram, Map, Charts, editor, games): a small dice calling `dice` with `tab` set.
5. To delete when the library lands: `docs/webchat/surprise-pool.json`, `src/dialog/surprise.mjs` (pool build), the welcome examples, the per-tab example lists; the coverage grid uses the sampler.
6. Measurement: 200 dice samples across tabs, judged by state (not by absence of refusal text), target >= 95 % understood and executed; distinct acts/kinds/attributes; no placeholder text; 30 samples attached.

The adapter drops any sample whose text contains placeholders (`<..>`, `{..}`, `$x`, `undefined`).
