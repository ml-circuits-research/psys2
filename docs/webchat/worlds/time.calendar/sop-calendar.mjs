// SPDX-License-Identifier: AGPL-3.0-only
// The Calendar tab: the generic SOP area adapter over worlds/time.calendar/area.sop.
import NATIVE_INTERFACE from './native-interface-source.mjs?v=3945d7d8fa';
import AREA_SOURCES from './area-sources.mjs?v=4549dc5e36';
import {BUNDLED_AREAS} from '../../lib/knowledge/bundled-areas.mjs?v=25da087714';
import {sopAreaAdapter} from '../sop-area-adapter.mjs?v=96b41a8b58';

const area = sopAreaAdapter({ world: 'time.calendar', instance: 'w.meetings', interfaceSource: NATIVE_INTERFACE, sources: AREA_SOURCES, offline: BUNDLED_AREAS['time.calendar'] });
export const emptyCalendarArea = area.empty, canonicalCalendarArea = area.canonical, createCalendarArea = area.create,
  projectCalendarArea = area.project, calendarAreaStateWorld = area.stateWorld;
