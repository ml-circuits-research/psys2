// KNOWLEDGE-ALL-WORLDS: the catalog is read generically through its index (type, keys, core.source): a world added to a catalog is usable with no change in PSys2.
// Local fixture (tests/fixtures/catalog, same format as the catalog; scripts/make-catalog-fixture.mjs); no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createFacts } from '../src/knowledge/facts.mjs';
import { createKnowledgeSource } from '../src/loaders/knowledge-source.mjs';

const DIR = path.join(import.meta.dirname, 'fixtures/catalog');
const fresh = () => createFacts({ source: createKnowledgeSource(DIR) });

test('any type is read through the index: wires, keys and core.source', async () => {
  const facts = fresh();
  const w = await facts.world('k.demo.fruit');
  assert.equal(w.id, 'k.demo');
  const apple = await facts.wires('k.demo.fruit', { key: 'apple' });
  assert.equal(apple.length, 1);
  assert.deepEqual([apple[0].f.colour, apple[0].f.taste], [['red'], ['sweet']]);
  assert.equal(apple[0].source, 'fixture 1');
  assert.equal((await facts.wires('k.demo.fruit')).length, 2, 'no key: every shard of the world');
  assert.equal((await facts.wires('k.faces.slot')).length, 16, 'the same call reads the faces');
  assert.deepEqual(await facts.wires('k.nothing.here'), []);
});

test('a world added to the catalog is usable with no PSys2 change', async () => {
  const files = new Map();
  const base = createKnowledgeSource(DIR);
  const source = { text: async (p) => files.get(p) ?? base.text(p) };
  const index = JSON.parse(await base.text('index.json')), vocab = JSON.parse(await base.text('vocab.json'));
  index.worlds.push({ id: 'k.zoo', version: '1', exports: ['k.zoo.keeper'], shards: [{ id: 'k.zoo/shards/staff', path: 'k.zoo/shards/staff.sop', keys: ['ana'], sources: ['t-1'] }] });
  vocab.ana = ['k.zoo/shards/staff'];
  files.set('index.json', JSON.stringify(index)); files.set('vocab.json', JSON.stringify(vocab));
  files.set('k.zoo/shards/staff.sop', '@k.zoo.ana k.zoo.keeper name=ana job=feeds core.source="t 1"');
  const facts = createFacts({ source });
  const keepers = await facts.wires('k.zoo.keeper', { key: 'ana' });
  assert.equal(keepers[0].f.job[0], 'feeds');
  const th = await facts.thing('ana');
  assert.ok(th.wires.some((x) => x.type === 'k.zoo.keeper'), 'a lookup of the word also shows the wires of the new world');
});

test('a thing with no drawing is drawn by the object of its kind: stand_in, then the kind of its word sense', async () => {
  const facts = fresh();
  const villa = await facts.thing('villa');
  assert.equal(villa.drawnAs, 'house');
  assert.equal(villa.drawnVia, 'stand_in');
  assert.equal(villa.objects[0].parts.length, 2);
  const mansion = await facts.thing('mansion');
  assert.deepEqual([mansion.drawnAs, mansion.drawnVia], ['house', 'is_a']);
  const house = await facts.thing('house');
  assert.equal(house.drawnAs, undefined, 'a thing with its own drawing is not a stand-in');
});

// P3: "draw a villa" over the fixture catalog (a villa is a kind of house: "a villa, drawn as a house") gets the capability list ("I can draw a house, ..."): on the failure ledger
