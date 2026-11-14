// SPDX-License-Identifier: AGPL-3.0-only
// The cousins host adapter (scripts/lib/cousins-host.mjs), driven by a FAKE library: the interface of sopworld 0.73 `cousins(world, case, opts)` / `readByTypes(world, text, opts)`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLibrary, expand, expectedOf, judge, tabulate, tableText, dimensionOf, formsOf } from '../scripts/lib/cousins-host.mjs';

const world = { get: (id) => ({ attrs: { name: [id.split('.').pop()] } }) };
const frame = { is: 'ask', key: 'legs', of: { id: 'k.cow' }, answer: ['4'] };
const fake = {
  readByTypes: (w, t) => ({ best: /legs/.test(t) ? frame : null }),
  cousins: (w, kase, o) => { fake.seen = { kase, o }; return [
    { frame: { ...frame, of: { id: 'k.yak' }, answer: ['4'] }, text: 'how many legs does a yak have', degree: 1, dims: ['filler'], valid: true },
    { frame: { ...frame, key: 'sound', answer: ['moo'] }, text: 'what sound does a cow make', degree: 1, dims: ['key'], valid: true },
    { frame: { ...frame, of: { id: 'k.ox' }, answer: [] }, text: 'how many legs does an ox have', degree: 2, dims: ['filler'], valid: false, why: 'no answer in the world' }]; },
};

test('library: vendored when it has cousins, else the path, else an error that names the choice (no hand-written fallback)', async () => {
  assert.equal((await resolveLibrary({ vendored: fake })).source, 'vendored');
  await assert.rejects(resolveLibrary({ vendored: { World: class {} } }), /no cousins\(\) yet.*--lib/);
  await assert.rejects(resolveLibrary({ vendored: null, libPath: '/nonexistent/sopworld' }), /no cousins\(\) in/);
});

test('expand: the case is read by the library, its cousins come from the library only, tagged with the owner dimension', () => {
  const r = expand(fake, world, { text: 'how many legs does a cow have' }, { degree: 2 });
  assert.deepEqual(r.frame, frame);
  assert.equal(fake.seen.o.degree, 2);
  assert.deepEqual(fake.seen.o.known, ['how many legs does a cow have'], 'the case itself is a known case');
  assert.deepEqual(r.cousins.map((c) => c.dimension), ['filler kind', 'aspect', 'filler kind']);
  assert.equal(dimensionOf({ dims: ['class'] }), 'filler kind (edge class)');
  assert.equal(dimensionOf({ dims: ['key'] }), 'aspect');
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

test('tabulate: degree x dimension, ordered; table text names empty sets', () => {
  const rows = [{ degree: 2, dimension: 'filler kind', outcome: 'right' }, { degree: 1, dimension: 'aspect', outcome: 'wrong' }, { degree: 1, dimension: 'aspect', outcome: 'right' }];
  const t = tabulate(rows);
  assert.deepEqual(t.map((e) => `${e.degree}${e.dimension}${e.right}/${e.of}`), ['1aspect1/2', '2filler kind1/1']);
  assert.match(tableText(t, { title: 'x' }), /1 \/ 2 {2}\(50%\)/);
  assert.match(tableText([]), /no valid cousins/);
});
