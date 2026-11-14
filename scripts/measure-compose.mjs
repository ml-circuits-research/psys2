// SPDX-License-Identifier: AGPL-3.0-only
// Per-type measurement of std.compose through the host adapter (spec 26): for each document type, 5 compositions (the essay: 5 random topic + 5 with a topic), checking
// shape (no more than asked, short said), every sentence realised, every claim traced to a wire of the knowledge world, repetition (a sentence or a fact twice) and the interest
// score of the chapters. A type the knowledge has no genre for is reported as unavailable (declined with the reason), not measured.  node scripts/measure-compose.mjs [--show]
import * as lib from '../src/vendor/sopworld/sopworld.mjs';
import { createComposer, DOC_TYPES, compositionToDocument } from '../src/dialog/textgen.mjs';
import { knowledgeWorld, topicsOf } from '../src/dialog/compose-world.mjs';

const kw = knowledgeWorld(lib), composer = createComposer(lib);
const topics = ['penguin', 'owl', 'dog', 'robin', 'elephant'];
const rows = [], shown = [];
for (const type of Object.keys(DOC_TYPES)) {
  const runs = [];
  for (let i = 0; i < (type === 'essay' ? 10 : 5); i++) runs.push({ topic: type === 'essay' && i < 5 ? null : topics[i % 5], seed: i + 1 });
  const out = runs.map((r) => ({ r, res: composer.compose({ type, topic: r.topic, chapters: 2, subchapters: 1, words: 60, seed: r.seed }) }));
  const done = out.filter((o) => o.res.composition);
  if (!done.length) { rows.push({ type, available: false, why: out[0].res.why }); continue; }
  let traced = 0, claims = 0, dup = 0, shapeOk = 0, interest = 0, nch = 0, short = 0;
  for (const { res } of done) {
    const c = res.composition, srcs = [], texts = [];
    for (const ch of c.chapters) { interest += ch.interest ?? 0; nch++; for (const sc of ch.subchapters) for (const s of sc.sentences) { claims++; if (kw.get(s.source)) traced++; srcs.push(s.source); texts.push(s.text); } }
    dup += srcs.length - new Set(srcs).size + texts.length - new Set(texts).size;
    if (c.chapters.length <= 2) shapeOk++;
    if (c.short.length) short++;
  }
  rows.push({ type, available: true, compositions: done.length, of: runs.length, shapeOk, saidShort: short, claims, traced, repeated: dup, meanChapterInterest: +(interest / nch).toFixed(3) });
  if (process.argv.includes('--show')) shown.push(`--- ${type} (${done[0].r.topic ?? 'random'}) ---\n${compositionToDocument(done[0].res.composition).text}`);
}
console.log(JSON.stringify(rows, null, 1));
console.log(shown.join('\n\n'));
console.log(`subjects in the knowledge: ${topicsOf(kw).length}`);
