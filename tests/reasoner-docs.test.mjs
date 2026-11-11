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

// ---- docs.editor ------------------------------------------------------------------------------------------------------------------------------------------------

const EDIT = ['Add a heading Plans', 'Add a paragraph First one here.', 'Add a paragraph Second one here.', 'Add a list with milk, eggs and bread'];

test('docs.editor: both worlds opt in, the matrices load without problems', () => {
  assert.equal(matrix.set.get('docs.editor').reasoner, 'matrix');
  assert.equal(matrix.set.get('docs.reader').reasoner, 'matrix');
  assert.deepEqual(matrix.reasoner.buildAll(), []);
  assert.equal(ops.createSession({ language: 'en' }).isession.rs, null, 'ops mode has no instance');
});

test('docs.editor: the document is wires of its own instance (a doc wire, a wire for each block), the state is derived from them, the counts are derived by rules', async () => {
  const s = session(matrix, 'editor');
  await say(s, EDIT);
  const w = s.isession.rs.of('docs.editor');
  const blocks = w.ofType('docs.editor.block');
  assert.equal(blocks.length, 4);
  assert.deepEqual(blocks.map((b) => b.attrs.kind[0]).sort(), ['heading', 'list', 'paragraph', 'paragraph']);
  assert.equal(w.ofType('docs.editor.doc').length, 1);
  const have = Object.fromEntries(w.ofType('docs.editor.have').map((h) => [h.attrs.kind[0], h.attrs.count[0]]));
  assert.equal(have.paragraph, '2');
  assert.equal(have.heading, '1');
  const st = s.isession.state['docs.editor'];
  assert.deepEqual(st.blocks.map((b) => b.kind), ['heading', 'paragraph', 'paragraph', 'list']);
  assert.equal(st.blocks[2].text, 'Second one here.');
  assert.equal(st.history.length, 4, 'the tab counts the undo steps; the steps are the library\'s');
  assert.ok(st.doc && st.stats, 'the tab still gets the TipTap JSON and the statistics');
  assert.equal(s.isession.rs.of('kids.shop').ofType('docs.editor.block').length, 0, 'worlds are isolated');
});

test('docs.editor: a document nobody wrote in has no wires and the initial state', async () => {
  const s = session(matrix, 'editor');
  await say(s, ['How many paragraphs are there?']);
  assert.equal(s.isession.rs.of('docs.editor').ofType('docs.editor.block').length, 0);
});

test('docs.editor: a target that does not exist is refused by the rules, with the reason; ops says it in its own words', async () => {
  const m = session(matrix, 'editor'), o = session(ops, 'editor');
  await say(m, EDIT); await say(o, EDIT);
  const rm = await say(m, ['read the third paragraph', 'delete the fifth paragraph', 'select the second list', 'go to the third heading']);
  assert.equal(rm[0].text, 'There is no third paragraph; the document has two.');
  assert.equal(rm[1].text, 'There is no fifth paragraph; the document has two.');
  assert.equal(rm[2].text, 'There is no second list; the document has one.');
  assert.equal(rm[3].text, 'There is no third heading; the document has one.');
  assert.deepEqual(rm.map((x) => x.statuses[0]), ['missing', 'missing', 'missing', 'missing']);
  assert.equal(m.isession.state['docs.editor'].blocks.length, 4, 'nothing changed');
  const ro = await say(o, ['read the third paragraph']);
  assert.match(ro[0].text, /only 2 paragraphs/);
  assert.equal(ro[0].statuses[0], 'missing');
  const e = session(matrix, 'editor');
  assert.equal((await say(e, ['delete the first quote']))[0].text, 'There is no quote in the document.');
});

test('docs.editor: a section that is already deleted is refused with the reason', async () => {
  const s = session(matrix, 'editor');
  await say(s, ['Add a heading Plans', 'Add a paragraph Some text about plans.', 'Add a heading Notes', 'Add a paragraph Some notes.']);
  const r = await say(s, ['delete chapter 2', 'delete chapter 2', 'delete chapter 7']);
  assert.match(r[0].text, /deleted/);
  assert.equal(s.isession.state['docs.editor'].blocks.length, 2);
  assert.equal(r[1].text, 'That section is already deleted.');
  assert.equal(r[2].text, 'There is no seventh section; the document has one.');
  assert.equal(r[1].statuses[0], 'missing');
  assert.equal(s.isession.rs.of('docs.editor').ofType('docs.editor.gone').length, 2, 'the deleted heading and its paragraph are remembered');
});

test('docs.editor: the rules refuse a document that cannot be (a heading level, two blocks in one place, a cursor outside, a selection of nothing, a ragged table)', () => {
  const s = session(matrix, 'editor');
  const w = s.isession.rs.of('docs.editor');
  const bad = (text) => { const r = w.check({ wires: text }); return r.ok ? null : r.violations.find((v) => v.why)?.why; };
  assert.equal(bad('@x docs.editor.block bid=b1 n=0 kind=heading level=7 json="{}"'), 'A heading has a level from 1 to 3, not 7.');
  assert.equal(bad('@x docs.editor.block bid=b1 n=0 kind=paragraph json="{}"\n@y docs.editor.block bid=b2 n=0 kind=paragraph json="{}"'), 'Two blocks cannot be in the same place (0).');
  assert.equal(bad('@d docs.editor.doc title="T" cursor=3 count=2 rest="{}"'), 'The cursor is at block 3 but the document has only 2 blocks.');
  assert.match(bad('@x docs.editor.sel type=blocks block=b9 json="{}"'), /selection is on a block that is not in the document \(b9\)/);
  assert.match(bad('@x docs.editor.block bid=b1 n=0 kind=table cols=3 minc=2 json="{}"'), /rows of a table must all have the same length/);
  assert.equal(bad('@x docs.editor.block bid=b1 n=0 kind=heading level=2 json="{}"'), null);
});

test('docs.editor: undo goes through the instance and says what it did; undo twice counts edits, a selection is not a step; redo puts it back', async () => {
  const s = session(matrix, 'editor');
  await say(s, EDIT);
  const r = await say(s, ['delete the last list', 'undo']);
  assert.equal(r[1].text, 'OK, I put back the list you deleted.');
  assert.equal(s.isession.state['docs.editor'].blocks.length, 4);
  const r2 = await say(s, ['select the second paragraph', 'undo']);
  assert.equal(r2[1].text, 'OK, I undid it: the list you added is gone.', 'the selection is not an edit: undo takes the last edit');
  assert.equal(s.isession.state['docs.editor'].blocks.length, 3);
  const r3 = await say(s, ['redo']);
  assert.equal(r3[0].text, 'OK, I added the list again.');
  assert.equal(s.isession.state['docs.editor'].blocks.length, 4);
  const r4 = await say(s, ['undo twice']);
  assert.match(r4[0].text, /\(2 changes\)\.$/);
  assert.equal(s.isession.state['docs.editor'].blocks.length, 2);
  const r5 = await say(s, ['Add a quote Be kind.', 'redo']);
  assert.equal(r5[1].text, 'There is nothing to redo.', 'a new edit empties what could be redone');
  assert.equal(r5[1].statuses[0], 'missing');
  const e = session(matrix, 'editor');
  const r6 = await say(e, ['undo']);
  assert.equal(r6[0].text, 'There is nothing to undo.');
});

test('docs.editor: ops and matrix give the same replies and the same document for a scripted session (except the listed gains: the reasons and the undo words)', async () => {
  const script = [...EDIT, 'Make the title Party Plans', 'make the first paragraph bold', 'move the list to the top', 'How many paragraphs are there?', 'select the second paragraph', 'delete it', 'Replace milk with juice', 'Is the document empty?', 'Clear the document'];
  const m = session(matrix, 'editor'), o = session(ops, 'editor');
  const a = await say(m, script), b = await say(o, script);
  assert.deepEqual(a, b);
  const strip = (st) => { const { history, future, ...rest } = st; return JSON.stringify(rest); };
  assert.equal(strip(m.isession.state['docs.editor']), strip(o.isession.state['docs.editor']));
});

test('docs.editor: why? names the document as its source', async () => {
  assert.equal(matrix.set.get('docs.editor').sourcePhrase, 'the document');
  assert.equal(matrix.set.get('docs.reader').sourcePhrase, 'the documents you opened');
});

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
