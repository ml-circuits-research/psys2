// SPDX-License-Identifier: AGPL-3.0-only
// art.draw board: the drawing board itself, as a tool (spec 28 sections 12, 14). Its state, its history (one step per request), where a thing goes (placement: regions, bands, next
// to a thing, a free spot by the facts of common.sense), and the TOOL PRIMITIVES the request door runs through request.sop's std.tool wires, with the board's view as facts.
// No request, no words of a person, no reply sentences, no defaults chosen for a person: values come in as the tool takes them (the library translated them by knowledge before the
// call) and a call answers with a status, the ids it changed, or a refusal code / a reply fact's name. The word operations of the old readers (engine.mjs) build on this module; this
// module never imports them. Browser-safe.
import {
  W, H, HORIZON, GROUND_BASE, KINDS, REGIONS, SHADES, canonColor, defaultColor, bbox, placeInRegion, regionOf, kindKey, kindName, COMPOSITE, isThing, ensureCustom, thingOfKey,
} from './scene.mjs?v=43e8625ad0';
import { habitat } from '../../lib/knowledge/habitat.mjs?v=4998d59925';   // the knowledge tier's common sense (T3): where a kind usually is, when the facts of this world say nothing

// The turn's step budget (a no-op outside a turn): placement is a search whose cost grows with the picture.
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
const MAX_HISTORY = 50;
const TAB = 'draw';

export function initialState() {
  return {
    canvas: { w: W, h: H }, objects: [], background: 'white', sky: null, ground: null, groundColor: null, mood: null, sunStash: [], sunPose: null,
    selected: null, last: [], history: [], future: [], nextId: 1, seq: 0, seed: 20240611, rels: { facts: [], seq: 0 }, scenes: [], sceneSeq: 0,
  };
}
/** The colour of each band of the ground (the tool's own bands). */
export const GROUND_COLOR = { grass: 'green', sand: 'yellow', snow: 'white', sea: 'blue' };

/**
 * What the board knows while an operation runs (shared with the word operations of engine.mjs, which read and set it):
 *   usual  kind -> where it usually is (common.sense.livesin: sky | ground | water | horizon)     needs  kinds that cannot be anywhere else (a fish)
 *   ruled  kinds whose common.sense rule says the advice itself                                    know   the session's knowledge (the catalog and what was taught)
 *   scene  the picture the running operation works on                                              said   the place word read as the ground band (set by the word operations)
 *   note   what the last placing did that nobody asked for, as a fact (never a sentence): { did: 'into_pond' | 'into_sea' | 'made_sea' | 'made_pond', kind } or
 *          { advice: { kind, place } } (the word operations say it; the primitives do not)
 */
export const B = { usual: new Map(), needs: new Set(), ruled: new Set(), know: null, scene: null, said: null, note: null };

function loadUsualPlaces(ctx) {
  let rows = [];
  try { rows = ctx.find('common.sense.livesin'); } catch { rows = []; }
  const m = new Map();
  for (const w of rows) {
    if (ctx.val(w, 'usual') !== 'yes') continue;
    m.set(ctx.val(w, 'kind'), ctx.val(w, 'where') === 'horizon' ? 'horizon' : ctx.val(w, 'place'));
    if (ctx.val(w, 'must') === 'yes') B.needs.add(ctx.val(w, 'kind'));
  }
  if (m.size) B.usual = m;
  try { B.ruled = new Set(ctx.find('common.sense.rule').map((w) => ctx.val(w, 'kind'))); } catch { B.ruled = new Set(); }
}

// ---- state access -----------------------------------------------------------------------------------------------------
export function ensure(ctx) {
  const s = ctx.state, d = initialState();
  for (const o of s.objects ?? []) ensureCustom(o);   // pieces and groups come back from a saved state with their shape
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  loadUsualPlaces(ctx);
  B.know = ctx.knowledge ?? null;
  B.said = null;
  B.note = null;
  B.scene = s;
  return s;
}
const knownAnchor = (kind) => { const z = habitat(B.know, String(kind).replace(/_/g, ' '))?.zones?.[0]; return z ?? null; };   // delegation: a kind this world has no row for is asked of the knowledge tier   // glue-lint: tool-data (kind name)
export const anchorOf = (kind) => B.usual.get(kind) ?? knownAnchor(kind) ?? (KINDS[kind]?.region ? 'ground' : 'any');   // a place (lake, road, field) lies on the ground
export const onGround = (kind) => ['ground', 'horizon'].includes(anchorOf(kind));
export const byId = (s, id) => s.objects.find((o) => o.id === id);
export const effectiveColor = (o) => o.color ?? defaultColor(kindKey(o));
export const open = (ctx) => { try { ctx.request('ui.openTab', { tab: TAB }); } catch { /* the shell may not know the tab */ } };
export const rnd = (s) => { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296; };
export const idNum = (o) => Number(String(o.id).replace(/\D/g, '')) || 0;   // glue-lint: tool-data (thing id)
/** A colour of the catalog from colour words (a shade and a colour). */
export function colorFrom(words, fallback = null) {
  let shade = null, color = null;
  for (const w of words) { if (Object.hasOwn(SHADES, w)) shade = w; else if (canonColor([w])) color = w; }
  if (!color && shade && fallback) color = fallback.split(' ').at(-1);
  return color ? canonColor([shade, color].filter(Boolean)) : null;
}
/** The size grade of a thing, against its kind's own size. */
export const sizeWord = (o) => {
  const f = o.size / (KINDS[kindKey(o)]?.size ?? o.size);
  return f >= 2 ? 'huge' : f >= 1.35 ? 'big' : f <= 0.45 ? 'tiny' : f <= 0.78 ? 'small' : '';
};

// ---- history: one request, one undo step -------------------------------------------------------------------------------
/** Compact copy of the picture for undo. */
export function snapshot(s, label) {
  return {
    label, objects: s.objects.map((o) => ({ ...o, parts: { ...(o.parts ?? {}) } })), background: s.background, sky: s.sky, ground: s.ground,
    groundColor: s.groundColor, mood: s.mood, sunStash: structuredClone(s.sunStash ?? []), selected: s.selected, last: [...s.last], rels: structuredClone(s.rels ?? { facts: [], seq: 0 }), scenes: structuredClone(s.scenes ?? []),
  };
}
export function restore(s, snap) {
  s.objects = snap.objects.map((o) => ({ ...o, parts: { ...(o.parts ?? {}) } }));
  s.rels = structuredClone(snap.rels ?? { facts: [], seq: 0 });
  s.scenes = structuredClone(snap.scenes ?? []);
  Object.assign(s, { background: snap.background, sky: snap.sky, ground: snap.ground, groundColor: snap.groundColor, mood: snap.mood, sunStash: snap.sunStash, selected: snap.selected && byId(s, snap.selected) ? snap.selected : null, last: snap.last.filter((id) => byId(s, id)) });
}
/** Call before changing the picture. */
export function remember(s, label) {
  s.history.push(snapshot(s, label));
  s.prev = s.history.at(-1);   // the picture before the newest step: what follow-ups ("but keep the lake", "not over the water") compare with, in both reasoners
  if (s.history.length > MAX_HISTORY) s.history.splice(0, s.history.length - MAX_HISTORY);
  s.future = [];
}
/**
 * ONE REQUEST, ONE UNDO STEP (specs/15 "one step per request", specs/24): `fn(s)` runs several operations of the board, each remembering a step. When it does not return a supported
 * result the picture is restored as it was and no step is left (all or nothing); otherwise the steps collapse into the first one, labelled `label`, so one "undo" takes the request back.
 * An exception is the result `{ status: 'error', code: 'tool_error', detail }` (the caller says it).
 */
export function oneStep(ctx, label, fn) {
  const s = ensure(ctx), base = s.history.length, snap = snapshot(s, label);
  let r;
  try { r = fn(s); } catch (e) { r = { status: 'error', code: 'tool_error', detail: String(e?.message ?? e) }; }
  if (r?.status !== 'supported') { restore(s, snap); s.history.length = Math.min(s.history.length, base); s.prev = s.history.at(-1) ?? null; return r; }
  if (s.history.length > base + 1) s.history.splice(base + 1);
  if (s.history[base]) s.history[base].label = label;
  s.prev = s.history.at(-1) ?? null;
  return r;
}

// ---- placement ----------------------------------------------------------------------------------------------------------
export function overlapRatio(a, b) {
  const x = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)), y = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  return (x * y) / Math.max(1, Math.min(a.w * a.h, b.w * b.h));
}
const sameLayer = (a, b) => {
  const la = anchorOf(kindKey(a)), lb = anchorOf(kindKey(b));
  if (la === 'any' || lb === 'any') return true;
  const g = (x) => (x === 'horizon' || x === 'water' ? 'ground' : x);
  return g(la) === g(lb);
};
/** How much a thing overlaps the most crowded neighbour of its layer (0 = free). */
export const crowd = (s, o, ignore) => (budget.tick('art.place', s.objects.length + 1), s.objects).filter((x) => x !== o && x.id !== ignore && sameLayer(x, o)).reduce((m, x) => Math.max(m, overlapRatio(bbox(o), bbox(x))), 0);

export function clampIn(o, margin = 4) {
  const b = bbox(o);
  if (b.w <= W - 2 * margin) o.x = Math.min(W - margin - b.w / 2, Math.max(margin + b.w / 2, o.x));
  if (b.h <= H - 2 * margin) o.y = Math.min(H - margin - b.h / 2, Math.max(margin + b.h / 2, o.y));
  o.x = Math.round(o.x); o.y = Math.round(o.y);
}

const GROUND_X = [500, 250, 750, 130, 870, 375, 625, 60, 940];
const SKY_X = [850, 150, 500, 330, 690, 60, 940, 230, 780];
/**
 * Where a thing of the water goes when nobody said where: into a pond that is in the picture, else into the sea when the ground is the sea (the ground band); with `make` (the word
 * operations), else the water is made: the sea when there is no ground yet, a pond on the ground otherwise. Returns the spot in a pond, or null for the ground band. `B.note` says
 * what was done (a fact).
 */
function waterSpot(s, o, make) {
  const pond = s.objects.find((x) => x.tag === 'pond' || kindKey(x) === 'lake');
  if (!pond && s.ground !== 'sea' && (!make || !B.needs.has(kindKey(o)))) return null;   // no water and the thing can do without (or nobody asked to make it): it stands where things of the ground stand
  if (pond) { B.note = { did: 'into_pond', kind: kindKey(o) }; return { x: pond.x, y: pond.y }; }
  if (s.ground === 'sea') { B.note = { did: 'into_sea', kind: kindKey(o) }; return null; }
  if (!s.ground && !s.objects.some((x) => onGround(kindKey(x)))) { s.ground = 'sea'; s.groundColor = 'blue'; B.note = { did: 'made_sea', kind: kindKey(o) }; return null; }
  const p = makeObject(s, 'lake', { color: 'blue', tag: 'pond' });
  p.size = 260; p.z = o.z - 1;
  defaultSpotOn(s, p, 'ground');
  s.objects.push(p);
  B.note = { did: 'made_pond', kind: kindKey(o) };
  return { x: p.x, y: p.y };
}

/** Free spot for a new object by the default rules of its kind (`make`: the water a thing of the water needs may be made). */
export function defaultSpot(s, o, make = true) {
  const b0 = bbox(o);
  let anchor = anchorOf(kindKey(o));
  if (anchor === 'water') {   // a thing of the water goes into the water that is in the picture (common.sense: fish live in water)
    const spot = waterSpot(s, o, make);
    if (spot) { o.x = spot.x; o.y = spot.y; clampIn(o); return; }
    anchor = 'ground';
  }
  const cand = [];
  if (anchor === 'ground') {
    for (const x of GROUND_X) for (const dy of [0, 36, -20]) cand.push([x, GROUND_BASE + dy - b0.h / 2]);
  } else if (anchor === 'horizon') {
    for (const x of [680, 300, 500, 130, 880]) cand.push([x, HORIZON + 28 - b0.h / 2]);
  } else if (anchor === 'sky') {
    const pref = kindKey(o) === 'sun' || kindKey(o) === 'moon' ? [[850, 120], [150, 120], [500, 100]] : kindKey(o) === 'rainbow' ? [[500, 240], [380, 250], [620, 250]] : [];
    cand.push(...pref);
    for (const y of [120, 230, 330, 70, 400]) for (const x of SKY_X) cand.push([x, y]);
    for (const c of cand) c[1] = Math.min(c[1], HORIZON - 30 - b0.h / 2 + (kindKey(o) === 'rainbow' ? 120 : 0));
  } else {
    for (const [x, y] of [[500, 330], [250, 250], [750, 250], [250, 450], [750, 450], [500, 150], [500, 520], [120, 330], [880, 330]]) cand.push([x, y]);
  }
  let best = null, bestScore = Infinity;
  for (const [x, y] of cand) {
    o.x = x; o.y = y; clampIn(o);
    const c = crowd(s, o);
    if (c < 0.1) return;
    if (c < bestScore) { bestScore = c; best = [o.x, o.y]; }
  }
  [o.x, o.y] = best;
}

/** Place `o` by a named region. A region the thing does not usually stand in leaves `B.note = { advice }` (the word operations say the knowledge's advice). */
export function placeRegion(s, o, region) {
  const b = bbox(o);
  const spot = placeInRegion(region, b.w, b.h, anchorOf(kindKey(o)));
  o.x = spot.x; o.y = spot.y;
  if (region === 'sky' || region === 'ground') o.zone = region;   // the user named the sky or the ground: common.sense may say it when that is not where such a thing usually is
  if ((region === 'sky' || region === 'ground') && !B.ruled.has(kindKey(o)) && !B.note) B.note = { advice: { kind: kindKey(o), place: B.said ?? region } };
  B.said = null;   // the kinds without a rule of this world's own: the knowledge tier says it, in both reasoners
  if (region === 'ground') { // a free spot on the ground band
    const keep = o.y; defaultSpotOn(s, o, 'ground'); if (!Number.isFinite(o.y)) o.y = keep;
  }
  clampIn(o);
  // make room: slide towards the middle while something big sits there
  for (let i = 0; i < 6 && crowd(s, o) > 0.45; i++) { o.x += (o.x < W / 2 ? 1 : -1) * Math.max(40, b.w * 0.8); clampIn(o); }
}
export function defaultSpotOn(s, o, anchor) {
  const saved = anchorOf(kindKey(o));
  const b0 = bbox(o);
  let best = null, bestScore = Infinity;
  for (const x of GROUND_X) {
    o.x = x; o.y = GROUND_BASE + 10 - b0.h / 2; clampIn(o);
    const c = crowd(s, o);
    if (c < bestScore) { bestScore = c; best = [o.x, o.y]; }
    if (c < 0.1) break;
  }
  [o.x, o.y] = best;
  void saved; void anchor;
}

/** Place `o` relative to other objects (already resolved): next, leftof, rightof, above, on, below, front, behind, in, around, between. */
export function placeRelative(s, o, rel0, refs) {
  const rel = rel0 === 'on' && KINDS[kindKey(refs[0])]?.region ? 'in' : rel0;   // on the lake is in it; on top of the house is above it
  const gap = 24, b = bbox(o);
  const R0 = bbox(refs[0]);
  const ground = onGround(kindKey(o)) || anchorOf(kindKey(o)) === 'water';
  const alignY = (r) => (ground && (anchorOf(kindKey(refs[0])) === 'ground') ? r.y1 - b.h / 2 : r.cy);
  const place = { x: o.x, y: o.y };
  const sideX = (dir, r) => (dir > 0 ? r.x1 + gap + b.w / 2 : r.x0 - gap - b.w / 2);
  switch (rel) {
    case 'rightof': place.x = sideX(1, R0); place.y = alignY(R0); break;
    case 'leftof': place.x = sideX(-1, R0); place.y = alignY(R0); break;
    case 'next': {
      const dir = R0.x1 + gap + b.w > W - 6 ? -1 : (R0.x0 - gap - b.w < 6 ? 1 : (R0.cx < W / 2 ? 1 : -1));
      place.x = sideX(dir, R0); place.y = alignY(R0);
      // a neighbour already stands there: try the other side
      o.x = place.x; o.y = place.y;
      if (crowd(s, o) > 0.3) { place.x = sideX(-dir, R0); o.x = place.x; if (crowd(s, o) > 0.3) { place.x = sideX(dir, R0) + dir * (b.w + gap); } }
      break;
    }
    case 'above': place.x = R0.cx; place.y = R0.y0 - gap - b.h / 2; break;
    case 'on': place.x = R0.cx; place.y = R0.y0 - b.h / 2 + Math.min(10, b.h * 0.1); break;
    case 'below': {
      place.x = R0.cx; place.y = R0.y1 + gap + b.h / 2;
      if (place.y + b.h / 2 > H - 4) { // no room underneath: stand in front, at the foot of it
        place.y = Math.min(H - 6 - b.h / 2, R0.y1 + 26 - b.h / 2 + b.h * 0.15);
      }
      break;
    }
    case 'front': place.x = R0.cx + R0.w * 0.12; place.y = Math.min(H - 6 - b.h / 2, R0.y1 + 22 - b.h / 2); break;
    case 'behind': place.x = R0.cx + R0.w * 0.28; place.y = R0.y1 - b.h / 2 - 6; break;
    case 'in': place.x = R0.cx; place.y = R0.cy; break;
    case 'around': {   // a place goes round the thing (as big as needed), a thing stands next to it
      if (KINDS[kindKey(o)]?.region) { place.x = R0.cx; place.y = R0.cy; o.size = Math.round(Math.min(W * 0.9, Math.max(o.size, R0.w * 1.8, (R0.h * 1.4) / (KINDS[kindKey(o)].aspect || 1)))); }
      else { place.x = sideX(R0.cx < W / 2 ? 1 : -1, R0); place.y = alignY(R0); }
      break;
    }
    case 'between': {
      const R1 = bbox(refs[1] ?? refs[0]);
      place.x = (R0.cx + R1.cx) / 2; place.y = ground ? Math.max(R0.y1, R1.y1) - b.h / 2 : (R0.cy + R1.cy) / 2; break;
    }
    default: break;
  }
  o.x = place.x; o.y = place.y;
  clampIn(o);
  const z = s.objects.reduce((m, x) => Math.max(m, x.z), -Infinity);
  if (rel === 'behind' || (rel === 'around' && KINDS[kindKey(o)]?.region)) o.z = refs[0].z - 1;
  else if (!KINDS[kindKey(o)]?.region && ['below', 'front', 'on', 'in', 'above', 'next', 'leftof', 'rightof', 'between', 'around'].includes(rel)) o.z = Math.max(o.z, refs[0].z + 1, Number.isFinite(z) ? o.z : 0);
}

// ---- making objects -------------------------------------------------------------------------------------------------------
export const Z_LAYER = { mountain: -3000, rainbow: -2000, sun: -1000, moon: -1000, cloud: -900 };
export function makeObject(s, kind, { color = null, factor = 1, fill = null, tag = null } = {}) {
  const k = KINDS[kind];
  const o = {
    id: `o${s.nextId++}`, kind: kind.startsWith(COMPOSITE) ? 'composite' : kind, ...(kind.startsWith(COMPOSITE) ? { thing: thingOfKey(kind) } : {}), x: W / 2, y: H / 2, size: Math.round(k.size * factor), color: color ? canonColor(color) : null,
    fill: fill ?? k.fill ?? 'crayon', rotation: 0, flip: false, z: (Z_LAYER[kind] ?? (k.region ? -2500 : 0)) + s.nextId, parts: {},
  };
  if (tag) o.tag = tag;
  if (k.custom) o.shape = k.shape;   // a piece or a group drawn again keeps its parts with it
  return o;
}

const VARY_SIZES = [1, 1.3, 0.78, 1.55, 0.62, 1.15];
/**
 * `count` things of a kind, placed: next to `refs` by `place.rel`, in `place.region`, spread along the band their kind stands in, or each on a free spot.
 * spec: { kind, count, color, factor, parts, place, refs, vary: { colors, fixed } (each one its own size and, unless `fixed`, its own colour of `colors`), make (default true: the water
 * a thing of the water needs may be made), decorate(o) (the caller's own touches on each thing before it is placed), placed(group, rel, refs) (told after a placing by relation) }.
 */
export function addThing(s, spec) {
  const made = [];
  const kind = spec.kind;
  const count = spec.count;
  const group = [];
  for (let i = 0; i < count; i++) {
    const factor = i === 0 ? spec.factor : spec.factor * (0.88 + rnd(s) * 0.28);
    const o = makeObject(s, kind, { color: spec.color, factor: factor * (spec.factorOf ?? 1) });
    spec.decorate?.(o);
    Object.assign(o.parts, spec.parts ?? {});
    group.push(o);
  }
  if (spec.vary && group.length > 1) {   // each one differs: its own colour (not for things that have one colour by nature, nor one the user named) and its own size
    const shuffle = (xs) => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd(s) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const sizes = shuffle(VARY_SIZES), colors = shuffle(spec.vary.colors ?? []);
    group.forEach((o, i) => {
      o.size = Math.round(KINDS[kind].size * spec.factor * sizes[i % sizes.length]);
      if (!spec.vary.fixed && colors.length) o.color = canonColor(colors[i % colors.length]);
    });
  }
  // several things at once: even spread, drawn left to right
  const place = spec.place ?? {};
  if (place.rel && spec.refs?.length) {
    group.forEach((o, i) => {
      placeRelative(s, o, place.rel, spec.refs);
      if (i > 0) { const prev = group[i - 1], pb = bbox(prev), ob = bbox(o); o.x = prev.x + pb.w / 2 + ob.w / 2 + 14; o.y = prev.y + (ob.h - pb.h) / 2 * 0; clampIn(o); }
      s.objects.push(o);
    });
    spec.placed?.(group, place.rel, spec.refs);
  } else if (place.region) {
    group.forEach((o, i) => {
      placeRegion(s, o, place.region);
      if (i > 0) { const prev = group[i - 1], pb = bbox(prev), ob = bbox(o); o.x = prev.x + (pb.w + ob.w) / 2 + 16; clampIn(o); if (o.x - ob.w / 2 < prev.x + pb.w / 2) o.y += ob.h * 0.35; clampIn(o); }
      s.objects.push(o);
    });
  } else if (group.length > 1 && anchorOf(kind) !== 'any') {
    const anchor = anchorOf(kind) === 'water' ? 'ground' : anchorOf(kind);
    const n = group.length, lo = 90, hi = W - 90;
    const rows = anchor === 'sky' && n > 5 ? 2 : 1;
    group.forEach((o, i) => {
      const row = rows === 2 ? i % 2 : 0, col = rows === 2 ? Math.floor(i / 2) : i;
      const perRow = rows === 2 ? Math.ceil(n / 2) : n;
      const b = bbox(o);
      o.x = lo + ((col + 0.5 + (row ? 0.25 : 0)) / (perRow + (rows === 2 ? 0.25 : 0))) * (hi - lo);
      if (anchor === 'ground') o.y = GROUND_BASE + (i % 2 ? 26 : 0) + Math.round(rnd(s) * 24) - b.h / 2;
      else if (anchor === 'horizon') o.y = HORIZON + 28 - b.h / 2;
      else o.y = 90 + row * 120 + Math.round(rnd(s) * 70) + (n > 5 ? 0 : 20) + b.h / 2 * 0.2;
      clampIn(o); s.objects.push(o);
    });
  } else if (group.length > 1) {
    const n = group.length;
    group.forEach((o, i) => {
      o.x = 120 + ((i + 0.5) / n) * (W - 240); o.y = 150 + (i % 3) * 140 + Math.round(rnd(s) * 60);
      clampIn(o); s.objects.push(o);
    });
  } else {
    for (const o of group) { defaultSpot(s, o, spec.make !== false); s.objects.push(o); }
  }
  // drawing order: left to right gets the older ids, so "the first tree" is the left one
  if (group.length > 1) {
    const ids = group.map((o) => o.id), zs = group.map((o) => o.z);
    const sorted = group.slice().sort((a, b) => a.x - b.x);
    sorted.forEach((o, i) => { o.id = ids[i]; o.z = zs[i]; });
    s.objects.sort((a, b) => idNum(a) - idNum(b));
  }
  made.push(...group);
  return made;
}

/**
 * TOOL PRIMITIVES OF THE BOARD (spec 28 section 12; reviewer 2026-11-15 20:45): typed operations on its state, bound by the std.tool wires of request.sop and run by the library's
 * runPlan. Named arguments only; no request, no words, no defaults, no reply. Values come in as the tool takes them (the library translated them by knowledge before the call; the
 * tool's own names by request.sop std.tool.value rows):
 *   kind    a kind of the board (scene.mjs KINDS)              n       how many            size   small | default | big (a grade the param accepts)
 *   colour  a colour of the catalog                             place   a region id of the canvas (scene.mjs REGIONS, `_` for a space; corner), a band of the ground
 *                                                                        (sea, grass, sand, snow; ground), or a direction (up, down)
 *   anchor  the id of a thing to stand by                       relation  how to stand by it (next, in, on, above, below, front, behind, leftof, rightof, around; default next)
 *   ids     the ids of the things acted on (a scene's id stands for its things)
 *   whole   the id of a scene made by startScene: the things made in it stand together (next to its first thing, else in its region)
 * A call is all or nothing; the calls of one session step are one entry of the board's history (`step`, `label`: given by the host). Result: { status, changed } or { status: 'missing', code }
 * (the host passes a refusal to the library as { ok: false, code }). Nothing is made that the plan did not ask for (a fish with no water stands on the ground: the plan makes the water).
 * `toolView` is the board's state as facts for the library's view (id, kind, colour, size grade, region); `thingAt` is the declared custom search (std.tool.custom).
 */
const STEP = 70;
const plainId = (id) => String(id).replace(/^\$/, '');   // glue-lint: tool-data (thing id)
const sceneOf = (s, id) => (id == null ? null : (s.scenes ?? []).find((sc) => sc.id === plainId(id)) ?? null);
/** The things of ids: a thing by its id, a scene by the things in it. */
const objsOf = (s, ids) => [...new Set([].concat(ids ?? []).flatMap((id) => { const sc = sceneOf(s, id); return sc ? sc.members : [plainId(id)]; }))].map((id) => byId(s, id)).filter(Boolean);
/** The board's kind of a kind name: a built-in kind, else a thing of the catalog the board draws. */
const boardKind = (kind) => (kind == null ? null : Object.hasOwn(KINDS, kind) && KINDS[kind] ? String(kind) : isThing(String(kind)) ? COMPOSITE + kind : null);
/** A scene with none of its things left is gone (kept as gone, so that taking it away again, as an undo does after its things, is no refusal). */
const dropEmptyScenes = (s) => { for (const sc of s.scenes ?? []) { sc.members = sc.members.filter((id) => byId(s, id)); if (!sc.members.length && !sc.fresh) sc.gone = true; } };
const liveScenes = (s) => (s.scenes ?? []).filter((sc) => !sc.gone && (sc.fresh || sc.members.some((id) => byId(s, id))));
const toolDone = (extra = {}) => ({ status: 'supported', value: '', ...extra });
const toolNo = (code) => ({ status: 'missing', value: '', code });
/**
 * One call of a primitive: all or nothing, and a step of the board's own history; the calls of one step of the session (`step`: its id, given by the host) are one history entry,
 * labelled with `label` (the person's words), so that one plan of several calls is one undo.
 */
function toolStep(ctx, { step = null, label = null } = {}, fn) {
  const s = ensure(ctx);
  const base = step && s.stepGroup?.id === step && s.stepGroup.base <= s.history.length ? s.stepGroup.base : s.history.length;
  if (step) s.stepGroup = { id: step, base };
  const r = oneStep(ctx, label ?? '', () => { remember(s, label ?? ''); return fn(s); });
  if (r?.status === 'supported' && s.history.length > base + 1) { s.history.splice(base + 1); s.history[base].label = label ?? ''; s.prev = s.history.at(-1) ?? null; }
  return r;
}
const DIRECTION = { up: [0, -1], down: [0, 1] };
/** The board's grades (the size param accepts small, default, big) as factors of a kind's own size. */
const GRADE = { small: 0.65, default: 1, big: 1.5 };
const regionId = (place) => (place == null ? null : Object.hasOwn(REGIONS, String(place).replace(/_/g, ' ')) ? String(place).replace(/_/g, ' ') : null);   // the place values in the tool's own names (request.sop std.tool.value: corner -> bottom_left)   // glue-lint: tool-data (region id)
const bandOf = (place) => (place != null && Object.hasOwn(GROUND_COLOR, place) ? place : place === 'ground' ? 'ground' : null);
const gradeFactor = (size) => (size ? GRADE[size] ?? null : 1);
/** A scene: a whole the things made in it belong to (they stand together; an act on the scene is an act on its things). */
export function startScene(ctx, { kind, place = null, step = null, label = null } = {}) {
  const s = ensure(ctx);
  if (kind == null) return toolNo('no_kind');
  return toolStep(ctx, { step, label }, () => {
    s.sceneSeq = (s.sceneSeq ?? 0) + 1;
    s.scenes = [...(s.scenes ?? []).filter((sc) => !sc.gone).map((sc) => ({ ...sc, fresh: false })), { id: `scene${s.sceneSeq}`, kind: String(kind), region: regionId(place), members: [], fresh: true }];
    open(ctx);
    return toolDone({ changed: [`scene${s.sceneSeq}`] });
  });
}
export function addThings(ctx, { kind, n = 1, size = null, colour = null, place = null, anchor = null, whole = null, step = null, label = null } = {}) {
  const s = ensure(ctx), key = boardKind(kind), scene = sceneOf(s, whole);
  if (!key) return toolNo('no_kind');
  const factor = gradeFactor(size), color = colour ? colorFrom([String(colour).toLowerCase()]) : null;
  if (!factor || (colour && !color)) return toolNo('no_value');
  const to = objsOf(s, anchor)[0] ?? (scene ? objsOf(s, scene.members)[0] : null) ?? null, region = to ? null : regionId(place) ?? scene?.region ?? (bandOf(place) === 'ground' ? 'ground' : null);
  return toolStep(ctx, { step, label }, () => {
    const made = addThing(s, { kind: key, count: Math.max(1, Math.min(12, Number(n) || 1)), color, factor, parts: {}, place: to ? { rel: 'next' } : region ? { region } : {}, refs: to ? [to] : [], make: false });
    s.last = made.map((o) => o.id);
    if (scene) { scene.members.push(...s.last); scene.fresh = false; }
    open(ctx);
    return toolDone({ changed: s.last });
  });
}
export function removeThings(ctx, { ids, step = null, label = null } = {}) {
  const s = ensure(ctx), objs = objsOf(s, ids), scenes = [].concat(ids ?? []).map((id) => sceneOf(s, id)).filter(Boolean);
  if (!objs.length && !scenes.length) return toolNo('no_things');
  return toolStep(ctx, { step, label }, () => {
    const gone = new Set(objs.map((o) => o.id));
    s.objects = s.objects.filter((o) => !gone.has(o.id));
    s.last = []; if (s.selected && gone.has(s.selected)) s.selected = null;
    for (const sc of scenes) sc.gone = true;
    dropEmptyScenes(s);
    open(ctx);
    return toolDone({ changed: [...gone] });
  });
}
export function moveThings(ctx, { ids, place = null, anchor = null, relation = null, step = null, label = null } = {}) {
  const s = ensure(ctx), objs = objsOf(s, ids);
  if (!objs.length) return toolNo('no_things');
  const to = objsOf(s, anchor).find((o) => !objs.includes(o)) ?? null;
  const dir = to ? null : DIRECTION[place] ?? null;
  const band = to || dir ? null : bandOf(place);
  const area = to || dir || band ? null : regionId(place);
  if (!dir && !to && !band && !area) return toolNo('no_place');
  return toolStep(ctx, { step, label }, () => {
    if (band && band !== 'ground' && s.ground !== band) { s.ground = band; s.groundColor = GROUND_COLOR[band]; }   // a band of the ground (water: the sea band), made when there is none
    for (const o of objs) {
      budget.tick('draw.tool');
      if (dir) { o.x += dir[0] * STEP; o.y += dir[1] * STEP; clampIn(o); }
      else if (to) placeRelative(s, o, relation ?? 'next', [to]);
      else placeRegion(s, o, band ? 'ground' : area);
    }
    s.last = objs.map((o) => o.id);
    open(ctx);
    return toolDone({ changed: s.last });
  });
}
export function setThings(ctx, { ids, colour = null, size = null, step = null, label = null } = {}) {
  const s = ensure(ctx), objs = objsOf(s, ids);
  if (!objs.length) return toolNo('no_things');
  const color = colour ? colorFrom([String(colour).toLowerCase()]) : null, factor = size ? gradeFactor(size) : null;
  if ((colour && !color) || (size && !factor) || (!color && !factor)) return toolNo('no_value');
  return toolStep(ctx, { step, label }, () => {
    for (const o of objs) {
      budget.tick('draw.tool');
      if (color) o.color = color;
      if (factor) { o.size = Math.round((KINDS[kindKey(o)]?.size ?? o.size) * factor); if (onGround(kindKey(o))) clampIn(o); }
    }
    s.last = objs.map((o) => o.id);
    open(ctx);
    return toolDone({ changed: s.last });
  });
}
/** The sky of the board, a band behind everything (the view has it as the thing `sky` when it is there). */
export function paintSky(ctx, { colour, step = null, label = null } = {}) {
  const s = ensure(ctx), c = colorFrom([String(colour ?? '').toLowerCase()]);
  if (!c) return toolNo('no_value');
  return toolStep(ctx, { step, label }, () => { s.sky = c; s.mood = null; open(ctx); return toolDone({ changed: ['sky'] }); });
}
/** A new page (request.sop psys2.op act=make of=page): the old picture stays one undo away. Said by the reply fact `done.page` (`done.page.kept` when there was a picture). */
export function newPage(ctx) {
  const s = ensure(ctx), had = !!(s.objects.length || s.sky || s.ground);
  remember(s, 'started a new drawing');
  s.objects = []; s.sky = null; s.ground = null; s.groundColor = null; s.mood = null; s.background = 'white'; s.selected = null; s.last = []; s.sunStash = []; s.scenes = [];
  open(ctx);
  return { status: 'supported', value: '', reply: had ? 'done.page.kept' : 'done.page' };
}
/** The board's own undo / redo (the tab's history), said by the reply facts done.undo / nothing.undo (done.redo / nothing.redo); `done.undo.did` with the step's label (what it did). */
export function undoStep(ctx) {
  const s = ensure(ctx);
  if (!s.history.length) return { status: 'missing', value: '', reply: 'nothing.undo' };
  const snap = s.history.pop();
  s.future.push(snapshot(s, snap.label));
  restore(s, snap);
  s.prev = s.history.at(-1) ?? null;   // the picture before the newest step that is still done
  open(ctx);
  return { status: 'supported', value: '', reply: snap.label ? 'done.undo.did' : 'done.undo', roles: snap.label ? { did: snap.label } : {} };
}
export function redoStep(ctx) {
  const s = ensure(ctx);
  if (!s.future.length) return { status: 'missing', value: '', reply: 'nothing.redo' };
  const snap = s.future.pop();
  s.history.push(snapshot(s, snap.label));
  restore(s, snap);
  s.prev = s.history.at(-1);
  open(ctx);
  return { status: 'supported', value: '', reply: snap.label ? 'done.redo.did' : 'done.redo', roles: snap.label ? { did: snap.label } : {} };
}
/** The board's state as facts (the library's view): one record per thing a person can point at, and the sky when there is one. */
export function toolView(ctx) {
  const s = ensure(ctx);
  const inScene = new Map((s.scenes ?? []).flatMap((sc) => sc.members.map((m) => [m, sc.id])));
  return [...(s.sky ? [{ id: 'sky', kind: 'sky', colour: s.sky }] : []), ...s.objects.filter((o) => !o.tag).map((o) => ({ id: o.id, kind: kindName(kindKey(o)), ...(inScene.has(o.id) ? { in: inScene.get(o.id) } : {}), colour: effectiveColor(o) ?? null, ...(sizeWord(o) ? { size: sizeWord(o) } : {}), place: corner(regionOf(o.x, o.y)) })), ...liveScenes(s).map((sc) => ({ id: sc.id, kind: sc.kind }))];   // a scene after its things: taken back, its things go first
}
const corner = (region) => (['top left', 'top right', 'bottom left', 'bottom right'].includes(region) ? 'corner' : region);
/** Declared custom search (request.sop std.tool.custom thingAt): the newest thing of the view whose kind is the place named, else nothing. */
export function thingAt({ place } = {}, view = []) {
  const hit = (view ?? []).filter((t) => t && place != null && t.kind === place);
  return hit.length ? hit.at(-1).id : null;
}
