// Discourse layer, phase 2 (spec 11 sections 6-14): repairs, cancellation, references, degree, choices, list mode, repeat/explain,
// feedback, topic return. Unit tests for the recognizers and the shared vocabulary, then dialog sessions in several worlds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { classify, resolveReference, describeReferent, chooseOption } from '../src/dialog/meta.mjs';
import { lang, yesNo, ordinal, colour, degree, splitAdverb } from '../src/dialog/lang.mjs';
import { buildRecord, toJSONL } from '../docs/webchat/ui/phrase-log.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const fresh = () => engine.createSession({ language: 'en' });
const run = async (s, ...texts) => { let r; for (const t of texts) r = await s.send(t); return r; };
const objects = (s) => s.state('art.draw').objects;

test('shared vocabulary (lang.mjs): yes/no, ordinals, colours, degree', () => {
  assert.equal(yesNo('Yes please!'), 'yes');
  assert.equal(yesNo("nope"), 'no');
  assert.equal(yesNo('maybe'), null);
  assert.equal(ordinal('second'), 2);
  assert.equal(ordinal('last'), -1);
  assert.equal(ordinal('table'), null);
  assert.equal(colour(['dark', 'blue']), 'dark blue');
  assert.deepEqual(splitAdverb('a bit bigger'), { adv: 'a bit', strength: 1, rest: 'bigger' });
  assert.equal(degree('a bit more').type, 'more');
  assert.equal(degree('much bigger').comparative, 'bigger');
  assert.equal(degree('even smaller').adv, 'even');
  assert.deepEqual([degree('twice as big').type, degree('twice as big').factor], ['times', 2]);
  assert.deepEqual([degree('the same size as the house').type, degree('the same size as the house').ref], ['same', 'house']);
  assert.equal(degree('hello there'), null);
  assert.equal(lang.yesNo('ok'), 'yes');
});

test('classify names the conversational act and leaves ordinary sentences alone', () => {
  const intent = (t, ctx) => classify(t, ctx)?.intent ?? null;
  for (const t of ['never mind', 'Cancel that', 'forget it', 'Never mind!']) assert.equal(intent(t), 'cancel', t);
  for (const t of ['what?', 'say that again', 'Repeat', 'could you repeat that']) assert.equal(intent(t), 'repeat', t);
  for (const t of ['what did you do?', 'why?', 'why did you do that']) assert.equal(intent(t), 'explain', t);
  for (const t of ["that's wrong", 'not what I asked', 'No, that is not right']) assert.equal(intent(t), 'feedback', t);
  assert.deepEqual(classify('back to the chess game'), { intent: 'topic', target: 'chess game' });
  assert.equal(intent('where were we?'), 'topic');
  assert.equal(intent('continue'), 'topic');
  assert.deepEqual(classify("let's make a shopping list"), { intent: 'list.start', list: 'shopping' });
  assert.equal(intent('make a document from my shopping list'), null);
  assert.deepEqual(classify("that's all", { listMode: true }), { intent: 'list.end' });
  assert.deepEqual(classify('no, I meant the tree', { hasAction: true }), { intent: 'repair', how: 'replace', content: 'the tree' });
  assert.equal(classify('actually make it green').content, 'green');
  assert.equal(classify('not that one, the other one').how, 'retarget');
  // commands that merely contain correction words stay commands
  assert.equal(intent('make it green', { hasAction: true }), null);
  assert.equal(intent('no more grass pls', { hasAction: true }), null);
  assert.equal(intent('draw a house'), null);
});

const REFS = [
  { id: 'a', kind: 'house', noun: 'house', words: ['house', 'home'], attrs: { color: 'red', size: 240, x: 250, y: 400 } },
  { id: 'b', kind: 'house', noun: 'house', words: ['house', 'home'], attrs: { color: 'blue', size: 150, x: 750, y: 400 } },
  { id: 'c', kind: 'tree', noun: 'tree', words: ['tree'], attrs: { color: 'green', size: 170, x: 500, y: 450 }, salient: true },
  { id: 'd', kind: 'tree', noun: 'tree', words: ['tree'], attrs: { color: 'green', size: 90, x: 600, y: 450 } },
];
test('resolveReference: attributes, ordinals, size, position, other, quantifiers', () => {
  const ids = (p, o) => resolveReference(p, REFS, o)?.matches.map((r) => r.id);
  assert.deepEqual(ids('the red one'), ['a']);
  assert.deepEqual(ids('the blue house'), ['b']);
  assert.deepEqual(ids('the second one'), ['b']);
  assert.deepEqual(ids('the last one'), ['d']);
  assert.deepEqual(ids('the second tree'), ['d']);
  assert.deepEqual(ids('the big one'), ['a']);            // the biggest of everything
  assert.deepEqual(ids('the small tree'), ['d']);
  assert.deepEqual(ids('the left house'), ['a']);
  assert.deepEqual(ids('the other one', { prefer: 'tree' }), ['d']);
  assert.deepEqual(ids('both houses'), ['a', 'b']);
  assert.deepEqual(ids('all the trees'), ['c', 'd']);
  assert.deepEqual(ids('each tree'), ['c', 'd']);
  assert.equal(resolveReference('both', REFS).complete, false);   // four referents are not "both"
  assert.deepEqual(ids('the green one'), ['c', 'd']);       // ambiguous: two matches
  assert.deepEqual(ids('the purple one'), []);
  assert.equal(resolveReference('the weather', REFS), null);
  assert.equal(describeReferent(REFS[0], REFS), 'the red house');
  assert.equal(describeReferent(REFS[3], REFS), 'the last tree');
  assert.equal(describeReferent({ ...REFS[2], id: 'z' }, [REFS[2]]), 'the tree');
});
test('chooseOption accepts attribute, ordinal and quantifier answers', () => {
  const opts = [{ label: 'the red house' }, { label: 'the blue house' }];
  assert.equal(chooseOption('the red one', opts)[0].label, 'the red house');
  assert.equal(chooseOption('blue', opts)[0].label, 'the blue house');
  assert.equal(chooseOption('the first', opts)[0].label, 'the red house');
  assert.equal(chooseOption('the last one', opts)[0].label, 'the blue house');
  assert.equal(chooseOption('both', opts).length, 2);
  assert.equal(chooseOption('the green one', opts), null);
});

test('repair: "no, I meant the tree" takes the last action back and redoes it with the new argument (art.draw)', async () => {
  const s = fresh();
  await run(s, 'open the drawing tab', 'Draw a red house.', 'Draw a blue house.', 'Draw a tree.', 'Make the blue house bigger.');
  assert.equal(objects(s)[1].size, 312);
  const r = await s.send('No, I meant the tree.');
  assert.equal(objects(s)[1].size, 240, 'the house is back to its old size');
  assert.equal(objects(s)[2].size, 221, 'the tree grew instead');
  assert.equal(r.trace.discourse.resolved.kind, 'repair');
  assert.equal(r.trace.discourse.resolved.rewritten, 'Make the tree bigger');
  const o = await s.send('Not that one, the other one.');   // re-target: the blue house was last, now the red one
  assert.equal(o.trace.discourse.resolved.how, 'retarget');
  assert.equal(objects(s)[2].size, 170);
  const c = fresh();
  await run(c, 'open the drawing tab', 'Draw a red house.');
  await c.send('Actually make it blue.');
  assert.equal(objects(c).length, 1);
  assert.equal(objects(c)[0].color, 'blue');
});

test('repair works in the document editor too', async () => {
  const s = fresh();
  await run(s, 'open the editor tab', 'Write a paragraph: cats are nice.', 'Add a paragraph: dogs are fun.', 'Center the first paragraph.');
  const r = await s.send('No, the second one.');
  const blocks = s.state('docs.editor').blocks;
  assert.equal(blocks[0].align ?? null, null);
  assert.equal(blocks[1].align, 'center');
  assert.match(r.text, /centered the last paragraph/);
});

test('a correction without an earlier action is not invented', async () => {
  const s = fresh();
  const r = await s.send('No, I meant the tree.');
  assert.equal(r.trace.discourse.resolved, null);
});

test('cancellation clears the expectation and never undoes', async () => {
  const s = fresh();
  await run(s, 'open the drawing tab', 'Draw a cat.');
  const ask = await s.send('Draw');
  assert.equal(ask.trace.discourse.pending?.type, 'fill');
  const r = await s.send('never mind');
  assert.match(r.text, /never mind/i);
  assert.equal(r.trace.discourse.pending, null);
  assert.equal(r.trace.discourse.meta.dropped, 'fill');
  const late = await s.send('a dog');
  assert.equal(late.trace.discourse.resolved, null);
  assert.equal(objects(s).length, 1, 'cancel did not undo the cat and the dog was not drawn from the dropped question');
  await s.send('cancel that');
  assert.equal(objects(s)[0].kind, 'cat');
});

test('references: "the red one" resolves against the objects; a clear question follows several candidates', async () => {
  const s = fresh();
  await run(s, 'open the drawing tab', 'Draw a red house.', 'Draw a blue house.', 'Draw a tree.');
  const r = await s.send('Make the blue one bigger.');
  assert.equal(r.trace.discourse.resolved, null);
  assert.equal(r.segments[0].discourse.kind, 'reference');
  assert.equal(objects(s)[1].size, 312);
  await s.send('Make the tree bigger.');   // the house is no longer the thing in focus
  const q = await s.send('Make the house green.');
  assert.equal(q.text, 'Which one: the red house or the blue house?');
  assert.equal(q.trace.discourse.pending.type, 'choice');
  assert.equal(objects(s)[0].color, 'red');
  const a = await s.send('the red one');
  assert.equal(a.trace.discourse.consumed.type, 'choice');
  assert.equal(objects(s)[0].color, 'green');
  assert.equal(objects(s)[1].color, 'blue');
  // "the first" and "both" also answer the question
  await run(s, 'Draw a cat.');
  const q2 = await s.send('Delete the house.');
  assert.match(q2.text, /^Which one: /);
  await s.send('the last one');
  assert.equal(objects(s).filter((o) => o.kind === 'house').length, 1);
  assert.equal(objects(s).find((o) => o.kind === 'house').color, 'green');
  // quantifiers are the world's own: all, both, each
  await run(s, 'Draw a house.', 'Make both houses purple.');
  assert.deepEqual(objects(s).filter((o) => o.kind === 'house').map((o) => o.color), ['purple', 'purple']);
});

test('a choice expectation lives one turn and an unrelated reply is routed normally', async () => {
  const s = fresh();
  await run(s, 'open the drawing tab', 'Draw a red house.', 'Draw a blue house.', 'Draw a tree.');
  await s.send('Make the house green.');
  const r = await s.send('Draw a cat.');
  assert.equal(objects(s).at(-1).kind, 'cat');
  assert.equal(r.trace.discourse.consumed.type, 'choice');
});

test('ordinal references in the editor: "the last one" is the last block', async () => {
  const s = fresh();
  await run(s, 'open the editor tab', 'Write a paragraph: cats are nice.', 'Add a paragraph: dogs are fun.', 'Add a heading: Pets');
  const r = await s.send('Make the last one italic.');
  assert.equal(r.segments[0].discourse.kind, 'reference');
  assert.match(r.text, /heading is now italic/);
});

test('degree and comparatives continue the last frame', async () => {
  const s = fresh();
  await run(s, 'open the drawing tab', 'Draw a house.', 'Draw a tree.', 'Make the house bigger.');
  const size = () => objects(s)[0].size;
  assert.equal(size(), 312);
  await s.send('a bit more');
  assert.equal(size(), 359);
  const much = await s.send('much bigger');
  assert.equal(size(), 610);
  assert.equal(much.trace.discourse.resolved.kind, 'degree');
  await s.send('even smaller');
  assert.equal(size(), 469);
  await s.send('twice as big');
  assert.equal(size(), 938);
  const same = await s.send('the same size as the tree');
  assert.equal(same.trace.discourse.resolved.type, 'same');
  assert.equal(size(), objects(s)[1].size);
  const w = await s.send('Make the tree the same size as the house.');   // the world's own pattern
  assert.equal(w.trace.patterns[0], 'pat.art.draw.samesize');
  assert.equal(objects(s)[1].size, size());
  assert.equal((await fresh().send('a bit more')).trace.discourse.resolved, null, 'no frame, nothing invented');
});

test('list-entry mode: "let\'s make a shopping list", items, "that\'s all"', async () => {
  const s = fresh();
  const start = await s.send("Let's make a shopping list");
  assert.match(start.text, /shopping list/);
  assert.equal(s.discourse.list.list, 'shopping');
  for (const item of ['milk', 'eggs', 'bread and butter']) {
    const r = await s.send(item);
    assert.equal(r.trace.discourse.meta.kind, 'list');
    assert.match(r.text, /added/);
  }
  const end = await s.send("that's all");
  assert.match(end.text, /3 entries/);
  assert.match(end.text, /milk, eggs, bread and butter/);
  assert.equal(s.discourse.list, null);
  assert.equal((await s.send('cheese')).trace.discourse.meta, null, 'the list mode is over');
  const c = fresh();
  await run(c, "let's make a homework list", 'maths');
  const stop = await c.send('never mind');
  assert.equal(c.discourse.list, null);
  assert.match(stop.text, /stopped/);
  assert.deepEqual(c.state('kids.tasks').lists.homework.map((i) => i.text), ['maths']);
  const q = fresh();
  await q.send("let's make a shopping list");
  assert.equal((await q.send('what time is it?')).trace.discourse.meta, null, 'a question ends the mode');
  assert.equal(q.discourse.list, null);
});

test('repeat and explain', async () => {
  const s = fresh();
  assert.equal((await s.send('what?')).trace.discourse.meta, null, 'nothing to repeat yet');
  await run(s, 'open the drawing tab');
  const first = await s.send('Draw a cat.');
  const rep = await s.send('say that again');
  assert.equal(rep.text, first.text);
  assert.equal((await s.send('what?')).text, first.text, 'repeating does not replace the answer');
  const why = await s.send('what did you do?');
  assert.match(why.text, /You asked me to draw a cat, so I did it/);
  assert.doesNotMatch(why.text, /pat\.|op\.|rule/, 'no internal ids in the user-facing explanation');
  assert.match(why.trace.discourse.meta.pattern, /^pat\.art\.draw/, 'technical detail stays in the trace');
  assert.equal(why.trace.discourse.meta.kind, 'explain');
  assert.match((await s.send('why?')).text, /draw a cat/);
});

test('feedback: apology, undo offer, trace and phrase-log mark', async () => {
  const s = fresh();
  await run(s, 'open the drawing tab', 'Draw a cat.');
  const r = await s.send("That's wrong");
  assert.match(r.text, /sorry/);
  assert.match(r.text, /undo/);
  assert.equal(r.feedback, 'negative');
  assert.equal(r.trace.feedback, 'negative');
  assert.equal(r.trace.discourse.feedback, 'negative');
  assert.equal(objects(s).length, 1, 'nothing is undone without a yes');
  const rec = buildRecord({ text: "That's wrong", reply: r });
  assert.equal(rec.feedback, 'negative');
  assert.match(toJSONL([{ ...rec, source: 'human' }]), /"feedback":"negative"/);
  assert.equal(buildRecord({ text: 'hi', reply: await s.send('Draw a dog.') }).feedback, null);
  await s.send('Draw a bird.');
  await s.send('not what I asked');
  const y = await s.send('yes');
  assert.match(y.text, /undid/);
  assert.equal(objects(s).some((o) => o.kind === 'bird'), false);
  assert.equal(objects(s).some((o) => o.kind === 'dog'), true);
  const n = fresh();
  await run(n, 'open the drawing tab', 'Draw a cat.', 'that is wrong');
  assert.match((await n.send('no')).text, /leave it/);
  assert.equal(objects(n).length, 1);
  assert.equal((await fresh().send("that's wrong")).feedback, undefined, 'nothing to be wrong about yet');
});

test('topic return reopens the last world and summarises it', async () => {
  const s = fresh();
  await run(s, 'open the drawing tab', 'Draw a red house.', 'open the chess tab', 'e4');
  const r = await s.send('back to the drawing');
  assert.match(r.text, /^Back to Drawing board\. In your picture I can see a red house/);
  assert.equal(r.state['ui.shell'].activeTab, 'draw', 'the tab is reopened');
  const c = await s.send('back to the chess game');
  assert.match(c.text, /^Back to Chess\. The chess game has 1 move/);
  assert.equal(c.state['ui.shell'].activeTab, 'chess');
  const w = await s.send('where were we?');
  assert.match(w.text, /^Back to Chess/);
  await s.send('open the drawing tab');
  await s.send('Draw a sun.');
  assert.match((await s.send('continue')).text, /sun/);
  assert.equal((await fresh().send('back to the beginning')).trace.discourse.meta, null, 'an unknown target is not a topic');
  const ch = fresh();
  await run(ch, 'open the charts tab', 'New chart');
  assert.equal((await ch.send('Go back to the first chart')).trace.discourse.meta, null, 'extra words: the world reads it');
});

test('kids.arith: "And Ana?" answers what Ana received when her start is unknown', async () => {
  const s = fresh();
  await s.send('Tom has 5 apples. He gives 2 to Ana. How many does he have now?');
  const r = await s.send('And Ana?');
  assert.equal(r.text, "Ana got 2 apples from Tom. I don't know how many Ana had before.");
  assert.equal(r.trace.discourse.resolved.kind, 'ellipsis');
  const k = fresh();
  await k.send('Ana has 1 apple. Tom has 5 apples. He gives 2 to Ana. How many does he have now?');
  assert.equal((await k.send('And Ana?')).text, 'Ana has 3 apples.');
});

test('a bare yes/no with nothing pending and no game is answered neutrally, not by the guessing game', async () => {
  for (const t of ['yes', 'No', 'yeah!', 'nope.']) {
    const r = await fresh().send(t);
    assert.match(r.text, /^(Yes|No) to what\? You can ask me/, t);
    assert.doesNotMatch(r.text, /twenty questions/, t);
  }
});

test('games.guess keeps its yes/no while the game is on, and a pending offer still takes the answer', async () => {
  const s = fresh();
  await s.send('guess my animal');
  const r = await s.send('yes');
  assert.doesNotMatch(r.text, /to what\?/);
  assert.match(r.text, /\?/);   // the game goes on with its next question or guess
  const idle = fresh();
  idle.setWorldState('ui.shell', { activeTab: 'guess' });   // on the game's tab without a running game: the game explains itself
  assert.match((await idle.send('yes')).text, /twenty questions/);
  const f = fresh();
  await f.send('draw a red circle');
  await f.send("that's wrong");   // feedback offers an undo
  assert.match((await f.send('yes')).text, /undid/i);
});
