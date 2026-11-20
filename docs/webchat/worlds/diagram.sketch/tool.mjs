// SPDX-License-Identifier: AGPL-3.0-only
// diagram.sketch: what the request door calls (spec 28 sections 11, 14), and nothing else. The tool primitives bound by request.sop's std.tool wires, the diagram's view and the
// declared custom search; undo / redo (request.sop psys2.op). Named arguments only: no request, no words, no defaults, no reply (the library fills, translates and checks the
// arguments, and says what changed from the view's diff). The door reaches the world through these names only; scripts/glue-lint.mjs measures the glue from this file. Browser-safe.
//   kind    a shape of the engine (circle, rectangle, ...)            n       how many            whole   the id of a diagram made by startDiagram (anything else: none)
//   links   how many arrows the whole is made with (it is laid out once they are all there)
//   size    a grade of k.expect.scale the param accepts               colour  a colour            layout  a layout of the engine (tree, grid, row, column, circle, radial, layers)
//   a, b    the ends of an arrow (shape ids)                          ids     the ids acted on    place   a region of the canvas, or a direction (up, down)
//   anchor  the id of a shape to go next to                           step    the session step (the host's): the calls of one step are one entry of the engine's undo
// A refusal is { status: 'missing', code }; a call that did it is { status: 'supported', changed }.
import { K, loadEngine, ensure, systemFor, writeBack, open, budget } from './core.mjs?v=0c47ee79a4';

const done = (changed = []) => ({ status: 'supported', value: '', changed });
const refuse = (code) => ({ status: 'missing', value: '', code });
const notReady = () => { loadEngine(); return refuse('not_ready'); };
/** The engine's sizes (a size comes in in the engine's own name: request.sop std.tool.value default -> medium, big -> large), and the grade the view says for each. */
const ENGINE_SIZES = new Set(['tiny', 'small', 'medium', 'large', 'huge']);
const GRADE = { tiny: 'tiny', small: 'small', medium: 'default', large: 'big', huge: 'huge' };
/** The engine's canvas regions (a place comes in in the engine's own name: request.sop std.tool.value corner -> bottomLeft). */
const REGIONS = new Set(['center', 'top', 'bottom', 'left', 'right', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight']);
const DIRECTION = new Set(['up', 'down']);

/** Run engine wire nodes on the state; the calls of one session step are one entry of the engine's undo stack. Returns the engine result, or null when it threw. */
function run(ctx, s, nodes, step) {
  const base = step && s.toolStep?.id === step && s.toolStep.base <= (s.undo?.length ?? 0) ? s.toolStep.base : (s.undo?.length ?? 0);
  let r;
  try { r = systemFor(s).engine.run(nodes); } catch { return null; }
  writeBack(s);
  if (step) { s.toolStep = { id: step, base }; if (s.undo.length > base + 1) s.undo.splice(base + 1); }
  if (r.changed) { s.rev = (s.rev ?? 0) + 1; open(ctx); }
  return r;
}
const madeBy = (r) => (r?.steps ?? []).flatMap((st) => (st.patches ?? []).filter((p) => p.op === 'add').map((p) => p.shape.name));
const shapesOf = (s, ids) => [].concat(ids ?? []).map((id) => String(id).replace(/^\$/, '')).filter((n) => s.shapes.some((x) => x.name === n));   // glue-lint: tool-data (shape id)
const wholeOf = (s, id) => (s.wholes ?? []).find((w) => w.id === id) ?? null;
/** The shapes of a whole laid out again by its layout, once the links it was made with are all there (a layout of the whole costs a pass over the canvas). */
function relay(ctx, s, w, step) {
  w.members = w.members.filter((n) => s.shapes.some((x) => x.name === n));
  const links = s.edges.filter((e) => w.members.includes(e.from) && w.members.includes(e.to)).length;
  if (links < (w.links ?? 0)) return;
  if (w.layout && w.members.length > 1) run(ctx, s, [{ id: 'lay', type: 'command', args: { action: 'arrange', target: w.members, layout: w.layout } }], step);
}

/** A new diagram: a whole the shapes made in it belong to and are laid out by. */
export function startDiagram(ctx, { kind, layout = null, links = 0, step = null } = {}) {
  if (!K) return notReady();
  const s = ensure(ctx);
  s.wholeSeq = (s.wholeSeq ?? 0) + 1;
  const id = `g${s.wholeSeq}`;
  s.wholes = [...(s.wholes ?? []), { id, kind, layout, links: Math.max(0, Number(links) || 0), members: [] }];
  s.rev = (s.rev ?? 0) + 1;
  open(ctx);
  return done([id]);
}
/** n shapes of a kind, in a whole (laid out by its layout) or free (in the layout given, else where the engine puts them). */
export function addShapes(ctx, { kind, label = undefined, n = 1, whole = null, size = null, colour = null, layout = null, step = null } = {}) {
  if (!K) return notReady();
  const s = ensure(ctx), w = wholeOf(s, whole);
  if (size && !ENGINE_SIZES.has(size)) return refuse('no_value');
  const count = Math.max(1, Number(n) || 1);
  const r = run(ctx, s, [{ id: 'add', type: 'command', args: { action: 'create', shape: kind, count, ...(label!==undefined?{label}:kind==='text'?{label:'Text'}:{}), ...(colour ? { color: String(colour).toLowerCase() } : {}), ...(size ? { size } : {}), ...(!w && layout && count > 1 ? { layout } : {}) } }], step);
  if (!r?.ok) return refuse('refused');
  const made = madeBy(r);
  if (w) { w.members.push(...made); relay(ctx, s, w, step); }
  s.last = made;
  return done(made);
}
/** An arrow from a to b (shape ids); the whole they are in is laid out again. */
export function linkShapes(ctx, { a, b, step = null } = {}) {
  if (!K) return notReady();
  const s = ensure(ctx);
  const [x] = shapesOf(s, a), [y] = shapesOf(s, b);
  if (!x || !y) return refuse('no_things');
  const r = run(ctx, s, [{ id: 'link', type: 'command', args: { action: 'connect', from: x, to: y } }], step);
  if (!r?.ok) return refuse('refused');
  for (const w of s.wholes ?? []) if (w.members.includes(x) || w.members.includes(y)) relay(ctx, s, w, step);
  return done([x, y]);
}
export function removeShapes(ctx, { ids, step = null } = {}) {
  if (!K) return notReady();
  const s = ensure(ctx), names = shapesOf(s, ids);
  if (!names.length) return refuse('no_things');
  const r = run(ctx, s, [{ id: 'del', type: 'command', args: { action: 'delete', target: names } }], step);
  if (!r?.ok) return refuse('refused');
  for (const w of s.wholes ?? []) w.members = w.members.filter((m) => !names.includes(m));
  s.last = [];
  return done(names);
}
/** Arrows by id; an arrow already gone (its shape was removed) is no refusal. */
export function removeLinks(ctx, { ids, step = null } = {}) {
  if (!K) return notReady();
  const s = ensure(ctx), want = new Set([].concat(ids ?? []).map(String));
  const es = s.edges.filter((e) => want.has(e.id));
  for (const e of es) { budget.tick('diagram.tool'); run(ctx, s, [{ id: 'unlink', type: 'command', args: { action: 'disconnect', from: e.from, to: e.to } }], step); }
  return done(es.map((e) => e.id));
}
/** A diagram whole taken away (its shapes and arrows are things of their own). */
export function dropDiagram(ctx, { ids } = {}) {
  const s = ensure(ctx), want = new Set([].concat(ids ?? []).map(String));
  s.wholes = (s.wholes ?? []).filter((w) => !want.has(w.id));
  s.rev = (s.rev ?? 0) + 1;
  return done([...want]);
}
export function moveShapes(ctx, { ids, place = null, anchor = null, step = null } = {}) {
  if (!K) return notReady();
  const s = ensure(ctx), names = shapesOf(s, ids);
  if (!names.length) return refuse('no_things');
  const to = shapesOf(s, anchor).find((n) => !names.includes(n)) ?? null;
  const args = to ? { position: 'rightOf', anchor: to } : DIRECTION.has(place) ? { direction: place } : REGIONS.has(place) ? { region: place } : null;
  if (!args) return refuse('no_place');
  const r = run(ctx, s, [{ id: 'move', type: 'command', args: { action: 'move', target: names, ...args } }], step);
  if (!r?.ok) return refuse('refused');
  s.last = names;
  return done(names);
}
/** The shapes laid out again in a layout (with none given, the layout the links ask for: the engine's own). */
export function arrangeShapes(ctx, { ids, layout = null, step = null } = {}) {
  if (!K) return notReady();
  const s = ensure(ctx), names = shapesOf(s, ids);
  if (!names.length) return refuse('no_things');
  const r = run(ctx, s, [{ id: 'arrange', type: 'command', args: { action: 'arrange', target: names, ...(layout ? { layout } : {}) } }], step);
  if (!r?.ok) return refuse('refused');
  for (const w of s.wholes ?? []) if (layout && names.every((n) => w.members.includes(n))) w.layout = layout;
  s.last = names;
  return done(names);
}
export function setShapes(ctx, { ids, colour = null, size = null, step = null } = {}) {
  if (!K) return notReady();
  const s = ensure(ctx), names = shapesOf(s, ids);
  if (!names.length) return refuse('no_things');
  if ((size && !ENGINE_SIZES.has(size)) || (!colour && !size)) return refuse('no_value');
  const r = run(ctx, s, [{ id: 'set', type: 'command', args: { action: 'set', target: names, ...(colour ? { color: String(colour).toLowerCase() } : {}), ...(size ? { size } : {}) } }], step);
  if (!r?.ok) return refuse('refused');
  s.last = names;
  return done(names);
}
/** The engine's own undo / redo (the tab's history); said by the reply facts done.undo / nothing.undo (done.redo / nothing.redo). */
const history = (action, yes, none) => (ctx) => {
  if (!K) return notReady();
  const s = ensure(ctx);
  if (!(action === 'undo' ? s.undo : s.redo)?.length) return { status: 'missing', value: '', reply: none };
  const r = run(ctx, s, [{ id: action, type: 'command', args: { action } }], null);
  return r?.ok ? { status: 'supported', value: '', reply: yes } : { status: 'missing', value: '', reply: none };
};
export const undoStep = history('undo', 'done.undo', 'nothing.undo');
export const redoStep = history('redo', 'done.redo', 'nothing.redo');

/** The region of the canvas a shape stands in (the engine's canvas, 800 by 500, in thirds; relative to the frame): what the view says of its place. */
function regionOf(s, x) {
  const fx = (Number(x.x) - (s.frame?.x ?? 0)) / 800, fy = (Number(x.y) - (s.frame?.y ?? 0)) / 500;
  const col = fx < 1 / 3 ? 'left' : fx > 2 / 3 ? 'right' : null, row = fy < 1 / 3 ? 'top' : fy > 2 / 3 ? 'bottom' : null;
  return col && row ? 'corner' : col ?? row ?? 'center';
}
/** The diagram's state as facts (the library's view): its wholes, its shapes (kind, colour, size grade, the whole they are in) and its arrows. */
export function toolView(ctx) {
  const s = ensure(ctx);
  const inWhole = new Map((s.wholes ?? []).flatMap((w) => w.members.map((m) => [m, w.id])));
  return [
    ...(s.wholes ?? []).map((w) => ({ id: w.id, kind: w.kind, ...(w.layout ? { layout: w.layout } : {}) })),
    ...s.shapes.filter((x) => !x.layer && !x.template).map((x) => ({ id: x.name, kind: x.shape, colour: x.color ?? null, ...(K && GRADE[K.sizeName(x.size)] ? { size: GRADE[K.sizeName(x.size)] } : {}), place: regionOf(s, x), ...(inWhole.has(x.name) ? { in: inWhole.get(x.name) } : {}) })),
    ...s.edges.map((e) => ({ id: e.id, kind: 'link', a: e.from, b: e.to })),
  ];
}
/** Declared custom search (request.sop std.tool.custom thingAt): the newest shape of the view whose kind is the place named, else nothing. */
export function thingAt({ place } = {}, view = []) {
  const hit = (view ?? []).filter((t) => t && place != null && t.kind === place);
  return hit.length ? hit.at(-1).id : null;
}
