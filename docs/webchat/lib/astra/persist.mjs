/**
 * ASTRA snapshots and persistence (spec 13 section 6). Browser-safe: storage is a localStorage-like object passed in by the host.
 */
import { EventLog } from './log.mjs';

export const SCHEMA = 1;
/** `MIGRATIONS[n]` upgrades a record of schema n to schema n + 1. */
export const MIGRATIONS = {};

/** Plain JSON of the whole chat. Live instances are saved out first, so the record holds every state. */
export function snapshot(astra) {
  astra.saveAll();
  return structuredClone({
    schema: SCHEMA, chat: astra.chatKey, counters: astra.counters, clock: astra._clock ?? 0,
    discussions: [...astra.discussions.values()], instances: [...astra.instances.values()], live: astra.live, tabs: astra.tabs, active: astra.active,
    acts: astra.acts, log: astra.log.toJSON(),
  });
}

/** Upgrade an older record; returns null for a record that is newer than this library or unusable. */
export function migrate(json) {
  if (!json || typeof json !== 'object' || !Number.isInteger(json.schema)) return null;
  let j = json;
  if (j.schema > SCHEMA) return null;
  while (j.schema < SCHEMA) {
    const step = MIGRATIONS[j.schema];
    if (!step) return null;
    j = step(structuredClone(j)); j.schema = (j.schema ?? 0) + 1;
  }
  return j;
}

/** Rebuild the registry from a record and load the live instances into the binding. Never runs an effect. Returns true when restored. */
export function restore(astra, json) {
  const j = migrate(json);
  if (!j) return false;
  const c = structuredClone(j);
  astra.counters = { d: 0, i: 0, ...c.counters };
  astra._clock = c.clock ?? 0;
  astra.discussions = new Map((c.discussions ?? []).map((d) => [d.id, d]));
  astra.instances = new Map((c.instances ?? []).map((i) => [i.id, i]));
  astra.live = c.live ?? {}; astra.tabs = c.tabs ?? {}; astra.active = c.active ?? null;
  astra.acts = c.acts ?? [];
  astra.log = EventLog.fromJSON(c.log);
  for (const [world, id] of Object.entries(astra.live)) {
    const inst = astra.instances.get(id);
    if (inst) astra.binding.set(world, structuredClone(inst.state) ?? structuredClone(astra.binding.initial(world)) ?? {});
    else delete astra.live[world];
  }
  return true;
}

/** Storage over a localStorage-like backend ({ getItem, setItem, removeItem }); every call is guarded (private windows, quota). */
export class Storage {
  constructor(backend, { prefix = 'astra.v1.' } = {}) { this.backend = backend; this.prefix = prefix; }
  key(astra) { return `${this.prefix}${astra.chatKey}`; }
  save(astra) {
    try { this.backend.setItem(this.key(astra), JSON.stringify(snapshot(astra))); return true; } catch { return false; }
  }
  load(astra) {
    try {
      const raw = this.backend.getItem(this.key(astra));
      return raw ? restore(astra, JSON.parse(raw)) : false;
    } catch { return false; }
  }
  clear(astra) { try { this.backend.removeItem(this.key(astra)); } catch { /* ignore */ } }
}

/** An in-memory backend (tests, hosts without storage). */
export function memoryBackend() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}
