import test from 'node:test';
import assert from 'node:assert/strict';
import { createFacePreparation } from '../worlds/ui.avatar/face-preparation.mjs';
import { toolView, newFace } from '../worlds/ui.avatar/face.mjs';
import { initialState } from '../worlds/ui.avatar/own.mjs';
import { DEFAULT_FACE } from '../worlds/ui.avatar/default-face.mjs';
const issue = (tool, kind, operationId, args = {}) => tool.apply({ kind, operationId, instanceId: 'face-test', expectedVersion: tool.observe().version, ...args });

test('observation reports only stored faces and does not initialize or migrate', () => {
  for (const state of [{ name: 'Assistant' }, { name: 'Assistant', face: { v: 1, saved: { old: true } } }, { face: { v: 2, slots: {} } }]) {
    const before = structuredClone(state);
    toolView({ state });
    assert.deepEqual(state, before);
    if (state.face?.v !== 2) assert.deepEqual(toolView({ state }), []);
  }
  assert.ok(toolView({ state: initialState() }).length > 1, 'the application baseline stores the face it shows');
});

test('explicit initialization, receipts and undo preserve unrelated state', () => {
  const seed = { name: 'Independent assistant', extension: { value: 17 } };
  const tool = createFacePreparation({ instanceId: 'face-test', state: seed });
  assert.equal(tool.observe().status, 'uninitialized');
  const request = { kind: 'initialize', operationId: 'i', instanceId: 'face-test', expectedVersion: 0, preset: 'girl' };
  const made = tool.apply(request);
  assert.equal(made.status, 'supported'); assert.equal(made.observation.version, 1);
  assert.deepEqual(made.observation.state.extension, seed.extension);
  assert.equal(tool.apply(request).replayed, true); assert.equal(tool.observe().version, 1);
  made.observation.state.face.base = 'tampered';
  assert.equal(tool.observe().state.face.base, 'girl');
  assert.equal(issue(tool, 'undo', 'u', { target: 'i' }).status, 'supported');
  assert.deepEqual(tool.observe().state, seed); assert.equal(tool.observe().version, 2);
  assert.equal(tool.apply(request).replayed, true); assert.deepEqual(tool.observe().state, seed);
  assert.equal(tool.apply({ ...request, preset: 'different' }).code, 'operation_identity_reused');
  assert.deepEqual(seed, { name: 'Independent assistant', extension: { value: 17 } });
});

test('migration fills sparse v2 state explicitly, preserves values and undoes exactly', () => {
  const seed = { name: 'Assistant', face: { v: 2, base: 'girl', slots: { eyes: 'custom' }, colours: { skin: 'custom' }, extension: 9 } };
  const tool = createFacePreparation({ instanceId: 'face-test', state: seed });
  const before = tool.observe();
  assert.equal(issue(tool, 'migrate', 'different-base', { preset: 'boy' }).code, 'conflicting_preset');
  assert.deepEqual(tool.observe(), before);
  const result = issue(tool, 'migrate', 'm');
  assert.equal(result.status, 'supported'); assert.equal(result.changed, true);
  assert.equal(tool.observe().state.face.slots.eyes, 'custom');
  assert.equal(tool.observe().state.face.colours.skin, 'custom');
  assert.equal(tool.observe().state.face.extension, 9);
  assert.equal(issue(tool, 'migrate', 'noop').changed, false);
  assert.equal(tool.observe().version, 1);
  assert.equal(issue(tool, 'undo', 'u', { target: 'm' }).status, 'supported');
  assert.deepEqual(tool.observe().state, seed);
  issue(tool, 'migrate', 'm2');
  assert.equal(issue(tool, 'undo', 'stale-target', { target: 'm' }).code, 'intervening_change');
});

test('invalid/stale preparation does not change state; older formats need a declared converter', () => {
  const tool = createFacePreparation({ instanceId: 'face-test', state: { face: { v: 1, data: 'preserve' } } });
  const before = tool.observe();
  assert.equal(issue(tool, 'migrate', 'm').code, 'unsupported_version');
  assert.deepEqual(tool.observe(), before);
  const fresh = createFacePreparation({ instanceId: 'face-test' });
  assert.equal(issue(fresh, 'initialize', 'bad', { preset: 'absent' }).code, 'unknown_preset');
  assert.equal(fresh.observe().version, 0);
  issue(fresh, 'initialize', 'i', { preset: 'girl' });
  assert.equal(fresh.apply({ kind: 'undo', operationId: 'u', target: 'i', instanceId: 'face-test', expectedVersion: 0 }).code, 'stale_version');
  assert.equal(fresh.apply({ kind: 'undo', operationId: 'u', target: 'i', instanceId: 'different', expectedVersion: 1 }).code, 'invalid_command');
  const face = newFace(DEFAULT_FACE);
  face.slots = Object.fromEntries(Object.entries(face.slots).reverse());
  const complete = createFacePreparation({ instanceId: 'face-test', state: { face } });
  assert.equal(issue(complete, 'migrate', 'm').changed, false);
});

test('observation facts cannot leak mutable stored values', () => {
  const tool = createFacePreparation({ instanceId: 'face-test', state: { face: { v: 2, base: { external: true }, slots: {} } } });
  const observation = tool.observe();
  observation.facts[0].preset.external = false;
  assert.equal(tool.observe().state.face.base.external, true);
});

test('unsupported snapshot serialization is rejected at construction', () => {
  assert.throws(() => createFacePreparation({ instanceId: 'face-test', state: new Date() }), TypeError);
  const malformed = createFacePreparation({ instanceId: 'face-test', state: { face: { v: 2, base: 'girl', history: 'invalid' } } });
  const before = malformed.observe();
  assert.equal(issue(malformed, 'migrate', 'bad-history').code, 'malformed_face');
  assert.deepEqual(malformed.observe(), before);
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => createFacePreparation({ instanceId: 'face-test', state: cyclic }), TypeError);
  assert.throws(() => createFacePreparation({ instanceId: 'face-test', state: { value: 1n } }), TypeError);
});
