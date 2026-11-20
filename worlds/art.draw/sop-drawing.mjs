// SPDX-License-Identifier: AGPL-3.0-only
// The Drawing tab: the generic SOP area adapter over worlds/art.draw/area.sop.
import NATIVE_INTERFACE from './native-interface-source.mjs';
import AREA_SOURCES from './area-sources.mjs';
import {BUNDLED_AREAS} from '../../src/knowledge/bundled-areas.mjs';
import {sopAreaAdapter} from '../sop-area-adapter.mjs';

const area = sopAreaAdapter({ world: 'art.draw', instance: 'w.drawing', interfaceSource: NATIVE_INTERFACE, sources: AREA_SOURCES, offline: BUNDLED_AREAS['art.draw'] });
export const emptyDrawingState = area.empty, canonicalDrawingArea = area.canonical, createDrawingArea = area.create,
  projectDrawingArea = area.project, drawingAreaStateWorld = area.stateWorld;
