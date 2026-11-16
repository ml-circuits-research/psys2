import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../worlds/time.calendar/calendar-tool.mjs';
import { renderCalendar } from '../worlds/time.calendar/calendar-view.mjs';

const initial = () => ({ instanceId: 'test.calendar', people: [{ id: 'p1', label: 'Person One' }, { id: 'p2', label: 'Person Two' }], rooms: [{ id: 'r1', label: 'Room One' }, { id: 'r2', label: 'Room Two' }] });
const meeting = (id, start, participants = ['p1'], room = 'r1') => ({ id, title: id, start, duration: 60000, participants, room });
const command = (tool, operation, args, operationId = `op.${tool.observe().version}`) => ({ operationId, expectedVersion: tool.observe().version, operation, args });
const call = (tool, operation, args, operationId) => tool.call(command(tool, operation, args, operationId));

test('calendar observations preserve overlapping bookings; policy belongs to the world', () => {
  const booked = [meeting('a', 0), meeting('b', 30000)];
  const tool = createCalendar({ ...initial(), meetings: booked });
  assert.deepEqual(tool.observe().facts.filter((f) => f.kind === 'meeting').map(({ kind, ...record }) => record), booked);
  const added = call(tool, 'meeting.add', meeting('c', 45000));
  assert.equal(added.ok, true, 'the tool must not hard-code the world overlap deny');
  assert.deepEqual(added.observation, tool.observe());
  const moved = call(tool, 'meeting.move', { id: 'c', start: 0 }, 'move');
  assert.equal(moved.ok, true, 'moving into an overlap is representable host state');
  assert.equal(tool.observe().facts.find((f) => f.id === 'c').start, 0);
  assert.equal(call(tool, 'undo', { operationId: 'move' }, 'undo.move').ok, true);
  assert.equal(tool.observe().facts.find((f) => f.id === 'c').start, 45000);
});

test('invalid input and resource references are atomic refusals', () => {
  const tool = createCalendar(initial()), before = tool.observe();
  for (const fields of [{ duration: 0 }, { duration: -1 }, { start: NaN }, { start: '0' }, { start: 8.64e15 }, { participants: ['missing'] }, { participants: ['p1', 'p1'] }, { participants: [] }, { room: 'missing' }, { unrecognised: true }]) {
    assert.equal(call(tool, 'meeting.add', { ...meeting('m', 0), ...fields }).ok, false);
    assert.deepEqual(tool.observe(), before);
  }
  assert.equal(call(tool, 'meeting.add', meeting('m', 0)).ok, true);
  assert.equal(call(tool, 'person.remove', { id: 'p1' }).issue.code, 'missing_resource');
  assert.equal(call(tool, 'room.remove', { id: 'r1' }).issue.code, 'missing_resource');
  assert.equal(call(tool, 'person.add', { id: 'm', label: 'Duplicate' }).issue.code, 'duplicate_id');
  assert.equal(call(tool, 'meeting.move', { id: 'm' }).issue.code, 'invalid_arguments');
  assert.equal(call(tool, 'meeting.change', { id: 'm' }).issue.code, 'no_change');
  assert.equal(tool.call({}).issue.code, 'invalid_command');
  assert.equal(call(tool, 'person.add', { id: 'extra', label: () => 'not data' }).issue.code, 'invalid_command');
  const cyclic = {}; cyclic.self = cyclic;
  assert.equal(call(tool, 'person.add', cyclic).issue.code, 'invalid_command');
  let nested = {}; for (let i = 0; i < 20; i++) nested = { child: nested };
  assert.equal(call(tool, 'person.add', nested).issue.code, 'invalid_command');
});

test('versions and operation identity prevent stale and repeated effects', () => {
  const tool = createCalendar(initial());
  const first = command(tool, 'meeting.add', meeting('m', 0), 'create');
  assert.equal(tool.call(first).afterVersion, 1);
  const stale = { ...command(tool, 'meeting.move', { id: 'm', start: 60000 }, 'move'), expectedVersion: 0 };
  assert.equal(tool.call(stale).issue.code, 'stale_version');
  assert.equal(call(tool, 'meeting.move', { id: 'm', start: 60000 }, 'move').afterVersion, 2);
  const retry = tool.call(first);
  assert.equal(retry.replayed, true);
  assert.equal(retry.afterVersion, 1);
  assert.equal(retry.currentVersion, 2);
  assert.equal(tool.observe().facts.find((f) => f.id === 'm').start, 60000);
  assert.equal(tool.call({ ...first, args: { ...first.args, title: 'Other' } }).issue.code, 'operation_id_reused');
});

test('each change family can be undone without rolling versions back', () => {
  const seed = { ...initial(), meetings: [meeting('m', 0)] };
  const cases = [
    ['person.add', { id: 'p3', label: 'Three' }], ['person.change', { id: 'p2', label: 'Other' }], ['person.remove', { id: 'p2' }],
    ['room.add', { id: 'r3', label: 'Three' }], ['room.change', { id: 'r2', label: 'Other' }], ['room.remove', { id: 'r2' }],
    ['meeting.add', meeting('n', 60000)], ['meeting.change', { id: 'm', duration: 30000 }], ['meeting.move', { id: 'm', start: 60000 }], ['meeting.remove', { id: 'm' }],
  ];
  for (const [operation, args] of cases) {
    const tool = createCalendar(seed), before = tool.observe();
    const action = command(tool, operation, args, 'change');
    assert.equal(tool.call(action).ok, true, operation);
    assert.equal(call(tool, 'undo', { operationId: 'change' }, 'undo').ok, true, operation);
    assert.deepEqual(tool.observe().facts, before.facts, operation);
    assert.equal(tool.observe().version, 2, operation);
    assert.equal(tool.call(action).replayed, true, operation);
    assert.equal(tool.observe().version, 2, operation);
  }
});

test('undo preserves intervening changes and observations cannot mutate the store', () => {
  const seed = initial(), tool = createCalendar(seed);
  seed.people[0].label = 'Mutated input';
  const first = call(tool, 'meeting.add', meeting('m', 0), 'one');
  first.observation.facts[0].label = 'Mutated receipt';
  const snapshot = tool.observe(); snapshot.facts.length = 0;
  assert.equal(tool.observe().facts[0].label, 'Person One');
  call(tool, 'person.change', { id: 'p2', label: 'New label' }, 'two');
  assert.equal(call(tool, 'undo', { operationId: 'one' }, 'undo.one').issue.code, 'not_latest_change');
  assert.equal(call(tool, 'undo', { operationId: 'two' }, 'undo.two').ok, true);
  assert.equal(call(tool, 'undo', { operationId: 'one' }, 'undo.one').ok, true);
  assert.equal(tool.observe().version, 4);
  assert.deepEqual(tool.observe().facts.filter((f) => f.kind === 'meeting'), []);
});

test('the read-only view renders ordered UTC times and escapes untrusted labels', () => {
  const tool = createCalendar({ ...initial(), meetings: [{ ...meeting('late', 60000, ['p2'], null), title: '<script>bad</script>' }, meeting('early', 0)] });
  const observation = tool.observe(), before = structuredClone(observation);
  const html = renderCalendar(observation);
  assert.ok(html.indexOf('data-id="early"') < html.indexOf('data-id="late"'));
  assert.match(html, /1970-01-01T00:00:00.000Z/);
  assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.match(html, /No room/);
  assert.doesNotMatch(html, /<script>/);
  assert.deepEqual(observation, before);
  assert.throws(() => renderCalendar({ ...observation, complete: false }), /complete/);
  assert.throws(() => createCalendar({ ...initial(), meetings: [meeting('bad', 0, ['missing'])] }), /missing_resource/);
});
