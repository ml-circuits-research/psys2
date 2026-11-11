// SPDX-License-Identifier: AGPL-3.0-only
// kids.time on the matrix reasoner (spec 15). The rules (the day, month or season some steps from another one, the days until a day, the hours between two
// o'clock times, the refusal of an hour the clock does not have) are in matrix.sop; this file is what the library cannot say: the words around the numbers
// (`voice`, the same sentences ops.mjs says), the state derived from the wires (`toState`) and what "undo" says (`undoWords`). Browser-safe; it imports its
// sibling ops.mjs for the phrase tables (a world is plain files).
import { shiftNote } from './ops.mjs?v=ab78025b42';

const un = (v) => String(v ?? '').replace(/^"|"$/g, '');
const tok = (w, k) => (w?.attrs?.[k] ?? []).map(un);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const word = (s) => String(s).replace(/_/g, ' ');
const TELL_DAY = 'I need to know what day it is today. Please tell me, for example: Today is Friday.';
const TELL_MONTH = 'I need to know what month it is now. Please tell me, for example: This month is May.';
const INFO = { day: 'kids.time.dayinfo', month: 'kids.time.monthinfo', season: 'kids.time.seasoninfo' };
const NOW = { day: ['today', 'kids.time.nowday', 'kids.time.today.day', TELL_DAY], month: ['this_month', 'kids.time.nowmonth', 'kids.time.thismonth.month', TELL_MONTH] };
const cannot = (note) => ({ status: 'unsupported', reason: 'unsupported', note, missing: undefined, alternatives: undefined });
const has = (find, type, name) => find(type).some((w) => tok(w, 'name').includes(name));

/** The state ops.mjs would keep for the dialogue (it keeps none: it reads the told wires), derived from the library: what was told about now. */
export function toState({ find }) {
  const one = (type, key) => { const w = find(type)[0]; return w ? tok(w, key)[0] : undefined; };
  const hour = one('kids.time.nowclock', 'hour');
  return { today: one('kids.time.nowday', 'day') ?? null, month: one('kids.time.nowmonth', 'month') ?? null, hour: hour === undefined ? null : Number(hour) };
}

/**
 * `ctx`: { type, where, env, supposed, find }. The sentence before a shifted day, month or season, the notes of the cases the rules cannot answer (the day today
 * is not known, a name that is no day, an hour the clock does not have), the remark about the length of February.
 */
export function voice({ type, where, env, supposed, find }) {
  if (type === 'kids.time.shift' || type === 'kids.time.seasonshift') {
    const unit = type === 'kids.time.seasonshift' ? 'season' : where.unit, from = where.from, n = Number(where.by);
    if (!INFO[unit] || !from || Number.isNaN(n)) return cannot('I only know days, months and seasons.');
    const now = NOW[unit] && from === NOW[unit][0];
    if (env.status === 'supported') return { note: shiftNote(unit, supposed.start ?? from, n, now) };
    if (now && !find(NOW[unit][1]).length) return { status: 'missing', note: NOW[unit][3], missing: [NOW[unit][2]] };
    if (!now && !has(find, INFO[unit], from)) return cannot(`I do not know ${word(from)}.`);
    return null;
  }
  if (type === 'kids.time.gap') {
    const { from, to } = where;
    if (env.status === 'supported') return { note: `From ${from === 'today' ? 'today' : cap(from)} to ${cap(to)} is` };
    if (from === 'today' && !find('kids.time.nowday').length) return { status: 'missing', note: TELL_DAY, missing: ['kids.time.today.day'] };
    if ((from !== 'today' && !has(find, INFO.day, from)) || !has(find, INFO.day, to)) return cannot('I only know the days of the week.');
    return null;
  }
  if (type === 'kids.time.hoursgap') return env.status === 'supported' ? null : cannot('Those are not hours on a clock.');
  if (type === 'kids.time.monthinfo' && where.name) {
    const w = find(type).find((x) => tok(x, 'name').includes(where.name));
    if (!w) return { note: 'I do not know that month.' };
    const remark = tok(w, 'remark')[0];
    return env.status === 'supported' && remark ? { note: `There are ${env.value} days in ${cap(where.name)}, or ${remark}.` } : null;
  }
  return null;
}

/** What "undo" says once the library went back: `before` and `after` are the states of `toState` (`before` is null when there was nothing to take back). */
export function undoWords({ before, after, said }) {
  if (!before) return { status: 'missing', note: 'There is nothing to undo yet.' };
  if (before.today !== after.today) return { value: after.today ? `OK, today is ${cap(after.today)} again.` : 'OK, I forgot what day it is today.' };
  if (before.month !== after.month) return { value: after.month ? `OK, this month is ${cap(after.month)} again.` : 'OK, I forgot which month it is.' };
  if (before.hour !== after.hour) return { value: after.hour != null ? `OK, it is ${after.hour} o'clock again.` : 'OK, I forgot what time it is.' };
  return { value: `OK, I took that back${said ? `: "${said}"` : ''}.` };
}
