#!/usr/bin/env node
/**
 * Small committed sample of dispatcher predictions for one world group, so a reviewer can rerun the Node part of D3 without the
 * (gitignored, 30 MB) prediction files: every STRIDE-th record of the group in file order (deterministic).
 * Usage: node scripts/make-dispatch-sample.mjs [--group kids] [--out training/results/dispatch-pred-kids-sample.jsonl]
 *        [--world-stride 12] [--heldout-stride 8] [--multi-stride 40]
 * Then:  node scripts/eval-dispatch.mjs --pred training/results/dispatch-pred-kids-sample.jsonl --name kids-sample
 * (needs training/dataset: node scripts/build-dataset.mjs && python -m psys2_train.multicmd).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupOf } from './lib/world-groups.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const group = opt('--group', 'kids');
const out = resolve(REPO, opt('--out', 'training/results/dispatch-pred-kids-sample.jsonl'));
const dir = join(REPO, 'training/runs/dispatch-pred');
const lines = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const every = (rs, k) => rs.filter((_, i) => i % k === 0);
const test = lines(join(dir, 'test.jsonl'));
const picked = [
  ...every(test.filter((r) => r.kind === 'world-record' && groupOf(r.world) === group), Number(opt('--world-stride', 12))),
  ...every(lines(join(dir, 'heldout.jsonl')).filter((r) => groupOf(r.world) === group), Number(opt('--heldout-stride', 8))),
  ...every(test.filter((r) => r.kind === 'multicmd'), Number(opt('--multi-stride', 40))),
];
writeFileSync(out, picked.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(`wrote ${out}: ${picked.length} records`);
