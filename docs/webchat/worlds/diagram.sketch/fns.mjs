// SPDX-License-Identifier: AGPL-3.0-only
// diagram.sketch on the matrix reasoner (spec 15). The editor engine (engine/: the reader of sentences, the commands, the Datalog questions, the layouts, the 24
// templates) and its wrapper (ops.mjs) are unchanged and keep working on the session state; the diagram is also wires of the library: one `diagram.sketch.shape` per
// shape, one `diagram.sketch.edge` per arrow, `diagram.sketch.group` and `diagram.sketch.member` for the groups, the selection and what the last command named
// (`diagram.sketch.sel`, `diagram.sketch.last`) and `diagram.sketch.scene` (the bookkeeping of the engine). The library
// takes the state over after every operation (`adopt`; `toState` is the way back), so its rules refuse a diagram that cannot be (an arrow to a shape that is not
// there, two arrows for one pair, two shapes with one name, a group member that is not there, a selection of nothing), derive the degree of every shape, and refuse
// a request that would only repeat an arrow. Undo and redo are the session timeline's, in the words of the editor. Browser-safe; it imports its sibling ops.mjs.
import { initialState, read } from './ops.mjs?v=d0be05f345';

const dec = (t) => (typeof t === 'string' && t.startsWith('"') ? JSON.parse(t) : t);
const str = (v) => JSON.stringify(String(v));
const tok = (w, k) => (w?.attrs?.[k] ?? []).map((t) => dec(t));
const num = (n) => String(Number(n));
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const atomOk = (v) => typeof v === 'string' && /^[A-Za-z0-9_]+$/.test(v);
const wid = (s) => String(s).replace(/[^A-Za-z0-9_]/g, '_');
const TYPES = ['diagram.sketch.shape', 'diagram.sketch.edge', 'diagram.sketch.group', 'diagram.sketch.member', 'diagram.sketch.sel', 'diagram.sketch.last', 'diagram.sketch.scene'];
const HANDLED = new Set(['shapes', 'edges', 'groups', 'selected', 'last', 'undo', 'redo']);   // the rest is in `diagram.sketch.scene`'s `rest`

const objOf = (w) => JSON.parse(dec(w.attrs.obj[0]));
const byOrd = (ws) => ws.map((w) => ({ w, i: Number(w.attrs.ord?.[0] ?? w.attrs.i?.[0] ?? 0) })).sort((a, b) => a.i - b.i).map((x) => x.w);

/** The state ops.mjs keeps (the tab reads it), derived from the wires: the same keys (the engine's undo snapshots are the library's timeline, so there are none). */
export function toState({ find }) {
  const sc = find('diagram.sketch.scene')[0];
  if (!sc) return initialState();
  const s = initialState();
  s.shapes = byOrd(find('diagram.sketch.shape')).map(objOf);
  s.edges = byOrd(find('diagram.sketch.edge')).map(objOf);
  s.groups = byOrd(find('diagram.sketch.group')).map(objOf);
  Object.assign(s, JSON.parse(tok(sc, 'rest')[0]));
  s.last = byOrd(find('diagram.sketch.last')).map((w) => tok(w, 'name')[0]);
  const sel = find('diagram.sketch.sel');
  s.selected = sel.length ? { shapes: byOrd(sel.filter((w) => tok(w, 'what')[0] === 'shape')).map((w) => tok(w, 'ref')[0]), edges: byOrd(sel.filter((w) => tok(w, 'what')[0] === 'edge')).map((w) => tok(w, 'ref')[0]) } : null;
  s.undo = []; s.redo = [];
  return s;
}

const canon = (attrs) => JSON.stringify(Object.keys(attrs ?? {}).filter((k) => !k.startsWith('core.')).sort().map((k) => [k, attrs[k]]));

/** The wires a state asks for: { id: { type, attrs: { key: [token] } } }. */
function wiresOf(s) {
  const out = {}, used = new Set();   // a wire is the shape's id; a second shape with the same id gets its place in the name (and the rules refuse the state)
  const idFor = (base, ord) => { let id = base; if (used.has(id)) id = `${id}_${ord}`; used.add(id); return id; };
  (s.shapes ?? []).forEach((x, ord) => {
    const a = { sid: [str(x.id ?? x.name)], ord: [String(ord)], name: [str(x.name)], shape: [atomOk(x.shape) ? x.shape : 'unknown'], obj: [str(JSON.stringify(x))] };
    for (const k of ['x', 'y', 'size', 'w', 'h']) if (isNum(x[k])) a[k] = [num(x[k])];
    if (typeof x.color === 'string' && x.color) a.color = [str(x.color)];
    if (atomOk(x.layer)) a.layer = [x.layer];
    if (typeof x.label === 'string' && x.label) a.label = [str(x.label)];
    out[idFor(`dk.s_${wid(x.id ?? x.name)}`, ord)] = { type: 'diagram.sketch.shape', attrs: a };
  });
  (s.edges ?? []).forEach((e, ord) => {
    const a = { eid: [str(e.id)], ord: [String(ord)], from: [str(e.from)], to: [str(e.to)], obj: [str(JSON.stringify(e))] };
    if (atomOk(e.style)) a.style = [e.style];
    if (atomOk(e.arrow)) a.arrow = [e.arrow];
    out[idFor(`dk.e_${wid(e.id)}`, ord)] = { type: 'diagram.sketch.edge', attrs: a };
  });
  (s.groups ?? []).forEach((g, ord) => {
    out[`dk.g_${wid(g.name)}`] = { type: 'diagram.sketch.group', attrs: { gname: [str(g.name)], ord: [String(ord)], n: [String((g.members ?? []).length)], obj: [str(JSON.stringify(g))] } };
    (g.members ?? []).forEach((m, k) => { out[`dk.m_${wid(g.name)}_${k}`] = { type: 'diagram.sketch.member', attrs: { gname: [str(g.name)], member: [str(m)], ord: [String(k)] } }; });
  });
  (s.selected?.shapes ?? []).forEach((n, i) => { out[`dk.sel_s${i}`] = { type: 'diagram.sketch.sel', attrs: { what: ['shape'], ref: [str(n)], ord: [String(i)] } }; });
  (s.selected?.edges ?? []).forEach((n, i) => { out[`dk.sel_e${i}`] = { type: 'diagram.sketch.sel', attrs: { what: ['edge'], ref: [str(n)], ord: [String(i)] } }; });
  (s.last ?? []).forEach((n, i) => { out[`dk.ls_${i}`] = { type: 'diagram.sketch.last', attrs: { name: [str(n)], i: [String(i)] } }; });
  const rest = {};
  for (const k of Object.keys(s).filter((x) => !HANDLED.has(x))) rest[k] = s[k];
  const sc = { nshapes: [String((s.shapes ?? []).length)], nedges: [String((s.edges ?? []).length)], rest: [str(JSON.stringify(rest))] };
  out['dk.scene'] = { type: 'diagram.sketch.scene', attrs: sc };
  return out;
}
/**
 * The library wires for a state the operations changed: { retract: [ids], tell: 'text', sets: [{ id, key, value }], replace: [{ id, type, attrs }] } (a wire that already says it is left alone).
 * A wire whose single values changed is set in place (a shape that moved); a wire that gained or lost a key is replaced in place (it keeps its id).
 */
export function adopt({ state, find, inPlace = true }) {
  const want = wiresOf(state);
  const have = new Map();
  for (const t of TYPES) for (const w of find(t)) {
    have.set(w.id, { id: w.id, wire: w });
  }
  const retract = [], tell = [], sets = [], replace = [], same = new Set();
  const keys = (a) => Object.keys(a).filter((k) => !k.startsWith('core.')).sort().join();
  for (const [base, h] of have) {
    const w = want[base];
    if (!w || canon(h.wire.attrs) === canon(w.attrs)) { if (!w) retract.push(h.id); continue; }
    const single = inPlace && h.wire.type === w.type && keys(h.wire.attrs) === keys(w.attrs) && Object.keys(w.attrs).every((k) => w.attrs[k].length === 1 && (h.wire.attrs[k] ?? []).length === 1);
    if (!single) { replace.push({ id: h.id, type: w.type, attrs: w.attrs }); continue; }   // the wire keeps its id (library R6.9)
    for (const [k, vs] of Object.entries(w.attrs)) if (h.wire.attrs[k][0] !== vs[0]) sets.push({ id: h.id, key: k, value: vs[0] });
    same.add(base);
  }
  for (const [base, w] of Object.entries(want)) {
    const h = have.get(base);
    if (h) continue;
    tell.push(`@${base} ${w.type} ${Object.entries(w.attrs).map(([k, vs]) => vs.map((v) => `${k}=${v}`).join(' ')).join(' ')}`);
  }
  return { retract, tell: tell.join('\n'), sets, replace };
}

/** A cheap text that changes when the diagram does (the host compares it instead of stringifying the engine's undo snapshots). */
export function stateKey(s) {
  const { undo, redo, ...rest } = s;
  return JSON.stringify([rest, undo?.length ?? 0, redo?.length ?? 0]);
}

// ---- a request that would only repeat an arrow --------------------------------------------------------------------------------------------------------
/**
 * "connect A to B" when an arrow from A to B is already there: the rules refuse it ("That arrow already connects A and B.") before the engine runs. Only a request of
 * one pair is asked (a chain or a fan-out may add other arrows, and the engine says which of its pairs already exist); the pair is what the engine's own reader makes of
 * the sentence, so the names are the engine's.
 */
export function guard({ action, args, state, check }) {
  if (action !== 'diagram.connect' || !args?.text) return null;
  let f;
  try { f = read(String(args.text), state); } catch { return null; }
  const cs = (f?.nodes ?? []).filter((n) => n.type === 'command');
  if (cs.length !== 1 || cs[0].args?.action !== 'connect') return null;
  const one = (v) => (typeof v === 'string' && !v.includes(',') ? v : null);
  const from = one(cs[0].args.from), to = one(cs[0].args.to);
  if (!from || !to) return null;
  const r = check({ wires: `@dr.q diagram.sketch.want from=${str(from)} to=${str(to)}` });
  if (r.ok) return null;
  const v = (r.violations ?? []).find((x) => x.why);
  return v ? { status: 'conflicting', note: v.why, why: v.why } : null;
}

// ---- undo and redo: the session timeline, in the words of the editor ----------------------------------------------------------------------------------------
/** What "undo" and "redo" say once the library went back (or forward). `before` is null when there was nothing to take back. */
export function undoWords({ before, redo, steps }) {
  if (!before) return { status: 'unsupported', note: redo ? 'There is nothing to redo.' : 'There is nothing to undo.' };
  if (redo) return { value: 'Redid it.', openTab: 'diagram' };
  return { value: steps > 1 ? `Undid the last ${steps} changes.` : 'Undid the last change.', openTab: 'diagram' };
}

const content = (s) => JSON.stringify([s?.shapes, s?.edges, s?.groups, s?.rules, s?.facts, s?.frames, s?.frame]);
/** Did the step only move what the user looks at (the selection, what "it" means, a question's highlight)? Then "undo" does not count it: the engine's history only held changes. */
export function isView({ before, after }) { return !!before && !!after && content(before) === content(after); }
