// SPDX-License-Identifier: AGPL-3.0-only
// Draws a face from the data of `k.faces` (facedata.mjs): one slot after another (back layers first), a mirrored pair is the left one flipped around the middle of the frame,
// colours come from the face's palette. The same function draws the Avatar tab, the small avatar in the header, the thumbnails of the variants and the 12 faces of the probe,
// as SVG text: crisp at any size. Browser-safe: no imports besides the data module.
import { getFaces } from './facedata.mjs';

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
export const ROLE_FIXED = { white: 'ffffff', line: '3a2a22', pupil: '2a1a14', mouthin: '6b1f2a', tongue: 'd9626b', screen: '161a21' };
export const COLOUR_ROLES = ['skin', 'hair', 'iris', 'lips', 'glass', 'shirt', 'background', 'hat', 'jewel'];
const f1 = (n) => Math.round(n * 100) / 100;

const hexOf = (h) => `#${String(h).replace(/^#/, '').toLowerCase()}`;
/** A colour lighter (shade > 0) or darker (shade < 0) by that share. */
export function shadeHex(hex, shade) {
  const h = String(hex).replace(/^#/, '');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const t = shade < 0 ? 0 : 255, k = Math.abs(shade);
  return `#${c.map((v) => Math.round(v + (t - v) * k).toString(16).padStart(2, '0')).join('')}`;
}

/** The colour (hex with #) of a role in a face; null for "no fill". */
export function colourOf(face, role, shade = 0) {
  if (!role || role === 'none') return null;
  let hex = ROLE_FIXED[role];
  if (!hex) {
    const c = face.colours ?? {};
    if (role === 'brow') { hex = c.brow ?? c.hair; shade = shade || -0.12; }
    else if (role === 'nose') { hex = c.skin; shade = shade || -0.35; }
    else hex = c[role];
  }
  hex ??= '888888';
  return shade ? shadeHex(hex, shade) : hexOf(hex);
}

/** The variant a slot shows (side: 'left' | 'right' for a pair): the expression's override (and `over`, a transient one such as the talking mouth) before the chosen variant. */
export function variantFor(face, slot, side, data = getFaces(), over = null) {
  const e = data.expressions[face.expression ?? 'neutral'];
  const pick = (o) => o && (o[`${slot}.${side}`] ?? o[slot]);
  const id = pick(over) ?? (face.over ? pick(face.over) : undefined) ?? (e && !face.noExpression ? pick(e.over) : undefined) ?? face.slots?.[slot];
  const s = data.slots.find((x) => x.name === slot);
  return s?.variants.find((v) => v.id === id) ?? null;
}

function shapeSvg(sh, face) {
  const fill = sh.fill === 'none' || sh.role === 'none' ? 'none' : colourOf(face, sh.role, sh.shade ?? 0) ?? 'none';
  const stroke = sh.stroke ? colourOf(face, sh.stroke) : null;
  const attrs = ` fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${f1(sh.sw ?? 2)}" stroke-linecap="round" stroke-linejoin="round"` : ''}${sh.op !== undefined ? ` opacity="${sh.op}"` : ''}`;
  if (sh.shape === 'ellipse') return `<ellipse cx="${f1(sh.x + sh.w / 2)}" cy="${f1(sh.y + sh.h / 2)}" rx="${f1(sh.w / 2)}" ry="${f1(sh.h / 2)}"${attrs}/>`;
  if (sh.shape === 'rect') return `<rect x="${sh.x}" y="${sh.y}" width="${sh.w}" height="${sh.h}"${sh.rx ? ` rx="${sh.rx}"` : ''}${attrs}/>`;
  return `<path d="${String(sh.d).replace(/[^MLQCZmlqcz0-9.,\s-]/g, '')}"${attrs}/>`;
}

/** The anchor box of a slot after the face's adjustments: { x, y, w, h } (the centre of the left one for a pair). */
export function boxOf(face, slot) {
  const a = face.adj?.[slot.name] ?? {};
  return { x: slot.x + (a.dx ?? 0), y: slot.y + (a.dy ?? 0), w: slot.w * (a.s ?? 1), h: slot.h * (a.s ?? 1) };
}

/** The face as SVG text. opts: { size (px, default scalable), over (transient variants), bg (colour behind), label }. */
export function renderFace(face, opts = {}, data = getFaces()) {
  const { frame } = data, items = [];
  for (const slot of data.slots) {
    budget.tick('faces.draw');
    for (const side of slot.pair ? ['left', 'right'] : ['left']) {
      const v = variantFor(face, slot.name, side, data, opts.over);
      if (!v) continue;
      const a = face.adj?.[slot.name] ?? {}, k = a.s ?? 1, cx = slot.x, cy = slot.y;
      const tint = slot.name === 'beard' && face.colours?.beard ? { ...face, colours: { ...face.colours, hair: face.colours.beard } } : face;   // a beard may have a colour of its own
      const place = `translate(${f1(cx + (a.dx ?? 0))} ${f1(cy + (a.dy ?? 0))}) scale(${f1(k)}) translate(${f1(-cx)} ${f1(-cy)}) translate(${f1(cx - slot.w / 2)} ${f1(cy - slot.h / 2)}) scale(${f1(slot.w / 100)})`;
      const mirror = side === 'right' ? ` transform="matrix(-1 0 0 1 ${frame.w} 0)"` : '';
      for (const layer of ['back', 'front']) {
        const shapes = v.shapes.filter((s) => (s.layer === 'back') === (layer === 'back'));
        if (!shapes.length) continue;
        items.push({ z: slot.z - (layer === 'back' ? 100 : 0), svg: `<g${mirror}><g transform="${place}">${shapes.map((s) => shapeSvg(s, tint)).join('')}</g></g>` });
      }
    }
  }
  items.sort((p, q) => p.z - q.z);
  const size = opts.size ? ` width="${opts.size}" height="${f1((opts.size * frame.h) / frame.w)}"` : '';
  const back = face.colours?.background ? hexOf(face.colours.background) : opts.bg;   // the face's own background colour, else the one the host asks for
  const bg = back ? `<rect x="0" y="0" width="${frame.w}" height="${frame.h}" fill="${back}"/>` : '';
  const label = String(opts.label ?? 'A drawn face').replace(/[<>&"]/g, ' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${frame.w} ${frame.h}"${size} role="img" aria-label="${label}">${bg}${items.map((i) => i.svg).join('')}</svg>`;
}

/** A small picture of one variant of one slot (a thumbnail to tap): a face with that variant, zoomed on the slot. */
export function variantSvg(face, slotName, id, opts = {}, data = getFaces()) {
  const slot = data.slots.find((s) => s.name === slotName);
  const f = { ...face, slots: { ...face.slots, [slotName]: id }, adj: { ...face.adj, [slotName]: undefined }, over: undefined, expression: 'neutral' };
  const svg = renderFace(f, { label: `${slotName}: ${id}` }, data);
  const pad = slot.pair ? 6 : 8, half = Math.max(slot.pair ? (50 - slot.x) + slot.w / 2 : slot.w / 2, 14) + pad;
  const w = half * 2, h = w, x = 50 - half, y = Math.min(Math.max(slot.y - half, 0), data.frame.h - h);
  return svg.replace(/viewBox="[^"]*"/, `viewBox="${f1(x)} ${f1(y)} ${f1(w)} ${f1(h)}"`).replace(/ width="[^"]*" height="[^"]*"/, '').replace('<svg ', `<svg width="${opts.size ?? 56}" height="${opts.size ?? 56}" `);
}
