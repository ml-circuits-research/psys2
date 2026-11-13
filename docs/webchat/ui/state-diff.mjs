// SPDX-License-Identifier: AGPL-3.0-only
// ONE generic difference of world state before and after a turn, in words (spec 06 "Phrase log", LOG WHAT HAPPENED). No code per world: it only looks at the
// shape of the JSON (scalars, small objects, lists of things). Browser-safe, no imports, no `node:*`.
//
//   const before = snapshotState(session.state());     // { worldId: JSON text }  (cheap: one stringify per world)
//   ...turn...
//   describeChanges(before, snapshotState(session.state()))  ->  [{ world, changes: ['centre 15.4, 30.2 (was 25, 10)', 'zoom 5 (was 2)', ...] }]

const MAX_WORLD_BYTES = 400000;   // a world state larger than this is compared by its hash only ("changed")
const MAX_CHANGES = 8;            // per world
const NOISE = /^(nextId|seq|rev|version|history|future|undo|redo|t|time|ts|at|updated|bounds|viewport|size|pending|clicked)$/i;   // bookkeeping, not "what changed"
const NAME_KEYS = ['name', 'label', 'title', 'text', 'kind', 'type', 'id'];

/** { worldId: JSON text } of a session state object. A value that cannot be serialized is skipped. */
export function snapshotState(state) {
  const out = {};
  for (const [id, st] of Object.entries(state ?? {})) {
    try { const s = JSON.stringify(st); if (s !== undefined) out[id] = s; } catch { /* skip */ }
  }
  return out;
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const num = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
const plural = (w, n) => (n === 1 ? w : /(?:s|x|ch|sh)$/.test(w) ? `${w}es` : /[^aeiou]y$/.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`);
const words = (k) => String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
const short = (v) => {
  if (v == null) return 'none';
  if (typeof v === 'number') return num(v);
  if (typeof v === 'string') return v.length > 40 ? `${v.slice(0, 40)}…` : v;
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? '' : 's'}`;
  if (isObj(v)) {
    const named = NAME_KEYS.map((k) => v[k]).find((x) => typeof x === 'string' && x);
    if (named) return named;
    const ks = Object.keys(v).filter((k) => typeof v[k] === 'number');
    if (ks.length && ks.length === Object.keys(v).length) return ks.map((k) => num(v[k])).join(', ');
    return '{…}';
  }
  return String(v);
};
const nameOf = (item) => (isObj(item) ? NAME_KEYS.map((k) => item[k]).find((x) => typeof x === 'string' && x) ?? null : typeof item === 'string' ? item : null);
const kindOf = (item) => (isObj(item) ? [item.kind, item.type, item.name, item.label].find((x) => typeof x === 'string' && x) ?? 'item' : 'item');
const keyOf = (item, i) => (isObj(item) ? item.id ?? item.uid ?? item.key ?? null : null) ?? (typeof item === 'string' || typeof item === 'number' ? `v:${item}` : `i:${i}:${JSON.stringify(item).slice(0, 80)}`);

/** Differences of two lists of things, by id when the items have one, else by value: "+2 elephants", "-1 tree", "1 changed". */
function diffList(label, a, b, out) {
  const ka = a.map(keyOf), kb = b.map(keyOf);
  const sa = new Set(ka), sb = new Set(kb);
  const added = b.filter((_, i) => !sa.has(kb[i])), removed = a.filter((_, i) => !sb.has(ka[i]));
  const changed = b.filter((x, i) => sa.has(kb[i]) && JSON.stringify(x) !== JSON.stringify(a[ka.indexOf(kb[i])]));
  const group = (items) => { const m = new Map(); for (const it of items) { const k = kindOf(it); m.set(k, (m.get(k) ?? 0) + 1); } return [...m]; };
  for (const [k, n] of group(added)) out.push(`${label}: +${n} ${n === 1 ? k : plural(k, n)}`);
  for (const [k, n] of group(removed)) out.push(`${label}: -${n} ${n === 1 ? k : plural(k, n)}`);
  if (changed.length) out.push(`${label}: ${changed.map(nameOf).filter(Boolean).slice(0, 3).join(', ') || `${changed.length} changed`}${changed.length && !changed.every((c) => nameOf(c)) ? '' : ' changed'}`);
  if (!added.length && !removed.length && !changed.length && ka.join() !== kb.join()) out.push(`${label}: reordered`);
}

function walk(path, a, b, out, depth = 0) {
  if (out.length >= MAX_CHANGES * 3) return;
  const label = path.map(words).join(' ');
  if (Array.isArray(a) || Array.isArray(b)) {
    if (Array.isArray(a) && Array.isArray(b)) diffList(label || 'items', a, b, out);
    else out.push(`${label}: ${short(b)}`);
    return;
  }
  if (isObj(a) && isObj(b)) {
    // a small record of numbers (centre {lat, lon}) or names is shown as one value
    const flat = (o) => Object.values(o).every((x) => typeof x !== 'object' || x === null);
    if (depth > 0 && flat(a) && flat(b) && Object.keys(b).length <= 4 && Object.keys(a).join() === Object.keys(b).join()) { if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${label} ${short(b)} (was ${short(a)})`); return; }
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (NOISE.test(k) || depth > 4) continue;
      if (JSON.stringify(a[k]) === JSON.stringify(b[k])) continue;
      walk([...path, k], a[k], b[k], out, depth + 1);
    }
    return;
  }
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  if (a == null && b != null && typeof b !== 'object') out.push(`${label} ${short(b)}`);
  else if (b == null) out.push(`${label} removed${a != null ? ` (was ${short(a)})` : ''}`);
  else if (typeof b === 'boolean') out.push(`${label} ${b ? 'on' : 'off'}`);
  else out.push(`${label} ${short(b)} (was ${short(a)})`);
}

/** The changes per world between two snapshots: [{ world, changes: [words] }], only worlds that changed. */
export function describeChanges(before, after) {
  const res = [];
  for (const id of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
    const a = before?.[id], b = after?.[id];
    if (a === b) continue;
    const out = [];
    if ((a?.length ?? 0) > MAX_WORLD_BYTES || (b?.length ?? 0) > MAX_WORLD_BYTES) out.push('changed (large state)');
    else {
      try { walk([], a == null ? undefined : JSON.parse(a), b == null ? undefined : JSON.parse(b), out); } catch { out.push('changed'); }
    }
    if (out.length) res.push({ world: id, changes: out.slice(0, MAX_CHANGES) });
  }
  return res;
}

/** The same, as one plain sentence list: "geo.map: centre 15.44, 30.22 (was 25, 10); zoom 5 (was 2) | art.draw: +2 elephants". */
export const changesText = (changes) => (changes ?? []).map((c) => `${c.world}: ${c.changes.join('; ')}`).join(' | ');
