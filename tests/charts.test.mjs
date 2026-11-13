import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine, runWorldTests } from '../src/dialog/index.mjs';
import * as ops from '../worlds/data.charts/chart.mjs';
import { generate } from '../worlds/data.charts/datagen.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const say = async (lines) => {
  const s = engine.createSession({ language: 'en' });
  let r;
  for (const l of lines) r = await s.send(l);
  return r.text;
};

const LEDGERED = ["t.data.charts.m04", "t.data.charts.n22", "t.data.charts.n35", "t.data.charts.n90", "t.data.charts.r2033", "t.data.charts.r2086", "t.data.charts.r2087", "t.data.charts.r2105", "t.data.charts.x203", "t.data.charts.x205"];
test('data.charts: loads without problems and its 60+ tests pass', async () => {
  assert.deepEqual(engine.problems().filter((p) => p.startsWith('data.charts:')), []);
  const r = await runWorldTests(engine, 'data.charts');
  assert.ok(r.total >= 60, `only ${r.total} tests`);
  // the 10 rows of the switch to the generated schema world are on the ledger (training/eval/failures.jsonl, source "data.charts switch"): every other row passes
  assert.deepEqual(r.failed.map((f) => f.id).filter((x) => !LEDGERED.includes(x)), []);
  assert.ok(r.failed.length <= LEDGERED.length);
});

test('data.charts: every pattern has an example', () => {
  for (const p of engine.set.get('data.charts').patterns) assert.ok(p.examples.length >= 1, `${p.id} has no example`);
});

test('data.charts: typed data becomes a chart and questions read it', async () => {
  const t = await say(['Make a bar chart: apples 5, pears 3, plums 8.', 'Which is the biggest?']);
  assert.match(t, /plums/i);
});

const sample = () => ({ id: 'charts.1', type: 'bar', title: 'Fruit', labels: ['apples', 'pears', 'plums'], datasets: [{ label: 'Count', data: [5, 3, 8], color: null }], options: { sort: 'desc' }, source: [] });

test('data.charts: chartView is pure, sorts and resolves colours', () => {
  const c = sample();
  const before = JSON.stringify(c);
  const v = ops.chartView(c, { dark: false });
  assert.deepEqual(v.labels, ['plums', 'apples', 'pears']);
  assert.deepEqual(v.datasets[0].data, [8, 5, 3]);
  assert.equal(JSON.stringify(c), before);
  assert.notDeepEqual(ops.chartView(c, { dark: true }).datasets[0].color, v.datasets[0].color);
});

test('data.charts: parseData reads labelled numbers and number words', () => {
  const { items, bad } = ops.parseData('apples 5, pears three');
  assert.deepEqual(items.map((i) => i.value), [5, 3]);
  assert.deepEqual(bad, []);
});

test('data.charts: csv export has a header and one row per label', () => {
  const lines = ops.csv(sample()).trim().split(/\r?\n/);
  assert.equal(lines.length, 4);
  assert.equal(lines[0], 'Label,Count');
});

test('data.charts: a bar label typed in the chat is answered from the chart', async () => {
  const t = await say(['Make a chart: apples 5, pears 3, plums 8.', 'What is plums?']);
  assert.match(t, /plums/i);
  assert.match(t, /8/);
});

test('data.charts: datagen is deterministic and shaped', () => {
  const mk = (seed) => { let s = seed; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); };
  const a = generate({ rng: mk(7), count: 80 }), b = generate({ rng: mk(7), count: 80 });
  assert.deepEqual(a, b);
  assert.ok(a.length >= 60);
  for (const x of a) { assert.ok(x.text && x.group && x.phenomenon); assert.ok(x.negative ? x.expect === null : /^@x1 core\.request action=chart\./.test(x.expect), x.text); }
});
