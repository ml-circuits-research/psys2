// SPDX-License-Identifier: AGPL-3.0-only
// Source: https://github.com/ml-circuits-research/diagram-vss-demo, commit 9900d34836bf3fc913a6549f3da4c444bfa11304, docs/js/auto-layout.js (AGPL-3.0).
// Converted to an ES module by scripts/convert-diagram-engine.mjs (mechanical wrap; see imports/diagram-vss-demo/PROVENANCE.md). Do not edit by hand.
const module = { exports: {} };
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };   // the turn's step budget (no-op outside a turn)
/* auto-layout.js: whole-diagram and selection-level layout operations (re-layout of EXISTING shapes) and a measurable layout quality score.
   Design: training/sketch/ops/HIGH_LEVEL_OPS.md; integration into the engine: docs/js/ops-integration.md; tests: training/sketch/ops/test_auto_layout.mjs.
   (Creation templates, docs/js/templates.js, MAKE new shapes in a form; these functions MOVE shapes that already exist.)

   Pure functions, no dependency, deterministic (no randomness: ties are broken by reading order, then by name). UMD: browser global
   `AutoLayout`, or `module.exports` in node.

   Input
     shapes: [{ name, x, y, w, h, color?, shape?, size?, label?, outline? }]   x, y = the CENTRE (as docs/js/logic.js), w, h = the box size
     links:  [{ from, to, arrow? }]   arrow 'forward' (default) is directed; 'none' / 'both' are undirected
     opts:   { canvas: {x, y, w, h} (default 0, 0, 800, 500), targets: [names] (the shapes that may move; default all; the others are
               obstacles), groups: [{name, members}] (a group moves as one block in the re-layouts), ... op-specific options }
   Output (every op)
     { kind, positions: {name: {x, y}} (rounded, for every movable shape), moved: [names whose position changed], notes: [strings],
       crowded: bool (the result does not fit the canvas without overlaps) }  + op-specific fields.
   Errors: throws LayoutError {code, message, ask} (ask = true: the engine should ask the user, the message proposes an alternative). */
(function (root) {
'use strict';

class LayoutError extends Error {
  constructor(code, message, extra) { super(message); this.name = 'LayoutError'; this.code = code; Object.assign(this, extra || {}); }
}

/* ---------------------------------------------------------------- constants ---------------------------------------------------------------- */
const DEFAULT_CANVAS = { x: 0, y: 0, w: 800, h: 500 };
const MARGIN = { l: 10, t: 24, r: 10, b: 10 };          // as logic.js clampPt
const GAP = 40;                                           // gap between neighbouring boxes in the regular layouts
const LEVEL_GAP = 60;                                     // gap between the levels of a tree / the layers of a layered layout
const CLEAR = 4;                                          // the clearance overlap removal keeps between two boxes
const PALETTE = ['red', 'orange', 'yellow', 'gold', 'lime', 'green', 'teal', 'cyan', 'blue', 'navy', 'indigo', 'purple', 'magenta', 'pink', 'brown', 'gray', 'black', 'white'];   // logic.js COLOR_VALUES order
const SHAPE_ORDER = ['circle', 'square', 'rectangle', 'triangle', 'diamond', 'ellipse', 'hexagon', 'star'];                                                                       // logic.js SHAPE_VALUES order
const LAYOUTS = ['row', 'column', 'grid', 'circle', 'tree', 'layers', 'radial', 'organic', 'auto'];
const WEIGHTS = { overlap: 28, crossing: 16, through: 14, outside: 10, labels: 4, length: 6, align: 6, spacing: 9, flow: 7 };   // sum 100
const LINKED_KINDS = ['tree', 'layers', 'radial', 'organic'];

/* ---------------------------------------------------------------- small helpers ---------------------------------------------------------------- */
const cmpStr = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const natCmp = (a, b) => { const A = String(a).toLowerCase(), B = String(b).toLowerCase(); const re = /(\d+)|(\D+)/g; const pa = A.match(re) || [], pb = B.match(re) || [];
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) { const x = pa[i], y = pb[i]; if (x === y) continue; const nx = /^\d/.test(x), ny = /^\d/.test(y); if (nx && ny) return (+x) - (+y) || cmpStr(x, y); return cmpStr(x, y); }
  return pa.length - pb.length || cmpStr(String(a), String(b)); };
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const median = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const cv = a => { if (a.length < 2) return 0; const m = mean(a); if (m <= 0) return 0; return Math.sqrt(mean(a.map(v => (v - m) ** 2))) / m; };
const r1 = v => Math.round(v * 10) / 10;
const listing0 = a => a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
const canvasOf = o => Object.assign({}, DEFAULT_CANVAS, (o && o.canvas) || {});
const innerOf = c => ({ x1: c.x + MARGIN.l, y1: c.y + MARGIN.t, x2: c.x + c.w - MARGIN.r, y2: c.y + c.h - MARGIN.b });
const box = n => ({ x1: n.x - n.w / 2, y1: n.y - n.h / 2, x2: n.x + n.w / 2, y2: n.y + n.h / 2 });
function bboxOf(ns) {
  if (!ns.length) return { x1: 0, y1: 0, x2: 0, y2: 0, cx: 0, cy: 0, w: 0, h: 0 };
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const n of ns) { x1 = Math.min(x1, n.x - n.w / 2); y1 = Math.min(y1, n.y - n.h / 2); x2 = Math.max(x2, n.x + n.w / 2); y2 = Math.max(y2, n.y + n.h / 2); }
  return { x1, y1, x2, y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, w: x2 - x1, h: y2 - y1 };
}

/** internal node copies: {name, x, y, w, h, src, i} */
function nodesOf(shapes) {
  const seen = new Set();
  return (shapes || []).map((s, i) => {
    const name = String(s.name);
    if (seen.has(name)) throw new LayoutError('bad-input', `Two shapes are named ${name}.`);
    seen.add(name);
    const sz = +s.size || 62;
    return { name, x: +s.x || 0, y: +s.y || 0, w: +s.w || sz, h: +s.h || sz, src: s, i };
  });
}

/** reading order: top to bottom by rows (a new row starts when a centre is more than half a typical height below the row's first), then
 *  left to right, then by name. -> the nodes in that order (each gets n.rank) */
function readingOrder(ns) {
  const byY = ns.slice().sort((a, b) => a.y - b.y || a.x - b.x || cmpStr(a.name, b.name));
  const tol = Math.max(8, 0.5 * median(ns.map(n => n.h)));
  let band = -1, start = null; const bandOf = new Map();
  for (const n of byY) { if (start === null || n.y - start > tol) { band++; start = n.y; } bandOf.set(n, band); }
  const out = byY.sort((a, b) => bandOf.get(a) - bandOf.get(b) || a.x - b.x || cmpStr(a.name, b.name));
  out.forEach((n, i) => { n.rank = i; });
  return out;
}

/** the link graph over nodes ns: E = [{a, b, directed}] (indices into ns; duplicate links and self-links dropped), with adjacency */
function graphOf(ns, links) {
  const idx = new Map(ns.map((n, i) => [n.name, i])), E = [], seen = new Set();
  for (const l of links || []) {
    const a = idx.get(String(l.from)), b = idx.get(String(l.to));
    if (a == null || b == null || a === b) continue;
    const directed = l.arrow == null || l.arrow === 'forward';
    const k = directed ? a + '>' + b : (a < b ? a + '-' + b : b + '-' + a);
    if (seen.has(k)) continue; seen.add(k);
    E.push({ a, b, directed, label: l.label || null });
  }
  const und = ns.map(() => []), out = ns.map(() => []), inn = ns.map(() => []);
  E.forEach((e, k) => { und[e.a].push(e.b); und[e.b].push(e.a); if (e.directed) { out[e.a].push(e.b); inn[e.b].push(e.a); } });
  return { E, und, out, inn, n: ns.length };
}

function componentsOf(G, order) {
  const comp = new Array(G.n).fill(-1), comps = [];
  for (const s of order) {
    if (comp[s] >= 0) continue;
    const c = comps.length, list = [s]; comp[s] = c;
    for (let k = 0; k < list.length; k++) for (const v of G.und[list[k]]) if (comp[v] < 0) { comp[v] = c; list.push(v); }
    comps.push(list);
  }
  return { comp, comps };
}

/** a directed cycle (indices, in order) or null; iterative DFS in the given order */
function findCycle(G, order) {
  const state = new Array(G.n).fill(0), parent = new Array(G.n).fill(-1);
  for (const s of order) {
    if (state[s]) continue;
    const stack = [[s, 0]]; state[s] = 1;
    while (stack.length) {
      budget.tick('diagram.layout');
      const top = stack[stack.length - 1], [v, i] = top;
      if (i < G.out[v].length) {
        top[1]++;
        const w = G.out[v][i];
        if (state[w] === 1) { const path = []; let x = v; while (x !== w && x >= 0) { path.push(x); x = parent[x]; } return [w].concat(path.reverse()); }
        if (!state[w]) { state[w] = 1; parent[w] = v; stack.push([w, 0]); }
      } else { state[v] = 2; stack.pop(); }
    }
  }
  return null;
}

/** analyse(shapes, links): the link structure that decides which layout fits.
 *  -> {n, m, components, isolated, isForest (no loop when arrows are ignored), multiParent: [{name, parents}], cycle: [names] | null,
 *      isTree (forest and no shape with two incoming arrows), isDAG (no directed loop), roots: [names] } */
function analyse(shapes, links) {
  const ns = nodesOf(shapes), order = readingOrder(ns).map(n => n.i), G = graphOf(ns, links), C = componentsOf(G, order);
  const isForest = G.E.length === G.n - C.comps.length;
  const multiParent = order.filter(i => G.inn[i].length > 1).map(i => ({ name: ns[i].name, parents: G.inn[i].map(j => ns[j].name) }));
  const cyc = findCycle(G, order);
  return { n: G.n, m: G.E.length, components: C.comps.length, isolated: order.filter(i => !G.und[i].length).map(i => ns[i].name),
    isForest, multiParent, cycle: cyc ? cyc.map(i => ns[i].name) : null, isTree: G.E.length > 0 && isForest && !multiParent.length, isDAG: !cyc,
    roots: order.filter(i => G.und[i].length && !G.inn[i].length).map(i => ns[i].name) };
}

/* ---------------------------------------------------------------- geometry tests ---------------------------------------------------------------- */
function boxesOverlap(p, q, clear) { return p.x - p.w / 2 < q.x + q.w / 2 + clear && q.x - q.w / 2 < p.x + p.w / 2 + clear && p.y - p.h / 2 < q.y + q.h / 2 + clear && q.y - q.h / 2 < p.y + p.h / 2 + clear; }
/** every overlapping pair [i, j] (i < j) with the given clearance; sweep over x */
function overlapPairs(ns, clear) {
  const idx = ns.map((_, i) => i).sort((a, b) => (ns[a].x - ns[a].w / 2) - (ns[b].x - ns[b].w / 2) || a - b), out = [];
  for (let s = 0; s < idx.length; s++) {
    const p = ns[idx[s]], px2 = p.x + p.w / 2 + clear;
    for (let t = s + 1; t < idx.length; t++) { const q = ns[idx[t]]; if (q.x - q.w / 2 >= px2) break; if (boxesOverlap(p, q, clear)) out.push(idx[s] < idx[t] ? [idx[s], idx[t]] : [idx[t], idx[s]]); }
  }
  return out;
}
const orient = (ax, ay, bx, by, cx, cy) => { const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); return v > 1e-9 ? 1 : v < -1e-9 ? -1 : 0; };
function segCross(p1, p2, p3, p4) {   // proper crossing (touching at an end does not count)
  const d1 = orient(p3.x, p3.y, p4.x, p4.y, p1.x, p1.y), d2 = orient(p3.x, p3.y, p4.x, p4.y, p2.x, p2.y);
  const d3 = orient(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y), d4 = orient(p1.x, p1.y, p2.x, p2.y, p4.x, p4.y);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
/** does the segment p-q pass through the box of n (shrunk by 2 px)? Liang-Barsky */
function segThroughBox(p, q, n) {
  const x1 = n.x - n.w / 2 + 2, x2 = n.x + n.w / 2 - 2, y1 = n.y - n.h / 2 + 2, y2 = n.y + n.h / 2 - 2;
  if (x1 >= x2 || y1 >= y2) return false;
  let t0 = 0, t1 = 1; const dx = q.x - p.x, dy = q.y - p.y;
  for (const [pp, qq] of [[-dx, p.x - x1], [dx, x2 - p.x], [-dy, p.y - y1], [dy, y2 - p.y]]) {
    if (pp === 0) { if (qq < 0) return false; continue; }
    const r = qq / pp; if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t0 < t1;
}

/* ---------------------------------------------------------------- the quality score ----------------------------------------------------------------
   score = 100 - sum over the criteria of weight x term, each term in [0, 1] (0 = perfect). Criteria (raw counts are in `metrics`):
     overlap   pairs of shapes closer than 2 px (boxes touching or overlapping)          term = min(1, 2 * pairs / n)
     crossing  pairs of links that cross (links sharing a shape do not count)            term = min(1, crossings / m)
     through   a link passing through a shape that is not one of its ends               term = min(1, 2 * cases / m)
     outside   shapes not entirely inside the canvas                                     term = shapes / n
     length    variation of the link lengths (coefficient of variation)                  term = min(1, cv)
     align     shapes whose centre shares no x and no y (within 2 px) with another shape term = share of such shapes
     spacing   variation of the distance from each shape to its nearest neighbour        term = min(1, cv)
     flow      arrows that do not point the way most arrows point (down, up, left, right) term = share of the directed links
     labels    an arrow's label that has no free place beside the middle of its straight line (a shape's box on both sides)
                                                                                         term = share of the labelled links
   Weights (WEIGHTS): overlap 28, crossing 16, through 14, outside 10, labels 4, length 6, align 6, spacing 9, flow 7 (2026-11-03: spacing
   evenness and the labels added weight after the owner's session, where shapes bunched up and lines went through shapes). Overlaps make
   a diagram unreadable; among the drawing aesthetics, crossings affect understanding most (Purchase 1997, see HIGH_LEVEL_OPS.md).
   `through` counts the STRAIGHT line between the two centres: the layout objective. What is drawn may bend around a shape (routeEdges). */
function scoreNodes(ns, G, canvas) {
  const n = ns.length, m = G.E.length;
  const P = ns.map(x => ({ x: x.x, y: x.y }));
  const overlaps = overlapPairs(ns, 2).length;
  let crossings = 0;
  if (m > 1) {
    const segs = G.E.map(e => ({ a: e.a, b: e.b, x1: Math.min(P[e.a].x, P[e.b].x), x2: Math.max(P[e.a].x, P[e.b].x), y1: Math.min(P[e.a].y, P[e.b].y), y2: Math.max(P[e.a].y, P[e.b].y) }));
    const order = segs.map((_, i) => i).sort((i, j) => segs[i].x1 - segs[j].x1 || i - j);
    for (let s = 0; s < order.length; s++) { const e = segs[order[s]];
      for (let t = s + 1; t < order.length; t++) { const f = segs[order[t]]; if (f.x1 > e.x2) break;
        if (f.y1 > e.y2 || f.y2 < e.y1) continue;
        if (e.a === f.a || e.a === f.b || e.b === f.a || e.b === f.b) continue;
        if (segCross(P[e.a], P[e.b], P[f.a], P[f.b])) crossings++; } }
  }
  let through = 0;
  for (const e of G.E) {
    const p = P[e.a], q = P[e.b], x1 = Math.min(p.x, q.x), x2 = Math.max(p.x, q.x), y1 = Math.min(p.y, q.y), y2 = Math.max(p.y, q.y);
    for (let k = 0; k < n; k++) { if (k === e.a || k === e.b) continue; const s = ns[k];
      if (s.x + s.w / 2 < x1 || s.x - s.w / 2 > x2 || s.y + s.h / 2 < y1 || s.y - s.h / 2 > y2) continue;
      if (segThroughBox(p, q, s)) through++; }
  }
  const c = canvas, outside = ns.filter(s => s.x - s.w / 2 < c.x - 0.5 || s.y - s.h / 2 < c.y - 0.5 || s.x + s.w / 2 > c.x + c.w + 0.5 || s.y + s.h / 2 > c.y + c.h + 0.5).length;
  const lengths = G.E.map(e => Math.hypot(P[e.a].x - P[e.b].x, P[e.a].y - P[e.b].y));
  let unaligned = 0;
  if (n >= 2) for (let i = 0; i < n; i++) { let ok = false; for (let j = 0; j < n && !ok; j++) if (j !== i && (Math.abs(P[i].x - P[j].x) <= 2 || Math.abs(P[i].y - P[j].y) <= 2)) ok = true; if (!ok) unaligned++; }
  const nn = [];
  if (n >= 3) for (let i = 0; i < n; i++) { let best = Infinity; for (let j = 0; j < n; j++) if (j !== i) best = Math.min(best, Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y)); nn.push(best); }
  const dirs = { down: 0, up: 0, left: 0, right: 0 }; let directed = 0;
  for (const e of G.E) { if (!e.directed) continue; const dx = P[e.b].x - P[e.a].x, dy = P[e.b].y - P[e.a].y; if (!dx && !dy) continue; directed++; dirs[Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'right' : 'left')]++; }
  const against = directed ? directed - Math.max(...Object.values(dirs)) : 0;
  let labelled = 0, labelHits = 0;
  for (const e of G.E) { if (!e.label) continue; labelled++;
    const p = P[e.a], q = P[e.b], L = Math.hypot(q.x - p.x, q.y - p.y) || 1, ux = (q.x - p.x) / L, uy = (q.y - p.y) / L, lw = String(e.label).length * 6.8 + 4;
    const free = side => { const off = side * (12 + Math.abs(uy) * lw / 2), cx = (p.x + q.x) / 2 - uy * off, cy = (p.y + q.y) / 2 + ux * off, b = { x: cx, y: cy, w: lw, h: 16 };
      return !ns.some(s => boxesOverlap(b, s, 0)); };
    if (!free(1) && !free(-1)) labelHits++; }
  const metrics = { shapes: n, links: m, overlaps, crossings, through, outside, lengthCV: r1(cv(lengths) * 100) / 100, unaligned, spacingCV: r1(cv(nn) * 100) / 100, against, labelHits };
  const terms = {
    overlap: n ? Math.min(1, 2 * overlaps / n) : 0, crossing: m ? Math.min(1, crossings / m) : 0, through: m ? Math.min(1, 2 * through / m) : 0,
    outside: n ? outside / n : 0, labels: labelled ? labelHits / labelled : 0, length: Math.min(1, cv(lengths)), align: n >= 2 ? unaligned / n : 0, spacing: Math.min(1, cv(nn)), flow: directed ? against / directed : 0
  };
  let pen = 0; for (const k of Object.keys(WEIGHTS)) pen += WEIGHTS[k] * terms[k];
  return { score: r1(100 - pen), metrics, terms };
}
/** score(shapes, links, opts) -> {score (0..100, higher is better), metrics (raw counts), terms (0..1 per criterion)} */
function score(shapes, links, opts) { const ns = nodesOf(shapes); return scoreNodes(ns, graphOf(ns, links), canvasOf(opts)); }

/* ---------------------------------------------------------------- overlap removal ----------------------------------------------------------------
   Pushes overlapping boxes apart along the axis of smaller penetration (or the locked axis), splitting the move between two movable
   boxes; fixed boxes (obstacles) never move. Repeats until no pair overlaps or 120 passes; keeps movable boxes inside `bounds`. */
function separateNodes(ns, movable, opts) {
  const o = opts || {}, clear = o.clear != null ? o.clear : CLEAR, lock = o.lock || null, B = o.bounds || null;
  const mv = i => movable[i];
  const clamp = i => { if (!B || !mv(i)) return; const n = ns[i];
    const lx = B.x1 + n.w / 2, hx = B.x2 - n.w / 2, ly = B.y1 + n.h / 2, hy = B.y2 - n.h / 2;
    if (lx <= hx) n.x = Math.min(hx, Math.max(lx, n.x)); if (ly <= hy) n.y = Math.min(hy, Math.max(ly, n.y)); };
  ns.forEach((_, i) => clamp(i));
  let pass = 0;
  for (; pass < 120; pass++) {
    budget.tick('diagram.layout', 1 + ns.length * ns.length);
    const pairs = overlapPairs(ns, clear - 0.01); let moved = false;
    for (const [i, j] of pairs) {
      if (!mv(i) && !mv(j)) continue;
      const p = ns[i], q = ns[j];
      if (!boxesOverlap(p, q, clear - 0.01)) continue;
      const dx = q.x - p.x, dy = q.y - p.y;
      const ox = (p.w + q.w) / 2 + clear - Math.abs(dx), oy = (p.h + q.h) / 2 + clear - Math.abs(dy);
      const axis = lock ? (lock === 'x' ? 'x' : 'y') : (ox <= oy ? 'x' : 'y');
      const d = axis === 'x' ? dx : dy;
      const sign = d > 0 ? 1 : d < 0 ? -1 : (cmpStr(p.name, q.name) <= 0 ? 1 : -1);   // q goes the positive way when they coincide
      const amount = (axis === 'x' ? ox : oy) + 0.5;
      const sp = mv(i) && mv(j) ? 0.5 : mv(i) ? 1 : 0, sq = 1 - sp;
      if (axis === 'x') { p.x -= sign * amount * sp; q.x += sign * amount * sq; } else { p.y -= sign * amount * sp; q.y += sign * amount * sq; }
      clamp(i); clamp(j); moved = true;
    }
    if (!moved) break;
  }
  return overlapPairs(ns, 0.5).filter(([i, j]) => mv(i) || mv(j)).length;   // overlaps left
}

/* ---------------------------------------------------------------- the working context ---------------------------------------------------------------- */
/** ctx: all nodes, which ones move (targets), the links among the movable ones, groups collapsed into blocks when asked */
function context(shapes, links, opts, collapse) {
  const o = opts || {}, all = nodesOf(shapes), canvas = canvasOf(o);
  const byName = new Map(all.map(n => [n.name, n]));
  const tnames = o.targets && o.targets.length ? [...new Set(o.targets.map(String))] : all.map(n => n.name);
  for (const t of tnames) if (!byName.has(t)) throw new LayoutError('unknown-shape', `There is no shape named "${t}".`);
  const movable = new Set(tnames);
  let work = all.filter(n => movable.has(n.name)), blocks = [];
  let wlinks = (links || []).filter(l => movable.has(String(l.from)) && movable.has(String(l.to)));
  if (collapse && o.groups && o.groups.length) {
    // a group whose members all move, among other moving shapes, becomes one block (its box); its members keep their places inside it
    const inBlock = new Map();
    for (const g of o.groups) {
      const ms = (g.members || []).map(String).filter(x => movable.has(x));
      if (ms.length < 2 || ms.length !== (g.members || []).length || ms.length === work.length) continue;
      if (ms.some(x => inBlock.has(x))) continue;
      const mns = ms.map(x => byName.get(x)), b = bboxOf(mns);
      const blk = { name: '\u0000group:' + g.name, x: b.cx, y: b.cy, w: b.w, h: b.h, src: { name: g.name, group: true }, members: mns, x0: b.cx, y0: b.cy, i: -1 };
      blocks.push(blk); ms.forEach(x => inBlock.set(x, blk.name));
    }
    if (blocks.length) {
      work = work.filter(n => !inBlock.has(n.name)).concat(blocks);
      const map = x => inBlock.get(String(x)) || String(x);
      wlinks = wlinks.map(l => ({ from: map(l.from), to: map(l.to), arrow: l.arrow, label: l.label })).filter(l => l.from !== l.to);
    }
  }
  const obstacles = all.filter(n => !movable.has(n.name));
  return { o, all, byName, canvas, inner: innerOf(canvas), work, wlinks, blocks, obstacles, whole: !obstacles.length, before: new Map(all.map(n => [n.name, { x: n.x, y: n.y }])), notes: [] };
}

/** puts raw layout coordinates (centres in any frame, set on ctx.work) onto the canvas: centred on the canvas (whole diagram) or on the
 *  movable shapes' current box (a selection), compressed per axis when larger than the canvas, kept off the obstacles, overlaps removed */
function finish(ctx, kind, keep) {
  const { work, inner } = ctx, A = { w: inner.x2 - inner.x1, h: inner.y2 - inner.y1 };
  let crowded = false;
  if (work.length && !keep) {
    const before = bboxOf(work.map(n => Object.assign({}, n, ctx.before.get(n.name) || (n.members ? { x: n.x0, y: n.y0 } : {}))));
    const b = bboxOf(work);
    // compress an axis that is too long: scale the centres about the block's centre
    for (const [ax, len, cen, sz] of [['x', A.w, b.cx, 'w'], ['y', A.h, b.cy, 'h']]) {
      const ext = ax === 'x' ? b.w : b.h; if (ext <= len) continue;
      const big = Math.max(...work.map(n => n[sz])), span = ext - big;
      const f = span > 0 ? Math.max(0, (len - big) / span) : 1;
      for (const n of work) n[ax] = cen + (n[ax] - cen) * f;
      ctx.notes.push(`compressed ${ax === 'x' ? 'horizontally' : 'vertically'} to fit the canvas`);
    }
    const b2 = bboxOf(work);
    let tx = ctx.whole ? (inner.x1 + inner.x2) / 2 : before.cx, ty = ctx.whole ? (inner.y1 + inner.y2) / 2 : before.cy;
    tx = Math.min(inner.x2 - b2.w / 2, Math.max(inner.x1 + b2.w / 2, tx)); ty = Math.min(inner.y2 - b2.h / 2, Math.max(inner.y1 + b2.h / 2, ty));
    if (b2.w > A.w) tx = (inner.x1 + inner.x2) / 2; if (b2.h > A.h) ty = (inner.y1 + inner.y2) / 2;
    let dx = tx - b2.cx, dy = ty - b2.cy;
    // a selection: shift the whole block to the nearest place where it overlaps no obstacle (rings of 20 px)
    if (ctx.obstacles.length) {
      const hitsAt = (ox, oy) => work.some(n => ctx.obstacles.some(q => boxesOverlap({ x: n.x + ox, y: n.y + oy, w: n.w, h: n.h }, q, CLEAR)));
      const inside = (ox, oy) => b2.x1 + ox >= inner.x1 - 0.5 && b2.x2 + ox <= inner.x2 + 0.5 && b2.y1 + oy >= inner.y1 - 0.5 && b2.y2 + oy <= inner.y2 + 0.5;
      if (hitsAt(dx, dy)) {
        let found = null;
        for (let r = 1; r <= 30 && !found; r++) for (let k = 0; k < 8 * r && !found; k++) {
          const a = k / (8 * r) * 2 * Math.PI, ox = dx + Math.round(Math.cos(a) * r * 20), oy = dy + Math.round(Math.sin(a) * r * 20);
          if (inside(ox, oy) && !hitsAt(ox, oy)) found = [ox, oy];
        }
        if (found) { [dx, dy] = found; ctx.notes.push('moved the block to a free place'); }
      }
    }
    for (const n of work) { n.x += dx; n.y += dy; }
  }
  // overlap removal among everything (only movable ones move), inside the canvas
  const nodes = work.concat(ctx.obstacles), movable = nodes.map((_, i) => i < work.length);
  const left = separateNodes(nodes, movable, { bounds: inner });
  const out = bboxOf(work);
  if (left || (work.length && (out.x1 < inner.x1 - 0.5 || out.x2 > inner.x2 + 0.5 || out.y1 < inner.y1 - 0.5 || out.y2 > inner.y2 + 0.5))) crowded = true;
  if (crowded) ctx.notes.push('the shapes do not all fit on the canvas without touching');
  return result(ctx, kind, crowded);
}
/** the result: blocks expanded into their members, positions rounded */
function result(ctx, kind, crowded) {
  const positions = {}, moved = [];
  for (const n of ctx.work) {
    if (n.members) { const dx = n.x - n.x0, dy = n.y - n.y0; for (const m of n.members) positions[m.name] = { x: Math.round(m.x + dx), y: Math.round(m.y + dy) }; }
    else positions[n.name] = { x: Math.round(n.x), y: Math.round(n.y) };
  }
  for (const [name, p] of Object.entries(positions)) { const b = ctx.before.get(name); if (b.x !== p.x || b.y !== p.y) moved.push(name); }
  return { kind, positions, moved, notes: ctx.notes.slice(), crowded: !!crowded };
}

/* ---------------------------------------------------------------- the layouts ----------------------------------------------------------------
   Each sets raw centres on ctx.work (any frame); finish() puts them on the canvas. `order` is the reading order unless opts.order gives names. */
function orderOf(ctx) {
  const ro = readingOrder(ctx.work);
  if (ctx.o.order && ctx.o.order.length) { const pos = new Map(ctx.o.order.map((x, i) => [String(x), i])); return ro.slice().sort((a, b) => (pos.has(a.name) ? pos.get(a.name) : 1e9) - (pos.has(b.name) ? pos.get(b.name) : 1e9) || a.rank - b.rank); }
  return ro;
}
function lineLayout(list, vertical) {
  let c = 0;
  for (const n of list) { const s = vertical ? n.h : n.w; if (vertical) { n.x = 0; n.y = c + s / 2; } else { n.y = 0; n.x = c + s / 2; } c += s + GAP; }
}
/** a grid that fits the canvas: the number of columns whose block fits the inner area with the widest gaps (GAP at most, MIN_CELL_GAP at
 *  least), the block's shape closest to the canvas's; snake = true: every second row runs right to left, so that shapes next to each other
 *  in the order (linked shapes, circleOrder) stay neighbours at the end of a row */
const MIN_CELL_GAP = 14;
function gridShape(n, cw0, ch0, W, H) {
  let best = null;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    if (cols > 1 && Math.ceil(n / (cols - 1)) === rows) continue;   // the same rows with fewer columns: keep the narrower one
    const gx = cols > 1 ? Math.min(GAP, (W - cols * cw0) / (cols - 1)) : GAP, gy = rows > 1 ? Math.min(GAP, (H - rows * ch0) / (rows - 1)) : GAP;
    const fits = (cols * cw0 + (cols - 1) * MIN_CELL_GAP <= W + 0.5) && (rows * ch0 + (rows - 1) * MIN_CELL_GAP <= H + 0.5);
    const bw = cols * cw0 + (cols - 1) * Math.max(MIN_CELL_GAP, gx), bh = rows * ch0 + (rows - 1) * Math.max(MIN_CELL_GAP, gy);
    const f = Math.min(1, W / bw, H / bh), shape = Math.abs(Math.log((bw / bh) / (W / H)));
    const key = [fits ? 0 : 1, -f, shape + 0.15 * (rows * cols - n) / n];
    if (!best || key[0] < best.key[0] || (key[0] === best.key[0] && (key[1] < best.key[1] - 1e-9 || (Math.abs(key[1] - best.key[1]) <= 1e-9 && key[2] < best.key[2])))) best = { cols, rows, gx: Math.max(MIN_CELL_GAP, gx), gy: Math.max(MIN_CELL_GAP, gy), key };
  }
  return best;
}
function gridLayout(list, inner, snake) {
  const n = list.length, cw0 = Math.max(...list.map(x => x.w)), ch0 = Math.max(...list.map(x => x.h));
  const g = gridShape(n, cw0, ch0, inner.x2 - inner.x1, inner.y2 - inner.y1);
  list.forEach((x, i) => { const r = Math.floor(i / g.cols), c0 = i % g.cols, c = snake && r % 2 ? g.cols - 1 - c0 : c0; x.x = c * (cw0 + g.gx); x.y = r * (ch0 + g.gy); });
}
/** a circle; when the circle the shapes need is taller (or wider) than the canvas, an ellipse that fills the canvas instead (the shapes stay
 *  an equal angle apart; the ellipse is only used when its closest neighbours still clear each other) */
function circleLayout(list, inner) {
  const n = list.length; if (n === 1) { list[0].x = 0; list[0].y = 0; return; }
  const bw = Math.max(...list.map(x => x.w)), bh = Math.max(...list.map(x => x.h)), big = Math.max(bw, bh), r = Math.max(big + 20, (big + 28) * n / (2 * Math.PI));
  let rx = r, ry = r;
  if (inner) {
    const W = inner.x2 - inner.x1, H = inner.y2 - inner.y1, mx = (W - bw) / 2, my = (H - bh) / 2;
    if ((2 * r + bh > H || 2 * r + bw > W) && mx > 0 && my > 0) {
      const ex = Math.min(mx, r * 1.6), ey = Math.min(my, r);   // the largest ellipse inside the canvas, no wider than the circle needs
      const P = list.map((x, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return { x: Math.cos(a) * ex, y: Math.sin(a) * ey, w: x.w, h: x.h }; });
      if (!overlapPairs(P, 12).length) { rx = ex; ry = ey; }
    }
  }
  list.forEach((x, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; x.x = Math.cos(a) * rx; x.y = Math.sin(a) * ry; });
}
/** the circle order when there are links: a depth-first walk (neighbours in reading order) so linked shapes sit next to each other */
function circleOrder(list, G) {
  const seen = new Set(), out = [], idx = new Map(list.map((n, i) => [n, i]));
  const byRank = list.slice().sort((a, b) => a.rank - b.rank);
  for (const s of byRank) {
    if (seen.has(s)) continue;
    const stack = [s];
    while (stack.length) { const v = stack.pop(); if (seen.has(v)) continue; seen.add(v); out.push(v);
      const nb = G.und[idx.get(v)].map(i => list[i]).filter(w => !seen.has(w)).sort((a, b) => b.rank - a.rank); stack.push(...nb); }
  }
  return out;
}

/** orientation: a layout computed top-down (cross = x, depth = y) turned to the asked direction */
function orientNodes(list, dir) {
  for (const n of list) {
    const c = n._c, d = n._d;
    if (dir === 'up') { n.x = c; n.y = -d; } else if (dir === 'right') { n.x = d; n.y = c; } else if (dir === 'left') { n.x = -d; n.y = c; } else { n.x = c; n.y = d; }
  }
}
const crossSize = (n, dir) => dir === 'left' || dir === 'right' ? n.h : n.w;
const depthSize = (n, dir) => dir === 'left' || dir === 'right' ? n.w : n.h;
/** depth coordinates: each level as thick as its thickest shape, LEVEL_GAP between levels */
function levelCoords(list, levelOf, dir) {
  const L = Math.max(0, ...list.map(levelOf)) + 1, thick = new Array(L).fill(0);
  for (const n of list) thick[levelOf(n)] = Math.max(thick[levelOf(n)], depthSize(n, dir));
  const at = []; let c = 0; for (let l = 0; l < L; l++) { at.push(c + thick[l] / 2); c += thick[l] + LEVEL_GAP; }
  for (const n of list) n._d = at[levelOf(n)];
}

function treeLayout(ctx, dir) {
  const list = ctx.work, G = graphOf(list, ctx.wlinks), ro = readingOrder(list);
  if (!G.E.length) throw new LayoutError('no-links', 'There are no arrows or lines between these shapes, so there is no tree to follow. Say how to lay them out instead: a row, a column, a grid or a circle.', { ask: true });
  const C = componentsOf(G, ro.map(n => list.indexOf(n)));
  const rootName = ctx.o.root != null ? String(ctx.o.root) : null, rootIdx = rootName != null ? list.findIndex(n => n.name === rootName || (n.members && n.members.some(m => m.name === rootName))) : -1;
  if (rootName != null && rootIdx < 0) throw new LayoutError('unknown-root', `${rootName} is not among the shapes to arrange.`);
  const cyc = G.E.length !== G.n - C.comps.length ? findCycle(G, ro.map(n => list.indexOf(n))) : null;
  if (cyc) throw new LayoutError('not-a-tree', `The links are not a tree: ${cyc.concat(cyc[0]).map(i => list[i].name).join(' → ')} is a loop. I can lay them out in layers that follow the arrows instead ("arrange in layers").`, { ask: true, cycle: cyc.map(i => list[i].name) });
  if (rootIdx < 0 || G.E.length !== G.n - C.comps.length) {
    const mp = list.map((_, i) => i).filter(i => G.inn[i].length > 1);
    if (mp.length) { const i = mp.sort((a, b) => list[a].rank - list[b].rank)[0];
      throw new LayoutError('not-a-tree', `The links are not a tree: ${list[i].name} has ${G.inn[i].length} arrows coming in (from ${G.inn[i].map(j => list[j].name).join(', ')}). I can lay them out in layers instead ("arrange in layers").`, { ask: true, multiParent: list[i].name }); }
    if (G.E.length !== G.n - C.comps.length) throw new LayoutError('not-a-tree', 'The links are not a tree: they close a loop (counting plain lines). I can lay them out in layers instead ("arrange in layers").', { ask: true });
  }
  // roots: the asked root for its component; else the shape with no incoming arrow that reaches most shapes along arrows (then reading order)
  const reach = i => { const seen = new Set([i]), q = [i]; while (q.length) { const v = q.shift(); for (const w of G.out[v]) if (!seen.has(w)) { seen.add(w); q.push(w); } } return seen.size; };
  const kids = list.map(() => []), parent = new Array(list.length).fill(-1), roots = [];
  for (const comp of C.comps) {
    let r;
    if (rootIdx >= 0 && comp.includes(rootIdx)) r = rootIdx;
    else r = comp.filter(i => !G.inn[i].length).sort((a, b) => reach(b) - reach(a) || list[a].rank - list[b].rank)[0];
    if (r == null) r = comp.slice().sort((a, b) => list[a].rank - list[b].rank)[0];
    roots.push(r);
    const seen = new Set([r]), q = [r];
    while (q.length) { budget.tick('diagram.layout'); const v = q.shift(); for (const w of G.und[v]) if (!seen.has(w)) { seen.add(w); parent[w] = v; kids[v].push(w); q.push(w); } }
  }
  const crossCur = i => dir === 'left' || dir === 'right' ? list[i].y : list[i].x;
  kids.forEach(k => k.sort((a, b) => crossCur(a) - crossCur(b) || list[a].rank - list[b].rank));
  roots.sort((a, b) => (G.und[a].length ? 0 : 1) - (G.und[b].length ? 0 : 1) || crossCur(a) - crossCur(b) || list[a].rank - list[b].rank);
  // extent of each subtree along the cross axis, then placement: a parent centred over the block of its children
  const sib = 30, ext = new Array(list.length).fill(0);
  const post = []; for (const r of roots) { const st = [r]; while (st.length) { const v = st.pop(); post.push(v); st.push(...kids[v]); } }
  for (let k = post.length - 1; k >= 0; k--) { const v = post[k]; const span = kids[v].reduce((s, c) => s + ext[c], 0) + Math.max(0, kids[v].length - 1) * sib; ext[v] = Math.max(crossSize(list[v], dir), span); }
  const depth = new Array(list.length).fill(0);
  const place = (v, left) => {
    list[v]._c = left + ext[v] / 2;
    const span = kids[v].reduce((s, c) => s + ext[c], 0) + Math.max(0, kids[v].length - 1) * sib;
    let c = left + (ext[v] - span) / 2;
    for (const w of kids[v]) { depth[w] = depth[v] + 1; place(w, c); c += ext[w] + sib; }
  };
  let cur = 0; for (const r of roots) { place(r, cur); cur += ext[r] + sib * 2; }
  levelCoords(list, n => depth[list.indexOf(n)], dir);
  orientNodes(list, dir);
  return { roots: roots.filter(r => G.und[r].length).map(r => list[r].name) };
}

/* the layered (Sugiyama) layout: loops broken by reversing the arrows that point back in a depth-first walk, longest-path layers, dummy
   points on long links, barycenter ordering sweeps (the order with the fewest crossings kept), exact placement of each layer around the
   mean of its neighbours under the minimum gaps (isotonic regression, pool-adjacent-violators). Components side by side. */
function layersLayout(ctx, dir) {
  const list = ctx.work, G = graphOf(list, ctx.wlinks), ro = readingOrder(list), rank = i => list[i].rank;
  if (!G.E.length) throw new LayoutError('no-links', 'There are no arrows or lines between these shapes, so there are no layers to follow. Say how to lay them out instead: a row, a column, a grid or a circle.', { ask: true });
  // orient: arrows as drawn; plain lines from the earlier shape (reading order) to the later
  let D = G.E.map(e => e.directed ? [e.a, e.b] : (rank(e.a) <= rank(e.b) ? [e.a, e.b] : [e.b, e.a]));
  const outs = list.map(() => []); D.forEach(([a, b], k) => outs[a].push([b, k]));
  outs.forEach(o => o.sort((p, q) => rank(p[0]) - rank(q[0])));
  // the asked start shape (opts.root): the walk starts there and arrows into it are turned around, so it sits in the first layer
  const rootName = ctx.o.root != null ? String(ctx.o.root) : null, rootIdx = rootName != null ? list.findIndex(n => n.name === rootName) : -1;
  if (rootName != null && rootIdx < 0) throw new LayoutError('unknown-root', `${rootName} is not among the shapes to arrange.`);
  const state = new Array(list.length).fill(0), reversed = [];
  if (rootIdx >= 0) D.forEach(([a, b], k) => { if (b === rootIdx) { D[k] = [b, a]; reversed.push(-1); } });
  if (rootIdx >= 0) { outs.forEach(o => { o.length = 0; }); D.forEach(([a, b], k) => outs[a].push([b, k])); outs.forEach(o => o.sort((p, q) => rank(p[0]) - rank(q[0]))); }
  for (const s of (rootIdx >= 0 ? [rootIdx] : []).concat(ro.map(n => list.indexOf(n)))) {
    if (state[s]) continue; const st = [[s, 0]]; state[s] = 1;
    while (st.length) { const top = st[st.length - 1], [v, i] = top;
      if (i < outs[v].length) { top[1]++; const [w, k] = outs[v][i]; if (state[w] === 1) reversed.push(k); else if (!state[w]) { state[w] = 1; st.push([w, 0]); } }
      else { state[v] = 2; st.pop(); } }
  }
  for (const k of reversed) if (k >= 0) D[k] = [D[k][1], D[k][0]];
  const back = reversed.length;
  if (back) ctx.notes.push(`${back === 1 ? 'one arrow points' : back + ' arrows point'} back to an earlier layer (${reversed.some(k => k < 0) ? 'into the start shape, or ' : ''}a loop)`);
  const C = componentsOf(G, ro.map(n => list.indexOf(n)));
  let offset = 0;
  for (const comp of C.comps) {
    const inC = new Set(comp), edges = D.filter(([a]) => inC.has(a));
    // layers: longest path from the sources (Kahn's order, ties by reading order)
    const indeg = new Map(comp.map(i => [i, 0])), outE = new Map(comp.map(i => [i, []]));
    for (const [a, b] of edges) { indeg.set(b, indeg.get(b) + 1); outE.get(a).push(b); }
    const layer = new Map(comp.map(i => [i, 0])), ready = comp.filter(i => !indeg.get(i)).sort((a, b) => rank(a) - rank(b));
    while (ready.length) { budget.tick('diagram.layout'); const v = ready.shift(); for (const w of outE.get(v)) { layer.set(w, Math.max(layer.get(w), layer.get(v) + 1)); indeg.set(w, indeg.get(w) - 1); if (!indeg.get(w)) { ready.push(w); ready.sort((a, b) => rank(a) - rank(b)); } } }
    // dummy points on links longer than one layer
    const V = comp.map(i => ({ id: i, layer: layer.get(i), real: true, size: crossSize(list[i], dir) })), vid = new Map(comp.map((i, k) => [i, k])), segs = [];
    for (const [a, b] of edges) {
      let prev = vid.get(a);
      for (let l = layer.get(a) + 1; l < layer.get(b); l++) { V.push({ id: -1, layer: l, real: false, size: 8 }); segs.push([prev, V.length - 1]); prev = V.length - 1; }
      segs.push([prev, vid.get(b)]);
    }
    const L = Math.max(...V.map(v => v.layer)) + 1, up = V.map(() => []), down = V.map(() => []);
    for (const [a, b] of segs) { down[a].push(b); up[b].push(a); }
    let layers = Array.from({ length: L }, () => []);
    V.forEach((v, k) => layers[v.layer].push(k));
    const key0 = k => V[k].real ? list[V[k].id].rank : 1e6 + k;
    layers[0].sort((a, b) => key0(a) - key0(b));
    const pos = new Array(V.length).fill(0), setPos = () => layers.forEach(ly => ly.forEach((k, i) => { pos[k] = i; }));
    setPos();
    for (let l = 1; l < L; l++) { layers[l].sort((a, b) => (up[a].length ? mean(up[a].map(x => pos[x])) : pos[a]) - (up[b].length ? mean(up[b].map(x => pos[x])) : pos[b]) || key0(a) - key0(b)); layers[l].forEach((k, i) => { pos[k] = i; }); }
    const crossings = () => { let c = 0; for (let l = 0; l + 1 < L; l++) { const es = []; for (const a of layers[l]) for (const b of down[a]) es.push([pos[a], pos[b]]); for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) if ((es[i][0] - es[j][0]) * (es[i][1] - es[j][1]) < 0) c++; } return c; };
    let best = layers.map(x => x.slice()), bestC = crossings();
    for (let sweep = 0; sweep < 8 && bestC > 0; sweep++) {
      const downward = sweep % 2 === 0;
      for (let s = 1; s < L; s++) { const l = downward ? s : L - 1 - s, nb = downward ? up : down;
        layers[l].sort((a, b) => (nb[a].length ? mean(nb[a].map(x => pos[x])) : pos[a]) - (nb[b].length ? mean(nb[b].map(x => pos[x])) : pos[b]) || pos[a] - pos[b]);
        layers[l].forEach((k, i) => { pos[k] = i; }); }
      const c = crossings(); if (c < bestC) { bestC = c; best = layers.map(x => x.slice()); }
    }
    layers = best; setPos();
    // coordinates along the cross axis: packed, then placed around the mean of the neighbours (exact, with the minimum gaps)
    const X = new Array(V.length).fill(0);
    for (const ly of layers) { let c = 0; for (const k of ly) { X[k] = c + V[k].size / 2; c += V[k].size + (V[k].real ? 30 : 10); } }
    const placeLayer = (ly, nb) => {
      if (!ly.length) return;
      const sep = ly.slice(1).map((k, i) => (V[ly[i]].size + V[k].size) / 2 + (V[ly[i]].real && V[k].real ? 30 : 10));
      const off = [0]; for (const s of sep) off.push(off[off.length - 1] + s);
      const t = ly.map((k, i) => (nb[k].length ? mean(nb[k].map(x => X[x])) : X[k]) - off[i]);
      const blocks = []; for (const v of t) { blocks.push({ s: v, c: 1 }); while (blocks.length > 1 && blocks[blocks.length - 2].s / blocks[blocks.length - 2].c > blocks[blocks.length - 1].s / blocks[blocks.length - 1].c) { const b = blocks.pop(); blocks[blocks.length - 1].s += b.s; blocks[blocks.length - 1].c += b.c; } }
      let i = 0; for (const b of blocks) for (let k = 0; k < b.c; k++, i++) X[ly[i]] = b.s / b.c + off[i];
    };
    for (let it = 0; it < 6; it++) { const dn = it % 2 === 0; for (let s = 1; s < L; s++) { const l = dn ? s : L - 1 - s; placeLayer(layers[l], dn ? up : down); } }
    const minX = Math.min(...V.map((v, k) => X[k] - v.size / 2)), maxX = Math.max(...V.map((v, k) => X[k] + v.size / 2));
    V.forEach((v, k) => { if (v.real) { list[v.id]._c = X[k] - minX + offset; list[v.id]._l = v.layer; } });
    offset += maxX - minX + 60;
  }
  levelCoords(list, n => n._l, dir);
  orientNodes(list, dir);
  return { reversed: reversed.length };
}

function radialLayout(ctx) {
  const list = ctx.work, G = graphOf(list, ctx.wlinks), ro = readingOrder(list);
  if (!G.E.length) throw new LayoutError('no-links', 'There are no arrows or lines between these shapes, so there is no centre to build rings around. Say how to lay them out instead: a row, a column, a grid or a circle.', { ask: true });
  const rootName = ctx.o.root != null ? String(ctx.o.root) : null, rootIdx = rootName != null ? list.findIndex(n => n.name === rootName) : -1;
  if (rootName != null && rootIdx < 0) throw new LayoutError('unknown-root', `${rootName} is not among the shapes to arrange.`);
  const C = componentsOf(G, ro.map(n => list.indexOf(n))), big = Math.max(...list.map(n => Math.max(n.w, n.h)));
  let offset = 0; const centres = [];
  for (const comp of C.comps) {
    // centre: the asked root; else the shape with no incoming arrow that has most links; else the most linked (then reading order)
    let r = rootIdx >= 0 && comp.includes(rootIdx) ? rootIdx : null;
    if (r == null) { const src = comp.filter(i => !G.inn[i].length && G.out[i].length); r = (src.length ? src : comp).slice().sort((a, b) => G.und[b].length - G.und[a].length || list[a].rank - list[b].rank)[0]; }
    centres.push(list[r].name);
    const kids = new Map(comp.map(i => [i, []])), depth = new Map([[r, 0]]), q = [r];
    while (q.length) { budget.tick('diagram.layout'); const v = q.shift(); const nb = G.und[v].filter(w => !depth.has(w)).sort((a, b) => list[a].rank - list[b].rank); for (const w of nb) { depth.set(w, depth.get(v) + 1); kids.get(v).push(w); q.push(w); } }
    const leaves = new Map(); const cnt = v => { if (leaves.has(v)) return leaves.get(v); const k = kids.get(v); const c = k.length ? k.reduce((s, w) => s + cnt(w), 0) : 1; leaves.set(v, c); return c; };
    cnt(r);
    const D = Math.max(...depth.values()), perRing = new Array(D + 1).fill(0); for (const d of depth.values()) perRing[d]++;
    const R = [0]; for (let d = 1; d <= D; d++) R.push(Math.max(R[d - 1] + big + 40, perRing[d] * (big + 16) / (2 * Math.PI), leaves.get(r) * (big + 16) / (2 * Math.PI) * d / D));
    const ang = new Map();
    const place = (v, a0, a1) => { ang.set(v, (a0 + a1) / 2); let a = a0; for (const w of kids.get(v)) { const span = (a1 - a0) * leaves.get(w) / leaves.get(v); place(w, a, a + span); a += span; } };
    place(r, -Math.PI / 2, 3 * Math.PI / 2);
    const rmax = R[D];
    for (const i of comp) { const d = depth.get(i), a = ang.get(i); list[i].x = offset + rmax + (d ? Math.cos(a) * R[d] : 0); list[i].y = d ? Math.sin(a) * R[d] : 0; }
    offset += 2 * rmax + big + 60;
  }
  return { centres };
}

/** deterministic force-directed (Fruchterman-Reingold) seeded with the current positions */
function organicLayout(ctx) {
  const list = ctx.work, G = graphOf(list, ctx.wlinks), n = list.length;
  if (n === 1) { list[0].x = 0; list[0].y = 0; return {}; }
  const big = Math.max(...list.map(x => Math.max(x.w, x.h))), k = big + 60;
  const b = bboxOf(list);
  if (b.w < 1 && b.h < 1) { const ro = readingOrder(list); ro.forEach((x, i) => { const a = i * 2.39996; x.x = Math.cos(a) * k * Math.sqrt(i + 1); x.y = Math.sin(a) * k * Math.sqrt(i + 1); }); }
  const iters = n > 120 ? 60 : n > 60 ? 90 : 140;
  let temp = k * 2;
  const cx0 = mean(list.map(x => x.x)), cy0 = mean(list.map(x => x.y));
  for (let it = 0; it < iters; it++) {
    budget.tick('diagram.layout', 1 + n * n);
    const fx = new Array(n).fill(0), fy = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let dx = list[i].x - list[j].x, dy = list[i].y - list[j].y, d = Math.hypot(dx, dy);
      if (d < 0.01) { const a = (i * 7 + j * 13) * 0.61803; dx = Math.cos(a); dy = Math.sin(a); d = 1; }
      const f = k * k / d; fx[i] += dx / d * f; fy[i] += dy / d * f; fx[j] -= dx / d * f; fy[j] -= dy / d * f;
    }
    for (const e of G.E) { const p = list[e.a], q = list[e.b], dx = p.x - q.x, dy = p.y - q.y, d = Math.max(0.01, Math.hypot(dx, dy)), f = d * d / k;
      fx[e.a] -= dx / d * f; fy[e.a] -= dy / d * f; fx[e.b] += dx / d * f; fy[e.b] += dy / d * f; }
    for (let i = 0; i < n; i++) { fx[i] += (cx0 - list[i].x) * 0.02 * k / 10; fy[i] += (cy0 - list[i].y) * 0.02 * k / 10;   // weak gravity keeps parts together
      const d = Math.hypot(fx[i], fy[i]); if (d > 0) { const s = Math.min(d, temp) / d; list[i].x += fx[i] * s; list[i].y += fy[i] * s; } }
    temp = Math.max(2, temp * 0.95);
  }
  return {};
}

/** auto: the layout the link structure asks for: a tree when the links form one, layers when they form loop-free arrows, a circle
 *  for a small diagram with loops, organic for a larger one, a grid when there are no links */
function autoKind(ctx) {
  const list = ctx.work, G = graphOf(list, ctx.wlinks);
  if (!G.E.length) return 'grid';
  if (list.length >= 3 && 2 * list.filter((_, i) => !G.und[i].length).length > list.length) return 'grid';   // most shapes unlinked: a tree of them says nothing
  const ro = readingOrder(list), C = componentsOf(G, ro.map(n => list.indexOf(n)));
  const forest = G.E.length === G.n - C.comps.length, multi = list.some((_, i) => G.inn[i].length > 1);
  if (forest && !multi) return 'tree';
  if (!findCycle(G, ro.map(n => list.indexOf(n)))) return 'layers';
  return list.length <= 10 ? 'circle' : 'organic';
}
/** the direction the arrows mostly point now (down by default; right when more arrows point right than down) */
function currentDirection(list, links) {
  const G = graphOf(list, links), c = { down: 0, up: 0, left: 0, right: 0 };
  for (const e of G.E) { const dx = list[e.b].x - list[e.a].x, dy = list[e.b].y - list[e.a].y; if (!dx && !dy) continue; c[Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 'down' : 'up') : (dx > 0 ? 'right' : 'left')]++; }
  return c.right > c.down && c.right >= c.left && c.right >= c.up ? 'right' : 'down';
}

/** layout(kind, shapes, links, opts): re-lays out the movable shapes. kind: row | column | grid | circle | tree | layers | radial | organic | auto.
 *  opts: direction (down | up | left | right; tree, layers, auto), root (a shape name: tree root / radial centre), order ([names]: the
 *  order for row, column, grid, circle), canvas, targets, groups. Throws LayoutError: empty, unknown-layout, no-links, not-a-tree,
 *  unknown-root, unknown-shape. */
function layout(kind, shapes, links, opts) {
  const o = Object.assign({}, opts || {});
  if (!LAYOUTS.includes(kind)) throw new LayoutError('unknown-layout', `I don't know the layout "${kind}". Layouts: ${LAYOUTS.join(', ')}.`);
  const ctx = context(shapes, links, o, true);
  if (!ctx.work.length) throw new LayoutError('empty', 'There is nothing to arrange: the canvas is empty.');
  let k = kind, extra = {};
  if (k === 'auto') {
    k = autoKind(ctx);
    const G = graphOf(ctx.work, ctx.wlinks), iso = ctx.work.filter((_, i) => !G.und[i].length).length;
    ctx.notes.push(k === 'grid' && G.E.length ? `grid layout (${iso} of the ${ctx.work.length} shapes have no links, so there is no tree or flow to follow)` : `${k} layout (it fits the links)`);
    if (k === 'grid' && G.E.length) ctx.why = `${iso} of the ${ctx.work.length} shapes have no links, so a tree of them would say nothing; linked shapes stay side by side.`;
  }
  if (ctx.work.length === 1 && !['tree', 'layers', 'radial'].includes(k)) { ctx.work[0].x = 0; ctx.work[0].y = 0; return Object.assign(finish(ctx, k), { layout: k }); }
  // a tree / layers without an asked direction: the direction (down, or left to right) whose drawing fits the canvas better; ties: the
  // direction the arrows point now
  let dir = o.direction || 'down';
  if ((k === 'tree' || k === 'layers') && !o.direction) {
    const cur = kind === 'auto' ? currentDirection(ctx.work, ctx.wlinks) : 'down', other = cur === 'right' ? 'down' : 'right';
    const f1 = fitOf(ctx, () => rawLayout(ctx, k, cur, o)), f2 = fitOf(ctx, () => rawLayout(ctx, k, other, o));
    dir = f2 > f1 + 0.02 ? other : cur;
  }
  extra = rawLayout(ctx, k, dir, o);
  let r = Object.assign(finish(ctx, k), { layout: k, direction: ['tree', 'layers'].includes(k) ? dir : undefined, why: ctx.why }, extra);
  // it does not fit without shapes touching: a grid that fits the canvas, in the order of the links (linked shapes side by side), and say so
  if (r.crowded && k !== 'grid' && !o.noFallback) {
    const c2 = context(shapes, links, o, true), G = graphOf(c2.work, c2.wlinks);
    if (c2.work.length > 1) {
      gridLayout(G.E.length && !(o.order && o.order.length) ? (readingOrder(c2.work), circleOrder(c2.work, G)) : orderOf(c2), c2.inner, true);
      const r2 = finish(c2, 'grid');
      if (!r2.crowded) { r2.notes.unshift(`as a ${k} they do not fit on the canvas without touching, so I made a grid in the order of the links instead`); r = Object.assign(r2, { layout: 'grid', fellBack: k, why: `As a ${k} they do not fit on the canvas without touching, so I made a grid that keeps linked shapes side by side.` }); }
    }
  }
  return r;
}
/** the raw coordinates of layout k (in any frame) on ctx.work; the shapes without any link are left out of a tree / layers / radial /
 *  organic layout and packed as a compact grid beside the linked part (to the right or below, whichever fits the canvas better) */
function rawLayout(ctx, k, dir, o) {
  budget.tick('diagram.layout', 1 + ctx.work.length);
  const G = graphOf(ctx.work, ctx.wlinks), lone = LINKED_KINDS.includes(k) ? ctx.work.filter((_, i) => !G.und[i].length) : [];
  if (lone.length && lone.length < ctx.work.length) {
    const all = ctx.work; ctx.work = all.filter(n => !lone.includes(n));
    let extra; try { extra = rawLayout(ctx, k, dir, o); } finally { ctx.work = all; }
    packBeside(ctx.work.filter(n => !lone.includes(n)), readingOrder(lone), ctx.inner);
    ctx.why = `${listing0(lone.map(n => n.name))} ${lone.length === 1 ? 'has' : 'have'} no links, so ${lone.length === 1 ? 'it stands' : 'they stand'} beside the ${k === 'tree' ? 'tree' : 'others'}.`;
    ctx.notes.push(`${lone.length === 1 ? 'one shape has' : lone.length + ' shapes have'} no links: ${lone.length === 1 ? 'it is' : 'they are'} set beside the ${k === 'tree' ? 'tree' : 'linked shapes'}`);
    return extra;
  }
  switch (k) {
    case 'row': lineLayout(orderOf(ctx), false); return {};
    case 'column': lineLayout(orderOf(ctx), true); return {};
    case 'grid': { const lk = G.E.length && !(o.order && o.order.length); gridLayout(lk ? (readingOrder(ctx.work), circleOrder(ctx.work, G)) : orderOf(ctx), ctx.inner, lk); return {}; }
    case 'circle': circleLayout(o.order && o.order.length || !G.E.length ? orderOf(ctx) : (readingOrder(ctx.work), circleOrder(ctx.work, G)), ctx.inner); return {};
    case 'tree': return treeLayout(ctx, dir);
    case 'layers': return layersLayout(ctx, dir);
    case 'radial': return radialLayout(ctx);
    case 'organic': return organicLayout(ctx);
  }
  return {};
}
/** how well the raw layout fits the canvas: 1 = it fits, less = the factor its centres must be pulled together by (finish compresses) */
function fitOf(ctx, fn) {
  const save = ctx.work.map(n => [n.x, n.y]), notes = ctx.notes.length;
  try { fn(); } catch (e) { ctx.work.forEach((n, i) => { [n.x, n.y] = save[i]; }); ctx.notes.length = notes; if (e && e.name === 'LayoutError') return -1; throw e; }
  const b = bboxOf(ctx.work), A = { w: ctx.inner.x2 - ctx.inner.x1, h: ctx.inner.y2 - ctx.inner.y1 };
  const f = ax => { const ext = ax === 'x' ? b.w : b.h, len = ax === 'x' ? A.w : A.h, big = Math.max(...ctx.work.map(n => ax === 'x' ? n.w : n.h)); return ext <= len ? 1 : Math.max(0, (len - big) / Math.max(1, ext - big)); };
  const v = Math.min(f('x'), f('y'));
  ctx.work.forEach((n, i) => { [n.x, n.y] = save[i]; }); ctx.notes.length = notes;
  return v;
}
/** the shapes `lone` as a compact grid block beside the block of `main` (raw coordinates): to its right or below it, whichever leaves the
 *  whole closer to the canvas's proportions */
function packBeside(main, lone, inner) {
  const B = bboxOf(main), cw = Math.max(...lone.map(n => n.w)), ch = Math.max(...lone.map(n => n.h)), W = inner.x2 - inner.x1, H = inner.y2 - inner.y1, n = lone.length;
  const opt = side => {
    let cols, rows;
    if (side === 'right') { rows = Math.max(1, Math.min(n, Math.floor((Math.max(B.h, ch) + GAP) / (ch + GAP)))); cols = Math.ceil(n / rows); }
    else { cols = Math.max(1, Math.min(n, Math.floor((Math.max(B.w, cw) + GAP) / (cw + GAP)))); rows = Math.ceil(n / cols); }
    const x0 = side === 'right' ? B.x2 + GAP * 1.5 + cw / 2 : B.x1 + cw / 2, y0 = side === 'right' ? B.y1 + ch / 2 : B.y2 + GAP * 1.5 + ch / 2;
    const pos = lone.map((_, i) => ({ x: x0 + (i % cols) * (cw + GAP), y: y0 + Math.floor(i / cols) * (ch + GAP) }));
    const all = bboxOf(main.concat(pos.map((p, i) => ({ x: p.x, y: p.y, w: lone[i].w, h: lone[i].h }))));
    return { pos, f: Math.min(1, W / all.w, H / all.h) };
  };
  const r = opt('right'), d = opt('below'), best = d.f > r.f + 0.01 ? d : r;
  lone.forEach((x, i) => { x.x = best.pos[i].x; x.y = best.pos[i].y; });
}

/* ---------------------------------------------------------------- operations on the current positions ---------------------------------------------------------------- */
/** align(shapes, {direction | axis, base}): direction left | right | up | down: the left (right, top, bottom) edges flush with the
 *  outermost one; axis horizontal | vertical: the centres on one line through the base shape (the first target). Then shapes that now
 *  overlap are pushed apart along the line. */
function align(shapes, links, opts) {
  const o = opts || {}, ctx = context(shapes, links, o, false), list = ctx.work;
  if (list.length < 2) throw new LayoutError('too-few', 'Align needs at least two shapes.');
  const dir = o.direction, axis = o.axis || (dir === 'left' || dir === 'right' ? 'vertical' : dir ? 'horizontal' : 'horizontal');
  if (dir === 'left') { const v = Math.min(...list.map(n => n.x - n.w / 2)); list.forEach(n => { n.x = v + n.w / 2; }); }
  else if (dir === 'right') { const v = Math.max(...list.map(n => n.x + n.w / 2)); list.forEach(n => { n.x = v - n.w / 2; }); }
  else if (dir === 'up') { const v = Math.min(...list.map(n => n.y - n.h / 2)); list.forEach(n => { n.y = v + n.h / 2; }); }
  else if (dir === 'down') { const v = Math.max(...list.map(n => n.y + n.h / 2)); list.forEach(n => { n.y = v - n.h / 2; }); }
  else { const base = o.base != null ? list.find(n => n.name === String(o.base)) || list[0] : list[0]; if (axis === 'vertical') list.forEach(n => { n.x = base.x; }); else list.forEach(n => { n.y = base.y; }); }
  const nodes = list.concat(ctx.obstacles), movable = nodes.map((_, i) => i < list.length), lock = axis === 'vertical' ? 'y' : 'x';
  if (o.clear != null) separateNodes(list.slice(), list.map(() => true), { lock, bounds: ctx.inner, clear: o.clear });   // opts.clear: the gap between the aligned shapes (not the obstacles)
  /* an edge alignment (left / right / tops / bottoms) only moves along its own axis: obstacles are not pushed out of the way sideways
     (2026-11-03, scenes_r3 engine finding 5: aligning the bottoms of two bars moved one of them 200 px to the right) */
  const left = dir ? 0 : separateNodes(nodes, movable, { lock, bounds: ctx.inner });
  return result(ctx, 'align', left > 0);
}

/** distribute(shapes, links, {axis}): equal gaps between neighbours along the axis (horizontal by default), in their current order along
 *  it (ties: the other axis, then the name); the other coordinate is kept. The span is the movable shapes' current extent along the axis;
 *  when they do not fit in it with at least MIN_GAP between neighbours, the span widens about its centre (kept inside the canvas), so no two
 *  of them overlap. When they cannot fit inside the canvas even then, it throws 'no-room' and nothing moves. Obstacles in the way: the
 *  overlap is removed as in align (the result says crowded when that is impossible). Fewer than 3 shapes: 'too-few'. */
const MIN_GAP = 16;
function distribute(shapes, links, opts) {
  const o = opts || {}, ctx = context(shapes, links, o, false), list = ctx.work;
  if (list.length < 3) throw new LayoutError('too-few', 'Spacing evenly needs at least three shapes.');
  const vert = o.axis === 'vertical', k = vert ? 'y' : 'x', s = vert ? 'h' : 'w', ok = vert ? 'x' : 'y';
  const sorted = list.slice().sort((p, q) => p[k] - q[k] || p[ok] - q[ok] || cmpStr(p.name, q.name));
  const sum = sorted.reduce((t, n) => t + n[s], 0), lo0 = Math.min(...sorted.map(n => n[k] - n[s] / 2)), hi0 = Math.max(...sorted.map(n => n[k] + n[s] / 2));
  const room = vert ? ctx.inner.y2 - ctx.inner.y1 : ctx.inner.x2 - ctx.inner.x1, need = sum + (sorted.length - 1) * MIN_GAP;
  if (need > room + 0.5) throw new LayoutError('no-room', `They do not fit ${vert ? 'one above the other' : 'side by side'} without touching: they need ${Math.round(need)} px and there are ${Math.round(room)} px. Make them smaller, or space fewer shapes.`);
  let lo = lo0, span = hi0 - lo0;
  if (span < need) {
    const lim = vert ? [ctx.inner.y1, ctx.inner.y2] : [ctx.inner.x1, ctx.inner.x2];
    lo = Math.min(lim[1] - need, Math.max(lim[0], (lo0 + hi0) / 2 - need / 2)); span = need;
    ctx.notes.push(`widened the span to ${Math.round(need)} px so that none of them touch`);
  }
  const gap = (span - sum) / (sorted.length - 1);
  let c = lo; for (const n of sorted) { n[k] = c + n[s] / 2; c += n[s] + gap; }
  const nodes = list.concat(ctx.obstacles), movable = nodes.map((_, i) => i < list.length);
  const left = ctx.obstacles.length ? separateNodes(nodes, movable, { bounds: ctx.inner }) : 0;
  const r = result(ctx, 'distribute', left > 0);
  return Object.assign(r, { order: sorted.map(n => n.name), gap: Math.round(gap) });
}

/** spacing(shapes, links, {scale | distance}): more or less space between the shapes, keeping the layout: positions scaled about the centre
 *  of the movable shapes (scale > 1 more space, < 1 less); distance = the wanted typical gap in px (the median nearest-neighbour gap
 *  becomes about that). Overlaps removed; kept inside the canvas (compressed if needed, then the result says it is crowded). */
function spacing(shapes, links, opts) {
  const o = opts || {}, ctx = context(shapes, links, o, true), list = ctx.work;
  if (list.length < 2) throw new LayoutError('too-few', 'Spacing needs at least two shapes.');
  let f = o.scale != null ? +o.scale : null;
  if (f == null && o.distance != null) {
    const gaps = list.map(p => Math.min(...list.filter(q => q !== p).map(q => Math.max(0, Math.max(Math.abs(p.x - q.x) - (p.w + q.w) / 2, Math.abs(p.y - q.y) - (p.h + q.h) / 2)))));
    const g = median(gaps), s = mean(list.map(n => (n.w + n.h) / 2));
    f = (+o.distance + s) / (g + s);
  }
  if (f == null) f = 1.5;
  if (!(f > 0)) throw new LayoutError('bad-value', 'The spacing factor must be a positive number.');
  const b = bboxOf(list);
  for (const n of list) { n.x = b.cx + (n.x - b.cx) * f; n.y = b.cy + (n.y - b.cy) * f; }
  // keep the centre where it was, but inside the canvas; compress if it no longer fits
  const r = finishKeep(ctx, 'spacing');
  r.scale = r1(f * 100) / 100;
  return r;
}
/** like finish(), but the block stays where it is (only pushed inside the canvas, compressed if too large) */
function finishKeep(ctx, kind) {
  const { work, inner } = ctx, b = bboxOf(work), A = { w: inner.x2 - inner.x1, h: inner.y2 - inner.y1 };
  for (const [ax, len, cen, sz] of [['x', A.w, b.cx, 'w'], ['y', A.h, b.cy, 'h']]) {
    const ext = ax === 'x' ? b.w : b.h; if (ext <= len) continue;
    const big = Math.max(...work.map(n => n[sz])), span = ext - big, f = span > 0 ? Math.max(0, (len - big) / span) : 1;
    for (const n of work) n[ax] = cen + (n[ax] - cen) * f;
    ctx.notes.push('the canvas limits how far apart they can go');
  }
  const b2 = bboxOf(work);
  const dx = b2.w > A.w ? (inner.x1 + inner.x2) / 2 - b2.cx : Math.max(inner.x1 - b2.x1, Math.min(0, inner.x2 - b2.x2));
  const dy = b2.h > A.h ? (inner.y1 + inner.y2) / 2 - b2.cy : Math.max(inner.y1 - b2.y1, Math.min(0, inner.y2 - b2.y2));
  for (const n of work) { n.x += dx; n.y += dy; }
  return finish(ctx, kind, true);
}

/** snap(shapes, {grid = 20}): every centre to the nearest grid point; a shape that would then overlap another takes the nearest free grid point */
function snap(shapes, links, opts) {
  const o = opts || {}, g = Math.max(2, +(o.grid || o.distance || 20)), ctx = context(shapes, links, o, false), { inner } = ctx;
  const placed = ctx.obstacles.slice();
  for (const n of readingOrder(ctx.work)) {
    const sx = Math.round(n.x / g) * g, sy = Math.round(n.y / g) * g;
    let best = null;
    for (let r = 0; r <= 12 && !best; r++) for (let dx = -r; dx <= r && !best; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const c = { x: sx + dx * g, y: sy + dy * g, w: n.w, h: n.h };
      if (c.x - n.w / 2 < inner.x1 - g || c.x + n.w / 2 > inner.x2 + g || c.y - n.h / 2 < inner.y1 - g || c.y + n.h / 2 > inner.y2 + g) continue;
      if (!placed.some(q => boxesOverlap(c, q, 0))) { best = c; break; }
    }
    if (best) { n.x = best.x; n.y = best.y; } else { n.x = sx; n.y = sy; }
    placed.push(n);
  }
  const left = overlapPairs(ctx.work.concat(ctx.obstacles), 0).length;
  const r = result(ctx, 'snap', left > 0); r.grid = g; return r;
}

/** flip(shapes, {axis = horizontal}): mirror the positions: horizontal = left and right swap (x mirrored about the middle of the movable
 *  shapes), vertical = top and bottom swap. The shapes themselves are not mirrored (they are symmetric, except triangles and stars). */
function flip(shapes, links, opts) {
  const o = opts || {}, ctx = context(shapes, links, o, false), list = ctx.work;
  if (!list.length) throw new LayoutError('empty', 'There is nothing to flip.');
  const b = bboxOf(list), vert = o.axis === 'vertical';
  for (const n of list) { if (vert) n.y = 2 * b.cy - n.y; else n.x = 2 * b.cx - n.x; }
  const nodes = list.concat(ctx.obstacles), left = separateNodes(nodes, nodes.map((_, i) => i < list.length), { bounds: ctx.inner });
  return result(ctx, 'flip', left > 0);
}

/** fit(shapes, {center}): everything inside the canvas: moved in as little as possible (center = true: the drawing centred), compressed
 *  when it is larger than the canvas */
function fit(shapes, links, opts) {
  const o = opts || {}, ctx = context(shapes, links, o, true);
  if (!ctx.work.length) throw new LayoutError('empty', 'There is nothing to fit: the canvas is empty.');
  if (o.center) { const b = bboxOf(ctx.work), I = ctx.inner, dx = (I.x1 + I.x2) / 2 - b.cx, dy = (I.y1 + I.y2) / 2 - b.cy; for (const n of ctx.work) { n.x += dx; n.y += dy; } }
  return finishKeep(ctx, 'fit');
}

/** the value of a property of a shape, for sort / cluster / equalize */
function propOf(n, p) {
  const s = n.src || {};
  if (p === 'name') return n.name;
  if (p === 'size') return s.size != null ? +s.size : n.w * n.h;
  if (p === 'kind') return s.shape;
  return s[p] != null ? s[p] : null;
}
function propCmp(p) {
  if (p === 'color' || p === 'outline') return (a, b) => (PALETTE.indexOf(a) + 1 || 99) - (PALETTE.indexOf(b) + 1 || 99) || cmpStr(String(a), String(b));
  if (p === 'shape' || p === 'kind') return (a, b) => (SHAPE_ORDER.indexOf(a) + 1 || 99) - (SHAPE_ORDER.indexOf(b) + 1 || 99) || cmpStr(String(a), String(b));
  if (p === 'size') return (a, b) => a - b;
  return (a, b) => natCmp(a == null ? '' : a, b == null ? '' : b);
}
/** sort(shapes, links, {property, descending, layout}): the shapes take the current places in reading order, sorted by name, color
 *  (palette order), size, shape or label; with `layout` they are laid out in that layout in the sorted order instead */
function sort(shapes, links, opts) {
  const o = opts || {}, p = o.property || 'name';
  const ns = nodesOf(shapes), tset = o.targets && o.targets.length ? new Set(o.targets.map(String)) : null;
  const mine = ns.filter(n => !tset || tset.has(n.name)), cmp = propCmp(p);
  const sorted = mine.slice().sort((a, b) => cmp(propOf(a, p), propOf(b, p)) || natCmp(a.name, b.name));
  if (o.descending) sorted.reverse();
  if (o.layout) return Object.assign(layout(o.layout, shapes, links, Object.assign({}, o, { order: sorted.map(n => n.name) })), { kind: 'sort', order: sorted.map(n => n.name) });
  const ctx = context(shapes, links, o, false), list = ctx.work;
  if (list.length < 2) throw new LayoutError('too-few', 'Sorting needs at least two shapes.');
  const slots = readingOrder(list).map(n => ({ x: n.x, y: n.y }));
  const byName = new Map(list.map(n => [n.name, n]));
  sorted.forEach((s, i) => { const n = byName.get(s.name); n.x = slots[i].x; n.y = slots[i].y; });
  const nodes = list.concat(ctx.obstacles), left = separateNodes(nodes, nodes.map((_, i) => i < list.length), { bounds: ctx.inner });
  return Object.assign(result(ctx, 'sort', left > 0), { order: sorted.map(n => n.name) });
}

/** cluster(shapes, links, {property}): shapes with the same colour (shape, size, ...) gathered into one compact block each; blocks in
 *  the order their first shape is read, side by side (wrapping to a new row of blocks when the canvas is full) */
function cluster(shapes, links, opts) {
  const o = opts || {}, p = o.property || 'color', ctx = context(shapes, links, o, true), list = ctx.work;
  if (list.length < 2) throw new LayoutError('too-few', 'Clustering needs at least two shapes.');
  const buckets = new Map();
  for (const n of readingOrder(list)) { const v = n.members ? '\u0000' + n.name : String(propOf(n, p)); if (!buckets.has(v)) buckets.set(v, []); buckets.get(v).push(n); }
  const W = ctx.inner.x2 - ctx.inner.x1;
  let x = 0, y = 0, rowH = 0;
  for (const [, b] of buckets) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(b.length))), cw = Math.max(...b.map(n => n.w)) + 20, ch = Math.max(...b.map(n => n.h)) + 20;
    const bw = cols * cw, bh = Math.ceil(b.length / cols) * ch;
    if (x > 0 && x + bw > W) { x = 0; y += rowH + GAP; rowH = 0; }
    b.forEach((n, i) => { n.x = x + (i % cols) * cw + cw / 2; n.y = y + Math.floor(i / cols) * ch + ch / 2; });
    x += bw + GAP * 1.5; rowH = Math.max(rowH, bh);
  }
  const r = finish(ctx, 'cluster'); r.clusters = [...buckets.keys()].filter(k => k[0] !== '\u0000'); return r;
}

/** equalize(shapes, {property = size, like}): the value every movable shape should get: the value of shape `like`, or the most common
 *  value (ties: the value of the first shape in reading order). -> {kind, property, value, props: {name: {property: value}} (only the
 *  shapes that change)}. Positions are not changed here: the engine applies the props, then calls separate() for any new overlap. */
function equalize(shapes, links, opts) {
  const o = opts || {}, p = o.property || 'size', ns = nodesOf(shapes), tset = o.targets && o.targets.length ? new Set(o.targets.map(String)) : null;
  const mine = readingOrder(ns.filter(n => !tset || tset.has(n.name)));
  if (mine.length < 2 && o.like == null) throw new LayoutError('too-few', 'Making shapes the same needs at least two shapes.');
  let value;
  if (o.like != null) { const l = ns.find(n => n.name === String(o.like)); if (!l) throw new LayoutError('unknown-shape', `There is no shape named "${o.like}".`); value = propOf(l, p); }
  else { const c = new Map(); for (const n of mine) { const v = propOf(n, p); c.set(v, (c.get(v) || 0) + 1); } let best = null; for (const n of mine) { const v = propOf(n, p); if (best === null || c.get(v) > c.get(best)) best = v; } value = best; }
  const props = {}; for (const n of mine) if (propOf(n, p) !== value) props[n.name] = { [p]: value };
  return { kind: 'equalize', property: p, value, props, positions: {}, moved: [], notes: [], crowded: false };
}

/** straighten(shapes, links, {tolerance}): a link whose ends are nearly in line (within max(12, tolerance x its length), at most 60 px)
 *  becomes exactly horizontal or vertical: the end that is read later moves (unless already straightened this run). Overlaps removed. */
function straighten(shapes, links, opts) {
  const o = opts || {}, ctx = context(shapes, links, o, false), list = ctx.work, tol = o.tolerance != null ? +o.tolerance : 0.25;
  const G = graphOf(list, ctx.wlinks); readingOrder(list);
  const pinned = new Set(); let count = 0;
  const es = G.E.slice().sort((e, f) => Math.min(list[e.a].rank, list[e.b].rank) - Math.min(list[f.a].rank, list[f.b].rank) || Math.max(list[e.a].rank, list[e.b].rank) - Math.max(list[f.a].rank, list[f.b].rank));
  for (const e of es) {
    let p = list[e.a], q = list[e.b]; if (q.rank < p.rank) [p, q] = [q, p];
    if (pinned.has(q.name) && !pinned.has(p.name)) [p, q] = [q, p];
    if (pinned.has(q.name)) continue;
    const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy), lim = Math.min(60, Math.max(12, tol * len));
    if (Math.abs(dx) <= lim && Math.abs(dx) > 0.5 && Math.abs(dy) > Math.abs(dx)) { q.x = p.x; pinned.add(q.name); count++; }
    else if (Math.abs(dy) <= lim && Math.abs(dy) > 0.5 && Math.abs(dx) > Math.abs(dy)) { q.y = p.y; pinned.add(q.name); count++; }
  }
  const nodes = list.concat(ctx.obstacles), left = separateNodes(nodes, nodes.map((_, i) => i < list.length), { bounds: ctx.inner });
  const r = result(ctx, 'straighten', left > 0); r.straightened = count;
  if (!count) r.notes.push('no link was nearly straight; nothing to straighten');
  return r;
}

/** untangle(shapes, links): fewer crossings without changing the look: shapes swap places with one of their 8 nearest shapes when that
 *  lowers crossings x10 + links through shapes x5 + overlaps x50 + total link length / mean length; passes until no swap helps (max 4) */
function untangle(shapes, links, opts) {
  const o = opts || {}, ctx = context(shapes, links, o, true), list = ctx.work, G = graphOf(list, ctx.wlinks);
  const ro = readingOrder(list);
  if (G.E.length < 2) { const r = result(ctx, 'untangle', false); r.notes.push('fewer than two links: nothing can cross'); r.swaps = 0; return r; }
  const inc = list.map(() => []); G.E.forEach((e, k) => { inc[e.a].push(k); inc[e.b].push(k); });
  const meanLen = mean(G.E.map(e => Math.hypot(list[e.a].x - list[e.b].x, list[e.a].y - list[e.b].y))) || 1;
  const m = G.E.length, N = list.length, EA = G.E.map(e => e.a), EB = G.E.map(e => e.b);
  const cost = (ks, nodesIdx) => {   // the part of the objective that a swap of the shapes nodesIdx (with incident links ks) can change
    let c = 0; const inK = new Uint8Array(m); for (const k of ks) inK[k] = 1;
    for (const k of ks) {
      const a = EA[k], b = EB[k], p = list[a], q = list[b];
      const x1 = Math.min(p.x, q.x), x2 = Math.max(p.x, q.x), y1 = Math.min(p.y, q.y), y2 = Math.max(p.y, q.y);
      c += Math.hypot(p.x - q.x, p.y - q.y) / meanLen;
      for (let j = 0; j < m; j++) {
        if (j === k || (inK[j] && j < k)) continue;
        const fa = EA[j], fb = EB[j]; if (a === fa || a === fb || b === fa || b === fb) continue;
        const r = list[fa], s = list[fb];
        if (Math.max(r.x, s.x) < x1 || Math.min(r.x, s.x) > x2 || Math.max(r.y, s.y) < y1 || Math.min(r.y, s.y) > y2) continue;
        if (segCross(p, q, r, s)) c += 10;
      }
      for (let t = 0; t < N; t++) {
        if (t === a || t === b) continue; const o = list[t];
        if (o.x + o.w / 2 < x1 || o.x - o.w / 2 > x2 || o.y + o.h / 2 < y1 || o.y - o.h / 2 > y2) continue;
        if (segThroughBox(p, q, o)) c += 5;
      }
    }
    for (const i of nodesIdx) {
      const o = list[i];
      for (let t = 0; t < N; t++) if (t !== i && boxesOverlap(o, list[t], 2)) c += 50;
      for (let k = 0; k < m; k++) {
        if (inK[k] || EA[k] === i || EB[k] === i) continue; const p = list[EA[k]], q = list[EB[k]];
        if (Math.max(p.x, q.x) < o.x - o.w / 2 || Math.min(p.x, q.x) > o.x + o.w / 2 || Math.max(p.y, q.y) < o.y - o.h / 2 || Math.min(p.y, q.y) > o.y + o.h / 2) continue;
        if (segThroughBox(p, q, o)) c += 5;
      }
    }
    return c;
  };
  const K = N > 100 ? 5 : 8, passes = N > 100 ? 2 : 4;
  const near = list.map((p, i) => list.map((q, j) => [j, Math.hypot(p.x - q.x, p.y - q.y)]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1] || list[a[0]].rank - list[b[0]].rank).slice(0, K).map(x => x[0]));
  const indexOf = new Map(list.map((x, i) => [x, i]));
  let swaps = 0;
  for (let pass = 0; pass < passes; pass++) {
    budget.tick('diagram.layout', 1 + list.length * K);
    let improved = false;
    for (const pn of ro) {
      const a = indexOf.get(pn);
      for (const b of near[a]) {
        const ks = [...new Set(inc[a].concat(inc[b]))]; if (!ks.length) continue;
        const before = cost(ks, [a, b]);
        const A = list[a], B = list[b]; [A.x, B.x] = [B.x, A.x]; [A.y, B.y] = [B.y, A.y];
        const after = cost(ks, [a, b]);
        if (after < before - 1e-6) { swaps++; improved = true; } else { [A.x, B.x] = [B.x, A.x]; [A.y, B.y] = [B.y, A.y]; }
      }
    }
    if (!improved) break;
  }
  const nodes = list.concat(ctx.obstacles), left = separateNodes(nodes, nodes.map((_, i) => i < list.length), { bounds: ctx.inner });
  const r = result(ctx, 'untangle', left > 0); r.swaps = swaps;
  if (!swaps) r.notes.push('no swap of places reduced the crossings');
  return r;
}

/** separate(shapes, links, opts): only removes overlaps (and brings shapes inside the canvas), moving shapes as little as possible */
function separate(shapes, links, opts) {
  const ctx = context(shapes, links, opts, false), nodes = ctx.work.concat(ctx.obstacles);
  const left = separateNodes(nodes, nodes.map((_, i) => i < ctx.work.length), { bounds: ctx.inner });
  return result(ctx, 'separate', left > 0);
}

/* ---------------------------------------------------------------- improve ----------------------------------------------------------------
   improve(shapes, links, opts): tries candidates from the least to the most disruptive, scores each on the WHOLE diagram (obstacles
   included), and applies the best one only when it beats the current score by at least opts.minGain (default 1 point). A candidate
   within 1 point of the best that is less disruptive (earlier in the list) is preferred. Never returns a worse layout: when nothing beats
   the current score, nothing moves and the message says so.
   Candidates: separate (overlaps and out-of-canvas only), straighten, untangle, then the layout the link structure asks for (tree in the
   current main direction, layers, circle / organic for loops, grid without links), organic for any linked diagram of 4+ shapes. */
function improve(shapes, links, opts) {
  const o = Object.assign({}, opts || {}), minGain = o.minGain != null ? +o.minGain : 1, canvas = canvasOf(o);
  const all = nodesOf(shapes);
  if (!all.length) throw new LayoutError('empty', 'There is nothing to improve: the canvas is empty.');
  const G0 = graphOf(all, links), before = scoreNodes(all, G0, canvas);
  const at = (res) => all.map(n => Object.assign({}, n, res.positions[n.name] || {}));
  const evalRes = (name, fn) => { try { const res = fn(); const s = scoreNodes(at(res), G0, canvas); return { name, res, score: s.score, detail: s }; } catch (e) { if (e && e.name === 'LayoutError') return null; throw e; } };
  const cands = [];
  const push = c => { if (c) cands.push(c); };
  push(evalRes('separate', () => separate(shapes, links, o)));
  const sepShapes = cands.length ? shapes.map(s => Object.assign({}, s, cands[0].res.positions[String(s.name)] || {})) : shapes;
  push(evalRes('straighten', () => straighten(sepShapes, links, o)));
  push(evalRes('untangle', () => untangle(sepShapes, links, o)));
  const ctx = context(shapes, links, o, true), kind = autoKind(ctx), dir = o.direction || currentDirection(ctx.work, ctx.wlinks);
  if (kind === 'tree' || kind === 'layers') push(evalRes(kind, () => layout(kind, shapes, links, Object.assign({}, o, { direction: dir }))));   // a tree is offered only as a tree (its children keep their order)
  else if (kind === 'circle' || kind === 'organic') push(evalRes(kind, () => layout(kind, shapes, links, o)));
  else push(evalRes('grid', () => layout('grid', shapes, links, o)));
  if (G0.E.length && all.length >= 4 && kind !== 'organic') push(evalRes('organic', () => layout('organic', shapes, links, o)));
  if (kind !== 'grid' && ctx.work.length >= 3) push(evalRes('grid', () => layout('grid', shapes, links, o)));   // a grid in the order of the links: fits any canvas
  let best = null; for (const c of cands) if (!best || c.score > best.score) best = c;
  if (best) { const lessDisruptive = cands.find(c => c.score >= best.score - 1 && c.score > before.score + minGain); if (lessDisruptive) best = lessDisruptive; }
  const candidates = cands.map(c => ({ name: c.name, score: c.score }));
  if (!best || best.score < before.score + minGain) {
    const positions = {}; for (const n of all) if (!o.targets || !o.targets.length || o.targets.map(String).includes(n.name)) positions[n.name] = { x: Math.round(n.x), y: Math.round(n.y) };
    return { kind: 'improve', changed: false, positions, moved: [], notes: [], crowded: false, before, after: before, chosen: null, candidates,
      message: `The layout already scores ${before.score}/100 and nothing I tried scores higher, so I left it as it is.` };
  }
  const what = { separate: 'removed overlaps', straighten: 'straightened links', untangle: 'swapped shapes to reduce crossings', tree: 'laid it out as a tree', layers: 'laid it out in layers along the arrows', circle: 'arranged it in a circle', organic: 'spread it out by its links', grid: 'arranged it in a grid' }[best.name];
  const m0 = before.metrics, m1 = best.detail.metrics, gains = [];
  if (m1.overlaps < m0.overlaps) gains.push(`overlaps ${m0.overlaps} → ${m1.overlaps}`);
  if (m1.crossings < m0.crossings) gains.push(`crossings ${m0.crossings} → ${m1.crossings}`);
  if (m1.outside < m0.outside) gains.push(`off-canvas ${m0.outside} → ${m1.outside}`);
  if (m1.through < m0.through) gains.push(`links through shapes ${m0.through} → ${m1.through}`);
  return Object.assign({}, best.res, { kind: 'improve', changed: best.res.moved.length > 0, before, after: best.detail, chosen: best.name, candidates,
    message: `I ${what}: the score went from ${before.score} to ${best.score}/100${gains.length ? ' (' + gains.join(', ') + ')' : ''}.` });
}

/* ---------------------------------------------------------------- routing the links around shapes ----------------------------------------------------------------
   routeEdges(shapes, links, opts): what to draw for each link. A link whose straight line between the two centres passes through no other
   box is drawn straight (no points). Otherwise the shortest of a few simple paths that pass no box (kept PAD px away): one bend (an L along
   the two axes), two bends (a Z or a U whose middle leg runs along a free line next to a box in the way, or midway), or a detour round a
   corner of the box in the way. Cost = length + BEND_COST per bend. When none is free, the one through fewest boxes. The points are the
   bends only (the ends are the two shapes; the renderer clips the first and last legs at the shapes' outlines); every bend lies outside
   both end boxes. Labelled links also get a label place: beside the longest leg, the first spot (middle, then further along, either
   side) that no box and no earlier label covers.
   shapes: [{name, x, y, w, h}] (centres; the boxes to avoid: shapes with their name tags, free texts); opts.obstacles: [{x1, y1, x2, y2}]
   more boxes to avoid (name tags drawn apart from the shape); links: [{id?, from, to, label?}].
   -> {routes: {id (or 'from>to'): {points: [{x, y}], label: {x, y} | null}}, blocked: number of links that still pass through a box}
   Cheap: only the links that are blocked are routed, and only the boxes near the link are candidates. */
const PAD = 8, BEND_COST = 24;
function routeEdges(shapes, links, opts) {
  const o = opts || {}, ns = nodesOf(shapes), byName = new Map(ns.map(n => [n.name, n]));
  const boxes = ns.map(n => ({ x1: n.x - n.w / 2, y1: n.y - n.h / 2, x2: n.x + n.w / 2, y2: n.y + n.h / 2, name: n.name })).concat((o.obstacles || []).map(b => Object.assign({}, b, { name: b.name || null, of: b.of || null })));
  const segHits = (p, q, skip) => { let c = 0; const x1 = Math.min(p.x, q.x), x2 = Math.max(p.x, q.x), y1 = Math.min(p.y, q.y), y2 = Math.max(p.y, q.y);
    for (const b of boxes) { if (skip(b)) continue; if (b.x2 + PAD < x1 || b.x1 - PAD > x2 || b.y2 + PAD < y1 || b.y1 - PAD > y2) continue;
      if (segThroughBox(p, q, { x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2, w: b.x2 - b.x1 + 2 * PAD + 4, h: b.y2 - b.y1 + 2 * PAD + 4 })) c++; }
    return c; };
  const inBox = (pt, n, pad) => Math.abs(pt.x - n.x) < n.w / 2 + pad && Math.abs(pt.y - n.y) < n.h / 2 + pad;
  const routes = {}, labels = []; let blocked = 0;
  for (const l of links || []) {
    const a = byName.get(String(l.from)), z = byName.get(String(l.to)), id = l.id != null ? String(l.id) : `${l.from}>${l.to}`;
    if (!a || !z || a === z) continue;
    // the first leg may cross its own start's box (and name tag), the last its end's; a middle leg neither end's
    const isOf = (b, x) => b.name === x.name || b.of === x.name;
    const legsHit = pts => { let c = 0; for (let i = 0; i + 1 < pts.length; i++) { const first = i === 0, last = i + 2 === pts.length; c += segHits(pts[i], pts[i + 1], b => (first && isOf(b, a)) || (last && isOf(b, z))); } return c; };
    const straight = [{ x: a.x, y: a.y }, { x: z.x, y: z.y }];
    let best = { pts: straight, hits: segHits(straight[0], straight[1], b => isOf(b, a) || isOf(b, z)), cost: Math.hypot(z.x - a.x, z.y - a.y) };
    if (best.hits) {
      const near = boxes.filter(b => b.x2 + 150 >= Math.min(a.x, z.x) && b.x1 - 150 <= Math.max(a.x, z.x) && b.y2 + 150 >= Math.min(a.y, z.y) && b.y1 - 150 <= Math.max(a.y, z.y));
      const xs = new Set([(a.x + z.x) / 2]), ys = new Set([(a.y + z.y) / 2]);
      for (const b of near.concat([{ x1: a.x - a.w / 2, x2: a.x + a.w / 2, y1: a.y - a.h / 2, y2: a.y + a.h / 2 }, { x1: z.x - z.w / 2, x2: z.x + z.w / 2, y1: z.y - z.h / 2, y2: z.y + z.h / 2 }])) {
        xs.add(b.x1 - PAD - 6); xs.add(b.x2 + PAD + 6); ys.add(b.y1 - PAD - 6); ys.add(b.y2 + PAD + 6); }
      const cands = [[{ x: a.x, y: z.y }], [{ x: z.x, y: a.y }]];
      for (const x of xs) cands.push([{ x, y: a.y }, { x, y: z.y }]);
      for (const y of ys) cands.push([{ x: a.x, y }, { x: z.x, y }]);
      for (const b of near) for (const cx of [b.x1 - PAD - 6, b.x2 + PAD + 6]) for (const cy of [b.y1 - PAD - 6, b.y2 + PAD + 6]) cands.push([{ x: cx, y: cy }]);
      for (const mid of cands) {
        if (mid.some(p => inBox(p, a, 6) || inBox(p, z, 6))) continue;
        const pts = [straight[0]].concat(mid, [straight[1]]);
        let len = 0; for (let i = 0; i + 1 < pts.length; i++) len += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
        const hits = legsHit(pts), cost = len + BEND_COST * mid.length;
        if (hits < best.hits || (hits === best.hits && cost < best.cost - 1e-6)) best = { pts, hits, cost };
      }
      if (best.hits) blocked++;
    }
    const points = best.pts.slice(1, -1).map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));
    let label = null;
    if (l.label) {
      const lw = String(l.label).length * 6.8 + 4, P = best.pts; let k = 0, kl = -1;
      for (let i = 0; i + 1 < P.length; i++) { const d = Math.hypot(P[i + 1].x - P[i].x, P[i + 1].y - P[i].y); if (d > kl) { kl = d; k = i; } }
      const p = P[k], q = P[k + 1], L = kl || 1, ux = (q.x - p.x) / L, uy = (q.y - p.y) / L;
      const free = (cx, cy) => { const b = { x1: cx - lw / 2, x2: cx + lw / 2, y1: cy - 8, y2: cy + 8 }; return !boxes.concat(labels).some(o2 => Math.min(o2.x2, b.x2) - Math.max(o2.x1, b.x1) > 0.5 && Math.min(o2.y2, b.y2) - Math.max(o2.y1, b.y1) > 0.5); };
      const spots = []; for (const f of [0.5, 0.38, 0.62, 0.26, 0.74]) for (const side of [1, -1]) { const off = side * (12 + Math.abs(uy) * lw / 2); spots.push([p.x + (q.x - p.x) * f - uy * off, p.y + (q.y - p.y) * f + ux * off]); }
      const [lx, ly] = spots.find(([cx, cy]) => free(cx, cy)) || spots[0];
      label = { x: Math.round(lx), y: Math.round(ly) }; labels.push({ x1: lx - lw / 2, x2: lx + lw / 2, y1: ly - 8, y2: ly + 8 });
    }
    routes[id] = { points, label };
  }
  return { routes, blocked };
}

/** apply(shapes, result): the shapes with the result's positions (a convenience for tests and callers) */
function apply(shapes, res) { return shapes.map(s => Object.assign({}, s, (res && res.positions && res.positions[String(s.name)]) || {})); }

const AutoLayout = { LayoutError, LAYOUTS, WEIGHTS, analyse, score, layout, improve, routeEdges, align, distribute, spacing, snap, flip, fit, sort, cluster, equalize, straighten, untangle, separate, apply, readingOrderNames: shapes => readingOrder(nodesOf(shapes)).map(n => n.name) };
if (typeof module !== 'undefined' && module.exports) module.exports = AutoLayout; else root.AutoLayout = AutoLayout;
})(typeof window !== 'undefined' ? window : this);

export default module.exports;
