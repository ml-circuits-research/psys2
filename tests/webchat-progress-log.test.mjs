// PROGRESS service, USER-ACTIONS event log, generic state diff and the format-3 export (docs/webchat/ui/progress.mjs, action-log.mjs, state-diff.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProgress, PROGRESS_KEY } from '../docs/webchat/ui/progress.mjs';
import { createEventLog, buildEvent, tapKind, reactionOf } from '../docs/webchat/ui/action-log.mjs';
import { snapshotState, describeChanges, changesText } from '../docs/webchat/ui/state-diff.mjs';
import { toJSON, buildRecord } from '../docs/webchat/ui/phrase-log.mjs';
import { parseExport, normalizeRecord, timeline } from '../scripts/analyze-phrase-log.mjs';

const memStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m }; };

test('progress: a plan is weighted by the last start, steps are recorded with times, failures show once', () => {
  const storage = memStorage();
  storage.setItem(PROGRESS_KEY, JSON.stringify({ page: { ms: 100 }, model: { ms: 900 } }));
  let t = 0; const recs = [];
  const pg = createProgress({ storage, document: null, now: () => t, onStep: (r) => recs.push(r) });
  pg.plan('startup', [{ id: 'page', label: 'page code' }, { id: 'model', label: 'reading model' }]);
  assert.equal(pg.fraction, 0);
  pg.start('page', 'page code'); t = 100; pg.end('page', { bytes: 2048 });
  assert.ok(Math.abs(pg.fraction - 0.1) < 1e-9, 'the page step weighs 100 of 1000');
  pg.start('model', 'reading model'); pg.step('model', 'downloading the model', 450, 900); t = 1000;
  assert.ok(Math.abs(pg.fraction - 0.1 - 0.9 * 0.5) < 1e-9);
  pg.fail('model', 'The reading model could not be loaded', 'the rules answer');
  pg.fail('model', 'The reading model could not be loaded', 'the rules answer');
  assert.equal(pg.view().failures.length, 1, 'one failure line');
  assert.deepEqual(recs.map((r) => [r.id, r.ok, r.ms]), [['page', true, 100], ['model', false, 900]]);
  assert.equal(JSON.parse(storage.getItem(PROGRESS_KEY)).page.bytes, 2048, 'timings and sizes are stored for the next start');
});

test('progress: an ad-hoc task has its own bar and ends', () => {
  const pg = createProgress({ storage: memStorage(), document: null });
  pg.start('draw', 'Loading drawings: farm animals');
  assert.equal(pg.view().label, 'Loading drawings: farm animals');
  assert.equal(pg.view().fraction, null);
  pg.step('draw', 'Loading drawings: farm animals', 1, 4);
  assert.equal(pg.view().fraction, 0.25);
  pg.end('draw');
  assert.equal(pg.view().busy, false);
});

test('state diff: one generic diff, in words', () => {
  const before = { 'geo.map': { center: { lat: 25, lon: 10 }, zoom: 2, markers: [], nextId: 1 }, 'art.draw': { things: [{ id: 1, kind: 'tree' }] }, 'ui.avatar': { face: { glasses: 'round' } } };
  const after = { 'geo.map': { center: { lat: 15.435, lon: 30.22 }, zoom: 5, markers: [{ id: 2, name: 'Khartoum' }], nextId: 2 }, 'art.draw': { things: [{ id: 1, kind: 'tree' }, { id: 2, kind: 'elephant' }, { id: 3, kind: 'elephant' }] }, 'ui.avatar': { face: {} } };
  const c = describeChanges(snapshotState(before), snapshotState(after));
  const text = changesText(c);
  assert.match(text, /geo\.map: .*center 15\.44, 30\.22 \(was 25, 10\)/);
  assert.match(text, /zoom 5 \(was 2\)/);
  assert.match(text, /markers: \+1 Khartoum/);
  assert.match(text, /art\.draw: things: \+2 elephants/);
  assert.match(text, /ui\.avatar: face glasses removed \(was round\)/);
  assert.deepEqual(describeChanges(snapshotState(before), snapshotState(before)), []);
});

test('event log: ordered events with tab before and after, kinds from names, reaction of a record', () => {
  let tab = 'draw';
  const log = createEventLog(memStorage(), { getTab: () => tab });
  assert.equal(tapKind('Undo the last change'), 'undo');
  assert.equal(tapKind('Redo'), 'redo');
  assert.equal(tapKind('New game'), 'clear');
  assert.equal(tapKind('elephant'), 'tap');
  const a = log.add('tab', 'map', { via: 'tap', tabAfter: 'map' });
  tab = 'map';
  log.add('tap', 'zoom in', { zone: 'map' });
  assert.equal(a.tab, 'draw'); assert.equal(a.tabAfter, 'map');
  const rec = { id: 'p1', text: 'go to sudan', time: new Date(Date.now() - 1000).toISOString() };
  const ev = [buildEvent({ kind: 'message', target: 'go to sudan', recId: 'p1', now: Date.now() - 999 }), buildEvent({ kind: 'undo', target: 'Undo', now: Date.now() })];
  assert.equal(reactionOf(rec, ev).kind, 'undo');
  assert.equal(reactionOf({ ...rec, time: new Date(Date.now() + 5e5).toISOString() }, ev), null);
});

test('export format 3 carries events and reactions; format 2 still loads; the analyzer flags another tab', () => {
  const rec = { ...buildRecord({ text: 'make a chart', tab: 'draw', now: Date.now() - 1000 }), id: 'p1', tabWorld: 'art.draw', happened: { tabAfter: 'charts', shown: [{ text: 'Done.', world: 'data.charts' }], changes: [{ world: 'data.charts', changes: ['charts: +1 chart'] }] },
    segments: [{ text: 'make a chart', status: 'supported', world: 'data.charts', pattern: 'pat.x', unparsed: false }] };
  const events = [buildEvent({ kind: 'tab', target: 'draw', tab: 'robot', tabAfter: 'draw', via: 'tap', now: Date.now() - 2000 }), buildEvent({ kind: 'undo', target: 'Undo', tab: 'charts', now: Date.now() })];
  const v3 = JSON.parse(toJSON([rec], { events }));
  assert.equal(v3.format, 'psys2-phrase-log/3');
  assert.equal(v3.events.length, 2);
  assert.equal(v3.records[0].reaction.kind, 'undo');
  const v2 = JSON.parse(toJSON([rec]));
  assert.equal(v2.format, 'psys2-phrase-log/2');
  const recs = parseExport(JSON.stringify(v3)), evs = parseExport(JSON.stringify(v3), { events: true });
  assert.equal(recs.length, 1); assert.equal(evs.length, 2);
  assert.equal(parseExport(JSON.stringify(v2), { events: true }).length, 0);
  const tl = timeline(recs, evs);
  assert.deepEqual(tl.map((x) => x.type), ['event', 'turn', 'event']);
  assert.equal(tl[1].otherTab, true, 'the reading used the chart world, the tab on screen was draw');
  assert.equal(normalizeRecord(recs[0]).tabWorld, 'art.draw');
});
