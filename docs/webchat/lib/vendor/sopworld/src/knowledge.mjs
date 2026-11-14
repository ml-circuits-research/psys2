// Loading knowledge worlds by lookup (Round 24, A1).
// A catalog is an index of worlds (each with its schema, the worlds it depends on, and its
// shards) and a vocabulary (a word -> the shards that hold it). `createCatalog` finds the
// shards a word needs, reads each once through the host's `read(path)` (a file, `fetch`,
// a bundle), keeps them in a cache the host may supply, and tells them into a World with
// their schema and the schemas they depend on first. Fetching and storage stay the host's;
// so does the lemma of a word (the host passes `lemma`; no language is built in).
// `bundleReader` reads an offline bundle written by tools/build-bundle.mjs (shard texts by
// path, the same format), so the same catalog code works with no network.
// `createCatalogs` reads several catalogs at once, in an order of precedence (there will
// be more knowledge repositories than one).
import { parse, serialize } from './parser.mjs';

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
  const memo = new Map(); // word -> its shard ids: a lookup is made once (the vocabulary does not change)
  const shardsOf = (word, world) => {
    const key = String(word);
    if (!memo.has(key)) memo.set(key, [...new Set(forms(word).flatMap((f) => vocab[f] || []))]);
    const found = memo.get(key);
    if (found.length || !world) return found;
    // a form the vocabulary lacks but a loaded core.word maps to a word it has ("ants" means "ant")
    const means = world.ofType('core.word').filter((w) => (w.attrs.text || []).some((t) => String(t).replace(/^"|"$/g, '').toLowerCase() === key.toLowerCase())).flatMap((w) => w.attrs.means || []);
    return [...new Set(means.flatMap((m) => forms(String(m).replace(/^"|"$/g, '')).flatMap((f) => vocab[f] || [])))];
  };
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
      const shards = shardsOf(word, world);
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
      const shards = shardsOf(word, world);
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
    /** The text of one path, read at once (a file, a bundle) and kept in the cache. */
    textSync(p) {
      let t = cache.get(p);
      if (t === undefined) {
        t = read(p);
        if (t && typeof t.then === 'function') throw new Error('sopworld: a sync read is needed here; use into');
        if (t === null || t === undefined) throw new Error(`sopworld: catalog: nothing at ${p}`);
        cache.set(p, String(t));
      }
      return String(t);
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

/**
 * Several catalogs at once, in an order of precedence: `[{ name, index, vocab, read, cache? }]`,
 * the first wins. A word brings the shards of every catalog that has it. Each wire keeps its
 * catalog in its source (`core.source="<name>: <source>"`). A wire with an id that another
 * catalog already told, with other values, is not told: the conflict is reported
 * (`conflicts: [{ id, kept, dropped, keys }]`) and the first catalog's version stays.
 */
export function createCatalogs(list, { lemma } = {}) {
  const cats = list.map((c) => ({ name: c.name, cat: createCatalog({ ...c, ...(lemma && !c.lemma ? { lemma } : {}) }) }));
  if (new Set(cats.map((c) => c.name)).size !== cats.length || cats.some((c) => !c.name)) throw new Error('sopworld: createCatalogs needs a distinct name for each catalog');
  const owner = new WeakMap(); // World -> Map(wire id -> { catalog, attrs })
  const done = new WeakMap(); // World -> Set of "<catalog>:<path>" told
  const tag = (name, w) => { const src = w.attrs['core.source']?.[0]; return { ...w, attrs: { ...w.attrs, 'core.source': [JSON.stringify(`${name}: ${src ? String(src).replace(/^"|"$/g, '') : 'no source'}`)] } }; };
  const same = (a, b) => JSON.stringify(Object.entries(a).filter(([k]) => k !== 'core.source').sort()) === JSON.stringify(Object.entries(b).filter(([k]) => k !== 'core.source').sort());
  function tellText(world, name, path, text, res) {
    const own = owner.get(world) || owner.set(world, new Map()).get(world);
    const keep = [];
    for (const w of parse(text)) { // bounded: the wires of one file
      if (w.pattern) { keep.push(w); continue; }
      const nameKey = w.attrs.name ? `${w.type}|${w.attrs.name[0]}` : null; // the same thing under another id: a fact of the same type about the same name
      const before = own.get(w.id) ?? (nameKey ? own.get(nameKey) : undefined);
      if (before && before.catalog !== name) {
        if (!same(before.attrs, w.attrs)) res.conflicts.push({ id: w.id, kept: before.catalog, dropped: name, path, keys: [...new Set([...Object.keys(before.attrs), ...Object.keys(w.attrs)])].filter((k) => k !== 'core.source' && JSON.stringify(before.attrs[k]) !== JSON.stringify(w.attrs[k])) });
        continue; // the catalog that comes first keeps its version
      }
      if (!before) { own.set(w.id, { catalog: name, attrs: w.attrs }); if (nameKey) own.set(nameKey, { catalog: name, attrs: w.attrs }); }
      keep.push(tag(name, w));
    }
    if (!keep.length) return true;
    const r = world.tell(serialize(keep));
    if (!r.ok) { res.ok = false; res.violations.push(...r.violations.map((v) => ({ ...v, path, catalog: name }))); return false; }
    return true;
  }
  return {
    catalogs: () => cats.map((c) => c.name),
    /** The shards that hold a word, in every catalog: ["<catalog>:<shard>"], by precedence. */
    shardsOf: (word) => cats.flatMap((c) => c.cat.shardsOf(word).map((s) => `${c.name}:${s}`)),
    /** Tell what a word needs from every catalog that has it, in order. */
    async into(world, word) {
      const res = { word, shards: [], told: [], ok: true, violations: [], conflicts: [] };
      const seen = done.get(world) || done.set(world, new Set()).get(world);
      for (const c of cats) { // bounded: the catalogs
        const shards = c.cat.shardsOf(word);
        res.shards.push(...shards.map((s) => `${c.name}:${s}`));
        for (const [i, p] of c.cat.plan(shards).entries()) {
          if (seen.has(`${c.name}:${p}`)) continue;
          const text = (await c.cat.fetch(word))[i]?.text;
          if (!tellText(world, c.name, p, text, res)) return res;
          seen.add(`${c.name}:${p}`); res.told.push(`${c.name}:${p}`);
        }
      }
      return res;
    },
    /** As `into`, for catalogs whose `read` answers at once: no promise. */
    intoSync(world, word) {
      const res = { word, shards: [], told: [], ok: true, violations: [], conflicts: [] };
      const seen = done.get(world) || done.set(world, new Set()).get(world);
      for (const c of cats) { // bounded: the catalogs
        const shards = c.cat.shardsOf(word);
        res.shards.push(...shards.map((s) => `${c.name}:${s}`));
        for (const p of c.cat.plan(shards)) {
          if (seen.has(`${c.name}:${p}`)) continue;
          if (!tellText(world, c.name, p, c.cat.textSync(p), res)) return res;
          seen.add(`${c.name}:${p}`); res.told.push(`${c.name}:${p}`);
        }
      }
      return res;
    },
  };
}

/**
 * A bundled subset first, then the catalog (a first paint with no network): a `read(path)`
 * that answers from the bundle at once and asks `read` for the rest. `reachable()` says
 * whether the catalog answered the last time it was asked (true until it fails).
 */
export function bundleThenRead(bundle, read) {
  const local = bundleReader(bundle);
  let ok = true;
  const r = (path) => {
    const t = local(path);
    if (t !== null) return t;
    try {
      const v = read(path);
      if (v && typeof v.then === 'function') return v.then((x) => { ok = x !== null && x !== undefined; return x; }, (e) => { ok = false; throw e; });
      ok = v !== null && v !== undefined;
      return v;
    } catch (e) { ok = false; throw e; }
  };
  r.reachable = () => ok;
  return r;
}

/** The loaded wires of a type, optionally those whose `slot` has `value`: the names (or ids) in order. */
export function listOf(world, type, slot, value) {
  const bare = (v) => String(v).replace(/^"|"$/g, '').replace(/^\$/, '');
  return world.ofType(type).filter((w) => slot === undefined || (w.attrs[slot] || []).some((v) => bare(v) === bare(value))).map((w) => (w.attrs.name ? bare(w.attrs.name[0]) : w.id));
}

/** A world-level bundle: every `std.schema.world ... bundle=<name>` gets `bundles[name]` told once. Returns the names told. */
export function loadBundles(world, bundles) {
  const told = [];
  for (const wd of world.ofType('std.schema.world')) for (const name of wd.attrs.bundle || []) { // bounded: the declared worlds
    const key = `_bundle_${String(name).replace(/\W/g, '_')}`;
    if (world.has(key) || bundles[name] === undefined) continue;
    const r = world.tell(`${bundles[name]}\n@${key} std.schema.bundled name=${name}`);
    if (r.ok === false) return { ok: false, told, violations: r.violations, bundle: name };
    told.push(String(name));
  }
  return { ok: true, told };
}
