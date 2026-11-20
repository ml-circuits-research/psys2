// SPDX-License-Identifier: AGPL-3.0-only
// The Drawing tab: the generic SOP area adapter over worlds/art.draw/area.sop.
import NATIVE_INTERFACE from './native-interface-source.mjs?v=be2f49df2d';
import AREA_SOURCES from './area-sources.mjs?v=ef806dbc2e';
import {BUNDLED_AREAS} from '../../lib/knowledge/bundled-areas.mjs?v=f639f6a52b';
import {sopAreaAdapter} from '../sop-area-adapter.mjs?v=15cb1a84ad';

const area = sopAreaAdapter({ world: 'art.draw', instance: ['w.drawing', 'w.face'], interfaceSource: NATIVE_INTERFACE, sources: AREA_SOURCES, offline: BUNDLED_AREAS['art.draw'] });
export const emptyDrawingState = area.empty, canonicalDrawingArea = area.canonical, createDrawingArea = area.create,
  projectDrawingArea = area.project, drawingAreaStateWorld = area.stateWorld;
