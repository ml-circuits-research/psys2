/**
 * Where the knowledge catalog files come from (spec 17): a directory of the sop-knowledge-worlds `docs/worlds` tree, or its GitHub Pages base URL.
 * `createKnowledgeSource(location)` returns `{ text(path) -> Promise<string|null> }` for `createCatalog`. A URL is read with `fetch` (Node 20 and the
 * browser); a directory with `node:fs/promises`, imported on demand so this file can be bundled for the browser.
 * `knowledgeLocation()` is the host's setting: the `PSYS2_KNOWLEDGE` environment variable (a directory or a URL); unset means no catalog.
 */
export const knowledgeLocation = () => globalThis.process?.env?.PSYS2_KNOWLEDGE || null;

/**
 * How long one read may take: a shard is small, `index.json` and `vocab.json` are each about 200 kB compressed (1 MB and more unpacked), which a slow mobile
 * connection (about 50 kB/s) needs several seconds for; a bound that is too short makes the catalog unreachable for good on exactly those phones.
 */
export const knowledgeTimeoutMs = (path) => (/^(index|vocab)\.json$/.test(path) ? 25000 : 8000);

/**
 * Files a catalog may or may not publish (the lazy-loading index of the vocabulary buckets): a miss is remembered so the console is not flooded with the same 404.
 * A 404 holds for the whole session (this JS context); a 5xx or a network error is a temporary miss with a doubling backoff (OPTIONAL_BACKOFF_MS .. OPTIONAL_BACKOFF_MAX_MS).
 * The remembered miss answers `null`, exactly what the failed request would have answered: the network never changes a reading, it only stops being asked.
 */
export const OPTIONAL_PATHS = new Set(['vocab/index.json']);
export const OPTIONAL_BACKOFF_MS = 60000, OPTIONAL_BACKOFF_MAX_MS = 900000;
const optionalMisses = new Map();   // `${base}/${path}` -> { until, wait } (until: Infinity for a 404)
/** For tests: forget the remembered misses. */
export const resetOptionalMisses = () => optionalMisses.clear();

export function createKnowledgeSource(location, { now = () => Date.now() } = {}) {
  const base = String(location).replace(/\/+$/, '');
  if (/^https?:\/\//i.test(base)) {
    return { text: async (p) => {
      const optional = OPTIONAL_PATHS.has(p), k = `${base}/${p}`;
      const m = optional ? optionalMisses.get(k) : null;
      if (m && now() < m.until) return null;
      const miss = (until, wait) => { optionalMisses.set(k, { until, wait }); return null; };
      const backoff = () => { const wait = Math.min(OPTIONAL_BACKOFF_MAX_MS, (m?.wait ?? OPTIONAL_BACKOFF_MS / 2) * 2); return miss(now() + wait, wait); };
      let r;
      try { r = await fetch(k, { signal: globalThis.AbortSignal?.timeout?.(knowledgeTimeoutMs(p)) }); } catch (e) { if (optional) return backoff(); throw e; }
      if (r.ok) { if (optional) optionalMisses.delete(k); return r.text(); }
      if (optional) return r.status === 404 ? miss(Infinity, 0) : backoff();
      return null;
    } };
  }
  return {
    text: async (p) => {
      const { readFile } = await import('node:fs/promises');
      try { return await readFile(`${base}/${p}`, 'utf8'); } catch { return null; }
    },
  };
}
