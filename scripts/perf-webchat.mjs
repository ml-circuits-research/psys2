#!/usr/bin/env node
// Webchat performance harness (PERF task). Serves docs/webchat on localhost and drives it in headless Chrome with a mobile
// viewport (390x844) and CPU throttling (default 4x). Reports page-ready time and the time of each message, in the rules and
// the encoder settings.
//
//   node scripts/perf-webchat.mjs [--mode rules|encoder|encoder+n1|all] [--throttle 4] [--runs 1] [--json out.json]
//                                 [--chrome /usr/bin/chromium] [--messages "a|b|c"]
//                                 [--net none|fast4g|slow4g] [--cache cold|warm] [--http h1|h2]
//
// DEFINITIONS (printed in the output, the reviewer measures the same things):
//   input        navigation start -> the text input exists in the DOM.
//   ready        navigation start -> the session exists and the hint message is shown (the page can take a message).
//   first answer time from ready until the first message ("hello", sent the moment ready is seen, while the warm-up and the model
//                load are still running) is answered; "usable" = ready + first answer. This is what a user feels.
//   model ready  navigation start -> the status line shows the dispatcher model version (encoder modes only).
//   per message  Enter -> the answer bubble is complete, measured after model ready (steady state).
//   --net        CDP network emulation: fast4g = 9 Mbit/s down, 170 ms RTT; slow4g = 1.6 Mbit/s, 300 ms. The server gzips text
//                responses like a static host would (gzip counts as wire bytes). none = localhost.
//   --http       h2 (default: HTTP/2 over TLS with a self-signed certificate, like GitHub Pages or any CDN) or h1 (plain HTTP/1.1, six connections per host: a
//                worst case for the ~120 small module files).
//   --cache      cold = a fresh browser profile per run; warm = the same profile is visited once first (models then come from
//                the Cache API / HTTP cache), then the page is reloaded and measured.
//
// puppeteer-core is NOT a dependency of the repository. Install it in a scratch directory and point PUPPETEER_CORE at it:
//   mkdir /tmp/pp && cd /tmp/pp && npm i puppeteer-core && PUPPETEER_CORE=/tmp/pp/node_modules/puppeteer-core node scripts/perf-webchat.mjs
import http from 'node:http';
import { readFile, access, writeFile, mkdtemp, rm } from 'node:fs/promises';
import zlib from 'node:zlib';
import http2 from 'node:http2';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const ROOT = opt('root') ? path.resolve(opt('root')) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');   // --root <dir>: a directory that contains webchat/ (to measure another build)
const MODES = opt('mode', 'all') === 'all' ? ['rules', 'encoder', 'encoder+n1'] : opt('mode').split(',');
const THROTTLE = Number(opt('throttle', 4));
const RUNS = Number(opt('runs', 1));
const HTTP = opt('http', 'h2'); const NET = opt('net', 'none'); const CACHE = opt('cache', 'cold');
const NETS = { fast4g: { latency: 170, downloadThroughput: 9e6 / 8, uploadThroughput: 3e6 / 8 }, slow4g: { latency: 300, downloadThroughput: 1.6e6 / 8, uploadThroughput: 0.75e6 / 8 } };
const MESSAGES = opt('messages', 'hello|what is 3 plus 4|spider legs and 3 plus 4|pls make ur eyes square|show me paris|hello').split('|');

async function loadPuppeteer() {
  const cands = [process.env.PUPPETEER_CORE, '/tmp/claude-1000/-home-salboaie-work-psys2/57c88231-38dc-4b27-a5d0-162542cee3e0/scratchpad/pp/node_modules/puppeteer-core'].filter(Boolean);
  for (const c of cands) {
    try { await access(path.join(c, 'lib/puppeteer/puppeteer-core.js')); return await import(pathToFileURL(path.join(c, 'lib/puppeteer/puppeteer-core.js')).href); } catch { /* next */ }
  }
  try { return await import('puppeteer-core'); } catch { throw new Error('puppeteer-core not found: set PUPPETEER_CORE to a scratch install'); }
}
async function findChrome() {
  for (const c of [opt('chrome'), process.env.CHROME, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].filter(Boolean)) { try { await access(c); return c; } catch { /* next */ } }
  throw new Error('no Chrome/Chromium found: pass --chrome');
}
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.onnx': 'application/octet-stream', '.svg': 'image/svg+xml', '.txt': 'text/plain' };
async function serve() {
  const handler = async (q, r) => {
    try {
      const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); const f = p.endsWith('/') ? `${p}index.html` : p;
      const ext = path.extname(f); r.setHeader('content-type', types[ext] ?? 'application/octet-stream'); r.setHeader('cache-control', 'public, max-age=600');
      let body = await readFile(f);
      if (['.html', '.mjs', '.js', '.json', '.css', '.svg', '.txt'].includes(ext) && /gzip/.test(q.headers['accept-encoding'] ?? '')) { body = zlib.gzipSync(body, { level: 6 }); r.setHeader('content-encoding', 'gzip'); }
      r.end(body);
    } catch { r.statusCode = 404; r.end('nf'); }
  };
  if (HTTP === 'h2') {   // like a real static host: HTTP/2 over TLS (self-signed certificate made with openssl, Chrome runs with --ignore-certificate-errors)
    const dir = await mkdtemp(path.join(os.tmpdir(), 'perf-webchat-cert-'));
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'), '-days', '2', '-subj', '/CN=localhost'], { stdio: 'ignore' });
    const srv = http2.createSecureServer({ key: await readFile(path.join(dir, 'k.pem')), cert: await readFile(path.join(dir, 'c.pem')), allowHTTP1: true }, handler).listen(0);
    srv.scheme = 'https'; return srv;
  }
  const srv = http.createServer(handler).listen(0); srv.scheme = 'http'; return srv;
}
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };

async function runOnce(puppeteer, chrome, port, mode, scheme) {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'perf-webchat-'));
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--ignore-certificate-errors', '--allow-insecure-localhost', '--disable-features=CertVerifierService,CertVerifierBuiltin'], userDataDir: profile });
  try {
    if (CACHE === 'warm') {   // visit once without throttling, wait for the models, then measure a fresh page in the same profile
      const w = await browser.newPage();
      const ws = { settingsVersion: 2, formalizer: mode === 'rules' ? 'rules' : 'encoder', normalizer: mode === 'encoder+n1', showTrace: false };
      await w.evaluateOnNewDocument((s) => { try { localStorage.setItem('psys2.webchat.settings', JSON.stringify(s)); } catch { /* ignore */ } }, ws);
      w.on('pageerror', (e) => console.error('warm pageerror', String(e).slice(0, 200))); w.on('console', (m) => { if (m.type() === 'error') console.error('warm console', m.text().slice(0, 200)); });
      await w.goto(`${scheme}://localhost:${port}/webchat/index.html`, { waitUntil: 'domcontentloaded' });
      await w.waitForFunction(() => document.querySelector('.p2-msg.is-hint'), { timeout: 60000, polling: 100 });
      if (mode !== 'rules') await w.waitForFunction(() => /model v/.test(document.querySelector('.p2-status')?.textContent ?? ''), { timeout: 240000, polling: 200 }).catch(() => {});
      if (mode === 'encoder+n1') await new Promise((r) => setTimeout(r, 20000));
      await w.close();
    }
    const pg = await browser.newPage();
    await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const cdp = await pg.createCDPSession();
    if (NET !== 'none') { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, ...NETS[NET] }); }
    if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    const settings = { settingsVersion: 2, formalizer: mode === 'rules' ? 'rules' : 'encoder', normalizer: mode === 'encoder+n1', showTrace: false };
    await pg.evaluateOnNewDocument((s) => { try { localStorage.setItem('psys2.webchat.settings', JSON.stringify(s)); } catch { /* ignore */ } }, settings);
    pg.on('console', (m) => { if (/VOCAB/.test(m.text())) console.log(m.text().slice(0, 700)); }); pg.on('pageerror', (e) => console.error('pageerror', String(e).slice(0, 200)));
    const t0 = Date.now();
    await pg.goto(`${scheme}://localhost:${port}/webchat/index.html`, { waitUntil: 'domcontentloaded' });
    await pg.waitForSelector('input.p2-text');
    const tInput = Date.now() - t0;
    // ready = the session exists (the hint message is added at the end of boot)
    await pg.waitForFunction(() => document.querySelector('.p2-msg.is-hint'), { timeout: 180000, polling: 50 });
    const ready = Date.now() - t0;
    // first answer: send a message right away, while the warm-up and the model load are running
    if (opt('first-delay')) await new Promise((r) => setTimeout(r, Number(opt('first-delay'))));
    if (args.includes('--profile')) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
    const nb = await pg.$$eval('.p2-msg:not(.is-typing)', (e) => e.length);
    await pg.type('input.p2-text', 'hello', { delay: 0 }); const tf = Date.now(); await pg.keyboard.press('Enter');
    await pg.waitForFunction((n) => document.querySelectorAll('.p2-msg:not(.is-typing)').length >= n + 2 && !document.querySelector('.p2-msg.is-typing'), { timeout: 180000, polling: 10 }, nb);
    const firstAnswerMs = Date.now() - tf;
    if (args.includes('--profile')) {   // top self-time functions between ready and the first answer (CPU already throttled, so times are x THROTTLE)
      const { profile } = await cdp.send('Profiler.stop'); const self = new Map(); const byId = new Map(profile.nodes.map((n) => [n.id, n]));
      profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) ?? 0) + profile.timeDeltas[i] / 1000); });
      console.log('  profile (ms, self):\n' + [...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `    ${v.toFixed(0).padStart(6)} ${k}`).join('\n'));
    }
    const modelReady = mode === 'rules' ? null : await pg.waitForFunction(() => /model v/.test(document.querySelector('.p2-status')?.textContent ?? '') || /could not/.test(document.body.innerText), { timeout: 180000, polling: 100 }).then(() => Date.now() - t0).catch(() => null);
    const out = { mode, inputMs: tInput, readyMs: ready, modelReadyMs: modelReady, firstAnswerMs, usableMs: ready + firstAnswerMs, messages: [] };
    for (const msg of MESSAGES) {
      const before = await pg.$$eval('.p2-msg:not(.is-typing)', (e) => e.length);
      await pg.type('input.p2-text', msg, { delay: 0 });
      const t1 = Date.now();
      await pg.keyboard.press('Enter');
      await pg.waitForFunction((n) => document.querySelectorAll('.p2-msg:not(.is-typing)').length >= n + 2 && !document.querySelector('.p2-msg.is-typing'), { timeout: 120000, polling: 10 }, before);
      const ms = Date.now() - t1;
      const info = await pg.evaluate(() => { const m = [...document.querySelectorAll('.p2-msg.is-bot')].at(-1); return { reply: m?.querySelector('.p2-bubble')?.innerText.slice(0, 60), took: m?.querySelector('.p2-took')?.textContent ?? null }; });
      out.messages.push({ msg, ms, ...info });
      await new Promise((r) => setTimeout(r, 300));
    }
    out.marks = await pg.evaluate(() => performance.getEntriesByType('mark').filter((m) => m.name.startsWith('psys2:')).map((m) => `${m.name.slice(6)} ${Math.round(m.startTime)}`).join(', ')).catch(() => null);
    out.stages = await pg.evaluate(() => globalThis.__psys2Perf ?? null).catch(() => null);
    return out;
  } finally { await browser.close(); await rm(profile, { recursive: true, force: true }).catch(() => {}); }
}

const puppeteer = (await loadPuppeteer()).default ?? await loadPuppeteer(); const chrome = await findChrome(); const srv = await serve(); const port = srv.address().port; const scheme = srv.scheme;
const results = [];
try {
  for (const mode of MODES) for (let i = 0; i < RUNS; i++) {
    const r = await runOnce(puppeteer, chrome, port, mode, scheme); results.push(r);
    console.log(`\n== ${mode} (cpu ${THROTTLE}x, net ${NET}, ${HTTP}, cache ${CACHE}) input ${r.inputMs} ms, ready ${r.readyMs} ms, first answer ${r.firstAnswerMs} ms (usable ${r.usableMs} ms), model ready ${r.modelReadyMs ?? 'n/a'} ms`);
    for (const m of r.messages) console.log(`  ${String(m.ms).padStart(6)} ms  ${m.msg.padEnd(30)} -> ${JSON.stringify(m.reply)}${m.took ? ` [${m.took}]` : ''}`);
    if (r.marks) console.log(`  marks (ms since navigation): ${r.marks}`);
    const ts = r.messages.map((m) => m.ms); console.log(`  p50 ${pct(ts, 0.5)} ms  p95 ${pct(ts, 0.95)} ms`);
    if (r.stages && args.includes('--stages')) for (const x of r.stages) console.log(`  [${x.text}] engine ${x.engineMs} render ${x.render} effects ${x.effects}: ` + Object.entries(x.stages ?? {}).map(([k, v]) => `${k} ${v.n}x/${v.ms}`).join(', '));
  }
} finally { srv.close(); }
if (opt('json')) await writeFile(opt('json'), JSON.stringify(results, null, 2));
console.log('\n| mode | input | ready | first answer | model ready | p50 msg | p95 msg | per message (ms) |\n| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of results) { const ts = r.messages.map((m) => m.ms); console.log(`| ${r.mode} | ${r.inputMs} | ${r.readyMs} | ${r.firstAnswerMs} | ${r.modelReadyMs ?? 'n/a'} | ${pct(ts, 0.5)} | ${pct(ts, 0.95)} | ${ts.join(' / ')} |`); }
if (RUNS > 1) {
  const med = (xs) => pct(xs, 0.5);
  console.log(`\nMedian over ${RUNS} runs\n\n| mode | input | ready | first answer | model ready | per message (ms, median) | p50 | p95 |\n| --- | --- | --- | --- | --- | --- | --- | --- |`);
  for (const mode of MODES) {
    const rs = results.filter((r) => r.mode === mode); if (!rs.length) continue;
    const per = MESSAGES.map((_, i) => med(rs.map((r) => r.messages[i].ms)));
    console.log(`| ${mode} | ${med(rs.map((r) => r.inputMs))} | ${med(rs.map((r) => r.readyMs))} | ${med(rs.map((r) => r.firstAnswerMs))} | ${med(rs.map((r) => r.modelReadyMs ?? NaN).filter((x) => !Number.isNaN(x))) || 'n/a'} | ${per.join(' / ')} | ${pct(per, 0.5)} | ${pct(per, 0.95)} |`);
  }
}
process.exit(0);
