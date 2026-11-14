import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { fixtureCatalog } from './helpers.mjs';

// ROUND-TRIP-MINING step 2: the original messages of the round trip that the English reading itself missed (spec 03 section 1c, compound messages)
const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
engine.setKnowledge(await fixtureCatalog());   // the questions of the kids worlds are Talk frames over the catalog
const say = async (tab, ...texts) => {
  const s = engine.createSession({ language: 'en' });
  if (tab) s.setWorldState('ui.shell', { activeTab: tab });
  let r;
  for (const t of texts) r = await s.send(t);
  return r.text;
};

test('a connective inside one question does not cut it in two', async () => {
  const t = await say(null, 'what do red and yellow make then how many sides does a hexagon have pls');
  assert.match(t, /orange/); assert.match(t, /6 sides/);
  assert.match(await say('robot', 'um how many days are in a week. what do red and yellow make, what day comes after Monday'), /orange[\s\S]*Tuesday/);
});

test('a question after "and" / "then" is not the free text of the command before it', async () => {
  assert.match(await say('draw', 'draw 2 trees then what sound does a cow make'), /2 .*trees[\s\S]*moo/);
  assert.match(await say('draw', 'draw 2 trees and what sound does a cow make'), /moo/);
  const t = await say(null, 'add milk to my shopping list and also can penguins fly');
  assert.match(t, /milk/); assert.match(t, /cannot fly/);
});

test('a command of another world after "and" is read as its own command', async () => {
  const t = await say('music', 'play twinkle twinkle and draw a house');
  assert.match(t, /Twinkle/); assert.match(t, /house/);
});

test('shell and game gaps: "go back one" undoes, "put me in ..." places the mark, "first result" after a count', async () => {
  assert.match(await say('robot', 'your mouth should be a grill', 'go back one'), /went back/);
  assert.match(await say('tictactoe', 'Start a new tic tac toe game.', 'put me in the upper right corner'), /top right/);
  assert.match(await say('documents', 'count the witch', 'Show the first result.'), /Result 1 of/);
});
