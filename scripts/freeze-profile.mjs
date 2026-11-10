#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * URGENT-FREEZE reproduction and regression harness: a Chrome profile populated by an OLD build of the webchat (HTTP cache, Cache API model, localStorage:
 * settings, phrase log) is reopened against a NEW build served at the SAME origin with GitHub-Pages-like caching (Cache-Control max-age=600, ETag, 304).
 *
 *   PUPPETEER_CORE=... node scripts/freeze-profile.mjs --old <dir with webchat/> [--new docs] [--throttle 4] [--json out.json] [--profile cpu.json]
 *
 * Measures in the new build: long tasks (>= 50 ms, and runs of back-to-back long tasks), typed and voice turns, input echo, ORT restarts, errors.
 * Exports runFreeze() for tests/webchat-freeze.test.mjs.
 */
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPuppeteer, findChrome, TYPES } from './test-webchat-turns.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A static server with Pages-like caching whose document root can be switched while the port (= the browser origin) stays the same. */
export async function pagesServer(initialRoot, opts = {}) {
  let root = initialRoot; const etags = new Map(); const log = [];
  const srv = http.createServer(async (q, r) => {
    try {
      const rel = decodeURIComponent(q.url.split('?')[0]); const p = path.join(root, rel); const f = p.endsWith('/') ? `${p}index.html` : p;
      const buf = await readFile(f);
      const key = `${f}:${buf.length}`;
      let tag = etags.get(key); if (!tag) { tag = `"${createHash('md5').update(buf).digest('hex').slice(0, 16)}"`; etags.set(key, tag); }
      // `htmlFresh`: the ten minutes of the old index.html have passed (the user opens the page after a deploy) but every other file is still inside its max-age
      r.setHeader('content-type', TYPES[path.extname(f)] ?? 'application/octet-stream'); r.setHeader('cache-control', opts.htmlFresh && f.endsWith('.html') ? 'no-cache' : 'max-age=600'); r.setHeader('etag', tag);
      log.push(rel);
      if (q.headers['if-none-match'] === tag) { r.statusCode = 304; r.end(); return; }
      r.end(buf);
    } catch { r.statusCode = 404; r.end('nf'); }
  });
  await new Promise((ok) => srv.listen(0, ok));
  return { port: srv.address().port, setRoot: (d) => { root = d; }, log, close: () => srv.close() };
}

function fakeSpeech() {
  const all = [];
  class FakeSR {
    constructor() { this.started = false; all.push(this); }
    start() { this.started = true; setTimeout(() => { if (this.started) this.onstart?.(); }, 20); }
    stop() { setTimeout(() => this.end(), 20); }
    abort() { this.dead = true; setTimeout(() => this.end(), 0); }
    end() { if (this.started) { this.started = false; this.onend?.(); } }
  }
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak(u) { setTimeout(() => u.onend?.(), 300); }, cancel() {}, getVoices: () => [], addEventListener() {} } });
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
  window.__sr = { live: () => all.filter((r) => r.started).at(-1) ?? null,
    say(texts, final) { const r = this.live(); if (!r) return false; r.onresult({ resultIndex: 0, results: texts.map((t) => Object.assign([{ transcript: t }], { isFinal: final })) }); return true; } };
  window.__long = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ start: e.startTime, dur: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch { /* no longtask */ }
  window.__echo = [];
  addEventListener('input', (e) => { const t = e.timeStamp; requestAnimationFrame(() => requestAnimationFrame(() => window.__echo.push(performance.now() - t))); }, true);
}

/** Longest run of long tasks separated by < 100 ms gaps: { count, spanMs, maxMs }. */
export function longRuns(tasks) {
  let best = { count: 0, spanMs: 0, maxMs: 0 }, cur = null;
  for (const t of [...tasks].sort((a, b) => a.start - b.start)) {
    if (cur && t.start - cur.end < 100) { cur.count++; cur.end = t.start + t.dur; cur.maxMs = Math.max(cur.maxMs, t.dur); }
    else { cur = { count: 1, start: t.start, end: t.start + t.dur, maxMs: t.dur }; }
    if (cur.end - cur.start > best.spanMs) best = { count: cur.count, spanMs: Math.round(cur.end - cur.start), maxMs: Math.round(cur.maxMs) };
  }
  return best;
}

/** True when two tasks longer than `limit` ms start within `gapMs` of each other (a freeze is a chain of those). */
export function backToBackLong(tasks, limit = 500, gapMs = 1000) {
  const big = tasks.filter((t) => t.dur > limit).sort((a, b) => a.start - b.start);
  return big.some((t, i) => i > 0 && t.start - (big[i - 1].start + big[i - 1].dur) < gapMs);
}

const TYPED = ['make a house and a man', 'fă o casă verde și una galbenă', 'what is 12 plus 30', 'desenează trei cercuri'];
const VOICE = ['desenează un soare galben', 'fă o casă verde și una galbenă', 'cât face șapte plus opt', 'desenează un soare galben'];

/** Runs the scenario; returns the measurements of the NEW build phase. */
export async function runFreeze({ oldRoot, newRoot, liveUrl = null, htmlFresh = true, throttle = 4, chrome, settings = null, profileOut = null, log = () => {} } = {}) {
  const puppeteer = await loadPuppeteer();
  const srv = liveUrl ? { port: 0, setRoot() {}, log: [], close() {} } : await pagesServer(oldRoot, { htmlFresh });
  const dir = await mkdtemp(path.join(tmpdir(), 'psys2-freeze-'));
  const url = liveUrl ?? `http://localhost:${srv.port}/webchat/index.html`;
  const launch = async () => puppeteer.launch({ executablePath: await findChrome(chrome), headless: true, userDataDir: dir, args: ['--no-sandbox'] });
  const open = async (browser) => {
    const pg = await browser.newPage();
    await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const cdp = await pg.createCDPSession();
    if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    if (settings) await pg.evaluateOnNewDocument((s) => { try { if (!localStorage.getItem('psys2.fz.seeded')) { localStorage.setItem('psys2.webchat.settings', JSON.stringify(s)); localStorage.setItem('psys2.fz.seeded', '1'); } } catch { /* ignore */ } }, settings);
    await pg.evaluateOnNewDocument(fakeSpeech);
    const errors = []; pg.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    const t0 = Date.now();
    await pg.goto(url, { waitUntil: 'domcontentloaded' });
    await pg.waitForFunction(() => document.querySelector('.p2-msg.is-hint'), { timeout: 180000, polling: 50 });
    return { pg, cdp, errors, readyMs: Date.now() - t0 };
  };
  const waitModel = (pg) => pg.waitForFunction(() => window.__psys2Ort?.stats, { timeout: 180000, polling: 250 }).catch(() => {});
  const typed = async (pg, text) => {
    const n = await pg.$$eval('.p2-msg.is-bot:not(.is-typing)', (e) => e.length);
    await pg.evaluate(() => { window.__echo.length = 0; });
    await pg.focus('input.p2-text');
    await pg.keyboard.type(text, { delay: 0 });
    const t = Date.now(); await pg.keyboard.press('Enter');
    const ok = await pg.waitForFunction((n0) => !window.psys2.busy && !document.querySelector('.p2-msg.is-typing') && document.querySelectorAll('.p2-msg.is-bot:not(.is-typing)').length > n0, { timeout: 60000, polling: 20 }, n).then(() => true, () => false);
    return { ms: Date.now() - t, ok, reply: await pg.evaluate(() => [...document.querySelectorAll('.p2-msg.is-bot')].at(-1)?.querySelector('.p2-bubble')?.innerText?.slice(0, 80) ?? '') };
  };
  const cachesOf = (pg) => pg.evaluate(async () => { const o = {}; for (const n of await caches.keys()) o[n] = (await (await caches.open(n)).keys()).map((r) => r.url.split('/').slice(-2).join('/')); return o; });

  // ---- phase 1: the OLD build populates the profile ----
  let b = await launch(); let a;
  const oldTurns = [], oldKeys = [], oldCaches = {};
  if (!liveUrl) {
  a = await open(b);
  await waitModel(a.pg); await sleep(4000);
  for (const t of ['make a house and a man', 'what is 3 plus 4', 'hello']) oldTurns.push(await typed(a.pg, t));
  oldKeys.push(...await a.pg.evaluate(() => Object.keys(localStorage)));
  Object.assign(oldCaches, await cachesOf(a.pg));
  log(`old build: ${oldTurns.map((t) => `${t.ms}ms`).join(' ')}, keys ${oldKeys.join(',')}, caches ${JSON.stringify(oldCaches)}`);
  // stale leftovers a long-lived profile can hold: a model of an older sha, and the current-sha key without the output signature
  await a.pg.evaluate(async () => { const c = await caches.open('psys2-dispatcher-model'); const u = (q) => new URL(`models/dispatcher/${q}`, location.href).href;
    await c.put(u(`model.int8.onnx?sha256=${'0'.repeat(64)}`), new Response(new Uint8Array(1000))); await c.put(u(`vocab.txt?sha256=${'0'.repeat(64)}`), new Response('x')); });
  await b.close();
  }

  // ---- phase 2: the NEW build on the same origin, same profile ----
  srv.setRoot(newRoot); srv.log.length = 0;
  if (!liveUrl) b = await launch();
  a = await open(b);
  const out = { readyMs: a.readyMs, oldCaches, oldKeys };
  if (profileOut) { await a.cdp.send('Profiler.enable'); await a.cdp.send('Profiler.setSamplingInterval', { interval: 2000 }); await a.cdp.send('Profiler.start'); }
  await waitModel(a.pg);
  await sleep(4000);   // model load (cache / download, session create)
  out.newCaches = await cachesOf(a.pg);
  out.typed = [];
  for (const t of TYPED) {
    const r = await typed(a.pg, t);
    r.echoMs = await a.pg.evaluate(() => window.__echo.slice(-1)[0] ?? null);
    out.typed.push({ text: t, ...r });
    log(`typed ${JSON.stringify(t)}: ${r.ms} ms ok=${r.ok} echo=${r.echoMs?.toFixed?.(0)} ${JSON.stringify(r.reply)}`);
  }
  // voice: the always-on recogniser, interim words then a final result
  await a.pg.click('button.p2-mic');
  await a.pg.waitForFunction(() => window.__sr.live(), { timeout: 10000, polling: 20 });
  out.voice = [];
  for (const t of VOICE) {
    const n = await a.pg.$$eval('.p2-msg.is-bot:not(.is-typing)', (e) => e.length);
    await a.pg.waitForFunction(() => window.__sr.live(), { timeout: 20000, polling: 50 }).catch(() => {});   // the recogniser pauses while the bot speaks
    const t0 = Date.now();
    const words = t.split(' ');
    for (let i = 1; i <= words.length; i++) { await a.pg.evaluate((x) => window.__sr.say([x], false), words.slice(0, i).join(' ')); await sleep(150); }
    await a.pg.evaluate((x) => window.__sr.say([x], true), t);
    const ok = await a.pg.waitForFunction((n0) => !window.psys2.busy && document.querySelectorAll('.p2-msg.is-bot:not(.is-typing)').length > n0, { timeout: 60000, polling: 20 }, n).then(() => true, () => false);
    out.voice.push({ text: t, ms: Date.now() - t0, ok });
    log(`voice ${JSON.stringify(t)}: ${Date.now() - t0} ms ok=${ok}`);
    await sleep(4000);
  }
  await sleep(2500);
  await a.pg.evaluate(() => { window.__echo.length = 0; });
  await a.pg.focus('input.p2-text');
  for (let i = 0; i < 5; i++) { await a.pg.keyboard.press('a'); await sleep(300); }
  await sleep(300);
  out.echoMs = await a.pg.evaluate(() => window.__echo.slice());
  out.longTasks = await a.pg.evaluate(() => window.__long.slice());
  out.longRuns = longRuns(out.longTasks);
  out.maxLongMs = Math.round(Math.max(0, ...out.longTasks.map((t) => t.dur)));
  out.ort = await a.pg.evaluate(() => ({ stats: window.__psys2Ort?.stats ?? null, paused: !!window.__psys2Ort?.paused }));
  out.modules = await a.pg.evaluate(() => { const m = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\.mjs(\?|$)/.test(n) && !/\/vendor\//.test(n)); return { total: m.length, versioned: m.filter((n) => /\?v=/.test(n)).length }; });
  out.errors = a.errors;
  out.transcript = await a.pg.evaluate(() => [...document.querySelectorAll('.p2-msg')].slice(-14).map((e) => `${e.className.replace('p2-msg ', '')}: ${e.innerText.slice(0, 70)}`));
  out.refetched = srv.log.filter((x) => /ort-worker|app\.mjs|dispatcher|meta\.json|ort-client/.test(x));
  if (profileOut) { const { profile } = await a.cdp.send('Profiler.stop'); await writeFile(profileOut, JSON.stringify(profile)); }
  await b.close(); srv.close(); await rm(dir, { recursive: true, force: true }).catch(() => {});
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2); const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const r = await runFreeze({ liveUrl: opt('url', null), oldRoot: opt('old') ? path.resolve(opt('old')) : null, newRoot: path.resolve(opt('new', path.join(root, 'docs'))), throttle: Number(opt('throttle', 4)), profileOut: opt('profile', null), log: console.log });
  console.log(JSON.stringify({ ...r, longTasks: undefined }, null, 1));
  if (opt('json')) await writeFile(opt('json'), JSON.stringify(r, null, 1));
  process.exit(0);
}
