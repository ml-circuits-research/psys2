// SPDX-License-Identifier: AGPL-3.0-only
// The typed reading step (spec 16 section 9): a refused reading is read again by the types of its words; the world decides; all or nothing.
// Proved on the schema fixture test.seating (tests/fixtures/worlds; the real plan.seating and plan.timeline worlds were removed with their tabs, ADR-012).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';

process.env.PSYS2_TYPED = 'on';   // a named diagnostic switch, off by default since P6 (spec 16 section 15): this file tests the step switched on
const FIX = fileURLToPath(new URL('./fixtures/worlds', import.meta.url));
const IDS = ['core', 'lang.common', 'kids.common', 'ui.help', 'acts', 'test.seating'];
const loader = createFsLoader({ roots: [DEFAULT_ROOT, FIX] });
const list = loader.listWorlds.bind(loader);
loader.listWorlds = async () => (await list()).filter((id) => IDS.includes(id));
const engine = await createEngine({ loader, options: { reasoner: 'matrix' } });
const session = () => engine.createSession({ language: 'en' });

test('a numbered thing before the value: "Change the colour of table 1 to apricot." sets the colour (the value was read as "1 to apricot")', async () => {
  const s = session();
  await s.send('Add a table.');
  const r = await s.send('Change the colour of table 1 to apricot.');
  assert.match(r.text, /I made table 1 apricot/);
  assert.equal(r.segments[0].typed?.to.value, 'apricot');
  assert.equal(r.segments[0].typed?.from.value, '1 to apricot');
  assert.match((await s.send('Change the colour of table 1 to red.')).text, /table 1 red/);
});

test("all or nothing: a value the world does not take stays refused, the reading is the rules' and the state is unchanged", async () => {
  const s = session();
  await s.send('Add a table.');
  const before = JSON.stringify(s.state('test.seating').items);
  const r = await s.send('Change the colour of table 1 to banana.');
  assert.match(r.text, /is not a colour I know/);
  assert.equal(r.segments[0].typed, undefined);
  assert.equal(JSON.stringify(s.state('test.seating').items), before);
});

test('a reading the world accepts is never touched', async () => {
  const s = session();
  await s.send('Add a table.');
  const r = await s.send('Change the colour of the table to blue.');
  assert.match(r.text, /I made table 1 blue/);
  assert.equal(r.segments[0].typed, undefined);
});
