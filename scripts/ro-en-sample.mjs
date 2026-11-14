// Prints a seeded stratified sample of training/eval/ro-en-meaning/rows.jsonl for the hand check (Romanian, English, the reference reading).
//   node scripts/ro-en-sample.mjs [perSource=8] [seed=7]
import { readFileSync } from 'node:fs';
const per = Number(process.argv[2] ?? 8), seed0 = Number(process.argv[3] ?? 7);
let s = seed0 >>> 0;
const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const rows = readFileSync('training/eval/ro-en-meaning/rows.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const groups = {};
for (const r of rows) (groups[`${r.source}/${r.ro_by}`] ??= []).push(r);
for (const [g, rs] of Object.entries(groups)) {
  const pick = [...rs].sort(() => rnd() - 0.5).slice(0, per);
  for (const r of pick) console.log([r.id, r.ref.complete ? 'read' : 'UNREAD', r.ro, '=>', r.en, '||', (r.ref.key || '').replace(/^[^|]*\|core\.\w+ /, '').slice(0, 110)].join(' | '));
}
