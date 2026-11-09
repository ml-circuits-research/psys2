#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Browser-limits experiment (reviewer, 2026-11-09): speed of one DistilBERT-sized encoder pass in onnxruntime-web (single thread, like the webchat),
// heads inside the model vs separate head sessions, LoRA fed as inputs vs ORT LoraAdapter (activeLoraAdapters), adapter swap cost, renderer RSS.
// Prepare: python3 build.py (random-init DistilBERT-base, int8; writes models/), copy docs/webchat/vendor/onnxruntime/ort* and
// docs/webchat/models/dispatcher/model.int8.onnx (as models/dispatcher_v4.int8.onnx) next to www/, serve www/ on :8792 (models/ symlinked into www/).
//   PUPPETEER_CORE=<scratch puppeteer-core> node run.mjs <throttle> [--chrome /usr/bin/google-chrome] > results-throttle<N>.json
import { execSync } from 'node:child_process';
import { loadPuppeteer, findChrome } from '../../../scripts/test-webchat-turns.mjs';
const thr = +(process.argv[2] || 1);
const ci = process.argv.indexOf('--chrome');
const puppeteer = await loadPuppeteer();
const browser = await puppeteer.launch({ executablePath: await findChrome(ci > 0 ? process.argv[ci + 1] : undefined), args: ['--no-sandbox'] });
const page = await browser.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(String(e)));
await page.goto('http://localhost:8792/index.html'); await page.waitForFunction('window.ready', { timeout: 60000 });
await page.emulateCPUThrottling(thr);
const loads = await page.evaluate(() => window.loadAll());
const rss = () => { try { return execSync("ps -eo rss,args | grep -i 'chrome.*type=renderer' | grep -v grep | sort -n | tail -1 | awk '{print $1}'").toString().trim(); } catch { return '?'; } };
const mem = rss();
const shapes = thr === 1 ? [[1, 16], [1, 32], [1, 64], [4, 32], [8, 32], [16, 32]] : [[1, 16], [1, 32], [4, 32]];
const r = await page.evaluate((s) => window.bench(s), shapes);
console.log(JSON.stringify({ throttle: thr, loads, rendererRssMB_afterLoadingAll: Math.round(+mem / 1024), ...r, errs: errs.slice(0, 3) }, null, 1));
await browser.close();
