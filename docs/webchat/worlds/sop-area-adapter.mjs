// SPDX-License-Identifier: AGPL-3.0-only
// A SOP area's place in the application, for any tab: the state carrier, host creation with the application's
// catalog (or the generated offline subset), the view projection and the persisted instance world. Nothing here
// names a tab; each tab passes its world id, its native interface, its area files and its offline subset.
import {World, parse, serialize} from '../lib/vendor/sopworld/sopworld.mjs?v=f63db0e6f1';
import {createSopArea, initialSopAreaState, projectSopArea} from './sop-area.mjs?v=b187877fc5';

export const emptyAreaState = () => ({ sop: '', runtime: { view: {} } });

export function canonicalAreaState(state) {
  const view = state?.runtime?.view;
  return { sop: typeof state?.sop === 'string' ? state.sop : '', runtime: { view: view && typeof view === 'object' ? { ...view } : {} } };
}

/**
 * world: the tab's world id. interfaceSource: its native-interface SOP. sources: its area files ({'world/file': text}).
 * offline: the generated catalog subset ({path: text}, with its own index.json). instance: the instance module id.
 */
export function sopAreaAdapter({ world, interfaceSource, sources, offline, instance }) {
  const loader = { readFile: async (owner, file) => sources[owner + '/' + file] ?? null };
  const readOffline = async (file) => { if (!Object.hasOwn(offline, file)) throw Error('not-bundled:' + file); return offline[file]; };
  let readCatalog = null;
  async function create({ state = emptyAreaState(), instanceId = world + '.prepared', identityRegistry, knowledge } = {}) {
    // The application's catalog when it has one, else the offline subset of the pinned catalog.
    if (typeof knowledge?.readText === 'function') readCatalog = (file) => knowledge.readText(file);
    const options = { world, interfaceSource, loader, readCatalog: readCatalog ?? readOffline };
    if (!state.sop) Object.assign(state, await initialSopAreaState(options));
    return createSopArea({ ...options, state, instanceId, identityRegistry });
  }
  // The instance schema's declarations (types, slots, constraints); its own data facts are knowledge, not state.
  const declarations = serialize(parse(offline[instance + '/schema.sop']).filter((wire) =>
    Object.values(wire.attrs).flat().some((token) => token.startsWith('?')) || (wire.type.startsWith('core.') && wire.type !== 'core.word')));
  function stateWorld(state) {
    const live = new World();
    // Instance kinds extend std.schema.thing; its declarations come with the library.
    if (!live.load('@area.state.schema core.use world=std.schema\n' + declarations).ok) throw Error('area-schema-unavailable');
    const kinds = new Set([...live.matrix.values()].filter((node) => node.type === 'core.type').map((type) => type.attrs.of[0]).filter((type) => type.startsWith(instance + '.')));
    if (state?.sop) {
      if (parse(state.sop).some((wire) => wire.pattern || !kinds.has(wire.type))) throw Error('area-state-foreign-fact');
      if (!live.tell(state.sop, { factsOnly: true }).ok) throw Error('invalid-area-state');
    }
    return live;
  }
  return { empty: emptyAreaState, canonical: canonicalAreaState, create, prepare: create, stateWorld,
    project: (state) => projectSopArea(world, canonicalAreaState(state)) };
}
