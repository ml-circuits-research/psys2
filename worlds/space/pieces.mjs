// SPDX-License-Identifier: AGPL-3.0-only
// SPACE-2, layers 1 and 2 (worker-tasks 17:40 "SPACE as one general world"): what a piece is, and the relations that are KEPT as facts.
// Browser-safe, no `node:*`; the only import is the geometry of `space.mjs`. Plain data in and out: a host keeps `store` ({ facts, seq }) in its own state,
// so its undo snapshots it and its export carries it.
//
//   pieceFrom(item, o)             a placeable thing: extent (box), outline (hull of part points), layer, named anchors, parent / container
//   outlineFromParts(parts, size)  the convex hull of the part points of a k.objects thing -> a `shape` (offsets from the centre) for space.mjs surfaces
//   anchorsOf(piece, table)        { top, bottom, left, right, centre, ...anchors of the piece, ...anchors knowledge gives its kind (seat, surface, chin, port) }
//   attachAt(piece, anchor, target, targetAnchor)   the centre that puts one anchor on another (a hat on the top of the head, an arrow on a port)
//   createStore / propose / dropPiece / factsOf     the relations as facts, each with a rule and a source tier; conflicts ranked said > focus > scene > knowledge > default
//   inferFacts(pieces, store, o)   the rule set: nobody said it, the rule adds it (join near pieces that belong together, in a container), defeasible by the user
//   carriedBy / movePiece          moving a piece moves what is on, in or attached to it, never what is merely next to it
//   checkMove                      a refusal with a plain reason ("the cow cannot go lower: it is on the ground")
//   holdsFact / why                does a relation hold now; the fact in plain words with its source
import { overlaps, gap, boxOf, KNOWLEDGE } from './space.mjs';

const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
const LOOP_MAX = 256;   // no loop of this module runs longer
const sum = (a) => a.reduce((x, y) => x + y, 0);
const sing = (k) => String(k ?? '').toLowerCase().replace(/~\w+$/, '').replace(/ies$/, 'y').replace(/(?<!s)s$/, '');

/** The delegation tiers (worker-tasks 16:40 M3): a gap is filled, and a conflict decided, in this order. */
export const TIERS = ['said', 'focus', 'scene', 'knowledge', 'default'];
export const tierRank = (t) => { const i = TIERS.indexOf(t); return i < 0 ? TIERS.length : i; };

/** The relations kept as facts. carries: what is on / in / attached to B moves with B. contact: the two touch. */
export const RELS = {
  on: { carries: true, contact: true }, in: { carries: true }, attached_to: { carries: true, contact: true },
  next_to: {}, left_of: {}, right_of: {}, above: {}, in_front_of: {}, behind: {}, aligned_with: {}, same_size_as: {}, apart_from: { negative: true }, inside_frame: { unary: true },
};
/** The module's relation words (space.mjs RELATIONS values) as fact relations; `under` and `against` are the same fact seen from the other side. */
export const FACT_OF_WORD = { on: 'on', in: 'in', next: 'next_to', leftof: 'left_of', rightof: 'right_of', above: 'above', under: 'below', below: 'below', against: 'attached_to', front: 'in_front_of', behind: 'behind', apart: 'apart_from', aligned: 'aligned_with', same: 'same_size_as' };
/** A relation word with its mover and reference as a fact { rel, a, b } (a is B's dependent). */
export function factFor(word, mover, ref, extra = {}) {
  const r = FACT_OF_WORD[word];
  if (!r) return null;
  return r === 'below' ? { rel: 'above', a: ref, b: mover, ...extra } : { rel: r, a: mover, b: ref, ...extra };
}

// ---- layer 1: pieces ---------------------------------------------------------------------------------------------------------------------------------
/** The convex hull (monotone chain) of points [[x, y], ...]; fewer than 3 distinct points are returned as they are. */
export function hull(points) {
  const p = points.map((q) => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).filter((q, i, a) => !i || q[0] !== a[i - 1][0] || q[1] !== a[i - 1][1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { budget.tick('space.hull'); while (lo.length >= 2 && cr(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.slice().reverse()) { budget.tick('space.hull'); while (up.length >= 2 && cr(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/**
 * The outline of a thing from the part points of its k.objects parts (unit coordinates around the centre: { x, y, w, h [, pts: [[x, y], ...]] }, a part box or its polygon points),
 * scaled by `size`; the result is `shape` for space.mjs (one convex polygon, offsets from the centre). Convex, so a concave thing is over-approximated.
 */
export function outlineFromParts(parts, size = 1) {
  const pts = [];
  for (const q of parts ?? []) {
    if (pts.length > 4000) break;
    if (q.pts?.length) for (const [x, y] of q.pts) pts.push([x * size, y * size]);
    else if (Number.isFinite(q.w) && Number.isFinite(q.h)) for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pts.push([(q.x + (sx * q.w) / 2) * size, (q.y + (sy * q.h) / 2) * size]);
  }
  const h = hull(pts);
  return h.length >= 3 ? [h.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])] : null;
}

/** Anchors knowledge gives a kind, as fractions of the box from its centre (x to the right, y downward; -0.5 .. 0.5). A host may pass its own table (the k.faces slots, k.objects part names). */
export const ANCHOR_TABLE = {
  swing: { seat: [0, 0.3] }, lake: { surface: [0, -0.35] }, pond: { surface: [0, -0.35] }, sea: { surface: [0, -0.4] },
  head: { chin: [0, 0.5], crown: [0, -0.5], eyes: [0, -0.1], 'left ear': [-0.5, 0], 'right ear': [0.5, 0] },
  table: { surface: [0, -0.5] }, house: { roofline: [0, -0.5], door: [0, 0.4] }, box: { 'port left': [-0.5, 0], 'port right': [0.5, 0], 'port top': [0, -0.5], 'port bottom': [0, 0.5] },
  bench: { seat: [0, -0.1] }, bed: { surface: [0, -0.3] }, boat: { deck: [0, -0.2] },
};
/** A piece: { id, kind, name, x, y, w, h, z, layer, shape?, parts?, anchors, parent?, container?, pinned? }. `item` is the host's projection (space.item) plus optional anchors / parent / container. */
export function pieceFrom(item, o = {}) {
  const table = o.anchorTable ?? ANCHOR_TABLE;
  const kind = sing(item.kind ?? item.name);
  const p = {
    id: item.id, kind: item.kind ?? kind, name: item.name ?? kind, x: item.x, y: item.y, w: item.w, h: item.h, z: item.z ?? 0,
    layer: item.layer ?? ((item.z ?? 0) < 0 ? 'behind' : 'front'), anchors: { ...(table[kind] ?? {}), ...(item.anchors ?? {}) },
  };
  for (const k of ['shape', 'parts', 'parent', 'container', 'pinned', 'region']) if (item[k] !== undefined) p[k] = item[k];
  if (!p.shape && item.outlineParts) { const s = outlineFromParts(item.outlineParts, item.outlineSize ?? 1); if (s) p.shape = s; }
  return p;
}
/** Absolute anchors of a piece: the five standard ones plus its named ones. `[x, y]` each. */
export function anchorsOf(p) {
  const b = boxOf(p), out = { centre: [p.x, p.y], top: [p.x, b.t], bottom: [p.x, b.b], left: [b.l, p.y], right: [b.r, p.y] };
  for (const [n, f] of Object.entries(p.anchors ?? {})) out[n] = [p.x + f[0] * p.w, p.y + f[1] * p.h];
  return out;
}
/** The centre that puts `anchor` of `piece` on `targetAnchor` of `target` (a hat's bottom on the top of the head; an arrow's tail on a box's right port). */
export function attachAt(piece, anchor, target, targetAnchor) {
  const a = anchorsOf(piece)[anchor], t = anchorsOf(target)[targetAnchor];
  if (!a || !t) return null;
  return { x: Math.round(piece.x + t[0] - a[0]), y: Math.round(piece.y + t[1] - a[1]) };
}
/** The face layout API for ui.avatar: slots (pieces of a face, each with a kind) put by the order of a face, mirrored pairs either side of the middle, parts attached at anchors of the head. */
export function faceLayout(slots, frame, planLayout) { return planLayout('face', slots, frame, {}); }

// ---- layer 2: relations as facts ----------------------------------------------------------------------------------------------------------------------
/** The store a host keeps in its state: JSON-safe. */
export const createStore = () => ({ facts: [], seq: 0 });
const canon = (f) => (f.rel === 'right_of' ? { ...f, rel: 'left_of', a: f.b, b: f.a } : f.rel === 'behind' ? { ...f, rel: 'in_front_of', a: f.b, b: f.a } : f);
const pairKey = (f) => [f.a, f.b ?? ''].sort().join('|');
const EXCL = [['apart_from', 'on'], ['apart_from', 'attached_to'], ['apart_from', 'next_to'], ['apart_from', 'in'], ['on', 'in'], ['on', 'attached_to'], ['above', 'in']];
/** Do two facts about the same pair contradict each other? */
export function conflicts(f, g) {
  if (f.b == null || g.b == null || pairKey(f) !== pairKey(g)) return false;
  const c = canon(f), d = canon(g);
  if (c.rel === d.rel) return (c.rel === 'left_of' || c.rel === 'in_front_of' || c.rel === 'on' || c.rel === 'in' || c.rel === 'above') && c.a !== d.a;
  return EXCL.some(([x, y]) => (c.rel === x && d.rel === y) || (c.rel === y && d.rel === x));
}
export const factsOf = (store, id) => store.facts.filter((f) => f.a === id || f.b === id);
export const hasFact = (store, rel, a, b) => store.facts.some((f) => f.rel === rel && ((f.a === a && f.b === b) || (RELS[rel]?.symmetric && f.a === b && f.b === a)));
/** Is the pair "apart" (the user said so; remembered until the user removes it)? */
export const isApart = (store, a, b) => store.facts.some((f) => f.rel === 'apart_from' && ((f.a === a && f.b === b) || (f.a === b && f.b === a)));
/**
 * Proposes a fact: { rel, a, b, source, tier }. A fact in conflict with a stronger-tier one is refused with a plain reason; a weaker or equal tier one is replaced (equal: the newer wins).
 * Returns { ok, fact?, replaced, reason? }.
 */
export function propose(store, f0, o = {}) {
  const f = { rel: f0.rel, a: f0.a, b: f0.b ?? null, source: f0.source ?? 'said', tier: f0.tier ?? 'said', ...(f0.axis ? { axis: f0.axis } : {}), ...(f0.anchorA ? { anchorA: f0.anchorA, anchorB: f0.anchorB } : {}) };
  if (!RELS[f.rel]) return { ok: false, replaced: [], reason: `I do not know the relation "${f.rel}".` };
  if (f.a === f.b) return { ok: false, replaced: [], reason: 'A thing can not be in a relation with itself.' };
  const clash = store.facts.filter((g) => conflicts(f, g));
  const stronger = clash.find((g) => tierRank(g.tier) < tierRank(f.tier));
  if (stronger) return { ok: false, replaced: [], reason: `I will not do that: ${why(stronger, o.names)}` };
  const same = store.facts.find((g) => g.rel === f.rel && g.a === f.a && g.b === f.b);
  if (same) { if (tierRank(f.tier) <= tierRank(same.tier)) Object.assign(same, f, { seq: same.seq }); return { ok: true, fact: same, replaced: [] }; }
  for (const g of clash) store.facts.splice(store.facts.indexOf(g), 1);
  f.seq = ++store.seq;
  store.facts.push(f);
  return { ok: true, fact: f, replaced: clash };
}
/** The user takes a relation back ("do not keep them apart", "take the cup off the table"): the facts of that relation between the pair go. Returns what was removed. */
export function retract(store, rel, a, b) {
  const gone = store.facts.filter((f) => f.rel === rel && ((f.a === a && f.b === b) || (f.a === b && f.b === a)));
  store.facts = store.facts.filter((f) => !gone.includes(f));
  return gone;
}
/** A piece left the scene: its facts go with it. */
export function dropPiece(store, id) { const gone = store.facts.filter((f) => f.a === id || f.b === id); store.facts = store.facts.filter((f) => !gone.includes(f)); return gone; }

const nameOf = (names, id) => names?.[id] ?? id;
const REL_WORDS = { on: 'is on', in: 'is in', attached_to: 'is attached to', next_to: 'is next to', left_of: 'is left of', right_of: 'is right of', above: 'is above', in_front_of: 'is in front of', behind: 'is behind', aligned_with: 'is aligned with', same_size_as: 'is the same size as', apart_from: 'is kept apart from', inside_frame: 'stays inside the picture' };
const SOURCE_WORDS = { said: 'you said so', focus: 'it was the last thing we talked about', scene: 'it is how the scene is', knowledge: 'general knowledge says so', default: 'it is the usual way' };
/** A fact in plain words with its source: "the roof is on the walls (rule join-near: general knowledge says so)". */
export function why(f, names) {
  const rule = String(f.source ?? '').startsWith('rule:') ? `rule ${f.source.slice(5)}: ` : '';
  return `${nameOf(names, f.a)} ${REL_WORDS[f.rel] ?? f.rel}${f.b ? ` ${nameOf(names, f.b)}` : ''} (${rule}${SOURCE_WORDS[f.tier] ?? f.tier}).`;
}

/** Does a fact hold now? pieces: Map or object id -> piece. `tol` in px. */
export function holdsFact(f, P, frame, tol = 3) {
  const A = P[f.a] ?? P.get?.(f.a), B = f.b ? (P[f.b] ?? P.get?.(f.b)) : null;
  if (!A) return false;
  const a = boxOf(A);
  if (f.rel === 'inside_frame') return a.l >= -tol && a.t >= -tol && a.r <= frame.w + tol && a.b <= frame.h + tol;
  if (!B) return false;
  const b = boxOf(B), xo = a.l < b.r - 1 && b.l < a.r - 1, yo = a.t < b.b - 1 && b.t < a.b - 1;
  switch (f.rel) {
    case 'on': return xo && Math.abs(a.b - b.t) <= tol + 0.1 * A.h;
    case 'in': return a.l >= b.l - tol && a.r <= b.r + tol && a.t >= b.t - tol && a.b <= b.b + tol;
    case 'attached_to': return gap(A, B) <= tol + 1.5;
    case 'next_to': return gap(A, B) <= Math.max(60, 0.12 * frame.w) && !overlaps(A, B, 1);
    case 'left_of': return a.r <= b.l + tol;
    case 'right_of': return a.l >= b.r - tol;
    case 'above': return a.b <= b.t + tol;
    case 'in_front_of': return A.z > B.z;
    case 'behind': return A.z < B.z;
    case 'aligned_with': return f.axis === 'x' ? Math.abs(A.x - B.x) <= tol : Math.abs(A.y - B.y) <= tol;
    case 'same_size_as': return Math.abs(A.w * A.h - B.w * B.h) <= 0.12 * Math.max(A.w * A.h, B.w * B.h);
    case 'apart_from': return gap(A, B) >= Math.min(24, 0.04 * frame.w) - 1 && !(xo && yo);
    default: return false;
  }
}

/** What is a part of what, as a fallback (the knowledge worlds' "part of" and anchors replace it: pass `knowledge.parts`). */
export const PART_OF = [['arm', 'body'], ['leg', 'body'], ['hair', 'head'], ['hat', 'head'], ['ear', 'head'], ['wing', 'bird'], ['wheel', 'car'], ['handle', 'door'], ['arrow', 'box']];
/** The rule set: relations nobody said, each with its rule and source tier, each defeasible (a user's `apart_from`, or any stronger fact, blocks it). */
export const RULESET = [
  { id: 'join-near', tier: 'knowledge', doc: 'pieces that are near and belong together by knowledge (supports, part of) are joined: on, or attached' },
  { id: 'in-container', tier: 'scene', doc: 'a piece wholly inside a container or region is in it' },
];
/**
 * Applies the rule set to the present pieces. o: { frame, knowledge: { supports, parts }, near (px) }.
 * Returns { added: [fact], refused: [{ fact, reason }] } and updates the store.
 */
export function inferFacts(pieces, store, o = {}) {
  const k = { ...KNOWLEDGE, ...(o.knowledge ?? {}) }, frame = o.frame ?? { w: 1000, h: 700 };
  const near = o.near ?? 0.045 * Math.hypot(frame.w, frame.h);
  const pair = (tab, A, B) => (tab ?? []).some(([x, y]) => (sing(x) === sing(A.kind) || sing(x) === sing(A.name)) && (sing(y) === sing(B.kind) || sing(y) === sing(B.name)));
  const added = [], refused = [];
  let n = 0;
  for (const A of pieces) for (const B of pieces) {
    if (A.id === B.id) continue;
    if (++n > 20000) return { added, refused };
    budget.tick('space.infer');
    const a = boxOf(A), b = boxOf(B);
    let f = null;
    if (B.container && a.l >= b.l - 1 && a.r <= b.r + 1 && a.t >= b.t - 1 && a.b <= b.b + 1 && !A.container) f = { rel: 'in', a: A.id, b: B.id, source: 'rule:in-container', tier: 'scene' };
    else if (!A.region && !isApart(store, A.id, B.id) && gap(A, B) <= near) {
      if (pair(k.supports, A, B) && A.y <= B.y + 0.25 * B.h) f = { rel: 'on', a: A.id, b: B.id, source: 'rule:join-near', tier: 'knowledge' };
      else if (pair(k.parts ?? PART_OF, A, B)) f = { rel: 'attached_to', a: A.id, b: B.id, source: 'rule:join-near', tier: 'knowledge' };
    }
    if (!f) continue;
    if (store.facts.some((g) => g.rel === f.rel && g.a === f.a && g.b === f.b)) continue;
    const r = propose(store, f, { names: o.names });
    if (r.ok) added.push(r.fact); else refused.push({ fact: f, reason: r.reason });
  }
  return { added, refused };
}

// ---- moving: what travels with a piece ----------------------------------------------------------------------------------------------------------------
/** The ids that move with `id`: what is on, in or attached to it and what its pieces contain, transitively (bounded). Not what is merely next to it. */
export function carriedBy(store, id, pieces = []) {
  const out = [], seen = new Set([id]), queue = [id];
  for (let i = 0; i < queue.length && i < LOOP_MAX; i++) {
    const cur = queue[i];
    budget.tick('space.carry');
    const next = [...store.facts.filter((f) => RELS[f.rel]?.carries && f.b === cur).map((f) => f.a), ...pieces.filter((p) => p.parent === cur).map((p) => p.id)];
    for (const x of next) if (!seen.has(x)) { seen.add(x); out.push(x); queue.push(x); }
  }
  return out;
}
const mapOf = (pieces) => Object.fromEntries(pieces.map((p) => [p.id, p]));
/**
 * Moves a piece by (dx, dy) with what it carries. The carried piece itself that ends off its support loses the fact (said, never kept false).
 * Returns { boxes: { id: { x, y } }, moved: [ids], dropped: [facts], say }.
 */
export function movePiece(store, pieces, id, dx, dy, o = {}) {
  const P = mapOf(pieces), carried = carriedBy(store, id, pieces), ids = [id, ...carried], boxes = {};
  for (const k of ids) if (P[k]) boxes[k] = { x: Math.round(P[k].x + dx), y: Math.round(P[k].y + dy) };
  const after = { ...P };
  for (const k of ids) if (P[k]) after[k] = { ...P[k], ...boxes[k] };
  const dropped = [];
  for (const f of store.facts.filter((g) => g.a === id && RELS[g.rel]?.carries && !ids.includes(g.b))) {
    if (!holdsFact(f, after, o.frame ?? { w: 1000, h: 700 }, o.tol ?? 3)) dropped.push(f);
  }
  if (o.commit !== false) store.facts = store.facts.filter((f) => !dropped.includes(f));
  const say = dropped.map((f) => `${nameOf(o.names, f.a)} is no longer ${REL_WORDS[f.rel].replace(/^is /, '')} ${nameOf(o.names, f.b)}.`).join(' ');
  return { boxes, moved: ids.filter((k) => P[k]), dropped, say };
}
/**
 * Can a piece go (dx, dy)? A refusal carries a plain reason: not lower than what it is on, not out of what it is in. Returns { ok, reason? }.
 */
export function checkMove(store, pieces, id, dx, dy, o = {}) {
  const P = mapOf(pieces), A = P[id];
  if (!A) return { ok: false, reason: 'I can not find that.' };
  const nm = o.names;
  const moved = { ...A, x: A.x + dx, y: A.y + dy };
  for (const f of store.facts.filter((g) => g.a === id && (g.rel === 'on' || g.rel === 'in') && P[g.b])) {
    const B = P[f.b], a = boxOf(moved), b = boxOf(B);
    if (f.rel === 'on' && dy > 0 && a.b > b.t + 3 && !(B.region && !o.groundKinds?.includes(B.kind))) return { ok: false, reason: `${nameOf(nm, id)} can not go lower: it is on ${nameOf(nm, f.b)}.` };
    if (f.rel === 'in' && (a.l < b.l - 1 || a.r > b.r + 1 || a.t < b.t - 1 || a.b > b.b + 1)) return { ok: false, reason: `${nameOf(nm, id)} can not go there: it is in ${nameOf(nm, f.b)}.` };
  }
  const frame = o.frame;
  if (frame) { const m = boxOf(moved); if ((dx < 0 && m.l < 0) || (dx > 0 && m.r > frame.w) || (dy < 0 && m.t < 0) || (dy > 0 && m.b > frame.h)) return { ok: true, clamp: true, reason: `${nameOf(nm, id)} stops at the edge of the picture.` }; }
  return { ok: true };
}
export const piecesTotalArea = (pieces) => sum(pieces.map((p) => p.w * p.h));
