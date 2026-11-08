#!/usr/bin/env node
// Builds the data of the world `geo.map` (spec 07 section 6-7) from open npm datasets.
//
//   mkdir /tmp/geo-src && cd /tmp/geo-src && npm init -y
//   npm i world-countries@5.1.0 all-the-cities@3.1.0 country-json@2.3.0 world-atlas@2.0.2 topojson-client@3.1.0
//   node scripts/build-geo-data.mjs --modules /tmp/geo-src/node_modules
//   node scripts/build-geo-data.mjs --modules /tmp/geo-src/node_modules --check     (exit 1 when files on disk are stale)
//
// Sources and licences (also recorded in the `core.source` of every KB wire and in worlds/geo.map/data/README.md):
//   countries  world-countries 5.1.0 (mledoze/countries)   ODbL 1.0   names, capitals, region, borders, area, currencies, languages
//   population country-json 2.3.0 (country-by-population)  MIT        about 2018 estimates, one number per country
//   cities     all-the-cities 3.1.0 (GeoNames gazetteer)    CC BY 4.0  capitals, cities of 500,000+ people, Romanian/Moldovan 30,000+
//   outlines   world-atlas 2.0.2 countries-50m (Natural Earth) public domain; written to docs/webchat/vendor/map/
//
// Output (deterministic):
//   worlds/geo.map/kb.sop         one wire per country, city and region (compact keys)
//   worlds/geo.map/lexicon.sop    lex.geo.map.places (every name the language layer can recognise, lemma form) + lexicon.extra.sop verbatim
//   worlds/geo.map/data/README.md data sources, licences, counts, how to rebuild
//   docs/webchat/vendor/map/countries-50m.json   TopoJSON, each country carries `cc` (ISO alpha-2)
//   docs/webchat/vendor/map/places.json          compact country and city lists for the offline base map (labels, dots)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { singularLemma } from '../src/formalizer/rules/lemma.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const WORLD = path.join(REPO, 'worlds/geo.map');
const VENDOR = path.join(REPO, 'docs/webchat/vendor/map');

export const SRC_COUNTRIES = 'world-countries 5.1.0 (ODbL 1.0, https://github.com/mledoze/countries)';
export const SRC_POP = 'country-json 2.3.0 (MIT, about 2018 estimates)';
export const SRC_CITIES = 'GeoNames via all-the-cities 3.1.0 (CC BY 4.0, https://www.geonames.org)';
const MIN_POP = 500000, MIN_POP_RO = 30000;

// ---- names -> lexicon keys -------------------------------------------------------------------------------------
const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[‘’]/g, "'").toLowerCase();
/** The lexicon entry the rule formalizer looks up for a name: lowercase ASCII tokens joined by `_`, last token singular. null when unusable. */
export function keyOf(name) {
  const t = fold(name).replace(/[.,()]/g, ' ').split(/\s+/).filter(Boolean);
  if (!t.length || t.length > 3) return null;
  if (!t.every((w) => /^[a-z]+(?:['-][a-z]+)*$/.test(w))) return null;
  if (t.some((w) => w.endsWith("'s"))) return null;
  t[t.length - 1] = singularLemma(t[t.length - 1]);
  return t.join('_');
}
const q = (s) => JSON.stringify(String(s));
const r = (x, d) => Number(Number(x).toFixed(d));

// ---- hand-written additions ----------------------------------------------------------------------------------------
const COUNTRY_ALIASES = {
  US: ['usa', 'america'], GB: ['uk', 'britain', 'great britain'], NL: ['holland'], CZ: ['czech republic'], MM: ['burma'],
  CI: ["cote d'ivoire"], CD: ['congo', 'drc', 'congo-kinshasa', 'democratic republic of congo'], CG: ['congo-brazzaville', 'republic of congo'],
  AE: ['uae', 'emirates'], MK: ['macedonia'], SZ: ['swaziland'], TL: ['east timor'], TR: ['turkiye'], VA: ['vatican', 'holy see'],
  RU: ['russian federation'], FM: ['micronesia'], CV: ['cape verde', 'cabo verde'], ST: ['sao tome'], BA: ['bosnia'], TT: ['trinidad'],
  AG: ['antigua'], KN: ['saint kitts', 'st kitts'], VC: ['saint vincent', 'st vincent'], LC: ['st lucia'], GM: ['the gambia'], BS: ['the bahamas'],
  KR: ['korea', 'republic of korea'], KP: ['dprk'], IR: ['persia'], MD: ['moldavia'], BY: ['byelorussia'], LA: ['lao'],
  GS: ['south georgia'], SJ: ['svalbard'], HM: ['heard island'], UM: ['us minor islands'], IO: ['british indian ocean territory'],
};
const CITY_ALIASES = [ // [alias, GeoNames name, country code]
  ['kiev', 'Kyiv', 'UA'], ['bombay', 'Mumbai', 'IN'], ['calcutta', 'Kolkata', 'IN'], ['madras', 'Chennai', 'IN'], ['peking', 'Beijing', 'CN'],
  ['saigon', 'Ho Chi Minh City', 'VN'], ['rangoon', 'Yangon', 'MM'], ['constantinople', 'Istanbul', 'TR'], ['wien', 'Vienna', 'AT'],
  ['roma', 'Rome', 'IT'], ['praha', 'Prague', 'CZ'], ['warszawa', 'Warsaw', 'PL'], ['lisboa', 'Lisbon', 'PT'], ['koln', 'Cologne', 'DE'],
  ['munchen', 'Munich', 'DE'], ['bucuresti', 'Bucharest', 'RO'], ['cluj', 'Cluj-Napoca', 'RO'], ['napoca', 'Cluj-Napoca', 'RO'],
  ['nyc', 'New York City', 'US'], ['new york', 'New York City', 'US'], ['la', 'Los Angeles', 'US'], ['st petersburg', 'Saint Petersburg', 'RU'],
  ['beograd', 'Belgrade', 'RS'], ['moskva', 'Moscow', 'RU'], ['firenze', 'Florence', 'IT'], ['napoli', 'Naples', 'IT'], ['athina', 'Athens', 'GR'],
  ['kyiv', 'Kyiv', 'UA'], ['astana', 'Nur-Sultan', 'KZ'], ['nur-sultan', 'Astana', 'KZ'], ['washington dc', 'Washington, D.C.', 'US'],
  ['washington', 'Washington, D.C.', 'US'], ['mexico', 'Mexico City', 'MX'], ['hong kong', 'Hong Kong', 'HK'], ['targu mures', 'Targu Mures', 'RO'],
];
/** Groups that are not continents or UN subregions; members are ISO alpha-2 codes (as of 2024). */
const GROUPS = [
  { id: 'eu', name: 'the European Union', keys: ['european union', 'eu'], mem: 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE', bb: [34, -10, 70, 33] },
  { id: 'nato', name: 'NATO', keys: ['nato'], mem: 'AL BE BG CA HR CZ DK EE FI FR DE GR HU IS IT LV LT LU ME NL MK NO PL PT RO SK SI ES SE TR GB US', bb: [25, -125, 72, 45] },
  { id: 'scandinavia', name: 'Scandinavia', keys: ['scandinavia'], mem: 'NO SE DK', bb: [54, 4, 71.5, 31] },
  { id: 'nordic', name: 'the Nordic countries', keys: ['nordic'], mem: 'NO SE DK FI IS', bb: [54, -25, 71.5, 32] },
  { id: 'baltic', name: 'the Baltic states', keys: ['baltic'], mem: 'EE LV LT', bb: [53.5, 20.5, 59.8, 28.3] },
  { id: 'benelux', name: 'the Benelux', keys: ['benelux'], mem: 'BE NL LU', bb: [49.4, 2.5, 53.6, 7.3] },
  { id: 'balkans', name: 'the Balkans', keys: ['balkans'], mem: 'AL BA BG HR XK ME MK RS SI GR RO', bb: [34.8, 13.3, 48.3, 30] },
  { id: 'middle_east', name: 'the Middle East', keys: ['middle east'], mem: 'AE BH IQ IR IL JO KW LB OM PS QA SA SY TR YE EG CY', bb: [12, 25, 42, 63.5] },
];
const CONTINENTS = [ // id, name, view bounds [s, w, n, e]
  ['europe', 'Europe', [34, -25, 71.5, 45]], ['asia', 'Asia', [-11, 25, 60, 150]], ['africa', 'Africa', [-35, -18, 37.5, 52]],
  ['north_america', 'North America', [5, -170, 75, -50]], ['south_america', 'South America', [-56, -82, 13, -34]],
  ['oceania', 'Oceania', [-48, 112, 2, 179]], ['antarctica', 'Antarctica', [-85, -180, -62, 180]],
];
/** Fixed views for subregions whose member bounding boxes are misleading (Russia, Fiji, Kiribati, US territories ...). */
const SUBREGION_VIEW = {
  'Eastern Europe': [43, 16, 62, 42], 'Northern Europe': [50, -25, 71.5, 33], 'Central Europe': [45, 5, 55, 25], 'Western Europe': [42, -5, 55, 17],
  'Southern Europe': [34, -10, 47, 29], 'Southeast Europe': [34.8, 13.3, 48.3, 30], 'Eastern Asia': [18, 73, 54, 146], 'Central Asia': [35, 46, 56, 88],
  'Southern Asia': [5, 44, 40, 93], 'South-Eastern Asia': [-11, 92, 29, 141], 'Western Asia': [12, 26, 42, 63.5], 'Northern Africa': [15, -18, 37.5, 37],
  'Western Africa': [4, -18, 24, 16], 'Eastern Africa': [-27, 28, 18, 52], 'Middle Africa': [-14, 8, 24, 32], 'Southern Africa': [-35, 11, -17, 42],
  Caribbean: [9.5, -86, 27, -59], 'Central America': [7, -93, 19, -76], 'North America': [5, -170, 75, -50], 'South America': [-56, -82, 13, -34],
  'Australia and New Zealand': [-48, 112, -9, 179], Melanesia: [-23, 138, 2, 180], Micronesia: [-1, 130, 21, 180], Polynesia: [-30, -180, 25, -130],
};
const MANUAL_POP = { TL: 1267972 }; // Timor-Leste is missing from country-json (World Bank 2018)

// ---- geometry helpers ------------------------------------------------------------------------------------------------
function ringArea(ring) { let a = 0; for (let i = 0, n = ring.length; i < n; i++) { const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % n]; a += x1 * y2 - x2 * y1; } return Math.abs(a / 2); }
/** [south, west, north, east] of the largest polygon of a (Multi)Polygon feature. */
function bboxOfLargest(geom) {
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  let best = null, bestA = -1;
  for (const p of polys) { const a = ringArea(p[0]); if (a > bestA) { bestA = a; best = p[0]; } }
  if (!best) return null;
  let s = 90, w = 180, n = -90, e = -180;
  for (const [x, y] of best) { s = Math.min(s, y); n = Math.max(n, y); w = Math.min(w, x); e = Math.max(e, x); }
  return [s, w, n, e];
}
const unionBox = (boxes) => boxes.reduce((a, b) => (a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : b.slice()), null);

// ---- build -------------------------------------------------------------------------------------------------------------------
export async function build({ modules }) {
  const req = createRequire(path.join(path.resolve(modules), 'x.js'));
  const countriesRaw = req('world-countries');
  const cities = req('all-the-cities');
  const popList = req('country-json/src/country-by-population.json');
  const abbr = req('country-json/src/country-by-abbreviation.json');
  const topology = JSON.parse(await readFile(req.resolve('world-atlas/countries-50m.json'), 'utf8'));
  const topo = req('topojson-client');
  const versions = Object.fromEntries(['world-countries', 'all-the-cities', 'country-json', 'world-atlas', 'topojson-client'].map((m) => [m, JSON.parse(readFileSync(req.resolve(`${m}/package.json`))).version]));

  // outlines: ISO numeric id -> country code, bounding boxes of the largest polygons
  const byNum = new Map(countriesRaw.filter((c) => c.ccn3).map((c) => [c.ccn3, c]));
  const KOSOVO = countriesRaw.find((c) => c.cca2 === 'XK');
  const fc = topo.feature(topology, topology.objects.countries);
  const bbox = new Map();
  const geoms = topology.objects.countries.geometries;
  fc.features.forEach((f, i) => {
    const c = (f.id !== undefined && byNum.get(String(f.id).padStart(3, '0'))) || (f.properties.name === 'Kosovo' ? KOSOVO : null);
    geoms[i].properties = { name: f.properties.name, cc: c?.cca2 ?? null };
    if (c) { const b = bboxOfLargest(f.geometry); if (b) bbox.set(c.cca2, b); }
  });
  bbox.set('FJ', [-19.2, 177, -16, 180]);
  bbox.set('RU', [41.2, 27.3, 77.7, 180]); // the largest ring of Russia wraps the antimeridian
  for (const g of geoms) delete g.id;

  // population
  const a2 = new Map(abbr.map((x) => [x.country, x.abbreviation]));
  const pop = new Map();
  for (const p of popList) { const k = a2.get(p.country); if (k && p.population) pop.set(k, p.population); }
  for (const [k, v] of Object.entries(MANUAL_POP)) if (!pop.has(k)) pop.set(k, v);

  // countries
  const contOf = (c) => (c.region === 'Americas' ? (c.subregion === 'South America' ? 'south_america' : 'north_america')
    : c.region === 'Antarctic' ? 'antarctica' : fold(c.region).replace(/ /g, '_'));
  const countries = countriesRaw.map((c) => ({
    cc: c.cca2, cca3: c.cca3, name: c.name.common, official: c.name.official, cap: c.capital ?? [], cont: contOf(c), sub: c.subregion || '',
    pop: pop.get(c.cca2) ?? null, area: c.area ? Math.round(c.area) : null, lat: c.latlng?.[0], lon: c.latlng?.[1], bb: bbox.get(c.cca2) ?? null,
    nb: c.borders ?? [], cur: Object.values(c.currencies ?? {}).map((x) => x.name), lang: Object.values(c.languages ?? {}), land: !!c.landlocked, ind: !!c.independent,
  }));
  const cca3to2 = new Map(countries.map((c) => [c.cca3, c.cc]));
  for (const c of countries) c.nb = c.nb.map((b) => cca3to2.get(b)).filter(Boolean).sort();
  const byCc = new Map(countries.map((c) => [c.cc, c]));
  countries.sort((a, b) => a.cc.localeCompare(b.cc));

  // cities: capitals + large cities + Romanian/Moldovan towns
  const allByCc = new Map();
  for (const c of cities) { if (!allByCc.has(c.country)) allByCc.set(c.country, []); allByCc.get(c.country).push(c); }
  const chosen = new Map(); // cityId -> { rec, capital }
  const missingCapital = [];
  for (const k of countries) {
    const list = allByCc.get(k.cc) ?? [];
    for (const cap of k.cap) {
      const f = fold(cap).replace(/[.,]/g, '');
      const sameName = (c) => fold(c.name).replace(/[.,]/g, '') === f;
      const m = list.find((c) => c.featureCode === 'PPLC' && sameName(c)) ?? list.filter(sameName).sort((a, b) => b.population - a.population)[0]
        ?? list.find((c) => c.featureCode === 'PPLC' || c.featureCode === 'PPLCH');
      if (!m) { missingCapital.push(`${k.cc}:${cap}`); continue; }
      chosen.set(m.cityId, { rec: m, capital: true, display: cap === 'Washington D.C.' ? 'Washington, D.C.' : cap });
    }
  }
  for (const c of cities) {
    if (chosen.has(c.cityId)) continue;
    if (c.population >= MIN_POP || ((c.country === 'RO' || c.country === 'MD') && c.population >= MIN_POP_RO)) chosen.set(c.cityId, { rec: c, capital: false, display: c.name });
  }
  const cityList = [...chosen.values()].filter(({ rec }) => !/^Sector \d/.test(rec.name)).map(({ rec, capital, display }) => ({
    id: rec.cityId, name: display, gname: rec.name, cc: rec.country, pop: rec.population, lat: rec.loc.coordinates[1], lon: rec.loc.coordinates[0], capital,
  })).filter((c) => byCc.has(c.cc)).sort((a, b) => a.cc.localeCompare(b.cc) || b.pop - a.pop || a.id - b.id);

  // regions
  const regions = [];
  regions.push({ id: 'world', name: 'the world', kind: 'world', keys: ['world', 'earth', 'globe', 'planet'], mem: countries.filter((c) => c.ind).map((c) => c.cc), bb: [-58, -180, 80, 180] });
  for (const [id, name, bb] of CONTINENTS) regions.push({ id, name, kind: 'continent', keys: [name.toLowerCase()], mem: countries.filter((c) => c.cont === id && (c.ind || c.cc === 'GL')).map((c) => c.cc), bb });
  const contKeys = new Set(CONTINENTS.map(([id]) => id));
  const subs = [...new Set(countries.map((c) => c.sub).filter(Boolean))].sort();
  for (const s of subs) {
    const id = fold(s).replace(/[ -]+/g, '_');
    if (contKeys.has(id)) continue;
    const members = countries.filter((c) => c.sub === s && (c.ind || c.cc === 'GL')).map((c) => c.cc);
    if (!members.length) continue;
    const keys = [s.toLowerCase()];
    if (s === 'South-Eastern Asia') keys.push('southeast asia', 'south east asia');
    if (s === 'Southeast Europe') keys.push('south east europe');
    if (s === 'Eastern Asia') keys.push('east asia');
    if (s === 'Southern Asia') keys.push('south asia');
    if (s === 'Western Asia') keys.push('west asia');
    if (s === 'Middle Africa') keys.push('central africa');
    if (s === 'Northern Africa') keys.push('north africa');
    if (s === 'Western Africa') keys.push('west africa');
    if (s === 'Eastern Africa') keys.push('east africa');
    if (s === 'Northern Europe') keys.push('north europe');
    if (s === 'Western Europe') keys.push('west europe');
    if (s === 'Eastern Europe') keys.push('east europe');
    if (s === 'Southern Europe') keys.push('south europe');
    if (s === 'Central Europe') keys.push('middle europe');
    const view = SUBREGION_VIEW[s] ?? unionBox(members.map((m) => byCc.get(m).bb).filter(Boolean));
    regions.push({ id, name: s.replace(/^South-Eastern/, 'Southeast'), kind: 'subregion', keys, mem: members, bb: view });
  }
  for (const g of GROUPS) regions.push({ id: g.id, name: g.name, kind: 'group', keys: g.keys, mem: g.mem.split(' '), bb: g.bb });

  // ---- keys: country > capital city > larger city; aliases ---------------------------------------------------------
  const owner = new Map();   // key -> entity id
  const keysOf = new Map();  // entity id -> [keys]
  const claim = (id, key) => { if (!key || owner.has(key)) return false; owner.set(key, id); (keysOf.get(id) ?? keysOf.set(id, []).get(id)).push(key); return true; };
  for (const rg of regions) for (const k of rg.keys) claim(`r.${rg.id}`, keyOf(k));
  for (const c of countries) {
    claim(`g.${c.cc.toLowerCase()}`, keyOf(c.name));
    for (const a of COUNTRY_ALIASES[c.cc] ?? []) claim(`g.${c.cc.toLowerCase()}`, keyOf(a));
  }
  for (const c of countries) if (c.official && c.official !== c.name) claim(`g.${c.cc.toLowerCase()}`, keyOf(c.official));
  const cityId = (c) => `c${c.id}`;
  const sortedCities = [...cityList].sort((a, b) => (b.capital - a.capital) || b.pop - a.pop);
  const cityByGname = new Map(cityList.map((c) => [`${c.cc}:${fold(c.gname)}`, c]));
  for (const c of sortedCities) {
    claim(cityId(c), keyOf(c.name));
    if (c.gname !== c.name) claim(cityId(c), keyOf(c.gname));
  }
  for (const [alias, gn, cc] of CITY_ALIASES) {
    const c = cityByGname.get(`${cc}:${fold(gn)}`) ?? cityList.find((x) => x.cc === cc && fold(x.name) === fold(gn));
    if (c) claim(cityId(c), keyOf(alias));
  }
  for (const c of sortedCities) { // losers of a name clash: "<name> <country>"
    const own = keysOf.get(cityId(c)) ?? [];
    if (own.length && own.some((k) => owner.get(k) === cityId(c))) continue;
    claim(cityId(c), keyOf(`${c.name} ${byCc.get(c.cc).name}`));
  }

  // ---- text outputs ------------------------------------------------------------------------------------------------
  const srcC = `${SRC_COUNTRIES}; population ${SRC_POP}`;
  const kb = [];
  kb.push(`@gen.geo.map.kb core.note\n    text="Generated by scripts/build-geo-data.mjs; do not edit by hand. Sources: ${SRC_COUNTRIES}; ${SRC_POP}; ${SRC_CITIES}; outlines Natural Earth (public domain) via world-atlas 2.0.2."\n    core.source="scripts/build-geo-data.mjs"\n`);
  for (const c of countries) {
    const parts = [`@g.${c.cc.toLowerCase()} geo.map.country name=${q(c.name)}`];
    for (const k of keysOf.get(`g.${c.cc.toLowerCase()}`) ?? []) parts.push(`key=${k}`);
    parts.push(`cc=${c.cc}`);
    for (const cap of c.cap) parts.push(`capital=${q(cap)}`);
    parts.push(`cont=${c.cont}`);
    if (c.sub) parts.push(`sub=${q(c.sub)}`);
    if (c.pop) parts.push(`pop=${c.pop}`);
    if (c.area) parts.push(`area=${c.area}`);
    if (c.lat !== undefined) parts.push(`lat=${r(c.lat, 3)} lon=${r(c.lon, 3)}`);
    if (c.bb) parts.push(`bb=${q(c.bb.map((x) => r(x, 2)).join(','))}`);
    for (const n of c.nb) parts.push(`nb=${n}`);
    for (const x of c.cur) parts.push(`cur=${q(x)}`);
    for (const x of c.lang) parts.push(`lang=${q(x)}`);
    parts.push(`land=${c.land} ind=${c.ind}`);
    parts.push(`core.source=${q(srcC)}`);
    kb.push(parts.join(' '));
  }
  for (const c of cityList) {
    const parts = [`@c${c.id} geo.map.city name=${q(c.name)}`];
    for (const k of keysOf.get(cityId(c)) ?? []) parts.push(`key=${k}`);
    parts.push(`cc=${c.cc} pop=${c.pop} lat=${r(c.lat, 4)} lon=${r(c.lon, 4)}`);
    if (c.capital) parts.push('capital=true');
    parts.push(`core.source=${q(SRC_CITIES)}`);
    kb.push(parts.join(' '));
  }
  for (const rg of regions) {
    const parts = [`@r.${rg.id} geo.map.region name=${q(rg.name)}`];
    for (const k of keysOf.get(`r.${rg.id}`) ?? []) parts.push(`key=${k}`);
    parts.push(`kind=${rg.kind} members=${q(rg.mem.join(' '))}`);
    if (rg.bb) parts.push(`bb=${q(rg.bb.map((x) => r(x, 2)).join(',')) }`);
    parts.push(`core.source=${q(rg.kind === 'group' ? 'hand-written group list (as of 2024)' : rg.kind === 'world' ? 'derived from world-countries' : `derived from ${SRC_COUNTRIES}`)}`);
    kb.push(parts.join(' '));
  }
  const kbText = kb.join('\n') + '\n';

  const allKeys = [...owner.keys()].sort();
  const extra = await readFile(path.join(WORLD, 'lexicon.extra.sop'), 'utf8').catch(() => '');
  const lexLines = [];
  lexLines.push(`@gen.geo.map.lexicon core.note\n    text="Generated by scripts/build-geo-data.mjs from the geo.map knowledge base; do not edit by hand. Hand-written lexicons are appended from lexicon.extra.sop."\n`);
  lexLines.push('@lex.geo.map.places core.lexicon\n    class=noun\n    doc="Every country, capital, city, continent, region and group the language layer can recognise (lowercase ASCII, last word singular)"');
  for (let i = 0; i < allKeys.length; i += 8) lexLines.push('    ' + allKeys.slice(i, i + 8).map((k) => `word=${k}`).join(' '));
  const lexText = lexLines.join('\n') + '\n\n' + extra;

  // vendor data for the tab
  const places = {
    note: 'Compact place lists for the offline base map of the Map tab. Countries: [cc, name, lat, lon, population, area km2]. Cities: [name, lat, lon, population, capital 1|0, cc]. Sources: ' + [SRC_COUNTRIES, SRC_POP, SRC_CITIES].join('; '),
    countries: countries.filter((c) => c.lat !== undefined).map((c) => [c.cc, c.name, r(c.lat, 2), r(c.lon, 2), c.pop, c.area]),
    cities: cityList.map((c) => [c.name, r(c.lat, 3), r(c.lon, 3), c.pop, c.capital ? 1 : 0, c.cc]),
  };
  const topoText = JSON.stringify(topology);
  const nCap = cityList.filter((c) => c.capital).length;
  const readme = `# Data of the world geo.map

All files here and the knowledge base (\`kb.sop\`) and place lexicon (\`lexicon.sop\`) are generated by \`scripts/build-geo-data.mjs\` from npm packages. Do not edit them by hand.

| Data | Package (version) | Licence | Used for |
| --- | --- | --- | --- |
| Countries: names, capitals, region, borders, area, currencies, languages, landlocked | world-countries ${versions['world-countries']} (mledoze/countries) | ODbL 1.0 (attribution and share-alike for the database) | \`geo.map.country\` wires |
| Country population | country-json ${versions['country-json']} (country-by-population, about 2018 estimates) | MIT | \`pop\` of countries (Timor-Leste added by hand: World Bank 2018) |
| Cities | all-the-cities ${versions['all-the-cities']} (GeoNames gazetteer, https://www.geonames.org) | CC BY 4.0 (attribution required) | \`geo.map.city\` wires: ${nCap} capitals, every city of 500,000+ people, Romanian and Moldovan cities of 30,000+ (${cityList.length} in all) |
| Country outlines (offline base map) | world-atlas ${versions['world-atlas']} countries-50m (Natural Earth) | public domain | \`docs/webchat/vendor/map/countries-50m.json\`, bounding boxes of countries (\`bb\`) |
| Groups (EU, NATO, Nordic ...) | hand-written, as of 2024 | none | \`geo.map.region\` wires of kind \`group\` |

Every KB wire carries its source and licence in \`core.source\`. Population figures are rough and dated; city populations are GeoNames city-proper values (a few large cities are much smaller than their metro areas).

Counts: ${countries.length} countries and territories (${countries.filter((c) => c.ind).length} independent), ${cityList.length} cities, ${regions.length} regions, ${allKeys.length} lexicon names. Capitals without a GeoNames match (no city wire; the capital name is still known): ${missingCapital.join(', ') || 'none'}.

Rebuild: \`npm i world-countries@${versions['world-countries']} all-the-cities@${versions['all-the-cities']} country-json@${versions['country-json']} world-atlas@${versions['world-atlas']} topojson-client@${versions['topojson-client']}\` in a temporary directory, then \`node scripts/build-geo-data.mjs --modules <dir>/node_modules\`.
`;
  return {
    files: {
      [path.join(WORLD, 'kb.sop')]: kbText,
      [path.join(WORLD, 'lexicon.sop')]: lexText,
      [path.join(WORLD, 'data/README.md')]: readme,
      [path.join(VENDOR, 'countries-50m.json')]: topoText,
      [path.join(VENDOR, 'places.json')]: JSON.stringify(places),
    },
    stats: { countries: countries.length, cities: cityList.length, regions: regions.length, keys: allKeys.length, missingCapital, versions },
  };
}
import { readFileSync } from 'node:fs';

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
  const modules = arg('--modules') ?? process.env.GEO_MODULES;
  if (!modules) { console.error('usage: node scripts/build-geo-data.mjs --modules <dir with node_modules packages> [--check]'); process.exit(2); }
  const { files, stats } = await build({ modules });
  if (process.argv.includes('--check')) {
    let stale = 0;
    for (const [f, text] of Object.entries(files)) { const cur = await readFile(f, 'utf8').catch(() => null); if (cur !== text) { console.log(`stale: ${path.relative(REPO, f)}`); stale++; } }
    process.exit(stale ? 1 : 0);
  }
  for (const [f, text] of Object.entries(files)) { await mkdir(path.dirname(f), { recursive: true }); await writeFile(f, text); console.log(`${path.relative(REPO, f)}  ${(Buffer.byteLength(text) / 1024).toFixed(0)} KB`); }
  console.log(JSON.stringify(stats));
}
