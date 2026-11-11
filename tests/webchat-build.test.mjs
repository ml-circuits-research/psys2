import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { buildWebchat } from '../scripts/build-webchat.mjs';

test('webchat build produces a bundle the browser loader can run', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'psys2-webchat-'));
  try {
    const info = await buildWebchat({ outDir: out });
    assert.ok(info.worlds.includes('core') && info.worlds.includes('kids.common'));
    assert.ok(info.files['lib/dialog/index.mjs'] && info.files['lib/loaders/bundle-loader.mjs']);
    const again = await buildWebchat({ outDir: out });
    assert.deepEqual(again.files, info.files, 'idempotent');
    assert.ok(await stat(path.join(out, 'worlds/kids.common/ops.mjs')));

    // load the COPIED library, as the browser does
    const url = (p) => pathToFileURL(path.join(out, p)).href;
    const { createBundleLoader } = await import(url('lib/loaders/bundle-loader.mjs'));
    const { createEngine } = await import(url('lib/dialog/index.mjs'));
    const bundle = JSON.parse(await readFile(path.join(out, 'worlds/index.json'), 'utf8'));
    for (const w of Object.values(bundle.worlds)) {
      if (w.opsUrl) w.opsUrl = url(path.posix.join('worlds', w.opsUrl.split('/')[1], 'ops.mjs'));
      if (w.fnsUrl) w.fnsUrl = url(path.posix.join('worlds', w.fnsUrl.split('/')[1], 'fns.mjs'));   // matrix is the default reasoner: the functions of the matrix worlds load
    }
    const engine = await createEngine({ loader: createBundleLoader(bundle) });
    const reply = await engine.createSession().send('hello');
    assert.match(reply.text, /^Hello/);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
