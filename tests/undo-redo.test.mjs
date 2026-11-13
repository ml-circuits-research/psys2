// UNDO-REDO (spec 15, "Undo and redo: one step per request"): redo in both reasoners, one undo step is one request of the user (a message with several
// requests is several steps, undone last first; "undo the whole message" takes them all), "undo the X" takes back a named earlier step when the later steps
// do not rest on it, and everything holds across tab switches. Replies and states are the same in `matrix` and `ops` wherever both have the behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';

const mk = (reasoner) => createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner } });
const engines = { matrix: await mk('matrix'), ops: await mk('ops') };
const run = async (reasoner, texts) => { const s = engines[reasoner].createSession({ language: 'en' }); const out = []; for (const t of texts) out.push((await s.send(t)).text); return { s, out }; };
const sceneOf = (s) => (s.isession.state['art.draw']?.objects ?? []).map((o) => o.kind).join(',');
const both = (name, fn) => { for (const r of ['matrix', 'ops']) test(`${name} [${r}]`, () => fn(r)); };

both('redo puts back what undo took out and says what it was; a new action clears the redo list', async (r) => {
  const { s, out } = await run(r, ['open the drawing tab', 'draw a house', 'draw a sun', 'undo', 'redo', 'undo', 'undo', 'redo', 'redo', 'redo']);
  assert.match(out[3], /undid it \(drew a yellow sun\)/);
  assert.match(out[4], /did it again \(drew a yellow sun\)/);
  assert.match(out[7], /did it again \(drew a yellow house\)/);
  assert.match(out[8], /did it again \(drew a yellow sun\)/);
  assert.match(out[9], /nothing to redo/i);
  assert.equal(sceneOf(s), 'house,sun');
  const t = await run(r, ['open the drawing tab', 'draw a house', 'undo', 'draw a cat', 'redo']);
  assert.match(t.out[4], /nothing to redo/i, 'a new action after an undo makes it final');
  assert.equal(sceneOf(t.s), 'cat');
});

both('redo with nothing undone says so', async (r) => {
  const { out } = await run(r, ['open the drawing tab', 'redo']);
  assert.match(out[1], /nothing to redo/i);
});

both('a game: "undo my move" then "redo" plays it again, and the reply names the move', async (r) => {
  const { s, out } = await run(r, ['play chess', 'e2 to e4', 'undo my move', 'redo', 'undo my move', 'redo', 'redo']);
  assert.match(out[3], /did it again: "e2 to e4"/);
  assert.match(out[5], /did it again: "e2 to e4"/);
  assert.match(out[6], /nothing to redo/i);
  assert.equal(s.isession.state['games.chess'].history.length >= 1, true, 'the move is back');
});

both('redo through a tab switch: what was undone in the drawing comes back after visiting another tab', async (r) => {
  const { s, out } = await run(r, ['open the drawing tab', 'draw a house', 'undo', 'open the music tab', 'redo']);
  assert.match(out[4], /did it again/i);
  assert.equal(sceneOf(s), 'house');
});

both('a message with two requests is two steps: undo takes back the last request and says which, then the other', async (r) => {
  const { s, out } = await run(r, ['open the drawing tab', 'draw a house', 'draw a sky and a sun', 'undo']);
  assert.match(out[3], /drew a yellow sun/);
  assert.equal(sceneOf(s), 'house', 'the sun is gone, the sky is the other request of the message');
  assert.ok(s.isession.state['art.draw'].sky, 'the sky stays');
  const u = await s.send('undo');
  assert.match(u.text, /sky/);
  assert.ok(!s.isession.state['art.draw'].sky);
  assert.equal(sceneOf(s), 'house');
});

both('one request that makes three things is one step', async (r) => {
  const { s, out } = await run(r, ['open the drawing tab', 'draw a house', 'draw 3 trees', 'undo']);
  assert.match(out[3], /undid it/);
  assert.equal(sceneOf(s), 'house');
});

both('"undo the whole message" takes back every request of the last message, and one redo puts them back', async (r) => {
  const { s, out } = await run(r, ['open the drawing tab', 'draw a house', 'draw a sky and a sun', 'undo the whole message']);
  assert.match(out[3], /whole message/i);
  assert.equal(sceneOf(s), 'house');
  assert.ok(!s.isession.state['art.draw'].sky);
  const back = await s.send('redo');
  assert.match(back.text, /did it again/i);
  assert.equal(sceneOf(s), 'house,sun');
  assert.ok(s.isession.state['art.draw'].sky);
  const again = await s.send('undo all of that');
  assert.match(again.text, /whole message/i);
});

test('two messages are never one step (matrix): the second message is undone alone, then the first', async () => {
  const { s, out } = await run('matrix', ['Ana buys a ball', 'Ana buys a pen', 'undo', 'undo']);
  assert.match(out[2], /pen/);
  assert.doesNotMatch(out[2], /ball/);
  assert.match(out[3], /ball/);
  assert.equal(s.isession.rs.turns.length, 0);
});

test('a message with two statements is two steps in the timeline (matrix)', async () => {
  const { s, out } = await run('matrix', ['Ana buys a ball and Ana buys a pen', 'undo']);
  assert.match(out[1], /pen/);
  assert.doesNotMatch(out[1], /ball/);
  assert.equal(s.isession.rs.turns.length, 1, 'the ball is still a step');
  const w = await s.send('undo the whole message');
  assert.match(w.text, /took that back|whole message/i);
});

both('"undo the house" takes back a named earlier step alone when the later ones do not touch it', async (r) => {
  const { s, out } = await run(r, ['open the drawing tab', 'draw a house', 'open the music tab', 'make it faster', 'undo the house']);
  assert.match(out[4], /took back "draw a house"; what you did after it stays/);
  assert.equal(sceneOf(s), '', 'the house is gone');
  assert.equal(s.isession.state['media.music'].tempo, 125, 'the tempo stays');
  const back = await s.send('redo');
  assert.match(back.text, /did it again/i);
  assert.equal(sceneOf(s), 'house');
  assert.equal(s.isession.state['media.music'].tempo, 125);
});

both('"undo the house" when a later step rests on the same picture asks, and "yes" takes both back, "no" leaves everything', async (r) => {
  const a = await run(r, ['open the drawing tab', 'draw a house', 'draw a tree', 'undo the house']);
  assert.match(a.out[3], /would also have to take back "draw a tree"/);
  const no = await a.s.send('no');
  assert.match(no.text, /leave it as it is/i);
  assert.equal(sceneOf(a.s), 'house,tree');
  const b = await run(r, ['open the drawing tab', 'draw a house', 'draw a tree', 'undo the house', 'yes']);
  assert.match(b.out[4], /took back "draw a house" and what came after it/);
  assert.equal(sceneOf(b.s), '');
  const back = await b.s.send('redo');
  assert.match(back.text, /did it again/i);
  assert.equal(sceneOf(b.s), 'house,tree');
});

both('"undo the unicorn" names nothing that was done: the sentence is left to the worlds', async (r) => {
  const { out } = await run(r, ['open the drawing tab', 'draw a house', 'undo the unicorn']);
  assert.doesNotMatch(out[2], /took back|would also/);
});

test('matrix: "undo" in a tab takes back the newest request, not the last request of that tab together with the ones of other worlds', async () => {
  const { s, out } = await run('matrix', ['open the drawing tab', 'draw a house', 'open the music tab', 'make it faster', 'what is in the picture?', 'undo']);
  assert.match(out[5], /tempo is back to 100/);
  assert.equal(sceneOf(s), 'house', 'the house is a request of its own: it stays');
  assert.equal(s.isession.state['media.music'].tempo, 100);
});

test('the timeline entries of a message share its turn and carry the words of each request', async () => {
  // a world on the library (the shop): the drawing keeps its own history in both reasoners, its two requests are two entries of that history (tests above)
  const { s } = await run('matrix', ['Ana buys a ball and Ana buys a pen']);
  const last = s.isession.rs.lastMessage();
  assert.equal(last.length, 2);
  assert.deepEqual(last.map((t) => t.said).reverse(), ['Ana buys a ball', 'Ana buys a pen']);
  assert.equal(new Set(last.map((t) => t.turn)).size, 1);
});

test('the record of a restart keeps one entry per request (RESTORE-1 with UNDO-REDO)', async () => {
  const a = engines.matrix.createSession({ language: 'en' });
  for (const t of ['open the drawing tab', 'draw a sky and a sun']) await a.send(t);
  const mem = JSON.parse(JSON.stringify(a.memoryJSON()));
  const b = engines.matrix.createSession({ language: 'en' });
  b.isession.state = JSON.parse(JSON.stringify(a.isession.state));
  b._msg = a._msg;
  assert.equal(b.restoreMemory(mem), true);
  assert.equal(b.isession.rs.turns.length, a.isession.rs.turns.length);
  const u = await b.send('undo');
  assert.match(u.text, /drew a yellow sun/);
  assert.ok(b.isession.state['art.draw'].sky, 'the sky is the other request');
});
