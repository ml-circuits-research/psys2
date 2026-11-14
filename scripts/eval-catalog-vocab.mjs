#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Measures reading the catalog's vocabulary by buckets against the whole vocab.json (lazy loading, item 4): bytes at boot, per turn and per session, and whether the finds agree.
//   node scripts/eval-catalog-vocab.mjs [catalog dir]     (default: tests/fixtures/catalog; messages: the owner logs, the catalog lookup set, the Talk questions)
import { readFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFacts } from '../src/knowledge/facts.mjs';
import { writeBuckets } from './build-catalog-vocab.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = resolve(process.argv[2] ?? join(REPO, 'tests/fixtures/catalog'));
const rd = (f) => readFileSync(join(REPO, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const messages = [
  ...rd('training/eval/knowledge-lookup-2026-11-13.jsonl').map((r) => r.message),
  ...['2026-11-13', '2026-11-13b', '2026-11-13c'].flatMap((f) => rd(`training/eval/owner-log-${f}.jsonl`).map((r) => r.english ?? (r.lang === 'en' ? r.text : null)).filter(Boolean)),
  'What does a lighthouse look like?', 'What are the parts of a bicycle?', 'How many legs does a spider have?', 'Which is bigger, Jupiter or Mars?', 'What are the planets in order?', 'What comes after March?',
];
const dir = mkdtempSync(join(tmpdir(), 'psys2-vocab-'));
try {
  cpSync(catalog, dir, { recursive: true });
  const r = writeBuckets(dir);
  const mk = (root, log) => createFacts({ source: { text: async (p) => { try { const t = readFileSync(join(root, p), 'utf8'); log.push([p, t.length, gzipSync(t).length]); return t; } catch { return null; } } } });
  const logB = [], logW = [];
  const fb = mk(dir, logB), fw = mk(catalog, logW);
  const whole = JSON.parse(readFileSync(join(catalog, 'vocab.json'), 'utf8'));
  let disagree = 0, perTurn = [], seenBefore = 0;
  for (const m of messages) {
    const words = m.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
    const before = logB.filter(([p]) => p.startsWith('vocab/') && p !== 'vocab/index.json').reduce((s, x) => s + x[2], 0);
    await fb.loadVocabFor(words);
    await fw.loadVocabFor(words);
    perTurn.push(logB.filter(([p]) => p.startsWith('vocab/') && p !== 'vocab/index.json').reduce((s, x) => s + x[2], 0) - before);
    for (const w of words) { const a = await fb.find(w), b = await fw.find(w); if (JSON.stringify(a?.shards ?? null) !== JSON.stringify(b?.shards ?? null)) disagree++; }
  }
  const gz = (log, f) => log.filter(([p]) => f(p)).reduce((s, x) => s + x[2], 0);
  const idx = gz(logB, (p) => p === 'vocab/index.json'), bk = gz(logB, (p) => /^vocab\/[a-z0-9_]{2}\.json$/.test(p)), wholeGz = gz(logW, (p) => p === 'vocab.json');
  console.log(JSON.stringify({ catalog, lemmas: r.lemmas, buckets: r.buckets, messages: messages.length, wholeVocabKB_gz: +(wholeGz / 1024).toFixed(1), indexKB_gz: +(idx / 1024).toFixed(2),
    bucketsReadKB_gz: +(bk / 1024).toFixed(1), bucketsRead: logB.filter(([p]) => /^vocab\/[a-z0-9_]{2}\.json$/.test(p)).length, perTurnKB_gz_mean: +(perTurn.reduce((a, b) => a + b, 0) / perTurn.length / 1024).toFixed(2), disagreements: disagree, lemmasInWhole: Object.keys(whole).length }, null, 1));
} finally { rmSync(dir, { recursive: true, force: true }); }
