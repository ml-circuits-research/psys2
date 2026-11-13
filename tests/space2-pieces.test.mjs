// SPACE-2 layers 1-3 (worker-tasks 17:40): pieces, relations kept as facts with tiers, the stable solver, layouts read from k.layouts, and art.draw keeping relations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as P from '../worlds/space/pieces.mjs';
import * as S from '../worlds/space/space.mjs';
import { solve } from '../worlds/space/solver.mjs';
import { createLayouts, parseLayouts, parseAnchors, parseJoins } from '../src/knowledge/layouts.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { settingsForMode, sessionOptions } from '../src/dialog/runtime-config.mjs';

const frame = { w: 1000, h: 700 };
const mk = (id, kind, x, y, w, h, z = 0) => P.pieceFrom({ id, kind, x, y, w, h, z });

test('pieces: outline from part points is the hull; anchors include the knowledge anchors; attachAt puts one anchor on another', () => {
  const shape = P.outlineFromParts([{ x: 0, y: 0.25, w: 1, h: 0.5 }, { x: 0, y: -0.25, pts: [[-0.5, 0], [0, -0.5], [0.5, 0]] }], 100);
  assert.equal(shape[0].length, 5);
  const head = mk('head', 'head', 500, 300, 100, 120), hat = mk('hat', 'hat', 0, 0, 80, 40);
  assert.deepEqual(P.anchorsOf(head).chin, [500, 360]);
  const c = P.attachAt(hat, 'bottom', head, 'top');
  assert.deepEqual(c, { x: 500, y: 220 });   // the hat's bottom on the top of the head
});

test('relations are facts ranked by tier; a user "apart" blocks the rule and is remembered; refusals have a plain reason', () => {
  const st = P.createStore(), roof = mk('roof', 'roof', 300, 400, 220, 70), walls = mk('walls', 'walls', 300, 450, 200, 100);
  assert.equal(P.inferFacts([roof, walls], st, { frame }).added[0].rel, 'on');   // knowledge: a roof sits on walls
  assert.ok(P.propose(st, { rel: 'apart_from', a: 'roof', b: 'walls', tier: 'said' }).ok);   // said beats knowledge: the rule's fact is replaced
  assert.equal(st.facts.length, 1);
  const again = P.inferFacts([roof, walls], st, { frame });
  assert.equal(again.added.length, 0);   // "apart" is remembered: the rule does not join them again
  const r = P.propose(st, { rel: 'on', a: 'roof', b: 'walls', tier: 'knowledge' });
  assert.equal(r.ok, false); assert.match(r.reason, /kept apart/);
  assert.equal(P.retract(st, 'apart_from', 'roof', 'walls').length, 1);
});

test('moving a piece moves what is on or in it, not what is next to it; the carried piece that ends off its support loses the fact and says so', () => {
  const st = P.createStore(), pcs = [mk('table', 'table', 300, 400, 200, 20), mk('cup', 'cup', 300, 370, 30, 30), mk('chair', 'chair', 450, 420, 50, 60)];
  P.propose(st, { rel: 'on', a: 'cup', b: 'table' }); P.propose(st, { rel: 'next_to', a: 'chair', b: 'table' });
  const m = P.movePiece(st, pcs, 'table', 100, 0, { frame });
  assert.deepEqual(Object.keys(m.boxes).sort(), ['cup', 'table']);
  assert.equal(P.checkMove(st, pcs, 'cup', 0, 40, { names: { cup: 'the cup', table: 'the table' } }).reason, 'the cup can not go lower: it is on the table.');
  const lone = P.movePiece(st, pcs, 'cup', 400, 0, { frame, names: { cup: 'the cup', table: 'the table' } });
  assert.equal(lone.dropped.length, 1); assert.match(lone.say, /no longer on the table/);
});

test('the solver: layout, relations, smallest-move overlap removal, stability of pinned pieces, and the last valid state kept with the reason', () => {
  const a = mk('a', 'box', 500, 300, 100, 100), b = mk('b', 'box', 520, 310, 100, 100), c = mk('c', 'box', 900, 600, 100, 100);
  const r = solve({ pieces: [a, b, c], frame, pinned: ['a', 'c'], mentioned: ['b'] });
  assert.ok(r.ok); assert.deepEqual(Object.keys(r.boxes), ['b']);   // only the one that was not pinned moved
  assert.ok(!S.overlaps(a, { ...b, ...r.boxes.b }, 1));
  const st = P.createStore(); P.propose(st, { rel: 'left_of', a: 'a', b: 'c' });
  const ok = solve({ pieces: [a, c], facts: st.facts, frame }); assert.ok(ok.ok);
  const bad = solve({ pieces: [mk('x', 'box', 500, 350, 950, 690), mk('y', 'box', 500, 350, 950, 690)], frame, pinned: ['x'] });
  assert.equal(bad.ok, false); assert.deepEqual(bad.boxes, {}); assert.match(bad.say, /left everything as it was/);
  const corners = solve({ pieces: [a, b, c], frame, layout: 'corners' });
  assert.ok(corners.ok); assert.deepEqual(Object.values(corners.boxes).map((v) => [v.x < 500, v.y < 350]).flat().length, 6);
  const budgeted = solve({ pieces: Array.from({ length: 60 }, (_, i) => mk(`p${i}`, 'box', 500, 350, 80, 80)), frame, maxSteps: 50 });
  assert.equal(budgeted.ok, false);   // the step budget ran out: nothing changed
});

test('the solver is deterministic and flow / tree layouts follow edges', () => {
  const pcs = ['a', 'b', 'c', 'd'].map((id, i) => mk(id, 'box', 100 + i, 100, 60, 40));
  const edges = [['a', 'b'], ['a', 'c'], ['b', 'd']];
  const r1 = solve({ pieces: pcs, frame, layout: 'flow', edges }), r2 = solve({ pieces: pcs, frame, layout: 'flow', edges });
  assert.deepEqual(r1, r2);
  assert.ok(r1.boxes.a.x < r1.boxes.b.x && r1.boxes.b.x < r1.boxes.d.x);
  const t = solve({ pieces: pcs, frame, layout: 'tree', edges });
  assert.ok(t.boxes.a.y < t.boxes.b.y && t.boxes.b.y < t.boxes.d.y);
});

test('k.layouts: parsed from the knowledge text; a layout that is only slots needs no code (E-S6); the fallback stays when there are none', async () => {
  const text = readFileSync(new URL('./fixtures/k.layouts.sop', import.meta.url), 'utf8');
  assert.equal(parseLayouts(text).length, 4);   // 'nothing' has neither a generator nor a place
  assert.equal(parseAnchors(text)[0].kind, 'seat'); assert.equal(parseJoins(text)[0].rel, 'sits_on');
  const L = createLayouts({ text }); await L.load();
  assert.equal(L.from, 'catalog');
  const fam = L.find('arrange them like a family photo');
  assert.equal(fam.id, 'family_photo');
  const pcs = [['dad', 200], ['mum', 170], ['kid', 100], ['baby', 60]].map(([id, h], i) => mk(id, 'person', 100 + i * 20, 300, 60, h, i));
  const r = solve({ pieces: pcs, frame, layout: fam });
  assert.ok(r.ok);   // the tall ones in the back row, the small ones in the front row (the places and their boxes are data), each row in reading order
  assert.ok(r.boxes.dad.x < r.boxes.mum.x && r.boxes.kid.x < r.boxes.baby.x && r.boxes.dad.y < r.boxes.kid.y && r.boxes.mum.y < r.boxes.baby.y);
  assert.equal(L.find('in different corners').generator, 'corners');
  const none = createLayouts({ source: { text: async () => null } }); await none.load();
  assert.equal(none.from, 'fallback'); assert.ok(none.find('in a row'));
});

test('art.draw keeps relations as facts: what is on a thing travels with it, "apart" is remembered, a thing is not pushed into what it stands on, layouts as destinations', async () => {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
  s.setWorldState('ui.shell', { activeTab: 'draw' });
  const say = async (t) => (await s.send(t)).text;
  const objs = () => s.state()['art.draw'].objects;
  await say('draw a house'); await say('draw a tree'); await say('put a cat on the house');
  const cat0 = objs().find((o) => o.kind === 'cat'), house0 = objs().find((o) => o.kind === 'house');
  const t1 = await say('move the house to the left');
  const cat1 = objs().find((o) => o.kind === 'cat'), house1 = objs().find((o) => o.kind === 'house');
  assert.equal(Math.round(cat1.x - cat0.x), Math.round(house1.x - house0.x)); assert.match(t1, /went along/i);
  assert.match(await say('move the cat down'), /can not go lower: it is on the house/);
  await say('put the tree next to the house, apart');
  assert.ok(s.state()['art.draw'].rels.facts.some((f) => f.rel === 'apart_from'));
  const s2 = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
  s2.setWorldState('ui.shell', { activeTab: 'draw' });
  await s2.send('draw 5 fish');
  const reply = (await s2.send('move all the fish in different corners')).text;
  assert.match(reply, /each into its own corner/);
  const fish = s2.state()['art.draw'].objects;
  assert.ok(fish.some((o) => o.x < 200 && o.y < 200) && fish.some((o) => o.x > 800 && o.y > 500));
});
