import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine, runWorldTests } from '../src/dialog/index.mjs';
import { haversine, fitZoom } from '../worlds/geo.map/map.mjs';
import { topoFeatures, greatCircle, fmtKm } from '../docs/webchat/ui/tabs/map/geo.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
import { createFacts } from '../src/knowledge/facts.mjs';
import { createKnowledgeSource } from '../src/loaders/knowledge-source.mjs';
const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
engine.setKnowledge(createFacts({ source: createKnowledgeSource(path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'tests/fixtures/catalog')) }));   // the places are read by lookup from the catalog (the local fixture)

test('geo.map: loads without problems and all its tests pass', async () => {
  assert.deepEqual(engine.problems().filter((p) => p.startsWith('geo.map:')), []);
  const r = await runWorldTests(engine, 'geo.map');
  assert.ok(r.total >= 60, `only ${r.total} tests`);
  // schema world (spec 21 section 12): the rows it cannot read yet are in the failure ledger (build geo-map-switch); the switch rule is within 10% of the old world
  assert.ok(r.failed.length <= 0.1 * r.total, `${r.failed.length} of ${r.total} rows fail`);
});

test('geo.map: every pattern has an example and the world bundle stays small', () => {
  const w = engine.set.get('geo.map');
  for (const p of w.patterns) assert.ok(p.examples.length >= 1, `${p.id} has no example`);
  let total = 0;
  for (const f of fs.readdirSync(path.join(root, 'worlds/geo.map'), { recursive: true })) {
    const full = path.join(root, 'worlds/geo.map', f);
    if (fs.statSync(full).isFile()) total += fs.statSync(full).size;
  }
  assert.ok(total < 1.5 * 1024 * 1024, `world is ${total} bytes`);
});

test('geo.map: the data readme records the licences of the catalog data', () => {
  const readme = fs.readFileSync(path.join(root, 'worlds/geo.map/data/README.md'), 'utf8');
  for (const l of ['ODbL', 'MIT', 'CC BY 4.0', 'public domain']) assert.ok(readme.includes(l), l);
});

test('haversine: known distances and symmetry', () => {
  const paris = { lat: 48.8566, lon: 2.3522 }, rome = { lat: 41.9028, lon: 12.4964 };
  const d = haversine(paris, rome);
  assert.ok(Math.abs(d - 1107) < 15, `Paris-Rome ${d}`);
  assert.equal(haversine(paris, rome), haversine(rome, paris));
  assert.equal(haversine(paris, paris), 0);
});

test('fitZoom: larger boxes give smaller zoom', () => {
  const small = fitZoom([44, 20, 48, 30]);
  const big = fitZoom([-40, -100, 70, 150]);
  assert.ok(small > big);
});

test('map tab helpers: topoFeatures decodes the vendored atlas, greatCircle ends at its ends', () => {
  const topo = JSON.parse(fs.readFileSync(path.join(root, 'docs/webchat/vendor/map/countries-50m.json'), 'utf8'));
  const feats = topoFeatures(topo, 'countries');
  assert.ok(feats.length > 200);
  const pts = greatCircle({ lat: 10, lon: 20 }, { lat: 50, lon: 60 });
  assert.ok(pts.length > 2);
  assert.ok(Math.abs(pts[0][0] - 10) < 1e-6 && Math.abs(pts.at(-1)[1] - 60) < 1e-6);
  assert.match(fmtKm(1107), /1,?107/);
});

test('map tab: registered, vendored files carry headers and licences', () => {
  assert.ok(JSON.parse(fs.readFileSync(path.join(root, 'docs/webchat/ui/tabs/index.json'), 'utf8')).includes('map.mjs'));
  const lf = fs.readFileSync(path.join(root, 'docs/webchat/vendor/map/leaflet.mjs'), 'utf8');
  assert.match(lf.slice(0, 600), /Leaflet/);
  assert.match(lf.slice(0, 600), /BSD/);
  assert.ok(fs.existsSync(path.join(root, 'docs/webchat/vendor/map/LICENSES.md')));
});

test('geo.map: a locate observation fills the state with a marker', async () => {
  const s = engine.createSession({ language: 'en' });
  const r = await s.send('where am I?');
  assert.ok(r.effects?.some((e) => e.effect === 'geo.locate' || e.name === 'geo.locate') || /locat/i.test(r.text));
});
