// SPDX-License-Identifier: AGPL-3.0-only
// The Drawing tab: the generic SOP area adapter over worlds/art.draw/area.sop.
import NATIVE_INTERFACE from './native-interface-source.mjs?v=e3ecef4ac1';
import AREA_SOURCES from './area-sources.mjs?v=e57e8d6b6c';
import {BUNDLED_AREAS} from '../../lib/knowledge/bundled-areas.mjs?v=a8ac70dc44';
import {sopAreaAdapter} from '../sop-area-adapter.mjs?v=1ef9d4713a';

const area = sopAreaAdapter({ world: 'art.draw', instance: ['w.drawing', 'w.face'], interfaceSource: NATIVE_INTERFACE, sources: AREA_SOURCES, offline: BUNDLED_AREAS['art.draw'] });
export const emptyDrawingState = area.empty, canonicalDrawingArea = area.canonical, createDrawingArea = area.create,
  projectDrawingArea = area.project, drawingAreaStateWorld = area.stateWorld;
