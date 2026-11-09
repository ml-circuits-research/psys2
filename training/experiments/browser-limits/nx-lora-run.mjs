#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// NX4-C browser check of the per-world LoRA adapters (python -m psys2_train.nx_lora export): base graph + .onnx_adapter files in onnxruntime-web, 1x and 4x.
//   PUPPETEER_CORE=<scratch puppeteer-core> node nx-lora-run.mjs --export <export dir> --ort <docs/webchat/vendor/onnxruntime> [--throttle 1,4] > results-nx-lora.json
import http from 'node:http';
import { readFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPuppeteer, findChrome } from '../../../scripts/test-webchat-turns.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const exp = resolve(arg('export')), ortDir = resolve(arg('ort'));
const www = join(here, 'www-nx'); mkdirSync(join(www, 'models'), { recursive: true });
for (const f of ['ort.wasm.bundle.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) copyFileSync(join(ortDir, f), join(www, f));
copyFileSync(join(exp, 'model.int8.onnx'), join(www, 'models/lora-base.int8.onnx'));
const worlds = readdirSync(exp).filter((f) => f.endsWith('.onnx_adapter')).map((f) => f.replace('.onnx_adapter', ''));
for (const w of worlds) { copyFileSync(join(exp, `${w}.onnx_adapter`), join(www, `models/${w}.onnx_adapter`)); copyFileSync(join(exp, `lora-check-${w}.json`), join(www, `models/lora-check-${w}.json`)); }
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm' };
const srv = http.createServer((q, r) => { try { const f = join(www, decodeURIComponent(q.url.split('?')[0])); r.setHeader('content-type', TYPES[extname(f)] ?? 'application/octet-stream'); r.end(readFileSync(f)); } catch { r.statusCode = 404; r.end('nf'); } }).listen(0);
const puppeteer = await loadPuppeteer();
const out = { export: exp, runs: [] };
for (const thr of arg('throttle', '1,4').split(',').map(Number)) {
  const browser = await puppeteer.launch({ executablePath: await findChrome(), args: ['--no-sandbox'] });
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`http://localhost:${srv.address().port}/lora.html`); await page.waitForFunction('window.ready', { timeout: 60000 });
  if (thr > 1) await (await page.createCDPSession()).send('Emulation.setCPUThrottlingRate', { rate: thr });
  let r; try { r = await page.evaluate((w) => window.run(w), worlds); } catch (e) { r = { error: String(e).slice(0, 300) }; }
  out.runs.push({ throttle: thr, ...r, errs: errs.slice(0, 3) });
  await browser.close();
}
srv.close();
console.log(JSON.stringify(out, null, 1));
