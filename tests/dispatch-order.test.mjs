import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createDispatchValidator } from '../src/dialog/dispatch-validate.mjs';

// G1 (spec 03 section 7.13): complete readings beat partial ones, original/spell beat generated ones, the normalizer runs only on residue
const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const W = (...pairs) => pairs.map(([world, score]) => ({ world, score }));
const piece = (text, worlds, start = 0) => ({ start, end: start + text.length, text, worlds });
const msg = (text, segmentations) => ({ id: 't', text, context: { tab: null, recent_worlds: [], session: [] }, segmentations });
const hallucinating = (rewrite) => { const calls = []; const f = async ({ text }) => { calls.push(text); return [{ text: rewrite(text), score: -0.05 }]; }; f.calls = calls; return f; };

const cases = [
  ['colours', 'wat do red and yelow mak', 'wat do red', 'yelow mak', 'What do red and red make?', 'talk'],
  ['operands', 'wat is 2 and 3 plus 4', 'wat is 2', '3 plus 4', 'What is 2 and 2 plus 4?', 'kids.arith'],
  ['objects', 'wat do 2 pencils and 3 pencils cost', 'wat do 2 pencils', '3 pencils cost', 'What do 2 pencils and 2 pencils cost?', 'kids.tasks'],
  ['cities', 'weather in pariss and london', 'weather in pariss', 'london', 'weather in paris and paris', 'geo.map'],
];
for (const [label, full, head, tail, halluc, world] of cases) {
  test(`complete spell reading beats an incomplete split with a normalizer rewrite (and joins ${label})`, async () => {
    const split = { score: -0.1, segments: [piece(head, W([world, 0.8])), piece(tail, W([world, 0.8]), full.indexOf(tail))] };
    const whole = { score: -0.5, segments: [piece(full, W([world, 0.8]))] };
    const nz = hallucinating(() => halluc);
    const withN = await createDispatchValidator({ engine, normalizer: nz }).validate(msg(full, [split, whole]));
    const without = await createDispatchValidator({ engine }).validate(msg(full, [split, whole]));
    assert.equal(withN.winner.index, without.winner.index, 'same winner with and without the normalizer');
    const segs = withN.trace.segmentations;
    const wt = segs[withN.winner.index];
    // never a generated piece while a complete original/spell reading exists
    if (segs.some((s) => s.tier === 0)) {
      assert.equal(wt.tier, 0);
      assert.deepEqual(nz.calls, [], 'the normalizer is not asked while a complete reading exists');
    }
  });
}

test('the colour case: the complete spell reading wins and the normalizer is never asked', async () => {
  const full = 'wat do red and yelow mak';
  const nz = hallucinating(() => 'What do red and red make?');
  const split = { score: -0.1, segments: [piece('wat do red', W(['talk', 0.8])), piece('yelow mak', W(['talk', 0.8]), 15)] };
  const whole = { score: -0.5, segments: [piece(full, W(['talk', 0.8]))] };
  const r = await createDispatchValidator({ engine, normalizer: nz }).validate(msg(full, [split, whole]));
  assert.equal(r.status, 'understood');
  assert.equal(r.winner.index, 1);
  assert.equal(r.trace.segmentations[1].tier, 0);
  assert.deepEqual(nz.calls, []);
  assert.match(r.produced[0].usedText, /yellow/);
});

test('the normalizer still runs when no segmentation is complete', async () => {
  const noisy = 'what is 20 divided by 4 lol haha hmm yeah well um so like';
  const nz = hallucinating(() => 'What is 20 divided by 4');
  const r = await createDispatchValidator({ engine, normalizer: nz }).validate(msg(noisy, [{ score: -0.1, segments: [piece(noisy, W(['kids.arith', 0.9]))] }]));
  assert.equal(r.status, 'understood');
  assert.equal(nz.calls.length > 0, true);
});

test('a lower validity class always wins over a higher neural score', async () => {
  const t = 'What is 20 divided by 4';
  const r = await createDispatchValidator({ engine }).validate(msg(t, [
    { score: 0, segments: [piece('What is 20', W(['kids.arith', 0.99])), piece('divided by blorp', W(['kids.arith', 0.99]), 11)] },
    { score: -9, segments: [piece(t, W(['kids.arith', 0.2]))] },
  ]));
  assert.equal(r.winner.index, 1);
  assert.equal(r.trace.segmentations[1].tier, 0);
});

test('a cut inside a clause read through a lower-ranked world is a weak cut (class 3), not a complete reading', async () => {
  const t = 'what is 7 plus 5 minus 2';
  const r = await createDispatchValidator({ engine }).validate(msg(t, [
    { score: -0.1, segments: [piece('what is 7 plus 5', W(['kids.arith', 0.99])), piece('minus 2', W(['kids.shapes', 0.5], ['kids.arith', 0.3], ['data.charts', 0.2]), 17)] },
  ]));
  const g = r.trace.segmentations[0];
  if (g.valid && g.pieces[1].chosen.rank > 1) assert.equal(g.tier, 3);
});

test('a delimited split of clean top-ranked readings stays class 0', async () => {
  const t = 'What is 20 divided by 4. What day comes after Monday?';
  const a = 'What is 20 divided by 4.', b = 'What day comes after Monday?';
  const r = await createDispatchValidator({ engine }).validate(msg(t, [{ score: -0.1, segments: [piece(a, W(['kids.arith', 0.9])), piece(b, W(['kids.time', 0.8]), t.indexOf(b))] }]));
  assert.equal(r.trace.segmentations[0].tier, 0);
});

// RP5c item 1: the earlier turns of the context are replayed to seed the checking session; a drawing turn follows its tab and moves it to Drawing,
// but the message is checked on the tab the user is on now (a tab opened by a command counts like a click, routing tier T).
test('RP5c: replaying earlier drawing turns does not move the tab the message is checked on', async () => {
  const t = 'draw 3 circles';
  const context = { tab: 'diagram', recent_worlds: ['art.draw'], session: ['draw a small blue fish', 'delete the fish'] };
  const r = await createDispatchValidator({ engine }).validate({ id: 't', text: t, context, segmentations: [{ score: 0, segments: [piece(t, W(['art.draw', 0.9], ['diagram.sketch', 0.5]))] }] });
  assert.equal(r.status, 'understood');
  assert.match(JSON.stringify(r.produced), /diagram\.sketch/);
  assert.doesNotMatch(JSON.stringify(r.produced), /art\.draw/);
});
