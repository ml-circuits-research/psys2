// SPDX-License-Identifier: AGPL-3.0-only
// A committed result of the REAL set must be from the tree it claims to measure (reviewer 2026-11-14 23:50): the headline once said 201/253 for weeks after the tab cut made it 142,
// because nobody re-ran the default result files. Every result file records `build` and `tree` (scripts/lib/measure-build.mjs); this test fails when the files the measurement
// depends on (src, worlds, knowledge, the judge, the set) are no longer the ones measured. Fix: node scripts/real-set.mjs run --reasoner matrix  (and --reasoner ops).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshness, treeOf, REAL_SET_INPUTS } from '../scripts/lib/measure-build.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

test('the default REAL-set result files are from the current tree (re-run them after any change to what they measure)', (t) => {
  if (treeOf(REPO) == null) { t.skip('not a git checkout'); return; }
  for (const r of ['matrix', 'ops']) {
    const f = join(REPO, `training/results/real-2026-11-15-${r}.json`);
    if (!existsSync(f)) continue;
    const res = JSON.parse(readFileSync(f, 'utf8'));
    const { fresh, why } = freshness(REPO, res);
    assert.ok(fresh, `${f}: ${why}. Inputs: ${REAL_SET_INPUTS.join(', ')}. Run: node scripts/real-set.mjs run --reasoner ${r}`);
  }
});
