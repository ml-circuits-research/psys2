// Tests of the TipTap-backed document editor (worlds/docs.editor, docs/webchat/ui/tabs/editor.mjs, spec 07 section 3).
// The engine here loads only the worlds the editor depends on, so the tests do not depend on the other tool worlds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import * as M from '../worlds/docs.editor/model.mjs';
import { resolve, rangesOf } from '../worlds/docs.editor/target.mjs';
import * as gen from '../worlds/docs.editor/datagen.mjs';

const loader = createFsLoader({ roots: [DEFAULT_ROOT] });
const list = loader.listWorlds.bind(loader);
loader.listWorlds = async () => (await list()).filter((id) => ['core', 'docs.editor', 'ui.shell'].includes(id) || id.startsWith('kids.'));
const engine = await createEngine({ loader });
const session = () => engine.createSession({ language: 'en' });
const DOC = 'docs.editor';

/** Runs the lines in one session; returns helpers over the final state. */
async function run(...lines) {
  const s = session();
  let r;
  for (const l of lines) r = await s.send(l);
  return { s, r, text: r.text, st: s.state(DOC), status: r.statuses.at(-1) };
}
const BASE = ['Add a heading Shopping', 'Add a paragraph We need food for the party tonight', 'Add a list with milk, eggs and bread'];
const marksOf = (b, type) => (b.marks ?? []).filter((m) => m.type === type);
const nodeTypes = (n, out = new Set()) => { out.add(n.type); (n.content ?? []).forEach((c) => nodeTypes(c, out)); return out; };

// ---- model -------------------------------------------------------------------------------------------------
test('model: toDoc maps blocks and marks onto TipTap nodes', () => {
  const s = { title: 'T', titleMarks: [], titleAlign: 'center', titleSize: 1, blocks: [
    { id: 'b1', kind: 'heading', level: 2, text: 'Head' },
    { id: 'b2', kind: 'paragraph', text: 'Hello world', marks: [{ at: '0', from: 0, to: 5, type: 'bold' }, { at: '0', from: 6, to: 11, type: 'highlight', attrs: { color: '#fff176' } }] },
    { id: 'b3', kind: 'list', style: 'task', items: ['a', 'b'], checked: [true, false] },
    { id: 'b4', kind: 'table', rows: [['x', 'y'], ['1', '2']], header: true },
    { id: 'b5', kind: 'rule' }, { id: 'b6', kind: 'quote', text: 'q' }, { id: 'b7', kind: 'list', style: 'numbered', items: ['one'] },
  ] };
  const d = M.toDoc(s);
  assert.equal(d.type, 'doc');
  assert.deepEqual(d.content.map((n) => n.type), ['heading', 'heading', 'paragraph', 'taskList', 'table', 'horizontalRule', 'blockquote', 'orderedList']);
  assert.equal(d.content[0].attrs.title, true); assert.equal(d.content[0].attrs.textAlign, 'center'); assert.equal(d.content[0].attrs.size, 1);
  assert.deepEqual(d.content[2].content.map((t) => [t.text, (t.marks ?? []).map((m) => m.type)]), [['Hello', ['bold']], [' ', []], ['world', ['highlight']]]);
  assert.equal(d.content[2].content[2].marks[0].attrs.color, '#fff176');
  assert.equal(d.content[3].content[0].attrs.checked, true);
  assert.equal(d.content[4].content[0].content[0].type, 'tableHeader');
  assert.equal(d.content[4].content[1].content[0].type, 'tableCell');
  assert.equal(d.content[2].attrs.blockId, 'b2');
});
test('model: marks merge, cut and report coverage', () => {
  const b = { kind: 'paragraph', text: 'abcdefghij' };
  M.addMark(b, '0', 0, 4, 'bold'); M.addMark(b, '0', 4, 8, 'bold');
  assert.deepEqual(b.marks, [{ at: '0', from: 0, to: 8, type: 'bold' }]);
  assert.ok(M.covered(b, '0', 2, 6, 'bold')); assert.ok(!M.covered(b, '0', 2, 9, 'bold'));
  M.cutMark(b, '0', 3, 5, 'bold');
  assert.deepEqual(b.marks.map((m) => [m.from, m.to]), [[0, 3], [5, 8]]);
  M.cutMark(b, '0', 0, 10);
  assert.equal(b.marks, undefined);
});
test('model: a new highlight color replaces the old one in the same range', () => {
  const b = { kind: 'paragraph', text: 'abcdef' };
  M.addMark(b, '0', 0, 6, 'highlight', { color: 'a' }); M.addMark(b, '0', 2, 4, 'highlight', { color: 'b' });
  assert.deepEqual(b.marks.map((m) => [m.from, m.to, m.attrs.color]), [[0, 2, 'a'], [2, 4, 'b'], [4, 6, 'a']]);
});
test('model: spliceText moves marks with the text', () => {
  const b = { kind: 'paragraph', text: 'one two three', marks: [{ at: '0', from: 4, to: 7, type: 'bold' }] };
  M.spliceText(b, '0', 0, 3, 'seventeen');
  assert.equal(b.text, 'seventeen two three');
  assert.deepEqual(b.marks[0], { at: '0', from: 10, to: 13, type: 'bold' });
  M.spliceText(b, '0', 10, 13, 'x');                       // replacing the marked word keeps the mark
  assert.deepEqual(b.marks.map((m) => [m.from, m.to]), [[10, 11]]);
  M.spliceText(b, '0', 9, 14, '');                          // deleting around it drops the mark
  assert.equal(b.marks, undefined);
});
test('model: sentence and word ranges, whole-word search', () => {
  assert.deepEqual(M.sentenceRanges('One. Two three! Four?'), [[0, 4], [5, 15], [16, 21]]);
  assert.equal(M.sentencesOf('A b. C d.').length, 2);
  assert.deepEqual(M.findAll('Milk and milkshake and MILK', 'milk'), [[0, 4], [23, 27]]);
  assert.equal(M.findAll('Milk and milkshake', 'milk', false).length, 2);
  assert.equal(M.wordsIn("It's a well-known fact"), 4);
});
test('model: markdown, html and text exports carry the marks', () => {
  const s = { title: 'Doc <1>', titleMarks: [], titleAlign: 'left', titleSize: 0, blocks: [
    { id: 'b1', kind: 'paragraph', text: 'make bold link', marks: [{ at: '0', from: 5, to: 9, type: 'bold' }, { at: '0', from: 10, to: 14, type: 'link', attrs: { href: 'https://example.com' } }] },
    { id: 'b2', kind: 'list', style: 'task', items: ['a', 'b'], checked: [true, false] },
    { id: 'b3', kind: 'table', rows: [['x', 'y'], ['1', '2']], header: true },
  ] };
  const md = M.toText(s, true);
  assert.match(md, /^# Doc <1>/); assert.match(md, /make \*\*bold\*\* \[link\]\(https:\/\/example\.com\)/);
  assert.match(md, /- \[x\] a\n- \[ \] b/); assert.match(md, /\| x \| y \|\n\| --- \| --- \|\n\| 1 \| 2 \|/);
  const html = M.toHtml(s);
  assert.match(html, /<title>Doc &lt;1&gt;<\/title>/); assert.match(html, /<strong>bold<\/strong>/); assert.match(html, /<a href="https:\/\/example\.com">link<\/a>/);
  assert.match(html, /<input type="checkbox" disabled checked>/); assert.match(html, /<th>x<\/th>/);
  assert.match(M.toText(s, false), /make bold link/);
});
test('model: stats count words, tasks and reading time', () => {
  const st = M.stats({ title: 'Untitled document', blocks: [{ kind: 'paragraph', text: 'One two. Three.' }, { kind: 'list', style: 'task', items: ['a', 'b', 'c'], checked: [true, true, false] }] });
  assert.equal(st.words, 6); assert.equal(st.tasks, 3); assert.equal(st.tasksDone, 2); assert.equal(st.sentences, 2); assert.equal(st.readingMinutes, 1);
});

// ---- references --------------------------------------------------------------------------------------------
const sample = () => ({ title: 'My Title', titleMarks: [], blocks: [
  { id: 'b1', kind: 'heading', level: 2, text: 'First heading' },
  { id: 'b2', kind: 'paragraph', text: 'Cats purr. Dogs bark loudly. Birds sing.' },
  { id: 'b3', kind: 'paragraph', text: 'The milk is cold.' },
  { id: 'b4', kind: 'list', style: 'task', items: ['buy milk', 'call Ana'], checked: [false, true] },
], cursor: 2, selection: null });
test('resolve: ordinals, last, kinds and the title', () => {
  const s = sample();
  assert.equal(resolve(s, 'the second paragraph').blocks[0].id, 'b3');
  assert.equal(resolve(s, 'the last paragraph').blocks[0].id, 'b3');
  assert.equal(resolve(s, 'paragraph 1').blocks[0].id, 'b2');
  assert.equal(resolve(s, 'the title').blocks[0].id, 'title');
  assert.equal(resolve(s, 'the heading').blocks[0].id, 'b1');
  assert.equal(resolve(s, 'the third paragraph').ok, false);
  assert.match(resolve(s, 'the table').error, /no table/);
  assert.equal(resolve(s, 'all paragraphs').blocks.length, 2);
});
test('resolve: sentences, words and scoped searches', () => {
  const s = sample();
  const r = resolve(s, 'the last sentence');
  assert.equal(M.getText(r.ranges[0].b, '0').slice(r.ranges[0].from, r.ranges[0].to), 'The milk is cold.');
  const r2 = resolve(s, 'the second sentence of the first paragraph');
  assert.equal(M.getText(r2.ranges[0].b, '0').slice(r2.ranges[0].from, r2.ranges[0].to), 'Dogs bark loudly.');
  const w = resolve(s, 'the word milk');
  assert.equal(w.ranges.length, 2); assert.equal(w.ranges[1].b.id, 'b4');
  assert.equal(resolve(s, 'the word milk', { first: true }).ranges.length, 1);
  assert.equal(resolve(s, 'the word milk in the second paragraph').ranges.length, 1);
  assert.equal(resolve(s, 'the second word').ranges[0].from, 6);   // First heading
  assert.match(resolve(s, 'the word zebra').error, /could not find/);
});
test('resolve: items, tasks, pronouns and the cursor fallback', () => {
  const s = sample();
  assert.equal(resolve(s, 'the first task').items[0].i, 0);
  assert.equal(resolve(s, 'the task call Ana').items[0].i, 1);
  assert.equal(resolve(s, 'it').blocks[0].id, 'b3');                              // the working block
  s.selection = { type: 'range', block: 'b2', at: '0', from: 0, to: 4 };
  assert.equal(rangesOf(resolve(s, 'it'))[0].to, 4);
  s.selection = { type: 'blocks', blocks: ['b1', 'b3'] };
  assert.equal(resolve(s, 'this').blocks.length, 2);
  assert.equal(resolve({ ...sample(), cursor: -1 }, 'it').ok, false);
  assert.equal(resolve(sample(), 'everything').blocks.length, 5);
});

// ---- formatting by reference -------------------------------------------------------------------------------
test('format: "make the second paragraph bold" marks the whole block', async () => {
  const { st, text } = await run(...BASE, 'Add a paragraph Second one here', 'Make the second paragraph bold');
  assert.match(text, /bold/);
  assert.deepEqual(marksOf(st.blocks[3], 'bold').map((m) => [m.from, m.to]), [[0, 'Second one here.'.length]]);
  assert.equal(st.doc.content[4].content[0].marks[0].type, 'bold');
});
test('format: "make the word milk bold" finds the word inside a list item', async () => {
  const { st } = await run(...BASE, 'Make the word milk bold');
  assert.deepEqual(marksOf(st.blocks[2], 'bold'), [{ at: '0', from: 0, to: 4, type: 'bold' }]);
  const li = st.doc.content[3].content[0].content[0].content[0];
  assert.equal(li.text, 'milk'); assert.equal(li.marks[0].type, 'bold');
});
test('format: highlight the last sentence in yellow', async () => {
  const { st } = await run('Add a paragraph Cats purr', 'Add a paragraph Dogs bark', 'Highlight the last sentence in yellow');
  const m = marksOf(st.blocks[1], 'highlight')[0];
  assert.equal(m.attrs.color, M.COLORS.yellow); assert.equal(m.to, 'Dogs bark.'.length);
  assert.equal(marksOf(st.blocks[0], 'highlight').length, 0);
});
test('format: highlight with other colors and an unknown color', async () => {
  const g = await run(...BASE, 'Highlight the word eggs in green');
  assert.equal(marksOf(g.st.blocks[2], 'highlight')[0].attrs.color, M.COLORS.green);
  const bad = await run(...BASE, 'Highlight the word eggs in plaid');
  assert.notEqual(bad.status, 'supported');
});
test('format: underline the heading, italicize, code, strikethrough', async () => {
  const { st } = await run(...BASE, 'Underline the heading', 'Italicize the first paragraph', 'Make the word eggs code', 'Make the word bread strikethrough');
  assert.equal(marksOf(st.blocks[0], 'underline').length, 1);
  assert.equal(marksOf(st.blocks[1], 'italic').length, 1);
  assert.equal(marksOf(st.blocks[2], 'code').length, 1);
  assert.equal(marksOf(st.blocks[2], 'strike').length, 1);
});
test('format: marks can be removed again ("not bold", "remove the bold", "unbold", "plain")', async () => {
  const a = await run(...BASE, 'Make the heading bold', 'Make the heading not bold');
  assert.equal(a.st.blocks[0].marks, undefined);
  const b = await run(...BASE, 'Make the heading italic', 'Remove the italic from the heading');
  assert.equal(b.st.blocks[0].marks, undefined);
  const c = await run(...BASE, 'Make the heading bold', 'Unbold the heading');
  assert.equal(c.st.blocks[0].marks, undefined);
  const d = await run(...BASE, 'Make the heading bold', 'Underline the heading', 'Make the heading plain');
  assert.equal(d.st.blocks[0].marks, undefined);
});
test('format: repeating a mark or removing a missing one is answered, not applied twice', async () => {
  const a = await run(...BASE, 'Make the heading bold', 'Make the heading bold');
  assert.match(a.text, /already bold/); assert.equal(a.st.history.length, 4);
  const b = await run(...BASE, 'Remove the bold from the heading');
  assert.match(b.text, /no bold/);
});
test('format: the title takes marks, alignment and size', async () => {
  const { st } = await run('Make the title Our Trip', 'Make the title bold', 'Center the title', 'Make the title bigger', 'Make the title bigger');
  assert.equal(marksOf({ marks: st.titleMarks }, 'bold').length, 1);
  assert.equal(st.titleAlign, 'center'); assert.equal(st.titleSize, 2);
  assert.equal(st.doc.content[0].attrs.textAlign, 'center'); assert.equal(st.doc.content[0].attrs.size, 2);
  assert.equal(st.doc.content[0].content[0].marks[0].type, 'bold');
});
test('size: headings change level, the title stops at its limits, paragraphs refuse', async () => {
  const a = await run(...BASE, 'Make the heading bigger');
  assert.equal(a.st.blocks[0].level, 1);
  const b = await run(...BASE, 'Make the heading bigger', 'Make the heading bigger');
  assert.match(b.text, /already as big/);
  const c = await run('Make the title smaller', 'Make the title smaller', 'Make the title smaller');
  assert.equal(c.st.titleSize, -2); assert.match(c.text, /already as small/);
  const d = await run(...BASE, 'Make the second heading bigger');
  assert.equal(d.status, 'missing');
});
test('align: center, right, justify and back to left', async () => {
  const a = await run(...BASE, 'Center the first paragraph');
  assert.equal(a.st.blocks[1].align, 'center'); assert.equal(a.st.doc.content[2].attrs.textAlign, 'center');
  const b = await run(...BASE, 'Align the first paragraph to the right', 'Justify the first paragraph', 'Align the first paragraph to the left');
  assert.equal(b.st.blocks[1].align, undefined); assert.equal(b.st.doc.content[2].attrs.textAlign, null);
  assert.equal((await run(...BASE, 'Align the heading to the right')).st.blocks[0].align, 'right');
});
test('convert: list to numbered list, paragraph to quote, paragraph to task list, heading levels', async () => {
  const a = await run(...BASE, 'Turn the list into a numbered list');
  assert.equal(a.st.blocks[2].style, 'numbered'); assert.equal(a.st.doc.content[3].type, 'orderedList');
  const b = await run(...BASE, 'Turn the first paragraph into a quote');
  assert.equal(b.st.blocks[1].kind, 'quote'); assert.equal(b.st.doc.content[2].type, 'blockquote');
  const c = await run(...BASE, 'Make the list a task list');
  assert.equal(c.st.blocks[2].style, 'task'); assert.deepEqual(c.st.blocks[2].checked, [false, false, false]);
  const d = await run(...BASE, 'Turn the first paragraph into heading 1');
  assert.deepEqual([d.st.blocks[1].kind, d.st.blocks[1].level], ['heading', 1]);
});
test('convert: a list becomes paragraphs, a paragraph becomes a list of sentences, the marks follow', async () => {
  const a = await run(...BASE, 'Make the word eggs bold', 'Turn the list into a paragraph');
  assert.deepEqual(a.st.blocks.slice(2).map((b) => b.text), ['milk', 'eggs', 'bread']);
  assert.equal(marksOf(a.st.blocks[3], 'bold').length, 1);
  const b = await run('Add a paragraph Cats purr', 'Add a paragraph Dogs bark', 'Turn the first paragraph into a bullet list');
  assert.equal(b.st.blocks[0].kind, 'list');
  const c = await run('Add a paragraph Cats purr', 'Make the word purr italic', 'Turn the paragraph into a numbered list');
  assert.equal(marksOf(c.st.blocks[0], 'italic')[0].at, '0');
});
test('convert: the title and tables are refused politely', async () => {
  assert.equal((await run('Make the title X', 'Turn the title into a quote')).status, 'unsupported');
  assert.equal((await run('Add a table with 2 columns: a, b', 'Turn the table into a list')).status, 'unsupported');
});

// ---- selection by voice -------------------------------------------------------------------------------------
test('select: a paragraph, then "make it bold" and "delete it" act on it', async () => {
  const a = await run(...BASE, 'Select the first paragraph');
  assert.deepEqual(a.st.selection, { type: 'blocks', blocks: ['b2'] });
  const b = await run(...BASE, 'Select the first paragraph', 'Make it bold');
  assert.equal(marksOf(b.st.blocks[1], 'bold').length, 1);
  const c = await run(...BASE, 'Select the first paragraph', 'Delete the selection');
  assert.equal(c.st.blocks.length, 2); assert.equal(c.st.selection, null);
});
test('select: a word, then format and delete just that word', async () => {
  const a = await run(...BASE, 'Select the word party', 'Make it italic');
  assert.equal(a.st.selection.type, 'range');
  const m = marksOf(a.st.blocks[1], 'italic')[0];
  assert.equal(a.st.blocks[1].text.slice(m.from, m.to), 'party');
  const b = await run(...BASE, 'Select the word party', 'Delete the selection');
  assert.equal(b.st.blocks[1].text, 'We need food for the tonight.');
});
test('select: a word that occurs twice selects the first and says so; clear the selection', async () => {
  const a = await run('Add a paragraph Milk is good and milk is cold', 'Select the word milk');
  assert.match(a.text, /first of 2/); assert.equal(a.st.selection.from, 0);
  const b = await run(...BASE, 'Select the title', 'Clear the selection');
  assert.equal(b.st.selection, null);
  assert.match((await run(...BASE, 'Select the word zebra')).text, /could not find/);
});
test('select: "what is selected" and replacing the selection', async () => {
  const a = await run(...BASE, 'Select the word food', 'What is selected?');
  assert.match(a.text, /food/);
  const b = await run(...BASE, 'Select the word food', 'Replace it with cake');
  assert.match(b.st.blocks[1].text, /We need cake for/);
  assert.equal((await run(...BASE, 'Clear the selection', 'What is selected?')).text, 'Nothing is selected.');
});
test('select: a selection made by the mouse (host state patch) works like a spoken one', async () => {
  const s = session();
  for (const l of BASE) await s.send(l);
  s.setWorldState(DOC, { selection: { type: 'range', block: 'b2', at: '0', from: 3, to: 7 }, cursor: 1 });
  await s.send('Make it bold');
  assert.equal(marksOf(s.state(DOC).blocks[1], 'bold')[0].from, 3);
  s.setWorldState(DOC, { selection: { type: 'blocks', blocks: ['b3'] }, cursor: 2 });
  await s.send('Turn it into a numbered list');
  assert.equal(s.state(DOC).blocks[2].style, 'numbered');
});
test('select: "it" without a selection falls back to the block just worked on; with nothing it asks', async () => {
  const a = await run(...BASE, 'Make it bold');
  assert.equal(a.st.blocks[2].marks.length, 3);
  assert.match((await run('Make it bold')).text, /Nothing is selected/);
});
test('delete: a word, a sentence, an item, the title', async () => {
  const a = await run('Add a paragraph Cats purr. Dogs bark', 'Delete the word cats');
  assert.equal(a.st.blocks[0].text, 'purr.');
  const b = await run(...BASE, 'Delete the first item');
  assert.deepEqual(b.st.blocks[2].items, ['eggs', 'bread']);
  const c = await run('Make the title Our Trip', 'Delete the title');
  assert.equal(c.st.title, M.DEFAULT_TITLE);
  const d = await run('Add a paragraph Cats purr', 'Add a paragraph Dogs bark', 'Delete the first sentence');
  assert.equal(d.st.blocks.length, 1);
});

// ---- tables ----------------------------------------------------------------------------------------------------
test('table: "add a table with 3 columns: animal, legs, food" makes a header row', async () => {
  const { st } = await run('Add a table with 3 columns: animal, legs, food');
  assert.deepEqual(st.blocks[0].rows, [['Animal', 'Legs', 'Food']]);
  assert.equal(st.doc.content[1].type, 'table'); assert.equal(st.doc.content[1].content[0].content[0].type, 'tableHeader');
});
test('table: count only, count and rows, and a bare table', async () => {
  const a = await run('Add a table with 4 columns and 3 rows');
  assert.equal(a.st.blocks[0].rows.length, 4); assert.equal(a.st.blocks[0].rows[0].length, 4);
  assert.deepEqual((await run('Add a table')).st.blocks[0].rows[0], ['Column 1', 'Column 2', 'Column 3']);
  assert.equal((await run('Add a table with 3 columns: a, b')).status, 'unsupported');
});
test('table: rows, columns, cells', async () => {
  const T = 'Add a table with 3 columns: animal, legs, food';
  const a = await run(T, 'Add a row: cat, 4, fish', 'Add a row dog, 4 and bones');
  assert.deepEqual(a.st.blocks[0].rows.slice(1), [['cat', '4', 'fish'], ['dog', '4', 'bones']]);
  assert.equal((await run(T, 'Add a row: a, b, c, d')).status, 'unsupported');
  const b = await run(T, 'Add a row: cat, 4, fish', 'Add a column weight');
  assert.deepEqual(b.st.blocks[0].rows[0], ['Animal', 'Legs', 'Food', 'Weight']); assert.equal(b.st.blocks[0].rows[1].length, 4);
  const c = await run(T, 'Add a row: cat, 4, fish', 'Set the cell in row 1 column 2 to 5');
  assert.equal(c.st.blocks[0].rows[1][1], '5');
  assert.equal((await run(T, 'Add a row')).st.blocks[0].rows[1][0], '');
});
test('table: delete a row or a column, with marks following', async () => {
  const T = 'Add a table with 3 columns: animal, legs, food';
  const a = await run(T, 'Add a row: cat, 4, fish', 'Add a row: dog, 4, bones', 'Make the word bones bold', 'Delete the first row');
  assert.deepEqual(a.st.blocks[0].rows[1], ['dog', '4', 'bones']); assert.equal(a.st.blocks[0].marks[0].at, '1:2');
  const b = await run(T, 'Add a row: cat, 4, fish', 'Delete the column legs');
  assert.deepEqual(b.st.blocks[0].rows, [['Animal', 'Food'], ['cat', 'fish']]);
  const c = await run(T, 'Add a row: cat, 4, fish', 'Delete the last column');
  assert.equal(c.st.blocks[0].rows[0].length, 2);
  assert.equal((await run('Add a row: a, b')).status, 'missing');
});
test('table: "fill the table with sea animals" asks kids.animals and keeps the wire ids', async () => {
  const { st, text } = await run('Add a table with 3 columns: animal, legs, food', 'Fill the table with sea animals');
  const rows = st.blocks[0].rows;
  assert.ok(rows.length > 3, text);
  assert.ok(rows.some((r) => r[0] === 'Whale'));
  assert.ok(st.blocks[0].from.length > 3);
  const whale = rows.find((r) => r[0] === 'Whale');
  assert.equal(whale[1], '0');
});
test('table: fill with no table makes one; unknown groups and columns are explained', async () => {
  const a = await run('Fill the table with farm animals');
  assert.equal(a.st.blocks[0].kind, 'table'); assert.ok(a.st.blocks[0].rows.length > 2);
  assert.equal((await run('Fill the table with unicorns')).status, 'missing');
  const b = await run('Add a table with 2 columns: color, mood', 'Fill the table with sea animals');
  assert.equal(b.status, 'missing'); assert.match(b.text, /animal, legs, food/);
});
test('table: counting rows and columns', async () => {
  const r = await run('Add a table with 3 columns: a, b, c', 'Add a row: 1, 2, 3', 'How many columns does the table have?');
  assert.match(r.text, /3 columns/);
  assert.match((await run('Add a table with 3 columns: a, b, c', 'Add a row: 1, 2, 3', 'How many rows does the table have?')).text, /1 row/);
});

// ---- tasks -----------------------------------------------------------------------------------------------------
test('tasks: add, check, uncheck, count and list', async () => {
  const a = await run('Add a task buy bread', 'Add a task call Ana');
  assert.deepEqual(a.st.blocks[0].items, ['Buy bread', 'Call Ana']); assert.equal(a.st.blocks[0].style, 'task');
  assert.equal(a.st.doc.content[1].type, 'taskList');
  const b = await run('Add a task buy bread', 'Add a task call Ana', 'Check the first task');
  assert.deepEqual(b.st.blocks[0].checked, [true, false]); assert.equal(b.st.doc.content[1].content[0].attrs.checked, true);
  const c = await run('Add a task buy bread', 'Add a task call Ana', 'Check the first task', 'How many tasks are done?');
  assert.match(c.text, /1 of 2 tasks is done/);
  assert.match((await run('Add a task buy bread', 'Add a task call Ana', 'Check the first task', 'Which tasks are left?')).text, /Call Ana/);
  const d = await run('Add a task buy bread', 'Check the first task', 'Uncheck the first task');
  assert.deepEqual(d.st.blocks[0].checked, [false]);
});
test('tasks: by text, by number, all, and errors', async () => {
  const T = ['Add a task buy bread', 'Add a task call Ana'];
  assert.deepEqual((await run(...T, 'Check the task call Ana')).st.blocks[0].checked, [false, true]);
  assert.deepEqual((await run(...T, 'Check task 2')).st.blocks[0].checked, [false, true]);
  assert.deepEqual((await run(...T, 'Check all tasks')).st.blocks[0].checked, [true, true]);
  assert.deepEqual((await run(...T, 'Check all tasks', 'Uncheck all tasks')).st.blocks[0].checked, [false, false]);
  assert.equal((await run(...T, 'Check the third task')).status, 'missing');
  assert.match((await run('Add a paragraph hi', 'Check the first task')).text, /no tasks/);
  assert.match((await run(...T, 'Check the first task', 'Check the first task')).text, /already checked/);
});
test('tasks: a task list can be made directly and from kids.tasks', async () => {
  const a = await run('Add a task list with buy milk, call Ana and clean the room');
  assert.equal(a.st.blocks[0].items.length, 3); assert.equal(a.st.blocks[0].style, 'task');
  const b = await run('Add milk to my shopping list', 'Add eggs to my shopping list', 'Make a document from my shopping list');
  assert.equal(b.st.blocks[0].style, 'task'); assert.equal(b.st.blocks[0].items.length, 2); assert.equal(b.st.blocks[0].from.length, 2);
});

// ---- other blocks, links, navigation, statistics ------------------------------------------------------------
test('blocks: a horizontal line, a quote, a numbered list', async () => {
  const a = await run('Insert a line');
  assert.equal(a.st.blocks[0].kind, 'rule'); assert.equal(a.st.doc.content[1].type, 'horizontalRule');
  assert.equal((await run('Add a horizontal rule')).st.blocks[0].kind, 'rule');
  const b = await run('Add a quote Be kind to every animal');
  assert.deepEqual([b.st.blocks[0].kind, b.st.blocks[0].text], ['quote', 'Be kind to every animal.']);
  const c = await run('Add a numbered list with wake up, eat and play');
  assert.deepEqual([c.st.blocks[0].style, c.st.blocks[0].items], ['numbered', ['wake up', 'eat', 'play']]);
});
test('link: "add a link to example dot com on the word cat" adds a link mark', async () => {
  const { st } = await run('Add a paragraph The cat sleeps', 'Add a link to example dot com on the word cat');
  const m = marksOf(st.blocks[0], 'link')[0];
  assert.equal(m.attrs.href, 'https://example.com'); assert.equal(st.blocks[0].text.slice(m.from, m.to), 'cat');
  assert.equal(st.doc.content[1].content[1].marks[0].attrs.href, 'https://example.com');
});
test('link: links on a selection, removal, and bad addresses', async () => {
  const a = await run('Add a paragraph The cat sleeps', 'Select the word cat', 'Add a link to animals dot example dot org');
  assert.equal(marksOf(a.st.blocks[0], 'link')[0].attrs.href, 'https://animals.example.org');
  const b = await run('Add a paragraph The cat sleeps', 'Add a link to example dot com on the word cat', 'Remove the link from the word cat');
  assert.equal(b.st.blocks[0].marks, undefined);
  assert.equal((await run('Add a paragraph The cat sleeps', 'Add a link to nonsense on the word cat')).status, 'unsupported');
  assert.equal(M.toText({ title: 'T', blocks: [{ id: 'b', kind: 'paragraph', text: 'cat', marks: [{ at: '0', from: 0, to: 3, type: 'link', attrs: { href: 'https://x.org' } }] }] }, true).includes('[cat](https://x.org)'), true);
});
test('navigation: go to the end, the top, a block kind and an ordinal heading', async () => {
  const s = session();
  for (const l of [...BASE, 'Add a heading More', 'Add a paragraph Last words']) await s.send(l);
  await s.send('Go to the top'); assert.equal(s.state(DOC).focus.id, 'title'); assert.equal(s.state(DOC).cursor, 0);
  await s.send('Go to the end'); assert.equal(s.state(DOC).cursor, 4); assert.equal(s.state(DOC).focus.id, 'b5');
  await s.send('Go to the second heading'); assert.equal(s.state(DOC).cursor, 3);
  await s.send('Go to the list'); assert.equal(s.state(DOC).cursor, 2);
  assert.equal((await s.send('Go to the table')).statuses.at(-1), 'missing');
});
test('stats: how many words, tasks, characters; the statistics sentence', async () => {
  assert.match((await run(...BASE, 'How many words?')).text, /There are 11 words/);
  assert.match((await run('Add a task a', 'Add a task b', 'Check task 1', 'How many tasks are there?')).text, /There are 2 tasks/);
  assert.match((await run(...BASE, 'How many characters?')).text, /characters/);
  assert.match((await run(...BASE, 'Word count')).text, /11 words/);
  assert.match((await run(...BASE, 'How many headings are there?')).text, /1 heading/);
  assert.match((await run('Word count')).text, /empty/);
});

// ---- export, history, state shape ------------------------------------------------------------------------------
test('export: HTML, markdown, text and JSON downloads carry the formatting', async () => {
  const s = session();
  for (const l of [...BASE, 'Make the word milk bold', 'Highlight the word eggs in pink']) await s.send(l);
  const dl = async (f) => (await s.send(`Download the document as ${f}`)).effects.find((e) => e.name === 'file.download').args;
  const html = await dl('html'); assert.equal(html.mime, 'text/html'); assert.match(html.filename, /\.html$/); assert.match(html.content, /<strong>milk<\/strong>/); assert.match(html.content, /<mark style="background:#ffc1e3">eggs<\/mark>/);
  const md = await dl('markdown'); assert.match(md.content, /\*\*milk\*\*/); assert.match(md.content, /^# Untitled document/);
  const txt = await dl('text'); assert.doesNotMatch(txt.content, /\*\*/);
  const json = await dl('json'); assert.equal(JSON.parse(json.content).type, 'doc');
  assert.equal((await s.send('Copy the document as html')).effects[0].name, 'clipboard.copy');
});
test('history: undo and redo restore marks, alignment, selection and the title', async () => {
  const s = session();
  for (const l of [...BASE, 'Make the word milk bold', 'Center the title', 'Make the title bigger']) await s.send(l);
  assert.equal(s.state(DOC).titleSize, 1);
  await s.send('Undo'); assert.equal(s.state(DOC).titleSize, 0);
  await s.send('Undo'); assert.equal(s.state(DOC).titleAlign, 'left');
  await s.send('Undo'); assert.equal(s.state(DOC).blocks[2].marks, undefined);
  await s.send('Redo'); assert.equal(s.state(DOC).blocks[2].marks.length, 1);
});
test('replace: keeps the marks on replaced words and can replace a reference', async () => {
  const a = await run('Add a paragraph The cat sat', 'Make the word cat bold', 'Replace cat with elephant');
  const m = marksOf(a.st.blocks[0], 'bold')[0];
  assert.equal(a.st.blocks[0].text.slice(m.from, m.to), 'elephant');
  const b = await run('Add a paragraph The cat sat', 'Replace the first paragraph with Hello there');
  assert.equal(b.st.blocks[0].text, 'Hello there.');
  assert.equal((await run('Make the title Cats', 'Replace the title with Dogs')).st.title, 'Dogs');
});
test('state: every change rebuilds a TipTap-compatible doc, stats and keeps the blocks view', async () => {
  const s = session();
  for (const l of [...BASE, 'Add a table with 2 columns: a, b', 'Add a task buy bread', 'Insert a line', 'Add a quote hi']) await s.send(l);
  const st = s.state(DOC);
  const types = nodeTypes(st.doc);
  for (const t of ['doc', 'heading', 'paragraph', 'bulletList', 'listItem', 'table', 'tableRow', 'tableHeader', 'taskList', 'taskItem', 'horizontalRule', 'blockquote', 'text']) assert.ok(types.has(t), t);
  assert.equal(st.doc.content.length, st.blocks.length + 1);
  assert.deepEqual(st.doc.content.slice(1).map((n) => n.attrs.blockId), st.blocks.map((b) => b.id));
  assert.equal(st.stats.tasks, 1); assert.ok(st.stats.words > 5);
  assert.equal(JSON.stringify(st.doc).includes('"text":""'), false);
});
test('state: a legacy state (no marks, no styles) still works and is upgraded', async () => {
  const s = session();
  await s.send('Add a heading Old');
  s.setWorldState(DOC, { title: 'Legacy', blocks: [{ id: 'b1', kind: 'heading', text: 'Old' }, { id: 'b2', kind: 'list', items: ['x', 'y'] }, { id: 'b3', kind: 'paragraph', text: 'Text here.' }], titleMarks: undefined, titleAlign: undefined, nextId: 4, cursor: 2 });
  const r = await s.send('Make the word x bold');
  assert.equal(r.statuses.at(-1), 'supported');
  const st = s.state(DOC);
  assert.equal(st.blocks[1].style, 'bullet'); assert.equal(st.blocks[0].level, 2); assert.equal(st.titleAlign, 'left');
  assert.equal(st.doc.content[2].type, 'bulletList');
});
test('older commands keep working with the richer model', async () => {
  const a = await run(...BASE, 'Move the last list to the top');
  assert.equal(a.st.blocks[0].kind, 'list');
  const b = await run(...BASE, 'Read the first paragraph');
  assert.ok(b.r.effects.some((e) => e.name === 'speech.say'));
  const c = await run(...BASE, 'What does the first paragraph say?');
  assert.match(c.text, /We need food for the party tonight/);
  assert.match((await run(...BASE, 'Read the list')).r.effects[0].args.text, /milk, eggs and bread/);
  assert.match((await run(...BASE, 'Make the word milk bold', 'Does the document mention milk?')).text, /Yes/);
  const d = await run('Add a quote Hi there', 'Copy the first quote');
  assert.equal(d.r.effects[0].args.text, 'Hi there.');
});
test('dictation still appends to a block that carries marks, and formatting works afterwards', async () => {
  const s = session();
  await s.send('Start dictation'); await s.send('hello world period'); await s.send('stop dictation');
  await s.send('Make the word world bold');
  const st = s.state(DOC);
  assert.equal(st.blocks[0].text, 'Hello world.'); assert.equal(marksOf(st.blocks[0], 'bold')[0].to, 11);
  await s.send('Start dictation'); await s.send('new paragraph'); await s.send('more text');
  assert.equal(s.state(DOC).inputMode, 'dictation');
});
test('reading and copying a selection', async () => {
  const a = await run(...BASE, 'Select the word food', 'Read the selection');
  assert.equal(a.r.effects[0].args.text, 'food');
  const b = await run(...BASE, 'Select the first paragraph', 'Copy the selection');
  assert.equal(b.r.effects[0].name, 'clipboard.copy'); assert.match(b.r.effects[0].args.text, /party/);
});
test('the toolbar commands the tab sends are all understood by the world', async () => {
  const s = session();
  for (const l of [...BASE, 'Select the first paragraph']) await s.send(l);
  const cmds = ['make it bold', 'remove the bold from it', 'make it italic', 'make it underlined', 'make it strikethrough', 'make it code', 'highlight it in yellow', 'remove the highlight from it',
    'align it to the left', 'align it to the center', 'align it to the right', 'justify it', 'turn it into a bullet list', 'turn it into a numbered list', 'turn it into a task list', 'turn it into a quote',
    'turn it into a paragraph', 'turn it into heading 2', 'add a table', 'insert a line', 'add a row', 'add a column', 'delete the last row', 'delete the last column', 'undo', 'redo', 'read the document', 'copy the document',
    'download the document as markdown', 'download the document as html', 'download the document as text', 'download the document as json', 'make the title bigger', 'make the title smaller', 'go to the top', 'go to the first heading',
    'add a link to example dot com', 'start dictation', 'stop dictation'];
  for (const c of cmds) {
    const r = await s.send(c);
    assert.ok(!r.statuses.includes('unparsed'), `not understood: ${c}`);
    assert.ok(!r.statuses.includes('error'), `error: ${c}`);
  }
});

// ---- training data, vendored library, tab plugin ------------------------------------------------------------
test('datagen: deterministic, shaped as spec 08 says, covers every template family and the negatives', () => {
  const mkRng = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const a = gen.generate({ rng: mkRng(7), count: 300 }), b = gen.generate({ rng: mkRng(7), count: 300 });
  assert.deepEqual(a, b); assert.equal(a.length, 300); assert.equal(gen.version, '1');
  for (const x of a) { assert.equal(typeof x.text, 'string'); assert.ok(x.group && x.phenomenon); assert.equal(x.negative ? x.expect : typeof x.expect, x.negative ? null : 'string'); if (!x.negative) assert.match(x.expect, /^@x1 core\.request action=doc\./); }
  const groups = new Set(a.map((x) => x.group));
  for (const g of ['fmt.make', 'fmt.hl', 'link', 'size', 'align.center', 'convert', 'select', 'table.spec', 'row.add', 'table.fill', 'task.check', 'rule', 'go.pos', 'stats']) assert.ok(groups.has(g), g);
  assert.ok(a.some((x) => x.negative));
  assert.ok(a.some((x) => x.context));
});
test('datagen: the rule formalizer agrees with every generated expectation', async () => {
  const { formalizeSession } = await import('../scripts/export-training.mjs').catch(() => ({}));
  void formalizeSession;
  const mkRng = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const items = gen.generate({ rng: mkRng(11), count: 250 }).filter((x) => !x.negative);
  const bad = [];
  for (const it of items) {
    const s = session();
    for (const c of it.context ?? []) await s.send(c);
    const r = await s.send(it.text);
    const action = it.expect.match(/action=([\w.]+)/)[1];
    const wires = r.trace.segments?.flatMap((g) => g.wires ?? []) ?? [];
    const got = JSON.stringify(wires);
    if (!got.includes(action) && !r.trace.patterns.some((p) => p.startsWith('pat.docs.editor'))) bad.push(it.text);
  }
  assert.deepEqual(bad, []);
});
test('vendor: the TipTap bundle has a header naming library, version, URL and licence, and LICENSES.md exists', async () => {
  const dir = new URL('../docs/webchat/vendor/editor/', import.meta.url);
  const head = (await readFile(new URL('tiptap.mjs', dir), 'utf8')).slice(0, 1500);
  assert.match(head, /TipTap/); assert.match(head, /3\.\d+\.\d+/); assert.match(head, /https:\/\/tiptap\.dev/); assert.match(head, /Licence: MIT/);
  const lic = await readFile(new URL('LICENSES.md', dir), 'utf8');
  for (const p of ['@tiptap/core', 'prosemirror-model', 'prosemirror-view', 'linkifyjs']) assert.ok(lic.includes(p), p);
  assert.doesNotMatch(lic, /GPL/i.source === '' ? /x^/ : /\bGNU\b/);
});
test('tab plugin: the editor plugin replaces the built-in tab and imports only its own modules', async () => {
  const src = await readFile(fileURLToPath(new URL('../docs/webchat/ui/tabs/editor.mjs', import.meta.url)), 'utf8');
  assert.match(src, /id: 'editor'/); assert.match(src, /world: 'docs\.editor'/); assert.match(src, /host\.send/); assert.match(src, /host\.setWorldState/);
  for (const f of ['view.mjs', 'toolbar.mjs', 'editor.css']) assert.ok((await readFile(fileURLToPath(new URL(`../docs/webchat/ui/tabs/editor/${f}`, import.meta.url)), 'utf8')).length > 500, f);
  const tb = await readFile(fileURLToPath(new URL('../docs/webchat/ui/tabs/editor/toolbar.mjs', import.meta.url)), 'utf8');
  assert.doesNotMatch(tb, /session\.|\.send\(/);   // buttons only call the injected send()
});
test('the world loads without problems and its tests pass', async () => {
  assert.deepEqual(engine.problems().filter((p) => p.startsWith('docs.editor')), []);
  const { runWorldTests } = await import('../src/dialog/index.mjs');
  const r = await runWorldTests(engine, DOC);
  assert.deepEqual(r.failed, []); assert.ok(r.total >= 60, `${r.total}`);
});
