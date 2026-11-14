// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Access to the knowledge catalog (sop-knowledge-worlds: `k.objects`, later `k.commonsense`, `k.words`), shared by every consumer (the drawing board, the diagram,
 * KNOWLEDGE-BY-LOOKUP). Browser-safe: no `node:*`; the caller passes the way to read a file.
 *
 *   const cat = createCatalog({ vocab, readShard });   // vocab: { lemma: ['k.objects/shards/buildings', ...] }; readShard(path) -> text (or a promise of it)
 *   cat.shardsOf('castle')           // ['k.objects/shards/buildings'] (no loading)
 *   await cat.load('castle')         // loads only those shards (once), returns the loaded objects they hold: [{ name, parts }]
 *   cat.object('castle')             // the parts of a loaded object: [{ name, kind?, shape, x, y, w, h, z, colour, rgb?, pointing?, opens?, points? }] (draw order)
 *   cat.thingOfWord('castles')       // the object a spoken word means among the loaded shards (lemma, plural, synonyms of the shards' words), or null
 *
 * The format of a k.objects shard is the one of sop-knowledge-worlds (T5 and its amendment): an object is a list of parts, a part has a primitive shape, a box x y w h in the
 * object's 0-100 frame, a draw order z, colour names (rgb exact), and its points of a line or polygon as separate wires. A shard is plain text of SOP wires, one per line.
 * `createFetchLoader(base)` reads shards over HTTP (the GitHub Pages copy of the catalog, or a vendored folder); Node callers pass a function over `readFile`.
 */

const unq = (t) => (t.startsWith('"') ? JSON.parse(t) : t);
/** `@id type key=value key=value "quoted"` -> { id, type, attrs: { key: [values] } }, or null. */
export function parseLine(line) {
  const m = /^@(\S+)\s+(\S+)\s*(.*)$/.exec(line);
  if (!m) return null;
  const attrs = {};
  for (const t of m[3].matchAll(/([A-Za-z_][A-Za-z0-9_.]*)=("(?:[^"\\]|\\.)*"|\S+)/g)) (attrs[t[1]] ??= []).push(unq(t[2]));
  return { id: m[1], type: m[2], attrs };
}
const num = (a, k) => Number(a[k][0]);

/** Reads the text of a k.objects shard: { objects: Map(name -> parts in draw order), words: { lemma: object name } }. */
export function parseShard(text) {
  const objects = new Map(), points = new Map(), words = {}, order = [];
  for (const line of String(text).split('\n')) {
    if (!line.startsWith('@')) continue;
    const w = parseLine(line);
    if (!w) continue;
    if (w.type === 'k.objects.object') objects.set(w.attrs.name[0], []);
    else if (w.type === 'k.objects.part') {
      const a = w.attrs, p = { name: a.name[0], shape: a.shape[0], x: num(a, 'x'), y: num(a, 'y'), w: num(a, 'w'), h: num(a, 'h'), z: num(a, 'z'), colour: a.colour ?? ['grey'] };
      if (a.kind) p.kind = a.kind[0];
      if (a.rgb) p.rgb = a.rgb[0];
      if (a.pointing) p.pointing = a.pointing[0];
      if (a.opens) p.opens = a.opens[0];
      if (a.named) p.named = a.named[0];   // named=model: the part's name was guessed by a model (about a fifth of the imported parts)
      p.id = w.id; p.of = a.of[0]; order.push(p);
    } else if (w.type === 'k.objects.point') {
      const key = w.attrs.part[0].replace(/^\$/, '');
      if (!points.has(key)) points.set(key, []);
      points.get(key).push({ n: num(w.attrs, 'n'), x: num(w.attrs, 'x'), y: num(w.attrs, 'y') });
    } else if (w.type === 'core.word' && w.attrs.of?.[0] === 'k.objects.object.name') {
      for (const t of w.attrs.text ?? []) words[t] = w.attrs.means[0];
    }
  }
  for (const p of order) {
    const pts = (points.get(p.id) ?? []).sort((a, b) => a.n - b.n).map((q) => [q.x, q.y]);
    if (pts.length) p.points = pts;
    const { id, of, ...rest } = p;
    (objects.get(of) ?? objects.set(of, []).get(of)).push(rest);
  }
  for (const list of objects.values()) list.sort((a, b) => a.z - b.z);
  return { objects, words };
}

/** A loader that reads `<base>/<shard path>.sop` with fetch (browser, or Node 20+). */
export const createFetchLoader = (base) => async (path) => {
  const r = await fetch(`${String(base).replace(/\/$/, '')}/${path}.sop`);
  if (!r.ok) throw new Error(`catalog shard ${path}: HTTP ${r.status}`);
  return r.text();
};

export function createCatalog({ vocab = {}, readShard }) {
  const objects = new Map(), names = new Map(), words = new Map(), loaded = new Map();   // loaded: shard path -> promise of its object names
  const shardsOf = (lemma) => vocab[String(lemma).toLowerCase()] ?? [];
  const variants = (w) => { const x = String(w ?? '').toLowerCase(); return [x, x.endsWith('ies') ? `${x.slice(0, -3)}y` : null, x.endsWith('es') ? x.slice(0, -2) : null, x.endsWith('s') ? x.slice(0, -1) : null].filter(Boolean); };
  async function loadShard(path) {
    if (!loaded.has(path)) {
      loaded.set(path, Promise.resolve(readShard(path)).then((text) => {
        const s = parseShard(text);
        for (const [name, parts] of s.objects) { objects.set(name, parts); names.set(name, name); }
        for (const [lemma, name] of Object.entries(s.words)) words.set(lemma, name);
        return [...s.objects.keys()];
      }).catch((e) => { loaded.delete(path); throw e; }));   // a failed read (no network) is not remembered: the next ask tries again
    }
    return loaded.get(path);
  }
  return {
    shardsOf,
    /** Loads the shards that hold the lemma (and its plural/singular forms); resolves to the objects now known for it. */
    async load(lemma) {
      const paths = [...new Set(variants(lemma).flatMap(shardsOf))].filter((p) => p.startsWith('k.objects/'));
      await Promise.all(paths.map(loadShard));
      const name = this.thingOfWord(lemma);
      return name ? [{ name, parts: objects.get(name) }] : [];
    },
    object: (name) => objects.get(name) ?? null,
    /** The object a word means: an object's own name wins over the keywords of other objects ("orange" is the orange, not a tangerine whose keywords say orange). */
    thingOfWord(word) { for (const v of variants(word)) if (names.has(v)) return names.get(v); for (const v of variants(word)) if (words.has(v)) return words.get(v); return null; },
    /** Is there a loaded object whose own name is the word (or its singular)? */
    hasName: (word) => variants(word).some((v) => names.has(v)),
    /** Every loaded object: Map(name -> parts), and the keyword map { lemma: object name } of the loaded shards (for hosts that keep their own registry). */
    objects: () => objects,
    keywords: () => Object.fromEntries(words),
    /** Loads one shard by path (once); resolves to the names of its objects. */
    loadShardPath: loadShard,
    loadedShards: () => [...loaded.keys()],
  };
}
