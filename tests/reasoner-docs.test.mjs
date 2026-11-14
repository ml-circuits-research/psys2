// SPDX-License-Identifier: AGPL-3.0-only
// docs.editor and docs.reader on the matrix reasoner (spec 15, "docs.editor and docs.reader on the matrix"): the document and the reading position are wires of the
// world's own library instance, the text engines stay in the operations, targets that do not exist are refused by the rules with the reason, undo and redo go through
// the instance in the world's words. ops mode is unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';

const engineWith = (reasoner) => createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner } });
const matrix = await engineWith('matrix');
const ops = await engineWith('ops');
const session = (e, tab) => { const s = e.createSession({ language: 'en' }); s.setWorldState('ui.shell', { activeTab: tab }); return s; };
const say = async (s, lines) => { const out = []; for (const l of lines) { const r = await s.send(l, {}); out.push({ text: r.text, statuses: r.statuses }); } return out; };

// ---- docs.editor: a schema world on the acts since 2026-11-14 (spec 21 section 12): no matrix, no wires of its own; its tests are tests/editor.test.mjs and the world tests ----

// ---- docs.reader ------------------------------------------------------------------------------------------------------------------------------------------------

const READ = ['who is Hansel?', 'find "witch"', 'how many sentences are there?'];

test('docs.reader: the shelf, the open document and where the reader is are wires of its own instance; the facts of the text stay in the session memory', async () => {
  const s = session(matrix, 'documents');
  await say(s, READ);
  const w = s.isession.rs.of('docs.reader');
  assert.equal(w.ofType('docs.reader.shelf').length, 1);
  const open = w.ofType('docs.reader.open');
  assert.equal(open.length, 1);
  assert.equal(open[0].attrs.sentences[0], '66');
  assert.equal(open[0].attrs.sections[0], '4');
  assert.equal(w.ofType('docs.reader.focus').length, 1);
  assert.equal(w.ofType('docs.reader.search').length, 1);
  assert.equal(w.ofType('docs.reader.sentence').length, 0, 'the sentences are not told to the library (untold=)');
  assert.ok(s.isession.memory.find('docs.reader.sentence').length > 60, 'the session memory still has them, for "why?" and the citations');
  const st = s.isession.state['docs.reader'];
  assert.equal(st.docs.length, 1);
  assert.equal(st.docs[0].sentences.length, 66);
  assert.equal(st.search.query, 'witch');
  assert.equal(s.isession.rs.of('docs.editor').ofType('docs.reader.open').length, 0, 'worlds are isolated');
});

test('docs.reader: a reader nobody changed has no wires and the sample open, as before', async () => {
  const s = session(matrix, 'documents');
  assert.equal(s.isession.rs.of('docs.reader').ofType('docs.reader.shelf').length, 0);
  assert.equal(s.state('docs.reader').docs.length, 1);
});

test('docs.reader: a sentence, a paragraph or a section that does not exist is refused by the rules, with the reason; so is a question with no document open', async () => {
  const s = session(matrix, 'documents');
  const r = await say(s, ['read sentence 99', 'read the ninth section', 'read paragraph 99']);
  assert.equal(r[0].text, 'There is no sentence 99; the document has 66 sentences.');
  assert.equal(r[1].text, 'There is no ninth section; the document has four.');
  assert.match(r[2].text, /^There is no 99th paragraph; the document has (?:\d+|[a-z]+)\.$/);
  assert.deepEqual(r.map((x) => x.statuses[0]), ['missing', 'missing', 'missing']);
  const o = session(ops, 'documents');
  assert.match((await say(o, ['read sentence 99']))[0].text, /has only 66 sentences/, 'ops says it in its own words');
  const c = await say(s, ['close the document', 'who is Hansel?', 'read sentence 3']);
  assert.equal(c[1].text, 'There is no document open. Drop a .md, .txt, .pdf or .docx file on the Documents tab, or say "load the sample".');
  assert.equal(c[2].text, c[1].text);
  assert.equal(c[1].statuses[0], 'missing');
});

test('docs.reader: the rules refuse a state that cannot be (a document that is not on the shelf, a sentence cited that the document does not have, a search at a hit it does not have)', () => {
  const s = session(matrix, 'documents');
  const w = s.isession.rs.of('docs.reader');
  const bad = (text) => { const r = w.check({ wires: text }); return r.ok ? null : r.violations.find((v) => v.why)?.why; };
  const open = '@o docs.reader.open did=d1 n=0 title="T" sentences=10 paras=2 sections=1 json="{}"';
  assert.equal(bad('@s docs.reader.shelf active=d9 open=0 rest="{}"'), 'The document d9 is not on the shelf.');
  assert.equal(bad(`${open}\n@f docs.reader.focus doc=d1 upto=11 cites=1 json="{}"`), 'Sentence 11 is cited, but the document has only 10 sentences.');
  assert.equal(bad(`${open}\n@q docs.reader.search doc=d1 pos=3 hits=2 json="{}"`), 'The search is at hit 3 but there are only 2 hits.');
  assert.equal(bad(`${open}\n@s docs.reader.shelf active=d1 open=1 rest="{}"\n@f docs.reader.focus doc=d1 upto=10 cites=1 json="{}"\n@q docs.reader.search doc=d1 pos=1 hits=2 json="{}"`), null);
});

test('docs.reader: "undo that" goes through the instance and says what it took back in the world\'s words', async () => {
  const s = session(matrix, 'documents');
  const a = (await say(s, ['who is Hansel?', 'find "witch"', 'undo that'])).slice(1);
  assert.equal(a[1].text, 'OK, I cleared the search for "witch".');
  assert.equal(s.isession.state['docs.reader'].search, null);
  const b = await say(s, ['close the document', 'undo that']);
  assert.equal(b[1].text, 'OK, I put "Hansel and Gretel" back on the shelf.');
  assert.equal(s.isession.state['docs.reader'].docs.length, 1);
  assert.equal(s.isession.state['docs.reader'].active, 'doc_hansel_and_gretel');
  const c = await say(s, ['who is Gretel?', 'undo that']);
  assert.match(c[1].text, /^OK, I took that answer back/);
});

test('docs.reader: ops and matrix give the same replies and the same documents for a scripted session (except the listed gains: the reasons and the undo words)', async () => {
  const script = ['who is Hansel?', 'what happened in the story?', 'find "witch"', 'next', 'how many sentences are there?', 'read the second section', 'summarize the story', 'who said "Fatten him up"?', 'list the characters', 'tell me more', 'close the document', 'load the sample'];
  const m = session(matrix, 'documents'), o = session(ops, 'documents');
  assert.deepEqual(await say(m, script), await say(o, script));
  const strip = (st) => JSON.stringify({ ...st, docs: st.docs.map((d) => [d.id, d.sentences.length]) });
  assert.equal(strip(m.isession.state['docs.reader']), strip(o.isession.state['docs.reader']));
});
