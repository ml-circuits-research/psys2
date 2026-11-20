// SPDX-License-Identifier: AGPL-3.0-only
// The Diagram tab: the generic SOP area adapter over worlds/diagram.sketch/area.sop. Its interface composes the
// data.charts operations, which the area's act rules refuse (they are not part of its w.diagram instance).
import NATIVE_INTERFACE from './native-interface-source.mjs?v=faacd6758b';
import AREA_SOURCES from './area-sources.mjs?v=4c9f6a26b4';
import {BUNDLED_AREAS} from '../../lib/knowledge/bundled-areas.mjs?v=7c126abd3d';
import {chartToolInterface} from '../data.charts/declared-host.mjs?v=e372c72f84';
import {sopAreaAdapter} from '../sop-area-adapter.mjs?v=e5af35262f';

const area = sopAreaAdapter({ world: 'diagram.sketch', instance: ['w.diagram', 'w.preferences'], interfaceSource: NATIVE_INTERFACE, interfaceImports: { 'data.charts': chartToolInterface },
  sources: AREA_SOURCES, offline: BUNDLED_AREAS['diagram.sketch'] });
export const emptyDiagramState = area.empty, canonicalDiagramArea = area.canonical, createDiagramArea = area.create,
  projectDiagramArea = area.project, diagramAreaStateWorld = area.stateWorld;
