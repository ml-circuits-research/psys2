import test from 'node:test';
import assert from 'node:assert/strict';
import {createDrawingHost, initialDrawingState} from '../worlds/art.draw/declared-host.mjs';
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
