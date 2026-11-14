// Writes training/eval/ro-en-meaning/hand-checked.tsv: the rows of `node scripts/ro-en-sample.mjs 9 7` with the verdict of the hand check (every row was read by a person, the coding agent;
// verdicts: ok = the Romanian means what the English says; ro-broken = the Romanian is not good Romanian (machine-made rows); ref-doubtful = the Romanian and the English agree but the
// rules reader's reading of the English is itself odd (the reading is the instrument, not a gold standard)).
import { readFileSync, writeFileSync } from 'node:fs';
let s = 7 >>> 0;
const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const rows = readFileSync('training/eval/ro-en-meaning/rows.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const groups = {};
for (const r of rows) (groups[`${r.source}/${r.ro_by}`] ??= []).push(r);
const BROKEN = new Set(['grid:294.r', 'grid:1730.r', 'grid:1292.r', 'grid:1047.r', 'grid:1069.r', 'grid:384.m', 'grid:999.m', 'roundtrip:2012.r', 'roundtrip:2034.r', 'roundtrip:2060.r', 'roundtrip:2048.r']);
const DOUBTFUL = new Set(['real:070', 'op:ui.avatar#020.ro', 'real:035', 'op:ui.avatar#075.roc', 'op:ui.avatar#002.roc']);
const out = ['id\tsource\tverdict'];
for (const [g, rs] of Object.entries(groups)) for (const r of [...rs].sort(() => rnd() - 0.5).slice(0, 9)) out.push([r.id, r.source, BROKEN.has(r.id) ? 'ro-broken' : DOUBTFUL.has(r.id) ? 'ref-doubtful' : 'ok'].join('\t'));
writeFileSync('training/eval/ro-en-meaning/hand-checked.tsv', out.join('\n') + '\n');
const c = {}; for (const l of out.slice(1)) { const v = l.split('\t')[2]; c[v] = (c[v] ?? 0) + 1; }
console.log(out.length - 1, c);
