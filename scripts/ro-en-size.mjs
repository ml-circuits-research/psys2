// Size of the w.lang.ro draft and what a Romanian session would load: the shards (always) and, per sentence, the dictionary files of the first letters of its lemmas.
//   node scripts/ro-en-size.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { tokenize, foldKey } from '../src/translate/normalize.mjs';
import { analyze } from '../src/translate/morphology.ro.mjs';
const dir = 'handover/w.lang.ro';
const sz = (b) => ({ raw: b.length, gzip: gzipSync(b).length });
const files = ['schema.sop', ...readdirSync(`${dir}/shards`).map((f) => `shards/${f}`)];
let raw = 0, gz = 0;
for (const f of files) { const s = sz(readFileSync(`${dir}/${f}`)); raw += s.raw; gz += s.gzip; console.log(f.padEnd(24), s.raw, s.gzip); }
console.log('wires total'.padEnd(24), raw, gz);
const dict = {};
let draw = 0, dgz = 0;
for (const f of readdirSync(`${dir}/dictionary`)) { const b = readFileSync(`${dir}/dictionary/${f}`); dict[f[0]] = sz(b); draw += b.length; dgz += dict[f[0]].gzip; }
console.log('dictionary (all letters)'.padEnd(24), draw, dgz, `${Object.keys(dict).length} files`);
const rows = readFileSync('training/eval/ro-en-meaning/rows.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.ro_by !== 'rules-en-ro' && r.ro_by !== 'bergamot-en-ro');
let n = 0, tot = 0, totGz = 0, max = 0;
for (const r of rows) {
  const letters = new Set();
  for (const t of tokenize(r.ro)) if (t.kind === 'word') for (const a of analyze(t.key)) { const l = foldKey(a.entry.ro ?? a.entry.inf ?? '')[0]; if (l && dict[l]) letters.add(l); }
  const b = [...letters].reduce((a, l) => a + dict[l].raw, 0), g = [...letters].reduce((a, l) => a + dict[l].gzip, 0);
  n++; tot += b; totGz += g; max = Math.max(max, b);
}
console.log(`a sentence loads, besides the wires: mean ${Math.round(tot / n)} B of dictionary (gzip ${Math.round(totGz / n)}), max ${max} B over ${n} sentences`);
