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
import { THINGS, THING_WORDS } from '../art.draw/things.catalog.mjs?v=4cd417b561';
import * as space from '../space/space.mjs?v=27b9e9b571';   // the shared layout module: the parts diagram is laid out by it (specs/18)

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
const an = (n) => `${/^[aeiou]/i.test(n) && !/^(?:uni|use|eu)/i.test(n) ? 'an' : 'a'} ${n}`;
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const clean = (w) => String(w ?? '').toLowerCase().replace(/[^\p{L}\p{N} -]/gu, ' ').replace(/^\s*(?:an?|the|some)\s+/, '').replace(/\s+/g, ' ').trim();
const firstClause = (g) => String(g).split(/;\s*/)[0].replace(/^\([^)]*\)\s*/, '').trim();
const brief = (t, n = 80) => { const c = firstClause(t); if (c.length <= n) return c; const cut = c.slice(0, n).replace(/\s+\S*$/, ''); return `${cut}…`; };
const singular = (w) => (/ies$/.test(w) ? `${w.slice(0, -3)}y` : /(?:ses|xes|ches|shes)$/.test(w) ? w.slice(0, -2) : /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w);

// ---------------------------------------------------------------- the built-in sequences (a local table until the time and space knowledge worlds are in the catalog)
const SEQ = {
  months: { items: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], cyclic: true, one: 'month', lead: 'The months of the year are' },
  seasons: { items: ['Spring', 'Summer', 'Autumn', 'Winter'], cyclic: true, one: 'season', lead: 'The seasons are' },
  days: { items: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], cyclic: true, one: 'day', lead: 'The days of the week are' },
  planets: { items: ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'], cyclic: false, one: 'planet', lead: 'From the sun, the planets are', first: 'the closest to the sun', last: 'the farthest from the sun' },
};
const PLANET_KM = { Mercury: 4879, Venus: 12104, Earth: 12742, Mars: 6779, Jupiter: 139820, Saturn: 116460, Uranus: 50724, Neptune: 49244 };
const SEQ_SOURCE = 'a small table built into this tab';
const seqKey = (w) => { const s = clean(w); return /^months?$/.test(s) ? 'months' : /^seasons?$/.test(s) ? 'seasons' : /^(?:days?|weekdays?)$/.test(s) ? 'days' : /^planets?$/.test(s) ? 'planets' : null; };
const SIZE_RANK = { tiny: 1, small: 2, little: 2, medium: 3, large: 4, big: 4, huge: 5, giant: 5, enormous: 5 };

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
  return { name: th?.name ?? key ?? singular(w), th, parts: trimParts(parts), shards, from };
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
  return c;
}
const sources = (r) => r.shards.map((id) => {
  const kind = /^k\.objects/.test(id) ? 'the picture catalog' : /^k\.words/.test(id) ? 'the word senses' : /^k\.commonsense/.test(id) ? 'the common sense facts' : id;
  return { what: kind, part: /^k\.objects/.test(id) ? String(id).split('/').pop() : '' };   // the group of the picture catalog (animals, vehicles) says something to the user; the others do not
});
const uniq = (xs) => xs.filter((x, i) => xs.findIndex((y) => y.what === x.what && y.part === x.part) === i);
const sourceName = (r) => uniq(sources(r));

// ---------------------------------------------------------------- operations
function whatSentence(r) {
  const name = r.name, th = r.th, sense = th?.senses?.[0], cs = th?.commonsense;
  let t;
  if (sense) { const g = firstClause(sense.gloss); t = /^(?:a|an|the)\s/i.test(g) ? `${cap(name)} is ${g}.` : `${cap(an(name))}: ${g}.`; }
  else if (cs) t = `${cap(an(name))} is ${cs.size?.[0] && cs.size[0] !== 'medium' ? `${cs.size[0]}, ` : ''}${cs.used_for?.[0] ? `used for ${cs.used_for[0]}` : 'a thing I know'}.`;
  else { const ns = partNames(r.parts).map((p) => (p.n > 1 ? `${p.n} ${p.name}s` : an(p.name))); t = ns.length ? `I know what ${an(name)} looks like. It has ${list(ns.slice(0, 6))}.` : `I know what ${an(name)} looks like.`; }
  if (cs?.can?.length) t += ` It can ${list(cs.can)}.`;
  return t;
}

/** What is X / what does X look like: the sentence and a drawing of X. */
export function look(ctx, { o } = {}) {
  if (/^(?:parts|pieces)$/.test(clean(o)) && current(ctx)) return parts(ctx, { o: current(ctx) });   // "and its parts?" is read as an ellipsis of the last question: the parts of the topic
  const subject = subj(ctx, o);
  if (!subject) return no("missing", NO_TOPIC);
  const r = lookup(ctx, subject);
  if (!r) return dontKnow(ctx, false);
  if (!r.parts.length && !r.th?.senses?.length && !r.th?.commonsense) return dontKnow(ctx, false);   // the word is only the kind of a part of something else (a ball of the snowman): nothing to say about it
  const topic = topicFor(ctx, r.name);
  const text = whatSentence(r);
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
  if (th && ctx.knowledge?.countOf) { const c = ctx.knowledge.countOf(th, p); if (c) return c; }
  const n = r.parts.filter((x) => x.name === sing || String(x.name).endsWith(`_${sing}`)).length;
  return n ? { n, from: 'parts' } : null;
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
  const text = c.from === 'gloss' ? `${cap(an(r.name))} has ${c.n} ${what}.` : `My picture of ${an(r.name)} has ${c.n} ${what}.`;
  addCard(ctx, topic, { kind: 'icons', thing: r.name, title: `${cap(what)} of ${an(r.name)}`, data: { n: c.n, label: what, from: c.from }, how: how(ctx, r, `how many ${what} ${an(r.name)} has`, `how many ${what} does ${an(r.name)} have`, `${c.n} small icons`, c.from === 'gloss' ? 'the number comes from a word sense' : 'the number is counted in my picture, so it is a picture, not a fact') }, text);
  return ok(text, { values: [c.n] });
}

function measure(ctx, name, p) {
  const nm = cap(clean(name));
  if (!p && PLANET_KM[nm]) return { label: nm, value: PLANET_KM[nm], unit: 'km across', planet: true, source: SEQ_SOURCE };
  const r = lookup(ctx, name);
  if (!r) return null;
  if (p) { const c = countOf(ctx, r, p); return c ? { label: cap(r.name), value: c.n, unit: clean(p), from: c.from, r } : { label: cap(r.name), value: null, r }; }
  const sz = r.th?.commonsense?.size?.[0];
  return SIZE_RANK[sz] ? { label: cap(r.name), value: SIZE_RANK[sz], unit: 'size', word: sz, r } : { label: cap(r.name), value: null, r };
}
/** Which is bigger / which has more P: two bars and a sentence. */
export function compare(ctx, { a, b, p } = {}) {
  const part = p ? clean(p) : '';
  const a0 = clean(a) ? a : current(ctx);
  if (!a0) return no("missing", NO_TOPIC);
  const x = measure(ctx, a0, part), y = measure(ctx, b, part);
  if (!x || !y) return dontKnow(ctx, false);
  if (!!x.planet !== !!y.planet) return no('unsupported', 'I can compare two planets with each other, or things by size. Try two planets or two animals.');
  if (x.value == null || y.value == null) {
    const miss = x.value == null ? x : y;
    return no('missing', part ? `I know ${an(miss.label.toLowerCase())}, but not how many ${part} it has.` : `I know ${an(miss.label.toLowerCase())}, but not how big it is.`);
  }
  const topics = [x, y].map((m) => topicFor(ctx, m.label));
  const big = x.value >= y.value ? x : y, small = big === x ? y : x;
  const nm = (m) => (m.planet ? m.label : an(m.label.toLowerCase()));
  let text;
  if (x.value === y.value) text = part ? `${cap(nm(x))} and ${nm(y)} have the same number of ${part}: ${x.value}.` : `${cap(nm(x))} and ${nm(y)} are the same size.`;
  else if (x.planet) text = `${big.label} is bigger than ${small.label}: about ${big.value.toLocaleString('en-US')} km across, against about ${small.value.toLocaleString('en-US')} km.`;
  else if (part) text = `${cap(nm(big))} has more ${part} than ${nm(small)}: ${big.value} against ${small.value}${[x, y].some((m) => m.from === 'parts') ? ' (counted in my pictures)' : ''}.`;
  else text = `${cap(nm(big))} is bigger than ${nm(small)}.`;
  const unit = x.planet ? 'km across' : part ? part : 'size class (small to huge)';
  const hw = { frame: part ? 'which of two things has more of a part' : 'which of two things is bigger', words: `${x.label} or ${y.label}`, things: [x.label, y.label], sources: uniq([x.r, y.r].filter(Boolean).flatMap(sourceName).concat(x.planet ? [{ what: SEQ_SOURCE, part: 'planet sizes' }] : [])), card: 'two bars with the same scale', note: x.planet ? 'planet sizes come from a small table' : part ? '' : 'the size comes from a size word of the common sense facts (small, medium, large)' };
  for (const t of topics) t.say ||= brief(text);
  addCard(ctx, topics[1], { kind: 'bars', thing: `${x.label} or ${y.label}`, title: `${x.label} and ${y.label}`, data: { bars: [{ label: x.label, value: x.value }, { label: y.label, value: y.value }], unit, big: x.value === y.value ? -1 : x === big ? 0 : 1 }, how: howOf(hw) }, text);
  return ok(text, { values: [x.value, y.value] });
}

/** The order of the months, seasons, days or planets: the sentence and a line with points. */
export function order(ctx, { s } = {}) {
  const key = seqKey(s);
  if (!key) return no("missing", NONE);
  const q = SEQ[key];
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
  if (n === undefined && seqKey(word)) return order(ctx, { s: word });   // "and the seasons?" after "what comes after March?": the whole line
  if (PRON.test(word)) {   // "and before it?": the item the last line question was about
    const last = [...ensure(ctx).cards].reverse().find((c) => c.kind === 'line' && c.data?.items);
    const at = last ? (Number.isInteger(last.data.from) ? last.data.from : last.data.mark) : -1;
    if (last && at >= 0) word = clean(last.data.items[at]);
  }
  let key = null, i = -1;
  if (n !== undefined && s) {
    key = seqKey(s); const q = SEQ[key];
    if (!q) return no("missing", NONE);
    i = Number(n) - 1;
    if (!(i >= 0 && i < q.items.length)) return no('missing', `There ${q.items.length === 1 ? 'is' : 'are'} only ${q.items.length} ${q.one}s, so there is no ${ORD[Number(n) - 1] ?? `number ${n}`} one.`);
  } else {
    for (const k of ['months', 'days', 'seasons', 'planets']) { const j = SEQ[k].items.findIndex((it) => it.toLowerCase() === word); if (j >= 0) { key = k; i = j; break; } }
    if (!key) return no('missing', `I know the order of the months, seasons, days and planets, but I don't know where ${word || 'that'} fits yet.`);
  }
  const q = SEQ[key], at = q.items[i], len = q.items.length;
  let text, mark = i;
  if (n !== undefined && s) text = `The ${ORD[i] ?? `number ${n}`} ${q.one}${key === 'planets' ? ' from the sun' : ''} is ${at}.`;
  else {
    const d = dir === 'before' ? -1 : 1;
    const j = i + d;
    if (j < 0 || j >= len) {
      if (q.cyclic) { mark = (j + len) % len; text = d > 0 ? `After ${at} comes ${q.items[mark]}, and the ${q.one}s start again.` : `Before ${at} comes ${q.items[mark]}.`; }
      else text = d > 0 ? `${at} is ${q.last}, so no planet comes after it.` : `${at} is ${q.first}, so no planet comes before it.`;
    } else { mark = j; text = d > 0 ? `${q.items[j]} comes after ${at}.` : `${q.items[j]} comes before ${at}.`; }
  }
  const topic = topicFor(ctx, key);
  addCard(ctx, topic, { kind: 'line', thing: key, title: cap(key), data: { items: q.items, cyclic: q.cyclic, mark, from: i }, how: howOf({ frame: n !== undefined ? `which ${q.one} is number ${n}` : `what comes ${dir === 'before' ? 'before' : 'after'} ${at}`, words: n !== undefined ? `${ORD[i]} ${q.one}` : at, things: [at], sources: [{ what: SEQ_SOURCE, part: key }], card: 'the line with the answer marked' }) }, text);
  return ok(text, { values: [q.items[mark]] });
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
  if (PLANET_KM[cap(rest)]) { topicFor(ctx, rest); return ok(`${cap(rest)} is about ${Number(bar?.value ?? PLANET_KM[cap(rest)]).toLocaleString('en-US')} km across.`, { values: [rest] }); }
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
  const names = action === 'talk.look' || action === 'talk.parts' || action === 'talk.count' || action === 'talk.kind' ? [args.o] : action === 'talk.change' ? [args.x] : action === 'talk.compare' ? [args.a, args.b] : [];
  return names.map(clean).filter((n) => n && n.split(' ').length <= 3 && !PLANET_KM[cap(n)]);
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
const TINTS = new Set(['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'brown', 'black', 'white', 'grey', 'gray', 'gold', 'silver', 'turquoise', 'violet']);
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
    const colour = clean(c) === 'gray' ? 'grey' : clean(c);
    if (!TINTS.has(colour)) { undone(); return no('unsupported', `I do not know the colour ${clean(c)} for a picture.`); }
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

// ---------------------------------------------------------------- cards that travel to other tabs
/** One transfer of the card (or the topic) to another tab: the other world's own operations do the work, so one undo takes it back. */
export function send(ctx, { to } = {}) {
  const s = ensure(ctx);
  const topic = s.topics.find((t) => t.id === s.current);
  if (!topic) return no('missing', 'There is nothing to send yet. Ask me about something first, for example "What does a lighthouse look like?".');
  const card = activeCard(ctx);
  const name = topic.name;
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
  if (to === 'map') {
    const r = ctx.request('geo.show', { a: name });   // the map's own undoable show: one step
    if (r.status !== 'supported') return no('unsupported', `The Map tab does not know a place called ${name}, so it cannot show it.`);
    push(ctx, { kind: 'send', to: 'map' });
    return ok(`The Map tab took it. ${r.value ?? ''}`.trim(), { values: [name, 'Map'] });
  }
  return no('unsupported', 'I can send a picture to the drawing, the diagram or the map.');
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
