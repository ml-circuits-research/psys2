// SPDX-License-Identifier: AGPL-3.0-only
// PSys2 service worker: the asset cache (spec 06 "Assets, caches and versions"). Classic worker, no imports.
//
// Policy
//   - The build manifest (build-info.json: { version, assets: { path: hash } }) is read by the PAGE, once per start, with no cache, and posted here ({ type: 'manifest' }).
//     This worker never fetches it itself (one fetch per file per start); it keeps the last one in Cache Storage for the next start.
//   - An asset is cached forever under `<path>?v=<hash>` and never revalidated: a request is answered from the cache when the key is there. A request that carries `?v=`
//     is keyed by that exact URL (it names its own content); a request without it (a dynamic import, a worker, a wasm file) is keyed by the manifest's hash of its path.
//   - A miss is fetched ONCE (concurrent requests of the page and the engine worker share the one fetch), stored, and served.
//   - On every new manifest everything in the cache that is not in it is deleted: no two versions of one asset, nothing orphaned.
//   - index.html is revalidated on every navigation (a 304 costs nothing) so that a deploy reaches the next start; build-info.json is never cached by the browser.
//   - Not managed here: the model files (models/**: kept by their own sha256-keyed caches), other origins, range requests, anything not in the manifest (passed through and logged).
// GENERATION: bump it in the same commit as a release that must start every browser from clean caches; ui/assets.mjs (CACHE_GENERATION) clears the rest once.
const GENERATION = 1;
const ASSETS = `psys2-assets-g${GENERATION}`, META = `psys2-manifest-g${GENERATION}`;
const MANIFEST_KEY = '/__psys2/manifest', INDEX_KEY = '/__psys2/index';
const SELF_MANAGED = /^models(-mt)?\//;

let manifest = null;           // { version, assets }; null until the page posted one (or the stored one was read)
let stale = false;             // a navigation showed a build newer than the stored manifest: unhashed requests go to the network until the page posts the new one
const inflight = new Map();    // cache key -> Promise<Response> of the one fetch in progress
const log = [];                // what this worker did, newest last (tests and the debug panel read it with { type: 'log' })
const note = (kind, path, extra = {}) => { log.push({ kind, path, t: Date.now(), ...extra }); if (log.length > 4000) log.shift(); };
const scopePath = (url) => { const base = new URL(self.registration.scope); return url.origin === base.origin && url.pathname.startsWith(base.pathname) ? decodeURIComponent(url.pathname.slice(base.pathname.length)) : null; };
const keyOf = (path, hash) => new URL(`${path.split('/').map(encodeURIComponent).join('/')}?v=${hash}`, self.registration.scope).href;

async function readStored() {
  try { const r = await (await caches.open(META)).match(MANIFEST_KEY); return r ? await r.json() : null; } catch { return null; }
}
async function ensureManifest() { if (!manifest) manifest = await readStored(); return manifest; }

/** Deletes every cache entry that is not in `m`, and every cache of another generation. Returns what was removed. */
async function prune(m) {
  const removed = [];
  try {
    for (const name of await caches.keys()) if (/^psys2-(assets|manifest)-g\d+$/.test(name) && name !== ASSETS && name !== META) { await caches.delete(name); removed.push(name); }
    const cache = await caches.open(ASSETS);
    const keep = new Set(Object.entries(m.assets ?? {}).map(([p, h]) => keyOf(p, h)));
    for (const req of await cache.keys()) if (!keep.has(req.url)) { await cache.delete(req); removed.push(req.url); }
  } catch { /* best effort */ }
  return removed;
}

async function setManifest(m) {
  if (!m || typeof m !== 'object' || !m.assets) return { ok: false };
  manifest = m; stale = false;
  try { await (await caches.open(META)).put(MANIFEST_KEY, new Response(JSON.stringify({ version: m.version, assets: m.assets }), { headers: { 'content-type': 'application/json' } })); } catch { /* not persisted */ }
  const removed = await prune(m);
  note('manifest', m.version, { removed: removed.length });
  return { ok: true, removed: removed.length };
}

async function fromNetworkAndStore(request, path, key, hashed) {
  // A request with `?v=` is its own versioned URL: fetched as it came (the HTTP cache and a modulepreload of the same URL answer it). One without is fetched under the
  // hashed URL (`?v=` is ignored by a static server): an older copy of the bare URL in the HTTP cache can never be stored under the new hash.
  const res = await fetch(hashed ? request : new Request(key, { credentials: 'same-origin' }));
  note('network', path, { status: res.status, key });
  if (res.ok && res.status === 200 && res.type === 'basic') { try { await (await caches.open(ASSETS)).put(key, res.clone()); } catch { /* quota: fetched again next start */ } }
  return res;
}

async function assetResponse(request, path, url) {
  const m = await ensureManifest();
  const want = url.searchParams.get('v');
  const hash = want ?? (m && !stale ? m.assets?.[path] : null);
  if (!hash || (m && m.assets && !(path in m.assets))) { note('passthrough', path, { why: !m ? 'no manifest' : !(path in (m.assets ?? {})) ? 'not in the manifest' : 'stale manifest' }); return fetch(request); }
  const key = keyOf(path, hash);
  try { const hit = await (await caches.open(ASSETS)).match(key); if (hit) { note('hit', path, { key }); return hit; } } catch { /* unreadable cache: fetch */ }
  let p = inflight.get(key);
  if (!p) { p = fromNetworkAndStore(request, path, key, want != null).finally(() => inflight.delete(key)); inflight.set(key, p); } else note('shared', path, { key });
  return (await p).clone();
}

async function navigation(request) {
  try {
    const res = await fetch(request, { cache: 'no-cache' });
    // the page names its build: a manifest older than the page is not trusted for unhashed requests until the page posts the new one
    try { const txt = await res.clone().text(); const v = /"version":"([0-9a-f]+)"/.exec(txt.slice(0, 20000))?.[1]; const m = await ensureManifest(); if (v && m && m.version !== v) stale = true; } catch { /* not html */ }
    if (res.ok) { try { await (await caches.open(META)).put(INDEX_KEY, res.clone()); } catch { /* not kept for offline */ } }   // the last page, for an offline start
    return res;
  } catch {
    const hit = await (await caches.open(META)).match(INDEX_KEY);
    if (hit) return hit;
    throw new Error('offline and not cached');
  }
}

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil((async () => { await self.clients.claim(); const m = await ensureManifest(); if (m) await prune(m); else for (const n of await caches.keys()) if (/^psys2-(assets|manifest)-g\d+$/.test(n) && n !== ASSETS && n !== META) await caches.delete(n); })()); });

self.addEventListener('message', (e) => {
  const d = e.data ?? {};
  const reply = (v) => { try { (e.ports?.[0] ?? e.source)?.postMessage({ reqId: d.reqId, ...v }); } catch { /* the page is gone */ } };
  if (d.type === 'manifest') e.waitUntil(setManifest(d.manifest).then((r) => reply({ type: 'manifest-ack', ...r })));
  else if (d.type === 'log') reply({ type: 'log', log: log.slice(), version: manifest?.version ?? null, stale });
  else if (d.type === 'keys') e.waitUntil((async () => { const c = await caches.open(ASSETS); reply({ type: 'keys', keys: (await c.keys()).map((r) => r.url) }); })());
  else if (d.type === 'clear-log') { log.length = 0; reply({ type: 'cleared' }); }
});

self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET' || r.headers.has('range')) return;
  const url = new URL(r.url);
  const path = scopePath(url);
  if (path == null) return;                                           // another origin
  if (r.mode === 'navigate') { e.respondWith(navigation(r)); return; }
  if (path === 'build-info.json' || path === 'sw.js') { e.respondWith(fetch(r, { cache: 'no-store' })); return; }
  if (SELF_MANAGED.test(path)) return;
  e.respondWith(assetResponse(r, path, url));
});
