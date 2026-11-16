// While the catalog is not read yet (the page's early period, or an unreachable catalog) a refusal a missing row may have caused says that knowledge is still loading
// (reply fact refused.knowledge_loading, en + ro), never "no drawing of X" / "I know nothing about X" (reviewer 2026-11-16 09:50).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';

const down = { text: async () => null };   // a catalog that answers nothing
const ask = async (text, tab, language) => {
  const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  const facts = createFacts({ source: down });
  engine.setKnowledge(facts);
  const s = engine.createSession({ language, formalizer: 'rules', spell: true, partial: true, bestEffort: true });
  s.setWorldState('ui.shell', { activeTab: tab });
  return { r: await s.send(text), facts };
};

test('an unreachable catalog reports the loading state', async () => {
  const facts = createFacts({ source: down });
  assert.equal(facts.loadState(), 'loading');
});

test('drawing a thing the unread catalog could draw says knowledge is loading', async () => {
  const { r, facts } = await ask('draw a swing', 'draw', 'en');
  assert.equal(facts.loadState(), 'loading');
  assert.match(r.text, /still loading/i);
  assert.doesNotMatch(r.text, /no drawing|know nothing/i);
});
