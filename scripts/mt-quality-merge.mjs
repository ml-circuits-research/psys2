#!/usr/bin/env node
/**
 * Merges the shard files of scripts/mt-quality.mjs into docs/webchat/vendor/bergamot/quality.json (the numbers the selector's gate and Settings > About read:
 * per language the share read right, no examples) and prints a table. The full per-language record (with examples) goes to the file given by --full.
 *   node scripts/mt-quality-merge.mjs shard1.json shard2.json ... [--full training/results/mt-quality-2026-11-12.json]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const fullIdx = args.indexOf('--full');
const full = fullIdx >= 0 ? args.splice(fullIdx, 2)[1] : null;
const merged = { languages: {} };
for (const f of args) { const d = JSON.parse(readFileSync(f, 'utf8')); Object.assign(merged, { reasoner: d.reasoner, gate: d.gate, every: d.every, sample: d.sample, englishRight: d.englishRight }); Object.assign(merged.languages, d.languages); }
const slim = { gate: Math.round(merged.gate * 100), sample: merged.sample, englishRight: merged.englishRight, reasoner: merged.reasoner, measured: 'scripts/mt-quality.mjs: English operational sample translated en>X>en by the on-device model and read by the English engine; right = share judged right',
  languages: Object.fromEntries(Object.entries(merged.languages).map(([l, v]) => [l, v.error ? { error: v.error } : { right: v.right, wrong: v.wrong, notUnderstood: v.notUnderstood, checkerRejects: v.checkerRejects, msPerSentence: v.msPerSentence, downloadMB: v.downloadMB }])) };
writeFileSync(join(REPO, 'docs/webchat/vendor/bergamot/quality.json'), JSON.stringify(slim) + '\n');
if (full) writeFileSync(full, JSON.stringify(merged));
const rows = Object.entries(slim.languages).filter(([, v]) => v.right != null).sort((a, b) => b[1].right - a[1].right);
console.log(`English reference ${merged.englishRight}% right on ${merged.sample} cases; gate ${slim.gate}%`);
for (const [l, v] of rows) console.log(`  ${l.padEnd(8)} right ${String(v.right).padStart(5)}%  wrong ${String(v.wrong).padStart(4)}%  not understood ${String(v.notUnderstood).padStart(4)}%  checker rejects ${String(v.checkerRejects).padStart(4)}%  ${v.msPerSentence} ms/sentence  ${v.downloadMB} MB  ${v.right >= slim.gate ? 'LISTED' : ''}`);
console.log(`${rows.filter(([, v]) => v.right >= slim.gate).length} of ${rows.length} languages reach the gate; errors: ${Object.entries(slim.languages).filter(([, v]) => v.error).map(([l]) => l).join(', ') || 'none'}`);
