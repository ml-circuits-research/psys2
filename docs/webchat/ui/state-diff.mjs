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

/**
 * THE TURN BASELINE (reviewer 2026-11-15 03:15 item 5): the page's snapshot before the turn, plus the worlds the turn loaded (lazy loading) as they were when it started
 * (`loaded`: { worldId: state }, their initial state). A world loaded during the turn is not "changed (was none)": only what the turn did to it counts.
 */
export function turnBaseline(pageBefore, loaded) {
  const out = { ...(pageBefore ?? {}) };
  for (const [id, text] of Object.entries(snapshotState(loaded))) if (!(id in out)) out[id] = text;
  return out;
}

/** The "after" side of the turn: worlds that neither the baseline nor the turn's end had (`endIds`: loaded after the turn, by a background load) are left out. */
export function turnAfter(after, base, endIds) {
  if (!Array.isArray(endIds)) return after;
  const keep = new Set([...Object.keys(base ?? {}), ...endIds]);
  return Object.fromEntries(Object.entries(after ?? {}).filter(([id]) => keep.has(id)));
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

// ---- the compact SOP diff of the instance worlds (phrase log format 4, "happened") ----
const WIRE = /^@(\S+)\s+(\S+)(.*)$/;
const ATTR = /([^\s=]+)=("(?:[^"\\]|\\.)*"|\S+)/g;
/** One wire line as { type, attrs: [[key, value]] }; null for a line that is not a wire. */
function wireOf(line) {
  const m = WIRE.exec(line.trim());
  if (!m) return null;
  return { type: m[2], attrs: [...m[3].matchAll(ATTR)].map((x) => [x[1], x[2]]) };
}
/** The wire without its id and without attributes that only repeat its type (kind=<type>, world=<a dotted prefix of the type>). */
const compactWire = (w, attrs = w.attrs) => [w.type, ...attrs.filter(([k, v]) => !(v === w.type || w.type.startsWith(`${v}.`))).map(([k, v]) => `${k}=${v}`)].join(' ');
const sopOf = (text) => { if (text == null) return ''; try { const v = JSON.parse(text); return typeof v?.sop === 'string' ? v.sop : null; } catch { return null; } };
const wiresOf = (sop) => new Map(String(sop).split('\n').map((l) => [WIRE.exec(l.trim())?.[1], l]).filter(([id]) => id));

/**
 * What a turn changed in the instance worlds, as SOP lines (one generic diff of each world's `sop` text, wire by wire, no code per world):
 * `+ <wire>` added, `- <wire>` removed, `~ <wire after> (was k=old …)` changed. A world without SOP text is described in words (`~ <world>: …`).
 * `before`/`after` are snapshots ({ worldId: JSON text }); lines are prefixed with the world when the turn changed more than one world.
 */
export function sopChanges(before, after, { max = 60 } = {}) {
  const perWorld = [];
  for (const world of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
    const a = before?.[world], b = after?.[world];
    if (a === b) continue;
    const sa = sopOf(a), sb = sopOf(b), lines = [];
    if (sa === null && sb === null || (a?.length ?? 0) > MAX_WORLD_BYTES * 10 || (b?.length ?? 0) > MAX_WORLD_BYTES * 10) {
      for (const c of describeChanges({ [world]: a }, { [world]: b })) for (const x of c.changes) lines.push(`~ ${x}`);
    } else {
      const wa = wiresOf(sa ?? ''), wb = wiresOf(sb ?? '');
      for (const [id, line] of wb) {
        const nw = wireOf(line);
        if (!wa.has(id)) { lines.push(`+ ${compactWire(nw)}`); continue; }
        if (wa.get(id).trim() === line.trim()) continue;
        const ow = wireOf(wa.get(id)), old = new Map(ow.attrs), now = new Map(nw.attrs);
        const was = [...new Set([...old.keys(), ...now.keys()])].filter((k) => old.get(k) !== now.get(k)).map((k) => `${k}=${old.get(k) ?? '∅'}`);
        lines.push(`~ ${compactWire(nw)}${ow.type !== nw.type ? ` (was ${ow.type})` : was.length ? ` (was ${was.join(' ')})` : ''}`);
      }
      for (const [id, line] of wa) if (!wb.has(id)) lines.push(`- ${compactWire(wireOf(line))}`);
    }
    if (lines.length) perWorld.push([world, lines]);
  }
  const all = perWorld.flatMap(([world, lines]) => (perWorld.length > 1 ? lines.map((l) => `${l[0]} ${world}: ${l.slice(2)}`) : lines));
  return all.length > max ? [...all.slice(0, max), `… ${all.length - max} more`] : all;
}
