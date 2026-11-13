// SPDX-License-Identifier: AGPL-3.0-only
// Runs cases of space-set.mjs through the real dialog engine (one fresh session per case, the objects put into the host's world state) and checks the expectation.
//   import { runCases } from './space-run.mjs';   const results = await runCases(cases, { reasoner: 'ops' | 'matrix' });  -> [{ id, cls, host, ok, why, text, reply }]
import { createFsLoader, DEFAULT_ROOT } from '../../src/loaders/fs-loader.mjs';
import { createEngine } from '../../src/dialog/index.mjs';
import * as draw from '../../worlds/art.draw/ops.mjs';
import * as diagram from '../../worlds/diagram.sketch/ops.mjs';
import { hosts } from './space-set.mjs';

const near = (a, b, t = 2) => Math.abs(a - b) <= t;
const boxOf = (o, h) => { if (h === hosts.draw) { const b = draw.bbox({ kind: o.kind, size: o.size, x: o.x, y: o.y, rotation: 0 }); return { w: b.w, h: b.h }; } return { w: o.size, h: o.size }; };
const overlap = (a, b, h) => Math.abs(a.x - b.x) < (boxOf(a, h).w + boxOf(b, h).w) / 2 - 1 && Math.abs(a.y - b.y) < (boxOf(a, h).h + boxOf(b, h).h) / 2 - 1;

/** The host's world state for a case. */
function stateFor(c) {
  if (c.host === 'draw') {
    const s = draw.initialState();
    s.objects = c.objects.map((o, i) => ({ id: o.id, kind: o.kind, x: o.x, y: o.y, size: o.size, color: null, fill: 'crayon', rotation: 0, flip: false, z: i, parts: {} }));
    s.nextId = c.objects.length + 1;
    return s;
  }
  const s = diagram.initialState();
  s.shapes = c.objects.map((o, i) => ({ name: o.id, id: o.id, shape: o.kind, size: o.size, color: 'red', outline: null, label: null, x: o.x, y: o.y, order: i + 1 }));
  s.seq = Object.fromEntries([...new Set(c.objects.map((o) => o.kind))].map((k) => [k, c.objects.filter((o) => o.kind === k).length]));
  s.order = c.objects.length;
  return s;
}
const positions = (c, st) => (c.host === 'draw' ? st.objects : st.shapes).map((o) => ({ id: o.id ?? o.name, x: o.x, y: o.y, size: o.size, kind: o.kind ?? o.shape }));

/** Checks one case; returns null when it holds, else the reason. */
export function check(c, reply, after) {
  const h = hosts[c.host], e = c.expect, by = Object.fromEntries(after.map((o) => [o.id, o]));
  const moved = c.objects.filter((o) => !near(o.x, by[o.id]?.x ?? NaN, 1) || !near(o.y, by[o.id]?.y ?? NaN, 1));
  if (e.boxes) {
    for (const [id, b] of Object.entries(e.boxes)) { const o = by[id]; if (!o || !near(o.x, b.x, 3) || !near(o.y, b.y, 3)) return `${id} is at ${o?.x},${o?.y}, expected ${b.x},${b.y}`; }
    const stray = moved.filter((o) => !e.boxes[o.id]);
    return stray.length ? `${stray.map((o) => o.id)} moved too` : null;
  }
  if (e.ask) return moved.length ? 'something moved although the request is ambiguous' : /which|mean|no single|middle/i.test(reply) ? null : `no question in the reply: ${reply}`;
  if (e.say) return new RegExp(e.say, 'i').test(reply) && !moved.length ? null : `reply "${reply}" (moved ${moved.length})`;
  if (e.swap) { const [a, b] = [c.objects[0], c.objects.at(-1)], A = by[a.id], B = by[b.id]; const left = (o) => o.x; const first = c.objects.slice().sort((p, q) => p.y - q.y || p.x - q.x); const x = first[0], y = first.at(-1); return near(by[x.id].x, y.x) && near(by[x.id].y, y.y) && near(by[y.id].x, x.x) && near(by[y.id].y, x.y) ? null : `not swapped (${A?.x},${B?.x},${left(a)})`; }
  if (e.row) return after.every((o) => near(o.y, after[0].y, 3)) && !after.some((o, i) => after.slice(i + 1).some((p) => overlap(o, p, h))) ? null : 'not one row without overlaps';
  if (e.column) return after.every((o) => near(o.x, after[0].x, 3)) && !after.some((o, i) => after.slice(i + 1).some((p) => overlap(o, p, h))) ? null : 'not one column without overlaps';
  if (e.circle) { const cx = after.reduce((a, o) => a + o.x, 0) / after.length, cy = after.reduce((a, o) => a + o.y, 0) / after.length, d = after.map((o) => Math.hypot(o.x - cx, o.y - cy)); return Math.max(...d) - Math.min(...d) < 6 ? null : 'not on a circle'; }
  if (e.grid) { const rows = new Set(after.map((o) => Math.round(o.y / 10))), cols = new Set(after.map((o) => Math.round(o.x / 10))); return rows.size >= 2 && cols.size >= 2 && !after.some((o, i) => after.slice(i + 1).some((p) => overlap(o, p, h))) ? null : 'not a grid'; }
  if (e.align) { const l = after.map((o) => o.x - boxOf(o, h).w / 2); return Math.max(...l) - Math.min(...l) < 4 ? null : 'left edges differ'; }
  if (e.tidy) return after.some((o, i) => after.slice(i + 1).some((p) => overlap(o, p, h))) ? 'still overlapping' : null;
  if (e.rel) {
    const m = by[e.mover], r = by[e.ref], bm = boxOf(m, h), br = boxOf(r, h);
    const g = Math.hypot(Math.max(0, Math.abs(m.x - r.x) - (bm.w + br.w) / 2), Math.max(0, Math.abs(m.y - r.y) - (bm.h + br.h) / 2));
    const hold = { above: m.y + bm.h / 2 <= r.y - br.h / 2 + 3, under: m.y - bm.h / 2 >= r.y + br.h / 2 - 3, leftof: m.x + bm.w / 2 <= r.x - br.w / 2 + 3, rightof: m.x - bm.w / 2 >= r.x + br.w / 2 - 3, next: g <= Math.hypot(h.frame.w, h.frame.h) * 0.15 }[e.rel];
    if (!hold) return `relation ${e.rel} does not hold`;
    return overlap(m, r, h) ? 'overlaps the reference' : null;
  }
  return 'unknown expectation';
}

export async function runCases(cases, { reasoner = 'matrix' } = {}) {
  const engine = await createEngine({ loader: createFsLoader({ roots: [DEFAULT_ROOT] }), options: { reasoner } });
  const out = [];
  for (const c of cases) {
    const s = engine.createSession({ language: 'en' });
    s.setWorldState('ui.shell', { activeTab: hosts[c.host].tab });
    s.setWorldState(c.host === 'draw' ? 'art.draw' : 'diagram.sketch', stateFor(c));
    let reply = '', why;
    try { reply = (await s.send(c.text)).text; } catch (e) { why = `exception ${e.message}`; }
    const after = positions(c, s.state(c.host === 'draw' ? 'art.draw' : 'diagram.sketch'));
    why ??= check(c, reply, after);
    out.push({ id: c.id, cls: c.cls, host: c.host, ok: !why, why, text: c.text, reply });
  }
  return out;
}
export const summary = (results) => {
  const by = {};
  for (const r of results) { const k = `${r.host}/${r.cls}`; by[k] ??= { n: 0, ok: 0 }; by[k].n++; by[k].ok += r.ok ? 1 : 0; }
  return by;
};
