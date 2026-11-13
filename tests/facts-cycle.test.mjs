// A kind-of cycle in the catalog (the real catalog has "legs" whose senses lead back to "legs") must not make `facts.thing` walk forever: on the online catalog
// "How many legs does a spider have?" ran out of memory. The depth is carried down `drawnAs`, the thing itself is never its own kind and a few kinds are tried at most.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFacts } from '../src/knowledge/facts.mjs';

const SRC = 'core.source="synthetic"';
const files = {
  'index.json': JSON.stringify({ worlds: [{ id: 'k.words', exports: ['k.words.sense'], shards: [{ id: 'k.words/shards/x', path: 'k.words/shards/x.sop', keys: ['legs', 'leg', 'limb'], sources: ['t'] }] }] }),
  'vocab.json': JSON.stringify({ legs: ['k.words/shards/x'], leg: ['k.words/shards/x'], limb: ['k.words/shards/x'] }),
  'k.words/shards/x.sop': [
    `@a k.words.sense word=legs pos=noun n=1 gloss="plural of leg" is_a=leg is_a=legs ${SRC}`,
    `@b k.words.sense word=leg pos=noun n=1 gloss="a limb" is_a=legs is_a=limb ${SRC}`,
    `@c k.words.sense word=limb pos=noun n=1 gloss="a part" is_a=leg ${SRC}`,
  ].join('\n') + '\n',
};

test('a kind-of cycle ends: thing() of every word in it settles, with no drawing', async () => {
  const f = createFacts({ source: { text: async (p) => files[p] ?? null } });
  for (const w of ['legs', 'leg', 'limb']) {
    const th = await Promise.race([f.thing(w), new Promise((_, rej) => setTimeout(() => rej(new Error(`thing(${w}) did not settle`)), 3000))]);
    assert.equal(th.name, w);
    assert.equal(th.objects.length, 0);
  }
  assert.ok(f.stats.lookups < 20, `a bounded number of lookups (${f.stats.lookups})`);
});
