// SPDX-License-Identifier: AGPL-3.0-only
// diagram.sketch core: the engine of diagram-vss-demo bound to a state (worlds/diagram.sketch/engine/, loaded lazily), the short ids of its shapes and arrows, the state and
// its write-back. Shared by the tool primitives (tool.mjs, what the request door calls) and the old word operations (engine.mjs). No words, no request, no replies. Browser-safe.

export const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };   // the turn's step budget (a no-op outside a turn)

export const TAB = 'diagram';
export const MAX_HISTORY = 30;
export let K = null;
let loading = null, sys = null, sysOf = null;

/** Starts loading the engine (once). Returns a promise of the engine kit. */
export function loadEngine() {
  loading ??= import('./engine/logic.mjs').then((m) => { K = m.default; return K; });
  return loading;
}
export const engineReady = () => !!K;
if (typeof process !== 'undefined' && process.versions?.node) await loadEngine();

export function initialState() {
  return {
    shapes: [], edges: [], rules: [], seq: {}, edgeSeq: 0, ruleSeq: 0, order: 0, frame: { x: 0, y: 0 }, frames: [], groups: [],
    last: [], selected: null, pending: null, undo: [], redo: [], rev: 0,
  };
}
export function ensure(ctx) {
  const s = ctx.state, d = initialState();
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  if (s.shapes.some((x) => !x.id) || s.edges.some((e) => /^e\d+$/.test(e.id))) { assignIds(s); s.rev = (s.rev ?? 0) + 1; }
  return s;
}

export const ok = (value, extra) => ({ status: 'supported', value, ...extra });
export const no = (note, status = 'unsupported') => ({ status, note });
export const open = (ctx) => { try { ctx.request('ui.openTab', { tab: TAB }); } catch { /* the shell may not know the tab */ } };
export const WORLD_KEYS = ['shapes', 'edges', 'rules', 'seq', 'edgeSeq', 'ruleSeq', 'order', 'frame', 'frames', 'groups', 'facts'];

// ---- short ids (DIAG3) ------------------------------------------------------------------------------------------------
// Every shape has a short id by kind (c1 circle, r1 rectangle, s1 square, d1 diamond, e1 ellipse, t1 triangle, h1 hexagon, k1 star, x1 text) and every arrow
// an id a1, a2. An unnamed shape is named by its id; a shape the user named keeps its name and carries the id in `id`. The old long names (circle1,
// rectangle1, box1) stay aliases: they resolve to the shape of the same number and kind. The engine is patched here, not edited (patchWorld).
export const PREFIX = { circle: 'c', rectangle: 'r', square: 's', diamond: 'd', ellipse: 'e', triangle: 't', hexagon: 'h', star: 'k', text: 'x' };
export const LONG_OF = { box: 'rectangle', rect: 'rectangle', oval: 'ellipse', rhombus: 'diamond', ...Object.fromEntries(Object.keys(PREFIX).map((k) => [k, k])) };
export const KIND_OF_PREFIX = Object.fromEntries(Object.entries(PREFIX).map(([k, v]) => [v, k]));
export const ID_RE = /^([crsdetxhk])(\d+)$/i;
export const LONG_RE = new RegExp(`^(${Object.keys(LONG_OF).join('|')})(\\d+)$`, 'i');
/** The shape a token names: its name, its short id, or the old long name (circle1 = c1). */
export function shapeOf(state, token) {
  if (token == null) return null;
  const l = String(token).toLowerCase(), ss = state.shapes ?? [];
  const exact = ss.find((x) => x.name.toLowerCase() === l) ?? ss.find((x) => x.id && x.id.toLowerCase() === l);
  if (exact) return exact;
  const m = LONG_RE.exec(l);
  if (m) {
    const kind = LONG_OF[m[1].toLowerCase()], id = `${PREFIX[kind]}${m[2]}`;
    // "rectangle1" is the first rectangle the person drew: shapes a template made do not count (their ids follow the same numbering)
    const own = ss.filter((x) => !x.template && !x.layer);
    const byId = own.find((x) => (x.id ?? '').toLowerCase() === id || x.name.toLowerCase() === id);
    if (byId) return byId;
    if (ss.some((x) => x.template && x.shape === kind)) return own.filter((x) => x.shape === kind).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[Number(m[2]) - 1] ?? null;
    return ss.find((x) => (x.id ?? '').toLowerCase() === id || x.name.toLowerCase() === id) ?? null;
  }
  return null;
}
export const idOf = (x) => x.id ?? (ID_RE.test(x.name) ? x.name.toLowerCase() : x.name);
/** The next free short id of a kind; the counter is the engine's own `seq`. */
export function nextId(state, kind) {
  const p = PREFIX[kind] ?? 'z';
  const used = new Set((state.shapes ?? []).flatMap((x) => [x.name.toLowerCase(), (x.id ?? '').toLowerCase()]));
  let id;
  do { budget.tick('diagram.name'); state.seq[kind] = (state.seq[kind] || 0) + 1; id = `${p}${state.seq[kind]}`; } while (used.has(id));
  return id;
}
function patchWorld(w) {
  const find0 = w.find.bind(w);
  w.find = function (name) { return find0(name) ?? (name == null ? null : shapeOf(this.state, name)); };
  w.nextName = function (shape) { return nextId(this.state, shape); };
  w.newEdge = function (from, to, o) { return Object.assign({ id: `a${++this.state.edgeSeq}`, from, to, style: 'solid', arrow: 'forward', label: null, color: null }, o || {}); };
}
/** Gives every shape that has no id one (named shapes keep their names), and migrates old arrow ids (e1 -> a1). */
export function assignIds(s) {
  for (const x of s.shapes) {
    x.kind = x.shape;   // the kind of the shape (circle, rectangle ...) under the name tests and the state readers use
    if (x.id) continue;
    const m = ID_RE.exec(x.name);
    x.id = m && KIND_OF_PREFIX[m[1].toLowerCase()] === x.shape ? x.name.toLowerCase() : nextId(s, x.shape);
  }
  const taken = new Set(s.edges.map((e) => e.id));
  for (const e of s.edges) if (/^e\d+$/.test(e.id)) { let n = 0, id; do { budget.tick('diagram.name'); id = `a${++n}`; } while (taken.has(id)); taken.add(id); e.id = id; s.edgeSeq = Math.max(s.edgeSeq ?? 0, n); }
}

// ---- the engine bound to a state --------------------------------------------------------------------------------------
/** One engine system (the legend and plugins are built once); its world is loaded from `s` before and written back after each run. */
export function systemFor(s) {
  if (!sys) { sys = K.createSystem(); patchWorld(sys.world); }
  const w = sys.world;
  if (sysOf !== s || w.rev !== s.rev) {
    w.state = structuredClone(Object.fromEntries(WORLD_KEYS.filter((k) => s[k] !== undefined).map((k) => [k, s[k]])));
    w.undoStack = s.undo; w.redoStack = s.redo;
    sysOf = s;
  }
  return sys;
}
export function writeBack(s) {
  const w = sys.world;
  const was = JSON.stringify(WORLD_KEYS.map((k) => s[k] ?? null)), undo0 = s.undo?.length ?? 0;
  for (const k of WORLD_KEYS) { if (w.state[k] === undefined) delete s[k]; else s[k] = w.state[k]; }
  s.undo = w.undoStack; s.redo = w.redoStack;
  assignIds(s);
  while (s.undo.length > MAX_HISTORY) { budget.tick('ops.writeBack'); s.undo.shift(); }
  while (s.redo.length > MAX_HISTORY) { budget.tick('ops.writeBack2'); s.redo.shift(); }
  // the revision counts changes of the diagram: a run that read it (a question, a refused request) leaves it as it was
  if (JSON.stringify(WORLD_KEYS.map((k) => s[k] ?? null)) !== was || (s.undo?.length ?? 0) !== undo0) s.rev = (s.rev ?? 0) + 1;
  w.rev = s.rev;
  w.state = structuredClone(Object.fromEntries(WORLD_KEYS.filter((k) => s[k] !== undefined).map((k) => [k, s[k]])));   // the state of the context is never aliased by the engine
}
/** A cleared state starts a new engine world. */
export function resetSystem() { sysOf = null; }
