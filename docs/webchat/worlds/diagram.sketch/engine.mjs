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
import * as space from '../space/space.mjs?v=42696277df';   // where things are, which one is meant by its place, how far a move goes, free layouts (shared module, specs/18)
import { THINGS, THING_WORDS } from '../art.draw/things.catalog.mjs?v=e80e46533e';
import * as DG from '../../lib/knowledge/diagram-world.mjs?v=5df69eaeee';   // diagrams composed from knowledge (spec 14 section 9): kinds, topics, the library's composeDiagram / sampleDiagram   // the catalog of drawable things (knowledge/k.objects), shared with the drawing board
import { budget, TAB, MAX_HISTORY, K, loadEngine, engineReady, initialState, ensure, ok, no, open, WORLD_KEYS, PREFIX, KIND_OF_PREFIX, ID_RE, LONG_RE, shapeOf, idOf, nextId, assignIds, systemFor, writeBack, resetSystem } from "./core.mjs?v=e118391175";
export { loadEngine, engineReady, initialState, PREFIX, shapeOf, idOf };
/** Async hook called by the dialog layer before this world's operations run (spec 04): the first sentence waits for the engine instead of being refused. */
let DL = null;   // the library module, once loaded: composing a diagram needs it (spec 14 section 9)
if (typeof process !== 'undefined' && process.versions?.node) DL = await DG.diagramLibrary().catch(() => null);   // under Node at once; a browser fetches it with the engine
export const prepare = () => Promise.all([loadEngine(), DG.diagramLibrary().then((l) => { DL = l; return l; }).catch(() => null)]);
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
/** P6: an internal id inside a sentence that names shapes ("c1 → s1 already exists", "change about c1, s1 and c2") is said in plain words ("circle 1 → square 1"). */
const plainIds = (s, text) => String(text).replace(/(?<![\w-])([crsdetxhk]\d+)(?![\w-])/gi, (m) => plain(s, m, true));
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
/** Every token that names a shape: its name, its short id and its old long name (circle1 for c1). */
const longName = (x) => { const m = ID_RE.exec(idOf(x)); return m ? `${KIND_OF_PREFIX[m[1].toLowerCase()]}${m[2]}` : null; };
const nameTokens = (s) => [...new Set(s.shapes.flatMap((x) => [x.name, x.id, longName(x)]).filter(Boolean).concat((s.groups ?? []).map((g) => g.name)))];
const readerCtx = (s) => ({
  names: nameTokens(s),
  last: (s.last ?? []).length ? s.last.slice() : undefined,   // the engine reader takes an array of names (lastRef when one, lastGroup for "them"): a {ref} object was read as no referent, so "make it red" never resolved
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
/** The way a shape went, from where it was (`from`) to where it is: "up", "down and to the left"; null when it did not move. The canvas y grows downwards. */
function wayMoved(from, to) {
  if (!from || !to) return null;
  const dx = Math.round(Number(to.x) - Number(from.x)), dy = Math.round(Number(to.y) - Number(from.y));
  if (!dx && !dy) return null;
  const v = dy < 0 ? 'up' : dy > 0 ? 'down' : null, h = dx < 0 ? 'to the left' : dx > 0 ? 'to the right' : null;
  return Math.abs(dy) >= 2 * Math.abs(dx) ? v : Math.abs(dx) >= 2 * Math.abs(dy) ? h : `${v} and ${h}`;
}
/**
 * Turns the effects of a run into one or two plain sentences (ported from summarize() of engine/ui.js). `from` (name -> {x, y} before the run) makes the reply say what
 * changed (owner 2026-11-15, class C): a move says which way each shape went, a shape set to where it already was is not "moved", and a run that changed nothing says so
 * ("Nothing changed.") instead of "Done.".
 */
let lastSay = null;   // the composable frame of the last summary (set by summarize, read right after it)
function summarize(result, s, from = null) {
  lastSay = null;
  const adds = [], links = [], unlinks = [], dels = [], moved = [], changed = [], renames = [], rules = [], said = [], answers = [], edgeSets = [], ways = new Map();
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
        if ('x' in p.props && !moved.includes(p.name)) {
          const now = s.shapes.find((x) => x.name === p.name);
          const way = from ? wayMoved(from.get(p.name), now) : undefined;
          if (way !== null) moved.push(p.name);
          if (way) ways.set(p.name, way);
        }
        const ch = Object.entries(p.props).filter(([k]) => k !== 'x' && k !== 'y').map(([k, v]) => (k === 'size' ? K.sizeName(v) : k === 'label' ? `labeled “${v}”` : k === 'outline' ? (v ? `${v} outline` : 'no outline') : k === 'shape' ? `a ${v}` : String(v)));
        if (ch.length) changed.push(`${plain(s, p.name)} is now ${listing(ch)}`);
      }
    }
    if (st.answer && !ownAnswer) answers.push(st.answer);
    for (const n of st.notes || []) if (/^(reverted|re-applied|there was nothing)|already/.test(n)) said.push(plainIds(s, n).replace(/^./, (c) => c.toUpperCase()) + '.');
  }
  const out = [];
  if (adds.length) out.push(`Drew ${few(drawnPhrase(s, adds), 6)}.`);
  if (links.length) out.push(`Connected ${few(links, 4)}.`);
  if (renames.length) out.push(`Renamed ${listing(renames)}.`);
  if (changed.length) out.push(changed.slice(0, 4).join('; ') + (changed.length > 4 ? `; and ${changed.length - 4} more.` : '.'));
  if (moved.length) {
    // the way is said when the move is the whole reply and every shape went the same way ("Moved work done and problems up."); an arrangement, a spacing or a fit says
    // what it did in its own sentence, where a way per shape would only be noise
    const w = new Set(moved.map((n) => ways.get(n) ?? ''));
    const way = !answers.length && !said.length && w.size === 1 ? [...w][0] : '';
    out.push(`Moved ${few(moved.map((n) => plain(s, n)), 5)}${way ? ` ${way}` : ''}.`);
    // the frame of a move that is the whole reply, one way, at most 5 shapes: another language composes it with the doer acting on the things ("Am mutat „work done” în sus.", spec 06)
    const dir = { up: 'up', down: 'down', 'to the left': 'left', 'to the right': 'right' }[way];
    if (dir && moved.length <= 5 && moved.every((n) => plain(s, n) === n && !ID_RE.test(String(n)))) lastSay = { act: `done.place.${dir}`, roles: { things: { names: moved.map((n) => plain(s, n).replace(/_/g, ' ')) } } };
  }
  out.push(...edgeSentences(edgeSets, s));
  if (unlinks.length) out.push(`Removed the arrow${unlinks.length > 1 ? 's' : ''} ${few(unlinks, 4)}.`);
  if (dels.length) out.push(`Deleted ${few(dels, 6)}.`);
  for (const r of rules) out.push(`From now on, new ${r.shape ? `${r.shape}s` : 'shapes'} will be ${['size', 'color'].filter((k) => r[k]).map((k) => r[k]).join(' ')}${r.outline ? ` with a ${r.outline} outline` : ''}.`);
  out.push(...said.map((x) => x.replace(/^Reverted 1 turn\.$/, 'Undid the last change.').replace(/^Re-applied 1 turn\.$/, 'Redid it.')));
  out.push(...answers);
  return out.join(' ') || NOTHING;
}
const NOTHING = 'Nothing changed.';

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
    // the verb says bring / send but the end of the stack is named by the place: "send Sun to the front" brings it to the front, "bring Sun to the back" sends it back
    if (a.action === 'toBack' && /\b(?:front|top)\b/i.test(text) && !/\b(?:back|bottom|behind)\b/i.test(text)) a.action = 'toFront';
    else if (a.action === 'toFront' && /\b(?:back|bottom)\b/i.test(text) && !/\b(?:front|top)\b/i.test(text)) a.action = 'toBack';
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
function execute(ctx, s, nodes, { place = true } = {}) {
  const system = systemFor(s);
  const before = system.world.state.shapes.length;
  const from = new Map((s.shapes ?? []).map((x) => [x.name, { x: x.x, y: x.y }]));
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
  if (place && made.length && made.length <= 4) placeFree(s, made);   // (a composed diagram has its own layout: its places are explicit)
  if (made.length) { s.rev = (s.rev ?? 0) + 1; }
  // only a selection or the answer of a question marks shapes: what a template or a command made is not highlighted
  const hl = [...result.steps].reverse().find((st) => st.highlight && !st.error && !st.node?.args?.template)?.highlight;
  s.selected = hl && (hl.shapes?.length || hl.edges?.length) ? { shapes: [...new Set(hl.shapes ?? [])], edges: [...new Set(hl.edges ?? [])] } : null;
  if (result.changed || s.shapes.length !== before) open(ctx);
  if (!result.ok) {
    const err = result.error;
    const text = summarize({ steps: result.steps.filter((st) => !st.error) }, s, from);
    const said = shortNames(s, /^What should change about /.test(err?.message ?? '') ? plainIds(s, err.message) : (err?.message ?? 'I could not do that.'));
    const clarify = err && err.name === 'Clarify';
    if (result.partial && text.trim() === NOTHING) return no(said, 'missing');   // nothing was done: the reply is the question, not "Done. But: ..."
    if (result.partial) return ok(`${shortNames(s, text)} But: ${said}`);
    return no(said, clarify ? 'missing' : 'unsupported');
  }
  open(ctx);
  const said = summarize(result, s, from), say = lastSay;
  const text = `${s.keptNote ? `${s.keptNote} ` : ''}${shortNames(s, said)}`;
  return ok(text, say && !s.keptNote && /^Moved [^.]*\.$/.test(text) ? { say } : undefined);
}

/** What the dice may say on this tab: a diagram of each kind about a topic the knowledge can draw (src/knowledge/diagram-world.mjs); nothing until the library is loaded. */
export function diagramSentences(ctx) {
  if (!DL) return [];
  try { return DG.diagramSentences(DL, DG.diagramWorldOf(DL, ctx?.knowledge)); } catch { return []; }
}
const NUMBER_WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
/**
 * A diagram of a kind about a topic, or a random one, composed from knowledge by the library (`composeDiagram`, `sampleDiagram`: a kind of k.diagrams x a topic whose knowledge has that
 * structure, laid out by `arrange`; spec 14 section 9) and drawn here as shapes and arrows. Nothing is canned: when the knowledge has no such structure the reply says so.
 * `req` is `parseDiagramRequest`'s: { kind, topic } | { kind?, random }. Returns null when the sentence is not the diagram's to refuse (a list of labels, a weak reading): the engine reads it.
 */
function composedDiagram(ctx, s, req, args = {}) {
  if (!DL) return no('The diagram knowledge is still loading. Please say that again in a moment.', 'missing');
  const world = DG.diagramWorldOf(DL, ctx.knowledge);
  const seed = Number.isFinite(Number(args.seed)) ? Number(args.seed) : Math.floor(Math.random() * 2 ** 31);
  const got = req.random ? DG.sampleDiagrams(DL, world, { seed, kinds: req.kind }) : DG.composeForRequest(DL, world, req, { seed });
  if (got.why) {
    if (!req.random && (req.weak || /,|\band\b/i.test(req.topic))) return null;   // "a flowchart of Start, Process and End" lists its own labels; "draw a circle in a tree" is not a diagram request
    return no(req.random ? `I do not know enough to draw a ${req.kind ?? 'random'} diagram yet.` : `I do not know enough about ${String(req.topic).replace(/^(?:the|a|an)\s+/i, '')} to draw a ${req.said} of it yet.`, 'unsupported');
  }
  const taken = new Set(s.shapes.flatMap((x) => [x.name, x.id].filter(Boolean))), had = s.shapes.length;
  const res = execute(ctx, s, DG.engineNodes(got.diagram, taken), { place: false });
  if (res.status !== 'supported') return res;
  s.composed = { kind: got.diagram.kind, topic: got.topic, fill: got.diagram.fill, n: (s.composed?.n ?? 0) + 1 };   // what the last composed diagram was (for "why")
  return { ...res, value: `${s.keptNote ? `${s.keptNote} ` : ''}${DG.say(got.diagram, got.topic, { random: !!req.random })}${had ? ' It is on top of what was there; undo takes it away.' : ''}` };
}

const NOT_READY = () => { loadEngine(); return no('The diagram engine is still loading. Please say that again in a moment.', 'missing'); };

// ---- the place of things: handed to the shared module `space` ------------------------------------------------------------------
const SPACE_FRAME = { w: 800, h: 500, step: 80 };   // the engine's canvas and the length of one plain move
const SPACE_KINDS = { circle: 'circle', square: 'square', rectangle: 'rectangle', triangle: 'triangle', diamond: 'diamond', ellipse: 'ellipse', oval: 'ellipse', hexagon: 'hexagon', star: 'star', text: 'text', box: '*', shape: '*', thing: '*', node: '*', item: '*' };
const spaceKind = (w) => { const b = space.words([w])[0], k = SPACE_KINDS[b] ?? SPACE_KINDS[b.replace(/e?s$/, '')]; return k ? { kind: k, plural: b.endsWith('s') && !SPACE_KINDS[b] } : null; };
const SPACE_ACTIONS = new Set(['move', 'align', 'arrange', 'distribute', 'respace', 'improve', 'swap', 'snap', 'fit']);
/** The shapes as the module sees them: the centre (relative to the frame), the box; the id is the name. */
function spaceItems(s) {
  const fr = s.frame ?? { x: 0, y: 0 };
  return s.shapes.filter((x) => !x.layer && !x.template).map((x) => {
    const k = x.size, w = x.w ?? (x.shape === 'rectangle' ? Math.round(k * 1.6) : x.shape === 'ellipse' ? Math.round(k * 1.45) : k), h = x.h ?? k;
    const shape = space.outlineOf(x.shape, w, h);   // the real outline of a triangle, a diamond ...: overlap and joining use the surface, not the box
    return { id: x.name, kind: x.shape, name: x.shape, x: x.x - fr.x, y: x.y - fr.y, w, h, ...(shape ? { shape } : {}) };
  });
}
/** A moving or arranging sentence the module reads (the middle box, a bit more to the left, further, in a row, tidy up ...), or null to leave it to the engine. */
function spaceTry(text, s, kind) {
  if (!SPACE_ACTIONS.has(kind.name) || !/\b(?:move|put|place|shift|push|slide|nudge|drag|further|more|again|row|column|grid|circle|line|tidy|align|spread|space|swap|centre|center|layout|neaten|clean|stack|stacked|pile|height|size|around|corner|corners)\b/i.test(text)) return null;
  const items = spaceItems(s);
  if (items.length < 1) return null;
  const r = space.interpret(text, { items, frame: SPACE_FRAME, kindOf: spaceKind, last: s.last ?? [], lastMove: s.lastMove });
  if (!r) return null;

  if (r.type === 'ask') return no(r.say, 'missing');
  if (r.type === 'error') return null;   // what the module cannot read, the engine reads or refuses in its own words
  // the engine's layout (row, column, grid, circle, align, distribute, its score) stays; the module tidies free shapes that overlap ("make a better layout" when nothing is connected)
  if (r.type === 'layout' && (!['tidy', 'swap', 'around', 'height', 'stack', 'corners'].includes(r.op) || (['tidy', 'swap'].includes(r.op) && s.edges.length) || !Object.keys(r.boxes ?? {}).length)) return null;   // SPACE-2: around, by height, stack and corners come from the module too (no pattern of this world)
  return r;
}
/** A question about places (is A above B, which one is in the middle, how far apart): the module reads it on the boxes of the shapes. */
export const spatial = (ctx, args = {}) => {
  if (!K) return NOT_READY();
  const s = ensure(ctx), items = spaceItems(s);
  if (!items.length) return no('The diagram is empty. Draw something first.', 'missing');
  const r = space.interpret(String(args.text ?? ''), { items, frame: SPACE_FRAME, kindOf: spaceKind, last: s.last ?? [], lastMove: s.lastMove });
  if ((!r || r.type === 'error') && /^\s*(?:is|are)\b/i.test(args.text ?? '')) return make({ type: 'question', name: 'check' })(ctx, { text: String(args.text) });   // names, not places: the engine's check
  if ((!r || r.type === 'error') && /^\s*which\b/i.test(args.text ?? '')) return make({ type: 'question', name: 'list' })(ctx, { text: String(args.text) });
  if ((!r || r.type === 'error') && /^\s*(?:swap|switch|exchange|trade)\b/i.test(args.text ?? '')) return make({ type: 'command', name: 'swap' })(ctx, { text: String(args.text) });   // names, not places: the engine's swap
  if (!r || r.type === 'error') return no(r?.say ?? 'I could not read that question about places.', 'missing');
  if (r.type === 'ask') return no(r.say, 'missing');
  if (r.type === 'layout') return spaceApply(ctx, s, r);
  return ok(r.say);
};
/** "no, not the first one, the middle one": puts the shapes of the last move back, then does the same move on the one meant now (one request). */
export const reselect = (ctx, args = {}) => {
  if (!K) return NOT_READY();
  const s = ensure(ctx), info = s.lastMoveInfo;
  if (!info) return no('There is no move to correct yet. Say which shape to move, for example "move the middle box to the right".', 'missing');
  const back = info.before.map((b, i) => ({ id: `rb${i}`, type: 'command', args: { action: 'move', target: b.id, at: `${b.x},${b.y}` } }));
  const res = execute(ctx, s, back);
  if (res.status !== 'supported') return res;
  const words = String(args.text ?? '').toLowerCase().split(/\s+/).filter((w) => w && !['the', 'a', 'an', 'one', 'it'].includes(w));
  const noun = info.kind && info.kind !== '*' ? info.kind : 'box';
  return make({ type: 'command', name: 'move' })(ctx, { text: `move the ${words.join(' ')} ${noun} ${info.dest}` });
};
function spaceApply(ctx, s, r) {
  const nodes = [];
  let n = 0;
  r.before = spaceItems(s).filter((i) => r.boxes?.[i.id]).map((i) => ({ id: i.id, x: i.x, y: i.y }));
  for (const [name, b] of Object.entries(r.boxes ?? {})) {
    nodes.push({ id: `sp${n++}`, type: 'command', args: { action: 'move', target: name, at: `${b.x},${b.y}` } });
    if (b.w != null) nodes.push({ id: `sp${n++}`, type: 'command', args: { action: 'resize', target: name, width: b.w, height: b.h } });
  }
  if (nodes.length) { const res = execute(ctx, s, nodes); if (res.status !== 'supported') return res; }
  s.last = r.ids?.length ? r.ids : s.last;
  s.lastMove = r.memory ?? (r.type === 'move' ? null : s.lastMove);
  if (r.type === 'move') s.lastMoveInfo = { dest: r.dest, kind: r.kind, before: r.before };   // what "no, the middle one" corrects
  return ok(r.say);
}
/** Common entry of every operation: `kind` = { type, name } of the engine wire. */
const make = (kind) => (ctx, args = {}) => {
  if (!K) return NOT_READY();
  const s = ensure(ctx);
  const text = args.text != null ? String(args.text).trim() : '';
  s.keptNote = s.pending === 'new' ? 'Keeping the current diagram.' : '';   // any other command answers the pending "keep or start empty?" as keep
  s.pending = null;
  if (text && kind.type === 'command') {   // a diagram request with no verb ("a tree of the parts of a house") is read as a layout, a move or a creation
    const req = DG.parseDiagramRequest(text);   // "a flowchart of making tea", "a cycle of the seasons", "make a random diagram"
    if (req) { const r = composedDiagram(ctx, s, req, args); if (r) return r; }
  }
  if (text) {
    const prepared = prepareText(text, s);
    if (typeof process !== 'undefined' && process.env?.DIAG_DEBUG) console.error('[diagram]', JSON.stringify(text), '->', JSON.stringify(prepared));
    const absent = kind.type === 'command' ? missingNamed(s, kind.name, text) : [];   // a name the diagram does not have is never replaced by another shape: not for the module either
    const sp = absent.length ? null : spaceTry(prepared, s, kind);
    if (sp) return sp.status ? sp : spaceApply(ctx, s, sp);
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
const arrangeLayout = make({ type: 'command', name: 'arrange' });
/**
 * ARRANGE AS A THING OF THE CATALOG (owner's session 2026-11-15, class E): "arrange the elements as a hexagon" names an outline of k.layouts, not a layout of the engine (row, grid, tree ...):
 * it is the arrangement along that outline (shapedLike), with "with X in the middle" kept. Any other arrangement is the engine's own.
 */
export const arrange = (ctx, args = {}) => {
  const t = String(args.text ?? '');
  const m = /\b(?:as|like|into|in)\s+(?:an?\s+)?([a-z]+)(?:[\s-]+(?:shape|form|outline))?\b/gi;
  for (const x of t.matchAll(m)) {
    const noun = x[1].toLowerCase();
    if (!LAYOUT_WORDS.has(noun) && DL && DG.outlineNamed(noun) && !/^(?:the|a|an|middle|centre|center)$/.test(noun)) return shapedLike(ctx, { o: noun, text: t });
  }
  return arrangeLayout(ctx, args);
};

// ---- "a diagram shaped like a house" (DRAW-FROM-FACTS; the outlines of k.layouts, Q21) -------------------------------------------------------------------------
const LAYOUT_WORDS = new Set(['row', 'column', 'line', 'grid', 'circle', 'stack', 'cluster', 'ring', 'triangle', 'square', 'pyramid', 'tree', 'layers', 'radial', 'hierarchy', 'organic']);
/** The corners of one part of a catalog drawing in its 0-100 frame: its own points (lines, polygons), the corners of its box, the apex of a triangle (an ellipse has none). */
function partCorners(p) {
  if (Array.isArray(p.points) && p.points.length) return p.points.map(([x, y]) => [x, y]);
  if (p.shape === 'triangle') return [[p.x, p.y + p.h], [p.x + p.w, p.y + p.h], [p.x + p.w / 2, p.y]];
  if (/^(?:circle|oval|ellipse)$/.test(p.shape)) return [];
  return [[p.x, p.y], [p.x + p.w, p.y], [p.x + p.w, p.y + p.h], [p.x, p.y + p.h]];
}
const partArea = (p) => (p.shape === 'line' ? 0 : p.shape === 'triangle' ? (p.w * p.h) / 2 : /^(?:circle|oval|ellipse)$/.test(p.shape) ? (Math.PI * p.w * p.h) / 4 : p.w * p.h);
/** The one-sided small details of a drawing: a filled part under 8 % of the largest one whose mirror image is no part (a chimney, a beak; the two towers of a castle are twins and stay). */
function details(parts) {
  const big = Math.max(...parts.map(partArea)), small = (p) => p.shape !== 'line' && partArea(p) < 0.08 * big;
  const mass = parts.filter((p) => !small(p));
  const ax = Math.min(...mass.map((p) => p.x)) + Math.max(...mass.map((p) => p.x + p.w));   // twice the axis
  const twin = (p) => parts.some((q) => q !== p && Math.abs(q.x - (ax - p.x - p.w)) <= Math.max(2, p.w * 0.25) && Math.abs(q.y - p.y) <= Math.max(2, p.h * 0.25) && Math.abs(q.w - p.w) <= Math.max(2, p.w * 0.25) && Math.abs(q.h - p.h) <= Math.max(2, p.h * 0.25));
  return new Set(parts.filter((p) => small(p) && !twin(p)));
}
const area2 = (poly) => poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
/**
 * THE OUTLINE of a thing, from the catalog (k.layouts outline: points in a 0-100 frame, clockwise from the top; bundled from the pin, src/knowledge/diagram-world.mjs). A traced outline
 * (from=k.objects.object) is within its `tolerance` of the drawing's own corners: each point goes to the drawing's corner it traces (the exact gable top and eaves of the house). A small
 * one-sided detail (the chimney) is not part of the shape on a phone: the corners whose triangle is under `feature` of the area go, one at a time (the smallest first). Clockwise from the top.
 */
export function outlineOf(outline, { feature = 0.01 } = {}) {
  let poly = outline.points.map(([x, y]) => [x, y]);
  const parts = outline.drawing ? THINGS[outline.drawing] : null;
  if (parts && outline.tolerance > 0) {
    const detail = details(parts);
    const corners = parts.flatMap((p) => partCorners(p).map((c) => ({ c, detail: detail.has(p) })));
    poly = poly.flatMap((q) => {
      budget.tick('diagram.outline');
      const near = corners.filter(({ c }) => Math.hypot(c[0] - q[0], c[1] - q[1]) <= outline.tolerance).sort((a, b) => Math.hypot(a.c[0] - q[0], a.c[1] - q[1]) - Math.hypot(b.c[0] - q[0], b.c[1] - q[1]));
      if (!near.length) return [q];
      if (near.every((x) => x.detail)) return [];   // a corner of a one-sided small detail only (the chimney): not part of the shape
      return [[...near.find((x) => !x.detail).c]];
    });
  }
  const whole = Math.abs(area2(poly)) / 2;
  for (;;) {
    budget.tick('diagram.outline');
    if (poly.length <= 3) break;
    let k = -1, min = Infinity;
    poly.forEach((p, i) => { const a = poly[(i - 1 + poly.length) % poly.length], b = poly[(i + 1) % poly.length], t = Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (b[0] - a[0]) * (p[1] - a[1])) / 2; if (t < min) { min = t; k = i; } });
    if (min > feature * whole) break;
    poly.splice(k, 1);
  }
  const t = poly.reduce((k, p, i) => (p[1] < poly[k][1] - 0.01 ? i : k), 0);
  return [...poly.slice(t), ...poly.slice(0, t)].map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
}
/**
 * `n` points evenly along a closed polygon (by length), the first at its first corner: the library's `arrange(nodes, 'path', { points, closed })` (sopworld 0.129).
 */
export function pointsAlong(poly, n) {
  const at = DL.arrange(Array.from({ length: n }, (_, i) => ({ id: `p${i}`, w: 0, h: 0 })), 'path', { points: poly, closed: true });
  return [...at.values()].map((b) => [b.x, b.y]);
}
/**
 * NODES ON AN OUTLINE DO NOT OVERLAP (reviewer 2026-11-15 04:50: the eaves of the house sat on the wall tops). Points of a closed outline (canvas px) get one size for their nodes: the
 * engine's usual size when the shortest gap between neighbours leaves room, else that gap less a margin (`gap`); corners closer than the smallest node (`min` + `gap`) are one node, at their
 * middle. Returns { points, size } (`size` null = the usual size). Any arrangement along an outline uses it.
 */
export function fitOnOutline(points, { usual = 62, min = 24, gap = 10 } = {}) {
  let pts = points.map((p) => [...p]);
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  for (let merged = true; merged && pts.length > 3;) {
    merged = false;
    for (let i = 0; i < pts.length; i++) {
      budget.tick('diagram.outline');
      const j = (i + 1) % pts.length;
      if (near(pts[i], pts[j]) < min + gap) { pts[i] = [Math.round((pts[i][0] + pts[j][0]) / 2), Math.round((pts[i][1] + pts[j][1]) / 2)]; pts.splice(j, 1); merged = true; break; }
    }
  }
  const shortest = Math.min(...pts.map((p, i) => near(p, pts[(i + 1) % pts.length])));
  return { points: pts, size: shortest - gap >= usual ? null : Math.max(min, Math.floor(shortest - gap)) };
}

/**
 * A diagram in the shape of a thing of the catalog (an outline of k.layouts: 17 shapes, 33 drawings): an ARRANGEMENT ALONG ITS OUTLINE. With three or more shapes in the diagram, they are moved onto the outline (evenly, from the top,
 * clockwise); on an empty diagram one unnamed node is made at each corner of the outline (numbered in order), and the nodes are joined in order (a closed line).
 * A layout word (a row, a circle) is the engine's own arrange.
 */
export function shapedLike(ctx, args = {}) {
  if (!K) return NOT_READY();
  if (!DL) return no('The diagram knowledge is still loading. Please say that again in a moment.', 'missing');
  const s = ensure(ctx);
  const noun = String(args.o ?? '').toLowerCase().replace(/[-\s]?shaped$/, '').replace(/[^a-z ]/g, '').trim();   // "house-shaped": the frame's arrangement without "-shaped"
  const outline = DG.outlineNamed(noun);
  if (!outline) {
    if (LAYOUT_WORDS.has(noun) && s.shapes.length) return make({ type: 'command', name: 'arrange' })(ctx, { text: `arrange the boxes as a ${noun}` });
    const art = /^[aeiou]/.test(noun) ? 'an' : 'a';
    return no(`I don't know how to draw a diagram shaped like ${art} ${noun} yet. The catalog has no outline of ${art} ${noun}.`, 'unsupported');
  }
  const thing = outline.name, a = /^[aeiou]/.test(thing) ? 'an' : 'a';
  const poly = outlineOf(outline);
  const x0 = Math.min(...poly.map((p) => p[0])), x1 = Math.max(...poly.map((p) => p[0])), y0 = Math.min(...poly.map((p) => p[1])), y1 = Math.max(...poly.map((p) => p[1]));
  const k = Math.min(640 / Math.max(1, x1 - x0), 380 / Math.max(1, y1 - y0));
  const canvas = ([x, y]) => [Math.round(400 + (x - (x0 + x1) / 2) * k), Math.round(250 + (y - (y0 + y1) / 2) * k)];
  // "with the circle in the middle": that shape goes to the centre of the outline, the others along it
  const midSaid = String(args.middle ?? (/\bwith\s+(?:the\s+)?(.+?)\s+(?:in|at|to|into)\s+the\s+(?:middle|centre|center)\b/i.exec(String(args.text ?? ''))?.[1] ?? '')).trim();
  const all = s.shapes.filter((x) => !x.template && !x.layer && x.shape !== 'text');
  const mid = midSaid ? (shapeOf(s, midSaid) ?? (() => { const k = midSaid.toLowerCase().replace(/s$/, ''); const hits = all.filter((x) => x.shape === k || String(x.label ?? '').toLowerCase() === midSaid.toLowerCase()); return hits.length === 1 ? hits[0] : null; })()) : null;
  const own = all.filter((x) => x !== mid);
  if (own.length >= 3) {
    const at = pointsAlong(poly, own.length).map(canvas), fit = fitOnOutline(at, { min: 0 }).size;   // evenly spaced: no corner merges, a shape bigger than the spacing is made to fit
    const nodes = [...own].sort((p, q) => (p.order ?? 0) - (q.order ?? 0)).flatMap((x, i) => {
      const move = { id: `m${i + 1}`, type: 'command', args: { action: 'move', target: x.name, at: `${at[i][0]},${at[i][1]}` } }, b = K.dims(x), k = fit ? fit / Math.max(b.w, b.h) : 1;
      return k < 1 ? [move, { id: `z${i + 1}`, type: 'command', args: { action: 'resize', target: x.name, width: Math.max(10, Math.round(b.w * k)), height: Math.max(10, Math.round(b.h * k)) } }] : [move];
    });
    if (mid) nodes.push({ id: 'mc', type: 'command', args: { action: 'move', target: mid.name, at: '400,250' } });
    const r = execute(ctx, s, nodes, { place: false });
    if (r.status !== 'supported') return r;
    s.composed = { kind: 'outline', topic: thing, n: (s.composed?.n ?? 0) + 1 };   // the knowledge's arrangement (k.layouts outline)
    if (mid) return { ...r, value: `I placed the ${own.length} shapes on the outline of ${a} ${thing}, clockwise from the top, and ${plain(s, mid.name)} in the middle.` };
    return { ...r, value: `I placed the ${own.length} shapes on the outline of ${a} ${thing}, clockwise from the top.`, say: { act: 'diagram.shaped.placed', roles: { thing, shapes: { n: own.length, noun: 'shape' } } } };   // say: the frame a reply in another language is composed from (spec 06)
  }
  const { points: corners, size } = fitOnOutline((poly.length > 10 ? pointsAlong(poly, 8) : poly).map(canvas));
  // the user gave no content: the nodes are unnamed (circle 1, circle 2 ... in the order of the outline), not named after the parts they sit on
  const names = corners.map(() => nextId(s, 'circle'));
  const nodes = corners.map(([x, y], i) => ({ id: `o${i + 1}`, type: 'command', args: { action: 'create', shape: 'circle', name: names[i], at: `${x},${y}`, ...(size ? { width: size, height: size } : {}) } }));
  nodes.push({ id: 'oc', type: 'command', args: { action: 'connect', from: names, pairing: 'chain', arrow: 'none' } }, { id: 'oz', type: 'command', args: { action: 'connect', from: names[names.length - 1], to: names[0], arrow: 'none' } });
  const r = execute(ctx, s, nodes, { place: false });
  if (r.status !== 'supported') return r;
  s.composed = { kind: 'outline', topic: thing, n: (s.composed?.n ?? 0) + 1 };   // the knowledge's answer (k.layouts outline): the check of a request keeps it as it is
  return { ...r, value: `I drew a diagram in the shape of ${a} ${thing}: ${corners.length} nodes on its outline, joined in order.`, say: { act: 'diagram.shaped', roles: { thing, nodes: { n: corners.length, noun: 'node' } } } };
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
const clear = (ctx, s) => { Object.assign(s, initialState()); resetSystem(); open(ctx); };

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
    id: x.name, kind: x.shape, ...(ID_RE.test(String(x.name)) ? {} : { name: x.name }), noun: x.shape,   // a name the engine gave (c1) is an id, not a name words: [x.shape, x.name.toLowerCase()],
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
