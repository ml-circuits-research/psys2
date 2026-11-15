// LEARNED-MEM-INDEX (spec 06 "Compute budgets", spec 23): the knowledge overlay reads the session memory through an index built once per contents of the memory,
// not by scanning every wire on every catalog lookup. Real long draw sessions (real set r0092, r0098, r0632 in the shipped mode) ran out of the step budget at
// `learned.mem` because each of the ~2 000 lookups of a turn scanned the whole memory (it grows with the picture): the ticks grew with lookups x wires.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';
import { withLearned } from '../src/knowledge/learned.mjs';
import { WireStore } from '../src/interpreter/memory.mjs';
import { createBudget, installBudget, releaseBudget } from '../src/dialog/budget.mjs';

const CAT = path.resolve(import.meta.dirname, 'fixtures/catalog');
const catalog = () => createFacts({ source: { text: async (p) => { try { return readFileSync(path.join(CAT, p), 'utf8'); } catch { return null; } } } });
const S = (v) => ({ kind: 'string', v });
const wire = (id, type, f) => ({ id, type, entries: Object.entries(f).map(([k, v]) => ({ key: `${type}.${k}`, value: S(v) })) });

test('lookups cost one tick per candidate word, the memory is indexed once per contents; an added wire is seen at once; a clone shares the index', () => {
  const store = new WireStore();
  for (let i = 0; i < 200; i++) store.add(wire(`o${i}`, 'art.draw.object', { name: `thing${i}`, color: 'red' }));
  store.add(wire('pet1', 'kids.pets.pet', { kind: 'dog', called: 'Rex' }));
  const kn = withLearned(catalog(), () => [], () => store.all(), () => store);
  const b = createBudget({ sites: { 'learned.mem': 2000 } });   // two builds (one tick per wire) and about 100 lookups; a scan per lookup would need over 20 000
  const t = installBudget(b);
  try {
    for (let i = 0; i < 100; i++) kn.peek(i % 2 ? 'rex' : 'thing7');
    assert.ok(kn.peek('rex')?.learned, 'a record of the memory is read by name');
    assert.deepEqual(kn.own('dog'), [{ kind: 'dog', name: 'Rex' }]);
    store.add(wire('pet2', 'kids.pets.pet', { kind: 'cat', called: 'Tom' }));   // the memory changes: the next lookup sees it
    assert.ok(kn.peek('tom')?.learned);
    const c = store.clone();                                                     // a dry-run clone with the same contents: no rebuild
    const before = b.bySite['learned.mem'];
    withLearned(catalog(), () => [], () => c.all(), () => c).peek('tom');
    assert.ok(b.bySite['learned.mem'] - before <= 3, `the clone reused the index (${b.bySite['learned.mem'] - before} ticks)`);
  } finally { releaseBudget(t); }
  assert.ok(b.bySite['learned.mem'] < 1000, `learned.mem ${b.bySite['learned.mem']}`);
});

test('a long draw session: a turn reads the catalog overlay with a learned.mem budget linear in the memory, not in lookups x memory', async () => {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  engine.setKnowledge(catalog());
  const s = engine.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { activeTab: 'draw' });
  for (const m of ['draw a house', 'draw a tree', 'draw a red car', 'draw a sun', 'draw a dog', 'draw a cat', 'draw a girl', 'draw a boy', 'draw a flower', 'draw a bird']) {
    await s.send(m); await s.send(m.replace(/^draw an? (red )?/, 'draw another '));
  }
  const wires = s.isession.memory.own.all().length;
  assert.ok(wires >= 30, `memory ${wires}`);
  // injected budget: 60 ticks per memory wire (the old scan per lookup took about 2 400 per wire on this turn)
  const r = await s.send('move the house on the right further to the right', { budget: createBudget({ sites: { 'learned.mem': 60 * wires } }) });
  assert.notEqual(r.tooComplex, true, JSON.stringify(r.budgetExceeded ?? null));
  assert.match(r.text, /moved/i);
  // the turn guard still holds: with the site starved the turn is too complex and changes nothing
  const before = JSON.stringify(s.isession.state['art.draw']);
  const starved = await s.send('move the tree to the left', { budget: createBudget({ sites: { 'learned.mem': 1 } }) });
  assert.equal(starved.tooComplex, true);
  assert.equal(starved.budgetExceeded?.site, 'learned.mem');
  assert.equal(JSON.stringify(s.isession.state['art.draw']), before);
});
