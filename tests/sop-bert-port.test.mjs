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

test('gold-label audit accounts for every original request and exposes a failed exact gate', () => {
  const summary = json('results/label-roundtrip.json');
  const rows = readFileSync(new URL('results/label-roundtrip.jsonl', root), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(new Set(rows.map((r) => r.id)).size, 6854);
  const prepared = json('results/label-audit-input.json');
  assert.equal(summary.inputSHA256, prepared.inputSHA256);
  assert.equal(summary.readerSHA256, prepared.readerSHA256);
  for (const [split, counts] of Object.entries(summary.counts)) {
    const messages = rows.filter((r) => r.split === split), requests = messages.flatMap((r) => r.rows);
    assert.equal(messages.length, counts.messages);
    assert.equal(requests.length, counts.requests);
    assert.equal(requests.filter((r) => r.status === 'exact').length, counts.labelExact);
    assert.equal(requests.filter((r) => r.status === 'changed').length, counts.changed);
    assert.equal(requests.filter((r) => r.status === 'unsupported').length, counts.unsupported);
    assert.equal(counts.requests, counts.labelExact + counts.changed + counts.unsupported);
    assert.equal(messages.filter((r) => !r.cutExact).length, counts.cutDifferent);
    for (const request of requests.filter((r) => r.status === 'exact')) {
      assert.deepEqual(request.differences, []); assert.deepEqual(request.extraKeys, []);
    }
  }
  assert.equal(summary.gate, 'fail');
  assert.equal(summary.explicitValuesEncodedAsAbsent.arrow, 530);
  assert.equal(summary.explicitValuesEncodedAsAbsent['desc:notColor'], 1);
});

test('changing CPU thread count preserves every measured historical reading', () => {
  assert.equal(json('results/historical-single-thread.json').intraOpNumThreads, 1);
  assert.deepEqual(readFileSync(new URL('results/historical-arm64.jsonl', root)), readFileSync(new URL('results/historical-single-thread.jsonl', root)));
});
