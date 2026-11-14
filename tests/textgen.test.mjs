// SPDX-License-Identifier: AGPL-3.0-only
// Summary and composition (specs/26): the adapters, the commands readable through docs.reader, and the plain decline while the library has no std.summarize / std.compose.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as lib from '../src/vendor/sopworld/sopworld.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { knowledgeWorld, genreOf, topicsOf } from '../src/dialog/compose-world.mjs';
import { createSummarizer, createComposer, composeRequest, docTypeOf, DOC_TYPES, checkComposition, compositionToDocument, installTextGen, TEXTGEN_GLOBAL } from '../src/dialog/textgen.mjs';

test('without the library the adapters are unavailable and return nothing (no local generator)', () => {
  const s = createSummarizer({}, {}), c = createComposer({}, {});
  assert.equal(s.available, false); assert.equal(c.available, false);
  assert.equal(s.turns({ turns: [{ n: 1 }] }), null); assert.equal(s.text({ text: 'x' }), null); assert.ok(c.compose({ topic: 'volcanoes' }).why && !c.compose({ topic: 'volcanoes' }).composition);
});

test('the vendored sopworld has std.summarize and a first std.compose (0.71: compose by a published genre returns parts and moves)', () => {
  assert.equal(typeof lib.summarizeLog, 'function'); assert.equal(typeof lib.summarizeText, 'function'); assert.equal(typeof lib.compose, 'function');
});

test('composeRequest: empty or "anything" means random, counts are clamped; document types map from words and default per type', () => {
  assert.equal(composeRequest({ topic: '' }).random, true); assert.equal(composeRequest({ topic: 'anything' }).topic, null);
  assert.equal(composeRequest({ topic: 'volcanoes', chapters: 99, subchapters: -1 }).chapters, 12);
  assert.equal(docTypeOf('scientific article'), 'scientific-article'); assert.equal(docTypeOf('slideshow'), 'presentation'); assert.equal(docTypeOf('composition'), 'essay'); assert.equal(docTypeOf('tale'), 'story');
  assert.deepEqual(Object.keys(DOC_TYPES), ['essay', 'scientific-article', 'presentation', 'story', 'report']);
  const p = composeRequest({ type: 'presentation', topic: 'the moon', chapters: 5 });
  assert.deepEqual([p.type, p.chapters, p.subchapters], ['presentation', 5, 0]);
  assert.equal(composeRequest({ type: 'story' }).random, true);
});

test('checkComposition over the library frames (parts with moves): a claim cites a wire, no fact twice, no placeholder, something said', () => {
  const part = (...moves) => ({ part: 'p', moves });
  const claim = (cites, text = 'A sentence.') => ({ move: 'state claim', takes: 'fact', cites, text });
  assert.ok(checkComposition({ parts: [part(claim('a'), claim('b'))] }).ok);
  assert.ok(checkComposition({ parts: [part({ move: 'introduce topic', takes: 'topic', text: 'Today we talk about it.' }, claim('a'))] }).ok, 'a sentence about the topic is no claim, and needs no wire');
  assert.ok(/no claim/.test(checkComposition({ parts: [part({ move: 'introduce topic', takes: 'topic', text: 'Today we talk about it.' })] }).problems.join()), 'a text that claims nothing says what it is about and no more: declined');
  assert.ok(/uncited/.test(checkComposition({ parts: [part(claim(null))] }).problems[0]));
  assert.ok(/twice/.test(checkComposition({ parts: [part(claim('a'), claim('a'))] }).problems.join()));
  assert.ok(/placeholder/.test(checkComposition({ parts: [part(claim('a', 'x {y}'))] }).problems.join()));
  assert.ok(/nothing said/.test(checkComposition({ parts: [part({ move: 'x', takes: 'fact' })] }).problems.join()));
});

test('the real std.compose over the bundled catalog: a cited, realised essay about an animal; an unknown topic and a type without a genre are declined with the reason', () => {
  const c = createComposer(lib);
  assert.ok(c.available);
  const r = c.compose({ type: 'essay', topic: 'penguin', chapters: 1, subchapters: 1, words: 40, seed: 3 });
  const comp = r.composition;
  assert.ok(comp, r.why);
  const s = comp.chapters[0].subchapters[0].sentences;
  assert.ok(s.length >= 1 && s.every((x) => x.text.includes('penguin') && x.source));
  assert.equal(new Set(s.map((x) => x.source)).size, s.length);
  assert.match(c.compose({ type: 'essay', topic: 'volcanoes' }).why, /know nothing about volcanoes/);
  for (const type of ['presentation', 'report', 'scientific-article']) { const x = c.compose({ type, topic: 'penguin', words: 100, seed: 2 }); assert.ok(x.composition?.chapters.length, `${type}: ${x.why}`); assert.equal(x.composition.genre.replace(/ /g, '-'), type); }
  const random = c.compose({ type: 'essay', chapters: 1, subchapters: 1, words: 40, seed: 11 });
  assert.ok(random.composition, random.why); assert.ok(random.composition.topic);
});

test('a type is composed by the book when the knowledge holds its genre (k.genres.genre), passed to std.compose', () => {
  const w = new lib.World(); w.tell('@g1 k.genres.genre name=presentation move=introduce move=fact move=conclude');
  w.tell('@a k.animals.animal name=owl class=bird can=fly  @b k.animals.psys2 name=owl eats=mice  @c k.animals.extra name=owl sound=hoot');
  const seen = [];
  const spy = { ...lib, World: lib.World, compose: (wd, t, o) => { seen.push(o.genre); return lib.compose(wd, t, o); } };
  const r = createComposer(spy, w).compose({ type: 'presentation', topic: 'owl', chapters: 1, subchapters: 1, words: 30 });
  assert.deepEqual(seen, ['presentation']);
  assert.ok(r.composition || r.why, 'answered');
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

test('with the real composer the essay commands write a new document that keeps the per-sentence source; the other types are composed by their published genres', async () => {
  installTextGen(lib, null);
  try {
    const s = docs();
    const r = await s.send('write an essay about penguin with 1 chapters of 1 subchapters, about 40 words');
    assert.match(r.text, /I wrote the essay "All about the penguin"/);
    const w = s.state()['docs.reader'];
    const d = w.docs.find((x) => x.id === w.active);
    assert.equal(d.origin, 'composed'); assert.ok(Object.keys(d.provenance).length >= 1);
    assert.ok(Object.values(d.provenance).filter(Boolean).every((x) => /^k\.(animals|commonsense|attributes|parts)\./.test(x)), JSON.stringify(d.provenance));
    const a = await s.send('write a composition about anything');
    assert.match(a.text, /I wrote the essay "All about /);
    for (const [text, type] of [['make a presentation about penguin with 5 sections', 'presentation'], ['write a report about owl', 'report']]) {
      const x = await s.send(text);
      assert.match(x.text, new RegExp(`I wrote the ${type}`), text);
    }
    const v = await s.send('write an essay about volcanoes');
    assert.match(v.text, /know nothing about volcanoes/);
  } finally { delete globalThis[TEXTGEN_GLOBAL]; }
});

test('arbitration: the open editor tab owns "write a report ..."; the reader yields without a composer and stays out of another tab with one', async () => {
  const ed = () => { const s = engine.createSession({ language: 'en' }); s.setWorldState('ui.shell', { activeTab: 'editor' }); return s; };
  delete globalThis[TEXTGEN_GLOBAL];
  assert.doesNotMatch((await ed().send('Write a report about sea animals')).text, /cannot write compositions/);
  installTextGen(lib, null);
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

test('the published k.genres is in the knowledge world and the five types map to its genres, and the library applies them (0.71)', () => {
  const kw = knowledgeWorld(lib);
  for (const t of Object.keys(DOC_TYPES)) assert.ok(genreOf(kw, t), `a genre for ${t}`);
  assert.ok(lib.compose(kw, 'penguin', { genre: 'essay' }).parts, 'the library reads the published parts and steps');
  assert.ok(topicsOf(kw).includes('Peru') && topicsOf(kw).includes('penguin'), 'animals and countries are topics');
  const c = createComposer(lib).compose({ type: 'essay', topic: 'peru', chapters: 2, subchapters: 1, words: 60, seed: 1 }).composition;
  assert.equal(c.title, 'All about Peru'); assert.ok(c.chapters.length >= 1);
  assert.ok(c.chapters.flatMap((x) => x.subchapters.flatMap((y) => y.sentences)).every((x) => /^k\.geo\./.test(x.source) && !/[^\x20-\x7e]/.test(x.text)));
});
