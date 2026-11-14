// Review G2: self-corrections are resolved on the whole message before any effect (spec 03 section 1c).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/dialog/index.mjs';
import { createFsLoader } from '../src/loaders/fs-loader.mjs';
import { correctMessage } from '../src/formalizer/rules/expand.mjs';

const engine = await createEngine({ loader: createFsLoader({}) });
const play = async (...msgs) => {
  const s = engine.createSession({ language: 'en' });
  let r;
  for (const m of msgs) r = await s.send(m);
  return { s, r, st: (w) => s.isession.state[w] };
};
const fixed = async (t) => (await correctMessage(t)).text;

test('correctMessage: scope and result, and nothing else changes', async () => {
  assert.equal(await fixed('knight to f3, no, knight to c3'), 'knight to c3');
  assert.equal(await fixed('what 3 pencils cost, no, 4 pencils'), 'what 4 pencils cost');
  assert.equal(await fixed('draw a cat, no wait, a dog'), 'draw a dog');
  assert.equal(await fixed('make your eyes blue, no, green'), 'make your eyes green');
  assert.equal(await fixed('e2 to e4, no, e3'), 'e2 to e3');
  assert.equal(await fixed('move 3, no, 4'), 'move 4');
  assert.equal(await fixed('draw a cat, then paint it red, no, blue. And move left'), 'draw a cat, then paint it blue. And move left');
  const scope = async (t) => (await correctMessage(t)).corrections[0].scope;
  assert.equal(await scope('knight to f3, no, knight to c3'), 'command');
  assert.equal(await scope('make your eyes blue, no, green'), 'value');
  assert.equal(await scope('draw a red cat, no, a blue cat'), 'object');
  assert.equal(await scope('e, no, z'), 'modal-answer');
});

test('plain answers and real negation are left alone', async () => {
  for (const t of ['no', 'yes', 'no, thanks', 'is it big, no?', 'do not draw a cat', "don't move it", 'draw no cat', 'yes, no']) {
    assert.deepEqual(await correctMessage(t), { text: t, corrections: [] }, t);
  }
});

test('draw: "a cat, no wait, a dog" adds one object, the dog', async () => {
  const { st } = await play('draw a cat, no wait, a dog');
  const objs = st('art.draw').objects;
  assert.equal(objs.length, 1);
  assert.equal(objs[0].kind, 'dog');
});

test('kids.shop: the price answer uses the corrected number', async () => {
  const { r } = await play('what 3 pencils cost, no, 4 pencils');
  assert.match(r.text, /4 pencils cost 8 lei/);
  assert.ok(!/3 pencils/.test(r.text));
});
