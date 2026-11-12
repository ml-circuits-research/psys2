#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * SHIP-NOW: a new build reaches the browser after ONE reload (spec 06 "Build version and caching").
 * Serves a copy of docs/webchat as build A with GitHub-Pages-like headers (cache-control: max-age=600, ETag), loads it, swaps the served files for build B
 * (same files, other build stamp in index.html and build-info.json), and checks:
 *   1. Settings > About shows build A.
 *   2. After the swap, a plain navigation either shows B or shows the "A new version is available" banner naming B (index.html may be served stale).
 *   3. After ONE reload the page runs build B, shows B in About and in the first line of the debug panel, and no banner.
 *
 *   PUPPETEER_CORE=<puppeteer-core> node scripts/test-webchat-version.mjs [--chrome /usr/bin/chromium]
 */
import http from 'node:http';
import { createHash } from 'node:crypto';
import { cp, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPuppeteer, findChrome, TYPES, DOCS } from './test-webchat-turns.mjs';

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); return ok; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A copy of docs/webchat without the model files, stamped as the given build. */
async function makeBuild(dir, { commit, builtAt }) {
  await cp(path.join(DOCS, 'webchat'), dir, { recursive: true, filter: (s) => !/[\\/]webchat[\\/]models([\\/]|$)/.test(s) });
  const info = JSON.parse(await readFile(path.join(dir, 'build-info.json'), 'utf8'));
  await writeFile(path.join(dir, 'build-info.json'), JSON.stringify({ ...info, commit, builtAt }));
  const html = await readFile(path.join(dir, 'index.html'), 'utf8');
  await writeFile(path.join(dir, 'index.html'), html.replace(/window\.__psys2Build = \{[^}]*\};/, `window.__psys2Build = ${JSON.stringify({ commit, builtAt })};`));
}

export async function runVersionTest({ chrome } = {}) {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'psys2-version-'));
  const A = { commit: 'aaaaaaa', builtAt: '2026-01-01T00:00:00.000Z' }, B = { commit: 'bbbbbbb', builtAt: '2026-01-02T00:00:00.000Z' };
  await makeBuild(path.join(tmp, 'A'), A);
  await makeBuild(path.join(tmp, 'B'), B);
  let current = 'A';
  const srv = http.createServer(async (q, r) => {
    try {
      const url = decodeURIComponent(q.url.split('?')[0]);
      const p = path.join(tmp, current, url.replace(/^\/webchat\/?/, ''));
      const f = p.endsWith(path.sep) || url.endsWith('/') ? path.join(p, 'index.html') : p;
      const body = await readFile(f);
      const etag = `"${createHash('sha1').update(body).digest('hex')}"`;
      r.setHeader('cache-control', 'max-age=600'); r.setHeader('etag', etag);
      r.setHeader('content-type', TYPES[path.extname(f)] ?? 'application/octet-stream');
      if (q.headers['if-none-match'] === etag) { r.statusCode = 304; return r.end(); }
      r.end(body);
    } catch { r.statusCode = 404; r.end('nf'); }
  }).listen(0);
  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({ executablePath: await findChrome(chrome), headless: true, args: ['--no-sandbox'] });
  try {
    const pg = await browser.newPage();
    await pg.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await pg.evaluateOnNewDocument(() => { try { localStorage.setItem('psys2.webchat.settings', JSON.stringify({ settingsVersion: 2, formalizer: 'rules', normalizer: false, devMode: true })); } catch { /* ignore */ } });
    const url = `http://localhost:${srv.address().port}/webchat/index.html`;
    const ready = () => pg.waitForFunction(() => document.querySelector('.p2-msg.is-hint'), { timeout: 60000, polling: 50 });
    const stamp = () => pg.evaluate(() => window.__psys2Build?.commit);
    const aboutText = async () => { await pg.evaluate(() => { location.hash = '#settings/about'; }); await pg.waitForFunction(() => document.querySelector('[data-build]')?.textContent.includes('This page'), { timeout: 20000 }).catch(() => {}); return pg.evaluate(() => document.querySelector('.p2-buildinfo')?.textContent ?? ''); };
    const bannerText = () => pg.evaluate(() => document.querySelector('.p2-update')?.textContent ?? '');

    await pg.goto(url, { waitUntil: 'domcontentloaded' }); await ready();
    check('build A runs', (await stamp()) === A.commit, await stamp());
    check('About shows build A', (await aboutText()).includes(A.commit));
    check('no banner on the current build', (await bannerText()) === '');

    current = 'B';
    await pg.goto(url, { waitUntil: 'domcontentloaded' }); await ready();
    await sleep(1500);
    const mid = await stamp();
    const banner = await bannerText();
    check('plain navigation: build B shown or the new-version banner names B', mid === B.commit || banner.includes(B.commit), `running ${mid}, banner "${banner.trim()}"`);

    await pg.reload({ waitUntil: 'domcontentloaded' }); await ready();
    await sleep(1500);
    check('after ONE reload build B runs', (await stamp()) === B.commit, await stamp());
    check('About shows build B', (await aboutText()).includes(B.commit));
    check('no banner after the reload', (await bannerText()) === '');
    await pg.evaluate(() => { location.hash = ''; });
    await pg.waitForFunction(() => !!window.psys2?.debug, { timeout: 20000 });
    await pg.click('#p2-dbg-open');
    await pg.waitForSelector('.p2-dbg:not([hidden])');
    const dbgLine = await pg.evaluate(() => document.querySelector('.p2-dbg .p2-dbg-build')?.textContent ?? '');
    check('debug panel carries the build line (B)', dbgLine.includes(B.commit), dbgLine);
  } finally {
    await browser.close(); srv.close(); await rm(tmp, { recursive: true, force: true });
  }
  return results.every(Boolean);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--chrome');
  const ok = await runVersionTest({ chrome: i > 0 ? process.argv[i + 1] : undefined });
  console.log(ok ? 'version: all passed' : 'version: FAILED');
  process.exit(ok ? 0 : 1);
}
