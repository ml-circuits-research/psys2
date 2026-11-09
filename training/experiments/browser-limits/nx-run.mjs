#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// NX5 browser cost: the real exported NX heads model in headless Chrome with onnxruntime-web (the webchat's version), 1x and 4x CPU throttle.
//   PUPPETEER_CORE=<scratch puppeteer-core> node nx-run.mjs --nx <export dir> --disp <dispatcher model.int8.onnx> --ort <docs/webchat/vendor/onnxruntime> --ortnode <onnxruntime-node entry> [--throttle 1,4] > results-nx.json
import http from 'node:http';
import { readFileSync, mkdirSync, copyFileSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadPuppeteer, findChrome } from '../../../scripts/test-webchat-turns.mjs';
import { createWordPieceTokenizer } from '../../../src/formalizer/wordpiece.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const nxDir = resolve(arg('nx')), disp = resolve(arg('disp')), ortDir = resolve(arg('ort')), ortNode = resolve(arg('ortnode'));
const www = join(here, 'www-nx'); mkdirSync(join(www, 'models'), { recursive: true });
for (const f of ['ort.wasm.bundle.min.mjs', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) copyFileSync(join(ortDir, f), join(www, f));
copyFileSync(join(nxDir, 'model.int8.onnx'), join(www, 'models/nx.int8.onnx')); copyFileSync(disp, join(www, 'models/dispatcher_v4.int8.onnx'));
// real inputs and the onnxruntime-node reference outputs
const mod = await import(pathToFileURL(ortNode).href); const ort = mod.InferenceSession ? mod : mod.default;
const tk = createWordPieceTokenizer(readFileSync(join(here, '../../../docs/webchat/models/dispatcher/vocab.txt'), 'utf8'));
const sess = await ort.InferenceSession.create(join(nxDir, 'model.int8.onnx'));
const texts = ['add milk to my list', 'what is 3 plus 4', 'tom gives mary 3 apples', 'how many apples does tom have', 'draw a red circle', 'make the avatar a human', 'open the map and show paris', 'play a c major scale', 'what is the weather like on the map tab please', 'put an x on b2'];
const inputs = [];
for (const t of texts) {
  const ids = tk.encode(`tab: robot ; recent: none ;; ${t}`, { maxLength: 128 }).ids;
  const o = await sess.run({ input_ids: new ort.Tensor('int64', BigInt64Array.from(ids, (x) => BigInt(x)), [1, ids.length]), attention_mask: new ort.Tensor('int64', BigInt64Array.from(ids, () => 1n), [1, ids.length]) });
  const arg = (d) => { let b = 0; for (let i = 1; i < d.length; i++) if (d[i] > d[b]) b = i; return b; };
  const L = o.tag_logits.dims[2]; const tags = [];
  for (let k = 0; k < ids.length; k++) tags.push(arg(o.tag_logits.data.slice(k * L, (k + 1) * L)));
  inputs.push({ ids, op: arg(o.op_logits.data), tags });
}
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream' };
const srv = http.createServer((q, r) => { try { const f = join(www, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); r.setHeader('content-type', TYPES[extname(f)] ?? 'application/octet-stream'); r.end(readFileSync(f)); } catch { r.statusCode = 404; r.end('nf'); } }).listen(0);
const port = srv.address().port;
const puppeteer = await loadPuppeteer();
const out = { nx_dir: nxDir, size_mb: +(statSync(join(nxDir, 'model.int8.onnx')).size / 1e6).toFixed(1), dispatcher_v4_mb: +(statSync(disp).size / 1e6).toFixed(1), runs: [] };
for (const thr of arg('throttle', '1,4').split(',').map(Number)) {
  const browser = await puppeteer.launch({ executablePath: await findChrome(), args: ['--no-sandbox'] });
  const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`http://localhost:${port}/index.html`); await page.waitForFunction('window.ready', { timeout: 60000 });
  if (thr > 1) await (await page.createCDPSession()).send('Emulation.setCPUThrottlingRate', { rate: thr });
  const loads = await page.evaluate(() => window.loadAll());
  const rows = await page.evaluate((l) => window.bench(l), [16, 24, 32, 48, 64]);
  const parity = await page.evaluate((i) => window.parity(i), inputs);
  out.runs.push({ throttle: thr, loads, rows, parity, errs: errs.slice(0, 3) });
  await browser.close();
}
srv.close();
console.log(JSON.stringify(out, null, 1));
