import test from 'node:test';
import assert from 'node:assert/strict';
import { compileNativeCapability } from '../src/dialog/capability-plan-adapter.mjs';
import SOURCE from '../src/dialog/new-engine-source.mjs';
import { World } from '../src/vendor/sopworld/sopworld.mjs';
import { executeRequestCandidate } from '../src/dialog/new-engine.mjs';
import { runGrammarEngine as runNewEngine } from '../scripts/lib/grammar-reader.mjs';
import { drawingState, drawingObjects } from './drawing-state.mjs';
import { createDrawingArea } from '../worlds/art.draw/sop-drawing.mjs';
const graph = (selected = 'red', desired = 'blue', kind = 'circle') => ({ request: 'r', wires: `@source std.request.source text="structural fixture"
@r std.request act=change mood=do source=$source root=$desired
@target std.request.target request=$r mode=existing kind=${kind} selector=$selected
@selected std.request.constraint request=$r target=$target concept=colour operator=eq value="${selected}" character=assumption polarity=positive
@desired std.request.constraint request=$r target=$target concept=colour operator=eq value="${desired}" character=requirement polarity=positive` });
// Drawing tab (SOP area) states made through the area's own commands; objects are coded o1, o2... in order.
const session = async objects => ({ isession: { state: { 'ui.shell': { activeTab: 'draw' }, 'art.draw': await drawingState(objects) } }, newEngineJournal: [] });
const colours = s => drawingObjects(s.isession.state['art.draw']).map(object => object.color);
test('validated detached selector graph selects pre-state independently of desired effect and retains evidence', async () => {
  const s = await session([{ kind: 'circle', color: '#FF0000' }, { kind: 'circle', color: '#0000ff' }]);
  const result = await executeRequestCandidate(s, graph(), 'structural fixture', { invocation: 'selected-turn' });
  assert.equal(result.trace.assessment, 'changed', JSON.stringify(result));
  assert.deepEqual(colours(s), ['#0000ff', '#0000ff']);
  assert.deepEqual(result.trace.journal.selection.considered.map(item => item.status), ['match', 'mismatch']);
  assert.ok(result.trace.journal.selection.considered[0].support.some(id => id.includes('k.colours.css.red')));
  assert.equal((await executeRequestCandidate(s, graph(), 'structural fixture', { invocation: 'selected-turn' })).trace.replayed, true);
  assert.equal((await executeRequestCandidate(s, graph('red', 'purple'), 'structural fixture', { invocation: 'selected-turn' })).trace.reason, 'identity');
});
test('unknown, ambiguous, unsupported or overlapping selectors never mutate state', async () => {
  for (const [objects, candidate] of [
    [[{ kind: 'circle', color: '#ff0000' }, { kind: 'circle' }], graph()],
    [[{ kind: 'circle', color: '#ff0000' }, { kind: 'circle', color: '#ff0000' }], graph()],
    [[{ kind: 'circle', color: '#ff0000' }], graph('unknown')],
    [[{ kind: 'circle', color: '#ff0000' }], { ...graph(), wires: graph().wires.replace('root=$desired', 'root=$selected') }],
    [[{ kind: 'circle', color: '#ff0000' }], { ...graph(), wires: graph().wires.replace('operator=eq', 'operator=region') }],
    [[{ kind: 'circle', color: '#ff0000' }], { ...graph(), wires: graph().wires.replace('concept=colour', 'concept=texture') }],
  ]) {
    const s = await session(objects), before = structuredClone(s.isession.state);
    const result = await executeRequestCandidate(s, candidate, 'structural fixture');
    assert.deepEqual(result.statuses, ['unsupported']); assert.deepEqual(s.isession.state, before);
  }
  const s = await session([{ kind: 'square', color: '#008000' }, { kind: 'circle' }]);
  assert.equal((await executeRequestCandidate(s, graph('green', 'purple', 'square'), 'structural fixture')).trace.assessment, 'changed');
  const after = structuredClone(s.isession.state);
  assert.equal((await runNewEngine(s, 'make the green square purple')).trace.reason, 'target', 'general reader resolves the selector but the previous effect removed its matching value');
  assert.deepEqual(s.isession.state, after);
  const fresh = await session([{ kind: 'square', color: '#008000' }]);
  assert.equal((await runNewEngine(fresh, 'make the green square purple')).trace.assessment, 'changed');
  assert.equal(colours(fresh)[0], '#800080');
});
test('live capability selection disregards stale and unrelated native fields', async () => {
  const s = await session([{ kind: 'circle', color: '#ff0000' }, { kind: 'circle', color: '#0000ff' }]);
  const state = s.isession.state['art.draw'], host = await createDrawingArea({ state });
  const bindings = { kinds: [{ area: 'drawing', canonical: 'circle', lemma: 'circle',
    nativeFamilyBinding: { operation: 'drawing.object.make' } }] };
  const source = World.fromJSON(SOURCE.snapshot, { library: SOURCE.schemaModules });
  const compile = observation => compileNativeCapability(graph(), { observation, host, readKnowledge: () => source,
    bindings, view: 'draw', area: { area: 'drawing' }, unapplied: [] });
  const field = (snapshot, id) => snapshot.objects.find(object => object.id === id).inputs.find(input => input.binding === 'drawing.object.color');
  const withUnrelatedField = host.observe();
  const second = withUnrelatedField.objects.find(object => object.id === 'o2');
  second.inputs.push({ ...field(withUnrelatedField, 'o2'), binding: 'another.property', values: ['"#ff0000"'] });
  const plan = compile(withUnrelatedField);
  assert.equal(plan.status, 'compiled');
  assert.equal(plan.id, 'o1');
  assert.deepEqual(plan.selection.map(row => row.status), ['match', 'mismatch']);
  for (const [key, invalid] of [['version', 'stale'], ['source', 'another-object'], ['sourceType', 'another.kind']]) {
    const snapshot = host.observe();
    field(snapshot, 'o2')[key] = invalid;
    const refused = compile(snapshot);
    assert.equal(refused.status, 'unavailable');
    assert.deepEqual(refused.selection.map(row => row.status), ['match', 'unknown']);
  }
  assert.deepEqual(colours(s), ['#ff0000', '#0000ff']);
});
test('detached graph cannot hide extra requests, executable declarations or mismatched original text', async () => {
  for (const [candidate, text] of [
    [graph(), 'different source text'],
    [{ ...graph(), wires: graph().wires + '\n@extra std.request act=change mood=do source=$source' }, 'structural fixture'],
    [{ ...graph(), wires: graph().wires + '\n@unexpected core.use world=core' }, 'structural fixture'],
    [{ ...graph(), wires: graph().wires + '\n@source std.request.source text="redefined"' }, 'structural fixture'],
  ]) {
    const s = await session([{ kind: 'circle', color: '#ff0000' }]), before = structuredClone(s.isession.state);
    assert.equal((await executeRequestCandidate(s, candidate, text)).trace.reason, 'structure');
    assert.deepEqual(s.isession.state, before);
  }
});
test('detached request identities cannot overwrite journal evidence or loaded modules', async () => {
  for (const id of ['step', 'trace.request', 'before.input', 'expected.input', 'semantic.input', 'after.input', 'before.observation', 'after.observation', 'claim', 'reply', 'request.module', 'trace.module', 'reply.module']) {
    const candidate = graph(); candidate.wires = candidate.wires.replaceAll('@r std.request ', '@' + id + ' std.request ').replaceAll('request=$r', 'request=$' + id); candidate.request = id;
    const s = await session([{ kind: 'circle', color: '#ff0000' }]), before = structuredClone(s.isession.state);
    assert.equal((await executeRequestCandidate(s, candidate, 'structural fixture')).trace.reason, 'structure', id);
    assert.deepEqual(s.isession.state, before, id); assert.equal(s.newEngineJournal.length, 0);
  }
});
test('selector equality with an already satisfied result observes unchanged without an undo effect', async () => {
  const s = await session([{ kind: 'circle', color: '#ff0000' }, { kind: 'circle', color: '#0000ff' }]);
  const result = await executeRequestCandidate(s, graph('red', 'red'), 'structural fixture');
  assert.equal(result.trace.assessment, 'unchanged');
  assert.deepEqual(colours(s), ['#ff0000', '#0000ff']);
  assert.equal(result.trace.journal.selection.object.id, 'o1');
  assert.deepEqual(result.trace.journal.selection.considered.map(item => item.status), ['match', 'mismatch']);
});
