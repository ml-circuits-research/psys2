import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createDispatcherFormalizer } from '../src/dialog/encoder-dispatch.mjs';

/** Scripted dispatcher runtime: text -> prediction (the real model is exercised by scripts/verify-dispatcher-js.mjs). */
const W = (...pairs) => pairs.map(([world, score]) => ({ world, score }));
const fakeRuntime = (script) => ({ worlds: ['kids.arith', 'games.chess', 'kids.animals'], async predict(text, ctx) { return { text, context: ctx, boundaries: [], segmentations: script(text, ctx) }; } });
const loadEngine = async (runtime, policy) => {
  const enc = createDispatcherFormalizer({ load: async () => runtime, ...(policy ? { getPolicy: () => policy } : {}) });
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), formalizers: { encoder: enc } });
  enc.attach(engine);
  return { engine, enc };
};

test('encoder strategy: a wrong first world is recovered by validation and the wires are the rule wires', async () => {
  const t = 'What is 20 divided by 4';
  const { engine, enc } = await loadEngine(fakeRuntime((text) => [{ score: -0.1, segments: [{ start: 0, end: text.length, text, worlds: W(['games.chess', 0.6], ['kids.arith', 0.35], ['kids.animals', 0.05]) }] }]));
  const states = [];
  enc.onStatus((s) => states.push(s.state));
  const session = engine.createSession({ formalizer: 'encoder' });
  const r = await session.send(t);
  assert.match(r.text, /5/);
  assert.deepEqual(states.slice(0, 1), ['idle']);
  assert.ok(states.includes('loading') && states.at(-1) === 'ready');
  assert.deepEqual(r.trace.formalizer.used, ['encoder']);
  assert.equal(r.trace.dispatch.status, 'understood');
  assert.match(r.trace.dispatch.why, /candidate world 2 \(kids.arith\) recovered/);
  assert.equal(r.trace.segments[0].dispatch.world, 'kids.arith');
  assert.equal(r.trace.segments[0].match.worldId, 'kids.arith');
  const rules = await engine.createSession({ formalizer: 'rules' }).send(t);
  assert.equal(r.text, rules.text);
});

test('encoder strategy: two pieces from the winning segmentation, in order', async () => {
  const a = 'What is 20 divided by 4.', b = 'A zebra has 4 legs.', t = `${a} ${b}`;
  const { engine } = await loadEngine(fakeRuntime((text) => [
    { score: -0.1, segments: [{ start: 0, end: text.length, text, worlds: W(['kids.arith', 0.9]) }] },
    { score: -0.9, segments: [{ start: 0, end: a.length, text: a, worlds: W(['kids.arith', 0.9]) }, { start: a.length + 1, end: text.length, text: b, worlds: W(['kids.animals', 0.8]) }] },
  ]));
  const r = await engine.createSession({ formalizer: 'encoder' }).send(t);
  assert.equal(r.trace.dispatch.winnerIndex, 1);
  assert.deepEqual(r.trace.segments.map((s) => s.dispatch.world), ['kids.arith', 'kids.animals']);
  assert.deepEqual(r.trace.segments.map((s) => s.span[0]), [0, a.length + 1]);
  assert.ok(r.statuses.length >= 1 && r.statuses.every((x) => x === 'supported')); assert.match(r.text, /is 5\..*zebra has 4 legs/);   // both pieces answered (a taught fact shares the status of its message)
});

test('encoder strategy: a piece nobody validates falls back to the rules over all worlds', async () => {
  const t = 'What is 7 times 6';
  const { engine } = await loadEngine(fakeRuntime((text) => [{ score: -0.1, segments: [{ start: 0, end: text.length, text, worlds: W(['games.chess', 0.8], ['kids.animals', 0.2]) }] }]));
  const r = await engine.createSession({ formalizer: 'encoder' }).send(t);
  assert.equal(r.trace.dispatch.status, 'not_understood');
  assert.match(r.text, /42/);
  assert.deepEqual(r.trace.formalizer.used, ['rules']);
});

test('encoder strategy: a failing model load falls back to the rules and reports the error', async () => {
  const enc = createDispatcherFormalizer({ load: async () => { throw new Error('model file missing'); } });
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), formalizers: { encoder: enc } });
  enc.attach(engine);
  const r = await engine.createSession({ formalizer: 'encoder' }).send('What is 7 times 6');
  assert.match(r.text, /42/);
  assert.equal(r.trace.formalizer.error, 'model file missing');
  assert.equal(enc.status.state, 'error');
  assert.equal(await enc.available(), false);
  enc.retry();
  assert.equal(enc.status.state, 'idle');
});
