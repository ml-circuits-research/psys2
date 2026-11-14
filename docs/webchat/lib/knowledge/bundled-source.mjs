// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The bundled subset of the catalog as a knowledge source, and the layering of a source over it (KNOWLEDGE-OUT step 3). Browser-safe: no `node:*`.
 *
 *   bundledSource()                    { text(path) } serving index.json, vocab.json and the shards of `bundled-values.mjs` and `bundled-objects.mjs` in the catalog's own format
 *   createLayeredSource(primary, back) { text(path), fellBack(path) }: a file the primary source has is read from it; a file it does not have (unreachable catalog, first
 *                                        visit, offline) is read from `back`. Because the answer for `index.json` and `vocab.json` is the primary's whole file when it is
 *                                        reachable, the bundled subset is only ever what the catalog replaces: nothing of it survives once the catalog answers.
 *
 * `fellBack(path)` says the last read of that path was served by `back`: `facts.mjs` then keeps `unreachable()` true (a miss is "I cannot reach it", not "it does not exist")
 * and asks the primary again after a backoff. Generated data: `scripts/build-bundled-subset.mjs`.
 */
import { BUNDLED_VALUES, BUNDLED_VALUES_INDEX } from './bundled-values.mjs?v=d9555c35e1';
import { BUNDLED_OBJECTS, BUNDLED_OBJECTS_INDEX } from './bundled-objects.mjs?v=eb18c3d258';
import { BUNDLED_TIME, BUNDLED_TIME_INDEX } from './bundled-time.mjs?v=360dd7db92';
const BUNDLED_SHARDS = { ...BUNDLED_VALUES, ...BUNDLED_OBJECTS, ...BUNDLED_TIME }, BUNDLED_INDEX = [...BUNDLED_VALUES_INDEX, ...BUNDLED_OBJECTS_INDEX, ...BUNDLED_TIME_INDEX];

/** index.json and vocab.json of the bundled subset (same format as the catalog's). */
function bundledFiles() {
  const worlds = new Map(), vocab = {};
  for (const e of BUNDLED_INDEX) {
    if (!worlds.has(e.world)) worlds.set(e.world, { id: e.world, version: 'bundled', exports: [], shards: [] });
    const w = worlds.get(e.world);
    w.shards.push({ id: e.id, path: e.path, keys: e.keys, sources: e.sources });
    for (const k of e.keys) (vocab[k] ??= []).push(e.id);
  }
  const typesOf = (text) => [...new Set([...text.matchAll(/^@\S+\s+(\S+)/gm)].map((m) => m[1]))];
  for (const w of worlds.values()) w.exports = [...new Set(w.shards.flatMap((s) => typesOf(BUNDLED_SHARDS[s.path])))];
  return { 'index.json': JSON.stringify({ version: 'bundled', worlds: [...worlds.values()] }), 'vocab.json': JSON.stringify(vocab), ...BUNDLED_SHARDS };
}

export function bundledSource() {
  let files = null;
  return { text: async (p) => (files ??= bundledFiles())[p] ?? null };
}

export function createLayeredSource(primary, back = bundledSource()) {
  const fell = new Set();
  return {
    async text(p) {
      let t = null;
      try { t = await primary.text(p); } catch { t = null; }
      if (t) { fell.delete(p); return t; }
      const b = await back.text(p);
      if (b) fell.add(p);
      return b;
    },
    fellBack: (p) => fell.has(p),
  };
}
