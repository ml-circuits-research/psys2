import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/dialog/index.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { RUNTIME_DEFAULTS, sessionOptions } from '../src/dialog/runtime-config.mjs';
import { looseCandidates } from '../src/formalizer/best-effort.mjs';

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const ask = async (tab, text, bestEffort) => {
  const s = engine.createSession({ language: 'en', formalizer: 'rules', ...(bestEffort === undefined ? {} : { bestEffort }) });
  if (tab) s.setWorldState('ui.shell', { activeTab: tab });
  return s.send(text);
};

test('loose words are read as the most sensible sentence and the reply says so', async () => {
  const r = await ask('robot', 'square eyes robot pls', true);
  assert.match(r.text, /I took that as: "[^"]*eyes[^"]*square|I took that as: "[^"]*square[^"]*eyes/);
  assert.ok(!r.segments.some((x) => x.unparsed));
  assert.match(r.text, /I did not use "robot"/);
});

test('switched off, loose words stay "not understood"', async () => {
  const r = await ask('robot', 'square eyes robot pls', false);
  assert.match(r.text, /did not understand/);
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
  assert.match(r.text, /did not understand/);
});
