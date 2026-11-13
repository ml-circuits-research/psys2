// Loading knowledge worlds by lookup (Round 24, A1).
// A catalog is an index of worlds (each with its schema, the worlds it depends on, and its
// shards) and a vocabulary (a word -> the shards that hold it). `createCatalog` finds the
// shards a word needs, reads each once through the host's `read(path)` (a file, `fetch`,
// a bundle), keeps them in a cache the host may supply, and tells them into a World with
// their schema and the schemas they depend on first. Fetching and storage stay the host's;
// so does the lemma of a word (the host passes `lemma`; no language is built in).
// `bundleReader` reads an offline bundle written by tools/build-bundle.mjs (shard texts by
// path, the same format), so the same catalog code works with no network.

/**
 * @param {{ index: { worlds: { id: string, schema?: string, depends?: string[], shards?: { id: string, path: string }[] }[] },
 *           vocab?: Record<string, string[]>, read: (path: string) => string | null | Promise<string | null>,
 *           cache?: { get(path: string): string | undefined, set(path: string, text: string): void },
 *           lemma?: (word: string) => string[] }} options
 */
export function createCatalog({ index, vocab = {}, read, cache = new Map(), lemma = (w) => [w] }) {
  if (typeof read !== 'function') throw new Error('sopworld: createCatalog needs read(path)');
  const worlds = new Map((index?.worlds || []).map((w) => [w.id, w]));
  const pathOf = new Map(); // shard id -> path
  for (const w of worlds.values()) for (const s of w.shards || []) pathOf.set(s.id, s.path);
  const told = new WeakMap(); // World -> paths already told into it
  const reading = new Map(); // path -> promise of its text (one read at a time per path)

  /** The forms to look a word up by: the word, lower case, and what the host's lemma gives. */
  const forms = (word) => [...new Set([String(word), String(word).toLowerCase(), ...lemma(String(word).toLowerCase())])];
  /** The shard ids that hold a word (nothing is read). */
  const shardsOf = (word) => [...new Set(forms(word).flatMap((f) => vocab[f] || []))];
  const worldOf = (shard) => String(shard).split('/')[0];
  const pathFor = (shard) => pathOf.get(shard) ?? (/\.sop$/.test(shard) ? shard : `${shard}.sop`);

  /** The text of one path, read once and kept in the cache; a failed read is not remembered. */
  async function text(path) {
    const kept = cache.get(path);
    if (kept !== undefined) return kept;
    if (!reading.has(path)) {
      reading.set(path, Promise.resolve(read(path)).then((t) => {
        reading.delete(path);
        if (t === null || t === undefined) throw new Error(`sopworld: catalog: nothing at ${path}`);
        cache.set(path, String(t));
        return String(t);
      }, (e) => { reading.delete(path); throw e; }));
    }
    return reading.get(path);
  }

  /** The paths to tell for some shards: the schemas of their worlds and of what those depend on, first, then the shards. */
  function plan(shards) {
    const out = [], seen = new Set();
    const schema = (id, trail = new Set()) => { // bounded: each world once (a cycle is cut)
      if (seen.has(id) || trail.has(id)) return;
      trail.add(id);
      const w = worlds.get(id);
      for (const d of w?.depends || []) schema(d, trail);
      seen.add(id);
      if (w?.schema) out.push(w.schema);
    };
    for (const s of shards) schema(worldOf(s));
    for (const s of shards) { const p = pathFor(s); if (!out.includes(p)) out.push(p); }
    return out;
  }

  return {
    shardsOf,
    plan: (shards) => plan([].concat(shards)),
    /** Read (once) the shards a word needs, with their schemas: [{ path, text }]. */
    async fetch(word) { const paths = plan(shardsOf(word)); return Promise.all(paths.map(async (p) => ({ path: p, text: await text(p) }))); },
    /**
     * Tell what a word needs into a world: its schemas (once per world) and its shards.
     * Returns { shards, told: [paths told now], ok, violations }.
     */
    async into(world, word) {
      const shards = shardsOf(word);
      const done = told.get(world) || told.set(world, new Set()).get(world);
      const res = { word, shards, told: [], ok: true, violations: [] };
      for (const p of plan(shards)) {
        if (done.has(p)) continue;
        const r = world.tell(await text(p));
        if (!r.ok) { res.ok = false; res.violations.push(...r.violations.map((v) => ({ ...v, path: p }))); break; }
        done.add(p);
        res.told.push(p);
      }
      return res;
    },
    /** As `into`, for a host whose `read` answers at once (a file, a bundle): no promise. */
    intoSync(world, word) {
      const shards = shardsOf(word);
      const done = told.get(world) || told.set(world, new Set()).get(world);
      const res = { word, shards, told: [], ok: true, violations: [] };
      for (const p of plan(shards)) {
        if (done.has(p)) continue;
        let t = cache.get(p);
        if (t === undefined) {
          t = read(p);
          if (t && typeof t.then === 'function') throw new Error('sopworld: intoSync needs a read that answers at once; use into');
          if (t === null || t === undefined) throw new Error(`sopworld: catalog: nothing at ${p}`);
          cache.set(p, String(t));
        }
        const r = world.tell(String(t));
        if (!r.ok) { res.ok = false; res.violations.push(...r.violations.map((v) => ({ ...v, path: p }))); break; }
        done.add(p);
        res.told.push(p);
      }
      return res;
    },
    /** The shard ids of a world in the index (to build a bundle of a whole world). */
    shardsOfWorld: (id) => (worlds.get(id)?.shards || []).map((s) => s.id),
    worlds: () => [...worlds.keys()],
  };
}

/** A `read(path)` over an offline bundle `{ files: { path: text } }` (tools/build-bundle.mjs). */
export function bundleReader(bundle) {
  const files = bundle?.files || {};
  return (path) => (Object.hasOwn(files, path) ? files[path] : null);
}
