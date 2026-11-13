// SPDX-License-Identifier: AGPL-3.0-only
// The holes of English (handover/lang.en) closed in slice 2: relative clauses, "some of", "the other one", "or", negated requests read right in the worlds that carry the act;
// the controls (what was read before) stay read. Temporal prepositions are the open holes: temporal (no world has an order in time to consume them) and a leading "never" (kids.tasks reads it as a statement about a task): listed, not asserted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runHoleCases } from '../scripts/lib/lang-holes.mjs';

test('lang-holes cases: every closed hole and every control is right; the open hole is only reported', async () => {
  const rows = await runHoleCases();
  assert.ok(rows.length >= 30);
  const bad = rows.filter((r) => !['temporal', 'never'].includes(r.hole) && r.outcome !== 'right');
  assert.deepEqual(bad.map((r) => `${r.id} ${r.text} => ${r.happened}`), []);
});
