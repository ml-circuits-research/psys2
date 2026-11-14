// SPDX-License-Identifier: AGPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyse } from '../scripts/measure-voices.mjs';

const V = (o) => new Map(Object.entries(o));
test('voices: coverage, precision, union, agreement-only', () => {
  const voices = {
    a: V({ 1: { ans: 'right', sig: 'x' }, 2: { ans: 'wrong', sig: 'y' }, 3: { ans: null, sig: null }, 4: { ans: 'right', sig: 'z' } }),
    b: V({ 1: { ans: 'right', sig: 'x' }, 2: { ans: 'right', sig: 'w' }, 3: { ans: 'right', sig: 'q' }, 4: { ans: 'wrong', sig: 'u' } }),
  };
  const r = analyse(voices, ['1', '2', '3', '4']);
  assert.equal(r.paths.a.answers, 3); assert.equal(r.paths.a.right, 2); assert.equal(r.paths.a.precision, 66.7);
  assert.equal(r.union.right, 4);
  assert.equal(r.agreement_all.answers, 1); assert.equal(r.agreement_all.right, 1);   // only item 1 has two equal signatures
});
