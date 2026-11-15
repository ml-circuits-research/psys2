// SPDX-License-Identifier: AGPL-3.0-only
// Class E (reviewer 2026-11-15 10:00 items 2, 4, 5): the intent step after a weak reading (spec 03 section 7.9f, src/dialog/intent.mjs) and the world acts it reaches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { splitClauses, weakReading } from '../src/dialog/intent.mjs';

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const on = (tab) => { const s = engine.createSession({ language: 'en' }); s.setWorldState('ui.shell', { activeTab: tab }); return s; };
const count = (s, kind) => (s.state()['art.draw'].objects ?? []).filter((o) => (o.thing ?? o.kind) === kind).length;

test('clauses keep what is between them; a weak reading is an unread clause, a refusal or "Nothing changed."', () => {
  assert.deepEqual(splitClauses('wrong, move it up').map((c) => c.text), ['wrong', 'move it up']);
  assert.equal(weakReading({ statuses: ['supported'], trace: { replyEnglish: 'Moved it up.' } }), false);
  assert.equal(weakReading({ statuses: ['supported'], trace: { replyEnglish: 'Nothing changed.' } }), true);
  assert.equal(weakReading({ statuses: ['unparsed'], trace: { replyEnglish: '' } }), true);
});

test('a complaint that there is too much removes about half of the biggest group and says what it assumed', async () => {
  const s = on('draw');
  await s.send('draw five flowers');
  assert.equal(count(s, 'flower'), 5);
  const r = await s.send('there are too many');
  assert.equal(count(s, 'flower'), 3, r.text);
  assert.match(r.text, /^I took that as: remove the fourth flower and the fifth flower\./);
});

test('talk about the assistant gets a calm reply with what the open tab can do, and nothing changes', async () => {
  const s = on('draw');
  await s.send('draw a house');
  const before = JSON.stringify(s.state()['art.draw'].objects);
  const r = await s.send('are you stupid?');
  assert.match(r.text, /^Sorry, I did not get some of what you said\. On the Drawing tab I can, for example: /);
  assert.equal(JSON.stringify(s.state()['art.draw'].objects), before);
});

test('a story with a verb the reader does not know is written by the documents world', async () => {
  const s = on('editor');
  const r = await s.send('make a story about a lake');
  assert.match(r.text, /^I took that as: write a story about a lake\./);
  assert.ok((s.state()['docs.editor'].stats?.words ?? 0) >= 20, r.text);
});

test('a leading "wrong" is not a request of its own and a third-person verb is the imperative', async () => {
  const s = on('diagram');
  await s.send('draw a circle called alpha');
  const y0 = s.state()['diagram.sketch'].shapes.find((x) => x.name === 'alpha').y;
  await s.send('wrong, he moves alpha down');
  assert.ok(s.state()['diagram.sketch'].shapes.find((x) => x.name === 'alpha').y > y0);
});

test('arrange as an outline of the catalog, with a shape in the middle (diagram.sketch)', async () => {
  const s = on('diagram');
  await s.send('draw a circle called hub');
  await s.send('draw a square called alpha, a square called beta, a square called gamma, a square called delta, a square called epsilon and a square called zeta');
  const r = await s.send('arrange the shapes as a hexagon with hub in the middle');
  assert.match(r.text, /on the outline of a hexagon.*and hub in the middle/, r.text);
  const hub = s.state()['diagram.sketch'].shapes.find((x) => x.name === 'hub');
  assert.deepEqual([hub.x, hub.y], [400, 250]);
});

test('art.draw removes the things named one by one; a bare count of fewer than there are is asked, never all of them taken', async () => {
  const s = on('draw');
  await s.send('draw three cats');
  await s.send('remove the second cat and the third cat');
  assert.equal(count(s, 'cat'), 1);
  await s.send('draw three dogs');
  const r = await s.send('remove two dogs');
  assert.equal(count(s, 'dog'), 3, r.text);
  assert.match(r.text, /Which 2/, r.text);
});
