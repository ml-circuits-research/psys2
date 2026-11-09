// "Where were we?" (review decision c, 2026-11-09; specs/11-discourse.md section 10): the most recent unfinished activity the user left for a digression.
// Not the last thing said, not the oldest topic. An explicit "back to X" to an earlier activity is a return (we are in X, X stays the answer until
// the user digresses again); "back to X" for a world never visited is a digression from the current one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const session = (tab) => { const s = engine.createSession({ language: 'en' }); s.setWorldState('ui.shell', { activeTab: tab }); return s; };
const say = async (s, ...texts) => { const out = []; for (const t of texts) out.push(await s.send(t)); return out; };
const tab = (s) => s.state()['ui.shell'].activeTab;

test('dlg.avt#040: "back to chess" (never visited) is a digression from the editor, so we were in the editor', async () => {
  const s = session('editor');
  await say(s, 'Add a heading Notes.', 'Back to chess.');
  assert.equal(tab(s), 'chess');
  await say(s, 'Where were we?');
  assert.equal(tab(s), 'editor');
});

test('dlg.mpc#009: after an explicit return to the map, the unfinished activity is the map, not the charts digression', async () => {
  const s = session('map');
  await say(s, 'Show me', 'Oslo', 'Make a chart: apples 5, pears 3, plums 8', 'back to the map');
  assert.equal(tab(s), 'map');
  await say(s, 'Where were we?');
  assert.equal(tab(s), 'map');
});

test('dlg.doc#045: after "back to the story", "where were we" is the story and stays there on a second ask', async () => {
  const s = session('documents');
  const rs = await say(s, 'Open the fairy tale story.', 'Summarize the first section.', "Let's draw a cat.", 'Back to the story.', 'Where were we?', 'Where were we?');
  assert.equal(tab(s), 'documents');
  assert.match(rs[4].text, /Woodcutter/i);
  assert.match(rs[5].text, /Woodcutter/i);
});

test('a digression out of a digression: "where were we" is the activity just left, not the oldest one', async () => {
  const s = session('map');
  await say(s, 'Mark Paris.', 'Open the charts tab.', "Let's play hangman.");
  await say(s, 'Where were we?');
  assert.equal(tab(s), 'charts');
});

test('the return is sticky only until the next digression', async () => {
  const s = session('editor');
  await say(s, 'Add a heading Notes.', 'Open the charts tab.', 'Back to the editor.');
  assert.equal(tab(s), 'editor');
  await say(s, "Let's play hangman.", 'Where were we?');
  assert.equal(tab(s), 'editor');
});
