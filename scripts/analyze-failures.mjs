#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Groups the failure ledger (training/eval/failures.jsonl) by cause: the row's class plus a cause key derived by general signals in what
 * happened (no reply, translation residue, foreign-world reading, fragment/list split, continuation/correction, unknown kind, default place,
 * region, amount, ...). Counts per group, five examples per group (spread over sources). Worker-tasks "NO POINT FIXES" item 3: a change is
 * accepted only if it names a group here and reports the group's count before and after.
 *
 *   node scripts/analyze-failures.mjs [--ledger file] [--out training/results/failures-groups-2026-11-13.md] [--stdout]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const ledger = arg('ledger', join(REPO, 'training/eval/failures.jsonl'));
const out = arg('out', join(REPO, 'training/results/failures-groups-2026-11-13.md'));
const rows = readFileSync(ledger, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

import { causeOf } from './lib/failure-cause.mjs';

const groups = new Map();
for (const r of rows) {
  const c = causeOf(r);
  (groups.get(c) ?? groups.set(c, []).get(c)).push(r);
}
const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
const spread = (list, n = 5) => { // examples from different sources first
  const bySrc = new Map();
  for (const r of list) (bySrc.get(r.source.split('#')[0]) ?? bySrc.set(r.source.split('#')[0], []).get(r.source.split('#')[0])).push(r);
  const res = []; const lists = [...bySrc.values()];
  for (let k = 0; res.length < n && lists.some((l) => l[k]); k++) for (const l of lists) if (l[k] && res.length < n) res.push(l[k]);
  return res;
};
const cut = (s, n) => String(s ?? '').replace(/\s+/g, ' ').replace(/\|/g, '/').slice(0, n);
const bySource = {};
for (const r of rows) { const k = r.source.split('#')[0].replace(/\/.*$/, ''); bySource[k] = (bySource[k] ?? 0) + 1; }
let md = `# Failure groups (${new Date().toISOString().slice(0, 10)})\n\nLedger: \`training/eval/failures.jsonl\`, ${rows.length} rows. Produced by \`node scripts/analyze-failures.mjs\`. Rule (worker-tasks NO POINT FIXES): a change names a group below, is a general mechanism, and reports the group's count before and after plus what it broke elsewhere. The cause key is derived from the row's class and general signals in what happened (see \`causeOf\`), not from phrases.\n\n`;
md += `## Rows per source\n\n| source | rows |\n| --- | --- |\n${Object.entries(bySource).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}\n\n`;
md += `## Groups by cause\n\n| group | rows | share | regressions (was_passing) |\n| --- | --- | --- | --- |\n${sorted.map(([c, l]) => `| ${c} | ${l.length} | ${(100 * l.length / rows.length).toFixed(1)}% | ${l.filter((r) => r.was_passing === true).length} |`).join('\n')}\n\n`;
for (const [c, l] of sorted) {
  const cl = {}; for (const r of l) cl[r.class] = (cl[r.class] ?? 0) + 1;
  md += `### ${c} (${l.length})\n\nClasses: ${Object.entries(cl).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v}`).join(', ')}\n\n| text | tab | lang | happened | expected | source |\n| --- | --- | --- | --- | --- | --- |\n`;
  for (const r of spread(l)) md += `| ${cut(r.text, 70)} | ${r.tab ?? ''} | ${r.language} | ${cut(r.happened, 110)} | ${cut(r.expected, 80)} | ${cut(r.source, 50)} |\n`;
  md += '\n';
}
if (process.argv.includes('--stdout')) console.log(md); else { writeFileSync(out, md); console.log(`wrote ${out}\n` + sorted.map(([c, l]) => `${String(l.length).padStart(5)}  ${c}`).join('\n')); }
