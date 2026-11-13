// RD7: type N messages in the real webchat (headless Chrome) and check that the Settings count, the list and the JSON export all have N records.
// puppeteer-core is not a dependency: the test runs only when PUPPETEER_CORE points to a scratch install (see scripts/perf-webchat.mjs) and a Chrome exists.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
const CORE = process.env.PUPPETEER_CORE;
const CHROME = process.env.CHROME || '/usr/bin/chromium';
const ok = async (p) => { try { await access(p); return true; } catch { return false; } };
const can = !!CORE && await ok(path.join(CORE, 'lib/puppeteer/puppeteer-core.js')) && await ok(CHROME) && await ok(path.join(DOCS, 'webchat/lib/dialog/index.mjs'));
const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.svg': 'image/svg+xml', '.txt': 'text/plain' };

test('RD7: typing N messages gives N entries in the count, the list and the JSONL export', { skip: can ? false : 'set PUPPETEER_CORE (scratch puppeteer-core install) to run' }, async () => {
  const pp = await import(pathToFileURL(path.join(CORE, 'lib/puppeteer/puppeteer-core.js')).href);
  const puppeteer = pp.default ?? pp;
  const srv = http.createServer(async (q, r) => {
    try { const p = path.join(DOCS, decodeURIComponent(q.url.split('?')[0])); const f = p.endsWith('/') ? `${p}index.html` : p; r.setHeader('content-type', types[path.extname(f)] ?? 'application/octet-stream'); r.end(await readFile(f)); } catch { r.statusCode = 404; r.end('nf'); }
  }).listen(0);
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  try {
    const pg = await browser.newPage();
    await pg.setViewport({ width: 390, height: 844 });
    await pg.evaluateOnNewDocument((s) => { try { localStorage.setItem('psys2.webchat.settings', JSON.stringify(s)); } catch { /* ignore */ } window.__blobs = []; const c = URL.createObjectURL.bind(URL); URL.createObjectURL = (b) => { window.__blobs.push(b); return c(b); }; }, { settingsVersion: 2, formalizer: 'rules', normalizer: false });
    await pg.goto(`http://localhost:${srv.address().port}/webchat/index.html`, { waitUntil: 'domcontentloaded' });
    await pg.waitForFunction(() => document.querySelector('.p2-msg.is-hint'), { timeout: 120000 });
    const msgs = ['hello', 'b1', 'fa ochii mari', 'make a chart: apples 5, pears 3', 'zzq flarb wug', 'add a cloud nect to a house', 'more', 'what can i say here', 'help', 'draw a girl', 'eys express fear', 'show me bucharest'];
    // one message at a time (turn lifecycle, spec 06): wait for each answer before the next one
    for (const m of msgs) { await pg.type('input.p2-text', m, { delay: 0 }); await pg.keyboard.press('Enter'); await pg.waitForFunction(() => !window.psys2.busy && !document.querySelector('.p2-msg.is-typing'), { timeout: 30000, polling: 20 }); }
    await pg.waitForFunction((n) => document.querySelectorAll('.p2-msg.is-user').length >= n && !document.querySelector('.p2-msg.is-typing'), { timeout: 120000 }, msgs.length);
    await pg.click('button[aria-label="Settings"]');
    await pg.click('#p2-st-privacy');   // SET: one tab per topic
    await pg.waitForSelector('.p2-plog-item');
    const count = await pg.$eval('.p2-plog-count', (e) => e.textContent);
    assert.match(count, new RegExp(`^${msgs.length} entries \\(${msgs.length} typed or spoken`));
    assert.equal((await pg.$$('.p2-plog-item')).length, msgs.length);
    await pg.evaluate(() => [...document.querySelectorAll('.p2-plog-actions button')].find((b) => b.textContent === 'Export JSON').click());
    const body = await pg.evaluate(() => window.__blobs.at(-1).text());
    const lines = JSON.parse(body).records;
    assert.equal(lines.length, msgs.length);
    assert.deepEqual(lines.map((l) => l.text).sort(), [...msgs].sort());
  } finally { await browser.close(); srv.close(); }
});
