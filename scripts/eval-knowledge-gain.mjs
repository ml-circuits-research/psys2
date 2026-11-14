#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// KNOWLEDGE-OUT step 6: the generated set of 200 requests about things the old tables did not have (colours beyond the ones the worlds listed, number words), in draw, Talk, charts, map and the
// document, run in a fresh session each against a catalog. Run on the tree before and after a move and compare the counts per domain.
//   node scripts/eval-knowledge-gain.mjs --catalog <docs/worlds folder> [--json] [--reasoner ops|matrix] [--set colours|more|all] [--truth <docs/worlds folder>]
// Set `more` (KNOWLEDGE-OUT step 6, second part): things the old kb files did not have: animals beyond the 68 of kids.animals (legs, sound), places beyond the cities of geo.map (where is X: the country the catalog
// names), the countries and territories its kb lacks (the capital), and the calendar (days of a month, what comes after). The expected value of each item is read from the catalog given as `--truth`
// (default: `--catalog`), so a run WITHOUT `--catalog` (the tab worlds alone, as before) is scored against the same truth.
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';
import { createKnowledgeSource } from '../src/loaders/knowledge-source.mjs';
import { applyReasonerFlag } from './lib/reasoner-flag.mjs';
applyReasonerFlag();
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const catalog = arg('catalog', null);

// colours the old worlds did not list (none of the lists of art.draw, data.charts, docs.editor, talk had them): single words of the catalog, in the order of the catalog
const NEW_COLOURS = ['crimson', 'azure', 'khaki', 'orchid', 'sienna', 'tomato', 'plum', 'salmon', 'wheat', 'ivory', 'linen', 'thistle', 'goldenrod', 'chartreuse', 'fuchsia', 'amber', 'ruby', 'mustard', 'burgundy', 'apricot',
  'lavender', 'olive', 'chocolate', 'cherry', 'bisque', 'seashell', 'snow', 'peru', 'tan', 'mint', 'teal', 'aqua', 'cyan', 'indigo', 'violet', 'maroon', 'beige', 'cream', 'lilac', 'scarlet', 'rose', 'coral', 'lime', 'navy', 'charcoal', 'copper', 'bronze', 'jade', 'rust', 'sand'];
const THINGS = ['house', 'tree', 'sun', 'cat', 'car'];
const NUMS = ['three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const truth = arg('truth', catalog), set = arg('set', 'all');
const items = [];
NEW_COLOURS.forEach((c, i) => items.push({ domain: 'draw colour', tab: 'draw', say: [`draw a ${c} ${THINGS[i % 5]}`], check: (s) => s.state()['art.draw'].objects.some((o) => o.color === c || String(o.color).endsWith(c)) }));
NUMS.concat(NUMS.slice(0, 10)).forEach((n, i) => items.push({ domain: 'draw number', tab: 'draw', say: [`draw ${n} ${['fish', 'stars', 'balloons', 'birds'][i % 4]}`], check: (s) => s.state()['art.draw'].objects.length === (NUMS.indexOf(n) + 3) }));
NEW_COLOURS.forEach((c) => items.push({ domain: 'talk colour', tab: 'talk', say: ['What does a bicycle look like?', `Make it ${c}.`], check: (s) => s.state()['talk'].cards.some((k) => k.data?.tint === c) }));
NEW_COLOURS.slice(0, 40).forEach((c) => items.push({ domain: 'charts colour', tab: 'charts', say: ['Make a bar chart of apples 3, pears 5, plums 2', `Make the bars ${c}`], check: (s) => { const ch = s.state()['data.charts']?.charts?.[0]; return !!ch && /^#[0-9a-f]{6}$/i.test(String(ch.datasets?.[0]?.color)); } }));
NUMS.concat(NUMS.slice(0, 10)).forEach((n, i) => items.push({ domain: 'map number', tab: 'map', say: [`Mark the ${n} largest cities in ${['Japan', 'Romania', 'France', 'Spain'][i % 4]}.`], check: (s) => (s.state()['geo.map']?.highlighted?.length ?? 0) === NUMS.indexOf(n) + 3 }));
NEW_COLOURS.slice(0, 20).forEach((c) => items.push({ domain: 'document colour', tab: 'editor', say: ['Write a report about sea animals', `Highlight the first sentence in ${c}.`], check: (s) => JSON.stringify(s.state()['docs.editor'] ?? {}).includes('"highlight"') }));

if (truth && set !== 'colours') {
  const { readFileSync, readdirSync } = await import('node:fs');
  const { parseFact } = await import('../src/knowledge/facts.mjs');
  const rd = (dir) => readdirSync(dir).flatMap((f) => readFileSync(`${dir}/${f}`, 'utf8').split('\n').map(parseFact).filter(Boolean));
  const lc = (x) => String(x ?? '').toLowerCase();
  const own = (w) => readFileSync(new URL(`../worlds/${w}/kb.sop`, import.meta.url), 'utf8').split('\n').map(parseFact).filter(Boolean);
  const animalsOld = new Set(JSON.parse(readFileSync(new URL('../training/eval/kb-animals-old.json', import.meta.url), 'utf8')).names);   // the animals of the deleted kb.sop of kids.animals (frozen)
  const animals = rd(`${truth}/k.animals/shards`).filter((r) => r.type === 'k.animals.animal' && !animalsOld.has(lc(r.f.name?.[0])) && /^[a-z]+$/.test(r.f.name?.[0] ?? ''));
  const legged = animals.filter((r) => r.f.legs?.length), sounding = animals.filter((r) => r.f.sound?.length);
  legged.slice(0, 50).forEach((r) => items.push({ domain: 'animal legs', tab: 'talk', say: [`How many legs does a ${r.f.name[0]} have?`], check: (_s, t) => new RegExp(`\\b${r.f.legs[0]}\\b`).test(t) && !/not how many/.test(t) }));
  sounding.slice(0, 30).forEach((r) => items.push({ domain: 'animal sound', tab: 'talk', say: [`What sound does a ${r.f.name[0]} make?`], check: (_s, t) => lc(t).includes(lc(r.f.sound[0])) }));
  const geoOld = own('geo.map'), cityOld = new Set(geoOld.filter((r) => r.type === 'geo.map.city').map((r) => lc(r.f.name?.[0]))), countryOld = new Set(geoOld.filter((r) => r.type === 'geo.map.country').flatMap((r) => [lc(r.f.name?.[0])]));
  const geo = rd(`${truth}/k.geo/shards`);
  const cities = geo.filter((r) => r.type === 'k.geo.city' && r.f.country?.[0] && /^[A-Za-z][A-Za-z ]+$/.test(r.f.name?.[0] ?? '') && !cityOld.has(lc(r.f.name[0])));
  cities.slice(0, 40).forEach((r) => items.push({ domain: 'place where', tab: 'map', say: [`Where is ${r.f.name[0]}?`], check: (_s, t) => lc(t).includes(lc(r.f.country[0])) }));
  const capitals = geo.filter((r) => r.type === 'k.geo.country' && r.f.capital?.[0] && /^[A-Za-z][A-Za-z ]+$/.test(r.f.name?.[0] ?? '') && !countryOld.has(lc(r.f.name[0])));
  capitals.slice(0, 20).forEach((r) => items.push({ domain: 'place capital', tab: 'talk', say: [`What is the capital of ${r.f.name[0]}?`], check: (_s, t) => lc(t).includes(lc(r.f.capital[0])) }));
  const MONTHS = [['January', 31], ['March', 31], ['April', 30], ['June', 30], ['July', 31], ['September', 30], ['October', 31], ['November', 30], ['December', 31]];
  MONTHS.forEach(([m, d]) => items.push({ domain: 'time facts', tab: 'talk', say: [`How many days are in ${m}?`], check: (_s, t) => new RegExp(`\\b${d}\\b`).test(t) }));
  [['Tuesday', 'Wednesday'], ['Friday', 'Saturday'], ['March', 'April'], ['August', 'September'], ['Sunday', 'Monday'], ['December', 'January']].forEach(([a, b]) => items.push({ domain: 'time facts', tab: 'talk', say: [`What comes after ${a}?`], check: (_s, t) => lc(t).includes(lc(b)) }));
}
if (set === 'more') items.splice(0, items.findIndex((i) => i.domain === 'animal legs'));
const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: arg('reasoner', 'matrix') } });
const tabOf = { draw: 'draw', talk: 'talk', charts: 'charts', map: 'map', editor: 'editor' };
const per = {};
const rows = [];
if (catalog) engine.setKnowledge(createFacts({ source: createKnowledgeSource(catalog) }));   // one reader for the run (a new one per item kept every item's vocabulary in memory: out of memory on the real catalog)
for (const it of items) {
  const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
  s.setWorldState('ui.shell', { activeTab: tabOf[it.tab] });
  let ok = false, last = '';
  try { for (const t of it.say) last = (await s.send(t)).text; ok = !!it.check(s, last); } catch (e) { last = `ERROR ${e.message}`; }
  (per[it.domain] ??= { ok: 0, n: 0 }).n++; if (ok) per[it.domain].ok++;
  rows.push({ domain: it.domain, say: it.say.at(-1), ok, reply: String(last).slice(0, 120) });
}
const total = Object.values(per).reduce((a, x) => ({ ok: a.ok + x.ok, n: a.n + x.n }), { ok: 0, n: 0 });
if (process.argv.includes('--json')) console.log(JSON.stringify({ per, total, rows }, null, 1));
else { for (const [d, x] of Object.entries(per)) console.log(`${d.padEnd(18)} ${x.ok}/${x.n}`); console.log(`${'total'.padEnd(18)} ${total.ok}/${total.n}`); }
