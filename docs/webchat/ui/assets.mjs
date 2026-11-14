// SPDX-License-Identifier: AGPL-3.0-only
// ASSETS (spec 06 "Assets, caches and versions"): the page side of the asset policy. Browser-safe, no node:*; every browser object is passed in, so tests can fake them.
//
//   1. resetForRelease(): once per CACHE_GENERATION, clears the service workers, Cache Storage, IndexedDB and the asset keys of localStorage. User data (settings, history,
//      saved faces, the user-action log) is never touched. A release that must start every browser clean bumps CACHE_GENERATION (and GENERATION in sw.js).
//   2. loadManifest(): build-info.json, fetched ONCE per start with no cache, the first request of the page. It carries the build `version` and every asset's hash.
//   3. a page whose own build (window.__psys2Build.version, stamped into index.html) differs from the manifest is a stale index.html: it reloads cleanly ONCE and says so.
//   4. registerWorker(): sw.js caches every asset forever under its hash; the page posts it the manifest, which deletes everything that is not in it.
//   assetUrl(base, path): the versioned URL of a file of the build (`path?v=<hash>`) for code that loads files by name (tab plugins, vendor libraries).
export const CACHE_GENERATION = 1;
export const GENERATION_KEY = 'psys2.cacheGeneration';
/** localStorage keys that only hold cached knowledge about assets or the last start (not user data): cleared by a release reset. */
export const ASSET_STORAGE_KEYS = ['psys2.webchat.progress', 'psys2.ortlog'];
const RELOAD_GUARD = 'psys2.reloadedFor';

let current = null;   // the manifest of this start
export const manifest = () => current;
/** `path` of the build as a URL next to `base`, with its hash (`?v=`) when the manifest knows it. */
export function assetUrl(base, path) {
  const u = new URL(path, base);
  const rel = decodeURIComponent(u.pathname.slice(new URL('.', base).pathname.length));
  const h = current?.assets?.[rel];
  if (h && !u.search) u.search = `?v=${h}`;
  return u.href;
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((res) => setTimeout(() => res(undefined), ms))]);

/** Clears the asset caches once per generation. Returns { reset, cleared: { caches, databases, workers, keys } }. Never throws. */
export async function resetForRelease({ storage = globalThis.localStorage, cacheStorage = globalThis.caches, idb = globalThis.indexedDB, serviceWorker = globalThis.navigator?.serviceWorker, generation = CACHE_GENERATION } = {}) {
  let stored = null;
  try { stored = storage?.getItem(GENERATION_KEY) ?? null; } catch { stored = null; }
  if (stored === String(generation)) return { reset: false, cleared: null };
  const cleared = { caches: 0, databases: 0, workers: 0, keys: 0 };
  try { for (const n of (await cacheStorage?.keys?.()) ?? []) { if (await cacheStorage.delete(n)) cleared.caches++; } } catch { /* ignore */ }
  try { for (const r of (await serviceWorker?.getRegistrations?.()) ?? []) { if (await r.unregister()) cleared.workers++; } } catch { /* ignore */ }
  try {
    for (const d of (await idb?.databases?.()) ?? []) if (d?.name) { await new Promise((res) => { const q = idb.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = () => res(); }); cleared.databases++; }
  } catch { /* ignore */ }
  for (const k of ASSET_STORAGE_KEYS) { try { if (storage?.getItem(k) != null) { storage.removeItem(k); cleared.keys++; } } catch { /* ignore */ } }
  try { storage?.setItem(GENERATION_KEY, String(generation)); } catch { /* storage unavailable: it resets again next start */ }
  return { reset: true, cleared };
}

/** The build manifest, fetched with no cache. null when it cannot be read (offline: the stored copy of the service worker keeps serving). */
export async function loadManifest({ base, fetchFn = globalThis.fetch, timeoutMs = 8000 } = {}) {
  try {
    const r = await withTimeout(fetchFn(new URL('build-info.json', base), { cache: 'no-store' }), timeoutMs);
    if (!r?.ok) return null;
    const m = await r.json();
    return m && typeof m === 'object' && m.assets ? m : null;
  } catch { return null; }
}

/** Registers sw.js, waits (bounded) until it is active and gives it the manifest. Resolves { controlled, acked }; never throws. */
export async function registerWorker({ base, manifest: m, serviceWorker = globalThis.navigator?.serviceWorker, timeoutMs = 2500 } = {}) {
  if (!serviceWorker?.register) return { controlled: false, acked: false, reason: 'unsupported' };
  try {
    // already registered: no register() call (it asks the server for sw.js again); the browser's own update check of sw.js runs at most once per navigation
    const existing = await serviceWorker.getRegistration?.(new URL('.', base).href).catch(() => null);
    const reg = existing?.active ? existing : await serviceWorker.register(new URL('sw.js', base).href, { scope: new URL('.', base).pathname });
    const ready = await withTimeout(serviceWorker.ready, timeoutMs);
    const sw = ready?.active ?? reg.active;
    if (!sw || !m) return { controlled: !!serviceWorker.controller, acked: false, reason: sw ? 'no manifest' : 'not active' };
    const ack = await withTimeout(new Promise((res) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => res(e.data);
      sw.postMessage({ type: 'manifest', manifest: { version: m.version, assets: m.assets } }, [ch.port2]);
    }), timeoutMs);
    return { controlled: !!serviceWorker.controller, acked: !!ack?.ok, removed: ack?.removed ?? 0 };
  } catch (e) { return { controlled: false, acked: false, reason: String(e?.message ?? e) }; }
}

/**
 * Start of the page's asset handling. `say(text)` shows a plain-words step ("A new version is available. Reloading once…").
 * Resolves { manifest, reloading, mismatch, reset, worker }. When `reloading` is true the caller stops: the page reloads itself.
 */
export async function startAssets({ base, win = globalThis.window ?? globalThis, storage = globalThis.localStorage, session = globalThis.sessionStorage, say = () => {}, fetchFn = globalThis.fetch, reload = () => globalThis.location.reload(),
  cacheStorage = globalThis.caches, idb = globalThis.indexedDB, serviceWorker = globalThis.navigator?.serviceWorker, useWorker = true } = {}) {
  const reset = await resetForRelease({ storage, cacheStorage, idb, serviceWorker });
  const m = await loadManifest({ base, fetchFn });
  current = m;
  const mine = win.__psys2Build?.version ?? null;
  if (m?.version && mine && m.version !== mine) {
    let guarded = null;
    try { guarded = session?.getItem(RELOAD_GUARD) ?? null; } catch { guarded = null; }
    if (guarded !== m.version) {
      try { session?.setItem(RELOAD_GUARD, m.version); } catch { /* no session storage: the guard is the banner below */ }
      say('A new version is available. Reloading once…');
      await new Promise((r) => setTimeout(r, 700));   // long enough to be read
      try { await withTimeout(fetchFn(globalThis.location.href, { cache: 'reload' }), 4000); } catch { /* the reload still asks the server */ }
      reload();
      return { manifest: m, reloading: true, mismatch: null, reset, worker: null };
    }
    return { manifest: m, reloading: false, mismatch: m, reset, worker: null };   // reloaded once already and still different: no loop, the caller shows a banner
  }
  const worker = useWorker ? await registerWorker({ base, manifest: m, serviceWorker }) : null;
  return { manifest: m, reloading: false, mismatch: null, reset, worker };
}
