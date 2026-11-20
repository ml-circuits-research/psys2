// SPDX-License-Identifier: AGPL-3.0-only
// The Diagram tab: the generic SOP area adapter over worlds/diagram.sketch/area.sop. Its interface composes the
// data.charts operations, which the area's act rules refuse (they are not part of its w.diagram instance).
import NATIVE_INTERFACE from './native-interface-source.mjs?v=bf7b6f9ec2';
import AREA_SOURCES from './area-sources.mjs?v=3e2179fd24';
import {BUNDLED_AREAS} from '../../lib/knowledge/bundled-areas.mjs?v=f639f6a52b';
import {chartToolInterface} from '../data.charts/declared-host.mjs?v=8c63101c10';
import {sopAreaAdapter} from '../sop-area-adapter.mjs?v=ce0f6408ed';

const area = sopAreaAdapter({ world: 'diagram.sketch', instance: 'w.diagram', interfaceSource: NATIVE_INTERFACE, interfaceImports: { 'data.charts': chartToolInterface },
  sources: AREA_SOURCES, offline: BUNDLED_AREAS['diagram.sketch'] });
export const emptyDiagramState = area.empty, canonicalDiagramArea = area.canonical, createDiagramArea = area.create,
  projectDiagramArea = area.project, diagramAreaStateWorld = area.stateWorld;
