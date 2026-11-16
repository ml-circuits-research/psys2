import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runNewEngine } from '../src/dialog/new-engine.mjs';
import { initialState } from '../worlds/art.draw/board.mjs';
import { World, str } from '../src/vendor/sopworld/sopworld.mjs';
import { fixtureEngine } from './helpers.mjs';
import sourceSnapshot from '../src/dialog/new-engine-source.mjs';
const sentence = 'Change the colour of the circle to purple.';
const setup = (objects = [{ id: 17, kind: 'circle', color: 'red' }]) => {
  const state = initialState(); state.objects = objects;
  return { isession: { state: { 'ui.shell': { activeTab: 'draw' }, 'art.draw': state } }, newEngineJournal: [] };
};
const field = (world, id, key) => str(world.get(id).attrs[key][0]);
test('published reader, real host, observations and retained typed claim execute end to end', () => {
  const session = setup(), result = runNewEngine(session, sentence, { invocation: 'turn-one' });
  assert.equal(result.trace.assessment, 'changed', JSON.stringify(result));
  assert.equal(session.isession.state['art.draw'].objects[0].color, '#800080');
  assert.equal(result.state['art.draw'].objects[0].color, '#800080');
  assert.equal(session.isession.state['art.draw'].history.length, 1);
  const world = World.fromJSON(result.trace.journal.evidence);
  assert.equal(world.check().ok, true);
  assert.equal(world.get('claim').type, 'std.reply.property');
  assert.equal(world.get('claim').attrs.status[0], 'changed');
  assert.equal(field(world, 'before.input', 'values'), '["\\"red\\""]');
  assert.equal(field(world, 'after.input', 'values'), '["\\"#800080\\""]');
  assert.equal(field(world, 'expected.input', 'values'), field(world, 'after.input', 'values'));
  const witness = JSON.parse(field(world, 'expected.input', 'source'));
  assert.equal(witness.binding, 'art.draw.object.colour');
  assert.ok(witness.facts.includes('k.colours.css.purple'));
  assert.equal(field(world, 'source', 'text'), sentence);
  assert.deepEqual(result.trace.journal.reading.evidence.nodes, [{ id: 'condition', source: 'source', ranges: [[35, 41]] }]);
  assert.equal(Object.hasOwn(result.trace.journal.reading.evidence, 'constraint'), false);
  assert.equal(session.newEngineJournal.length, 1);
});
test('exact no-op has its own observation evidence but no additional undo or changed claim', () => {
  const session = setup([{ id: 'other-id', kind: 'circle', color: '#800080' }]);
  const result = runNewEngine(session, sentence);
  assert.equal(result.trace.assessment, 'unchanged');
  assert.equal(session.isession.state['art.draw'].history.length, 0);
  assert.match(result.text, /already has the stored colour/);
});
test('explicit invocation replay is historical and never a new success or reapplication', () => {
  const session = setup();
  runNewEngine(session, sentence, { invocation: 'retry-key' });
  session.isession.state['art.draw'].objects[0].color = '#001122';
  const result = runNewEngine(session, sentence, { invocation: 'retry-key' });
  assert.equal(result.trace.replayed, true);
  assert.equal(result.trace.historicalReceipt.replayed, true);
  assert.equal(result.trace.assessment, undefined);
  assert.match(result.text, /No new operation/);
  assert.equal(session.isession.state['art.draw'].objects[0].color, '#001122');
  assert.equal(session.isession.state['art.draw'].history.length, 1);
  assert.equal(runNewEngine(session, sentence.toLowerCase(), { invocation: 'retry-key' }).trace.reason, 'identity');
});
test('ambiguous or missing targets, unread modifiers, negation and unknown values have no effect', () => {
  for (const [session, text] of [
    [setup([{ id: 1, kind: 'circle' }, { id: 2, kind: 'circle' }]), sentence],
    [setup([]), sentence], [setup(), 'Do not change the colour of the circle to purple.'],
    [setup(), 'Change the colour of another circle to purple.'], [setup(), 'Change the colour of the left circle to purple.'],
    [setup(), 'Change the colour of the circle to imaginaryvalue.'], [setup(), 'Change the shape of the circle to square.'],
    [setup(), sentence + ' Delete the square.'],
  ]) {
    const before = structuredClone(session.isession.state);
    const result = runNewEngine(session, text);
    assert.deepEqual(result.statuses, ['unsupported'], text);
    assert.deepEqual(session.isession.state, before, text);
    assert.equal(session.newEngineJournal.length, 0);
  }
});
test('other declared colours and kinds use the same published reader/resolver/host path', () => {
  const session = setup([{ id: 482, kind: 'square', color: '#010203' }]);
  const result = runNewEngine(session, 'change the colour of the square to blue');
  assert.equal(result.trace.assessment, 'changed', JSON.stringify(result));
  assert.equal(session.isession.state['art.draw'].objects[0].color, '#0000ff');
});
test('session opt-in bypasses legacy, default remains legacy, undo and persistence carry the journal', async () => {
  const engine = await fixtureEngine(), session = engine.createSession({ language: 'en' });
  Object.assign(session.isession.state, setup().isession.state);
  let legacyCalls = 0;
  session._sendRead = async () => { legacyCalls++; return { text: 'legacy', trace: {}, statuses: [] }; };
  const before = session.snapshot();
  const result = await session.send(sentence, { engine: 'new', language: 'en' });
  assert.equal(result.trace.assessment, 'changed', JSON.stringify(result));
  assert.equal(legacyCalls, 0);
  const memory = session.memoryJSON();
  assert.equal(memory.newEngineJournal.length, 1);
  session.restore(before);
  assert.equal(session.newEngineJournal.length, 0);
  assert.equal(session.isession.state['art.draw'].objects[0].color, 'red');
  assert.equal(session.restoreMemory(memory), true);
  assert.equal(session.newEngineJournal.length, 1);
  await session.send('legacy control', { request: false });
  assert.equal(legacyCalls, 1);
});
test('webchat forwards explicit query opt-in and worker suppresses both legacy fallback retry routes', () => {
  const app = readFileSync(new URL('../docs/webchat/app.mjs', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../docs/webchat/ui/engine-worker.mjs', import.meta.url), 'utf8');
  assert.match(app, /engine: new URLSearchParams\(location.search\).get\('engine'\) === 'new'/);
  assert.match(worker, /m\.opts\?\.engine !== 'new' && lacking.length/);
  assert.match(worker, /m\.opts\?\.engine !== 'new' && !reply.unavailableArea && incomplete\(reply\)/);
});

test('evicted journal entries cannot turn native receipt replay into fresh evidence', () => {
  const session = setup([{ id: 17, kind: 'circle', color: '#800080' }]);
  const first = runNewEngine(session, sentence, { invocation: 'evicted' });
  assert.equal(first.trace.assessment, 'unchanged');
  session.newEngineJournal = [];
  const replay = runNewEngine(session, sentence, { invocation: 'evicted' });
  assert.equal(replay.trace.replayed, true);
  assert.equal(replay.trace.historicalReceipt.replayed, true);
  assert.equal(replay.trace.assessment, undefined);
  assert.equal(replay.trace.journal, undefined);
  assert.equal(session.newEngineJournal.length, 0);
  assert.equal(runNewEngine(session, 'Change the colour of the circle to blue.', { invocation: 'evicted' }).trace.reason, 'identity');
  assert.equal(session.isession.state['art.draw'].objects[0].color, '#800080');
});

test('every declared colour name retains exact-value execution or honest unresolved-value refusal', () => {
  const source = World.fromJSON(sourceSnapshot.snapshot), names = new Map();
  for (const fact of source.ofType('k.colours.colour')) {
    const name = str(fact.attrs.name?.[0]);
    if (!name) continue;
    const values = names.get(name) ?? new Set();
    for (const token of fact.attrs.rgb ?? []) { const value = str(token); if (/^#[0-9a-f]{6}$/i.test(value)) values.add(value.toLowerCase()); }
    names.set(name, values);
  }
  assert.ok(names.size > 150, 'use the whole declared family, including multiword names');
  for (const [name, values] of names) {
    const session = setup([{ id: 17, kind: 'circle', color: 'legacy-native' }]);
    const result = runNewEngine(session, `change the colour of the circle to ${name}`);
    if (values.size === 1) {
      assert.equal(result.trace.assessment, 'changed', name);
      assert.equal(session.isession.state['art.draw'].objects[0].color, [...values][0], name);
      assert.equal(session.isession.state['art.draw'].history.length, 1, name);
    } else {
      assert.deepEqual(result.statuses, ['unsupported'], name);
      assert.equal(session.isession.state['art.draw'].objects[0].color, 'legacy-native', name);
      assert.equal(session.isession.state['art.draw'].history.length, 0, name);
    }
  }
});
