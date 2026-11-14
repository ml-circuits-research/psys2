// SPDX-License-Identifier: AGPL-3.0-only
// Summary and composition (specs/26): the adapters, the commands readable through docs.reader, and the plain decline while the library has no std.summarize / std.compose.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as lib from '../src/vendor/sopworld/sopworld.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createSummarizer, createComposer, composeRequest, checkComposition, compositionToDocument, installTextGen, TEXTGEN_GLOBAL } from '../src/dialog/textgen.mjs';

test('without the library the adapters are unavailable and return nothing (no local generator)', () => {
  const s = createSummarizer({}, {}), c = createComposer({}, {});
  assert.equal(s.available, false); assert.equal(c.available, false);
  assert.equal(s.turns({ turns: [{ n: 1 }] }), null); assert.equal(s.text({ text: 'x' }), null); assert.equal(c.compose({ topic: 'volcanoes' }), null);
});

test('the vendored sopworld does not export the generators yet (update spec 26 when it does)', () => {
  assert.equal(typeof lib.summarize, 'undefined'); assert.equal(typeof lib.compose, 'undefined');
});

const fakeCompose = (w, req) => ({ title: `On ${req.topic ?? 'chance'}`, topic: req.topic, chapters: Array.from({ length: req.chapters }, (_, i) => ({ title: `Chapter ${i + 1}`,
  subchapters: Array.from({ length: req.subchapters }, (_, j) => ({ title: `Part ${i + 1}.${j + 1}`, sentences: [{ text: `Fact ${i}-${j} holds.`, source: `@w${i}${j}` }] })) })) });

test('composeRequest: empty or "anything" means random, counts are clamped; checkComposition demands exact shape and a source per sentence', () => {
  assert.equal(composeRequest({ topic: '' }).random, true); assert.equal(composeRequest({ topic: 'anything' }).topic, null);
  assert.equal(composeRequest({ topic: 'volcanoes', chapters: 99, subchapters: -1 }).chapters, 12);
  const req = composeRequest({ topic: 'volcanoes', chapters: 3, subchapters: 2 });
  assert.ok(checkComposition(fakeCompose(null, req), req).ok);
  assert.ok(!checkComposition({ ...fakeCompose(null, req), chapters: fakeCompose(null, req).chapters.slice(1) }, req).ok);
  const bad = fakeCompose(null, req); bad.chapters[0].subchapters[0].sentences[0].source = null;
  assert.ok(/unsourced/.test(checkComposition(bad, req).problems[0]));
  assert.equal(createComposer({ compose: (w, r) => ({ ...fakeCompose(w, r), chapters: [] }) }, {}).compose({ topic: 'x' }), null);
  const doc = compositionToDocument(createComposer({ compose: fakeCompose }, {}).compose({ topic: 'volcanoes' }));
  assert.match(doc.text, /^# On volcanoes/); assert.equal(doc.sentences.length, 6);
});

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const docs = () => { const s = engine.createSession({ language: 'en' }); s.setWorldState('ui.shell', { activeTab: 'documents' }); return s; };

test('while the library lacks the generators the commands decline plainly', async () => {
  delete globalThis[TEXTGEN_GLOBAL];
  const s = docs();
  for (const text of ['write an essay about volcanoes with 3 chapters of 2 subchapters, about 600 words', 'write a composition about anything', 'write an essay about volcanoes']) {
    const r = await s.send(text); assert.match(r.text, /cannot write compositions yet/, text);
  }
  const r = await s.send('summarize the following: Volcanoes form where hot rock reaches the surface. They can erupt for years.');
  assert.match(r.text, /cannot write summaries yet/);
});

test('with the generators present the roles arrive and the new document keeps the per-sentence source', async () => {
  const calls = [];
  const fake = { compose: (w, r) => { calls.push(r); return fakeCompose(w, r); }, summarize: () => ({ text: 'Short.', sentences: [{ text: 'Short.', source: '@src.1' }] }) };
  installTextGen(fake, null);
  try {
    const s = docs();
    const r = await s.send('write an essay about volcanoes with 3 chapters of 2 subchapters, about 600 words');
    assert.match(r.text, /I wrote "On volcanoes"/);
    assert.deepEqual([calls[0].topic, calls[0].chapters, calls[0].subchapters, calls[0].words], ['volcanoes', 3, 2, 600]);
    const w = s.state()['docs.reader'];
    const d = w.docs.find((x) => x.id === w.active);
    assert.equal(d.origin, 'composed'); assert.ok(Object.keys(d.provenance).length >= 6);
    const n0 = calls.length; await s.send('write a composition about anything');
    assert.equal(calls[n0].topic, null); assert.equal(calls[n0].random, true);
    const t = await s.send('summarize the following: Volcanoes form where hot rock reaches the surface. They can erupt for years.');
    assert.match(t.text, /In short: Short\./);
  } finally { delete globalThis[TEXTGEN_GLOBAL]; }
});
