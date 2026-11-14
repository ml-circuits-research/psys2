// What a two-letter split of the derived (UniMorph) dictionary would cost per message (the library's `dictionary({ prefix: 2 })`; the catalog's files are split by one letter).
//   node scripts/ro-en-twoletter.mjs
import { readFileSync } from 'node:fs';
import { LANG_RO_UNIMORPH } from '../src/lang/ro.unimorph.generated.mjs';
import { LANG_RO_FACTS } from '../src/lang/ro.facts.generated.mjs';
import { tokenize, foldKey } from '../src/translate/normalize.mjs';
const rows = readFileSync('training/eval/ro-en-meaning/rows.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => ['authored', 'hand', 'owner'].includes(r.ro_by));
const split = (dict, n) => { const o = {}; for (const text of Object.values(dict)) for (const row of text.split('\n')) { if (!row) continue; const k = foldKey(row.split('\t')[0]).slice(0, n); o[k] = (o[k] ?? 0) + row.length + 1; } return o; };
for (const [name, dict] of [['hand', LANG_RO_FACTS.dictionary], ['UniMorph', LANG_RO_UNIMORPH]]) for (const n of [1, 2]) {
  const sizes = split(dict, n);
  let tot = 0;
  for (const r of rows) { const ks = new Set(); for (const t of tokenize(r.ro)) if (t.kind === 'word') ks.add(foldKey(t.raw).slice(0, n)); for (const k of ks) tot += sizes[k] ?? 0; }
  console.log(`${name} dictionary, ${n}-letter files: ${Object.keys(sizes).length} files, ${(tot / rows.length / 1024).toFixed(1)} KB per message`);
}
