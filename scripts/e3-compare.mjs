#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * E3: compare two e1-collect runs (hand-written patterns vs patterns generated from descriptions).
 *
 *   node scripts/e1-collect.mjs --mode rules --sets operational,operational-ro,dialogues,gold,real --out base.json
 *   PSYS_GEN_PATTERNS=only node scripts/e1-collect.mjs ... --out gen.json
 *   node scripts/e3-compare.mjs base.json gen.json [--worlds kids.shop,geo.map,docs.editor] [--json out.json] [--list N]
 *
 * Per set group: right / wrong (wrong + partly) / not understood for the audited worlds and for everything, then every changed case.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [a, b] = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const worlds = new Set((arg('worlds', 'kids.shop,geo.map,docs.editor')).split(','));
const listN = Number(arg('list', 40));
const load = (f) => { const d = JSON.parse(readFileSync(f, 'utf8')); return d.records ?? d.rows ?? d.results ?? d; };
const A = load(a), B = load(b);
const rows = (x) => (Array.isArray(x) ? x : Object.values(x).flat());
const ra = rows(A), rb = rows(B);
const key = (r) => `${r.set}|${r.id}`;
const mb = new Map(rb.map((r) => [key(r), r]));
const group = (s) => (s.startsWith('gold-') ? 'gold' : s.startsWith('real-') ? 'real' : s);
const bucket = (o) => (o === 'right' ? 'right' : o === 'not_understood' ? 'not_understood' : o === 'wrong' || o === 'partly' ? 'wrong' : 'other');
const tally = () => ({ n: 0, right: 0, wrong: 0, not_understood: 0, other: 0 });
const out = { base: a, gen: b, worlds: [...worlds], sets: {}, changes: [] };
for (const r of ra) {
  const q = mb.get(key(r));
  if (!q) continue;
  const g = group(r.set);
  for (const [scope, ok] of [['audited', worlds.has(r.world)], ['all', true]]) {
    if (!ok) continue;
    const s = ((out.sets[g] ??= {})[scope] ??= { base: tally(), gen: tally() });
    s.base.n++; s.gen.n++; s.base[bucket(r.outcome)]++; s.gen[bucket(q.outcome)]++;
  }
  if (r.outcome !== q.outcome) out.changes.push({ set: r.set, id: r.id, world: r.world, message: r.message, from: r.outcome, to: q.outcome, replyBase: (r.reply ?? '').slice(0, 80), replyGen: (q.reply ?? '').slice(0, 80), patBase: r.segments?.[0]?.pattern ?? null, patGen: q.segments?.[0]?.pattern ?? null });
}
const cls = (c) => (c.from === 'right' ? (c.to === 'wrong' || c.to === 'partly' ? 'right->wrong' : 'right->not_understood') : c.to === 'right' ? (c.from === 'wrong' || c.from === 'partly' ? 'wrong->right' : 'not_understood->right') : `${c.from}->${c.to}`);
out.changeCounts = {};
for (const c of out.changes) { c.kind = cls(c); out.changeCounts[c.kind] = (out.changeCounts[c.kind] ?? 0) + 1; }
console.log('set        scope     |      base right/wrong/nu |       gen right/wrong/nu');
for (const [g, v] of Object.entries(out.sets)) for (const [scope, s] of Object.entries(v)) {
  const f = (t) => `${String(t.right).padStart(5)}/${String(t.wrong).padStart(4)}/${String(t.not_understood).padStart(4)} of ${t.n}`;
  console.log(`${g.padEnd(10)} ${scope.padEnd(8)} | ${f(s.base)} | ${f(s.gen)}`);
}
console.log('changes', JSON.stringify(out.changeCounts));
const order = ['right->wrong', 'right->not_understood', 'not_understood->right', 'wrong->right'];
for (const k of order) {
  const list = out.changes.filter((c) => c.kind === k && (worlds.has(c.world) || k.startsWith('right->wrong')));
  console.log(`\n== ${k} (${list.length})`);
  for (const c of list.slice(0, listN)) console.log(`  [${c.set}] ${c.world}: ${JSON.stringify(c.message).slice(0, 90)}  ${c.patBase ?? '-'} -> ${c.patGen ?? '-'}`);
}
if (arg('json')) writeFileSync(arg('json'), JSON.stringify(out, null, 1));
