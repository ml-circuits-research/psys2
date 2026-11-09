#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Turn lifecycle tests in the real webchat (HANG + STOP task, spec 06 "Turn lifecycle"): headless Chrome, 390x844, CPU throttling (default 4x).
 *
 *   1. repro      the user session of 2026-11-09 (make it liek a girl ... get me to New Youk): every line is answered within the 8 s limit.
 *   2. stop       Stop during a slow turn: "Stopped.", the world state is exactly as before, the phrase log says stopped, the chat works afterwards.
 *   3. enter      Enter (and the Send button) during a turn sends nothing, shows the hint and keeps the typed text.
 *   4. watchdog   a turn whose promise never settles ends at the 8 s limit with the "took too long" answer, the phrase log says timeout + stage.
 *   5. random     N random messages (with typo noise) from all evaluation sets: no turn without an answer.
 *
 *   node scripts/test-webchat-turns.mjs [--only repro,stop,enter,watchdog,random] [--throttle 4] [--random 200] [--seed 7] [--chrome /usr/bin/chromium]
 *
 * puppeteer-core is NOT a dependency: set PUPPETEER_CORE to a scratch install (see scripts/perf-webchat.mjs).
 */
import http from 'node:http';
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collectMessages, addNoise, rng } from './fuzz-turns.mjs';

export const DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
export const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
export const REPRO_LINES = ['make it liek a girl', 'make a house and a man', 'draw a some clouds and 2 suns', 'show Bern city', 'get me to New Youk'];
const LIMIT_MS = 8000;

export async function loadPuppeteer() {
  const core = process.env.PUPPETEER_CORE;
  if (!core) throw new Error('set PUPPETEER_CORE to a scratch puppeteer-core install');
  const pp = await import(pathToFileURL(path.join(core, 'lib/puppeteer/puppeteer-core.js')).href);
  return pp.default ?? pp;
}
export async function findChrome(given) {
  for (const c of [given, process.env.CHROME, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].filter(Boolean)) { try { await access(c); return c; } catch { /* next */ } }
  throw new Error('no Chrome/Chromium found');
}

export async function openChat({ throttle = 4, chrome, init = null, settings = { formalizer: 'rules', normalizer: false, showTrace: false }, viewport = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, hash = '' } = {}) {
  const puppeteer = await loadPuppeteer();
  const srv = http.createServer(async (q, r) => {
    try { const p = path.join(DOCS, decodeURIComponent(q.url.split('?')[0])); const f = p.endsWith('/') ? `${p}index.html` : p; r.setHeader('content-type', TYPES[path.extname(f)] ?? 'application/octet-stream'); r.end(await readFile(f)); } catch { r.statusCode = 404; r.end('nf'); }
  }).listen(0);
  const browser = await puppeteer.launch({ executablePath: await findChrome(chrome), headless: true, args: ['--no-sandbox'] });
  const pg = await browser.newPage();
  await pg.setViewport(viewport);
  if (throttle > 1) await (await pg.createCDPSession()).send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await pg.evaluateOnNewDocument((s) => { try { localStorage.setItem('psys2.webchat.settings', JSON.stringify({ settingsVersion: 2, ...s })); } catch { /* ignore */ } }, settings);
  if (init) await pg.evaluateOnNewDocument(init);
  const errors = [];
  const consoleErrors = [];
  pg.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  pg.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  await pg.goto(`http://localhost:${srv.address().port}/webchat/index.html${hash}`, { waitUntil: 'domcontentloaded' });
  await pg.waitForFunction(() => document.querySelector('.p2-msg.is-hint'), { timeout: 120000, polling: 50 });
  const api = {
    pg, errors, consoleErrors, srvPort: srv.address().port,
    close: async () => { await browser.close(); srv.close(); },
    /** Types `text`, presses Enter, waits until the turn ended (no typing bubble, not busy); returns { ms, ok, reply }. */
    async say(text, { timeout = LIMIT_MS + 4000 } = {}) {
      const n = await pg.$$eval('.p2-msg.is-bot:not(.is-typing)', (e) => e.length);
      await pg.type('input.p2-text', text, { delay: 0 });
      const t = Date.now();
      await pg.keyboard.press('Enter');
      const ok = await pg.waitForFunction((n) => !window.psys2.busy && !document.querySelector('.p2-msg.is-typing') && document.querySelectorAll('.p2-msg.is-bot:not(.is-typing)').length > n, { timeout, polling: 20 }, n).then(() => true).catch(() => false);
      return { ms: Date.now() - t, ok, reply: await pg.evaluate(() => [...document.querySelectorAll('.p2-msg.is-bot')].at(-1)?.querySelector('.p2-bubble')?.innerText ?? '') };
    },
    lastPhrase: () => pg.evaluate(() => { const a = JSON.parse(localStorage.getItem('psys2.webchat.phrases') ?? '[]'); return a.at(-1) ?? null; }),
    state: () => pg.evaluate(() => JSON.stringify(window.psys2.session.state())),
    /** Replaces session.send by a slow or never-ending variant (after the real send ran, so the engine already changed the state). */
    slowSend: (ms) => pg.evaluate((ms) => { const s = window.psys2.session; if (!s.__orig) s.__orig = s.send.bind(s); s.send = async (...a) => { const p = s.__orig(...a); await new Promise((r) => (ms ? setTimeout(r, ms) : null)); return p; }; }, ms),
    realSend: () => pg.evaluate(() => { const s = window.psys2.session; if (s.__orig) s.send = s.__orig; }),
  };
  return api;
}

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); return ok; };

export const SCENARIOS = {
  async repro(o) {
    const c = await openChat(o);
    try {
      for (const line of REPRO_LINES) { const r = await c.say(line); check(`repro: "${line}" answered within ${LIMIT_MS} ms`, r.ok && r.ms <= LIMIT_MS, `${r.ms} ms, ${JSON.stringify(r.reply.slice(0, 50))}`); }
      check('repro: no page errors', c.errors.length === 0, c.errors[0] ?? '');
    } finally { await c.close(); }
  },
  async stop(o) {
    const c = await openChat(o);
    try {
      await c.say('make a house and a man');
      const before = await c.state();
      await c.slowSend(6000);
      const n = await c.pg.$$eval('.p2-msg.is-user', (e) => e.length);
      await c.pg.type('input.p2-text', 'draw a some clouds and 2 suns');
      await c.pg.keyboard.press('Enter');
      await c.pg.waitForFunction(() => window.psys2.busy && document.querySelector('button.p2-send.is-stop'), { timeout: 5000 });
      check('stop: the Send button became Stop while the turn runs', await c.pg.$eval('button.p2-send', (b) => b.getAttribute('aria-label') === 'Stop'));
      await new Promise((r) => setTimeout(r, 600));
      const t = Date.now();
      await c.pg.click('button.p2-send');
      await c.pg.waitForFunction(() => !window.psys2.busy && [...document.querySelectorAll('.p2-msg.is-bot')].at(-1)?.innerText.startsWith('Stopped.'), { timeout: 3000 });
      check('stop: answers "Stopped." quickly', Date.now() - t < 2000, `${Date.now() - t} ms`);
      check('stop: the world state is as before the message', (await c.state()) === before);
      const rec = await c.lastPhrase();
      check('stop: the phrase log records the message as stopped', rec?.outcome === 'stopped' && /clouds/.test(rec.text), JSON.stringify({ outcome: rec?.outcome, stage: rec?.stage }));
      check('stop: Send is back', await c.pg.$eval('button.p2-send', (b) => b.getAttribute('aria-label') === 'Send' && b.type === 'submit'));
      await c.realSend();
      const r = await c.say('draw a some clouds and 2 suns');
      check('stop: the chat works afterwards', r.ok && /cloud/i.test(r.reply), r.reply.slice(0, 60));
      void n;
    } finally { await c.close(); }
  },
  async enter(o) {
    const c = await openChat(o);
    try {
      await c.slowSend(8000);
      const users = () => c.pg.$$eval('.p2-msg.is-user', (e) => e.length);
      await c.pg.type('input.p2-text', 'make a house and a man');
      await c.pg.keyboard.press('Enter');
      await c.pg.waitForFunction(() => window.psys2.busy, { timeout: 5000 });
      const n = await users();
      await c.pg.type('input.p2-text', 'second message');
      await c.pg.keyboard.press('Enter');
      await new Promise((r) => setTimeout(r, 300));
      check('enter: during a turn the message is not sent yet', (await users()) === n);
      check('enter: it waits as a chip above the input (MIC2 queue)', (await c.pg.$$eval('.p2-queue .p2-qchip', (e) => e.map((x) => x.textContent))).join('|').startsWith('second message'));
      check('enter: the input is empty and stays editable', (await c.pg.$eval('input.p2-text', (e) => e.value === '' && !e.disabled)));
      await c.realSend();   // the waiting message runs at normal speed once the slow turn ends
      await c.pg.waitForFunction(() => !window.psys2.busy && document.querySelectorAll('.p2-msg.is-user').length >= 2, { timeout: 40000, polling: 50 });
      check('enter: after the answer the waiting message is sent', (await users()) >= n + 1 && (await c.pg.$$eval('.p2-queue .p2-qchip', (e) => e.length)) === 0);
    } finally { await c.close(); }
  },
  async watchdog(o) {
    const c = await openChat(o);
    try {
      await c.slowSend(0);   // never settles
      const r = await c.say('get me to New Youk', { timeout: LIMIT_MS + 5000 });
      check(`watchdog: a promise that never settles ends within ${LIMIT_MS + 1500} ms`, r.ok && r.ms <= LIMIT_MS + 1500, `${r.ms} ms`);
      check('watchdog: useful answer', /took too long/.test(r.reply), r.reply.slice(0, 80));
      const rec = await c.lastPhrase();
      check('watchdog: the phrase log records timeout and the stage', rec?.outcome === 'timeout' && !!rec.stage, JSON.stringify({ outcome: rec?.outcome, stage: rec?.stage }));
      await c.realSend();
      const r2 = await c.say('show me paris');
      check('watchdog: the chat works afterwards', r2.ok && /Paris/.test(r2.reply), r2.reply.slice(0, 60));
    } finally { await c.close(); }
  },
  async random(o) {
    const c = await openChat(o);
    try {
      const all = collectMessages();
      const rand = rng(o.seed ?? 7);
      let bad = 0, slowest = { ms: 0 };
      const n = o.random ?? 200;
      for (let i = 0; i < n; i++) {
        const m = all[Math.floor(rand() * all.length)];
        const text = (rand() < 0.7 ? addNoise(m.text, rand) : m.text).slice(0, 200);
        const r = await c.say(text);
        if (!r.ok || r.ms > LIMIT_MS + 1500) { bad++; console.log(`  no answer in time: ${JSON.stringify(text)} ${r.ms} ms ${r.ok ? '' : '(never ended)'}`); }
        if (r.ms > slowest.ms) slowest = { ms: r.ms, text };
        if (!r.ok) await c.pg.reload({ waitUntil: 'domcontentloaded' }).then(() => c.pg.waitForFunction(() => document.querySelector('.p2-msg.is-hint'), { timeout: 120000 }));
      }
      check(`random: ${n} random messages, no turn without an answer`, bad === 0, `slowest ${slowest.ms} ms: ${JSON.stringify(slowest.text)}`);
    } finally { await c.close(); }
  },
  async busy(o) {
    // BUSY: a fake speechSynthesis that speaks for 2 s; the tabs are veiled during the turn and the speech, Stop lifts the veil at once.
    const fake = () => {
      const timers = [];
      const synth = { speaking: false, getVoices: () => [], cancel() { timers.splice(0).forEach(clearTimeout); synth.speaking = false; window.__cancelled = (window.__cancelled ?? 0) + 1; },
        speak(u) { synth.speaking = true; timers.push(setTimeout(() => { synth.speaking = false; u.onend?.({}); }, 4000)); } };
      Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
      window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    };
    const c = await openChat({ ...o, init: fake, settings: { formalizer: 'rules', normalizer: false, showTrace: false, speaker: true } });
    const veiled = () => c.pg.evaluate(() => { const p = document.querySelector('.p2-panel:not([hidden])'); return { veil: p.classList.contains('is-busy'), inert: p.inert || p.id.match(/map|diagram|charts/) != null, busy: p.getAttribute('aria-busy'), spin: !!document.querySelector('.p2-tab.is-busy'), host: window.psys2.isBusy() }; });
    try {
      await c.pg.evaluate(() => window.psys2.showTab('robot'));
      await c.pg.evaluate(() => { window.psys2.settings.speaker = true; document.querySelector('.p2-speaker')?.getAttribute('aria-pressed') === 'true' || document.querySelector('.p2-speaker').click(); });
      const say = async (t) => { await c.pg.type('input.p2-text', t, { delay: 0 }); await c.pg.keyboard.press('Enter'); };
      await c.pg.waitForSelector('.p2-avatar-gallery button', { timeout: 15000 });
      await say('hello');
      await c.pg.waitForFunction(() => window.psys2.veiled, { timeout: 5000, polling: 20 });
      const v = await veiled();
      check('busy: veil, inert, aria-busy and spinner while the answer is spoken', v.veil && v.inert && v.busy === 'true' && v.spin && v.host, JSON.stringify(v));
      const users = () => c.pg.$$eval('.p2-msg.is-user', (e) => e.length);
      const n0 = await users();
      const rect = await c.pg.evaluate(() => { const b = document.querySelector('.p2-avatar-gallery button:not([aria-pressed="true"])') ?? document.querySelector('.p2-avatar-chip'); b.scrollIntoView({ block: 'center', inline: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await c.pg.mouse.click(rect.x, rect.y);
      await new Promise((r) => setTimeout(r, 300));
      check('busy: clicking the avatar gallery during the speech does nothing (veil visible)', (await users()) === n0 && (await veiled()).veil, `${n0} -> ${await users()}`);
      check('busy: typing stays possible', await c.pg.$eval('input.p2-text', (i) => !i.disabled && !i.closest('[inert]')));
      await c.pg.waitForFunction(() => !window.psys2.isBusy(), { timeout: 12000, polling: 50 });
      const after = await veiled();
      check('busy: the veil is gone after the speech', !after.veil && !after.inert && after.busy === null && !after.spin, JSON.stringify(after));
      await c.pg.mouse.click(rect.x, rect.y);
      await c.pg.waitForFunction((n) => document.querySelectorAll('.p2-msg.is-user').length > n, { timeout: 4000 }, n0).then(() => check('busy: after the speech the same click works', true)).catch(() => check('busy: after the speech the same click works', false));
      await c.pg.waitForFunction(() => !window.psys2.isBusy(), { timeout: 8000, polling: 50 });
      // Stop during the speech lifts the veil at once
      await say('hi there');
      await c.pg.waitForFunction(() => window.psys2.veiled, { timeout: 5000, polling: 20 });
      await c.pg.evaluate(() => window.psys2.stop());
      await new Promise((r) => setTimeout(r, 120));
      const st = await veiled();
      check('busy: Stop lifts the veil at once and cuts the speech', !st.host && !st.veil && (await c.pg.evaluate(() => window.__cancelled)) >= 1, JSON.stringify(st));
      // an effect that never ends: the turn is bounded, the veil does not stay
      check('busy: 0 console errors', c.consoleErrors.length === 0 && c.errors.length === 0, [...c.consoleErrors, ...c.errors][0] ?? '');
    } finally { await c.close(); }
  },
  async busyChess(o) {
    const c = await openChat({ ...o, settings: { formalizer: 'rules', normalizer: false, showTrace: false } });
    try {
      await c.pg.evaluate(() => window.psys2.showTab('chess'));
      // the engine thinks: a slow chess.engine.bestmove effect
      await c.pg.type('input.p2-text', 'new chess game', { delay: 0 }); await c.pg.keyboard.press('Enter');
      await c.pg.waitForFunction(() => !window.psys2.busy, { timeout: 12000, polling: 50 });
      await c.pg.evaluate(() => { const s = window.psys2.session; if (!s.__orig) s.__orig = s.send.bind(s); s.send = async (...a) => { const r = await s.__orig(...a); await new Promise((x) => setTimeout(x, 1500)); return r; }; });
      await c.pg.type('input.p2-text', 'e4', { delay: 0 }); await c.pg.keyboard.press('Enter');
      await c.pg.waitForFunction(() => window.psys2.veiled, { timeout: 5000, polling: 20 });
      const mid = await c.pg.evaluate(() => { const p = document.querySelector('#p2-panel-chess'); return { veil: p.classList.contains('is-busy'), inert: p.inert }; });
      check('busy: chess panel is veiled and inert while the move is processed', mid.veil && mid.inert, JSON.stringify(mid));
      await c.pg.evaluate(() => window.psys2.stop());
      await new Promise((r) => setTimeout(r, 120));
      check('busy: Stop lifts the chess veil at once', !(await c.pg.evaluate(() => window.psys2.veiled)));
      check('busy: chess 0 console errors', c.consoleErrors.length === 0 && c.errors.length === 0, [...c.consoleErrors, ...c.errors][0] ?? '');
    } finally { await c.close(); }
  },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  const o = { throttle: Number(opt('throttle', 4)), chrome: opt('chrome'), random: Number(opt('random', 200)), seed: Number(opt('seed', 7)) };
  const only = opt('only', 'repro,stop,enter,watchdog,random,busy,busyChess').split(',');
  for (const name of only) { console.log(`\n== ${name} (cpu ${o.throttle}x)`); try { await SCENARIOS[name](o); } catch (e) { check(`${name}: scenario ran`, false, e.message); } }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
}
