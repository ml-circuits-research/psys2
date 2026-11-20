// SPDX-License-Identifier: AGPL-3.0-only
// The Diagram tab: the generic SOP area adapter over worlds/diagram.sketch/area.sop. Its interface composes the
// data.charts operations, which the area's act rules refuse (they are not part of its w.diagram instance).
import NATIVE_INTERFACE from './native-interface-source.mjs?v=40a9c109d0';
import AREA_SOURCES from './area-sources.mjs?v=ad8339bb03';
import {BUNDLED_AREAS} from '../../lib/knowledge/bundled-areas.mjs?v=676be4d666';
import {chartToolInterface} from '../data.charts/declared-host.mjs?v=6ce3a5dc5d';
import {sopAreaAdapter} from '../sop-area-adapter.mjs?v=25639c5373';

const area = sopAreaAdapter({ world: 'diagram.sketch', instance: ['w.diagram', 'w.preferences'], interfaceSource: NATIVE_INTERFACE, interfaceImports: { 'data.charts': chartToolInterface },
  sources: AREA_SOURCES, offline: BUNDLED_AREAS['diagram.sketch'] });
export const emptyDiagramState = area.empty, canonicalDiagramArea = area.canonical, createDiagramArea = area.create,
  projectDiagramArea = area.project, diagramAreaStateWorld = area.stateWorld;
