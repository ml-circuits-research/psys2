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
  ctx = { wordIdx, out, url, index, createBundleLoader, createEngine, fetchJson, fetched, failing, bag, absModule: (p) => url(p) };
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
  const snaps = new Map();   // undo id -> snapshot (the worker's `snaps`)
  const state = { engine, wl, loaded, snaps, get session() { return session; } };
  /** What the worker does (docs/webchat/ui/engine-worker.mjs ensureWorlds): fetch, replace the world set, give the session its state and memory back. A failed fetch changes nothing. */
  state.ensure = async (ids) => {
    const want = wl.closure([...ids]);
    const missing = [...want].filter((i) => !loaded.has(i));
    if (!missing.length) return [];
    try { await wl.bundles(want); } catch { return []; }
    await engine.reload(c.createBundleLoader(wl.bundleOf([...loaded, ...missing], c.absModule)));
    const st = structuredClone(session.state()), mem = session.memoryJSON();   // read after the awaits: what the page set while the worlds loaded is kept
    const old = session, portable = [...snaps].map(([k, sn]) => [k, old.portableSnapshot(sn)]);
    missing.forEach((i) => loaded.add(i));
    session = engine.createSession({ language: 'en' });
    session.isession.state = { ...session.isession.state, ...st }; session.restoreMemory(mem);
    snaps.clear(); for (const [k, rec] of portable) snaps.set(k, session.adoptSnapshot(rec));
    return missing;
  };
  const incomplete = (r) => c.wordIdx.readingIncomplete(r);
  state.send = async (text) => {
    const plan = await wl.plan(text);
    await state.ensure(plan.ids);
    const snap = session.snapshot();
    snaps.set(state.nextId = (state.nextId ?? 0) + 1, snap);
    let r = await session.send(text, { undo: snap });
    const lacking = wl.ofActions(session.takeMissed()).filter((i) => !loaded.has(i));   // an action of a world that is not loaded: load it, read again (the worker does the same)
    if (lacking.length) { session.restore(snap); await state.ensure(lacking); r = await session.send(text); }
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
  for (const text of ['hello', 'What is 7 plus 5?', 'open the map', 'what is the weather today', 'How many legs does a spider have?', 'put a hat on the avatar', 'what is the capital of Japan then how many days are in a week', 'I want to play hangman', 'what can you do', 'hi im Ben']) {
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

test('UNDO AFTER A RELOAD: the snapshots of earlier turns survive a world load (draw, a message that loads another world, undo takes back the drawing)', async () => {
  const c = await setup();
  const lz = await lazyEngine(c, 'ui.avatar');
  const scene = () => (lz.session.state()['art.draw']?.objects ?? []).map((o) => o.kind).join(',');
  await lz.send('open the drawing board');
  await lz.send('draw a house');
  const drawId = lz.nextId;
  assert.equal(scene(), 'house');
  const before = lz.loaded.size;
  await lz.send('open the map');           // loads geo.map: the engine is reloaded and the session made again
  assert.ok(lz.loaded.size > before, 'a world was loaded');
  assert.equal(scene(), 'house', 'the drawing stays');
  const snap = lz.snaps.get(drawId);
  assert.ok(snap, 'the snapshot of the drawing turn is still there');
  lz.session.restore(snap);                // what the worker\'s undo does with the turn\'s snapshot
  assert.equal(scene(), '', 'the page undo of the drawing turn takes the drawing back');
  // and the dialogue-level undo (the timeline travels with the memory)
  const lz2 = await lazyEngine(c, 'ui.avatar');
  await lz2.send('open the drawing board'); await lz2.send('draw a house');
  const n0 = lz2.loaded.size;
  await lz2.send('How many legs does a spider have?');   // a question that loads worlds
  assert.ok(lz2.loaded.size > n0, 'worlds were loaded');
  const u = await lz2.send('undo');
  assert.match(u.text, /undid/i);
  assert.deepEqual(lz2.session.state()['art.draw']?.objects ?? [], [], 'the chat "undo" takes the drawing back across the reload');
});

test('a world loaded later has its initial state, as in a full start (the old state is laid over the new session, not put in place of it)', async () => {
  const c = await setup();
  const wl = createWorldLoader({ indexHash: null, fetchJson: c.fetchJson, bag: c.bag });
  await wl.init(); await wl.bundles(wl.ids());
  const full = (await c.createEngine({ loader: c.createBundleLoader(wl.bundleOf(wl.ids(), c.absModule)) })).createSession({ language: 'en' });
  const lz = await lazyEngine(c, 'ui.avatar');
  await lz.ensure(wl.ids());
  assert.deepEqual(Object.keys(lz.session.state()).sort(), Object.keys(full.state()).sort(), 'every world has its state after loading every world');
  assert.deepEqual(lz.session.state().talk, full.state().talk);
});

test('a state the page sets while a world is loading is kept (a tab click during the load of the tab world)', async () => {
  const c = await setup();
  const lz = await lazyEngine(c, 'ui.avatar');
  const loading = lz.ensure(['art.draw']);
  lz.session.setWorldState('ui.shell', { activeTab: 'draw' });   // the click arrives while the bundles are fetched
  await loading;
  assert.equal(lz.session.state()['ui.shell'].activeTab, 'draw');
  const r = await lz.send('Start a new page.');
  assert.match(r.text, /fresh sheet/i);
});
