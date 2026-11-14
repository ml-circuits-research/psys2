// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The thin local `lang.ro` module (questions.md Q13): Romanian read from the catalog's language world `w.lang.ro` with the library's `std.morph` (analyse, generate, dictionary, splitClitics, fold),
 * bundled from the catalog (src/lang/ro.facts.generated.mjs, scripts/build-lang-ro.mjs) and imported LAZILY: nothing of Romanian loads unless the session's language is Romanian.
 * Browser-safe (no node:*). What it gives the grammar path (src/translate/grammar-ro.mjs) is a LEXICON in the grammar's shape:
 *
 *   const ro = await openLangRo();   ro.analyse(key, raw) -> [{ pos: 'noun' | 'verb' | 'adj', entry: { en, ro | inf, ... }, number, def, gen, tense, person, enclitic }]
 *
 * `en` is the English word of the lemma's SENSE (the dictionary's 4th column: k.words.<word>.<pos>.<n> or k.actions.verb.<act>.<verb>), the join to the domain worlds. The library does not read
 * Romanian into acts yet (no `g.rule` grammar in w.lang.ro, no read function in std.grammar 0.62): the frames stay with src/translate/grammar-ro.mjs (the host side) until it does.
 *
 * (The Q51 workaround of the 0.62 library, a completion of the suffix analysis by generating cells, is deleted: sopworld >= 0.63 folds the suffix index.)
 */
const CLITICS = new Set(['mi', 'ti', 'te', 'l', 'o', 'i', 'le', 'ne', 'va']);
const gloss = (sense) => {
  const s = String(sense ?? '');
  let m = /^k\.words\.(.+)\.(?:noun|verb|adjective|adj|adverb)\.\d+$/.exec(s);
  if (m) return m[1].replace(/_/g, ' ');
  m = /^k\.actions\.verb\.[a-z_]+\.(.+)$/.exec(s);
  if (m) return m[1].replace(/_/g, ' ');
  m = /^k\.colours\.psys2\.(.+)$/.exec(s);
  return m ? m[1] : null;
};
const posOf = (cls) => (cls?.startsWith('v.') ? 'verb' : cls?.startsWith('a.') ? 'adj' : 'noun');

export async function openLangRo({ facts = null } = {}) {
  facts ??= (await import('./ro.facts.generated.mjs?v=8848c09dca')).LANG_RO_FACTS;
  const lib = await import('../vendor/sopworld/sopworld.mjs?v=9de9c8fd7b');
  const world = new lib.World();
  world.load(facts.wires);
  const m = lib.morphOf(world, { types: { cls: 'w.lang.ro.class', ending: 'w.lang.ro.ending', irregular: 'w.lang.ro.irregular', fold: 'w.lang.ro.fold', split: 'w.lang.ro.split', template: 'w.lang.ro.template', vowel: 'w.lang.ro.vowel' } });
  const dict = lib.dictionary({ read: (l) => facts.dictionary[l] ?? null, fold: (s) => lib.fold(m, s) });
  const fold = (s) => lib.fold(m, s);
  /** The library's readings of a form (exact spellings first). */
  function readings(form) {
    return [...lib.analyse(m, form, { dictionary: dict })].sort((a, b) => Number(b.exact) - Number(a.exact));
  }
  const toEntry = (r, enclitic) => {
    const info = dict.lookup(r.lemma);
    const en = gloss(info?.sense);
    if (!en) return null;
    const f = r.features, pos = posOf(r.class);
    if (pos === 'verb') return { pos, entry: { pos, inf: r.lemma, en, flags: {} }, tense: f.tense, person: Number(f.person) || 0, number: f.num, form: r.form, ...(enclitic ? { enclitic } : {}) };
    if (pos === 'adj') return { pos, entry: { pos, ro: r.lemma, en }, gender: f.gender, number: f.num, form: r.form };
    return { pos, entry: { pos, ro: r.lemma, en, enp: null, g: info?.gender, flags: {}, extra: [] }, number: f.num, def: f.def === 'yes', gen: f.case === 'gendat', form: r.form };
  };
  return {
    lib, world, m, dictionary: dict, fold,
    /** Analyses of a word in the grammar's shape. `raw` keeps the diacritics when the text had them; a clitic hyphen is split off ("mută-mi" = mută + mi). */
    analyse(key, raw = null) {
      const form = (raw ?? key).toLowerCase();
      const [head, clitic] = lib.splitClitics(m, form);
      const enclitic = clitic && CLITICS.has(fold(clitic)) ? fold(clitic) : null;
      if (clitic && !enclitic) return [];
      return readings(head).map((r) => toEntry(r, enclitic)).filter(Boolean).filter((a) => !enclitic || a.pos === 'verb');
    },
    /** The wires a Romanian session loads, for the report: bytes of the wire text and of the dictionary files read so far. */
    loaded: () => ({ wires: facts.wires.length, dictionaryFiles: dict.loaded() }),
  };
}
