// SPDX-License-Identifier: AGPL-3.0-only
// Operations of talk: a chat about things where an answer comes with a small card (spec 18). Browser-safe: the only import is the vendored list of basic drawable things
// (data of art.draw, read as data, no world state is shared).
//
// State (ctx.state): { n, cards, topics, current }
//   cards:  [{ id, kind: drawing | parts | icons | bars | line | how, topic, thing, text, data, how }]   the newest MAX_CARDS (a card of an older turn keeps its sentence only)
//   topics: [{ id, name, parent, say, card, at }]                                                          one node per thing talked about; `parent` is the topic the user came from
//   current: the id of the topic the conversation is on
// The frame of the question decides the card (look, parts, count, compare, order); the things come from the knowledge catalog by lookup (`ctx.knowledge.peek`, filled by
// the host through `openSlots`, spec 17), or from the basic things shipped with the drawing world. No fact: the plain "I don't know that yet" and no card.
// Effect: talk.card { id } asks the Talk tab to show the card inside the answer; chat.suggest { items } shows suggestions as chips.
import { THINGS, THING_WORDS } from '../art.draw/things.catalog.mjs?v=77966d9c42';
import * as space from '../space/space.mjs?v=f98ca4dd42';
import { habitatSentence } from '../../lib/knowledge/commonsense.mjs?v=7fdbc6c294';
import { colourName } from '../../lib/knowledge/values.mjs?v=189c43bb28';   // the one colour reader (k.values)
import * as R from './records.mjs?v=0a501bb260';   // the generic reading of the catalog: records of a thing, what a word means in the schemas, series, counts, sizes (no table of any world)   // the shared layout module: the parts diagram is laid out by it (specs/18)

export const MAX_CARDS = 40;
const MAX_PARTS = 60;
export const NONE = "I don't know that yet.";
export const NO_TOPIC = 'We are not on anything yet. Ask me about something first, for example "What does a lighthouse look like?".';
export const DOMAINS = ['things you can draw', 'their parts', 'how many parts they have', 'which of two things is bigger', 'the order of the months, seasons, days and planets'];
export const OPENING = `I can talk about ${DOMAINS.slice(0, -1).join(', ')} and ${DOMAINS.at(-1)}. Ask me, and I will answer with a sentence and a small picture.`;

export function initialState() { return { n: 0, cards: [], topics: [], current: null, said: {} }; }
const PRON = /^(?:it|this|that|one|them|these|those|its)$/;
const current = (ctx) => { const s = ensure(ctx); return s.topics.find((t) => t.id === s.current)?.name ?? null; };
/** The thing a question is about: its own words, or (a pronoun or nothing) the topic the conversation is on. */
const subj = (ctx, o) => { const w = clean(o); return !w || PRON.test(w) ? current(ctx) : o; };
function ensure(ctx) {
  const s = ctx.state;
  if (!Array.isArray(s.cards)) Object.assign(s, initialState(), { n: Number(s.n) || 0 });
  return s;
}

const ok = (value, extra) => ({ status: 'supported', value, ...extra });
const no = (status, note) => ({ status, note });
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const an = (n) => /^[A-Z]/.test(n) ? n : `${(/^[aeiou]/i.test(n) && !/^(?:uni|use|eu|one)/i.test(n)) || /^(?:hour|honest|heir|honou?r)/i.test(n) ? 'an' : 'a'} ${n}`;
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const clean = (w) => String(w ?? '').toLowerCase().replace(/[^\p{L}\p{N} -]/gu, ' ').replace(/^\s*(?:an?|the|some)\s+/, '').replace(/\s+/g, ' ').trim();
const firstClause = (g) => String(g).split(/;\s*/)[0].replace(/^\([^)]*\)\s*/, '').trim();
const brief = (t, n = 80) => { const c = firstClause(t); if (c.length <= n) return c; const cut = c.slice(0, n).replace(/\s+\S*$/, ''); return `${cut}…`; };
const singular = (w) => (/ies$/.test(w) ? `${w.slice(0, -3)}y` : /(?:ses|xes|ches|shes)$/.test(w) ? w.slice(0, -2) : /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w);

// ---------------------------------------------------------------- ordered series: read from the catalog (k.time months, weekdays, seasons; k.space planets), nothing is built into this tab
const SEQ_SOURCE = 'the ordered lists of the knowledge catalog';
const seriesOf = (ctx) => ctx.knowledge?.peekSeries?.() ?? {};
/** The series a word names ("months", "month", "days", "planet"): [key, series] or null. A word names a series when it is its key, its singular, or the end of its key (days -> weekdays). */
const seqEntry = (ctx, w) => {
  const s = clean(w);
  if (!s) return null;
  const all = Object.entries(seriesOf(ctx));
  return all.find(([k]) => k === s || k === `${singular(s)}s`) ?? all.find(([k]) => s.length > 2 && (k.endsWith(s) || k.endsWith(`${singular(s)}s`))) ?? null;
};
const seqKey = (ctx, w) => seqEntry(ctx, w)?.[0] ?? null;
/** A series with its words. When every item names the same thing it goes around (an `orbits` slot: the planets around the Sun) the order is counted from it ("the third planet from the sun"). */
const seqOf = (ctx, key) => {
  const q = seriesOf(ctx)[key];
  if (!q) return null;
  const anchors = new Set((q.wires ?? []).map((w) => String(w.f.orbits?.[0] ?? '').toLowerCase()));
  const from = anchors.size === 1 && [...anchors][0] ? [...anchors][0] : null;
  return { ...q, items: q.items.map(cap), from, lead: from ? `From the ${from}, the ${key} are` : `The ${key} in order are`, first: from ? `the closest to the ${from}` : 'the first', last: from ? `the farthest from the ${from}` : 'the last' };
};
const noSeries = (ctx) => (offline(ctx) || !ctx.knowledge?.peekSeries?.() ? no('missing', "I can't reach the knowledge about months, days, seasons and planets right now.") : no('missing', NONE));
const SIZE_NAMES = new Set(['tiny', 'small', 'medium', 'large', 'huge']);

// ---------------------------------------------------------------- the knowledge: the catalog by lookup, else the basic things
/** The thing a word names: { name, th (catalog lookup or null), parts (trimmed, may be empty), shards, from } or null when nothing is known. */
export function lookup(ctx, word) {
  const w = clean(word);
  if (!w) return null;
  const th = ctx.knowledge?.peek?.(w) ?? null;
  let parts = th?.objects?.[0]?.parts ?? [], shards = th?.loaded ?? [], from = 'catalog';
  const key = [w, singular(w), w.replace(/ies$/, 'y')].map((x) => THING_WORDS[x]).find((k) => k && THINGS[k]);
  if (!parts.length && key) { parts = THINGS[key]; shards = ['built-in basic things']; from = 'built-in'; }
  if (!th && !parts.length) return null;
  const written = R.first(R.records(th, th?.name).find((x) => x.f.name), 'name');   // the catalog's own spelling of a name (Japan, not japan)
  return { name: /^[A-Z]/.test(written ?? '') ? written : th?.name ?? key ?? singular(w), th, parts: trimParts(parts), shards, from };
}
const trimParts = (parts) => (parts ?? []).slice(0, MAX_PARTS).map((p) => ({
  name: p.name, shape: p.shape, x: p.x, y: p.y, w: p.w, h: p.h, z: p.z, colour: (p.colour ?? ['grey']).slice(0, 2), ...(p.rgb ? { rgb: p.rgb } : {}), ...(p.points ? { points: p.points.slice(0, 40) } : {}),
}));
const partNames = (parts) => {
  const count = new Map();
  for (const p of parts) { const n = String(p.name ?? '').replace(/_/g, ' ').trim(); if (n && !/^part\s?\d+$/.test(n)) count.set(n, (count.get(n) ?? 0) + 1); }
  return [...count].map(([name, n]) => ({ name, n }));
};
const offline = (ctx) => !!ctx.knowledge?.unreachable?.();
const dontKnow = (ctx, what) => (offline(ctx) && !what ? no('missing', "I can't reach the picture catalog right now, so I can only show the basic things.") : no('missing', NONE));

// ---------------------------------------------------------------- cards and topics
function topicFor(ctx, name, hint = {}) {
  const s = ensure(ctx);
  const key = clean(name);
  let t = s.topics.find((x) => clean(x.name) === key);
  if (!t) {
    const cur = s.topics.find((x) => x.id === s.current);
    const lastCard = [...s.cards].reverse().find((c) => c.topic === s.current && c.kind !== 'how');
    // a topic hangs under the one the user came from: a part of the thing just shown, or a thing named inside it
    const fromPart = lastCard?.data?.parts?.some((p) => clean(p.name) === key || singular(clean(p.name)) === singular(key));
    t = { id: `t${s.topics.length + 1}`, name: key, parent: hint.parent ?? (cur && fromPart ? cur.id : null), say: '', card: null, at: s.n };
    s.topics.push(t);
    try { publish(ctx); } catch (e) { if (/Budget|Aborted/.test(e?.name ?? '')) throw e; /* the session store is optional */ }   // a topic is a thing of the session even when the answer has no card
  }
  s.current = t.id;
  return t;
}
function addCard(ctx, topic, card, sentence) {
  const s = ensure(ctx);
  const c = { id: `c${++s.n}`, topic: topic?.id ?? null, text: sentence, ...card };
  s.cards.push(c);
  if (s.cards.length > MAX_CARDS) { const old = s.cards.shift(); if (old) for (const t of s.topics) if (t.card === old.id) t.card = null; }
  if (topic) { if (!topic.say) topic.say = brief(sentence); if (c.kind !== 'how') topic.card = c.id; }
  ctx.effect('talk.card', { id: c.id });
  publish(ctx);
  return c;
}
const sources = (r) => r.shards.map((id) => {
  const kind = /^k\.objects/.test(id) ? 'the picture catalog' : /^k\.words/.test(id) ? 'the word senses' : /^k\.commonsense/.test(id) ? 'the common sense facts' : `the ${String(id).split('/')[0].replace(/^k\./, '')} knowledge`;   // any other world of the catalog is named by its own id
  return { what: kind, part: /^k\.objects/.test(id) ? String(id).split('/').pop() : '' };   // the group of the picture catalog (animals, vehicles) says something to the user; the others do not
});
const uniq = (xs) => xs.filter((x, i) => xs.findIndex((y) => y.what === x.what && y.part === x.part) === i);
const sourceName = (r) => uniq(sources(r));

// ---------------------------------------------------------------- operations
function whatSentence(r, ctx) {
  const name = r.name, th = r.th, sense = th?.senses?.[0], cs = th?.commonsense;
  let t;
  const ownRecs = R.records(th, name).filter((x) => !x.type.startsWith('k.commonsense') && !x.type.startsWith('k.scenes'));
  const own = R.describe(ownRecs, name, an, cap, { lead: !sense });   // a word sense says what the thing is; the facts of its own records follow it
  if (own && !sense) t = own;
  else if (sense) { const g = firstClause(sense.gloss); t = /^(?:a|an|the)\s/i.test(g) ? `${cap(name)} is ${g}.` : `${cap(an(name))}: ${g}.`; }
  else if (cs) t = `${cap(an(name))} is ${cs.size?.[0] && cs.size[0] !== 'medium' ? `${cs.size[0]}, ` : ''}${cs.used_for?.[0] ? `used for ${cs.used_for[0]}` : 'a thing I know'}.`;
  else { const ns = partNames(r.parts).map((p) => (p.n > 1 ? `${p.n} ${p.name}s` : an(p.name))); t = ns.length ? `I know what ${an(name)} looks like. It has ${list(ns.slice(0, 6))}.` : `I know what ${an(name)} looks like.`; }
  if (own && sense) t += ` ${own}`;
  if (cs?.can?.length) t += ` It can ${list(cs.can)}.`;
  if (cs?.cannot?.length) t += ` It cannot ${list(cs.cannot)}.`;
  if (cs?.made_of?.length) t += ` It is made of ${list(cs.made_of)}.`;
  { const where = habitatSentence(ctx?.knowledge, name); if (where) t += ` ${where}`; }   // where it lives: the catalog or what the user taught, one lookup shared with the other views (src/knowledge/commonsense.mjs)
  return t;
}

/** What is X / what does X look like: the sentence and a drawing of X. */
export function look(ctx, { o } = {}) {
  if (/^(?:parts|pieces)$/.test(clean(o)) && current(ctx)) return parts(ctx, { o: current(ctx) });   // "and its parts?" is read as an ellipsis of the last question: the parts of the topic
  const subject = subj(ctx, o);
  if (!subject) return no("missing", NO_TOPIC);
  const r = lookup(ctx, subject);
  if (!r) return dontKnow(ctx, false);
  if (!r.parts.length && !r.th?.senses?.length && !r.th?.commonsense && !R.records(r.th, r.name).length) return dontKnow(ctx, false);   // the word is only the kind of a part of something else (a ball of the snowman): nothing to say about it
  const topic = topicFor(ctx, r.name);
  const text = whatSentence(r, ctx);
  if (!r.parts.length) { topic.say ||= brief(text); return ok(text, { values: [r.name] }); }
  const names = partNames(r.parts);
  addCard(ctx, topic, { kind: 'drawing', thing: r.name, title: cap(r.name), data: { parts: r.parts, names: names.map((p) => p.name) }, how: how(ctx, r, 'what it looks like', `what ${an(r.name)} looks like`, 'a drawing made from the parts of the thing') }, text);
  return ok(text, { values: [r.name] });
}

/** The parts of X (or what X is made of): the sentence and a box diagram. */
export function parts(ctx, { o, made } = {}) {
  const subject = subj(ctx, o);
  if (!subject) return no("missing", NO_TOPIC);
  const r = lookup(ctx, subject);
  if (!r) return dontKnow(ctx, false);
  if (made && !partNames(r.parts).length) {   // what a thing is made of with no named parts: the made-of / comes-from slot of its records, any world
    const hit = R.valuesOf(R.records(r.th, r.name), R.slotsFor(ctx.knowledge?.peekSchema?.(), 'made'));
    if (hit) return ask(ctx, { o: subject, a: 'made' });
  }
  const topic = topicFor(ctx, r.name);
  const ns = partNames(r.parts), cs = r.th?.commonsense;
  const material = made && cs?.made_of?.length ? `${cap(an(r.name))} is made of ${list(cs.made_of)}. ` : '';
  if (!ns.length) {
    const t = material ? `${material.trim()} I do not know its parts yet.` : `I have a picture of ${an(r.name)}, but its parts have no names yet.`;
    return no('missing', t);
  }
  const named = ns.map((p) => (p.n > 1 ? `${p.n} ${p.name}s` : an(p.name)));
  const text = `${material}${cap(an(r.name))} has ${list(named.slice(0, 10))}${ns.length > 10 ? ' and more' : ''}.`;
  addCard(ctx, topic, { kind: 'parts', thing: r.name, title: cap(r.name), data: { items: ns.slice(0, 12), parts: r.parts, layout: layoutParts(ns.slice(0, 12)) }, how: how(ctx, r, 'the parts of a thing', `the parts of ${an(r.name)}`, 'a box for the thing and a box for each named part') }, text);
  return ok(text, { values: ns.map((p) => p.name) });
}

function countOf(ctx, r, p) {
  const sing = singular(clean(p));
  const th = r.th;
  const fact = th ? R.countFrom(th, R.records(th, r.name), p, ctx.knowledge?.peekSchema?.()) : null;
  if (fact) return { n: fact.n, from: 'gloss', about: fact.about };   // a fact of the catalog (a slot of the thing, the count of a part of it): said as a fact, not as a picture
  const conv = unitRatio(ctx, r, p);
  if (conv) return conv;
  if (th && ctx.knowledge?.countOf) { const c = ctx.knowledge.countOf(th, p); if (c) return c; }
  const n = r.parts.filter((x) => x.name === sing || String(x.name).endsWith(`_${sing}`)).length;
  return n ? { n, from: 'parts' } : null;
}
/** How many of a unit are in another ("centimetres in a metre"): both are records with a numeric `factor` of the same `quantity`. */
function unitRatio(ctx, r, p) {
  const other = ctx.knowledge?.peek?.(singular(clean(p)));
  if (!other || !r.th) return null;
  const mine = R.records(r.th, r.name).find((x) => x.f.factor), theirs = R.records(other, other.name).find((x) => x.f.factor);
  if (!mine || !theirs || mine.f.quantity?.[0] !== theirs.f.quantity?.[0]) return null;
  const n = Number(mine.f.factor[0]) / Number(theirs.f.factor[0]);
  return Number.isFinite(n) && n > 0 ? { n: Math.round(n * 1e6) / 1e6, from: 'gloss' } : null;
}
/** How many P does X have: the sentence and that many icons. */
export function count(ctx, { o, p } = {}) {
  const subject = subj(ctx, o);
  if (!subject) return no("missing", NO_TOPIC);
  const r = lookup(ctx, subject);
  if (!r) return dontKnow(ctx, false);
  const topic = topicFor(ctx, r.name);
  const what = clean(p);
  const c = countOf(ctx, r, what);
  if (!c) return no('missing', `I know what ${an(r.name)} is, but not how many ${what} it has.`);
  const text = c.from === 'gloss' ? `${cap(an(r.name))} has ${c.about ? 'about ' : ''}${c.n} ${what}.` : `My picture of ${an(r.name)} has ${c.n} ${what}.`;
  addCard(ctx, topic, { kind: 'icons', thing: r.name, title: `${cap(what)} of ${an(r.name)}`, data: { n: c.n, label: what, from: c.from }, how: how(ctx, r, `how many ${what} ${an(r.name)} has`, `how many ${what} does ${an(r.name)} have`, `${c.n} small icons`, c.from === 'gloss' ? 'the number comes from a word sense' : 'the number is counted in my picture, so it is a picture, not a fact') }, text);
  return ok(text, { values: [c.n] });
}

function measure(ctx, name, p) {
  const r = lookup(ctx, name);
  if (!r) return null;
  if (p) { const c = countOf(ctx, r, p); return c ? { label: cap(r.name), value: c.n, unit: clean(p), from: c.from, r } : { label: cap(r.name), value: null, r }; }
  const m = R.measureOf(R.records(r.th, r.name), ctx.knowledge?.peekSchema?.());
  const proper = /^[A-Z]/.test(R.first(R.records(r.th, r.name)[0], 'name') ?? '');
  return m ? { label: cap(r.name), proper, value: m.value, unit: m.slot === 'size' ? 'size' : m.slot, shown: m.shown, word: m.word, quantity: m.quantity, r } : { label: cap(r.name), value: null, r };
}
/** Which is bigger / which has more P: two bars and a sentence. */
export function compare(ctx, { a, b, p } = {}) {
  const part = p ? clean(p) : '';
  const a0 = clean(a) ? a : current(ctx);
  if (!a0) return no("missing", NO_TOPIC);
  const x = measure(ctx, a0, part), y = measure(ctx, b, part);
  if (!x || !y) return dontKnow(ctx, false);
  if (x.unit !== y.unit && x.value != null && y.value != null) return no('unsupported', `I can compare two things by the same fact, and I know ${x.label.toLowerCase()} by ${x.unit} and ${y.label.toLowerCase()} by ${y.unit}.`);
  if (x.quantity !== y.quantity && x.value != null && y.value != null) return no('unsupported', 'Those are measured in different ways, so I cannot say which is bigger.');
  if (x.value == null || y.value == null) {
    const miss = x.value == null ? x : y;
    return no('missing', part ? `I know ${an(miss.label.toLowerCase())}, but not how many ${part} it has.` : `I know ${an(miss.label.toLowerCase())}, but not how big it is.`);
  }
  const topics = [x, y].map((m) => topicFor(ctx, m.label));
  const big = x.value >= y.value ? x : y, small = big === x ? y : x;
  const nm = (m) => (m.proper ? m.label : an(m.label.toLowerCase()));
  let text;
  if (x.value === y.value) text = part ? `${cap(nm(x))} and ${nm(y)} have the same number of ${part}: ${x.value}.` : `${cap(nm(x))} and ${nm(y)} are the same size.`;
  else if (!part && x.shown) text = `${cap(nm(big))} is bigger than ${nm(small)}: ${big.shown} against ${small.shown}.`;
  else if (part) text = `${cap(nm(big))} has more ${part} than ${nm(small)}: ${big.value} against ${small.value}${[x, y].some((m) => m.from === 'parts') ? ' (counted in my pictures)' : ''}.`;
  else text = `${cap(nm(big))} is bigger than ${nm(small)}.`;
  const unit = part ? part : x.unit === 'size' ? 'size class (small to huge)' : x.unit;
  const hw = { frame: part ? 'which of two things has more of a part' : 'which of two things is bigger', words: `${x.label} or ${y.label}`, things: [x.label, y.label], sources: uniq([x.r, y.r].filter(Boolean).flatMap(sourceName)), card: 'two bars with the same scale', note: part ? '' : `the size comes from the catalog (${x.unit === 'size' ? 'a size word: tiny to huge' : x.unit})` };
  for (const t of topics) t.say ||= brief(text);
  addCard(ctx, topics[1], { kind: 'bars', thing: `${x.label} or ${y.label}`, title: `${x.label} and ${y.label}`, data: { bars: [{ label: x.label, value: x.value }, { label: y.label, value: y.value }], unit, big: x.value === y.value ? -1 : x === big ? 0 : 1 }, how: howOf(hw) }, text);
  return ok(text, { values: [x.value, y.value] });
}

/** The order of a series of the catalog (months, seasons, days, planets...): the sentence and a line with points. */
export function order(ctx, { s } = {}) {
  const key = seqKey(ctx, s);
  const q = key && seqOf(ctx, key);
  if (!q) return noSeries(ctx);
  const topic = topicFor(ctx, key);
  const text = `${q.lead} ${list(q.items)}.`;
  addCard(ctx, topic, { kind: 'line', thing: key, title: cap(key), data: { items: q.items, cyclic: q.cyclic, mark: -1 }, how: howOf({ frame: `the order of the ${key}`, words: key, things: [key], sources: [{ what: SEQ_SOURCE, part: key }], card: 'a line with one point for each' }) }, text);
  return ok(text, { values: q.items });
}

const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
/** What comes after / before X, or which one is the Nth: the sentence and the line with the point marked. */
export function neighbour(ctx, { x, dir, n, s } = {}) {
  let word = clean(x).replace(/^the\s+/, '');
  const dirWord = word.match(/^(before|after)\s+(.+)$/);   // "and before it?" after "what comes after Mars?": the ellipsis put its words into the old slot, the direction is theirs
  if (dirWord) { dir = dirWord[1]; word = dirWord[2].replace(/^the\s+/, ''); }
  if (n === undefined && seqKey(ctx, word)) return order(ctx, { s: word });   // "and the seasons?" after "what comes after March?": the whole line
  if (PRON.test(word)) {   // "and before it?": the item the last line question was about
    const last = [...ensure(ctx).cards].reverse().find((c) => c.kind === 'line' && c.data?.items);
    const at = last ? (Number.isInteger(last.data.from) ? last.data.from : last.data.mark) : -1;
    if (last && at >= 0) word = clean(last.data.items[at]);
  }
  let key = null, i = -1;
  if (n !== undefined && s) {
    key = seqKey(ctx, s); const q = key && seqOf(ctx, key);
    if (!q) return noSeries(ctx);
    i = Number(n) - 1;
    if (!(i >= 0 && i < q.items.length)) return no('missing', `There ${q.items.length === 1 ? 'is' : 'are'} only ${q.items.length} ${q.one}s, so there is no ${ORD[Number(n) - 1] ?? `number ${n}`} one.`);
  } else {
    for (const k of Object.keys(seriesOf(ctx))) { const j = seriesOf(ctx)[k].items.findIndex((it) => it.toLowerCase() === word); if (j >= 0) { key = k; i = j; break; } }
    if (!key) return Object.keys(seriesOf(ctx)).length ? no('missing', `I know the order of ${list(Object.keys(seriesOf(ctx)))}, but I don't know where ${word || 'that'} fits yet.`) : noSeries(ctx);
  }
  const q = seqOf(ctx, key), at = q.items[i], len = q.items.length;
  let text, mark = i;
  if (n !== undefined && s) text = `The ${ORD[i] ?? `number ${n}`} ${q.one}${q.from ? ` from the ${q.from}` : ''} is ${at}.`;
  else {
    const d = dir === 'before' ? -1 : 1;
    const j = i + d;
    if (j < 0 || j >= len) {
      if (q.cyclic) { mark = (j + len) % len; text = d > 0 ? `After ${at} comes ${q.items[mark]}, and the ${q.one}s start again.` : `Before ${at} comes ${q.items[mark]}.`; }
      else text = d > 0 ? `${at} is ${q.last}, so no ${q.one} comes after it.` : `${at} is ${q.first}, so no ${q.one} comes before it.`;
    } else { mark = j; text = d > 0 ? `${q.items[j]} comes after ${at}.` : `${q.items[j]} comes before ${at}.`; }
  }
  const topic = topicFor(ctx, key);
  addCard(ctx, topic, { kind: 'line', thing: key, title: cap(key), data: { items: q.items, cyclic: q.cyclic, mark, from: i }, how: howOf({ frame: n !== undefined ? `which ${q.one} is number ${n}` : `what comes ${dir === 'before' ? 'before' : 'after'} ${at}`, words: n !== undefined ? `${ORD[i]} ${q.one}` : at, things: [at], sources: [{ what: SEQ_SOURCE, part: key }], card: 'the line with the answer marked' }) }, text);
  return ok(text, { values: [q.items[mark]] });
}

// ---------------------------------------------------------------- one slot of a thing, found through the schemas (no world is named here)
const VERB_SLOTS = { does: (n, v) => `${cap(n)} ${v}.`, can: (n, v) => `${cap(n)} can ${v}.`, used_for: (n, v) => `${cap(n)} is used for ${v}.`, is_a: (n, v) => `${cap(n)} is ${/^[aeiou]/i.test(v) ? 'an' : 'a'} ${v}.` };
/** The sentence for one slot of a thing: a verb-like slot (eats, comes from) reads as a verb, any other as "The habitat of the cow is farm". */
function slotSentence(ctx, r, hit, attr, recs) {
  const sc = ctx.knowledge?.peekSchema?.();
  const nm = r.proper ? r.name : `the ${r.name}`;
  const vals = hit.values.map((v) => String(v).replace(/_/g, ' '));
  const lst = list(vals);
  if (hit.key === 'gloss') {   // the first sense of each part of speech: a word like brave is an adjective and, far down the list, a noun
    const byPos = new Map();
    for (const x of recs.filter((y) => y.f.gloss && y.type === 'k.words.sense')) if (!byPos.has(x.f.pos?.[0])) byPos.set(x.f.pos?.[0], firstClause(x.f.gloss[0]));
    const parts = [...byPos].slice(0, 3).map(([pos, g]) => (byPos.size > 1 && pos ? `as ${/^[aeiou]/.test(pos) ? 'an' : 'a'} ${pos}, ${g}` : g));
    return `${cap(r.name)} means: ${parts.join('; ')}.`;
  }
  if (hit.key === 'synonym') return `${vals.length > 1 ? 'Synonyms' : 'A synonym'} of ${r.name}: ${lst}.`;
  if (VERB_SLOTS[hit.key]) return VERB_SLOTS[hit.key](cap(nm), lst);
  const label = hit.key.replace(/_/g, ' ');
  const verbish = /_(?:from|on|at|of|by)$/.test(hit.key) || (/s$/.test(hit.key) && sc?.slotWords?.has(hit.key.slice(0, -1)));
  if (verbish) return `${cap(nm)} ${label} ${lst}.`;
  return vals.length > 1 ? `The ${label} of ${nm}: ${lst}.` : `The ${label} of ${nm} is ${lst}.`;
}
/** What is the capital of X / what colour is X / what does X eat / where does X live / what is next to X: one slot of the records of X, the slot found by the words of the schemas. */
export function ask(ctx, { o, a } = {}) {
  const subject = subj(ctx, o);
  if (!subject) return no('missing', NO_TOPIC);
  const r = lookup(ctx, subject);
  if (!r) return dontKnow(ctx, false);
  const sc = ctx.knowledge?.peekSchema?.();
  const attr = clean(a);
  const recs = R.records(r.th, r.name, { senses: true });
  r.proper = /^[A-Z]/.test(r.name);
  const hit = R.valuesOf(recs, R.slotsFor(sc, attr));
  const topic = topicFor(ctx, r.name);
  if (!hit) return no('missing', recs.length ? `I know ${an(r.name)}, but not its ${attr || 'that'} yet.` : NONE);
  const text = slotSentence(ctx, r, hit, attr, recs);
  const rows = [{ k: hit.key.replace(/_/g, ' '), v: hit.values.map((v) => String(v).replace(/_/g, ' ')).join(', ') }];
  addCard(ctx, topic, { kind: 'facts', thing: r.name, title: cap(r.name), data: { rows }, how: how(ctx, { ...r, shards: [hit.rec.shard].filter(Boolean) }, `the ${hit.key.replace(/_/g, ' ')} of a thing`, `the ${attr} of ${an(r.name)}`, 'a small list with the fact') }, text);
  return ok(text, { values: hit.values });
}

/** Does X have a P: yes with the count when the catalog's slots or the parts of its picture say so, no when the count is zero, else what is not known. */
export function has(ctx, { o, p } = {}) {
  const subject = subj(ctx, o);
  if (!subject) return no('missing', NO_TOPIC);
  const r = lookup(ctx, subject);
  if (!r) return dontKnow(ctx, false);
  const what = clean(p), one = singular(what);
  const topic = topicFor(ctx, r.name);
  const c = countOf(ctx, r, what);
  const pictured = r.parts.some((x) => x.name === one || String(x.name).endsWith(`_${one}`));
  const text = c ? (c.n === 0 ? `No, ${an(r.name)} has no ${what}.` : `Yes, ${an(r.name)} has ${c.about ? 'about ' : ''}${c.n} ${c.n === 1 ? one : what}.`) : pictured ? `Yes, my picture of ${an(r.name)} has ${an(one)}.` : '';
  if (!text) return no('missing', `I know what ${an(r.name)} is, but not whether it has ${an(one)}.`);
  topic.say ||= brief(text);
  return ok(text, { values: [c?.n ?? 1] });
}

/** Is X a Y: yes when Y is a category of X in the catalog (the kind slots of its records, the noun of their type, the is-a of its senses), else no with what it is. */
export function isa(ctx, { o, c } = {}) {
  const subject = subj(ctx, o);
  if (!subject) return no('missing', NO_TOPIC);
  const r = lookup(ctx, subject);
  if (!r) return dontKnow(ctx, false);
  const recs = R.records(r.th, r.name);
  const { own, all: cats } = R.categories(r.th, recs);
  const want = clean(c), sing = singular(want);
  const topic = topicFor(ctx, r.name);
  if (!cats.size) return no('missing', NONE);
  const yes = [want, sing].some((x) => cats.has(x));
  const mine = [...(own.size ? own : cats)].filter((x) => x && x !== 'thing' && x !== 'sense').slice(0, 3);
  const text = yes ? `Yes, ${an(r.name)} is ${an(sing)}.` : own.size ? `No. ${cap(an(r.name))} is ${list(mine.map(an))}, not ${an(sing)}.` : `I do not know that. I only know that ${an(r.name)} is ${list(mine.map(an))}.`;
  topic.say ||= brief(text);
  return ok(text, { values: [yes ? 'yes' : 'no'] });
}

/** "No, the other one": of the two things of the last comparison, the one the conversation is not on; it is shown as "what is X". */
export function other(ctx) {
  const s = ensure(ctx);
  const bars = [...s.cards].reverse().find((c) => c.kind === 'bars' && c.data?.bars?.length === 2);
  const cur = clean(current(ctx));
  if (!bars) return no('missing', 'I do not know which other one you mean. Ask me to compare two things first, for example "Which is bigger, a dog or a house?".');
  const names = bars.data.bars.map((b) => String(b.label));
  const rest = names.find((n) => clean(n) !== cur) ?? names[0];
  const bar = bars.data.bars.find((b) => String(b.label) === rest);
  void bar;
  return look(ctx, { o: rest.toLowerCase() });
}

/** What did we talk about: one line per topic; the tab shows the board. */
export function board(ctx) {
  const s = ensure(ctx);
  if (!s.topics.length) return ok('We have not talked about anything yet. Ask me what something looks like, how many legs it has, or what comes after March.', { values: [] });
  const lines = s.topics.map((t) => `${t.name}${t.say ? ` (${t.say.replace(/\.$/, '')})` : ''}`);
  ctx.effect('talk.board', { show: true });
  return ok(`We talked about ${s.topics.length === 1 ? 'one thing' : `${s.topics.length} things`}: ${lines.join('; ')}. The board shows how they link.`, { values: s.topics.map((t) => t.name) });
}

function howOf(h) {
  const srcs = h.sources ?? [];
  return { frame: h.frame, words: h.words, things: h.things ?? [], sources: srcs, card: h.card, note: h.note ?? '' };
}
function how(ctx, r, frame, words, card, note = '') { return howOf({ frame, words, things: [r.name], sources: sourceName(r), card, note }); }

/** How do you know: a card with the path of the last answer, in plain words. */
export function howDoYouKnow(ctx) {
  const s = ensure(ctx);
  const last = [...s.cards].reverse().find((c) => c.kind !== 'how' && c.how);
  if (!last) return no('missing', 'I have not answered anything yet. Ask me about something first, then ask how I know.');
  const h = last.how;
  const where = h.sources.length ? list(h.sources.map((x) => `${x.what}${x.part && x.part !== x.what ? ` (${x.part})` : ''}`)) : 'nowhere outside this tab';
  const steps = [
    { label: 'You asked', text: h.words },
    { label: 'I read it as', text: `a question about ${h.frame}` },
    { label: 'I looked in', text: where },
    { label: 'I found', text: last.text },
    { label: 'So I made', text: h.card },
  ];
  if (h.note) steps.push({ label: 'Please note', text: h.note });
  const text = `I read your question as ${h.frame}. I looked in ${where}, and I found: ${firstClause(last.text)}${/[.!?]$/.test(firstClause(last.text)) ? '' : '.'} Then I made ${h.card}.`;
  const topic = s.topics.find((t) => t.id === last.topic) ?? null;
  addCard(ctx, topic, { kind: 'how', thing: last.thing, title: 'How I know', data: { steps, of: last.id } }, text);
  return ok(text, { values: steps.map((x) => x.text) });
}

/** What can we talk about: the opening line and suggestion chips from the example questions of this world. */
export function suggestions(ctx) {
  const pats = ctx.patterns?.('talk') ?? [];
  const items = pats.filter((p) => p.kind === 'request' && p.canonical?.length && !/^pat\.talk\.(?:how|board|scope)/.test(p.id)).map((p) => p.canonical[0]);
  return items;
}
export function scope(ctx) {
  const items = suggestions(ctx).slice(0, 5);
  if (items.length) ctx.effect('chat.suggest', { items });
  return ok(OPENING, { values: items });
}

// ---------------------------------------------------------------- host hooks
/** Spec 17: the things of a request that the host should look up in the catalog before the operation runs. */
export function openSlots(ctx, { action, args = {} } = {}) {
  const names = action === 'talk.look' || action === 'talk.parts' || action === 'talk.kind' || action === 'talk.ask' ? [args.o] : action === 'talk.count' ? [args.o, args.p] : action === 'talk.isa' ? [args.o, args.c] : action === 'talk.has' ? [args.o] : action === 'talk.change' ? [args.x] : action === 'talk.compare' ? [args.a, args.b] : action === 'talk.neighbour' ? [args.x] : [];
  return names.map(clean).filter((n) => n && n.split(' ').length <= 3 && !PRON.test(n));
}
/** Host hook: the catalog models this world reads synchronously (the schemas of the knowledge worlds, the ordered series), built by the host before an operation runs. */
export function needs() { return ['schema', 'series']; 
}

const words = (t) => String(t ?? '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
/**
 * Honest scope: a message of the Talk tab that nothing read. Returns { say, suggest } with a plain refusal and the two example questions nearest to the user's words
 * (word overlap; the examples are the ones of this world), or undefined when there are none.
 */
export function outOfScope(ctx, { text } = {}) {
  const have = new Set(words(text));
  const pool = (ctx.patterns?.('talk') ?? []).filter((p) => p.kind === 'request').flatMap((p) => [...(p.canonical ?? []), ...(p.examples ?? [])]);
  const score = (e) => { const ws = new Set(words(e)); let n = 0; for (const w of have) if (ws.has(w) && w.length > 2) n++; return n / Math.sqrt(ws.size || 1); };
  const ranked = [...new Set(pool)].filter((e) => !/how do you know|what did we talk|what can/i.test(e)).map((e) => ({ e, sc: score(e) })).sort((a, b) => b.sc - a.sc || a.e.localeCompare(b.e));
  const near = ranked.slice(0, 2).map((x) => x.e);
  if (!near.length) return undefined;
  return { say: `I cannot talk about that here. I can talk about things you can draw, their parts and sizes, and the order of months, seasons, days and planets. You could ask ${near.map((e) => `"${e}"`).join(' or ')}.`, suggest: near };
}

/** Host hook: "how do you know?" on this tab is answered by the how card, not by the general explanation of the last turn. */
export function ownsExplain(ctx, { text } = {}) {
  return /\b(?:how (?:do|did|can) you (?:know|tell)|why do you say that|where did you (?:learn|get) that|who told you|what is (?:your|that based)|what s your source)\b/.test(String(text ?? '').toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' '));
}

// ---------------------------------------------------------------- the parts diagram, laid out by the SPACE module (a grid under the box of the thing)
const BOX = { w: 130, h: 28, pad: 14, root: 62 };
/** Where each named part's box goes: { w, h, root: { x, y }, boxes: { name: [x, y] } } (centres). No two boxes overlap (the module's grid; tested with its own `anyOverlap`). */
export function layoutParts(items) {
  const n = items.length;
  if (!n) return null;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n))), rows = Math.ceil(n / cols);
  const frame = { w: cols * (BOX.w + BOX.pad) + BOX.pad, h: rows * (BOX.h + BOX.pad) + BOX.pad };
  const its = items.map((it, i) => ({ id: String(it.name), kind: 'part', x: 40 + i * 2, y: frame.h / 2, w: BOX.w, h: BOX.h, z: i }));
  const plan = space.planLayout('grid', its, frame);
  if (plan.error) return null;
  const boxes = {};
  for (const it of its) { const b = plan.boxes[it.id] ?? it; boxes[it.id] = [Math.round(b.x), Math.round(b.y + BOX.root)]; }
  return { w: frame.w, h: frame.h + BOX.root, root: { x: Math.round(frame.w / 2), y: 24 }, boxes, box: { w: BOX.w, h: BOX.h } };
}

// ---------------------------------------------------------------- cards that change by talking
const CARD_KINDS = new Set(['drawing', 'parts', 'icons', 'bars', 'line', 'tree', 'facts']);
const activeCard = (ctx) => {
  const s = ensure(ctx);
  return [...s.cards].reverse().find((c) => c.topic === s.current && CARD_KINDS.has(c.kind) && c.data) ?? [...s.cards].reverse().find((c) => CARD_KINDS.has(c.kind) && c.data) ?? null;
};
const isTint = (c) => !!colourName(c);   // any colour of the catalog (the one reader, k.values)
const SCALE = { min: 0.6, max: 1.6, step: 0.2 };
const refresh = (ctx, c) => ctx.effect('talk.card', { id: c.id, update: true });
// One undoable step per request on this tab: a change of a card keeps the fields it replaced; a transfer keeps the tab that took it (that world's own undo takes it back).
const push = (ctx, step) => { const s = ensure(ctx); (s.undo ??= []).push(step); if (s.undo.length > 20) s.undo.shift(); };
const memo = (c) => structuredClone({ tint: c.data.tint ?? null, scale: c.data.scale ?? null, mark: c.data.mark ?? null, extras: c.data.extras ?? null });

/** Make it red / bigger / smaller / show the X too: the card the conversation is on changes in place. */
export function change(ctx, { c, size, x } = {}) {
  const card = activeCard(ctx);
  if (!card) return no('missing', 'There is no picture to change yet. Ask me about something first, for example "What does a lighthouse look like?".');
  const name = String(card.thing ?? 'it').toLowerCase();
  push(ctx, { kind: 'change', id: card.id, before: memo(card) });
  const undone = () => ensure(ctx).undo.pop();   // a change that did not happen is not a step
  if (c) {
    const colour = colourName(clean(c)) ?? clean(c);   // the catalog's name (spelling variants included)
    if (!isTint(colour)) { undone(); return no('unsupported', `I do not know the colour ${clean(c)} for a picture.`); }
    card.data.tint = colour;
    refresh(ctx, card);
    return ok(`I made the ${name} ${colour}.`, { values: [colour] });
  }
  if (size) {
    const cur = Number(card.data.scale) || 1;
    const next = Math.round(Math.max(SCALE.min, Math.min(SCALE.max, cur + (size === 'up' ? SCALE.step : -SCALE.step))) * 10) / 10;
    if (next === cur) { undone(); return ok(`The ${name} picture is already as ${size === 'up' ? 'big' : 'small'} as it gets.`, { values: [cur] }); }
    card.data.scale = next;
    refresh(ctx, card);
    return ok(`I made the ${name} picture ${size === 'up' ? 'bigger' : 'smaller'}.`, { values: [next] });
  }
  if (x) {
    if (card.kind !== 'drawing') { undone(); return no('unsupported', 'I can show another thing next to a drawing, not next to this kind of picture.'); }
    const w = clean(x), sing = singular(w);
    const mine = (card.data.parts ?? []).find((p) => { const n = clean(String(p.name).replace(/_/g, ' ')); return [w, sing].includes(n) || [w, sing].includes(n.split(' ').at(-1)); });
    if (mine) { card.data.mark = String(mine.name); refresh(ctx, card); return ok(`The ${sing} is already in the picture. I marked it.`, { values: [sing] }); }
    const r = lookup(ctx, w);
    if (!r || !r.parts.length) { undone(); return dontKnow(ctx, false); }
    const extras = card.data.extras ?? (card.data.extras = []);
    if (extras.some((e) => e.name === r.name)) { undone(); return ok(`The ${r.name} is already next to the ${name}.`, { values: [r.name] }); }
    if (extras.length >= 3) { undone(); return no('unsupported', 'The picture is full. Ask me about something new.'); }
    extras.push({ name: r.name, parts: r.parts });
    refresh(ctx, card);
    return ok(`I put ${an(r.name)} next to the ${name}.`, { values: [r.name] });
  }
  undone();
  return no('missing', 'What shall I change? You can say "make it red", "bigger" or "show the moon too".');
}

// ---------------------------------------------------------------- Talk as a VIEW of the session things (spec 23): any aspect, shown as a card
const ASPECTS_ALL = ['visual', 'spatial', 'relational', 'numeric', 'textual', 'geographic', 'temporal', 'social'];
/** The declaration of this world as a view: it shows every aspect (a card for each kind of thing). */
export const view = () => ok({ id: 'talk', noun: 'conversation', words: ['talk', 'chat', 'conversation'], aspects: ASPECTS_ALL, kinds: null });
const tintOf = (card) => (card?.data?.tint && isTint(card.data.tint) ? card.data.tint : null);
/** The topics of the conversation are things of the session: published after every card, each keeping the id the store gave it. */
function publish(ctx) {
  const s = ensure(ctx);
  const items = s.topics.map((t) => {
    const card = s.cards.find((c) => c.id === t.card);
    const r = t.kind ? null : lookup(ctx, t.name);
    const proper = r && /^[A-Z]/.test(r.name ?? '') ? r.name : null;
    const isA = proper ? String(r.th?.senses?.[0]?.isA?.[0] ?? 'thing').replace(/_/g, ' ') : null;
    return {
      key: t.id, thingId: t.thingId, kind: t.kind ?? isA ?? t.name, name: t.thingName ?? proper ?? null,
      attrs: { ...(t.attrs ?? {}), ...(tintOf(card) ? { colour: card.data.tint } : {}) },
      ...(card?.kind === 'drawing' && card.data?.parts?.length ? { parts: card.data.parts } : {}),
    };
  });
  const r = ctx.request('things.sync', { view: 'talk', items });
  const ids = r?.status === 'supported' ? r.value?.ids ?? r.ids : null;
  if (ids) for (const t of s.topics) if (ids[t.id]) t.thingId = ids[t.id];
}
/** Take a thing of the store into the conversation: the topic is the thing, its card is a picture when it has a look (its parts, or the catalog's) and a list of what is known of it otherwise. */
export function adopt(ctx, { thing } = {}) {
  if (!thing?.kind) return no('unsupported', 'I was given nothing to talk about.');
  const label = thing.name ?? thing.label ?? thing.kind, kindWord = clean(String(thing.kind).replace(/_/g, ' '));
  const topic = topicFor(ctx, label);
  Object.assign(topic, { thingId: thing.id, kind: thing.kind, thingName: thing.name ?? null, attrs: { ...(thing.attrs ?? {}) } });
  const r = lookup(ctx, thing.name ?? thing.kind) ?? lookup(ctx, kindWord);
  const parts = thing.parts?.length ? thing.parts.slice(0, MAX_PARTS) : r?.parts ?? [];
  const from = thing.originNoun ? `the ${thing.originNoun}` : thing.origin === 'learned' ? 'what you told me' : 'another view';
  const tint = thing.attrs?.colour && isTint(thing.attrs.colour) ? String(thing.attrs.colour) : null;
  const rows = [{ k: 'kind', v: String(thing.kind).replace(/_/g, ' ') }, ...(thing.name ? [{ k: 'name', v: thing.name }] : []), ...Object.entries(thing.attrs ?? {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => ({ k: k.replace(/_/g, ' '), v: String(v) }))].slice(0, 10);
  const know = r?.th && (!thing.origin || thing.origin === 'learned') ? whatSentence(r, ctx) : '';   // what the catalog says belongs to a thing of the knowledge, not to one made in another view
  const text = `Here is ${thing.name ?? thing.label ?? an(kindWord)} from ${from}.${know ? ` ${know}` : ''}`;
  const how = howOf({ frame: `a thing from ${from}`, words: label, things: [label], sources: [{ what: from, part: '' }], card: parts.length ? 'a picture of it from its parts' : 'a list of what is known about it' });
  if (parts.length) addCard(ctx, topic, { kind: 'drawing', thing: label, title: cap(label), data: { parts: trimParts(parts), ...(tint ? { tint } : {}) }, how }, text);
  else addCard(ctx, topic, { kind: 'facts', thing: label, title: cap(label), data: { rows, unit: `from ${from}` }, how }, text);
  return ok(text, { values: [label] });
}

// ---------------------------------------------------------------- cards that travel to other tabs
/** One transfer of the card (or the topic) to another tab: the other world's own operations do the work, so one undo takes it back. */
export function send(ctx, { to } = {}) {
  const s = ensure(ctx);
  const topic = s.topics.find((t) => t.id === s.current);
  if (!topic) return no('missing', 'There is nothing to send yet. Ask me about something first, for example "What does a lighthouse look like?".');
  const card = activeCard(ctx);
  const name = topic.name;
  if (!['draw', 'diagram'].includes(to)) {   // every other place (the map too) is a view of the session things: the store decides what it can take (draw and diagram are not views yet)
    if (!topic.thingId) return no('missing', `I have not put the ${name} in the session yet. Ask me about it first.`);
    const r = ctx.request('things.show', { ids: [topic.thingId], to, from: 'talk' });
    return r?.status === 'supported' ? ok(String(r.value), { values: [name, to] }) : no(r?.status ?? 'unsupported', String(r?.note ?? `I cannot show the ${name} there.`));
  }
  if (to === 'draw') {
    const args = { n: 1, kind: name, kt: name, where: '', ...(card?.data?.tint ? { m1: card.data.tint } : {}) };
    const r = ctx.request('draw.add', args);
    if (r.status !== 'supported') return no(r.status === 'missing' ? 'missing' : 'unsupported', `The Drawing tab could not take the ${name}. ${r.note ?? r.value ?? ''}`.trim());
    push(ctx, { kind: 'send', to: 'draw' });
    return ok(`I put ${an(name)} in your drawing. The Drawing tab took it.`, { values: [name, 'Drawing'] });
  }
  if (to === 'diagram') {
    const items = (card?.data?.items ?? partNames(card?.data?.parts ?? [])).map((p) => String(p.name).replace(/_/g, ' ')).slice(0, 8);
    if (!items.length) return no('missing', `I have no named parts of the ${name} to make a diagram of. Ask me for its parts first.`);
    const label = (w) => w.replace(/\b\w/g, (m) => m.toUpperCase()).replace(/ /g, '-');   // the diagram's names are one word
    const root = label(name), names = items.map(label);
    // one request: the boxes and the links in one sentence, so one undo takes the whole transfer back
    const create = ctx.request('diagram.create', { text: `add a box named ${root}, ${names.map((p) => `a box named ${p}`).join(', ')} and connect ${root} to ${names.join(', ')}` });
    if (create.status !== 'supported') return no('unsupported', `The Diagram tab could not take the ${name}. ${create.note ?? create.value ?? ''}`.trim());
    push(ctx, { kind: 'send', to: 'diagram' });
    return ok(`I made a diagram of the ${name} with ${items.length} part${items.length === 1 ? '' : 's'}. The Diagram tab took it.`, { values: [name, 'Diagram'] });
  }
  return no('unsupported', 'I can send a picture to the drawing or the diagram.');
}

/** Ask about this: from another tab, open Talk on the thing that is selected there. */
export function about(ctx) {
  const tab = ctx.peek('ui.shell')?.activeTab;
  let name = null, where = '';
  if (tab === 'draw') {
    const d = ctx.peek('art.draw');
    const o = d?.objects?.find((x) => x.id === d.selected) ?? d?.objects?.find((x) => x.id === d.last?.[0]) ?? d?.objects?.at(-1);
    if (o) { name = o.kind === 'composite' ? o.thing : o.kind; where = 'your drawing'; }
  } else if (tab === 'diagram') {
    const d = ctx.peek('diagram.sketch');
    const sel = Array.isArray(d?.selected) ? d.selected[0] : d?.selected, nm = sel?.name ?? sel ?? d?.last?.[0];
    if (nm) { name = String(nm); where = 'your diagram'; }
  } else if (tab === 'map') {
    const f = ctx.peek('geo.map')?.focus;
    if (f?.name) { name = String(f.name); where = 'the map'; }
  }
  if (!name) return no('missing', 'Select something in a drawing, a diagram or the map first, then ask about it.');
  try { ctx.request('ui.openTab', { tab: 'talk' }); } catch { /* no shell loaded */ }
  const r = look(ctx, { o: name });
  if (r.status !== 'supported') return no(r.status, `${r.note ?? NONE} (That is the ${String(name).toLowerCase()} from ${where}.)`);
  return ok(`Here is the ${String(name).toLowerCase()} from ${where}. ${r.value}`, { values: r.values });
}

// ---------------------------------------------------------------- what kind of thing: a small tree of the is-a facts of the word senses
export function kind(ctx, { o } = {}) {
  const subject = subj(ctx, o);
  if (!subject) return no('missing', NO_TOPIC);
  const r = lookup(ctx, subject);
  if (!r) return dontKnow(ctx, false);
  const isOf = (th) => [...new Set((th?.senses ?? []).flatMap((x) => x.isA ?? []).map((w) => clean(String(w).replace(/_/g, ' '))).filter(Boolean))];
  const isA = isOf(r.th).slice(0, 3);
  if (!isA.length) return no('missing', `I know ${an(r.name)}, but not what kind of thing it is.`);
  const above = Object.fromEntries(isA.map((p) => [p, isOf(ctx.knowledge?.peek?.(p)).slice(0, 2)]));
  const topic = topicFor(ctx, r.name);
  const text = `${cap(an(r.name))} is a kind of ${list(isA)}.`;
  addCard(ctx, topic, { kind: 'tree', thing: r.name, title: cap(r.name), data: { root: cap(r.name), parents: isA, above }, how: how(ctx, r, 'what kind of thing it is', `what kind of thing ${an(r.name)} is`, 'a small tree: the thing below, what it is a kind of above', 'the kinds come from the word senses; a kind with no entry of its own stops the tree') }, text);
  return ok(text, { values: isA });
}

// ---------------------------------------------------------------- about the user and the session
const PRIVATE = 'Nothing leaves this device.';
const once = (ctx) => { const s = ensure(ctx); s.said ??= {}; if (s.said.privacy) return ''; s.said.privacy = true; return ` ${PRIVATE}`; };
const labelOf = (o) => String(o.kind === 'composite' ? o.thing : o.kind ?? 'thing').replace(/[_-]/g, ' ');
const plural = (w, n) => (n === 1 ? w : /(?:s|x|ch|sh)$/.test(w) ? `${w}es` : /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`);

/** What do you know about me: the profile fields as a small card. */
export function me(ctx) {
  const f = ctx.peek('user.profile')?.fields ?? {};
  const rows = Object.entries(f).map(([k, v]) => ({ k: k.replace(/_/g, ' '), v: [].concat(v?.v ?? '').join(', ') })).filter((r) => r.v).slice(0, 8);
  const topic = topicFor(ctx, 'you');
  if (!rows.length) { topic.say ||= 'nothing known yet'; return ok(`I do not know anything about you yet. Say "interview me" and I will learn.${once(ctx)}`, { values: [] }); }
  const text = `I know ${rows.length} thing${rows.length === 1 ? '' : 's'} about you: ${list(rows.map((r) => `your ${r.k} is ${r.v}`))}.${once(ctx)}`;
  addCard(ctx, topic, { kind: 'facts', thing: 'you', title: 'About you', data: { rows }, how: howOf({ frame: 'what I know about you', words: 'what do you know about me', things: ['you'], sources: [{ what: 'your profile on this device', part: '' }], card: 'a small list of what you told me' }) }, text);
  return ok(text, { values: rows.map((r) => r.v) });
}

/** What did I draw today: a tally of the objects of the drawing in this session. */
export function drawn(ctx) {
  const objs = ctx.peek('art.draw')?.objects ?? [];
  const topic = topicFor(ctx, 'your drawing');
  if (!objs.length) { topic.say ||= 'nothing drawn yet'; return ok(`You have not drawn anything yet in this session. Say "draw a red house" on the Drawing tab.${once(ctx)}`, { values: [] }); }
  const tally = new Map();
  for (const o of objs) tally.set(labelOf(o), (tally.get(labelOf(o)) ?? 0) + 1);
  const rows = [...tally].map(([k, v]) => ({ k, v })).sort((a, b) => b.v - a.v || a.k.localeCompare(b.k)).slice(0, 8);
  const text = `In this session you drew ${objs.length} thing${objs.length === 1 ? '' : 's'}: ${list(rows.map((r) => (r.v === 1 ? an(r.k) : `${r.v} ${plural(r.k, r.v)}`)))}.${once(ctx)}`;
  addCard(ctx, topic, { kind: 'facts', thing: 'your drawing', title: 'What you drew', data: { rows, unit: 'in this session' }, how: howOf({ frame: 'what you drew', words: 'what did I draw', things: ['your drawing'], sources: [{ what: 'your drawing in this session', part: '' }], card: 'a tally of the things in your drawing' }) }, text);
  return ok(text, { values: rows.map((r) => r.v) });
}

/** How many moves did I make in chess: counted icons from the history of the game. */
export function moves(ctx) {
  const g = ctx.peek('games.chess');
  const n = g?.history?.length ?? 0, mine = g?.user === 'black' ? Math.floor(n / 2) : Math.ceil(n / 2);
  const topic = topicFor(ctx, 'your chess game');
  if (!mine) { topic.say ||= 'no moves yet'; return ok(`You have not made a move in chess yet in this session.${once(ctx)}`, { values: [0] }); }
  const text = `You made ${mine} move${mine === 1 ? '' : 's'} in chess in this session.${once(ctx)}`;
  addCard(ctx, topic, { kind: 'icons', thing: 'your chess game', title: 'Your chess moves', data: { n: Math.min(mine, 40), label: plural('move', mine), from: 'session' }, how: howOf({ frame: 'how many chess moves you made', words: 'how many moves did I make in chess', things: ['your chess game'], sources: [{ what: 'your chess game in this session', part: '' }], card: `${Math.min(mine, 40)} small icons, one for each move` }) }, text);
  return ok(text, { values: [mine] });
}

const UNDO_OF = { draw: ['draw.undo', 'Drawing'], diagram: ['diagram.undo', 'Diagram'], map: ['geo.undo', 'Map'] };
/** Undo on the Talk tab: the last change of a card, or the last transfer (the tab that took it takes it back: one step). */
export function undo(ctx) {
  const s = ensure(ctx), step = s.undo?.pop();
  if (!step) return no('missing', 'There is nothing to take back on this tab. To take back something in the drawing, the diagram or the map, open that tab and say undo.');
  if (step.kind === 'change') {
    const card = s.cards.find((c) => c.id === step.id);
    if (!card?.data) return no('missing', 'That picture is gone, so there is nothing to take back.');
    for (const [k, v] of Object.entries(step.before)) { if (v === null) delete card.data[k]; else card.data[k] = v; }
    refresh(ctx, card);
    return ok('OK, I took the change back.', { values: [card.id] });
  }
  const [action, tab] = UNDO_OF[step.to] ?? [];
  const r = action ? ctx.request(action, {}) : null;
  if (!r || r.status !== 'supported') return no('missing', `The ${tab ?? 'other'} tab had nothing to take back.`);
  return ok(`OK, I took it back out of the ${tab} tab.`, { values: [tab] });
}
