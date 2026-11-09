// Romanian morphology: generates inflected forms from the lexicon and indexes them by
// diacritic-insensitive key, so analysis is a table lookup (browser-safe).
import { nouns, verbs, adjectives, words, names, numberWords } from './lexicon.ro-en.mjs';
import { foldKey } from './normalize.mjs';
import { places } from './places.ro-en.mjs';
import { pluralEn, pastEn } from './inflect.en.mjs';

const index = new Map();
const nameIndex = new Map();

function add(form, analysis) {
  const k = foldKey(form);
  if (!k || form === '-') return;
  let list = index.get(k);
  if (!list) { list = []; index.set(k, list); }
  const dup = list.some((a) => a.entry === analysis.entry && a.pos === analysis.pos && a.number === analysis.number
    && a.def === analysis.def && a.gen === analysis.gen && a.tense === analysis.tense && a.person === analysis.person
    && a.gender === analysis.gender);
  if (!dup) list.push({ ...analysis, form });
}

// ---------------------------------------------------------------- nouns

export function defSingular(sg, g) {
  if (/ă$/.test(sg)) return g === 'm' ? sg + 'l' : sg.slice(0, -1) + 'a';
  if (/ea$/.test(sg)) return sg + 'ua';
  if (/a$/.test(sg)) return sg;
  if (/ie$/.test(sg) && g === 'f') return sg.slice(0, -1) + 'a';   // excursie -> excursia
  if (/e$/.test(sg)) return g === 'f' ? sg + 'a' : sg + 'le';
  if (/u$/.test(sg)) return sg + 'l';
  return sg + 'ul';
}

export function defPlural(pl, g) {
  if (g === 'm' && /i$/.test(pl)) return pl + 'i';
  return pl + 'le';
}

function genSingular(sg, g) {
  const out = [];
  if (/ă$/.test(sg)) {
    if (g === 'm') { out.push(sg + 'lui'); return out; }
    const stem = sg.slice(0, -1);
    out.push(stem + 'ei');
    if (/[cg]$/.test(stem)) out.push(stem + 'ii');
    const idx = stem.lastIndexOf('a');
    if (idx >= 0) out.push(stem.slice(0, idx) + 'e' + stem.slice(idx + 1) + 'i');
    if (idx >= 0) out.push(stem.slice(0, idx) + 'e' + stem.slice(idx + 1) + 'ei');
    if (idx >= 0) out.push(stem.slice(0, idx) + 'e' + stem.slice(idx + 1) + 'ii');
  } else if (/ea$/.test(sg)) {
    out.push(sg.slice(0, -1) + 'ei');
  } else if (/ie$/.test(sg) && g === 'f') {
    out.push(sg.slice(0, -1) + 'i', sg + 'i');   // excursii, excursiei
  } else if (/e$/.test(sg)) {
    out.push(g === 'f' ? sg.slice(0, -1) + 'ii' : sg + 'lui');
  } else if (/u$/.test(sg)) out.push(sg + 'lui');
  else if (/a$/.test(sg)) out.push(sg);
  else out.push(sg + 'ului');
  return out;
}

function indexNoun(n) {
  const g = n.g;
  const plOnly = n.flags.has('pl');
  if (!plOnly) {
    add(n.ro, { pos: 'noun', entry: n, number: 'sg', def: false, gen: false });
    add(defSingular(n.ro, g), { pos: 'noun', entry: n, number: 'sg', def: true, gen: false });
    for (const f of genSingular(n.ro, g)) add(f, { pos: 'noun', entry: n, number: 'sg', def: true, gen: true });
  }
  if (n.rop || plOnly) {
    const pl = n.rop || n.ro;
    add(pl, { pos: 'noun', entry: n, number: 'pl', def: false, gen: false });
    add(defPlural(pl, g), { pos: 'noun', entry: n, number: 'pl', def: true, gen: false });
    add(pl + 'lor', { pos: 'noun', entry: n, number: 'pl', def: true, gen: true });
  }
  for (const f of n.extra) {
    const pl = !!n.rop && f === n.rop;
    add(f, { pos: 'noun', entry: n, number: pl ? 'pl' : 'sg', def: true, gen: /(ei|ii|ului|lui)$/.test(f) });
  }
}

// ---------------------------------------------------------------- verbs

const PERSONS = [[1, 'sg'], [2, 'sg'], [3, 'sg'], [1, 'pl'], [2, 'pl'], [3, 'pl']];

function presentForms(v) {
  const p = v.pres;
  const m = /^(a|az|is):(.+)$/.exec(p);
  if (m) {
    const s = m[2];
    if (m[1] === 'a') return [s, s + 'i', s + 'ă', s + 'ăm', s + 'ați', s + 'ă'];
    if (m[1] === 'az' && /i$/.test(s)) return [s + 'ez', s + 'ezi', s + 'ază', s + 'em', s + 'ați', s + 'ază'];   // evidenția: evidențiez, evidențiază
    if (m[1] === 'az') return [s + 'ez', s + 'ezi', s + 'ează', s + 'ăm', s + 'ați', s + 'ează'];
    return [s + 'esc', s + 'ești', s + 'ește', s + 'im', s + 'iți', s + 'esc'];
  }
  return p.split(/\s+/);
}

function imperfectBase(v) {
  if (v.flags.impf) return v.flags.impf;
  const inf = v.inf;
  if (/(a|ea)$/.test(inf)) return inf;
  if (/ie$/.test(inf)) return inf.slice(0, -1) + 'a';
  if (/e$/.test(inf)) return inf.slice(0, -1) + 'ea';
  if (/i$/.test(inf)) return inf.slice(0, -1) + 'ea';
  return inf;
}

const IMPF_OVERRIDE = { fi: 'era', da: 'dădea', sta: 'stătea', face: 'făcea', ști: 'știa', vrea: 'voia', coace: 'cocea' };

function subjunctiveThird(form) {
  const out = [];
  if (/ează$/.test(form)) out.push(form.slice(0, -4) + 'eze');
  else if (/ește$/.test(form)) out.push(form.slice(0, -4) + 'ească');
  else if (/e$/.test(form) && !/[aeiou]e$/.test(form)) out.push(form.slice(0, -1) + 'ă');
  else if (/ă$/.test(form)) {
    const a = form.slice(0, -1) + 'e';
    out.push(a);
    const idx = form.slice(0, -1).lastIndexOf('ă');
    if (idx >= 0) out.push(a.slice(0, idx) + 'e' + a.slice(idx + 1));
  }
  return out;
}

function indexVerb(v) {
  const forms = presentForms(v);
  forms.forEach((f, i) => {
    if (f === '-') return;
    add(f, { pos: 'verb', entry: v, tense: 'pres', person: PERSONS[i][0], number: PERSONS[i][1] });
  });
  if (v.flags.alt3) add(v.flags.alt3, { pos: 'verb', entry: v, tense: 'pres', person: 3, number: 'sg' });
  add(v.inf, { pos: 'verb', entry: v, tense: 'inf', person: 3, number: 'sg' });
  // imperfect
  if (v.pres.trim() !== '- - plouă - - -' && !v.flags.imps) {
    const X = IMPF_OVERRIDE[v.inf] || imperfectBase(v);
    const impf = [X + 'm', X + 'i', X, X + 'm', X + 'ți', X + 'u'];
    impf.forEach((f, i) => add(f, { pos: 'verb', entry: v, tense: 'impf', person: PERSONS[i][0], number: PERSONS[i][1] }));
    if (v.inf === 'fi') { add('eram', { pos: 'verb', entry: v, tense: 'impf', person: 1, number: 'sg' }); add('eram', { pos: 'verb', entry: v, tense: 'impf', person: 1, number: 'pl' }); }
  }
  if (v.part) add(v.part, { pos: 'verb', entry: v, tense: 'part', person: 3, number: 'sg' });
  // imperative
  if (v.flags.imp) {
    const f3 = forms[2];
    const own = v.inf === 'fi' || v.inf === 'deveni';   // their imperatives (fii, devino) are listed in imp=; "este" is never an order
    if (f3 && f3 !== '-' && !own) add(f3, { pos: 'verb', entry: v, tense: 'imp', person: 2, number: 'sg' });
    if (forms[4] && forms[4] !== '-' && !own) add(forms[4], { pos: 'verb', entry: v, tense: 'imp', person: 2, number: 'pl' });
    if (typeof v.flags.imp === 'string') {
      v.flags.imp.split(',').forEach((f, i) => add(f, { pos: 'verb', entry: v, tense: 'imp', person: 2, number: i === 0 ? 'sg' : 'pl' }));
    }
  }
  // subjunctive 3rd person
  const f3 = forms[2];
  if (v.flags.sj) { add(v.flags.sj, { pos: 'verb', entry: v, tense: 'subj', person: 3, number: 'sg' }); add(v.flags.sj, { pos: 'verb', entry: v, tense: 'subj', person: 3, number: 'pl' }); }
  if (f3 && f3 !== '-') {
    for (const f of subjunctiveThird(f3).filter((x) => x.length > 2)) {
      add(f, { pos: 'verb', entry: v, tense: 'subj', person: 3, number: 'sg' });
      add(f, { pos: 'verb', entry: v, tense: 'subj', person: 3, number: 'pl' });
    }
  }
}

/** English forms of a lexicon verb. */
export function enVerb(entry) {
  const base = entry.en;
  const v = {
    base,
    past: entry.past || pastEn(base),
    pp: entry.pp || entry.past || pastEn(base),
  };
  if (entry.flags.mod) v.modal = entry.flags.mod;
  if (entry.flags.post) v.post = entry.flags.post;
  return v;
}

// ---------------------------------------------------------------- adjectives

function indexAdj(a) {
  const f = a.forms;
  add(f.ms, { pos: 'adj', entry: a, gender: 'm', number: 'sg' });
  add(f.fs, { pos: 'adj', entry: a, gender: 'f', number: 'sg' });
  add(f.mp, { pos: 'adj', entry: a, gender: 'm', number: 'pl' });
  add(f.fp, { pos: 'adj', entry: a, gender: 'f', number: 'pl' });
}

// ---------------------------------------------------------------- function words, names, numbers

function indexWords() {
  for (const w of words) for (const k of w.keys) add(k, { pos: 'func', fpos: w.pos, entry: w });
  for (const n of names) nameIndex.set(foldKey(n.name), n);
  for (const nw of numberWords) for (const k of nw.keys) add(k, { pos: 'numw', entry: nw, value: nw.value });
}

for (const n of nouns) indexNoun(n);
for (const v of verbs) indexVerb(v);
for (const a of adjectives) indexAdj(a);
indexWords();

export const CLITICS = new Set(['mi', 'ti', 'i', 'l', 'o', 'ne', 'va', 'le', 'ma', 'te', 'se', 'imi', 'iti', 'isi']);

/** All analyses of a (folded) word key. Handles verb+enclitic forms (amintește-mi). */
export function analyze(key) {
  const direct = index.get(key);
  if (direct) return direct;
  const h = key.lastIndexOf('-');
  if (h > 0) {
    const head = key.slice(0, h);
    const tail = key.slice(h + 1);
    if (CLITICS.has(tail)) {
      const base = index.get(head);
      if (base) {
        const verbsOnly = base.filter((a) => a.pos === 'verb' && (a.tense === 'imp' || a.tense === 'pres' || a.tense === 'inf'));
        if (verbsOnly.length) return verbsOnly.map((a) => ({ ...a, enclitic: tail, tense: a.tense === 'pres' ? 'imp' : a.tense }));
      }
    }
  }
  return [];
}

/**
 * Analyses of a raw word. When the exact surface form (with its diacritics) matches some
 * analyses, only those are returned: "pisică" is indefinite, "pisica" is definite.
 */
export function analyzeRaw(raw, diaFree = false) {
  const key = foldKey(raw);
  const list = analyze(key);
  if (list.length < 2) return list;
  const lower = raw.toLowerCase().normalize('NFC');
  let exact = list.filter((a) => a.form && a.form.normalize('NFC') === lower);
  if (!exact.length) return list;
  if (diaFree) {
    // text typed without diacritics: "costa" is more likely the present "costă" than the imperfect
    const pres = list.filter((a) => a.pos === 'verb' && a.tense === 'pres' && !exact.includes(a));
    if (pres.length && exact.some((a) => a.pos === 'verb' && (a.tense === 'impf' || a.tense === 'inf'))) {
      exact = exact.filter((a) => !(a.pos === 'verb' && (a.tense === 'impf' || a.tense === 'inf'))).concat(pres);
    }
  }
  return exact;
}

export function nameEntry(key) { return nameIndex.get(key) || null; }
export function isKnownName(key) { return nameIndex.has(key); }

const placeIndex = new Map();
for (const pl of places) {
  for (const f of pl.nom) placeIndex.set(foldKey(f), { en: pl.en, gen: false });
  for (const f of pl.gen) placeIndex.set(foldKey(f), { en: pl.en, gen: true });
}
/** A place name (country, continent, city) in any Romanian form: { en, gen } or null. */
export function placeOf(key) { return placeIndex.get(key) || null; }

/** Noun lemma from any definite/plural/case form: mărul, merele, merelor, mere -> măr. */
export function lemmaOfNoun(word) {
  const k = foldKey(word);
  const a = (index.get(k) || []).find((x) => x.pos === 'noun');
  if (a) return { lemma: a.entry.ro, number: a.number, def: a.def, gen: a.gen, entry: a.entry };
  // fallback: strip suffixes, look for a lexicon singular/plural key
  const SUFFIXES = ['ilor', 'elor', 'lor', 'ului', 'lui', 'ele', 'ile', 'ul', 'le', 'ii', 'ei', 'a', 'i', 'e'];
  for (const s of SUFFIXES) {
    if (k.endsWith(s) && k.length - s.length >= 2) {
      const stem = k.slice(0, -s.length);
      for (const cand of [stem, stem + 'a', stem + 'e', stem + 'i', stem + 'u']) {
        const hit = (index.get(cand) || []).find((x) => x.pos === 'noun' && !x.def);
        if (hit) return { lemma: hit.entry.ro, number: hit.number, def: true, gen: false, entry: hit.entry, guessed: true };
      }
    }
  }
  return null;
}

/** Adjective lemma (masculine singular) from any agreement form. */
export function lemmaOfAdj(word) {
  const a = (index.get(foldKey(word)) || []).find((x) => x.pos === 'adj');
  return a ? { lemma: a.entry.ro, gender: a.gender, number: a.number, entry: a.entry } : null;
}

/** Verb forms -> [{lemma, person, number, tense}] for lexicon verbs. */
export function analyzeVerbForm(word, prevKey = null) {
  const out = [];
  if (prevKey === 'a' || prevKey === 'sa') { /* infinitive/subjunctive context handled by the caller */ }
  for (const a of analyze(foldKey(word))) {
    if (a.pos === 'verb') out.push({ lemma: a.entry.inf, person: a.person, number: a.number, tense: a.tense, entry: a.entry });
  }
  return out;
}

/** Strip adjective agreement: frumoasă, frumoși -> frumos. */
export function stripAdjAgreement(word) { return lemmaOfAdj(word)?.lemma ?? null; }

// ---------------------------------------------------------------- surface generation (for en -> ro)

export function nounSurface(entry, { number = 'sg', def = false } = {}) {
  if (number === 'pl' || entry.flags.has('pl')) {
    const pl = entry.rop || entry.ro;
    return def ? defPlural(pl, entry.g) : pl;
  }
  return def ? defSingular(entry.ro, entry.g) : entry.ro;
}

/** Genitive/dative form of a noun (definite): copiilor, fetei, mărului. */
export function nounGenDat(entry, number = 'sg') {
  if (number === 'pl' || entry.flags.has('pl')) return (entry.rop || entry.ro) + 'lor';
  const extra = entry.extra.find((f) => /(ei|ii|ului|lui)$/.test(f));
  return extra || genSingular(entry.ro, entry.g)[0];
}

export function verbPresent(entry, person, number) {
  const f = presentForms(entry)[PERSONS.findIndex(([p, n]) => p === person && n === number)];
  return f && f !== '-' ? f : presentForms(entry).find((x) => x !== '-');
}

export function verbImperfectForm(entry, person, number) {
  const X = IMPF_OVERRIDE[entry.inf] || imperfectBase(entry);
  return [X + 'm', X + 'i', X, X + 'm', X + 'ți', X + 'u'][PERSONS.findIndex(([p, n]) => p === person && n === number)];
}

export function adjSurface(entry, gender, number) {
  const f = entry.forms;
  return number === 'pl' ? (gender === 'f' ? f.fp : f.mp) : (gender === 'f' ? f.fs : f.ms);
}

// ---------------------------------------------------------------- number words

const UNITS = { unu: 1, una: 1, unul: 1, doi: 2, doua: 2, trei: 3, patru: 4, cinci: 5, sase: 6, sapte: 7, opt: 8, noua: 9 };
const TEENS = { zece: 10, unsprezece: 11, unspe: 11, doisprezece: 12, douasprezece: 12, douaspe: 12, treisprezece: 13, treispe: 13,
  paisprezece: 14, paispe: 14, cincisprezece: 15, cincispe: 15, saisprezece: 16, saispe: 16, saptesprezece: 17, saptespe: 17,
  optsprezece: 18, optspe: 18, nouasprezece: 19, nouaspe: 19 };
const TENS = { douazeci: 20, treizeci: 30, patruzeci: 40, cincizeci: 50, saizeci: 60, saptezeci: 70, optzeci: 80, nouazeci: 90 };

function parseBelow100(keys, i) {
  const k = keys[i];
  if (k === undefined) return null;
  if (k in TENS) {
    if (keys[i + 1] === 'si' && keys[i + 2] in UNITS && keys[i + 2] !== 'unul') return { value: TENS[k] + UNITS[keys[i + 2]], len: 3 };
    return { value: TENS[k], len: 1 };
  }
  if (k in TEENS) return { value: TEENS[k], len: 1 };
  if (k in UNITS) return { value: UNITS[k], len: 1 };
  if (k === 'zero') return { value: 0, len: 1 };
  return null;
}

/**
 * Parse a Romanian number written in words (0-1000) at keys[i]. Keys are folded words.
 * Returns {value, len} or null. "o"/"un" are numbers only before sută/mie.
 */
export function parseNumberAt(keys, i) {
  const k = keys[i];
  if (k === undefined) return null;
  if ((k === 'o' || k === 'un') && keys[i + 1] === 'mie') return { value: 1000, len: 2 };
  if (k === 'mie' && i >= 0 && false) return null;
  let value = 0;
  let len = 0;
  if ((k === 'o' || k === 'un') && keys[i + 1] === 'suta') { value = 100; len = 2; }
  else if (k in UNITS && keys[i] !== 'unu' && keys[i] !== 'una' && keys[i] !== 'unul' && keys[i + 1] === 'sute') { value = UNITS[k] * 100; len = 2; }
  else if (k === 'suta') { value = 100; len = 1; }
  if (len) {
    let j = i + len;
    if (keys[j] === 'si' && parseBelow100(keys, j + 1)) j++;
    const rest = parseBelow100(keys, j);
    if (rest && rest.value > 0) return { value: value + rest.value, len: j - i + rest.len };
    return { value, len };
  }
  const b = parseBelow100(keys, i);
  return b;
}

export function lexiconStats() {
  return { nouns: nouns.length, verbs: verbs.length, adjectives: adjectives.length, words: words.length, names: names.length, numbers: numberWords.length, forms: index.size };
}

export { pluralEn };
