// Prints the report table (answers / right when it answers / kept overall / chain) from a results file of scripts/ro-en-merge-report.mjs.
//   node scripts/ro-en-table.mjs training/eval/ro-en-meaning/results-2026-11-15.json
import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const paths = ['rules', 'm4+model', 'grammar', 'grammar-lib', 'grammar-um', 'grammar-um+gl', 'grammar-lib>m4+model', 'grammar-um+gl>m4+model'];
const pct = (a, n) => (n ? (100 * a / n).toFixed(1) : '-');
for (const [dim, val] of [['all', 'all'], ['source', 'operational'], ['source', 'canon'], ['source', 'real'], ['source', 'talk'], ['source', 'template'], ['hand-only', 'hand'], ['hand-only', 'machine']]) {
  const t = j.tally[dim][val];
  console.log(`${val.padEnd(12)} n=${String(t.n).padStart(5)}  ` + paths.map((p) => { const c = t[p]; const att = t.n - c.abstain; return `${p}: kept ${pct(c.kept, t.n)} (answers ${pct(att, t.n)}, right ${pct(c.kept, att)})`; }).join('  '));
}
