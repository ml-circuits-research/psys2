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

function shapeSvg(box, shape, fill, points, orient) {
  const solid = `fill="${fill}"`;
  const stroke = `fill="none" stroke="${fill}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  switch (shape) {
    case 'rectangle': case 'square': return `<rect x="${f1(box.x)}" y="${f1(box.y)}" width="${f1(box.w)}" height="${f1(box.h)}" ${solid}/>`;
    case 'circle': case 'oval': return `<ellipse cx="${f1(box.x + box.w / 2)}" cy="${f1(box.y + box.h / 2)}" rx="${f1(box.w / 2)}" ry="${f1(box.h / 2)}" ${solid}/>`;
    case 'triangle': return `<polygon points="${pts(triangle(box, orient.pointing))}" ${solid}/>`;
    case 'polygon': return points.length ? `<polygon points="${pts(points)}" ${solid}/>` : '';
    case 'line': return points.length ? `<polyline points="${pts(points)}" ${stroke}/>` : '';
    case 'arc': return `<path d="${arc(box, orient.opens)}" ${stroke}/>`;
    default: return '';
  }
}

/**
 * world: a sopworld World holding the projection's facts. types: the fact type names of the projection
 * ({ draw, fill, point, orient }). frame: { w, h } of the drawing. Returns SVG text.
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
  const draws = world.ofType(types.draw).map((fact) => ({ fact, order: num(fact, 'order'), z: num(fact, 'z'), side: val(fact, 'side') }))
    .sort((a, b) => a.order - b.order || (a.side === b.side ? 0 : a.side === 'left' ? -1 : 1) || a.z - b.z);
  const out = draws.map(({ fact, side }) => {
    const source = fact.attrs.source[0], part = fact.attrs.part?.[0] ?? '';
    const fill = val(fills.get(source + '|' + part)?.[0] ?? { attrs: { fill: ['grey'] } }, 'fill');
    const box = { x: num(fact, 'x'), y: num(fact, 'y'), w: num(fact, 'w'), h: num(fact, 'h') };
    const shape = val(fact, 'shape'), line = (points.get(source) ?? []).sort((a, b) => a[0] - b[0]).map(([, x, y]) => [x, y]);
    const move = `translate(${f1(num(fact, 'tx'))} ${f1(num(fact, 'ty'))}) scale(${f1(num(fact, 'scale'))}) translate(${f1(-num(fact, 'cx'))} ${f1(-num(fact, 'cy'))})`;
    const flip = side === 'right' ? `matrix(-1 0 0 1 ${frame.w} 0) ` : '';
    const tag = opts.select && fact.attrs[opts.select] ? ` data-select="${String(val(fact, opts.select)).replace(/[<>&"]/g, '')}"` : '';
    return `<g transform="${flip}${move}"${tag}>${shapeSvg(box, shape, fill, line, orients.get(source) ?? {})}</g>`;
  });
  const size = opts.size ? ` width="${opts.size}" height="${f1((opts.size * frame.h) / frame.w)}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${frame.w} ${frame.h}"${size}>${out.join('')}</svg>`;
}
