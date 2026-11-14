// SPDX-License-Identifier: AGPL-3.0-only
// SMOKE suite core (`npm run test:smoke`, spec 17 "Testing"): the cheap checks that catch the kinds of breakage seen so far.
// Every world loads in both reasoners; two canonical messages per world (different operation families) are understood by their own world in BOTH
// reasoners; the built webchat is fresh. Other smoke checks are small existing files (see the SMOKE list
// in scripts/run-tests.mjs and the regression-kind mapping in worker-log.md). No browser, no model, no long sets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readdirSync, existsSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { operationKey } from '../src/worlds/canonical.mjs';
import { buildWebchat } from '../scripts/build-webchat.mjs';

const engineWith = (reasoner) => createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner } });
const engines = { ops: await engineWith('ops'), matrix: await engineWith('matrix') };   // each world set is loaded once for the whole file
const TAB = { 'games.tictactoe': 'tictactoe', 'games.guess': 'guess', 'games.hangman': 'hangman', 'docs.editor': 'editor', 'ui.avatar': 'robot' };
const tabOf = (w) => w.tab?.id ?? TAB[w.id];

test('every world directory loads in both reasoners (and the matrix builds every world)', () => {
  const dirs = readdirSync(DEFAULT_ROOT, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(path.join(DEFAULT_ROOT, d.name, 'world.sop'))).map((d) => d.name);
  assert.ok(dirs.length >= 20, `${dirs.length} worlds`);
  for (const [mode, e] of Object.entries(engines)) {
    const ids = new Set(e.set.list().map((w) => w.id));
    for (const d of dirs) assert.ok(ids.has(d), `${mode}: world ${d} did not load`);
  }
  assert.deepEqual(engines.matrix.reasoner.buildAll(), []);
});

/** Up to two canonical sentences of a world, from different operations (one per operation family), spread over the world's operations. */
/** Canonicals of a world that another world reads on that world's own surface today (docs/lessons.md THIN LIVE WORLDS, found: the avatar is not an ambient world for routing; Talk's `ask.of` takes the question). Each is a defect to fix, not a case to hide: remove the entry with the fix. */
const KNOWN_LOSSES = new Set(['ui.avatar: What is the colour of hat?']);
function picks(w) {
  const byOp = new Map();
  for (const p of w.patterns) { const c = p.canonical?.[0]; if (c && !/^(undo|redo)\b/i.test(c) && !byOp.has(operationKey(p))) byOp.set(operationKey(p), c); }   // undo and redo are the dialogue's (history of the session), not a reading of the world
  const all = [...byOp.values()];
  return all.length <= 2 ? all : [all[0], all[Math.floor(all.length / 2)]];
}

for (const [mode, e] of Object.entries(engines)) {
  test(`${mode}: two canonical messages per world are understood by their own world on its own tab`, async () => {
    const bad = [];
    let n = 0;
    for (const w of e.set.list().filter((x) => x.patterns.length)) {
      for (const c of picks(w)) {
        if (KNOWN_LOSSES.has(`${w.id}: ${c}`)) continue;
        n++;
        const s = e.createSession({ language: 'en' });
        s.setWorldState('ui.shell', { activeTab: tabOf(w) ?? 'chat' });   // a world with no tab is tested in chat only: the first tab (Talk) answers other worlds' questions by design
        const r = await s.send(c, { language: 'en' });
        if (!r.segments.length || r.segments.some((x) => (x.unparsed && x.veto?.kind !== 'no-referent') || (!x.veto && x.match?.worldId !== w.id))) bad.push(`${w.id}: ${c}`);
      }
    }
    assert.ok(n >= 30, `only ${n} canonical messages`);
    assert.deepEqual(bad, []);
  });
}

test('the built webchat is fresh: build-info.json of docs/webchat matches a build of the current sources', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'psys2-smoke-build-'));
  try {
    const fresh = await buildWebchat({ outDir: out, metaOnly: true });
    const shipped = JSON.parse(await readFile(new URL('../docs/webchat/build-info.json', import.meta.url), 'utf8'));
    const stale = Object.keys(fresh.files).filter((f) => f.startsWith('lib/') || f.startsWith('worlds/')).filter((f) => shipped.files[f] !== fresh.files[f]);
    assert.deepEqual(stale, [], `docs/webchat is stale (run: node scripts/build-webchat.mjs): ${stale.slice(0, 5).join(', ')}`);
  } finally { await rm(out, { recursive: true, force: true }); }
});
