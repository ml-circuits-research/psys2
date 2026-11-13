// SPDX-License-Identifier: AGPL-3.0-only
// data.charts (spec 21): the hooks of the schema world. The acts (make, remove, change, pick, ask, copy, send, undo, redo) are read by the generated grammar; what an act DOES on a chart is
// the chart state of chart.mjs (the renderer, the readers of the other worlds, the statistics). The roles of an act are mapped onto those operations here; the words of the user are not read again:
// the one thing read from the sentence is the data ("bikes 4 scooters 9"), which is the world's own parser (parseData). Nothing here names a verb, a colour or a type: values come from the
// colour reader (values.mjs) and the schema's enums, kinds from the schema (executor.schema), bars by the label lookup of the chart.
import * as C from './chart.mjs?v=937a06f48e';
import * as G from './ops.mjs?v=168f00d198';   // circular on purpose: only used inside functions, when the executor exists

const wordsOf = (t) => String(t ?? '').toLowerCase().split(/[^a-z0-9_']+/).filter(Boolean);
const PRONOUN = /^(?:it|them|that|this|those|these|everything|all|each|every|one|ones|this one|that one|em)$/;
const DET = /^(?:the|a|an|my|our|this|that|these|those|another|new|all)\s+/;
const ok = (value) => ({ status: 'supported', value });
const no = (note) => ({ status: 'unsupported', note });

/** The kind of the schema a phrase names: its last word is a word of the kind ("the pears bar", "pie chart", "charts"). */
function kindOf(text) {
  const sch = G.executor?.schema;
  const head = String(text ?? '').split(/[:,;]|\b\d+(?:\.\d+)?\b/)[0];   // the words before the data ("a pie chart of cats 4" -> "a pie chart of cats")
  const ws = wordsOf(head);
  if (!sch || !ws.length) return null;
  const byWord = (w) => { const sing = w.replace(/ies$/, 'y').replace(/s$/, ''); return Object.values(sch.kinds).find((k) => [k.name, k.plural, ...(k.words ?? [])].some((x) => x === w || x === sing)); };
  return byWord(ws.at(-1)) ?? ws.map(byWord).find((k) => k?.name === 'chart') ?? null;
}
/** The phrase without its determiner and a trailing kind word ("the pears bar" -> "pears"). */
const labelOf = (text) => {
  let t = String(text ?? '').toLowerCase().trim().replace(DET, '');
  const ws = t.split(/\s+/);
  if (ws.length > 1 && kindOf(ws.at(-1))?.name === 'point') ws.pop();
  return ws.join(' ');
};
/** Which chart an ordinal or a number names: { ord, n, dir } for switchChart / deleteChart. */
function chartRef(text) {
  const ws = wordsOf(text);
  const n = ws.find((w) => /^\d+$/.test(w));
  const ord = ws.find((w) => C.ordinalOf(w) != null);
  const dir = ws.find((w) => ['next', 'previous', 'prev', 'following', 'prior'].includes(w));
  return { ...(n ? { n } : {}), ...(ord ? { ord } : {}), ...(dir ? { dir: /^(?:next|following)$/.test(dir) ? 'next' : 'prev' } : {}) };
}
const pointsOf = (ctx, text) => {
  const c = C.activeChart(ctx);
  if (!c) return { c: null, idx: [] };
  const l = labelOf(text);
  if (!l || PRONOUN.test(l) || (wordsOf(l).length === 1 && kindOf(l)?.name === 'point' && C.pointIndex(c, l) < 0)) return { c, idx: c.labels.map((_, i) => i), all: true };
  const i = C.pointIndex(c, l);
  return { c, idx: i >= 0 ? [i] : [], label: l };
};
/** The data of a sentence: what follows the chart noun and its connector ("make a pie chart of cats 4, dogs 6"), else the whole sentence is searched for "label number" runs. */
const dataOf = (text) => {
  const t = String(text ?? '').trim();
  const colon = t.indexOf(':');
  if (colon > 0) return t.slice(colon + 1);
  const m = t.match(/\b(?:chart|graph|plot|diagram)s?\s+(?:of|with|for|from|showing|about)?\s*(.*)$/i);
  if (m && C.parseData(m[1]).items.length) return m[1];
  return t.replace(/^(?:please\s+)?[a-z]+\s+(?:me\s+)?(?:an?\s+)?(?:\w+\s+)?/i, '');
};
const typeIn = (...texts) => { for (const t of texts) for (const w0 of wordsOf(t)) for (const w of [w0, w0.replace(/s$/, '')]) { if (C.canonType(w) && !['column', 'slice'].includes(w)) return w; } return null; };
/** The attribute whose enum holds a word of the value ("pie" -> type, "sideways" -> axis, "rainbow" -> palette); a colour word is the colour. */
function attrByValue(value) {
  const sch = G.executor?.schema;
  const ws = wordsOf(value).map((w) => w.replace(/s$/, '')).concat(wordsOf(value), [String(value).toLowerCase().trim().replace(/[\s_]+/g, '_')]);
  const a = Object.values(sch?.attrs ?? {}).find((x) => x.type === 'enum' && x.values.some((v) => ws.includes(v)));
  return a?.name ?? (C.colourOf(wordsOf(value).at(-1) ?? '') ? 'colour' : null);
}
/** The attribute of the schema a word names (its name or one of its words: "color" -> colour). */
const attrName = (w0) => { const w = String(w0).toLowerCase(), sing = w.replace(/s$/, ''); const a = Object.values(G.executor?.schema?.attrs ?? {}).find((x) => [w, sing].some((y) => x.name === y || (x.words ?? []).includes(y))); return a?.name ?? w0; };
/** "make it a stacked bar chart": the thing slot also holds the adjective of a switch of the schema (stacked). */
const stackedIn = (t) => wordsOf(t).some((w) => attrName(w) === 'stacked');
const FACTORS = { twice: 2, double: 2, triple: 3, thrice: 3, treble: 3, half: 0.5 };
const isOff = (v) => /^(?:off|no|false|hide|hidden|away|out)$/.test(String(v));

/** A sentence that names a NEW chart and carries its data ("make a chart: apples 5, pears 3") is read as a value statement by the forms that say "make plums 9"; the act is make. */
const newChartWithData = (r) => kindOf(r.thing)?.name === 'chart' && C.parseData(dataOf(r.text)).items.length > 0 && !/\b(?:it|them)\b/i.test(String(r.thing));
const ACTS = new Set(['make', 'remove', 'change', 'pick', 'ask', 'copy', 'send', 'undo', 'redo', 'own']);
const domain = {
  make: (ctx, r) => {
    const k = kindOf(r.thing);
    if (r.mode === 'data' || k?.name === 'chart' || (!k && typeIn(r.thing) && /chart|graph|plot/i.test(String(r.text)))) {
      const type = typeIn(r.thing, r.value);
      const data = r.mode === 'data' ? r.rest : dataOf(r.text);
      if ((r.mode === 'data' || !r.value) && (C.parseData(data).items.length || /:/.test(String(r.text)))) return C.fromText(ctx, { text: data, type, request: r.request });
      return C.newChart(ctx, { type, title: r.value });
    }
    const text = [r.amount, r.thing, r.value].filter((x) => x != null && x !== '').join(' ');
    return C.addPoint(ctx, { text, request: r.request });
  },
  remove: (ctx, r) => {
    const k = kindOf(r.thing);
    if (r.mode === 'new') return C.newChart(ctx, {});
    if (k?.name === 'chart' || !r.thing || r.mode === 'all') {
      if (r.mode === 'all' && !r.thing?.match(/\bcharts\b/)) return C.clearData(ctx, {});
      return C.deleteChart(ctx, { ...chartRef(r.thing), ...(/\b(?:all|every|charts)\b/.test(String(r.thing)) ? { all: 'true' } : {}) });
    }
    if (r.attribute === 'title' || /^title$/.test(labelOf(r.thing))) return C.removeTitle(ctx, {});
    const { c, idx, all, label } = pointsOf(ctx, r.thing);
    if (!c) return no(C.NONE);
    if (all) return C.clearData(ctx, {});
    if (!idx.length) return C.removePoint(ctx, { l: label });
    return C.removePoint(ctx, { l: label });
  },
  change: (ctx, r) => {
    if (newChartWithData(r)) return domain.make(ctx, { ...r, thing: r.thing, value: null, amount: null });
    if (r.thing && !kindOf(r.thing) && C.parseData(r.thing).items.length > 1 && !pointsOf(ctx, r.thing).idx.length) return domain.make(ctx, { ...r, mode: 'data', rest: r.thing, thing: null, amount: null });   // "plot x 1 y 2 z 3 as a pie chart": the thing is data, the value its type
    const k = kindOf(r.thing);
    const value = r.value == null ? null : String(r.value).replace(/^(?:a|an|the)\s+/i, '');
    const byValue = value && r.mode !== 'name' && r.mode !== 'order' && r.mode !== 'scale' && !/^\d/.test(value) ? attrByValue(value) : null;
    let attr = r.attribute ? attrName(r.attribute) : byValue;
    if (attr === 'colour' && byValue && byValue !== 'colour') attr = byValue;   // "pastel colours": the word colours names the family, the value says which
    if (r.mode === 'next' || r.mode === 'prev') return C.switchChart(ctx, { dir: r.mode });
    const pts = r.thing ? pointsOf(ctx, r.thing) : { c: C.activeChart(ctx), idx: [], all: true };
    const chartLevel = !r.thing || k?.name === 'chart' || pts.all;
    if (r.mode === 'order') return C.setSort(ctx, { ...(value === 'none' ? { mode: 'none' } : { from: wordsOf(value)[0] }) });
    if (r.mode === 'name') return pts.idx.length === 1 ? C.renamePoint(ctx, { l: pts.label, to: value }) : chartLevel ? C.setTitle(ctx, { t: value }) : C.renamePoint(ctx, { l: pts.label ?? labelOf(r.thing), to: value });
    if (attr === 'title') return value == null || isOff(value) ? C.removeTitle(ctx, {}) : C.setTitle(ctx, { t: value });
    if (attr === 'axis') return C.setOrientation(ctx, { o: String(value).replace(/\s+/g, '_') });
    if (attr === 'type') return C.setType(ctx, { type: typeIn(value) ?? value, ...(stackedIn(r.thing) ? { stacked: 'true' } : {}) });
    if (attr === 'legend') return C.setLegend(ctx, { on: isOff(value) ? 'false' : 'true' });
    if (attr === 'stacked') return C.setStacked(ctx, { on: isOff(value) ? 'false' : 'true' });
    if (attr === 'sort') return C.setSort(ctx, { mode: isOff(value) ? 'none' : value });
    if (attr === 'palette') return C.setPalette(ctx, { p: wordsOf(value).at(-1) });
    if (!pts.c) return no(C.NONE);
    if (attr === 'colour') return C.setColor(ctx, { ...colourArgs(value), ...(chartLevel || pts.all ? {} : { label: pts.label }) });
    const l = pts.label ?? labelOf(r.thing);
    if (r.mode === 'scale') {
      const n = C.numberOf(r.amount);
      const f = String(r.value);
      return C.adjustPoint(ctx, f === 'divide' ? { l, div: n } : f === 'times' ? { l, factor: n } : { l, factor: FACTORS[f] ?? 2 });
    }
    if (r.mode === 'more' || r.mode === 'less') return C.adjustPoint(ctx, { l, by: r.amount ?? value, dir: r.mode === 'less' ? 'down' : 'up' });
    if (attr === 'value' || !attr) return C.setPoint(ctx, { l, n: value ?? r.amount });
    return no(`I cannot change the ${attr} of a chart.`);
  },
  pick: (ctx, r) => C.switchChart(ctx, r.mode === 'next' || r.mode === 'prev' ? { dir: r.mode } : { ...chartRef(r.thing), ...(r.amount != null ? (/^\d+$/.test(String(r.amount)) ? { n: r.amount } : { ord: r.amount }) : {}) }),
  copy: (ctx) => C.duplicate(ctx, {}),
  send: (ctx, r) => (/\bdata\b|numbers/i.test(String(r.text)) ? C.toDocumentData(ctx, {}) : C.toDocument(ctx, {})),
  ask: (ctx, r) => {
    if (['why', 'last'].includes(r.mode)) return undefined;
    const k = kindOf(r.thing);
    if (r.mode === 'describe' || r.mode === 'state') return /\bcharts\b/i.test(String(r.text)) ? C.listCharts(ctx, {}) : C.describe(ctx, {});
    if (r.mode === 'options') return C.options(ctx, {});
    if (r.mode === 'count' && !k) { const p = pointsOf(ctx, r.thing); if (p.c && p.idx.length === 1 && !p.all) return C.valueOf(ctx, { l: p.label }); }
    if (r.mode === 'count') return k?.name === 'chart' ? C.listCharts(ctx, {}) : C.countItems(ctx, {});
    if (k?.name === 'chart' && !r.attribute) return C.listCharts(ctx, {});
    const { c, label } = pointsOf(ctx, r.thing);
    if (!c) return no(C.NONE);
    return C.valueOf(ctx, { l: label });
  },
  undo: (ctx) => C.undo(ctx),
  redo: (ctx) => C.redo(ctx),
};
/** "light blue" -> { c: 'blue', shade: 'light' } (the shade words are the renderer's). */
function colourArgs(value) {
  const ws = wordsOf(value);
  const shade = ws.length > 1 && C.SHADE_WORDS.has(ws[0]) ? ws.shift() : undefined;
  return { c: ws.join(' '), ...(shade ? { shade } : {}) };
}

/** DECLINE (spec 21): a sentence is the chart's when it names a chart, or a bar of the open chart, or data ("pears 7"); "remove milk" is the shopping list's, "make the sun red" the drawing's. */
function accepts({ action, mode, roles = {}, state, tab, text }) {
  const act = String(action ?? '').split('.').pop();
  const open = (state?.charts ?? []).find((c) => c.id === state?.active) ?? null;
  if (!ACTS.has(act)) return true;   // the operations that are not acts (sources, statistics, pictures) are read by patterns that name the chart world's own frames
  if (['undo', 'redo'].includes(act)) return !!open && tab === 'data.charts';
  if (!open && tab !== 'data.charts' && !/\b(?:chart|graph|plot)s?\b/i.test(String(text ?? ''))) return false;
  if (/\b(?:chart|graph|plot|diagram)s?\b/i.test(String(text ?? ''))) return true;
  const said = [roles.thing, roles.pre].filter(Boolean).join(' ');
  if (!open) return false;
  if (!said || PRONOUN.test(said.trim())) return tab === 'data.charts' ? true : 'focus';
  const l = labelOf(said);
  if (C.pointIndex(open, l) >= 0) return tab === 'data.charts' && act === 'ask' ? 'focus' : true;   // the bar of the open chart is the chart's against another world's word ("what is kiwis")
  if (kindOf(said)) return true;
  if (act === 'make' && C.parseData([roles.amount, roles.thing, roles.value].filter(Boolean).join(' ')).items.length) return true;
  return false;
}

if (globalThis.process?.env?.CH_DEBUG) for (const k of Object.keys(domain)) { const f = domain[k]; domain[k] = (ctx, r) => { console.error('DOMAIN', k, JSON.stringify({ ...r, request: undefined })); return f(ctx, r); }; }
export const hooks = { domain, accepts };
