// SPDX-License-Identifier: AGPL-3.0-only
// DIAG3 item 3: arrow geometry. The minimum entry angle, the corner clearance and the clearance from other shapes over every arrow of the bench
// diagrams: the 24 templates, the example sessions of diagram-vss-demo (data/examples/manual.json, replayed through the world) and crafted fans
// (parallel and opposite arrows, every shape kind, a hub).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFsLoader, DEFAULT_ROOT } from '../src/loaders/fs-loader.mjs';
import { createEngine } from '../src/dialog/index.mjs';
import * as ops from '../worlds/diagram.sketch/ops.mjs';
import { routeEdges, CORNER, MIN_ENTRY, CLEAR, SPREAD } from '../worlds/diagram.sketch/arrows.mjs';

const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }) });
const K = ops.kit();
const WORLD = 'diagram.sketch';
const session = async (texts) => {
  const s = engine.createSession({ language: 'en' });
  s.setWorldState('ui.shell', { activeTab: 'diagram' });
  for (const t of texts) await s.send(t, { language: 'en' });
  return s.state(WORLD);
};
const measure = (state) => {
  const shapes = state.shapes.map((x) => ({ name: x.name, x: x.x, y: x.y, shape: x.shape, layer: x.layer, size: x.size, w: x.w, h: x.h, label: x.label, color: x.color }));
  const routes = routeEdges(shapes, state.edges, (s) => K.dims(s));
  const rows = [];
  for (const e of state.edges) { const r = routes.get(e.id); if (r) rows.push({ id: e.id, from: e.from, to: e.to, ...r }); }
  return rows;
};

const diagrams = [];
const manual = JSON.parse(readFileSync(new URL('../imports/diagram-vss-demo/data/examples/manual.json', import.meta.url), 'utf8')).scenarios;
const kit = K.createSystem();
const TEMPLATES = ops.templateNames({ shapes: [], seq: {} });
for (const t of TEMPLATES) diagrams.push([`template ${t}`, await session([`make a ${t === 'hierarchy' ? 'tree' : t}`])]);
for (const [name, turns] of Object.entries(manual)) diagrams.push([`example ${name}`, await session(turns.map((x) => x.text))]);
diagrams.push(['fan: parallel and opposite', await session(['draw a circle called A', 'draw a rectangle called B below A', 'connect A to B', 'connect B to A', 'connect A to B with a dashed arrow'])]);
diagrams.push(['fan: every kind', await session(['draw a circle called C', 'draw a square called S', 'draw a diamond called D', 'draw a hexagon called H', 'draw a triangle called T', 'draw an ellipse called E', 'draw a star called R', 'connect C to S', 'connect S to D', 'connect D to H', 'connect H to T', 'connect T to E', 'connect E to R', 'connect R to C', 'connect C to D', 'connect S to H', 'connect D to E'])]);
diagrams.push(['hub', await session(['draw a circle called Hub', 'draw 6 squares', 'connect Hub to all the squares'])]);

test('the bench diagrams have arrows to measure', () => {
  const n = diagrams.reduce((a, [, st]) => a + measure(st).length, 0);
  assert.ok(n >= 60, `only ${n} arrows`);
});
test('every arrow enters its borders at an angle of at least 30 degrees or ends in a perpendicular stub', () => {
  const bad = [];
  for (const [name, st] of diagrams) for (const r of measure(st)) if (Math.min(r.entryFrom, r.entryTo) < MIN_ENTRY - 0.01) bad.push(`${name} ${r.id} ${r.from}->${r.to}: ${Math.min(r.entryFrom, r.entryTo).toFixed(1)}`);
  assert.deepEqual(bad, []);
});
test('every arrow attaches at least 8 px from the corners of its side', () => {
  const bad = [];
  for (const [name, st] of diagrams) for (const r of measure(st)) if (r.corner < CORNER - 0.01) bad.push(`${name} ${r.id}: ${r.corner.toFixed(1)}`);
  assert.deepEqual(bad, []);
});
test('arrows keep their distance from other shapes (8 px; crowded diagrams excepted)', () => {
  let n = 0, tight = 0; const bad = [];
  for (const [name, st] of diagrams) for (const r of measure(st)) { n++; if (r.clearance < CLEAR - 0.01) { tight++; bad.push(`${name} ${r.id} ${r.from}->${r.to}: ${r.clearance.toFixed(1)}`); } }
  assert.ok(tight <= Math.ceil(n * 0.03), `${tight} of ${n} arrows closer than ${CLEAR}px: ${bad.slice(0, 8).join('; ')}`);
});
test('parallel and opposite arrows between the same two shapes are spread apart', () => {
  const st = diagrams.find(([n]) => n.startsWith('fan: parallel'))[1];
  const rows = measure(st);
  assert.ok(rows.length >= 2, `${rows.length} arrows`);
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i].pts, b = rows[j].pts;
    const d = Math.hypot((a[0][0] + a.at(-1)[0]) / 2 - (b[0][0] + b.at(-1)[0]) / 2, (a[0][1] + a.at(-1)[1]) / 2 - (b[0][1] + b.at(-1)[1]) / 2);
    assert.ok(d >= SPREAD * 0.9, `arrows ${rows[i].id} and ${rows[j].id} only ${d.toFixed(1)} px apart`);
  }
});
