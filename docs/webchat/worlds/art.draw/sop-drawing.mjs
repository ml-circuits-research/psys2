// SPDX-License-Identifier: AGPL-3.0-only
// The Drawing tab: the generic SOP area adapter over worlds/art.draw/area.sop.
import NATIVE_INTERFACE from './native-interface-source.mjs?v=1e6a10b944';
import AREA_SOURCES from './area-sources.mjs?v=6c11f6c5e8';
import {BUNDLED_AREAS} from '../../lib/knowledge/bundled-areas.mjs?v=777e4ec0a3';
import {sopAreaAdapter} from '../sop-area-adapter.mjs?v=f475ad86b2';

const area = sopAreaAdapter({ world: 'art.draw', instance: ['w.drawing', 'w.face'], interfaceSource: NATIVE_INTERFACE, sources: AREA_SOURCES, offline: BUNDLED_AREAS['art.draw'] });
export const emptyDrawingState = area.empty, canonicalDrawingArea = area.canonical, createDrawingArea = area.create,
  projectDrawingArea = area.project, drawingAreaStateWorld = area.stateWorld;
