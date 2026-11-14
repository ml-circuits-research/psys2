// SPDX-License-Identifier: AGPL-3.0-only
// geo.map on the matrix reasoner (spec 15). The operations (ops.mjs: showing places, moving the view, markers, highlights, distance lines, the questions about
// countries and cities, undo and redo) are unchanged and keep working on the session state; the state of the map view is also wires of the library: the view,
// one wire per marker, highlighted country and line, the focus, where the user is, and the bookkeeping the operations keep (`geo.map.dialog`). The library takes
// the state over after every operation (`adopt`; `toState` is the way back), so its rules (a zoom the map does not have, a line from a place to itself, a
// highlighted country that is not one) refuse what cannot be, and the knowledge base (countries, cities, regions: kb.sop) answers what the user claims about
// places (`gmClaim`: "Paris is in Germany." is refused with "Paris is not in Germany; it is in France."). Browser-safe; it imports its sibling ops.mjs for the
// initial state (a world is plain files).
import { initialState, isIn, isCapital, borderYN } from './ops.mjs?v=c3e14ef9f6';

const un = (v) => String(v ?? '').replace(/^"|"$/g, '');
const dec = (t) => (typeof t === 'string' && t.startsWith('"') ? JSON.parse(t) : t);
const str = (v) => JSON.stringify(String(v));
const tok = (w, k) => (w?.attrs?.[k] ?? []).map(un);
const num = (n) => String(Number(n));
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const atomOk = (v) => typeof v === 'string' && /^[A-Za-z0-9_]+$/.test(v);
const wid = (s) => String(s).replace(/[^A-Za-z0-9_]/g, '_');
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const TYPES = ['geo.map.view', 'geo.map.marker', 'geo.map.highlight', 'geo.map.line', 'geo.map.focus', 'geo.map.me', 'geo.map.clicked', 'geo.map.dialog'];
const HANDLED = new Set(['history', 'future', 'center', 'zoom', 'bounds', 'markers', 'highlighted', 'lines', 'layer', 'focus', 'me', 'clicked']);   // the rest is `geo.map.dialog`

const objOf = (w) => JSON.parse(dec(w.attrs.obj[0]));
const byIndex = (ws) => ws.map((w) => ({ w, i: Number(w.attrs.i?.[0] ?? 0) })).sort((a, b) => a.i - b.i).map((x) => x.w);

/** The state ops.mjs keeps (the tab reads it), derived from the wires: the same keys in the same order. */
export function toState({ find }) {
  const view = find('geo.map.view')[0];
  if (!view) return initialState();
  const s = initialState(), v = objOf(view);
  s.center = v.center; s.zoom = v.zoom; s.bounds = v.bounds; s.layer = v.layer;
  s.markers = byIndex(find('geo.map.marker')).map(objOf);
  s.highlighted = byIndex(find('geo.map.highlight')).map(objOf);
  s.lines = byIndex(find('geo.map.line')).map(objOf);
  const one = (t) => { const w = find(t)[0]; return w ? objOf(w) : null; };
  s.focus = one('geo.map.focus'); s.me = one('geo.map.me'); s.clicked = one('geo.map.clicked');
  const dlg = find('geo.map.dialog')[0];
  if (dlg) Object.assign(s, JSON.parse(dec(dlg.attrs.rest[0])));
  return s;
}

const canon = (attrs) => JSON.stringify(Object.keys(attrs ?? {}).filter((k) => !k.startsWith('core.')).sort().map((k) => [k, attrs[k]]));   // the same wire, whatever the order of its keys and the bookkeeping keys the library adds

/** The wires a state asks for: { id: { type, attrs: { key: [token] } } }. */
function wiresOf(s) {
  const out = {};
  const view = { center: s.center, zoom: s.zoom, bounds: s.bounds, layer: s.layer };
  const va = { lat: [num(s.center.lat)], lon: [num(s.center.lon)], zoom: [num(s.zoom)], layer: [s.layer], obj: [str(JSON.stringify(view))] };
  if (Array.isArray(s.bounds)) Object.assign(va, { bs: [num(s.bounds[0][0])], bw: [num(s.bounds[0][1])], bn: [num(s.bounds[1][0])], be: [num(s.bounds[1][1])] });
  out['gm.view'] = { type: 'geo.map.view', attrs: va };
  (s.markers ?? []).forEach((m, i) => { out[`gm.mk_${wid(m.id)}`] = { type: 'geo.map.marker', attrs: { i: [String(i)], mid: [str(m.id)], name: [str(m.name)], lat: [num(m.lat)], lon: [num(m.lon)], obj: [str(JSON.stringify(m))] } }; });
  (s.highlighted ?? []).forEach((h, i) => {
    const a = { i: [String(i)], name: [str(h.name)], obj: [str(JSON.stringify(h))] };
    if (atomOk(h.cc)) a.cc = [h.cc];
    out[`gm.hl_${wid(h.cc ?? h.name)}`] = { type: 'geo.map.highlight', attrs: a };
  });
  (s.lines ?? []).forEach((l, i) => { out[`gm.ln_${wid(l.id)}`] = { type: 'geo.map.line', attrs: { i: [String(i)], lid: [str(l.id)], fname: [str(l.from.name)], flat: [num(l.from.lat)], flon: [num(l.from.lon)], tname: [str(l.to.name)], tlat: [num(l.to.lat)], tlon: [num(l.to.lon)], km: [num(l.km)], obj: [str(JSON.stringify(l))] } }; });
  if (s.focus) {
    const a = { name: [str(s.focus.name)], obj: [str(JSON.stringify(s.focus))] };
    if (atomOk(s.focus.kind)) a.kind = [s.focus.kind];
    if (isNum(s.focus.lat)) a.lat = [num(s.focus.lat)];
    if (isNum(s.focus.lon)) a.lon = [num(s.focus.lon)];
    out['gm.focus'] = { type: 'geo.map.focus', attrs: a };
  }
  if (s.me && isNum(s.me.lat) && isNum(s.me.lon)) out['gm.me'] = { type: 'geo.map.me', attrs: { lat: [num(s.me.lat)], lon: [num(s.me.lon)], obj: [str(JSON.stringify(s.me))] } };
  if (s.clicked && isNum(s.clicked.lat) && isNum(s.clicked.lon)) out['gm.clicked'] = { type: 'geo.map.clicked', attrs: { lat: [num(s.clicked.lat)], lon: [num(s.clicked.lon)], obj: [str(JSON.stringify(s.clicked))] } };
  const base = {};
  for (const [k, v] of Object.entries(initialState())) if (!HANDLED.has(k)) base[k] = v;
  const rest = {};   // a fixed order of keys (the bookkeeping first, then the others by name): the same state is the same wire whatever order the operations left its keys in
  for (const k of [...Object.keys(base), ...Object.keys(s).filter((x) => !HANDLED.has(x) && !(x in base)).sort()]) if (k in s) rest[k] = s[k];
  if (JSON.stringify(rest) !== JSON.stringify(base)) out['gm.dlg'] = { type: 'geo.map.dialog', attrs: { rest: [str(JSON.stringify(rest))] } };
  return out;
}

/**
 * The library wires for a state the operations changed: { retract: [ids], tell: 'text', sets: [{ id, key, value }], replace: [{ id, type, attrs }] } (a wire that already says it is left alone).
 * A wire whose single values changed is set in place; a wire that gained or lost a key is replaced in place (it keeps its id), all in one transaction.
 */
export function adopt({ state, find, inPlace = true }) {
  const want = wiresOf(state);
  const have = new Map();   // id -> { id, wire }
  for (const t of TYPES) for (const w of find(t)) {
    have.set(w.id, { id: w.id, wire: w });
  }
  const retract = [], tell = [], sets = [], replace = [], same = new Set();
  const keys = (a) => Object.keys(a).filter((k) => !k.startsWith('core.')).sort().join();
  for (const [base, h] of have) {
    const w = want[base];
    if (!w || canon(h.wire.attrs) === canon(w.attrs)) { if (!w) retract.push(h.id); continue; }
    const single = inPlace && h.wire.type === w.type && keys(h.wire.attrs) === keys(w.attrs) && Object.keys(w.attrs).every((k) => w.attrs[k].length === 1 && (h.wire.attrs[k] ?? []).length === 1);
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

// ---- the claims of the user about places ------------------------------------------------------------------------------------------------------------
// "Is Paris in Germany?", "Berlin is the capital of France.", "Does Spain border Germany?": the operations (ops.mjs) answer and show the places on the map; here the
// state they change is the library's wires, and the verdict of a "No" (the reason) is the library's: the knowledge base (kb.sop, wires of the instance) supplies the
// few wires the claim needs, and the denies of matrix.sop refuse it with "Paris is not in Germany; it is in France." Anything the rules do not cover (a group such as the
// EU, a place the knowledge base names twice, several capitals) is answered by the operations alone.
const ofKey = (kb, type, k) => kb.find(type).filter((w) => tok(w, 'key').includes(k));
const sopText = (w) => `@${w.id} ${w.type} ${Object.entries(w.attrs).filter(([k]) => !k.startsWith('core.')).map(([k, vs]) => vs.map((v) => `${k}=${v}`).join(' ')).join(' ')}`;

/** What the claim is, in the words of the rules, and the wires of the knowledge base the rules need to judge it: { kind, from, evidence } or null when the rules do not cover it. */
function classify(kb, kind, A, B) {
  if (!atomOk(A) || !atomOk(B)) return null;
  const cities = ofKey(kb, 'geo.map.city', A), countries = ofKey(kb, 'geo.map.country', A);
  const target = ofKey(kb, 'geo.map.country', B), regions = ofKey(kb, 'geo.map.region', B);
  const continent = regions.find((r) => tok(r, 'kind')[0] === 'continent'), subregion = regions.find((r) => tok(r, 'kind')[0] === 'subregion');
  const one = (ws) => (ws.length === 1 ? ws[0] : null);
  const city = one(cities), country = one(countries), tc = one(target);
  const countryOf = (cc) => kb.find('geo.map.country').filter((w) => tok(w, 'cc')[0] === cc);
  const continentOf = (c) => kb.find('geo.map.region').filter((w) => tok(w, 'kind')[0] === 'continent' && tok(w, 'key').includes(tok(c, 'cont')[0]));
  const cityCountries = cities.flatMap((c) => countryOf(tok(c, 'cc')[0]));
  const done = (k, from, ...more) => ({ kind: k, from, evidence: [...new Set([...from, ...more.flat()])] });
  if (kind === 'capital') return city && tc && tok(tc, 'capital').length === 1 ? done('capital', [city.id, tc.id]) : null;
  if (kind === 'borders') return country && tc ? done('borders', [country.id, tc.id]) : null;
  if (city && tc && !countries.length) return done('city_in', [city.id, tc.id], cities.map((w) => w.id), cityCountries.map((w) => w.id));
  if (country && !cities.length && continent) return done('country_in_continent', [country.id, continent.id], continentOf(country).map((w) => w.id));
  if (country && !cities.length && subregion) return done('country_in_region', [country.id, subregion.id], continentOf(country).map((w) => w.id));
  if (city && !countries.length && continent) return done('city_in_continent', [city.id, continent.id], cityCountries.map((w) => w.id));
  return null;
}

/** Runs one operation of ops.mjs on the state the wires say (a scratch context over the library), takes the state it left back as wires, and lets the rules judge a "No". */
function viaOps(opsFn, claimOf) {
  return (ctx, raw) => {
    const args = Object.fromEntries(Object.entries(raw ?? {}).map(([k, v]) => [k, un(v)]));
    const state = toState({ find: ctx.find });
    let opened = false;
    const r = opsFn({ ...ctx.host.view(ctx), state, request: () => { opened = true; }, effect: () => {} }, args);
    const plan = adopt({ state, find: ctx.find, inPlace: false });
    for (const id of plan.retract) ctx.retract(id);
    for (const r of plan.replace) ctx.replace(r.id, `@${r.id} ${r.type} ${Object.entries(r.attrs).map(([k, vs]) => vs.map((v) => `${k}=${v}`).join(' ')).join(' ')}`);
    if (plan.tell) ctx.tell(plan.tell);
    const out = { ...r };
    if (opened) out.openTab = 'map';
    const kb = ctx.host.view(ctx);
    const c = r.status === 'supported' && typeof r.value === 'string' ? claimOf(kb, args) : null;
    if (c) {
      const facts = c.evidence.map((id) => sopText(ctx.world.get(id))).join('\n');
      const check = ctx.world.check({ wires: `${facts}\n@gm.claim geo.map.claim kind=${c.kind} a=${c.a} b=${c.b}` });
      const said = r.value.startsWith('No, ');
      if (!check.ok && said) { const v = (check.violations ?? []).find((x) => x.why); if (v) out.value = `No, ${v.why}`; }
      if (check.ok === !said) out.from = c.from;   // the rules agree with the operations: the answer rests on these facts of the knowledge base
    }
    return out;
  };
}
const claimIn = (kb, { p, q, r }) => { const c = classify(kb, 'in', p, q ?? r); return c && { ...c, a: p, b: q ?? r }; };
const claimCapital = (kb, { a, b }) => { const c = classify(kb, 'capital', a, b); return c && { ...c, a, b }; };
const claimBorder = (kb, { a, b }) => { const c = classify(kb, 'borders', a, b); return c && { ...c, a, b }; };

/** What is on the map, from the derived counts: "There are 2 markers and 1 line on the map; the lines add up to 1,234 km." */
function onMap(ctx) {
  const w = ctx.find('geo.map.onmap')[0];
  const n = (k) => Number(tok(w, k)[0] ?? 0);
  const parts = w ? [[n('markers'), 'marker', 'markers'], [n('highlights'), 'highlighted country', 'highlighted countries'], [n('lines'), 'line', 'lines']].filter((p) => p[0] > 0).map(([c, one, many]) => `${c} ${c === 1 ? one : many}`) : [];
  if (!parts.length) return { value: 'The map is empty: no markers, highlights or lines.', openTab: 'map' };
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  return { value: `There ${n('markers') + n('highlights') + n('lines') === 1 ? 'is' : 'are'} ${list} on the map${n('lines') ? `; the lines add up to ${fmt(n('km'))} km` : ''}.`, openTab: 'map' };
}

export const fns = { gmIsIn: viaOps(isIn, claimIn), gmIsCapital: viaOps(isCapital, claimCapital), gmBorderYN: viaOps(borderYN, claimBorder), gmOnMap: (ctx) => onMap(ctx) };

/** What "undo" and "redo" say once the library went back (or forward): the map in the words of ops.mjs. `before` is null when there was nothing to take back. */
export function undoWords({ before, after, redo }) {
  if (!before) return { status: 'missing', note: redo ? 'There is nothing to redo on the map.' : 'There is nothing to undo on the map yet.' };
  return { value: redo ? 'OK, I did it again.' : 'OK, I undid the last change to the map.', openTab: 'map' };
}

/** No step of this world only moves what the user looks at: every library step is an undo step (and having this function makes "undo" keep what it took out for "redo"). */
export function isView() { return false; }
