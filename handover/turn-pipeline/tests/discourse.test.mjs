// Discourse layer (spec 11, ADR-006): ellipsis, pending clarifications, tab bias, verb distribution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { splitFragment } from '../src/dialog/discourse.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const say = async (s, ...texts) => { let r; for (const t of texts) r = await s.send(t); return r; };

test('splitFragment: markers, trailing markers, repeats, bare fragments', () => {
  assert.deepEqual(splitFragment('And from Berlin?').content, ['from', 'Berlin']);
  assert.equal(splitFragment('What about Madrid?').marker, 'what about');
  assert.equal(splitFragment('the same for the tree').content.join(' '), 'the tree');
  assert.equal(splitFragment('and the eyes too').content.join(' '), 'the eyes');
  assert.equal(splitFragment('Now bigger').content.join(' '), 'bigger');
  assert.equal(splitFragment('again').kind, 'repeat');
  assert.equal(splitFragment('bigger').kind, 'bare');
});

test('ellipsis after a question: place and agent', async () => {
  const s = engine.createSession({ language: 'en' });
  await s.send('How far is Paris from Rome?');
  const r = await s.send('And from Berlin?');
  assert.match(r.text, /Paris and Berlin/);
  assert.equal(r.trace.discourse.resolved.kind, 'ellipsis');
  assert.equal(r.trace.discourse.resolved.of, 'How far is Paris from Rome?');
  assert.equal(r.segments[0].discourse.rewritten, 'How far is Paris from Berlin?');
  assert.match((await s.send('what about Madrid?')).text, /Paris and Madrid/);

  const t = engine.createSession({ language: 'en' });
  await say(t, 'Tom has 5 apples.', 'He gives 2 to Ana.', 'How many does he have now?');
  const q = await t.send('And Ana?');
  assert.equal(q.trace.discourse.resolved.rewritten, 'How many does Ana have now?');
  assert.doesNotMatch(q.text, /did not understand/);
});

test('ellipsis after a command on the drawing tab: now bigger, again, the same for X, X too', async () => {
  const s = engine.createSession({ language: 'en' });
  await say(s, 'open the drawing tab', 'Draw a house', 'Draw a tree', 'Make the house red');
  assert.match((await s.send('the same for the tree')).text, /tree is red/);
  const big = await s.send('Now bigger');
  assert.equal(big.trace.patterns[0], 'pat.art.draw.grow');
  assert.match(big.text, /tree bigger/);
  const again = await s.send('again');
  assert.equal(again.segments[0].discourse.how, 'repeat');
  assert.match((await s.send('and the house too')).text, /house bigger/);
  assert.equal(s.state('art.draw').objects.find((o) => o.kind === 'house').color, 'red');
});

test('a fragment without a frame is not invented', async () => {
  const s = engine.createSession({ language: 'en' });
  const r = await s.send('And from Berlin?');
  assert.equal(r.trace.discourse.resolved, null);
});

test('incomplete command: ask, then the next reply completes it (draw, map, music)', async () => {
  const s = engine.createSession({ language: 'en' });
  await s.send('open the drawing tab');
  const ask = await s.send('Draw');
  assert.equal(ask.text, 'What should I draw?');
  assert.equal(ask.trace.discourse.pending.type, 'fill');
  assert.equal(ask.trace.discourse.pending.world, 'art.draw');
  const done = await s.send('a cat');
  assert.equal(done.trace.discourse.resolved.kind, 'fill');
  assert.equal(done.trace.discourse.resolved.rewritten, 'Draw a cat');
  assert.equal(s.state('art.draw').objects.at(-1).kind, 'cat');

  const m = engine.createSession({ language: 'en' });
  await m.send('open the map tab');
  assert.equal((await m.send('Show me')).text, 'Which place should I show?');
  assert.match((await m.send('Paris')).text, /Paris/);

  const u = engine.createSession({ language: 'en' });
  await u.send('open the map tab');   // off the Music tab a bare play asks (on it, it plays: RP3)
  assert.match((await u.send('Play')).text, /What should I play/);
  assert.match((await u.send('a C major chord')).text, /C major chord/);
});

test('a pending expectation expires after one turn and yields to a full command', async () => {
  const s = engine.createSession({ language: 'en' });
  await say(s, 'open the drawing tab', 'Draw');
  const full = await s.send('Draw a dog');
  assert.equal(s.state('art.draw').objects.at(-1).kind, 'dog');
  assert.equal(full.trace.discourse.consumed.type, 'fill');
  await say(s, 'Draw', 'how are you');
  const late = await s.send('a cat');                 // expired: no longer completes "Draw"
  assert.equal(late.trace.discourse.resolved, null);
  assert.notEqual(s.state('art.draw').objects.at(-1).kind, 'cat');
});

test('bare "Draw": the drawing tab keeps it, elsewhere it stays the chess draw offer', async () => {
  const a = engine.createSession({ language: 'en' });
  await a.send('open the drawing tab');
  assert.equal((await a.send('Draw')).segments[0].match.worldId, 'art.draw');
  const b = engine.createSession({ language: 'en' });
  assert.equal((await b.send('Draw')).segments[0].match.worldId, 'games.chess');
});

test('coordination distributes the verb over a noun phrase another world would claim', async () => {
  const s = engine.createSession({ language: 'en' });
  await s.send('open the robot tab');
  const r = await s.send('Give yourself round glasses and a beard');
  assert.ok(r.segments.every((x) => x.match.worldId === 'ui.avatar'));
  const face = s.state('ui.avatar').face;
  assert.ok(face.slots.glasses !== 'none' && face.slots.beard !== 'none', 'both parts were put on');
});
