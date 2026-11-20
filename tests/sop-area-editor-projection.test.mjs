// What a tab's inspector shows of the selected object comes from the SOP area projection (worlds/sop-area.mjs
// projectSopArea): the observed inputs of each object (app.observe.input) and the box it occupies (app.observe.box),
// with numbers as numbers. The tab UIs read these values; they compute none of them.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {drawingState} from './drawing-state.mjs';
import {diagramState} from './diagram-state.mjs';
import {createDrawingArea,projectDrawingArea} from '../worlds/art.draw/sop-drawing.mjs';
import {createDiagramArea,projectDiagramArea} from '../worlds/diagram.sketch/sop-diagram.mjs';
import {toolInvocationContext} from '../worlds/native-tool-host.mjs';

const select = async (create, state, command) => {
  const host = await create({ state });
  const result = host.invoke(command, toolInvocationContext('select', host.observe().version));
  assert.ok(['changed', 'supported'].includes(result.status), command + ' -> ' + (result.reason ?? result.status));
};

test('a selected drawing object shows its colour, size, sides, label and box from the projection', async () => {
  const state = await drawingState([{ kind: 'circle', color: 'red', size: 120, label: 'Ball' }, { kind: 'house' }]);
  await select(createDrawingArea, state, '@s drawing.object.select id="o1"');
  const view = projectDrawingArea(state), object = view.objects.find((o) => o.id === view.selected);
  assert.equal(view.selected, 'o1');
  assert.equal(object.binding, 'drawing.object');
  assert.equal(Number(object.size), 120);
  assert.deepEqual({ color: view.inputs.o1.color, label: view.inputs.o1.label, width: view.inputs.o1.width, height: view.inputs.o1.height },
    { color: 'red', label: 'Ball', width: 120, height: 120 });
  assert.deepEqual(view.boxes.o1, { x0: Number(object.x) - 60, y0: Number(object.y) - 60, x1: Number(object.x) + 60, y1: Number(object.y) + 60 });
  assert.deepEqual(view.frame, { w: 1000, h: 700 });
  // The parts of the house are observed under it, each with its drawn colour.
  const parts = view.objects.filter((o) => o.in === 'o2' && o.binding === 'drawing.part');
  assert.ok(parts.length > 1 && parts.every((part) => view.inputs[part.id]?.color !== undefined), JSON.stringify(parts));
});

test('a selected diagram node shows its label, shape and colour from the projection', async () => {
  const state = await diagramState([{ kind: 'rectangle', label: 'Start', colour: 'blue' }, { kind: 'circle' }]);
  await select(createDiagramArea, state, '@s diagram.node.select ids="n1"');
  const view = projectDiagramArea(state), node = view.objects.find((o) => o.id === view.selected);
  assert.equal(view.selected, 'n1');
  assert.equal(node.binding, 'diagram.node');
  assert.equal(node.kind, 'rectangle');
  assert.equal(view.inputs.n1.label, 'Start');
  assert.equal(view.inputs.n1.colour, 'blue');
  assert.ok(Number(node.width) > 0 && Number(node.height) > 0);
});
