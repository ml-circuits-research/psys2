// SPDX-License-Identifier: AGPL-3.0-only
// The Drawing tab: the generic SOP area adapter over worlds/art.draw/area.sop.
import NATIVE_INTERFACE from './native-interface-source.mjs?v=c088b574a5';
import AREA_SOURCES from './area-sources.mjs?v=e6b7da64bf';
import {BUNDLED_AREAS} from '../../lib/knowledge/bundled-areas.mjs?v=9759c39928';
import {sopAreaAdapter} from '../sop-area-adapter.mjs?v=f99d1e78b1';

const area = sopAreaAdapter({ world: 'art.draw', instance: ['w.drawing', 'w.face'], interfaceSource: NATIVE_INTERFACE, sources: AREA_SOURCES, offline: BUNDLED_AREAS['art.draw'] });
export const emptyDrawingState = area.empty, canonicalDrawingArea = area.canonical, createDrawingArea = area.create,
  projectDrawingArea = area.project, drawingAreaStateWorld = area.stateWorld;
