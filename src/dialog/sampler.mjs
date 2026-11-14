// SPDX-License-Identifier: AGPL-3.0-only
// SAMPLER adapter (specs/25-random-as-a-world.md): the host side of `std.sample` of sopworld (random frames constrained by schemas, state and
// knowledge, rendered by the language world, kept only if they read back to the same frame and a dry run is not refused). Until the library
// releases it, `available` is false and every call returns []: there is NO local generator here (the caller shows no dice / no examples).
// Browser-safe: no `node:*` imports; the library module is passed in.

/** The context the host gives the sampler: what the person did, so the samples are about it. */
export function samplerContext({ tab = null, recentWorlds = [], recentActs = [], selected = null } = {}) {
  return { tab, recent: { worlds: [...recentWorlds], acts: [...recentActs] }, subject: selected };
}

/**
 * @param lib   the sopworld module namespace (or anything with `sample` / `std.sample`)
 * @param world the World instance the samples are drawn from (the open tab's world or a composite)
 */
export function createSampler(lib, world) {
  const fn = typeof lib?.sample === 'function' ? lib.sample : typeof lib?.std?.sample === 'function' ? lib.std.sample : null;
  const clean = (r) => (Array.isArray(r) ? r : []).filter((x) => x && typeof x.text === 'string' && x.text.trim() && !/[<{}[\]]|\$\w|\bTODO\b|\bundefined\b/.test(x.text))
    .map((x) => ({ text: x.text.trim(), frame: x.frame ?? null, act: x.act ?? null, kind: x.kind ?? null, attrs: x.attrs ?? null, world: x.world ?? null }));
  const run = (kind, count, ctx, extra) => (fn ? clean(fn(world, { kind, count, ...ctx, ...extra })) : []);
  return {
    available: Boolean(fn),
    /** One random command for the tab in the context (the dice). Returns { text, ... } or null. */
    dice(ctx = samplerContext(), seed) { return run('command', 1, ctx, { seed })[0] ?? null; },
    /** 3-4 example commands drawn from the session (Talk and the welcome message): less usual things first. */
    examples(ctx = samplerContext(), count = 4, seed) { return run('command', Math.min(Math.max(count, 3), 4), ctx, { seed, novelty: true }); },
    /** The acts relevant to the selected (or most recent) thing of the view: the action buttons. */
    actions(ctx = samplerContext(), count = 6) { return run('actions', count, ctx, {}); },
  };
}
