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
    assert.ok(!info.worlds.includes('geo.map') && !info.worlds.includes('media.music'));
    assert.ok(!info.tabs.includes('map.mjs') && !info.tabs.includes('music.mjs'));
    await assert.rejects(stat(path.join(out, 'worlds/geo.map/bundle.json')), { code: 'ENOENT' });
    await assert.rejects(stat(path.join(out, 'worlds/media.music/ops.mjs')), { code: 'ENOENT' });
    assert.ok(info.worlds.includes('core') && info.worlds.includes('kids.common'));
    assert.ok(info.files['lib/dialog/index.mjs'] && info.files['lib/loaders/bundle-loader.mjs']);
    const again = await buildWebchat({ outDir: out });
    assert.deepEqual(again.files, info.files, 'idempotent');
    assert.ok(await stat(path.join(out, 'worlds/kids.common/ops.mjs')));

    // load the COPIED library, as the browser does
    const url = (p) => pathToFileURL(path.join(out, p)).href;
    for (const [world, factory, initialize] of [
      ['diagram.sketch', 'createDiagramHost', 'initialDiagramState'],
      ['docs.editor', 'createDocumentHost', 'initialDocumentState'],
      ['data.charts', 'createChartHost', 'initialChartState'],
    ]) {
      const adapter = await import(url(`worlds/${world}/declared-host.mjs`));
      const host = await adapter[factory]({ state: adapter[initialize](), instanceId: 'built:' + world });
      assert.equal(host.observe().complete, true);
      assert.ok(host.bindings().length > 0, 'built native capabilities load with shared dependencies');
    }
    const calendar = await import(url('worlds/time.calendar/declared-host.mjs'));
    const scheduling = await import(url('worlds/time.calendar/scheduling.mjs'));
    const calendarBundle = JSON.parse(await readFile(path.join(out, 'worlds/time.calendar/bundle.json'), 'utf8'));
    const policy = scheduling.createCalendarPolicy({ source: calendarBundle.files['scheduling-policy.sop'] });
    const calendarHost = calendar.createCalendarHost({ instanceId: 'built-calendar', validate: policy.validate });
    assert.equal(calendarHost.observe().complete, true);
    assert.equal(policy.validate({ people: [], rooms: [], meetings: [] }).ok, true);
    const { createBundleLoader } = await import(url('lib/loaders/bundle-loader.mjs'));
    const { createEngine } = await import(url('lib/dialog/index.mjs'));
    // worlds/index.json is the small routing index (LAZY LOADING); every world's files are in its own bundle.json
    const index = JSON.parse(await readFile(path.join(out, 'worlds/index.json'), 'utf8'));
    assert.ok((await stat(path.join(out, 'worlds/index.json'))).size < 100000, 'the index of worlds is small');
    const bundle = { worlds: {} };
    for (const id of Object.keys(index.worlds)) bundle.worlds[id] = JSON.parse(await readFile(path.join(out, index.worlds[id].bundle), 'utf8'));
    for (const w of Object.values(bundle.worlds)) {
      if (w.opsUrl) w.opsUrl = url(path.posix.join('worlds', w.opsUrl.split('/')[1], 'ops.mjs'));
      if (w.fnsUrl) w.fnsUrl = url(path.posix.join('worlds', w.fnsUrl.split('/')[1], 'fns.mjs'));   // matrix is the default reasoner: the functions of the matrix worlds load
    }
    for (const id of ['ui.shell', 'ui.help', 'meta.worlds']) assert.doesNotMatch(bundle.worlds[id].files['kb.sop'], /\b(?:geo\.map|media\.music)\b/);
    assert.equal(Object.values(index.actions).some((id) => ['geo.map', 'media.music'].includes(id)), false);
    assert.equal(index.words.ids.some((id) => ['geo.map', 'media.music'].includes(id)), false);
    const engine = await createEngine({ loader: createBundleLoader(bundle), options: { applicationAreas: index.retiredAreas } });
    const unavailable = await engine.createSession().send('surprise me', { view: 'music' });
    assert.equal(unavailable.trace.reason, 'area');
    assert.equal(unavailable.trace.legacy, false);
    assert.deepEqual(unavailable.effects, []);

    const reply = await engine.createSession().send('hello');
    assert.equal(reply.trace.engine, 'new');
    assert.deepEqual(reply.statuses, ['unsupported']);
    assert.deepEqual(reply.effects, []);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
