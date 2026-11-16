// SPDX-License-Identifier: AGPL-3.0-only
/**
 * THE HARD GATE AGAINST A FALSE "DONE" (reviewer 2026-11-16 10:20, item 1): a reply that says something changed is produced only from a non-empty diff that the
 * world's real state confirms. The library's diff is read from the tool's view; this checks every entry of it against the state of the world before and after the
 * plan ran (every thing with an `id` anywhere in the state, compared by value):
 *   - an entry whose thing is in the state is kept only when that thing really differs (added: present only after; removed: present only before; changed: different);
 *   - an entry whose id the state does not hold (a view-only thing) is kept only when the world's content changed at all;
 *   - nothing kept: the run is a refusal `unchanged` (reply fact refused.unchanged, with the thing), never a "done";
 *   - some dropped: the reply is said from the kept entries (the count of "moved 6 flowers" is the number that really moved).
 * Generic: no world, kind or act is named. Browser-safe.
 */
const budget = { tick: (site, n = 1) => globalThis[Symbol.for('psys2.budget')]?.tick(site, n) };
const LOG_KEYS = new Set(['history', 'future', 'log', 'trace', 'stepGroup', 'prevLabel', 'label', 'last', 'selected', 'rels']);   // what the world keeps about itself, not its content

/** Map id -> JSON of every object with an `id` in a world state (history and logs skipped). */
export function thingsOf(state) {
  const out = new Map();
  const walk = (v, depth) => {
    budget.tick('verify.things');
    if (!v || typeof v !== 'object' || depth > 8) return;
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (v.id !== undefined && (typeof v.id === 'string' || typeof v.id === 'number') && !out.has(String(v.id))) out.set(String(v.id), JSON.stringify(v));
    for (const [k, x] of Object.entries(v)) if (!LOG_KEYS.has(k)) walk(x, depth + 1);
  };
  walk(state, 0);
  return out;
}

export const contentOf = (state) => { const walk = (v) => { budget.tick('verify.content'); return Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !LOG_KEYS.has(k)).map(([k, x]) => [k, walk(x)])) : v; }; try { return JSON.stringify(walk(state)); } catch { return ''; } };

/** { run, dropped }: the run as the state confirms it (the same object when nothing is dropped). */
export function verifyRun(run, before, after) {
  if (!run?.ok || run.same || !run.diff) return { run, dropped: [] };
  const d = run.diff, B = thingsOf(before), A = thingsOf(after), moved = contentOf(before) !== contentOf(after);
  const keep = (id, kind) => {
    const k = String(id);
    if (!A.has(k) && !B.has(k)) return moved;
    if (kind === 'added') return A.has(k) && !B.has(k);
    if (kind === 'removed') return B.has(k) && !A.has(k);
    return A.get(k) !== B.get(k);
  };
  const dropped = [];
  const filt = (list, kind) => list.filter((e) => { const ok = keep(e.id, kind); if (!ok) dropped.push({ ...e, kind: e.kind, entry: kind }); return ok; });
  const diff = { ...d, added: filt(d.added ?? [], 'added'), removed: filt(d.removed ?? [], 'removed'), changed: filt(d.changed ?? [], 'changed') };
  if (!dropped.length) return { run, dropped };
  const kept = diff.added.length + diff.removed.length + diff.changed.length;
  if (!kept) {
    const thing = String(dropped[0].kind ?? 'thing').replace(/_/g, ' ');
    return { run: { ...run, ok: false, same: false, diff: { added: [], removed: [], changed: [] }, failed: { code: 'unchanged', reply: 'refused.unchanged', roles: { thing } } }, dropped };
  }
  return { run: { ...run, diff, ...(run.redone ? { redone: run.redone.filter((x) => keep(x.id, 'changed')) } : {}) }, dropped };
}
