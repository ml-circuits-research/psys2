// SPDX-License-Identifier: AGPL-3.0-only
// Operations of time.calendar (kids plan, ADR-011; Q18 K7, L2): the calendar and the clock as a general world. The facts are k.time's (the bundled subset generated from the
// catalog: weekdays, months with their days and seasons, seasons, durations, clock phrases, hours); the arithmetic is the library's (cycleAdd, cycleDiff round a cycle of
// k.time, statedDay for "today is Friday" inside a question, readClock / writeClock for the 12-hour clock); `today` and `now` are the host's (the machine's clock, or the
// clock a host pins with Symbol.for('psys2.now')) unless the dialogue stated them. The world's reader (`readTime`) reads a sentence whole with the names and durations of
// k.time, the numbers, prepositions and question words of w.lang.en (src/lang/en.mjs) and lang.common's lang.time.* phrase groups; a sentence it does not read whole is
// declined (`accepts`). No day, month or season is listed in this file. Browser-safe.
import { World, cycleAdd, cycleDiff, statedDay, readClock, writeClock } from '../../lib/vendor/sopworld/sopworld.mjs?v=bf1ab27553';
import { BUNDLED_TIME } from '../../lib/knowledge/bundled-time.mjs?v=69ce0cfe8d';
import { parseLine } from '../../lib/knowledge/catalog.mjs?v=0372695257';
import { en } from '../../lib/lang/en.mjs?v=8f226ecd72';

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };   // the turn's step budget (a no-op outside a turn)

export function initialState() { return { today: null, month: null, season: null, clock: null, date: null }; }

// ---------------------------------------------------------------- k.time
const UNIT_OF = { 'k.time.weekday': 'day', 'k.time.month': 'month', 'k.time.season': 'season' };
const TYPE_OF = Object.fromEntries(Object.entries(UNIT_OF).map(([t, u]) => [u, t]));
const low = (s) => String(s ?? '').toLowerCase();
const one = (f, k) => (f[k]?.[0] === undefined ? undefined : String(f[k][0]).replace(/^"|"$/g, ''));

const KT = (() => {
  const lines = [], facts = [];
  for (const [path, text] of Object.entries(BUNDLED_TIME)) {
    if (!/\/(?:calendar|clock|clock-words)\.sop$/.test(path)) continue;
    for (const line of text.split('\n')) { const w = line.charCodeAt(0) === 64 ? parseLine(line) : null; if (w) { facts.push(w); lines.push(line); } }
  }
  const world = new World();
  world.tell(lines.filter((l) => !/ core\.word /.test(l)).join('\n'));
  const members = new Map(), units = new Map(), durations = [], phrases = new Map(), named = new Map(), records = new Map();
  for (const w of facts) {
    const name = one(w.attrs, 'name');
    if (UNIT_OF[w.type] && name) { members.set(low(name), { type: w.type, unit: UNIT_OF[w.type], name }); records.set(`${w.type}|${low(name)}`, w.attrs); }
    if ((w.type === 'k.time.duration' || w.type === 'k.time.span') && name) { units.set(low(name), low(name)); if (w.type === 'k.time.duration' && (one(w.attrs, 'count') ?? one(w.attrs, 'count_about')) !== undefined) durations.push({ name: low(name), count: Number(one(w.attrs, 'count') ?? one(w.attrs, 'count_about')), about: one(w.attrs, 'count') === undefined, unit: low(one(w.attrs, 'unit')) }); }
    if (w.type === 'k.time.clock_phrase' && name) phrases.set(low(name), Number(one(w.attrs, 'minutes')));
    if (w.type === 'k.time.hour' && name && !/\d/.test(name)) named.set(low(name), Number(one(w.attrs, 'n')) * 60);
  }
  for (const w of facts) {   // the words of k.time: short forms and plurals (Mon, Mondays, Feb, fall, hours, midday)
    if (w.type !== 'core.word') continue;
    const of = one(w.attrs, 'of') ?? '', means = low(one(w.attrs, 'means'));
    for (const t of (w.attrs.text ?? []).map((x) => low(String(x).replace(/^"|"$/g, '')))) {
      if (of === 'k.time.duration.name' || of === 'k.time.span.name') units.set(t, means);
      else if (of === 'k.time.hour.name' && named.has(means)) named.set(t, named.get(means));
      else { const type = of.replace(/\.name$/, ''); if (UNIT_OF[type] && members.has(means)) members.set(t, members.get(means)); }
    }
  }
  const kinds = new Map();
  for (const [type, unit] of Object.entries(UNIT_OF)) { const noun = type.split('.').pop(); kinds.set(noun, unit === 'day' ? 'weekday' : unit); kinds.set(`${noun}s`, unit === 'day' ? 'weekday' : unit); }
  return { world, members, units, durations, phrases, named, records, kinds };
})();

const rec = (type, name) => KT.records.get(`${type}|${low(name)}`) ?? {};
const ofType = (type) => [...new Set([...KT.members.values()].filter((m) => m.type === type).map((m) => m.name))].sort((a, b) => Number(one(rec(type, a), 'n')) - Number(one(rec(type, b), 'n')));
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const join = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const plural = (n, w) => `${+Number(n).toFixed(2)} ${Number(n) === 1 ? w : w === 'century' ? 'centuries' : w === 'millennium' ? 'millennia' : `${w}s`}`;
const an = (w) => (/^[aeiou]/.test(w) && !/^(?:one|use|uni|eu)/.test(w) ? `an ${w}` : /^hour/.test(w) ? `an ${w}` : `a ${w}`);

// ---------------------------------------------------------------- the host's today and now
const hostNow = () => { try { return globalThis[Symbol.for('psys2.now')]?.() ?? new Date(); } catch { return new Date(); } };
const hostDay = () => ofType('k.time.weekday').find((d) => Number(one(rec('k.time.weekday', d), 'n')) === (hostNow().getDay() || 7));
const hostMonth = () => ofType('k.time.month').find((m) => Number(one(rec('k.time.month', m), 'n')) === hostNow().getMonth() + 1);
const hostClock = () => { const d = hostNow(); return d.getHours() * 60 + d.getMinutes(); };
const todayOf = (st) => st?.today ?? hostDay();
const monthOf = (st) => st?.month ?? hostMonth();
const clockOf = (st) => (st?.clock ?? null) ?? hostClock();
const clockSays = (m) => writeClock(m);
const hostClockSays = (m) => (m % 60 === 0 || m % 15 === 0 ? writeClock(m) : writeClock(m, { ampm: true }));

// ---------------------------------------------------------------- the words of the reader
/** The words the reader reads, from the language data: lang.common's lang.time.* groups (through `phrase`, the interpreter's or the formalizer's), w.lang.en's numbers,
 *  function words, prepositions of time and question words, the lead and tail fillers of lang.common. Memoized per source. */
const WORDS = new WeakMap();
function wordsOf(phrase) {
  const key = typeof phrase === 'function' ? phrase : wordsOf;
  if (WORDS.has(key)) return WORDS.get(key);
  const ph = (id) => { try { return (phrase?.(id) ?? []).map((a) => low(Array.isArray(a) ? a.join(' ') : a).replace(/_/g, ' ')); } catch { return []; } };
  const tags = new Map();   // phrase (one or more words) -> tag
  const put = (w, tag) => { if (w && !tags.has(w)) tags.set(w, tag); };
  for (const [g, tag] of [['overmorrow', 'd+2'], ['ereyesterday', 'd-2'], ['today', 'd0'], ['tomorrow', 'd+1'], ['yesterday', 'd-1'], ['later', 'later'], ['earlier', 'earlier'], ['until', 'until'], ['count', 'count'], ['list', 'list'], ['clock', 'clock']]) for (const w of ph(`lang.time.${g}`)) put(w, tag);
  const glue = new Set();
  for (const c of ['det', 'aux', 'prep', 'wh']) for (const w of (() => { try { return [...en.words(c)]; } catch { return []; } })()) { budget.tick('time.words'); glue.add(low(w).replace(/_/g, ' ')); }
  for (const w of Object.keys((() => { try { return en.refers('session.agent'); } catch { return {}; } })())) { budget.tick('time.words'); glue.add(w); }
  for (const g of ['lang.lead.filler', 'lang.tail.filler', 'lang.lead.polite', 'lang.time.glue']) for (const p of ph(g)) for (const w of p.split(' ')) glue.add(w);
  for (const w of [...glue]) { const r = (() => { try { return en.timeRelation(w); } catch { return null; } })(); if (r?.rel === 'after') put(w, 'later'); else if (r?.rel === 'before') put(w, 'earlier'); else if (r?.rel === 'until') put(w, 'until'); }
  const numbers = (() => { try { return en.numerals(); } catch { return {}; } })();
  const out = { tags, glue, numbers, max: Math.max(1, ...[...tags.keys(), ...KT.units.keys(), ...KT.phrases.keys(), ...KT.members.keys(), ...KT.named.keys()].map((k) => k.split(' ').length)) };
  WORDS.set(key, out);
  return out;
}

/** The tokens of a sentence, each with what it is: { w, kind: member|unit|num|clockphrase|named|oclock|ampm|hm|tag|glue|other, ... }. Longest phrase first. */
function tokensOf(text, W) {
  const raw = low(text).replace(/o\s*'?\s*clock\b/g, "o'clock").replace(/(\d)\s*(am|pm|a\.m\.|p\.m\.)/g, '$1 $2').replace(/'s\b/g, ' is').match(/\d{1,2}:\d{2}|-?\d+(?:\.\d+)?|[\p{L}']+/gu) ?? [];
  const toks = [];
  for (let i = 0; i < raw.length;) {
    budget.tick('time.tokens');
    let hit = null;
    for (let n = Math.min(W.max, raw.length - i); n >= 1 && !hit; n--) {
      const p = raw.slice(i, i + n).join(' ');
      if (KT.phrases.has(p) && p !== "o'clock") hit = { n, kind: 'clockphrase', minutes: KT.phrases.get(p) };
      else if (KT.members.has(p)) hit = { n, kind: 'member', ...KT.members.get(p) };
      else if (KT.named.has(p)) hit = { n, kind: 'named', minutes: KT.named.get(p) };
      else if (KT.units.has(p)) hit = { n, kind: 'unit', unit: KT.units.get(p) };
      else if (KT.kinds.has(p)) hit = { n, kind: 'unit', unit: KT.kinds.get(p), noun: true };
      else if (W.tags.has(p)) hit = { n, kind: 'tag', tag: W.tags.get(p) };
      else if (n === 1 && p === "o'clock") hit = { n, kind: 'oclock' };
      else if (n === 1 && /^(?:am|pm|a\.m\.|p\.m\.)$/.test(p)) hit = { n, kind: 'ampm', pm: p.startsWith('p') };
      else if (n === 1 && /^\d{1,2}:\d{2}$/.test(p)) hit = { n, kind: 'hm', minutes: Number(p.split(':')[0]) * 60 + Number(p.split(':')[1]) };
      else if (n === 1 && /^-?\d+(?:\.\d+)?$/.test(p)) hit = { n, kind: 'num', value: Number(p) };
      else if (n === 1 && W.numbers[p] !== undefined) hit = { n, kind: 'num', value: W.numbers[p] };
      else if (n === 1 && W.glue.has(p)) hit = { n, kind: 'glue' };
    }
    hit ??= { n: 1, kind: 'other' };
    toks.push({ w: raw.slice(i, i + hit.n).join(' '), ...hit });
    i += hit.n;
  }
  // "a"/"an"/"one" before a unit is 1 ("in an hour", "a day")
  for (let i = 0; i + 1 < toks.length; i++) if (toks[i].kind === 'glue' && /^(?:a|an)$/.test(toks[i].w) && toks[i + 1].kind === 'unit') Object.assign(toks[i], { kind: 'num', value: 1, article: true });
  return toks;
}

/** The clock values of a sentence: [{ at, minutes, hour }] ("3 o'clock", "half past 3", "3:30", "5 pm", "noon"); a phrase of k.time with an hour after it, an hour with o'clock / am / pm after it. */
function clocksOf(toks) {
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    budget.tick('time.clocks');
    const t = toks[i], n = toks[i + 1];
    if (t.kind === 'clockphrase' && n?.kind === 'num') { const h = n.value; out.push({ at: i, end: i + 1, hour: h, minutes: readClock(`${t.w.replace(/^a /, '')} ${h}`) ?? ((h % 12) * 60 + t.minutes), text: `${t.w} ${h}` }); i++; }
    else if (t.kind === 'num' && (n?.kind === 'oclock' || n?.kind === 'ampm')) { const pm = n.kind === 'ampm' && n.pm; out.push({ at: i, end: i + 1, hour: t.value, minutes: readClock(`${t.value} ${n.kind === 'ampm' ? (pm ? 'pm' : 'am') : "o'clock"}`), text: `${t.value} ${n.w}` }); i++; }
    else if (t.kind === 'hm') out.push({ at: i, end: i, hour: Math.floor(t.minutes / 60), minutes: readClock(t.w), text: t.w });
    else if (t.kind === 'named') out.push({ at: i, end: i, hour: t.minutes / 60, minutes: t.minutes, text: t.w });
  }
  return out;
}

const minutesOf = (unit) => ({ minute: 1, hour: 60, 'half an hour': 30, 'half hour': 30, 'a quarter of an hour': 15, 'quarter of an hour': 15, 'quarter hour': 15, 'an hour and a half': 90, 'hour and a half': 90 }[unit] ?? convert(1, unit, 'minute')?.value ?? null);

/** n `from` in `to` by the durations of k.time (a path of `count` facts; `about` when a step is only about). */
function convert(n, from, to) {
  if (from === to) return { value: n, about: false };
  const edges = [];
  for (const d of KT.durations) { edges.push({ a: d.name, b: d.unit, k: d.count, about: d.about }); edges.push({ a: d.unit, b: d.name, k: 1 / d.count, about: d.about }); }
  const direct = edges.find((e) => e.a === from && e.b === to && e.k >= 1) ?? edges.find((e) => e.a === from && e.b === to);   // a fact of k.time that says it first
  if (direct) return { value: +(n * direct.k).toFixed(4), about: direct.about };
  for (const exactOnly of [true, false]) {
    const seen = new Map([[from, { k: 1, about: false }]]), queue = [from];
    while (queue.length) {
      budget.tick('time.convert');
      const x = queue.shift(), at = seen.get(x);
      for (const e of edges) if (e.a === x && !seen.has(e.b) && (!exactOnly || !e.about)) { seen.set(e.b, { k: at.k * e.k, about: at.about || e.about }); queue.push(e.b); }
    }
    if (seen.has(to)) { const s = seen.get(to); return { value: +(n * s.k).toFixed(4), about: s.about }; }
  }
  return null;
}

/**
 * Reads a sentence about the calendar or the clock whole: { kind, ... } or null when a word is left unread or the sentence asks nothing this world answers.
 * kinds: set (a statement of today, the month, the season or the clock), now (what day / month / time it is), shift (n units after / before a member or today), diff
 * (days between two days), season (the season of a month), members (the months of a season, the weekend, the days of the week, the months, the seasons), length (the days
 * of a month), convert (units in units), clockShift, clockDiff. `given` holds what the sentence itself states ("if today is Friday", "if it is 3 o'clock").
 */
export function readTime(text, opts = {}) {
  const given = {};
  const r = readInner(text, opts, given);
  return r ? { ...r, given: { ...given, ...(r.given ?? {}) } } : null;
}

function readInner(text, { phrase, state } = {}, given) {
  const W = wordsOf(phrase);
  const toks = tokensOf(text, W);
  if (toks.some((t) => t.kind === 'other')) return null;
  const has = (tag) => toks.some((t) => t.kind === 'tag' && t.tag === tag);
  const words = toks.map((t) => t.w);
  const members = toks.map((t, i) => ({ ...t, i })).filter((t) => t.kind === 'member');
  const units = toks.map((t, i) => ({ ...t, i })).filter((t) => t.kind === 'unit');
  const clocks = clocksOf(toks);
  const inClock = new Set(clocks.flatMap((c) => Array.from({ length: c.end - c.at + 1 }, (_, k) => c.at + k)));
  const nums = toks.map((t, i) => ({ ...t, i })).filter((t) => t.kind === 'num' && !inClock.has(t.i) && !t.article);
  const deictics = toks.filter((t) => t.kind === 'tag' && /^d[+-]?\d$/.test(t.tag));
  let deictic = deictics.find((t) => t.tag !== 'd0') ?? deictics[0];
  let dOff = deictic ? Number(deictic.tag.slice(1)) : null;
  const question = /\?\s*$/.test(String(text)) || toks.some((t) => ['count', 'list', 'later', 'earlier', 'until'].includes(t.tag) || (t.kind === 'glue' && /^(?:what|which|whats|when|how|who)$/.test(t.w)));
  const sign = has('earlier') ? -1 : 1;
  // a day stated inside the sentence ("if today is Friday", "today is Friday, what day is tomorrow"): the library's statedDay, kept only when the day is next to the word of today
  const todayWords = toks.filter((t) => t.tag === 'd0').map((t) => t.w);
  const stated = todayWords.length ? statedDay(KT.world, words.join(' '), { type: 'k.time.weekday', today: todayWords }) : null;
  const statedAt = stated ? members.find((m) => m.name === stated) : null;
  if (statedAt && toks.slice(Math.max(0, statedAt.i - 3), statedAt.i + 2).some((t) => t.tag === 'd0') && (question ? toks.slice(Math.max(0, statedAt.i - 3), statedAt.i).some((t) => t.w === 'is' || t.w === 'its' || t.w === "it's") || toks[statedAt.i + 1]?.tag === 'd0' : true)) given.today = stated;
  let statedIf = null;
  if (!given.today) for (const m of members) if (m.unit === 'day' && /^(?:is|its|it's)$/.test(toks[m.i - 1]?.w ?? '') && toks.slice(Math.max(0, m.i - 3), m.i).some((t) => t.w === 'if' || t.w === 'when')) { given.today = m.name; statedIf = m; }
  if (given.today && deictic?.tag === 'd0' && statedAt && deictics.length === 1 && (nums.length || has('later') || has('earlier'))) { deictic = null; dOff = null; }
  const rest = members.filter((m) => !(given.today && (m === statedAt || m === statedIf)));
  // a month stated inside the sentence ("if this month is May", "if its march")
  const stateWord = (i) => toks.slice(Math.max(0, i - 2), i).some((t) => /^(?:is|its|it's|in)$/.test(t.w)) && toks.slice(0, i).some((t) => t.w === 'if' || t.w === 'when' || t.w === 'this');
  const statedMonth = rest.find((m) => m.unit === 'month' && question && stateWord(m.i) && (has('later') || has('earlier') || units.length));
  if (statedMonth) given.month = statedMonth.name;
  const targets = rest.filter((m) => m !== statedMonth);
  const n = nums[0]?.value;
  const unitWord = (u) => units.find((x) => x.unit === u);

  // ---- statements (no question): today, the month, the season, the clock
  if (!question) {
    if (clocks.length === 1 && !targets.length && !units.length) return { kind: 'set', attribute: 'time', minutes: clocks[0].minutes, hour: clocks[0].hour, text: clocks[0].text };
    if (targets.length === 1 && !nums.length && !units.length && !clocks.length) {
      const m = targets[0];
      if (m.unit === 'day' && (deictic?.tag === 'd0' || toks.some((t) => /^(?:we|it|its|is)$/.test(t.w)))) return { kind: 'set', attribute: 'weekday', value: m.name };
      if (m.unit === 'month' && toks.some((t) => /^(?:we|it|its|is|this)$/.test(t.w))) return { kind: 'set', attribute: 'month', value: m.name };
      if (m.unit === 'season' && toks.some((t) => /^(?:we|it|its|is)$/.test(t.w))) return { kind: 'set', attribute: 'season', value: m.name };
    }
    if (given.today && !targets.length && !deictic?.tag?.match(/[+-]/)) return { kind: 'set', attribute: 'weekday', value: given.today };
  }

  // ---- the clock
  const timeWord = has('clock');
  const clockUnits = units.filter((u) => minutesOf(u.unit) !== null && minutesOf(u.unit) < 1440);
  if (clocks.length || (timeWord && !targets.length && !deictic)) {
    const lead = clocks.length >= 2 ? null : clocks[0];
    if (clocks.length >= 2 && (has('until') || has('count') || unitWord('hour'))) {
      const isStart = (c) => /^(?:is|its|it's)$/.test(toks[c.at - 1]?.w ?? '') && toks.slice(Math.max(0, c.at - 3), c.at).some((t) => t.w === 'if' || t.w === 'when');
      const [a, b] = isStart(clocks[1]) && !isStart(clocks[0]) ? [clocks[1], clocks[0]] : [clocks[0], clocks[1]];
      return { kind: 'clockDiff', a, b, unit: clockUnits[0]?.unit ?? 'hour' };
    }
    // a clock value and a number of hours: "if it is 5 o'clock, what time was it 2 hours ago", "what time is half an hour after 3 o'clock"
    const delta = clockUnits.length ? clockUnits.reduce((s, u) => s + (nums.find((x) => x.i === u.i - 1)?.value ?? (toks[u.i - 1]?.article ? 1 : u.unit.includes(' ') ? 1 : n ?? 1)) * minutesOf(u.unit), 0) : null;
    if (delta !== null && (has('later') || has('earlier') || toks.some((t) => t.w === 'in'))) return { kind: 'clockShift', from: lead?.minutes ?? null, fromText: lead?.text ?? null, delta: delta * sign };
    if (!clocks.length && timeWord && !units.length && !nums.length) return { kind: 'now', topic: 'time' };
    if (clocks.length === 1 && !units.length && !nums.length && timeWord) return { kind: 'set+now', minutes: clocks[0].minutes, hour: clocks[0].hour, text: clocks[0].text };
    // "count the hours between 2 and 6", "how many hours from 3 to 7": two hours of the clock said as numbers
    if (unitWord('hour') && nums.length >= 2 && has('until')) return { kind: 'clockDiff', a: { minutes: nums[0].value * 60, text: `${nums[0].value} o'clock` }, b: { minutes: nums[1].value * 60, text: `${nums[1].value} o'clock` }, unit: 'hour' };
    if (!clocks.length) { /* fall through: a question with the word time and a unit is no clock reading */ } else return null;
  }
  if (unitWord('hour') && nums.length >= 2 && has('until') && !targets.length) return { kind: 'clockDiff', a: { minutes: nums[0].value * 60, text: `${nums[0].value} o'clock` }, b: { minutes: nums[1].value * 60, text: `${nums[1].value} o'clock` }, unit: 'hour' };

  // ---- members of a span or a cycle
  const seasonT = targets.find((m) => m.unit === 'season');
  const monthT = targets.find((m) => m.unit === 'month');
  if (unitWord('weekend') && !targets.length) return { kind: 'members', of: 'weekend' };
  if (seasonT && targets.length === 1 && unitWord('month') && !nums.length) return { kind: 'members', of: 'season', season: seasonT.name };
  if (monthT && targets.length === 1 && units.some((u) => u.w.startsWith('season')) && !nums.length) return { kind: 'season', month: monthT.name };
  const sizeOnly = nums.length === 1 && Object.keys(TYPE_OF).some((u) => ofType(TYPE_OF[u]).length === nums[0].value) && !has('count') && !has('later') && !has('earlier');
  if (!targets.length && (!nums.length || sizeOnly) && !deictic && units.length && (has('list') || question || sizeOnly || units.length === 1)) {
    const u = units.map((x) => x.unit), w = units.map((x) => x.w);
    if (u.includes('day') && u.includes('week') && !has('count')) return { kind: 'members', of: 'week' };
    if (u.length === 1 && u[0] === 'weekday' && w[0].endsWith('s') && !has('count')) return { kind: 'members', of: 'weekdays' };
    if (w.includes('months') && u.includes('year') && !has('count')) return { kind: 'members', of: 'year' };
    if (w.includes('seasons') && !has('count') && units.length <= 2) return { kind: 'members', of: 'seasons' };
  }
  // ---- the days of a month ("how many days has April", "days in june?", "is june 30 days")
  if (monthT && targets.length === 1 && unitWord('day') && !has('later') && !has('earlier') && !(has('until') && !toks.some((t) => t.w === 'in'))) return { kind: 'length', month: monthT.name };
  if (monthT && targets.length === 1 && units.length === 0 && has('count')) return { kind: 'length', month: monthT.name };
  // ---- units in units ("how many minutes are in an hour", "how many hours in two days", "2 weeks = how many days")
  if (!targets.length && !deictic && new Set(units.map((u) => u.unit)).size >= 2 && !has('later') && !has('earlier') && (has('count') || toks.some((t) => t.w === 'in' || t.w === 'make' || t.w === 'does' || t.w === 'have'))) {
    // the unit asked for is the one after the count word (or the first one); the other is the span, with its number
    const ci = toks.findIndex((t) => t.tag === 'count');
    const asked = units.find((u) => u.i > ci && ci >= 0 && !nums.some((x) => x.i === u.i - 1)) ?? units.find((u) => !nums.some((x) => x.i === u.i - 1)) ?? units[0];
    const span = units.find((u) => u !== asked);
    const k = nums.find((x) => x.i === span.i - 1)?.value ?? 1;
    return { kind: 'convert', n: k, from: span.unit, to: asked.unit };
  }
  // ---- days between ("how many days until Saturday", "from Monday to Friday", "Friday is how many days away")
  const dayT = targets.filter((m) => m.unit === 'day');
  if (dayT.length && !(nums.length && !has('count')) && (has('until') || has('count')) && !has('later') && !has('earlier') && targets.length === dayT.length && dayT.length <= 2) return { kind: 'diff', from: dayT.length === 2 ? dayT[0].name : null, to: dayT.at(-1).name };
  // ---- a shift round a cycle ("what day comes after Monday", "3 days after Friday", "what day will it be in 3 days", "what day was yesterday", "what month is next month")
  const target = targets[0];
  if (targets.length <= 1 && (has('later') || has('earlier') || deictic || (has('until') && nums.length && targets.length === 1) || toks.some((t) => t.w === 'in') && nums.length)) {
    const unit = units.map((u) => (u.unit === 'weekday' ? 'day' : u.unit)).find((u) => ['day', 'month', 'season'].includes(u)) ?? target?.unit ?? (given.month ? 'month' : 'day');
    if (!['day', 'month', 'season'].includes(unit)) return null;
    if (target && target.unit !== unit) return null;
    if (target && has('until') && !has('later') && !has('earlier') && nums.length) return { kind: 'shift', unit, from: target.name, by: n };
    const steps = (n ?? 1) * (has('later') || has('earlier') ? sign : 1);
    if (target) return { kind: 'shift', unit, from: target.name, by: steps, given };
    if (deictic && unit === 'day') return { kind: 'shift', unit, from: null, by: dOff + (has('later') || has('earlier') ? (n ?? 1) * sign * (nums.length || /after|before/.test(words.join(' ')) && deictic.tag !== 'd0' ? 1 : 0) : 0), now: true, deictic: deictic.tag, given };
    if (toks.some((t) => t.w === 'in') && n !== undefined) return { kind: 'shift', unit, from: null, by: n * sign, now: true, given };
    if (unit === 'month' && (has('later') || has('earlier'))) return { kind: 'shift', unit, from: null, by: steps, now: true, given };
    if (unit === 'day' && nums.length && has('earlier')) return { kind: 'shift', unit, from: null, by: steps, now: true, given };
    return null;
  }
  // ---- what day / month it is
  if (deictic?.tag === 'd0' && unitWord('day') && !targets.length && !nums.length) return { kind: 'now', topic: 'weekday', given };
  if (!targets.length && units.length === 1 && units[0].unit === 'month' && toks.some((t) => t.w === 'it' || t.w === 'this')) return { kind: 'now', topic: 'month' };
  return null;
}

// ---------------------------------------------------------------- what the reader's result says
const NOW_DAY = { 0: 'Today is', 1: 'Tomorrow is', '-1': 'Yesterday was', 2: 'The day after tomorrow is', '-2': 'The day before yesterday was' };
const NOW_MONTH = { 0: 'This month is', 1: 'Next month is', '-1': 'Last month was' };
function shiftSays(unit, from, by, now) {
  if (now) {
    if (unit === 'day' && NOW_DAY[String(by)]) return NOW_DAY[String(by)];
    if (unit === 'month' && NOW_MONTH[String(by)]) return NOW_MONTH[String(by)];
    return by > 0 ? `In ${plural(by, unit)} it will be` : `${plural(-by, unit)} ago it was`;
  }
  const f = unit === 'season' ? from : cap(from);
  if (by === 1) return `The ${unit} after ${f} is`;
  if (by === -1) return `The ${unit} before ${f} is`;
  return `${plural(Math.abs(by), unit)} ${by > 0 ? 'after' : 'before'} ${f} is`;
}

function answer(ctx, r) {
  const st = ctx.state;
  for (const [k, v] of Object.entries(r.given ?? {})) st[k] = v;
  switch (r.kind) {
    case 'set': return setOf(st, r);
    case 'set+now': st.clock = r.minutes; return { status: 'supported', value: `It is ${clockSays(r.minutes)}.` };
    case 'now': return nowOf(st, r.topic);
    case 'shift': {
      const base = r.from ?? (r.unit === 'day' ? todayOf(st) : r.unit === 'month' ? monthOf(st) : st.season);
      if (!base) return { status: 'missing', note: `I need to know what ${r.unit} it is now. Please tell me, for example: It is spring.` };
      const to = cycleAdd(KT.world, base, r.by, { type: TYPE_OF[r.unit] });
      if (!to) return { status: 'unsupported', note: `I do not know ${base}.` };
      const said = r.unit === 'season' ? to : cap(to);
      const hostToday = r.now && r.unit === 'day' && !st.today;
      return { status: 'supported', value: `${shiftSays(r.unit, base, r.by, r.now)} ${said}.${hostToday ? ` (Today is ${base}.)` : ''}`, answer: to };
    }
    case 'diff': {
      const from = r.from ?? todayOf(st), named = r.from || r.given?.today;
      const d = cycleDiff(KT.world, from, r.to, { type: 'k.time.weekday' });
      if (d === null) return { status: 'unsupported', note: 'I only count days of the week.' };
      return { status: 'supported', value: named ? `From ${from} to ${r.to} is ${plural(d, 'day')}.` : `From today (${from}) to ${r.to} is ${plural(d, 'day')}.`, answer: d };
    }
    case 'season': {
      const s = one(rec('k.time.month', r.month), 'season_north');
      return { status: 'supported', value: `${r.month} is in ${s}.`, answer: s };
    }
    case 'members': {
      if (r.of === 'weekend') { const d = ofType('k.time.weekday').filter((x) => one(rec('k.time.weekday', x), 'weekend') === 'true'); return { status: 'supported', value: `The weekend days are ${join(d)}.` }; }
      if (r.of === 'weekdays') { const d = ofType('k.time.weekday').filter((x) => one(rec('k.time.weekday', x), 'weekend') !== 'true'); return { status: 'supported', value: `The weekdays are ${join(d)}.` }; }
      if (r.of === 'week') return { status: 'supported', value: `The days of the week are ${join(ofType('k.time.weekday'))}.` };
      if (r.of === 'year') return { status: 'supported', value: `The months of the year are ${join(ofType('k.time.month'))}.` };
      if (r.of === 'seasons') return { status: 'supported', value: `The seasons are ${join(ofType('k.time.season'))}.` };
      const ms = ofType('k.time.month').filter((m) => one(rec('k.time.month', m), 'season_north') === r.season);
      return { status: 'supported', value: `The ${r.season} months are ${join(ms)}.` };
    }
    case 'length': {
      const f = rec('k.time.month', r.month), days = Number(one(f, 'days')), leap = one(f, 'leap_days');
      return { status: 'supported', value: `There are ${days} days in ${r.month}${leap ? `, or ${leap} in a leap year` : ''}.`, answer: days };
    }
    case 'convert': {
      const span = r.n === 1 ? an(r.from) : plural(r.n, r.from);
      if (r.from === 'month' && r.to === 'day') { const ds = ofType('k.time.month').map((m) => Number(one(rec('k.time.month', m), 'days'))); return { status: 'supported', value: `A month has ${Math.min(...ds)} to ${Math.max(...ds)} days.` }; }
      const common = KT.units.has(`common ${r.from}`) ? convert(r.n, `common ${r.from}`, r.to) : null, leap = KT.units.has(`leap ${r.from}`) ? convert(r.n, `leap ${r.from}`, r.to) : null;
      if (common && !common.about && leap && !leap.about && r.n === 1 && common.value !== leap.value) return { status: 'supported', value: `There are ${plural(common.value, r.to)} in ${span}, or ${leap.value} in a leap ${r.from}.`, answer: common.value };
      const c = convert(r.n, r.from, r.to);
      if (!c) return { status: 'unsupported', note: `I cannot count ${r.to}s in ${span}.` };
      return { status: 'supported', value: `There are ${c.about ? 'about ' : ''}${plural(c.value, r.to)} in ${span}.`, answer: c.value };
    }
    case 'clockShift': {
      const told = r.from ?? st.clock;
      const base = told ?? hostClock();
      const m = base + r.delta;
      return { status: 'supported', value: `It ${r.delta >= 0 ? 'will be' : 'was'} ${told !== null && told !== undefined ? clockSays(m) : hostClockSays(m)}.`, answer: m };
    }
    case 'clockDiff': {
      let d = (r.b.minutes - r.a.minutes) / 60;
      if (d < 0) d += 12;
      return { status: 'supported', value: `It is ${plural(d, 'hour')} from ${r.a.text.replace(/oclock|o clock/, "o'clock")} to ${r.b.text.replace(/oclock|o clock/, "o'clock")}.`, answer: d };
    }
    default: return { status: 'unsupported', note: 'I could not read that as a question about the calendar or the clock.' };
  }
}

function setOf(st, { attribute, value, minutes, hour, text }) {
  if (attribute === 'time') {
    if (minutes === null || minutes === undefined || !(hour >= 0 && hour <= 24)) return { status: 'conflicting', note: `That is not an hour on a clock: ${text}.` };
    st.clock = minutes;
    return { status: 'supported', value: `OK, it is ${clockSays(minutes)}.` };
  }
  if (attribute === 'weekday') { st.today = value; return { status: 'supported', value: `OK, today is ${value}.` }; }
  if (attribute === 'month') { st.month = value; return { status: 'supported', value: `OK, this month is ${value}.` }; }
  if (attribute === 'season') { st.season = value; return { status: 'supported', value: `OK, it is ${value}.` }; }
  return { status: 'unsupported', note: 'I keep only the day, the month, the season and the time.' };
}

function nowOf(st, topic) {
  if (topic === 'weekday') return { status: 'supported', value: `Today is ${todayOf(st)}.`, answer: todayOf(st) };
  if (topic === 'month') return { status: 'supported', value: `It is ${monthOf(st)}.`, answer: monthOf(st) };
  if (topic === 'time') return st.clock !== null && st.clock !== undefined ? { status: 'supported', value: `It is ${clockSays(st.clock)}.` } : { status: 'supported', value: `It is ${hostClockSays(hostClock())}.`, assumptions: ['the clock of this device'] };
  if (topic === 'date') { const d = hostNow(); return st.date ? { status: 'supported', value: `Today is ${st.date.month} ${st.date.day}.` } : { status: 'supported', value: `Today is ${hostMonth()} ${d.getDate()}.` }; }
  return { status: 'unsupported', note: 'I do not know that.' };
}

// ---------------------------------------------------------------- operations
/** time.set (the catalog's statement frames, K7): today's weekday, the date, the month, the season, the clock (a phrase, an hour, minutes). */
export function set(ctx, { attribute, value, day, month, phrase, hour, minutes, text } = {}) {
  const st = ctx.state;
  const name = (v, type) => KT.members.get(low(v))?.type === type ? KT.members.get(low(v)).name : null;
  if (attribute === 'weekday') { const v = name(value, 'k.time.weekday'); return v ? setOf(st, { attribute, value: v }) : { status: 'unsupported', note: `${value} is not a day of the week.` }; }
  if (attribute === 'month') { const v = name(value, 'k.time.month'); return v ? setOf(st, { attribute, value: v }) : { status: 'unsupported', note: `${value} is not a month.` }; }
  if (attribute === 'season') { const v = name(value, 'k.time.season'); return v ? setOf(st, { attribute, value: v }) : { status: 'unsupported', note: `${value} is not a season.` }; }
  if (attribute === 'date') { const m = name(month, 'k.time.month'), d = parseInt(String(day), 10); if (!m || !(d >= 1 && d <= Number(one(rec('k.time.month', m), 'leap_days') ?? one(rec('k.time.month', m), 'days')))) return { status: 'conflicting', note: `There is no day ${day} in ${month}.` }; st.date = { day: d, month: m }; st.month = m; return { status: 'supported', value: `OK, today is ${m} ${d}.` }; }
  if (attribute === 'time') {
    const named = KT.named.get(low(hour));
    const num = (v) => (v === undefined || v === '' ? NaN : Number.isFinite(Number(v)) ? Number(v) : (() => { try { return en.numerals()[low(v)]; } catch { return undefined; } })() ?? NaN);
    const h = named !== undefined ? named / 60 : num(hour);
    hour = Number.isFinite(h) && named === undefined ? h : hour;
    const said = `${phrase ? `${phrase} ` : ''}${hour}${minutes ? ` ${minutes}` : ''}${phrase || named !== undefined ? '' : " o'clock"}`;
    if (!Number.isFinite(h) || h < 0 || h > 24 || (phrase && h > 12) || (minutes !== undefined && minutes !== '' && !(Number(minutes) >= 0 && Number(minutes) < 60))) return { status: 'conflicting', note: `That is not an hour on a clock: ${said}.` };
    const m = phrase ? readClock(`${String(phrase).replace(/^a /, '')} ${h}`) : named !== undefined ? named : (h % 24) * 60 + (Number(minutes) || 0);
    return setOf(st, { attribute, minutes: m, hour: h, text: said });
  }
  return { status: 'unsupported', note: 'I keep only the day, the month, the season and the time.' };
}

/** time.ask (the catalog's question frames, K7): what day, date, month or time it is. */
export function ask(ctx, { topic } = {}) { return nowOf(ctx.state, topic); }

/** time.read: the world's own reader (patterns above the GENERATED marker). */
export function read(ctx, { text } = {}) {
  const r = readTime(text, { phrase: ctx.lang?.phrase ?? null, state: ctx.state });
  if (!r) return { status: 'unsupported', note: `I could not read "${text}" as a question about the calendar or the clock.` };
  return answer(ctx, r);
}

/** DECLINE (spec 21): the reader patterns own a sentence only when readTime reads it whole. */
export function accepts({ action, text, state, phrase } = {}) {
  if (action !== 'time.read') return true;
  return readTime(text, { phrase, state }) ? true : false;
}

/** The world's own reader reads the clause whole (spec 16 section 13). */
export const executor = { readsWhole: ({ text, state, phrase } = {}) => !!readTime(text, { phrase, state }) };
