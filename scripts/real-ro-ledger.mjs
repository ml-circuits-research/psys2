// The failing REAL Romanian turns of the shipped chain in node (Bergamot MT + rules, `--tag -mt`), grouped by cause, each flagged real (every turn of the real set is real), with examples.
//   node scripts/real-ro-ledger.mjs > training/eval/ro-en-meaning/real-ro-ledger-2026-11-15.md
import { readFileSync } from 'node:fs';
import { failureRows, realCause } from './real-set.mjs';
const jl = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const ro = jl('training/eval/real-2026-11-15.jsonl').filter((r) => r.lang === 'ro');
const load = (v) => JSON.parse(readFileSync(`training/results/real-2026-11-15-matrix-${v}.json`, 'utf8'));
const rules = new Set(failureRows(ro, load('rules'), 'rules').map((x) => x.id));
const rows = failureRows(ro, load('mt'), 'mt');
const groups = {};
for (const r of rows) (groups[realCause(r)] ??= []).push(r);
console.log('# Failing real Romanian turns, shipped chain in node (Bergamot model + rules + repaired), 2026-11-15\n');
console.log(`${rows.length} failing of ${ro.length} Romanian turns of the real set (real: true for all). Rules only: ${rules.size} failing; failing in both chains: ${rows.filter((r) => rules.has(r.id)).length}; failing only with the model: ${rows.filter((r) => !rules.has(r.id)).length}; fixed by the model: ${[...rules].filter((id) => !rows.some((r) => r.id === id)).length}.\n`);
console.log('| cause | turns | also failing with rules only | examples |\n| --- | ---: | ---: | --- |');
for (const [c, rs] of Object.entries(groups).sort((a, b) => b[1].length - a[1].length)) console.log(`| ${c} | ${rs.length} | ${rs.filter((r) => rules.has(r.id)).length} | ${rs.slice(0, 3).map((r) => `\`${r.text.slice(0, 50).replace(/\|/g, '/')}\``).join(', ')} |`);
