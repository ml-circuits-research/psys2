/**
 * Lexicon index shared by the formalizer, router and renderer. Browser-safe.
 * Built once per WorldSet (memoized).
 */
import { singularLemma } from '../formalizer/rules/lemma.mjs?v=36e9c81564';
import { OpenWords, probeOf } from '../knowledge/open-words.mjs?v=e1f602a96b';

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
      let words = new Set(lex.words.map((x) => x.toLowerCase()));
      if (((lex.open === 'knowledge' || lex.open === 'place') && lex.catalogs?.length) || lex.open === 'colour') {   // an open class: its own words plus the catalog's, by lookup at reading time; a word of the world's other lexicons or of the acts is theirs
        const closed = words, wid = w.id, me = lex.id;
        words = new OpenWords(closed, probeOf(lex.open, lex.catalogs), lex.open === 'colour' ? undefined : (entry) => isTaken(entry, wid, me));
      }
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
  // the words that belong to something else than a kind: the other lexicons of the same world and the shared words of the acts (verbs, determiners, prepositions); built on first use
  let actWords = null;
  const isTaken = (entry, worldId, selfId) => {
    actWords ??= (() => { const out = new Set(); for (const [id, ph] of phrases) if (id.startsWith('acts.') || id === 'lang.shape.want') for (const alt of ph.alts) out.add(alt.join('_')); const rel = lexicons.get('lex.acts.rel'); if (rel) for (const x of rel.words) out.add(x); return out; })();
    if (actWords.has(entry)) return true;
    for (const [id, l] of lexicons) if (l.worldId === worldId && id !== selfId && !l.words.open && l.class !== 'noun' && l.words.has(entry)) return true;
    return false;
  };
  const index = { plurals, irregularSingular, lexicons, names, units, nounsMulti, byWorld, phrases };
  const openLex = [...lexicons.values()].filter((l) => l.words.open);
  /** True when a lexicon open to the catalog knows the word (a kind of the catalog, looked up now). */
  index.openHas = openLex.length ? (word) => openLex.some((l) => l.words.has(word)) : () => false;
  index.lemma = (word) => singularLemma(word, irregularSingular);
  return index;
}
