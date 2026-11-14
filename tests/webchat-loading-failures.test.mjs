// "Something did not load" on the published page (2026-11-14): the Romanian model was blocked by CORS (Mozilla's Google bucket allows localhost only) and the page asked the
// engine worker for an op ('catalog') that did not exist, so the catalog was always "unreachable". These checks pin both causes and the retries.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createCachedFetch } from '../docs/webchat/ui/translation-ui.mjs';
import { createProgress } from '../docs/webchat/ui/progress.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';
import { knowledgeTimeoutMs } from '../src/loaders/knowledge-source.mjs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('every op the page calls on the engine worker exists in the worker', () => {
  const app = read('docs/webchat/app.mjs') + read('docs/webchat/ui/engine-client.mjs');
  const worker = read('docs/webchat/ui/engine-worker.mjs');
  const called = new Set([...app.matchAll(/engineClient\.call\('([\w-]+)'/g)].map((m) => m[1]));
  assert.ok(called.has('catalog'));
  for (const op of called) assert.ok(new RegExp(`async (${op}|'${op}')\\(`).test(worker), `engine-worker.mjs has no handler for the op "${op}" the page calls`);
});

test('Romanian (the saved language of the owner) has every model file mirrored on the page host: the Google bucket is blocked by CORS off localhost', () => {
  const reg = JSON.parse(read('docs/webchat/vendor/bergamot/registry.json'));
  for (const dir of ['fromEn', 'toEn']) for (const f of Object.values(reg.langs.ro[dir].files)) {
    assert.match(f.mirror ?? '', /^models-mt\/ro\//, 'mirror path');
    assert.equal(statSync(new URL(`../docs/webchat/${f.mirror}`, import.meta.url)).size, f.bytes, `${f.mirror} is the registry's file`);
  }
});

function fakeCache() {
  const m = new Map();
  return { open: async () => ({ match: async (u) => m.get(u), put: async (u, r) => { m.set(u, r); }, delete: async (u) => m.delete(u) }), _m: m };
}
const bytes = (s) => new TextEncoder().encode(s);

test('model download: the mirror answers first when the bucket is blocked; the bucket is the fallback; nothing hangs when both fail', async () => {
  const saved = globalThis.caches; globalThis.caches = fakeCache();
  try {
    const seen = [];
    const gz = async (t) => new Response(new Blob([bytes(t)]).stream().pipeThrough(new CompressionStream('gzip')));
    const fetchFn = async (u) => { seen.push(u); if (u.startsWith('https://bucket')) throw new TypeError('Failed to fetch'); return gz('payload'); };
    const ff = createCachedFetch({ cacheName: 't1', fetchFn, sleep: async () => {} });
    assert.equal(new TextDecoder().decode(await ff('https://bucket/x.gz', { mirror: 'https://page/models-mt/x.gz' })), 'payload');
    assert.deepEqual(seen, ['https://page/models-mt/x.gz']);
    assert.equal(new TextDecoder().decode(await ff('https://bucket/x.gz', { mirror: 'https://page/models-mt/x.gz' })), 'payload');
    assert.equal(seen.length, 1, 'second read comes from Cache Storage');
    // no mirror (a language that is not mirrored): the blocked bucket is tried twice, then the error is plain
    const dead = createCachedFetch({ cacheName: 't2', fetchFn, sleep: async () => {} });
    await assert.rejects(dead('https://bucket/y.gz'), /no connection to the model server/);
    // the mirror itself is down: the bucket answers
    const f2 = createCachedFetch({ cacheName: 't3', fetchFn: async (u) => { if (u.includes('mirror')) throw new TypeError('x'); return gz('b'); }, sleep: async () => {} });
    assert.equal(new TextDecoder().decode(await f2('https://ok/z.gz', { mirror: 'https://mirror/z.gz' })), 'b');
  } finally { globalThis.caches = saved; }
});

test('an unreachable catalog is asked again at once on refresh() and answers; the notice resolves', async () => {
  let up = false;
  const files = { 'index.json': JSON.stringify({ worlds: [] }), 'vocab.json': JSON.stringify({ apple: [] }) };
  const f = createFacts({ source: { text: async (p) => (up ? files[p] ?? null : null) } });
  await f.loadVocab();
  assert.equal(f.unreachable(), true);
  up = true;
  assert.equal(f.refresh(), true);
  await f.loadVocab();
  assert.equal(f.unreachable(), false);
  assert.equal(f.refresh(), false, 'nothing to reset when the catalog answers');

  const pg = createProgress({ storage: null, document: null });
  let retried = 0;
  pg.fail('catalog', 'The picture catalog could not be reached', 'basic drawings', { retry: () => { retried++; } });
  assert.equal(pg.view().failures.length, 1);
  pg.resolve('catalog');
  assert.equal(pg.view().failures.length, 0);
  assert.equal(retried, 0);
});

test('the index and the vocabulary get a longer bound than a shard (slow phones)', () => {
  assert.ok(knowledgeTimeoutMs('vocab.json') >= 20000 && knowledgeTimeoutMs('index.json') >= 20000);
  assert.ok(knowledgeTimeoutMs('k.animals/shards/birds.sop') >= 6000);
});
