// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { paraphrasePairs, ownerPairs, cousinPairs, dedupe } from '../scripts/build-form-pairs.mjs';

test('paraphrase pairs keep the meaning label', () => {
  const p = paraphrasePairs([{ id: 'a', original: 'x y', message: 'x z', meaning: 'changed' }, { id: 'b', original: 'q', message: 'r', meaning: 'same' }]);
  assert.deepEqual(p.map((r) => r.same_meaning), [false, true]);
});

test('owner pairs: fragment then fix in the same tab', () => {
  const t = [
    { time: '2026-11-13T10:00:00Z', tab: 'draw', lang: 'en', text: 'On the lake', class: 'wrong', expected: 'move the duck onto the lake' },
    { time: '2026-11-13T10:00:07Z', tab: 'draw', lang: 'en', text: 'Move a duck on the lake', class: 'ok', expected: 'duck on the lake' },
    { time: '2026-11-13T10:00:09Z', tab: 'draw', lang: 'en', text: 'Draw a house', class: 'ok' },
  ];
  const p = ownerPairs(t, 'f');
  assert.equal(p.length, 1);
  assert.equal(p[0].canonical, 'Move a duck on the lake');
  assert.equal(p[0].judged, 'reading');
});

test('cousins: only failed ones, deduped across reasoners', () => {
  const row = (outcome) => ({ case: 'a b', text: 'a c', outcome, dimension: 'filler kind' });
  const r = { runs: [{ rows: [row('wrong'), row('right')] }, { rows: [row('wrong')] }] };
  assert.equal(dedupe(cousinPairs(r, 'f')).length, 1);
});
