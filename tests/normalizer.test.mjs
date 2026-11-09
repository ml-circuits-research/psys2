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
const NOISY = 'what is 20 divided by 4 lol haha hmm yeah well um so like';
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

test('value checker: typed values are compared as values (sign, decimal separator, times, notes)', () => {
  const strict = { polarity: true, grounded: true, keepKnown: true };
  const no = (a, b, re) => { const r = checkValues(a, b, strict); assert.equal(r.ok, false, `${a} -> ${b}`); if (re) assert.match(r.reason, re); };
  no('-45.5 25.3', '45.5 25.3', /numbers differ/);
  no('go to -45.5 -25.3', 'go to 45.5 -25.3', /numbers differ/);
  no('1.5', '1 5');
  no('1.5', '15');
  no('1.5', '1.6');
  no('wake me at 7:30', 'wake me at 7 30');
  no('wake me at 7:30 am', 'wake me at 7:30 pm');
  no('play C# and Bb', 'play C and B', /typed values differ/);
  no('play C4 then D4', 'play C5 then D4');
  no('set it to minus 5', 'set it to 5');
  assert.equal(checkValues('go to -45.5 25.3', 'go to -45.5 25.3', strict).ok, true);
  assert.equal(checkValues('1,5', '1.5', strict).ok, true);          // decimal separator is a notation, not a value
  assert.equal(checkValues('add 1,500 and 2', 'add 1500 and 2', strict).ok, true);
  assert.equal(checkValues('set it to minus 5', 'set it to -5', { polarity: false }).ok, true);
  assert.equal(checkValues('wake me at 7 pm', 'wake me at 19:00', { polarity: false }).ok, true);
  assert.equal(checkValues('play C# and Bb', 'play c# and bb', strict).ok, true);
  assert.deepEqual(numbersOf('-45.5 and 1.5, then 3-5'), ['-45.5', '1.5', '3', '5']);
  assert.deepEqual(numbersOf('1 5'), ['1', '5']);
});

test('value checker: operand order, source/destination, property bindings, units', () => {
  const strict = { polarity: true, grounded: true, keepKnown: true };
  const no = (a, b, re) => { const r = checkValues(a, b, strict); assert.equal(r.ok, false, `${a} -> ${b}`); if (re) assert.match(r.reason, re); };
  no('3 minus 10', '10 minus 3', /operand order/);
  no('what is 20 divided by 4', 'what is 4 divided by 20', /operand order/);
  no('subtract 3 from 10', 'subtract 10 from 3', /operand order/);
  no('subtract 3 from 10', '3 minus 10', /operand order/);
  assert.equal(checkValues('subtract 3 from 10', '10 minus 3', { polarity: false }).ok, true);
  assert.equal(checkValues('3 - 10', '3 minus 10', { polarity: false }).ok, true);
  assert.equal(checkValues('divide 20 by 4', '20 divided by 4', { polarity: false }).ok, true);
  no('from Paris to Rome', 'from Rome to Paris', /swapped|bound to a different value/);
  no('move the piece from e2 to e4', 'move the piece from e4 to e2');
  no('from 3 to 10', 'from 10 to 3');
  assert.equal(checkValues('to Rome from Paris', 'from Paris to Rome', strict).ok, true);
  assert.equal(checkValues('from Paris to Rome', 'from Paris to Rome', strict).ok, true);
  no('eyes red and body blue', 'eyes blue and body red', /colour bound/);
  no('red eyes and blue body', 'blue eyes and red body', /colour bound/);
  no('make the eyes red and the body blue', 'make the eyes blue and the body red', /colour bound/);
  assert.equal(checkValues('the eyes are red and the body is blue', 'make the eyes red and the body blue', { polarity: false }).ok, true);
  assert.equal(checkValues('eyes red and body blue', 'blue body and red eyes', { polarity: false }).ok, true);
  no('wait 5 minutes', 'wait 5 seconds', /units differ/);
  no('3, 5', '5, 3', /order of/);
  no('put x 10 and y 20', 'put y 20 and x 10');
  assert.equal(checkValues('wait 5 mins', 'wait 5 minutes', { polarity: false }).ok, true);
});

// ---- provider status: not_ready / error are never memoized (review: the loading phase must not poison the memo) ----
const sleepy = () => { let state = 'not_ready', n = 0; return { get n() { return n; }, set: (s) => { state = s; }, stamp: () => state, propose: async ({ text }) => { n++; if (state !== 'ready') return { status: state, rewrites: [] }; return { status: 'ready', rewrites: text === NOISY ? [CLEAN] : [] }; } }; };

test('normalizer not_ready or error is not memoized; the same text is understood once the model is ready', async () => {
  const p = sleepy();
  const v = createDispatchValidator({ engine, normalizer: p });
  const first = await v.validate(msg(NOISY, 'kids.arith'));
  assert.equal(first.status, 'not_understood');
  assert.equal(first.trace.segmentations[0].pieces[0].normalizerStatus, 'not_ready');
  p.set('error');
  assert.equal((await v.validate(msg(NOISY, 'kids.arith'))).trace.segmentations[0].pieces[0].normalizerStatus, 'error');
  p.set('ready');   // no clearCache(): the earlier answers were not remembered
  const ready = await v.validate(msg(NOISY, 'kids.arith'));
  assert.equal(ready.status, 'understood');
  assert.equal(ready.produced[0].textUsed, 'normalized');
  // ready answers are memoized (one provider call for the repeat)
  const calls = p.n;
  await v.validate(msg(NOISY, 'kids.arith'));
  assert.equal(p.n, calls);
});

test('a thrown provider error is not memoized either', async () => {
  let boom = true; let calls = 0;
  const v = createDispatchValidator({ engine, normalizer: async ({ text }) => { calls++; if (boom) throw new Error('crash'); return text === NOISY ? [CLEAN] : []; } });
  assert.equal((await v.validate(msg(NOISY, 'kids.arith'))).status, 'not_understood');
  boom = false;
  assert.equal((await v.validate(msg(NOISY, 'kids.arith'))).status, 'understood');
  assert.ok(calls >= 2);
});

test('a changed provider stamp (model version) invalidates remembered rewrites; clearCache clears both caches', async () => {
  let version = 'v1', answer = [CLEAN]; let calls = 0;
  const p = { stamp: () => version, propose: async () => { calls++; return answer; } };
  const v = createDispatchValidator({ engine, normalizer: p });
  await v.validate(msg(NOISY, 'kids.arith')); const c1 = calls;
  await v.validate(msg(NOISY, 'kids.arith')); assert.equal(calls, c1);          // memoized
  version = 'v2';
  await v.validate(msg(NOISY, 'kids.arith')); assert.ok(calls > c1);            // new model: asked again
  const c2 = calls;
  v.clearCache();
  await v.validate(msg(NOISY, 'kids.arith')); assert.ok(calls > c2);            // reset: the rewrite memo is gone too
  answer = ['What is 20 divided by 5'];
  v.clearCache();
  assert.equal((await v.validate(msg(NOISY, 'kids.arith'))).status, 'not_understood');
});

test('the real normalizer host: loading -> ready transition (stubbed onnxruntime and files)', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const { createNormalizerHost } = await import('../docs/webchat/ui/normalizer-host.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'nzhost-'));
  mkdirSync(join(dir, 'vendor', 'onnxruntime'), { recursive: true });
  writeFileSync(join(dir, 'vendor', 'onnxruntime', 'ort.wasm.bundle.min.mjs'), 'export const env = { wasm: {} };\nexport const InferenceSession = { create: async () => ({}) };\n');
  const base = pathToFileURL(`${dir}/`).href;
  const realFetch = globalThis.fetch;
  let release; const gate = new Promise((r) => { release = r; });
  globalThis.fetch = async (u) => { await gate; return new Response(String(u).endsWith('tokenizer.json') ? '{}' : 'x'); };
  try {
    const meta = { files: ['encoder.int8.onnx', 'decoder.int8.onnx', 'tokenizer.json'], config: {}, version: { export_date: '2026-11-08', sha256: 'abcdef012345' } };
    const states = [];
    const host = createNormalizerHost({ base, meta, getOrt: async () => ({ ort: { InferenceSession: { create: async () => ({}) } } }), lib: { createNormalizerRuntime: () => ({ propose: async ({ text }) => (text === NOISY ? [CLEAN] : []) }) }, onStatus: (s) => states.push(s.state) });
    const v = createDispatchValidator({ engine, normalizer: host.provider });
    const early = await v.validate(msg(NOISY, 'kids.arith'));       // starts loading; the model is not there yet
    assert.equal(early.status, 'not_understood');
    assert.equal(host.status.state, 'loading');
    assert.equal(early.trace.segmentations[0].pieces[0].normalizerStatus, 'not_ready');
    release();
    await host.prepare();
    assert.equal(host.status.state, 'ready');
    const later = await v.validate(msg(NOISY, 'kids.arith'));       // same text, same validator, no clearCache
    assert.equal(later.status, 'understood');
    assert.equal(later.produced[0].textUsed, 'normalized');
    assert.ok(states.includes('loading') && states.at(-1) === 'ready');
  } finally { globalThis.fetch = realFetch; }
});
