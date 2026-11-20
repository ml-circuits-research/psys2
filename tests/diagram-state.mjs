// Test helpers for the Diagram tab's SOP area (worlds/diagram.sketch/area.sop): a state made through the area's own
// commands, and the nodes and edges of a state read back from its w.diagram facts. No knowledge of the old JS format.
import {createDiagramArea,emptyDiagramState,diagramAreaStateWorld} from '../worlds/diagram.sketch/sop-diagram.mjs';
import {toolInvocationContext} from '../worlds/native-tool-host.mjs';

const quote = (value) => typeof value === 'number' ? String(value) : JSON.stringify(String(value));
const value = (raw) => raw === undefined ? undefined : raw.startsWith('"') ? JSON.parse(raw) : /^-?\d+(\.\d+)?$/.test(raw) ? Number(raw) : raw;

/** A Diagram state with these nodes, made in order: [{kind, label?, colour?, x?, y?}]. Codes are n1, n2... */
export async function diagramState(nodes = []) {
  const state = emptyDiagramState(), host = await createDiagramArea({ state });
  nodes.forEach((node, n) => {
    const args = Object.entries(node).map(([key, v]) => key + '=' + quote(v)).join(' ');
    const result = host.invoke('@c diagram.node.make ' + args, toolInvocationContext('fixture-' + n, host.observe().version));
    if (result.status !== 'changed') throw Error('diagram-fixture-refused:' + JSON.stringify(node) + ':' + (result.reason ?? result.status));
  });
  return state;
}

/** The nodes of a Diagram state in the order they were made: [{id, kind, label, colour, size, value, x, y, pinned}]. */
export function diagramNodes(state) {
  return diagramAreaStateWorld(state).ofType('w.diagram.node').map((fact) => {
    const a = (key) => value(fact.attrs[key]?.[0]);
    return { id: a('code'), kind: a('shape'), label: a('label'), colour: a('colour'), size: a('size'), value: a('value'), x: a('x'), y: a('y'), pinned: a('pinned'), n: a('n') };
  }).sort((p, q) => p.n - q.n);
}

/** The edges of a Diagram state: [{id, from, to, label}] with node codes. */
export function diagramEdges(state) {
  const world = diagramAreaStateWorld(state), code = (ref) => world.get(ref.slice(1))?.attrs.code[0];
  return world.ofType('w.diagram.edge').map((fact) => ({ id: fact.attrs.code[0], from: code(fact.attrs.from[0]), to: code(fact.attrs.to[0]), label: value(fact.attrs.label?.[0]) }));
}
