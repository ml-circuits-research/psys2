// Test helpers for the Drawing tab's SOP area (worlds/art.draw/area.sop): a state with given objects, made through
// the area's own commands (so codes, layers and stored values are what the area itself writes), and the objects of
// a state read back. No knowledge of the old JS Drawing format.
import {createDrawingArea,emptyDrawingState,projectDrawingArea} from '../worlds/art.draw/sop-drawing.mjs';
import {toolInvocationContext} from '../worlds/native-tool-host.mjs';

const quote = (value) => typeof value === 'number' ? String(value) : JSON.stringify(String(value));

/** A Drawing state with these objects, made in order: [{kind, color?, x?, y?, size?, label?, name?}]. Codes are o1, o2... */
export async function drawingState(objects = []) {
  const state = emptyDrawingState(), host = await createDrawingArea({ state });
  objects.forEach((object, n) => {
    const args = Object.entries(object).filter(([key]) => !['id', 'code'].includes(key)).map(([key, value]) => key + '=' + quote(value)).join(' ');
    const result = host.invoke('@c drawing.object.make ' + args, toolInvocationContext('fixture-' + n, host.observe().version));
    if (result.status !== 'changed') throw Error('drawing-fixture-refused:' + JSON.stringify(object) + ':' + (result.reason ?? result.status));
  });
  return state;
}

const value = (raw) => raw === undefined ? undefined : raw.startsWith('"') ? JSON.parse(raw) : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;
/** The objects of a Drawing state: [{id, kind, color, x, y, size, label, name, width, height, z}], in layer order. */
export function drawingObjects(state) {
  return [...(state?.sop ?? '').matchAll(/^@\S+ w\.drawing\.object (.*)$/gm)].map(([, rest]) => {
    const attrs = Object.fromEntries([...rest.matchAll(/(\w+)=("(?:[^"\\]|\\.)*"|\S+)/g)].map(([, key, raw]) => [key, value(raw)]));
    return { id: attrs.code, kind: attrs.drawing, color: attrs.colour, x: attrs.x, y: attrs.y, size: attrs.size, label: attrs.label, name: attrs.name, width: attrs.width, height: attrs.height, z: attrs.z };
  }).sort((a, b) => a.z - b.z);
}

/** What the tab draws for a state: the SVG and the observed objects. */
export const drawingView = (state) => projectDrawingArea(state);
