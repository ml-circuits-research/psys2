// Long messages (G7): families of failures found by training/eval/operational-long.jsonl, rules only (no models).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { splitAnswerList, selfCorrect } from '../src/formalizer/rules/expand.mjs';
import { tokenize } from '../src/formalizer/rules/index.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const session = (opts = {}) => engine.createSession({ language: 'en', ...opts });

test('tab switch mid-message: an explicit navigation later in the message beats the tab follow of an earlier segment', async () => {
  const s = session();
  await s.send('set the background to blue and draw a sun in the top right and then open the music tab');
  assert.equal(s.state()['ui.shell'].activeTab, 'music');
  const t = session();
  await t.send('open the music tab and make your eyes happy and then open the map and speak faster');
  assert.equal(t.state()['ui.shell'].activeTab, 'map');
});

test('tab follow still works when the explicit navigation comes first', async () => {
  const s = session();
  await s.send('open the map and then draw a red house');
  assert.equal(s.state()['ui.shell'].activeTab, 'draw');
});

test('answer lists: "no" between bare answers is an answer, not a correction', () => {
  const toks = tokenize('yes, no, maybe', 0, { keepFillers: true });
  assert.equal(selfCorrect(toks), null);
  assert.equal(splitAnswerList('yes no maybe idk'), 'yes, no, maybe, idk');
  assert.equal(splitAnswerList('yes no i dont know maybe'), 'yes, no, i dont know, maybe');
  assert.equal(splitAnswerList('yes'), 'yes');
  assert.equal(splitAnswerList('no thanks'), 'no thanks');
});

test('guess: a list of answers is applied in order', async () => {
  for (const msg of ['yes, no, I don\'t know, and then maybe', 'yes no I don\'t know maybe']) {
    const s = session();
    await s.send('play guess');
    await s.send(msg);
    assert.deepEqual(s.state()['games.guess'].asked.map((a) => a.answer), ['yes', 'no', 'dontknow', 'maybe'], msg);
  }
});
