// SPDX-License-Identifier: AGPL-3.0-only
// data.charts on the matrix reasoner (spec 15). The operations that build and change charts (ops.mjs: parsing the numbers, reading the other worlds, types, titles,
// colors, the order, pictures and files, undo and redo) are unchanged and keep working on the session state; the charts are also wires of the library: one
// `data.charts.chart` per chart (type, title, whether it is the active one, its options and `obj`, the exact chart), one `data.charts.point` per number and
// `data.charts.dialog` for the bookkeeping of the operations. The library takes the state over after every operation (`adopt`; `toState` is the way back), so its
// rules refuse what cannot be (the same label twice, a number of a chart that is not there, two active charts) and derive what follows from the numbers: the
// total of every label, the total, count, biggest and smallest of a chart, the total of a series. The questions about the data are answered from those derived
// wires (the actions at the bottom say them in the words of ops.mjs). Browser-safe; it imports its sibling ops.mjs for the tables (a world is plain files).
import { initialState, labelKey, fmt, DOWN, itemsWord, joinAnd, low, round, NONE } from './ops.mjs?v=2aa3be842c';

const un = (v) => String(v ?? '').replace(/^"|"$/g, '');
const dec = (t) => (typeof t === 'string' && t.startsWith('"') ? JSON.parse(t) : t);
const str = (v) => JSON.stringify(String(v));
const tok = (w, k) => (w?.attrs?.[k] ?? []).map((t) => dec(t));
const num = (n) => String(Number(n));
const atomOk = (v) => typeof v === 'string' && /^[A-Za-z0-9_]+$/.test(v);
const wid = (s) => String(s).replace(/[^A-Za-z0-9_]/g, '_');
const HANDLED = new Set(['history', 'future', 'charts', 'active']);   // the rest is `data.charts.dialog`
const TYPES = ['data.charts.chart', 'data.charts.point', 'data.charts.dialog'];

/** The state ops.mjs keeps (the tab reads it), derived from the wires: the same keys in the same order. */
export function toState({ find }) {
  const charts = find('data.charts.chart').map((w) => ({ w, ord: Number(w.attrs.ord?.[0] ?? 0) })).sort((a, b) => a.ord - b.ord).map((x) => x.w);
  const dlg = find('data.charts.dialog')[0];
  if (!charts.length && !dlg) return initialState();
  const s = initialState();
  s.charts = charts.map((w) => JSON.parse(dec(w.attrs.obj[0])));
  const act = charts.find((w) => tok(w, 'active')[0] === 'true');
  s.active = act ? dec(act.attrs.cid[0]) : null;
  if (dlg) Object.assign(s, JSON.parse(dec(dlg.attrs.rest[0])));
  return s;
}

const canon = (attrs) => JSON.stringify(Object.keys(attrs ?? {}).filter((k) => !k.startsWith('core.')).sort().map((k) => [k, attrs[k]]));

/** The wires a state asks for: { id: { type, attrs: { key: [token] } } }. */
function wiresOf(s) {
  const out = {};
  (s.charts ?? []).forEach((c, ord) => {
    const a = { cid: [str(c.id)], ord: [String(ord)], type: [atomOk(c.type) ? c.type : 'bar'], active: [c.id === s.active ? 'true' : 'false'], nseries: [String(c.datasets.length)], obj: [str(JSON.stringify(c))] };
    if (c.title) a.title = [str(c.title)];
    if (typeof c.options?.horizontal === 'boolean') a.horizontal = [String(c.options.horizontal)];
    if (typeof c.options?.stacked === 'boolean') a.stacked = [String(c.options.stacked)];
    const cid = wid(c.id);
    out[`dc.ch_${cid}`] = { type: 'data.charts.chart', attrs: a };
    const used = new Set();
    c.datasets.forEach((d, si) => c.labels.forEach((l, i) => {
      let id = `dc.pt_${cid}_${si}_${wid(l)}`;
      if (used.has(id)) id = `${id}_${i}`;
      used.add(id);
      out[id] = { type: 'data.charts.point', attrs: { cid: [str(c.id)], si: [String(si)], i: [String(i)], label: [str(l)], series: [str(d.label)], value: [num(Number(d.data[i]) || 0)] } };
    }));
  });
  const base = {};
  for (const [k, v] of Object.entries(initialState())) if (!HANDLED.has(k)) base[k] = v;
  const rest = {};   // a fixed order of keys (the bookkeeping first, then the others by name): the same state is the same wire whatever order the operations left its keys in
  for (const k of [...Object.keys(base), ...Object.keys(s).filter((x) => !HANDLED.has(x) && !(x in base)).sort()]) if (k in s) rest[k] = s[k];
  if (JSON.stringify(rest) !== JSON.stringify(base)) out['dc.dlg'] = { type: 'data.charts.dialog', attrs: { rest: [str(JSON.stringify(rest))] } };
  return out;
}

/**
 * The library wires for a state the operations changed: { retract: [ids], tell: 'text', sets: [{ id, key, value }], replace: [{ id, type, attrs }] } (a wire that already says it is left alone).
 * A wire whose single values changed is set in place (a number, the place of a label); a wire that gained or lost a key is replaced in place (it keeps its id).
 */
export function adopt({ state, find }) {
  const want = wiresOf(state);
  const have = new Map();
  for (const t of TYPES) for (const w of find(t)) {
    have.set(w.id, { id: w.id, wire: w });
  }
  const retract = [], tell = [], sets = [], replace = [], same = new Set();
  const keys = (a) => Object.keys(a).filter((k) => !k.startsWith('core.')).sort().join();
  for (const [base, h] of have) {
    const w = want[base];
    if (!w || canon(h.wire.attrs) === canon(w.attrs)) { if (!w) retract.push(h.id); continue; }
    const single = h.wire.type === w.type && keys(h.wire.attrs) === keys(w.attrs) && Object.keys(w.attrs).every((k) => w.attrs[k].length === 1 && (h.wire.attrs[k] ?? []).length === 1);
    if (!single) { replace.push({ id: h.id, type: w.type, attrs: w.attrs }); continue; }   // the wire keeps its id (library R6.9)
    for (const [k, vs] of Object.entries(w.attrs)) if (h.wire.attrs[k][0] !== vs[0]) sets.push({ id: h.id, key: k, value: vs[0] });
    same.add(base);
  }
  for (const [base, w] of Object.entries(want)) {
    const h = have.get(base);
    if (h) continue;
    tell.push(`@${base} ${w.type} ${Object.entries(w.attrs).map(([k, vs]) => vs.map((v) => `${k}=${v}`).join(' ')).join(' ')}`);
  }
  return { retract, tell: tell.join('\n'), sets, replace };
}

// ---- the questions about the data, from the derived wires --------------------------------------------------------------------------------------------
const no = (status, note) => ({ status, note, ...(/^I do not see /.test(note) ? { reason: 'unknown_argument' } : {}) });
const ok = (value, extra) => ({ value, openTab: 'charts', ...extra });

/** The active chart as the operations read it (`c`), with the numbers the rules derived: totals per label, the sum, the series, the biggest and smallest labels. */
function active(ctx) {
  const w = ctx.find('data.charts.chart').find((x) => tok(x, 'active')[0] === 'true');
  if (!w) return { env: no('missing', NONE) };
  const c = JSON.parse(dec(w.attrs.obj[0]));
  const mine = (type) => ctx.find(type).filter((x) => tok(x, 'cid')[0] === c.id);
  const byLabel = new Map(mine('data.charts.labeltotal').map((x) => [tok(x, 'label')[0], Number(tok(x, 'total')[0])]));
  const points = mine('data.charts.point');
  const ct = mine('data.charts.charttotal')[0];
  return {
    c,
    totals: c.labels.map((l) => byLabel.get(l) ?? 0),
    sum: ct ? Number(tok(ct, 'sum')[0]) : 0,
    max: ct ? Number(tok(ct, 'max')[0]) : null,
    min: ct ? Number(tok(ct, 'min')[0]) : null,
    series: mine('data.charts.seriestotal').map((x) => ({ si: Number(tok(x, 'si')[0]), name: tok(x, 'series')[0], total: Number(tok(x, 'total')[0]) })).sort((a, b) => a.si - b.si),
    cell: (l, si) => Number(tok(points.find((p) => tok(p, 'label')[0] === l && Number(tok(p, 'si')[0]) === si), 'value')[0] ?? 0),
    top: new Set(mine('data.charts.top').map((x) => tok(x, 'label')[0])),
    bottom: new Set(mine('data.charts.bottom').map((x) => tok(x, 'label')[0])),
  };
}
const withData = (ctx) => {
  const a = active(ctx);
  if (a.env) return a;
  if (!a.c.labels.length) return { env: no('missing', `The chart "${a.c.title}" is empty. Add something, for example: "add bananas 4".`) };
  return a;
};
/** Index of a label in the chart ("apples" finds "Apple"), or -1 (the same reading as ops.mjs). */
function find(c, text) {
  const k = labelKey(text);
  if (!k) return -1;
  let i = c.labels.findIndex((l) => labelKey(l) === k);
  if (i < 0) i = c.labels.findIndex((l) => labelKey(l).replace(/ /g, '') === k.replace(/ /g, ''));
  return i;
}
const multi = (c) => c.datasets.length > 1;
const notThere = (c, l) => no('missing', `I do not see ${String(l).trim()} in the chart "${c.title}". It has ${joinAnd(c.labels.map((x) => low(c, x)))}.`.replace(' It has .', ''));
const from = (a) => ({ from: a.c.source });
const un2 = (raw) => Object.fromEntries(Object.entries(raw ?? {}).map(([k, v]) => [k, un(v)]));

const valueText = (a, i) => (multi(a.c) ? `${fmt(a.totals[i])} in total (${a.c.datasets.map((d, si) => `${d.label} ${fmt(a.cell(a.c.labels[i], si))}`).join(', ')})` : fmt(a.cell(a.c.labels[i], 0)));
const describeValue = (a, i) => {
  const share = a.sum ? ` That is ${round((a.totals[i] / a.sum) * 100, 1)}% of the total.` : '';
  return `${a.c.labels[i]} is ${valueText(a, i)}.${share}`;
};

export const fns = {
  dcExtreme(ctx, raw) {
    const { w } = un2(raw), a = withData(ctx);
    if (a.env) return a.env;
    const { c } = a, up = !DOWN.has(String(w)), best = up ? a.max : a.min, set = up ? a.top : a.bottom;
    const names = c.labels.filter((l) => set.has(l));
    const word = up ? 'biggest' : 'smallest', unit = multi(c) ? ' in total' : '';
    if (names.length === c.labels.length && names.length > 1) return ok(`They are all the same: ${fmt(best)}.`, from(a));
    return ok(names.length === 1 ? `${names[0]} is the ${word}, with ${fmt(best)}${unit}.` : `${joinAnd(names)} are tied for the ${word}, with ${fmt(best)} each${unit}.`, from(a));
  },
  dcTotal(ctx) {
    const a = withData(ctx);
    if (a.env) return a.env;
    const per = multi(a.c) ? ` (${a.series.map((d) => `${d.name} ${fmt(d.total)}`).join(', ')})` : '';
    return ok(`The total is ${fmt(a.sum)}${per}.`, from(a));
  },
  dcAverage(ctx) {
    const a = withData(ctx);
    if (a.env) return a.env;
    const n = a.c.labels.length;
    return ok(`The average is ${fmt(a.sum / n)} over ${n} ${itemsWord(a.c, n)}.`, from(a));
  },
  dcDifference(ctx, raw) {
    const { a: la, b: lb } = un2(raw), a = withData(ctx);
    if (a.env) return a.env;
    const { c } = a, i = find(c, la), j = find(c, lb);
    if (i < 0) return notThere(c, la);
    if (j < 0) return notThere(c, lb);
    const d = round(a.totals[i] - a.totals[j], 6), A = c.labels[i], B = c.labels[j];
    if (d === 0) return ok(`${A} and ${B} are the same: ${fmt(a.totals[i])} each.`, from(a));
    return ok(`${A} is ${fmt(Math.abs(d))} ${d > 0 ? 'more' : 'less'} than ${B}: ${fmt(a.totals[i])} against ${fmt(a.totals[j])}.`, from(a));
  },
  dcCompare(ctx, raw) {
    const { w, a: la, b: lb } = un2(raw), a = withData(ctx);
    if (a.env) return a.env;
    const { c } = a, i = find(c, la), j = find(c, lb);
    if (i < 0) return notThere(c, la);
    if (j < 0) return notThere(c, lb);
    const t = a.totals, up = !DOWN.has(String(w));
    if (t[i] === t[j]) return ok(`${c.labels[i]} and ${c.labels[j]} are the same: ${fmt(t[i])} each.`, from(a));
    const win = (t[i] > t[j]) === up ? i : j, lose = win === i ? j : i;
    return ok(`${c.labels[win]} is ${up ? 'bigger' : 'smaller'}: ${fmt(t[win])} against ${fmt(t[lose])}.`, from(a));
  },
  dcPercent(ctx, raw) {
    const { l } = un2(raw), a = withData(ctx);
    if (a.env) return a.env;
    const i = find(a.c, l);
    if (i < 0) return notThere(a.c, l);
    if (!a.sum) return no('missing', 'The total is zero, so there are no percentages.');
    return ok(`${a.c.labels[i]} is ${round((a.totals[i] / a.sum) * 100, 1)}% of the total (${fmt(a.totals[i])} of ${fmt(a.sum)}).`, from(a));
  },
  dcValueOf(ctx, raw) {
    const { l } = un2(raw), a = withData(ctx);
    if (a.env) return a.env;
    const i = find(a.c, l);
    if (i < 0) return notThere(a.c, l);
    return ok(describeValue(a, i), from(a));
  },
  dcCount(ctx) {
    const a = active(ctx);
    if (a.env) return a.env;
    const n = a.c.labels.length;
    return ok(`There ${n === 1 ? 'is' : 'are'} ${n} ${itemsWord(a.c, n)} in the chart.`);
  },
};

/** What "undo" and "redo" say once the library went back (or forward): the charts in the words of ops.mjs. `before` is null when there was nothing to take back. */
export function undoWords({ before, after, redo }) {
  if (!before) return { status: 'missing', note: redo ? 'There is nothing to redo in the charts.' : 'There is nothing to undo in the charts yet.' };
  return { value: redo ? 'OK, I did it again.' : 'OK, I undid the last change to the chart.', openTab: 'charts' };
}

/** No step of this world only moves what the user looks at: every library step is an undo step (and having this function makes "undo" keep what it took out for "redo"). */
export function isView() { return false; }
