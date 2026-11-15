// SPDX-License-Identifier: AGPL-3.0-only
// Class B of the real set (Romanian drawing: plural and relative moves, continuations, corrections of the thing, placement; spec 22 "Relative continuations",
// spec 06 "Romanian moves by the catalog's frames"): the translation boundary, the library's resolveEllipsis wired into the dialogue layer, the plural kind of a view,
// a thing in a container, "make them different", a diagram that only read a turn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { withView } from '../worlds/session.things/view.mjs';
import { createStore, checkMove } from '../worlds/space/pieces.mjs';

const tr = createTranslator();
const ro = async (t) => (await tr.translate(t, { from: 'ro', to: 'en' })).text;

test('Romanian moves read by the w.lang.ro frames (sopworld readFrames): mai + direction, the focus particle, two directions, no verb', async () => {
  assert.equal(await ro('muta casele mai sus'), 'Move the houses higher');
  assert.equal(await ro('muta crocodilii mai jos'), 'Move the crocodiles lower');
  assert.equal(await ro('muta si mai la stinga'), 'Move it even further to the left');
  assert.equal(await ro('muta prima casa mai la stinga si mai jos'), 'Move the first house further to the left and lower');
  assert.equal(await ro('si mai sus'), 'Even higher');
  assert.equal(await ro('muta casa din dreapta mai la dreapta'), 'Move the house on the right further to the right');
});

test('Romanian residue as general rules: a side after a preposition, the focus particle "și", a wish "să fie" + adjective', async () => {
  assert.equal(await ro('casa din stânga'), 'The house on the left');
  assert.equal(await ro('muta casa la stanga'), 'Move the house to the left');
  assert.equal(await ro('nu prima acasa, cea din mijloc'), 'Not the first home, the one in the middle');
  assert.equal(await ro('pune soarele in dreapta sus'), 'Put the sun in the top right');
  assert.equal(await ro('pune si un lac'), 'Put a lake too');
  assert.equal(await ro('desenează un câine și o pisică'), 'Draw a dog and a cat');   // coordination stays "and"
  assert.equal(await ro('sa fie diferite'), 'Make them different');
  assert.equal(await ro('să fie roșu'), 'Make it red');
});

test('a view reads a plural kind word as its kind: "different houses" is never rewritten to "thing" by the knowledge tier', () => {
  const schema = { view: { aspects: [] }, kinds: { thing: { name: 'thing', plural: 'things', words: ['house', 'bus'] } }, attrs: {} };
  const h = withView(schema, 'test.view', {});
  const ctx = { state: {}, knowledge: { ancestors: () => ['building', 'thing'], own: () => [] } };
  for (const w of ['different houses', 'two buses']) {
    const req = { thing: w, text: `draw ${w}` };
    h.before(ctx, 'make', req);
    assert.equal(req.thing, w);
  }
});

test('a thing in a container moves inside it up to its edge, and leaves it when it is already there (spec 19 checkMove)', () => {
  const store = createStore();
  store.facts.push({ rel: 'in', a: 'c', b: 'l', source: 'rule', tier: 'knowledge', seq: 1 });
  const pieces = [{ id: 'l', x: 500, y: 500, w: 400, h: 200 }, { id: 'c', x: 500, y: 560, w: 60, h: 40 }];
  const a = checkMove(store, pieces, 'c', 0, 100, { names: { c: 'the crocodile', l: 'the lake' } });
  assert.equal(a.ok, true);
  assert.deepEqual(a.clampTo, { dx: 0, dy: 20 });
  pieces[1].y = 580;
  const b = checkMove(store, pieces, 'c', 0, 100, { names: { c: 'the crocodile', l: 'the lake' } });
  assert.equal(b.ok, true);
  assert.ok(b.leaves && /no longer in the lake/.test(b.reason));
});

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const drawing = async (lines) => {
  const s = engine.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { activeTab: 'draw' });
  const out = [];
  for (const l of lines) out.push(await s.send(l));
  return { s, out, houses: () => (s.state()['art.draw'].objects ?? []).filter((o) => o.kind === 'house').sort((x, y) => x.x - y.x) };
};

test('relative continuations through the library: "even further to the left" and "move even further to the left" move the things just moved again', async () => {
  const d = await drawing(['draw 3 different houses', 'move the houses higher']);
  const x0 = d.houses().map((o) => o.x);
  const r1 = await d.s.send('even further to the left');
  assert.match(r1.text, /moved the houses/i);
  const x1 = d.houses().map((o) => o.x);
  assert.ok(x1.every((x, i) => x < x0[i]), `${x0} -> ${x1}`);
  const r2 = await d.s.send('move even further to the left');
  assert.match(r2.text, /moved the houses/i);
  assert.ok(!r2.segments.some((x) => x.match?.worldId === 'media.music'));
});

test('a correction of the thing: "not the first house, the one in the middle" takes the last move back and moves the middle house', async () => {
  const d = await drawing(['draw 3 different houses']);
  const [first0, mid0] = d.houses().map((o) => ({ id: o.id, x: o.x }));
  await d.s.send('move the first house to the right');
  const r = await d.s.send('not the first house, the one in the middle');
  assert.match(r.text, /moved the house/i);
  const now = Object.fromEntries(d.houses().map((o) => [o.id, o.x]));
  assert.equal(now[first0.id], first0.x, 'the first house is back');
  assert.ok(now[mid0.id] > mid0.x, 'the middle house moved right');
});

test('"make the houses different": a change of the things, said when they already differ', async () => {
  const d = await drawing(['draw 3 different houses']);
  const r = await d.s.send('make the houses different');
  assert.match(r.text, /already different/);
  const e = await drawing(['draw 3 houses']);
  const r2 = await e.s.send('make the houses different');
  assert.match(r2.text, /I made them different/);
  assert.equal(new Set(e.houses().map((o) => o.color)).size, 3);
});

test('a diagram that only read a turn keeps its revision (the visible state is unchanged on a turn nobody understood)', async () => {
  const s = engine.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { activeTab: 'diagram' });
  await s.send('draw a circle');
  const rev = s.state()['diagram.sketch'].rev;
  await s.send('she knows what their grandma could trade charcoal Chicago');
  assert.equal(s.state()['diagram.sketch'].rev, rev);
});
