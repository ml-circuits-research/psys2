// Operational cases of the editor family "ED" (worker-tasks 2026-11-09): structure, writing, editing and reading of the document editor by
// typed or dictated commands. Every case runs on the editor tab; `setup` messages build the document first. Expectations are the correct
// outcome by judgment, not recorded from output.
const TAB = { tab: 'editor', fam: ['editor-ed'] };
const P3 = ['add a paragraph One', 'add a paragraph Two', 'add a paragraph Three'];

export default function (b) {
  const e = (msg, expect, o = {}) => b.add('docs.editor', msg, expect, { ...TAB, ...o, fam: [...TAB.fam, ...(o.fam ?? [])] });
  // new line, new paragraph, page break
  e('new line', { state: ['blocks.length=1', 'blocks.0.kind=paragraph', 'blocks.0.text='] });
  e('new paragraph', { state: ['blocks.length=1', 'blocks.0.text='] });
  e('start a new paragraph', { state: ['blocks.length=1', 'blocks.0.text='] });
  e('add a blank line', { state: ['blocks.length=1', 'blocks.0.text='] });
  e('insert a page break', { state: ['blocks.0.kind=rule', 'blocks.0.page=true'] });
  e('start a new page', { state: ['blocks.0.kind=rule', 'blocks.0.page=true'] });
  e('insert a new line after the title', { state: ['blocks.length=2', 'blocks.1.text='] }, { setup: ['write a title My Story'] });
  // chapters, sections, headings with or without a title
  e('add a new chapter called The Forest', { state: ['blocks.0.kind=heading', 'blocks.0.text==Chapter 1: The Forest', 'blocks.0.level=1'] });
  e('start a new chapter called The Cave', { state: ['blocks.1.text==Chapter 2: The Cave'] }, { setup: ['add a new chapter called The Forest'] });
  e('start a new chapter', { state: ['blocks.0.kind=heading', 'blocks.0.text==Chapter 1'] });
  e('new chapter The Return', { state: ['blocks.0.text==Chapter 1: The Return'] });
  e('chapter 3: The End', { state: ['blocks.0.text==Chapter 3: The End'] });
  e('add a new section called Plans', { state: ['blocks.0.text==Section 1: Plans', 'blocks.0.level=2'] });
  e('add a subheading', { state: ['blocks.0.kind=heading', 'blocks.0.level=3'] });
  e('add a subheading Details', { state: ['blocks.0.text==Details', 'blocks.0.level=3'] });
  e('write a title My Story', { state: ['title==My Story', 'blocks.0.text==My Story'] });
  // lists
  e('add a bullet: milk', { state: ['blocks.0.kind=list', 'blocks.0.items.0=milk'] });
  e('add a bullet: eggs', { state: ['blocks.0.items.length=2'] }, { setup: ['add a bullet: milk'] });
  e('add a numbered item: wash the dishes', { state: ['blocks.0.style=numbered', 'blocks.0.items.0~wash the dishes'] });
  e('add a numbered list', { state: ['blocks.0.style=numbered'] });
  // writing: write / type / add the text / continue with, long text and quotes
  e('write Once upon a time there was a fox', { state: ['blocks.0.text==Once upon a time there was a fox'] });
  e('type the fox lived in a forest', { state: ['blocks.0.text==The fox lived in a forest'] });
  e('add the text and then it rained', { state: ['blocks.0.text==And then it rained'] });
  e('continue with and then it rained', { state: ['blocks.0.text~and then it rained', 'blocks.length=1'] }, { setup: ['write The fox ran home'] });
  e('write It was cold. The fox was hungry. It rained all night. Nobody came.', { state: ['blocks.0.text~Nobody came', 'blocks.length=1'] });
  e('write "Where am I?" said the fox. "Lost," said the owl.', { state: ['blocks.0.text~said the owl', 'blocks.length=1'] });
  e('write a long story: it was a bright cold day in april and the clocks were striking thirteen. winston smith slipped quickly through the glass doors of victory mansions.', { state: ['blocks.0.text~victory mansions', 'blocks.length=1'] });
  e('write The end', { state: ['blocks.0.text==The end'] }, { setup: ['new line'] });
  // positions: under / after / before the title, a chapter, the second paragraph
  e('add a paragraph Dedicated to Mia under the title', { state: ['blocks.1.text~Mia'] }, { setup: ['write a title Tale', ...P3] });
  e('add a paragraph Dedicated to Mia after the title', { state: ['blocks.1.text~Mia'] }, { setup: ['write a title Tale', ...P3] });
  e('insert a heading Prologue before the first paragraph', { state: ['blocks.1.text==Prologue'] }, { setup: ['write a title Tale', ...P3] });
  e('insert a heading Middle after the second paragraph', { state: ['blocks.2.text==Middle'] }, { setup: P3 });
  e('add a new line before the second paragraph', { state: ['blocks.1.text=', 'blocks.length=4'] }, { setup: P3 });
  e('add a paragraph Hello under chapter 1', { state: ['blocks.1.text~Hello'] }, { setup: ['add a new chapter called A', 'add a new chapter called B'] });
  e('insert a page break after chapter 1', { state: ['blocks.2.page=true'] }, { setup: ['add a new chapter called A', 'add a paragraph Body', 'add a new chapter called B'] });
  // editing: marks, delete, move, rename
  const TXT = ['add a paragraph The fox ran home. The dog slept. It was late'];
  e('make the last sentence bold', { state: ['blocks.0.marks[type=bold].type=bold'] }, { setup: TXT });
  e('make the last word italic', { state: ['blocks.0.marks[type=italic].type=italic'] }, { setup: TXT });
  e('underline the last paragraph', { state: ['blocks.0.marks[type=underline].type=underline'] }, { setup: TXT });
  e('make the last paragraph bold', { state: ['blocks.1.marks[type=bold].type=bold'] }, { setup: [...TXT, 'add a paragraph The end'] });
  e('make the selection italic', { state: ['blocks.0.marks[type=italic].type=italic'] }, { setup: [...TXT, 'select the first paragraph'] });
  e('delete the last word', { state: ['blocks.0.text=The fox ran home. The dog slept. It was.'] }, { setup: TXT });
  e('delete the last sentence', { state: ['blocks.0.text=The fox ran home. The dog slept.'] }, { setup: TXT });
  e('delete the last paragraph', { state: ['blocks.length=2'] }, { setup: P3 });
  e('move the second paragraph up', { state: ['blocks.0.text~Two'] }, { setup: P3 });
  e('move the first paragraph down', { state: ['blocks.1.text~One'] }, { setup: P3 });
  e('rename the document to The Fox', { state: ['title==The Fox'] });
  // reading
  e('read the document', { answer: ['Two'], effects: ['speech.say'] }, { setup: P3 });
  e('read chapter 2', { answer: ['Night fell'], effects: ['speech.say'] }, { setup: ['add a new chapter called A', 'add a paragraph Day broke', 'add a new chapter called B', 'add a paragraph Night fell'] });
  e('read the last paragraph', { answer: ['Three'], effects: ['speech.say'] }, { setup: P3 });
  e('read the second paragraph', { answer: ['Two'] }, { setup: P3 });
  // dictation commands
  e('new line', { state: ['blocks.0.text~fox', 'blocks.length=1'] }, { setup: ['start dictation', 'the fox ran'] });
  e('the fox ate', { state: ['blocks.1.text~fox ate'] }, { setup: ['start dictation', 'the fox ran', 'new line'] });
  e('new paragraph', { answer: ['New paragraph'] }, { setup: ['start dictation', 'the fox ran'] });
  e('new chapter', { answer: ['New chapter'], state: ['blocks.1.kind=heading'] }, { setup: ['start dictation', 'the fox ran'] });
  e('new chapter called The Cave', { state: ['blocks.1.text==Chapter 1: The Cave'] }, { setup: ['start dictation', 'the fox ran'] });
  e('page break', { answer: ['Page break'], state: ['blocks.1.page=true'] }, { setup: ['start dictation', 'the fox ran'] });
}
