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
function shapeSvg(box, shape, fill, points, orient, text, style = {}) {
  const width = Number.isFinite(style.stroke) && style.stroke > 0 ? f1(style.stroke) : 2;
  const outline = typeof style.outline === 'string' && /^#[0-9a-fA-F]{3,8}$|^[a-z]+$/.test(style.outline) ? ` stroke="${style.outline}" stroke-width="${width === 2 ? 1.5 : width}"` : '';
  const alpha = Number.isFinite(style.opacity) && style.opacity >= 0 && style.opacity < 1 ? ` opacity="${f1(style.opacity)}"` : '';
  const glow = typeof style.outline === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(style.outline) ? style.outline : '#f5b700';
  const effect = style.effect === 'shadow' ? ' style="filter:drop-shadow(2px 3px 2px rgba(0,0,0,0.35))"' : style.effect === 'glow' ? ` style="filter:drop-shadow(0 0 5px ${glow})"` : '';
  const solid = `fill="${fill}"${outline}${alpha}${effect}`;
  const dash = typeof style.dash === 'string' && /^[\d. ]+$/.test(style.dash) ? ` stroke-dasharray="${style.dash}"` : '';
  const stroke = `fill="none" stroke="${fill}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${dash}${alpha}`;
  const round = Number.isFinite(style.round) && style.round > 0 ? ` rx="${f1(style.round)}"` : '';
  const anchor = ['start', 'middle', 'end'].includes(style.anchor) ? ` text-anchor="${style.anchor}"` : '';
  const font = Number.isFinite(style.font) && style.font > 0 ? f1(style.font) : 14, weight = style.weight === 'bold' ? ' font-weight="600"' : '';
  const slant = style.slant === 'italic' ? ' font-style="italic"' : '', family = style.family === 'mono' ? 'ui-monospace,SFMono-Regular,Menlo,Consolas,&quot;DejaVu Sans Mono&quot;,monospace' : 'system-ui,sans-serif';
  const length = Number.isFinite(style.length) && style.length > 0 ? ` textLength="${f1(style.length)}" lengthAdjust="spacingAndGlyphs" xml:space="preserve"` : '';
  switch (shape) {
    case 'rectangle': case 'square': return `<rect x="${f1(box.x)}" y="${f1(box.y)}" width="${f1(box.w)}" height="${f1(box.h)}"${round} ${solid}/>`;
    case 'circle': case 'oval': return `<ellipse cx="${f1(box.x + box.w / 2)}" cy="${f1(box.y + box.h / 2)}" rx="${f1(box.w / 2)}" ry="${f1(box.h / 2)}" ${solid}/>`;
    case 'triangle': return `<polygon points="${pts(triangle(box, orient.pointing))}" ${solid}/>`;
    case 'polygon': return points.length ? `<polygon points="${pts(points)}" ${solid}/>` : '';
    case 'line': return points.length ? `<polyline points="${pts(points)}" ${stroke}/>` : '';
    case 'arc': return `<path d="${arc(box, orient.opens)}" ${stroke}/>`;
    case 'text': return `<text x="${f1(box.x)}" y="${f1(box.y)}" font-size="${font}"${weight}${slant}${anchor}${length} font-family="${family}" fill="${fill}">${String(text ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c])}</text>`;
    default: return '';
  }
}

/**
 * world: a sopworld World holding the projection's facts. types: the fact type names of the projection
 * ({ draw, fill, point, orient }, and optionally layer: facts `slot= order=` that put every draw of a slot in that
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
    const style = { outline: val(fact, 'outline'), round: num(fact, 'round'), stroke: num(fact, 'stroke'), dash: val(fact, 'dash'), anchor: val(fact, 'anchor'), font: num(fact, 'font'), weight: val(fact, 'weight'), slant: val(fact, 'slant'), family: val(fact, 'family'), length: num(fact, 'length'), opacity: fact.attrs.opacity ? num(fact, 'opacity') : undefined, effect: val(fact, 'effect') };
    // rotate: degrees clockwise about (rx, ry), the point a projection names (a node's centre).
    const turn = fact.attrs.rotate && num(fact, 'rotate') !== 0 ? `rotate(${f1(num(fact, 'rotate'))} ${f1(num(fact, 'rx'))} ${f1(num(fact, 'ry'))}) ` : '';
    return `<g transform="${flip}${turn}${move}"${tag}>${shapeSvg(box, shape, fill, line, orients.get(source) ?? {}, val(fact, 'text'), style)}</g>`;
  });
  const size = opts.size ? ` width="${opts.size}" height="${f1((opts.size * frame.h) / frame.w)}"` : '';
  // What lies outside the frame is not shown (the Avatar frames a whole person on the face).
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${frame.w} ${frame.h}" overflow="hidden"${size}>${out.join('')}</svg>`;
}
