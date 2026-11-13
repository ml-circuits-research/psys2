// SPDX-License-Identifier: AGPL-3.0-only
// OPEN CLASSES BY LOOKUP (spec 21 section 10). A lexicon marked `open=knowledge` with `catalog=<knowledge world>` (repeatable) matches, besides its own few words, any word the catalog
// vocabulary knows as a word of one of those worlds (singular and plural come from the reader's lemma, synonyms are catalog words of their own). The word is looked up when a
// sentence is read; nothing is generated into the world: a kind added to the catalog is understood the same minute. The same mechanism serves any class (kinds, colours, values): a
// lexicon says which catalog worlds it is open to.
//
// Synchronous by design (the matcher is): the host loads the vocabulary before reading (`ready()`, called by the dialogue at the start of a turn); until then nothing is open and the
// lexicon is its closed list. Browser-safe: no node imports.
import { lemmaCandidates } from './facts.mjs';

let attached = null;
/** The host attaches the catalog of the session (`engine.setKnowledge`); `null` detaches it. */
export function attachOpenWords(facts) { attached = facts ?? null; }

/** Load what the lookups need (the vocabulary, and the part names of k.objects) once; resolves quickly afterwards. Never throws. */
export async function ready() {
  if (!attached) return;
  try { await attached.loadVocab?.(); await attached.loadParts?.(); } catch { /* an unreachable catalog opens nothing */ }
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
  constructor(words, catalogs, blocked) { super(words); this.catalogs = catalogs; this.blocked = blocked ?? (() => false); this.open = true; }
  has(entry) { return super.has(entry) || (!this.blocked(entry) && knowsKind(entry, this.catalogs)); }
}
export { lemmaCandidates };
