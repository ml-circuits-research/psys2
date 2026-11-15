#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * THE REQUEST PROPOSER IN NODE (Q48): the int8 ONNX graph through the browser-safe runtime (src/dialog/proposer.mjs, JS WordPiece) on the dev rows of
 * scripts/gen-request-data.mjs: agreement with the gold labels (the same metric as the Python dev score, here on the int8 graph and the JS tokenizer) and latency per
 * turn (batch 1, one ORT thread): p50 / p95 / max, model size.
 *
 *   node scripts/proposer-latency.mjs --ort <onnxruntime-node entry> [--dir training/runs/request-proposer/current] [--data training/data/request-proposer/dev.jsonl] [--n 600]
 */
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { openProposer, DEFAULT_PROPOSER_DIR } from './lib/proposer-node.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const dir = resolve(arg('dir', DEFAULT_PROPOSER_DIR));
const rows = readFileSync(resolve(arg('data', 'training/data/request-proposer/dev.jsonl')), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).slice(0, Number(arg('n', 600)));
const t0 = Date.now();
const p = await openProposer({ dir, ortPath: arg('ort', process.env.PSYS2_ORT), threads: Number(arg('threads', 1)) });
const loadMs = Date.now() - t0;
for (let i = 0; i < 5; i++) await p.propose(rows[i % rows.length].words);   // warm-up
const ms = [];
let exact = 0, act = 0, tags = 0, words = 0;
for (const r of rows) {
  const t = performance.now();
  const q = await p.propose(r.words);
  ms.push(performance.now() - t);
  const same = q.tags.every((x, i) => x === r.tags[i]);
  if (q.act === r.act) act++;
  tags += q.tags.filter((x, i) => x === r.tags[i]).length; words += r.words.length;
  if (same && q.act === r.act && q.reaction === r.reaction && q.refers === r.refers && q.question === r.question) exact++;
}
ms.sort((a, b) => a - b);
const pct = (x) => ms[Math.min(ms.length - 1, Math.floor(x * ms.length))];
const out = { dir, model_mb: +(statSync(resolve(dir, 'model.int8.onnx')).size / 1e6).toFixed(1), load_ms: loadMs, n: rows.length, mean_words: +(words / rows.length).toFixed(1), p50_ms: +pct(0.5).toFixed(2), p95_ms: +pct(0.95).toFixed(2), max_ms: +ms.at(-1).toFixed(2), int8_js: { exact: +(exact / rows.length).toFixed(4), act_acc: +(act / rows.length).toFixed(4), tag_acc: +(tags / words).toFixed(4) } };
console.log(JSON.stringify(out));
