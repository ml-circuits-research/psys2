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
    await assert.rejects(stat(path.join(out, 'lib/dialog/reader-compat')), error => error.code === 'ENOENT');
    await assert.rejects(stat(path.join(out, 'lib/dialog/property-selection.mjs')), { code: 'ENOENT' });
    const readerRoute = await readFile(path.join(out, 'lib/dialog/reader-routing.mjs'), 'utf8');
    assert.doesNotMatch(readerRoute, /grammar-reader|readGrammarRequests|compileGrammarOverlay|runGrammarEngine/);
    assert.ok(!info.worlds.includes('geo.map') && !info.worlds.includes('media.music'));
    assert.ok(!info.tabs.includes('map.mjs') && !info.tabs.includes('music.mjs'));
    await assert.rejects(stat(path.join(out, 'worlds/geo.map/bundle.json')), { code: 'ENOENT' });
    await assert.rejects(stat(path.join(out, 'worlds/media.music/ops.mjs')), { code: 'ENOENT' });
    assert.deepEqual([...info.worlds].sort(),['art.draw','core','diagram.sketch','docs.editor','time.calendar','ui.avatar','ui.shell']);
    assert.ok(info.files['lib/dialog/index.mjs'] && info.files['lib/loaders/bundle-loader.mjs']);
    const again = await buildWebchat({ outDir: out });
    assert.deepEqual(again.files, info.files, 'idempotent');
    await assert.rejects(stat(path.join(out,'worlds/kids.common/ops.mjs')),{code:'ENOENT'});
    assert.ok(await stat(path.join(out,'worlds/art.draw/ops.mjs')));
    for(const file of ['ui.avatar/sop-avatar.mjs','ui.avatar/area-sources.mjs','sop-area.mjs','sop-world-host.mjs','catalog-world.mjs','sop-primitives.mjs'])assert.ok(await stat(path.join(out,'worlds',file)),'Avatar SOP area resource '+file);
    for(const file of ['ui/tabs/map.mjs','ui/tabs/music.mjs','vendor/map','vendor/music'])await assert.rejects(stat(path.join(out,file)),{code:'ENOENT'});
    for(const file of Object.keys(info.assets))assert.doesNotMatch(file,/^worlds\/(?:kids\.|calc\.|geo\.|media\.|games\.|talk\/|plan\.)/);

    // load the COPIED library, as the browser does
    const url = (p) => pathToFileURL(path.join(out, p)).href;
    // The built Drawing and Diagram areas (the Diagram interface composes the data.charts operations) load with their shared dependencies.
    for (const [module, factory, initialize] of [
      ['art.draw/sop-drawing.mjs', 'createDrawingArea', 'emptyDrawingState'],
      ['diagram.sketch/sop-diagram.mjs', 'createDiagramArea', 'emptyDiagramState'],
    ]) {
      const adapter = await import(url(`worlds/${module}`));
      const host = await adapter[factory]({ state: adapter[initialize](), instanceId: 'built:' + module });
      assert.equal(host.observe().complete, true);
      assert.ok(host.bindings().length > 0, 'built native capabilities load with shared dependencies');
    }
    // The built Documents area starts from its declaration with the offline catalog subset: one empty document.
    const documents = await import(url('worlds/docs.editor/sop-document.mjs'));
    const documentState = documents.emptyDocumentArea(), documentHost = await documents.createDocumentArea({ state: documentState, instanceId: 'built-documents' });
    assert.equal(documentHost.observe().complete, true);
    assert.ok(documentHost.observe().objects.some((object) => object.sourceType === 'docs.editor.document'));
    assert.equal(documentHost.bindings().length, 27);
    // The built Calendar area starts from its declaration with the offline catalog subset.
    const calendar = await import(url('worlds/time.calendar/sop-calendar.mjs'));
    const calendarState = calendar.emptyCalendarArea(), calendarHost = await calendar.createCalendarArea({ state: calendarState, instanceId: 'built-calendar' });
    assert.equal(calendarHost.observe().complete, true);
    assert.ok(calendarHost.observe().objects.some((object) => object.sourceType === 'time.calendar.calendar'));
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
    assert.deepEqual(new Set(index.always),new Set(Object.keys(index.worlds)),'all seven tiny contracts initialize before the architecture is inspected');
    for(const [id,world]of Object.entries(bundle.worlds)){assert.ok(!world.files['patterns.sop']);assert.ok(!world.files['lexicon.sop']);assert.ok(!world.files['kb.sop']);assert.doesNotMatch(world.files['world.sop'],/imports=world\.kids\./);}
    assert.equal(index.words, undefined, 'no word index of the retired lazy loading by message words');
    assert.equal(Object.keys(index.worlds).some((id) => ['geo.map', 'media.music'].includes(id)), false);
    const engine = await createEngine({ loader: createBundleLoader(bundle), options: { applicationAreas: index.retiredAreas } });
    const unavailable = await engine.createSession().send('surprise me', { view: 'music' });
    assert.equal(unavailable.trace.reason, 'reading', 'unread input remains explicit even in an unsupported area');
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
