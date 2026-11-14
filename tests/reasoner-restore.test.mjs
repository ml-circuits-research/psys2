// The undo timeline of the matrix reasoner survives an engine restart (spec 15, "The timeline survives a restart"): the committed session record carries
// the library logs and the marks of the kept turns, and a fresh session replays them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';

const mk = (reasoner) => createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner } });
const engine = await mk('matrix');
const opsEngine = await mk('ops');
const say = async (s, ...texts) => { const out = []; for (const t of texts) out.push((await s.send(t)).text); return out; };
const stateOf = (s) => JSON.stringify(s.isession.state);
/** What the page does on a watchdog restart: the world states and the memory travel as plain JSON to a brand-new session. */
function restarted(old, eng) {
  const mem = JSON.parse(JSON.stringify(old.memoryJSON()));
  const fresh = eng.createSession({ language: 'en' });
  fresh.isession.state = JSON.parse(JSON.stringify(old.isession.state));
  fresh._msg = old._msg;
  assert.equal(fresh.restoreMemory(mem), true);
  return fresh;
}
const wiresOf = (s) => Object.fromEntries([...s.isession.rs.insts].map(([id, i]) => [id, [...i.world.wires.values()].map((w) => `${w.id}|${w.type}|${JSON.stringify(w.attrs)}`).sort()]));

const SCRIPT = ['Ana has 5 lei', 'Ana buys a ball', 'open the drawing tab', 'Draw a house', 'Make the house red', 'Draw a cat', 'play tic tac toe', 'I play the center', 'I play the top left'];

test('the record is plain JSON, bounded and reports its size', async () => {
  const s = engine.createSession({ language: 'en' });
  await say(s, ...SCRIPT);
  const rec = s.memoryJSON().rs;
  assert.ok(rec && rec.turns.length >= 3, 'the timeline is in the memory record');
  assert.deepEqual(JSON.parse(JSON.stringify(rec)), rec);
  assert.ok(rec.bytes < 400_000, `small record: ${rec.bytes}`);
  const tiny = s.isession.rs.timelineJSON({ maxBytes: Math.floor(rec.bytes / 3) });
  assert.ok(tiny === null || (tiny.bytes <= rec.bytes / 3 && tiny.dropped > 0), 'over the cap the oldest turns go first');
});

test('restore rebuilds the instances and undo walks the same timeline with the same replies and states', async () => {
  const a = engine.createSession({ language: 'en' });
  await say(a, ...SCRIPT);
  const b = restarted(a, engine);
  assert.deepEqual(wiresOf(b), wiresOf(a), 'the replayed instances hold the same wires');
  assert.equal(stateOf(b), stateOf(a));
  assert.equal(b.isession.rs.turns.length, a.isession.rs.turns.length);
  const seen = [];
  for (let k = 0; k < 12; k++) {
    const ra = (await a.send('undo')).text, rb = (await b.send('undo')).text;
    seen.push(ra);
    assert.equal(rb, ra, `undo ${k + 1}`);
    assert.equal(stateOf(b), stateOf(a), `state after undo ${k + 1}`);
  }
  assert.ok(seen.some((t) => /took/i.test(t)), 'something was taken back');
  assert.match(seen.at(-1), /nothing more to undo/i);
  assert.deepEqual(wiresOf(b), wiresOf(a));
});

test('a restored session keeps working: new turns and undo mix with the restored timeline', async () => {
  const a = engine.createSession({ language: 'en' });
  await say(a, ...SCRIPT.slice(0, 5));
  const b = restarted(a, engine);
  assert.equal((await b.send('Draw a dog')).text, (await a.send('Draw a dog')).text);
  for (let k = 0; k < 4; k++) { assert.equal((await b.send('undo')).text, (await a.send('undo')).text, `undo ${k + 1}`); assert.equal(stateOf(b), stateOf(a)); }
  const c = restarted(b, engine);   // a second restart in the middle of the walk
  for (let k = 0; k < 4; k++) { assert.equal((await c.send('undo')).text, (await b.send('undo')).text, `after the second restart ${k + 1}`); assert.equal(stateOf(c), stateOf(b)); }
});

test('both reasoners: undo survives a restart', async () => {
  for (const eng of [engine, opsEngine]) {
    const a = eng.createSession({ language: 'en' });
    await say(a, 'open the drawing tab', 'Draw a house', 'Make the house red');
    const b = restarted(a, eng);
    const r = await b.send('undo that');
    assert.doesNotMatch(r.text, /did not understand|nothing (more )?to undo/i);
    assert.deepEqual(b.isession.state['art.draw'].objects.map((o) => o.color), [null]);
  }
});

test('a record that cannot be read is refused and changes nothing', () => {
  const s = engine.createSession({ language: 'en' });
  assert.equal(s.isession.rs.restoreJSON(null, s.isession), false);
  assert.equal(s.isession.rs.restoreJSON({ v: 1, entries: [], insts: { 'art.draw': { cur: 3, logs: [] } }, turns: [] }, s.isession), false);
  assert.equal(s.isession.rs.turns.length, 0);
});

test('measure: a 40-turn session (record size and restore time)', async () => {
  const s = engine.createSession({ language: 'en' });
  for (let k = 0; k < 14; k++) for (const m of [`Ana buys ${k + 1} balls`, `Tom has ${k + 2} apples`, 'Ana gives 1 ball to Tom']) await s.send(m);   // matrix worlds only: the drawing is no matrix world any more, so its steps are not on the library timeline
  const t0 = performance.now(); const rec = s.memoryJSON().rs; const t1 = performance.now();
  const wire = JSON.parse(JSON.stringify(rec));
  const fresh = engine.createSession({ language: 'en' });
  fresh.isession.state = JSON.parse(JSON.stringify(s.isession.state));
  const t2 = performance.now(); fresh.isession.rs.restoreJSON(wire, fresh.isession); const t3 = performance.now();
  console.log(`# 40-turn session: ${rec.turns.length} turns, ${rec.bytes} bytes, serialize ${(t1 - t0).toFixed(1)} ms, restore ${(t3 - t2).toFixed(1)} ms`);
  assert.equal(fresh.isession.rs.turns.length, s.isession.rs.turns.length);
  assert.equal((await fresh.send('undo')).text, (await s.send('undo')).text);
  assert.ok(t3 - t2 < 2000, 'restore stays well under the watchdog');
});
