/**
 * Main interpreter (spec 04, rules profile). Browser-safe.
 *
 *   const interp = createInterpreter(worldSet)
 *   const session = interp.createSession()
 *   session.add(wires)                       // formalized wires into working memory
 *   const result = interp.resolve(session, questionOrRequestWire)
 *   const text = interp.render(session, result)
 *
 * Extensions beyond the spec (documented in the final report):
 *  - envelope may carry `ask` (the legend question of the missing key) and `via` (producer id);
 *  - `ctx.worlds()` lists the loaded worlds (used by the chat capability);
 *  - `ctx.emit` accepts `{_}` / `{_1}` fresh-id placeholders like pattern emit templates.
 */
import { parse, makeWire, atom, str, ref, get } from '../soplang/index.mjs';
import { Memory, WireStore } from './memory.mjs';
import { Renderer, fallbackText, listText } from './render.mjs';
import { FormSession } from '../formalizer/rules/session.mjs';

export { Memory, WireStore } from './memory.mjs';
export { Renderer } from './render.mjs';

const STATUSES = new Set(['supported', 'missing', 'conflicting', 'ambiguous', 'unsupported', 'budget', 'error']);
const FINAL_SOFT = new Set(['conflicting', 'ambiguous', 'budget', 'error']);
const SAFE_ATOM = /^[^\s"@$=\\]+$/;

class BudgetError extends Error {}

/** A dialog session: memory overlay, per-world state and the formalizer's session state. */
export class Session {
  constructor(interp) {
    this.interp = interp;
    this.memory = new Memory(interp.legends, interp.base);
    this.state = {};
    this.effects = [];   // effects queued by ctx.effect during the current message (spec 07)
    this.form = new FormSession();
    this._answers = 0;
    // Tool worlds export initialState() from ops.mjs; the engine seeds their state at session start.
    for (const w of interp.set.list()) {
      if (typeof w.ops?.initialState === 'function') this.state[w.id] = structuredClone(w.ops.initialState());
    }
  }
  /** Add wires (full keys) to working memory. */
  add(wires) { for (const w of wires) this.memory.add(w); }
  nextAnswerId() { return 'a' + (++this._answers); }
}

export class Interpreter {
  constructor(set, { opTimeoutMs = 200, maxDepth = 8, maxVisited = 10000 } = {}) {
    this.set = set;
    this.legends = set.legends;
    this.opTimeoutMs = opTimeoutMs;
    this.maxDepth = maxDepth;
    this.maxVisited = maxVisited;
    this.base = new WireStore();
    for (const w of set.list()) for (const k of w.kb) this.base.add(k);
    this.renderer = new Renderer(set);
  }

  createSession() { return new Session(this); }

  /** Resolve a core.question or core.request wire. Returns null for other wires. */
  resolve(session, wire) {
    const L = this.legends;
    if (L.isA(wire.type, 'core.question')) return this._resolveQuestion(session, wire);
    if (L.isA(wire.type, 'core.request')) return this._resolveRequest(session, wire);
    return null;
  }

  // ---- questions -------------------------------------------------------

  _questionSpec(wire) {
    const L = this.legends;
    const val = (k) => get(wire, 'core.question.' + k)?.v;
    const spec = { wire, type: val('type'), seek: val('seek'), mode: val('mode') ?? 'value', about: val('about'), where: {}, whereRef: new Set() };
    if (spec.seek && L.hasType(spec.type)) { const r = L.tryResolveKey(spec.type, spec.seek); if (!r.error) spec.seek = r.key; }
    const prefix = 'core.question.where.';
    for (const e of wire.entries) {
      if (!e.key.startsWith(prefix)) continue;
      const short = e.key.slice(prefix.length);
      let key = short;
      if (L.hasType(spec.type)) { const r = L.tryResolveKey(spec.type, short); key = r.error ? short : r.key; }
      spec.where[key] = e.value.v;
      if (e.value.kind === 'ref') spec.whereRef.add(key);
    }
    return spec;
  }

  _resolveQuestion(session, wire) {
    const spec = this._questionSpec(wire);
    const st = { depth: 0, visited: 0, ops: [] };
    const envelope = this._ask(session, spec, st);
    const answer = this._writeAnswer(session, wire, envelope, spec);
    return { kind: 'question', wire, spec, envelope, answer, ops: st.ops, status: envelope.status };
  }

  /** Core question resolution (modes value/exists/list/count). */
  _ask(session, rawSpec, st) {
    const L = this.legends;
    if (st.depth > this.maxDepth) return { status: 'budget', note: 'recursion depth limit reached' };
    const type = rawSpec.type;
    if (!type || !L.hasType(type)) return { status: 'unsupported', note: `unknown type '${type}'` };
    let seek = null;
    if (rawSpec.seek) {
      const r = L.tryResolveKey(type, rawSpec.seek);
      if (r.error) return { status: 'unsupported', note: r.error };
      seek = r.key;
    }
    const where = {};
    for (const [k, v] of Object.entries(rawSpec.where ?? {})) {
      const r = L.tryResolveKey(type, k);
      if (r.error) return { status: 'unsupported', note: r.error };
      where[r.key] = String(v).replace(/^\$/, '');
    }
    const spec = { ...rawSpec, seek, where, mode: rawSpec.mode ?? 'value' };
    let about = null;
    if (spec.about) {
      about = session.memory.get(String(spec.about).replace(/^\$/, ''));
      if (!about) return { status: 'missing', missing: ['about'], note: `unknown wire '${spec.about}'`, via: 'core.lookup' };
      for (const e of about.entries) if (!e.key.startsWith('core.') && !(e.key in where)) where[e.key] = e.value.v;
    }
    const info = seek ? L.keyInfo(seek) : null;
    const ask = info?.ask;
    const matches = () => {
      const ws = about ? [about] : session.memory.find(type, where);
      this._charge(st, ws.length);
      return seek ? ws.filter((w) => w.entries.some((e) => e.key === seek)) : ws;
    };
    const ops = seek ? this.set.operationsFor(seek).filter((o) => o.semantics !== 'action') : [];
    const tried = new Set();
    let soft = null;
    const runOps = () => {
      for (const op of ops) {
        if (tried.has(op.id)) continue;
        tried.add(op.id);
        const env = this._runOp(session, op, spec, where, st);
        if (env.status === 'supported' || FINAL_SOFT.has(env.status)) return env;
        soft = soft && soft.status !== 'unsupported' ? soft : env;
      }
      return null;
    };
    const missing = () => {
      if (soft?.status === 'unsupported' && !soft.missing) return { ...soft };
      return { status: 'missing', missing: soft?.missing?.length ? soft.missing : (seek ? [seek] : []), ask, note: soft?.note, from: soft?.from, via: soft?.via ?? 'core.lookup' };
    };

    switch (spec.mode) {
      case 'count': {
        const ws = matches();
        if (ws.length) return { status: 'supported', value: ws.length, from: ws.map((w) => w.id), via: 'core.lookup' };
        return L.isClosed(type) ? { status: 'supported', value: 0, via: 'core.lookup' } : missing();
      }
      case 'exists': {
        const ws = matches();
        if (ws.length) return { status: 'supported', value: 'yes', from: ws.map((w) => w.id), via: 'core.lookup' };
        const r = seek ? runOps() : null;
        if (r?.status === 'supported') return { ...r, value: 'yes' };
        if (r) return r;
        return L.isClosed(type) ? { status: 'supported', value: 'no', via: 'core.lookup' } : { ...missing(), value: 'unknown' };
      }
      case 'value':
      case 'list': {
        if (!seek) return { status: 'unsupported', note: 'no key is sought' };
        if (info.compute && ops.length) { const r = runOps(); if (r) return r; }
        const ws = matches();
        const distinct = new Map();
        for (const w of ws) for (const e of w.entries) {
          if (e.key !== seek) continue;
          const d = distinct.get(e.value.v) ?? { value: L.decode(info, e.value), from: [] };
          d.from.push(w.id);
          distinct.set(e.value.v, d);
        }
        const found = [...distinct.values()];
        if (found.length) {
          const from = [...new Set(found.flatMap((d) => d.from))];
          if (spec.mode === 'list') return { status: 'supported', values: found.map((d) => d.value), from, via: 'core.lookup' };
          if (found.length === 1) return { status: 'supported', value: found[0].value, from, via: 'core.lookup' };
          return { status: 'conflicting', alternatives: found.map((d) => d.value), from, via: 'core.lookup' };
        }
        const r = runOps();
        if (r) return r;
        return missing();
      }
      default:
        return { status: 'unsupported', note: `unknown mode '${spec.mode}'` };
    }
  }

  _charge(st, n) {
    st.visited += n;
    if (st.visited > this.maxVisited) throw new BudgetError(`visited more than ${this.maxVisited} wires`);
  }

  // ---- operations ------------------------------------------------------

  /** Call an operation and normalize its result into an envelope. */
  _runOp(session, op, spec, where, st, extraArgs = {}) {
    const world = this.set.get(op.worldId);
    const fn = world?.ops?.[op.impl];
    const t0 = performance.now();
    const rec = { op: op.id, status: 'error', ms: 0 };
    st.ops.push(rec);
    const finish = (env) => { rec.status = env.status; rec.ms = Math.round((performance.now() - t0) * 100) / 100; return { ...env, via: op.id }; };
    if (typeof fn !== 'function') return finish({ status: 'error', note: `operation ${op.id}: ops.mjs of '${op.worldId}' has no export '${op.impl}'` });
    const args = { ...extraArgs };
    const keyName = (k) => this.legends.keyInfo(k)?.name ?? k.split('.').pop();
    for (const [k, v] of Object.entries(where)) args[keyName(k)] = v;
    args.question = spec.wire;
    rec.args = Object.fromEntries(Object.entries(args).filter(([k]) => k !== 'question' && k !== 'request'));
    const budget = { deadline: t0 + this.opTimeoutMs };
    const ctx = this._makeCtx(session, op, st, budget);
    let res;
    try {
      res = fn(ctx, args);
      if (res && typeof res.then === 'function') throw new Error('operations must be synchronous');
    } catch (e) {
      if (e instanceof BudgetError) return finish({ status: 'budget', note: e.message });
      return finish({ status: 'error', note: `${op.id} threw: ${e?.message ?? e}` });
    }
    if (!res || typeof res !== 'object' || !STATUSES.has(res.status)) {
      return finish({ status: 'error', note: `${op.id} returned an invalid result envelope` });
    }
    return finish({ ...res, from: res.from ? [...res.from] : undefined });
  }

  /** The ctx object handed to operations (spec 04 ctx API). */
  _makeCtx(session, op, st, budget) {
    const L = this.legends;
    const mem = session.memory;
    const check = () => { if (performance.now() > budget.deadline) throw new BudgetError(`operation ${op.id} exceeded ${this.opTimeoutMs} ms`); };
    const resolveWhere = (type, where = {}) => {
      const out = {};
      for (const [k, v] of Object.entries(where)) out[L.resolveKey(type, k)] = String(v).replace(/^\$/, '');
      return out;
    };
    const seqOf = (w) => { const e = w.entries.find((x) => x.key === 'core.seq'); return e ? Number(e.value.v) : -Infinity; };
    const ctx = {
      find: (type, where) => { check(); const r = mem.find(type, resolveWhere(type, where)); this._charge(st, r.length); return r; },
      ordered: (type, where) => {
        const r = ctx.find(type, where);
        return r.map((w, i) => ({ w, i })).sort((a, b) => (seqOf(a.w) - seqOf(b.w)) || (a.i - b.i)).map((x) => x.w);
      },
      get: (id) => mem.get(String(id).replace(/^\$/, '')),
      val: (wire, key) => {
        const r = L.tryResolveKey(wire.type, key);
        if (r.error) return undefined;
        const e = wire.entries.find((x) => x.key === r.key);
        return e ? L.decode(r.info, e.value) : undefined;
      },
      vals: (wire, key) => {
        const r = L.tryResolveKey(wire.type, key);
        if (r.error) return [];
        return wire.entries.filter((x) => x.key === r.key).map((e) => L.decode(r.info, e.value));
      },
      ask: (spec) => {
        check();
        st.depth++;
        try { return this._ask(session, { type: spec.type, seek: spec.seek, where: spec.where, mode: spec.mode ?? 'value', about: spec.about, wire: spec.wire }, st); }
        catch (e) { if (e instanceof BudgetError) return { status: 'budget', note: e.message }; throw e; }
        finally { st.depth--; }
      },
      emit: (sopText) => {
        if (op.semantics !== 'action') throw new Error(`operation ${op.id} is not an action and may not emit wires`);
        return this._emit(session, op, sopText);
      },
      state: (session.state[op.worldId] ??= {}),
      /** Queue a client-side effect (spec 07). Actions only. Returned by session.send() as `effects`. */
      effect: (name, args = {}) => {
        if (op.semantics !== 'action') throw new Error(`operation ${op.id} is not an action and may not queue effects`);
        session.effects.push({ name: String(name), args: structuredClone(args), world: op.worldId });
      },
      /** Call another world's action operation (by action name or operation id). Actions only. Returns its envelope. */
      request: (action, args = {}) => {
        if (op.semantics !== 'action') throw new Error(`operation ${op.id} is not an action and may not call requests`);
        check();
        if (st.depth > this.maxDepth) return { status: 'budget', note: 'recursion depth limit reached' };
        const target = this._actionOp(action);
        if (!target) return { status: 'unsupported', note: `no operation for action '${action}'` };
        st.depth++;
        try { return this._runOp(session, target, { wire: null, action, args, where: {}, mode: 'value' }, {}, st, { ...args }); }
        finally { st.depth--; }
      },
      /** Pattern examples of a loaded world: [{ id, kind, priority, examples }] (read-only). */
      patterns: (worldId) => (this.set.get(worldId)?.patterns ?? []).map((p) => ({ id: p.id, kind: p.kind, priority: p.priority, examples: [...p.examples] })),
      /** Words of a lexicon (by lexicon id, e.g. 'lex.kids.animals.names'); [] when unknown. */
      lexicon: (id) => { const l = this.set.list().flatMap((w) => w.lexicons).find((x) => x.id === id); return l ? [...l.words] : []; },
      ask_text: (key) => L.keyInfo(key)?.ask,
      name: (id) => this.renderer.nameOf(mem, String(id).replace(/^\$/, '')),
      /** List the loaded worlds: [{ id, title, status, doc }]. Browser-safe, read-only. */
      worlds: () => this.set.list().map((w) => ({ id: w.id, title: w.title, status: w.status, doc: w.doc })),
    };
    return ctx;
  }

  /** The action operation (semantics=action) whose id or action name is `action`. */
  _actionOp(action) {
    return this.set.list().flatMap((w) => w.operations).find((o) => o.semantics === 'action' && (o.id === action || o.action === action));
  }

  /**
   * Modal input (spec 07 section 2): offer `text` to the `interceptInput(ctx, text)` export of every
   * world whose state has a truthy `inputMode`. The first `{ handled: true, reply? }` wins.
   * @returns {{ worldId, reply?: string } | null}
   */
  intercept(session, text) {
    for (const w of this.set.list()) {
      if (typeof w.ops?.interceptInput !== 'function' || !session.state[w.id]?.inputMode) continue;
      const op = { id: `op.${w.id}.interceptInput`, worldId: w.id, semantics: 'action' };
      const st = { depth: 0, visited: 0, ops: [] };
      const ctx = this._makeCtx(session, op, st, { deadline: performance.now() + this.opTimeoutMs * 5 });
      let res;
      try { res = w.ops.interceptInput(ctx, text); } catch (e) { res = { handled: true, reply: `Something went wrong while I handled that (${e?.message ?? e}).` }; }
      if (res?.handled) return { worldId: w.id, reply: res.reply, ops: st.ops };
    }
    return null;
  }

  _emit(session, op, sopText) {
    const ids = new Map();
    const text = sopText.replace(/\{(_\d*)\}/g, (_m, n) => { if (!ids.has(n)) ids.set(n, session.form.freshId('w')); return ids.get(n); });
    const { wires, errors } = parse(text, { source: op.id });
    if (errors.length) throw new Error(`emit: ${errors[0].message}`);
    const out = [];
    for (const w of wires) {
      const { wire, errors: e1 } = this.legends.normalizeWire(w);
      const e2 = e1.length ? [] : this.legends.validateWire(wire, { lookup: (id) => session.memory.get(id) });
      const all = [...e1, ...e2];
      if (all.length) throw new Error(`emit: ${all[0].message}`);
      wire.entries.push({ key: 'core.via', value: ref(op.id) }, { key: 'core.seq', value: atom(session.form.nextSeq()) });
      out.push(wire);
    }
    session.add(out);
    return out.map((w) => w.id);
  }

  // ---- requests --------------------------------------------------------

  _resolveRequest(session, wire) {
    const action = get(wire, 'core.request.action')?.v;
    const args = {};
    const prefix = 'core.request.arg.';
    for (const e of wire.entries) if (e.key.startsWith(prefix)) args[e.key.slice(prefix.length)] = e.value.v;
    const st = { depth: 0, visited: 0, ops: [] };
    const op = this.set.list().flatMap((w) => w.operations).find((o) => o.semantics === 'action' && (o.id === action || o.action === action));
    const spec = { wire, action, args, where: {}, mode: 'value' };
    let envelope;
    if (!op) envelope = { status: 'unsupported', note: `no operation for action '${action}'` };
    else envelope = this._runOp(session, op, spec, {}, st, { ...args, request: wire });
    spec.op = op;
    const answer = this._writeAnswer(session, wire, envelope, spec);
    return { kind: 'request', wire, spec, envelope, answer, ops: st.ops, status: envelope.status };
  }

  // ---- answers ---------------------------------------------------------

  _writeAnswer(session, qwire, env, spec) {
    const L = this.legends;
    const info = spec.seek ? L.keyInfo(spec.seek) : null;
    const asValue = (v) => {
      if (info?.value?.ref && typeof v === 'string') return ref(v);
      const s = String(v);
      return SAFE_ATOM.test(s) ? atom(s) : str(s);
    };
    const pairs = [['core.answer.to', ref(qwire.id)]];
    if (env.value !== undefined) pairs.push(['core.answer.value', asValue(env.value)]);
    for (const v of env.values ?? []) pairs.push(['core.answer.value', asValue(v)]);
    if (env.unit) pairs.push(['core.answer.unit', atom(env.unit)]);
    for (const v of env.alternatives ?? []) pairs.push(['core.answer.alternative', asValue(v)]);
    for (const m of env.missing ?? []) pairs.push(['core.answer.missing', atom(m)]);
    if (env.note) pairs.push(['core.answer.note', str(env.note)]);
    pairs.push(['core.status', atom(env.status)]);
    if (env.via) pairs.push(['core.via', ref(env.via)]);
    for (const f of env.from ?? []) pairs.push(['core.from', ref(f)]);
    pairs.push(['core.seq', atom(session.form.nextSeq())]);
    const wire = makeWire(session.nextAnswerId(), 'core.answer', pairs);
    session.add([wire]);
    return wire;
  }

  // ---- rendering -------------------------------------------------------

  /** Render the result of resolve() into English using world templates. */
  render(session, result) {
    const { envelope: env, spec } = result;
    const L = this.legends;
    const R = this.renderer;
    const mem = session.memory;
    const vars = {};
    const info = spec.seek ? L.keyInfo(spec.seek) : null;
    const put = (name, v, isRef) => { vars[name] = isRef ? { ref: v, text: v, raw: v } : { text: String(v), raw: v }; };
    if (result.kind === 'question') {
      for (const [k, v] of Object.entries(spec.where)) put(L.keyInfo(k)?.name ?? k.split('.').pop(), String(v).replace(/^\$/, ''), spec.whereRef.has(k) || !!mem.get(String(v)));
      if (spec.about) {
        const w = mem.get(String(spec.about).replace(/^\$/, ''));
        for (const e of w?.entries ?? []) if (!e.key.startsWith('core.')) put(L.keyInfo(e.key)?.name ?? e.key.split('.').pop(), e.value.v, e.value.kind === 'ref');
      }
    } else {
      for (const [k, v] of Object.entries(spec.args)) put(k, v, !!mem.get(v));
    }
    const isRef = !!info?.value?.ref;
    if (env.value !== undefined) { vars.value = isRef ? { ref: env.value, text: String(env.value), raw: env.value } : { text: String(env.value), raw: env.value }; if (typeof env.value === 'number') vars.value.raw = env.value; }
    if (env.values) vars.values = { items: env.values.map((v) => (isRef ? { ref: v } : { text: String(v) })) };
    if (env.alternatives) vars.alternatives = { items: env.alternatives.map((v) => (isRef ? { ref: v } : { text: String(v) })) };
    if (env.unit) vars.unit = { text: env.unit, raw: env.unit };
    if (env.ask) vars.ask = { text: env.ask };
    if (env.missing) vars.missing = { items: env.missing.map((m) => ({ text: m })) };
    if (env.note) vars.note = { text: env.note };

    const action = result.kind === 'request' ? (spec.op?.action ?? spec.action) : null;
    const fors = result.kind === 'request'
      ? [spec.op?.id, action && 'action.' + action, spec.action && 'action.' + spec.action]
      : [env.via && env.via !== 'core.lookup' ? env.via : null, spec.seek];
    const mode = result.kind === 'question' ? spec.mode : 'value';
    for (const t of R.pick(fors, env.status, mode)) {
      const text = R.fill(t.text, vars, mem);
      if (text !== null) return text;
    }
    return fallbackText(env, { mode, ask: env.ask });
  }

  /** Acknowledge statement wires with ack.<type> templates (fallback "OK."). */
  renderAck(session, wires) {
    const L = this.legends;
    const R = this.renderer;
    const out = [];
    for (const w of wires) {
      if (w.type.startsWith('core.')) continue;
      const vars = {};
      for (const e of w.entries) {
        if (e.key.startsWith('core.')) continue;
        const name = L.keyInfo(e.key)?.name ?? e.key.split('.').pop();
        vars[name] = e.value.kind === 'ref' ? { ref: e.value.v, text: e.value.v, raw: e.value.v } : { text: e.value.v, raw: e.value.v };
      }
      let text = null;
      for (const t of L.chain(w.type)) {
        for (const tpl of R.pick(['ack.' + t], 'supported', 'value')) { text = R.fill(tpl.text, vars, session.memory); if (text !== null) break; }
        if (text !== null) break;
      }
      out.push(text ?? 'OK.');
    }
    const uniq = out.filter((t, i) => !(t === 'OK.' && out.indexOf('OK.') !== i));
    return uniq.length ? uniq.join(' ') : 'OK.';
  }
}

/** Create an interpreter for a loaded WorldSet. */
export function createInterpreter(set, opts) { return new Interpreter(set, opts); }
export { fallbackText, listText };
