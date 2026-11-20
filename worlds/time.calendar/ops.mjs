// SPDX-License-Identifier: AGPL-3.0-only
// The time.calendar world's session seed. Every calendar command runs on its SOP area (worlds/time.calendar/area.sop,
// sop-calendar.mjs); this module only gives the session an empty area state to fill.
export { emptyCalendarArea as initialState } from './sop-calendar.mjs';
