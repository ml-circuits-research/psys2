// SPDX-License-Identifier: AGPL-3.0-only
// The Avatar tab: the generic SOP area adapter over worlds/ui.avatar/area.sop.
import NATIVE_INTERFACE from './native-interface-source.mjs?v=488ad9f49d';
import AREA_SOURCES from './area-sources.mjs?v=adce5de422';
import {BUNDLED_AREAS} from '../../lib/knowledge/bundled-areas.mjs?v=62a24b2870';
import {sopAreaAdapter} from '../sop-area-adapter.mjs?v=791e6f6273';

const area = sopAreaAdapter({ world: 'ui.avatar', instance: ['w.face', 'w.preferences'], interfaceSource: NATIVE_INTERFACE, sources: AREA_SOURCES, offline: BUNDLED_AREAS['ui.avatar'] });
export const emptyAvatarState = area.empty, canonicalAvatarArea = area.canonical, createAvatarArea = area.create,
  projectAvatarArea = area.project, avatarAreaStateWorld = area.stateWorld;
