// SPDX-License-Identifier: AGPL-3.0-only
// The library side of the acts executor (specs/21 section 10): the acts of a world whose state is the HOST's (the drawing board, the diagram engine, the face, the charts, the
// seating plan ...) run through sopworld `std.schema.effect` (0.28.0). One World per executor, built once, holds only the declaration "every act of this world is the host's":
//   std.schema.effect of=host act=<act> action=host_effect      for make, remove, change, place, connect, group, copy, send
// A step (one act, or one clause of a sentence) is given to the library as a request whose effect calls the host's own function with the session's context. What the library does:
//   - ALL OR NOTHING: a sentence of several steps ("draw a sun, a cloud and a man", "put on a hat and make it red") is one `act([...])`; the first step that is not done undoes the
//     earlier ones (their `undo`), so a refused sentence leaves the state as it was. The undo is ONE snapshot of the session's state for the whole sentence (taken only when it has
//     more than one step), restored in place.
//   - DIFFERENCE: the effect returns what changed (added / removed / changed things, from the world's `referents` signatures) as `diff.effects` of the act.
// Nothing else is the library's here: the words of the replies, the referents and the state stay the host's (specs/21 section 10 lists what is still bridge).
import { World } from '../../lib/vendor/sopworld/sopworld.mjs?v=73565c063f';

export const EFFECT_ACTS = ['make', 'remove', 'change', 'place', 'connect', 'group', 'copy', 'send'];
const KIND = 'host';
// The library checks the arguments each act needs before it reaches an effect; the host's request is not made of them (it is the sentence's words), so they are filled with a placeholder.
const PLACEHOLDERS = { thing: KIND, attr: '-', value: '-', x: 0, rel: 'at', ref: KIND, a: KIND, b: KIND, things: KIND, to: '-' };

/** The signatures of the things of a world, id -> signature, from its `referents` hook (empty when it has none or it fails: a reading never breaks an act). */
function sigs(hooks, ctx) {
  try {
    const m = new Map();
    for (const r of hooks.referents?.(ctx) ?? []) m.set(String(r.id), String(r.sig ?? ''));
    return m;
  } catch { return null; }
}
const diffOf = (a, b) => {
  if (!a || !b) return {};
  const added = [], removed = [], changed = [];
  for (const [id, s] of b) { if (!a.has(id)) added.push(id); else if (a.get(id) !== s) changed.push({ id }); }
  for (const id of a.keys()) if (!b.has(id)) removed.push(id);
  return { added, removed, changed };
};
const snapshotOf = (state) => { try { return structuredClone(state); } catch { return null; } };
const restore = (state, snap) => { for (const k of Object.keys(state)) delete state[k]; Object.assign(state, snap); };

/** The effects of one executor. `hooks.referents(ctx)` (optional) gives the things for the difference. */
export function createEffects(worldId, hooks = {}) {
  let cur = null;   // the sentence in progress: { ctx, steps, outs, accept, before, snap }; the library is synchronous, so one at a time
  const world = new World({
    actions: {
      host_effect: (c, args) => {
        const i = Number(args.step), step = cur.steps[i];
        let out;
        try { out = step(); } catch (e) { cur.error ??= e; throw e; }   // the library reports a throw as a refusal; the host's errors (budget, bugs) are rethrown by `sentence`
        cur.outs[i] = out;
        if (cur.accept && !cur.accept(out, i)) return { ok: false, why: String(out?.note ?? out?.value ?? 'not done'), status: out?.status };
        const undo = i === 0 && cur.snap ? () => restore(cur.ctx.state, cur.snap) : undefined;
        return { diff: i === cur.steps.length - 1 ? diffOf(cur.before, sigs(hooks, cur.ctx)) : {}, ...(undo ? { undo } : {}) };   // the sentence's difference rides on its last step
      },
    },
  });
  world.load([
    '@acts core.use world=std.acts',
    `@w std.schema.world name=${worldId}`,
    `@t core.type of=${KIND} extends=std.schema.thing`,
    `@k std.schema.kind of=${KIND} world=${worldId} ${EFFECT_ACTS.map((a) => `acts=${a}`).join(' ')}`,
    ...EFFECT_ACTS.map((a) => `@e.${a} std.schema.effect of=${KIND} act=${a} action=host_effect`),
  ].join('\n'));

  /**
   * One sentence: `steps` are functions `() => hostResult` for the acts `acts[i]`; `accept(result, i)` says whether a step is done. All or nothing. Returns
   * { ok, results (the host's result of each step run), failed (index or -1), diff (the effects' difference) }.
   * Called inside another sentence (a group whose step has parts), the steps run in order without a library sentence of their own: the outer one undoes them.
   */
  function sentence(ctx, acts, steps, accept) {
    if (cur) {   // nested: the outer sentence's snapshot covers these steps
      const outs = [];
      for (let i = 0; i < steps.length; i++) { outs.push(steps[i]()); if (accept && !accept(outs[i], i)) return { ok: false, results: outs, failed: i }; }
      return { ok: true, results: outs, failed: -1 };
    }
    cur = { ctx, steps, outs: [], accept, before: sigs(hooks, ctx), snap: steps.length > 1 ? snapshotOf(ctx.state) : null };
    try {
      const requests = steps.map((_, i) => ({ action: EFFECT_ACTS.includes(acts[i]) ? acts[i] : 'make', args: { ...PLACEHOLDERS, kind: KIND, step: i } }));
      const r = world.act(requests.length === 1 ? requests[0] : requests);
      if (cur.error) throw cur.error;
      const results = requests.length === 1 ? [r] : r.results;
      const failed = r.ok ? -1 : (requests.length === 1 ? 0 : r.failed);
      const diff = requests.length === 1 ? r.diff?.effects?.[0] : results.at(-1)?.diff?.effects?.[0];
      return { ok: !!r.ok, results: cur.outs.slice(), failed, diff: diff ?? {} };
    } finally { cur = null; }
  }
  return { sentence, world };
}
