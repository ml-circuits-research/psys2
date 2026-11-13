// MODEL-TIMEOUTS (spec 06 "Model timeouts are visible"): a model call that times out and is answered by the rules is counted, listed in the turn's trace and announced
// to the host once per session through `engine.onModelTimeout`. The reading is the rules' reading (identical to a session without a model); deadlines are not changed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine, isModelTimeout } from '../src/dialog/index.mjs';
import { createEncoderFormalizer } from '../src/formalizer/strategy.mjs';
import { OrtTimeout } from '../src/formalizer/ort-client.mjs';

const loader = createFsLoader({ roots: [DEFAULT_ROOT] });
const plain = await createEngine({ loader, options: { reasoner: 'matrix' } });
const ids = plain.set.list().map((w) => w.id);
const readingOf = (r) => JSON.stringify(r.segments.map((x) => [x.match?.worldId ?? null, !!x.unparsed, x.wires?.length ?? 0]));
const base = readingOf(await plain.createSession({ language: 'en' }).send('draw a red house'));

test('isModelTimeout: ORT lane timeouts and aborted fetches, not other errors', () => {
  assert.ok(isModelTimeout(new OrtTimeout('dispatcher', 3000)));
  assert.ok(isModelTimeout(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })));
  assert.ok(!isModelTimeout(new Error('HTTP 500')));
  assert.ok(!isModelTimeout(null));
});

test('encoder timeout: the rules answer, the turn says so, the host is told once per session, the count grows', async () => {
  const fetchImpl = (url, init) => {
    if (String(url).endsWith('/health')) return Promise.resolve({ ok: true, json: async () => ({ ok: true, worlds: ids }) });
    return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }))));
  };
  const encoder = createEncoderFormalizer({ endpoint: 'http://model.invalid', fetchImpl, timeoutMs: 5 });
  const engine = await createEngine({ loader, options: { reasoner: 'matrix' }, formalizers: { encoder } });
  const told = [];
  engine.onModelTimeout = (i) => told.push(i);
  const s = engine.createSession({ language: 'en', formalizer: 'encoder' });
  const r1 = await s.send('draw a red house');
  assert.equal(readingOf(r1), base, 'the rules read it exactly as without a model');
  assert.equal(r1.trace.formalizer.modelTimeouts?.[0]?.stage, 'encoder');
  assert.equal(r1.trace.formalizer.modelTimeoutCount, 1);
  const r2 = await s.send('draw a blue house');
  assert.equal(r2.trace.formalizer.modelTimeoutCount, 2);
  assert.deepEqual(told.map((t) => [t.first, t.count]), [[true, 1], [false, 2]], 'first is true once per session');
  assert.equal(engine.modelStats.timeouts, 2);
  const other = engine.createSession({ language: 'en', formalizer: 'encoder' });
  await other.send('draw a red house');
  assert.equal(told.at(-1).first, true, 'a new session is told again');
});

test('dispatcher (nx) timeout is recorded; a plain model error is not a timeout', async () => {
  let err = new OrtTimeout('dispatcher', 3000);
  const nx = { available: () => true, untrainedReads: () => false, formalize: async () => { throw err; }, refine: async () => { throw err; } };
  const engine = await createEngine({ loader, options: { reasoner: 'matrix' }, formalizers: { nx } });
  const s = engine.createSession({ language: 'en', formalizer: 'encoder', nx: 'neural' });
  const r = await s.send('draw a red house');
  assert.equal(readingOf(r), base);
  assert.equal(r.trace.formalizer.modelTimeouts?.[0]?.stage, 'nx');
  err = new Error('model exploded');
  const r2 = await s.send('draw a blue house');
  assert.equal(r2.trace.formalizer.modelTimeouts, undefined);
  assert.equal(r2.trace.formalizer.modelTimeoutCount, 1);
});

test('no model call, no count', async () => {
  const r = await plain.createSession({ language: 'en' }).send('draw a red house');
  assert.equal(r.trace.formalizer.modelTimeoutCount, 0);
});
