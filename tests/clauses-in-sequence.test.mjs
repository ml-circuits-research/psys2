import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';

// Spec 03 "Clauses in sequence": a clause after the first is read over the state the clauses before it leave.
const engine = await createEngine({ loader: createFsLoader(DEFAULT_ROOT) });
const session = (tab) => {
  const s = engine.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { activeTab: tab ?? 'chat' });
  return s;
};

test('"add a list and make it numbered": the pronoun is the list the first clause makes, in one turn', async () => {
  const s = session();
  await s.send('add a list and make it numbered');
  const blocks = s.state('docs.editor').blocks;
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind, 'list');
  assert.equal(blocks[0].style, 'numbered');
  assert.deepEqual(blocks[0].items, []);   // the second clause was not swallowed as the text of the list
});

test('undo follows the established invariant: each clause is an act of the world, undone one by one, back to the empty document', async () => {
  const s = session();
  await s.send('add a list and make it numbered');
  await s.send('undo');
  assert.equal(s.state('docs.editor').blocks[0].style, 'bullet');
  await s.send('undo');
  assert.equal(s.state('docs.editor').blocks.length, 0);
});

test('"create a list then make it a numbered list"', async () => {
  const s = session();
  await s.send('create a list then make it a numbered list');
  assert.equal(s.state('docs.editor').blocks[0].style, 'numbered');
});

test('other worlds: a thing made in the first clause is named by "it" in the second', async () => {
  const draw = session('draw');
  await draw.send('draw a house and colour it red');
  const things = JSON.stringify(draw.state('art.draw'));
  assert.match(things, /house/);
  assert.match(things, /red/);
  const charts = session('charts');
  await charts.send('add a chart and call it sales');
  assert.match(JSON.stringify(charts.state('data.charts')), /Sales/);
});

test('all or nothing: a clause that cannot be read leaves the sentence as it was read before', async () => {
  const s = session();
  const r = await s.send('add a list and make it flibbertigibbet');
  // not read as a chain: no list is made numbered, and the document does not hold a half-made chain
  assert.notEqual(s.state('docs.editor').blocks[0]?.style, 'numbered');
  assert.ok(r.text);
});

test('a plain formalizer call (no session projection) reads the clauses as before', async () => {
  const { formalize } = await import('../src/formalizer/index.mjs');
  const s = session();
  const out = await formalize('add a list and make it numbered', { worlds: engine.set, session: s.isession, context: { ...s.context(), project: undefined } });
  assert.ok(Array.isArray(out.segments) && out.segments.length >= 1);
});

test('diagram.sketch: "it" is the shape the first clause made (the reader gets the last shapes as names), in one turn and across turns', async () => {
  const one = async (...texts) => { const s = session('diagram'); for (const t of texts) await s.send(t); return s.state('diagram.sketch').shapes; };
  assert.equal((await one('add a circle and colour it blue'))[0].color, 'blue');
  assert.equal((await one('add a circle then make it red'))[0].color, 'red');
  assert.equal((await one('add a circle', 'make it green'))[0].color, 'green');
  const named = await one('add a circle called B then make it red');
  assert.equal(named[0].name, 'B');
  assert.equal(named[0].color, 'red');
});

test('seating: a pronoun in the second clause names the table the first made', async () => {
  const s = session('seating');
  await s.send('add a table and make it square');
  assert.equal(s.state('plan.seating').items[0].attrs.shape, 'square');
});
