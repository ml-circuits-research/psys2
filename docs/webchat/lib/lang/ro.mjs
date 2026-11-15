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

export async function openLangRo({ facts = null, unimorph = false, gloss: glossFor = null, local: withLocal = true } = {}) {
  facts ??= (await import('./ro.facts.generated.mjs?v=9d4f7daed3')).LANG_RO_FACTS;
  const local = withLocal ? (await import('./ro.local.mjs?v=71e90d0f84')).LANG_RO_LOCAL : { wires: '', dictionary: {} };   // what the catalog lacks yet (questions.md [KNOW]), after the catalog's facts
  // the large dictionary (3,466 lemmas derived from UniMorph, CC BY-SA 3.0, no senses) is a module of its own, loaded only when asked for; for a letter the hand file comes first, then the derived rows
  const extra = unimorph ? (await import('./ro.unimorph.generated.mjs?v=7b06d02ad7')).LANG_RO_UNIMORPH : {};
  const text = (letter) => [facts.dictionary[letter], local.dictionary[letter], extra[letter]].filter(Boolean).join('\n');
  const lib = await import('../vendor/sopworld/sopworld.mjs?v=0e5fd8eed8');
  const world = new lib.World();
  world.load(facts.wires);
  if (local.wires.trim()) world.load(local.wires);
  const m = lib.morphOf(world, { types: { cls: 'w.lang.ro.class', ending: 'w.lang.ro.ending', irregular: 'w.lang.ro.irregular', fold: 'w.lang.ro.fold', split: 'w.lang.ro.split', template: 'w.lang.ro.template', vowel: 'w.lang.ro.vowel' } });
  const dict = lib.dictionary({ read: (l) => text(l) || null, fold: (s) => lib.fold(m, s) });
  const fold = (s) => lib.fold(m, s);
  /** The library's readings of a form (exact spellings first). */
  function readings(form) {
    return [...lib.analyse(m, form, { dictionary: dict })].sort((a, b) => Number(b.exact) - Number(a.exact));
  }
  const toEntry = (r, enclitic) => {
    const info = dict.lookup(r.lemma);
    const f = r.features, pos = posOf(r.class);
    const en = gloss(info?.sense) ?? (glossFor ? glossFor(r.lemma, pos) : null);   // a lemma with no sense (the UniMorph rows) has no English unless the host gives one: `gloss(lemma, pos)`
    if (!en) return null;
    if (pos === 'verb') return { pos, entry: { pos, inf: r.lemma, en, flags: {} }, tense: f.tense, person: Number(f.person) || 0, number: f.num, form: r.form, ...(enclitic ? { enclitic } : {}) };
    if (pos === 'adj') return { pos, entry: { pos, ro: r.lemma, en }, gender: f.gender, number: f.num, form: r.form };
    return { pos, entry: { pos, ro: r.lemma, en, enp: null, g: info?.gender, flags: {}, extra: [] }, number: f.num, def: f.def === 'yes', gen: f.case === 'gendat', form: r.form };
  };
  // the Romanian lemma of an English word, by the sense column of the dictionary rows (k.words.<word>.<pos>.<n>), built once from the rows in memory (the hand file and the local rows)
  let byEnglish = null;
  const lemmaOf = (en, pos) => {
    if (!byEnglish) {
      byEnglish = new Map();
      for (const rows of [facts.dictionary, local.dictionary]) for (const t of Object.values(rows ?? {})) for (const line of String(t).split('\n')) {
        const [lemma, , , sense] = line.split('\t'), g = /^k\.words\.(.+)\.(noun|adjective)\.\d+$/.exec(sense ?? '');
        if (g && !byEnglish.has(`${g[2]}|${g[1]}`)) byEnglish.set(`${g[2]}|${g[1]}`, lemma);
      }
    }
    return byEnglish.get(`${pos}|${String(en).toLowerCase().replace(/ /g, '_')}`) ?? null;
  };
  const run = (template, roles) => lib.realise(m, template, roles, { dictionary: dict, base: { num: 'sg', case: 'nomacc' } });
  const needsDe = (n) => n % 100 === 0 || n % 100 >= 20;   // Romanian: "20 de flori", "7 flori"
  /** A count { n, noun, colour? } in Romanian: the article or the number, the noun in its number, the colour agreeing with it; null when a word has no lemma. */
  const countRo = ({ n, noun, colour = null }) => {
    const k = lemmaOf(noun, 'noun'), c = colour ? lemmaOf(colour, 'adjective') : null;
    if (!k || (colour && !c)) return null;
    if (n === 1) return run(`{art@k} {k:num=sg,case=nomacc,def=no}${c ? ' {c@k}' : ''}`, { art: 'un', k, ...(c ? { c } : {}) });
    const np = run(`{k:num=pl,case=nomacc,def=no}${c ? ' {c:num=pl@k}' : ''}`, { k, ...(c ? { c } : {}) });
    return np ? `${n}${needsDe(n) ? ' de' : ''} ${np}` : null;
  };
  /** One role of a composed reply in Romanian: a lemma for realise (noun or colour), a number, a count, or a list of counts. */
  const AND = world.ofType('w.lang.ro.particle').find((p) => String(p.attrs.meaning?.[0] ?? '').replace(/"/g, '') === 'and')?.attrs.form?.[0]?.replace(/"/g, '') ?? null;   // the language world's "and"
  const listRo = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${AND} ${xs.at(-1)}`);
  const roleRo = (v) => {
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string') return lemmaOf(v, 'noun') ?? lemmaOf(v, 'adjective');
    if (Array.isArray(v)) { const xs = v.map((x) => (x && typeof x === 'object' ? countRo(x) : null)); return xs.length && xs.every(Boolean) && (xs.length < 2 || AND) ? listRo(xs) : null; }
    if (v && typeof v === 'object' && Number.isFinite(v.n)) return countRo(v);
    return null;
  };
  return {
    lib, world, m, dictionary: dict, fold,
    /** Analyses of a word in the grammar's shape. `raw` keeps the diacritics when the text had them; a clitic hyphen is split off ("mută-mi" = mută + mi). */
    analyse(key, raw = null) {
      if (raw == null && key == null) return [];
      const form = (raw ?? key).toLowerCase();
      const [head, clitic] = lib.splitClitics(m, form);
      const enclitic = clitic && CLITICS.has(fold(clitic)) ? fold(clitic) : null;
      if (clitic && !enclitic) return [];
      return readings(head).map((r) => toEntry(r, enclitic)).filter(Boolean).filter((a) => !enclitic || a.pos === 'verb');
    },
    /**
     * COMPOSED REPLIES (spec 06 "Composed replies", reviewer 2026-11-15 03:15 item 2): the Romanian of a reply the application composes, from its frame `say = { act, roles }`, by the
     * language world's template of the act (`w.lang.ro.template act=`) and the library's `realise`; null when there is no template or a word has no Romanian lemma (the caller then
     * goes on as before). Roles: an English noun or colour (its lemma by the dictionary's sense), a number, a count `{ n, noun, colour? }` ("7 noduri", "o casă albastră", "20 de
     * flori") or a list of counts ("un soare galben, 2 nori și o pasăre albastră"). No Romanian sentence is written here: the words are the template's and the dictionary's.
     */
    composeRo(say) {
      const template = say?.act ? lib.templateFor(m, say.act) : null;
      if (!template) return null;
      const roles = {};
      for (const [k, v] of Object.entries(say.roles ?? {})) {
        const x = roleRo(v);
        if (x == null) return null;
        roles[k] = x;
      }
      const out = run(template, roles);
      if (!out) return null;
      const t = out.charAt(0).toUpperCase() + out.slice(1);
      return /[.!?]$/.test(t) ? t : `${t}.`;
    },
    /** The wires a Romanian session loads, for the report: bytes of the wire text and of the dictionary files read so far. */
    loaded: () => ({ wires: facts.wires.length, dictionaryFiles: dict.loaded() }),
    /**
     * The Romanian REPLY to a request the grammar path read (a frame of src/translate/grammar-ro.mjs), made by the library's `realise` with the catalog's reply templates
     * (shards/templates.sop: the article and the adjective agree with the noun): "am desenat o casă roșie", "am șters casa", "casa este acum roșie". No text is written here.
     * null when the frame is outside the templates (a drawing with no colour, several things, a count, a place): the caller keeps its own reply.
     */
    replyRo(frame) {
      const f = Array.isArray(frame) ? (frame.length === 1 ? frame[0] : null) : frame;
      if (!f) return null;
      const r = f.roles, one = (r.things ?? (r.thing ? [r.thing] : [])).filter((n) => !n.proper);
      if (one.length !== 1 || one[0].count || one[0].plural || !one[0].noun?.ro) return null;
      const n = one[0];
      const run = (act, roles) => lib.realise(m, lib.templateFor(m, act), roles, { dictionary: dict, base: { num: 'sg', case: 'nomacc' } });
      if (f.act === 'make' && !r.rel && !r.dir) { const colour = r.colourRo ?? n.adjsRo?.[0]; return colour ? run('make', { art: 'un', kind: n.noun.ro, colour }) : null; }
      if (f.act === 'remove' && r.things?.length === 1) return run('remove', { thing: n.noun.ro });
      if (f.act === 'change.colour' && r.coloursRo?.length === 1 && r.things.length === 1) return run('change', { thing: n.noun.ro, colour: r.coloursRo[0] });
      return null;
    },
  };
}
