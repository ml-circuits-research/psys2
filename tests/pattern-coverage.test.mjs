import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/dialog/index.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { applyCoveragePolicy, PATTERN_COVERAGE_POLICY } from '../src/formalizer/rules/index.mjs';

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const ask = async (tab, text) => {
  const s = engine.createSession({ language: 'en', formalizer: 'rules' });
  if (tab) s.setWorldState('ui.shell', { activeTab: tab });
  return s.send(text);
};
const m = (world, free) => ({ pattern: { worldId: world }, slots: free ? { w: { class: 'rest', tokens: [4, 4 + free] } } : {} });

test('a long input swallowed by a free-text slot loses to another world that covers more', () => {
  const kept = applyCoveragePolicy([m('art.draw', 10), m('kids.shop', 0)], 12);
  assert.deepEqual(kept.map((x) => x.pattern.worldId), ['kids.shop']);
});
test('short inputs, same-world and lone readings are kept (default policy)', () => {
  assert.equal(applyCoveragePolicy([m('art.draw', 5), m('kids.shop', 0)], 7).length, 2);
  assert.equal(applyCoveragePolicy([m('art.draw', 10)], 12).length, 1);
  assert.equal(applyCoveragePolicy([m('art.draw', 10), m('art.draw', 0)], 12).length, 2);
  assert.equal(PATTERN_COVERAGE_POLICY.dropWhenAlone, false);
});
test('the lone low-coverage reading is dropped only when the policy says so', () => {
  assert.equal(applyCoveragePolicy([m('art.draw', 10)], 12, { minWords: 8, minCoverage: 0.35, dropWhenAlone: true }).length, 0);
});
test('ball and pencil with a payment and a change question is the shop change, with or without punctuation', async () => {
  for (const text of ["I would like a ball and a pencil and pay with 20 lei. what's the change", 'I would like a ball and a pencil and pay with 20 lei what is the change']) {
    const r = await ask(null, text);
    assert.match(r.text, /Your change from 20 lei/, text);
    assert.doesNotMatch(r.text, /Ta-da/);
  }
});
test('a question is not a name', async () => {
  for (const text of ['which move is best', 'which move is best?', 'what is best?']) {
    const r = await ask('hangman', text);
    assert.doesNotMatch(r.text, /Nice to meet you/, text);
  }
  assert.match((await ask(null, 'Zed is fine by me')).text, /Nice to meet you, Zed/);
});
