// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The knowledge world `k.layouts` (SPACE-2, worker-tasks 17:40: "layouts are knowledge, not code"): named arrangements with slots, found by lookup like any fact.
 * Browser-safe: no `node:*`. Read through the catalog's source (`{ text(path) -> Promise<string|null> }`) exactly like `k.faces`, because the generic knowledge reader is not
 * on main yet; when it is, only `load` changes.
 *
 * Format (proposal, one wire per layout in `k.layouts/shards/layouts.sop`):
 *   @layout.row k.layouts.layout
 *       name=row synonym=line synonym="in a line" generator=row sort=reading when="things of one kind that belong together"
 *   @layout.family-photo k.layouts.layout          (no code at all: slots are fractions of the frame, filled in the order of `sort`)
 *       name="family photo" synonym="group photo" sort=height slot="0.2 0.6" slot="0.4 0.6" slot="0.6 0.6" slot="0.8 0.6" rel="slot1 left_of slot2"
 *
 * `generator` names a built-in arrangement of solver.mjs; slots are data. The local table `FALLBACK` is used only when the catalog has no layouts or no network.
 */
import { parseLine } from './catalog.mjs';

export const LAYOUTS_PATH = 'k.layouts/shards/layouts.sop';
export const GENERATORS = ['row', 'column', 'grid', 'ring', 'corners', 'stack', 'flow', 'tree', 'landscape', 'scatter', 'face', 'height'];

/** The built-in fallback (the same shape as a parsed catalog layout). */
export const FALLBACK = [
  { id: 'row', name: 'row', synonyms: ['line', 'in a row', 'in a line', 'side by side'], generator: 'row', sort: 'reading', slots: [], rels: [] },
  { id: 'column', name: 'column', synonyms: ['in a column', 'one under the other'], generator: 'column', sort: 'reading', slots: [], rels: [] },
  { id: 'grid', name: 'grid', synonyms: ['in a grid', 'rows and columns'], generator: 'grid', sort: 'reading', slots: [], rels: [] },
  { id: 'ring', name: 'ring', synonyms: ['circle', 'in a circle', 'in a ring'], generator: 'ring', sort: 'reading', slots: [], rels: [] },
  { id: 'corners', name: 'corners', synonyms: ['in the corners', 'different corners', 'each in a different corner'], generator: 'corners', sort: 'reading', slots: [], rels: [] },
  { id: 'landscape', name: 'landscape', synonyms: ['a landscape', 'sky above ground'], generator: 'landscape', sort: 'none', slots: [], rels: [] },
  { id: 'stack', name: 'stack', synonyms: ['pile', 'on top of each other'], generator: 'stack', sort: 'none', slots: [], rels: [] },
  { id: 'flow', name: 'flow', synonyms: ['left to right', 'flow left to right'], generator: 'flow', sort: 'none', slots: [], rels: [] },
  { id: 'tree', name: 'tree', synonyms: ['as a tree', 'hierarchy'], generator: 'tree', sort: 'none', slots: [], rels: [] },
  { id: 'height', name: 'by height', synonyms: ['by size', 'from the tallest to the shortest'], generator: 'height', sort: 'height', slots: [], rels: [] },
];

/** One layout wire -> { id, name, synonyms, generator, sort, slots: [[fx, fy]], rels: [[slotA, rel, slotB]], when } or null. */
export function parseLayoutWire(line) {
  const w = line.startsWith('@') ? parseLine(line) : null;
  if (!w || w.type !== 'k.layouts.layout') return null;
  const a = w.attrs, one = (k) => a[k]?.[0];
  const slots = (a.slot ?? []).map((s) => s.trim().split(/\s+/).map(Number)).filter((s) => s.length >= 2 && s.every(Number.isFinite)).map(([x, y]) => [Math.min(1, Math.max(0, x)), Math.min(1, Math.max(0, y))]);
  const rels = (a.rel ?? []).map((r) => r.trim().split(/\s+/)).filter((r) => r.length === 3);
  const gen = one('generator');
  if (!one('name') || (!slots.length && !GENERATORS.includes(gen))) return null;
  return { id: w.id.replace(/^layout\./, ''), name: one('name'), synonyms: a.synonym ?? [], generator: GENERATORS.includes(gen) ? gen : null, sort: one('sort') ?? 'reading', slots, rels, when: one('when') ?? '' };
}
/** The text of a k.layouts shard -> layouts (lines that are not layout wires, and wires with neither slots nor a known generator, are skipped). */
export function parseLayouts(text) {
  const out = [];
  let buf = null;
  const flush = () => { if (buf) { const l = parseLayoutWire(buf); if (l) out.push(l); } buf = null; };
  for (const line of String(text ?? '').split('\n')) {
    if (line.startsWith('@')) { flush(); buf = line; } else if (buf && /^\s+\S/.test(line)) buf += ` ${line.trim()}`; else if (!line.trim()) flush();
  }
  flush();
  return out;
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
export function createLayouts({ source = null, path = LAYOUTS_PATH, text = null } = {}) {
  let loaded = null, list = FALLBACK, from = 'fallback';
  const api = {
    get layouts() { return list; },
    get from() { return from; },
    /** Reads the catalog's layouts (or the given `text`); the fallback stays when there are none. Never throws. */
    async load() {
      loaded ??= (async () => {
        try {
          const t = text ?? (source ? await source.text(path) : null);
          const l = t ? parseLayouts(t) : [];
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
