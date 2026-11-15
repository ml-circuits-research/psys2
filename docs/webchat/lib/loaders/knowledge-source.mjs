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
 * pinned commit in 1 of 4 page loads). `location` may be a list of base URLs that serve the SAME immutable commit (src/knowledge/catalog-pin.mjs `KNOWLEDGE_URLS`:
 * on the page the site's own copy, then raw.githubusercontent.com, then jsDelivr); each is tried REQUIRED_TRIES times on a transient answer (a network error, a timeout, 408, 425, 429, 5xx), REQUIRED_BACKOFF_MS apart
 * (doubling). A 403 is not asked again of the same mirror: the next mirror is asked at once.
 * A DEAD MIRROR (live finding 2026-11-15, second check: jsDelivr answered 403 "Package size exceeded the configured limit of 50 MB" for every shard of a new pin, each shard was
 * tried twice there before the second mirror served it: 36 console errors per page): a mirror that answers 403 with that package-size message, or 403 before it has served
 * anything, or a 404 for index.json / vocab.json before it served anything (no catalog folder there), is dead for the session (this JS context) and is not asked again; every later file goes straight to the next mirror. Until a mirror has answered once, the reads of it
 * wait for its first answer (one probe), so a dead mirror costs one failed request per page, not one per shard. With every mirror dead each is still asked once (a last resort).
 * A 404 from every mirror asked is the file's absence (`null`); a file no mirror could serve is an error (thrown), never an empty answer: the readers count it as unreachable and
 * ask again later (facts.mjs), and the reading of a sentence is the one an absent catalog gives (the network invariant, spec 17 section 6). The mirrors serve one commit, so which
 * mirror answered never changes a text.
 */
export const REQUIRED_TRIES = 2, REQUIRED_BACKOFF_MS = 400;
const TRANSIENT = (status) => status === 408 || status === 425 || status === 429 || status >= 500;
/** The CDN's refusal of a repository past its package size (jsDelivr: "Package size exceeded the configured limit of 50 MB."): the mirror cannot serve this commit at all. */
export const PACKAGE_LIMIT = /package size exceeded|exceeded the configured limit/i;
/** Files every catalog folder publishes: a 404 for one of them from a mirror that has served nothing yet means the folder is not there (the site's own copy of a build made without
 * the pinned checkout): the mirror is dead, like a refusing one. */
export const ROOT_FILES = new Set(['index.json', 'vocab.json']);
const pause = (ms) => new Promise((res) => { const t = setTimeout(res, ms); t?.unref?.(); });
const mirrorHealth = new Map();   // base -> { state: 'unknown' | 'alive' | 'dead', probe: Promise | null, why }
const healthOf = (b) => { let h = mirrorHealth.get(b); if (!h) mirrorHealth.set(b, (h = { state: 'unknown', probe: null, why: null })); return h; };
/** For tests and the host's report: the mirrors' health ({ base: { state, why } }); `resetMirrorHealth` forgets it. */
export const mirrorStates = () => Object.fromEntries([...mirrorHealth].map(([b, h]) => [b, { state: h.state, why: h.why }]));
export const resetMirrorHealth = () => mirrorHealth.clear();

export function createKnowledgeSource(location, { now = () => Date.now(), tries = REQUIRED_TRIES, backoffMs = REQUIRED_BACKOFF_MS, sleep = pause } = {}) {
  const bases = (Array.isArray(location) ? location : [location]).map((l) => String(l).replace(/\/+$/, ''));
  const base = bases[0];
  if (/^https?:\/\//i.test(base)) {
    const get = (k, p) => fetch(k, { signal: globalThis.AbortSignal?.timeout?.(knowledgeTimeoutMs(p)) });
    /** One mirror: { text } | { absent } | { error } (a dead mirror is marked here). */
    const fromMirror = async (b, p, lastResort) => {
      const h = healthOf(b);
      if (h.state === 'unknown' && h.probe) { await h.probe; if (h.state === 'dead' && !lastResort) return { skipped: true }; }
      let release = null;
      if (h.state === 'unknown' && !h.probe) h.probe = new Promise((res) => { release = res; });
      let last = null;
      try {
        for (let i = 0, wait = backoffMs; i < (lastResort ? 1 : tries); i++, wait *= 2) {
          let r = null;
          try { r = await get(`${b}/${p}`, p); } catch (e) { last = e; }
          if (r?.ok) { h.state = 'alive'; return { text: await r.text() }; }
          if (r && r.status === 404 && !lastResort && h.state !== 'alive' && ROOT_FILES.has(p)) { h.state = 'dead'; h.why = `HTTP 404 for ${p}: no catalog there`; return { gone: true }; }   // a site built without its copy
          if (r && r.status === 404) { if (h.state === 'unknown') h.state = 'alive'; return { absent: true }; }   // this mirror answers and does not have it
          if (r) last = new Error(`HTTP ${r.status} for ${p}`);
          if (r?.status === 403) {
            const body = await Promise.resolve(r.text?.()).catch(() => '') ?? '';
            if (PACKAGE_LIMIT.test(body) || h.state !== 'alive') { h.state = 'dead'; h.why = `HTTP 403${PACKAGE_LIMIT.test(body) ? ' (package size limit)' : ' before any file was served'}`; }
            break;   // a refusal is not asked again of the same mirror: the next one is asked at once
          }
          if (r && !TRANSIENT(r.status)) break;
          if (i + 1 < tries) await sleep(wait);
        }
      } finally { if (release) { h.probe = null; release(); } }
      return { error: last };
    };
    /** A required file: the live mirrors in order (a dead one is skipped; with all dead, each is asked once); its text, null (404 from every mirror asked) or a thrown error. */
    const required = async (p) => {
      let asked = 0, absent = 0, last = null;
      for (const lastResort of [false, true]) {
        for (const b of bases) {
          if (lastResort !== (healthOf(b).state === 'dead')) continue;
          const r = await fromMirror(b, p, lastResort);
          if (r.skipped || r.gone) continue;
          asked++;
          if (r.text != null) return r.text;
          if (r.absent) absent++;
          else last = r.error ?? last;
        }
        if (asked) break;   // the last resort only when no live mirror was left to ask
      }
      if (asked && absent === asked) return null;
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
