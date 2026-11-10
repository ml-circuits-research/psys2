#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Voice soak test (FREEZE, P0): headless Chrome with CPU throttling (default 4x), a FAKE SpeechRecognition that streams a mix of
 *   - the user's 67 real voice messages (training/eval/real-phrases-2026-11-09e.jsonl) in their original order with their real gaps
 *     (clamped to 4..45 s and scaled to fill the duration), spoken word by word as interim results and ended by a final result, and
 *   - random Romanian and English background talk every few seconds (room noise, not commands),
 * with the microphone switched on once and left on. A second tab is opened at the midpoint.
 *
 *   node scripts/soak-webchat.mjs [--minutes 30] [--throttle 4] [--chrome /usr/bin/chromium] [--rules] [--nx hybrid|neural|rules] [--json out.json] [--seed 1]
 *
 * Assertions (exit code 1 when one fails):
 *   - heap flat: median JS heap of the last quarter <= 1.35 x the median of the second quarter + 25 MB (a forced GC before each sample);
 *   - worker count flat: the maximum number of page workers never grows past the first stable count;
 *   - main-thread busy: CPU task time (Performance.getMetrics TaskDuration) per wall second, < 50 % averaged over the run and < 70 % in the worst minute (the FREEZE-6 gate);
 *   - 0 watchdog endings: no "That took too long" turn;
 *   - ORT restarts <= 2 (window.__psys2Ort.stats.restarts), and the models were not paused (encoder mode);
 *   - input echo < 100 ms at the end (median of 5 key presses, event time to the next paint, 3 s after the last speech);
 *   - the second tab never started listening (no recogniser started, mic state not listening) and the first tab kept listening and kept receiving.
 *
 * puppeteer-core is NOT a dependency: set PUPPETEER_CORE to a scratch install (see scripts/perf-webchat.mjs).
 */
import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPuppeteer, findChrome, DOCS, TYPES } from './test-webchat-turns.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const MINUTES = Number(opt('minutes', 30));
const THROTTLE = Number(opt('throttle', 4));
const RULES = argv.includes('--rules');
let seed = Number(opt('seed', 1));
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const NOISE_RO = ['să mi spună domnul bujii lui tata', 'Dar cu cine vorbești ce vrei', 'tata ce pot să zic', 'unchiul', 'voi', 'faci tu', 'enervant da', 'scuze',
  'ia uite ce a zis vecina despre mașina aia nouă', 'nu mai vreau să mănânc supă că nu e bună deloc', 'hai mai repede că întârziem la școală', 'mă duc să iau pâinea de la magazin',
  'și atunci ea a zis că nu vine la petrecere', 'cine a luat telecomanda de pe masă', 'lasă că vorbim mai târziu despre asta', 'ai terminat temele sau nu', 'ce mai faci tu azi',
  'vezi că vine mama acasă', 'nu știu zău ce să zic', 'hai să mergem la bunica în weekend', 'pune și tu ceva pe masă', 'mi-e foame de cât am stat', 'da da bine bine'];
const NOISE_EN = ['I think we should go to the store later today', 'where did you put my keys', 'do you want some tea or coffee', 'no no wait for me', 'that was a really long meeting',
  'can you pass me the remote', 'what time is the game on', 'I will call you back in a minute', 'yes of course', 'honey dinner is ready'];

async function schedule(durationMs) {
  const rows = (await readFile(path.join(ROOT, 'training/eval/real-phrases-2026-11-09e.jsonl'), 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const gaps = rows.map((r, i) => (i ? Math.min(45000, Math.max(4000, Date.parse(r.time) - Date.parse(rows[i - 1].time))) : 3000));
  const total = gaps.reduce((a, b) => a + b, 0);
  const k = (durationMs * 0.92 - 5000) / total;
  const ev = []; let t = 5000;
  rows.forEach((r, i) => { t += gaps[i] * k; ev.push({ at: Math.round(t), text: r.text, kind: 'msg' }); });
  for (let at = 7000; at < durationMs - 8000; at += 2500 + Math.floor(rnd() * 4000)) ev.push({ at, text: rnd() < 0.7 ? pick(NOISE_RO) : pick(NOISE_EN), kind: 'noise' });
  return ev.sort((a, b) => a.at - b.at);
}

/** Installed before the page scripts: a recogniser that does nothing by itself; the harness feeds it through window.__sr. */
function fakeSpeech() {
  const all = [];
  class FakeSR {
    constructor() { this.started = false; this.lang = ''; all.push(this); }
    start() { this.started = true; this.everStarted = true; setTimeout(() => { if (this.started && !this.dead) this.onstart?.(); }, 20); }
    stop() { setTimeout(() => this.end(), 20); }
    abort() { this.dead = true; setTimeout(() => this.end(), 0); }
    end() { if (this.started) { this.started = false; this.onend?.(); } }
  }
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak(u) { setTimeout(() => u.onend?.(), 400); }, cancel() {}, getVoices: () => [], addEventListener() {} } });
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
  window.__sr = {
    all,
    live: () => all.filter((r) => r.started).at(-1) ?? null,
    everStarted: () => all.some((r) => r.everStarted),
    say(texts, final) { const r = this.live(); if (!r) return false; r.onresult({ resultIndex: 0, results: texts.map((t) => Object.assign([{ transcript: t }], { isFinal: final })) }); return true; },
  };
  // input-echo probe: time from the browser's key event to the next paint
  window.__echo = [];
  addEventListener('input', (e) => { const t = e.timeStamp; requestAnimationFrame(() => requestAnimationFrame(() => window.__echo.push(performance.now() - t))); }, true);
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

async function main() {
  const durationMs = MINUTES * 60000;
  const events = await schedule(durationMs);
  const puppeteer = await loadPuppeteer();
  const srv = http.createServer(async (q, r) => {
    try { const p = path.join(DOCS, decodeURIComponent(q.url.split('?')[0])); const f = p.endsWith('/') ? `${p}index.html` : p; r.setHeader('content-type', TYPES[path.extname(f)] ?? 'application/octet-stream'); r.end(await readFile(f)); } catch { r.statusCode = 404; r.end('nf'); }
  }).listen(0);
  const browser = await puppeteer.launch({ executablePath: await findChrome(opt('chrome')), headless: true, args: ['--no-sandbox', '--js-flags=--expose-gc'] });
  const settings = { settingsVersion: 2, formalizer: RULES ? 'rules' : 'encoder', normalizer: !RULES, showTrace: false, language: 'auto', keepListening: true, ...(opt('nx', null) ? { nxStrategy: opt('nx') } : {}) };
  const url = `http://localhost:${srv.address().port}/webchat/index.html`;
  const openTab = async () => {
    const pg = await browser.newPage();
    await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const cdp = await pg.createCDPSession();
    if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    await cdp.send('Performance.enable');
    await pg.evaluateOnNewDocument((s) => { try { if (!localStorage.getItem('psys2.soak.seeded')) { localStorage.setItem('psys2.webchat.settings', JSON.stringify(s)); localStorage.setItem('psys2.soak.seeded', '1'); } } catch { /* ignore */ } }, settings);
    await pg.evaluateOnNewDocument(fakeSpeech);
    const errors = [];
    pg.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    await pg.goto(url, { waitUntil: 'domcontentloaded' });
    await pg.waitForFunction(() => document.querySelector('.p2-msg.is-hint'), { timeout: 180000, polling: 50 });
    return { pg, cdp, errors };
  };

  const t1 = await openTab();
  const { pg, cdp } = t1;
  if (!RULES) await pg.waitForFunction(() => document.querySelector('.p2-status, body')?.innerText.match(/dispatcher|model/i), { timeout: 120000, polling: 500 }).catch(() => {});
  await pg.click('button.p2-mic');
  await pg.waitForFunction(() => window.__sr.live(), { timeout: 10000, polling: 20 });
  console.log(`soak: ${MINUTES} min, throttle ${THROTTLE}x, ${RULES ? 'rules' : 'encoder+normalizer'}, ${events.filter((e) => e.kind === 'msg').length} real messages + ${events.filter((e) => e.kind === 'noise').length} noise utterances`);

  const samples = [];
  const metric = async (name) => (await cdp.send('Performance.getMetrics')).metrics.find((m) => m.name === name)?.value ?? 0;
  let lastTask = await metric('TaskDuration'), lastWall = Date.now();
  const sample = async () => {
    await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
    const now = Date.now(), task = await metric('TaskDuration');
    const heap = await metric('JSHeapUsedSize');
    const busy = (task - lastTask) / ((now - lastWall) / 1000); lastTask = task; lastWall = now;
    const workers = pg.workers().length;
    const info = await pg.evaluate(() => ({
      users: document.querySelectorAll('.p2-msg.is-user').length,
      dom: document.getElementsByTagName('*').length,
      stopped: [...document.querySelectorAll('.p2-msg.is-stopped')].filter((e) => /took too long/.test(e.innerText)).length,
      restarts: window.__psys2Ort?.stats?.restarts ?? null, paused: !!window.__psys2Ort?.paused, ortStats: window.__psys2Ort?.stats ?? null,
      listening: !!window.__sr.live(), mic: document.querySelector('button.p2-mic')?.dataset.mic ?? '',
    }));
    samples.push({ t: Math.round((now - t0) / 1000), heapMB: heap / 1048576, busy, workers, ...info });
  };

  const PROFILE = argv.includes('--profile');
  if (PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 2000 }); await cdp.send('Profiler.start'); }
  const TRACE = opt('trace', '');
  if (TRACE) await pg.tracing.start({ path: TRACE, categories: ['-*', 'devtools.timeline', 'v8.execute', 'blink.user_timing'] });
  const t0 = Date.now();
  let second = null, secondInfo = null, next = 0, lastSample = 0, dropped = 0;
  while (true) {
    const el = Date.now() - t0;
    if (el > durationMs) break;
    if (el - lastSample >= 15000) { lastSample = el; await sample(); const s = samples.at(-1); process.stdout.write(`  t=${s.t}s heap ${s.heapMB.toFixed(0)} MB busy ${(s.busy * 100).toFixed(0)}% workers ${s.workers} users ${s.users} restarts ${s.restarts} mic ${s.mic}\n`); }
    if (!second && el > durationMs / 2) {
      second = await openTab();
      secondInfo = { opened: Math.round((Date.now() - t0) / 1000) };
      await pg.bringToFront().catch(() => {});
      continue;
    }
    const e = events[next];
    if (!e || e.at > el) { await sleep(Math.min(200, e ? e.at - el : 200)); continue; }
    next++;
    // speak: interim results word by word, then a final result (the always-on recogniser keeps the same text until the next event)
    const words = e.text.split(' ');
    let ok = true;
    for (let i = 1; i <= words.length && ok; i++) { ok = await pg.evaluate((t) => window.__sr.say([t], false), words.slice(0, i).join(' ')).catch(() => false); await sleep(180); }
    if (ok) await pg.evaluate((t) => window.__sr.say([t], true), e.text).catch(() => {}); else dropped++;
  }
  // quiet period, then the echo probe
  await sleep(3000);
  await sample();
  await pg.focus('input.p2-text'); await pg.evaluate(() => { window.__echo.length = 0; });
  for (let i = 0; i < 5; i++) { await pg.keyboard.press('a'); await sleep(400); }
  await sleep(300);
  const echo = await pg.evaluate(() => window.__echo.slice());
  if (second) {
    secondInfo.everStarted = await second.pg.evaluate(() => window.__sr.everStarted());
    secondInfo.mic = await second.pg.evaluate(() => document.querySelector('button.p2-mic')?.dataset.mic ?? '');
    secondInfo.errors = second.errors.length;
    secondInfo.firstStillListening = await pg.evaluate(() => !!window.__sr.live());
  }
  if (TRACE) await pg.tracing.stop();
  if (PROFILE) {
    const { profile } = await cdp.send('Profiler.stop');
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const self = new Map(); const dt = profile.timeDeltas; let total = 0, idle = 0;
    profile.samples.forEach((id, i) => { const n = byId.get(id); const d = dt[i] ?? 0; total += d; const f = n.callFrame; if (/^\((idle|program)\)$/.test(f.functionName)) { idle += d; return; } const k = `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber}`; self.set(k, (self.get(k) ?? 0) + d); });
    // inclusive by named function (top-down): add sample time to every distinct function on the stack
    const parent = new Map(); profile.nodes.forEach((n) => (n.children ?? []).forEach((c) => parent.set(c, n.id)));
    const incl = new Map();
    profile.samples.forEach((id, i) => { const seen = new Set(); for (let c = id; c; c = parent.get(c)) { const f = byId.get(c).callFrame; if (!f.url) continue; const k = `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber}`; if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) ?? 0) + (dt[i] ?? 0)); } } });
    const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${(v / 1000 / 1000).toFixed(1)}s ${(v / total * 100).toFixed(1)}%  ${k}`);
    console.log(`\nprofile: total ${(total / 1e6).toFixed(0)}s, idle ${(idle / total * 100).toFixed(0)}%\n-- self\n${top(self, 25).join('\n')}\n-- inclusive\n${top(incl, 45).join('\n')}`);
    await writeFile(opt('profile-out', '/tmp/soak.cpuprofile'), JSON.stringify(profile));
  }
  const turns = await pg.evaluate(() => (globalThis.__psys2Perf ?? []).map((r) => ({ totalMs: r.totalMs, engineMs: r.engineMs, render: r.render, effects: r.effects, stages: r.stages }))).catch(() => []);
  if (turns.length) {
    const agg = {}; for (const r of turns) for (const [k, v] of Object.entries(r.stages ?? {})) { const a = (agg[k] ??= { n: 0, ms: 0 }); a.n += v.n; a.ms += v.ms; }
    const sum = (f) => turns.reduce((a, r) => a + (r[f] ?? 0), 0);
    console.log(`\nturns: ${turns.length}, total ${(sum('totalMs') / 1000).toFixed(1)}s (engine ${(sum('engineMs') / 1000).toFixed(1)}s, render ${(sum('render') / 1000).toFixed(1)}s, effects ${(sum('effects') / 1000).toFixed(1)}s); mean ${(sum('totalMs') / turns.length).toFixed(0)} ms, max ${Math.max(...turns.map((r) => r.totalMs))} ms`);
    console.log('stages (inclusive): ' + Object.entries(agg).sort((a, b) => b[1].ms - a[1].ms).slice(0, 12).map(([k, v]) => `${k} ${(v.ms / 1000).toFixed(1)}s/${v.n}`).join('  '));
  }
  const usersAtEnd = samples.at(-1).users;
  const usersAtSecond = secondInfo ? (samples.filter((s) => s.t <= secondInfo.opened).at(-1)?.users ?? 0) : null;
  await browser.close(); srv.close();

  // ---- verdict ----
  const settled = samples.filter((s) => s.t >= Math.min(120, durationMs / 5000));
  const q = (a, lo, hi) => a.slice(Math.floor(a.length * lo), Math.max(Math.floor(a.length * lo) + 1, Math.floor(a.length * hi)));
  const heapMid = median(q(settled, 0.25, 0.5).map((s) => s.heapMB)), heapEnd = median(q(settled, 0.75, 1).map((s) => s.heapMB));
  const workersFirst = settled[0]?.workers ?? 0, workersMax = Math.max(...settled.map((s) => s.workers));
  const busyAvg = samples.reduce((a, s) => a + s.busy, 0) / samples.length;
  const worstMinute = Math.max(...samples.map((_, i) => { const w = samples.slice(i, i + 4); return w.reduce((a, s) => a + s.busy, 0) / w.length; }));
  const last = samples.at(-1);
  const stopped = Math.max(...samples.map((s) => s.stopped));
  const echoMed = median(echo);
  const out = { minutes: MINUTES, throttle: THROTTLE, mode: RULES ? 'rules' : 'encoder+normalizer', commit: null, heapMidMB: heapMid, heapEndMB: heapEnd, workersFirst, workersMax, busyAvg, worstMinute, watchdog: stopped, ortRestarts: last.restarts, ortPaused: last.paused, echoMs: echoMed, echoAll: echo, users: usersAtEnd, dropped, second: secondInfo, pageErrors: t1.errors.length, samples };
  const results = [];
  const check = (name, ok, detail) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (${detail})`); };
  console.log('');
  check('heap flat', heapEnd <= heapMid * 1.35 + 25, `second quarter ${heapMid.toFixed(0)} MB, last quarter ${heapEnd.toFixed(0)} MB`);
  check('worker count flat', workersMax <= workersFirst, `first ${workersFirst}, max ${workersMax}`);
  check('main-thread busy < 50% (average)', busyAvg < 0.5, `${(busyAvg * 100).toFixed(0)}%`);
  check('main-thread busy < 70% (worst minute)', worstMinute < 0.7, `${(worstMinute * 100).toFixed(0)}%`);
  check('0 watchdog endings', stopped === 0, String(stopped));
  check('ORT restarts <= 2, models not paused', RULES || (last.restarts <= 2 && !last.paused), `restarts ${last.restarts}, paused ${last.paused}`);
  check('input echo < 100 ms at the end', echo.length >= 3 && echoMed < 100, `median ${echoMed.toFixed(0)} ms of ${echo.map((x) => x.toFixed(0)).join('/')}`);
  check('the first tab kept receiving voice messages', usersAtEnd > (usersAtSecond ?? 0) + 3, `${usersAtSecond} user messages when the second tab opened, ${usersAtEnd} at the end`);
  check('the second tab never started listening and the first kept listening', !!secondInfo && !secondInfo.everStarted && secondInfo.mic !== 'listening' && secondInfo.firstStillListening, JSON.stringify(secondInfo));
  check('no page errors', t1.errors.length === 0, t1.errors[0] ?? '');
  const json = opt('json');
  if (json) await writeFile(json, JSON.stringify(out, null, 1));
  console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
  process.exit(results.every(Boolean) ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(2); });
