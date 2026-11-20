// SPDX-License-Identifier: AGPL-3.0-only
// The Avatar tab: the generic SOP area adapter over worlds/ui.avatar/area.sop.
import NATIVE_INTERFACE from './native-interface-source.mjs';
import AREA_SOURCES from './area-sources.mjs';
import {BUNDLED_AREAS} from '../../src/knowledge/bundled-areas.mjs';
import {sopAreaAdapter} from '../sop-area-adapter.mjs';

const area = sopAreaAdapter({ world: 'ui.avatar', instance: 'w.face', interfaceSource: NATIVE_INTERFACE, sources: AREA_SOURCES, offline: BUNDLED_AREAS['ui.avatar'] });
export const emptyAvatarState = area.empty, canonicalAvatarArea = area.canonical, createAvatarArea = area.create,
  projectAvatarArea = area.project, avatarAreaStateWorld = area.stateWorld;
