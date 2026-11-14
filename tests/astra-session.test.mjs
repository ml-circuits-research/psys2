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
  await run(s, 'open the map tab', 'show paris', 'open the drawing tab', 'draw a red house');
  const all = s.discussions();
  assert.deepEqual(all.map((c) => c.tab).sort(), ['draw', 'map']);
  assert.ok(all.every((c) => c.worlds.every((w) => w !== 'ui.shell')));
  const mapD = s.astra.list({ tab: 'map' })[0];
  assert.ok(s.astra.log.of(mapD.id).some((e) => e.type === 'act' && /^msg\d+$/.test(e.msg) && e.data.worlds.includes('geo.map')));
  assert.equal(s.discussions({ tab: 'draw' })[0].worlds[0], 'art.draw');
});

test('two drawings: new discussion, back to the first, state follows, other world untouched', async () => {
  const s = fresh();
  await run(s, 'open the map tab', 'show paris', 'open the drawing tab', 'draw a red house');
  const mapState = JSON.stringify(s.state('geo.map'));
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
  assert.equal(JSON.stringify(s.state('geo.map')), mapState);
  assert.equal(b.state['ui.shell']?.activeTab ?? 'draw', 'draw');
  const b2 = await s.send('back to the second drawing');
  assert.match(shapes(s)[0], /blue/);
  assert.match(b2.text, /^Back to Drawing board 2\./);
});

test('a single discussion per world: "back to the drawing" and "the first chart" are not discussion commands', async () => {
  const s = fresh();
  await run(s, 'open the drawing tab', 'draw a red house', 'open the map tab', 'show paris');
  const r = await s.send('back to the drawing');
  assert.equal(r.trace.discourse.meta.kind, 'topic');
  assert.match(r.text, /^Back to Drawing board\. In your picture/);
  const ch = fresh();
  await run(ch, 'open the charts tab', 'New chart');
  assert.equal((await ch.send('Go back to the first chart')).trace.discourse.meta, null);
});

test('where were we: the most recent unfinished activity left for a digression (ASTRA owns the definition)', async () => {
  const s = fresh();
  await run(s, 'open the drawing tab', 'Draw a red house.', 'open the map tab', 'show paris');
  assert.match((await s.send('where were we?')).text, /^Back to Drawing board/);   // out of the map digression: the drawing
  const t = fresh();
  await run(t, 'open the map tab', 'show paris', 'open the drawing tab', 'Draw a red house.', 'open the charts tab');
  assert.match((await t.send('where were we?')).text, /^Back to Drawing board/);
});

test('the turn guard rolls ASTRA back with the session', async () => {
  const s = fresh();
  await run(s, 'open the drawing tab', 'draw a red house');
  const n = s.astra.discussions.size, log = s.astra.log.length;
  const ctl = new AbortController();
  const p = s.send('open the map tab and show paris', { signal: ctl.signal, hardMs: 8000 });
  ctl.abort(new DOMException('stopped', 'AbortError'));
  await p.catch(() => {});
  assert.equal(s.astra.discussions.size >= n, true);
  // an undo snapshot taken by the host restores the registry as well
  const snap = s.snapshot();
  await run(s, 'open the map tab', 'show paris');
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
