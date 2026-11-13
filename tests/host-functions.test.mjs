// SPDX-License-Identifier: AGPL-3.0-only
// sopworld 0.14.0: declared host functions (`core.function`) and R14.1 (an unreadable split frame stays as an unresolved part). See spec 15 ("Declared functions") and spec 16 section 7.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { readerWorlds, readIn } from '../src/dialog/reader-route.mjs';

globalThis.PSYS2_READER = 'choose';
const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'matrix' } });
delete globalThis.PSYS2_READER;

test('functions: the matrix worlds register no host function (their fns.mjs entries are actions, declared by core.action), so no function note and none listed', () => {
  const r = engine.reasoner;
  let n = 0;
  for (const w of engine.set.list().filter((x) => x.reasoner === 'matrix')) {
    const b = r.baseOf(w.id);
    assert.deepEqual((b.warnings ?? []).filter((x) => /function/.test(x.kind)), [], `${w.id}: function notes`);
    assert.equal(b.functions().length, 0, `${w.id}: declared functions`);
    n++;
  }
  assert.ok(n >= 16);
});

test('R14.1: a split with a frame the library cannot read is no reading; the host does not count parts against frames', () => {
  const src = readFileSync(new URL('../src/dialog/reader-route.mjs', import.meta.url), 'utf8');
  assert.ok(!/parts\.length === splits/.test(src), 'no frames-vs-parts counting');
  const s = engine.createSession({ language: 'en' });
  const lib = s.isession.rs.reasoner.lib;
  let checked = 0;
  for (const rw of readerWorlds(lib, engine.set).values()) {
    for (const t of ['mark Paris then flibber zorp', 'what is the capital of Japan then flibber zorp']) {
      let r; try { r = readIn(lib, rw, t); } catch { continue; }
      if (!r) continue;
      assert.ok(r.candidates.every((c) => !c.parts || c.parts.every((p) => !p.unread)), 'no kept split candidate has an unread part');
      checked++;
    }
  }
  assert.ok(checked > 0);
});
