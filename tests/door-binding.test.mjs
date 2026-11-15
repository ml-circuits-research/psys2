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

// Spec 28 section 14, slice 4: the Diagram on the declared binding (worlds/diagram.sketch/request.sop std.tool wires, tool.mjs primitives): a diagram is a whole the library plans
// with its nodes and links; properties through Session.send.
const diagram = () => { const s = engine.createSession({ language: 'en' }); s.setWorldState('ui.shell', { activeTab: 'diagram' }); return s; };
const dg = (s) => s.state()['diagram.sketch'] ?? { shapes: [], edges: [] };
const shapes = (s) => { const k = {}; for (const x of dg(s).shapes ?? []) k[x.shape] = (k[x.shape] ?? 0) + 1; return k; };

test('diagram: a range and a kind not wanted are kept; the nodes are linked; one request is one undo step (session and the tab\'s own history)', async () => {
  const s = diagram();
  const r = await s.send('draw a diagram with 6 to 8 nodes, no circles');
  const n = dg(s).shapes.length;
  assert.equal(r.trace.door, 'bound make', r.text);
  assert.ok(n >= 6 && n <= 8, r.text);
  assert.ok(!shapes(s).circle, r.text);
  assert.equal(dg(s).edges.length, n - 1, `a tree of ${n} nodes: ${r.text}`);
  assert.equal(dg(s).undo.length, 1, 'the calls of one plan are one entry of the engine\'s undo');
  await s.send('undo');
  assert.equal(dg(s).shapes.length, 0);
});

test('diagram: a count said of one kind is kept; "fewer nodes" cuts the same structure; questions and praise are no step', async () => {
  const s = diagram();
  const r = await s.send('make me a diagram of 6 boxes but no diamonds');
  assert.deepEqual(shapes(s), { rectangle: 6 }, r.text);
  const fewer = await s.send('fewer nodes');
  const m = dg(s).shapes.length;
  assert.ok(m < 6 && m >= 1, fewer.text);
  assert.deepEqual(Object.keys(shapes(s)), ['rectangle'], fewer.text);
  assert.equal(dg(s).edges.length, m - 1, `still connected: ${fewer.text}`);
  const before = JSON.stringify([dg(s).shapes, dg(s).edges]);
  for (const t of ['how many nodes?', 'what can you do here?', 'nice']) {
    const q = await s.send(t);
    assert.equal(JSON.stringify([dg(s).shapes, dg(s).edges]), before, `${t}: ${q.text}`);
  }
  const q = await s.send('how many rectangles are there?');
  assert.match(q.text, new RegExp(`There (?:are ${m} rectangles|is one rectangle)`), q.text);
});

test('diagram: acts on the shapes there go through the binding (change, remove); things of kinds stand free', async () => {
  const s = diagram();
  const r = await s.send('draw three circles');
  assert.deepEqual(shapes(s), { circle: 3 }, r.text);
  assert.equal(dg(s).edges.length, 0, r.text);
  const c = await s.send('change the circles to red');
  assert.ok(dg(s).shapes.every((x) => x.color === 'red'), c.text);
  assert.equal(c.trace.door, 'bound change', c.text);
  const d = await s.send('remove the circles');
  assert.equal(dg(s).shapes.length, 0, d.text);
  assert.equal(d.trace.door, 'bound remove', d.text);
});
