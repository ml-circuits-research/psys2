// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The knowledge world `k.layouts` (SPACE-2): named arrangements with places, found by lookup like any fact. Browser-safe: no `node:*`. Read through the catalog's source
 * (`{ text(path) -> Promise<string|null> }`) exactly like `k.faces`.
 *
 * Format: the published one (sop-knowledge-worlds, docs/worlds/k.layouts/schema.sop), one wire per line in `k.layouts/shards/layouts.sop`:
 *   k.layouts.layout   name= kind=repeating|fixed about= ordered= usual_for=(many)
 *   k.layouts.slot     layout= name= count=one|many pair= optional= holds=(many) arranged= x= y= w= h=      (the box in a 0-100 frame)
 *   k.layouts.relation layout= a= rel= b= among=neighbours|all
 *   core.word          text=(many) means=<layout name> of=k.layouts.layout.name                              (the other names of an arrangement)
 * (`k.layouts.anchor` and `k.layouts.joins` are read by `parseAnchors` / `parseJoins`: they are about objects, not arrangements.)
 *
 * A layout whose name is a built-in generator of solver.mjs (row, column, grid, ring, corners, stack, flow, tree, landscape, scatter, face) is computed by it; any other
 * layout that has slot boxes is solved from its places (`places`), no code. The local table `FALLBACK` is used only when the catalog has no layouts or no network.
 */
import { parseLine } from './catalog.mjs?v=698662f5e5';
import { createFacts } from './facts.mjs?v=15eb94a409';

export const GENERATORS = ['row', 'column', 'grid', 'ring', 'corners', 'stack', 'flow', 'tree', 'landscape', 'scatter', 'face', 'height'];

/** The built-in fallback (the same shape as a parsed catalog layout). */
export const FALLBACK = [
  { id: 'row', name: 'row', synonyms: ['line', 'in a row', 'in a line', 'side by side'], generator: 'row', sort: 'reading', slots: [], places: [], rels: [] },
  { id: 'column', name: 'column', synonyms: ['in a column', 'one under the other'], generator: 'column', sort: 'reading', slots: [], places: [], rels: [] },
  { id: 'grid', name: 'grid', synonyms: ['in a grid', 'rows and columns'], generator: 'grid', sort: 'reading', slots: [], places: [], rels: [] },
  { id: 'ring', name: 'ring', synonyms: ['circle', 'in a circle', 'in a ring'], generator: 'ring', sort: 'reading', slots: [], places: [], rels: [] },
  { id: 'corners', name: 'corners', synonyms: ['in the corners', 'different corners', 'each in a different corner'], generator: 'corners', sort: 'reading', slots: [], places: [], rels: [] },
  { id: 'landscape', name: 'landscape', synonyms: ['a landscape', 'sky above ground'], generator: 'landscape', sort: 'none', slots: [], places: [], rels: [] },
  { id: 'stack', name: 'stack', synonyms: ['pile', 'on top of each other'], generator: 'stack', sort: 'none', slots: [], places: [], rels: [] },
  { id: 'flow', name: 'flow', synonyms: ['left to right', 'flow left to right'], generator: 'flow', sort: 'none', slots: [], places: [], rels: [] },
  { id: 'tree', name: 'tree', synonyms: ['as a tree', 'hierarchy'], generator: 'tree', sort: 'none', slots: [], places: [], rels: [] },
  { id: 'height', name: 'by height', synonyms: ['by size', 'from the tallest to the shortest'], generator: 'height', sort: 'height', slots: [], places: [], rels: [] },
];

const bool = (v) => v === 'true';
const clamp = (n) => Math.min(100, Math.max(0, n));
const idOf = (name) => String(name).trim().toLowerCase().replace(/\s+/g, '_');
function placeOf(a) {
  const one = (k) => a[k]?.[0];
  const box = ['x', 'y', 'w', 'h'].map((k) => Number(a[k]?.[0]));
  const hasBox = a.x && a.y && a.w && a.h && box.every(Number.isFinite);
  return {
    name: one('name'), count: one('count') === 'many' ? 'many' : 'one', pair: bool(one('pair')), optional: bool(one('optional')), holds: a.holds ?? [], arranged: one('arranged') ?? null,
    box: hasBox ? { x: clamp(box[0]), y: clamp(box[1]), w: clamp(box[2]), h: clamp(box[3]) } : null,
  };
}
/**
 * The text of a k.layouts shard -> layouts: { id, name, kind, about, ordered, usualFor, synonyms, generator, sort, places, slots: [[fx, fy]] (centres of the boxes, 0..1),
 * rels: [{ a, rel, b, among }], when }. A layout with neither a generator nor a slot box is skipped.
 */
export const parseLayouts = (text) => layoutsOf(wiresOfText(text));
/** `[{ type, attrs }]` of the wires of a text (a fixture or a test): the same shape the catalog reading gives. */
function wiresOfText(text) {
  const out = [];
  for (const line of String(text ?? '').split('\n')) { const w = line.startsWith('@') ? parseLine(line) : null; if (w) out.push(w); }
  return out;
}
/** The layouts of wires `[{ type, attrs }]` (from a text or from `facts.wires`). */
export function layoutsOf(wires) {
  const by = new Map(), words = new Map();
  const get = (name) => { const id = idOf(name); if (!by.has(id)) by.set(id, { id, name: null, places: [], rels: [] }); return by.get(id); };
  for (const w of wires) {
    const a = w.attrs, one = (k) => a[k]?.[0];
    if (w.type === 'k.layouts.layout' && one('name')) {
      Object.assign(get(one('name')), { name: one('name'), kind: one('kind') === 'fixed' ? 'fixed' : 'repeating', about: one('about') ?? '', ordered: bool(one('ordered')), usualFor: a.usual_for ?? [] });
    } else if (w.type === 'k.layouts.slot' && one('layout') && one('name')) get(one('layout')).places.push(placeOf(a));
    else if (w.type === 'k.layouts.relation' && one('layout') && one('a') && one('rel') && one('b')) get(one('layout')).rels.push({ a: one('a'), rel: one('rel'), b: one('b'), among: one('among') ?? null });
    else if (w.type === 'core.word' && one('of') === 'k.layouts.layout.name' && one('means')) words.set(idOf(one('means')), [...(words.get(idOf(one('means'))) ?? []), ...(a.text ?? [])]);
  }
  const out = [];
  for (const l of by.values()) {
    if (!l.name) continue;
    const generator = GENERATORS.includes(l.id) ? l.id : null, boxed = l.places.filter((p) => p.box);
    if (!generator && !boxed.length) continue;
    const tallFirst = l.rels.some((r) => r.rel === 'smaller_than');   // the small ones stand in front of the tall ones: the tall ones are placed first
    out.push({
      ...l, synonyms: words.get(l.id) ?? [], generator, sort: tallFirst ? 'height' : 'reading',
      slots: boxed.map((p) => [(p.box.x + p.box.w / 2) / 100, (p.box.y + p.box.h / 2) / 100]), when: l.usualFor?.[0] ?? '',
    });
  }
  return out;
}
/** The places on drawable things (k.layouts.anchor): [{ of, name, kind, box: {x, y, w, h}, part, holds, on }]. */
export const parseAnchors = (text) => anchorsOf(wiresOfText(text));
export function anchorsOf(wires) {
  const out = [];
  for (const w of wires) {
    if (w.type !== 'k.layouts.anchor' || !w.attrs.of || !w.attrs.name || !w.attrs.kind) continue;
    const a = w.attrs, box = ['x', 'y', 'w', 'h'].map((k) => Number(a[k]?.[0]));
    if (box.every(Number.isFinite)) out.push({ of: a.of[0], name: a.name[0], kind: a.kind[0], box: { x: box[0], y: box[1], w: box[2], h: box[3] }, part: a.part?.[0] ?? null, holds: a.holds ?? [], on: a.on ?? [] });
  }
  return out;
}
/** Which kind of thing joins which (k.layouts.joins): [{ a, rel, b, side }]. */
export const parseJoins = (text) => joinsOf(wiresOfText(text));
export function joinsOf(wires) {
  const out = [];
  for (const w of wires) {
    if (w?.type === 'k.layouts.joins' && w.attrs.a && w.attrs.rel && w.attrs.b) out.push({ a: w.attrs.a[0], rel: w.attrs.rel[0], b: w.attrs.b[0], side: w.attrs.side?.[0] ?? null });
  }
  return out;
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
/**
 * The layouts of the catalog, read through the generic reading path (`facts.wires`: the index says where the wires are; no shard path is written here). `facts` is the knowledge
 * of the session (or `source`, a catalog source, which is wrapped in `createFacts`); `text` is a given text (a fixture).
 */
export function createLayouts({ facts = null, source = null, text = null } = {}) {
  if (!facts && source) facts = createFacts({ source });
  let loaded = null, list = FALLBACK, from = 'fallback';
  const api = {
    get layouts() { return list; },
    get from() { return from; },
    /** Reads the catalog's layouts (or the given `text`); the fallback stays when there are none. Never throws. */
    async load() {
      loaded ??= (async () => {
        try {
          let l = [];
          if (text != null) l = parseLayouts(text);
          else if (facts) {
            const read = async (type, opt) => (await facts.wires(type, opt)).map((w) => ({ type: w.type, attrs: w.f }));
            const ws = [...await read('k.layouts.layout'), ...await read('k.layouts.slot'), ...await read('k.layouts.relation'), ...await read('core.word', { world: 'k.layouts' })];
            l = layoutsOf(ws);
          }
          if (l.length) { const ids = new Set(l.map((x) => x.id)); list = [...l, ...FALLBACK.filter((f) => !ids.has(f.id))]; from = 'catalog'; }
        } catch { /* no network: the fallback */ }
        return from;
      })();
      return loaded;
    },
    /** A layout by its name or synonym, or found in a sentence ("arrange them in a ring", "like a family photo"): the longest name or synonym contained in the text wins. */
    find(textIn) {
      const t = ` ${norm(textIn)} `;
      let best = null, len = 0;
      for (const l of list) for (const n of [l.name, ...l.synonyms]) { const x = norm(n); if (x.length > len && t.includes(` ${x} `)) { best = l; len = x.length; } }
      return best;
    },
  };
  return api;
}
