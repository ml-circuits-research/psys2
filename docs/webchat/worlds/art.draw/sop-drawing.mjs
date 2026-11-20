// SPDX-License-Identifier: AGPL-3.0-only
// The Drawing tab: the generic SOP area adapter over worlds/art.draw/area.sop.
import NATIVE_INTERFACE from './native-interface-source.mjs?v=78e2b692f8';
import AREA_SOURCES from './area-sources.mjs?v=836848732f';
import {BUNDLED_AREAS} from '../../lib/knowledge/bundled-areas.mjs?v=4161c95d0b';
import {sopAreaAdapter} from '../sop-area-adapter.mjs?v=fcd47bb3fb';

const area = sopAreaAdapter({ world: 'art.draw', instance: 'w.drawing', interfaceSource: NATIVE_INTERFACE, sources: AREA_SOURCES, offline: BUNDLED_AREAS['art.draw'] });
export const emptyDrawingState = area.empty, canonicalDrawingArea = area.canonical, createDrawingArea = area.create,
  projectDrawingArea = area.project, drawingAreaStateWorld = area.stateWorld;
