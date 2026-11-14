// SPDX-License-Identifier: AGPL-3.0-only
// The world diagram.sketch (task DIAG): routing, the structured path against the gold of diagram-vss-demo, the lazy engine, the tab, the data conversion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import { score } from '../imports/diagram-vss-demo/reference/bench-canon.js';
import * as ops from '../worlds/diagram.sketch/engine.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const WORLD = 'diagram.sketch';
const bench = (id) => JSON.parse(readFileSync(new URL(`../imports/diagram-vss-demo/data/bench/${id}.json`, import.meta.url), 'utf8'));

async function say(tab, texts) {
  const s = engine.createSession({ language: 'en' });
  if (tab) s.setWorldState('ui.shell', { activeTab: tab });
  const out = [];
  for (const t of [].concat(texts)) { const r = await s.send(t, { language: 'en' }); out.push({ r, seg: r.segments?.[0], world: r.segments?.[0]?.match?.worldId, pat: r.segments?.[0]?.match?.patternId }); }
  return { s, out };
}

// ---- routing (task DIAG step 6) ----------------------------------------------------------------------------------------------------
test('"draw a rectangle called Api" is a diagram request on every tab, and brings the Diagram tab forward', async () => {
  for (const tab of ['draw', 'robot', 'editor', 'chess', null, 'diagram']) {
    const { s, out } = await say(tab, 'draw a rectangle called Api');
    assert.equal(out[0].world, WORLD, `tab ${tab}`);
    assert.equal(s.state('ui.shell').activeTab, 'diagram', `tab ${tab}`);
    assert.equal(s.state(WORLD).shapes[0].name, 'Api');
  }
});

test('"draw a rectangle" stays with the Drawing board on the Drawing tab and without a tab, and goes to the diagram on the Diagram tab', async () => {
  assert.equal((await say('draw', 'draw a rectangle')).out[0].world, 'art.draw');
  assert.equal((await say(null, 'draw a rectangle')).out[0].world, 'art.draw');
  assert.equal((await say('diagram', 'draw a rectangle')).out[0].world, WORLD);
});

test('diagram signals beat the Drawing tab: arrows between names and flowchart words', async () => {
  const { out } = await say('draw', ['draw a circle called A', 'draw a circle called B', 'draw an arrow from A to B']);
  assert.deepEqual(out.map((o) => o.world), [WORLD, WORLD, WORLD]);
  assert.equal((await say('draw', 'make an org chart with Ann, Bob and Cy')).out[0].world, WORLD);
  assert.equal((await say('draw', 'draw a flowchart with Start, Check and Done')).out[0].world, WORLD);
});

test('the Drawing tab keeps its own words: houses, trees and "describe the canvas" on the Drawing tab', async () => {
  assert.equal((await say('draw', 'draw a red house')).out[0].world, 'art.draw');
  assert.equal((await say('draw', 'describe the canvas')).out[0].world, 'art.draw');
  assert.equal((await say('diagram', 'describe the canvas')).out[0].world, WORLD);
});

test('undo and redo belong to the diagram only while its tab is open', async () => {
  assert.notEqual((await say('draw', 'undo')).out[0].world, WORLD);
  assert.equal((await say('diagram', 'undo')).out[0].world, WORLD);
});

test('a sentence of another world is not taken by the diagram (typo and routing safety)', async () => {
  assert.equal((await say('timeline', 'hey can u search for oven pls')).out[0].world, 'docs.reader');
  assert.notEqual((await say('robot', 'make your body green')).out[0].world, WORLD);
});

// ---- the structured path against the gold (task DIAG step 3) --------------------------------------------------------------------------
const stateFor = (row) => ({
  shapes: (row.names ?? []).map((name, i) => ({ name, shape: 'circle', x: 80 + 100 * i, y: 80, size: 62, color: 'white', order: i + 1 })), seq: {}, edgeSeq: 0, order: (row.names ?? []).length,
});
const mkCtx = (state) => ({ state, request: () => ({ status: 'supported' }), effect() {} });
const actName = (row) => (row.type === 'question' ? `ask_${row.gold.ask}` : row.type === 'fact' ? 'fact' : row.type === 'rule' ? 'rule' : row.gold.action === 'delete' ? 'delete' : row.gold.action);

test('every action and every question kind: the gold args run the same operation as the sentence does (at least 5 per kind)', () => {
  const byKind = new Map();
  for (const id of ['hand', 'blind', 'broad', 'heldout_formulations', 'seen', 'new_identities']) {
    for (const row of bench(id)) {
      if (!row.gold || !row.type || /\$new/.test(JSON.stringify(row.gold))) continue;
      const kind = actName(row);
      if (!(kind in ops)) continue;
      const read = ops.read(row.text, stateFor(row));
      if (!score(read.nodes, { type: row.type, gold: row.gold }).ok) continue;   // only sentences the engine's reader reads as the gold
      const list = byKind.get(kind) ?? [];
      if (list.length < 5 && !list.some((r) => r.text === row.text)) { list.push(row); byKind.set(kind, list); }
    }
  }
  let compared = 0;
  const kinds = [...byKind].filter(([, l]) => l.length >= 5);
  assert.ok(kinds.length >= 28, `only ${kinds.length} kinds with 5 cases`);
  for (const [kind, list] of kinds) {
    for (const row of list) {
      const a = stateFor(row), b = stateFor(row);
      const ra = ops[kind](mkCtx(a), { text: row.text });
      const args = Object.fromEntries(Object.entries(row.gold).filter(([k]) => k !== 'action' && k !== 'ask').map(([k, v]) => [k, String(v)]));
      const rb = ops[kind](mkCtx(b), args);
      assert.equal(rb.status, ra.status, `${kind}: ${row.text} (${ra.note ?? ra.value} / ${rb.note ?? rb.value})`);
      const sz = (x) => (kind === 'resize' ? 0 : x.size);   // how much bigger is a matter of taste: bench-canon does not compare `scale`
      if (ra.status === 'supported' && row.type === 'command') assert.deepEqual({ s: b.shapes.map((x) => [x.name.toLowerCase(), x.shape, x.color, sz(x), Math.round(x.x), Math.round(x.y)]), e: b.edges.length, g: b.groups }, { s: a.shapes.map((x) => [x.name.toLowerCase(), x.shape, x.color, sz(x), Math.round(x.x), Math.round(x.y)]), e: a.edges.length, g: a.groups }, `${kind}: ${row.text}`);
      compared++;
    }
  }
  assert.ok(compared >= 140, `compared ${compared}`);
});

test('the engine reader reads the bench sets as the gold (the world keeps what the source reader gets right)', () => {
  let ok = 0, n = 0;
  for (const id of ['hand', 'blind', 'broad']) for (const row of bench(id)) {
    n++;
    const nodes = ops.read(row.text, stateFor(row))?.nodes ?? [];
    if (score(nodes, row.wires ? { wires: row.wires.map((w) => ({ ...w, args: w.args ?? w.gold })), text: row.text } : { type: row.type, gold: row.gold }).ok) ok++;
  }
  assert.ok(ok / n > 0.9, `${ok}/${n}`);
});

test('$new and mention(...) of the gold become the shape made last and a description', () => {
  const s = ops.initialState();
  ops.create(mkCtx(s), { text: 'draw a red circle called Hub' });
  ops.create(mkCtx(s), { text: 'draw a blue square called Gate' });
  const r = ops.connect(mkCtx(s), { from: '$new', to: 'mention(color=red,shape=circle)' });
  assert.equal(r.status, 'supported', r.note);
  assert.deepEqual(s.edges.map((e) => [e.from, e.to]), [['Gate', 'Hub']]);
});

// ---- the engine is loaded lazily, the tab exists ---------------------------------------------------------------------------------------
test('the engine is not imported statically by ops.mjs and is not preloaded by the page', () => {
  const src = readFileSync(new URL('../worlds/diagram.sketch/engine.mjs', import.meta.url), 'utf8');
  assert.ok(!/^import .*engine\//m.test(src), 'ops.mjs must import the engine with import() only');
  assert.match(src, /import\('\.\/engine\/logic\.mjs'\)/);
  assert.match(src, /export const prepare = /);
  const html = readFileSync(new URL('../docs/webchat/index.html', import.meta.url), 'utf8');
  assert.ok(!/engine\/logic/.test(html.replace(/<script type="importmap">.*<\/script>/, "").replace(/<script>window\.__psys2Mod.*<\/script>/, "")), "the page must not preload the diagram engine");   // the import map and version table name it (URL versioning), a preload would not
  assert.ok(existsSync(new URL('../docs/webchat/worlds/diagram.sketch/engine/logic.mjs', import.meta.url)));
});

test('the Diagram tab is registered and declares its world', async () => {
  const idx = JSON.parse(readFileSync(new URL('../docs/webchat/ui/tabs/index.json', import.meta.url), 'utf8'));
  assert.ok(idx.includes('diagram.mjs'));
  const w = engine.set.get(WORLD);
  assert.equal(w.tab.id, 'diagram');
  const src = readFileSync(new URL('../docs/webchat/ui/tabs/diagram.mjs', import.meta.url), 'utf8');
  assert.match(src, /id: 'diagram'/);
  assert.match(src, /world: 'diagram.sketch'/);
  assert.match(src, /'diagram.download'/);
});

test('the first sentence waits for the engine through prepare() (no "still loading" refusal)', async () => {
  const w = engine.set.get(WORLD);
  assert.equal(typeof w.ops.prepare, 'function');
  assert.equal(await w.ops.prepare() !== undefined, true);
});

test('the converted data counts are reported (scripts/convert-diagram-data.mjs)', () => {
  const rep = JSON.parse(readFileSync(new URL('../training/diagram/report.json', import.meta.url), 'utf8'));
  assert.ok(rep.splits.train.messages > 40000 && rep.splits.train.wires > 76000);
  assert.ok(rep.splits.test.messages > 4000 && rep.splits.test.wires > 17000);
});
