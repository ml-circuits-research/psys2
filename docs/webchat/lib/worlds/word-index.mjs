// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The word index of lazy loading (specs/06 "Lazy loading"): which worlds (and which catalog shards) a message needs, decided by words alone. Browser-safe, no `node:*`.
 *
 * The index decides what to LOAD, never how to READ: after the worlds are loaded the real lexicons and the router decide, exactly as with every world loaded. A wrong "load" (a false
 * positive) costs one fetch; a missing one (a false negative) means the reading is that of a smaller world set, which scripts/eval-word-index.mjs measures.
 *
 * Two designs, both built (scripts/build-webchat.mjs writes both; the numbers are in worker-log "LAZY-LOAD"):
 *   A  a Bloom filter per world / per catalog shard (`bloomBuild`, `bloomHas`): about 10 bits per entry, no listing of words, so no help for spelling;
 *   B  an exact index cut by the first two letters of the word (`bucketsBuild`): word -> world ids (or shard ids), one bucket fetched on demand and cached by its hash; it also
 *      lists the known words, which the spelling corrector needs (`candidatesIn`).
 *
 * Query side: `queryWords(text)` is the normalized message (each word, its lemma, the pairs and triples of lemmas joined with `_`: the same atoms the router and the cards use,
 * `messageWords` of src/dialog/meta-worlds.mjs) and the spelling candidates of words nobody knows (`spellingCandidates`).
 */
import { messageWords, lemma } from '../dialog/meta-worlds.mjs?v=2d90e58e5f';

export { messageWords, lemma };

/** FNV-1a 32 bit with a seed, then double hashing (Kirsch-Mitzenmacher): k probes from two hashes. */
function h32(s, seed) {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d) >>> 0; h ^= h >>> 12;
  return h >>> 0;
}
const probes = (w, m, k) => { const a = h32(w, 0x9e3779b9), b = h32(w, 0x85ebca6b) | 1; const out = []; for (let i = 0; i < k; i++) out.push(((a + Math.imul(i, b)) >>> 0) % m); return out; };

/** A Bloom filter over `words`: { m (bits), k, n, bits (base64) }. `bitsPerEntry` 10 gives about 1 % false positives with k = 7. */
export function bloomBuild(words, { bitsPerEntry = 10 } = {}) {
  const list = [...new Set(words)];
  const m = Math.max(64, Math.ceil(list.length * bitsPerEntry / 8) * 8), k = Math.max(1, Math.round(bitsPerEntry * Math.LN2));
  const bytes = new Uint8Array(m / 8);
  for (const w of list) for (const p of probes(w, m, k)) bytes[p >> 3] |= 1 << (p & 7);
  return { m, k, n: list.length, bits: b64(bytes) };
}
export function bloomHas(f, w) {
  const bytes = f._bytes ??= unb64(f.bits);
  for (const p of probes(w, f.m, f.k)) if (!(bytes[p >> 3] & (1 << (p & 7)))) return false;
  return true;
}
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return globalThis.btoa(s); };
const unb64 = (t) => { const s = globalThis.atob(t), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };

/** The bucket key of a word: its first two letters (a-z), other first characters share `_` buckets. */
export const bucketOf = (w) => { const c = String(w).replace(/[^a-z0-9]/g, ''); return (c.slice(0, 2) || '_').padEnd(2, '_'); };

/** B: `entries` is a Map or an object word -> list of ids (strings or numbers); returns { bucket: { word: ids } }. */
export function bucketsBuild(entries) {
  const out = {};
  for (const [w, ids] of entries instanceof Map ? entries : Object.entries(entries)) ((out[bucketOf(w)] ??= {})[w] = ids);
  for (const b of Object.keys(out)) out[b] = Object.fromEntries(Object.entries(out[b]).sort(([x], [y]) => (x < y ? -1 : 1)));
  return out;
}

const edits1 = (w) => {
  const L = 'abcdefghijklmnopqrstuvwxyz', out = new Set();
  for (let i = 0; i <= w.length; i++) {
    if (i < w.length) { out.add(w.slice(0, i) + w.slice(i + 1)); for (const c of L) out.add(w.slice(0, i) + c + w.slice(i + 1)); }
    if (i < w.length - 1) out.add(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2));
    for (const c of L) out.add(w.slice(0, i) + c + w.slice(i));
  }
  out.delete(w);
  return out;
};
/** The words one edit away from `w` (insert, delete, replace, swap), lowercase letters only. A deletion at the front changes the bucket: callers fetch every bucket these give. */
/**
 * LAZY LOADING: is a first reading, made with the worlds loaded so far, one that a world not loaded might have read otherwise? Then the host loads every world and reads the message again.
 * Not complete: nothing understood; a word left out, unparsed or guessed (a spelling correction); a status other than supported; and a SWALLOW: a free-text slot (`words`, `rest`) of three words or
 * more that holds a joiner (then, also, ;) or a question word ("what is the capital of {Japan then how many days are in a week}"): a world that is not loaded may read the part after it, and the
 * loaded world took it as the name of a thing (measured: 24 of the 35 readings that looked complete and differed from a full start).
 */
const SWALLOW = /(?:^|[\s,;])(?:then|also|afterwards|next|plus|what|whats|how|which|who|whom|whose|where|when|why)(?=[\s,;?]|$)|;/i;
export function readingIncomplete(reply) {
  if (!reply?.segments?.length) return true;
  if (reply.segments.some((x) => x.unparsed || x.corrections?.length || x.ignored?.length)) return true;
  if ((reply.statuses ?? []).some((x) => x !== 'supported')) return true;
  return reply.segments.some((x) => Object.values(x.match?.slots ?? {}).some((sl) => (sl.class === 'rest' || sl.class === 'words') && String(sl.text ?? '').trim().split(/\s+/).length >= 3 && SWALLOW.test(String(sl.text))));
}
export const spellingCandidates =(w) => (/^[a-z]{4,}$/.test(w) ? [...edits1(w)] : []);

/** Words of the message that are worth asking about: no digits-only, at most `max`. */
export function queryWords(text, { max = 60 } = {}) {
  const { words } = messageWords(text);
  return words.filter((w) => w.length >= 2 && !/^\d+$/.test(w)).slice(0, max);
}
