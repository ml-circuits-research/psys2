// SPDX-License-Identifier: AGPL-3.0-only
// A SOP area's place in the application, for any tab: the state carrier, host creation with the application's
// catalog (or the generated offline subset), the view projection and the persisted instance world. Nothing here
// names a tab; each tab passes its world id, its native interface, its area files and its offline subset.
import {World, parse, serialize} from '../src/vendor/sopworld/sopworld.mjs';
import {createSopArea, initialSopAreaState, projectSopArea} from './sop-area.mjs';

export const emptyAreaState = () => ({ sop: '', runtime: { view: {} } });

export function canonicalAreaState(state) {
  const view = state?.runtime?.view;
  return { sop: typeof state?.sop === 'string' ? state.sop : '', runtime: { view: view && typeof view === 'object' ? { ...view } : {} } };
}

/**
 * world: the tab's world id. interfaceSource: its native-interface SOP. sources: its area files ({'world/file': text}).
 * offline: the generated catalog subset ({path: text}, with its own index.json). instance: the instance module id.
 */
export function sopAreaAdapter({ world, interfaceSource, interfaceImports = {}, sources, offline, instance }) {
  const loader = { readFile: async (owner, file) => sources[owner + '/' + file] ?? null };
  const readOffline = async (file) => { if (!Object.hasOwn(offline, file)) throw Error('not-bundled:' + file); return offline[file]; };
  let readCatalog = null, catalogKnowledge = null;
  async function create({ state = emptyAreaState(), instanceId = world + '.prepared', identityRegistry, knowledge, args } = {}) {
    // The application's catalog when it has one, else the offline subset of the pinned catalog.
    if (typeof knowledge?.readText === 'function' && knowledge !== catalogKnowledge) { catalogKnowledge = knowledge; readCatalog = (file) => knowledge.readText(file); }
    // A state that is not this area's carrier is refused, never read as an empty area.
    if (state === null || typeof state !== 'object' || typeof (state.sop ?? '') !== 'string' || Object.keys(state).some((key) => !['sop', 'runtime'].includes(key))) throw Error('invalid-area-state');
    if (state.sop) stateWorld(state);
    const options = { world, interfaceSource, interfaceImports, loader, readCatalog: readCatalog ?? readOffline };
    if (!state.sop) Object.assign(state, await initialSopAreaState(options));
    return createSopArea({ ...options, state, instanceId, identityRegistry, args });
  }
  // The instance schemas' declarations (types, slots, constraints); their own data facts are knowledge, not state. An
  // area may hold several instance modules (instance: a list, the first the main one).
  const instances = [].concat(instance);
  const declarations = instances.map((id) => serialize(parse(offline[id + '/schema.sop']).filter((wire) =>
    Object.values(wire.attrs).flat().some((token) => token.startsWith('?')) || (wire.type.startsWith('core.') && wire.type !== 'core.word')))).join('\n');
  function stateWorld(state) {
    const live = new World();
    // Instance kinds extend std.schema.thing; its declarations come with the library.
    if (!live.load('@area.state.schema core.use world=std.schema\n' + declarations).ok) throw Error('area-schema-unavailable');
    const kinds = new Set([...live.matrix.values()].filter((node) => node.type === 'core.type').map((type) => type.attrs.of[0]).filter((type) => instances.some((id) => type.startsWith(id + '.'))));
    if (state?.sop) {
      if (parse(state.sop).some((wire) => wire.pattern || !kinds.has(wire.type))) throw Error('area-state-foreign-fact');
      if (!live.tell(state.sop, { factsOnly: true }).ok) throw Error('invalid-area-state');
    }
    return live;
  }
  return { empty: emptyAreaState, canonical: canonicalAreaState, create, prepare: create, stateWorld,
    project: (state) => projectSopArea(world, canonicalAreaState(state)) };
}
