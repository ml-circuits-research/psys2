// SPDX-License-Identifier: AGPL-3.0-only
// Turn lifecycle (spec 06 "Turn lifecycle"): abort signal, hard and soft deadlines, undo snapshot, bounded awaits, fuzzed turns settle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { guard, TurnAborted, withDeadline } from '../src/formalizer/guard.mjs';
import { restrictedSet } from '../src/formalizer/spell.mjs';
import { addNoise, rng } from '../scripts/fuzz-turns.mjs';

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: createTranslator() });
const OPTS = { language: 'en', formalizer: 'rules', spell: true, partial: true, bestEffort: true };
const fresh = (tab = null) => { const s = engine.createSession(OPTS); if (tab) s.setWorldState('ui.shell', { activeTab: tab }); return s; };
/** A translator whose language detection never settles: the turn can only end through the guard. */
const stuckEngine = async () => {
  const t = createTranslator();
  return createEngine({ loader: createFsLoader(DEFAULT_ROOT), translator: { ...t, detectLanguage: () => new Promise(() => {}), evidence: t.evidence?.bind(t), leftovers: t.leftovers?.bind(t), supports: t.supports?.bind(t), translate: t.translate.bind(t) } });
};

test('withDeadline: always settles', async () => {
  await assert.rejects(withDeadline(new Promise(() => {}), 30, { label: 'x' }), /timed out after 30 ms/);
  const ctl = new AbortController();
  const p = withDeadline(new Promise(() => {}), 5000, { signal: ctl.signal });
  setTimeout(() => ctl.abort(new DOMException('stopped', 'AbortError')), 10);
  await assert.rejects(p, (e) => e instanceof TurnAborted && e.reason === 'stopped');
  assert.equal(await withDeadline(Promise.resolve(7), 50), 7);
});

test('a stuck await in the turn is cut by the hard deadline, and the session is restored', async () => {
  const e2 = await stuckEngine();
  const s = e2.createSession({ ...OPTS, language: 'auto' });
  const before = JSON.stringify(s.state());
  const t0 = performance.now();
  await assert.rejects(s.send('make a house and a man', { signal: new AbortController().signal, hardMs: 300, softMs: 200 }), (e) => e instanceof TurnAborted && e.reason === 'timeout' && e.stage === 'detect');
  assert.ok(performance.now() - t0 < 1500, 'settled near the deadline');
  assert.equal(JSON.stringify(s.state()), before);
  assert.equal(guard.active, false, 'the guard is released');
});

test('Stop (AbortSignal) during a turn: TurnAborted(stopped), state exactly as before, the next message works', async () => {
  const e2 = await stuckEngine();
  const s = e2.createSession({ ...OPTS, language: 'auto' });
  s.setWorldState('ui.shell', { activeTab: 'robot' });
  const before = JSON.stringify(s.state());
  const ctl = new AbortController();
  setTimeout(() => ctl.abort(new DOMException('stopped by the user', 'AbortError')), 50);
  await assert.rejects(s.send('make a house and a man', { signal: ctl.signal, hardMs: 8000 }), (e) => e instanceof TurnAborted && e.reason === 'stopped');
  assert.equal(JSON.stringify(s.state()), before);
  const r = await s.send('hello', { language: 'en' });
  assert.ok(r.text);
});

test('an already aborted signal changes nothing', async () => {
  const s = fresh('robot');
  const before = JSON.stringify(s.state());
  const ctl = new AbortController(); ctl.abort(new DOMException('stopped', 'AbortError'));
  await assert.rejects(s.send('make a house and a man', { signal: ctl.signal }), TurnAborted);
  assert.equal(JSON.stringify(s.state()), before);
  assert.equal(guard.active, false);
});

test('abort in the middle of a turn that already changed the state (host undo snapshot) restores the state', async () => {
  const s = fresh('robot');
  const undo = s.snapshot();
  const before = JSON.stringify(s.state());
  const reply = await s.send('make a house and a man');
  assert.notEqual(JSON.stringify(s.state()), before, 'the turn changed the state');
  s.restore(undo);
  assert.equal(JSON.stringify(s.state()), before);
  assert.equal(s._msg, undo.msg);
});

test('softMs is accepted but has no clock: the reading is the same as without it (no throw)', async () => {
  // INVARIANT: independent of machine load. The guard runs on an injected clock that never advances, so no wall-clock limit can trip.
  const frozen = () => 0;
  const say = (opts) => fresh().send('if i add eight and seven what do i gte', { clock: frozen, signal: new AbortController().signal, hardMs: 20000, ...opts }).then((r) => r.text);
  assert.equal(await say({ softMs: 0 }), await say({}));
});

test('the guard trips on an injected clock, not on the wall clock', async () => {
  let t = 0;
  const clock = () => t;
  const token = guard.install({ clock, hardMs: 100, force: true });
  try {
    guard.check('a');
    assert.equal(guard.remaining(), 100);
    t = 101;
    assert.throws(() => guard.check('b'), (e) => e instanceof TurnAborted && e.reason === 'timeout' && e.stage === 'b');
  } finally { guard.release(token); }
});

test('restrictedSet is memoized per world set (the HANG task root of slow typo turns)', () => {
  const a = restrictedSet(engine.set, ['kids.arith']);
  const b = restrictedSet(engine.set, ['kids.arith']);
  assert.equal(a, b);
  assert.notEqual(a, restrictedSet(engine.set, ['games.tictactoe']));
});

test('fuzz: noisy messages always settle within the budget', async () => {
  const rand = rng(11);
  const base = ['make a house and a man', 'get me to New York', 'show me Paris', 'what is 3 plus 4', 'draw a red house', 'play tic tac toe', 'make it like a girl', 'add 4 and 8', 'how many legs does a spider have'];
  const BUDGET = 8000;
  const s = fresh();
  for (let i = 0; i < 60; i++) {
    const text = addNoise(base[Math.floor(rand() * base.length)], rand);
    const t0 = performance.now();
    try { await s.send(text, { signal: new AbortController().signal, hardMs: BUDGET, softMs: BUDGET * 0.65 }); } catch (e) { assert.ok(e instanceof TurnAborted, `${text}: ${e.message}`); }
    assert.ok(performance.now() - t0 < BUDGET + 1500, `${JSON.stringify(text)} took ${Math.round(performance.now() - t0)} ms`);
  }
});
