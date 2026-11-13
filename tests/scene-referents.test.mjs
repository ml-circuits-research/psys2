// SPDX-License-Identifier: AGPL-3.0-only
// SCENE-NATURAL P3: an unknown noun is matched to the things of the scene first (stem, edit distance up to 2 with a swap of neighbours as one edit),
// before any dictionary repair; the assumption is told; ties and distant words are left alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { stemsOf, slipDistance, sceneNouns, repairFromScene } from '../src/dialog/scene-referents.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const session = async (tab, setup = []) => {
  const s = engine.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { activeTab: tab });
  for (const m of setup) await s.send(m);
  return s;
};

test('stem and slip distance: plural endings of English and Romanian go, a swap of neighbours is one edit', () => {
  assert.ok(stemsOf('houses').includes('hous') && stemsOf('houses').includes('house'));
  assert.ok(stemsOf('corcodilii').includes('corcodil'));
  assert.ok(stemsOf('crocodile').includes('crocodil'));
  assert.equal(slipDistance('corcodil', 'crocodil'), 1);
  assert.equal(slipDistance('huose', 'house'), 1);
  assert.ok(slipDistance('banana', 'house', 2) > 2);
});

test('the scene nouns come from the state of the worlds, the open tab first', async () => {
  const s = await session('draw', ['draw a house and a tree']);
  const n = sceneNouns(s);
  assert.ok(n.has('house') && n.has('tree'));
});

test('repairFromScene: a slip in a noun of the scene becomes that noun, the plural stays a plural, known and distant words are left alone', async () => {
  const s = await session('draw', ['draw a house and a tree']);
  const a = repairFromScene(s, 'move the huoses up');
  assert.equal(a.text, 'move the houses up');
  assert.deepEqual(a.corrections.map((c) => [c.from, c.to, c.kind]), [['huoses', 'houses', 'scene']]);
  assert.equal(repairFromScene(s, 'move the tre up'), null, 'a three-letter word is too short to guess');
  assert.equal(repairFromScene(s, 'move the house up'), null);
  assert.equal(repairFromScene(s, 'move the zebra up'), null);
});

test('the whole path: a slipped noun acts on the thing of the scene and says what was assumed', async () => {
  const s = await session('draw', ['draw a house and a tree']);
  const r = await s.send('make the huoses red');
  assert.match(r.text, /I read "huoses" as "houses"/i);
  assert.equal(s.state()['art.draw'].objects.find((o) => o.kind === 'house').color, 'red');
});
