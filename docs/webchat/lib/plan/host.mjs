// SPDX-License-Identifier: AGPL-3.0-only
// PLANS FROM KNOWLEDGE (specs/24-plans-from-knowledge.md): the host side of sopworld `std.plan`. Complex requests ("a farm", "a person on the swing", "a family photo", "a doctor") are not code in a live
// world: the methods are knowledge (`k.procedures`, catalog), the planner is the library's (`planner`, one copy), the world only executes the acts of a plan (worlds/art.draw/plan.mjs).
// This file does the three things a host owes the library: loads the worlds the methods read (lazily, only the shards a goal can touch), builds the planner over them, and says what the
// plan is for in plain words. Browser-safe: no `node:*`; the catalog is reached through the session's knowledge (`cat.world`, `cat.readText`).

/** The catalog worlds the methods read. `only`: the shards read of a big world (its basename); `keyed`: a big world read by the words of the goal (the index lists each shard's keys). */
export const PLAN_WORLDS = [
  { id: 'k.procedures' },
  { id: 'k.actions', only: ['acts'] },   // the roles of every act (which are needed): one shard
  { id: 'k.layouts' }, { id: 'k.wearables' }, { id: 'k.people' }, { id: 'k.feelings' },
  { id: 'k.kinds' },                    // schema only: the `is_a` identity the people's kinds extend (without it the kind chain of a role is not matched)
  { id: 'k.scenes', keyed: true },       // 61 scenes and 2.7 MB of things: the shards that name a word of the goal
];
/** What "is a kind of" is for the planner: the kind chain of the people (a man is a person, a doctor is a person). */
const KIND_KEYS = ['is_a', 'kind_of', 'is', 'age'];
import { parseLine } from '../knowledge/catalog.mjs?v=0372695257';
export const PLAN_CHAIN = [{ type: 'k.people.kind', keys: [...KIND_KEYS, 'drawing'] }, { type: 'k.people.role', keys: [...KIND_KEYS, 'drawing'] }];

const hosts = new WeakMap();
/** The plan host of a knowledge catalog (one per catalog). */
export function planHostOf(cat0) {
  const cat = cat0?.base ?? cat0;   // the session's catalog is the base with what the user taught laid over it: one host per base
  if (!cat) return null;
  if (!hosts.has(cat)) hosts.set(cat, createPlanHost(cat));
  return hosts.get(cat);
}

export function createPlanHost(cat) {
  const texts = new Map();      // path -> text
  const loaded = new Map();     // world id -> { id, schemaText, shards: Map(path -> text) }
  let words = null;   // phrase -> goal value (canonical), built once from the shards
  let lib = null, store = null, plan = null, version = 0, built = -1;   // lib: the library module once imported
  const read = async (path) => { if (!texts.has(path)) texts.set(path, (await cat.readText?.(path)) ?? ''); return texts.get(path); };

  async function addWorld(spec, words) {
    const w = await cat.world?.(spec.id);
    if (!w) return;
    const have = loaded.get(spec.id) ?? { id: spec.id, schemaText: await read(w.schema), shards: new Map() };
    loaded.set(spec.id, have);
    const pick = w.shards.filter((s) => (spec.only ? spec.only.includes(String(s.id).split('/').at(-1)) : spec.keyed ? (s.keys ?? []).some((k) => words.has(String(k).toLowerCase())) : true));
    for (const s of pick) if (!have.shards.has(s.path)) { have.shards.set(s.path, await read(s.path)); version++; }
  }

  const api = {
    /** True once the methods are loaded (a synchronous read for operations). */
    ready: () => !!plan,
    /** Loads what a goal can touch: `words` are the words of the goal (kind, place); resolves to true when planning is possible. */
    async load(words = []) {
      const set = new Set(words.flatMap((w) => { const x = String(w).toLowerCase(); return [x, x.replace(/s$/, ''), x.replace(/ies$/, 'y')]; }));
      try {
        lib ??= await import('../vendor/sopworld/sopworld.mjs?v=900699a034');
        for (const spec of PLAN_WORLDS) await addWorld(spec, set);
        if (!loaded.get('k.procedures')?.shards.size) return false;
        if (built !== version) {
          words = null;
          store = lib.factStore([...loaded.values()].map((w) => ({ id: w.id, schemaText: w.schemaText, shards: [...w.shards.values()].map((text) => ({ text })) })));
          plan = lib.planner(store, { chain: PLAN_CHAIN });
          built = version;
        }
        return true;
      } catch { return false; }   // an unreachable catalog or a method that cannot be read: no plan, the board reads the sentence itself
    },
    /** The goal value a word means ("group photo" and "family picture" mean "family photo", "set a table" means "table setting"): the `core.word` wires of `k.procedures.goal.value` in the shards read; the phrase itself when none. */
    canonical(phrase) {
      if (!words) {
        words = new Map();
        for (const w of loaded.get('k.procedures')?.shards.values() ?? []) for (const line of w.split('\n')) {
          if (!line.startsWith('@') || !line.includes(' core.word ')) continue;
          const x = parseLine(line);
          if (x?.attrs.of?.[0] !== 'k.procedures.goal.value') continue;
          for (const t of x.attrs.text ?? []) words.set(t.toLowerCase(), x.attrs.means?.[0] ?? t);
        }
      }
      return words.get(String(phrase).toLowerCase()) ?? phrase;
    },
    /** The facts of a catalog type that `load` read (merged by identity), or []. */
    facts: (type) => store?.facts(type) ?? [],
    /** The plan of a goal `{ act, roles }` over the live things `[{ id, kind }]`, or null when nothing is loaded. { method, lines, explain, requests, asks, refused, tried, effects, methods, skipped, truncated }. */
    plan(goal, things = [], extra = {}) {
      if (!plan) return null;
      return plan.plan(goal, new lib.PlanLive({ store, things, ...extra }));
    },
  };
  return api;
}

/** One line for a plan: what the method is and why each step was taken ("compose a scene: make kind=barn ..." read back as words). */
export function whyOf(p) {
  if (!p || !p.method) return '';
  const by = [...new Set(p.explain.map((x) => x.replace(/:.*$/, '')))];
  return `I used the method "${by.join('" and "')}".`;
}
