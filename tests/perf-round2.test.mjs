// PERF round 2: sliced precompile, early-load block of index.html.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { vocabularyOf } from '../src/formalizer/rules/index.mjs';
import { buildWebchat } from '../scripts/build-webchat.mjs';

test('engine.precompile yields between slices and leaves the same vocabulary and readings as lazy compilation', async () => {
  const lazy = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  const sliced = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
  let yields = 0;
  const n = await sliced.precompile({ budgetMs: 0, yieldFn: async () => { yields++; } });
  assert.ok(n > 1000, 'compiled the patterns of every world');
  assert.ok(yields > 100, `yielded between slices (${yields})`);
  const a = vocabularyOf(lazy.set), b = vocabularyOf(sliced.set);
  assert.deepEqual([...a].sort(), [...b].sort());
  assert.deepEqual([...a.freq].sort(), [...b.freq].sort());
  for (const m of ['what is 3 plus 4', 'spider legs']) {
    const x = await lazy.createSession({ language: 'en' }).send(m), y = await sliced.createSession({ language: 'en' }).send(m);
    assert.equal(x.text, y.text);
  }
});

test('the webchat build writes a modulepreload block into index.html, idempotently', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'psys2-early-'));
  try {
    await mkdir(path.join(out, 'ui/tabs'), { recursive: true });
    await cp(path.join(DEFAULT_ROOT, '..', 'docs/webchat/index.html'), path.join(out, 'index.html'));
    await writeFile(path.join(out, 'app.mjs'), "import './ui/util.mjs';\n");
    await writeFile(path.join(out, 'ui/util.mjs'), 'export const h = 1;\n');
    await buildWebchat({ outDir: out });
    const first = await readFile(path.join(out, 'index.html'), 'utf8');
    assert.match(first, /<link rel="modulepreload" href="app\.mjs">/);
    assert.match(first, /<link rel="modulepreload" href="lib\/dialog\/index\.mjs">/);
    assert.match(first, /<link rel="modulepreload" href="worlds\/kids\.arith\/ops\.mjs">/);
    assert.match(first, /window\.__psys2Early = /);
    await buildWebchat({ outDir: out });
    assert.equal(await readFile(path.join(out, 'index.html'), 'utf8'), first, 'a second build changes nothing');
    assert.equal(first.split('early-load:begin').length, 2, 'one block only');
  } finally { await rm(out, { recursive: true, force: true }); }
});
