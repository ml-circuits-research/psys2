// NX integration (ADR-009): strategy selection, fallback, the untrained-world rule, ORT paused -> rules. The model itself is replaced by stubs here;
// the real model is measured by scripts/eval-nx.mjs (system webchat-<strategy>).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createRuntime, sessionOptions, RUNTIME_DEFAULTS } from '../src/dialog/runtime-config.mjs';
import { createNxStrategy, normalizeNxStrategy, DEFAULT_NX_STRATEGY, NX_GATES } from '../src/formalizer/nx.mjs';
import { migrateSettings, DEFAULT_SETTINGS } from '../docs/webchat/ui/settings.mjs';

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const rules = engine.formalizers.rules;

/** An encoder whose answer is the rules' (the dispatcher is not under test) and a recording stub of the NX facade. */
function setup({ available = true, untrained = false, complete = true, refineThrows = false } = {}) {
  const calls = [];
  engine.formalizers.encoder = { id: 'encoder', available: () => true, supports: () => true, ready: () => true, formalize: (t, o) => rules.formalize(t, o) };
  engine.formalizers.nx = {
    available: () => available,
    untrainedReads: () => { calls.push('untrained'); return untrained; },
    async formalize(t, o) {
      calls.push('formalize');
      if (!complete) return { complete: false, segments: [], wires: [] };
      const r = rules.formalize(t, { ...o, session: o.session.clone() });
      return { complete: true, segments: r.segments.map((s) => ({ ...s, strategy: 'model', reading: 'model', nxFrom: 'model' })), wires: r.wires };
    },
    async refine(res) { calls.push('refine'); if (refineThrows) throw new Error('boom'); return res; },
  };
  return calls;
}
const send = (nx, text, extra = {}) => engine.createSession({ formalizer: 'encoder', nx, language: 'en', ...extra }).send(text);
const GOOD = 'add milk to my list';
const NONSENSE = 'flurble wibble zzz qux';

test('the default strategy is one constant, rules (2026-11-14); unknown values fall back to it', () => {
  assert.equal(DEFAULT_NX_STRATEGY, 'rules');
  assert.equal(RUNTIME_DEFAULTS.nxStrategy, 'rules');
  assert.equal(DEFAULT_SETTINGS.nxStrategy, 'rules');
  for (const v of ['hybrid', 'neural', 'rules']) assert.equal(normalizeNxStrategy(v), v);
  assert.equal(normalizeNxStrategy('x'), 'rules');
  assert.equal(sessionOptions({ ...RUNTIME_DEFAULTS, nxStrategy: 'neural' }).nx, 'neural');
  assert.equal(migrateSettings({ nxStrategy: 'bogus', settingsVersion: 2 }).settings.nxStrategy, 'rules');
  assert.equal(migrateSettings({ nxStrategy: 'neural', settingsVersion: 2 }).settings.nxStrategy, 'rules', 'an older saved strategy is reset to rules (2026-11-14)');
    assert.equal(migrateSettings(null).settings.nxStrategy, 'rules');
});

test('the gates are the NX7 ones: hybrid tau_op 0.99, tau_frame 0.9, negation guard; neural keeps the negation guard', () => {
  assert.deepEqual({ ...NX_GATES.hybrid }, { tauOp: 0.99, tauFrame: 0.9, spans: true, noNeg: true });
  assert.equal(NX_GATES.neural.noNeg, true);
});

test('rules: the model is never asked', async () => {
  const calls = setup();
  const r = await send('rules', NONSENSE);
  await send('rules', GOOD);
  assert.deepEqual(calls, []);
  assert.equal(r.trace.formalizer.nx.strategy, 'rules');
});

test('hybrid: a message the rules path read is not given to the model; an unparsed one is', async () => {
  let calls = setup();
  const r = await send('hybrid', GOOD);
  assert.deepEqual(calls, []);
  assert.equal(r.trace.formalizer.nx.by, 'rules');
  calls = setup();
  await send('hybrid', NONSENSE);
  assert.deepEqual(calls, ['refine']);
});

test('hybrid: a failing model keeps the rules answer', async () => {
  setup({ refineThrows: true });
  const r = await send('hybrid', NONSENSE);
  assert.ok(r.segments.every((s) => s.unparsed));
  assert.equal(r.trace.formalizer.nx.by, 'rules');
});

test('neural: the model reads first and its segments are marked "model"', async () => {
  const calls = setup();
  const r = await send('neural', GOOD);
  assert.deepEqual(calls, ['untrained', 'formalize']);
  assert.deepEqual(r.trace.segments.map((s) => s.reading), ['model']);
  assert.equal(r.trace.formalizer.nx.by, 'model');
  assert.match(r.text, /milk/i);
});

test('neural: when the model does not read every segment the rules path answers exactly as today', async () => {
  const calls = setup({ complete: false });
  const r = await send('neural', GOOD);
  assert.deepEqual(calls, ['untrained', 'formalize']);
  assert.deepEqual(r.trace.segments.map((s) => s.reading), ['rules']);
  assert.equal(r.trace.formalizer.nx.by, 'rules');
  assert.match(r.text, /milk/i);
});

test('neural: a message an untrained world reads (user.profile) is left to the rules, the model is not asked to read it', async () => {
  const calls = setup({ untrained: true });
  const r = await send('neural', GOOD);
  assert.deepEqual(calls, ['untrained']);
  assert.equal(r.trace.formalizer.nx.by, 'rules');
});

test('ORT paused (or the model not ready): the rules answer and the model is not touched', async () => {
  for (const nx of ['hybrid', 'neural']) {
    const calls = setup({ available: false });
    const r = await send(nx, NONSENSE);
    assert.deepEqual(calls, []);
    assert.equal(r.trace.formalizer.nx.model, false);
  }
});

test('with the rules formalizer chosen no model is used, whatever the strategy', async () => {
  const calls = setup();
  await engine.createSession({ formalizer: 'rules', nx: 'neural', language: 'en' }).send(GOOD);
  assert.deepEqual(calls, []);
});

// ---- the strategy over a fake runtime ------------------------------------------------------------------------------------------------------
const fakeMeta = { ops: ['none', 'request:tasks.add'], labels: ['O'], trained_worlds: ['kids.tasks'] };
const fakeRuntime = (nx = null) => ({ rankFull: async () => ({ worlds: [], nx }), segment: async () => ({ enc: { offsets: [] }, probs: [] }) });

test('the untrained-world rule: user.profile is not a trained world, its rules read the text', () => {
  const nx = createNxStrategy({ runtime: fakeRuntime(), meta: fakeMeta });
  nx.attach(engine);
  const s = engine.createSession({ language: 'en' });
  const o = { worlds: engine.set, session: s.isession, context: s.context(), router: engine.router };
  assert.equal(nx.untrainedReads('I work at Acme', o), true);
  assert.equal(nx.untrainedReads(GOOD, o), false);
  // the pattern index never offers a pattern of an untrained world as a candidate
  assert.ok(![...nx.model.trained].includes('user.profile'));
});

test('a model without the heads reads nothing (the rules keep their answer)', async () => {
  const nx = createNxStrategy({ runtime: fakeRuntime(null), meta: fakeMeta });
  nx.attach(engine);
  const s = engine.createSession({ language: 'en' });
  const r = await nx.readSegment({ text: GOOD, start: 0, end: GOOD.length }, engine.set, s.isession, { source: 't', context: s.context(), ctx: { tab: null, recent_worlds: [] }, router: engine.router, acc: { f: s.isession.clone() }, gate: NX_GATES.hybrid });
  assert.equal(r.seg, null);
  assert.equal(r.why, 'no heads');
});

test('createRuntime: the NX facade is unavailable while ORT is paused and before the model loads', () => {
  let paused = false;
  const e2 = { formalizers: {}, interp: engine.interp };
  createRuntime({ engine: e2, settings: { ...RUNTIME_DEFAULTS }, load: async () => { throw new Error('not loaded'); }, isPaused: () => paused });
  assert.equal(e2.formalizers.nx.available(), false);   // not loaded: no heads
  paused = true;
  assert.equal(e2.formalizers.nx.available(), false);
  assert.equal(e2.formalizers.nx.untrainedReads('x', {}), false);
});
