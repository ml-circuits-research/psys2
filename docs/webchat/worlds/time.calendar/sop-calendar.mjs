// SPDX-License-Identifier: AGPL-3.0-only
// The Calendar tab: the generic SOP area adapter over worlds/time.calendar/area.sop.
import NATIVE_INTERFACE from './native-interface-source.mjs?v=3945d7d8fa';
import AREA_SOURCES from './area-sources.mjs?v=a53c154f8c';
import {BUNDLED_AREAS} from '../../lib/knowledge/bundled-areas.mjs?v=a8ac70dc44';
import {sopAreaAdapter} from '../sop-area-adapter.mjs?v=9e71a771d8';

const area = sopAreaAdapter({ world: 'time.calendar', instance: 'w.meetings', interfaceSource: NATIVE_INTERFACE, sources: AREA_SOURCES, offline: BUNDLED_AREAS['time.calendar'] });
export const emptyCalendarArea = area.empty, canonicalCalendarArea = area.canonical, createCalendarArea = area.create,
  projectCalendarArea = area.project, calendarAreaStateWorld = area.stateWorld;
