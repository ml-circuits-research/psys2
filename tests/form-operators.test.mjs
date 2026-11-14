// SPDX-License-Identifier: AGPL-3.0-only
// Typed form operators at read time (spec 16 section 11): the pure application, and the switch (off by default; on, the world still decides).
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOperator, formOperatorTexts } from '../src/dialog/form-operators.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';

const lib = await import('../src/vendor/sopworld/sopworld.mjs');
const world = new lib.World();
world.tell('@cow k.animal name=cow kind=bovine\n@dog k.animal name=dog kind=canid');

test('an operator over lifted tokens is written back with the clause\'s own words', () => {
  const op = { from: 'hey {x1} a {x2} makes {x3}', to: '{x1} {x2} does {x3} make', admitted: true };
  const ot = ['hey', 'what', 'a', 'sound', 'makes', 'a', 'cow'], lt = lib.liftTokens(world, 'hey what a sound makes a cow');
  assert.deepEqual(applyOperator(op, lt, ot).includes('what sound does a cow make'), true);
});

test('an operator whose output holds a bare type placeholder is not applied; a clause an operator does not match gives nothing', () => {
  assert.deepEqual(applyOperator({ from: '{x1} a', to: '{x1} <animal>' }, ['x', 'a'], ['x', 'a']), []);
  assert.deepEqual(applyOperator({ from: 'hey {x1}', to: '{x1}' }, ['what', 'a'], ['what', 'a']), []);
});

test('formOperatorTexts: only admitted operators, never the clause itself, nothing without a typed world', () => {
  const ops = [{ from: 'hey {x1}', to: '{x1}', admitted: true }, { from: '{x1} cow', to: 'cow {x1}', admitted: false }, { from: '{x1}', to: '{x1}', admitted: true }];
  assert.deepEqual(formOperatorTexts({ lib, world, operators: ops }, 'Hey, what does a cow say?'), ['what does a cow say']);
  assert.deepEqual(formOperatorTexts({ lib, world: null, operators: ops }, 'hey what'), []);
  assert.deepEqual(formOperatorTexts(null, 'hey what'), []);
});

test('the step is off by default and on only with PSYS2_FORMOPS=on; the world accepts the rewritten clause', async () => {
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } });
  engine.setFormOperators({ lib, world, operators: [{ from: 'blorp {x1}', to: '{x1}', admitted: true }] });
  const send = async (t) => { const s = engine.createSession({ language: 'en' }); s.setWorldState('ui.shell', { activeTab: 'talk' }); return s.send(t); };
  const off = await send('blorp add 3 apples');
  assert.ok(off.segments[0].unparsed, 'off: the clause stays unread');
  process.env.PSYS2_FORMOPS = 'on';
  try {
    const on = await send('blorp add 3 apples');
    assert.equal(on.segments[0].variant?.via, 'form-operator');
    assert.equal(on.segments[0].variant.to, 'add 3 apples');
    const none = await send('blorp zzz qqq');
    assert.ok(none.segments[0].unparsed, 'on: a rewrite the rules do not read leaves the clause whole');
  } finally { delete process.env.PSYS2_FORMOPS; engine.setFormOperators(null); }
});

test('inverse operators (PSYS2_CANON=on): the learnt filler words are dropped from the edges of an unread clause; off by default; the world decides', async () => {
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } });
  engine.setFormOperators({ lib, world, operators: [], fillers: ['blorp', 'hey'] });
  const send = async (t) => { const s = engine.createSession({ language: 'en' }); s.setWorldState('ui.shell', { activeTab: 'talk' }); return s.send(t); };
  assert.ok((await send('blorp add 3 apples')).segments[0].unparsed, 'off: nothing runs');
  process.env.PSYS2_CANON = 'on';
  try {
    const on = await send('blorp add 3 apples');
    assert.equal(on.segments[0].variant?.via, 'canonical');
    assert.equal(on.segments[0].variant.to, 'add 3 apples');
    assert.ok((await send('blorp zzz qqq')).segments[0].unparsed, 'a clause the rules still do not read stays whole');
  } finally { delete process.env.PSYS2_CANON; engine.setFormOperators(null); }
});
