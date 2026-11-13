// SPDX-License-Identifier: AGPL-3.0-only
// SCENE-NATURAL P1: a piece without a verb of its own continues the conversation in the open tab; a world that is not the open tab and has nothing running
// cannot take it (general rule in src/dialog/continuation.mjs, applied by the world-aware layer), whatever the words are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { ownWords } from '../src/dialog/continuation.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const session = async (tab, setup = []) => {
  const s = engine.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { activeTab: tab });
  for (const m of setup) await s.send(m);
  return s;
};
const worldsOf = (r) => r.segments.map((x) => x.world ?? x.match?.worldId).filter(Boolean);

test('ownWords: a clause is a fragment when nothing is left outside the slots and the closed grammar classes', () => {
  assert.deepEqual(ownWords({ text: 'the tigers', match: { slots: { w: { text: 'tigers' } } } }), []);
  assert.deepEqual(ownWords({ text: 'it is different', match: { slots: { w: { text: 'different' } } } }), []);
  assert.deepEqual(ownWords({ text: 'move the tigers', match: { slots: { w: { text: 'tigers' } } } }), ['move']);
  assert.deepEqual(ownWords({ text: 'make it happy', match: { slots: { w: { text: 'happy' } } } }), ['make']);
});

test('a bare animal name on the Drawing tab is not a word to guess in a hangman nobody started', async () => {
  for (const w of ['the elephants', 'it is a penguin', 'tigers']) {
    const s = await session('draw', ['draw a house']);
    const r = await s.send(w);
    assert.ok(!worldsOf(r).includes('games.hangman'), `${w}: ${r.text}`);
    assert.doesNotMatch(r.text, /hangman/i, w);
  }
});

test('a running game still takes its own word, with another tab open', async () => {
  const s = await session('draw', ['draw a house']);
  await s.send('play hangman');
  const r = await s.send('the tiger');
  assert.ok(worldsOf(r).includes('games.hangman') || /hangman|letter|word/i.test(r.text), r.text);
});

test('a pronoun is about the world of the last action: "make it happy" after an avatar change never reaches the diagram', async () => {
  const s = await session('diagram', ['draw a red circle']);
  s.setWorldState('ui.shell', { activeTab: 'robot' });
  await s.send('make a cartoon');
  const before = JSON.stringify(s.state()['diagram.sketch']);
  const r = await s.send('make it happy');
  assert.ok(!worldsOf(r).includes('diagram.sketch'), r.text);
  assert.equal(JSON.stringify(s.state()['diagram.sketch']), before);
});

test('the world of the last action takes its own fragments even when its tab is not open', async () => {
  const s = await session('robot', ['make a cartoon']);
  s.setWorldState('ui.shell', { activeTab: 'charts' });
  const r = await s.send('now in a women');
  assert.ok(worldsOf(r).includes('ui.avatar'), r.text);
});
