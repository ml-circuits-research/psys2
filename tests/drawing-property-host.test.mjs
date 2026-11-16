import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, restore } from '../worlds/art.draw/board.mjs';
import { createDrawingPropertyHost } from '../worlds/art.draw/property-host.mjs';
function fixture() {
  const state = initialState();
  state.objects = [{ id: 17, kind: 'rect', x: 20, color: 'red', parts: { custom: 'kept' } }, { id: 29, kind: 'ellipse' }];
  return { state, host: createDrawingPropertyHost({ state, instanceId: 'test-lifetime' }) };
}
const apply = (host, extra = {}) => host.setProperty({ invocation: 'i1', expectedVersion: host.observe().version, target: 17, concept: 'colour', value: '#123abc', ...extra });
test('observation is pure, copied and distinguishes missing native override from rendered defaults', () => {
  const { state, host } = fixture(), original = structuredClone(state), observed = host.observe();
  assert.deepEqual(state, original);
  assert.deepEqual(observed.objects[0].inputs[0].values, ['"red"']);
  assert.deepEqual(observed.objects[1].inputs[0].values, []);
  observed.objects[0].inputs[0].values.push('forged');
  assert.deepEqual(host.observe().objects[0].inputs[0].values, ['"red"']);
});
test('native change preserves unrelated state and creates one compatible undo record', () => {
  const { state, host } = fixture(), before = structuredClone(state);
  const receipt = apply(host);
  assert.equal(receipt.status, 'changed');
  assert.notEqual(receipt.beforeVersion, receipt.afterVersion);
  assert.equal(state.objects[0].color, '#123abc');
  assert.deepEqual(state.objects[0].parts, before.objects[0].parts);
  assert.deepEqual(state.objects[1], before.objects[1]);
  assert.equal(state.history.length, 1);
  restore(state, state.history[0]);
  assert.equal(state.objects[0].color, 'red');
  assert.notEqual(host.observe().version, receipt.afterVersion);
});
test('unchanged and historical replay do not create another effect', () => {
  const { state, host } = fixture();
  const args = { invocation: 'first', expectedVersion: '0', target: 17, concept: 'colour', value: '#123abc' };
  assert.equal(host.setProperty(args).status, 'changed');
  assert.equal(apply(host, { invocation: 'second' }).status, 'unchanged');
  state.objects[0].color = '#abcdef';
  assert.equal(host.setProperty(args).replayed, true);
  assert.equal(state.objects[0].color, '#abcdef');
  assert.equal(state.history.length, 1);
  assert.equal(host.setProperty({ ...args, value: '#000000' }).reason, 'invocation-reused');
});
test('stale observation and unsupported native requests cannot modify the board', () => {
  const { state, host } = fixture(), version = host.observe().version;
  state.objects[1].x = 87;
  const before = structuredClone(state);
  assert.equal(apply(host, { expectedVersion: version }).reason, 'stale-observation');
  for (const extra of [{ concept: 'invented' }, { value: 'purple' }, { value: '#ABCDEF' }, { target: 999 }]) assert.equal(apply(host, extra).status, 'refused');
  assert.deepEqual(state, before);
});
test('duplicate identities, invalid state and unsafe bindings fail closed', () => {
  const { state } = fixture();
  state.objects[1].id = '17';
  assert.throws(() => createDrawingPropertyHost({ state, instanceId: 'epoch' }), /identity/);
  const valid = fixture().state;
  assert.throws(() => createDrawingPropertyHost({ state: valid, instanceId: 'epoch', bindings: [{ id: 'x', concept: 'x', key: 'kind', sourceType: 'x', format: 'rgb' }] }), /binding/);
  const host = createDrawingPropertyHost({ state: valid, instanceId: 'epoch' });
  Object.freeze(valid);
  assert.equal(apply(host).reason, 'immutable-state');
});
test('recreated state has a fresh observation epoch, not reused receipt identity', () => {
  const { state, host } = fixture();
  const restored = createDrawingPropertyHost({ state: structuredClone(state), instanceId: 'restored-lifetime' });
  assert.notEqual(host.observe().objects[0].inputs[0].source, restored.observe().objects[0].inputs[0].source);
});
test('bounded observation refuses cycles, getters and oversized data without executing accessors', () => {
  const { state } = fixture();
  state.cycle = state;
  assert.throws(() => createDrawingPropertyHost({ state, instanceId: 'x' }), /Non-tree/);
  delete state.cycle;
  let called = false;
  Object.defineProperty(state, 'getter', { enumerable: false, configurable: true, get() { called = true; return 1; } });
  assert.throws(() => createDrawingPropertyHost({ state, instanceId: 'x' }), /Executable/);
  assert.equal(called, false);
  delete state.getter;
  assert.throws(() => createDrawingPropertyHost({ state, instanceId: 'x', maxBytes: 10 }), /budget/);
});

test('hidden native fields and symbol metadata cannot evade versioning or be discarded by a change', () => {
  const { state, host } = fixture();
  const version = host.observe().version;
  Object.defineProperty(state.objects[0], 'color', { value: 'red', enumerable: false, writable: true, configurable: true });
  assert.throws(() => host.observe(), /Non-enumerable/);
  state.objects[0].color = 'blue';
  assert.equal(host.setProperty({ invocation: 'hidden', expectedVersion: version, target: 17, concept: 'colour', value: '#123abc' }).reason, 'invalid-state');
  assert.equal(state.objects[0].color, 'blue');
  const second = fixture(), symbol = Symbol('metadata');
  second.state.objects[0][symbol] = 'preserve';
  assert.throws(() => second.host.observe(), /Symbol/);
  assert.equal(second.host.setProperty({ invocation: 'symbol', expectedVersion: '0', target: 17, concept: 'colour', value: '#123abc' }).reason, 'invalid-state');
  assert.equal(second.state.objects[0][symbol], 'preserve');
});
