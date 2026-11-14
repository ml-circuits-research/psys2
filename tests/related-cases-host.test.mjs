// SPDX-License-Identifier: AGPL-3.0-only
// The related-cases host adapter (scripts/lib/related-cases-host.mjs), driven by a FAKE library: the interface of sopworld 0.111 `relatedCases(world, case, opts)` / `readByTypes(world, text, opts)`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLibrary, expand, expectedOf, judge, dimensionOf, formsOf } from '../scripts/lib/related-cases-host.mjs';

const world = { get: (id) => ({ attrs: { name: [id.split('.').pop()] } }) };
const frame = { is: 'ask', key: 'legs', of: { id: 'k.cow' }, answer: ['4'] };
const fake = {
  readByTypes: (w, t) => ({ best: /legs/.test(t) ? frame : null }),
  relatedCases: (w, kase, o) => { fake.seen = { kase, o }; return [
    { frame: { ...frame, of: { id: 'k.yak' }, answer: ['4'] }, text: 'how many legs does a yak have', distance: 1, axes: ['filler'], valid: true },
    { frame: { ...frame, key: 'sound', answer: ['moo'] }, text: 'what sound does a cow make', distance: 1, axes: ['key'], valid: true },
    { frame: { ...frame, of: { id: 'k.ox' }, answer: [] }, text: 'how many legs does an ox have', distance: 2, axes: ['filler'], valid: false, why: 'no answer in the world' }]; },
};

test('library: vendored when it has relatedCases, else the path, else an error that names the choice (no hand-written fallback)', async () => {
  assert.equal((await resolveLibrary({ vendored: fake })).source, 'vendored');
  await assert.rejects(resolveLibrary({ vendored: { World: class {} } }), /no relatedCases\(\) .*--lib/);
  await assert.rejects(resolveLibrary({ vendored: null, libPath: '/nonexistent/sopworld' }), /no relatedCases\(\) in/);
});

test('expand: the case is read by the library, its related cases come from the library only, tagged with the owner dimension', () => {
  const r = expand(fake, world, { text: 'how many legs does a cow have' }, { distance: 2 });
  assert.deepEqual(r.frame, frame);
  assert.equal(fake.seen.o.distance, 2);
  assert.deepEqual(fake.seen.o.known, ['how many legs does a cow have'], 'the case itself is a known case');
  assert.deepEqual(r.related.map((c) => c.dimension), ['filler kind', 'aspect', 'filler kind']);
  assert.equal(dimensionOf({ axes: ['class'] }), 'filler kind (edge class)');
  assert.equal(dimensionOf({ axes: ['key'] }), 'aspect');
  const none = expand(fake, world, { text: 'draw a king on the throne' });
  assert.equal(none.frame, null);
  assert.match(none.why, /no typed frame/);
});

test('judge: by reply and by state; a question must not change a world; number words count', () => {
  const c = { frame };
  const exp = expectedOf(world, c);
  assert.deepEqual(formsOf('4'), ['4', 'four']);
  assert.equal(judge(c, exp, { reply: 'A cow has four legs.', before: {}, after: {} }).outcome, 'right');
  assert.equal(judge(c, exp, { reply: 'A cow has 14 legs.', before: {}, after: {} }).outcome, 'wrong');
  assert.equal(judge(c, exp, { reply: 'It has 4.', before: {}, after: { w: 1 } }).why, 'a question changed the state');
  assert.equal(judge(c, exp, { reply: '  ', before: {}, after: {} }).outcome, 'no_reply');
  const find = { frame: { is: 'find', key: 'sound', value: 'moo', answer: ['k.animals.animal.cow'] } };
  assert.deepEqual(expectedOf({ get: () => null }, find).all, [['cow']]);
});

