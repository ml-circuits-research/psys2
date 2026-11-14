#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Merges the per-row outputs of several runs of scripts/measure-ro-en-meaning.mjs (each `--rows` file has one verdict per path per row) into the table of the report:
// kept % and act-kept % (kept + the same act with another role) per path, by sentence kind and by source; plus the composed chains and the best-of bound.
//   node scripts/ro-en-merge-report.mjs <rows.jsonl>... [--out training/eval/ro-en-meaning/results.json]
import { readFileSync, writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
const rows = new Map(readFileSync('training/eval/ro-en-meaning/rows.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).map((r) => [r.id, r]));
const per = new Map();
for (const f of files) for (const l of readFileSync(f, 'utf8').split('\n').filter(Boolean)) { const x = JSON.parse(l); const o = per.get(x.id) ?? {}; for (const [k, v] of Object.entries(x)) if (k !== 'id') o[k] = v.res; per.set(x.id, o); }
const HAND = new Set(['authored', 'hand', 'owner']);   // Romanian written by a person or an agent for the set, or typed by the owner; the rest is machine-made (rules / on-device model en -> ro)
const chains = {
  'grammar>m4+model': (o) => (o.grammar !== 'abstain' ? o.grammar : o['m4+model']),
  'grammar-lib>m4+model': (o) => (o['grammar-lib'] !== 'abstain' ? o['grammar-lib'] : o['m4+model']),
  'grammar-um+gl>m4+model': (o) => (o['grammar-um+gl'] !== 'abstain' ? o['grammar-um+gl'] : o['m4+model']),
  'best-of(rules,model,grammar)': (o) => ['rules', 'model', 'grammar'].map((p) => o[p]).find((v) => v === 'kept') ?? o.rules,
};
const PATHS = ['rules', 'model', 'm4', 'm4+model', 'grammar', 'grammar+rules', 'grammar+m4', 'grammar>m4+model', 'grammar-lib', 'grammar-um', 'grammar-um+gl', 'grammar-lib>m4+model', 'grammar-um+gl>m4+model', 'best-of(rules,model,grammar)'];
const verdict = (o, p) => (chains[p] ? chains[p](o) : o[p]);
const tally = {};
const bump = (dim, val, p, v) => { const t = ((tally[dim] ??= {})[val] ??= { n: 0 }); (t[p] ??= { kept: 0, act: 0, abstain: 0 }); if (p === PATHS[0]) t.n++; if (v === 'kept') t[p].kept++; else if (v === 'act') t[p].act++; else if (v === 'abstain') t[p].abstain++; };
for (const [id, o] of per) {
  const r = rows.get(id);
  const sets = [['all', 'all'], ['source', r.source], ['kind', r.kind], ['hand-only', HAND.has(r.ro_by) ? 'hand' : 'machine'], ['kind (hand Romanian only)', HAND.has(r.ro_by) ? r.kind : null], ['kind (operational only)', r.source === 'operational' ? r.kind : null], ['kind (not operational, hand Romanian)', HAND.has(r.ro_by) && r.source !== 'operational' ? r.kind : null]];
  for (const [dim, val] of sets) if (val) for (const p of PATHS) { const v = verdict(o, p); if (v) bump(dim, val, p, v); }
}
const pct = (a, n) => (n ? (100 * a / n).toFixed(1) : '-').padStart(5);
const lines = [];
for (const [dim, vals] of Object.entries(tally)) {
  lines.push(`\n== ${dim}  (kept % / act-kept %)`);
  lines.push('value'.padEnd(26) + 'n'.padStart(6) + PATHS.map((p) => p.slice(0, 15).padStart(16)).join(''));
  for (const [val, t] of Object.entries(vals)) lines.push(val.padEnd(26) + String(t.n).padStart(6) + PATHS.map((p) => { const c = t[p]; return (c ? `${pct(c.kept, t.n)}/${pct(c.kept + c.act, t.n)}` : '-').padStart(16); }).join(''));
}
console.log(lines.join('\n'));
// the rows the grammar path answered: how every path did on the SAME rows (the fair comparison of precision)
{
  const sub = { all: { n: 0 }, 'hand, not template': { n: 0 }, template: { n: 0 } };
  for (const [id, o] of per) {
    if (o.grammar === 'abstain') continue;
    const r = rows.get(id);
    for (const k of ['all', r.source === 'template' ? 'template' : HAND.has(r.ro_by) ? 'hand, not template' : null]) if (k) { sub[k].n++; for (const p of PATHS) { const v = verdict(o, p); sub[k][p] = (sub[k][p] ?? 0) + (v === 'kept' ? 1 : 0); } }
  }
  console.log('\n== rows the grammar path answered (kept % per path on the same rows)');
  for (const [k, t] of Object.entries(sub)) console.log(k.padEnd(22), String(t.n).padStart(5), PATHS.map((p) => `${p}=${pct(t[p] ?? 0, t.n).trim()}`).join('  '));
}
if (out) writeFileSync(out, JSON.stringify({ paths: PATHS, tally, note: 'kept = same reading as the reference English; act = same act, another role; abstain = the path produced nothing' }, null, 1) + '\n');
