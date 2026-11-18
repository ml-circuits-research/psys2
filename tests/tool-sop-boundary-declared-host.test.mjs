import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanonicalDrawingHost, createDrawingHost, initialCanonicalDrawingState, initialDrawingState} from '../worlds/art.draw/declared-host.mjs';
import {toNativeDrawingState} from '../worlds/art.draw/canonical-state.mjs';
import {toolInvocationContext} from '../worlds/native-tool-host.mjs';

test('Drawing consumes the compiled call, checks revision and deduplicates retries', () => {
  const state = initialDrawingState();
  const host = createDrawingHost({state, instanceId:'drawing-page'});
  const call = '@call std.capability.call operation="drawing.object.make" argument=$kind\n@kind std.capability.arg name="kind" value="rectangle"';
  const context = toolInvocationContext('first gesture', host.observe().version);
  const receipt = host.invoke(call, context);
  assert.equal(receipt.status, 'changed');
  assert.equal(state.objects.length, 1);
  assert.equal(host.invoke(call, context).replayed, true);
  assert.equal(host.invoke(call.replace('"rectangle"', '"circle"'), context).reason, 'invocation-reused');
  assert.equal(host.invoke(call, toolInvocationContext('second gesture', '0')).reason, 'stale-observation');
  assert.equal(state.objects.length, 1);
});

test('A tool refuses object packets, incomplete call circuits and malformed invocation metadata before mutation', () => {
  const state = initialDrawingState();
  const host = createDrawingHost({state, instanceId:'drawing-page'});
  const before = structuredClone(state);
  const command = '@add drawing.object.make kind="rectangle"';
  const context = toolInvocationContext('first gesture', '0');
  for (const [input, metadata] of [
    [{operation:'drawing.object.make',args:{kind:'rectangle'}}, context],
    [command, {invocation:'first gesture', expectedVersion:'0'}],
    [command, '@c app.control.invocation id="first gesture" version="0" version="1"'],
    ['@call std.capability.call operation="drawing.object.make" argument=$missing', context],
    ['@call std.capability.call operation="drawing.object.make"\n@extra example.instruction', context],
    ['@add undeclared.operation', context],
  ]) {
    assert.equal(host.invoke(input, metadata).status, 'refused');
    assert.deepEqual(state,before);
  }
  assert.equal(host.invoke(command,context).status,'changed');
});

test('Drawing observes stored colour separately from defaults and changes only the addressed object', () => {
  const state = initialCanonicalDrawingState();
  const host = createCanonicalDrawingHost({ state, instanceId: 'drawing-colour' });
  const invoke = (id, sop, version = host.observe().version) => host.invoke(sop, toolInvocationContext(id, version));
  assert.equal(invoke('first shape', '@add drawing.object.make kind="rectangle" color="#ff0000"').status, 'changed');
  assert.equal(invoke('second shape', '@add drawing.object.make kind="circle"').status, 'changed');
  const color = (object) => object.inputs.find((input) => input.binding === 'drawing.object.color');
  const before = host.observe();
  const [first, second] = before.objects.filter((object) => object.sourceType === 'art.draw.object');
  const beforeState = structuredClone(state);
  assert.deepEqual(color(first).values, ['"#ff0000"']);
  assert.deepEqual(color(second).values, []);
  color(first).values.push('"forged"');
  assert.deepEqual(color(host.observe().objects.find((object) => object.id === first.id)).values, ['"#ff0000"']);
  assert.deepEqual(state, beforeState);

  const change = '@change drawing.object.change ids="' + first.id + '" color="#123abc"';
  const changed = invoke('recolour', change, before.version);
  assert.equal(changed.status, 'changed');
  const after = host.observe();
  const afterState = structuredClone(state);
  const observed = after.objects.find((object) => object.id === first.id);
  assert.equal(observed.source, first.source);
  assert.deepEqual(color(observed).values, ['"#123abc"']);
  assert.deepEqual(toNativeDrawingState(state).objects[1], toNativeDrawingState(beforeState).objects[1]);
  assert.equal(toNativeDrawingState(state).history.length, toNativeDrawingState(beforeState).history.length + 1);

  assert.equal(invoke('equal recolour', change).status, 'unchanged');
  assert.equal(invoke('stale recolour', change, before.version).reason, 'stale-observation');
  assert.equal(invoke('unknown object', change.replace(first.id, 'missing')).status, 'refused');
  assert.equal(invoke('nonliteral colour', change.replace('#123abc', 'purple')).reason, 'invalid-native-color');
  assert.deepEqual(state, afterState);

  assert.equal(invoke('undo', '@undo drawing.undo').status, 'changed');
  assert.deepEqual(toNativeDrawingState(state).objects, toNativeDrawingState(beforeState).objects);
  assert.notEqual(host.observe().version, after.version);
  assert.equal(invoke('recolour', change, before.version).replayed, true);
  assert.deepEqual(toNativeDrawingState(state).objects, toNativeDrawingState(beforeState).objects);
  const restored = createCanonicalDrawingHost({ state: structuredClone(state), instanceId: 'restored-drawing' });
  assert.notEqual(restored.observe().objects.find((object) => object.id === first.id).source, first.source);
});
