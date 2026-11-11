#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Readable report of training/results/sopworld-ab-<date>.json (scripts/ab-sopworld.mjs): every difference between ops and matrix as a transcript.
//   node scripts/ab-sopworld-report.mjs [training/results/sopworld-ab-2026-11-11.json]   -> same name with .md
import { readFileSync, writeFileSync } from 'node:fs';
const file = process.argv[2] ?? 'training/results/sopworld-ab-2026-11-11.json';
const r = JSON.parse(readFileSync(file, 'utf8'));
const L = [];
const q = (s) => String(s).replace(/\s+/g, ' ').replace(/\|/g, '/');
L.push(`# ops against matrix: every difference (${r.date})`, '', `${r.sessions} sessions, ${r.differing} differ in a reply, a status or an outcome. Written by \`scripts/ab-sopworld.mjs\`, formatted by \`scripts/ab-sopworld-report.mjs\`. Random output (a random song or look) is marked and counted as neutral.`, '');
L.push('## Per set', '', '| set | sessions | turns | differing | state view only |', '| --- | --- | --- | --- | --- |');
for (const [k, c] of Object.entries(r.counts)) L.push(`| ${k} | ${c.sessions} | ${c.turns} | ${c.differing} | ${c.view_only ?? 0} |`);
L.push('', '"State view only": the replies and statuses are identical; `session.state()` differs because a matrix world mirrors the library facts into it (kids.shop.money, kids.arith.holdings, tic-tac-toe history) and ops keeps them in wires.', '');
L.push('## By class', '', '| class | count | sets |', '| --- | --- | --- |');
for (const [k, v] of Object.entries(r.by_class)) L.push(`| ${k} | ${Object.values(v).reduce((a, b) => a + b, 0)} | ${Object.entries(v).map(([s, n]) => `${s} ${n}`).join(', ')} |`);
L.push('');
for (const cls of ['matrix better', 'ops better', 'neutral wording', 'unjudged']) {
  const list = r.diffs.filter((d) => d.class === cls);
  if (!list.length) continue;
  L.push(`## ${cls} (${list.length})`, '');
  for (const d of list) {
    L.push(`### ${d.key} (${d.world}${d.tab ? `, tab ${d.tab}` : ''})`, '');
    if (d.note) L.push(`Note: ${d.note}`, '');
    if (d.outcome) L.push(`Outcome: ops ${JSON.stringify(d.outcome.ops)}, matrix ${JSON.stringify(d.outcome.matrix)}`, '');
    for (const t of d.turns) {
      L.push(`${t.differs ? '**>**' : '>'} ${q(t.message)}`, `  - ops: ${q(t.ops)}`, `  - matrix: ${q(t.matrix)}${t.statuses[0] !== t.statuses[1] ? ` (status ops ${t.statuses[0] || 'none'}, matrix ${t.statuses[1] || 'none'})` : ''}`);
      if (t.state_diff?.length) L.push(`  - state: ${t.state_diff.map(q).join('; ').slice(0, 400)}`);
    }
    L.push('');
  }
}
writeFileSync(file.replace(/\.json$/, '.md'), `${L.join('\n')}\n`);
console.log(`wrote ${file.replace(/\.json$/, '.md')}`);
