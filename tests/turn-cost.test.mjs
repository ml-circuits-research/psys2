// SPDX-License-Identifier: AGPL-3.0-only
// Class G (reviewer 2026-11-15 10:00): repeated work of a turn is cut, never the reading. The dry readings of one turn's pre-turn state are read once (spec 05 "The choice").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });

test('a turn reads one English text once on its pre-turn state', async () => {
  const s = engine.createSession({ language: 'en' });
  s._preDry = new Map();
  const a = s._dryReading('draw a house'), b = s._dryReading('draw a house');
  assert.equal(a, b);
  assert.equal(s._preDry.size, 1);
  s._preDry = null;
  assert.notEqual(s._dryReading('draw a house'), a, 'outside a turn nothing is kept');
});
