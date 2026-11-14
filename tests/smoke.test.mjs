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
import { createFacts } from '../src/knowledge/facts.mjs';
import { createKnowledgeSource } from '../src/loaders/knowledge-source.mjs';

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
function picks(w) {
  const byOp = new Map();
  for (const p of w.patterns) { const c = p.canonical?.[0]; if (c && !byOp.has(operationKey(p))) byOp.set(operationKey(p), c); }
  const all = [...byOp.values()];
  return all.length <= 2 ? all : [all[0], all[Math.floor(all.length / 2)]];
}

for (const [mode, e] of Object.entries(engines)) {
  test(`${mode}: two canonical messages per world are understood by their own world on its own tab`, async () => {
    const bad = [];
    let n = 0;
    for (const w of e.set.list().filter((x) => x.patterns.length)) {
      // a world that reads the catalog (the map: every place is a name of k.geo) is understood with the local fixture catalog; the others with none
      const reads = typeof w.ops?.needs === 'function' || w.lexicons.some((l) => l.open);
      e.setKnowledge(reads ? createFacts({ source: createKnowledgeSource(path.join(DEFAULT_ROOT, '../tests/fixtures/catalog')) }) : null);
      for (const c of picks(w)) {
        n++;
        const s = e.createSession({ language: 'en' });
        if (tabOf(w)) s.setWorldState('ui.shell', { activeTab: tabOf(w) });
        const r = await s.send(c, { language: 'en' });
        if (!r.segments.length || r.segments.some((x) => (x.unparsed && x.veto?.kind !== 'no-referent') || (!x.veto && x.match?.worldId !== w.id))) bad.push(`${w.id}: ${c}`);
      }
    }
    e.setKnowledge(null);
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
