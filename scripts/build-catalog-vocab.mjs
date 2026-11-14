#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Cuts a catalog's `vocab.json` (lemma -> shard ids) into buckets by the first two letters of the lemma, for lazy loading (specs/06 "Lazy loading", "the catalog by the same index"):
 *
 *   node scripts/build-catalog-vocab.mjs <catalog dir> [--out <dir>]      (default out: the catalog dir; writes vocab/index.json and vocab/<bucket>.json next to vocab.json)
 *
 * `vocab/index.json` is { version, buckets: { <bucket>: <number of lemmas> } }. A host (src/knowledge/facts.mjs) that finds it reads only the buckets the words of a message fall in, instead of
 * the whole vocabulary (about 1.3 MB for the full catalog); a catalog without it is read whole, as before. The knowledge repository runs this at its build (handover/): a bucket is a plain file,
 * cached by the catalog's version like every other file of the catalog.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

export const bucketOf = (w) => (String(w).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 2) || '_').padEnd(2, '_');

/** { lemma: [shard ids] } -> { bucket: { lemma: [...] } } */
export function bucketVocab(vocab) {
  const out = {};
  for (const [k, v] of Object.entries(vocab)) (out[bucketOf(k)] ??= {})[k] = v;
  return out;
}

export function writeBuckets(dir, outDir = dir) {
  const vocab = JSON.parse(readFileSync(join(dir, 'vocab.json'), 'utf8'));
  const index = existsSync(join(dir, 'index.json')) ? JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) : {};
  const buckets = bucketVocab(vocab);
  mkdirSync(join(outDir, 'vocab'), { recursive: true });
  for (const [b, entries] of Object.entries(buckets)) writeFileSync(join(outDir, 'vocab', `${b}.json`), JSON.stringify(entries));
  writeFileSync(join(outDir, 'vocab/index.json'), JSON.stringify({ version: index.version ?? null, buckets: Object.fromEntries(Object.entries(buckets).map(([b, e]) => [b, Object.keys(e).length])) }));
  return { lemmas: Object.keys(vocab).length, buckets: Object.keys(buckets).length };
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const dir = process.argv[2];
  if (!dir) { console.error('usage: node scripts/build-catalog-vocab.mjs <catalog dir> [--out <dir>]'); process.exit(2); }
  const i = process.argv.indexOf('--out');
  const r = writeBuckets(resolve(dir), i > 0 ? resolve(process.argv[i + 1]) : resolve(dir));
  console.log(`vocab buckets: ${r.lemmas} lemmas in ${r.buckets} buckets`);
}
