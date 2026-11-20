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
  for (const [, op, args] of String(text ?? '').matchAll(/(translate|scale|matrix|rotate|skewX|skewY)\(([^)]*)\)/g)) {
    const n = args.trim().split(/[\s,]+/).map(Number), rad = (n[0] || 0) * Math.PI / 180;
    if (op === 'translate') m = mul(m, [1, 0, 0, 1, n[0] || 0, n[1] || 0]);
    else if (op === 'scale') m = mul(m, [n[0], 0, 0, n.length > 1 ? n[1] : n[0], 0, 0]);
    else if (op === 'rotate') { const [cx, cy] = [n[1] || 0, n[2] || 0]; m = mul(mul(mul(m, [1, 0, 0, 1, cx, cy]), [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0]), [1, 0, 0, 1, -cx, -cy]); }
    else if (op === 'skewX') m = mul(m, [1, 0, Math.tan(rad), 1, 0, 0]);
    else if (op === 'skewY') m = mul(m, [1, Math.tan(rad), 0, 1, 0, 0]);
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
  // The filter the whole picture is shown through (CSS filter functions on the root) and a tint laid over it.
  const filter = /filter:\s*([^;"]+)/.exec(svg?.getAttribute?.('style') ?? '')?.[1]?.trim();
  if (filter) frame.filter = filter;
  const count = new Map();
  for (const g of svg?.children ?? []) {
    if (g.tagName.toLowerCase() === 'rect' && g.getAttribute('data-tint') === 'true') { frame.tint = { fill: cssHex(g.getAttribute('fill')), alpha: Number(g.getAttribute('opacity') ?? 0.3) }; continue; }
    const id = g.getAttribute('data-select') ?? '', m = affineOf(g.getAttribute('transform')), el = g.firstElementChild;
    if (!el || g.tagName.toLowerCase() !== 'g') continue;
    const n = count.get(id) ?? 0; count.set(id, n + 1);
    const sx = Math.hypot(m[0], m[1]), sy = Math.hypot(m[2], m[3]), fill = el.getAttribute('fill'), stroke = el.getAttribute('stroke');
    // opacity: a shadow or a side face the projection states as translucent (drawn as one flat wash); the group's own
    // opacity (an object made see-through) fades the crayon drawing as it is. An effect (glow, shadow, blur) and a fill
    // pattern or gradient are stated on the group (data-*); a turned or leaning group draws boxes and ovals as outlines.
    const opacity = Number(el.getAttribute('opacity') ?? 1), fade = Number(g.getAttribute('opacity') ?? 1), d = (k) => g.getAttribute('data-' + k);
    const effect = ['glow', 'shadow', 'blur'].includes(d('effect')) ? { kind: d('effect'), radius: Number(d('radius') ?? 0), dx: Number(d('dx') ?? 0), dy: Number(d('dy') ?? 0), ink: d('ink') ?? '#f5b700', strength: Number(d('strength') ?? 1) } : null;
    const pattern = d('pattern') ? { kind: d('pattern'), gap: Number(d('gap') ?? 0) || undefined, angle: d('angle') !== null ? Number(d('angle')) : undefined, to: d('gradient') ?? undefined } : null;
    const paint = fill && !fill.startsWith('url(') ? fill : null;
    const base = { id, n, fill: cssHex(paint && paint !== 'none' ? paint : stroke), ...(opacity < 1 ? { alpha: opacity } : {}), ...(fade < 1 ? { fade } : {}), ...(effect ? { effect } : {}), ...(pattern ? { pattern } : {}) };
    if (pattern && fill?.startsWith('url(')) base.fill = cssHex(d('colour') ?? stroke ?? '#9aa5b1');
    if (pattern?.kind === 'none') base.fill = cssHex(stroke);
    const tag = el.tagName.toLowerCase(), num = (k) => Number(el.getAttribute(k) ?? 0), skewed = Math.abs(m[1]) > 1e-9 || Math.abs(m[2]) > 1e-9;
    const outline = (pts) => items.push({ ...base, shape: 'polygon', pts });
    if (skewed && (tag === 'rect' || tag === 'ellipse' || tag === 'circle')) {
      if (tag === 'rect') { const x = num('x'), y = num('y'), w = num('width'), h = num('height'); outline([[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([px, py]) => at(m, px, py))); }
      else { const cx = num('cx'), cy = num('cy'), rx = tag === 'circle' ? num('r') : num('rx'), ry = tag === 'circle' ? num('r') : num('ry'); outline(Array.from({ length: 36 }, (_, i) => at(m, cx + rx * Math.cos(i * Math.PI / 18), cy + ry * Math.sin(i * Math.PI / 18)))); }
    } else if (tag === 'rect') {
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
      const sweep = flip ? 1 - Number(ar[5]) : Number(ar[5]), turn = Math.atan2(m[1], m[0]) * 180 / Math.PI;
      items.push({ ...base, shape: 'path', d: `M${x0} ${y0} A${Number(ar[1]) * sx} ${Number(ar[2]) * sy} ${(Number(ar[3]) + turn).toFixed(2)} ${ar[4]} ${sweep} ${x1} ${y1}`, stroke: Number(el.getAttribute('stroke-width') ?? 2) * (sx + sy) / 2 });
    } else if (tag === 'text') {
      // Writing keeps its typeface, weight, slant, colour, outline and the width it is set to, turned and mirrored as
      // the group is (angle, mirror).
      const [x, y] = at(m, num('x'), num('y')), det = m[0] * m[3] - m[1] * m[2];
      items.push({ ...base, shape: 'text', x, y, text: el.textContent ?? '', size: Number(el.getAttribute('font-size') ?? 14) * sy, anchor: el.getAttribute('text-anchor') ?? 'start', weight: el.getAttribute('font-weight') ?? '500',
        family: el.getAttribute('font-family') ?? 'system-ui', italic: el.getAttribute('font-style') === 'italic', ink: cssHex(fill), ...(el.getAttribute('stroke') ? { line: cssHex(el.getAttribute('stroke')), lineWidth: Number(el.getAttribute('stroke-width') ?? 1.5) } : {}),
        ...(el.getAttribute('textLength') ? { length: Number(el.getAttribute('textLength')) * sx } : {}), angle: Math.atan2(m[1], m[0]) * 180 / Math.PI, mirror: det < 0 });
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
      else if (it.pattern && it.pattern.kind !== 'hachure' || it.pattern?.gap) {
        // a declared fill (k.styles.fill): one even colour, only the outline, a gradient (its base painted by drawItem),
        // or strokes, dots, checks, zigzags or dashes of the colour at the declared gap and angle
        const p = it.pattern, gap = p.gap ? clamp(p.gap * S / 160, 3, 40) : clamp(S * 0.04, 4, 12), angle = Number.isFinite(p.angle) ? p.angle : -45;
        if (p.kind === 'solid' || p.kind === 'gradient') push(make({ ...common, stroke: OUTLINE, strokeWidth: baseW, fill: p.kind === 'solid' ? it.fill : undefined, fillStyle: 'solid' }));
        else if (p.kind === 'none') push(make({ ...common, stroke: it.fill, strokeWidth: baseW * 1.4, fill: undefined }));
        else {
          push(make({ ...common, stroke: 'none', fill: shadeHex(it.fill, 0.3, -0.1), fillStyle: 'solid' }), 0.7);
          push(make({ ...common, stroke: OUTLINE, strokeWidth: baseW, fill: it.fill, fillStyle: p.kind, fillWeight: clamp(S * 0.014, 1.2, 4), hachureGap: gap, hachureAngle: angle, dashGap: gap / 2, dashOffset: gap / 2, zigzagOffset: gap / 2 }));
        }
      } else {
        // crayon: a soft tinted base, then scribbled strokes of the colour, then the outline
        push(make({ ...common, stroke: 'none', fill: shadeHex(it.fill, 0.12, -0.05), fillStyle: 'solid' }), 0.9);
        push(make({ ...common, stroke: OUTLINE, strokeWidth: baseW, fill: it.fill, fillStyle: 'hachure', fillWeight: clamp(S * 0.012, 1.1, 3.2), hachureGap: clamp(S * 0.03, 3.2, 8), hachureAngle: -38 + (seed % 25) }));
      }
    }
    cache.set(key, out);
    if (cache.size > 1500) cache.delete(cache.keys().next().value);
    return out;
  }

  // Labels keep the board's own lettering; writing set to a width (a text object) is drawn as stated: its typeface,
  // weight, slant, colour, outline, turn and the width its words fill.
  const written = (it) => it.length > 0;
  const textFont = (it) => written(it) ? `${it.italic ? 'italic ' : ''}${it.weight === '600' || it.weight === 'bold' ? 700 : 400} ${Math.max(4, it.size ?? 14)}px ${it.family ?? 'system-ui'}` : `${it.weight === '600' ? 600 : 500} ${Math.max(12, Math.round((it.size ?? 14) * 1.25))}px system-ui`;
  // An effect on a canvas: a glow or a shadow as the context's shadow, a blur as its filter.
  function applyEffect(ctx, it) {
    const e = it.effect; if (!e) return;
    if (e.kind === 'blur') { ctx.filter = `blur(${Math.max(0.3, e.radius)}px)`; return; }
    const m = /^#?([0-9a-f]{6})$/i.exec(e.ink ?? ''), n = m ? parseInt(m[1], 16) : 0xf5b700;
    ctx.shadowColor = `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${clamp(e.strength ?? 1, 0, 1)})`; ctx.shadowBlur = Math.max(1, e.radius * (e.kind === 'glow' ? 1.6 : 1));
    ctx.shadowOffsetX = e.kind === 'shadow' ? e.dx : 0; ctx.shadowOffsetY = e.kind === 'shadow' ? e.dy : 0;
  }
  // A gradient base: the shape's outline filled with the colour fading into the declared second colour, top to bottom.
  function paintGradient(ctx, it) {
    const [x0, y0, x1, y1] = itemBox(it), g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, it.fill); g.addColorStop(1, cssHex(it.pattern?.to ?? '#ffffff'));
    const o = { roughness: 0, fill: '#000000', fillStyle: 'solid', stroke: 'none' };
    const shape = it.shape === 'rect' ? gen.rectangle(it.x, it.y, it.w, it.h, o) : it.shape === 'ellipse' ? gen.ellipse(it.cx, it.cy, it.w, it.h, o) : it.pts ? gen.polygon(it.pts, o) : null;
    if (!shape) return;
    ctx.save(); ctx.fillStyle = g; for (const p of gen.toPaths(shape)) if (p.fill && p.fill !== 'none') ctx.fill(new Path2D(p.d)); ctx.restore();
    void x0; void x1;
  }

  /** One item on a canvas 2d context (already in page units). */
  function drawItem(ctx, rc, it, scale, alpha = 1) {
    const fade = it.fade ?? 1;
    if (it.shape === 'text') {
      ctx.save(); ctx.globalAlpha = alpha * fade; applyEffect(ctx, it); ctx.font = textFont(it); ctx.fillStyle = written(it) ? it.ink ?? '#263646' : '#263646';
      ctx.textAlign = it.anchor === 'middle' ? 'center' : it.anchor === 'end' ? 'right' : 'left';
      ctx.translate(it.x, it.y); if (it.angle) ctx.rotate(it.angle * Math.PI / 180); if (it.mirror) ctx.scale(-1, 1);
      if (written(it)) { const w = ctx.measureText(it.text).width; if (w > 0) ctx.scale(it.length / w, 1); }
      if (it.line) { ctx.lineWidth = it.lineWidth * 2; ctx.strokeStyle = it.line; ctx.lineJoin = 'round'; ctx.strokeText(it.text, 0, 0); }
      ctx.fillText(it.text, 0, 0); ctx.restore();
      return;
    }
    if (it.pattern?.kind === 'gradient') { ctx.save(); ctx.globalAlpha = alpha * fade; applyEffect(ctx, it); paintGradient(ctx, it); ctx.restore(); }
    for (const { drawable, alpha: a } of drawablesOf(it, scale)) { ctx.save(); ctx.globalAlpha = alpha * a * fade; if (it.pattern?.kind !== 'gradient') applyEffect(ctx, it); rc.draw(drawable); ctx.restore(); }
  }

  /** Standalone SVG text of the items (no selection frame). `doc` is the DOM document. */
  function toSVG(items, frame, scaleOf, doc = document) {
    const NS = 'http://www.w3.org/2000/svg', svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('xmlns', NS); svg.setAttribute('viewBox', `0 0 ${frame.w} ${frame.h}`); svg.setAttribute('width', frame.w); svg.setAttribute('height', frame.h);
    const rs = rough.svg(svg), paper = doc.createElementNS(NS, 'rect');
    for (const [k, v] of Object.entries({ x: 0, y: 0, width: frame.w, height: frame.h, fill: PAPER })) paper.setAttribute(k, v);
    svg.append(paper);
    const art = doc.createElementNS(NS, 'g'); if (frame.filter) art.setAttribute('style', `filter:${frame.filter}`); svg.append(art);
    const css = (it) => { const e = it.effect; if (!e) return ''; const m = /^#?([0-9a-f]{6})$/i.exec(e.ink ?? ''), n = m ? parseInt(m[1], 16) : 0; return e.kind === 'blur' ? `filter:blur(${e.radius}px)` : `filter:drop-shadow(${e.kind === 'shadow' ? e.dx : 0}px ${e.kind === 'shadow' ? e.dy : 0}px ${e.radius}px rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${e.strength}))`; };
    for (const it of items) {
      const g = doc.createElementNS(NS, 'g'); g.setAttribute('data-id', it.id);
      if (it.fade !== undefined) g.setAttribute('opacity', it.fade);
      if (it.effect) g.setAttribute('style', css(it));
      if (it.shape === 'text') {
        const t = doc.createElementNS(NS, 'text'); t.textContent = it.text;
        const attrs = written(it) ? { x: 0, y: 0, 'text-anchor': it.anchor, 'font-family': it.family, 'font-size': it.size, 'font-weight': it.weight === '600' ? 700 : 400, 'font-style': it.italic ? 'italic' : 'normal', fill: it.ink, textLength: it.length, lengthAdjust: 'spacingAndGlyphs', transform: `translate(${it.x} ${it.y}) rotate(${it.angle ?? 0})${it.mirror ? ' scale(-1 1)' : ''}`, ...(it.line ? { stroke: it.line, 'stroke-width': it.lineWidth, 'paint-order': 'stroke' } : {}) }
          : { x: it.x, y: it.y, 'text-anchor': it.anchor, 'font-family': 'system-ui', 'font-size': Math.max(12, Math.round((it.size ?? 14) * 1.25)), fill: '#263646' };
        for (const [k, v] of Object.entries(attrs)) t.setAttribute(k, v);
        g.append(t);
      } else for (const { drawable, alpha } of drawablesOf(it, scaleOf(it.id))) { const n = rs.draw(drawable); n.setAttribute('opacity', alpha); g.append(n); }
      art.append(g);
    }
    if (frame.tint) { const t = doc.createElementNS(NS, 'rect'); for (const [k, v] of Object.entries({ x: 0, y: 0, width: frame.w, height: frame.h, fill: frame.tint.fill, opacity: frame.tint.alpha })) t.setAttribute(k, v); svg.append(t); }
    return new (doc.defaultView?.XMLSerializer ?? XMLSerializer)().serializeToString(svg);
  }

  /** The picture's filter and tint on a canvas: the filter before the items are drawn, the tint after. */
  const beginFrame = (ctx, frame) => { ctx.filter = frame.filter ?? 'none'; };
  const endFrame = (ctx, frame) => { ctx.filter = 'none'; if (frame.tint) { ctx.save(); ctx.globalAlpha = frame.tint.alpha; ctx.fillStyle = frame.tint.fill; ctx.fillRect(0, 0, frame.w, frame.h); ctx.restore(); } };

  return { drawItem, drawablesOf, toSVG, gen, beginFrame, endFrame };
}
