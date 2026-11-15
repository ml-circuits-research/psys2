// SPDX-License-Identifier: AGPL-3.0-only
// Spec 28 section 14: the Drawing runs on the declared binding (sopworld 0.152.1 std.tool): properties through Session.send, no world code in the door.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const drawing = () => { const s = engine.createSession({ language: 'en' }); s.setWorldState('ui.shell', { activeTab: 'draw' }); return s; };
const kinds = (s) => { const k = {}; for (const o of s.state()['art.draw']?.objects ?? []) k[o.kind] = (k[o.kind] ?? 0) + 1; return k; };

test('one request is one undo step: after a make of n things and one undo, the view holds none of them', async () => {
  for (const [said, kind, n] of [['draw three cats', 'cat', 3], ['draw 2 dogs', 'dog', 2], ['draw two dogs and a tree', 'dog', 2]]) {
    const s = drawing();
    await s.send('draw a house');
    const r = await s.send(said);
    assert.equal(kinds(s)[kind], n, `${said}: ${r.text}`);
    await s.send('undo');
    assert.deepEqual(kinds(s), { house: 1 }, said);
  }
});

test('every count said stays with the kind it stands before (coordinated kinds, the library plans them)', async () => {
  const s = drawing();
  const r = await s.send('draw two dogs and a tree');
  assert.deepEqual(kinds(s), { dog: 2, tree: 1 }, r.text);
  assert.equal(r.trace.door, 'bound make');
});

test('praise runs no plan; "fewer" revises the last result through the binding; the reply is the view diff', async () => {
  const s = drawing();
  await s.send('draw two dogs and a tree');
  const before = JSON.stringify(s.state()['art.draw'].objects);
  const nice = await s.send('nice');
  assert.equal(JSON.stringify(s.state()['art.draw'].objects), before, nice.text);
  const fewer = await s.send('fewer dogs');
  assert.equal(kinds(s).dog, 1, fewer.text);
  assert.equal(kinds(s).tree, 1, fewer.text);
  assert.match(fewer.text, /^I made it again, the way you said\./);   // the diff of a re-laid result names every thing moved or redone (questions.md Q45 (8))
});

test('questions about the state and about what the world can do are facts of the live world (askWorld), no step', async () => {
  const s = drawing();
  await s.send('draw two dogs and a tree');
  const before = JSON.stringify(s.state()['art.draw']);
  const what = await s.send('what is in the picture?');
  assert.match(what.text, /2 dogs/);
  assert.match(what.text, /one tree/);
  const can = await s.send('what can you do here?');
  assert.match(can.text, /^I can make: /);
  assert.equal(JSON.stringify(s.state()['art.draw']), before);
});

test('values the tool does not take are translated by knowledge, defaults are expectations (k.expect.value)', async () => {
  const s = drawing();
  const r = await s.send('draw a tiny red cat');
  assert.match(r.text, /small for the size/);
  assert.match(r.text, /corner for the place/);
  assert.equal(s.state()['art.draw'].objects[0].color, 'red');
});
