// SPDX-License-Identifier: AGPL-3.0-only
// The full generated set of space requests (150, seeded) through both reasoners and both hosts; prints the pass count per host and class and every failure.
//   node scripts/eval-space.mjs [--seed N] [--n 150] [--reasoner ops|matrix|both] [--json out.json]
import { writeFile } from 'node:fs/promises';
import { generate } from '../training/eval/space-set.mjs';
import { runCases, summary } from '../training/eval/space-run.mjs';
import { generate2, runCases2 } from '../training/eval/space-set2.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const cases = generate(Number(arg('seed', 20261113)), Number(arg('n', 150)));
const modes = arg('reasoner', 'both') === 'both' ? ['ops', 'matrix'] : [arg('reasoner')];
const all = {};
for (const m of modes) {
  const res = await runCases(cases, { reasoner: m });
  all[m] = res;
  const ok = res.filter((r) => r.ok).length;
  console.log(`\n== ${m}: ${ok}/${res.length}`);
  for (const [k, v] of Object.entries(summary(res)).sort()) console.log(`  ${k.padEnd(18)} ${v.ok}/${v.n}`);
  for (const r of res.filter((x) => !x.ok)) console.log(`  FAIL ${r.id} [${r.host}/${r.cls}] "${r.text}" -> ${r.why}`);
}
// SPACE-2: surface overlap, joining (with and without "apart") and layouts from general knowledge (60 seeded cases, the module's reader on both hosts' projections)
const cases2 = generate2(Number(arg('seed2', 20261114)), Number(arg('n2', 60)));
const res2 = runCases2(cases2);
console.log(`\n== space-2 (surface, joining, knowledge layouts): ${res2.filter((r) => r.ok).length}/${res2.length}`);
for (const [k, v] of Object.entries(summary(res2.map((r) => ({ ...r, host: 'k' })))).sort()) console.log(`  ${k.padEnd(18)} ${v.ok}/${v.n}`);
for (const r of res2.filter((x) => !x.ok)) console.log(`  FAIL ${r.id} [${r.host}/${r.cls}] "${r.text}" -> ${r.why}`);
all.space2 = res2;
if (arg('json')) await writeFile(arg('json'), JSON.stringify({ cases, results: all }, null, 1));
