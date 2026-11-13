// Every tab declared by a world manifest (spec 07 section 6) opens by its short name ("open draw"), whatever the size of ui.shell's description.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const tabs = [];
for (const d of await readdir(DEFAULT_ROOT)) {
  let src; try { src = await readFile(path.join(DEFAULT_ROOT, d, 'world.sop'), 'utf8'); } catch { continue; }
  const id = /^\s+tab=(\S+)\s*$/m.exec(src)?.[1];
  const title = /^\s+tabTitle="?([^"\n]+)"?\s*$/m.exec(src)?.[1];
  if (id) tabs.push({ id, title: title ?? id });
}

test('the manifests declare the tabs this test knows', () => {
  for (const id of ['draw', 'chess', 'map', 'charts', 'music', 'diagram', 'profile', 'documents']) assert.ok(tabs.some((t) => t.id === id), id);
});

for (const verb of ['open', 'show', 'go to']) {
  test(`"${verb} <tab>" works for every declared tab (id and title)`, async () => {
    const bad = [];
    for (const t of tabs) {
      for (const name of new Set([t.id, t.title.toLowerCase()])) {
        const r = await engine.createSession().send(`${verb} ${name}`);
        if (/did not understand/i.test(r.text)) bad.push(`${verb} ${name}: ${r.text.slice(0, 60)}`);
      }
    }
    assert.deepEqual(bad, []);
  });
}
