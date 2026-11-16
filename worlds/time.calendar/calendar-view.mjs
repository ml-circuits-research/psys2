// SPDX-License-Identifier: AGPL-3.0-only
// Read-only calendar view, independent of the request reader and the browser DOM.
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Render one complete local observation. UTC is explicit; local-time resolution belongs upstream. */
export function renderCalendar(observation) {
  if (observation?.timeUnit !== 'millisecond' || observation?.timeOrigin !== 'unix'
    || observation.complete !== true || !Array.isArray(observation.facts)) throw new TypeError('Expected a complete calendar observation');
  const names = new Map(observation.facts.map((fact) => [fact.id, fact.label]));
  const rows = observation.facts.filter((fact) => fact.kind === 'meeting')
    .slice().sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  return `<section aria-label="Calendar" data-version="${escape(observation.version)}"><h2>Calendar</h2>`
    + '<table><caption>Meeting times in UTC</caption><thead><tr><th>Meeting</th><th>Start</th><th>End</th><th>People</th><th>Room</th></tr></thead><tbody>'
    + rows.map((meeting) => `<tr data-id="${escape(meeting.id)}"><td>${escape(meeting.title)}</td>`
      + `<td>${escape(new Date(meeting.start).toISOString())}</td><td>${escape(new Date(meeting.start + meeting.duration).toISOString())}</td>`
      + `<td>${escape(meeting.participants.map((person) => names.get(person) ?? person).join(', '))}</td>`
      + `<td>${escape(meeting.room === null ? 'No room' : names.get(meeting.room) ?? meeting.room)}</td></tr>`).join('')
    + `</tbody></table>${rows.length ? '' : '<p>No meetings.</p>'}</section>`;
}
