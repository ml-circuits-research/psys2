// SPDX-License-Identifier: AGPL-3.0-only
// Source: https://github.com/ml-circuits-research/diagram-vss-demo, commit 9900d34836bf3fc913a6549f3da4c444bfa11304, docs/js/logic.js (AGPL-3.0).
// Converted to an ES module by scripts/convert-diagram-engine.mjs (mechanical wrap; see imports/diagram-vss-demo/PROVENANCE.md). Do not edit by hand.
import AutoLayoutModule from './auto-layout.mjs?v=1b9efcd048';
import TemplateKitModule from './templates.mjs?v=16b3d63ca9';
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };   // the turn's step budget (no-op outside a turn)
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
const KEY_ORDER = ['action', 'ask', 'topic', 'aspect', 'about', 'template', 'quantifier', 'count', 'shape', 'kind', 'property', 'superlative', 'comparison', 'size', 'scale', 'color', 'outline', 'fill', 'layer', 'name', 'label', 'title', 'items', 'items2', 'parents', 'scheme', 'target', 'from', 'to', 'style', 'arrow', 'position', 'anchor', 'position2', 'anchor2', 'region', 'members', 'at', 'width', 'height', 'direction', 'distance', 'axis', 'layout', 'linked'];
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
        if (node.type !== 'mention' && this.world.canonical) for (const k of Object.keys(args)) args[k] = this.world.canonical(k, args[k]);   // names by the text an item shows
        const h = this.match(node.type, args); step.plugin = h.plugin.name;
        const ctx = { world: this.world, engine: this, node, env, undo: hist.undo, redo: hist.redo, emit: p => { this.world.apply(p); step.patches.push(p); changed = true; } };
        const out = h.run(args, ctx) || {};
        Object.assign(step, { value: out.value, answer: out.answer, notes: out.notes, lowering: out.lowering, highlight: out.highlight, examples: out.examples });
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
/* The palette: the shades each colour NAME is drawn with. Rendering only: the engine and the readers use the names (the keys, in the
   order of COLOR_VALUES); never rename or remove one here. ui.js turns this table into CSS variables (--pc-<name>-<role>), with the
   dark-mode values under the page's dark theme, and draws with them; the help pages draw through ui.js and show `fill` as swatches.
   Roles:
     fill  the body of a shape (fill=light / faint draw it at PALETTE_TINT opacity: zones, backgrounds, venn circles)
     edge  the shape's own outline: the same hue one step deeper (an ink line round a wash), never a shared grey
     ink   a label written on the solid fill (WCAG AA, 4.5:1 or more, on every fill: 4.7 to 15.8)
     line  the colour on the bare canvas: an arrow, an outline=<colour>, a free text. The deep hues use their fill; the light ones
           (yellow, gold, lime, orange, cyan, pink, gray) are deepened until they reach 3:1 on white, which is why a yellow arrow or text
           is ochre rather than lemon (a lemon line on white is invisible). White stays pale (1.9:1): a white line on white can only hint.
           A label on a light / faint fill (ui.js "wash") takes the ink of a light hue, the edge of a deep one (4.5:1 or more on the tint
           in both themes), and the dark line in dark mode
     dark  what changes on the dark canvas (#111B21): lines lifted to 5.5:1 on it (4.5:1 on their own tint), outlines of the deep hues lighter than their fill so
           navy and black shapes keep their edge, and a softer white (pure white glares on a dark page). Fills otherwise stay.
   The choices (OKLCH, 2026-11-03): the old shades were saturated primaries at uneven lightness (a neon lime beside a heavy navy). These sit
   in two lightness bands with chroma held back by about a fifth, like a set of drafting inks: deep hues (red, green, teal, blue, indigo,
   purple, magenta, brown, navy, black) at L 0.26-0.56 carry white labels; light hues (yellow, gold, lime, orange, cyan, pink, gray,
   white) at L 0.72-1.0 carry a dark ink of their own hue instead of a generic black. Each still reads as its name: red is a brick red,
   not coral; navy is a deep blue-black, not slate; gold sits between orange and yellow; pink is a rose, not magenta. White is pure white
   with a cool grey edge (the default shape: its edge is the one people see most). */
const PALETTE = {
  red:     { fill: '#C63C3C', edge: '#9D1820', ink: '#FFFFFF', line: '#C63C3C', dark: { edge: '#DF6962', line: '#F1645F' } },
  orange:  { fill: '#ED8641', edge: '#AC5100', ink: '#482206', line: '#DF7A32', dark: { line: '#ED8641' } },
  yellow:  { fill: '#F9D460', edge: '#BC9B24', ink: '#3A2C00', line: '#B49100', dark: { line: '#F9D460' } },
  gold:    { fill: '#DEA63D', edge: '#A17000', ink: '#402900', line: '#C08A11', dark: { line: '#DEA63D' } },
  lime:    { fill: '#ABDA69', edge: '#769F34', ink: '#233407', line: '#76A12D', dark: { line: '#ABDA69' } },
  green:   { fill: '#35824B', edge: '#14612E', ink: '#FFFFFF', line: '#35824B', dark: { edge: '#609E6E', line: '#5BA76D' } },
  teal:    { fill: '#188178', edge: '#006058', ink: '#FFFFFF', line: '#188178', dark: { edge: '#529D95', line: '#40A79C' } },
  cyan:    { fill: '#5FCCE5', edge: '#2192A8', ink: '#003540', line: '#2DA2BA', dark: { line: '#5FCCE5' } },
  blue:    { fill: '#356AC3', edge: '#184A9B', ink: '#FFFFFF', line: '#356AC3', dark: { edge: '#5B8AD7', line: '#5991ED' } },
  navy:    { fill: '#203462', edge: '#071841', ink: '#FFFFFF', line: '#203462', dark: { edge: '#4A5E8A', line: '#7892C7' } },
  indigo:  { fill: '#4E4BAC', edge: '#332C85', ink: '#FFFFFF', line: '#4E4BAC', dark: { edge: '#6A6DC0', line: '#8387ED' } },
  purple:  { fill: '#7C47A5', edge: '#5C2980', ink: '#FFFFFF', line: '#7C47A5', dark: { edge: '#976BBC', line: '#B07BDD' } },
  magenta: { fill: '#AB3782', edge: '#841561', ink: '#FFFFFF', line: '#AB3782', dark: { edge: '#C4619D', line: '#DF67B0' } },
  pink:    { fill: '#EF9DBC', edge: '#B06785', ink: '#44212F', line: '#CB7C9B', dark: { line: '#EF9DBC' } },
  brown:   { fill: '#7B4F36', edge: '#59321B', ink: '#FFFFFF', line: '#7B4F36', dark: { edge: '#956D58', line: '#BC8567' } },
  gray:    { fill: '#A4AAB1', edge: '#6E757D', ink: '#1F2329', line: '#81878D', dark: { edge: '#C5CBD2', line: '#A4AAB1' } },
  black:   { fill: '#1F2329', edge: '#070A0F', ink: '#FFFFFF', line: '#1F2329', dark: { edge: '#5A616A', line: '#C9D3DA' } },
  white:   { fill: '#FFFFFF', edge: '#8C939B', ink: '#1F2329', line: '#B8BEC5', dark: { fill: '#E4E8ED', edge: '#9FA5AC', line: '#E4E8ED' } }
};
/* the rest of the drawing's paint: an arrow without a colour (light / dark canvas; a slate ink, 8.5:1 and 9.4:1), and the opacity of
   fill=light and fill=faint (zones, the background, venn circles: a wash that a label in the colour's `line` still reads on) */
const PALETTE_ARROW = { light: '#434E5B', dark: '#B4C0C8' };
const PALETTE_TINT = { light: 0.2, faint: 0.07, none: 0 };
const COLOR_HEX = Object.fromEntries(Object.entries(PALETTE).map(([k, v]) => [k, v.fill]));   /* name -> fill (help swatches, othercolor) */
const sizeName = px => Object.entries(SIZE_PX).reduce((b, [k, v]) => Math.abs(v - px) < Math.abs(SIZE_PX[b] - px) ? k : b, 'medium');
/* free text (shape=text): the font size of each size value (the same table as docs/js/templates.js FONT_PX); its box is estimated from
   the text as the renderer draws it (0.56 em per character) */
const FONT_PX = { tiny: 12, small: 14, medium: 18, large: 26, huge: 36 };
const fontOf = s => s.font || FONT_PX[sizeName(s.size)];
/* the z-band of an item (LEGEND_EXT.md section 2): a new item goes on top of its own band; background < zone < item < text */
const BAND = s => s.layer === 'background' ? 0 : s.layer === 'zone' ? 1 : s.shape === 'text' ? 3 : 2;
const isPanel = s => s.layer === 'background' || s.layer === 'zone';
function dims(s) {
  if (s.box) return { w: s.box.w, h: s.box.h };   /* a group used as an anchor: the box around its members */
  if (s.shape === 'text') { const fs = fontOf(s); return { w: Math.ceil(String(s.label || '').length * fs * 0.56) + 10, h: Math.round(fs * 1.4) }; }
  if (s.w && s.h) return { w: s.w, h: s.h };      /* an explicit box (width=, height=; panels, templates) */
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
  /** an argument with the names the user may have given by an item's shown text made canonical (canonicalNames); other keys unchanged */
  canonical(key, v) { if (v == null || !NAME_KEYS.includes(key)) return v; const ns = names(v); if (!ns.length) return v; const c = canonicalNames(this, ns); return c.join('\u0000') === ns.join('\u0000') ? v : c; }
  find(name) { if (name == null) return null; const l = String(name).toLowerCase(); return this.state.shapes.find(s => s.name.toLowerCase() === l) || null; }
  findGroup(name) { if (name == null) return null; const l = String(name).toLowerCase(); return (this.state.groups || []).find(g => g.name.toLowerCase() === l) || null; }
  groupOf(shapeName) { return (this.state.groups || []).find(g => g.members.includes(shapeName)) || null; }
  nextName(shape) { let n; do { budget.tick('diagram.name'); this.state.seq[shape] = (this.state.seq[shape] || 0) + 1; n = shape + this.state.seq[shape]; } while (this.find(n)); return n; }
  newEdge(from, to, o) { return Object.assign({ id: 'e' + (++this.state.edgeSeq), from, to, style: 'solid', arrow: 'forward', label: null, color: null }, o || {}); }
  apply(p) {
    const S = this.state;
    switch (p.op) {
      case 'add': { const sh = Object.assign({}, p.shape, { order: ++S.order }), b = BAND(sh); let i = S.shapes.length; while (i > 0 && BAND(S.shapes[i - 1]) > b) i--; S.shapes.splice(i, 0, sh); break; }   // on top of its own z-band
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
      case 'edgeSet': { const e = S.edges.find(x => x.id === p.id); if (!e) throw new SOPError('Unknown connection ' + p.id); p.before = {}; for (const k of Object.keys(p.props)) p.before[k] = e[k]; Object.assign(e, p.props); p.edge = Object.assign({}, e); break; }   /* change an existing connection (its label) */
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
    if (ignore.includes(s.name) || isPanel(s)) return false;   /* a background or a zone is never an obstacle: items go on it */
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
  if (pos === 'inside') return { x: a.x, y: a.y };   /* in the anchor's middle (create: commonSense places several and avoids what is there) */
  if (pos === 'onTop') return { x: a.x, y: Math.round(a.y - ad.h / 2 - h / 2) };   /* touching its top edge */
  const calc = p => ({ leftOf: [a.x - ad.w / 2 - gap - w / 2, a.y, -1, 0], rightOf: [a.x + ad.w / 2 + gap + w / 2, a.y, 1, 0], above: [a.x, a.y - ad.h / 2 - gap - 16 - h / 2, 0, -1], below: [a.x, a.y + ad.h / 2 + gap + 16 + h / 2, 0, 1] })[p];
  const order = pos === 'near' ? ['rightOf', 'below', 'leftOf', 'above'] : [pos];
  for (const p of order) {
    let [x, y, dx, dy] = calc(p);
    for (let i = 0; i < 6; i++) {
      const q = clampPt(x, y, w, h);
      const inBounds = Math.abs(q.x - x) < 2 && Math.abs(q.y - y) < 2;
      if (inBounds && !hits(W, boxAt(q.x, q.y, w, h), ignore, dist != null ? Math.max(0, Math.min(14, +dist - 1)) : 14)) return q;   /* a stated gap under 14 px is kept (scenes_r3 engine finding 3) */
      x += dx * (w + 24); y += dy * (h + 24);
    }
  }
  const [x, y] = calc(order[0]); return nearFree(W, x, y, w, h, ignore);
}
/* ---------- items referred to by the text they show (a free text's words, a shape's label) ----------
   People name what they see: "delete Order flow" means the title MainTitle, which says "Order flow". A reference that is the name of no shape
   and no group is looked up among the items' texts; the first tier that matches decides:
     1. the whole text, ignoring case, repeated spaces, quotes and punctuation at the ends ("order flow", "Order  flow!", "ok" for "ok?");
     2. the same with no spaces or punctuation at all ("Orderflow");
     3. a near match: every word of the reference is a word of the text and covers at least half of its words ("Order" or "flow" for
        "Order flow"; not "Make" for "Make the payment and ship it"), or the squashed forms differ by one letter (6+ letters: "Ordr flow").
   Only exactly one item in that tier is a match; two or more -> the caller asks which one. The readers pass names; the engine resolves
   them here for every wire (Engine.run canonicalNames), so every reader gets this. */
const normText = t => String(t == null ? '' : t).toLowerCase().replace(/[‘’“”"'`]/g, '').replace(/\s+/g, ' ').trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
const squashText = t => normText(t).replace(/[^\p{L}\p{N}]+/gu, '');
const textWords = t => normText(t).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
function oneEdit(a, b) {   /* at most one insertion, deletion or substitution */
  if (a === b) return true; if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return a.slice(i + (a.length >= b.length ? 1 : 0)) === b.slice(i + (b.length >= a.length ? 1 : 0));
}
/** the items whose shown text matches ref: {tier (1..3, 0 = none), list} */
function itemsByText(W, ref) {
  const items = W.state.shapes.filter(s => s.label != null && String(s.label).trim() !== ''), r = normText(ref), q = squashText(ref), rw = textWords(ref);
  if (!r) return { tier: 0, list: [] };
  const t1 = items.filter(s => normText(s.label) === r); if (t1.length) return { tier: 1, list: t1 };
  const t2 = q ? items.filter(s => squashText(s.label) === q) : []; if (t2.length) return { tier: 2, list: t2 };
  const t3 = items.filter(s => { const lw = textWords(s.label);
    if (rw.length && rw.every(w => w.length >= 2 && lw.includes(w)) && rw.length * 2 >= lw.length) return true;
    const sq = squashText(s.label); return q.length >= 6 && sq.length >= 6 && oneEdit(q, sq); });
  return { tier: t3.length ? 3 : 0, list: t3 };
}
const textAmbiguity = (ref, list) => new SOPError(`Which one? "${ref}" could be ${listing(list.map(s => `${s.name} ("${s.label}")`))}. Name it, e.g. "${list[0].name}".`);
/** a reference -> the shape it names, or the one item that shows that text; null when nothing matches; throws when two or more do */
function byNameOrText(W, n) {
  const s = W.find(n); if (s) return s;
  if (W.findGroup && W.findGroup(n)) return null;
  const m = itemsByText(W, n);
  if (m.list.length > 1) throw textAmbiguity(n, m.list);
  return m.list[0] || null;
}
/** the names of one argument (target, anchor, from, to, ...) made canonical: a name of a shape or group stays; an unknown one becomes the
 *  name of the item that shows it. Several unknown words in a row are first tried together ("Order", "flow" -> the text "Order flow");
 *  an item found twice that way is listed once. Unknown references that match nothing stay as they are (the handler says so). */
function canonicalNames(W, list) {
  const known = n => !!(W.find(n) || (W.findGroup && W.findGroup(n))), out = [], fromText = new Set();
  for (let i = 0; i < list.length; i++) {
    const n = String(list[i]);
    if (known(n)) { out.push(n); continue; }
    let j = i; while (j + 1 < list.length && !known(String(list[j + 1]))) j++;
    let took = false;
    for (let k = j; k > i && !took; k--) {
      const m = itemsByText(W, list.slice(i, k + 1).join(' '));
      if (m.list.length === 1 && m.tier <= 2) { const nm = m.list[0].name; if (!fromText.has(nm)) { out.push(nm); fromText.add(nm); } i = k; took = true; }
    }
    if (took) continue;
    const s = byNameOrText(W, n);
    if (s) { if (!fromText.has(s.name)) { out.push(s.name); fromText.add(s.name); } } else out.push(n);
  }
  return out;
}
const NAME_KEYS = ['target', 'anchor', 'anchor2', 'linked', 'from', 'to', 'members'];
function need(W, n) {
  const s = W.find(n) || (W.findGroup && W.findGroup(n) ? null : byNameOrText(W, n));
  if (!s && W.findGroup && W.findGroup(n)) { const g = W.findGroup(n); throw new SOPError(`${g.name} is a group (${listing(g.members)}), not a shape; name one of its shapes.`); }
  if (!s) { const all = W.state.shapes.map(x => x.name), few = all.length > SHORT_LIST + 1 ? closestNames(n, all, SHORT_LIST) : all;
    throw new SOPError(`There is no shape named "${n}".` + (!all.length ? ' The canvas is empty.' : few.length < all.length ? ` The closest names on the canvas: ${few.join(', ')}, and ${all.length - few.length} others.` : ` Shapes on the canvas: ${all.join(', ')}.`)); }
  return s;
}
/* ---------- groups: the box around the members; a group used as an anchor is that box ---------- */
function groupBox(state, g) {
  const ms = g.members.map(n => state.shapes.find(s => s.name === n)).filter(Boolean); if (!ms.length) return null;
  const x1 = Math.min(...ms.map(s => s.x - dims(s).w / 2)), x2 = Math.max(...ms.map(s => s.x + dims(s).w / 2));
  const y1 = Math.min(...ms.map(s => s.y - dims(s).h / 2)), y2 = Math.max(...ms.map(s => s.y + dims(s).h / 2));
  return { x1, y1, x2, y2, x: (x1 + x2) / 2, y: (y1 + y2) / 2, w: x2 - x1, h: y2 - y1, members: ms };
}
/* what ui.js draws besides the bodies, so that a group's name can be placed where nothing else is: a shape's name tag above it (11 px
   mono, 7 px above the body, 12 px when highlighted: both covered; none for a free text, a template's shape or a panel) */
function tagBox(s) { const d = dims(s), w = String(s.name).length * 6.7; return { x1: s.x - w / 2, x2: s.x + w / 2, y1: s.y - d.h / 2 - 23, y2: s.y - d.h / 2 - 4 }; }
/** where ui.js writes each group's name (12 px, bold): above its dashed frame on the left, else above on the right, else below on the
 *  left / right: the first spot that no shape, name tag, free text or earlier group name covers (else the first). The frame is the
 *  members' box plus 12 px, and 14 px more on top. -> [{name, x, y (baseline), x1, y1, x2, y2}] */
function groupLabels(state) {
  const taken = [];
  for (const s of state.shapes) { if (s.layer) continue; const d = dims(s); taken.push({ x1: s.x - d.w / 2, x2: s.x + d.w / 2, y1: s.y - d.h / 2, y2: s.y + d.h / 2 }); if (s.shape !== 'text' && !s.quiet) taken.push(tagBox(s)); }
  const hit = q => taken.some(o => Math.min(o.x2, q.x2) - Math.max(o.x1, q.x1) > 0.5 && Math.min(o.y2, q.y2) - Math.max(o.y1, q.y1) > 0.5), out = [];
  for (const g of state.groups || []) {
    const b = groupBox(state, g); if (!b) continue;
    const x = b.x1 - 12, y = b.y1 - 26, w = b.w + 24, h = b.h + 38, tw = Math.ceil(g.name.length * 7.2);
    const spots = [[x + 10, y - 6], [x + w - 10 - tw, y - 6], [x + 10, y + h + 14], [x + w - 10 - tw, y + h + 14]].map(([lx, ly]) => ({ name: g.name, x: lx, y: ly, x1: lx, x2: lx + tw, y1: ly - 12, y2: ly + 3 }));
    const pick = spots.find(q => !hit(q)) || spots[0]; out.push(pick); taken.push(pick);
  }
  return out;
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

/** an at= value -> [x, y] numbers, or null: [400, 182], "400,182", "400, 182", ["400", "182"] are read; anything else (one number, words) is
 *  null (owner's session 2026-11-03: a learned reader's at="400, 182" became a shape at NaN, NaN, and the view's viewBox NaN broke the zoom) */
function atXY(v) {
  const xs = [].concat(v).flatMap(x => typeof x === 'string' ? x.split(/[\s,;]+/) : [x]).filter(x => x !== '' && x != null).map(Number);
  return xs.length === 2 && xs.every(Number.isFinite) ? xs : null;
}
function placeFor(W, a, w, h, ignore) {
  if (a.at) { const xy = atXY(a.at); if (xy) return clampPt(xy[0] + FR.x, xy[1] + FR.y, w, h); }   // an x,y the reader wrote badly ("400, 182" as one string, one number): placed as if not given
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
    case 'inside': { const d = dims(a); return Math.abs(s.x - a.x) <= d.w / 2 && Math.abs(s.y - a.y) <= d.h / 2; }
    case 'onTop': { const d = dims(a), e = dims(s); return Math.abs((s.y + e.h / 2) - (a.y - d.h / 2)) <= 8 && Math.abs(s.x - a.x) <= d.w / 2; }
    case 'between': { const b = anc[1] || a; const vx = b.x - a.x, vy = b.y - a.y, L = vx * vx + vy * vy || 1; const t = ((s.x - a.x) * vx + (s.y - a.y) * vy) / L; const px = a.x + t * vx, py = a.y + t * vy; return t > 0.05 && t < 0.95 && Math.hypot(s.x - px, s.y - py) < 70; }
    default: return false;
  }
}
const region = s => { const o = cellOf(s.x, s.y), X = s.x - o.x, Y = s.y - o.y; const c = X < 267 ? 'left' : X < 533 ? 'center' : 'right'; const r = Y < 167 ? 'top' : Y < 333 ? 'middle' : 'bottom'; return r === 'middle' ? (c === 'center' ? 'center' : 'middle ' + c) : r + (c === 'center' ? ' center' : ' ' + c); };
const plural = (w, n) => n === 1 ? w : (w.endsWith('x') || w.endsWith('s') ? w + 'es' : w + 's');
const listing = arr => arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
/* Short errors (owner, 2026-11-03): an error that would list every item on a big canvas (a scene holds about 80 shapes) lists only a few:
   the SHORT_LIST closest to what was asked (closestNames: by shared letter pairs, ties in canvas order), then "and N others". */
const SHORT_LIST = 5;
const pairsOf = w => { const s = String(w).toLowerCase(), out = new Set(); for (let i = 0; i + 1 < s.length; i++) out.add(s.slice(i, i + 2)); return out; };
/** the items of arr most similar to ref (Dice coefficient of the letter pairs), at most k, best first */
function closestNames(ref, arr, k) {
  const q = pairsOf(ref), sim = n => { const p = pairsOf(n); let c = 0; for (const x of p) if (q.has(x)) c++; return p.size + q.size ? 2 * c / (p.size + q.size) : 0; };
  return arr.map((n, i) => ({ n, i, s: sim(n) })).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, k).map(x => x.n);
}
/** a list joined with sep, cut to the first SHORT_LIST items + "and N others" (items already in the order to show) */
const shortList = (arr, sep, what) => arr.length <= SHORT_LIST + 1 ? arr.join(sep) : arr.slice(0, SHORT_LIST).join(sep) + `${sep.trim() === ';' ? ';' : ','} and ${arr.length - SHORT_LIST} other${arr.length - SHORT_LIST === 1 ? '' : 's'}${what ? ' ' + what : ''}`;
const describeShape = s => s.shape === 'text' ? `${s.name} is a ${sizeName(s.size)} ${s.color} text “${s.label || ''}” in the ${region(s)}` : `${s.name} is a ${s.w ? `${s.w}×${s.h} px` : sizeName(s.size)} ${s.color} ${s.layer ? s.layer + ' ' : ''}${s.shape}${s.outline ? ' with a ' + s.outline + ' outline' : ''}${s.label ? ` labeled "${s.label}"` : ''} in the ${region(s)}`;
const edgeText = e => `${e.from} ${e.arrow === 'forward' ? '→' : e.arrow === 'both' ? '↔' : '—'} ${e.to}${e.style !== 'solid' ? ' (' + e.style + ')' : ''}${e.label ? ` "${e.label}"` : ''}`;
const edgeEnds = e => `${e.from} ${e.arrow === 'forward' ? '→' : e.arrow === 'both' ? '↔' : '—'} ${e.to}`;
/* the existing connections a wire names by its ends: from= and/or to= (shape names). With both ends: the connection from -> to; when there
   is none, the one between them that points the other way. With one end: every connection that starts (from=) or ends (to=) there. */
function edgesNamed(W, a) {
  const F = names(a.from).map(n => need(W, n).name), T = names(a.to).map(n => need(W, n).name);
  const fit = (f, t) => W.state.edges.filter(e => (!f.length || f.includes(e.from)) && (!t.length || t.includes(e.to)));
  let es = fit(F, T);
  if (!es.length && F.length && T.length) es = fit(T, F);
  const what = F.length && T.length ? `between ${listing(F)} and ${listing(T)}` : F.length ? `from ${listing(F)}` : `into ${listing(T)}`;
  if (!F.length && !T.length) throw new SOPError('Which arrow? Name its two ends, e.g. "the arrow from Start to Done".');
  if (!es.length) { const near = W.state.edges.filter(e => F.concat(T).some(n => e.from === n || e.to === n)); throw new SOPError(`There is no arrow ${what}.` + (near.length ? ` Arrows there: ${shortList(near.map(edgeText), '; ')}.` : '')); }
  return { es, what, both: F.length > 0 && T.length > 0 };
}
const adjacent = (W, a, b) => W.state.edges.some(e => (e.from === a && e.to === b) || (e.from === b && e.to === a));
const degree = (W, n) => W.state.edges.filter(e => e.from === n || e.to === n).length;
const POS_WORDS = { leftOf: 'left of', rightOf: 'right of', above: 'above', below: 'below', near: 'near', between: 'between', inside: 'inside', onTop: 'on' };

/* panels in descriptions: a background or a zone (isPanel) is part of a description only when it says so (layer=background | zone, the
   words background, backdrop, zone, panel, lane); a description by kind ("the boxes", "every rectangle", "all shapes") means the ordinary
   items, so "delete the boxes" never deletes the zones under them (owner's session 2026-11-03: "Delete background boxes" deleted Backdrop,
   both zones and Process). layer=item: the ordinary items only. A description with no kind and no layer ("everything") keeps them all. */
const PANEL_WORDS = 'the background or the zones';
function filterShapes(W, a, base) {
  let list = base ? base.map(n => need(W, n)) : W.state.shapes.slice();
  if (a.layer === 'background' || a.layer === 'zone') list = list.filter(s => s.layer === a.layer);
  else if (a.layer === 'item' || (!base && a.shape)) list = list.filter(s => !isPanel(s));
  if (a.label != null && String(a.label) !== '') { const m = itemsByText(W, a.label).list; list = list.filter(s => m.includes(s)); }   /* named by its shown text */
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
  const noun = a.layer === 'zone' ? 'zone' : a.layer === 'background' ? 'background panel' : a.shape && a.shape !== 'any' ? a.shape : 'shape';
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
    budget.tick('diagram.solve');
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
    budget.tick('diagram.solve', 1 + db.size);
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
    const n = q.shift(); budget.tick('diagram.path', 1 + W.state.edges.length); if (n === to) break;
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
const SHAPE_VALUES = { any: ['shape', 'shapes', 'node', 'nodes', 'object', 'objects', 'thing', 'things', 'element', 'elements', 'item', 'items', 'one', 'ones'], circle: ['circles', 'dot', 'dots', 'ball', 'balls'], square: ['squares'], rectangle: ['rectangles', 'rect', 'rects', 'box', 'boxes', 'block', 'blocks'], triangle: ['triangles'], diamond: ['diamonds', 'rhombus'], ellipse: ['ellipses', 'oval', 'ovals'], hexagon: ['hexagons'], star: ['stars'], text: ['texts', 'title', 'heading', 'headline', 'caption', 'subtitle'] };   /* text: a free text item (LEGEND_EXT.md 2) */
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
      const W = ctx.world, list = filterShapes(W, a, null), n = list.length;   /* label= : "the text Order flow" (itemsByText); layer= : panels */
      const phrase = phraseOf(a, a.quantifier === 'all' ? 2 : 1) + (a.label != null && String(a.label) !== '' ? ` showing "${a.label}"` : '');
      /* nothing among the items, but a panel would match: say so (a description by kind leaves the panels out, filterShapes) */
      const panelHint = !n && a.shape && !a.layer && filterShapes(W, Object.assign({}, a, { layer: 'background' }), null).concat(filterShapes(W, Object.assign({}, a, { layer: 'zone' }), null)).length ? ` (the background and the zones are left out; say "${PANEL_WORDS}" to mean them)` : '';
      if (a.quantifier === 'all') { if (!n) throw new SOPError(`There are no ${phrase} on the canvas${panelHint}.`); return { value: list.map(s => s.name), notes: ['matched ' + list.map(s => s.name).join(', ')] }; }
      if (!n) throw new SOPError(`I can't find a ${phrase} on the canvas${panelHint}.`);
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
function freeGroupName(W, base) { let k = 1, n = base; while ((budget.tick('diagram.name'), W.find(n) || W.findGroup(n))) n = base.replace(/\d+$/, '') + (++k); return n; }
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

/* create count>1 with layout=row|column|grid|circle: the offsets of the n shapes from the centre of their block, and the block's size.
   The block is placed like one shape (position / anchor / region / at, or a free spot), so a layout and a position combine. */
function layoutOffsets(lay, n, w, h) {
  const gx = w + 28, gy = h + 28; let pts;
  if (lay === 'column') pts = Array.from({ length: n }, (_, i) => [0, (i - (n - 1) / 2) * gy]);
  else if (lay === 'grid') { const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols); pts = Array.from({ length: n }, (_, i) => [((i % cols) - (cols - 1) / 2) * gx, (Math.floor(i / cols) - (rows - 1) / 2) * gy]); }
  else if (lay === 'circle') { const r = Math.max(Math.max(w, h) + 20, (Math.max(w, h) + 28) * n / (2 * Math.PI)); pts = Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r)]; }); }
  else pts = Array.from({ length: n }, (_, i) => [(i - (n - 1) / 2) * gx, 0]);   // row
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return { pts, w: Math.max(...xs) - Math.min(...xs) + w, h: Math.max(...ys) - Math.min(...ys) + h };
}

/* the explicit box, fill and layer of a new shape (width=, height=, fill=, layer=): panels, zones, backgrounds */
function boxArgs(a, shape) {
  const o = {};
  if (a.width != null || a.height != null) { const d = dims({ shape, size: SIZE_PX[a.size || 'medium'] }); o.w = Math.max(10, Math.round(+(a.width != null ? a.width : a.height * d.w / d.h))); o.h = Math.max(10, Math.round(+(a.height != null ? a.height : a.width * d.h / d.w))); }
  if (a.fill && a.fill !== 'solid') o.fill = a.fill;
  if (a.layer && a.layer !== 'item') o.layer = a.layer;
  return o;
}
/* a free text: an item of its own (shape=text) with a text (label), a font size (size), a colour (default black), a place (a free spot
   near the top centre when none is given); no body, no outline, not connectable; moved, recoloured, resized, relabelled, deleted and
   restacked like a shape (LEGEND_EXT.md section 2) */
function createText(a, ctx) {
  const W = ctx.world;
  if (a.label == null || String(a.label) === '') throw new SOPError('What should the text say? Put it in quotes, e.g. add a title "Q3 roadmap" at the top.');
  const name = a.name != null ? String(a.name) : W.nextName('text');
  if (!/^[A-Za-z_][\w-]*$/.test(name)) throw new SOPError(`"${name}" can't be a name: use letters, digits, - or _ and start with a letter.`);
  if (W.find(name)) throw new SOPError(`There is already a shape named "${W.find(name).name}".`);
  if (W.findGroup(name)) throw new SOPError(`"${W.findGroup(name).name}" is already the name of a group.`);
  const t = { name, shape: 'text', size: SIZE_PX[a.size || 'medium'], color: a.color || 'black', outline: null, label: String(a.label) }, d = dims(t);
  let p, answer;
  if (a.at || a.position || a.region) { p = placeFor(W, a, d.w, d.h, []); answer = unmetText(name, p); }
  else p = nearFree(W, FR.x + 400, FR.y + 24 + d.h / 2 + 8, d.w, d.h, []);
  ctx.emit({ op: 'add', shape: Object.assign(t, { x: p.x, y: p.y }) });
  return { value: [name], answer };
}

/* ---------- common-sense defaults of the drawing tools (owner, 2026-11-03: "the tools that draw must choose better defaults, have common
   sense beyond what the person states explicitly") ----------
   Applied by create ONLY to what the request does not state (a stated shape, colour, size, place or box always wins; then the rules of
   "from now on ..."; then these). Each rule has a test in test_diagram_ops.mjs ("common-sense defaults").
     1. what the shape depicts (object=, or its name or label: "Sun", "Cloud2", "a circle named Roof") -> its kind, colour, size and place
        (COMMON_SENSE below): a sun is a large gold circle in the top right, a cloud a white ellipse at the top, grass green, water blue;
        a sky is a light-blue background panel across the top, the ground and grass a panel across the bottom (layer=background: never an
        obstacle, drawn behind the items);
     2. inside X (position=inside): a size relative to X (a third of X's smaller side for one shape, a fifth each for several: the eyes in a
        head are small), centred in X, several in a row across its upper middle, a free spot inside X when something is already there;
     3. on X (position=onTop: "on House", "onto House"): touching X's top edge, centred on it; a roof (a triangle, or object roof) on a box
        gets the box's width, also when it is said "above X" / "on top of X";
     4. a new shape never overlaps an existing item unless it is placed inside one (the free-spot search of placeFor, as before);
     5. colours of known nouns when no colour is stated (rule 1's table): sun gold, grass and trees green, sky light blue (cyan), water blue. */
const COMMON_SENSE = {
  sun: { shape: 'circle', color: 'gold', size: 'large', spot: 'topRight' },
  moon: { shape: 'circle', color: 'yellow', size: 'medium', spot: 'topRight' },
  cloud: { shape: 'ellipse', color: 'white', size: 'large', spot: 'top' },
  sky: { shape: 'rectangle', color: 'cyan', fill: 'light', panel: 'top' },
  ground: { shape: 'rectangle', color: 'brown', panel: 'bottom' },
  grass: { shape: 'rectangle', color: 'green', panel: 'bottom' },
  water: { color: 'blue' }, sea: { shape: 'rectangle', color: 'blue', panel: 'bottom' }, lake: { shape: 'ellipse', color: 'blue' }, river: { shape: 'rectangle', color: 'blue' }, pond: { shape: 'ellipse', color: 'blue' },
  tree: { shape: 'circle', color: 'green', size: 'large' }, trunk: { shape: 'rectangle', color: 'brown', size: 'small' }, leaf: { shape: 'ellipse', color: 'green', size: 'small' },
  roof: { shape: 'triangle', color: 'red' }, house: { shape: 'square', size: 'huge' }, wall: { shape: 'square' }, walls: { shape: 'square' },
  door: { shape: 'rectangle', color: 'brown' }, window: { shape: 'square', color: 'cyan', size: 'small' },
  head: { shape: 'circle', size: 'huge' }, face: { shape: 'circle', color: 'yellow', size: 'huge' }, eye: { shape: 'circle', color: 'white' }, nose: { shape: 'triangle' }, mouth: { shape: 'ellipse', color: 'red' },
  flower: { shape: 'star', color: 'pink' }, fire: { shape: 'triangle', color: 'orange' }, snow: { shape: 'circle', color: 'white' }, apple: { shape: 'circle', color: 'red' }
};
const OBJECT_VALUES = Object.fromEntries(Object.keys(COMMON_SENSE).map(k => [k, k === 'leaf' ? ['leaves'] : /s$/.test(k) ? [] : [k + 's']]));   /* the legend's values of object=, with their plural */
/** the noun a create depicts: object=, else its name without trailing digits ("Cloud2"), else its label; -> a key of COMMON_SENSE | null */
function depicted(a) {
  for (const v of [a.object, a.name != null ? String(a.name).replace(/\d+$/, '') : null, a.label]) {
    const k = v == null ? '' : String(v).toLowerCase().trim(); if (COMMON_SENSE[k]) return k;
    if (/s$/.test(k) && COMMON_SENSE[k.replace(/(?:es|s)$/, '')]) return k.replace(/(?:es|s)$/, '');
  }
  return null;
}
const isBox = s => s && (s.shape === 'square' || s.shape === 'rectangle');
/** the stated request plus the common-sense defaults (rules 1-3 above) -> {a: the request with the defaults filled in, sizePx: a size in px
 *  (rule 2), box: {w, h} (rule 3, a roof), place(i, w, h): the spot of the i-th new shape (rules 2, 3) | null, notes} */
function commonSense(W, a, n, stated) {
  const out = Object.assign({}, a), notes = [], k = depicted(a), C = k ? COMMON_SENSE[k] : null;
  let sizePx = null, box = null, place = null;
  const placed = a.at != null || a.position != null || a.region != null;
  if (C) {
    if (!out.shape || out.shape === 'any') out.shape = C.shape || out.shape;
    if (!stated.color && C.color) out.color = C.color;
    if (!out.size && C.size && !C.panel) out.size = C.size;
    if (C.panel && !placed && a.width == null && a.height == null && !out.layer) {   // a band across the top or the bottom of the drawing
      const h = C.panel === 'top' ? 200 : 120, w = CANVAS.W - 20;
      out.layer = 'background'; out.width = w; out.height = h; if (C.fill && !out.fill) out.fill = C.fill;
      out.at = [CANVAS.W / 2, C.panel === 'top' ? 10 + h / 2 : CANVAS.H - 10 - h / 2];
    } else if (C.spot && !placed) out.position = C.spot;
    if (!a.name && a.object) { const base = k[0].toUpperCase() + k.slice(1); let nm = base, i = 1; while ((budget.tick('diagram.name'), W.find(nm) || W.findGroup(nm))) nm = base + (++i); out.name = nm; }
    notes.push(`common sense for a ${k}`);
  }
  const anc = names(a.anchor).length ? (() => { try { return needAnchor(W, names(a.anchor)[0]); } catch (e) { return null; } })() : null;
  if (anc && a.position === 'inside') {
    const d = dims(anc), busy = W.state.shapes.some(s => s !== anc && !isPanel(s) && Math.abs(s.x - anc.x) < d.w / 2 && Math.abs(s.y - anc.y) < d.h / 2), frac = n > 1 ? 0.2 : busy ? 0.26 : 0.3;
    if (!a.size && a.width == null && a.height == null) { sizePx = Math.max(10, Math.round(Math.min(d.w, d.h) * frac)); delete out.size; }   // relative to X, before a noun's usual size
    place = (i, w, h) => {
      if (k === 'door' && n === 1) return { x: anc.x, y: Math.round(anc.y + d.h / 2 - h / 2) };   /* a door stands on the bottom edge */
      if (n > 1) { const span = d.w * 0.4, x = anc.x - span / 2 + (n === 1 ? span / 2 : span * i / (n - 1)); return { x: Math.round(x), y: Math.round(anc.y - d.h * 0.12) }; }
      const inside = W.state.shapes.filter(s => s !== anc && !isPanel(s) && Math.abs(s.x - anc.x) < d.w / 2 && Math.abs(s.y - anc.y) < d.h / 2);
      const free = (x, y) => !inside.some(s => { const e = dims(s); return Math.abs(s.x - x) < (e.w + w) / 2 + 4 && Math.abs(s.y - y) < (e.h + h) / 2 + 4; });
      if (free(anc.x, anc.y)) return { x: anc.x, y: anc.y };
      let best = null;
      for (let fy = -0.35; fy <= 0.351; fy += 0.05) for (let fx = -0.35; fx <= 0.351; fx += 0.05) { const x = anc.x + fx * d.w, y = anc.y + fy * d.h;
        if (Math.abs(x - anc.x) + w / 2 > d.w / 2 || Math.abs(y - anc.y) + h / 2 > d.h / 2 || !free(x, y)) continue;
        const c = Math.hypot(fx, fy); if (!best || c < best.c) best = { x: Math.round(x), y: Math.round(y), c }; }
      return best ? { x: best.x, y: best.y } : { x: anc.x, y: anc.y };
    };
  }
  const roof = (out.shape === 'triangle' || k === 'roof') && isBox(anc);
  if (anc && (a.position === 'onTop' || (a.position === 'above' && roof && (k === 'roof' || a.position === 'onTop')))) {
    const d = dims(anc);
    if (roof && !out.size && a.width == null && a.height == null) box = { w: d.w, h: Math.round(d.w * 0.6) };
    place = (i, w, h) => inCell(anc.x, anc.y, () => clampPt(anc.x + (n > 1 ? (i - (n - 1) / 2) * (w + 6) : 0), anc.y - d.h / 2 - h / 2, w, h));   /* kept on the canvas: it overlaps X rather than leave the drawing */
  }
  return { a: out, sizePx, box, place, notes };
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
    position: { ask: 'Where is it, relative to the anchor or the canvas?', kind: 'enum', values: { leftOf: ['left of'], rightOf: ['right of'], above: ['above', 'over', 'on top of'], inside: ['inside', 'within', 'into'], onTop: ['onto'], below: ['below', 'under', 'beneath'], near: ['next to', 'near', 'beside'], between: ['between'], center: ['center', 'middle'], top: ['at the top'], bottom: ['at the bottom'], left: ['on the left'], right: ['on the right'], topLeft: ['top left'], topRight: ['top right'], bottomLeft: ['bottom left'], bottomRight: ['bottom right'] } },
    anchor: { ask: 'Relative to which shape?', kind: 'names' },
    object: { ask: 'What does the shape depict?', kind: 'enum', values: OBJECT_VALUES },
    at: { ask: 'At which x,y coordinates?', kind: 'point' },
    direction: { ask: 'In which direction does it move?', kind: 'enum', values: { left: [], right: [], up: ['upwards'], down: ['downwards'] } },
    distance: { ask: 'How far, in pixels?', kind: 'number' },
    linked: { ask: 'Which shapes is it connected to?', kind: 'names' },
    width: { ask: 'How wide is it, in pixels?', kind: 'number' },
    height: { ask: 'How tall is it, in pixels?', kind: 'number' },
    fill: { ask: 'How solid is its fill?', kind: 'enum', values: { solid: ['opaque', 'filled'], light: ['pale', 'light', 'pastel', 'see-through', 'translucent'], faint: ['very light', 'faint', 'washed out'], none: ['hollow', 'empty', 'unfilled', 'transparent', 'outline only'] } },
    layer: { ask: 'Is it a background, a zone that holds items, or an item?', kind: 'enum', values: { background: ['background', 'backdrop'], zone: ['zone', 'panel', 'container', 'area', 'lane', 'swimlane'], item: [] } }
  },
  handlers: [
    { type: 'command', when: { action: 'create', shape: 'text' }, run: createText },
    { type: 'command', when: { action: 'create' }, run(a0, ctx) {
      const W = ctx.world, notes = [];
      // the stated request, then the rules ("from now on ..."), then the common-sense defaults (commonSense) for what is still open
      const pre = { color: a0.color, size: a0.size, outline: a0.outline }, shape0 = a0.shape && a0.shape !== 'any' ? a0.shape : (depicted(a0) && COMMON_SENSE[depicted(a0)].shape) || 'circle';
      const rp0 = ctx.engine.plugin('rules');
      if (rp0 && rp0.enabled) for (const r of W.state.rules) { if (r.shape && r.shape !== shape0) continue; for (const k of ['color', 'size', 'outline']) if (pre[k] == null && r[k] != null) pre[k] = r[k]; }
      const nn = Math.max(1, Math.min(12, Math.round(+a0.count || 1)));
      const CS = commonSense(W, a0, nn, { color: pre.color != null, size: pre.size != null }), a = CS.a; notes.push(...CS.notes);
      /* no kind stated: a panel (zone, background) or a box given as width by height is a rectangle, not a circle (scenes_r3 engine finding 8) */
      const boxy = (a.layer === 'zone' || a.layer === 'background') || (a.width != null && a.height != null && +a.width !== +a.height);
      const shape = a.shape && a.shape !== 'any' ? a.shape : boxy ? 'rectangle' : 'circle';
      const props = { color: a.color, size: a.size, outline: a.outline };
      const rp = ctx.engine.plugin('rules');
      if (rp && rp.enabled) for (const r of W.state.rules) { if (r.shape && r.shape !== shape) continue; for (const k of ['color', 'size', 'outline']) if (props[k] == null && r[k] != null) { props[k] = r[k]; notes.push(`rule ${r.id} filled in ${k}=${r[k]}`); } }
      const n = Math.max(1, Math.min(12, Math.round(+a.count || 1)));
      const made = []; let prev = null, answer, block = null;
      if (a.layout && n > 1) {   // several new shapes in a layout: the block of the layout is placed like one shape, then each shape in it
        const d0 = dims({ shape, size: SIZE_PX[props.size || 'medium'] }), L = layoutOffsets(a.layout, n, d0.w, d0.h), c = placeFor(W, a, L.w, L.h, []);
        const u = unmetText(`the ${a.layout}`, c); if (u) answer = u;
        block = L.pts.map(([dx, dy]) => inCell(c.x, c.y, () => clampPt(c.x + dx, c.y + dy, d0.w, d0.h)));
      }
      for (let i = 0; i < n; i++) {
        const name = a.name != null ? String(a.name) + (i > 0 ? String(i + 1) : '') : W.nextName(shape);
        if (!/^[A-Za-z_][\w-]*$/.test(name)) throw new SOPError(`"${name}" can't be a name: use letters, digits, - or _ and start with a letter.`);
        if (W.find(name)) throw new SOPError(`There is already a shape named "${W.find(name).name}".`);
        if (W.findGroup(name)) throw new SOPError(`"${W.findGroup(name).name}" is already the name of a group.`);
        const size = CS.sizePx && !props.size ? CS.sizePx : SIZE_PX[props.size || 'medium'], box = Object.assign(boxArgs(a, shape), CS.box || {}), d = dims(Object.assign({ shape, size }, box));
        let p;
        if (block) p = block[i];
        else if (CS.place) p = CS.place(i, d.w, d.h);
        else if (i > 0) { const chain = a.position === 'leftOf' ? 'leftOf' : a.position === 'above' ? 'above' : a.position === 'below' && !a.anchor ? 'rightOf' : 'rightOf'; p = relSpot(W, d.w, d.h, a.position === 'below' || a.position === 'above' ? 'rightOf' : chain, [prev], null, []); }
        else { p = placeFor(W, a, d.w, d.h, []); const u = unmetText(name, p); if (u) answer = u; }
        ctx.emit({ op: 'add', shape: Object.assign({ name, shape, size, color: props.color || 'white', outline: props.outline && props.outline !== 'none' ? props.outline : null, label: a.label != null ? String(a.label) : null, x: p.x, y: p.y }, box) });
        made.push(name); prev = W.find(name);
        for (const l of names(a.linked)) { const t = need(W, l); ctx.emit({ op: 'link', edge: W.newEdge(t.name, name) }); }
      }
      if (block) notes.push(`${a.layout} layout`);
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
      if (a.fill) base.fill = a.fill === 'solid' ? null : a.fill;
      if (a.layer) base.layer = a.layer === 'item' ? null : a.layer;
      let scale = a.scale != null ? +a.scale : null;
      if (a.action === 'resize' && scale == null && !a.size && a.width == null && a.height == null) scale = 1.5;
      if (!Object.keys(base).length && scale == null && a.width == null && a.height == null) throw new SOPError(`What should change about ${listing(t)}? Try a color, size, shape, outline or label.`);
      for (const n of t) {
        const s = need(W, n), p = Object.assign({}, base);
        if (base.shape && (base.shape === 'text') !== (s.shape === 'text')) throw new SOPError(s.shape === 'text' ? `${s.name} is a text; a text can't become a ${base.shape}. Draw a ${base.shape} and delete the text.` : `${s.name} is a shape; it can't become a text. To write on it, label it: label ${s.name} "…".`);
        if (scale != null) { p.size = Math.round(Math.min(160, Math.max(22, s.size * scale))); if (s.w) { p.w = Math.round(Math.min(1600, Math.max(10, s.w * scale))); p.h = Math.round(Math.min(1000, Math.max(10, s.h * scale))); } }
        else if (a.size && s.w && s.shape !== 'text') { p.w = null; p.h = null; }   /* a size name replaces an explicit box */
        if (a.width != null || a.height != null) { const d0 = dims(s); p.w = Math.max(10, Math.round(+(a.width != null ? a.width : d0.w))); p.h = Math.max(10, Math.round(+(a.height != null ? a.height : d0.h))); }
        ctx.emit({ op: 'set', name: s.name, props: p });   /* a restyle never moves anything (scenes_r3 engine findings 1-2: a recoloured panel or a part of a character used to jump away from what it touched) */
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
      for (const n of expandGroups(ctx.world, t)) ctx.emit({ op: 'set', name: need(ctx.world, n).name, props: { label: String(a.label) === '' ? null : String(a.label) } });   // label="" removes the label
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
          ctx.emit({ op: 'add', shape: Object.assign({ name, shape: s.shape, size: s.size, color: a.color || s.color, outline: s.outline, label: s.label, x: p.x, y: p.y }, s.w && s.h ? { w: s.w, h: s.h } : {}, s.fill ? { fill: s.fill } : {}, s.layer ? { layer: s.layer } : {}, s.font ? { font: s.font } : {}) });   /* the copy keeps the explicit box, fill and layer (scenes_r3 engine finding 4) */
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
  description: 'Arrows and lines between shapes, with style, direction, color and label; the label of an existing arrow can be set, changed, removed and asked about.',
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
        const seen = new Set(), all = from.concat(to).map(n => need(W, n)).filter(x => !seen.has(x) && seen.add(x));   // the order the text gives
        /* arrows join shapes: a free text or a panel (background, zone) in the list is left out of the chain ("connect all items") */
        const list = all.filter(x => x.shape !== 'text' && !isPanel(x)), skipped = all.filter(x => !list.includes(x));
        if (skipped.length && list.length >= 2) notes.push(`left out ${listing(skipped.map(x => x.name))}: arrows join shapes, not texts or zones`);
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
        for (const z of [x, y]) if (z.shape === 'text') throw new SOPError(`${z.name} is a text; arrows join shapes. Connect the shape next to it instead.`);
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
    } },
    /* the label of an existing connection: action=label with from=/to= (its ends) instead of target=; label="" removes it */
    { type: 'command', when: { action: 'label', from: true }, run: labelEdge },
    { type: 'command', when: { action: 'label', to: true }, run: labelEdge },
    { type: 'command', when: { action: 'label', kind: 'edge' }, run: labelEdge },   /* every arrow's label: "remove all the labels on the arrows" */
    /* what an existing connection says: ask=property (property=label, or color) with from=/to= */
    { type: 'question', when: { ask: 'property', from: true }, run: edgeProperty },
    { type: 'question', when: { ask: 'property', to: true }, run: edgeProperty }
  ]
};
function labelEdge(a, ctx) {
  const W = ctx.world;
  if (a.label == null) throw new SOPError('What should the arrow say? Put it in quotes, e.g. label the arrow from Start to Done "yes".');
  const text = String(a.label) === '' ? null : String(a.label);
  /* kind=edge: every arrow (or the arrows at target=); several arrows named by their ends: each of them. Removing labels, or a label for
     every arrow, applies to all of them; one new text for several named arrows asks which one */
  let es, what, both;
  if (a.kind === 'edge') {
    const t = expandGroups(W, names(a.target)).map(n => need(W, n).name);
    es = t.length ? W.state.edges.filter(e => t.includes(e.from) || t.includes(e.to)) : W.state.edges.slice(); what = t.length ? `at ${listing(t)}` : 'on the canvas'; both = false;
    if (!es.length) throw new SOPError(`There are no arrows ${what}.`);
    if (a.quantifier !== 'all' && !t.length && es.length > 1) throw new SOPError(`Which arrow? There are ${es.length}: ${shortList(es.map(edgeEnds), '; ')}. Name its two ends, or say "all the arrows".`);
  } else ({ es, what, both } = edgesNamed(W, a));
  if (es.length > 1 && text != null && a.kind !== 'edge') throw new SOPError(`There are ${es.length} arrows ${what}: ${shortList(es.map(edgeEnds), '; ')}. Which one? Name both ends, e.g. "label the arrow from ${es[0].from} to ${es[0].to} …".`);
  if (es.length > 1) {
    const ch = es.filter(e => (e.label || null) !== text);
    for (const e of ch) ctx.emit({ op: 'edgeSet', id: e.id, props: { label: text } });
    return { value: es.map(e => e.id), answer: ch.length ? (text == null ? `Removed the ${plural('label', ch.length)} of ${ch.length} ${plural('arrow', ch.length)}.` : `${ch.length} ${plural('arrow', ch.length)} now ${ch.length === 1 ? 'says' : 'say'} “${text}”.`) : (text == null ? 'Those arrows have no labels.' : `Those arrows already say “${text}”.`), highlight: { edges: es.map(e => e.id) } };
  }
  const e = es[0];
  const other = both ? W.state.edges.find(x => x !== e && x.from === e.to && x.to === e.from) : null;
  const also = other ? ` There is also an arrow ${edgeEnds(other)}; say “the arrow from ${other.from} to ${other.to}” for that one.` : '';
  if ((e.label || null) === text) return { value: [e.id], notes: [text == null ? `${edgeEnds(e)} already has no label` : `${edgeEnds(e)} already says "${text}"`], highlight: { edges: [e.id] } };
  ctx.emit({ op: 'edgeSet', id: e.id, props: { label: text } });
  return { value: [e.id], answer: (text == null ? `Removed the label of the arrow ${edgeEnds(e)}.` : `The arrow ${edgeEnds(e)} now says “${text}”.`) + also, highlight: { edges: [e.id] } };
}
function edgeProperty(a, ctx) {
  const W = ctx.world, { es } = edgesNamed(W, a), prop = a.property || 'label';
  const say = e => prop === 'color' ? `The arrow ${edgeEnds(e)} is ${e.color || 'black (the default)'}` : prop === 'label' ? (e.label ? `The arrow ${edgeEnds(e)} says “${e.label}”` : `The arrow ${edgeEnds(e)} has no label`) : edgeText(e);
  return { value: es.map(e => prop === 'color' ? e.color || null : prop === 'label' ? e.label || null : edgeText(e)), answer: es.map(say).join('; ') + '.', highlight: { shapes: [...new Set(es.flatMap(e => [e.from, e.to]))], edges: es.map(e => e.id) } };
}

/* a background or a zone never takes part in a row, grid, alignment or spacing with ordinary items (it holds them); alone it does */
const itemsOnly = list => list.some(s => !isPanel(s)) ? list.filter(s => !isPanel(s)) : list;

/* ---------- high-level layout operations (training/sketch/ops/HIGH_LEVEL_OPS.md; geometry and quality score: docs/js/auto-layout.js) ---------- */
const autoLayout = () => AutoLayoutModule;
const EDGE_PX = { tiny: 1, small: 1.5, medium: 2, large: 3.5, huge: 5 };   /* the stroke width of an arrow per size value (ui.js draws e.width) */
const inThisCell = s => { const c = cellOf(s.x, s.y); return c.x === FR.x && c.y === FR.y; };
/* the name tag ui.js draws above a shape (11 px text, 7 px above its body, 12 px when highlighted) is part of the shape's box in a re-layout,
   so that no layout puts a shape's name on another shape or text: the box grows by TAG_PX upwards (centre moved up by half of it) */
const TAG_PX = 22;
const hasTag = s => s.shape !== 'text' && !s.quiet && !isPanel(s);
/** the shapes of the drawing's cell as AutoLayout input (background panels and zones are left out: shapes may sit on them; with panels =
 *  true they are in, for a layout of panels only). dy = how far the box's centre lies above the shape's own centre (its name tag) */
const alShapes = (W, panels, noTags) => W.state.shapes.filter(s => (panels || !isPanel(s)) && inThisCell(s)).map(s => { const d = dims(s), t = hasTag(s) && !noTags ? TAG_PX : 0; return { name: s.name, x: s.x, y: s.y - t / 2, w: d.w, h: d.h + t, dy: t / 2, color: s.color, shape: s.shape, size: s.size, label: s.label, outline: s.outline }; });
const alLinks = (W, shapes) => { const here = new Set(shapes.map(s => s.name)); return W.state.edges.filter(e => here.has(e.from) && here.has(e.to)).map(e => ({ from: e.from, to: e.to, arrow: e.arrow, label: e.label || undefined })); };
/* ---------- zones and free texts in a re-layout (design: training/sketch/ops/HIGH_LEVEL_OPS.md section 2, "Zones and free texts") ----------
   A re-layout lays out the shapes it is given as ONE set, whatever zone they are on: "arrange all in a circle" is one circle. On the whole
   drawing (no target, "all", "everything") the free texts (titles, captions) are not part of the set: they stay where they are, the layout
   keeps off them where it can, and a text a shape still lies on moves aside, as little as it can. A zone (layer=zone) holds the shapes whose centre lies on it (the topmost zone
   there); the reply names the shapes the layout took off their zone, unless the zones were fitted round their own shapes (fitZones). */
const zoneBox = z => { const d = dims(z); return { x: z.x - d.w / 2, y: z.y - d.h / 2, w: d.w, h: d.h }; };
const zonesHere = W => W.state.shapes.filter(s => s.layer === 'zone' && inThisCell(s));
/** the zone a point (a shape's centre) lies on: the topmost one, or null */
function zoneAt(zones, x, y) { for (let i = zones.length - 1; i >= 0; i--) { const b = zoneBox(zones[i]); if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return zones[i]; } return null; }
/** runs an AutoLayout operation on the targets (group names expanded; no target = every shape of the drawing's cell, also for
 *  target=mention(quantifier=all)), in the cell of the first target, and emits the new positions. LayoutError -> Clarify when it asks
 *  (no links for a tree, a loop, ...), else SOPError. how.relayout = true: a re-layout, where on the whole drawing the free texts stay and
 *  move aside only when a shape now lies on them (above); how.tags = false: the shapes' own boxes, without their name tags (snap puts the
 *  shapes' own centres on the grid). -> the AutoLayout result, with r.zoneNote = what the reply says about zones and texts */
function alRun(W, a, ctx, fn, how) {
  const AL = autoLayout(); if (!AL) throw new SOPError('The layout module (auto-layout.js) is not loaded.');
  const t = expandGroups(W, names(a.target)).map(n => need(W, n).name), first = t.length ? W.find(t[0]) : null;
  const panelsOnly = t.length > 0 && t.every(n => isPanel(W.find(n))), relayout = !!(how && how.relayout);
  const go = () => {
    const shapes = alShapes(W, panelsOnly, how && how.tags === false), links = alLinks(W, shapes), here = new Set(shapes.map(s => s.name)), dy = new Map(shapes.map(s => [s.name, s.dy]));
    const targets = t.filter(n => here.has(n)), whole = targets.length === shapes.length || !t.length;
    const canvas = { x: FR.x, y: FR.y, w: CANVAS.W, h: CANVAS.H }, groups = (W.state.groups || []).map(g => ({ name: g.name, members: g.members.slice() }));
    const call = (sh, opts) => {
      try { return fn(AL, sh, links, Object.assign({ canvas, groups }, opts)); }
      catch (e) { if (e && e.name === 'LayoutError') throw (e.ask ? new Clarify(e.message, { wire: ctx.node.id, code: e.code }) : new SOPError(e.message)); throw e; }
    };
    const zones = zonesHere(W), homeOf = n => { const s = W.find(n); return zoneAt(zones, s.x, s.y); }, homes = new Map(shapes.filter(s => !isPanel(W.find(s.name))).map(s => [s.name, homeOf(s.name)]));
    const isText = s => W.find(s.name).shape === 'text', texts = relayout && whole && !panelsOnly && shapes.some(s => !isText(s)) ? shapes.filter(isText) : [];
    const r = call(shapes, { targets: texts.length ? shapes.filter(s => !isText(s)).map(s => s.name) : targets.length && !whole ? targets : null });   // the texts are obstacles: the layout keeps off them where it can
    let aside = [], moves = [];
    if (texts.length) {   /* the texts a shape now lies on move aside (the shapes stay fixed); the others stay where they are */
      const now = shapes.map(s => Object.assign({}, s, (r.positions || {})[s.name] || {})), over = (p, q) => Math.abs(p.x - q.x) < (p.w + q.w) / 2 && Math.abs(p.y - q.y) < (p.h + q.h) / 2;
      const hit = now.filter(x => isText(x) && now.some(y => y !== x && !isText(y) && over(x, y))).map(x => x.name);
      if (hit.length) { const m = AL.separate(now, links, { canvas, targets: hit }); aside = hit.filter(n => m.moved.includes(n)); moves = aside.map(n => [n, m.positions[n]]); if (m.crowded) r.crowded = true; }
    }
    for (const [n, p] of Object.entries(r.positions || {}).concat(moves)) { const s = W.find(n), y = p.y + (dy.get(n) || 0); if (s && (s.x !== p.x || s.y !== y)) ctx.emit({ op: 'set', name: s.name, props: { x: p.x, y } }); }
    if (t.length > targets.length) r.notes = (r.notes || []).concat([`${t.length - targets.length} of the shapes ${t.length - targets.length === 1 ? 'is' : 'are'} in another drawing and stayed where ${t.length - targets.length === 1 ? 'it was' : 'they were'}`]);
    /* the zones follow their shapes: after a re-layout of the whole drawing, each zone is fitted round its own shapes (fitZones), so that
       a zone does not stay behind, empty, under shapes that are not its own */
    const fitted = relayout && whole && !panelsOnly && zones.length ? fitZones(W, ctx, zones, homes, aside) : null;
    /* the reply: the shapes this layout took off the zone they were on (the patches are applied as they are emitted: W holds the new
       positions), and the texts it moved aside */
    const off = new Map();
    for (const [n, z] of homes) if (z && !aside.includes(n) && homeOf(n) !== z && !(fitted && fitted.zones.length)) {   /* zones fitted: they follow their own shapes */ if (!off.has(z.name)) off.set(z.name, []); off.get(z.name).push(n); }
    const says = [...off].map(([z, ns]) => `${listing(ns)} ${ns.length === 1 ? 'is' : 'are'} no longer on ${z}.`);
    if (aside.length) says.push(`I moved the text${aside.length === 1 ? '' : 's'} ${listing(aside)} aside to make room.`);
    if (fitted && fitted.zones.length) says.push(`I fitted ${listing(fitted.zones)} to ${fitted.zones.length === 1 ? 'its' : 'their'} shapes${fitted.captions.length ? ` and moved the text${fitted.captions.length === 1 ? '' : 's'} ${listing(fitted.captions)} aside with ${fitted.zones.length === 1 ? 'it' : 'them'}` : ''}.`);
    if (says.length) r.zoneNote = says.join(' ');
    return r;
  };
  return first ? inCell(first.x, first.y, go) : go();
}
/** fitZones: after a re-layout of the whole drawing, every zone is fitted round its own shapes, and its caption moves with it (same place
 *  above the shapes as before). A zone's own shapes: the items of the group the zone is in (the opening drawing: IntakeZone with Start and
 *  Process), else the items that were on it before the layout; its caption: the free text of that group, else the text that lay in its top
 *  band. Done only when it is clean for every zone at once: the fitted zones do not overlap one another, cover no other item (body or name
 *  tag), stay on the canvas, and no caption lands on an item or a text; otherwise the zones stay as they were (the reply then names the
 *  shapes taken off their zone). A zone with no shape of its own left is not changed. Decision (2026-11-03, owner's session): a re-layout
 *  of the whole drawing is ONE layout of the items across the zones (an asked circle is one circle); the zones then follow the items
 *  rather than the items being kept inside the zones, so no empty zone is left covering the drawing. -> {zones, captions} fitted, or null */
function fitZones(W, ctx, zones, homes, aside) {
  const items = W.state.shapes.filter(s => !isPanel(s) && s.shape !== 'text' && inThisCell(s)), texts = W.state.shapes.filter(s => s.shape === 'text' && inThisCell(s));
  const boxOf = s => { const d = dims(s), t = hasTag(s) ? TAG_PX : 0; return { x1: s.x - d.w / 2, y1: s.y - d.h / 2 - t, x2: s.x + d.w / 2, y2: s.y + d.h / 2 }; };
  const hit = (p, q, pad) => Math.min(p.x2, q.x2) - Math.max(p.x1, q.x1) > -(pad || 0) && Math.min(p.y2, q.y2) - Math.max(p.y1, q.y1) > -(pad || 0);
  const PAD = 18, plan = [];
  for (const z of zones) {
    const g = W.groupOf(z.name), zb0 = zoneBox(z);
    const own = g ? items.filter(s => g.members.includes(s.name)) : items.filter(s => homes.get(s.name) === z);
    if (!own.length) continue;
    const cap = (g ? texts.filter(t => g.members.includes(t.name)) : texts.filter(t => t.x >= zb0.x && t.x <= zb0.x + zb0.w && t.y >= zb0.y && t.y <= zb0.y + 40))[0] || null;
    const bs = own.map(boxOf), b = { x1: Math.min(...bs.map(q => q.x1)), y1: Math.min(...bs.map(q => q.y1)), x2: Math.max(...bs.map(q => q.x2)), y2: Math.max(...bs.map(q => q.y2)) };
    const top = cap ? dims(cap).h + 10 : 0, capW = cap ? dims(cap).w : 0;
    let x1 = b.x1 - PAD, x2 = b.x2 + PAD; if (x2 - x1 < capW + 16) { const m = (x1 + x2) / 2; x1 = m - (capW + 16) / 2; x2 = m + (capW + 16) / 2; }
    const nb = { x1, y1: b.y1 - PAD - top, x2, y2: b.y2 + PAD };
    const capAt = cap ? { x: Math.round((nb.x1 + nb.x2) / 2), y: Math.round(nb.y1 + PAD / 2 + dims(cap).h / 2 + 2) } : null;
    plan.push({ z, own, cap, nb, capAt });
  }
  if (!plan.length) return null;
  const C = { x1: FR.x, y1: FR.y, x2: FR.x + CANVAS.W, y2: FR.y + CANVAS.H }, why = () => null;   /* the reason is kept in the call for reading the code */
  for (const p of plan) {
    p.nb = { x1: Math.max(C.x1 + 2, p.nb.x1), y1: Math.max(C.y1 + 2, p.nb.y1), x2: Math.min(C.x2 - 2, p.nb.x2), y2: Math.min(C.y2 - 2, p.nb.y2) };   /* the padding gives way at the canvas edge */
    if (p.cap) p.capAt = { x: Math.round((p.nb.x1 + p.nb.x2) / 2), y: p.capAt.y };
    if (plan.some(q => q !== p && hit(p.nb, q.nb, 4))) return why('zones overlap ' + p.z.name);
    if (items.some(s => !p.own.includes(s) && hit(boxOf(s), p.nb, 2))) return why('covers ' + items.filter(s => !p.own.includes(s) && hit(boxOf(s), p.nb, 2)).map(s => s.name) + ' ' + p.z.name);
    if (p.cap) { const d = dims(p.cap), cb = { x1: p.capAt.x - d.w / 2, y1: p.capAt.y - d.h / 2, x2: p.capAt.x + d.w / 2, y2: p.capAt.y + d.h / 2 };
      if (items.some(s => hit(boxOf(s), cb, 2)) || texts.some(t => t !== p.cap && !plan.some(q => q.cap === t) && hit(boxOf(t), cb, 2))) return why('caption ' + p.cap.name); }
  }
  const out = { zones: [], captions: [] };
  for (const p of plan) {
    const w = Math.round(p.nb.x2 - p.nb.x1), h = Math.round(p.nb.y2 - p.nb.y1), x = Math.round((p.nb.x1 + p.nb.x2) / 2), y = Math.round((p.nb.y1 + p.nb.y2) / 2), d = dims(p.z);
    if (p.z.x !== x || p.z.y !== y || d.w !== w || d.h !== h) { ctx.emit({ op: 'set', name: p.z.name, props: { x, y, w, h } }); out.zones.push(p.z.name); }
    if (p.cap && (p.cap.x !== p.capAt.x || p.cap.y !== p.capAt.y)) { ctx.emit({ op: 'set', name: p.cap.name, props: { x: p.capAt.x, y: p.capAt.y } }); out.captions.push(p.cap.name); }
  }
  return out;
}
/** edgeRoutes(state): how ui.js should draw each arrow so that it passes through no shape, name tag or free text (AutoLayout.routeEdges):
 *  {edgeId: {points: [{x, y}] (the bends; [] = straight), label: {x, y} | null (the centre of its label, where no box or earlier label
 *  is)}}. Computed from the state on every render (nothing stored: a route can never be stale after a move). Panels (background, zones)
 *  are not obstacles. Without auto-layout.js loaded: {} (ui.js then draws straight lines, as before). */
function edgeRoutes(state) {
  const AL = autoLayout(); if (!AL || !AL.routeEdges || !state.edges.length) return {};
  const items = state.shapes.filter(s => !isPanel(s)), shapes = items.map(s => { const d = dims(s); return { name: s.name, x: s.x, y: s.y, w: d.w, h: d.h }; });
  const tags = items.filter(hasTag).map(s => Object.assign({ of: s.name }, tagBox(s)));
  try { return AL.routeEdges(shapes, state.edges.map(e => ({ id: e.id, from: e.from, to: e.to, label: e.label })), { obstacles: tags }).routes; } catch (e) { return {}; }
}
const alSays = (r, what) => what + (r.crowded ? ' They do not all fit on the canvas without touching.' : '') + (r.zoneNote ? ' ' + r.zoneNote : '');
/** the existing arrows a restyle / reverse wire names: from= / to= (edgesNamed), else the arrows touching target=, else every arrow */
function edgesOf(W, a) {
  if (a.from != null || a.to != null) return edgesNamed(W, a).es;
  const t = expandGroups(W, names(a.target)).map(n => need(W, n).name);
  const es = t.length ? W.state.edges.filter(e => t.includes(e.from) || t.includes(e.to)) : W.state.edges.slice();
  if (!es.length) throw new SOPError(t.length ? `There are no arrows at ${listing(t)}.` : 'There are no arrows on the canvas.');
  return es;
}
function restyleEdges(a, ctx) {
  const W = ctx.world, es = edgesOf(W, a), props = {};
  if (a.style) props.style = a.style;
  if (a.color) props.color = a.color;
  if (a.arrow) props.arrow = a.arrow;
  if (a.size) props.width = EDGE_PX[a.size];
  const grow = a.action === 'resize' ? (a.scale != null ? +a.scale : 1.5) : null;
  if (!Object.keys(props).length && grow == null) throw new SOPError('What should change about the arrow? Try dashed, dotted, solid, a colour, two-way, no arrowhead, thicker or thinner.');
  let n = 0;
  for (const e of es) {
    const p = Object.assign({}, props); if (grow != null) p.width = Math.round(Math.min(8, Math.max(1, (e.width || 2) * grow)) * 10) / 10;
    if (Object.keys(p).every(k => e[k] === p[k])) continue;
    ctx.emit({ op: 'edgeSet', id: e.id, props: p }); n++;
  }
  return { value: es.map(e => e.id), answer: n ? `Changed ${n === 1 ? 'the arrow ' + edgeEnds(es[0]) : n + ' arrows'}.` : `The ${es.length === 1 ? 'arrow already looks' : 'arrows already look'} like that.`, highlight: { edges: es.map(e => e.id) } };
}

const opsPlugin = {
  name: 'ops', title: 'Layout operations',
  description: 'Re-lay out existing shapes by their links (tree, layers, radial, organic, or the layout that fits them), improve the layout by a measured score, more or less space, snap to the grid, flip, sort, cluster, make the same, straighten links, untangle crossings, fit on the canvas; restyle and reverse existing arrows.',
  legend: {
    action: { values: {
      improve: ['improve', 'tidy', 'tidy up', 'tidyup', 'neaten', 'declutter', 'unclutter', 'clean up', 'cleanup', 'beautify', 'prettify'],
      respace: ['compact', 'condense', 'squeeze', 'tighten'],
      snap: ['snap'], flip: ['flip', 'mirror'], reverse: ['reverse', 'invert'], sort: ['sort', 'alphabetize', 'alphabetise'], groupBy: [],
      equalize: ['equalize', 'equalise', 'unify'], straighten: ['straighten'], untangle: ['untangle', 'disentangle', 'uncross'], fit: ['fit', 'recenter', 'recentre', 're-center', 're-centre']
    } },
    layout: { values: {
      tree: ['tree', 'hierarchy', 'hierarchical', 'org chart', 'organization chart', 'organisation chart', 'organigram'],
      layers: ['layers', 'layered', 'flow', 'flowchart', 'flow chart', 'tiers', 'levels'],
      radial: ['radial', 'radially', 'sunburst', 'concentric', 'mind map', 'hub and spokes'],
      organic: ['organic', 'force-directed', 'force directed', 'spring']
    } },
    property: { values: { name: ['alphabetical', 'alphabetically'] } }
  },
  handlers: [
    { type: 'command', when: { action: 'improve' }, run(a, ctx) {
      const r = alRun(ctx.world, a, ctx, (AL, sh, ln, o) => { if (!sh.length) throw new SOPError('There is nothing to improve: the canvas is empty.'); return AL.improve(sh, ln, o); }, { relayout: true });
      return { value: Object.keys(r.positions), notes: (r.notes || []).concat(r.candidates.map(c => `${c.name}: ${c.score}`)), answer: alSays(r, r.message) };
    } },
    { type: 'command', when: { action: 'respace' }, run(a, ctx) {
      /* comparison = bigger (more space) | smaller (less space); scale = how much (a factor; default 1.5 / 0.67); distance = a gap in px */
      let f = a.scale != null ? +a.scale : null;
      if (a.comparison === 'smaller') f = f == null ? 0.67 : f > 1 ? 1 / f : f; else if (a.comparison === 'bigger') f = f == null ? 1.5 : f < 1 ? 1 / f : f;
      if (f == null && a.distance == null) throw new SOPError('More space or less space between the shapes?');
      const r = alRun(ctx.world, a, ctx, (AL, sh, ln, o) => AL.spacing(sh, ln, Object.assign(o, { scale: f != null ? f : undefined, distance: a.distance != null && f == null ? +a.distance : undefined })), { relayout: true });
      return { value: Object.keys(r.positions), notes: r.notes, answer: alSays(r, r.scale >= 1 ? `More space between the shapes (x${r.scale}).` : `Less space between the shapes (x${r.scale}).`) };
    } },
    { type: 'command', when: { action: 'snap' }, run(a, ctx) {
      const r = alRun(ctx.world, a, ctx, (AL, sh, ln, o) => AL.snap(sh, ln, Object.assign(o, { grid: a.distance != null ? +a.distance : 20 })), { tags: false });   /* the shapes' own centres on the grid */
      return { value: r.moved, notes: r.notes, answer: `Snapped ${r.moved.length} shape${r.moved.length === 1 ? '' : 's'} to the ${r.grid} px grid.` };
    } },
    { type: 'command', when: { action: 'flip' }, run(a, ctx) {
      const r = alRun(ctx.world, a, ctx, (AL, sh, ln, o) => AL.flip(sh, ln, Object.assign(o, { axis: a.axis })), { relayout: true });
      return { value: Object.keys(r.positions), notes: r.notes, answer: alSays(r, a.axis === 'vertical' ? 'Flipped top to bottom.' : 'Flipped left to right.') };
    } },
    { type: 'command', when: { action: 'sort' }, run(a, ctx) {
      const r = alRun(ctx.world, a, ctx, (AL, sh, ln, o) => AL.sort(sh, ln, Object.assign(o, { property: a.property || 'name', descending: a.superlative === 'biggest', layout: a.layout })), { relayout: true });
      return { value: r.order, notes: r.notes, answer: alSays(r, `Sorted by ${a.property || 'name'}: ${r.order.join(', ')}.`) };
    } },
    { type: 'command', when: { action: 'groupBy' }, run(a, ctx) {
      const r = alRun(ctx.world, a, ctx, (AL, sh, ln, o) => AL.cluster(sh, ln, Object.assign(o, { property: a.property || 'color' })), { relayout: true });
      return { value: Object.keys(r.positions), notes: r.notes, answer: alSays(r, `Gathered the shapes by ${a.property || 'color'}: ${r.clusters.join(', ')}.`) };
    } },
    { type: 'command', when: { action: 'equalize' }, run(a, ctx) {
      const W = ctx.world, p = a.property || 'size';
      if (!['size', 'color', 'shape', 'outline'].includes(p)) throw new SOPError(`I can make the size, colour, shape or outline the same, not the ${p}.`);
      const like = a.anchor != null ? need(W, names(a.anchor)[0]).name : undefined;
      const r = alRun(W, a, ctx, (AL, sh, ln, o) => AL.equalize(sh, ln, Object.assign(o, { property: p, like })));
      for (const [n, props] of Object.entries(r.props)) ctx.emit({ op: 'set', name: n, props });
      if (p === 'size' || p === 'shape') alRun(W, a, ctx, (AL, sh, ln, o) => AL.separate(sh, ln, o));   /* bigger shapes may now overlap */
      const k = Object.keys(r.props).length;
      return { value: Object.keys(r.props), answer: k ? `Gave ${k} shape${k === 1 ? '' : 's'} the ${p} ${p === 'size' ? sizeName(r.value) : r.value}.` : `They already have the same ${p}.` };
    } },
    { type: 'command', when: { action: 'straighten' }, run(a, ctx) {
      const r = alRun(ctx.world, a, ctx, (AL, sh, ln, o) => AL.straighten(sh, ln, o), { relayout: true });
      return { value: r.moved, notes: r.notes, answer: alSays(r, r.straightened ? `Straightened ${r.straightened} link${r.straightened === 1 ? '' : 's'}.` : 'No link was nearly straight, so nothing moved; "untangle" or "tidy up" may help more.') };
    } },
    { type: 'command', when: { action: 'untangle' }, run(a, ctx) {
      const r = alRun(ctx.world, a, ctx, (AL, sh, ln, o) => AL.untangle(sh, ln, o), { relayout: true });
      return { value: r.moved, notes: r.notes, answer: alSays(r, r.swaps ? `Swapped ${r.swaps} pair${r.swaps === 1 ? '' : 's'} of shapes to reduce the crossings.` : 'Swapping shapes did not reduce the crossings; "arrange as a tree" or "in layers" may.') };
    } },
    { type: 'command', when: { action: 'fit' }, run(a, ctx) {
      const r = alRun(ctx.world, a, ctx, (AL, sh, ln, o) => AL.fit(sh, ln, Object.assign(o, { center: a.position === 'center' })));   /* not a re-layout: the drawing, texts included, moves as a whole (the reply names shapes it takes off their zone) */
      return { value: Object.keys(r.positions), notes: r.notes, answer: alSays(r, a.position === 'center' ? 'Centred the drawing on the canvas.' : r.moved.length ? 'Everything is on the canvas now.' : 'Everything was already on the canvas.') };
    } },
    { type: 'command', when: { action: 'align', direction: true }, run(a, ctx) {
      const r = alRun(ctx.world, a, ctx, (AL, sh, ln, o) => { if (!o.targets && sh.length < 2) throw new SOPError('Align needs at least two shapes.'); return AL.align(sh, ln, Object.assign(o, { direction: a.direction, clear: 24 })); }, { relayout: true });
      return { value: Object.keys(r.positions), notes: r.notes, answer: alSays(r, `Aligned the ${({ left: 'left edges', right: 'right edges', up: 'tops', down: 'bottoms' })[a.direction]}.`) };
    } },
    { type: 'command', when: { action: 'reverse' }, run(a, ctx) {
      const W = ctx.world, es = edgesOf(W, a);
      for (const e of es) ctx.emit({ op: 'edgeSet', id: e.id, props: { from: e.to, to: e.from } });
      return { value: es.map(e => e.id), answer: es.length === 1 ? `The arrow now goes ${edgeEnds(W.state.edges.find(x => x.id === es[0].id))}.` : `Reversed ${es.length} ${plural('arrow', es.length)}.`, highlight: { edges: es.map(e => e.id) } };
    } },
    /* restyle existing arrows: action=set|resize with from=/to= (one arrow by its ends) or kind=edge (every arrow, or those at target=) */
    { type: 'command', when: { action: ['set', 'resize'], from: true }, run: restyleEdges },
    { type: 'command', when: { action: ['set', 'resize'], to: true }, run: restyleEdges },
    { type: 'command', when: { action: ['set', 'resize'], kind: 'edge' }, run: restyleEdges }
  ]
};

const layoutPlugin = {
  name: 'layout', title: 'Layout',
  description: 'Align shapes along an axis or an edge, space them evenly, bring to the front or send to the back; arrange shapes as a row, column, grid, circle, tree, layers, radial or organic layout (the last four follow the links).',
  legend: {
    action: { values: { align: ['align', 'line up'], arrange: ['arrange', 'layout', 'lay out', 'organize', 'organise', 'rearrange', 're-arrange', 'relayout', 're-layout', 'reorganize', 'reorganise', 'reformat'], distribute: ['distribute', 'space', 'spread'], toFront: ['bring', 'raise'], toBack: ['send'] } },
    axis: { ask: 'Along which axis?', kind: 'enum', values: { horizontal: ['horizontally', 'in a row'], vertical: ['vertically', 'in a column'] } },
    layout: { ask: 'In what pattern?', kind: 'enum', values: { row: ['row', 'line'], column: ['column', 'stack'], grid: ['grid'], circle: ['circle', 'ring'] } }
  },
  handlers: [
    { type: 'command', when: { action: 'distribute' }, run(a, ctx) {
      /* equal gaps between neighbours (AutoLayout.distribute): never two of them overlapping; the span widens when they do not fit in it */
      const vert = a.axis === 'vertical';
      const r = alRun(ctx.world, a, ctx, (AL, sh, ln, o) => AL.distribute(sh, ln, Object.assign(o, { axis: vert ? 'vertical' : 'horizontal' })), { relayout: true });
      const n = (r.order || []).length;
      return { value: r.order, notes: (r.notes || []).concat([`spaced ${vert ? 'vertically' : 'horizontally'}, ${r.gap} px between neighbours`]), answer: alSays(r, `Spaced ${n} ${plural('shape', n)} evenly ${vert ? 'from top to bottom' : 'from left to right'}${r.gap != null ? `, ${r.gap} px apart` : ''}.`) };
    } },
    { type: 'command', when: { action: ['toFront', 'toBack'] }, run(a, ctx) {
      const W = ctx.world, t = targetsOf(W, a, a.action === 'toFront' ? 'bring to the front' : 'send to the back');
      for (const n of a.action === 'toBack' ? t.slice().reverse() : t) ctx.emit({ op: 'reorder', name: need(W, n).name, to: a.action === 'toFront' ? 'front' : 'back' });   // several shapes (a group) keep their own order
      return { value: t };
    } },
    { type: 'command', when: { action: 'align' }, run(a, ctx) {
      /* the centres on one line through the first shape named (AutoLayout.align); shapes that would overlap are pushed apart along it */
      const W = ctx.world, t = targetsOf(W, a, 'align'), vert = a.axis === 'vertical';
      if (t.length < 2) throw new SOPError('Align needs at least two shapes.');
      const r = alRun(W, a, ctx, (AL, sh, ln, o) => AL.align(sh, ln, Object.assign(o, { axis: vert ? 'vertical' : 'horizontal', base: (o.targets || t).find(n => sh.some(s => s.name === n)), clear: 24 })), { relayout: true });
      return { value: Object.keys(r.positions), notes: r.notes, answer: alSays(r, `Lined them up ${vert ? 'in a column' : 'in a row'}.`) };
    } },
    { type: 'command', when: { action: 'arrange' }, run(a, ctx) {
      /* layout = row | column | grid | circle | tree | layers | radial | organic; no layout: axis -> row / column; direction -> the
         layout the links ask for in that direction (a row / column when the shapes are not linked); nothing -> the layout the links ask
         for (AutoLayout 'auto'). anchor = the tree root / radial centre / the shape the layers start from. */
      const W = ctx.world, root = a.anchor != null ? need(W, names(a.anchor)[0]).name : undefined;
      let kind = a.layout || (a.axis === 'vertical' ? 'column' : a.axis === 'horizontal' ? 'row' : null);
      try {
        const r = alRun(W, a, ctx, (AL, sh, ln, o) => {
          if (!sh.length) throw new SOPError('There is nothing to arrange.');
          let order;
          if (!kind && a.direction) {
            const mine = o.targets ? sh.filter(s => o.targets.includes(s.name)) : sh, an = AL.analyse(mine, ln.filter(l => mine.some(s => s.name === l.from) && mine.some(s => s.name === l.to)));
            kind = an.m ? 'auto' : (a.direction === 'left' || a.direction === 'right' ? 'row' : 'column');
            if (!an.m && (a.direction === 'left' || a.direction === 'up')) order = AL.readingOrderNames(mine).reverse();
          }
          if (['row', 'column'].includes(kind) && (a.direction === 'left' || a.direction === 'up') && !order) order = AL.readingOrderNames(o.targets ? sh.filter(s => o.targets.includes(s.name)) : sh).reverse();
          return AL.layout(kind || 'auto', sh, ln, Object.assign(o, { direction: a.direction, root, order }));
        }, { relayout: true });
        const dirW = r.direction && r.direction !== 'down' ? `, ${({ up: 'growing upwards', left: 'right to left', right: 'left to right' })[r.direction]}` : '';
        return { value: Object.keys(r.positions), notes: (r.notes || []).concat([`${r.layout} layout`]), answer: alSays(r, `Arranged ${Object.keys(r.positions).length} ${plural('shape', Object.keys(r.positions).length)} as a ${({ layers: 'layered flow', grid: 'grid', row: 'row', column: 'column', circle: 'circle', tree: 'tree', radial: 'radial layout', organic: 'free (organic) layout' })[r.layout]}${dirW}.${r.why ? ' ' + r.why : ''}`) };
      } catch (e) {
        /* a tree / radial layout of shapes that are not linked: the hierarchy / hub template's form, in the order given (templates.js) */
        const TK = templateKit();
        if (e instanceof Clarify && e.code === 'no-links' && TK && (kind === 'tree' || kind === 'radial') && names(a.target).length) {
          const h = ctx.engine.match('command', Object.assign({}, a, { template: kind === 'tree' ? 'hierarchy' : 'hub', layout: undefined }));
          const out = h.run(Object.assign({}, a, { template: kind === 'tree' ? 'hierarchy' : 'hub', layout: undefined }), ctx) || {};
          return Object.assign(out, { answer: `There are no links between them, so I used the ${kind === 'tree' ? 'hierarchy' : 'hub'} form in the order given. ${out.answer || ''}`.trim() });
        }
        /* the whole drawing as a tree / layers / radial layout, with no links at all: a tree of unlinked shapes says nothing, so a grid
           that fits the canvas, and the reply says why */
        if (e instanceof Clarify && e.code === 'no-links' && ['tree', 'layers', 'radial'].includes(kind) && !names(a.target).length) {
          const r = alRun(W, a, ctx, (AL, sh, ln, o) => AL.layout('grid', sh, ln, o), { relayout: true });
          const n = Object.keys(r.positions).length;
          return { value: Object.keys(r.positions), notes: (r.notes || []).concat(['grid layout (no links)']), answer: alSays(r, `There are no arrows or lines between the shapes, so there is no ${kind === 'layers' ? 'flow' : kind === 'radial' ? 'centre' : 'tree'} to follow: I arranged the ${n} ${plural('shape', n)} in a grid instead.`) };
        }
        throw e;
      }
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
      /* a group as the target (scenes_r3 engine finding 7): its box for positions, regions and sizes compared, every member for colour, kind and size */
      const W = ctx.world, t0 = needTargets(a, 'check')[0], grp = !W.find(t0) && W.findGroup && W.findGroup(t0), s = grp ? needAnchor(W, t0) : need(W, t0), checks = [];
      if (grp) {
        const ms = grp.members.map(n => W.find(n)).filter(Boolean), all = (f, v) => ms.length && ms.every(m => f(m) === v), odd = (f, v) => ms.filter(m => f(m) !== v).map(m => m.name);
        if (a.color) checks.push([all(m => m.color, a.color), all(m => m.color, a.color) ? `every shape of ${s.name} is ${a.color}` : `${listing(odd(m => m.color, a.color))} in ${s.name} ${odd(m => m.color, a.color).length > 1 ? 'are' : 'is'} not ${a.color}`]);
        if (a.shape && a.shape !== 'any') checks.push([all(m => m.shape, a.shape), `${all(m => m.shape, a.shape) ? 'every' : 'not every'} shape of ${s.name} is a ${a.shape}`]);
        if (a.size) checks.push([all(m => sizeName(m.size), a.size), `${all(m => sizeName(m.size), a.size) ? 'every' : 'not every'} shape of ${s.name} is ${a.size}`]);
      } else {
      if (a.color) checks.push([s.color === a.color, `${s.name} is ${s.color}`]);
      if (a.shape && a.shape !== 'any') checks.push([s.shape === a.shape, `${s.name} is a ${s.shape}`]);
      if (a.size) checks.push([sizeName(s.size) === a.size, `${s.name} is ${sizeName(s.size)}`]);
      }
      if (a.outline && !grp) checks.push([(s.outline || 'none') === a.outline, s.outline ? `${s.name} has a ${s.outline} outline` : `${s.name} has no outline`]);
      for (const [pk, ak] of [['position', 'anchor'], ['position2', 'anchor2']]) if (a[pk] && a[ak] && !SPOTS[a[pk]]) { const anc = names(a[ak]).map(n => needAnchor(W, n)); const ok = relHolds(s, a[pk], anc); checks.push([ok, `${s.name} is ${ok ? '' : 'not '}${POS_WORDS[a[pk]]} ${listing(anc.map(x => x.name))}`]); }
      for (const sp of [a.position, a.position2, a.region]) if (sp && SPOTS[sp]) { const ok = inSpot(s, sp); checks.push([ok, `${s.name} is ${ok ? '' : 'not '}in the ${camelWords(sp)}`]); }
      if (a.comparison && a.anchor) { const o = needAnchor(W, names(a.anchor)[0]), A = dims(s).w * dims(s).h, B = dims(o).w * dims(o).h; const ok = a.comparison === 'bigger' ? A > B : A < B; checks.push([ok, `${s.name} covers ${A} px² and ${o.name} covers ${B} px²`]); }
      if (!checks.length) return { value: true, answer: grp ? `${s.name} is a group of ${listing(grp.members)} in the ${region(s)}.` : describeShape(s) + '.', highlight: { shapes: grp ? grp.members.slice() : [s.name] } };
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
const REL_NAMES = ['leftOf', 'rightOf', 'above', 'below', 'near', 'inside', 'onTop'];
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
      /* layer= / label=, or a kind while panels are on the canvas (a description by kind leaves them out): the JS handlers (filterShapes) */
      if (a.layer || (a.label != null && a.label !== '') || (a.shape && W.state.shapes.some(isPanel))) return ctx.engine.fallback('question', a, ctx, this);
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
      const W = ctx.world, t0 = needTargets(a, 'check')[0];
      if (!W.find(t0) && W.findGroup && W.findGroup(t0)) return ctx.engine.fallback('question', a, ctx, this);   // a group: the query handler (its box)
      const t = need(W, t0);
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

/* ---------- templates (docs/js/templates.js: the geometry; LEGEND_EXT.md section 3) ----------
   create template=… items=… : the template's shapes, free texts and links, placed in a free part of the drawing's cell (or the place asked
   for), emitted in z-band order as ONE wire (one undo step) and grouped under one name (its title, or Timeline1, ...); when no part of the
   cell is free, the template goes into a new frame. arrange template=… target=… : the existing shapes move to the template's item places,
   in the order given; nothing is created. The template keys and values come from TemplateKit.legend(). */
const optRequire = f => { try { return typeof require === 'function' ? require(f) : null; } catch (e) { return null; } };
const templateKit = () => TemplateKitModule;
const helpAnswers = () => null;   // the help answers are not part of this world (ui.help answers help questions)
const helpDocs = () => (typeof HelpKit !== 'undefined' ? HelpKit : null) || optRequire('./help.js');
const LAYER_OF = ['background', 'zone', null, null];
function templateBox(W, a, TK) {
  const canvas = { x: FR.x, y: FR.y, w: CANVAS.W, h: CANVAS.H }, prefer = { size: a.size };
  if (a.at && atXY(a.at)) { const [x, y] = atXY(a.at); prefer.at = [x + FR.x, y + FR.y]; }
  else if (a.position && SPOTS[a.position]) prefer.region = a.position;
  else if (a.region && SPOTS[a.region]) prefer.region = a.region;
  if (a.position && !SPOTS[a.position] && a.anchor) { const an = needAnchor(W, names(a.anchor)[0]), d = dims(an); prefer.rel = a.position; prefer.anchor = { x1: an.x - d.w / 2, y1: an.y - d.h / 2, x2: an.x + d.w / 2, y2: an.y + d.h / 2 }; }
  return { canvas, prefer };
}
function makeTemplatesPlugin(TK) {
  const paramsOf = a => ({ items: names(a.items), items2: names(a.items2), title: a.title, parents: names(a.parents), scheme: a.scheme, color: a.color, axis: a.axis, count: a.count });
  const tname = n => TK.TEMPLATES[n] ? TK.TEMPLATES[n].t.toLowerCase() : n;
  return {
    name: 'templates', title: 'Templates',
    description: 'Ready-made diagram forms (process, cycle, timeline, pyramid, heart, mountain, ...): a list of texts laid out as shapes, texts and arrows in one step, or existing shapes laid out in the form.',
    legend: TK.legend(),
    handlers: [
      { type: 'command', when: { action: 'create', template: true }, run(a, ctx) {
        const W = ctx.world, T = TK.TEMPLATES[a.template]; if (!T) throw new SOPError(`There is no template "${a.template}".`);
        const P = paramsOf(a);
        /* what a new template must not cover: every shape of the cell except a background of its own (the opening drawing's Backdrop);
           zones and other templates' backgrounds count, so two forms never sit on each other */
        const shapesHere = W.state.shapes.filter(s => !(s.layer === 'background' && !s.template) && K_SAME_CELL(s, { x: FR.x + 1, y: FR.y + 1 }));
        const obstacles = shapesHere.map(s => { const d = dims(s); return { x1: s.x - d.w / 2, y1: s.y - d.h / 2, x2: s.x + d.w / 2, y2: s.y + d.h / 2 }; });
        const { canvas, prefer } = templateBox(W, a, TK);
        let r = TK.place(a.template, P, canvas, obstacles, prefer); const notes = [];
        /* no free room (scenes_r3 engine finding 6: it used to go into a new frame, off the visible canvas): a smaller size when none was
           asked for; else on the canvas anyway, where the request says or where the template puts it, over what is there, and the reply
           says so and how to move it */
        if (!r.fits && !a.size) for (const sz of ['small', 'tiny']) { const r2 = TK.place(a.template, P, canvas, obstacles, Object.assign({}, prefer, { size: sz })); if (r2.fits) { r = r2; notes.push(`drawn ${sz} to fit in the free room`); break; } }
        if (!r.fits) {
          r = TK.place(a.template, P, canvas, [], prefer);
          notes.push(prefer.at || prefer.region || prefer.rel ? 'there was no free room there, so it is drawn over what is there' : 'there was no free room on the canvas, so it is drawn over the drawing; say where to put it (e.g. "move it to the top left") or make room');
        }
        else if (r.moved) notes.push(`the place asked for was taken, so it went to the ${camelWords(r.region)}`);
        const L = r.layout;
        if (L.crowded) throw new SOPError(`${listing(P.items.length ? P.items : ['these items'])} don't fit in a ${tname(a.template)} here; try fewer items, shorter texts, or a bigger place.`);
        const taken = W.state.shapes.map(s => s.name).concat((W.state.groups || []).map(g => g.name));
        const gname = a.name != null ? String(a.name) : TK.groupName(a.template, a.title, taken);
        if (W.find(gname) || W.findGroup(gname)) throw new SOPError(`"${gname}" is already taken.`);
        const nm = TK.nameElements(L, gname, taken.concat(gname)), made = [];
        const els = L.elements.map((e, i) => ({ e, i })).sort((p, q) => (p.e.layer - q.e.layer) || (p.i - q.i)).map(x => x.e);
        for (const e of els) {
          const sh = { name: nm.get(e.id), shape: e.kind === 'text' ? 'text' : e.shape, size: SIZE_PX[e.kind === 'text' ? (Object.entries(FONT_PX).reduce((b, [k, v]) => Math.abs(v - e.fontSize) < Math.abs(FONT_PX[b] - e.fontSize) ? k : b, 'medium')) : 'medium'], color: e.color, outline: null, label: e.label || null, x: e.x, y: e.y, quiet: true, template: gname };
          if (e.kind === 'text') sh.font = e.fontSize; else { sh.w = e.w; sh.h = e.h; }
          if (e.fill && e.fill !== 'solid') sh.fill = e.fill;
          if (LAYER_OF[e.layer]) sh.layer = LAYER_OF[e.layer];
          ctx.emit({ op: 'add', shape: sh }); made.push(sh.name);
        }
        for (const l of L.links) ctx.emit({ op: 'link', edge: W.newEdge(nm.get(l.from), nm.get(l.to), { style: l.style, arrow: l.arrow, color: l.color }) });
        ctx.emit({ op: 'group', group: { name: gname, members: made } });
        const items = L.elements.filter(e => e.role === 'item').map(e => e.text);
        return { value: made, notes: notes.concat(L.notes), answer: `Drew a ${tname(a.template)} of ${listing(items)} as the group ${gname}${notes.length ? ` (${notes.join('; ')})` : ''}${L.notes.length ? '; ' + L.notes.join('; ') : ''}.`, highlight: { shapes: made } };
      } },
      { type: 'command', when: { action: 'arrange', template: true }, run(a, ctx) {
        const W = ctx.world, T = TK.TEMPLATES[a.template]; if (!T) throw new SOPError(`There is no template "${a.template}".`);
        const list = itemsOnly(expandGroups(W, names(a.target)).map(n => need(W, n)));
        if (list.length < T.min) throw new SOPError(`A ${tname(a.template)} needs at least ${T.min} ${plural('shape', T.min)}; name them, e.g. "arrange A, B and C as a ${a.template}".`);
        const use = list.slice(0, T.max), { canvas, prefer } = inCell(use[0].x, use[0].y, () => templateBox(W, a, TK));
        const box = prefer.region ? TK.boxFor(canvas, prefer.region, a.size) : TK.boxFor(canvas, 'whole', a.size);
        const L = TK.layout(a.template, Object.assign(paramsOf(a), { items: use.map(s => s.label || s.name), items2: [] }), box);
        const slots = L.elements.filter(e => e.role === 'item').sort((p, q) => p.index - q.index);
        use.forEach((s, i) => { const d = dims(s), q = inCell(use[0].x, use[0].y, () => clampPt(slots[i].x, slots[i].y, d.w, d.h)); ctx.emit({ op: 'set', name: s.name, props: { x: q.x, y: q.y } }); });
        const left = list.length - use.length;
        return { value: use.map(s => s.name), answer: `Laid out ${listing(use.map(s => s.name))} as a ${tname(a.template)}${left ? `; a ${tname(a.template)} takes at most ${T.max}, so ${left} stayed where ${left === 1 ? 'it was' : 'they were'}` : ''}.`, highlight: { shapes: use.map(s => s.name) } };
      } }
    ]
  };
}
/* ---------- help: the help world (LEGEND_EXT.md section 4): question ask=help topic=… aspect=… about=… -> an answer from the legend ---------- */
function makeHelpPlugin(HA) {
  return {
    name: 'help', title: 'Help',
    description: 'Answers questions about the editor itself (what it can do, how, which values, an example) from the legend, the capabilities and the help pages; it never changes the drawing.',
    legend: HA.legend(),
    handlers: [{ type: 'question', when: { ask: 'help' }, run(a, ctx) {
      /* the question as written (the Rules and VSS readers keep it on the wire as src, SOP-BERT on its request as unit.src): its words choose
         the arrow form of a topic ("how do I label an arrow?"); a wire typed as SOP Lang has none */
      const n = ctx.node || {}, said = n.src || (n.unit && n.unit.src) || null;
      const TK = templateKit(), r = HA.answer(a, HA.contextFromEngine(ctx.engine, { docs: helpDocs(), templates: TK ? TK.catalogue() : [] }), said);
      return { value: { topic: r.topic, aspect: r.aspect, examples: r.examples, known: r.known }, answer: r.text, examples: r.examples };
    } }]
  };
}

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
/* the polite words before a request ("please", "kindly", "could you", "let's" ...): every step that looks for the verb at the start of a
   piece skips them (the clause reader, one clause per created object, the coordination split) */
const OPENER = "(?:please|kindly|now|then|ok(?:ay)?|so|and|also|hey|next|just|can\\s+you|could\\s+you|would\\s+you|will\\s+you|i\\s+want\\s+you\\s+to|i'd\\s+like\\s+you\\s+to|i\\s+would\\s+like\\s+you\\s+to|let's|lets|go\\s+ahead\\s+and)";
/** a regex source made case-insensitive by spelling both cases of every letter ("ab" -> "[aA][bB]"), so the regex runs WITHOUT the i flag
 *  and an escaped letter stays exact: the clause splitters write a one-letter name as "\x42" (B only, never the word "b") */
function ciSource(src) {
  let out = '', inClass = false;
  const L = c => /[A-Za-z]/.test(c);
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') { const n = src[i + 1] === 'x' ? 3 : src[i + 1] === 'u' ? 5 : 1; out += src.slice(i, i + 1 + n); i += n; continue; }   // \x42, –: hex digits copied as they are
    if (inClass) {
      if (c === ']') { inClass = false; out += c; continue; }
      if (L(c) && src[i + 1] === '-' && L(src[i + 2] || '')) { const a = c, b = src[i + 2]; out += `${a.toLowerCase()}-${b.toLowerCase()}${a.toUpperCase()}-${b.toUpperCase()}`; i += 2; continue; }
      out += L(c) ? c.toLowerCase() + c.toUpperCase() : c; continue;
    }
    if (c === '[') { inClass = true; out += c; continue; }
    out += L(c) ? `[${c.toLowerCase()}${c.toUpperCase()}]` : c;
  }
  return out;
}
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
  + 'leftmost rightmost highest lowest corner side edge row column grid ring stack dashed dotted solid plain border outline stroke yourself up down unlabel clean cleaner neat neater tidier messy mess clutter cluttered nicer prettier tree trees flow layers lay good thin thick collect chart charts '
  /* the words the formalizer's own patterns read (point(s) to, part of, written, reads, stays, relabel ...): a word the Rules read is not a
     typo (test_diagram_ops.mjs checks that no word of a pattern is corrected) */
  + 'point points pointing part parts written read reads stays note notes zone zones tones clean ray rays straight').split(' '));
const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'to', 'of', 'in', 'on', 'at', 'it', 'is', 'are', 'be', 'with', 'by', 'from', 'into', 'as', 'that', 'this', 'please', 'new', 'another']);

/* the Rules' cues of the new readers (their own, like every Rules cue; LEGEND_EXT.md section 6) */
const HELP_LEAD = /^\s*(?:(?:hi|hey|hello|ok(?:ay)?|so|um+|hmm+|please|now|also|and|then|well|alright|quick\s+question)[\s,!.:]+)*(help\b(?:\s+me\b)?(?:\s+(?:with|on))?|i\s+need\s+help\b(?:\s+(?:with|on))?|what\s+(?:else\s+)?can\s+(?:you|i|we)\s+do\b(?:\s+with)?|what\s+(?:can|could)\s+(?:you|i|we)\s+(?:draw|make|use|ask|say)\b|how\s+(?:do|can|could|should|would)\s+(?:i|we|you)\b|how\s+to\b|what(?:'s|\s+is)\s+the\s+way\s+to\b|is\s+(?:it|there\s+a\s+way)\s+(?:possible\s+)?to\b|is\s+it\s+possible\b|(?:are|r)\s+you\s+able\s+to\b|(?:do|does)\s+(?:you|it|this|the\s+editor)\s+support\b|(?:can|could)\s+(?:i|we|you|u)\b|(?:show|give)\s+me\s+(?:an?\s+|some\s+)?examples?\b(?:\s+of)?|examples?\s+of\b|what\s+(?:kinds?|types?|sorts?)\s+of\b|(?:what|which)\s+(?:colou?rs|sizes|shapes|styles|line\s+styles|templates|layouts|positions|forms|fills)\s+(?:can|could|do|are\s+(?:available|supported|possible)|exist|are\s+there\s+to\s+choose)\b|tell\s+me\s+about\b|explain\b|what\s+(?:is|are)\s+(?:a|an)\s+(?=\w+\s*$)|what\s+are\s+templates\b)/i;
const HELP_GENERIC = new Set(['add', 'make', 'put', 'draw', 'create', 'set', 'change', 'give', 'place', 'insert', 'build', 'turn', 'stick', 'pop', 'throw', 'spawn', 'sketch', 'write', 'call', 'tie', 'hook', 'attach', 'cut', 'separate', 'fill', 'push', 'drop', 'clear', 'scale', 'title', 'tag', 'send', 'bring', 'space', 'line up', 'transform', 'convert', 'reset', 'trade', 'exchange', 'pop', 'park', 'tuck', 'dissolve', 'split up', 'break up', 'stamp', 'color', 'colour']);
const HELP_FAMILY = [
  [/\b(?:arrows?|lines?|links?|connections?|edges?|connectors?)\b/, 'connections'], [/\b(?:groups|grouping)\b/, 'groups'],
  [/\b(?:texts?|titles?|headings?|headlines?|captions?|free\s+text|words|writing)\b/, 'text'], [/\b(?:bigger|smaller|larger)\b/, 'resize'],
  [/\bcolou?rs?\b|\bpalettes?\b/, 'color'], [/\bsizes?\b/, 'size'], [/\b(?:kinds?|types?|sorts?)\s+of\s+shapes?\b|\bshape\s+(?:kinds|types)\b|\bwhich\s+shapes\b|\bwhat\s+shapes\b/, 'shape'],
  [/\b(?:positions?|places?|where)\b/, 'position'], [/\b(?:line\s+)?styles?\b/, 'style'], [/\b(?:outlines?|borders?)\b/, 'outline'], [/\b(?:fills?|transparen\w*|see-through)\b/, 'fill'],
  [/\b(?:templates?|smart\s*art|diagram\s+(?:types|forms|kinds)|ready-made)\b/, 'template'], [/\b(?:layouts?|tidy|tidying)\b/, 'layout'], [/\b(?:rules?|defaults?)\b/, 'rules'],
  [/\b(?:questions?|ask)\b/, 'queries'], [/\b(?:backgrounds?|zones?|panels?|containers?|layers?)\b/, 'layer'], [/\b(?:front|back|behind|on\s+top|z-?order|overlap\w*)\b/, 'toFront']
];
const HELP_STOP = new Set(('a an the i you we u me my your our us it its is are be been do does did can could would should will how to what whats which who where when why with of in on for from at by into onto about as and or but not if then so ok okay hi hey hello please thanks just really also too very now well alright '
  + 'use using used make making made add adding draw drawing put get have has there here any some kind kinds type types sort sorts option options available possible way ways help need want like able support supported '
  + 'thing things stuff shape shapes item items element elements object objects node nodes diagram diagrams canvas drawing page editor app tool example examples show give tell explain else other another new one ones '
  + 'two both each all many much more most this that these those them they their mean means work works let lets say know quick question something anything everything nothing different same simple basic exist exists choose').split(' '));
const TPL_MOD = /^(?:simple|quick|nice|new|basic|clean|little|pretty|small|big|large|huge|tiny|vertical|horizontal|colou?rful|cute|lovely|beautiful|neat|fancy|step|stage|level|\d+-\w+)$/i;
const TPL_PLACES = [['topLeft', /\b(?:in|at|on|into)\s+the\s+(?:top|upper)[\s-]+left(?:\s+(?:corner|quarter|part))?\b/i], ['topRight', /\b(?:in|at|on|into)\s+the\s+(?:top|upper)[\s-]+right(?:\s+(?:corner|quarter|part))?\b/i], ['bottomLeft', /\b(?:in|at|on|into)\s+the\s+(?:bottom|lower)[\s-]+left(?:\s+(?:corner|quarter|part))?\b/i], ['bottomRight', /\b(?:in|at|on|into)\s+the\s+(?:bottom|lower)[\s-]+right(?:\s+(?:corner|quarter|part))?\b/i],
  ['top', /\b(?:in|at|on|along|across|into)\s+the\s+(?:top|upper)(?:\s+(?:half|part|side))?\b/i], ['bottom', /\b(?:in|at|on|along|across|into)\s+the\s+(?:bottom|lower)(?:\s+(?:half|part|side))?\b/i], ['left', /\b(?:in|at|on|into)\s+the\s+left(?:\s+(?:half|part|side))?\b/i], ['right', /\b(?:in|at|on|into)\s+the\s+right(?:\s+(?:half|part|side))?\b/i], ['center', /\b(?:in|at|into)\s+the\s+(?:center|centre|middle)\b/i]];
const ALL_SHAPES = {};   /* a template's "lay out everything as a pyramid": a mention of every shape, made when the wire is kept */
const TPL_MAKE = /\b(?:draw|make|create|build|add|sketch|lay\s*out|put\s+together|do)\s+(?:(?:me|us|quickly|please|out|up)\s+)*((?:a|an|another)\s+)?$/i;   /* no article: plural forms only ("draw rising steps of …") */
const TPL_ARR = /\b(arrange|rearrange|lay\s*out|layout|organi[sz]e|reorgani[sz]e|turn|put|place|make|order|set\s+out)\s+((?:[\w-]+[\s,&]+){1,12}?)(?:as|into|in(?:to)?|like)\s+(?:a|an)\s+$/i;
const TEXT_NOUN = /\b(?:text|texts|title|heading|headline|caption|subtitle|banner|note|words?)\b/i;

/* ---------- the Rules' reading of the high-level layout operations and of arrow restyling (training/sketch/ops/HIGH_LEVEL_OPS.md section 6) ----------
   Pure functions of the clause text. opsSkipTemplate: a re-layout that follows the links is not a template (templates.js) request.
   opsRestyle: a change to existing arrows -> 'set' | 'resize'. opsAction: the operation a clause asks for -> an action or null.
   opsArgs: the parameters of these actions, from the remaining words. */
const OPS_LAYOUT = [
  ['tree', /\b(?:trees?|hierarch(?:y|ies|ical|ically)|org(?:ani[sz]ation(?:al)?)?[\s-]*charts?|organigram|reporting\s+structure|family\s+tree)\b/i],
  ['layers', /\b(?:layers?|layered|flow[\s-]*charts?|flows?|flowing|tiers?|tiered|levels)\b/i],
  ['radial', /\b(?:radial(?:ly)?|sunburst|concentric(?:\s+(?:rings|circles))?|rings?\s+around|mind[\s-]*maps?|hub[\s-]+and[\s-]+spokes?|spokes)\b/i],
  ['organic', /\b(?:organic(?:ally)?|force[\s-]*directed|force\s+layout|spring\s+layout|physics)\b/i],
  ['row', /\b(?:in|into|as)\s+(?:a\s+|one\s+)?(?:row|line)\b/i], ['column', /\b(?:in|into|as)\s+(?:a\s+|one\s+)?(?:column|stack)\b/i],
  ['grid', /\b(?:in|into|as|on)\s+(?:a\s+)?grid\b/i], ['circle', /\b(?:in|into|as)\s+(?:a\s+)?(?:circle|ring)\b/i]
];
const opsLayoutOf = s => { for (const [v, re] of OPS_LAYOUT) if (re.test(s)) return v; return null; };
const OPS_LINK_LAYOUT = /\b(?:rings?\s+around|trees?|hierarch(?:y|ical)|org(?:ani[sz]ation(?:al)?)?[\s-]*charts?|organigram|layers?|layered|flow[\s-]*charts?|flows?|radial(?:ly)?|organic|force[\s-]*directed|spokes|mind[\s-]*maps?)\b/i;
/** the direction of a tree / layered layout. strong = false also reads horizontal (right) and vertical (down) */
function opsDirection(raw, strong) {
  const s = ' ' + raw + ' ';
  if (/\bright[\s-]+to[\s-]+left\b|\bleftwards?\b|\b(?:going|growing|flowing|pointing|running|reading)\s+(?:to\s+the\s+)?left\b|\bRL\b/i.test(s) && !/\bleft[\s-]+to[\s-]+right\b/i.test(s)) return 'left';
  if (/\bleft[\s-]+to[\s-]+right\b|\brightwards?\b|\bsideways\b|\b(?:going|growing|flowing|pointing|running|reading)\s+(?:to\s+the\s+)?right\b|\bLR\b|\bL\s*-?>\s*R\b/i.test(s)) return 'right';
  if (/\bbottom[\s-]+(?:to[\s-]+top|up)\b|\bupside[\s-]+down\b|\bupwards?\b|\b(?:going|growing|flowing|pointing|running)\s+up\b|\broots?\s+(?:at|on)\s+the\s+bottom\b|\bBT\b/i.test(s)) return 'up';
  if (/\btop[\s-]+(?:to[\s-]+bottom|down)\b|\bdownwards?\b|\b(?:going|growing|flowing|pointing|running)\s+down\b|\b(?:TD|TB)\b/i.test(s)) return 'down';
  if (!strong) {
    if (/\bhorizontal(?:ly)?\b|\b(?:root|start|source|it)\s+(?:at|on)\s+the\s+left\b|\bat\s+the\s+left\b/i.test(s)) return 'right';
    if (/\bvertical(?:ly)?\b/i.test(s) || /\b(?:root|start|source)\s+(?:at|on)\s+the\s+top\b/.test(s)) return 'down';
    if (/\b(?:root|start|source)\s+(?:at|on)\s+the\s+right\b/i.test(s)) return 'left';
  }
  return null;
}
/** a re-layout of existing shapes by their links, not a template: a link-layout word, no creation verb, no list of new items */
function opsSkipTemplate(t) {
  const s = ' ' + t + ' ';
  if (!OPS_LINK_LAYOUT.test(s)) return false;
  if (/\b(?:draw|create|build|add|sketch|insert|start|new|generate)\b|\bmake\s+(?:me\s+)?(?:a|an|one)\b/i.test(s)) return false;
  if (/\b(?:of|for|listing|showing|containing)\s+(?:⟪\d+⟫|[A-Za-z][\w-]*\s*(?:,|\band\b))/i.test(s)) return false;
  return true;
}
const OPS_EDGE = 'arrows?|lines?|edges?|links?|connections?|connectors?|wires?';
const OPS_REVERSE = { test: s => new RegExp(`\\b(?:${OPS_EDGE}|direction)\\b`, 'i').test(s) && /\b(?:reverse[sd]?|flip|invert|turn\s+(?:[\w→-]+\s+){0,6}?around|(?:switch|swap|change|flip|reverse)\s+(?:the\s+)?(?:direction|ends)|the\s+other\s+way(?:\s+(?:round|around))?|backwards?|the\s+opposite\s+(?:way|direction)|reversed)\b/i.test(s) };
/** a change to EXISTING arrows (style, colour, heads, thickness) -> 'set' | 'resize' | null */
function opsRestyle(t, act, colorRe) {
  const s = (' ' + t + ' ').replace(/\b(?:left|right|top|bottom|upper|lower|outer|far|near|canvas|page|screen)\s+edges?\b|\bedges?\s+of\s+the\s+(?:canvas|page|screen|drawing)\b/gi, ' ');
  const edge = new RegExp(`\\b(?:${OPS_EDGE}|arrow\\s*heads?)\\b`, 'i').test(s) || /→|->/.test(s);
  if (!edge || OPS_REVERSE.test(s)) return null;
  if (/^\s*(?:connect|link|join|wire|attach|hook|tie)\b/i.test(s)) return null;                                                   // a new connection
  const headAdd = /\b(?:add|put)\s+(?:an?\s+|the\s+)?arrow\s*heads?\b/i.test(s);
  if (act === 'create' && !headAdd) return null;
  if (!headAdd && new RegExp(`\\b(?:draw|add|create|insert|sketch|put|place|make)\\s+(?:an?|another|new|one|\\d+)\\s+(?:[\\w-]+\\s+){0,2}?(?:${OPS_EDGE})\\b`, 'i').test(s)) return null;
  const headOff = /\b(?:remove|delete|drop|take\s+off|get\s+rid\s+of|lose|no)\s+(?:the\s+|its\s+|their\s+|any\s+|all\s+(?:the\s+)?)?arrow\s*heads?\b|\bheadless\b/i.test(s);
  const head = headOff || /\barrow\s*heads?\b/i.test(s);
  const style = new RegExp(`\\b(?:dash(?:ed|es)?|dotted|dot\s+(?:line|style)|solid|thick|thin|bold|heavy|fat|hairline|two[\\s-]way|bidirectional|both\\s+(?:ways|ends|directions)|double[\\s-]headed|one[\\s-]way|plain|undirected|${colorRe})\\b`, 'i').test(s);
  const comp = /\b(?:thicker|thinner|bolder|heavier|lighter|fatter|wider|narrower|skinnier|finer)\b/i.test(s);
  if (!style && !comp && !head) return null;
  if (act && !['set', 'resize', 'connect', 'delete', 'disconnect', 'move', 'label', 'create'].includes(act)) return null;
  if ((act === 'delete' || act === 'disconnect') && !headOff) return null;                                                  // "delete the red arrow" deletes it
  if (act === 'label' && !style && !comp && !head) return null;
  const definite = new RegExp(`\\b(?:the|this|that|these|those|all|every|each|its|their|both|my)\\s+(?:[\\w-]+\\s+){0,3}?(?:${OPS_EDGE})\\b`, 'i').test(s) || /→|->|–|[A-Za-z0-9]-[A-Z]/.test(s) || head;
  if (!definite && act !== 'set' && act !== 'resize') return null;   // "a dotted line from A to B", "two-way arrow between A and B": a new arrow, not a restyle
  return comp && !style && !head ? 'resize' : 'set';
}
const OPS_MORE = /\b(?:more|extra|bigger|larger|wider|some|a\s+bit\s+of|a\s+little|additional)\s+(?:space|spacing|room|gaps?|distance|breathing\s+room|air|padding|whitespace|white\s+space)\b|\b(?:further|farther|wider|more)\s+apart\b|\b(?:spread|space)\s+(?:[\w']+\s+){0,3}?out\s+(?:more|a\s+(?:bit|little)(?:\s+more)?|further)\b|\bmore\s+spread\s+out\b|\b(?:increase|grow|widen|enlarge|expand|double|triple)\s+(?:the\s+)?(?:spacing|gaps?|space|distances?)\b|\btoo\s+(?:crowded|cramped|squished|squashed|tight|close(?:\s+together)?|packed|bunched(?:\s+up)?)\b|\bgive\s+(?:\w+\s+){0,3}?(?:room|space)\b|\bbreathing\s+room\b/i;
const OPS_LESS = /\b(?:less|smaller|narrower|tighter)\s+(?:space|spacing|room|gaps?|distance|padding|whitespace|white\s+space)\b|\bcloser\s+(?:together|to\s+each\s+other)\b|\bless\s+spread\s+out\b|\b(?:compact|compacter|condense|squeeze|tighten|tighter|pack)\b|\b(?:shrink|reduce|decrease|cut|narrow|halve)\s+(?:the\s+)?(?:spacing|gaps?|space|distances?|whitespace)\b|\btoo\s+(?:spread\s+out|far\s+apart|sparse|loose|spaced\s+out|much\s+(?:space|room|white\s*space|gap))\b|\bnot\s+so\s+far\s+apart\b|\bbring\s+(?:\w+\s+){0,3}?closer\b/i;
const OPS_IMPROVE = /\b(?:tidy|tidier|neaten|neater|declutter|de-clutter|unclutter|clean\s+(?:[\w']+\s+){0,3}?up|cleanup|clean-up|cleaner|beautify|prettify|prettier|nicer|improve|improved)\b|\blook(?:s|ing)?\s+(?:(?:a\s+(?:bit|lot)|much|way|far)\s+)?(?:more\s+)?(?:better|nicer|neater|cleaner|tidier|good|nice|neat|clean|tidy|professional|organi[sz]ed|less\s+messy)\b|\bless\s+(?:messy|cluttered|clutter|chaotic|busy|of\s+a\s+mess)\b|\bfix\s+(?:up\s+)?(?:the\s+|this\s+|my\s+)?(?:layout|mess|arrangement|placement|positions?|positioning)\b|\b(?:sort|straighten)\s+(?:\w+\s+)?out\s+(?:the\s+|this\s+)?mess\b|\b(?:messy|mess|cluttered|chaos|chaotic|spaghetti)\b/i;
const OPS_UNTANGLE = new RegExp(String.raw`\b(?:untangle|disentangle|uncross)\b|\bcrossings?\b|\b(?:don'?t|do\s+not|doesn'?t|won'?t|stop|no\s+longer|never|not)\s+(?:\w+\s+)?(?:cross|crossing|overlap|overlapping)\b|\bcross(?:ing)?\s+(?:each\s+other|over)\b|\btangled?\b|\b(?:${OPS_EDGE})\s+(?:\w+\s+){0,2}?(?:overlap|overlapping)\b`, 'i');
/** the operation a command clause asks for: improve, spacing, snap, flip, reverse, sort, cluster, equalize, straighten, untangle, fit,
 *  arrange (a layout word on existing shapes), align (an edge: left / right / top / bottom); null = keep the action read so far */
function opsAction(t, act) {
  const s = ' ' + t.toLowerCase() + ' ', has = re => re.test(s);   // lower case: the patterns have no i flag ("Group them by colour", "Center the diagram")
  const may = list => act == null || list.includes(act);
  const E = new RegExp(`\\b(?:${OPS_EDGE})\\b`, 'i');
  if (has(OPS_REVERSE) && may(['set', 'resize', 'swap', 'move', 'connect', 'arrange', 'flip', 'reverse', 'improve', 'create'])) return 'reverse';
  if ((has(/\bsnap\b/) || has(/\b(?:to|on|onto|with)\s+the\s+grid\b/) || has(/\bgrid[\s-]+(?:aligned|snapped)\b/)) && may(['snap', 'align', 'move', 'set', 'arrange', 'create'])) return 'snap';
  if ((has(/\bstraighten\b/) || (E.test(s) && has(/\bstraight\b/)) || has(/\bno\s+(?:more\s+)?(?:diagonal|slanted|crooked|wonky)\b/)) && may(['straighten', 'set', 'move', 'arrange', 'improve', 'align', 'connect'])) return 'straighten';
  if (has(OPS_UNTANGLE) && may(['untangle', 'set', 'move', 'arrange', 'improve', 'resize', 'connect', 'delete', 'disconnect'])) return 'untangle';
  /* group by a property before sort and equalize ("keep the same colours together", "cluster by size") */
  if ((has(/^\s*cluster\b/) || has(/\b(?:cluster|group|gather|bunch|collect)\s+(?:[\w']+\s+){0,4}?by\s+(?:their\s+)?(?:colou?rs?|shapes?|kinds?|types?|sizes?)\b/) || has(/\b(?:same|like)\s+colou?rs?\s+together\b/) || has(/\bcolou?rs?\s+together\b/)) && may(['groupBy', 'group', 'arrange', 'move', 'set', 'improve', 'connect', 'equalize', 'sort'])) return 'groupBy';
  if (has(/\b(?:equali[sz]e|even\s+out|unify)\s+(?:the\s+)?(?:spacing|gaps?|distances?)\b/) && may(['equalize', 'distribute', 'set', 'arrange', 'improve'])) return 'distribute';   /* "equalize the spacing": spacing, not size */
  if ((has(/\bsame\s+(?:size|colou?r|shape|outline|border|width|height)s?\b/) || has(/\b(?:outlines?|borders?|sizes?|colou?rs?|shapes?)\s+(?:all\s+)?the\s+same\s*(?:$|[,.!?]|\b(?:please|pls|as|too)\b)/) || has(/\b(?:equali[sz]e|unify)\b/) || has(/\bas\s+(?:big|large|small|wide|tall)\s+as\b/) || has(/\b(?:match|matching)\s+(?:the\s+)?(?:sizes?|colou?rs?)\b/)) && may(['equalize', 'set', 'resize', 'arrange', 'improve'])) return 'equalize';
  if (!has(/\bsort\s+out\b/) && (has(/\b(?:sort|alphabeti[sz]e)\b/) || has(/\b(?:order|rank)\s+(?:[\w']+\s+){0,4}?by\b/) || has(/\balphabetic(?:al)?(?:ly)?\b/) || has(/\b(?:biggest|largest|smallest|tiniest)\s+first\b/) || has(/\bby\s+(?:their\s+)?(?:names?|sizes?|labels?)\b/)) && may(['sort', 'arrange', 'align', 'move', 'set', 'improve', 'distribute'])) return 'sort';
  if ((has(/^\s*cluster\b/) || has(/\bcluster\s+(?:\w+\s+){0,4}?by\b/) || has(/\b(?:group|gather|bunch|collect|cluster|arrange|organi[sz]e|lay\s+out|put|keep|sort\s+out)\b[\s\S]*\bby\s+(?:their\s+)?(?:colou?rs?|shapes?|kinds?|types?)\b/) || has(/\b(?:same|like)\s+colou?rs?\s+together\b/) || has(/\bcolou?rs?\s+together\b/)) && may(['groupBy', 'group', 'arrange', 'move', 'set', 'improve'])) return 'groupBy';
  if ((has(OPS_MORE) || has(OPS_LESS) || has(/\b\d+\s*(?:px|pixels?)\s+apart\b/)) && may(['respace', 'distribute', 'arrange', 'set', 'create', 'move', 'resize', 'improve', 'toFront'])) return 'respace';
  if ((has(/\b(?:equal|even|same)\s+(?:spacing|gaps?|distances?)\b/) || has(/\b(?:gaps?|spacing|distances?)\s+(?:\w+\s+)?(?:equal|even)\b/) || has(/\beven\s+(?:[\w']+\s+){0,2}?out\b/)) && may(['distribute', 'set', 'arrange', 'improve'])) return 'distribute';
  if ((has(/^\s*(?:re-?)?cent(?:er|re)\b/) || has(/\bfit\b/) || has(/\b(?:into|in)\s+view\b/) || has(/\boff[\s-]+(?:the\s+)?(?:canvas|screen|page)\b/) || has(/\bback\s+(?:on|onto|into)\s+(?:the\s+)?(?:canvas|screen|page)\b/) || has(/\bcent(?:er|re)\s+(?:the\s+)?(?:whole\s+|entire\s+)?(?:diagram|drawing|everything|layout|picture|chart|graph)\b/)) && may(['fit', 'move', 'set', 'toFront', 'arrange', 'resize'])) return 'fit';
  if ((has(/\b(?:flip|mirror)\b/) || (has(/\bupside[\s-]+down\b/) && !OPS_LINK_LAYOUT.test(s))) && may(['flip', 'set', 'move', 'arrange'])) return 'flip';
  if (act === 'align' && has(/\b(?:left|right|top|bottom)\s+(?:edges?|sides?)\b|\b(?:their|the)\s+(?:tops|bottoms)\b|\b(?:left|right|top|bottom)[\s-]+align(?:ed)?\b|\balign\w*\s+(?:[\w⟦⟧,]+\s+){0,6}?(?:to\s+the\s+|on\s+the\s+|at\s+the\s+|along\s+the\s+)?(?:left|right|top|bottom)\b/)) return 'align';
  const lay = opsLayoutOf(s);
  if (act == null && has(/^\s*(?:grid|row|column|circle|ring|tree|radial|organic|layers?|flow(?:chart)?)(?:\s+(?:layout|view|style|please|pls|plz|thanks))*\s*$/)) return 'arrange';   /* "grid pls" */
  if (act == null && has(/^\s*stack\b/)) return 'arrange';                                                                 /* "stack them" */
  if (act == null && has(/^\s*lay\s+(?:[\w']+\s+){1,3}?out\b/)) return 'arrange';                                          /* "lay it out" */
  if (act == null && has(/^\s*line\s+(?:[\w']+\s+){1,3}?up\b/)) return 'align';                                             /* "line everything up" */
  if (['move', 'set'].includes(act) && has(/\b(?:put|place|make|turn|set)\s+(?:it|them|this|these|those|everything|all(?:\s+of\s+them)?|the\s+(?:[\w-]+\s+){0,2}?[\w-]+s)\s+(?:in|into|as)?\s*(?:an?\s+|one\s+)?(?:row|line|column|stack|grid|circle|ring)\b/)) return 'arrange';   /* "put them in a grid", "make it a grid" */
  if (has(OPS_IMPROVE) && !(lay && OPS_LINK_LAYOUT.test(s)) && may(['improve', 'arrange', 'set', 'resize', 'move', 'delete', 'sort'])) return lay ? 'arrange' : 'improve';
  if (lay && OPS_LINK_LAYOUT.test(s) && opsSkipTemplate(t) && may(['arrange', 'set', 'move', 'improve', 'resize'])) return 'arrange';
  if (act == null && (lay || opsDirection(t, true) || has(/\b(?:auto[\s-]?(?:layout|arrange)|automatic(?:ally)?\s+(?:layout|arrange))\b/))) return 'arrange';
  if (has(/\b(?:auto[\s-]?(?:layout|arrange)|re-?layout|automatic(?:ally)?\s+(?:layout|arrange|lay\s+out))\b/) && may(['arrange', 'set', 'improve'])) return 'arrange';
  return null;
}
/** the parameters of the operations, from the clause's words (raw: the clause as written; rest: the words left, lower case) */
function opsArgs(C, action, raw) {
  const r = ' ' + raw.toLowerCase().replace(/[’']/g, "'") + ' ', has = re => re.test(r), drop = (...ks) => ks.forEach(k => { delete C.args[k]; });
  if (C.restyle) {
    { const st = [...r.matchAll(/\b(dash(?:ed|es)?|dotted|dot\s+(?:line|style)|solid)\b/g)].pop(); if (st) C.args.style = /^dash/.test(st[1]) ? 'dashed' : st[1] === 'solid' ? 'solid' : 'dotted'; else drop('style'); }   /* the last style word: "make the dashed arrow solid" */
    if (has(/\b(?:two[\s-]way|bidirectional|both\s+(?:ways|ends|directions|sides)|double[\s-]headed|two\s+(?:arrow\s*)?heads|heads?\s+(?:at|on)\s+both)\b/)) C.args.arrow = 'both';
    else if (has(/\b(?:remove|delete|drop|take\s+off|get\s+rid\s+of|lose|no)\s+(?:the\s+|its\s+|their\s+|any\s+|all\s+(?:the\s+)?)?arrow\s*heads?\b|\bheadless\b|\bplain\s+lines?\b|\bundirected\b|\bjust\s+(?:a\s+)?lines?\b|\bwithout\s+(?:an?\s+|the\s+)?(?:arrow\s*heads?|arrows?)\b|\bno\s+arrows?\b/)) C.args.arrow = 'none';
    else if (has(/\b(?:one[\s-]way|single[\s-]headed|add\s+(?:an?\s+|the\s+)?arrow\s*heads?|put\s+(?:an?\s+|the\s+)?arrow\s*heads?|with\s+an?\s+arrow\s*head)\b/)) C.args.arrow = 'forward';
    else drop('arrow');
    if (action === 'set') { if (has(/\b(?:very|extra|really|super)\s+(?:thick|bold|heavy)\b/)) C.args.size = 'huge'; else if (has(/\b(?:thick|bold|heavy|fat)\b/)) C.args.size = 'large'; else if (has(/\b(?:thin|fine|hairline|skinny)\b/)) C.args.size = 'small'; else if (has(/\b(?:normal|regular|default)\s+(?:width|thickness)\b/)) C.args.size = 'medium'; else drop('size'); }
    else drop('size');
    /* no ends: every arrow (kind=edge); but "this / that arrow" is a reference the context fills: no kind, so the engine asks which one */
    if (C.args.from == null && C.args.to == null && !new RegExp(`\\b(?:this|that)\\s+(?:${OPS_EDGE})\\b`).test(r)) { C.args.kind = 'edge'; if (has(/\b(?:all|every|each)\b/)) C.args.quantifier = 'all'; }
    drop('target', 'shape', 'label', 'position', 'anchor', 'position2', 'anchor2', 'region', 'pairing', 'scale', 'distance');
    return;
  }
  const layoutOf = () => { const m = r.match(/\b(?:in|into|as)\s+(?:a\s+|one\s+)?(row|line|column|stack|grid|circle|ring)\b/); return m ? ({ line: 'row', stack: 'column', ring: 'circle' })[m[1]] || m[1] : null; };
  switch (action) {
    case 'arrange': {
      const lay = opsLayoutOf(r); if (lay && ['tree', 'layers', 'radial', 'organic'].includes(lay)) C.args.layout = lay;
      const linky = ['tree', 'layers'].includes(C.args.layout), d = C.args.layout === 'radial' || C.args.layout === 'organic' || C.args.layout === 'circle' || C.args.layout === 'grid' ? null : opsDirection(raw, !linky);
      if (d) C.args.direction = d;
      if (linky || C.args.direction) drop('axis');
      if (['tree', 'layers', 'radial', 'organic'].includes(C.args.layout) || C.args.direction) drop('position', 'region', 'position2', 'anchor2', 'shape', 'size', 'color');
      break;
    }
    case 'respace': {
      const lot = has(/\b(?:much|a\s+lot|way|lots|far)\s+(?:more|further|farther|wider|closer|less|tighter)\b|\b(?:double|twice)\b|\bhalf\b|\bhalve\b/);
      const bit = has(/\b(?:a\s+(?:bit|little|touch|tad)|slightly|somewhat)\b/);
      /* comparison: bigger = more space, smaller = less; scale only for an amount word (a lot / double: 2, a bit: 1.25, half: 0.5) */
      drop('scale', 'comparison');
      const less = OPS_LESS.test(r) || (!OPS_MORE.test(r) && has(/\b(?:shrink|smaller|less|half|halve)\b/));
      if (less) C.args.comparison = 'smaller'; else if (OPS_MORE.test(r) || C.args.distance == null) C.args.comparison = 'bigger';
      if (lot) C.args.scale = less ? 0.5 : 2; else if (bit) C.args.scale = less ? 0.8 : 1.25;
      drop('axis', 'layout', 'position', 'region', 'size', 'shape');
      break;
    }
    case 'fit': if (has(/\b(?:re-?)?cent(?:er|re)(?:d|s|ing)?\b|\bmiddle\b/)) C.args.position = 'center'; else drop('position'); drop('region', 'anchor', 'size', 'scale', 'layout'); break;
    case 'flip':
      if (has(/\bvertical(?:ly)?\b|\bupside[\s-]+down\b|\btop\s+(?:to|and|for)\s+bottom\b|\bbottom\s+(?:to|and)\s+top\b|\bup\s+(?:and|to)\s+down\b/)) C.args.axis = 'vertical';
      else if (has(/\bhorizontal(?:ly)?\b|\bleft\s+(?:to|and|for)\s+right\b|\bright\s+(?:to|and)\s+left\b|\bside\s+to\s+side\b|\bsideways\b/)) C.args.axis = 'horizontal';
      else drop('axis');
      drop('position', 'region', 'layout', 'direction'); break;
    case 'sort': {
      if (has(/\balphabet|\bby\s+(?:their\s+)?names?\b|\ba\s*(?:-|to)\s*z\b/)) C.args.property = 'name';
      else if (has(/\bby\s+(?:their\s+)?colou?rs?\b/)) C.args.property = 'color';
      else if (has(/\bby\s+(?:their\s+)?sizes?\b|\b(?:biggest|largest|smallest|tiniest)\s+first\b|\b(?:small|big|large)(?:est)?\s+to\s+(?:big|large|small)(?:est)?\b/)) C.args.property = 'size';
      else if (has(/\bby\s+(?:their\s+)?(?:shapes?|kinds?|types?)\b/)) C.args.property = 'shape';
      else if (has(/\bby\s+(?:their\s+)?(?:labels?|texts?)\b/)) C.args.property = 'label';
      if (has(/\b(?:biggest|largest)\s+first\b|\bdescending\b|\b(?:big|large)(?:st|r)?\s+to\s+small/)) C.args.superlative = 'biggest'; else if (has(/\b(?:smallest|tiniest)\s+first\b/)) C.args.superlative = 'smallest'; else drop('superlative');
      const l = layoutOf(); if (l) C.args.layout = l; else drop('layout');
      drop('axis', 'size', 'color', 'shape', 'position', 'region'); break;
    }
    case 'groupBy':
      if (has(/\bcolou?rs?\b/)) C.args.property = 'color'; else if (has(/\b(?:shapes?|kinds?|types?)\b/) && has(/\bby\s+(?:their\s+)?(?:shapes?|kinds?|types?)\b/)) C.args.property = 'shape'; else if (has(/\bsizes?\b/)) C.args.property = 'size';
      drop('layout', 'axis', 'color', 'shape', 'size', 'position', 'region'); break;
    case 'equalize': {
      const m = r.match(/\bsame\s+(size|colou?r|shape|outline|border|width|height)s?\b/) || r.match(/\b(?:match|matching|equali[sz]e|unify)\s+(?:the\s+|their\s+)?(size|colou?r|shape|outline|border)s?\b/) || r.match(/\b(size|colou?r|shape|outline|border)s?\s+(?:all\s+)?the\s+same\s*(?:$|[,.!?]|\b(?:please|pls|as|too)\b)/);
      if (m) C.args.property = ({ colour: 'color', border: 'outline', width: 'size', height: 'size' })[m[1]] || m[1]; else if (has(/\bas\s+(?:big|large|small|wide|tall)\s+as\b/)) C.args.property = 'size';
      drop('size', 'scale', 'layout', 'position', 'region'); if (C.args.property !== 'color') drop('color'); if (C.args.property !== 'shape') drop('shape'); break;
    }
    case 'align': {
      const m = r.match(/\b(left|right|top|bottom)s?\b|\b(tops|bottoms)\b/);
      if (m) { C.args.direction = ({ left: 'left', right: 'right', top: 'up', bottom: 'down', tops: 'up', bottoms: 'down' })[m[1] || m[2]]; drop('axis', 'position', 'region'); }
      break;
    }
    case 'reverse':
      if (C.args.from != null && C.args.to == null && !has(/\bfrom\b/)) { C.args.target = C.args.from; drop('from'); }   /* "the arrows at Hub": every arrow touching Hub */
      if (C.args.from == null && C.args.to == null && C.args.target == null && has(/\b(?:all|every|each)\b/)) C.args.quantifier = 'all'; drop('shape', 'color', 'size', 'position', 'region', 'arrow', 'style'); break;
    case 'snap': drop('layout', 'position', 'region', 'axis'); break;
    case 'straighten': case 'untangle': if (C.args.position === 'between' && C.args.anchor != null) { C.args.target = C.args.anchor; drop('anchor'); }   /* "the arrows between Start and Done" */
      // fall through
    case 'improve': drop('layout', 'position', 'region', 'axis', 'scale', 'shape', 'size', 'color'); break;
  }
}
/** a clause without a verb cue: an operation only when it is short and not a remark ("Ugh, messy.", "That's the main flow.",
 *  "I'm drawing the family tree for grandma" are not requests; "tree layout pls", "left to right", "less clutter" are) */
function opsVerbless(t, colorRe) {
  const s = ' ' + t + ' ';
  const strong = /\b(?:clean\s+(?:\w+\s+){0,2}up|tidy|neaten|declutter|untangle|straighten|snap|flip|mirror|sort|cent(?:er|re)|fit|arrange|layout|lay\s+(?:\w+\s+){0,2}out|reverse|line\s+(?:\w+\s+){0,2}up)\b/i.test(s);
  if (!strong && /\b(?:i'?m|i\s+am|we'?re|we\s+are|it'?s|that'?s|this\s+is|it\s+is|there'?s|was|were|getting|got|looks?|seems?|feels?|ugh|hmm+|lol|my|our)\b/i.test(s)) return null;
  if (s.trim().split(/\s+/).length > 14) return null;
  const rs = opsRestyle(t, null, colorRe); if (rs) return { action: rs, restyle: true };
  const a = opsAction(strong || /\b(?:fix|sort\s+out|less)\b/i.test(s) ? s : s.replace(/\b(?:messy|mess|chaotic|chaos|cluttered|spaghetti)\b/gi, ' '), null);
  return a ? { action: a } : null;
}
const OPS_WHOLE = /\b(?:(?:the|this|my|our)\s+(?:whole\s+|entire\s+|full\s+)?(?:diagram|canvas|drawing|chart|picture|page|graph|sketch)|the\s+whole\s+(?:thing|lot)|the\s+lot|all\s+of\s+(?:it|them)|it\s+all|for\s+all|all(?!\s+(?:over|the\s+(?:arrows?|lines?|links?|connections?|connectors?|edges?|wires?)|arrows?|lines?|links?|connections?|connectors?|edges?|wires?)\b))\b/i;
const OPS_WHOLE_FIT = /\b(?:(?:the|this|my|our)\s+(?:whole\s+|entire\s+|full\s+)?(?:diagram|drawing|chart|picture|graph|sketch)|the\s+whole\s+(?:thing|lot)|the\s+lot|all\s+of\s+(?:it|them)|it\s+all|for\s+all|all)\b/i;
/** names masked for the ops readers ("group A and B as Flow": Flow is a name, not a layout word); nameIndex: the formalizer's names */
const opsMaskWith = (t, nameIndex) => t.replace(/\b(as|named|called|into|to)\s+([A-Z][\w-]*)/g, (m, p) => p + ' Xname').replace(/[A-Za-z_][\w-]*/g, w => /^[A-Z]/.test(w) && nameIndex.has(w.toLowerCase()) && !/^(?:LR|RL|TD|TB|BT)$/.test(w) ? 'Xname' : w);
/** the words of the layout operations' own patterns (a verbless clause made only of words the Rules read can be a request, makeFormalizer) */
const OPS_WORDS = new Set(([opsAction, opsVerbless, opsRestyle, opsDirection, opsSkipTemplate, OPS_REVERSE.test].map(String).join(' ') + ' fewer minimize minimise avoid don\'t dont awful ugly autolayout ' + [OPS_MORE, OPS_LESS, OPS_IMPROVE, OPS_UNTANGLE, OPS_LINK_LAYOUT].concat(OPS_LAYOUT.map(x => x[1])).map(r => r.source).join(' ')).toLowerCase().match(/[a-z]{3,}/g));
const OPS_WHOLE_ACTIONS = ['arrange', 'improve', 'respace', 'snap', 'flip', 'sort', 'groupBy', 'equalize', 'straighten', 'untangle', 'fit', 'align', 'distribute'];

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
    /* the cue words of shape=text (text, title, heading, ...) are not shape nouns of descriptions ("the title" is not a mention): a free
       text is read by its own rule below (a quoted text with no shape to put it on) */
    const TEXTW = new Set([...SHAPE.entries()].filter(([, v]) => v === 'text').map(([k]) => k));
    const nounWords = [...SHAPE.keys()].filter(k => !TEXTW.has(k));
    const pluralNoun = w => /s$/.test(w) && !['rhombus'].includes(w) && w !== 'ones' ? true : w === 'ones';
    const colorRe = alt([...COLOR.keys()]), sizeRe = alt([...SIZE.keys()]), nounRe = alt(nounWords);
    const MOD = `(?:(?:${colorRe}|${sizeRe})\\s+){0,3}`;
    const verbCues = [...ACTION.keys()].filter(w => !['undo', 'redo', 'revert'].includes(w));
    const ARTICLE_AHEAD = new RegExp(`^\\s+(?:new\\s+|few\\s+|couple\\b|copy\\b|bit\\b|little\\b|lot\\b|(?:(?:${colorRe}|${sizeRe}|dashed|dotted|solid)\\s+){0,3}(?:${nounRe}|${EDGE_WORDS})\\b)`, 'i');
    const VERB_RE = new RegExp(`\\b(${alt(verbCues)})\\b`, 'i');
    /* a shape noun before a name refers to the shape of that name: "the shape Process", "the box Process", "the node Process", "the circle
       named Process", "circle1" after "the circle". The noun phrase is replaced by the name (nounBeforeName in clause()). Not after a/an/another
       or a number ("draw a circle named Hub" declares a new shape), not a plural noun, and a word after the noun counts only when it is a
       known name; after "named"/"called" any word counts, except right after a verb of creation ("draw the circle named Hub"). */
    const NOUN_NAME = new RegExp(`\\b(?:(the|this|that)\\s+)?((?:(?:${colorRe}|${sizeRe})\\s+){0,3})(${nounRe})\\s+(?:(named|called)\\s+)?([A-Za-z_][\\w-]*)(?=['\u2019\\s,.;:!?]|$)`, 'gi');
    const CREATE_VERBS = new RegExp(`\\b(?:${alt([...ACTION.entries()].filter(([, v]) => v === 'create').map(([k]) => k))})\\s+$`, 'i');
    /* an existing connection named by its ends: "the arrow between A and B", "the arrow from A to B", "the link A–B", "the A→B line" (the
       raw test; the ends are read after names are marked, edgeRef in clause()) */
    const EDGE_RAW = new RegExp(`\\b(?:${EDGE_WORDS})\\s+(?:(?:that\\s+)?(?:goes|going|leads|leading|runs|running|points|pointing)\\s+)?(?:between|from|to|into|out\\s+of|leaving)\\b|\\b(?:${EDGE_WORDS})\\s+(?:the\\s+)?[A-Za-z_][\\w-]*\\s*(?:\u2013|\u2014|->|\u2192|-|\\bto\\b)\\s*(?:the\\s+)?[A-Za-z_]|[A-Za-z_][\\w-]*\\s*(?:\u2013|\u2014|->|\u2192)\\s*[A-Za-z_][\\w-]*\\s+(?:${EDGE_WORDS})\\b`, 'i');
    /* removing a label: "remove the label of Done", "delete the label from the arrow between A and B", "clear Done's label", "unlabel Done" */
    const REMOVE_LABEL = /\b(?:remove|delete|clear|erase|drop|wipe|strip|get\s+rid\s+of)\s+(?:(?:the|its|their|any|all|every|each|this|that|these|those)\s+)*(?:labels?|captions?|titles?|text)\b(?!\s+box)|\b(?:remove|delete|clear|erase|drop|wipe|strip|get\s+rid\s+of)\s+(?:the\s+)?[A-Za-z_][\w-]*['\u2019]s\s+(?:labels?|captions?|titles?|text)\b|^\s*unlabel\b/i;

    const F = { nodes: [], notes: [], s: 0, m: 0, segments: [] };
    // group names are names too (ctx.groups, or the groups of this formalizer's own world)
    const groupNames = (ctx.groups || (engine.world && engine.world.state.groups || []).map(g => g.name)).map(String);
    const groupSet = new Set(groupNames.map(g => g.toLowerCase()));
    const nameIndex = new Map((ctx.names || []).concat(groupNames).map(n => [n.toLowerCase(), n]));
    const groupAltRe = groupNames.slice().sort((a, b) => b.length - a.length).map(esc).join('|');
    /* layers in descriptions (owner's session 2026-11-03: "delete the background boxes"): background / backdrop -> layer=background, zone /
       panel / lane -> layer=zone (the legend's layer cues, without the vague "area" and "container"), as a word before the noun ("the
       background boxes", "all zone panels") or as the noun ("the zones", "the background"); the engine's filterShapes reads mention layer= */
    const LAYER_W = { background: 'background', backgrounds: 'background', backdrop: 'background', backdrops: 'background', zone: 'zone', zones: 'zone', panel: 'zone', panels: 'zone', lane: 'zone', lanes: 'zone', swimlane: 'zone', swimlanes: 'zone' };
    const QUOTE_REF = ['delete', 'move', 'resize', 'duplicate', 'toFront', 'toBack', 'swap', 'align', 'distribute', 'disconnect', 'group', 'ungroup'];
    const NEW_TEXT = /\b(?:put|place|stick|add|write|give|attach|type|insert|use|with|set)\s+(?:(?:a|an|the|this|that|its|their|new)\s+)*$/i;   /* "put the label "ok" on …": the new text */
    const isLayerName = w => !!w && !!LAYER_W[w.toLowerCase()] && nameIndex.has(w.toLowerCase());
    const AFTER_VERB = new RegExp(`(?:^|[\\s,])(?:${alt(verbCues)})(?:\\s+(?:all|every|each|the|of|me|us))*\\s*$`, 'i');
    const LAYER_ANCHOR = /\b(?:of|below|above|under|over|beneath|near|beside|between|next\s+to|left\s+of|right\s+of|and)\s*$/i;
    const LAYER_INTO = /\b(?:to|into|in|behind|at|towards?|onto|on|over|from|of)(?:\s+(?:the|a|its|their))?\s*$/i;
    const layerRe = alt(Object.keys(LAYER_W)), DMOD = `(?:(?:${colorRe}|${sizeRe}|${layerRe})\\s+){0,3}`;
    /* the texts the items show (ctx.texts: the labels on the canvas, e.g. "Order flow", passed like ctx.names): a phrase that is exactly
       one of them, or its letters without spaces ("Orderflow"), is a reference to that item, read before any other rule (its words may be
       COMMON or layout words: "order", "flow"); it is read as mention label="<text>", which the engine resolves (filterShapes). A one-word text that is a
       word the Rules read anyway ("ok", "yes", "start") is left alone. */
    const WRITE_CUE = /(?:\b(?:labell?ed|label|saying|says|titled|called|named|reading|reads|text|title|caption|heading|write|writes|written|as|to)\s+(?:the\s+)?)$/i;
    const TEXT_REF_STOP = '(?:to|in|on|at|from|into|onto|with|and|then|under|below|above|over|near|next|beside|left|right|by|so|because|please|blue|red|green|bigger|smaller)';
    const canvasTexts = [...new Set((ctx.texts || []).map(x => String(x)).filter(x => textWords(x).length))];
    const textPhraseRes = canvasTexts.map(x => { const ws = textWords(x), one = ws.length === 1 ? ws[0] : null;
      if (one && (one.length < 3 || COMMON.has(one) || STOP.has(one) || ACTION.has(one) || SHAPE.has(one) || COLOR.has(one) || SIZE.has(one) || /^(?:ok|okay|yes|no|hi|hey)$/.test(one))) return null;
      const body = ws.map(esc).join('[^\\p{L}\\p{N}⟪⟫⟦⟧⟬⟭]{1,4}') + (ws.length > 1 ? '|' + esc(ws.join('')) : '');
      return { text: x, re: new RegExp(`(?<![\\p{L}\\p{N}_])(?:${body})(?![\\p{L}\\p{N}_])`, 'giu') }; }).filter(Boolean).sort((a, b) => b.text.length - a.text.length);
    let lastRef = null, lastGroup = null, lastEdge = null;   // lastEdge: the arrow the last request was about ({from, to, node}: node = a connect made just before)
    if (ctx.last && ctx.last.length) { lastGroup = ctx.last.slice(); lastRef = ctx.last.length === 1 ? ctx.last[0] : null; }

    /* every one-word cue of every legend key: a word the Rules read (never a typo; a verbless clause of only such words can be a request) */
    const legendWords = new Set();
    for (const k of L.questions.keys()) for (const c of L.lexicon(k).keys()) for (const w of c.split(/[\s-]+/)) if (w.length >= 3) legendWords.add(w);
    /* a word the Rules read: a legend cue, a COMMON word, a name, or a word of the layout operations' own patterns (OPS_WORDS); an inflection
       of one, or (5+ letters) one edit away from one ("arange") */
    const ruleWord = w => { w = w.toLowerCase().replace(/['\u2019]/g, "'"); if (w.length < 3 || /^\d/.test(w) || nameIndex.has(w) || /^(?:pls|plz|thx|xname)$/.test(w)) return true;
      const known = x => COMMON.has(x) || legendWords.has(x) || OPS_WORDS.has(x);
      if ([w, w.replace(/(?:s|es|ed|ing|ly|ally)$/, ''), w.replace(/s$/, '')].some(known)) return true;
      for (const k of OPS_WORDS) if (k.length >= 4 && w.startsWith(k) && w.length - k.length <= 4) return true;
      if (w.length >= 5) for (const k of new Set([...legendWords, ...OPS_WORDS])) if (Math.abs(k.length - w.length) <= 1 && osa(w, k) <= 1) return true;
      return false; };
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
      /* free text is never corrected: a new name, and an unquoted label ("labeled cold" stays cold, not gold) */
      const introduced = new Set((input.match(/\b(?:named|called|name\s+it|rename\s+\S+\s+(?:to|as|into)|labell?ed|titled|captioned|saying|that\s+says|which\s+says)\s+([A-Za-z_][\w-]*)/gi) || []).map(m => m.split(/\s+/).pop().toLowerCase()));
      if (/\b(?:group|together|bundle)\b/i.test(input)) for (const m of input.match(/\b(?:as|into)\s+([A-Za-z_][\w-]*)/gi) || []) introduced.add(m.split(/\s+/).pop().toLowerCase());   /* "group A and B as Pipeline" */
      for (const x of canvasTexts) { const ws = textWords(x); ws.forEach(w => introduced.add(w)); introduced.add(ws.join('')); }   /* the words of the canvas texts are not typos */
      /* a word the Rules read is never a typo: every one-word cue of every legend key (scheme "cold", topic words ...) besides the targets */
      const verbTargets = new Set(verbCues), otherTargets = new Set([...SHAPE.keys(), ...COLOR.keys(), ...SIZE.keys()]);
      /* verbPos: the word stands where a verb stands (the start of a sentence or clause, after a connective or an opener). A word elsewhere
         is not corrected into a verb cue: "the company" is not "compact", "wants it short" not "sort", "the release" not "reverse" */
      const fixWord = (w, strict, verbPos = true) => {   // strict: one edit, towards a verb cue only (the first word of a sentence, below)
        if (/^[A-Z]/.test(w) && !nameList.length) return null;
        if (introduced.has(w.toLowerCase()) || (/^[A-Z0-9]+$/.test(w) && w.length <= 4)) return null;
        const lw = w.toLowerCase();
        if (lw.length < 3 || COMMON.has(lw) || targets.has(lw) || legendWords.has(lw) || /\d/.test(lw)) return null;
        for (const k of targets.keys()) if (k.length >= 3 && lw.startsWith(k) && lw.length - k.length <= 4) return null; /* an inflection of a known word: labeled, connected, circles */
        if (/(?:ed|ing|ly|tion|ness)$/.test(lw) && lw.length > 6) return null;
        const pre = strict ? [] : nameList.filter(n => n.toLowerCase().startsWith(lw) && n.length - lw.length <= 2).sort((a, b) => a.length - b.length);
        if (pre.length && (pre.length === 1 || pre[0].length < pre[1].length)) return pre[0];
        const max = strict ? 1 : lw.length >= 7 ? 2 : 1; let best = null, bd = 99, tie = false;
        const capital = /^[A-Z]/.test(w);
        for (const [k, canon] of targets) {
          if (strict && !verbTargets.has(canon)) continue;
          if (capital && !nameList.includes(canon)) continue; /* a capitalised word is a name: only correct it towards an existing name */
          if (Math.abs(k.length - lw.length) > max) continue; const d = osa(lw, k); if (d < bd) { bd = d; best = canon; tie = false; } else if (d === bd && canon !== best) tie = true; }
        if (bd <= max && !tie && !verbPos && verbTargets.has(best) && !otherTargets.has(best)) return null;
        return bd <= max && !tie ? best : null;
      };
      fixText = s => s.replace(/"[^"]*"|“[^”]*”|[A-Za-z][\w'-]*/g, (w, off, whole) => {
        if (w[0] === '"' || w[0] === '“') return w;
        const verbPos = /(?:^|[.!?;,:]\s*|\b(?:and|then|also|now|just|please|pls|kindly|finally|next|to|you|u|lets|let's|so|ok|okay|after\s+that|first|again)\s+)$/i.test(whole.slice(0, off));
        let f = fixWord(w, false, verbPos);
        /* the first word of a sentence is capitalised by its place, not because it is a name. When it is no name (nor near one) and one edit
           away from a verb cue, and an object follows (a name, an article, a pronoun, a value word), it is read as that verb ("Deelte Db",
           "Brong Hero in front"); a title such as "Spice rack." or "Fire drill plan" is left alone (no object after it) */
        if (!f && /^[A-Z][a-z]+$/.test(w) && /(?:^|[.!?;]\s)\s*$/.test(whole.slice(0, off))) {
          const nx = (whole.slice(off + w.length).match(/^\s+([A-Za-z0-9_][\w-]*)/) || [])[1] || '';
          const obj = /^(?:the|a|an|all|every|each|it|them|this|that|these|those|both|everything|out|up|\d+)$/i.test(nx) || (/^[A-Z]|\d/.test(nx) && nameIndex.has(nx.toLowerCase())) || COLOR.has(nx.toLowerCase()) || SIZE.has(nx.toLowerCase()) || SHAPE.has(nx.toLowerCase());
          if (obj) f = fixWord(w.toLowerCase(), true);
        }
        if (!f) return w;
        corrections.push(`I read “${w}” as “${f}”.`); return f;
      });
      if (!given) input = fixText(input);
    }
    const quotes = [];
    const quoteOut = s => s.replace(/"([^"]*)"|“([^”]*)”|(^|\s)'([^']+)'(?=[\s.,!?;]|$)/g, (m, a, b, pre, c) => { quotes.push(a != null ? a : b != null ? b : c); return (pre || '') + ' ⟪' + (quotes.length - 1) + '⟫ '; });
    let text = ' ' + input.trim() + ' ';
    if (!given) text = quoteOut(text);
    const unq = tok => { const m = /^⟪(\d+)⟫$/.exec(tok); return m ? quotes[+m[1]] : tok; };
    /* a free text written without quotes: "add a big title Roadmap", "add a heading Q3 plan at the top", "add a note saying check later",
       "put a caption Draft under Done". A text noun (the words of TEXT_NOUN) as the object of a verb of creation (the cues of action=create,
       and "write"), with only an article ("make the title …" is the title already drawn), colours and sizes before it: the words after it are the text, as if they were in quotes, up to a
       place ("at the top", "under Done", "in big red letters") or the end of the clause. The free-text rule of the clause then decides, as
       for a quoted text, between a free text and a label on a shape ("add a caption Draft on Done" labels Done). Not a text: words that
       start with a preposition, an article, a pronoun, a shape, arrow, colour or size word, a comparative ("make title bigger"), a verb, or (without "saying" / "that says" /
       "reading" / ":") a known shape name ("add a title to Process", "add a text box", "add a heading Start" are read as before). */
    const TEXT_VERBS = alt([...ACTION.entries()].filter(([, v]) => v === 'create').map(([k]) => k).concat(['write']));
    const TEXT_PLACE = '(?:at|in|on|onto|near|next\\s+to|beside|above|below|under|over|underneath|beneath|between|by|(?:to\\s+the\\s+)?(?:left|right)\\s+of)';
    const TEXT_UNQ = new RegExp(`^(\\s*(?:${TEXT_VERBS})\\s+(?:(?:a|an|the|another|one|some|new)\\s+)?(?:(?:${colorRe}|${sizeRe}|bold|new|little)\\s+){0,3}(?:text|title|heading|headline|caption|subtitle|banner|note)\\b)(\\s*:\\s*|\\s+(?:saying|that\\s+says|which\\s+says|reading|that\\s+reads|with\\s+the\\s+(?:text|words?))\\s+|\\s+)(.+?)((?:\\s+${TEXT_PLACE}\\b|\\s+to\\b(?!\\s+(?:do|be)\\b)).*)?$`, 'i');
    const TEXT_STOP = new RegExp(`^(?:${TEXT_PLACE}|to|of|for|with|from|into|and|or|then|called|named|titled|it|its|them|this|that|these|those|the|a|an|here|there|saying|says|please|box|field|area|more|less|left|right|top|bottom|center|centre|middle|upper|lower|front|back|bigger|smaller|larger|wider|narrower|taller|shorter|thicker|thinner|bolder|darker|lighter|brighter|${EDGE_WORDS}|${nounRe}|${colorRe}|${sizeRe})$`, 'i');
    function unquotedText(t) {
      if (/⟪\d+⟫/.test(t)) return t;
      const m = TEXT_UNQ.exec(t); if (!m || /^\s*(?:make|turn)\s+the\b/i.test(m[1])) return t;   // "make the title Roadmap": the title already drawn
      const noun = m[1].trim().split(/\s+/).pop(); if (/^[A-Z]/.test(noun) && nameIndex.has(noun.toLowerCase())) return t;   // "Put Title right of Logo": a shape named Title
      const words = m[3].trim(), first = (words.match(/^[^\s]+/) || [''])[0].replace(/[,;:]+$/, ''), intro = m[2].trim() !== '';
      if (!words || TEXT_STOP.test(first) || VERB_RE.test(first) && VERB_RE.exec(first)[0].length === first.length || (!intro && nameIndex.has(first.toLowerCase()))) return t;
      quotes.push(words);
      return m[1] + ' ⟪' + (quotes.length - 1) + '⟫ ' + (m[4] || '') + ' ';
    }

    const sentences = text.split(/(?<=[.!?;])\s+/).map(s => s.trim()).filter(Boolean);
    const TPL_PART = '\u0001';
    const opsMask = t => opsMaskWith(t, nameIndex);   /* the clause text for the ops readers (READER_HELPERS) */
    const SPLIT_VERB = new RegExp(`\\s*(?:,\\s*(?:and\\s+)?|\\s+and\\s+)(?=(?:${alt(verbCues.concat(['undo', 'redo']))})\\b)`, 'i');
    const CREATE_START = new RegExp(`^\\s*(?:${OPENER}[\\s,]+)*(draw|add|create|insert|sketch|place|put|make)\\s+(?:a|an|another|\\d+|one|two|three|four|five|six|seven|eight|nine|ten)\\s`, 'i');
    const OBJ_SPLIT = new RegExp(`\\s*(?:,\\s*(?:and\\s+|plus\\s+)?|\\s+and\\s+|\\s+plus\\s+)(?=(?:a|an|another|${NUMRE})\\s+(?:(?:[a-z-]+)\\s+){0,3}?(?:${nounRe})\\b)`, 'i');
    // coordination: "make Open green, Closed yellow and Locked red", "put Stove right of Sink and Fridge above Sink" -> one clause per
    // name, the verb repeated; only when the left piece is complete (verb + at least two more words) and the right piece starts with a
    // known name followed by a predicate word, and never inside "between A and B"
    /* the known names for the clause splitters; a one-letter name only in capitals and as a whole word ("B", never the article "a" or "I";
       "A" not before a shape noun: "A circle"), written as an escape so that ciSource keeps it exact (the splitters run without the i flag) */
    const oneLetter = k => { const n = nameIndex.get(k), N = typeof n === 'string' && /^[A-Z]$/.test(n) && n !== 'I' ? n : null; if (!N) return null;
      return '\\x' + N.charCodeAt(0).toString(16) + '(?![\\w-])' + (N === 'A' ? `(?!${ARTICLE_AHEAD.source.replace(/^\^/, '')})` : ''); };
    const nameAltRe = [...nameIndex.keys()].filter(k => k.length > 1 || oneLetter(k)).sort((a, b) => b.length - a.length).map(k => k.length > 1 ? k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : oneLetter(k)).join('|');
    const NRE = src => new RegExp(ciSource(src));
    const PRED = `(?:to|a|an|in|at|on|into|onto|above|below|under|underneath|beneath|over|left|right|next|near|beside|alongside|close|by|up|down|${colorRe}|${sizeRe}|(?!ones?\\b)(?:${nounRe}))`;
    const COORD = nameAltRe ? NRE(`(?:,\\s*(?:and\\s+)?|\\s+and\\s+)(?=(?:the\\s+)?(?:${nameAltRe})\\s+${PRED}\\b)`) : null;
    /* the verbs whose objects can be coordinated, each with its own value ("make A red and B blue", "tie A to B and B to C"): make / put /
       place and every cue of move, set and connect in the legend */
    const DIST_VERB = new RegExp(`^\\s*(?:${OPENER}[\\s,]+)*(${alt(['make', 'put', 'place'].concat([...ACTION.entries()].filter(([k, v]) => ['move', 'set', 'connect'].includes(v) && !k.includes(' ')).map(([k]) => k)))})\\b`, 'i');
    const coordSplit = p => {
      const vm = COORD && p.match(DIST_VERB); if (!vm || /\b(?:one\s+after\s+(?:the\s+)?other|in\s+(?:a\s+)?(?:chain|sequence|order)|to\s+the\s+next|each\s+other|every\s+pair)\b/i.test(p)) return [p];
      const pieces = p.split(COORD), out = [pieces[0]];
      for (const q of pieces.slice(1)) {
        const left = out[out.length - 1], lm = left.match(DIST_VERB) || vm, afterVerb = left.slice(lm.index + lm[0].length).trim().split(/\s+/).filter(Boolean);   // the verb of THIS piece (the first has the opener before it)
        /* the left piece must be complete: not inside "between A and B", and more than its targets ("paint A, B and C red": one request) */
        const onlyTargets = afterVerb.every(w => /^(?:and|the|of|,|colou?r|shape|size|label|text|position|outline|border|fill)$/i.test(w) || nameIndex.has(w.replace(/,+$/, '').replace(/['\u2019]s$/i, '').toLowerCase()));
        if (/\bbetween\s+(?:the\s+)?\S+\s*$/i.test(left) || afterVerb.length < 2 || onlyTargets) out[out.length - 1] = left + ' and ' + q;
        else out.push(vm[1] + ' ' + q);
      }
      return out;
    };
    // verb ellipsis: "connect Api to Db, then Core to Utils", "Jazz blue" after "make X red" -> the previous clause's verb is repeated
    const ELLIPSIS = nameAltRe ? NRE(`^\\s*(?:(?:and|then|also|plus|now)\\s+)*(?:the\\s+)?(?:${nameAltRe})\\b\\s+\\S`) : null;
    let prevVerb = null;
    const PLACE_ONLY = nameAltRe ? NRE(`^\\s*(?:the\\s+)?(?:${nameAltRe})\\s+(?:(?:is|goes|sits|stays|should\\s+be|just|right|way|then)\\s+)*(?:(?:at|in|on|to)\\s+the\\s+(?:top|bottom|left|right|center|centre|middle|upper|lower)|(?:top|bottom|upper|lower)(?:[\\s-]+(?:left|right))?\\s*$|on\\s+top\\s*$|(?:in\\s+the\\s+)?(?:center|centre|middle)\\s*$|(?:above|below|under|over|beneath|underneath|left\\s+of|right\\s+of|next\\s+to|near|beside|between|on\\s+top\\s+of)\\b)`) : null;
    const CONNECT_ONLY = nameAltRe ? NRE(`^\\s*(?:the\\s+)?(?:${nameAltRe})(?:\\s*(?:,|and)\\s*(?:the\\s+)?(?:${nameAltRe}))*\\s+(?:(?:both\\s+|each\\s+|all\\s+)?(?:goes|go|leads?|flows?|feeds?|sends?|files|points?|runs?|passes|connects?)\\s+(?:in)?to|to)\\s+(?:the\\s+)?(?:${nameAltRe}|the\\s+next)\\b`) : null;
    const FACT_LIST = nameAltRe ? NRE(`\\s*,\\s*(?:and\\s+)?(?=(?:the\\s+)?(?:${nameAltRe})\\s+(?:is|are)\\s)|\\s*,\\s*(?:and\\s+)?(?=(?:the\\s+)?(?:${nameAltRe})\\s+(?:(?:at|in|on)\\s+the|top|bottom|upper|lower|center|centre|middle|on\\s+top|(?:goes\\s+)?to\\s+(?:the\\s+)?(?:${nameAltRe}))\\b|(?:the\\s+)?(?:${nameAltRe})\\s+(?:above|below|under|over|left\\s+of|right\\s+of|next\\s+to|near|beside)\\b)`) : null;
    /** "label the shape Process", "move the box Process", "the circle named Done", "the node Start": the noun phrase -> the name (see NOUN_NAME);
     *  "Process-Check" next to an arrow word -> "Process – Check" when both are known names */
    function nounBeforeName(t, forced) {
      const knownName = (w, after) => {
        const k = nameIndex.get(w.toLowerCase()); if (k == null || w === 'a' || w === 'I') return false;
        if (w === 'A' && ARTICLE_AHEAD.test(after)) return false;
        return /^[A-Z]|\d/.test(w) || (typeof k === 'string' && k === w);
      };
      t = t.replace(NOUN_NAME, (m, art, mods, noun, nm, w, off, whole) => {
        const before = whole.slice(0, off), after = whole.slice(off + m.length);
        if (!art && /\b(?:a|an|another|some|any|each|every|no|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+$/i.test(before)) return m;
        if (pluralNoun(noun.toLowerCase())) return m;
        if (!nm && /\b(?:rename|call|name)\s+(?:the\s+|this\s+|that\s+)?$/i.test(before + (art ? art + ' ' : '')) && !/^\s+(?:to|as|into)\b/i.test(after)) return m;   /* "call the triangle Output": the new name */
        if (knownName(w, after)) return (/\S$/.test(before) ? ' ' : '') + w;
        if (nm && art && !CREATE_VERBS.test(before) && !/^(?:a|an|the|it|one)$/i.test(w)) { forced.add(w.toLowerCase()); return (/\S$/.test(before) ? ' ' : '') + w; }
        return m;
      });
      if (new RegExp(`\\b(?:${EDGE_WORDS})\\b`, 'i').test(t)) t = t.replace(/\b([A-Za-z_]\w*)-([A-Za-z_]\w*)\b/g, (m, a, b) => nameIndex.has(m.toLowerCase()) || !nameIndex.has(a.toLowerCase()) || !nameIndex.has(b.toLowerCase()) ? m : a + ' \u2013 ' + b);
      return t;
    }
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
      const parts = body.split(/\s*,?\s*\b(?:and then|then|after that|afterwards|finally)\b[\s,]*/i).flatMap(p => templateOf(' ' + p + ' ') && !opsSkipTemplate(opsMask(p)) ? [TPL_PART + p] : p.split(SPLIT_VERB)).flatMap(p => p.startsWith(TPL_PART) ? [p] : coordSplit(p)).flatMap(p => FACT_LIST && !p.startsWith(TPL_PART) && !VERB_RE.test(p) ? p.split(FACT_LIST) : [p]).flatMap(p => CONNECT_ONLY && CONNECT_ONLY.test(p) && nameAltRe ? p.split(NRE(`\\s+and\\s+(?=(?:the\\s+)?(?:${nameAltRe})\\s+(?:goes|go|leads?|flows?|feeds?|sends?|files|points?|runs?|passes)\\b)`)) : [p]);
      for (let pi = 0; pi < parts.length; pi++) {
        let p = parts[pi];
        if (!p || !p.trim()) continue;
        if (p.startsWith(TPL_PART)) { clause(p.slice(TPL_PART.length), isQ); continue; }   // a template's list of items is one request
        const pv = p.match(VERB_RE);
        if (pv) prevVerb = pv[1];
        else if (prevVerb && !isQ && ELLIPSIS && ELLIPSIS.test(p) && !/^\s*(?:the\s+)?\S+\s+(?:is|are|was|were|should|would|will|has|have)\b/i.test(p)) { p = prevVerb + ' ' + p.replace(/^\s*(?:(?:and|then|also|plus|now)\s+)*/i, ''); const cs = coordSplit(p); parts.splice(pi, 1, ...cs); p = cs[0]; }   // the repeated verb's piece is split like any other ("then Api to Cache and Api to Db")
        if (pi + 1 < parts.length && !VERB_RE.test(p) && !/^\s*(undo|redo)\b/i.test(p) && !/\?/.test(p) && !(PLACE_ONLY && PLACE_ONLY.test(p)) && !(CONNECT_ONLY && CONNECT_ONLY.test(p)) && !(nameAltRe && NRE(`^\\s*(?:the\\s+)?(?:${nameAltRe})\\s+(?:is|are)\\s`).test(p))) { parts[pi + 1] = parts[pi + 1] + ' ' + p.replace(/^[\s,]+|[\s,]+$/g, ''); continue; }
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

    /* ---- the help world, the templates: their own small readers (LEGEND_EXT.md sections 3, 4, 6). Their cue words are the Rules' own. ---- */
    function pushWire(kind, args, raw) {
      const id = 's' + (++F.s), node = { id, type: kind, args };
      Object.defineProperty(node, 'src', { value: raw.trim().replace(/⟪(\d+)⟫/g, (m, n) => '"' + quotes[+n] + '"').replace(/\s+/g, ' '), enumerable: false });
      F.nodes.push(node); F.segments.push({ src: node.src, id });
      if (kind === 'command' && args.action === 'create') { lastRef = ref(id); lastGroup = ref(id); }
      return node;
    }
    function helpOf(raw) {
      if (!L.get('topic')) return null;
      const t = ' ' + raw.replace(/[?!.\s]+$/, '').trim() + ' ', lead = HELP_LEAD.exec(t);
      if (!lead) return null;
      const rest = t.slice(lead.index + lead[0].length), lw = lead[0].toLowerCase(), plain = rest.replace(/⟪\d+⟫/g, ' ');
      const nameHere = (rest.match(/[A-Za-z_][\w-]*/g) || []).some(w => /^[A-Z]/.test(w) && nameIndex.has(w.toLowerCase()) && w !== 'I' && w !== 'A');
      const concrete = /⟪\d+⟫/.test(rest) || nameHere || /\b\d+\b/.test(rest);
      const first = (raw.trim().match(/^[A-Za-z_][\w-]*/) || [''])[0];
      /* with shapes named in it, a help lead asks about the drawing ("how do I get from Auth to Logs", "which shapes can Spawn reach") unless it
         names an action of the legend ("how do I connect Start to Done?") */
      if (nameHere && !new RegExp(`\\b(?:${alt([...ACTION.keys()].filter(k => !HELP_GENERIC.has(k)))})\\b`, 'i').test(plain)) return null;
      if (/\b(?:explain|tell\s+me\s+about)\b/i.test(lw) && /\b(?:diagram|drawing|canvas|picture|what|which|where)\b/i.test(plain)) return null;
      /* a question about shapes of the drawing written with a help lead: "which shapes can be reached from the rect?", "tell me about the
         hexagon" (a description: the / this / every + a shape noun) */
      if (/\b(?:reach(?:ed|able)?|connected|linked|attached|joined)\b/i.test(plain) && /^\W*(?:what|which)\b/i.test(lw.replace(/^[\s\W]*(?:(?:hi|hey|hello|ok(?:ay)?|so|um+|hmm+|please|now|also|and|then|well|alright|quick\s+question)[\s,!.:]+)*/i, ''))) return null;
      if (/\b(?:explain|tell\s+me\s+about)\b/i.test(lw) && new RegExp(`\\b(?:the|this|that|every|all|each)\\s+(?:[a-z]+\\s+){0,2}(?:${nounRe})\\b`, 'i').test(plain)) return null;   // "explain what the diagram contains": a question about the drawing
      if (/^[A-Z]/.test(first) && nameIndex.has(first.toLowerCase()) && !/^(?:help|can|how|what|which|show|explain|tell)$/i.test(first) || /^help$/i.test(first) && nameIndex.has('help')) return null;   // "Help is below Settings": a shape named Help
      /* "help" / "I need help" / "tell me about" / "explain" followed by a request or a story is not a help question: only a short topic is */
      if (/^\W*(?:(?:hi|hey|hello|ok(?:ay)?|so|um+|hmm+|please|now|also|and|then|well|alright|quick\s+question)[\s,!.:]+)*(?:help|i\s+need\s+help|tell\s+me\s+about|explain)\b/i.test(lw) && (nameHere || VERB_RE.test(plain) && !/^\s*(?:with|on)\b/i.test(plain) || plain.trim().split(/\s+/).filter(Boolean).length > 4)) return null;
      if (/\b(?:how\s+many|which|where|is\s+there|are\s+there|what\s+colou?r\s+is)\b/i.test(plain) && !/^\s*(?:what|which)\s/i.test(lw.replace(/^\W+/, ''))) return null;   // "can you tell me how many circles ..." is a question about the drawing
      /* "can you …" is a polite request ("can you undo", "could you draw a star", "can you get rid of the navy star"), except a bare
         capability question: "can you draw stars?", "can you do timelines?", "can you help?", "could you handle groups?" */
      if (/^[\s\W]*(?:(?:hi|hey|hello|ok(?:ay)?|so|um+|hmm+|please|now|also|and|then|well|alright|quick\s+question)[\s,!.:]+)*(?:can|could|would)\s+(?:you|u)\b/i.test(lw) && (concrete || !/^\s*(?:help\b.*|(?:do|make|draw|create|handle|support|show|work\s+with)\s+(?:\w+\s+)?\w+s\s*)$/i.test(plain) || /\b(?:all|every|each|everything|the|this|that|it|them)\b/i.test(plain))) return null;
      if (/\b(?:can|could)\s+(?:i|we)\b/.test(lw) && concrete) return null;
      const a = { ask: 'help' };
      const lw0 = lw.replace(/^[\s\W]*(?:(?:hi|hey|hello|ok(?:ay)?|so|um+|hmm+|please|now|also|and|then|well|alright|quick\s+question)[\s,!.:]+)*/, '');
      a.aspect = /\bhow\b|\bthe\s+way\s+to\b/.test(lw0) ? 'how' : /examples?\b/.test(lw0) || /\bexamples?\b/i.test(plain) ? 'example'
        : /^(?:what|which)\s+(?:kinds?|types?|sorts?|colou?rs|sizes|shapes|styles|line\s+styles|templates|layouts|positions|forms|fills)\b/.test(lw0) ? 'values'
        : /^what\s+(?:else\s+)?can\s+(?:you|i|we)\s+do\b/.test(lw0) ? 'overview' : /\b(?:can|could|possible|able|support)\b/.test(lw0) ? 'can' : 'overview';
      const tp = helpTopic(lw.replace(/^.*\b(?:what|which)\s+(?=(?:colou?rs|sizes|shapes|styles|line\s+styles|templates|layouts|positions|forms|fills)\b)/, '') + ' ' + plain);
      if (tp.topic) a.topic = tp.topic; else if (tp.about) a.about = tp.about;
      if (/^\s*help\b/i.test(plain) && !a.topic && !a.about) a.aspect = 'overview';
      if (a.aspect === 'overview' && !a.topic && !a.about) delete a.aspect;
      return a;
    }
    function helpTopic(text) {
      const T = ' ' + text.toLowerCase().replace(/[^a-z0-9' -]+/g, ' ') + ' ', TPL = lx('template'), found = (re, pl) => { const m = re && new RegExp(`\\b(${re})${pl ? '(?:s|es)?' : ''}\\b`).exec(T); return m ? m[1] : null; };
      const tw = TPL.size ? found(alt([...TPL.keys()]), true) : null; if (tw) return { topic: TPL.get(tw) };
      const acts = [...ACTION.entries()].filter(([k]) => !HELP_GENERIC.has(k)), aw = found(alt(acts.map(([k]) => k))); if (aw && !/^(?:help)$/.test(aw)) return { topic: ACTION.get(aw) };
      for (const [re, topic] of HELP_FAMILY) if (re.test(T) && topicKnown(topic)) return { topic };
      for (const k of ['shape', 'color', 'style', 'arrow', 'size', 'fill', 'scheme', 'layout']) { const lex = lx(k), w = lex.size ? found(alt([...lex.keys()].filter(c => !['shape', 'shapes', 'thing', 'things', 'item', 'items', 'one', 'ones', 'any', 'object', 'objects', 'element', 'elements', 'node', 'nodes', 'line', 'arrow', 'normal', 'regular', 'average', 'no'].includes(c)))) : null; if (w) return { topic: lex.get(w) }; }
      const left = T.trim().split(/\s+/).filter(w => w && !HELP_STOP.has(w) && !ACTION.has(w) && !/^\d/.test(w));
      if (left.length) return { about: left.slice(0, 3).join(' ') };
      const gw = found(alt([...HELP_GENERIC].filter(k => ACTION.has(k)))); if (gw) return { topic: ACTION.get(gw) };
      return {};
    }
    function topicKnown(t) { const q = L.get('topic'); return !!(q && q.values && t in q.values); }
    function templateOf(t) {
      const TPL = lx('template'); if (!TPL.size) return null;
      const lc = t.toLowerCase(), cue = new RegExp(`\\b(${alt([...TPL.keys()])})\\b`, 'gi');
      let m, hit = null;
      for (const m of t.matchAll(cue)) {   // matchAll: a regex loop with exec() can spin on an empty match (loop guard)
        const before = t.slice(0, m.index), word = t.slice(m.index, m.index + m[1].length);
        if (/^[A-Z]/.test(word) && nameIndex.has(word.toLowerCase())) continue;   // a shape named Timeline
        const pre = /^[\s\S]*(?:^|\s)((?:a|an|the|my|our|this|one|some)\s+|(?:draw|make|create|build|add|show|sketch|give\s+me|lay\s*out|arrange|rearrange|organi[sz]e|turn\s+.*?\s+into|put\s+.*?\s+(?:in|into|as)|as|into|in)\s+(?:(?:a|an|the)\s+)?)((?:[\w-]+\s+){0,3}?)$/i.exec(before);
        if (!pre) continue;
        const mods = pre[2].trim().split(/\s+/).filter(Boolean);
        if (!mods.every(w => TPL_MOD.test(w) || COLOR.has(w.toLowerCase()) || SIZE.has(w.toLowerCase()) || lx('scheme').has(w.toLowerCase()) || /^(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:-\w+)?$/i.test(w))) continue;
        hit = { m, pre, mods, start: m.index - pre[2].length, end: m.index + m[1].length }; break;
      }
      if (!hit) return null;
      /* the form must be the object of a verb of making ("make a timeline", "draw me a heart", "a timeline of A, B" alone) or the target
         form of an arrangement whose objects are only shapes ("arrange A, B and C as a cycle", "lay out everything as a pyramid"); a
         template word in other text ("the heart rate", "our sales funnel is drawn as boxes", "the chairs sit in a loop") is not one */
      const before = t.slice(0, hit.start), mk = TPL_MAKE.exec(before), ar = TPL_ARR.exec(before);
      const arrObjOk = ar && ar[2].replace(/[,&]/g, ' ').split(/\s+/).filter(Boolean).every(w => /^(?:and|the|all|of|everything|shapes|things|items|them|these|those|boxes|nodes)$/i.test(w) || (nameIndex.has(w.toLowerCase()) && /^[A-Z]|\d/.test(w)));
      if (mk && !(ar && arrObjOk)) { const v0 = before.match(VERB_RE); if (v0 && v0.index < mk.index) return null; }   // "add a link … to make a loop": the template is not the request
      const alone = /^\s*(?:a|an)\s+$/i.test(before) && /^\s*(?:\S+\s+)?(?:of|:)\s/i.test(t.slice(hit.end));
      if (mk && !mk[1] && !/s$/i.test(hit.m[1])) return null;
      if (!mk && !(ar && arrObjOk) && !alone) return null;
      const vm = (ar && arrObjOk ? ar[0] : mk ? mk[0] : '').match(VERB_RE), verb = vm ? vm[1].toLowerCase() : null;
      const a = { action: 'create', template: TPL.get(hit.m[1].toLowerCase()) };
      let tail = ' ' + t.slice(hit.end) + ' ';
      const unq = x => x.replace(/⟪(\d+)⟫/g, (q, n) => quotes[+n]).trim();
      const list = x => x.replace(/(?<!\band|,)(?:\s*,)?\s+(?:please|pls|plz|thanks|thank\s+you|thx|cheers)\s*[.!?]*\s*$/i, '').split(/\s*(?:,|;|&|\band\b|\bthen\b|->|→)\s*/i).map(y => unq(y.replace(/^\s*(?:the|a|an)\s+/i, '')).replace(/[.!?]+$/, '').trim()).filter(Boolean);   // a closer is not an item ("… and Support thanks")
      const cut = (re, fn) => { const mm = re.exec(tail); if (!mm) return null; tail = tail.slice(0, mm.index) + ' ' + tail.slice(mm.index + mm[0].length) + ' '; fn(mm); return mm; };
      for (const w of hit.mods) { const x = w.toLowerCase(); if (COLOR.has(x)) a.color = COLOR.get(x); else if (SIZE.has(x)) a.size = SIZE.get(x); else if (lx('scheme').has(x)) a.scheme = lx('scheme').get(x); const n = /^(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)/i.exec(x); if (n) a.count = toNum(n[1]); if (/^vertical/.test(x)) a.axis = 'vertical'; if (/^horizontal/.test(x)) a.axis = 'horizontal'; }
      cut(/\b(?:titled|entitled|called|named|headed|with\s+(?:the\s+|a\s+)?(?:title|heading|header|caption))\s+(⟪\d+⟫|[A-Za-z0-9][\w'-]*(?:\s+[A-Z][\w'-]*)*)/i, mm => { a.title = unq(mm[1]); });
      cut(/\bwith\s+(⟪\d+⟫)\s+in\s+the\s+(?:middle|centre|center)\b/i, mm => { if (a.template === 'venn') a.items2 = [unq(mm[1])]; else a.title = unq(mm[1]); });
      cut(/\b(?:around|centred\s+on|centered\s+on|towards?|to\s+the\s+goal|leading\s+to)\s+(⟪\d+⟫)/i, mm => { if (a.title == null) a.title = unq(mm[1]); });
      if (a.template === 'road') cut(/\bto\s+(⟪\d+⟫)/i, mm => { if (a.title == null) a.title = unq(mm[1]); });
      if (a.template === 'pillars') cut(/\bon\s+(?:a\s+|the\s+)?(?:base|foundation)?\s*(?:of\s+)?(⟪\d+⟫)/i, mm => { a.items2 = [unq(mm[1])]; });
      cut(new RegExp(`(?:\\b(?:in|with|using)\\s+(?:a\\s+|an\\s+|the\\s+)?)?\\b(${alt([...lx('scheme').keys()])})(?:\\s+(?:colou?rs?|palette|scheme|tones|style))?\\b`, 'i'), mm => { a.scheme = lx('scheme').get(mm[1].toLowerCase()); });
      cut(new RegExp(`\\b(?:in|using)\\s+(?:the\\s+)?(${colorRe})(?:\\s+colou?rs?)?\\b`, 'i'), mm => { a.color = COLOR.get(mm[1].toLowerCase()); });
      cut(/\b(vertical(?:ly)?|top\s+to\s+bottom|horizontal(?:ly)?|left\s+to\s+right)\b/i, mm => { a.axis = /vert|top/i.test(mm[1]) ? 'vertical' : 'horizontal'; });
      cut(/\b(?:with\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[\s-]+(?:steps?|stages?|levels?|items?|parts?|phases?|rings?|points?|milestones?|layers?|boxes|columns?|pillars?|rows?|sets?|circles?|spokes?|rays?|branches?|camps?)\b/i, mm => { a.count = toNum(mm[1]); });
      for (const [p, re] of TPL_PLACES) if (cut(re, () => {})) { a.position = p; break; }
      cut(/\b(below|under|beneath|above|over|left\s+of|right\s+of)\s+(?:the\s+)?([A-Za-z_][\w-]*)/i, mm => { if (nameIndex.has(mm[2].toLowerCase())) { a.position = { below: 'below', under: 'below', beneath: 'below', above: 'above', over: 'above' }[mm[1].toLowerCase()] || (/left/i.test(mm[1]) ? 'leftOf' : 'rightOf'); a.anchor = nameIndex.get(mm[2].toLowerCase()); } else tail = tail + ' ' + mm[0]; });
      cut(/\b(?:against|versus|vs\.?|with\s+(?:the\s+)?roots|and\s+roots|roots:?|on\s+the\s+other\s+side:?|on\s+the\s+right:?)\s+(.+)$/i, mm => { a.items2 = list(mm[1]); });
      if (['bridge', 'balance'].includes(a.template)) cut(/\b(?:from|between)\s+(.+?)\s+(?:to|and\s+on\s+the\s+other\s+side|with)\s+(.+)$/i, mm => { a.items = list(mm[1]); a.items2 = list(mm[2]); });
      if (!a.items) cut(new RegExp(`^\\s*(?:(?:diagram|chart|graph|form|layout|shape|${alt([...TPL.keys()])})\\s+)?(?:of|for|with|showing|listing|containing|from|:|-)\\s+(.+)$`, 'i'), mm => { a.items = list(mm[1]); });
      /* arrange: the shapes named before the template ("arrange A, B and C as a cycle", "lay out everything as a pyramid") */
      const verbAct = ar && arrObjOk ? 'arrange' : vm ? ACTION.get(verb) : null, named = (before.match(/[A-Za-z_][\w-]*/g) || []).filter(w => nameIndex.has(w.toLowerCase()) && w !== 'a' && w !== 'I' && !(w === 'A' && !/^[A-Z]$/.test(w))).map(w => nameIndex.get(w.toLowerCase()));
      const allOf = /\b(?:everything|all(?:\s+the)?\s+(?:shapes|things|items)|all\s+of\s+them)\b/i.test(before);
      if (verbAct === 'arrange' && (named.length || allOf) && !a.items) {
        a.action = 'arrange'; a.target = named.length ? (named.length === 1 ? named[0] : named) : ALL_SHAPES;
      } else if (a.items && a.items.length >= 2 && a.items.every(x => nameIndex.has(String(x).toLowerCase()) && /^[A-Z]/.test(x)) && verbAct !== 'create') { a.action = 'arrange'; a.target = a.items.map(x => nameIndex.get(x.toLowerCase())); delete a.items; }
      for (const k of ['items', 'items2']) if (a[k] && !a[k].length) delete a[k];
      if (a.items && a.items.every(x => SHAPE.has(String(x).toLowerCase().replace(/^(?:the|all)\s+/, '')))) return null;   // "make a list of the circles" is not a list template
      if (a.items && a.items.some(x => /\b(?:everything|all|every|shapes?|things|items|ones)\b/i.test(x) || String(x).split(/\s+/).some(w => SHAPE.has(w.toLowerCase()) && !TEXTW.has(w.toLowerCase())))) return null;   // "a list of the red shapes": a question about the drawing
      if (a.items && a.items.length === 1 && /\b(?:of|for)\s+the\s+/i.test(t.slice(hit.end))) return null;   // "a timeline of the project", "a flow for the soup recipe": a description, not the items
      return a;
    }
    function templateClause(p, isQ) { const tp = templateOf(' ' + p + ' '); if (!tp) return false; if (tp.target === ALL_SHAPES) { const id = 'm' + (++F.m); F.nodes.push({ id, type: 'mention', args: { quantifier: 'all' } }); tp.target = ref(id); } pushWire('command', tp, p); return true; }
    /* items referred to by the text they show (owner's session 2026-11-03: "delete Order flow", "Delete Orderflow", 'delete "order
       flow"' for the title MainTitle): t with each reference replaced by ⟬k⟭, refs[k] = {text, label}:
         - a phrase that is exactly a canvas text (ctx.texts; canvasTexts above), or a quoted text equal to one -> {text};
         - "the text X" / "the title X" / "the caption X" / "the heading X" / "the label X", X a quoted text, a canvas text or a capitalised
           phrase ("delete the title Order flow") -> {text: X, label: true}.
       Each becomes a description mention label="<text>" (the annotation's form, LABEL_CONVENTIONS.md: mention(label=order flow)).
       Not in a request that writes a text (a create, label, rename or write verb, or right after labeled / saying / named / called ...):
       there the words are the new text. */
    function textRefsOut(t, refs) {
      const vm = t.match(VERB_RE), act = vm ? ACTION.get(vm[1].toLowerCase()) : null;
      if (['label', 'rename'].includes(act) || /^\s*(?:write|title|caption|relabel|retitle)\b/i.test(t)) return t;
      const making = act === 'create' && !/^(?:make|put|place|turn|set|stick|park|tuck)$/i.test(vm[1]) || act === 'create' && new RegExp(`\\b${esc(vm[1])}\\s+(?:(?:me|us)\\s+)?(?:a|an|another|new|some|\\d+|one|two|three|four|five)\\b`, 'i').test(t);   /* "add a title …": a new text, not a reference */
      const put = (text, label) => { refs.push({ text, label: !!label }); return ' ⟬' + (refs.length - 1) + '⟭ '; };
      const same = (a, b) => normText(a) === normText(b) || (squashText(a) && squashText(a) === squashText(b));
      t = t.replace(/⟪(\d+)⟫/g, (m, n, off, whole) => { const c = canvasTexts.find(x => same(x, quotes[+n])); return c && !WRITE_CUE.test(whole.slice(0, off)) ? put(c) : m; });
      for (const { text, re } of textPhraseRes) t = t.replace(re, (m, off, whole) => WRITE_CUE.test(whole.slice(0, off)) && !/\b(?:the\s+)?(?:text|title|caption|heading|label)\s+$/i.test(whole.slice(0, off)) ? m : put(text));
      if (making || !act) return t;   /* no verb ("small text "Jan" at 160,458"): a new text, not a reference */
      for (const x of canvasTexts) { const ws = textWords(x); if (!ws.length) continue;
        const re = new RegExp(`\\b(?:the\\s+)?(?:text|title|caption|heading|label)\\s+${ws.map(esc).join('[^\\p{L}\\p{N}⟪⟫⟦⟧⟬⟭]{1,4}')}(?![\\p{L}\\p{N}_])[?!.]?`, 'giu');
        t = t.replace(re, (m, off, whole) => /\b(?:of|from|on)\s*$/i.test(whole.slice(0, off)) || NEW_TEXT.test(whole.slice(0, off)) ? m : put(x, true)); }
      const NOUN_T = new RegExp(`\\b(?:the\\s+)?(?:text|title|caption|heading|label)\\s+(⟬\\d+⟭|⟪\\d+⟫|[A-Z][\\w'-]*(?:\\s+(?!${TEXT_REF_STOP}\\b)[A-Za-z0-9][\\w'-]*){0,3})(?=\\s+${TEXT_REF_STOP}\\b|\\s*[,.;:!?]|\\s*$)`, 'g');
      t = t.replace(NOUN_T, (m, x, off, whole) => {
        if (/\b(?:of|from|on)\s*$/i.test(whole.slice(0, off)) || NEW_TEXT.test(whole.slice(0, off))) return m;
        if (/^⟪/.test(x) && /\blabel\s/i.test(m)) return m;   /* 'delete the label "x"': the label, not an item */
        const k = /^⟬(\d+)⟭$/.exec(x), q = /^⟪(\d+)⟫$/.exec(x);
        if (k) { refs[+k[1]].label = true; return ' ' + x + ' '; }
        const text = q ? quotes[+q[1]] : x.trim();
        if (!q && nameIndex.has(text.toLowerCase())) return m;   /* "the label Start": a shape named Start */
        return put(text, true);
      });
      return t;
    }
    function clause(raw, isQ) {
      { const h = helpOf(raw); if (h) { pushWire('question', h, raw); return; } }   // a question about the editor itself (the help world)
      let t = ' ' + raw.trim().replace(/[,\s]+$/, '') + ' ';
      t = t.replace(new RegExp(`^\\s*(?:${OPENER}\\b[\\s,]*)+`, 'i'), ' ');
      if (!t.trim()) return;
      if (!isQ) t = unquotedText(t);   // "add a big title Roadmap": the words after the text noun are the text, as if quoted
      const textRefs = []; t = textRefsOut(t, textRefs);   // "delete Order flow", "delete the title "Order flow"": the items by the text they show
      /* the clause for the ops readers: known shape and group names masked ("group A and B as Flow": Flow is a name, not a layout word),
         and so are the new names a group / rename / create declares */
      t = t.replace(/([A-Za-z0-9_])\s*(?:->|→)\s*([A-Za-z_])/g, '$1 → $2');   /* "Process->Check": the arrow between two names */
      const tOps = opsMask(t);
      if (!(!isQ && opsSkipTemplate(tOps)) && templateClause(t.trim(), isQ)) return;   // a diagram template (timeline, pyramid, heart, ...); a re-layout by the links is not one
      const forced = new Set();   // words read as shape names because a shape noun + named/called stands before them
      t = nounBeforeName(t, forced);
      const firstWord = (t.trim().match(/^[A-Za-z']+/) || [''])[0].toLowerCase();
      const secondWord = (t.trim().split(/\s+/)[1] || '').toLowerCase();
      const C = { t, args: {}, marks: [] };
      const take = (re, fn) => { const m = C.t.match(re); if (!m) return null; C.t = C.t.slice(0, m.index) + ' ' + C.t.slice(m.index + m[0].length) + ' '; if (fn) fn(m); return m; };
      const mark = v => { C.marks.push(v); return ' ⟦' + (C.marks.length - 1) + '⟧ '; };
      /* the text references found by textRefsOut: a description by the text, mention label="…" (the engine's filterShapes matches it
         against the texts the items show; several matches make a delete ask first, holdDestructive) */
      C.t = C.t.replace(/⟬(\d+)⟭/g, (m, k) => { const e = textRefs[+k]; const id = 'm' + (++F.m); F.nodes.push({ id, type: 'mention', args: { label: e.text } }); const r = ref(id); lastRef = r; return mark(r); });
      const refsIn = s => [...s.matchAll(/⟦(\d+)⟧/g)].map(m => +m[1]);
      /* the ends of a connection: "between A and B", "from A to B", "A–B", "A→B line", "from A", "into B" -> from= / to= (a name, or a
         description such as "the red circle"); a capitalised word that is not a known name still counts as a name. Then the label text
         when it is not in quotes: after "as" / "to" / ":", or the words left after the verb. */
      function edgeRef() {
        const END = `(⟦\\d+⟧|[A-Z][\\w-]*|[a-z_]+\\d[\\w-]*)`, E = `(?:(?:the|this|that|an?)\\s+)?(?:${EDGE_WORDS})`, VIA = `(?:(?:that\\s+)?(?:goes|going|leads|leading|runs|running|points|pointing)\\s+)?`, ARW = `\\s*(?:\u2013|\u2014|->|\u2192|-|\\bto\\b|\\band\\b)\\s*`;
        const EP = [[`${E}\\s+${VIA}between\\s+${END}\\s+and\\s+${END}`, 'ft'], [`${E}\\s+${VIA}from\\s+${END}\\s+(?:to|into|towards?)\\s+${END}`, 'ft'], [`${E}\\s+${END}${ARW}${END}`, 'ft'],
          [`${END}${ARW}${END}\\s+(?:${EDGE_WORDS})`, 'ft'], [`${E}\\s+${VIA}(?:from|out\\s+of|leaving)\\s+${END}`, 'f'], [`${E}\\s+${VIA}(?:to|into|towards?|entering)\\s+${END}`, 't']];
        const val = x => { const m = /^⟦(\d+)⟧$/.exec(x); return m ? markVals([+m[1]]) : x; };
        for (const [re, how] of EP) {
          const m = take(new RegExp(re, 'i')); if (!m) continue;
          if (how === 'ft') { C.args.from = val(m[1]); C.args.to = val(m[2]); } else if (how === 'f') C.args.from = val(m[1]); else C.args.to = val(m[1]);
          C.edge = true; break;
        }
        if (!C.edge || kind !== 'command' || C.args.label != null) return;
        C.t = C.t.replace(/\b(?:the\s+|its\s+|a\s+|new\s+)*(?:label|caption|title|text|tag|name)\s+(?:of|on|for)\b/gi, ' ');
        const asText = x => x.split(/\s+/).filter(Boolean).map(w => { const m = /^⟦(\d+)⟧$/.exec(w); return m ? names(C.marks[+m[1]]).join(' ') : w; }).join(' ');
        const m = C.t.match(/(?:\bas|\bto|:)\s+((?:⟦\d+⟧|[A-Za-z0-9_][\w'-]*)(?:\s+(?:⟦\d+⟧|[A-Za-z0-9_][\w'-]*))*)\s*$/i);
        if (m) { C.args.label = asText(m[1]); C.t = C.t.slice(0, m.index) + ' '; return; }
        const rest = C.t.replace(VERB_RE, ' ').replace(/^\s*(?:name|call|retitle|relabel)\b/i, ' ').split(/\s+/).filter(w => w && !/^(?:the|a|an|it|its|of|on|with|label|caption|title|text|tag|name|say|says|read|reads|new|please)$/i.test(w));
        if (rest.length) { C.args.label = asText(rest.join(' ')); C.t = ' '; }
      }
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

      // ---- the label of an existing connection, and removing a label ----
      let edgeLabel = false, unlabel = false;
      if (kind === 'command' || kind === 'question') {
        const vm0 = t.match(VERB_RE), act0 = vm0 ? ACTION.get(vm0[1].toLowerCase()) : null, lead = (t.trim().match(/^[A-Za-z]+/) || [''])[0].toLowerCase();
        const labelObj = /\b(?:put|add|place|write|stick|attach|give|set)\s+(?:(?:a|an|the|this|that|its|new)\s+)*(?:label|caption|title|text|tag|name)\b/i.test(t);
        const quoteOn = /\b(?:put|place|stick|add|write)\s+⟪\d+⟫\s+(?:on|onto|in|inside|to)\b/i.test(t);   /* "put "Tray 2" on Tray": a label */
        unlabel = kind === 'command' && (lead === 'unlabel' || (act0 === 'delete' && REMOVE_LABEL.test(t)));   /* "unlabel" is not a verb cue (it would take "relabel" from the spelling fix), only a first word */
        const masked = t.replace(/[A-Za-z_][\w-]*/g, w => /^[A-Z]/.test(w) && nameIndex.has(w.toLowerCase()) ? 'Xname' : w);   // a shape named Wire or Link is not an arrow word
        if (EDGE_RAW.test(masked)) {
          if (kind === 'question') edgeLabel = /\b(?:say|says|said|label|labell?ed|caption|title|text|tag|read|reads|written|called|named)\b/i.test(t);
          else edgeLabel = unlabel || /^(?:name|call|label|relabel|unlabel|title|retitle|caption|tag|write|rename)$/.test(lead) || ['label', 'rename'].includes(act0) || labelObj || quoteOn
            || (act0 === 'set' && !['make', 'put', 'place'].includes(lead) && /\b(?:label|caption|title|text|tag|name|say|says|read|reads)\b/i.test(t))
            || (lead === 'make' && /\b(?:label|caption|title|text|say|says|read|reads)\b/i.test(t) && !/^\s*make\s+(?:a|an|another|new|\d+)\s/i.test(t));
        }
        if (kind === 'command' && (edgeLabel || unlabel || quoteOn)) action = 'label';   /* "label the arrow between A and B as X", "remove the label of Done" */
        /* a label removal is never a shape deletion: "remove all the labels on the arrows" (every arrow's label), "the labels on A→B and
           B→C: remove them both" (the arrows named by their ends) */
        if (kind === 'command' && act0 === 'delete' && !unlabel && /\b(?:labels?|captions?)\b/i.test(t) && !/\blabell?ed\b/i.test(t)) { unlabel = true; action = 'label'; }
        if (unlabel && !edgeLabel && new RegExp(`\\b(?:${EDGE_WORDS})\\b|→`, 'i').test(masked)) { edgeLabel = true; C.edgeKind = true; }
        /* "it" / "that" after a request about an arrow (a connection just made, an arrow named by its ends): a label, rename or label removal
           of that arrow ("what does the arrow between A and B say? rename it to "x"", "connect A to B, label it "x"", "delete that label") */
        if (kind === 'command' && lastEdge && (['label', 'rename'].includes(action) || unlabel || (!action && act0 && ['label', 'rename'].includes(act0))) && /\b(?:it|its|that|this)\b/i.test(t)
          && !(t.match(/[A-Za-z_][\w-]*/g) || []).some(w => /^[A-Z]/.test(w) && nameIndex.has(w.toLowerCase()) && w !== 'I' && w !== 'A')) {
          action = 'label'; edgeLabel = true; C.pronEdge = lastEdge; t = t.replace(new RegExp(`\\b(?:it|its|that|this)(?:\\s+(?:${EDGE_WORDS}))?\\b`, 'gi'), ' '); C.t = t;
        }
      }
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
          /* "put the label "x" on <a name or a description>", "place the caption "x" on it": the object is the label, not the shape (a free
             text with nothing to put it on is still read as create shape=text below) */
          if (['move', 'create', 'set'].includes(action) && /⟪\d+⟫/.test(t) && /\b(?:put|place|stick|attach|set|give|add|write)\s+(?:(?:a|an|the|this|that|its|new)\s+)*(?:label|caption|title|text|tag)\s+⟪\d+⟫/i.test(t)) action = 'label';
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
        /* a verbless operation only when every word is one the Rules read ("tree layout pls", "left to right", "less clutter"); a title or a
           remark ("Decision tree for the hiring flow.", "Tree anatomy.", "Cluster test.") is not a request */
        else if (!isQ && !/\b(?:where|what|which|who|how|why|when)\b/i.test(tOps) && !new RegExp(`(?<!\\b(?:in|into|as|on)\\s+)\\b(?:a|an|another|one|two|three|four|five|\\d+)\\s+${MOD}(?:${nounRe})\\b`, 'i').test(tOps) && (tOps.match(/[A-Za-z][A-Za-z0-9']*/g) || []).every(ruleWord) && opsVerbless(tOps, colorRe)) { const v = opsVerbless(tOps, colorRe); action = v.action; if (v.restyle) C.restyle = true; }   /* "Start-Done line red", "tree layout pls", "left to right", "less clutter" */
        else { F.notes.push(`I couldn't find an action in "${raw.trim()}".`); F.segments.push({ src: raw.trim().replace(/⟪(\d+)⟫/g, (m, n) => '"' + quotes[+n] + '"').replace(/\s+/g, ' '), id: null }); return; }
      }
      if (kind === 'command' && action && !['undo', 'redo', 'forget'].includes(action)) {   /* high-level layout operations, arrow restyling (HIGH_LEVEL_OPS.md) */
        const rs = opsRestyle(tOps, action, colorRe);
        if (rs) { action = rs; C.restyle = true; } else { const oa = opsAction(tOps, action); if (oa) action = oa; }
        /* "reverse that / the last step": an undo, not arrows (no arrow word, no shape named); "flip A and B": an exchange of two shapes */
        if (action === 'reverse' && !new RegExp(`\\b(?:${EDGE_WORDS}|direction|ends)\\b|→`, 'i').test(tOps) && !/\bXname\b/.test(tOps)) action = 'undo';
        if (action === 'flip' && /^\s*(?:flip|mirror)\s+(?:the\s+(?:positions?|places?)\s+of\s+)?(?:the\s+)?Xname\s+(?:and|with)\s+(?:the\s+)?Xname\s*$/i.test(tOps)) action = 'swap';
      }
      const isCmd = kind === 'command';
      /* a free text: a quoted text with nothing to put it on ("add a title "Q3" at the top", "write "Draft" in the corner", "title the
         diagram "Order flow"") -> create shape=text; a create needs a text noun (title, heading, text, caption, ...) and no shape noun;
         a name, a pronoun or a shape noun in the request means the text goes ON a shape (a label) */
      let textItem = false;
      if (isCmd && ['create', 'label', 'move'].includes(action) && /⟪\d+⟫/.test(t) && !edgeLabel && !unlabel) {
        /* a shape named only as the place of the text is not what it is written on: "write "START HERE" above Room1", "add the text
           "encrypted" below it" (a free text next to the shape); "write "x" on Room1" stays a label */
        const plain = t.replace(/⟪\d+⟫/g, ' ').replace(new RegExp(`\\b(?:above|below|under|over|beneath|underneath|next\\s+to|near|beside|by|(?:to\\s+the\\s+)?(?:left|right)\\s+of|between)\\s+(?:(?:the|a|an)\\s+)?(?:(?:${colorRe}|${sizeRe})\\s+){0,2}(?:${nounRe}\\s+)?(?:[A-Za-z_][\\w-]*)(?:\\s*(?:,|and)\\s*(?:the\\s+)?[A-Za-z_][\\w-]*)*`, 'gi'), ' ');
        const nameIn = (plain.match(/[A-Za-z_][\w-]*/g) || []).some(w => nameIndex.has(w.toLowerCase()) && !(TEXTW.has(w.toLowerCase()) && /^[a-z]/.test(w)) && !['a', 'I', 'A'].includes(w))
          || (nameIndex.has('a') && /\b(?:on|to|onto|of|for|at|near|beside|above|below|under|label|write|put)\s+A\b/.test(plain));
        const shapeNoun = new RegExp(`\\b(?:${nounRe})\\b`, 'i').test(plain), pron = /\b(?:it|them|this|that|these|those)\b/i.test(plain);
        const onSomething = /\bon\s+(?:the\s+|a\s+)?(?!(?:top|bottom|left|right|middle|center|centre|side|corner|canvas|page|diagram|screen|upper|lower)\b)[a-z]/i.test(plain);   // "write "Stop" on the red octagon": a label
        if (!nameIn && !pron && !shapeNoun && !onSomething && (action !== 'create' || TEXT_NOUN.test(plain))) { action = 'create'; textItem = true; }
      }

      // ---- rename's new name, declared names, labels ----
      if (unlabel) { C.args.label = ''; C.t = C.t.replace(REMOVE_LABEL, m => ' ' + ((/([A-Za-z_][\w-]*)['\u2019]s\s/.exec(m) || [])[1] || '') + ' ').replace(/\bunlabel\b/i, ' '); }   /* "delete Done's label" keeps Done */
      if (action === 'rename') take(/\b(?:to|as|into)\s+(⟪\d+⟫|[A-Za-z_][\w-]*)\s*$/i, m => C.args.name = unq(m[1]));
      if (action === 'group') { take(/\btogether\b/i); if (C.args.name == null) take(/\b(?:as|into)\s+(?:(?:a|an|one|the|new|single)\s+)*(?:group\s+)?(?:(?:called|named)\s+)?(⟪\d+⟫|[A-Za-z_][\w-]*)/i, m => { if (!/^(?:group|one|a)$/i.test(m[1])) C.args.name = unq(m[1]); }); }
      take(/\b(?:named|called|with\s+the\s+name|name\s+it)\s+(⟪\d+⟫|[A-Za-z_][\w-]*)/i, m => C.args.name = unq(m[1]));
      /* "label it "x"": the pronoun is the target ("it" belongs to the cue only on a create: "draw a box, label it "x"" is the new box) */
      take(new RegExp(`\\b(?:labell?ed|label${action === 'create' ? '(?:\\s+it)?' : ''}|with\\s+(?:the\\s+|a\\s+)?(?:text|label|caption|title|word)|saying|that\\s+says|which\\s+says|titled|reading|text)\\s+(⟪\\d+⟫)`, 'i'), m => C.args.label = unq(m[1]));
      if (C.args.label == null && ['create', 'connect', 'label', 'set'].includes(action)) take(/⟪(\d+)⟫/, m => C.args.label = quotes[+m[1]]);
      if (C.args.label == null && ['create', 'connect'].includes(action)) take(/\blabell?ed\s+([A-Za-z0-9_][\w-]*)/i, m => C.args.label = m[1]);
      if (kind === 'question' || kind === 'fact') take(/⟪(\d+)⟫/, m => C.args.label = quotes[+m[1]]);
      /* a quoted text left in a request that acts on shapes is a reference by name or by the text an item shows ('delete "Order flow"',
         'remove "Start"'; owner's session 2026-11-03: it was dropped and the request asked which shape); the engine resolves it */
      if (isCmd && !textItem && QUOTE_REF.includes(action) && !refsIn(C.t).length && !(C.t.match(/[A-Za-z_][\w-]*/g) || []).some(w => nameIndex.has(w.toLowerCase()) && w !== 'a' || /^(?:it|them|this|these|those)$/i.test(w))) C.t = C.t.replace(/⟪(\d+)⟫/g, (m, n) => { const q = String(quotes[+n]).trim(); if (!q) return m; if (nameIndex.has(q.toLowerCase()) && typeof nameIndex.get(q.toLowerCase()) === 'string') return mark(nameIndex.get(q.toLowerCase()));
        const id = 'm' + (++F.m); F.nodes.push({ id, type: 'mention', args: { label: q } }); return mark(ref(id)); });

      // ---- several new shapes in a layout: "in a circle (layout)", "arranged in a grid", "as a ring", "side by side", "stacked", "in a line" ----
      if (action === 'create') {
        const many = new RegExp(`\\b(?:${NUMRE}|several|few|couple|some)\\b`, 'i').test(C.t) || C.t.split(/\s+/).some(w => SHAPE.has(w.toLowerCase()) && pluralNoun(w.toLowerCase()));
        const LAY = { circle: 'circle', ring: 'circle', row: 'row', line: 'row', column: 'column', stack: 'column', grid: 'grid' };
        const arranged = `(?:(?:arranged|laid\\s+out|placed|set\\s+out|organi[sz]ed|positioned|spaced)\\s+)`;
        const LRE = new RegExp(`\\b(${arranged})?(?:in|into|as|on)\\s+(?:a|an|one)\\s+(circle|ring|row|line|column|stack|grid)(?:\\s+(?:layout|formation|pattern|arrangement|shape))?\\b`, 'i');
        const m0 = C.t.match(LRE);
        if (m0 && (many || m0[1])) take(LRE, m => C.args.layout = LAY[m[2].toLowerCase()]);
        else if (many) take(/\bside\s+by\s+side\b|\bnext\s+to\s+each\s+other\b/i, () => C.args.layout = 'row') || take(/\b(?:stacked(?:\s+up)?|in\s+a\s+stack|one\s+(?:above|on\s+top\s+of)\s+the\s+other|on\s+top\s+of\s+each\s+other)\b/i, () => C.args.layout = 'column');
      }
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
        for (const w of (mods || '').toLowerCase().split(/\s+/).filter(Boolean)) { if (COLOR.has(w)) a.color = COLOR.get(w); else if (SIZE.has(w)) a.size = SIZE.get(w); else if (LAYER_W[w] && !a.layer) a.layer = LAYER_W[w]; }
        if (noun && LAYER_W[noun.toLowerCase()] && !a.layer) a.layer = LAYER_W[noun.toLowerCase()];
        const id = 'm' + (++F.m); F.nodes.push({ id, type: 'mention', args: a }); return ref(id);
      };
      if (kind !== 'rule' && lastRef != null) C.t = C.t.replace(new RegExp(`\\b(?:this|that)\\s+(?:${MOD})(?:${nounRe})\\b`, 'gi'), m => pluralNoun(m.split(/\s+/).pop().toLowerCase()) ? m : mark(lastRef));
      if (kind !== 'rule') {
        C.t = C.t.replace(new RegExp(`\\b(the|all(?:\\s+of)?(?:\\s+the)?|every|each)\\s+((?:newest|new|last|latest|most\\s+recent|first|oldest|earliest)\\s+)?(${DMOD})(${nounRe}|${layerRe})\\b`, 'gi'), (m, art, rec, mods, noun, off, whole) => {
          if (LAYER_W[noun.toLowerCase()] && LAYER_INTO.test(whole.slice(0, off))) return m;   /* "send Start to the background": a place, not a description */
          if (isLayerName(noun) || mods.split(/\s+/).some(isLayerName)) return m;   /* "the Lane": a shape named Lane */
          if ((LAYER_W[noun.toLowerCase()] || mods.split(/\s+/).some(w => LAYER_W[w.toLowerCase()])) && !AFTER_VERB.test(whole.slice(0, off)) && !LAYER_ANCHOR.test(whole.slice(0, off))) return m;   /* a layer only as the object ("the lane is clear" is a remark) */
          const all = !rec && (/^(all|every|each)/i.test(art) || pluralNoun(noun.toLowerCase()));
          const r = mention(all, mods, noun, rec && rec.trim()); if (!all) lastRef = r; else lastGroup = r; return mark(r);
        });
        if (isCmd && action !== 'create') {
          /* every shape as the object, anywhere in the clause: "everything", "all (the) shapes", "the (whole) diagram", "them all" / "all
             of them" (the shapes said before when they are several, else every shape), and a bare "all" that does not quantify a following
             noun ("align all horizontally", "make all blue"; "all circles" was read above as a description). A connection keeps "all" only
             at the end ("connect them all to each other" is a pairing, "remove all connections" a quantifier). */
          const allShapes = () => { const r = mention(true, '', null); lastGroup = r; return mark(r); };
          const several = () => { const g = lastGroup; if (g == null) return null; if (Array.isArray(g)) return g.length > 1 ? g : null;
            const by = F.nodes.slice().reverse().find(x => x.type === 'command' && JSON.stringify(x.args.target) === JSON.stringify(g));
            if (by && by.args.action === 'delete') return null;   // "zap the diamonds, then line up them all": the deleted shapes are gone
            if (isRef(g)) { const n = F.nodes.find(x => x.id === g.ref); return n && ((n.type === 'mention' && n.args.quantifier === 'all') || (n.args && n.args.count > 1)) ? g : null; }
            return typeof g === 'string' && groupSet.has(g.toLowerCase()) ? g : null; };
          if (!['connect', 'disconnect'].includes(action)) C.t = C.t.replace(/\b(?:them|they|these|those)\s+all\b|\ball\s+of\s+(?:them|these|those)\b/gi, () => { const g = several(); return g ? mark(g) : allShapes(); });
          C.t = C.t.replace(/\beverything\b|\ball\s+(?:the\s+)?shapes\b/gi, allShapes);
          C.t = C.t.replace(/(^|\s)((?:the\s+)?(?:whole|entire)\s+(?:diagram|drawing|canvas|thing|picture|board|page)|the\s+(?:diagram|drawing|canvas))\b/gi, (m, pre, ph, off, whole) =>
            /\b(?:of|on|in|to|into|onto|from|across|at|around|over|throughout|for|within|inside|off|along)\s*$/i.test(whole.slice(0, off) + pre) ? m : pre + allShapes());
          if (['forget', 'undo', 'redo'].includes(action)) { /* "forget all rules": no shapes */ }
          else if (['connect', 'disconnect'].includes(action)) C.t = C.t.replace(/\ball(?=\s*$)/gi, () => mark(mention(true, '', null)));
          else C.t = C.t.replace(new RegExp(`\\ball\\b(?!\\s+(?:of|the|right|good|set|done|over|along|together\\s+now|at\\s+once|but|else|${NUMRE}|${EDGE_WORDS}|groups?|rules?|defaults?)\\b)(?!\\s+⟦)(?!\\s+(?:(?!(?:in|into|as|on|onto|at|to|a|an|by|with|from|around|near|next|above|below|under|over|left|right|evenly|out)\\b)[a-z-]+\\s+){1,2}(?:${nounRe})\\b)(?!\\s*-)`, 'gi'), (m, off, whole) => {
            const before = whole.slice(0, off), next = (whole.slice(off + m.length).match(/^\s+([A-Za-z_][\w-]*)/) || [])[1];
            if (/\b(?:at|after|above|first\s+of|in|is|are|was|were|be|been|that's|thats|it's|that\s+is)\s*$/i.test(before)) return m;   // "at all", "after all", "that's all", "they are all ..."
            if (next && /^[A-Z]/.test(next) && nameIndex.has(next.toLowerCase())) return m;   // "all A, B and C": the names are the targets
            return allShapes();
          });
          C.t = C.t.replace(new RegExp(`(^|\\s)(${DMOD})(${nounRe}|${layerRe})\\b`, 'gi'), (m, pre, mods, noun, off, whole) => {
            const lay = LAYER_W[noun.toLowerCase()], layMod = mods.split(/\s+/).some(w => LAYER_W[w.toLowerCase()]);
            if ((lay || layMod) && (isLayerName(noun) || mods.split(/\s+/).some(isLayerName) || !AFTER_VERB.test(whole.slice(0, off) + pre))) return lay ? m : pluralNoun(noun.toLowerCase()) && !generic.has(noun.toLowerCase()) ? pre + mods.replace(new RegExp(`\\b(?:${layerRe})\\b\\s*`, 'gi'), '') + mark(mention(true, mods.replace(new RegExp(`\\b(?:${layerRe})\\b`, 'gi'), ''), noun)) : m;   /* a layer word only right after the verb ("delete background boxes"); a name (Lane, Panel) never */
            if (lay && !pluralNoun(noun.toLowerCase())) return pre + mark(mention(false, mods, noun));   /* "delete background": the background */
            return pluralNoun(noun.toLowerCase()) && !generic.has(noun.toLowerCase()) || /^(shapes|nodes)$/i.test(noun) || (/\S/.test(mods) && mods.toLowerCase().split(/\s+/).some(w => LAYER_W[w]) && generic.has(noun.toLowerCase()) && pluralNoun(noun.toLowerCase())) ? pre + mark(mention(true, mods, noun)) : m; });
        } else if (kind === 'question') C.t = C.t.replace(/\beverything\b/gi, () => mark(mention(true, '', null)));
      }

      // ---- names and pronouns become references ----
      C.t = C.t.replace(new RegExp(`${M}\\s+(?:that|which|who)\\s+(?:are|is)\\s+not\\s+(${colorRe})\\b`, 'gi'), (m, i, col) => { const r = C.marks[+i]; const node = isRef(r) && F.nodes.find(n => n.id === r.ref && n.type === 'mention'); if (node) node.args.notColor = COLOR.get(col.toLowerCase()); return ` ⟦${i}⟧ `; });
      C.t = C.t.replace(/\b(?:this|that|the\s+same)\s+one\b/gi, m => lastRef ? mark(lastRef) : m);
      C.t = C.t.replace(/[A-Za-z_][\w-]*/g, (w, off, whole) => {
        const lw = w.toLowerCase();
        if (/^(it|its)$/.test(lw)) { if (lastRef != null) return mark(lastRef); F.notes.push(`I couldn't tell what "${w}" refers to.`); return w; }
        if (/^(them|they|both|those|these)$/.test(lw)) { if (lastGroup != null) return mark(lastGroup); return w; }
        if (forced.has(lw) && !nameIndex.has(lw)) return mark(w);
        if (!nameIndex.has(lw) || w === 'a' || w === 'I') return w;
        if (w === 'A' && ARTICLE_AHEAD.test(whole.slice(off + 1))) return w;
        return mark(nameIndex.get(lw));
      });

      C.t = C.t.replace(/\bthe\s+(?=⟦)/gi, ' ');
      if (C.pronEdge) { C.args.from = C.pronEdge.from; C.args.to = C.pronEdge.to; C.edge = true; }
      if (edgeLabel) edgeRef();
      if (C.edgeKind && C.args.from == null && C.args.to == null) {   /* label removal on arrows named by their ends "A → B", else on every arrow */
        const prs = [...C.t.matchAll(new RegExp(`${M}\\s*→\\s*${M}`, 'g'))];
        if (prs.length) { C.args.from = markVals(prs.map(m => +m[1])); C.args.to = markVals(prs.map(m => +m[2])); C.edge = true; }
        else { const rs = refsIn(C.t), every = /\b(?:all|every|each)\b/i.test(t);
          if (rs.length === 2 && !every) { C.args.from = markVals([rs[0]]); C.args.to = markVals([rs[1]]); }   /* "clear the arrow label Check Done" */
          else { C.args.kind = 'edge'; if (every) C.args.quantifier = 'all'; if (rs.length) C.args.target = markVals(rs); }   /* the arrows at those shapes, or every arrow */
          C.edge = true; }
      }
      { const toks = C.t.replace(/⟦\d+⟧|⟪\d+⟫/g, ' ').trim().split(/\s+/); toks.slice(1).forEach(w => { const c = w.replace(/[^\w-]/g, ''); if (c && /[A-Z]|\d/.test(c) && /^[A-Za-z_]/.test(c) && !COLOR.has(c.toLowerCase()) && !SHAPE.has(c.toLowerCase()) && !SIZE.has(c.toLowerCase()) && c !== 'A' && c !== 'I') F.notes.push(`"${c}" is not a shape I know.`); }); }
      // ---- question type, decided on the marked text ----
      let ask = null;
      if (kind === 'question') {
        const T = C.t.toLowerCase(), nref = refsIn(T).length;
        const groupRefs = refsIn(T).filter(i => typeof C.marks[i] === 'string' && groupSet.has(C.marks[i].toLowerCase()));
        if (C.edge) { ask = 'property'; C.args.property = 'label'; delete C.args.label; }   /* "what does the arrow from A to B say?" */
        else if (/\b(rules?|defaults?)\b/.test(T)) ask = 'rules';
        else if (nref && /\b(?:which|what)\s+groups?\b|\bbelongs?\s+to\b|\bpart\s+of\s+(?:a|any|which|what)\b|\bin\s+(?:a|any)\s+group\b|\bgroup\s+(?:is|does)\b/.test(T)) ask = 'groupOf';   /* "which group is Check in?" */
        else if (groupRefs.length && (/\b(?:in|inside|of)\s+⟦\d+⟧(?:\s+group)?\s*$/.test(T) || /\bcontains?\b|\bmembers?\b|\bholds?\b/.test(T))) ask = 'members';   /* "what is in Pipeline?" */
        else if (/\b(cycles?|loops?|circular)\b/.test(T)) ask = 'cycle';
        else if (/\b(path|route|reach(?:able|es|ed)?|get\s+from|get\s+to|go\s+from|leads?\s+to|flows?\s+to|indirectly|downstream|comes?\s+after)\b/.test(T)) ask = nref >= 2 ? 'path' : 'reachable';
        else if (/\bhow\s+many\s+(?:connections|links|edges|arrows|neighbou?rs|lines)\b/.test(T) && nref === 1 && /\b(does|has|have|do)\b/.test(T)) ask = 'degree';
        else if (/\b(most|fewest|least)\s+(?:connections|links|edges|arrows|connected|neighbou?rs)\b/.test(T)) { ask = 'extreme'; C.args.superlative = /\bmost\b/.test(T) ? 'mostConnected' : 'leastConnected'; }
        else if (/\bhow\s+many\b|\bcount\b|\bnumber\s+of\b/.test(T)) ask = 'count';
        else if (/\b(closest|nearest|furthest|farthest)\b/.test(T)) { ask = 'nearest'; C.args.superlative = /\b(furthest|farthest)\b/.test(T) ? 'farthest' : 'closest'; }
        else if (/\b(biggest|largest|smallest|tiniest|leftmost|rightmost|topmost|highest|lowest|bottommost)\b/.test(T)) { ask = 'extreme'; const w = T.match(/\b(biggest|largest|smallest|tiniest|leftmost|rightmost|topmost|highest|lowest|bottommost)\b/)[1]; C.args.superlative = { largest: 'biggest', tiniest: 'smallest', highest: 'topmost', lowest: 'bottommost' }[w] || w; }
        else if (new RegExp(`\\b(?:${EDGE_WORDS})\\s+between\\s+${M}\\s+and\\s+${M}`).test(T)) { ask = 'connected'; C.t = C.t.replace(/\bbetween\b/i, ' '); }   /* "is there a connection between A and B?" */
        else if (/^\s*(?:is|are)\s+there\b|^\s*(?:are|is)\s+any\b|^\s*any\b/.test(T)) ask = 'exists';
        else if (/\b(?:connected|linked|attached|joined)\b|\bneighbou?rs?\b|\bconnections?\b|\bconnects?\s+to\b|\bpoints?\s+to\b|\blinks?\s+to\b/.test(T)) ask = nref >= 2 ? 'connected' : 'neighbors';
        else if (/\b(bigger|larger|smaller)\s+than\b/.test(T)) ask = 'check';
        else if (/\bwhere\b/.test(T) && nref) { ask = 'property'; C.args.property = 'position'; }
        else if (/\bhow\s+(?:big|large|small)\b/.test(T) && nref) { ask = 'property'; C.args.property = 'size'; }
        else if (/\bwhat\b.*\b(colou?r|size|shape|label|text|written|position|location|outline|border)\b/.test(T) && nref) { ask = 'property'; const w = T.match(/\b(colou?r|size|shape|label|text|written|position|location|outline|border)\b/)[1]; C.args.property = { colour: 'color', text: 'label', written: 'label', location: 'position', border: 'outline' }[w] || w; }
        else if (new RegExp(`\\bwhat\\s+does\\s+${M}\\s+say\\b`).test(T)) { ask = 'property'; C.args.property = 'label'; }
        else if (/^\s*(?:is|are)\s+there\b|^\s*any\b/.test(T)) ask = 'exists';
        else if (/^\s*(is|are|does|do|has)\b/.test(T)) ask = 'check';
        else if (/\b(describe|summari[sz]e|overview|tell\s+me\s+about)\b|\bwhat'?s\s+on\b|\bwhat\s+is\s+on\b/.test(T) || new RegExp(`^\\s*what(?:'s|\\s+is)\\s+${M}\\s*$`).test(T)) ask = 'describe';
        else if (/\b(list|show|which|what)\b/.test(T)) ask = 'list';
        else ask = 'describe';
        C.args.ask = ask;
        if (['count', 'list'].includes(ask) && new RegExp(`\\b(?:${EDGE_WORDS})\\b`).test(T.replace(/\b(?:top|bottom|left|right|upper|lower)\s+edges?\b/g, ' ')) && !/\bconnected\b/.test(T)) C.args.kind = 'edge';   /* "along the right edge": a side of the canvas */
        if (['count', 'list', 'exists'].includes(ask) && !nref && /\bgroups?\b/.test(T)) C.args.kind = 'group';   /* "what groups are there?" */
      }

      // ---- the root / centre of a re-layout, the model of "the same … as X", "the whole diagram" (HIGH_LEVEL_OPS.md) ----
      if (isCmd && action === 'arrange') {
        const ROOT = new RegExp(`\\b(?:with|and|having|keep(?:ing)?|put(?:ting)?)\\s+(?:the\\s+)?${M}\\s+(?:as\\s+(?:the\\s+)?(?:root|top|head|hub|cent(?:er|re)|start|source|origin)|at\\s+the\\s+(?:top|root|head|cent(?:er|re)|middle|left|start|core)|on\\s+top|in\\s+the\\s+(?:cent(?:er|re)|middle))\\b|\\b(?:rooted\\s+(?:at|in|on)|starting\\s+(?:from|at|with)|beginning\\s+(?:from|at|with)|from|around|cent(?:er|re)d\\s+(?:on|at|around)|root(?:ed)?\\s*(?:=|:|is|being)?)\\s+(?:the\\s+)?${M}|\\b${M}\\s+(?:as\\s+(?:the\\s+)?(?:root|hub|cent(?:er|re)|top)|at\\s+the\\s+(?:top|root|cent(?:er|re)|middle|left)|in\\s+the\\s+(?:cent(?:er|re)|middle)|on\\s+top)\\b`, 'i');
        take(ROOT, m => { const i = m[1] || m[2] || m[3]; C.args.anchor = markVals([+i]); });
      }
      if (isCmd && action === 'equalize') take(new RegExp(`\\b(?:as|like|to\\s+match|matching)\\s+${M}`, 'i'), m => { C.args.anchor = markVals([+m[1]]); });
      if (isCmd && OPS_WHOLE_ACTIONS.includes(action) && !refsIn(C.t).length && !C.restyle) take(action === 'fit' ? OPS_WHOLE_FIT : OPS_WHOLE, () => { C.t += ' ' + mark(mention(true, '', null)); });
      // ---- roles that use prepositions ----
      const listOf = `${M}(?:\\s*(?:,|and|&)\\s*${M})*`;
      const grab = re => { let v = null; take(re, m => { v = markVals(refsIn(m[0])); }); return v; };
      if (action === 'connect' || action === 'disconnect' || ask === 'path' || C.restyle || action === 'reverse') {
        C.connRefs = refsIn(C.t);   /* every shape of the clause, in order: the list a pairing connects */
        if (action === 'disconnect') { const mm = C.t.match(new RegExp(`${M}\\s+from\\s+${M}`)); if (mm) { C.args.from = markVals([+mm[1]]); C.args.to = markVals([+mm[2]]); C.t = C.t.replace(mm[0], ' '); } }
        const f = C.args.from != null ? null : grab(new RegExp(`\\bfrom\\s+${M}`, 'i')); if (f != null) C.args.from = f;
        /* several to one: "connect A and B to C", "link A, B and C with D" -> from the list before to / with, to what follows it */
        if (action === 'connect' && C.args.from == null) { const mm = C.t.match(new RegExp(`(${M}(?:\\s*(?:,|and|&)\\s*${M})+)\\s+(?:to|with)\\s+${listOf}`, 'i'));
          if (mm && !/\b(?:to|with|from|into|and)\s*$/i.test(C.t.slice(0, mm.index))) { const head = refsIn(mm[1]); C.args.from = markVals(head); C.args.to = markVals(refsIn(mm[0]).slice(head.length)); C.t = C.t.replace(mm[0], ' '); } }
        const to = C.args.to != null ? null : grab(new RegExp(`\\b(?:to|with|and)\\s+${listOf}`, 'i')); if (to != null) C.args.to = to;
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
            /* inside / on a shape (the drawing tools' common sense, commonSense): "two eyes inside Head", "a circle in Head" (a create), "a
               roof on House" (a create; "on top of" stays above, as the annotation writes it) */
            ['inside', action === 'create' ? `\\b(?:inside(?:\\s+of)?|within|into|in)\\s+${listOf}` : `\\b(?:inside(?:\\s+of)?|within)\\s+${listOf}`],
            ['onTop', action === 'create' ? `\\b(?:onto|on)\\s+(?!top\\b)${listOf}` : `\\b(?!)x`],
            ['above', `\\b(?:above|over|on\\s+top\\s+of|onto)\\s+${listOf}`],
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
          if (C.args.position === 'onTop' && (C.args.at || C.args.position2 || /\bat\s+\d/.test(C.t) || /\b(?:top|bottom|upper|lower)[\s-]+(?:left|right)\b|\b(?:in|at)\s+the\s+(?:top|bottom|left|right|middle|center|centre)\b/i.test(C.t))) {
            /* "a boat on the sea, in the bottom left", "pillows on the bed at 160,355": "on X" only says what it lies on; the place is the other one */
            if (C.args.position2) { C.args.position = C.args.position2; C.args.anchor = C.args.anchor2; delete C.args.position2; delete C.args.anchor2; } else { delete C.args.position; delete C.args.anchor; }
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
      const sh = firstOf(SHAPE, v => v === 'any' || v === 'text');
      if (sh) {
        const cues = [...SHAPE.entries()].filter(([, v]) => v === sh).map(([k]) => k);
        const asNewKind = new RegExp(`\\b(?:a|an|into|to\\s+an?)\\s+(?:(?:${colorRe}|${sizeRe})\\s+){0,2}(?:${alt(cues)})\\b`, 'i').test(C.t);
        if (!(['set', 'resize'].includes(action) && !asNewKind)) C.args.shape = sh;
      }
      if (action === 'create' && !textItem && !C.args.template) {   /* what it depicts, as the object of the verb: "draw a sun", "add two clouds" (commonSense) */
        const OB = lx('object'), m = new RegExp(`\\b(?:${TEXT_VERBS})\\s+(?:(?:me|us|a|an|the|some|another|${NUMRE})\\s+)*(?:(?:${colorRe}|${sizeRe}|little|nice|new)\\s+){0,3}(${alt([...OB.keys()])})\\b`, 'i').exec(t);
        if (m && !nameIndex.has(m[1].toLowerCase())) C.args.object = OB.get(m[1].toLowerCase()); }
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
      /* the axis only when a word says it; without one the engine uses its default (horizontal) */
      if (action === 'distribute' || action === 'align') { if (/\b(vertical|vertically|column)\b/.test(rest)) C.args.axis = 'vertical'; else if (/\b(horizontal|horizontally|row)\b/.test(rest)) C.args.axis = 'horizontal'; }
      if (action === 'arrange') { const lay = rest.match(/\b(row|line|column|stack|grid|circle|ring)\b/); if (lay) C.args.layout = { line: 'row', stack: 'column', ring: 'circle' }[lay[1]] || lay[1]; else if (/\bvertical/.test(rest)) C.args.layout = 'column'; else if (/\bhorizontal/.test(rest)) C.args.layout = 'row'; delete C.args.shape; }
      if (isCmd && (C.restyle || ['arrange', 'improve', 'respace', 'snap', 'flip', 'reverse', 'sort', 'groupBy', 'equalize', 'straighten', 'untangle', 'fit', 'align'].includes(action))) opsArgs(C, action, raw);
      if (ask === 'property') { delete C.args.size; delete C.args.color; delete C.args.shape; }
      if (action === 'undo' || action === 'redo') { for (const k of Object.keys(C.args)) if (k !== 'count') delete C.args[k]; }
      if (action === 'resize' && C.args.scale == null && !C.args.size && /\b(shrink)\b/.test(words.join(' '))) C.args.scale = 0.67;

      // ---- whatever references are left are the targets ----
      const left = refsIn(C.t);
      if (C.edge && isCmd) left.length = 0;   /* a connection's label: the ends are from= / to=, nothing else is a target */
      if (left.length) {
        if (action === 'label' && C.args.label == null && !C.edge) { const m = C.t.match(new RegExp(`${M}\\s+(?:as\\s+|with\\s+)?([A-Za-z0-9_][\\w-]*)`)); if (m) C.args.label = m[2]; }
        if (action === 'rename' && C.args.name == null && left.length >= 2) { C.args.name = markVals([left.pop()]); }
        if (action === 'rename' && C.args.name == null) { const m = C.t.match(new RegExp(`${M}\\s+([A-Za-z_][\\w-]*)\\s*$`)); if (m) C.args.name = m[2]; }
        if (ask === 'nearest' && C.args.anchor == null) C.args.anchor = markVals([left.shift()]);
        if (left.length) C.args.target = markVals(left);
      }
      if (action === 'delete' && C.args.target == null && /\b(clear|wipe|reset|everything|start over|canvas|diagram)\b/i.test(raw)) C.args.target = mention(true, '', null);
      if (textItem) { C.args.shape = 'text'; for (const k of ['target', 'count', 'outline', 'linked', 'anchor2', 'position2']) delete C.args[k]; }
      if (action === 'arrange' && C.args.target != null && C.args.layout == null && /\bgrid\b/i.test(raw)) C.args.layout = 'grid';

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
      /* "connect A to B, label it "x"": the label of the connection just made (one request) */
      if (C.pronEdge && C.pronEdge.node && action === 'label' && args.label != null && args.label !== '' && F.nodes[F.nodes.length - 1] === C.pronEdge.node && C.pronEdge.node.args.label == null) { C.pronEdge.node.args.label = args.label; return; }
      const node = { id, type: kind, args };
      Object.defineProperty(node, 'src', { value: raw.trim().replace(/⟪(\d+)⟫/g, (m, n) => '"' + quotes[+n] + '"').replace(/\s+/g, ' '), enumerable: false });
      F.nodes.push(node); F.segments.push({ src: node.src, id });
      if (action === 'connect' && !args.pairing && args.from != null && args.to != null && !Array.isArray(args.from) && !Array.isArray(args.to)) lastEdge = { from: args.from, to: args.to, node };
      else if (C.edge && args.from != null && args.to != null && args.kind == null) lastEdge = { from: args.from, to: args.to, node: null };
      else if (args.target != null || action === 'create') lastEdge = null;
      if (action === 'create' && args.name != null && !args.count) nameIndex.set(String(args.name).toLowerCase(), ref(id));
      if (action === 'rename' && args.name != null) nameIndex.set(String(args.name).toLowerCase(), String(args.name));
      if (['create', 'duplicate'].includes(action)) { lastRef = ref(id); lastGroup = ref(id); }
      else if (args.target != null && !Array.isArray(args.target)) lastRef = args.target;
      else if (Array.isArray(args.target)) lastGroup = args.target;
      if (action === 'connect' && args.to != null && !Array.isArray(args.to)) lastRef = args.to;
      if (isCmd && ['move', 'set', 'resize', 'delete', 'label', 'rename', 'duplicate', 'swap', 'align'].includes(action) && args.target == null && args.from == null && args.to == null && args.kind == null) F.notes.push(`@${id}: no target found; the interpreter will ask which shape you mean.`);
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
      budget.tick('diagram.words');
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
   6b. Destructive requests: cautious by design
   ===================================================================== */
/* The owner's first session (training/sketch/collected/SESSION_1_ANALYSIS.md, turn 15): "Delete background boxes" was read as "delete every
   rectangle" with confidence 0.957, above the safety threshold, and deleted Backdrop, both zones and Process with its two links; "delete
   "order flow"" was read as "forget the rules" twice at "execute all". A request that removes something is never executed by accident:
     (a) a destructive request (delete, disconnect, forget, clear, and ungroup when it removes a group) executes only when its confidence is
         at or above the DEFAULT safety threshold of its tab, also when the tab is set to a bolder level or to "execute all"; below it, it is
         held with the reason "a deleting request needs the safety threshold";
     (b) a destructive request whose target is a description (a mention: "the circles", "the background boxes"), not names, and that would
         remove more than one item is held at every level and in every tab (the Rules too), and the reply lists the items: "Delete Start and
         Done? Write their names, or press Do it anyway."; "everything" ("Clear the canvas", a mention whose only filter is quantifier=all)
         is not such a description: it says exactly what goes (owner, 2026-11-03), so only (a) applies to it;
     (c) the reply of every held destructive request says exactly what Do it anyway would remove (a dry run of the request on a copy of the
         drawing: the shapes, the links that go with them, the groups, the rules).
   Pure engine-side code (no DOM): ui.js calls holdDestructive on each gate; test_diagram_ops.mjs checks it. */
const DESTRUCTIVE = ['delete', 'disconnect', 'forget', 'ungroup', 'clear'];
const isDestructive = n => n && n.type === 'command' && DESTRUCTIVE.includes(n.args && n.args.action);
/** a dry run of nodes on the engine's world: the world, its history and the placement frame are restored afterwards -> the run's result */
function previewRun(engine, nodes, opts) {
  const W = engine.world, st = W.snapshot(), u = W.undoStack.slice(), r = W.redoStack.slice(), fx = FR.x, fy = FR.y;
  try { return engine.run(nodes, opts); } finally { W.restore(st); W.undoStack = u; W.redoStack = r; FR.x = fx; FR.y = fy; }
}
const refIds = v => isRef(v) ? [v.ref] : Array.isArray(v) ? v.flatMap(refIds) : [];
/** what a request would remove: nodes = the request's wires (a command and its mentions), before = the wires executed before it in the same
 *  message (they run first in the dry run), opts.overrides as Engine.run. -> null when it is not destructive or removes nothing, else
 *  {action, described (its target is a description, not names), count (the items it removes: shapes for delete, links for disconnect,
 *  groups for ungroup, rules for forget), shapes, edges, groups, rules, question ("Delete Start and Done?"), removes (the full list in
 *  words: "Start and Done, and the links Start → Process and Check → Done")} */
function destructiveCheck(engine, nodes, before, opts) {
  const main = (nodes || []).filter(isDestructive); if (!main.length) return null;
  const rulesBefore = engine.world.state.rules.length, own = new Set(nodes.map(n => n.id));
  const res = previewRun(engine, (before || []).concat(nodes), opts);
  const shapes = [], edges = [], groups = []; let rules = 0;
  for (const st of res.steps) {
    if (!own.has(st.node.id) || st.error || st.skipped) continue;
    for (const p of st.patches) {
      if (p.op === 'remove') shapes.push(p.name);
      else if (p.op === 'unlink' && p.edge) edges.push(edgeEnds(p.edge));
      else if (p.op === 'ungroup' && p.group) groups.push(p.name);
      else if (p.op === 'forget') rules = rulesBefore;
    }
  }
  if (!shapes.length && !edges.length && !groups.length && !rules) return null;
  const mentions = new Set(nodes.filter(n => n.type === 'mention').map(n => n.id));
  const a = main[0].args, action = a.action === 'clear' ? 'delete' : a.action;
  const roleIds = ['target', 'from', 'to'].flatMap(k => refIds(a[k]));
  const mentionOf = id => nodes.find(n => n.id === id && n.type === 'mention') || (before || []).find(b => b.id === id && b.type === 'mention');
  const described = roleIds.some(id => mentions.has(id) || !!mentionOf(id));
  // "Clear the canvas", "delete everything": a mention with no filter but quantifier=all names its scope exactly (every item on the
  // drawing), so it is not a description that may match more than the person meant (owner, 2026-11-03: an explicit clear is allowed;
  // it is one step that Undo brings back). Rule (a), the safety threshold, still applies to it.
  const everything = described && roleIds.every(id => { const m = mentionOf(id); return m && m.args && m.args.quantifier === 'all' && Object.keys(m.args).every(k => k === 'quantifier'); });
  const gs = groups.filter(g => !shapes.length || action === 'ungroup');   // a group that goes with its shapes is not listed apart
  const count = action === 'delete' ? shapes.length : action === 'disconnect' ? edges.length : action === 'ungroup' ? gs.length : action === 'forget' ? rules : shapes.length + edges.length;
  const linkWords = es => `the link${es.length === 1 ? '' : 's'} ${listing(es)}`;
  const parts = [];
  if (shapes.length) parts.push(listing(shapes));
  if (edges.length) parts.push(linkWords(edges));
  if (gs.length) parts.push(`the group${gs.length === 1 ? '' : 's'} ${listing(gs)}`);
  if (rules) parts.push(`${rules === 1 ? 'the rule' : `all ${rules} rules`}`);
  const removes = parts.length > 1 ? parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1] : parts[0];
  const question = action === 'delete' ? `Delete ${listing(shapes)}?` : action === 'disconnect' ? `Remove ${linkWords(edges)}?` : action === 'ungroup' ? `Ungroup ${listing(gs)}?` : action === 'forget' ? `Forget ${rules === 1 ? 'the rule' : `all ${rules} rules`}?` : `Remove ${removes}?`;
  return { action, described, everything, count, shapes, edges, groups: gs, rules, question, removes, verb: action === 'ungroup' ? 'ungroup' : action === 'forget' ? 'forget' : action === 'disconnect' ? 'remove' : 'delete' };
}
const DESTRUCTIVE_REASON = 'a deleting request needs the safety threshold';
/** the policy above on a gate (ui.js GATES; vss-confidence.js gate): units [{nodes, conf, execute, reasons, dependsOn?}] in message order.
 *  opts.safe = the confidence a destructive request needs (the tab's safety threshold; NaN or undefined when unknown, which holds it unless
 *  opts.gated is false: the Rules have no confidence and no gate level, only rule (b) applies to them); opts.overrides as Engine.run.
 *  Each destructive unit gets u.destructive = destructiveCheck(...) (held or not, for the reply's "Do it anyway would delete ..."); a unit
 *  newly held gets u.reasons = [{group: 'destructive', text}], and the units that use its wires are held too. -> the number of units newly held */
function holdDestructive(engine, units, opts) {
  opts = opts || {};
  const gated = opts.gated !== false, before = [];
  let n = 0;
  const off = new Set();
  for (const u of units) {
    const usesHeld = u.execute && u.nodes.some(x => Object.values(x.args || {}).flatMap(refIds).some(id => units.some(o => o !== u && off.has(o) && o.nodes.some(y => y.id === id))));
    if (usesHeld) { const d = units.find(o => off.has(o) && o.nodes.some(y => u.nodes.some(x => Object.values(x.args || {}).flatMap(refIds).includes(y.id)))); u.execute = false; u.reasons = [{ group: 'depends', text: `it uses what “${d.src}” would have made, which was not done` }]; off.add(u); n++; continue; }
    let chk = null; try { chk = destructiveCheck(engine, u.nodes, before, { overrides: opts.overrides }); } catch (e) { chk = null; }
    if (chk) u.destructive = chk;
    if (u.execute && chk) {
      const low = gated && !(u.conf >= opts.safe), many = chk.described && !chk.everything && chk.count > 1;
      if (low || many) {
        u.execute = false; off.add(u); n++;
        u.reasons = [{ group: 'destructive', text: low ? DESTRUCTIVE_REASON : `it would ${chk.verb} ${chk.count} items that the request describes but does not name` }].concat(low && many ? [{ group: 'destructive', text: `it would ${chk.verb} ${chk.count} items that the request describes but does not name` }] : []);
        continue;
      }
    }
    if (u.execute) before.push(...u.nodes);
  }
  return n;
}

/* =====================================================================
   7. Assembly
   ===================================================================== */
/** the world written back as SOP wires (shapes, edges, rules, groups): what a backend receives after lowering; the World view shows it */
function worldNodes(state) {
  const S = state, out = [];
  for (const s of S.shapes) out.push({ id: s.name, type: 'shape', args: Object.assign({ shape: s.shape, size: sizeName(s.size), color: s.color }, s.outline ? { outline: s.outline } : {}, s.fill ? { fill: s.fill } : {}, s.layer ? { layer: s.layer } : {}, s.label ? { label: s.label } : {}, { at: [s.x, s.y] }, s.w && s.shape !== 'text' ? { width: s.w, height: s.h } : {}) });
  for (const e of S.edges) out.push({ id: e.id, type: 'edge', args: Object.assign({ from: ref(e.from), to: ref(e.to), style: e.style, arrow: e.arrow }, e.color ? { color: e.color } : {}, e.label ? { label: e.label } : {}) });
  for (const r of S.rules) { const a = {}; ['shape', 'size', 'color', 'outline'].forEach(k => { if (r[k]) a[k] = r[k]; }); out.push({ id: r.id, type: 'rule', args: a }); }
  for (const g of S.groups || []) out.push({ id: g.name, type: 'group', args: { members: g.members.map(ref) } });
  return out;
}
const worldSOP = state => worldNodes(state).map(serialize).join('\n');

function createSystem(opts = {}) {
  const world = new DiagramWorld();
  const engine = new Engine(world);
  const TK = templateKit(), HA = helpAnswers();
  [corePlugin, historyPlugin, shapesPlugin, groupsPlugin, connectionsPlugin, layoutPlugin, queriesPlugin, reasoningPlugin, logicPlugin, rulesPlugin, factsPlugin, opsPlugin].concat(TK ? [makeTemplatesPlugin(TK)] : [], HA ? [makeHelpPlugin(HA)] : []).forEach(p => engine.use(Object.assign({}, p)));
  engine.legend.define('core', 'action', { ask: 'What should happen?', kind: 'enum' });
  if (HA) engine.legend.define('help', 'topic', HA.topicLegend(HA.contextFromEngine(engine, {})).topic);   // every topic of the legend, after the other plugins
  const formalize = makeFormalizer(engine);
  /** cut(input, ctx): the rules' cut as character offsets [{c0, c1, src}] (rulesCut) */
  return { world, engine, formalize, cut: (input, ctx) => rulesCut(formalize, input, ctx) };
}

return { createSystem, CELL, cellOf, parse, serialize, fmtValue, isRef, names, SOPError, Clarify, CANVAS, COLOR_HEX, PALETTE, PALETTE_ARROW, PALETTE_TINT, SIZE_PX, FONT_PX, fontOf, dims, sizeName, region, edgeText, groupBox, groupLabels, tagBox, edgeRoutes, worldNodes, worldSOP, DESTRUCTIVE, DESTRUCTIVE_REASON, previewRun, destructiveCheck, holdDestructive };
})();

/*LOGIC-END*/

export default SOPKit;
