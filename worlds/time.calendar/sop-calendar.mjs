// SPDX-License-Identifier: AGPL-3.0-only
// The Calendar tab: the generic SOP area adapter over worlds/time.calendar/area.sop.
import NATIVE_INTERFACE from './native-interface-source.mjs';
import AREA_SOURCES from './area-sources.mjs';
import {BUNDLED_AREAS} from '../../src/knowledge/bundled-areas.mjs';
import {sopAreaAdapter} from '../sop-area-adapter.mjs';

const area = sopAreaAdapter({ world: 'time.calendar', instance: 'w.meetings', interfaceSource: NATIVE_INTERFACE, sources: AREA_SOURCES, offline: BUNDLED_AREAS['time.calendar'] });
export const emptyCalendarArea = area.empty, canonicalCalendarArea = area.canonical, createCalendarArea = area.create,
  projectCalendarArea = area.project, calendarAreaStateWorld = area.stateWorld;
