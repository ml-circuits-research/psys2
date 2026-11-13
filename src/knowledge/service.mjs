// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The knowledge service of a host (spec 07 section 7): lazy, cached access to the catalog of sop-knowledge-worlds for the worlds' `prepare()` pre-steps (the board's
 * operations are synchronous, so a world loads what a turn needs *before* its operation runs). Browser-safe: no `node:*`; the host says how to read.
 *
 *   installKnowledge({ base })                      // browser: fetch `<base>/vocab.json` once, shards `<base>/<path>.sop` on demand (DEFAULT_BASE = the GitHub Pages copy)
 *   installKnowledge({ readShard, readVocab })      // tests / Node: any async readers
 *   const k = globalThis[KNOWLEDGE];                // what a world's prepare() reads; undefined when the host installed nothing (then only the vendored objects exist)
 *   const cat = await k.resolve('banana');          // loads, one by one, the k.objects shards that hold the word until an object of that name is known (at most `maxShards`)
 *
 * Cached for the life of the page/worker (one session): the vocabulary is fetched once (a failure is retried after `retryMs`, never in a loop), a shard once. Nothing here
 * throws to the caller of a turn: `resolve` rejects with the read error and the world answers that the picture could not be fetched.
 */
import { createCatalog, createFetchLoader } from './catalog.mjs';

export const KNOWLEDGE = Symbol.for('psys2.knowledge');
export const DEFAULT_BASE = 'https://ml-circuits-research.github.io/sop-knowledge-worlds/worlds';

export function createKnowledge({ base = DEFAULT_BASE, readShard = createFetchLoader(base), readVocab = null, retryMs = 30000 } = {}) {
  const vocabOf = readVocab ?? (async () => { const r = await fetch(`${String(base).replace(/\/$/, '')}/vocab.json`); if (!r.ok) throw new Error(`catalog vocabulary: HTTP ${r.status}`); return r.json(); });
  let catalog = null, pending = null, failedAt = -Infinity;
  const ready = () => {
    if (catalog) return Promise.resolve(catalog);
    if (Date.now() - failedAt < retryMs) return Promise.reject(new Error('the catalog is not reachable (retrying later)'));
    pending ??= Promise.resolve(vocabOf()).then((vocab) => (catalog = createCatalog({ vocab, readShard })), (e) => { failedAt = Date.now(); throw e; }).finally(() => { pending = null; });
    return pending;
  };
  const objectShards = (cat, word) => {
    const w = String(word).toLowerCase(), forms = [w, w.endsWith('ies') ? `${w.slice(0, -3)}y` : null, w.endsWith('es') ? w.slice(0, -2) : null, w.endsWith('s') ? w.slice(0, -1) : null].filter(Boolean);
    const all = [...new Set(forms.flatMap((f) => cat.shardsOf(f)))].filter((p) => p.startsWith('k.objects/'));
    return [...all.filter((p) => !/\/noto-/.test(p)), ...all.filter((p) => /\/noto-/.test(p))];   // the hand-written shards first
  };
  return {
    ready,
    /** The catalog once its vocabulary is read (rejects when it cannot be). */
    async catalog() { return ready(); },
    /** The k.objects shards that hold a word (hand-written first), loaded or not. */
    async shardsFor(word) { return objectShards(await ready(), word); },
    /** Loads, one at a time, the shards of the word until an object named like it is known; at most `maxShards` shards. Returns { cat, loaded: <shards read now> }. */
    async resolve(word, { maxShards = 4, budget = null } = {}) {
      const cat = await ready(), loaded = [];
      if (cat.hasName(word)) return { cat, loaded };
      for (const p of objectShards(cat, word).slice(0, maxShards)) {
        if (cat.hasName(word) || (budget && budget.left <= 0)) break;
        const fresh = !cat.loadedShards().includes(p);
        await cat.loadShardPath(p);
        if (fresh) { loaded.push(p); if (budget) budget.left -= 1; }
      }
      return { cat, loaded };
    },
  };
}

/** Installs the host's knowledge service (the handle worlds read); returns it. */
export function installKnowledge(opts = {}) {
  return (globalThis[KNOWLEDGE] = createKnowledge(opts));
}
