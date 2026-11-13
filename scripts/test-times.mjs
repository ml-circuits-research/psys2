#!/usr/bin/env node
/**
 * Wall time of every test file (one node process per file), slowest first.
 *   node scripts/test-times.mjs [--full] [--jobs N] [--top N]      (default: the fast suite's files, 4 jobs, top 20)
 * Run it under `taskset -c 0-3` to measure on a 4-core box. Browser tests (PUPPETEER_CORE) are left out unless --full.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? Number(argv[i + 1]) : d; };
const full = argv.includes('--full');
const jobs = arg('--jobs', 4), top = arg('--top', 20);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(join(root, 'tests')).filter((f) => f.endsWith('.test.mjs')).sort()
  .filter((f) => full || (!readFileSync(join(root, 'tests', f), 'utf8').includes('PUPPETEER_CORE') && !f.endsWith('.full.test.mjs')));
const env = { ...process.env, PSYS2_SUITE: full ? 'full' : 'fast', PSYS2_SAMPLE_SEED: process.env.PSYS2_SAMPLE_SEED || new Date().toISOString().slice(0, 10) };
const times = [];
let next = 0;
const t0 = Date.now();
async function worker() {
  while (next < files.length) {
    const f = files[next++];
    const t = Date.now();
    const code = await new Promise((res) => spawn(process.execPath, ['--test', join('tests', f)], { cwd: root, env, stdio: 'ignore' }).on('close', res));
    times.push({ f, s: (Date.now() - t) / 1000, code });
  }
}
await Promise.all(Array.from({ length: jobs }, worker));
times.sort((a, b) => b.s - a.s);
for (const { f, s, code } of times.slice(0, top)) console.log(`${s.toFixed(1).padStart(7)} s  ${f}${code ? `  (exit ${code})` : ''}`);
console.log(`total ${((Date.now() - t0) / 1000).toFixed(1)} s wall, ${files.length} files, ${jobs} jobs; failures: ${times.filter((x) => x.code).map((x) => x.f).join(', ') || 'none'}`);
