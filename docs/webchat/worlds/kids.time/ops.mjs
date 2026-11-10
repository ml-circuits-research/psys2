// Operations of kids.time. Browser-safe: no imports.

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };   // the turn's step budget (a no-op outside a turn)
const K = (s) => 'kids.time.' + s;
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const word = (s) => String(s).replace(/_/g, ' ');
const mod = (a, n) => ((a % n) + n) % n;
const seqOf = (ctx, w) => ctx.val(w, 'core.seq') ?? -Infinity;

/** KB entries of a type with name and index, in calendar order. */
function ordered(ctx, type) {
  return ctx.find(type).map((w) => ({ name: ctx.val(w, 'name'), index: ctx.val(w, 'index'), w })).sort((a, b) => a.index - b.index);
}
/** The latest value of `key` among the session wires of `type`, with the wire id. */
function told(ctx, type, key) {
  const ws = ctx.find(type).filter((w) => ctx.val(w, 'core.seq') !== undefined).sort((a, b) => seqOf(ctx, b) - seqOf(ctx, a));
  return ws.length ? { value: ctx.val(ws[0], key), id: ws[0].id } : null;
}

export function monthDays(ctx, { name }) {
  const w = ctx.find(K('monthinfo'), { name })[0];
  if (!w) return { status: 'missing', missing: [K('monthinfo.days')], note: 'I do not know that month.' };
  const days = ctx.val(w, 'days');
  const remark = ctx.val(w, 'remark');
  return {
    status: 'supported', value: days, from: [w.id],
    note: remark ? `There are ${days} days in ${cap(name)}, or ${remark}.` : undefined,
  };
}

const PHRASE = {
  day: {
    now: { 0: 'Today is', 1: 'Tomorrow is', '-1': 'Yesterday was', 2: 'The day after tomorrow is', '-2': 'The day before yesterday was' },
    fromNow: (n) => (n > 0 ? `In ${n} days it will be` : `${-n} days ago it was`),
    from: (f, n) => (n === 1 ? `The day after ${cap(f)} is` : n === -1 ? `The day before ${cap(f)} is` : `${Math.abs(n)} days ${n > 0 ? 'after' : 'before'} ${cap(f)} is`),
  },
  month: {
    now: { 0: 'This month is', 1: 'Next month is', '-1': 'Last month was' },
    fromNow: (n) => (n > 0 ? `In ${n} months it will be` : `${-n} months ago it was`),
    from: (f, n) => (n === 1 ? `The month after ${cap(f)} is` : n === -1 ? `The month before ${cap(f)} is` : `${Math.abs(n)} months ${n > 0 ? 'after' : 'before'} ${cap(f)} is`),
  },
  season: {
    now: {},
    fromNow: () => 'It is',
    from: (f, n) => (n === 1 ? `The season after ${f} is` : n === -1 ? `The season before ${f} is` : `${Math.abs(n)} seasons ${n > 0 ? 'after' : 'before'} ${f} is`),
  },
};

export function shift(ctx, { unit, from, by }) {
  const n = Number(by);
  const type = { day: K('dayinfo'), month: K('monthinfo'), season: K('seasoninfo') }[unit];
  if (!type || !from || Number.isNaN(n)) return { status: 'unsupported', note: 'I only know days, months and seasons.' };
  const list = ordered(ctx, type);
  let start = from, usedFrom = [], now = false;
  if (from === 'today' || from === 'this_month') {
    const t = unit === 'day' ? told(ctx, K('today'), 'day') : told(ctx, K('thismonth'), 'month');
    if (!t) {
      return {
        status: 'missing', missing: [unit === 'day' ? K('today.day') : K('thismonth.month')],
        note: unit === 'day' ? 'I need to know what day it is today. Please tell me, for example: Today is Friday.' : 'I need to know what month it is now. Please tell me, for example: This month is May.',
      };
    }
    start = t.value; usedFrom = [t.id]; now = true;
  }
  const i = list.findIndex((x) => x.name === start);
  if (i < 0) return { status: 'unsupported', note: `I do not know ${word(start)}.` };
  const r = list[mod(i + n, list.length)];
  const ph = PHRASE[unit];
  const note = now ? (ph.now[String(n)] ?? ph.fromNow(n)) : ph.from(start, n);
  return { status: 'supported', value: r.name, note, from: [...usedFrom, list[i].w.id, r.w.id] };
}

export function daysBetween(ctx, { from, to }) {
  const days = ordered(ctx, K('dayinfo'));
  let start = from, usedFrom = [];
  if (from === 'today') {
    const t = told(ctx, K('today'), 'day');
    if (!t) return { status: 'missing', missing: [K('today.day')], note: 'I need to know what day it is today. Please tell me, for example: Today is Friday.' };
    start = t.value; usedFrom = [t.id];
  }
  const a = days.findIndex((x) => x.name === start), b = days.findIndex((x) => x.name === to);
  if (a < 0 || b < 0) return { status: 'unsupported', note: 'I only know the days of the week.' };
  return { status: 'supported', value: mod(b - a, 7), unit: 'day', note: `From ${from === 'today' ? 'today' : cap(from)} to ${cap(to)} is`, from: usedFrom };
}

export function hoursBetween(ctx, { from, to }) {
  const a = Number(from), b = Number(to);
  if ([a, b].some((x) => Number.isNaN(x) || x < 0 || x > 24)) return { status: 'unsupported', note: 'Those are not hours on a clock.' };
  return { status: 'supported', value: mod(b - a, 12) || (a === b ? 0 : 12), unit: 'hour' };
}

/** Counting chain over the length facts: direct fact first, else the shortest chain, multiplied. */
export function lengthOf(ctx, { whole, part, times }) {
  const k = times === undefined ? 1 : Number(times);
  if (!whole || !part || Number.isNaN(k)) return { status: 'missing', missing: [K('length.count')] };
  const phrase = k === 1 ? `${/^(?:[aeiou]|hour)/.test(whole) ? 'an' : 'a'} ${word(whole)}` : `${k} ${word(whole)}s`;
  if (whole === 'month' && part === 'day') {
    const alts = [...new Set(ctx.find(K('monthinfo')).map((w) => ctx.val(w, 'days')))].sort((a, b) => a - b);
    return { status: 'ambiguous', alternatives: alts, note: phrase };
  }
  const facts = ctx.find(K('length')).map((w) => ({ w: ctx.val(w, 'whole'), p: ctx.val(w, 'part'), c: ctx.val(w, 'count'), id: w.id }));
  const direct = facts.find((f) => f.w === whole && f.p === part);
  if (direct) return { status: 'supported', value: direct.c * k, note: phrase, from: [direct.id] };
  // breadth-first search for the shortest chain whole -> ... -> part
  const queue = [{ at: whole, c: 1, path: [] }];
  const seen = new Set([whole]);
  while (queue.length) {
    const cur = queue.shift();
    budget.tick('time.chain', 1 + facts.length);
    for (const f of facts.filter((x) => x.w === cur.at)) {
      if (seen.has(f.p) || f.w === 'leap_year' && f.p === 'month') continue;
      const next = { at: f.p, c: cur.c * f.c, path: [...cur.path, f.id] };
      if (f.p === part) return { status: 'supported', value: next.c * k, note: phrase, from: next.path, assumptions: ['multiplied along a chain of facts'] };
      seen.add(f.p); queue.push(next);
    }
  }
  return { status: 'missing', missing: [K('length.count')], note: phrase };
}

/** 12-hour clock text of a number of minutes after 12 o'clock. */
function clockText(totalMinutes) {
  const m = mod(totalMinutes, 720);
  const h = Math.floor(m / 60) || 12;
  const min = m % 60;
  const next = (h % 12) + 1;
  if (min === 0) return `${h} o'clock`;
  if (min === 15) return `quarter past ${h}`;
  if (min === 30) return `half past ${h}`;
  if (min === 45) return `quarter to ${next}`;
  return `${h}:${String(min).padStart(2, '0')}`;
}

export function clockShift(ctx, { at, shift: sh, minutes }) {
  let hour = at === undefined ? undefined : Number(at), usedFrom = [];
  if (hour === undefined) {
    const t = told(ctx, K('clockset'), 'hour');
    if (!t) return { status: 'missing', missing: [K('clock.at')], note: "I need to know what time it is. Please tell me, for example: It is 3 o'clock." };
    hour = t.value; usedFrom = [t.id];
  }
  const dh = sh === undefined ? 0 : Number(sh), dm = minutes === undefined ? 0 : Number(minutes);
  if ([hour, dh, dm].some(Number.isNaN) || hour < 0 || hour > 24) return { status: 'unsupported', note: 'That is not an hour on a clock.' };
  const delta = dh * 60 + dm;
  return { status: 'supported', value: clockText(hour * 60 + delta), note: delta > 0 ? 'will be' : delta < 0 ? 'was' : 'is', from: usedFrom };
}

/** The time told in the dialog, else the real clock (12-hour). */
export function currentTime(ctx) {
  const t = told(ctx, K('clockset'), 'hour');
  if (t) return { status: 'supported', value: clockText(t.value * 60), from: [t.id] };
  const d = new Date();
  const h = d.getHours(), min = d.getMinutes();
  const h12 = h % 12 || 12;
  const value = min === 0 ? `${h12} o'clock` : `${h12}:${String(min).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  return { status: 'supported', value, assumptions: ['the real clock of this machine'] };
}
