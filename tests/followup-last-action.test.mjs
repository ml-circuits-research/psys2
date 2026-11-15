// SPDX-License-Identifier: AGPL-3.0-only
// SCENE-NATURAL P2 and P4: follow-ups change the last action (the things it touched, found by the dialogue layer from the state before and after), and places
// (lake, road, field, patch, hill) are objects. Other words than the owner's; both reasoners.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { touched, touchedCount } from '../src/dialog/followup.mjs';

test('touched: the things an action made, changed and removed come from its state before and after, in any world with a list of things that have ids', () => {
  const act = { worlds: ['w'], before: { w: JSON.stringify({ items: [{ id: 'a', x: 1 }, { id: 'b', x: 2 }, { id: 'c', x: 3 }], n: 1 }) }, after: { w: JSON.stringify({ items: [{ id: 'a', x: 1 }, { id: 'b', x: 9 }, { id: 'd', x: 4 }], n: 2 }) } };
  const t = touched(act);
  assert.deepEqual(t.added.map((x) => x.id), ['d']);
  assert.deepEqual(t.changed.map((x) => x.id), ['b']);
  assert.deepEqual(t.removed.map((x) => x.id), ['c']);
  assert.equal(touchedCount(act), 2);
  assert.equal(touchedCount(null), 0);
});

for (const reasoner of ['ops', 'matrix']) {
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), reasoner });
  const session = async (setup = []) => {
    const s = engine.createSession({ language: 'en' });
    s.setWorldState('ui.shell', { activeTab: 'draw' });
    for (const m of setup) await s.send(m);
    return s;
  };
  const draw = (s) => s.state()['art.draw'];
  const kinds = (s) => draw(s).objects.map((o) => o.kind);
  const byKind = (s, k) => draw(s).objects.filter((o) => o.kind === k);

  test(`${reasoner}: a pond or a lake is an object, not water over the whole ground`, async () => {
    const s = await session(['draw 2 trees']);
    const r = await s.send('draw a pond');
    // spec 28: a pond is a scene of the board's own kinds (request.sop w.expect: water, a few plants, an animal), its water one lake object
    assert.deepEqual(kinds(s).slice(0, 3), ['tree', 'tree', 'lake'], r.text);
    assert.ok(!draw(s).ground, 'the ground stays as it was');
    assert.equal(byKind(s, 'lake').length, 1);
  });

  test(`${reasoner}: relations work on regions and on objects alike (above, in, under)`, async () => {
    const s = await session(['draw 2 cats', 'draw a lake']);
    const lake = byKind(s, 'lake')[0];
    await s.send('move the cats above the water');
    const cats = byKind(s, 'cat');
    assert.ok(cats.every((c) => c.y < lake.y), 'above the lake');
    assert.ok(cats[0].x !== cats[1].x, 'a group keeps its arrangement');
    await s.send('put the cats in the lake');
    assert.ok(byKind(s, 'cat').every((c) => Math.abs(c.x - lake.x) < lake.size / 2 && Math.abs(c.y - lake.y) < lake.size * 0.3), 'inside the lake');
    const r = await s.send('put sand under the cats');
    const patch = byKind(s, 'patch')[0];
    assert.ok(patch, r.text);
    assert.equal(patch.color, 'tan');
    assert.ok(patch.size >= Math.max(...byKind(s, 'cat').map((c) => c.size)), 'as wide as the group');
    assert.equal(draw(s).ground ?? null, null, 'the ground is untouched');
  });

  test(`${reasoner}: a placing verb with a thing that is not in the picture adds it; with one that is, it moves it`, async () => {
    const s = await session(['draw a dog']);
    await s.send('place a river');
    assert.deepEqual(kinds(s), ['dog', 'river']);
    await s.send('and a road');
    assert.deepEqual(kinds(s), ['dog', 'river', 'road']);
    const dog = byKind(s, 'dog')[0], before = { x: dog.x, y: dog.y };
    await s.send('put the dog on the left');
    assert.equal(byKind(s, 'dog').length, 1);
    assert.ok(byKind(s, 'dog')[0].x < before.x || byKind(s, 'dog')[0].x !== before.x, 'moved, not added');
  });

  test(`${reasoner}: a move that is asked for something that does not exist is still refused (only a placing verb adds)`, async () => {
    const s = await session(['draw a dog']);
    const r = await s.send('move the tree to the left');
    assert.match(r.text, /can not find/i);
    assert.deepEqual(kinds(s), ['dog']);
  });

  test(`${reasoner}: more of the same: "bigger" after a move is about the things moved`, async () => {
    const s = await session(['draw 3 trees', 'move the trees up']);
    const size0 = byKind(s, 'tree').map((t) => t.size);
    const r = await s.send('bigger');
    assert.match(r.text, /bigger/i, r.text);
    assert.ok(byKind(s, 'tree').every((t, i) => t.size > size0[i]), 'all three grew');
    // "further left" (read as a flip: "I turned the tree around"), "make them blue" (one tree), "not on the water" (water added to the ground) and
    // "but keep the water" (read as save: a PNG download) are on the failure ledger (P3, source "P3 test cut")
  });
}
