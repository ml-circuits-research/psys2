import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { plain, plainSpans, dropPunctuation } from '../scripts/lib/safe-noise.mjs';
import { checkValues } from '../src/dialog/value-check.mjs';

const FIX = JSON.parse(readFileSync(new URL('../training/tests/fixtures/safe_noise.json', import.meta.url), 'utf8'));

test('shared fixtures: the JavaScript port answers like training/psys2_train/safe_noise.py', () => {
  for (const [src, want] of FIX.plain) assert.equal(plain(src), want, src);
  for (const [src, want, spans] of FIX.plain_spans) { const r = plainSpans(src); assert.equal(r.text, want); assert.deepEqual(r.protected, spans); }
});

test('dropPunctuation keeps values and quoted payloads', () => {
  assert.equal(dropPunctuation('Go to 45.5, 25.3.'), 'Go to 45.5 25.3');
  assert.equal(dropPunctuation('Wake me at 7:30, please!'), 'Wake me at 7:30 please');
  assert.equal(dropPunctuation('Say "Hi, you!" now.'), 'Say "Hi, you!" now');
  assert.equal(dropPunctuation('Play C# and Bb.'), 'Play C# and Bb');
  for (const [src] of FIX.plain) assert.equal(checkValues(src, dropPunctuation(src)).ok, true, src);
});

test('N1 noiser never changes typed values (45.5 stays 45.5, quoted payload unchanged)', async () => {
  const { makeNoiser, rng32, auditPair } = await import('../scripts/build-normalizer-pairs.mjs');
  const noiser = makeNoiser(rng32(3));
  const sentences = ['Go to coordinates 45.5 25.3.', 'Set the speed to 1.5.', 'Wake me at 7:30.', 'It is -3 degrees.', 'Play C# and Bb.', 'Say "Hello, big world!" now.', 'Move the piece from -45.5 to 25.3, please.'];
  let rejected = 0;
  for (let i = 0; i < 4000; i++) {
    const clean = sentences[i % sentences.length];
    const noisy = noiser(clean);
    assert.ok(!/\b455\b/.test(noisy) && !/\b253\b/.test(noisy) && !/\b15\b/.test(noisy) && !/\b730\b/.test(noisy), noisy);
    if (clean.includes('"')) assert.ok(noisy.includes('"Hello, big world!"') || !auditPair(clean, noisy).ok, noisy);
    if (!auditPair(clean, noisy).ok) rejected++;
  }
  assert.ok(rejected < 150, `audit rejected ${rejected} of 4000`);
});
