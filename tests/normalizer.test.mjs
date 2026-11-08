import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createDispatchValidator } from '../src/dialog/dispatch-validate.mjs';
import { checkValues, numbersOf } from '../src/dialog/value-check.mjs';
import { worldVocabulary } from '../src/formalizer/spell.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const piece = (text, world) => ({ start: 0, end: text.length, text, worlds: [{ world, score: 0.9 }] });
const msg = (text, world) => ({ id: 't', text, context: { tab: null, recent_worlds: [], session: [] }, segmentations: [{ score: -0.1, segments: [piece(text, world)] }] });
/** A fake provider: a table text -> rewrites; records its calls. */
const fake = (table) => { const calls = []; return { calls, propose: async ({ world, tab, text, beam }) => { calls.push({ world, tab, text, beam }); return table[text] ?? []; } }; };
const NOISY = 'um okay so what is 20 divided by 4 haha';
const CLEAN = 'What is 20 divided by 4';

test('value checker: numbers, colours, negation, quotes', () => {
  assert.deepEqual(numbersOf('add three red apples and 12 pears, the 2nd red one'), ['12', '3', 'o2']);
  assert.equal(checkValues('draw two red cars', 'Draw 2 red cars.').ok, true);
  assert.equal(checkValues('draw two red cars', 'Draw 3 red cars.').ok, false);
  assert.equal(checkValues('draw a red car', 'Draw a blue car.').ok, false);
  assert.equal(checkValues('do not draw a car', 'Draw a car.').ok, false);
  assert.equal(checkValues("don't draw a car", 'Do not draw a car').ok, true);
  assert.equal(checkValues('say "hello there"', 'Say "goodbye".').ok, false);
});

test('value checker: unknown words are values, known words may be dropped', () => {
  const vocab = worldVocabulary(engine.set, 'kids.arith');
  assert.equal(checkValues('hey could you tell me how many apples bartholomew has', 'How many apples does bartholomew have?', { vocab }).ok, true);
  assert.equal(checkValues('how many apples bartholomew has', 'How many apples does tom have?', { vocab }).ok, false);   // the name was replaced
  assert.equal(checkValues('how many apples tomm has', 'How many apples does tom have?', { vocab }).ok, true);    // a typo of a known name is fixed
});

test('normalizer rewrite is tried only when nothing validates, and the first valid rewrite wins', async () => {
  const p = fake({ [NOISY]: ['garbage that no rule reads', CLEAN, 'What is 20 divided by 5'] });
  const v = createDispatchValidator({ engine, normalizer: p });
  const r = await v.validate(msg(NOISY, 'kids.arith'));
  assert.equal(r.status, 'understood');
  assert.equal(r.produced[0].textUsed, 'normalized');
  assert.equal(r.produced[0].usedText, CLEAN);
  assert.match(r.why, /normalizer's rewrite/);
  assert.deepEqual(p.calls.map((c) => c.beam), [3]);
  // a text the rules already read never calls the provider
  const p2 = fake({});
  const v2 = createDispatchValidator({ engine, normalizer: p2 });
  const r2 = await v2.validate(msg(CLEAN, 'kids.arith'));
  assert.equal(r2.produced[0].textUsed, 'original');
  assert.equal(p2.calls.length, 0);
});

test('a rewrite that validates but changes a number is rejected by the value checker', async () => {
  const p = fake({ [NOISY]: ['What is 20 divided by 5'] });
  const r = await createDispatchValidator({ engine, normalizer: p }).validate(msg(NOISY, 'kids.arith'));
  assert.equal(r.status, 'not_understood');
  const at = r.trace.segmentations[0].pieces[0].attempts.find((a) => a.variant === 'normalized');
  assert.equal(at.valid, false);
  assert.match(at.reason, /value check: numbers differ/);
  // with the checker off the wrong reading is accepted (this is what the checker prevents)
  const off = await createDispatchValidator({ engine, normalizer: p, policy: { checkValues: false } }).validate(msg(NOISY, 'kids.arith'));
  assert.equal(off.status, 'understood');
});

test('no provider, a failing provider, tryNormalizer off: nothing changes', async () => {
  const none = await createDispatchValidator({ engine }).validate(msg(NOISY, 'kids.arith'));
  assert.equal(none.status, 'not_understood');
  const boom = { propose: async () => { throw new Error('model crashed'); } };
  const r = await createDispatchValidator({ engine, normalizer: boom }).validate(msg(NOISY, 'kids.arith'));
  assert.equal(r.status, 'not_understood');
  const off = await createDispatchValidator({ engine, normalizer: fake({ [NOISY]: [CLEAN] }), policy: { tryNormalizer: false } }).validate(msg(NOISY, 'kids.arith'));
  assert.equal(off.status, 'not_understood');
});

test('a bare function is accepted as provider', async () => {
  const r = await createDispatchValidator({ engine, normalizer: async ({ text }) => (text === NOISY ? [CLEAN] : []) }).validate(msg(NOISY, 'kids.arith'));
  assert.equal(r.produced[0].textUsed, 'normalized');
});

test('value checker (strict): opposites, ungrounded and dropped words', () => {
  const vocab = worldVocabulary(engine.set, 'art.draw');
  const strict = { vocab, polarity: true, grounded: true, keepKnown: true };
  assert.equal(checkValues('tree too big, make it small', 'Make the tree big.', strict).ok, false);          // an opposite word was introduced
  assert.equal(checkValues('start guessing', 'I give up.', strict).ok, false);                              // words with no counterpart in the piece
  assert.equal(checkValues('can u make it a sunny day', 'Make it a sunny day', strict).ok, true);            // politeness dropped
  assert.equal(checkValues('draw the sun and the cloud', 'Draw the sun', strict).ok, false);                // a known content word was dropped
});

test('provider scores: rewrites below normalizerMinScore are not tried', async () => {
  const p = { propose: async () => [{ text: CLEAN, score: -0.9 }] };
  const low = await createDispatchValidator({ engine, normalizer: p, policy: { normalizerMinScore: -0.5 } }).validate(msg(NOISY, 'kids.arith'));
  assert.equal(low.status, 'not_understood');
  const ok = await createDispatchValidator({ engine, normalizer: p, policy: { normalizerMinScore: -1 } }).validate(msg(NOISY, 'kids.arith'));
  assert.equal(ok.produced[0].textUsed, 'normalized');
});
