import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePropertyValue, selectPropertyObject } from '../src/dialog/property-selection.mjs';
import { executeRequestCandidate, runNewEngine } from '../src/dialog/new-engine.mjs';
import { initialState } from '../worlds/art.draw/board.mjs';
const binding = { id: 'toy.surface', key: 'finish', concept: 'texture', sourceType: 'toy.object', valueType: 'toy.texture', nameKey: 'label', valueKey: 'native' };
const normalize = value => typeof value === 'string' && value.startsWith('native:') ? value : null;
const resolved = { ok: true, values: ['native:rough'], facts: [{ id: 'rough-fact', type: 'toy.texture', native: 'native:rough' }] };
const object = (id, value, kind = 'vessel') => ({ id, kind, inputs: [{ binding: binding.id, source: `source:${id}`, sourceType: binding.sourceType, key: binding.key, version: '7', values: value === null ? [] : [JSON.stringify(value)] }] });
const observation = objects => ({ complete: true, instanceId: 'test-lifetime', version: '7', scope: 'test-objects', objects });
const select = (observed, options) => selectPropertyObject(observed, { kind: 'vessel', selector: 'selected', binding, resolved }, { normalize, ...options });
test('declared value lookup merges exact equivalents and preserves conflicting alternatives', () => {
  const facts = [{ id: 'a', type: 'toy.texture', attrs: { label: ['"rough"'], native: ['"native:rough"'] } }, { id: 'b', type: 'toy.texture', attrs: { label: ['"rough"'], native: ['"native:rough"'] } }];
  const source = { ofType(type) { assert.equal(type, 'toy.texture'); return facts; } };
  const value = resolvePropertyValue(source, { normalize }, binding, 'rough');
  assert.equal(value.ok, true); assert.equal(value.facts.length, 2);
  facts[1].attrs.native = ['"native:smooth"'];
  assert.equal(resolvePropertyValue(source, { normalize }, binding, 'rough').ok, false);
  assert.equal(resolvePropertyValue(source, { normalize }, binding, 'missing').ok, false);
});
test('library equality guard distinguishes mismatch, unknown and ambiguity with complete witnesses', () => {
  const before = observation([object(1, 'native:rough'), object(2, 'native:smooth'), object(3, 'native:rough', 'crate')]);
  const result = select(before);
  assert.equal(result.ok, true); assert.equal(result.object.id, 1);
  assert.deepEqual(result.considered.map(item => item.status), ['match', 'mismatch']);
  assert.deepEqual(result.evaluation.failures, [{ index: 1, reason: 'guard-rejected' }]);
  result.considered[0].inputs[0].values[0] = 'changed';
  assert.equal(before.objects[0].inputs[0].values[0], '"native:rough"');
  assert.equal(select(observation([object(1, 'native:rough'), object(2, null)])).reason, 'unknown');
  assert.equal(select(observation([object(1, 'native:rough'), object(2, 'native:rough')])).reason, 'ambiguous');
  assert.equal(select(observation([object(1, 'native:smooth')])).reason, 'missing');
  assert.equal(select({ ...before, complete: false }).reason, 'incomplete-observation');
  assert.equal(select(before, { budget: 1 }).ok, false);
  assert.equal(select(observation([object(1, 'rough')])).reason, 'unknown', 'unresolved stored names are not native observations');
});
test('missing duplicate or wrong-version native observations cannot prove selector equality', () => {
  for (const edit of [input => { input.version = '6'; }, input => { input.key = 'another'; }, input => { input.sourceType = 'other'; }]) {
    const before = observation([object(1, 'native:rough')]); edit(before.objects[0].inputs[0]);
    assert.equal(select(before).reason, 'unknown');
  }
  const before = observation([object(1, 'native:rough')]); before.objects[0].inputs.push(structuredClone(before.objects[0].inputs[0]));
  assert.equal(select(before).reason, 'unknown');
});
const graph = (selected = 'red', desired = 'blue', kind = 'circle') => ({ request: 'r', wires: `@source std.request.source text="structural fixture"
@r std.request act=change mood=do source=$source root=$desired
@target std.request.target request=$r mode=existing kind=${kind} selector=$selected
@selected std.request.constraint request=$r target=$target concept=colour operator=eq value="${selected}" character=assumption polarity=positive
@desired std.request.constraint request=$r target=$target concept=colour operator=eq value="${desired}" character=requirement polarity=positive` });
const session = objects => { const state = initialState(); state.objects = objects; return { isession: { state: { 'ui.shell': { activeTab: 'draw' }, 'art.draw': state } }, newEngineJournal: [] }; };
test('validated detached selector graph selects pre-state independently of desired effect and retains evidence', () => {
  const s = session([{ id: 1, kind: 'circle', color: '#ff0000' }, { id: 2, kind: 'circle', color: '#0000ff' }]);
  const result = executeRequestCandidate(s, graph(), 'structural fixture', { invocation: 'selected-turn' });
  assert.equal(result.trace.assessment, 'changed', JSON.stringify(result));
  assert.deepEqual(s.isession.state['art.draw'].objects.map(object => object.color), ['#0000ff', '#0000ff']);
  assert.equal(s.isession.state['art.draw'].history.length, 1);
  assert.deepEqual(result.trace.journal.selection.considered.map(item => item.status), ['match', 'mismatch']);
  assert.ok(result.trace.journal.selection.mapping.facts.some(fact => fact.id === 'k.colours.css.red'));
  assert.equal(executeRequestCandidate(s, graph(), 'structural fixture', { invocation: 'selected-turn' }).trace.replayed, true);
  assert.equal(executeRequestCandidate(s, graph('red', 'purple'), 'structural fixture', { invocation: 'selected-turn' }).trace.reason, 'identity');
});
test('unknown, ambiguous, unsupported or overlapping selectors never mutate state', () => {
  for (const [objects, candidate] of [
    [[{ id: 1, kind: 'circle', color: '#ff0000' }, { id: 2, kind: 'circle' }], graph()],
    [[{ id: 1, kind: 'circle', color: '#ff0000' }, { id: 2, kind: 'circle', color: '#ff0000' }], graph()],
    [[{ id: 1, kind: 'circle', color: '#ff0000' }], graph('unknown')],
    [[{ id: 1, kind: 'circle', color: '#ff0000' }], { ...graph(), wires: graph().wires.replace('root=$desired', 'root=$selected') }],
    [[{ id: 1, kind: 'circle', color: '#ff0000' }], { ...graph(), wires: graph().wires.replace('operator=eq', 'operator=region') }],
    [[{ id: 1, kind: 'circle', color: '#ff0000' }], { ...graph(), wires: graph().wires.replace('concept=colour', 'concept=texture') }],
  ]) {
    const s = session(objects), before = structuredClone(s.isession.state);
    const result = executeRequestCandidate(s, candidate, 'structural fixture');
    assert.deepEqual(result.statuses, ['unsupported']); assert.deepEqual(s.isession.state, before);
  }
  const s = session([{ id: 'other', kind: 'square', color: '#008000' }, { id: 'irrelevant', kind: 'circle' }]);
  assert.equal(executeRequestCandidate(s, graph('green', 'purple', 'square'), 'structural fixture').trace.assessment, 'changed');
  const after = structuredClone(s.isession.state);
  assert.equal(runNewEngine(s, 'make the green square purple').trace.reason, 'target', 'general reader resolves the selector but the previous effect removed its matching value');
  assert.deepEqual(s.isession.state, after);
  const fresh = session([{ id: 'new-square', kind: 'square', color: '#008000' }]);
  assert.equal(runNewEngine(fresh, 'make the green square purple').trace.assessment, 'changed');
  assert.equal(fresh.isession.state['art.draw'].objects[0].color, '#800080');
});
test('selector binding never reads a different result-property slot', () => {
  const before = observation([object(1, 'native:rough'), object(2, 'native:smooth')]);
  for (const item of before.objects) item.inputs.push({ ...item.inputs[0], binding: 'toy.tint', key: 'color', values: ['"native:rough"'] });
  const result = select(before);
  assert.equal(result.object.id, 1);
  assert.deepEqual(result.considered.map(item => item.inputs.map(input => input.key)), [['finish'], ['finish']]);
  assert.deepEqual(result.considered.map(item => item.status), ['match', 'mismatch']);
});
test('detached graph cannot hide extra requests, executable declarations or mismatched original text', () => {
  for (const [candidate, text] of [
    [graph(), 'different source text'],
    [{ ...graph(), wires: graph().wires + '\n@extra std.request act=change mood=do source=$source' }, 'structural fixture'],
    [{ ...graph(), wires: graph().wires + '\n@unexpected core.use world=core' }, 'structural fixture'],
    [{ ...graph(), wires: graph().wires + '\n@source std.request.source text="redefined"' }, 'structural fixture'],
  ]) {
    const s = session([{ id: 1, kind: 'circle', color: '#ff0000' }]), before = structuredClone(s.isession.state);
    assert.equal(executeRequestCandidate(s, candidate, text).trace.reason, 'structure');
    assert.deepEqual(s.isession.state, before);
  }
});
test('detached request identities cannot overwrite journal evidence or loaded modules', () => {
  for (const id of ['step', 'trace.request', 'before.input', 'expected.input', 'semantic.input', 'after.input', 'before.observation', 'after.observation', 'claim', 'reply', 'request.module', 'trace.module', 'reply.module']) {
    const candidate = graph(); candidate.wires = candidate.wires.replaceAll('@r std.request ', '@' + id + ' std.request ').replaceAll('request=$r', 'request=$' + id); candidate.request = id;
    const s = session([{ id: 1, kind: 'circle', color: '#ff0000' }]), before = structuredClone(s.isession.state);
    assert.equal(executeRequestCandidate(s, candidate, 'structural fixture').trace.reason, 'structure', id);
    assert.deepEqual(s.isession.state, before, id); assert.equal(s.newEngineJournal.length, 0);
  }
});
test('selector equality with an already satisfied result observes unchanged without an undo effect', () => {
  const s = session([{ id: 9, kind: 'circle', color: '#ff0000' }, { id: 10, kind: 'circle', color: '#0000ff' }]);
  const result = executeRequestCandidate(s, graph('red', 'red'), 'structural fixture');
  assert.equal(result.trace.assessment, 'unchanged');
  assert.equal(s.isession.state['art.draw'].history.length, 0);
  assert.equal(result.trace.journal.selection.object.id, 9);
  assert.deepEqual(result.trace.journal.selection.considered.map(item => item.status), ['match', 'mismatch']);
});
