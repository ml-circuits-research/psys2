import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine, runWorldTests } from '../src/dialog/index.mjs';

// COMMON-SENSE (spec 15 "Advice"): the facts and soft rules of common.sense, mixed into art.draw by declaration (compose=), say a short friendly warning after the
// action, once, and never refuse.
const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } });
const talk = async (lines) => {
  const s = engine.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { activeTab: 'draw' });
  const out = [];
  for (const l of lines) out.push(await s.send(l));
  return { s, out, text: out.map((r) => r.text) };
};

test('common.sense: loads without problems and its tests pass; it has no patterns and no operations', async () => {
  assert.deepEqual(engine.problems().filter((p) => String(p).includes('common.sense')), []);
  const w = engine.set.get('common.sense');
  assert.equal(w.patterns.length, 0);
  assert.equal(w.operations.length, 0);
  const r = await runWorldTests(engine, 'common.sense');
  assert.deepEqual(r.failed, []);
});

test('art.draw composes common.sense by declaration, nothing is copied', () => {
  assert.deepEqual(engine.set.get('art.draw').compose, ['common.sense']);
  assert.ok(!/livesin/.test(JSON.stringify(engine.set.get('art.draw').patterns)));
});

test('a fish in the sky: done, and one friendly warning, never a refusal', async () => {
  const { s, text, out } = await talk(['draw a fish in the sky', 'draw a red house']);
  assert.match(text[0], /I drew an orange fish in the sky\. \(Fish usually live in water, not in the sky\.\)$/);
  assert.equal(s.state('art.draw').objects.length >= 1, true);
  assert.equal(out[0].statuses.at(-1), 'supported');
  assert.doesNotMatch(text[1], /usually/);   // said once: the fish is still in the sky, the next command does not repeat it
});

test('a second sun and a car in the sky are warned about, the sun at night too', async () => {
  const a = await talk(['draw a sun', 'draw a second sun']);
  assert.match(a.text[1], /\(There is usually only one sun\.\)$/);
  assert.equal(a.s.state('art.draw').objects.filter((o) => o.kind === 'sun').length, 2);
  const b = await talk(['draw a car in the sky']);
  assert.match(b.text[0], /\(Cars are usually on roads or on the ground, not in the sky\.\)$/);
  const c = await talk(['make it night', 'draw a sun']);
  assert.match(c.text[1], /\(There is usually no sun at night\.\)$/);
});

test('where things go when nobody says: from the facts, and no warning for the default', async () => {
  const a = await talk(['draw a fish']);
  assert.match(a.text[0], /I added some water for the fish\.$/);
  assert.equal(a.s.state('art.draw').ground, 'sea');
  const b = await talk(['draw a house', 'draw a fish', 'draw another fish']);
  assert.match(b.text[1], /I made a pond for the fish\.$/);
  assert.match(b.text[2], /I put the fish in the pond\.$/);
  for (const t of b.text) assert.doesNotMatch(t, /usually/);
  const c = await talk(['draw a tree', 'draw a bird', 'draw a sun']);
  for (const t of c.text) assert.doesNotMatch(t, /usually/);
  const objs = c.s.state('art.draw').objects;
  assert.ok(objs.find((o) => o.kind === 'sun').y < 470, 'the sun is in the sky');
  assert.ok(objs.find((o) => o.kind === 'tree').y > 400, 'the tree is on the ground');
});
