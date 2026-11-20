// SPDX-License-Identifier: AGPL-3.0-only
// The Diagram tab: the generic SOP area adapter over worlds/diagram.sketch/area.sop. Its interface composes the
// data.charts operations, which the area's act rules refuse (they are not part of its w.diagram instance).
import NATIVE_INTERFACE from './native-interface-source.mjs?v=c1b0403664';
import AREA_SOURCES from './area-sources.mjs?v=62deeb43ed';
import {BUNDLED_AREAS} from '../../lib/knowledge/bundled-areas.mjs?v=1cad66f270';
import {chartToolInterface} from '../data.charts/declared-host.mjs?v=ea39035f09';
import {sopAreaAdapter} from '../sop-area-adapter.mjs?v=6ce421b677';

const area = sopAreaAdapter({ world: 'diagram.sketch', instance: 'w.diagram', interfaceSource: NATIVE_INTERFACE, interfaceImports: { 'data.charts': chartToolInterface },
  sources: AREA_SOURCES, offline: BUNDLED_AREAS['diagram.sketch'] });
export const emptyDiagramState = area.empty, canonicalDiagramArea = area.canonical, createDiagramArea = area.create,
  projectDiagramArea = area.project, diagramAreaStateWorld = area.stateWorld;
