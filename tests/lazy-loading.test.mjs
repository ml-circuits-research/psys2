// SPDX-License-Identifier: AGPL-3.0-only
// LAZY LOADING (specs/06 "Lazy loading"): the routing index replaces the worlds bundle, a start loads the shell, the open tab's world and nothing of the other tabs' (no vendor asset), a message loads
// the worlds its words name, an incomplete first reading is read again with every world (so it equals the full reading), and a lazy fetch that fails never changes a reading.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildWebchat, VENDOR_OF } from '../scripts/build-webchat.mjs';
import { createWorldLoader } from '../docs/webchat/ui/world-loader.mjs';

let ctx = null;
async function setup() {
  if (ctx) return ctx;
  const out = await mkdtemp(path.join(tmpdir(), 'psys2-lazy-'));
  await buildWebchat({ outDir: out });
  const url = (p) => pathToFileURL(path.join(out, p)).href;
  const [{ createBundleLoader }, { createEngine }, rules, wordIdx] = await Promise.all([import(url('lib/loaders/bundle-loader.mjs')), import(url('lib/dialog/index.mjs')), import(url('lib/formalizer/rules/index.mjs')), import(url('lib/worlds/word-index.mjs'))]);
  const index = JSON.parse(await readFile(path.join(out, 'worlds/index.json'), 'utf8'));
  const failing = new Set();
  const fetched = [];
  const fetchJson = async (rel, hash) => {
    fetched.push(rel);
    if ([...failing].some((f) => rel.includes(f))) throw new Error(`HTTP 503 ${rel}`);
    const text = await readFile(path.join(out, rel), 'utf8');
    if (hash && rel !== 'worlds/index.json') assert.equal(createHash('sha256').update(text).digest('hex').slice(0, 10), hash, `${rel}: the hash of the index is the hash of the file`);
    return JSON.parse(text);
  };
  const bag = (t) => new Set([...rules.messageBag(t), ...wordIdx.queryWords(t)]);
  ctx = { out, url, index, createBundleLoader, createEngine, fetchJson, fetched, failing, bag, absModule: (p) => url(p) };
  return ctx;
}
test.after(async () => { if (ctx) await rm(ctx.out, { recursive: true, force: true }); });

const lazyEngine = async (c, tabWorld) => {
  const wl = createWorldLoader({ indexHash: null, fetchJson: c.fetchJson, bag: c.bag });
  await wl.init();
  const loaded = new Set();
  const start = [...wl.startIds({ tabWorld })];
  await wl.bundles(start); start.forEach((i) => loaded.add(i));
  const engine = await c.createEngine({ loader: c.createBundleLoader(wl.bundleOf(start, c.absModule)) });
  let session = engine.createSession({ language: 'en' });
  const state = { engine, wl, loaded, get session() { return session; } };
  /** What the worker does (docs/webchat/ui/engine-worker.mjs ensureWorlds): fetch, replace the world set, give the session its state and memory back. A failed fetch changes nothing. */
  state.ensure = async (ids) => {
    const want = wl.closure([...ids]);
    const missing = [...want].filter((i) => !loaded.has(i));
    if (!missing.length) return [];
    try { await wl.bundles(want); } catch { return []; }
    const st = structuredClone(session.state()), mem = session.memoryJSON();
    await engine.reload(c.createBundleLoader(wl.bundleOf([...loaded, ...missing], c.absModule)));
    missing.forEach((i) => loaded.add(i));
    session = engine.createSession({ language: 'en' });
    session.isession.state = st; session.restoreMemory(mem);
    return missing;
  };
  const incomplete = (r) => !r.segments?.length || r.segments.some((x) => x.unparsed || x.corrections?.length || x.ignored?.length) || (r.statuses ?? []).some((x) => x !== 'supported');
  state.send = async (text) => {
    const plan = await wl.plan(text);
    await state.ensure(plan.ids);
    const snap = session.snapshot();
    let r = await session.send(text, { undo: snap });
    if (incomplete(r) && loaded.size < wl.ids().length) {
      session.restore(snap);
      const added = await state.ensure(wl.ids());
      if (added.length) { r = await session.send(text); } else r = await session.send(text);
    }
    return r;
  };
  return state;
};

test('the routing index is small and every hash in it is the hash of its file', async () => {
  const c = await setup();
  const size = (await readFile(path.join(c.out, 'worlds/index.json'))).length;
  assert.ok(size < 60000, `worlds/index.json is ${size} bytes (it was the 4.6 MB bundle)`);
  assert.ok(c.index.always.includes('ui.shell') && c.index.always.includes('lang.common'));
  assert.ok(Object.keys(c.index.words.buckets).length > 50);
  const wl = createWorldLoader({ indexHash: null, fetchJson: c.fetchJson, bag: c.bag });
  await wl.init();
  await wl.bundles(wl.ids());   // the fetch asserts the hash of every bundle
  for (const [bk, h] of Object.entries(c.index.words.buckets).slice(0, 40)) await c.fetchJson(`worlds/words/${bk}.json`, h);
});

test('a start loads the always-loaded worlds and the open tab\'s world, and no other world with vendor assets', async () => {
  const c = await setup();
  const wl = createWorldLoader({ indexHash: null, fetchJson: c.fetchJson, bag: c.bag });
  await wl.init();
  for (const tab of ['ui.avatar', 'geo.map', 'games.chess']) {
    const ids = [...wl.startIds({ tabWorld: tab })];
    for (const id of ids) assert.ok(c.index.always.includes(id) || wl.closure([tab]).has(id), `${id} is not part of the start with ${tab} open`);
    const withVendor = ids.filter((id) => (VENDOR_OF[id] ?? []).length);
    assert.deepEqual(withVendor.filter((id) => id !== tab), [], `no other world's vendor assets at a start with ${tab} open`);
    assert.ok(ids.length < 25, `${ids.length} worlds`);
  }
  for (const id of c.index.always) assert.deepEqual(VENDOR_OF[id] ?? [], [], `${id} is always loaded and has no vendor assets`);
});

test('the words of a message name the worlds it needs; the name of a tab loads its world', async () => {
  const c = await setup();
  const wl = createWorldLoader({ indexHash: null, fetchJson: c.fetchJson, bag: c.bag });
  await wl.init();
  const need = async (t) => [...(await wl.plan(t)).ids];
  assert.ok((await need('open the map')).includes('geo.map'));
  assert.ok((await need('let us play chess')).includes('games.chess'));
  assert.ok((await need('open the drawing board')).includes('art.draw'));
  const hello = await need('hello');
  assert.ok(hello.length <= 2 && !hello.includes('games.chess'), `hello needs ${hello.join(',')}`);
  const before = c.fetched.length;
  await wl.plan('open the map');
  assert.equal(c.fetched.length, before, 'a bucket is fetched once');
});

test('the lazy engine reads like the full engine: complete readings directly, incomplete ones again with every world', async () => {
  const c = await setup();
  const full = await c.createEngine({ loader: c.createBundleLoader(await (async () => { const wl = createWorldLoader({ indexHash: null, fetchJson: c.fetchJson, bag: c.bag }); await wl.init(); await wl.bundles(wl.ids()); return wl.bundleOf(wl.ids(), c.absModule); })()) });
  const fs_ = full.createSession({ language: 'en' });
  const lazy = await lazyEngine(c, 'ui.avatar');
  const startSize = lazy.loaded.size;
  for (const text of ['hello', 'What is 7 plus 5?', 'open the map', 'what is the weather today', 'How many legs does a spider have?', 'put a hat on the avatar']) {
    const want = await fs_.send(text), got = await lazy.send(text);
    assert.equal(got.text, want.text, `"${text}"`);
  }
  assert.ok(lazy.loaded.size > startSize, 'worlds loaded on demand');
});

test('a lazy fetch that fails never changes a reading: the engine reads with the worlds it has, as an engine that never had the others', async () => {
  const c = await setup();
  const a = await lazyEngine(c, 'ui.avatar'), b = await lazyEngine(c, 'ui.avatar');   // the same start
  c.failing.add('/bundle.json');   // from now on no world can be fetched (the network is gone)
  try {
    for (const text of ['What is 7 plus 5?', 'open the map', 'show me paris', 'what is the weather today', 'hello']) {
      const ra = await a.send(text);                       // plans, fails to fetch, reads again, fails again: reads with what it has
      const rb = await b.session.send(text);               // an engine that only ever had the start worlds
      assert.equal(ra.text, rb.text, `"${text}"`);
    }
    assert.equal(a.loaded.size, b.loaded.size, 'nothing was added by the failed fetches');
  } finally { c.failing.clear(); }
});
