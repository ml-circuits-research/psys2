// G3: bounded free captures, explicit naming cues and context-anchored spelling (spec 03 section 2 and 7.9).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { spellCorrect, spellAlternates, worldVocabulary, spellVocabulary } from '../src/formalizer/spell.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const nameAfter = async (text) => { const s = engine.createSession(); await s.send(text); return s.state('ui.avatar')?.name; };

test('free name capture: frame words and suffixes stay out of the name', async () => {
  assert.equal(await nameAfter('Call yourself Zed from now on'), 'Zed');
  assert.equal(await nameAfter('Rename yourself to Bolt'), 'Bolt');
  assert.equal(await nameAfter('Name yourself Bolt please'), 'Bolt');
  assert.equal(await nameAfter('Call yourself "Mr Bolt"'), 'Mr Bolt');
  assert.equal(await nameAfter('Call yourself Bolt the Great'), 'Bolt the Great');
});

test('renaming needs a naming cue', async () => {
  assert.equal(await nameAfter('lets play hangmn'), 'PSys2');
  assert.equal(await nameAfter('try a grill for the mouth'), 'PSys2');
  assert.equal(await nameAfter('name of helper pls'), 'PSys2');
});

test('spelling: a content word of another world is not corrected into this world (boat / coat)', async () => {
  const animals = worldVocabulary(engine.set, 'kids.animals');
  assert.ok(!animals.has('boat') && animals.has('coat'));
  assert.deepEqual(spellCorrect('a purple boat', { vocab: animals }).corrections, []);
  assert.deepEqual(spellAlternates('a purple boat', { vocab: animals }), []);
  assert.deepEqual(spellAlternates('a purple boat', { vocab: spellVocabulary(engine.set) }), []);
  assert.deepEqual(spellCorrect('a purple coat', { vocab: animals, protect: new Set(['coat']) }).corrections, []);
  const s = engine.createSession();
  await s.send('Draw a red circle.');
  await s.send('a purple boat please');
  assert.equal(s.state('art.draw').objects.length, 2);
});
