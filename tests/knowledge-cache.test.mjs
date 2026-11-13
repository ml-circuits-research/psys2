// Cache Storage for the catalog (spec 17 section 5): versioned cache, cache first, update pick-up; the notice while a shard loads; the offline reply.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCachedSource } from '../src/loaders/knowledge-cache.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';

/** A CacheStorage in memory (the parts the module uses). */
const fakeCaches = () => {
  const all = new Map();
  return {
    open: async (n) => { if (!all.has(n)) all.set(n, new Map()); const m = all.get(n); return { match: async (k) => (m.has(k) ? new Response(m.get(k)) : undefined), put: async (k, r) => { m.set(k, await r.text()); } }; },
    keys: async () => [...all.keys()], delete: async (n) => all.delete(n), all,
  };
};
const catalog = (version, files = {}) => { const reads = []; return { reads, text: async (p) => { reads.push(p); return p === 'index.json' ? JSON.stringify({ version }) : files[p] ?? null; } }; };

test('cache: files are fetched once, then served from the versioned cache; a new catalog version replaces the cache', async () => {
  const caches = fakeCaches();
  const v1 = catalog('aaa', { 'vocab.json': '{"pineapple":["s1"]}', 's1.sop': '@x' });
  const a = createCachedSource({ source: v1, caches });
  assert.equal(await a.text('vocab.json'), '{"pineapple":["s1"]}');
  assert.equal(await a.text('s1.sop'), '@x');
  assert.deepEqual([...caches.all.keys()].sort(), ['psys2-knowledge-aaa', 'psys2-knowledge-meta']);
  // the next session: the previous version answers at once, nothing is fetched but the version check
  const b = createCachedSource({ source: v1, caches });
  v1.reads.length = 0;
  assert.equal(await b.text('s1.sop'), '@x');
  assert.deepEqual(v1.reads.filter((p) => p !== 'index.json'), []);
  // the catalog was updated: the check finds the new version, the old cache is deleted, the file is fetched again
  const v2 = catalog('bbb', { 'vocab.json': '{"pineapple":["s2"]}' });
  const c = createCachedSource({ source: v2, caches });
  await c.text('vocab.json');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(await c.text('vocab.json'), '{"pineapple":["s2"]}');
  assert.deepEqual([...caches.all.keys()].sort(), ['psys2-knowledge-bbb', 'psys2-knowledge-meta']);
});

test('cache: offline serves what is cached, never caches a failed read, and no CacheStorage means the plain source', async () => {
  const caches = fakeCaches();
  const on = catalog('aaa', { 's1.sop': '@x' });
  await createCachedSource({ source: on, caches }).text('s1.sop');
  const off = { text: async () => { throw new Error('offline'); } };
  const s = createCachedSource({ source: off, caches });
  assert.equal(await s.text('s1.sop'), '@x');
  await assert.rejects(() => s.text('s2.sop'));
  assert.equal([...caches.all.get('psys2-knowledge-aaa').keys()].length, 1);
  assert.equal(createCachedSource({ source: on, caches: null }), on);
});

test('offline: the catalog says it is unreachable, and a thing to draw is answered with the plain offline line', async () => {
  const down = createFacts({ source: { text: async () => null } });
  assert.equal(await down.thing('pineapple'), null);
  assert.equal(down.unreachable(), true);
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } });
  engine.setKnowledge(down);
  const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
  const r = await s.send('draw a pineapple');
  assert.match(r.text, /I can't reach the picture catalog right now, so I can only draw the basic things\./);
});

test('a slow lookup of a thing to draw tells the user first, a fast one says nothing', async () => {
  const files = { 'vocab.json': JSON.stringify({ pineapple: ['k.objects/shards/fruit'] }), 'k.objects/shards/fruit.sop': ['@k.objects.pineapple k.objects.object name=pineapple', '@k.objects.pineapple.body k.objects.part of=pineapple name=body shape=circle x=0 y=10 w=60 h=80 z=1 colour=yellow'].join('\n') };
  const run = async (delay) => {
    const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } });
    engine.setKnowledge(createFacts({ source: { text: async (p) => { await new Promise((r) => setTimeout(r, delay)); return files[p] ?? null; } } }));
    const notices = []; engine.onNotice = (t) => notices.push(t);
    const s = engine.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
    const r = await s.send('draw a pineapple');
    return { notices, reply: r.text };
  };
  const slow = await run(300);   // vocab and shard: about 600 ms in all
  assert.deepEqual(slow.notices, ['Looking up how a pineapple looks…']);
  assert.match(slow.reply, /pineapple/i);
  assert.deepEqual((await run(0)).notices, []);
});
