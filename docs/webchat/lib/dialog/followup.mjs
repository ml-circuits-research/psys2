// SPDX-License-Identifier: AGPL-3.0-only
/**
 * What the last effectful action touched (SCENE-NATURAL P2). Browser-safe: no `node:*` imports.
 *
 * A follow-up ("bigger", "make them red", "further left") is an operation on the previous turn: it needs the things that turn made or changed, in any world that
 * keeps a list of things with ids. The dialogue layer knows them without asking the world: an action keeps the state of its worlds before and after (`act.before`,
 * `act.after`, JSON), and the things that were added or changed are the entries with an `id` whose record differs. No world code, no vocabulary.
 */
import { budget } from './budget.mjs?v=123c3e1329';

const parse = (j) => { try { return j == null ? null : JSON.parse(j); } catch { return null; } };
const isList = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === 'object' && x.id != null);

/** `{ added, changed, removed }`: the ids (per world) of the things the action made, changed and removed. */
export function touched(act) {
  const out = { added: [], changed: [], removed: [] };
  if (!act) return out;
  for (const w of act.worlds ?? []) {
    const before = parse(act.before?.[w]) ?? {}, after = parse(act.after?.[w]) ?? {};
    for (const key of Object.keys(after)) {
      const a = after[key], b = before[key];
      if (!isList(a) && !isList(b)) continue;
      const was = new Map((Array.isArray(b) ? b : []).map((x) => [x.id, JSON.stringify(x)]));
      const now = new Set();
      for (const x of Array.isArray(a) ? a : []) {
        budget.tick('followup.touched');
        now.add(x.id);
        if (!was.has(x.id)) out.added.push({ world: w, key, id: x.id });
        else if (was.get(x.id) !== JSON.stringify(x)) out.changed.push({ world: w, key, id: x.id });
      }
      for (const id of was.keys()) if (!now.has(id)) out.removed.push({ world: w, key, id });
    }
  }
  return out;
}

/** How many things the action made or changed: more than one means "them", not "it". */
export const touchedCount = (act) => { const t = touched(act); return t.added.length + t.changed.length; };
