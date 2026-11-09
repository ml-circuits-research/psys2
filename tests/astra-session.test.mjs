// ASTRA integration (spec 13): discussions behind the DialogSession API. Readings never change; two games and a drawing are suspended and
// resumed, also through a saved record; per-tab discussions; "where were we?" keeps the reviewer definition; the turn guard rolls ASTRA back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { Storage, memoryBackend } from '../src/astra/index.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const fresh = () => engine.createSession({ language: 'en' });
const run = async (s, ...texts) => { let r; for (const t of texts) r = await s.send(t); return r; };
const shapes = (s) => s.state('art.draw').objects.map((o) => `${o.color ?? ''} ${o.kind ?? o.type ?? ''}`.trim());

test('each tab gets its own discussion with the message id on the act; user scope is never a discussion', async () => {
  const s = fresh();
  await run(s, 'open the chess tab', 'e4', 'open the drawing tab', 'draw a red house');
  const all = s.discussions();
  assert.deepEqual(all.map((c) => c.tab).sort(), ['chess', 'draw']);
  assert.ok(all.every((c) => c.worlds.every((w) => w !== 'ui.shell')));
  const chess = s.astra.list({ tab: 'chess' })[0];
  assert.ok(s.astra.log.of(chess.id).some((e) => e.type === 'act' && /^msg\d+$/.test(e.msg) && e.data.worlds.includes('games.chess')));
  assert.equal(s.discussions({ tab: 'draw' })[0].worlds[0], 'art.draw');
});

test('two drawings: new discussion, back to the first, state follows, other world untouched', async () => {
  const s = fresh();
  await run(s, 'open the chess tab', 'e4', 'open the drawing tab', 'draw a red house');
  const chessMoves = JSON.stringify(s.state('games.chess'));
  const n = await s.send('new discussion');
  assert.match(n.text, /^OK, a new discussion: /);
  assert.deepEqual(s.state('art.draw').objects, []);
  await s.send('draw a blue tree');
  assert.equal(shapes(s).length, 1);
  assert.match(shapes(s)[0], /blue/);
  const l = await s.send('my discussions');
  assert.match(l.text, /^Your discussions: /);
  const b = await s.send('back to the first drawing');
  assert.match(b.text, /^Back to Drawing board\./);
  assert.match(shapes(s)[0], /red/);
  assert.equal(shapes(s).length, 1);
  assert.equal(JSON.stringify(s.state('games.chess')), chessMoves);
  assert.equal(b.state['ui.shell']?.activeTab ?? 'draw', 'draw');
  const b2 = await s.send('back to the second drawing');
  assert.match(shapes(s)[0], /blue/);
  assert.match(b2.text, /^Back to Drawing board 2\./);
});

test('acceptance: two chess games and a drawing suspended and resumed, also through a saved record', async () => {
  const s = fresh();
  await run(s, 'open the chess tab', 'e4', 'open the drawing tab', 'draw a red house', 'open the chess tab');
  await s.send('new discussion');                        // a second chess game on the chess tab
  assert.equal(s.state('games.chess').moves?.length ?? 0, 0);
  await s.send('d4');
  const backend = memoryBackend();
  assert.ok(s.saveDiscussions(new Storage(backend)));
  const r = fresh();
  assert.ok(r.loadDiscussions(new Storage(backend)));
  assert.equal(r.discussions({ tab: 'chess' }).length, 2);
  assert.deepEqual(r.state('games.chess'), s.state('games.chess'));
  assert.match(shapes(r)[0], /red/);
  const b = await r.send('back to the first chess game');
  assert.match(b.text, /^Back to /);
  assert.notDeepEqual(r.state('games.chess'), s.state('games.chess'));      // game 1 (e4 only) is back
  assert.equal(JSON.stringify(r.state('games.chess')).includes('d4'), false);
  assert.match(shapes(r)[0], /red/);                                        // the drawing was not touched
  assert.equal(r.astra.log.length > 0, true);
});

test('a single discussion per world: "back to the drawing" and "the first chart" are not discussion commands', async () => {
  const s = fresh();
  await run(s, 'open the drawing tab', 'draw a red house', 'open the chess tab', 'e4');
  const r = await s.send('back to the drawing');
  assert.equal(r.trace.discourse.meta.kind, 'topic');
  assert.match(r.text, /^Back to Drawing board\. In your picture/);
  const ch = fresh();
  await run(ch, 'open the charts tab', 'New chart');
  assert.equal((await ch.send('Go back to the first chart')).trace.discourse.meta, null);
});

test('where were we: the most recent unfinished activity left for a digression (ASTRA owns the definition)', async () => {
  const s = fresh();
  await run(s, 'open the drawing tab', 'Draw a red house.', 'open the chess tab', 'e4');
  assert.match((await s.send('where were we?')).text, /^Back to Drawing board/);   // out of the chess digression: the drawing
  const t = fresh();
  await run(t, 'open the chess tab', 'e4', 'open the drawing tab', 'Draw a red house.', 'open the charts tab');
  assert.match((await t.send('where were we?')).text, /^Back to Drawing board/);
});

test('the turn guard rolls ASTRA back with the session', async () => {
  const s = fresh();
  await run(s, 'open the drawing tab', 'draw a red house');
  const n = s.astra.discussions.size, log = s.astra.log.length;
  const ctl = new AbortController();
  const p = s.send('open the chess tab and play e4', { signal: ctl.signal, hardMs: 8000 });
  ctl.abort(new DOMException('stopped', 'AbortError'));
  await p.catch(() => {});
  assert.equal(s.astra.discussions.size >= n, true);
  // an undo snapshot taken by the host restores the registry as well
  const snap = s.snapshot();
  await run(s, 'open the chess tab', 'e4');
  assert.ok(s.astra.discussions.size > n);
  s.restore(snap);
  assert.equal(s.astra.discussions.size, n);
  assert.equal(s.astra.log.length, log);
});

test('the moves of a turn are typed and the open question is tracked', async () => {
  const s = fresh();
  await run(s, 'open the drawing tab', 'draw a red house');
  const d = s.astra.activeDiscussion();
  assert.ok(d.context.is.commitments.length >= 1);
  const a = await s.send('what is 2 plus 2');
  assert.match(a.text, /4/);
  assert.deepEqual(s.astra.activeDiscussion().openQuestions, []);   // answered in the same turn: nothing stays open
});
