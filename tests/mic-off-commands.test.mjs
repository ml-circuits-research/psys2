// SPDX-License-Identifier: AGPL-3.0-only
// MIC2: the mute synonyms (lang.mic.off, English only) work typed as ui.shell commands, in English and (through the translator) Romanian; "be quiet" / "taci" are not the microphone;
// the browser-side matcher (isStopMicCommand) accepts the same phrases and recognizer typos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';

globalThis.window = {};
const { isStopMicCommand } = await import('../docs/webchat/ui/speech.mjs');
const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), translator: createTranslator() });

const EN = ['mute the mic', 'stop listening', 'microphone off', 'mic off', 'turn off the mic', 'pause listening', 'stop the microphone', 'close the microphone', 'go to sleep', "that's all for now", 'stop microphone', 'stop the mic', 'close the mic'];
// Romanian reaches the world only through the translator; these are the phrases the rules translator turns into an English mute command today (a gap: pune pe mute, taci din ascultat, gata cu ascultatul, microfon oprit, stop microfon, gata cu microfonul).
const RO = ['oprește microfonul', 'închide microfonul', 'nu mai asculta'];

for (const [lang, list] of [['en', EN], ['ro', RO]]) {
  test(`typed mute commands switch listening off (${lang})`, async () => {
    for (const t of list) {
      const s = engine.createSession({ language: lang });
      s.setWorldState('ui.shell', { listening: true, handsFree: true });
      await s.send(t, { language: lang });
      assert.equal(s.state('ui.shell').listening, false, t);
      assert.equal(s.state('ui.shell').handsFree, false, t);
    }
  });
}

test('the local matcher accepts them, with typos, and refuses ordinary sentences', () => {
  for (const t of [...EN, ...RO, 'pune pe mute', 'mute', 'stop the microphon', 'stop mic', 'Stop microphone.', 'oprește microfon']) assert.ok(isStopMicCommand(t), t);
  for (const t of ['be quiet', 'stop talking', 'taci', 'stop', 'play a song', 'draw a microphone', 'open the music tab', 'make the mic bigger', 'speak slower']) assert.ok(!isStopMicCommand(t), t);
});

test('"be quiet" does not switch the microphone off', async () => {
  const s = engine.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { listening: true, handsFree: true });
  await s.send('be quiet');
  assert.equal(s.state('ui.shell').handsFree, true);
});
