// SPDX-License-Identifier: AGPL-3.0-only
// The one renderer of the avatar: draws a face from the data of `k.faces` (src/knowledge/faces.mjs) the way the catalog describes it (its WORLD.md "How a face is drawn"):
// slot after slot in the order of the slots, the parts of the chosen variant in the order of their own z, each part with the colour its `tint` names (else its own rgb or
// colour name); a slot with `mirror` is drawn a second time flipped at x = 50 (pointing and opens swapped). The Avatar tab, the header avatar, the thumbnails of the
// variants and the contact sheet of the probe all use this function: SVG text, crisp at any size. Browser-safe: no imports.
//
//   renderFace(data, face, { size, over, bg, label })   face: the state of ui.avatar (state.face): { slots, colours, paint, adj, expression }
//   variantSvg(data, face, slot, variant, { size })     a small picture of one variant in its place on the face

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
const f1 = (n) => Math.round(n * 100) / 100;
const esc = (t) => String(t).replace(/[<>&"]/g, ' ');
const SWAP = { left: 'right', right: 'left', up: 'up', down: 'down' };
const NONE = 'none';

/** The variant a slot shows on one side ('left' for a single slot or the viewer's left of a pair, 'right' for its mirror). Order: `over` (a moment, such as the talking mouth), the face's expression, the chosen variant. */
export function variantFor(data, face, slotName, side = 'left', over = null) {
  const slot = data.slots.find((s) => s.name === slotName);
  if (!slot) return null;
  const e = data.expressions[face.expression ?? ''];
  const named = (o) => (o && !face.noExpression ? o[slotName] : undefined);
  let name = named(over) ?? named(e?.over) ?? face.slots?.[slotName];
  if (side === 'right' && slotName === 'eyes' && e?.oneEye && !over) name = e.oneEye;   // a wink: the eye on the viewer's right only
  if (!name || name === NONE) return null;
  return slot.variants.find((v) => v.name === name) ?? null;
}

const colourEntry = (data, of, name) => data.colours[of]?.[name] ?? Object.values(data.colours[of] ?? {})[0];

/** The colour a part is drawn with: the face colour its tint names, a colour chosen for the slot (`paint`) when the part offers it, else its own rgb or colour name. */
export function partColour(data, face, slotName, p) {
  const paint = face.paint?.[slotName];
  if (p.tint) {
    const [of, shade] = p.tint.endsWith('_shade') ? [p.tint.slice(0, -6), true] : [p.tint, false];
    const c = colourEntry(data, of, face.colours?.[of]);
    return c ? (shade ? c.shade : c.rgb) : '#888888';
  }
  if (paint && p.colour.includes(paint)) return paint;
  return p.rgb ?? p.colour[0] ?? 'grey';
}

const pts = (list) => list.map((q) => `${f1(q[0])},${f1(q[1])}`).join(' ');
const triangle = ({ x, y, w, h, pointing }) => ({
  up: [[x + w / 2, y], [x + w, y + h], [x, y + h]], down: [[x, y], [x + w, y], [x + w / 2, y + h]],
  left: [[x, y + h / 2], [x + w, y], [x + w, y + h]], right: [[x + w, y + h / 2], [x, y], [x, y + h]],
}[pointing ?? 'up']);
const arc = ({ x, y, w, h, opens }) => ({
  up: `M${f1(x)} ${f1(y)} A${f1(w / 2)} ${f1(h)} 0 0 0 ${f1(x + w)} ${f1(y)}`, down: `M${f1(x)} ${f1(y + h)} A${f1(w / 2)} ${f1(h)} 0 0 1 ${f1(x + w)} ${f1(y + h)}`,
  left: `M${f1(x)} ${f1(y)} A${f1(w)} ${f1(h / 2)} 0 0 1 ${f1(x)} ${f1(y + h)}`, right: `M${f1(x + w)} ${f1(y)} A${f1(w)} ${f1(h / 2)} 0 0 0 ${f1(x + w)} ${f1(y + h)}`,
}[opens ?? 'up']);

/** One part as SVG, the primitives of k.objects. A part with an exact colour is flat; one with a colour name only gets a thin outline. */
function partSvg(p, colour, flipped) {
  const q = flipped ? { ...p, pointing: SWAP[p.pointing ?? 'up'], opens: SWAP[p.opens ?? 'up'] } : p;
  const fill = p.rgb || p.tint ? `fill="${colour}"` : `fill="${colour}" stroke="#333" stroke-width="0.8"`;
  const stroke = `fill="none" stroke="${colour}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  switch (p.shape) {
    case 'rectangle': case 'square': return `<rect x="${f1(p.x)}" y="${f1(p.y)}" width="${f1(p.w)}" height="${f1(p.h)}" ${fill}/>`;
    case 'circle': case 'oval': return `<ellipse cx="${f1(p.x + p.w / 2)}" cy="${f1(p.y + p.h / 2)}" rx="${f1(p.w / 2)}" ry="${f1(p.h / 2)}" ${fill}/>`;
    case 'triangle': return `<polygon points="${pts(triangle(q))}" ${fill}/>`;
    case 'polygon': return p.points?.length ? `<polygon points="${pts(p.points)}" ${fill}/>` : '';
    case 'line': return p.points?.length ? `<polyline points="${pts(p.points)}" ${stroke}/>` : '';
    case 'arc': return `<path d="${arc(q)}" ${stroke}/>`;
    default: return '';
  }
}

/** The anchor box of a slot after the face's adjustments (size around its centre, then the shift): { x, y, w, h }. */
export function boxOf(face, slot) {
  const a = face.adj?.[slot.name] ?? {}, k = a.s ?? 1;
  return { x: slot.x + slot.w / 2 - (slot.w * k) / 2 + (a.dx ?? 0), y: slot.y + slot.h / 2 - (slot.h * k) / 2 + (a.dy ?? 0), w: slot.w * k, h: slot.h * k };
}

/** The face as SVG text. opts: { size (px; default scalable), over (a moment: { mouth: 'talking' }), bg (colour behind), label }. */
export function renderFace(data, face, opts = {}) {
  const fr = data.frame, out = [];
  for (const slot of data.slots) {
    for (const side of slot.mirror ? ['left', 'right'] : ['left']) {
      budget.tick('faces.draw');
      const v = variantFor(data, face, slot.name, side, opts.over);
      if (!v) continue;
      const a = face.adj?.[slot.name] ?? {}, k = a.s ?? 1, cx = slot.x + slot.w / 2, cy = slot.y + slot.h / 2;
      const move = `translate(${f1(cx + (a.dx ?? 0))} ${f1(cy + (a.dy ?? 0))}) scale(${f1(k)}) translate(${f1(-cx)} ${f1(-cy)})`;
      const flip = side === 'right' ? `matrix(-1 0 0 1 ${fr.w} 0) ` : '';
      const parts = v.parts.map((p) => partSvg(p, partColour(data, face, slot.name, p), side === 'right')).join('');
      out.push(`<g transform="${flip}${move}">${parts}</g>`);
    }
  }
  const size = opts.size ? ` width="${opts.size}" height="${f1((opts.size * fr.h) / fr.w)}"` : '';
  const bg = opts.bg ? `<rect x="0" y="0" width="${fr.w}" height="${fr.h}" fill="${opts.bg}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fr.w} ${fr.h}"${size} role="img" aria-label="${esc(opts.label ?? 'A drawn face')}">${bg}${out.join('')}</svg>`;
}

/** A small picture of one variant of one slot, in its place on the face (a thumbnail to tap): the face with that variant, zoomed on the slot's box. */
export function variantSvg(data, face, slotName, name, opts = {}) {
  const slot = data.slots.find((s) => s.name === slotName);
  const f = { ...face, slots: { ...face.slots, [slotName]: name }, adj: { ...face.adj, [slotName]: undefined }, expression: '', paint: { ...face.paint, [slotName]: undefined } };
  const svg = renderFace(data, f, { label: `${slotName}: ${name}` });
  const wide = slot.mirror ? 100 - 2 * slot.x : slot.w, pad = 6, side = Math.max(wide + pad * 2, slot.h + pad * 2, 28);
  const x = slot.mirror ? 50 - side / 2 : slot.x + slot.w / 2 - side / 2, y = Math.min(Math.max(slot.y + slot.h / 2 - side / 2, 0), data.frame.h - side);
  const px = opts.size ?? 56;
  return svg.replace(/viewBox="[^"]*"/, `viewBox="${f1(x)} ${f1(y)} ${f1(side)} ${f1(side)}"`).replace('<svg ', `<svg width="${px}" height="${px}" `);
}
