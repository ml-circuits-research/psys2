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

import { parseLine, parseShard } from './catalog.mjs';

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
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
  const stats = { vocabMs: 0, vocabBytes: 0, shardMs: 0, shardBytes: 0, shardsLoaded: [], lookups: 0, hits: 0 };
  const parsed = new Map();   // object shard id -> parsed shard (the shared parser)
  const parsedShard = async (sid) => { if (!parsed.has(sid)) { const lines = await loadShard(sid); try { parsed.set(sid, parseShard(lines.join('\n'))); } catch { parsed.set(sid, null); } } return parsed.get(sid); };
  const things = new Map();   // lemma -> thing | null  (settled lookups, readable synchronously through `peek`)

  const loadVocab = () => vocabLoading ??= (async () => {
    const t = clock();
    let failed = false;
    try { const txt = await source.text('vocab.json'); stats.vocabBytes = txt?.length ?? 0; failed = !txt; vocab = txt ? JSON.parse(txt) : {}; } catch { failed = true; vocab = {}; }
    if (failed) retryLater(() => { vocabLoading = null; vocab = null; things.clear(); });
    stats.vocabMs = clock() - t;
  })();

  const loadShard = (id) => {
    if (!shards.has(id)) shards.set(id, (async () => {
      const t = clock();
      let txt = null;
      try { txt = await source.text(`${id}.sop`); } catch { /* an unreachable shard is no knowledge */ }
      stats.shardMs += clock() - t; stats.shardBytes += txt?.length ?? 0; stats.shardsLoaded.push(id);
      if (!txt) retryLater(() => { shards.delete(id); parsed.delete(id); things.clear(); });
      return txt ? txt.split('\n') : [];
    })());
    return shards.get(id);
  };

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
  async function thing(word) {
    const key = lemmaCandidates(word)[0];
    if (!key) return null;
    for (const lc of lemmaCandidates(word)) if (things.has(lc)) return things.get(lc);
    stats.lookups++;
    const hit = await find(word);
    if (!hit) { things.set(key, null); return null; }
    const { lemma } = hit;
    const objects = new Map(), commonsense = [], senses = [];
    for (const sid of hit.shards) {
      const lines = await loadShard(sid);
      const needle = lemma;
      for (const line of lines) {
        if (line.charCodeAt(0) !== 64 || !line.toLowerCase().includes(needle)) continue;
        const r = parseFact(line);
        if (!r) continue;
        if (r.type === 'k.commonsense.thing' && one(r, 'name') === lemma) commonsense.push({ ...r.f, shard: sid });
        else if (r.type === 'k.words.sense' && String(one(r, 'word')).toLowerCase() === lemma) senses.push({ pos: one(r, 'pos'), n: Number(one(r, 'n') ?? 0), gloss: one(r, 'gloss') ?? '', synonyms: r.f.synonym ?? [], isA: r.f.is_a ?? [], shard: sid });
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
    };
    stats.hits++;
    things.set(key, out); things.set(lemma, out);
    return out;
  }

  return {
    name, find, thing, stats, loadVocab,
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
}
