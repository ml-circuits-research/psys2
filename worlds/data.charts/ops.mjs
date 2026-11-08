// Operations of data.charts: talk with a chart, build charts from the conversation (spec 07 section 6).
// Browser-safe: no imports.
//
// State (ctx.state): { charts: [Chart], active: id | null, nextId, inputMode: null | 'chart' }
//   Chart = { id, type: bar|line|pie|doughnut|radar|polarArea|scatter, title, labels: [string],
//             datasets: [{ label, data: [number], color: hex | null (automatic) }],
//             options: { stacked, horizontal, showLegend: true|false|null (automatic), showValues: false|true|'percent',
//                        sort: null|'desc'|'asc'|'alpha', palette: null|name, pointColors: { <label>: hex } },
//             source: [wire ids the numbers come from], spec: null | { kind, args } (how to rebuild it: "update the chart") }
//   inputMode is 'chart' while the active chart has labels, so that interceptInput can answer "what is <label>?"
//   (the click on a bar of the tab) before the other worlds see it.
// Effects: charts.download { filename, format, chart } (handled by the tab: canvas toDataURL), file.download, clipboard.copy,
//   speech.say { text }.
// Cross-world: ctx.request('ui.openTab', { tab: 'charts' }) after every change; data is read with ctx.find / ctx.ask from
//   kids.arith (holdings), kids.shop (prices), kids.tasks (list entries) and kids.animals (legs). Every number of such a chart
//   comes from wires, and the chart keeps their ids in `source`. Numbers typed by the user keep the id of the request wire.
//   doc.addHeading / doc.addList of docs.editor are used by "put the chart data in the document"; doc.addImage (not offered yet)
//   is probed by "put the chart in the document".
// The pure helpers at the bottom (chartView, csv) are also imported by the tab, so the tab draws exactly what the state says.

const TAB = 'charts';
const TYPES = ['bar', 'line', 'pie', 'doughnut', 'radar', 'polarArea', 'scatter'];
const TYPE_WORD = { bar: 'bar', line: 'line', pie: 'pie', doughnut: 'doughnut', donut: 'doughnut', radar: 'radar', polar: 'polarArea', polar_area: 'polarArea', polararea: 'polarArea', scatter: 'scatter' };
const TYPE_NAME = { bar: 'bar chart', line: 'line chart', pie: 'pie chart', doughnut: 'doughnut chart', radar: 'radar chart', polarArea: 'polar area chart', scatter: 'scatter plot' };
const POINT_TYPES = new Set(['pie', 'doughnut', 'polarArea']);

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const DARK_SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
export const PALETTES = {
  classic: SERIES,
  rainbow: ['#e34948', '#f08a24', '#f2c500', '#3fae49', '#1fa9c9', '#2a78d6', '#6250d6', '#b04ccf'],
  pastel: ['#a8c8f0', '#f7c6a3', '#b5e6cf', '#f8e0a0', '#f4c3d6', '#bde0a8', '#c9c1f0', '#f2b8b8'],
  ocean: ['#0b3c5d', '#145f8c', '#1d82b5', '#2fa4c7', '#52c1d6', '#86d9e0', '#b6ece8', '#e0f8f4'],
  forest: ['#17401f', '#25602f', '#34803f', '#4f9d4d', '#74b45c', '#9bcb74', '#c2e0a0', '#e4f2c8'],
  sunset: ['#4a2060', '#8a2f6f', '#c4416b', '#e8644f', '#f58a3c', '#f9b244', '#fcd470', '#fde9a8'],
  warm: ['#b3261e', '#d6492a', '#ec6b2d', '#f48d35', '#f8ae3c', '#f9c94a', '#d9774a', '#a8453a'],
  cool: ['#2a4a9a', '#2a78d6', '#1fa9c9', '#1baf7a', '#4f9d9a', '#6250d6', '#8e7ad8', '#5a86b8'],
  neon: ['#ff2d95', '#00e5ff', '#76ff03', '#ffea00', '#b388ff', '#ff6d00', '#00e676', '#2979ff'],
  earth: ['#6b4423', '#8a6b3f', '#a58c52', '#7c8a4a', '#5d7a4a', '#a8693f', '#c9a36a', '#4d5a3c'],
};
const PALETTE_WORD = { classic: 'classic', different: 'classic', rainbow: 'rainbow', pastel: 'pastel', ocean: 'ocean', sea: 'ocean', forest: 'forest', sunset: 'sunset', warm: 'warm', cool: 'cool', neon: 'neon', earth: 'earth', autumn: 'warm', default: null, original: null, standard: null, normal: null };
const COLORS = {
  red: '#e34948', orange: '#f08a24', yellow: '#f2c500', green: '#2f9e44', blue: '#2a78d6', purple: '#7048c8', pink: '#e87ba4', teal: '#1b9e91',
  brown: '#8a5a3c', gray: '#8b929a', grey: '#8b929a', black: '#2b2b33', white: '#f4f4f1', indigo: '#4b4bb0', cyan: '#22b8cf', lime: '#82c91e',
  gold: '#e0a800', navy: '#1f3a7a', coral: '#f2776b', mint: '#63d6a4', violet: '#9b6bd8', magenta: '#d6409f', turquoise: '#2ec4b6', crimson: '#c21e3a',
  maroon: '#8c2f3b', lavender: '#b9a7ea', peach: '#f9b99a', silver: '#bfc5cc', beige: '#e3d5b8',
};

// ---- small helpers ----------------------------------------------------------------------------------
const ok = (value, extra) => ({ status: 'supported', value, ...extra });
const no = (status, note) => ({ status, note });
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const sp = (w) => String(w).replace(/_/g, ' ');
const joinAnd = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const plural = (w, n = 2) => {
  const x = sp(w);
  if (n === 1) return x;
  if (/(sheep|fish|deer)$/.test(x)) return x;
  if (/mouse$/.test(x)) return x.replace(/mouse$/, 'mice');
  if (/goose$/.test(x)) return x.replace(/goose$/, 'geese');
  if (/wolf$/.test(x)) return x.replace(/wolf$/, 'wolves');
  if (/[^aeiou]y$/.test(x)) return `${x.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(x)) return `${x}es`;
  return `${x}s`;
};
const round = (x, d = 2) => { const f = 10 ** d; return Math.round(x * f) / f; };
export const fmt = (n) => String(round(Number(n), 2));
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'chart';
const idsOf = (args) => (args?.request?.id ? [args.request.id] : []);
const uniq = (a) => [...new Set(a.filter(Boolean))];
const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, last: -1 };

const NUMW = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 };
/** "5", "-2.5", "seven", "twenty-one" -> number, NaN otherwise. */
function toNum(tok) {
  const t = String(tok).toLowerCase().trim();
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  if (t in NUMW) return NUMW[t];
  const m = t.match(/^(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[- ](one|two|three|four|five|six|seven|eight|nine)$/);
  return m ? NUMW[m[1]] + NUMW[m[2]] : NaN;
}

/** Comparison key of a label: lowercase, no article, singular last word ("The Apples" -> "apple"). */
export function labelKey(s) {
  let t = String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(the|a|an|my|our|some|all)\s+/, '');
  const w = t.split(' ');
  let last = w.pop() ?? '';
  if (/ies$/.test(last) && last.length > 4) last = `${last.slice(0, -3)}y`;
  else if (/(ch|sh|x|s|z)es$/.test(last) && last.length > 4) last = last.slice(0, -2);
  else if (/[^s]s$/.test(last) && last.length > 2) last = last.slice(0, -1);
  return [...w, last].join(' ').trim();
}
const tidyLabel = (s) => cap(String(s).replace(/\s+/g, ' ').replace(/^[\s:=\-–]+|[\s:=\-–]+$/g, '').replace(/^(?:a|an|the|some)\s+/i, '').trim());

/** "apples 5, pears 3 and plums 8" or "5 apples, 3 pears" -> { items: [{ label, value }], bad: [piece] }. */
export function parseData(text) {
  const pieces = String(text ?? '').split(/\s*(?:,|;|\n|\band\b)\s*/i).map((p) => p.trim()).filter(Boolean);
  const items = [], bad = [];
  for (const p0 of pieces) {
    const p = p0.replace(/\s*[:=]\s*/g, ' ').replace(/\s+/g, ' ').trim();
    const toks = p.split(' ');
    let label = null, value = NaN;
    if (toks.length >= 2) {
      // number at the end ("apples 5", "apples x 5", "ice cream twelve")
      const lastN = toNum(toks.at(-1));
      if (Number.isFinite(lastN)) { value = lastN; label = toks.slice(0, -1).join(' ').replace(/\s+(?:x|=|-|is|are|has|have)$/i, ''); }
      else {
        const firstN = toNum(toks[0]);
        if (Number.isFinite(firstN)) { value = firstN; label = toks.slice(1).join(' ').replace(/^(?:x|of)\s+/i, ''); }
        else if (toks.length >= 3 && Number.isFinite(toNum(`${toks.at(-2)} ${toks.at(-1)}`.replace(' ', '-')))) { value = toNum(`${toks.at(-2)}-${toks.at(-1)}`); label = toks.slice(0, -2).join(' '); }
      }
    }
    const label0 = String(label ?? '').replace(/^(?:a|an|the|some)\s+/i, '').trim();
    label = label ? tidyLabel(label) : '';
    if (!label || !Number.isFinite(value) || /^\d+(\.\d+)?$/.test(label) && false) { bad.push(p0); continue; }
    items.push({ label, value, proper: /^[A-Z]/.test(label0) });
  }
  return { items, bad };
}

// ---- state ------------------------------------------------------------------------------------------
export function initialState() { return { charts: [], active: null, nextId: 1, inputMode: null }; }
const st = (ctx) => {
  const s = ctx.state;
  s.charts ??= []; s.nextId ??= 1;
  if (s.active === undefined) s.active = null;
  return s;
};
const current = (ctx) => { const s = st(ctx); return s.charts.find((c) => c.id === s.active) ?? null; };
const touch = (ctx) => { const s = st(ctx); const c = current(ctx); s.inputMode = c && c.labels.length ? 'chart' : null; };
const show = (ctx) => { try { ctx.request('ui.openTab', { tab: TAB }); } catch { /* the shell may be absent */ } };
const done = (ctx, value, extra) => { touch(ctx); show(ctx); return ok(value, extra); };
const NONE = 'There is no chart yet. Say, for example: "make a chart: apples 5, pears 3, plums 8".';
const needChart = (ctx) => { const c = current(ctx); return c ? { c } : { env: no('missing', NONE) }; };
const needData = (ctx) => {
  const r = needChart(ctx);
  if (r.env) return r;
  if (!r.c.labels.length) return { env: no('missing', `The chart "${r.c.title}" is empty. Add something, for example: "add bananas 4".`) };
  return r;
};
const defaultOptions = () => ({ stacked: false, horizontal: false, showLegend: null, showValues: false, sort: null, palette: null, pointColors: {} });
const blank = (s, title) => ({ id: `c${s.nextId++}`, type: 'bar', title, labels: [], datasets: [{ label: 'Value', data: [], color: null }], options: defaultOptions(), source: [], spec: null });
const canonType = (t) => (t ? TYPE_WORD[String(t).toLowerCase()] ?? (TYPES.includes(t) ? t : null) : null);

/** Index of a label in the chart ("apples" finds "Apple"), or -1. */
function find(c, text) {
  const k = labelKey(text);
  if (!k) return -1;
  let i = c.labels.findIndex((l) => labelKey(l) === k);
  if (i < 0) i = c.labels.findIndex((l) => labelKey(l).replace(/ /g, '') === k.replace(/ /g, ''));
  return i;
}
const totals = (c) => c.labels.map((_, i) => c.datasets.reduce((a, d) => a + (Number(d.data[i]) || 0), 0));
const multi = (c) => c.datasets.length > 1;
const low = (c, l) => (c.proper ? l : String(l).toLowerCase());
const kindWord = (c) => TYPE_NAME[c.type] ?? 'chart';
const itemsWord = (c, n) => (POINT_TYPES.has(c.type) ? (n === 1 ? 'slice' : 'slices') : c.type === 'bar' ? (n === 1 ? 'bar' : 'bars') : (n === 1 ? 'point' : 'points'));

// ---- creating a chart from a built source -------------------------------------------------------------
/** Put a built chart on screen: the active chart when it is empty, else a new one. */
function place(ctx, args, b, { keepId } = {}) {
  const s = st(ctx);
  let c = keepId ? s.charts.find((x) => x.id === keepId) : null;
  const cur = current(ctx);
  if (!c && cur && !cur.labels.length) c = cur;
  if (!c) { c = blank(s, b.title); s.charts.push(c); }
  const keepStyle = !!keepId;
  c.type = keepStyle ? c.type : canonType(args.type) ?? b.type ?? 'bar';
  c.title = keepStyle ? c.title : b.title;
  c.labels = b.labels;
  c.datasets = b.datasets.map((d, i) => ({ label: d.label, data: d.data, color: keepStyle ? c.datasets[i]?.color ?? null : null }));
  if (!keepStyle) { c.options = { ...defaultOptions(), ...(b.options ?? {}) }; }
  if (!keepId) c.proper = !!b.proper;
  c.source = uniq(b.source);
  c.spec = b.spec ?? null;
  s.active = c.id;
  return c;
}
const created = (ctx, c, what, extra = {}) => {
  const n = c.labels.length;
  const nums = c.datasets.reduce((a, d) => a + d.data.length, 0);
  return done(ctx, `OK, here is ${/^[aeiou]/.test(kindWord(c)) ? 'an' : 'a'} ${kindWord(c)} of ${what} with ${n} ${n === 1 ? 'item' : 'items'}${multi(c) ? ` and ${c.datasets.length} series` : ''}. It is open in the Charts tab.`, { from: c.source, ...extra, data: { chart: c.id, numbers: nums } });
};

// ---- builders: data from the other worlds ---------------------------------------------------------------
const STOPW = new Set(['the', 'a', 'an', 'all', 'my', 'our', 'of', 'some', 'every', 'each', 'these', 'those', 'in', 'on', 'at', 'for']);
const splitList = (t) => String(t).split(/\s*(?:,|;|\band\b)\s*/i).map((x) => x.trim()).filter(Boolean);
const bareWords = (t) => String(t).toLowerCase().replace(/[^a-z' -]+/g, ' ').split(/\s+/).filter((w) => w && !STOPW.has(w));
const singular = (w) => labelKey(w).replace(/ /g, '_');

/** kids.arith holdings -> labels = people, one series per kind of item (or labels = items for one person). */
function buildHoldings(ctx, { who, item }) {
  const spec = String(who ?? 'everyone').toLowerCase().trim();
  const everyone = !spec || /^(everyone|everybody|all|all of them|they|them|the children|the kids|each person|each child|every child|everything|people|the people|each of us|us|we)$/.test(spec);
  let owners = null;
  if (!everyone) {
    const names = splitList(spec).map((n) => n.replace(/^(the|a)\s+/, ''));
    owners = names.map((n) => (/^(i|me|my|myself)$/.test(n) ? 'e.user' : `e.${n.replace(/\s+/g, '_')}`));
    const unknown = names.filter((n, i) => !ctx.get(owners[i]));
    if (unknown.length) return { env: no('missing', `I do not know ${joinAnd(unknown.map(cap))} yet. Tell me, for example: Tom has 5 apples.`) };
  }
  const itemKey = item ? singular(item) : null;
  const pairs = new Map();
  for (const w of ctx.find('kids.arith.holding')) {
    const owner = ctx.val(w, 'owner'), it = ctx.val(w, 'item');
    if (!owner || !it || (owners && !owners.includes(owner)) || (itemKey && it !== itemKey)) continue;
    pairs.set(`${owner}|${it}`, { owner, item: it });
  }
  const byOwner = new Map(), items = [];
  const from = [];
  for (const { owner, item: it } of pairs.values()) {
    const r = ctx.ask({ type: 'kids.arith.holding', seek: 'count', where: { owner, item: it } });
    if (r.status !== 'supported') continue;
    if (!byOwner.has(owner)) byOwner.set(owner, new Map());
    byOwner.get(owner).set(it, Number(r.value));
    if (!items.includes(it)) items.push(it);
    from.push(...(r.from ?? []));
  }
  if (!byOwner.size) {
    return { env: no('missing', itemKey ? `I do not know who has ${plural(itemKey)} yet.` : 'I do not know what anyone has yet. Tell me, for example: Tom has 5 apples. Ana has 3 apples.') };
  }
  const nameOf = (id) => cap(ctx.name(id));
  const ownerIds = [...byOwner.keys()];
  let labels, datasets, title;
  if (ownerIds.length === 1 && items.length > 1) {
    labels = items.map((i) => cap(plural(i)));
    datasets = [{ label: nameOf(ownerIds[0]), data: items.map((i) => byOwner.get(ownerIds[0]).get(i) ?? 0) }];
    title = ownerIds[0] === 'e.user' ? 'What you have' : `What ${nameOf(ownerIds[0])} has`;
  } else {
    labels = ownerIds.map(nameOf);
    datasets = items.map((i) => ({ label: cap(plural(i)), data: ownerIds.map((o) => byOwner.get(o).get(i) ?? 0) }));
    title = items.length === 1 ? cap(plural(items[0])) : everyone ? 'Who has what' : `What ${joinAnd(ownerIds.map(nameOf))} ${ownerIds.length === 1 ? 'has' : 'have'}`;
  }
  return { b: { title, labels, datasets, proper: !(ownerIds.length === 1 && items.length > 1), source: from, spec: { kind: 'holdings', args: { who: who ?? 'everyone', item } } }, what: everyone ? (itemKey ? `the ${plural(itemKey)}` : 'what everyone has') : `what ${joinAnd(ownerIds.map(nameOf))} ${ownerIds.length === 1 ? 'has' : 'have'}` };
}

const SHOP_GROUPS = {
  toy: 'g_toys', plaything: 'g_toys', game: 'g_toys', fruit: 'g_fruit', school: 'g_school', stationery: 'g_school', supply: 'g_school', schoolthing: 'g_school',
  snack: 'g_snacks', treat: 'g_snacks', sweet: 'g_snacks', drink: 'g_drinks', beverage: 'g_drinks', food: 'g_food', foods: 'g_food', grocery: 'g_food', everything: 'g_all', all: 'g_all', shop: 'g_all', product: 'g_all', price: 'g_all', thing: 'g_all', item: 'g_all',
};
/** kids.shop price list -> one bar per item (a group such as toys or fruit, or a list of items). */
function buildPrices(ctx, { what }) {
  const raw = String(what ?? '').toLowerCase();
  const all = ctx.lexicon('lex.kids.shop.items');
  let names = [], groupName = null;
  const cleaned = bareWords(raw).filter((w) => !['things', 'stuff', 'items', 'products', 'supplies', 'prices', 'price', 'costs', 'cost'].includes(w) || /^(everything|all)$/.test(w));
  const gKey = (w) => SHOP_GROUPS[singular(w)] ?? SHOP_GROUPS[w];
  const explicit = splitList(raw).map((p) => bareWords(p).join('_')).filter(Boolean);
  const explicitHits = explicit.map(singular).filter((w) => all.includes(w));
  if (!cleaned.length && !/\b(all|everything)\b/.test(raw)) groupName = 'g_all';
  else if (explicitHits.length && explicitHits.length === explicit.length) names = explicitHits;
  else if (cleaned.some((w) => gKey(w))) groupName = gKey(cleaned.find((w) => gKey(w)));
  else if (/school/.test(raw)) groupName = 'g_school';
  else if (explicitHits.length) names = explicitHits;
  if (groupName) names = groupName === 'g_all' ? all : ctx.lexicon(`lex.data.charts.${groupName}`);
  if (!names.length) return { env: no('missing', `I do not know a group of things called "${String(what).trim()}". Try the prices of the toys, the fruit, the school things, the snacks or the drinks.`) };
  const labels = [], data = [], from = [];
  for (const n of names) {
    const r = ctx.ask({ type: 'kids.shop.price', seek: 'cost', where: { item: n } });
    if (r.status !== 'supported') continue;
    labels.push(cap(sp(n))); data.push(Number(r.value)); from.push(...(r.from ?? []));
  }
  if (!labels.length) return { env: no('missing', 'I could not find any prices for that.') };
  const nice = groupName ? ({ g_toys: 'toys', g_fruit: 'fruit', g_school: 'school things', g_snacks: 'snacks', g_drinks: 'drinks', g_food: 'food', g_all: 'everything in the shop' })[groupName] : joinAnd(labels.map((l) => l.toLowerCase()));
  return { b: { title: `Prices of ${nice} (lei)`, labels, datasets: [{ label: 'Price (lei)', data }], source: from, spec: { kind: 'prices', args: { what } } }, what: `the prices of ${nice}` };
}

const listKey = (raw) => {
  const n = String(raw ?? '').toLowerCase().replace(/[^a-z0-9' -]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(my|the|a|an|our)\s+/, '').replace(/\s+list$/, '');
  if (/^(to do|todo|to-do|tasks?|things to do|chores?)$/.test(n)) return 'to-do';
  if (/^(shopping|shop|grocery|groceries)$/.test(n)) return 'shopping';
  if (/^reminders?$/.test(n)) return 'reminders';
  return n || 'to-do';
};
const entries = (ctx) => ctx.ordered('kids.tasks.entry').filter((w) => ctx.val(w, 'progress') !== 'removed');
/** kids.tasks entries -> items of one list (quantities from "3 apples"), or the number of items on every list. */
function buildList(ctx, { list }) {
  const raw = String(list ?? '').trim().toLowerCase();
  const every = !raw || /^(all|all my|every|my|the|all the|all of my)$/.test(raw);
  const es = entries(ctx);
  if (every) {
    if (!es.length) return { env: no('missing', 'There is nothing on any list yet. Try: add milk, eggs and bread to my shopping list.') };
    const names = uniq(es.map((w) => ctx.val(w, 'list')));
    const todo = names.map((n) => es.filter((w) => ctx.val(w, 'list') === n && ctx.val(w, 'progress') !== 'done').length);
    const dn = names.map((n) => es.filter((w) => ctx.val(w, 'list') === n && ctx.val(w, 'progress') === 'done').length);
    const datasets = [{ label: 'To do', data: todo }];
    if (dn.some((x) => x)) datasets.push({ label: 'Done', data: dn });
    return { b: { title: 'Items on my lists', labels: names.map(cap), datasets, source: es.map((w) => w.id), spec: { kind: 'list', args: { list: '' } } }, what: 'your lists' };
  }
  const key = listKey(list);
  const own = es.filter((w) => ctx.val(w, 'list') === key);
  if (!own.length) return { env: no('missing', `There is nothing on your ${key} list yet, so I cannot chart it.`) };
  const by = new Map();
  for (const w of own) {
    const t = String(ctx.val(w, 'text'));
    const m = t.match(/^(\d+(?:\.\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(.+)$/i);
    const qty = m ? toNum(m[1]) : 1;
    const label = tidyLabel(m ? m[2] : t);
    const e = by.get(labelKey(label)) ?? { label, todo: 0, done: 0, from: [] };
    e[ctx.val(w, 'progress') === 'done' ? 'done' : 'todo'] += qty;
    e.from.push(w.id);
    by.set(labelKey(label), e);
  }
  const rows = [...by.values()];
  const datasets = [{ label: 'To do', data: rows.map((r) => r.todo) }];
  if (rows.some((r) => r.done)) datasets.push({ label: 'Done', data: rows.map((r) => r.done) });
  return { b: { title: `${cap(key)} list`, labels: rows.map((r) => r.label), datasets, source: rows.flatMap((r) => r.from), spec: { kind: 'list', args: { list } } }, what: `your ${key} list` };
}

const HABITATS = { sea: 'sea', ocean: 'sea', farm: 'farm', forest: 'forest', wood: 'forest', river: 'river', jungle: 'jungle', desert: 'desert', polar: 'polar', arctic: 'polar', home: 'home', pet: 'home', garden: 'garden', savanna: 'savanna', grassland: 'grassland', mountain: 'mountain' };
const CLASSES = { mammal: 'mammal', bird: 'bird', fish: 'fish', insect: 'insect', bug: 'insect', reptile: 'reptile', amphibian: 'amphibian', arachnid: 'arachnid' };
const ANIMAL = 'kids.animals.animal';
/** kids.animals legs -> one bar per animal (a group such as sea animals, or named animals). */
function buildLegs(ctx, { what }) {
  const raw = String(what ?? '').trim();
  const known = ctx.lexicon('lex.kids.animals.names');
  const named = splitList(raw).map((p) => bareWords(p).join('_')).filter(Boolean).map((w) => (known.includes(w) ? w : singular(w)));
  let names = [], groupText = null;
  if (named.length && named.every((n) => known.includes(n))) names = [...new Set(named)];
  else {
    const ws = bareWords(raw).map((x) => (x.endsWith('ies') ? `${x.slice(0, -3)}y` : x.replace(/s$/, '')));
    const where = {};
    for (const w of ws) {
      if (HABITATS[w]) where.habitat = HABITATS[w];
      else if (CLASSES[w]) where.class = CLASSES[w];
      else if (w === 'flying' || w === 'flier') where.can_fly = 'true';
      else if (w === 'swimming' || w === 'swimmer') where.can_swim = 'true';
    }
    if (!Object.keys(where).length) return { env: no('missing', `I do not know a group of animals called "${raw}". Try the sea animals, the farm animals, the birds, the insects, or name some animals.`) };
    const found = ctx.ask({ type: ANIMAL, seek: 'matching', where, mode: 'list' });
    if (found.status !== 'supported' || !found.values?.length) return { env: no('missing', `I do not know any ${raw} in my knowledge base yet.`) };
    names = found.values;
    groupText = bareWords(raw).join(' ');
  }
  const labels = [], data = [], from = [];
  for (const n of names) {
    const r = ctx.ask({ type: ANIMAL, seek: 'legs', where: { name: n } });
    if (r.status !== 'supported') continue;
    labels.push(cap(sp(n))); data.push(Number(r.value)); from.push(...(r.from ?? []));
  }
  if (!labels.length) return { env: no('missing', 'I do not know how many legs those animals have.') };
  const nice = groupText ?? joinAnd(labels.map((l) => l.toLowerCase()));
  return { b: { title: `Legs of ${nice}`, labels, datasets: [{ label: 'Legs', data }], source: from, spec: { kind: 'legs', args: { what } } }, what: `the legs of ${nice}` };
}

const BUILDERS = { holdings: buildHoldings, prices: buildPrices, list: buildList, legs: buildLegs };
function make(ctx, kind, args) {
  const r = BUILDERS[kind](ctx, args);
  if (r.env) return r;
  const specArgs = { ...r.b.spec.args };
  r.b.spec = { kind, args: specArgs };
  return r;
}
function createFrom(ctx, kind, args) {
  const r = make(ctx, kind, args);
  if (r.env) return r.env;
  const c = place(ctx, args, r.b);
  return created(ctx, c, r.what);
}
export const fromHoldings = (ctx, args) => createFrom(ctx, 'holdings', args);
export const fromPrices = (ctx, args) => createFrom(ctx, 'prices', args);
export const fromList = (ctx, args) => createFrom(ctx, 'list', args);
export const fromLegs = (ctx, args) => createFrom(ctx, 'legs', args);

export function fromText(ctx, args) {
  const { items, bad } = parseData(args.text);
  if (!items.length) return no('missing', `I could not find numbers in "${String(args.text).trim()}". Say it like this: "make a chart: apples 5, pears 3, plums 8".`);
  const seen = new Map();
  for (const it of items) seen.set(labelKey(it.label), it);
  const rows = [...seen.values()];
  const s = st(ctx);
  const title = `Chart ${s.nextId}`;
  const type = canonType(args.type);
  const c = place(ctx, args, { title, proper: rows.every((r) => r.proper), type: type ?? 'bar', labels: rows.map((r) => r.label), datasets: [{ label: 'Value', data: rows.map((r) => r.value) }], source: idsOf(args), spec: null });
  const extra = bad.length ? ` I skipped "${bad.join('", "')}" because I found no number.` : '';
  return done(ctx, `OK, here is ${/^[aeiou]/.test(kindWord(c)) ? 'an' : 'a'} ${kindWord(c)} with ${rows.length} ${rows.length === 1 ? 'item' : 'items'}: ${joinAnd(rows.map((r) => `${low(c, r.label)} ${fmt(r.value)}`))}.${extra}`, { from: c.source });
}

export function newChart(ctx, args = {}) {
  const s = st(ctx);
  const c = blank(s, args.title ? cap(String(args.title).trim()) : `Chart ${s.nextId}`);
  c.type = canonType(args.type) ?? 'bar';
  s.charts.push(c); s.active = c.id;
  return done(ctx, `OK, a new empty ${kindWord(c)} called "${c.title}". Add data, for example: "add apples 5".`);
}

export function refresh(ctx) {
  const r = needChart(ctx);
  if (r.env) return r.env;
  const c = r.c;
  if (!c.spec) return no('unsupported', 'You typed the numbers of this chart yourself, so there is nothing to look up again. Say "add bananas 4" or "change pears to 6" to change them.');
  const m = make(ctx, c.spec.kind, c.spec.args);
  if (m.env) return m.env;
  const before = JSON.stringify(c.datasets.map((d) => d.data)) + c.labels.join('|');
  place(ctx, {}, m.b, { keepId: c.id });
  const same = before === JSON.stringify(c.datasets.map((d) => d.data)) + c.labels.join('|');
  return done(ctx, same ? `The chart "${c.title}" is already up to date.` : `OK, I updated the chart "${c.title}" from what you told me since.`, { from: c.source });
}

export function duplicate(ctx) {
  const r = needChart(ctx);
  if (r.env) return r.env;
  const s = st(ctx);
  const copy = structuredClone(r.c);
  copy.id = `c${s.nextId++}`;
  copy.title = `${r.c.title} copy`;
  s.charts.splice(s.charts.indexOf(r.c) + 1, 0, copy);
  s.active = copy.id;
  return done(ctx, `OK, I made a copy called "${copy.title}". You can change it without touching the first one.`);
}

// ---- changing the data ----------------------------------------------------------------------------------
function addRows(c, rows) {
  const added = [], changed = [];
  for (const { label, value } of rows) {
    const i = find(c, label);
    if (i >= 0) { c.datasets[0].data[i] = value; changed.push(c.labels[i]); continue; }
    c.labels.push(label);
    c.datasets.forEach((d, k) => d.data.push(k === 0 ? value : 0));
    added.push(label);
  }
  return { added, changed };
}
export function addPoint(ctx, args) {
  const r = needChart(ctx);
  if (r.env) return r.env;
  const text = args.n !== undefined && args.l !== undefined ? `${args.l} ${args.n}` : args.text;
  const { items, bad } = parseData(text);
  if (!items.length) return no('unsupported', 'What should I add? Say, for example: "add bananas 4".');
  const c = r.c;
  if (!c.labels.length) c.proper = items.every((i) => i.proper);
  const { added, changed } = addRows(c, items);
  c.source = uniq([...c.source, ...idsOf(args)]);
  const parts = [];
  if (added.length) parts.push(`I added ${joinAnd(items.filter((i) => added.includes(i.label)).map((i) => `${low(c, i.label)} (${fmt(i.value)})`))}`);
  if (changed.length) parts.push(`${joinAnd(changed.map((x) => low(c, x)))} ${changed.length === 1 ? 'was' : 'were'} already there, so I changed ${changed.length === 1 ? 'it' : 'them'}`);
  const tail = multi(c) ? ' The new numbers went into the first series.' : '';
  return done(ctx, `OK, ${parts.join(' and ')}.${tail}${bad.length ? ` I skipped "${bad.join('", "')}".` : ''}`);
}

const notThere = (c, l) => no('missing', `I do not see ${String(l).trim()} in the chart "${c.title}". It has ${joinAnd(c.labels.map((x) => low(c, x)))}.`.replace(' It has .', ''));
export function removePoint(ctx, { l }) {
  const r = needChart(ctx);
  if (r.env) return r.env;
  const c = r.c, i = find(c, l);
  if (i < 0) return notThere(c, l);
  const [label] = c.labels.splice(i, 1);
  c.datasets.forEach((d) => d.data.splice(i, 1));
  delete c.options.pointColors[label];
  return done(ctx, `OK, I removed ${low(c, label)} from the chart.${c.labels.length ? '' : ' The chart is empty now.'}`);
}
export function setPoint(ctx, { l, n }) {
  const r = needChart(ctx);
  if (r.env) return r.env;
  const c = r.c, i = find(c, l);
  const v = toNum(n);
  if (i < 0) return notThere(c, l);
  if (!Number.isFinite(v)) return no('unsupported', 'Which number should it be?');
  const old = c.datasets[0].data[i];
  c.datasets[0].data[i] = v;
  return done(ctx, `OK, ${low(c, c.labels[i])} is now ${fmt(v)} (it was ${fmt(old)}).`);
}
export function adjustPoint(ctx, { l, by, dir, factor }) {
  const r = needChart(ctx);
  if (r.env) return r.env;
  const c = r.c, i = find(c, l);
  if (i < 0) return notThere(c, l);
  const old = c.datasets[0].data[i];
  let v;
  if (factor !== undefined) v = old * Number(factor);
  else { const d = toNum(by); if (!Number.isFinite(d)) return no('unsupported', 'By how much?'); v = dir === 'down' ? old - d : old + d; }
  c.datasets[0].data[i] = round(v, 6);
  return done(ctx, `OK, ${low(c, c.labels[i])} went from ${fmt(old)} to ${fmt(c.datasets[0].data[i])}.`);
}
export function renamePoint(ctx, { l, to }) {
  const r = needChart(ctx);
  if (r.env) return r.env;
  const c = r.c, i = find(c, l);
  if (i < 0) return notThere(c, l);
  const old = c.labels[i];
  c.labels[i] = tidyLabel(to);
  if (c.options.pointColors[old]) { c.options.pointColors[c.labels[i]] = c.options.pointColors[old]; delete c.options.pointColors[old]; }
  return done(ctx, `OK, ${low(c, old)} is now called ${low(c, c.labels[i])}.`);
}
export function clearData(ctx) {
  const r = needChart(ctx);
  if (r.env) return r.env;
  const c = r.c;
  if (!c.labels.length) return ok(`The chart "${c.title}" is already empty.`);
  c.labels = []; c.datasets.forEach((d) => { d.data = []; }); c.options.pointColors = {}; c.spec = null;
  return done(ctx, `OK, I emptied the chart "${c.title}". You can say "add apples 5" to start again.`);
}

// ---- style ----------------------------------------------------------------------------------------------
export function setType(ctx, args) {
  const type = canonType(args.type);
  if (args.type && !type) return no('unsupported', `I can draw bar, line, pie, doughnut, radar, polar area and scatter charts, not "${sp(args.type)}".`);
  let c = current(ctx);
  if (!c) {
    const s = st(ctx);
    c = blank(s, `Chart ${s.nextId}`); c.type = type ?? 'bar'; s.charts.push(c); s.active = c.id;
    if (args.stacked === 'true') c.options.stacked = true;
    return done(ctx, `OK, a new empty ${kindWord(c)}. Add data, for example: "add apples 5".`);
  }
  const was = c.type;
  if (type) c.type = type;
  if (args.stacked !== undefined) c.options.stacked = args.stacked === 'true';
  if (args.stacked === 'true' && !type && POINT_TYPES.has(c.type)) c.type = 'bar';
  const stackNote = args.stacked === 'true' ? ' with stacked series' : '';
  if (type && was === type && args.stacked === undefined) return ok(`It is already a ${kindWord(c)}.`);
  touch(ctx); show(ctx);
  const note = type === 'scatter' && c.labels.length && c.labels.some((l) => !Number.isFinite(Number(l))) ? ' The x position follows the order of the items unless the labels are numbers.' : '';
  return ok(`OK, it is ${/^[aeiou]/.test(kindWord(c)) ? 'an' : 'a'} ${kindWord(c)} now${stackNote}.${note}`);
}
export function setTitle(ctx, { t }) {
  const r = needChart(ctx);
  if (r.env) return r.env;
  const title = String(t ?? '').trim().replace(/^["'“”]+|["'“”]+$/g, '');
  if (!title) return no('unsupported', 'What should the chart be called?');
  r.c.title = cap(title);
  return done(ctx, `OK, the chart is called "${r.c.title}".`);
}
export function removeTitle(ctx) {
  const r = needChart(ctx);
  if (r.env) return r.env;
  r.c.title = '';
  return done(ctx, 'OK, the chart has no title now. You can give it one again with "call it Fruit".');
}
const mix = (hex, other, t) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = p(hex), b = p(other);
  return `#${a.map((x, i) => Math.round(x + (b[i] - x) * t).toString(16).padStart(2, '0')).join('')}`;
};
const SHADE = { light: ['#ffffff', 0.35], pale: ['#ffffff', 0.55], bright: ['#ffffff', 0.12], dark: ['#000000', 0.32], deep: ['#000000', 0.22] };
function colorHex(name, shade) {
  const base = COLORS[String(name).toLowerCase()];
  if (!base) return null;
  const s = SHADE[String(shade ?? '').toLowerCase()];
  return s ? mix(base, s[0], s[1]) : base;
}
export function setColor(ctx, { c: name, shade, label }) {
  const r = needChart(ctx);
  if (r.env) return r.env;
  const hex = colorHex(name, shade);
  if (!hex) return no('unsupported', `I do not know the color ${sp(name)}. Try red, orange, yellow, green, blue, purple, pink, teal or gray.`);
  const c = r.c;
  const word = `${shade ? `${shade} ` : ''}${name}`;
  if (label) {
    const i = find(c, label);
    if (i < 0) return notThere(c, label);
    c.options.pointColors[c.labels[i]] = hex;
    return done(ctx, `OK, ${low(c, c.labels[i])} is ${word} now.`);
  }
  c.options.palette = null; c.options.pointColors = {};
  c.datasets.forEach((d, i) => { d.color = i === 0 ? hex : mix(hex, '#ffffff', Math.min(0.7, i * 0.3)); });
  return done(ctx, `OK, the chart is ${word} now.${multi(c) ? ' The other series are lighter shades of it.' : ''}`);
}
export function setPalette(ctx, { p }) {
  const r = needChart(ctx);
  if (r.env) return r.env;
  const key = String(p ?? '').toLowerCase();
  if (!(key in PALETTE_WORD)) return no('unsupported', 'I know the rainbow, pastel, ocean, forest, sunset, warm, cool, neon and earth colors, and "different colors".');
  const c = r.c, name = PALETTE_WORD[key];
  c.options.pointColors = {};
  c.datasets.forEach((d) => { d.color = null; });
  c.options.palette = name;
  if (!name) return done(ctx, 'OK, I went back to the default colors.');
  return done(ctx, `OK, ${name === 'classic' ? 'every bar has its own color now' : `the chart uses ${name} colors now`}.`);
}
const UP = new Set(['biggest', 'largest', 'highest', 'greatest', 'most', 'big', 'large', 'high', 'top', 'descending', 'tallest', 'maximum', 'max', 'longest', 'best']);
const DOWN = new Set(['smallest', 'lowest', 'least', 'small', 'low', 'bottom', 'ascending', 'shortest', 'minimum', 'min', 'fewest', 'worst']);
export function setSort(ctx, { from, mode }) {
  const r = needChart(ctx);
  if (r.env) return r.env;
  const c = r.c;
  const m = mode ?? (UP.has(String(from)) ? 'desc' : DOWN.has(String(from)) ? 'asc' : 'desc');
  if (m === 'none') {
    if (!c.options.sort) return ok('The chart is not sorted.');
    c.options.sort = null;
    return done(ctx, 'OK, the items are in the order you gave them again.');
  }
  c.options.sort = m;
  const how = { desc: 'from the biggest to the smallest', asc: 'from the smallest to the biggest', alpha: 'alphabetically' }[m];
  return done(ctx, `OK, the chart is sorted ${how}.${c.type === 'scatter' ? ' (A scatter plot keeps its order.)' : ''}`);
}
export function setOrientation(ctx, { o }) {
  const r = needChart(ctx);
  if (r.env) return r.env;
  const c = r.c;
  const horizontal = /^(horizontal|horizontally|sideways)$/.test(String(o));
  let note = '';
  if (horizontal && !['bar', 'line'].includes(c.type)) { c.type = 'bar'; note = ' I switched to a bar chart because only bar and line charts can lie down.'; }
  if (!horizontal && c.options.horizontal === false && !note) return ok('The chart is already vertical.');
  if (horizontal && c.options.horizontal && !note) return ok('The chart is already horizontal.');
  c.options.horizontal = horizontal;
  return done(ctx, `OK, the ${kindWord(c)} is ${horizontal ? 'horizontal' : 'vertical'} now.${note}`);
}
export function setValues(ctx, { mode }) {
  const r = needChart(ctx);
  if (r.env) return r.env;
  const c = r.c;
  if (mode === 'off') { c.options.showValues = false; return done(ctx, 'OK, the numbers are hidden.'); }
  if (mode === 'percent') { c.options.showValues = 'percent'; return done(ctx, 'OK, the chart shows percentages of the total.'); }
  c.options.showValues = true;
  return done(ctx, 'OK, the chart shows the numbers.');
}
export function setLegend(ctx, { on }) {
  const r = needChart(ctx);
  if (r.env) return r.env;
  const yes = on !== 'false';
  r.c.options.showLegend = yes;
  return done(ctx, yes ? 'OK, the legend is on.' : 'OK, the legend is hidden.');
}
export function setStacked(ctx, { on }) {
  const r = needChart(ctx);
  if (r.env) return r.env;
  const c = r.c, yes = on !== 'false';
  c.options.stacked = yes;
  if (yes && POINT_TYPES.has(c.type)) c.type = 'bar';
  return done(ctx, yes ? `OK, the series are stacked.${multi(c) ? '' : ' (Stacking shows when a chart has two or more series, for example what everyone has.)'}` : 'OK, the series stand side by side.');
}

// ---- questions answered from the chart data ----------------------------------------------------------------
const valueText = (c, i) => (multi(c) ? `${fmt(totals(c)[i])} in total (${c.datasets.map((d) => `${d.label} ${fmt(d.data[i])}`).join(', ')})` : fmt(c.datasets[0].data[i]));
export function extreme(ctx, { w }) {
  const r = needData(ctx);
  if (r.env) return r.env;
  const c = r.c, t = totals(c);
  const up = !DOWN.has(String(w));
  const best = up ? Math.max(...t) : Math.min(...t);
  const idx = t.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0);
  const names = idx.map((i) => c.labels[i]);
  const word = up ? 'biggest' : 'smallest';
  const unit = multi(c) ? ' in total' : '';
  if (idx.length === c.labels.length && idx.length > 1) return ok(`They are all the same: ${fmt(best)}.`, { from: c.source });
  return ok(names.length === 1 ? `${names[0]} is the ${word}, with ${fmt(best)}${unit}.` : `${joinAnd(names)} are tied for the ${word}, with ${fmt(best)} each${unit}.`, { from: c.source });
}
export function total(ctx) {
  const r = needData(ctx);
  if (r.env) return r.env;
  const c = r.c, t = totals(c), sum = t.reduce((a, b) => a + b, 0);
  const per = multi(c) ? ` (${c.datasets.map((d) => `${d.label} ${fmt(d.data.reduce((a, b) => a + b, 0))}`).join(', ')})` : '';
  return ok(`The total is ${fmt(sum)}${per}.`, { from: c.source });
}
export function average(ctx) {
  const r = needData(ctx);
  if (r.env) return r.env;
  const c = r.c, t = totals(c);
  return ok(`The average is ${fmt(t.reduce((a, b) => a + b, 0) / t.length)} over ${t.length} ${itemsWord(c, t.length)}.`, { from: c.source });
}
export function difference(ctx, { a, b }) {
  const r = needData(ctx);
  if (r.env) return r.env;
  const c = r.c, i = find(c, a), j = find(c, b);
  if (i < 0) return notThere(c, a);
  if (j < 0) return notThere(c, b);
  const t = totals(c), d = round(t[i] - t[j], 6);
  const A = c.labels[i], B = c.labels[j];
  if (d === 0) return ok(`${A} and ${B} are the same: ${fmt(t[i])} each.`, { from: c.source });
  return ok(`${A} is ${fmt(Math.abs(d))} ${d > 0 ? 'more' : 'less'} than ${B}: ${fmt(t[i])} against ${fmt(t[j])}.`, { from: c.source });
}
export function compare(ctx, { w, a, b }) {
  const r = needData(ctx);
  if (r.env) return r.env;
  const c = r.c, i = find(c, a), j = find(c, b);
  if (i < 0) return notThere(c, a);
  if (j < 0) return notThere(c, b);
  const t = totals(c), up = !DOWN.has(String(w));
  if (t[i] === t[j]) return ok(`${c.labels[i]} and ${c.labels[j]} are the same: ${fmt(t[i])} each.`, { from: c.source });
  const win = (t[i] > t[j]) === up ? i : j, lose = win === i ? j : i;
  return ok(`${c.labels[win]} is ${up ? 'bigger' : 'smaller'}: ${fmt(t[win])} against ${fmt(t[lose])}.`, { from: c.source });
}
export function percent(ctx, { l }) {
  const r = needData(ctx);
  if (r.env) return r.env;
  const c = r.c, i = find(c, l);
  if (i < 0) return notThere(c, l);
  const t = totals(c), sum = t.reduce((a, b) => a + b, 0);
  if (!sum) return no('missing', 'The total is zero, so there are no percentages.');
  return ok(`${c.labels[i]} is ${round((t[i] / sum) * 100, 1)}% of the total (${fmt(t[i])} of ${fmt(sum)}).`, { from: c.source });
}
function describeValue(c, i) {
  const t = totals(c), sum = t.reduce((a, b) => a + b, 0);
  const share = sum ? ` That is ${round((t[i] / sum) * 100, 1)}% of the total.` : '';
  return `${c.labels[i]} is ${valueText(c, i)}.${share}`;
}
export function valueOf(ctx, { l }) {
  const r = needData(ctx);
  if (r.env) return r.env;
  const i = find(r.c, l);
  if (i < 0) return notThere(r.c, l);
  return ok(describeValue(r.c, i), { from: r.c.source });
}
export function countItems(ctx) {
  const r = needChart(ctx);
  if (r.env) return r.env;
  const n = r.c.labels.length;
  return ok(`There ${n === 1 ? 'is' : 'are'} ${n} ${itemsWord(r.c, n)} in the chart.`);
}
const orderedIdx = (c) => {
  const idx = c.labels.map((_, i) => i), t = totals(c);
  if (c.options.sort === 'desc') idx.sort((a, b) => t[b] - t[a]);
  else if (c.options.sort === 'asc') idx.sort((a, b) => t[a] - t[b]);
  else if (c.options.sort === 'alpha') idx.sort((a, b) => c.labels[a].localeCompare(c.labels[b]));
  return idx;
};
function summary(c) {
  const idx = orderedIdx(c);
  const items = idx.map((i) => (multi(c) ? `${c.labels[i]} ${fmt(totals(c)[i])}` : `${c.labels[i]} ${fmt(c.datasets[0].data[i])}`));
  const t = totals(c), big = Math.max(...t);
  const top = c.labels.filter((_, i) => t[i] === big);
  const name = c.title ? ` called "${c.title}"` : '';
  return `${/^[aeiou]/.test(kindWord(c)) ? 'An' : 'A'} ${kindWord(c)}${name} with ${c.labels.length} ${c.labels.length === 1 ? 'item' : 'items'}${multi(c) ? ` and ${c.datasets.length} series (${c.datasets.map((d) => d.label).join(', ')})` : ''}: ${joinAnd(items)}. The biggest is ${joinAnd(top)}.`;
}
export function describe(ctx) {
  const r = needData(ctx);
  if (r.env) return r.env;
  return ok(summary(r.c), { from: r.c.source });
}
export function read(ctx) {
  const r = needData(ctx);
  if (r.env) return r.env;
  ctx.effect('speech.say', { text: summary(r.c) });
  return ok(`OK, reading the chart "${r.c.title}".`);
}

// ---- several charts ---------------------------------------------------------------------------------------
const listText = (ctx) => st(ctx).charts.map((c, i) => `${i + 1}. ${c.title || 'Untitled'} (${kindWord(c)})`).join('; ');
export function switchChart(ctx, { ord, n, dir, t }) {
  const s = st(ctx);
  if (!s.charts.length) return no('missing', NONE);
  const at = s.charts.findIndex((c) => c.id === s.active);
  let idx = -1;
  if (dir) idx = dir === 'next' ? at + 1 : at - 1;
  else if (ord || n !== undefined) {
    const pos = n !== undefined ? Number(n) : ORD[ord];
    idx = pos === -1 ? s.charts.length - 1 : pos - 1;
  } else if (t) {
    const k = labelKey(t);
    idx = s.charts.findIndex((c) => labelKey(c.title) === k || labelKey(c.title).includes(k));
    if (idx < 0) return no('missing', `I have no chart called ${String(t).trim()}. I have: ${listText(ctx)}.`);
  }
  if (idx < 0 || idx >= s.charts.length) {
    if (dir) return no('missing', dir === 'next' ? 'This is the last chart.' : 'This is the first chart.');
    return no('missing', s.charts.length === 1 ? 'I have only one chart.' : `I only have ${s.charts.length} charts.`);
  }
  s.active = s.charts[idx].id;
  const c = s.charts[idx];
  return done(ctx, `OK, here is chart ${idx + 1}: "${c.title}".`);
}
export function deleteChart(ctx, { ord, n, all }) {
  const s = st(ctx);
  if (!s.charts.length) return no('missing', NONE);
  if (all === 'true') {
    const k = s.charts.length;
    s.charts = []; s.active = null;
    touch(ctx); show(ctx);
    return ok(`OK, I deleted ${k === 1 ? 'the chart' : `all ${k} charts`}.`);
  }
  let idx = s.charts.findIndex((c) => c.id === s.active);
  if (ord || n !== undefined) {
    const pos = n !== undefined ? Number(n) : ORD[ord];
    idx = pos === -1 ? s.charts.length - 1 : pos - 1;
    if (idx < 0 || idx >= s.charts.length) return no('missing', `I only have ${s.charts.length} ${s.charts.length === 1 ? 'chart' : 'charts'}.`);
  }
  const [gone] = s.charts.splice(idx, 1);
  if (s.active === gone.id) s.active = (s.charts[Math.min(idx, s.charts.length - 1)] ?? null)?.id ?? null;
  touch(ctx); show(ctx);
  return ok(`OK, I deleted the chart "${gone.title}".${s.charts.length ? ` ${s.charts.length === 1 ? 'One chart is' : `${s.charts.length} charts are`} left.` : ' There are no charts left.'}`);
}
export function listCharts(ctx) {
  const s = st(ctx);
  if (!s.charts.length) return no('missing', NONE);
  return ok(`You have ${s.charts.length} ${s.charts.length === 1 ? 'chart' : 'charts'}: ${listText(ctx)}.`);
}

// ---- export ----------------------------------------------------------------------------------------------
export function download(ctx, { format } = {}) {
  const r = needData(ctx);
  if (r.env) return r.env;
  const fmtName = /jpe?g/.test(String(format)) ? 'jpeg' : 'png';
  const filename = `${slug(r.c.title || 'chart')}.${fmtName === 'jpeg' ? 'jpg' : 'png'}`;
  show(ctx);
  ctx.effect('charts.download', { filename, format: fmtName, chart: r.c.id });
  return ok(`OK, I am saving the chart "${r.c.title}" as the picture ${filename}.`);
}
/** CSV text of a chart (labels in the first column, one column per series). */
export function csv(c) {
  const q = (x) => (/[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x));
  return [['Label', ...c.datasets.map((d) => d.label)].map(q).join(','), ...c.labels.map((l, i) => [l, ...c.datasets.map((d) => d.data[i])].map(q).join(','))].join('\n') + '\n';
}
export function downloadData(ctx) {
  const r = needData(ctx);
  if (r.env) return r.env;
  const filename = `${slug(r.c.title || 'chart')}.csv`;
  ctx.effect('file.download', { filename, mime: 'text/csv', content: csv(r.c) });
  return ok(`OK, I am downloading the numbers of "${r.c.title}" as ${filename}.`);
}
export function copyData(ctx) {
  const r = needData(ctx);
  if (r.env) return r.env;
  const c = r.c;
  const text = [c.title, ...c.labels.map((l, i) => `${l}: ${c.datasets.map((d) => fmt(d.data[i])).join(', ')}`)].filter(Boolean).join('\n');
  ctx.effect('clipboard.copy', { text });
  return ok('OK, I copied the numbers to the clipboard.');
}
export function toDocument(ctx) {
  const r = needData(ctx);
  if (r.env) return r.env;
  const probe = ctx.request('doc.addImage', { chart: r.c.id, title: r.c.title });
  if (probe.status === 'supported') return ok(probe.value ?? 'OK, the chart is in the document.');
  return no('unsupported', 'The document editor cannot hold pictures yet. I can put the numbers in the document instead: say "put the chart data in the document".');
}
export function toDocumentData(ctx) {
  const r = needData(ctx);
  if (r.env) return r.env;
  const c = r.c;
  const h = ctx.request('doc.addHeading', { text: c.title || 'Chart' });
  if (h.status !== 'supported') return no('unsupported', 'I cannot reach the document editor.');
  const rows = c.labels.map((l, i) => `${l} ${c.datasets.map((d) => fmt(d.data[i])).join(' / ')}`);
  ctx.request('doc.addList', { text: rows.join(', ') });
  return ok(`OK, I put the numbers of "${c.title}" in the document as a list.`, { from: c.source });
}

/** The host reports how an effect went (vision section 8). */
export function onObservation(ctx, obs) {
  if (obs.effect === 'charts.download' && obs.ok === false) return { reply: `I could not save the picture${obs.detail ? ` (${obs.detail})` : ''}. Open the Charts tab and try again.` };
  return null;
}

// ---- state-aware commands: the click on a bar and commands about labels that exist in the chart ------------------------
// Words such as "remove plums" or "make the sun red" also mean something in other worlds (a drawing, a document). This hook runs
// before formalization and only takes a message when its label really is in the active chart, so the other worlds keep theirs.
const SHADES_RE = '(?:(light|dark|pale|bright|deep)\\s+)?';
const COLOR_RE = new RegExp(`^(?:make|paint|color|colour|turn|change|set)\\s+(?:the\\s+)?(.+?)(?:\\s+(?:bar|slice|point|column|segment|dot))?\\s+(?:(?:to|in|into|as)\\s+)?${SHADES_RE}(${Object.keys(COLORS).join('|')})$`, 'i');
const GENERIC_COLOR_RE = new RegExp(`^(?:please\\s+)?(?:make|paint|color|colour|turn|change|set)\\s+(?:the\\s+)?(?:it|them|everything|all|bars?|columns?|line|chart|graph|pie|slices)(?:\\s+(?:to|in|into|as))?\\s+${SHADES_RE}(${Object.keys(COLORS).join('|')})$`, 'i');
export function interceptInput(ctx, text) {
  const s = st(ctx);
  const c = current(ctx);
  if (!c || !c.labels.length) { s.inputMode = null; return { handled: false }; }
  const t = String(text).trim().replace(/[.!?]+$/, '');
  const inChart = (x) => find(c, String(x).replace(/\s+(?:in|on|from|off|out of) the (?:chart|graph)$/i, ''));
  let m = t.match(/^(?:what is|what's|what are|how big is|how big are)\s+(?:the\s+)?(.+)$/i);
  if (m) { const i = inChart(m[1]); return i < 0 ? { handled: false } : { handled: true, reply: describeValue(c, i) }; }
  m = t.match(/^(?:please\s+)?(?:remove|delete|drop|erase|take out|get rid of)\s+(?:the\s+)?(.+)$/i);
  if (m && inChart(m[1]) >= 0) { const r = removePoint(ctx, { l: m[1].replace(/\s+(?:from|in|out of) the (?:chart|graph)$/i, '') }); return { handled: true, reply: r.value ?? r.note }; }
  m = t.match(/^(?:please\s+)?(?:add|put|include|insert)\s+(.+)$/i);
  if (m && !/\blist\b/i.test(m[1])) {
    const data = m[1].replace(/\s+(?:to|in|into|on|onto) (?:the|this|my|that) (?:chart|graph)$/i, '');
    const { items, bad } = parseData(data);
    if (items.length && !bad.length && !/\bto\b/i.test(data)) { const r = addPoint(ctx, { text: data, request: null }); return { handled: true, reply: r.value ?? r.note }; }
  }
  m = t.match(COLOR_RE);
  if (m && inChart(m[1]) >= 0 && !/^(?:it|them|everything|all|bars?|columns?|line|chart|graph|pie)$/i.test(m[1])) { const r = setColor(ctx, { c: m[3].toLowerCase(), shade: m[2]?.toLowerCase(), label: m[1] }); return { handled: true, reply: r.value ?? r.note }; }
  m = t.match(GENERIC_COLOR_RE);
  if (m) { const r = setColor(ctx, { c: m[2].toLowerCase(), shade: m[1]?.toLowerCase() }); return { handled: true, reply: r.value ?? r.note }; }
  return { handled: false };
}

// ---- pure view: what the tab draws ---------------------------------------------------------------------------
const ramp = (hex, n) => Array.from({ length: n }, (_, i) => mix(hex, '#ffffff', n === 1 ? 0 : 0.5 * (1 - i / (n - 1))));
/** Sorted data, resolved colors and flags for drawing a chart (no Chart.js types; used by the tab and by tests). */
export function chartView(c, view = {}) {
  const SER = view.dark ? DARK_SERIES : SERIES;
  const o = { ...defaultOptions(), ...(c.options ?? {}) };
  const idx = c.type === 'scatter' ? c.labels.map((_, i) => i) : orderedIdx({ ...c, options: o });
  const labels = idx.map((i) => c.labels[i]);
  const pointwise = POINT_TYPES.has(c.type) || (c.datasets.length === 1 && !!o.palette && ['bar', 'radar'].includes(c.type));
  const pal = o.palette && o.palette !== 'classic' ? PALETTES[o.palette] : SER;
  const datasets = c.datasets.map((d, di) => {
    const data = idx.map((i) => Number(d.data[i]) || 0);
    const base = d.color ?? (o.palette && c.datasets.length > 1 ? pal[di % pal.length] : SER[di % SER.length]);
    let color = base;
    if (pointwise) {
      color = labels.map((l, j) => {
        if (o.pointColors?.[l]) return o.pointColors[l];
        if (o.palette) return pal[j % pal.length];
        if (d.color) return ramp(d.color, labels.length)[j];
        return SER[j % SER.length];
      });
    } else if (labels.some((l) => o.pointColors?.[l])) {
      color = labels.map((l) => o.pointColors?.[l] ?? base);
    }
    const points = c.type === 'scatter' ? data.map((y, j) => ({ x: Number.isFinite(Number(labels[j])) ? Number(labels[j]) : j + 1, y })) : null;
    return { label: d.label, data: points ?? data, color, base, rawData: data };
  });
  return {
    id: c.id, type: c.type, title: c.title ?? '', labels, datasets, pointwise,
    horizontal: !!o.horizontal && (c.type === 'bar' || c.type === 'line'), stacked: !!o.stacked,
    showLegend: o.showLegend ?? (c.datasets.length > 1 || POINT_TYPES.has(c.type)), showValues: o.showValues ?? false,
    empty: !c.labels.length,
  };
}
