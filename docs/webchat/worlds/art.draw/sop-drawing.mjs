// SPDX-License-Identifier: AGPL-3.0-only
// The Drawing tab: the generic SOP area adapter over worlds/art.draw/area.sop.
import NATIVE_INTERFACE from './native-interface-source.mjs?v=f4a3429198';
import AREA_SOURCES from './area-sources.mjs?v=2c74b95e3b';
import {BUNDLED_AREAS} from '../../lib/knowledge/bundled-areas.mjs?v=62a24b2870';
import {sopAreaAdapter} from '../sop-area-adapter.mjs?v=a27dcdd4c1';

const area = sopAreaAdapter({ world: 'art.draw', instance: ['w.drawing', 'w.face'], interfaceSource: NATIVE_INTERFACE, sources: AREA_SOURCES, offline: BUNDLED_AREAS['art.draw'] });
export const emptyDrawingState = area.empty, canonicalDrawingArea = area.canonical, createDrawingArea = area.create,
  projectDrawingArea = area.project, drawingAreaStateWorld = area.stateWorld;
