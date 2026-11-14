// SPDX-License-Identifier: AGPL-3.0-only
// PROTOTYPE of the grammar path (questions.md Q13): Romanian is analysed into a FRAME (an act and its roles, the vocabulary of w.lang.en's argument frames) and the
// English is REALISED from the frame. Behind a flag, not the default: nothing imports this module except scripts/measure-ro-en-meaning.mjs; the translator chain does
// not call it. Browser-safe (no node:*). Romanian appears here only as DATA of the grammar (closed words of the frames); the open lexicon and the morphology are the
// translator's own (lexicon.ro-en.mjs, morphology.ro.mjs), which the library's w.lang.ro will replace (handover/w.lang.ro).
//
//   parseRo(text)      -> { ok, frame: { act, roles }, notes }      the Romanian reading of ONE sentence as act + roles (frame null when the grammar abstains)
//   realiseEn(frame)   -> string                                    English from the frame
//   grammarRoEn(text)  -> { text, ok, frame, notes }                a message of one or more sentences; text '' when any sentence is outside the covered shapes
//                                                                   (the caller then falls back to another path: the grammar ABSTAINS rather than guesses)
import { budget } from '../dialog/budget.mjs';
import { tokenize } from './normalize.mjs';
import { analyze, analyzeRaw, parseNumberAt, placeOf, pluralEn, isKnownName } from './morphology.ro.mjs';

let RAWS = [], KEYS = [];
// The lexicon: how a word is analysed. Default: the translator's own (lexicon.ro-en.mjs, morphology.ro.mjs); src/lang/ro.mjs gives one made from the catalog's w.lang.ro with the library's std.morph.
const TRANSLATOR_LEXICON = { analyse: (key, raw) => (raw ? analyzeRaw(raw, true) : analyze(key)), loose: (key) => analyze(key) };
let LEX = TRANSLATOR_LEXICON;   // the raw tokens of the sentence being read (diacritics decide "casă" / "casa")

// ---- closed classes (data of the language world) ---------------------------------------------------------------------------------------------
const LEAD = ['poti sa', 'ai putea sa', 'mi ai putea', 'puteti sa', 'vreau sa', 'as vrea sa', 'vrei sa', 'poti', 'ai putea'];
const FILLER = new Set(['salut', 'buna', 'hei', 'deci', 'atunci', 'hai', 'pai', 'si', 'dar', 'ia', 'hm', 'um']);
const REL = new Map([['langa', 'next to'], ['deasupra', 'above'], ['sub', 'under'], ['pe', 'on'], ['in', 'in'], ['dupa', 'after'], ['spre', 'toward'], ['printre', 'among'], ['intre', 'between'], ['peste', 'over'], ['la', 'at']]);
const REL2 = new Map([['in spatele', 'behind'], ['in fata', 'in front of'], ['in jurul', 'around'], ['de langa', 'next to'], ['pe langa', 'next to'], ['in interiorul', 'inside']]);
const DIR = new Map([['la stanga', 'to the left'], ['la dreapta', 'to the right'], ['sus', 'up'], ['jos', 'down'], ['mai sus', 'higher'], ['mai jos', 'lower'], ['mai la stanga', 'further left'],
  ['mai la dreapta', 'further right'], ['mai in stanga', 'further left'], ['mai in dreapta', 'further right'], ['in stanga', 'to the left'], ['in dreapta', 'to the right'], ['inapoi', 'back'], ['mai aproape', 'closer'], ['mai departe', 'further']]);
const OP = new Map([['plus', 'plus'], ['minus', 'minus'], ['ori', 'times'], ['inmultit cu', 'times'], ['impartit la', 'divided by'], ['impartit cu', 'divided by'], ['mai putin', 'minus']]);
const VERB_ACT = new Map([['draw', 'make'], ['add', 'make'], ['put', 'make'], ['create', 'make'], ['sketch', 'make'], ['make', 'make'], ['move', 'move'], ['delete', 'remove'], ['remove', 'remove'], ['erase', 'remove'], ['show', 'show']]);
const DET = new Set(['un', 'o', 'niste']);
const DAYS_MONTHS = new Map([['luni', 'Monday'], ['marti', 'Tuesday'], ['miercuri', 'Wednesday'], ['joi', 'Thursday'], ['vineri', 'Friday'], ['sambata', 'Saturday'], ['duminica', 'Sunday'],
  ['ianuarie', 'January'], ['februarie', 'February'], ['martie', 'March'], ['aprilie', 'April'], ['mai', 'May'], ['iunie', 'June'], ['iulie', 'July'], ['august', 'August'], ['septembrie', 'September'],
  ['octombrie', 'October'], ['noiembrie', 'November'], ['decembrie', 'December']]);
const STORY_VERB = new Map([['mai primeste', ['gets', true]], ['primeste', ['gets', false]], ['mai cumpara', ['buys', true]], ['cumpara inca', ['buys', true]], ['cumpara', ['buys', false]], ['manaca', ['eats', false]], ['mananca', ['eats', false]],
  ['pierde', ['loses', false]], ['gaseste', ['finds', false]], ['mai gaseste', ['finds', true]], ['da', ['gives away', false]], ['daruieste', ['gives away', false]]]);

// ---- analysis ---------------------------------------------------------------------------------------------------------------------------------
const best = (list, pos) => list.find((a) => a.pos === pos);
const analyses = (key) => (LEX.loose ? LEX.loose(key) : LEX.analyse(key, RAWS[KEYS.indexOf(key)] ?? null));
const rawAnalyses = (keys, i) => LEX.analyse(keys[i], RAWS[i] ?? null);
const take = (keys, i, table) => {   // longest key of `table` (1-3 words) at i
  for (const n of [3, 2, 1]) { const k = keys.slice(i, i + n).join(' '); if (keys.length >= i + n && table.has(k)) return { en: table.get(k), len: n }; }
  return null;
};
function numberAt(keys, i) {
  if (/^\d+$/.test(keys[i] ?? '')) return { value: Number(keys[i]), len: 1 };
  const n = parseNumberAt(keys, i);
  return n && keys[i] !== 'o' && keys[i] !== 'un' ? n : null;
}
const amountAt = (keys, i) => (keys[i] === 'o' || keys[i] === 'un' ? { value: 1, len: 1 } : numberAt(keys, i));

/** One noun phrase at keys[i] -> { np, next } or null. np: { det, count, def, plural, noun (lexicon entry), adjs[] (English), bare, mass }. */
function nounPhrase(keys, i) {
  let j = i, det = null, count = null;
  const k0 = keys[j];
  if (k0 && DET.has(k0)) { det = k0 === 'niste' ? 'some' : 'a'; j++; }
  else {
    const n = numberAt(keys, j);
    if (n && n.value > 1) { count = n.value; j += n.len; if (keys[j] === 'de' && n.value >= 20) j++; }
  }
  // a place name (country, city) is a noun phrase of its own
  const pl = keys[j] && placeOf(keys[j]);
  if (pl && !det && !count) return { np: { proper: pl.en, gen: pl.gen }, next: j + 1 };
  const as = keys[j] ? rawAnalyses(keys, j) : [];
  const nouns = as.filter((a) => a.pos === 'noun');
  // "casa" is the definite form, "casă" the indefinite; typed without diacritics both fold to one key: a determiner before the noun means indefinite, none means definite
  const nn = nouns.length > 1 ? (nouns.find((a) => a.def === !(det || count)) ?? nouns[0]) : nouns[0];
  if (!nn) return null;
  if (as.some((a) => a.pos === 'adj') && !det && !count && !nn.def) return null;   // "rosie" alone is a colour, not a thing
  j++;
  const plural = nn.number === 'pl';
  const def = !(det || count) && !!nn.def;   // a determiner before the noun means indefinite whatever the folded form
  const adjs = [];
  while (keys[j]) {
    budget.tick('grammar-ro.np');
    const aa = best(analyses(keys[j]), 'adj');
    if (!aa) break;
    adjs.push(aa.entry.en);
    j++;
    if (keys[j] === 'si' && best(analyses(keys[j + 1] ?? ''), 'adj')) j++;
  }
  const mass = !!nn.entry.flags?.mass;
  return { np: { bare: !det && !count && !def && !plural && !mass, det, count, def, plural, noun: nn.entry, adjs, mass }, next: j };
}

const vowelStart = (w) => /^[aeiou]/i.test(w) && !/^(uni|use|eu)/i.test(w);
const plOf = (e) => e.enp ?? pluralEn(e.en);
const cnt = (n, e) => (n === 1 ? `1 ${e.en}` : `${n} ${plOf(e)}`);
/** English of a noun phrase. */
function npEn(np) {
  if (np.proper) return np.proper;
  const noun = np.plural ? plOf(np.noun) : np.noun.en;
  const core = [...np.adjs, noun].join(' ');
  if (np.poss) return `your ${core}`;
  if (np.count) return `${np.count} ${[...np.adjs, plOf(np.noun)].join(' ')}`;
  if (np.def) return `the ${core}`;
  if (np.mass || np.plural) return np.det === 'some' ? `some ${core}` : core;
  return `${np.det === 'some' ? 'some' : vowelStart(core) ? 'an' : 'a'} ${core}`;
}

/** Strips leading politeness and the trailing "te rog". */
function cleanKeys(toks0) {
  const toks = toks0.filter((t) => t.kind !== 'punct');
  let keys = toks.map((t) => (t.kind === 'num' ? t.value : t.key)), raws = toks.map((t) => t.raw);
  for (let again = true; again;) {
    budget.tick('grammar-ro.clean');
    again = false;
    for (const p of LEAD) { const pk = p.split(' '); if (pk.every((w, n) => keys[n] === w) && keys.length > pk.length) { keys = keys.slice(pk.length); raws = raws.slice(pk.length); again = true; break; } }
    if (!again && FILLER.has(keys[0]) && keys.length > 1) { keys = keys.slice(1); raws = raws.slice(1); again = true; }
  }
  for (const p of ['te rog', 'va rog', 'mersi', 'multumesc']) { const pk = p.split(' '); for (let i = 0; i + pk.length <= keys.length; i++) { budget.tick('grammar-ro.polite'); if (pk.every((w, n) => keys[i + n] === w)) { keys.splice(i, pk.length); raws.splice(i, pk.length); break; } } }
  return { keys, raws };
}

function verbAt(keys, i) {
  const as = analyses(keys[i]).filter((a) => a.pos === 'verb');
  if (!as.length) return null;
  const a = as.find((x) => VERB_ACT.has(x.entry.en)) ?? as[0];
  const enclitic = /^(mi|ti|te)$/.test(a.enclitic ?? '') ? a.enclitic : null;
  return { en: a.entry.en, act: VERB_ACT.get(a.entry.en) ?? null, enclitic };
}
const colourOf = (k) => { const a = best(analyses(k), 'adj'); if (a) return a.entry.en; const m = /^(.*?)(ul|le)$/.exec(k); if (!m) return null; const b = best(analyses(m[1]), 'adj') ?? best(analyses(`${m[1]}u`), 'adj'); return b ? b.entry.en : null; };

/** Reads one Romanian sentence into a frame; ok false when the grammar does not cover its shape. */
export function parseRo(text, { lexicon = null } = {}) {
  const { keys, raws } = cleanKeys(tokenize(String(text ?? '')));
  RAWS = raws; KEYS = keys; LEX = lexicon ?? TRANSLATOR_LEXICON;
  if (!keys.length) return { ok: false, frame: null, notes: ['empty'] };
  const f = parseStory(keys) ?? parseQuestion(keys) ?? parseRequest(keys);
  return f ? { ok: true, frame: f, notes: [] } : { ok: false, frame: null, notes: ['no frame'] };
}

// ---- story sentences of the word problems: "Ana are 8 creioane.", "Ben îi dă Anei 6 creioane.", "Câte creioane are Ana?" ----------------------------------
const nameAt = (keys, i) => {
  const r = RAWS[i];
  if (!r || !/^\p{Lu}/u.test(r)) return null;
  if (analyses(keys[i]).some((a) => a.pos === 'noun' || a.pos === 'verb') && !isKnownName(keys[i])) return null;
  return r;
};
const datName = (keys, i) => {   // "lui Ben" or "Anei" -> { name, len }
  if (keys[i] === 'lui' && nameAt(keys, i + 1)) return { name: RAWS[i + 1], len: 2 };
  const r = RAWS[i];
  if (r && /^\p{Lu}.*ei$/u.test(r) && isKnownName(keys[i].replace(/ei$/, 'a'))) return { name: r.replace(/ei$/, 'a'), len: 1 };
  return null;
};
const itemAt = (keys, i) => { const a = rawAnalyses(keys, i).find((x) => x.pos === 'noun'); return a ? a.entry : null; };

function parseStory(keys) {
  const n = nameAt(keys, 0);
  if (!n) return null;
  if (/^(are|au)$/.test(keys[1])) {
    const c = amountAt(keys, 2); const it = c && itemAt(keys, 2 + c.len);
    return it && 3 + c.len === keys.length ? { act: 'story.has', roles: { name: n, count: c.value, item: it } } : null;
  }
  for (const len of [2, 1]) {
    const sv = STORY_VERB.get(keys.slice(1, 1 + len).join(' ')); if (!sv) continue;
    const c = amountAt(keys, 1 + len); if (!c) continue;
    const end = 1 + len + c.len;
    if (end === keys.length || (keys[end] === 'din' && keys[end + 1] === 'ele' && end + 2 === keys.length)) return { act: 'story.change', roles: { name: n, verb: sv[0], count: c.value, more: sv[1] } };
  }
  if (keys[1] === 'ii' && /^(da|daruieste|ofera)$/.test(keys[2])) {
    const d = datName(keys, 3); const c = d && amountAt(keys, 3 + d.len); const it = c && itemAt(keys, 3 + d.len + c.len);
    return it && 4 + d.len + c.len === keys.length ? { act: 'story.give', roles: { giver: n, name: d.name, count: c.value, item: it } } : null;
  }
  return null;
}

function parseQuestion(keys) {
  const w = keys.join(' ');
  let m;
  // story questions
  if (keys[0] === 'cate') {
    const it = itemAt(keys, 1);
    if (it) {
      const rest = keys.slice(2).join(' ');
      if (/^(?:ei |ele )?(?:au )?(?:in total|cu totul|impreuna)$/.test(rest)) return { act: 'story.total', roles: { item: it } };
      const last = keys.length - 1;
      if (nameAt(keys, last) && /^(?:mai )?(?:are|au) \S+$/.test(rest)) return { act: 'story.count', roles: { item: it, name: RAWS[last], left: /^mai /.test(rest) } };
      if (nameAt(keys, last) && /^(?:ii )?mai raman (?:lui )?\S+$/.test(rest)) return { act: 'story.count', roles: { item: it, name: RAWS[last], left: true } };
    }
  }
  if (keys[0] === 'cine' && keys[1] === 'are' && keys[2] === 'mai' && /^(multe|multi)$/.test(keys[3]) && itemAt(keys, 4) && keys.length === 5) return { act: 'story.who-more', roles: { item: itemAt(keys, 4) } };
  // arithmetic with a verb: "aduna 4 cu 8", "scade 3 din 9", "inmulteste 5 cu 9", "imparte 18 la 3"
  const vm = /^(aduna|scade|inmulteste|imparte)$/.exec(keys[0] ?? '');
  if (vm) {
    const a = numberAt(keys, 1);
    const b = a && numberAt(keys, 2 + a.len);
    const sep = a && keys[1 + a.len];
    if (b && 2 + a.len + b.len === keys.length && ((vm[1] === 'aduna' && (sep === 'cu' || sep === 'si')) || (vm[1] === 'scade' && sep === 'din') || (vm[1] === 'inmulteste' && sep === 'cu') || (vm[1] === 'imparte' && sep === 'la'))) return { act: 'do.arith', roles: { verb: vm[1], a: a.value, b: b.value } };
  }
  // arithmetic question: "cat face 3 plus 4", "calculeaza 18 impartit la 3"
  const calc = keys[0] === 'calculeaza' ? 1 : keys[0] === 'cat' && /^(face|fac|este|e|sunt)$/.test(keys[1] ?? '') ? 2 : 0;
  if (calc) {
    const a = numberAt(keys, calc); const o = a && take(keys, calc + a.len, OP); const b = o && numberAt(keys, calc + a.len + o.len);
    if (b && calc + a.len + o.len + b.len === keys.length) return { act: 'ask.sum', roles: { a: a.value, op: o.en, b: b.value, verb: calc === 1 ? 'calculate' : null } };
  }
  // capital: "care este capitala Frantei", "capitala Frantei", "ce capitala are Franta"
  if ((m = /^(?:(?:care|ce) (?:este|e) |spune mi |zi mi )?capitala (?:(?:este|e) )?(.+)$/.exec(w)) || (m = /^ce capitala are (.+)$/.exec(w))) { const p = placeOf(m[1]); if (p) return { act: 'ask.capital', roles: { place: p.en } }; }
  // where: "unde este Franta"
  if ((m = /^unde (?:este|e|se afla) (.+)$/.exec(w))) { const p = placeOf(m[1]); if (p) return { act: 'ask.where', roles: { thing: p.en } }; const r = nounPhrase(keys, 2); if (r && r.next === keys.length) return { act: 'ask.where', roles: { np: r.np } }; }
  // how many parts a thing has / how many things are in a thing: "cate picioare are un paianjen", "cate zile sunt intr-o saptamana"
  if (keys[0] === 'cate' && keys.length >= 4) {
    const part = rawAnalyses(keys, 1).find((a) => a.pos === 'noun');
    if (part && /^(are|au)$/.test(keys[2])) { const r = nounPhrase(keys, 3); if (r && r.next === keys.length) return { act: 'ask.count.has', roles: { part: plOf(part.entry), np: r.np } }; }
  }
  // sound: "ce sunet scoate o vaca", "ce spune vaca"
  if ((m = /^ce sunet(?:e)? (?:scoate|face|emite) /.exec(w)) || (m = /^ce spune /.exec(w))) { const r = nounPhrase(keys, m[0].trim().split(' ').length); if (r && r.next === keys.length) return { act: 'ask.sound', roles: { np: r.np } }; }
  // day / month after, before: "ce zi vine dupa luni", "ce zi e dupa luni"
  if ((m = /^ce (zi|luna) (?:vine|e|este|urmeaza) (dupa|inainte de) (\S+)$/.exec(w))) { const en = DAYS_MONTHS.get(m[3]); if (en) return { act: 'ask.sequence', roles: { unit: m[1] === 'zi' ? 'day' : 'month', rel: m[2] === 'dupa' ? 'after' : 'before', value: en } }; }
  // what is a thing
  if (/^ce (?:este|e) /.test(w)) { const r = nounPhrase(keys, 2); if (r && r.next === keys.length) return { act: 'ask.what', roles: { np: r.np } }; }
  // colour mix: "ce fac rosul si galbenul", "ce obtii cand amesteci rosu cu galben"
  if ((m = /^ce (?:fac|rezulta din|se obtine din) (\S+) si (\S+)$/.exec(w)) || (m = /^ce obtii cand amesteci (\S+) cu (\S+)$/.exec(w))) { const a = colourOf(m[1]), b = colourOf(m[2]); if (a && b) return { act: 'ask.mix', roles: { a, b } }; }
  return null;
}

/** The frame of an imperative: verb, objects, a place / direction / colour. */
function parseRequest(keys) {
  const v = verbAt(keys, 0);
  if (!v?.act) return null;
  const refl = v.enclitic === 'ti';
  const first = nounPhrase(keys, 1);
  if (!first) return null;
  const objs = [first.np]; let i = first.next;
  let colour = null, rel = null, place = null, dir = null;
  while (i < keys.length) {
    budget.tick('grammar-ro.request');
    if (keys[i] === 'si' || keys[i] === 'cu') { const nx = nounPhrase(keys, i + 1); if (nx) { objs.push(nx.np); i = nx.next; continue; } }
    const d = take(keys, i, DIR);
    if (d) { dir = d.en; i += d.len; continue; }
    const r2 = take(keys, i, REL2) ?? take(keys, i, REL);
    if (r2) { const nx = nounPhrase(keys, i + r2.len); if (nx) { rel = r2.en; place = nx.np.bare ? { ...nx.np, def: true } : nx.np; i = nx.next; continue; } }
    const aa = best(analyses(keys[i]), 'adj');
    if (aa && !colour) { colour = aa.entry.en; i++; continue; }
    return null;
  }
  // "fa X Y": definite objects and a colour as the complement are a change ("make the house red")
  if (v.en === 'make' && objs.every((o) => o.def) && !rel && !dir) {
    const withAdj = objs.filter((o) => o.adjs.length);
    const strip = (o) => ({ ...o, adjs: [], poss: refl });
    if (colour && !withAdj.length) return { act: 'change.colour', roles: { things: objs.map(strip), colours: [colour] } };
    if (!colour && withAdj.length === objs.length) return { act: 'change.colour', roles: { things: objs.map(strip), colours: objs.map((o) => o.adjs[0]) } };
    if (!colour && withAdj.length === 1 && withAdj[0] === objs.at(-1)) return { act: 'change.colour', roles: { things: objs.map(strip), colours: [objs.at(-1).adjs[0]] } };
  }
  const where = { ...(rel ? { rel, place } : {}), ...(dir ? { dir } : {}) };
  if (refl && v.en === 'put' && !rel && !dir && !colour) return { act: 'wear', roles: { things: objs } };
  if (v.act === 'make') return { act: 'make', roles: { verb: v.en === 'make' ? 'draw' : v.en, things: objs, ...(colour ? { colour } : {}), ...where } };
  if (v.act === 'move') return { act: 'move', roles: { thing: objs[0], ...where } };
  if (v.act === 'remove') return { act: 'remove', roles: { verb: v.en, things: objs } };
  if (v.act === 'show') return { act: 'show', roles: { thing: objs[0], me: v.enclitic === 'mi', ...where } };
  return null;
}

// ---- realisation in English (the phrasing the English reader's frames read) ------------------------------------------------------------------
const QUESTION_ACTS = /^(ask\.|story\.(count|total|who-more))/;
export function realiseEn(frame) {
  const { act, roles: r } = frame;
  const list = (nps) => nps.map((n) => npEn(n)).join(' and ');
  switch (act) {
    case 'make': {
      const parts = r.things.map((n) => (r.colour && !n.adjs.length ? npEn({ ...n, adjs: [r.colour] }) : npEn(n)));
      return `${r.verb} ${parts.join(' and ')}${r.rel ? ` ${r.rel} ${npEn(r.place)}` : ''}${r.dir ? ` ${r.dir}` : ''}`;
    }
    case 'change.colour': return r.colours.length === 1 ? `make ${list(r.things)} ${r.colours[0]}` : `make ${r.things.map((n, k) => `${npEn(n)} ${r.colours[k]}`).join(' and ')}`;
    case 'wear': return `wear ${list(r.things)}`;
    case 'move': return `move ${npEn(r.thing)}${r.rel ? ` ${r.rel} ${npEn(r.place)}` : ''}${r.dir ? ` ${r.dir}` : ''}`;
    case 'remove': return `${r.verb} ${list(r.things)}`;
    case 'show': return `show ${r.me ? 'me ' : ''}${npEn(r.thing)}${r.rel ? ` ${r.rel} ${npEn(r.place)}` : ''}${r.dir ? ` ${r.dir}` : ''}`;
    case 'do.arith': return { aduna: `add ${r.a} and ${r.b}`, scade: `subtract ${r.a} from ${r.b}`, inmulteste: `multiply ${r.a} by ${r.b}`, imparte: `divide ${r.a} by ${r.b}` }[r.verb];
    case 'story.has': return `${r.name} has ${cnt(r.count, r.item)}`;
    case 'story.change': return `${r.name} ${r.verb} ${r.count}${r.more ? ' more' : ''}`;
    case 'story.give': return `${r.giver} gives ${r.name} ${cnt(r.count, r.item)}`;
    case 'story.count': return `how many ${plOf(r.item)} does ${r.name} have${r.left ? ' left' : ''}`;
    case 'story.total': return `how many ${plOf(r.item)} do they have altogether`;
    case 'story.who-more': return `who has more ${plOf(r.item)}`;
    case 'ask.capital': return `what is the capital of ${r.place}`;
    case 'ask.where': return `where is ${r.thing ?? npEn(r.np)}`;
    case 'ask.sum': return r.verb ? `${r.verb} ${r.a} ${r.op} ${r.b}` : `how much is ${r.a} ${r.op} ${r.b}`;
    case 'ask.count.has': return `how many ${r.part} does ${npEn(r.np)} have`;
    case 'ask.sound': return `what sound does ${npEn(r.np)} make`;
    case 'ask.sequence': return `what ${r.unit} comes ${r.rel} ${r.value}`;
    case 'ask.what': return `what is ${npEn(r.np)}`;
    case 'ask.mix': return `what do ${r.a} and ${r.b} make`;
    default: return '';
  }
}

export function grammarRoEn(text, opts = {}) {
  const parts = String(text ?? '').trim().split(/(?<=[.!?])\s+|,\s+iar\s+/).map((x) => x.trim()).filter(Boolean);
  const out = [], frames = [];
  for (const part of parts) {
    const p = parseRo(part, opts);
    if (!p.ok) return { text: '', ok: false, frame: null, notes: p.notes };
    frames.push(p.frame);
    out.push(realiseEn(p.frame) + (QUESTION_ACTS.test(p.frame.act) ? '?' : '.'));
  }
  if (!out.length) return { text: '', ok: false, frame: null, notes: ['empty'] };
  return { text: out.join(' '), ok: true, frame: frames.length === 1 ? frames[0] : frames, notes: [] };
}
export default { parseRo, realiseEn, grammarRoEn };
