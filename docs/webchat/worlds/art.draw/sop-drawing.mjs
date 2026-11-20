// SPDX-License-Identifier: AGPL-3.0-only
// The Drawing tab: the generic SOP area adapter over worlds/art.draw/area.sop.
import NATIVE_INTERFACE from './native-interface-source.mjs?v=fb1a68639c';
import AREA_SOURCES from './area-sources.mjs?v=5057cc4286';
import {BUNDLED_AREAS} from '../../lib/knowledge/bundled-areas.mjs?v=1cad66f270';
import {sopAreaAdapter} from '../sop-area-adapter.mjs?v=0f39ede72c';

const area = sopAreaAdapter({ world: 'art.draw', instance: ['w.drawing', 'w.face'], interfaceSource: NATIVE_INTERFACE, sources: AREA_SOURCES, offline: BUNDLED_AREAS['art.draw'] });
export const emptyDrawingState = area.empty, canonicalDrawingArea = area.canonical, createDrawingArea = area.create,
  projectDrawingArea = area.project, drawingAreaStateWorld = area.stateWorld;
