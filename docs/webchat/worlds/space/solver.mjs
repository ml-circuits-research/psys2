// SPDX-License-Identifier: AGPL-3.0-only
// SPACE-2, layer 3: ONE small stable solver for every tab (worker-tasks 17:40). Browser-safe; deterministic (no wall clock, no random: scatter uses a hash of the id);
// every loop is bounded and ticks the turn budget.
//
//   solve({ pieces, facts, frame, layout, ids, pinned, edges, prev, maxSteps, usual }) -> { ok, boxes, unmet, say, steps, displacement }
//
// Steps: (1) the named layout, if any (generator or slots from `k.layouts`); (2) the relation constraints, weakest tier first so the strongest wins;
// (3) overlap removal by the smallest move (what carries something moves it too); (4) the check. If the check fails (a relation cannot be kept, an overlap cannot be removed, the
// step budget ran out) the answer keeps the LAST VALID state (the input positions) and says which relation could not be kept.
import { overlaps, gap, boxOf, planLayout, readingOrder } from './space.mjs?v=0c5c89b98e';
import { RELS, tierRank, holdsFact, carriedBy, why } from './pieces.mjs?v=7a5af05c50';

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
const round = (v) => Math.round(v);

/** The usual place of a kind when the host gives no `usual(kind)` (the k.scenes lookup replaces it): sky, ground or water. */
const SKY = ['sun', 'moon', 'cloud', 'bird', 'star', 'rainbow', 'kite', 'balloon', 'plane'];
const WATER = ['fish', 'duck', 'boat', 'whale', 'dolphin', 'swan', 'ship'];
export const usualPlace = (kind) => { const k = String(kind ?? '').toLowerCase().replace(/s$/, ''); return SKY.includes(k) ? 'sky' : WATER.includes(k) ? 'water' : 'ground'; };

const clampBox = (p, f) => ({ x: Math.min(f.w - p.w / 2, Math.max(p.w / 2, p.x)), y: Math.min(f.h - p.h / 2, Math.max(p.h / 2, p.y)) });
const boxesTouch = (a, b) => { const p = boxOf(a), q = boxOf(b); return p.l < q.r - 1 && q.l < p.r - 1 && p.t < q.b - 1 && q.t < p.b - 1; };
const hashOf = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };

// ---- layouts (generators); the facts of a layout are data, the arithmetic of a few are code ---------------------------------------------------------------
function landscape(items, f, o = {}) {
  const horizon = f.h * 0.55, out = {}, groups = { sky: [], ground: [], water: [] };
  for (const it of items) groups[(o.usual ?? usualPlace)(it.kind)]?.push(it);
  const spread = (list, y) => readingOrder(list).forEach((it, i) => { budget.tick('space.landscape'); const x = ((i + 0.5) / list.length) * f.w; out[it.id] = { x: x, y: y(it) }; });
  spread(groups.sky, (it) => Math.max(it.h / 2 + 8, f.h * 0.18));
  spread(groups.ground, (it) => horizon + f.h * 0.12 - it.h / 2 + it.h / 2);
  spread(groups.water, (it) => Math.min(f.h - it.h / 2 - 8, horizon + f.h * 0.3));
  return out;
}
/** Layers by longest path from the roots (a cycle puts a node one layer after its first visit; the queue is capped). edges: [[from, to], ...]. */
function layers(items, edges) {
  const ids = items.map((i) => i.id), depth = Object.fromEntries(ids.map((i) => [i, 0])), indeg = Object.fromEntries(ids.map((i) => [i, 0]));
  for (const [a, b] of edges) if (a in depth && b in depth) indeg[b]++;
  const queue = ids.filter((i) => !indeg[i]);
  if (!queue.length && ids.length) queue.push(ids[0]);
  const seen = new Set();
  for (let q = 0; q < queue.length && q < ids.length * 4; q++) {
    const a = queue[q]; budget.tick('space.layers');
    seen.add(a);
    for (const [x, y] of edges) if (x === a && y in depth && depth[y] < ids.length && !(seen.has(y) && depth[y] > depth[a])) { depth[y] = Math.max(depth[y], depth[a] + 1); if (!queue.includes(y) || depth[y] < ids.length) { if (queue.length < ids.length * 4) queue.push(y); } }
  }
  return depth;
}
function layered(items, f, edges, dir) {
  const depth = layers(items, edges ?? []), by = {};
  for (const it of items) (by[depth[it.id]] ??= []).push(it);
  const ks = Object.keys(by).map(Number).sort((a, b) => a - b), out = {}, n = ks.length;
  ks.forEach((k, ci) => {
    const col = readingOrder(by[k]);
    col.forEach((it, i) => { budget.tick('space.layered'); const major = ((ci + 0.5) / n) * (dir === 'lr' ? f.w : f.h), minor = ((i + 0.5) / col.length) * (dir === 'lr' ? f.h : f.w); out[it.id] = dir === 'lr' ? { x: major, y: minor } : { x: minor, y: major }; });
  });
  if (dir === 'td') {   // a parent sits over the middle of its children
    for (const k of ks.slice().reverse()) for (const it of by[k]) { const kids = (edges ?? []).filter(([a, b]) => a === it.id && out[b] && depth[b] === k + 1).map(([, b]) => out[b].x); if (kids.length) out[it.id].x = (Math.min(...kids) + Math.max(...kids)) / 2; }
  }
  return out;
}
function scatter(items, f) {
  const out = {}, pad = Math.max(12, f.w * 0.03);
  for (const it of readingOrder(items)) { budget.tick('space.scatter'); out[it.id] = { x: pad + it.w / 2 + hashOf(it.id + 'x') * Math.max(0, f.w - 2 * pad - it.w), y: pad + it.h / 2 + hashOf(it.id + 'y') * Math.max(0, f.h - 2 * pad - it.h) }; }
  return out;
}
/** Items in the slot order of a data layout: fractions of the frame, filled in the order `sort` gives (reading, height = tallest first, size, none = given). */
function bySlots(items, f, l) {
  const ord = l.sort === 'height' ? items.slice().sort((a, b) => b.h - a.h || (a.id < b.id ? -1 : 1)) : l.sort === 'size' ? items.slice().sort((a, b) => b.w * b.h - a.w * a.h || (a.id < b.id ? -1 : 1)) : l.sort === 'none' ? items : readingOrder(items);
  const out = {};
  ord.forEach((it, i) => { budget.tick('space.slots'); const s = l.slots[i % l.slots.length]; out[it.id] = { x: s[0] * f.w, y: s[1] * f.h }; });
  return out;
}
/** Target centres of a layout for the items. `layout`: a parsed k.layouts entry ({ generator, slots, sort }) or a generator name. */
export function arrange(layout, items, frame, o = {}) {
  const l = typeof layout === 'string' ? { generator: layout, slots: [], sort: 'reading' } : layout;
  if (!items.length) return {};
  if (!l.generator && l.slots?.length) return bySlots(items, frame, l);
  const g = l.generator;
  if (g === 'landscape') return landscape(items, frame, o);
  if (g === 'flow') return layered(items, frame, o.edges, 'lr');
  if (g === 'tree') return layered(items, frame, o.edges, 'td');
  if (g === 'scatter') return scatter(items, frame);
  if (g === 'corners') o = { ...o, avoid: o.avoid ?? [] };
  const op = { ring: 'circle', corners: 'corners', row: 'row', column: 'column', grid: 'grid', stack: 'stack', height: 'height', face: 'face' }[g];
  if (!op) return {};
  const r = planLayout(op, items, frame, o);
  return r.boxes ?? {};
}

// ---- constraints --------------------------------------------------------------------------------------------------------------------------------------
/** Moves `A` (a copy) the smallest way so that the fact holds; returns the changed fields or null when it already holds or cannot be done. */
function enforceFact(f, A, B, frame, pad) {
  const a = boxOf(A), b = B ? boxOf(B) : null, d = {};
  switch (f.rel) {
    case 'inside_frame': Object.assign(d, clampBox(A, frame)); break;
    case 'on': d.y = b.t - A.h / 2; d.x = A.x < b.l ? b.l + Math.min(A.w, B.w) / 2 : A.x > b.r ? b.r - Math.min(A.w, B.w) / 2 : A.x; break;
    case 'in': { const w = Math.max(0, B.w - A.w), h = Math.max(0, B.h - A.h); d.x = B.x + Math.max(-w / 2, Math.min(w / 2, A.x - B.x)); d.y = B.y + Math.max(-h / 2, Math.min(h / 2, A.y - B.y)); break; }
    case 'left_of': if (a.r > b.l - pad) d.x = b.l - pad - A.w / 2; break;
    case 'right_of': if (a.l < b.r + pad) d.x = b.r + pad + A.w / 2; break;
    case 'above': if (a.b > b.t - pad) d.y = b.t - pad - A.h / 2; break;
    case 'next_to': {
      if (gap(A, B) <= pad * 3 && !overlaps(A, B, 1)) break;
      const dir = A.x >= B.x ? 1 : -1;
      d.x = dir > 0 ? b.r + pad + A.w / 2 : b.l - pad - A.w / 2;
      if (d.x - A.w / 2 < 0 || d.x + A.w / 2 > frame.w) d.x = dir > 0 ? b.l - pad - A.w / 2 : b.r + pad + A.w / 2;
      break;
    }
    case 'attached_to': {
      if (gap(A, B) <= 1.5 && !overlaps(A, B, 1)) break;
      const dx = Math.max(0, a.l - b.r) || -Math.max(0, b.l - a.r), dy = Math.max(0, a.t - b.b) || -Math.max(0, b.t - a.b);
      if (Math.abs(dx) >= Math.abs(dy) && dx) d.x = A.x - dx; else if (dy) d.y = A.y - dy;
      else { const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l), oy = Math.min(a.b, b.b) - Math.max(a.t, b.t); if (ox < oy) d.x = A.x + (A.x >= B.x ? ox : -ox); else d.y = A.y + (A.y >= B.y ? oy : -oy); }
      break;
    }
    case 'aligned_with': if (f.axis === 'x') d.x = B.x; else d.y = B.y; break;
    case 'same_size_as': { const k = Math.sqrt((B.w * B.h) / (A.w * A.h)); if (Math.abs(k - 1) > 0.02) { d.w = round(A.w * k); d.h = round(A.h * k); } break; }
    case 'apart_from': {
      const need = Math.min(24, 0.04 * frame.w);
      if (gap(A, B) < need || overlaps(A, B, 0)) { let dx = A.x - B.x, dy = A.y - B.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L; if (!dx && !dy) dx = 1; const step = Math.max(4, need / 4); let k = 0, T = { ...A }; while (k++ < 40 && (gap(T, B) < need || overlaps(T, B, 0))) { T = { ...T, x: T.x + dx * step, y: T.y + dy * step }; budget.tick('space.apart'); } d.x = T.x; d.y = T.y; }
      break;
    }
    case 'in_front_of': if (A.z <= B.z) d.z = B.z + 1; break;
    case 'behind': if (A.z >= B.z) d.z = B.z - 1; break;
    default: break;
  }
  return Object.keys(d).length ? d : null;
}
const exempt = (a, b, facts, P) => a.parent === b.id || b.parent === a.id || a.region || b.region || a.container || b.container
  || facts.some((f) => ((f.a === a.id && f.b === b.id) || (f.a === b.id && f.b === a.id)) && ['on', 'in', 'attached_to', 'behind', 'in_front_of'].includes(f.rel)) || void P;

/**
 * The solver. pieces: [{ id, kind, x, y, w, h, z, parent?, container?, region? }], facts: the store's facts, frame: { w, h }.
 * layout (optional): a name/parsed layout; ids: the pieces the layout arranges (default all unpinned); pinned: ids that must not move (the user just placed them);
 * edges: [[from, to]] for flow / tree; maxSteps: budget of this call (default 6000 geometric steps).
 * Returns { ok, boxes: { id: { x, y [, w, h] } } (only what changed), unmet: [fact], say, steps, displacement } — on failure ok:false and no boxes (the last valid state stays).
 */
export function solve({ pieces, facts = [], frame, layout = null, ids = null, pinned = [], edges = null, mentioned = null, maxSteps = 6000, usual = null, only = null, names = null }) {
  let steps = 0;
  const tick = (site) => { steps++; budget.tick(site); return steps <= maxSteps; };
  const cur = Object.fromEntries(pieces.map((p) => [p.id, { ...p }])), start = Object.fromEntries(pieces.map((p) => [p.id, { x: p.x, y: p.y, w: p.w, h: p.h, z: p.z }]));
  const pins = new Set(pinned), pad = Math.max(2, Math.round(frame.w * 0.006)), live = (id) => !pins.has(id);
  const list = () => Object.values(cur);
  const fail = (reason, unmet = []) => ({ ok: false, boxes: {}, unmet, say: reason, steps, displacement: 0 });
  // 1. layout
  if (layout) {
    const movers = list().filter((p) => (ids ? ids.includes(p.id) : live(p.id)));
    const l = typeof layout === 'string' ? { generator: layout, slots: [], sort: 'reading' } : layout;
    const t = arrange(l, movers, frame, { edges, usual: usual ?? undefined, only, avoid: list().filter((p) => !movers.includes(p) && !p.region) });
    for (const [id, pos] of Object.entries(t)) { if (!tick('space.solve.layout')) return fail('I ran out of steps arranging them, so I left everything as it was.'); Object.assign(cur[id], clampBox({ ...cur[id], ...pos }, frame)); }
    if (l.rels?.length && ids) { /* slot relations of a layout are facts the host may add; the geometry above already satisfies the slot order */ }
  }
  // the rule `inside-frame` holds for every piece that may move, before anything else (the smallest move back in)
  for (const p of list()) if (live(p.id) && !p.region) { const c = clampBox(p, frame); p.x = c.x; p.y = c.y; }
  // 2. relations: weakest tier first, so the strongest is applied last and wins; rounds are bounded
  const ordered = facts.slice().sort((a, b) => tierRank(b.tier) - tierRank(a.tier) || (a.seq ?? 0) - (b.seq ?? 0));
  for (let round_ = 0; round_ < 8; round_++) {
    let changed = false;
    for (const f of ordered) {
      if (!tick('space.solve.rel')) return fail('I ran out of steps keeping the relations, so I left everything as it was.');
      const A = cur[f.a], B = f.b ? cur[f.b] : null;
      if (!A || (f.b && !B)) continue;
      let mover = A, other = B, ff = f;
      if (!live(A.id) && B && live(B.id) && f.rel !== 'in_front_of' && f.rel !== 'behind') {   // the pinned one stays: the other one moves by the inverse relation
        const inv = { on: null, in: null, left_of: 'right_of', right_of: 'left_of', above: null, next_to: 'next_to', attached_to: 'attached_to', apart_from: 'apart_from', aligned_with: 'aligned_with', same_size_as: null }[f.rel];
        if (inv === undefined || inv === null) continue;
        mover = B; other = A; ff = { ...f, rel: inv };
      } else if (!live(A.id)) continue;
      const d = enforceFact(ff, mover, other, frame, pad);
      if (!d) continue;
      const before = { x: mover.x, y: mover.y, w: mover.w, h: mover.h, z: mover.z };
      const carried = RELS[ff.rel]?.carries || true ? carriedBy({ facts }, mover.id, pieces) : [];
      Object.assign(mover, d);
      if (d.x !== undefined || d.y !== undefined) { const c = f.rel === 'in' ? { x: mover.x, y: mover.y } : clampBox(mover, frame); mover.x = c.x; mover.y = c.y; }
      for (const k of carried) if (cur[k] && live(k) && (d.x !== undefined || d.y !== undefined)) { cur[k].x += mover.x - before.x; cur[k].y += mover.y - before.y; }
      if (before.x !== mover.x || before.y !== mover.y || before.w !== mover.w || before.z !== mover.z) changed = true;
      if (other && live(other.id) && !holdsFact(ff, cur, frame)) {   // the frame stopped the mover: the other one gives way the opposite way
        const inv = { left_of: 'right_of', right_of: 'left_of', above: null, next_to: 'next_to', attached_to: 'attached_to', apart_from: 'apart_from' }[ff.rel];
        const d2 = inv ? enforceFact({ ...ff, rel: inv }, other, mover, frame, pad) : null;
        if (d2) { const b2 = { x: other.x, y: other.y }; Object.assign(other, d2); const c = clampBox(other, frame); other.x = c.x; other.y = c.y; if (b2.x !== other.x || b2.y !== other.y) changed = true; }
      }
    }
    if (!changed) break;
  }
  // 3. overlap removal by the smallest move
  for (let pass = 0; pass < 200; pass++) {
    const L = list();
    let any = false;
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      if (j === i + 1) budget.tick('space.solve.scan');   // one tick per row of the scan
      const a = L[i], b = L[j];
      if (!boxesTouch(a, b)) continue;   // broad phase: boxes that do not meet cost nothing
      if (!tick('space.solve.overlap')) return fail('I ran out of steps separating them, so I left everything as it was.');
      if (exempt(a, b, facts, cur) || !overlaps(a, b, 1)) continue;
      const mover = !live(a.id) ? b : !live(b.id) ? a : (a.w * a.h <= b.w * b.h ? a : b), keep = mover === a ? b : a;
      if (!live(mover.id)) continue;
      const m = boxOf(mover), k = boxOf(keep), ox = Math.min(m.r, k.r) - Math.max(m.l, k.l) + pad, oy = Math.min(m.b, k.b) - Math.max(m.t, k.t) + pad;
      const cand = [];
      const sx = mover.x >= keep.x ? 1 : -1, sy = mover.y >= keep.y ? 1 : -1;
      cand.push({ x: mover.x + sx * ox, y: mover.y }, { x: mover.x - sx * ox, y: mover.y }, { x: mover.x, y: mover.y + sy * oy }, { x: mover.x, y: mover.y - sy * oy });
      const mine = facts.filter((f) => f.a === mover.id || f.b === mover.id);
      const keepsFacts = (c) => mine.every((f) => holdsFact(f, { ...cur, [mover.id]: { ...mover, ...c } }, frame));   // a move that breaks something the user said is the last resort
      const ok0 = cand.map((c) => ({ ...clampBox({ ...mover, ...c }, frame) })).filter((c) => !overlaps({ ...mover, ...c }, keep, 1));
      const ok = (ok0.filter(keepsFacts).length ? ok0.filter(keepsFacts) : ok0).sort((p, q) => Math.hypot(p.x - mover.x, p.y - mover.y) - Math.hypot(q.x - mover.x, q.y - mover.y))[0];
      const to = ok ?? clampBox({ ...mover, x: mover.x + sx * ox, y: mover.y + sy * oy }, frame);
      const dx = to.x - mover.x, dy = to.y - mover.y;
      mover.x = to.x; mover.y = to.y;
      for (const c of carriedBy({ facts }, mover.id, pieces)) if (cur[c] && live(c)) { cur[c].x += dx; cur[c].y += dy; }
      any = true;
    }
    if (!any) break;
  }
  for (const p of list()) if (live(p.id) && !p.region) { const c = clampBox(p, frame); p.x = round(c.x); p.y = round(c.y); }   // whole pixels, so that what the check sees is what the host gets
  // 4. the check
  const unmet = [];
  for (const f of facts) { if (!tick('space.solve.check')) return fail('I ran out of steps checking, so I left everything as it was.'); if (cur[f.a] && (!f.b || cur[f.b]) && !holdsFact(f, cur, frame)) unmet.push(f); }
  for (const p of list()) if (!p.region && !holdsFact({ rel: 'inside_frame', a: p.id }, cur, frame, 1)) unmet.push({ rel: 'inside_frame', a: p.id, source: 'rule:inside-frame', tier: 'default' });
  const L = list(), stuck = [];
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    if (!boxesTouch(L[i], L[j]) || (!live(L[i].id) && !live(L[j].id))) continue;   // two pieces the user placed stay as they are: not this call's business
    tick('space.solve.check');
    if (!exempt(L[i], L[j], facts, cur) && overlaps(L[i], L[j], 1)) stuck.push([L[i].id, L[j].id]);
  }
  const out = L.filter((p) => { const s = p.id in start ? start[p.id] : null; return !s || round(p.x) !== round(s.x) || round(p.y) !== round(s.y) || p.w !== s.w; });
  if (unmet.length || stuck.length) {
    const nm = (id) => names?.[id] ?? id, pinnedHit = stuck.length && (pins.has(stuck[0][0]) || pins.has(stuck[0][1]));
    const say = unmet.length ? `I could not keep this, so I left everything as it was: ${why(unmet[0], names)}` : `I could not separate ${nm(stuck[0][0])} and ${nm(stuck[0][1])} ${pinnedHit ? 'without moving something you placed' : 'within my step limit'}, so I left everything as it was.`;
    return { ok: false, boxes: {}, unmet, stuck, say, steps, displacement: 0 };
  }
  const boxes = {};
  for (const p of out) boxes[p.id] = { x: round(p.x), y: round(p.y), ...(p.w !== start[p.id]?.w ? { w: p.w, h: p.h } : {}), ...(p.z !== start[p.id]?.z ? { z: p.z } : {}) };
  const ment = new Set(mentioned ?? []), others = pieces.filter((p) => !ment.has(p.id));
  const displacement = others.length ? others.reduce((s, p) => s + Math.hypot((boxes[p.id]?.x ?? p.x) - p.x, (boxes[p.id]?.y ?? p.y) - p.y), 0) / others.length : 0;
  return { ok: true, boxes, unmet: [], stuck: [], say: '', steps, displacement };
}
