import {toNativeDiagramState} from '../worlds/diagram.sketch/canonical-state.mjs';
import { test } from 'node:test';
import {toNativeDrawingState} from '../worlds/art.draw/canonical-state.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { invokeNativeControl } from '../src/dialog/native-tool-controls.mjs';
import { invokeObservedNativeTool } from '../src/dialog/native-tool-activity.mjs';
import { createDrawingHost, initialDrawingState } from '../worlds/art.draw/declared-host.mjs';
import { initialDiagramState } from '../worlds/diagram.sketch/declared-host.mjs';
import { initialCanonicalDocumentState } from '../worlds/docs.editor/declared-host.mjs';
import { toNativeDocumentState } from '../worlds/docs.editor/canonical-state.mjs';
import { initialCalendarState, toNativeCalendarState } from '../worlds/time.calendar/declared-host.mjs';
import { initialAvatarState } from '../worlds/ui.avatar/declared-host.mjs';
import { toNativeAvatarState } from '../worlds/ui.avatar/canonical-state.mjs';

test('the shared native control route executes recorded SOP in all editor areas', async () => {
  const state = {
    'art.draw': initialDrawingState(),
    'diagram.sketch': initialDiagramState(),
    'docs.editor': initialCanonicalDocumentState(),
    'time.calendar': initialCalendarState(),
    'ui.avatar': initialAvatarState(),
  };
  const activity = [];
  const session = {
    isession: { state },
    engine: {
      loader: { readFile: (world, file) => readFile(new URL(`../worlds/${world}/${file}`, import.meta.url), 'utf8') },
      onWorldActivity: (event) => activity.push(event),
    },
  };
  const cases = [
    ['draw', 'drawing.object.make', { kind: 'circle', x: 120, y: 130 }, () => toNativeDrawingState(state['art.draw']).objects[0]?.x, 120],
    ['diagram', 'diagram.node.make', { kind: 'rectangle', x: 230, y: 240 }, () => toNativeDiagramState(state['diagram.sketch']).shapes[0]?.y, 240],
    ['editor', 'document.write', { title: 'Report', blocks: [{ kind: 'paragraph', text: 'Measured' }] },
      () => toNativeDocumentState(state['docs.editor']).blocks[0]?.text, 'Measured'],
    ['calendar', 'calendar.event.add', { id: 'visit', title: 'Visit', start: 2000, duration: 100 },
      () => toNativeCalendarState(state['time.calendar']).meetings[0]?.title, 'Visit'],
    ['avatar', 'avatar.face.expression', { expression: 'happy' },
      () => toNativeAvatarState(state['ui.avatar']).face.expression, 'happy'],
  ];
  for (const [view, operation, args, observe, expected] of cases) {
    const result = await invokeNativeControl(session, { view, operation, args });
    assert.equal(result.receipt.status, 'changed', view);
    assert.equal(observe(), expected, view);
    const event = activity.find((row) => row.operation === operation && row.phase === 'start');
    assert.equal(event.sop, result.intentRecord.wires, view);
    assert.deepEqual(event.args, result.intentRecord.tool.args, view);
  }
  assert.match(activity.find((event) => event.operation === 'document.write' && event.phase === 'start').sop, /app\.control\.intent/);
});

test('native dispatch requires valid SOP and resolves only the live host declaration', async () => {
  const state = initialDrawingState();
  const host = createDrawingHost({ state, instanceId: 'compiled-dispatch' });
  const area = { world: 'art.draw' };
  const expectedVersion = host.observe().version;
  const before = structuredClone(state);
  await assert.rejects(() => invokeObservedNativeTool({}, {
    area, host, expectedVersion, operation: 'drawing.object.make', args: { kind: 'circle' },
  }), /invalid-control-intent/);
  await assert.rejects(() => invokeObservedNativeTool({}, {
    area, host, expectedVersion, sop: '@invalid rogue.operation kind="circle"',
  }), /undeclared-native-control/);
  assert.deepEqual(state, before);
  const receipt = await invokeObservedNativeTool({}, {
    area, host, expectedVersion, sop: '@call drawing.object.make kind="circle" x=100 y=150',
  });
  assert.equal(receipt.status, 'changed');
  assert.deepEqual([state.objects[0].x, state.objects[0].y], [100, 150]);
});
