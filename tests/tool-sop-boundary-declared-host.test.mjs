import test from 'node:test';
import assert from 'node:assert/strict';
import {createDrawingArea, emptyDrawingState} from '../worlds/art.draw/sop-drawing.mjs';
import {toolInvocationContext} from '../worlds/native-tool-host.mjs';

const made = (host) => host.observe().objects.filter((object) => object.sourceType === 'art.draw.object' && !object.in);

test('Drawing consumes the compiled call, checks revision and deduplicates retries', async () => {
  const state = emptyDrawingState();
  const host = await createDrawingArea({state, instanceId:'drawing-page'});
  const call = '@call std.capability.call operation="drawing.object.make" argument=$kind\n@kind std.capability.arg name="kind" value="rectangle"';
  const context = toolInvocationContext('first gesture', host.observe().version);
  const receipt = host.invoke(call, context);
  assert.equal(receipt.status, 'changed');
  assert.equal(made(host).length, 1);
  assert.equal(host.invoke(call, context).replayed, true);
  assert.equal(host.invoke(call.replace('"rectangle"', '"circle"'), context).reason, 'invocation-reused');
  assert.equal(host.invoke(call, toolInvocationContext('second gesture', '0')).reason, 'stale-observation');
  assert.equal(made(host).length, 1);
});

test('A tool refuses object packets, incomplete call circuits and malformed invocation metadata before mutation', async () => {
  const state = emptyDrawingState();
  const host = await createDrawingArea({state, instanceId:'drawing-page'});
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

test('Drawing observes stored colour separately from defaults and changes only the addressed object', async () => {
  const state = emptyDrawingState();
  const host = await createDrawingArea({ state, instanceId: 'drawing-colour' });
  const invoke = (id, sop, version = host.observe().version) => host.invoke(sop, toolInvocationContext(id, version));
  assert.equal(invoke('first shape', '@add drawing.object.make kind="rectangle" color="#ff0000"').status, 'changed');
  assert.equal(invoke('second shape', '@add drawing.object.make kind="circle"').status, 'changed');
  const color = (object) => object.inputs.find((input) => input.binding === 'drawing.object.color');
  const before = host.observe();
  const [first, second] = made(host);
  const beforeState = structuredClone(state);
  assert.deepEqual(color(first).values, ['"#ff0000"']);
  assert.deepEqual(color(second)?.values ?? [], []);
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
  assert.deepEqual(after.objects.find((object) => object.id === second.id).inputs.map(({binding, values}) => [binding, values]), second.inputs.map(({binding, values}) => [binding, values]));

  assert.equal(invoke('equal recolour', change).status, 'unchanged');
  assert.equal(invoke('stale recolour', change, before.version).reason, 'stale-observation');
  assert.deepEqual(state, afterState);

  assert.equal(invoke('recolour', change, before.version).replayed, true);
  assert.deepEqual(state, afterState);
  const restored = await createDrawingArea({ state: structuredClone(state), instanceId: 'restored-drawing' });
  assert.notEqual(restored.observe().objects.find((object) => object.id === first.id).source, first.source);
});

test('a change to a missing object or with a colour that is not a literal is refused', {todo: 'the SOP drawing area answers unchanged for drawing.object.change on an unknown id and stores any colour text (for example "purple" or "#zzzzzz") instead of refusing it'}, async () => {
  const host = await createDrawingArea({ state: emptyDrawingState(), instanceId: 'drawing-refusals' });
  const invoke = (id, sop) => host.invoke(sop, toolInvocationContext(id, host.observe().version));
  assert.equal(invoke('first shape', '@add drawing.object.make kind="rectangle"').status, 'changed');
  const [shape] = made(host);
  assert.equal(invoke('unknown object', '@change drawing.object.change ids="missing" color="#123abc"').status, 'refused');
  assert.equal(invoke('nonliteral colour', '@change drawing.object.change ids="' + shape.id + '" color="purple"').status, 'refused');
});

test('drawing.undo restores the previous colour in the area itself', {todo: 'the SOP drawing area declares drawing.undo but compiles no undo rule; undo runs through the application journal instead'}, async () => {
  const host = await createDrawingArea({ state: emptyDrawingState(), instanceId: 'drawing-undo' });
  const invoke = (id, sop) => host.invoke(sop, toolInvocationContext(id, host.observe().version));
  invoke('first shape', '@add drawing.object.make kind="rectangle" color="#ff0000"');
  const [shape] = made(host);
  invoke('recolour', '@change drawing.object.change ids="' + shape.id + '" color="#123abc"');
  assert.equal(invoke('undo', '@undo drawing.undo').status, 'changed');
  assert.deepEqual(made(host)[0].inputs.find((input) => input.key === 'color').values, ['"#ff0000"']);
});
