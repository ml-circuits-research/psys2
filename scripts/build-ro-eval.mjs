#!/usr/bin/env node
// Builds the Romanian operational set (RD5) from the English one and the Romanian phrasings written by Haiku batches
// (training/paraphrases/ro/<world>.<k>.jsonl: {id, ro, ro_casual}). Every English case yields up to two Romanian cases with the same setup and
// expectation: `<id>.ro` (correct Romanian with diacritics) and `<id>.roc` (casual, typed without diacritics, folded here so the set is clean).
// The evaluator (scripts/eval-operational.mjs --ro, or --set training/eval/operational-ro.jsonl) runs them with language auto and checks the
// English reply text, so the same expectations apply.
//
//   node scripts/build-ro-eval.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(REPO, 'training/paraphrases/ro');
const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ĂÂÎȘȚŞŢ]/g, (c) => ({ Ă: 'A', Â: 'A', Î: 'I', Ș: 'S', Ț: 'T', Ş: 'S', Ţ: 'T' })[c]);
const cases = new Map(readFileSync(join(REPO, 'training/eval/operational.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => { const c = JSON.parse(l); return [c.id, c]; }));
const ro = new Map();
for (const f of readdirSync(DIR).filter((x) => /\.\d+\.jsonl$/.test(x) && !x.endsWith('.canon.jsonl'))) {
  for (const line of readFileSync(join(DIR, f), 'utf8').split('\n').filter(Boolean)) {
    try { const r = JSON.parse(line); if (r.id && cases.has(r.id)) ro.set(r.id, r); } catch { /* skip a malformed line */ }
  }
}
const out = [];
for (const [id, c] of cases) {
  const r = ro.get(id);
  if (!r) continue;
  // messages with setup in English stay as they are; only the tested message is Romanian
  if (r.ro) out.push({ ...c, id: `${id}.ro`, message: r.ro, lang: 'ro', variant: 'diacritics', source_id: id });
  if (r.ro_casual) out.push({ ...c, id: `${id}.roc`, message: fold(r.ro_casual), lang: 'ro', variant: 'casual', source_id: id });
}
writeFileSync(join(REPO, 'training/eval/operational-ro.jsonl'), out.map((c) => JSON.stringify(c)).join('\n') + '\n');
console.log(`${ro.size} of ${cases.size} English cases have Romanian phrasings; wrote ${out.length} Romanian cases to training/eval/operational-ro.jsonl`);
