// SPDX-License-Identifier: AGPL-3.0-only
// A reviewer's look at where the Drawing tab (worlds/art.draw/area.sop) puts new objects. It builds scenes only
// through the area's own commands (drawing.object.make with a kind and nothing else), then checks the outcome as a
// person looking at the page would: water things in the water when there is water (else low on the page), sky
// things in the sky, ground things on the ground, everything on the page, no overlaps except a declared containment
// (a k.layouts anchor of the container that holds the kind: a boat on the lake's water), no object centred on
// another, sizes ordered as k.scenes size classes say. It writes one SVG (and, with chromium, one PNG) per scene.
//   node scripts/review-drawing-placement.mjs [--out <dir>] [--png] [--catalog <docs/worlds dir>] [--scene <name>] [--rules] [--z3 <z3-solver build/node.js>]
// By default each object is placed as the application places it (the area's declared placement problem, std.problem);
// --rules runs the bare command instead (the area's grid of spots).
// Exit 1 when a check fails. The expectations below are the reviewer's, not the area's: the area must meet them
// from its own rules and knowledge.
import {mkdirSync, writeFileSync, readFileSync, existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {parse, str} from '../src/vendor/sopworld/sopworld.mjs';
import {createDrawingArea, projectDrawingArea} from '../worlds/art.draw/sop-drawing.mjs';
import {toolInvocationContext} from '../worlds/native-tool-host.mjs';
import {BUNDLED_AREAS} from '../src/knowledge/bundled-areas.mjs';
import {solveDefaultPlacement} from '../src/dialog/default-placement.mjs';

const W = 1000, H = 700, HORIZON = H / 2;
// Where a person expects each kind (the landscape of a child's picture: sky above the horizon, ground below).
const EXPECT = {
  water: ['boat', 'fish', 'duck', 'swan', 'ship'],
  sky: ['sun', 'moon', 'cloud', 'rainbow', 'balloon', 'rocket'],
  skyOrTree: ['bird'],
  ground: ['house', 'tree', 'person', 'car', 'road', 'cat', 'dog', 'flower', 'lake', 'river', 'field'],
  // Far away at the horizon (k.layouts landscape "far"): the base below the horizon.
  horizon: ['hill', 'mountain'],
};
const SIZE_RANK = {tiny: 0, small: 1, medium: 2, large: 3, huge: 4};
export const SCENES = {
  'lake-scene': ['lake', 'boat', 'fish', 'duck', 'house', 'tree', 'sun', 'cloud', 'bird', 'person', 'car', 'road', 'cat', 'moon', 'flower'],
  'no-water': ['boat', 'fish', 'house', 'sun', 'tree'],
  'water-later': ['boat', 'house', 'lake', 'fish', 'duck'],
  'pond-life': ['lake', 'boat', 'fish', 'duck', 'fish', 'tree', 'bird'],
  'crowded': ['house', 'house', 'tree', 'tree', 'tree', 'person', 'person', 'car', 'car', 'dog', 'cat', 'flower', 'flower', 'sun', 'cloud', 'cloud', 'bird', 'bird', 'hill', 'road'],
};

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const val = (wire, key) => { const raw = wire.attrs[key]?.[0]; return raw === undefined ? undefined : raw.startsWith('"') ? str(raw) : raw; };

/** The catalog files the review reads its knowledge from: a docs/worlds folder, else the area's offline subset. */
function knowledgeReader(dir) {
  if (dir) return {readText: async (file) => readFileSync(join(dir, file), 'utf8')};
  return null;
}
function catalogText(dir, file) {
  if (dir && existsSync(join(dir, file))) return readFileSync(join(dir, file), 'utf8');
  return BUNDLED_AREAS['art.draw'][file] ?? '';
}
export function knowledge(dir) {
  const index = JSON.parse(catalogText(dir, 'index.json'));
  const shardsOf = (id) => [...(index.worlds ?? []), ...(index.schemas ?? [])].find((e) => e.id === id)?.shards?.map((s) => typeof s === 'string' ? s : s.path) ?? [];
  const wires = (id, type) => shardsOf(id).flatMap((p) => parse(catalogText(dir, p))).filter((w) => w.type === type);
  const size = new Map(wires('k.scenes', 'k.scenes.thing').map((w) => [val(w, 'name'), val(w, 'size')]));
  // Anchors of the containers, as the reviewer's own source of "it must overlap": the boat on the lake's water.
  let anchors = wires('k.layouts', 'k.layouts.anchor');
  if (!anchors.length) {
    const fallback = dir ?? resolve(import.meta.dirname, '../../sop-knowledge-worlds/docs/worlds');
    const path = join(fallback, 'k.layouts/shards/anchors.sop');
    if (existsSync(path)) anchors = parse(readFileSync(path, 'utf8')).filter((w) => w.type === 'k.layouts.anchor');
  }
  return {size, anchors: anchors.map((w) => ({of: val(w, 'of'), name: val(w, 'name'), x: +val(w, 'x'), y: +val(w, 'y'), w: +val(w, 'w'), h: +val(w, 'h'),
    holds: (w.attrs.holds ?? []).map((raw) => raw.startsWith('"') ? str(raw) : raw)}))};
}

const box = (o) => ({x0: o.x - o.size / 2, y0: o.y - o.size / 2, x1: o.x + o.size / 2, y1: o.y + o.size / 2});
const overlap = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const inBox = (x, y, b) => x >= b.x0 - 1e-9 && x <= b.x1 + 1e-9 && y >= b.y0 - 1e-9 && y <= b.y1 + 1e-9;
const anchorBox = (o, a) => { const s = o.size / 100, x0 = o.x - o.size / 2, y0 = o.y - o.size / 2; return {x0: x0 + a.x * s, y0: y0 + a.y * s, x1: x0 + (a.x + a.w) * s, y1: y0 + (a.y + a.h) * s}; };

/** The declared containment that lets b overlap a: an anchor of a's kind that holds b's kind, with b's centre in it. */
function contained(inner, outer, k) {
  return k.anchors.some((a) => a.of === outer.kind && a.holds.includes(inner.kind) && (a.w === 0 || a.h === 0
    ? Math.hypot(inner.x - (anchorBox(outer, a).x0 + anchorBox(outer, a).x1) / 2, inner.y - (anchorBox(outer, a).y0 + anchorBox(outer, a).y1) / 2) <= inner.size / 2 + 1
    : inBox(inner.x, inner.y, anchorBox(outer, a))));
}

export function review(objects, k) {
  const failures = [], notes = [];
  const fail = (o, why) => failures.push(`${o.id} ${o.kind} (${o.x},${o.y} size ${o.size}): ${why}`);
  const waters = objects.filter((o) => k.anchors.some((a) => a.of === o.kind && a.name === 'water'));
  for (const o of objects) {
    const b = box(o);
    if (b.x0 < 0 || b.y0 < 0 || b.x1 > W || b.y1 > H) fail(o, 'leaves the page');
    if (EXPECT.water.includes(o.kind)) {
      // Water drawn after the thing is no reason to move it; a thing drawn after the water goes in.
      const earlier = waters.filter((w) => w.z < o.z), holder = waters.find((w) => w.id !== o.id && contained(o, w, k));
      if (earlier.length && !holder) fail(o, 'not in the water although ' + waters.map((w) => w.id + ' ' + w.kind).join(', ') + ' is on the page');
      if (!earlier.length && o.y <= HORIZON) fail(o, 'no water on the page, yet it is not low on the page');
    }
    if (EXPECT.sky.includes(o.kind) && b.y1 > HORIZON + 1e-9) fail(o, 'not in the sky (its box reaches below the horizon)');
    if (EXPECT.skyOrTree.includes(o.kind) && b.y1 > HORIZON + 1e-9 && !objects.some((t) => t.id !== o.id && contained(o, t, k))) fail(o, 'neither in the sky nor on a thing that holds it');
    if (EXPECT.ground.includes(o.kind) && (o.y <= HORIZON || b.y0 < HORIZON * 0.6)) fail(o, 'not standing on the ground (below the horizon)');
    if (EXPECT.horizon.includes(o.kind) && b.y1 <= HORIZON) fail(o, 'floats above the horizon');
    if (!o.size || o.size < 30) fail(o, 'too small to see');
  }
  for (let i = 0; i < objects.length; i++) for (let j = i + 1; j < objects.length; j++) {
    const a = objects[i], b = objects[j];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 10) fail(b, 'centred on ' + a.id + ' ' + a.kind);
    const area = overlap(box(a), box(b));
    if (area > 0 && !contained(a, b, k) && !contained(b, a, k)) fail(b, `overlaps ${a.id} ${a.kind} by ${Math.round(area)} px²`);
  }
  // Relative sizes: a thing of a larger k.scenes size class is not drawn smaller, unless it sits in a container.
  const free = objects.filter((o) => !objects.some((t) => t.id !== o.id && contained(o, t, k)));
  for (const a of free) for (const b of free) {
    const ra = SIZE_RANK[k.size.get(a.kind)], rb = SIZE_RANK[k.size.get(b.kind)];
    // Drawn smaller is fine when it is also farther away: its base higher on the page (perspective).
    if (ra !== undefined && rb !== undefined && ra > rb && box(a).y1 >= box(b).y1 && (a.size < b.size || (ra - rb >= 2 && a.size <= b.size))) fail(a, `drawn smaller than ${b.id} ${b.kind} although its size class is ${k.size.get(a.kind)} against ${k.size.get(b.kind)}`);
  }
  const kinds = new Set(objects.map((o) => o.kind));
  if (kinds.has('house') && kinds.has('cat')) notes.push('house/cat sizes ' + objects.find((o) => o.kind === 'house').size + '/' + objects.find((o) => o.kind === 'cat').size);
  return {failures: [...new Set(failures)], notes};
}

export async function buildScene(kinds, {catalog, rules = false, solveMs = [], provider} = {}) {
  const state = {sop: '', runtime: {view: {}}}, reader = knowledgeReader(catalog);
  let n = 0;
  const statuses = [];
  for (const kind of kinds) {
    // A fresh host per command, as the application creates one per turn (the lookups follow the page).
    const host = await createDrawingArea({state, knowledge: reader ?? undefined, args: {kind}});
    const invoke = (sop) => host.invoke(sop, toolInvocationContext('review-' + (n++), host.observe().version));
    // A kind the tab does not offer by name is drawn from the catalog (drawing.catalog.make), as the reader does.
    // As the application does: the placement problem the area declares, solved as std.problem (the internal search in
    // Node), gives the command its place and size; --rules runs the command bare (the area's own grid of spots).
    const place = async (intent) => {
      if (rules) return invoke(intent);
      const t0 = performance.now(), solved = await solveDefaultPlacement(host, {intent, provider});
      solveMs.push(performance.now() - t0);
      return solved?.solved ? invoke(`${intent} x=${solved.x} y=${solved.y} size=${solved.size}`) : invoke(intent);
    };
    let result = await place(`@c drawing.object.make kind="${kind}"`);
    if (result.reason === 'invalid-argument-value') result = await place(`@c drawing.catalog.make name="${kind}"`);
    statuses.push([kind, result.status, result.reason ?? '']);
  }
  const objects = parse(state.sop).filter((w) => w.type === 'w.drawing.object').map((w) => ({id: val(w, 'code'), kind: val(w, 'drawing'),
    x: Number(val(w, 'x')), y: Number(val(w, 'y')), size: Number(val(w, 'size')), z: Number(val(w, 'z'))}));
  return {state, objects, statuses};
}

async function main() {
  const out = resolve(arg('--out') ?? join(import.meta.dirname, '../.cache/drawing-placement-review'));
  const catalog = arg('--catalog') ? resolve(arg('--catalog')) : undefined;
  mkdirSync(out, {recursive: true});
  const k = knowledge(catalog);
  // --z3 <z3-solver build/node.js>: solve with Z3 (the library's Node provider), as the isolated page does.
  const z3Module = arg('--z3');
  let provider;
  if (z3Module) {
    const {solveWithZ3} = await import('../src/vendor/sopworld/z3-translate.mjs'), {Context} = await createRequire(import.meta.url)(resolve(z3Module)).init(), z = new Context('sopworld');
    provider = (model) => solveWithZ3(z, model);
  }
  let failed = 0;
  const only = arg('--scene');
  for (const [name, kinds] of Object.entries(SCENES).filter(([name]) => !only || name === only)) {
    const solveMs = [], t0 = performance.now();
    const {state, objects, statuses} = await buildScene(kinds, {catalog, rules: process.argv.includes('--rules'), solveMs, provider});
    const sceneMs = performance.now() - t0;
    const refused = statuses.filter(([, s]) => s !== 'changed');
    const {failures, notes} = review(objects, k);
    failed += failures.length + refused.length;
    console.log(`\n== ${name}: ${objects.length} objects, ${failures.length} failed checks${refused.length ? ', refused: ' + refused.map((r) => r.join(' ')).join('; ') : ''}; ${Math.round(sceneMs)} ms${solveMs.length ? ', placement solve ' + Math.round(solveMs.reduce((a, b) => a + b, 0) / solveMs.length) + ' ms mean, ' + Math.round(Math.max(...solveMs)) + ' ms max' : ''}`);
    for (const o of objects) console.log(`   ${o.id.padEnd(4)} ${o.kind.padEnd(8)} x=${o.x} y=${o.y} size=${o.size}`);
    for (const f of failures) console.log('   FAIL ' + f);
    for (const note of notes) console.log('   note ' + note);
    const {svg} = projectDrawingArea(state);
    // The page with its horizon, so a reviewer sees the sky and the ground the checks use.
    const page = svg.replace(/(<svg[^>]*>)/, `$1<rect x="0" y="0" width="${W}" height="${HORIZON}" fill="#e8f4ff"/><rect x="0" y="${HORIZON}" width="${W}" height="${HORIZON}" fill="#eef7e6"/>`);
    const file = join(out, name + '.svg');
    writeFileSync(file, page);
    if (process.argv.includes('--png')) {
      const png = join(out, name + '.png');
      spawnSync('chromium', ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', `--screenshot=${png}`, '--window-size=1000,700', 'file://' + file], {stdio: 'ignore'});
      console.log('   ' + png);
    } else console.log('   ' + file);
  }
  console.log(`\n${failed ? failed + ' failed checks' : 'all checks passed'}`);
  process.exitCode = failed ? 1 : 0;
  if (provider) process.exit(process.exitCode);   // Z3's threads keep Node alive
}

if (import.meta.url === 'file://' + process.argv[1]) await main();
