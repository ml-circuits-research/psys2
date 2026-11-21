// The SOP instance owns journal membership, identity and ordering. Native
// editor payloads are held by its concrete journal tool under opaque references.
import { parse, quote, serialize, str } from '../vendor/sopworld/sopworld.mjs?v=bee14f8b59';
import { historyPolicy } from './history-policy.mjs?v=e051f9cf0e';
import { budget } from './budget.mjs?v=d42dc656e7';

const prefix = 'app.history.';
const fields = (row, key) => row.attrs[key];
const field = (row, key) => fields(row, key)?.[0];
const text = (row, key) => str(field(row, key));
const position = row => Number(field(row, 'position'));
const byPosition = (a, b) => position(a) - position(b);
const wire = (id, type, attrs) => ({ id, type: prefix + type, attrs, pattern: false });
const identity = () => globalThis.crypto.randomUUID();
const keyOf = direction => direction === 'undo' ? 'newEngineUndo' : 'newEngineRedo';
const entryRows = world => world.ofType(prefix + 'entry');
const stackHeads = world => world.ofType(prefix + 'stackHead');
const membership = (world, direction) => entryRows(world).filter(row => field(row, 'direction') === direction).sort(byPosition);
const stack = (world, direction) => world.ofType(prefix + 'stack').find(row => field(row, 'direction') === direction);
const nextPosition = world => Math.max(0, ...entryRows(world).map(position)) + 1;

function append(world, payload, direction) {
 const id = identity();
 const worlds = Object.keys(payload.before ?? {});
 const row = wire('history.entry.' + id, 'entry', {
  payload: [quote(id)], view: [quote(payload.area)], direction: [direction],
  position: [String(nextPosition(world))], revision: [quote(identity())], world: worlds.map(quote),
 });
 if (!world.tell(serialize([row]), { factsOnly: true }).ok) throw Error('invalid-journal-entry');
 return id;
}

function remove(world, payloads, rows) {
 for (const row of rows) {
  budget.tick('history.journal.expiry');
  if (!world.retract(row.id).ok) throw Error('journal-expiry-failed');
  delete payloads[text(row, 'payload')];
 }
}
function trim(world, payloads, direction) {
 const capacity = Number(field(stack(world, direction), 'capacity'));
 const rows = membership(world, direction);
 remove(world, payloads, rows.slice(0, Math.max(0, rows.length - capacity)));
}

function install(session, world, payloads, epoch = identity()) {
 const attached = !!session.historyJournal;
 session.historyJournal = { world, payloads, epoch };
 if (attached) return;
 for (const direction of ['undo', 'redo']) {
  budget.tick('history.journal.ports');
  const key = keyOf(direction);
  Object.defineProperty(session, key, {
   configurable: true,
   get: () => historyPayloads(session, direction),
   set: entries => replaceStack(session, direction, entries),
  });
 }
}
function emptyJournal() {
 const world = historyPolicy().fork();
 world.load(serialize([wire('history.instance', 'journal', { identity: [quote(identity())] })]));
 return world;
}
function replaceStack(session, direction, entries) {
 const { world, payloads, epoch } = session.historyJournal;
 const trial = world.fork(), retained = { ...payloads };
 const capacity = Number(field(stack(trial, direction), 'capacity'));
 remove(trial, retained, membership(trial, direction));
 for (const payload of (Array.isArray(entries) ? entries : []).slice(-capacity)) {
  budget.tick('history.journal.legacy');
  retained[append(trial, payload, direction)] = payload;
 }
 install(session, trial, retained, epoch);
}
export function initializeHistory(session) {
 if (!session.historyJournal) {
  const undo = session.newEngineUndo, redo = session.newEngineRedo;
  install(session, emptyJournal(), {});
  if (undo?.length) replaceStack(session, 'undo', undo);
  if (redo?.length) replaceStack(session, 'redo', redo);
 }
 return session.historyJournal;
}

export function historyPayloads(session, direction) {
 const existing = session.historyJournal;
 return existing ? membership(existing.world, direction).map(row => existing.payloads[text(row, 'payload')])
  : session[keyOf(direction)] ?? [];
}
export function recordHistory(session, payload) {
 const { world, payloads, epoch } = initializeHistory(session);
 const trial = world.fork(), retained = { ...payloads };
 const primary = trial.ofType(prefix + 'stack').find(row => field(row, 'primary') === 'true');
 const direction = field(primary, 'direction'), opposite = field(primary, 'opposite');
 remove(trial, retained, membership(trial, opposite).filter(row => text(row, 'view') === payload.area));
 retained[append(trial, payload, direction)] = payload;
 trim(trial, retained, direction);
 install(session, trial, retained, epoch);
}

function headRecord(journal, row) {
 const entry = journal.world.get(field(row, 'entry').slice(1)), key = text(entry, 'payload');
 return {
  direction: field(row, 'direction'), view: text(row, 'view'), key,
  id: journal.epoch + ':' + text(entry, 'revision'), entry: journal.payloads[key],
 };
}
export function historyHeads(session, view) {
 const journal = initializeHistory(session);
 return stackHeads(journal.world).filter(row => text(row, 'view') === view).map(row => headRecord(journal, row));
}
export function stageHistoryMove(session, head) {
 const { world, payloads, epoch } = initializeHistory(session);
 const trial = world.fork(), retained = { ...payloads };
 const move = wire('history.advance', 'advance', {
  action: ['move-history-head'], order: ['1'], 'arg.payload': [quote(head.key)],
  'arg.position': [String(nextPosition(trial))], 'arg.revision': [quote(identity())],
 });
 const changed = trial.act(serialize([move]));
 if (!changed.ok) throw Error('history-head-move-failed');
 trim(trial, retained, field(stack(trial, head.direction), 'opposite'));
 return () => install(session, trial, retained, epoch);
}

export function captureHistory(session, copy = true) {
 const { world, payloads } = initializeHistory(session);
 const rows = [...world.ofType(prefix + 'journal'), ...entryRows(world).sort(byPosition)];
 return { sop: serialize(rows), payloads: copy ? structuredClone(payloads) : { ...payloads } };
}
export function restoreHistory(session, archive, legacy = {}, copy = true) {
 if (!archive) {
  install(session, emptyJournal(), {});
  if (legacy.newEngineUndo?.length) replaceStack(session, 'undo', structuredClone(legacy.newEngineUndo));
  if (legacy.newEngineRedo?.length) replaceStack(session, 'redo', structuredClone(legacy.newEngineRedo));
  return true;
 }
 try {
  if (typeof archive.sop !== 'string' || archive.sop.length > 128_000 || !archive.payloads || Array.isArray(archive.payloads)) return false;
  const rows = parse(archive.sop), world = historyPolicy().fork();
  const capacity = world.ofType(prefix + 'stack').reduce((total,row)=>total + Number(field(row, 'capacity')),0);
  if (rows.length > capacity + 1 || rows.filter(row => row.type === prefix + 'journal').length !== 1 ||
      rows.some(row => ![prefix + 'journal', prefix + 'entry'].includes(row.type))) return false;
  if (!world.tell(archive.sop, { factsOnly: true }).ok) return false;
  const entries = entryRows(world), keys = Object.keys(archive.payloads);
  if (keys.length !== entries.length ||
      ['undo', 'redo'].some(direction => membership(world, direction).length > Number(field(stack(world, direction), 'capacity')))) return false;
  for (const entry of entries) {
   budget.tick('history.journal.restore');
   const key = text(entry, 'payload'), payload = archive.payloads[key];
   const worlds = fields(entry, 'world').map(str).sort();
   if (!/^[a-f0-9-]{36}$/.test(key) || entry.id !== 'history.entry.' + key || !Object.hasOwn(archive.payloads, key)
       || !payload || payload.area !== text(entry, 'view') || !payload.before || !payload.after ||
       [payload.before, payload.after].some(value => JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(worlds))) return false;
  }
  install(session, world, copy ? structuredClone(archive.payloads) : { ...archive.payloads });
  return true;
 } catch {
  return false;
 }
}

export function inspectHistoryJournal(session) {
 const journal = session?.historyJournal;
 if (!journal) return null;
 const { world } = journal, [instance] = world.ofType(prefix + 'journal');
 return {
  identity: text(instance, 'identity'),
  wires: serialize([instance, ...entryRows(world).sort(byPosition), ...stackHeads(world)]),
  undo: membership(world, 'undo').length, redo: membership(world, 'redo').length,
 };
}
