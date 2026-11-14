// SPDX-License-Identifier: AGPL-3.0-only
// The words each world answers to, for the lazy-loading index (src/worlds/word-index.mjs). Build side (node): needs the loaded world set.
//   worldWords(set)   Map world id -> Set of atoms: the words of its patterns and phrase groups, its lexicons (words, plurals, multiword names joined with _, each word's lemma),
//                     its tab id, aliases and title, the words of the names the shell opens it by, and (with the imports) what the rules of the world read.
// The atoms are the ones `messageWords` gives for a message (lowercase, accents folded, lemma, pairs and triples joined with `_`).
import { vocabularyOf } from '../../src/formalizer/rules/index.mjs';
import { restrictedSet } from '../../src/formalizer/spell.mjs';
import { lexIndex } from '../../src/worlds/lexicon.mjs';
import { lemma } from '../../src/dialog/meta-worlds.mjs';

const atom = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');

export function worldWords(set) {
  const out = new Map();
  for (const w of set.list()) {
    const sub = restrictedSet(set, [w.id]);
    const words = new Set();
    const add = (x) => { const a = atom(x); if (a) { words.add(a); const l = atom(lemma(a)); if (l) words.add(l); } };
    for (const x of vocabularyOf(sub)) add(x);
    const lex = lexIndex(sub);
    for (const l of lex.lexicons.values()) {
      if (l.worldId && !sub.list().some((v) => v.id === l.worldId)) continue;
      const closed = l.words instanceof Set ? Set.prototype.values.call(l.words) : l.words;
      for (const x of closed) add(x);   // multiword names stay joined with _ (the vocabulary only has their parts)
    }
    for (const [s, pl] of lex.plurals) { add(s); add(pl); }
    for (const id of set.available(w.id)) {
      const t = set.get(id)?.tab;
      if (t && id === w.id) for (const x of [t.id, t.title, ...(t.aliases ?? [])]) { add(x); for (const part of String(x).split(/[\s_]+/)) add(part); }
    }
    out.set(w.id, words);
  }
  return out;
}

/** word -> sorted list of world ids that have it. */
export function invert(words) {
  const inv = new Map();
  for (const [id, ws] of words) for (const x of ws) (inv.get(x) ?? inv.set(x, []).get(x)).push(id);
  return inv;
}
