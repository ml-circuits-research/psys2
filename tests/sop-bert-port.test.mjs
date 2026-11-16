import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = new URL('../training/sop-bert/', import.meta.url);
const json = (p) => JSON.parse(readFileSync(new URL(p, root)));

test('original SOP-BERT source/data are unchanged and historical split remains disjoint', () => {
  const manifest = json('provenance.json');
  assert.equal(manifest.commit, 'ac33631635314bf00e14e222809e8aa4ab934f38');
  for (const entry of manifest.files) {
    const data = readFileSync(new URL(`upstream/${entry.path}`, root));
    assert.equal(createHash('sha256').update(data).digest('hex'), entry.sha256, entry.path);
  }
  const temporary = mkdtempSync(resolve('.sop-bert-test-'));
  try {
    const report = JSON.parse(execFileSync('python3', [new URL('prepare.py', root).pathname, '--out', temporary], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } }));
    const original = json('results/historical-split.json');
    assert.deepEqual(report, original);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

test('historical evaluation summary matches every retained row and preserves mismatch', () => {
  const rows = readFileSync(new URL('results/historical-arm64.jsonl', root), 'utf8').trim().split('\n').map(JSON.parse);
  const summary = json('results/historical-arm64.json');
  assert.equal(new Set(rows.map((r) => r.id)).size, 585);
  for (const key of ['requested', 'right', 'wrong', 'notDone', 'extra']) assert.equal(rows.reduce((n, r) => n + r[key], 0), summary.counts[key], key);
  for (const row of rows) assert.equal(row.requested, row.right + row.wrong + row.notDone);
  assert.equal(summary.threshold, null);
  assert.equal(summary.reproducedToReportedPrecision, false);
  assert.notEqual(summary.rightPercent.toFixed(1), summary.historicalReportedRightPercent.toFixed(1));
});
