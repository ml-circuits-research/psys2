// PERF: the validator checks candidates on copies of a seeded session instead of replaying the history for every candidate.
// The copy must be independent of the original, and a check on a copy must equal a check on a replayed session.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createDispatchValidator } from '../src/dialog/dispatch-validate.mjs';
import { perf } from '../src/formalizer/perf.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const W = (...pairs) => pairs.map(([world, score]) => ({ world, score }));
const msg = (text, session = []) => ({ id: 't', text, context: { tab: null, recent_worlds: [], session }, segmentations: [{ score: -0.1, segments: [{ start: 0, end: text.length, text, worlds: W(['kids.arith', 0.6], ['kids.animals', 0.3], ['kids.shop', 0.1]) }] }] });

test('a forked validation session does not touch the original', async () => {
  const s = engine.createSession({ language: 'en' });
  await s.send('Tom has 5 apples');
  const before = JSON.stringify(s.isession.memory.sessionWires());
  const f = s.forkForValidation();
  engine.formalizers.rules.formalize('Ana has 7 pears', { worlds: engine.set, session: f.isession, source: 'x', context: f.context(), router: engine.router });
  f.isession.state['ui.shell'] = { activeTab: 'zzz' };
  assert.equal(JSON.stringify(s.isession.memory.sessionWires()), before);
  assert.notEqual(s.isession.state['ui.shell']?.activeTab, 'zzz');
});

test('validation on forked sessions gives the same readings as on replayed ones', async () => {
  const history = ['Tom has 5 apples', 'He gives 2 to Ana'];
  const proto = Object.getPrototypeOf(engine.createSession({ language: 'en' }));
  const fork = proto.forkForValidation;
  try {
    for (const t of ['How many apples does Tom have?', 'What is 3 plus 4', 'And 9 minus 2?', 'Does she have any?']) {
      proto.forkForValidation = fork;
      const forked = await createDispatchValidator({ engine }).validate(msg(t, history));
      proto.forkForValidation = () => { throw new Error('replay instead'); };
      const replayed = await createDispatchValidator({ engine }).validate(msg(t, history));
      assert.equal(forked.trace.winnerIndex, replayed.trace.winnerIndex, t);
      assert.equal(JSON.stringify(forked.produced), JSON.stringify(replayed.produced), t);
    }
  } finally { proto.forkForValidation = fork; }
});

test('perf record: stages are counted inside a record and ignored outside', async () => {
  perf.count('outside');
  const s = engine.createSession({ language: 'en' });
  const r = await s.send('What is 3 plus 4');
  assert.ok(r.perf && r.perf.total >= 0);
  assert.ok(r.perf.stages.formalize.n >= 1);
  assert.equal(r.perf.stages.outside, undefined);
  assert.equal(perf.active, false);
});

test('fast path: a single clause the rules read completely skips the model, anything else does not', async () => {
  let calls = 0;
  const rules = engine.formalizers.rules;
  const encoder = { id: 'encoder', available: () => true, supports: () => true, formalize: async (text, opts) => { calls++; return { ...(await rules.formalize(text, opts)), dispatch: null }; } };
  const saved = engine.formalizers.encoder;
  engine.formalizers.encoder = encoder;
  try {
    const s = engine.createSession({ language: 'en', formalizer: 'encoder', fastPath: true });
    const a = await s.send('What is 3 plus 4');
    assert.match(a.text, /7/);
    assert.equal(calls, 0, 'the model is not used');
    assert.ok(a.perf.stages['fast.path']);
    await s.send('What is 3 plus 4 and what is 5 plus 1');
    assert.equal(calls, 1, 'two clauses go to the model');
    const off = engine.createSession({ language: 'en', formalizer: 'encoder', fastPath: false });
    await off.send('What is 3 plus 4');
    assert.equal(calls, 2, 'without the fast path the model is used');
  } finally { engine.formalizers.encoder = saved; }
});
