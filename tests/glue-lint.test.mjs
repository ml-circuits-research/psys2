// SPDX-License-Identifier: AGPL-3.0-only
// GLUE LINT (reviewer 2026-11-15 20:45): report-only counts of the hand-written glue between each declared world and the generic mechanisms (scripts/glue-lint.mjs). It never
// fails on the counts: they are published in worker-log.md with every landing and go down as worlds become tool primitives, views and declarations.
import test from 'node:test';
import assert from 'node:assert/strict';
import { glueLint } from '../scripts/glue-lint.mjs';

test('glue lint: counts per declared world (report-only)', () => {
  const r = glueLint();
  assert.ok(Object.keys(r).length > 0, 'at least one declared world');
  for (const [id, c] of Object.entries(r)) console.log(`# glue ${id}: files ${c.files}, request reads ${c.requestReads}, word literals ${c.wordLiterals}, replies ${c.replies}, text regex ${c.textRegex}`);
});
