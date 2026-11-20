import { World, parse } from '../vendor/sopworld/sopworld.mjs?v=b95dcf7c63';
import SCHEMA from '../../worlds/app.project/browser-state-schema-source.mjs?v=4a57796ad4';
import BINDINGS from '../../worlds/app.project/browser-state-bindings-source.mjs?v=53d366b5c4';

const first = (wire, key) => wire.attrs[key]?.[0];
const invalid = () => Error('Invalid browser state SOP.');

export function createBrowserStateInput({ registries }) {
  const schema = new World({ library: { 'app.browser.state': SCHEMA } });
  schema.load(BINDINGS);
  const bindings = new Map(schema.ofType('app.browser.state.binding').map(row => [first(row, 'input'), row]));
  return (session, sop) => {
    if (typeof sop !== 'string' || sop.length > 2048) throw invalid();
    const rows = parse(sop);
    if (!rows.length || rows.length > bindings.size || new Set(rows.map(row => row.id)).size !== rows.length ||
        rows.some(row => row.pattern || !bindings.has(row.type) || Object.keys(row.attrs).some(key => key.startsWith('core.')))) throw invalid();
    if (!schema.fork().tell(rows, { factsOnly: true }).ok) throw invalid();
    const changes = new Map();
    for (const row of rows) {
      const binding = bindings.get(row.type), world = first(binding, 'world'), field = first(binding, 'field');
      const patch = changes.get(world) ?? {};
      if (Object.hasOwn(patch, field)) throw invalid();
      const registry = first(binding, 'registry');
      if (registry && !registries[registry]?.has(first(row, 'value'))) throw invalid();
      const fixed = first(binding, 'fixed');
      const value = fixed ?? first(row, 'value');
      const kind = schema.schema(row.type).keys.value?.kind;
      patch[field] = fixed === 'null' ? null : kind === 'boolean' ? value === 'true' : value;
      changes.set(world, patch);
    }
    for (const [world, patch] of changes) session.setWorldState(world, patch);
    return Object.fromEntries(changes);
  };
}

export function inspectBrowserStateInput(loaded) {
  const tool = 'browser:state-input-tool', bindings = 'execution:browser-state-bindings', schema = 'execution:browser-state-schema';
  return {
    nodes: [
      { id: tool, label: 'Browser state input', kind: 'interpreter', implementation: 'JavaScript state adapter',
        description: 'Applies validated browser observations and the Settings forget-person tool to their bound fields.',
        details: { source: 'src/dialog/browser-state-input.mjs', loaded, inputs: ['SOP Lang command or observation'] } },
      { id: bindings, label: 'Browser state bindings', kind: 'knowledge', implementation: 'SOP Lang binding facts',
        description: 'Binds the shell observations and the forget-person tool to their exact state fields.',
        wires: BINDINGS, details: { source: 'worlds/app.project/browser-state-bindings.sop', loaded } },
      { id: schema, label: 'app.browser.state', kind: 'schema', implementation: 'SOP Lang schema module',
        description: 'Declares the permitted browser inputs, field types and binding vocabulary.',
        wires: SCHEMA, details: { source: 'worlds/app.project/browser-state-schema.sop', loaded } },
    ],
    edges: [
      { from: 'project:application', to: tool, label: 'receives host observations through' },
      { from: tool, to: bindings, label: 'applies declared bindings from' },
      { from: tool, to: schema, label: 'validates input against' },
      { from: bindings, to: schema, label: 'imports schema' },
    ],
  };
}
