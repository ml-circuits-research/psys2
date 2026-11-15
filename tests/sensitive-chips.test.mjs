// SPDX-License-Identifier: AGPL-3.0-only
// SENSITIVE THINGS ARE NEVER OFFERED UNASKED (reviewer 2026-11-15 03:35 (a); knowledge Q76: `k.kinds.sensitivity name= sensitive=`). The sampler drops a thing the catalog marks
// sensitive from every list the chips and the dice draw from, and from every sampled item, unless the user named it in the turn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { engineSampler } from '../src/dialog/sampler.mjs';
import { prefetchSensitive, sensitiveMap, dropSensitive, unaskedSensitive, SENSITIVE_TYPE } from '../src/knowledge/sensitive.mjs';
import * as lib from '../src/vendor/sopworld/sopworld.mjs';

const SENSITIVE = [['sword', 'weapon'], ['cannon', 'weapon'], ['beer', 'alcohol'], ['cigarette', 'tobacco'], ['rocket', 'weapon'], ['apple', 'alcohol']];   // rocket and apple: fixture marks on drawable words, so the dice would offer them
const stub = () => {
  const asked = [];
  return {
    asked,
    wires: async (type, { shard } = {}) => { asked.push({ type, shardOk: !!shard && shard({ id: 'k.kinds/shards/sensitive' }) && !shard({ id: 'k.kinds/shards/animals' }) }); return type === SENSITIVE_TYPE ? SENSITIVE.map(([n, s]) => ({ type, f: { name: [n], sensitive: [s] } })) : []; },
    peekVocab: () => Object.fromEntries(['sword', 'cannon', 'beer', 'kite', 'rocket', 'apple', 'balloon'].map((w) => [w, ['k.objects/shards/x']])),
    peekWiresBy: () => undefined,
  };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

test('the filter: the one shard is loaded in the background; a sensitive word is dropped unless the user named it', async () => {
  const k = stub();
  assert.equal(sensitiveMap(k).size, 0, 'nothing known before the shard arrives: nothing dropped by it');
  prefetchSensitive(k); prefetchSensitive(k);
  await tick(); await tick();
  assert.equal(k.asked.length, 1, 'asked once per catalog');
  assert.ok(k.asked[0].shardOk, 'only the sensitive shard, not every shard of k.kinds');
  const map = sensitiveMap(k);
  assert.equal(map.get('sword'), 'weapon');
  assert.deepEqual(dropSensitive(['a sword', 'a kite', 'Add a beer.', 'an apple', '2 cannons'], { map }), ['a kite']);
  assert.deepEqual(dropSensitive(['a sword', 'a kite'], { map, said: 'draw a sword please' }), ['a sword', 'a kite'], 'named in the turn: kept');
  assert.ok(!unaskedSensitive('Add a sword.', { map, said: 'two swords' }), 'the plural names it too');
  assert.deepEqual(dropSensitive([{ text: 'Add a cigarette.' }, { text: 'Add a kite.' }], { map }).map((x) => x.text), ['Add a kite.']);
});

test('the sampler: the dice and the chips of the drawing never offer a sensitive thing the user did not name', async () => {
  const knowledge = stub();
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT), options: { knowledge } });
  const s = engine.createSession({ language: 'en' });
  const sampler = engineSampler(lib, engine, () => s);
  if (!sampler.available) return;
  await tick(); await tick();
  const lists = sampler.knowledgeOf?.('art.draw', { mode: 'one' });
  if (lists?.things) assert.ok(!lists.things.some((t) => /sword|cannon|beer/.test(t)) && lists.things.some((t) => /kite/.test(t)), `dice list: ${lists.things}`);
  const items = [];
  for (let seed = 1; seed <= 40; seed++) { const r = sampler.dice({ worldId: 'art.draw', seed }); if (r) items.push(r.text); items.push(...sampler.sample('one', { worldId: 'art.draw', seed }).map((x) => x.text)); }
  assert.ok(items.length > 0);
  assert.ok(items.some((t) => /\b(?:kite|balloon)\b/i.test(t)), 'the catalog vocabulary is drawn from');
  assert.ok(!items.some((t) => /\b(?:sword|cannon|beer|cigarette|rocket|apple)s?\b/i.test(t)), `no sensitive thing offered: ${items.filter((t) => /sword|cannon|beer|rocket|apple/i.test(t))}`);
});
