// SPDX-License-Identifier: AGPL-3.0-only
// Per-type measurement of std.compose through the host adapter (spec 26): for each document type, 5 compositions (the essay: 5 random topic + 5 with a topic), checking
// shape (the parts the genre gives, in its order, each said part with a sentence), every claim traced to a wire of the knowledge world, repetition (a sentence or a fact twice),
// the interest of the facts said (the library's k.interest), and the sentences the language world had no template for.  node scripts/measure-compose.mjs [--show]
import * as lib from '../src/vendor/sopworld/sopworld.mjs';
import { createComposer, DOC_TYPES, compositionToDocument } from '../src/dialog/textgen.mjs';
import { knowledgeWorld, topicsOf } from '../src/dialog/compose-world.mjs';

const kw = knowledgeWorld(lib), composer = createComposer(lib);
const topics = ['penguin', 'owl', 'dog', 'robin', 'elephant'];
const unq = (v) => String(v).replace(/^"|"$/g, '');
const rows = [], shown = [];

// --sizes (owner request 2026-11-15, spec 26 "Size and long topics"): words written, sections, repetition and traced claims at 500 / 2,000 / 5,000 words on three topics, and
// what is taken from three topics written as paragraphs.   node scripts/measure-compose.mjs --sizes [--text <topic> <words>]
if (process.argv.includes('--sizes')) {
  const { wordCount } = await import('../src/dialog/compose-plan.mjs');
  const grams = (text) => { const t = text.toLowerCase().split(/\s+/), m = new Map(); for (let i = 0; i + 4 <= t.length; i++) { const g = t.slice(i, i + 4).join(' '); m.set(g, (m.get(g) ?? 0) + 1); } return [...m.values()].reduce((a, v) => a + v - 1, 0); };
  const row = (label, words, r) => {
    if (!r.composition) return { label, asked: words, why: r.why };
    const d = compositionToDocument(r.composition), body = d.sentences.map((s) => s.text).join(' ');
    return { label, asked: words, words: wordCount(body), chapters: r.composition.chapters.length, sections: r.composition.chapters.reduce((n, ch) => n + ch.subchapters.length, 0), sentences: d.sentences.length,
      repeatedSentences: d.sentences.length - new Set(d.sentences.map((s) => s.text)).size, repeated4grams: grams(body), traced: d.sentences.filter((s) => s.source && kw.get(s.source)).length };
  };
  const out = [];
  for (const topic of ['penguin', 'France', 'elephant']) for (const words of [500, 2000, 5000]) { const t0 = Date.now(); out.push({ ...row(topic, words, composer.compose({ type: 'essay', topic, words, seed: 7 })), ms: Date.now() - t0 }); }
  console.table(out);
  const LONG = [
    'Penguins live on the ice and in the sea. I want to know what they eat, which birds are like them and how the seals live near them. Also something about climate change.',
    'An essay about France for a school project: its neighbours, its capital and the big cities, the languages people speak, and how it fits in the European Union. Mention the history of the Eiffel tower too.',
    'Elephants of the savanna and the forest: how big they are, what they eat, the sounds they make, and which other animals share their home. My little brother loves them.',
  ];
  const longRows = [];
  for (const text of LONG) {
    const r = composer.compose({ type: 'essay', topic: text, words: 2000, seed: 7 }), c = r.composition;
    longRows.push({ topic: text, subject: c?.read?.topic ?? r.why, subtopics: c?.read?.subtopics, linked: c?.read?.linked, unlinked: c?.read?.unlinked, keys: c?.read?.keys, unused: c?.read?.unused, words: c?.words, sections: c?.chapters.reduce((n, ch) => n + ch.subchapters.length, 0), firstSections: c?.chapters.flatMap((ch) => ch.subchapters.map((s) => s.title).filter(Boolean)).slice(0, 8) });
  }
  console.log(JSON.stringify(longRows, null, 1));
  const at = process.argv.indexOf('--text');
  if (at > 0) console.log(compositionToDocument(composer.compose({ type: 'essay', topic: process.argv[at + 1], words: Number(process.argv[at + 2] ?? 2000), seed: 7 }).composition).text);
  process.exit(0);
}

for (const type of Object.keys(DOC_TYPES)) {
  const runs = [];
  for (let i = 0; i < (type === 'essay' ? 10 : 5); i++) runs.push({ topic: type === 'essay' && i < 5 ? null : topics[i % 5], seed: i + 1 });
  const out = runs.map((r) => ({ r, res: composer.compose({ type, topic: r.topic, words: 200, seed: r.seed }) }));
  const done = out.filter((o) => o.res.composition);
  if (!done.length) { rows.push({ type, available: false, why: out[0].res.why }); continue; }
  const order = kw.ofType('k.genres.part').filter((p) => unq(p.attrs.genre?.[0]).replace(/ /g, '-') === type).sort((x, y) => Number(x.attrs.n[0]) - Number(y.attrs.n[0])).map((p) => unq(p.attrs.name[0]));
  let traced = 0, claims = 0, dup = 0, shapeOk = 0, interest = 0, nfacts = 0, silent = 0, sentences = 0, short = 0, templated = 0;
  for (const { res } of done) {
    const c = res.composition, srcs = [], texts = [];
    let at = 0, inOrder = true;
    for (const ch of c.chapters) { const i = order.indexOf(ch.part, at); if (i < 0) inOrder = false; else at = i; }
    if (inOrder && c.chapters.length && c.chapters.every((ch) => ch.subchapters[0].sentences.length)) shapeOk++;
    for (const ch of c.chapters) for (const s of ch.subchapters[0].sentences) {
      sentences++; texts.push(s.text); if (s.template) templated++;
      if (s.source && s.takes !== 'topic' || s.element) { claims++; if (kw.get(s.source)) traced++; }
      if (s.source && s.takes === 'fact') { srcs.push(s.source); nfacts++; interest += lib.interestOf(kw, kw.get(s.source), { topic: c.topic }).score ?? 0; }
    }
    dup += srcs.length - new Set(srcs).size + texts.length - new Set(texts).size;
    silent += (c.short ?? []).filter((x) => /no template that fits/.test(x)).length;
    if (c.short.length) short++;
  }
  rows.push({ type, available: true, compositions: done.length, of: runs.length, shapeInGenreOrder: shapeOk, sentences, fromATemplate: templated, claims, traced, repeated: dup, saidShort: short, framesWithoutTemplate: silent, meanFactInterest: +(interest / Math.max(1, nfacts)).toFixed(3) });
  if (process.argv.includes('--show')) shown.push(`--- ${type} (${done[0].r.topic ?? 'random'}) ---\n${compositionToDocument(done[0].res.composition).text}`);
}
console.log(JSON.stringify(rows, null, 1));
console.log(shown.join('\n\n'));
console.log(`subjects in the knowledge: ${topicsOf(kw).length}`);
