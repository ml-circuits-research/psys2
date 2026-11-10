/**
 * Legends (spec 02): types, keys, hierarchy, short-key resolution and wire validation.
 * Browser-safe. Build a registry with `new Legends()`, `add(wires)`, then query it.
 *
 * Decisions beyond the spec:
 *  - `core.key` may carry `scope=global`: the key is available in full form on every wire
 *    (used for core.source, core.in, core.from, core.via, core.seq, core.status).
 *  - `core.key` may carry `dynamic=true`: the key is a prefix; `<prefix>.<anything>` is accepted
 *    (used for where.* and arg.*). Its value kind is `any`.
 */
import { get, getAll } from '../soplang/index.mjs';

const LITERAL_KINDS = new Set(['integer', 'number', 'string', 'atom', 'boolean', 'any']);
const isLiteralKind = (k) => LITERAL_KINDS.has(k) || /^quantity\.[\w.-]+$/.test(k) || /^time\.[\w.-]+$/.test(k);
const truthy = (v, dflt) => (v === undefined ? dflt : v.v === 'true');

/** Error raised by resolveKey. */
export class LegendError extends Error {}

export class Legends {
  constructor() {
    this._sources = []; // { wires, worldId }
    this._dirty = false;
    this._reset();
  }

  _reset() {
    this.namespaces = new Map(); // namespace -> { namespace, version, imports, doc, worldId }
    this.types = new Map();      // name -> type info
    this.keys = new Map();       // full key -> key info
    this.errors = [];            // legend-level problems
    this._children = new Map();
    this._dyn = new Map();       // owner type -> [dynamic key infos]
  }

  /** Add the wires of one legend file (core.legend, core.type, core.key). */
  add(wires, { worldId } = {}) {
    this._sources.push({ wires, worldId });
    this._dirty = true;
    return this;
  }

  _ensure() {
    if (!this._dirty) return;
    this._dirty = false;
    this._reset();
    const err = (message, w) => this.errors.push({ message, wireId: w?.id, source: w?.source, line: w?.span?.line });
    const pendingKeys = [];
    for (const { wires, worldId } of this._sources) {
      let ns = null;
      for (const w of wires) if (w.type === 'core.legend') {
        const namespace = get(w, 'namespace')?.v ?? get(w, 'core.legend.namespace')?.v;
        if (!namespace) { err('core.legend without namespace', w); continue; }
        ns = namespace;
        this.namespaces.set(namespace, {
          namespace, worldId, doc: get(w, 'doc')?.v,
          version: get(w, 'version')?.v, imports: getAll(w, 'imports').map((v) => v.v),
        });
      }
      const inNs = (id) => !ns || id === ns || id.startsWith(ns + '.');
      for (const w of wires) {
        if (w.type === 'core.type') {
          if (this.types.has(w.id)) { err(`duplicate type '${w.id}'`, w); continue; }
          if (!inNs(w.id)) err(`type '${w.id}' is outside namespace '${ns}'`, w);
          const ext = get(w, 'extends')?.v;
          this.types.set(w.id, {
            name: w.id, namespace: ns, worldId,
            extends: w.id === 'core.thing' ? null : (ext ?? 'core.thing'),
            doc: get(w, 'doc')?.v,
            examples: getAll(w, 'example').map((v) => v.v),
            negatives: getAll(w, 'negative').map((v) => v.v),
            closed: truthy(get(w, 'closed'), false),
          });
        } else if (w.type === 'core.key') pendingKeys.push({ w, ns, worldId, inNs });
      }
    }
    for (const t of this.types.values()) {
      if (t.extends && !this.types.has(t.extends)) {
        this.errors.push({ message: `type '${t.name}' extends unknown type '${t.extends}'`, wireId: t.name });
        t.extends = 'core.thing';
      }
    }
    for (const t of this.types.values()) { // cycles
      const seen = new Set([t.name]);
      // bounded: a seen-set stops at the first repeated type (cycles are reported and cut)
      for (let p = t.extends; p; p = this.types.get(p)?.extends) {
        if (seen.has(p)) { this.errors.push({ message: `type hierarchy cycle at '${t.name}'`, wireId: t.name }); t.extends = 'core.thing'; break; }
        seen.add(p);
      }
    }
    for (const t of this.types.values()) {
      if (!t.extends) continue;
      if (!this._children.has(t.extends)) this._children.set(t.extends, []);
      this._children.get(t.extends).push(t.name);
    }
    for (const { w, worldId, inNs } of pendingKeys) {
      if (this.keys.has(w.id)) { err(`duplicate key '${w.id}'`, w); continue; }
      if (!inNs(w.id)) err(`key '${w.id}' is outside its legend namespace`, w);
      const global = get(w, 'scope')?.v === 'global';
      let owner = null;
      if (!global) {
        for (const name of this.types.keys()) {
          if (w.id.startsWith(name + '.') && (!owner || name.length > owner.length)) owner = name;
        }
        if (!owner) { err(`key '${w.id}' has no declared owner type (id must be <type>.<key>)`, w); continue; }
      }
      const value = get(w, 'value');
      if (!value) { err(`key '${w.id}' has no value kind`, w); continue; }
      let valueKind;
      if (value.kind === 'ref') {
        if (!this.types.has(value.v)) err(`key '${w.id}' refers to unknown type '${value.v}'`, w);
        valueKind = { ref: value.v };
      } else {
        if (!isLiteralKind(value.v)) err(`key '${w.id}' has unknown value kind '${value.v}'`, w);
        valueKind = { literal: value.v };
      }
      const card = get(w, 'card')?.v ?? 'one';
      if (card !== 'one' && card !== 'many') err(`key '${w.id}' has invalid card '${card}'`, w);
      const ask = get(w, 'ask')?.v;
      if (!ask) err(`key '${w.id}' has no ask text`, w);
      const dynamic = truthy(get(w, 'dynamic'), false);
      const info = {
        id: w.id, owner, name: owner ? w.id.slice(owner.length + 1) : w.id, global,
        value: dynamic ? { literal: 'any' } : valueKind, card: dynamic ? 'many' : card, ask, dynamic,
        observe: truthy(get(w, 'observe'), true), compute: truthy(get(w, 'compute'), false),
        required: truthy(get(w, 'required'), false), worldId,
      };
      this.keys.set(w.id, info);
      if (dynamic && owner) {
        if (!this._dyn.has(owner)) this._dyn.set(owner, []);
        this._dyn.get(owner).push(info);
      }
    }
  }

  /** All validation problems found while building the registry. */
  problems() { this._ensure(); return this.errors; }

  hasType(name) { this._ensure(); return this.types.has(name); }
  type(name) { this._ensure(); return this.types.get(name); }

  /** [type, parent, ..., core.thing]; an unknown type yields [type]. */
  chain(type) {
    this._ensure();
    const out = [type];
    // bounded: stops at the first type already in out, so a cycle cannot loop
    for (let p = this.types.get(type)?.extends; p && !out.includes(p); p = this.types.get(p)?.extends) out.push(p);
    return out;
  }
  ancestors(type) { return this.chain(type).slice(1); }
  isA(type, ancestor) { return this.chain(type).includes(ancestor); }

  /** The type and all descendants (self first). */
  descendants(type) {
    this._ensure();
    const out = [type];
    // bounded: breadth-first walk of the type tree (cycles were cut at load), each type is added once
    for (let i = 0; i < out.length; i++) for (const c of this._children.get(out[i]) ?? []) out.push(c);
    return out;
  }

  /** True when the type or an ancestor is declared `closed=true`. */
  isClosed(type) { return this.chain(type).some((t) => this.types.get(t)?.closed); }

  keyInfo(fullKey) { this._ensure(); return this.keys.get(fullKey); }

  /**
   * Resolve a key written on a wire of `type`. Returns { key, info } or { error }.
   * Order: a dotted key is full when it resolves, otherwise short; short keys try the type
   * and then its ancestors, nearest first. Dotted keys that resolve both ways are ambiguous.
   */
  tryResolveKey(type, key) {
    this._ensure();
    if (!this.types.has(type)) return { error: `unknown type '${type}'` };
    const chain = this.chain(type);
    const applies = (info) => info.global || chain.includes(info.owner);
    const lookupFull = (k) => {
      const info = this.keys.get(k);
      if (info && applies(info)) return { key: k, info };
      for (const owner of chain) for (const d of this._dyn.get(owner) ?? []) {
        if (k.startsWith(d.id + '.')) return { key: k, info: d };
      }
      return null;
    };
    let full = key.includes('.') ? lookupFull(key) : null;
    let short = null;
    for (const a of chain) {
      const info = this.keys.get(`${a}.${key}`);
      if (info) { short = { key: info.id, info }; break; }
      for (const d of this._dyn.get(a) ?? []) {
        if (key.startsWith(d.name + '.')) { short = { key: `${a}.${key}`, info: d }; break; }
      }
      if (short) break;
    }
    if (full && short && full.key !== short.key) {
      return { error: `key '${key}' is ambiguous on type '${type}' (could be '${full.key}' or '${short.key}')` };
    }
    const hit = full ?? short;
    return hit ?? { error: `key '${key}' does not resolve on type '${type}'` };
  }

  /** Like tryResolveKey but returns the full key or throws LegendError. */
  resolveKey(type, key) {
    const r = this.tryResolveKey(type, key);
    if (r.error) throw new LegendError(r.error);
    return r.key;
  }

  /**
   * Copy of a wire with every key in full form. Unresolvable keys are kept unchanged and
   * reported in `errors`.
   */
  normalizeWire(wire) {
    const errors = [];
    const entries = wire.entries.map((e) => {
      const r = this.tryResolveKey(wire.type, e.key);
      if (r.error) { errors.push({ message: r.error, wireId: wire.id, key: e.key }); return e; }
      return r.key === e.key ? e : { key: r.key, value: e.value };
    });
    return { wire: { ...wire, entries }, errors };
  }

  /** Short form of a full key on a wire of `type` when it is unambiguous (for display). */
  shortKey(type, fullKey) {
    const prefix = type + '.';
    if (fullKey.startsWith(prefix)) {
      const s = fullKey.slice(prefix.length);
      const r = this.tryResolveKey(type, s);
      if (r.key === fullKey) return s;
    }
    return fullKey;
  }

  /**
   * Validate a wire against the legends. Keys may be short or full.
   * `lookup(id)` (optional) returns the wire a reference points to, for target type checks.
   * @returns {{message:string, wireId:string, key?:string}[]}
   */
  validateWire(wire, { lookup } = {}) {
    this._ensure();
    const errors = [];
    const bad = (message, key) => errors.push({ message, wireId: wire.id, key, source: wire.source, line: wire.span?.line });
    if (!this.types.has(wire.type)) { bad(`unknown type '${wire.type}'`); return errors; }
    const counts = new Map();
    const present = new Set();
    for (const e of wire.entries) {
      const r = this.tryResolveKey(wire.type, e.key);
      if (r.error) { bad(r.error, e.key); continue; }
      present.add(r.key);
      counts.set(r.key, (counts.get(r.key) ?? 0) + 1);
      const msg = this._checkValue(r.info, e.value, lookup);
      if (msg) bad(`${r.key}: ${msg}`, e.key);
    }
    for (const [k, c] of counts) {
      const info = this.keys.get(k);
      if (info && info.card === 'one' && c > 1 && !info.dynamic) bad(`key '${k}' has cardinality one but appears ${c} times`, k);
    }
    for (const t of this.chain(wire.type)) {
      for (const info of this.keys.values()) {
        if (info.owner === t && info.required && !info.dynamic && !present.has(info.id)) bad(`required key '${info.id}' is missing`, info.id);
      }
    }
    return errors;
  }

  _checkValue(info, value, lookup) {
    if (info.value.ref) {
      if (value.kind !== 'ref') return `expected a reference to ${info.value.ref}, got ${value.kind} '${value.v}'`;
      const target = lookup?.(value.v);
      if (target && !this.isA(target.type, info.value.ref)) return `$${value.v} is a ${target.type}, expected ${info.value.ref}`;
      return null;
    }
    const k = info.value.literal;
    if (k === 'any') return null;
    if (value.kind === 'ref') return `expected ${k}, got a reference`;
    const v = value.v;
    switch (k) {
      case 'integer': return value.kind === 'atom' && /^-?\d+$/.test(v) ? null : `'${v}' is not an integer`;
      case 'number': return value.kind === 'atom' && /^-?\d+(\.\d+)?$/.test(v) ? null : `'${v}' is not a number`;
      case 'boolean': return value.kind === 'atom' && (v === 'true' || v === 'false') ? null : `'${v}' is not a boolean`;
      case 'string': return null;
      case 'atom': return value.kind === 'atom' ? null : 'expected an atom, got a string';
      default:
        if (k.startsWith('quantity.')) return value.kind === 'atom' && /^-?\d+(\.\d+)?[^\s\d]*$/.test(v) ? null : `'${v}' is not a quantity`;
        return value.kind === 'atom' ? null : `'${v}' is not a valid ${k}`;
    }
  }

  /**
   * Decode a value according to the key's declared kind: number for integer/number,
   * boolean, id string for references, string otherwise.
   */
  decode(info, value) {
    if (value.kind === 'ref') return value.v;
    const k = info?.value?.literal;
    if ((k === 'integer' || k === 'number') && value.kind === 'atom' && !Number.isNaN(Number(value.v))) return Number(value.v);
    if (k === 'boolean') return value.v === 'true';
    return value.v;
  }
}

/** Convenience: build a registry from [{ wires, worldId }]. */
export function loadLegends(sources) {
  const l = new Legends();
  for (const s of sources) l.add(s.wires, { worldId: s.worldId });
  return l;
}
