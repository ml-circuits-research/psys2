// SPDX-License-Identifier: AGPL-3.0-only
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
import { guard, TurnAborted } from '../formalizer/guard.mjs?v=ded769d6bc';
import { budget, isBudgetExceeded } from '../dialog/budget.mjs?v=123c3e1329';
import { parse, makeWire, atom, str, ref, get } from '../soplang/index.mjs?v=26885599a7';
import { Memory, WireStore } from './memory.mjs?v=8f815b84fc';
import { Renderer, fallbackText, listText } from './render.mjs?v=237d079f93';
import { FormSession } from '../formalizer/rules/session.mjs?v=e445741b59';
import { makeLang } from './lang.mjs?v=512d13f1bb';

export { Memory, WireStore } from './memory.mjs?v=8f815b84fc';
export { Renderer } from './render.mjs?v=237d079f93';

const STATUSES = new Set(['supported', 'missing', 'conflicting', 'ambiguous', 'unsupported', 'budget', 'error']);
/**
 * Why an envelope is `unsupported` or `error` (spec 04, ADR-005 amendment). An operation may set `reason` itself; otherwise
 * it is derived: errors are `execution_error`; interpreter-level `unsupported` (no operation, unknown type or mode) is
 * `unsupported_operation`; an operation's refusal is `unknown_argument` when its note says a named thing is not known
 * and `precondition_failed` otherwise (the reading is right, the state or a limit refuses it).
 */
export const REASONS = ['precondition_failed', 'unknown_argument', 'unsupported_operation', 'execution_error'];
const UNKNOWN_NOTE = /\b(i do not (know|have|speak)|unknown|does not look like|not hours|not an hour|i only know)\b/i;
export function reasonOf(env, fromOp = false) {
  if (!env) return null;
  if (env.status === 'error') return 'execution_error';
  if (env.status !== 'unsupported') return env.reason ?? null;
  if (REASONS.includes(env.reason)) return env.reason;
  if (!fromOp) return 'unsupported_operation';
  return UNKNOWN_NOTE.test(env.note ?? '') ? 'unknown_argument' : 'precondition_failed';
}
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
    /** The library World of this session (spec 15) when the engine runs with reasoner=matrix and a world opted in; null otherwise. */
    this.rs = interp.reasoner?.session() ?? null;
    // Tool worlds export initialState() from ops.mjs; the engine seeds their state at session start.
    for (const w of interp.set.list()) {
      if (typeof w.ops?.initialState === 'function') this.state[w.id] = structuredClone(w.ops.initialState());
    }
  }
  /** Independent copy of the whole session (memory overlay, world state, formalizer state); the shared base and the worlds are not copied. Throws when a world state cannot be cloned. */
  clone() {
    const s = Object.create(Session.prototype);
    s.interp = this.interp; s.memory = this.memory.clone(); s.state = structuredClone(this.state);
    s.effects = structuredClone(this.effects); s.form = this.form.clone(); s._answers = this._answers;
    s.rs = this.rs?.fork() ?? null;
    return s;
  }
  /** Add wires (full keys) to working memory. */
  add(wires) { for (const w of wires) this.memory.add(w); this.rs?.tell(wires, this); }
  nextAnswerId() { return 'a' + (++this._answers); }
}

export class Interpreter {
  constructor(set, { opTimeoutMs = 200, maxDepth = 8, maxVisited = 10000, reasoner = null } = {}) {
    this.set = set;
    /** The sopworld host layer (src/reasoner) or null (the default: every world answers through its ops.mjs). */
    this.reasoner = reasoner;
    this.legends = set.legends;
    this.opTimeoutMs = opTimeoutMs;
    this.maxDepth = maxDepth;
    this.maxVisited = maxVisited;
    this.base = new WireStore();
    for (const w of set.list()) for (const k of w.kb) this.base.add(k);
    this.renderer = new Renderer(set);
    this._lang = null;
  }

  /** Shared dialogue vocabulary (yes/no, ordinals, degree, colour ...) built from the phrase groups and lexicons of `lang.common` (spec 04). */
  get lang() {
    if (!this._lang) {
      const phrases = new Map();
      for (const w of this.set.list()) for (const ph of w.phrases ?? []) phrases.set(ph.id, ph.alts.map((a) => a.join(' ')));
      this._lang = makeLang({
        phrase: (id) => phrases.get(id),
        lexicon: (id) => { const l = this.set.list().flatMap((w) => w.lexicons).find((x) => x.id === id); return l ? [...l.words] : []; },
      });
    }
    return this._lang;
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
    const envelope = (session.rs?.owns(wire) ? session.rs.resolve(wire, session) : null) ?? this._ask(session, spec, st);
    const answer = this._writeAnswer(session, wire, envelope, spec);
    return { kind: 'question', wire, spec, envelope, answer, ops: st.ops, status: envelope.status };
  }

  /** Core question resolution (modes value/exists/list/count). */
  _ask(session, rawSpec, st) {
    const L = this.legends;
    if (st.depth > this.maxDepth) return { status: 'budget', note: 'recursion depth limit reached' };
    const type = rawSpec.type;
    if (!type || !L.hasType(type)) return { status: 'unsupported', reason: 'unsupported_operation', note: `unknown type '${type}'` };
    let seek = null;
    if (rawSpec.seek) {
      const r = L.tryResolveKey(type, rawSpec.seek);
      if (r.error) return { status: 'unsupported', reason: 'unsupported_operation', note: r.error };
      seek = r.key;
    }
    const where = {};
    for (const [k, v] of Object.entries(rawSpec.where ?? {})) {
      const r = L.tryResolveKey(type, k);
      if (r.error) return { status: 'unsupported', reason: 'unsupported_operation', note: r.error };
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
        if (!seek) return { status: 'unsupported', reason: 'unsupported_operation', note: 'no key is sought' };
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
        return { status: 'unsupported', reason: 'unsupported_operation', note: `unknown mode '${spec.mode}'` };
    }
  }

  _charge(st, n) {
    st.visited += n;
    budget.tick('interpreter.visit', n);
    guard.check('interpreter');
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
    const finish = (env, opResult = false) => {
      rec.status = env.status; rec.ms = Math.round((performance.now() - t0) * 100) / 100;
      const out = { ...env, via: op.id };
      const reason = reasonOf(env, opResult);
      if (reason) { out.reason = reason; rec.reason = reason; }
      return out;
    };
    if (typeof fn !== 'function') return finish({ status: 'error', note: `operation ${op.id}: ops.mjs of '${op.worldId}' has no export '${op.impl}'` });
    const args = { ...extraArgs };
    const keyName = (k) => this.legends.keyInfo(k)?.name ?? k.split('.').pop();
    for (const [k, v] of Object.entries(where)) args[keyName(k)] = v;
    args.question = spec.wire;
    rec.args = Object.fromEntries(Object.entries(args).filter(([k]) => k !== 'question' && k !== 'request'));
    const limit = { deadline: t0 + this.opTimeoutMs };
    const ctx = this._makeCtx(session, op, st, limit);
    let res;
    try {
      res = fn(ctx, args);
      if (res && typeof res.then === 'function') throw new Error('operations must be synchronous');
    } catch (e) {
      if (e instanceof TurnAborted || isBudgetExceeded(e)) throw e;
      if (e instanceof BudgetError) return finish({ status: 'budget', note: e.message });
      return finish({ status: 'error', note: `${op.id} threw: ${e?.message ?? e}` });
    }
    if (!res || typeof res !== 'object' || !STATUSES.has(res.status)) {
      return finish({ status: 'error', note: `${op.id} returned an invalid result envelope` });
    }
    return finish({ ...res, from: res.from ? [...res.from] : undefined }, true);
  }

  /** The ctx object handed to operations (spec 04 ctx API). */
  _makeCtx(session, op, st, limit) {
    const L = this.legends;
    const mem = session.memory;
    const check = () => { budget.tick('ops.call'); guard.check('interpreter'); if (performance.now() > limit.deadline) throw new BudgetError(`operation ${op.id} exceeded ${this.opTimeoutMs} ms`); };
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
      /** The compute budget of the turn: operations with their own loops call `ctx.budget.tick('<world>.<site>', n)` (spec 06 "Compute budgets"). */
      budget,
      /** Retract a session wire (actions only): core.status=retracted; excluded from find/lookup, kept for the trace. */
      retract: (wireId, reason = '') => {
        if (op.semantics !== 'action') throw new Error(`operation ${op.id} is not an action and may not retract wires`);
        return mem.retract(String(wireId).replace(/^\$/, ''), reason);
      },
      state: (session.state[op.worldId] ??= {}),
      /** Where the command stands in its message: { index, count } (index = executed segments before it), or null outside a dialog message. Spec 04. */
      batch: session.batch ?? null,
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
        if (!target) return { status: 'unsupported', reason: 'unsupported_operation', note: `no operation for action '${action}'` };
        if (session.rs) session.rs.live = { request: (a, args2) => this.runAction(session, a, args2), batch: session.batch ?? null };
        const viaLibrary = session.rs?.request(action, args, session);   // an action the matrix reasoner answers (spec 15) is answered by it whoever asks
        if (viaLibrary) { session.rs.syncTo(session); this._libraryExtras(session, viaLibrary, action); return viaLibrary; }
        st.depth++;
        try { return this._runOp(session, target, { wire: null, action, args, where: {}, mode: 'value' }, {}, st, { ...args }); }
        finally { st.depth--; }
      },
      /** Read-only copy of another world's state (null when it has none); lets help and status worlds look at the app. */
      peek: (worldId) => { const st0 = session.state[worldId]; return st0 ? structuredClone(st0) : null; },
      /** Pattern examples of a loaded world: [{ id, kind, priority, examples }] (read-only). */
      patterns: (worldId) => (this.set.get(worldId)?.patterns ?? []).map((p) => ({ id: p.id, kind: p.kind, priority: p.priority, examples: [...p.examples], canonical: [...(p.canonical ?? [])] })),
      /** Words of a lexicon (by lexicon id, e.g. 'lex.kids.animals.names'); [] when unknown. */
      lexicon: (id) => { const l = this.set.list().flatMap((w) => w.lexicons).find((x) => x.id === id); return l ? [...l.words] : []; },
      /** Shared vocabulary of lang.common: yesNo, unsure, cancel, stripLead, ordinal, degree, colour, size, position ... */
      lang: this.lang,
      ask_text: (key) => L.keyInfo(key)?.ask,
      name: (id) => this.renderer.nameOf(mem, String(id).replace(/^\$/, '')),
      /** List the loaded worlds: [{ id, title, summary, status, doc }]. Browser-safe, read-only. */
      worlds: () => this.set.list().map((w) => ({ id: w.id, title: w.title, summary: w.summaryPhrase, status: w.status, doc: w.doc, tab: w.tab })),
    };
    return ctx;
  }

  /** What an action of the library asks of the host besides its answer: the tab to bring forward (`openTab`) and the client-side effects it queues (`effects`: [{ name, args }]). */
  _libraryExtras(session, env, action) {
    if (env.openTab) { this.runAction(session, 'ui.openTab', { tab: env.openTab }); delete env.openTab; }
    if (Array.isArray(env.effects)) {
      const world = session.rs?.reasoner.ownerOfAction(action) ?? null;
      for (const e of env.effects) session.effects.push({ name: String(e.name), args: structuredClone(e.args ?? {}), world });
      delete env.effects;
    }
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
      if (session.rs && w.undoAction && /^(?:undo(?: that)?|scratch that)[.!]*$/i.test(String(text).trim())) continue;   // matrix mode: the library takes the last step back (spec 15), not the world's own history
      const op = { id: `op.${w.id}.interceptInput`, worldId: w.id, semantics: 'action' };
      const st = { depth: 0, visited: 0, ops: [] };
      const ctx = this._makeCtx(session, op, st, { deadline: performance.now() + this.opTimeoutMs * 5 });
      let res;
      try { res = w.ops.interceptInput(ctx, text); } catch (e) { res = { handled: true, reply: `Something went wrong while I handled that (${e?.message ?? e}).` }; }
      if (res?.handled) {
        const refused = session.rs?.adoptState(session, w.id);   // the answer to an interview question is a statement too: the library takes it over or refuses it with the reason
        return { worldId: w.id, reply: refused ? `That does not add up. ${refused.why}` : res.reply, ops: st.ops };
      }
    }
    return null;
  }

  /**
   * Observation hook (spec 07 §1): run `onObservation(ctx, obs)` of world `worldId` as an action context.
   * @returns {{ reply?: string } | null}
   */
  observe(session, worldId, obs) {
    const w = this.set.get(worldId);
    if (typeof w?.ops?.onObservation !== 'function') return null;
    const op = { id: `op.${w.id}.onObservation`, worldId: w.id, semantics: 'action' };
    const st = { depth: 0, visited: 0, ops: [] };
    const ctx = this._makeCtx(session, op, st, { deadline: performance.now() + this.opTimeoutMs * 5 });
    try {
      const out = w.ops.onObservation(ctx, obs) ?? null;
      session.rs?.adoptState(session);   // a world whose state the library takes over (`adopt`) sees what the observation changed (the engine's move)
      return out;
    } catch (e) { return { reply: `Something went wrong while I handled the result of ${obs.effect} (${e?.message ?? e}).` }; }
  }

  /**
   * Read-only world hook (spec 11): call the plain export `name(ctx, args)` of world `worldId`'s ops.mjs with a query ctx
   * (no emit, effects or requests). `state` overrides the world state seen by the hook (a snapshot, for undo and repairs).
   * Returns undefined when the world has no such export or it throws.
   */
  hook(session, worldId, name, args = {}, { state = null } = {}) {
    const w = this.set.get(worldId);
    const fn = w?.ops?.[name];
    if (typeof fn !== 'function') return undefined;
    const op = { id: `op.${w.id}.${name}`, worldId: w.id, semantics: 'query' };
    const st = { depth: 0, visited: 0, ops: [] };
    const ctx = this._makeCtx(session, op, st, { deadline: performance.now() + this.opTimeoutMs * 5 });
    if (state) ctx.state = structuredClone(state);
    try { return fn(ctx, args); } catch { return undefined; }
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

  /**
   * Run an action operation on behalf of the host or the dialog layer (no wire, no answer record), for example
   * `ui.openTab` when a tool world answered while its tab was hidden. Returns the envelope.
   */
  runAction(session, action, args = {}) {
    const op = this._actionOp(action);
    if (!op) return { status: 'unsupported', reason: 'unsupported_operation', note: `no operation for action '${action}'` };
    const st = { depth: 0, visited: 0, ops: [] };
    return this._runOp(session, op, { wire: null, action, args, where: {}, mode: 'value' }, {}, st, { ...args });
  }

  _resolveRequest(session, wire) {
    const action = get(wire, 'core.request.action')?.v;
    const args = {};
    const prefix = 'core.request.arg.';
    for (const e of wire.entries) if (e.key.startsWith(prefix)) args[e.key.slice(prefix.length)] = e.value.v;
    const st = { depth: 0, visited: 0, ops: [] };
    const op = this.set.list().flatMap((w) => w.operations).find((o) => o.semantics === 'action' && (o.id === action || o.action === action));
    const spec = { wire, action, args, where: {}, mode: 'value' };
    if (session.rs) session.rs.live = { request: (a, args) => this.runAction(session, a, args), batch: session.batch ?? null };   // offered to the library's actions while they run
    let envelope = session.rs?.owns(wire) ? session.rs.resolve(wire, session) : null;
    if (envelope) {
      session.rs.syncTo(session);   // answered by the library (spec 15); what its actions wrote is copied to the session memory
      this._libraryExtras(session, envelope, action);   // a game's action brings its tab forward, as its operation did, and queues the effects it asked for
    }
    else if (!op) envelope = { status: 'unsupported', reason: 'unsupported_operation', note: `no operation for action '${action}'` };
    else if (op && (envelope = session.rs?.guardRequest(session, op.worldId, action, args) ?? null)) {   // a world's rules say the target does not exist (spec 15, `guard`)
      envelope = { ...envelope, reason: envelope.reason ?? 'precondition_failed', from: [] };
    } else {
      envelope = this._runOp(session, op, spec, {}, st, { ...args, request: wire });
      // a world whose operations keep their own state (spec 15, `adopt`): the library takes over what they did, or refuses it with the reason
      const refused = session.rs?.adoptState(session, op.worldId);
      if (refused) envelope = { status: 'conflicting', reason: 'precondition_failed', why: refused.why, note: `That does not add up. ${refused.why}`, from: [] };
    }
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
    if (env.reason) pairs.push(['core.answer.reason', atom(env.reason)]);
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
    if (env.why) vars.why = { text: env.why };
    // the other keys of the library's answer wire (or of the wires a refusal rests on): the matrix says what it knows, the templates say how
    for (const [k, v] of Object.entries(env.vars ?? {})) if (!(k in vars)) put(k, v, !!mem.get(v));

    const action = result.kind === 'request' ? (spec.op?.action ?? spec.action) : null;
    const fors = result.kind === 'request'
      ? [spec.op?.id, action && 'action.' + action, spec.action && 'action.' + spec.action]
      : [env.via && env.via !== 'core.lookup' ? env.via : null, spec.seek];
    const mode = result.kind === 'question' ? spec.mode : 'value';
    // an answer that rests on an assumed value (matrix reasoner, spec 15) says so once, after the answer
    const said = (text) => (env.assumed && env.status === 'supported' ? `${text} ${env.assumed}` : text);
    for (const t of R.pick(fors, env.status, mode, vars)) {
      const text = R.fill(t.text, vars, mem);
      if (text !== null) return said(text);
    }
    return said(fallbackText(env, { mode, ask: env.ask }));
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
        for (const tpl of R.pick(['ack.' + t], 'supported', 'value', vars)) { text = R.fill(tpl.text, vars, session.memory); if (text !== null) break; }
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
