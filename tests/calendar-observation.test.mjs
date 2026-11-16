import test from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar, calendarObservationIssue } from '../worlds/time.calendar/calendar-tool.mjs';
import { compareCalendarObservations as compare, compareCalendarReceipt as confirm } from '../worlds/time.calendar/calendar-observation.mjs';
const create = () => createCalendar({ instanceId: 'source-a', people: [{ id: 'p', label: 'Same' }, { id: 'q', label: 'Same' }], rooms: [{ id: 'room', label: 'Room' }] });
const call = (tool, operationId, operation, args) => tool.call({ operationId, expectedVersion: tool.observe().version, operation, args });
const meeting = { id: 'event', title: 'Discussion', start: 1000, duration: 60000, participants: ['p', 'q'], room: null };

test('observation differences preserve native identity and changed fields', () => {
  const tool = create(), before = tool.observe();
  const receipt = call(tool, 'add', 'meeting.add', meeting), after = tool.observe();
  const result = confirm({ before, receipt, after });
  assert.equal(result.status, 'confirmed');
  assert.deepEqual(result.comparison.changes.map((c) => [c.id, c.change]), [['event', 'added']]);
  result.comparison.changes[0].after.participants.push('external');
  assert.deepEqual(tool.observe(), after);
  const changed = call(tool, 'rename', 'person.change', { id: 'q', label: 'Renamed' });
  const difference = compare(after, changed.observation);
  assert.deepEqual(difference.changes.map((c) => [c.id, c.fields]), [['q', ['label']]]);
  const preRemove = tool.observe();
  call(tool, 'remove', 'meeting.remove', { id: 'event' });
  assert.equal(compare(preRemove, tool.observe()).changes[0].change, 'removed');
});

test('record order and participant set order do not create changes', () => {
  const tool = create(); call(tool, 'add', 'meeting.add', meeting);
  const before = tool.observe(), after = structuredClone(before);
  after.facts.reverse(); after.facts.find((f) => f.id === 'event').participants.reverse();
  assert.equal(compare(before, after).stateEqual, true);
  assert.equal(compare(before, after).versionChanged, false);
});

test('missing, partial, stale and conflicting snapshots never establish absence', () => {
  const before = create().observe();
  assert.equal(compare(before, null).reason, 'missing_observation');
  assert.equal(compare(before, { ...before, complete: false, facts: [] }).reason, 'incomplete_observation');
  assert.equal(compare(before, { ...before, instanceId: 'source-b' }).reason, 'different_instance');
  assert.equal(compare({ ...before, version: 2 }, { ...before, version: 1 }).reason, 'older_observation');
  assert.equal(compare(before, { ...before, facts: [] }).reason, 'same_version_conflict');
  assert.equal(calendarObservationIssue({ ...before, facts: [...before.facts, before.facts[0]] }).code, 'duplicate_id');
  assert.equal(calendarObservationIssue({ ...before, facts: [null] }).code, 'invalid_fact');
  assert.equal(calendarObservationIssue({ ...before, timeUnit: 'second' }).code, 'invalid_observation');
});

test('acknowledgement is not confirmation without the actual post-read', () => {
  const tool = create(), before = tool.observe();
  const receipt = call(tool, 'add', 'meeting.add', meeting);
  assert.equal(confirm({ before, receipt, after: null }).status, 'unknown');
  assert.equal(confirm({ before, receipt: { ...receipt, observation: undefined }, after: tool.observe() }).status, 'unknown');
  const conflict = tool.observe(); conflict.facts.find((f) => f.id === 'event').title = 'Different';
  assert.equal(confirm({ before, receipt, after: conflict }).reason, 'same_version_conflict');
});

test('replayed receipts and concurrent changes do not claim a new current execution', () => {
  const tool = create(), before = tool.observe();
  const command = { operationId: 'add', expectedVersion: 0, operation: 'meeting.add', args: meeting };
  const receipt = tool.call(command), atReceipt = tool.observe();
  const replay = tool.call(command);
  const repeated = confirm({ before: atReceipt, receipt: replay, after: tool.observe() });
  assert.equal(repeated.status, 'receipt_replay'); assert.equal(repeated.newExecution, false);
  call(tool, 'move', 'meeting.move', { id: 'event', start: 5000 });
  assert.equal(confirm({ before, receipt, after: tool.observe() }).status, 'historical');
  const laterReplay = tool.call(command);
  assert.equal(confirm({ before: tool.observe(), receipt: laterReplay, after: tool.observe() }).status, 'historical');
  assert.equal(confirm({ before: atReceipt, receipt: laterReplay, after: atReceipt }).reason, 'observation_older_than_receipt');
});

test('undo returning equal values still advances source version', () => {
  const tool = create(), before = tool.observe();
  call(tool, 'add', 'meeting.add', meeting);
  call(tool, 'undo', 'undo', { operationId: 'add' });
  const result = compare(before, tool.observe());
  assert.equal(result.stateEqual, true); assert.equal(result.versionChanged, true);
  assert.deepEqual(result.changes, []);
});

test('a refused operation is not an observed execution', () => {
  const tool = create(), before = tool.observe();
  const receipt = tool.call({ operationId: 'stale', expectedVersion: 2, operation: 'meeting.add', args: meeting });
  const result = confirm({ before, receipt, after: tool.observe() });
  assert.equal(result.status, 'not_executed'); assert.equal(result.comparison.stateEqual, true);
  assert.equal(confirm({ before, receipt: { ...receipt, instanceId: 'other' }, after: tool.observe() }).status, 'unknown');
  assert.equal(confirm({ before, receipt: { ...receipt, version: 9 }, after: tool.observe() }).status, 'unknown');
});
