// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Cache Storage for the knowledge catalog files (spec 17): `createCachedSource({ source, caches })` wraps a `{ text(path) }` source so that a phone does not fetch
 * `vocab.json` and the shards again in every session. Browser-safe (no `node:*`); `caches` is the CacheStorage (a worker has one), without it the source is returned as is.
 *
 *   - The cache is named `psys2-knowledge-<version>`; the version is the `version` field of the catalog's `index.json` (one conditional request per session,
 *     the HTTP cache answers 304). A catalog update gives a new version, therefore a new cache; the old caches are deleted.
 *   - Reads are cache first. The version of the previous session (kept in `psys2-knowledge-meta`) serves the files at once; the check of `index.json` runs in the
 *     background, bounded, and a newer version switches the cache for the reads that follow. With no previous version the first read waits for the check (bounded).
 *   - A file that could not be fetched is never cached; offline, what is cached still answers.
 */
const PREFIX = 'psys2-knowledge-', META = `${PREFIX}meta`, VERSION_KEY = 'https://psys2.invalid/knowledge-version';
const CHECK_MS = 3000;

export function createCachedSource({ source, caches, onCacheEvent = () => {}, checkMs = CHECK_MS, indexPath = 'index.json' }) {
  if (!caches?.open) return source;
  const emit = (e) => { try { onCacheEvent(e); } catch { /* a listener must not break a read */ } };
  let version = null, started = null, checkedIndex = null;
  const pending = new Map();
  function readSource(path) {
    if (!pending.has(path)) {
      const read = Promise.resolve().then(() => source.text(path));
      pending.set(path, read);
      const done = () => pending.delete(path);
      read.then(done, done);
    }
    return pending.get(path);
  }
  const key = (p) => `https://psys2.invalid/knowledge/${p}`;

  const readVersion = async () => { try { const r = await (await caches.open(META)).match(VERSION_KEY); return r ? (await r.text()) || null : null; } catch { return null; } };
  const writeVersion = async (v) => { try { await (await caches.open(META)).put(VERSION_KEY, new Response(v)); } catch { /* not persisted */ } };
  const dropOthers = async (keep) => { try { for (const n of await caches.keys()) if (n.startsWith(PREFIX) && n !== keep && n !== META) await caches.delete(n); } catch { /* ignore */ } };

  /** Asks the catalog for its version (bounded); a new one becomes the cache of the next reads. */
  const check = async () => {
    let v = null;
    try {
      const text = await Promise.race([readSource(indexPath), new Promise((res) => setTimeout(() => res(null), checkMs))]);
      v = text ? String(JSON.parse(text).version ?? '') || null : null;
      if (v) checkedIndex = text;
    } catch { v = null; }
    if (v && v !== version) { const old = version; version = v; await writeVersion(v); await dropOthers(`${PREFIX}${v}`); emit({ type: 'version', version: v, previous: old }); }
  };
  const start = () => started ??= (async () => {
    version = await readVersion();
    const c = check();
    if (!version) await c;   // nothing cached yet to answer from: the first read waits (bounded) for the version
    else c.catch(() => {});
  })();

  return {
    text: async (p) => {
      await start();
      const name = `${PREFIX}${version ?? 'unversioned'}`;
      let cache = null;
      try { cache = await caches.open(name); const hit = await cache.match(key(p)); if (hit) { emit({ type: 'hit', path: p }); return await hit.text(); } } catch { cache = null; }
      // A foreground index read can share the version probe even after its
      // short decision timer expires, or reuse its successfully checked text.
      const txt = p === indexPath && checkedIndex !== null ? checkedIndex : await readSource(p);
      if (txt != null && cache) { try { await cache.put(key(p), new Response(txt)); emit({ type: 'store', path: p, bytes: txt.length }); } catch { /* quota: the next session fetches again */ } }
      return txt;
    },
  };
}
