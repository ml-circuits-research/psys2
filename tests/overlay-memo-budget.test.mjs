// OVERLAY-MEMO (spec 06 "Compute budgets"): the knowledge overlay keeps what `peek`, `ancestors` and the readers that derive from them (a thing's aspects in session.things,
// where a kind lives) answered while the catalog's settled lookups, the lessons and the session memory are the same. Before, every operation call of a turn synced every
// object of the picture (its aspects: a peek of the kind, its ancestors, a peek of each ancestor), and the drawing board asked where each kind lives for every object near
// every spot it tried: the same turn cost more with every object drawn (real set, shipped mode: learned.mem grew 6x from the first turns of a session to the late ones).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';
import { withLearned } from '../src/knowledge/learned.mjs';
import { habitat } from '../src/knowledge/commonsense.mjs';
import { WireStore } from '../src/interpreter/memory.mjs';
import { createBudget, installBudget, releaseBudget } from '../src/dialog/budget.mjs';

const CAT = path.resolve(import.meta.dirname, 'fixtures/catalog');
const catalog = () => createFacts({ source: { text: async (p) => { try { return readFileSync(path.join(CAT, p), 'utf8'); } catch { return null; } } } });
const S = (v) => ({ kind: 'string', v });
const wire = (id, type, f) => ({ id, type, entries: Object.entries(f).map(([k, v]) => ({ key: `${type}.${k}`, value: S(v) })) });

test('peek, ancestors and memo answer from the cache until the catalog, a lesson or the memory changes; copies are handed out', async () => {
  const cat = catalog();
  await cat.thing('house'); await cat.thing('villa');
  const lines = [], store = new WireStore();
  const kn = withLearned(cat, () => lines, () => store.all(), () => store);
  let builds = 0;
  const memo = () => kn.memo('t', 'house', () => { builds++; return { n: builds }; });
  assert.equal(memo().n, 1); assert.equal(memo().n, 1, 'kept while nothing changed');
  const a1 = kn.ancestors('villa'); a1.push('junk');
  assert.ok(!kn.ancestors('villa').includes('junk'), 'ancestors are a copy');
  store.add(wire('p1', 'kids.pets.pet', { kind: 'dog', called: 'Rex' }));    // the memory changes
  assert.equal(memo().n, 2);
  assert.ok(kn.peek('rex')?.learned, 'a new memory record is read at once');
  const r = kn.peek('rex'); r.senses.push('junk'); r.wires.push('junk');
  assert.ok(!kn.peek('rex').senses.includes('junk') && !kn.peek('rex').wires.includes('junk'), 'a merged record is a copy');
  lines.push('@learned.1 k.commonsense.thing name="house" at="water" core.source="user"');   // a lesson
  assert.equal(memo().n, 3);
  const zones = habitat(kn, 'house').zones;
  assert.ok(zones.includes('water'), `the lesson is read at once (${zones})`);
  assert.equal(kn.peek('tree'), undefined);
  await cat.thing('tree');                                                    // a lookup settles in the catalog
  assert.equal(memo().n, 4);
  assert.notEqual(kn.peek('tree'), undefined, 'a settled lookup is read at once');
  const h = habitat(kn, 'house'); h.zones.push('sky');
  assert.deepEqual(habitat(kn, 'house').zones, zones, 'habitat hands out a copy');
});

test('a long draw session: the same turn costs about the same at 12 and at 48 objects (learned.mem, things.aspects, commonsense.habitat do not grow with the picture)', async () => {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  engine.setKnowledge(catalog());
  const s = engine.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { activeTab: 'draw' });
  const grow = ['draw a house', 'draw a tree', 'draw a red car', 'draw a sun', 'draw a dog', 'draw a cat', 'draw a girl', 'draw a boy', 'draw a flower', 'draw a bird', 'draw a fish', 'draw a cloud'];
  const SITES = ['learned.mem', 'things.aspects', 'commonsense.habitat'];
  const probe = async (limits) => {
    const snap = s.snapshot();
    const b = createBudget(limits);
    const r = await s.send('make the tree bigger', { budget: b });
    s.restore(snap);
    return { r, ticks: Object.fromEntries(SITES.map((k) => [k, b.bySite[k] ?? 0])) };
  };
  for (const m of grow) await s.send(m);
  const small = await probe({});
  for (let i = 0; i < 3; i++) for (const m of grow) await s.send(m);
  const objs = s.isession.state['art.draw'].objects.length;
  assert.ok(objs >= 40, `objects ${objs}`);
  // injected budget: the 12-object turn's ticks at these sites plus 20 per object added (the old code needed several hundred more per object)
  const added = objs - 12;
  const limits = { sites: Object.fromEntries(SITES.map((k) => [k, small.ticks[k] + 20 * added + 50])) };
  const big = await probe(limits);
  assert.notEqual(big.r.tooComplex, true, `${JSON.stringify(big.r.budgetExceeded ?? null)} small ${JSON.stringify(small.ticks)}`);
  assert.match(big.r.text, /bigger/i);
  // the turn guard still holds: with a site starved the turn is too complex and the picture is restored
  const before = JSON.stringify(s.isession.state['art.draw']);
  const starved = await probe({ sites: { 'things.aspects': 1 } });
  assert.equal(starved.r.tooComplex, true);
  assert.equal(JSON.stringify(s.isession.state['art.draw']), before);
});
