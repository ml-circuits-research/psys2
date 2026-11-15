// SPDX-License-Identifier: AGPL-3.0-only
// sopworld 0.14.0: declared host functions (`core.function`). See spec 15 ("Declared functions"). (The R14.1 split test went with the reader route, deleted 2026-11-15, spec 16 section 7.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } });

test('functions: the matrix worlds register no host function (their fns.mjs entries are actions, declared by core.action), so no function note and none listed', () => {
  const r = engine.reasoner;
  let n = 0;
  for (const w of engine.set.list().filter((x) => x.reasoner === 'matrix')) {
    const b = r.baseOf(w.id);
    assert.deepEqual((b.warnings ?? []).filter((x) => /function/.test(x.kind)), [], `${w.id}: function notes`);
    assert.equal(b.functions().length, 0, `${w.id}: declared functions`);
    n++;
  }
  assert.ok(n >= 8);
});
