// SPDX-License-Identifier: AGPL-3.0-only
// The Avatar tab's place in the application: its state is the SOP area declared by area.sop. This adapter
// only passes the application's loader and catalog reader to the generic area.
import {World,parse,serialize} from '../../src/vendor/sopworld/sopworld.mjs';
import NATIVE_INTERFACE from './native-interface-source.mjs';
import {createSopArea,initialSopAreaState,projectSopArea} from '../sop-area.mjs';
import {readBundledAvatar,BUNDLED_AVATAR_FILES} from '../../src/knowledge/bundled-avatar.mjs';
import AREA_SOURCES from './area-sources.mjs';

const bundledLoader = { readFile: async (world, file) => AREA_SOURCES[world + '/' + file] ?? null };

const WORLD = 'ui.avatar';
let context = null;

export const emptyAvatarState = () => ({ sop: '', runtime: { view: {} } });

export function canonicalAvatarArea(state) {
  const view = state?.runtime?.view;
  return { sop: typeof state?.sop === 'string' ? state.sop : '', runtime: { view: view && typeof view === 'object' ? { ...view } : {} } };
}

export async function createAvatarArea({ state = emptyAvatarState(), instanceId = 'ui.avatar.prepared', identityRegistry, knowledge } = {}) {
  // The catalog when the application has one, else the generated offline subset of the pinned catalog.
  const readCatalog = typeof knowledge?.readText === 'function' ? (file) => knowledge.readText(file) : context?.readCatalog ?? readBundledAvatar;
  context = { loader: bundledLoader, readCatalog };   // the area's own SOP files ship with the application (area-sources.mjs)
  const options = { world: WORLD, interfaceSource: NATIVE_INTERFACE, ...context };
  if (!state.sop) Object.assign(state, await initialSopAreaState(options));
  return createSopArea({ ...options, state, instanceId, identityRegistry });
}

export const projectAvatarArea = (state) => projectSopArea(WORLD, canonicalAvatarArea(state));

/** The instance facts as a world under the instance schema (persistence and inspection): only facts of its own kinds. */
const INSTANCE = 'w.face';
// The schema's declarations only (types, slots, constraints): its own data facts are knowledge, not instance state.
const declarations = serialize(parse(BUNDLED_AVATAR_FILES[INSTANCE + '/schema.sop']).filter((wire) => Object.values(wire.attrs).flat().some((token) => token.startsWith('?')) || (wire.type.startsWith('core.') && wire.type !== 'core.word')));
export function avatarAreaStateWorld(state) {
  const world = new World();
  if (!world.load(declarations).ok) throw Error('avatar-schema-unavailable');
  const kinds = new Set([...world.matrix.values()].filter((node) => node.type === 'core.type').map((type) => type.attrs.of[0]).filter((type) => type.startsWith(INSTANCE + '.')));
  if (state?.sop) {
    if (parse(state.sop).some((wire) => wire.pattern || !kinds.has(wire.type))) throw Error('avatar-state-foreign-fact');
    if (!world.tell(state.sop, { factsOnly: true }).ok) throw Error('invalid-avatar-state');
  }
  return world;
}
