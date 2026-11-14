// SPDX-License-Identifier: AGPL-3.0-only
// The typed reading step (spec 16 section 9): a refused reading is read again by the types of its words; the world decides; all or nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } });
const session = (tab) => { const s = engine.createSession({ language: 'en' }); s.setWorldState('ui.shell', { activeTab: tab }); return s; };

test('a numbered thing before the value: "Change the unit of timeline 1 to day." sets the unit (the value was read as "1 to day")', async () => {
  const s = session('timeline');
  await s.send('Add a timeline.');
  const r = await s.send('Change the unit of timeline 1 to day.');
  assert.match(r.text, /I set the unit of timeline 1 to day/);
  assert.equal(r.segments[0].typed?.to.value, 'day');
  assert.equal(r.segments[0].typed?.from.value, '1 to day');
});

test('the colour of a numbered table: the values are the colours the readers take', async () => {
  const s = session('seating');
  await s.send('Add a table.');
  assert.match((await s.send('Change the colour of table 1 to apricot.')).text, /table 1 apricot/);
  assert.match((await s.send('Change the colour of table 1 to red.')).text, /table 1 red/);
});

test("all or nothing: a value the world does not take stays refused, the reading is the rules' and the state is unchanged", async () => {
  const s = session('timeline');
  await s.send('Add a timeline.');
  const before = JSON.stringify(s.state('plan.timeline'));
  const r = await s.send('Change the unit of timeline 1 to banana.');
  assert.match(r.text, /is not a unit I know/);
  assert.equal(r.segments[0].typed, undefined);
  assert.equal(JSON.stringify(s.state('plan.timeline')), before);
});

test('a reading the world accepts is never touched', async () => {
  const s = session('timeline');
  await s.send('Add a timeline.');
  const r = await s.send('Change the unit of the timeline to day.');
  assert.equal(r.segments[0].typed, undefined);
});
