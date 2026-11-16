// SPDX-License-Identifier: AGPL-3.0-only
// Spec 28 section 14: the Drawing runs on the declared binding (sopworld 0.152.1 std.tool): properties through Session.send, no world code in the door.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';

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
  assert.doesNotMatch(fewer.text, /made it again/);   // a step reaction is said by its net result, no remake (sopworld 0.157, Q93 (1))
});

let roEngine = null;
test('a revision changes only what it names: after a make of kinds A and B, a reaction naming A leaves the count of B unchanged (EN + RO; reviewer 01:55)', async () => {
  for (const [lang, make, react, a, b] of [
    ['en', 'draw three cats and a dog', 'fewer cats', 'cat', 'dog'],
    ['en', 'draw two dogs and three trees', 'more dogs', 'dog', 'tree'],
    ['ro', 'deseneaza trei pisici si un caine', 'mai putine pisici', 'cat', 'dog'],
  ]) {
    const s = (lang === 'ro' ? (roEngine ??= await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() })) : engine).createSession({ language: lang }); s.setWorldState('ui.shell', { activeTab: 'draw' });
    await s.send(make);
    const before = kinds(s);
    const r = await s.send(react);
    assert.notEqual(kinds(s)[a], before[a], `${lang} ${react}: the named kind changes: ${r.text}`);
    assert.equal(kinds(s)[b], before[b], `${lang} ${react}: the other kind keeps its count: ${r.text}`);
  }
});

test('a general whole is planned as one of its subkind wholes and carried out (the count said of the general kind is the target one; Q92 (1))', async () => {
  for (const said of ['draw a random picture', 'draw a picture with a lake']) {
    const s = drawing();
    const r = await s.send(said);
    assert.equal(r.trace.door, 'bound make', `${said}: ${r.text}`);
    assert.ok((s.state()['art.draw'].objects ?? []).length > 1, `${said}: ${r.text}`);
  }
});

test('a place said by a thing of the view goes to that thing with the relation said (step.region, step.relation; Q92 (2))', async () => {
  const s = drawing();
  await s.send('draw a lake');
  await s.send('draw three fish');
  const r = await s.send('move all the fish into the water');
  const objs = s.state()['art.draw'].objects, lake = objs.find((o) => o.kind === 'lake');
  const fish = objs.filter((o) => o.kind === 'fish');
  assert.equal(fish.length, 3, r.text);
  for (const f of fish) assert.ok(Math.abs(f.x - lake.x) < 1 && Math.abs(f.y - lake.y) < 1, `every fish is in the lake: ${r.text}`);
});

test('a new page never draws content: "start a new drawing", "new page", "o pagina noua" (the world\'s own whole with nothing said of it is its page op; Q93 (6))', async () => {
  const roE = (roEngine ??= await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() }));
  for (const [lang, said] of [['en', 'start a new drawing'], ['en', 'new page'], ['en', 'start a new page'], ['ro', 'o pagină nouă'], ['ro', 'începe un desen nou']]) {
    const s = (lang === 'ro' ? roE : engine).createSession({ language: lang }); s.setWorldState('ui.shell', { activeTab: 'draw' });
    await s.send(lang === 'ro' ? 'desenează o casă' : 'draw a house');
    const r = await s.send(said);
    const objs = s.state()['art.draw'].objects ?? [];
    assert.ok(objs.every((o) => o.kind === 'house'), `${lang} ${said}: no content drawn: ${r.text} ${JSON.stringify(objs.map((o) => o.kind))}`);
  }
  const s = drawing();
  await s.send('draw a house');
  const r = await s.send('start a new drawing');
  assert.equal((s.state()['art.draw'].objects ?? []).length, 0, r.text);
  assert.match(r.text, /fresh sheet/);
});

test('questions about the state and about what the world can do are facts of the live world (askWorld), no step', async () => {
  const s = drawing();
  await s.send('draw two dogs and a tree');
  const before = JSON.stringify(s.state()['art.draw']);
  const what = await s.send('what is in the picture?');
  assert.match(what.text, /2 (?:\w+ )?dogs/);   // few things: their attributes are said (sopworld 0.160 state.count.value: "There are 2 brown dogs.")
  assert.match(what.text, /(?:one|a \w+) tree/);
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

test('every attribute value said in a make is in the view after it, on the thing of its kind (EN + RO; coordinated attributes)', async () => {
  const ro = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });
  for (const [lang, said] of [['en', 'draw a red boat and a blue house'], ['ro', 'desenează o barcă roșie și o casă albastră']]) {
    const s = (lang === 'ro' ? ro : engine).createSession({ language: lang });
    s.setWorldState('ui.shell', { activeTab: 'draw' });
    const r = await s.send(said);
    const colour = (k) => (s.state()['art.draw']?.objects ?? []).filter((o) => o.kind === k).map((o) => o.colour ?? o.color);
    assert.deepEqual(colour('boat'), ['red'], `${lang}: ${r.text}`);
    assert.deepEqual(colour('house'), ['blue'], `${lang}: ${r.text}`);
  }
});
// [LIB] the said colours are in the view but not in the words: "draw a red boat and a blue house" is said "I added a boat. I added a house." and "what is in the picture?" "There is one boat. There is one house.".
// sayRequest's make branch takes `outcome.roles.colour` (one value for the whole turn) for done.make.value, not the per-kind `attribute of=<kind>` constraints; askWorld's state facts carry no attributes.
