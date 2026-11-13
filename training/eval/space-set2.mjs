// SPDX-License-Identifier: AGPL-3.0-only
// SPACE-2 cases (specs/19-space-module.md section 6): surface-aware overlap, natural joining (with and without "apart") and layouts from general knowledge. Seeded, 60 cases,
// run through the module's whole-sentence reader `interpret` on projections like the two hosts give (art.draw: part boxes, frame 1000 x 700; diagram: outlines of the shapes,
// frame 800 x 500), so both hosts' projections are covered without a browser. The expectation is checked from plain geometry (separation of the outlines, order, mirror).
//   import { generate2, runCases2 } from './space-set2.mjs';   generate2(seed = 20261114, n = 60) -> cases;   runCases2(cases) -> [{ id, cls, ok, why, text, say }]
import * as S from '../../worlds/space/space.mjs';

const FR = { draw: { w: 1000, h: 700, step: 110 }, diagram: { w: 800, h: 500, step: 80 } };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length)];
const SHAPES = ['triangle', 'diamond', 'hexagon', 'star', 'circle'];
let nid = 0;
const item = (kind, x, y, w, h, extra = {}) => ({ id: `${kind}${++nid}`, kind, name: kind, x, y, w, h, ...extra });
const shaped = (it, k) => ({ ...it, shape: S.outlineOf(k, it.w, it.h) });
const KINDS = { chair: 'chair', chairs: 'chair', table: 'table', roof: 'roof', walls: 'walls', wheel: 'wheel', road: 'road', cup: 'cup', cups: 'cup', eye: 'eye', eyes: 'eye', nose: 'nose', mouth: 'mouth', brow: 'brow', brows: 'brow', person: 'person', people: 'person', box: 'box', boxes: 'box', circle: 'circle', circles: 'circle', triangle: 'triangle', triangles: 'triangle', diamond: 'diamond', diamonds: 'diamond', hexagon: 'hexagon', star: 'star', stars: 'star', ear: 'ear', ears: 'ear' };
const kindOf = (w) => (KINDS[w] ? { kind: KINDS[w], plural: KINDS[w] !== w } : null);
export const ctxOf = (host, items, extra = {}) => ({ items, frame: FR[host], kindOf, last: [], ...extra });

export function generate2(seed = 20261114, count = 60) {
  const r = rng(seed), out = [], plan = [['surf-keep', 10], ['surf-tidy', 10], ['surf-place', 8], ['join-on', 10], ['join-apart', 8], ['join-move', 4], ['layout', 10]];
  const total = plan.reduce((a, b) => a + b[1], 0);
  for (const [cls, share] of plan) for (let i = 0; i < Math.round((share * count) / total) && out.length < count; i++) out.push({ id: `sk${String(out.length + 1).padStart(3, '0')}`, cls, host: i % 2 ? 'diagram' : 'draw', ...make(r, cls, i % 2 ? 'diagram' : 'draw', i) });
  while (out.length < count) out.push({ id: `sk${String(out.length + 1).padStart(3, '0')}`, cls: 'layout', host: 'draw', ...make(r, 'layout', 'draw', out.length) });
  return out;
}

function make(r, cls, host, i) {
  const f = FR[host], S0 = host === 'draw' ? 120 : 70, cx = f.w / 2, cy = f.h / 2;
  if (cls === 'surf-keep') {   // two triangles whose boxes overlap in a corner where neither has any surface: already tidy
    const a = item('triangle', cx - S0, cy, S0, S0), b = item('triangle', cx - S0 + S0 * 0.86, cy - S0 * 0.62, S0, S0);
    const items = [shaped(a, 'triangle'), shaped(b, 'triangle')];
    return { items, text: pick(r, ['tidy up', 'make a better layout', 'tidy up the triangles']), expect: { still: true } };
  }
  if (cls === 'surf-tidy') {
    const k = pick(r, SHAPES), n = 2 + Math.floor(r() * 3), items = [];
    for (let j = 0; j < n; j++) items.push(shaped(item(k, cx + (r() - 0.5) * S0 * 0.9 + j * S0 * 0.15, cy + (r() - 0.5) * S0 * 0.9, S0 * (0.8 + r() * 0.5), S0 * (0.8 + r() * 0.5)), k));
    if (!S.anyOverlap(items)) items[1].x = items[0].x + 4, items[1].y = items[0].y + 4;
    return { items, text: pick(r, ['tidy up', 'make a better layout', 'fix the overlaps']), expect: { apart: true } };
  }
  if (cls === 'surf-place') {
    const k = pick(r, ['triangle', 'hexagon', 'circle']), a = shaped(item(k, f.w * 0.25, cy, S0, S0), k), ref = shaped(item('star', cx, cy, S0, S0), 'star'), blocker = shaped(item('diamond', cx + S0 * 1.1, cy, S0, S0), 'diamond');
    const rel = pick(r, ['next to', 'above', 'under', 'to the left of', 'to the right of']);
    return { items: [a, ref, blocker], text: `put the ${k} ${rel} the star`, expect: { clear: a.id, ref: ref.id } };
  }
  if (cls === 'join-on') {
    const walls = item('walls', cx, cy + S0 * 0.6, S0 * 1.5, S0 * 0.8), roof = shaped(item('roof', cx - S0 * 1.8, cy - S0 * 1.2, S0 * 1.5, S0 * 0.7), 'triangle');
    const form = pick(r, ['put the roof on the walls', 'set the roof onto the walls', 'move the roof on top of the walls']);
    return { items: [roof, walls], text: form, expect: { touch: [roof.id, walls.id], above: true, say: '^I set the roof on the walls' } };
  }
  if (cls === 'join-apart') {
    const walls = item('walls', cx, cy + S0 * 0.6, S0 * 1.5, S0 * 0.8), roof = shaped(item('roof', cx - S0 * 1.8, cy - S0 * 1.2, S0 * 1.5, S0 * 0.7), 'triangle');
    const form = pick(r, ["put the roof on the walls, don't join them", 'put the roof next to the walls and leave a gap', 'put the roof next to the walls but keep them apart', 'put the roof above the walls with a gap']);
    return { items: [roof, walls], text: form, expect: { gap: [roof.id, walls.id], noJoinSay: true } };
  }
  if (cls === 'join-move') {
    const road = item('road', cx, cy + S0 * 0.8, S0 * 3, S0 * 0.4), wheel = shaped(item('wheel', cx, cy + S0 * 0.8 - S0 * 0.2 - S0 * 0.5 - 8, S0 * 0.6, S0 * 0.6), 'circle');
    const apart = i % 2 === 1;
    return { items: [wheel, road], text: apart ? 'move the wheel down a bit and leave a gap' : 'move the wheel down a bit', expect: apart ? { gapMin: [wheel.id, road.id, 12] } : { touch: [wheel.id, road.id] } };
  }
  const which = i % 5;
  if (which === 0 || which === 1) {   // chairs around a table
    const n = 3 + Math.floor(r() * 4), table = item('table', cx, cy, S0 * 1.6, S0 * 0.9), chairs = Array.from({ length: n }, (_, j) => item('chair', f.w * 0.12 + j * 40, f.h * 0.12 + (j % 2) * 60, S0 * 0.5, S0 * 0.5));
    return { items: [...chairs, table], text: which ? `put the chairs in a circle around the table` : 'put the chairs around the table', expect: { around: table.id, kind: 'chair' } };
  }
  if (which === 2) {   // by height
    const n = 3 + Math.floor(r() * 3), people = Array.from({ length: n }, (_, j) => item('person', f.w * 0.1 + j * 60, cy + (r() - 0.5) * 80, S0 * 0.4, S0 * (0.6 + r() * 1.2)));
    const desc = r() < 0.4;
    return { items: people, text: desc ? 'put the people in a row from the tallest to the shortest' : 'put the people in a row by height', expect: { height: true, desc } };
  }
  if (which === 3) {   // a stack, the table below the cup
    const table = item('table', cx - 200, cy, S0 * 1.6, S0 * 0.9), cup = item('cup', cx + 100, cy - 100, S0 * 0.5, S0 * 0.5);
    return { items: [cup, table], text: 'put the table and the cup on top of each other', expect: { stack: [cup.id, table.id] } };
  }
  const parts = [item('mouth', cx - 150, cy + 100, 40, 20), item('eye', cx + 90, cy - 150, 30, 20), item('nose', cx + 130, cy + 130, 20, 40), item('eye', cx - 200, cy + 10, 30, 20), item('brow', cx, cy - 100, 40, 8), item('brow', cx - 80, cy + 60, 40, 8)];
  return { items: parts, text: 'put the face parts in the places of a face', expect: { face: true } };
}

const surfGap = (a, b) => S.gap(a, b), hit = (a, b) => S.overlaps(a, b, 1);
const inFrame = (it, f) => it.x - it.w / 2 >= -1 && it.x + it.w / 2 <= f.w + 1 && it.y - it.h / 2 >= -1 && it.y + it.h / 2 <= f.h + 1;

/** Checks one case against the module's answer; null when it holds, else the reason. */
export function check2(c, res) {
  const f = FR[c.host], e = c.expect, by = Object.fromEntries(c.items.map((i) => [i.id, i]));
  if (!res) return 'no answer';
  const after = c.items.map((i) => ({ ...i, ...(res.boxes?.[i.id] ?? {}) })), A = Object.fromEntries(after.map((i) => [i.id, i]));
  if (res.type === 'error' || res.type === 'ask') return `${res.type}: ${res.say}`;
  if (e.still) return !Object.keys(res.boxes ?? {}).length && /already tidy/.test(res.say) ? null : `moved or said "${res.say}"`;
  if (!after.every((i) => inFrame(i, f))) return 'outside the frame';
  if (e.apart) return after.some((p, i) => after.slice(i + 1).some((q) => hit(p, q))) ? 'surfaces still overlap' : null;
  if (e.clear) { const m = A[e.clear]; return after.some((o) => o.id !== m.id && hit(m, o)) ? 'overlaps another surface' : null; }
  if (e.touch) { const [a, b] = e.touch.map((id) => A[id]); if (hit(a, b)) return 'overlapping'; if (surfGap(a, b) > 4) return `gap ${surfGap(a, b).toFixed(1)}`; if (e.above && !(a.y < b.y)) return 'not above'; if (e.say && !new RegExp(e.say).test(res.say)) return `say "${res.say}"`; return null; }
  if (e.gap) { const [a, b] = e.gap.map((id) => A[id]); if (hit(a, b)) return 'overlapping'; if (surfGap(a, b) < 12) return `touching (${surfGap(a, b).toFixed(1)})`; return /I set/.test(res.say) ? `said a join: ${res.say}` : null; }
  if (e.gapMin) { const [a, b, g] = [A[e.gapMin[0]], A[e.gapMin[1]], e.gapMin[2]]; return surfGap(a, b) >= g && !hit(a, b) ? null : `gap ${surfGap(a, b).toFixed(1)}`; }
  if (e.around) {
    const t = A[e.around], ch = after.filter((i) => i.kind === e.kind);
    if (ch.some((x) => surfGap(x, t) > 8 || hit(x, t))) return 'a chair does not touch the table or sits on it';
    if (ch.some((x, i) => ch.slice(i + 1).some((y) => hit(x, y)))) return 'chairs overlap';
    const angs = ch.map((x) => Math.atan2(x.y - t.y, x.x - t.x)).sort((a, b) => a - b), gaps = angs.map((a, i) => (i + 1 < angs.length ? angs[i + 1] - a : angs[0] + 2 * Math.PI - a));
    return Math.max(...gaps) < (2 * Math.PI) / ch.length + 1.2 ? null : 'not spread around';
  }
  if (e.height) {
    const row = after.slice().sort((a, b) => a.x - b.x);
    if (!row.every((p, i) => i === 0 || (e.desc ? p.h <= row[i - 1].h + 0.5 : p.h >= row[i - 1].h - 0.5))) return 'not sorted by height';
    const base = row.map((p) => p.y + p.h / 2);
    if (Math.max(...base) - Math.min(...base) > 3) return 'not on one baseline';
    return row.some((p, i) => i && hit(p, row[i - 1])) ? 'overlap' : null;
  }
  if (e.stack) { const [top, base] = e.stack.map((id) => A[id]); if (!(top.y < base.y)) return 'the supporter is not below'; if (hit(top, base)) return 'overlap'; return surfGap(top, base) <= 4 && Math.abs(top.x - base.x) < 3 ? null : `gap ${surfGap(top, base).toFixed(1)}`; }
  if (e.face) {
    const g = (k) => after.filter((i) => i.kind === k), eyes = g('eye'), nose = g('nose')[0], mouth = g('mouth')[0], brows = g('brow');
    if (!(eyes.every((x) => x.y < nose.y) && nose.y < mouth.y && brows.every((b) => eyes.every((x) => b.y < x.y)))) return 'order of the face is wrong';
    const mid = f.w / 2, pair = (ps) => ps.length === 2 && Math.abs(ps[0].x + ps[1].x - 2 * mid) < 3 && Math.abs(ps[0].y - ps[1].y) < 2;
    if (!pair(eyes) || !pair(brows)) return 'pairs are not mirrored';
    return Math.abs(nose.x - mid) < 3 && Math.abs(mouth.x - mid) < 3 ? null : 'nose and mouth are not in the middle';
  }
  void by;
  return 'unknown expectation';
}

export function runCases2(cases) {
  return cases.map((c) => {
    let res, why;
    try { res = S.interpret(c.text, ctxOf(c.host, c.items)); why = check2(c, res); } catch (e) { why = `exception ${e.message}`; }
    return { id: c.id, cls: c.cls, host: c.host, ok: !why, why, text: c.text, say: res?.say };
  });
}
