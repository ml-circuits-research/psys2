// SPDX-License-Identifier: AGPL-3.0-only
// Summary and composition (specs/26): the adapters, the commands readable through docs.editor (the Documents tab), and the plain decline while the library has no std.summarize / std.compose.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as lib from '../src/vendor/sopworld/sopworld.mjs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { createTranslator } from '../src/translate/index.mjs';
import { knowledgeWorld, topicsOf } from '../src/dialog/compose-world.mjs';
import { createSummarizer, createComposer, composeRequest, docTypeOf, DOC_TYPES, checkComposition, compositionToDocument, installTextGen, TEXTGEN_GLOBAL } from '../src/dialog/textgen.mjs';
import { readLongTopic, relatedTopics } from '../src/dialog/compose-plan.mjs';

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
const docs = () => { const s = engine.createSession({ language: 'en' }); s.setWorldState('ui.shell', { activeTab: 'editor' }); return s; };

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
    assert.match((await s.send('condense the document')).text, /no document open/);
    await s.send('add a paragraph: Volcanoes form where hot rock reaches the surface. Magma rises through cracks. Volcanoes can erupt for years. Some volcanoes are under the sea. Ash can travel around the world.');
    const d = await s.send('condense the document');
    assert.match(d.text, /^In short: .*[Vv]olcano/);
  } finally { delete globalThis[TEXTGEN_GLOBAL]; }
});

test('with the real composer the essay commands write a new document that keeps the per-sentence source; the other types are composed by their published genres', async () => {
  installTextGen(lib, null);
  try {
    const s = docs();
    const r = await s.send('write an essay about penguin with 1 chapters of 1 subchapters, about 40 words');
    assert.match(r.text, /I wrote the essay "All about the penguin"/);
    const w = s.state()['docs.editor'];
    assert.equal(w.title, 'All about the penguin');
    const wires = w.blocks.flatMap((b) => b.from ?? []);
    assert.ok(wires.length >= 1, 'the paragraphs keep the wires of their claims');
    assert.ok(wires.every((x) => /^k\.(animals|commonsense|attributes|parts)\./.test(x)), JSON.stringify(wires));
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

test('arbitration: "write a report about ..." on the Documents tab is the composition (the animal report of the editor went with the cut); without a composer it declines plainly', async () => {
  installTextGen({}, null);
  assert.match((await docs().send('Write a report about sea animals')).text, /cannot write compositions yet/);
  installTextGen(lib, null);
  try { assert.match((await docs().send('Write a report about owl')).text, /^I added a report\./); } finally { delete globalThis[TEXTGEN_GLOBAL]; }   // Documents on the binding (spec 28 section 14): the reply is the view's diff said by reply facts
});

test('Documents replies name what was made (topic, title), say a shortfall against what was said, and "shorter" steps the length; a revision is one undo step (sopworld 0.159 / 0.160)', async () => {
  installTextGen(lib, null);
  try {
    const s = docs();
    const r = await s.send('write a story about a fox');
    assert.match(r.text, /The story is about a fox\./, r.text);   // the topic in the person's words (sopworld 0.161)
    assert.match(r.text, /The story is called “All about the fox”\./, r.text);
    assert.match((await s.send('what is in the document?')).text, /There is one story, “All about the fox”\./);   // a lone thing named by its title (0.161 state.count.named)
    const heads = (st) => st.blocks.filter((b) => b.kind === 'heading' && (b.level ?? 2) <= 2).length;
    const n0 = heads(s.state()['docs.editor']);
    const shorter = await s.send('shorter');
    assert.doesNotMatch(shorter.text, /the request said|Nothing changed|cannot be done/, shorter.text);
    assert.ok(heads(s.state()['docs.editor']) < n0, shorter.text);
    await s.send('undo');
    assert.equal(heads(s.state()['docs.editor']), n0, 'one undo takes the whole revision back');
    const long = await docs().send('write a story of 500 words about frogs');
    assert.match(long.text, /I could only make \d+ words of the 500 you asked for\./, long.text);
    const ro = (await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), translator: createTranslator() })).createSession({ language: 'auto' }); ro.setWorldState('ui.shell', { activeTab: 'editor' });
    const rr = await ro.send('scrie o poveste de 500 de cuvinte despre broaste');
    assert.match(rr.text, /^Am adăugat o poveste\./, rr.text);
    assert.match(rr.text, /Am putut face doar \d+ din cele 500 cerute\./, rr.text);
    assert.doesNotMatch(rr.text, /\b(I|The|story)\b/, 'no English in a Romanian reply');
  } finally { delete globalThis[TEXTGEN_GLOBAL]; }
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
  for (const t of Object.keys(DOC_TYPES)) assert.ok(lib.genreOf(kw, t), `a genre for ${t}`);
  assert.ok(lib.compose(kw, 'penguin', { genre: 'essay' }).parts, 'the library reads the published parts and steps');
  assert.ok(topicsOf(kw).includes('Peru') && topicsOf(kw).includes('penguin'), 'animals and countries are topics');
  const c = createComposer(lib).compose({ type: 'essay', topic: 'peru', chapters: 2, subchapters: 1, words: 60, seed: 1 }).composition;
  assert.equal(c.title, 'All about Peru'); assert.ok(c.chapters.length >= 1);
  assert.ok(c.chapters.flatMap((x) => x.subchapters.flatMap((y) => y.sentences)).every((x) => (/^k\.geo\./.test(x.source) || (x.takes === "topic" && x.source == null)) && !/[^\x20-\x7e]/.test(x.text)));
});

// ---- the size asked and long topics (owner request 2026-11-15, spec 26 "Size and long topics")
test('the size asked is honoured from related topics, never padded: no sentence twice, every claim traced, sections grouped by relation before the closing part', () => {
  const c = createComposer(lib), kw = knowledgeWorld(lib);
  const small = c.compose({ type: 'essay', topic: 'penguin', words: 100, seed: 7 }).composition;
  const big = c.compose({ type: 'essay', topic: 'penguin', words: 2000, seed: 7 }).composition;
  assert.ok(big.words > small.words * 4 && big.words >= 1500 && big.words <= 2300, `${small.words} -> ${big.words}`);
  const all = big.chapters.flatMap((ch) => ch.subchapters.flatMap((s) => s.sentences));
  assert.equal(new Set(all.map((s) => s.text)).size, all.length, 'no sentence twice');
  const related = big.chapters.filter((ch) => ch.part === 'related');
  assert.ok(related.length >= 2 && related.every((ch) => ch.subchapters.every((s) => s.title && s.sentences.length && s.sentences.every((x) => kw.get(x.source)))), 'each related section is titled and every sentence cites a wire');
  assert.equal(big.chapters.at(-1).part, 'conclusion', 'the closing part stays last');
  assert.ok(related[0].subchapters[0].sentences[0].text.startsWith('The penguin eats'), 'a section opens with the fact that links it');
  const huge = c.compose({ type: 'essay', topic: 'penguin', words: 5000, seed: 7 }).composition;
  assert.ok(huge.words < 4000 && huge.asked === 5000, 'the knowledge runs out before 5000 words: the composition is the smaller one');
  assert.ok(!relatedTopics(kw, 'penguin').some((r) => r.name === 'fly' || r.name === 'slide'), 'an act is not a related thing ("cannot fly", "slide: who penguin")');
  const story = c.compose({ type: 'story', topic: 'penguin', words: 2000, seed: 7 }).composition;
  assert.ok(!story.chapters.some((ch) => ch.part === 'related'), 'a story is told from one plan, not widened');
});

test('a long topic: the subject, the subtopics and the fact keys the knowledge knows are taken from it; the phrases nothing came from are listed', () => {
  const kw = knowledgeWorld(lib);
  const r = readLongTopic(kw, 'Penguins live on the ice and in the sea. I want to know what they eat, and how the seals live near them. Also something about climate change.');
  assert.equal(r.topic, 'penguin');
  assert.ok(r.subtopics.includes('seal') && r.keys.includes('eats') && !r.subtopics.includes('know'), JSON.stringify(r));
  assert.deepEqual(r.unused, ['Also something about climate change']);
  const c = createComposer(lib).compose({ type: 'essay', topic: '"An essay about France for a school project: its neighbours, its capital and how it fits in the European Union."', words: 1500, seed: 7 }).composition;
  assert.equal(c.read.topic, 'France');
  assert.ok(c.read.subtopics.includes('European Union') && c.read.unlinked.includes('school'), JSON.stringify(c.read));
  assert.equal(c.chapters.flatMap((ch) => ch.subchapters).filter((s) => /school/i.test(s.title)).length, 0, 'a subtopic nothing links to the topic is not written');
});

test('the Documents tab: a long topic after "about the following:" (quoted by the form) and a size the knowledge cannot reach are said honestly', async () => {
  installTextGen(lib, null);
  const s = docs();
  const r = await s.send('write an essay of 2000 words about the following: "Penguins live on the ice and in the sea. I want to know what they eat, which birds are like them and how the seals live near them. Also something about climate change."');
  assert.match(r.text, /From your topic I used penguin \(the subject\), seal/);
  assert.match(r.text, /I found nothing I know in "Also something about climate change"/);
  assert.ok(s.state('docs.editor').blocks.some((b) => b.kind === 'heading' && b.level === 3), 'related sections are subheadings');
  const big = await s.send('write an essay about France of 5000 words');
  assert.match(big.text, /I could write about [\d,]+ words about France from what I know \(you asked for 5,000\); I did not pad it/);
  const t = await s.send('write an essay about Italy with 3 chapters, about 600 words');
  assert.match(t.text, /I wrote the essay "All about Italy": [\d,]+ words/);
  assert.doesNotMatch(t.text, /I could write about/, 'the size the form sends without subchapters is read and reached');
});
