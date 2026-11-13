import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import * as scene from '../worlds/art.draw/scene.mjs';
import { THINGS } from '../worlds/art.draw/things.catalog.mjs';

// DRAW-FROM-FACTS (spec 07 section 7): any thing of the catalog (knowledge/k.objects) is drawn from its parts by the same renderer as the built-in kinds.

const engines = {
  ops: await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) }),
  matrix: await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } }),
};
const session = async (reasoner, lines) => {
  const s = engines[reasoner].createSession({ language: 'en' });
  const said = [];
  for (const l of lines) said.push((await s.send(l)).text);
  return { said, state: s.state('art.draw') };
};
const composite = (thing, extra = {}) => ({ id: 'o1', kind: 'composite', thing, x: 500, y: 350, size: 200, color: null, fill: 'crayon', rotation: 0, flip: false, parts: {}, ...extra });

test('the generated catalog is up to date with knowledge/k.objects', () => {
  const out = execFileSync('node', ['scripts/build-thing-catalog.mjs', '--check'], { encoding: 'utf8' });
  assert.match(out, /up to date/);
});

test('every catalog object builds parts inside its own frame, and the size is the width of the picture', () => {
  assert.ok(Object.keys(THINGS).length >= 30);
  for (const name of Object.keys(THINGS)) {
    const o = composite(name), parts = scene.partsOf(o);
    assert.ok(parts.length >= 1, name);
    for (const p of parts) {
      const xs = p.pts ? p.pts.map((q) => q[0]) : [p.x - p.w / 2, p.x + p.w / 2];
      assert.ok(Math.min(...xs) >= -0.5 - 1e-3 && Math.max(...xs) <= 0.5 + 1e-3, `${name}.${p.n} is outside the frame in x`);
      assert.match(p.hex, /^#[0-9a-f]{6}$/i);
    }
    const b = scene.bbox(o), k = scene.KINDS[`composite:${name}`];
    assert.equal(b.w, 200, `${name}: width is the size`);
    assert.ok(Math.abs(b.h - 200 * k.aspect) < 1e-6, `${name}: height follows the aspect of its parts`);
    assert.ok(k.size * Math.max(1, k.aspect) <= 201, `${name}: the default size keeps the tallest side near 200`);
  }
});

test('scaling: a part keeps its place in the picture when the size changes (geometry is in units of the size)', () => {
  const small = scene.partsOf(composite('house', { size: 100 })), big = scene.partsOf(composite('house', { size: 400 }));
  assert.deepEqual(small.map((p) => [p.n, p.x, p.y, p.w, p.h]), big.map((p) => [p.n, p.x, p.y, p.w, p.h]));
  assert.equal(scene.bbox(composite('house', { size: 400 })).w, 4 * scene.bbox(composite('house', { size: 100 })).w);
  const turned = scene.bbox(composite('lighthouse', { rotation: 90 })), plain = scene.bbox(composite('lighthouse'));
  assert.ok(Math.abs(turned.w - plain.h) < 1e-6 && Math.abs(turned.h - plain.w) < 1e-6, 'a quarter turn swaps width and height');
});

test('colour: the user colour replaces the main part colour, the other parts keep theirs', () => {
  const plain = scene.partsOf(composite('house')), red = scene.partsOf(composite('house', { color: 'red' }));
  const main = (ps) => ps.find((p) => p.n === 'body');
  const blue = scene.partsOf(composite('house', { color: 'blue' }));
  assert.notEqual(main(plain).hex, scene.colorHex('blue'));
  assert.equal(main(blue).hex, scene.colorHex('blue'));
  void red;
  for (const p of plain.filter((q) => q.n !== 'body')) assert.equal(blue.find((q) => q.n === p.n && q.x === p.x).hex, p.hex, `${p.n} keeps its colour`);
  const pc = scene.partsOf(composite('house', { parts: { roof: 'blue' } }));
  assert.equal(pc.find((p) => p.n === 'roof').hex, scene.colorHex('blue'));
});

test('flip, size, move, undo, count and delete work on a composite as on one object, in both reasoners', async () => {
  for (const reasoner of ['ops', 'matrix']) {
    const { said, state } = await session(reasoner, ['Draw a lighthouse.', 'Flip the lighthouse.', 'Make the lighthouse bigger.', 'Move the lighthouse to the left.']);
    const o = state.objects[0];
    assert.equal(o.kind, 'composite', reasoner); assert.equal(o.thing, 'lighthouse', reasoner);
    assert.equal(o.flip, true, `${reasoner}: ${said[1]}`);
    assert.ok(o.size > scene.KINDS['composite:lighthouse'].size && o.x < 400, reasoner);
    const u = await session(reasoner, ['Draw a lighthouse.', 'Move the lighthouse to the left.', 'Undo.']);
    assert.ok(u.state.objects[0].x > 400, `${reasoner}: undo put it back`);
    const d = await session(reasoner, ['Draw two castles.', 'How many castles are there?', 'Delete the first castle.', 'How many castles are there?']);
    assert.match(d.said[1], /2 castles/, reasoner); assert.match(d.said[3], /1 castle/, reasoner);
  }
});

test('parts are addressable: recolour, add a third window, remove the chimney, put it back, undo', async () => {
  for (const reasoner of ['ops', 'matrix']) {
    const { said, state } = await session(reasoner, ['Draw a house.', 'Make the roof blue.', 'Add a third window.', 'Remove the chimney.']);
    const o = state.objects[0];
    assert.equal(o.parts.roof, 'blue', reasoner);
    assert.equal(o.extra.windows, 1, `${reasoner}: ${said[2]}`);
    assert.deepEqual(o.hide, ['chimney'], reasoner);
    const ps = scene.partsOf(o);
    assert.equal(ps.filter((p) => p.n === 'windows').length, 3);
    assert.ok(!ps.some((p) => p.n === 'chimney'));
    assert.equal(scene.partCount(o, 'windows'), 3);
    const back = await session(reasoner, ['Draw a house.', 'Remove the chimney.', 'Add a chimney.']);
    assert.deepEqual(back.state.objects[0].hide, [], reasoner);
    const un = await session(reasoner, ['Draw a house.', 'Add a third window.', 'Undo.']);
    assert.equal(un.state.objects[0].extra?.windows ?? 0, 0, `${reasoner}: undo takes the window back`);
    const again = await session(reasoner, ['Draw a house.', 'Add a third window.', 'Add a third window.']);
    assert.match(again.said[2], /already has 3/, reasoner);
    const c = await session(reasoner, ['Draw a castle.', 'Remove the gate.', 'Make the towers pink.']);
    assert.ok(/took away the gate/.test(c.said[1]) && c.state.objects.length === 1 && c.state.objects[0].parts.towers === 'pink', `${reasoner}: ${c.said[1]} | ${c.said[2]}`);
  }
});

test('a thing with no facts is answered plainly, never drawn as a random shape', async () => {
  for (const reasoner of ['ops', 'matrix']) {
    const { said, state } = await session(reasoner, ['Draw a blorp.', 'Draw a red zorbleflux.', 'Draw two quibbles.']);
    assert.equal(said[0], "I don't know how to draw a blorp yet.", reasoner);
    assert.equal(said[1], "I don't know how to draw a zorbleflux yet.", reasoner);
    assert.equal(said[2], "I don't know how to draw quibbles yet.", reasoner);
    assert.equal(state.objects.length, 0, reasoner);
  }
});

test('the built-in kinds are described as facts; the ones the facts can say fully are drawn from them, the same as the hand-coded picture', () => {
  const out = execFileSync('node', ['scripts/kinds-to-objects.mjs', '--check'], { encoding: 'utf8' });
  assert.match(out, /up to date/);
  assert.deepEqual(scene.KINDS_FROM_FACTS.slice().sort(), ['circle', 'heart', 'moon', 'oval', 'rectangle', 'square', 'star', 'triangle']);
  const bounds = (parts) => {
    const xs = [], ys = [];
    for (const p of parts) { if (p.pts) for (const [x, y] of p.pts) { xs.push(x); ys.push(y); } else { xs.push(p.x - p.w / 2, p.x + p.w / 2); ys.push(p.y - p.h / 2, p.y + p.h / 2); } }
    return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  };
  for (const kind of scene.KINDS_FROM_FACTS) {
    const hand = bounds(scene.handCodedParts(kind)), facts = bounds(scene.kindParts(kind));
    // the facts are a rounded copy in their own frame: the same silhouette, the same proportions
    const hr = (hand[1] - hand[0]) / (hand[3] - hand[2]), fr = (facts[1] - facts[0]) / (facts[3] - facts[2]);
    assert.ok(Math.abs(hr - fr) < 0.02 * hr, `${kind}: proportions`);
    assert.equal(scene.partsOf({ kind, size: 100, color: 'green' })[0].hex, scene.colorHex('green'), `${kind}: the user colour replaces the main colour`);
    assert.equal(scene.partsOf({ kind, size: 100 })[0].hex, scene.colorHex(scene.KINDS[kind].color), `${kind}: default colour`);
  }
});

test('diagram.sketch: "a diagram shaped like a house" takes the part boxes as the layout, one box per part, no arrows, in both reasoners', async () => {
  for (const reasoner of ['ops', 'matrix']) {
    const s = engines[reasoner].createSession({ language: 'en' });
    const r = await s.send('Make a diagram shaped like a house.');
    assert.match(r.text, /shaped like a house: one box for each of its 6 parts/, reasoner);
    const st = s.state('diagram.sketch');
    const parts = THINGS.house;
    assert.deepEqual(st.shapes.map((x) => x.name).sort(), parts.map((p) => p.name).sort(), reasoner);
    assert.deepEqual(st.edges, [], `${reasoner}: no arrows are invented`);
    for (const sh of st.shapes) assert.equal(sh.label, sh.name.replace(/_/g, ' '), 'labelled with the part name');
    // positions follow the boxes: the roof is above the body, the door below the windows, the left window left of the right one
    const at = (n) => st.shapes.find((x) => x.name === n);
    assert.ok(at('roof').y < at('body').y && at('door').y > at('left_window').y && at('left_window').x < at('right_window').x, reasoner);
    assert.ok(at('body').w > at('door').w && at('body').h > at('left_window').h, `${reasoner}: sizes follow the boxes`);
    const u = await s.send('Undo.');
    assert.match(u.text, /undid|undo/i, reasoner);
    const n = await engines[reasoner].createSession({ language: 'en' }).send('Make a diagram shaped like a blorp.');
    assert.equal(n.text, "I don't know how to draw a diagram shaped like a blorp yet.", reasoner);
  }
  // the engine's own layouts are unchanged
  const c = engines.ops.createSession({ language: 'en' });
  await c.send('Draw three rectangles in the diagram.');
  assert.match((await c.send('Arrange the boxes as a circle.')).text, /Arranged 3 shapes as a circle/);
});
