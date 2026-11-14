// SPDX-License-Identifier: AGPL-3.0-only
// Declared schemas (specs/21 section 6, specs/25): user.profile and the four games declare a schema (schema.sop, declare=yes) so the dice, the chips and the buttons serve them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as lib from '../src/vendor/sopworld/sopworld.mjs';
import { createFsLoader } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { engineSampler } from '../src/dialog/sampler.mjs';
import { build } from '../scripts/build-schema-world.mjs';

const engine = await createEngine({ loader: createFsLoader() });
const open = (tab) => { const s = engine.createSession({ language: 'en' }); if (tab) s.setWorldState('ui.shell', { activeTab: tab }); return s; };
const WORLD = { 'games.tictactoe': 'tictactoe', 'games.hangman': 'hangman', 'games.guess': 'guess', 'games.chess': 'chess', 'user.profile': null };

test('a declared schema generates only schema.declared.mjs (the world keeps its own files)', async () => {
  for (const id of Object.keys(WORLD)) {
    const { files, schema } = await build(new URL(`../worlds/${id}`, import.meta.url).pathname);
    assert.deepEqual(Object.keys(files), ['schema.declared.mjs']);
    assert.ok(schema.declared);
  }
});

test('the four games and the profile serve the dice, and the world reads every sentence the dice says', async () => {
  for (const [id, tab] of Object.entries(WORLD)) {
    const s = open(tab), sm = engineSampler(lib, engine, () => s);
    assert.ok(sm.worlds().includes(id), `${id} is a sampleable world`);
    const seen = new Set();
    for (let seed = 1; seed <= 6; seed++) {
      const x = sm.dice({ worldId: id, seed });
      assert.ok(x?.text, `${id}: a sample for seed ${seed}`);
      assert.equal(x.world, id);
      seen.add(x.text);
      const r = await open(tab).send(x.text);
      assert.ok(!/did not understand|did not catch|cannot talk about that/i.test(r.text), `${id}: "${x.text}" -> ${r.text}`);
    }
    assert.ok(seen.size >= 2 || ['games.guess', 'games.hangman'].includes(id), `${id}: the dice varies (${[...seen].join(' | ')})`);
  }
});
