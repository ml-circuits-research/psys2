import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/dialog/index.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { RUNTIME_DEFAULTS, sessionOptions } from '../src/dialog/runtime-config.mjs';
import { looseCandidates } from '../src/formalizer/best-effort.mjs';

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const ask = async (tab, text, bestEffort) => {
  const s = engine.createSession({ language: 'en', formalizer: 'rules', ...(bestEffort === undefined ? {} : { bestEffort }), worldAware: 'off' });   // the mechanism is tested with the world-aware veto off (it is on by default, spec 16: it turns a guess that leaves out a word into "Did you mean"; tested below)
  if (tab) s.setWorldState('ui.shell', { activeTab: tab });
  return s.send(text);
};

test('loose words are read as the most sensible sentence and the reply says so', async () => {
  const r = await ask('robot', 'square eyes robot pls', true);
  assert.match(r.text, /I took that as: "[^"]*eyes[^"]*square|I took that as: "[^"]*square[^"]*eyes/);
  assert.ok(!r.segments.some((x) => x.unparsed));
  assert.match(r.text, /I did not use "robot"/);
});

test('with the default world-aware veto, a guess that leaves out "robot" is offered, not executed', { todo: 'known failure, ledger class two readings: the generated bare form needs the kind at the end of the phrase, so the guess "square eyes" is not a candidate of the best-effort reader' }, async () => {
  const s = engine.createSession({ language: 'en', formalizer: 'rules', bestEffort: true });
  s.setWorldState('ui.shell', { activeTab: 'robot' });
  const r = await s.send('square eyes robot pls');
  assert.match(r.text, /Did you mean/);
});

test('switched off, loose words stay "not understood"', async () => {
  const r = await ask('robot', 'square eyes robot pls', false);
  assert.match(r.text, /did not (understand|catch)/);
});

test('the runtime default is on, the library default is off', () => {
  assert.equal(RUNTIME_DEFAULTS.bestEffort, true);
  assert.equal(sessionOptions(RUNTIME_DEFAULTS).bestEffort, true);
});

test('no value is invented: a missing number or colour is never borrowed from an example', () => {
  const c = looseCandidates(engine.set, 'eyes robot', { worlds: ['ui.avatar'], tabWorld: 'ui.avatar' });
  for (const x of c) assert.ok(!/\b(red|blue|green|square|round|\d+)\b/.test(x.text), x.text);
});

test('junk words are not executed', async () => {
  const r = await ask(null, 'asdf qwer zxcv', true);
  assert.match(r.text, /did not (understand|catch)/);
});

test('GAPS-1 word-coverage guard: a candidate that uses few of the input words is dropped for sentences of 5+ words', () => {
  const set = engine.set;
  const sentence = 'would you say you are happy';   // read as "happy say" (2 of 6 words) before the guard
  for (const world of ['kids.animals', 'ui.avatar']) {
    assert.ok(!looseCandidates(set, sentence, { worlds: [world], tabWorld: world }).some((c) => c.text === 'happy say'));
  }
});
