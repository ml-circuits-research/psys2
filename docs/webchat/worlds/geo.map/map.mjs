// Operations of geo.map: a voice-controlled world map (spec 07 sections 3, 6 and 7). Browser-safe: imports only its sibling places.mjs.
//
// State (ctx.state), drawn by the host tab (docs/webchat/ui/tabs/map.mjs):
//   center { lat, lon }, zoom (1..18, quarter steps), bounds null | [[south, west], [north, east]] (the host fits these
//   when present), markers [{ id, name, lat, lon, label }], highlighted [{ cc, name, lat, lon }],
//   lines [{ id, from: { name, lat, lon }, to: { name, lat, lon }, km }], layer 'offline' | 'osm',
//   focus null | { name, kind, lat, lon, cc, label } (the last place talked about), me null | { lat, lon, accuracy },
//   clicked null | { lat, lon, cc, country } (set by the host before it sends "what is here?"), pending, nextId.
// Effect: geo.locate (browser geolocation; the host reports the outcome, see onObservation).
// Every command brings the Map tab forward: ctx.request('ui.openTab', { tab: 'map' }).
// Data: the places come by lookup from the catalog's k.geo (places.mjs); the world has no knowledge base of its own.

import { buildIndex, lookup } from './places.mjs?v=953a0c9f2d';
import { askBridge } from '../acts/ask-lib.mjs?v=a749e231b1';   // questions over attributes and relations answered by the library (sopworld `ask`)
import { viewOf } from '../acts/view-lib.mjs?v=cdc84b4657';   // the acts on the view's own attributes (zoom, layer) by the library (sopworld std.schema.view state=)
import * as G from './ops.mjs?v=b81eee0e78';   // circular on purpose: the schema's executor, read inside functions only
let VIEW = null;
/** The view bridge of this world's schema (`@map.view` and its attributes: zoom, centre, layer): the library checks the value and computes the step; the state stays this module's. */
const viewLib = () => (VIEW ??= viewOf(G.executor.schema, 'view'));
export const viewBridge = () => viewLib();
const viewState = (s) =>({ zoom: s.zoom, layer: s.layer });

export function initialState() {
  return { center: { lat: 25, lon: 10 }, zoom: 2, bounds: null, markers: [], highlighted: [], lines: [], layer: 'offline', focus: null, me: null, clicked: null, pending: null, nextId: 1 };
}

// ---- helpers ---------------------------------------------------------------------------------------------------------
const ok = (value, extra) => ({ status: 'supported', value, ...extra });
const no = (status, note) => ({ status, note });
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const round = (x, d = 4) => Number(Number(x).toFixed(d));
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const CONT = { europe: 'Europe', asia: 'Asia', africa: 'Africa', north_america: 'North America', south_america: 'South America', oceania: 'Oceania', antarctica: 'Antarctica' };
const THE = new Set(['United States', 'United Kingdom', 'Netherlands', 'Philippines', 'Bahamas', 'Gambia', 'United Arab Emirates', 'DR Congo', 'Republic of the Congo', 'Maldives', 'Comoros', 'Seychelles', 'Marshall Islands', 'Solomon Islands', 'Cayman Islands', 'Central African Republic', 'Dominican Republic', 'Czech Republic', 'Faroe Islands', 'Cook Islands', 'Virgin Islands']);
const tab = (ctx) => { try { ctx.request('ui.openTab', { tab: 'map' }); } catch { /* the shell world is not loaded */ } };

/** "8.3 million", "317,000" */
function human(n) {
  if (n >= 1e9) return `${round(n / 1e9, 1)} billion`;
  if (n >= 1e6) return `${round(n / 1e6, 1)} million`;
  if (n >= 1e4) return fmt(Math.round(n / 1000) * 1000);
  return fmt(n);
}
const deg = (lat, lon) => `${Math.abs(lat).toFixed(2)} ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)} ${lon >= 0 ? 'E' : 'W'}`;
const some = (a, n = 6) => (a.length <= n ? list(a) : `${a.slice(0, n).join(', ')} and ${a.length - n} more`);
const list = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);

const R_EARTH = 6371.0088;
export function haversine(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}
const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (clamp(lat, -85, 85) * Math.PI) / 360));
/** Zoom level at which bounding box [s, w, n, e] fits a viewport of about 640 x 420 pixels (quarter steps). */
export function fitZoom(bb, max = 12) {
  const [s, w, n, e] = bb;
  let dLon = e - w; if (dLon <= 0) dLon += 360;
  const dx = Math.max(dLon, 0.02) / 360, dy = Math.max((merc(n) - merc(s)) / (2 * Math.PI), 0.0001);
  const z = Math.min(Math.log2((640 * 0.88) / (256 * dx)), Math.log2((420 * 0.88) / (256 * dy)));
  return clamp(Math.floor(z * 4) / 4, 1, max);
}
const centerOf = (bb) => {
  const [s, w, n, e] = bb;
  let dLon = e - w; if (dLon <= 0) dLon += 360;
  let lon = w + dLon / 2; if (lon > 180) lon -= 360;
  return { lat: round((s + n) / 2), lon: round(lon) };
};
const union = (boxes) => boxes.filter(Boolean).reduce((a, b) => (a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : b.slice()), null);
const pad = (bb, f = 0.06) => { const dy = (bb[2] - bb[0]) * f, dx = (bb[3] - bb[1]) * f; return [bb[0] - dy, bb[1] - dx, bb[2] + dy, bb[3] + dx]; };

const WORLD_VIEW = { lat: 25, lon: 10, zoom: 2 };
const maxZoom = (s) => (s.layer === 'osm' ? 18 : 12);
function viewBox(s, bb) {
  const box = pad(bb);
  s.center = centerOf(box); s.zoom = fitZoom(box, 10);
  s.bounds = [[round(Math.max(-85, box[0])), round(box[1])], [round(Math.min(85, box[2])), round(box[3])]];
}
function viewPoint(s, lat, lon, zoom) {
  s.center = { lat: round(lat), lon: round(lon) }; s.zoom = clamp(zoom, 1, maxZoom(s)); s.bounds = null;
}
const cityZoom = (c) => (c.pop >= 5e6 ? 8 : c.pop >= 2e5 ? 9 : 10);

// ---- data index (places.mjs: by lookup from the catalog's k.geo; nothing is stored in this world) ---------------------------------------------------------
let OFFLINE = false;
function db(ctx) {
  const D = buildIndex(ctx.knowledge);
  OFFLINE = !D && !!ctx.knowledge?.unreachable?.();
  return D ?? EMPTY;
}
const EMPTY = { byKey: new Map(), byCc: new Map(), cities: [], countries: [], regions: [], capitalOf: new Map(), citiesOf: new Map(), empty: true };
/** Demonym adjectives (japanese, brazilian ...) -> the country key; used when the language layer captured an adjective instead of a place. */
export const DEMONYM = { japanese: 'japan', brazilian: 'brazil', romanian: 'romania', german: 'germany', french: 'france', spanish: 'spain', italian: 'italy', portuguese: 'portugal', polish: 'poland', hungarian: 'hungary', austrian: 'austria', swiss: 'switzerland', dutch: 'netherland', belgian: 'belgium', british: 'uk', american: 'usa', canadian: 'canada', mexican: 'mexico', argentinian: 'argentina', argentine: 'argentina', chilean: 'chile', peruvian: 'peru', colombian: 'colombia', bolivian: 'bolivia', chinese: 'china', indian: 'india', russian: 'russia', ukrainian: 'ukraine', turkish: 'turkiye', egyptian: 'egypt', nigerian: 'nigeria', kenyan: 'kenya', ethiopian: 'ethiopia', moroccan: 'morocco', australian: 'australia', greek: 'greece', swedish: 'sweden', norwegian: 'norway', danish: 'denmark', finnish: 'finland', irish: 'ireland', czech: 'czech_republic', serbian: 'serbia', bulgarian: 'bulgaria', croatian: 'croatia', slovak: 'slovakia', vietnamese: 'vietnam', thai: 'thailand', indonesian: 'indonesia', korean: 'south_korea', iranian: 'iran', iraqi: 'iraq', israeli: 'israel', saudi: 'saudi_arabia', pakistani: 'pakistan', bangladeshi: 'bangladesh', filipino: 'philippine', cuban: 'cuba', venezuelan: 'venezuela' };
const place = (D, key) => { if (key === undefined) return null; const w = String(key).toLowerCase().replace(/_(?:people|folks|citizens)$/, '').replace(/s$/, ''); return lookup(D, key) ?? lookup(D, DEMONYM[String(key)] ?? DEMONYM[w]); };
const the = (e) => (e.kind === 'country' && THE.has(e.name) ? `the ${e.name}` : e.name);
const theCap = (e) => { const t = the(e); return t.charAt(0).toUpperCase() + t.slice(1); };
// The facts of a country are asked of the library (worlds/acts/ask-lib.mjs: `ask thing= attr=` of sopworld): the countries of the index are projected to wires once per index (the kind `place` and its
// facts are the schema's: capital, population, area, currency, language, continent, neighbours, landlocked); the library says the value, the list or yes / no, this module the sentence and what the map does.
const FACTS = [{ name: 'capital', type: 'text', many: true }, { name: 'population', type: 'number' }, { name: 'area', type: 'number' }, { name: 'currency', type: 'text', many: true }, { name: 'language', type: 'text', many: true },
  { name: 'continent', type: 'text' }, { name: 'neighbours', type: 'text', many: true }, { name: 'landlocked', type: 'bool' }];
let ASKER = null;
const projected = new WeakMap();   // the countries of an index -> their projection (the index is cached: one projection per catalog)
/** What the library says of one country's attribute: { shape, values, number } ('none': the country has no such fact). */
function fact(D, c, attr) {
  let things = projected.get(D.countries);
  if (!things) {
    things = D.countries.map((x) => ({ id: x.id, name: x.name, attrs: { capital: x.capital, population: x.pop ?? undefined, area: x.area ?? undefined, currency: x.cur, language: x.lang, continent: CONT[x.cont], neighbours: x.nb.map((cc) => D.byCc.get(cc)?.name).filter(Boolean), landlocked: x.land } }));
    projected.set(D.countries, things);
  }
  return (ASKER ??= askBridge('place', FACTS)).ask(things, { thing: c.id, attr });
}
const countryOf = (D, e) =>(e?.kind === 'country' ? e : e?.kind === 'city' ? D.byCc.get(e.cc) ?? null : null);
const members = (D, rg) => rg.members.map((cc) => D.byCc.get(cc)).filter(Boolean);
const bbOf = (D, e) => {
  if (e.kind === 'city') return [e.lat, e.lon, e.lat, e.lon];
  if (e.bb) return e.bb;
  if (e.lat !== null) return [e.lat, e.lon, e.lat, e.lon];
  return null;
};
const labelOf = (D, e) => {
  if (e.kind === 'city') {
    const c = D.byCc.get(e.cc);
    return `${e.isCapital ? 'capital' : 'city'} of ${c ? the(c) : e.cc} · ${human(e.pop)} people`;
  }
  if (e.kind === 'country') return `country in ${CONT[e.cont] ?? e.cont}${e.pop ? ` · ${human(e.pop)} people` : ''}`;
  return e.rkind === 'continent' ? 'continent' : e.rkind === 'world' ? 'the whole world' : 'group of countries';
};
const nearestCity = (D, p, from = D.cities) => {
  let best = null, bd = Infinity;
  for (const c of from) { const d = haversine(p, c); if (d < bd) { bd = d; best = c; } }
  return best ? { city: best, km: bd } : null;
};

// ---- state changes shared by the operations ----------------------------------------------------------------------------
const marker = (s, D, e, label) => {
  const lat = e.lat, lon = e.lon;
  const found = s.markers.find((m) => m.name === e.name && Math.abs(m.lat - lat) < 0.01 && Math.abs(m.lon - lon) < 0.01);
  if (found) return false;
  s.markers.push({ id: `m${s.nextId++}`, name: e.name, lat: round(lat), lon: round(lon), label: label ?? labelOf(D, e) });
  return true;
};
function focusOn(s, D, e) {
  if (e.kind === 'city') { viewPoint(s, e.lat, e.lon, cityZoom(e)); s.focus = { name: e.name, kind: 'city', lat: round(e.lat), lon: round(e.lon), cc: e.cc, label: labelOf(D, e) }; }
  else if (e.kind === 'country') {
    const bb = e.bb ?? (e.lat !== null ? [e.lat - 0.5, e.lon - 0.5, e.lat + 0.5, e.lon + 0.5] : null);
    if (bb) viewBox(s, bb);
    s.focus = { name: e.name, kind: 'country', lat: round(e.lat ?? s.center.lat), lon: round(e.lon ?? s.center.lon), cc: e.cc, label: labelOf(D, e) };
  } else if (e.rkind === 'world') {
    s.center = { lat: WORLD_VIEW.lat, lon: WORLD_VIEW.lon }; s.zoom = WORLD_VIEW.zoom; s.bounds = null;
    s.focus = { name: e.name, kind: 'region', lat: WORLD_VIEW.lat, lon: WORLD_VIEW.lon, cc: null, label: labelOf(D, e) };
  } else {
    viewBox(s, e.bb ?? [-58, -180, 80, 180]);
    s.focus = { name: e.name, kind: 'region', lat: s.center.lat, lon: s.center.lon, cc: null, label: labelOf(D, e) };
  }
}
const hl = (e) => ({ cc: e.cc, name: e.name, lat: round(e.lat ?? 0, 2), lon: round(e.lon ?? 0, 2) });
function highlight(s, countries, replace) {
  if (replace) s.highlighted = [];
  let added = 0;
  for (const c of countries) if (c && !s.highlighted.some((h) => h.cc === c.cc)) { s.highlighted.push(hl(c)); added++; }
  return added;
}
const fitCountries = (s, D, cs) => { const bb = union(cs.map((c) => c.bb ?? (c.lat !== null ? [c.lat, c.lon, c.lat, c.lon] : null))); if (bb) viewBox(s, bb); };
const places = (D, args, names = ['a', 'b', 'c', 'd', 'e']) => names.map((k) => args[k]).filter((v) => v !== undefined).map((k) => ({ key: k, e: place(D, k) }));
const unknownNote = (k) => (OFFLINE ? 'I cannot reach the places catalog right now, so I cannot look that up.' : `I do not know a place called ${String(k).replace(/_/g, ' ')}.`);

// ---- showing places ------------------------------------------------------------------------------------------------
function describePlace(D, e) {
  if (e.kind === 'country') {
    const cap = e.capital.length ? ` Its capital is ${list(e.capital)}.` : '';
    return `${e.name} is ${e.ind ? 'a country' : 'a territory'} in ${e.sub || CONT[e.cont]}${e.sub && CONT[e.cont] && !e.sub.includes(CONT[e.cont]) ? `, ${CONT[e.cont]}` : ''} (${deg(e.lat, e.lon)}).${cap}`;
  }
  if (e.kind === 'city') {
    const c = D.byCc.get(e.cc);
    return `${e.name} is ${e.isCapital ? 'the capital of' : 'a city in'} ${c ? the(c) : e.cc}${c ? `, in ${CONT[c.cont]}` : ''} (${deg(e.lat, e.lon)}), with about ${human(e.pop)} people.`;
  }
  const n = members(D, e).length, cap = e.name.charAt(0).toUpperCase() + e.name.slice(1);
  if (e.rkind === 'world') return 'The world has 194 independent countries on 7 continents.';
  return `${cap} ${e.rkind === 'continent' ? `is a continent with ${n} countries` : e.rkind === 'subregion' ? `is a region with ${n} countries` : `is a group of ${n} countries`}.`;
}

function _showPlace(ctx, args) {
  const D = db(ctx), s = ctx.state;
  const ps = places(D, args);
  const bad = ps.find((p) => !p.e);
  if (bad) return no('unsupported', unknownNote(bad.key));
  tab(ctx);
  const es = ps.map((p) => p.e);
  if (es.length === 1) {
    const e = es[0];
    focusOn(s, D, e);
    return ok(e.kind === 'region' ? `Here is ${e.name}.` : `Here is ${e.name}${e.kind === 'city' ? '' : ''}: ${labelOf(D, e)}.`);
  }
  const bb = union(es.map((e) => bbOf(D, e)));
  viewBox(s, bb);
  s.focus = { name: es[0].name, kind: es[0].kind, lat: round(es[0].lat ?? s.center.lat), lon: round(es[0].lon ?? s.center.lon), cc: es[0].cc, label: labelOf(D, es[0]) };
  return ok(`Here are ${list(es.map((e) => e.name))}.`);
}

export function where(ctx, { p }) {
  const D = db(ctx), s = ctx.state, e = place(D, p);
  if (!e) return no('unsupported', unknownNote(p));
  tab(ctx);
  focusOn(s, D, e);
  return ok(describePlace(D, e));
}

function _coords(ctx, { la, lo, ns, ew }) {
  // compass words: "45.5 north 25 east", "12 south 30 west" (south and west are negative)
  const s = ctx.state, lat = (ns === 'south' ? -1 : 1) * Number(la), lon = (ew === 'west' ? -1 : 1) * Number(lo);
  if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return no('unsupported', 'Latitude must be between -90 and 90 and longitude between -180 and 180.');
  tab(ctx);
  viewPoint(s, lat, lon, 8);
  s.focus = { name: 'Chosen point', kind: 'point', lat: round(lat), lon: round(lon), cc: null, label: deg(lat, lon) };
  const D = db(ctx), n = nearestCity(D, { lat, lon });
  return ok(`Here is ${deg(lat, lon)}${n ? `, about ${fmt(n.km)} km from ${n.city.name}` : ''}.`);
}

// ---- moving the view -------------------------------------------------------------------------------------------------
export const AMT = { a_lot: 3, a_lot_more: 3, much: 3, way: 3, far: 3, hugely: 3, a_great_deal: 3, all_the_way: 99, completely: 99, fully: 99,
  a_bit: 0.5, a_little: 0.5, a_little_bit: 0.5, slightly: 0.5, just_a_little: 0.5, just_a_bit: 0.5, somewhat: 0.5, a_touch: 0.5,
  more: 1, further: 1, farther: 1, even_more: 1.5, some_more: 1, twice: 2, once: 1,
  alot: 3, a_whole_lot: 3, big_time: 3, lots: 3, heaps: 3, tons: 3, massively: 3, loads: 3, a_ton: 3, quite_a_bit: 2, a_good_bit: 2, a_fair_bit: 1.5,
  a_tiny_bit: 0.5, a_wee_bit: 0.5, a_smidge: 0.5, a_tad: 0.5, just_a_tad: 0.5, barely: 0.5, marginally: 0.5 };

function _zoom(ctx, { dir, amt, n }) {
  const s = ctx.state;
  tab(ctx);
  const maxZ = maxZoom(s);
  const step = n !== undefined ? clamp(Number(n), 0, 18) : amt !== undefined ? AMT[amt] ?? 1 : 1;
  const before = s.zoom;
  if (dir === 'out' && step >= 99) { s.center = { lat: WORLD_VIEW.lat, lon: WORLD_VIEW.lon }; s.zoom = WORLD_VIEW.zoom; s.bounds = null; return ok('Zoomed all the way out to the whole world.'); }
  const r = viewLib().change(viewState(s), { attr: 'zoom', by: dir === 'out' ? 'less' : 'more', amount: step });   // the library steps the zoom and holds it between the bounds of the schema (the layer's own bound is below)
  const z = clamp(r.values.zoom ?? before, 1, maxZ);
  s.zoom = z; s.bounds = null;
  if (z === before) return ok(dir === 'out' ? 'This is already as far out as the map goes.' : `This is already as close as the map goes (zoom ${before}).`);
  return ok(`Zoomed ${dir === 'out' ? 'out' : 'in'} to zoom ${z}.`);
}

function _zoomTo(ctx, { n }) {
  const s = ctx.state, z = Number(n);
  const r = viewLib().change(viewState(s), { attr: 'zoom', value: z });
  if (!Number.isFinite(z) || !r.ok || r.clamped) return no('unsupported', 'The zoom level must be between 1 and 18.');
  tab(ctx);
  s.zoom = clamp(r.values.zoom, 1, maxZoom(s)); s.bounds = null;
  return ok(`Zoom is now ${s.zoom}.`);
}

export const DIR = { north: [1, 0], south: [-1, 0], east: [0, 1], west: [0, -1], northeast: [1, 1], northwest: [1, -1], southeast: [-1, 1], southwest: [-1, -1],
  'north-east': [1, 1], 'north-west': [1, -1], 'south-east': [-1, 1], 'south-west': [-1, -1], up: [1, 0], down: [-1, 0], left: [0, -1], right: [0, 1],
  northward: [1, 0], southward: [-1, 0], eastward: [0, 1], westward: [0, -1] };
const DIR_NAME = (v) => (v[0] > 0 ? 'north' : v[0] < 0 ? 'south' : '') + (v[0] && v[1] ? '-' : '') + (v[1] > 0 ? 'east' : v[1] < 0 ? 'west' : '');

function _pan(ctx, { d, amt, amt2, km, unit }) {
  const s = ctx.state, v = DIR[d];
  if (!v) return no('unsupported', `I do not know the direction ${d}.`);
  tab(ctx);
  const a = AMT[amt] ?? AMT[amt2];
  const scale = a === undefined ? 1 : a >= 3 ? 2.5 : a < 1 ? 0.4 : a;
  const lat0 = s.center.lat, cos = Math.max(0.2, Math.cos((lat0 * Math.PI) / 180));
  let dLat, dLon;
  if (km !== undefined) {
    const k = Number(km) * (unit === 'miles' ? 1.609344 : 1);
    dLat = k / 111.2; dLon = k / (111.2 * cos);
  } else {
    dLon = (450 / 2 ** s.zoom) * scale; dLat = ((295 * cos) / 2 ** s.zoom) * scale;
  }
  const lat = clamp(lat0 + v[0] * dLat * (v[1] && km !== undefined ? 0.7071 : 1), -80, 80);
  let lon = s.center.lon + v[1] * dLon * (v[0] && km !== undefined ? 0.7071 : 1);
  if (lon > 180) lon -= 360; if (lon < -180) lon += 360;
  s.center = { lat: round(lat), lon: round(lon) }; s.bounds = null;
  return ok(`Moved ${DIR_NAME(v)}.`);
}

export function world(ctx) {
  const s = ctx.state;
  tab(ctx);
  s.center = { lat: WORLD_VIEW.lat, lon: WORLD_VIEW.lon }; s.zoom = WORLD_VIEW.zoom; s.bounds = null;
  return ok('Here is the whole world.');
}

function _reset(ctx, { all } = {}) {
  const s = ctx.state;
  tab(ctx);
  s.center = { lat: WORLD_VIEW.lat, lon: WORLD_VIEW.lon }; s.zoom = WORLD_VIEW.zoom; s.bounds = null;
  if (all === 'true') { s.markers = []; s.highlighted = []; s.lines = []; s.focus = null; s.clicked = null; s.pending = null; return ok('The map is reset: the whole world, with no markers, highlights or lines.'); }
  return ok('The view is reset to the whole world.');
}

function _clearAll(ctx) {
  const s = ctx.state;
  tab(ctx);
  const n = s.markers.length + s.highlighted.length + s.lines.length;
  s.markers = []; s.highlighted = []; s.lines = []; s.focus = null; s.clicked = null;
  return ok(n ? 'The map is clear: no markers, highlights or lines.' : 'The map was already clear.');
}

// ---- markers, highlights, lines -------------------------------------------------------------------------------------------
function _mark(ctx, args) {
  const D = db(ctx), s = ctx.state;
  const ps = places(D, args);
  const bad = ps.find((p) => !p.e);
  if (bad) return no('unsupported', unknownNote(bad.key));
  const es = ps.map((p) => p.e);
  const usable = es.filter((e) => e.kind !== 'region' && e.lat !== null);
  if (!usable.length) return no('unsupported', 'I can mark countries and cities, but not a whole region. Try "highlight Europe" instead.');
  tab(ctx);
  const added = [], had = [];
  for (const e of usable) (marker(s, D, e) ? added : had).push(e.name);
  if (usable.length === 1) focusOn(s, D, usable[0]); else { viewBox(s, union(usable.map((e) => [e.lat, e.lon, e.lat, e.lon]))); s.focus = null; }
  if (usable.length === 1) {
    return ok(added.length ? `OK, I put a marker on ${added[0]}.` : `${had[0]} is already marked.`);
  }
  return ok(`${added.length ? `OK, I put markers on ${list(added)}.` : ''}${had.length ? ` ${list(had)} ${had.length === 1 ? 'was' : 'were'} already marked.` : ''}`.trim());
}

function _markHere(ctx) {
  const s = ctx.state, D = db(ctx);
  tab(ctx);
  const p = s.clicked ? { lat: s.clicked.lat, lon: s.clicked.lon } : { lat: s.center.lat, lon: s.center.lon };
  const n = nearestCity(D, p);
  const name = s.clicked?.country ?? (n && n.km < 30 ? n.city.name : `Point ${s.nextId}`);
  s.markers.push({ id: `m${s.nextId++}`, name, lat: round(p.lat), lon: round(p.lon), label: `${deg(p.lat, p.lon)}${n ? ` · ${fmt(n.km)} km from ${n.city.name}` : ''}` });
  return ok(`OK, I put a marker here (${deg(p.lat, p.lon)}).`);
}

function _markSet(ctx, { what, r, n, m }) {
  const D = db(ctx), s = ctx.state, scope = place(D, r);
  if (!scope) return no('unsupported', unknownNote(r));
  let cs = [], desc;
  if (what === 'capitals') {
    if (scope.kind === 'city') return no('unsupported', 'A city has no capitals. Try a continent or a country, for example "mark the capitals of Europe".');
    const countries = scope.kind === 'country' ? [scope] : members(D, scope);
    cs = countries.flatMap((c) => D.capitalOf.get(c.cc) ?? []);
    desc = `the capital${cs.length === 1 ? '' : 's'} of ${scope.kind === 'country' ? the(scope) : scope.name}`;
  } else {
    if (scope.kind === 'city') return no('unsupported', 'A city has no cities. Try a country or a continent.');
    const ccs = scope.kind === 'country' ? [scope.cc] : scope.members;
    cs = ccs.flatMap((cc) => D.citiesOf.get(cc) ?? []).sort((a, b) => b.pop - a.pop);
    const limit = n !== undefined ? Math.max(1, Math.min(60, Number(n))) : m !== undefined ? 5 : 30;
    cs = cs.slice(0, limit);
    desc = `${m !== undefined || n !== undefined ? `the ${cs.length} largest cities` : `${cs.length === 30 ? 'up to 30 of the' : 'the'} cities`} of ${scope.kind === 'country' ? the(scope) : scope.name}`;
  }
  if (!cs.length) return no('missing', `I have no ${what} for ${scope.name}.`);
  tab(ctx);
  let added = 0;
  for (const c of cs) if (marker(s, D, c)) added++;
  viewBox(s, union(cs.map((c) => [c.lat, c.lon, c.lat, c.lon])));
  if (cs.length === 1) viewPoint(s, cs[0].lat, cs[0].lon, 6);
  s.focus = null;
  return ok(`OK, I marked ${desc}${cs.length <= 6 ? `: ${list(cs.map((c) => c.name))}` : ` (${cs.length} markers)`}.${added < cs.length ? ` ${cs.length - added} already had a marker.` : ''}`);
}

function _clearMarkers(ctx, { p, last }) {
  const D = db(ctx), s = ctx.state;
  tab(ctx);
  if (last === 'true') {
    const m = s.markers.pop();
    return m ? ok(`OK, I removed the marker on ${m.name}.`) : no('missing', 'There are no markers to remove.');
  }
  if (p !== undefined) {
    const e = place(D, p);
    if (!e) return no('unsupported', unknownNote(p));
    const before = s.markers.length;
    s.markers = s.markers.filter((m) => m.name !== e.name);
    return s.markers.length < before ? ok(`OK, I removed the marker on ${e.name}.`) : no('missing', `There is no marker on ${e.name}.`);
  }
  const n = s.markers.length;
  s.markers = [];
  return n ? ok(`OK, I removed ${n === 1 ? 'the marker' : `all ${n} markers`}.`) : ok('There were no markers.');
}

function _highlightPlaces(ctx, args) {
  const D = db(ctx), s = ctx.state;
  const ps = places(D, args);
  const bad = ps.find((p) => !p.e);
  if (bad) return no('unsupported', unknownNote(bad.key));
  let cs = [];
  for (const { e } of ps) {
    if (e.kind === 'region') cs.push(...members(D, e));
    else {
      const c = countryOf(D, e);
      if (!c) continue;
      if (args.self !== 'false') cs.push(c);
      if (args.nb === 'true') cs.push(...c.nb.map((cc) => D.byCc.get(cc)).filter(Boolean));
    }
  }
  cs = [...new Map(cs.map((c) => [c.cc, c])).values()];
  if (args.ind === 'true') cs = cs.filter((c) => c.ind);   // "the countries of South America": the independent states, as the count and the list say
  if (!cs.length) return no('missing', 'There is nothing to highlight there.');
  tab(ctx);
  const added = highlight(s, cs, false);
  const regionOnly = ps.length === 1 && ps[0].e.kind === 'region';
  if (regionOnly) viewBox(s, ps[0].e.bb ?? union(cs.map((c) => c.bb))); else fitCountries(s, D, cs);
  s.focus = null;
  const names = cs.map((c) => c.name);
  const what = names.length <= 8 ? list(names) : `${names.length} countries`;
  return ok(added ? `OK, I highlighted ${what}.` : `${what.charAt(0).toUpperCase()}${what.slice(1)} ${names.length === 1 ? 'is' : 'are'} already highlighted.`);
}

function _clearHighlight(ctx, { p } = {}) {
  const D = db(ctx), s = ctx.state;
  tab(ctx);
  if (p !== undefined) {
    const e = place(D, p), c = e ? (e.kind === 'region' ? null : countryOf(D, e)) : null;
    if (!c) return no('unsupported', e ? 'Say a country to un-highlight, or "remove the highlights".' : unknownNote(p));
    const before = s.highlighted.length;
    s.highlighted = s.highlighted.filter((h) => h.cc !== c.cc);
    return s.highlighted.length < before ? ok(`OK, ${c.name} is no longer highlighted.`) : no('missing', `${c.name} is not highlighted.`);
  }
  const n = s.highlighted.length;
  s.highlighted = [];
  return n ? ok('OK, I removed the highlights.') : ok('Nothing was highlighted.');
}

function _clearLines(ctx) {
  const s = ctx.state;
  tab(ctx);
  const n = s.lines.length;
  s.lines = [];
  return n ? ok(n === 1 ? 'OK, I removed the line.' : `OK, I removed all ${n} lines.`) : ok('There were no lines.');
}

const OSM_WORDS = new Set(['street', 'road', 'detailed', 'osm', 'openstreetmap', 'open_street_map', 'online', 'real', 'tile', 'realistic', 'live']);
function _layer(ctx, { l }) {
  const s = ctx.state;
  const want = OSM_WORDS.has(l) ? 'osm' : 'offline';
  tab(ctx);
  if (s.layer === want) return ok(want === 'osm' ? 'The street map is already on.' : 'The offline country map is already on.');
  s.layer = viewLib().change(viewState(s), { attr: 'layer', value: want }).values.layer ?? want;
  if (want === 'osm') return ok('OK, the street map is on. It uses OpenStreetMap tiles, so it needs an internet connection; without one you will keep seeing the country outlines.');
  s.zoom = Math.min(s.zoom, 12);
  return ok('OK, back to the offline country map.');
}

// ---- questions about places --------------------------------------------------------------------------------------------------
const needCountry = (D, e, what) => {
  const c = countryOf(D, e);
  return c ? { c } : { err: no('unsupported', e.kind === 'region' ? `${e.name.charAt(0).toUpperCase()}${e.name.slice(1)} is a region, not a country, so it has no single ${what}.` : unknownNote('that')) };
};

export function capital(ctx, { c }) {
  const D = db(ctx), s = ctx.state, e = place(D, c);
  if (!e) return no('unsupported', unknownNote(c));
  if (e.kind === 'city') return no('unsupported', `${e.name} is a city, not a country, so it has no capital. ${e.isCapital ? `It is itself the capital of ${the(D.byCc.get(e.cc))}.` : ''}`.trim());
  if (e.kind === 'region') return no('unsupported', `${e.name.charAt(0).toUpperCase()}${e.name.slice(1)} is not a country, so it has no capital. Try "mark the capitals of ${e.name}".`);
  const capitals = fact(D, e, 'capital').values;
  if (!capitals.length) return no('missing', `I do not know a capital of ${the(e)}.`);
  tab(ctx);
  const city = (D.capitalOf.get(e.cc) ?? [])[0];
  if (city) focusOn(s, D, city); else focusOn(s, D, e);
  return ok(capitals.length === 1 ? `The capital of ${the(e)} is ${capitals[0]}.` : `${theCap(e)} has ${capitals.length} capitals: ${list(capitals)}.`);
}

export function isCapital(ctx, { a, b }) {
  const D = db(ctx), s = ctx.state, x = place(D, a), y = place(D, b);
  if (!x) return no('unsupported', unknownNote(a));
  if (!y) return no('unsupported', unknownNote(b));
  tab(ctx);
  const country = y.kind === 'country' ? y : null;
  if (!country || x.kind === 'region') return no('unsupported', 'I can check whether a city is the capital of a country.');
  const yes = x.kind === 'city' ? x.isCapital && x.cc === country.cc : country.capital.some((n) => n.toLowerCase() === x.name.toLowerCase());
  if (x.kind === 'city') focusOn(s, D, x);
  if (yes) return ok(`Yes, ${x.name} is the capital of ${the(country)}.`);
  return ok(`No, the capital of ${the(country)} is ${list(country.capital)}.`);
}

export function capitalOfWhich(ctx, { c }) {
  const D = db(ctx), s = ctx.state, e = place(D, c);
  if (!e) return no('unsupported', unknownNote(c));
  if (e.kind !== 'city') return no('unsupported', `${e.name} is not a city.`);
  tab(ctx);
  focusOn(s, D, e);
  const k = D.byCc.get(e.cc);
  return ok(e.isCapital ? `${e.name} is the capital of ${the(k)}.` : `${e.name} is not a capital. It is a city in ${the(k)}, whose capital is ${list(k.capital)}.`);
}

export function country(ctx, { p }) {
  const D = db(ctx), s = ctx.state, e = place(D, p);
  if (!e) return no('unsupported', unknownNote(p));
  if (e.kind === 'region') return no('unsupported', `${e.name.charAt(0).toUpperCase()}${e.name.slice(1)} is a region with ${members(D, e).length} countries.`);
  tab(ctx);
  focusOn(s, D, e);
  const k = countryOf(D, e);
  return ok(e.kind === 'country' ? `${e.name} is a country itself, in ${CONT[e.cont]}.` : `${e.name} is in ${the(k)}.`);
}

export function population(ctx, { p }) {
  const D = db(ctx), s = ctx.state, e = place(D, p);
  if (!e) return no('unsupported', unknownNote(p));
  tab(ctx);
  if (e.kind === 'city') {
    focusOn(s, D, e);
    return ok(`${e.name} has about ${human(e.pop)} people (the city itself, from GeoNames).`);
  }
  if (e.kind === 'country') {
    const pop = fact(D, e, 'population');
    if (!pop.number) return no('missing', `I do not know the population of ${the(e)}.`);
    focusOn(s, D, e);
    return ok(`${theCap(e)} has about ${human(pop.number)} people (an estimate from around 2018).`);
  }
  const total = members(D, e).reduce((t, c) => t + (c.pop ?? 0), 0);
  focusOn(s, D, e);
  return ok(`${e.name.charAt(0).toUpperCase()}${e.name.slice(1)} has about ${human(total)} people in its countries (a sum of country estimates).`);
}

export function area(ctx, { p }) {
  const D = db(ctx), s = ctx.state, e = place(D, p);
  if (!e) return no('unsupported', unknownNote(p));
  tab(ctx);
  focusOn(s, D, e);
  if (e.kind === 'city') return ok(`I do not know the area of ${e.name}, only its population: about ${human(e.pop)} people.`);
  if (e.kind === 'country') { const a = fact(D, e, 'area').number; return a ? ok(`${theCap(e)} covers ${fmt(a)} square kilometres.`) : no('missing', `I do not know the area of ${the(e)}.`); }
  const total = members(D, e).reduce((t, c) => t + (c.area ?? 0), 0);
  return ok(`The countries of ${e.name} cover about ${human(total)} square kilometres together.`);
}

const MEASURE = { bigger: ['auto', 1], larger: ['auto', 1], smaller: ['auto', -1], greater: ['auto', 1], more_populous: ['pop', 1], more_populated: ['pop', 1], less_populous: ['pop', -1],
  less_populated: ['pop', -1], more_people: ['pop', 1], fewer_people: ['pop', -1], more_person: ['pop', 1], fewer_person: ['pop', -1], bigger_population: ['pop', 1], larger_population: ['pop', 1], smaller_population: ['pop', -1],
  more_inhabitant: ['pop', 1], fewer_inhabitant: ['pop', -1] };
export const SUPER = { largest: ['auto', 1], biggest: ['auto', 1], greatest: ['auto', 1], smallest: ['auto', -1], tiniest: ['auto', -1], most_populous: ['pop', 1], most_populated: ['pop', 1],
  least_populated: ['pop', -1], least_populous: ['pop', -1], main: ['pop', 1], major: ['pop', 1], top: ['pop', 1] };
const valueOf = (e, dim) => (dim === 'area' ? e.area : e.pop);
const dimFor = (x, y, want) => {
  if (x.kind === 'region' || y.kind === 'region') return null;
  if (x.kind === 'city' || y.kind === 'city') return want === 'area' ? 'popFallback' : 'pop';
  return want === 'auto' ? 'area' : want;
};
function compareCore(ctx, { a, b, m }, yesno) {
  const D = db(ctx), s = ctx.state, x = place(D, a), y = place(D, b);
  if (!x) return no('unsupported', unknownNote(a));
  if (!y) return no('unsupported', unknownNote(b));
  const [want, dir] = MEASURE[m] ?? ['auto', 1];
  let dim = dimFor(x, y, want);
  if (!dim) return no('unsupported', 'I can compare two countries or two cities, not regions.');
  if (x.kind !== y.kind) return no('unsupported', 'I can compare two countries or two cities, but not a country with a city.');
  const note = dim === 'popFallback' ? ' (I only know the population of cities)' : '';
  if (dim === 'popFallback') dim = 'pop';
  const vx = valueOf(x, dim), vy = valueOf(y, dim);
  if (vx == null || vy == null) return no('missing', `I do not have the ${dim === 'pop' ? 'population' : 'area'} of both places.`);
  tab(ctx);
  if (x.kind === 'country') { highlight(s, [x, y], true); fitCountries(s, D, [x, y]); s.focus = null; }
  else { marker(s, D, x); marker(s, D, y); viewBox(s, union([x, y].map((c) => [c.lat, c.lon, c.lat, c.lon]))); }
  const winner = (vx >= vy ? dir > 0 : dir < 0) ? x : y, loser = winner === x ? y : x;
  const adj = dim === 'pop' ? (dir > 0 ? 'more populous' : 'less populous') : dir > 0 ? 'bigger' : 'smaller';
  const unit = dim === 'pop' ? 'people' : 'square kilometres';
  const wv = valueOf(winner, dim), lv = valueOf(loser, dim);
  const hw = human(wv), hl = human(lv), same = hw === hl;
  const core = `${the(winner)} is ${adj} than ${the(loser)}${note}: about ${same ? fmt(wv) : hw} ${unit} against ${same ? fmt(lv) : hl}.`;
  if (!yesno) return ok(core.charAt(0).toUpperCase() + core.slice(1));
  const asked = dir > 0 ? vx >= vy : vx <= vy;
  return ok(`${asked ? 'Yes' : 'No'}, ${core}`);
}
export const compare = (ctx, args) => compareCore(ctx, args, false);
export const compareYN = (ctx, args) => compareCore(ctx, args, true);

export function borders(ctx, { p }) {
  const D = db(ctx), s = ctx.state, e = place(D, p);
  if (!e) return no('unsupported', unknownNote(p));
  const { c, err } = needCountry(D, e, 'neighbours');
  if (err) return err;
  tab(ctx);
  const nb = fact(D, c, 'neighbours').values.map((n) => lookup(D, n)).filter(Boolean);   // the library lists them (a relation of the country), the index gives the places back
  if (!nb.length) { focusOn(s, D, c); return ok(`${theCap(c)} has no land borders.`); }
  highlight(s, [c, ...nb], true);
  fitCountries(s, D, [c, ...nb]);
  s.focus = null;
  const names = nb.map((x) => the(x));
  return ok(`${theCap(c)} borders ${nb.length} ${nb.length === 1 ? 'country' : 'countries'}: ${list(names)}.`);
}

export function borderYN(ctx, { a, b }) {
  const D = db(ctx), s = ctx.state, x = place(D, a), y = place(D, b);
  if (!x) return no('unsupported', unknownNote(a));
  if (!y) return no('unsupported', unknownNote(b));
  const cx = countryOf(D, x), cy = countryOf(D, y);
  if (!cx || !cy) return no('unsupported', 'I can check whether two countries share a border.');
  tab(ctx);
  highlight(s, [cx, cy], true); fitCountries(s, D, [cx, cy]); s.focus = null;
  return ok(cx.nb.includes(cy.cc) ? `Yes, ${the(cx)} and ${the(cy)} share a border.` : `No, ${the(cx)} and ${the(cy)} do not share a border.`);
}

export function neighbourCount(ctx, { p }) {
  const D = db(ctx), s = ctx.state, e = place(D, p);
  if (!e) return no('unsupported', unknownNote(p));
  const { c, err } = needCountry(D, e, 'neighbours');
  if (err) return err;
  tab(ctx);
  const nb = fact(D, c, 'neighbours').values.map((n) => lookup(D, n)).filter(Boolean);
  highlight(s, [c, ...nb], true); fitCountries(s, D, [c, ...nb]); s.focus = null;
  return ok(nb.length ? `${theCap(c)} has ${nb.length} ${nb.length === 1 ? 'neighbour' : 'neighbours'}: ${list(nb.map((x) => the(x)))}.` : `${theCap(c)} has no land neighbours.`);
}

export function landlocked(ctx, { p }) {
  const D = db(ctx), s = ctx.state, e = place(D, p);
  if (!e) return no('unsupported', unknownNote(p));
  const { c, err } = needCountry(D, e, 'coast');
  if (err) return err;
  tab(ctx);
  focusOn(s, D, c);
  return ok(fact(D, c, 'landlocked').values[0] === 'true' ? `Yes, ${the(c)} is landlocked: it has no sea coast.` : `No, ${the(c)} is not landlocked: it has a sea coast${c.nb.length ? '' : ' (it is an island)'}.`);
}

export function continent(ctx, { p }) {
  const D = db(ctx), s = ctx.state, e = place(D, p);
  if (!e) return no('unsupported', unknownNote(p));
  if (e.kind === 'region') return no('unsupported', e.rkind === 'continent' ? `${e.name} is itself a continent.` : `${e.name.charAt(0).toUpperCase()}${e.name.slice(1)} is not a single country, so it has no one continent.`);
  const c = countryOf(D, e);
  tab(ctx);
  focusOn(s, D, e);
  const cont = fact(D, c, 'continent').values[0];
  return ok(`${e.name} is in ${cont}${c.sub && c.sub !== cont ? ` (${c.sub})` : ''}.`);
}

export function isIn(ctx, { p, q: where_, r: region }) {
  const D = db(ctx), s = ctx.state, e = place(D, p), t = place(D, where_ ?? region);
  if (!e) return no('unsupported', unknownNote(p));
  if (!t) return no('unsupported', unknownNote(where_ ?? region));
  tab(ctx);
  focusOn(s, D, e);
  const c = countryOf(D, e);
  let yes = false;
  if (t.kind === 'region') yes = e.kind === 'region' ? e.members.every((m) => t.members.includes(m)) : !!c && (t.members.includes(c.cc) || (t.rkind === 'continent' && c.cont === t.id.replace(/^r\./, '')));
  else if (t.kind === 'country') yes = e.kind === 'city' && e.cc === t.cc;
  else return no('unsupported', `${t.name} is a city, so nothing is inside it as far as I know.`);
  if (yes) return ok(`Yes, ${e.name} is in ${t.kind === 'region' ? t.name : the(t)}.`);
  return ok(`No, ${e.name} is not in ${t.kind === 'region' ? t.name : the(t)}${c ? `; it is in ${e.kind === 'country' ? CONT[c.cont] : the(c)}` : ''}.`);
}

export function superlative(ctx, { m, k, p, n, plural }) {
  const D = db(ctx), s = ctx.state;
  const scope = place(D, p ?? 'world');
  if (!scope) return no('unsupported', unknownNote(p));
  const kind = k === 'country' || k === 'nation' ? 'country' : 'city';
  const [want, dir] = SUPER[m] ?? ['auto', 1];
  let pool;
  if (kind === 'city') {
    if (scope.kind === 'city') return no('unsupported', 'A city does not contain cities.');
    const ccs = scope.kind === 'country' ? [scope.cc] : scope.members;
    pool = ccs.flatMap((cc) => D.citiesOf.get(cc) ?? []);
  } else {
    if (scope.kind !== 'region') return no('unsupported', `${scope.name} is not a continent or region, so I cannot rank countries in it.`);
    pool = members(D, scope);
  }
  const dim = kind === 'city' ? 'pop' : want === 'pop' ? 'pop' : 'area';
  pool = pool.filter((e) => valueOf(e, dim) != null).sort((a, b) => (valueOf(b, dim) - valueOf(a, dim)) * dir);
  if (!pool.length) return no('missing', `I have no ${kind === 'city' ? 'cities' : 'countries'} for ${scope.name}.`);
  tab(ctx);
  const count = n !== undefined ? clamp(Number(n), 1, 15) : plural === 'true' ? 5 : 1;
  const top = pool.slice(0, count);
  const where2 = scope.kind === 'region' && scope.rkind === 'world' ? 'in the world' : scope.kind === 'region' ? `in ${scope.name}` : `in ${the(scope)}`;
  const adj = m && /^(largest|biggest|smallest|most_populous|least_populous|most_populated|least_populated)$/.test(m) ? m.replace(/_/g, ' ') : dim === 'pop' ? (dir > 0 ? 'most populous' : 'least populous') : dir > 0 ? 'largest' : 'smallest';
  const describe = (e) => (kind === 'city' ? `${e.name} (${human(e.pop)} people)` : dim === 'pop' ? `${e.name} (${human(e.pop)} people)` : `${e.name} (${human(e.area)} square kilometres)`);
  if (kind === 'country') { highlight(s, top, true); fitCountries(s, D, scope.rkind === 'world' ? [scope] : top.length === 1 && scope.rkind !== 'world' ? [scope] : top); if (scope.rkind !== 'world') viewBox(s, scope.bb ?? s.bounds.flat()); s.focus = null; }
  else if (count === 1) focusOn(s, D, top[0]);
  else { viewBox(s, union(top.map((e) => [e.lat, e.lon, e.lat, e.lon]))); s.focus = null; }
  if (count === 1) return ok(`The ${adj} ${kind} ${where2}${kind === 'city' ? ' that I know' : ''} is ${describe(top[0])}.`);
  return ok(`The ${top.length} ${adj} ${kind === 'city' ? 'cities' : 'countries'} ${where2}: ${top.map(describe).join('; ')}.`);
}

export function listOp(ctx, { k, p }) {
  const D = db(ctx), s = ctx.state, scope = place(D, p);
  if (!scope) return no('unsupported', unknownNote(p));
  tab(ctx);
  if (k === 'cities') {
    if (scope.kind === 'city') return no('unsupported', 'A city does not contain cities.');
    const ccs = scope.kind === 'country' ? [scope.cc] : scope.members;
    const cs = ccs.flatMap((cc) => D.citiesOf.get(cc) ?? []).sort((a, b) => b.pop - a.pop);
    if (!cs.length) return no('missing', `I have no cities for ${scope.name}.`);
    if (scope.kind === 'country') focusOn(s, D, scope); else viewBox(s, scope.bb ?? [-58, -180, 80, 180]);
    const shown = cs.slice(0, 12).map((c) => c.name);
    const rule = scope.kind === 'country' && ['RO', 'MD'].includes(scope.cc) ? '30,000' : '500,000';
    return ok(`I know ${cs.length} ${cs.length === 1 ? 'city' : 'cities'} ${scope.kind === 'country' ? `in ${the(scope)}` : scope.rkind === 'world' ? 'in the world' : `in ${scope.name}`} with ${rule} people or more, the largest first: ${list(shown)}${cs.length > 12 ? `, and ${cs.length - 12} more` : ''}.`);
  }
  if (scope.kind !== 'region') return no('unsupported', `${scope.name} is not a continent or region, so it has no list of countries.`);
  const cs = members(D, scope).filter((c) => c.ind).sort((a, b) => a.name.localeCompare(b.name));
  if (!cs.length) return no('missing', `I have no countries for ${scope.name}.`);
  highlight(s, cs, true);
  viewBox(s, scope.bb ?? union(cs.map((c) => c.bb)));
  s.focus = null;
  const names = cs.map((c) => c.name);
  return ok(`${scope.rkind === 'world' ? 'The world' : scope.name.charAt(0).toUpperCase() + scope.name.slice(1)} has ${cs.length} countries${names.length <= 15 ? `: ${list(names)}` : `, for example ${list(names.slice(0, 12))}, and ${names.length - 12} more, all highlighted on the map`}.`);
}

export function count(ctx, { k, p }) {
  const D = db(ctx), s = ctx.state, scope = place(D, p);
  if (!scope) return no('unsupported', unknownNote(p));
  tab(ctx);
  if (k === 'cities') {
    const ccs = scope.kind === 'country' ? [scope.cc] : scope.members ?? [];
    const n = ccs.reduce((t, cc) => t + (D.citiesOf.get(cc)?.length ?? 0), 0);
    return ok(`I know ${n} cities ${scope.kind === 'country' ? `in ${the(scope)}` : `in ${scope.name}`} (capitals and cities of 500,000 people or more, plus Romanian and Moldovan towns of 30,000 or more).`);
  }
  if (scope.kind !== 'region') return no('unsupported', `${scope.name} is not a continent or region.`);
  const cs = members(D, scope).filter((c) => c.ind);
  highlight(s, cs, true);
  viewBox(s, scope.bb ?? union(cs.map((c) => c.bb))); s.focus = null;
  return ok(`There are ${cs.length} ${scope.rkind === 'world' ? 'independent countries in the world (including a few that are not universally recognised)' : `countries in ${scope.name}`}.`);
}

export function currency(ctx, { p }) {
  const D = db(ctx), s = ctx.state, e = place(D, p);
  if (!e) return no('unsupported', unknownNote(p));
  const { c, err } = needCountry(D, e, 'currency');
  if (err) return err;
  const cur = fact(D, c, 'currency').values;
  if (!cur.length) return no('missing', `I do not know the currency of ${the(c)}.`);
  tab(ctx);
  focusOn(s, D, c);
  return ok(`${theCap(c)} uses the ${list(cur)}.`);
}

export function languages(ctx, { p }) {
  const D = db(ctx), s = ctx.state, e = place(D, p);
  if (!e) return no('unsupported', unknownNote(p));
  const { c, err } = needCountry(D, e, 'language');
  if (err) return err;
  const lang = fact(D, c, 'language').values;
  if (!lang.length) return no('missing', `I do not know which languages are spoken in ${the(c)}.`);
  tab(ctx);
  focusOn(s, D, c);
  return ok(lang.length === 1 ? `People in ${the(c)} speak ${lang[0]}.` : `In ${the(c)} people speak ${list(lang)}.`);
}

export function info(ctx, { p }) {
  const D = db(ctx), s = ctx.state, e = place(D, p);
  if (!e) return no('unsupported', unknownNote(p));
  tab(ctx);
  focusOn(s, D, e);
  if (e.kind === 'country') {
    const nb = e.nb.map((cc) => D.byCc.get(cc)?.name).filter(Boolean);
    const bits = [describePlace(D, e)];
    if (e.pop) bits.push(`About ${human(e.pop)} people live there${e.area ? `, in ${fmt(e.area)} square kilometres` : ''}.`);
    if (nb.length) bits.push(`It borders ${list(nb.slice(0, 8))}${nb.length > 8 ? ' and more' : ''}.`); else bits.push('It has no land borders.');
    if (e.cur.length) bits.push(`The currency is the ${list(e.cur)}.`);
    if (e.lang.length) bits.push(`People speak ${list(e.lang)}.`);
    return ok(bits.join(' '));
  }
  if (e.kind === 'city') {
    const near = nearestCity(D, e, D.cities.filter((c) => c !== e && c.pop >= 5e5));
    return ok(`${describePlace(D, e)}${near ? ` The nearest big city I know is ${near.city.name}, ${fmt(near.km)} km away.` : ''}`);
  }
  const cs = members(D, e);
  const total = cs.reduce((t, c) => t + (c.pop ?? 0), 0);
  return ok(`${describePlace(D, e)}${total ? ` Together they have about ${human(total)} people.` : ''}`);
}

// ---- distance ----------------------------------------------------------------------------------------------------------------
const endpoint = (e) => ({ name: e.name, lat: round(e.lat), lon: round(e.lon) });
function drawLine(s, from, to) {
  const km = haversine(from, to);
  s.lines.push({ id: `l${s.nextId++}`, from, to, km: Math.round(km) });
  viewBox(s, [Math.min(from.lat, to.lat), Math.min(from.lon, to.lon), Math.max(from.lat, to.lat), Math.max(from.lon, to.lon)]);
  s.focus = null;
  return km;
}
const distText = (a, b, km, centres) => `${a} and ${b} are about ${fmt(km)} km (${fmt(km * 0.621371)} miles) apart${centres ? ', measured between their centres' : ''}, as the crow flies.`;

export function distance(ctx, { a, b, unit }) {
  const D = db(ctx), s = ctx.state, x = place(D, a), y = place(D, b);
  if (!x) return no('unsupported', unknownNote(a));
  if (!y) return no('unsupported', unknownNote(b));
  if (x.kind === 'region' || y.kind === 'region') return no('unsupported', 'I can measure distances between countries and cities, not regions.');
  if (x === y) return no('unsupported', `That is the same place: ${x.name}.`);
  tab(ctx);
  const km = drawLine(s, endpoint(x), endpoint(y));
  return ok(distText(x.name, y.name, km, x.kind === 'country' || y.kind === 'country'));
}

export function distanceFrom(ctx, { b, from }) {
  const D = db(ctx), s = ctx.state, y = place(D, b);
  if (!y) return no('unsupported', unknownNote(b));
  if (y.kind === 'region') return no('unsupported', 'I can measure distances to countries and cities, not regions.');
  tab(ctx);
  let origin = null;
  if (from === 'me' || (from === undefined && s.me)) {
    if (s.me) origin = { name: 'You', lat: s.me.lat, lon: s.me.lon };
    else {
      s.pending = { action: 'distance', to: b };
      ctx.effect('geo.locate', {});
      return ok(`To measure from where you are, I need your location. Your browser will ask for permission; then I will measure the distance to ${y.name}.`);
    }
  } else if (s.focus && s.focus.name !== y.name) origin = { name: s.focus.name, lat: s.focus.lat, lon: s.focus.lon };
  else return no('missing', `Distance from where? Say "how far is ${y.name} from Paris" or "where am I" first.`);
  const km = drawLine(s, origin, endpoint(y));
  return ok(origin.name === 'You' ? `You are about ${fmt(km)} km (${fmt(km * 0.621371)} miles) from ${y.name}, as the crow flies.` : distText(origin.name, y.name, km, y.kind === 'country'));
}

// ---- where am I, what is here, what is on the map ------------------------------------------------------------------------------
export function locate(ctx) {
  tab(ctx);
  ctx.effect('geo.locate', {});
  return ok('Let me find out where you are. Your browser will ask for permission to use your location.');
}

export function onObservation(ctx, obs) {
  if (obs.effect !== 'geo.locate') return null;
  const s = ctx.state, D = db(ctx);
  const pending = s.pending; s.pending = null;
  const d = obs.data ?? {};
  if (!obs.ok || !Number.isFinite(Number(d.lat)) || !Number.isFinite(Number(d.lon))) {
    return { reply: `I could not get your location${obs.detail ? ` (${obs.detail})` : ''}. You can still tell me a place, for example "show me Cluj".` };
  }
  const lat = Number(d.lat), lon = Number(d.lon);
  s.me = { lat: round(lat), lon: round(lon), accuracy: Number.isFinite(Number(d.accuracy)) ? Math.round(Number(d.accuracy)) : null };
  const n = nearestCity(D, { lat, lon });
  const near = n ? `${n.km < 25 ? 'in' : 'near'} ${n.city.name}, ${the(D.byCc.get(n.city.cc))}` : 'somewhere on Earth';
  s.markers = s.markers.filter((m) => m.id !== 'me');
  s.markers.push({ id: 'me', name: 'You are here', lat: s.me.lat, lon: s.me.lon, label: near });
  viewPoint(s, lat, lon, 9);
  s.focus = { name: 'You are here', kind: 'me', lat: s.me.lat, lon: s.me.lon, cc: n?.city.cc ?? null, label: near };
  if (pending?.action === 'distance') {
    const y = place(D, pending.to);
    if (y) {
      const km = drawLine(s, { name: 'You', lat, lon }, endpoint(y));
      return { reply: `You seem to be ${near}. You are about ${fmt(km)} km (${fmt(km * 0.621371)} miles) from ${y.name}, as the crow flies.` };
    }
  }
  return { reply: `You seem to be ${near} (${deg(lat, lon)}${s.me.accuracy ? `, accurate to about ${fmt(s.me.accuracy)} metres` : ''}). I put a marker there.` };
}

export function here(ctx) {
  const D = db(ctx), s = ctx.state;
  tab(ctx);
  const p = s.clicked ? { lat: s.clicked.lat, lon: s.clicked.lon } : { lat: s.center.lat, lon: s.center.lon };
  const k = s.clicked?.cc ? D.byCc.get(s.clicked.cc) : null;
  const n = nearestCity(D, p);
  const where2 = s.clicked ? 'That point' : 'The middle of the map';
  const bits = [`${where2} is at ${deg(p.lat, p.lon)}.`];
  if (k) bits.push(`It is in ${the(k)}, ${CONT[k.cont]}.`);
  else if (s.clicked) bits.push('It does not look like any country I have outlines for: probably open water.');
  if (n) bits.push(`The nearest city I know is ${n.city.name} (${human(n.city.pop)} people), ${n.km < 5 ? 'right here' : `${fmt(n.km)} km away`}.`);
  s.focus = { name: k?.name ?? 'This place', kind: 'point', lat: round(p.lat), lon: round(p.lon), cc: k?.cc ?? null, label: deg(p.lat, p.lon) };
  s.clicked = null;
  return ok(bits.join(' '));
}

export function describe(ctx) {
  const D = db(ctx), s = ctx.state;
  tab(ctx);
  const n = nearestCity(D, s.center);
  const bits = [`The map is centred ${n ? `${n.km < 50 ? 'on' : 'near'} ${n.city.name}` : 'on the sea'} at zoom ${s.zoom} (${s.layer === 'osm' ? 'street map' : 'offline country map'}).`];
  if (s.markers.length) bits.push(`${s.markers.length} ${s.markers.length === 1 ? 'marker' : 'markers'}: ${some(s.markers.map((m) => m.name))}.`);
  if (s.highlighted.length) bits.push(`${s.highlighted.length} highlighted ${s.highlighted.length === 1 ? 'country' : 'countries'}: ${some(s.highlighted.map((h) => h.name))}.`);
  if (s.lines.length) bits.push(`${s.lines.length} distance ${s.lines.length === 1 ? 'line' : 'lines'}.`);
  if (bits.length === 1) bits.push('There are no markers, highlights or lines.');
  return ok(bits.join(' '));
}

export function markers(ctx) {
  const s = ctx.state;
  tab(ctx);
  if (!s.markers.length) return ok('There are no markers on the map.');
  return ok(`There ${s.markers.length === 1 ? 'is 1 marker' : `are ${s.markers.length} markers`}: ${list(s.markers.map((m) => m.name))}.`);
}

export function highlights(ctx) {
  const s = ctx.state;
  tab(ctx);
  if (!s.highlighted.length) return ok('No countries are highlighted.');
  return ok(`${s.highlighted.length} highlighted ${s.highlighted.length === 1 ? 'country' : 'countries'}: ${some(s.highlighted.map((h) => h.name), 12)}.`);
}

export function unknown(ctx, { x }) {
  return no('unsupported', `I do not know a place called ${x}. I know every country and capital, cities with 500,000 people or more, and Romanian and Moldovan towns with 30,000 or more.`);
}

/** "Show me" alone: ask which place; the dialog layer keeps the question pending for the next utterance (spec 11). */
export function askPlace() {
  return { status: 'missing', note: 'Which place should I show?', pending: { key: 'p', type: 'lex.geo.map.places' } };
}
export const showPlace = undoable(_showPlace);
export const coords = undoable(_coords);
export const zoom = undoable(_zoom);
export const zoomTo = undoable(_zoomTo);
export const pan = undoable(_pan);
export const reset = undoable(_reset);
export const clearAll = undoable(_clearAll);
export const mark = undoable(_mark);
export const markHere = undoable(_markHere);
export const markSet = undoable(_markSet);
export const clearMarkers = undoable(_clearMarkers);
export const highlightPlaces = undoable(_highlightPlaces);
export const clearHighlight = undoable(_clearHighlight);
export const clearLines = undoable(_clearLines);
export const layer = undoable(_layer);

// ---- the map as a VIEW of the session things (spec 23): the geographic aspect, one request for a whole selection -------------------------------------------------
// A thing is a pin where the map knows its place: by its name or its kind (the places of the catalog and of this world's data), else by the position it carries (lat and lon).
// What has no known place is said plainly; nothing here reads a tab's own cards: every view hands things over through things.show.
export const view = () => ok({ id: 'geo.map', noun: 'map', words: ['map', 'atlas', 'world map', 'pin', 'pins'], aspects: ['geographic'], many: true, kinds: null });
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
const keyOf = (w) => String(w ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');
function _adopt(ctx, { things, thing, facts } = {}) {
  const list = [...(things ?? (thing ? [thing] : [])), ...((facts?.places ?? []).map((p) => ({ name: p, kind: 'place', attrs: {} })))];
  if (!list.length) return no('unsupported', 'I was given nothing to put on the map.');
  const D = db(ctx), s = ctx.state;
  const found = [], lost = [];
  for (const t of list) {
    budget.tick('map.adopt');
    const name = t.name ?? t.label ?? String(t.kind ?? '').replace(/_/g, ' ');
    const e = [t.name, t.label, t.kind].map((k) => place(D, keyOf(k))).find((x) => x && x.lat !== null && x.kind !== 'region')
      ?? (Number.isFinite(Number(t.attrs?.lat)) && Number.isFinite(Number(t.attrs?.lon)) ? { name, kind: 'point', lat: Number(t.attrs.lat), lon: Number(t.attrs.lon) } : null);
    if (e) found.push(e); else lost.push(name);
  }
  const miss = lost.length ? ` I do not know where ${list_(lost)} ${lost.length === 1 ? 'is' : 'are'}, so ${lost.length === 1 ? 'it is' : 'they are'} not on the map.` : '';
  if (!found.length) return no('unsupported', miss.trim());
  tab(ctx);
  const added = [];
  for (const e of found) if (marker(s, D, e, e.kind === 'point' ? `${deg(e.lat, e.lon)}` : undefined)) added.push(e.name);
  if (found.length === 1) { const e = found[0]; if (e.kind === 'point') viewPoint(s, e.lat, e.lon, 6); else focusOn(s, D, e); }
  else { viewBox(s, union(found.map((e) => [e.lat, e.lon, e.lat, e.lon]))); s.focus = null; }
  const names = found.map((e) => e.name);
  const say = found.length === 1 ? `${added.length ? 'I put a pin on' : ''}${added.length ? ' ' : ''}${added.length ? names[0] : `${names[0]} is already on the map`}.` : `I put ${added.length === found.length ? '' : `${added.length} new `}pins on ${list_(names)}${added.length < found.length ? ` (${found.length - added.length} already there)` : ''}.`;
  return ok(`${say}${miss}`);
}
const list_ = list;
export const adopt = undoable(_adopt);

// ---- undo ------------------------------------------------------------------------------------------------
const MAX_UNDO = 30;
const snapshot = (st) => { const { history, future, ...rest } = st; return JSON.stringify(rest); };
/** Wraps a changing operation: the state before it is kept for "undo" unless it changed nothing. */
function undoable(fn) {
  return (ctx, args) => {
    const before = snapshot(ctx.state);
    const r = fn(ctx, args);
    if (r?.status === 'supported' && snapshot(ctx.state) !== before) {
      (ctx.state.history ??= []).push(before);
      if (ctx.state.history.length > MAX_UNDO) ctx.state.history.shift();
      ctx.state.future = [];
    }
    return r;
  };
}
function restoreFrom(st, json) {
  const { history, future } = st;
  for (const k of Object.keys(st)) if (k !== 'history' && k !== 'future') delete st[k];
  Object.assign(st, JSON.parse(json), { history, future });
}
export function undo(ctx) {
  const st = ctx.state;
  const prev = st.history?.pop();
  if (!prev) return no('missing', 'There is nothing to undo on the map yet.');
  (st.future ??= []).push(snapshot(st));
  restoreFrom(st, prev);
  tab(ctx);
  return ok('OK, I undid the last change to the map.');
}
export function redo(ctx) {
  const st = ctx.state;
  const next = st.future?.pop();
  if (!next) return no('missing', 'There is nothing to redo on the map.');
  (st.history ??= []).push(snapshot(st));
  restoreFrom(st, next);
  tab(ctx);
  return ok('OK, I did it again.');
}
