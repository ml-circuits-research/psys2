// SPDX-License-Identifier: AGPL-3.0-only
// The places of the map, by lookup (spec 21 section 12). ONE reading path: every country, city and group comes from the catalog's `k.geo` (`ctx.knowledge`: the wires of a type once the
// host's `needs` entries `wires:k.geo.country` ... settled, read synchronously through `peekWires`); the world keeps no knowledge base of its own. What k.geo lacks (the bounding
// boxes and aliases of the regions) is `regions.mjs`, listed in handover/knowledge-out/catalog-lacks.md. The entities have the shape the operations of the map always read:
//   country { kind, name, cc, pop, area, lat, lon, bb [s, w, n, e], capital [names], cont (key), sub, nb [cc], cur [], lang [], land, ind }
//   city { kind, name, cc, pop, lat, lon, isCapital }      region { kind, rkind, name, bb, members [cc] }
// Browser-safe: no imports beyond the sibling data module.
import { REGIONS } from './regions.mjs';

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** "St. George's" -> "st_georges": the form of a name in a lexicon and in an argument of the map's operations. */
export const keyOf = (s) => fold(s).replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/ /g, '_');
/** The singular of the last word of a key ("united_states" -> "united_state"): the lexicon lemma of a place name. */
const singKey = (k) => k.replace(/([a-z])s$/, '$1');
const num = (v) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };

/** The wire types the map needs before an operation runs (the host's `needs` hook): `wires:<type>[@<world>]`. */
export const NEEDS = ['wires:k.geo.country', 'wires:k.geo.city', 'wires:k.geo.group', 'wires:core.word@k.geo'];

/** Facts of one thing merged over the shards that state them (the continent shard and the borders shard of one country are one thing). */
function merge(ws, idOf) {
  const out = new Map();
  for (const w of ws) {
    budget.tick('geo.merge');
    const id = idOf(w.f);
    if (!id) continue;
    const e = out.get(id) ?? out.set(id, {}).get(id);
    for (const [k, v] of Object.entries(w.f)) e[k] = [...new Set([...(e[k] ?? []), ...v])];
  }
  return out;
}

let CACHE = null;
/** The index of places, or null while the catalog's countries and cities are not loaded. Cached on the identity of the loaded wires. */
export function buildIndex(kn) {
  const cw = kn?.peekWires?.('k.geo.country'), ci = kn?.peekWires?.('k.geo.city');
  if (!cw?.length || !ci?.length) return null;
  if (CACHE?.src === cw && CACHE.srcCities === ci) return CACHE.D;
  const groups = kn.peekWires('k.geo.group') ?? [], words = kn.peekWires('core.word', 'k.geo') ?? [];
  const byKey = new Map(), byCc = new Map(), byName = new Map(), cities = [], countries = [], regions = [], capitalOf = new Map(), citiesOf = new Map();
  const first = (f, k) => f?.[k]?.[0];
  // countries
  for (const f of merge(cw, (f) => keyOf(first(f, 'name'))).values()) {
    const cc = first(f, 'code2') ?? first(f, 'code');
    if (!cc) continue;
    const bb = ['south', 'west', 'north', 'east'].map((k) => num(first(f, k)));
    const e = { id: `c.${cc}`, kind: 'country', name: first(f, 'name'), keys: [], pop: num(first(f, 'population')), lat: num(first(f, 'lat')), lon: num(first(f, 'lon')), bb: bb.every((x) => x !== null) ? bb : null, cc,
      capital: f.capital ?? [], cont: keyOf(first(f, 'continent') ?? ''), sub: first(f, 'region') ?? '', area: num(first(f, 'area')), nbNames: f.neighbour ?? [], nb: [], cur: f.currency ?? [], lang: f.language ?? [],
      land: first(f, 'landlocked') === 'true', ind: first(f, 'independent') !== 'false', formal: first(f, 'formal') };
    countries.push(e); byCc.set(cc, e);
    for (const n of [e.name, e.formal]) if (n) byName.set(keyOf(n), e);
  }
  for (const w of words) for (const m of w.f.means ?? []) { const c = byName.get(keyOf(m)); if (c) for (const t of w.f.text ?? []) if (!byName.has(keyOf(t))) byName.set(keyOf(t), c); }
  for (const c of countries) c.nb = c.nbNames.map((n) => byName.get(keyOf(n))?.cc).filter(Boolean);
  // cities (one per name and country; the shards of one city merge)
  for (const f of merge(ci, (f) => `${keyOf(first(f, 'name'))}|${keyOf(first(f, 'country') ?? '')}`).values()) {
    const country = byName.get(keyOf(first(f, 'country') ?? ''));
    const e = { id: `t.${keyOf(first(f, 'name'))}.${country?.cc ?? ''}`, kind: 'city', name: first(f, 'name'), keys: [], pop: num(first(f, 'population')) ?? 0, lat: num(first(f, 'lat')), lon: num(first(f, 'lon')), cc: country?.cc ?? null,
      isCapital: !!first(f, 'capital_of') || !!country?.capital.some((n) => keyOf(n) === keyOf(first(f, 'name'))) };
    if (e.lat === null || e.lon === null) continue;
    cities.push(e);
    if (e.cc) { (citiesOf.get(e.cc) ?? citiesOf.set(e.cc, []).get(e.cc)).push(e); if (e.isCapital) (capitalOf.get(e.cc) ?? capitalOf.set(e.cc, []).get(e.cc)).push(e); }
  }
  for (const l of citiesOf.values()) l.sort((a, b) => b.pop - a.pop);
  // regions: the catalog gives the countries (continent, subregion, group), regions.mjs the aliases and the boxes
  const groupByName = new Map(groups.map((g) => [keyOf(g.f.name?.[0]), g.f.member ?? []]));
  for (const r of REGIONS) {
    let members;
    if (r.kind === 'world') members = countries.filter((c) => c.ind).map((c) => c.cc);
    else if (r.kind === 'continent') members = countries.filter((c) => c.cont === keyOf(r.catalogContinent)).map((c) => c.cc);
    else if (r.kind === 'group') members = (groupByName.get(keyOf(r.catalogGroup)) ?? []).map((n) => byName.get(keyOf(n))?.cc).filter(Boolean);
    else members = r.members ?? countries.filter((c) => c.sub === r.catalogRegion).map((c) => c.cc);
    regions.push({ id: `r.${r.id}`, kind: 'region', rkind: r.kind, name: r.name, keys: r.keys, bb: r.bb, members, lat: null, lon: null, pop: null, cc: null });
  }
  // keys: countries first, then regions, then cities by population (a country is the first reading of its name)
  const add = (e, k) => { if (k && !byKey.has(k)) byKey.set(k, e); };
  const sing = (e, n) => { const k = keyOf(n); add(e, k); add(e, singKey(k)); };
  for (const c of countries) { sing(c, c.name); if (c.formal) sing(c, c.formal); }
  for (const [t, c] of byName) { add(c, t.replace(/ /g, '_')); add(c, singKey(t.replace(/ /g, '_'))); }
  for (const r of regions) { for (const k of r.keys) add(r, k); sing(r, r.name.replace(/^the /, '')); }
  for (const c of [...cities].sort((a, b) => b.pop - a.pop)) sing(c, c.name);
  // a hyphenated compound name is also said by its first part (Cluj-Napoca: "Cluj"), when no other name has that key (the open place lexicon reads the same rule)
  for (const c of [...cities].sort((a, b) => b.pop - a.pop)) { const i = c.name.indexOf('-'); if (i >= 4 && /^[A-Za-z]+$/.test(fold(c.name.slice(0, i)))) add(c, keyOf(c.name.slice(0, i))); }
  const D = { byKey, byCc, cities, countries, regions, capitalOf, citiesOf };
  CACHE = { src: cw, srcCities: ci, D };
  return D;
}

/** The place a lexicon key or a few words name, or null: the words are folded to a key; a leading "the", a plural last word and an apostrophe-s are tried. */
export function lookup(D, raw) {
  if (raw === undefined || raw === null) return null;
  let k = keyOf(String(raw).replace(/[’']s\b/g, ''));
  k = k.replace(/^the_/, '');
  const hit = D.byKey.get(k) ?? D.byKey.get(singKey(k)) ?? D.byKey.get(`${k}s`);
  if (hit) return hit;
  // a place by a relation of k.geo: "the capital of Sudan", "sudan capital" is the city the country's capital names
  const rel = /^capital(?:_city)?_of_(.+)$/.exec(k) ?? /^(.+?)s?_capital(?:_city)?$/.exec(k);
  const c = rel ? D.byKey.get(rel[1]) ?? D.byKey.get(singKey(rel[1])) : null;
  return c?.kind === 'country' ? D.capitalOf.get(c.cc)?.[0] ?? null : null;
}

/** The names a request may need looked up before an operation runs (the host's `openSlots` hook): every text argument that is not the sentence itself. */
export function namesOf(args) {
  const out = new Set();
  for (const [k, v] of Object.entries(args ?? {})) {
    if (['text', 'mode', 'dir', 'amt', 'amt2', 'n', 'm', 'unit', 'la', 'lo', 'ns', 'ew', 'l', 'what', 'k', 'self', 'nb', 'plural', 'all', 'last'].includes(k) || v === undefined || v === null) continue;
    const t = String(v).replace(/_/g, ' ').replace(/^(?:the|a|an)\s+/i, '').trim();
    if (!t || /^\d+(?:\.\d+)?$/.test(t) || t.split(/\s+/).length > 4) continue;
    out.add(t);
    if (/\band\b/.test(t)) for (const p of t.split(/\s+and\s+|\s*,\s*/)) if (p.trim()) out.add(p.trim().replace(/^(?:the|a|an)\s+/i, ''));
  }
  return [...out];
}
