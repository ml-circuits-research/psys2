// SPDX-License-Identifier: AGPL-3.0-only
// The case corpus (training/eval/cases.jsonl) is append-only: ids are stable, no two consecutive observations of a case say the same, every wrong row has a group and a stage,
// and the system map holds the table of the measures that count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { caseId, readCorpus, readRuns, latest } from '../scripts/lib/cases-corpus.mjs';
import { stageOf } from '../scripts/lib/failure-cause.mjs';

test('case ids are stable and the corpus is well formed', () => {
  assert.equal(caseId('s', 't', 'draw'), caseId('s', 't', 'draw'));
  assert.notEqual(caseId('s', 't', 'draw'), caseId('s', 't', 'talk'));
  const rows = readCorpus(), last = new Map();
  assert.ok(rows.length > 1000);
  for (const r of rows) {
    assert.equal(r.id, caseId(r.source, r.text, r.tab), r.id);
    assert.ok(['right', 'wrong', 'na', 'unchecked', 'retired'].includes(r.outcome), r.id);
    if (r.outcome === 'wrong') assert.ok(r.group && r.stage && r.stage === stageOf(r.group), `${r.id} has a group and its stage`);
    const p = last.get(r.id);
    if (p) assert.notEqual(p.outcome, r.outcome, `${r.id}: an observation is appended only when the outcome changed`);
    last.set(r.id, r);
  }
  assert.equal(latest(rows).size, last.size);
});

test('the runs file lists only ids that exist', () => {
  const ids = new Set(readCorpus().map((r) => r.id));
  for (const run of readRuns()) for (const id of [...run.regressions, ...run.fixed]) assert.ok(ids.has(id), id);
});

test('the system map carries the table of the measures that count', () => {
  const html = readFileSync(new URL('../docs/system-map.html', import.meta.url), 'utf8');
  assert.match(html, /The measures that count/);
  for (const m of ['Live worlds on a world schema + acts', 'Coverage grid holes', 'Pairs of worlds that cooperate', 'Cases in the corpus']) assert.ok(html.includes(m), m);
});
