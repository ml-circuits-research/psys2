// SPDX-License-Identifier: AGPL-3.0-only
// Q96 (spec 28 section 21): the flag avatarPopupThroughDoor. ON: a turn told with view 'avatar' (the popup open) over another tab goes through the door (trace.door set, not legacy);
// OFF (the default): the same turn is the old patterns' of the ambient world (trace.legacy) and the flag changes nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { FLAGS } from '../src/dialog/flags.mjs';

const mk = async (flags) => createEngine({ loader: createFsLoader(DEFAULT_ROOT), options: flags ? { flags } : {} });
const onTalk = (e) => { const s = e.createSession({ language: 'en' }); s.setWorldState('ui.shell', { activeTab: 'talk' }); return s; };

test('the flag is OFF by default', () => assert.equal(FLAGS.avatarPopupThroughDoor, false));

test('ON: a popup turn goes through the door (trace.door = bound make, not legacy) and the tab stays the shell\'s', async () => {
  const s = onTalk(await mk({ avatarPopupThroughDoor: true }));
  const r = await s.send('make the eyes blue', { view: 'avatar' });
  assert.equal(r.trace.legacy, false, r.text);
  assert.equal(r.trace.door, 'bound make', r.text);
  assert.equal(s.state('ui.shell').activeTab, 'talk');
  const after = await s.send('hello');
  assert.notEqual(after.trace?.door, 'bound make');
});

test('OFF: the same popup turn takes the old path (legacy), and a turn without the view is unchanged', async () => {
  const e = await mk(null);
  const s = onTalk(e);
  const r = await s.send('make the eyes blue', { view: 'avatar' });
  assert.notEqual(r.trace.door, 'bound make', r.text);
  const s2 = onTalk(e);
  const r2 = await s2.send('make the eyes blue');
  assert.equal(r2.text, r.text);
});
