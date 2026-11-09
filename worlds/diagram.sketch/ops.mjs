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

const TAB = 'diagram';
const MAX_HISTORY = 30;
let K = null, loading = null, sys = null, sysOf = null;

/** Starts loading the engine (once). Returns a promise of the engine kit. */
export function loadEngine() {
  loading ??= import('./engine/logic.mjs').then((m) => { K = m.default; return K; });
  return loading;
}
export const engineReady = () => !!K;
/** Async hook called by the dialog layer before this world's operations run (spec 04): the first sentence waits for the engine instead of being refused. */
export const prepare = () => loadEngine();
if (typeof process !== 'undefined' && process.versions?.node) await loadEngine();

export function initialState() {
  return {
    shapes: [], edges: [], rules: [], seq: {}, edgeSeq: 0, ruleSeq: 0, order: 0, frame: { x: 0, y: 0 }, frames: [], groups: [],
    last: [], selected: null, undo: [], redo: [], rev: 0,
  };
}
function ensure(ctx) {
  const s = ctx.state, d = initialState();
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  return s;
}

const ok = (value, extra) => ({ status: 'supported', value, ...extra });
const no = (note, status = 'unsupported') => ({ status, note });
const open = (ctx) => { try { ctx.request('ui.openTab', { tab: TAB }); } catch { /* the shell may not know the tab */ } };
const WORLD_KEYS = ['shapes', 'edges', 'rules', 'seq', 'edgeSeq', 'ruleSeq', 'order', 'frame', 'frames', 'groups', 'facts'];

// ---- the engine bound to a state --------------------------------------------------------------------------------------
/** One engine system (the legend and plugins are built once); its world is loaded from `s` before and written back after each run. */
function systemFor(s) {
  if (!sys) sys = K.createSystem();
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
  while (s.undo.length > MAX_HISTORY) s.undo.shift();
  while (s.redo.length > MAX_HISTORY) s.redo.shift();
  s.rev = (s.rev ?? 0) + 1; w.rev = s.rev;
  w.state = structuredClone(Object.fromEntries(WORLD_KEYS.filter((k) => s[k] !== undefined).map((k) => [k, s[k]])));   // the state of the context is never aliased by the engine
}
const readerCtx = (s) => ({
  names: s.shapes.map((x) => x.name).concat((s.groups ?? []).map((g) => g.name)),
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
function summarize(result) {
  const adds = [], links = [], unlinks = [], dels = [], moved = [], changed = [], renames = [], rules = [], said = [], answers = [];
  for (const st of result.steps) {
    if (st.node.type === 'mention' || st.error || st.skipped) continue;
    if (st.node.args && st.node.args.template && st.answer) { answers.push(st.answer); continue; }
    for (const p of st.patches) {
      if (p.op === 'add') adds.push(`${p.shape.name}`);
      else if (p.op === 'link') links.push(K.edgeText(p.edge).replace(/ \(.*$|\s+".*"$/, ''));
      else if (p.op === 'unlink') unlinks.push(p.edge ? `${p.edge.from}–${p.edge.to}` : p.id);
      else if (p.op === 'remove') dels.push(p.name);
      else if (p.op === 'rename') renames.push(`${p.from} to ${p.to}`);
      else if (p.op === 'rule') rules.push(p.rule);
      else if (p.op === 'forget') said.push('Forgot all default rules.');
      else if (p.op === 'reorder') said.push(p.to === 'front' ? `Brought ${p.name} to the front.` : `Sent ${p.name} to the back.`);
      else if (p.op === 'edgeSet') { if (!st.answer && p.edge) said.push(`The arrow ${p.edge.from}–${p.edge.to} ${p.edge.label ? `now says “${p.edge.label}”` : 'has no label now'}.`); }
      else if (p.op === 'set') {
        if ('x' in p.props && !moved.includes(p.name)) moved.push(p.name);
        const ch = Object.entries(p.props).filter(([k]) => k !== 'x' && k !== 'y').map(([k, v]) => (k === 'size' ? K.sizeName(v) : k === 'label' ? `labeled “${v}”` : k === 'outline' ? (v ? `${v} outline` : 'no outline') : k === 'shape' ? `a ${v}` : String(v)));
        if (ch.length) changed.push(`${p.name} is now ${listing(ch)}`);
      }
    }
    if (st.answer) answers.push(st.answer);
    for (const n of st.notes || []) if (/^(reverted|re-applied|there was nothing)|already/.test(n)) said.push(n.charAt(0).toUpperCase() + n.slice(1) + '.');
  }
  const out = [];
  if (adds.length) out.push(`Drew ${few(adds, 6)}.`);
  if (links.length) out.push(`Connected ${few(links, 4)}.`);
  if (renames.length) out.push(`Renamed ${listing(renames)}.`);
  if (changed.length) out.push(changed.slice(0, 4).join('; ') + (changed.length > 4 ? `; and ${changed.length - 4} more.` : '.'));
  if (moved.length) out.push(`Moved ${few(moved, 5)}.`);
  if (unlinks.length) out.push(`Removed the link${unlinks.length > 1 ? 's' : ''} ${few(unlinks, 4)}.`);
  if (dels.length) out.push(`Deleted ${few(dels, 6)}.`);
  for (const r of rules) out.push(`From now on, new ${r.shape ? `${r.shape}s` : 'shapes'} will be ${['size', 'color'].filter((k) => r[k]).map((k) => r[k]).join(' ')}${r.outline ? ` with a ${r.outline} outline` : ''}.`);
  out.push(...said.map((x) => x.replace(/^Reverted 1 turn\.$/, 'Undid the last change.').replace(/^Re-applied 1 turn\.$/, 'Redid it.')));
  out.push(...answers);
  return out.join(' ') || 'Done.';
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
  if (result.changed || s.shapes.length !== before) open(ctx);
  if (!result.ok) {
    const err = result.error;
    const text = summarize({ steps: result.steps.filter((st) => !st.error) });
    const said = err?.message ?? 'I could not do that.';
    const clarify = err && err.name === 'Clarify';
    if (result.partial) return ok(`${text} But: ${said}`);
    return no(said, clarify ? 'missing' : 'unsupported');
  }
  open(ctx);
  return ok(summarize(result));
}

const NOT_READY = () => { loadEngine(); return no('The diagram engine is still loading. Please say that again in a moment.', 'missing'); };
/** Common entry of every operation: `kind` = { type, name } of the engine wire. */
const make = (kind) => (ctx, args = {}) => {
  if (!K) return NOT_READY();
  const s = ensure(ctx);
  const text = args.text != null ? String(args.text).trim() : '';
  if (text) {
    const f = systemFor(s).formalize(text, readerCtx(s));
    const nodes = f.nodes;
    if (!nodes.length) return no(`I could not read "${text}" as something to do with the diagram.${(f.notes ?? []).length ? ` ${f.notes[0]}` : ''}`, 'missing');
    return execute(ctx, s, nodes);
  }
  return execute(ctx, s, nodesOf(kind, args, s, systemFor(s).engine.legend));
};

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
  return systemFor(s).formalize(text, readerCtx(s));
}
export const kit = () => K;

export const newDiagram = (ctx) => {
  const s = ensure(ctx);
  Object.assign(s, initialState());
  sysOf = null;
  open(ctx);
  return ok('A clean canvas. What shall we draw?');
};
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
