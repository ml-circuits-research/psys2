// SPDX-License-Identifier: AGPL-3.0-only
// TALK reads the knowledge catalog generically (KNOWLEDGE-ALL-WORLDS, ACTS x SCHEMAS): a fact of any world is found through the words of the schemas, the ordered series come from the
// catalog, and a world that was added to the catalog is read with no change in Talk. The fixture catalog (tests/fixtures/catalog) holds the worlds; no network. Both reasoners.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import { createFacts } from '../src/knowledge/facts.mjs';
import { createKnowledgeSource } from '../src/loaders/knowledge-source.mjs';

const CAT = path.join(import.meta.dirname, 'fixtures/catalog');
const engines = {};
for (const reasoner of ['ops', 'matrix']) engines[reasoner] = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner } });
const ask = async (reasoner, lines) => {
  const e = engines[reasoner];
  e.setKnowledge(createFacts({ source: createKnowledgeSource(CAT) }));
  const s = e.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
  s.setWorldState('ui.shell', { activeTab: 'talk' });
  const out = [];
  for (const l of lines) out.push((await s.send(l)).text);
  return out;
};

for (const reasoner of ['ops', 'matrix']) {
  test(`facts of any world are found through the words of the schemas (${reasoner})`, async () => {
    const [colour, capital, eats, legs, minutes, kind, where] = await ask(reasoner, ['What colour is a banana?', 'What is the capital of France?', 'What does a duck eat?', 'How many legs does a spider have?', 'How many minutes are in an hour?', 'Is a dog an animal?', 'Where does a cow live?']);
    assert.match(colour, /colour of the banana is yellow/);
    assert.equal(capital, 'The capital of France is Paris.');
    assert.match(eats, /duck eats .*insects/);
    assert.equal(legs, 'A spider has 8 legs.');
    assert.equal(minutes, 'An hour has 60 minutes.');
    assert.equal(kind, 'Yes, a dog is an animal.');
    assert.match(where, /habitat of the cow is farm/);
  });

  test(`ordered series come from the catalog: the planets from the Sun, the months in a cycle (${reasoner})`, async () => {
    const [order, third, before, month, after] = await ask(reasoner, ['What are the planets in order?', 'Which planet is the third from the sun?', 'What comes before Mercury?', 'What is the fifth month?', 'What comes after December?']);
    assert.match(order, /^From the sun, the planets are Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus and Neptune\.$/);
    assert.equal(third, 'The third planet from the sun is Earth.');
    assert.match(before, /Mercury is the closest to the sun/);
    assert.match(month, /May/);
    assert.match(after, /January/);
  });

  test(`a world added to the catalog is read with no change in Talk: k.demo fruits, a size from the schema's enum (${reasoner})`, async () => {
    const [colour, taste, bigger] = await ask(reasoner, ['What colour is a lemon?', 'What is the taste of an apple?', 'Which is bigger, a mouse or an elephant?']);
    assert.match(colour, /lemon is yellow/);
    assert.match(taste, /taste of the apple is sweet/);
    assert.match(bigger, /^(?:An elephant is bigger than a mouse|I know)/);
  });
}
