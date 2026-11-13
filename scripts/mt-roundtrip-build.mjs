#!/usr/bin/env node
/**
 * ROUND-TRIP-MINING step 3: the English that came back and that we did not read although the meaning is the same ("reader-gap" cases of
 * scripts/mt-roundtrip-classify.mjs) becomes
 *   (a) an English paraphrase evaluation set, training/eval/paraphrases-rt-2026-11-12.jsonl (the operational case format; gold = the original case's expectation),
 *   (b) paraphrase TRAINING rows in the format of scripts/collect-paraphrases.mjs, training/paraphrases/out/mt-roundtrip.jsonl, with source='mt-roundtrip:<lang>'
 *       (the label comes from the reading of the ORIGINAL English message through the same labelling as every paraphrase batch).
 * Deduplicated, English only, deterministic. Run after the reading fixes so that the labels are the current rules' labels.
 *
 *   node scripts/mt-roundtrip-build.mjs [--cases training/results/round-trip-cases-2026-11-12.jsonl]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { collectBatch } from './collect-paraphrases.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const rows = readFileSync(resolve(REPO, arg('cases', 'training/results/round-trip-cases-2026-11-12.jsonl')), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const english = (s) => /^[\x20-\x7e‘’“”]+$/.test(s);   // plain English text: no other script, no accented letters
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ---- (a) the evaluation set ------------------------------------------------------------------------------------------
const seen = new Map();   // key -> entry
for (const r of rows) {
  if (r.class !== 'reader-gap' || !english(r.back_translation) || norm(r.back_translation) === norm(r.original)) continue;
  const key = `${r.world}|${norm(r.back_translation)}|${JSON.stringify(r.expect)}`;
  const e = seen.get(key);
  if (e) { if (!e.langs.includes(r.lang)) e.langs.push(r.lang); continue; }
  seen.set(key, { world: r.world, ...(r.tab ? { tab: r.tab } : {}), setup: r.setup ?? [], ...(r.init ? { init: r.init } : {}), message: r.back_translation, expect: r.expect, families: ['mt-roundtrip'], original: r.original, original_id: r.id, langs: [r.lang] });
}
const evalSet = [...seen.values()].map((e, i) => ({ id: `rt#${String(i + 1).padStart(3, '0')}`, ...e }));
writeFileSync(resolve(REPO, 'training/eval/paraphrases-rt-2026-11-12.jsonl'), evalSet.map((e) => JSON.stringify(e)).join('\n') + '\n');

// ---- (b) the training rows -------------------------------------------------------------------------------------------
const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const byWorld = new Map();
for (const e of evalSet) {
  if (e.init) continue;   // a case that needs a prepared state cannot be replayed by the labeller
  const w = byWorld.get(e.world) ?? new Map();
  const k = `${e.original_id}`;
  const t = w.get(k) ?? { id: `rt.${e.original_id}`, goal: e.original, canonical: e.original, variants: [], setup: e.setup, tab: e.tab, langs: new Map() };
  t.variants.push(e.message); t.langs.set(e.message, e.langs);
  w.set(k, t); byWorld.set(e.world, w);
}
const records = [];
for (const [world, tasks] of byWorld) {
  for (const t of tasks.values()) {
    const tab = t.tab ?? engine.set.get(world)?.tab?.id ?? null;
    const recs = await collectBatch(engine, { world, tab, author: 'mt-roundtrip', batch: 'rt', tasks: [t] });
    for (const r of recs) {
      if (r.phenomenon === 'variant') { const langs = t.langs.get(r.text) ?? []; r.source = `mt-roundtrip:${langs[0] ?? 'xx'}`; r.langs = langs; r.lineage = { ...r.lineage, kind: 'mt-roundtrip', source: r.source }; }
      else r.source = 'mt-roundtrip:original';
      records.push(r);
    }
  }
}
writeFileSync(resolve(REPO, 'training/paraphrases/out/mt-roundtrip.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n');
const variants = records.filter((r) => r.phenomenon === 'variant');
const usable = variants.filter((r) => r.expected_circuit);
console.log(JSON.stringify({ evalCases: evalSet.length, trainingRows: records.length, variantRows: variants.length, variantRowsWithLabel: usable.length, byLabel: Object.fromEntries([...new Set(variants.map((r) => r.label_status))].map((k) => [k, variants.filter((r) => r.label_status === k).length])) }, null, 1));
