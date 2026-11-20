// SPDX-License-Identifier: AGPL-3.0-only
// The Documents tab: the generic SOP area adapter over worlds/docs.editor/area.sop. Its state is a w.document
// instance (a document, its blocks in order, list items, table cells and marks); the area's rules compile every
// native Documents command and set the page that is drawn and observed.
import NATIVE_INTERFACE from './native-interface-source.mjs?v=e247358200';
import AREA_SOURCES from './area-sources.mjs?v=760257725b';
import {BUNDLED_AREAS} from '../../lib/knowledge/bundled-areas.mjs?v=a8ac70dc44';
import {sopAreaAdapter} from '../sop-area-adapter.mjs?v=1ba11d347e';

const area = sopAreaAdapter({ world: 'docs.editor', instance: 'w.document', interfaceSource: NATIVE_INTERFACE, sources: AREA_SOURCES, offline: BUNDLED_AREAS['docs.editor'] });
export const emptyDocumentArea = area.empty, canonicalDocumentArea = area.canonical, createDocumentArea = area.create,
  projectDocumentArea = area.project, documentAreaStateWorld = area.stateWorld;
