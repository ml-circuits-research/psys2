#!/usr/bin/env node
// Webchat performance harness (PERF task). Serves docs/webchat on localhost and drives it in headless Chrome with a mobile
// viewport (390x844) and CPU throttling (default 4x). Reports page-ready time and the time of each message, in the rules and
// the encoder settings.
//
//   node scripts/perf-webchat.mjs [--mode rules|encoder|encoder+n1|all] [--throttle 4] [--runs 1] [--json out.json]
//                                 [--chrome /usr/bin/chromium] [--messages "a|b|c"]
//
// puppeteer-core is NOT a dependency of the repository. Install it in a scratch directory and point PUPPETEER_CORE at it:
//   mkdir /tmp/pp && cd /tmp/pp && npm i puppeteer-core && PUPPETEER_CORE=/tmp/pp/node_modules/puppeteer-core node scripts/perf-webchat.mjs
import http from 'node:http';
import { readFile, access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const MODES = opt('mode', 'all') === 'all' ? ['rules', 'encoder', 'encoder+n1'] : opt('mode').split(',');
const THROTTLE = Number(opt('throttle', 4));
const RUNS = Number(opt('runs', 1));
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
function serve() {
  return http.createServer(async (q, r) => {
    try {
      const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); const f = p.endsWith('/') ? `${p}index.html` : p;
      r.setHeader('content-type', types[path.extname(f)] ?? 'application/octet-stream'); r.setHeader('cache-control', 'no-store');
      r.end(await readFile(f));
    } catch { r.statusCode = 404; r.end('nf'); }
  }).listen(0);
}
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };

async function runOnce(puppeteer, chrome, port, mode) {
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
  try {
    const pg = await browser.newPage();
    await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const cdp = await pg.createCDPSession();
    if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    const settings = { settingsVersion: 2, formalizer: mode === 'rules' ? 'rules' : 'encoder', normalizer: mode === 'encoder+n1', showTrace: false };
    await pg.evaluateOnNewDocument((s) => { try { localStorage.setItem('psys2.webchat.settings', JSON.stringify(s)); } catch { /* ignore */ } }, settings);
    pg.on('pageerror', (e) => console.error('pageerror', String(e).slice(0, 200)));
    const t0 = Date.now();
    await pg.goto(`http://localhost:${port}/webchat/index.html`, { waitUntil: 'domcontentloaded' });
    await pg.waitForSelector('input.p2-text');
    const tInput = Date.now() - t0;
    // ready = the session exists (the hint message is added at the end of boot)
    await pg.waitForFunction(() => document.querySelector('.p2-msg.is-hint'), { timeout: 180000, polling: 50 });
    const ready = Date.now() - t0;
    const modelReady = mode === 'rules' ? null : await pg.waitForFunction(() => /model v/.test(document.querySelector('.p2-status')?.textContent ?? '') || /could not/.test(document.body.innerText), { timeout: 180000, polling: 100 }).then(() => Date.now() - t0).catch(() => null);
    const out = { mode, inputMs: tInput, readyMs: ready, modelReadyMs: modelReady, messages: [] };
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
    out.stages = await pg.evaluate(() => globalThis.__psys2Perf ?? null).catch(() => null);
    return out;
  } finally { await browser.close(); }
}

const puppeteer = (await loadPuppeteer()).default ?? await loadPuppeteer(); const chrome = await findChrome(); const srv = serve(); const port = srv.address().port;
const results = [];
try {
  for (const mode of MODES) for (let i = 0; i < RUNS; i++) {
    const r = await runOnce(puppeteer, chrome, port, mode); results.push(r);
    console.log(`\n== ${mode} (throttle ${THROTTLE}x) input ${r.inputMs} ms, ready ${r.readyMs} ms, model ready ${r.modelReadyMs ?? 'n/a'} ms`);
    for (const m of r.messages) console.log(`  ${String(m.ms).padStart(6)} ms  ${m.msg.padEnd(30)} -> ${JSON.stringify(m.reply)}${m.took ? ` [${m.took}]` : ''}`);
    const ts = r.messages.map((m) => m.ms); console.log(`  p50 ${pct(ts, 0.5)} ms  p95 ${pct(ts, 0.95)} ms`);
    if (r.stages && args.includes('--stages')) for (const x of r.stages) console.log(`  [${x.text}] engine ${x.engineMs} render ${x.render} effects ${x.effects}: ` + Object.entries(x.stages ?? {}).map(([k, v]) => `${k} ${v.n}x/${v.ms}`).join(', '));
  }
} finally { srv.close(); }
if (opt('json')) await writeFile(opt('json'), JSON.stringify(results, null, 2));
console.log('\n| mode | input | ready | model ready | p50 msg | p95 msg | per message (ms) |\n| --- | --- | --- | --- | --- | --- | --- |');
for (const r of results) { const ts = r.messages.map((m) => m.ms); console.log(`| ${r.mode} | ${r.inputMs} | ${r.readyMs} | ${r.modelReadyMs ?? 'n/a'} | ${pct(ts, 0.5)} | ${pct(ts, 0.95)} | ${ts.join(' / ')} |`); }
process.exit(0);
