// SPDX-License-Identifier: AGPL-3.0-only
// Draws primitive facts as SVG, exactly as stated. The facts come from a world's declared projection rules
// (for the avatar: worlds/ui.avatar/render-projection.sop): shape, box, z order, transform, fill, points and
// orientation. This module decides nothing about what is drawn; it knows only how to draw each shape.
// Browser-safe: no imports.

const f1 = (n) => Math.round(Number(n) * 100) / 100;
const val = (fact, key) => {
  const raw = fact.attrs[key]?.[0];
  return typeof raw === 'string' && raw.startsWith('"') ? JSON.parse(raw) : raw;
};
const num = (fact, key) => Number(val(fact, key));
const pts = (list) => list.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ');

const triangle = ({ x, y, w, h }, pointing = 'up') => ({
  up: [[x + w / 2, y], [x + w, y + h], [x, y + h]], down: [[x, y], [x + w, y], [x + w / 2, y + h]],
  left: [[x, y + h / 2], [x + w, y], [x + w, y + h]], right: [[x + w, y + h / 2], [x, y], [x, y + h]],
}[pointing]);
const arc = ({ x, y, w, h }, opens = 'up') => ({
  up: `M${f1(x)} ${f1(y)} A${f1(w / 2)} ${f1(h)} 0 0 0 ${f1(x + w)} ${f1(y)}`, down: `M${f1(x)} ${f1(y + h)} A${f1(w / 2)} ${f1(h)} 0 0 1 ${f1(x + w)} ${f1(y + h)}`,
  left: `M${f1(x)} ${f1(y)} A${f1(w)} ${f1(h / 2)} 0 0 1 ${f1(x)} ${f1(y + h)}`, right: `M${f1(x + w)} ${f1(y)} A${f1(w)} ${f1(h / 2)} 0 0 0 ${f1(x + w)} ${f1(y + h)}`,
}[opens]);

// Optional styling a projection may state on a draw fact: outline (a colour drawn around a solid shape), round (the
// corner radius of a rectangle), stroke (the width of a line or outline), dash (a line's dash pattern, numbers only),
// anchor (start, middle or end of a text), font, weight (a text's size and weight), slant (italic), family (mono: a
// monospaced face), length (the width a text is set to, so its characters fall where a projection placed them) and
// opacity (0 to 1: a shadow, a side face) and effect (shadow: a soft shadow under the shape; glow: a halo of its
// outline colour round it).
// A typeface (face: the one a host uses when it has it; generic: the CSS family it falls back to, from k.styles.font)
// replaces the default family; paint (a pattern or gradient paint server's url) replaces the fill of a solid shape.
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy']);
const esc = (v) => String(v).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
function shapeSvg(box, shape, fill, points, orient, text, style = {}) {
  const width = Number.isFinite(style.stroke) && style.stroke > 0 ? f1(style.stroke) : 2;
  const outline = typeof style.outline === 'string' && /^#[0-9a-fA-F]{3,8}$|^[a-z]+$/.test(style.outline) ? ` stroke="${style.outline}" stroke-width="${width === 2 ? 1.5 : width}"` : '';
  const alpha = Number.isFinite(style.opacity) && style.opacity >= 0 && style.opacity < 1 ? ` opacity="${f1(style.opacity)}"` : '';
  const glow = typeof style.outline === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(style.outline) ? style.outline : '#f5b700';
  const effect = style.effect === 'shadow' ? ' style="filter:drop-shadow(2px 3px 2px rgba(0,0,0,0.35))"' : style.effect === 'glow' ? ` style="filter:drop-shadow(0 0 5px ${glow})"` : '';
  const solid = `fill="${style.paint ?? fill}"${outline}${alpha}${effect}`;
  const dash = typeof style.dash === 'string' && /^[\d. ]+$/.test(style.dash) ? ` stroke-dasharray="${style.dash}"` : '';
  const stroke = `fill="none" stroke="${fill}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${dash}${alpha}`;
  const round = Number.isFinite(style.round) && style.round > 0 ? ` rx="${f1(style.round)}"` : '';
  const anchor = ['start', 'middle', 'end'].includes(style.anchor) ? ` text-anchor="${style.anchor}"` : '';
  const font = Number.isFinite(style.font) && style.font > 0 ? f1(style.font) : 14, weight = style.weight === 'bold' ? ' font-weight="600"' : '';
  const slant = style.slant === 'italic' ? ' font-style="italic"' : '', family = GENERIC.has(style.generic) ? (typeof style.face === 'string' && style.face ? `&quot;${esc(style.face).replace(/&quot;/g, '')}&quot;,` : '') + style.generic : style.family === 'mono' ? 'ui-monospace,SFMono-Regular,Menlo,Consolas,&quot;DejaVu Sans Mono&quot;,monospace' : 'system-ui,sans-serif';
  const length = Number.isFinite(style.length) && style.length > 0 ? ` textLength="${f1(style.length)}" lengthAdjust="spacingAndGlyphs" xml:space="preserve"` : '';
  switch (shape) {
    case 'rectangle': case 'square': return `<rect x="${f1(box.x)}" y="${f1(box.y)}" width="${f1(box.w)}" height="${f1(box.h)}"${round} ${solid}/>`;
    case 'circle': case 'oval': return `<ellipse cx="${f1(box.x + box.w / 2)}" cy="${f1(box.y + box.h / 2)}" rx="${f1(box.w / 2)}" ry="${f1(box.h / 2)}" ${solid}/>`;
    case 'triangle': return `<polygon points="${pts(triangle(box, orient.pointing))}" ${solid}/>`;
    case 'polygon': return points.length ? `<polygon points="${pts(points)}" ${solid}/>` : '';
    case 'line': return points.length ? `<polyline points="${pts(points)}" ${stroke}/>` : '';
    case 'arc': return `<path d="${arc(box, orient.opens)}" ${stroke}/>`;
    case 'text': return `<text x="${f1(box.x)}" y="${f1(box.y)}" font-size="${font}"${weight}${slant}${anchor}${length} font-family="${family}" fill="${fill}"${outline ? outline + ' paint-order="stroke"' : ''}${alpha}${effect}>${String(text ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])}</text>`;
    default: return '';
  }
}

/**
 * world: a sopworld World holding the projection's facts. types: the fact type names of the projection
 * ({ draw, fill, point, orient }, and optionally pose, style and filter, described above, and layer: facts `slot= order=` that put every draw of a slot in that
 * layer, in place of its own order: occlusion by depth). frame: { w, h } of the drawing. Returns SVG text.
 */
export function renderPrimitives(world, types, frame = { w: 100, h: 100 }, opts = {}) {
  const bySource = (type) => {
    const map = new Map();
    for (const fact of world.ofType(type)) {
      const key = fact.attrs.source[0] + '|' + (fact.attrs.part?.[0] ?? '');
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(fact);
    }
    return map;
  };
  const fills = bySource(types.fill), orients = new Map(), points = new Map();
  for (const fact of world.ofType(types.orient)) orients.set(fact.attrs.source[0], { ...orients.get(fact.attrs.source[0]), ...Object.fromEntries(['opens', 'pointing'].filter((k) => fact.attrs[k]).map((k) => [k, val(fact, k)])) });
  for (const fact of world.ofType(types.point)) {
    const list = points.get(fact.attrs.source[0]) ?? [];
    list.push([num(fact, 'n'), num(fact, 'x'), num(fact, 'y')]);
    points.set(fact.attrs.source[0], list);
  }
  // Poses (types.pose: facts `slot=` for every draw of an object, or `source= part=` for one part; x, y the centre in
  // frame units, rotate degrees clockwise, mirror none|horizontal|vertical|both, skew degrees, n the order: lower is
  // applied outside) wrap a draw's own transform; styles (types.style, keyed the same way: opacity, effect with radius,
  // dx, dy, colour and strength, pattern with gap and angle, gradient, outline, stroke, face and generic) restyle it.
  const keyed = (type) => { const out = new Map(); if (!type) return out; for (const fact of world.ofType(type)) { const key = fact.attrs.slot ? 'slot|' + fact.attrs.slot[0] : fact.attrs.source ? fact.attrs.source[0] + '|' + (fact.attrs.part?.[0] ?? '') : null; if (key) (out.get(key) ?? out.set(key, []).get(key)).push(fact); } return out; };
  const poses = keyed(types.pose), styles = keyed(types.style);
  const poseOf = (facts = []) => facts.map((fact) => ({ n: fact.attrs.n ? num(fact, 'n') : 5, x: num(fact, 'x'), y: num(fact, 'y'), rotate: fact.attrs.rotate ? num(fact, 'rotate') : 0, skew: fact.attrs.skew ? num(fact, 'skew') : 0, mirror: val(fact, 'mirror') }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)).sort((a, b) => a.n - b.n).map((p) => {
      const sx = p.mirror === 'horizontal' || p.mirror === 'both' ? -1 : 1, sy = p.mirror === 'vertical' || p.mirror === 'both' ? -1 : 1;
      if (!p.rotate && !p.skew && sx === 1 && sy === 1) return '';
      return `translate(${f1(p.x)} ${f1(p.y)})${p.rotate ? ` rotate(${f1(p.rotate)})` : ''}${p.skew ? ` skewX(${f1(p.skew)})` : ''}${sx !== 1 || sy !== 1 ? ` scale(${sx} ${sy})` : ''} translate(${f1(-p.x)} ${f1(-p.y)}) `;
    }).join('');
  const styleOf = (facts = []) => { const out = {}; for (const fact of facts) for (const key of Object.keys(fact.attrs)) if (!['slot', 'source', 'part'].includes(key)) out[key] = val(fact, key); return out; };
  const defs = new Map();
  const isColour = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
  // A paint server for a pattern (stripes, dots, checks...) or a gradient of the fill colour, declared once per look.
  const paintOf = (look, fill) => {
    const colour = isColour(fill) ? fill : '#9aa5b1';
    if (look.pattern === 'gradient') { const to = isColour(look.gradient) ? look.gradient : '#ffffff', id = `g${colour.slice(1)}${to.slice(1)}`; defs.set(id, `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${colour}"/><stop offset="1" stop-color="${to}"/></linearGradient>`); return `url(#${id})`; }
    if (!['hachure', 'dots', 'cross-hatch', 'zigzag', 'dashed'].includes(look.pattern)) return undefined;
    const gap = Number(look.gap) > 0 ? Number(look.gap) : 10, angle = Number.isFinite(Number(look.angle)) ? Number(look.angle) : -45, id = `p${look.pattern.replace(/\W/g, '')}${colour.slice(1)}${Math.round(gap)}${Math.round(angle + 180)}`;
    const mark = look.pattern === 'dots' ? `<circle cx="${f1(gap / 2)}" cy="${f1(gap / 2)}" r="${f1(gap / 4)}" fill="${colour}"/>` : look.pattern === 'cross-hatch' ? `<path d="M0 ${f1(gap / 2)}H${f1(gap)}M${f1(gap / 2)} 0V${f1(gap)}" stroke="${colour}" stroke-width="${f1(gap / 4)}"/>` : look.pattern === 'zigzag' ? `<path d="M0 ${f1(gap)}L${f1(gap / 2)} 0L${f1(gap)} ${f1(gap)}" fill="none" stroke="${colour}" stroke-width="${f1(gap / 5)}"/>` : look.pattern === 'dashed' ? `<path d="M0 ${f1(gap / 2)}H${f1(gap / 2)}" stroke="${colour}" stroke-width="${f1(gap / 4)}"/>` : `<path d="M0 ${f1(gap / 2)}H${f1(gap)}" stroke="${colour}" stroke-width="${f1(gap / 3)}"/>`;
    defs.set(id, `<pattern id="${id}" width="${f1(gap)}" height="${f1(gap)}" patternUnits="userSpaceOnUse" patternTransform="rotate(${f1(angle)})"><rect width="${f1(gap)}" height="${f1(gap)}" fill="#ffffff" opacity="0.6"/>${mark}</pattern>`);
    return `url(#${id})`;
  };
  const layers = new Map();
  if (types.layer) for (const fact of world.ofType(types.layer)) { const slot = fact.attrs.slot?.[0], order = num(fact, 'order'); if (slot !== undefined && Number.isFinite(order) && (!layers.has(slot) || order < layers.get(slot))) layers.set(slot, order); }
  const layerOf = (fact) => { const slot = opts.select ? fact.attrs[opts.select]?.[0] : undefined; return slot !== undefined && layers.has(slot) ? layers.get(slot) : num(fact, 'order'); };
  const draws = world.ofType(types.draw).map((fact) => ({ fact, order: layerOf(fact), own: num(fact, 'order'), z: num(fact, 'z'), side: val(fact, 'side') }))
    .sort((a, b) => a.order - b.order || (a.own - b.own || 0) || (a.side === b.side ? 0 : a.side === 'left' ? -1 : 1) || a.z - b.z);
  const out = draws.map(({ fact, side }) => {
    const source = fact.attrs.source[0], part = fact.attrs.part?.[0] ?? '';
    const fill = val(fills.get(source + '|' + part)?.[0] ?? { attrs: { fill: ['grey'] } }, 'fill');
    const box = { x: num(fact, 'x'), y: num(fact, 'y'), w: num(fact, 'w'), h: num(fact, 'h') };
    const shape = val(fact, 'shape'), line = (points.get(source) ?? []).sort((a, b) => a[0] - b[0]).map(([, x, y]) => [x, y]);
    const move = `translate(${f1(num(fact, 'tx'))} ${f1(num(fact, 'ty'))}) scale(${fact.attrs.sx && fact.attrs.sy ? f1(num(fact, 'sx')) + ' ' + f1(num(fact, 'sy')) : f1(num(fact, 'scale'))}) translate(${f1(-num(fact, 'cx'))} ${f1(-num(fact, 'cy'))})`;
    // A mirrored side is flipped about the frame's middle, or about the vertical line x = axis a fact states (a face
    // drawn on a page, mirrored about its own middle).
    const flip = side === 'right' ? `matrix(-1 0 0 1 ${fact.attrs.axis ? f1(2 * num(fact, 'axis')) : frame.w} 0) ` : '';
    const tag = opts.select && fact.attrs[opts.select] ? ` data-select="${String(val(fact, opts.select)).replace(/[<>&"]/g, '')}"` : '';
    const style = { outline: val(fact, 'outline'), round: num(fact, 'round'), stroke: num(fact, 'stroke'), dash: val(fact, 'dash'), anchor: val(fact, 'anchor'), font: num(fact, 'font'), weight: val(fact, 'weight'), slant: val(fact, 'slant'), family: val(fact, 'family'), face: val(fact, 'face'), generic: val(fact, 'generic'), length: num(fact, 'length'), opacity: fact.attrs.opacity ? num(fact, 'opacity') : undefined, effect: val(fact, 'effect') };
    // rotate: degrees clockwise about (rx, ry), the point a projection names (a node's centre).
    const turn = fact.attrs.rotate && num(fact, 'rotate') !== 0 ? `rotate(${f1(num(fact, 'rotate'))} ${f1(num(fact, 'rx'))} ${f1(num(fact, 'ry'))}) ` : '';
    // A draw styled pose=none (a ground shadow) keeps its place when its object turns or mirrors.
    const slot = fact.attrs.slot?.[0], own = styleOf(styles.get(source + '|' + part));
    const pose = (own.pose === 'none' ? '' : poseOf(poses.get('slot|' + slot))) + poseOf(poses.get(source + '|' + part));
    const look = { ...styleOf(styles.get('slot|' + slot)), ...own };
    if (isColour(look.outline)) style.outline = look.outline;
    if (Number(look.stroke) > 0) style.stroke = Number(look.stroke);
    if (shape === 'text') for (const key of ['face', 'generic', 'weight', 'slant', 'anchor']) if (look[key] !== undefined) style[key] = look[key];
    if (shape !== 'line' && shape !== 'arc' && shape !== 'text') style.paint = paintOf(look, fill);
    if (look.pattern === 'none' && shape !== 'line' && shape !== 'arc' && shape !== 'text') { style.paint = 'none'; style.outline ??= fill; }
    const fade = Number(look.opacity), radius = Number(look.radius) || 0, strength = Number.isFinite(Number(look.strength)) ? Number(look.strength) : 1;
    const ink = isColour(look.colour) ? look.colour : isColour(style.outline) ? style.outline : isColour(fill) ? fill : '#f5b700';
    const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${f1(a)})`;
    const css = look.effect === 'glow' ? `drop-shadow(0 0 ${f1(radius)}px ${rgba(ink, strength)})` : look.effect === 'shadow' ? `drop-shadow(${f1(Number(look.dx) || 0)}px ${f1(Number(look.dy) || 0)}px ${f1(radius)}px ${rgba(isColour(look.colour) ? look.colour : '#000000', strength)})` : look.effect === 'blur' && radius > 0 ? `blur(${f1(radius)}px)` : '';
    // What the effect is, for a renderer that draws it itself (the Drawing tab's crayon renderer).
    const data = [['effect', ['glow', 'shadow', 'blur'].includes(look.effect) ? look.effect : undefined], ['radius', radius || undefined], ['dx', look.dx], ['dy', look.dy], ['ink', ['glow', 'shadow'].includes(look.effect) ? (look.effect === 'shadow' && !isColour(look.colour) ? '#000000' : ink) : undefined], ['strength', ['glow', 'shadow'].includes(look.effect) ? strength : undefined],
      ['pattern', look.pattern], ['gap', look.gap], ['angle', look.angle], ['gradient', look.pattern === 'gradient' ? (isColour(look.gradient) ? look.gradient : '#ffffff') : undefined], ['colour', style.paint && isColour(fill) ? fill : undefined]]
      .filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => ` data-${k}="${esc(v)}"`).join('');
    const group = `${Number.isFinite(fade) && fade >= 0 && fade < 1 ? ` opacity="${f1(fade)}"` : ''}${css ? ` style="filter:${css}"` : ''}${data}`;
    return `<g transform="${pose}${flip}${turn}${move}"${tag}${group}>${shapeSvg(box, shape, fill, line, orients.get(source) ?? {}, val(fact, 'text'), style)}</g>`;
  });
  // The whole picture through a filter (types.filter: facts fn= v=, the standard picture filters, and fn=tint with a
  // colour v and an amount laid over the frame).
  const filters = types.filter ? world.ofType(types.filter).map((fact) => ({ fn: val(fact, 'fn'), v: val(fact, 'v'), amount: fact.attrs.amount ? num(fact, 'amount') : undefined })) : [];
  const UNIT = { sepia: '', grayscale: '', invert: '', brightness: '', contrast: '', saturate: '', hue: 'deg', blur: 'px' };
  const filterCss = filters.filter((f) => Object.hasOwn(UNIT, f.fn) && Number.isFinite(Number(f.v))).sort((a, b) => Object.keys(UNIT).indexOf(a.fn) - Object.keys(UNIT).indexOf(b.fn))
    .map((f) => `${f.fn === 'hue' ? 'hue-rotate' : f.fn}(${f1(Number(f.v))}${UNIT[f.fn]})`).join(' ');
  const tint = filters.find((f) => f.fn === 'tint' && isColour(f.v) && f.amount > 0);
  if (tint) out.push(`<rect data-tint="true" x="0" y="0" width="${frame.w}" height="${frame.h}" fill="${tint.v}" opacity="${f1(Math.min(1, tint.amount))}"/>`);
  const size = opts.size ? ` width="${opts.size}" height="${f1((opts.size * frame.h) / frame.w)}"` : '';
  // What lies outside the frame is not shown (the Avatar frames a whole person on the face).
  const head = defs.size ? `<defs>${[...defs.values()].join('')}</defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${frame.w} ${frame.h}" overflow="hidden"${size}${filterCss ? ` style="filter:${filterCss}"` : ''}>${head}${out.join('')}</svg>`;
}
