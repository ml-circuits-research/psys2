/**
 * Lexicon index shared by the formalizer, router and renderer. Browser-safe.
 * Built once per WorldSet (memoized).
 */
import { singularLemma } from '../formalizer/rules/lemma.mjs';

/** Index of every lexicon of every loaded world. */
export function lexIndex(set) {
  return set.memo('lexIndex', () => build(set));
}

function build(set) {
  const plurals = new Map();      // singular -> plural (irregular)
  const irregularSingular = new Map(); // plural -> singular
  const lexicons = new Map();     // lexicon id -> { id, class, worldId, words:Set }
  const names = new Map();        // lowercase name -> gender | undefined
  const units = new Set();
  const nounsMulti = new Set();   // multi-word noun lemmas with '_'
  const byWorld = new Map();      // worldId -> Map(lemma -> weight)
  const phrases = new Map();      // phrase macro id -> { id, worldId, alts: string[][] }
  for (const w of set.list()) {
    const weights = new Map();
    for (const ph of w.phrases ?? []) phrases.set(ph.id, { id: ph.id, worldId: w.id, alts: ph.alts, frame: ph.frame });
    for (const lex of w.lexicons) {
      const words = new Set(lex.words.map((x) => x.toLowerCase()));
      lexicons.set(lex.id, { id: lex.id, class: lex.class, worldId: w.id, words });
      for (const p of lex.plurals) {
        const [s, pl] = p.toLowerCase().split(':');
        if (s && pl) { plurals.set(s, pl); irregularSingular.set(pl, s); }
      }
      for (const word of words) {
        if (lex.class === 'name') names.set(word, lex.gender);
        if (lex.class === 'unit') units.add(word);
        if (lex.class === 'noun' && word.includes('_')) nounsMulti.add(word);
        if (!word.includes('_')) weights.set(word, Math.max(weights.get(word) ?? 0, lex.class === 'trigger' ? 2 : 1));
      }
    }
    // a world with nothing to run (lang.common: phrases and shared lexicons only) is never a routing target
    if (w.patterns.length || w.operations.length) byWorld.set(w.id, weights);
  }
  const index = { plurals, irregularSingular, lexicons, names, units, nounsMulti, byWorld, phrases };
  index.lemma = (word) => singularLemma(word, irregularSingular);
  return index;
}
