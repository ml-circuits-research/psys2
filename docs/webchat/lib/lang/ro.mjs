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
const bare = (v) => String(v ?? '').replace(/^"|"$/g, '');
/** The CLDR plural category of a count in Romanian (one, few, other), the category the catalog's reply templates are written per. */
const plural = (n) => { try { return new Intl.PluralRules('ro').select(n); } catch { return n === 1 ? 'one' : n === 0 || (n % 100 >= 1 && n % 100 <= 19) ? 'few' : 'other'; } };
/** A world's own act said with the catalog's reply that says the same thing (the rest have no catalog reply yet: questions.md [KNOW]). */
const REPLY_OF = {
  'diagram.shaped': (r) => ({ name: 'done.make.shape', roles: { kind: 'diagram', shape: r.thing }, uses: ['thing'] }),   // `uses`: the roles of the act the catalog's reply says
};
const posOf = (cls) => (cls?.startsWith('v.') ? 'verb' : cls?.startsWith('a.') ? 'adj' : 'noun');

export async function openLangRo({ facts = null, unimorph = false, gloss: glossFor = null, local: withLocal = true } = {}) {
  facts ??= (await import('./ro.facts.generated.mjs?v=70639dca60')).LANG_RO_FACTS;
  const local = withLocal ? (await import('./ro.local.mjs?v=a4b41a5310')).LANG_RO_LOCAL : { wires: '', dictionary: {} };   // what the catalog lacks yet (questions.md [KNOW]), after the catalog's facts
  // the large dictionary (3,466 lemmas derived from UniMorph, CC BY-SA 3.0, no senses) is a module of its own, loaded only when asked for; for a letter the hand file comes first, then the derived rows
  const extra = unimorph ? (await import('./ro.unimorph.generated.mjs?v=723f88d67c')).LANG_RO_UNIMORPH : {};
  const text = (letter) => [facts.dictionary[letter], local.dictionary[letter], extra[letter]].filter(Boolean).join('\n');
  const lib = await import('../vendor/sopworld/sopworld.mjs?v=2363f3936d');
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
  // every sense of a lemma (a lemma may have several dictionary rows: așeza "sit" and "arrange"), from the rows in memory, built once
  let senses = null;
  const sensesOf = () => {
    if (!senses) {
      senses = new Map();
      for (const rows of [facts.dictionary, local.dictionary]) for (const t of Object.values(rows ?? {})) for (const line of String(t).split('\n')) {
        const [lemma, cls, , sense] = line.split('\t'), en = gloss(sense);
        if (lemma && en) (senses.get(lemma) ?? senses.set(lemma, []).get(lemma)).push({ en, pos: posOf(cls) });
      }
    }
    return senses;
  };
  // the words of the live worlds in Romanian (reviewer 2026-11-15 16:50, Q39 S3): an English word -> every surface form of the lemmas whose dictionary sense is that word (all cells of the
  // lemma's class, its irregular forms), by the language world's own morphology: inflections and the forms with their diacritics are what a Romanian user may type for it
  let reverse = null;
  const formsCache = new WeakMap();
  const formsOfLemma = (lemma) => {
    const cls = dict.lookup(lemma)?.class, c = cls ? m.classes.get(cls) : null, out = new Set([lemma]);
    for (const cell of c?.cells?.values?.() ?? []) { const f = lib.generate(m, lemma, cls, cell.feat); if (f) out.add(f); }
    for (const x of m.irregular) if (x.lemma === lemma && x.form) out.add(x.form);
    return out;
  };
  const formsOfEnglish = (words) => {
    if (words && typeof words === 'object' && formsCache.has(words)) return formsCache.get(words);
    if (!reverse) {
      reverse = new Map();
      for (const [lemma, list] of sensesOf()) for (const s of list) { const k = s.en.toLowerCase(); if (!reverse.has(k)) reverse.set(k, new Set()); reverse.get(k).add(lemma); }
    }
    const out = new Set();
    for (const w0 of words) {
      const w = String(w0).toLowerCase();
      const lemmas = reverse.get(w) ?? (w.length > 3 ? reverse.get(w.replace(/(?:es|s)$/, '')) : null) ?? null;   // a regular English plural names its singular's sense
      for (const lemma of lemmas ?? []) for (const f of formsOfLemma(lemma)) out.add(f.toLowerCase());
    }
    if (words && typeof words === 'object') formsCache.set(words, out);
    return out;
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
  // a list of English nouns said as text ("ponds, forests, water lilies"): each by its lemma (a plural by the English plural's lemma, said plural); a kind the dictionary has no
  // lemma for is said by its own name, quoted, as the names of things are (its Romanian word is a [KNOW] ask), never dropped
  const singularEn = (w) => (/ies$/.test(w) ? `${w.slice(0, -3)}y` : /(?:ch|sh|s|x|z)es$/.test(w) ? w.slice(0, -2) : /s$/.test(w) ? w.slice(0, -1) : null);
  const listText = (v) => {
    const out = [];
    for (const x of String(v).split(', ').map((y) => y.trim()).filter(Boolean)) {
      const one = lemmaOf(x, 'noun') ?? lemmaOf(x, 'adjective');
      if (one) { out.push(one); continue; }
      const sg = singularEn(x), base = sg ? lemmaOf(sg, 'noun') : null;
      const pl = base ? run('{x:num=pl,case=nomacc,def=no}', { x: base }) : null;
      out.push(pl || `„${x}”`);
    }
    return out.join(', ');
  };
  const roleRo = (v) => {
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string' && /^\d+(?:\.\d+)?$/.test(v)) return v;   // a number said as text (an assumed count)
    if (typeof v === 'string' && v.includes(', ')) return listText(v);   // a list said as text (assumed kinds, the kinds a world can make)
    if (typeof v === 'string') return lemmaOf(v, 'noun') ?? lemmaOf(v, 'adjective');
    if (Array.isArray(v)) { const xs = v.map((x) => (x && typeof x === 'object' ? countRo(x) : null)); return xs.length && xs.every(Boolean) && (xs.length < 2 || AND) ? listRo(xs) : null; }
    if (v && typeof v === 'object' && Number.isFinite(v.n)) return countRo(v);
    if (v && typeof v === 'object' && Array.isArray(v.names) && v.names.length && (v.names.length < 2 || AND)) return listRo(v.names.map((x) => `„${x}”`));   // names of things the user gave: quoted, as they are
    return null;
  };
  return {
    lib, world, m, dictionary: dict, fold, formsOfEnglish,
    /** The dictionary lemmas the morphology reads a form as (diacritics typed away are folded): a Set, empty for a word the language does not know. */
    lemmasOf(form) {
      const [head] = lib.splitClitics(m, String(form ?? '').toLowerCase());
      return new Set(readings(head).map((r) => r.lemma));
    },
    /** Every English sense of a lemma in the dictionary rows, in their order (several rows of one lemma: așeza "sit", "arrange"); `pos` 'noun' | 'verb' | 'adj'. */
    sensesOfLemma(lemma, pos) { return (sensesOf().get(lemma) ?? []).filter((s) => !pos || s.pos === pos).map((s) => s.en); },
    /** True when the morphology reads the form as a form of a dictionary lemma (an inflection, diacritics typed away): such a word is the language's, never a typo. */
    knows(form) {
      const raw = String(form ?? '').toLowerCase();
      if (raw.length < 2) return false;
      const [head] = lib.splitClitics(m, raw);
      return readings(head).length > 0;
    },
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
     * THE TRANSLATION GLOSS (spec 05 "Glossed candidates", reviewer 2026-11-15 10:10 item 2): the English words of the senses of a Romanian form, by the dictionary (a lookup, not a reader).
     * `form` is analysed by the morphology (diacritics typed away are folded); when nothing analyses it, the one dictionary lemma within one edit (two for 7 letters or more) is taken
     * as the word meant ("punr" -> pune). Returns [{ en, pos, lemma, features, repaired? }] (every sense of every reading, in dictionary order), [] when the dictionary has nothing near.
     */
    glossWord(form, { within = null } = {}) {
      const raw = String(form ?? '').toLowerCase();
      if (raw.length < 3) return [];
      const out = [], seen = new Set();
      const add = (lemma, pos, features, repaired) => {
        for (const s of sensesOf().get(lemma) ?? []) {
          if (s.pos !== pos) continue;
          const k = `${s.en}|${features?.tense ?? ''}|${features?.num ?? ''}`;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push({ en: s.en, pos, lemma, features: features ?? {}, ...(repaired ? { repaired } : {}) });
        }
      };
      const [head] = lib.splitClitics(m, raw);
      for (const r of readings(head)) add(r.lemma, posOf(r.class), r.features, null);
      if (out.length || !within) return out;
      // a typo: the nearest lemma of the dictionary, only when exactly one is nearest
      const k = fold(head), max = k.length >= 7 ? 2 : 1;
      let best = Infinity, near = [];
      for (const lemma of sensesOf().keys()) {
        const d = within(k, fold(lemma), Math.min(max, best));
        if (d < best) { best = d; near = [lemma]; } else if (d === best && d !== Infinity) near.push(lemma);
      }
      if (near.length === 1) for (const s of sensesOf().get(near[0])) add(near[0], s.pos, {}, near[0]);
      return out;
    },
    /**
     * COMPOSED REPLIES (spec 06 "Composed replies", reviewer 2026-11-15 03:15 item 2 and 05:30): the Romanian of a reply the application composes, from its frame `say = { act, roles }`,
     * by the language world's reply templates in the catalog's key shape (`w.lang.ro.reply name= count= act= role= text=`: the same 15 names as w.lang.en.reply, one text per CLDR plural
     * category one / few / other of the role `number`; `w.lang.ro.fill template= role= lemma=` the words a template brings, such as its article) and the library's `realise`; null when
     * there is no reply of that name or a word has no Romanian lemma (the caller then goes on as before). A world's own act is said with the catalog's name that says the same thing
     * (REPLY_OF: "a diagram in the shape of a house" is done.make.shape with the kind "diagram"). Roles: an English noun or colour (its lemma by the dictionary's sense), a number, a
     * count `{ n, noun, colour? }` ("7 noduri", "o casă albastră", "20 de flori") or a list of counts. No Romanian sentence is written here.
     */
    composeRo(say) {
      if (!say?.act) return null;
      // the catalog's reply of the same meaning first; the reply of the act's own name (the catalog's, or a local one in the catalog's shape) when that one cannot be said
      // a reply that would drop a role the act gives ("7 nodes on its outline") comes after the reply of the act's own name that says it
      const mapped = REPLY_OF[say.act]?.(say.roles ?? {}), own = { name: say.act, roles: say.roles ?? {} };
      const drops = mapped?.uses && Object.keys(say.roles ?? {}).some((k) => !mapped.uses.includes(k));
      const byAct = typeof say.roles?.act === 'string' ? { name: `${say.act}.${say.roles.act}`, roles: say.roles } : null;   // a reply of an act said by <name>.<act> when the language has one (can.make: "pot face"), as a fact with a key is said by <name>.<key>
      for (const how of [byAct, ...(drops ? [own, mapped] : [mapped, own])]) { const t = how && this.reply(how); if (t) return t; }
      return null;
    },
    /**
     * A REQUEST in Romanian (composed chips, reviewer 2026-11-15 05:30): `{ act, roles }` (roles kind, thing, value, attribute, number as English words) by the catalog's request template
     * of that act whose roles are exactly the ones given (`w.lang.ro.request act= role= count= text=`, mirroring w.lang.en's act templates), or null.
     */
    request({ act, roles = {} } = {}) {
      const keys = Object.keys(roles).sort().join(' ');
      const fits = world.ofType('w.lang.ro.request').filter((x) => bare(x.attrs.act?.[0]) === act && (x.attrs.role ?? []).map(bare).sort().join(' ') === keys);
      for (const name of [...new Set(fits.map((x) => bare(x.attrs.name[0])))]) { const t = this.reply({ name, roles }, 'w.lang.ro.request'); if (t) return t; }
      return null;
    },
    /** One reply (or request) of the catalog's shape: { name, roles } -> the Romanian sentence, or null. */
    reply(how, type = 'w.lang.ro.reply') {
      const replies = world.ofType(type).filter((x) => bare(x.attrs.name?.[0]) === how.name);
      if (!replies.length) return null;
      const n = Number.isFinite(how.roles.number) ? how.roles.number : 1;
      const cat = plural(n), pick = replies.find((x) => bare(x.attrs.count?.[0]) === cat) ?? replies.find((x) => bare(x.attrs.count?.[0]) === 'other') ?? replies[0];
      const roles = {}, lemmas = new Set();
      for (const f of world.ofType('w.lang.ro.fill')) if (bare(f.attrs.template?.[0]) === how.name) roles[bare(f.attrs.role[0])] = bare(f.attrs.lemma[0]);
      const said = bare(pick.attrs.text[0]);
      for (const [k, v] of Object.entries(how.roles)) {
        if (!new RegExp(`\\{${k}[:}@]|@${k}\\}`).test(said)) continue;   // a role the language's sentence does not say needs no word ("aici" for the world's name)
        let x = roleRo(v);
        if (x == null && k === 'value' && typeof v === 'string' && new RegExp(`\\{${k}\\}`).test(said) && !new RegExp(`@${k}\\}`).test(said)) { roles[k] = `„${v}”`; continue; }   // the value of a key said as it is (no inflection, nothing agrees with it: "am presupus {value} pentru ..."): a name the dictionary has no word for is quoted, as the names of things are
        if (x == null) return null;
        roles[k] = x;
        if (typeof v === 'string') lemmas.add(k);
      }
      // ADAPTER (questions.md [LIB]): the vendored realise words a lemma only with all three features; the catalog's templates leave the defaults out ("{kind}", "{kind:num=pl}"), so the
      // missing ones are the defaults of a reply: singular, nominative-accusative, indefinite. A count, a number or a list is text already.
      const text = bare(pick.attrs.text[0]).replace(/\{(\w+)(?::([^}@]*))?(@\w+)?\}/g, (all, name, feats, agree) => {
        if (!lemmas.has(name)) return all;
        const f = Object.fromEntries(String(feats ?? '').split(',').filter(Boolean).map((x) => x.split('=')));
        const full = { num: 'sg', case: 'nomacc', def: 'no', ...f };
        return `{${name}:${Object.entries(full).map(([k, v]) => `${k}=${v}`).join(',')}${agree ?? ''}}`;
      });
      const out = run(text, roles);
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
