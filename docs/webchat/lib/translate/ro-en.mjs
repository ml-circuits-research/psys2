// Romanian -> English translation engine (rule based, browser-safe).
//
// Pipeline per sentence:  tokens -> number words -> phrase frames -> items (NP, VG, wh, pp ...)
//                         -> clause splitting -> clause grammar -> pieces with source spans.
import { tokenize, splitSentences, foldKey } from './normalize.mjs?v=136a228c61';
import * as M from './morphology.ro.mjs?v=280cb6d3a2';
import * as E from './inflect.en.mjs?v=bb4799b9ff';
import { FRAMES } from './phrases.ro-en.mjs?v=fe79201d73';
import { budget } from '../dialog/budget.mjs?v=123c3e1329';

// ------------------------------------------------------------------ static tables

const PRON = {
  eu: { en: 'I', obj: 'me', person: 1, number: 'sg' },
  tu: { en: 'you', obj: 'you', person: 2, number: 'sg' },
  el: { en: 'he', obj: 'him', person: 3, number: 'sg' },
  ea: { en: 'she', obj: 'her', person: 3, number: 'sg' },
  noi: { en: 'we', obj: 'us', person: 1, number: 'pl' },
  voi: { en: 'you', obj: 'you', person: 2, number: 'pl' },
  ei: { en: 'they', obj: 'them', person: 3, number: 'pl' },
  ele: { en: 'they', obj: 'them', person: 3, number: 'pl' },
  dumneavoastra: { en: 'you', obj: 'you', person: 2, number: 'pl' },
  dumneata: { en: 'you', obj: 'you', person: 2, number: 'sg' },
  mine: { en: 'me', obj: 'me', person: 1, number: 'sg' },
  tine: { en: 'you', obj: 'you', person: 2, number: 'sg' },
};

// clitics: dat = indirect object, acc = direct object, subj = subject pronoun for experiencer verbs
const CLITIC = {
  ma: { acc: 'me', subj: 'I', person: 1, number: 'sg' }, m: { acc: 'me', subj: 'I', person: 1, number: 'sg' },
  te: { acc: 'you', subj: 'you', person: 2, number: 'sg' }, t: { acc: 'you', subj: 'you', person: 2, number: 'sg' },
  il: { acc: 'it', person: 3, number: 'sg' }, l: { acc: 'it', person: 3, number: 'sg' },
  o: { acc: 'it', person: 3, number: 'sg' },
  ne: { acc: 'us', dat: 'us', subj: 'we', person: 1, number: 'pl' },
  va: { acc: 'you', dat: 'you', subj: 'you', person: 2, number: 'pl' },
  le: { acc: 'them', dat: 'them', subj: 'they', person: 3, number: 'pl' },
  ii: { acc: 'them', dat: 'him', subj: 'he', person: 3, number: 'sg' },
  i: { dat: 'him', subj: 'he', person: 3, number: 'sg' },
  imi: { dat: 'me', subj: 'I', person: 1, number: 'sg' }, mi: { dat: 'me', subj: 'I', person: 1, number: 'sg' },
  iti: { dat: 'you', subj: 'you', person: 2, number: 'sg' }, ti: { dat: 'you', subj: 'you', person: 2, number: 'sg' },
  se: { refl: true }, isi: { refl: true, dat: 'himself', subj: 'he', person: 3, number: 'sg' },
};
const DAT_CLITICS = new Set(['ii', 'i', 'le', 'imi', 'mi', 'iti', 'ti', 'ne', 'va']);

const AUX_PERF = { am: [[1, 'sg'], [1, 'pl']], ai: [[2, 'sg']], a: [[3, 'sg']], au: [[3, 'pl']], ati: [[2, 'pl']] };
const AUX_FUT = { voi: [1, 'sg'], vei: [2, 'sg'], va: [3, 'sg'], vom: [1, 'pl'], veti: [2, 'pl'], vor: [3, 'pl'] };
const AUX_COND = { as: [[1, 'sg']], ar: [[3, 'sg'], [3, 'pl']] };
const NEG_KEYS = new Set(['nu', 'nici', 'nimic', 'nimeni', 'niciodata', 'nicaieri', 'niciun', 'nicio', 'fara']);
const NEG_EN = /\b(not|no|never|nothing|nobody|nowhere|without|nor|any|anything|anyone|ever|neither)\b/i;
const WH_EN = /\b(who|what|which|where|when|how|why)\b/i;
const TIME_OF_DAY = { 'dimineață': ['in', false], 'seară': ['in', false], 'amiază': ['at', true], 'după-amiază': ['in', false], 'noapte': ['at', true], 'vară': ['in', true], 'iarnă': ['in', true], 'toamnă': ['in', true], 'primăvară': ['in', true] };
const COGNITION = new Set(['ști', 'vedea', 'auzi', 'spune', 'crede', 'întreba', 'gândi', 'înțelege']);
const SPECIAL_LISTVERBS = new Set(['adăuga', 'pune', 'scrie']);

// ------------------------------------------------------------------ small helpers

const pc = (en, tok, extra = {}) => ({ en, src: tok ? [tok.start, tok.end] : null, ...extra });
const pspan = (en, s, e, extra = {}) => ({ en, src: [s, e], ...extra });

function analysesOf(tok) {
  if (!tok.an) {
    if (tok.synth) tok.an = tok.synth;
    else if (tok.kind === 'word') {
      let an = M.analyzeRaw(tok.raw, !!tok.diaFree);
      // names are only taken when capitalized (handled in the NP parser)
      tok.an = an;
    } else tok.an = [];
  }
  return tok.an;
}
const funcOf = (tok, fpos) => analysesOf(tok).find((a) => a.pos === 'func' && (!fpos || a.fpos === fpos));
const nounsOf = (tok) => analysesOf(tok).filter((a) => a.pos === 'noun');
const adjOf = (tok) => analysesOf(tok).find((a) => a.pos === 'adj');
const verbsOf = (tok) => analysesOf(tok).filter((a) => a.pos === 'verb');
const isWord = (t) => t && t.kind === 'word';

const CLITIC_AUX = /^(m|t|l|i|mi|ti|ne|va|le)-(am|ai|a|au|ati|as|ar)$/;

function splitClitics(toks) {
  const out = [];
  for (const t of toks) {
    if (t.kind === 'word' && CLITIC_AUX.test(t.key)) {
      const h = t.raw.indexOf('-');
      const clitic = { ...t, raw: t.raw.slice(0, h), key: t.key.slice(0, t.key.indexOf('-')), end: t.start + h, isCap: t.isCap };
      const aux = { ...t, raw: t.raw.slice(h + 1), key: t.key.slice(t.key.indexOf('-') + 1), start: t.start + h + 1, isCap: false };
      out.push(clitic, aux);
    } else out.push(t);
  }
  return out;
}

function prepareTokens(toksIn) {
  const toks = splitClitics(toksIn);
  const keys = toks.map((t) => (t.kind === 'word' ? t.key : null));
  const out = [];
  const isNoteLetter = (t) => t && t.kind === 'word' && /^[A-G]$/.test(t.raw);
  const wordToks = toks.filter((t) => t.kind === 'word');
  const letterGuess = wordToks.length >= 2 && wordToks.some((t) => t.raw.length === 1) && wordToks.every((t) => t.raw.length === 1 || /^(nu|da|stai)$/.test(t.key)) && wordToks.filter((t) => t.raw.length === 1).length >= 2;
  for (let i = 0; i < toks.length; i++) {
    budget.tick('ro-en.isNoteLetter');
    const t = toks[i];
    // a run of note letters ("C D E F G", "A4"): one fixed piece, never read as words ("E" is not "is")
    if (isNoteLetter(t) && (isNoteLetter(toks[i + 1]) || (toks[i + 1]?.kind === 'num' && toks[i + 1].start === t.end))) {
      let j = i, txt = '';
      while (j < toks.length && (isNoteLetter(toks[j]) || (toks[j].kind === 'num' && toks[j - 1] && toks[j].start === toks[j - 1].end && isNoteLetter(toks[j - 1])))) { budget.tick('ro-en.isNoteLetter2'); txt += (isNoteLetter(toks[j]) && txt ? ' ' : '') + toks[j].raw; j++; }
      out.push({ kind: 'fixed', raw: txt, start: t.start, end: toks[j - 1].end, pieces: [{ en: txt, src: [t.start, toks[j - 1].end] }] });
      i = j - 1;
      continue;
    }
    // a chess square ("e4", "d2"): one name-like word, not "is" + 4
    if (t.kind === 'word' && /^[a-hA-H]$/.test(t.raw) && toks[i + 1]?.kind === 'num' && toks[i + 1].start === t.end && /^[1-8]$/.test(toks[i + 1].raw)) {
      out.push({ kind: 'word', raw: t.raw.toLowerCase() + toks[i + 1].raw, key: t.raw.toLowerCase() + toks[i + 1].raw, start: t.start, end: toks[i + 1].end, isCap: true, an: [] });
      i++;
      continue;
    }
    // a guess made of single letters ("e, nu, z"): the letters are letters, not "is" or "has"
    if (t.kind === 'word' && t.raw.length === 1 && letterGuess) { out.push({ ...t, isCap: true, raw: t.raw.toUpperCase(), key: t.key, an: [] }); continue; }
    if (t.kind === 'word') {
      const r = M.parseNumberAt(keys, i);
      if (r && (t.key === 'una' || t.key === 'unul') && keys[i + 1] && M.analyze(keys[i + 1]).some((a) => a.pos === 'adj')) { out.push(t); continue; }   // "una roșie" = a red one, not 1 tomato
      if (r) {
        const last = toks[i + r.len - 1];
        out.push({ kind: 'num', raw: String(r.value), value: String(r.value), key: String(r.value), start: t.start, end: last.end, fromWords: true });
        i += r.len - 1;
        continue;
      }
    }
    // "la stinga", "din stinga" (the old spelling, no diacritics): the side, not the verb "să stingă" (turn off)
    if (t.kind === 'word' && t.key === 'stinga' && /^(la|in|din|spre|pe)$/.test(toks[i - 1]?.key ?? '')) { out.push({ ...t, key: 'stanga', an: M.analyze('stanga') }); continue; }
    out.push(t);
  }
  return out;
}

// ------------------------------------------------------------------ phrase frames

const COMPILED = FRAMES.map((f) => ({
  ...f,
  els: f.p.split(' ').map((el) => {
    const m = /^\{(\w+)(?::(\w+))?(?:#(\w+))?\}$/.exec(el);
    return m ? { slot: m[1], mod: m[2] || null, tag: m[1] + (m[3] || '') } : { alts: el.split('|').map((a) => foldKey(a)) };
  }),
})).sort((a, b) => b.els.length - a.els.length);

function matchFrame(f, toks, p, info) {
  const slots = {};
  let alt0 = null;
  const rec = (k, pos) => {
    budget.tick('translate.frame');
    if (k === f.els.length) return pos;
    const el = f.els[k];
    // a comma between frame elements is skipped ("Da, are" ~ "da are"; "Între Tom și Ana, cine ...")
    if (k > 0 && el.slot !== 'rest' && toks[pos] && toks[pos].kind === 'punct' && toks[pos].raw === ',') pos++;
    const t = toks[pos];
    if (el.alts) {
      if (!t || (t.kind !== 'word' && t.kind !== 'num' && !(t.kind === 'punct' && el.alts.includes(t.raw))) || t.synth || !el.alts.includes(t.key)) return -1;
      if (k === 0) alt0 = t.key;
      return rec(k + 1, pos + 1);
    }
    if (el.slot === 'np') {
      if (!t) return -1;
      let r = null;
      if (el.mod === 'short' || el.mod === 'sbare') {
        for (let e = pos + 1; e <= toks.length && !r; e++) {
          const c = parseNP(toks.slice(0, e), pos, info, null);
          if (c && c.next === e && c.np.head) r = c;
        }
      } else r = parseNP(toks, pos, info, null);
      if (!r) return -1;
      slots[el.tag] = { pieces: renderNP(r.np, el.mod === 'bare' || el.mod === 'sbare' ? { noArticle: true } : {}), tok0: toks[pos] };
      return rec(k + 1, r.next);
    }
    if (el.slot === 'num') {
      if (!t || t.kind !== 'num') return -1;
      slots[el.tag] = { value: t.value, tok: t };
      return rec(k + 1, pos + 1);
    }
    if (el.slot === 'name') {
      if (!t || t.kind !== 'word' || !(t.isCap || M.isKnownName(t.key)) || t.synth) return -1;
      slots[el.tag] = { tok: t };
      return rec(k + 1, pos + 1);
    }
    if (el.slot === 'fw') {
      if (!t || t.kind !== 'word' || t.synth) return -1;
      const a = analysesOf(t).find((x) => x.pos === 'func' && /^(day|month|season)$/.test(x.fpos));
      const sn = a ? null : analysesOf(t).find((x) => x.pos === 'noun' && /^(winter|spring|summer|autumn)$/.test(x.entry.en));   // seasons are nouns
      if (!a && !sn) return -1;
      slots[el.tag] = { tok: t, en: (a || sn).entry.en };
      return rec(k + 1, pos + 1);
    }
    if (el.slot === 'sq') {   // a chess square: e4
      if (!t || t.kind !== 'word' || !/^[a-h][1-8]$/.test(t.key)) return -1;
      slots[el.tag] = { tok: t };
      return rec(k + 1, pos + 1);
    }
    if (el.slot === 'col') {   // a colour word, with or without its article: roșu, roșul, galbenul, verdele
      if (!t || t.kind !== 'word' || t.synth) return -1;
      const base = [t.key, t.key.replace(/(ul|le|a)$/, ''), t.key.replace(/ul$/, 'u')];
      let en = null;
      for (const b of base) { const a = M.analyze(b).find((x) => x.pos === 'adj' && x.entry.group === 'colour') || M.analyze(b).find((x) => x.pos === 'adj' && COLOURS.has(x.entry.en)); if (a) { en = a.entry.en; break; } }
      if (!en) return -1;
      slots[el.tag] = { tok: t, en };
      return rec(k + 1, pos + 1);
    }
    if (el.slot === 'v' || el.slot === 'adj') {
      if (!t || t.kind !== 'word' || t.synth) return -1;
      const a = M.analyzeRaw(t.raw, !!t.diaFree).find((x) => x.pos === (el.slot === 'v' ? 'verb' : 'adj'));
      if (!a) return -1;
      slots[el.tag] = { tok: t, en: a.entry.en.split('/')[0] };
      return rec(k + 1, pos + 1);
    }
    if (el.slot === 'w') {
      if (!t || t.kind !== 'word') return -1;
      slots[el.tag] = { tok: t };
      return rec(k + 1, pos + 1);
    }
    if (el.slot === 'rest') {
      if (pos >= toks.length) return -1;
      const last = k === f.els.length - 1;
      for (let end = last ? toks.length : pos + 1; end <= toks.length; end++) {
        if (last) {
          let hasComma = false;
          for (let i = pos; i < end; i++) if (toks[i].kind === 'punct' && toks[i].raw === ',') hasComma = true;
          if (hasComma) return -1;
        }
        slots[el.tag] = { toks: toks.slice(pos, end) };
        const r = rec(k + 1, end);
        if (r >= 0) return r;
        if (last) break;
      }
      return -1;
    }
    return -1;
  };
  const pos = rec(0, p);
  if (pos < 0) return null;
  if (f.full && (p !== 0 || pos !== toks.length)) return null;
  if (f.start && p !== 0) return null;
  if (f.q !== undefined && !!info.q !== f.q) return null;
  return { end: pos, slots, alt0 };
}

function applyFrames(toks, info) {
  // token frames (multi-word lexical units) first, then sentence frames
  return applyFramePass(applyFramePass(toks, info, 'nounTokens'), info, 'rest');
}

function applyFramePass(toks, info, tokenPass) {
  let out = toks.slice();
  let p = 0;
  while (p < out.length) {
    budget.tick('translate.parse');
    if ((out[p].kind === 'word' || out[p].kind === 'num') && !out[p].synth) {
      for (const f of COMPILED) {
        const early = !!f.token && f.token.fpos === 'noun';
        if ((tokenPass === 'nounTokens') !== early) continue;
        const m = matchFrame(f, out, p, info);
        if (!m) continue;
        const first = out[p];
        const last = out[m.end - 1];
        const repl = f.token ? makeTokenFrame(f, out.slice(p, m.end)) : makeFixed(f, m, first, last, info);
        out.splice(p, m.end - p, repl);
        break;
      }
    }
    p++;
  }
  return out;
}

function makeTokenFrame(f, covered) {
  const t = f.token;
  const key = covered.map((x) => x.key).join(' ');
  const first = covered[0];
  const last = covered[covered.length - 1];
  let synth;
  if (t.fpos === 'noun') {
    const entry = { pos: 'noun', ro: key, rop: null, en: t.en, enp: null, g: 'n', flags: new Set([...(t.mass ? ['mass'] : []), ...(t.anim ? ['anim'] : [])]), extra: [] };
    synth = [{ pos: 'noun', entry, number: 'sg', def: !!t.def, gen: false }];
  } else {
    const entry = { pos: t.fpos, en: t.en, keys: [key], flags: new Set(t.flags || []), kind: t.kind, ro: key };
    synth = [{ pos: 'func', fpos: t.fpos, entry }];
  }
  return { kind: 'word', raw: covered.map((x) => x.raw).join(' '), key, start: first.start, end: last.end, isCap: false, synth };
}

function makeFixed(f, m, first, last, info) {
  let out = f.out;
  if (f.sub && m.alt0) { const sk = Object.keys(f.sub).find((k) => foldKey(k) === m.alt0); if (sk) out = f.sub[sk]; }
  if (f.full) info.fullFrame = true;
  const pieces = [];
  const span = [first.start, last.end];
  let lit = [];
  const flush = () => { if (lit.length) { pieces.push(pspan(lit.join(' '), span[0], span[1])); lit = []; } };
  for (const w of out.split(' ')) {
    const sm = /^\{(\w+)(?::(\w+))?(?:#(\w+))?\}$/.exec(w);
    if (!sm) { lit.push(w); continue; }
    const [, name, mod, idx] = sm;
    const tag = name + (idx || '');
    const sl = m.slots[tag];
    if (name === 'num') {
      flush();
      const v = sl.value;
      let txt = v;
      if (mod === 'times') txt = v === '2' ? 'twice' : `${v} times`;
      pieces.push(pc(txt, sl.tok));
    } else if (name === 'name') {
      flush();
      pieces.push(pc(mod === 'cap' ? sl.tok.raw[0].toUpperCase() + sl.tok.raw.slice(1) : mod === 'dat' ? dativeName(sl.tok.raw) : sl.tok.raw, sl.tok));
    } else if (name === 'np') { flush(); pieces.push(...sl.pieces); }
    else if (name === 'rest') {
      flush();
      if (mod === 'raw') pieces.push(...sl.toks.map((t) => pc(t.raw, t, t.kind === 'punct' ? { punct: true } : {})));
      else if (mod === 'cont') {   // text the user wants written down: translated, keeping the capital letter of its first word
        const toks2 = sl.toks.map((t, i) => (i === 0 && t.key === 'salut' ? { ...t, an: undefined, synth: [{ pos: 'func', fpos: 'interj', entry: { pos: 'interj', en: 'hello', keys: ['salut'], flags: new Set(), ro: 'salut' } }] } : t));
        const ps = processTokens(toks2, { ...info, frag: true, q: false, excl: false });
        const cap = /^\p{Lu}/u.test(sl.toks[0].raw);
        if (ps.length && ps[0].en) ps[0] = { ...ps[0], en: cap ? ps[0].en[0].toUpperCase() + ps[0].en.slice(1) : ps[0].en[0].toLowerCase() + ps[0].en.slice(1) };
        pieces.push(...ps.filter((x, i) => !(x.art && ps[i + 1] && ps[i + 1].src && x.src && x.src[0] === ps[i + 1].src[0] && x.src[1] === ps[i + 1].src[1])));   // no article for a bare noun
      }
      else if (mod === 'inf' || mod === 'binf') {
        // "să ud plantele" -> "to water the plants": translate as "vreau să ..." and drop the main clause
        const s0 = sl.toks[0];
        const fake = { kind: 'word', raw: 'vreau', key: 'vreau', start: s0.start, end: s0.start, isCap: false };
        const out = processTokens([fake, ...sl.toks], { ...info, frag: true, q: false, excl: false });
        const wi = out.findIndex((x) => /\bwant\b/.test(x.en));
        const after = wi >= 0 ? out.slice(wi + 1) : out;
        if (mod === 'binf' && after.length && /^to$/i.test(after[0].en)) after.shift();   // "can you {delete the house}": no "to"
        pieces.push(...after);
      }
      else pieces.push(...processTokens(sl.toks, { ...info, frag: true, q: false, excl: false }));
    } else if (name === 'sq') { flush(); pieces.push(pc(sl.tok.raw, sl.tok)); }
    else if (name === 'w') { flush(); pieces.push(pc(mod === 'cap' ? sl.tok.raw[0].toUpperCase() + sl.tok.raw.slice(1) : sl.tok.raw, sl.tok)); }
    else if (name === 'v' || name === 'adj' || name === 'fw' || name === 'col') { flush(); pieces.push(pc(sl.en, sl.tok)); }
  }
  flush();
  if (/\bas (many|much)\b/.test(out)) info.useAs = true;
  return { kind: 'fixed', raw: '', start: first.start, end: last.end, pieces, verbal: !!f.verbal };
}

// ------------------------------------------------------------------ noun phrases

function startsNP(toks, i) {
  const t = toks[i];
  if (!t) return false;
  if (t.kind === 'num') return true;
  if (!isWord(t)) return false;
  return analysesOf(t).some((a) => a.pos === 'noun' || (a.pos === 'func' && a.fpos === 'det')) || (t.isCap && !funcOf(t));
}

function detEn(entry, key) {
  switch (entry.en) {
    case 'this/these': return /^(acesti|aceste)$/.test(key) ? 'these' : 'this';
    case 'that/those': return /^(acei|acele)$/.test(key) ? 'those' : 'that';
    default: return entry.en;
  }
}

/** English word for a Romanian word used as a modifier (noun, adjective or operator word), else the word itself. */
function wordEn(tok) {
  const n = nounsOf(tok)[0];
  if (n) return n.entry.en;
  const a = adjOf(tok);
  if (a) return a.entry.en;
  const f = funcOf(tok);
  return f ? f.entry.en : tok.raw;
}

function dativeName(raw) {
  // Mariei -> Maria, Anei -> Ana, Andreei -> Andreea
  if (/eei$/.test(raw)) return raw.slice(0, -1) + 'a';
  if (/ei$/.test(raw)) return raw.slice(0, -2) + 'a';
  if (/ii$/.test(raw)) return raw.slice(0, -2) + 'a';
  return raw;
}

function looksFeminineDative(tok) {
  if (!tok.isCap || M.isKnownName(tok.key)) return false;
  if (!/(ei|ii)$/.test(tok.raw)) return false;
  return M.isKnownName(foldKey(dativeName(tok.raw)));
}

/**
 * Parse a noun phrase starting at toks[i]. prev = previous item (for noun/adjective ambiguity).
 * Returns { np, next } or null.
 */
function parseNP(toks, i, info, prev) {
  budget.tick('translate.np');
  let j = i;
  const np = { t: 'np', det: null, num: null, quant: null, adjs: [], pre: [], head: null, number: null, def: false, poss: null, possessor: null, dat: false, forceDef: false };
  const spanOf = [toks[i].start, toks[i].end];
  const grow = (tok) => { spanOf[0] = Math.min(spanOf[0], tok.start); spanOf[1] = Math.max(spanOf[1], tok.end); };
  let sawPrefix = false;

  // dative "lui X"
  if (isWord(toks[j]) && toks[j].key === 'lui' && startsNP(toks, j + 1)) { np.dat = true; np.luiTok = toks[j]; j++; }

  for (;;) {
    budget.tick('translate.np');
    const t = toks[j];
    if (!t) break;
    if (t.kind === 'num') {
      if (np.num) break;
      np.num = { val: t.value, tok: t };
      j++; grow(t); sawPrefix = true;
      if (isWord(toks[j]) && toks[j].key === 'de' && startsNP(toks, j + 1) && toks[j + 1].kind !== 'num') j++;
      continue;
    }
    if (!isWord(t)) break;
    const f = funcOf(t);
    if (f && f.fpos === 'det' && !t.synth) {
      if (np.det || np.quant) break;
      const nxt = toks[j + 1];
      // "o" before a verb is a clitic, not an article
      if (t.key === 'o' && !(nxt && (nounsOf(nxt).length || adjOf(nxt) || nxt.kind === 'num' || nxt.isCap || funcOf(nxt, 'det')))) break;
      const e = f.entry;
      if (e.flags.has('quant')) np.quant = { en: detEn(e, t.key), tok: t, kind: e.en, pl: /^vre/.test(t.key) };
      else np.det = { en: detEn(e, t.key), tok: t, ro: e.ro };
      j++; grow(t); sawPrefix = true;
      continue;
    }
    if ((t.key === 'mai') && isWord(toks[j + 1]) && /^(multi|multe|multa|putini|putine|putina)$/.test(toks[j + 1].key)) {
      const q = toks[j + 1].key;
      np.quant = { en: /^m/.test(q) ? 'more' : 'fewer', tok: t, tok2: toks[j + 1], kind: 'comp' };
      j += 2; grow(toks[j - 1]); sawPrefix = true;
      continue;
    }
    if ((t.key === 'mult' || t.key === 'putin') && toks[j + 1] && nounsOf(toks[j + 1]).some((a) => a.entry.flags.has('mass'))) {
      np.quant = { en: t.key === 'mult' ? 'much' : 'little', tok: t, kind: 'mass' };
      j++; grow(t); sawPrefix = true;
      continue;
    }
    // "cel mai mare animal" -> the biggest animal ; "cel/cea ..." -> the
    if (/^(cel|cea|cei|cele)$/.test(t.key) && !np.det) {
      if (toks[j + 1] && toks[j + 1].key === 'mai' && toks[j + 2] && adjOf(toks[j + 2])) {
        const a = adjOf(toks[j + 2]);
        np.det = { en: 'the', tok: t };
        np.adjs.push({ en: a.entry.sup || `most ${a.entry.en}`, tok: toks[j + 2], tok0: toks[j + 1] });
        j += 3; grow(toks[j - 1]); sawPrefix = true;
        continue;
      }
      if (toks[j + 1] && (adjOf(toks[j + 1]) || nounsOf(toks[j + 1]).length)) {
        np.det = { en: 'the', tok: t }; j++; grow(t); sawPrefix = true; continue;
      }
    }
    // pre-nominal adjectives after a determiner / number: "două mari mingi" (rare) – only if a noun follows
    const a = adjOf(t);
    if (a && sawPrefix && toks[j + 1] && nounsOf(toks[j + 1]).length && !nounsOf(t).length) {
      np.adjs.push({ en: a.entry.en, tok: t });
      j++; grow(t);
      continue;
    }
    break;
  }

  // head
  const t = toks[j];
  if (t && isWord(t) && t.raw.length === 1 && np.det && /^(a|an)$/.test(np.det.en) && !np.num && /^\p{L}$/u.test(t.raw)) {   // "există un E": a letter
    np.head = { kind: 'name', tok: t, text: t.raw.toUpperCase() };
    j++; grow(t);
  } else if (t && isWord(t)) {
    const an = analysesOf(t);
    let cands = an.filter((a) => a.pos === 'noun');
    if (cands.length) {
      if (np.num) cands = cands.slice().sort((x, y) => Number(y.entry.flags.has('unit')) - Number(x.entry.flags.has('unit')));
      else cands = cands.slice().sort((x, y) => Number(x.entry.flags.has('unit')) - Number(y.entry.flags.has('unit')));
    }
    const isAdjToo = !!adjOf(t);
    const prevBe = prev && prev.t === 'vg' && prev.entry.inf === 'fi';
    const prevAdv = prev && prev.t === 'adv' && /^(very|more)$/.test(prev.en);
    // weekday / month names (luni) are not plural nouns unless a number precedes
    const func = funcOf(t);
    const dayLike = func && (func.fpos === 'day' || func.fpos === 'month');
    if (cands.length && dayLike && !np.num && !np.quant) cands = [];
    if (cands.length && isAdjToo && (prevBe || prevAdv) && !np.num && !np.det) cands = [];
    if (cands.length && !sawPrefix && func && func.fpos === 'month') cands = [];
    if (cands.length > 1 && cands.every((c) => c.entry === cands[0].entry) && new Set(cands.map((c) => c.number)).size > 1 && !np.num) {
      // a noun with one form for singular and plural ("ochi"): the next adjective's number decides, else "un" = singular, else plural
      const nxA = toks[j + 1] && toks[j + 1].kind === 'word' ? analysesOf(toks[j + 1]).filter((a) => a.pos === 'adj') : [];
      let want = null;
      if (!nxA.length && toks[j + 1] && funcOf(toks[j + 1], 'poss')) want = /^(tai|tale|mei|mele|sai|sale|nostri|noastre|vostri|voastre)$/.test(toks[j + 1].key) ? 'pl' : 'sg';
      else if (nxA.length && new Set(nxA.map((a) => a.number)).size === 1) want = nxA[0].number;
      else if (np.det && /^(a|an|this|that|each)$/.test(np.det.en)) want = 'sg';
      else if (!np.det && !np.quant) want = 'pl';
      const pick = want && cands.find((c) => c.number === want);
      if (pick) cands = [pick, ...cands.filter((c) => c !== pick)];
    }
    if (cands.length && cands[0]) {
      const c = cands[0];
      np.head = { kind: 'noun', entry: c.entry, tok: t, number: c.number, def: c.def, gen: c.gen };
      if (c.gen && c.def && !sawPrefix) np.dat = true;
      j++; grow(t);
    } else if (M.isKnownName(t.key) && t.isCap && !t.synth) {
      np.head = { kind: 'name', tok: t, text: t.raw };
      j++; grow(t);
    } else if (M.placeOf(t.key) && !t.synth && !cands.length) {
      np.head = { kind: 'name', tok: t, text: M.placeOf(t.key).en };
      j++; grow(t);
    } else if (looksFeminineDative(t) && !sawPrefix) {
      np.head = { kind: 'name', tok: t, text: dativeName(t.raw) };
      np.dat = true; j++; grow(t);
    } else if (an.length === 0 && (t.isCap || sawPrefix) && !t.synth) {
      if (t.isCap) np.head = { kind: 'name', tok: t, text: info.dativeContext && /(ei|ii)$/.test(t.raw) ? dativeName(t.raw) : t.raw };
      else np.head = { kind: 'unknown', tok: t, text: t.raw };
      if (np.head.kind === 'name' && info.dativeContext && /(ei|ii)$/.test(t.raw)) np.dat = true;
      j++; grow(t);
    }
  }
  if (!np.head && !sawPrefix) return null;
  if (!np.head && sawPrefix && !np.num && !np.adjs.length && !np.det?.en && !np.quant) return null;

  // post-nominal material
  if (np.head && np.head.kind !== 'unknown') {
    for (;;) {
      budget.tick('translate.np');
      const x = toks[j];
      if (!x || !isWord(x)) break;
      const nx = toks[j + 1];
      // comparative / "foarte" + adjective
      if ((x.key === 'mai' || x.key === 'foarte') && nx && adjOf(nx) && np.head.kind === 'noun') {
        const a = adjOf(nx).entry;
        const en = x.key === 'foarte' ? `very ${a.en}` : (a.comp || `more ${a.en}`);
        np.adjs.push({ en, tok: nx, tok0: x, post: true }); j += 2; grow(nx);
        continue;
      }
      const a = adjOf(x);
      if (a && np.head.kind === 'noun' && !(nounsOf(x).length && !(np.head.number && true) && false)) {
        // do not swallow a verb-like word or a noun used as a new NP head
        const isVerbOnly = false;
        if (!isVerbOnly) {
          if (nounsOf(x).length && !(a.number === np.head.number || true)) break;
          // "noi" (we) is only an adjective directly after a noun when no verb follows
          if (x.key === 'noi' && nx && verbsOf(nx).length) break;
          np.adjs.push({ en: a.entry.en, tok: x, post: true }); j++; grow(x);
          // coordinated adjectives after the noun: "un pește mic și albastru" = a small blue fish
          while (toks[j] && toks[j].key === 'si' && toks[j + 1] && isWord(toks[j + 1]) && adjOf(toks[j + 1]) && (!nounsOf(toks[j + 1]).length || COLOURS.has(adjOf(toks[j + 1]).entry.en)) && !verbsOf(toks[j + 1]).length) {
            budget.tick('ro-en.grow');
            np.adjs.push({ en: adjOf(toks[j + 1]).entry.en, tok: toks[j + 1], post: true }); j += 2; grow(toks[j - 1]);
          }
          continue;
        }
      }
      // "ochi tip vizor" = visor eyes; "ochi în formă de plus" = plus shaped eyes
      if (np.head.kind === 'noun' && x.key === 'tip' && nx && isWord(nx)) { np.pre.push({ en: wordEn(nx), tok: x }); j += 2; grow(nx); continue; }
      if (np.head.kind === 'noun' && x.key === 'in' && toks[j + 1]?.key === 'forma' && toks[j + 2]?.key === 'de' && toks[j + 3] && isWord(toks[j + 3])) {
        np.pre.push({ en: `${wordEn(toks[j + 3])} shaped`, tok: x }); j += 4; grow(toks[j - 1]); continue;
      }
      const pf = funcOf(x, 'poss');
      if (pf && np.head.kind === 'noun') { np.poss = { en: pf.entry.en, tok: x }; j++; grow(x); continue; }
      if (x.key === 'lui' && np.head.kind === 'noun' && np.head.def && !info.dativeContext && startsNP(toks, j + 1) && toks[j + 1].kind === 'word') {
        const r = parseNP(toks, j + 1, info, null);
        if (r && (r.np.head?.kind === 'name' || r.np.def)) { np.possessor = r.np; j = r.next; grow(toks[j - 1]); continue; }
      }
      // indefinite genitive: "prețul unei păpuși" -> "the price of a doll" (unei/unui + noun, unor + plural)
      if (/^(unei|unui|unor)$/.test(x.key) && np.head.kind === 'noun' && nx && isWord(nx)) {
        const gn = nounsOf(nx).find((c) => (x.key !== 'unor' || c.number === 'pl') && !c.def);
        if (gn) {
          np.ofNP = { t: 'np', det: x.key === 'unor' ? null : { en: 'a', tok: x, ro: 'un' }, num: null, quant: null, adjs: [],
            head: { kind: 'noun', entry: gn.entry, tok: nx, number: gn.number, def: false, gen: false },
            number: x.key === 'unor' ? 'pl' : 'sg', def: false, poss: null, possessor: null, dat: false, forceDef: false, ofTok: x };
          j += 2; grow(nx); continue;
        }
      }
      const gx = nounsOf(x).find((a) => a.gen && a.def);
      if (gx && np.head.kind === 'noun' && np.head.def && !x.isCap) {
        const r = parseNP(toks, j, info, null);
        const hn = r?.np.head?.kind === 'noun' ? r.np.head.entry : null;
        const bareOf = hn && /^(spring|summer|autumn|winter)$/.test(hn.en);
        if (hn && (bareOf || (!hn.flags.has('anim') && !hn.flags.has('time') && !hn.flags.has('kin')))) { r.np.dat = false; r.np.ofTok = r.np.head.tok; r.np.noArtForced = bareOf; np.ofNP = r.np; j = r.next; grow(toks[j - 1]); continue; }
        if (r && r.np.head && r.np.head.kind === 'noun') { r.np.dat = false; np.possessor = r.np; j = r.next; grow(toks[j - 1]); continue; }
      }
      const place = M.placeOf(x.key);
      if (place && place.gen && np.head.kind === 'noun') {   // "capitala Japoniei" -> "the capital of Japan"
        np.ofNP = { t: 'np', det: null, num: null, quant: null, adjs: [], head: { kind: 'name', tok: x, text: place.en }, number: 'sg', def: false, poss: null, possessor: null, dat: false, forceDef: false, ofTok: x };
        j++; grow(x); continue;
      }
      if (x.isCap && np.head.kind === 'noun' && np.head.def && looksFeminineDative(x)) {
        np.possessor = { t: 'np', head: { kind: 'name', tok: x, text: dativeName(x.raw) }, adjs: [], number: 'sg' }; j++; grow(x); continue;
      }
      break;
    }
  }

  // number / definiteness
  const q = np.quant;
  const pluralQ = q && (q.pl || /^(many|few|some|both|all|more|fewer|other)$/.test(q.en));
  if (np.num) np.number = np.num.val === '1' ? 'sg' : 'pl';
  else if (pluralQ) np.number = 'pl';
  else if (np.head && np.head.kind === 'noun') np.number = np.head.number;
  else np.number = 'sg';
  np.def = !!(np.head && np.head.kind === 'noun' && np.head.def) || !!(np.det && np.det.en === 'the');
  np.span = spanOf;
  np.start = spanOf[0];
  np.end = spanOf[1];
  return { np, next: j };
}

/** Render a noun phrase to English pieces. */
function renderNP(np, o = {}) {
  budget.tick('translate.render');
  if (np.noArtForced) o = { ...o, noArticle: true };
  const out = [];
  const head = np.head;
  const isNoun = head && head.kind === 'noun';
  const mass = isNoun && head.entry.flags.has('mass');
  let plural = np.number === 'pl' || !!o.forcePlural || (isNoun && head.entry.flags.has('pl'));
  if (o.forceSingular) plural = false;
  if (mass) plural = false;
  if (np.num) plural = np.num.val !== '1' && !mass;
  const srcTok = head ? head.tok : (np.num?.tok || np.det?.tok);
  let hasDet = false;

  if (np.possessor) {
    const ps = renderNP(np.possessor, { noArticle: false });
    const last = ps[ps.length - 1];
    last.en = /s$/.test(last.en) ? `${last.en}'` : `${last.en}'s`;
    out.push(...ps);
    hasDet = true;
  } else if (np.poss) { out.push(pc(np.poss.en, np.poss.tok)); hasDet = true; }

  if (!o.bareHead) {
    if (np.quant) {
      const qn = np.quant;
      let en = qn.en;
      if (qn.kind === 'no') en = o.neg ? 'any' : 'no';
      out.push(pc(en, qn.tok));
      if (qn.tok2) out[out.length - 1].src = [qn.tok.start, qn.tok2.end];
      if (qn.en === 'all' && np.def && !hasDet) { out.push(pc('the', srcTok || qn.tok)); }
      hasDet = true;
    }
    if (np.det && !np.num) {
      const d = np.det;
      if (d.ro === 'un' || d.ro === 'o') { if (!hasDet) out.push(pc('a', d.tok, { art: true })); }
      else if (d.en === 'no') out.push(pc(o.neg ? 'any' : 'no', d.tok));
      else if (d.en === 'other') out.push(pc(plural ? 'other' : 'another', d.tok));
      else if (d.en === 'the') { if (!hasDet) out.push(pc('the', d.tok)); }
      else if (d.en === 'some' || d.en === 'each' || d.en === 'any' || /^(this|that|these|those)$/.test(d.en) ) {
        let en = d.en;
        if (/^(this|these)$/.test(en)) en = plural ? 'these' : 'this';
        if (/^(that|those)$/.test(en)) en = plural ? 'those' : 'that';
        out.push(pc(en, d.tok));
      } else out.push(pc(d.en, d.tok));
      hasDet = hasDet || d.en !== 'the';
      if (d.en === 'the') hasDet = true;
    }
    if (np.num) out.push(pc(np.num.val, np.num.tok));
    // implicit articles
    if (!hasDet && !np.num && !np.quant && !np.det && head) {
      if (isNoun) {
        if (np.def && !o.noArticle) out.push(pc('the', head.tok));
        else if (!plural && !mass && !np.def && !(head.entry.enp && head.entry.enp === head.entry.en)) {
          if (o.afterPrep) { if (!head.entry.flags.has('inst') && !o.bareAfterPrep) out.push(pc('the', head.tok)); }
          else if (!o.noArticle) out.push(pc('a', head.tok, { art: true }));
        }
      }
    }
  }
  for (const a of np.adjs) {
    if (o.bareHead && a.post === undefined) continue;
    const pcA = pc(a.en, a.tok);
    if (a.tok0) pcA.src = [Math.min(a.tok0.start, a.tok.start), Math.max(a.tok0.end, a.tok.end)];
    out.push(pcA);
  }
  for (const m of np.pre || []) out.push(pc(m.en, m.tok));
  if (head) {
    if (isNoun) {
      const e = head.entry;
      const txt = plural ? (e.enp || E.pluralEn(e.en)) : e.en;
      // an invariant plural with the article ("peștii" = the fish) keeps its number for the worlds: "all the fish"
      if (plural && np.def && !np.num && !np.quant && !np.possessor && !np.poss && !np.adjs.length && !np.pre?.length && txt === e.en && e.en === 'fish') { const di = out.findIndex((x) => x.en === 'the'); if (di >= 0) out.splice(di, 0, pc('all', head.tok)); }
      out.push(pc(txt, head.tok, { noun: true }));
      if (np.ofNP) { out.push(pc('of', np.ofNP.ofTok)); out.push(...renderNP(np.ofNP, { noArticle: false })); }
    } else if (head.kind === 'text') out.push(pc(head.text, head.tok));
    else out.push(pc(head.text, head.tok, { name: head.kind === 'name' }));
  }
  if (np.after) out.push(...np.after.map((a) => pc(a.en, a.tok)));   // resultative adjective: "make the house blue"
  return out;
}

// ------------------------------------------------------------------ item building

function mkAdv(tok, entry) {
  return { t: 'adv', en: entry.en, tok, flags: entry.flags, start: tok.start, end: tok.end };
}

function parseVG(toks, i, info, prev) {
  let j = i;
  const n = toks.length;
  const vg = { t: 'vg', neg: null, clit: [], sa: null, aux: null, comp: null, an: null, entry: null, tok: null, options: [], inf: false };
  if (isWord(toks[j]) && toks[j].key === 'nu') { vg.neg = toks[j]; j++; }
  if (isWord(toks[j]) && funcOf(toks[j], 'sa')) {
    vg.sa = toks[j]; j++;
    if (isWord(toks[j]) && toks[j].key === 'nu') { vg.neg = toks[j]; j++; }
  } else if (isWord(toks[j]) && toks[j].key === 'sa' && !toks[j].synth) {
    vg.sa = toks[j]; j++;
    if (isWord(toks[j]) && toks[j].key === 'nu') { vg.neg = toks[j]; j++; }
  }
  while (j < n && isWord(toks[j]) && CLITIC[toks[j].key] && !toks[j].synth && vg.clit.length < 2
    && !(toks[j].key === 'va' && toks[j].raw.toLowerCase() === 'va' && isWord(toks[j + 1]) && verbsOf(toks[j + 1]).length)) {
    budget.tick('ro-en.parseVG');
    // a clitic must be followed (possibly through another clitic / aux) by a verb
    vg.clit.push(toks[j]); j++;
  }
  const t0 = toks[j];
  if (!isWord(t0)) return null;
  let aux = null;
  const key0 = t0.key;
  const nxt = toks[j + 1];
  let auxOptions = null;
  if (AUX_PERF[key0] && nxt && isWord(nxt) && verbsOf(nxt).some((a) => a.tense === 'part') && !funcOf(t0, 'sa')) {
    aux = 'perf'; auxOptions = AUX_PERF[key0].map(([p, nb]) => ({ tense: 'past', person: p, number: nb })); vg.auxTok = t0; j++;
  } else if (AUX_FUT[key0] && nxt && isWord(nxt) && verbsOf(nxt).length && !nounsOf(nxt).length) {
    aux = 'fut'; auxOptions = [{ tense: 'fut', person: AUX_FUT[key0][0], number: AUX_FUT[key0][1] }]; vg.auxTok = t0; j++;
  } else if (AUX_COND[key0] && nxt && isWord(nxt) && verbsOf(nxt).length) {
    aux = 'cond'; auxOptions = AUX_COND[key0].map(([p, nb]) => ({ tense: 'cond', person: p, number: nb })); vg.auxTok = t0; j++;
  } else if (key0 === 'a' && nxt && isWord(nxt) && verbsOf(nxt).some((a) => a.tense === 'inf' || a.tense === 'pres') && !verbsOf(nxt).some((a) => a.tense === 'part')) {
    aux = 'inf'; vg.inf = true; vg.auxTok = t0; j++;
  }
  vg.aux = aux;
  const tm = toks[j];
  if (!isWord(tm)) return null;
  let van = verbsOf(tm);
  if (aux === 'perf') van = van.filter((a) => a.tense === 'part');
  if (!van.length) return null;
  const entries = [...new Set(van.map((a) => a.entry))];
  vg.entry = entries[0];
  van = van.filter((a) => a.entry === vg.entry);
  vg.an = van; vg.tok = tm;
  j++;
  // enclitic on the verb token (amintește-mi)
  const enc = van.find((a) => a.enclitic);
  if (enc) vg.clit.push({ key: enc.enclitic, start: tm.start, end: tm.end, raw: enc.enclitic, enc: true });
  if (vg.sa && vg.sa.synth && funcOf(vg.sa, 'sa')?.entry.flags.has('fut')) { aux = 'fut'; vg.aux = 'fut'; }

  // options
  if (aux === 'perf' || aux === 'fut' && auxOptions || aux === 'cond') vg.options = auxOptions;
  else {
    const fut = vg.sa && funcOf(vg.sa, 'sa')?.entry.flags.has('fut');
    for (const a of van) {
      if (a.tense === 'part') continue;
      let tense = a.tense;
      if (tense === 'impf') tense = 'past';
      if (tense === 'subj') tense = 'pres';
      if (fut) tense = 'fut';
      if (vg.inf) tense = 'inf';
      if (tense === 'inf' && !vg.inf && !vg.sa && van.some((x) => x.tense !== 'inf')) continue;
      vg.options.push({ tense, person: a.person, number: a.number, raw: a.tense });
    }
    if (!vg.options.length && van.some((a) => a.tense === 'part')) vg.options.push({ tense: 'past', person: 3, number: 'sg', raw: 'part' });
  }
  if (aux === 'fut' && !auxOptions) vg.options = vg.options.map((o) => ({ ...o, tense: 'fut' }));
  // complement of modal-like verbs
  if (vg.entry.flags.comp && !vg.inf) {
    let k = j;
    let sa = null;
    if (isWord(toks[k]) && (toks[k].key === 'sa' || funcOf(toks[k], 'sa'))) { sa = toks[k]; k++; }
    let cneg = null;
    if (isWord(toks[k]) && toks[k].key === 'nu') { cneg = toks[k]; k++; }
    const ccl = [];
    while (isWord(toks[k]) && CLITIC[toks[k].key] && !toks[k].synth && isWord(toks[k + 1]) && (verbsOf(toks[k + 1]).length || CLITIC[toks[k + 1].key])) { budget.tick('ro-en.parseVG2'); ccl.push(toks[k]); k++; }
    const ct = toks[k];
    if (isWord(ct) && verbsOf(ct).length && !(vg.entry.flags.comp === 'to' && !sa && nounsOf(ct).length)) {
      const cv = verbsOf(ct);
      vg.comp = { tok: ct, entry: cv[0].entry, an: cv.filter((a) => a.entry === cv[0].entry), sa, neg: cneg, kind: vg.entry.flags.comp, clit: ccl };
      j = k + 1;
    }
  }
  if (vg.entry.flags.comp === 'modal' && !vg.comp) return null; // "poate" without a verb is an adverb
  vg.start = toks[i].start;
  vg.end = toks[j - 1].end;
  vg.next = j;
  return vg;
}

function buildItems(toks, info) {
  const items = [];
  let i = 0;
  const ctx = info.ctx;
  const prevItem = () => items[items.length - 1] || null;
  const note = (s) => ctx.notes.push(s);

  const pushNP = (r) => { items.push(r.np); };

  // dative clitic anywhere in the sentence helps to read feminine datives (Mariei)
  info.dativeContext = toks.some((t) => isWord(t) && DAT_CLITICS.has(t.key) && !t.synth);

  while (i < toks.length) {
    budget.tick('translate.clause');
    const t = toks[i];
    if (t.kind === 'fixed') { items.push({ t: 'fixed', pieces: t.pieces, start: t.start, end: t.end, verbal: t.verbal }); i++; continue; }
    if (t.kind === 'punct') {
      if (t.raw === ',' || t.raw === ';' || t.raw === ':') items.push({ t: 'comma', tok: t });
      else items.push({ t: 'punct', tok: t });
      i++; continue;
    }
    const prev = prevItem();
    if (t.kind === 'num') {
      const r = parseNP(toks, i, info, prev);
      if (r) { pushNP(r); i = r.next; } else { items.push({ t: 'np', num: { val: t.value, tok: t }, head: null, adjs: [], number: t.value === '1' ? 'sg' : 'pl', start: t.start, end: t.end }); i++; }
      ctx.mapped += 0;
      continue;
    }
    const key = t.key;
    const an = analysesOf(t);
    const f = funcOf(t);

    // negation / "no"
    if (key === 'nu' && !t.synth) {
      const nxt = toks[i + 1];
      if (!nxt || nxt.kind === 'punct') { items.push({ t: 'interj', en: 'no', tok: t }); i++; continue; }
      const vg = parseVG(toks, i, info, prev);
      if (vg) { items.push(vg); i = vg.next; continue; }
      items.push({ t: 'neg', tok: t }); i++; continue;
    }
    // relative "care": "o pisică care mănâncă pește"
    if (key === 'care' && !t.synth && prev && prev.t === 'np' && !prev.pron && toks[i + 1] && verbsOf(toks[i + 1]).length) {
      items.push({ t: 'conj', en: 'that', rel: true, number: prev.number === 'pl' ? 'pl' : 'sg', tok: t }); i++; continue;
    }
    // question words
    if (f && f.fpos === 'wh') {
      const kind = f.entry.kind || ({ ce: 'what', cine: 'who', care: 'which', unde: 'where', cum: 'how', cât: 'howmuch', 'câtă': 'howmuch', câte: 'howmany', 'câți': 'howmany' }[f.entry.keys.find((k) => foldKey(k) === key) || f.entry.ro] || f.entry.en);
      let wk = kind;
      if (f.entry.en === 'how much') wk = 'howmuch';
      if (f.entry.en === 'how many') wk = 'howmany';
      if (f.entry.en === 'what') wk = 'what';
      if (f.entry.en === 'who') wk = 'who';
      if (f.entry.en === 'which') wk = 'which';
      if (f.entry.en === 'where') wk = 'where';
      if (f.entry.en === 'how') wk = 'how';
      if (f.entry.kind === 'why') wk = 'why';
      const wh = { t: 'wh', kind: wk, tok: t, np: null, start: t.start, end: t.end };
      i++;
      if (wk === 'howmuch' && isWord(toks[i]) && toks[i].key === 'de' && toks[i + 1] && (adjOf(toks[i + 1]))) {
        const a = adjOf(toks[i + 1]).entry;
        wh.kind = 'how'; wh.extra = a.en; wh.extraTok = toks[i + 1]; i += 2; wh.end = toks[i - 1].end;
      } else if (['what', 'which', 'howmany', 'howmuch'].includes(wk) && toks[i] && (nounsOf(toks[i]).length) && !verbsOf(toks[i]).length) {
        const r = parseNP(toks, i, info, null);
        if (r && r.np.head) { wh.np = r.np; i = r.next; wh.end = toks[i - 1].end; }
      } else if (wk === 'howmany' && toks[i] && nounsOf(toks[i]).length) {
        const r = parseNP(toks, i, info, null);
        if (r && r.np.head) { wh.np = r.np; i = r.next; wh.end = toks[i - 1].end; }
      }
      items.push(wh);
      continue;
    }
    if (key === 'cand' && !t.synth) {
      if (info.q && items.length === 0) { items.push({ t: 'wh', kind: 'when', tok: t, np: null, start: t.start, end: t.end }); i++; continue; }
      items.push({ t: 'conj', en: 'when', sub: true, tok: t }); i++; continue;
    }
    if (key === 'cum' && !t.synth && !(info.q || items.length === 0)) { items.push({ t: 'conj', en: 'how', tok: t }); i++; continue; }
    if (key === 'unde' && !t.synth) { items.push({ t: 'wh', kind: 'where', tok: t, np: null, start: t.start, end: t.end }); i++; continue; }
    // coordination / subordination
    if (f && f.fpos === 'conj') {
      items.push({ t: 'conj', en: f.entry.en, sub: f.entry.flags.has('sub'), than: f.entry.flags.has('than'), tok: t });
      i++; continue;
    }
    // multi-word frame tokens: sa (subjunctive), op, prep, adv handled below
    if (f && f.fpos === 'sa') {
      const vg = parseVG(toks, i, info, prev);
      if (vg) { items.push(vg); i = vg.next; continue; }
      i++; continue;
    }
    // "tot" after a verb: everything
    if (key === 'tot' && prev && prev.t === 'vg') {
      items.push({ t: 'np', head: { kind: 'text', text: 'everything', tok: t }, adjs: [], number: 'sg', start: t.start, end: t.end, def: false });
      i++; continue;
    }
    // pronouns
    if (PRON[key] && !t.synth) {
      const nxt = toks[i + 1];
      const prevIsNP = prev && prev.t === 'np' && !prev.pron;
      // "voi" can be the future auxiliary
      if (key === 'voi' && nxt && verbsOf(nxt).length) { const vg = parseVG(toks, i, info, prev); if (vg) { items.push(vg); i = vg.next; continue; } }
      if (!(key === 'noi' && prevIsNP && adjOf(t))) {
        const p = PRON[key];
        items.push({ t: 'pron', en: p.en, obj: p.obj, person: p.person, number: p.number, tok: t, start: t.start, end: t.end });
        i++; continue;
      }
    }
    // weekdays and months
    const fd = funcOf(t, 'day') || funcOf(t, 'month');
    if (fd && !(key === 'mai' && !(prev && prev.t === 'prep' && prev.tok.key === 'in'))) {
      const asNoun = nounsOf(t).length && prev && (prev.t === 'np' && prev.num);
      if (!asNoun) {
        items.push({ t: fd.fpos, en: fd.entry.en, tok: t, start: t.start, end: t.end });
        i++; continue;
      }
    }
    // "să" typed without diacritics
    if (key === 'sa' && !t.synth && toks[i + 1] && (verbsOf(toks[i + 1]).length || toks[i + 1].key === 'nu') && !(prev && prev.t === 'np' && !prev.pron && false)) {
      const vg = parseVG(toks, i, info, prev);
      if (vg) { items.push(vg); i = vg.next; continue; }
    }
    // greetings / answers at the start of a sentence or before a comma
    if (f && f.fpos === 'interj' && !t.synth) {
      const nx = toks[i + 1];
      const standalone = (i === 0 && (!nx || nx.kind === 'punct' || nx.isCap)) || (nx && nx.kind === 'punct' && nx.raw === ',') || !nx;
      if (standalone) { items.push({ t: 'interj', en: f.entry.en, tok: t }); i++; continue; }
    }
    // verbs
    if (verbsOf(t).length || AUX_PERF[key] || AUX_FUT[key] || AUX_COND[key] || (funcOf(t) === undefined && an.some((a) => a.enclitic))) {
      const nounish = nounsOf(t).length > 0;
      const afterPrepOrVerb = prev && (prev.t === 'prep' || prev.t === 'vg');
      const afterDet = false;
      const preferVerb = !nounish || !afterPrepOrVerb || key === 'nu';
      if (preferVerb) {
        const vg = parseVG(toks, i, info, prev);
        if (vg) { items.push(vg); i = vg.next; continue; }
      }
    }
    // clitic + verb ("îi dă", "o văd") where the verb is further on
    if (CLITIC[key] && !t.synth && !(key === 'o' && toks[i + 1] && (nounsOf(toks[i + 1]).length || adjOf(toks[i + 1])))) {
      const vg = parseVG(toks, i, info, prev);
      if (vg) { items.push(vg); i = vg.next; continue; }
    }
    // noun phrases (determiners, nouns, names, unknown capitalized words)
    {
      const r = parseNP(toks, i, info, prev);
      if (r) { pushNP(r); i = r.next; continue; }
    }
    // predicative adjectives (with "foarte", "mai", "cel mai")
    if (adjOf(t) || (/^(foarte|mai)$/.test(key) && toks[i + 1] && adjOf(toks[i + 1]))) {
      let j = i;
      let en = '';
      let tok0 = null;
      if (key === 'foarte' || key === 'mai') { tok0 = t; j++; }
      const a = adjOf(toks[j]).entry;
      if (key === 'foarte') en = `very ${a.en}`;
      else if (key === 'mai') en = a.comp || `more ${a.en}`;
      else en = a.en;
      const it = { t: 'adj', en, tok: toks[j], tok0, start: (tok0 || toks[j]).start, end: toks[j].end };
      items.push(it); i = j + 1; continue;
    }
    // adverbs / prepositions / interjections / operators / possessives / others
    if (f) {
      const e = f.entry;
      if (f.fpos === 'prep') { items.push({ t: 'prep', en: e.en, tok: t, entry: e }); i++; continue; }
      if (f.fpos === 'adv') {
        if (key === 'mai') {
          const nx = toks[i + 1];
          if (nx && /^(mult|putin|bine)$/.test(nx.key)) {
            items.push({ t: 'adv', en: nx.key === 'mult' ? 'more' : nx.key === 'putin' ? 'less' : 'better', tok: t, flags: new Set(), start: t.start, end: nx.end, tok2: nx });
            i += 2; continue;
          }
          const whBefore = items.some((x) => x.t === 'wh');
          if (whBefore && nx && verbsOf(nx).length) { items.push({ t: 'adv', en: 'left', tok: t, flags: new Set(['end']), start: t.start, end: t.end }); i++; continue; }
          // "mai la stânga", "mai jos": a comparative of a direction is "more" (a further move), not "still"
          if (nx && (/^(sus|jos)$/.test(nx.key) || (nx.key === 'la' && toks[i + 2] && /^(stang|stanga|stinga|dreapt|dreapta)$/.test(toks[i + 2].key)))) { items.push({ t: 'adv', en: 'more', tok: t, flags: new Set(), start: t.start, end: t.end }); i++; continue; }
          items.push({ t: 'adv', en: 'still', tok: t, flags: new Set(['freq']), start: t.start, end: t.end }); i++; continue;
        }
        ctx.content++; ctx.mapped++;
        items.push(mkAdv(t, e)); i++; continue;
      }
      if (f.fpos === 'interj') { items.push({ t: 'interj', en: e.en, tok: t }); i++; continue; }
      if (f.fpos === 'op') { items.push({ t: 'op', en: e.en, tok: t }); i++; continue; }
      if (f.fpos === 'neg') { items.push({ t: 'negword', en: e.en, key, tok: t }); i++; continue; }
      if (f.fpos === 'poss') { items.push({ t: 'poss', en: e.en, tok: t }); i++; continue; }
      if (f.fpos === 'pron') { items.push({ t: 'np', head: { kind: 'text', text: e.en, tok: t }, adjs: [], number: 'sg', start: t.start, end: t.end, pron: true }); i++; continue; }
      if (f.fpos === 'sa') { i++; continue; }
      if (f.fpos === 'det') { items.push({ t: 'adv', en: e.en, tok: t, flags: new Set(), start: t.start, end: t.end }); i++; continue; }
    }
    if (key === 'lui' && !t.synth) { items.push({ t: 'poss', en: 'his', tok: t }); i++; continue; }
    // unknown word: passed through and reported
    ctx.content++;
    ctx.unknown.push({ word: t.raw, span: [t.start, t.end] });
    items.push({ t: 'np', head: { kind: 'unknown', tok: t, text: t.raw }, adjs: [], number: 'sg', start: t.start, end: t.end, unknown: true, unknownReported: true });
    i++;
  }
  // unknown nouns found inside noun phrases ("3 xyzs") are reported too
  for (const it of items) {
    if (it.t === 'np' && it.head && it.head.kind === 'unknown' && !it.unknownReported) {
      ctx.content++;
      ctx.unknown.push({ word: it.head.tok.raw, span: [it.head.tok.start, it.head.tok.end] });
      it.unknownReported = true;
    }
  }
  // counting of mapped content words
  for (const it of items) {
    if (it.t === 'np' && it.head && it.head.kind === 'noun') { ctx.content++; ctx.mapped++; }
    else if (it.t === 'vg') { ctx.content++; ctx.mapped++; if (it.comp) { ctx.content++; ctx.mapped++; } }
    else if (it.t === 'adj') { ctx.content++; ctx.mapped++; }
    else if (it.t === 'np') for (const a of it.adjs || []) { ctx.content++; ctx.mapped++; void a; }
    else if (it.t === 'wh' && it.np) { ctx.content++; ctx.mapped++; }
  }
  return foldPP(items);
}

function foldPP(items) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    budget.tick('ro-en.foldPP');
    const it = items[i];
    const nx = items[i + 1];
    if (it.t === 'prep' && nx && nx.t === 'wh') { nx.prep = it; out.push(nx); i++; continue; }
    if (it.t === 'prep' && it.tok && it.tok.key === 'pe' && nx && ((nx.t === 'np' && nx.head && (nx.head.kind === 'name' || (nx.head.kind === 'noun' && nx.head.entry.flags.has('anim') && nx.def))) || nx.t === 'pron')) {
      nx.pePerson = true; out.push(nx); i++; continue;
    }
    if (it.t === 'prep' && nx && (nx.t === 'np' || nx.t === 'pron' || nx.t === 'day' || nx.t === 'month') && !(nx.t === 'np' && nx.dat && false)) {
      out.push({ t: 'pp', prep: it, obj: nx, start: it.tok.start, end: nx.end ?? nx.tok?.end });
      i++; continue;
    }
    if (it.t === 'np' && !it.dat && it.def && it.head?.kind === 'noun' && TIME_OF_DAY[it.head.entry.ro] && !(out.length && out[out.length - 1].t === 'prep')) {
      const [tp, tnoart] = TIME_OF_DAY[it.head.entry.ro];
      if (tnoart) it.noArtForced = true;
      out.push({ t: 'pp', prep: { en: tp, tok: it.head.tok, implicit: true }, obj: it, start: it.start, end: it.end });
      continue;
    }
    if ((it.t === 'day' || it.t === 'month')) {
      out.push({ t: 'pp', prep: { en: it.t === 'day' ? 'on' : 'in', tok: it.tok, implicit: true }, obj: it, start: it.start, end: it.end });
      continue;
    }
    out.push(it);
  }
  return out;
}

// ------------------------------------------------------------------ clause grammar

const isNPLike = (x) => x && (x.t === 'np' || x.t === 'pron') && !x.dat && !x.pePerson;
const isDat = (x) => x && x.t === 'np' && x.dat;

function prepEn(pp, verb) {
  const p = pp.prep;
  const key = p.tok && p.tok.key;
  const obj = pp.obj;
  if (p.implicit) return p.en;
  if (obj && obj.t === 'day' && /^(at|in|on)$/.test(p.en)) return 'on';
  if (obj && obj.t === 'month' && /^(at|in|on)$/.test(p.en)) return 'in';
  const headRo = obj && obj.head && obj.head.kind === 'noun' ? obj.head.entry.ro : null;
  if (key === 'pe' && headRo === 'listă' && verb && SPECIAL_LISTVERBS.has(verb.inf)) return 'to';
  if (key === 'la' && verb && verb.flags.motion) return 'to';
  if (key === 'in' && verb && verb.flags.motion) return 'into';
  return p.en;
}

function renderPP(pp, verb, o = {}) {
  const out = [];
  if (verb && verb.inf === 'fi' && pp.prep.implicit && (pp.obj.t === 'day' || pp.obj.t === 'month')) return [pc(pp.obj.en, pp.obj.tok)];
  const pe = prepEn(pp, verb);
  if (!(pp.prep.implicit && (pp.obj.t === 'day' || pp.obj.t === 'month') && false)) out.push(pc(pe, pp.prep.tok));
  const obj = pp.obj;
  if (obj.t === 'np') out.push(...renderNP(obj, { afterPrep: true, neg: o.neg }));
  else if (obj.t === 'pron') out.push(pc(obj.obj, obj.tok));
  else if (obj.t === 'day' || obj.t === 'month') out.push(pc(obj.en, obj.tok));
  if (obj.t === 'np' && obj.start !== undefined && pp.prep.implicit) out[0].src = [obj.start, obj.end];
  return out;
}

function renderWh(wh, o = {}) {
  const out = [];
  if (wh.prep) out.push(pc(wh.prep.en, wh.prep.tok));
  const np = wh.np;
  const massHead = np && np.head && np.head.kind === 'noun' && np.head.entry.flags.has('mass');
  switch (wh.kind) {
    case 'howmany': out.push(pc(massHead ? 'how much' : 'how many', wh.tok)); break;
    case 'howmuch': out.push(pc(np && !massHead ? 'how many' : 'how much', wh.tok)); break;
    case 'what': out.push(pc('what', wh.tok)); break;
    case 'which': out.push(pc('which', wh.tok)); break;
    case 'who': out.push(pc(wh.prep ? 'whom' : 'who', wh.tok)); break;
    case 'where': out.push(pc('where', wh.tok)); break;
    case 'when': out.push(pc('when', wh.tok)); break;
    case 'how': out.push(pc('how', wh.tok)); if (wh.extra) out.push(pc(wh.extra, wh.extraTok)); break;
    case 'why': out.push(pc('why', wh.tok)); break;
    default: out.push(pc(wh.kind, wh.tok));
  }
  if (np) {
    const pl = wh.kind === 'howmany' || (wh.kind === 'howmuch' && !massHead) || np.number === 'pl';
    out.push(...renderNP(np, { bareHead: true, forcePlural: pl && !massHead, forceSingular: !pl }));
  }
  return out;
}

function renderGeneric(it, verb, o = {}) {
  switch (it.t) {
    case 'np': return renderNP(it, { neg: o.neg });
    case 'pron': return [pc(o.obj ? it.obj : it.en, it.tok)];
    case 'pp': return renderPP(it, verb, o);
    case 'wh': return renderWh(it);
    case 'adj': { const p = pc(it.en, it.tok); if (it.tok0) p.src = [it.tok0.start, it.tok.end]; return [p]; }
    case 'adv': return it.en ? [pspan(it.en, it.start, it.end)] : [];
    case 'fixed': return it.pieces;
    case 'interj': return [pc(it.en, it.tok)];
    case 'conj': return [pc(it.en, it.tok)];
    case 'op': return [pc(it.en, it.tok)];
    case 'prep': return [pc(it.en, it.tok)];
    case 'poss': return [pc(it.en, it.tok)];
    case 'neg': return [pc('not', it.tok)];
    case 'negword': return [pc(it.en, it.tok)];
    case 'day': case 'month': return [pc(it.en, it.tok)];
    case 'comma': return [pc(it.tok.raw, it.tok, { punct: true })];
    case 'punct': return [pc(it.tok.raw, it.tok, { punct: true })];
    default: return [];
  }
}

function pickOption(vg, subj, imperative) {
  let opts = vg.options.slice();
  if (!opts.length) return { tense: 'pres', person: 3, number: 'sg' };
  if (imperative) {
    const imp = opts.filter((o) => o.raw === 'imp');
    if (imp.length) return { ...imp[0], tense: 'imp' };
    return { tense: 'imp', person: 2, number: 'sg' };
  }
  const nonImp = opts.filter((o) => o.raw !== 'imp');
  if (nonImp.length) opts = nonImp;
  const pres = opts.filter((o) => o.raw !== 'subj');
  const base = pres.length ? pres : opts;
  if (subj) {
    return base.find((o) => o.person === subj.person && o.number === subj.number)
      || base.find((o) => o.person === subj.person) || base[0];
  }
  const rank = (o) => (o.person === 1 ? 0 : o.person === 2 ? 1 : 2) * 2 + (o.number === 'sg' ? 0 : 1);
  return base.slice().sort((a, b) => rank(a) - rank(b))[0];
}

function subjectInfo(items) {
  // items: np/pron list (with possible conj). Returns {person, number, en?}
  const heads = items.filter((x) => x.t === 'np' || x.t === 'pron');
  if (!heads.length) return null;
  if (heads.length > 1) return { person: 3, number: 'pl' };
  const h = heads[0];
  if (h.t === 'pron') return { person: h.person, number: h.number };
  return { person: 3, number: h.number === 'pl' ? 'pl' : 'sg' };
}

const COLOURS = new Set(['red', 'yellow', 'blue', 'green', 'orange', 'purple', 'pink', 'brown', 'black', 'white', 'gray', 'grey', 'violet', 'turquoise']);
const RESULT_VERBS = new Set(['face', 'colora', 'vopsi', 'picta', 'transforma', 'schimba', 'deveni']);
const STATIVE_VERBS = new Set(['fi', 'avea', 'putea', 'trebui', 'vrea', 'ști', 'costa', 'exista', 'însemna', 'rămâne', 'plăcea', 'părea', 'merita', 'conține', 'face', 'costa', 'dura']);
const PRONOUN_BY_PERSON = {
  '1sg': 'I', '2sg': 'you', '3sg': 'he', '1pl': 'we', '2pl': 'you', '3pl': 'they',
};

function translateClause(items, info, c) {
  const out = [];
  const ctx = info.ctx;
  // leading items (conjunctions, interjections, commas)
  const lead = [];
  while (items.length && (['conj', 'interj', 'comma', 'fixed'].includes(items[0].t) || (items[0].t === 'adv' && items[0].flags.has('lead')))) {
    budget.tick('ro-en.translateClause');
    const x = items.shift();
    if (x.t === 'fixed' && items.length === 0 && lead.length === 0) { items.unshift(x); break; }
    if (x.t === 'conj') { c.leadConj = c.leadConj || x; if (x.sub) c.sub = true; }
    lead.push(x);
  }
  for (const l of lead) out.push(...renderGeneric(l));

  const vgIdx = items.findIndex((x) => x.t === 'vg');
  if (vgIdx < 0) {
    for (const it of items) out.push(...renderGeneric(it));
    return { pieces: out, subj: null };
  }
  const vg = items[vgIdx];
  const entry = vg.entry;
  let pre = items.slice(0, vgIdx);
  let post = items.slice(vgIdx + 1);

  // second verb group introduced by "să" = infinitive complement
  let comp2 = null;
  const idx2 = post.findIndex((x) => x.t === 'vg');
  if (idx2 >= 0) {
    const v2 = post[idx2];
    comp2 = { vg: v2, before: post.slice(0, idx2), after: post.slice(idx2 + 1) };
    post = comp2.before;
  }

  const whItem = items.find((x) => x.t === 'wh');
  if (whItem && whItem.kind === 'which' && !whItem.np && entry.inf === 'fi') whItem.kind = 'what';
  const preNP = pre.filter(isNPLike);
  const postNP = post.filter(isNPLike);
  const datNPs = items.filter(isDat);
  // "Fă casa albastră" = make the house blue: after a make/color/paint verb a definite object followed by an adjective takes it as the result
  if (RESULT_VERBS.has(entry.inf) && postNP.length && postNP[0].def && postNP[0].head?.kind === 'noun' && !postNP[0].num && postNP[0].adjs.length && postNP[0].adjs[postNP[0].adjs.length - 1].post) {
    const np0 = postNP[0];
    np0.after = [np0.adjs.pop()];
  }
  const isBe = entry.inf === 'fi';
  const vgOpts = vg.options;
  const hasImpOpt = vgOpts.some((o) => o.raw === 'imp');
  const isQ = !!c.isQ;

  // ---- imperative?
  let imperative = false;
  if (!isQ && !c.sub && !c.emb && !vg.aux && !whItem && !(c.reuse && c.prevSubj) && hasImpOpt && (entry.flags.imp || vg.clit.some((x) => x.enc)) && preNP.length === 0) imperative = true;
  if (vg.clit.some((x) => x.enc) && !isQ && !c.sub) imperative = true;
  // a sentence-initial 3rd person present with no subject, said to the assistant, is an order ("Cântă Twinkle", "Vorbește mai repede")
  if (!imperative && !isQ && !c.sub && !c.emb && !vg.aux && !vg.neg && !whItem && !info.frag && !(c.reuse && c.prevSubj) && preNP.length === 0 && !isBe && !comp2
    && !entry.flags.mod && !entry.flags.exp && !entry.flags.imps && !STATIVE_VERBS.has(entry.inf) && vgOpts.length && vgOpts.every((o) => (o.raw === 'pres' || o.raw === 'subj' || o.raw === 'inf') && (o.raw === 'inf' || o.person === 3)) && vgOpts.some((o) => o.raw === 'pres' && o.number === 'sg')
    && items.slice(0, vgIdx).every((x) => ['conj', 'interj', 'comma', 'adv', 'fixed'].includes(x.t))) imperative = true;

  // ---- who is the subject?
  let whIsSubject = false;
  if (whItem) {
    const k = whItem.kind;
    const nextIsNP = isNPLike(items[vgIdx + 1]);
    if (k === 'who') {
      if (isBe) whIsSubject = !(nextIsNP) && !(pickOption(vg, null, false).person !== 3);
      else whIsSubject = preNP.length === 0 && !(postNP.length && false);
    } else if (['what', 'which', 'howmany', 'howmuch'].includes(k)) {
      if (preNP.length) whIsSubject = false;
      else if (postNP.length === 0) whIsSubject = isBe ? true : !!((vg.comp ? vg.comp.entry : entry).flags.i);
      else if (whItem.np && whItem.np.head?.kind === 'noun' && whItem.np.head.entry.flags.has('anim') && !isBe) whIsSubject = true;
      else whIsSubject = false;
      if (k === 'what' && isBe && postNP.length === 0 && !whItem.np) whIsSubject = post.some((x) => x.t !== 'comma');
      if (isBe && !vg.options.some((o) => o.person === 3)) whIsSubject = false;
      if (entry.flags.exp) whIsSubject = false;
    }
    if (whItem && vgIdx < items.indexOf(whItem)) { /* wh after verb: keep as is */ }
  }

  // ---- subject items
  let subjItems = [];
  let subjPieces = null;
  let dropped = false;
  let experiencerSubj = null;
  const clitInfo = vg.clit.map((x) => ({ x, info: CLITIC[x.key] || {} }));
  if (entry.flags.exp) {
    const cl = clitInfo.find((x) => x.info.subj);
    if (cl) experiencerSubj = cl;
  }
  if (imperative) { /* no subject */ }
  else if (whIsSubject) { /* wh acts as subject */ }
  else if (experiencerSubj) { /* experiencer */ }
  else if (preNP.length) {
    subjItems = pre.filter((x) => isNPLike(x) || (x.t === 'conj' && x.en === 'and') || x.t === 'pp' && false);
    // keep only the contiguous run starting at the first NP-like
    const firstIdx = pre.findIndex(isNPLike);
    const run = [];
    for (let k = firstIdx; k < pre.length; k++) {
      if (isNPLike(pre[k]) || (pre[k].t === 'conj' && pre[k].en === 'and' && isNPLike(pre[k + 1]))) run.push(pre[k]); else if (pre[k].t === 'adv' && run.length) continue; else break;
    }
    subjItems = run;
  } else if (postNP.length && (entry.flags.vs || (whItem && !whIsSubject) || (isQ && (postNP.length > 1 || postNP[0].t === 'pron' || postNP[0].head?.kind === 'name' || postNP[0].def)))) {
    const first = postNP[0];
    subjItems = [first];
    const at = post.indexOf(first);
    // coordinated subject: X și Y
    let k = at + 1;
    while (post[k] && post[k].t === 'conj' && post[k].en === 'and' && isNPLike(post[k + 1])) { budget.tick('ro-en.translateClause2'); subjItems.push(post[k], post[k + 1]); k += 2; }
  }
  const preNegSubj = !whItem && !imperative ? pre.find((x) => x.t === 'negword' && /^(nimeni|nimic)$/.test(x.key)) : null;
  const subjSet = new Set(subjItems);
  const sInfoRo = whIsSubject ? null : subjectInfo(subjItems);

  // ---- tense/person resolution
  let wc = whItem && whIsSubject ? ((whItem.kind === 'howmany' && whItem.np && !whItem.np.head?.entry.flags.has('mass')) || (whItem.np && whItem.np.number === 'pl') ? { person: 3, number: 'pl' } : { person: 3, number: 'sg' }) : null;
  let agree = whIsSubject ? wc : (experiencerSubj ? { person: experiencerSubj.info.person, number: experiencerSubj.info.number } : sInfoRo);
  let comp = vg.comp;
  let opt;
  if (entry.flags.mod && comp) {
    const mopt = pickOption(vg, agree, false);
    opt = { ...mopt };
    if (entry.flags.mod === 'must' && comp.sa && !agree) {
      const copt = pickOption({ options: comp.an.filter((a) => a.tense === 'subj' || a.tense === 'pres').map((a) => ({ tense: 'pres', person: a.person, number: a.number, raw: a.tense })) }, null, false);
      opt.person = copt.person; opt.number = copt.number;
    }
  } else opt = pickOption(vg, agree, imperative);
  if (vg.aux === 'inf') opt = { ...opt, tense: 'inf' };

  // ---- existential "sunt 3 mere pe masă" -> there are 3 apples on the table
  let existential = false;
  if (!imperative && !whIsSubject && !subjItems.length && !experiencerSubj && !preNegSubj && isBe && !vg.aux && postNP.length && postNP[0].t === 'np' && !postNP[0].def && postNP[0].head && postNP[0].head.kind === 'noun') {
    const want = postNP[0].number === 'pl' ? 'pl' : 'sg';
    const cand = vg.options.find((o) => o.raw !== 'imp' && o.person === 3 && o.number === want);
    if (cand) { existential = true; subjPieces = [pspan('there', vg.tok.start, vg.tok.end)]; agree = { person: 3, number: want }; opt = pickOption(vg, agree, false); }
  }
  const relLead = lead.find((x) => x.t === 'conj' && x.rel);
  // ---- pro-drop subject
  if (relLead && !subjItems.length && !whIsSubject) {
    subjPieces = [];
    agree = { person: 3, number: relLead.number };
    opt = pickOption(vg, agree, false);
  } else if (preNegSubj && !imperative) {
    subjPieces = [pc(preNegSubj.key === 'nimeni' ? 'nobody' : 'nothing', preNegSubj.tok)];
    agree = { person: 3, number: 'sg' };
    opt = pickOption(vg, agree, false);
  } else if (existential) { /* done */ }
  else if (!imperative && !whIsSubject && !subjItems.length && !experiencerSubj) {
    if (c.prevSubj && opt.person === 3 && !entry.flags.imps && c.reuse) {
      subjPieces = c.prevSubj.map((p) => ({ ...p }));
      agree = c.prevSubjInfo;
    } else if (entry.flags.imps || (isBe && opt.person === 3 && opt.number === 'sg' && !c.sub && postNP.length === 0 && true && opt.person === 3 && !whItem)) {
      subjPieces = [pspan('it', vg.tok.start, vg.tok.end)];
      agree = { person: 3, number: 'sg' };
    } else if (isBe && opt.person === 3 && opt.number === 'sg' && !postNP.length) {
      subjPieces = [pspan('it', vg.tok.start, vg.tok.end)];
      agree = { person: 3, number: 'sg' };
    } else {
      const en = PRONOUN_BY_PERSON[`${opt.person}${opt.number}`];
      subjPieces = [pspan(en, vg.tok.start, vg.tok.end)];
      if (en === 'he' && !info.frag) ctx.notes.push(`dropped 3rd person subject of '${vg.tok.raw}' rendered as 'he'`);
      agree = { person: opt.person, number: opt.number };
      dropped = true;
    }
  } else if (experiencerSubj) {
    subjPieces = [pspan(experiencerSubj.info.subj, experiencerSubj.x.start, experiencerSubj.x.end)];
  } else if (subjItems.length) {
    subjPieces = [];
    for (const s of subjItems) subjPieces.push(...renderGeneric(s));
  }
  // pickOption again with the final agreement for the verb
  if (!imperative && agree && !(entry.flags.mod && comp)) opt = pickOption(vg, agree, false);
  let tense = opt.tense;
  if (vg.aux === 'inf') tense = 'inf';
  let enPerson = agree ? agree.person : opt.person;
  let enNumber = agree ? agree.number : opt.number;
  if (whIsSubject) { enPerson = wc.person; enNumber = wc.number; }

  // ---- English verb
  let verbSpec = M.enVerb(entry);
  let tail = [];
  let comp2Handled = false;
  if (entry.flags.mod && comp) {
    verbSpec = { base: entry.flags.mod, modal: entry.flags.mod };
    const cv = M.enVerb(comp.entry);
    const noObj = !post.some((x) => isNPLike(x) && !subjSet.has(x));
    tail = [pc(comp.entry.inf === 'face' && whItem && whItem.kind === 'what' && !whItem.np && noObj ? 'do' : cv.base, comp.tok)];
    for (const cl of comp.clit || []) { const ci = CLITIC[cl.key] || {}; if (ci.acc || ci.dat) tail.push(pspan(ci.acc || ci.dat, cl.start, cl.end)); }
  } else if (comp && comp.kind === 'to') {
    const cv = M.enVerb(comp.entry);
    tail = [pc('to', comp.sa || comp.tok), pc(cv.base, comp.tok)];
    if (comp.neg) tail.splice(1, 0, pc('not', comp.neg));
  }
  if (entry.inf === 'face' && whItem && whItem.kind === 'what' && !postNP.filter((x) => !subjSet.has(x)).length && !whItem.np) verbSpec = { base: 'do', past: 'did', pp: 'done' };
  const negTok = vg.neg;
  let neg = !!negTok;
  // "nu ... niciodată" -> "never"
  const neverIdx = items.findIndex((x) => x.t === 'adv' && /^never$/.test(x.en));
  let negAdvNever = false;
  if (neverIdx >= 0 && neg) negAdvNever = true;
  const negWords = items.filter((x) => x.t === 'negword');
  const niciCount = items.filter((x) => x.t === 'negword' && x.key === 'nici').length;
  const verbNeg = neg && !negAdvNever && !preNegSubj && niciCount < 2;

  const questionFront = (isQ || (whItem && !whIsSubject && !c.emb)) && !c.emb;
  const vw = E.verbWords(verbSpec, { tense, person: enPerson, number: enNumber, neg: verbNeg, question: !!questionFront && !whIsSubject && tense !== 'imp' });
  const vpieces = vw.map((w) => ({ w, p: w.role === 'neg' ? pc(w.w, negTok) : pc(w.w, vg.tok, { aux: w.role === 'aux' }) }));
  if (vg.auxTok && (vg.aux === 'perf' || vg.aux === 'fut' || vg.aux === 'cond')) {
    const firstAux = vpieces.find((x) => x.w.role === 'aux');
    if (firstAux && vg.aux !== 'perf') firstAux.p.src = [vg.auxTok.start, vg.auxTok.end];
    if (vg.aux === 'perf') { const mn = vpieces.find((x) => x.w.role === 'main'); if (mn) mn.p.src = [Math.min(vg.auxTok.start, vg.tok.start), vg.tok.end]; }
  }
  const verbMain = vpieces.map((x) => x.p);

  // ---- objects: dative, accusative clitics, remaining items
  const ioPieces = [];
  const doPronPieces = [];
  const imperativeIsGive = false;
  if (!(entry.flags.exp && experiencerSubj)) {
    for (const { x, info: ci } of clitInfo) {
      if (ci.refl) continue;
      if (x.enc && /^(ti|iti|mi|imi)$/.test(x.key) && !entry.flags.d && postNP.length && postNP[0].def && !postNP[0].poss && !postNP[0].possessor && !imperativeIsGive) { postNP[0].poss = { en: /^i?m/.test(x.key) ? 'my' : 'your', tok: x }; continue; }   // "Fă-ți corpul verde" = make your body green
      if (x.key === 'ne' && entry.flags.recip) continue;   // "ne întâlnim" = we meet
      if (x.enc && x.key === 'te' && imperative) { doPronPieces.push(pspan('yourself', x.start, x.end)); continue; }   // "Resetează-te" = reset yourself
      if (x.enc && /^(i|ii)$/.test(x.key) && imperative && !entry.flags.d) { doPronPieces.push(pspan('them', x.start, x.end)); continue; }   // "Fă-i pătrați" = make them square
      const wantDat = ci.dat && (DAT_CLITICS.has(x.key) && (entry.flags.d || datNPs.length || x.enc || !ci.acc || imperative || /^(mi|ti|imi|iti|i)$/.test(x.key)));
      if (wantDat) {
        if (datNPs.length && /^(ii|i|le)$/.test(x.key)) continue;
        ioPieces.push(pspan(ci.dat, x.start, x.end));
      } else if (ci.acc && !items.some((q) => q.pePerson)) doPronPieces.push(pspan(ci.acc, x.start, x.end));
    }
  }
  for (const d of datNPs) ioPieces.push(...renderNP(d, { noArticle: false }));

  const skip = new Set([...subjSet, ...datNPs]);
  const objItems = post.filter((x) => !skip.has(x));
  const preRest = pre.filter((x) => !subjSet.has(x) && !isDat(x) && x !== whItem && !(x.t === 'conj' && subjSet.size && false));
  const endAdvs = [];
  const postNever = [];
  const restPieces = [];
  const verbEntry = entry;
  const hasNeverAdv = negAdvNever;
  const negCtx = { neg: neg || negWords.length > 0 };
  for (const it of objItems) {
    if (it.t === 'adv' && it.flags.has('end')) { endAdvs.push(it); continue; }
    if (it.t === 'adv' && it.en === 'never' && hasNeverAdv) { postNever.push(pspan('never', it.start, it.end)); continue; }
    if (it.t === 'negword' && it.key === 'nici' && niciCount >= 2) { restPieces.push(pc(items.filter((x) => x.t === 'negword' && x.key === 'nici').indexOf(it) === 0 ? 'neither' : 'nor', it.tok)); continue; }
    if (it.t === 'negword') { restPieces.push(pc(neg ? ({ nimic: 'anything', nimeni: 'anyone', nicaieri: 'anywhere' }[it.key] || it.en) : it.en, it.tok)); continue; }
    restPieces.push(...renderGeneric(it, verbEntry, it.t === 'pron' ? { ...negCtx, obj: true } : negCtx));
  }
  const objFirstFreq = [];
  const beforeSubj = [];
  const afterSubjPre = [];
  const firstSubjIdx = subjItems.length ? pre.indexOf(subjItems[0]) : -1;
  for (const it of preRest) {
    if (it.t === 'adv' && it.flags.has('end')) { endAdvs.push(it); continue; }
    if (it.t === 'adv' && hasNeverAdv && it.en === 'never') { afterSubjPre.push(pspan('never', it.start, it.end)); continue; }
    if (it.t === 'neg') continue;
    if (it === preNegSubj) continue;
    if (it.t === 'negword') { afterSubjPre.push(pc(it.en, it.tok)); continue; }
    const idx = pre.indexOf(it);
    if (it.t === 'adv' && it.flags.has('freq')) { afterSubjPre.push(...renderGeneric(it)); continue; }
    if (firstSubjIdx >= 0 && idx > firstSubjIdx) { restPieces.push(...renderGeneric(it, verbEntry, negCtx)); continue; }
    if (it.t === 'adv' && it.flags.has('lead')) { beforeSubj.push(...renderGeneric(it)); continue; }
    if (it.t === 'np' || it.t === 'pron') { restPieces.push(...renderGeneric(it, verbEntry, { ...negCtx, obj: true })); continue; }
    beforeSubj.push(...renderGeneric(it, verbEntry, negCtx));
  }
  afterSubjPre.push(...postNever);
  const endPieces = endAdvs.flatMap((a) => renderGeneric(a));

  // ---- assemble
  const wh = whItem ? renderWh(whItem) : [];
  const auxP = verbMain.find((p) => p.aux);
  const verbRest = verbMain.filter((p) => p !== auxP);
  const nonWhBefore = beforeSubj;
  let body = [];
  const compTail = tail;
  if (imperative) {
    body = [...nonWhBefore, ...verbMain, ...compTail, ...ioPieces, ...doPronPieces, ...restPieces, ...endPieces];
  } else if (whItem && whIsSubject) {
    body = [...nonWhBefore, ...wh, ...afterSubjPre, ...verbMain, ...compTail, ...ioPieces, ...doPronPieces, ...restPieces, ...endPieces];
  } else if (questionFront && auxP) {
    body = [...nonWhBefore, ...wh, auxP, ...(subjPieces || []), ...afterSubjPre, ...verbRest, ...compTail, ...ioPieces, ...doPronPieces, ...restPieces, ...endPieces];
  } else if (questionFront) {
    body = [...nonWhBefore, ...wh, ...(subjPieces || []), ...afterSubjPre, ...verbMain, ...compTail, ...ioPieces, ...doPronPieces, ...restPieces, ...endPieces];
  } else {
    body = [...nonWhBefore, ...wh, ...(subjPieces || []), ...afterSubjPre, ...verbMain, ...compTail, ...ioPieces, ...doPronPieces, ...restPieces, ...endPieces];
  }
  // "who is ..." / "what is ..." predicate wh with be: wh first (already first)

  // ---- infinitive complement introduced by "să" (second verb group)
  if (comp2) {
    const v2 = comp2.vg;
    const cv = M.enVerb(v2.entry);
    const vp = [];
    if (v2.sa && v2.sa.synth) { const pre2 = funcOf(v2.sa, 'sa').entry.en; if (pre2) vp.push(pc(pre2, v2.sa)); }
    vp.push(pc('to', v2.sa || v2.tok));
    if (v2.neg) vp.push(pc('not', v2.neg));
    vp.push(pc(cv.base, v2.tok));
    const ios = [];
    for (const cl of v2.clit) { const ci = CLITIC[cl.key] || {}; if (ci.acc || ci.dat) ios.push(pspan(ci.acc || ci.dat, cl.start, cl.end)); }
    const rest2 = [];
    for (const it of comp2.after) rest2.push(...renderGeneric(it, v2.entry, { neg: !!v2.neg }));
    body.push(...vp, ...ios, ...rest2);
  }
  out.push(...body);
  return { pieces: out, subj: subjPieces && subjItems.length ? subjPieces : null, subjInfo: agree, whIsSubject };
}

// ------------------------------------------------------------------ clause splitting

function splitClauses(items) {
  const vgIdx = [];
  items.forEach((x, k) => { if (x.t === 'vg' || (x.t === 'fixed' && x.verbal)) vgIdx.push(k); });
  if (vgIdx.length <= 1) return [{ items, lead: [] }];
  const cuts = [];
  for (let n = 1; n < vgIdx.length; n++) {
    const a = vgIdx[n - 1];
    const b = vgIdx[n];
    const vb = items[b];
    if (vb.sa && !vb.sa.synth && !(vb.sa.key === 'sa' && false)) { if (!vb.neg || true) continue; }
    if (vb.sa) continue;
    let cut = -1;
    for (let k = b - 1; k > a; k--) {
      const x = items[k];
      if (x.t === 'comma' || x.t === 'conj') { cut = k; break; }
    }
    if (cut < 0) {
      for (let k = a + 1; k < b; k++) if (items[k].t === 'wh') { cut = k - 1 + 0.5; break; }
    }
    if (cut < 0) continue;
    // a comma directly followed by a conjunction: cut before the comma
    if (Number.isInteger(cut) && items[cut].t === 'conj' && items[cut - 1] && items[cut - 1].t === 'comma' && cut - 1 > a) cut -= 1;
    cuts.push(cut);
  }
  if (!cuts.length) return [{ items, lead: [] }];
  const clauses = [];
  let startAt = 0;
  for (const cut of cuts) {
    const at = Number.isInteger(cut) ? cut : Math.ceil(cut);
    clauses.push(items.slice(startAt, at));
    startAt = at;
  }
  clauses.push(items.slice(startAt));
  return clauses.map((it) => ({ items: it }));
}

// ------------------------------------------------------------------ sentence / text level


// ------------------------------------------------------------------ segmentation of composite messages
// "adaugă lapte pe lista mea și ce obții din roșu și galben?" is two requests. Command and question frames cover a whole
// sentence, so a message with several requests is cut at "," / "și" / "iar" / "apoi" when that lets whole-segment frames
// (or the verbal "what is {num}" frame) match; each segment is then translated alone and the pieces are joined again.
const SEG_WORDS = new Set(['si', 'iar', 'apoi']);
const WH_START = new Set(['ce', 'cat', 'cate', 'cati', 'cata', 'care', 'cine', 'unde', 'cum', 'cand', 'cui', 'cati']);
const SEG_EN = { si: 'and', iar: 'and', apoi: 'then' };
function frameMatchesAll(seg, info) {
  if (!seg.length || (seg[0].kind !== 'word' && seg[0].kind !== 'num')) return false;
  const q = segmentIsQuestion(seg, info, true);
  const inf = { ...info, q };
  for (const f of COMPILED) {
    if (!(f.full || f.verbal) || f.token) continue;
    if (matchFrame(f, seg, 0, inf) && matchFrame(f, seg, 0, inf).end === seg.length) return true;
  }
  return false;
}
function segmentIsQuestion(seg, info, last) {
  const w = seg.find((t) => t.kind === 'word');
  return (last && info.q) || !!(w && WH_START.has(w.key));
}
function segmentedPieces(toks, info0) {
  const info = { ...info0, noSeg: true };
  const cuts = [];   // [from, to) token ranges of separators
  for (let i = 1; i < toks.length - 1; i++) {
    budget.tick('ro-en.segmentedPieces');
    const t = toks[i];
    const isComma = t.kind === 'punct' && t.raw === ',';
    const isW = t.kind === 'word' && !t.synth && SEG_WORDS.has(t.key);
    if (!isComma && !isW) continue;
    let j = i + 1;
    while (j < toks.length - 1 && toks[j].kind === 'word' && SEG_WORDS.has(toks[j].key) && !(isW && false)) { budget.tick('ro-en.segmentedPieces2'); j++; }
    if (isComma || isW) { cuts.push([i, j]); i = j - 1; }
  }
  // politeness at either end ("te rog", "mulțumesc", "salut") is a segment of its own, so it never blocks a whole-segment frame
  const polite = (a) => { const k0 = toks[a]?.key, k1 = toks[a + 1]?.key; return k0 === 'te' && k1 === 'rog' ? 2 : (k0 === 'va' && k1 === 'rog') ? 2 : /^(multumesc|salut|hei|buna|ok|deci|pls)$/.test(k0 ?? '') ? 1 : 0; };
  const lead = polite(0);
  if (lead && lead < toks.length) { const e = lead + (toks[lead]?.kind === 'punct' && toks[lead].raw === ',' ? 1 : 0); if (e < toks.length && !cuts.some((c) => c[0] <= e && c[1] > lead)) cuts.unshift([lead, e]); }
  for (let a = Math.max(1, toks.length - 3); a < toks.length; a++) { const L = polite(a); if (L && a + L === toks.length && !cuts.some((c) => c[1] > a - 1 && c[0] < toks.length)) { cuts.push([a, a]); break; } }
  cuts.sort((x, y) => x[0] - y[0]);
  if (!cuts.length || cuts.length > 8) return null;
  // dynamic programme over the cut points: maximise the number of segments that match a whole-segment frame
  const n = cuts.length;
  const segOf = (a, b) => toks.slice(a === 0 ? 0 : cuts[a - 1][1], b === n ? toks.length : cuts[b][0]);
  const best = new Array(n + 1).fill(null);   // best[b] = best partition of segments ending before cut b ("b = n" is the end)
  const score = (seg) => (frameMatchesAll(seg, info) ? 1 : 0);
  const memo = new Map();
  const solve = (a) => {   // best partition from segment start a
    budget.tick('translate.segment');
    if (memo.has(a)) return memo.get(a);
    let bestRes = null;
    for (let b = a; b <= n; b++) {
      const seg = segOf(a, b);
      if (!seg.length) continue;
      const sc = score(seg);
      const rest = b === n ? { sc: 0, segs: [] } : solve(b + 1);
      if (!rest) continue;
      const total = sc + rest.sc - (b === n ? 0 : 0.001);   // fewer cuts on a tie
      const segs = [[a, b, sc], ...rest.segs];
      if (!bestRes || total > bestRes.sc) bestRes = { sc: total, segs };
    }
    memo.set(a, bestRes);
    return bestRes;
  };
  void best;
  const res = solve(0);
  if (!res || res.segs.length < 2 || !res.segs.some((x) => x[2] > 0)) return null;
  const out = [];
  res.segs.forEach(([a, b], k) => {
    const seg = segOf(a, b);
    const last = k === res.segs.length - 1;
    const sInfo = { ...info, q: segmentIsQuestion(seg, info, last), addQ: false };
    if (k > 0) {
      const [cs, ce] = cuts[a - 1];
      const sep = toks.slice(cs, ce);
      if (!(sep.length === 1 && sep[0].raw === ',')) {
        const words = sep.filter((t) => t.kind === 'word').map((t) => SEG_EN[t.key]).filter((x, i, arr) => arr.indexOf(x) === i);
        const hasComma = sep.some((t) => t.kind === 'punct');
        if (hasComma) out.push(pc(',', sep[0], { punct: true }));
        out.push(pc(words.join(' '), sep[hasComma ? 1 : 0] || sep[0]));
      } else out.push(pc(',', sep[0], { punct: true }));
    }
    out.push(...processTokens(seg, sInfo));
    if (sInfo.fullFrame) info0.fullFrame = true;
  });
  return out;
}

function processTokens(toks, info) {
  if (!info.noSeg && !info.frag) {
    const seg = segmentedPieces(toks, info);
    if (seg) return seg;
  }
  const t1 = applyFrames(toks, info);
  const items = buildItems(t1, info);
  if (info.useAs) for (const it of items) if (it.t === 'conj' && it.than) it.en = 'as';
  const clauses = splitClauses(items);
  const out = [];
  let prevSubj = null;
  let prevSubjInfo = null;
  const hasWh = clauses.some((cl, k) => k === 0 && cl.items.some((x) => x.t === 'wh'));
  // choose which clause carries the question
  let prevSub = false;
  const flags = clauses.map((cl, k) => {
    const first = cl.items.find((x) => !['comma'].includes(x.t));
    const subLead = cl.items.find((x) => x.t === 'conj');
    let sub = !!(subLead && subLead.sub && cl.items.indexOf(subLead) <= 1);
    if (!sub && k > 0 && cl.items[0] && cl.items[0].t === 'conj' && /^(and|or)$/.test(cl.items[0].en) && prevSub) sub = true;
    prevSub = sub;
    const emb = k > 0 && cl.items[0] && cl.items[0].t === 'wh';
    return { sub, emb, hasWh: cl.items.some((x) => x.t === 'wh') };
  });
  let qIdx = -1;
  if (info.q) {
    const cands = flags.map((f, k) => k).filter((k) => !flags[k].sub && !flags[k].emb);
    const withWh = cands.filter((k) => flags[k].hasWh);
    qIdx = withWh.length ? withWh[0] : (cands.length ? cands[cands.length - 1] : clauses.length - 1);
  } else {
    const k = flags.findIndex((f, kk) => f.hasWh && !f.emb && !f.sub);
    if (k >= 0 && !info.frag) { qIdx = k; info.addQ = true; }
  }
  void hasWh;
  clauses.forEach((cl, k) => {
    const c = { sub: flags[k].sub, emb: flags[k].emb, isQ: k === qIdx, prevSubj, prevSubjInfo, reuse: k > 0 };
    const r = translateClause(cl.items.slice(), info, c);
    if (r.subj) { prevSubj = r.subj; prevSubjInfo = r.subjInfo; }
    out.push(...r.pieces);
  });
  return out;
}

function assemble(sentences) {
  let text = '';
  const alignment = [];
  let capNext = true;
  let afterOpen = false;
  let quoteOpen = false;
  for (const sent of sentences) {
    const pieces = sent.pieces;
    for (let k = 0; k < pieces.length; k++) {
      const p = pieces[k];
      let en = p.en;
      if (en === '' || en == null) continue;
      if (p.art) {
        const nxt = pieces.slice(k + 1).find((x) => x.en);
        en = E.aAn(nxt ? nxt.en : 'x');
      }
      if (en === 'i') en = 'I';
      if (capNext && /^\p{Ll}/u.test(en)) en = en[0].toUpperCase() + en.slice(1);
      capNext = false;
      const isQuote = p.punct && en === '"';
      if (isQuote) quoteOpen = !quoteOpen;
      const isOpen = p.punct && (/^[(\[{]$/.test(en) || (isQuote && quoteOpen)), isOp = p.punct && /^[-+*\/=<>×÷^%]$/.test(en);
      const attach = p.punct && !isOpen && !isOp;
      if (text && !attach && !afterOpen) text += ' ';
      afterOpen = isOpen;
      const ts = text.length;
      text += en;
      if (p.src) alignment.push({ src: [p.src[0], p.src[1]], tgt: [ts, text.length] });
    }
    capNext = true;
    if (sent.end.length) {
      for (const e of sent.end) {
        const ts = text.length;
        text += e.raw;
        alignment.push({ src: [e.start, e.end], tgt: [ts, text.length] });
      }
    }
    if (sent.addQ && !sent.end.length) { text += '?'; }
  }
  text = text.replace(/,\s+then\b/g, ' and then');
  if (/^(Can|Could) you /.test(text)) text = text.replace(/ and to (\w)/g, ', $1');   // "Poți să desenezi o stea și s-o faci galbenă" = can you draw a star, make it yellow   // the English side reads "A and then B", not "A, then B"
  return { text, alignment };
}

// Text typed without diacritics: a few forms fold onto another word ("sa" = "să" or "sa" his, "tai" = "tăi" your or "tai" cut,
// "peste" = "pește" fish or "peste" over, "aduna" = imperative "adună"). Choose by the neighbouring tokens.
const DETERMINER_KEYS = new Set(['un', 'o', 'acest', 'acel', 'vreun', 'niste', 'doi', 'trei', 'patru', 'cinci', 'mai', 'ce', 'care', 'al', 'cat', 'cati']);
function resolveDiaFree(toks) {
  const words = toks.filter((t) => t.kind === 'word');
  words.forEach((t, i) => {
    const nx = words[i + 1], pv = words[i - 1];
    const all = () => M.analyze(t.key);
    if (t.key === 'sa' && nx && M.analyze(nx.key).some((a) => a.pos === 'verb' && (a.tense === 'subj' || a.tense === 'inf'))) t.an = [];
    else if (t.key === 'tai' && pv && M.analyze(pv.key).some((a) => a.pos === 'noun')) { const p = all().filter((a) => a.pos === 'func' && a.fpos === 'poss'); if (p.length) t.an = p; }
    else if (t.key === 'peste' && pv && DETERMINER_KEYS.has(pv.key)) { const n = all().filter((a) => a.pos === 'noun'); if (n.length) t.an = n; }
    else if (!pv && nx && nx.kind === 'word') { const imp = all().filter((a) => a.pos === 'verb' && a.tense === 'imp'); if (imp.length && !all().some((a) => a.pos !== 'verb')) t.an = imp; }
  });
}

/** Same-length rewrites of hyphenated clitics so that every token keeps its offsets: "să-mi" -> "să mi", "într-o" -> "în   o", "zoom-ul" -> "zoom   ". */
function splitHyphens(text) {
  const L = '(?<![\\p{L}])', R = '(?![\\p{L}])';
  return text
    .replace(new RegExp(`${L}(s[ăa]|s|nu)-(mi|ți|ti|l|o|i|ne|vă|va|le|se)${R}`, 'giu'), (m, a, b) => `${a} ${b}`)
    .replace(new RegExp(`${L}(mi)-(ai|ați)${R}`, 'giu'), (m, a, b) => `${a} ${b}`)
    .replace(new RegExp(`${L}([iî]ntr|dintr|printr)-(o|un|una|unul)${R}`, 'giu'), (m, a, b) => `${a.slice(0, -2)}${' '.repeat(m.length - b.length - (a.length - 2))}${b}`)
    .replace(new RegExp(`${L}(\\p{L}{3,})-(ul|a|le|lui)${R}`, 'giu'), (m, a, b) => `${a}${' '.repeat(b.length + 1)}`);
}

export function translateRoEn(original) {
  const source = splitHyphens(String(original ?? ''));
  const toks = tokenize(source);
  const diaFree = !/[ăâîșțĂÂÎȘȚşţŞŢ]/.test(source);
  for (const t of toks) t.diaFree = diaFree;
  if (diaFree) resolveDiaFree(toks);
  // names typed in lower case ("ben ii da lui zoe 7 bile"): a known name that Romanian does not also use as a word is a name
  for (const t of toks) {
    if (t.kind !== 'word' || t.isCap || t.key.length < 3 || !/^\p{Ll}/u.test(t.raw)) continue;
    const asName = M.isKnownName(t.key) || (/(ei|ii)$/.test(t.raw) && M.isKnownName(foldKey(dativeName(t.raw))));
    if (asName && M.analyze(t.key).length === 0) { t.isCap = true; t.raw = t.raw[0].toUpperCase() + t.raw.slice(1); }
  }
  const sents = splitSentences(toks);
  const ctx = { unknown: [], notes: [], content: 0, mapped: 0 };
  const results = [];
  const untranslatable = [];
  for (const s of sents) {
    let end = [];
    let core = s.slice();
    while (core.length && core[core.length - 1].kind === 'punct' && /^[.!?]$/.test(core[core.length - 1].raw)) { budget.tick('ro-en.translateRoEn'); end.unshift(core.pop()); }
    if (!core.length) { results.push({ pieces: [], end, addQ: false }); continue; }
    const info = { ctx, q: end.some((e) => e.raw === '?'), excl: end.some((e) => e.raw === '!'), frag: false };
    const before = { u: ctx.unknown.length, c: ctx.content, m: ctx.mapped, n: ctx.notes.length };
    let pieces = [];
    const prepared = prepareTokens(core);
    pieces = processTokens(prepared, info);
    // never translate a sentence without its negation or question word
    const keys = core.filter((t) => t.kind === 'word').map((t) => t.key);
    const outText = pieces.map((p) => p.en).join(' ');
    const hasNegSrc = keys.some((k) => NEG_KEYS.has(k)) && !(keys.length === 1);
    const hasWhSrc = keys.some((k) => ['cine', 'ce', 'care', 'unde', 'cat', 'cate', 'cati', 'cata'].includes(k)) || (keys[0] === 'cum') || (keys[0] === 'cand' && info.q);
    let bad = null;
    if (info.fullFrame) bad = null;
    else if (hasNegSrc && !NEG_EN.test(outText) && !/n't/.test(outText)) bad = 'negation could not be mapped';
    else if (hasWhSrc && info.q && !WH_EN.test(outText) && !pieces.some((p) => /^(who|what|which|where|when|how|why)/i.test(p.en))) bad = 'question word could not be mapped';
    if (bad) {
      untranslatable.push({ span: [core[0].start, core[core.length - 1].end], reason: bad });
      ctx.unknown.length = before.u;
      ctx.notes.push(`untranslatable sentence: ${bad}`);
      results.push({ pieces: [], end: [], addQ: false });
      continue;
    }
    results.push({ pieces, end, addQ: !!info.addQ });
  }
  const { text, alignment } = assemble(results);
  const notes = [...new Set(ctx.notes.filter(Boolean))];
  const confidence = ctx.content === 0 ? (text ? 1 : 0) : Math.max(0, Math.min(1, (ctx.content - ctx.unknown.length) / ctx.content));
  const res = { text, alignment, unknown: ctx.unknown, notes, confidence: Math.round(confidence * 1000) / 1000 };
  if (untranslatable.length) { res.untranslatable = untranslatable; res.confidence = 0; }
  return res;
}
