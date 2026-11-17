import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runGrammarEngine as runNewEngine } from '../scripts/lib/grammar-reader.mjs';
import { initialState } from '../worlds/art.draw/board.mjs';
import { World, str, retainSelectiveCalibration } from '../src/vendor/sopworld/sopworld.mjs';
import { fixtureEngine } from './helpers.mjs';
import {readerCalibrationIdentity,readerCalibrationScope,READER_RUNTIME_IDENTITY_FIELDS} from '../src/dialog/reader-admission.mjs';
import sourceSnapshot from '../src/dialog/new-engine-source.mjs';
const sentence = 'Change the colour of the circle to purple.';
const setup = (objects = [{ id: 17, kind: 'circle', color: 'red' }]) => {
  const state = initialState(); state.objects = objects;
  return { isession: { state: { 'ui.shell': { activeTab: 'draw' }, 'art.draw': state } }, newEngineJournal: [] };
};
const field = (world, id, key) => str(world.get(id).attrs[key][0]);
test('offline declared comparator, real host, observations and retained typed claim execute end to end', () => {
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
test('the sole route ignores retired options and preserves undo and journal persistence', async () => {
  const engine = await fixtureEngine(), session = engine.createSession({ language: 'en' });
  Object.assign(session.isession.state, setup().isession.state);
  // Controlled graph-provider fixture, not a trained-model performance claim.
  const wires = `@source std.request.source text=${JSON.stringify(sentence)}\n@r std.request act=change mood=do source=$source root=$condition\n@target std.request.target request=$r mode=existing kind=circle\n@condition std.request.constraint request=$r target=$target concept=colour operator=eq value=purple character=requirement polarity=positive`;
  engine.requestReader = { provenance: () => ({modelSha256:'a'.repeat(64),decoderVersion:1}), propose: async () => ({candidates:[{request:'r',wires}],coverage:{complete:true,executable:false,graphProposal:true},selectionScore:{definition:'psys2.model-minimum/1',value:0.95},failures:[]}) };
  const runtimeIdentity=Object.fromEntries(READER_RUNTIME_IDENTITY_FIELDS.map(key=>[key,'b'.repeat(64)])),calibrationWorld=new World(),reference={owner:'fixture.sole-route',revision:'1'};
  const row=id=>({id,source:id,score:0.95,eligible:true,correct:true});
  assert.equal(retainSelectiveCalibration(calibrationWorld,{...reference,identity:readerCalibrationIdentity(engine.requestReader.provenance(),runtimeIdentity),scope:readerCalibrationScope('draw'),policy:{minFitAccepted:2,minEvaluationAccepted:2,maxErrorRate:0},fitRows:[row('fit1'),row('fit2')],evaluationRows:[row('eval1'),row('eval2')]}).ok,true);
  engine.requestReaderAdmission={world:calibrationWorld,reference,runtimeIdentity};
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
  for (const options of [{}, { engine: 'legacy', request: false }, { engine: 'new' }, { formalizer: 'encoder', routing: 'symbolic+encoder' }]) {
    const before = structuredClone(session.isession.state);
    const refused = await session.send('legacy control', options);
    assert.equal(refused.trace.legacy, false); assert.equal(refused.trace.engine, 'new');
    assert.deepEqual(session.isession.state, before);
  }
  assert.equal(legacyCalls, 0);
});
test('webchat has no engine toggle and worker has no old reader/model preparation route', () => {
  const app = readFileSync(new URL('../docs/webchat/app.mjs', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../docs/webchat/ui/engine-worker.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /get\('engine'\)/);
  assert.doesNotMatch(worker, /worldLoader\.plan|dispatcherEnc\.prepare|createRuntime\(|createSwitchTranslator|loadRoEn|engine\.precompile|engine\.prepareMeta|session\.dryRead|session\.observeIn/);
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
test('malformed input, retired auxiliary APIs and turn errors never enter an old reader', async () => {
  const engine = await fixtureEngine(), session = engine.createSession({ language: 'en' });
  Object.assign(session.isession.state, setup().isession.state);
  let oldCalls = 0;
  session._sendRead = session._dryRun = () => { oldCalls++; throw new Error('retired reader invoked'); };
  engine.interp.observe = () => { oldCalls++; throw new Error('retired reaction invoked'); };
  for (const text of [null, {}, '', '   ', 'x'.repeat(65537), 'not a supported command']) {
    const before = structuredClone(session.isession.state);
    const result = await session.send(text, { engine: 'legacy', request: false });
    assert.deepEqual(result.statuses, ['unsupported']); assert.equal(result.trace.engine, 'new');
    assert.deepEqual(session.isession.state, before);
  }
  assert.equal((await session.dryRead('legacy words')).reason, 'unsupported');
  assert.ok((await session.observeIn({ world: 'art.draw' })).unsupported);
  assert.ok(session.observe({ world: 'art.draw' }).unsupported);
  session._send = () => { throw new Error('simulated worker turn failure'); };
  await assert.rejects(session.send('anything'), /simulated worker turn failure/);
  assert.equal(oldCalls, 0);
});
test('saved non-English sessions report unavailable machine translation without invoking old translation', async () => {
  const engine = await fixtureEngine(), session = engine.createSession({ language: 'ro' });
  Object.assign(session.isession.state, setup().isession.state);
  engine.translator = { translate() { throw new Error('retired translation called'); } };
  const before = structuredClone(session.isession.state);
  const result = await session.send(sentence);
  assert.equal(result.trace.reason, 'translation-unavailable'); assert.equal(result.trace.legacy, false);
  assert.deepEqual(session.isession.state, before);
});

test('offline general frame comparator reaches the existing assessed property path without a synthetic root', () => {
  const session = setup();
  const result = runNewEngine(session, 'make the circle purple');
  assert.equal(result.trace.assessment, 'changed');
  assert.equal(session.isession.state['art.draw'].objects[0].color, '#800080');
  assert.equal(result.trace.journal.reading.provider, 'general-frames');
  const graph = World.fromJSON(result.trace.journal.evidence);
  assert.equal(graph.get('r').attrs.root, undefined);
  assert.equal(graph.get('claim').attrs.status[0], 'changed');
});
