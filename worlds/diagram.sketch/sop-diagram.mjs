// SPDX-License-Identifier: AGPL-3.0-only
// The Diagram tab: the generic SOP area adapter over worlds/diagram.sketch/area.sop. Its interface composes the
// data.charts operations, which the area's act rules refuse (they are not part of its w.diagram instance).
import NATIVE_INTERFACE from './native-interface-source.mjs';
import AREA_SOURCES from './area-sources.mjs';
import {BUNDLED_AREAS} from '../../src/knowledge/bundled-areas.mjs';
import {chartToolInterface} from '../data.charts/declared-host.mjs';
import {sopAreaAdapter} from '../sop-area-adapter.mjs';

const area = sopAreaAdapter({ world: 'diagram.sketch', instance: 'w.diagram', interfaceSource: NATIVE_INTERFACE, interfaceImports: { 'data.charts': chartToolInterface },
  sources: AREA_SOURCES, offline: BUNDLED_AREAS['diagram.sketch'] });
export const emptyDiagramState = area.empty, canonicalDiagramArea = area.canonical, createDiagramArea = area.create,
  projectDiagramArea = area.project, diagramAreaStateWorld = area.stateWorld;
