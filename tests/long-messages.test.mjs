// Long messages (G7): families of failures found by training/eval/operational-long.jsonl, rules only (no models).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { splitAnswerList, selfCorrect } from '../src/formalizer/rules/expand.mjs';
import { tokenize } from '../src/formalizer/rules/index.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const session = (opts = {}) => engine.createSession({ language: 'en', ...opts });

test('tab switch mid-message: an explicit navigation later in the message beats the tab follow of an earlier segment', async () => {
  const s = session();
  await s.send('set the background to blue and draw a sun in the top right and then open the music tab');
  assert.equal(s.state()['ui.shell'].activeTab, 'music');
  const t = session();
  await t.send('open the music tab and make your eyes happy and then open the map and speak faster');
  assert.equal(t.state()['ui.shell'].activeTab, 'map');
});

test('tab follow still works when the explicit navigation comes first', async () => {
  const s = session();
  await s.send('open the map and then draw a red house');
  assert.equal(s.state()['ui.shell'].activeTab, 'draw');
});

test('answer lists: "no" between bare answers is an answer, not a correction', () => {
  const toks = tokenize('yes, no, maybe', 0, { keepFillers: true });
  assert.equal(selfCorrect(toks), null);
  assert.equal(splitAnswerList('yes no maybe idk'), 'yes, no, maybe, idk');
  assert.equal(splitAnswerList('yes no i dont know maybe'), 'yes, no, i dont know, maybe');
  assert.equal(splitAnswerList('yes'), 'yes');
  assert.equal(splitAnswerList('no thanks'), 'no thanks');
});

test('dispatcher pieces lose a trailing connective ("remove pears and also")', async () => {
  const { normalizePrediction } = await import('../src/dialog/dispatch-validate.mjs');
  const text = 'remove pears and also how many days are in a week';
  const pred = normalizePrediction({ text, segmentations: [{ score: 0, segments: [{ start: 0, end: 21, text: 'remove pears and also', worlds: ['data.charts'] }, { start: 22, end: text.length, text: 'how many days are in a week', worlds: ['kids.time'] }] }] });
  const [a, b] = pred.segmentations[0].segments;
  assert.equal(a.text, 'remove pears');
  assert.equal(a.end, 12);
  assert.equal(b.text, 'how many days are in a week');
  const one = normalizePrediction({ text: 'add and', segmentations: [{ score: 0, segments: [{ start: 0, end: 7, text: 'add and', worlds: ['x'] }] }] });
  assert.equal(one.segmentations[0].segments[0].text, 'add');
  const only = normalizePrediction({ text: 'and', segmentations: [{ score: 0, segments: [{ start: 0, end: 3, text: 'and', worlds: ['x'] }] }] });
  assert.equal(only.segmentations[0].segments[0].text, 'and');
});

test('charts: "make the bars green" colors the whole chart even when the labels are colors', async () => {
  const s = session();
  s.setWorldState('ui.shell', { activeTab: 'charts' });
  await s.send('make a chart: red 4, green 6, blue 10');
  const r = await s.send('make the bars green');
  assert.match(r.text, /chart is green/);
});

test('chess: several moves in one message are all played (the engine settles between segments, no host answer is awaited)', async () => {
  const s = session();
  await s.send("let's play chess, e2 to e4, then d2 to d4, and knight g1 to f3");
  const h = s.state()['games.chess'].history;
  assert.ok(h.includes('e4') && h.includes('d4') && h.includes('Nf3'), h.join(' '));
  assert.equal(h.filter((m, i) => i % 2 === 0).join(' '), 'e4 d4 Nf3');
});

test('chess: a lone move right after another message still waits for the host (old behaviour)', async () => {
  const s = session();
  await s.send('play chess');
  await s.send('e2 to e4');
  const r = await s.send('d2 to d4');
  assert.match(r.text, /still thinking/);
});

test('editor: a free-text slot does not swallow the next command ("and a list: milk, eggs")', async () => {
  const s = session();
  s.setWorldState('ui.shell', { activeTab: 'editor' });
  await s.send('add a heading Shopping and a paragraph hello world and a list: milk, eggs then turn the list into a numbered list');
  const blocks = s.state()['docs.editor'].blocks;
  assert.deepEqual(blocks.map((b) => b.kind), ['heading', 'paragraph', 'list']);
  assert.match(blocks[1].text, /^hello world\.?$/i);
  assert.equal(blocks[2].items.length, 2);
  assert.equal(blocks[2].style, 'numbered');
});

test('editor: the same kind of command stays one text ("salt and a pinch of pepper")', async () => {
  const s = session();
  s.setWorldState('ui.shell', { activeTab: 'editor' });
  await s.send('add a paragraph salt and a pinch of pepper');
  const blocks = s.state()['docs.editor'].blocks;
  assert.equal(blocks.length, 1);
  assert.match(blocks[0].text, /pinch of pepper/);
});

// ---- validator repairs (G7) ----------------------------------------------------------------------------------------------------
const { createDispatchValidator } = await import('../src/dialog/dispatch-validate.mjs');
const validator = createDispatchValidator({ engine });
const W = (...pairs) => pairs.map(([world, score]) => ({ world, score }));
const piece = (text, worlds, start) => ({ start, end: start + text.length, text, worlds });
const msg = (text, segments, context = {}) => ({ id: 't', text, context: { tab: 'hangman', recent_worlds: [], session: [], ...context }, segmentations: [{ score: -0.1, segments }] });

test('validator merge repair: "play hangman word" | "lion" is read as one clause', async () => {
  const t = 'play hangman word lion guess l';
  const r = await validator.validate(msg(t, [piece('play hangman word', W(['games.hangman', 0.99]), 0), piece('lion', W(['games.hangman', 0.99]), 18), piece('guess l', W(['games.hangman', 0.99]), 23)]));
  assert.equal(r.status, 'understood');
  assert.deepEqual(r.produced.map((p) => p.text), ['play hangman word lion', 'guess l']);
});

test('validator split repair: "new game center top left" is cut into the commands the rules read, each in its own world', async () => {
  const t = 'new game center top left';
  const r = await validator.validate(msg(t, [piece(t, W(['games.tictactoe', 0.99], ['ui.shell', 0.005], ['docs.editor', 0.001]), 0)], { tab: 'tictactoe' }));
  assert.equal(r.status, 'understood');
  assert.deepEqual(r.produced.map((p) => p.text), ['new game', 'center', 'top left']);
  assert.equal(r.produced[0].world, 'ui.shell');
});

test('validator: a valid reading of a less probable world beats an invalid reading of the more probable one', async () => {
  const r = await validator.validate(msg('new game', [piece('new game', W(['games.tictactoe', 0.999], ['ui.shell', 0.0005]), 0)], { tab: 'tictactoe' }));
  assert.equal(r.status, 'understood');
  assert.equal(r.produced[0].world, 'ui.shell');
});

test('validator: repairs never turn an unread message into a reading', async () => {
  const t = 'zork blorp flim';
  const r = await validator.validate(msg(t, [piece(t, W(['games.hangman', 0.9]), 0)]));
  assert.equal(r.status, 'not_understood');
});

test('draw: "resize it bigger" makes the last thing bigger', async () => {
  const s = session();
  s.setWorldState('ui.shell', { activeTab: 'draw' });
  await s.send('draw a red circle');
  const before = s.state()['art.draw'].objects[0].size;
  await s.send('resize it bigger');
  assert.ok(s.state()['art.draw'].objects[0].size > before);
});

test('guess: a list of answers is applied in order', async () => {
  for (const msg of ['yes, no, I don\'t know, and then maybe', 'yes no I don\'t know maybe']) {
    const s = session();
    await s.send('play guess');
    await s.send(msg);
    assert.deepEqual(s.state()['games.guess'].asked.map((a) => a.answer), ['yes', 'no', 'dontknow', 'maybe'], msg);
  }
});
