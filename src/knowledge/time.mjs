// SPDX-License-Identifier: AGPL-3.0-only
/**
 * One reader of the calendar and the clock for every world and the dialog tier: the months, weekdays, seasons, parts of the day and clock hours of the knowledge world `k.time` (version 2:
 * every one has a `cycle`, a position `n` and a cyclic successor `next`; a month has its season in each hemisphere; an hour has its part of the day). Nothing here knows a month or a day:
 * a word is looked up (its name and the `core.word` facts of the world: short forms, plurals, `fall`, `midday`), two moments are compared by the positions the catalog gives (the one rule of
 * `k.time.order`: of two times of one cycle the smaller position is earlier; "after" is "before" read backwards).
 * Browser-safe: no `node:*`; synchronous reads (an operation must not wait), seeded from the bundled subset (bundled-time.mjs, generated from the catalog) so a first visit with no network answers
 * the same; `loadTime(facts)` replaces the seed with the catalog when it is reachable (the host calls it when the knowledge is attached).
 *
 *   timeReadings(phrase)                    what a phrase names: [{ kind, type, name, cycle, pos, rec }] (kinds: day, month, season, part, clock); several for "3 o'clock" (3 am, 3 pm); [] for anything else
 *   compareTimes(a, b, rel, { hemisphere }) "Monday" "Friday" "before" -> { answer: 'yes' | 'no' | 'unknown', text, kinds }, or null when a phrase is no time (the question is somebody else's)
 *   timePosition(name)                      { cycle, n } of a name of k.time (the timeline sorts its moments by it), or null
 *   timeKinds()                             the kinds of time this reader knows
 */
import { parseLine } from './catalog.mjs';
import { BUNDLED_TIME } from './bundled-time.mjs';

const lc = (s) => String(s ?? '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
const KINDS = { 'k.time.weekday': 'day', 'k.time.month': 'month', 'k.time.season': 'season', 'k.time.part_of_day': 'part', 'k.time.hour': 'clock' };
const KIND_WORDS = { day: 'days', month: 'months', season: 'seasons', part: 'parts of the day', clock: 'hours' };
const state = { names: new Map(), cycles: new Map(), hours: [], from: 'none', loading: null };
const first = (r, k) => r.f[k]?.[0];

function absorb(wires) {
  const names = new Map(), cycles = new Map(), hours = [];
  const add = (key, rec) => { const k = lc(key); if (k) (names.get(k) ?? names.set(k, []).get(k)).push(rec); };
  const recs = new Map();
  for (const w of wires) {
    const kind = KINDS[w.type];
    if (kind && first(w, 'name') != null && first(w, 'n') != null) {
      const rec = { kind, type: w.type, name: String(first(w, 'name')), cycle: first(w, 'cycle'), n: Number(first(w, 'n')), next: first(w, 'next'), f: w.f };
      recs.set(`${w.type}|${lc(rec.name)}`, rec); add(rec.name, rec);
      if (kind === 'clock') hours.push(rec);
    } else if (w.type === 'k.time.cycle' && first(w, 'name')) cycles.set(first(w, 'name'), { name: first(w, 'name'), first: first(w, 'first'), last: first(w, 'last'), length: Number(first(w, 'length')) });
  }
  for (const w of wires) {   // the words of the world: short forms, plurals, "fall", "midday" (`core.word text=... means=<name> of=k.time.<type>.name`)
    if (w.type !== 'core.word' || !/^k\.time\.[a-z_]+\.name$/.test(first(w, 'of') ?? '')) continue;
    const target = recs.get(`${first(w, 'of').slice(0, -5)}|${lc(first(w, 'means'))}`);
    if (target) for (const t of w.f.text ?? []) add(t, target);
  }
  return { names, cycles, hours };
}

/** Seeds the reader from the bundled subset (idempotent). */
export function seedTime() {
  if (state.from !== 'none') return;
  const wires = [];
  for (const text of Object.values(BUNDLED_TIME)) for (const line of text.split('\n')) { const w = line.charCodeAt(0) === 64 ? parseLine(line) : null; if (w) wires.push({ type: w.type, f: w.attrs }); }
  Object.assign(state, absorb(wires), { from: 'bundled' });
}
seedTime();

/** Replaces the seed with the catalog's `k.time` when it has it; keeps the seed otherwise. Never throws; the settled answer is remembered per `facts`. */
export function loadTime(facts) {
  if (!facts?.wires) return Promise.resolve(state.from);
  if (state.loading?.facts === facts) return state.loading.promise;
  const promise = (async () => {
    try {
      const wires = [];
      for (const t of [...Object.keys(KINDS), 'k.time.cycle']) wires.push(...await facts.wires(t));
      wires.push(...await facts.wires('core.word', { world: 'k.time' }));
      const got = absorb(wires);
      if (got.names.size >= 12) { Object.assign(state, got, { from: 'catalog' }); }
    } catch { /* the seed stays */ }
    return state.from;
  })();
  state.loading = { facts, promise };
  return promise;
}
export const timeFrom = () => state.from;
export const timeKinds = () => Object.values(KINDS);

const DETERMINERS = new Set(['the', 'a', 'an', 'this', 'next', 'last', 'every', 'each', 'on', 'in', 'at', 'during']);
/** What a phrase names, from the catalog: the name or a word of it ("Mon", "mondays", "fall"), a clock time ("5pm", "3 o'clock", "15:30"). */
export function timeReadings(phrase) {
  let ws = lc(phrase).replace(/[?.!,]+$/g, '').split(' ').filter(Boolean);
  while (ws.length > 1 && DETERMINERS.has(ws[0])) ws = ws.slice(1);
  const p = ws.join(' ');
  if (!p) return [];
  const hit = state.names.get(p) ?? state.names.get(p.replace(/'s$/, ''));
  if (hit) return [...new Set(hit)].map((rec) => reading(rec));
  const m = /^(\d{1,2})(?::(\d{2}))? ?(am|pm|o'?clock)?$/.exec(p.replace(/\s+/g, ' ').replace(/^(\d{1,2}(?::\d{2})?) (am|pm)$/, '$1$2'));
  if (!m || !(m[2] || m[3])) return [];   // a bare number is no time
  const h = Number(m[1]), minute = Number(m[2] ?? 0), suffix = m[3]?.replace("'", '');
  if (minute > 59 || h > 24) return [];
  let cands;
  const slot = (r, k) => r.f[k]?.[0];
  if (suffix === 'am' || suffix === 'pm') { if (h < 1 || h > 12) return []; cands = state.hours.filter((r) => Number(slot(r, 'hour12')) === h && slot(r, 'am_pm') === suffix); }
  else if (suffix) { if (h < 1 || h > 12) return []; cands = state.hours.filter((r) => Number(slot(r, 'hour12')) === h); }   // "3 o'clock": 3 am or 3 pm
  else cands = state.hours.filter((r) => r.n === h % 24);   // "15:30": the 24-hour clock
  return cands.map((rec) => reading(rec, minute));
}
function reading(rec, minute = 0) { return { kind: rec.kind, type: rec.type, name: rec.name, cycle: rec.cycle, pos: rec.n * (rec.kind === 'clock' ? 60 : 1) + minute, minute, rec }; }

/** { cycle, n } of a name of k.time (the first reading), or null. */
export function timePosition(name) {
  const r = timeReadings(name)[0];
  return r ? { cycle: r.cycle, n: r.rec.n, kind: r.kind } : null;
}

const hemisphereName = (h) => (h === 'south' ? 'southern' : 'northern');
const seasonIn = (month, hemisphere) => month.f[`season_${hemisphere}`]?.[0];
const cycleName = (cycle) => (cycle === 'seasons' ? 'the seasons' : `the ${cycle}`);
const cycleWords = (cycle) => { const c = state.cycles.get(cycle); return c ? `${cycleName(cycle)} (${c.first} to ${c.last})` : cycleName(cycle); };

function order(a, b, rel) {
  if (a.cycle !== b.cycle) return { answer: 'unknown', text: `I can not put ${KIND_WORDS[a.kind]} and ${KIND_WORDS[b.kind]} in order: they are not parts of one cycle (${cycleName(a.cycle)} and ${cycleName(b.cycle)}).` };
  const word = rel === 'before' ? 'before' : 'after';
  if (a.pos === b.pos) return { answer: 'no', text: `No, ${a.name} and ${b.name} are the same.` };
  const yes = rel === 'before' ? a.pos < b.pos : a.pos > b.pos;
  if (yes) return { answer: 'yes', text: `Yes, ${a.name} comes ${word} ${b.name} in ${cycleWords(a.cycle)}.` };
  // the cycle goes round: the one that follows (`next`) comes after it in the next round (Sunday, then Monday again; winter, then spring)
  const follows = rel === 'before' ? a.rec.next && lc(a.rec.next) === lc(b.name) : b.rec.next && lc(b.rec.next) === lc(a.name);
  const opposite = rel === 'before' ? 'after' : 'before';
  if (follows) return { answer: 'yes', text: `Yes, ${rel === 'before' ? b.name : a.name} follows ${rel === 'before' ? a.name : b.name} when the round starts again; within one round (${state.cycles.get(a.cycle) ? `${state.cycles.get(a.cycle).first} to ${state.cycles.get(a.cycle).last}` : a.cycle}), ${a.name} comes ${opposite} ${b.name}.` };
  return { answer: 'no', text: `No, ${a.name} comes ${opposite} ${b.name} in ${cycleWords(a.cycle)}.` };
}

function during(a, b, hemisphere) {
  if (a.kind === 'month' && b.kind === 'season') {
    // the seasons are the meteorological ones of each hemisphere (`season_north`, `season_south` of the month); with no hemisphere said, the north is answered and the south is mentioned
    const h = hemisphere ?? 'north', here = seasonIn(a.rec, h), there = seasonIn(a.rec, h === 'north' ? 'south' : 'north');
    const where = ` in the ${hemisphereName(h)} hemisphere`, aside = hemisphere ? '' : ` (in the southern hemisphere it is ${there})`;
    const answer = here === lc(b.name) ? 'yes' : 'no';
    return { answer, text: answer === 'yes' ? `Yes, ${a.name} is in the ${b.name}${where}${aside}.` : `No, ${a.name} is not in the ${b.name}${where}: it is in the ${here}${aside}.` };
  }
  if (a.kind === 'clock' && b.kind === 'part') {
    const part = a.rec.f.part?.[0], yes = lc(part) === lc(b.name);
    return { answer: yes ? 'yes' : 'no', text: yes ? `Yes, ${a.name} is in the ${b.name}.` : `No, ${a.name} is not in the ${b.name}: it is in the ${part}.` };
  }
  return { answer: 'unknown', text: `I can not tell whether ${a.name} is during ${b.name}: ${KIND_WORDS[a.kind]} and ${KIND_WORDS[b.kind]} do not contain each other in what I know.` };
}

/**
 * Two phrases and a relation ("before", "after", "during") compared by lookup. Returns null when a phrase is not a time of the catalog (the sentence is then not about time).
 * A phrase with several readings ("3 o'clock": 3 am, 3 pm) is answered when every reading agrees, else the difference is said.
 */
export function compareTimes(a, b, rel, { hemisphere = null } = {}) {
  const ra = timeReadings(a), rb = timeReadings(b);
  if (!ra.length || !rb.length) return null;
  const one = (x, y) => (rel === 'during' ? during(x, y, hemisphere) : order(x, y, rel));
  const results = ra.flatMap((x) => rb.map((y) => ({ x, y, r: one(x, y) })));
  const kinds = [...new Set([ra[0].kind, rb[0].kind])];
  if (results.length === 1) return { ...results[0].r, kinds };
  if (results.every((v) => v.r.answer === results[0].r.answer)) { const yes = results[0].r.answer === 'yes'; return { answer: results[0].r.answer, kinds, text: `${yes ? 'Yes' : 'No'}, ${a} ${yes ? 'is' : 'is not'} ${rel} ${b}, ${ra.length > 1 && rb.length > 1 ? 'whether the hours are am or pm' : 'whichever of am and pm it is'}.` }; }
  return { answer: 'unknown', kinds, text: `That depends on am or pm: ${results.map((v) => `${v.x.name} ${v.r.answer === 'yes' ? 'is' : 'is not'} ${rel} ${v.y.name}`).join(', ')}. Say am or pm.` };
}
