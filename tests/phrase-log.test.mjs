import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createFsLoader } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { buildRecord, completeRecord, appendCapped, filterRecords, toJSONL, toText, createStore, exportFilename } from '../docs/webchat/ui/phrase-log.mjs';

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
  assert.deepEqual(Object.keys(lines[0]).sort(), ['english', 'lang', 'mode', 'status', 'tab', 'text', 'time', 'worlds']);
  assert.equal(lines[1].status, 'unparsed');
  assert.equal(toJSONL(all, { includeChips: true }).trim().split('\n').length, 3);
  assert.equal(toText(all), 'How many legs does a spider have?\nblah zorp quux');
  assert.match(exportFilename(new Date('2026-11-08T10:00:00Z')), /^psys2-phrases-20261108\.jsonl$/);
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
