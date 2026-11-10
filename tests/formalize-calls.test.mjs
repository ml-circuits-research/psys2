// COMPUTE-BUDGET 3 (no repetition): every retry path of a turn has a fixed maximum. `_formalize` (the one place that reads a clause) is called at most
// MAX_FORMALIZE times per top-level message, whatever the input: understood, not understood, noisy, Romanian, elliptic, a rewrite offer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/dialog/index.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';

const MAX_FORMALIZE = 4;
const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const MESSAGES = [
  'make a house', 'what is 3 plus 4', 'zzq flarb wug', 'hello', 'draw a sun and then a cloud and then a tree and a house and a car',
  'open the music tab instead', 'make a house and', 'B1', 'my favorite color is green', 'I have two kids', 'what is the capital of France',
  'desenează o casă verde', 'fă o casă verde și una galbenă', 'show me the moon please if you could', 'undo', 'that is wrong', 'yes', 'no',
  'and a yellow one', 'make it bigger', 'play tic tac toe', 'e4', 'asdf qwer zxcv', '??', 'x', 'the the the the the the the', 'draw draw draw draw',
];

for (const language of ['en', 'ro']) {
  test(`_formalize is called at most ${MAX_FORMALIZE} times per message (${language}, rules)`, async () => {
    const s = engine.createSession({ language, formalizer: 'rules', spell: true, partial: true, bestEffort: true });
    const orig = s._formalize.bind(s);
    let n = 0;
    s._formalize = (...a) => { n++; return orig(...a); };
    const worst = [];
    for (const m of MESSAGES) {
      n = 0;
      await s.send(m, { language, formalizer: 'rules' });
      worst.push([n, m]);
      assert.ok(n <= MAX_FORMALIZE, `"${m}": ${n} calls of _formalize (max ${MAX_FORMALIZE})`);
    }
    assert.ok(worst.some(([k]) => k >= 1), 'the counter is wired: some message reached _formalize');
  });
}
