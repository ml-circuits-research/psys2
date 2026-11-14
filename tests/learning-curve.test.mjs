// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { slopes, svg, tableRows } from '../scripts/learning-curve.mjs';
import { hashOf } from '../scripts/freeze-heldout.mjs';

const pt = (date, total, seating, same) => ({ date, build: 'x', mechanisms: { schemaWorlds: 0, acts: 0, verbGroups: 0, total }, heldout: null, paraphrasesSame: same ?? null, seating60: seating ?? null });

test('slope: pp per added mechanism, gaps and first points marked', () => {
  const pts = [pt('2026-11-13', 10, { right: 30, total: 60 }), pt('2026-11-14', 14, { right: 36, total: 60 }, { right: 12, total: 85 })];
  const s = slopes(pts);
  assert.equal(s[0].seating60.state, 'first');
  assert.equal(s[0].heldout.state, 'gap');
  assert.deepEqual(s[1].seating60, { state: 'slope', dPP: 10, dMech: 4, perMech: 2.5 });
  assert.equal(s[1].paraphrasesSame.state, 'first');
});

test('svg and table rows render with theme variables', () => {
  const pts = [pt('2026-11-13', 10, { right: 30, total: 60 }), pt('2026-11-14', 14, { right: 36, total: 60 })];
  assert.match(svg(pts), /var\(--fg\)/);
  assert.equal(tableRows(pts).length, 3);
});

test('cousins of real cases: a series only once a point has it (off while the vendored library has no cousins)', () => {
  const base = [pt('2026-11-13', 10, { right: 30, total: 60 })];
  assert.equal(tableRows(base).length, 3);
  const rows = tableRows([{ ...base[0], cousinsReal: { right: 7, total: 10 } }]);
  assert.equal(rows.length, 4);
  assert.match(rows[3].label, /Cousins of real cases/);
});

test('hash ignores case and spacing', () => { assert.equal(hashOf('Hello  World'), hashOf(' hello world ')); });
