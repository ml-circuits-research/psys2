/**
 * Working memory: a session overlay on top of the shared knowledge bases (spec 04).
 * Indexes: by id, by type, by (type, fullKey, value). Wires must use full keys. Browser-safe.
 */

const SEP = '\u0000';

/** True for a wire marked `core.status=retracted` (Memory.retract). */
export const isRetracted = (w) => w.entries.some((e) => e.key === 'core.status' && e.value.v === 'retracted');

/** A set of wires with indexes. */
export class WireStore {
  constructor() {
    this.byId = new Map();
    this._byType = new Map();
    this._byKV = new Map();
    this._ord = new Map();
    this._n = 0;
  }
  add(wire) {
    if (this.byId.has(wire.id)) this._remove(this.byId.get(wire.id));
    this.byId.set(wire.id, wire);
    this._ord.set(wire.id, this._n++);
    (this._byType.get(wire.type) ?? this._byType.set(wire.type, []).get(wire.type)).push(wire);
    for (const e of wire.entries) {
      const k = wire.type + SEP + e.key + SEP + e.value.v;
      (this._byKV.get(k) ?? this._byKV.set(k, []).get(k)).push(wire);
    }
  }
  _remove(wire) {
    const drop = (arr) => { const i = arr?.indexOf(wire); if (i >= 0) arr.splice(i, 1); };
    drop(this._byType.get(wire.type));
    for (const e of wire.entries) drop(this._byKV.get(wire.type + SEP + e.key + SEP + e.value.v));
    this.byId.delete(wire.id);
  }
  /** Independent copy (wires are immutable and shared; the indexes are copied). */
  clone() {
    const c = new WireStore();
    c.byId = new Map(this.byId); c._ord = new Map(this._ord); c._n = this._n;
    for (const [k, v] of this._byType) c._byType.set(k, v.slice());
    for (const [k, v] of this._byKV) c._byKV.set(k, v.slice());
    return c;
  }
  ofType(type) { return this._byType.get(type) ?? []; }
  withKV(type, key, v) { return this._byKV.get(type + SEP + key + SEP + v) ?? []; }
  order(wire) { return this._ord.get(wire.id) ?? 0; }
  all() { return [...this.byId.values()]; }
}

/** Base store (knowledge bases, read-only) plus the session's own store. */
export class Memory {
  constructor(legends, base = null) {
    this.legends = legends;
    this.base = base;
    this.own = new WireStore();
  }
  add(wire) { this.own.add(wire); }
  /** Independent copy of the session overlay (the base store is shared). */
  clone() { const m = new Memory(this.legends, this.base); m.own = this.own.clone(); return m; }
  /**
   * Retract a session wire: it gets `core.status=retracted` (and `core.reason`) but stays in memory for the trace.
   * Retracted wires are excluded from `find`; `get` still returns them. Returns false for unknown or KB wires.
   */
  retract(id, reason) {
    const w = this.own.byId.get(id);
    if (!w) return false;
    const entries = w.entries.filter((e) => e.key !== 'core.status' && e.key !== 'core.reason');
    entries.push({ key: 'core.status', value: { kind: 'atom', v: 'retracted' } });
    if (reason) entries.push({ key: 'core.reason', value: { kind: 'string', v: String(reason) } });
    this.own.add({ ...w, entries });
    return true;
  }
  get(id) { return this.own.byId.get(id) ?? this.base?.byId.get(id); }
  /** Session wires in insertion order. */
  sessionWires() { return this.own.all(); }

  /**
   * Wires of `type` or a descendant whose full-key entries match every `where` pair
   * (`where`: { fullKey: valueText }). KB wires come first, then session wires in insertion order.
   */
  find(type, where = {}) {
    const types = this.legends.descendants(type);
    const pairs = Object.entries(where);
    const out = [];
    for (const store of [this.base, this.own]) {
      if (!store) continue;
      let cands = [];
      for (const t of types) {
        cands.push(...(pairs.length ? store.withKV(t, pairs[0][0], pairs[0][1]) : store.ofType(t)));
      }
      cands = [...new Set(cands)].sort((a, b) => store.order(a) - store.order(b));
      for (const w of cands) {
        if (isRetracted(w)) continue;
        if (pairs.every(([k, v]) => w.entries.some((e) => e.key === k && e.value.v === v))) out.push(w);
      }
    }
    return out;
  }
}
