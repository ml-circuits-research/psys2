#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Replays the cases of the holes of English (training/eval/lang-holes.jsonl) on this build: right / wrong per hole.
//   node scripts/eval-lang-holes.mjs [--only relative,or] [--verbose] [--json]
import { runHoleCases } from './lib/lang-holes.mjs';

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const rows = await runHoleCases({ only: arg('only')?.split(',') ?? null });
if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 1));
else {
  const by = {};
  for (const r of rows) { (by[r.hole] ??= { right: 0, wrong: 0 })[r.outcome]++; if (process.argv.includes('--verbose') || r.outcome === 'wrong') console.log(`${r.outcome.padEnd(5)} [${r.hole}/${r.tab}] ${r.id} ${JSON.stringify(r.text)} => ${r.happened}`); }
  console.log('hole'.padEnd(14), 'right wrong');
  for (const [k, v] of Object.entries(by)) console.log(k.padEnd(14), String(v.right).padStart(5), String(v.wrong).padStart(5));
}
