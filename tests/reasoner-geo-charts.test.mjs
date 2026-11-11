// SPDX-License-Identifier: AGPL-3.0-only
// geo.map and data.charts on the matrix reasoner (spec 15, "geo.map and data.charts on the matrix"): the state is wires of the library (derived back without loss),
// the rules refuse what cannot be, the knowledge base of geo.map is a static index (`kb=lookup`) and not wires of the instance, the derived numbers of a chart are
// rules and aggregates, and the replies are the operations' with the switch on and off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { sessionOptions, settingsForMode } from '../src/dialog/runtime-config.mjs';
import { toState as geoState, adopt as geoAdopt } from '../worlds/geo.map/fns.mjs';
import { toState as chartState, adopt as chartAdopt } from '../worlds/data.charts/fns.mjs';

const engineWith = (reasoner) => createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner } });
const matrix = await engineWith('matrix');
const ops = await engineWith('ops');
const session = (e, tab) => { const s = e.createSession(sessionOptions(settingsForMode('rules'), { language: 'en' })); s.setWorldState('ui.shell', { activeTab: tab }); return s; };
const run = async (e, tab, lines) => { const s = session(e, tab); const out = []; for (const l of lines) out.push((await s.send(l, {})).text); return { s, out }; };
const inst = (s, id) => s.isession.rs.insts.get(id).world;
const stateOf = (s, id) => JSON.parse(JSON.stringify(s.state()[id]));
const sameState = (a, b) => { const strip = ({ history, future, ...rest }) => rest; return assert.deepEqual(strip(a), strip(b)); };   // the undo history is the library's in matrix mode, a key of the state in ops

test('both worlds opt in, say so in world.sop, and the matrices load without a problem', () => {
  for (const id of ['geo.map', 'data.charts']) {
    const w = matrix.set.get(id);
    assert.equal(w.reasoner, 'matrix', id);
    assert.ok(w.undoAction && w.redoAction, `${id} undoes and redoes through the library`);
    assert.equal(w.kbLookup, true, `${id} keeps its knowledge base out of the instance`);
    assert.ok(w.sourcePhrase, `${id} names its source for "why?"`);
  }
  assert.deepEqual(matrix.reasoner.buildAll(), []);
  assert.deepEqual(matrix.problems(), []);
  assert.equal(ops.set.get('geo.map').reasoner, 'matrix', 'the opt-in is the same file in both modes: ops mode simply does not load the library');
});

test('kb=lookup: the 1,250 places are not wires of the instance, only the static index has them', async () => {
  const { s } = await run(matrix, 'map', ['mark Paris']);
  const w = inst(s, 'geo.map');
  assert.equal(w.ofType('geo.map.city').length, 0);
  assert.equal(w.ofType('geo.map.country').length, 0);
  assert.equal(w.ofType('geo.map.marker').length, 1);
  assert.equal(inst(s, 'geo.map').ofType('geo.map.shown').length, 0, 'nothing is derived from places that were not told');
});

test('geo.map: the state of the view is wires, and toState derives the session state back without loss', async () => {
  const { s } = await run(matrix, 'map', ['mark Paris', 'show me Rome', 'highlight Spain', 'how far is Rome from Paris', 'zoom in', 'undo', 'redo']);
  const w = inst(s, 'geo.map');
  assert.equal(w.ofType('geo.map.view').length, 1);
  assert.equal(w.ofType('geo.map.marker').length, 1);
  assert.equal(w.ofType('geo.map.highlight').length, 1);
  assert.equal(w.ofType('geo.map.line').length, 1);
  assert.equal(JSON.stringify(geoState({ find: (t) => w.ofType(t) })), JSON.stringify(s.state()['geo.map']), 'library = session state, key by key and in order');
  assert.deepEqual(geoAdopt({ state: stateOf(s, 'geo.map'), find: (t) => w.ofType(t) }), { retract: [], tell: '', sets: [] }, 'nothing left to take over');
});

test('geo.map: the counts and the length of the lines are derived by rules and aggregates', async () => {
  const { s, out } = await run(matrix, 'map', ['mark Paris', 'mark Rome', 'highlight Spain', 'how far is Rome from Paris', 'how long are the lines in total']);
  const on = inst(s, 'geo.map').ofType('geo.map.onmap')[0].attrs;
  assert.deepEqual([on.markers, on.highlights, on.lines, on.km].map((a) => a[0]), ['2', '1', '1', '1107']);
  assert.equal(out.at(-1), 'There are 2 markers, 1 highlighted country and 1 line on the map; the lines add up to 1,107 km.');
  const empty = await run(matrix, 'map', ['how many things are on the map']);
  assert.equal(empty.out[0], 'The map is empty: no markers, highlights or lines.');
});

test('geo.map: a state the rules cannot allow is refused with the reason, and the view goes back', async () => {
  for (const [patch, why] of [
    [{ zoom: 15 }, 'The offline country map zooms in to 12 at most, not 15. Say "street map" to zoom closer.'],
    [{ zoom: 0.5 }, 'The zoom level must be between 1 and 18, not 0.5.'],
    [{ center: { lat: 95, lon: 10 } }, 'Latitude must be between -90 and 90, not 95.'],
    [{ center: { lat: 10, lon: 190 } }, 'Longitude must be between -180 and 180, not 190.'],
    [{ lines: [{ id: 'l1', from: { name: 'Paris', lat: 48.8, lon: 2.3 }, to: { name: 'Paris', lat: 48.8, lon: 2.3 }, km: 0 }] }, 'A line needs two different places, not Paris twice.'],
  ]) {
    const { s } = await run(matrix, 'map', ['mark Paris']);
    const before = JSON.stringify(s.state()['geo.map']);
    Object.assign(s.isession.state['geo.map'], patch);
    const refused = s.isession.rs.adoptState(s.isession);
    assert.equal(refused?.why, why);
    assert.equal(JSON.stringify(s.state()['geo.map']), before, 'the state is the library\'s again');
  }
});

test('geo.map: the denies judge a claim with the knowledge base told as evidence; the reason is the answer', async () => {
  const claims = [
    ['Is Paris in Germany?', 'No, Paris is not in Germany; it is in France.'],
    ['Is Paris in France?', 'Yes, Paris is in France.'],
    ['Berlin is the capital of France', 'No, the capital of France is Paris.'],
    ['Is Berlin the capital of Germany?', 'Yes, Berlin is the capital of Germany.'],
    ['Spain borders Germany', 'No, Spain and Germany do not share a border.'],
    ['does France border Spain', 'Yes, France and Spain share a border.'],
    ['Is Spain in Asia?', 'No, Spain is not in Asia; it is in Europe.'],
    ['Is Spain in Europe?', 'Yes, Spain is in Europe.'],
    ['Is Paris in Asia?', 'No, Paris is not in Asia; it is in France.'],
    ['Is the Netherlands in Asia?', 'No, Netherlands is not in Asia; it is in Europe.'],
    ['Is the Netherlands in the United Kingdom?', null],
  ];
  const m = await run(matrix, 'map', claims.map((c) => c[0]));
  const o = await run(ops, 'map', claims.map((c) => c[0]));
  claims.forEach(([q, want], i) => {
    if (want) assert.equal(m.out[i], want, q);
    assert.equal(m.out[i], o.out[i], `${q}: the same words with the switch on and off`);
  });
});

test('geo.map: the same replies, statuses and state with the switch on and off (a scripted session)', async () => {
  const script = ['show me Bucharest', 'zoom in a lot', 'mark Paris and Rome', 'highlight Spain', 'what is the capital of Japan', 'how far is Tokyo from Paris', 'where is Cairo', 'undo', 'redo', 'borders of Germany', 'street map', 'zoom to 15', 'clear all', 'population of Brazil', 'is Romania in the EU?', 'is Paris in Asia?'];
  const m = await run(matrix, 'map', script);
  const o = await run(ops, 'map', script);
  assert.deepEqual(m.out, o.out);
  sameState(stateOf(m.s, 'geo.map'), stateOf(o.s, 'geo.map'));
});

test('geo.map: undo and redo go through the library (undo=, redo=) and say it in the world\'s words', async () => {
  const { s, out } = await run(matrix, 'map', ['mark Paris', 'undo that', 'redo']);
  assert.match(out[1], /undid the last change to the map/);
  assert.equal(out[2], 'OK, I did it again.');
  assert.equal(stateOf(s, 'geo.map').markers.length, 1);
  assert.equal(stateOf(s, 'geo.map').history, undefined, 'the history is the library\'s, not a key of the state');
  assert.equal(inst(s, 'geo.map').ofType('geo.map.marker').length, 1);
});

test('data.charts: the chart and its numbers are wires, derived back without loss; the totals are rules and aggregates', async () => {
  const { s } = await run(matrix, 'charts', ['Make a chart: apples 5, pears 3, plums 8', 'add bananas 4', 'make it a pie chart']);
  const w = inst(s, 'data.charts');
  assert.equal(w.ofType('data.charts.chart').length, 1);
  assert.equal(w.ofType('data.charts.point').length, 4);
  assert.equal(JSON.stringify(chartState({ find: (t) => w.ofType(t) })), JSON.stringify(s.state()['data.charts']), 'library = session state');
  assert.deepEqual(chartAdopt({ state: stateOf(s, 'data.charts'), find: (t) => w.ofType(t) }), { retract: [], tell: '', sets: [] });
  const lt = Object.fromEntries(w.ofType('data.charts.labeltotal').map((x) => [JSON.parse(x.attrs.label[0]), x.attrs.total[0]]));
  assert.deepEqual(lt, { Apples: '5', Pears: '3', Plums: '8', Bananas: '4' });
  const ct = w.ofType('data.charts.charttotal')[0].attrs;
  assert.deepEqual([ct.sum, ct.count, ct.max, ct.min].map((a) => a[0]), ['20', '4', '8', '3']);
  assert.deepEqual(w.ofType('data.charts.top').map((x) => JSON.parse(x.attrs.label[0])), ['Plums']);
  assert.deepEqual(w.ofType('data.charts.bottom').map((x) => JSON.parse(x.attrs.label[0])), ['Pears']);
});

test('data.charts: several series and ties come out of the rules (a chart of what everyone has)', async () => {
  const { s, out } = await run(matrix, 'charts', ['Make a chart: apples 5, pears 5, plums 2']);
  assert.match(out[0], /apples 5, pears 5 and plums 2/);
  assert.deepEqual(inst(s, 'data.charts').ofType('data.charts.top').map((x) => JSON.parse(x.attrs.label[0])).sort(), ['Apples', 'Pears'], 'a tie: both labels are on top');
  assert.match((await s.send('what is the biggest', {})).text, /^Apples and Pears are tied for the biggest, with 5 each\.$/);
  const two = JSON.parse(JSON.stringify(s.state()['data.charts']));
  const c = two.charts[0];
  c.datasets.push({ label: 'Second', data: [1, 2, 3], color: null });
  Object.assign(s.isession.state['data.charts'], two);
  assert.equal(s.isession.rs.adoptState(s.isession), null);
  const w = inst(s, 'data.charts');
  assert.deepEqual(w.ofType('data.charts.seriestotal').map((x) => [JSON.parse(x.attrs.series[0]), x.attrs.total[0]]).sort(), [['Second', '6'], ['Value', '12']]);
  assert.deepEqual(w.ofType('data.charts.top').map((x) => JSON.parse(x.attrs.label[0])), ['Pears']);   // 6, 7, 5: pears is on top with its second series
  const q = await s.send('what is the total', {});
  assert.match(q.text, /^The total is 18 \(Value 12, Second 6\)\.$/);
});

test('data.charts: a state that cannot be (the same label twice) is refused with the reason and the chart stays as it was', async () => {
  const { s, out } = await run(matrix, 'charts', ['Make a chart: apples 5, pears 3, plums 8', 'rename apples to pears']);
  assert.equal(out[1], 'That does not add up. Pears is in the chart twice.');
  assert.deepEqual(stateOf(s, 'data.charts').charts[0].labels, ['Apples', 'Pears', 'Plums']);
  assert.equal(inst(s, 'data.charts').ofType('data.charts.point').length, 3);
  const ops1 = await run(ops, 'charts', ['Make a chart: apples 5, pears 3, plums 8', 'rename apples to pears']);
  assert.equal(ops1.out[1], 'OK, apples is now called pears.', 'ops keeps the duplicate: the refusal is a gain of the matrix');
});

test('data.charts: the same replies, statuses and state with the switch on and off (a scripted session)', async () => {
  const script = ['Make a chart: apples 5, pears 3, plums 8', 'what is the biggest', 'what is the smallest', 'what is the total', 'what is the average', 'how much is plums', 'what percent is pears', 'compare apples and pears', 'what is the difference between plums and pears', 'how many items are there', 'add bananas 4', 'change pears to 6', 'make it a pie chart', 'sort by size', 'what is the biggest', 'undo', 'undo', 'undo the undo', 'remove plums', 'what is the total', 'how much is grapes'];
  const m = await run(matrix, 'charts', script);
  const o = await run(ops, 'charts', script);
  assert.deepEqual(m.out, o.out);
  sameState(stateOf(m.s, 'data.charts'), stateOf(o.s, 'data.charts'));
});

test('data.charts: undo and redo go through the library (undo=, redo=), the wires follow', async () => {
  const { s, out } = await run(matrix, 'charts', ['Make a chart: apples 5, pears 3', 'add plums 8', 'undo', 'undo the undo', 'what is the total']);
  assert.match(out[2], /undid the last change to the chart/);
  assert.equal(out[3], 'OK, I did it again.');
  assert.equal(out[4], 'The total is 16.');
  assert.equal(stateOf(s, 'data.charts').history, undefined);
  assert.equal(inst(s, 'data.charts').ofType('data.charts.point').length, 3);
});

test('data.charts: "why?" says what the numbers came from (the user\'s words, or the source of the world)', async () => {
  const { out } = await run(matrix, 'charts', ['Make a chart: apples 5, pears 3', 'what is the total', 'why?']);
  assert.match(out[2], /I worked that out from what you told me: "Make a chart: apples 5, pears 3"/);
});
