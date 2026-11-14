// SPDX-License-Identifier: AGPL-3.0-only
// KNOWLEDGE-OUT step 5: the questions the kids worlds used to answer from their own knowledge base are the Talk tab's frames over the catalog (baby name, covering, sound with "say", yes or no with a count or
// a declared value, can X V, which K are V, what do A and B make, what kind of K is X). One general frame set; the fixture catalog (tests/fixtures/catalog) has the worlds; no network. Both reasoners.
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
  const out = [];
  for (const l of lines) {   // a fresh session per question: the frames do not lean on the topic
    const s = e.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' }));
    s.setWorldState('ui.shell', { activeTab: 'talk' });
    out.push((await s.send(l)).text);
  }
  return out;
};

for (const reasoner of ['ops', 'matrix']) {
  test(`the questions of the kids worlds are Talk frames over the catalog (${reasoner})`, async () => {
    const r = await ask(reasoner, ['What is a baby cat called?', 'What is a cow covered in?', 'What does a dog say?', 'Does a dog have 4 legs?', 'Does a dog have 5 legs?', 'Is a cat a carnivore?', 'Is a dog a fish?',
      'Can a penguin fly?', 'Do penguins swim?', 'What kind of animal is a dog?', 'Which animals are birds?', 'What do red and blue make?', 'What do you get when you mix blue and yellow?', 'Which animals have 6 legs?']);
    assert.equal(r[0], 'A baby cat is called a kitten.');
    assert.match(r[1], /cow is covered in /);
    assert.match(r[2], /dog goes (?:bark|woof)/);
    assert.equal(r[3], 'Yes, a dog has 4 legs.');
    assert.equal(r[4], 'No, a dog has 4 legs, not 5.');
    assert.equal(r[5], 'Yes, a cat is a carnivore.');
    assert.match(r[6], /^No, a dog is a mammal, not a fish\.$/);
    assert.equal(r[7], 'No, a penguin cannot fly.');
    assert.equal(r[8], 'Yes, a penguin can swim.');
    assert.match(r[9], /dog is mammal/);
    assert.match(r[10], /^Animals that are birds \(showing 12 of \d+\): hen, rooster/);
    assert.equal(r[11], 'Red and blue make purple.');
    assert.equal(r[12], 'Blue and yellow make green.');
    assert.match(r[13], /^Animals with 6 legs.*: ant, bee/);
  });

  test(`a place or word that is no list falls back to a question about one thing (${reasoner})`, async () => {
    const [colour] = await ask(reasoner, ['What colour is a banana?']);
    assert.match(colour, /yellow/);
  });
}
