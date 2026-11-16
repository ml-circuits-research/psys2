// SPDX-License-Identifier: AGPL-3.0-only
// The door's spell guard (reviewer 2026-11-16 07:55; spec 28 section 26): a word that any source of the reading has (the English dictionary, the language world with the
// catalog's kinds and values it carries, a live world instance, the catalog's vocabulary) is never repaired, without the catalog too; a word no source reads still is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine, spellKnown } from '../src/dialog/index.mjs';
import { requestLanguage } from '../src/dialog/request.mjs';

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const say = async (tab, text) => { const s = engine.createSession({ language: 'en' }); s.setWorldState('ui.shell', { activeTab: tab }); return (await s.send(text)).text; };

test('spell guard: words some source reads are never repaired (no catalog loaded)', async () => {
  for (const [tab, text, word] of [['editor', 'write a short letter about a villa', 'villa'], ['editor', 'write a story about baked bread', 'baked'], ['draw', 'draw a swing in the garden', 'swing'], ['draw', 'draw a castle near the river', 'castle']]) {
    const r = await say(tab, text);
    assert.doesNotMatch(r, new RegExp(`I read "${word}" as`), `${text} -> ${r}`);
  }
});

test('spell guard: a word no source reads is still repaired', async () => {
  const r = await say('editor', 'write a stroy about a fox');
  assert.match(r, /I read "stroy" as "story"/, r);
});

test('spell guard: the sources are the language world and the live worlds, not a word list', () => {
  const known = spellKnown(engine.sopworld, requestLanguage(engine.sopworld), engine.set);
  for (const w of ['villa', 'swing', 'letter', 'castle']) assert.ok(known(w), w);
  for (const w of ['stroy', 'eyegases', 'qzx']) assert.ok(!known(w), w);
});
