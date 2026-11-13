// SPDX-License-Identifier: AGPL-3.0-only
// The shared module `space` (specs/18-space-module.md): where things are, which one is meant by its position, how to move and arrange them. Browser-safe, no
// imports. A host world gives it a projection of its objects, items { id, kind, x, y, w, h, z, name? } (x, y = the centre, y grows downward) in a frame
// { w, h, step? }, and applies the boxes it answers; the module never draws and knows nothing about houses or boxes. The words live in lexicon.sop (core.lexicon
// groups); tests/space.test.mjs keeps this file and the lexicon in step.
//
//   classify(word)            the spatial meaning of one word of a noun phrase: { ord } | { pos } | { size } | { other } | { count } | { all } | null
//   parseSel(tokens, kindOf)  "the middle house", "the second from the left", "the one between the tree and the sun" -> a selection spec
//   select(pool, spec, ctx)   -> { ids } | { ask, candidates } | { error }   (never silently takes the first one)
//   parseMove(tokens)         "left and down", "a bit more to the right", "all the way up", "further" -> { segs, again }
//   planMove(items, frame, move, last) -> { boxes, memory }
//   parseRel / planPlace      "next to the lake", "between the tree and the sun", "in the top left corner" -> a target box that does not overlap
//   parseLayout / planLayout  row, column, grid, circle, spread, align, same size, centre, swap, tidy up
//   parseQuestion / answer    what is next to X, which is in the middle, is A above B, how far apart
//   interpret(text, ctx)      the whole sentence at once (hosts without their own reading of the verb and the thing)

const toks = (t) => String(t ?? '').toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').split(/\s+/).filter(Boolean);
const has = (a, w) => a.includes(w);
const sum = (a) => a.reduce((x, y) => x + y, 0);

// ---- words (the same words are in lexicon.sop) ----------------------------------------------------------------------------------------------------------
export const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, last: -1, '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '5th': 5, '6th': 6 };
export const POSITIONS = { left: 'left', leftmost: 'left', right: 'right', rightmost: 'right', top: 'top', topmost: 'top', upper: 'top', highest: 'top', bottom: 'bottom', bottommost: 'bottom', lowest: 'bottom', middle: 'middle', centre: 'middle', center: 'middle', central: 'middle' };
export const SIZES = { biggest: 'big', largest: 'big', tallest: 'big', smallest: 'small', tiniest: 'small', littlest: 'small' };
export const COUNTS = { two: 2, three: 3, four: 4, five: 5, both: 2 };
export const DIRS = { left: [-1, 0], leftwards: [-1, 0], right: [1, 0], rightwards: [1, 0], up: [0, -1], upwards: [0, -1], upward: [0, -1], higher: [0, -1], down: [0, 1], downwards: [0, 1], downward: [0, 1], lower: [0, 1] };
export const AMOUNTS = { a_tiny_bit: 0.3, tiny: 0.3, a_bit: 0.5, a_little_bit: 0.5, a_little: 0.5, slightly: 0.5, just_a_bit: 0.5, a_step: 1, one_step: 1, two_steps: 2, three_steps: 3, much: 2.2, very_much: 2.5, a_lot: 2.5, so_much: 2.5, way: 3, far: 3, all_the_way: 'edge', to_the_edge: 'edge', by_half: 'half', half_way: 'half', halfway: 'half' };
export const MORE = ['more', 'even', 'further', 'farther', 'again', 'once_more'];
export const LAYOUTS = { row: 'row', line: 'row', column: 'column', grid: 'grid', circle: 'circle', ring: 'circle', spread: 'spread', align: 'align', tidy: 'tidy', swap: 'swap' };
export const RELATIONS = { above: 'above', over: 'above', under: 'under', below: 'under', beneath: 'under', underneath: 'under', beside: 'next', near: 'next', next_to: 'next', close_to: 'next', left_of: 'leftof', right_of: 'rightof', between: 'between', around: 'around', in: 'in', inside: 'in', into: 'in', on: 'on', onto: 'on', on_top_of: 'on' };
const NAMED = (m) => Object.keys(m);
export const WORDS = { ordinals: NAMED(ORDINALS), positions: NAMED(POSITIONS), sizes: NAMED(SIZES), counts: NAMED(COUNTS), dirs: NAMED(DIRS), amounts: NAMED(AMOUNTS), more: MORE, layouts: NAMED(LAYOUTS), relations: NAMED(RELATIONS) };

const JOINED = [...NAMED(AMOUNTS), ...MORE, ...NAMED(RELATIONS), 'to_the_left_of', 'to_the_right_of', 'on_the_left_of', 'on_the_right_of', 'next_to', 'on_top_of']
  .filter((w) => w.includes('_')).map((w) => w.split('_')).sort((a, b) => b.length - a.length);
/** The tokens with the multi-word words of the lexicon joined by "_" ("a bit" -> "a_bit"). */
export function words(text) {
  const t = Array.isArray(text) ? text.slice() : toks(text), out = [];
  for (let i = 0; i < t.length;) {
    const hit = JOINED.find((j) => j.every((w, k) => t[i + k] === w));
    if (hit) { out.push(hit.join('_')); i += hit.length; } else out.push(t[i++]);
  }
  return out.map((w) => ({ to_the_left_of: 'left_of', on_the_left_of: 'left_of', to_the_right_of: 'right_of', on_the_right_of: 'right_of' }[w] ?? w));
}

/** The spatial meaning of one word of a noun phrase, or null. */
export function classify(w) {
  if (Object.hasOwn(ORDINALS, w)) return { ord: ORDINALS[w] };
  if (Object.hasOwn(POSITIONS, w)) return { pos: POSITIONS[w] };
  if (Object.hasOwn(SIZES, w)) return { size: SIZES[w] };
  if (w === 'other' || w === 'another') return { other: true };
  if (Object.hasOwn(COUNTS, w)) return { count: COUNTS[w] };
  if (w === 'all' || w === 'every' || w === 'each') return { all: true };
  return null;
}

// ---- geometry ----------------------------------------------------------------------------------------------------------------------------------------
const W = (it) => it.w ?? 0, H = (it) => it.h ?? 0;
export const boxOf = (it) => ({ l: it.x - W(it) / 2, r: it.x + W(it) / 2, t: it.y - H(it) / 2, b: it.y + H(it) / 2 });
const area = (it) => W(it) * H(it);
const overlaps = (a, b, pad = 0) => { const p = boxOf(a), q = boxOf(b); return p.l < q.r - pad && q.l < p.r - pad && p.t < q.b - pad && q.t < p.b - pad; };
/** Gap between two boxes (0 when they touch or overlap). */
export const gap = (a, b) => { const p = boxOf(a), q = boxOf(b); return Math.hypot(Math.max(0, p.l - q.r, q.l - p.r), Math.max(0, p.t - q.b, q.t - p.b)); };
const clampIn = (it, f) => ({ ...it, x: Math.round(Math.min(f.w - W(it) / 2, Math.max(W(it) / 2, it.x))), y: Math.round(Math.min(f.h - H(it) / 2, Math.max(H(it) / 2, it.y))) });
const stepOf = (f) => f.step ?? f.w * 0.1;

/** Reading order: rows from the top, each row left to right (items whose centres are less than half a height apart are in one row). */
export function readingOrder(items) {
  const byY = items.slice().sort((a, b) => a.y - b.y || a.x - b.x), rows = [];
  for (const it of byY) {
    const row = rows.find((r) => Math.abs(r.y - it.y) < Math.max(1, Math.min(H(it), r.h)) * 0.5);
    if (row) { row.items.push(it); row.y = sum(row.items.map((q) => q.y)) / row.items.length; row.h = Math.min(row.h, H(it)); } else rows.push({ y: it.y, h: H(it), items: [it] });
  }
  return rows.sort((a, b) => a.y - b.y).flatMap((r) => r.items.sort((a, b) => a.x - b.x));
}
/** The axis a group spreads on: 'x' (a row) or 'y' (a column), or null for a spread in both. */
export function axisOf(items) {
  if (items.length < 2) return 'x';
  const sx = Math.max(...items.map((i) => i.x)) - Math.min(...items.map((i) => i.x)), sy = Math.max(...items.map((i) => i.y)) - Math.min(...items.map((i) => i.y));
  if (sx >= sy * 1.6) return 'x';
  if (sy >= sx * 1.6) return 'y';
  return null;
}
/** The direction of B as seen from A: 'left' | 'right' | 'above' | 'below' by the larger offset. */
export function sideOf(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  return Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'above' : 'below');
}
const ORD_NAME = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
/** "the left one", "the middle one", "the top right one": the position of an item among a group, in plain words. */
export function positionName(group, it) {
  if (group.length < 2) return '';
  const ax = axisOf(group);
  if (ax) {
    const s = group.slice().sort((a, b) => a[ax] - b[ax]), i = s.indexOf(it), n = s.length;
    const [lo, hi] = ax === 'x' ? ['left', 'right'] : ['top', 'bottom'];
    if (n === 2) return i === 0 ? lo : hi;
    if (n === 3) return ['left', 'middle', 'right'].map((x, k) => (ax === 'y' ? ['top', 'middle', 'bottom'][k] : x))[i];
    return i === 0 ? lo : i === n - 1 ? hi : ORD_NAME[i + 1] ?? `${i + 1}th`;
  }
  const cx = sum(group.map((g) => g.x)) / group.length, cy = sum(group.map((g) => g.y)) / group.length;
  return `${it.y < cy ? 'top' : 'bottom'} ${it.x < cx ? 'left' : 'right'}`;
}
const label = (it, group = [it]) => {
  const same = group.filter((g) => g.kind === it.kind), p = positionName(same, it), n = it.name ?? it.kind;
  return `the ${p ? `${p} ` : ''}${n}`;
};
const listOf = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);

// ---- selection ---------------------------------------------------------------------------------------------------------------------------------------
const REL_TAIL = new Set(['next_to', 'beside', 'near', 'close_to', 'nearest', 'closest', 'by']);
/**
 * Parses a noun phrase into a selection spec: { kind, ord, pos, size, other, count, all, plural, next: tokens, between: [tokens, tokens], fromSide, one, unknown }.
 * `kindOf(word)` is the host's: { kind, plural } for a word that names a kind of its own things, or null.
 */
export function parseSel(input, kindOf = () => null) {
  const t = words(input), spec = { kind: null, ord: null, pos: null, size: null, other: false, count: null, all: false, plural: false, next: null, between: null, one: false, unknown: [] };
  let head = t;
  const bi = t.indexOf('between');
  const ni = t.findIndex((w) => REL_TAIL.has(w));
  if (bi > 0) { head = t.slice(0, bi); const rest = t.slice(bi + 1), a = rest.indexOf('and'); if (a > 0) spec.between = [rest.slice(0, a), rest.slice(a + 1)]; }
  else if (ni > 0) { head = t.slice(0, ni); spec.next = t.slice(ni + 1 + (t[ni + 1] === 'to' ? 1 : 0)); }
  for (let i = 0; i < head.length; i++) {
    const w = head[i], c = classify(w);
    if (['the', 'a', 'an', 'my', 'of', 'this', 'that', 'those', 'these', 'is', 'are', 'on', 'in', 'at', 'from', 'to', 'side', 'to_the', 'then'].includes(w)) continue;
    if (w === 'one' || w === 'ones') { spec.one = true; continue; }
    if (c?.pos && (head[i + 1] === 'of' || head[i + 1] === 'side') && ['top', 'bottom', 'left', 'right'].includes(w)) { spec.pos ??= c.pos; continue; }
    if (c) {
      if ('ord' in c) { spec.ord = c.ord; if (c.ord === -1 && !spec.pos) spec.pos = null; }
      else if ('pos' in c) { if (spec.ord != null && ['left', 'right', 'top', 'bottom'].includes(c.pos)) spec.fromSide = c.pos; spec.pos = c.pos; }
      else if ('size' in c) spec.size = c.size;
      else if ('other' in c) spec.other = true;
      else if ('count' in c) spec.count = c.count;
      else if ('all' in c) spec.all = true;
      continue;
    }
    const k = kindOf(w);
    if (k) { spec.kind = k.kind; spec.plural ||= !!k.plural; continue; }
    if (/^\d+$/.test(w)) continue;
    spec.unknown.push(w);
  }
  return spec;
}

/**
 * Picks the items a spec means out of `pool` (already filtered by the host's kind and colour). ctx: { frame, last: ids of what the user handled last, resolve(tokens)
 * -> items for "next to X" and "between X and Y" }. Result: { ids } or { ask, candidates } (the host asks, naming the candidates by position) or { error }.
 */
export function select(pool, spec, ctx = {}) {
  let g = spec.restrict ? pool.filter((i) => spec.restrict.includes(i.id)) : pool.slice();
  if (!g.length) return { ids: [], error: 'none' };
  const one = (it) => ({ ids: [it.id] });
  const refs = (toks_) => (ctx.resolve ? ctx.resolve(toks_) : []) ?? [];
  if (spec.between) {
    const [a, b] = spec.between.map((x) => refs(x)[0]);
    if (!a || !b) return { error: 'ref' };
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const c = g.filter((i) => i !== a && i !== b && i.id !== a.id && i.id !== b.id).sort((p, q) => Math.hypot(p.x - m.x, p.y - m.y) - Math.hypot(q.x - m.x, q.y - m.y));
    return c.length ? one(c[0]) : { ids: [], error: 'none' };
  }
  if (spec.next) {
    const r = refs(spec.next);
    if (!r.length) return { error: 'ref' };
    const c = g.filter((i) => !r.some((x) => x.id === i.id)).sort((p, q) => Math.min(...r.map((x) => gap(p, x))) - Math.min(...r.map((x) => gap(q, x))) || Math.min(...r.map((x) => Math.hypot(p.x - x.x, p.y - x.y))) - Math.min(...r.map((x) => Math.hypot(q.x - x.x, q.y - x.y))));
    return c.length ? one(c[0]) : { ids: [], error: 'none' };
  }
  if (spec.other) {
    const ex = new Set(ctx.last ?? []);
    const rest = g.filter((i) => !ex.has(i.id));
    if (rest.length && rest.length < g.length) g = rest;
    if (g.length === 1) return one(g[0]);
    if (!spec.pos && !spec.ord && !spec.size) return { ask: `Which one do you mean: ${listOf(g.map((i) => label(i, g)))}?`, candidates: g.map((i) => i.id) };
  }
  if (spec.size) {
    const s = g.slice().sort((a, b) => (spec.size === 'big' ? area(b) - area(a) : area(a) - area(b)));
    if (s.length > 1 && area(s[0]) === area(s[1]) && !spec.pos && !spec.ord) return { ask: `They are all the same size. Which one do you mean: ${listOf(s.map((i) => label(i, g)))}?`, candidates: s.map((i) => i.id) };
    return one(s[0]);
  }
  const side = { left: (a, b) => a.x - b.x, right: (a, b) => b.x - a.x, top: (a, b) => a.y - b.y, bottom: (a, b) => b.y - a.y };
  if (spec.pos && side[spec.pos]) {
    const s = g.slice().sort((a, b) => side[spec.pos](a, b) || a.y - b.y);
    if (spec.count) return { ids: s.slice(0, spec.count).map((i) => i.id) };
    const k = spec.ord ? (spec.ord === -1 ? s.length - 1 : spec.ord - 1) : 0;
    if (!s[k]) return { error: 'few', n: s.length };
    return one(s[k]);
  }
  if (spec.pos === 'middle') {
    if (g.length === 1) return one(g[0]);
    const ax = axisOf(g) ?? 'x', s = g.slice().sort((a, b) => a[ax] - b[ax]);
    if (s.length % 2 === 0) return { ask: `With ${s.length} there is no single middle one. Do you mean ${listOf(s.slice(s.length / 2 - 1, s.length / 2 + 1).map((i) => label(i, g)))}?`, candidates: s.slice(s.length / 2 - 1, s.length / 2 + 1).map((i) => i.id) };
    return one(s[(s.length - 1) / 2]);
  }
  if (spec.ord) {
    const s = readingOrder(g), k = spec.ord === -1 ? s.length - 1 : spec.ord - 1;
    if (!s[k]) return { error: 'few', n: s.length };
    return one(s[k]);
  }
  if (spec.count && g.length === spec.count) return { ids: g.map((i) => i.id) };
  if (spec.count && g.length > spec.count) return { ask: `There are ${g.length}, not ${spec.count}: ${listOf(readingOrder(g).map((i) => label(i, g)))}. Which ${spec.count} do you mean?`, candidates: g.map((i) => i.id), ambiguous: true };
  if (spec.all || spec.plural || g.length === 1) return { ids: g.map((i) => i.id) };
  return { ask: `There are ${g.length}: ${listOf(readingOrder(g).map((i) => label(i, g)))}. Which one do you mean?`, candidates: g.map((i) => i.id), ambiguous: true };
}

// ---- moves -------------------------------------------------------------------------------------------------------------------------------------------
/** "left and down", "a bit more to the right", "all the way up", "by half", "further": { segs: [{ dx, dy, mult }], again, more } or null. */
export function parseMove(input) {
  const flat = words(input), segs = [], again = flat.some((w) => w === 'again' || w === 'once_more');
  let pend = null, more = false, dirSeen = false;
  for (let i = 0; i < flat.length; i++) {
    const w = flat[i];
    if (Object.hasOwn(AMOUNTS, w)) {
      const m = AMOUNTS[w];
      // an amount before a direction (within two words) belongs to it; after a direction, to it unless it already has one
      const nextDir = flat.slice(i + 1, i + 4).findIndex((x) => Object.hasOwn(DIRS, x));
      const between = nextDir < 0 ? [] : flat.slice(i + 1, i + 1 + nextDir);
      if (nextDir >= 0 && between.every((x) => ['to', 'the', 'towards', 'more', 'even', 'further', 'farther'].includes(x))) pend = m;
      else if (segs.length && segs.at(-1).mult == null) segs.at(-1).mult = m;
      else pend = m;
      continue;
    }
    if (MORE.includes(w)) { more = true; continue; }
    if (Object.hasOwn(DIRS, w) && flat[i + 1] !== 'of' && !(flat[i + 1] === 'side')) {
      const [dx, dy] = DIRS[w];
      segs.push({ dx, dy, mult: pend });
      pend = null; dirSeen = true;
    }
  }
  if (!dirSeen && !more && !again) return null;
  for (const s of segs) s.mult ??= 1;
  return { segs, again: !dirSeen && (more || again), more, mult: pend };
}
/**
 * New centres for the targets: each direction moves by `mult` steps (a share of the frame); 'edge' goes all the way, 'half' half the way to the edge. A bare
 * "further" repeats `last` (the move kept by the host). Boxes stay inside the frame.
 */
export function planMove(targets, frame, move, last = null) {
  const segs = move.again ? (last?.segs ?? []).map((s) => ({ ...s, mult: move.mult ?? s.mult })) : move.segs;
  if (!segs.length) return { error: 'again' };
  const step = stepOf(frame), boxes = {};
  for (const it of targets) {
    let { x, y } = it;
    for (const s of segs) {
      const m = s.mult;
      if (m === 'edge') { if (s.dx) x = s.dx < 0 ? W(it) / 2 : frame.w - W(it) / 2; if (s.dy) y = s.dy < 0 ? H(it) / 2 : frame.h - H(it) / 2; }
      else if (m === 'half') { if (s.dx) x += (((s.dx < 0 ? W(it) / 2 : frame.w - W(it) / 2) - x)) / 2; if (s.dy) y += (((s.dy < 0 ? H(it) / 2 : frame.h - H(it) / 2) - y)) / 2; }
      else { x += s.dx * step * m; y += s.dy * step * m; }
    }
    const c = clampIn({ ...it, x, y }, frame);
    boxes[it.id] = { x: c.x, y: c.y };
  }
  return { boxes, memory: { segs: segs.map((s) => ({ ...s })) } };
}
/** "moved the middle house to the right": the direction words of a move in plain words. */
export function sayMove(move) {
  const d = (s) => (s.dx < 0 ? 'to the left' : s.dx > 0 ? 'to the right' : s.dy < 0 ? 'up' : 'down');
  return move.segs.map((s) => `${s.mult === 'edge' ? 'all the way ' : s.mult === 'half' ? 'halfway ' : s.mult < 1 ? 'a bit ' : s.mult > 1.5 ? 'a lot ' : ''}${d(s)}`).join(' and ');
}

// ---- placements by relation ----------------------------------------------------------------------------------------------------------------------------
const REGIONS = { 'top left': [0, 0], 'top right': [1, 0], 'bottom left': [0, 1], 'bottom right': [1, 1] };
/** "next to the lake", "between the tree and the sun", "in the top left corner", "in the centre", "at the left edge": { rel, refs: [tokens], region } or null. */
export function parseRel(input) {
  const t = words(input);
  for (let i = 0; i < t.length; i++) {
    const w = t[i], r = RELATIONS[w];
    if (!r) continue;
    const rest = t.slice(i + 1).filter((x) => x !== 'the' && x !== 'a' && x !== 'an');
    if (['in', 'on', 'at', 'into', 'onto'].includes(w) || w === 'inside') {
      const j = rest.findIndex((x) => ['corner', 'centre', 'center', 'middle', 'edge', 'side', 'half'].includes(x) || (['left', 'right', 'top', 'bottom'].includes(x)));
      if (j >= 0 && j <= 3) return regionRel(rest);
      if (!rest.length) return null;
    }
    if (r === 'between') { const a = rest.indexOf('and'); return a > 0 ? { rel: 'between', refs: [rest.slice(0, a), rest.slice(a + 1)] } : null; }
    if (!rest.length) return null;
    const ref = rest[0] === 'to' && w === 'next_to' ? rest.slice(1) : rest;
    return { rel: r, refs: [ref] };
  }
  if (t.some((w) => ['corner', 'centre', 'center', 'middle', 'edge'].includes(w))) return regionRel(t);
  return null;
}
function regionRel(t) {
  const v = t.filter((x) => ['left', 'right', 'top', 'bottom', 'upper', 'lower'].includes(x)).map((x) => ({ upper: 'top', lower: 'bottom' }[x] ?? x));
  if (t.some((x) => ['centre', 'center', 'middle'].includes(x)) && !v.length) return { rel: 'region', region: 'centre' };
  if (has(t, 'corner')) { const key = [v.find((x) => x === 'top' || x === 'bottom'), v.find((x) => x === 'left' || x === 'right')].filter(Boolean).join(' '); return { rel: 'region', region: key in REGIONS ? key : 'corner' }; }
  if (has(t, 'edge') && v.length) return { rel: 'region', region: `edge ${v[0]}` };
  if (v.length === 2) return { rel: 'region', region: v.join(' ') };
  if (v.length === 1) return { rel: 'region', region: `half ${v[0]}` };
  return null;
}
/**
 * The target box of each mover for a relation: { boxes: { id: { x, y, w?, h? } } } with no overlap against the other items unless the relation is containment
 * (in, on, around). `others` = every item of the host (movers and references are told apart by id).
 */
export function planPlace(movers, rel, refs, frame, others = []) {
  const margin = Math.max(8, frame.w * 0.02), gapPx = Math.max(6, frame.w * 0.015), boxes = {}, ids = new Set(movers.map((m) => m.id));
  const placed = [];
  const fixed = () => others.filter((o) => !ids.has(o.id)).concat(placed);
  const free = (c, ignore) => !fixed().some((o) => !ignore.includes(o.id) && overlaps(c, o, 1));
  const refIds = refs.map((r) => r.id);
  for (const m of movers) {
    let cand = [];
    const r = refs[0], br = r && boxOf(r);
    const near = (x, y) => clampIn({ ...m, x, y }, frame);
    if (rel.rel === 'region') {
      const [cx, cy] = [frame.w / 2, frame.h / 2], mw = W(m) / 2 + margin, mh = H(m) / 2 + margin;
      const k = rel.region;
      if (k === 'centre') cand = [near(cx, cy)];
      else if (k in REGIONS) cand = [near(REGIONS[k][0] ? frame.w - mw : mw, REGIONS[k][1] ? frame.h - mh : mh)];
      else if (k === 'corner') cand = Object.values(REGIONS).map(([a, b]) => near(a ? frame.w - mw : mw, b ? frame.h - mh : mh)).sort((p, q) => Math.hypot(p.x - m.x, p.y - m.y) - Math.hypot(q.x - m.x, q.y - m.y));
      else if (k.startsWith('edge ')) { const d = k.slice(5); cand = [near(d === 'left' ? mw : d === 'right' ? frame.w - mw : m.x, d === 'top' ? mh : d === 'bottom' ? frame.h - mh : m.y)]; }
      else if (k.startsWith('half ')) { const d = k.slice(5); cand = [near(d === 'left' ? frame.w * 0.25 : d === 'right' ? frame.w * 0.75 : m.x, d === 'top' ? frame.h * 0.25 : d === 'bottom' ? frame.h * 0.75 : m.y)]; }
    } else if (rel.rel === 'between') {
      const [a, b] = refs;
      if (!a || !b) return { error: 'ref' };
      cand = [near((a.x + b.x) / 2, (a.y + b.y) / 2), near((a.x + b.x) / 2, (a.y + b.y) / 2 - H(m)), near((a.x + b.x) / 2, (a.y + b.y) / 2 + H(m))];
    } else if (rel.rel === 'in') cand = [near(r.x, r.y)];
    else if (rel.rel === 'on') cand = [near(r.x, br.t - H(m) / 2)];
    else if (rel.rel === 'around') { boxes[m.id] = { x: r.x, y: r.y, w: Math.round(W(r) * 1.4 + 2 * margin), h: Math.round(H(r) * 1.4 + 2 * margin) }; continue; }
    else if (r) {
      const g = gapPx, side = (d) => ({ right: near(br.r + W(m) / 2 + g, r.y), left: near(br.l - W(m) / 2 - g, r.y), above: near(r.x, br.t - H(m) / 2 - g), below: near(r.x, br.b + H(m) / 2 + g) }[d]);
      const order = rel.rel === 'above' ? ['above'] : rel.rel === 'under' ? ['below'] : rel.rel === 'leftof' ? ['left'] : rel.rel === 'rightof' ? ['right'] : (() => {
        const first = sideOf(r, m);   // the side the thing already is on
        return [first, ...['right', 'left', 'below', 'above'].filter((x) => x !== first)];
      })();
      cand = order.map(side);
      if (order.length === 1) {   // a fixed side: slide along it until nothing is in the way
        const d = order[0], horiz = d === 'left' || d === 'right', base = cand[0];
        for (let k = 1; k <= 12; k++) for (const sgn of [1, -1]) cand.push(near(base.x + (horiz ? 0 : sgn * k * (W(m) / 2 + gapPx)), base.y + (horiz ? sgn * k * (H(m) / 2 + gapPx) : 0)));
      }
    }
    if (!cand.length) return { error: 'rel' };
    const ignore = rel.rel === 'in' || rel.rel === 'on' ? [...refIds] : rel.rel === 'between' ? [] : [];
    const pick = cand.find((c) => free(c, ignore)) ?? cand[0];
    placed.push({ ...m, x: pick.x, y: pick.y });
    boxes[m.id] = { x: pick.x, y: pick.y };
  }
  return { boxes };
}

// ---- layouts -----------------------------------------------------------------------------------------------------------------------------------------
/** "in a row", "in a grid", "spread them out", "align them on the left", "same size", "centre them", "swap the first and the last", "tidy up": { op, how } or null. */
export function parseLayout(input) {
  const j = words(input).join(' ');
  const re = (x) => new RegExp(`\\b(?:${x})\\b`).test(j);
  if (re('tidy|tidy up|clean up|neaten|make a better layout|better layout|improve the layout|fix the layout|fix the overlaps?|no overlaps?|stop overlapping|stop them overlapping|untangle')) return { op: 'tidy' };
  if (re('swap|switch places|exchange places|trade places')) return { op: 'swap' };
  if (re('same size|same sizes|equal size|equal sizes|the same size')) return { op: 'size' };
  const a = /\balign\w*\b.*?\b(left|right|top|bottom|centres?|centers?|middle|horizontally|vertically)\b/.exec(j);
  if (a) return { op: 'align', how: { centre: 'cx', centres: 'cx', center: 'cx', centers: 'cx', middle: 'cx', horizontally: 'cy', vertically: 'cx' }[a[1]] ?? a[1] };
  if (re('in a row|in one row|in a line|in one line|line up|lined up|side by side|horizontally in a row|a row')) return { op: 'row' };
  if (re('in a column|in one column|in a stack|stack them|stacked|one under the other|on top of each other vertically|a column')) return { op: 'column' };
  if (re('in a grid|a grid|in rows and columns|into a grid')) return { op: 'grid' };
  if (re('in a circle|in a ring|into a circle|into a ring|round in a circle|a circle')) return { op: 'circle' };
  if (re('spread|space them|spaced|evenly|even spacing|distribute|space out|spread out')) return { op: 'spread' };
  if (re('centre|center|centered|centred|in the middle of the picture|in the middle of the frame')) return { op: 'centre' };
  return null;
}
const bounds = (items) => ({ l: Math.min(...items.map((i) => boxOf(i).l)), r: Math.max(...items.map((i) => boxOf(i).r)), t: Math.min(...items.map((i) => boxOf(i).t)), b: Math.max(...items.map((i) => boxOf(i).b)) });
/** Target boxes for a layout of `items` (at least 2, except centre and tidy). ctx: { frame, picks: two items for swap, how }. */
export function planLayout(op, items, frame, o = {}) {
  const n = items.length, boxes = {}, put = (it, x, y, extra = {}) => { const c = clampIn({ ...it, x, y }, frame); boxes[it.id] = { x: c.x, y: c.y, ...extra }; };
  if (op === 'swap') {
    const [a, b] = o.picks ?? items;
    if (!a || !b || a.id === b.id) return { error: 'two' };
    boxes[a.id] = { x: b.x, y: b.y }; boxes[b.id] = { x: a.x, y: a.y };
    return { boxes };
  }
  if (!n) return { error: 'none' };
  const ord = readingOrder(items), bb = bounds(items), cx = (bb.l + bb.r) / 2, cy = (bb.t + bb.b) / 2;
  const pad = Math.max(10, frame.w * 0.02);
  if (op === 'row' || op === 'column') {
    const row = op === 'row', sizes = ord.map((i) => (row ? W(i) : H(i))), total = sum(sizes), room = (row ? frame.w : frame.h) - 2 * pad;
    const g = Math.max(pad * 0.5, Math.min(pad * 3, (room - total) / Math.max(1, n - 1)));
    const span = total + g * (n - 1);
    let p = (row ? cx : cy) - span / 2;
    p = Math.max(pad, Math.min((row ? frame.w : frame.h) - pad - span, p));
    ord.forEach((it, k) => { const c = p + sizes[k] / 2; p += sizes[k] + g; row ? put(it, c, cy) : put(it, cx, c); });
  } else if (op === 'grid') {
    const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols), cw = Math.max(...items.map(W)) + pad, ch = Math.max(...items.map(H)) + pad;
    const x0 = Math.max(cw / 2, Math.min(frame.w - cw * cols + cw / 2, cx - (cw * (cols - 1)) / 2)), y0 = Math.max(ch / 2, Math.min(frame.h - ch * rows + ch / 2, cy - (ch * (rows - 1)) / 2));
    ord.forEach((it, k) => put(it, x0 + (k % cols) * cw, y0 + Math.floor(k / cols) * ch));
  } else if (op === 'circle') {
    const r = Math.max(Math.max(...items.map((i) => Math.max(W(i), H(i)))) * n / (2 * Math.PI) + pad, Math.min(frame.w, frame.h) * 0.2), rr = Math.min(r, Math.min(frame.w, frame.h) / 2 - Math.max(...items.map((i) => Math.max(W(i), H(i)))) / 2 - 4);
    const ccx = Math.min(frame.w - rr - 1, Math.max(rr + 1, cx)), ccy = Math.min(frame.h - rr - 1, Math.max(rr + 1, cy));
    ord.forEach((it, k) => { const a = -Math.PI / 2 + (2 * Math.PI * k) / n; put(it, ccx + rr * Math.cos(a), ccy + rr * Math.sin(a)); });
  } else if (op === 'spread') {
    if (n < 3) return { error: 'few' };
    const ax = axisOf(items) ?? 'x', s = items.slice().sort((a, b) => a[ax] - b[ax]), lo = s[0][ax], hi = s.at(-1)[ax];
    s.forEach((it, k) => { const c = lo + ((hi - lo) * k) / (n - 1); ax === 'x' ? put(it, c, it.y) : put(it, it.x, c); });
  } else if (op === 'align') {
    const how = o.how ?? 'cx';
    for (const it of items) {
      if (how === 'left') put(it, bb.l + W(it) / 2, it.y); else if (how === 'right') put(it, bb.r - W(it) / 2, it.y);
      else if (how === 'top') put(it, it.x, bb.t + H(it) / 2); else if (how === 'bottom') put(it, it.x, bb.b - H(it) / 2);
      else if (how === 'cx') put(it, cx, it.y); else put(it, it.x, cy);
    }
  } else if (op === 'size') {
    const w = Math.round(sum(items.map(W)) / n), h = Math.round(sum(items.map(H)) / n);
    for (const it of items) boxes[it.id] = { x: it.x, y: it.y, w, h };
  } else if (op === 'centre') {
    const dx = frame.w / 2 - cx, dy = frame.h / 2 - cy;
    for (const it of items) put(it, it.x + dx, it.y + dy);
  } else if (op === 'tidy') return tidy(items, frame, o.all ?? items);
  else return { error: 'op' };
  return { boxes };
}
/** Pushes overlapping boxes apart along the shorter way out, keeping the reading order as far as possible, until nothing overlaps (or 80 rounds). */
function tidy(items, frame, all) {
  const cur = new Map(items.map((i) => [i.id, { ...i }])), still = all.filter((o) => !cur.has(o.id));
  const gp = 4;
  for (let round = 0; round < 80; round++) {
    let moved = false;
    const list = [...cur.values()];
    for (let i = 0; i < list.length; i++) for (const q of [...list.slice(i + 1), ...still]) {
      const a = list[i];
      if (!overlaps(a, q, -gp * 0 + 0)) continue;
      const pa = boxOf(a), pq = boxOf(q);
      const ox = Math.min(pa.r, pq.r) - Math.max(pa.l, pq.l) + gp, oy = Math.min(pa.b, pq.b) - Math.max(pa.t, pq.t) + gp;
      const fixedQ = still.includes(q), share = fixedQ ? 1 : 0.5;
      if (ox <= oy) { const s = a.x <= q.x ? -1 : 1; a.x += s * ox * share; if (!fixedQ) q.x -= s * ox * 0.5; }
      else { const s = a.y <= q.y ? -1 : 1; a.y += s * oy * share; if (!fixedQ) q.y -= s * oy * 0.5; }
      Object.assign(a, clampIn(a, frame)); if (!fixedQ) Object.assign(q, clampIn(q, frame));
      moved = true;
    }
    if (!moved) break;
  }
  const boxes = {};
  for (const [id, c] of cur) { const o = items.find((i) => i.id === id); if (Math.round(c.x) !== Math.round(o.x) || Math.round(c.y) !== Math.round(o.y)) boxes[id] = { x: Math.round(c.x), y: Math.round(c.y) }; }
  return { boxes, nothing: !Object.keys(boxes).length };
}
/** Is anything overlapping? */
export const anyOverlap = (items) => items.some((a, i) => items.slice(i + 1).some((b) => overlaps(a, b, 1)));

// ---- questions ---------------------------------------------------------------------------------------------------------------------------------------
/** "what is next to the house", "which one is in the middle", "is the sun above the tree", "how far apart are A and B": { ask, ... } or null. */
export function parseQuestion(input) {
  const t = words(input), j = t.join(' ');
  let m;
  if ((m = /^(?:what|whats|what s|which things?|what things?) (?:is|are)? ?(?:there )?(?:next_to|beside|near|close_to|by|around) (.+)$/.exec(j))) return { ask: 'near', ref: m[1].split(' ') };
  if ((m = /^(?:is|are) (.+?) (above|over|below|under|beneath|underneath|left_of|right_of|next_to|near|beside|close_to|between|on_top_of) (.+)$/.exec(j))) return { ask: 'is', a: m[1].split(' '), rel: RELATIONS[m[2]], b: m[3].split(' ') };
  if ((m = /^how far (?:apart )?(?:is|are) (.+?)(?: apart)?(?: from| and| to) (.+?)(?: apart)?$/.exec(j))) return { ask: 'far', a: m[1].split(' '), b: m[2].split(' ') };
  if ((m = /^which (?:one )?(?:(.+?) )?(?:is|are) (.+)$/.exec(j)) || (m = /^which (.+?) (?:is|are) (.+)$/.exec(j))) return { ask: 'which', kind: (m[1] ?? '').split(' ').filter(Boolean), cond: m[2].split(' ') };
  return null;
}
/** The words of the distance of two items: 'touching', 'close', 'a bit apart' or 'far apart' (never pixels). */
export function distanceWord(a, b, frame) {
  const g = gap(a, b), f = Math.hypot(frame.w, frame.h);
  return g < 2 ? 'touching' : g < f * 0.12 ? 'close' : g < f * 0.3 ? 'a bit apart' : 'far apart';
}
/** Does relation `rel` hold of A to B? */
export function holds(rel, a, b, ctxItems = [], frame = { w: 1000, h: 700 }) {
  if (rel === 'above') return b.y - a.y > 0 && sideOf(b, a) === 'above';
  if (rel === 'under') return a.y - b.y > 0 && sideOf(b, a) === 'below';
  if (rel === 'leftof') return sideOf(b, a) === 'left';
  if (rel === 'rightof') return sideOf(b, a) === 'right';
  if (rel === 'next') return gap(a, b) < Math.hypot(frame.w, frame.h) * 0.12;
  if (rel === 'on') return a.y < b.y && Math.abs(boxOf(a).b - boxOf(b).t) < Math.max(10, H(a) * 0.3) && Math.abs(a.x - b.x) < (W(a) + W(b)) / 2;
  void ctxItems;
  return false;
}

// ---- the whole sentence ------------------------------------------------------------------------------------------------------------------------------------
const PLACE_VERBS = new Set(['move', 'shift', 'push', 'slide', 'nudge', 'drag', 'put', 'place', 'set', 'bring', 'send', 'take', 'lift', 'lower', 'raise', 'carry', 'scoot', 'relocate', 'reposition', 'tuck', 'park']);
const LAYOUT_VERBS = new Set(['line', 'arrange', 'spread', 'space', 'align', 'tidy', 'clean', 'neaten', 'centre', 'center', 'stack', 'distribute', 'swap', 'switch', 'exchange', 'trade', 'fix', 'improve', 'make', 'untangle', 'organise', 'organize']);
const FILLER = new Set(['please', 'pls', 'now', 'also', 'then', 'ok', 'okay', 'and', 'so', 'can', 'could', 'would', 'you', 'will', 'just', 'hey', 'right', 'well', 'i', 'want', 'wish', 'like', 'me']);
const DIR_START = new Set(['to', 'towards', 'toward', 'into', 'onto']);
const WEAK = new Set(['in', 'on', 'at', 'inside']);
const REL_STRONG = new Set(['above', 'over', 'under', 'below', 'beneath', 'underneath', 'beside', 'near', 'next_to', 'close_to', 'between', 'around', 'left_of', 'right_of', 'on_top_of']);
const DETS = new Set(['the', 'a', 'an', 'my', 'this', 'that']);

/** Splits the words after a moving verb into the thing and the destination: { target, dest }. */
export function splitMove(t, kindOf = () => null) {
  const kindAt = (w) => !!w && (w === 'one' || w === 'ones' || !!kindOf(w) || !!classify(w));
  const starts = [];
  for (let i = 1; i < t.length; i++) {
    const w = t[i], prev = t[i - 1];
    if (DIR_START.has(w)) starts.push([i, 'to']);
    else if (Object.hasOwn(AMOUNTS, w) || MORE.includes(w)) starts.push([i, 'amount']);
    else if (Object.hasOwn(DIRS, w)) { if (!(DETS.has(prev) || classify(prev) || ['on', 'in', 'at', 'from', 'of'].includes(prev)) && !(kindAt(t[i + 1]) && t[i + 1] !== 'and')) starts.push([i, 'dir']); }
    else if (REL_STRONG.has(w)) starts.push([i, 'rel']);
    else if (WEAK.has(w)) starts.push([i, 'weak']);
  }
  if (!starts.length) return { target: t, dest: [] };
  let [at, kind] = starts[0];
  if (kind === 'weak' || kind === 'rel') {
    const later = starts.find(([i, k]) => i > at && (k === 'to' || k === 'dir' || k === 'amount'));
    if (later) [at] = later;
  }
  return { target: t.slice(0, at), dest: t.slice(at) };
}

const stripFiller = (t) => { let i = 0; while (i < t.length && FILLER.has(t[i])) i++; return t.slice(i); };
const pronoun = (t) => t.length > 0 && t.length <= 2 && t.every((w) => ['it', 'them', 'that', 'this', 'those', 'these', 'one', 'ones', 'the', 'same'].includes(w));

/** The items a noun phrase means: { ids, items } | { ask } | { error }. */
export function resolve(tokens, ctx, o = {}) {
  const t = words(tokens), items = ctx.items ?? [];
  if (!t.length || pronoun(t)) { const ids = (ctx.last ?? []).filter((id) => items.some((i) => i.id === id)); return ids.length ? { ids, items: items.filter((i) => ids.includes(i.id)) } : { error: 'nolast' }; }
  if (t.some((w) => w === 'everything' || w === 'all' || w === 'things') && t.every((w) => ['everything', 'all', 'all_of', 'the', 'of', 'things', 'stuff', 'them'].includes(w))) return { ids: items.map((i) => i.id), items };
  const spec = parseSel(t, ctx.kindOf);
  if (spec.unknown.length && !spec.kind) return { error: 'unknown', note: spec.unknown[0] };
  const pool = items.filter((i) => (!spec.kind || spec.kind === '*' || i.kind === spec.kind) && !(o.exclude ?? []).includes(i.id));
  if (!pool.length) return { error: 'none', spec };
  const r = select(pool, spec, { ...ctx, resolve: (x) => resolve(x, ctx, { exclude: o.exclude }).items ?? [] });
  if (r.ask || r.error) return { ...r, spec };
  return { ids: r.ids, items: items.filter((i) => r.ids.includes(i.id)), spec };
}

const nameOf = (it, all) => label(it, all.filter((x) => x.kind === it.kind));
const groupName = (its, all) => (its.length === 1 ? nameOf(its[0], all) : `the ${its[0].name ?? its[0].kind}s`);

/**
 * The whole sentence at once. ctx: { items, frame, kindOf, last: ids, lastMove }. Returns null when the sentence is not about places, or
 * { type: 'move' | 'layout' | 'answer' | 'ask' | 'error', boxes, ids, say, memory }.
 */
export function interpret(text, ctx) {
  const items = ctx.items ?? [], frame = ctx.frame;
  let t = stripFiller(words(text));
  if (!t.length) return null;
  const q = parseQuestion(t);
  if (q) return answerQuestion(q, ctx);
  const verb = PLACE_VERBS.has(t[0]) ? 'place' : LAYOUT_VERBS.has(t[0]) ? 'layout' : null;
  if (verb === 'layout') return layoutOf(t, ctx);
  if (verb === 'place' && parseLayout(t) && !['tidy', 'swap', 'size', 'centre'].includes(parseLayout(t).op)) return layoutOf(t, ctx);   // "put the houses in a row"
  if (verb) t = t.slice(1);
  const bare = !verb && (Object.hasOwn(DIRS, t[0]) || MORE.includes(t[0]) || Object.hasOwn(AMOUNTS, t[0]));   // a follow-up with no verb and no thing: "further left", "a bit more to the right"
  if (!verb && !bare) return null;
  const { target, dest } = bare ? { target: [], dest: t } : splitMove(t, ctx.kindOf);
  const res = resolve(target, ctx);
  if (res.ask) return { type: 'ask', say: res.ask, candidates: res.candidates };
  if (res.error === 'nolast') return { type: 'error', say: 'Which one should I move? Say, for example, "the middle one".' };
  if (res.error) return errorOf(res, target);
  const movers = res.items;
  const rel = parseRel(dest);
  const dirOnly = rel?.rel === 'region' && !dest.some((w) => ['corner', 'centre', 'center', 'middle', 'edge', 'in', 'on', 'at', 'into', 'onto', 'inside'].includes(w));
  if (rel && !dirOnly) {
    const refs = [];
    for (const r of rel.refs ?? []) { const x = resolve(r, ctx, { exclude: movers.map((m) => m.id) }); if (x.ask) return { type: 'ask', say: x.ask, candidates: x.candidates }; if (x.error) return errorOf(x, r); refs.push(x.items[0]); }
    const out = planPlace(movers, rel, refs, frame, items);
    if (out.error) return { type: 'error', say: 'I could not find a place for that.' };
    return { type: 'move', ids: movers.map((m) => m.id), boxes: out.boxes, say: `I put ${groupName(movers, items)} ${sayRel(rel, refs, items)}.`, memory: null, dest: dest.join(' '), kind: res.spec?.kind ?? '*' };
  }
  const mv = parseMove(dest);
  if (!mv) return { type: 'error', say: 'Where should it go? Try "to the left", "a bit higher" or "next to the sun".' };
  const out = planMove(movers, frame, mv, ctx.lastMove);
  if (out.error) return { type: 'error', say: 'I do not remember a move to repeat. Say which way to go.' };
  return { type: 'move', ids: movers.map((m) => m.id), boxes: out.boxes, say: `I moved ${groupName(movers, items)} ${sayMove({ segs: out.memory.segs })}.`, memory: out.memory, dest: dest.join(' '), kind: res.spec?.kind ?? '*' };
}
const sayRel = (rel, refs, all) => {
  const n = (r) => nameOf(r, all);
  if (rel.rel === 'region') return rel.region === 'centre' ? 'in the centre' : rel.region.startsWith('half ') ? `on the ${rel.region.slice(5)}` : rel.region.startsWith('edge ') ? `at the ${rel.region.slice(5)} edge` : rel.region === 'corner' ? 'in the corner' : `in the ${rel.region} corner`;
  const p = { above: 'above', under: 'under', leftof: 'to the left of', rightof: 'to the right of', next: 'next to', in: 'in', on: 'on', around: 'around' }[rel.rel];
  return rel.rel === 'between' ? `between ${n(refs[0])} and ${n(refs[1])}` : `${p} ${n(refs[0])}`;
};
function errorOf(res, tokens) {
  const w = words(tokens).join(' ');
  if (res.error === 'few') return { type: 'error', say: `There ${res.n === 1 ? 'is only 1' : `are only ${res.n}`}, so there is no such one.` };
  if (res.error === 'unknown') return { type: 'error', say: `I do not know what "${res.note}" is.` };
  return { type: 'error', say: `I can not find ${w ? `"${w}"` : 'that'} here.` };
}

function layoutOf(t, ctx) {
  const items = ctx.items ?? [], lay = parseLayout(t);
  if (!lay) return null;
  let group = items;
  const spec = parseSel(t.filter((w) => !['row', 'column', 'grid', 'circle', 'places', 'in', 'a', 'size', 'same', 'up'].includes(w)), ctx.kindOf);
  if (spec.kind && spec.kind !== '*') group = items.filter((i) => i.kind === spec.kind);
  if (lay.op === 'swap') {
    const j = t.indexOf('and'), strip = (x) => x.filter((w) => !['places', 'with', 'swap', 'switch', 'exchange', 'trade', 'the_places_of'].includes(w));
    let ta = strip(t.slice(0, j)), tb = strip(t.slice(j + 1));
    const kw = (x) => x.find((w) => ctx.kindOf?.(w)), shared = kw(tb) ?? kw(ta);   // "the first and the last house": one kind for both
    if (shared && !kw(ta)) ta = [...ta, shared];
    if (shared && !kw(tb)) tb = [...tb, shared];
    const a = j > 0 ? resolve(ta, ctx) : null;
    const b = j > 0 ? resolve(tb, ctx, { exclude: a?.ids ?? [] }) : null;
    for (const r of [a, b]) if (r?.ask) return { type: 'ask', say: r.ask, candidates: r.candidates };
    if (!a?.items?.length || !b?.items?.length) return { type: 'error', say: 'Which two should I swap? Say, for example, "swap the first and the last".' };
    const out = planLayout('swap', [], ctx.frame, { picks: [a.items[0], b.items[0]] });
    return { type: 'layout', ids: [a.ids[0], b.ids[0]], boxes: out.boxes, say: `I swapped ${nameOf(a.items[0], items)} and ${nameOf(b.items[0], items)}.` };
  }
  if (!group.length) return { type: 'error', say: 'There is nothing to arrange yet.' };
  if (lay.op === 'tidy') {
    if (!anyOverlap(group)) return { type: 'layout', ids: [], boxes: {}, say: 'Nothing overlaps, so it is already tidy.' };
    const out = planLayout('tidy', group, ctx.frame, { all: items });
    return { type: 'layout', op: 'tidy', ids: Object.keys(out.boxes), boxes: out.boxes, say: 'I tidied up: nothing overlaps now, and the order is the same.' };
  }
  if (group.length < 2 && lay.op !== 'centre') return { type: 'error', say: 'I need at least two things for that.' };
  const out = planLayout(lay.op, group, ctx.frame, { how: lay.how });
  if (out.error === 'few') return { type: 'error', say: 'I need at least three things to spread out.' };
  if (out.error) return { type: 'error', say: 'I could not arrange them like that.' };
  const nm = { row: 'in a row', column: 'in a column', grid: 'in a grid', circle: 'in a circle', spread: 'spread out evenly', align: `aligned (${lay.how === 'cx' ? 'centres' : lay.how})`, size: 'the same size', centre: 'in the centre' }[lay.op];
  return { type: 'layout', op: lay.op, ids: group.map((g) => g.id), boxes: out.boxes, say: `I put ${group.length === 1 ? nameOf(group[0], items) : `the ${group.length} ${group.every((g) => g.kind === group[0].kind) ? `${group[0].name ?? group[0].kind}s` : 'things'}`} ${nm}.` };
}

/** The answer to a question about places: { type: 'answer', say } (or ask / error). */
export function answerQuestion(q, ctx) {
  const items = ctx.items ?? [], frame = ctx.frame ?? { w: 1000, h: 700 };
  const bad = (r) => (r.ask ? { type: 'ask', say: r.ask, candidates: r.candidates } : r.error ? errorOf(r, []) : null);
  if (q.ask === 'near') {
    const r = resolve(q.ref, ctx); if (bad(r)) return bad(r);
    const ref = r.items[0], f = Math.hypot(frame.w, frame.h);
    const near = items.filter((i) => i.id !== ref.id).map((i) => ({ i, g: gap(i, ref) })).filter((x) => x.g < f * 0.18).sort((a, b) => a.g - b.g).slice(0, 3);
    if (!near.length) return { type: 'answer', say: `Nothing is next to ${nameOf(ref, items)}.` };
    const side = { left: 'on its left', right: 'on its right', above: 'above it', below: 'below it' };
    return { type: 'answer', say: `Next to ${nameOf(ref, items)} there ${near.length === 1 ? 'is' : 'are'} ${listOf(near.map((x) => `${nameOf(x.i, items)} (${side[sideOf(ref, x.i)]})`))}.`, ids: near.map((x) => x.i.id) };
  }
  if (q.ask === 'is' || q.ask === 'far') {
    const a = resolve(q.a, ctx), b = resolve(q.b, ctx, { exclude: a.ids ?? [] });
    if (bad(a)) return bad(a);
    if (bad(b)) return bad(b);
    const [A, B] = [a.items[0], b.items[0]];
    if (q.ask === 'far') {
      const d = distanceWord(A, B, frame);
      return { type: 'answer', say: `${cap(nameOf(A, items))} and ${nameOf(B, items)} are ${d === 'close' ? 'close together' : d}.`, far: d };
    }
    const ok = holds(q.rel, A, B, items, frame);
    const rel = { above: 'above', under: 'under', leftof: 'to the left of', rightof: 'to the right of', next: 'next to', on: 'on' }[q.rel] ?? 'near';
    if (ok) return { type: 'answer', say: `Yes, ${nameOf(A, items)} is ${rel} ${nameOf(B, items)}.`, yes: true };
    const where = { left: 'to the left of', right: 'to the right of', above: 'above', below: 'under' }[sideOf(B, A)];
    return { type: 'answer', say: `No, ${nameOf(A, items)} is not ${rel} ${nameOf(B, items)}. It is ${where} it.`, yes: false };
  }
  if (q.ask === 'which') {
    const kind = parseSel(q.kind, ctx.kindOf), cond = parseSel(q.cond, ctx.kindOf), k = kind.kind ?? cond.kind;
    const pool = items.filter((i) => !k || k === '*' || i.kind === k);
    if (!pool.length) return { type: 'error', say: 'I can not find any here.' };
    const r = select(pool, cond, { ...ctx, resolve: (x) => resolve(x, ctx).items ?? [] });
    if (r.ask) return { type: 'answer', say: r.ask };
    if (r.error) return { type: 'error', say: 'I could not tell which one.' };
    return { type: 'answer', say: `${cap(nameOf(items.find((i) => i.id === r.ids[0]), items))} is the one.`, ids: r.ids };
  }
  return null;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
