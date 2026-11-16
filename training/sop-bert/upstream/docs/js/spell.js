// spell.js: a small spell checker made with VSA (vector symbolic architecture), run on a message before the readers read it.
// Every word is a hypervector: the sum (bundle) of random bipolar vectors of its character n-grams, with '^' and '$' marking the word's
// start and end ("gree" -> ^g gr re ee e$ ^gr gre ree ee$). Similar spellings share n-grams, so their vectors point the same way; the
// cosine of two word vectors estimates the overlap of their n-gram sets. The vocabulary is the words the readers know:
//   - the VSS worlds' words (docs/model/spell/vocab.json, built by training/sketch/spell/build_spell.mjs from the lexicon, catalog and
//     front.json of the composer's worlds),
//   - the legend's values and cue words (docs/js/logic.js, read from the running engine's legend),
//   - the names on the canvas of the active reader (shape and group names, case-insensitive).
// Words that are left alone but are not correction targets (`keep` in vocab.json): the words of 2 or more training messages. They are
// real words people write (wants, flow, because), so they are never "corrected"; a typo is never turned into one of them.
// A word that is neither known nor kept is replaced by the nearest known word when the cosine is at least `threshold` and at least
// `margin` above the second-best word. threshold, margin and the n-gram sizes were chosen once by a protocol (build_spell.mjs:
// one random typo per message of the demo's benchmark sets, a fixed objective), and are stored in vocab.json.
// Never touched: known words, words of 1-2 letters, numbers and words with digits or apostrophes, quoted text ("label it "teh""), the
// word after named / called / titled / labeled, and capitalised words inside a sentence (names): those are only corrected toward a
// name on the canvas ("Strat" -> "Start"), never toward an ordinary word ("named Gree" keeps Gree).
// Works in the browser (window.SpellKit) and in node (require).
(function (root) {
  'use strict';
  const DEFAULTS = { D: 1024, seed: 1234567, ngrams: [2, 3], threshold: 0.6, margin: 0.05, minLen: 3 };
  const NAMING = new Set(['named', 'called', 'titled', 'labeled', 'labelled']);

  /** a 32-bit hash of a string (FNV-1a), mixed with the seed */
  function hash(s, seed) {
    let h = (0x811c9dc5 ^ seed) >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  /** mulberry32: a small seeded PRNG */
  function prng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0); }; }

  /** the n-grams of a word with boundary marks */
  function ngramsOf(word, ns) {
    const s = '^' + word + '$', out = [];
    for (const n of ns) for (let i = 0; i + n <= s.length; i++) out.push(s.slice(i, i + n));
    return out;
  }

  function create(opts) {
    const P = Object.assign({}, DEFAULTS, opts && opts.params);
    const D = P.D, codebook = new Map();
    /** the random bipolar vector of one n-gram (made on first use, the same for a given seed) */
    function gramVec(g) {
      let v = codebook.get(g); if (v) return v;
      v = new Int8Array(D); const r = prng(hash(g, P.seed));
      for (let i = 0; i < D; i += 32) { const bits = r(); for (let k = 0; k < 32 && i + k < D; k++) v[i + k] = (bits >>> k) & 1 ? 1 : -1; }
      codebook.set(g, v); return v;
    }
    /** a word's hypervector: the bundle (sum) of its n-gram vectors. The sums are small integers (at most the number of n-grams), so
     *  they are kept exactly in an Int8Array; the length is kept apart and the cosine is dot / (length * length). */
    function wordVec(word) {
      const acc = new Int8Array(D);
      for (const g of ngramsOf(word, P.ngrams)) { const v = gramVec(g); for (let i = 0; i < D; i++) acc[i] += v[i]; }
      let n = 0; for (let i = 0; i < D; i++) n += acc[i] * acc[i];
      return { v: acc, n: Math.sqrt(n) || 1 };
    }
    // the vocabulary matrix: one row per known word (lower case), built once
    const words = [], index = new Map(), vocabCache = new Map();
    let M = new Int8Array(0), norms = new Float32Array(0);
    function addWords(list) {
      const fresh = [];
      for (const w0 of list) { const w = String(w0).toLowerCase(); if (!/^[a-z]+$/.test(w) || index.has(w)) continue; index.set(w, words.length); words.push(w); fresh.push(w); }
      if (!fresh.length) return;
      const M2 = new Int8Array(words.length * D), N2 = new Float32Array(words.length); M2.set(M); N2.set(norms);
      fresh.forEach((w, k) => { const r = words.length - fresh.length + k, x = wordVec(w); M2.set(x.v, r * D); N2[r] = x.n; });
      M = M2; norms = N2; vocabCache.clear();
    }
    addWords((opts && opts.words) || []);
    const keep = new Set(((opts && opts.keep) || []).map((w) => String(w).toLowerCase()));
    const nameVecs = new Map();   // canvas names: lower case -> vector (cached; the canvas changes often, the names rarely)
    const nameVec = (n) => { let v = nameVecs.get(n); if (!v) { v = wordVec(n); nameVecs.set(n, v); } return v; };
    const dot = (a, B, off) => { let s = 0; for (let i = 0; i < D; i++) s += a[i] * B[off + i]; return s; };

    // the vocabulary part of a word's search does not change while the vocabulary does not: cached per word (lower case)
    function vocabTop(low, q) {
      let top = vocabCache.get(low); if (top) return top;
      let b1 = -2, b2 = -2, b3 = -2, r1 = -1, r2 = -1, r3 = -1;
      for (let r = 0; r < words.length; r++) {
        const s = dot(q.v, M, r * D) / (q.n * norms[r]);
        if (s > b1) { b3 = b2; r3 = r2; b2 = b1; r2 = r1; b1 = s; r1 = r; } else if (s > b2) { b3 = b2; r3 = r2; b2 = s; r2 = r; } else if (s > b3) { b3 = s; r3 = r; }
      }
      top = [[r1, b1], [r2, b2], [r3, b3]].filter(x => x[0] >= 0).map(([r, s]) => ({ word: words[r], sim: s }));
      if (vocabCache.size > 5000) vocabCache.clear();
      vocabCache.set(low, top); return top;
    }
    /** the nearest candidates of one word: [{word, sim}] best first (vocabulary words, and the canvas names given) */
    function nearest(word, names, namesOnly, k) {
      const low = word.toLowerCase(), q = wordVec(low), out = [];
      if (!namesOnly) out.push(...vocabTop(low, q));
      for (const [nlow, orig] of names) if (/^[a-z]+$/.test(nlow)) { const x = nameVec(nlow); out.push({ word: orig, sim: dot(q.v, x.v, 0) / (q.n * x.n), name: true }); }
      out.sort((a, b) => b.sim - a.sim);
      // the second best is the best DIFFERENT word (a canvas name equal to a vocabulary word is the same word)
      const seen = new Set(), uniq = [];
      for (const x of out) { const l = x.word.toLowerCase(); if (seen.has(l)) continue; seen.add(l); uniq.push(x); if (uniq.length >= (k || 2)) break; }
      return uniq;
    }

    /** check one message -> { text, fixes: [{from, to, at, sim, second}], ms }. opts: names (canvas), threshold, margin */
    function check(text, o) {
      o = o || {};
      const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
      const thr = o.threshold != null ? o.threshold : P.threshold, mar = o.margin != null ? o.margin : P.margin, minLen = o.minLen || P.minLen;
      const names = new Map(); for (const n of o.names || []) { const s = String(n); if (!names.has(s.toLowerCase())) names.set(s.toLowerCase(), s); }
      const fixes = [], parts = [];
      let last = 0, prevWord = null, sentenceStart = true;
      const TOK = /"[^"]*"|“[^”]*”|(?<![A-Za-z0-9])'[^']+'(?![A-Za-z0-9])|[A-Za-z0-9_]+(?:['’][A-Za-z]+)*|[.!?]/g;
      for (const m of String(text).matchAll(TOK)) {
        const tok = m[0];
        if (tok === '.' || tok === '!' || tok === '?') { sentenceStart = true; continue; }
        if (/^["“']/.test(tok)) { prevWord = null; sentenceStart = false; continue; }   // quoted text: never touched
        const atStart = sentenceStart; sentenceStart = false;
        const prev = prevWord; prevWord = tok.toLowerCase();
        const low = tok.toLowerCase();
        if (!/^[A-Za-z]+$/.test(tok) || tok.length < minLen) continue;   // numbers, ids (rectangle1), contractions, short words
        if (index.has(low) || keep.has(low) || names.has(low)) continue;   // known and kept words, canvas names
        if (prev && NAMING.has(prev)) continue;                             // "named Gree": a new name
        const capital = /^[A-Z]/.test(tok), allCaps = tok.length > 1 && tok === tok.toUpperCase();
        const nameLike = allCaps || (capital && !atStart);
        if (nameLike && !names.size) continue;                              // a capitalised word is a name: only a canvas name can correct it
        const c = nearest(tok, names, nameLike, 2);
        if (!c.length) continue;
        const best = c[0], second = c[1] ? c[1].sim : 0;
        if (best.sim < thr || best.sim - second < mar) continue;
        let to = best.word;
        if (!best.name && capital) to = to.charAt(0).toUpperCase() + to.slice(1);   // "Gren circle" at the start of a sentence -> "Green"
        fixes.push({ from: tok, to, at: m.index, sim: +best.sim.toFixed(3), second: +second.toFixed(3) });
        parts.push(text.slice(last, m.index), to); last = m.index + tok.length;
      }
      parts.push(String(text).slice(last));
      return { text: fixes.length ? parts.join('') : String(text), fixes, ms: (typeof performance !== 'undefined' ? performance : Date).now() - t0 };
    }
    return { check, nearest, addWords, wordVec, params: P, size: () => words.length, keepSize: () => keep.size,
      has: (w) => index.has(String(w).toLowerCase()), kept: (w) => keep.has(String(w).toLowerCase()) };
  }

  /** the legend's values and cue words as single lower-case words (a cue of several words gives each of its words) */
  function legendWords(legend) {
    const out = new Set();
    for (const q of legend.questions.values()) if (q.values) for (const [v, cues] of Object.entries(q.values)) for (const s of [v].concat(cues || [])) for (const w of String(s).toLowerCase().split(/[^a-z]+/)) if (w) out.add(w);
    return [...out];
  }

  /** browser: load vocab.json (with its content version from versions.json) and make the checker; resolves to null when it fails */
  async function load(modelRoot, legend) {
    try {
      let v = '';
      try { const r = await fetch(new URL('versions.json', modelRoot), { cache: 'no-cache' }); if (r.ok) v = ((await r.json()).files || {})['spell/vocab.json'] || ''; } catch (e) { v = ''; }
      const r = await fetch(new URL('spell/vocab.json' + (v ? '?v=' + encodeURIComponent(v) : ''), modelRoot));
      if (!r.ok) throw new Error('spell/vocab.json: HTTP ' + r.status);
      const V = await r.json(), t0 = performance.now();
      const sc = create({ params: V.params, words: V.words.concat(legend ? legendWords(legend) : []), keep: V.keep || [] });
      sc.loadMs = performance.now() - t0; sc.vocabVersion = v; sc.about = V.about;
      return sc;
    } catch (e) { console.warn('spell checker not loaded:', e); return null; }
  }

  const API = { create, legendWords, load, ngramsOf, DEFAULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.SpellKit = API;
})(typeof self !== 'undefined' ? self : this);
