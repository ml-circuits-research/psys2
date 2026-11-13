#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// P3 phone profile of the act + roles tagger: int8 graph in headless Chrome + onnxruntime-web (webchat version), 1x and 4x CPU throttle, 300 real test messages.
//   PUPPETEER_CORE=<puppeteer-core dir> node tagger-run.mjs --run <training/runs/act-tagger/<size>> [--ort docs/webchat/vendor/onnxruntime] [--throttle 1,4] > result.json
// The run directory holds model.int8.onnx and ref.json (python -m psys2_train.act_tagger_ref).
import http from 'node:http';
import { readFileSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPuppeteer, findChrome } from '../../../scripts/test-webchat-turns.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const run = resolve(arg('run')), ortDir = resolve(arg('ort', join(here, '../../../docs/webchat/vendor/onnxruntime')));
const www = join(here, `www-tagger-${run.split('/').pop()}`); mkdirSync(www, { recursive: true });   // untracked scratch copy (ignored via the www-* pattern in training/.gitignore)
for (const f of ['ort.wasm.bundle.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) copyFileSync(join(ortDir, f), join(www, f));
copyFileSync(join(here, 'www-tagger/index.html'), join(www, 'index.html')); copyFileSync(join(run, 'model.int8.onnx'), join(www, 'model.int8.onnx'));
const ref = JSON.parse(readFileSync(join(run, 'ref.json'), 'utf8'));
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream' };
const srv = http.createServer((q, r) => { try { const f = join(www, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); r.setHeader('content-type', TYPES[extname(f)] ?? 'application/octet-stream'); r.end(readFileSync(f)); } catch { r.statusCode = 404; r.end('nf'); } }).listen(0);
const port = srv.address().port;
const puppeteer = await loadPuppeteer();
const out = { run, size_mb: +(statSync(join(run, 'model.int8.onnx')).size / 1e6).toFixed(1), runs: [] };
for (const thr of arg('throttle', '1,4').split(',').map(Number)) {
  const browser = await puppeteer.launch({ executablePath: await findChrome(), args: ['--no-sandbox'] });
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`http://localhost:${port}/index.html`); await page.waitForFunction('window.ready', { timeout: 60000 });
  if (thr > 1) await (await page.createCDPSession()).send('Emulation.setCPUThrottlingRate', { rate: thr });
  const load = await page.evaluate(() => window.load());
  const r = await page.evaluate((x) => window.run(x), ref);
  out.runs.push({ throttle: thr, load, ...r, errs: errs.slice(0, 3) });
  await browser.close();
}
srv.close();
console.log(JSON.stringify(out, null, 1));
