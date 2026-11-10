// Compute budgets (spec 06 "Compute budgets"): the counter, the shared handle, the turn-level catch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine, TOO_COMPLEX } from '../src/dialog/index.mjs';
import { createBudget, BudgetExceeded, UNLIMITED, budget, installBudget, releaseBudget, isBudgetExceeded } from '../src/dialog/budget.mjs';
import { BUDGET_LIMITS } from '../src/dialog/budget-limits.mjs';

test('createBudget: counts per site and per turn, throws BudgetExceeded with site and ticks', () => {
  const b = createBudget({ perSite: 10, perTurn: 15 });
  b.tick('a', 5); b.tick('b', 5);
  assert.equal(b.ticks, 10);
  assert.deepEqual({ ...b.bySite }, { a: 5, b: 5 });
  assert.throws(() => b.tick('a', 6), (e) => e instanceof BudgetExceeded && e.name === 'BudgetExceeded' && e.site === 'a' && e.ticks === 11 && e.limit === 'site');
  const c = createBudget({ perSite: 100, perTurn: 15 });
  c.tick('x', 10);
  assert.throws(() => c.tick('y', 10), (e) => isBudgetExceeded(e) && e.site === 'y' && e.limit === 'turn');
  assert.ok(c.exceeded, 'the first excess is remembered');
  assert.throws(() => c.tick('x'), BudgetExceeded, 'every later tick throws again (a swallowed exception cannot buy more work)');
});

test('per-site limits override the default; defaults are generous and the no-op budget never throws', () => {
  const b = createBudget({ perSite: 1000, sites: { tight: 2 } });
  b.tick('loose', 500);
  b.tick('tight', 2);
  assert.throws(() => b.tick('tight'), BudgetExceeded);
  for (let i = 0; i < 1e5; i++) UNLIMITED.tick('anything');
  assert.equal(UNLIMITED.ticks, 0);
  assert.ok(BUDGET_LIMITS.perTurn >= BUDGET_LIMITS.perSite && BUDGET_LIMITS.perSite >= 100000);
});

test('the shared handle: ticks go to the installed budget, outside a turn they are free, nested installs join', () => {
  budget.tick('outside', 1e9);   // no budget installed: a no-op
  const b = createBudget({ perSite: 3 });
  const t = installBudget(b);
  assert.ok(t);
  assert.equal(installBudget(createBudget()), null, 'a nested install joins the turn in progress');
  budget.tick('s', 3);
  assert.equal(b.bySite.s, 3);
  assert.throws(() => budget.tick('s'), BudgetExceeded);
  releaseBudget(t);
  budget.tick('s', 100);   // released: free again
  assert.equal(budget.active, false);
});

test('a turn that runs out of budget answers "too complex", undoes itself and reports the site; the next turn works', async () => {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  const s = engine.createSession({ formalizer: 'rules' });
  const before = JSON.stringify(s.state());
  const reply = await s.send('draw a green house and a red sun', { budget: createBudget({ perTurn: 40 }) });
  assert.equal(reply.tooComplex, true);
  assert.equal(reply.text, TOO_COMPLEX);
  assert.ok(reply.budget.exceeded.site && reply.budget.exceeded.ticks > 0, 'site and ticks are reportable');
  assert.equal(reply.trace.budget.exceeded.site, reply.budget.exceeded.site);
  const r = reply.budgetExceeded;   // the record for the phrase log: where the loop is
  assert.equal(r.site, reply.budget.exceeded.site);
  assert.equal(r.input, 'draw a green house and a red sun');
  assert.ok(r.bySite[r.site] > 0 && Object.keys(r.bySite).length >= 1, 'per-site tick table');
  assert.ok(Array.isArray(r.stack) && r.stack.length > 0 && 'tab' in r && 'stage' in r, 'caller id, tab and stage');
  assert.deepEqual(reply.trace.budgetExceeded, r);
  assert.deepEqual(reply.effects, []);
  assert.equal(JSON.stringify(s.state()), before, 'nothing of the turn remains');
  assert.equal(budget.active, false, 'the budget is released');
  const ok = await s.send('draw a green house');
  assert.ok(!ok.tooComplex);
  assert.ok(ok.budget.ticks > 0 && !ok.budget.exceeded, 'a normal turn reports its ticks');
});

test('an operation gets the budget as ctx.budget', async () => {
  const { bundleEngine, mini } = await import('./helpers.mjs');
  const ops = "export const spin = (ctx) => { for (let i = 0; i < 1e6; i++) ctx.budget.tick('test.spin'); return i; };";
  const engine = await bundleEngine({ 'test.spin': mini('test.spin', { opsSrc: ops }) });
  const s = engine.createSession({ formalizer: 'rules' });
  const b = createBudget({ perSite: 50 });
  const t = installBudget(b);
  try { engine.interp.hook(s.isession, 'test.spin', 'spin'); } finally { releaseBudget(t); }   // hook swallows the error; the budget remembers it
  assert.equal(b.exceeded?.site, 'test.spin');
});
