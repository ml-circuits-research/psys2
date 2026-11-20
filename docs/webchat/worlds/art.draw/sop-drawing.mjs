// SPDX-License-Identifier: AGPL-3.0-only
// The Drawing tab: the generic SOP area adapter over worlds/art.draw/area.sop.
import NATIVE_INTERFACE from './native-interface-source.mjs?v=afabeecb4f';
import AREA_SOURCES from './area-sources.mjs?v=535a1dc924';
import {BUNDLED_AREAS} from '../../lib/knowledge/bundled-areas.mjs?v=7c126abd3d';
import {sopAreaAdapter} from '../sop-area-adapter.mjs?v=e5af35262f';

const area = sopAreaAdapter({ world: 'art.draw', instance: ['w.drawing', 'w.face'], interfaceSource: NATIVE_INTERFACE, sources: AREA_SOURCES, offline: BUNDLED_AREAS['art.draw'] });
export const emptyDrawingState = area.empty, canonicalDrawingArea = area.canonical, createDrawingArea = area.create,
  projectDrawingArea = area.project, drawingAreaStateWorld = area.stateWorld;
