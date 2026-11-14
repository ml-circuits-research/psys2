// SPDX-License-Identifier: AGPL-3.0-only
// LAZY LOADING of worlds (specs/06 "Lazy loading"), run by the engine worker. Imports nothing relative (a worker has no import map).
//
//   const wl = createWorldLoader({ indexHash, fetchJson, bag, on })
//   await wl.init()                    reads worlds/index.json (the small routing index: cards, imports, vendor assets, hashes of the bundles and of the word buckets)
//   wl.startIds({ tabWorld, state })   what a start loads: the always-loaded worlds, the open tab's world, and the worlds a restored session has state or memory in
//   await wl.plan(text)                the worlds a message needs by its words: exact index cut by the first two letters (design B), a bucket is fetched once and kept
//   await wl.bundles(ids)              the files of the worlds (and what they import), fetched in parallel, each once; returns the new ids
//
// The index decides what to LOAD, never how to READ: the engine reads with whatever worlds are loaded; `plan` only says which ones to add first. A reading that is not complete (nothing understood,
// an unsupported request, a spelling correction, words left out) is read again with every world (the worker does that; scripts/eval-word-index.mjs measures it).
export function createWorldLoader({ indexHash, fetchJson, bag, on = () => {} }) {
  let index = null;
  const store = new Map();       // world id -> bundle entry { files, opsUrl, fnsUrl }
  const buckets = new Map();     // bucket -> Promise<{ word: [world index] }>
  const stats = { bundleFetches: 0, bundleBytes: 0, bucketFetches: 0, bucketBytes: 0, plans: 0 };
  const T = () => index?.T ?? 2;

  const need = () => { if (!index) throw new Error('world index not loaded'); return index; };
  const closure = (ids) => {   // the worlds and what they import, and the worlds they read the facts of (a queue, no recursion)
    const out = new Set(), queue = [...ids];
    for (let n = 0; queue.length && n < 5000; n++) {
      const id = queue.pop(), w = need().worlds[id];
      if (!w || out.has(id)) continue;
      for (const d of w.deps ?? [id]) out.add(d);
      out.add(id);
      queue.push(...(w.reads ?? []));
    }
    return out;
  };
  const bucketOf = (w) => { const c = String(w).replace(/[^a-z0-9]/g, ''); return (c.slice(0, 2) || '_').padEnd(2, '_'); };
  const loadBucket = (bk) => {
    const h = need().words.buckets[bk];
    if (!h) return Promise.resolve({});
    if (!buckets.has(bk)) buckets.set(bk, fetchJson(`worlds/words/${bk}.json`, h).then((j) => { stats.bucketFetches++; return j ?? {}; }, () => ({})));
    return buckets.get(bk);
  };

  return {
    stats,
    get index() { return index; },
    ids: () => Object.keys(need().worlds),
    info: (id) => need().worlds[id] ?? null,
    always: () => need().always,
    closure,
    async init() {
      index = await fetchJson('worlds/index.json', indexHash);
      if (!index?.worlds) throw new Error('worlds/index.json: not a world index');
      return index;
    },
    /** A message's words are looked up in the buckets of their first two letters (fetched on demand). A world is needed when the message has a word that at most T worlds have. */
    async plan(text) {
      stats.plans++;
      const words = [...bag(text)].filter((w) => w.length >= 2 && !/^\d+$/.test(w));
      const wanted = [...new Set(words.map(bucketOf))];
      const loaded = await Promise.all(wanted.map(loadBucket));
      const by = new Map(wanted.map((b, i) => [b, loaded[i]]));
      const ids = need().words.ids, out = new Set();
      for (const w of words) {
        const b = by.get(bucketOf(w)), hit = b?.[w], strong = b?.[`!${w}`];
        if (strong) for (const i of strong) out.add(ids[i]);   // the name of a world's tab: it loads the world
        if (hit && hit.length <= T()) for (const i of hit) out.add(ids[i]);
      }
      return { ids: out, buckets: wanted.length };
    },
    /** The worlds that have the actions a turn asked for and nobody had loaded (`DialogSession.takeMissed`). */
    ofActions: (names) => (names ?? []).includes('*worlds') ? Object.keys(need().worlds) : [...new Set((names ?? []).map((a) => need().actions?.[a]).filter(Boolean))],   // '*worlds': the turn listed the worlds (what can you do?), the answer depends on every one
    /** The worlds a start loads. `state`: world id -> state (a restart restores them: a world that has state or memory is loaded again). */
    startIds({ tabWorld = null, state = null, recent = [] } = {}) {
      const ids = new Set(need().always);
      if (tabWorld && need().worlds[tabWorld]) ids.add(tabWorld);
      for (const id of Object.keys(state ?? {})) if (need().worlds[id] && !need().always.includes(id) && state[id] && Object.keys(state[id]).length) ids.add(id);
      for (const id of recent) if (need().worlds[id]) ids.add(id);
      return closure(ids);
    },
    /** Fetches the bundles of `ids` (those not held yet), in parallel; resolves to the ids that were new. `onFetch({ id, bytes })` per bundle. */
    async bundles(ids) {
      const fresh = [...ids].filter((id) => !store.has(id) && need().worlds[id]);
      await Promise.all(fresh.map(async (id) => {
        const w = need().worlds[id];
        const entry = await fetchJson(w.bundle, w.hash);
        if (!entry?.files) throw new Error(`${w.bundle}: not a world bundle`);
        stats.bundleFetches++; stats.bundleBytes += w.bytes ?? 0;
        store.set(id, entry);
        on({ id, bytes: w.bytes ?? 0 });
      }));
      return fresh;
    },
    has: (id) => store.has(id),
    held: () => [...store.keys()],
    /** The bundle (`createBundleLoader` format) of the held worlds in `ids`; the module URLs are made absolute by `abs(path, id, kind)`. */
    bundleOf(ids, abs) {
      const worlds = {};
      for (const id of ids) {
        const e = store.get(id);
        if (!e) continue;
        worlds[id] = { files: e.files, ...(e.opsUrl ? { opsUrl: abs(e.opsUrl, id, 'ops') } : {}), ...(e.fnsUrl ? { fnsUrl: abs(e.fnsUrl, id, 'fns') } : {}) };
      }
      return { worlds };
    },
  };
}
