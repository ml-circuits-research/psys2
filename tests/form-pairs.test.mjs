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

test('cousins: failed loose variant paired with the passing clean canonical of the same key and answer', () => {
  const w = (text, outcome, key = 'sound', answer = ['moo'], c = 'Hey what a sound makes a cow') => ({ case: c, text, outcome, key, answer, dimension: 'filler kind' });
  const loose = { runs: [{ rows: [w('Hey what a sound makes a dog', 'wrong'), w('Hey what a sound makes a cat', 'wrong', 'sound', ['meow']), w('x', 'right'), w('Um sound a dog', 'wrong', 'sound', ['moo'], 'Um 7 plus 5')] }, { rows: [w('Hey what a sound makes a dog', 'wrong')] }] };
  const clean = { runs: [{ rows: [w('what sound does a dog make', 'right'), w('what sound does a pig make', 'wrong', 'sound', ['oink'])] }] };
  const { pairs, dropped } = cousinPairs(loose, clean, 'f');
  assert.equal(dedupe(pairs).length, 2);
  assert.equal(pairs[0].canonical, 'what sound does a dog make');
  assert.equal(pairs[0].same_meaning, true);
  assert.equal(dropped.noPassingCanonical, 1);
  assert.deepEqual(dedupe(pairs).map((p) => p.judged), ['reading', 'unsure']);
});
