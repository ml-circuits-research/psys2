import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createDispatchValidator } from '../src/dialog/dispatch-validate.mjs';
import { reasonOf, REASONS } from '../src/interpreter/index.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const validator = createDispatchValidator({ engine });
const one = (text, worlds) => ({ id: 't', text, context: {}, segmentations: [{ score: 0, segments: [{ start: 0, end: text.length, text, worlds }] }] });
const W = (...p) => p.map(([world, score]) => ({ world, score }));
const envOf = async (text) => { const s = engine.createSession({ language: 'en' }); const r = await s.send(text); return r.answers.map((a) => a.envelope).find((e) => e.status === 'unsupported' || e.status === 'error'); };

/** Run `fn` with the interpreter's resolve replaced by one returning `env` for every wire. */
const withEnvelope = async (env, fn) => {
  const orig = engine.interp.resolve;
  engine.interp.resolve = () => ({ kind: 'request', status: env.status, envelope: env, ops: [] });
  validator.clearCache();
  try { return await fn(); } finally { engine.interp.resolve = orig; validator.clearCache(); }
};

test('reasonOf derives the reason', () => {
  assert.deepEqual(REASONS, ['precondition_failed', 'unknown_argument', 'unsupported_operation', 'execution_error']);
  assert.equal(reasonOf({ status: 'error' }, true), 'execution_error');
  assert.equal(reasonOf({ status: 'unsupported', note: 'no operation for action x' }), 'unsupported_operation');
  assert.equal(reasonOf({ status: 'unsupported', note: 'I do not know a tab called x.' }, true), 'unknown_argument');
  assert.equal(reasonOf({ status: 'unsupported', note: 'The game is over.' }, true), 'precondition_failed');
  assert.equal(reasonOf({ status: 'unsupported', note: 'x', reason: 'unknown_argument' }, true), 'unknown_argument');
  assert.equal(reasonOf({ status: 'supported' }), null);
});

test('interpreter envelopes carry a reason', async () => {
  const bad = await envOf('Make your eyes and body blue');
  assert.equal(bad?.reason, 'unknown_argument');
  const s = engine.createSession({ language: 'en' });
  const env = engine.interp.runAction(s.isession, 'no.such.action', {});
  assert.equal(env.status, 'unsupported');
  assert.equal(env.reason, 'unsupported_operation');
});

test('precondition_failed keeps the reading (accepted as refused)', async () => {
  const r = await withEnvelope({ status: 'unsupported', reason: 'precondition_failed', note: 'The game is over.' }, () => validator.validate(one('Make your eyes blue', W(['ui.avatar', 0.9]))));
  assert.equal(r.status, 'understood');
  const a = r.trace.segmentations[0].pieces[0].attempts[0];
  assert.equal(a.refusal, 'precondition_failed');
  assert.equal(a.refused, true);
});

test('unsupported_operation keeps the reading and reports the limit', async () => {
  const r = await withEnvelope({ status: 'unsupported', reason: 'unsupported_operation', note: 'no operation' }, () => validator.validate(one('Make your eyes blue', W(['ui.avatar', 0.9]))));
  assert.equal(r.status, 'understood');
  const a = r.trace.segmentations[0].pieces[0].attempts[0];
  assert.equal(a.refusal, 'unsupported_operation');
  assert.match(a.reason, /unsupported_operation|valid|parsed/);
});

test('execution_error is never a valid example', async () => {
  const r = await withEnvelope({ status: 'error', reason: 'execution_error', note: 'op threw' }, () => validator.validate(one('Make your eyes blue', W(['ui.avatar', 0.9]))));
  assert.equal(r.status, 'not_understood');
  assert.equal(r.trace.segmentations[0].pieces[0].attempts[0].valid, false);
});

test('unknown_argument is a penalised fallback and never blocks other candidates', async () => {
  const t = 'Make your eyes and body blue';
  const r = await validator.validate(one(t, W(['ui.avatar', 0.9], ['kids.arith', 0.05])));
  const att = r.trace.segmentations[0].pieces[0].attempts;
  const swallow = att.find((a) => a.world === 'ui.avatar' && a.variant === 'original');
  assert.equal(swallow.unknownArg, true);
  assert.ok(att.some((a) => a.world === 'kids.arith'), 'other candidates were still tried');
  assert.ok(swallow.score < Math.log(0.9) - 4, 'carries the unknownArgPenalty');
});

test('probe: unknown eyes "and body blue" does not win when the simplified text or another reading recovers', async () => {
  const t = 'Make your eyes and body blue';
  const r = await validator.validate({ id: 't', text: t, context: {}, segmentations: [{ score: 0, segments: [{ start: 0, end: t.length, text: t, simplified: 'Make your eyes blue', worlds: W(['ui.avatar', 0.9]) }] }] });
  assert.equal(r.status, 'understood');
  assert.equal(r.produced[0].textUsed, 'simplified');
  for (const p of r.produced) assert.doesNotMatch(p.sop, /setPartUnknown/);
  // without any recovery the swallowed reading is only a last-resort fallback, flagged in the trace
  const r2 = await validator.validate(one(t, W(['ui.avatar', 0.9])));
  assert.equal(r2.trace.segmentations[0].pieces[0].attempts[0].unknownArg, true);
});
