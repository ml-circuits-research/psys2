// Document formalizer of docs.reader: text -> sections, paragraphs, sentences, entities, mentions (with simple co-reference),
// events (agent - verb - object - place), dialogue lines with speakers, relations, keywords (TF-IDF) and a summary score per sentence.
// Rule based, no model, browser-safe (imports only ./lang.mjs and ./text.mjs). The result is a plain JSON object kept in the world
// state; `toSop` turns it into SOP Lang wires whose core.source points at the sentence ("<doc id>#s12").
import { ABBREV, STOP, STARTERS, DAYS_MONTHS, PRONOUNS, ROLES, PLURAL_ROLES, GENERIC, KIN, KIN_INVERSE, KIN_GENDER, PLACES, PLACE_ONLY_AFTER_PREP, PLACE_PREPS, PREPS, PART_NOUNS, THINGS, ADJ,
  SPEECH, SPEECH_LEMMA, ADVERBS, AUX, COPULA, GIVEN, TITLES, verbForm, AMBIG_BASE, PLACE_WORDS_IN_NAMES, PLACE_NAME_PREV, singular, cap } from './lang.mjs?v=afa9ef7a36';
import { toBlocks, splitSentences, tfidfKeywords, contentStems, stem, words } from './text.mjs?v=b04ecf27e0';

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };   // the turn's step budget (a no-op outside a turn)
export const VERSION = 1;
const MAX_SENTENCES = 4000;
const DET = new Set(['the', 'a', 'an', 'his', 'her', 'their', 'its', 'our', 'my', 'your', 'this', 'that', 'these', 'those', 'another', 'every', 'each', 'some', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'many', 'several', 'all', 'both', 'no', 'any']);
const POSS_DET = new Set(['his', 'her', 'their', 'its', 'our', 'my', 'your']);
const CONJ = new Set(['and', 'but', 'or', 'so', 'until', 'while', 'because', 'when', 'as', 'before', 'after', 'that', 'who', 'which', 'although', 'though', 'if', 'since', 'then', 'whom', 'whose']);
const SUBORD = new Set(['that', 'until', 'when', 'while', 'because', 'although', 'though', 'if', 'since', 'before', 'after', 'as', 'whenever', 'where']);
const PARTICLES = new Set(['away', 'out', 'up', 'down', 'off', 'back', 'in', 'inside', 'outside', 'together', 'over', 'forward', 'around', 'along', 'on', 'ahead']);
const CONTROL_BARE = new Set(['make', 'let', 'see', 'hear', 'watch', 'help', 'feel']);
const CONTROL_TO = new Set(['order', 'tell', 'ask', 'want', 'help', 'allow', 'force', 'beg', 'teach', 'invite', 'warn', 'promise', 'need', 'decide', 'try', 'begin', 'start', 'wish', 'agree', 'hope']);
const STEM_SKIP = new Set(['said', 'say']);
const QUOTES_OPEN = new Set(['"', '“', '«']);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'x';

// ---- tokens ----------------------------------------------------------------------------------------------------
const TOKEN_RE = /[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*|\d+(?:[.,]\d+)*|[^\sA-Za-z\d]/g;
const CONTRACTION_BASE = new Set(['it', 'he', 'she', 'that', 'what', 'there', 'here', 'who', 'where', 'how', 'let', 'one']);
/** Tokens of a sentence text: { k:'w'|'n'|'p', w, l, s, e, cap, poss, q }. `quoted` marks tokens inside quotation marks. */
export function tokenize(text, quoted = []) {
  const out = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const raw = m[0];
    const s = m.index, e = s + raw.length;
    const q = quoted.some(([a, b]) => s >= a && e <= b);
    if (/^\d/.test(raw)) { out.push({ k: 'n', w: raw, l: raw, s, e, q }); continue; }
    if (!/^[A-Za-z]/.test(raw)) { out.push({ k: 'p', w: raw, l: raw, s, e, q }); continue; }
    let w = raw.replace(/’/g, "'"), poss = false;
    const pm = w.match(/^(.+)'s$/i);
    if (pm) { w = pm[1]; poss = !CONTRACTION_BASE.has(w.toLowerCase()); }
    out.push({ k: 'w', w, l: w.toLowerCase(), s, e, cap: /^[A-Z][a-z]/.test(w) || /^[A-Z]$/.test(w) && false, poss, q, n: /n't$/i.test(w) });
  }
  // "Mr." "Dr." "St.": the dot belongs to the abbreviation
  for (let k = out.length - 2; k >= 0; k--) {
    const a = out[k], b = out[k + 1];
    if (a.k === 'w' && b.k === 'p' && b.l === '.' && b.s === a.e && ABBREV.has(a.l) && a.cap) { out.splice(k + 1, 1); a.e = b.e; a.abbr = true; }
  }
  return out;
}
/** Quoted spans [start, end) of a paragraph (straight and curly double quotes); an unclosed quote runs to the end. */
function quoteSpans(text) {
  const spans = [];
  let open = -1, curly = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (open < 0) {
      if (c === '“' || c === '«') { open = i; curly = true; }
      else if (c === '"' && !/[A-Za-z0-9]/.test(text[i - 1] ?? ' ')) { open = i; curly = false; }
    } else if ((curly && (c === '”' || c === '»')) || (!curly && c === '"')) { spans.push([open, i + 1]); open = -1; }
  }
  if (open >= 0) spans.push([open, text.length]);
  return spans;
}

const nounHead = (toks) => toks.filter((t) => t.k === 'w').at(-1);

/** Which verb form does token k carry (null when it is not a verb here)? A capitalised word is never a verb. */
function verbAt(tokens, k) {
  const t = tokens[k];
  if (!t || t.k !== 'w' || t.cap && k === 0 && false) return null;
  if (COPULA.has(t.l) || STOP.has(t.l) && !AUX.has(t.l)) return null;
  const v = verbForm(t.l);
  if (!v) return null;
  if (v.guess && (ADJ.has(t.l) || ROLES[t.l] !== undefined)) return null;
  // an auxiliary ("did not know", "had had") is not the main verb
  if (AUX.has(t.l)) {
    let j = k + 1;
    // bounded: a pass over a finite token list or text: the index only moves in one direction
    while (tokens[j] && tokens[j].k === 'w' && (ADVERBS.has(tokens[j].l) || tokens[j].l === 'not' || tokens[j].n || /ly$/.test(tokens[j].l))) j++;
    if (tokens[j] && tokens[j].k === 'w' && (j > k + 1 || verbForm(tokens[j].l)) && verbForm(tokens[j].l) && !DET.has(tokens[j].l)) return null;
  }
  return v;
}

// ---- the analyzer ----------------------------------------------------------------------------------------------
/**
 * @param {string} text   document text (Markdown or plain text)
 * @param {{ title?: string, format?: 'md'|'txt', id?: string, name?: string, tags?: string[], origin?: string }} opts
 */
export function analyzeDocument(text, opts = {}) {
  const format = opts.format ?? 'md';
  const blocks = toBlocks(text, format);
  const id = opts.id ?? `doc_${slug(opts.title ?? opts.name ?? 'document')}`;

  // ---- structure: sections, paragraphs, sentences ----
  const headings = blocks.filter((b) => b.type === 'heading');
  let title = opts.title ?? null;
  let titleBlock = -1;
  if (headings.length) {
    const h1s = headings.filter((h) => h.level === Math.min(...headings.map((x) => x.level)));
    const first = blocks.findIndex((b) => b.type === 'heading');
    if (h1s.length === 1 && blocks[first] === h1s[0] && (headings.length > 1 || blocks.slice(first + 1).some((b) => b.type === 'para' && !b.note))) { titleBlock = first; title ??= h1s[0].text; }
    else if (!title && headings.length === 1 && first === 0) { titleBlock = first; title = headings[0].text; }
  }
  const firstPara = blocks.find((b) => b.type === 'para' && !b.note);
  title ??= opts.name ?? (firstPara ? firstPara.text.split(/\s+/).slice(0, 6).join(' ') : 'Untitled');

  const sections = [], paras = [], sentences = [], notes = [];
  const startSection = (t, level) => { sections.push({ i: sections.length, title: t, level, first: sentences.length, last: sentences.length - 1, p0: paras.length, p1: paras.length - 1 }); };
  const closeSection = () => { const s = sections.at(-1); if (s) { s.last = sentences.length - 1; s.p1 = paras.length - 1; } };
  const firstSecHead = blocks.findIndex((b, i) => b.type === 'heading' && i !== titleBlock);
  const contentBefore = firstSecHead >= 0 && blocks.slice(0, firstSecHead).some((b) => b.type === 'para' && !b.note);
  const noHeadings = headings.filter((_, i) => true).filter((h) => h !== blocks[titleBlock]).length === 0;
  if (noHeadings || contentBefore) startSection(noHeadings ? title : 'Introduction', 1);
  blocks.forEach((b, bi) => {
    if (b.type === 'heading') {
      if (bi === titleBlock) return;
      closeSection(); startSection(b.text, b.level);
      return;
    }
    if (b.note) { notes.push(b.text); return; }
    if (sentences.length >= MAX_SENTENCES) return;
    const pi = paras.length;
    const spans = quoteSpans(b.text);
    const first = sentences.length;
    for (const s of splitSentences(b.text)) {
      const q = spans.map(([a, z]) => [Math.max(a, s.start) - s.start, Math.min(z, s.end) - s.start]).filter(([a, z]) => z > a);
      sentences.push({ i: sentences.length, text: s.text, p: pi, sec: sections.length - 1, ...(b.note ? { note: true } : {}), ...(b.list ? { list: true } : {}), q });
    }
    paras.push({ i: pi, sec: sections.length - 1, first, last: sentences.length - 1, ...(b.note ? { note: true } : {}), ...(b.list ? { list: true } : {}) });
  });
  closeSection();
  const bodyIdx = sentences.filter((s) => !s.note).map((s) => s.i);

  // ---- tokens and name statistics ----
  const T = sentences.map((s) => tokenize(s.text, s.q));
  const capMid = new Map(), lowerCnt = new Map(), initCnt = new Map(), nextVerb = new Map(), prepBefore = new Map(), totalCap = new Map();
  const bump = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const i of bodyIdx) {
    const tk = T[i];
    tk.forEach((t, k) => {
      if (t.k !== 'w') return;
      if (!t.cap) { bump(lowerCnt, t.l); return; }
      const prev = tk[k - 1];
      const initial = !prev || (prev.k === 'p' && /^["“«.!?:;(—-]$/.test(prev.l) && !tk.slice(0, k).some((x) => x.k === 'w' && !x.q === !t.q && x.s > (tk.slice(0, k).findLast((y) => y.k === 'p' && /["“«.!?:]/.test(y.l))?.s ?? -1)));
      bump(totalCap, t.l);
      if (initial) { bump(initCnt, t.l); if (verbAt(tk, k + 1) || tk[k + 1]?.poss) bump(nextVerb, t.l); }
      else bump(capMid, t.l);
      const pw = tk.slice(0, k).findLast((x) => x.k === 'w');
      if (pw && prev === pw && PLACE_NAME_PREV.has(pw.l)) bump(prepBefore, t.l);
    });
  }
  const isName = (t, k, tk) => {
    if (t.k !== 'w' || !t.cap || t.l.length < 2) return false;
    if (STOP.has(t.l) || DAYS_MONTHS.has(t.l) || TITLES[t.l] !== undefined) return false;
    if (ROLES[t.l] !== undefined && !(TITLES[t.l] !== undefined && tk[k + 1]?.cap && !STOP.has(tk[k + 1].l))) return false;
    const low = lowerCnt.get(t.l) ?? 0, mid = capMid.get(t.l) ?? 0;
    if (mid > 0 && mid >= low) return true;
    if (STARTERS.has(t.l)) return false;
    if (low === 0 && ((initCnt.get(t.l) ?? 0) >= 2 || (nextVerb.get(t.l) ?? 0) >= 1)) return true;
    return false;
  };

  // ---- entity registry ----
  const ents = new Map();          // id -> entity
  const nameIdx = new Map();       // lowercase name token -> entity id
  const surface = new Map();       // entity id -> Map(surface -> count)
  const links = [];                // identity links [idA, idB]
  const relations = [];
  const genderVotes = new Map();
  const getEnt = (eid, init) => { let e = ents.get(eid); if (!e) { e = { id: eid, name: '', kind: 'character', g: '', ...init }; ents.set(eid, e); surface.set(eid, new Map()); } return e; };
  const addSurface = (eid, s) => { const m = surface.get(eid); const k = s.toLowerCase(); m.set(k, (m.get(k) ?? 0) + 1); };
  const vote = (eid, g) => { if (!g || g === 'p') return; const v = genderVotes.get(eid) ?? { m: 0, f: 0 }; v[g]++; genderVotes.set(eid, v); };
  const nameEntity = (toks) => {
    const key = toks.map((t) => t.l).join('_');
    const display = toks.map((t) => t.w).join(' ');
    let eid = `e.${key}`;
    if (!ents.has(eid)) {
      const hit = toks.length === 1 ? nameIdx.get(toks[0].l) : null;       // "Arthur" after "King Arthur"
      if (hit) return hit;
      const e = getEnt(eid, { name: display, kind: 'character' });
      const first = toks[0];
      e.g = TITLES[first.l] !== undefined && toks.length > 1 ? TITLES[first.l] : (GIVEN.get(first.l) ?? '');
      const place = toks.some((t) => PLACE_WORDS_IN_NAMES.has(t.l));
      const cnt = (totalCap.get(first.l) ?? 1);
      if (place || (!e.g && (prepBefore.get(toks.at(-1).l) ?? 0) >= Math.max(1, 0.6 * cnt) && !(nextVerb.get(first.l) ?? 0))) e.kind = 'place';
      for (const t of toks) if (!nameIdx.has(t.l) || toks.length === 1) nameIdx.set(t.l, eid);
    }
    return eid;
  };
  const roleEntity = (lemma, extra = {}) => {
    const eid = `e.${lemma}`;
    const e = getEnt(eid, { name: `the ${lemma.replace(/_/g, ' ')}`, kind: 'character', role: lemma, ...extra });
    if (e.g === '' && ROLES[lemma]) e.g = ROLES[lemma];
    if (extra.minor === false) delete e.minor;
    return eid;
  };
  const placeEntity = (lemma) => getEnt(`e.${lemma}`, { name: `the ${lemma}`, kind: 'place', role: lemma });
  const thingEntity = (lemma) => getEnt(`e.${lemma}`, { name: `the ${lemma}`, kind: 'thing', role: lemma });
  const roleLemma = (l) => (ROLES[l] !== undefined ? l : PLURAL_ROLES[l] ?? (ROLES[singular(l)] !== undefined && /s$/.test(l) ? singular(l) : null));
  const isPluralRole = (l) => !!PLURAL_ROLES[l] || (ROLES[l] === undefined && ROLES[singular(l)] !== undefined);

  // ---- per sentence: mentions, events, dialogue ----
  const mentions = [];       // [eid, s, start, end, via, q]
  const events = [], dialogue = [], attrs = [];
  const hist = [];           // per sentence: [{ e, subj }]
  let lastSpeaker = null, lastQuoteSent = -9, prevParaSpeakers = [];
  let evN = 0, dlN = 0;
  const kinOf = (possessor, rel) => {
    for (const r of relations) {
      if (r.a === possessor && r.rel === rel) return r.b;
      const ga = ents.get(r.a)?.g ?? '';
      if (r.b === possessor && KIN_INVERSE[r.rel] && KIN_INVERSE[r.rel][ga || ''] === rel) return r.a;
      if (r.b === possessor && r.rel === rel && ['friend', 'cousin'].includes(rel)) return r.a;
    }
    return null;
  };
  const compat = (e, g) => !g || g === 'p' ? true : e.g === g;

  for (const i of bodyIdx) {
    const tk = T[i];
    const sent = sentences[i];
    const ms = [];     // sentence mentions: { k0, k1, e, via, poss, q, pron? }
    // names
    // bounded: a pass over a finite token list or text: the index only moves in one direction
    for (let k = 0; k < tk.length; k++) {
      const t = tk[k];
      if (!isName(t, k, tk)) continue;
      let k1 = k;
      // bounded: a pass over a finite token list or text: the index only moves in one direction
      while (k1 + 1 < tk.length && isName(tk[k1 + 1], k1 + 1, tk) && !tk[k1].poss) k1++;
      let k0 = k;
      if (k0 > 0 && tk[k0 - 1].k === 'w' && tk[k0 - 1].cap && TITLES[tk[k0 - 1].l] !== undefined && !STOP.has(tk[k0 - 1].l)) k0--;
      const toks = tk.slice(k0, k1 + 1);
      const eid = nameEntity(toks);
      const prevTok = tk[k0 - 1];
      if (ents.get(eid).kind === 'place' || (prevTok && PLACE_NAME_PREV.has(prevTok.l) && !ents.get(eid).g && ents.get(eid).kind !== 'character')) { /* keep kind */ }
      ms.push({ k0, k1, e: eid, via: 'n', poss: tk[k1].poss, q: t.q, w: toks.map((x) => x.w).join(' ') });
      k = k1;
    }
    const taken = (k) => ms.some((m) => k >= m.k0 && k <= m.k1);
    // roles and minor roles
    for (let k = 0; k < tk.length; k++) {
      const t = tk[k];
      if (t.k !== 'w' || taken(k) || t.cap && k === 0 && false) continue;
      let rl = roleLemma(t.l);
      const nxt = tk[k + 1];
      let minor = false;
      if (!rl) {
        if (STOP.has(t.l) || ADJ.has(t.l) || PLACES.has(t.l) || THINGS.has(t.l) || DAYS_MONTHS.has(t.l) || t.l.length < 3 || PRONOUNS[t.l] || verbAt(tk, k) && !AMBIG_BASE.has(t.l) && false) continue;
        const v = nxt && nxt.k === 'w' ? verbAt(tk, k + 1) : null;
        if (!v || v.kind === 'ing' || (v.kind === 'base' && !(/s$/.test(t.l) && tk[k - 1] && tk[k - 1].l === 'the')) || (!['past', 's', 'base'].includes(v.kind) && !SPEECH.has(nxt.l))) continue;
        rl = singular(t.l); minor = true;
        if (verbForm(t.l) && !ADJ.has(t.l) && verbForm(t.l).kind !== 'past' && verbForm(t.l).kind !== 's' && false) continue;
      }
      // determiner chain
      let d = k - 1, hops = 0;
      // bounded: hops is capped at 4
      while (d >= 0 && hops < 4 && tk[d].k === 'w' && !DET.has(tk[d].l) && !PREPS.has(tk[d].l) && !CONJ.has(tk[d].l) && !PRONOUNS[tk[d].l] && !(verbAt(tk, d) && !ADJ.has(tk[d].l)) && !tk[d].cap) { d--; hops++; }
      const det = d >= 0 && tk[d].k === 'w' && DET.has(tk[d].l) ? tk[d] : (d >= 0 && tk[d].k === 'n' ? tk[d] : null);
      if (!det) continue;
      if (minor && !['the', 'a', 'an'].includes(det.l)) continue;
      if (minor && hops > 0 && !tk.slice(d + 1, k).every((x) => ADJ.has(x.l))) continue;
      if (nxt && nxt.k === 'w' && !nxt.cap && !nxt.poss && !PREPS.has(nxt.l) && !CONJ.has(nxt.l) && !STOP.has(nxt.l) && !verbAt(tk, k + 1) && !PRONOUNS[nxt.l] && ROLES[nxt.l] === undefined && !ADV(nxt.l) && !COPULA.has(nxt.l) && !AUX.has(nxt.l)) continue; // compound noun: "the witch house"
      ms.push({ k0: d, k1: k, e: null, via: 'r', rl, minor, det: det.l, poss: t.poss, q: t.q, plural: isPluralRole(t.l), w: tk.slice(d, k + 1).map((x) => x.w).join(' ') });
    }
    // pronouns
    for (let k = 0; k < tk.length; k++) {
      const t = tk[k];
      if (t.k !== 'w' || t.q || !PRONOUNS[t.l] || taken(k)) continue;
      if (ms.some((m) => k >= m.k0 && k <= m.k1)) continue;
      ms.push({ k0: k, k1: k, e: null, via: 'p', pron: t.l, q: false, w: t.w });
    }
    ms.sort((a, b) => a.k0 - b.k0 || b.k1 - a.k1);
    // drop overlaps (keep the first / longest)
    const mm = [];
    for (const m of ms) if (!mm.length || m.k0 > mm.at(-1).k1) mm.push(m);

    // resolution in order
    const here = [];   // resolved so far in this sentence: { e, k0, k1 }
    const prevSubj = (j) => (hist[j] ?? [])[0];
    const cands = (g, mk, objectCase) => {
      const out = [];
      if (!objectCase) for (const h of [...here].reverse()) out.push(h.e);
      else for (const h of [...here].reverse()) if (false) out.push(h.e);
      for (let back = 1; back <= 8; back++) {
        const hj = hist[i - back];
        if (!hj || !hj.length) continue;
        const subj = hj.find((x) => x.subj);
        if (subj) out.push(subj.e);
        for (const h of [...hj].reverse()) if (!h.subj) out.push(h.e);
      }
      return out;
    };
    for (const m of mm) {
      if (m.via === 'r') {
        if (POSS_DET.has(m.det) && KIN.has(m.rl) && !m.minor) {
          // "his sister": the sister of the possessor, from known relations
          let poss = null;
          if (m.det !== 'its') {
            const g = m.det === 'his' ? 'm' : m.det === 'her' ? 'f' : 'p';
            poss = pickCandidate(g, true);
          }
          const target = poss ? kinOf(poss, m.rl) : null;
          m.e = target ?? roleEntity(m.rl);
          if (!target && poss) m.possessor = poss;
        } else m.e = roleEntity(m.rl, m.minor ? { minor: true } : {});
        addSurface(m.e, m.w.toLowerCase());
        const E = ents.get(m.e);
        if (!m.minor && E.minor) delete E.minor;
        here.push({ e: m.e, k0: m.k0, k1: m.k1, q: m.q });
      } else if (m.via === 'n') {
        addSurface(m.e, m.w);
        here.push({ e: m.e, k0: m.k0, k1: m.k1, q: m.q });
      }
    }
    function pickCandidate(g, possessive, atK = 99, objectCase = false) {
      const order = [];
      const sameSent = here.filter((h) => !h.q && h.k1 < atK && (!objectCase || false));
      for (const h of [...sameSent].reverse()) order.push(h.e);
      for (let back = 1; back <= 8; back++) {
        const hj = hist[i - back];
        if (!hj || !hj.length) continue;
        const subj = hj.find((x) => x.subj);
        if (subj) order.push(subj.e);
        for (const h of [...hj].reverse()) if (!h.subj) order.push(h.e);
      }
      const seen = new Set();
      for (const eid of order) {
        if (seen.has(eid)) continue; seen.add(eid);
        const e = ents.get(eid);
        if (!e || e.kind !== 'character' || e.g !== g && !(g === 'p')) continue;
        if (g === 'p' && !e.plural) continue;
        return eid;
      }
      for (const eid of seen) { const e = ents.get(eid); if (e && e.kind === 'character' && !e.g && !e.plural && !e.minor && g !== 'p') return eid; }
      return null;
    }
    // pronouns need the order of the sentence: resolve with the mentions before them
    const resolved = [];
    const live = [];   // mentions resolved before the current pronoun, in sentence order
    for (const m of mm) {
      if (m.via !== 'p') { live.push(m); resolved.push(m); continue; }
      const P = PRONOUNS[m.pron];
      const next = tk[m.k1 + 1];
      const objectCase = P.case === 'obj' || (P.case === 'objposs' && (!next || next.k === 'p' || PREPS.has(next.l) || CONJ.has(next.l) || ADV(next.l)));
      if (P.g === 'p') {
        // they / them / their: the plural role or group mentioned last
        let group = null;
        for (let back = 1; back <= 4 && !group; back++) {
          const evs = events.filter((x) => x.s === i - back);
          const big = evs.find((x) => x.ag.length >= 2);
          if (big) { group = big.ag.slice(0, 3); break; }
          if (!evs.length && (hist[i - back] ?? []).length >= 2) {
            const g2 = [...new Set(hist[i - back].map((h) => h.e))].filter((e) => ents.get(e)?.kind === 'character' && !ents.get(e).plural).slice(0, 2);
            if (g2.length === 2) { group = g2; break; }
          }
          const pe = evs.flatMap((x) => x.ag).find((x) => ents.get(x)?.plural);
          if (pe) group = [pe];
        }
        for (let back = 0; back <= 6 && !group; back++) {
          const hj = back === 0 ? live.filter((x) => x.e && !x.q).map((x) => ({ e: x.e })) : (hist[i - back] ?? []);
          const pl = [...hj].reverse().find((h) => ents.get(h.e)?.plural);
          if (pl) group = [pl.e];
          else { const d = [...new Set(hj.map((h) => h.e))].filter((e) => ents.get(e)?.kind === 'character'); if (d.length >= 2) group = d.slice(0, 3); }
        }
        if (!group) { const one = pickCandidateAny(); if (one) group = [one]; }
        m.group = group;
        if (group) m.e = group[0];
        resolved.push(m); live.push(m);
        continue;
      }
      // candidate order: same sentence (not for object case: a pronoun object is not the subject of its own clause), then history
      const order = [];
      if (!objectCase || P.case === 'refl') for (const h of [...live].reverse()) if (h.e && !h.q && h.k1 < m.k0) order.push(h.e);
      if (P.case === 'refl') { /* reflexive: same clause only */ }
      else for (let back = 1; back <= 8; back++) {
        const hj = hist[i - back];
        if (!hj || !hj.length) continue;
        const subj = hj.find((x) => x.subj);
        if (subj) order.push(subj.e);
        for (const h of [...hj].reverse()) if (!h.subj) order.push(h.e);
      }
      if (objectCase && P.case !== 'refl') for (const h of [...live].reverse()) if (h.e && !h.q && h.k1 < m.k0) order.push(h.e);   // last resort
      const sameSet = new Set(live.filter((h) => h.e && !h.q && h.k1 < m.k0).map((h) => h.e));
      let pick = null;
      const seen = new Set();
      for (const eid of order) {
        if (seen.has(eid)) continue; seen.add(eid);
        const e = ents.get(eid);
        if (!e || e.kind !== 'character' || e.plural) continue;
        if (objectCase && P.case !== 'refl' && sameSet.has(eid)) continue;
        if (e.g === P.g) { pick = eid; break; }
      }
      if (!pick) for (const eid of seen) { const e = ents.get(eid); if (e && e.kind === 'character' && !e.g && !e.plural && !(objectCase && sameSet.has(eid))) { pick = eid; break; } }
      m.e = pick;
      if (pick) { vote(pick, P.g); }
      resolved.push(m); live.push(m);
    }
    function pickCandidateAny() { for (let back = 0; back <= 4; back++) { const hj = back === 0 ? live.filter((x) => x.e).map((x) => ({ e: x.e })) : (hist[i - back] ?? []); if (hj.length) return hj.at(-1).e; } return null; }

    // record mentions
    const finalMs = resolved.filter((m) => m.e);
    for (const m of finalMs) {
      const list = m.group ?? [m.e];
      for (const e of list) mentions.push([e, i, tk[m.k0].s, tk[m.k1].e, m.via, m.q ? 1 : 0]);
    }
    const charMs = finalMs.filter((m) => !m.q && ents.get(m.e)?.kind === 'character');
    hist[i] = charMs.flatMap((m, idx) => (m.group ?? [m.e]).map((e) => ({ e, subj: idx === 0 && m.group === undefined || idx === 0 && !!m.group })));
    // plural flag of roles
    for (const m of finalMs) if (m.plural) ents.get(m.e).plural = true;

    // ---- identity, relations ----
    patterns: {
      const cl = resolved;
      for (let a = 0; a + 1 < cl.length; a++) {
        const A = cl[a], B = cl[a + 1];
        if (!A.e || !B.e) continue;
        const between = tk.slice(A.k1 + 1, B.k0).filter((x) => x.k === 'w').map((x) => x.l);
        const betweenAll = tk.slice(A.k1 + 1, B.k0).map((x) => x.l);
        // "the boy was called Hansel", "Hansel, the boy,"
        if (between.length && between.every((x, j) => (j === 0 && COPULA.has(x)) || ['called', 'named'].includes(x)) && between.at(-1) && ['called', 'named'].includes(between.at(-1)) && B.via === 'n' && A.via !== 'n') { links.push([A.e, B.e]); const g = ROLES[ents.get(A.e).role] ?? ''; if (g) { ents.get(B.e).g ||= g; } continue; }
        if (A.via === 'n' && B.via === 'r' && !B.minor && betweenAll.length === 1 && betweenAll[0] === ',' && !POSS_DET.has(B.det) && !B.plural) { links.push([A.e, B.e]); continue; }
        // "the woodcutter was their father", "She was a witch"
        if (A.via !== 'p' || true) {
          if (between.length === 1 && COPULA.has(between[0]) && B.via === 'r' && !B.minor && !B.plural && !A.plural && ['the', 'a', 'an', 'their', 'his', 'her'].includes(B.det) && (A.via === 'r' || A.via === 'p' || A.via === 'n') && betweenSubject(cl, a, tk)) {
            if (A.e !== B.e && (A.via !== 'r' || !POSS_DET.has(A.det))) links.push([A.e, B.e]);
            continue;
          }
        }
        // "Hansel's sister Gretel"
        if (A.via === 'n' && A.poss && B.via === 'n' && cl[a - 0] && false) { /* handled below */ }
      }
      // possessive name + kin word + name: "Hansel's sister Gretel"
      for (let k = 0; k + 2 < tk.length; k++) {
        const A = cl.find((m) => m.k1 === k && m.via === 'n' && m.poss);
        const R = tk[k + 1];
        const B = cl.find((m) => m.k0 === k + 2 && m.via === 'n');
        if (A && R && KIN.has(R.l) && B) relations.push({ a: A.e, rel: R.l, b: B.e, s: i });
      }
      // "his daughter Anna": the role phrase and the name are the same person
      for (let a = 0; a + 1 < cl.length; a++) {
        const R = cl[a], B = cl[a + 1];
        if (R.via !== 'r' || R.minor || !KIN.has(R.rl) || B.via !== 'n' || B.k0 !== R.k1 + 1) continue;
        const poss = POSS_DET.has(R.det) ? (R.possessor ?? pronounTarget(cl, a, R.det === 'his' ? 'm' : 'f')) : null;
        if (poss && poss !== B.e) relations.push({ a: poss, rel: R.rl, b: B.e, s: i });
        if (ents.get(R.e)?.role === R.rl) { links.push([R.e, B.e]); const g = KIN_GENDER[R.rl]; if (g) ents.get(B.e).g ||= g; }
      }
      // "A (and|,) (his|her) (adj)* R was called B": relation of A
      for (let a = 0; a + 1 < cl.length; a++) {
        const R = cl[a], B = cl[a + 1];
        if (R.via !== 'r' || !POSS_DET.has(R.det) || !KIN.has(R.rl) || B.via !== 'n') continue;
        const between = tk.slice(R.k1 + 1, B.k0).map((x) => x.l);
        if (!between.some((x) => x === 'called' || x === 'named')) continue;
        const poss = R.possessor ?? pronounTarget(cl, a, R.det === 'his' ? 'm' : 'f');
        if (poss && poss !== B.e) { relations.push({ a: poss, rel: R.rl, b: B.e, s: i }); const g = KIN_GENDER[R.rl]; if (g) ents.get(B.e).g ||= g; }
      }
      // "Y was X's R"
      for (let a = 0; a + 1 < cl.length; a++) {
        const Y = cl[a], X = cl[a + 1];
        if (Y.via !== 'n' || X.via !== 'n' || !X.poss) continue;
        const between = tk.slice(Y.k1 + 1, X.k0).filter((x) => x.k === 'w').map((x) => x.l);
        const R = tk[X.k1 + 1];
        if (between.length === 1 && COPULA.has(between[0]) && R && KIN.has(R.l)) relations.push({ a: X.e, rel: R.l, b: Y.e, s: i });
      }
      // "X and Y were brother and sister / siblings / friends / married"
      const txt = tk.filter((x) => x.k === 'w').map((x) => x.l).join(' ');
      const pair = txt.match(/\b(were|are) (brother and sister|brothers|sisters|siblings|friends|husband and wife|married|twins|cousins)\b/);
      if (pair) {
        const ch = cl.filter((m) => m.via === 'n' && !m.q).slice(0, 2);
        if (ch.length === 2) {
          const rel = pair[2].startsWith('brother and') ? 'sibling' : pair[2].replace(/s$/, '').replace('husband and wife', 'spouse').replace('married', 'spouse').replace('twin', 'sibling');
          relations.push({ a: ch[0].e, rel, b: ch[1].e, s: i });
        }
      }
    }
    function betweenSubject(cl, a, tk2) { return a === 0 || cl[a - 1].k1 < cl[a].k0 - 0; }
    function pronounTarget(cl, a, g) {
      for (let j = a - 1; j >= 0; j--) { const e = ents.get(cl[j].e); if (e && e.kind === 'character' && (e.g === g || !e.g) && !cl[j].q) return cl[j].e; }
      for (let back = 1; back <= 3; back++) for (const h of [...(hist[i - back] ?? [])]) { const e = ents.get(h.e); if (e && e.g === g) return h.e; }
      return null;
    }

    // ---- dialogue ----
    const narrativeTk = tk.filter((x) => !x.q);
    const hasQuote = sent.q.length > 0 && sent.q.some(([a, z]) => z - a > 2);
    let isDialogue = false;
    if (hasQuote) {
      const quote = sent.q.map(([a, z]) => sent.text.slice(a, z).replace(/^["“«]|["”»]$/g, '').trim()).filter(Boolean).join(' … ');
      const narr = tk.filter((x) => !x.q && x.k === 'w');
      const sv = narr.find((x) => SPEECH.has(x.l));
      let speaker = null, spt = null, vb = null;
      if (sv) {
        vb = SPEECH_LEMMA[sv.l] ?? sv.l;
        const svk = tk.indexOf(sv);
        const ncl = resolved.filter((m) => !m.q);
        const before = [...ncl].reverse().find((m) => m.k1 < svk && tk.slice(m.k1 + 1, svk).every((x) => x.k === 'w' && (ADV(x.l) || x.l === 'then' || AUX.has(x.l))));
        const after = ncl.find((m) => m.k0 > svk && tk.slice(svk + 1, m.k0).every((x) => x.k === 'w' && (ADV(x.l) || DET.has(x.l) === false && false)) );
        const anyBefore = [...ncl].reverse().find((m) => m.k1 < svk && m.e && ents.get(m.e)?.kind === 'character');
        let pick = before ?? after ?? anyBefore;
        if (pick) { speaker = pick.e ?? null; spt = pick.w; if (pick.group) speaker = pick.group[0]; }
        else {
          const np = parseNP(tk, [], svk + 1, tk.length);
          if (np && tk[svk + 1] && DET.has(tk[svk + 1].l)) spt = np.text;
        }
      }
      if (!speaker && !sv && narr.length === 0) {
        // a quote without attribution: it continues the previous quote of the paragraph, else alternates between the last two speakers
        const prevSameP = sentences[i - 1] && sentences[i - 1].p === sent.p ? dialogue.findLast((d) => d.s === i - 1) : null;
        if (prevSameP) { speaker = prevSameP.sp; spt = prevSameP.spt; }
        else if (prevParaSpeakers.length >= 2 && lastQuoteSent >= 0) { speaker = prevParaSpeakers.at(-2); spt = null; }
      }
      if (speaker && ents.get(speaker)?.kind !== 'character') speaker = null;
      dialogue.push({ id: `d${++dlN}`, s: i, sp: speaker, spt: spt ?? (speaker ? ents.get(speaker)?.name : null), text: quote, vb });
      if (speaker) { if (prevParaSpeakers.at(-1) !== speaker) prevParaSpeakers.push(speaker); }
      lastQuoteSent = i;
      sent.sp = speaker;
      isDialogue = true;
      if (!narr.some((x) => !SPEECH.has(x.l) && !PRONOUNS[x.l] && !STOP.has(x.l) && !ADV(x.l) && !ents.has(`e.${x.l}`) && !x.cap && !DET.has(x.l) && !ADJ.has(x.l) && roleLemma(x.l) === null && !PREPS.has(x.l))) sent.speech = true;
    }

    // ---- events ----
    if (!(isDialogue && sent.speech) && !sent.note) extractEvents(i, tk, resolved);
  }

  function ADV(l) { return ADVERBS.has(l) || /ly$/.test(l) && l.length > 4 && !ADJ.has(l); }

  // ---- events ----
  function extractEvents(i, tk, ms) {
    const nm = ms.filter((m) => !m.q && (m.e || m.group));
    // clause boundaries
    const bounds = [0];
    const hasVerb = (from, to) => { for (let z = from; z < to; z++) if (!tk[z].q && verbAt(tk, z)) return true; return false; };
    for (let k = 1; k < tk.length; k++) {
      const t = tk[k];
      if (t.q) continue;
      if (!hasVerb(bounds.at(-1), k) && !(t.k === 'w' && t.l === 'but')) continue;
      const nxt = tk[k + 1];
      const startsClause = (from) => {
        let j = from;
        // bounded: a pass over a finite token list or text: the index only moves in one direction
        while (tk[j] && tk[j].k === 'w' && (ADV(tk[j].l) || tk[j].l === 'then')) j++;
        if (tk[j] && verbAt(tk, j) && (ENDS_OK(tk[j]))) return 'verb';
        const m = nm.find((x) => x.k0 === j);
        // bounded: a pass over a finite token list or text: the index only moves in one direction
        if (m) { let z = m.k1 + 1; while (tk[z] && tk[z].k === 'w' && (ADV(tk[z].l) || AUX.has(tk[z].l) || tk[z].n)) z++; if (tk[z] && (verbAt(tk, z) || COPULA.has(tk[z].l))) return 'agent'; }
        return null;
      };
      if (t.k === 'p' && (t.l === ',' || t.l === ';' || t.l === '—')) {
        let j = k + 1;
        if (tk[j] && tk[j].k === 'w' && ['and', 'but', 'so', 'then', 'yet', 'or'].includes(tk[j].l)) j++;
        else if (t.l === ',' && !startsClause(j)) continue;
        if (startsClause(j) || (j > k + 1)) bounds.push(j);
      } else if (t.k === 'w' && (t.l === 'and' || t.l === 'but' || t.l === 'so' || t.l === 'then' || t.l === 'yet') && tk[k - 1]?.l !== ',') {
        if (startsClause(k + 1)) bounds.push(k + 1);
      } else if (t.k === 'w' && SUBORD.has(t.l) && tk[k - 1]?.l !== ',') {
        const j = k + 1;
        if (startsClause(j) === 'agent' || startsClause(j) === 'verb') bounds.push(j);
      }
    }
    const uniqBounds = [...new Set(bounds)].sort((a, b) => a - b);
    let inherited = null;
    for (let c = 0; c < uniqBounds.length; c++) {
      const a = uniqBounds[c], b = uniqBounds[c + 1] ?? tk.length;
      const ev = parseClause(i, tk, nm, a, b, inherited);
      if (ev) inherited = ev.ctl ?? ev.ag;
    }
  }
  function ENDS_OK(t) { return true; }

  function parseNP(tk, nm, k, end) {
    // returns { k0, k1, text, head, e[], ents }
    let j = k;
    const first = tk[j];
    if (!first || first.k === 'p') return null;
    if (first.k === 'w' && (PREPS.has(first.l) && first.l !== 'her' && !PRONOUNS[first.l] || CONJ.has(first.l) || ADV(first.l) || AUX.has(first.l) || COPULA.has(first.l))) return null;
    const es = [];
    let last = j - 1;
    const stop = (t, jj, count) => {
      if (!t || jj >= end) return true;
      if (t.k === 'p') return true;
      if (t.k === 'n') return false;
      if (PREPS.has(t.l) && !(t.l === 'her' || t.l === 'his')) return true;
      if (CONJ.has(t.l) && t.l !== 'and') return true;
      if (t.l === 'and') return true;
      if (COPULA.has(t.l)) return true;
      if (count > 0 && !DET.has(t.l) && !ADJ.has(t.l) && verbAt(tk, jj) && !nm.some((m) => jj >= m.k0 && jj <= m.k1) && !tk[jj].poss && !(tk[jj - 1] && (DET.has(tk[jj - 1].l) || tk[jj - 1].poss || ADJ.has(tk[jj - 1].l)))) return true;
      if (count > 0 && PRONOUNS[t.l] && PRONOUNS[t.l].case === 'nom') return true;
      if (count > 0 && PARTICLES.has(t.l) && !nounish(tk, jj)) return true;
      if (count > 0 && ADV(t.l) && !ADJ.has(t.l)) return true;
      return false;
    };
    let count = 0;
    for (;;) {
      budget.tick('reader.np');
      // bounded: count is capped at 9 and j only increases
      while (j < end && !stop(tk[j], j, count) && count < 9) { last = j; j++; count++; if (tk[j - 1].poss) { /* possessive: NP continues */ } }
      // compound with "and"
      if (j < end && tk[j]?.l === 'and' && count > 0) {
        const n1 = tk[j + 1];
        if (n1 && n1.k !== 'p' && !(verbAt(tk, j + 1) && !DET.has(n1.l)) && !(PRONOUNS[n1.l] && PRONOUNS[n1.l].case === 'nom') && !CONJ.has(n1.l) && !(PREPS.has(n1.l))) {
          const m = nm.find((x) => x.k0 === j + 1);
          const afterAgent = m ? tk[m.k1 + 1] : null;
          if (!(afterAgent && afterAgent.k === 'w' && (verbAt(tk, m.k1 + 1) || COPULA.has(afterAgent.l)))) { j++; continue; }
        }
      }
      break;
    }
    if (last < k) return null;
    const toks = tk.slice(k, last + 1);
    const mine = nm.filter((m) => m.k0 >= k && m.k1 <= last && !(m.via === 'n' && m.poss) && !(m.via === 'p' && PRONOUNS[m.pron].case !== 'obj' && PRONOUNS[m.pron].case !== 'nom' && m.k1 !== last) && !(m.via === 'p' && m.k1 !== last && ['his', 'her', 'their'].includes(m.pron)));
    const text = cleanNP(toks);
    return { k0: k, k1: last, text, head: nounHead(toks)?.l ?? '', es: mine.flatMap((m) => m.group ?? [m.e]).filter(Boolean), toks };
  }
  function nounish(tk, j) { return false; }
  function cleanNP(toks) {
    return toks.filter((t) => t.k !== 'p').map((t) => t.w + (t.poss ? "'s" : '')).join(' ').replace(/^(The|A|An)\b/, (m) => m.toLowerCase());
  }
  function headOfPP(tk, nm, k, end) {
    // prepositional phrase starting at preposition token k: { p, np, place: {t,e} | null, k1 }
    const p = tk[k].l;
    let np = parseNP(tk, nm, k + 1, end);
    if (!np) return null;
    let k1 = np.k1;
    // "the edge of a great forest": a part noun hands over to the "of" phrase
    let head = np.head;
    let toks = np.toks;
    // bounded: each pass moves k1 forward over a finite token list (parseNP consumes at least one token or breaks)
    while (PART_NOUNS.has(head) && tk[k1 + 1]?.l === 'of') {
      const n2 = parseNP(tk, nm, k1 + 2, end);
      if (!n2) break;
      np = { ...n2, k0: np.k0 }; head = n2.head; k1 = n2.k1; toks = n2.toks;
    }
    return { p, np: { ...np, k1 }, k1 };
  }

  function parseClause(i, tk, nm, a, b, inherited) {
    // find the verb: a verb token whose subject (a mention, possibly a chain) ends right before it
    let vi = -1, agents = [], agentText = null, agentStart = -1;
    for (let k = a; k < b; k++) {
      if (tk[k].q) continue;
      const v = verbAt(tk, k);
      if (!v) continue;
      if (v.kind === 'ing' && !nm.some((m) => m.k1 < k)) continue;
      // walk back over adverbs, aux and "not"
      let z = k - 1;
      // bounded: z only decreases down to a
      while (z >= a && tk[z].k === 'w' && (ADV(tk[z].l) || AUX.has(tk[z].l) || tk[z].n || tk[z].l === 'not' || tk[z].l === 'then' || (COPULA.has(tk[z].l) && false))) z--;
      const m = nm.find((x) => x.k1 === z);
      if (m) {
        // chain "A and B", "A, B and C"
        const chain = [m];
        let y = m.k0 - 1;
        // bounded: y only decreases down to a
        while (y >= a && tk[y].k !== undefined && ((tk[y].k === 'w' && tk[y].l === 'and') || (tk[y].k === 'p' && tk[y].l === ','))) {
          const prev = nm.find((x) => x.k1 === y - 1);
          if (!prev) break;
          chain.unshift(prev); y = prev.k0 - 1;
        }
        vi = k; agents = [...new Set(chain.flatMap((x) => x.group ?? [x.e]).filter(Boolean))]; agentText = chain.map((x) => x.w).join(' and '); agentStart = chain[0].k0;
        break;
      }
      if (k === a || (z < a && inherited)) {
        if (inherited) { vi = k; agents = inherited; agentText = null; break; }
      }
    }
    if (vi < 0) {
      // copula clause: attribute
      for (let k = a; k < b; k++) {
        if (tk[k].q || !COPULA.has(tk[k].l)) continue;
        const m = nm.find((x) => x.k1 === k - 1);
        if (!m || !m.e) continue;
        const cmp = tk.slice(k + 1, b);
        if (!cmp.length || cmp[0].l === 'called' || cmp[0].l === 'named') break;
        const stopAt = cmp.findIndex((x) => x.k === 'p' || (PREPS.has(x.l) && x.l !== 'of') || CONJ.has(x.l) || ['to', 'so'].includes(x.l));
        const seg = (stopAt < 0 ? cmp : cmp.slice(0, stopAt)).filter((x) => x.k !== 'p');
        const text = seg.filter((x) => !['very', 'quite', 'so', 'too', 'always', 'never', 'not'].includes(x.l)).map((x) => x.w).join(' ');
        const neg = seg.some((x) => x.l === 'not' || x.n);
        if (text && text.split(' ').length <= 5) for (const e of (m.group ?? [m.e])) attrs.push({ e, text: neg ? `not ${text}` : text, s: i });
        break;
      }
      return null;
    }
    const verbTok = tk[vi];
    const v = verbAt(tk, vi);
    let neg = false;
    for (let z = vi - 1; z >= a && !nm.some((m) => m.k1 === z); z--) if (tk[z].l === 'not' || tk[z].n || tk[z].l === 'never') neg = true;
    if (verbTok.n) neg = true;
    const lemma = v.lemma;
    if (SPEECH.has(verbTok.l) && sentences[i].q.length) return null;
    let k = vi + 1;
    let particle = null;
    if (tk[k] && tk[k].k === 'w' && PARTICLES.has(tk[k].l) && !(tk[k + 1] && tk[k + 1].k === 'w' && DET.has(tk[k + 1].l) && ['in', 'on', 'over', 'around', 'along'].includes(tk[k].l))) { particle = tk[k].l; k++; }
    const ev = { id: `v${evN + 1}`, s: i, ag: agents, vb: lemma, vf: verbTok.l, ...(agentText && !agents.length ? { agt: agentText } : {}) };
    if (particle) ev.pt = particle;
    if (neg) ev.neg = true;
    // time adverbial before the agent
    if (agentStart > a) { const wh = tk.slice(a, agentStart).filter((x) => x.k !== 'p').map((x) => x.w).join(' '); if (wh && wh.split(' ').length <= 6 && !ADV(wh.toLowerCase()) && !tk.slice(a, agentStart).some((x, j) => verbAt(tk, a + j) || COPULA.has(x.l))) ev.wh = wh; }
    // direct object
    let obj = null;
    const nxt = tk[k];
    if (nxt && nxt.k !== 'p' && k < b && !(nxt.k === 'w' && PREPS.has(nxt.l) && !PRONOUNS[nxt.l])) {
      if (nxt.l === 'to' && verbAt(tk, k + 1)) { /* infinitive: purpose */ }
      else obj = parseNP(tk, nm, k, b);
    }
    let end = obj ? obj.k1 + 1 : k;
    if (obj) {
      if (obj.toks[0]?.l === 'no') ev.neg = true;
      ev.ob = { t: obj.text };
      if (obj.es.length) ev.ob.e = obj.es.length === 1 ? obj.es[0] : obj.es;
      else { const h = obj.head; const lemmaH = singular(h); ev.ob.h = lemmaH; }
      // place noun as object ("visited the castle")
      if (!obj.es.length && PLACES.has(singular(obj.head)) && !PLACE_ONLY_AFTER_PREP.has(singular(obj.head))) ev.pl = { t: obj.text, h: singular(obj.head), p: null };
    }
    // "set her brother free", "hugged each other"
    if (obj) {
      const rt = tk[end];
      if (rt && rt.k === 'w' && ['free', 'loose', 'alive', 'dead', 'safe'].includes(rt.l)) { ev.res = rt.l; end++; if (lemma === 'set' && rt.l === 'free') { ev.vb = 'free'; ev.vf = 'freed'; delete ev.res; } }
      if (/^(each other|one another)$/.test(obj.toks.map((x) => x.l).join(' '))) { ev.recip = true; delete ev.ob; }
    }
    // control: "made Gretel carry water", "ordered Gretel to climb"
    let control = null;
    if (obj && obj.es.length === 1) {
      const nx = tk[end];
      if (nx && CONTROL_BARE.has(lemma) && verbAt(tk, end)) control = { at: end };
      else if (nx && nx.l === 'to' && CONTROL_TO.has(lemma) && verbAt(tk, end + 1)) control = { at: end + 1 };
      if (control) { delete ev.ob.h; }
    }
    // prepositional phrases
    const pps = [];
    if (!control) {
      let p = end;
      while (p < b) {
        budget.tick('reader.pp');
        const t = tk[p];
        if (t.k === 'p' && t.l === ',') { p++; continue; }
        if (!(t.k === 'w' && PREPS.has(t.l) && !PRONOUNS[t.l])) {
          // bare place adverb: "went home"
          if (t.k === 'w' && PLACES.has(t.l) && !pps.length && !obj && !DET.has(t.l) && !ADV(t.l)) { ev.pl = { t: t.w, h: t.l, p: null }; p++; continue; }
          break;
        }
        if (t.l === 'to' && verbAt(tk, p + 1)) break;
        const pp = headOfPP(tk, nm, p, b);
        if (!pp) { p++; continue; }
        const h = singular(pp.np.head);
        const entry = { p: pp.p, t: pp.np.text };
        if (pp.np.es.length) entry.e = pp.np.es.length === 1 ? pp.np.es[0] : pp.np.es; else entry.h = h;
        pps.push(entry);
        const asPlace = PLACE_PREPS.has(pp.p) && (PLACES.has(h) || (pp.np.es.length === 1 && ents.get(pp.np.es[0])?.kind === 'place'));
        if (asPlace && !ev.pl) ev.pl = { t: pp.np.text, ...(pp.np.es.length === 1 && ents.get(pp.np.es[0])?.kind === 'place' ? { e: pp.np.es[0] } : { h }), p: pp.p };
        else if (!ev.pl && PLACE_PREPS.has(pp.p) && ['to', 'into', 'at', 'in', 'from', 'through', 'across'].includes(pp.p) && pp.np.es.length === 1 && ents.get(pp.np.es[0])?.kind === 'place') ev.pl = { t: pp.np.text, e: pp.np.es[0], p: pp.p };
        p = pp.k1 + 1;
        // bounded: dead branch (the condition ends in false)
        while (p < b && tk[p].k === 'w' && tk[p].l === 'and' && false) p++;
      }
      if (pps.length) ev.pp = pps;
    }
    if (ev.pl && ev.pl.h && !ev.pl.e && PLACES.has(ev.pl.h)) { placeEntity(ev.pl.h); ev.pl.e = `e.${ev.pl.h}`; }
    if (!ev.ob && !ev.pp && !ev.pt && !ev.pl && !agents.length) return null;
    events.push(ev); evN++;
    if (control) {
      const sub = { id: `v${evN + 1}`, s: i, ag: [obj.es[0]], vb: verbAt(tk, control.at).lemma, vf: tk[control.at].l, via: ev.id };
      ev.ctl = [obj.es[0]];
      const rest = parseClauseTail(i, tk, nm, control.at + 1, b);
      Object.assign(sub, rest);
      events.push(sub); evN++;
    }
    return ev;
  }
  function parseClauseTail(i, tk, nm, k, b) {
    const out = {};
    const obj = tk[k] && tk[k].k !== 'p' && !(tk[k].k === 'w' && PREPS.has(tk[k].l)) ? parseNP(tk, nm, k, b) : null;
    let end = obj ? obj.k1 + 1 : k;
    if (obj) { out.ob = { t: obj.text }; if (obj.es.length) out.ob.e = obj.es.length === 1 ? obj.es[0] : obj.es; else out.ob.h = singular(obj.head); }
    const pps = [];
    let p = end;
    while (p < b) {
      budget.tick('reader.pp');
      const t = tk[p];
      if (!(t.k === 'w' && PREPS.has(t.l) && !PRONOUNS[t.l])) { p++; if (p > end + 1) break; continue; }
      const pp = headOfPP(tk, nm, p, b);
      if (!pp) break;
      const h = singular(pp.np.head);
      const e = { p: pp.p, t: pp.np.text };
      if (pp.np.es.length) e.e = pp.np.es.length === 1 ? pp.np.es[0] : pp.np.es; else e.h = h;
      pps.push(e);
      if (!out.pl && PLACE_PREPS.has(pp.p) && (PLACES.has(h) || (pp.np.es.length === 1 && ents.get(pp.np.es[0])?.kind === 'place'))) out.pl = { t: pp.np.text, ...(pp.np.es.length === 1 ? { e: pp.np.es[0] } : { h }), p: pp.p };
      p = pp.k1 + 1;
    }
    if (pps.length) out.pp = pps;
    if (out.pl?.h && !out.pl.e) { placeEntity(out.pl.h); out.pl.e = `e.${out.pl.h}`; }
    return out;
  }

  // ---- places and things as entities (token level counts) ----
  const nounCount = new Map();
  for (const i of bodyIdx) {
    const tk = T[i];
    tk.forEach((t, k) => {
      if (t.k !== 'w' || t.cap && k > 0) return;
      const l = singular(t.l);
      const prev = tk[k - 1];
      const hasDet = prev && prev.k === 'w' && (DET.has(prev.l) || ADJ.has(prev.l) || POSS_DET.has(prev.l));
      if (!hasDet && !(tk[k - 2] && DET.has(tk[k - 2].l))) return;
      if (PLACES.has(l) && !(PLACE_ONLY_AFTER_PREP.has(l) && !PREPS.has(tk[k - 2]?.l) && !PREPS.has(prev?.l))) { bump(nounCount, `p:${l}`); mentions.push([`e.${l}`, i, t.s, t.e, 'x', t.q ? 1 : 0]); }
      else if (THINGS.has(l) || THINGS.has(t.l)) { const lem = THINGS.has(t.l) && !THINGS.has(l) ? t.l : l; bump(nounCount, `t:${lem}`); mentions.push([`e.${lem}`, i, t.s, t.e, 'x', t.q ? 1 : 0]); }
    });
  }
  // keep only the place/thing entities that were seen enough (places once, things twice)
  const keepNoun = new Set();
  for (const [k, n] of nounCount) {
    const [kind, lemma] = [k.slice(0, 1), k.slice(2)];
    if (kind === 'p' && n >= 1) { placeEntity(lemma); keepNoun.add(`e.${lemma}`); }
    else if (kind === 't' && n >= 2) { thingEntity(lemma); keepNoun.add(`e.${lemma}`); }
  }
  for (const ev of events) for (const o of [ev.ob, ...(ev.pp ?? [])]) if (o?.h && !o.e && keepNoun.has(`e.${o.h}`)) o.e = `e.${o.h}`;

  // ---- merge identities ----
  const parent = new Map();
  const find = (x) => { while (parent.has(x) && parent.get(x) !== x) { budget.tick('reader.merge'); x = parent.get(x); } return x; };
  const rank = (eid) => { const e = ents.get(eid); const n = mentions.filter((m) => m[0] === eid).length; return [e.kind === 'character' && !e.role ? 3 : e.role && !GENERIC.has(e.role) && !e.minor ? 2 : e.role && !e.minor ? 1 : 0, n]; };
  for (const [a, b] of links) {
    const ra = find(a), rb = find(b);
    if (ra === rb || !ents.has(ra) || !ents.has(rb)) continue;
    const A = rank(ra), B = rank(rb);
    const [keep, drop] = A[0] > B[0] || (A[0] === B[0] && A[1] >= B[1]) ? [ra, rb] : [rb, ra];
    parent.set(drop, keep);
  }
  const canon = (eid) => (typeof eid === 'string' ? find(eid) : eid);
  if (parent.size) {
    for (const m of mentions) m[0] = canon(m[0]);
    for (const ev of events) {
      ev.ag = [...new Set(ev.ag.map(canon))];
      for (const o of [ev.ob, ev.pl, ...(ev.pp ?? [])]) if (o?.e) o.e = Array.isArray(o.e) ? [...new Set(o.e.map(canon))] : canon(o.e);
    }
    for (const d of dialogue) if (d.sp) d.sp = canon(d.sp);
    for (const s of sentences) if (s.sp) s.sp = canon(s.sp);
    for (const r of relations) { r.a = canon(r.a); r.b = canon(r.b); }
    for (const a of attrs) a.e = canon(a.e);
    for (const [drop, keep] of parent) {
      const D = ents.get(drop), K = ents.get(keep);
      if (!D || !K || drop === find(drop) && drop === keep) continue;
      if (drop === keep) continue;
      const sm = surface.get(keep);
      for (const [s, n] of surface.get(drop) ?? []) sm.set(s, (sm.get(s) ?? 0) + n);
      if (!K.g && D.g) K.g = D.g;
      if (D.plural && !K.role) K.plural = K.plural || false;
      const v = genderVotes.get(drop); if (v) { const kv = genderVotes.get(keep) ?? { m: 0, f: 0 }; kv.m += v.m; kv.f += v.f; genderVotes.set(keep, kv); }
      sm.set(D.name.toLowerCase(), (sm.get(D.name.toLowerCase()) ?? 0) + 0);
      ents.delete(drop); surface.delete(drop);
    }
  }
  // gender from votes
  for (const [eid, v] of genderVotes) { const e = ents.get(eid); if (e && !e.g && (v.m !== v.f)) e.g = v.m > v.f ? 'm' : 'f'; }
  // display names: roles keep "the <role>"
  for (const e of ents.values()) {
    if (e.role && e.kind !== 'character') continue;
    if (e.role && e.name === `the ${e.role}`) continue;
  }
  // counts and first mention
  const counts = new Map(), firsts = new Map();
  const seenKey = new Set();
  const cleanMentions = [];
  for (const m of mentions.sort((a, b) => a[1] - b[1] || a[2] - b[2])) {
    if (!ents.has(m[0])) continue;
    const key = `${m[0]}|${m[1]}|${m[2]}`;
    if (seenKey.has(key)) continue; seenKey.add(key);
    cleanMentions.push(m);
    counts.set(m[0], (counts.get(m[0]) ?? 0) + 1);
    if (!firsts.has(m[0])) firsts.set(m[0], m[1]);
  }
  const entities = [];
  for (const e of ents.values()) {
    const n = counts.get(e.id) ?? 0;
    if (!n) continue;
    if (e.kind === 'character' && e.minor && n < 2 && !events.some((x) => x.ag.includes(e.id)) && !dialogue.some((d) => d.sp === e.id)) continue;
    const surf = [...(surface.get(e.id) ?? [])].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    entities.push({ id: e.id, name: displayName(e), kind: e.kind, g: e.g || '', n, first: firsts.get(e.id), ...(e.role ? { role: e.role } : {}), ...(e.plural ? { plural: true } : {}), ...(e.minor ? { minor: true } : {}), aliases: surf.slice(0, 8) });
  }
  entities.sort((a, b) => b.n - a.n || a.first - b.first);
  const entIds = new Set(entities.map((e) => e.id));
  for (const ev of events) if (ev.ag.some((x) => !entIds.has(x))) ev.ag = ev.ag.filter((x) => entIds.has(x));
  for (const ev of events) delete ev.ctl;
  const evOut = events.filter((ev) => ev.ag.length || ev.agt || ev.ob || ev.pl);
  evOut.forEach((ev, n) => { ev.id = `v${n + 1}`; });
  const relOut = [], relSeen = new Set();
  for (const r of relations) { const key = `${r.a}|${r.rel}|${r.b}`; if (r.a === r.b || relSeen.has(key) || !entIds.has(r.a) || !entIds.has(r.b)) continue; relSeen.add(key); relOut.push({ id: `r${relOut.length + 1}`, ...r }); }

  // ---- keywords and summary scores ----
  const paraTexts = paras.filter((p) => !p.note).map((p) => sentences.slice(p.first, p.last + 1).map((s) => s.text).join(' '));
  const nameStems = new Set(entities.filter((e) => e.kind === 'character' && !e.role).flatMap((e) => words(e.name).map(stem)));
  const keywords = tfidfKeywords(paraTexts.length > 1 ? paraTexts : bodyIdx.map((i) => sentences[i].text), { top: 24 });
  const weight = new Map(keywords.map((k) => [k.stem, k.score]));
  const allTf = new Map();
  for (const i of bodyIdx) for (const t of contentStems(sentences[i].text)) allTf.set(t, (allTf.get(t) ?? 0) + 1);
  const maxTf = Math.max(1, ...allTf.values());
  for (const i of bodyIdx) {
    const s = sentences[i];
    const st = contentStems(s.text);
    let sc = 0;
    for (const t of new Set(st)) sc += (weight.get(t) ?? 0.2 * (allTf.get(t) ?? 0) / maxTf * 3);
    const len = Math.max(4, st.length);
    sc = sc / Math.sqrt(len);
    const nTok = words(s.text).length;
    if (s.q.length && s.speech) sc *= 0.35; else if (s.q.length) sc *= 0.7;
    if (nTok < 6) sc *= 0.5;
    if (nTok > 40) sc *= 0.7;
    const sec = sections[s.sec];
    if (sec && s.i === sec.first && !s.q.length) sc *= 1.25;
    if (s.list) sc *= 0.8;
    s.sc = Math.round(sc * 1000) / 1000;
  }
  const wordCount = words(sentences.filter((s) => !s.note).map((s) => s.text).join(' ')).length;
  const doc = {
    v: VERSION, id, title, format, name: opts.name ?? null, origin: opts.origin ?? 'upload', tags: opts.tags ?? [],
    words: wordCount, chars: String(text ?? '').length,
    notes, sections, paras, sentences: sentences.map(({ q, ...s }) => ({ ...s, q: q.length ? q : undefined })),
    entities, mentions: cleanMentions, events: evOut, dialogue, relations: relOut, attrs: attrs.filter((a) => entIds.has(canon(a.e))).map((a) => ({ ...a, e: canon(a.e) })),
    keywords,
  };
  for (const s of doc.sentences) if (!s.q) delete s.q;
  return doc;
}

function displayName(e) {
  if (e.kind === 'character' && !e.role) return e.name;
  if (e.role) return `the ${e.role.replace(/_/g, ' ')}`;
  return e.name;
}

// ---- views over an analyzed document ----------------------------------------------------------------------------
/** Quick lookup tables (by id), rebuilt on demand. */
export function view(doc) {
  const byId = new Map(doc.entities.map((e) => [e.id, e]));
  return { byId, ent: (id) => byId.get(id) ?? null };
}

/** The entity that is `rel` of entity `eid` (from the relations of the document, in both directions), or null. */
export function kinOfDoc(doc, eid, rel) {
  const g = (id) => doc.entities.find((e) => e.id === id)?.g ?? '';
  for (const r of doc.relations) {
    if (r.a === eid && r.rel === rel) return { e: r.b, r };
    if (r.b === eid && KIN_INVERSE[r.rel] && KIN_INVERSE[r.rel][g(r.a)] === rel) return { e: r.a, r };
    if (r.b === eid && r.rel === rel && ['friend', 'cousin', 'sibling', 'spouse'].includes(rel)) return { e: r.a, r };
  }
  return null;
}

// ---- SOP Lang ---------------------------------------------------------------------------------------------------
const q = (s) => JSON.stringify(String(s));
export const wireIdOf = (doc, kind, key) => `${doc.id}.${kind === 'sentence' ? `s${Number(key) + 1}` : kind === 'event' ? key : kind === 'entity' ? key : kind === 'said' ? key : key}`;
/**
 * SOP Lang of the document facts, in batches (so that references point at wires that already exist):
 * [documents + sentences + entities], [events + dialogue + relations]. Every fact has core.source="<doc id>#s<sentence number>".
 */
export function toSop(doc, { maxSentences = 600, maxEvents = 600 } = {}) {
  const sid = (i) => `${doc.id}.s${i + 1}`;
  const src = (i) => `core.source=${q(`${doc.id}#s${i + 1}`)}`;
  const A = [`@${doc.id} docs.reader.document title=${q(doc.title)} format=${doc.format} words=${doc.words} sentences=${doc.sentences.length} sections=${doc.sections.length} origin=${q(doc.origin ?? 'upload')} core.source=${q(doc.name ?? doc.id)}`];
  for (const s of doc.sentences.slice(0, maxSentences)) {
    A.push(`@${sid(s.i)} docs.reader.sentence text=${q(s.text)} number=${s.i + 1} paragraph=${s.p + 1} section=${q(doc.sections[s.sec]?.title ?? '')} ${src(s.i)}`);
  }
  const have = new Set(doc.sentences.slice(0, maxSentences).map((s) => s.i));
  const eid = (id) => `${doc.id}.${id}`;
  for (const e of doc.entities) {
    A.push(`@${eid(e.id)} docs.reader.entity name=${q(e.name)} kind=${e.kind}${e.g ? ` gender=${e.g}` : ''} mentions=${e.n} ${src(e.first ?? 0)}`);
  }
  const B = [];
  const known = new Set(doc.entities.map((e) => e.id));
  for (const ev of doc.events.slice(0, maxEvents)) {
    if (!have.has(ev.s)) continue;
    const ags = ev.ag.filter((x) => known.has(x)).map((x) => ` agent=$${eid(x)}`).join('');
    const obj = ev.ob ? ` object=${q(ev.ob.t)}` : '';
    const place = ev.pl ? ` place=${q(ev.pl.t)}` : '';
    B.push(`@${doc.id}.${ev.id} docs.reader.event${ags}${ev.agt && !ags ? ` agent.text=${q(ev.agt)}` : ''} verb=${q(ev.vb)}${obj}${place}${ev.neg ? ' negated=true' : ''}${ev.wh ? ` when=${q(ev.wh)}` : ''} sentence=$${sid(ev.s)} ${src(ev.s)}`);
  }
  for (const d of doc.dialogue) {
    if (!have.has(d.s)) continue;
    B.push(`@${doc.id}.${d.id} docs.reader.said${d.sp && known.has(d.sp) ? ` speaker=$${eid(d.sp)}` : ''} text=${q(d.text)} sentence=$${sid(d.s)} ${src(d.s)}`);
  }
  for (const r of doc.relations) B.push(`@${doc.id}.${r.id} docs.reader.relation of=$${eid(r.a)} relation=${q(r.rel)} is=$${eid(r.b)} ${src(r.s)}`);
  return [A.join('\n'), B.join('\n')].filter(Boolean);
}
