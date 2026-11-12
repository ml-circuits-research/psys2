// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Fact namespaces at the host boundary (spec 15, "Namespaces"; sopworld >= 0.8, `new World({ ns })`).
 *
 * Every instance of the reasoner is a library World made with its own namespace: the library writes the id of every fact it is told as `<ns>::<id>`, resolves a
 * reference without a namespace inside the instance, and merges facts by identity only inside one namespace. The rest of the product (the dialogue memory, the
 * worlds' `fns.mjs`, the voices, the timeline) keeps one id for a wire, the id it was given, so the instance is handed out through `nsWorld`: ids that go in
 * are qualified, ids that come out (wires, answers, bindings, explanations, violations) are bare again. The library's own record (`log`, `toJSON`, marks)
 * is not touched: it holds the qualified ids.
 *
 * Browser-safe: no `node:` imports. The walks over a value are capped in depth, so none can run away.
 */

/**
 * What crosses the instances (the library's `shared=true`, which is what a namespace "exports"): the types whose facts belong to every namespace, matched
 * and merged across them. The agents: the user and the people named, which every instance reads (read-only: a tab never writes into another one). (The counts of docs.editor say `shared=true` in its matrix: library item, an aggregate's result is told in the default namespace.)
 */
/**
 * Worlds whose instance stays in the default namespace, with the reason. docs.editor counts its blocks with a `core.aggregate`, and library 0.9.0 tells the
 * result in the default namespace (not in that of the blocks), so the deny that joins the count with the document's facts never matches in a namespace.
 */
export const NO_NAMESPACE = new Set(['docs.editor']);

export const SHARED_TYPES = new Set(['core.agent']);

/**
 * Facts told in the default namespace (no `ns::` before the id): the user. A shared type is matched in every namespace, but a *reference* is still resolved in
 * the namespace of the wire that holds it (library 0.9.0), so the host writes the way to it: `$e.user` becomes `$::e.user`.
 */
export const DEFAULT_FACTS = ['e.user'];
const DEFAULT_REF = new RegExp(`\\$(${DEFAULT_FACTS.map((x) => x.replace(/\./g, '\\.')).join('|')})(?![\\w.:-])`, 'g');

/** `x` (wires, a question, a patch or SOP text) with the references to the default namespace written out. */
export function toLib(x) {
  const walk = (v, depth) => {
    if (typeof v === 'string') return v.includes('$') ? v.replace(DEFAULT_REF, '$$::$1') : v;
    if (v === null || typeof v !== 'object' || depth > 400) return v;   // the library's results are trees a few dozen levels deep (an explanation is the deepest): the cap ends the walk

    if (Array.isArray(v)) { let out = v; for (let i = 0; i < v.length; i++) { const n = walk(v[i], depth + 1); if (n !== v[i]) { if (out === v) out = v.slice(); out[i] = n; } } return out; }
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return v;
    let out = v;
    for (const k of Object.keys(v)) { const n = walk(v[k], depth + 1); if (n !== v[k]) { if (out === v) out = { ...v }; out[k] = n; } }
    return out;
  };
  return walk(x, 0);
}

/** Marks a facade, so a world is not wrapped twice. */
const NS = Symbol('psys2.ns');

/** The id as the library stores it. */
export function qualify(ns, id) {
  const s = String(id);
  if (!ns) return s;
  const ref = s[0] === '$';
  const bare = ref ? s.slice(1) : s;
  return (ref ? '$' : '') + (bare.includes('::') ? bare : `${ns}::${bare}`);
}

/**
 * `x` with the namespace prefix taken off every id in it (strings `ns::a`, references `$ns::a`, and text that quotes one). Plain objects and arrays are copied
 * only where something changed, so a value that holds no qualified id is returned as it is.
 */
export function strip(ns, x) {
  if (!ns || x === null || typeof x !== 'object') return typeof x === 'string' && ns && x.includes(`${ns}::`) ? x.split(`${ns}::`).join('') : x;
  const p = `${ns}::`;
  const walk = (v, depth) => {
    if (typeof v === 'string') return v.includes(p) ? v.split(p).join('') : v;
    if (v === null || typeof v !== 'object' || depth > 400) return v;   // the library's results are trees a few dozen levels deep (an explanation is the deepest): the cap ends the walk

    if (Array.isArray(v)) {
      let out = v;
      for (let i = 0; i < v.length; i++) {
        const n = walk(v[i], depth + 1);
        if (n !== v[i]) { if (out === v) out = v.slice(); out[i] = n; }
      }
      return out;
    }
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return v;   // a Map, a Set, a World, a budget: not data
    let out = v;
    for (const k in v) {
      const n = walk(v[k], depth + 1);
      if (n !== v[k]) { if (out === v) out = { ...v }; out[k] = n; }
    }
    return out;
  };
  return walk(x, 0);
}

/** The id in the library: inside the instance's namespace, or (a shared fact, the user) the bare id in the default one. */
const here = (target, ns, id) => {
  const q = qualify(ns, id);
  return q === id || (typeof target.has === 'function' && !target.has(q) && target.has(String(id))) ? id : q;
};

/** Methods whose first argument is the id of a wire. */
const BY_ID = new Set(['get', 'has', 'retract', 'explain', 'fill', 'revise', 'replace', 'resolve', 'tier']);
/**
 * `replace(id, input)` of library 0.9.0 puts the new wire in the default namespace when the id in `input` is a bare one (filed in worker-log.md, "namespaces");
 * until it is fixed the replacement is written with the qualified id.
 */
function replacement(ns, id, input) {
  const q = qualify(ns, id);
  const one = (w) => {
    if (typeof w === 'string') return w.replace(/^(\s*@)([^\s]+)/, (m, at, name) => (name.includes('::') ? m : `${at}${qualify(ns, name)}`));
    if (w && typeof w === 'object' && typeof w.id === 'string') {
      const x = { ...w, id: w.id.includes('::') ? w.id : q.replace(/[^:]+$/, '') + w.id };
      if (x.attrs) x.attrs = Object.fromEntries(Object.entries(x.attrs).map(([k, vs]) => [k, Array.isArray(vs) ? vs.map((y) => refIn(ns, y)) : refIn(ns, vs)]));
      return x;
    }
    return w;
  };
  return Array.isArray(input) ? input.map(one) : one(input);
}

/** A reference to a fact of the instance, written for the library (`$x` -> `$ns::x`; a variable, a written namespace and a plain value stay). */
const refIn = (ns, v) => (ns && typeof v === 'string' && v[0] === '$' && v[1] !== '?' && !v.includes('::') ? `$${ns}::${v.slice(1)}` : v);

/** A patch (`applyPatch`, `check`) with the ids of what it retracts, replaces, sets and fills qualified (what it tells is qualified by the library). */
function patchIds(target, ns, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const q = (id) => here(target, ns, id);
  const ref = (v) => (typeof v === 'string' && v[0] === '$' && v[1] !== '?' && !v.includes('::') ? '$' + q(v.slice(1)) : v);   // the library qualifies the references of what it is told as `wires`, not of a replacement or a value set
  const attrs = (a) => (a && typeof a === 'object' ? Object.fromEntries(Object.entries(a).map(([k, vs]) => [k, Array.isArray(vs) ? vs.map(ref) : ref(vs)])) : a);
  const out = { ...patch };
  if (Array.isArray(out.retract)) out.retract = out.retract.map(q);
  for (const k of ['replace', 'sets', 'fills']) {
    if (!Array.isArray(out[k])) continue;
    out[k] = out[k].map((x) => {
      if (!x || typeof x.id !== 'string') return x;
      const y = { ...x, id: q(x.id) };
      if (y.attrs) y.attrs = attrs(y.attrs);
      if ('value' in y) y.value = Array.isArray(y.value) ? y.value.map(ref) : ref(y.value);
      return y;
    });
  }
  return out;
}

/** Methods that read the facts and take `{ ns }` as their last argument: the question is asked inside the instance's namespace (a reference without one points into it). */
const ASK = new Set(['query', 'ask', 'holds', 'act', 'score']);
/** Methods whose result is the library's own record or a handle on it, not data to read: they go through unchanged. */
const RAW = new Set(['mark', 'marks', 'toJSON', '_replay', 'schema', 'register', 'fork']);

/**
 * The World of an instance with bare ids in and out. `world.raw` is the library's World; a property that is not a method (`stamp`, `seq`, `log`, `matrix`,
 * `wires`, `options`, `warnings`) is the library's own.
 */
export function nsWorld(world, ns) {
  if (world[NS] !== undefined) return world;
  return ns ? qualifying(world, ns) : plainWorld(world);
}

/** The instance of the default namespace: nothing to qualify or strip. */
function plainWorld(world) {
  const plain = new Proxy(world, {
    get(target, p) {
      if (p === NS || p === 'ns') return '';
      if (p === 'raw') return target;
      if (p === 'fork') return (...a) => nsWorld(target.fork(...a), '');
      const v = target[p];
      return typeof v === 'function' && p !== 'constructor' ? (...a) => { const r = v.apply(target, a); return r === target ? plain : r; } : v;
    },
  });
  return plain;
}

/** The instance of a namespace. */
function qualifying(world, ns) {
  const cache = new Map();
  const proxy = new Proxy(world, {
    get(target, p) {
      if (p === NS) return ns;
      if (p === 'raw') return target;
      if (p === 'ns') return ns;
      const v = target[p];
      if (typeof v !== 'function' || typeof p === 'symbol' || p === 'constructor') return v;
      let f = cache.get(p);
      if (!f) {
        if (p === 'fork') f = (...a) => nsWorld(target.fork(...a), ns);
        else if (p === 'load') f = (...a) => strip(ns, v.apply(target, a));   // the matrices and legends say `$e.user` as it is
        else if (RAW.has(p) || p[0] === '_') f = (...a) => v.apply(target, a);
        else if (ASK.has(p)) f = (q, o, ...a) => strip(ns, v.call(target, toLib(q), { ns, ...o }, ...a));
        else if (p === 'assumptions') f = (ids, ...a) => strip(ns, v.call(target, ids == null ? ids : [].concat(ids).map((id) => here(target, ns, id)), ...a));
        else if (p === 'applyPatch' || p === 'check') f = (patch, ...a) => { const r = v.apply(target, [patchIds(target, ns, toLib(patch)), ...toLib(a)]); return strip(ns, r); };
        else if (p === 'replace') f = (id, input, ...a) => strip(ns, v.call(target, here(target, ns, id), replacement(ns, id, toLib(input)), ...toLib(a)));
        else if (p === 'fill' || p === 'revise') f = (id, key, value, ...a) => strip(ns, v.call(target, here(target, ns, id), key, Array.isArray(value) ? toLib(value).map((x) => refIn(ns, x)) : refIn(ns, toLib(value)), ...a));
        else if (BY_ID.has(p)) f = (id, ...a) => strip(ns, v.call(target, here(target, ns, id), ...toLib(a)));
        else f = (...a) => { const r = v.apply(target, toLib(a)); return r === target ? proxy : strip(ns, r); };
        cache.set(p, f);
      }
      return f;
    },
  });
  return proxy;
}

/**
 * The context the library gives an action function (`ctx`), with bare ids: what it finds and reads has none of the namespace, and an id it names is qualified.
 * `ctx.world` is the instance's facade; `tell`, `val`, `vals` and the rest are the library's (it qualifies what is told, and a wire read is already bare).
 */
export function nsContext(c, ns) {
  if (!ns) return { ...c, world: nsWorld(c.world, '') };
  const out = { ...c, world: nsWorld(c.world, ns) };
  if (c.tell) out.tell = (input, ...a) => c.tell(toLib(input), ...a);
  if (c.find) out.find = (...a) => strip(ns, c.find(...a));
  if (c.get) out.get = (id) => strip(ns, c.get(here(c.world, ns, id)));
  if (c.query) out.query = (...a) => strip(ns, c.query(...a));
  if (c.ask) out.ask = (...a) => strip(ns, c.ask(...a));
  if (c.replace) out.replace = (id, input, ...a) => strip(ns, c.replace(here(c.world, ns, id), replacement(ns, id, toLib(input)), ...a));
  if (c.fill) out.fill = (id, key, value, ...a) => strip(ns, c.fill(here(c.world, ns, id), key, refIn(ns, toLib(value)), ...a));
  if (c.retract) out.retract = (id, ...a) => strip(ns, c.retract(here(c.world, ns, id), ...a));
  return out;
}

/**
 * Replays library log entries into a World of a namespace (`World._replay`), keeping the facts of the default namespace there. The log holds the wires as they
 * were stored (`e.user`), and a replay would qualify them again (`ns::e.user`); the entries are rewritten to say `::e.user`, which the library reads as "the
 * default namespace" (library item in worker-log.md: a log entry should keep its namespace). Returns what `_replay` returns (null when it went well).
 */
export function replayInto(world, entries) {
  const keep = (e) => (e.op === 'tell' && e.wires?.some((w) => DEFAULT_FACTS.includes(w.id)) ? { ...e, wires: e.wires.map((w) => (DEFAULT_FACTS.includes(w.id) ? { ...w, id: `::${w.id}` } : w)) } : e);
  return world._replay(entries, keep);
}
