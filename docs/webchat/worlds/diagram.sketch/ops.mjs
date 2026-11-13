// SPDX-License-Identifier: AGPL-3.0-only
// Operations of diagram.sketch: a diagram editor controlled by words. Browser-safe; the only import is the engine, loaded lazily.
//
// The state and the execution are the engine of diagram-vss-demo (https://github.com/ml-circuits-research/diagram-vss-demo, commit 9900d34,
// AGPL-3.0; worlds/diagram.sketch/engine/, converted by scripts/convert-diagram-engine.mjs). This file wraps it:
//   - a request reaches an operation as `arg.*` (structured: the keys of the engine's legend, "mention(color=blue,shape=star)" for a description,
//     "$new" for the shape made last) or as `arg.text` (the sentence the pattern recognised: the engine's own rules reader then reads its
//     arguments, makeFormalizer in logic.js);
//   - the operation builds the engine's wire nodes { id, type, args }, runs engine.run and turns the result into a reply; a Clarify or
//     SOPError becomes a clarification (status missing) or a refusal (status unsupported) that says what is wrong.
// State (ctx.state) = the engine's DiagramWorld state { shapes, edges, rules, seq, edgeSeq, ruleSeq, order, frame, frames, groups, facts }
// plus last (names the last command made or named: "it", "them"), selected, undo / redo (engine snapshots, at most MAX_HISTORY) and
// rev (a counter that lets the cached engine detect a state changed from outside). The Diagram tab renders this state as SVG.
// Effects: diagram.download { format: 'png' | 'svg', filename }. Every command brings the Diagram tab forward.
//
// Lazy loading (PERF): the engine is 470 KB of source. In a browser it is fetched when the Diagram tab is first shown or when an operation
// first needs it (the dialog layer awaits `prepare()` before the world's operations run; a call that still finds no engine answers "getting ready"); under Node it is loaded at once (top-level await).

import { fixTypos, rewriteRefs, rewriteLayout, rewriteMisc } from './refs.mjs?v=18f06ec836';
import { routeEdges, segBoxDist, boxOf } from './arrows.mjs?v=3346b422bb';
import { THINGS, THING_WORDS } from '../art.draw/things.catalog.mjs?v=4cd417b561';   // the catalog of drawable things (knowledge/k.objects), shared with the drawing board
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };   // the turn's step budget (a no-op outside a turn)

const TAB = 'diagram';
const MAX_HISTORY = 30;
let K = null, loading = null, sys = null, sysOf = null;

/** Starts loading the engine (once). Returns a promise of the engine kit. */
export function loadEngine() {
  loading ??= import('./engine/logic.mjs?v=66253b79e4').then((m) => { K = m.default; return K; });
  return loading;
}
export const engineReady = () => !!K;
/** Async hook called by the dialog layer before this world's operations run (spec 04): the first sentence waits for the engine instead of being refused. */
export const prepare = () => loadEngine();
if (typeof process !== 'undefined' && process.versions?.node) await loadEngine();

export function initialState() {
  return {
    shapes: [], edges: [], rules: [], seq: {}, edgeSeq: 0, ruleSeq: 0, order: 0, frame: { x: 0, y: 0 }, frames: [], groups: [],
    last: [], selected: null, pending: null, undo: [], redo: [], rev: 0,
  };
}
function ensure(ctx) {
  const s = ctx.state, d = initialState();
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  if (s.shapes.some((x) => !x.id) || s.edges.some((e) => /^e\d+$/.test(e.id))) { assignIds(s); s.rev = (s.rev ?? 0) + 1; }
  return s;
}

const ok = (value, extra) => ({ status: 'supported', value, ...extra });
const no = (note, status = 'unsupported') => ({ status, note });
const open = (ctx) => { try { ctx.request('ui.openTab', { tab: TAB }); } catch { /* the shell may not know the tab */ } };
const WORLD_KEYS = ['shapes', 'edges', 'rules', 'seq', 'edgeSeq', 'ruleSeq', 'order', 'frame', 'frames', 'groups', 'facts'];

// ---- short ids (DIAG3) ------------------------------------------------------------------------------------------------
// Every shape has a short id by kind (c1 circle, r1 rectangle, s1 square, d1 diamond, e1 ellipse, t1 triangle, h1 hexagon, k1 star, x1 text) and every arrow
// an id a1, a2. An unnamed shape is named by its id; a shape the user named keeps its name and carries the id in `id`. The old long names (circle1,
// rectangle1, box1) stay aliases: they resolve to the shape of the same number and kind. The engine is patched here, not edited (patchWorld).
export const PREFIX = { circle: 'c', rectangle: 'r', square: 's', diamond: 'd', ellipse: 'e', triangle: 't', hexagon: 'h', star: 'k', text: 'x' };
const LONG_OF = { box: 'rectangle', rect: 'rectangle', oval: 'ellipse', rhombus: 'diamond', ...Object.fromEntries(Object.keys(PREFIX).map((k) => [k, k])) };
const KIND_OF_PREFIX = Object.fromEntries(Object.entries(PREFIX).map(([k, v]) => [v, k]));
const ID_RE = /^([crsdetxhk])(\d+)$/i;
const LONG_RE = new RegExp(`^(${Object.keys(LONG_OF).join('|')})(\\d+)$`, 'i');
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
function nextId(state, kind) {
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
function assignIds(s) {
  for (const x of s.shapes) {
    x.kind = x.shape;   // the kind of the shape (circle, rectangle ...) under the name tests and the state readers use
    if (x.id) continue;
    const m = ID_RE.exec(x.name);
    x.id = m && KIND_OF_PREFIX[m[1].toLowerCase()] === x.shape ? x.name.toLowerCase() : nextId(s, x.shape);
  }
  const taken = new Set(s.edges.map((e) => e.id));
  for (const e of s.edges) if (/^e\d+$/.test(e.id)) { let n = 0, id; do { budget.tick('diagram.name'); id = `a${++n}`; } while (taken.has(id)); taken.add(id); e.id = id; s.edgeSeq = Math.max(s.edgeSeq ?? 0, n); }
}
const edgeOf = (s, id) => s.edges.find((e) => e.id.toLowerCase() === String(id).toLowerCase()) ?? null;
/** "c1 → r1": the ends of an arrow (a named shape shows its name and its id). */
const endName = (s, n) => plain(s, n);
/** A shape the person did not name is "the circle" (the only one) or "circle 2", never its id "c2": ids mean nothing to a user. */
function plain(s, n, many = false) {
  const m = ID_RE.exec(String(n));
  const kind = m && KIND_OF_PREFIX[m[1].toLowerCase()];
  if (!kind || (s.shapes ?? []).some((x) => x.name === n && x.id !== x.name)) return n;
  const same = (s.shapes ?? []).filter((x) => x.shape === kind && !x.layer);
  return many || same.length > 1 || !same.some((x) => x.name === n) ? `${kind} ${Number(m[2])}` : `the ${kind}`;
}
/** "a circle", "3 triangles": the shapes just drawn, named in plain words. */
function drawnPhrase(s, names) {
  const out = [], cnt = new Map();
  for (const n of names) {
    const m = ID_RE.exec(n), kind = m && KIND_OF_PREFIX[m[1].toLowerCase()];
    const x = s.shapes.find((q) => q.name === n);
    if (kind && x && x.id === x.name) cnt.set(kind, (cnt.get(kind) ?? 0) + 1); else out.push(n);
  }
  const plural = (k) => (k === 'star' ? 'stars' : `${k}s`);
  const kinds = [...cnt].map(([k, c]) => (c === 1 ? `${/^[aeiou]/.test(k) ? 'an' : 'a'} ${k}` : `${c} ${plural(k)}`));
  return [...kinds, ...out];
}
const arrowText = (s, e) => `${endName(s, e.from)} ${e.arrow === 'forward' ? '→' : e.arrow === 'both' ? '↔' : '—'} ${endName(s, e.to)}`;

// ---- the engine bound to a state --------------------------------------------------------------------------------------
/** One engine system (the legend and plugins are built once); its world is loaded from `s` before and written back after each run. */
function systemFor(s) {
  if (!sys) { sys = K.createSystem(); patchWorld(sys.world); }
  const w = sys.world;
  if (sysOf !== s || w.rev !== s.rev) {
    w.state = structuredClone(Object.fromEntries(WORLD_KEYS.filter((k) => s[k] !== undefined).map((k) => [k, s[k]])));
    w.undoStack = s.undo; w.redoStack = s.redo;
    sysOf = s;
  }
  return sys;
}
function writeBack(s) {
  const w = sys.world;
  for (const k of WORLD_KEYS) { if (w.state[k] === undefined) delete s[k]; else s[k] = w.state[k]; }
  s.undo = w.undoStack; s.redo = w.redoStack;
  assignIds(s);
  while (s.undo.length > MAX_HISTORY) { budget.tick('ops.writeBack'); s.undo.shift(); }
  while (s.redo.length > MAX_HISTORY) { budget.tick('ops.writeBack2'); s.redo.shift(); }
  s.rev = (s.rev ?? 0) + 1; w.rev = s.rev;
  w.state = structuredClone(Object.fromEntries(WORLD_KEYS.filter((k) => s[k] !== undefined).map((k) => [k, s[k]])));   // the state of the context is never aliased by the engine
}
/** Every token that names a shape: its name, its short id and its old long name (circle1 for c1). */
const longName = (x) => { const m = ID_RE.exec(idOf(x)); return m ? `${KIND_OF_PREFIX[m[1].toLowerCase()]}${m[2]}` : null; };
const nameTokens = (s) => [...new Set(s.shapes.flatMap((x) => [x.name, x.id, longName(x)]).filter(Boolean).concat((s.groups ?? []).map((g) => g.name)))];
const readerCtx = (s) => ({
  names: nameTokens(s),
  last: (s.last ?? []).length ? { ref: s.last[s.last.length - 1] } : undefined,
  texts: s.shapes.filter((x) => x.label != null && String(x.label).trim() !== '').map((x) => String(x.label)),
});

// ---- requests -> engine nodes -------------------------------------------------------------------------------------------
const NAME_ARGS = new Set(['target', 'anchor', 'anchor2', 'linked', 'from', 'to', 'members']);
const NEW_REF = '$new';
/** Parses "a,b,mention(color=blue,shape=star)" into top-level items. */
function splitList(v) {
  const out = []; let d = 0, cur = '';
  for (const ch of String(v)) {
    if (ch === '(') d++; if (ch === ')') d--;
    if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}
/**
 * The engine nodes of a structured request: type and action from the operation, `arg.*` as the engine's legend keys. "$new" is the shape made
 * last in this dialog (state.last, the discourse referent of "it"); "mention(k=v,...)" becomes a mention node and a reference to it; enum values
 * are restored to the legend's spelling through `legend`.
 */
export function nodesOf(kind, args, s, legend = null) {
  const nodes = []; let m = 0;
  const out = {};
  for (const [k, raw] of Object.entries(args)) {
    if (raw === undefined || raw === null || raw === '' || k === 'text') continue;
    if (!NAME_ARGS.has(k)) {
      // values arrive lower-cased in the canonical form of the data (topleft, toback): the legend's own spelling is restored (topLeft)
      const canon = legend?.lexicon(k)?.get(String(raw).toLowerCase());
      out[k] = canon ?? (/^-?\d+(\.\d+)?$/.test(String(raw)) ? Number(raw) : String(raw));
      continue;
    }
    const items = splitList(raw).map((it) => {
      const mm = /^mention\((.*)\)$/i.exec(it);
      if (mm) {
        const a = {};
        for (const kv of mm[1].split(',')) { const [kk, ...vv] = kv.split('='); if (kk) a[kk.trim()] = vv.join('=').trim(); }
        const id = `m${++m}`; nodes.push({ id, type: 'mention', args: a });
        return { ref: id };
      }
      if (it === NEW_REF) return (s.last ?? []).length ? s.last[s.last.length - 1] : it;
      return it;
    });
    out[k] = items.length === 1 ? items[0] : items;
  }
  nodes.push({ id: 's1', type: kind.type, args: { ...(kind.type === 'question' ? { ask: kind.name } : kind.type === 'command' ? { action: kind.name } : {}), ...out } });
  return nodes;
}

// ---- replies --------------------------------------------------------------------------------------------------------
const listing = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const few = (a, n) => (a.length > n ? listing([...a.slice(0, n), `${a.length - n} more`]) : listing(a));
/** Turns the effects of a run into one or two plain sentences (ported from summarize() of engine/ui.js). */
function summarize(result, s) {
  const adds = [], links = [], unlinks = [], dels = [], moved = [], changed = [], renames = [], rules = [], said = [], answers = [], edgeSets = [];
  for (const st of result.steps) {
    let ownAnswer = false;
    if (st.node.type === 'mention' || st.error || st.skipped) continue;
    if (st.node.args && st.node.args.template && st.answer) { answers.push(st.answer); continue; }
    for (const p of st.patches) {
      if (p.op === 'add') adds.push(p.shape.name);
      else if (p.op === 'link') links.push(arrowText(s, p.edge));
      else if (p.op === 'unlink') unlinks.push(p.edge ? arrowText(s, p.edge) : p.id);
      else if (p.op === 'remove') dels.push(plain(s, p.name, true));
      else if (p.op === 'rename') renames.push(`${plain(s, p.from, true)} to ${p.to}`);
      else if (p.op === 'rule') rules.push(p.rule);
      else if (p.op === 'forget') said.push('Forgot all default rules.');
      else if (p.op === 'reorder') said.push(p.to === 'front' ? `Brought ${p.name} to the front.` : `Sent ${p.name} to the back.`);
      else if (p.op === 'edgeSet') { if (p.edge) { edgeSets.push(p); ownAnswer = true; } }
      else if (p.op === 'set') {
        if ('x' in p.props && !moved.includes(p.name)) moved.push(p.name);
        const ch = Object.entries(p.props).filter(([k]) => k !== 'x' && k !== 'y').map(([k, v]) => (k === 'size' ? K.sizeName(v) : k === 'label' ? `labeled “${v}”` : k === 'outline' ? (v ? `${v} outline` : 'no outline') : k === 'shape' ? `a ${v}` : String(v)));
        if (ch.length) changed.push(`${plain(s, p.name)} is now ${listing(ch)}`);
      }
    }
    if (st.answer && !ownAnswer) answers.push(st.answer);
    for (const n of st.notes || []) if (/^(reverted|re-applied|there was nothing)|already/.test(n)) said.push(n.charAt(0).toUpperCase() + n.slice(1) + '.');
  }
  const out = [];
  if (adds.length) out.push(`Drew ${few(drawnPhrase(s, adds), 6)}.`);
  if (links.length) out.push(`Connected ${few(links, 4)}.`);
  if (renames.length) out.push(`Renamed ${listing(renames)}.`);
  if (changed.length) out.push(changed.slice(0, 4).join('; ') + (changed.length > 4 ? `; and ${changed.length - 4} more.` : '.'));
  if (moved.length) out.push(`Moved ${few(moved.map((n) => plain(s, n)), 5)}.`);
  out.push(...edgeSentences(edgeSets, s));
  if (unlinks.length) out.push(`Removed the arrow${unlinks.length > 1 ? 's' : ''} ${few(unlinks, 4)}.`);
  if (dels.length) out.push(`Deleted ${few(dels, 6)}.`);
  for (const r of rules) out.push(`From now on, new ${r.shape ? `${r.shape}s` : 'shapes'} will be ${['size', 'color'].filter((k) => r[k]).map((k) => r[k]).join(' ')}${r.outline ? ` with a ${r.outline} outline` : ''}.`);
  out.push(...said.map((x) => x.replace(/^Reverted 1 turn\.$/, 'Undid the last change.').replace(/^Re-applied 1 turn\.$/, 'Redid it.')));
  out.push(...answers);
  return out.join(' ') || 'Done.';
}

/** One sentence per changed arrow: "The arrow circle 1 → rectangle 1 now says “uses” and is now dashed and thicker (3 px)." */
function edgeSentences(sets, s) {
  const by = new Map();
  for (const p of sets) { const m = by.get(p.edge.id) ?? { edge: p.edge, props: {}, before: {} }; Object.assign(m.props, p.props); for (const k of Object.keys(p.props)) if (!(k in m.before)) m.before[k] = p.before?.[k]; m.edge = p.edge; by.set(p.edge.id, m); }
  const out = [];
  const parts = (m) => {
    const q = [], pr = m.props;
    if ('label' in pr) q.push(pr.label ? `now says “${pr.label}”` : 'has no label now');
    if ('from' in pr || 'to' in pr) q.push(`was reversed, it now goes ${arrowText(s, m.edge)}`);
    const look = [];
    if (pr.style) look.push(pr.style);
    if (pr.color) look.push(pr.color);
    if (pr.arrow) look.push(pr.arrow === 'both' ? 'two-way' : pr.arrow === 'none' ? 'without arrowheads' : 'one-way');
    if ('width' in pr) { const was = m.before.width ?? 2; look.push(pr.width > was ? `thicker (${pr.width} px)` : `thinner (${pr.width} px)`); }
    if (look.length) q.push(`is now ${listing(look)}`);
    return q;
  };
  const all = [...by.values()];
  if (all.length > 3) {
    const kinds = [...new Set(all.flatMap((m) => parts(m).map((x) => x.replace(/ \(.*?\)/, ''))))];
    return [`${all.length} arrows: ${kinds.join(', ')}.`];
  }
  for (const m of all) { const q = parts(m); if (q.length) out.push(`The arrow ${arrowText(s, m.edge)} ${q.join(' and ')}.`); }
  return out;
}

// ---- reading a sentence: typos, ids, arrows, layouts (refs.mjs) and the arguments the engine could not read -------------------------------
const EDGE_ACTS = new Set(['label', 'set', 'resize', 'reverse', 'disconnect']);
const BIT = /\b(?:a\s+bit|a\s+little|slightly|somewhat|bit|little|just\s+a\s+bit)\b/i, MUCH = /\b(?:much|a\s+lot|way|far|really|very|lots|significantly|considerably)\b/i;
/** The names of one argument made canonical: the name, the short id or the old long name of a shape all become its name. */
function canonNames(s, v) {
  const one = (x) => (typeof x === 'string' ? x.split(',').map((q) => { const t = q.trim(), sh = shapeOf(s, t); return sh ? sh.name : t; }).join(',') : x);
  return Array.isArray(v) ? v.map(one) : one(v);
}
/** Prepares a sentence for the engine's reader. */
function prepareText(text, s) {
  let t = String(text);
  if ((t.match(/"/g) ?? []).length % 2) t += '"';   // the pipeline drops a final closing quote with the sentence's punctuation
  t = fixTypos(t, nameTokens(s));
  t = rewriteMisc(t, s);
  t = rewriteLayout(t);
  return rewriteRefs(t, s);
}
/** Fixes the nodes the reader made: canonical names, the thickness step of an arrow ("a bit" / "much"), a missing label text asked for by name. */
function fixNodes(nodes, text, s) {
  const thick = /\b(thick(?:er|en)?|thin(?:ner)?|heavier|lighter)\b/i.exec(text);
  const out = [];
  for (const n of nodes) {
    if (n.type === 'mention' || !n.args) { out.push(n); continue; }
    for (const k of ['target', 'anchor', 'anchor2', 'linked', 'from', 'to', 'members']) if (n.args[k] != null && !(typeof n.args[k] === 'object' && !Array.isArray(n.args[k]))) n.args[k] = canonNames(s, n.args[k]);
    const a = n.args, toEdge = (a.from != null || a.to != null || a.kind === 'edge');
    if (a.action === 'connect' && a.from == null && a.to == null && a.target == null && a.members == null && a.pairing == null) {   // "connect them with a dashed arrow": the last two shapes
      const last = s.shapes.filter((x) => !x.layer).slice().sort((p, q) => (p.order ?? 0) - (q.order ?? 0)).slice(-2);
      if (last.length < 2) return { clarify: 'I need two shapes to connect. Draw them first, or name them, for example: connect c1 to r1.' };
      a.from = last[0].name; a.to = last[1].name;
    }
    if (a.action === 'label' && toEdge && a.label == null) {
      const es = edgeWords(s, a);
      return { clarify: es.length === 1 ? `What should the label of ${es[0].id} (${arrowText(s, es[0])}) say?` : 'What should the label say? Put it in quotes, for example: label a1 as "uses".' };
    }
    if (thick && toEdge && (a.action === 'resize' || EDGE_ACTS.has(a.action))) {
      const up = /^(thick|heavier)/i.test(thick[1]), f = BIT.test(text) ? 1.25 : MUCH.test(text) ? 2 : 1.5;
      if (a.action === 'resize') { out.push({ ...n, args: { ...a, scale: up ? f : Math.round(100 / f) / 100 } }); continue; }
      out.push(n);
      if (!nodes.some((q) => q.args?.action === 'resize')) out.push({ id: `${n.id}w`, type: 'command', args: { action: 'resize', ...(a.from != null ? { from: a.from } : {}), ...(a.to != null ? { to: a.to } : {}), ...(a.kind ? { kind: a.kind } : {}), scale: up ? f : Math.round(100 / f) / 100 } });
      continue;
    }
    out.push(n);
  }
  return { nodes: out };
}
/** The arrows a node's from / to name (for the messages). */
function edgeWords(s, a) {
  const F = [].concat(a.from ?? []).flatMap((x) => String(x).split(',')), T = [].concat(a.to ?? []).flatMap((x) => String(x).split(','));
  const fit = (f, t) => s.edges.filter((e) => (!f.length || f.includes(e.from)) && (!t.length || t.includes(e.to)));
  const es = fit(F, T);
  return es.length || !(F.length && T.length) ? es : fit(T, F);
}

/** Replies name shapes by their short ids: the internal names of a template's parts (Tree1-trunk, Branch1) become their ids (r1, e1). */
function shortNames(s, text) {
  const subs = s.shapes.filter((x) => x.template && x.id && x.name !== x.id).sort((a, b) => b.name.length - a.name.length);
  let out = String(text);
  for (const x of subs) out = out.replace(new RegExp(`(?<![\\w-])${x.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'g'), x.id);
  return out;
}
/** A template's trunk is wide enough for its attachment points (at least 10 px apart, 8 px from the corners). */
function widenTrunks(s, names) {
  for (const n of names) {
    const x = s.shapes.find((q) => q.name === n);
    if (!x || !x.template || !/-trunk$/.test(x.name)) continue;
    const up = s.edges.filter((e) => (e.from === n || e.to === n)).map((e) => s.shapes.find((q) => q.name === (e.from === n ? e.to : e.from))).filter(Boolean);
    const above = up.filter((q) => q.y < x.y).length, below = up.length - above;
    const need = 2 * 10 + 14 * (Math.max(above, below, 1) - 1);
    if ((x.w ?? 40) < need) x.w = need;
  }
}
/** Moves a shape the engine just placed (no explicit position) off the arrows and the other shapes: the nearest free spot. */
function placeFree(s, names) {
  const dims = (x) => K.dims(x);
  for (const n of names) {
    const x = s.shapes.find((q) => q.name === n);
    if (!x || x.template || x.layer || x.quiet || !Number.isFinite(x.x)) continue;
    const others = s.shapes.filter((o) => o !== x && !o.layer && Number.isFinite(o.x));
    const edges = s.edges.filter((e) => e.from !== n && e.to !== n);
    const routes = routeEdges(others, edges, dims);
    const lines = [...routes.values()].map((r) => r.pts);
    const d = dims(x), PAD = 10;
    const hit = (px, py, strict = true) => {
      budget.tick('diagram.place', others.length + lines.length + 1);
      const b = { x1: px - d.w / 2 - PAD, y1: py - d.h / 2 - PAD, x2: px + d.w / 2 + PAD, y2: py + d.h / 2 + PAD };
      if (strict) for (const o of others) { const q = boxOf(o, dims(o)); if (b.x1 < q.x2 && b.x2 > q.x1 && b.y1 < q.y2 && b.y2 > q.y1) return true; }
      for (const pts of lines) for (let k = 1; k < pts.length; k++) if (segBoxDist(pts[k - 1], pts[k], b) <= 2) return true;
      return false;
    };
    if (!hit(x.x, x.y, false)) continue;   // only a shape that lies on an arrow moves (an explicit place beside others stays)
    const cand = [];
    for (let gx = -12; gx <= 12; gx++) for (let gy = -12; gy <= 12; gy++) {
      const px = x.x + gx * 30, py = x.y + gy * 30;
      const inFrame = px >= d.w / 2 + 10 && py >= d.h / 2 + 10 && px <= 790 - d.w / 2 && py <= 490 - d.h / 2;
      cand.push({ px, py, k: Math.hypot(gx, gy) + (inFrame ? 0 : 100) });
    }
    cand.sort((a, b) => a.k - b.k);
    const spot = cand.find((c) => !hit(c.px, c.py));
    if (spot) { x.x = Math.round(spot.px); x.y = Math.round(spot.py); }
  }
}

/** Runs nodes on the state; returns the reply envelope. `changesPicture` brings the tab forward. */
function execute(ctx, s, nodes) {
  const system = systemFor(s);
  const before = system.world.state.shapes.length;
  let result;
  try { result = system.engine.run(nodes); } catch (e) { return no(`I could not do that (${e?.message ?? e}).`, 'error'); }
  writeBack(s);
  const made = [];
  for (const st of result.steps) for (const p of st.patches ?? []) if (p.op === 'add') made.push(p.shape.name);
  const named = [];
  for (const st of result.steps) { const v = st.value; if (v && st.node.type === 'mention') named.push(...[].concat(v).map(String)); }
  if (made.length) s.last = made; else if (named.length) s.last = [...new Set(named)];
  s.last = (s.last ?? []).filter((n) => s.shapes.some((x) => x.name === n));
  widenTrunks(s, made);
  if (made.length && made.length <= 4) placeFree(s, made);
  if (made.length) { s.rev = (s.rev ?? 0) + 1; }
  // only a selection or the answer of a question marks shapes: what a template or a command made is not highlighted
  const hl = [...result.steps].reverse().find((st) => st.highlight && !st.error && !st.node?.args?.template)?.highlight;
  s.selected = hl && (hl.shapes?.length || hl.edges?.length) ? { shapes: [...new Set(hl.shapes ?? [])], edges: [...new Set(hl.edges ?? [])] } : null;
  if (result.changed || s.shapes.length !== before) open(ctx);
  if (!result.ok) {
    const err = result.error;
    const text = summarize({ steps: result.steps.filter((st) => !st.error) }, s);
    const said = shortNames(s, err?.message ?? 'I could not do that.');
    const clarify = err && err.name === 'Clarify';
    if (result.partial) return ok(`${shortNames(s, text)} But: ${said}`);
    return no(said, clarify ? 'missing' : 'unsupported');
  }
  open(ctx);
  return ok(`${s.keptNote ? `${s.keptNote} ` : ''}${shortNames(s, summarize(result, s))}`);
}

/** Sample diagrams for "make a random diagram": a template word the engine reads, sample labels, and what one box is called in plain words. */
export const RANDOM_DIAGRAMS = [
  { form: 'cycle', items: ['Plan', 'Do', 'Check', 'Act'], unit: 'step' },
  { form: 'cycle', items: ['Spring', 'Summer', 'Autumn', 'Winter'], unit: 'season' },
  { form: 'process', items: ['Idea', 'Draft', 'Review', 'Publish'], unit: 'step' },
  { form: 'process', items: ['Wash', 'Chop', 'Cook', 'Serve'], unit: 'step' },
  { form: 'hierarchy', items: ['Team', 'Design', 'Build', 'Test'], unit: 'box', units: 'boxes' },
  { form: 'pyramid', items: ['Basics', 'Practice', 'Skill', 'Mastery'], unit: 'level' },
  { form: 'timeline', items: ['Plan', 'Build', 'Launch', 'Learn'], unit: 'stage' },
  { form: 'funnel', items: ['Visitors', 'Sign-ups', 'Buyers'], unit: 'stage' },
  { form: 'hub', items: ['School', 'Math', 'Art', 'Music', 'Sport'], unit: 'box', units: 'boxes' },
  { form: 'list', items: ['Milk', 'Bread', 'Eggs', 'Apples'], unit: 'item' },
];
const NUMBER_WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/** A bare "diagram" request ("draw a diagram", "make a random diagram", "a sample diagram"): no form, no labels. */
const BARE_DIAGRAM = /^(?:please\s+)?(?:can\s+you\s+|could\s+you\s+)?(?:draw|make|create|build|generate|show|give|sketch)(?:\s+me)?\s+(?:a|an|any|some|one)?\s*(?:(?:random|sample|example|simple|quick|small|little|new|any)\s+)*(?:diagram|chart|flowchart|picture)\s*(?:for\s+me|please)?[.!?]*$/i;
/** Draws a sample diagram: picks a template, fills it with sample labels and says so in plain words. */
function randomDiagram(ctx, s, pick = Math.floor(Math.random() * RANDOM_DIAGRAMS.length)) {
  const r = RANDOM_DIAGRAMS[pick % RANDOM_DIAGRAMS.length];
  const text = `Draw a ${r.form} of ${r.items.slice(0, -1).join(', ')} and ${r.items[r.items.length - 1]}.`;
  const f = systemFor(s).formalize(prepareText(text, s), readerCtx(s));
  const res = f.nodes.length ? execute(ctx, s, f.nodes) : null;
  if (!res || res.status !== 'supported') return res ?? no('I could not draw a sample diagram.', 'unsupported');
  const n = r.items.length;
  const reply = `I drew a random ${r.form} diagram with ${NUMBER_WORD[n] ?? n} ${n === 1 ? r.unit : (r.units ?? r.unit + 's')}.`;
  return { ...res, value: `${s.keptNote ? `${s.keptNote} ` : ''}${reply}` };
}

const NOT_READY = () => { loadEngine(); return no('The diagram engine is still loading. Please say that again in a moment.', 'missing'); };
/** Common entry of every operation: `kind` = { type, name } of the engine wire. */
const make = (kind) => (ctx, args = {}) => {
  if (!K) return NOT_READY();
  const s = ensure(ctx);
  const text = args.text != null ? String(args.text).trim() : '';
  s.keptNote = s.pending === 'new' ? 'Keeping the current diagram.' : '';   // any other command answers the pending "keep or start empty?" as keep
  s.pending = null;
  if (text && kind.name === 'create' && BARE_DIAGRAM.test(text)) return randomDiagram(ctx, s, args.pick);
  if (text) {
    const prepared = prepareText(text, s);
    if (typeof process !== 'undefined' && process.env?.DIAG_DEBUG) console.error('[diagram]', JSON.stringify(text), '->', JSON.stringify(prepared));
    const sel = selectCommand(prepared, s, ctx);
    if (sel) return sel;
    // a name the diagram does not have ("delete the box End") is not "the one box": the reader drops an unknown name and keeps the kind, which would act on another shape
    const gone = kind.type === 'command' ? missingNamed(s, kind.name, text) : [];
    if (gone.length) {
      const have = s.shapes.filter((x) => !x.layer && !x.template).map((x) => x.name);
      return no(`I can't find ${listing(gone.map((x) => `\u201c${x}\u201d`))} in the diagram. ${have.length ? `In the diagram I can see: ${listing(have)}.` : 'The diagram is empty.'}`, 'missing');
    }
    const f = systemFor(s).formalize(prepared, readerCtx(s));
    if (!f.nodes.length) return no(`I could not read "${text}" as something to do with the diagram.${(f.notes ?? []).length ? ` ${f.notes[0]}` : ''}`, 'missing');
  const fx = fixNodes(f.nodes, prepared, s);
    if (fx.clarify) return no(fx.clarify, 'missing');
    return execute(ctx, s, fx.nodes);
  }
  const nodes = nodesOf(kind, args, s, systemFor(s).engine.legend);
  for (const n of nodes) for (const k of NAME_ARGS) if (n.args?.[k] != null && typeof n.args[k] !== 'object') n.args[k] = canonNames(s, n.args[k]);
  return execute(ctx, s, nodes);
};

/** "select a1", "highlight the arrow between c1 and r1", "select c1 and c2": marks shapes or arrows; the tab draws a halo on them. */
function selectCommand(text, s, ctx) {
  const m = /^(?:please\s+)?(?:select|highlight|pick|choose|mark|point\s+at|point\s+to|show\s+me)\s+(.+?)[.!?]*$/i.exec(text);
  if (!m) return null;
  const rest = m[1];
  return (() => {
    const edges = [], shapes = [];
    const em = /the arrow(?: from| between) (\S+) (?:to|and) (\S+)/i.exec(rest), nm = (t) => shapeOf(s, t)?.name ?? t;
    if (em) {
      for (const e of s.edges.filter((x) => (x.from === nm(em[1]) && x.to === nm(em[2])) || (/between/i.test(rest) && x.from === nm(em[2]) && x.to === nm(em[1])))) edges.push(e.id);
      if (!edges.length) return no(`There is no arrow between ${em[1]} and ${em[2]}.`, 'unsupported');
    }
    else if (/\b(arrows|links|connections)\b/i.test(rest) && /\b(all|every|the)\b/i.test(rest)) edges.push(...s.edges.map((e) => e.id));
    else for (const tok of rest.split(/\s*(?:,|\band\b)\s*/i)) { const sh = shapeOf(s, tok.replace(/^(?:the|shape|box)\s+/i, '').trim()); if (sh) shapes.push(sh.name); }
    if (!edges.length && !shapes.length) return null;
    s.selected = { shapes, edges };
    s.rev = (s.rev ?? 0) + 1;
    open(ctx);
    return ok(edges.length ? `Selected ${edges.length === 1 ? `the arrow ${arrowText(s, s.edges.find((e) => e.id === edges[0]))}` : `${edges.length} arrows`}.` : `Selected ${listing(shapes.map((n) => { const x = s.shapes.find((q) => q.name === n); return x ? plain(s, n) : n; }))}.`);
  })();
}

// ---- operations ------------------------------------------------------------------------------------------------------
/** impl name -> kind. The names follow operations.sop. */
export const ACTIONS = ['undo', 'redo', 'create', 'delete', 'move', 'set', 'resize', 'rename', 'label', 'duplicate', 'swap', 'group', 'ungroup', 'connect', 'disconnect',
  'align', 'arrange', 'distribute', 'toFront', 'toBack', 'forget', 'improve', 'respace', 'snap', 'flip', 'reverse', 'sort', 'groupBy', 'equalize', 'straighten', 'untangle', 'fit'];
export const ASKS = ['members', 'groupOf', 'count', 'list', 'exists', 'property', 'check', 'describe', 'neighbors', 'connected', 'degree', 'nearest', 'extreme', 'path', 'reachable', 'cycle', 'rules'];
export const undo = make({ type: 'command', name: 'undo' });
export const redo = make({ type: 'command', name: 'redo' });
export const create = make({ type: 'command', name: 'create' });
const _delete = make({ type: 'command', name: 'delete' });
export const move = make({ type: 'command', name: 'move' });
export const set = make({ type: 'command', name: 'set' });
export const resize = make({ type: 'command', name: 'resize' });
export const rename = make({ type: 'command', name: 'rename' });
export const label = make({ type: 'command', name: 'label' });
export const duplicate = make({ type: 'command', name: 'duplicate' });
export const swap = make({ type: 'command', name: 'swap' });
export const group = make({ type: 'command', name: 'group' });
export const ungroup = make({ type: 'command', name: 'ungroup' });
export const connect = make({ type: 'command', name: 'connect' });
export const disconnect = make({ type: 'command', name: 'disconnect' });
export const align = make({ type: 'command', name: 'align' });
export const arrange = make({ type: 'command', name: 'arrange' });

// ---- "a diagram shaped like a house" (DRAW-FROM-FACTS) --------------------------------------------------------------------
const LAYOUT_WORDS = new Set(['row', 'column', 'line', 'grid', 'circle', 'stack', 'cluster', 'ring', 'triangle', 'square', 'pyramid', 'tree', 'layers', 'radial', 'hierarchy', 'organic']);
/** The part's own primitive where the diagram has one (the roof of a house is a triangle, a sun a circle); every other part shape stays a rectangle. */
const DIAGRAM_SHAPE_OF = { triangle: 'triangle', circle: 'circle', oval: 'ellipse', ellipse: 'ellipse' };
const thingOfNoun = (w) => {
  const x = String(w ?? '').toLowerCase().replace(/[^a-z ]/g, '').trim();
  for (const t of [x, x.replace(/ies$/, 'y'), x.replace(/es$/, ''), x.replace(/s$/, '')]) if (Object.hasOwn(THING_WORDS, t)) return THING_WORDS[t];
  return null;
};
/**
 * One box per part of a thing of the catalog, labelled with the part name, put where the part is (its box x y w h in the 0-100 frame of the object, scaled to the
 * canvas, in draw order). Nothing else is made: no arrows, no invented boxes. A layout word (a row, a circle) is the engine's own arrange.
 */
export function shapedLike(ctx, args = {}) {
  if (!K) return NOT_READY();
  const s = ensure(ctx);
  const noun = String(args.o ?? '').toLowerCase().replace(/[^a-z ]/g, '').trim();
  const thing = thingOfNoun(noun);
  if (!thing) {
    if (LAYOUT_WORDS.has(noun) && s.shapes.length) return make({ type: 'command', name: 'arrange' })(ctx, { text: `arrange the boxes as a ${noun}` });
    const art = /^[aeiou]/.test(noun) ? 'an' : 'a';
    return no(`I don't know how to draw a diagram shaped like ${art} ${noun} yet.`, 'unsupported');
  }
  const parts = [...THINGS[thing]].sort((a, b) => a.z - b.z);
  const x0 = Math.min(...parts.map((p) => p.x)), x1 = Math.max(...parts.map((p) => p.x + p.w)), y0 = Math.min(...parts.map((p) => p.y)), y1 = Math.max(...parts.map((p) => p.y + p.h));
  const k = Math.min(700 / Math.max(1, x1 - x0), 410 / Math.max(1, y1 - y0));
  const taken = new Set(s.shapes.flatMap((x) => [x.name.toLowerCase(), (x.id ?? '').toLowerCase()]));
  const nodes = parts.map((p, i) => {
    let name = p.name, n = 1;
    while (taken.has(name.toLowerCase()) || /^[crsdetxhk]\d+$/i.test(name)) { budget.tick('diagram.name'); name = `${p.name}${++n}`; }
    taken.add(name.toLowerCase());
    const w = Math.max(10, Math.round(p.w * k)), h = Math.max(10, Math.round(p.h * k));
    const cx = 400 + ((p.x + p.w / 2) - (x0 + x1) / 2) * k, cy = 250 + ((p.y + p.h / 2) - (y0 + y1) / 2) * k;
    return { id: `s${i + 1}`, type: 'command', args: { action: 'create', shape: DIAGRAM_SHAPE_OF[p.shape] ?? 'rectangle', name, label: p.name.replace(/_/g, ' '), width: w, height: h, at: `${Math.round(cx)},${Math.round(cy)}` } };
  });
  const r = execute(ctx, s, nodes);
  if (r.status !== 'supported') return r;
  return { ...r, value: `I drew a diagram shaped like ${/^[aeiou]/.test(thing) ? 'an' : 'a'} ${thing}: one box for each of its ${parts.length} parts, named after the part.` };
}

export const distribute = make({ type: 'command', name: 'distribute' });
export const toFront = make({ type: 'command', name: 'toFront' });
export const toBack = make({ type: 'command', name: 'toBack' });
export const forget = make({ type: 'command', name: 'forget' });
export const improve = make({ type: 'command', name: 'improve' });
export const respace = make({ type: 'command', name: 'respace' });
export const snap = make({ type: 'command', name: 'snap' });
export const flip = make({ type: 'command', name: 'flip' });
export const reverse = make({ type: 'command', name: 'reverse' });
export const sort = make({ type: 'command', name: 'sort' });
export const groupBy = make({ type: 'command', name: 'groupBy' });
export const equalize = make({ type: 'command', name: 'equalize' });
export const straighten = make({ type: 'command', name: 'straighten' });
export const untangle = make({ type: 'command', name: 'untangle' });
export const fit = make({ type: 'command', name: 'fit' });
export const ask_members = make({ type: 'question', name: 'members' });
export const ask_groupOf = make({ type: 'question', name: 'groupOf' });
export const ask_count = make({ type: 'question', name: 'count' });
export const ask_list = make({ type: 'question', name: 'list' });
export const ask_exists = make({ type: 'question', name: 'exists' });
export const ask_property = make({ type: 'question', name: 'property' });
export const ask_check = make({ type: 'question', name: 'check' });
export const ask_describe = make({ type: 'question', name: 'describe' });
export const ask_neighbors = make({ type: 'question', name: 'neighbors' });
export const ask_connected = make({ type: 'question', name: 'connected' });
export const ask_degree = make({ type: 'question', name: 'degree' });
export const ask_nearest = make({ type: 'question', name: 'nearest' });
export const ask_extreme = make({ type: 'question', name: 'extreme' });
export const ask_path = make({ type: 'question', name: 'path' });
export const ask_reachable = make({ type: 'question', name: 'reachable' });
export const ask_cycle = make({ type: 'question', name: 'cycle' });
export const ask_rules = make({ type: 'question', name: 'rules' });
export const fact = make({ type: 'fact' });
export const rule = make({ type: 'rule' });

/** Reads a sentence without running it: the nodes the engine's rules reader makes of it (used by the evaluators). */
export function read(text, state = {}) {
  if (!K) return null;
  const s = { ...initialState(), ...state };
  assignIds(s);
  const prepared = prepareText(text, s), f = systemFor(s).formalize(prepared, readerCtx(s));
  const fx = fixNodes(f.nodes, prepared, s);
  return fx.nodes ? { ...f, nodes: fx.nodes } : f;
}
export const kit = () => K;

/** The 24 diagram templates by name (the legend of the engine). */
export const templateNames = (s) => [...new Set(systemFor(s).engine.legend.lexicon('template').values())];
const offer = (s) => `Templates: ${listing(templateNames(s))}. Say for example "make a ${['tree', 'cycle', 'pyramid', 'flowchart'][s.shapes.length % 4]}" or just start drawing.`;
const clear = (ctx, s) => { Object.assign(s, initialState()); sysOf = null; open(ctx); };

/** "create / start / new diagram": with shapes on the canvas it asks whether to keep them; "clear the canvas" starts empty at once. */
export const newDiagram = (ctx, args = {}) => {
  if (!K) return NOT_READY();
  const s = ensure(ctx);
  const text = String(args.text ?? '');
  const explicitClear = /\b(clear|reset|empty|blank|wipe|erase)\b/i.test(text);
  if (s.shapes.length && !explicitClear) {
    s.pending = 'new';
    open(ctx);
    return ok(`The diagram has ${s.shapes.length} shape${s.shapes.length === 1 ? '' : 's'}. Keep the current one or start empty? ${offer(s)}`);
  }
  clear(ctx, s);
  return ok(`A clean canvas. What shall we draw? ${offer(s)}`);
};
/** The answer to "Keep the current one or start empty?" ("keep it", "start empty"). */
export const answerNew = (ctx, args = {}) => {
  if (!K) return NOT_READY();
  const s = ensure(ctx);
  const text = String(args.text ?? '');
  if (s.pending !== 'new') return no('There is nothing to confirm right now. Say "create a diagram" to start a new one.', 'unsupported');
  s.pending = null;
  if (/\b(keep|current|stay|continue|same|no)\b/i.test(text) && !/\b(empty|fresh|blank|new one|over|clear)\b/i.test(text)) { open(ctx); return ok(`OK, I keep the current diagram. ${offer(s)}`); }
  clear(ctx, s);
  return ok(`A clean canvas. What shall we draw? ${offer(s)}`);
};
export const select = make({ type: 'command', name: 'select' });
export const openTab = (ctx) => {
  const r = ctx.request('ui.openTab', { tab: TAB });
  return r?.status === 'supported' ? ok('OK, here is the diagram editor.') : ok('The diagram editor is right here. Say what to draw, for example "draw a red circle called Start".');
};
export const exportDiagram = (ctx, args = {}) => {
  const s = ensure(ctx);
  if (!s.shapes.length) return no('The diagram is empty, so there is nothing to save yet.', 'missing');
  const format = /png/i.test(String(args.format ?? '')) ? 'png' : 'svg';
  ctx.effect('diagram.download', { format, filename: 'my-diagram' });
  open(ctx);
  return ok(`OK, saving the diagram as ${format.toUpperCase()}.`);
};

// ---- discourse hooks (spec 11): read-only --------------------------------------------------------------------------------
/** Everything a person can point at ("Api", "the red one", "it"): one referent per shape. */
export function referents(ctx) {
  const s = ensure(ctx);
  const salient = new Set(s.last ?? []);
  return s.shapes.filter((x) => x.layer !== 'background').map((x) => ({
    id: x.name, kind: x.shape, noun: x.shape, words: [x.shape, x.name.toLowerCase()],
    attrs: { color: x.color, size: x.size, x: x.x, y: x.y }, salient: salient.has(x.name), sig: JSON.stringify([x.name, x.shape, x.x, x.y, x.size, x.color, x.label]),
  }));
}
/** One sentence about the diagram, for "where were we?". */
export function summary(ctx) {
  const s = ensure(ctx);
  if (!s.shapes.length) return null;
  const n = s.shapes.length, e = s.edges.length;
  return `The diagram has ${n} shape${n === 1 ? '' : 's'}${e ? ` and ${e} connection${e === 1 ? '' : 's'}` : ''}: ${listing(s.shapes.slice(0, 6).map((x) => x.name))}${n > 6 ? ' and more' : ''}.`;
}
export { _delete as delete };

const NAMED_ACTIONS = new Set(['delete', 'move', 'rename', 'resize', 'set', 'label', 'duplicate', 'toFront', 'toBack']);
const BARE_VERBS = /^(?:please\s+)?(?:delete|remove|erase|move|rename|resize|duplicate|copy|label)\s+(?:the\s+)?/i;
const NOT_A_NAME = /^(?:shapes?|arrows?|lines?|connections?|everything|all|nothing|diagram|canvas|picture|them|it|this|that|these|those|each|every|last|first|next|previous|other|another|same|left|right|top|bottom|up|down|center|middle|front|back|one|ones|to|with|and|by|from|on|in|at|a|an|the|text|label|group|template|background|layer)$/i;
const KIND_NOUNS = 'box|boxes|circle|rectangle|square|oval|ellipse|triangle|diamond|hexagon|star|rhombus|rect';
/**
 * The names a command points at ("the box End", "the circle called Moon", a bare capitalised "End") that the diagram has no shape or group for. Read-only,
 * shared by the operation (which must not act on another shape) and the world-aware hook. Only a name that is clearly a name counts: it follows a kind
 * word and is capitalised, quoted or introduced by "called"/"named", or it is the capitalised object right after the verb. Short ids (c1, circle1) are left to the engine.
 */
export function missingNamed(state, action, text) {
  const t = String(text ?? '').trim();
  // a sentence the patterns took for a creation ("delete the box called Moon" reads as a named shape) is still a delete: the leading verb decides
  if (!NAMED_ACTIONS.has(action) && !(action === 'create' && BARE_VERBS.test(t))) return [];
  const known = (n) => !n || NOT_A_NAME.test(n) || ID_RE.test(n) || LONG_RE.test(n) || shapeOf(state, n) || (state.groups ?? []).some((g) => String(g.name).toLowerCase() === n.toLowerCase());
  const out = [];
  const add = (n) => { n = String(n ?? '').trim(); if (!known(n) && !out.some((x) => x.toLowerCase() === n.toLowerCase())) out.push(n); };
  const re = new RegExp(`\\b(?:${KIND_NOUNS})\\s+(?:(called|named)\\s+)?(?:["\u201c]([^"\u201d]+)["\u201d]|([A-Za-z][\\w-]*))`, 'gi');
  for (const m of t.matchAll(re)) {
    budget.tick('diagram.missingNamed');
    const called = m[1], quoted = m[2], word = m[3];
    if (quoted != null || called || /^[A-Z]/.test(word)) add(quoted ?? word);
  }
  if (!out.length) {
    const b = BARE_VERBS.exec(t);
    if (b) { const w = /^["\u201c]?([A-Z][\w-]*)["\u201d]?(?=\s|[.!?,]|$)/.exec(t.slice(b[0].length)); if (w && !new RegExp(`^(?:${KIND_NOUNS})$`, 'i').test(w[1])) add(w[1]); }
  }
  return out;
}

/**
 * World-aware hook (spec 16), read-only: the shapes a "connect A to B" names that the diagram does not have, and the sentence that would add them and
 * connect, so the dialogue can say "I can't find a box called “End”. Shall I add it?" instead of "a connection needs two ends". `undefined` when every name
 * is a shape (or the request names none: "connect them").
 */
export function checkReferents(ctx, { action, args = {} } = {}) {
  const named = missingNamed(ctx.state ?? {}, String(action ?? '').replace(/^diagram\./, ''), args.text);
  if (named.length) {
    const have = ((ctx.state ?? {}).shapes ?? []).filter((x) => !x.layer && !x.template).map((x) => x.name);
    return { missing: named.map((name) => ({ name, kind: 'box' })), here: have.length ? have.join(', ') : null, where: 'diagram' };   // no offer: nothing to add
  }
  if (action !== 'diagram.connect') return undefined;
  const m = /^\s*(?:please\s+)?(?:connect|link|join)\s+(.+?)\s+(?:to|with|and)\s+(.+?)\s*[.!?]?\s*$/i.exec(String(args.text ?? ''));
  if (!m) return undefined;
  const state = ctx.state ?? {};
  // the second name stops before a how-phrase ("with a line", "using a dotted line", "by an arrow"); a quantified or relative name ("each square", "the next one") is not a name
  const names = [m[1], m[2].replace(/\s+(?:with|using|via|by|through|in|as)\s+.*$/i, '')].map((x) => x.replace(/^["'“]|["'”]$/g, '').replace(/^(?:the|a|an)\s+/i, '').trim());
  if (names.some((x) => !x || /,|\band\b/i.test(x) || /^(?:them|it|these|those|each other)$/i.test(x) || /\b(?:each|every|all|next|previous|last|first|other|another|one|ones)\b/i.test(x))) return undefined;
  const noun = (/\b(box|circle|rectangle|square|oval|ellipse|triangle|diamond)\b/i.exec(String(args.text ?? '').replace(m[1], '').replace(m[2], '')) ?? [, 'box'])[1].toLowerCase();   // the user's own noun, else the everyday one
  const missing = names.filter((x) => !shapeOf(state, x)).map((name) => ({ name, kind: noun }));
  if (!missing.length) return undefined;
  const have = (state.shapes ?? []).filter((x) => !x.layer && !x.template).map((x) => x.name);
  return { missing, here: have.length ? have.join(', ') : null, where: 'diagram', offer: `${missing.map((x) => `add a rectangle called ${x.name}`).join(' and ')} and connect ${names[0]} to ${names[1]}` };
}
