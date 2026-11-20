// SPDX-License-Identifier: AGPL-3.0-only
// The Avatar tab: the generic SOP area adapter over worlds/ui.avatar/area.sop.
import NATIVE_INTERFACE from './native-interface-source.mjs?v=85fff1b7c4';
import AREA_SOURCES from './area-sources.mjs?v=2ef7b52e1a';
import {BUNDLED_AREAS} from '../../lib/knowledge/bundled-areas.mjs?v=85016e196d';
import {sopAreaAdapter} from '../sop-area-adapter.mjs?v=f99d1e78b1';

const area = sopAreaAdapter({ world: 'ui.avatar', instance: 'w.face', interfaceSource: NATIVE_INTERFACE, sources: AREA_SOURCES, offline: BUNDLED_AREAS['ui.avatar'] });
export const emptyAvatarState = area.empty, canonicalAvatarArea = area.canonical, createAvatarArea = area.create,
  projectAvatarArea = area.project, avatarAreaStateWorld = area.stateWorld;
