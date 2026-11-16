// SPDX-License-Identifier: AGPL-3.0-only
// Calendar host primitives. No language reading, scheduling search, defaults or replies.
// See specs/29-calendar-host.md; the conversational world binding follows shared contracts.
const copy = (value) => structuredClone(value);
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const id = (value) => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value);
const keys = (value, allowed) => plain(value) && Object.keys(value).every((key) => allowed.includes(key));
const data = (value, seen = new Set(), depth = 0) => {
  if (depth > 8) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if ((!plain(value) && !Array.isArray(value)) || seen.has(value)) return false;
  seen.add(value);
  const ok = Object.values(value).every((item) => data(item, seen, depth + 1));
  seen.delete(value);
  return ok;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const canonical = (value, depth = 0) => {
  if (depth > 8) throw new TypeError('Invalid command nesting');
  return Array.isArray(value) ? value.map((item) => canonical(item, depth + 1)) : plain(value)
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key], depth + 1)])) : value;
};
const invalid = (code, detail = {}) => ({ code, ...detail });
const resourceKeys = ['id', 'label'];
const meetingKeys = ['id', 'title', 'start', 'duration', 'participants', 'room'];
const operations = new Set(['person.add', 'person.change', 'person.remove', 'room.add', 'room.change', 'room.remove',
  'meeting.add', 'meeting.change', 'meeting.move', 'meeting.remove', 'undo']);

function checkState(state) {
  for (const kind of ['people', 'rooms']) {
    const seen = new Set();
    for (const resource of state[kind]) {
      if (!keys(resource, resourceKeys) || !id(resource.id) || typeof resource.label !== 'string') return invalid('invalid_resource', { kind });
      if (seen.has(resource.id)) return invalid('duplicate_id', { id: resource.id });
      seen.add(resource.id);
    }
  }
  // IDs have one namespace, so every observation reference has one interpretation.
  const all = [...state.people, ...state.rooms, ...state.meetings].map((record) => record.id);
  if (new Set(all).size !== all.length) return invalid('duplicate_id');
  const people = new Set(state.people.map((p) => p.id)), rooms = new Set(state.rooms.map((r) => r.id));
  for (const meeting of state.meetings) {
    if (!keys(meeting, meetingKeys) || !id(meeting.id) || typeof meeting.title !== 'string'
      || !Number.isSafeInteger(meeting.start) || !Number.isSafeInteger(meeting.duration) || meeting.duration <= 0
      || !Number.isSafeInteger(meeting.start + meeting.duration)
      || Math.abs(meeting.start) > 8.64e15 || Math.abs(meeting.start + meeting.duration) > 8.64e15
      || !Array.isArray(meeting.participants) || meeting.participants.length === 0
      || new Set(meeting.participants).size !== meeting.participants.length
      || !(meeting.room === null || id(meeting.room))) return invalid('invalid_meeting', { id: meeting.id });
    const missing = meeting.participants.filter((person) => !people.has(person));
    if (missing.length || (meeting.room !== null && !rooms.has(meeting.room))) return invalid('missing_resource', { id: meeting.id });
  }
  return null;
}

/** A local, in-memory calendar. The caller supplies stable identity and fully resolved values. */
export function createCalendar({ instanceId, people = [], rooms = [], meetings = [] } = {}) {
  if (!id(instanceId) || ![people, rooms, meetings].every(Array.isArray)) throw new TypeError('Invalid calendar snapshot');
  let state = copy({ people, rooms, meetings }), version = 0;
  const issue = checkState(state);
  if (issue) throw new TypeError(`Invalid calendar snapshot: ${issue.code}`);
  const receipts = new Map(), history = [];
  const observe = () => ({ instanceId, version, complete: true, timeUnit: 'millisecond', timeOrigin: 'unix',
    facts: copy([...state.people.map((p) => ({ kind: 'person', ...p })),
      ...state.rooms.map((r) => ({ kind: 'room', ...r })), ...state.meetings.map((m) => ({ kind: 'meeting', ...m }))]) });
  const fail = (code, detail = {}) => ({ ok: false, status: 'refused', instanceId, version, issue: invalid(code, detail) });

  function call(command) {
    if (!data(command) || !keys(command, ['operationId', 'expectedVersion', 'operation', 'args']) || !id(command.operationId)
      || !Number.isSafeInteger(command.expectedVersion) || command.expectedVersion < 0 || !plain(command.args)
      || !operations.has(command.operation)) return fail('invalid_command');
    const fingerprint = JSON.stringify(canonical(command));
    const previous = receipts.get(command.operationId);
    if (previous) return previous.fingerprint === fingerprint
      ? { ...copy(previous.result), replayed: true, currentVersion: version } : fail('operation_id_reused');
    if (command.expectedVersion !== version) return fail('stale_version');
    const { operation, args } = command;
    let candidate = copy(state), undone = null;
    if (operation === 'undo') {
      if (!keys(args, ['operationId']) || !id(args.operationId)) return fail('invalid_arguments');
      const last = history.at(-1);
      if (!last || last.operationId !== args.operationId) return fail('not_latest_change');
      candidate = copy(last.before);
      undone = last.operationId;
    } else {
      const [kind, action] = operation.split('.');
      const list = candidate[kind === 'person' ? 'people' : kind === 'room' ? 'rooms' : 'meetings'];
      const allowed = action === 'remove' ? ['id'] : action === 'move' ? ['id', 'start'] : kind === 'meeting' ? meetingKeys : resourceKeys;
      if (!keys(args, allowed) || !id(args.id)) return fail('invalid_arguments');
      const index = list.findIndex((record) => record.id === args.id);
      if (action === 'add') {
        if (index !== -1) return fail('duplicate_id', { id: args.id });
        list.push(copy(args));
      } else {
        if (index === -1) return fail('not_found', { id: args.id });
        if (action === 'remove') list.splice(index, 1);
        else {
          if (action === 'move' && !Object.hasOwn(args, 'start')) return fail('invalid_arguments');
          list[index] = { ...list[index], ...copy(args) };
        }
      }
    }
    const issue = checkState(candidate);
    if (issue) return fail(issue.code, issue);
    if (same(state, candidate)) return fail('no_change');
    const beforeVersion = version;
    if (undone) history.pop();
    else history.push({ operationId: command.operationId, before: copy(state) });
    state = candidate;
    version++;
    const result = { ok: true, status: 'executed', instanceId, operationId: command.operationId, operation,
      beforeVersion, afterVersion: version, currentVersion: version, replayed: false,
      ...(undone ? { undone } : { undo: { operationId: command.operationId } }), observation: observe() };
    receipts.set(command.operationId, { fingerprint, result: copy(result) });
    return result;
  }
  return Object.freeze({ observe, call });
}
