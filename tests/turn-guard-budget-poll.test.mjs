// Every budget tick site is a turn-guard cancellation point: a turn busy in synchronous loops ends at its next check when it is stopped
// (abort probe: the page's shared abort cell) or past its hard deadline, without the page terminating the worker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { guard, TurnAborted } from '../src/dialog/turn-guard.mjs';
import { createBudget, GUARD_POLL_TICKS } from '../src/dialog/budget.mjs';

test('budget ticks poll the abort probe', () => {
  let aborted = null;
  const token = guard.install({ hardMs: Infinity });
  guard.setAbortProbe(() => aborted);
  try {
    const b = createBudget();
    for (let i = 0; i < GUARD_POLL_TICKS * 2; i++) b.tick('loop');   // not aborted: no throw
    aborted = 'stopped';
    assert.throws(() => { for (let i = 0; i < GUARD_POLL_TICKS; i++) b.tick('loop'); }, (e) => e instanceof TurnAborted && e.reason === 'stopped');
    assert.equal(guard.soft(), true);
  } finally { guard.setAbortProbe(null); guard.release(token); }
});

test('budget ticks poll the hard deadline', () => {
  let now = 0;
  const token = guard.install({ hardMs: 100, clock: () => now, t0: 0 });
  try {
    const b = createBudget();
    for (let i = 0; i < GUARD_POLL_TICKS; i++) b.tick('loop');
    now = 101;
    assert.throws(() => { for (let i = 0; i < GUARD_POLL_TICKS; i++) b.tick('loop'); }, (e) => e instanceof TurnAborted && e.reason === 'timeout');
  } finally { guard.release(token); }
});

test('outside a turn ticks never throw a TurnAborted', () => {
  const b = createBudget();
  for (let i = 0; i < GUARD_POLL_TICKS * 4; i++) b.tick('loop');
  assert.equal(b.ticks, GUARD_POLL_TICKS * 4);
});
