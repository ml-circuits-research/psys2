// SPDX-License-Identifier: AGPL-3.0-only
// LAZY LOADING of worlds (specs/06 "Lazy loading"), run by the engine worker. Imports nothing relative (a worker has no import map).
//
//   const wl = createWorldLoader({ indexHash, fetchJson, on })
//   await wl.init()                    reads worlds/index.json (the small routing index: imports, vendor assets, hashes of the bundles)
//   wl.startIds({ tabWorld, state })   what a start loads: the always-loaded worlds, the open tab's world, and the worlds a restored session has state or memory in
//   await wl.bundles(ids)              the files of the worlds (and what they import), fetched in parallel, each once; returns the new ids
export function createWorldLoader({ indexHash, fetchJson, on = () => {} }) {
  let index = null;
  const store = new Map();       // world id -> bundle entry { files, opsUrl, fnsUrl }
  const stats = { bundleFetches: 0, bundleBytes: 0 };

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
