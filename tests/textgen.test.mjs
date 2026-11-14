// SPDX-License-Identifier: AGPL-3.0-only
// Summary and composition (specs/26): the adapters, the commands readable through docs.reader, and the plain decline while the library has no std.summarize / std.compose.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as lib from '../src/vendor/sopworld/sopworld.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createSummarizer, createComposer, composeRequest, docTypeOf, DOC_TYPES, checkComposition, compositionToDocument, installTextGen, TEXTGEN_GLOBAL } from '../src/dialog/textgen.mjs';

test('without the library the adapters are unavailable and return nothing (no local generator)', () => {
  const s = createSummarizer({}, {}), c = createComposer({}, {});
  assert.equal(s.available, false); assert.equal(c.available, false);
  assert.equal(s.turns({ turns: [{ n: 1 }] }), null); assert.equal(s.text({ text: 'x' }), null); assert.equal(c.compose({ topic: 'volcanoes' }), null);
});

test('the vendored sopworld has std.summarize and a first std.compose (0.65; its interface differs from spec 26 until step B)', () => {
  assert.equal(typeof lib.summarizeLog, 'function'); assert.equal(typeof lib.summarizeText, 'function'); assert.equal(typeof lib.compose, 'function');
});

const fakeCompose = (w, req) => ({ type: req.type, procedure: `k.procedures.${req.type}`, title: `On ${req.topic ?? 'chance'}`, topic: req.topic, chapters: Array.from({ length: req.chapters }, (_, i) => ({ title: `Chapter ${i + 1}`,
  subchapters: Array.from({ length: req.subchapters }, (_, j) => ({ title: `Part ${i + 1}.${j + 1}`, sentences: [{ text: `Fact ${i}-${j} holds.`, source: `@w${i}${j}` }] })) })) });

test('composeRequest: empty or "anything" means random, counts are clamped; checkComposition demands exact shape and a source per sentence', { skip: 'step B: the composer is switched to the real std.compose 0.65 interface' }, () => {
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

test('while the adapter has no composer the commands decline plainly', async () => {
  installTextGen({}, null);
  const s = docs();
  for (const text of ['write an essay about volcanoes with 3 chapters of 2 subchapters, about 600 words', 'write a composition about anything', 'write an essay about volcanoes']) {
    const r = await s.send(text); assert.match(r.text, /cannot write compositions yet/, text);
  }
});

test('std.summarize (real library): pasted text and the open document are summarised by the extractive summariser; a document answer cites its sentences', async () => {
  installTextGen(lib, null);
  try {
    const s = docs();
    const t = await s.send('summarize the following: Volcanoes form where hot rock reaches the surface. Magma rises through cracks. Volcanoes can erupt for years. Some volcanoes are under the sea. Ash can travel around the world.');
    assert.match(t.text, /^In short: .*Volcanoes/);
    const d = await s.send('condense the document');
    assert.match(d.text, /^In short: /); assert.match(d.text, /\(sentences? \d/);
  } finally { delete globalThis[TEXTGEN_GLOBAL]; }
});

test('with the generators present the roles arrive and the new document keeps the per-sentence source', { skip: 'step B: switched to the real std.compose' }, async () => {
  const calls = [];
  const fake = { compose: (w, r) => { calls.push(r); return fakeCompose(w, r); }, summarizeLog: () => [], summarizeText: (t) => ({ sentences: [{ text: 'Short.', score: 1, at: 0 }], picked: ['Short.'] }) };
  installTextGen(fake, null);
  try {
    const s = docs();
    const r = await s.send('write an essay about volcanoes with 3 chapters of 2 subchapters, about 600 words');
    assert.match(r.text, /I wrote the essay "On volcanoes"/);
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

test('document types: words map to types, defaults per type, a result without a knowledge procedure or of another type is refused', () => {
  assert.equal(docTypeOf('scientific article'), 'scientific-article'); assert.equal(docTypeOf('slideshow'), 'presentation'); assert.equal(docTypeOf('composition'), 'essay'); assert.equal(docTypeOf('tale'), 'story');
  assert.deepEqual(Object.keys(DOC_TYPES), ['essay', 'scientific-article', 'presentation', 'story', 'report']);
  const p = composeRequest({ type: 'presentation', topic: 'the moon', chapters: 5 });
  assert.deepEqual([p.type, p.chapters, p.subchapters], ['presentation', 5, 0]);
  assert.equal(composeRequest({ type: 'story' }).random, true);
  assert.ok(checkComposition(fakeCompose(null, p), p).ok);
  assert.ok(/no procedure/.test(checkComposition({ ...fakeCompose(null, p), procedure: undefined }, p).problems.join()));
  assert.ok(/type/.test(checkComposition({ ...fakeCompose(null, p), type: 'essay' }, p).problems.join()));
});

test('type commands read into docr.compose with the type role', { skip: 'step B: switched to the real std.compose' }, async () => {
  const calls = [];
  installTextGen({ compose: (w, r) => { calls.push(r); return fakeCompose(w, r); } }, null);
  try {
    const s = docs();
    for (const [text, type, topic, chapters] of [['write a short story', 'story', null, 3], ['make a presentation about the moon with 5 sections', 'presentation', 'the moon', 5], ['write a scientific article about bees, 3 chapters', 'scientific-article', 'bees', 3]]) {
      const n0 = calls.length; const r = await s.send(text);
      assert.match(r.text, /I wrote the/, text);
      assert.deepEqual([calls[n0].type, calls[n0].topic, calls[n0].chapters], [type, topic, chapters], text);
    }
  } finally { delete globalThis[TEXTGEN_GLOBAL]; }
});

test('arbitration: the open editor tab owns "write a report ..."; the reader yields without a composer and stays out of another tab with one', async () => {
  const ed = () => { const s = engine.createSession({ language: 'en' }); s.setWorldState('ui.shell', { activeTab: 'editor' }); return s; };
  delete globalThis[TEXTGEN_GLOBAL];
  assert.doesNotMatch((await ed().send('Write a report about sea animals')).text, /cannot write compositions/);
  installTextGen({ compose: fakeCompose }, null);
  try { assert.doesNotMatch((await ed().send('Write a report about sea animals')).text, /I wrote the report/); } finally { delete globalThis[TEXTGEN_GLOBAL]; }
});

// ---- the measurement (reviewer 14:45 item 3, summaries): owner-log b and c replayed; the paragraph names every world used and every taught fact in at most 3 sentences
import { join } from 'node:path';
import { replay } from '../scripts/eval-owner-log.mjs';
import { turnRecord, summarize } from '../src/dialog/conversation.mjs';
for (const file of ['owner-log-2026-11-13b.jsonl', 'owner-log-2026-11-13c.jsonl']) {
  test(`Talk paragraph (std.summarizeLog) after ${file}: names every world and every taught fact, at most 3 sentences`, async () => {
    const turns = [], truth = new Set(); let states = {};
    await replay({ log: join(import.meta.dirname, '..', 'training/eval', file), onReply: (rec, reply, sess) => {
      turns.push(turnRecord(rec.i + 1, rec.text, reply, { tab: rec.tab }));
      for (const sg of reply.segments) if (!sg.unparsed && sg.routing?.winner?.worldId) truth.add(sg.routing.winner.worldId);
      states = sess.state();
    } });
    const sum = summarize({ turns, states }), taught = sum.taughtClear;
    const p = createSummarizer(lib, null).turns({ turns, taught, maxSentences: 3 });
    assert.ok(p, 'a paragraph');
    assert.ok(p.sentences.length <= 3 && p.sentences.length >= 1);
    for (const w of truth) assert.ok(p.text.includes(w), `world ${w} is not named: ${p.text}`);
    for (const f of taught) assert.ok(p.text.includes(f), `taught fact "${f}" is not named`);
    // nothing the world did not understand reaches the paragraph: every word is ASCII English letters, numbers and punctuation, and no kind comes from the user's phrase
    assert.ok(!/[^\x20-\x7e]/.test(p.text));
    for (const t of turns) for (const a of t.acts) assert.ok(a.kind === null || /^[a-z]+$/.test(a.kind));
    console.log(`# ${file}: ${p.text}`);
  });
}
