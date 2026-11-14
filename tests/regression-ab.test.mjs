// SPDX-License-Identifier: AGPL-3.0-only
// REGRESSION-AB (spec 15, "The session timeline: late replies"): in matrix mode the engine's late reply ("Meanwhile I play knight to c6.") is no step of the
// user's next turn, so "undo" takes back exactly what the world's own undo takes back, and "What did you do?" names the undo. (The three chess dialogues of the A/B went with the
// chess world, tab cut 2026-11-15; what is left is the state cache.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';

const engineWith = (reasoner) => createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner } });
const engines = { ops: await engineWith('ops'), matrix: await engineWith('matrix') };
// Q2 item 6: `toState` is cached per instance stamp; a reader gets a copy, so changing it changes nothing, and a change of the instance is seen at once.
test('toState is computed once per instance state and handed out as a copy', async () => {
  const s = engines.matrix.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
  await s.send('I have 20 lei', {});
  const rs = s.isession.rs;
  const a = rs.stateOfWorld('kids.shop');
  const hits = rs.stateHits;
  const b = rs.stateOfWorld('kids.shop');
  assert.equal(rs.stateHits, hits + 1, 'the second reading came from the cache');
  assert.deepEqual(a, b);
  assert.notEqual(a, b);
  b.money = 999;
  assert.deepEqual(rs.stateOfWorld('kids.shop'), a, 'a reader that changed its copy did not change the cache');
  const shell1 = rs.stateOfWorld('ui.shell'), shell2 = rs.stateOfWorld('ui.shell');
  assert.ok(Object.keys(shell1._titles ?? {}).length > 0 && Object.keys(shell2._titles ?? {}).length > 0, 'the hidden property of the state (ui.shell _titles) survives the copy');
  await s.send('I buy a ball', {});
  assert.notDeepEqual(rs.stateOfWorld('kids.shop'), a, 'a change of the instance is a new stamp');
});

