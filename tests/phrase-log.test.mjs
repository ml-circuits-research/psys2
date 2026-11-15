import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createFsLoader } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { buildRecord, completeRecord, appendCapped, filterRecords, toJSONL, toJSON, createStore, exportFilename, localDay, nextExportNumber, hashState, buildDetail, nextFeedback, voteOf, isComplaint } from '../docs/webchat/ui/phrase-log.mjs';

const engine = await createEngine({ loader: createFsLoader() });
const rec = async (text, extra = {}) => buildRecord({ text, tab: 'robot', reply: await engine.createSession().send(text, { language: 'en' }), ...extra });

test('record from a real reply', async () => {
  const r = await rec('What day comes after Monday?');
  assert.equal(r.segments[0].world, 'time.calendar');
  assert.match(r.segments[0].pattern, /^pat\.time\.calendar\./);
  assert.equal(r.segments[0].status, 'supported');
  assert.equal(r.unparsed, false); assert.equal(r.source, 'human'); assert.equal(r.formalizer, 'rules');
  const bad = await rec('blah zorp quux', { mode: 'voice' });
  assert.equal(bad.unparsed, true); assert.equal(bad.segments[0].status, 'unparsed'); assert.equal(bad.mode, 'voice');
});

test('cap drops the oldest, filters, JSONL and text', async () => {
  let l = [];
  for (let i = 0; i < 7; i++) l = appendCapped(l, { id: String(i), text: `t${i}`, segments: [] }, 5);
  assert.deepEqual(l.map((r) => r.id), ['2', '3', '4', '5', '6']);
  const a = await rec('What day comes after Monday?'), b = await rec('blah zorp quux', { mode: 'voice' }), c = await rec('Open the editor', { mode: 'chip' });
  const all = [a, b, c];
  const head = JSON.parse(toJSON(all, { app: { commit: 'abc1234', version: 'v9' } }));
  assert.deepEqual(Object.keys(head).slice(0, 3), ['format', 'app', 'turns']);   // the first lines: the app build and the number of turns
  assert.deepEqual(head.app, { build: 'abc1234', version: 'v9' });
  assert.equal(head.turns, 3); assert.equal(head.typed, 2);   // every message is a turn; `typed` counts the ones the person typed or said
  assert.deepEqual(filterRecords(all, 'misses'), [b]);
  assert.deepEqual(filterRecords(all, 'voice'), [b]);
  const lines = toJSONL(all).trim().split('\n').map((x) => JSON.parse(x));
  assert.equal(lines.length, 3, 'every message is a record, chips included');
  for (const k of ['english', 'lang', 'mode', 'status', 'tab', 'text', 'time', 'worlds', 'id', 'segments', 'source']) assert.ok(k in lines[0], k);   // the export is the complete record
  assert.equal(lines[1].status, 'unparsed');
  assert.deepEqual(JSON.parse(toJSON(all)).records.map((r) => r.text), ['What day comes after Monday?', 'blah zorp quux', 'Open the editor']);
  assert.equal(exportFilename(new Date(2026, 10, 15, 8, 34)), 'psys2-15Nov.json');   // the local day and the English month (owner 2026-11-15)
  assert.equal(exportFilename(new Date(2026, 10, 15, 9, 0), 2), 'psys2-15Nov-2.json');
  assert.deepEqual(nextExportNumber({ day: '2026-11-15', n: 1 }, '2026-11-15'), { n: 2, next: { day: '2026-11-15', n: 2 } });
  assert.deepEqual(nextExportNumber({ day: '2026-11-14', n: 5 }, '2026-11-15').n, 1);
  assert.equal(localDay(new Date(2026, 10, 5)), '2026-11-05');
});

test('store survives broken storage', () => {
  const mem = { d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = v; } };
  const s = createStore(mem, { cap: 2 });
  for (const t of ['a', 'b', 'c']) s.add({ id: t, text: t, segments: [] });
  assert.deepEqual(createStore(mem).all().map((r) => r.id), ['b', 'c']);
  s.remove('b'); assert.equal(s.all().length, 1); s.clear(); assert.equal(s.all().length, 0);
  assert.doesNotThrow(() => createStore({ getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } }).add({ id: 'x', text: 'x', segments: [] }));
  assert.deepEqual(createStore(null).all(), []);
});

test('RD7: a phrase is logged when it is sent and completed by the reply; every typed message is exported', async () => {
  const mem = { d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = v; } };
  const s = createStore(mem);
  const texts = ['hello', 'b1', 'fa ochii mari', 'make a chart: apples 5', 'zzq flarb'];
  const ids = texts.map((t) => { const r = buildRecord({ text: t, tab: 'robot', reply: null }); s.add(r); return r.id; });
  assert.equal(toJSONL(s.all()).trim().split('\n').length, texts.length, 'counted before any reply');
  const reply = await engine.createSession().send('hello', { language: 'en' });
  s.update(ids[0], (r) => completeRecord(r, reply));
  assert.equal(s.all()[0].id, ids[0]); assert.equal(s.all()[0].segments.length > 0, true);
  assert.equal(toJSONL(s.all()).trim().split('\n').length, texts.length);
});

test('RD7: a reply of an unexpected shape still produces a record', () => {
  const r = buildRecord({ text: 'x', reply: { segments: [{ text: 'x', match: null }, null], trace: { formalizer: { used: 'rules' } }, answers: 5 } });
  assert.equal(r.text, 'x'); assert.equal(typeof r.id, 'string');
});

test('RD7: two pages of one browser do not overwrite each other\'s log', () => {
  const mem = { d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = v; } };
  const a = createStore(mem), b = createStore(mem);
  a.add({ id: 'a1', text: 'one', time: '2026-01-01T00:00:01Z', segments: [] });
  b.add({ id: 'b1', text: 'two', time: '2026-01-01T00:00:02Z', segments: [] });
  a.add({ id: 'a2', text: 'three', time: '2026-01-01T00:00:03Z', segments: [] });
  assert.deepEqual(createStore(mem).all().map((r) => r.id), ['a1', 'b1', 'a2']);
});

test('FB: feedback object, state hash, detail, filters and the complete JSON export', () => {
  const reply = { text: 'Done.', lang: 'en', statuses: ['supported'], effects: [{ name: 'x' }], perf: { totalMs: 50 },
    segments: [{ text: 'make a house', match: { worldId: 'art.draw', patternId: 'draw.house' }, strategy: 'encoder', wires: [{ type: 'core.request', entries: [] }] }],
    trace: { dispatch: { status: 'understood', winnerIndex: 0, segmentations: [{ pieces: [{ attempts: [{ world: 'art.draw', worldScore: 0.9, valid: true, variant: 'original' }] }] }] } } };
  const d = buildDetail(reply, { serialize: (w) => `${w.length} wires`, state: { before: hashState({ a: 1 }), after: hashState({ a: 2 }) }, tab: 'draw' });
  assert.equal(d.readings[0].wires, '1 wires');
  assert.equal(d.readings[0].pattern, 'draw.house');
  assert.deepEqual(d.worlds, ['art.draw']);
  assert.notEqual(d.state.before, d.state.after);
  assert.equal(hashState({ a: 1 }), hashState({ a: 1 }));
  const rec = { ...buildRecord({ text: 'make a house', tab: 'draw', reply, id: 'p1' }), detail: d };
  const down = nextFeedback(null, { vote: 'down' }, 1000);
  assert.equal(down.vote, 'down');
  const w = nextFeedback(down, { reasons: ['wrong-value', 'bogus'], wanted: 'a red house' });
  assert.deepEqual(w.reasons, ['wrong-value']);
  assert.equal(nextFeedback(w, { correction: 'p2' }).correction, 'p2');
  const up = nextFeedback(w, { vote: 'up' });
  assert.deepEqual([up.vote, up.reasons, up.wanted, up.correction], ['up', [], '', null]);   // changing the vote drops the details of the thumbs-down
  assert.equal(nextFeedback('negative', { vote: 'down' }).spoken, true);
  const rated = { ...rec, feedback: w };
  const all = [rated, { ...rec, id: 'p3', feedback: up }, { ...rec, id: 'p4' }];
  assert.deepEqual(filterRecords(all, 'down').map((r) => r.id), ['p1']);
  assert.deepEqual(filterRecords(all, 'up').map((r) => r.id), ['p3']);
  assert.equal(voteOf(rated), 'down');
  assert.equal(isComplaint({ feedback: 'negative' }), true);
  // a vote given before the reply was completed survives the completion
  assert.equal(completeRecord({ ...rec, feedback: w }, reply).feedback.vote, 'down');
  const out = JSON.parse(toJSON(all));
  assert.equal(out.count, 3);
  const e = out.records[0];
  assert.equal(e.feedback.wanted, 'a red house');
  assert.equal(e.detail.readings[0].wires, '1 wires');
  assert.equal(e.segments[0].pattern, 'draw.house');
  assert.ok(e.detail.state.before && e.detail.state.after);
});

// owner export 2026-11-15T11:43 (training/eval/owner-exports/phrase-log-2026-11-15T1143-en.json): the events held 16 messages, the records 10; the chip turns and the
// Documents story sent by the tab's "Write it" form, marked "Not what I wanted" with a text, were missing. Every message (typed, voice, chip, form) is a record, with its feedback.
test('every message of a session is a record of the export, with its feedback (typed, voice, chip, form)', async () => {
  const { readFileSync } = await import('node:fs');
  const exp = JSON.parse(readFileSync(fileURLToPath(new URL('../training/eval/owner-exports/phrase-log-2026-11-15T1143-en.json', import.meta.url)), 'utf8'));
  const msgs = exp.events.filter((e) => e.kind === 'message');
  assert.ok(msgs.length > exp.records.length, 'the export this test reproduces lost messages');
  const mem = { d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = v; } };
  const s = createStore(mem);
  const story = msgs.find((e) => /hobbits/.test(e.target));
  for (const e of msgs) s.add(buildRecord({ text: e.target, mode: e === story ? 'form' : e.mode, tab: e.tab, reply: null, id: e.recId, now: Date.parse(e.time) }));
  s.add(buildRecord({ text: 'what is the weather', mode: 'voice', tab: 'talk', reply: null, id: 'pvoice' }));
  s.update(story.recId, (r) => ({ feedback: nextFeedback(r.feedback, { vote: 'down', wanted: 'a story with 5 chapters about hobbits' }) }));
  const out = JSON.parse(toJSON(s.all(), { events: exp.events }));
  assert.deepEqual(out.records.map((r) => r.id), [...msgs.map((e) => e.recId), 'pvoice'], 'every message is a record, in order');
  assert.equal(out.turns, msgs.length + 1);
  const st = out.records.find((r) => r.id === story.recId);
  assert.equal(st.mode, 'form'); assert.equal(st.source, 'form');
  assert.equal(st.feedback.vote, 'down'); assert.equal(st.feedback.wanted, 'a story with 5 chapters about hobbits');
  assert.ok(out.records.some((r) => r.mode === 'chip') && out.records.some((r) => r.mode === 'voice') && out.records.some((r) => r.mode === 'typed'));
  assert.equal(toJSONL(s.all()).trim().split('\n').length, msgs.length + 1);
});
