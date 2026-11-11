// English -> Romanian translation of short answers (rule based, browser-safe).
// Reverse use of the bilingual lexicon plus a small clause generator and answer frames.
import { tokenize, splitSentences, foldKey } from './normalize.mjs?v=136a228c61';
import * as M from './morphology.ro.mjs?v=c18835e9d6';
import * as L from './lexicon.ro-en.mjs?v=0823d91a10';
import * as E from './inflect.en.mjs?v=bb4799b9ff';
import { placeRo, MULTIWORD_EN } from './places.ro-en.mjs?v=97dc087c2a';
import { translateReplySentence } from './replies.en-ro.mjs?v=a401033f57';
import { CANONICAL_RO } from './canonical.en-ro.mjs?v=2b71c7e520';
import { budget } from '../dialog/budget.mjs?v=123c3e1329';

// ------------------------------------------------------------------ reverse lexicon

const nounMap = new Map();
const verbMap = new Map();
const adjMap = new Map();
const wordMap = new Map();

function putFirst(map, key, val) { if (!map.has(key)) map.set(key, val); }

for (const n of L.nouns) {
  putFirst(nounMap, n.en.toLowerCase(), { entry: n, number: 'sg' });
  putFirst(nounMap, (n.enp || E.pluralEn(n.en)).toLowerCase(), { entry: n, number: n.flags.has('mass') ? 'sg' : 'pl' });
}
for (const v of L.verbs) {
  if (v.flags.post || v.flags.exp) continue;
  const base = v.en;
  const past = v.past || E.pastEn(base);
  const pp = v.pp || past;
  putFirst(verbMap, base, { entry: v, form: 'base' });
  putFirst(verbMap, E.thirdPersonEn(base), { entry: v, form: 'third' });
  putFirst(verbMap, past, { entry: v, form: 'past' });
  putFirst(verbMap, pp, { entry: v, form: 'pp' });
  putFirst(verbMap, E.ingEn(base), { entry: v, form: 'ing' });
}
for (const a of L.adjectives) putFirst(adjMap, a.en, a);
for (const a of L.adjectives) { if (a.comp) putFirst(adjMap, a.comp, a); }
for (const w of L.words) putFirst(wordMap, w.en.toLowerCase(), w);
const ALIASES = { tell: ['spune', 'told'], get: ['primi', 'got'], remove: ['șterge', 'removed'], check: ['căuta', 'checked'] };
for (const [en, [inf, past]] of Object.entries(ALIASES)) {
  const v = L.verbs.find((x) => x.inf === inf);
  if (!v) continue;
  putFirst(verbMap, en, { entry: v, form: 'base' });
  putFirst(verbMap, E.thirdPersonEn(en), { entry: v, form: 'third' });
  putFirst(verbMap, past, { entry: v, form: 'past' });
  putFirst(verbMap, E.ingEn(en), { entry: v, form: 'ing' });
}
verbMap.set('got', { entry: L.verbs.find((x) => x.inf === 'primi'), form: 'past' });

// ------------------------------------------------------------------ small static tables

const CONTRACTIONS = {
  "don't": ['do', 'not'], "doesn't": ['does', 'not'], "didn't": ['did', 'not'], "isn't": ['is', 'not'], "aren't": ['are', 'not'],
  "wasn't": ['was', 'not'], "weren't": ['were', 'not'], "can't": ['can', 'not'], cannot: ['can', 'not'], "won't": ['will', 'not'],
  "haven't": ['have', 'not'], "hasn't": ['has', 'not'], "hadn't": ['had', 'not'], "mustn't": ['must', 'not'], "couldn't": ['could', 'not'],
  "i'm": ['i', 'am'], "you're": ['you', 'are'], "we're": ['we', 'are'], "they're": ['they', 'are'], "he's": ['he', 'is'], "she's": ['she', 'is'],
  "it's": ['it', 'is'], "that's": ['that', 'is'], "what's": ['what', 'is'], "there's": ['there', 'is'], "i've": ['i', 'have'], "you've": ['you', 'have'],
  "we've": ['we', 'have'], "they've": ['they', 'have'], "i'll": ['i', 'will'], "you'll": ['you', 'will'], "we'll": ['we', 'will'],
  "they'll": ['they', 'will'], "he'll": ['he', 'will'], "she'll": ['she', 'will'], "it'll": ['it', 'will'], "let's": ['let', 'us'],
};

const PRON_EN = {
  i: { person: 1, number: 'sg', acc: 'mă', dat: 'îmi', subj: true }, me: { person: 1, number: 'sg', acc: 'mă', dat: 'îmi' },
  you: { person: 2, number: 'sg', acc: 'te', dat: 'îți', subj: true },
  he: { person: 3, number: 'sg', acc: 'îl', dat: 'îi', subj: true, g: 'm' }, him: { person: 3, number: 'sg', acc: 'îl', dat: 'îi', g: 'm' },
  she: { person: 3, number: 'sg', acc: 'o', dat: 'îi', subj: true, g: 'f' }, her: { person: 3, number: 'sg', acc: 'o', dat: 'îi', g: 'f', poss: true },
  it: { person: 3, number: 'sg', acc: 'îl', dat: 'îi', subj: true, g: 'm' },
  we: { person: 1, number: 'pl', acc: 'ne', dat: 'ne', subj: true }, us: { person: 1, number: 'pl', acc: 'ne', dat: 'ne' },
  they: { person: 3, number: 'pl', acc: 'îi', dat: 'le', subj: true }, them: { person: 3, number: 'pl', acc: 'îi', dat: 'le' },
};
const POSS_EN = {
  my: { sg: { m: 'meu', f: 'mea' }, pl: { m: 'mei', f: 'mele' } },
  your: { sg: { m: 'tău', f: 'ta' }, pl: { m: 'tăi', f: 'tale' } },
  our: { sg: { m: 'nostru', f: 'noastră' }, pl: { m: 'noștri', f: 'noastre' } },
  his: { inv: 'lui' }, her: { inv: 'ei' }, its: { inv: 'lui' }, their: { inv: 'lor' },
};
const WH_EN = {
  who: 'cine', what: 'ce', which: 'care', where: 'unde', when: 'când', why: 'de ce', how: 'cum',
};
const PREP_EN = {
  in: 'în', on: 'pe', at: 'la', from: 'din', of: 'de', with: 'cu', without: 'fără', for: 'pentru', toward: 'spre', between: 'între',
  under: 'sub', over: 'peste', after: 'după', before: 'înainte de', about: 'despre', through: 'prin', until: 'până la', into: 'în', near: 'lângă',
  'next to': 'lângă', like: 'ca', to: 'la',
};
const AUX_ENS = new Set(['do', 'does', 'did', 'will', 'would', 'can', 'could', 'must', 'should', 'is', 'are', 'am', 'was', 'were', 'has', 'have', 'had']);
const BE = new Set(['is', 'are', 'am', 'was', 'were']);
const HAVE = new Set(['has', 'have', 'had']);
const DET_EN = new Set(['a', 'an', 'the', 'some', 'any', 'no', 'this', 'that', 'these', 'those', 'each', 'every', 'all', 'both', 'many', 'much', 'few', 'little', 'more', 'another', 'other']);
const NUM_UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const AUX_RO = { 1: { sg: 'am', pl: 'am' }, 2: { sg: 'ai', pl: 'ați' }, 3: { sg: 'a', pl: 'au' } };
const FUT_RO = { 1: { sg: 'voi', pl: 'vom' }, 2: { sg: 'vei', pl: 'veți' }, 3: { sg: 'va', pl: 'vor' } };

// ------------------------------------------------------------------ answer frames (en -> ro)
// pattern elements: literal English words (lowercase, | for alternatives), {n} number, {name} name, {rest}.

const FRAMES = [
  { p: 'hello', out: 'Bună' }, { p: 'hi', out: 'Salut' }, { p: 'good morning', out: 'Bună dimineața' }, { p: 'good evening', out: 'Bună seara' },
  { p: 'good night', out: 'Noapte bună' }, { p: 'goodbye|bye', out: 'La revedere' }, { p: 'thank you', out: 'Mulțumesc' }, { p: 'thanks', out: 'Mulțumesc' },
  { p: 'you are welcome', out: 'Cu plăcere' }, { p: 'please', out: 'te rog' }, { p: 'sorry', out: 'Scuze' }, { p: 'yes', out: 'Da' },
  { p: 'what is your name', out: 'Cum te cheamă' }, { p: 'my name is {name}', out: 'Mă cheamă {name}' }, { p: 'what is my name', out: 'Cum mă cheamă' },
  { p: 'what time is it', out: 'Cât e ceasul' }, { p: 'it is {n} o\'clock', out: 'Este ora {n}' }, { p: 'how are you', out: 'Ce mai faci' },
  { p: 'i am {n} years old', out: 'Am {n} ani' }, { p: 'how old are you', out: 'Câți ani ai' },
  { p: 'what color is {np}', out: 'Ce culoare are {np}' }, { p: 'what color are {np}', out: 'Ce culoare au {np}' },
  { p: 'what shape is {np}', out: 'Ce formă are {np}' }, { p: 'what is {np}', out: 'Ce este {np}' },
  { p: 'i do not know', out: 'Nu știu' }, { p: 'i do not understand', out: 'Nu înțeleg' },
];

// ------------------------------------------------------------------ helpers

const piece = (ro, tok, extra = {}) => ({ ro, src: tok ? [tok.start, tok.end] : null, ...extra });
const span = (ro, s, e, extra = {}) => ({ ro, src: [s, e], ...extra });

function expandTokens(toks) {
  const out = [];
  for (const t of toks) {
    if (t.kind === 'word') {
      const c = CONTRACTIONS[t.key] || CONTRACTIONS[t.key.replace(/’/g, "'")];
      if (c) { for (const w of c) out.push({ ...t, raw: w, key: w, expanded: true }); continue; }
      const poss = /^(.+)'s$/.exec(t.raw);
      if (poss && t.isCap) { out.push({ ...t, raw: poss[1], key: foldKey(poss[1]), possessive: true }); continue; }
    }
    out.push(t);
  }
  return out;
}

function mergeNumberWords(toks) {
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    budget.tick('en-ro.mergeNumberWords');
    const t = toks[i];
    if (t.kind === 'word' && t.key in NUM_UNITS && !(t.key === 'one' && toks[i + 1] && /^(of|is)$/.test(toks[i + 1].key))) {
      let v = NUM_UNITS[t.key];
      let j = i;
      if (v >= 20 && v % 10 === 0 && toks[j + 1] && toks[j + 1].key in NUM_UNITS && NUM_UNITS[toks[j + 1].key] < 10 && NUM_UNITS[toks[j + 1].key] > 0) { v += NUM_UNITS[toks[j + 1].key]; j++; }
      if (toks[j + 1] && toks[j + 1].key === 'hundred') { v = (v || 1) * 100; j++; if (toks[j + 1] && toks[j + 1].key in NUM_UNITS) { v += NUM_UNITS[toks[j + 1].key]; j++; } }
      out.push({ kind: 'num', raw: String(v), value: String(v), key: String(v), start: t.start, end: toks[j].end });
      i = j; continue;
    }
    out.push(t);
  }
  return out;
}

const genderFor = (entry, number) => (entry.g === 'n' ? (number === 'pl' ? 'f' : 'm') : entry.g === 'f' ? 'f' : 'm');

function nameDative(name) {
  const n = L.names.find((x) => x.name === name);
  const fem = n ? n.gender === 'f' : /a$/.test(name);
  if (!fem) return `lui ${name}`;
  if (/ea$/.test(name)) return name.slice(0, -1) + 'i';
  if (/[ie]a$/.test(name)) return name.slice(0, -1) + 'ei';
  if (/a$/.test(name)) return name.slice(0, -1) + 'ei';
  return `lui ${name}`;
}

// ------------------------------------------------------------------ English item parsing

function parseItems(toks, ctx) {
  const items = [];
  let i = 0;
  const unknown = (t) => { ctx.unknown.push({ word: t.raw, span: [t.start, t.end] }); ctx.content++; };
  while (i < toks.length) {
    budget.tick('translate.parse');
    const t = toks[i];
    if (t.kind === 'punct') { items.push({ t: t.raw === ',' ? 'comma' : 'punct', tok: t }); i++; continue; }
    if (t.kind === 'num') {
      const r = parseNP(toks, i, ctx, items[items.length - 1] || null);
      if (r && r.np.head) { items.push(r.np); i = r.next; continue; }
      items.push({ t: 'num', val: t.value, tok: t }); i++; continue;
    }
    const key = t.key;
    if (key === 'not') { items.push({ t: 'neg', tok: t }); i++; continue; }
    if (key === 'never') { items.push({ t: 'negword', ro: 'niciodată', tok: t }); i++; continue; }
    if (key === 'nothing') { items.push({ t: 'negword', ro: 'nimic', tok: t }); i++; continue; }
    if (key === 'nobody') { items.push({ t: 'negword', ro: 'nimeni', tok: t }); i++; continue; }
    if (key === 'there' && toks[i + 1] && BE.has(toks[i + 1].key)) { items.push({ t: 'there', tok: t }); i++; continue; }
    if (key === 'how' && toks[i + 1] && /^(many|much)$/.test(toks[i + 1].key)) {
      const wh = { t: 'wh', kind: toks[i + 1].key === 'many' ? 'howmany' : 'howmuch', tok: t, tok2: toks[i + 1], np: null };
      i += 2;
      const r = parseNP(toks, i, ctx, null);
      if (r && r.np.head) { wh.np = r.np; i = r.next; }
      items.push(wh); continue;
    }
    if (key === 'how' && toks[i + 1] && toks[i + 1].key === 'old') { items.push({ t: 'wh', kind: 'howold', tok: t, tok2: toks[i + 1] }); i += 2; continue; }
    if (WH_EN[key] && !t.possessive) { items.push({ t: 'wh', kind: key, tok: t }); i++; continue; }
    if (PRON_EN[key] && !(key === 'her' && toks[i + 1] && nounMap.has(toks[i + 1].key))) { items.push({ t: 'pron', key, info: PRON_EN[key], tok: t }); i++; continue; }
    if (AUX_ENS.has(key)) { items.push({ t: 'aux', key, tok: t }); i++; continue; }
    if (key === 'to' && toks[i + 1] && verbMap.has(toks[i + 1].key) && !nounMap.has(toks[i + 1].key)) { items.push({ t: 'to', tok: t }); i++; continue; }
    if (key === 'and' || key === 'or' || key === 'but' || key === 'if' || key === 'because' || key === 'so' || key === 'that' && false) {
      items.push({ t: 'conj', en: key, ro: { and: 'și', or: 'sau', but: 'dar', if: 'dacă', because: 'pentru că', so: 'deci' }[key], tok: t }); i++; continue;
    }
    if (key === 'than') { items.push({ t: 'conj', en: key, ro: 'decât', tok: t }); i++; continue; }
    if (/^(ok|okay)$/.test(key)) { items.push({ t: 'interj', ro: 'OK', tok: t }); i++; continue; }
    if (key === 'yes' || key === 'no' && !(toks[i + 1] && (nounMap.has(toks[i + 1].key) || adjMap.has(toks[i + 1].key)))) { items.push({ t: 'interj', ro: key === 'yes' ? 'Da' : 'Nu', tok: t }); i++; continue; }
    if (/^(hello|hi)$/.test(key)) { items.push({ t: 'interj', ro: key === 'hello' ? 'Bună' : 'Salut', tok: t }); i++; continue; }
    if (key === 'thanks') { items.push({ t: 'interj', ro: 'Mulțumesc', tok: t }); i++; continue; }
    if (key === 'please') { items.push({ t: 'interj', ro: 'te rog', tok: t }); i++; continue; }
    if (key === 'sorry') { items.push({ t: 'interj', ro: 'Scuze', tok: t }); i++; continue; }
    if (key === 'thank' && toks[i + 1] && toks[i + 1].key === 'you') { items.push({ t: 'interj', ro: 'Mulțumesc', tok: t, tok2: toks[i + 1] }); i += 2; continue; }
    // noun phrase
    const prevIt = items[items.length - 1] || null;
    const prevBe = prevIt && ((prevIt.t === 'aux' && BE.has(prevIt.key)) || (prevIt.t === 'neg' && items[items.length - 2] && items[items.length - 2].t === 'aux' && BE.has(items[items.length - 2].key)));
    if (prevBe && adjMap.has(key)) { items.push({ t: 'adj', entry: adjMap.get(key), tok: t, comp: adjMap.get(key).comp === key }); i++; continue; }
    const vf0 = verbMap.get(key);
    const hasVerbYet = items.some((x) => x.t === 'verb' || x.t === 'aux');
    if (vf0 && (vf0.form === 'third' || vf0.form === 'past') && prevIt && (prevIt.t === 'np' || prevIt.t === 'pron') && !hasVerbYet && !(nounMap.has(key) && vf0.form === 'past' && false)) {
      items.push({ t: 'verb', entry: vf0.entry, form: vf0.form, tok: t }); i++; continue;
    }
    const np = parseNP(toks, i, ctx, prevIt);
    if (np) { items.push(np.np); i = np.next; continue; }
    // verb
    const vf = verbMap.get(key);
    if (vf) { items.push({ t: 'verb', entry: vf.entry, form: vf.form, tok: t }); i++; continue; }
    const adj = adjMap.get(key);
    if (adj) { items.push({ t: 'adj', entry: adj, tok: t, comp: adj.comp === key }); i++; continue; }
    if (PREP_EN[key] || (key === 'next' && toks[i + 1] && toks[i + 1].key === 'to')) {
      if (key === 'next') { items.push({ t: 'prep', en: 'next to', tok: t, tok2: toks[i + 1] }); i += 2; continue; }
      items.push({ t: 'prep', en: key, tok: t }); i++; continue;
    }
    const w = wordMap.get(key);
    if (w) { items.push({ t: w.pos === 'adv' ? 'adv' : 'word', ro: w.ro, tok: t, row: w }); i++; continue; }
    if (key === 'the' || key === 'a' || key === 'an') { i++; continue; }
    // names and unknown words
    // a capitalised word is a name unless it opens the sentence and is neither a known name nor followed by a verb ("Nice!", "Look at ..."): those are English words we cannot translate
    const nx = toks[i + 1];
    const nameLike = t.isCap && (i > 0 || L.names.some((x) => x.name === t.raw) || (nx && (nx.kind === 'num' || verbMap.has(nx.key) || AUX_ENS.has(nx.key) || nx.possessive)));
    if (nameLike) { items.push({ t: 'np', head: { kind: 'name', text: t.raw, tok: t }, number: 'sg', adjs: [], possessive: !!t.possessive, def: false, start: t.start, end: t.end }); i++; continue; }
    unknown(t);
    items.push({ t: 'np', head: { kind: 'unknown', text: t.raw, tok: t }, number: 'sg', adjs: [], def: false, start: t.start, end: t.end, unknown: true });
    i++;
  }
  return items;
}

function parseNP(toks, i, ctx, prev = null) {
  let j = i;
  const np = { t: 'np', det: null, num: null, poss: null, adjs: [], head: null, number: 'sg', def: false, possessor: null };
  let any = false;
  for (;;) {
    budget.tick('translate.parse');
    const t = toks[j];
    if (!t) break;
    if (t.kind === 'num') { if (np.num) break; np.num = { val: t.value, tok: t }; j++; any = true; continue; }
    if (t.kind !== 'word') break;
    if (t.key === 'most' && np.det && np.det.en === 'the' && !np.most) { np.most = t; j++; any = true; continue; }
    if (DET_EN.has(t.key) && !np.det) {
      const nx = toks[j + 1];
      if (!nx || !(nx.kind === 'word' || nx.kind === 'num')) break;
      np.det = { en: t.key, tok: t }; j++; any = true; continue;
    }
    if (POSS_EN[t.key] && !(PRON_EN[t.key] && t.key === 'her' && !(toks[j + 1] && (nounMap.has(toks[j + 1].key) || adjMap.has(toks[j + 1].key))))) {
      if (np.poss) break;
      np.poss = { en: t.key, tok: t }; j++; any = true; continue;
    }
    if (t.isCap && t.possessive) { np.possessor = { text: t.raw, tok: t }; j++; any = true; continue; }
    const a = adjMap.get(t.key);
    if (a && any && toks[j + 1] && (nounMap.has(toks[j + 1].key) || adjMap.has(toks[j + 1].key))) { np.adjs.push({ entry: a, tok: t, comp: a.comp === t.key }); j++; continue; }
    if (a && !any && toks[j + 1] && nounMap.has(toks[j + 1].key) && !AUX_ENS.has(t.key)) { np.adjs.push({ entry: a, tok: t, comp: a.comp === t.key }); j++; any = true; continue; }
    break;
  }
  const t = toks[j];
  if (t && t.kind === 'word') {
    // two-word nouns (ice cream, teddy bear, toy car, police officer)
    const two = toks[j + 1] && nounMap.get(`${t.key} ${toks[j + 1].key}`);
    const one = nounMap.get(t.key);
    let hit = two || one;
    const prevVerbExpect = prev && (prev.t === 'neg' || (prev.t === 'aux' && !BE.has(prev.key)) || prev.t === 'to');
    if (hit && !any && prevVerbExpect && verbMap.has(t.key)) hit = null;
    const verbAlso = verbMap.has(t.key) && (t.key === 'cost' || t.key === 'rain' || t.key === 'snow');
    if (hit && !(verbAlso && !any)) {
      np.head = { kind: 'noun', entry: hit.entry, number: hit.number, tok: t, tok2: two ? toks[j + 1] : null };
      j += two ? 2 : 1;
    }
  }
  if (!np.head && !(np.num && !np.det)) { if (!np.head && !any) return null; if (!np.head && !np.num) return null; }
  if (!np.head && np.num) { /* bare number */ }
  const plNum = np.num ? np.num.val !== '1' : null;
  if (np.head) np.number = plNum !== null ? (plNum ? 'pl' : 'sg') : (np.det && /^(these|those|many|few|some|both)$/.test(np.det.en) && np.head.number === 'sg' ? 'pl' : np.head.number);
  else np.number = plNum ? 'pl' : 'sg';
  np.def = !!(np.det && /^(the|this|that|these|those)$/.test(np.det.en)) || !!np.poss || !!np.possessor;
  const first = [np.det?.tok, np.num?.tok, np.poss?.tok, np.adjs[0]?.tok, np.head?.tok].filter(Boolean);
  np.start = Math.min(...first.map((x) => x.start));
  np.end = Math.max(...[np.head?.tok2, np.head?.tok, np.num?.tok, np.det?.tok].filter(Boolean).map((x) => x.end));
  if (np.head) ctx.content++, ctx.mapped++;
  return { np, next: j };
}

// ------------------------------------------------------------------ Romanian realization

function adjForm(entry, gender, number) { return M.adjSurface(entry, gender, number); }

function roNumberWithNoun(np, ctx) {
  // returns pieces for numeral + noun with Romanian agreement (1 măr, 2 mere, 20 de mere)
  const out = [];
  const e = np.head.entry;
  const n = Number(np.num.val);
  out.push(piece(np.num.val, np.num.tok));
  const plural = np.num.val !== '1';
  let noun = M.nounSurface(e, { number: plural ? 'pl' : 'sg', def: false });
  if (e.flags.has('mass') && !plural) noun = e.ro;
  if (plural && n >= 20 && Number.isInteger(n)) out.push(piece('de', np.num.tok));
  const g = genderFor(e, plural ? 'pl' : 'sg');
  if (np.det && np.det.en === 'more') out.unshift(piece('cu', np.det.tok));
  out.push(pieceHead(noun, np));
  for (const a of np.adjs) out.push(piece(adjForm(a.entry, g, plural ? 'pl' : 'sg'), a.tok));
  if (np.det && np.det.en === 'more') out.push(piece(g === 'f' || plural ? 'mai multe' : 'mai mult', np.det.tok));
  return out;
}

function pieceHead(ro, np) {
  const tok = np.head.tok;
  const s = np.head.tok2 ? np.head.tok2.end : tok.end;
  return span(ro, tok.start, s);
}

/** Realize a noun phrase; returns pieces. opts: { neg, acc, afterPrep } */
function realizeNP(np, ctx, opts = {}) {
  const h = np.head;
  if (!h && np.num) return [piece(np.num.val, np.num.tok)];
  if (!h) return [];
  if (h.kind === 'name') return [piece(placeRo(h.text) ?? h.text, h.tok)];
  if (h.kind === 'unknown') return [piece(h.text, h.tok)];
  const e = h.entry;
  const plural = np.number === 'pl';
  const g = genderFor(e, plural ? 'pl' : 'sg');
  const out = [];
  const pre = (ro, tok) => out.push(piece(ro, tok));
  if (np.possessor) {
    // Ion's ball -> mingea lui Ion
    out.push(pieceHead(M.nounSurface(e, { number: plural ? 'pl' : 'sg', def: true }), np));
    for (const a of np.adjs) out.push(piece(adjForm(a.entry, g, plural ? 'pl' : 'sg'), a.tok));
    out.push(piece(nameDative(np.possessor.text).startsWith('lui') ? `lui ${np.possessor.text}` : `lui ${np.possessor.text}`, np.possessor.tok));
    return out;
  }
  if (np.most && !np.num) {
    const ps = [span('cele mai multe', np.det.tok.start, np.most.end)];
    ps.push(pieceHead(M.nounSurface(e, { number: 'pl', def: false }), np));
    return ps;
  }
  if (np.num) return roNumberWithNoun(np, ctx);
  const det = np.det ? np.det.en : null;
  const genericDef = opts.subject && !np.det && !np.poss && (plural || e.flags.has('mass'));
  let noun;
  let defForm = false;
  if (opts.afterPrep && det === 'the' && !np.adjs.length && !plural && !e.flags.has('mass')) { return [pieceHead(e.ro, np)]; }
  if (genericDef) defForm = true;
  if (np.poss || det === 'the' || /^(this|that|these|those)$/.test(det || '')) defForm = true;
  noun = M.nounSurface(e, { number: plural ? 'pl' : 'sg', def: defForm });
  if (e.flags.has('mass')) noun = defForm ? M.nounSurface(e, { number: 'sg', def: true }) : e.ro;
  const adjs = np.adjs.map((a) => piece(adjForm(a.entry, g, plural ? 'pl' : 'sg'), a.tok));
  if (!defForm) {
    if (det === 'a' || det === 'an') pre(g === 'f' ? 'o' : 'un', np.det.tok);
    else if (det === 'some') pre('niște', np.det.tok);
    else if (det === 'no') { if (!plural && !e.flags.has('mass')) pre(g === 'f' ? 'nicio' : 'niciun', np.det.tok); }
    else if (det === 'each' || det === 'every') pre('fiecare', np.det.tok);
    else if (det === 'many') pre(g === 'f' || plural ? 'multe' : 'mulți', np.det.tok);
    else if (det === 'all') pre('toate', np.det.tok);
    else if (det === 'more') pre('mai multe', np.det.tok);
    else if (det === 'another' || det === 'other') pre('alt', np.det.tok);
    else if (det === 'any') { /* dropped under negation */ if (!opts.neg) pre('orice', np.det.tok); }
  }
  out.push(pieceHead(noun, np), ...adjs);
  if (np.poss) {
    const p = POSS_EN[np.poss.en];
    const form = p.inv || p[plural ? 'pl' : 'sg'][g];
    out.push(piece(form, np.poss.tok));
  }
  if (det === 'a' || det === 'an') { /* article already placed */ }
  return out;
}

function personOf(item) {
  if (!item) return null;
  if (item.t === 'pron') return { person: item.info.person, number: item.info.number };
  if (item.t === 'np') return { person: 3, number: item.number === 'pl' ? 'pl' : 'sg' };
  return null;
}

function verbPieces(v, opts) {
  // v: {entry, tok}; opts: {tense, person, number, neg, negTok, auxTok, modal}
  const out = [];
  const { tense, person, number, neg, negTok } = opts;
  const e = v.entry;
  if (neg) out.push(piece('nu', negTok || v.tok));
  const tok = v.tok;
  if (opts.clitics) for (const c of opts.clitics) out.push(c);
  if (tense === 'past') {
    const ELIDE = { 'îi': 'i', 'îmi': 'mi', 'îți': 'ți', 'mă': 'm', 'îl': 'l', 'ne': 'ne', 'le': 'le', 'te': 'te' };
    const lastClitic = out.length ? out[out.length - 1] : null;
    const auxRo = AUX_RO[person][number];
    if (opts.clitics && opts.clitics.length && lastClitic && ELIDE[lastClitic.ro] !== undefined && out.slice(-1)[0] === opts.clitics[opts.clitics.length - 1]) {
      out.pop();
      out.push(span(`${ELIDE[lastClitic.ro]}-${auxRo}`, lastClitic.src[0], (opts.auxTok || tok).end));
    } else out.push(piece(auxRo, opts.auxTok || tok));
    out.push(piece(e.part || e.inf, tok));
  } else if (tense === 'fut') {
    out.push(piece(FUT_RO[person][number], opts.auxTok || tok));
    out.push(piece(e.inf, tok));
  } else if (tense === 'imp') {
    const f = typeof e.flags.imp === 'string' ? e.flags.imp.split(',')[0] : M.verbPresent(e, 3, 'sg');
    out.push(piece(f, tok));
  } else {
    out.push(piece(M.verbPresent(e, person, number), tok));
  }
  return out;
}

const PRON_SUBJ = { '1sg': 'eu', '2sg': 'tu', '3sg': 'el', '1pl': 'noi', '2pl': 'voi', '3pl': 'ei' };

function roPrep(item, verbEntry, objNP) {
  const k = item.en;
  const headRo = objNP && objNP.head && objNP.head.kind === 'noun' ? objNP.head.entry.ro : null;
  if (k === 'to' && headRo === 'listă') return 'pe';
  if (k === 'to' && verbEntry && verbEntry.flags.motion) return 'la';
  if (k === 'to') return 'la';
  if (k === 'on' && headRo === 'listă' && verbEntry && verbEntry.inf === 'avea') return 'pe';
  return PREP_EN[k] || k;
}

function realizeClause(items, ctx, c = {}) {
  const out = [];
  // leading interjections / conjunctions / commas
  const lead = [];
  while (items.length && ['interj', 'conj', 'comma'].includes(items[0].t) && !(items[0].t === 'interj' && items.length === 1 && false)) { budget.tick('en-ro.realizeClause'); lead.push(items.shift()); }
  for (const l of lead) {
    if (l.t === 'comma') out.push(piece(',', l.tok, { punct: true }));
    else out.push(piece(l.ro, l.tok));
  }
  if (c.interjOnly) return out;
  // find verb group
  const kAux = items.findIndex((x) => x.t === 'aux' || x.t === 'verb');
  const whItem = items.find((x) => x.t === 'wh');
  if (kAux < 0) {
    for (const it of items) out.push(...realizeLoose(it, ctx));
    return out;
  }
  let pre = items.slice(0, kAux);
  let rest = items.slice(kAux);
  let aux = null;
  let neg = null;
  let main = null;
  let invSubj = [];
  let modal = null;
  let perfect = false;
  let tenseEn = 'pres';
  let consumed = 0;
  const first = rest[0];
  if (first.t === 'aux') {
    aux = first.key;
    let k = 1;
    // inverted subject between aux and verb: "does Ion have", "did Maria eat"
    const inv = [];
    while (rest[k] && (rest[k].t === 'np' || rest[k].t === 'pron') && ['do', 'does', 'did', 'can', 'could', 'will', 'would', 'must', 'should', 'is', 'are', 'was', 'were', 'am', 'has', 'have', 'had'].includes(aux) && (pre.length === 0 || whItem) && c.question !== false) {
      budget.tick('en-ro.realizeClause2');
      // only treat as inversion when a verb follows later
      const later = rest.slice(k + 1).findIndex((x) => x.t === 'verb' || x.t === 'neg' || x.t === 'adj' || (x.t === 'aux' && (HAVE.has(x.key) || BE.has(x.key))));
      if (later < 0 && !(BE.has(aux))) break;
      inv.push(rest[k]); k++;
    }
    if (inv.length && !(BE.has(aux) && (!rest[k] || !(rest[k].t === 'verb' || rest[k].t === 'neg')) && false)) invSubj = inv;
    if (rest[k] && rest[k].t === 'neg') { neg = rest[k]; k++; }
    if (rest[k] && rest[k].t === 'to') k++;
    if (rest[k] && rest[k].t === 'verb') { main = rest[k]; k++; }
    else if (rest[k] && rest[k].t === 'aux' && (invSubj.length || ['do', 'does', 'did', 'will', 'would', 'can', 'could', 'must', 'should'].includes(aux)) && HAVE.has(rest[k].key)) {
      main = { entry: L.verbs.find((v) => v.inf === 'avea'), form: 'base', tok: rest[k].tok }; k++;
    } else if (rest[k] && rest[k].t === 'aux' && invSubj.length && BE.has(rest[k].key)) {
      main = { entry: L.verbs.find((v) => v.inf === 'fi'), form: 'base', tok: rest[k].tok, be: true }; k++;
    }
    consumed = k;
    if (main) {
      if (['can', 'could', 'must', 'should'].includes(aux)) modal = aux;
      else if (aux === 'will' || aux === 'would') tenseEn = 'fut';
      else if (aux === 'did') tenseEn = 'past';
      else if (HAVE.has(aux) && main.form === 'pp') { perfect = true; tenseEn = 'past'; }
      else if (BE.has(aux) && main.form === 'ing') tenseEn = aux === 'was' || aux === 'were' ? 'past' : 'pres';
      else if (BE.has(aux) && main.form === 'pp') { /* passive: treat as past participle statement */ tenseEn = 'past'; }
      else tenseEn = (aux === 'did') ? 'past' : 'pres';
    } else {
      // aux is the main verb: be / have
      if (BE.has(aux)) { main = { entry: L.verbs.find((v) => v.inf === 'fi'), form: 'base', tok: first.tok, be: true }; tenseEn = aux === 'was' || aux === 'were' ? 'past' : 'pres'; }
      else if (HAVE.has(aux)) { main = { entry: L.verbs.find((v) => v.inf === 'avea'), form: 'base', tok: first.tok }; tenseEn = aux === 'had' ? 'past' : 'pres'; }
      else if (aux === 'do' || aux === 'does') { main = { entry: L.verbs.find((v) => v.inf === 'face'), form: 'base', tok: first.tok }; }
      neg = neg || null;
      consumed = (rest[1] && rest[1].t === 'neg') ? 2 : 1;
      if (rest[1] && rest[1].t === 'neg') neg = rest[1];
    }
  } else {
    main = first; consumed = 1;
    if (main.form === 'past' || main.form === 'pp') tenseEn = 'past';
  }
  if (!main) { for (const it of items) out.push(...realizeLoose(it, ctx)); return out; }
  const after = rest.slice(consumed);
  const subjPre = pre.filter((x) => x.t === 'np' || x.t === 'pron');
  const subjItems = invSubj.length ? invSubj : subjPre;
  const thereItem = pre.find((x) => x.t === 'there');
  const negWords = [...pre, ...after].filter((x) => x.t === 'negword');
  let subj = subjItems[0] || null;
  if (c.subjectFromWh && !subj) subj = null;
  const whSubject = whItem && !invSubj.length && !subjPre.length;
  let agree = subj ? personOf(subj) : null;
  if (!agree && thereItem) {
    const firstObj = after.find((x) => x.t === 'np');
    agree = { person: 3, number: firstObj && firstObj.number === 'pl' ? 'pl' : 'sg' };
  }
  if (!agree && whSubject) agree = { person: 3, number: whItem.kind === 'howmany' ? 'pl' : 'sg' };
  if (!agree) agree = (tenseEn === 'past' && !whItem) ? { person: 1, number: 'sg' } : { person: 3, number: 'sg' };
  // imperative: no subject, base verb at the start
  const imperative = !subj && !thereItem && !whItem && main.form === 'base' && !aux && pre.filter((x) => !['comma', 'interj', 'conj'].includes(x.t)).length === 0 && !c.noImperative;
  const isNeg = !!neg || negWords.length > 0 && false;
  const negTok = neg ? neg.tok : null;
  const doNeg = !!neg || negWords.some((x) => ['nimic', 'nimeni'].includes(x.ro) || x.ro === 'niciodată') || after.some((x) => x.t === 'np' && x.det && x.det.en === 'no') || after.some((x) => x.t === 'prep' && false);
  const clit = [];
  // pronoun objects
  const objs = after.filter((x) => x.t === 'pron');
  const verbE = main.entry;
  const dativeItems = [];
  const bodyAfter = [];
  // ditransitive: "gave Ion 3 apples"  /  "gave 3 apples to Ion"
  const isDitrans = !!verbE.flags.d;
  const afterNP = after.filter((x) => x.t === 'np');
  let ioNP = null;
  let doNP = null;
  if (isDitrans) {
    const nps = after.filter((x) => x.t === 'np' || x.t === 'pron');
    const toIdx = after.findIndex((x, k) => x.t === 'prep' && x.en === 'to' && after[k + 1] && (after[k + 1].t === 'np' || after[k + 1].t === 'pron'));
    if (toIdx >= 0) { ioNP = after[toIdx + 1]; ioNP.viaTo = true; doNP = nps.find((x) => x !== ioNP) || null; ioNP.toPrep = after[toIdx]; }
    else if (nps.length >= 2) { ioNP = nps[0]; doNP = nps[1]; }
    else if (nps.length === 1) doNP = nps[0];
  }
  // tense / person for the Romanian verb
  const ropts = { tense: imperative ? 'imp' : (modal ? 'pres' : tenseEn), person: agree.person, number: agree.number, neg: doNeg, negTok, auxTok: aux ? ((aux === 'will' || perfect || aux === 'did') ? first.tok : null) : null };
  if (main.be) {
    // copula
    const bp = (!isNegTense(ropts)) ? null : null; void bp;
  }
  const clitics = [];
  if (isDitrans && ioNP) {
    const cl = ioNP.t === 'pron' ? ioNP.info.dat : (ioNP.number === 'pl' ? 'le' : 'îi');
    clitics.push(span(cl, ioNP.start ?? ioNP.tok.start, ioNP.end ?? ioNP.tok.end));
  }
  for (const o of objs) {
    if (o === ioNP) continue;
    if (modal) continue;
    clitics.push(piece(o.info.acc, o.tok));
  }
  ropts.clitics = clitics;
  let verbOut = [];
  const vtok = main.tok;
  if (main.be) {
    const be = main.entry;
    const t = ropts.tense === 'past' ? 'past' : 'pres';
    if (ropts.neg) verbOut.push(piece('nu', negTok || vtok));
    if (t === 'past') {
      // "was" -> era (imperfect) for states
      verbOut.push(piece(M.verbImperfectForm(be, agree.person, agree.number), vtok));
    } else {
      let f = M.verbPresent(be, agree.person, agree.number);
      if (agree.person === 3 && agree.number === 'sg') f = 'este';
      if (pre.some((x) => x.t === 'word' && x.row && x.row.pos === 'op')) f = agree.number === 'pl' ? 'fac' : 'face';
      verbOut.push(piece(f, vtok));
    }
  } else if (modal) {
    const pot = L.verbs.find((v) => v.inf === 'putea');
    const must = L.verbs.find((v) => v.inf === 'trebui');
    if (ropts.neg) verbOut.push(piece('nu', negTok || vtok));
    if (modal === 'must') verbOut.push(piece('trebuie să', first.tok), piece(M.verbPresent(verbE, agree.person, agree.number), vtok));
    else {
      verbOut.push(piece(M.verbPresent(pot, agree.person, agree.number), first.tok), piece(verbE.inf, vtok));
    }
    void must;
  } else verbOut = verbPieces(main, ropts);

  const verbTense = ropts.tense;
  void verbTense;
  // subject pieces
  let subjPieces = [];
  if (subj && !imperative) {
    if (subj.t === 'pron') {
      if (c.emphasis) subjPieces.push(piece(PRON_SUBJ[`${agree.person}${agree.number}`], subj.tok));
      else subjPieces.push(span('', subj.tok.start, subj.tok.end, { silent: true }));
    } else subjPieces.push(...realizeNP(subj, ctx, { subject: true }));
    for (let k = 1; k < subjItems.length; k++) if (subjItems[k].t !== 'pron') subjPieces.push(...realizeNP(subjItems[k], ctx));
  }
  // wh phrase
  let whPieces = [];
  if (whItem) whPieces = realizeWh(whItem, items, ctx);
  // after items
  const rem = [];
  const skip = new Set([...(objs), ioNP, ...[...invSubj]].filter(Boolean));
  const adjAgreeFrom = subj && subj.t === 'np' && subj.head && subj.head.kind === 'noun' ? subj.head.entry : null;
  const subjGender = adjAgreeFrom ? genderFor(adjAgreeFrom, subj.number) : (subj && subj.t === 'np' && subj.head?.kind === 'name' ? (L.names.find((n) => n.name === subj.head.text)?.gender === 'f' ? 'f' : 'm') : (agree.person === 3 && subj && subj.t === 'pron' && subj.info.g === 'f' ? 'f' : 'm'));
  const subjNumber = agree.number;
  let k = 0;
  const ioPieces = [];
  if (ioNP) {
    if (ioNP.t === 'pron') { /* clitic only */ }
    else if (ioNP.head && ioNP.head.kind === 'name') ioPieces.push(span(nameDative(ioNP.head.text), ioNP.start, ioNP.end));
    else if (ioNP.head && ioNP.head.kind === 'noun') ioPieces.push(span(M.nounGenDat(ioNP.head.entry, ioNP.number), ioNP.start, ioNP.end));
    else ioPieces.push(...realizeNP(ioNP, ctx));
  }
  for (; k < after.length; k++) {
    budget.tick('en-ro.realizeClause3');
    const it = after[k];
    if (skip.has(it)) continue;
    if (it === ioNP?.toPrep) continue;
    if (it.t === 'neg') continue;
    if (it.t === 'negword') { rem.push(piece(it.ro, it.tok)); continue; }
    if (it.t === 'prep') {
      const nx = after[k + 1];
      if (nx && (nx.t === 'np' || nx.t === 'pron') && !skip.has(nx)) {
        rem.push(piece(roPrep(it, verbE, nx), it.tok));
        if (nx.t === 'np') rem.push(...realizeNP(nx, ctx, { afterPrep: true, neg: doNeg })); else rem.push(piece(nx.info.acc === 'mă' ? 'mine' : nx.key, nx.tok));
        k++; continue;
      }
      rem.push(piece(roPrep(it, verbE, null), it.tok)); continue;
    }
    if (it.t === 'np') { rem.push(...realizeNP(it, ctx, { neg: doNeg })); continue; }
    if (it.t === 'adj') { rem.push(piece(adjForm(it.entry, subjGender, subjNumber), it.tok)); continue; }
    if (it.t === 'to') continue;
    if (it.t === 'verb') {
      // complement verb (want to eat) – use infinitive-like present form with subject agreement
      rem.push(piece(it.entry.inf, it.tok)); continue;
    }
    rem.push(...realizeLoose(it, ctx));
  }
  const beforeVerb = pre.filter((x) => !['np', 'pron', 'there', 'wh', 'negword'].includes(x.t));
  const bPieces = beforeVerb.flatMap((x) => realizeLoose(x, ctx));
  const negPre = pre.filter((x) => x.t === 'negword').map((x) => piece(x.ro, x.tok));
  void negPre;
  // ordering
  let body;
  if (imperative) body = [...verbOut, ...ioPieces, ...rem];
  else if (whItem && !whSubject) body = [...whPieces, ...verbOut, ...subjPieces, ...ioPieces, ...rem];
  else if (whItem && whSubject) body = [...whPieces, ...verbOut, ...ioPieces, ...rem];
  else body = [...bPieces, ...subjPieces, ...verbOut, ...ioPieces, ...rem];
  out.push(...body);
  return out;
}

function isNegTense() { return false; }

function realizeWh(wh, items, ctx) {
  const idx = items.indexOf(wh);
  const out = [];
  if (wh.kind === 'howmany' || wh.kind === 'howmuch') {
    const nx = wh.np;
    const msp = [wh.tok.start, wh.tok2.end];
    if (nx && nx.t === 'np' && nx.head && nx.head.kind === 'noun') {
      const e = nx.head.entry;
      const mass = e.flags.has('mass');
      out.push(span(mass || wh.kind === 'howmuch' && mass ? 'cât' : (genderFor(e, 'pl') === 'f' ? 'câte' : 'câți'), msp[0], msp[1]));
      out.push(pieceHead(mass ? e.ro : M.nounSurface(e, { number: 'pl', def: false }), nx));
    } else out.push(span(wh.kind === 'howmany' ? 'câți' : 'cât', msp[0], msp[1]));
    return out;
  }
  if (wh.kind === 'howold') return [span('câți ani', wh.tok.start, wh.tok2.end)];
  if (wh.kind === 'what' || wh.kind === 'which') {
    out.push(piece(WH_EN[wh.kind], wh.tok));
    return out;
  }
  out.push(piece(WH_EN[wh.kind], wh.tok));
  return out;
}

function realizeLoose(it, ctx) {
  switch (it.t) {
    case 'np': return it.consumedByWh ? [] : realizeNP(it, ctx);
    case 'pron': return [piece(it.info.subj ? (PRON_SUBJ[`${it.info.person}${it.info.number}`]) : it.info.acc, it.tok)];
    case 'num': return [piece(it.val, it.tok)];
    case 'adj': return [piece(adjForm(it.entry, 'm', 'sg'), it.tok)];
    case 'adv': return [piece(it.ro, it.tok)];
    case 'word': return [piece(it.ro, it.tok)];
    case 'prep': return [piece(PREP_EN[it.en] || it.en, it.tok)];
    case 'interj': return [piece(it.ro, it.tok)];
    case 'conj': return [piece(it.ro, it.tok)];
    case 'neg': return [piece('nu', it.tok)];
    case 'negword': return [piece(it.ro, it.tok)];
    case 'wh': return [piece(WH_EN[it.kind] || it.kind, it.tok)];
    case 'comma': return [piece(it.tok.raw, it.tok, { punct: true })];
    case 'punct': return [piece(it.tok.raw, it.tok, { punct: true })];
    case 'verb': return [piece(it.entry.inf, it.tok)];
    case 'aux': return [piece(it.key, it.tok)];
    default: return [];
  }
}

// ------------------------------------------------------------------ frames

function matchEnFrame(frame, toks, ctx) {
  const els = frame.p.split(' ').map((e) => (/^\{\w+\}$/.test(e) ? { slot: e.slice(1, -1) } : { alts: e.split('|') }));
  let pos = 0;
  const slots = {};
  for (const el of els) {
    const t = toks[pos];
    if (el.alts) {
      if (!t || t.kind !== 'word' || !el.alts.includes(t.key)) return null;
      pos++;
    } else if (el.slot === 'n') { if (!t || t.kind !== 'num') return null; slots.n = t; pos++; }
    else if (el.slot === 'name') { if (!t || t.kind !== 'word' || !t.isCap) return null; slots.name = t; pos++; }
    else if (el.slot === 'np') { const r = parseNP(toks, pos, ctx); if (!r || !r.np.head) return null; slots.np = r.np; pos = r.next; }
    else if (el.slot === 'rest') { if (pos >= toks.length) return null; slots.rest = toks.slice(pos); pos = toks.length; }
  }
  if (pos !== toks.length) return null;
  return slots;
}

function translateSentenceEnRo(core, end, ctx) {
  let toks = mergeNumberWords(expandTokens(core));
  const info = { q: end.some((e) => e.raw === '?') };
  const wordsOnly = toks.filter((t) => t.kind !== 'punct' || t.raw === ',');
  // frames (whole sentence)
  const trimmed = toks.filter((t) => !(t.kind === 'punct' && t.raw === ','));
  for (const f of FRAMES) {
    if (f.arithmetic) continue;
    const m = matchEnFrame(f, trimmed, ctx);
    if (!m) continue;
    const s = toks[0].start;
    const e = toks[toks.length - 1].end;
    const pieces = [];
    const ws = f.out.split(' ');
    let lit = [];
    const flush = () => { if (lit.length) { pieces.push(span(lit.join(' '), s, e)); lit = []; } };
    for (const w of ws) {
      if (w === '{n}') { flush(); pieces.push(piece(m.n.raw, m.n)); }
      else if (w === '{name}') { flush(); pieces.push(piece(m.name.raw, m.name)); }
      else if (w === '{np}') { flush(); pieces.push(...realizeNP(m.np, ctx, { subject: false })); }
      else lit.push(w);
    }
    flush();
    ctx.content += 1; ctx.mapped += 1;
    return { pieces, info };
  }
  void wordsOnly;
  // arithmetic answers: "7 plus 5 is 12"
  const items = parseItems(toks, ctx);
  // split into clauses at a verb that follows a wh item (embedded question) or at conj/comma between verb groups
  const clauses = splitClausesEn(items);
  const pieces = [];
  let n = 0;
  for (const cl of clauses) {
    const q = info.q && n === clauses.length - 1;
    pieces.push(...realizeClause(cl.slice(), ctx, { question: q, noImperative: false }));
    n++;
  }
  return { pieces, info };
}

function splitClausesEn(items) {
  const vIdx = [];
  items.forEach((x, k) => { if (x.t === 'verb' || x.t === 'aux') vIdx.push(k); });
  // group consecutive aux/verb/neg/np-between (inversion) as one verb group: find group starts
  const starts = [];
  let k = 0;
  while (k < items.length) {
    budget.tick('translate.items');
    if (items[k].t === 'aux' || items[k].t === 'verb') {
      starts.push(k);
      // skip the verb group and an inverted subject
      let m = k + 1;
      while (m < items.length && (items[m].t === 'neg' || items[m].t === 'verb' || items[m].t === 'to' || (items[m].t === 'aux' && (items[m - 1].t === 'aux')))) { budget.tick('en-ro.splitClausesEn'); m++; }
      k = m;
    } else k++;
  }
  if (starts.length <= 1) return [items];
  // verb groups with an inverted subject (aux NP verb): merge when pattern matches
  const cuts = [];
  for (let s = 1; s < starts.length; s++) {
    const b = starts[s];
    const a = starts[s - 1];
    // detect inversion: aux ... NP ... verb inside one question clause
    const between = items.slice(a + 1, b);
    if (items[a].t === 'aux' && between.length && between.every((x) => x.t === 'np' || x.t === 'pron') && (items[b].t === 'verb' || (items[b].t === 'aux' && /^(have|be|are|is)$/.test(items[b].key))) && /^(do|does|did|can|could|will|would|must|should|has|have|had|is|are|was|were|am)$/.test(items[a].key) && !between.some((x) => false)) continue;
    let cut = -1;
    for (let q = b - 1; q > a; q--) if (items[q].t === 'conj' || items[q].t === 'comma' || items[q].t === 'wh') { cut = q; break; }
    if (cut >= 0) cuts.push(cut);
  }
  if (!cuts.length) return [items];
  const out = [];
  let st = 0;
  for (const c of cuts) { out.push(items.slice(st, c)); st = c; }
  out.push(items.slice(st));
  return out;
}

function assembleRo(sentences) {
  let text = '';
  const alignment = [];
  for (const sent of sentences) {
    let capNext = true;
    for (const p of sent.pieces) {
      let ro = p.ro;
      if (ro === '' || ro == null) { if (p.src && p.silent) alignment.push({ src: [p.src[0], p.src[1]], tgt: [text.length, text.length] }); continue; }
      if (capNext && /^\p{Ll}/u.test(ro)) ro = ro[0].toUpperCase() + ro.slice(1);
      capNext = false;
      if (text && !p.punct) text += ' ';
      const ts = text.length;
      text += ro;
      if (p.src) alignment.push({ src: [p.src[0], p.src[1]], tgt: [ts, text.length] });
    }
    for (const e of sent.end) {
      const ts = text.length;
      text += e.raw;
      alignment.push({ src: [e.start, e.end], tgt: [ts, text.length] });
    }
  }
  return { text, alignment };
}

/** Merge the words of a multi-word place name ("South America") into one capitalised name token. */
function mergePlaces(toks) {
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    budget.tick('en-ro.mergePlaces');
    let merged = false;
    if (toks[i].kind === 'word' && toks[i].isCap) {
      for (const name of MULTIWORD_EN) {
        const ws = name.split(' ');
        if (ws.every((w, k) => toks[i + k] && toks[i + k].kind === 'word' && toks[i + k].raw === w)) {
          const last = toks[i + ws.length - 1];
          out.push({ ...toks[i], raw: name, key: foldKey(name), end: last.end });
          i += ws.length - 1; merged = true; break;
        }
      }
    }
    if (!merged) out.push(toks[i]);
  }
  return out;
}

function translateEnRoGrammar(original) {
  const source = String(original ?? '');
  const toks = mergePlaces(tokenize(source));
  const sents = splitSentences(toks);
  const ctx = { unknown: [], notes: [], content: 0, mapped: 0 };
  const results = [];
  for (const s of sents) {
    const end = [];
    const core = s.slice();
    while (core.length && core[core.length - 1].kind === 'punct' && /^[.!?]$/.test(core[core.length - 1].raw)) { budget.tick('en-ro.translateEnRoGrammar'); end.unshift(core.pop()); }
    if (!core.length) { results.push({ pieces: [], end }); continue; }
    const r = translateSentenceEnRo(core, end, ctx);
    results.push({ pieces: r.pieces, end });
  }
  const { text, alignment } = assembleRo(results);
  const confidence = ctx.content === 0 ? (text ? 1 : 0) : Math.max(0, Math.min(1, (ctx.content - ctx.unknown.length) / ctx.content));
  return { text, alignment, unknown: ctx.unknown, notes: ctx.notes, confidence: Math.round(confidence * 1000) / 1000 };
}

/** True when the lowercase word is known to the English side (lexicon or function word list). */
export function isEnglishWord(key) {
  return nounMap.has(key) || verbMap.has(key) || adjMap.has(key) || wordMap.has(key) || !!PRON_EN[key] || !!POSS_EN[key]
    || !!WH_EN[key] || AUX_ENS.has(key) || DET_EN.has(key) || !!PREP_EN[key] || key in NUM_UNITS;
}

/**
 * English words that survived in a Romanian output (a word of the English lexicon that Romanian does not also know). A reply with such a word
 * is mixed, so the caller keeps the whole reply in English instead.
 */
export function englishLeftovers(text) {
  const out = [];
  for (const t of tokenize(String(text ?? ''))) {
    if (t.kind !== 'word') continue;
    const k = t.key;
    if ((k.length < 3 && !/^(is|it|of|be|my|we|he|if)$/.test(k)) || !isEnglishWord(k)) continue;
    if (M.analyze(k).length || M.isKnownName(k) || /^(sau|plus|minus|pot|mai|are|de|la|cu|pe|din|nu|da)$/.test(k)) continue;
    out.push(t.raw);
  }
  return out;
}

let vocab = null;
/** True when `key` is one typo (an edit distance of 1, or 2 for words of 7+ letters) away from a word of the English lexicon. */
export function nearEnglishWord(key) {
  if (!vocab) vocab = [...new Set([...nounMap.keys(), ...verbMap.keys(), ...adjMap.keys(), ...wordMap.keys(), 'express', 'fear', 'look', 'give', 'turn', 'make', 'show', 'eyes', 'face'])].filter((w) => /^[a-z]+$/.test(w));
  const max = key.length >= 7 ? 2 : 1;
  for (const w of vocab) {
    if (Math.abs(w.length - key.length) > max) continue;
    if (w[0] !== key[0] && w[1] !== key[1]) continue;
    if (editDistLe(w, key, max)) return true;
  }
  return false;
}
function editDistLe(a, b, max) {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= n; j++) { const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); cur.push(v); if (v < best) best = v; }
    if (best > max) return false;
    prev = cur;
  }
  return prev[n] <= max;
}

/** Split a reply into sentences (quote aware: a full stop inside "..." does not end the sentence). */
function splitReply(text) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    cur += ch;
    if (ch === '"') q = !q;
    if (!q && /[.!?]/.test(ch) && (i + 1 === text.length || /\s/.test(text[i + 1])) && !/^\d+\.$/.test(cur.trim())) { out.push(cur); cur = ''; }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * A sentence with an example in quotes ("Try "draw a red house".") is only translated by an authored entry: the grammar would translate the quoted
 * English words as a sentence and leave broken quotes (RD5). Without an entry the sentence counts as untranslated and the reply stays in English.
 */
function withQuoteGuard(sentence, r) {
  if (!/"[^"]+"/.test(sentence)) return r;
  return { ...r, unknown: [...r.unknown, { word: sentence.trim(), span: [0, sentence.length] }], confidence: 0 };
}

/**
 * English -> Romanian: canonical examples (authored Romanian), then the reply phrase table sentence by sentence, then the grammar.
 * Sentences the table does not know go to the grammar; the caller keeps the whole reply in English if any piece fails (RD5).
 */
export function translateEnRo(original) {
  const source = String(original ?? '');
  const t = source.trim();
  if (CANONICAL_RO[t]) return { text: source.replace(t, CANONICAL_RO[t]), alignment: [], unknown: [], notes: ['canonical example'], confidence: 1 };
  const sentences = splitReply(source);
  if (sentences.length <= 1 && !sentences.some((x) => translateReplySentence(x, (t) => t))) return withQuoteGuard(source, translateEnRoGrammar(source));
  const sub = (x) => { const r = translateEnRoGrammar(x.replace(/^(.)/, (c, a) => (/[A-Z]/.test(a) ? a.toLowerCase() : a))); return r.text && !r.unknown.length && !r.untranslatable?.length ? r.text.replace(/[.!?]$/, '').replace(/^\p{Lu}/u, (c) => (/^[A-Z]/.test(x) ? c : c.toLowerCase())) : null; };
  const unknown = [], notes = [];
  let text = '';
  for (const sen of sentences) {
    const lead = /^\s*/.exec(sen)[0], trail = /\s*$/.exec(sen)[0];
    const core = sen.trim();
    let ro = core ? (CANONICAL_RO[core] ?? translateReplySentence(core, sub)) : '';
    if (ro == null) {
      const r = withQuoteGuard(core, translateEnRoGrammar(core));
      unknown.push(...r.unknown); notes.push(...r.notes);
      ro = r.text;
    }
    text += lead + ro + trail;
  }
  return { text, alignment: [], unknown, notes, confidence: unknown.length ? 0.5 : 1 };
}
