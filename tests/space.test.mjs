// The shared module `space` (specs/19-space-module.md): its functions, its words, the 5 owner rows of class `space`, and a sample of the generated set through both hosts
// and both reasoners (the full 150 are `node scripts/eval-space.mjs`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as S from '../worlds/space/space.mjs';
import { build } from '../scripts/build-space-lexicon.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import * as draw from '../worlds/art.draw/ops.mjs';
import { generate } from '../training/eval/space-set.mjs';
import { runCases } from '../training/eval/space-run.mjs';

const kinds = { house: 'house', houses: 'house', tree: 'tree', sun: 'sun', box: '*', boxes: '*', circle: 'circle' };
const kindOf = (w) => (kinds[w] ? { kind: kinds[w], plural: w.endsWith('s') && w !== 'boxes' ? true : w === 'boxes' } : null);
const frame = { w: 1000, h: 700, step: 100 };
const row = (n, kind = 'house') => Array.from({ length: n }, (_, i) => ({ id: `${kind}${i + 1}`, kind, x: 150 + (700 / Math.max(1, n - 1)) * i, y: 400, w: 100, h: 100 }));
const run = (text, items, extra = {}) => S.interpret(text, { items, frame, kindOf, last: [], ...extra });

test('the lexicon file is the words of the module, stated once', () => {
  assert.equal(readFileSync(new URL('../worlds/space/lexicon.sop', import.meta.url), 'utf8'), build());
});

test('selection by order and place: first, last, left, middle, second from the right, the biggest', () => {
  const h = row(5);
  const pick = (t) => run(`move the ${t} house up`, h).ids;
  assert.deepEqual(pick('first'), ['house1']);
  assert.deepEqual(pick('last'), ['house5']);
  assert.deepEqual(pick('left'), ['house1']);
  assert.deepEqual(pick('rightmost'), ['house5']);
  assert.deepEqual(pick('middle'), ['house3']);
  assert.deepEqual(pick('second from the right'), ['house4']);
  const sized = row(3).map((x, i) => ({ ...x, w: 60 + i * 30, h: 60 + i * 30 }));
  assert.deepEqual(run('move the biggest house up', sized).ids, ['house3']);
  assert.deepEqual(run('move the two on the left up', row(4)).ids, ['house1', 'house2']);
});

test('an ambiguous selection asks and names the candidates by position, never silently the first', () => {
  const r = run('move the house to the left', row(3));
  assert.equal(r.type, 'ask');
  assert.match(r.say, /left house.*middle house.*right house/);
  const even = run('move the middle house to the left', row(4));
  assert.equal(even.type, 'ask');
  assert.match(even.say, /no single middle/);
});

test('"the other one", "next to X" and "between X and Y"', () => {
  const two = row(2);
  assert.deepEqual(run('move the other house up', two, { last: ['house1'] }).ids, ['house2']);
  const mixed = [...row(3), { id: 'sun1', kind: 'sun', x: 150, y: 150, w: 90, h: 90 }];
  assert.deepEqual(run('move the house next to the sun up', mixed).ids, ['house1']);
  assert.deepEqual(run('move the house between the sun and the last house up', [...row(3), { id: 'sun1', kind: 'sun', x: 150, y: 150, w: 90, h: 90 }]).ids.length, 1);
});

test('moves: directions combine, amounts, all the way, by half, further', () => {
  const h = row(3), mid = (t, ex) => run(t, h, ex);
  assert.deepEqual(mid('move the middle house left and down').boxes.house2, { x: 400, y: 500 });
  assert.deepEqual(mid('move the middle house a bit to the right').boxes.house2, { x: 550, y: 400 });
  assert.deepEqual(mid('move the middle house a lot higher').boxes.house2, { x: 500, y: 150 });
  assert.deepEqual(mid('move the middle house all the way to the left').boxes.house2, { x: 50, y: 400 });
  assert.deepEqual(mid('move the middle house to the right by half').boxes.house2, { x: 725, y: 400 });
  const first = mid('move the first house to the left');
  const again = run('further left', h, { last: first.ids, lastMove: first.memory });
  assert.equal(again.type, 'move');
  assert.deepEqual(again.boxes.house1, { x: 50, y: 400 });   // clamped at the edge
  assert.equal(run('further', h, { last: ['house1'] }).type, 'error');   // nothing to repeat
});

test('placements by relation leave no overlap; between, around, corner, centre', () => {
  const items = [...row(3), { id: 'sun1', kind: 'sun', x: 500, y: 150, w: 100, h: 100 }];
  for (const t of ['next to', 'above', 'under', 'to the left of', 'to the right of']) {
    const r = run(`put the first house ${t} the sun`, items);
    const moved = { ...items[0], ...r.boxes.house1 };
    assert.ok(Math.abs(moved.x - 500) < 400 && !(Math.abs(moved.x - 500) < 100 && Math.abs(moved.y - 150) < 100), `${t}: ${JSON.stringify(r.boxes)}`);
  }
  assert.deepEqual(run('put the sun between the first house and the last house', items).boxes.sun1, { x: 500, y: 300 });   // the middle house is in the way, so just above it
  assert.equal(run('put the sun around the middle house', items).boxes.sun1.w > 100, true);
  assert.deepEqual(run('put the sun in the top left corner', items).boxes.sun1, { x: 70, y: 70 });
  assert.deepEqual(run('put the sun in the centre', items).boxes.sun1, { x: 500, y: 350 });
});

test('layouts: row, column, grid, circle, spread, align, same size, centre, swap, tidy up', () => {
  const sc = [[200, 150], [700, 500], [400, 300], [850, 120]].map(([x, y], i) => ({ id: `house${i + 1}`, kind: 'house', x, y, w: 100, h: 100 }));
  const ys = (r) => Object.values(r.boxes).map((b) => b.y);
  assert.equal(new Set(ys(run('put the houses in a row', sc))).size, 1);
  assert.equal(new Set(Object.values(run('put the houses in a column', sc).boxes).map((b) => b.x)).size, 1);
  assert.equal(Object.keys(run('put the houses in a grid', sc).boxes).length, 4);
  const circ = Object.values(run('put the houses in a circle', sc).boxes);
  const cx = circ.reduce((a, b) => a + b.x, 0) / 4, cy = circ.reduce((a, b) => a + b.y, 0) / 4, d = circ.map((b) => Math.hypot(b.x - cx, b.y - cy));
  assert.ok(Math.max(...d) - Math.min(...d) < 3);
  assert.equal(run('align the houses on the left', sc).type, 'layout');
  const sw = run('swap the first and the last house', row(3));
  assert.deepEqual(sw.boxes.house1, { x: 850, y: 400 });
  assert.deepEqual(sw.boxes.house3, { x: 150, y: 400 });
  const piled = [{ id: 'a', kind: 'box', x: 400, y: 300, w: 100, h: 100 }, { id: 'b', kind: 'box', x: 440, y: 320, w: 100, h: 100 }, { id: 'c', kind: 'box', x: 420, y: 360, w: 100, h: 100 }];
  const tidy = run('make a better layout', piled);
  assert.equal(tidy.op, 'tidy');
  const after = piled.map((p) => ({ ...p, ...(tidy.boxes[p.id] ?? {}) }));
  assert.equal(S.anyOverlap(after), false);
  assert.equal(run('tidy up', row(3)).say, 'Nothing overlaps, so it is already tidy.');
});

test('questions: next to, which one, is A above B, how far apart', () => {
  const items = [...row(3), { id: 'sun1', kind: 'sun', x: 500, y: 150, w: 100, h: 100 }];
  assert.match(run('is the sun above the middle house', items).say, /^Yes/);
  assert.match(run('is the sun under the middle house', items).say, /^No/);
  assert.match(run('which house is in the middle', items).say, /middle house/);
  assert.match(run('how far apart are the sun and the middle house', items).say, /far apart|a bit apart|close/);
  assert.match(run('what is next to the sun', [...row(3), { id: 'sun1', kind: 'sun', x: 330, y: 330, w: 100, h: 100 }]).say, /Next to the sun/);
});

// ---- the owner's session of 13:09 (class `space` of owner-log-2026-11-13.jsonl), through the Romanian boundary, in both reasoners -------------------------
const rows = readFileSync(new URL('../training/eval/owner-log-2026-11-13.jsonl', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.class === 'space');
const houses = () => { const s = draw.initialState(); s.objects = [0, 1, 2].map((i) => ({ id: `o${i + 1}`, kind: 'house', x: 200 + i * 300, y: 450, size: 150, color: null, fill: 'crayon', rotation: 0, flip: false, z: i, parts: {} })); s.nextId = 4; return s; };
test('the 5 owner rows of class space exist', () => assert.equal(rows.length, 5));

for (const reasoner of ['ops', 'matrix']) {
  test(`owner rows, ${reasoner}: first house left and down, further left, the middle house, the correction, the right house`, async () => {
    const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), translator: createTranslator(), options: { reasoner } });
    const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'ro' }));
    s.setWorldState('ui.shell', { activeTab: 'draw' });
    s.setWorldState('art.draw', houses());
    const pos = () => s.state('art.draw').objects.map((o) => [o.x, o.y]);
    const say = async (i) => (await s.send(rows[i].text, { language: 'ro' })).text;
    const p0 = pos();
    await say(0);                                    // the first house, left and down
    const p1 = pos();
    assert.ok(p1[0][0] < p0[0][0] && p1[0][1] > p0[0][1], 'left and down');
    assert.deepEqual(p1.slice(1), p0.slice(1), 'only the first house');
    await say(1);                                    // "and further left": the same house again
    const p2 = pos();
    assert.ok(p2[0][0] < p1[0][0] && p2[0][1] === p1[0][1], 'further left');
    const r3 = await say(2);                         // the middle house, more to the right
    const p3 = pos();
    assert.ok(p3[1][0] > p2[1][0], 'the middle house moved right');
    assert.deepEqual([p3[0], p3[2]], [p2[0], p2[2]]);
    assert.doesNotMatch(r3, /am luat-o pe prima|I took the first/);
    await s.send('Move the first house to the right.');
    const p4 = pos();
    await say(3);                                    // "not the first one, the middle one": the first goes back, the middle one moves
    const p5 = pos();
    assert.deepEqual(p5[0], p3[0], 'the first house is back');
    assert.ok(p5[1][0] > p4[1][0] - 1 && p5[1][0] !== p3[1][0], 'the middle one moved');
    const r5 = await say(4);                         // the rightmost house to the right
    const p6 = pos();
    assert.ok(p6[2][0] > p5[2][0] && p6[1][0] === p5[1][0], 'the right house moved right');
    assert.doesNotMatch(r5, /am luat-o pe prima|I took the first/);
  });

  test(`generated set sample, ${reasoner}: 18 of the 150 requests over both hosts`, async () => {
    const all = generate();
    assert.equal(all.length, 150);
    assert.deepEqual(generate().map((c) => c.text), all.map((c) => c.text), 'seeded: the same set every time');
    const sample = all.filter((_, i) => i % 8 === 3);
    const res = await runCases(sample, { reasoner });
    assert.deepEqual(res.filter((r) => !r.ok).map((r) => `${r.id} ${r.text}: ${r.why}`), []);
  });
}
