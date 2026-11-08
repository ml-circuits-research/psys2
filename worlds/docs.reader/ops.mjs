// Operations of docs.reader: talk with documents the user added in the browser (spec 09). Browser-safe; imports only files of this world.
//
// State (ctx.state): { docs: [Document], active: id | null, search: null | { doc, query, terms, hits: [sentence], pos },
//   focus: { doc, sentences: [i], entities: [id], terms: [stem], n }, last: null | { op, args, offset }, wired: [doc ids], visible }
//   Document = the object of analyze.mjs (sections, paras, sentences, entities, mentions, events, dialogue, relations, attrs, keywords).
// The tab renders the state: the document view highlights `focus.sentences` (the cited sentences) and `focus.entities`, the search
// hits and the outline. Every answer cites sentences ("(sentence 12)"); the cited sentence numbers are 1-based.
// Facts are also written to the session as SOP Lang wires with core.source="<doc id>#s<n>" (toSop of analyze.mjs), once per document.
// Effects: speech.say { text } (read aloud). Cross-world: ctx.request('ui.openTab', { tab: 'documents' }) after every answer.
import { analyzeDocument, toSop, kinOfDoc } from './analyze.mjs';
import { SAMPLE } from './sample.mjs';
import { buildBm25, bm25Search, contentStems, stem, words, tfidfKeywords } from './text.mjs';
import { verbForm, ORDINALS, ROLES, KIN, KIN_INVERSE, singular, cap, plural, STOP, PRONOUNS } from './lang.mjs';

const TAB = 'documents';
const ok = (value, extra) => ({ status: 'supported', value, ...extra });
const no = (status, note) => ({ status, note });
const joinAnd = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const uniq = (a) => [...new Set(a.filter((x) => x !== null && x !== undefined))];
const EMPTY = 'There is no document open. Drop a .md, .txt, .pdf or .docx file on the Documents tab, or say "load the sample".';

// ---- documents and state ----------------------------------------------------------------------------------------
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'document';

/** A new document object from text (used by the tab when a file is added and by the sample). */
export function makeDocument(text, opts = {}) { return analyzeDocument(text, opts); }
export function sampleDocument() { return analyzeDocument(SAMPLE.text, { name: SAMPLE.name, title: SAMPLE.title, format: SAMPLE.format, origin: SAMPLE.origin, tags: SAMPLE.tags, id: 'doc_hansel_and_gretel' }); }
/** State patch that adds (or replaces, same name) a document and makes it the active one; pure, used by the tab. */
export function withDocument(state, doc) {
  const docs = [...(state?.docs ?? [])];
  const same = docs.findIndex((d) => d.name && d.name === doc.name && d.origin === doc.origin);
  let id = doc.id, n = 2;
  if (same >= 0) id = docs[same].id;
  else while (docs.some((d) => d.id === id)) id = `${doc.id}_${n++}`;
  const d = { ...doc, id };
  if (same >= 0) docs[same] = d; else docs.push(d);
  return { docs, active: id, search: null, focus: { doc: id, sentences: [], entities: [], terms: [], n: (state?.focus?.n ?? 0) + 1 }, last: null };
}

export function initialState() {
  const d = sampleDocument();
  return { docs: [d], active: d.id, search: null, focus: { doc: d.id, sentences: [], entities: [], terms: [], n: 0 }, last: null, wired: [], visible: null, inputMode: null };
}
const st = (ctx) => {
  const s = ctx.state;
  s.docs ??= []; s.wired ??= [];
  if (s.active === undefined) s.active = s.docs[0]?.id ?? null;
  s.focus ??= { doc: s.active, sentences: [], entities: [], terms: [], n: 0 };
  return s;
};
const current = (ctx) => { const s = st(ctx); return s.docs.find((d) => d.id === s.active) ?? null; };
const need = (ctx) => { const d = current(ctx); return d ? { d } : { env: no('missing', EMPTY) }; };
const show = (ctx) => { const s = st(ctx); s.visible = true; s.inputMode = 'documents'; try { ctx.request('ui.openTab', { tab: TAB }); } catch { /* the shell may be absent */ } };

// ---- indexes (cached by document id and size) --------------------------------------------------------------------
const bmCache = new Map();
const bm = (d) => {
  const key = `${d.id}:${d.sentences.length}:${d.chars}`;
  let x = bmCache.get(key);
  if (!x) { x = buildBm25(d.sentences); bmCache.set(key, x); if (bmCache.size > 12) bmCache.delete(bmCache.keys().next().value); }
  return x;
};

// ---- wires -------------------------------------------------------------------------------------------------------
function ensureWires(ctx, d) {
  const s = st(ctx);
  if (s.wired.includes(d.id)) return;
  s.wired.push(d.id);
  try { for (const batch of toSop(d)) ctx.emit(batch); } catch (e) { s.wired.pop(); s.wiredError = String(e?.message ?? e); }
}
const sentWire = (d, i) => `${d.id}.s${i + 1}`;
const fromOf = (d, cite) => cite.slice(0, 12).map((i) => sentWire(d, i));

// ---- answer plumbing ---------------------------------------------------------------------------------------------
const citeText = (cite) => {
  const n = uniq(cite).sort((a, b) => a - b).map((i) => i + 1);
  if (!n.length) return '';
  const shown = n.slice(0, 6), more = n.length - shown.length;
  return `(${shown.length === 1 ? 'sentence' : 'sentences'} ${joinAnd(shown.map(String))}${more > 0 ? ` and ${more} more` : ''})`;
};
/** Record what the answer is about (the tab highlights it) and build the envelope. */
function answer(ctx, d, text, { cite = [], entities = [], terms = [], last = null, note = true, data = {}, emphasis = null } = {}) {
  const s = st(ctx);
  ensureWires(ctx, d);
  s.focus = { doc: d.id, sentences: uniq(cite).sort((a, b) => a - b), entities: uniq(entities), terms: uniq(terms), n: (s.focus?.n ?? 0) + 1, ...(emphasis !== null ? { emphasis } : {}) };
  if (last !== undefined) s.last = last;
  show(ctx);
  const c = note ? citeText(cite) : '';
  return ok(c ? `${text} ${c}` : text, { from: fromOf(d, uniq(cite)), data: { doc: d.id, cite: uniq(cite), ...data } });
}
const snippet = (t, n = 150) => { const x = t.replace(/\s+/g, ' ').trim(); return x.length <= n ? x : `${x.slice(0, n - 1).replace(/\s+\S*$/, '')}…`; };
const quoteOf = (d, i, n = 150) => `"${snippet(d.sentences[i].text, n)}"`;

// ---- entities ------------------------------------------------------------------------------------------------------
const DETS = /^(?:the|a|an|this|that|these|those|his|her|their|its|my|our|your|old|poor|little|young|wicked|evil|good|kind|cruel)\s+/;
const norm = (t) => String(t ?? '').toLowerCase().replace(/[“”"«»]/g, '').replace(/[’]/g, "'").replace(/'s\b/g, '').replace(/[^a-z0-9' -]+/g, ' ').replace(/\s+/g, ' ').trim();
const bare = (t) => { let x = norm(t); for (let i = 0; i < 3; i++) x = x.replace(DETS, ''); return x; };
const nameOf = (d, id) => { const e = d.entities.find((x) => x.id === id); return e ? e.name : String(id).replace(/^e\./, '').replace(/_/g, ' '); };
const nameCap = (d, id) => cap(nameOf(d, id));
const lastEntityOf = (ctx, d, g) => {
  const s = st(ctx);
  const last = s.last?.entity && d.entities.find((e) => e.id === s.last.entity);
  if (last && (!g || !last.g || last.g === g)) return last;
  return null;
};
/** Entity of the document for a phrase ("the witch", "Hansel", "her brother", "he"). */
export function findEntity(d, phrase, ctx = null, strict = false) {
  const p = norm(phrase);
  if (!p) return null;
  if (PRONOUNS[p] && ctx) {
    const last = lastEntityOf(ctx, d, PRONOUNS[p].g === 'p' ? '' : PRONOUNS[p].g);
    if (last || PRONOUNS[p].g !== 'p') return last;
    return d.entities.filter((e) => e.plural && e.kind === 'character').sort((a, b) => b.n - a.n)[0] ?? null; // "they" with no earlier subject: the main group
  }
  const t = bare(p);
  if (!t) return null;
  const tk = t.split(' ');
  let best = null, bestScore = 0;
  for (const e of d.entities) {
    const forms = uniq([bare(e.name), ...e.aliases.map(bare), e.role ? e.role.replace(/_/g, ' ') : null]).filter(Boolean);
    let sc = 0;
    for (const f of forms) {
      if (f === t || singular(f) === singular(t)) sc = Math.max(sc, 5);
      else {
        const ft = f.split(' ');
        if (tk.every((w) => ft.includes(w) || ft.includes(singular(w)))) sc = Math.max(sc, 3);
        else if (!strict && ft.every((w) => tk.includes(w))) sc = Math.max(sc, 2);
      }
    }
    if (sc && e.kind === 'character') sc += 0.5;
    if (sc > bestScore || (sc === bestScore && sc && e.n > (best?.n ?? 0))) { best = e; bestScore = sc; }
  }
  return best;
}
const eventsOf = (d, id, as = 'agent') => d.events.filter((v) => (as === 'agent' ? v.ag.includes(id) : as === 'object' ? [v.ob, ...(v.pp ?? [])].some((o) => o && (Array.isArray(o.e) ? o.e.includes(id) : o.e === id)) : false));
const mentionSentences = (d, id) => uniq(d.mentions.filter((m) => m[0] === id).map((m) => m[1]));
const NOT_FOUND = (d, phrase) => no('missing', `I could not find "${snippet(String(phrase).trim(), 40)}" in "${d.title}". ${d.entities.filter((e) => e.kind === 'character').length ? `The characters I know are ${joinAnd(d.entities.filter((e) => e.kind === 'character' && !e.minor).slice(0, 6).map((e) => e.name))}.` : 'Try a word that is in the text.'}`);

// ---- phrases of events ----------------------------------------------------------------------------------------------
const objText = (d, o) => (Array.isArray(o.e) && o.e.length > 1 ? joinAnd(o.e.map((x) => nameOf(d, x))) : o.t);
function evPhrase(d, ev, { agent = true } = {}) {
  const ag = ev.ag.length ? joinAnd(ev.ag.map((x) => nameCap(d, x))) : cap(ev.agt ?? 'someone');
  const verb = ev.neg ? `did not ${ev.vb}` : ev.vf;
  const parts = [verb];
  if (ev.pt) parts.push(ev.pt);
  if (ev.recip) parts.push('each other');
  if (ev.ob) parts.push(objText(d, ev.ob));
  if (ev.res) parts.push(ev.res);
  const pps = (ev.pp ?? []).filter((p) => !(ev.ob && p.t === ev.ob.t)).slice(0, 2).map((p) => `${p.p} ${p.t}`);
  if (pps.length) parts.push(...pps);
  else if (ev.pl && !ev.ob) parts.push(ev.pl.p ? `${ev.pl.p} ${ev.pl.t}` : ev.pl.t);
  return `${agent ? `${ag} ` : ''}${parts.join(' ')}`;
}
const evSummary = (d, evs, max = 8) => evs.slice(0, max).map((v) => `${evPhrase(d, v, { agent: false })}`);

// ---- sentence ranges -------------------------------------------------------------------------------------------------
const bodyOf = (d, from = 0, to = d.sentences.length - 1) => d.sentences.filter((s) => s.i >= from && s.i <= to);
function summarize(d, { k = 4, from = 0, to = d.sentences.length - 1, skip = 0 } = {}) {
  const pool = bodyOf(d, from, to).filter((s) => !s.speech && s.text.length > 20);
  const ranked = [...(pool.length ? pool : bodyOf(d, from, to))].sort((a, b) => (b.sc ?? 0) - (a.sc ?? 0) || a.i - b.i);
  return ranked.slice(skip, skip + k).sort((a, b) => a.i - b.i).map((s) => s.i);
}
const sectionRange = (d, idx) => { const s = d.sections[idx]; return s ? [s.first, s.last] : [0, d.sentences.length - 1]; };
const secLabel = (d, i) => `section ${i + 1}, "${d.sections[i].title}"`;

// ---- operations: overview ------------------------------------------------------------------------------------------------
export function describe(ctx) {
  const r = need(ctx); if (r.env) return r.env;
  const d = r.d;
  const chars = d.entities.filter((e) => e.kind === 'character' && !e.minor).slice(0, 4);
  const places = d.entities.filter((e) => e.kind === 'place').slice(0, 3);
  const kw = d.keywords.slice(0, 5).map((k) => k.term);
  const bits = [`"${d.title}" has ${d.words} words in ${d.sections.length} ${d.sections.length === 1 ? 'section' : 'sections'} (${d.sentences.length} sentences${d.format === 'md' ? '' : ''}).`];
  if (chars.length) bits.push(`The main characters are ${joinAnd(chars.map((e) => e.name))}.`);
  if (places.length) bits.push(`Places: ${joinAnd(places.map((e) => e.name))}.`);
  if (kw.length) bits.push(`Key words: ${joinAnd(kw)}.`);
  bits.push('Ask me what it is about, who the characters are, or search for a word.');
  return answer(ctx, d, bits.join(' '), { entities: chars.map((e) => e.id), cite: [], note: false, last: { op: 'describe' } });
}

/**
 * Relative section reference ("that section", "the next section", "the one before that") against the section last read or summarized
 * (`state.section` of `state.sectionDoc`). Returns { idx } or { env } (the answer when it cannot be resolved).
 */
function relativeSection(ctx, d, rel) {
  const s = ctx.state;
  const cur = s.sectionDoc === d.id && Number.isInteger(s.section) ? s.section : null;
  const word = { same: 'that', next: 'the next', prev: 'the previous' }[rel] ?? rel;
  if (cur === null) {
    if (rel === 'next') return { idx: 1 };
    return { env: no('missing', `Which section do you mean by "${word} section"? Say for example "section 2" (this document has ${d.sections.length}).`) };
  }
  const idx = rel === 'same' ? cur : rel === 'next' ? cur + 1 : cur - 1;
  if (idx < 1 || idx > d.sections.length) return { env: no('missing', rel === 'next' ? `Section ${cur} is the last one.` : `Section ${cur} is the first one.`) };
  return { idx };
}

export function summary(ctx, { n, ord, k, scope, rel } = {}) {
  const r = need(ctx); if (r.env) return r.env;
  const d = r.d;
  let idx = null;
  if (ord) idx = ORDINALS[String(ord).toLowerCase()];
  if (n !== undefined && n !== '') idx = Number(n);
  if (idx === -1) idx = d.sections.length;
  if (rel) { const x = relativeSection(ctx, d, rel); if (x.env) return x.env; idx = x.idx; }
  if (idx && d.sections[idx - 1]) { ctx.state.section = idx; ctx.state.sectionDoc = d.id; ctx.state.ctx = 'section'; }
  let from = 0, to = d.sentences.length - 1, label = '';
  if (idx) {
    if (!d.sections[idx - 1]) return no('missing', `"${d.title}" has only ${d.sections.length} ${d.sections.length === 1 ? 'section' : 'sections'}.`);
    [from, to] = sectionRange(d, idx - 1); label = `Section ${idx}, "${d.sections[idx - 1].title}": `;
  }
  const kk = Math.max(1, Math.min(8, Number(k) || (idx ? 2 : 4)));
  const cite = summarize(d, { k: kk, from, to });
  if (!cite.length) return no('missing', 'There is no text to summarize.');
  const text = cite.map((i) => d.sentences[i].text).join(' ');
  return answer(ctx, d, `${label || 'In short: '}${text}`, { cite, last: { op: 'summary', args: { n: idx ?? undefined, k: kk }, offset: kk } });
}

export function characters(ctx) {
  const r = need(ctx); if (r.env) return r.env;
  const d = r.d;
  const cs = d.entities.filter((e) => e.kind === 'character' && (!e.minor || e.n >= 2)).slice(0, 10);
  if (!cs.length) return no('missing', `I did not find any characters in "${d.title}". Characters are names and roles such as "the witch".`);
  const list = cs.map((e) => `${e.name} (${e.n})`);
  return answer(ctx, d, `The characters are ${joinAnd(list)}; the number is how often each is mentioned.`, { cite: cs.map((e) => e.first).filter((x) => x !== undefined).slice(0, 6), entities: cs.map((e) => e.id), note: false, last: { op: 'characters' } });
}

export function mainCharacter(ctx) {
  const r = need(ctx); if (r.env) return r.env;
  const d = r.d;
  const cs = d.entities.filter((e) => e.kind === 'character' && !e.minor);
  if (!cs.length) return no('missing', `I did not find any character in "${d.title}".`);
  const a = cs[0], b = cs[1];
  const acts = eventsOf(d, a.id);
  return answer(ctx, d, `The main character is ${a.name}, mentioned ${a.n} times${b ? ` (${b.name} follows with ${b.n})` : ''}.${acts.length ? ` For example, ${a.name} ${evPhrase(d, acts[0], { agent: false })}.` : ''}`, { cite: acts.length ? [acts[0].s] : [a.first], entities: [a.id], last: { op: 'who', entity: a.id } });
}

export function places(ctx, { kind } = {}) {
  const r = need(ctx); if (r.env) return r.env;
  const d = r.d;
  const k = kind === 'things' ? 'thing' : 'place';
  const es = d.entities.filter((e) => e.kind === k).slice(0, 10);
  if (!es.length) return no('missing', `I did not find any ${k === 'place' ? 'places' : 'objects'} in "${d.title}".`);
  const text = k === 'place' ? `The places mentioned are ${joinAnd(es.map((e) => `${e.name} (${e.n})`))}.` : `The things that come up most are ${joinAnd(es.map((e) => `${e.name} (${e.n})`))}.`;
  return answer(ctx, d, text, { cite: es.map((e) => e.first).filter((x) => x !== undefined).slice(0, 6), entities: es.map((e) => e.id), note: false, last: { op: kind === 'things' ? 'things' : 'places' } });
}

export function keywords(ctx) {
  const r = need(ctx); if (r.env) return r.env;
  const d = r.d;
  const kw = d.keywords.slice(0, 8);
  if (!kw.length) return no('missing', 'There is not enough text to find key words.');
  return answer(ctx, d, `The key words (TF-IDF) are ${joinAnd(kw.map((k) => k.term))}.`, { terms: kw.map((k) => k.stem), note: false, last: { op: 'keywords' } });
}

export function outline(ctx) {
  const r = need(ctx); if (r.env) return r.env;
  const d = r.d;
  if (!d.sections.length) return no('missing', 'This document has no headings.');
  const lines = d.sections.map((s, i) => `${i + 1}. ${s.title} (${Math.max(0, s.last - s.first + 1)} sentences)`);
  const only = d.sections.length === 1 && d.sections[0].title === d.title;
  return answer(ctx, d, only ? `"${d.title}" has no headings; it is one section of ${d.sentences.length} sentences.` : `"${d.title}" has ${d.sections.length} sections: ${lines.join('; ')}.`, { cite: d.sections.filter((s) => s.last >= s.first).map((s) => s.first), note: false, last: { op: 'outline' } });
}

export function stats(ctx, { u } = {}) {
  const r = need(ctx); if (r.env) return r.env;
  const d = r.d;
  const unit = singular(String(u ?? '').toLowerCase());
  const parts = { sentence: d.sentences.length, word: d.words, paragraph: d.paras.length, section: d.sections.length, chapter: d.sections.length, heading: d.sections.length, character: d.entities.filter((e) => e.kind === 'character' && !e.minor).length, line: d.dialogue.length };
  if (unit in parts) {
    const n = parts[unit];
    const label = unit === 'character' ? 'character' : unit === 'line' ? 'line of dialogue' : unit;
    return answer(ctx, d, `"${d.title}" has ${n} ${n === 1 ? label : label === 'line of dialogue' ? 'lines of dialogue' : plural(label)}.`, { note: false, last: { op: 'stats' }, entities: unit === 'character' ? d.entities.filter((e) => e.kind === 'character' && !e.minor).map((e) => e.id) : [] });
  }
  return answer(ctx, d, `"${d.title}" has ${d.words} words, ${d.sentences.length} sentences, ${d.paras.length} paragraphs and ${d.sections.length} ${d.sections.length === 1 ? 'section' : 'sections'}; reading it takes about ${Math.max(1, Math.round(d.words / 200))} minutes.`, { note: false, last: { op: 'stats' } });
}

// ---- operations: entities ----------------------------------------------------------------------------------------------------
function roleWords(d, e) {
  const out = [];
  for (const a of e.aliases) {
    if (/^(his|her|their|its|my|our|your)\b/.test(norm(a))) continue;
    const b = bare(a);
    const last = b.split(' ').at(-1);
    if (ROLES[last] !== undefined && b !== bare(e.name) && !out.includes(last)) out.push(last);
  }
  if (e.role && ROLES[e.role] !== undefined && !out.includes(e.role)) out.unshift(e.role);
  return out;
}
export function who(ctx, { x } = {}) {
  const r = need(ctx); if (r.env) return r.env;
  const d = r.d;
  const e = findEntity(d, x, ctx);
  if (!e) return NOT_FOUND(d, x);
  const pro = e.plural ? 'They' : e.g === 'm' ? 'He' : e.g === 'f' ? 'She' : 'It';
  const sents = mentionSentences(d, e.id);
  const roles = roleWords(d, e);
  const bits = [];
  if (e.kind === 'character') {
    const isRole = e.role && bare(e.name) === e.role;
    const rs = roles.filter((w) => !(isRole && w === e.role)).slice(0, 3);
    const noun = (w) => `${/^[aeiou]/.test(w) ? 'an' : 'a'} ${w}`;
    bits.push(isRole ? `${cap(e.name)} ${e.plural ? 'are characters' : 'is a character'}${rs.length ? ` (also: ${joinAnd(rs.map((w) => `the ${w}`))})` : ''}.` : `${e.name} ${e.plural ? 'are' : 'is'} ${rs.length ? joinAnd(rs.slice(0, 2).map(noun)) : 'a character'} in the story.`);
    const rel = d.relations.filter((q) => q.a === e.id || q.b === e.id).slice(0, 2);
    for (const q of rel) {
      if (q.a === e.id) bits.push(`${e.name}'s ${q.rel} is ${nameOf(d, q.b)}.`);
      else bits.push(`${e.name} is ${nameOf(d, q.a)}'s ${(KIN_INVERSE[q.rel] ?? {})[d.entities.find((z) => z.id === q.a)?.g ?? ''] ? (q.rel === 'sister' || q.rel === 'brother' ? (e.g === 'f' ? 'sister' : e.g === 'm' ? 'brother' : 'sibling') : (KIN_INVERSE[q.rel][d.entities.find((z) => z.id === q.a)?.g ?? ''])) : q.rel}.`);
    }
    const attrs = uniq(d.attrs.filter((a) => a.e === e.id).map((a) => a.text)).slice(0, 3);
    if (attrs.length) bits.push(`${pro} ${e.plural ? 'are' : 'is'} described as ${joinAnd(attrs)}.`);
  } else bits.push(`${cap(e.name)} is a ${e.kind === 'place' ? 'place' : 'thing'} in the text.`);
  bits.push(`${e.name === cap(e.name) || !e.role ? e.name : cap(e.name)} is mentioned ${e.n} ${e.n === 1 ? 'time' : 'times'}, first in sentence ${(e.first ?? sents[0] ?? 0) + 1}.`);
  const acts = eventsOf(d, e.id).slice(0, 2);
  if (acts.length) bits.push(`For example, ${e.name === cap(e.name) || !e.role ? e.name : e.name} ${joinAnd(acts.map((v) => evPhrase(d, v, { agent: false })))}.`);
  const cite = uniq([e.first ?? sents[0], ...acts.map((v) => v.s)]).filter((i) => i !== undefined);
  return answer(ctx, d, bits.join(' '), { cite, entities: [e.id], last: { op: 'who', entity: e.id } });
}

export function did(ctx, { x, offset } = {}) {
  const r = need(ctx); if (r.env) return r.env;
  const d = r.d;
  const e = findEntity(d, x, ctx);
  if (!e) return NOT_FOUND(d, x);
  const evs = eventsOf(d, e.id);
  if (!evs.length) {
    const about = mentionSentences(d, e.id).slice(0, 3);
    if (!about.length) return no('missing', `${e.name} does not do anything in "${d.title}".`);
    return answer(ctx, d, `I found no action by ${e.name}, but ${e.name} is mentioned here: ${about.slice(0, 2).map((i) => quoteOf(d, i, 110)).join(' ')}`, { cite: about, entities: [e.id], last: { op: 'who', entity: e.id } });
  }
  const off = Number(offset) || 0;
  const slice = evs.slice(off, off + 8);
  if (!slice.length) return no('missing', `That is everything ${e.name} does in the document.`);
  const phrases = slice.map((v) => evPhrase(d, v, { agent: false }));
  const more = evs.length - off - slice.length;
  return answer(ctx, d, `${cap(e.name)}: ${phrases.join('; ')}.${more > 0 ? ` There are ${more} more; say "tell me more".` : ''}`, { cite: slice.map((v) => v.s), entities: [e.id], last: { op: 'did', args: { x: e.name }, offset: off + slice.length, entity: e.id } });
}

export function happened(ctx, { x } = {}) {
  const r = need(ctx); if (r.env) return r.env;
  const d = r.d;
  const e = findEntity(d, x, ctx);
  if (!e) return NOT_FOUND(d, x);
  const acted = eventsOf(d, e.id, 'object');
  const attrs = d.attrs.filter((a) => a.e === e.id);
  const items = [];
  const cite = [];
  for (const v of acted.slice(0, 5)) { items.push(evPhrase(d, v)); cite.push(v.s); }
  const end = attrs.at(-1);
  if (end && /dead|lost|free|safe|happy|rich|poor|married/.test(end.text)) { items.push(`${cap(e.name)} was ${end.text}`); cite.push(end.s); }
  if (!items.length) return did(ctx, { x: e.name });
  const own = eventsOf(d, e.id).slice(0, 2);
  return answer(ctx, d, `${items.join('; ')}.${own.length ? ` Also, ${e.name} ${evSummary(d, own, 2).join(' and ')}.` : ''}`, { cite: uniq([...cite, ...own.map((v) => v.s)]), entities: [e.id], last: { op: 'happened', entity: e.id } });
}

const LIVE_VERBS = new Set(['live', 'stay', 'dwell', 'reside', 'sleep']);
export function where(ctx, { x, mode } = {}) {
  const r = need(ctx); if (r.env) return r.env;
  const d = r.d;
  const e = findEntity(d, x, ctx);
  if (!e) return NOT_FOUND(d, x);
  const m = String(mode ?? 'be');
  const evs = eventsOf(d, e.id).filter((v) => v.pl);
  const phrase = (v) => `${v.ag.length ? '' : ''}${v.vf}${v.pt ? ` ${v.pt}` : ''} ${v.pl.p ? `${v.pl.p} ` : ''}${v.pl.t}`;
  let pick;
  if (m === 'live') pick = evs.filter((v) => LIVE_VERBS.has(v.vb));
  else if (m === 'go') pick = evs.filter((v) => !LIVE_VERBS.has(v.vb) && (!v.pl.p || ['to', 'into', 'toward', 'towards', 'across', 'through', 'from'].includes(v.pl.p)));
  else pick = evs;
  if (e.kind === 'place' || e.kind === 'thing') {
    const where2 = d.events.filter((v) => v.pl && (v.pl.e === e.id)).slice(0, 4);
    if (!where2.length) return no('missing', `The document does not say where ${e.name} ${e.plural ? 'are' : 'is'}.`);
    return answer(ctx, d, `${cap(e.name)} comes up when ${joinAnd(where2.slice(0, 3).map((v) => evPhrase(d, v)))}.`, { cite: where2.map((v) => v.s), entities: [e.id], last: { op: 'where', entity: e.id } });
  }
  if (!pick.length) {
    if (m === 'live') {
      const hit = bm25Search(bm(d), `${e.name} live lived home house`, { limit: 3 }).hits.filter((h) => mentionSentences(d, e.id).includes(h.i)).slice(0, 2);
      return notSaid(ctx, d, `The document does not say where ${e.name} ${e.plural ? "live" : "lives"}.`, hit.map((h) => h.i), e.id);
    }
    return notSaid(ctx, d, `The document does not say where ${e.name} ${m === 'go' ? (e.plural ? 'go' : 'goes') : (e.plural ? 'are' : 'is')}.`, mentionSentences(d, e.id).slice(0, 2), e.id);
  }
  const use = m === 'be' ? [pick.at(-1)] : pick.slice(0, m === 'live' ? 1 : 5);
  const text = m === 'live' ? `${cap(e.name)} ${phrase(use[0])}.` : m === 'go' ? `${cap(e.name)} ${use.map((v) => phrase(v)).join(', then ')}.` : `The last place the document mentions for ${e.name} is ${use[0].pl.t}: ${e.name} ${phrase(use[0])}.`;
  return answer(ctx, d, text, { cite: use.map((v) => v.s), entities: [e.id], last: { op: 'where', entity: e.id } });
}

/** "the witch locked Hansel in a cage" -> { agent entity, verb lemma, object words } from a free phrase. */
function parseEventQuery(d, text) {
  const toks = norm(text).split(' ').filter(Boolean);
  let agent = null, used = 0;
  for (let len = Math.min(4, toks.length); len >= 1 && !agent; len--) {
    for (let from = 0; from + len <= Math.min(toks.length, 4) && !agent; from++) {
      const e = findEntity(d, toks.slice(from, from + len).join(' '), null, true);
      if (e && e.kind === 'character') { agent = e; used = from + len; }
    }
  }
  const rest = toks.slice(used);
  let verb = null;
  for (const w of rest) { const v = verbForm(w); if (v && !STOP.has(w)) { verb = v.lemma; break; } }
  const objWords = rest.filter((w) => !STOP.has(w) && !(verbForm(w) && verbForm(w).lemma === verb)).map((w) => singular(w));
  return { agent, verb, objWords, rest };
}
const evMatches = (d, ev, q) => {
  if (q.agent && !ev.ag.includes(q.agent.id) && !eventsMention(ev, q.agent.id)) return 0;
  let sc = q.agent ? (ev.ag.includes(q.agent.id) ? 2 : 0.5) : 0;
  if (q.verb) { if (ev.vb === q.verb || verbGroup(q.verb).has(ev.vb)) sc += 3; else return 0; }
  const hay = norm(`${ev.ob?.t ?? ''} ${(ev.pp ?? []).map((p) => `${p.p} ${p.t}`).join(' ')} ${ev.pl?.t ?? ''}`).split(' ').map(singular);
  const hit = q.objWords.filter((w) => hay.includes(w) || (ev.ob?.e && nameOf(d, Array.isArray(ev.ob.e) ? ev.ob.e[0] : ev.ob.e).toLowerCase().includes(w)));
  sc += hit.length * 1.5;
  if (q.objWords.length && !hit.length && !q.verb) return 0;
  return sc;
};
const eventsMention = (ev, id) => [ev.ob, ...(ev.pp ?? [])].some((o) => o && (Array.isArray(o.e) ? o.e.includes(id) : o.e === id));

export function whereDid(ctx, { r: phrase } = {}) {
  const rr = need(ctx); if (rr.env) return rr.env;
  const d = rr.d;
  const q = parseEventQuery(d, phrase);
  if (!q.agent && !q.verb) return notSaid(ctx, d, `The document does not say where that happened.`, closest(d, phrase), null, phrase);
  const hits = d.events.map((v) => ({ v, sc: evMatches(d, v, q) })).filter((h) => h.sc > 0).sort((a, b) => b.sc - a.sc || a.v.s - b.v.s);
  const withPlace = hits.find((h) => h.v.pl);
  if (!hits.length) return notSaid(ctx, d, `The document does not say where that happened.`, closest(d, phrase), q.agent?.id, phrase);
  if (!withPlace) return notSaid(ctx, d, `${cap(evPhrase(d, hits[0].v))}, but the document does not say where.`, [hits[0].v.s], q.agent?.id, phrase, true);
  const v = withPlace.v;
  return answer(ctx, d, `${evPhrase(d, v)}${v.pl && !(v.pp ?? []).some((p) => p.t === v.pl.t) && !(v.ob && v.ob.t === v.pl.t) ? ` ${v.pl.p ?? ''} ${v.pl.t}`.replace(/\s+/g, ' ') : ''}.`, { cite: [v.s], entities: v.ag, last: { op: 'where', entity: v.ag[0] } });
}

export function whenDid(ctx, { r: phrase } = {}) {
  const rr = need(ctx); if (rr.env) return rr.env;
  const d = rr.d;
  const q = parseEventQuery(d, phrase);
  const hits = (q.agent || q.verb) ? d.events.map((v) => ({ v, sc: evMatches(d, v, q) })).filter((h) => h.sc > 0).sort((a, b) => b.sc - a.sc || a.v.s - b.v.s) : [];
  if (!hits.length) {
    const near = closest(d, phrase);
    return notSaid(ctx, d, 'The document does not say when that happened.', near, q.agent?.id, phrase);
  }
  const v = hits[0].v;
  const s = d.sentences[v.s];
  const prev = v.s > 0 ? d.sentences[v.s - 1] : null;
  if (v.wh) return answer(ctx, d, `${cap(v.wh.toLowerCase())}: ${evPhrase(d, v)}.`, { cite: [v.s], entities: v.ag, last: { op: 'when', entity: v.ag[0] } });
  const sec = d.sections[s.sec];
  return answer(ctx, d, `The document gives no exact time. ${evPhrase(d, v)} in section ${s.sec + 1}${sec ? `, "${sec.title}"` : ''}${prev ? `, after: ${quoteOf(d, prev.i, 90)}` : ''}.`, { cite: prev ? [prev.i, v.s] : [v.s], entities: v.ag, last: { op: 'when', entity: v.ag[0] } });
}

// ---- who did something to X -------------------------------------------------------------------------------------------------
const GROUPS = [
  ['help', 'save', 'rescue', 'free', 'protect', 'carry', 'guide', 'assist', 'support', 'feed', 'shelter', 'teach', 'lead', 'show'],
  ['hurt', 'kill', 'attack', 'hit', 'beat', 'burn', 'push', 'bite', 'lock', 'trap', 'catch', 'chase', 'fight', 'steal', 'rob'],
  ['love', 'like', 'adore', 'hug', 'kiss', 'welcome', 'thank', 'marry'],
  ['hate', 'fear', 'curse', 'blame', 'punish'],
  ['eat', 'devour', 'drink', 'swallow'],
  ['find', 'discover', 'meet', 'see', 'notice'],
];
const verbGroup = (v) => new Set(GROUPS.find((g) => g.includes(v)) ?? [v]);
export function whoV(ctx, { v, x } = {}) {
  const r = need(ctx); if (r.env) return r.env;
  const d = r.d;
  const e = findEntity(d, x, ctx);
  if (!e) return NOT_FOUND(d, x);
  const lemma = verbForm(String(v).toLowerCase())?.lemma ?? String(v).toLowerCase();
  // exact verb first, then its group
  const target = (ev) => eventsMention(ev, e.id);
  let evs = d.events.filter((ev) => target(ev) && ev.vb === lemma);
  if (!evs.length) evs = d.events.filter((ev) => target(ev) && verbGroup(lemma).has(ev.vb));
  evs = evs.filter((ev) => !ev.ag.includes(e.id) || ev.recip);
  if (!evs.length) return notSaid(ctx, d, `The document does not say who ${verbForm(lemma)?.kind === 'past' ? v : `${lemma}ed`} ${e.name}.`, mentionSentences(d, e.id).slice(0, 2), e.id);
  const items = evs.slice(0, 5).map((ev) => evPhrase(d, ev));
  return answer(ctx, d, `${items.join('; ')}.`, { cite: evs.slice(0, 5).map((ev) => ev.s), entities: uniq([e.id, ...evs.flatMap((ev) => ev.ag)]), last: { op: 'whoV', entity: e.id } });
}
export function didV(ctx, { x, v } = {}) {
  const r = need(ctx); if (r.env) return r.env;
  const d = r.d;
  const e = findEntity(d, x, ctx);
  if (!e) return NOT_FOUND(d, x);
  const lemma = verbForm(String(v).toLowerCase())?.lemma ?? String(v).toLowerCase();
  let evs = eventsOf(d, e.id).filter((ev) => ev.vb === lemma);
  if (!evs.length) evs = eventsOf(d, e.id).filter((ev) => verbGroup(lemma).has(ev.vb));
  if (!evs.length) return notSaid(ctx, d, `The document does not say that ${e.name} ${lemma}${/e$/.test(lemma) ? 'd' : 'ed'} anyone.`, mentionSentences(d, e.id).slice(0, 2), e.id);
  return answer(ctx, d, `${evs.slice(0, 5).map((ev) => evPhrase(d, ev)).join('; ')}.`, { cite: evs.slice(0, 5).map((ev) => ev.s), entities: uniq([e.id, ...evs.flatMap((ev) => (ev.ob ? [].concat(ev.ob.e ?? []) : []))]), last: { op: 'didV', entity: e.id } });
}

// ---- dialogue --------------------------------------------------------------------------------------------------------
const overlap = (q, t) => { const a = new Set(contentStems(q)), b = new Set(contentStems(t)); if (!a.size) return 0; let n = 0; for (const x of a) if (b.has(x)) n++; return n / a.size; };
export function said(ctx, { q } = {}) {
  const r = need(ctx); if (r.env) return r.env;
  const d = r.d;
  const quote = String(q ?? '').replace(/[“”"]/g, '').trim();
  if (!quote) return no('missing', 'Tell me the words, for example: who said "I do not know how"?');
  const lc = norm(quote);
  let best = null, bestScore = 0;
  for (const dl of d.dialogue) {
    const sc = norm(dl.text).includes(lc) ? 2 : overlap(quote, dl.text);
    if (sc > bestScore) { best = dl; bestScore = sc; }
  }
  if (!best || bestScore < 0.6) {
    const plain = d.sentences.find((s) => norm(s.text).includes(lc));
    if (plain) return answer(ctx, d, `Those words are in the text, but not as speech: ${quoteOf(d, plain.i, 120)}`, { cite: [plain.i], terms: contentStems(quote), last: null });
    return notSaid(ctx, d, `I did not find anyone saying "${snippet(quote, 60)}".`, closest(d, quote), null, quote);
  }
  const who2 = best.sp ? nameOf(d, best.sp) : best.spt ? best.spt : null;
  if (!who2) return answer(ctx, d, `The speaker is not named: "${snippet(best.text, 120)}"`, { cite: [best.s], terms: contentStems(quote), last: null });
  return answer(ctx, d, `${cap(who2)} said: "${snippet(best.text, 140)}"`, { cite: [best.s], entities: best.sp ? [best.sp] : [], terms: contentStems(quote), last: { op: 'who', entity: best.sp ?? undefined } });
}
export function saying(ctx, { x, offset } = {}) {
  const r = need(ctx); if (r.env) return r.env;
  const d = r.d;
  const e = findEntity(d, x, ctx);
  if (!e) return NOT_FOUND(d, x);
  const lines = d.dialogue.filter((dl) => dl.sp === e.id);
  if (!lines.length) return notSaid(ctx, d, `${cap(e.name)} does not say anything in the document.`, mentionSentences(d, e.id).slice(0, 1), e.id);
  const off = Number(offset) || 0;
  const slice = lines.slice(off, off + 4);
  if (!slice.length) return no('missing', `${cap(e.name)} has no more lines.`);
  return answer(ctx, d, `${cap(e.name)} says: ${slice.map((dl) => `"${snippet(dl.text, 90)}"`).join('; ')}.${lines.length > off + slice.length ? ` There are ${lines.length - off - slice.length} more lines.` : ''}`, { cite: slice.map((dl) => dl.s), entities: [e.id], last: { op: 'saying', args: { x: e.name }, offset: off + slice.length, entity: e.id } });
}

// ---- position in the document ------------------------------------------------------------------------------------------
export function part(ctx, { at: w, n, ord } = {}) {
  const r = need(ctx); if (r.env) return r.env;
  const d = r.d;
  const total = d.sentences.length;
  if (!total) return no('missing', 'The document is empty.');
  let label, from, to, cite;
  if (n !== undefined || ord) {
    let idx = n !== undefined && n !== '' ? Number(n) : ORDINALS[String(ord).toLowerCase()];
    if (idx === -1) idx = d.sections.length;
    if (!d.sections[idx - 1]) return no('missing', `"${d.title}" has only ${d.sections.length} ${d.sections.length === 1 ? 'section' : 'sections'}.`);
    [from, to] = sectionRange(d, idx - 1); label = `In ${secLabel(d, idx - 1)}: `;
    cite = summarize(d, { k: 3, from, to });
  } else if (w === 'end') {
    [from, to] = d.sections.length > 1 ? sectionRange(d, d.sections.length - 1) : [Math.max(0, total - 6), total - 1];
    const body = bodyOf(d, from, to);
    const lastTwo = body.slice(-2).map((s) => s.i);
    cite = uniq([...summarize(d, { k: 1, from, to }), ...lastTwo]).sort((a, b) => a - b);
    label = 'At the end: ';
  } else if (w === 'middle') {
    const mid = Math.floor(d.sections.length / 2);
    [from, to] = d.sections.length > 2 ? sectionRange(d, mid) : [Math.floor(total / 3), Math.floor((2 * total) / 3)];
    cite = summarize(d, { k: 3, from, to }); label = d.sections.length > 2 ? `In the middle, ${secLabel(d, mid)}: ` : 'In the middle: ';
  } else {
    [from, to] = d.sections.length > 1 ? sectionRange(d, 0) : [0, Math.min(total - 1, 7)];
    cite = uniq([from, ...summarize(d, { k: 2, from, to })]).sort((a, b) => a - b);
    label = 'At the beginning: ';
  }
  return answer(ctx, d, `${label}${cite.map((i) => d.sentences[i].text).join(' ')}`, { cite, last: { op: 'part' } });
}

export function sentence(ctx, { n } = {}) {
  const r = need(ctx); if (r.env) return r.env;
  const d = r.d;
  const i = Number(n) - 1;
  if (!d.sentences[i]) return no('missing', `"${d.title}" has ${d.sentences.length} sentences; there is no sentence ${n}.`);
  const s = d.sentences[i];
  return answer(ctx, d, `Sentence ${i + 1}, in section ${s.sec + 1} ("${d.sections[s.sec]?.title ?? ''}"): ${s.text}`, { cite: [i], note: false, last: null });
}

// ---- counting and searching ---------------------------------------------------------------------------------------------------
export function count(ctx, { x } = {}) {
  const r = need(ctx); if (r.env) return r.env;
  const d = r.d;
  const e = findEntity(d, x, ctx);
  if (e) {
    const sents = mentionSentences(d, e.id);
    return answer(ctx, d, `${cap(e.name)} ${e.plural ? 'are' : 'is'} mentioned ${e.n} ${e.n === 1 ? 'time' : 'times'}, in ${sents.length} ${sents.length === 1 ? 'sentence' : 'sentences'}.`, { cite: sents, entities: [e.id], last: { op: 'who', entity: e.id }, note: false });
  }
  const term = norm(x).replace(/^the word\s+/, '');
  const stems = contentStems(term);
  if (!stems.length) return NOT_FOUND(d, x);
  let n = 0; const sents = [];
  for (const s of d.sentences) {
    const hits = words(s.text).filter((w) => stems.includes(stem(w))).length;
    if (hits) { n += hits; sents.push(s.i); }
  }
  if (!n) return no('missing', `The word "${snippet(term, 40)}" does not appear in "${d.title}".`);
  return answer(ctx, d, `The word "${term}" appears ${n} ${n === 1 ? 'time' : 'times'} in ${sents.length} ${sents.length === 1 ? 'sentence' : 'sentences'}.`, { cite: sents, terms: stems, last: null, note: false });
}

function closest(d, q, limit = 3) {
  const res = bm25Search(bm(d), q, { limit });
  return res.hits.map((h) => h.i);
}
/** An honest "the document does not say" with the closest sentences (highlighted in the tab). */
function notSaid(ctx, d, text, near = [], entity = null, query = '', soft = false) {
  const cite = uniq(near).slice(0, 3);
  const body = cite.length ? `${text} ${soft ? 'This sentence is closest' : 'The closest sentences are'}: ${cite.map((i) => quoteOf(d, i, 110)).join(' ')}` : `${text} Nothing in "${d.title}" is close to it.`;
  const s = st(ctx);
  ensureWires(ctx, d);
  s.focus = { doc: d.id, sentences: cite, entities: entity ? [entity] : [], terms: query ? contentStems(query) : [], n: (s.focus?.n ?? 0) + 1 };
  s.last = null;
  show(ctx);
  return { status: 'missing', note: `${body}${cite.length ? ` ${citeText(cite)}` : ''}`, from: fromOf(d, cite), data: { doc: d.id, cite } };
}

export function search(ctx, { q } = {}) {
  const r = need(ctx); if (r.env) return r.env;
  const d = r.d;
  const query = String(q ?? '').replace(/[“”"]/g, '').trim();
  if (!query) { ctx.state.awaiting = 'search'; return no('missing', 'What should I look for? For example: find "witch".'); }
  ctx.state.awaiting = null; ctx.state.ctx = 'result';
  const res = bm25Search(bm(d), query, { limit: 60 });
  const lc = norm(query);
  // an exact phrase that occurs in the text goes first
  if (lc.split(' ').length > 1) {
    const exact = d.sentences.filter((s) => norm(s.text).includes(lc)).map((s) => s.i);
    if (exact.length) res.hits = [...exact.map((i) => res.all.find((h) => h.i === i) ?? { i, score: 99, terms: res.query }), ...res.hits.filter((h) => !exact.includes(h.i))];
  }
  const hits = res.hits.map((h) => h.i);
  const s = st(ctx);
  if (!hits.length) {
    s.search = { doc: d.id, query, terms: res.query, hits: [], pos: 0 };
    return notSaid(ctx, d, `I found nothing for "${snippet(query, 50)}" in "${d.title}".`, [], null, query);
  }
  s.search = { doc: d.id, query, terms: res.query, hits, pos: 0 };
  const top = hits.slice(0, 5);
  const lines = top.map((i, k) => `${k + 1}. sentence ${i + 1}: ${snippet(d.sentences[i].text, 100)}`);
  return answer(ctx, d, `${hits.length} ${hits.length === 1 ? 'result' : 'results'} for "${snippet(query, 40)}": ${lines.join(' | ').replace(/[.]+$/, '')}${hits.length > 5 ? ` (and ${hits.length - 5} more; say "next result")` : ''}.`, { cite: hits.slice(0, 40), terms: res.query, note: false, last: { op: 'search' }, emphasis: hits[0], data: { total: hits.length } });
}
export function searchStep(ctx, { dir, at } = {}) {
  const s = st(ctx);
  const d = current(ctx);
  if (!d) return no('missing', EMPTY);
  const se = s.search;
  if (!se || se.doc !== d.id || !se.hits.length) return no('missing', 'There is no search yet. Say, for example: find "witch".');
  ctx.state.ctx = 'result';
  const n = se.hits.length;
  if (at !== undefined) se.pos = Math.max(0, Math.min(n - 1, Number(at) - 1));
  else if (dir === 'first') se.pos = 0;
  else if (dir === 'last') se.pos = n - 1;
  else if (dir === 'prev') se.pos = (se.pos - 1 + n) % n;
  else se.pos = (se.pos + 1) % n;
  const i = se.hits[se.pos];
  return answer(ctx, d, `Result ${se.pos + 1} of ${n} for "${snippet(se.query, 40)}": ${d.sentences[i].text}`, { cite: se.hits.slice(0, 40), terms: se.terms, note: false, last: { op: 'search' }, emphasis: i, data: { total: n, pos: se.pos } }).value
    ? { ...ok(`Result ${se.pos + 1} of ${n} for "${snippet(se.query, 40)}": ${d.sentences[i].text} (sentence ${i + 1}, section ${d.sentences[i].sec + 1})`, { from: fromOf(d, [i]), data: { doc: d.id, cite: [i], pos: se.pos, total: n } }) }
    : no('error', 'search failed');
}

/**
 * "the last one", "the one before that", "the second one": the thing last shown decides what is meant, a search result or a section
 * (`state.ctx`, set by the search and section operations).
 */
export function pick(ctx, { ord, rel } = {}) {
  const s = st(ctx);
  const O = ORDINALS[String(ord ?? '').toLowerCase()];
  if (s.ctx === 'result' && s.search?.hits?.length) {
    if (O === -1) return searchStep(ctx, { dir: 'last' });
    if (O) return searchStep(ctx, { at: O });
    return searchStep(ctx, { dir: rel === 'prev' ? 'prev' : 'next' });
  }
  return summary(ctx, { ord, rel });
}

export function clearSearch(ctx) {
  const s = st(ctx);
  s.search = null;
  s.focus = { doc: s.active, sentences: [], entities: [], terms: [], n: (s.focus?.n ?? 0) + 1 };
  s.last = null;
  return ok('OK, the highlights are cleared.');
}

export function across(ctx, { q } = {}) {
  const s = st(ctx);
  if (!s.docs.length) return no('missing', EMPTY);
  const query = String(q ?? '').replace(/[“”"]/g, '').trim();
  const stems = contentStems(query);
  if (!stems.length) return no('missing', 'What should I look for in the documents?');
  const rows = [];
  for (const d of s.docs) {
    const e = findEntity(d, query);
    const res = bm25Search(bm(d), query, { limit: 3 });
    const mentions = e ? e.n : res.all.length;
    const ex = res.hits.filter((h) => h.terms.length >= Math.min(stems.length, 2) || !res.hits.length);
    if (e || ex.length) rows.push({ d, n: mentions, top: e ? mentionSentences(d, e.id)[0] : res.hits[0]?.i, score: res.hits[0]?.score ?? 0 });
  }
  if (!rows.length) return no('missing', `None of the ${s.docs.length} ${s.docs.length === 1 ? 'document mentions' : 'documents mentions'} "${snippet(query, 40)}".`.replace('documents mentions', 'documents mention'));
  rows.sort((a, b) => b.n - a.n || b.score - a.score);
  const text = `${rows.length === 1 ? 'Only' : ''} ${joinAnd(rows.map((r) => `"${r.d.title}" (${r.n} ${r.n === 1 ? 'hit' : 'hits'})`))} ${rows.length === 1 ? 'mentions' : 'mention'} "${snippet(query, 40)}".`.trim();
  const best = rows[0];
  s.active = best.d.id;
  return answer(ctx, best.d, `${cap(text)} Opened "${best.d.title}".`, { cite: best.top !== undefined ? [best.top] : [], terms: stems, last: null });
}

// ---- relations -----------------------------------------------------------------------------------------------------------
export function relation(ctx, { x, r: rel } = {}) {
  const rr = need(ctx); if (rr.env) return rr.env;
  const d = rr.d;
  const e = findEntity(d, x, ctx);
  if (!e) return NOT_FOUND(d, x);
  const rw = singular(String(rel).toLowerCase());
  const k = kinOfDoc(d, e.id, rw);
  if (k) {
    const rel0 = k.r;
    const other = d.entities.find((z) => z.id === k.e);
    return answer(ctx, d, `${other?.name ?? nameOf(d, k.e)} is ${e.name === cap(e.name) ? `${e.name}'s` : `${e.name}'s`} ${rw}.`, { cite: [rel0.s], entities: [e.id, k.e], last: { op: 'who', entity: k.e } });
  }
  // a role entity of the same kind that the text links to this character ("their father")
  const roleE = d.entities.find((z) => z.role === rw && z.id !== e.id);
  if (roleE && (e.plural || (e.role && !KIN.has(e.role)) || e.kind === 'character') && d.sentences.some((s, i) => false)) return null;
  const near = d.attrs.filter((a) => a.e === (roleE?.id ?? '') && new RegExp(`\\b${rw}\\b`).test(a.text)).map((a) => a.s);
  return notSaid(ctx, d, `The document does not say who ${e.name}'s ${rw} is.`, near.length ? near.slice(0, 2) : mentionSentences(d, e.id).slice(0, 2), e.id);
}
export function isRelated(ctx, { x, y } = {}) {
  const rr = need(ctx); if (rr.env) return rr.env;
  const d = rr.d;
  const a = findEntity(d, x, ctx), b = findEntity(d, y, ctx);
  if (!a || !b) return NOT_FOUND(d, !a ? x : y);
  const rel = d.relations.find((q) => (q.a === a.id && q.b === b.id) || (q.a === b.id && q.b === a.id));
  if (!rel) return notSaid(ctx, d, `The document does not say how ${a.name} and ${b.name} are related.`, uniq([a.first, b.first]).filter((i) => i !== undefined), a.id);
  return answer(ctx, d, `${nameOf(d, rel.b)} is ${nameOf(d, rel.a)}'s ${rel.rel}.`, { cite: [rel.s], entities: [a.id, b.id], last: { op: 'who', entity: a.id } });
}

// ---- reading aloud --------------------------------------------------------------------------------------------------------
export function read(ctx, { u, n, ord, all, rel } = {}) {
  const r = need(ctx); if (r.env) return r.env;
  const d = r.d;
  const unit = singular(String(rel ? 'section' : u ?? 'document').toLowerCase());
  let idx = n !== undefined && n !== '' ? Number(n) : ord ? ORDINALS[String(ord).toLowerCase()] : null;
  if (rel) { const x = relativeSection(ctx, d, rel); if (x.env) return x.env; idx = x.idx; }
  if (unit === 'section' || unit === 'chapter' || unit === 'heading') { const i = idx === -1 ? d.sections.length : idx; if (i && d.sections[i - 1]) { ctx.state.section = i; ctx.state.sectionDoc = d.id; ctx.state.ctx = 'section'; } }
  let from, to, label;
  if (all === 'true' || (!u && idx === null)) { from = 0; to = d.sentences.length - 1; label = `Reading "${d.title}"`; }
  else if (unit === 'section' || unit === 'chapter' || unit === 'heading') {
    if (idx === -1) idx = d.sections.length;
    if (idx === null && u && !all) return { status: 'missing', note: `Which section should I read? "${d.title}" has ${d.sections.length}: ${d.sections.map((x, i) => `${i + 1} ${x.title}`).join(', ')}.`, pending: { key: 'n', type: 'number' } };
    if (!idx || !d.sections[idx - 1]) return no('missing', `"${d.title}" has only ${d.sections.length} ${d.sections.length === 1 ? 'section' : 'sections'}.`);
    [from, to] = sectionRange(d, idx - 1); label = `Reading ${secLabel(d, idx - 1)}`;
  } else if (unit === 'paragraph') {
    if (idx === -1) idx = d.paras.length;
    const p = d.paras[(idx ?? 1) - 1];
    if (!p) return no('missing', `"${d.title}" has only ${d.paras.length} paragraphs.`);
    from = p.first; to = p.last; label = `Reading paragraph ${idx}`;
  } else if (unit === 'sentence' || unit === 'line') {
    if (idx === -1) idx = d.sentences.length;
    if (!d.sentences[(idx ?? 1) - 1]) return no('missing', `"${d.title}" has only ${d.sentences.length} sentences.`);
    from = to = idx - 1; label = `Reading sentence ${idx}`;
  } else if (unit === 'beginning' || unit === 'start') { [from, to] = d.sections.length > 1 ? sectionRange(d, 0) : [0, Math.min(d.sentences.length - 1, 7)]; label = 'Reading the beginning'; }
  else if (unit === 'ending' || unit === 'end') { [from, to] = d.sections.length > 1 ? sectionRange(d, d.sections.length - 1) : [Math.max(0, d.sentences.length - 6), d.sentences.length - 1]; label = 'Reading the ending'; }
  else { from = 0; to = d.sentences.length - 1; label = `Reading "${d.title}"`; }
  const sents = bodyOf(d, from, to);
  let text = sents.map((s) => s.text).join(' ');
  if (text.length > 6000) text = `${text.slice(0, 6000).replace(/\s+\S*$/, '')}.`;
  ctx.effect('speech.say', { text });
  const cite = sents.map((s) => s.i);
  const res = answer(ctx, d, `${label} (${sents.length} ${sents.length === 1 ? 'sentence' : 'sentences'}).`, { cite, note: false, last: null });
  return res;
}

// ---- several documents -------------------------------------------------------------------------------------------------------
const GENERIC_DOC = new Set(['document', 'documents', 'file', 'files', 'story', 'stories', 'text', 'texts', 'book', 'books', 'one', 'doc', 'docs', 'tale', 'the', 'a', 'an', 'my', 'this', 'that', 'other', 'another', 'next', 'previous']);
const pickDoc = (s, phrase) => {
  const p = norm(phrase);
  if (!p) return { many: s.docs };
  const toks = p.split(' ').filter((w) => !['the', 'a', 'an', 'my', 'this', 'that'].includes(w));
  const num = toks.find((w) => /^\d+$/.test(w));
  const ordw = toks.find((w) => ORDINALS[w] !== undefined);
  if (num && s.docs[Number(num) - 1]) return { doc: s.docs[Number(num) - 1] };
  if (ordw && (toks.every((w) => GENERIC_DOC.has(w) || w === ordw))) { const i = ORDINALS[ordw] === -1 ? s.docs.length - 1 : ORDINALS[ordw] - 1; if (s.docs[i]) return { doc: s.docs[i] }; }
  if (toks.includes('next') || toks.includes('previous')) {
    const at = s.docs.findIndex((d) => d.id === s.active);
    const i = toks.includes('next') ? (at + 1) % s.docs.length : (at - 1 + s.docs.length) % s.docs.length;
    return { doc: s.docs[i] };
  }
  const key = toks.filter((w) => !GENERIC_DOC.has(w) || toks.length === 1);
  const scored = s.docs.map((d) => {
    const hay = norm(`${d.title} ${d.name ?? ''} ${(d.tags ?? []).join(' ')} ${d.format}`).split(/[ .]+/);
    const hayText = norm(`${d.title} ${d.name ?? ''} ${(d.tags ?? []).join(' ')}`);
    let sc = 0;
    for (const w of key) { if (hay.includes(w) || hay.includes(singular(w))) sc += 2; else if (hayText.includes(w)) sc += 1; }
    if (key.join(' ') && hayText.includes(key.join(' '))) sc += 3;
    return { d, sc };
  }).filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc);
  if (!scored.length) return { none: true };
  if (scored.length > 1 && scored[0].sc === scored[1].sc && scored[0].d.title !== scored[1].d.title) return { many: scored.filter((x) => x.sc === scored[0].sc).map((x) => x.d) };
  return { doc: scored[0].d };
}
export function list(ctx) {
  const s = st(ctx);
  if (!s.docs.length) return no('missing', EMPTY);
  const rows = s.docs.map((d, i) => `${i + 1}. "${d.title}" (${d.words} words, ${d.sections.length} ${d.sections.length === 1 ? 'section' : 'sections'}${d.origin === 'sample' ? ', sample' : ''})${d.id === s.active ? ' [open]' : ''}`);
  show(ctx);
  return ok(`You have ${s.docs.length} ${s.docs.length === 1 ? 'document' : 'documents'}: ${rows.join('; ')}.`, { data: { count: s.docs.length } });
}
export function open(ctx, { t } = {}) {
  const s = st(ctx);
  if (!s.docs.length) return no('missing', EMPTY);
  const p = pickDoc(s, t);
  if (p.none) return no('missing', `I have no document called "${snippet(String(t), 40)}". You have ${joinAnd(s.docs.map((d) => `"${d.title}"`))}.`);
  if (p.many) return no('ambiguous', `Which one do you mean: ${joinAnd(p.many.map((d) => `"${d.title}"`))}?`);
  s.active = p.doc.id;
  s.search = null;
  s.last = null;
  s.focus = { doc: p.doc.id, sentences: [], entities: [], terms: [], n: (s.focus?.n ?? 0) + 1 };
  show(ctx);
  ensureWires(ctx, p.doc);
  return ok(`OK, "${p.doc.title}" is open: ${p.doc.words} words in ${p.doc.sections.length} ${p.doc.sections.length === 1 ? 'section' : 'sections'}.`, { data: { doc: p.doc.id } });
}
export function close(ctx, { t } = {}) {
  const s = st(ctx);
  if (!s.docs.length) return no('missing', EMPTY);
  let target = s.docs.find((d) => d.id === s.active);
  if (t && norm(t) && !GENERIC_DOC.has(norm(t))) { const p = pickDoc(s, t); if (p.doc) target = p.doc; else if (p.many) return no('ambiguous', `Which one do you mean: ${joinAnd(p.many.map((d) => `"${d.title}"`))}?`); else return no('missing', `I have no document called "${snippet(String(t), 40)}".`); }
  if (!target) return no('missing', EMPTY);
  s.docs = s.docs.filter((d) => d.id !== target.id);
  s.wired = s.wired.filter((id) => id !== target.id);
  if (s.active === target.id) s.active = s.docs[0]?.id ?? null;
  s.search = null; s.last = null;
  s.focus = { doc: s.active, sentences: [], entities: [], terms: [], n: (s.focus?.n ?? 0) + 1 };
  return ok(`OK, I closed "${target.title}".${s.docs.length ? ` "${current(ctx).title}" is open now.` : ' There are no documents left.'}`);
}
export function loadSample(ctx) {
  const s = st(ctx);
  let d = s.docs.find((x) => x.origin === 'sample');
  if (!d) { d = sampleDocument(); s.docs.push(d); }
  s.active = d.id; s.search = null; s.last = null;
  s.focus = { doc: d.id, sentences: [], entities: [], terms: [], n: (s.focus?.n ?? 0) + 1 };
  show(ctx);
  ensureWires(ctx, d);
  return ok(`OK, the sample "${d.title}" is open: ${d.words} words in ${d.sections.length} sections. Ask me about it.`, { data: { doc: d.id } });
}

// ---- follow-up and fallback ---------------------------------------------------------------------------------------------------------
export function more(ctx) {
  const s = st(ctx);
  const l = s.last;
  if (!l || !l.op) return no('missing', 'Ask me a question first, then say "tell me more".');
  if (l.op === 'did') return did(ctx, { ...l.args, offset: l.offset });
  if (l.op === 'saying') return saying(ctx, { ...l.args, offset: l.offset });
  if (l.op === 'summary') {
    const d = current(ctx); if (!d) return no('missing', EMPTY);
    const idx = l.args?.n; const [from, to] = idx ? sectionRange(d, idx - 1) : [0, d.sentences.length - 1];
    const cite = summarize(d, { k: 3, from, to, skip: l.offset });
    if (!cite.length) return no('missing', 'There is nothing more to add to the summary.');
    return answer(ctx, d, `Also: ${cite.map((i) => d.sentences[i].text).join(' ')}`, { cite, last: { op: 'summary', args: l.args, offset: l.offset + 3 } });
  }
  if (l.op === 'search') return searchStep(ctx, { dir: 'next' });
  if (l.entity) return did(ctx, { x: l.entity.replace(/^e\./, '').replace(/_/g, ' ') });
  return no('missing', 'I have nothing more to add. Try another question.');
}

const Q_STOP = new Set(['what', 'who', 'where', 'when', 'why', 'how', 'which', 'whose', 'whom', 'did', 'does', 'do', 'is', 'was', 'are', 'were', 'can', 'could', 'has', 'have', 'had', 'tell', 'me', 'about', 'the', 'story', 'file', 'text', 'document', 'happen', 'happens', 'happened']);
export function ask(ctx, { q } = {}) {
  const rr = need(ctx); if (rr.env) return rr.env;
  const d = rr.d;
  const text = String(q ?? '');
  const ents = [];
  const ws = words(text).filter((w) => !Q_STOP.has(w));
  const e = findEntity(d, ws.join(' '), ctx) ?? ws.map((w) => findEntity(d, w)).find(Boolean);
  const res = bm25Search(bm(d), ws.join(' ') || text, { limit: 3 });
  const want = new Set(contentStems(ws.join(' ')));
  const top = res.hits[0];
  const coverage = top && want.size ? top.terms.length / want.size : 0;
  if (e) ents.push(e.id);
  if (top && coverage >= 0.75 && top.terms.length >= 2) {
    return answer(ctx, d, `The document does not state that as a fact, but this passage is relevant: ${quoteOf(d, top.i, 200)}`, { cite: [top.i, ...res.hits.slice(1, 3).map((h) => h.i)], entities: ents, terms: res.query, last: null });
  }
  const near = res.hits.map((h) => h.i);
  if (!near.length && e) near.push(...mentionSentences(d, e.id).slice(0, 2));
  return notSaid(ctx, d, 'The document does not say that.', near, e?.id ?? null, ws.join(' '));
}


// ---- free questions, only while the Documents tab is visible -------------------------------------------------------------
// The wildcard questions ("who is <anyone>", "what did <anyone> do", "where did ...", "find <anything>", "why ...") cannot be patterns:
// off the Documents tab they would take sentences of other worlds. The tab sets `visible`/`inputMode` (any answer of this world sets
// them too), and interceptInput (spec 07 section 2) handles a sentence only if it names a known entity or word of the open document.
// Everything else (and every sentence while the tab is hidden) goes on to the formalizer untouched.
const KIN_RE = [...KIN].join('|');
const VERBS_Q = 'help|helped|save|saved|rescue|rescued|free|freed|carry|carried|love|loved|hate|hated|kill|killed|eat|ate|lead|led|follow|followed|push|pushed|lock|locked|burn|burned|catch|caught|find|found|meet|met|hug|hugged|guide|guided|protect|protected|feed|fed|teach|taught|visit|visited|invite|invited|marry|married|thank|thanked|warn|warned|trap|trapped|chase|chased|attack|attacked|hit|bite|bit|beat|punish|punished|leave|left|take|took|bring|brought|send|sent|welcome|welcomed|blame|blamed|fear|feared|kiss|kissed';
const SAY_RE = 'said|says|asked|replied|cried|whispered|shouted|exclaimed|answered|ordered|called';
const known = (d, x) => { const e = findEntity(d, x, null, true); return e && e.kind !== undefined ? e : null; };
const hasEntity = (d, text) => { const ws = norm(text).split(' '); for (let n = Math.min(4, ws.length); n >= 1; n--) for (let i = 0; i + n <= ws.length; i++) { const e = known(d, ws.slice(i, i + n).join(' ')); if (e && !STOP.has(ws.slice(i, i + n).join(' '))) return e; } return null; };
const reply = (r) => ({ handled: true, reply: r.value ?? r.note ?? '' });

const STRUCTURED_Q = /(?:^(?:what|how) (?:is|was|are|were) .+ like$)|\brole\b|\bfate\b|\bend(?:s|ed)? up\b|\bfinally\b|\beventually\b|\bmentions? of\b|\bwhich (?:doc|document|file|story|text|book|paper)\b|\b(?:appear|appears|come up|comes up|show up|shows up)$|^who (?:the )?.+ (?:is|are|was|were)$|^where (?:the )?.+ (?:lives|stays|goes)$|\bhow many times\b|\bhow often\b/;

export function interceptInput(ctx, text) {
  const s = st(ctx);
  const d = current(ctx);
  if (!d || !s.visible) { if (!s.visible) s.inputMode = null; return { handled: false }; }
  let t = norm(String(text).replace(/[“”]/g, '"')).replace(/\s+/g, ' ');
  const raw = String(text).trim().replace(/[?.!]+$/, '').replace(/^(?:please,? )/i, '');
  t = ctx.lang.stripLead(t).trim();   // asking words (please, can you, tell me ...) from lang.common
  let m;
  if (/^(?:tell me more|more|go on|continue|keep going|what else|anything else|show more|and what else)$/.test(t) && s.last?.op) return reply(more(ctx));
  if ((m = t.match(/^who (?:is|was|are|were) (.+?)(?: in (?:the )?(?:story|file|text|document|book|tale))?$/))) {
    const rk = m[1].match(new RegExp(`^(.+?)'? ?s? (${KIN_RE})$`)) ?? m[1].match(new RegExp(`^(.+?) (${KIN_RE})$`));
    const rk2 = m[1].match(new RegExp(`^the (${KIN_RE}) of (.+)$`));
    if (rk2 && known(d, rk2[2])) return reply(relation(ctx, { x: rk2[2], r: rk2[1] }));
    if (rk && known(d, rk[1])) return reply(relation(ctx, { x: rk[1], r: rk[2] }));
    const e = known(d, m[1]);
    if (e) return reply(who(ctx, { x: m[1] }));
    if (PRONOUNS[m[1]] && lastEntityOf(ctx, d, '')) return reply(who(ctx, { x: m[1] }));
    return { handled: false };
  }
  if ((m = t.match(/^(?:about|tell me about|what do you know about|describe) (.+)$/)) && known(d, m[1])) return reply(who(ctx, { x: m[1] }));
  if ((m = t.match(/^what (?:did|does|do|has|have) (.+?) (?:do|done)(?: .*)?$/)) && (known(d, m[1]) || (PRONOUNS[m[1]] && lastEntityOf(ctx, d, '')))) return reply(did(ctx, { x: m[1] }));
  if ((m = t.match(/^what (?:did|does|do) (.+?) (?:say|ask|reply|answer|cry|shout|whisper|exclaim)$/)) && known(d, m[1])) return reply(saying(ctx, { x: m[1] }));
  if ((m = t.match(/^what (?:happens|happened) to (.+)$/)) && known(d, m[1])) return reply(happened(ctx, { x: m[1] }));
  if ((m = t.match(/^what (?:became of|is the fate of|was the fate of) (.+)$/)) && known(d, m[1])) return reply(happened(ctx, { x: m[1] }));
  if ((m = t.match(/^where (?:does|did|do) (.+?) (live|stay|dwell|reside|sleep)$/)) && (known(d, m[1]) || (PRONOUNS[m[1]] && findEntity(d, m[1], ctx)))) return reply(where(ctx, { x: m[1], mode: 'live' }));
  if ((m = t.match(/^where (?:does|did|do) (.+?) (?:go|travel|walk|run|come|head|end up)$/)) && known(d, m[1])) return reply(where(ctx, { x: m[1], mode: 'go' }));
  if ((m = t.match(/^where (?:is|was|are|were) (.+)$/)) && known(d, m[1])) return reply(where(ctx, { x: m[1], mode: 'be' }));
  if ((m = t.match(/^where (?:did|does|do) (.+)$/)) && parseEventQuery(d, m[1]).agent) return reply(whereDid(ctx, { r: m[1] }));
  if ((m = t.match(/^when (?:did|does|do|was|were) (.+)$/)) && parseEventQuery(d, m[1]).agent) return reply(whenDid(ctx, { r: m[1] }));
  if ((m = t.match(new RegExp(`^who (${VERBS_Q}) (.+)$`))) && known(d, m[2])) return reply(whoV(ctx, { v: m[1], x: m[2] }));
  if ((m = t.match(new RegExp(`^(?:who|whom) (?:did|does) (.+?) (${VERBS_Q})$`))) && known(d, m[1])) return reply(didV(ctx, { x: m[1], v: m[2] }));
  if ((m = raw.match(new RegExp(`^who (?:${SAY_RE}) (.+)$`, 'i')))) {
    const q = m[1].replace(/[“”"]/g, '').trim();
    const hit = d.dialogue.some((dl) => norm(dl.text).includes(norm(q)) || overlap(q, dl.text) >= 0.6);
    if (hit) return reply(said(ctx, { q }));
    return { handled: false };
  }
  if ((m = t.match(/^how (?:many times|often) (?:is|was|are|were|does|do|did) (?:the word )?(.+?)(?: (?:mentioned|named|said|used|appear|appears|occur|occurs|come up|show up|get mentioned))?$/))) {
    if (known(d, m[1])) return reply(count(ctx, { x: m[1] }));
    const st2 = contentStems(m[1]);
    if (st2.length && d.sentences.some((x) => words(x.text).some((w) => st2.includes(stem(w))))) return reply(count(ctx, { x: m[1] }));
    return { handled: false };
  }
  if (/^(?:find|search|look for|search for|look up|find me)(?: (?:it|something|a word|something else|that|a term|a name))?$/.test(t)) return reply(search(ctx, { q: '' }));
  if (s.awaiting === 'search' && t.split(' ').length <= 4 && !/^(?:what|who|where|when|why|how|which)\b/.test(t)) { const q = t.replace(/^(?:the word |the name |the )/, ''); s.awaiting = null; return reply(search(ctx, { q })); }
  // "no, I meant oven" / "no, search for oven instead" right after a search replaces the query
  if (s.ctx === 'result' && s.search && (m = t.match(/^(?:no|nope|wait|sorry|actually|oops|hmm)[ ,]+(?:i meant|i mean|i said|search for|look for|find|try|rather|make it|use)?\s*(?:the word )?(.+?)(?: instead| please)?$/)) && m[1].split(' ').length <= 3 && bm25Search(bm(d), m[1], { limit: 1 }).hits.length) return reply(search(ctx, { q: m[1] }));
  if ((m = t.match(/^(?:and |now |ok |okay |then )*(?:find|search for|look for|locate|highlight|where is) (.+?)(?: mentioned)?$/))) {
    const q = m[1].replace(/ (?:instead|please|pls|now|again|too|also)$/, '').replace(/^(?:the word |the words |all the |all )/, '').replace(/ in (?:the |this |that |my )?(?:story|file|text|document|book|tale|article|essay)$/, '');
    if (bm25Search(bm(d), q, { limit: 1 }).hits.length) return reply(search(ctx, { q }));
    return { handled: false };
  }
  if ((m = t.match(/^how (?:are|is) (.+?) and (.+?) related$/)) && known(d, m[1]) && known(d, m[2])) return reply(isRelated(ctx, { x: m[1], y: m[2] }));
  // any other question that names a known entity: the closest passage or an honest "the document does not say"
  // shapes the pattern file reads itself (rule sweep): left to the formalizer, not to the passage fallback
  if (STRUCTURED_Q.test(t)) return { handled: false };
  if (/^(?:what|who|whom|whose|where|when|why|how|which|did|does|do|is|was|are|were|can|could|has|have|had)\b/.test(t) && !/\b(?:documents|files|stories|texts|books)\b/.test(t) && hasEntity(d, t)) return reply(ask(ctx, { q: raw }));
  return { handled: false };
}
export const stemWord = stem;
