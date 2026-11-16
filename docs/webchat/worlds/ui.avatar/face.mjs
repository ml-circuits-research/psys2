// SPDX-License-Identifier: AGPL-3.0-only
// ui.avatar face: the face itself, as a tool (spec 28 section 14). The one state (state.face), its history (one step per request), and the TOOL PRIMITIVES the request door runs
// through request.sop's std.tool wires, with the face's view as facts. No request, no words of a person, no reply sentences, no defaults: values come in as the tool takes them
// (a slot, a preset and a colour of the catalog k.faces, a size grade, a direction; the library planned and translated them) and a call answers with a status, the ids it changed,
// or a refusal code with the name of its reply fact. The slots, variants, presets and colours are the catalog's (src/knowledge/faces.mjs, else the bundled default face); the face
// logic of the old readers (facelogic.mjs) builds on this module; this module never imports it. Browser-safe.
import { DEFAULT_FACE } from './default-face.mjs?v=23e7ca573f';

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
export const NONE = 'none';
export const DEFAULT_PRESET = 'girl';
const HISTORY = 40;

// ---- the state (moved from facelogic.mjs) ---------------------------------------------------------------------------------------------------------------------------
export const slotOf = (data, name) => data.slots.find((s) => s.name === name);
export function newFace(data, preset = DEFAULT_PRESET) {
  const p = data.presets[preset] ?? data.presets[DEFAULT_PRESET] ?? Object.values(data.presets)[0];
  const f = { v: 2, slots: {}, colours: { ...p.colours }, paint: {}, adj: {}, grade: {}, expression: '', base: p.name, name: '', saved: {}, options: null, n: 0, history: [], future: [], refs: [] };
  for (const s of data.slots) f.slots[s.name] = p.slots[s.name] ?? NONE;
  return f;
}
/** The preset named like the character of an old saved avatar (robot, ...), else the default; the one place that knows the old state. */
function nearestPreset(data, s) {
  for (const w of [s?.character, s?.kind]) if (w && data.presets[String(w).toLowerCase().replace(/_/g, ' ')]) return String(w).toLowerCase().replace(/_/g, ' ');   // glue-lint: tool-data (an old state's preset name)
  return DEFAULT_PRESET;
}
/** The face of the state, complete (a state of an earlier version is filled in; an old saved avatar of the DiceBear characters maps once to the nearest preset). */
export function faceOf(ctx, data) {
  const s = ctx.state;
  if (!s.face || typeof s.face !== 'object' || s.face.v !== 2) {
    const old = s.face ?? null;
    s.face = newFace(data, nearestPreset(data, s));
    if (old?.saved && typeof old.saved === 'object') s.face.saved = old.saved;
    for (const k of Object.keys(s)) if (!['face', 'name'].includes(k)) delete s[k];
  }
  const f = s.face, d = newFace(data, f.base);
  for (const k of Object.keys(d.slots)) f.slots[k] ??= NONE;
  f.colours = { ...d.colours, ...f.colours }; f.paint ??= {}; f.adj ??= {}; f.saved ??= {}; f.history ??= []; f.future ??= []; f.expression ??= '';
  return f;
}
export const snap = (f) => ({ slots: { ...f.slots }, colours: { ...f.colours }, paint: { ...f.paint }, adj: structuredClone(f.adj), grade: { ...(f.grade ?? {}) }, expression: f.expression, base: f.base });
/** Takes a snapshot for undo before a change (one step per request); the redo list is dropped. */
export function mark(f) { f.history.push(snap(f)); if (f.history.length > HISTORY) f.history.shift(); f.future = []; f.options = null; }
export const apply = (f, s) => Object.assign(f, structuredClone(s));
/** The face colour a slot takes by its parts' tint (skin, hair, eyes, clothes), or null. */
export const roleOf = (data, slot) => slotOf(data, slot)?.variants.flatMap((v) => v.parts).map((p) => p.tint?.replace(/_shade$/, '')).find(Boolean) ?? null;   // glue-lint: tool-data (a catalog tint)
/** Sets a slot to a variant; a variant the expression overrides is the user's choice now (the rest of the expression is kept as chosen parts). */
export function put(data, face, slot, name) {
  const e = data.expressions[face.expression];
  if (e && slot in e.over) { for (const [k, v] of Object.entries(e.over)) if (k !== slot) face.slots[k] = v; face.expression = ''; }
  face.slots[slot] = name;
}
/** A colour of the catalog on a slot: the face colour of its tint when the catalog has that colour for it ('role'), else a part of its variant offered in that colour ('paint'), else null. */
export function paint(data, face, slot, name) {
  const role = roleOf(data, slot);
  if (role && data.colours[role]?.[name]) { face.colours[role] = name; return 'role'; }
  const v = slotOf(data, slot)?.variants.find((x) => x.name === face.slots[slot]);
  if (v && v.parts.some((p) => !p.tint && p.colour.includes(name))) { face.paint[slot] = name; return 'paint'; }
  return null;
}
export const SCALE_MIN = 0.6, SCALE_MAX = 1.5;
const clampScale = (k) => Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, k)) * 100) / 100;
export const centre = (s, face) => { const a = face.adj[s.name] ?? {}, k = a.s ?? 1; return { x: s.x + s.w / 2 + (a.dx ?? 0), y: s.y + s.h / 2 + (a.dy ?? 0), w: s.w * k, h: s.h * k }; };
/** The slots that follow a resized slot, by where their boxes lie (no names): those inside it keep their place in it; those resting on its top edge ride on it. */
export function neighbours(data, slot) {
  const inside = [], riders = [];
  for (const o of data.slots) {
    if (o.name === slot.name) continue;
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    if (cx > slot.x && cx < slot.x + slot.w && cy > slot.y && cy < slot.y + slot.h && o.w < slot.w) inside.push(o);
    else if (o.y < slot.y && o.y + o.h > slot.y && o.x < slot.x + slot.w && o.x + o.w > slot.x && o.w >= slot.w * 0.6 && o.z > slot.z) riders.push(o);
  }
  return { inside, riders };
}
/** A slot scaled to `next` (0.6 to 1.5) about its centre; the slots inside it and those riding on it follow. Returns false when the scale does not change. */
export function resize(data, f, slotName, next) {
  const s = slotOf(data, slotName), ad = (f.adj[slotName] ??= { s: 1, dx: 0, dy: 0 }), before = ad.s ?? 1, k = clampScale(next);
  if (!s || k === before) return false;
  const r = k / before, c0 = centre(s, f);
  ad.s = k;
  const { inside, riders } = neighbours(data, s);
  for (const o of inside) { const d = (f.adj[o.name] ??= { s: 1, dx: 0, dy: 0 }), oc = centre(o, f); d.dx = Math.round((d.dx + (oc.x - c0.x) * (r - 1)) * 10) / 10; d.dy = Math.round((d.dy + (oc.y - c0.y) * (r - 1)) * 10) / 10; d.s = clampScale((d.s ?? 1) * r); }
  for (const o of riders) { const d = (f.adj[o.name] ??= { s: 1, dx: 0, dy: 0 }); d.dy = Math.round((d.dy - (c0.h / 2) * (r - 1)) * 10) / 10; d.s = clampScale((d.s ?? 1) * r); }
  return true;
}

/**
 * TOOL PRIMITIVES OF THE FACE (spec 28 section 14; worlds/ui.avatar/request.sop). Named arguments only:
 *   preset  a preset of k.faces (wearPreset)                    part   a slot of k.faces (putPart: it is worn)        ids   the slots acted on (the view's ids)
 *   colour  a colour of the catalog (the face colour of the slot's tint, or a colour its variant's parts are offered in)
 *   size    a size grade the param accepts (tiny, small, default, big, huge: the tool's own scale of a part)
 *   place   a direction (up, down, left, right): the part moves one step, within half its box
 * A call is all or nothing; the calls of one session step are one entry of the face's history (`step`, `label`: given by the host). Result: { status: 'supported', changed } or
 * { status: 'missing', code, reply, roles } (no_part, no_preset, no_colour, needed: a part every face has).
 */
const GRADE = { tiny: 0.6, small: 0.8, default: 1, big: 1.25, huge: 1.5 };   // the tool's own size grades as scales of a part
const DIRECTION = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const MOVE_STEP = 4;
export const faceData = (ctx) => ctx?.knowledge?.peekFaces?.() ?? DEFAULT_FACE;
const ok = (changed = []) => ({ status: 'supported', value: '', changed });
const refuse = (code, reply = null, roles = {}) => ({ status: 'missing', value: '', code, ...(reply ? { reply, roles } : {}) });
const plainName = (n) => String(n ?? '').replace(/_/g, ' ');   // glue-lint: tool-data (a catalog name with its spaces)
const slotsOf = (data, ids) => [].concat(ids ?? []).map((id) => String(id).replace(/^\$/, '')).filter((id) => slotOf(data, id));   // glue-lint: tool-data (a view id)
/** One call: all or nothing, and one entry of the face's history per session step (`step`), labelled with the person's words. */
function toolStep(ctx, { step = null, label = null } = {}, fn) {
  const data = faceData(ctx), f = faceOf(ctx, data), before = snap(f);
  const r = fn(f, data);
  if (r?.status !== 'supported') { apply(f, before); return r; }
  if (JSON.stringify(before) === JSON.stringify(snap(f))) return r;
  if (!step || f.stepGroup !== step) { f.history.push({ ...before, label: label ?? '' }); if (f.history.length > HISTORY) f.history.shift(); f.future = []; f.stepGroup = step; }
  f.options = null;
  return r;
}
/** The face takes an expression of the catalog (k.faces.expression): its parts the expression draws, the chosen parts kept. */
const wearExpression = (data, f, expression) => { const e = String(expression).replace(/_/g, ' '); if (!data.expressions?.[e]) return false; f.expression = e; return true; };   // glue-lint: tool-data (a catalog name)
/** The face becomes a preset of the catalog (its saved faces, history and name kept), with an expression when one is given ("an angry boy"). */
export function wearPreset(ctx, { preset, expression = null, step = null, label = null } = {}) {
  return toolStep(ctx, { step, label }, (f, data) => {
    const name = data.presets[preset] ? preset : data.presets[plainName(preset)] ? plainName(preset) : null;
    if (!name) return refuse('no_preset');
    Object.assign(f, newFace(data, name), { saved: f.saved, history: f.history, future: f.future, n: f.n, name: f.name, stepGroup: f.stepGroup, options: null });
    if (expression != null && !wearExpression(data, f, expression)) return refuse('no_value');
    return ok(['face']);
  });
}
/** A part is worn in a variant: the one said (`variant`), else the one it has stays, else the preset's (`worn`, the custom search); in a colour and a size when given. */
export function putPart(ctx, { part, variant = null, worn = null, colour = null, size = null, step = null, label = null } = {}) {
  return toolStep(ctx, { step, label }, (f, data) => {
    const s = slotOf(data, plainName(part).replace(/ /g, '_')) ?? slotOf(data, part);   // glue-lint: tool-data (a slot id)
    if (!s) return refuse('no_part');
    const v = variant ?? worn;   // the variant said ("a big smile"), else the one the preset wears (a part put on)
    if (f.slots[s.name] === NONE || (variant != null && variant !== f.slots[s.name])) { if (!s.variants.some((x) => x.name === v)) return refuse('no_variant'); put(data, f, s.name, v); }
    if (colour != null && !paint(data, f, s.name, plainName(colour))) return refuse('no_colour', 'refused.no_colour', { thing: plainName(s.name), value: plainName(colour) });
    if (size != null) { if (!GRADE[size]) return refuse('no_value'); resize(data, f, s.name, GRADE[size]); (f.grade ??= {})[s.name] = size; }
    return ok([s.name]);
  });
}
/** Declared custom search (request.sop std.tool.custom presetVariant): the variant of a part in the preset the face is (the catalog's preset row), else the slot's first variant. */
export function presetVariant({ part } = {}, view = []) {
  const data = faceData(null), s = slotOf(data, plainName(part).replace(/ /g, '_')) ?? slotOf(data, part);   // glue-lint: tool-data (a slot id)
  if (!s) return null;
  const preset = data.presets[(view ?? []).find((t) => t?.id === 'face')?.preset]?.slots?.[s.name];
  return s.variants.some((v) => v.name === preset) ? preset : s.variants[0]?.name ?? null;
}
/** Parts are taken off; a part every face has is refused (said by the reply fact refused.needed). */
export function takeOff(ctx, { ids, step = null, label = null } = {}) {
  return toolStep(ctx, { step, label }, (f, data) => {
    const slots = slotsOf(data, ids);
    if (!slots.length) return refuse('no_part');
    const needed = slots.find((n) => !slotOf(data, n).optional);
    if (needed) return refuse('needed', 'refused.needed', { thing: plainName(needed) });
    for (const n of slots) put(data, f, n, NONE);
    return ok(slots);
  });
}
/** Parts take a colour, a size grade or a variant of their slot; the face takes an expression ("make it happy"). */
export function setParts(ctx, { ids, colour = null, size = null, variant = null, expression = null, step = null, label = null } = {}) {
  return toolStep(ctx, { step, label }, (f, data) => {
    const face = [].concat(ids ?? []).some((id) => String(id).replace(/^\$/, '') === 'face');   // glue-lint: tool-data (a view id)
    if (face && expression != null && !wearExpression(data, f, expression)) return refuse('no_value');
    const slots = slotsOf(data, ids);
    if (!slots.length) return face && expression != null ? ok(['face']) : refuse('no_part');
    if (colour == null && size == null && variant == null) return face && expression != null ? ok(['face']) : refuse('no_value');
    for (const n of slots) if (variant != null) { const s = slotOf(data, n); if (!s.variants.some((v) => v.name === variant)) return refuse('no_variant'); put(data, f, n, variant); }
    if (size != null && !GRADE[size]) return refuse('no_value');
    for (const n of slots) {
      budget.tick('avatar.tool');
      if (colour != null && !paint(data, f, n, plainName(colour))) return refuse('no_colour', 'refused.no_colour', { thing: plainName(n), value: plainName(colour) });
      if (size != null) { resize(data, f, n, GRADE[size]); (f.grade ??= {})[n] = size; }
    }
    return ok(slots);
  });
}
/** Parts move one step in a direction; a part stays within half its box of its place, and the two sides of a pair never touch in the middle. */
export function moveParts(ctx, { ids, place = null, step = null, label = null } = {}) {
  return toolStep(ctx, { step, label }, (f, data) => {
    const slots = slotsOf(data, ids), dir = DIRECTION[place];
    if (!slots.length) return refuse('no_part');
    if (!dir) return refuse('no_place');
    for (const n of slots) {
      const s = slotOf(data, n), ad = (f.adj[n] ??= { s: 1, dx: 0, dy: 0 }), c = centre(s, f);
      let dx = (ad.dx ?? 0) + dir[0] * MOVE_STEP, dy = (ad.dy ?? 0) + dir[1] * MOVE_STEP;
      dx = Math.max(-s.w / 2, Math.min(s.w / 2, dx)); dy = Math.max(-s.h / 2, Math.min(s.h / 2, dy));
      if (s.mirror) dx = Math.min(dx, 49 - (s.x + s.w / 2) - c.w / 2);
      ad.dx = Math.round(dx * 10) / 10; ad.dy = Math.round(dy * 10) / 10;
    }
    return ok(slots);
  });
}
/** The face's own undo / redo, said by the reply facts done.undo / nothing.undo (done.undo.did with what the step did; done.redo / nothing.redo). */
export function undoStep(ctx) {
  const f = ctx.state?.face;
  if (!f?.history?.length) return { status: 'missing', value: '', reply: 'nothing.undo' };
  const prev = f.history.pop();
  f.future.push({ ...snap(f), label: prev.label ?? '' }); apply(f, prev); f.options = null; f.stepGroup = null;
  return { status: 'supported', value: '', reply: prev.label ? 'done.undo.did' : 'done.undo', roles: prev.label ? { did: prev.label } : {} };
}
export function redoStep(ctx) {
  const f = ctx.state?.face;
  if (!f?.future?.length) return { status: 'missing', value: '', reply: 'nothing.redo' };
  const next = f.future.pop();
  f.history.push({ ...snap(f), label: next.label ?? '' }); apply(f, next); f.options = null; f.stepGroup = null;
  return { status: 'supported', value: '', reply: next.label ? 'done.redo.did' : 'done.redo', roles: next.label ? { did: next.label } : {} };
}
/** The face as facts (the library's view): the face (its preset and expression) and each part it shows (its variant, colour and size grade). Reads the state, never changes it. */
export function toolView(ctx) {
  const data = faceData(ctx), f = ctx.state?.face?.v === 2 ? ctx.state.face : newFace(data);
  const placeOf = (n) => { const a = f.adj?.[n] ?? {}, v = Math.sign(Math.round(a.dy ?? 0)), h = Math.sign(Math.round(a.dx ?? 0)); return [v < 0 ? 'up' : v > 0 ? 'down' : '', h < 0 ? 'left' : h > 0 ? 'right' : ''].filter(Boolean).join(' ') || null; };   // where a part is moved to from its place, in the tool's directions
  const colourOf = (n) => f.paint?.[n] ?? (roleOf(data, n) ? f.colours?.[roleOf(data, n)] : null) ?? null;
  return [
    { id: 'face', kind: 'face', preset: f.base, ...(f.expression ? { expression: f.expression } : {}) },
    ...data.slots.filter((s) => f.slots[s.name] && f.slots[s.name] !== NONE).map((s) => ({ id: s.name, kind: s.name, variant: f.slots[s.name], colour: colourOf(s.name), size: f.grade?.[s.name] ?? 'default', ...(placeOf(s.name) ? { place: placeOf(s.name) } : {}) })),
  ];
}
