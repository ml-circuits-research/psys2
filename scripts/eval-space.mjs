// SPDX-License-Identifier: AGPL-3.0-only
// The full generated set of space requests (150, seeded) through both reasoners and both hosts; prints the pass count per host and class and every failure.
//   node scripts/eval-space.mjs [--seed N] [--n 150] [--reasoner ops|matrix|both] [--json out.json]
import { writeFile } from 'node:fs/promises';
import { generate } from '../training/eval/space-set.mjs';
import { runCases, summary } from '../training/eval/space-run.mjs';

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
if (arg('json')) await writeFile(arg('json'), JSON.stringify({ cases, results: all }, null, 1));
