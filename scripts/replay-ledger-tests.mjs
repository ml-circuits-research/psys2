#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Replays the ledger rows whose text is the id of a test of a world (`t.<world>.<name>`, the rows a world switch writes for the tests it did not keep passing) on the CURRENT build and appends
 * one observation per row to the case corpus (training/eval/cases.jsonl): right when the test passes now, wrong when it still fails. A row that was wrong and is right now shows as
 * WRONG -> RIGHT; nothing is deleted (the corpus is append-only, scripts/lib/cases-corpus.mjs). One mechanism for every world, no row is special.
 *
 *   node scripts/replay-ledger-tests.mjs [--build <label>] [--world geo.map] [--dry]
 * `--build` is the build label of the rows to replay (default: all rows of the latest build that has test-id rows); `--world` limits to one world.
 */
import path from 'node:path';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine, runWorldTests } from '../src/dialog/index.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';
import { createKnowledgeSource } from '../src/loaders/knowledge-source.mjs';
import { applyReasonerFlag } from './lib/reasoner-flag.mjs';
import { readCorpus, latest, appendRows, appendRun, REPO } from './lib/cases-corpus.mjs';
import { execFileSync } from 'node:child_process';

applyReasonerFlag();
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const corpus = readCorpus();
const last = latest(corpus);
const testRows = [...last.values()].filter((r) => r.kind === 'ledger' && /^t\.[a-z]+\.[a-z]+\.\w+$/.test(r.text ?? ''));
const wanted = arg('build', null) ?? [...new Set(testRows.map((r) => r.build))].sort().at(-1);
const world = arg('world', null);
const rows = testRows.filter((r) => r.build === wanted && (!world || r.text.startsWith(`t.${world}.`)));
const worlds = [...new Set(rows.map((r) => r.text.split('.').slice(1, -1).join('.')))];
const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
engine.setKnowledge(createFacts({ source: createKnowledgeSource(path.join(DEFAULT_ROOT, '../tests/fixtures/catalog')) }));
const verdict = new Map();
for (const w of worlds) {
  const r = await runWorldTests(engine, w);
  const failed = new Set(r.failed.map((f) => f.id));
  for (const row of rows.filter((x) => x.text.startsWith(`t.${w}.`))) verdict.set(row.id, failed.has(row.text) ? 'wrong' : 'right');
}
let build = 'unknown';
try { build = execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(); } catch { /* no git */ }
const today = new Date().toISOString().slice(0, 10);
const out = [], fixed = [], broke = [];
for (const row of rows) {
  const outcome = verdict.get(row.id);
  if (!outcome) continue;
  if (outcome !== row.outcome) (outcome === 'right' ? fixed : broke).push(row.id);
  out.push({ ...row, outcome, build, first_seen: row.first_seen, observed: today, happened: outcome === 'right' ? 'the test passes on this build' : row.happened });
}
console.log(`ledger replay of ${rows.length} rows (build ${wanted}, worlds ${worlds.join(', ')}): ${fixed.length} WRONG -> RIGHT, ${broke.length} RIGHT -> WRONG, ${out.filter((r) => r.outcome === 'wrong').length} still wrong`);
if (!process.argv.includes('--dry')) { appendRows(out); appendRun({ run: Math.max(0, ...corpus.map((r) => r.run ?? 0)) + 1, date: today, build, added: 0, changed: fixed.length + broke.length, regressions: broke, fixed, note: `ledger replay of ${wanted}` }); console.log(`appended ${out.length} observations to training/eval/cases.jsonl`); }
