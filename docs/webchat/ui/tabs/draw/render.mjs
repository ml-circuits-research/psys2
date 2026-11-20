// Drawing tab renderer (spec 07 section 3, art.draw). Pure drawing: turns the primitives of the art.draw SOP projection
// (the SVG worlds/sop-primitives.mjs writes from the area's ui.draw.* facts, one <g data-select> per drawn part) into
// hand-drawn pictures with rough.js (canvas for the screen and PNG, SVG for the vector download). It decides nothing
// about what is drawn: shapes, boxes, transforms, fills and labels are taken as the projection states them; this
// module only chooses the crayon look (outline, soft base, hachure strokes, seeds).

const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const OUTLINE = '#3a3040';
export const PAPER = '#ffffff';

// ---- colour shading (presentation only) ------------------------------------------------------------------------
function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '')); if (!m) return [0, 0, 0.6];
  const n = parseInt(m[1], 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToHex(h, s, l) {
  const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const [r, g, b] = s === 0 ? [l, l, l] : [f(p, q, h + 1 / 3), f(p, q, h), f(p, q, h - 1 / 3)];
  return '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
}
export function shadeHex(hex, dl = 0, ds = 0) { const [h, s, l] = hexToHsl(hex); return hslToHex(h, clamp(s + ds, 0, 1), clamp(l + dl, 0.04, 0.97)); }
const cssHex = (c) => { const v = String(c ?? '').trim(); if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase(); if (/^#[0-9a-f]{3}$/i.test(v)) return '#' + [...v.slice(1)].map((x) => x + x).join('').toLowerCase(); return '#9aa5b1'; };

// ---- reading the projection's SVG -------------------------------------------------------------------------------
/** The affine [a b c d e f] of an SVG transform list (translate, scale, matrix). */
function affineOf(text) {
  let m = [1, 0, 0, 1, 0, 0];
  const mul = ([a, b, c, d, e, f], [A, B, C, D, E, F]) => [a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f];
  for (const [, op, args] of String(text ?? '').matchAll(/(translate|scale|matrix)\(([^)]*)\)/g)) {
    const n = args.trim().split(/[\s,]+/).map(Number);
    if (op === 'translate') m = mul(m, [1, 0, 0, 1, n[0] || 0, n[1] || 0]);
    else if (op === 'scale') m = mul(m, [n[0], 0, 0, n.length > 1 ? n[1] : n[0], 0, 0]);
    else if (n.length === 6) m = mul(m, n);
  }
  return m;
}
const at = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const numbers = (s) => String(s ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);

/**
 * The drawn items of a projection SVG in page units: [{id, n, shape: rect|ellipse|polygon|line|path|text, fill, ...}]
 * in drawing order, with the frame from the viewBox. `parser` is a DOMParser instance.
 */
export function readProjection(svgText, parser) {
  const items = [], frame = { w: 1000, h: 700 };
  if (!svgText) return { items, frame };
  const doc = parser.parseFromString(svgText, 'image/svg+xml'), svg = doc.documentElement;
  const box = numbers(svg?.getAttribute?.('viewBox'));
  if (box.length === 4 && box[2] > 0 && box[3] > 0) { frame.w = box[2]; frame.h = box[3]; }
  const count = new Map();
  for (const g of svg?.children ?? []) {
    const id = g.getAttribute('data-select') ?? '', m = affineOf(g.getAttribute('transform')), el = g.firstElementChild;
    if (!el) continue;
    const n = count.get(id) ?? 0; count.set(id, n + 1);
    const sx = Math.hypot(m[0], m[1]), sy = Math.hypot(m[2], m[3]), fill = el.getAttribute('fill'), stroke = el.getAttribute('stroke');
    // opacity: a shadow or a side face the projection states as translucent (drawn as one flat wash).
    const opacity = Number(el.getAttribute('opacity') ?? 1), base = { id, n, fill: cssHex(fill && fill !== 'none' ? fill : stroke), ...(opacity < 1 ? { alpha: opacity } : {}) };
    const tag = el.tagName.toLowerCase(), num = (k) => Number(el.getAttribute(k) ?? 0);
    if (tag === 'rect') {
      const [x0, y0] = at(m, num('x'), num('y')), [x1, y1] = at(m, num('x') + num('width'), num('y') + num('height'));
      items.push({ ...base, shape: 'rect', x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
    } else if (tag === 'ellipse' || tag === 'circle') {
      const [cx, cy] = at(m, num('cx'), num('cy')), rx = tag === 'circle' ? num('r') : num('rx'), ry = tag === 'circle' ? num('r') : num('ry');
      items.push({ ...base, shape: 'ellipse', cx, cy, w: 2 * rx * sx, h: 2 * ry * sy });
    } else if (tag === 'polygon' || tag === 'polyline') {
      const raw = numbers(el.getAttribute('points')), pts = [];
      for (let i = 0; i + 1 < raw.length; i += 2) pts.push(at(m, raw[i], raw[i + 1]));
      if (pts.length) items.push({ ...base, shape: tag === 'polygon' ? 'polygon' : 'line', pts, stroke: Number(el.getAttribute('stroke-width') ?? 2) * (sx + sy) / 2 });
    } else if (tag === 'path') {
      // An arc as the projection writes it: M x y A rx ry 0 large sweep x y.
      const d = String(el.getAttribute('d') ?? ''), mv = /M\s*([-\d.]+)[\s,]+([-\d.]+)/.exec(d), ar = /A\s*([-\d.]+)[\s,]+([-\d.]+)[\s,]+([-\d.]+)[\s,]+([01])[\s,]+([01])[\s,]+([-\d.]+)[\s,]+([-\d.]+)/.exec(d);
      if (!mv || !ar) continue;
      const [x0, y0] = at(m, Number(mv[1]), Number(mv[2])), [x1, y1] = at(m, Number(ar[6]), Number(ar[7])), flip = m[0] * m[3] - m[1] * m[2] < 0;
      const sweep = flip ? 1 - Number(ar[5]) : Number(ar[5]);
      items.push({ ...base, shape: 'path', d: `M${x0} ${y0} A${Number(ar[1]) * sx} ${Number(ar[2]) * sy} ${ar[3]} ${ar[4]} ${sweep} ${x1} ${y1}`, stroke: Number(el.getAttribute('stroke-width') ?? 2) * (sx + sy) / 2 });
    } else if (tag === 'text') {
      const [x, y] = at(m, num('x'), num('y'));
      items.push({ ...base, shape: 'text', x, y, text: el.textContent ?? '', size: Number(el.getAttribute('font-size') ?? 14) * sy, anchor: el.getAttribute('text-anchor') ?? 'start', weight: el.getAttribute('font-weight') ?? '500' });
    }
  }
  return { items, frame };
}

/** The box [x0, y0, x1, y1] an item covers. */
export function itemBox(it) {
  if (it.shape === 'rect') return [it.x, it.y, it.x + it.w, it.y + it.h];
  if (it.shape === 'ellipse') return [it.cx - it.w / 2, it.cy - it.h / 2, it.cx + it.w / 2, it.cy + it.h / 2];
  if (it.pts) { const xs = it.pts.map((p) => p[0]), ys = it.pts.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; }
  if (it.shape === 'path') { const n = numbers(it.d.replace(/[MA]/g, ' ')); return [Math.min(n[0], n[7]) , Math.min(n[1], n[8]) - n[3], Math.max(n[0], n[7]), Math.max(n[1], n[8]) + n[3]]; }
  return [it.x, it.y - (it.size ?? 14), it.x, it.y];
}

// ---- rough drawing -------------------------------------------------------------------------------------------
export function createRenderer(rough) {
  const gen = rough.generator();
  const cache = new Map();   // item signature -> [{ drawable, alpha }]

  /** Rough drawables of one item, in page units. `scale` is the size of its object (crayon strength and line widths). */
  function drawablesOf(it, scale) {
    const key = JSON.stringify(it) + '|' + Math.round(scale);
    const hit = cache.get(key); if (hit) return hit;
    const S = scale, out = [], seed = (hash(`${it.id}:${it.n}`) % 2147483000) + 1;
    const common = { seed, roughness: clamp(S / 230, 0.45, 1.35), bowing: 1.1, preserveVertices: false };
    const baseW = clamp(S * 0.013, 1.5, 4.2);
    const make = (o) => {
      switch (it.shape) {
        case 'rect': return gen.rectangle(it.x, it.y, it.w, it.h, o);
        case 'ellipse': return gen.ellipse(it.cx, it.cy, it.w, it.h, o);
        case 'polygon': return gen.polygon(it.pts, o);
        case 'line': return gen.linearPath(it.pts, o);
        case 'path': return gen.path(it.d, o);
        default: return null;
      }
    };
    const push = (drawable, alpha = 1) => { if (drawable) out.push({ drawable, alpha }); };
    if (it.alpha !== undefined && it.shape !== 'line' && it.shape !== 'path' && it.shape !== 'text') push(make({ ...common, roughness: common.roughness * 0.6, stroke: 'none', fill: it.fill, fillStyle: 'solid' }), it.alpha);
    else if (it.shape === 'line' || it.shape === 'path') push(make({ ...common, stroke: it.fill, strokeWidth: Math.max(baseW, Math.min(it.stroke ?? 2, 8), 2), fill: undefined }));
    else if (it.shape !== 'text') {
      const [x0, y0, x1, y1] = itemBox(it), tiny = Math.min(x1 - x0, y1 - y0) < 26;
      // a page-wide area (the sky or the ground of a view): a soft wash with light strokes and no outline
      if (x1 - x0 >= 900) { push(make({ ...common, roughness: 0.4, stroke: 'none', fill: it.fill, fillStyle: 'solid' })); push(make({ ...common, stroke: 'none', fill: shadeHex(it.fill, -0.04, 0), fillStyle: 'hachure', fillWeight: 1, hachureGap: 14, hachureAngle: -38 }), 0.35); }
      else if (tiny) push(make({ ...common, stroke: OUTLINE, strokeWidth: baseW, fill: it.fill, fillStyle: 'solid' }));
      else {
        // crayon: a soft tinted base, then scribbled strokes of the colour, then the outline
        push(make({ ...common, stroke: 'none', fill: shadeHex(it.fill, 0.12, -0.05), fillStyle: 'solid' }), 0.9);
        push(make({ ...common, stroke: OUTLINE, strokeWidth: baseW, fill: it.fill, fillStyle: 'hachure', fillWeight: clamp(S * 0.012, 1.1, 3.2), hachureGap: clamp(S * 0.03, 3.2, 8), hachureAngle: -38 + (seed % 25) }));
      }
    }
    cache.set(key, out);
    if (cache.size > 1500) cache.delete(cache.keys().next().value);
    return out;
  }

  const textFont = (it) => `${it.weight === '600' ? 600 : 500} ${Math.max(12, Math.round((it.size ?? 14) * 1.25))}px system-ui`;

  /** One item on a canvas 2d context (already in page units). */
  function drawItem(ctx, rc, it, scale, alpha = 1) {
    if (it.shape === 'text') {
      ctx.save(); ctx.globalAlpha = alpha; ctx.font = textFont(it); ctx.fillStyle = '#263646';
      ctx.textAlign = it.anchor === 'middle' ? 'center' : it.anchor === 'end' ? 'right' : 'left'; ctx.fillText(it.text, it.x, it.y); ctx.restore();
      return;
    }
    for (const { drawable, alpha: a } of drawablesOf(it, scale)) { ctx.save(); ctx.globalAlpha = alpha * a; rc.draw(drawable); ctx.restore(); }
  }

  /** Standalone SVG text of the items (no selection frame). `doc` is the DOM document. */
  function toSVG(items, frame, scaleOf, doc = document) {
    const NS = 'http://www.w3.org/2000/svg', svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('xmlns', NS); svg.setAttribute('viewBox', `0 0 ${frame.w} ${frame.h}`); svg.setAttribute('width', frame.w); svg.setAttribute('height', frame.h);
    const rs = rough.svg(svg), paper = doc.createElementNS(NS, 'rect');
    for (const [k, v] of Object.entries({ x: 0, y: 0, width: frame.w, height: frame.h, fill: PAPER })) paper.setAttribute(k, v);
    svg.append(paper);
    for (const it of items) {
      const g = doc.createElementNS(NS, 'g'); g.setAttribute('data-id', it.id);
      if (it.shape === 'text') {
        const t = doc.createElementNS(NS, 'text'); t.textContent = it.text;
        for (const [k, v] of Object.entries({ x: it.x, y: it.y, 'text-anchor': it.anchor, 'font-family': 'system-ui', 'font-size': Math.max(12, Math.round((it.size ?? 14) * 1.25)), fill: '#263646' })) t.setAttribute(k, v);
        g.append(t);
      } else for (const { drawable, alpha } of drawablesOf(it, scaleOf(it.id))) { const n = rs.draw(drawable); n.setAttribute('opacity', alpha); g.append(n); }
      svg.append(g);
    }
    return new (doc.defaultView?.XMLSerializer ?? XMLSerializer)().serializeToString(svg);
  }

  return { drawItem, drawablesOf, toSVG, gen };
}
