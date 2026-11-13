// SPDX-License-Identifier: AGPL-3.0-only
/**
 * What the knowledge worlds say about ARRANGEMENT, for the space module (KNOWLEDGE-OUT step 4): which things rest on or attach to which (`supports`), and the order and the mirrored
 * places of the parts of a face (`face`). No world keeps this table: it is derived from the wires of the catalog by one reading,
 *   supports  [thing, base]  from k.scenes.thing (`on=` what it usually rests on; `place=ground` gives [thing, "ground"]) and k.layouts.joins (a sits_on / attaches_to / part_of b),
 *   face      [part, rank, mirror]  from the slots of the k.layouts layout `face`: a part is a slot of one thing that is not optional; its rank is its order from the top, its mirror (a pair) is
 *             the distance of the middle of its box from the middle line, as a share of the width.
 * Browser-safe: no `node:*`; synchronous reads (the space module must not wait), seeded from the bundled subset (bundled-arrangement.mjs, GENERATED from the catalog by
 * scripts/build-bundled-subset.mjs) and replaced by the catalog's own wires when `loadArrangement(facts)` finds them (the host calls it through `engine.setKnowledge`).
 */
import { BUNDLED_ARRANGEMENT } from './bundled-arrangement.mjs';
import { deriveArrangement, withFaceAliases } from './arrangement-derive.mjs';

const state = { supports: [], around: [], face: [], from: 'none', loading: null };

/** Seeds the table from the bundled subset (idempotent). */
export function seedArrangement() {
  if (state.from !== 'none') return;
  const b = BUNDLED_ARRANGEMENT;
  const supports = [...b.on, ...b.ground.map((n) => [n, 'ground'])];
  Object.assign(state, { supports, around: [], face: b.face, from: 'bundled' });
}
seedArrangement();

let attached = null;
/** The host attaches the knowledge of the session; the catalog's wires are fetched on the first read that needs them (nothing is requested at start-up). */
export function attachArrangement(facts) { attached = facts ?? null; state.loading = null; }
/** The table now: `{ supports, around, face }` (the shape the space module's `KNOWLEDGE` always had). The first read after `attachArrangement` starts the catalog's load; this read still answers from the seed. */
export function arrangement() { if (attached && !state.loading) loadArrangement(attached); return state; }

/** Replaces the seed with the table read from the catalog when it has the worlds; keeps the seed otherwise. Never throws; settled once per `facts`. */
export function loadArrangement(facts) {
  if (!facts?.wires) return Promise.resolve(state.from);
  if (state.loading?.facts === facts) return state.loading.promise;
  const promise = (async () => {
    try {
      const wires = [...await facts.wires('k.scenes.thing'), ...await facts.wires('k.layouts.joins'), ...await facts.wires('k.layouts.slot')];
      if (wires.length) { const got = deriveArrangement(wires); got.face = await withFaceAliases(facts, got.face); if (got.supports.length) { Object.assign(state, got, { from: 'catalog' }); } }
    } catch { /* the seed stays */ }
    return state.from;
  })();
  state.loading = { facts, promise };
  return promise;
}
export const arrangementFrom = () => state.from;
