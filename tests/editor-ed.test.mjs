// ED (worker-tasks 2026-11-09): the document editor obeys typed and dictated commands: structure, writing, editing, reading, Romanian.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { splitSentences } from '../src/formalizer/rules/normalize.mjs';
import { createTranslator } from '../src/translate/index.mjs';

const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const DOC = 'docs.editor';
async function run(...lines) {
  const s = engine.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { activeTab: 'editor' });
  const replies = [];
  for (const l of lines) replies.push((await s.send(l)).text);
  return { s, st: s.state(DOC), replies, last: replies.at(-1) };
}

test('sentence splitting: quotes and free-text requests are not cut at their full stops', () => {
  assert.equal(splitSentences('write "Where am I?" said the fox. "Lost," said the owl.').length, 1);
  assert.equal(splitSentences('add a paragraph The fox ran. The dog slept. It was late.').length, 1);
  assert.equal(splitSentences('write It was cold. Then delete the last word.').length, 2);   // a new request starts a new sentence
  assert.equal(splitSentences('Hello there. How are you?').length, 2);                       // ordinary text is still split
  assert.equal(splitSentences('say "unclosed. and then more').length, 2);                    // an unclosed quote is ignored
});

test('structure: new line, new paragraph, page break, chapters, sections, subheadings', async () => {
  const a = await run('new line', 'write Once upon a time there was a fox', 'new paragraph', 'start a new chapter', 'add a new chapter called The Forest', 'chapter 3: The Return',
    'start a new section called Plans', 'add a subheading Details', 'insert a page break', 'start a new page');
  assert.deepEqual(a.st.blocks.map((b) => b.kind), ['paragraph', 'paragraph', 'heading', 'heading', 'heading', 'heading', 'heading', 'rule', 'rule']);
  assert.equal(a.st.blocks[0].text, 'Once upon a time there was a fox.');   // the blank line the first command made was filled
  assert.deepEqual(a.st.blocks.slice(2, 7).map((b) => b.text), ['Chapter 1', 'Chapter 2: The Forest', 'Chapter 3: The Return', 'Section 1: Plans', 'Details']);
  assert.deepEqual(a.st.blocks.slice(2, 7).map((b) => b.level), [1, 1, 1, 2, 3]);
  assert.ok(a.st.blocks[7].page && a.st.blocks[8].page);
});

test('positions: under, after and before the title, a chapter or the second paragraph', async () => {
  const a = await run('write a title Tale', 'add a paragraph One', 'add a paragraph Two', 'add a new chapter called A', 'add a paragraph Body',
    'insert a new line after the title', 'add a paragraph Hello under the title', 'insert a heading Prologue before the second paragraph', 'insert a page break after chapter 1');
  assert.equal(a.st.title, 'Tale');
  const texts = a.st.blocks.map((b) => b.text ?? (b.page ? '|page|' : ''));
  assert.equal(texts[0], 'Tale');   // the heading that is the title stays first
  assert.equal(texts[1], 'Hello.');
  assert.equal(texts.at(-1), '|page|');
  assert.ok(texts.indexOf('Prologue') > texts.indexOf('Hello.'));
});

test('writing: write, type, add the text, continue with; long text and quotes stay whole', async () => {
  const long = 'It was a bright cold day in April, and the clocks were striking thirteen. '.repeat(10).trim();
  const a = await run('write The fox was hungry', 'continue with and the berries were far away', 'type Then it began to rain', 'add the text and the fox ran home', `write ${long}`, 'write "Where am I?" said the fox. "Lost," said the owl.');
  assert.deepEqual(a.st.blocks.map((b) => b.text.slice(0, 20)), ['The fox was hungry. ', 'Then it began to rai', 'And the fox ran home', 'It was a bright cold', '"Where am I?" said t']);
  assert.ok(a.st.blocks[0].text.includes('berries were far away'));
  assert.equal(a.st.blocks[3].text, long);
  assert.equal(a.st.blocks[4].text, '"Where am I?" said the fox. "Lost," said the owl.');
});

test('lists: one bullet or numbered item at a time, and "a bullet list of ..." is still a list', async () => {
  const a = await run('add a bullet: milk', 'add a bullet: eggs', 'add a numbered item: wash up', 'add a bullet list of cats and dogs');
  assert.deepEqual(a.st.blocks.map((b) => [b.style, b.items]), [['bullet', ['milk', 'eggs']], ['numbered', ['wash up']], ['bullet', ['cats', 'and dogs']]].map(([s, i], k) => (k === 2 ? ['bullet', ['cats', 'dogs']] : [s, i])));
});

test('editing and reading: marks, delete, move, rename, read the document, a chapter, the last paragraph', async () => {
  const a = await run('write a title My Story', 'add a new chapter called A', 'add a paragraph Day broke. Birds sang', 'add a new chapter called B', 'add a paragraph Night fell', 'read the document', 'read chapter 2', 'read the last paragraph',
    'make the last sentence bold', 'make the last word italic', 'delete the last word', 'move the first paragraph down', 'rename the document to The Fox');
  assert.match(a.replies[5], /Day broke/);
  assert.match(a.replies[6], /Night fell/);
  assert.ok(!/Day broke/.test(a.replies[6]));
  assert.match(a.replies[7], /Night fell/);
  assert.equal(a.st.title, 'The Fox');
  assert.ok(a.st.blocks.some((b) => (b.marks ?? []).some((m) => m.type === 'bold')));
  assert.equal(a.st.blocks.find((b) => b.text?.startsWith('Day')).text, 'Day broke. Birds sang.');
  assert.equal(a.st.blocks.find((b) => b.text?.startsWith('Night')).text, 'Night.');   // "delete the last word" took the last word of the document
});

test('dictation: new line, new paragraph, new chapter, page break act as commands with a short confirmation', async () => {
  const a = await run('start dictation', 'the fox went out', 'new line', 'it found a bush', 'new paragraph', 'new chapter', 'the cave', 'page break', 'new chapter called The Return', 'stop dictation');
  assert.equal(a.replies[2], 'New line.');
  assert.equal(a.replies[4], 'New paragraph.');
  assert.match(a.replies[5], /^New chapter/);
  assert.deepEqual(a.st.blocks.map((b) => b.text ?? '|page|'), ['The fox went out.', 'It found a bush.', 'Chapter 1: The cave', '|page|', 'Chapter 2: The Return']);
  assert.equal(a.st.inputMode, null);
});

test('Romanian: the editor commands map to English commands', async () => {
  const t = createTranslator();
  const ro = async (x) => (await t.translate(x, { from: 'ro', to: 'en' })).text;
  const cases = {
    'rând nou': 'New line', 'paragraf nou': 'New paragraph', 'capitol nou': 'New chapter', 'adaugă o pagină nouă': 'Add a new page', 'pagină nouă': 'New page',
    'adaugă un capitol nou numit Pădurea': 'Add a new chapter called The forest', 'citește capitolul 2': 'Read chapter 2', 'citește ultimul paragraf': 'Read the last paragraph',
    'șterge ultimul cuvânt': 'Delete the last word', 'fă ultima propoziție aldină': 'Make the last sentence bold', 'fă ultimul cuvânt cursiv': 'Make the last word italic',
    'pune ultimul paragraf subliniat': 'Make the last paragraph underlined', 'mută al doilea paragraf mai sus': 'Move the second paragraph up', 'pornește dictarea': 'Start dictation',
    'inserează un rând nou după titlu': 'Insert a new line after the title', 'redenumește documentul în Vulpea': 'Rename the document to The fox',
  };
  for (const [r, e] of Object.entries(cases)) assert.equal(await ro(r), e, r);
});

test('Romanian dictation: "rând nou" and "paragraf nou" are commands', async () => {
  const s = engine.createSession({ language: 'en', translator: createTranslator() });
  s.setWorldState('ui.shell', { activeTab: 'editor' });
  await s.send('start dictation');
  await s.send('the fox ran');
  const r = await s.send('rând nou');
  assert.ok(r.text.length < 40, r.text);
  await s.send('paragraf nou');
  assert.equal(s.state(DOC).blocks.length, 1);
});
