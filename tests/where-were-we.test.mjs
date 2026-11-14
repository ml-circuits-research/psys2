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

test('dlg.mpc#009: after an explicit return to the map, the unfinished activity is the map, not the charts digression', async () => {
  const s = session('map');
  await say(s, 'Show me', 'Oslo', 'Make a chart: apples 5, pears 3, plums 8', 'back to the map');
  assert.equal(tab(s), 'map');
  await say(s, 'Where were we?');
  assert.equal(tab(s), 'map');
});

test('a digression out of a digression: "where were we" is the activity just left, not the oldest one', async () => {
  const s = session('map');
  await say(s, 'Mark Paris.', 'Open the charts tab.', 'What is 7 plus 5?');
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
