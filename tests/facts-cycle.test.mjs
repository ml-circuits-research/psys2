// A kind-of cycle in the catalog (the real catalog has "legs" whose senses lead back to "legs") must not make `facts.thing` walk forever: on the online catalog
// "How many legs does a spider have?" ran out of memory. The depth is carried down `drawnAs`, the thing itself is never its own kind and a few kinds are tried at most.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFacts } from '../src/knowledge/facts.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

// INVARIANT against a slice of the online catalog (sop-knowledge-worlds b705b3c; tests/fixtures/catalog-cycle: the k.words senses reachable from "legs" and "leg" by is_a,
// the real wires): every word of the slice settles, one walk visits a lemma at most once and at most 12 lemmas (MAX_WALK_STEPS), and the work is bounded.
const SLICE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'catalog-cycle');
const sliceSource = { text: async (p) => { try { return readFileSync(join(SLICE, p), 'utf8'); } catch { return null; } } };
const settle = (p, w) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`thing(${w}) did not settle`)), 5000))]);

test('online catalog slice: every word settles, one lemma once per walk, a step budget per walk', async () => {
  const f = createFacts({ source: sliceSource });
  const words = Object.keys(JSON.parse(readFileSync(join(SLICE, 'vocab.json'), 'utf8')));
  assert.ok(words.includes('legs') && words.includes('leg') && words.length > 50, 'the slice holds the legs / leg senses and what they lead to');
  let prev = 0;
  for (const w of words) {
    const th = await settle(f.thing(w), w);
    assert.ok(th === null || typeof th.name === 'string', `thing(${w}) settled`);
    const used = f.stats.lookups - prev; prev = f.stats.lookups;
    assert.ok(used <= 12, `one walk (${w}) looks up at most 12 lemmas, not ${used}`);
  }
  assert.ok(f.stats.maxWalk <= 12, `longest walk ${f.stats.maxWalk} lemmas`);
  assert.ok(f.stats.lookups <= words.length * 12, `total lookups bounded (${f.stats.lookups})`);
});
