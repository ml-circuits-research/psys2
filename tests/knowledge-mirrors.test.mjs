// SPDX-License-Identifier: AGPL-3.0-only
// The pinned catalog route survives a failing source (P4, live finding 2026-11-15: jsDelivr answered 403 for one shard of the pinned commit in 1 of 4 page loads and the drawing
// tab drew part of the scene while the reply listed everything). src/loaders/knowledge-source.mjs retries a required file and falls back to the next mirror of the same commit
// (src/knowledge/catalog-pin.mjs KNOWLEDGE_URLS); a file no mirror serves is an error, not an empty answer; the reading with a failing first mirror is the reading with a good one;
// with every mirror failing, the drawing board says the catalog did not answer instead of drawing or listing the thing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKnowledgeSource, resetMirrorHealth, mirrorStates } from '../src/loaders/knowledge-source.mjs';
import { KNOWLEDGE_URLS, CATALOG_PIN } from '../src/knowledge/catalog-pin.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/catalog');
const realFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = realFetch; });
test.beforeEach(() => resetMirrorHealth());   // the health of a mirror lives for the JS context: each test starts with fresh mirrors
const A = 'https://a.invalid/worlds', B = 'https://b.invalid/worlds';
const res = (status, body = '') => ({ ok: status >= 200 && status < 300, status, text: async () => body });
// a thing the board has no drawing of its own for (not in things.catalog.mjs): its drawing is only in the catalog
const ZEPPELIN = '@k.objects.zeppelin k.objects.object name=zeppelin\n@k.objects.zeppelin.body k.objects.part of=zeppelin name=body shape=ellipse x=5 y=30 w=90 h=40 z=1 colour=grey\n@k.objects.zeppelin.fin k.objects.part of=zeppelin name=fin shape=triangle x=80 y=20 w=15 h=20 z=2 colour=red\n';
const fixture = (p) => {
  if (p === 'vocab.json') { const v = JSON.parse(readFileSync(join(FIX, p), 'utf8')); v.zeppelin = ['k.objects/shards/zeppelin']; return res(200, JSON.stringify(v)); }
  if (p === 'k.objects/shards/zeppelin.sop') return res(200, ZEPPELIN);
  return existsSync(join(FIX, p)) ? res(200, readFileSync(join(FIX, p), 'utf8')) : res(404);
};
/** fetch over the fixture catalog: `rule(base, path, n)` answers a status to fail with (n: the how-many-th ask of that URL), or null to serve the file. */
const fakeFetch = (rule, log = []) => async (url) => {
  const u = String(url), base = u.startsWith(A) ? A : B, p = u.slice(base.length + 1);
  log.push(u); const n = log.filter((x) => x === u).length;
  const st = rule(base, p, n);
  if (st === 'throw') throw new TypeError('fetch failed');
  if (st === 'size') return res(403, 'Package size exceeded the configured limit of 50 MB. Try https://github.com/... instead.');   // jsDelivr's refusal of a repository past 50 MB
  return st ? res(st) : fixture(p);
};
const noSleep = async () => {};

test('the pin has two immutable mirrors of one commit: raw.githubusercontent.com, then jsDelivr', () => {
  assert.equal(KNOWLEDGE_URLS.length, 2);
  for (const u of KNOWLEDGE_URLS) assert.ok(u.includes(CATALOG_PIN.commit) && u.endsWith(CATALOG_PIN.path), u);
  assert.match(KNOWLEDGE_URLS[0], /^https:\/\/raw\.githubusercontent\.com\//, 'first: jsDelivr refuses a repository past 50 MB');
  assert.match(KNOWLEDGE_URLS[1], /^https:\/\/cdn\.jsdelivr\.net\/gh\//);
});

test('a 403 from the first mirror is served by the second, with the same text, without asking the first again', async () => {
  const log = [];
  globalThis.fetch = fakeFetch((base, p) => (base === A && p.startsWith('k.objects/') ? 403 : null), log);
  const src = createKnowledgeSource([A, B], { sleep: noSleep });
  const want = readFileSync(join(FIX, 'k.objects/shards/sky.sop'), 'utf8');
  assert.equal(await src.text('k.objects/shards/sky.sop'), want);
  assert.deepEqual(log, [`${A}/k.objects/shards/sky.sop`, `${B}/k.objects/shards/sky.sop`], 'one ask of the first mirror, then the second');
});

// live 2026-11-15: jsDelivr answered 403 "Package size exceeded the configured limit of 50 MB" for every shard of the new pin; each shard was asked twice there (36 console errors)
test('a 403 with the package-size message kills the mirror for the session: every later file goes straight to the next mirror', async () => {
  const log = [];
  globalThis.fetch = fakeFetch((base) => (base === A ? 'size' : null), log);
  const src = createKnowledgeSource([A, B], { sleep: noSleep });
  const files = ['k.objects/shards/sky.sop', 'k.objects/shards/nature.sop', 'index.json'];
  for (const f of files) assert.equal(await src.text(f), readFileSync(join(FIX, f), 'utf8'), `${f}: the text of a good mirror`);
  assert.equal(log.filter((u) => u.startsWith(A)).length, 1, 'the dead mirror was asked once in all');
  assert.equal(mirrorStates()[A].state, 'dead');
  assert.match(mirrorStates()[A].why, /package size/);
  const again = createKnowledgeSource([A, B], { sleep: noSleep });   // another source of the same page (the drawing tab, the avatar): the mirror is dead for it too
  await again.text('k.objects/shards/sky.sop');
  assert.equal(log.filter((u) => u.startsWith(A)).length, 1);
});

test('any 403 on the first file of a mirror kills it; a 403 after it served files only skips it for that file', async () => {
  const log = [];
  globalThis.fetch = fakeFetch((base) => (base === A ? 403 : null), log);
  const src = createKnowledgeSource([A, B], { sleep: noSleep });
  await src.text('k.objects/shards/sky.sop');
  await src.text('k.objects/shards/nature.sop');
  assert.deepEqual(log, [`${A}/k.objects/shards/sky.sop`, `${B}/k.objects/shards/sky.sop`, `${B}/k.objects/shards/nature.sop`]);
  resetMirrorHealth();
  const log2 = [];
  globalThis.fetch = fakeFetch((base, p) => (base === A && p === 'k.objects/shards/sky.sop' ? 403 : null), log2);
  const src2 = createKnowledgeSource([A, B], { sleep: noSleep });
  await src2.text('index.json');   // A serves: it is alive
  await src2.text('k.objects/shards/sky.sop');   // one refusal of a live mirror: the next mirror for this file
  await src2.text('k.objects/shards/nature.sop');   // A is still asked
  assert.deepEqual(log2, [`${A}/index.json`, `${A}/k.objects/shards/sky.sop`, `${B}/k.objects/shards/sky.sop`, `${A}/k.objects/shards/nature.sop`]);
});

test('reads asked together wait for the first answer of an untried mirror: a dead mirror costs one request, not one per shard', async () => {
  const log = [];
  globalThis.fetch = fakeFetch((base) => (base === A ? 'size' : null), log);
  const src = createKnowledgeSource([A, B], { sleep: noSleep });
  const files = ['k.objects/shards/sky.sop', 'k.objects/shards/nature.sop', 'index.json', 'vocab.json'];
  const got = await Promise.all(files.map((f) => src.text(f)));
  assert.ok(got.every((t) => typeof t === 'string' && t.length));
  assert.equal(log.filter((u) => u.startsWith(A)).length, 1, 'one request to the dead mirror');
  assert.equal(log.filter((u) => u.startsWith(B)).length, files.length);
});

test('every mirror dead: each is still asked once per file (a last resort), and a file none serves is an error', async () => {
  const log = [];
  globalThis.fetch = fakeFetch(() => 'size', log);
  const src = createKnowledgeSource([A, B], { sleep: noSleep });
  await assert.rejects(() => src.text('k.objects/shards/sky.sop'), /HTTP 403/);
  await assert.rejects(() => src.text('k.objects/shards/nature.sop'), /HTTP 403/);
  assert.equal(log.length, 4, 'one ask of each mirror per file');
  globalThis.fetch = fakeFetch(() => null, log);   // the CDN serves again later in the session: the last resort still reads it
  assert.ok((await src.text('k.objects/shards/sky.sop')).includes('name=sun'));
});

test('a transient failure is asked again on the same mirror (backoff), a network error too', async () => {
  const waits = [];
  globalThis.fetch = fakeFetch((base, p, n) => (base === A && n === 1 ? (p.endsWith('sky.sop') ? 503 : 'throw') : null));
  const src = createKnowledgeSource([A, B], { sleep: async (ms) => { waits.push(ms); } });
  assert.ok((await src.text('k.objects/shards/sky.sop')).includes('k.objects.object name=sun'));
  assert.ok((await src.text('k.objects/shards/nature.sop')).includes('name=tree'));
  assert.deepEqual(waits, [400, 400]);
});

test('a file absent from every mirror is null; a file no mirror serves is an error, not an empty answer', async () => {
  globalThis.fetch = fakeFetch(() => null);
  const src = createKnowledgeSource([A, B], { sleep: noSleep });
  assert.equal(await src.text('k.objects/shards/no-such-shard.sop'), null);
  globalThis.fetch = fakeFetch(() => 403);
  await assert.rejects(() => src.text('k.objects/shards/sky.sop'), /HTTP 403/);
  globalThis.fetch = fakeFetch((base) => (base === A ? 404 : 'throw'));   // gone from one, unreachable on the other: not "absent"
  await assert.rejects(() => src.text('k.objects/shards/sky.sop'), /fetch failed/);
});

async function drawWith(rule, said) {
  globalThis.fetch = fakeFetch(rule);
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } });
  engine.setKnowledge(createFacts({ source: createKnowledgeSource([A, B], { sleep: noSleep }) }));
  const s = engine.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { activeTab: 'draw' });
  const r = await s.send(said);
  return { text: r.text, objects: s.state()['art.draw'].objects.map((o) => o.thing ?? o.kind) };
}

test('every mirror failing: the board says the catalog did not answer, and draws and lists nothing it has no drawing for', async () => {
  const r = await drawWith((base, p) => (p.startsWith('k.objects/shards/') ? 403 : null), 'draw a zeppelin');
  assert.deepEqual(r.objects, []);
  assert.match(r.text, /can't reach the picture catalog/);
  assert.doesNotMatch(r.text, /I drew/);
});

test('the first mirror failing: the reading and the reply are those of a good catalog', async () => {
  const good = await drawWith(() => null, 'draw a zeppelin');
  const bad = await drawWith((base, p) => (base === A && p.startsWith('k.objects/') ? 403 : null), 'draw a zeppelin');
  assert.match(good.text, /zeppelin/);
  assert.deepEqual(good.objects, ['zeppelin']);
  assert.deepEqual(bad, good);
});
