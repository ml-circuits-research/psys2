/**
 * Knowledge lookup over the catalog (spec 17), built on `catalog.mjs` (the shared drawable-object access of DRAW-FROM-FACTS: `parseLine`, `parseShard`): the lookup of words in the knowledge worlds of sop-knowledge-worlds (`k.commonsense`, `k.objects`, `k.words`).
 * Browser-safe: no `node:*` imports; the caller passes a `source` (`{ text(path) -> Promise<string|null> }`, a file reader in Node, `fetch` in the
 * browser: `src/loaders/knowledge-source.mjs`).
 *
 * The idea (owner's rule: the encoder learns the SHAPE of a request, the knowledge worlds supply the WORDS, by lookup at run time):
 *   - `vocab.json` (lemma -> shard ids) is loaded once, lazily, on the first lookup;
 *   - a lookup of a word tries its lemma candidates ("spiders" -> "spider"), takes the shards of the first one the vocabulary knows;
 *   - only the shards of a hit are loaded, one request each, parsed once and cached;
 *   - no model is involved anywhere.
 * A hit says only WHICH knowledge to load. It never decides the world of a message (spec 17, section 3).
 */

import { parseLine, parseShard } from './catalog.mjs?v=698662f5e5';
import { buildFaces } from './faces.mjs?v=a8975fe028';

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
/** The kinds tried when a thing has no drawing of its own (a word can have dozens of senses with a kind each). */
const MAX_KINDS = 4;
/** One `thing()` call walks at most this many lemmas through kind-of links, and one lemma at most once per walk (invariant tests/facts-cycle.test.mjs: a kind-of cycle in the catalog ends). */
const MAX_WALK_STEPS = 12;
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
const clock = () => globalThis.performance?.now?.() ?? Date.now();
/** Runs `fn` after a backoff (an unreachable catalog is asked again later, not remembered as empty for the session); the timer never keeps a process alive. */
const retryLater = (fn, ms = 30000) => { const t = setTimeout(fn, ms); t.unref?.(); };

/** The lemma candidates of a word, most likely first: the word, then the singular forms of a regular plural. Pure, no vocabulary. */
export function lemmaCandidates(word) {
  const w = String(word ?? '').toLowerCase().replace(/[’']s$/, '').replace(/[^\p{L}\p{N} -]/gu, '').trim();
  if (!w) return [];
  const out = [w];
  const add = (x) => { if (x.length >= 2 && !out.includes(x)) out.push(x); };
  if (/ies$/.test(w)) add(`${w.slice(0, -3)}y`);
  if (/ves$/.test(w)) { add(`${w.slice(0, -3)}f`); add(`${w.slice(0, -3)}fe`); }
  if (/(?:ses|xes|zes|ches|shes|oes)$/.test(w)) add(w.slice(0, -2));
  if (/s$/.test(w) && !/ss$/.test(w)) add(w.slice(0, -1));
  if (/men$/.test(w)) add(`${w.slice(0, -3)}man`);
  return out;
}

/** One `.sop` fact line as { id, type, f } (f: key -> list of values) through the shared `parseLine`; null for a comment or a blank line. */
export function parseFact(line) {
  if (line.charCodeAt(0) !== 64) return null;
  const w = parseLine(line);
  return w ? { id: w.id, type: w.type, f: w.attrs } : null;
}

const one = (r, k) => r.f[k]?.[0];

export function createFacts({ source, name = 'catalog' }) {
  let vocab = null, vocabLoading = null;
  const shards = new Map();   // shard id -> Promise<facts[]>
  const stats = { vocabMs: 0, vocabBytes: 0, shardMs: 0, shardBytes: 0, shardsLoaded: [], lookups: 0, hits: 0, walkCuts: 0, maxWalk: 0 };
  const parsed = new Map();   // object shard id -> parsed shard (the shared parser)
  const parsedShard = async (sid) => { if (!parsed.has(sid)) { const lines = await loadShard(sid); try { parsed.set(sid, parseShard(lines.join('\n'))); } catch { parsed.set(sid, null); } } return parsed.get(sid); };
  let index = null, indexLoading = null;   // index.json of the catalog: worlds { id, exports (types), shards: [{ id, keys, sources }] }
  let down = false;           // the last read of the vocabulary or of a shard found the catalog unreachable (offline, too slow); cleared by the next good read
  const things = new Map();   // lemma -> thing | null  (settled lookups, readable synchronously through `peek`)

  const loadVocab = () => vocabLoading ??= (async () => {
    const t = clock();
    let failed = false;
    try { const txt = await source.text('vocab.json'); stats.vocabBytes = txt?.length ?? 0; failed = !txt || !!source.fellBack?.('vocab.json'); vocab = txt ? JSON.parse(txt) : {}; } catch { failed = true; vocab = {}; }
    down = failed;
    if (failed) retryLater(() => { vocabLoading = null; vocab = null; things.clear(); });
    stats.vocabMs = clock() - t;
  })();

  const loadIndex = () => indexLoading ??= (async () => {
    let failed = false;
    try { const txt = await source.text('index.json'); failed = !txt || !!source.fellBack?.('index.json'); index = txt ? JSON.parse(txt) : { worlds: [] }; } catch { failed = true; index = { worlds: [] }; }
    if (failed) { down = true; retryLater(() => { indexLoading = null; index = null; }); }
  })();

  const wireMemo = new Map();   // (type|key) -> the wires of a lookup with no shard filter, until the catalog reloads
  const wireIx = new Map();   // shard id -> { byType: Map(type -> wires), byValue: Map(lowercased value -> wires) }, built once per load
  const wireIndex = async (id) => {
    if (!wireIx.has(id)) {
      const lines = await loadShard(id), byType = new Map(), byValue = new Map();
      for (const line of lines) {
        budget.tick('facts.index');
        if (line.charCodeAt(0) !== 64) continue;
        const r = parseFact(line);
        if (!r) continue;
        (byType.get(r.type) ?? byType.set(r.type, []).get(r.type)).push(r);
        for (const v of new Set(Object.values(r.f).flatMap((vs) => vs.map((x) => String(x).toLowerCase())))) (byValue.get(v) ?? byValue.set(v, []).get(v)).push(r);
      }
      wireIx.set(id, { byType, byValue });
    }
    return wireIx.get(id);
  };

  const loadShard = (id) => {
    if (!shards.has(id)) shards.set(id, (async () => {
      const t = clock();
      let txt = null;
      try { txt = await source.text(`${id}.sop`); } catch { /* an unreachable shard is no knowledge */ }
      stats.shardMs += clock() - t; stats.shardBytes += txt?.length ?? 0; stats.shardsLoaded.push(id);
      const degraded = !txt || !!source.fellBack?.(`${id}.sop`);   // a layered source (the bundled subset under the catalog) answered for an unreachable catalog
      if (degraded) down = true;
      if (degraded) retryLater(() => { shards.delete(id); parsed.delete(id); wireIx.delete(id); wireMemo.clear(); things.clear(); });
      return txt ? txt.split('\n') : [];
    })());
    return shards.get(id);
  };

  /**
   * A thing with no drawing of its own is drawn by the object of its kind: the `k.objects.stand_in` wire (a villa by the house), else the first kind its word senses
   * give (`is_a`), at most two steps. Sets `out.drawnAs` (the drawing's name) and `out.objects` (that drawing's parts); nothing when nothing is found.
   */
  async function drawnAs(out, lemma, depth, walk) {
    if (depth > 1) return;
    const own = out.wires.find((w) => w.type === 'k.objects.stand_in' && String(one(w, 'name')).toLowerCase() === lemma);
    const kinds = [...new Set([own ? one(own, 'drawing') : null, ...(own ? [] : out.senses.flatMap((x) => x.isA))].filter((k) => k && lemmaCandidates(k)[0] !== lemma))].slice(0, MAX_KINDS);   // never the thing itself, a few kinds at most
    for (const k of kinds) {
      budget.tick('facts.drawnAs');
      const th = await thing(k, depth + 1, walk);
      if (th?.objects.length) { out.drawnAs = th.drawnAs ?? th.name; out.drawnVia = own ? 'stand_in' : 'is_a'; out.objects = th.objects; return; }
    }
  }

  /** A world of the catalog index by id (`k.faces`) or by one of its exported types (`k.faces.slot`): `{ id, exports, shards: [{ id, keys, sources, ... }] }`, else null. No code per world. */
  async function world(idOrType) {
    await loadIndex();
    return index.worlds.find((w) => w.id === idOrType) ?? index.worlds.find((w) => w.exports?.includes(idOrType)) ?? null;
  }

  /**
   * Every wire of a type, whatever the world: the shards come from the index (the world that exports the type; `key` keeps the shards whose identity keys hold it and, in them, the wires with that value, `shard`
   * is a predicate over the index entry), each is read once and parsed with the shared line parser. A wire is `{ id, type, f, shard, source }` (`f`: key -> values,
   * `source`: its core.source). A world added to the catalog is readable with no change here.
   */
  async function wires(type, { key = null, shard = null, world: inWorld = null } = {}) {
    const w = await world(inWorld ?? type);   // `world`: a type the index does not export (a `core.word` wire of a world's shards) is read in the shards of that world
    if (!w) return [];
    const k = key == null ? null : String(key).toLowerCase();
    const memo = shard ? null : `${type}|${k}|${inWorld ?? ''}`;
    if (memo && wireMemo.has(memo)) return wireMemo.get(memo);   // the same lookup within one load costs nothing
    const out = [];
    for (const sh of w.shards.filter((x) => (k == null || x.keys?.includes(k)) && (!shard || shard(x)))) {
      const ix = await wireIndex(sh.id);   // the shard is read and indexed once (by type, then by value): a turn's lookups cost the matches, not the lines
      for (const r of (k == null ? ix.byType.get(type) : ix.byValue.get(k)?.filter((x) => x.type === type)) ?? []) {
        budget.tick('facts.wires');
        out.push({ ...r, shard: sh.id, source: r.f['core.source']?.[0] ?? null });
      }
    }
    if (memo && !down) wireMemo.set(memo, out);
    return out;
  }

  /** `{ word, lemma, shards }` for the first lemma candidate the vocabulary knows, else null. No shard is loaded. */
  async function find(word) {
    await loadVocab();
    for (const lemma of lemmaCandidates(word)) {
      const sh = Object.hasOwn(vocab, lemma) ? vocab[lemma] : null;
      if (sh?.length) return { word, lemma, shards: sh };
    }
    return null;
  }

  /**
   * What the catalog knows about one thing, from the shards of its lemma only: drawable objects (parts), the commonsense fact, the word senses.
   * `null` when the vocabulary does not know the word (the plain "I do not know what a X is"). The settled answer is cached, also for a miss.
   */
  async function thing(word, depth = 0, walk = { steps: 0, seen: new Set() }) {
    const key = lemmaCandidates(word)[0];
    if (!key) return null;
    for (const lc of lemmaCandidates(word)) if (things.has(lc)) return things.get(lc);
    // the step budget and the cap per lemma of one walk: a lemma already on this walk, or the walk's step budget spent, ends the branch (no drawing of its own)
    if (walk.seen.has(key) || walk.steps >= MAX_WALK_STEPS) { stats.walkCuts++; return null; }
    walk.seen.add(key); walk.steps++; stats.maxWalk = Math.max(stats.maxWalk, walk.steps);
    stats.lookups++;
    const hit = await find(word);
    if (!hit) { things.set(key, null); return null; }
    const { lemma } = hit;
    const objects = new Map(), commonsense = [], senses = [], others = [];
    for (const sid of hit.shards) {
      const lines = await loadShard(sid);
      const needle = lemma;
      for (const line of lines) {
        if (line.charCodeAt(0) !== 64 || !line.toLowerCase().includes(needle)) continue;
        const r = parseFact(line);
        if (!r) continue;
        if (r.type === 'k.commonsense.thing' && one(r, 'name') === lemma) commonsense.push({ ...r.f, shard: sid });
        else if (r.type === 'k.words.sense' && String(one(r, 'word')).toLowerCase() === lemma) senses.push({ pos: one(r, 'pos'), n: Number(one(r, 'n') ?? 0), gloss: one(r, 'gloss') ?? '', synonyms: r.f.synonym ?? [], isA: r.f.is_a ?? [], shard: sid });
        else if (!r.type.startsWith('k.objects.') || r.type === 'k.objects.stand_in') { if ([...Object.values(r.f)].some((v) => v.some((x) => String(x).toLowerCase() === lemma))) others.push({ id: r.id, type: r.type, f: r.f, shard: sid }); }
      }
    }
    // the drawable object: the parts of the shared parser (points of lines and polygons included), from the object shards of the lemma
    for (const sid of hit.shards.filter((x) => x.startsWith('k.objects/'))) {
      const sh = await parsedShard(sid);
      const ps = sh?.objects.get(lemma);
      if (ps?.length) objects.set(`${sid}#${lemma}`, { id: `${sid}#${lemma}`, shard: sid, parts: ps });
    }
    senses.sort((a, b) => a.n - b.n);
    const out = {
      name: lemma, word, shards: hit.shards, loaded: [...new Set([...objects.values()].map((o) => o.shard).concat(commonsense.map((c) => c.shard), senses.map((s) => s.shard)))],
      objects: [...objects.values()].filter((o) => o.parts.length), commonsense: commonsense[0] ?? null, senses,
      wires: others,   // every other wire of its shards that names the lemma (any world: k.scenes, k.people, k.layouts, ...), generically
    };
    if (!out.objects.length) await drawnAs(out, lemma, depth, walk);   // the depth is carried down: a kind-of cycle (legs is a leg, a leg is legs) must end after two steps
    stats.hits++;
    things.set(key, out); things.set(lemma, out);
    return out;
  }


  /**
   * The schemas of the catalog's worlds, read generically (no code per world): `slotWords` (a word -> the slots it means, from the `core.word` wires: "legs" means k.animals.animal.legs),
   * `slots` (type id -> { key -> { kind, enum, many } }) and `types` (type id -> { complete }). Built once; `peekSchema()` reads it synchronously (`ctx.knowledge.peekSchema()`).
   */
  let schemaData = null, schemaLoading = null;
  async function schema() {
    schemaLoading ??= (async () => {
      await loadIndex();
      const slotWords = new Map(), slots = new Map(), types = new Map();
      for (const w of index.worlds) {
        if (!w.schema) continue;
        let text = null;
        try { text = await source.text(w.schema); } catch { /* no schema, no slots */ }
        for (const line of (text ?? '').split('\n')) {
          if (line.charCodeAt(0) !== 64) continue;
          const r = parseFact(line);
          if (!r) continue;
          if (r.type === 'core.type') types.set(one(r, 'of'), { complete: one(r, 'complete') === 'true', world: w.id });
          else if (r.type === 'core.slot') { const t = one(r, 'of'); if (!slots.has(t)) slots.set(t, {}); slots.get(t)[one(r, 'key')] = { kind: r.f.kind ?? [], enum: r.f.enum ?? [], many: one(r, 'many') === 'true', id: one(r, 'id') === 'true' }; }
          else if (r.type === 'core.word') for (const word of r.f.text ?? []) for (const m of r.f.means ?? []) { const k = word.toLowerCase(); if (!slotWords.has(k)) slotWords.set(k, new Set()); slotWords.get(k).add(m); }
        }
      }
      schemaData = { slotWords, slots, types };
      return schemaData;
    })();
    return schemaLoading;
  }

  /**
   * The ordered series of the catalog (months, weekdays, seasons, planets...), read from the types whose schema has an integer `n` or `order` slot: a series is a type (or, when its wires
   * have a `kind`, one kind of a type) with its wires sorted by that number; a type declared `complete=true` is a cycle. `{ [name]: { items: [name], cyclic, one, type } }`, built once.
   */
  let seriesData = null, seriesLoading = null;
  async function series() {
    seriesLoading ??= (async () => {
      const sc = await schema();
      const out = {};
      for (const [type, keys] of sc.slots) {
        const num = ['n', 'order'].find((k) => keys[k] && keys[k].kind.includes('integer'));
        if (!num || !keys.name) continue;
        const groups = new Map();
        for (const w of await wires(type)) {
          const n = Number(one(w, num)); if (!Number.isFinite(n)) continue;
          const g = keys.kind ? one(w, 'kind') ?? '' : '';
          const label = (g || type.split('.').at(-1)).toLowerCase();
          if (!groups.has(label)) groups.set(label, []);
          groups.get(label).push({ n, name: one(w, 'name'), w });
        }
        for (const [label, items] of groups) {
          if (items.length < 3) continue;
          items.sort((a, b) => a.n - b.n);
          out[`${label}s`] = { items: items.map((x) => x.name), cyclic: !!sc.types.get(type)?.complete, one: label, type, wires: items.map((x) => x.w) };
        }
      }
      seriesData = out;
      return out;
    })();
    return seriesLoading;
  }

  let facesData, facesLoading = null, partsData, partsLoading = null;
  const api = {
    name, find, thing, stats, loadVocab, world, wires, schema, series,
    /** The schema and the series already built, or undefined (synchronous reads for operations: \`ctx.knowledge.peekSchema()\`, \`peekSeries()\`). */
    peekSchema: () => schemaData ?? undefined, peekSeries: () => seriesData ?? undefined,
    /** The faces of k.faces (src/knowledge/faces.mjs), built once from the catalog; null when it has none (and asked again later). */
    faces() {
      facesLoading ??= buildFaces(api).then((d) => { facesData = d; if (!d) { facesLoading = null; } return d; });
      return facesLoading;
    },
    /** The faces already built, or undefined (a synchronous read for operations: `ctx.knowledge.peekFaces()`). */
    peekFaces: () => facesData,
    /** The vocabulary (lemma -> shard ids) once loaded, else null (a synchronous read for the open classes of the readers, src/knowledge/open-words.mjs). */
    peekVocab: () => vocab,
    /** Names of the parts of objects (k.objects.part: roof, door, wheel), read once from the k.objects shards; `peekParts()` is the set once loaded, else undefined. */
    loadParts() {
      partsLoading ??= (async () => {
        const out = new Set();
        const w = await world('k.objects');
        for (const sh of w?.shards ?? []) for (const r of (await wireIndex(sh.id)).byType.get('k.objects.part') ?? []) { const n = one(r, 'name'); if (n) out.add(String(n).toLowerCase()); }
        partsData = out;
        if (!w) partsLoading = null;
        return out;
      })();
      return partsLoading;
    },
    peekParts: () => partsData,
    /** True when the catalog could not be read last time (offline or too slow): a miss then is "I cannot reach it", not "it does not exist". */
    unreachable: () => down,
    /** The settled lookup of a word, or undefined when it has not been looked up (a synchronous read for operations: `ctx.knowledge.peek`). null = looked up, not known. */
    peek(word) { for (const lc of lemmaCandidates(word)) if (things.has(lc)) return things.get(lc); return undefined; },
    /**
     * How many `kind` ("legs") a thing has: the number a word sense states ("eight legs"), else the parts of its drawing (`from: 'parts'`: a picture, not a fact: the
     * hand-written cat shows two legs of four). null when nothing says.
     */
    countOf(th, kind) {
      const cands = lemmaCandidates(kind);
      const sing = cands.find((c) => th.objects.some((o) => o.parts.some((p) => p.kind === c || p.name === c || p.name?.endsWith(`_${c}`)))) ?? cands.at(-1) ?? kind;
      const names = [...new Set([kind, ...cands])].map((x) => x.replace(/[^a-z -]/g, '')).filter(Boolean).join('|');
      for (const s of th.senses) {
        const m = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')}|\\d+) (?:${names})\\b`, 'i').exec(s.gloss);
        if (m) return { n: NUMBER_WORDS[m[1].toLowerCase()] ?? Number(m[1]), from: 'gloss' };
      }
      for (const o of th.objects) { const n = o.parts.filter((p) => p.kind === sing || p.name === sing || p.name?.endsWith(`_${sing}`)).length; if (n) return { n, from: 'parts' }; }
      return null;
    },
  };
  return api;
}
