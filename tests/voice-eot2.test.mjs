// SPDX-License-Identifier: AGPL-3.0-only
// EOT2: the end-of-turn detector must not treat "play" (a reading that needs an argument) as a whole message.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const dry = async (text, tab) => { const s = engine.createSession({ language: 'en' }); if (tab) s.setWorldState('ui.shell', { activeTab: tab }); return s.dryRead(text, { language: 'en', deadlineMs: 2000 }); };

test('dryRead: a reading with a missing argument is not complete (phrase log rows 63-68)', async () => {
  // On the Music tab a bare "play" is a complete command since RP3 item 8 (it replays the last song); the
  // voice end-of-turn still waits the long pause there because the utterance ends in a verb (EOT2 trailing-verb rule).
  for (const t of ['play']) assert.equal((await dry(t, 'map')).complete, false, t);
  assert.equal((await dry('play', 'map')).reason, 'missing');
});

test('dryRead: complete readings stay complete', async () => {
  for (const [t, tab] of [['play a random song', 'music'], ['make a house', 'robot'], ['set title to Title 1', 'editor'], ['create chapter one', 'editor']]) {
    const r = await dry(t, tab);
    assert.ok(r.complete, `${t}: ${r.reason}`);
  }
});
