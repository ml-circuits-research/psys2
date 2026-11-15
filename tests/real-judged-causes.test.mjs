// SPDX-License-Identifier: AGPL-3.0-only
// The headline's own failures by cause (reviewer 2026-11-15 08:15 item 2): `report` groups the in-scope wrong / partly rows by `judgedCause` (area = the world the check names,
// else the tab's; kind = what went wrong), from what the row records, with every row id. Retired rows and right rows are never listed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { judgedCause, judgedFailures } from '../scripts/real-set.mjs';

test('judgedCause: area from the check, kind from the outcome and the failing items, Romanian first', () => {
  assert.equal(judgedCause({ tab: 'robot', check: { world: 'ui.avatar' } }, { outcome: 'executed', failing: ['answer:robot'] }), 'ui.avatar: acted; the reply does not say what the check asks');
  assert.equal(judgedCause({ tab: 'robot', check: { world: 'ui.avatar' } }, { outcome: 'executed', failing: ['status:unsupported'] }), 'ui.avatar: acted; the status is not the expected one');
  assert.equal(judgedCause({ tab: 'draw', lang: 'ro', check: { world: 'art.draw' } }, { outcome: 'not_understood', failing: ['not_understood'] }), 'Romanian: art.draw: not understood');
  assert.equal(judgedCause({ tab: 'diagram', check: { world: 'diagram.sketch' } }, { outcome: 'other_world', worlds: ['art.draw'], failing: ['state:edges.length=1'] }), 'diagram.sketch: another world took the turn (art.draw)');
  assert.equal(judgedCause({ tab: 'draw', check: { world: 'art.draw' } }, { outcome: 'executed', failing: ['state:art.draw:objects.length=3', 'answer:big'] }), 'art.draw: acted; the state is not the expected one');
});

test('judgedFailures: only in-scope wrong / partly rows, grouped, largest first, every id kept', () => {
  const set = [{ id: 'r1', tab: 'robot', check: { world: 'ui.avatar' } }, { id: 'r2', tab: 'robot', check: { world: 'ui.avatar' } }, { id: 'r3', tab: 'draw', check: { world: 'art.draw' } },
    { id: 'r4', tab: 'robot', check: { world: 'ui.avatar' }, retired: { reason: 'x' } }, { id: 'r5', tab: 'robot', check: { world: 'ui.avatar' } }];
  const res = { rows: [{ id: 'r1', verdict: 'partly', outcome: 'executed', failing: ['answer:a'] }, { id: 'r2', verdict: 'wrong', outcome: 'executed', failing: ['answer:b'] },
    { id: 'r3', verdict: 'wrong', outcome: 'not_understood', failing: ['not_understood'] }, { id: 'r4', verdict: 'wrong', outcome: 'executed', failing: ['answer:c'] }, { id: 'r5', verdict: 'right', outcome: 'executed' }] };
  const g = judgedFailures(set, res);
  assert.deepEqual(g.map((x) => [x.cause, x.count, x.wrong, x.partly]), [['ui.avatar: acted; the reply does not say what the check asks', 2, 1, 1], ['art.draw: not understood', 1, 1, 0]]);
  assert.deepEqual(g[0].rows.map((x) => x.id), ['r1', 'r2']);
});
