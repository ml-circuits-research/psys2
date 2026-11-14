// SPDX-License-Identifier: AGPL-3.0-only
// Asset manifest, cache reset, stale-page reload and the start-up steps (spec 06 "Assets, caches and versions"). No browser: the browser run is scripts/test-webchat-boot.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { manifestVersion, assetHashes } from '../scripts/build-webchat.mjs';
import { resetForRelease, startAssets, loadManifest, assetUrl, ASSET_STORAGE_KEYS, GENERATION_KEY } from '../docs/webchat/ui/assets.mjs';
import { createProgress } from '../docs/webchat/ui/progress.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'docs/webchat');
const NOT_ASSETS = [/^index\.html$/, /^build-info\.json$/, /^sw\.js$/, /(^|\/)README\.md$/, /^screenshots\//, /^system-map\.html$/];
async function walk(dir, base = dir, out = []) {
  for (const e of await readdir(dir)) { const f = path.join(dir, e); if ((await stat(f)).isDirectory()) await walk(f, base, out); else out.push(path.relative(base, f).split(path.sep).join('/')); }
  return out;
}

test('built webchat: build-info.json is the one manifest: every fetchable file has a hash, the version is their hash, index.html carries the same version and the same hashes', async () => {
  const info = JSON.parse(await readFile(path.join(WEB, 'build-info.json'), 'utf8'));
  const html = await readFile(path.join(WEB, 'index.html'), 'utf8');
  const files = (await walk(WEB)).filter((f) => !NOT_ASSETS.some((re) => re.test(f)));
  assert.deepEqual(files.filter((f) => !info.assets[f]), [], 'every file the page can fetch is in the manifest (rebuild: node scripts/build-webchat.mjs)');
  assert.deepEqual(Object.keys(info.assets).filter((f) => !files.includes(f)), [], 'nothing in the manifest that is not shipped');
  assert.equal(info.version, manifestVersion(info.assets), 'version is the hash of the manifest');
  assert.equal(JSON.parse(/window\.__psys2Build = (\{.*?\});/.exec(html)[1]).version, info.version, 'index.html stamps the manifest version');
  const mod = JSON.parse(/window\.__psys2Mod = (.*?);<\/script>/.exec(html)[1]);
  for (const [f, v] of Object.entries(mod)) assert.equal(info.assets[f], v, `${f}: the URL hash of the page equals the manifest`);
  for (const m of html.matchAll(/(?:href|src)="([^"?]+)\?v=([0-9a-f]+)"/g)) assert.equal(info.assets[m[1]], m[2], `index.html: ${m[1]}`);
  assert.ok(!/href="style\.css"/.test(html) && !/href="favicon\.svg"/.test(html), 'the stylesheet and the icon carry their hash');
});

test('assetHashes: a changed file changes the version, order does not matter', async () => {
  const a = { 'a.txt': '1', 'b.txt': '2' }, b = { ...a, 'b.txt': '3' };
  assert.notEqual(manifestVersion(a), manifestVersion(b));
  assert.equal(manifestVersion({ x: '1', y: '2' }), manifestVersion({ y: '2', x: '1' }));
  const h = await assetHashes(path.join(WEB, 'ui'), {});
  assert.ok(Object.keys(h).length > 10 && Object.values(h).every((v) => /^[0-9a-f]{10}$/.test(v)));
});

const fakeCaches = (names) => { const set = new Set(names); return { keys: async () => [...set], delete: async (n) => set.delete(n), has: (n) => set.has(n) }; };
const fakeStorage = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m }; };
const fakeIdb = (names) => { const live = new Set(names); return { databases: async () => [...live].map((name) => ({ name })), deleteDatabase: (n) => { live.delete(n); const q = {}; setTimeout(() => q.onsuccess?.(), 0); return q; }, live }; };

test('resetForRelease: clears caches, service workers, IndexedDB and asset keys once per generation, keeps user data', async () => {
  const storage = fakeStorage({ 'psys2.webchat.settings': '{"rate":1.5}', 'psys2.webchat.phrases': '[1]', 'psys2.webchat.progress': '{}', 'psys2.ortlog': 'x' });
  const cacheStorage = fakeCaches(['psys2-dispatcher-model', 'psys2-assets-g0', 'other']), idb = fakeIdb(['a', 'b']);
  let unregistered = 0;
  const serviceWorker = { getRegistrations: async () => [{ unregister: async () => { unregistered++; return true; } }] };
  const r = await resetForRelease({ storage, cacheStorage, idb, serviceWorker, generation: 7 });
  assert.equal(r.reset, true);
  assert.deepEqual(r.cleared, { caches: 3, databases: 2, workers: 1, keys: 2 });
  assert.equal(idb.live.size, 0);
  assert.equal(unregistered, 1);
  assert.equal(storage.getItem('psys2.webchat.settings'), '{"rate":1.5}', 'settings kept');
  assert.equal(storage.getItem('psys2.webchat.phrases'), '[1]', 'history kept');
  for (const k of ASSET_STORAGE_KEYS) assert.equal(storage.getItem(k), null);
  assert.equal(storage.getItem(GENERATION_KEY), '7');
  assert.equal((await resetForRelease({ storage, cacheStorage, idb, serviceWorker, generation: 7 })).reset, false, 'once per generation');
  assert.equal((await resetForRelease({ storage, cacheStorage, idb, serviceWorker, generation: 8 })).reset, true, 'a new generation resets again');
});

test('startAssets: the manifest is fetched once with no cache; a stale page reloads once and says so; a second mismatch only returns it (no loop)', async () => {
  const man = { version: 'bbb', assets: { 'a.mjs': '1' } };
  const calls = [];
  const fetchFn = async (u, o) => { calls.push([String(u), o?.cache]); return { ok: true, json: async () => man }; };
  const common = { base: 'http://x/', fetchFn, storage: fakeStorage(), cacheStorage: fakeCaches([]), idb: null, serviceWorker: null, useWorker: false };
  const said = []; let reloads = 0;
  const session = fakeStorage();
  const r1 = await startAssets({ ...common, win: { __psys2Build: { version: 'aaa' } }, session, say: (t) => said.push(t), reload: () => { reloads++; } });
  assert.equal(r1.reloading, true); assert.equal(reloads, 1); assert.match(said[0], /new version/i);
  const m1 = calls.filter(([u]) => u.endsWith('build-info.json'));
  assert.equal(m1.length, 1, 'one manifest fetch');
  assert.equal(m1[0][1], 'no-store', 'with no cache');
  const r2 = await startAssets({ ...common, storage: fakeStorage(), win: { __psys2Build: { version: 'aaa' } }, session, say: (t) => said.push(t), reload: () => { reloads++; } });
  assert.equal(r2.reloading, false); assert.equal(reloads, 1, 'no second reload'); assert.equal(r2.mismatch.version, 'bbb');
  const r3 = await startAssets({ ...common, storage: fakeStorage(), win: { __psys2Build: { version: 'bbb' } }, session: fakeStorage(), reload: () => { reloads++; } });
  assert.equal(r3.reloading, false); assert.equal(r3.mismatch, null); assert.equal(reloads, 1);
  assert.equal(assetUrl('http://x/', 'a.mjs'), 'http://x/a.mjs?v=1', 'asset URLs carry the hash of the manifest');
  assert.equal(await loadManifest({ base: 'http://x/', fetchFn: async () => { throw new Error('offline'); } }), null, 'offline: no manifest, no throw');
});

test('progress: the popup names the current step only (latest running step, never a queued one), quiet steps are not shown, a finished step leaves nothing', () => {
  let t = 0;
  const pg = createProgress({ storage: fakeStorage(), document: null, now: () => t });
  pg.plan('startup', [{ id: 'worlds', label: 'Loading the worlds' }, { id: 'reasoner', label: 'Starting the reasoner' }, { id: 'model', label: 'Loading the reading model' }]);
  assert.equal(pg.view().label, '', 'queued steps are not said');
  assert.equal(pg.view().busy, false);
  pg.start('worlds', 'Loading the worlds'); t = 10;
  assert.equal(pg.view().label, 'Loading the worlds');
  pg.start('reasoner', 'Starting the reasoner'); t = 20;
  assert.equal(pg.view().label, 'Starting the reasoner', 'replaced by the step that started last');
  pg.start('voices', 'Finding voices', { quiet: true });
  assert.equal(pg.view().label, 'Starting the reasoner', 'a quiet step is not the popup');
  pg.end('reasoner'); pg.end('worlds');
  assert.equal(pg.view().busy, false, 'a quiet step alone does not keep the popup');
  pg.start('model', 'Loading the reading model (12 of 65 MB)');
  assert.equal(pg.view().label, 'Loading the reading model (12 of 65 MB)');
  pg.end('model');
  assert.equal(pg.view().label, ''); assert.equal(pg.view().busy, false);
});

test('engine worker: the start-up steps it reports are all ended (the "Loading the worlds" that stayed forever was a start with no end)', async () => {
  const src = await readFile(path.join(WEB, 'ui/engine-worker.mjs'), 'utf8');
  for (const id of ['worlds', 'reasoner']) for (const op of ['start', 'end']) assert.match(src, new RegExp(`evt\\('boot-step', \\{ id: '${id}', op: '${op}'`), `${id} ${op}`);
  const app = await readFile(path.join(WEB, 'app.mjs'), 'utf8');
  assert.match(app, /for \(const id of \['worlds', 'reasoner'\]\) if \(progress\.state\(id\) !== 'done'\) progress\.end\(/, 'the page ends whatever the worker did not end');
});

test('service worker: hash-keyed cache, concurrent requests share one fetch, nothing outside the manifest kept, generation matches the page', async () => {
  const sw = await readFile(path.join(WEB, 'sw.js'), 'utf8');
  assert.match(sw, /\?v=\$\{hash\}/, 'cache keys end in the hash');
  assert.match(sw, /keep\.has\(req\.url\)/, 'entries not in the manifest are deleted');
  assert.match(sw, /inflight/, 'concurrent requests share one fetch');
  const assets = await readFile(path.join(WEB, 'ui/assets.mjs'), 'utf8');
  assert.equal(/const GENERATION = (\d+)/.exec(sw)[1], /CACHE_GENERATION = (\d+)/.exec(assets)[1], 'sw.js and ui/assets.mjs bump the generation together');
});
