// The conversation memory (discourse + ASTRA) is plain JSON: a restarted engine worker gets it back (spec 06 "Engine worker", COMPUTE-BUDGET D).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const opsEngine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner: 'ops' } });
const say = async (s, ...texts) => { let r; for (const t of texts) r = await s.send(t); return r; };

/** What the page does on a watchdog restart: the world states and the memory travel as plain data to a brand-new session. */
function restarted(old, { viaJson = true, eng = engine } = {}) {
  const mem = old.memoryJSON();
  const wire = viaJson ? JSON.parse(JSON.stringify(mem)) : structuredClone(mem);
  const fresh = eng.createSession({ language: 'en' });
  fresh.isession.state = structuredClone(old.isession.state);
  fresh._msg = old._msg;
  assert.equal(fresh.restoreMemory(wire), true);
  return fresh;
}

test('memoryJSON is plain data: JSON round trip and structuredClone are lossless', async () => {
  const s = engine.createSession({ language: 'en' });
  await say(s, 'open the drawing tab', 'Draw a house', 'Make the house red', 'How far is Paris from Rome?');
  const mem = s.memoryJSON();
  assert.deepEqual(JSON.parse(JSON.stringify(mem)), mem);
  assert.deepEqual(structuredClone(mem), mem);
  assert.ok(mem.discourse.frames.length >= 2 && mem.discourse.actions.length >= 1);
  assert.ok(JSON.stringify(mem).length < 400_000, 'the per-turn snapshot stays small');
});

test('after a restart an ellipsis still resolves against the remembered frame', async () => {
  const s = engine.createSession({ language: 'en' });
  await s.send('How far is Paris from Rome?');
  const b = restarted(s);
  const r = await b.send('And from Berlin?');
  assert.match(r.text, /Paris and Berlin/);
  assert.equal(r.trace.discourse.resolved.kind, 'ellipsis');
});

test('after a restart a pending question is answered and undo still works in both reasoners (ops: the board keeps its history in the state; matrix: the timeline travels in the memory record, spec 15)', async () => {
  const s = opsEngine.createSession({ language: 'en' });
  await say(s, 'open the drawing tab', 'Draw a house');
  const before = JSON.stringify(s.isession.state['art.draw']);
  await s.send('Make the house red');
  assert.notEqual(JSON.stringify(s.isession.state['art.draw']), before);
  const b = restarted(s, { viaJson: false, eng: opsEngine });
  const r = await b.send('undo that');
  assert.doesNotMatch(r.text, /did not understand|nothing to undo/i);
  assert.deepEqual(b.isession.state['art.draw'].objects.map((o) => o.color), [null], 'the colour change was taken back');
  const m = engine.createSession({ language: 'en' });
  await say(m, 'open the drawing tab', 'Draw a house', 'Make the house red');
  const mb = restarted(m, { viaJson: false });
  assert.doesNotMatch((await mb.send('undo that')).text, /did not understand|nothing (more )?to undo/i, 'matrix: the library timeline came back with the memory');
  assert.deepEqual(mb.isession.state['art.draw'].objects.map((o) => o.color), [null], 'and the colour change was taken back');

  const c = engine.createSession({ language: 'en' });
  await say(c, 'open the drawing tab');
  const q = await c.send('Draw');
  assert.ok(q.text, 'the command asked for what to draw');
  const d = restarted(c);
  const done = await d.send('a cat');
  assert.match(JSON.stringify(d.isession.state['art.draw']), /cat/);
  assert.ok(done.trace.discourse?.resolved || /cat/i.test(done.text));
});

test('a bad or foreign record is refused and leaves the memory empty', () => {
  const s = engine.createSession({ language: 'en' });
  assert.equal(s.restoreMemory(null), false);
  assert.equal(s.restoreMemory({ v: 99 }), false);
  assert.equal(s.restoreMemory({ v: 1, discourse: 'garbage', astra: 5 }), true);
  assert.deepEqual(s.discourse.frames, []);
});
