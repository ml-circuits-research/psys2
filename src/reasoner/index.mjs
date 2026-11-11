// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Reasoner host layer (spec 15). Browser-safe: no `node:*` imports. A thin adapter between the interpreter and the vendored
 * sopworld library (src/vendor/sopworld), not a second interpreter:
 *
 *   const reasoner = await createReasoner(set);        // null when no loaded world says reasoner=matrix
 *   const rs = reasoner.session();                     // one library World per dialogue session
 *   rs.tell(wires)                                     // session wires, as the dialogue produces them
 *   rs.resolve(wire, session)                          // a core.question / core.request wire -> our result envelope, or null (not ours)
 *   rs.fork()                                          // dry runs, validation and snapshots
 *
 * What the library gets: `worlds/core/mapping.sop` (how it reads our legends), the legends of the matrix worlds and their imports as they are,
 * the knowledge bases, the matrices (`matrix.sop`) and the functions (`fns.mjs`) of the worlds that opt in. Reply wording stays in our templates.
 */
import { serialize, parse as parseOurs, ref as refValue, atom as atomValue, str as strValue } from '../soplang/index.mjs';
import { budget as turnBudget } from '../dialog/budget.mjs';

/** Types the dialogue produces that the library must never be told (they are asked, not stated). */
const NOT_FACTS = new Set(['core.question', 'core.request', 'core.answer', 'core.observation']);
/** The library's statuses mapped to ours (spec 04). `refused` (the thing asked about cannot be) is our `conflicting`. */
const STATUS = { supported: 'supported', conflicting: 'conflicting', ambiguous: 'ambiguous', missing: 'missing', refused: 'conflicting', unsupported: 'unsupported', no: 'supported', unknown: 'missing', budget: 'budget' };
const keyName = (k) => String(k).split('.').pop();
const bare = (v) => String(v).replace(/^\$/, '');
const unquote = (v) => { const s = String(v); return s.length > 1 && s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s; };
const first = (a) => (Array.isArray(a) ? a[0] : a);

/** An attribute map of the library ({ key: [values] }) as a flat object (first value of each key, quotes and `$` removed), without the library's bookkeeping keys. */
function flat(attrs) {
  const out = {};
  for (const [k, v] of Object.entries(attrs ?? {})) if (!k.startsWith('core.')) out[k] = unquote(bare(first(v)));
  return out;
}

/** A wire of ours ({ id, type, entries }) as the library's in-memory wire ({ id, type, attrs: { key: [token] } }). */
function libWire(lib, w) {
  const attrs = {};
  for (const e of w.entries) (attrs[e.key] ??= []).push(lib.writeValue(e.value));
  return { id: w.id, type: w.type, attrs, pattern: false };
}

/**
 * Builds the shared base World once per engine: mapping, legends in dependency order, knowledge bases, matrices. Sessions fork it.
 * Returns null when no world opts in (`reasoner=matrix` in its world.sop, with a matrix.sop).
 */
export async function createReasoner(set, { lib = null } = {}) {
  const worlds = set.list().filter((w) => w.reasoner === 'matrix' && w.raw.matrix != null);
  if (!worlds.length) return null;
  lib ??= await import('../vendor/sopworld/sopworld.mjs');
  const wanted = new Set(worlds.flatMap((w) => set.available(w.id)));
  const ordered = set.list().filter((w) => wanted.has(w.id));
  const legends = set.legends;
  const lexicon = (id) => { const l = set.list().flatMap((w) => w.lexicons).find((x) => x.id === id); return l ? [...l.words] : []; };
  /** What the host gives an action function besides the library's own context (`ctx.host`, spec 15): the lexicons, and `view(ctx)`, an ops-shaped read-only context (find, val, vals, lexicon) over the library, so the tables of a world's ops.mjs can be shared. */
  const host = {
    lexicon,
    view: (c) => {
      const key = (w, k) => { const r = legends.tryResolveKey(w.type, k); return r.error ? null : r; };
      const decode = (r, t) => legends.decode(r.info, lib.readValue(t));
      return {
        lexicon,
        find: (type, where = {}) => c.find(type, where),
        val: (w, k) => { const r = key(w, k); const t = r && w.attrs[keyName(r.key)]?.[0]; return t === undefined ? undefined : decode(r, t); },
        vals: (w, k) => { const r = key(w, k); return r ? (w.attrs[keyName(r.key)] ?? []).map((t) => decode(r, t)) : []; },
      };
    },
  };
  const fns = {};   // the worlds' action functions (the library keeps them apart from its own arithmetic)
  for (const w of worlds) for (const [name, f] of Object.entries(w.fns ?? {})) fns[name] = (c, args) => f({ ...c, host }, args);
  const base = new lib.World({ actions: fns, vocabulary: { status: 'core.status' } });
  const problems = [];
  const load = (what, text) => { if (text == null) return; const r = base.load(text); if (!r.ok) problems.push(`${what}: ${r.violations?.[0]?.kind ?? 'refused'} ${r.violations?.[0]?.why ?? r.violations?.[0]?.key ?? ''}`.trim()); };
  const mapping = set.list().map((w) => w.raw.mapping).find((t) => t != null);
  load('mapping', mapping);
  for (const w of ordered) load(`${w.id}/legend.sop`, w.raw.legend);
  for (const w of ordered) load(`${w.id}/kb.sop`, w.raw.kb);   // the knowledge bases of the matrix worlds and of what they import (games.guess reads kids.animals)
  load('user', '@e.user core.agent');   // the user is a built-in agent of every session
  // one SOP Lang parser in the product: our parser reads the matrices and the library is handed their wires
  const loadOurs = (what, text) => {
    if (text == null) return;
    const { wires, errors } = parseOurs(text, { source: what });
    if (errors.length) { problems.push(`${what}: ${errors[0].line}:${errors[0].column} ${errors[0].message}`); return; }
    load(what, wires.map((w) => libWire(lib, w)));
  };
  for (const w of worlds) loadOurs(`${w.id}/matrix.sop`, w.raw.matrix);
  const owners = worlds.map((w) => w.id).sort((a, b) => b.length - a.length);
  const actionOwner = new Map();
  for (const w of worlds) for (const o of w.operations) if (o.semantics === 'action') { actionOwner.set(o.id, w.id); if (o.action) actionOwner.set(o.action, w.id); }
  const voices = new Map(worlds.filter((w) => typeof w.voice === 'function').map((w) => [w.id, w.voice]));
  const assumedBy = new Map(worlds.filter((w) => typeof w.assumed === 'function').map((w) => [w.id, w.assumed]));
  const undoOf = new Map(worlds.filter((w) => w.undoAction).map((w) => [w.undoAction, w]));   // action -> the world whose "undo" the library answers by rewinding
  const problemOf = new Map(worlds.filter((w) => typeof w.problem === 'function').map((w) => [w.id, w.problem]));
  const whyOf = new Map(worlds.filter((w) => typeof w.whyWords === 'function').map((w) => [w.id, w.whyWords]));
  const stateOf = new Map(worlds.filter((w) => typeof w.toState === 'function').map((w) => [w.id, w.toState]));
  const mirrors = [...new Set(worlds.flatMap((w) => w.mirrors))];
  const opsKeys = new Set(worlds.flatMap((w) => w.opsKeys));   // questions the matrix leaves to the operations (world.sop `ops=`)
  const empties = new Map();
  // the matrix's own declarations of its actions (`core.action name=... ask.<key>=... template.<key>=...`): what a missing argument asks and how the answer completes the sentence
  const actions = new Map();
  for (const m of base.matrix.values()) if (m.type === 'core.action') actions.set(unquote(first(m.attrs.name)), m.attrs);
  const reasoner = {
    lib, base, voices, assumedBy, problemOf, whyOf, undoOf, mirrors, opsKeys, actions, stateOf, worlds: worlds.map((w) => w.id), problems, legends: set.legends,
    /** The matrix world that owns a question type (longest world id that prefixes it), or null. */
    ownerOfType: (type) => owners.find((id) => type === id || String(type).startsWith(id + '.')) ?? null,
    ownerOfAction: (action) => actionOwner.get(action) ?? null,
    /** The matrix world that answers a question or request wire (the state of that world comes into being with its first answer). */
    ownerOfWire: (wire) => {
      const val = (k) => wire.entries.find((e) => e.key === k)?.value?.v;
      return set.legends.isA(wire.type, 'core.question') ? reasoner.ownerOfType(val('core.question.type')) : reasoner.ownerOfAction(val('core.request.action'));
    },
    /** What a world's `toState` says of a library with nothing told (JSON): a state equal to it is not worth creating. */
    emptyState: (id) => { let e = empties.get(id); if (e === undefined) { try { e = JSON.stringify(stateOf.get(id)({ find: (t) => base.ofType(t), query: (q) => base.query(q) })); } catch { e = ''; } empties.set(id, e); } return e; },
    session: () => new ReasonerSession(reasoner, base.fork()),
  };
  return reasoner;
}

/**
 * One dialogue session on the library: one World, session wires told as they arrive. The library is the only record of what was said: undo, "that's wrong",
 * the per-world state the hooks and the dialogue layer's snapshots read (`toState`) and the session memory's mirrors are all derived from it, so they cannot diverge.
 */
export class ReasonerSession {
  constructor(reasoner, world) {
    this.reasoner = reasoner;
    this.world = world;
    this.refused = [];   // wires the library refused to take: [{ id, type, violations }], for the trace
    this.last = null;    // the last library result, for explain / why
    this.known = new Map();
    this.derived = null;         // { stamp, json }: the derived state per world for the library's current stamp
    this.completedAt = null;     // the library's stamp after the last complete defaults (null: unknown)
    this.said = new Set();       // assumed cells already said to the user (an assumption is said once)
    this.mirrored = new Map();   // id -> { text, type } of the wire last copied to the session memory
    this.told = [];              // ids of the dialogue wires the library holds, oldest first (a rewind retracts the ones that are gone from the session memory)
    this.cur = null;             // the turn in progress: { turn, mark, stamp }
    this.turns = [];             // the turns that changed the library, oldest first: { turn, mark } (the mark is the World as it was before the turn)
    this.seg = null;             // the statements of the segment in progress: { mark, clean, ids } (what a refused statement is taken back to)
    this.issueSeen = new Set();  // ids of the standing issues before the turn: an issue that appears with a statement means the statement cannot be true
  }

  /** A copy that shares the state until one of the two changes (nothing is copied). */
  fork() {
    const r = new ReasonerSession(this.reasoner, this.world.fork());
    r.refused = [...this.refused]; r.last = this.last; r.known = new Map(this.known); r.said = new Set(this.said); r.mirrored = new Map(this.mirrored); r.told = [...this.told]; r.completedAt = this.completedAt;
    r.cur = this.cur && { ...this.cur }; r.seg = this.seg && { ...this.seg, ids: [...this.seg.ids] }; r.issueSeen = new Set(this.issueSeen); r.turns = this.turns.map((t) => ({ ...t }));
    return r;
  }

  isFact(type) {
    if (NOT_FACTS.has(type)) return false;
    let k = this.known.get(type);
    if (k === undefined) { k = !!this.world.schema(type); this.known.set(type, k); }
    return k;
  }

  /** Wire (full keys) -> library wire. */
  _wire(w) {
    const L = this.reasoner.legends;
    const short = { ...w, entries: w.entries.map((e) => ({ key: L.shortKey(w.type, e.key), value: e.value })) };
    return this.reasoner.lib.parse(serialize([short]))[0];
  }

  /** Tell the session wires the library knows the type of; a wire it refuses is recorded and the world stays as it was. `session` (the interpreter session) gets the derived state. */
  tell(wires, session = null) {
    for (const w of wires) {
      if (!this.isFact(w.type) || this.world.has(w.id)) continue;
      if (!this.seg) this.seg = { mark: this.world.mark(), clean: this.world.stamp === this.cur?.stamp, ids: [] };
      this.seg.ids.push(w.id);
      let r;
      try { r = this.world.tell([this._wire(w)], { budget: this._limit() }); } catch (e) { r = { ok: false, violations: [{ kind: 'error', why: String(e?.message ?? e) }] }; }
      this._charge();
      if (!r.ok) this.refused.push({ id: w.id, type: w.type, violations: r.violations });
      else this.told.push(w.id);
    }
    this._defaults();   // a no-op while the library has not changed since the last completing
    if (session) this._state(session);   // cheap, and the session state may have been put back by a snapshot since
  }

  /** What the matrix declares as a default is applied (tier `default`) once the wires are told, so that an answer resting on it can say so. */
  _defaults() {
    if (this.world.stamp === this.completedAt) return;   // nothing changed since the last completing: it would find nothing to do
    let done = true;
    try { const r = this.world.complete({ defaults: true, budget: this._limit() }); if (r?.budget) done = false; } catch { done = false; /* a default that cannot be applied stays open */ }
    this._charge();
    this.completedAt = done ? this.world.stamp : null;   // an incomplete completing is tried again with the next budget
  }

  // ---- turns, undo, rewind ---------------------------------------------------------------------------------------------------------

  /** Start of a dialogue turn: the World as it is now is what the turn can be taken back to. */
  beginTurn(turn) { this.cur = { turn, mark: this.world.mark(), stamp: this.world.stamp }; this.seg = null; this.issueSeen = new Set(this._issues().map((i) => i.id)); }
  _issues() { return this.world.ofType('core.issue'); }
  /**
   * A statement that cannot be true (spec 11 section 12, matrix strategy): the library refused the wires of the segment (a deny: the reason is its text) or
   * accepted them and a soft constraint now stands as a new issue (the issue's `why`). The segment's facts are taken back, in the library (`rewind` to before
   * the segment's tell) and in the session memory, and the reason is returned (capitalised, with a full stop); null when the statements are fine.
   */
  refuseFacts(facts, session) {
    const seg = this.seg;
    this.seg = null;
    if (!seg) return null;
    const ids = new Set(seg.ids);
    const refused = this.refused.find((r) => ids.has(r.id));
    const added = refused ? null : this._issues().find((i) => !this.issueSeen.has(i.id));
    if (!refused && !added) { for (const i of this._issues()) this.issueSeen.add(i.id); return null; }
    let why = refused ? refused.violations?.[0]?.why : unquote(first(added.attrs.why) ?? '');
    this.refused = this.refused.filter((r) => !ids.has(r.id));
    // the world may say it in its own words (the issue and the facts are still in the library: it reads them before they are taken back)
    const hook = this.reasoner.problemOf.get(this.reasoner.ownerOfType(facts.find((w) => !w.type.startsWith('core.'))?.type));
    if (hook) {
      try {
        const issue = added && { why, key: first(added.attrs.key), aboutId: bare(first(added.attrs.about)), about: flat(this.world.get(bare(first(added.attrs.about)))?.attrs) };
        const said = hook({ why, issue, facts: facts.map((w) => ({ type: w.type, attrs: Object.fromEntries(w.entries.map((e) => [keyName(e.key), String(e.value.v)])) })), find: (t) => this.world.ofType(t), query: (q) => this.world.query(q), name: (id) => this._nameOf(id), issues: () => this._issues().map((i) => ({ why: unquote(first(i.attrs.why) ?? ''), key: first(i.attrs.key), aboutId: bare(first(i.attrs.about)), about: flat(this.world.get(bare(first(i.attrs.about)))?.attrs) })) });
        if (said) why = said;
      } catch { /* the library's reason stays */ }
    }
    this.rewind(seg.mark, session, { restart: false });
    if (seg.clean && this.cur) this.cur.stamp = this.world.stamp;   // nothing else changed the library in this turn: the turn is no action to take back
    const t = String(why || 'that cannot be true').trim().replace(/[.!?\s]+$/, '');
    return `${t.charAt(0).toUpperCase()}${t.slice(1)}.`;
  }
  /** End of a dialogue turn: a turn that changed the library is kept, with its mark (what "undo that" and the dialogue layer's undo take back). */
  commitTurn(turn) {
    const c = this.cur;
    this.cur = null;
    if (c?.turn === turn && this.world.stamp !== c.stamp) { this.turns.push({ turn, mark: c.mark }); if (this.turns.length > 12) this.turns.shift(); }
  }
  /** The library takes statements out (`retract`: what followed from them goes too) and the session memory with them; false (nothing changed) when the library will not. */
  retractFacts(ids, session, why = 'taken back') {
    const mark = this.world.mark();
    for (const id of ids) {
      if (!this.world.has(id)) continue;
      let r;
      try { r = this.world.retract(id, { budget: this._limit() }); } catch { r = { ok: false }; }
      this._charge();
      if (r.ok === false || r.violations?.length) { this.world.rewind(mark); return false; }
    }
    this.told = this.told.filter((id) => !ids.includes(id));
    for (const id of ids) session.memory.retract(id, why);
    this.syncTo(session);
    return true;
  }
  /** After a rewind the turn in progress starts again from where the library is: a pure undo then changes nothing (it is not an action to take back), a repair that tells the corrected sentence does. */
  _restart() { if (this.cur) this.cur = { turn: this.cur.turn, mark: this.world.mark(), stamp: this.world.stamp }; }
  /** The mark of a turn that changed the library (undefined for a turn that did not). */
  markOf(turn) { return this.turns.find((t) => t.turn === turn)?.mark; }
  /** Is there something told in the last few turns to take back? */
  canUndo(turn) { const t = this.turns.at(-1); return !!t && turn - t.turn <= 6; }
  /** "Undo that": the library goes back to before the last turn that changed it (everything that followed from it goes too). Returns the turn's number or null. */
  undo(session) {
    const t = this.turns.at(-1);
    if (!t) return null;
    this.rewind(t.mark, session);
    return t.turn;
  }
  /**
   * Puts the library back to a mark (library `rewind`) and the session memory with it (the dialogue wires the library no longer holds are retracted there),
   * and derives the state and the mirrors again. Returns a function that undoes the rewind (a repair of the dialogue layer gives up with it).
   */
  rewind(mark, session, { restart = true } = {}) {
    const at = this.turns.findIndex((t) => t.mark === mark);
    const dropped = at < 0 ? [] : this.turns.splice(at);
    const after = this.world.mark();
    this.world.rewind(mark);
    const told = this.told, gone = [];
    this.told = told.filter((id) => { if (this.world.has(id)) return true; const w = session.memory.get(id); if (w) gone.push(w); return false; });
    for (const w of gone) session.memory.retract(w.id, 'taken back');
    if (restart) this._restart();
    this.syncTo(session);
    return () => {
      this.world.rewind(after);
      this.told = told; this.turns.push(...dropped);
      for (const w of gone) session.memory.own.add(w);
      this._restart();
      this.syncTo(session);
    };
  }

  /** The dialogue wires an answer rests on, oldest first: [{ id, source, seq }] (the leaves of the library's explanation of each wire in `ids`). */
  leaves(ids, session) {
    const out = new Map();
    const walk = (n, depth) => {   // a depth limit and a visited map
      turnBudget.tick('sopworld.explain');
      if (!n || depth > 40 || out.has(n.id)) return;
      if (!n.from?.length || n.told) {   // a told wire is a fact of the answer even when other facts changed it (Tom has 5, then gifts and meals)
        const w = session.memory.get(n.id) ?? session.memory.get(String(n.id));
        const src = w?.entries.find((e) => e.key === 'core.source')?.value?.v;
        const seq = Number(w?.entries.find((e) => e.key === 'core.seq')?.value?.v ?? NaN);
        out.set(n.id, { id: n.id, source: src ?? null, seq: Number.isFinite(seq) ? seq : null, kb: !!n.told && !src && !!session.memory.base?.byId?.has?.(n.id) });
        if (!n.from?.length) return;
      }
      for (const c of n.from ?? []) walk(c, depth + 1);
    };
    for (const id of ids ?? []) { try { walk(this.world.explain(id), 0); } catch { /* no explanation */ } }
    return [...out.values()].sort((a, b) => (a.seq ?? 1e9) - (b.seq ?? 1e9));
  }

  /** Library budget of the next call: what is left of this turn's budget (our step budget is the library's). */
  _limit() {
    const left = turnBudget.remaining?.('sopworld') ?? Infinity;
    return Number.isFinite(left) ? { steps: Math.max(1, left) } : undefined;
  }
  /** Steps of the last library call are ticks of the turn budget, sites prefixed `sopworld.`; an excess ends the turn like any other. */
  _charge() {
    const st = this.world.stats();
    for (const [site, n] of Object.entries(st.sites ?? {})) if (n > 0) turnBudget.tick(`sopworld.${site}`, n);
  }

  /** Does the library answer this wire (a question of a matrix world's type, or a request of one's action)? */
  owns(wire) {
    const val = (k) => wire.entries.find((e) => e.key === k)?.value?.v;
    const L = this.reasoner.legends;
    if (L.isA(wire.type, 'core.question')) return !!this.reasoner.ownerOfType(val('core.question.type')) && !this.reasoner.opsKeys.has(`${val('core.question.type')}.${keyName(val('core.question.seek') ?? '')}`);
    if (L.isA(wire.type, 'core.request')) return !!this.reasoner.ownerOfAction(val('core.request.action'));
    return false;
  }

  /**
   * Answer a question or request wire. Returns an envelope (spec 04) with `via: 'core.matrix'` and, in `vars`, the other keys of the
   * answer wire (or of the wires a refusal rests on) for the templates; or null when the library does not know it (the caller falls back).
   */
  resolve(wire, session = null) {
    const undo = !this.reasoner.legends.isA(wire.type, 'core.question') && this.reasoner.undoOf.get(wire.entries.find((e) => e.key === 'core.request.action')?.value?.v);
    if (undo && session) return this.undoAction(undo, session);
    const lw = this._wire(wire);
    const isQuestion = this.reasoner.legends.isA(wire.type, 'core.question');
    const limit = this._limit();
    let r;
    try { r = isQuestion ? this.world.query(lw, { budget: limit }) : this.world.act(lw, { budget: limit }); }
    catch (e) { return { status: 'error', note: `the reasoner failed: ${e?.message ?? e}`, via: 'core.matrix' }; }
    this._charge();
    this.last = { wire: wire.id, result: r };
    if (r.status === 'unsupported' && !r.reason) return null;   // the library does not know this question (a calculation that cannot be done has a reason)
    const env = isQuestion ? this._questionEnvelope(r, lw) : this._actionEnvelope(r, wire.entries.find((e) => e.key === 'core.request.action')?.value?.v);
    const answered = this._voice(wire, env, r, isQuestion);
    if (isQuestion && r.status === 'supported' && !answered.from && r.supposed) this._restsLater(answered, r.supposed);
    if (session) this._state(session, this.reasoner.ownerOfWire?.(wire) ?? null);
    return answered;
  }

  /** An action another world asks for by name and arguments (no wire of the dialogue): its envelope when the library owns the action, else null. */
  request(action, args, session) {
    if (!this.reasoner.ownerOfAction(action)) return null;
    const value = (v) => (/^[\w.-]+$/.test(String(v)) ? atomValue(v) : strValue(v));
    const entries = [{ key: 'core.request.action', value: atomValue(action) }, ...Object.entries(args ?? {}).map(([k, v]) => ({ key: `core.request.arg.${k}`, value: value(v) }))];
    return this.resolve({ id: 'req_via_world', type: 'core.request', entries }, session);
  }

  /** A world's own "undo" action (world.sop `undo=`): the library goes back to before the last turn that changed it; the world says what that was (`undoWords`). */
  undoAction(world, session) {
    const toState = this.reasoner.stateOf.get(world.id);
    const stateNow = () => toState({ find: (t) => this.world.ofType(t), query: (q) => this.world.query(q) });
    const before = this.turns.length ? stateNow() : null;
    const turn = before ? this.undo(session) : null;
    const patch = world.undoWords?.({ before, after: before ? stateNow() : null }) ?? (before ? { value: 'OK, I took that back.' } : { status: 'missing', note: 'There is nothing to undo yet.' });
    this._state(session, world.id);
    return { via: 'core.matrix', status: 'supported', ...patch, undoneTurn: turn };
  }

  /** The owning world's `voice(ctx)` (fns.mjs) puts the words around the numbers on the envelope (`note`, `unit`, `vars`); the templates stay ours. */
  _voice(wire, env, result, isQuestion) {
    const val = (k) => wire.entries.find((e) => e.key === k)?.value?.v;
    const type = isQuestion ? val('core.question.type') : null, action = isQuestion ? null : val('core.request.action');
    const owner = isQuestion ? this.reasoner.ownerOfType(type) : this.reasoner.ownerOfAction(action);
    const voice = this.reasoner.voices.get(owner);
    if (!voice) return env;
    const pre = isQuestion ? 'core.question.where.' : 'core.request.arg.';
    const where = {};
    for (const e of wire.entries) if (e.key.startsWith(pre)) where[keyName(e.key.slice(pre.length))] = bare(e.value.v);
    // `supposed`: the answer wire as the rules left it (the keys they set); `issues`: the problems that stand in the world (soft constraints), as flat attribute maps
    const supposed = flat(result.supposed?.attrs);
    const issues = () => this.world.ofType('core.issue').map((i) => ({ why: unquote(first(i.attrs.why) ?? ''), key: first(i.attrs.key), aboutId: bare(first(i.attrs.about)), about: flat(this.world.get(bare(first(i.attrs.about)))?.attrs) }));
    let patch;
    try { patch = voice({ kind: isQuestion ? 'question' : 'request', type, action, where, env, supposed, issues, find: (t) => this.world.ofType(t), name: (id) => this._nameOf(id) }); }
    catch (e) { return { ...env, note: env.note ?? `the reply words failed: ${e?.message ?? e}` }; }
    return patch ? { ...env, ...patch } : env;
  }

  /**
   * A computed answer (a total) is worked out on a supposed wire that the library takes away again, so its `from` is empty. The facts it rests on are
   * found when someone asks ("what did you do?"): the world as it was is forked (nothing is copied) and the supposed wire is told to it again.
   * `env.fromLater()` (not enumerable, so it is not part of the envelope) returns the told dialogue-wire ids, or [].
   */
  _restsLater(env, sup) {
    const snap = this.world.fork();
    const skip = new Set(Object.keys(sup.set ?? {}));
    const attrs = Object.fromEntries(Object.entries(sup.attrs ?? {}).filter(([k]) => !skip.has(k)));
    Object.defineProperty(env, 'fromLater', { enumerable: false, value: () => {
      try {
        const id = 'why_suppose';
        const tr = snap.tell([{ id, type: sup.type, attrs, pattern: false }], { strict: false })
        if (!tr?.ok) return [];
        const out = new Set();
        const walk = (n, depth) => {
          turnBudget.tick('sopworld.explain');
          if (!n || depth > 40) return;
          if (n.told && n.id !== id) out.add(n.id);
          for (const c of n.from ?? []) walk(c, depth + 1);
        };
        walk(snap.explain(id), 0);
        for (const d of tr.derived ?? []) walk(snap.explain(d), 0);   // what a rule derived on the way (a line of the basket) can rest on a fact the sum does not name
        for (const tid of this.told) { turnBudget.tick('sopworld.explain'); const r = snap.resolve(tid); if (r !== tid && out.has(r)) out.add(tid); }   // a statement merged into an older wire of the same thing (a price told again)
        return [...out];
      } catch { return []; }
    } });
  }

  _questionEnvelope(r, lw) {
    const seek = first(lw.attrs?.seek);
    const status = STATUS[r.status] ?? 'error';
    const env = { status, via: 'core.matrix', from: r.from?.length ? [...r.from] : undefined };
    if (r.status === 'budget') { env.note = r.why ?? 'compute budget reached'; return env; }
    if (r.value !== undefined) env.value = unquote(bare(r.value));
    else if (r.status === 'no') env.value = 'no';
    if (r.values) env.values = r.values.map((v) => unquote(bare(v)));
    if (r.alternatives?.length) env.alternatives = r.alternatives.map((a) => unquote(bare(a.value ?? a)));
    if (r.missing?.length) { env.missing = r.missing.map((m) => m.key); const ask = r.missing.find((m) => m.ask)?.ask; if (ask) env.ask = ask; }
    if (r.status === 'refused') {
      // the deny's reason quotes the values it was decided on (`bindings`), and `involved` has the wires as they were before the supposition was undone
      const v = r.violations?.[0];
      env.reason = 'precondition_failed';
      env.why = v?.why;
      env.vars = {};
      for (const w of v?.involved ?? []) for (const [k, x] of Object.entries(flat(w.attrs))) if (!(k in env.vars) && k !== seek) env.vars[k] = x;
      for (const [k, x] of Object.entries(v?.bindings ?? {})) if (!k.includes('.') && !(k in env.vars)) env.vars[k] = unquote(bare(x));
    } else {
      if (r.status === 'unsupported') { env.reason = 'unsupported'; env.why = r.reason; }
      else if (r.reason) env.why = r.reason;   // what a standing issue (a soft constraint) says about the answer
      env.vars = flat(r.supposed?.attrs);
      delete env.vars[seek];
    }
    if (env.vars.unit !== undefined) { env.unit = env.vars.unit; delete env.vars.unit; }
    if (r.status === 'supported') this._assumed(env, r.rests);
    return env;
  }

  /**
   * Certainty (spec 15): an answer that rests on a value of tier `default` or `guessed` (`rests` of the library's result) says so once and records it.
   * `env.assumptions` are the cells ("w2.count=1 (default)"), `env.assumed` the sentence ("I assumed 1 ball."). The words of a cell come from the owning
   * world's `assumed(cell)` (fns.mjs): a phrase, or null for a default that is not worth saying; without one, "<key> is <value>".
   */
  _assumed(env, rests) {
    const cells = [], words = [];
    for (const c of rests ?? []) {
      if (c.tier !== 'default' && c.tier !== 'guessed') continue;
      const w = this.world.get(c.id);
      const cell = { id: c.id, key: keyName(c.key), value: unquote(bare(c.value)), tier: c.tier, type: w?.type ?? null, attrs: flat(w?.attrs), name: (id) => this._nameOf(id) };
      const hook = this.reasoner.assumedBy.get(this.reasoner.ownerOfType(cell.type));
      let said;
      try { said = hook ? hook(cell) : undefined; } catch { said = undefined; }
      const label = `${c.id}.${cell.key}=${cell.value} (${c.tier})`;
      cells.push(label);
      if (said === null || this.said.has(label)) continue;
      this.said.add(label);
      const phrase = said ?? `${cell.key} is ${cell.value}`;
      if (!words.includes(phrase)) words.push(phrase);
    }
    if (!cells.length) return;
    env.assumptions = cells;
    if (words.length) env.assumed = `I assumed ${words.length > 1 ? words.slice(0, -1).join(', ') + ' and ' + words.at(-1) : words[0]}.`;
  }

  /**
   * The acknowledgement of a statement: a value the matrix filled by default (a purchase without a count counts once) is part of what the user is told ("OK, you
   * bought 1 ball. I assumed 1 ball."). Returns { facts, assumed }: the statement wires with the defaulted keys added, and the sentence (or null). The assumption is
   * not marked as said: the first answer that rests on it still says it (spec 15, certainty).
   */
  ackExtras(facts) {
    const words = [], out = [];
    for (const w of facts) {
      const lw = this.world.get(w.id);
      if (!lw) { out.push(w); continue; }
      const have = new Set(w.entries.map((e) => keyName(e.key)));
      const extra = [];
      for (const [k, v] of Object.entries(lw.attrs ?? {})) {
        turnBudget.tick('sopworld.explain');
        const name = keyName(k);
        if (name.startsWith('core') || have.has(name) || this.world.tier(lw.id, k) !== 'default') continue;
        const value = unquote(bare(first(v)));
        const hook = this.reasoner.assumedBy.get(this.reasoner.ownerOfType(lw.type));
        let said;
        try { said = hook ? hook({ id: lw.id, key: name, value, tier: 'default', type: lw.type, attrs: flat(lw.attrs), name: (id) => this._nameOf(id) }) : undefined; } catch { said = undefined; }
        extra.push({ key: `${w.type}.${name}`, value: { kind: /^-?\d+(\.\d+)?$/.test(value) ? 'number' : 'str', v: value } });
        if (said !== null) { const phrase = said ?? `${name} is ${value}`; if (!words.includes(phrase)) words.push(phrase); }
      }
      out.push(extra.length ? { ...w, entries: [...w.entries, ...extra] } : w);
    }
    return { facts: out, assumed: words.length ? `I assumed ${words.length > 1 ? words.slice(0, -1).join(', ') + ' and ' + words.at(-1) : words[0]}.` : null };
  }

  _actionEnvelope(r, action) {
    const env = { via: 'core.matrix' };
    if (r.status === 'done') {
      // a function's result is the envelope's facts; an action written as wires returns the library's change result (not facts: its `value` is the answer)
      const res = r.result && typeof r.result === 'object' && !Array.isArray(r.result.violations) ? r.result : {};
      Object.assign(env, { status: 'supported' }, res);
      if (r.value !== undefined && env.value === undefined) env.value = r.value;
    } else if (r.status === 'missing') {
      env.status = 'missing';
      env.missing = (r.missing ?? []).map((m) => m.key);
      const ask = (r.missing ?? []).find((m) => m.ask)?.ask;
      if (ask) env.ask = ask;
      if (r.result && typeof r.result === 'object') Object.assign(env, r.result, { status: 'missing' });
      // an argument the user can still give: the dialogue layer keeps the question open and the next message completes the command (spec 11 section 3)
      const key = (r.missing ?? [])[0]?.key;
      const decl = this.reasoner.actions.get(String(action ?? ''));
      const tpl = key && decl?.[`template.${key}`];
      if (tpl) env.pending = { world: this.reasoner.ownerOfAction(action), key, template: unquote(first(tpl)) };
    } else if (r.status === 'refused') {
      Object.assign(env, { status: 'conflicting', reason: 'precondition_failed', why: r.violations?.[0]?.why });
    } else if (r.status === 'budget') {
      Object.assign(env, { status: 'budget', note: 'compute budget reached' });
    } else Object.assign(env, { status: 'error', note: `the reasoner could not do that (${r.status})` });
    return env;
  }

  /** Display name of an entity for the words of a reply (the `name` of its wire, else its id without the prefix). */
  _nameOf(id) {
    const n = this.world.get(bare(id))?.attrs?.name?.[0];
    return n ? unquote(n) : String(id).replace(/^e\./, '').replace(/_/g, ' ');
  }

  /**
   * The state ops.mjs would keep (spec 15), derived from the library: the hooks of a world and the dialogue layer's snapshots read it from the session. Like the
   * operations' state it comes into being the first time the world answers (`touched`) or has something to say: a session that never used a world has none of it.
   */
  _state(session, touched = null) {
    const stamp = this.world.stamp;
    if (this.derived?.stamp !== stamp) this.derived = { stamp, json: new Map() };   // what toState said of this very library state (a library state has one stamp)
    for (const [id, toState] of this.reasoner.stateOf) {
      try {
        let cur = session.state[id];
        const seen = this.derived.json.get(id);
        if (cur && seen !== undefined && seen === JSON.stringify(cur)) continue;   // the state already is what the library says
        const next = toState({ find: (t) => this.world.ofType(t), query: (q) => this.world.query(q) });
        const json = JSON.stringify(next);
        if (this.world.stamp === stamp) this.derived.json.set(id, json);
        if (!cur) {
          if (id !== touched && json === this.reasoner.emptyState(id)) continue;
          cur = (session.state[id] = {});
        }
        if (json === JSON.stringify(cur)) continue;
        for (const k of Object.keys(cur)) delete cur[k];
        Object.assign(cur, next);
      } catch { /* the state stays as it was */ }
    }
  }

  /**
   * Derives the state of the matrix worlds from the library and copies the wires of the mirrored types (world.sop `mirror=`) from the library's World
   * into the session memory, in our wire shape: what a matrix action wrote is then visible to the worlds that read the memory (charts, documents), as what
   * ops.mjs emitted was. A wire the action removed is retracted there.
   */
  syncTo(session) {
    const L = this.reasoner.legends;
    this._state(session);
    for (const type of this.reasoner.mirrors) {
      const live = new Set();
      for (const w of this.world.ofType(type)) {
        live.add(w.id);
        const text = this.reasoner.lib.format(w);
        if (this.mirrored.get(w.id)?.text === text) continue;
        if (!this.mirrored.has(w.id) && session.memory.get(w.id)) { this.mirrored.set(w.id, { text, type, own: true }); continue; }   // a wire the memory already has (a knowledge base) is not copied, nor retracted
        this.mirrored.set(w.id, { text, type });
        const { wires } = parseOurs(text);
        if (!wires[0]) continue;
        const { wire } = L.normalizeWire(wires[0]);
        const has = (k) => wire.entries.some((e) => e.key === k);
        if (!has('core.via')) wire.entries.push({ key: 'core.via', value: refValue('core.matrix') });
        if (!has('core.seq')) wire.entries.push({ key: 'core.seq', value: atomValue(session.form.nextSeq()) });
        session.memory.add(wire);
      }
      for (const [id, m] of [...this.mirrored]) {
        turnBudget.tick('sopworld.mirror');
        if (m.type !== type || live.has(id)) continue;
        if (m.own) { this.mirrored.delete(id); continue; }
        session.memory.retract(id, 'removed by the matrix reasoner');
        this.mirrored.delete(id);
      }
    }
  }

  /** The explanation of a wire as a tree: { wire, via?, told?, from: [...] } (library `explain`), or null. */
  explain(id) { return this.world.explain(id); }
}
