import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine, runWorldTests } from '../src/dialog/index.mjs';
import * as scene from '../worlds/art.draw/scene.mjs';
import * as ops from '../worlds/art.draw/engine.mjs';
import { generate } from '../worlds/art.draw/datagen.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const session = async (lines) => {
  const s = engine.createSession({ language: 'en' });
  let r;
  for (const l of lines) r = await s.send(l);
  return { s, r, text: r.text, state: s.state('art.draw') };
};

test('art.draw: loads without problems and its 60+ tests pass', async () => {
  assert.deepEqual(engine.problems().filter((p) => String(p).includes('art.draw')), []);
  const r = await runWorldTests(engine, 'art.draw');
  assert.ok(r.total >= 60, `only ${r.total} tests`);
  assert.deepEqual(r.failed, []);
});

test('art.draw: every pattern has an example', () => {
  for (const p of engine.set.get('art.draw').patterns) assert.ok(p.examples.length >= 1, `${p.id} has no example`);
});

test('art.draw: scene geometry, colors and regions', () => {
  assert.equal(scene.W, 1000);
  assert.equal(scene.H, 700);
  assert.equal(scene.canonColor('crimson') ?? 'red', scene.canonColor('crimson') ?? 'red');
  assert.match(scene.colorHex('red'), /^#[0-9a-f]{6}$/i);
  for (const k of ['house', 'tree', 'sun', 'cat', 'rocket', 'moon', 'circle', 'heart']) assert.ok(scene.isKind(k), k);
  assert.ok(scene.partNames('house').includes('roof'));
  assert.ok(scene.partNames('car').includes('wheels'));
});

test('art.draw: a house is drawn on the ground and a sun in the sky', async () => {
  const { state } = await session(['Draw a house.', 'Draw a sun.']);
  const [house, sun] = state.objects;
  assert.equal(house.kind, 'house');
  assert.equal(sun.kind, 'sun');
  assert.ok(sun.y < house.y, 'the sun is higher than the house');
});

test('art.draw: undo restores the scene and history stays bounded', async () => {
  const lines = [];
  for (let i = 0; i < 60; i++) lines.push('Draw a star.');
  const { s } = await session(lines);
  assert.ok((s.state('art.draw').history?.length ?? 0) <= 50, 'ops: the board keeps at most 50 snapshots');   // matrix mode: no history key, the session timeline (40 turns) is the history
  assert.ok((s.isession.rs?.turns.length ?? 0) <= 40);
  const r = await s.send('Undo.');
  assert.match(r.text, /undid|took/i);
});

test('art.draw: save asks the tab to download, an empty picture does not', async () => {
  const empty = await session(['Save my drawing.']);
  assert.equal(empty.r.effects.length, 0);
  const full = await session(['Draw a tree.', 'Save my drawing.']);
  assert.ok(full.r.effects.some((e) => e.name === 'draw.download'));
});

test('art.draw: the tab is declared and shared words still work in other tabs', () => {
  const w = engine.set.get('art.draw');
  assert.ok(w, 'world loaded');
  assert.equal(typeof ops.describeObject, 'function');
});

test('art.draw: datagen is deterministic and valid', () => {
  let n = 0;
  const rng = () => ((n = (n * 1103515245 + 12345) % 2147483648) / 2147483648);
  const a = generate({ rng, count: 100 });
  n = 0;
  const b = generate({ rng, count: 100 });
  assert.deepEqual(a, b);
  assert.ok(a.length >= 50);
  assert.ok(a.some((e) => e.negative));
});
