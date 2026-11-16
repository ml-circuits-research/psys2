/*LOGIC-START*/
const SOPKit = (function () {
'use strict';

/* =====================================================================
   1. SOP Lang core: values, parser, serializer
   ===================================================================== */
class SOPError extends Error { constructor(message, extra) { super(message); this.name = 'SOPError'; Object.assign(this, extra || {}); } }
class Clarify extends SOPError { constructor(message, extra) { super(message, extra); this.name = 'Clarify'; } }

const isRef = v => !!v && typeof v === 'object' && !Array.isArray(v) && typeof v.ref === 'string';
const ref = id => ({ ref: id });
const names = v => v == null ? [] : [].concat(v).flat(Infinity).filter(x => x != null && x !== '').map(String);

function splitTop(str, isSep) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (q) { cur += c; if (c === '\\' && i + 1 < str.length) cur += str[++i]; else if (c === '"') q = false; continue; }
    if (c === '"') { q = true; cur += c; continue; }
    if (isSep(c)) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (q) throw new SOPError('Unclosed quote in: ' + str);
  out.push(cur); return out;
}
function parseScalar(s) {
  if (s.startsWith('"')) { try { return JSON.parse(s); } catch (e) { throw new SOPError('Bad string literal: ' + s); } }
  if (s.startsWith('$')) { if (!/^\$[A-Za-z_][\w-]*$/.test(s)) throw new SOPError('Bad wire reference: ' + s); return ref(s.slice(1)); }
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}
function parseValue(raw) {
  const parts = splitTop(raw, c => c === ',').filter(p => p !== '').map(parseScalar);
  return parts.length === 1 ? parts[0] : parts;
}
function forEachRef(v, fn) { if (isRef(v)) fn(v.ref); else if (Array.isArray(v)) v.forEach(x => forEachRef(x, fn)); }

function parse(text) {
  const nodes = []; const seen = new Set();
  text.split('\n').forEach((line, i) => {
    line = line.trim(); if (!line || line.startsWith('#')) return;
    const toks = splitTop(line, c => /\s/.test(c)).filter(Boolean);
    const head = toks.shift(), type = toks.shift();
    if (!/^@[A-Za-z_][\w-]*$/.test(head || '')) throw new SOPError(`Line ${i + 1}: expected @wireId, found "${head}"`);
    if (!/^[A-Za-z_][\w-]*$/.test(type || '')) throw new SOPError(`Line ${i + 1}: expected a wire type after ${head}`);
    const id = head.slice(1); const args = {};
    for (const t of toks) {
      const eq = t.indexOf('=');
      if (eq < 1) throw new SOPError(`Line ${i + 1}: "${t}" should look like question=answer`);
      args[t.slice(0, eq)] = parseValue(t.slice(eq + 1));
    }
    for (const v of Object.values(args)) forEachRef(v, r => { if (!seen.has(r)) throw new SOPError(`@${id} reads $${r} before it is defined (wires are SSA: define first, then use)`); });
    if (seen.has(id)) throw new SOPError(`@${id} is defined twice (each wire has exactly one definition)`);
    seen.add(id); nodes.push({ id, type, args });
  });
  return nodes;
}
function fmtScalar(v) {
  if (isRef(v)) return '$' + v.ref;
  if (typeof v === 'number') return String(v);
  v = String(v);
  return /^[A-Za-z_][\w.+-]*$/.test(v) ? v : JSON.stringify(v);
}
const fmtValue = v => Array.isArray(v) ? v.map(fmtScalar).join(',') : fmtScalar(v);
const KEY_ORDER = ['action', 'ask', 'quantifier', 'count', 'shape', 'kind', 'property', 'superlative', 'comparison', 'size', 'scale', 'color', 'outline', 'name', 'label', 'target', 'from', 'to', 'style', 'arrow', 'position', 'anchor', 'position2', 'anchor2', 'region', 'members', 'at', 'direction', 'distance', 'axis', 'layout', 'linked'];
function serialize(n) {
  const keys = Object.keys(n.args).filter(k => { const v = n.args[k]; return v != null && !(Array.isArray(v) && !v.length); });
  keys.sort((a, b) => (KEY_ORDER.indexOf(a) + 1 || 99) - (KEY_ORDER.indexOf(b) + 1 || 99));
  return '@' + n.id + ' ' + n.type + keys.map(k => ' ' + k + '=' + fmtValue(n.args[k])).join('');
}

/* =====================================================================
   2. Legend registry: questions, answer kinds, lexical cues
   ===================================================================== */
class Legend {
  constructor() { this.questions = new Map(); }
  define(plugin, key, spec) {
    const cur = this.questions.get(key);
    if (cur) {
      if (spec.values) cur.values = Object.assign({}, cur.values, spec.values);
      if (!cur.plugins.includes(plugin)) cur.plugins.push(plugin);
      return cur;
    }
    const q = { key, plugins: [plugin], ask: spec.ask, kind: spec.kind || 'text', values: spec.values ? Object.assign({}, spec.values) : null, cueNote: spec.cueNote || null };
    this.questions.set(key, q); return q;
  }
  get(key) { return this.questions.get(key); }
  lexicon(key) {
    const q = this.get(key); const m = new Map(); if (!q || !q.values) return m;
    for (const [v, cues] of Object.entries(q.values)) { m.set(v.toLowerCase(), v); for (const c of cues || []) m.set(c.toLowerCase(), v); }
    return m;
  }
  validate(node) {
    const out = [];
    for (const [k, v] of Object.entries(node.args)) {
      const q = this.get(k);
      if (!q) { out.push({ level: 'warn', msg: `"${k}" is not a question in the legend; it is ignored` }); continue; }
      for (const x of [].concat(v)) {
        if (isRef(x)) continue;
        if (q.kind === 'enum' && q.values && !(String(x) in q.values)) out.push({ level: 'error', msg: `${k}=${x} is not a known answer (expected ${Object.keys(q.values).join(' | ')})` });
        if (q.kind === 'number' && typeof x !== 'number') out.push({ level: 'error', msg: `${k} expects a number, got ${x}` });
      }
    }
    return out;
  }
}

/* =====================================================================
   3. Engine: plugins, pattern dispatch, transactional execution
   ===================================================================== */
class Engine {
  constructor(world) { this.world = world; this.legend = new Legend(); this.plugins = []; this.handlers = []; this.wireTypes = new Map(); }
  use(p) {
    p.enabled = p.enabled !== false; this.plugins.push(p);
    for (const [t, doc] of Object.entries(p.wireTypes || {})) this.wireTypes.set(t, { doc, plugin: p });
    for (const [k, s] of Object.entries(p.legend || {})) this.legend.define(p.name, k, s);
    for (const h of p.handlers || []) this.handlers.push(Object.assign({}, h, { plugin: p }));
    return this;
  }
  plugin(name) { return this.plugins.find(p => p.name === name); }
  match(type, args) {
    const fits = this.handlers.filter(h => h.type === type && Object.entries(h.when || {}).every(([k, v]) =>
      Array.isArray(v) ? v.includes(args[k]) : v === true ? args[k] != null : args[k] === v));
    const live = fits.filter(h => h.plugin.enabled);
    if (!live.length) {
      if (fits.length) throw new SOPError(`The "${fits[0].plugin.title}" plugin interprets this wire, but it is switched off.`);
      throw new SOPError(`No interpreter is registered for ${type}${args.action ? ' action=' + args.action : ''}${args.ask ? ' ask=' + args.ask : ''}.`);
    }
    live.sort((a, b) => ((b.plugin.priority || 0) - (a.plugin.priority || 0)) || (Object.keys(b.when || {}).length - Object.keys(a.when || {}).length));
    return live[0];
  }
  fallback(type, args, ctx, self) {
    const fits = this.handlers.filter(h => h.plugin.enabled && h !== self && h.plugin !== (self && self.plugin) && h.type === type && Object.entries(h.when || {}).every(([k, v]) => Array.isArray(v) ? v.includes(args[k]) : v === true ? args[k] != null : args[k] === v));
    const own = this.handlers.find(h => h.run === (self && self.run));
    const rest = fits.filter(h => !own || h.plugin !== own.plugin).sort((a, b) => ((b.plugin.priority || 0) - (a.plugin.priority || 0)) || (Object.keys(b.when || {}).length - Object.keys(a.when || {}).length));
    if (!rest.length) throw new SOPError(`No other interpreter can answer ${type} ask=${args.ask}.`);
    return rest[0].run(args, ctx) || {};
  }
  resolve(v, env) {
    if (isRef(v)) { if (!(v.ref in env)) throw new SOPError(`$${v.ref} has no value`); return env[v.ref]; }
    if (Array.isArray(v)) return v.flatMap(x => [].concat(this.resolve(x, env)));
    return v;
  }
  run(nodes, opts) {
    const overrides = (opts && opts.overrides) || {};
    const partial = !(opts && opts.partial === false);       // default: run what can run, report the rest (one transaction per message)
    let before = this.world.snapshot(); const env = {}; const steps = []; let changed = false;
    // undo / redo step over the last executed ACTION, including actions of this same message. L = this message's executed actions
    // (each with the state before it), R = the ones undone here (for redo). With none of this message's own left to step over, they fall
    // back to the previous turns (world.undo / world.redo); after such a fallback the message's history restarts from the new state.
    const L = [], R = [];
    const hist = {
      undo: () => {
        const e = L.pop();
        if (e) { R.push({ e, after: this.world.snapshot() }); this.world.restore(e.mark); e.step.patches = []; return 'action'; }
        this.world.undo(); before = this.world.snapshot(); R.length = 0; return 'turn';
      },
      redo: () => {
        const r = R.pop();
        if (r) { this.world.restore(r.after); r.e.step.patches = r.e.patches; L.push(r.e); return 'action'; }
        this.world.redo(); before = this.world.snapshot(); L.length = 0; return 'turn';
      }
    };
    const failed = new Map();                                    // wire id -> error (its own, or the wire it depends on)
    const fr = this.world.state.frame || { x: 0, y: 0 }; FR.x = fr.x; FR.y = fr.y;
    const refsOf = (v, out) => { if (isRef(v)) out.push(v.ref); else if (Array.isArray(v)) v.forEach(x => refsOf(x, out)); return out; };
    for (const node of nodes) {
      const step = { node, issues: this.legend.validate(node), patches: [] }; steps.push(step);
      const dep = Object.values(node.args).flatMap(v => refsOf(v, [])).find(r => failed.has(r));
      if (dep && !(node.id in overrides)) { step.skipped = dep; failed.set(node.id, failed.get(dep)); continue; }
      const mark = this.world.snapshot(), nPatch = () => step.patches.length;
      try {
        const bad = step.issues.find(i => i.level === 'error'); if (bad) throw new SOPError(`@${node.id}: ${bad.msg}`);
        if (node.id in overrides) { env[node.id] = overrides[node.id]; step.plugin = 'you'; step.value = overrides[node.id]; step.notes = ['you chose ' + names(overrides[node.id]).join(', ')]; continue; }
        if (!this.wireTypes.has(node.type)) throw new SOPError(`Unknown wire type "${node.type}". Known: ${[...this.wireTypes.keys()].join(', ')}`);
        if (!this.wireTypes.get(node.type).plugin.enabled) throw new SOPError(`Wire type "${node.type}" belongs to the "${this.wireTypes.get(node.type).plugin.title}" plugin, which is switched off.`);
        const args = {}; for (const [k, v] of Object.entries(node.args)) args[k] = this.resolve(v, env);
        const h = this.match(node.type, args); step.plugin = h.plugin.name;
        const ctx = { world: this.world, engine: this, node, env, undo: hist.undo, redo: hist.redo, emit: p => { this.world.apply(p); step.patches.push(p); changed = true; } };
        const out = h.run(args, ctx) || {};
        Object.assign(step, { value: out.value, answer: out.answer, notes: out.notes, lowering: out.lowering, highlight: out.highlight });
        env[node.id] = out.value;
        if (step.patches.length) { L.push({ step, mark, patches: step.patches }); R.length = 0; }
      } catch (e) {
        if (!partial) { this.world.restore(before); return { ok: false, steps, error: e }; }
        if (nPatch()) { this.world.restore(mark); step.patches = []; }   // a wire is applied whole or not at all
        step.error = e; failed.set(node.id, e);
      }
    }
    if (changed && L.length) this.world.commit(before);
    const errors = steps.filter(st => st.error).map(st => ({ node: st.node, error: st.error, dependents: steps.filter(x => x.skipped && failed.get(x.node.id) === st.error).map(x => x.node) }));
    const done = steps.filter(st => !st.error && !st.skipped).length;
    return { ok: !errors.length, partial: errors.length > 0 && done > 0, steps, env, changed: steps.some(st => st.patches.length), errors, error: errors.length ? errors[0].error : null };
  }
}

/* =====================================================================
   4. Diagram world (state + patches + history)
   ===================================================================== */
const CANVAS = { W: 800, H: 500 };
const SIZE_PX = { tiny: 30, small: 44, medium: 62, large: 88, huge: 118 };
const COLOR_HEX = { red: '#E5484D', orange: '#F0803C', yellow: '#F2C94C', gold: '#D4A017', lime: '#9CCB3B', green: '#3E9B57', teal: '#159E93', cyan: '#3BB4D0', blue: '#3A6BDC', navy: '#22346B', indigo: '#4F46C8', purple: '#8B4FC4', magenta: '#C23FA6', pink: '#EC7FAE', brown: '#8B5A3C', gray: '#8C929B', black: '#24282E', white: '#F7F8F9' };
const sizeName = px => Object.entries(SIZE_PX).reduce((b, [k, v]) => Math.abs(v - px) < Math.abs(SIZE_PX[b] - px) ? k : b, 'medium');
function dims(s) {
  if (s.box) return { w: s.box.w, h: s.box.h };   /* a group used as an anchor: the box around its members */
  const k = s.size;
  if (s.shape === 'rectangle') return { w: Math.round(k * 1.6), h: k };
  if (s.shape === 'ellipse') return { w: Math.round(k * 1.45), h: k };
  return { w: k, h: k };
}

class DiagramWorld {
  constructor() { this.state = { shapes: [], edges: [], rules: [], seq: {}, edgeSeq: 0, ruleSeq: 0, order: 0, frame: { x: 0, y: 0 }, frames: [], groups: [] }; this.undoStack = []; this.redoStack = []; this.listeners = []; }
  snapshot() { return JSON.parse(JSON.stringify(this.state)); }
  restore(s) { this.state = JSON.parse(JSON.stringify(s)); }
  commit(before) { this.undoStack.push(before); if (this.undoStack.length > 100) this.undoStack.shift(); this.redoStack = []; }
  undo() { if (!this.undoStack.length) throw new SOPError('There is nothing to undo.'); this.redoStack.push(this.snapshot()); this.restore(this.undoStack.pop()); }
  redo() { if (!this.redoStack.length) throw new SOPError('There is nothing to redo.'); this.undoStack.push(this.snapshot()); this.restore(this.redoStack.pop()); }
  newFrame(title) {
    const S = this.state, used = c => S.shapes.some(s => { const k = cellOf(s.x, s.y); return k.x === c.x && k.y === c.y; });
    for (let k = 0; k < 400; k++) {
      const c = { x: (k % 2) * CELL.W, y: Math.floor(k / 2) * CELL.H };
      if (!used(c)) { S.frame = c; S.frames = (S.frames || []).filter(f => !(f.x === c.x && f.y === c.y)).concat([{ x: c.x, y: c.y, title }]); return c; }
    }
    return S.frame;
  }
  find(name) { if (name == null) return null; const l = String(name).toLowerCase(); return this.state.shapes.find(s => s.name.toLowerCase() === l) || null; }
  findGroup(name) { if (name == null) return null; const l = String(name).toLowerCase(); return (this.state.groups || []).find(g => g.name.toLowerCase() === l) || null; }
  groupOf(shapeName) { return (this.state.groups || []).find(g => g.members.includes(shapeName)) || null; }
  nextName(shape) { let n; do { this.state.seq[shape] = (this.state.seq[shape] || 0) + 1; n = shape + this.state.seq[shape]; } while (this.find(n)); return n; }
  newEdge(from, to, o) { return Object.assign({ id: 'e' + (++this.state.edgeSeq), from, to, style: 'solid', arrow: 'forward', label: null, color: null }, o || {}); }
  apply(p) {
    const S = this.state;
    switch (p.op) {
      case 'add': S.shapes.push(Object.assign({}, p.shape, { order: ++S.order })); break;
      case 'remove': S.shapes = S.shapes.filter(s => s.name !== p.name); if (S.groups) S.groups = S.groups.map(g => Object.assign({}, g, { members: g.members.filter(m => m !== p.name) })).filter(g => g.members.length); break;
      case 'set': { const s = this.find(p.name); p.before = {}; for (const k of Object.keys(p.props)) p.before[k] = s[k]; Object.assign(s, p.props); break; }
      case 'rename': { const s = this.find(p.from); s.name = p.to; for (const e of S.edges) { if (e.from === p.from) e.from = p.to; if (e.to === p.from) e.to = p.to; } for (const g of S.groups || []) g.members = g.members.map(m => m === p.from ? p.to : m); break; }
      /* groups: a shape is in at most one group; `group` sets a group's members (taking them out of any other group, and dropping a group
         left empty), `ungroup` removes the group and keeps its shapes, `renameGroup` renames it */
      case 'group': { const m = p.group.members; S.groups = (S.groups || []).filter(g => g.name !== p.group.name).map(g => Object.assign({}, g, { members: g.members.filter(x => !m.includes(x)) })).filter(g => g.members.length).concat([{ name: p.group.name, members: m.slice() }]); break; }
      case 'ungroup': p.group = (S.groups || []).find(g => g.name === p.name); S.groups = (S.groups || []).filter(g => g.name !== p.name); break;
      case 'renameGroup': { const g = (S.groups || []).find(x => x.name === p.from); g.name = p.to; break; }
      case 'link': S.edges.push(p.edge); break;
      case 'unlink': p.edge = S.edges.find(e => e.id === p.id); S.edges = S.edges.filter(e => e.id !== p.id); break;
      case 'rule': S.rules.push(p.rule); break;
      case 'forget': S.rules = []; break;
      case 'reorder': { const i = S.shapes.findIndex(x => x.name === p.name); p.from = i; const [sh] = S.shapes.splice(i, 1); if (p.to === 'front') S.shapes.push(sh); else S.shapes.unshift(sh); break; }
      default: throw new SOPError('Unknown patch op ' + p.op);
    }
  }
}

/* ---------- geometry & placement ---------- */
const CELL = { W: 880, H: 580 };
const FR = { x: 0, y: 0 };
const cellOf = (x, y) => ({ x: Math.floor(x / CELL.W) * CELL.W, y: Math.floor(y / CELL.H) * CELL.H });
function inCell(x, y, fn) { const sx = FR.x, sy = FR.y, c = cellOf(x, y); FR.x = c.x; FR.y = c.y; try { return fn(); } finally { FR.x = sx; FR.y = sy; } }
const spot = p => [SPOTS[p][0] + FR.x, SPOTS[p][1] + FR.y];
const boxAt = (x, y, w, h) => ({ x1: x - w / 2, y1: y - h / 2, x2: x + w / 2, y2: y + h / 2 });
function hits(W, b, ignore, pad) {
  pad = pad == null ? 14 : pad;
  return W.state.shapes.some(s => {
    if (ignore.includes(s.name)) return false;
    const d = dims(s), o = boxAt(s.x, s.y, d.w, d.h);
    return b.x1 < o.x2 + pad && b.x2 > o.x1 - pad && b.y1 < o.y2 + pad && b.y2 > o.y1 - pad;
  });
}
const clampPt = (x, y, w, h) => ({ x: Math.round(Math.min(FR.x + CANVAS.W - w / 2 - 10, Math.max(FR.x + w / 2 + 10, x))), y: Math.round(Math.min(FR.y + CANVAS.H - h / 2 - 10, Math.max(FR.y + h / 2 + 24, y))) });
const SPOTS = { center: [400, 250], top: [400, 70], bottom: [400, 430], left: [90, 250], right: [710, 250], topLeft: [90, 70], topRight: [710, 70], bottomLeft: [90, 430], bottomRight: [710, 430] };
function nearFree(W, x, y, w, h, ignore) {
  const p = clampPt(x, y, w, h); if (!hits(W, boxAt(p.x, p.y, w, h), ignore)) return p;
  for (let r = 1; r <= 9; r++) for (let a = 0; a < 8 * r; a++) {
    const ang = a / (8 * r) * Math.PI * 2, q = clampPt(x + Math.cos(ang) * r * 46, y + Math.sin(ang) * r * 46, w, h);
    if (!hits(W, boxAt(q.x, q.y, w, h), ignore)) return q;
  }
  return p;
}
function autoSpot(W, w, h, ignore) {
  for (let y = FR.y + 70; y <= FR.y + CANVAS.H - 50; y += 100) for (let x = FR.x + 80; x <= FR.x + CANVAS.W - 60; x += 125) {
    const p = clampPt(x, y, w, h); if (!hits(W, boxAt(p.x, p.y, w, h), ignore)) return p;
  }
  return nearFree(W, FR.x + 400, FR.y + 250, w, h, ignore);
}
function relSpot(W, w, h, pos, anchors, dist, ignore) { return inCell(anchors[0].x, anchors[0].y, () => relSpot0(W, w, h, pos, anchors, dist, ignore)); }
function relSpot0(W, w, h, pos, anchors, dist, ignore) {
  const a = anchors[0], ad = dims(a), gap = dist != null ? +dist : 56;
  if (pos === 'between') { const b = anchors[1] || a; return nearFree(W, (a.x + b.x) / 2, (a.y + b.y) / 2, w, h, ignore); }
  const calc = p => ({ leftOf: [a.x - ad.w / 2 - gap - w / 2, a.y, -1, 0], rightOf: [a.x + ad.w / 2 + gap + w / 2, a.y, 1, 0], above: [a.x, a.y - ad.h / 2 - gap - 16 - h / 2, 0, -1], below: [a.x, a.y + ad.h / 2 + gap + 16 + h / 2, 0, 1] })[p];
  const order = pos === 'near' ? ['rightOf', 'below', 'leftOf', 'above'] : [pos];
  for (const p of order) {
    let [x, y, dx, dy] = calc(p);
    for (let i = 0; i < 6; i++) {
      const q = clampPt(x, y, w, h);
      const inBounds = Math.abs(q.x - x) < 2 && Math.abs(q.y - y) < 2;
      if (inBounds && !hits(W, boxAt(q.x, q.y, w, h), ignore)) return q;
      x += dx * (w + 24); y += dy * (h + 24);
    }
  }
  const [x, y] = calc(order[0]); return nearFree(W, x, y, w, h, ignore);
}
function need(W, n) {
  const s = W.find(n);
  if (!s && W.findGroup && W.findGroup(n)) { const g = W.findGroup(n); throw new SOPError(`${g.name} is a group (${listing(g.members)}), not a shape; name one of its shapes.`); }
  if (!s) { const all = W.state.shapes.map(x => x.name); throw new SOPError(`There is no shape named "${n}".` + (all.length ? ` Shapes on the canvas: ${all.join(', ')}.` : ' The canvas is empty.')); }
  return s;
}
/* ---------- groups: the box around the members; a group used as an anchor is that box ---------- */
function groupBox(state, g) {
  const ms = g.members.map(n => state.shapes.find(s => s.name === n)).filter(Boolean); if (!ms.length) return null;
  const x1 = Math.min(...ms.map(s => s.x - dims(s).w / 2)), x2 = Math.max(...ms.map(s => s.x + dims(s).w / 2));
  const y1 = Math.min(...ms.map(s => s.y - dims(s).h / 2)), y2 = Math.max(...ms.map(s => s.y + dims(s).h / 2));
  return { x1, y1, x2, y2, x: (x1 + x2) / 2, y: (y1 + y2) / 2, w: x2 - x1, h: y2 - y1, members: ms };
}
function needAnchor(W, n) {
  const s = W.find(n); if (s) return s;
  const g = W.findGroup && W.findGroup(n), b = g && groupBox(W.state, g);
  if (b) return { name: g.name, x: Math.round(b.x), y: Math.round(b.y), box: { w: Math.round(b.w), h: Math.round(b.h) }, shape: 'rectangle', group: g.members.slice() };
  return need(W, n);
}
/** target names with every group name replaced by its members (in order, each once) */
function expandGroups(W, ns) { const out = []; for (const n of ns) { const g = W.findGroup && !W.find(n) ? W.findGroup(n) : null; for (const m of g ? g.members : [n]) if (!out.includes(m)) out.push(m); } return out; }
const targetsOf = (W, a, verb) => expandGroups(W, needTargets(a, verb));

/* ---------- several constraints on one position: canvas region + up to two relations to shapes ----------
   `position` (+`anchor`), `position2` (+`anchor2`) and `region`. A single position keeps the old placement (relSpot / spot); with more than
   one constraint every candidate point of a grid over the drawing's cell is scored: first by how many constraints hold (the same tests the
   questions use: relHolds, inSpot), ties broken in favour of the earlier ones (position, position2, region), then by the distance to the
   point each constraint prefers; occupied points are skipped (the nearest free spot wins). Constraints that cannot hold are reported. */
const REGION_RECT = { center: [267, 533, 0, 500], top: [0, 800, 0, 167], bottom: [0, 800, 333, 500], left: [0, 267, 0, 500], right: [533, 800, 0, 500], topLeft: [0, 267, 0, 167], topRight: [533, 800, 0, 167], bottomLeft: [0, 267, 333, 500], bottomRight: [533, 800, 333, 500] };
const inSpot = (s, sp) => { const want = sp.replace(/([A-Z])/g, ' $1').toLowerCase().split(' '); const r = region(s); return r.includes(want[0]) && (want.length < 2 || r.includes(want[1])); };
const isMulti = a => a.region != null || a.position2 != null;
function constraintsOf(W, a) {
  const cs = [], one = (key, pos, anc) => {
    if (SPOTS[pos]) return { key, spot: pos };
    const anchors = names(anc).map(n => needAnchor(W, n));
    if (!anchors.length) throw new SOPError(`${key}=${pos} needs an anchor shape.`);
    return { key, rel: pos, anchors };
  };
  if (a.position) cs.push(one('position', a.position, a.anchor));
  if (a.position2) cs.push(one('position2', a.position2, a.anchor2));
  if (a.region) { if (!SPOTS[a.region]) throw new SOPError(`region=${a.region} is not a place on the canvas.`); cs.push({ key: 'region', spot: a.region }); }
  return cs;
}
const consText = c => c.spot ? `in the ${camelWords(c.spot)}` : `${POS_WORDS[c.rel]} ${c.rel === 'between' ? listing(c.anchors.map(x => x.name).slice(0, 2)) : listing(c.anchors.map(x => x.name))}`;
const consHolds = (c, s) => c.spot ? inSpot(s, c.spot) : relHolds(s, c.rel, c.anchors) && !c.anchors.some(x => x.name === s.name || (x.group && x.group.includes(s.name)));
function consCost(c, q, w, h) {
  const d2 = (x, y) => (q.x - x) ** 2 + (q.y - y) ** 2;
  if (c.spot) { const [x1, x2, y1, y2] = REGION_RECT[c.spot], X = q.x - FR.x, Y = q.y - FR.y; const dx = X < x1 ? x1 - X : X > x2 ? X - x2 : 0, dy = Y < y1 ? y1 - Y : Y > y2 ? Y - y2 : 0; const [sx, sy] = spot(c.spot); return dx * dx + dy * dy + 0.01 * d2(sx, sy); }
  const a = c.anchors[0], ad = dims(a), gap = 56;
  switch (c.rel) {
    case 'leftOf': return d2(a.x - ad.w / 2 - gap - w / 2, a.y);
    case 'rightOf': return d2(a.x + ad.w / 2 + gap + w / 2, a.y);
    case 'above': return d2(a.x, a.y - ad.h / 2 - gap - 16 - h / 2);
    case 'below': return d2(a.x, a.y + ad.h / 2 + gap + 16 + h / 2);
    case 'between': { const b = c.anchors[1] || a; return d2((a.x + b.x) / 2, (a.y + b.y) / 2); }
    default: return (Math.sqrt(d2(a.x, a.y)) - (Math.max(ad.w, ad.h) / 2 + gap + Math.max(w, h) / 2)) ** 2;   // near
  }
}
function placeMulti(W, a, w, h, ignore) {
  const cs = constraintsOf(W, a);
  if (cs.some(c => c.anchors && c.anchors.some(x => ignore.includes(x.name)))) throw new SOPError(`A shape can't be placed relative to itself.`);
  const first = cs.find(c => c.anchors);
  const solve = () => {
    const x1 = FR.x + w / 2 + 10, x2 = FR.x + CANVAS.W - w / 2 - 10, y1 = FR.y + h / 2 + 24, y2 = FR.y + CANVAS.H - h / 2 - 10;
    let best = null;
    for (let y = y1; y <= y2 + 0.01; y += 8) for (let x = x1; x <= x2 + 0.01; x += 8) {
      const q = { x: Math.round(x), y: Math.round(y) };
      if (hits(W, boxAt(q.x, q.y, w, h), ignore)) continue;
      const sat = cs.map(c => consHolds(c, q)), score = sat.reduce((t, ok, i) => t + (ok ? 100 + cs.length - i : 0), 0);
      const cost = cs.reduce((t, c) => t + consCost(c, q, w, h), 0);
      if (!best || score > best.score || (score === best.score && cost < best.cost)) best = { q, score, cost, sat };
    }
    if (!best) { const p = nearFree(W, FR.x + 400, FR.y + 250, w, h, ignore); return Object.assign(p, { unmet: cs.filter(c => !consHolds(c, p)).map(consText) }); }
    return Object.assign(best.q, { unmet: cs.filter((c, i) => !best.sat[i]).map(consText) });
  };
  return first ? inCell(first.anchors[0].x, first.anchors[0].y, solve) : solve();
}
/** the answer a command gives when some constraints of its position could not hold */
const unmetText = (name, p) => p && p.unmet && p.unmet.length ? `I couldn't also put ${name} ${listing(p.unmet)}: no free spot satisfies every constraint, so I placed it where most of them hold.` : null;

function placeFor(W, a, w, h, ignore) {
  if (a.at) { const [x, y] = [].concat(a.at).map(Number); return clampPt(x + FR.x, y + FR.y, w, h); }
  if (isMulti(a)) return placeMulti(W, a, w, h, ignore);
  if (a.position) {
    if (SPOTS[a.position]) return nearFree(W, ...spot(a.position), w, h, ignore);
    const anchors = names(a.anchor).map(n => needAnchor(W, n));
    if (!anchors.length) throw new SOPError(`position=${a.position} needs an anchor shape.`);
    if (anchors.some(x => ignore.includes(x.name))) throw new SOPError(`A shape can't be placed relative to itself.`);
    return relSpot(W, w, h, a.position, anchors, a.distance, ignore);
  }
  return autoSpot(W, w, h, ignore);
}
function relHolds(s, pos, anc) {
  const a = anc[0];
  switch (pos) {
    case 'leftOf': return s.x < a.x - 20;
    case 'rightOf': return s.x > a.x + 20;
    case 'above': return s.y < a.y - 20;
    case 'below': return s.y > a.y + 20;
    case 'near': return Math.hypot(s.x - a.x, s.y - a.y) < 170;
    case 'between': { const b = anc[1] || a; const vx = b.x - a.x, vy = b.y - a.y, L = vx * vx + vy * vy || 1; const t = ((s.x - a.x) * vx + (s.y - a.y) * vy) / L; const px = a.x + t * vx, py = a.y + t * vy; return t > 0.05 && t < 0.95 && Math.hypot(s.x - px, s.y - py) < 70; }
    default: return false;
  }
}
const region = s => { const o = cellOf(s.x, s.y), X = s.x - o.x, Y = s.y - o.y; const c = X < 267 ? 'left' : X < 533 ? 'center' : 'right'; const r = Y < 167 ? 'top' : Y < 333 ? 'middle' : 'bottom'; return r === 'middle' ? (c === 'center' ? 'center' : 'middle ' + c) : r + (c === 'center' ? ' center' : ' ' + c); };
const plural = (w, n) => n === 1 ? w : (w.endsWith('x') || w.endsWith('s') ? w + 'es' : w + 's');
const listing = arr => arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
const describeShape = s => `${s.name} is a ${sizeName(s.size)} ${s.color} ${s.shape}${s.outline ? ' with a ' + s.outline + ' outline' : ''}${s.label ? ` labeled "${s.label}"` : ''} in the ${region(s)}`;
const edgeText = e => `${e.from} ${e.arrow === 'forward' ? '→' : e.arrow === 'both' ? '↔' : '—'} ${e.to}${e.style !== 'solid' ? ' (' + e.style + ')' : ''}${e.label ? ` "${e.label}"` : ''}`;
const adjacent = (W, a, b) => W.state.edges.some(e => (e.from === a && e.to === b) || (e.from === b && e.to === a));
const degree = (W, n) => W.state.edges.filter(e => e.from === n || e.to === n).length;
const POS_WORDS = { leftOf: 'left of', rightOf: 'right of', above: 'above', below: 'below', near: 'near', between: 'between' };

function filterShapes(W, a, base) {
  let list = base ? base.map(n => need(W, n)) : W.state.shapes.slice();
  if (a.shape && a.shape !== 'any') list = list.filter(s => s.shape === a.shape);
  if (a.color) list = list.filter(s => s.color === a.color);
  if (a.size) list = list.filter(s => sizeName(s.size) === a.size);
  if (a.outline) list = list.filter(s => (s.outline || 'none') === a.outline);
  if (a.notColor) list = list.filter(s => s.color !== a.notColor);
  const relFilter = (pos, ancNames) => { const anc = names(ancNames).map(n => needAnchor(W, n)); list = list.filter(s => !anc.some(x => x.name === s.name || (x.group && x.group.includes(s.name))) && relHolds(s, pos, anc)); };
  if (a.position && a.anchor && !SPOTS[a.position]) relFilter(a.position, a.anchor);
  if (a.position && SPOTS[a.position]) list = list.filter(s => inSpot(s, a.position));
  if (a.position2 && a.anchor2 && !SPOTS[a.position2]) relFilter(a.position2, a.anchor2);
  if (a.position2 && SPOTS[a.position2]) list = list.filter(s => inSpot(s, a.position2));
  if (a.region && SPOTS[a.region]) list = list.filter(s => inSpot(s, a.region));
  if (a.linked) { const ln = names(a.linked).map(n => need(W, n).name); list = list.filter(s => !ln.includes(s.name) && ln.every(l => adjacent(W, s.name, l))); }
  return list;
}
function phraseOf(a, n) {
  const noun = a.shape && a.shape !== 'any' ? a.shape : 'shape';
  let p = [a.size, a.color].filter(Boolean).concat(plural(noun, n)).join(' ');
  if (a.outline) p += ` with a ${a.outline} outline`;
  if (a.notColor) p += ` that ${n === 1 ? 'is' : 'are'} not ${a.notColor}`;
  if (a.position && a.anchor && POS_WORDS[a.position]) p += ` ${POS_WORDS[a.position]} ${listing(names(a.anchor))}`;
  if (a.linked) p += ` connected to ${listing(names(a.linked))}`;
  if (a.position2 && a.anchor2 && POS_WORDS[a.position2]) p += ` and ${POS_WORDS[a.position2]} ${listing(names(a.anchor2))}`;
  if (a.position && SPOTS[a.position]) p += ` in the ${a.position.replace(/([A-Z])/g, ' $1').toLowerCase()}`;
  if (a.region && SPOTS[a.region]) p += ` in the ${camelWords(a.region)}`;
  return p;
}

/* ---------- datalog-lite backend (naive fixpoint) ---------- */
const isVar = t => typeof t === 'string' && t.startsWith('?');
function datalog(facts, rules) {
  const db = new Map();
  const add = f => { const k = JSON.stringify(f); if (!db.has(f[0])) db.set(f[0], new Map()); const m = db.get(f[0]); if (m.has(k)) return false; m.set(k, f); return true; };
  function* solve(body, i, bind) {
    if (i === body.length) { yield bind; return; }
    const [p, ...ts] = body[i]; const m = db.get(p); if (!m) return;
    for (const f of [...m.values()]) {
      const nb = Object.assign({}, bind); let ok = true;
      for (let j = 0; j < ts.length; j++) {
        const t = ts[j], v = f[j + 1];
        if (isVar(t)) { if (t in nb) { if (nb[t] !== v) { ok = false; break; } } else nb[t] = v; }
        else if (t !== v) { ok = false; break; }
      }
      if (ok) yield* solve(body, i + 1, nb);
    }
  }
  facts.forEach(add);
  let changed = true, iter = 0;
  while (changed && iter++ < 500) {
    changed = false;
    for (const r of rules) for (const b of [...solve(r.body, 0, {})]) if (add(r.head.map((t, i) => i === 0 ? t : isVar(t) ? b[t] : t))) changed = true;
  }
  return { query: q => [...solve([q], 0, {})], all: body => [...solve(body, 0, {})] };
}
const atom = v => isVar(v) ? v.slice(1) : JSON.stringify(v);
const lit = ([p, ...a]) => `${p}(${a.map(atom).join(', ')})`;
function lowerDatalog(facts, rules, q, answer) {
  return ['% facts lowered from the world', ...facts.map(f => lit(f) + '.'), '', '% rules', ...rules.map(r => `${lit(r.head)} :- ${r.body.map(lit).join(', ')}.`), '', '% query', `?- ${lit(q)}.`, `% ${answer}`].join('\n');
}
const REACH = [{ head: ['reach', '?X', '?Y'], body: [['edge', '?X', '?Y']] }, { head: ['reach', '?X', '?Z'], body: [['reach', '?X', '?Y'], ['edge', '?Y', '?Z']] }];
function edgeFacts(W, mode) {
  const f = [];
  for (const e of W.state.edges) {
    if (mode === 'undirected' || e.arrow !== 'forward') { if (mode === 'cycle' && e.arrow !== 'forward') continue; f.push(['edge', e.from, e.to], ['edge', e.to, e.from]); }
    else f.push(['edge', e.from, e.to]);
  }
  const seen = new Set(); return f.filter(x => { const k = x.join('\u0001'); if (seen.has(k)) return false; seen.add(k); return true; });
}
function bfs(W, from, to, mode) {
  const prev = new Map([[from, null]]); const q = [from];
  while (q.length) {
    const n = q.shift(); if (n === to) break;
    for (const e of W.state.edges) {
      const steps = [];
      if (e.from === n) steps.push(e.to);
      if (e.to === n && (mode === 'undirected' || e.arrow !== 'forward')) steps.push(e.from);
      for (const m of steps) if (!prev.has(m)) { prev.set(m, { n, e: e.id }); q.push(m); }
    }
  }
  if (!prev.has(to)) return null;
  const nodes = [to], edges = []; let c = to;
  while (prev.get(c)) { edges.push(prev.get(c).e); c = prev.get(c).n; nodes.push(c); }
  return { nodes: nodes.reverse(), edges };
}

/* =====================================================================
   5. Plugins
   ===================================================================== */
const SHAPE_VALUES = { any: ['shape', 'shapes', 'node', 'nodes', 'object', 'objects', 'thing', 'things', 'element', 'elements', 'item', 'items', 'one', 'ones'], circle: ['circles', 'dot', 'dots', 'ball', 'balls'], square: ['squares'], rectangle: ['rectangles', 'rect', 'rects', 'box', 'boxes', 'block', 'blocks'], triangle: ['triangles'], diamond: ['diamonds', 'rhombus'], ellipse: ['ellipses', 'oval', 'ovals'], hexagon: ['hexagons'], star: ['stars'] };
const COLOR_VALUES = { red: ['crimson', 'scarlet'], orange: [], yellow: ['amber'], gold: ['golden'], lime: [], green: [], teal: ['turquoise'], cyan: ['aqua'], blue: [], navy: [], indigo: [], purple: ['violet', 'lilac'], magenta: ['fuchsia'], pink: ['rose'], brown: [], gray: ['grey', 'silver'], black: [], white: [] };
const OUTLINE_VALUES = Object.assign({ none: ['no'] }, COLOR_VALUES);

const corePlugin = {
  name: 'core', title: 'SOP core', locked: true,
  description: 'Wire types every domain needs, and the mention resolver that turns descriptions like "the red circle" into named shapes.',
  wireTypes: { command: 'Something the user wants done', question: 'Something the user wants to know', fact: 'A statement that should hold in the world', rule: 'A default that applies to future facts', mention: 'A description that must resolve to existing shapes' },
  legend: {
    target: { ask: 'Which shapes does it apply to?', kind: 'names' },
    quantifier: { ask: 'One specific shape, or all that match?', kind: 'enum', values: { all: ['all', 'every', 'each', 'everything'] } },
    count: { ask: 'How many?', kind: 'number' },
    name: { ask: 'What is it called?', kind: 'name' },
    notColor: { ask: 'Which colour must the shapes NOT have?', kind: 'enum', values: Object.fromEntries(Object.keys(COLOR_VALUES).map(c => [c, ['not ' + c]])) },
    recency: { ask: 'The most recently drawn one, or the first one?', kind: 'enum', values: { newest: ['new', 'newest', 'last', 'latest', 'most recent'], oldest: ['first', 'oldest', 'earliest'] } }
  },
  handlers: [{
    type: 'mention', run(a, ctx) {
      const W = ctx.world, list = filterShapes(W, a, null), n = list.length;
      const phrase = phraseOf(a, a.quantifier === 'all' ? 2 : 1);
      if (a.quantifier === 'all') { if (!n) throw new SOPError(`There are no ${phrase} on the canvas.`); return { value: list.map(s => s.name), notes: ['matched ' + list.map(s => s.name).join(', ')] }; }
      if (!n) throw new SOPError(`I can't find a ${phrase} on the canvas.`);
      if (a.recency && n > 1) { const pick = list.slice().sort((p, q) => p.order - q.order)[a.recency === 'oldest' ? 0 : n - 1]; return { value: [pick.name], notes: [`the ${a.recency === 'oldest' ? 'first' : 'most recent'} ${phrase}: ${pick.name}`] }; }
      if (n > 1) throw new Clarify(`Which ${phrase}? ${listing(list.map(s => `${s.name} (${region(s)})`))}. Reply with a name.`, { wire: ctx.node.id, candidates: list.map(s => s.name) });
      return { value: [list[0].name], notes: ['resolved to ' + list[0].name] };
    }
  }]
};

const historyPlugin = {
  name: 'history', title: 'History',
  description: 'Undo and redo. Undo and redo step over the last executed action, including actions of the same message; with none left in the message they step over the previous turn.',
  legend: { action: { ask: 'What should happen?', kind: 'enum', values: { undo: ['undo', 'revert'], redo: ['redo', 'reapply', 're-apply'] } } },
  handlers: [
    { type: 'command', when: { action: 'undo' }, run(a, ctx) { const n = Math.max(1, +a.count || 1); for (let i = 0; i < n; i++) ctx.undo(); return { notes: [`reverted ${n} turn${n > 1 ? 's' : ''}`] }; } },
    { type: 'command', when: { action: 'redo' }, run(a, ctx) { const n = Math.max(1, +a.count || 1); for (let i = 0; i < n; i++) ctx.redo(); return { notes: [`re-applied ${n} turn${n > 1 ? 's' : ''}`] }; } }
  ]
};

function needTargets(a, verb) { const t = names(a.target); if (!t.length) throw new SOPError(`Which shape should I ${verb}? Name it, e.g. "${verb} circle1".`); return t; }

/* a group moves as one unit: its box is placed like one shape (the same placement rules), every member shifts by the same amount */
function moveGroup(W, g, a, ctx) {
  const b = groupBox(W.state, g); if (!b) throw new SOPError(`The group ${g.name} is empty.`);
  const bw = Math.round(b.w), bh = Math.round(b.h); let p, answer = null;
  if (a.direction) { const dist = a.distance != null ? +a.distance : 80; const v = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[a.direction]; p = inCell(b.x, b.y, () => clampPt(b.x + v[0] * dist, b.y + v[1] * dist, bw, bh)); }
  else if (a.at || a.position || a.region) { p = placeFor(W, a, bw, bh, g.members); answer = unmetText(g.name, p); }
  else throw new SOPError(`Where should ${g.name} go? Try "move ${g.name} below …" or "move ${g.name} left by 50".`);
  const dx = Math.round(p.x - b.x), dy = Math.round(p.y - b.y);
  for (const s of b.members) ctx.emit({ op: 'set', name: s.name, props: { x: s.x + dx, y: s.y + dy } });
  return answer;
}
function freeGroupName(W, base) { let k = 1, n = base; while (W.find(n) || W.findGroup(n)) n = base.replace(/\d+$/, '') + (++k); return n; }
/* a group is copied as one block: its shapes keep their layout, the links among them are copied too, and the copies form a new group */
function dupGroup(W, g, a, ctx, i, after) {
  const b = groupBox(W.state, g), ab = groupBox(W.state, after) || b; if (!b) throw new SOPError(`The group ${g.name} is empty.`);
  const bw = Math.round(b.w), bh = Math.round(b.h);
  const p = (a.position || a.region) && i === 0 ? placeFor(W, a, bw, bh, []) : relSpot(W, bw, bh, 'rightOf', [{ name: after.name, x: ab.x, y: ab.y, box: { w: Math.round(ab.w), h: Math.round(ab.h) } }], 40, []);
  const dx = Math.round(p.x - b.x), dy = Math.round(p.y - b.y), map = new Map(), made = [];
  for (const s of b.members) {
    const name = W.nextName(s.shape); map.set(s.name, name); made.push(name);
    ctx.emit({ op: 'add', shape: { name, shape: s.shape, size: s.size, color: a.color || s.color, outline: s.outline, label: s.label, x: s.x + dx, y: s.y + dy } });
  }
  for (const e of W.state.edges.filter(e => map.has(e.from) && map.has(e.to))) ctx.emit({ op: 'link', edge: W.newEdge(map.get(e.from), map.get(e.to), { style: e.style, arrow: e.arrow, label: e.label, color: e.color }) });
  const gname = a.name != null && i === 0 && !W.find(String(a.name)) && !W.findGroup(String(a.name)) ? String(a.name) : freeGroupName(W, g.name + '2');
  ctx.emit({ op: 'group', group: { name: gname, members: made } });
  return { made, group: W.findGroup(gname) };
}

const shapesPlugin = {
  name: 'shapes', title: 'Shapes',
  description: 'Create, delete, move, restyle, rename, label, duplicate and swap shapes.',
  legend: {
    action: { values: { create: ['draw', 'create', 'add', 'make', 'put', 'place', 'insert', 'sketch', 'build', 'spawn', 'throw', 'slap', 'pop', 'stick', 'plonk'], delete: ['delete', 'remove', 'erase', 'drop', 'clear', 'wipe', 'reset', 'get rid of', 'kill', 'trash', 'axe', 'ditch', 'zap', 'banish', 'nuke'], move: ['move', 'shift', 'drag', 'push', 'nudge', 'slide', 'reposition', 'relocate', 'scoot', 'shove', 'park', 'tuck'], set: ['set', 'change', 'turn', 'color', 'colour', 'paint', 'fill', 'give', 'recolor', 'recolour', 'transform', 'convert', 'reshape', 'morph'], resize: ['resize', 'grow', 'enlarge', 'shrink', 'scale'], rename: ['rename', 'call'], label: ['label', 'title', 'caption', 'write', 'inscribe', 'stamp', 'tag'], duplicate: ['duplicate', 'copy', 'clone', 'replicate', 'dupe'], swap: ['swap', 'exchange', 'trade', 'switch places', 'trade places'] } },
    shape: { ask: 'What kind of shape?', kind: 'enum', values: SHAPE_VALUES },
    color: { ask: 'What color is it?', kind: 'enum', values: COLOR_VALUES },
    outline: { ask: 'What color is its outline?', kind: 'enum', values: OUTLINE_VALUES },
    size: { ask: 'How big is it?', kind: 'enum', values: { tiny: ['minuscule'], small: ['little'], medium: ['normal', 'regular', 'average'], large: ['big'], huge: ['giant', 'enormous', 'massive'] } },
    scale: { ask: 'By what factor does its size change?', kind: 'number' },
    label: { ask: 'What text is written on it?', kind: 'text' },
    position: { ask: 'Where is it, relative to the anchor or the canvas?', kind: 'enum', values: { leftOf: ['left of'], rightOf: ['right of'], above: ['above', 'over', 'on top of'], below: ['below', 'under', 'beneath'], near: ['next to', 'near', 'beside'], between: ['between'], center: ['center', 'middle'], top: ['at the top'], bottom: ['at the bottom'], left: ['on the left'], right: ['on the right'], topLeft: ['top left'], topRight: ['top right'], bottomLeft: ['bottom left'], bottomRight: ['bottom right'] } },
    anchor: { ask: 'Relative to which shape?', kind: 'names' },
    at: { ask: 'At which x,y coordinates?', kind: 'point' },
    direction: { ask: 'In which direction does it move?', kind: 'enum', values: { left: [], right: [], up: ['upwards'], down: ['downwards'] } },
    distance: { ask: 'How far, in pixels?', kind: 'number' },
    linked: { ask: 'Which shapes is it connected to?', kind: 'names' }
  },
  handlers: [
    { type: 'command', when: { action: 'create' }, run(a, ctx) {
      const W = ctx.world, notes = [];
      const shape = a.shape && a.shape !== 'any' ? a.shape : 'circle';
      const props = { color: a.color, size: a.size, outline: a.outline };
      const rp = ctx.engine.plugin('rules');
      if (rp && rp.enabled) for (const r of W.state.rules) { if (r.shape && r.shape !== shape) continue; for (const k of ['color', 'size', 'outline']) if (props[k] == null && r[k] != null) { props[k] = r[k]; notes.push(`rule ${r.id} filled in ${k}=${r[k]}`); } }
      const n = Math.max(1, Math.min(12, Math.round(+a.count || 1)));
      const made = []; let prev = null, answer;
      for (let i = 0; i < n; i++) {
        const name = a.name != null ? String(a.name) + (i > 0 ? String(i + 1) : '') : W.nextName(shape);
        if (!/^[A-Za-z_][\w-]*$/.test(name)) throw new SOPError(`"${name}" can't be a name: use letters, digits, - or _ and start with a letter.`);
        if (W.find(name)) throw new SOPError(`There is already a shape named "${W.find(name).name}".`);
        if (W.findGroup(name)) throw new SOPError(`"${W.findGroup(name).name}" is already the name of a group.`);
        const size = SIZE_PX[props.size || 'medium'], d = dims({ shape, size });
        let p;
        if (i > 0) { const chain = a.position === 'leftOf' ? 'leftOf' : a.position === 'above' ? 'above' : a.position === 'below' && !a.anchor ? 'rightOf' : 'rightOf'; p = relSpot(W, d.w, d.h, a.position === 'below' || a.position === 'above' ? 'rightOf' : chain, [prev], null, []); }
        else { p = placeFor(W, a, d.w, d.h, []); const u = unmetText(name, p); if (u) answer = u; }
        ctx.emit({ op: 'add', shape: { name, shape, size, color: props.color || 'white', outline: props.outline && props.outline !== 'none' ? props.outline : null, label: a.label != null ? String(a.label) : null, x: p.x, y: p.y } });
        made.push(name); prev = W.find(name);
        for (const l of names(a.linked)) { const t = need(W, l); ctx.emit({ op: 'link', edge: W.newEdge(t.name, name) }); }
      }
      return { value: made, notes, answer };
    } },
    { type: 'command', when: { action: 'delete' }, run(a, ctx) {
      const W = ctx.world, t = needTargets(a, 'delete'), all = expandGroups(W, t);
      for (const n of t) { const g = !W.find(n) && W.findGroup(n); if (g) ctx.emit({ op: 'ungroup', name: g.name }); }   // a group goes with its shapes
      for (const n of all) {
        const s = need(W, n);
        for (const e of W.state.edges.filter(e => e.from === s.name || e.to === s.name)) ctx.emit({ op: 'unlink', id: e.id });
        ctx.emit({ op: 'remove', name: s.name });
      }
      return { value: [] };
    } },
    { type: 'command', when: { action: 'move' }, run(a, ctx) {
      const W = ctx.world, t = needTargets(a, 'move'); let prev = null, answer;
      for (const n of t) {
        const g = !W.find(n) && W.findGroup(n);
        if (g) { const r = moveGroup(W, g, a, ctx); if (r) answer = r; prev = null; continue; }   // a group moves as one unit
        const s = need(W, n), d = dims(s); let p;
        if (a.direction) { const dist = a.distance != null ? +a.distance : 80; const v = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[a.direction]; p = inCell(s.x, s.y, () => clampPt(s.x + v[0] * dist, s.y + v[1] * dist, d.w, d.h)); }
        else if (a.at || a.position || a.region) { p = prev && !a.at ? relSpot(W, d.w, d.h, 'rightOf', [prev], null, [s.name]) : placeFor(W, a, d.w, d.h, [s.name]); const u = unmetText(s.name, p); if (u) answer = u; }
        else throw new SOPError(`Where should ${s.name} go? Try "move ${s.name} below …" or "move ${s.name} left by 50".`);
        ctx.emit({ op: 'set', name: s.name, props: { x: p.x, y: p.y } }); prev = W.find(s.name);
      }
      return { value: t, answer };
    } },
    { type: 'command', when: { action: ['set', 'resize'] }, run(a, ctx) {
      const W = ctx.world, t = targetsOf(W, a, 'change'), base = {};
      for (const k of ['color', 'shape', 'label']) if (a[k] != null && !(k === 'shape' && a[k] === 'any')) base[k] = String(a[k]);
      if (a.outline != null) base.outline = a.outline === 'none' ? null : a.outline;
      if (a.size) base.size = SIZE_PX[a.size];
      let scale = a.scale != null ? +a.scale : null;
      if (a.action === 'resize' && scale == null && !a.size) scale = 1.5;
      if (!Object.keys(base).length && scale == null) throw new SOPError(`What should change about ${listing(t)}? Try a color, size, shape, outline or label.`);
      for (const n of t) {
        const s = need(W, n), p = Object.assign({}, base); if (scale != null) p.size = Math.round(Math.min(160, Math.max(22, s.size * scale)));
        ctx.emit({ op: 'set', name: s.name, props: p });
        inCell(s.x, s.y, () => { const d = dims(s), c = clampPt(s.x, s.y, d.w, d.h);
          if (c.x !== s.x || c.y !== s.y || hits(W, boxAt(c.x, c.y, d.w, d.h), [s.name], 6)) { const q = nearFree(W, c.x, c.y, d.w, d.h, [s.name]); if (q.x !== s.x || q.y !== s.y) ctx.emit({ op: 'set', name: s.name, props: { x: q.x, y: q.y } }); } });
      }
      return { value: t };
    } },
    { type: 'command', when: { action: 'rename' }, run(a, ctx) {
      const W = ctx.world, t = needTargets(a, 'rename');
      if (a.name == null) throw new SOPError(`What should ${t[0]} be called? Try "rename ${t[0]} to Start".`);
      const g = !W.find(t[0]) && W.findGroup(t[0]);
      if (g) {   // renaming a group
        const nn = String(a.name);
        if (!/^[A-Za-z_][\w-]*$/.test(nn)) throw new SOPError(`"${nn}" can't be a name: use letters, digits, - or _ and start with a letter.`);
        if (W.find(nn) || (W.findGroup(nn) && W.findGroup(nn) !== g)) throw new SOPError(`"${nn}" is already taken.`);
        const was = g.name; ctx.emit({ op: 'renameGroup', from: was, to: nn }); return { value: [nn], answer: `Renamed the group ${was} to ${nn}.` };
      }
      const s = need(W, t[0]), nn = String(a.name);
      if (!/^[A-Za-z_][\w-]*$/.test(nn)) throw new SOPError(`"${nn}" can't be a name: use letters, digits, - or _ and start with a letter.`);
      const other = W.find(nn); if (other && other !== s) throw new SOPError(`"${other.name}" is already taken.`);
      if (W.findGroup(nn)) throw new SOPError(`"${W.findGroup(nn).name}" is already the name of a group.`);
      ctx.emit({ op: 'rename', from: s.name, to: nn });
      return { value: [nn] };
    } },
    { type: 'command', when: { action: 'label' }, run(a, ctx) {
      const t = needTargets(a, 'label'); if (a.label == null) throw new SOPError('What should the label say? Put it in quotes, e.g. label A "Start".');
      for (const n of expandGroups(ctx.world, t)) ctx.emit({ op: 'set', name: need(ctx.world, n).name, props: { label: String(a.label) } });
      return { value: t };
    } },
    { type: 'command', when: { action: 'duplicate' }, run(a, ctx) {
      const W = ctx.world, made = [], k = Math.max(1, Math.min(12, Math.round(+a.count || 1)));
      for (const n of needTargets(a, 'duplicate')) {
        const g = !W.find(n) && W.findGroup(n);
        if (g) { let last = g; for (let i = 0; i < k; i++) { const r = dupGroup(W, g, a, ctx, i, last); made.push(...r.made); last = r.group; } continue; }   // a group is copied as one block
        const s = need(W, n); let prev = s;
        for (let i = 0; i < k; i++) {
          const name = a.name != null ? String(a.name) + (made.length ? String(made.length + 1) : '') : W.nextName(s.shape);
          if (W.find(name)) throw new SOPError(`There is already a shape named "${name}".`);
          const d = dims(s), p = a.position && i === 0 ? placeFor(W, a, d.w, d.h, []) : relSpot(W, d.w, d.h, 'rightOf', [prev], 40, []);
          ctx.emit({ op: 'add', shape: { name, shape: s.shape, size: s.size, color: a.color || s.color, outline: s.outline, label: s.label, x: p.x, y: p.y } });
          made.push(name); prev = W.find(name);
        }
      }
      return { value: made };
    } },
    { type: 'command', when: { action: 'swap' }, run(a, ctx) {
      const t = needTargets(a, 'swap'); if (t.length !== 2) throw new SOPError('Swap needs exactly two shapes, e.g. "swap A and B".');
      const [p, q] = t.map(n => need(ctx.world, n));
      const pp = { x: p.x, y: p.y }; ctx.emit({ op: 'set', name: p.name, props: { x: q.x, y: q.y } }); ctx.emit({ op: 'set', name: q.name, props: pp });
      return { value: t };
    } }
  ]
};

/* Groups: a named set of shapes that moves, copies, aligns, restacks and is deleted as one unit. A shape is in at most one group;
   groups do not nest (grouping a group takes its shapes). */
const groupsPlugin = {
  name: 'groups', title: 'Groups',
  description: 'Group shapes under a name and ungroup them; a group name then works as a target of move, delete, duplicate, align, distribute, arrange, set, resize, label and front/back, and as an anchor of positions.',
  legend: {
    action: { values: { group: ['group', 'put together', 'bundle'], ungroup: ['ungroup', 'split up', 'break up', 'dissolve'] } },
    ask: { values: { members: ['what is in', 'what does … contain', 'members of'], groupOf: ['which group', 'what group', 'belongs to', 'part of'] } },
    kind: { values: { group: ['groups'] } },
    members: { ask: 'Which shapes does the group hold?', kind: 'names' }
  },
  handlers: [
    { type: 'command', when: { action: 'group' }, run(a, ctx) {
      const W = ctx.world, t = needTargets(a, 'group'), list = expandGroups(W, t).map(n => need(W, n).name);
      if (list.length < 2) throw new SOPError('A group needs at least two shapes, e.g. "group Start, Process and Check as Pipeline".');
      const old = a.name != null ? W.findGroup(String(a.name)) : null;
      const name = a.name != null ? String(a.name) : freeGroupName(W, 'group1');
      if (!/^[A-Za-z_][\w-]*$/.test(name)) throw new SOPError(`"${name}" can't be a name: use letters, digits, - or _ and start with a letter.`);
      if (W.find(name)) throw new SOPError(`"${W.find(name).name}" is a shape; a group needs a name of its own.`);
      const was = list.map(n => W.groupOf(n)).filter(g => g && g.name !== name).map(g => g.name);
      ctx.emit({ op: 'group', group: { name: old ? old.name : name, members: list } });
      const notes = [...new Set(was)].map(g => `the shapes left ${g} (a shape is in one group at a time)`);
      return { value: [old ? old.name : name], notes, answer: `Grouped ${listing(list)} as ${old ? old.name : name}.` };
    } },
    { type: 'command', when: { action: 'ungroup' }, run(a, ctx) {
      const W = ctx.world, t = needTargets(a, 'ungroup'), said = [];
      for (const n of t) {
        const g = W.findGroup(n);
        if (g && !W.find(n)) { ctx.emit({ op: 'ungroup', name: g.name }); said.push(`${g.name} is ungrouped: ${listing(g.members)} are separate shapes again.`); continue; }
        const s = need(W, n), h = W.groupOf(s.name);
        if (!h) { said.push(`${s.name} is not in a group.`); continue; }
        const rest = h.members.filter(m => m !== s.name);   // a shape taken out of its group; a group left with one shape is dissolved
        ctx.emit(rest.length >= 2 ? { op: 'group', group: { name: h.name, members: rest } } : { op: 'ungroup', name: h.name });
        said.push(rest.length >= 2 ? `${s.name} is out of ${h.name}.` : `${s.name} is out of ${h.name}, which is dissolved.`);
      }
      return { value: t, answer: said.join(' ') };
    } },
    { type: 'question', when: { ask: 'members' }, run(a, ctx) {
      const W = ctx.world, G = W.state.groups || [], t = names(a.target);
      if (!t.length) return { value: G.map(g => g.name), answer: G.length ? G.map(g => `${g.name} holds ${listing(g.members)}`).join('; ') + '.' : 'There are no groups.', highlight: { shapes: G.flatMap(g => g.members) } };
      const parts = [], hl = [];
      for (const n of t) {
        const g = !W.find(n) && W.findGroup(n);
        if (g) { parts.push(`${g.name} holds ${listing(g.members)}`); hl.push(...g.members); continue; }
        const s = need(W, n), h = W.groupOf(s.name); parts.push(`${s.name} is a shape, not a group${h ? `; it is in ${h.name}` : ''}`); hl.push(s.name);
      }
      return { value: hl, answer: parts.join('; ') + '.', highlight: { shapes: hl } };
    } },
    { type: 'question', when: { ask: 'groupOf' }, run(a, ctx) {
      const W = ctx.world, parts = [], val = [];
      for (const n of needTargets(a, 'look up')) {
        if (!W.find(n) && W.findGroup(n)) { parts.push(`${W.findGroup(n).name} is itself a group`); continue; }
        const s = need(W, n), g = W.groupOf(s.name); val.push(g ? g.name : null);
        parts.push(g ? `${s.name} is in ${g.name} (with ${listing(g.members.filter(m => m !== s.name))})` : `${s.name} is not in any group`);
      }
      return { value: val, answer: parts.join('; ') + '.', highlight: { shapes: needTargets(a, 'look up').filter(n => W.find(n)) } };
    } },
    { type: 'question', when: { ask: ['list', 'count', 'exists'], kind: 'group' }, run(a, ctx) {
      const G = ctx.world.state.groups || [], n = G.length;
      if (a.ask === 'count') return { value: n, answer: `There ${n === 1 ? 'is 1 group' : 'are ' + n + ' groups'}.` };
      if (a.ask === 'exists') return { value: n > 0, answer: n ? `Yes: ${listing(G.map(g => g.name))}.` : 'No, there are no groups.' };
      return { value: G.map(g => g.name), answer: n ? `${n} group${n === 1 ? '' : 's'}: ${G.map(g => `${g.name} (${listing(g.members)})`).join('; ')}.` : 'There are no groups.', highlight: { shapes: G.flatMap(g => g.members) } };
    } }
  ]
};

const connectionsPlugin = {
  name: 'connections', title: 'Connections',
  description: 'Arrows and lines between shapes, with style, direction, color and label.',
  legend: {
    action: { values: { connect: ['connect', 'link', 'join', 'wire', 'attach', 'hook', 'tie'], disconnect: ['disconnect', 'unlink', 'detach', 'separate', 'cut', 'unhook', 'sever', 'snip'] } },
    from: { ask: 'Where does the connection start?', kind: 'names' },
    to: { ask: 'Where does the connection end?', kind: 'names' },
    style: { ask: 'Is the line solid, dashed or dotted?', kind: 'enum', values: { solid: [], dashed: ['dash'], dotted: ['dot'] } },
    arrow: { ask: 'Which way does it point?', kind: 'enum', values: { forward: ['arrow'], both: ['two-way', 'two way', 'bidirectional', 'both ways', 'double-headed'], none: ['line', 'plain', 'undirected'] } },
    pairing: { ask: 'Connected how, among themselves?', kind: 'enum', values: { chain: ['in a chain', 'one after the other', 'in sequence', 'in order'], next: ['each to the next', 'to the next one'], all: ['all to each other', 'every pair'] } }
  },
  handlers: [
    { type: 'command', when: { action: 'connect' }, run(a, ctx) {
      const W = ctx.world, notes = []; let from = names(a.from), to = names(a.to);
      if (a.pairing || (!to.length && from.length > 1)) {
        const seen = new Set(), list = from.concat(to).map(n => need(W, n)).filter(x => !seen.has(x) && seen.add(x));   // the order the text gives
        if (list.length < 2) throw new SOPError('Pairing needs at least two shapes, e.g. "connect the circles in a chain".');
        const pairs = a.pairing === 'all' ? list.flatMap((x, i) => list.slice(i + 1).map(y => [x, y])) : list.slice(1).map((y, i) => [list[i], y]);
        for (const [x, y] of pairs) {
          if (W.state.edges.some(e => e.from === x.name && e.to === y.name)) { notes.push(`${x.name} → ${y.name} already exists`); continue; }
          ctx.emit({ op: 'link', edge: W.newEdge(x.name, y.name, { style: a.style || 'solid', arrow: a.arrow || 'forward', color: a.color || null }) });
        }
        return { value: list.map(s => s.name), notes: notes.concat([`${a.pairing || 'chain'}: ${list.map(s => s.name).join(' → ')}`]) };
      }
      if (!from.length || !to.length) throw new SOPError('A connection needs two ends, e.g. "connect A to B".');
      for (const f of from) for (const t of to) {
        const x = need(W, f), y = need(W, t);
        if (x === y) throw new SOPError(`${x.name} can't connect to itself.`);
        if (W.state.edges.some(e => e.from === x.name && e.to === y.name)) { notes.push(`${x.name} → ${y.name} already exists`); continue; }
        ctx.emit({ op: 'link', edge: W.newEdge(x.name, y.name, { style: a.style || 'solid', arrow: a.arrow || 'forward', label: a.label != null ? String(a.label) : null, color: a.color || null }) });
      }
      return { value: from.concat(to), notes };
    } },
    { type: 'command', when: { action: 'disconnect' }, run(a, ctx) {
      const W = ctx.world; let from = names(a.from), to = names(a.to); const t = names(a.target);
      if (!from.length && !to.length && t.length) { from = [t[0]]; to = t.slice(1); }
      let doomed;
      if (a.quantifier === 'all' && !from.length) doomed = W.state.edges.slice();
      else {
        from = from.map(n => need(W, n).name); to = to.map(n => need(W, n).name);
        if (!from.length) throw new SOPError('Which connection? Try "disconnect A from B".');
        doomed = W.state.edges.filter(e => from.some(f => to.length ? to.some(x => (e.from === f && e.to === x) || (e.from === x && e.to === f)) : e.from === f || e.to === f));
      }
      if (!doomed.length) return { notes: ['there was nothing to disconnect'] };
      for (const e of doomed) ctx.emit({ op: 'unlink', id: e.id });
      return { value: from.concat(to) };
    } }
  ]
};

const layoutPlugin = {
  name: 'layout', title: 'Layout',
  description: 'Align shapes along an axis, or arrange many shapes as a row, column, grid or circle.',
  legend: {
    action: { values: { align: ['align', 'line up'], arrange: ['arrange', 'layout', 'lay out', 'organize', 'organise', 'tidy'], distribute: ['distribute', 'space', 'spread'], toFront: ['bring', 'raise'], toBack: ['send'] } },
    axis: { ask: 'Along which axis?', kind: 'enum', values: { horizontal: ['horizontally', 'in a row'], vertical: ['vertically', 'in a column'] } },
    layout: { ask: 'In what pattern?', kind: 'enum', values: { row: ['row', 'line'], column: ['column', 'stack'], grid: ['grid', 'tidy'], circle: ['circle', 'ring'] } }
  },
  handlers: [
    { type: 'command', when: { action: 'distribute' }, run(a, ctx) {
      const W = ctx.world, t = expandGroups(W, names(a.target)), list = (t.length ? t.map(n => need(W, n)) : W.state.shapes.slice());
      if (list.length < 3) throw new SOPError('Spacing evenly needs at least three shapes.');
      const horiz = a.axis !== 'vertical', key = horiz ? 'x' : 'y', sorted = list.slice().sort((p, q) => p[key] - q[key]);
      const lo = sorted[0][key], hi = sorted[sorted.length - 1][key], step = (hi - lo) / (sorted.length - 1);
      sorted.forEach((s, i) => { if (i && i < sorted.length - 1) ctx.emit({ op: 'set', name: s.name, props: { [key]: Math.round(lo + i * step) } }); });
      return { value: sorted.map(s => s.name), notes: [`spaced ${horiz ? 'horizontally' : 'vertically'}, ${Math.round(step)} px apart`] };
    } },
    { type: 'command', when: { action: ['toFront', 'toBack'] }, run(a, ctx) {
      const W = ctx.world, t = targetsOf(W, a, a.action === 'toFront' ? 'bring to the front' : 'send to the back');
      for (const n of t) ctx.emit({ op: 'reorder', name: need(W, n).name, to: a.action === 'toFront' ? 'front' : 'back' });
      return { value: t };
    } },
    { type: 'command', when: { action: 'align' }, run(a, ctx) {
      const W = ctx.world, list = targetsOf(W, a, 'align').map(n => need(W, n));
      if (list.length < 2) throw new SOPError('Align needs at least two shapes.');
      const horiz = a.axis !== 'vertical', base = list[0];
      const sorted = list.slice().sort((p, q) => horiz ? p.x - q.x : p.y - q.y); let edge = null;
      for (const s of sorted) {
        const d = dims(s); let x = horiz ? s.x : base.x, y = horiz ? base.y : s.y;
        if (edge != null) { if (horiz && x - d.w / 2 < edge + 24) x = edge + 24 + d.w / 2; if (!horiz && y - d.h / 2 < edge + 24) y = edge + 24 + d.h / 2; }
        const p = inCell(base.x, base.y, () => clampPt(x, y, d.w, d.h)); edge = horiz ? p.x + d.w / 2 : p.y + d.h / 2;
        ctx.emit({ op: 'set', name: s.name, props: { x: p.x, y: p.y } });
      }
      return { value: list.map(s => s.name) };
    } },
    { type: 'command', when: { action: 'arrange' }, run(a, ctx) {
      const W = ctx.world; const t = expandGroups(W, names(a.target));
      const list = (t.length ? t.map(n => need(W, n)) : W.state.shapes.slice()).sort((p, q) => p.order - q.order);
      if (!list.length) throw new SOPError('There is nothing to arrange.');
      const n = list.length, lay = a.layout || (a.axis === 'vertical' ? 'column' : a.axis === 'horizontal' ? 'row' : 'grid');
      const cw = Math.max(...list.map(s => dims(s).w)) + 46, ch = Math.max(...list.map(s => dims(s).h)) + 46;
      list.forEach((s, i) => {
        let x, y;
        if (lay === 'row') { const step = Math.min(cw, (CANVAS.W - 80) / Math.max(1, n - 1)); x = FR.x + 400 - step * (n - 1) / 2 + i * step; y = FR.y + 250; }
        else if (lay === 'column') { const step = Math.min(ch, (CANVAS.H - 80) / Math.max(1, n - 1)); x = FR.x + 400; y = FR.y + 250 - step * (n - 1) / 2 + i * step; }
        else if (lay === 'circle') { const r = Math.min(200, Math.max(110, n * 26)); const ang = -Math.PI / 2 + i * 2 * Math.PI / n; x = FR.x + 400 + Math.cos(ang) * r * 1.3; y = FR.y + 250 + Math.sin(ang) * r; }
        else { const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols); x = FR.x + 400 - cw * (cols - 1) / 2 + (i % cols) * cw; y = FR.y + 250 - ch * (rows - 1) / 2 + Math.floor(i / cols) * ch; }
        const d = dims(s), p = clampPt(x, y, d.w, d.h); ctx.emit({ op: 'set', name: s.name, props: { x: p.x, y: p.y } });
      });
      return { value: list.map(s => s.name), notes: [`${lay} layout`] };
    } }
  ]
};

const queriesPlugin = {
  name: 'queries', title: 'Queries',
  description: 'Answers questions by looking at the current state: counts, lists, properties, spatial checks, neighbours, extremes.',
  legend: {
    ask: { ask: 'What is being asked?', kind: 'enum', values: { count: ['how many'], list: ['list', 'which', 'show'], exists: ['is there', 'are there'], property: ['what color', 'where is', 'how big'], check: ['is A …?'], describe: ['describe', 'what is on'], neighbors: ['what is connected to'], connected: ['are A and B connected'], degree: ['how many connections does'], nearest: ['closest', 'nearest', 'farthest'], extreme: ['biggest', 'leftmost', 'most connections'] } },
    property: { ask: 'Which property is asked about?', kind: 'enum', values: { color: ['colour'], size: ['how big'], shape: [], label: ['text'], position: ['where', 'location'], outline: ['border'] } },
    kind: { ask: 'Shapes, or connections?', kind: 'enum', values: { shape: [], edge: ['arrows', 'connections', 'links', 'edges', 'lines'] } },
    comparison: { ask: 'Compared how?', kind: 'enum', values: { bigger: ['larger'], smaller: [] } },
    superlative: { ask: 'Which extreme?', kind: 'enum', values: { biggest: ['largest'], smallest: ['tiniest'], leftmost: [], rightmost: [], topmost: ['highest'], bottommost: ['lowest'], closest: ['nearest'], farthest: ['furthest'], mostConnected: ['most connections', 'most links'], leastConnected: ['fewest connections', 'least connections', 'fewest links'] } }
  },
  handlers: [
    { type: 'question', when: { ask: 'count' }, run(a, ctx) {
      const W = ctx.world;
      if (a.kind === 'edge') { const n = W.state.edges.length; return { value: n, answer: `There ${n === 1 ? 'is 1 connection' : 'are ' + n + ' connections'}.`, highlight: { edges: W.state.edges.map(e => e.id) } }; }
      const list = filterShapes(W, a, a.target ? names(a.target) : null), n = list.length;
      return { value: n, answer: `There ${n === 1 ? 'is' : 'are'} ${n} ${phraseOf(a, n)}.`, highlight: { shapes: list.map(s => s.name) } };
    } },
    { type: 'question', when: { ask: 'list' }, run(a, ctx) {
      const W = ctx.world;
      if (a.kind === 'edge') { const e = W.state.edges; return { value: e.map(x => x.id), answer: e.length ? 'Connections: ' + e.map(edgeText).join('; ') + '.' : 'There are no connections.', highlight: { edges: e.map(x => x.id) } }; }
      const list = filterShapes(W, a, a.target ? names(a.target) : null);
      if (!list.length) return { value: [], answer: `There are no ${phraseOf(a, 2)}.` };
      return { value: list.map(s => s.name), answer: `${list.length} ${phraseOf(a, list.length)}: ${list.map(s => `${s.name} (${s.color} ${s.shape})`).join(', ')}.`, highlight: { shapes: list.map(s => s.name) } };
    } },
    { type: 'question', when: { ask: 'exists' }, run(a, ctx) {
      const list = filterShapes(ctx.world, a, a.target ? names(a.target) : null);
      return list.length ? { value: true, answer: `Yes: ${listing(list.map(s => s.name))}.`, highlight: { shapes: list.map(s => s.name) } } : { value: false, answer: `No, there is no ${phraseOf(a, 1)}.` };
    } },
    { type: 'question', when: { ask: 'property' }, run(a, ctx) {
      const W = ctx.world, t = needTargets(a, 'describe'), prop = a.property || 'color';
      const parts = t.map(n => { const s = need(W, n);
        switch (prop) {
          case 'size': return `${s.name} is ${sizeName(s.size)} (${dims(s).w}×${dims(s).h} px)`;
          case 'shape': return `${s.name} is a ${s.shape}`;
          case 'label': return s.label ? `${s.name} says "${s.label}"` : `${s.name} has no label`;
          case 'position': return `${s.name} is at (${s.x}, ${s.y}), in the ${region(s)}`;
          case 'outline': return s.outline ? `${s.name} has a ${s.outline} outline` : `${s.name} has no outline`;
          default: return `${s.name} is ${s.color}`;
        } });
      return { value: parts, answer: parts.join('; ') + '.', highlight: { shapes: t.map(n => need(W, n).name) } };
    } },
    { type: 'question', when: { ask: 'check' }, run(a, ctx) {
      const W = ctx.world, s = need(W, needTargets(a, 'check')[0]), checks = [];
      if (a.color) checks.push([s.color === a.color, `${s.name} is ${s.color}`]);
      if (a.shape && a.shape !== 'any') checks.push([s.shape === a.shape, `${s.name} is a ${s.shape}`]);
      if (a.size) checks.push([sizeName(s.size) === a.size, `${s.name} is ${sizeName(s.size)}`]);
      if (a.outline) checks.push([(s.outline || 'none') === a.outline, s.outline ? `${s.name} has a ${s.outline} outline` : `${s.name} has no outline`]);
      for (const [pk, ak] of [['position', 'anchor'], ['position2', 'anchor2']]) if (a[pk] && a[ak] && !SPOTS[a[pk]]) { const anc = names(a[ak]).map(n => needAnchor(W, n)); const ok = relHolds(s, a[pk], anc); checks.push([ok, `${s.name} is ${ok ? '' : 'not '}${POS_WORDS[a[pk]]} ${listing(anc.map(x => x.name))}`]); }
      for (const sp of [a.position, a.position2, a.region]) if (sp && SPOTS[sp]) { const ok = inSpot(s, sp); checks.push([ok, `${s.name} is ${ok ? '' : 'not '}in the ${camelWords(sp)}`]); }
      if (a.comparison && a.anchor) { const o = need(W, names(a.anchor)[0]), A = dims(s).w * dims(s).h, B = dims(o).w * dims(o).h; const ok = a.comparison === 'bigger' ? A > B : A < B; checks.push([ok, `${s.name} covers ${A} px² and ${o.name} covers ${B} px²`]); }
      if (!checks.length) return { value: true, answer: describeShape(s) + '.', highlight: { shapes: [s.name] } };
      const ok = checks.every(c => c[0]);
      return { value: ok, answer: `${ok ? 'Yes' : 'No'}: ${checks.map(c => c[1]).join('; ')}.`, highlight: { shapes: [s.name].concat(names(a.anchor), names(a.anchor2)) } };
    } },
    { type: 'question', when: { ask: 'describe' }, run(a, ctx) {
      const W = ctx.world, t = names(a.target);
      if (t.length) { const list = t.map(n => need(W, n)); return { value: t, answer: list.map(s => { const d = degree(W, s.name); return describeShape(s) + `, with ${d} connection${d === 1 ? '' : 's'}`; }).join('. ') + '.', highlight: { shapes: list.map(s => s.name) } }; }
      const S = W.state; if (!S.shapes.length) return { value: null, answer: 'The canvas is empty.' };
      const kinds = {}; S.shapes.forEach(s => { kinds[s.shape] = (kinds[s.shape] || 0) + 1; });
      let ans = `The canvas has ${S.shapes.length} shape${S.shapes.length === 1 ? '' : 's'} (${Object.entries(kinds).map(([k, v]) => v + ' ' + plural(k, v)).join(', ')}) and ${S.edges.length} connection${S.edges.length === 1 ? '' : 's'}. `;
      ans += S.shapes.map(describeShape).join('. ') + '.';
      if (S.edges.length) ans += ' Connections: ' + S.edges.map(edgeText).join('; ') + '.';
      return { value: null, answer: ans };
    } },
    { type: 'question', when: { ask: 'neighbors' }, run(a, ctx) {
      const W = ctx.world, s = need(W, needTargets(a, 'inspect')[0]);
      const out = W.state.edges.filter(e => e.from === s.name), inc = W.state.edges.filter(e => e.to === s.name);
      if (!out.length && !inc.length) return { value: [], answer: `${s.name} isn't connected to anything.`, highlight: { shapes: [s.name] } };
      const parts = [];
      if (out.length) parts.push(`${s.name} connects to ${listing(out.map(e => e.to))}`);
      if (inc.length) parts.push(`${listing(inc.map(e => e.from))} connect${inc.length === 1 ? 's' : ''} to ${s.name}`);
      const nb = [...new Set(out.map(e => e.to).concat(inc.map(e => e.from)))];
      return { value: nb, answer: parts.join('; ') + '.', highlight: { shapes: nb.concat(s.name), edges: out.concat(inc).map(e => e.id) } };
    } },
    { type: 'question', when: { ask: 'connected' }, run(a, ctx) {
      const W = ctx.world, x = need(W, needTargets(a, 'check')[0]), y = need(W, names(a.anchor)[0] || names(a.target)[1]);
      const es = W.state.edges.filter(e => (e.from === x.name && e.to === y.name) || (e.from === y.name && e.to === x.name));
      if (es.length) return { value: true, answer: `Yes, directly: ${es.map(edgeText).join('; ')}.`, highlight: { shapes: [x.name, y.name], edges: es.map(e => e.id) } };
      return { value: false, answer: `Not directly. Ask "is there a path from ${x.name} to ${y.name}?" to check indirect links.`, highlight: { shapes: [x.name, y.name] } };
    } },
    { type: 'question', when: { ask: 'degree' }, run(a, ctx) {
      const W = ctx.world, s = need(W, needTargets(a, 'inspect')[0]), es = W.state.edges.filter(e => e.from === s.name || e.to === s.name);
      return { value: es.length, answer: `${s.name} has ${es.length} connection${es.length === 1 ? '' : 's'}${es.length ? ': ' + es.map(edgeText).join('; ') : ''}.`, highlight: { shapes: [s.name], edges: es.map(e => e.id) } };
    } },
    { type: 'question', when: { ask: 'nearest' }, run(a, ctx) {
      const W = ctx.world, anc = need(W, names(a.anchor)[0] || needTargets(a, 'measure from')[0]);
      const list = filterShapes(W, Object.assign({}, a, { position: null, anchor: null }), null).filter(s => s.name !== anc.name);
      if (!list.length) return { value: null, answer: `There is no other ${phraseOf(a, 1)} to compare with.` };
      const far = a.superlative === 'farthest', dist = s => Math.hypot(s.x - anc.x, s.y - anc.y);
      const best = list.reduce((b, s) => (far ? dist(s) > dist(b) : dist(s) < dist(b)) ? s : b);
      return { value: [best.name], answer: `${best.name} is the ${far ? 'farthest' : 'closest'} ${phraseOf(a, 1)} to ${anc.name} (${Math.round(dist(best))} px between centers).`, highlight: { shapes: [best.name, anc.name] } };
    } },
    { type: 'question', when: { ask: 'extreme' }, run(a, ctx) {
      const W = ctx.world, list = filterShapes(W, a, a.target ? names(a.target) : null), sup = a.superlative || 'biggest';
      if (!list.length) return { value: null, answer: `There are no ${phraseOf(a, 2)}.` };
      const area = s => dims(s).w * dims(s).h;
      const score = { biggest: s => area(s), smallest: s => -area(s), leftmost: s => -s.x, rightmost: s => s.x, topmost: s => -s.y, bottommost: s => s.y, mostConnected: s => degree(W, s.name), leastConnected: s => -degree(W, s.name) }[sup] || (s => area(s));
      const top = Math.max(...list.map(score)), win = list.filter(s => score(s) === top);
      const detail = sup.endsWith('Connected') ? ` (${degree(W, win[0].name)} connection${degree(W, win[0].name) === 1 ? '' : 's'}${win.length > 1 ? ' each' : ''})` : '';
      const word = { mostConnected: 'has the most connections', leastConnected: 'has the fewest connections' }[sup] || `is the ${sup}`;
      const who = win.length > 1 ? `${listing(win.map(s => s.name))} tie: they ${word.replace(/^is the/, 'are the').replace(/^has/, 'have')}` : `${win[0].name} ${word}`;
      return { value: win.map(s => s.name), answer: `${who}${a.shape && a.shape !== 'any' ? ' among the ' + plural(a.shape, 2) : ''}${detail}.`, highlight: { shapes: win.map(s => s.name) } };
    } }
  ]
};

/* ---------- generic logic reasoner: world → facts, question wire → Datalog query ---------- */
const SPOT_NAMES = ['center', 'top', 'bottom', 'left', 'right', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight'];
const REL_NAMES = ['leftOf', 'rightOf', 'above', 'below', 'near'];
const posLits = (v, anc) => SPOT_NAMES.includes(v) ? [['inspot', '?X', v]] : v === 'between' ? names(anc).length >= 2 ? [['between', '?X', names(anc)[0], names(anc)[1]]] : null : names(anc).map(n => ['rel', v, '?X', n]);
/* How each legend question constrains the subject ?X. Adding a question = adding a line here. */
const LOGIC_MAP = {
  shape: v => v === 'any' ? null : [['shape', '?X', v]],
  color: v => [['color', '?X', v]],
  size: v => [['size', '?X', v]],
  outline: v => [['outline', '?X', v]],
  notColor: v => [['othercolor', '?X', v]],
  label: v => [['label', '?X', String(v)]],
  position: (v, a) => posLits(v, a.anchor),
  position2: (v, a) => posLits(v, a.anchor2),
  region: v => SPOT_NAMES.includes(v) ? [['inspot', '?X', v]] : null,
  linked: v => names(v).map(n => ['adjacent', '?X', n])
};
function worldFacts(W) {
  const S = W.state, f = [];
  for (const s of S.shapes) {
    f.push(['shape', s.name, s.shape], ['color', s.name, s.color], ['size', s.name, sizeName(s.size)], ['outline', s.name, s.outline || 'none']);
    for (const c of Object.keys(COLOR_HEX)) if (c !== s.color) f.push(['othercolor', s.name, c]);
    if (s.label) f.push(['label', s.name, s.label]);
  }
  for (const sp of SPOT_NAMES) for (const s of filterShapes(W, { position: sp }, null)) f.push(['inspot', s.name, sp]);
  for (const a of S.shapes) for (const b of S.shapes) if (a !== b) {
    if (K_SAME_CELL(a, b)) for (const r of REL_NAMES) if (relHolds(a, r, [b])) f.push(['rel', r, a.name, b.name]);
  }
  for (const g of S.groups || []) {   // a group as an anchor: the box around its members (its own members are not related to it)
    const b = needAnchor(W, g.name);
    for (const a of S.shapes) if (!g.members.includes(a.name) && K_SAME_CELL(a, b)) for (const r of REL_NAMES) if (relHolds(a, r, [b])) f.push(['rel', r, a.name, g.name]);
    for (const m of g.members) f.push(['member', m, g.name]);
  }
  for (const e of S.edges) {
    f.push(['link', e.from, e.to]);
    f.push(['edge', e.from, e.to]); if (e.arrow !== 'forward') f.push(['edge', e.to, e.from]);
  }
  return f;
}
const K_SAME_CELL = (a, b) => { const p = cellOf(a.x, a.y), q = cellOf(b.x, b.y); return p.x === q.x && p.y === q.y; };
const LOGIC_RULES = [
  { head: ['adjacent', '?X', '?Y'], body: [['link', '?X', '?Y']] },
  { head: ['adjacent', '?X', '?Y'], body: [['link', '?Y', '?X']] },
  { head: ['reach', '?X', '?Y'], body: [['edge', '?X', '?Y']] },
  { head: ['reach', '?X', '?Z'], body: [['reach', '?X', '?Y'], ['edge', '?Y', '?Z']] }
];
function betweenFacts(W, body) {
  const out = [];
  for (const lit of body) if (lit[0] === 'between') { const a = needAnchor(W, lit[2]), b = needAnchor(W, lit[3]); for (const s of W.state.shapes) if (s.name !== a.name && s.name !== b.name && relHolds(s, 'between', [a, b])) out.push(['between', s.name, a.name, b.name]); }
  return out;
}
function conditions(a, skip) {
  const body = [];
  for (const [k, fn] of Object.entries(LOGIC_MAP)) { if (a[k] == null || (skip || []).includes(k)) continue; if (k === 'position' && !SPOT_NAMES.includes(a.position) && a.anchor == null) continue; if (k === 'position2' && !SPOT_NAMES.includes(a.position2) && a.anchor2 == null) continue; const lits = fn(a[k], a); if (lits) body.push(...lits); }
  return body;
}
function logicProgram(W, body, query) {
  const facts = worldFacts(W).concat(betweenFacts(W, body)), db = datalog(facts, LOGIC_RULES);
  const used = new Set(body.map(l => l[0]).concat(query ? [query[0]] : []));
  const needs = new Set(); used.forEach(p => { needs.add(p); if (p === 'adjacent') needs.add('link'); if (p === 'reach') needs.add('edge'); });
  const shown = facts.filter(f => needs.has(f[0]) || f[0] === 'shape');
  const rules = LOGIC_RULES.filter(r => needs.has(r.head[0]));
  const text = q => ['% facts lowered from the drawing (only the predicates this query uses)', ...shown.slice(0, 60).map(f => lit(f) + '.'), shown.length > 60 ? `% … ${shown.length - 60} more facts` : null, rules.length ? '' : null, rules.length ? '% rules' : null, ...rules.map(r => `${lit(r.head)} :- ${r.body.map(lit).join(', ')}.`), '', '% query', `?- ${q}.`].filter(x => x != null).join('\n');
  return { db, text };
}
const qtext = body => body.map(lit).join(', ');

const logicPlugin = {
  name: 'logic', title: 'Logic reasoner (Datalog)', priority: 10,
  description: 'Lowers the whole drawing to Datalog facts and compiles any question wire into a query from its legend answers. It does not know which formalizer wrote the wire. Switch it off and the JavaScript query handlers answer instead.',
  handlers: [
    { type: 'question', when: { ask: ['count', 'list', 'exists'] }, run(a, ctx) {
      const W = ctx.world;
      if ((a.kind && a.kind !== 'shape') || a.target != null) return ctx.engine.fallback('question', a, ctx, this);
      const body = [['shape', '?X', '?K']].concat(conditions(a));
      const { db, text } = logicProgram(W, body);
      const xs = [...new Set(db.all(body).map(b => b['?X']))], n = xs.length;
      const lowering = text(qtext(body)) + `\n% ${n} answer${n === 1 ? '' : 's'}${n ? ': X ∈ {' + xs.join(', ') + '}' : ''}`;
      const hl = { shapes: xs };
      if (a.ask === 'count') return { value: n, answer: `There ${n === 1 ? 'is' : 'are'} ${n} ${phraseOf(a, n)}.`, lowering, highlight: hl };
      if (a.ask === 'exists') return n ? { value: true, answer: `Yes: ${listing(xs)}.`, lowering, highlight: hl } : { value: false, answer: `No, there is no ${phraseOf(a, 1)}.`, lowering };
      if (!n) return { value: [], answer: `There are no ${phraseOf(a, 2)}.`, lowering };
      return { value: xs, answer: `${n} ${phraseOf(a, n)}: ${xs.map(x => { const s = W.find(x); return `${x} (${s.color} ${s.shape})`; }).join(', ')}.`, lowering, highlight: hl };
    } },
    { type: 'question', when: { ask: 'check' }, run(a, ctx) {
      const W = ctx.world, t = need(W, needTargets(a, 'check')[0]);
      if (a.comparison) return ctx.engine.fallback('question', a, ctx, this);
      const conds = conditions(a);
      if (!conds.length) return ctx.engine.fallback('question', a, ctx, this);
      const bound = conds.map(l => l.map(x => x === '?X' ? t.name : x));
      const { db, text } = logicProgram(W, conds);
      const each = bound.map(l => ({ l, ok: db.all([l]).length > 0 }));
      const ok = each.every(e => e.ok);
      const say = ({ l, ok }) => {
        const [p] = l; const s = t;
        if (p === 'color') return ok ? `${s.name} is ${l[2]}` : `${s.name} is ${s.color}, not ${l[2]}`;
        if (p === 'shape') return ok ? `${s.name} is a ${l[2]}` : `${s.name} is a ${s.shape}, not a ${l[2]}`;
        if (p === 'size') return ok ? `${s.name} is ${l[2]}` : `${s.name} is ${sizeName(s.size)}, not ${l[2]}`;
        if (p === 'outline') return ok ? `${s.name} has a ${l[2]} outline` : `${s.name} has ${s.outline ? 'a ' + s.outline : 'no'} outline`;
        if (p === 'rel') return `${s.name} is ${ok ? '' : 'not '}${POS_WORDS[l[1]]} ${l[3]}`;
        if (p === 'inspot') return `${s.name} is ${ok ? '' : 'not '}in the ${camelWords(l[2])}`;
        if (p === 'othercolor') return ok ? `${s.name} is ${s.color}, not ${l[2]}` : `${s.name} is ${l[2]}`;
        if (p === 'adjacent') return `${s.name} is ${ok ? '' : 'not '}connected to ${l[2]}`;
        if (p === 'between') return `${s.name} is ${ok ? '' : 'not '}between ${l[2]} and ${l[3]}`;
        if (p === 'label') return ok ? `${s.name} says “${l[2]}”` : `${s.name} ${s.label ? 'says “' + s.label + '”' : 'has no label'}`;
        return lit(l) + (ok ? ' holds' : ' does not hold');
      };
      return { value: ok, answer: `${ok ? 'Yes' : 'No'}: ${each.map(say).join('; ')}.`, lowering: text(qtext(bound)) + `\n% ${ok ? 'true' : 'false'}`, highlight: { shapes: [t.name].concat(names(a.anchor), names(a.anchor2), names(a.linked)) } };
    } },
    { type: 'question', when: { ask: ['neighbors', 'connected'] }, run(a, ctx) {
      const W = ctx.world, t = need(W, needTargets(a, 'inspect')[0]);
      if (a.ask === 'connected') {
        const o = need(W, names(a.anchor)[0] || names(a.target)[1]), q = ['adjacent', t.name, o.name];
        const { db, text } = logicProgram(W, [q]), ok = db.all([q]).length > 0;
        const es = W.state.edges.filter(e => (e.from === t.name && e.to === o.name) || (e.from === o.name && e.to === t.name));
        return { value: ok, answer: ok ? `Yes, directly: ${es.map(edgeText).join('; ')}.` : `Not directly. Ask “is there a path from ${t.name} to ${o.name}?” for indirect links.`, lowering: text(lit(q)) + `\n% ${ok}`, highlight: { shapes: [t.name, o.name], edges: es.map(e => e.id) } };
      }
      const q = ['adjacent', t.name, '?Y'], { db, text } = logicProgram(W, [q]);
      const ys = [...new Set(db.all([q]).map(b => b['?Y']))];
      const out = W.state.edges.filter(e => e.from === t.name), inc = W.state.edges.filter(e => e.to === t.name);
      const parts = []; if (out.length) parts.push(`${t.name} connects to ${listing(out.map(e => e.to))}`); if (inc.length) parts.push(`${listing(inc.map(e => e.from))} connect${inc.length === 1 ? 's' : ''} to ${t.name}`);
      return { value: ys, answer: ys.length ? parts.join('; ') + '.' : `${t.name} isn't connected to anything.`, lowering: text(lit(q)) + `\n% Y ∈ {${ys.join(', ')}}`, highlight: { shapes: ys.concat(t.name), edges: out.concat(inc).map(e => e.id) } };
    } },
    { type: 'question', when: { ask: 'path' }, run(a, ctx) {
      const W = ctx.world, f = need(W, names(a.from)[0] || needTargets(a, 'start from')[0]), t = need(W, names(a.to)[0] || names(a.target)[1] || names(a.anchor)[0]);
      const q = ['reach', f.name, t.name], { db, text } = logicProgram(W, [q]), ok = db.all([q]).length > 0;
      const lowering = text(lit(q)) + `\n% ${ok}`;
      if (ok) { const p = bfs(W, f.name, t.name, 'directed'); return { value: p.nodes, answer: `Yes: ${p.nodes.join(' → ')} (${p.edges.length} step${p.edges.length === 1 ? '' : 's'}).`, lowering, highlight: { shapes: p.nodes, edges: p.edges } }; }
      const p = bfs(W, f.name, t.name, 'undirected');
      if (p) return { value: false, answer: `No path follows the arrows from ${f.name} to ${t.name}. Ignoring direction they are linked: ${p.nodes.join(' — ')}.`, lowering, highlight: { shapes: p.nodes, edges: p.edges } };
      return { value: false, answer: `No, ${f.name} and ${t.name} are not linked at all.`, lowering, highlight: { shapes: [f.name, t.name] } };
    } },
    { type: 'question', when: { ask: 'reachable' }, run(a, ctx) {
      const W = ctx.world, f = need(W, names(a.from)[0] || needTargets(a, 'start from')[0]);
      const body = [['reach', f.name, '?X']].concat(conditions(a));
      const { db, text } = logicProgram(W, body);
      const r = [...new Set(db.all(body).map(b => b['?X']))].filter(n => n !== f.name);
      const what = conditions(a).length ? ' ' + phraseOf(a, r.length) : '';
      return { value: r, answer: r.length ? `From ${f.name} you can reach ${what ? r.length + what + ': ' : ''}${listing(r)}.` : `Nothing${what} can be reached from ${f.name} by following arrows.`, lowering: text(qtext(body)) + `\n% X ∈ {${r.join(', ')}}`, highlight: { shapes: r.concat(f.name) } };
    } },
    { type: 'question', when: { ask: 'cycle' }, run(a, ctx) {
      const W = ctx.world, q = ['reach', '?X', '?X'];
      const facts = edgeFacts(W, 'cycle'), db = datalog(facts, REACH), r = [...new Set(db.query(q).map(b => b['?X']))];
      return { value: r, answer: r.length ? `Yes, ${listing(r)} sit on a cycle of one-way arrows.` : 'No cycles: following the one-way arrows never brings you back to a shape. Two-way arrows and plain lines are not counted.', lowering: lowerDatalog(facts, REACH, q, r.length ? 'X ∈ {' + r.join(', ') + '}' : 'no answers'), highlight: { shapes: r } };
    } }
  ]
};
const camelWords = v => v.replace(/([A-Z])/g, ' $1').toLowerCase();

const reasoningPlugin = {
  name: 'reasoning', title: 'Graph reasoning (Datalog)',
  description: 'Lowers the connection graph to Datalog facts plus recursive rules, and evaluates them to answer path, reachability and cycle questions.',
  legend: { ask: { values: { path: ['is there a path', 'can I get from'], reachable: ['what can be reached from'], cycle: ['are there cycles'] } } },
  handlers: [
    { type: 'question', when: { ask: 'path' }, run(a, ctx) {
      const W = ctx.world, f = need(W, names(a.from)[0] || needTargets(a, 'start from')[0]), t = need(W, names(a.to)[0] || names(a.target)[1] || names(a.anchor)[0]);
      const facts = edgeFacts(W, 'directed'), db = datalog(facts, REACH), q = ['reach', f.name, t.name], ok = db.query(q).length > 0;
      const lowering = lowerDatalog(facts, REACH, q, ok ? 'true' : 'false');
      if (ok) { const p = bfs(W, f.name, t.name, 'directed'); return { value: p.nodes, answer: `Yes: ${p.nodes.join(' → ')} (${p.edges.length} step${p.edges.length === 1 ? '' : 's'}).`, lowering, highlight: { shapes: p.nodes, edges: p.edges } }; }
      const p = bfs(W, f.name, t.name, 'undirected');
      if (p) return { value: false, answer: `No path follows the arrows from ${f.name} to ${t.name}. Ignoring direction they are linked: ${p.nodes.join(' — ')}.`, lowering, highlight: { shapes: p.nodes, edges: p.edges } };
      return { value: false, answer: `No, ${f.name} and ${t.name} are not linked at all.`, lowering, highlight: { shapes: [f.name, t.name] } };
    } },
    { type: 'question', when: { ask: 'reachable' }, run(a, ctx) {
      const W = ctx.world, f = need(W, names(a.from)[0] || needTargets(a, 'start from')[0]);
      const facts = edgeFacts(W, 'directed'), db = datalog(facts, REACH), q = ['reach', f.name, '?Y'];
      const r = [...new Set(db.query(q).map(b => b['?Y']))].filter(n => n !== f.name);
      return { value: r, answer: r.length ? `From ${f.name} you can reach ${listing(r)}.` : `Nothing can be reached from ${f.name} by following arrows.`, lowering: lowerDatalog(facts, REACH, q, r.length ? 'Y ∈ {' + r.join(', ') + '}' : 'no answers'), highlight: { shapes: r.concat(f.name) } };
    } },
    { type: 'question', when: { ask: 'cycle' }, run(a, ctx) {
      const W = ctx.world, facts = edgeFacts(W, 'cycle'), db = datalog(facts, REACH), q = ['reach', '?X', '?X'];
      const r = [...new Set(db.query(q).map(b => b['?X']))];
      return { value: r, answer: r.length ? `Yes, ${listing(r)} sit on a cycle of one-way arrows.` : 'No cycles: following the one-way arrows never brings you back to a shape. Two-way arrows and plain lines are not counted.', lowering: lowerDatalog(facts, REACH, q, r.length ? 'X ∈ {' + r.join(', ') + '}' : 'no answers'), highlight: { shapes: r } };
    } }
  ]
};

const rulesPlugin = {
  name: 'rules', title: 'Default rules',
  description: 'Rules such as "from now on circles are orange" fill in answers the user leaves out when creating shapes.',
  legend: { action: { values: { forget: ['forget', 'discard', 'disregard'] } }, ask: { values: { rules: ['what rules'] } } },
  handlers: [
    { type: 'rule', run(a, ctx) {
      const W = ctx.world, r = { id: 'r' + (++W.state.ruleSeq), shape: a.shape && a.shape !== 'any' ? a.shape : null, color: a.color || null, size: a.size || null, outline: a.outline && a.outline !== 'none' ? a.outline : null };
      if (!r.color && !r.size && !r.outline) throw new SOPError('A rule needs something to apply, such as a color, size or outline.');
      ctx.emit({ op: 'rule', rule: r });
      return { value: [r.id], notes: [`new ${r.shape ? plural(r.shape, 2) : 'shapes'} default to ${['size', 'color', 'outline'].filter(k => r[k]).map(k => k === 'outline' ? r[k] + ' outline' : r[k]).join(', ')}`] };
    } },
    { type: 'command', when: { action: 'forget' }, run(a, ctx) { const n = ctx.world.state.rules.length; ctx.emit({ op: 'forget' }); return { notes: [`removed ${n} rule${n === 1 ? '' : 's'}`] }; } },
    { type: 'question', when: { ask: 'rules' }, run(a, ctx) {
      const R = ctx.world.state.rules;
      return { value: R.map(r => r.id), answer: R.length ? R.map(r => `${r.id}: new ${r.shape ? plural(r.shape, 2) : 'shapes'} are ${['size', 'color'].filter(k => r[k]).map(k => r[k]).join(' ')}${r.outline ? ' with a ' + r.outline + ' outline' : ''}`).join('; ') + '.' : 'No rules are active.' };
    } }
  ]
};

const factsPlugin = {
  name: 'facts', title: 'Facts as constraints',
  description: 'Statements like "A is above B" are treated as constraints: already true means no change; otherwise the world is adjusted until they hold.',
  handlers: [{
    type: 'fact', run(a, ctx) {
      const W = ctx.world, notes = []; let answer;
      for (const n of needTargets(a, 'describe')) {
        const s = need(W, n), p = {};
        if (a.color && s.color !== a.color) p.color = a.color;
        if (a.shape && a.shape !== 'any' && s.shape !== a.shape) p.shape = a.shape;
        if (a.size && sizeName(s.size) !== a.size) p.size = SIZE_PX[a.size];
        if (a.outline && (s.outline || 'none') !== a.outline) p.outline = a.outline === 'none' ? null : a.outline;
        if (a.label != null && s.label !== String(a.label)) p.label = String(a.label);
        if (isMulti(a)) {   // several constraints: already true, or placed where they hold
          const cs = constraintsOf(W, a);
          if (cs.every(c => consHolds(c, s))) notes.push(`${s.name} is already ${listing(cs.map(consText))}`);
          else { const d = dims(Object.assign({}, s, p)), q = placeMulti(W, a, d.w, d.h, [s.name]); p.x = q.x; p.y = q.y; if (q.unmet.length) answer = unmetText(s.name, q); }
        } else if (a.position && a.anchor) {
          const anc = names(a.anchor).map(x => needAnchor(W, x));
          if (relHolds(s, a.position, anc)) notes.push(`${s.name} is already ${POS_WORDS[a.position]} ${listing(anc.map(x => x.name))}`);
          else { const d = dims(Object.assign({}, s, p)); Object.assign(p, relSpot(W, d.w, d.h, a.position, anc, null, [s.name])); }
        } else if (a.position && SPOTS[a.position]) { const d = dims(s); Object.assign(p, nearFree(W, ...spot(a.position), d.w, d.h, [s.name])); }
        if (Object.keys(p).length) ctx.emit({ op: 'set', name: s.name, props: p });
        else if (!a.linked && !notes.length) notes.push('already true, nothing to change');
        for (const l of names(a.linked)) { const t = need(W, l); if (adjacent(W, s.name, t.name)) notes.push(`${s.name} and ${t.name} are already connected`); else ctx.emit({ op: 'link', edge: W.newEdge(s.name, t.name, { arrow: 'none' }) }); }
      }
      return { value: names(a.target), notes, answer };
    }
  }]
};

/* =====================================================================
   6. Formalizer: English → SOP, driven by the legend's cues
   ===================================================================== */
const NUMW = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const NUMRE = '\\d+|' + Object.keys(NUMW).join('|');
const toNum = w => /^\d+$/.test(w) ? +w : NUMW[w.toLowerCase()];
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alt = arr => [...new Set(arr)].sort((a, b) => b.length - a.length).map(esc).join('|');
const M = '⟦(\\d+)⟧';
const EDGE_WORDS = 'arrows?|lines?|edges?|links?|connections?|connectors?|wires?';
function osa(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i].concat(Array(b.length).fill(0)));
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    const c = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
const COMMON = new Set(('the and for all too also not but with without from into onto over under above below between near next left right top bottom middle center centre '
  + 'list lists name names named called call show tell give what which where when who how many much more most less least does have has had are was were will would should could can '
  + 'this that these those them they their there here then than its it one two three four five six seven eight nine ten twice same other others each every any some none '
  + 'please thanks thank yes way ways new old again just only also very bit little lot lots like want need make made let lets put get got set see look line lines arrow arrows link links '
  + 'connection connections edge edges label labels text say says saying title word words color colour colors colours size sizes shape shapes thing things item items node nodes '
  + 'canvas diagram drawing page screen everything nothing something rule rules default defaults from now on future always path route cycle cycles loop loops reach reachable '
  + 'describe summary count number total close closest near nearest far farthest furthest big bigger biggest small smaller smallest large larger largest '
  + 'labeled labelled colored coloured connected linked attached joined filled outlined titled reading actually slightly horizontally vertically really maybe instead '
  + 'new newest last latest recent first oldest earliest get rid got back front take bring send next chain order sequence pair pairs other evenly apart behind non '
  + 'leftmost rightmost highest lowest corner side edge row column grid ring stack dashed dotted solid plain border outline stroke yourself up down').split(' '));
const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'to', 'of', 'in', 'on', 'at', 'it', 'is', 'are', 'be', 'with', 'by', 'from', 'into', 'as', 'that', 'this', 'please', 'new', 'another']);

function makeFormalizer(engine) {
  const L = engine.legend;
  /** formalize(input, ctx[, opts]). opts.units ([{c0, c1}], character offsets into input, in order): read these units instead of cutting the
   *  message itself (the cut chosen in the demo's settings, docs/js/vss-composer.js cutUnits): each unit is read as ONE clause by the same
   *  clause reader, with the same context carried from clause to clause (names created earlier, `last`, the verb of an ellipsis); the
   *  rules' own cutting steps (sentences, verb and coordination splits, merging a verbless piece into the next, one clause per created
   *  object, the chain merge of consecutive connections) do not run. Each wire read from a unit gets span = [c0, c1] (not enumerable).
   *  Without opts.units nothing changes. */
  return function formalize(input, ctx, opts) {
    const given = opts && Array.isArray(opts.units) ? opts.units : null, original = input;
    const lx = k => L.lexicon(k);
    const SHAPE = lx('shape'), COLOR = lx('color'), SIZE = lx('size'), ACTION = lx('action');
    const generic = new Set(SHAPE_VALUES.any.concat('any'));
    const nounWords = [...SHAPE.keys()];
    const pluralNoun = w => /s$/.test(w) && !['rhombus'].includes(w) && w !== 'ones' ? true : w === 'ones';
    const colorRe = alt([...COLOR.keys()]), sizeRe = alt([...SIZE.keys()]), nounRe = alt(nounWords);
    const MOD = `(?:(?:${colorRe}|${sizeRe})\\s+){0,3}`;
    const verbCues = [...ACTION.keys()].filter(w => !['undo', 'redo', 'revert'].includes(w));
    const ARTICLE_AHEAD = new RegExp(`^\\s+(?:new\\s+|few\\s+|couple\\b|copy\\b|bit\\b|little\\b|lot\\b|(?:(?:${colorRe}|${sizeRe}|dashed|dotted|solid)\\s+){0,3}(?:${nounRe}|${EDGE_WORDS})\\b)`, 'i');
    const VERB_RE = new RegExp(`\\b(${alt(verbCues)})\\b`, 'i');

    const F = { nodes: [], notes: [], s: 0, m: 0, segments: [] };
    // group names are names too (ctx.groups, or the groups of this formalizer's own world)
    const groupNames = (ctx.groups || (engine.world && engine.world.state.groups || []).map(g => g.name)).map(String);
    const groupSet = new Set(groupNames.map(g => g.toLowerCase()));
    const nameIndex = new Map((ctx.names || []).concat(groupNames).map(n => [n.toLowerCase(), n]));
    const groupAltRe = groupNames.slice().sort((a, b) => b.length - a.length).map(esc).join('|');
    let lastRef = null, lastGroup = null;
    if (ctx.last && ctx.last.length) { lastGroup = ctx.last.slice(); lastRef = ctx.last.length === 1 ? ctx.last[0] : null; }

    // ---- spelling: map near-misses onto legend cue words and shape names ----
    const corrections = [];
    let fixText = null;
    {
      const targets = new Map();
      const addT = (w, canon) => { const k = w.toLowerCase(); if (k.length >= 3 && !targets.has(k)) targets.set(k, canon); };
      for (const [k] of SHAPE) addT(k, k); for (const [k] of COLOR) addT(k, k); for (const [k] of SIZE) addT(k, k);
      for (const k of verbCues) if (!k.includes(' ') && k.length >= 4) addT(k, k);
      for (const n of nameIndex.values()) if (typeof n === 'string') addT(n, n);
      const nameList = [...nameIndex.values()].filter(n => typeof n === 'string');
      const introduced = new Set((input.match(/\b(?:named|called|name\s+it|rename\s+\S+\s+(?:to|as|into))\s+([A-Za-z_][\w-]*)/gi) || []).map(m => m.split(/\s+/).pop().toLowerCase()));
      if (/\b(?:group|together|bundle)\b/i.test(input)) for (const m of input.match(/\b(?:as|into)\s+([A-Za-z_][\w-]*)/gi) || []) introduced.add(m.split(/\s+/).pop().toLowerCase());   /* "group A and B as Pipeline" */
      const fixWord = w => {
        if (/^[A-Z]/.test(w) && !nameList.length) return null;
        if (introduced.has(w.toLowerCase()) || (/^[A-Z0-9]+$/.test(w) && w.length <= 4)) return null;
        const lw = w.toLowerCase();
        if (lw.length < 3 || COMMON.has(lw) || targets.has(lw) || /\d/.test(lw)) return null;
        for (const k of targets.keys()) if (k.length >= 3 && lw.startsWith(k) && lw.length - k.length <= 4) return null; /* an inflection of a known word: labeled, connected, circles */
        if (/(?:ed|ing|ly|tion|ness)$/.test(lw) && lw.length > 6) return null;
        const pre = nameList.filter(n => n.toLowerCase().startsWith(lw) && n.length - lw.length <= 2).sort((a, b) => a.length - b.length);
        if (pre.length && (pre.length === 1 || pre[0].length < pre[1].length)) return pre[0];
        const max = lw.length >= 7 ? 2 : 1; let best = null, bd = 99, tie = false;
        const capital = /^[A-Z]/.test(w);
        for (const [k, canon] of targets) {
          if (capital && !nameList.includes(canon)) continue; /* a capitalised word is a name: only correct it towards an existing name */
          if (Math.abs(k.length - lw.length) > max) continue; const d = osa(lw, k); if (d < bd) { bd = d; best = canon; tie = false; } else if (d === bd && canon !== best) tie = true; }
        return bd <= max && !tie ? best : null;
      };
      fixText = s => s.replace(/"[^"]*"|“[^”]*”|[A-Za-z][\w'-]*/g, w => {
        if (w[0] === '"' || w[0] === '“') return w;
        const f = fixWord(w); if (!f) return w;
        corrections.push(`I read “${w}” as “${f}”.`); return f;
      });
      if (!given) input = fixText(input);
    }
    const quotes = [];
    const quoteOut = s => s.replace(/"([^"]*)"|“([^”]*)”|(^|\s)'([^']+)'(?=[\s.,!?;]|$)/g, (m, a, b, pre, c) => { quotes.push(a != null ? a : b != null ? b : c); return (pre || '') + ' ⟪' + (quotes.length - 1) + '⟫ '; });
    let text = ' ' + input.trim() + ' ';
    if (!given) text = quoteOut(text);
    const unq = tok => { const m = /^⟪(\d+)⟫$/.exec(tok); return m ? quotes[+m[1]] : tok; };

    const sentences = text.split(/(?<=[.!?;])\s+/).map(s => s.trim()).filter(Boolean);
    const SPLIT_VERB = new RegExp(`\\s*(?:,\\s*(?:and\\s+)?|\\s+and\\s+)(?=(?:${alt(verbCues.concat(['undo', 'redo']))})\\b)`, 'i');
    const CREATE_START = /^\s*(?:please\s+)?(draw|add|create|insert|sketch|place|put|make)\s+(?:a|an|another|\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s/i;
    const OBJ_SPLIT = new RegExp(`\\s*(?:,\\s*(?:and\\s+|plus\\s+)?|\\s+and\\s+|\\s+plus\\s+)(?=(?:a|an|another|${NUMRE})\\s+(?:(?:[a-z-]+)\\s+){0,3}?(?:${nounRe})\\b)`, 'i');
    // coordination: "make Open green, Closed yellow and Locked red", "put Stove right of Sink and Fridge above Sink" -> one clause per
    // name, the verb repeated; only when the left piece is complete (verb + at least two more words) and the right piece starts with a
    // known name followed by a predicate word, and never inside "between A and B"
    const nameAltRe = [...nameIndex.keys()].filter(k => k.length > 1).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const PRED = `(?:to|a|an|in|at|on|into|onto|above|below|under|over|left|right|next|near|beside|by|up|down|${colorRe}|${sizeRe}|(?!ones?\\b)(?:${nounRe}))`;
    const COORD = nameAltRe ? new RegExp(`(?:,\\s*(?:and\\s+)?|\\s+and\\s+)(?=(?:the\\s+)?(?:${nameAltRe})\\s+${PRED}\\b)`, 'i') : null;
    const DIST_VERB = /^\s*(?:(?:please|now|then|and|also|ok(?:ay)?|so|just)\s+)*(make|put|move|place|turn|colou?r|paint|set|shift|drag|slide|connect|link|join|hook)\b/i;
    const coordSplit = p => {
      const vm = COORD && p.match(DIST_VERB); if (!vm || /\b(?:one\s+after\s+(?:the\s+)?other|in\s+(?:a\s+)?(?:chain|sequence|order)|to\s+the\s+next|each\s+other|every\s+pair)\b/i.test(p)) return [p];
      const pieces = p.split(COORD), out = [pieces[0]];
      for (const q of pieces.slice(1)) {
        const left = out[out.length - 1], afterVerb = left.slice(left.search(DIST_VERB) + vm[0].length).trim().split(/\s+/).filter(Boolean);
        if (/\bbetween\s+(?:the\s+)?\S+\s*$/i.test(left) || afterVerb.length < 2) out[out.length - 1] = left + ' and ' + q;
        else out.push(vm[1] + ' ' + q);
      }
      return out;
    };
    // verb ellipsis: "connect Api to Db, then Core to Utils", "Jazz blue" after "make X red" -> the previous clause's verb is repeated
    const ELLIPSIS = nameAltRe ? new RegExp(`^\\s*(?:(?:and|then|also|plus|now)\\s+)*(?:the\\s+)?(?:${nameAltRe})\\b\\s+\\S`, 'i') : null;
    let prevVerb = null;
    const PLACE_ONLY = nameAltRe ? new RegExp(`^\\s*(?:the\\s+)?(?:${nameAltRe})\\s+(?:(?:is|goes|sits|stays|should\\s+be|just|right|way|then)\\s+)*(?:(?:at|in|on|to)\\s+the\\s+(?:top|bottom|left|right|center|centre|middle|upper|lower)|(?:top|bottom|upper|lower)(?:[\\s-]+(?:left|right))?\\s*$|on\\s+top\\s*$|(?:in\\s+the\\s+)?(?:center|centre|middle)\\s*$|(?:above|below|under|over|beneath|underneath|left\\s+of|right\\s+of|next\\s+to|near|beside|between|on\\s+top\\s+of)\\b)`, 'i') : null;
    const CONNECT_ONLY = nameAltRe ? new RegExp(`^\\s*(?:the\\s+)?(?:${nameAltRe})(?:\\s*(?:,|and)\\s*(?:the\\s+)?(?:${nameAltRe}))*\\s+(?:(?:both\\s+|each\\s+|all\\s+)?(?:goes|go|leads?|flows?|feeds?|sends?|files|points?|runs?|passes|connects?)\\s+(?:in)?to|to)\\s+(?:the\\s+)?(?:${nameAltRe}|the\\s+next)\\b`, 'i') : null;
    const FACT_LIST = nameAltRe ? new RegExp(`\\s*,\\s*(?:and\\s+)?(?=(?:the\\s+)?(?:${nameAltRe})\\s+(?:is|are)\\s)|\\s*,\\s*(?:and\\s+)?(?=(?:the\\s+)?(?:${nameAltRe})\\s+(?:(?:at|in|on)\\s+the|top|bottom|upper|lower|center|centre|middle|on\\s+top|(?:goes\\s+)?to\\s+(?:the\\s+)?(?:${nameAltRe}))\\b|(?:the\\s+)?(?:${nameAltRe})\\s+(?:above|below|under|over|left\\s+of|right\\s+of|next\\s+to|near|beside)\\b)`, 'i') : null;
    if (given) {   // the units of another cut (see opts.units above): one clause per unit, the context carried as in the loop below
      for (const u of given) {
        const tail = original.slice(Math.max(u.c0, u.c1 - 1)), end = /[.!?;]/.exec(tail.replace(/^[\s,]+/, ''));
        const isQ = !!end && end[0] === '?';   // a question when the sentence the unit ends in ends with "?"
        let p = quoteOut(' ' + fixText(original.slice(u.c0, u.c1)).trim() + ' ').trim().replace(/[.!?;]+\s*$/, '');
        if (!p.trim()) continue;
        const pv = p.match(VERB_RE);
        if (pv) prevVerb = pv[1];
        else if (prevVerb && !isQ && ELLIPSIS && ELLIPSIS.test(p) && !/^\s*(?:the\s+)?\S+\s+(?:is|are|was|were|should|would|will|has|have)\b/i.test(p)) p = prevVerb + ' ' + p.replace(/^\s*(?:(?:and|then|also|plus|now)\s+)*/i, '');
        const n0 = F.nodes.length;
        clause(p, isQ);
        for (const n of F.nodes.slice(n0)) if (n.type !== 'mention') Object.defineProperty(n, 'span', { value: [u.c0, u.c1], enumerable: false, configurable: true });
      }
      return { nodes: F.nodes, notes: corrections.concat(F.notes), segments: F.segments, corrections };
    }
    for (const sen of sentences) {
      const isQ = /\?\s*$/.test(sen);
      const body = sen.replace(/[.!?;]+\s*$/, '');
      const parts = body.split(/\s*,?\s*\b(?:and then|then|after that|afterwards|finally)\b[\s,]*/i).flatMap(p => p.split(SPLIT_VERB)).flatMap(coordSplit).flatMap(p => FACT_LIST && !VERB_RE.test(p) ? p.split(FACT_LIST) : [p]).flatMap(p => CONNECT_ONLY && CONNECT_ONLY.test(p) && nameAltRe ? p.split(new RegExp(`\\s+and\\s+(?=(?:the\\s+)?(?:${nameAltRe})\\s+(?:goes|go|leads?|flows?|feeds?|sends?|files|points?|runs?|passes)\\b)`, 'i')) : [p]);
      for (let pi = 0; pi < parts.length; pi++) {
        let p = parts[pi];
        if (!p || !p.trim()) continue;
        const pv = p.match(VERB_RE);
        if (pv) prevVerb = pv[1];
        else if (prevVerb && !isQ && ELLIPSIS && ELLIPSIS.test(p) && !/^\s*(?:the\s+)?\S+\s+(?:is|are|was|were|should|would|will|has|have)\b/i.test(p)) { p = prevVerb + ' ' + p.replace(/^\s*(?:(?:and|then|also|plus|now)\s+)*/i, ''); parts[pi] = p; }
        if (pi + 1 < parts.length && !VERB_RE.test(p) && !/^\s*(undo|redo)\b/i.test(p) && !/\?/.test(p) && !(PLACE_ONLY && PLACE_ONLY.test(p)) && !(CONNECT_ONLY && CONNECT_ONLY.test(p)) && !(nameAltRe && new RegExp(`^\\s*(?:the\\s+)?(?:${nameAltRe})\\s+(?:is|are)\\s`, 'i').test(p))) { parts[pi + 1] = parts[pi + 1] + ' ' + p.replace(/^[\s,]+|[\s,]+$/g, ''); continue; }
        const cm = p.match(CREATE_START);
        if (cm) { const objs = p.split(OBJ_SPLIT); clause(objs[0], isQ); objs.slice(1).forEach(o => clause(cm[1] + ' ' + o, isQ)); }
        else clause(p, isQ);
      }
    }
    const pieces = F.segments.slice();   // the segmenter's pieces, before the chain merge below (rulesCut)
    // "connect A to B and B to C": consecutive connections that continue each other are one chain
    for (let i = F.nodes.length - 1; i > 0; i--) {
      const b = F.nodes[i], a = F.nodes.slice(0, i).reverse().find(n => n.type !== 'mention');
      const one = v => v != null && !Array.isArray(v) && !isRef(v) && typeof v === 'string';
      if (!a || a.type !== 'command' || b.type !== 'command' || a.args.action !== 'connect' || b.args.action !== 'connect') continue;
      const ka = Object.keys(a.args).filter(k => !['action', 'from', 'to', 'pairing'].includes(k)), kb = Object.keys(b.args).filter(k => !['action', 'from', 'to'].includes(k));
      if (!ka.length && !kb.length && b.args.pairing === 'chain' && Array.isArray(b.args.from) && one(a.args.from) && one(a.args.to) && !a.args.pairing && a.args.to === b.args.from[0]) {
        a.args = { action: 'connect', from: [a.args.from].concat(b.args.from), pairing: 'chain' }; F.nodes.splice(F.nodes.indexOf(b), 1); F.segments = F.segments.filter(sg => sg.id !== b.id); continue;
      }
      if (ka.length || kb.length || !one(b.args.from) || !one(b.args.to)) continue;
      const aList = a.args.pairing === 'chain' && Array.isArray(a.args.from) ? a.args.from : (one(a.args.from) && one(a.args.to) && !a.args.pairing ? [a.args.from, a.args.to] : null);
      if (!aList || aList[aList.length - 1] !== b.args.from) continue;
      a.args = { action: 'connect', from: aList.concat(b.args.to), pairing: 'chain' };
      F.nodes.splice(F.nodes.indexOf(b), 1); F.segments = F.segments.filter(sg => sg.id !== b.id);
    }
    return { nodes: F.nodes, notes: corrections.concat(F.notes), segments: F.segments, corrections, pieces };

    function clause(raw, isQ) {
      let t = ' ' + raw.trim().replace(/[,\s]+$/, '') + ' ';
      t = t.replace(/^\s*(?:(?:please|kindly|now|ok(?:ay)?|so|and|also|hey|next|can you|could you|would you|will you|i want you to|i'd like you to|i would like you to|let's|lets|go ahead and)\b[\s,]*)+/i, ' ');
      if (!t.trim()) return;
      const firstWord = (t.trim().match(/^[A-Za-z']+/) || [''])[0].toLowerCase();
      const secondWord = (t.trim().split(/\s+/)[1] || '').toLowerCase();
      const C = { t, args: {}, marks: [] };
      const take = (re, fn) => { const m = C.t.match(re); if (!m) return null; C.t = C.t.slice(0, m.index) + ' ' + C.t.slice(m.index + m[0].length) + ' '; if (fn) fn(m); return m; };
      const mark = v => { C.marks.push(v); return ' ⟦' + (C.marks.length - 1) + '⟧ '; };
      const refsIn = s => [...s.matchAll(/⟦(\d+)⟧/g)].map(m => +m[1]);
      const markVals = idx => { const vs = idx.map(i => C.marks[i]); const out = [], seen = new Set(); vs.forEach(v => [].concat(v).forEach(x => { const k = JSON.stringify(x); if (!seen.has(k)) { seen.add(k); out.push(x); } })); return out.length === 1 ? out[0] : out; };

      // ---- what kind of wire is this? ----
      let kind, action = null;
      const isKnown = w => nameIndex.has(w.toLowerCase());
      const firstTok = (t.trim().match(/^[A-Za-z0-9_][\w-]*/) || [''])[0];
      if (/^\s*(undo|redo|revert|take\s+(?:that|it)\s+back|do\s+that\s+again)\b/i.test(t)) { kind = 'command'; action = /^\s*(redo|do\s+that)/i.test(t) ? 'redo' : 'undo'; }
      else if (/\b(forget|clear|remove|delete|drop|reset|cancel)\b.*\b(rules?|defaults?)\b/i.test(t)) { kind = 'command'; action = 'forget'; }
      else if (/^\s*(?:from now on|by default|in (?:the )?future|henceforth|going forward|always)\b/i.test(t) || /\bnew\s+(?:\w+\s+){0,2}\w+\s+(?:should|must|will)\s+(?:always\s+)?be\b/i.test(t)) kind = 'rule';
      else if (/^(how|what|what's|whats|which|where|who|is|are|does|do|did|has|have|list|show|describe|summarize|summarise|count|tell|any|can|could|whose)$/.test(firstWord) && !(firstWord === 'can' && !/^(i|we)$/.test(secondWord))) kind = 'question';
      else if (!isQ && (isKnown(firstTok) || /^(it|they)$/i.test(firstTok)) && /^(is|are)$/.test(secondWord) && !/^\s*\S+\s+(?:is|are)\s+there\b/i.test(t)) kind = 'fact';
      else if (isQ && !VERB_RE.test(t)) kind = 'question';
      else kind = 'command';

      if (kind === 'command' && !action) {
        const vm = t.match(VERB_RE);
        if (vm) {
          const verb = vm[1].toLowerCase(); action = ACTION.get(verb);
          const after = t.slice(vm.index + vm[0].length).trim().toLowerCase();
          const nextW = (after.match(/^[a-z0-9']+/) || [''])[0];
          const articleNext = /^(a|an|another|new|some|\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/.test(nextW);
          const rawAfter = t.slice(vm.index + vm[0].length), rawNext = (rawAfter.trim().match(/^[A-Za-z0-9_]+/) || [''])[0];
          const nameNotArticle = rawNext === 'A' && isKnown('A') && !ARTICLE_AHEAD.test(rawAfter.trim().slice(1));
          if (['make', 'put', 'place'].includes(verb)) {
            if (verb === 'put' && /\btogether\b/i.test(after)) action = 'group';   /* "put Start and Process together (as Pipeline)" */
            else if (/\b(copies|copy|duplicates?|clones?)\b/i.test(after)) action = 'duplicate';
            else if (articleNext && !nameNotArticle) action = 'create';
            else if (verb === 'make') action = /\b(bigger|larger|smaller|twice|double|half|times)\b/i.test(after) ? 'resize' : 'set';
            else action = 'move';
          }
          if (['create', 'set'].includes(action) && new RegExp(`\\b(?:draw|add|create|make|put|insert|place)\\s+(?:an?\\s+|another\\s+|the\\s+)?(?:\\w+\\s+){0,2}?(?:${EDGE_WORDS})\\b`, 'i').test(t)) action = 'connect';
          if (action === 'create' && /\badd\s+(?:a\s+|the\s+)?(?:label|text|caption|title)\b/i.test(t)) action = 'label';
          if (action === 'delete' && new RegExp(`\\b(?:${EDGE_WORDS})\\b`, 'i').test(t)) action = 'disconnect';
          if (action === 'delete' && /\b(clear|wipe|reset)\b/i.test(verb) && !/⟦/.test(t)) { /* clear the canvas */ }
          if (verb === 'give' && !/\b(border|outline|stroke|label|colou?r)\b/i.test(after)) action = 'set';
          if (action === 'swap' && /\b(?:shape|form)\b/i.test(after) && !/\bplaces?\b/i.test(after)) action = 'set';   /* "swap Box's shape for a circle": a change of kind, not an exchange of positions */
          if (groupAltRe) {   /* membership of an existing group: "add Done to Pipeline" -> group; "take Done out of Pipeline" -> ungroup */
            const into = new RegExp(`(?<!\\b(?:next|close|closer)\\s)\\b(?:to|into|in)\\s+(?:the\\s+)?(?:group\\s+)?(${groupAltRe})(?:\\s+group)?\\s*$`, 'i'), outOf = new RegExp(`\\b(?:from|out\\s+of)\\s+(?:the\\s+)?(?:group\\s+)?(${groupAltRe})(?:\\s+group)?\\s*$`, 'i');
            if (['create', 'move', 'put', 'set'].includes(action) && !articleNext && into.test(t)) { action = 'group'; C.args.name = nameIndex.get(t.match(into)[1].toLowerCase()); }
            else if (['delete', 'move', 'set'].includes(action) && outOf.test(t)) { action = 'ungroup'; C.t = C.t.replace(outOf, ' '); }
          }
        } else if (/^\s*(?:a|an|another|\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s/i.test(t)) action = 'create';
        else if (!isQ && isKnown(firstTok) && new RegExp(`^\\s*\\S+\\s+(?:should|must|needs\\s+to|ought\\s+to)\\s+(?:be|become)\\s+(?:(?:an?|the)\\s+)?(?:(?:${colorRe}|${sizeRe})\\s+){0,3}(?:${nounRe})\\b`, 'i').test(t) && !/^\\s*\\S+\\s+(?:should|must)\\s+be\\s+(?:an?\\s+)?(?:${colorRe})\\s*$/i.test(t)) action = 'set';   /* "Box should be a diamond instead" */
        else if (CONNECT_ONLY && CONNECT_ONLY.test(t)) action = 'connect';   /* "Ingress to Pod1 and Pod2", "Syn goes to SynAck" */
        else if (PLACE_ONLY && PLACE_ONLY.test(t)) action = 'move';   /* "Kitchen at the left", "Pit just below the Stage": a placement */
        else if (/^\s*start over\b/i.test(t)) action = 'delete';
        else if (/^\s*(?:split|break)\b.*\b(?:up|apart)\b/i.test(t)) action = 'ungroup';
        else if (groupAltRe && new RegExp(`\\b(?:out\\s+of|from)\\s+(?:the\\s+)?(?:group\\s+)?(?:${groupAltRe})(?:\\s+group)?\\s*$`, 'i').test(t)) {   /* "take Y out of Pair" */
          action = 'ungroup'; C.t = C.t.replace(new RegExp(`\\b(?:out\\s+of|from)\\s+(?:the\\s+)?(?:group\\s+)?(?:${groupAltRe})(?:\\s+group)?\\s*$`, 'i'), ' ');
        }   /* "split Pipeline up", "break the group apart" */
        else { F.notes.push(`I couldn't find an action in "${raw.trim()}".`); F.segments.push({ src: raw.trim().replace(/⟪(\d+)⟫/g, (m, n) => '"' + quotes[+n] + '"').replace(/\s+/g, ' '), id: null }); return; }
      }
      const isCmd = kind === 'command';

      // ---- rename's new name, declared names, labels ----
      if (action === 'rename') take(/\b(?:to|as|into)\s+(⟪\d+⟫|[A-Za-z_][\w-]*)\s*$/i, m => C.args.name = unq(m[1]));
      if (action === 'group') { take(/\btogether\b/i); if (C.args.name == null) take(/\b(?:as|into)\s+(?:(?:a|an|one|the|new|single)\s+)*(?:group\s+)?(?:(?:called|named)\s+)?(⟪\d+⟫|[A-Za-z_][\w-]*)/i, m => { if (!/^(?:group|one|a)$/i.test(m[1])) C.args.name = unq(m[1]); }); }
      take(/\b(?:named|called|with\s+the\s+name|name\s+it)\s+(⟪\d+⟫|[A-Za-z_][\w-]*)/i, m => C.args.name = unq(m[1]));
      take(/\b(?:labell?ed|label(?:\s+it)?|with\s+(?:the\s+|a\s+)?(?:text|label|caption|title|word)|saying|that\s+says|which\s+says|titled|reading|text)\s+(⟪\d+⟫)/i, m => C.args.label = unq(m[1]));
      if (C.args.label == null && ['create', 'connect', 'label', 'set'].includes(action)) take(/⟪(\d+)⟫/, m => C.args.label = quotes[+m[1]]);
      if (C.args.label == null && ['create', 'connect'].includes(action)) take(/\blabell?ed\s+([A-Za-z0-9_][\w-]*)/i, m => C.args.label = m[1]);
      if (kind === 'question' || kind === 'fact') take(/⟪(\d+)⟫/, m => C.args.label = quotes[+m[1]]);

      // ---- coordinates, distances, scale, outline ----
      take(/\b(?:at|to)\s+(?:position\s+|point\s+|coordinates?\s+)?\(?\s*(\d+)\s*,\s*(\d+)\s*\)?/i, m => C.args.at = [+m[1], +m[2]]);
      if (!C.args.at) take(/\bx\s*=?\s*(\d+)\s*,?\s*(?:and\s+)?y\s*=?\s*(\d+)/i, m => C.args.at = [+m[1], +m[2]]);
      take(/\bby\s+(\d+)\s*(?:px|pixels?|units?|points?)?\b/i, m => C.args.distance = +m[1]) || take(/\b(\d+)\s*(?:px|pixels?|units?|points?)\b/i, m => C.args.distance = +m[1]);
      if (['set', 'resize'].includes(action) || kind === 'fact') {
        take(/\btwice\s+as\s+(?:big|large)\b|\bdouble(?:\s+(?:the|its)\s+size)?\b/i, () => C.args.scale = 2) ||
        take(new RegExp(`\\b(${NUMRE}|\\d+\\.\\d+)\\s+times\\s+(?:as\\s+)?(?:bigger|larger|big|large)\\b`, 'i'), m => C.args.scale = +m[1] || toNum(m[1])) ||
        take(/\bhalf\s+(?:the\s+|its\s+)?(?:size|as\s+big)\b/i, () => C.args.scale = 0.5) ||
        take(/\b(?:much|a\s+lot|way)\s+(?:bigger|larger)\b/i, () => C.args.scale = 2) ||
        take(/\b(?:much|a\s+lot|way)\s+smaller\b/i, () => C.args.scale = 0.5) ||
        take(/\b(?:a\s+(?:bit|little)\s+)?(?:bigger|larger)\b/i, () => C.args.scale = 1.5) ||
        take(/\b(?:a\s+(?:bit|little)\s+)?smaller\b/i, () => C.args.scale = 0.67);
        if (action === 'resize' && C.args.scale == null && /\bshrink\b/i.test(C.t)) C.args.scale = 0.67;
      }
      take(new RegExp(`\\b(?:with\\s+(?:a|an)\\s+|an?\\s+)?(${colorRe})\\s+(?:border|outline|stroke)s?\\b`, 'i'), m => C.args.outline = COLOR.get(m[1].toLowerCase())) ||
      take(new RegExp(`\\b(?:border|outline|stroke)\\s+(?:colou?r\\s+)?(?:to\\s+|of\\s+|in\\s+)?(${colorRe})\\b`, 'i'), m => C.args.outline = COLOR.get(m[1].toLowerCase())) ||
      take(/\b(?:no|without\s+(?:a|an|the)?)\s*(?:border|outline)s?\b|\bremove\s+(?:the\s+|its\s+)?(?:border|outline)\b/i, () => C.args.outline = 'none');

      // ---- a change of kind: "change the shape of Box to a star", "turn Box into a big red circle", "make all the squares circles" ----
      if (action === 'set' && isCmd) {
        C.t = C.t.replace(/\b(?:the\s+)?(?:shape|form)\s+of\b/gi, ' ').replace(/[\u2019']s\s+(?:shape|form)\b/gi, ' ');
        const newKind = (m, mods, noun) => { if (generic.has(noun.toLowerCase())) return false; C.args.shape = SHAPE.get(noun.toLowerCase()); C.t += ' ' + (mods || ''); return true; };
        take(new RegExp(`\\b(?:into|to|as|for|be|become|becomes)\\s+(?:(?:an?|the)\\s+)?((?:(?:${colorRe}|${sizeRe})\\s+){0,3})(${nounRe})\\b(?:\\s+instead)?`, 'i'), m => { if (!newKind(m, m[1], m[2])) C.t += ' ' + m[0]; }) ||
        take(new RegExp(`(?<=\\b(?:${nounRe})\\s+)((?:(?:${colorRe}|${sizeRe})\\s+){0,3})(${nounRe})\\s*$`, 'i'), m => { if (!newKind(m, m[1], m[2])) C.t += ' ' + m[0]; });
      }
      // ---- descriptions become mention wires ----
      const mention = (quant, mods, noun, rec) => {
        const a = {};
        if (rec) a.recency = /^(first|oldest|earliest)/i.test(rec) ? 'oldest' : 'newest';
        if (quant) a.quantifier = 'all';
        const sh = noun ? SHAPE.get(noun.toLowerCase()) : null; if (sh && sh !== 'any') a.shape = sh;
        for (const w of (mods || '').toLowerCase().split(/\s+/).filter(Boolean)) { if (COLOR.has(w)) a.color = COLOR.get(w); else if (SIZE.has(w)) a.size = SIZE.get(w); }
        const id = 'm' + (++F.m); F.nodes.push({ id, type: 'mention', args: a }); return ref(id);
      };
      if (kind !== 'rule' && lastRef != null) C.t = C.t.replace(new RegExp(`\\b(?:this|that)\\s+(?:${MOD})(?:${nounRe})\\b`, 'gi'), m => pluralNoun(m.split(/\s+/).pop().toLowerCase()) ? m : mark(lastRef));
      if (kind !== 'rule') {
        C.t = C.t.replace(new RegExp(`\\b(the|all(?:\\s+of)?(?:\\s+the)?|every|each)\\s+((?:newest|new|last|latest|most\\s+recent|first|oldest|earliest)\\s+)?(${MOD})(${nounRe})\\b`, 'gi'), (m, art, rec, mods, noun) => {
          const all = !rec && (/^(all|every|each)/i.test(art) || pluralNoun(noun.toLowerCase()));
          const r = mention(all, mods, noun, rec && rec.trim()); if (!all) lastRef = r; else lastGroup = r; return mark(r);
        });
        if (isCmd && action !== 'create') {
          C.t = C.t.replace(/\beverything\b|\ball\s+(?:the\s+)?shapes\b|\ball(?=\s*$)/gi, () => mark(mention(true, '', null)));
          C.t = C.t.replace(new RegExp(`(^|\\s)(${MOD})(${nounRe})\\b`, 'gi'), (m, pre, mods, noun) => pluralNoun(noun.toLowerCase()) && !generic.has(noun.toLowerCase()) || /^(shapes|nodes)$/i.test(noun) ? pre + mark(mention(true, mods, noun)) : m);
        } else if (kind === 'question') C.t = C.t.replace(/\beverything\b/gi, () => mark(mention(true, '', null)));
      }

      // ---- names and pronouns become references ----
      C.t = C.t.replace(new RegExp(`${M}\\s+(?:that|which|who)\\s+(?:are|is)\\s+not\\s+(${colorRe})\\b`, 'gi'), (m, i, col) => { const r = C.marks[+i]; const node = isRef(r) && F.nodes.find(n => n.id === r.ref && n.type === 'mention'); if (node) node.args.notColor = COLOR.get(col.toLowerCase()); return ` ⟦${i}⟧ `; });
      C.t = C.t.replace(/\b(?:this|that|the\s+same)\s+one\b/gi, m => lastRef ? mark(lastRef) : m);
      C.t = C.t.replace(/[A-Za-z_][\w-]*/g, (w, off, whole) => {
        const lw = w.toLowerCase();
        if (/^(it|its)$/.test(lw)) { if (lastRef != null) return mark(lastRef); F.notes.push(`I couldn't tell what "${w}" refers to.`); return w; }
        if (/^(them|they|both|those|these)$/.test(lw)) { if (lastGroup != null) return mark(lastGroup); return w; }
        if (!nameIndex.has(lw) || w === 'a' || w === 'I') return w;
        if (w === 'A' && ARTICLE_AHEAD.test(whole.slice(off + 1))) return w;
        return mark(nameIndex.get(lw));
      });

      C.t = C.t.replace(/\bthe\s+(?=⟦)/gi, ' ');
      { const toks = C.t.replace(/⟦\d+⟧|⟪\d+⟫/g, ' ').trim().split(/\s+/); toks.slice(1).forEach(w => { const c = w.replace(/[^\w-]/g, ''); if (c && /[A-Z]|\d/.test(c) && /^[A-Za-z_]/.test(c) && !COLOR.has(c.toLowerCase()) && !SHAPE.has(c.toLowerCase()) && !SIZE.has(c.toLowerCase()) && c !== 'A' && c !== 'I') F.notes.push(`"${c}" is not a shape I know.`); }); }
      // ---- question type, decided on the marked text ----
      let ask = null;
      if (kind === 'question') {
        const T = C.t.toLowerCase(), nref = refsIn(T).length;
        const groupRefs = refsIn(T).filter(i => typeof C.marks[i] === 'string' && groupSet.has(C.marks[i].toLowerCase()));
        if (/\b(rules?|defaults?)\b/.test(T)) ask = 'rules';
        else if (nref && /\b(?:which|what)\s+groups?\b|\bbelongs?\s+to\b|\bpart\s+of\s+(?:a|any|which|what)\b|\bin\s+(?:a|any)\s+group\b|\bgroup\s+(?:is|does)\b/.test(T)) ask = 'groupOf';   /* "which group is Check in?" */
        else if (groupRefs.length && (/\b(?:in|inside|of)\s+⟦\d+⟧(?:\s+group)?\s*$/.test(T) || /\bcontains?\b|\bmembers?\b|\bholds?\b/.test(T))) ask = 'members';   /* "what is in Pipeline?" */
        else if (/\b(cycles?|loops?|circular)\b/.test(T)) ask = 'cycle';
        else if (/\b(path|route|reach(?:able|es|ed)?|get\s+from|get\s+to|go\s+from|leads?\s+to|flows?\s+to|indirectly|downstream|comes?\s+after)\b/.test(T)) ask = nref >= 2 ? 'path' : 'reachable';
        else if (/\bhow\s+many\s+(?:connections|links|edges|arrows|neighbou?rs|lines)\b/.test(T) && nref === 1 && /\b(does|has|have|do)\b/.test(T)) ask = 'degree';
        else if (/\b(most|fewest|least)\s+(?:connections|links|edges|arrows|connected|neighbou?rs)\b/.test(T)) { ask = 'extreme'; C.args.superlative = /\bmost\b/.test(T) ? 'mostConnected' : 'leastConnected'; }
        else if (/\bhow\s+many\b|\bcount\b|\bnumber\s+of\b/.test(T)) ask = 'count';
        else if (/\b(closest|nearest|furthest|farthest)\b/.test(T)) { ask = 'nearest'; C.args.superlative = /\b(furthest|farthest)\b/.test(T) ? 'farthest' : 'closest'; }
        else if (/\b(biggest|largest|smallest|tiniest|leftmost|rightmost|topmost|highest|lowest|bottommost)\b/.test(T)) { ask = 'extreme'; const w = T.match(/\b(biggest|largest|smallest|tiniest|leftmost|rightmost|topmost|highest|lowest|bottommost)\b/)[1]; C.args.superlative = { largest: 'biggest', tiniest: 'smallest', highest: 'topmost', lowest: 'bottommost' }[w] || w; }
        else if (/^\s*(?:is|are)\s+there\b|^\s*(?:are|is)\s+any\b|^\s*any\b/.test(T)) ask = 'exists';
        else if (/\b(?:connected|linked|attached|joined)\b|\bneighbou?rs?\b|\bconnections?\b|\bconnects?\s+to\b|\bpoints?\s+to\b|\blinks?\s+to\b/.test(T)) ask = nref >= 2 ? 'connected' : 'neighbors';
        else if (/\b(bigger|larger|smaller)\s+than\b/.test(T)) ask = 'check';
        else if (/\bwhere\b/.test(T) && nref) { ask = 'property'; C.args.property = 'position'; }
        else if (/\bhow\s+(?:big|large|small)\b/.test(T) && nref) { ask = 'property'; C.args.property = 'size'; }
        else if (/\bwhat\b.*\b(colou?r|size|shape|label|text|position|location|outline|border)\b/.test(T) && nref) { ask = 'property'; const w = T.match(/\b(colou?r|size|shape|label|text|position|location|outline|border)\b/)[1]; C.args.property = { colour: 'color', text: 'label', location: 'position', border: 'outline' }[w] || w; }
        else if (new RegExp(`\\bwhat\\s+does\\s+${M}\\s+say\\b`).test(T)) { ask = 'property'; C.args.property = 'label'; }
        else if (/^\s*(?:is|are)\s+there\b|^\s*any\b/.test(T)) ask = 'exists';
        else if (/^\s*(is|are|does|do|has)\b/.test(T)) ask = 'check';
        else if (/\b(describe|summari[sz]e|overview|tell\s+me\s+about)\b|\bwhat'?s\s+on\b|\bwhat\s+is\s+on\b/.test(T) || new RegExp(`^\\s*what(?:'s|\\s+is)\\s+${M}\\s*$`).test(T)) ask = 'describe';
        else if (/\b(list|show|which|what)\b/.test(T)) ask = 'list';
        else ask = 'describe';
        C.args.ask = ask;
        if (['count', 'list'].includes(ask) && new RegExp(`\\b(?:${EDGE_WORDS})\\b`).test(T) && !/\bconnected\b/.test(T)) C.args.kind = 'edge';
        if (['count', 'list', 'exists'].includes(ask) && !nref && /\bgroups?\b/.test(T)) C.args.kind = 'group';   /* "what groups are there?" */
      }

      // ---- roles that use prepositions ----
      const listOf = `${M}(?:\\s*(?:,|and|&)\\s*${M})*`;
      const grab = re => { let v = null; take(re, m => { v = markVals(refsIn(m[0])); }); return v; };
      if (action === 'connect' || action === 'disconnect' || ask === 'path') {
        C.connRefs = refsIn(C.t);   /* every shape of the clause, in order: the list a pairing connects */
        if (action === 'disconnect') { const mm = C.t.match(new RegExp(`${M}\\s+from\\s+${M}`)); if (mm) { C.args.from = markVals([+mm[1]]); C.args.to = markVals([+mm[2]]); C.t = C.t.replace(mm[0], ' '); } }
        const f = C.args.from != null ? null : grab(new RegExp(`\\bfrom\\s+${M}`, 'i')); if (f != null) C.args.from = f;
        const to = grab(new RegExp(`\\b(?:to|with|and)\\s+${listOf}`, 'i')); if (to != null) C.args.to = to;
        const rest = refsIn(C.t);
        if (C.args.from == null && rest.length) C.args.from = markVals([rest.shift()]);
        if (C.args.to == null && rest.length) C.args.to = markVals(rest.splice(0));
        C.t = C.t.replace(/⟦\d+⟧/g, ' ');
      } else if (ask === 'reachable') {
        const f = grab(new RegExp(`\\bfrom\\s+${M}`, 'i')); const rest = refsIn(C.t);
        C.args.from = f != null ? f : rest.length ? markVals([rest[0]]) : undefined;
      } else {
        if (['create', 'fact'].includes(action || kind) || ['count', 'list', 'exists'].includes(ask)) {
          const ln = grab(new RegExp(`\\b(?:connected|linked|attached|joined|wired|hooked)\\s+(?:up\\s+)?(?:to|with)\\s+${listOf}`, 'i')); if (ln != null) C.args.linked = ln;
        }
        if (ask === 'check') take(new RegExp(`\\b(bigger|larger|smaller)\\s+than\\s+${M}`, 'i'), m => { C.args.comparison = /smaller/i.test(m[1]) ? 'smaller' : 'bigger'; C.args.anchor = markVals([+m[2]]); });
        if (ask === 'nearest') { const anc = grab(new RegExp(`\\b(?:to|from)\\s+${M}`, 'i')); if (anc != null) C.args.anchor = anc; }
        if (!['rename', 'label', 'swap', 'undo', 'redo'].includes(action)) {
          const POS = [
            ['between', `\\bbetween\\s+${M}\\s+and\\s+${M}`],
            ['leftOf', `\\b(?:to\\s+the\\s+|on\\s+the\\s+|at\\s+the\\s+)?left\\s+(?:side\\s+)?of\\s+${listOf}`],
            ['rightOf', `\\b(?:to\\s+the\\s+|on\\s+the\\s+|at\\s+the\\s+)?right\\s+(?:side\\s+)?of\\s+${listOf}`],
            ['above', `\\b(?:above|over|on\\s+top\\s+of)\\s+${listOf}`],
            ['below', `\\b(?:below|under|underneath|beneath)\\s+${listOf}`],
            ['near', `\\b(?:next\\s+to|near|beside|close\\s+to|by|alongside|around)\\s+${listOf}`]
          ];
          // a position may combine up to two relations ("below A but above B") and a canvas region ("top left, right of Y"): the first
          // relation in the text is position/anchor, the second position2/anchor2, the region `region`
          const grabAt = re => { let v = null, at = -1; take(re, m => { v = markVals(refsIn(m[0])); at = m.index; }); return [v, at]; };
          let at1 = -1;
          for (const [p, re] of POS) { const [v, at] = grabAt(new RegExp(re, 'i')); if (v != null) { C.args.position = p; C.args.anchor = v; at1 = at; break; } }
          if (C.args.position) for (const [p, re] of POS) {
            const [v, at] = grabAt(new RegExp(re, 'i')); if (v == null) continue;
            if (at < at1) { C.args.position2 = C.args.position; C.args.anchor2 = C.args.anchor; C.args.position = p; C.args.anchor = v; }
            else { C.args.position2 = p; C.args.anchor2 = v; }
            break;
          }
          if (C.args.position) {   /* a canvas region besides a relation: "in the top left", "near the top", bare "top left" */
            const PRE = '(?:in|at|to|into|on|near|towards?|close\\s+to|along)', RG = [['topLeft', `\\b(?:${PRE}\\s+)?(?:the\\s+)?(?:top|upper)[\\s-]+left(?:\\s+corner)?\\b`], ['topRight', `\\b(?:${PRE}\\s+)?(?:the\\s+)?(?:top|upper)[\\s-]+right(?:\\s+corner)?\\b`], ['bottomLeft', `\\b(?:${PRE}\\s+)?(?:the\\s+)?(?:bottom|lower)[\\s-]+left(?:\\s+corner)?\\b`], ['bottomRight', `\\b(?:${PRE}\\s+)?(?:the\\s+)?(?:bottom|lower)[\\s-]+right(?:\\s+corner)?\\b`],
              ['center', `\\b(?:${PRE}\\s+)?the\\s+(?:center|centre|middle)(?:\\s+of\\s+the\\s+(?:canvas|page|screen|diagram))?\\b`], ['top', `\\b${PRE}\\s+the\\s+top(?:\\s+(?:edge|side|row|half|part))?\\b`], ['bottom', `\\b${PRE}\\s+the\\s+bottom(?:\\s+(?:edge|side|row|half|part))?\\b`], ['left', `\\b${PRE}\\s+the\\s+left(?:\\s+(?:edge|side|half|part))?\\b`], ['right', `\\b${PRE}\\s+the\\s+right(?:\\s+(?:edge|side|half|part))?\\b`]];
            for (const [p, re] of RG) if (take(new RegExp(re, 'i'))) { C.args.region = p; break; }
          }
          if (!C.args.position && !(action === 'move' && /\bby\s+\d|\b(?:up|down)\b|\bto\s+the\s+(?:left|right)\s*$/i.test(C.t))) {
            const SP = [['topLeft', /\b(?:in|at|to|into|on)?\s*the\s+(?:top|upper)[\s-]+left(?:\s+corner)?\b/i], ['topRight', /\b(?:in|at|to|into|on)?\s*the\s+(?:top|upper)[\s-]+right(?:\s+corner)?\b/i], ['bottomLeft', /\b(?:in|at|to|into|on)?\s*the\s+(?:bottom|lower)[\s-]+left(?:\s+corner)?\b/i], ['bottomRight', /\b(?:in|at|to|into|on)?\s*the\s+(?:bottom|lower)[\s-]+right(?:\s+corner)?\b/i], ['center', /\b(?:in|at|to|into)?\s*the\s+(?:center|centre|middle)(?:\s+of\s+the\s+(?:canvas|page|screen|diagram))?\b/i], ['top', /\b(?:at|to|on|along|in)\s+the\s+top(?:\s+(?:edge|side|row))?\b/i], ['bottom', /\b(?:at|to|on|along|in)\s+the\s+bottom(?:\s+(?:edge|side|row))?\b/i], ['left', /\b(?:at|on|along|in)\s+the\s+left(?:\s+(?:edge|side))?\b/i], ['right', /\b(?:at|on|along|in)\s+the\s+right(?:\s+(?:edge|side))?\b/i]];
            for (const [p, re] of SP) if (take(re)) { C.args.position = p; break; }
            if (!C.args.position && (action === 'move' || action === 'create')) {   /* without an article: "Cabin1 top left", "Lake bottom", "Stage on top" */
              const BARE = [['topLeft', /\b(?:top|upper)[\s-]+left\b/i], ['topRight', /\b(?:top|upper)[\s-]+right\b/i], ['bottomLeft', /\b(?:bottom|lower)[\s-]+left\b/i], ['bottomRight', /\b(?:bottom|lower)[\s-]+right\b/i], ['top', /\b(?:on\s+)?top\s*$/i], ['bottom', /\b(?:at\s+)?bottom\s*$/i], ['center', /\b(?:center|centre|middle)\s*$/i]];
              for (const [p, re] of BARE) if (take(re)) { C.args.position = p; break; }
            }
          }
          if (!C.args.position && action === 'move') take(/\b(?:to\s+the\s+)?(left|right|up|down|upwards|downwards)\b(?!\s+(?:of|side|corner))/i, m => C.args.direction = m[1].toLowerCase().replace('wards', ''));
        }
        if (ask === 'connected') { const r = refsIn(C.t); if (r.length >= 2) { C.args.target = markVals([r[0]]); C.args.anchor = markVals([r[1]]); take(new RegExp(M)); take(new RegExp(M)); } }
      }

      // ---- counts ----
      if (action === 'create' || action === 'duplicate' || action === 'undo' || action === 'redo') {
        take(new RegExp(`\\b(${NUMRE})\\s+(?:(?:[a-z-]+)\\s+){0,3}?(?:${nounRe}|copies|copy|duplicates?|clones?|times)\\b`, 'i'), m => { const n = toNum(m[1]); if (n > 1) C.args.count = n; C.t += ' ' + m[0].replace(m[1], ' '); });
        if (/\btwice\b/i.test(C.t) && !C.args.count) C.args.count = 2;
        if (/\ba\s+(?:couple|pair)\s+of\b/i.test(C.t) && !C.args.count) C.args.count = 2;
      }

      take(new RegExp(`\\b(?:(?:that|which)\\s+)?(?:are|is)\\s+not\\s+(${colorRe})\\b|\\bnon-?(${colorRe})\\b|\\bnot\\s+(${colorRe})\\b`, 'i'), m => { C.args.notColor = COLOR.get((m[1] || m[2] || m[3]).toLowerCase()); });
      // ---- enum answers from the remaining words ----
      const rest = C.t.toLowerCase().replace(/⟦\d+⟧|⟪\d+⟫/g, ' ');
      const words = rest.split(/[^a-z0-9'-]+/).filter(w => w && !STOP.has(w));
      const firstOf = (lex, skip) => { for (const w of words) if (lex.has(w) && !(skip && skip(lex.get(w)))) return lex.get(w); return null; };
      const sh = firstOf(SHAPE, v => v === 'any');
      if (sh) {
        const cues = [...SHAPE.entries()].filter(([, v]) => v === sh).map(([k]) => k);
        const asNewKind = new RegExp(`\\b(?:a|an|into|to\\s+an?)\\s+(?:(?:${colorRe}|${sizeRe})\\s+){0,2}(?:${alt(cues)})\\b`, 'i').test(C.t);
        if (!(['set', 'resize'].includes(action) && !asNewKind)) C.args.shape = sh;
      }
      const co = firstOf(COLOR); if (co) C.args.color = co;
      const sz = firstOf(SIZE); if (sz && !C.args.superlative) C.args.size = sz;
      if (action === 'connect') {
        if (/\bdashed\b|\bdash\b/.test(rest)) C.args.style = 'dashed'; else if (/\bdotted\b/.test(rest)) C.args.style = 'dotted';
        if (/\b(two-way|two\s+way|bidirectional|both\s+ways|double-headed|two\s+headed)\b/.test(rest)) C.args.arrow = 'both';
        else if (/\b(line|lines|undirected|plain|without\s+(?:an?\s+)?arrows?)\b/.test(rest)) C.args.arrow = 'none';
      }
      if (action === 'disconnect' && !C.args.from && /\b(all|every|everything)\b/.test(rest)) C.args.quantifier = 'all';
      if (action === 'connect') { if (/\b(in\s+a\s+chain|one\s+after\s+(?:the\s+)?other|in\s+sequence|in\s+order)\b/.test(rest)) C.args.pairing = 'chain'; else if (/\bto\s+the\s+next(?:\s+one)?\b/.test(rest)) C.args.pairing = 'next'; else if (/\b(?:all\s+to\s+each\s+other|every\s+pair|to\s+each\s+other)\b/.test(rest)) C.args.pairing = 'all';
        if (C.args.pairing && C.connRefs && C.connRefs.length > 1) { C.args.from = markVals(C.connRefs); delete C.args.to; } }
      if (action === 'distribute') C.args.axis = /\b(vertical|vertically|column)\b/.test(rest) ? 'vertical' : 'horizontal';
      if (action === 'align') C.args.axis = /\b(vertical|vertically|column)\b/.test(rest) ? 'vertical' : 'horizontal';
      if (action === 'arrange') { const lay = rest.match(/\b(row|line|column|stack|grid|circle|ring|tidy)\b/); if (lay) C.args.layout = { line: 'row', stack: 'column', ring: 'circle', tidy: 'grid' }[lay[1]] || lay[1]; else if (/\bvertical/.test(rest)) C.args.layout = 'column'; else if (/\bhorizontal/.test(rest)) C.args.layout = 'row'; delete C.args.shape; }
      if (ask === 'property') { delete C.args.size; delete C.args.color; delete C.args.shape; }
      if (action === 'undo' || action === 'redo') { for (const k of Object.keys(C.args)) if (k !== 'count') delete C.args[k]; }
      if (action === 'resize' && C.args.scale == null && !C.args.size && /\b(shrink)\b/.test(words.join(' '))) C.args.scale = 0.67;

      // ---- whatever references are left are the targets ----
      const left = refsIn(C.t);
      if (left.length) {
        if (action === 'label' && C.args.label == null) { const m = C.t.match(new RegExp(`${M}\\s+(?:as\\s+|with\\s+)?([A-Za-z0-9_][\\w-]*)`)); if (m) C.args.label = m[2]; }
        if (action === 'rename' && C.args.name == null && left.length >= 2) { C.args.name = markVals([left.pop()]); }
        if (action === 'rename' && C.args.name == null) { const m = C.t.match(new RegExp(`${M}\\s+([A-Za-z_][\\w-]*)\\s*$`)); if (m) C.args.name = m[2]; }
        if (ask === 'nearest' && C.args.anchor == null) C.args.anchor = markVals([left.shift()]);
        if (left.length) C.args.target = markVals(left);
      }
      if (action === 'delete' && C.args.target == null && /\b(clear|wipe|reset|everything|start over|canvas|diagram)\b/i.test(raw)) C.args.target = mention(true, '', null);
      if (action === 'arrange' && C.args.target != null && C.args.layout == null && /\bgrid|tidy\b/i.test(raw)) C.args.layout = 'grid';

      // ---- build the wire ----
      const id = (kind === 'rule' ? 'r' : 's') + (++F.s);
      const args = {};
      if (action) args.action = action;
      Object.assign(args, C.args);
      if (kind === 'rule') { delete args.target; delete args.name; delete args.label; }
      if (kind === 'question' && ['count', 'list', 'exists', 'extreme'].includes(ask) && args.target != null && !Array.isArray(args.target) && isRef(args.target)) {
        const mi = F.nodes.findIndex(n => n.id === args.target.ref && n.type === 'mention');
        if (mi >= 0) { const m = F.nodes[mi]; for (const k of ['shape', 'color', 'size']) if (m.args[k] != null && args[k] == null) args[k] = m.args[k]; delete args.target; F.nodes.splice(mi, 1); }
      }
      const node = { id, type: kind, args };
      Object.defineProperty(node, 'src', { value: raw.trim().replace(/⟪(\d+)⟫/g, (m, n) => '"' + quotes[+n] + '"').replace(/\s+/g, ' '), enumerable: false });
      F.nodes.push(node); F.segments.push({ src: node.src, id });
      if (action === 'create' && args.name != null && !args.count) nameIndex.set(String(args.name).toLowerCase(), ref(id));
      if (action === 'rename' && args.name != null) nameIndex.set(String(args.name).toLowerCase(), String(args.name));
      if (['create', 'duplicate'].includes(action)) { lastRef = ref(id); lastGroup = ref(id); }
      else if (args.target != null && !Array.isArray(args.target)) lastRef = args.target;
      else if (Array.isArray(args.target)) lastGroup = args.target;
      if (action === 'connect' && args.to != null && !Array.isArray(args.to)) lastRef = args.to;
      if (isCmd && ['move', 'set', 'resize', 'delete', 'label', 'rename', 'duplicate', 'swap', 'align'].includes(action) && args.target == null) F.notes.push(`@${id}: no target found; the interpreter will ask which shape you mean.`);
    }
  };
}

/** THE RULES' CUT as character offsets (the demo's cut setting, docs/js/vss-composer.js cutUnits): the pieces the rules' segmenter makes
 *  (formalize(...).pieces: sentences, verb and coordination splits, a verbless piece merged into the next, one clause per created object;
 *  before the chain merge) located in the original text. A piece is made of contiguous stretches of ONE sentence: the part itself, or the
 *  next part followed by a verbless part that stood before it, sometimes with a verb added in front (an ellipsis, one clause per created
 *  object); spelling corrections and restored quotes change some words, and the words between parts ("then", "and") are dropped. So each
 *  piece is located by a scan: from a start word, the unit grows word by word while the next word is needed, or a needed word follows
 *  within 3 words, never across the end of a sentence; it stops when the only word still needed is the piece's first one (an added
 *  verb). A word is needed while the piece has an unused copy of it (case-insensitive, or the word the rules corrected into it). The
 *  start is the first word after the cursor (the word after the previous unit) whose scan takes 60% of the piece's words (not counting
 *  its first), else the start whose scan takes the most, within the next 40 words. A piece with no needed word there gives no unit.
 *  -> [{c0, c1, src}] (src = text.slice(c0, c1)). Reading is not affected: the rules reader never uses these offsets. */
function rulesCut(formalize, input, ctx) {
  const r = formalize(input, ctx || {});
  const WORD = /[A-Za-z0-9]+(?:['’][A-Za-z]+)*/g, words = s => [...String(s).matchAll(WORD)].map(m => ({ w: m[0].toLowerCase().replace(/’/g, "'"), s: m.index, e: m.index + m[0].length }));
  const fixed = new Map();   // corrected word -> the typed words it replaced
  for (const c of r.corrections || []) { const m = /^I read “(.*)” as “(.*)”\.$/.exec(c); if (m) { const k = m[2].toLowerCase(); if (!fixed.has(k)) fixed.set(k, new Set()); fixed.get(k).add(m[1].toLowerCase()); } }
  const T = words(input), out = [];
  const eq = (p, t) => t.w === p.w || (fixed.has(p.w) && fixed.get(p.w).has(t.w));
  const ends = k => k + 1 < T.length && /[.!?;]\s/.test(input.slice(T[k].e, T[k + 1].s) + ' ');   // a sentence ends after word k
  // the scan from start word a -> {a, b, n (words taken)}
  const scan = (P, a) => {
    const left = P.map(() => true), need = k => P.findIndex((p, i) => left[i] && eq(p, T[k]));
    const take = k => { const i = need(k); if (i < 0) return false; left[i] = false; return true; };
    if (!take(a)) return null;
    let b = a, n = 1;
    for (;;) {
      const rest = left.map((x, i) => x ? i : -1).filter(i => i >= 0);
      if (!rest.length || (rest.length === 1 && rest[0] === 0)) break;
      let next = -1;
      for (let k = b + 1; k < Math.min(T.length, b + 5); k++) { if (ends(k - 1)) break; if (need(k) >= 0) { next = k; break; } }
      if (next < 0) break;
      take(next); b = next; n++;
    }
    return { a, b, n };
  };
  let cursor = 0;
  for (const pc of r.pieces || r.segments || []) {
    const P = words(pc.src); if (!P.length) continue;
    // the start: the first word after the cursor from which the scan takes most of the piece (all but an added verb), else the start
    // whose scan takes the most words (the earliest of equals), among the next 40 words
    const enough = Math.max(1, Math.ceil(0.6 * (P.length - 1)));
    let best = null;
    for (let k = cursor; k < Math.min(T.length, cursor + 40); k++) {
      const x = scan(P, k); if (!x) continue;
      if (x.n >= enough) { best = x; break; }
      if (!best || x.n > best.n) best = x;
    }
    if (!best) continue;
    out.push({ c0: T[best.a].s, c1: T[best.b].e, src: input.slice(T[best.a].s, T[best.b].e) });
    cursor = best.b + 1;
  }
  return out;
}

/* =====================================================================
   7. Assembly
   ===================================================================== */
/** the world written back as SOP wires (shapes, edges, rules, groups): what a backend receives after lowering; the World view shows it */
function worldNodes(state) {
  const S = state, out = [];
  for (const s of S.shapes) out.push({ id: s.name, type: 'shape', args: Object.assign({ shape: s.shape, size: sizeName(s.size), color: s.color }, s.outline ? { outline: s.outline } : {}, s.label ? { label: s.label } : {}, { at: [s.x, s.y] }) });
  for (const e of S.edges) out.push({ id: e.id, type: 'edge', args: Object.assign({ from: ref(e.from), to: ref(e.to), style: e.style, arrow: e.arrow }, e.color ? { color: e.color } : {}, e.label ? { label: e.label } : {}) });
  for (const r of S.rules) { const a = {}; ['shape', 'size', 'color', 'outline'].forEach(k => { if (r[k]) a[k] = r[k]; }); out.push({ id: r.id, type: 'rule', args: a }); }
  for (const g of S.groups || []) out.push({ id: g.name, type: 'group', args: { members: g.members.map(ref) } });
  return out;
}
const worldSOP = state => worldNodes(state).map(serialize).join('\n');

function createSystem(opts = {}) {
  const world = new DiagramWorld();
  const engine = new Engine(world);
  [corePlugin, historyPlugin, shapesPlugin, groupsPlugin, connectionsPlugin, layoutPlugin, queriesPlugin, reasoningPlugin, logicPlugin, rulesPlugin, factsPlugin].forEach(p => engine.use(Object.assign({}, p)));
  engine.legend.define('core', 'action', { ask: 'What should happen?', kind: 'enum' });
  const formalize = makeFormalizer(engine);
  /** cut(input, ctx): the rules' cut as character offsets [{c0, c1, src}] (rulesCut) */
  return { world, engine, formalize, cut: (input, ctx) => rulesCut(formalize, input, ctx) };
}

return { createSystem, CELL, cellOf, parse, serialize, fmtValue, isRef, names, SOPError, Clarify, CANVAS, COLOR_HEX, SIZE_PX, dims, sizeName, region, edgeText, groupBox, worldNodes, worldSOP };
})();
if (typeof module !== 'undefined') module.exports = SOPKit;
/*LOGIC-END*/
