import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createFsLoader } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { buildRecord, completeRecord, appendCapped, filterRecords, toJSONL, toJSON, createStore, exportFilename, hashState, buildDetail, nextFeedback, voteOf, isComplaint } from '../docs/webchat/ui/phrase-log.mjs';

const engine = await createEngine({ loader: createFsLoader() });
const rec = async (text, extra = {}) => buildRecord({ text, tab: 'robot', reply: await engine.createSession().send(text, { language: 'en' }), ...extra });

test('record from a real reply', async () => {
  const r = await rec('How many legs does a spider have?');
  assert.equal(r.segments[0].world, 'kids.animals');
  assert.match(r.segments[0].pattern, /^pat\.kids\.animals\.(x\.legs\.how|legs\.q)$/);   // a hand-written or a shape pattern reads it (legs1 was replaced by the legs shape)
  assert.equal(r.segments[0].status, 'supported');
  assert.equal(r.unparsed, false); assert.equal(r.source, 'human'); assert.equal(r.formalizer, 'rules');
  const bad = await rec('blah zorp quux', { mode: 'voice' });
  assert.equal(bad.unparsed, true); assert.equal(bad.segments[0].status, 'unparsed'); assert.equal(bad.mode, 'voice');
});

test('cap drops the oldest, filters, JSONL and text', async () => {
  let l = [];
  for (let i = 0; i < 7; i++) l = appendCapped(l, { id: String(i), text: `t${i}`, segments: [] }, 5);
  assert.deepEqual(l.map((r) => r.id), ['2', '3', '4', '5', '6']);
  const a = await rec('How many legs does a spider have?'), b = await rec('blah zorp quux', { mode: 'voice' }), c = await rec('Open the editor', { mode: 'chip' });
  const all = [a, b, c];
  assert.deepEqual(filterRecords(all, 'misses'), [b]);
  assert.deepEqual(filterRecords(all, 'voice'), [b]);
  const lines = toJSONL(all).trim().split('\n').map((x) => JSON.parse(x));
  assert.equal(lines.length, 2, 'chips excluded');
  for (const k of ['english', 'lang', 'mode', 'status', 'tab', 'text', 'time', 'worlds', 'id', 'segments', 'source']) assert.ok(k in lines[0], k);   // the export is the complete record
  assert.equal(lines[1].status, 'unparsed');
  assert.equal(toJSONL(all, { includeChips: true }).trim().split('\n').length, 3);
  assert.deepEqual(JSON.parse(toJSON(all)).records.map((r) => r.text), ['How many legs does a spider have?', 'blah zorp quux']);
  assert.match(exportFilename(new Date('2026-11-08T10:00:00Z')), /^psys2-phrases-20261108\.json$/);
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
