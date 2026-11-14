#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * BOOT, CACHES AND VERSIONS in a real Chrome (spec 06 "Assets, caches and versions"). The page is served by a local server with GitHub-Pages-like headers
 * (cache-control: max-age=600, ETag) that logs every request that reaches it, so "fetched twice" and "fetched without a hash" are counted at the server, where it costs.
 *
 *   cold     a fresh profile: no step of the start-up stays open ("Loading the worlds" for minutes was a step nobody ended); no file reaches the server twice in one start;
 *            every request carries its hash (`?v=`/`?h=`) except index.html, build-info.json, sw.js and the model files (meta.json, their own sha256-keyed caches);
 *            the popup only ever shows one plain sentence (no path, no list) and is gone when the start is done.
 *   warm     a second start in the same profile: the server sees only index.html, build-info.json, the models' meta.json and sw.js (nothing else), no popup at all.
 *   update   build A is cached, build B is served (a file changed): the page runs B, the cache holds exactly B's hashes (no two versions of one asset, nothing outside
 *            the manifest); without the service worker (a stale index.html from the HTTP cache) the page reloads itself ONCE and says so, never in a loop.
 *   reset    a profile with old caches, a service worker, an IndexedDB database and asset keys: the release reset clears them once and keeps settings and history.
 *
 *   PUPPETEER_CORE=<puppeteer-core> node scripts/test-webchat-boot.mjs [--only cold,warm,update,reset] [--chrome /usr/bin/chromium]
 */
import http from 'node:http';
import { createHash } from 'node:crypto';
import { cp, readFile, writeFile, mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPuppeteer, findChrome, TYPES, DOCS } from './test-webchat-turns.mjs';
import { buildWebchat } from './build-webchat.mjs';

const results = [];
export const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); return ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WEB = path.join(DOCS, 'webchat');
const SETTINGS = JSON.stringify({ settingsVersion: 2, formalizer: 'rules', normalizer: false });
/** What may reach the server without a hash (the entry page, the manifest, the service worker, and the model files kept by their own sha256-keyed caches). */
export const UNHASHED_OK = (u) => /^\/(index\.html)?(\?.*)?$/.test(u) || /^\/(build-info\.json|sw\.js)$/.test(u) || /^\/models\//.test(u);

/** A copy of docs/webchat without the model files and screenshots (big, not part of these checks). */
async function copySite(dir) {
  await cp(WEB, dir, { recursive: true, filter: (s) => !/[\\/]webchat[\\/](models|screenshots)([\\/]|$)/.test(s) });
  // the models' meta files stay (the page asks for them); the model itself is not needed (the rules read)
}

export function makeServer(getDir) {
  const log = [];
  const srv = http.createServer(async (q, r) => {
    try {
      const url = decodeURIComponent(q.url.split('?')[0]);
      const p = path.join(getDir(), url);
      const f = p.endsWith(path.sep) || url.endsWith('/') ? path.join(p, 'index.html') : p;
      const body = await readFile(f);
      const st = await stat(f);
      const etag = `"${createHash('sha1').update(body).digest('hex').slice(0, 20)}-${st.size}"`;
      r.setHeader('cache-control', 'max-age=600'); r.setHeader('etag', etag);
      r.setHeader('content-type', TYPES[path.extname(f)] ?? 'application/octet-stream');
      if (q.headers['if-none-match'] === etag) { log.push({ url: q.url, status: 304, bytes: 0 }); r.statusCode = 304; return r.end(); }
      log.push({ url: q.url, status: 200, bytes: body.length });
      r.setHeader('content-length', body.length); r.end(body);
    } catch { log.push({ url: q.url, status: 404, bytes: 0 }); r.statusCode = 404; r.end('nf'); }
  }).listen(0);
  return { srv, log, port: () => srv.address().port, mark: () => log.length, since: (n) => log.slice(n) };
}
const pathOf = (u) => u.split('?')[0];

async function launch(chrome) {
  const puppeteer = await loadPuppeteer();
  return puppeteer.launch({ executablePath: await findChrome(chrome), headless: true, args: ['--no-sandbox'] });
}
/** Opens the page; records every different sentence the popup showed (kept in sessionStorage so that a reload does not lose it). */
async function openPage(browser, url, { settings = SETTINGS, query = '' } = {}) {
  const pg = await browser.newPage();
  await pg.setViewport({ width: 1100, height: 800 });
  await pg.evaluateOnNewDocument((s) => {
    try { if (!localStorage.getItem('psys2.webchat.settings')) localStorage.setItem('psys2.webchat.settings', s); } catch { /* ignore */ }
    const seen = () => { try { return JSON.parse(sessionStorage.getItem('probe.popup') ?? '[]'); } catch { return []; } };
    setInterval(() => {
      const e = document.querySelector('.p2-progress');
      if (!e || e.hidden) return;
      const t = e.querySelector('.p2-pg-label')?.textContent ?? '';
      const a = seen(); if (t && a.at(-1) !== t) { a.push(t); try { sessionStorage.setItem('probe.popup', JSON.stringify(a.slice(-200))); } catch { /* ignore */ } }
    }, 40);
  }, settings);
  await pg.goto(`${url}${query}`, { waitUntil: 'domcontentloaded' });
  return pg;
}
const ready = (pg, ms = 90000) => pg.waitForFunction(() => document.querySelector('.p2-msg.is-hint') && window.psys2?.progress, { timeout: ms, polling: 50 });
/** Waits until no start-up step is running (bounded). Returns the progress view. */
async function settle(pg, ms = 30000) {
  await pg.waitForFunction(() => { const v = window.psys2.progress.view(); return !v.busy; }, { timeout: ms, polling: 100 }).catch(() => {});
  return pg.evaluate(() => { const v = window.psys2.progress.view(); return { busy: v.busy, active: v.active, steps: v.steps.map((t) => `${t.id}:${t.state}`), popupHidden: document.querySelector('.p2-progress')?.hidden !== false, failures: v.failures.length }; });
}
const popupSeen = (pg) => pg.evaluate(() => JSON.parse(sessionStorage.getItem('probe.popup') ?? '[]'));
const cacheKeys = (pg) => pg.evaluate(async () => { const out = {}; for (const n of await caches.keys()) out[n] = (await (await caches.open(n)).keys()).map((r) => r.url); return out; });
const manifestOf = (dir) => readFile(path.join(dir, 'build-info.json'), 'utf8').then(JSON.parse);
const plainSentence = (t) => t.length < 90 && !/[\\/]|\.m?js|\.json|\.wasm|https?:|\?v=/.test(t) && !/\n/.test(t);

export const SCENARIOS = {
  async cold({ chrome } = {}) {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'psys2-boot-'));
    const site = path.join(tmp, 'site'); await copySite(site);
    const s = makeServer(() => site);
    const browser = await launch(chrome);
    try {
      const pg = await openPage(browser, `http://localhost:${s.port()}/index.html`);
      await ready(pg);
      const v = await settle(pg);
      await sleep(1500);
      check('cold: no start-up step stays open (the "Loading the worlds" that never ended)', !v.busy && v.active.length === 0, JSON.stringify(v.steps));
      check('cold: the worlds and the reasoner steps ended', v.steps.includes('worlds:done') && v.steps.includes('reasoner:done'), v.steps.join(' '));
      check('cold: the popup is gone when the start is done (a failure notice may stay, with its Dismiss)', v.popupHidden || v.failures > 0, `hidden=${v.popupHidden} failures=${v.failures}`);
      const seen = await popupSeen(pg);
      check('cold: the popup only ever shows one plain sentence (no path, no list)', seen.every(plainSentence), JSON.stringify(seen.slice(0, 6)));
      const log = s.log.filter((x) => x.status === 200);
      const count = {}; for (const x of log) count[pathOf(x.url)] = (count[pathOf(x.url)] ?? 0) + 1;
      const twice = Object.entries(count).filter(([p, n]) => n > 1 && p !== '/sw.js').map(([p, n]) => `${n}x ${p}`);
      check('cold: no file reaches the server twice in one start', twice.length === 0, twice.slice(0, 5).join(', '));
      const bare = s.log.map((x) => x.url).filter((u) => !/[?&][vh]=/.test(u) && !UNHASHED_OK(u));
      check('cold: every request carries its hash (except index.html, build-info.json, sw.js, models)', bare.length === 0, bare.slice(0, 5).join(', '));
      const swReady = await pg.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.active);
      check('cold: the service worker is active after the first start', swReady);
      const keys = await cacheKeys(pg);
      const assets = Object.entries(keys).filter(([n]) => n.startsWith('psys2-assets-')).flatMap(([, k]) => k);
      const paths = assets.map((u) => new URL(u).pathname);
      check('cold: Cache Storage holds the assets, one entry per path (no two versions of one asset)', assets.length > 20 && new Set(paths).size === paths.length, `${assets.length} entries`);
      const man = await manifestOf(site);
      const bad = assets.filter((u) => { const x = new URL(u); const rel = decodeURIComponent(x.pathname.slice(1)); return man.assets[rel] !== x.searchParams.get('v'); });
      check('cold: every cached asset is in the current manifest under its hash', bad.length === 0, bad.slice(0, 3).join(', '));
      await pg.close();
      s.srv.close(); await browser.close(); await rm(tmp, { recursive: true, force: true });
    } catch (e) { check('cold: runs', false, String(e?.stack ?? e).slice(0, 400)); try { await browser.close(); } catch { /* gone */ } s.srv.close(); }
  },

  async warm({ chrome } = {}) {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'psys2-boot-'));
    const site = path.join(tmp, 'site'); await copySite(site);
    const s = makeServer(() => site);
    const browser = await launch(chrome);
    try {
      const url = `http://localhost:${s.port()}/index.html`;
      const first = await openPage(browser, url); await ready(first); await settle(first); await sleep(1000); await first.close();
      const n = s.mark();
      const pg = await openPage(browser, url); await ready(pg);
      const v = await settle(pg, 15000); await sleep(1500);
      const reqs = s.since(n);
      const extra = reqs.map((x) => pathOf(x.url)).filter((p) => !/^\/(index\.html|build-info\.json|sw\.js)?$/.test(p) && !/^\/models\/[a-z]+\/meta\.json$/.test(p));
      check('warm: the server sees only index.html, build-info.json, the models\' meta.json and sw.js', extra.length === 0, `${reqs.length} requests; extra: ${extra.slice(0, 6).join(', ')}`);
      check('warm: nothing transferred but the small files', reqs.reduce((a, x) => a + x.bytes, 0) < 200000, `${reqs.reduce((a, x) => a + x.bytes, 0)} bytes`);
      const seen = await popupSeen(pg);
      const loads = seen.filter((t) => /Loading|Starting|Reading/.test(t) && !/catalog/i.test(t));
      check('warm: no popup when everything comes from the cache', loads.length === 0, JSON.stringify(seen.slice(0, 5)));
      check('warm: the page is up and no step is open', !v.busy);
      await pg.close();
      s.srv.close(); await browser.close(); await rm(tmp, { recursive: true, force: true });
    } catch (e) { check('warm: runs', false, String(e?.stack ?? e).slice(0, 400)); try { await browser.close(); } catch { /* gone */ } s.srv.close(); }
  },

  async update({ chrome } = {}) {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'psys2-boot-'));
    const A = path.join(tmp, 'A'), B = path.join(tmp, 'B');
    await copySite(B); await copySite(A);
    // build A differs from B in one file (the stylesheet): the manifest, its version and the stamp of index.html follow from the build itself
    await writeFile(path.join(A, 'style.css'), `${await readFile(path.join(A, 'style.css'), 'utf8')}\n/* build A */\n`);
    await buildWebchat({ outDir: A });
    await buildWebchat({ outDir: B });
    const [mA, mB] = [await manifestOf(A), await manifestOf(B)];
    check('update: the two builds have different versions', !!mA.version && mA.version !== mB.version, `${mA.version} / ${mB.version}`);
    let cur = 'A';
    const s = makeServer(() => (cur === 'A' ? A : B));
    const browser = await launch(chrome);
    try {
      const url = `http://localhost:${s.port()}/index.html`;
      const pg = await openPage(browser, url); await ready(pg); await settle(pg); await sleep(800);
      check('update: build A runs first', (await pg.evaluate(() => window.__psys2Build.version)) === mA.version);
      cur = 'B';
      await pg.goto(url, { waitUntil: 'domcontentloaded' }); await ready(pg); await settle(pg); await sleep(1200);
      check('update (service worker): the next start runs build B', (await pg.evaluate(() => window.__psys2Build.version)) === mB.version);
      await pg.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); r.active.postMessage({ type: 'noop' }); });
      const keys = await cacheKeys(pg);
      const assets = Object.entries(keys).filter(([n]) => n.startsWith('psys2-assets-')).flatMap(([, k]) => k);
      const paths = assets.map((u) => new URL(u).pathname);
      check('update: no two versions of one asset in the cache', new Set(paths).size === paths.length);
      const bad = assets.filter((u) => { const x = new URL(u); return mB.assets[decodeURIComponent(x.pathname.slice(1))] !== x.searchParams.get('v'); });
      check('update: nothing in the cache is outside the current manifest (build A\'s files are gone)', bad.length === 0, bad.slice(0, 3).join(', '));
      check('update: the stylesheet of build B is the one cached', assets.some((u) => u.endsWith(`style.css?v=${mB.assets['style.css']}`)) && !assets.some((u) => u.endsWith(`style.css?v=${mA.assets['style.css']}`)));
      await pg.close(); await browser.close();

      // no service worker (a browser without one, or the first visit): index.html comes from the HTTP cache (max-age=600) as build A while the manifest says B
      cur = 'A';
      const b2 = await launch(chrome);
      const p2 = await openPage(b2, url, { query: '?psys2nosw=1' }); await ready(p2); await settle(p2); await sleep(500);
      check('update (no service worker): build A runs first', (await p2.evaluate(() => window.__psys2Build.version)) === mA.version);
      cur = 'B';
      let navs = 0; p2.on('framenavigated', (f) => { if (f === p2.mainFrame()) navs++; });
      await p2.goto(`${url}?psys2nosw=1`, { waitUntil: 'domcontentloaded' });
      await p2.waitForFunction((v) => window.__psys2Build?.version === v && document.querySelector('.p2-msg.is-hint'), { timeout: 60000, polling: 100 }, mB.version).catch(() => {});
      await settle(p2, 15000); await sleep(800);
      const ver = await p2.evaluate(() => window.__psys2Build.version);
      check('update (stale index.html): the page reloads itself and runs build B', ver === mB.version, `${ver}`);
      const said = (await popupSeen(p2)).join(' | ');
      check('update (stale index.html): it said so in plain words', /new version/i.test(said), said.slice(0, 160));
      check('update (stale index.html): one reload, never a loop', navs <= 3, `${navs} navigations`);
      await sleep(2500);
      check('update: the page stays on build B (no further reload)', (await p2.evaluate(() => window.__psys2Build.version)) === mB.version);
      await b2.close(); s.srv.close(); await rm(tmp, { recursive: true, force: true });
    } catch (e) { check('update: runs', false, String(e?.stack ?? e).slice(0, 500)); try { await browser.close(); } catch { /* gone */ } s.srv.close(); }
  },

  async reset({ chrome } = {}) {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'psys2-boot-'));
    const site = path.join(tmp, 'site'); await copySite(site);
    const s = makeServer(() => site);
    const browser = await launch(chrome);
    try {
      const url = `http://localhost:${s.port()}/index.html`;
      const pg = await browser.newPage();
      await pg.goto(`http://localhost:${s.port()}/build-info.json`);   // a page of the origin to seed the profile as an old release left it
      await pg.evaluate(async () => {
        await (await caches.open('psys2-old-asset-cache')).put('/x', new Response('old'));
        await (await caches.open('psys2-knowledge-0')).put('/y', new Response('old'));
        await new Promise((res) => { const q = indexedDB.open('psys2-old-db', 1); q.onsuccess = () => { q.result.close(); res(); }; q.onerror = () => res(); });
        localStorage.setItem('psys2.webchat.settings', JSON.stringify({ settingsVersion: 2, formalizer: 'rules', normalizer: false, rate: 1.25 }));
        localStorage.setItem('psys2.webchat.phrases', '[{"text":"hello"}]');
        localStorage.setItem('psys2.someUserData', 'kept');   // any key that is not an asset key stays
        localStorage.setItem('psys2.webchat.progress', '{"worlds":{"ms":99999}}');
      });
      await pg.close();
      const p2 = await openPage(browser, url); await ready(p2); await settle(p2); await sleep(800);
      const after = await p2.evaluate(async () => ({ caches: await caches.keys(), dbs: ((await indexedDB.databases?.()) ?? []).map((d) => d.name), ls: Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])), gen: localStorage.getItem('psys2.cacheGeneration') }));
      check('reset: the old caches are gone', !after.caches.includes('psys2-old-asset-cache') && !after.caches.includes('psys2-knowledge-0'), after.caches.join(','));
      check('reset: the old IndexedDB database is gone', !after.dbs.includes('psys2-old-db'), after.dbs.join(','));
      check('reset: the asset keys of localStorage are cleared (the timings are rewritten by this start only)', !/99999/.test(after.ls['psys2.webchat.progress'] ?? ''));
      check('reset: user data is kept (settings, history, other keys)', /1\.25/.test(after.ls['psys2.webchat.settings'] ?? '') && /hello/.test(after.ls['psys2.webchat.phrases'] ?? '') && after.ls['psys2.someUserData'] === 'kept', JSON.stringify({ s: (after.ls['psys2.webchat.settings'] ?? '').slice(0, 80), p: (after.ls['psys2.webchat.phrases'] ?? '').slice(0, 60), pr: after.ls['psys2.profile.v1'] }));
      check('reset: the generation is recorded', !!after.gen);
      await p2.evaluate(async () => { await (await caches.open('psys2-after-reset')).put('/z', new Response('later')); });
      await p2.reload({ waitUntil: 'domcontentloaded' }); await ready(p2); await settle(p2); await sleep(500);
      check('reset: it runs once per generation, not at every start', (await p2.evaluate(() => caches.keys())).includes('psys2-after-reset'));
      await p2.close(); s.srv.close(); await browser.close(); await rm(tmp, { recursive: true, force: true });
    } catch (e) { check('reset: runs', false, String(e?.stack ?? e).slice(0, 400)); try { await browser.close(); } catch { /* gone */ } s.srv.close(); }
  },
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--only'), only = i > 0 ? process.argv[i + 1].split(',') : Object.keys(SCENARIOS);
  const c = process.argv.indexOf('--chrome'), chrome = c > 0 ? process.argv[c + 1] : undefined;
  for (const name of only) { console.log(`--- ${name}`); await SCENARIOS[name]({ chrome }); }
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}
