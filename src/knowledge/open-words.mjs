// SPDX-License-Identifier: AGPL-3.0-only
// OPEN CLASSES BY LOOKUP (spec 21 section 10). A lexicon marked `open=knowledge` with `catalog=<knowledge world>` (repeatable) matches, besides its own few words, any word the catalog
// vocabulary knows as a word of one of those worlds (singular and plural come from the reader's lemma, synonyms are catalog words of their own). The word is looked up when a
// sentence is read; nothing is generated into the world: a kind added to the catalog is understood the same minute. The same mechanism serves any class (kinds, colours, values): a
// lexicon says which catalog worlds it is open to.
//
// Synchronous by design (the matcher is): the host loads the vocabulary before reading (`ready()`, called by the dialogue at the start of a turn); until then nothing is open and the
// lexicon is its closed list. Browser-safe: no node imports.
import { lemmaCandidates } from './facts.mjs';
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
import { colourName, isCoreColour } from './values.mjs';

let attached = null;
/** The host attaches the catalog of the session (`engine.setKnowledge`); `null` detaches it. */
export function attachOpenWords(facts) { if (facts !== attached) { firstWait = null; settled = false; } attached = facts ?? null; globalThis[Symbol.for('psys2.catalogWords')] = (attached?.peekVocab ? (w) => { const v = attached?.peekVocab?.(); return !!v && Object.hasOwn(v, w); } : null); }

/**
 * Load what the lookups need (the vocabulary, and the part names of k.objects). NEVER blocks a turn on the network: the first call waits a short time for a catalog that answers at once
 * (the repository, a cached one); a catalog that is slow or hanging is read without (the reading is then that of no catalog) and the loads go on in the background, so a later turn finds
 * the words. Never throws.
 */
let firstWait = null, settled = false;
const WAIT_MS = 250;
export async function ready(text = null) {
  if (!attached) return;
  const facts = attached;
  // a catalog with vocabulary buckets is read for the words of this message only (every turn); a whole-file catalog is read once
  if (settled && !(text && facts.loadVocabFor && facts.vocabBuckets?.())) return;
  const load = (async () => { try { if (text && facts.loadVocabFor) await facts.loadVocabFor(String(text).toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []); else await facts.loadVocab?.(); await facts.loadParts?.(); } catch { /* an unreachable catalog opens nothing */ } settled = facts === attached; })();
  if (settled) { await Promise.race([load, new Promise((res) => setTimeout(res, 600))]); return; }
  if (firstWait) return;   // already waited once: a pending load is not waited for again
  firstWait = new Promise((res) => setTimeout(res, WAIT_MS));
  await Promise.race([load, firstWait]);
}

/** True when `word` (a lemma, underscores for spaces) is a word of one of the catalog worlds and is not the name of a part of an object (a roof, a door is a part of its owner, never a kind of its own). */
export function knowsKind(word, catalogs) {
  if (!attached?.peekVocab) return false;
  const w = String(word);
  if (w.length < 3 || !/^[a-z][a-z_]*$/.test(w)) return false;
  const vocab = attached.peekVocab();
  if (!vocab || !Object.hasOwn(vocab, w)) return false;
  if (!(vocab[w] ?? []).some((sh) => catalogs.includes(String(sh).split('/')[0]))) return false;
  const parts = attached.peekParts?.();
  return !(parts && parts.has(w));
}

/**
 * A Set that is also open: `has(entry)` is true for its own words and for the words the catalog knows. Iteration, size and the other Set methods see only the closed list, so the
 * spelling and routing indexes (which walk the words) are unchanged.
 */
export class OpenWords extends Set {
  /** `probe(entry)` decides for a word that is not in the list: the catalog vocabulary for kinds (`catalogs`), the colour reader of k.values for colours. */
  constructor(words, probe, blocked) { super(words); this.probe = probe; this.blocked = blocked ?? (() => false); this.open = true; }
  has(entry) { return super.has(entry) || (!this.blocked(entry) && this.probe(entry)); }
}
export { lemmaCandidates };

const foldOf = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
let foldedFor = null, foldedMap = null;
/** The accent-free spellings of the vocabulary's lemmas that have accents (built once per loaded vocabulary): folded lemma -> shard ids. */
function foldedVocab(vocab) {
  if (foldedFor !== vocab) {
    foldedMap = new Map();
    for (const k of Object.keys(vocab)) { const f = foldOf(k); if (f !== k && !Object.hasOwn(vocab, f)) foldedMap.set(f, vocab[k]); }
    // a compound name joined by a hyphen is also said by its first part when that part is a name of its own ("Cluj" for Cluj-Napoca), unless the vocabulary already has that word
    for (const k of Object.keys(vocab)) { const i = k.indexOf('-'); if (i >= 4) { const head = foldOf(k.slice(0, i)); if (/^[a-z]+$/.test(head) && !Object.hasOwn(vocab, head) && !foldedMap.has(head)) foldedMap.set(head, vocab[k]); } }
    foldedFor = vocab;
  }
  return foldedMap;
}

/**
 * True when `word` (underscores for spaces) is the name of a place of the catalog's geography (`open=place`, worlds `catalog=k.geo`): the vocabulary lists it for a shard of those worlds
 * (not only for the doc of the schema: "river", "north" are words of the schema), it is not a colour or a number, and it has no digit (a lexicon word is lower-case ASCII with `_`).
 * Names of several words ("new york", "cape town") are looked up with spaces. A place word read here is only a reading of the sentence; the facts come by lookup (worlds/geo.map/places.mjs).
 */
let geoKeys = null, bundledGeo = null;
/** The geo world hands over the bundled k.geo subset when its ops load (LAZY-LOAD-3: 283 KB that a start with another tab open never needs); until then no bundled place is known. */
export function provideBundledGeo(g) { bundledGeo = g ?? null; geoKeys = null; }
/** The names of the bundled k.geo subset (countries, capitals, cities of 500,000+, with accent-free spellings and the first part of a hyphenated compound), known before the catalog's vocabulary arrives. */
function bundledPlaces() {
  if (geoKeys) return geoKeys;
  geoKeys = new Set();
  for (const k of bundledGeo?.keys ?? []) {
    geoKeys.add(k); geoKeys.add(foldOf(k));
    const i = k.indexOf('-'); if (i >= 4) geoKeys.add(foldOf(k.slice(0, i)));
  }
  return geoKeys;
}
export function knowsPlace(word, catalogs) {
  const vocab = attached?.peekVocab?.();
  if (!vocab) return catalogs.includes('k.geo') && bundledKnows(word);
  if (bundledKnows(word) && catalogs.includes('k.geo')) return true;
  const folded = foldedVocab(vocab);   // the vocabulary lists "são paulo" and "chișinău"; people type "sao paulo" and "chisinau"
  let w = String(word).replace(/_/g, ' ');
  for (let step = 0; step < 2; step++) {   // at most one relation is peeled: "the capital of sudan" -> "sudan"
    budget.tick('open-words.place');
    if (w.length < 3 || !/^[a-z][a-z .'-]*$/.test(w)) return false;
    const rel = /^(?:the )?capital(?: city)? of (.+)$/.exec(w) ?? /^(.+?)(?:['’]s)? capital(?: city)?$/.exec(w);   // a place by the relation k.geo states: "the capital of Sudan", "sudan capital"
    if (rel && rel[1] !== 'the' && step === 0) { w = rel[1].replace(/^the /, ''); continue; }
    const sh = [w, w.endsWith('s') ? null : `${w}s`].map((k) => (k && (Object.hasOwn(vocab, k) ? vocab[k] : folded.get(k)))).find(Boolean);
    if (!sh?.some((x) => catalogs.includes(String(x).split('/')[0]) && !/\/schema\.sop$/.test(x))) return false;
    return !isCoreColour(w);   // "red" is a colour; "peru" (only a shade of brown) is the country
  }
  return false;
}

/** Is `word` a name of the bundled subset (the relation "the capital of X" is peeled as in the vocabulary reading)? Never a core colour. */
function bundledKnows(word) {
  let w = String(word).replace(/_/g, ' ');
  if (w.length < 3 || !/^[a-z][a-z .'-]*$/.test(w)) return false;
  const rel = /^(?:the )?capital(?: city)? of (.+)$/.exec(w) ?? /^(.+?)(?:['’]s)? capital(?: city)?$/.exec(w);
  if (rel && rel[1] !== 'the') w = rel[1].replace(/^the /, '');
  const g = bundledPlaces();
  return (g.has(w) || g.has(`${w}s`)) && !isCoreColour(w);
}

/** The probe of an open lexicon: `open=knowledge` + catalogs (kinds of the catalog) or `open=colour` (any colour the one colour reader knows, with its spellings and shorthand). */
export const probeOf = (open, catalogs) => open === 'place' ? (w) => knowsPlace(w, catalogs) : (open === 'colour' ? (w) => w.length >= 2 && !!colourName(String(w).replace(/_/g, ' ')) : (w) => knowsKind(w, catalogs));
