#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// NX-INTEGRATION: the per-strategy table (right / wrong / abstain) from training/results/nx5/webchat-<strategy>.json
// (written by `node scripts/eval-nx.mjs --system webchat-<strategy> --ort <onnxruntime-node entry> --sets operational,operational-ro,dialogues,gold,real,mobile`).
//   node scripts/nx-integration-report.mjs
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STRATEGIES = ['rules', 'hybrid', 'neural'];
const data = {};
for (const s of STRATEGIES) {
  const f = join(REPO, 'training/results/nx5', `webchat-${s}.json`);
  if (existsSync(f)) data[s] = JSON.parse(readFileSync(f, 'utf8'));
}
const SETS = [['operational', 'operational'], ['operational-long', 'operational-long'], ['operational-ro', 'operational-ro (Romanian)'], ['dialogues', 'dialogues (dialogue right)'], ['dialogue-turns', 'dialogues (turns)'], ['gold-para', 'gold-para'], ['gold-rules', 'gold-rules'], ['gold-real', 'gold-real'], ['real-09c', 'real phrases 09c'], ['real-09d', 'real phrases 09d'], ['real-09e', 'real phrases 09e'], ['mobile', 'mobile export (answered / abstained)']];

/** { n, right, wrong, abstain, partly } of one set in one strategy. */
function tally(rows, set) {
  const out = { n: 0, right: 0, wrong: 0, abstain: 0, partly: 0 };
  const add = (o) => {
    out.n++;
    if (o === 'right' || o === 'correct' || o === 'answered') out.right++;
    else if (o === 'wrong') out.wrong++;
    else if (o === 'not_understood' || o === 'abstain') out.abstain++;
    else if (o === 'partly') out.partly++;
    else out.right += 0;
  };
  if (set === 'dialogue-turns') { for (const r of rows.filter((x) => x.set === 'dialogues')) for (const t of r.turns ?? []) add(t.outcome); return out; }
  if (set === 'dialogues') { for (const r of rows.filter((x) => x.set === 'dialogues')) add(r.right ? 'right' : 'wrong'); return out; }
  for (const r of rows.filter((x) => x.set === set)) add(r.outcome);
  return out;
}
const cell = (t) => (t.n ? `${t.right} / ${t.wrong} / ${t.abstain}${t.partly ? ` (+${t.partly} partly)` : ''}` : '-');
const pct = (t) => (t.n ? `${(100 * t.right / t.n).toFixed(1)}% / ${(100 * t.wrong / t.n).toFixed(1)}%` : '-');

const lines = ['| set | n | rules (right / wrong / abstain) | hybrid | neural |', '| --- | --- | --- | --- | --- |'];
for (const [key, label] of SETS) {
  const t = Object.fromEntries(STRATEGIES.map((s) => [s, data[s] ? tally(data[s].rows, key) : { n: 0 }]));
  const n = t.rules.n || t.hybrid.n || t.neural.n;
  if (!n) continue;
  lines.push(`| ${label} | ${n} | ${cell(t.rules)} | ${cell(t.hybrid)} | ${cell(t.neural)} |`);
}
console.log(lines.join('\n'));
console.log('\nright% / wrong% :');
for (const [key, label] of SETS) {
  const t = Object.fromEntries(STRATEGIES.map((s) => [s, data[s] ? tally(data[s].rows, key) : { n: 0 }]));
  if (!(t.rules.n || t.hybrid.n)) continue;
  console.log(`  ${label}: rules ${pct(t.rules)} | hybrid ${pct(t.hybrid)} | neural ${pct(t.neural)}`);
}
for (const s of STRATEGIES) if (data[s]) console.log(`\n${s}: ${data[s].seconds}s, nx counters ${JSON.stringify(data[s].nxStatsMaxPerWorker)}`);
