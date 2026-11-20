// SPDX-License-Identifier: AGPL-3.0-only
/**
 * ONE SOURCE OF ROMANIAN -> ENGLISH WORDS (reviewer 2026-11-16 03:30; spec 05 "One lookup of the source words").
 *
 * The rules translator (ro-en.mjs), the dictionary gloss (index.mjs `glossWord`) and the sense candidates (candidates.mjs) ask this one lookup. Its order:
 *   1. the open world instance's own words: a sense that is an English word of the open world (`prefer`, the host's Set of them) comes first among the other senses, and wins a tie
 *      of the reading against the translator's sense (the door);
 *   2. the rules translator's entries (lexicon.ro-en.mjs through morphology.ro.mjs);
 *   3. the dictionary (the language world w.lang.ro through src/lang/ro.mjs: the catalog's rows, then the local rows).
 * A form the translator knows is analysed as the translator analyses it; a form only the dictionary knows is analysed by the dictionary's morphology into the translator's shape, so it
 * is translated like any other word (a candidate, never a Romanian word left in the English). Every analysed form has its SENSE LIST: the English words of its lemmas, in the order
 * above. Which sense a sentence means is not decided here: the translator takes the first, and the candidates of the other senses go to the reading (candidates.mjs).
 * No word is listed here. Browser-safe (no node:*).
 */
import { analyzeRaw } from './morphology.ro.mjs?v=8bcf5dc68f';
import { foldKey } from './normalize.mjs?v=6d473eb091';
import { langRoNow } from './frames-ro.mjs?v=49c1002f5b';
import { pastEn } from './inflect.en.mjs?v=5b2e62d57a';

const CONTENT = new Set(['noun', 'verb', 'adj']);
const TENSE = { imper: 'imp' };   // the library's cell names that the translator calls otherwise

/** Entries of the dictionary's lemmas in the translator's shape, made once per lemma and sense (equal entries stay equal: the translator compares them). */
const entryCache = new Map();
function entryOf(pos, lemma, en, g) {
  const k = `${pos}|${lemma}|${en}`;
  let e = entryCache.get(k);
  if (!e) {
    if (pos === 'verb') e = { pos, inf: lemma, en, past: null, pp: null, pres: '', part: null, flags: { t: true, imp: true }, dictionary: true };
    else if (pos === 'adj') e = { pos, ro: lemma, en, forms: { ms: lemma, fs: lemma, mp: lemma, fp: lemma }, comp: null, sup: null, dictionary: true };
    else e = { pos, ro: lemma, rop: null, en, enp: null, g: g ?? 'n', flags: new Set(), extra: [], dictionary: true };
    entryCache.set(k, e);
  }
  return e;
}

const dictCache = new Map();
/** The language world's readings of one form (src/lang/ro.mjs `analyse`), [] when it is not open or does not know the form. */
function dictionaryReadings(raw) {
  const ro = langRoNow();
  if (!ro?.analyse) return [];
  const lower = String(raw ?? '').toLowerCase();
  if (dictCache.has(lower)) return dictCache.get(lower);
  let out = [];
  try { out = ro.analyse(foldKey(lower), lower) ?? []; } catch { out = []; }
  if (dictCache.size > 4000) dictCache.clear();
  dictCache.set(lower, out);
  return out;
}

/** True when the language world's dictionary reads the form as a content word (a noun, a verb, an adjective). */
export const hasDictionaryReading = (raw) => dictionaryReadings(raw).some((r) => CONTENT.has(r.pos));

const lemmaOf = (a) => (a.pos === 'verb' ? a.entry.inf : a.entry.ro);
const keyOf = (a) => `${a.pos}|${String(lemmaOf(a)).toLowerCase().normalize('NFC')}`;   // fată and față are two lemmas
/** Every English sense of a lemma in the dictionary (several rows of one lemma: "așeza" sit / arrange). */
const dictionarySenses = (lemma, pos) => { const ro = langRoNow(); try { return ro?.sensesOfLemma?.(lemma, pos) ?? []; } catch { return []; } };

/** The translator's analysis of a dictionary reading with the sense `en` (the library's features in the translator's names). */
function asAnalysis(r, en) {
  const pos = r.pos, entry = entryOf(pos, lemmaOf(r), en, r.entry.g);
  if (pos === 'verb') return { pos, entry, tense: TENSE[r.tense] ?? r.tense, person: r.person || 3, number: r.number ?? 'sg', form: r.form, ...(r.enclitic ? { enclitic: r.enclitic } : {}), dictionary: true };
  if (pos === 'adj') return { pos, entry, gender: r.gender ?? 'm', number: r.number ?? 'sg', form: r.form, dictionary: true };
  return { pos, entry, number: r.number ?? 'sg', def: !!r.def, gen: !!r.gen, form: r.form, dictionary: true };
}

/** A translator's analysis with another English sense of its lemma (the English forms then follow the regular rules). */
const senseCache = new Map();
function withSense(a, en) {
  if (a.entry.en === en) return a;
  let entry = senseCache.get(a.entry)?.get(en);
  if (!entry) {
    entry = { ...a.entry, en, ...(a.pos === 'verb' ? { past: null, pp: null } : a.pos === 'noun' ? { enp: null } : { comp: null, sup: null }) };
    (senseCache.get(a.entry) ?? senseCache.set(a.entry, new Map()).get(a.entry)).set(en, entry);
  }
  return { ...a, entry };
}

/** True when `en` is a word of the open world (a Set of lower-case English words; a regular plural names its singular). */
const preferred = (prefer, en) => {
  if (!prefer?.size || !en) return false;
  const w = String(en).toLowerCase();
  return prefer.has(w) || (w.length > 3 && prefer.has(w.replace(/(?:es|s)$/, '')));
};

/**
 * THE LOOKUP: the senses of one Romanian form, in the order of the sources. Returns [{ en, source: 'world' | 'rules' | 'dictionary', analyses }]: each option is the whole reading of
 * the form with that sense (every part of speech the form has: "roșie" stays an adjective and a noun; the lemma of the sense carries it), in the translator's shape. The first option
 * is the reading the translator takes when nothing else is asked. [] for a form no source knows.
 * `diaFree`: the message was typed without diacritics (the translator's choice among exact spellings); `prefer`: the open world's English words (a Set), whose senses come first;
 * `dictionary: false`: a form the translator has no entry for gets no dictionary reading (the translator's first pass: words it handles by itself, "a", "numit", stay its own).
 */
export function lookupRo(raw, { diaFree = false, prefer = null, dictionary = true } = {}) {
  const rules = analyzeRaw(raw, diaFree);
  const content = rules.filter((x) => CONTENT.has(x.pos)), other = rules.filter((x) => !CONTENT.has(x.pos));
  // the readings grouped by lemma and part of speech: { key, pos, dict, analyses, senses: [{ en, source }] }
  const groups = [];
  const groupOf = (a, dict) => { const key = keyOf(a); let g = groups.find((x) => x.key === key); if (!g) groups.push(g = { key, pos: a.pos, dict, analyses: [], senses: [] }); return g; };
  for (const a of content) {
    const g = groupOf(a, false);
    g.analyses.push(a);
    if (!g.senses.length) g.senses = [...new Set([a.entry.en, ...dictionarySenses(lemmaOf(a), a.pos)])].map((en) => ({ en, source: en === a.entry.en ? 'rules' : 'dictionary' }));
  }
  // the dictionary's readings of lemmas the translator does not have; a form the translator reads as a function word, a number or a name keeps its own reading only
  if (!other.length) {
    for (const r of dictionaryReadings(raw)) {
      if (!CONTENT.has(r.pos) || content.some((a) => keyOf(a) === keyOf(r))) continue;
      if (!content.length && !dictionary) continue;   // a form the translator has no entry for is read by the dictionary only when the caller asks (ro-en.mjs: the forms its first pass left)
      const g = groupOf(r, true);
      g.analyses.push(r);
      if (!g.senses.length) { const ss = dictionarySenses(lemmaOf(r), r.pos); g.senses = (ss.length ? ss : [r.entry.en]).map((en) => ({ en, source: 'dictionary' })); }
    }
  }
  if (!groups.length) return other.length ? [{ en: null, source: 'rules', analyses: other }] : [];
  // the default reading: the translator's lemmas with their first sense; for a form the translator does not know, every dictionary lemma with its first sense
  const ruleGroups = groups.filter((g) => !g.dict);
  const base = ruleGroups.length ? ruleGroups : groups;
  // a participle only the dictionary knows is also an adjective of its English past participle ("un cerc numit gamma": a circle called gamma; "ai exagerat" stays a verb form)
  const render = (g, en) => g.analyses.flatMap((a) => (!g.dict ? [withSense(a, en)] : a.pos === 'verb' && a.tense === 'part'
    ? [{ pos: 'adj', entry: entryOf('adj', a.entry.inf, pastEn(en)), gender: 'm', number: 'sg', form: a.form, dictionary: true }] : [asAnalysis(a, en)]));
  // the reading with one sense chosen: the default reading, where the chosen lemma takes the place of the default lemmas of its part of speech
  const readingWith = (chosen, en) => {
    const keep = base.includes(chosen) ? base.filter((g) => g !== chosen) : base.filter((g) => g.pos !== chosen.pos);
    return [...render(chosen, en), ...keep.flatMap((g) => render(g, g.senses[0].en)), ...other];
  };
  const options = [], seen = new Set();
  const push = (g, s) => { if (seen.has(s.en)) return; seen.add(s.en); options.push({ en: s.en, source: s.source, analyses: readingWith(g, s.en) }); };
  // the default: the translator's own analyses as it orders them (or every dictionary lemma with its first sense); its senses are one option, not one per part of speech
  push(base[0], base[0].senses[0]);
  options[0].analyses = ruleGroups.length ? [...rules] : [...base.flatMap((g) => render(g, g.senses[0].en)), ...other];
  for (const g of base) seen.add(g.senses[0].en);
  for (const g of groups) for (const s of g.senses) push(g, s);
  // 1. the open world's words first among the other senses (stable: the sources' order stays within each group). The default reading stays the translator's: a sense of the open
  // world that reads as well as it wins the tie at the door (src/dialog/index.mjs `_doorEnglish`), so that a word the translator handles by its own reading keeps it
  const rest = options.slice(1), top = rest.filter((o) => preferred(prefer, o.en));
  return [options[0], ...top.map((o) => ({ ...o, source: 'world' })), ...rest.filter((o) => !top.includes(o))];
}

/** The English senses of a form, in the lookup's order (the gloss): [{ en, lemma, pos, source, features: { tense, num } }]. */
export function sensesRo(raw, opts = {}) {
  const out = [];
  for (const o of lookupRo(raw, opts)) {
    const a = o.analyses.find((x) => CONTENT.has(x.pos) && x.entry.en === o.en) ?? o.analyses.find((x) => CONTENT.has(x.pos));
    if (o.en && a) out.push({ en: a.entry.dictionary && a.pos === 'adj' ? a.entry.en : o.en, lemma: a.pos === 'adj' && a.entry.dictionary ? a.entry.ro : lemmaOf(a), pos: a.pos, source: o.source, ...(a.pos === 'verb' && (a.entry.pp || a.entry.past) ? { pp: a.entry.pp || a.entry.past } : {}), features: { tense: a.tense ?? null, num: a.number === 'pl' ? 'pl' : 'sg' } });
  }
  return out;
}
