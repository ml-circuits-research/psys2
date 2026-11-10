// World helpers without a ctx reach the turn budget through the global handle (COMPUTE-BUDGET D item 1): placement, layout, routing and solvers are ticked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createBudget, installBudget, releaseBudget, BudgetExceeded, BUDGET_GLOBAL } from '../src/dialog/budget.mjs';
import { parseNP } from '../worlds/art.draw/ops.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });

test('the global handle is the shared budget: a world file ticks the budget of the turn in progress, and is a no-op outside a turn', () => {
  assert.equal(typeof globalThis[BUDGET_GLOBAL].tick, 'function');
  assert.doesNotThrow(() => parseNP('the big red tree on the left'));   // no turn: nothing is counted, nothing throws
  const b = createBudget({ sites: { 'art.np': 1 } });
  const t = installBudget(b);
  try {
    assert.throws(() => parseNP('the eyes of the cat of the house'), (e) => e instanceof BudgetExceeded && e.site === 'art.np');
    assert.ok(b.bySite['art.np'] >= 2);
  } finally { releaseBudget(t); }
});

const turn = (budget) => async (s, text) => s.send(text, { budget });

test('a drawing placement that runs out of budget ends the turn as too complex and leaves the picture as it was', async () => {
  const s = engine.createSession({ language: 'en' });
  await s.send('open the drawing tab');
  await s.send('draw a house');
  const before = JSON.stringify(s.isession.state['art.draw']);
  const r = await turn(createBudget({ sites: { 'art.place': 1 } }))(s, 'draw a tree');
  assert.equal(r.tooComplex, true);
  assert.equal(r.budgetExceeded?.site, 'art.place');
  assert.equal(JSON.stringify(s.isession.state['art.draw']), before);
  const ok = await s.send('draw a tree');
  assert.doesNotMatch(ok.text, /too complex/);
});

test('the diagram engine\'s layout is ticked (a layout that runs out of budget ends the turn as too complex)', async () => {
  const s = engine.createSession({ language: 'en' });
  await s.send('open the diagram tab');
  await s.send('draw four boxes');
  const b = createBudget();
  const ok = await s.send('arrange them in a circle', { budget: b });
  assert.doesNotMatch(ok.text, /too complex/);
  assert.ok((b.bySite['diagram.layout'] ?? 0) > 0, `layout ticks ${JSON.stringify(b.bySite)}`);
  const r = await turn(createBudget({ sites: { 'diagram.layout': 1 } }))(s, 'arrange them in a row');
  assert.equal(r.tooComplex, true);
  assert.equal(r.budgetExceeded?.site, 'diagram.layout');
});
