/**
 * Where the knowledge catalog files come from (spec 17): a directory of the sop-knowledge-worlds `docs/worlds` tree, or its GitHub Pages base URL.
 * `createKnowledgeSource(location | [mirror locations])` returns `{ text(path) -> Promise<string|null> }` for `createCatalog`. A URL is read with `fetch` (Node 20 and the
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

/**
 * A required file of an http catalog that does not answer is asked again and then asked of the next MIRROR (P4, live finding 2026-11-15: jsDelivr answered 403 for one shard of the
 * pinned commit in 1 of 4 page loads). `location` may be a list of base URLs that serve the SAME immutable commit (src/knowledge/catalog-pin.mjs `KNOWLEDGE_URLS`: jsDelivr, then
 * raw.githubusercontent.com); each is tried REQUIRED_TRIES times on a transient answer (a network error, a timeout, 403, 408, 425, 429, 5xx), REQUIRED_BACKOFF_MS apart (doubling).
 * A 404 from every mirror is the file's absence (`null`); a file no mirror could serve is an error (thrown), never an empty answer: the readers count it as unreachable and ask
 * again later (facts.mjs), and the reading of a sentence is the one an absent catalog gives (the network invariant, spec 17 section 6). The mirrors serve one commit, so which
 * mirror answered never changes a text.
 */
export const REQUIRED_TRIES = 2, REQUIRED_BACKOFF_MS = 400;
const TRANSIENT = (status) => status === 403 || status === 408 || status === 425 || status === 429 || status >= 500;
const pause = (ms) => new Promise((res) => { const t = setTimeout(res, ms); t?.unref?.(); });

export function createKnowledgeSource(location, { now = () => Date.now(), tries = REQUIRED_TRIES, backoffMs = REQUIRED_BACKOFF_MS, sleep = pause } = {}) {
  const bases = (Array.isArray(location) ? location : [location]).map((l) => String(l).replace(/\/+$/, ''));
  const base = bases[0];
  if (/^https?:\/\//i.test(base)) {
    const get = (k, p) => fetch(k, { signal: globalThis.AbortSignal?.timeout?.(knowledgeTimeoutMs(p)) });
    /** A required file: every mirror, a few tries each; its text, null (404 from every mirror) or a thrown error (no mirror served it). */
    const required = async (p) => {
      let absent = 0, last = null;
      for (const b of bases) {
        for (let i = 0, wait = backoffMs; i < tries; i++, wait *= 2) {
          let r = null;
          try { r = await get(`${b}/${p}`, p); } catch (e) { last = e; }
          if (r?.ok) return r.text();
          if (r && r.status === 404) { absent++; break; }   // this mirror does not have it: the next one is asked
          if (r) last = new Error(`HTTP ${r.status} for ${p}`);
          if (r && !TRANSIENT(r.status)) break;
          if (i + 1 < tries) await sleep(wait);
        }
      }
      if (absent === bases.length) return null;
      throw last ?? new Error(`no catalog mirror served ${p}`);
    };
    return { mirrors: bases, text: async (p) => {
      if (!OPTIONAL_PATHS.has(p)) return required(p);
      const k = `${base}/${p}`;
      const m = optionalMisses.get(k);
      if (m && now() < m.until) return null;
      const miss = (until, wait) => { optionalMisses.set(k, { until, wait }); return null; };
      const backoff = () => { const wait = Math.min(OPTIONAL_BACKOFF_MAX_MS, (m?.wait ?? OPTIONAL_BACKOFF_MS / 2) * 2); return miss(now() + wait, wait); };
      let r;
      try { r = await get(k, p); } catch { return backoff(); }
      if (r.ok) { optionalMisses.delete(k); return r.text(); }
      return r.status === 404 ? miss(Infinity, 0) : backoff();
    } };
  }
  return {
    text: async (p) => {
      const { readFile } = await import('node:fs/promises');
      try { return await readFile(`${base}/${p}`, 'utf8'); } catch { return null; }
    },
  };
}
