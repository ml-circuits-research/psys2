// SPDX-License-Identifier: AGPL-3.0-only
// docs.reader (spec 21): the hooks of the schema world. The acts (make, remove, change, pick, ask, send) are read by the generated grammar and the frames of `acts.reader`; what an act DOES is the reader
// engine of read.mjs (the formal document, entities, events, search, the answers, reading aloud with the speech effect). The roles of an act are mapped onto the engine's operations here: the thing role
// is a phrase about the text ("section 2", "the ending", "Hansel's sister", "the witch"), read by `target` into the engine's own arguments. Nothing here names a verb.
import * as R from './read.mjs?v=b8202c3b86';
import { ORDINALS, KIN, singular, cap } from './lang.mjs?v=afa9ef7a36';
import { en } from '../../lib/lang/en.mjs?v=061a6ba9b3';
const numerals = en.numerals('acts');

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
const no = (note, status = 'unsupported') => ({ status, note });
const ok = (value) => ({ status: 'supported', value });
const words = (t) => String(t ?? '').toLowerCase().replace(/[“”"«»]/g, '').replace(/[’]/g, "'").split(/[^a-z0-9']+/).filter(Boolean);
const st = (ctx) => { const s = ctx.state; s.speed ??= 1; s.voice ??= 'default'; s.bookmarks ??= []; s.notes ??= []; s.asked ??= []; return s; };
const doc = (ctx) => R.docOfState(ctx.state);
const KIN_RE = [...KIN].join('|');

// ---- what a phrase about the text points at ----------------------------------------------------------------------------------------------------------
const SECTION = /^(?:sections?|chapters?|headings?|parts?)$/, PARA = /^(?:paragraphs?|paras?)$/, SENT = /^(?:sentences?|lines?)$/, DOC = /^(?:stor(?:y|ies)|tales?|documents?|docs?|files?|books?|texts?|articles?|essays?|papers?|fairy|narrative|it|this|that|one)$/;
const BEGIN = /^(?:beginning|start|opening|intro|introduction)$/, END = /^(?:ending|end|conclusion|finish|close)$/, MIDDLE = /^(?:middle|centre|center)$/;
const SKIP = new Set(['the', 'a', 'an', 'my', 'this', 'that', 'me', 'us', 'to', 'aloud', 'out', 'loud', 'please', 'pls', 'of', 'in', 'for', 'number', 'no', 'num', 'nr', 'from', 'on', 'at']);
/** { unit: section|paragraph|sentence|beginning|ending|middle|document|result, n, ord, rel, all } from the words of a thing phrase. */
export function target(text) {
  const t = { unit: null, n: undefined, ord: undefined, rel: undefined, all: false };
  let dem = false;
  for (const w of words(text)) {
    if (w === 'that' || w === 'this' || w === 'current' || w === 'same') dem = true;
    if (SKIP.has(w)) continue;
    if (/^\d+$/.test(w)) { t.n ??= w; continue; }
    if (/^(?:one|ones)$/.test(w)) { t.all = true; continue; }
    if (numerals[w] != null && t.n === undefined) { t.n = String(numerals[w]); continue; }
    if (ORDINALS[w] !== undefined) { t.ord ??= w; continue; }
    if (w === 'next' || w === 'previous' || w === 'prev' || w === 'following' || w === 'preceding') { t.rel ??= w === 'next' || w === 'following' ? 'next' : 'prev'; continue; }
    if (SECTION.test(w)) { t.unit ??= 'section'; continue; }
    if (PARA.test(w)) { t.unit ??= 'paragraph'; continue; }
    if (SENT.test(w)) { t.unit ??= 'sentence'; continue; }
    if (BEGIN.test(w)) { t.unit ??= 'beginning'; continue; }
    if (END.test(w)) { t.unit ??= 'ending'; continue; }
    if (MIDDLE.test(w)) { t.unit ??= 'middle'; continue; }
    if (/^(?:results?|matches|match|hits?)$/.test(w)) { t.unit ??= 'result'; continue; }
    if (DOC.test(w)) { t.all = true; continue; }
    if (w === 'current' || w === 'same') continue;
    t.other = true;
  }
  if (dem && t.unit === 'section' && t.n === undefined && !t.ord && !t.rel) t.rel = 'same';
  return t;
}
/** "that section": the determiner was read by the frame, so the demonstrative is looked for in the words of the sentence. */
const withDem = (t, r) => { if (!t.unit && /\b(?:that|this)\s+one\b/i.test(String(r?.text ?? ''))) { t.unit = 'section'; t.all = false; } if (t.unit === 'section' && t.n === undefined && !t.ord && !t.rel && /\b(?:that|this|current|same)\s+(?:section|chapter|part|heading|one)\b/i.test(String(r?.text ?? ''))) t.rel = 'same'; return t; };
const readArgs = (t) => ({ ...(t.unit && !['result', 'document'].includes(t.unit) ? { u: t.unit } : {}), ...(t.n !== undefined ? { n: t.n } : {}), ...(t.ord ? { ord: t.ord } : {}), ...(t.rel ? { rel: t.rel } : {}), ...(t.all && !t.unit ? { all: 'true' } : {}) });

// ---- the attributes of the reading (speed, voice) ---------------------------------------------------------------------------------------------------
const SPEEDS = { slow: 0.75, normal: 1, default: 1, usual: 1, fast: 1.5, quick: 1.5, double: 2, twice: 2, half: 0.5, fastest: 2, slowest: 0.5 };
function setSpeed(ctx, r) {
  const s = st(ctx), sch = globalThis.__readerSchema, a = { min: 0.5, max: 2 };
  const cmp = r.mode === 'more' || r.mode === 'less';
  const amt = String(r.amount ?? r.amount2 ?? '').toLowerCase();
  const step = /^(?:a_bit|a_little|slightly|bit|little)$/.test(amt.replace(/\s+/g, '_')) ? 0.1 : /^(?:much|a_lot|lot|way|even)$/.test(amt) ? 0.5 : 0.25;
  const v = r.value == null ? '' : String(r.value).toLowerCase().trim();
  let to;
  if (cmp) to = s.speed + (r.mode === 'less' ? -step : step);
  else if (/^\d+(?:\.\d+)?$/.test(v)) to = Number(v) > 5 ? Number(v) / 100 : Number(v);
  else if (SPEEDS[v] !== undefined) to = SPEEDS[v];
  else return no(`How fast should I read? Say for example "read slower", "read faster" or "read at speed 1.5" (from ${a.min} to ${a.max}).`, 'missing');
  to = Math.round(Math.max(a.min, Math.min(a.max, to)) * 100) / 100;
  if (to === s.speed) return ok(cmp ? `I already read as ${r.mode === 'less' ? 'slowly' : 'fast'} as I can: speed ${to}.` : `The reading speed is already ${to}.`);
  s.speed = to;
  return ok(`OK, I will read at speed ${to}${to === 1 ? ' (normal)' : to < 1 ? ' (slower)' : ' (faster)'}.`);
}
const VOICES = ['default', 'female', 'male', 'deep', 'high', 'child'];
function setVoice(ctx, r) {
  const s = st(ctx);
  const v = words(r.value).filter((w) => !['voice', 'a', 'the', 'an', 'your', 'tone', 'narrator'].includes(w))[0];
  const aliases = { woman: 'female', lady: 'female', girl: 'female', man: 'male', boy: 'male', low: 'deep', bass: 'deep', squeaky: 'high', kid: 'child', childlike: 'child', normal: 'default', usual: 'default', original: 'default' };
  const name = aliases[v] ?? v;
  if (!VOICES.includes(name)) return no(`I can read with a ${VOICES.join(', ')} voice.`, 'missing');
  if (s.voice === name) return ok(`I already read with the ${name} voice.`);
  s.voice = name;
  return ok(`OK, I will read with the ${name} voice.`);
}

// ---- bookmarks and notes -------------------------------------------------------------------------------------------------------------------------------
function where(ctx, d, t) {
  const s = st(ctx);
  if (t?.unit === 'sentence' && t.n) { const i = Number(t.n) - 1; return d.sentences[i] ? { sentence: i, label: `sentence ${t.n}` } : { error: `"${d.title}" has only ${d.sentences.length} sentences.` }; }
  if (t?.unit === 'section' && (t.n || t.ord)) { const n = t.ord ? (ORDINALS[t.ord] === -1 ? d.sections.length : ORDINALS[t.ord]) : Number(t.n); const sec = d.sections[n - 1]; return sec ? { sentence: sec.first, label: `section ${n}, "${sec.title}"` } : { error: `"${d.title}" has only ${d.sections.length} ${d.sections.length === 1 ? 'section' : 'sections'}.` }; }
  if (s.focus?.doc === d.id && s.focus.sentences?.length) { const i = s.focus.sentences[0]; return { sentence: i, label: `sentence ${i + 1}` }; }
  if (s.sectionDoc === d.id && Number.isInteger(s.section) && d.sections[s.section - 1]) return { sentence: d.sections[s.section - 1].first, label: `section ${s.section}, "${d.sections[s.section - 1].title}"` };
  return { sentence: 0, label: 'the beginning' };
}
function makeBookmark(ctx, t) {
  const d = doc(ctx); if (!d) return no('There is no document open to bookmark. Say "load the sample".', 'missing');
  const w = where(ctx, d, t); if (w.error) return no(w.error, 'missing');
  const s = st(ctx);
  const n = Math.max(0, ...s.bookmarks.map((b) => b.n)) + 1;
  s.bookmarks.push({ n, doc: d.id, sentence: w.sentence, label: w.label });
  return ok(`OK, bookmark ${n} is at ${w.label} of "${d.title}". You have ${s.bookmarks.length} ${s.bookmarks.length === 1 ? 'bookmark' : 'bookmarks'}.`);
}
function makeNote(ctx, text) {
  const d = doc(ctx); if (!d) return no('There is no document open to annotate. Say "load the sample".', 'missing');
  const body = String(text ?? '').replace(/^["“]|["”]$/g, '').trim();
  if (!body) return no('What should the note say? For example "add a note saying the witch is cruel".', 'missing');
  const s = st(ctx), w = where(ctx, d, null);
  const n = Math.max(0, ...s.notes.map((x) => x.n)) + 1;
  s.notes.push({ n, doc: d.id, sentence: w.sentence, label: w.label, text: body });
  return ok(`OK, note ${n} at ${w.label}: "${body}".`);
}
function listMarks(ctx, kind) {
  const s = st(ctx), d = doc(ctx);
  const items = (kind === 'bookmark' ? s.bookmarks : s.notes).filter((x) => !d || x.doc === d.id);
  if (!items.length) return ok(`You have no ${kind}s${d ? ` in "${d.title}"` : ''} yet.`);
  return ok(`Your ${kind}s: ${items.map((x) => (kind === 'bookmark' ? `${x.n}. ${x.label}` : `${x.n}. ${x.label}: "${x.text}"`)).join('; ')}.`);
}
function removeMark(ctx, kind, text) {
  const s = st(ctx), key = kind === 'bookmark' ? 'bookmarks' : 'notes';
  const list = s[key];
  if (!list.length) return no(`You have no ${kind}s.`, 'missing');
  const w = words(text);
  if (w.includes('all') || w.includes('every') || /^(?:bookmarks|notes|markers|comments)$/.test(w.at(-1) ?? '') && !w.some((x) => /^\d+$/.test(x))) { const n = list.length; s[key] = []; return ok(`OK, I removed ${n === 1 ? `the ${kind}` : `all ${n} ${kind}s`}.`); }
  const num = w.find((x) => /^\d+$/.test(x)), ord = w.find((x) => ORDINALS[x] !== undefined);
  let i = list.length - 1;
  if (num) i = list.findIndex((x) => x.n === Number(num)); else if (ord) i = ORDINALS[ord] === -1 ? list.length - 1 : ORDINALS[ord] - 1;
  if (i < 0 || !list[i]) return no(`There is no ${kind} ${num ?? ord}.`, 'missing');
  const [gone] = list.splice(i, 1);
  return ok(`OK, I removed ${kind} ${gone.n} (${gone.label}).`);
}
const markKind = (text) => { const w = words(text); return w.some((x) => /^(?:bookmarks?|markers?)$/.test(x)) ? 'bookmark' : w.some((x) => /^(?:notes?|comments?|annotations?|remarks?)$/.test(x)) ? 'note' : null; };

// ---- topics: what a list question is about (the engine's own overviews) -----------------------------------------------------------------------------------
const TOPICS = [
  [/\b(?:main|lead|leading|central|principal|chief)\b.*\b(?:characters?|people|persons?|hero|heroine|protagonist)\b|\b(?:hero|heroine|protagonist)\b/, (ctx) => R.mainCharacter(ctx)],
  [/\b(?:characters?|people|persons?|cast|heroes|protagonists)\b/, (ctx) => R.characters(ctx)],
  [/\b(?:places?|locations?|towns?|cities|villages?|settings?)\b/, (ctx) => R.places(ctx, {})],
  [/\b(?:objects?|things|items)\b/, (ctx) => R.places(ctx, { kind: 'things' })],
  [/\b(?:key ?words?|keywords?|themes?|topics?|top words|common words|frequent words|main words)\b/, (ctx) => R.keywords(ctx)],
  [/\b(?:outline|headings?|contents|structure|chapter titles|section titles|titles|sections|chapters)\b/, (ctx) => R.outline(ctx)],
  [/\b(?:documents|files|docs)\b/, (ctx) => R.list(ctx)],
];
const topicOf = (text) => { const t = words(text).join(' '); const m = TOPICS.find(([re]) => re.test(t)); return m ? m[1] : null; };

// ---- questions -------------------------------------------------------------------------------------------------------------------------------------------------
const stripDoc = (t) => String(t ?? '').replace(/\s+(?:in|inside|from)\s+(?:here|there|it|this|that)\s*$/i, '').replace(/\s+(?:in|of|from|about|for|within|inside)\s+(?:the|this|that|my)?\s*(?:stor(?:y|ies)|files?|texts?|documents?|books?|tales?|articles?|essays?)\s*$/i, '').replace(/\s+according to .*$/i, '').trim();
function whoIs(ctx, thing) {
  const tp = topicOf(thing); if (tp && !R.knownEntity(ctx.state, stripDoc(thing))) return tp(ctx);
  const x = stripDoc(thing).replace(/^(?:the\s+)?(?:word|name)\s+/i, '');
  const rk = x.match(new RegExp(`^(.+?)'? ?s? (${KIN_RE})$`)) ?? x.match(new RegExp(`^(.+?) (${KIN_RE})$`));
  const rk2 = x.match(new RegExp(`^the (${KIN_RE}) of (.+)$`));
  if (rk2) return R.relation(ctx, { x: rk2[2], r: rk2[1] });
  if (rk && R.knownEntity(ctx.state, rk[1])) return R.relation(ctx, { x: rk[1], r: rk[2] });
  return R.who(ctx, { x });
}
function describeThing(ctx, thing) {
  const t = target(thing);
  if (t.unit === 'section' && (t.n || t.ord || t.rel)) return R.summary(ctx, { n: t.n, ord: t.ord, rel: t.rel });
  if (t.all && !t.other && !t.unit) return R.describe(ctx);
  const x = stripDoc(thing);
  if (R.knownEntity(ctx.state, x)) return R.who(ctx, { x });
  return R.ask(ctx, { q: thing });
}
function countOf(ctx, thing, place, text) {
  const ws = words(thing);
  if (/\bhow many (?:times|mentions)\b/i.test(String(text ?? '')) || /^(?:times|mentions)\b/i.test(thing.trim())) { const x = stripDoc(thing).replace(/^(?:times|mentions)\b\s*/i, '').replace(/\s+(?:is|are|was|were|does|do|did)\b.*$/i, '') || stripDoc(place ?? ''); return R.count(ctx, { x }); }
  if (/^(?:times|mentions|occurrences|appearances)$/.test(ws[0] ?? '')) { const x = stripDoc(ws.slice(1).join(' ').replace(/\s+(?:is|are|was|were|does|do|did)\b.*$/, '')) || stripDoc(place ?? ''); return R.count(ctx, { x }); }
  const u = ws.map((w) => singular(w)).find((w) => /^(?:sentence|word|paragraph|section|chapter|heading|character|line|part)$/.test(w));
  if (u) { const t = target(place ?? ''), unit = /^(?:chapter|heading|part)$/.test(u) ? 'section' : u; const same = /\b(?:in|of|for)\s+(?:that|this|the same|the current)\b/i.test(`${place ?? ''} ${text ?? ''}`) && !t.unit && !t.n; return R.stats(ctx, { u: unit, ...(t.n !== undefined ? { n: t.n } : same ? { n: '0' } : {}) }); }
  return R.stats(ctx, {});
}
const attrOf = (r) => { const a = String(r.attribute ?? '').toLowerCase(); return { name: 'title', writer: 'author', writers: 'author', pace: 'speed', reading_speed: 'speed', reading_pace: 'speed', narrator: 'voice', reader_voice: 'voice', place: 'position', spot: 'position', heading: 'title' }[a] ?? a; };
function authorOf(d) {
  if (d.author) return d.author;
  const m = String(d.source ?? d.text ?? d.sentences?.slice(0, 3).map((x) => x.text).join(' ') ?? '').match(/\b(?:written|collected|retold|told|created|composed)\s+by\s+(?:the\s+)?([A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,3})/) ?? String(d.source ?? d.text ?? d.sentences?.slice(0, 3).map((x) => x.text).join(' ') ?? '').match(/\bby\s+(?:the\s+)?([A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*){0,3})/);
  return m ? m[1] : null;
}
function askAttribute(ctx, r, a) {
  const d = doc(ctx), s = st(ctx);
  if (a === 'speed') return ok(`I read at speed ${s.speed}${s.speed === 1 ? ' (normal)' : ''}.`);
  if (a === 'voice') return ok(`I read with the ${s.voice} voice.`);
  if (!d) return no('There is no document open. Say "load the sample".', 'missing');
  if (a === 'title') return ok(`The document is called "${d.title}".`);
  if (a === 'author') { const w = authorOf(d); return w ? ok(`"${d.title}" was written by ${w}.`) : no(`"${d.title}" does not say who wrote it.`, 'missing'); }
  if (a === 'position') {
    const w = where(ctx, d, null);
    return ok(`You are at ${w.label} of "${d.title}".`);
  }
  return undefined;
}
const asked = (ctx) => { const s = st(ctx); return s.asked.length ? ok(`You asked ${s.asked.length} ${s.asked.length === 1 ? 'question' : 'questions'}: ${s.asked.slice(-5).map((q) => `"${q}"`).join('; ')}.`) : ok('You have not asked me anything about the story yet.'); };

const domain = {
  pick: (ctx, r) => {
    const t = withDem(target([r.thing, r.amount].filter(Boolean).join(' ')), r);
    const thing = String(r.thing ?? '');
    switch (r.mode) {
      case 'none': return R.clearSearch(ctx);
      case 'sample': return R.loadSample(ctx);
      case 'open': { const called = thing.match(/\b(?:called|named|titled)\s+(.+)$/i); if (called) return R.open(ctx, { t: called[1] }); const x = thing.replace(/\s+(?:stor(?:y|ies)|tales?|documents?|docs?|files?|books?|texts?)\s*$/i, '').replace(/^(?:the|my|this|that)\s+/i, '').trim(); return R.open(ctx, { t: x || thing }); }
      case 'read': {
        if (!thing.trim()) return R.read(ctx, { all: 'true' });
        if (t.unit === 'result') return R.searchStep(ctx, { dir: 'next' });
        return R.read(ctx, readArgs(t));
      }
      case 'goto': {
        if (t.unit === 'result') return R.searchStep(ctx, { dir: t.ord === 'last' ? 'last' : t.ord ? undefined : 'next', ...(t.ord && t.ord !== 'last' ? { at: ORDINALS[t.ord] } : {}) });
        if (t.unit === 'sentence' && t.n) return R.sentence(ctx, { n: t.n });
        if (t.unit === 'section' || t.unit === 'paragraph' || t.unit === 'beginning' || t.unit === 'ending') return R.read(ctx, readArgs(t));
        if (!t.unit && (t.ord || t.rel)) return R.pick(ctx, { ord: t.ord, rel: t.rel });
        return R.open(ctx, { t: thing });
      }
      case 'next': case 'prev': {
        if (t.unit === 'result') return R.searchStep(ctx, { dir: r.mode });
        if (/^(?:file|files|document|documents|doc|docs|book|books)$/.test(words(thing).at(-1) ?? '')) return R.open(ctx, { t: `${r.mode === 'next' ? 'next' : 'previous'} file` });
        if (!thing.trim() && st(ctx).ctx !== 'section') return R.searchStep(ctx, { dir: r.mode });
        return R.pick(ctx, { rel: r.mode });
      }
      default: {
        // a number or an ordinal said for a thing: "section 1", "the first paragraph", "the last one"
        const ord = r.amount && ORDINALS[String(r.amount).toLowerCase()] !== undefined ? String(r.amount).toLowerCase() : t.ord;
        const n = t.n ?? (r.amount && /^\d+$/.test(String(r.amount)) ? String(r.amount) : undefined);
        if (t.unit === 'sentence' && n) return R.sentence(ctx, { n });
        if (t.unit === 'paragraph') return R.read(ctx, { u: 'paragraph', ...(n ? { n } : {}), ...(ord ? { ord } : {}) });
        if (t.unit === 'page') return no('A document has sections, not pages.');
        if (t.unit === 'section' || !t.unit) return R.pick(ctx, ord ? { ord } : n ? { ord: Object.keys(ORDINALS).find((k) => ORDINALS[k] === Number(n)) } : { rel: t.rel });
        return R.pick(ctx, { ord });
      }
    }
  },
  ask: (ctx, r) => {
    if (['why', 'last'].includes(r.mode)) return undefined;
    const thing = String(r.thing ?? '');
    const a = attrOf(r);
    if (/^(?:speed|voice|title|author|position)$/.test(a)) return askAttribute(ctx, r, a);
    const k = markKind(thing);
    if (k && ['what', 'describe', 'options', 'state', 'count', undefined].includes(r.mode)) return listMarks(ctx, k);
    if (/^(?:questions?|queries)$/.test(words(thing).at(-1) ?? '')) return asked(ctx);
    // the engine's own reading of a question about the text (who did what to whom, where, when, how many times, find ...): the same one the open tab uses
    if (r.mode === 'part') { const t = withDem(target(thing), r); const at = t.unit === 'ending' ? 'end' : t.unit === 'beginning' ? 'beginning' : t.unit === 'middle' ? 'middle' : null; return t.unit === 'section' && (t.n || t.ord) ? R.part(ctx, { n: t.n, ord: t.ord }) : at ? R.part(ctx, { at }) : R.part(ctx, { at: /\b(?:first|begin|start|open|intro)/i.test(r.text) ? 'beginning' : /\b(?:last|end|finish|conclu|clos)/i.test(r.text) ? 'end' : 'middle' }); }
    if (r.mode === 'across') return R.across(ctx, { q: stripDoc(thing).replace(/^(?:the\s+)?(?:words?|names?)\s+/i, '') });
    if (r.mode === 'related') return R.isRelated(ctx, { x: thing, y: r.place });
    if (r.mode === 'count' && (/^(?:times|mentions)\b/i.test(thing.trim()) || /\bhow many (?:times|mentions)\b/i.test(String(r.text ?? '')))) return countOf(ctx, thing, r.place, r.text);
    if (r.mode === 'did') return /\b(?:say|says|said|ask|asks|reply|replies|answer|answers|cry|cries|shout|shouts|whisper|whispers|exclaim|exclaims)\s*$/i.test(String(r.text ?? '')) ? R.saying(ctx, { x: stripDoc(thing) }) : R.did(ctx, { x: stripDoc(thing) });
    if (r.mode === 'happened') return R.happened(ctx, { x: stripDoc(thing) });
    if (r.mode === 'where' && /\b(?:find|look(?:ing)? for|search|locate|spot)\b/i.test(String(r.text ?? ''))) return R.search(ctx, { q: stripDoc(thing).replace(/^(?:the\s+)?(?:words?|names?)\s+/i, '') });
    if (r.mode === 'where') { const x = stripDoc(thing).replace(/\s+(?:is|are|was|were)$/i, '').replace(/^(?:the\s+)?word\s+/i, ''); if (R.knownEntity(ctx.state, x)) return R.where(ctx, { x, mode: /\b(?:live|lives|stay|stays|dwell|reside|sleep)\b/i.test(r.text) ? 'live' : /\b(?:go|goes|went|travel|walk|run|come|head|end up)\b/i.test(r.text) ? 'go' : 'be' }); }
    if (['who', 'where', 'count', 'exists', 'what', 'describe', 'when'].includes(r.mode) && !(r.mode === 'count' && target(thing).unit)) { const f = R.askFree(ctx, r.text); if (f.handled) return f.env; }
    const topic = ['options', 'describe', 'what', 'state', 'count', undefined].includes(r.mode) ? topicOf(`${thing} ${r.mode === 'count' ? '' : r.text}`) : null;
    if (topic && r.mode !== 'count') return topic(ctx);
    switch (r.mode) {
      case 'summary': {
        const t = withDem(target(thing), r), kk = String(thing).match(/\bin (\w+) (?:sentences?|lines?)\b/i);
        const ks = kk ? (numerals[kk[1].toLowerCase()] ?? Number(kk[1])) : undefined;
        if (t.unit === 'beginning' || t.unit === 'ending' || t.unit === 'middle') return R.part(ctx, { at: t.unit === 'ending' ? 'end' : t.unit === 'beginning' ? 'beginning' : 'middle' });
        if (t.unit === 'section' || t.rel) return R.summary(ctx, { n: t.n, ord: t.ord, rel: t.rel, k: ks });
        return R.summary(ctx, { k: ks });
      }
      case 'did': return R.did(ctx, { x: stripDoc(thing) });
      case 'happened': return R.happened(ctx, { x: stripDoc(thing) });
      case 'when': return R.whenDid(ctx, { r: thing });
      case 'who': { const wd = R.whoDid(ctx.state, r.text); if (wd) return R.didV(ctx, wd); return whoIs(ctx, thing); }
      case 'where': return R.where(ctx, { x: stripDoc(thing).replace(/^(?:the\s+)?word\s+/i, ''), mode: 'be' });
      case 'count': return countOf(ctx, thing, r.place, r.text);
      case 'length': { const u = words(thing).map(singular).find((w) => /^(?:word|sentence|paragraph|section|chapter|line)$/.test(w)) ?? words(r.text).map(singular).find((w) => w === 'word'); return R.stats(ctx, u ? { u } : {}); }
      case 'find': return R.search(ctx, { q: stripDoc(thing).replace(/^(?:the\s+)?(?:words?|names?)\s+/i, '').replace(/^["“]|["”]$/g, '') });
      case 'exists': return R.ask(ctx, { q: thing });
      case 'describe': return describeThing(ctx, thing);
      case 'what': return describeThing(ctx, thing);
      default: return describeThing(ctx, thing);
    }
  },
  change: (ctx, r) => {
    const a = attrOf(r);
    const cmpName = r.mode === 'more' || r.mode === 'less' ? (/^(?:faster|quicker|slower)$/i.test(String(r.value ?? '')) || !r.value ? 'speed' : null) : null;
    const name = a || cmpName || (words(`${r.thing ?? ''} ${r.value ?? ''}`).some((w) => /^(?:speed|pace|faster|slower)$/.test(w)) ? 'speed' : null);
    if (name === 'speed') return setSpeed(ctx, r);
    if (name === 'voice') return setVoice(ctx, r);
    if (name === 'title' || r.mode === 'name') {
      const d = doc(ctx); if (!d) return no('There is no document open. Say "load the sample".', 'missing');
      const v = String(r.value ?? '').trim(); if (!v) return no('What should the title be?', 'missing');
      d.title = v; return ok(`OK, the document is now called "${v}".`);
    }
    if (name === 'author') { const d = doc(ctx); if (!d) return no('There is no document open.', 'missing'); d.author = String(r.value ?? '').trim(); return ok(`OK, the author of "${d.title}" is ${d.author}.`); }
    if (name === 'position') { const t = target(`section ${r.value ?? ''}`); return R.read(ctx, readArgs(t)); }
    return no('I can change the reading speed and the voice, or the title and author of a document. For example "read slower" or "use a deep voice".', 'missing');
  },
  make: (ctx, r) => {
    const thing = String(r.thing ?? ''), val = r.value == null ? '' : String(r.value);
    if (r.mode === 'note') return makeNote(ctx, val);
    if (r.mode === 'bookmark') return makeBookmark(ctx, target(thing));
    const k = markKind(thing);
    if (k === 'bookmark') return makeBookmark(ctx, target(val || thing));
    if (k === 'note') return makeNote(ctx, val);
    if (/^(?:characters?|people|persons?|heroes|hero)$/.test(words(thing).at(-1) ?? '') && val) { const e = R.knownEntity(ctx.state, val); return e ? R.who(ctx, { x: val }) : makeNote(ctx, `${cap(val)} is a character`); }
    return no('I can add a bookmark or a note to a document. To add a document, drop a .md, .txt, .pdf or .docx file on the Documents tab.', 'missing');
  },
  remove: (ctx, r) => {
    const thing = String(r.thing ?? '');
    if (r.mode === 'close') return R.close(ctx, { t: thing.replace(/^(?:the|my|this|that)\s+/i, '').replace(/\s+(?:stor(?:y|ies)|tales?|documents?|docs?|files?|books?|texts?)\s*$/i, '') });
    const k = markKind(thing);
    if (k) return removeMark(ctx, k, thing);
    if (/\b(?:highlights?|highlighting|search|marks)\b/i.test(thing)) return R.clearSearch(ctx);
    return R.close(ctx, { t: thing.replace(/^(?:the|my|this|that)\s+/i, '') });
  },
  send: (ctx, r) => ctx.request('things.show', { thing: r.thing, to: r.place }),
};

// ---- DECLINE (spec 21) -----------------------------------------------------------------------------------------------------------------------------------
const DOCNOUN = /\b(?:stor(?:y|ies)|tales?|files?|documents?|docs?|books?|articles?|essays?|sections?|chapters?|paragraphs?|characters?|bookmarks?|notes?)\b/i;
const STORYNOUN = /\b(?:stor(?:y|ies)|tales?|files?|documents?|docs?|books?|articles?|essays?|reader|documents tab)\b/i;
/** A sentence is the reader's when its tab is open and the words are of the text, when it names a story, a file or a section, or when it asks about a character of the open document while the tab is showing. */
function accepts({ action, mode, roles = {}, state, tab, text }) {
  const act = String(action ?? '').split('.').pop();
  if (!Object.hasOwn(domain, act)) return true;   // the operations that are not acts (who did what, where did it happen, a count of a name, a search step ...) are read by patterns that name the reader's own frames
  const on = tab === 'docs.reader';
  const said = [roles.thing, roles.place].filter(Boolean).join(' ').trim();
  const whole = `${said} ${text ?? ''}`;
  const noun = STORYNOUN.test(whole) || DOCNOUN.test(said);
  const visible = true;   // a question that names a character of the open document is the reader's on any tab (the old cast lexicon did the same); the entity check below is the guard
  const t = target(said);
  const hasDoc = state?.docs === undefined || state?.docs === null || state.docs.length > 0;   // a world nothing was said to yet starts with the sample
  if (mode === 'why' || mode === 'last') return false;   // a question about why belongs to the dialogue module ("why did you do that"); the reader answers the why of a story only through its own interceptor
  if (/\btabs?\b/i.test(String(text ?? ''))) return false;   // "open the documents tab" is the shell's
  switch (act) {
    case 'pick':
      if (mode === 'sample') return on || noun || /\bsample\b/i.test(text ?? '');
      if (mode === 'none') return on || /\b(?:highlight|highlights|highlighting|search|marks|results)\b/i.test(String(text ?? '')) && hasDoc;
      if (mode === 'open') return !!R.docNamed(state, said) && (noun || on) || (t.other && /(?:stor(?:y|ies)|tales?|documents?|docs?|files?|books?|texts?)$/i.test(said) && hasDoc);
      if (mode === 'read') return on || t.unit === 'section' || t.unit === 'paragraph' || noun || !said && !!state?.visible;
      if (mode === 'goto') return !t.other && ((on && t.unit != null) || (t.unit === 'section' && !!(t.n || t.ord) && noun)) || (on && !!R.docNamed(state, said));
      if (mode === 'next' || mode === 'prev') return hasDoc && (on || t.unit === 'result');
      return on && hasDoc && (t.unit === 'section' || t.unit === 'paragraph' || t.unit === 'sentence' || !t.unit && !!t.ord);
    case 'ask': {
      if (!hasDoc) return false;
      const a = attrOf(roles);
      if (/^(?:speed|voice|title|author|position)$/.test(a)) return on || STORYNOUN.test(whole) || /\b(?:reading|read)\b/i.test(String(text ?? ''));
      if (markKind(said)) return on || STORYNOUN.test(whole);
      if (/^(?:questions?|queries)$/.test(words(said).at(-1) ?? '')) return on && /\b(?:asked|ask)\b/i.test(text ?? '');
      if (mode === 'summary') return !withDem(t, { text }).other && (on || noun || t.unit === 'section');
      if (mode === 'part') return (on || noun || /\b(?:story|tale|it)\b/i.test(String(text ?? ''))) && (t.unit === 'beginning' || t.unit === 'ending' || t.unit === 'middle' || (t.unit === 'section' && !t.other) || /\b(?:story|tale|it)\b/i.test(said) && /\b(?:begin|start|open|end|finish|conclude|close|unfold|develop)/i.test(String(text ?? '')));
      if (mode === 'across') return hasDoc && /^(?:which|what|in which|in what|is|are|does|do)\b/i.test(String(text ?? '').trim()) && (state.docs.length > 0);
      if (mode === 'related') return visible && !!R.knownEntity(state, said) && !!R.knownEntity(state, roles.place ?? '');
      if (mode === 'did' || mode === 'happened' || mode === 'when') { const x = stripDoc(said); return visible && (!!R.knownEntity(state, x) || (mode === 'when' && R.hasHits(state, x)) || /^(?:he|she|they|it|him|her|them)$/i.test(x)); }
      if (mode === 'who' && R.whoDid(state, text)) return true;
      if (mode === 'who' || mode === 'where') { const x = stripDoc(said).replace(/^(?:the\s+)?word\s+/i, ''); if (mode === 'who' && topicOf(said) && (on || noun)) return true; const rel = x.match(new RegExp(`^(.+?)'? ?s? (?:${KIN_RE})$`)) ?? x.match(new RegExp(`^the (?:${KIN_RE}) of (.+)$`)); return visible && !!(R.knownEntity(state, x) || (rel && R.knownEntity(state, rel[1]))); }
      if (mode === 'count') return (on || noun || /\bhow many (?:times|mentions)\b/i.test(String(text ?? ''))) && (target(said).unit != null || /^(?:times|mentions)\b/.test(said.toLowerCase()) || /\b(?:characters?|words?|sentences?|paragraphs?|sections?)\b/i.test(said) || (/\bhow many (?:times|mentions)\b/i.test(String(text ?? '')) && (!!R.knownEntity(state, stripDoc(said)) || R.hasHits(state, stripDoc(said)))));
      if (mode === 'length') return noun;
      if (mode === 'find') return !/^\s*who\b/i.test(said) && (on || noun || /\bsearch(?:ing)?\b/i.test(String(text ?? ''))) && R.hasHits(state, stripDoc(said).replace(/^(?:the\s+)?(?:words?|names?)\s+/i, ''));
      if (mode === 'exists') return !/^\s*(?:which|what)\b/i.test(String(text ?? '')) && !!(roles.place && /^(?:the |this |that |my )?(?:story|tale|file|document|doc|text|book|article|essay)$/i.test(roles.place.trim()));
      if (mode === 'describe' || mode === 'what' || mode === 'options' || mode === 'state') return (on || noun) && ((t.all && !t.other) || (t.unit === 'section' && !t.other) || !!topicOf(said) || !!R.knownEntity(state, stripDoc(said)));
      return false;
    }
    case 'change': {
      const a = attrOf(roles), cmp = mode === 'more' || mode === 'less';
      const reading = /\b(?:read|reading|narrat\w*)\b/i.test(String(text ?? ''));   // "speak slower" and "use a deep voice" are the shell's speech settings, "read slower" is the reading of a text
      if (a === 'speed' || a === 'voice') return on || reading;
      if (a === 'title' || a === 'author') return on && /\b(?:stor|document|file|book)/i.test(whole);
      if (cmp) return (on || reading) && /\b(?:faster|slower|quicker)\b|\bspeed|\bpace\b/i.test(String(text ?? ''));
      if (mode === 'name') return on && noun;
      return reading && /\bvoice|speed|pace\b/i.test(String(text ?? '')) || (on && /\b(?:voice|narrator)\b/i.test(String(text ?? '')));
    }
    case 'make': return mode === 'note' || mode === 'bookmark' ? on || STORYNOUN.test(whole) || /\bbookmark\b/i.test(text ?? '') && hasDoc : !!markKind(said) && (on || STORYNOUN.test(whole));
    case 'remove': return mode === 'close' ? (on || noun) && hasDoc : !!markKind(said) && (on || STORYNOUN.test(whole)) || on && /\b(?:highlights?|search|documents?|files?|stor(?:y|ies))\b/i.test(said);
    case 'send': return false;   // a thing of the reader is sent through Talk's "send it to X" and session.things
    default: return false;
  }
}
const note = (q) => String(q ?? '').trim();
/** The reader's modal input (the engine's own question reading while the tab is showing) keeps the questions asked, for "what did I ask". */
function intercept(ctx, text) {
  const r = R.interceptInput(ctx, text);
  if (r?.handled && /^\s*(?:what|who|whom|whose|where|when|why|how|which|did|does|do|is|was|are|were|can|could|has|have|had)\b/i.test(String(text))) { const s = st(ctx); s.asked.push(note(text).slice(0, 120)); if (s.asked.length > 20) s.asked.shift(); }
  return r;
}
export const hooks = { domain, accepts, noState: true, intercept };
