#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// geo.map tests: the expected VALUES come from the catalog, not from a table (reviewer 2026-11-14 03:10, group 1). `tests.template.sop` holds the rows with `{{fn:arg,arg}}` placeholders where a row
// states a fact of k.geo (a population, an area, the neighbours of a country, the capitals of a continent, a distance between two cities); this script reads those facts from the catalog
// (the local fixture by default, `--catalog <dir>` for the knowledge checkout) and writes `tests.sop`. The rows then measure the reading of the sentence, not the numbers of an older table.
//   node scripts/derive-geo-map-tests.mjs [--world worlds/geo.map] [--catalog <dir>] [--check]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : d; };
const WORLD = path.resolve(REPO, arg('world', 'worlds/geo.map'));
const CAT = path.resolve(REPO, arg('catalog', 'tests/fixtures/catalog'));
const { createFacts } = await import('../src/knowledge/facts.mjs');
const { createKnowledgeSource } = await import('../src/loaders/knowledge-source.mjs');
const { buildIndex, lookup, NEEDS } = await import(path.join(WORLD, 'places.mjs'));
const facts = createFacts({ source: createKnowledgeSource(CAT) });
for (const n of NEEDS) { const [t, w] = n.slice(6).split('@'); await facts.wires(t, w ? { world: w } : {}); }
const D = buildIndex(facts);

// ---- display conventions of the map's replies (the test states the format, the catalog the value) ----
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const r1 = (x) => Number(Number(x).toFixed(1));
const human = (n) => (n >= 1e9 ? `${r1(n / 1e9)} billion` : n >= 1e6 ? `${r1(n / 1e6)} million` : n >= 1e4 ? fmt(Math.round(n / 1000) * 1000) : fmt(n));
const deg = (v, pos, neg) => `${Math.abs(v).toFixed(2)} ${v >= 0 ? pos : neg}`;
const list = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const R = 6371.0088, rad = Math.PI / 180;
const km = (a, b) => { const h = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); };

const P = (name) => { const e = lookup(D, name); if (!e) throw new Error(`the catalog has no place "${name}"`); return e; };
const country = (e) => D.byCc.get(e.cc);
const members = (name) => { const e = P(name); return (e.kind === 'region' ? e.members : [e.cc]).map((cc) => D.byCc.get(cc)).filter(Boolean); };
const byName = (a, b) => a.name.localeCompare(b.name);
const caps = (c) => D.capitalOf.get(c.cc) ?? [];

const FN = {
  pop: (x) => human(P(x).pop),                                   // 35.7 million
  popTrunc: (x) => human(P(x).pop).replace(/ .*/, ''),
  lat: (x) => deg(P(x).lat, 'N', 'S'),                             // 48.87 N
  lon: (x) => deg(P(x).lon, 'E', 'W'),
  rlat: (x) => String(Number(P(x).lat.toFixed(4))),               // a number the state keeps
  rlon: (x) => String(Number(P(x).lon.toFixed(4))),
  area: (x) => fmt(P(x).area),                                    // 551,695
  name: (x) => P(x).name,
  cc: (x) => P(x).cc,
  of: (x) => country(P(x)).name,                                  // the country of a city
  role: (x) => { const e = P(x); return `${e.isCapital ? 'capital' : 'city'} of ${country(e).name}`; },
  isa: (x) => { const e = P(x); return `${e.isCapital ? 'the capital of' : 'a city in'} ${country(e).name}`; },
  nb: (x) => String(P(x).nb.length),
  nbFirst: (x, n = 1) => P(x).nb.map((cc) => D.byCc.get(cc).name).sort().slice(0, Number(n)).join(', '),
  nbList: (x) => list(P(x).nb.map((cc) => D.byCc.get(cc).name).sort()),
  nCountries: (x) => String(members(x).filter((c) => c.ind).length),
  firstCountry: (x) => members(x).filter((c) => c.ind).sort(byName)[0].name,
  nCapitals: (x) => String(new Set(members(x).flatMap((c) => caps(c).map((t) => t.id))).size),
  nCapitalsOf: (x) => String(caps(P(x)).length),
  capitalsOf: (x) => list(caps(P(x)).map((t) => t.name).sort()),
  capSentence: (x) => { const c = P(x), t = caps(c).map((e) => e.name).sort(); return t.length === 1 ? `The capital of ${c.name} is ${t[0]}` : `${c.name} has ${t.length} capitals`; },
  popMore: (a, b) => human(Math.max(P(a).pop, P(b).pop)),
  nbPlus: (x) => String(P(x).nb.length + 1),
  sub: (x) => P(x).sub,
  nearest: (la, lo) => D.cities.map((c) => [km(c, { lat: Number(la), lon: Number(lo) }), c]).sort((a, b) => a[0] - b[0])[0][1].name,
  more: (a, b) => (P(a).pop >= P(b).pop ? P(a) : P(b)).name,
  less: (a, b) => (P(a).pop >= P(b).pop ? P(b) : P(a)).name,
  km: (a, b) => fmt(km(P(a), P(b))),
  mi: (a, b) => fmt(km(P(a), P(b)) / 1.609344),
  smallest: (x) => members(x).filter((c) => c.area !== null).sort((a, b) => a.area - b.area)[0].name,
  smallestCc: (x) => members(x).filter((c) => c.area !== null).sort((a, b) => a.area - b.area)[0].cc,
  largest: (x, n = 1) => members(x).filter((c) => c.area !== null).sort((a, b) => b.area - a.area)[Number(n) - 1].name,
  nBigCities: (x, min = 30000) => String((D.citiesOf.get(P(x).cc) ?? []).filter((c) => c.pop >= Number(min)).length),
  biggestCity: (x, n = 1) => (D.citiesOf.get(P(x).cc) ?? [])[Number(n) - 1].name,
  cityPop: (x, n = 1) => human((D.citiesOf.get(P(x).cc) ?? [])[Number(n) - 1].pop),
  continent: (x) => P(x).cont.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()),
  currency: (x) => P(x).cur[0],
  language: (x) => P(x).lang[0],
  yesLand: (x) => (P(x).land ? 'Yes' : 'No'),
};

const src = fs.readFileSync(path.join(WORLD, 'tests.template.sop'), 'utf8');
const out = src.replace(/\{\{(\w+)(?::([^}]*))?\}\}/g, (m, fn, args) => { if (!FN[fn]) throw new Error(`unknown placeholder ${m}`); return FN[fn](...(args ? args.split('|') : [])); });
const header = '# GENERATED by scripts/derive-geo-map-tests.mjs from tests.template.sop and the catalog (k.geo): the expected values are facts of the catalog, not a table of the world. Edit the template.\n';
if (process.argv.includes('--check')) { const cur = fs.readFileSync(path.join(WORLD, 'tests.sop'), 'utf8'); if (cur !== header + out) { console.error('tests.sop is stale: run scripts/derive-geo-map-tests.mjs'); process.exit(1); } console.log('tests.sop is current'); }
else { fs.writeFileSync(path.join(WORLD, 'tests.sop'), header + out); console.log(`wrote ${path.join(WORLD, 'tests.sop')} (${(out.match(/\{\{/g) ?? []).length} placeholders expanded in the template: ${(src.match(/\{\{/g) ?? []).length})`); }
