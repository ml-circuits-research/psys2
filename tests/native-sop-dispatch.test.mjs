import {diagramNodes} from './diagram-state.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {describeNativeControl} from '../src/dialog/native-control-intent.mjs';
import {prepareNativeControlHost} from '../src/dialog/native-control-preparation.mjs';
import { invokeNativeControl } from '../src/dialog/native-tool-controls.mjs';
import { invokeObservedNativeTool } from '../src/dialog/native-tool-activity.mjs';
import { createDrawingArea, emptyDrawingState as initialDrawingState } from '../worlds/art.draw/sop-drawing.mjs';
import { drawingObjects } from './drawing-state.mjs';
import { emptyDiagramState as initialDiagramState } from '../worlds/diagram.sketch/sop-diagram.mjs';
import { initialCanonicalDocumentState } from '../worlds/docs.editor/declared-host.mjs';
import { toNativeDocumentState } from '../worlds/docs.editor/canonical-state.mjs';
import {emptyCalendarArea,calendarAreaStateWorld} from '../worlds/time.calendar/sop-calendar.mjs';
import {str as sopText} from '../src/vendor/sopworld/sopworld.mjs';
const calendarThings=(state,kind)=>calendarAreaStateWorld(state).ofType('w.meetings.'+kind).map(fact=>Object.fromEntries(Object.entries(fact.attrs).map(([key,values])=>[key,values.length===1?(values[0].startsWith('"')?sopText(values[0]):values[0]):values])));
import { emptyAvatarState } from '../worlds/ui.avatar/sop-avatar.mjs';
import { avatarAreaStateWorld } from '../worlds/ui.avatar/sop-avatar.mjs';

test('the shared native control route executes recorded SOP in all editor areas', async () => {
  const state = {
    'art.draw': initialDrawingState(),
    'diagram.sketch': initialDiagramState(),
    'docs.editor': initialCanonicalDocumentState(),
    'time.calendar': emptyCalendarArea(),
    'ui.avatar': emptyAvatarState(),
  };
  await assert.rejects(invokeNativeControl({isession:{state}}, {view:'draw',operation:'drawing.object.make',args:{kind:'house'}}), /invalid-control-intent/);
  const activity = [];
  const session = {
    isession: { state },
    engine: {
      loader: { readFile: (world, file) => readFile(new URL(`../worlds/${world}/${file}`, import.meta.url), 'utf8') },
      onWorldActivity: (event) => activity.push(event),
    },
  };
  const cases = [
    ['draw', 'drawing.object.make', { kind: 'circle', x: 120, y: 130 }, () => drawingObjects(state['art.draw'])[0]?.x, 120],
    ['diagram', 'diagram.node.make', { kind: 'rectangle', x: 230, y: 240 }, () => diagramNodes(state['diagram.sketch'])[0]?.y, 240],
    ['editor', 'document.write', { title: 'Report', blocks: [{ kind: 'paragraph', text: 'Measured' }] },
      () => toNativeDocumentState(state['docs.editor']).blocks[0]?.text, 'Measured'],
    ['calendar', 'calendar.event.add', { id: 'visit', title: 'Visit', start: 2000, duration: 100 },
      () => calendarThings(state['time.calendar'],'meeting')[0]?.title, 'Visit'],
    ['avatar', 'avatar.face.expression', { expression: 'happy' },
      () => avatarAreaStateWorld(state['ui.avatar']).ofType('w.face.face')[0]?.attrs.expression?.[0], 'happy'],
  ];
  for (const [view, operation, args, observe, expected] of cases) {
    const host = await prepareNativeControlHost(session, {view});
    const declaration = host.bindings().find(entry => entry.id === operation);
    const input = describeNativeControl({operation: declaration, args}).wires;
    const result = await invokeNativeControl(session, {view, sop: input});
    assert.equal(result.intentRecord.wires, input);
    assert.equal(result.receipt.status, 'changed', view);
    assert.equal(observe(), expected, view);
    const event = activity.find((row) => row.operation === operation && row.phase === 'start');
    assert.equal(event.sop, result.intentRecord.wires, view);
    assert.deepEqual(event.args, result.intentRecord.tool.args, view);
  }
  const undo='@gesture std.request source=$words mood=do act=undo\n@words std.request.source text="Undo my drawing edit."';
  const restored=await invokeNativeControl(session,{view:'draw',sop:undo});
  assert.equal(restored.intentRecord.inputSop,undo);
  assert.equal(restored.intentRecord.text,'Undo my drawing edit.');
  assert.equal(drawingObjects(state['art.draw']).length,0);
  assert.match(activity.find((event) => event.operation === 'document.write' && event.phase === 'start').sop, /app\.control\.intent/);
});

test('native dispatch requires valid SOP and resolves only the live host declaration', async () => {
  const state = initialDrawingState();
  const host = await createDrawingArea({ state, instanceId: 'compiled-dispatch' });
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
  assert.deepEqual([drawingObjects(state)[0].x, drawingObjects(state)[0].y], [100, 150]);
});
