// SPDX-License-Identifier: AGPL-3.0-only
// Arrow geometry of the Diagram tab (DIAG3, spec 14 section 3). Browser-safe, no imports; the tab calls routeEdges() and draws what it returns.
//
// Rules (every number is measured by tests/diagram-arrows.test.mjs over the template and bench diagrams):
//   - an arrow attaches to the side of a shape that faces the other end, at least CORNER px from the corners of that side;
//   - it enters a border at an angle of at least MIN_ENTRY degrees to the border line, or its last segment is bent to enter perpendicular (stub);
//   - parallel and opposite arrows between the same two shapes are spread SPREAD px apart;
//   - a segment keeps at least CLEAR px from every other shape (a detour bend is tried; a crowded diagram may leave a smaller gap);
//   - the label sits off the line (halo drawn by the tab), the id tag on the middle of the line.
export const CORNER = 8, MIN_ENTRY = 30, SPREAD = 14, CLEAR = 8, STUB = 14, APART = 10, FAN = 20;

const unit = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

/** The outline of a shape in its own coordinates: a polygon (rect, diamond, hexagon, triangle) or an ellipse. */
function outline(s, d) {
  const hw = d.w / 2, hh = d.h / 2;
  switch (s.shape) {
    case 'circle': return { ellipse: true, rx: hw, ry: hw };
    case 'ellipse': return { ellipse: true, rx: hw, ry: hh };
    case 'star': return { ellipse: true, rx: hw * 0.62, ry: hh * 0.62 };
    case 'triangle': return { poly: [[0, -hh], [hw, hh], [-hw, hh]] };
    case 'diamond': return { poly: [[0, -hh], [hw, 0], [0, hh], [-hw, 0]] };
    case 'hexagon': return { poly: [0, 1, 2, 3, 4, 5].map((i) => [Math.cos(i * Math.PI / 3) * hw, Math.sin(i * Math.PI / 3) * hh]) };
    default: return { poly: [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] };
  }
}
/** The sides of a polygon: midpoint, outward unit normal, unit tangent and length. */
function sidesOf(poly) {
  const n = poly.length, cx = poly.reduce((a, p) => a + p[0], 0) / n, cy = poly.reduce((a, p) => a + p[1], 0) / n;
  return poly.map((p, i) => {
    const q = poly[(i + 1) % n], len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, t = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
    let nn = [t[1], -t[0]]; const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    if (dot(nn, [mid[0] - cx, mid[1] - cy]) < 0) nn = [-nn[0], -nn[1]];
    return { mid, n: nn, t, len };
  });
}
/**
 * Where an arrow leaves / enters a shape: the point, the outward unit normal. `toward` = the other end (centre), `shift` = the spread vector.
 * A polygon takes the side that faces the other end; an ellipse the point where the shifted centre line meets it.
 */
function attach(s, d, toward, shift, ov = null) {
  const o = outline(s, d), c = [s.x, s.y];
  if (o.ellipse) {
    // the line through the shifted centres, intersected with the ellipse on the side of the other end
    const [ux, uy] = unit(toward[0] - c[0], toward[1] - c[1]);
    const px = shift[0], py = shift[1];   // the line passes through c + shift with direction u
    // solve ((px + t ux) / rx)^2 + ((py + t uy) / ry)^2 = 1 for the larger t
    const A = (ux / o.rx) ** 2 + (uy / o.ry) ** 2, B = 2 * (px * ux / o.rx ** 2 + py * uy / o.ry ** 2), C = (px / o.rx) ** 2 + (py / o.ry) ** 2 - 1;
    const disc = B * B - 4 * A * C;
    const t = disc >= 0 ? (-B + Math.sqrt(disc)) / (2 * A) : Math.max(o.rx, o.ry);
    let x = px + t * ux, y = py + t * uy;
    if (ov && ov.ang != null) { x = o.rx * Math.cos(ov.ang); y = o.ry * Math.sin(ov.ang); }   // spread along the curve
    const nn = unit(x / o.rx ** 2, y / o.ry ** 2);
    return { x: c[0] + x, y: c[1] + y, n: nn, kind: 'ellipse', ang: Math.atan2(y / o.ry, x / o.rx), rx: o.rx, ry: o.ry, key: 'e' };
  }
  const sides = sidesOf(o.poly), u = unit(toward[0] - c[0], toward[1] - c[1]);
  // the side that faces the other end; for a rectangle by the dominant axis of the centre line in units of the box
  let best = null, bs = -9;
  for (const sd of sides) { const sc = dot(sd.n, u); if (sc > bs) { bs = sc; best = sd; } }
  const slide = ov && ov.slide != null ? ov.slide : shift[0] * best.t[0] + shift[1] * best.t[1], room = Math.max(0, best.len / 2 - CORNER);
  const k = Math.max(-room, Math.min(room, slide));
  return { x: c[0] + best.mid[0] + best.t[0] * k, y: c[1] + best.mid[1] + best.t[1] * k, n: best.n, kind: 'side', corner: Math.max(0, best.len / 2 - Math.abs(k)), key: `s${sides.indexOf(best)}`, slide: k, room, len: best.len, t: best.t };
}

export const boxOf = (s, d, pad = 0) => ({ x1: s.x - d.w / 2 - pad, y1: s.y - d.h / 2 - pad, x2: s.x + d.w / 2 + pad, y2: s.y + d.h / 2 + pad });
/** Distance from a segment to an axis-aligned box (0 when they touch or cross). */
export function segBoxDist(p, q, b) {
  // sample: segments are short and boxes small; exact enough at 1 px
  const n = Math.max(2, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 2));
  let m = Infinity;
  for (let i = 0; i <= n; i++) {
    const x = p[0] + (q[0] - p[0]) * i / n, y = p[1] + (q[1] - p[1]) * i / n;
    const dx = Math.max(b.x1 - x, 0, x - b.x2), dy = Math.max(b.y1 - y, 0, y - b.y2);
    m = Math.min(m, Math.hypot(dx, dy));
  }
  return m;
}
const lenOf = (pts) => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
/** The point at fraction f of the polyline's length, and the unit direction there. */
export function along(pts, f) {
  let want = lenOf(pts) * f;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (want <= l || i === pts.length - 1) { const k = l ? Math.min(1, want / l) : 0; return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k, dir: unit(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) }; }
    want -= l;
  }
  return { x: pts[0][0], y: pts[0][1], dir: [1, 0] };
}
/** The angle (degrees) at which a segment direction meets a border of outward normal n: 90 = perpendicular, 0 = along the border. */
export const entryAngle = (dir, n) => Math.asin(Math.min(1, Math.abs(dot(dir, n)))) * 180 / Math.PI;

/**
 * Routes every arrow. shapes: [{ name, x, y, shape, layer? }]; edges: [{ id, from, to, label? }]; dims(shape) -> { w, h }; tags (optional): boxes to keep labels off.
 * Returns Map id -> { pts: [[x,y]...] (from the border of `from` to the border of `to`), entryFrom, entryTo (degrees), corner (px to the nearest corner of the sides used),
 * clearance (px to the nearest other shape), stub (true when a last segment was bent), label: {x,y}, mid: {x,y} }; an arrow whose ends touch or overlap has no entry.
 */
export function routeEdges(shapes, edges, dims, { tags = [] } = {}) {
  const by = new Map(shapes.map((s) => [s.name, s])), out = new Map();
  const solid = shapes.filter((s) => !s.layer && Number.isFinite(s.x) && Number.isFinite(s.y));
  const boxes = solid.map((s) => ({ s, b: boxOf(s, dims(s)) }));
  // spread: arrows between the same unordered pair share a fan
  const groups = new Map();
  for (const e of edges) { const k = [e.from, e.to].sort().join('\u0000'); (groups.get(k) ?? groups.set(k, []).get(k)).push(e); }
  const taken = boxes.map((x) => x.b).concat(tags);
  const jobs = [];
  for (const [, g] of groups) {
    g.forEach((e, i) => {
      const a = by.get(e.from), b = by.get(e.to);
      if (!a || !b || a === b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) return;
      const da = dims(a), db = dims(b), first = e.from < e.to ? a : b, second = e.from < e.to ? b : a;
      const [px, py] = unit(second.x - first.x, second.y - first.y), perp = [-py, px];
      const off = (i - (g.length - 1) / 2) * SPREAD;
      const rmin = Math.min(da.w, da.h, db.w, db.h) / 2, o = Math.max(-0.6 * rmin, Math.min(0.6 * rmin, off));
      const shift = [perp[0] * o, perp[1] * o];
      const A = attach(a, da, [b.x + shift[0], b.y + shift[1]], shift), B = attach(b, db, [a.x + shift[0], a.y + shift[1]], shift);
      if (Math.hypot(B.x - A.x, B.y - A.y) < 6 || dot(unit(B.x - A.x, B.y - A.y), unit(b.x - a.x, b.y - a.y)) < 0) return;   // touching or overlapping shapes: no arrow
      jobs.push({ e, a, b, da, db, A, B, shift });
    });
  }
  // spread the attachment points: arrows that meet the same side of a shape (or the same stretch of an ellipse) are fanned out along it,
  // at least APART px apart (FAN when the side is long enough), ordered by where the other end lies so that they do not cross
  const ends = new Map();
  for (const j of jobs) for (const [who, P, other, sh, dm] of [['A', j.A, j.b, j.a, j.da], ['B', j.B, j.a, j.b, j.db]]) {
    const k = `${sh.name}\u0000${P.key}`;
    (ends.get(k) ?? ends.set(k, []).get(k)).push({ j, who, P, other, sh, dm });
  }
  for (const [, list] of ends) {
    if (list.length < 2) continue;
    const P0 = list[0].P;
    if (P0.kind === 'side') {
      const room = P0.room, along_ = (x) => (x.other.x - x.sh.x) * x.P.t[0] + (x.other.y - x.sh.y) * x.P.t[1];
      const order = list.slice().sort((p, q) => (Math.abs(p.P.slide - q.P.slide) > 1e-6 ? p.P.slide - q.P.slide : along_(p) - along_(q)));
      const n = order.length, step = n > 1 ? Math.min(FAN, (2 * room) / (n - 1)) : 0, mean = order.reduce((t, x) => t + x.P.slide, 0) / n;
      const first = Math.max(-room, Math.min(room - step * (n - 1), mean - step * (n - 1) / 2));
      order.forEach((x, i) => { const P = attach(x.sh, x.dm, [x.other.x, x.other.y], [0, 0], { slide: first + i * step }); x.j[x.who] = P; });
    } else {
      const rad = Math.max(P0.rx, P0.ry), step = Math.min(FAN, APART * 1.6) / rad;
      const wrap = list.some((x) => x.P.ang > Math.PI / 2) && list.some((x) => x.P.ang < -Math.PI / 2), angOf = (x) => (wrap && x.P.ang < 0 ? x.P.ang + 2 * Math.PI : x.P.ang);
      const order = list.slice().sort((p, q) => angOf(p) - angOf(q)), n = order.length, mean = order.reduce((t, x) => t + angOf(x), 0) / n;
      // only a cluster closer than APART px needs spreading; a lone far one keeps its place
      const sorted = order.map(angOf);
      if (sorted.some((v, i) => i && (v - sorted[i - 1]) * rad < APART * 1.2)) order.forEach((x, i) => { const P = attach(x.sh, x.dm, [x.other.x, x.other.y], [0, 0], { ang: mean + (i - (n - 1) / 2) * step }); x.j[x.who] = P; });
    }
  }
  for (const j of jobs) {
    {
      const { e, a, b, A, B } = j;
      let pts = [[A.x, A.y], [B.x, B.y]], stub = false;
      const angles = (p) => [entryAngle(unit(p[1][0] - p[0][0], p[1][1] - p[0][1]), A.n), entryAngle(unit(p.at(-1)[0] - p.at(-2)[0], p.at(-1)[1] - p.at(-2)[1]), B.n)];
      let [ea, eb] = angles(pts);
      const stubbed = () => [[A.x, A.y], [A.x + A.n[0] * STUB, A.y + A.n[1] * STUB], [B.x + B.n[0] * STUB, B.y + B.n[1] * STUB], [B.x, B.y]];
      if (Math.min(ea, eb) < MIN_ENTRY) { pts = stubbed(); stub = true; }
      // clearance from the other shapes: a detour bend around the first shape in the way
      const others = boxes.filter((x) => x.s !== a && x.s !== b);
      const clear = (p) => { let m = Infinity; for (const x of others) for (let k = 1; k < p.length; k++) m = Math.min(m, segBoxDist(p[k - 1], p[k], x.b)); return m; };
      let cl = clear(pts);
      if (cl < CLEAR) {
        const mid = along(pts, 0.5), n0 = [-mid.dir[1], mid.dir[0]];
        let bestPts = pts, bestCl = cl;
        const sA = [A.x + A.n[0] * STUB, A.y + A.n[1] * STUB], sB = [B.x + B.n[0] * STUB, B.y + B.n[1] * STUB];
        search: for (const dist of [28, -28, 52, -52, 80, -80, 120, -120, 170, -170]) {
          const via = [mid.x + n0[0] * dist, mid.y + n0[1] * dist];
          for (const cand of [stub ? [pts[0], pts[1], via, pts[2], pts[3]] : [pts[0], via, pts[1]], [[A.x, A.y], sA, via, sB, [B.x, B.y]]]) {
            const c2 = clear(cand), ang = [entryAngle(unit(cand[1][0] - cand[0][0], cand[1][1] - cand[0][1]), A.n), entryAngle(unit(cand.at(-1)[0] - cand.at(-2)[0], cand.at(-1)[1] - cand.at(-2)[1]), B.n)];
            if (Math.min(...ang) >= MIN_ENTRY && c2 > bestCl) { bestPts = cand; bestCl = c2; if (c2 >= CLEAR) break search; }
          }
        }
        // a bent detour that still enters at a poor angle gets stubs at both ends
        pts = bestPts; cl = bestCl;
      }
      [ea, eb] = angles(pts);
      // label and id: the label off the line by half its height plus a gap, the id on the middle of the line
      const labelled = !!e.label;
      const lab = along(pts, 0.5), lw = String(e.label ?? '').length * 6.8 + 4;
      const free = (cx, cy) => !taken.some((o) => Math.min(o.x2, cx + lw / 2) - Math.max(o.x1, cx - lw / 2) > 0.5 && Math.min(o.y2, cy + 8) - Math.max(o.y1, cy - 8) > 0.5);
      let lp = null;
      if (labelled) {
        const spots = [];
        for (const f of [0.5, 0.4, 0.6, 0.3, 0.7]) for (const side of [1, -1]) { const p = along(pts, f), off = side * (13 + Math.abs(p.dir[1]) * lw / 2); spots.push({ x: p.x - p.dir[1] * off, y: p.y + p.dir[0] * off }); }
        lp = spots.find((q) => free(q.x, q.y)) ?? spots[0];
      }
      const mid = labelled ? along(pts, 0.64) : lab;
      out.set(e.id, { pts, entryFrom: ea, entryTo: eb, corner: Math.min(A.corner ?? Infinity, B.corner ?? Infinity), clearance: cl, stub, label: lp, mid: { x: mid.x, y: mid.y }, headDir: unit(pts.at(-1)[0] - pts.at(-2)[0], pts.at(-1)[1] - pts.at(-2)[1]), tailDir: unit(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]) });
    }
  }
  return out;
}
