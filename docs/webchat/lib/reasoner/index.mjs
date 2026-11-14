// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Reasoner host layer (spec 15). Browser-safe: no `node:*` imports. A thin adapter between the interpreter and the vendored
 * sopworld library (src/vendor/sopworld), not a second interpreter:
 *
 *   const reasoner = await createReasoner(set);        // null when no loaded world says reasoner=matrix
 *   const rs = reasoner.session();                     // one session: one library World per world that was used (created on first use)
 *   rs.tell(wires)                                     // session wires, as the dialogue produces them (each goes to the World of the world that owns its type)
 *   rs.resolve(wire, session)                          // a core.question / core.request wire -> our result envelope, or null (not ours)
 *   rs.fork()                                          // dry runs, validation and snapshots
 *
 * One instance per world (user decision 2026-11-11, spec 15): worlds stay isolated. What the library gets for a world: `worlds/core/mapping.sop` (how it reads
 * our legends), the legends of the world and of its imports as they are, their knowledge bases, the world's matrix (`matrix.sop`) and its functions (`fns.mjs`).
 * Reply wording stays in our templates.
 */
import { serialize, parse as parseOurs, ref as refValue, atom as atomValue, str as strValue } from '../soplang/index.mjs?v=c57881f705';
import { budget as turnBudget } from '../dialog/budget.mjs?v=00bce6e369';
import { nsWorld, nsContext, strip } from './ns.mjs?v=655a807958';

/** Types the dialogue produces that the library must never be told (they are asked, not stated). */
const NOT_FACTS = new Set(['core.question', 'core.request', 'core.answer', 'core.observation']);
/** The library's statuses mapped to ours (spec 04). `refused` (the thing asked about cannot be) is our `conflicting`. */
const STATUS = { supported: 'supported', conflicting: 'conflicting', ambiguous: 'ambiguous', missing: 'missing', refused: 'conflicting', unsupported: 'unsupported', no: 'supported', unknown: 'missing', budget: 'budget' };
const keyName = (k) => String(k).split('.').pop();
const bare = (v) => String(v).replace(/^\$/, '');
const unquote = (v) => { const s = String(v); if (!(s.length > 1 && s.startsWith('"') && s.endsWith('"'))) return s; try { return JSON.parse(s); } catch { return s.slice(1, -1); } };   // a string value is its text (the escapes of a quote or a line end undone)
const first = (a) => (Array.isArray(a) ? a[0] : a);
/** An issue of a soft rule of common sense (rule id `cs.d.*`): advice to say once, never a refusal. */
const isAdvice = (i) => /(?:^|[$:])cs\.d\./.test(String(first(i.w.attrs.rule) ?? ''));
/** Words a reason may write a value in (`?n:ordinal`, `?c:count`; library R6.5): "third", "two". The numbers the library gives are digits. */
const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const COUNTS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const FILTERS = {
  ordinal: (v) => { const n = Number(unquote(v)); return Number.isInteger(n) && ORDINALS[n] ? ORDINALS[n] : `${unquote(v)}th`; },
  count: (v) => { const n = Number(unquote(v)); return Number.isInteger(n) && COUNTS[n] ? COUNTS[n] : String(unquote(v)); },
};

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
 * The engine's side of the reasoner (spec 15, "One instance per world"): which worlds are on the matrix and how a session's instance of each is built.
 * Nothing is built here: the base World of a matrix world (mapping, the legends of the world and of its imports, their knowledge bases, the user, the
 * world's own matrix and functions) is built once, the first time a session needs that world (`baseOf`), and every session forks it. Returns null when no
 * world opts in (`reasoner=matrix` in its world.sop, with a matrix.sop).
 */
export async function createReasoner(set, { lib = null } = {}) {
  const worlds = set.list().filter((w) => w.reasoner === 'matrix' && w.raw.matrix != null);
  if (!worlds.length) return null;
  lib ??= await import('../vendor/sopworld/sopworld.mjs?v=0f9769b0bd');
  const legends = set.legends;
  const lexicon = (id) => { const l = set.list().flatMap((w) => w.lexicons).find((x) => x.id === id); return l ? [...l.words] : []; };
  /** What the host gives an action function besides the library's own context (`ctx.host`, spec 15): the lexicons, and `view(ctx)`, an ops-shaped read-only context (find, val, vals, lexicon) over the library, so the tables of a world's ops.mjs can be shared. */
  const host = {
    lexicon,
    view: (c) => {
      const keys = new Map();   // (type, key) -> the resolved key (a world's tables ask for the same few thousands of times per turn)
      const key = (w, k) => {
        const id = `${w.type}\u0001${k}`;
        let r = keys.get(id);
        if (r === undefined) { r = legends.tryResolveKey(w.type, k); if (r.error) r = null; keys.set(id, r); }
        return r;
      };
      const decode = (r, t) => legends.decode(r.info, lib.readValue(t));
      return {
        lexicon,
        find: (type, where = {}) => c.find(type, where),
        val: (w, k) => { const r = key(w, k); const t = r && w.attrs[keyName(r.key)]?.[0]; return t === undefined ? undefined : decode(r, t); },
        vals: (w, k) => { const r = key(w, k); return r ? (w.attrs[keyName(r.key)] ?? []).map((t) => decode(r, t)) : []; },
      };
    },
  };
  const problems = [];
  const byId = new Map(worlds.map((w) => [w.id, w]));
  const allIds = set.list().map((w) => w.id).sort((a, b) => b.length - a.length);
  const owner = (type) => allIds.find((id) => type === id || String(type).startsWith(id + '.')) ?? null;   // the world (matrix or not) that declares a type: the longest world id that prefixes it
  /** The worlds whose legends an instance of `id` holds: the world and its imports and, for a composite world (`compose=`), the same of every world it composes. Dependency order. */
  const schemaIds = new Map();
  const schemaWorlds = (id) => {
    let r = schemaIds.get(id);
    if (!r) {
      const want = new Set([id, ...(byId.get(id)?.compose ?? []), ...(byId.get(id)?.reads ?? [])].flatMap((x) => set.available(x)));
      r = set.list().filter((w) => want.has(w.id)).map((w) => w.id);
      schemaIds.set(id, r);
    }
    return r;
  };
  /** The matrix worlds whose matrices and functions an instance of `id` holds: the worlds it composes (when they are matrix worlds), then itself. */
  /**
   * The instance a world lives in (spec 15, "The conversation instance"): the composite world (`compose=`) that names it, else itself. A composed world has no
   * instance of its own: its facts, rules and questions are in the composite's World, which is how worlds that talk about the same things share facts.
   */
  const homes = new Map();
  for (const w of worlds) for (const c of w.compose) if (byId.has(c) && !homes.has(c)) homes.set(c, w.id);
  const instKey = (id) => homes.get(id) ?? id;
  const matrixWorlds = (id) => [...new Set([...(byId.get(id)?.compose ?? []), id])].filter((x) => byId.has(x));
  const bases = new Map();
  const buildBase = (id) => {
    const fns = {};   // the world's action functions (the library keeps them apart from its own arithmetic)
    const ns = instKey(id);   // the namespace of the instance (spec 15, "Namespaces"): every fact of it is `<ns>::<id>` in the library
    for (const m of matrixWorlds(id)) for (const [name, f] of Object.entries(byId.get(m).fns ?? {})) fns[name] = (c, args) => f({ ...nsContext(c, ns), host, live: reasoner.live }, strip(ns, args));
    const raw = new lib.World({ ns, actions: fns, filters: FILTERS, vocabulary: { status: 'core.status' } });
    const base = nsWorld(raw, ns);
    const load = (what, text) => { if (text == null) return; const r = base.load(text); if (!r.ok) problems.push(`${what}: ${r.violations?.[0]?.kind ?? 'refused'} ${r.violations?.[0]?.why ?? r.violations?.[0]?.key ?? ''}`.trim()); };
    const ordered = schemaWorlds(id).map((x) => set.get(x));
    load('mapping', set.list().map((w) => w.raw.mapping).find((t) => t != null));
    for (const w of ordered) load(`${w.id}/legend.sop`, w.raw.legend);
    for (const w of ordered) load(`${w.id}/kb.sop`, w.raw.kb);   // the knowledge bases of the world and of what it imports (games.guess reads kids.animals): each instance has its own
    { const r = raw.tell('@e.user core.agent', { ns: '' }); if (!r.ok) problems.push(`user: ${r.violations?.[0]?.kind ?? 'refused'}`); }   // the user is in the default namespace (a shared type: every namespace reads it, and the matrices name it as `$e.user`)
    // one SOP Lang parser in the product: our parser reads the matrices and the library is handed their wires
    for (const m of matrixWorlds(id)) {
      const what = `${m}/matrix.sop`;
      const { wires, errors } = parseOurs(byId.get(m).raw.matrix, { source: what });
      if (errors.length) { problems.push(`${what}: ${errors[0].line}:${errors[0].column} ${errors[0].message}`); continue; }
      load(what, wires.map((w) => libWire(lib, w)));
    }
    // The parameter types of the host-run actions (spec 16 section 8): `core.describe.arg slot=<type>.<key>` says which slot of the legend an argument fills; the library judges an
    // action it does not declare against the slots of a type named like it (J2, sopworld 0.13.1), so that type is derived here from the slots the arguments name (kind, enum, range).
    {
      const c = raw._compiled();
      const lines = [];
      for (const m of matrixWorlds(id)) {
        for (const [action, args] of byId.get(m).argSlots ?? []) {
          if (c.actions.get(action) || c.slots.get(action)) continue;   // the matrix declares it, or the type exists already
          const keys = [];
          for (const [arg, slot] of args) {
            const at = slot.lastIndexOf('.');
            const def = at > 0 ? c.slots.get(slot.slice(0, at))?.get(slot.slice(at + 1)) : null;
            if (!def) { problems.push(`${m}/describe.sop: ${action}.${arg}: slot ${slot} is not declared by the legends`); continue; }
            const extra = ['kind', 'enum', 'min', 'max', 'step'].flatMap((k) => (def.attrs?.[k] ?? []).map((v) => `${k}=${v}`));
            keys.push(`@${action}.${arg} core.slot of=${action} key=${arg} ${extra.join(' ')}`.trim());
          }
          if (keys.length) lines.push(`@${action} core.type`, ...keys);
        }
      }
      if (lines.length) load('parameter types', lines.join('\n'));
    }
    return base;
  };
  const owners = worlds.map((w) => w.id).sort((a, b) => b.length - a.length);
  const actionOwner = new Map();
  for (const w of worlds) for (const o of w.operations) if (o.semantics === 'action') { actionOwner.set(o.id, w.id); if (o.action) actionOwner.set(o.action, w.id); }
  const voices = new Map(worlds.filter((w) => typeof w.voice === 'function').map((w) => [w.id, w.voice]));
  const assumedBy = new Map(worlds.filter((w) => typeof w.assumed === 'function').map((w) => [w.id, w.assumed]));
  const undoOf = new Map(worlds.filter((w) => w.undoAction).map((w) => [w.undoAction, w]));   // action -> the world whose "undo" the library answers by rewinding
  const redoOf = new Map(worlds.filter((w) => w.redoAction).map((w) => [w.redoAction, w]));   // action -> the world whose "redo" the library answers by re-applying the last undo
  const guardOf = new Map(worlds.filter((w) => typeof w.guard === 'function' && typeof w.toState === 'function').map((w) => [w.id, w]));   // world id -> the world that refuses a request on a target that does not exist, with the reason
  const passive = new Set(worlds.filter((w) => w.passive).map((w) => w.id));   // worlds whose state follows the others: only a turn of their own takes their changes back
  const untold = new Set(worlds.flatMap((w) => w.untold));   // wire types the session memory keeps and the library does not hold
  const keyOf = new Map(worlds.filter((w) => typeof w.stateKey === 'function').map((w) => [w.id, w.stateKey]));   // world id -> the cheap text that says whether its state changed (a state with big derived or immutable parts is not worth stringifying whole)
  const viewOf = new Map(worlds.filter((w) => typeof w.isView === 'function').map((w) => [w.id, w]));   // world id -> the world that says which library steps only moved what the user looks at
  const wordsOf = new Map(worlds.filter((w) => typeof w.undoWords === 'function' && typeof w.toState === 'function').map((w) => [w.id, w]));   // world id -> the world that says what a generic "undo that" took back (undoWords over its toState)
  const adoptOf = new Map(worlds.filter((w) => typeof w.adopt === 'function' && typeof w.toState === 'function').map((w) => [w.id, w]));   // world id -> the world whose operations change its state and hand it back to the library (`adopt`)
  const offerOf = new Map(worlds.filter((w) => typeof w.closeOffer === 'function' && typeof w.adopt === 'function').map((w) => [w.id, w.closeOffer]));   // world id -> `closeOffer(state)`: an undo that brings an answered offer back closes it
  const problemOf = new Map(worlds.filter((w) => typeof w.problem === 'function').map((w) => [w.id, w.problem]));
  const whyOf = new Map(worlds.filter((w) => typeof w.whyWords === 'function').map((w) => [w.id, w.whyWords]));
  const stateOf = new Map(worlds.filter((w) => typeof w.toState === 'function').map((w) => [w.id, w.toState]));
  const mirrorTypes = new Map();   // mirrored wire type -> the world that declares it (the wires are in that world's instance)
  for (const w of worlds) for (const t of w.mirrors) if (!mirrorTypes.has(t)) mirrorTypes.set(t, w.id);
  const opsKeys = new Set(worlds.flatMap((w) => w.opsKeys));   // questions the matrix leaves to the operations (world.sop `ops=`)
  const empties = new Map();
  const declared = new Map();   // world id -> Map(action name -> attrs of the matrix's `core.action`): what a missing argument asks and how the answer completes the sentence
  const routes = new Map();
  const reasoner = {
    lib, voices, assumedBy, instKey, composites: new Set(homes.values()), problemOf, whyOf, undoOf, redoOf, guardOf, viewOf, keyOf, passive, untold, wordsOf, adoptOf, offerOf, opsKeys, stateOf, worlds: worlds.map((w) => w.id), problems, legends: set.legends, mirrorTypes, schemaWorlds, matrixWorlds,
    /** The base World of a matrix world (built on first use, once per engine). */
    baseOf: (id) => { id = instKey(id); let b = bases.get(id); if (!b) { b = buildBase(id); bases.set(id, b); } return b; },
    /** Builds every base and returns the problems found (tests, `test-world`). */
    buildAll: () => { for (const w of worlds) reasoner.baseOf(w.id); return problems; },
    /** Does the instance of matrix world `id` know this wire type? (the instance key of the world's home) */
    /** Does the instance of matrix world `id` know this wire type (its schema holds the legend that declares it)? */
    knows: (id, type) => schemaWorlds(instKey(id)).includes(owner(type)),
    /**
     * Where a session wire of this type goes: `ids` = the matrix worlds whose instances know the type, `owner` = the matrix world that declares it (null for
     * `core.agent` and the like), `shared` = the wire is copied to several instances and kept in the session's log (spec 15, "What is shared").
     */
    route: (type) => {
      let r = routes.get(type);
      if (!r) {
        const o = owner(type);
        // a type of a matrix world is told to the instance of that world only (the games share nothing); a type no matrix world declares (core.agent, kids.common) is shared
        const ids = o == null ? [] : byId.has(o) ? [instKey(o)] : [...new Set(worlds.filter((w) => schemaWorlds(instKey(w.id)).includes(o)).map((w) => instKey(w.id)))];
        r = { ids, owner: byId.has(o) ? instKey(o) : null, world: byId.has(o) ? o : null, shared: ids.length > 1 || (ids.length > 0 && !byId.has(o)) };
        routes.set(type, r);
      }
      return r;
    },
    /** The matrix's `core.action` declaration of an action (the library wire's attrs), read from the base of the world that owns it. */
    declOf: (action) => {
      const id = actionOwner.get(action);
      if (!id) return undefined;
      let m = declared.get(id);
      if (!m) { m = new Map(); for (const x of reasoner.baseOf(id).matrix.values()) if (x.type === 'core.action') m.set(unquote(first(x.attrs.name)), x.attrs); declared.set(id, m); }
      return m.get(action);
    },
    /** The matrix world that owns a question type (longest world id that prefixes it), or null. */
    ownerOfType: (type) => owners.find((id) => type === id || String(type).startsWith(id + '.')) ?? null,
    ownerOfAction: (action) => actionOwner.get(action) ?? null,
    /** The matrix world that answers a question or request wire (the state of that world comes into being with its first answer). */
    ownerOfWire: (wire) => {
      const val = (k) => wire.entries.find((e) => e.key === k)?.value?.v;
      return set.legends.isA(wire.type, 'core.question') ? reasoner.ownerOfType(val('core.question.type')) : reasoner.ownerOfAction(val('core.request.action'));
    },
    /** The text that stands for a world's state when the host asks whether it changed (`stateKey` of the world's fns.mjs, else the JSON of the state). */
    json: (id, s) => { const k = keyOf.get(id); return k ? k(s) : JSON.stringify(s); },
    /** What a world's `toState` says of an instance with nothing told: { json, obj } (a state equal to it is not worth creating); `json` is '' when it cannot be read. */
    emptyState: (id) => {
      let e = empties.get(id);
      if (e === undefined) {
        try { const base = reasoner.baseOf(id); const obj = stateOf.get(id)({ find: (t) => base.ofType(t), query: (q) => base.query(q) }); e = { json: reasoner.json(id, obj), obj }; } catch { e = { json: '', obj: null }; }
        empties.set(id, e);
      }
      return e;
    },
    session: () => new ReasonerSession(reasoner),
  };
  return reasoner;
}

/**
 * One dialogue session on the library: one World per world that was used (`insts`, created on first use from the world's base), session wires told to the
 * World of the world that owns their type, the few shared wires (`core.agent`) copied to every instance that knows their type and kept in `sharedLog`. The
 * library is the only record of what was said: undo, "that's wrong", the per-world state the hooks and the dialogue layer's snapshots read (`toState`) and the
 * session memory's mirrors are all derived from it, so they cannot diverge.
 */
export class ReasonerSession {
  constructor(reasoner) {
    this.reasoner = reasoner;
    this.insts = new Map();      // world id -> { id, world, completedAt }: the instances this session has used
    this.sharedLog = [];         // wires copied to several instances: [{ w, add, dead }] (what an instance created later replays; `add` / `dead` are values of `ops`)
    this.sharedIds = new Set();  // ids of the live entries of the log
    this.ops = 0;                // counter of the changes of the log (an append or a retraction), what a mark of the shared log is
    this.refused = [];   // wires the library refused to take: [{ id, type, violations }], for the trace
    this.last = null;    // the last library result, for explain / why: { wire, result, inst }
    this.known = new Map();
    this.written = new Map();    // world id -> JSON of the state as the library last said it (a world with `adopt`: a state that differs was changed by its operations since)
    this.derived = new Map(); this.stateCache = new Map(); this.stateHits = 0;    // world id -> { stamp, json }: what toState said of the instance as it was at that stamp
    this.said = new Set();       // assumed cells already said to the user (an assumption is said once)
    this.advised = new Set();    // keys of the advice (issues of common sense) already said while they stand
    this.advice = [];            // advice collected and not yet taken by the turn
    this.warned = new Set();     // library warnings already reported in the trace (a warning is reported once per session)
    this.mirrored = new Map();   // id -> { text, type } of the wire last copied to the session memory
    this.told = [];              // ids of the dialogue wires the library holds, oldest first (a rewind retracts the ones that are gone from the session memory)
    this.redos = [];             // what the last undo steps took out, newest last: { world, undo: [functions that put it back] } (a turn that changes the library empties it)
    this.cur = null;             // the turn in progress: { turn, marks: Map(world id -> { mark, stamp, birth? }), ops, owners: Set(world ids whose types the turn told) }
    this.undoneAt = 0;           // the message of the last undo
    this.undone = 0;             // undos done since the last turn that changed the library (an undo is a turn too: it does not age what is left to take back)
    this.turns = [];             // the turns that changed the library, oldest first: { turn, mark: { marks, ops } } (the marks are the instances as they were before the turn)
    this.seg = null;             // the statements of the segment in progress: { marks, ops, clean, ids } (what a refused statement is taken back to)
    this.issueSeen = new Set();  // keys of the standing issues before the turn: an issue that appears with a statement means the statement cannot be true
  }

  /** A copy that shares the state until one of the two changes (nothing is copied; an instance is copied only if it is written afterwards). */
  fork() {
    const r = new ReasonerSession(this.reasoner);
    for (const [id, i] of this.insts) r.insts.set(id, { id, world: i.world.fork(), completedAt: i.completedAt });
    r.sharedLog = this.sharedLog.map((x) => ({ ...x })); r.sharedIds = new Set(this.sharedIds); r.ops = this.ops;
    r.refused = [...this.refused]; r.last = this.last; r.known = new Map(this.known); r.said = new Set(this.said); r.warned = new Set(this.warned); r.mirrored = new Map(this.mirrored); r.told = [...this.told]; r.written = new Map(this.written);
    r.cur = this.cur && { ...this.cur, marks: new Map(this.cur.marks), owners: new Set(this.cur.owners ?? []) }; r.seg = this.seg && { ...this.seg, marks: new Map(this.seg.marks), ids: [...this.seg.ids] };
    r.undone = this.undone; r.undoneAt = this.undoneAt; r.issueSeen = new Set(this.issueSeen); r.turns = this.turns.map((t) => ({ ...t }));
    if (r.last?.inst) r.last = { ...r.last, inst: r.insts.get(r.last.inst.id) };
    return r;
  }

  // ---- the timeline as plain data (spec 15, "The timeline survives a restart") -------------------------------------------------------

  /**
   * The session's library state and undo timeline as JSON (a host that restarts its engine worker keeps it with the committed state). Per instance it holds the
   * library's log (what the instance was told, as the library's own `toJSON` keeps it, minus the base's entries) of the instance as it is and of every mark of
   * the kept turns; the entries are stored once and the logs are lists of their indices. `restoreJSON` replays them. Returns null when the record is over
   * `maxBytes` even without turns. The oldest turns are dropped until the record fits.
   */
  timelineJSON({ maxBytes = 1_500_000 } = {}) {
    let keep = this.turns.length;
    for (let tries = 0; tries < 8; tries++) {   // 40 -> 20 -> 10 -> 5 -> 2 -> 1 -> 0
      turnBudget.tick('reasoner.serialize');
      const rec = this._record(this.turns.slice(this.turns.length - keep));
      const size = JSON.stringify(rec).length;
      if (size <= maxBytes) { rec.bytes = size; rec.dropped = this.turns.length - keep; return rec; }
      if (keep === 0) return null;
      keep = Math.floor(keep / 2);
    }
    return null;
  }
  _record(turns) {
    const table = [], at = new Map(), insts = {}, logOfInst = new Map();
    const idx = (e) => { let i = at.get(e); if (i === undefined) { i = table.length; table.push(e); at.set(e, i); } return i; };
    for (const [id, i] of this.insts) {
      const baseLog = this.reasoner.baseOf(id).log, logs = [], seen = new Map();
      const logOf = (world) => {
        const log = world.log;
        let n = seen.get(log);
        if (n !== undefined) return n;
        let p = 0;   // the entries it shares with the base (a game's action may have rewritten one of the base's: the rest is then kept as entries)
        for (let k = 0, lim = Math.min(baseLog.length, log.length); k < lim && log[k] === baseLog[k]; k++) { turnBudget.tick('reasoner.serialize'); p = k + 1; }
        n = logs.length;
        logs.push({ p, e: log.slice(p).map((e) => { turnBudget.tick('reasoner.serialize'); return idx(e); }) });
        seen.set(log, n);
        return n;
      };
      const cur = logOf(i.world);
      insts[id] = { cur, done: i.completedAt === i.world.stamp, logs };
      logOfInst.set(id, logOf);
    }
    const out = [];
    for (const t of turns) {
      const marks = [];
      for (const [id, e] of t.mark.marks) {
        const logOf = logOfInst.get(id);
        if (!logOf) continue;
        marks.push([id, logOf(e.mark.world), e.birth ? 1 : 0]);
      }
      out.push({ turn: t.turn, ops: t.mark.ops, marks, worlds: t.worlds, said: t.said });
    }
    return { v: 2, entries: table, insts, turns: out, ops: this.ops, sharedLog: this.sharedLog.map((x) => ({ w: x.w, add: x.add, dead: x.dead })), told: [...this.told], said: [...this.said], undone: this.undone, undoneAt: this.undoneAt };
  }
  /**
   * Puts a `timelineJSON()` record back into this (fresh) session: each instance is a fork of its base with the logs replayed, the marks of the kept turns are taken
   * from the replayed worlds (a mark is the world at that point of its log), so "undo" walks the timeline of before the restart. `session` is the interpreter
   * session (its state is restored already; the derived state is compared with it). Nothing changes when the record cannot be read (false). Not restored: the
   * redo stack (functions) and the memory wires the dialogue held (the page never kept them either).
   */
  restoreJSON(rec, session) {
    try {
      if (!rec || rec.v !== 2 || !Array.isArray(rec.entries) || !rec.insts || typeof rec.insts !== 'object' || !Array.isArray(rec.turns)) return false;
      const entries = rec.entries, insts = new Map(), worldsOf = new Map();   // id -> inst; id -> Map(log number -> the replayed world)
      for (const [id, d] of Object.entries(rec.insts)) {
        const base = this.reasoner.baseOf(id);
        const logs = d.logs.map((l) => base.log.slice(0, l.p).concat(l.e.map((i) => entries[i])));
        const roots = new Map(), rootOf = (p) => {   // the base itself, or (a base entry was rewritten) a world that replays the base's entries up to there
          if (!roots.has(p)) {
            let w = base;
            if (p < base.log.length) { w = nsWorld(new base.raw.constructor(base.options), base.ns); if (p) { const r = w._replay(base.log.slice(0, p)); if (r) throw new Error('replay refused'); } }
            roots.set(p, { log: base.log.slice(0, p), world: w });
          }
          return roots.get(p);
        };
        const order = logs.map((l, n) => n).sort((a, b) => logs[a].length - logs[b].length), built = [];
        for (const n of order) {
          let prior = rootOf(d.logs[n].p);
          for (const b of built) if (b.log.length > prior.log.length && b.log.length <= logs[n].length && b.log.every((e, k) => e === logs[n][k])) prior = b;
          const w = prior.world.fork();
          const rest = logs[n].slice(prior.log.length);
          turnBudget.tick('reasoner.restore', rest.length + 1);
          if (rest.length) { const r = w._replay(rest); if (r) throw new Error('replay refused'); }
          built.push({ log: logs[n], world: w, n });
        }
        const by = new Map(built.map((b) => [b.n, b.world]));
        worldsOf.set(id, by);
        const world = by.get(d.cur).fork();
        insts.set(id, { id, world, completedAt: d.done ? world.stamp : null });
      }
      const turns = rec.turns.map((t) => {
        const marks = new Map();
        for (const [id, n, birth] of t.marks) marks.set(id, { mark: worldsOf.get(id).get(n).mark(), stamp: -1, ...(birth ? { birth: true } : {}) });
        return { turn: t.turn, mark: { marks, ops: t.ops }, worlds: [...(t.worlds ?? [])], said: t.said ?? null };
      });
      this.insts = insts; this.turns = turns; this.ops = rec.ops ?? 0;
      this.sharedLog = (rec.sharedLog ?? []).map((x) => ({ ...x })); this._rebuildShared();
      this.told = [...(rec.told ?? [])]; this.said = new Set(rec.said ?? []); this.undone = rec.undone ?? 0; this.undoneAt = rec.undoneAt ?? 0;
      this.redos = []; this.cur = null; this.seg = null; this.refused = []; this.last = null; this.mirrored = new Map(); this.derived = new Map(); this.stateCache = new Map(); this.written = new Map();
      if (session) {
        for (const id of this.reasoner.stateOf.keys()) if (session.state[id]) this.written.set(id, this.reasoner.json(id, session.state[id]));   // the state is what the library said
        this.syncTo(session);
      }
      return true;
    } catch { return false; }
  }

  // ---- instances -----------------------------------------------------------------------------------------------------------------

  /** The instance of a world: created on first use (a fork of the world's base, plus the shared wires its schema knows). */
  _inst(id) {
    id = this.reasoner.instKey(id);
    let i = this.insts.get(id);
    if (i) return i;
    const world = this.reasoner.baseOf(id).fork();
    const pre = world.mark();
    i = { id, world, completedAt: null };
    this.insts.set(id, i);
    for (const x of this.sharedLog) {   // replay: what the other worlds were told that this one knows the type of
      if (x.dead || !this.reasoner.knows(id, x.w.type) || world.has(x.w.id)) continue;
      try { world.tell([this._wire(x.w)], { budget: this._limit() }); } catch { /* the wire stays out of this instance */ }
      this._charge(world);
    }
    const e = { mark: pre, stamp: world.stamp, birth: true };   // taking the instance back to its birth is a rewind to the base and a replay of the log
    if (this.cur && !this.cur.marks.has(id)) this.cur.marks.set(id, e);
    if (this.seg && !this.seg.marks.has(id)) this.seg.marks.set(id, e);
    return i;
  }
  /** The library World of a world's instance (created on first use): for tests and tools that look at what the library holds. */
  of(id) { return this._inst(id).world; }
  /** The instance of the world that owns a type, or of the first world that knows it and has one; undefined when this session has none. */
  _instOfType(type) {
    const r = this.reasoner.route(type);
    return (r.owner && this.insts.get(r.owner)) || r.ids.map((x) => this.insts.get(x)).find(Boolean);
  }
  /** Does any instance (or the shared log) hold the wire? */
  _held(id) {
    if (this.sharedIds.has(id)) return true;
    for (const i of this.insts.values()) if (i.world.has(id)) return true;
    return false;
  }
  /** The instance that holds a wire (the one that gave the last answer first). */
  _holder(id) {
    const l = this.last?.inst;
    if (l && l.world.has(id)) return l;
    for (const i of this.insts.values()) if (i.world.has(id)) return i;
    return undefined;
  }
  /** A wire of the library by id, from the instance that holds it. */
  get(id) { return this._holder(id)?.world.get(id); }
  _rebuildShared() { this.sharedIds = new Set(this.sharedLog.filter((x) => !x.dead).map((x) => x.w.id)); }

  isFact(type) {
    if (NOT_FACTS.has(type) || this.reasoner.untold.has(type)) return false;
    let k = this.known.get(type);
    if (k === undefined) { k = this.reasoner.route(type).ids.length > 0; this.known.set(type, k); }
    return k;
  }

  /** Wire (full keys) -> library wire. */
  _wire(w) {
    const L = this.reasoner.legends;
    const short = { ...w, entries: w.entries.map((e) => ({ key: L.shortKey(w.type, e.key), value: e.value })) };
    return this.reasoner.lib.parse(serialize([short]))[0];
  }

  /**
   * Tell the session wires the library knows the type of; a wire it refuses is recorded and the world stays as it was. A wire goes to the instance of the world
   * that owns its type; one that other worlds know too (`core.agent`) is also told to the instances this session has and kept in the shared log. `session` (the
   * interpreter session) gets the derived state.
   */
  tell(wires, session = null) {
    for (const w of wires) {
      if (!this.isFact(w.type) || this._held(w.id)) continue;
      if (!this.seg) this.seg = { marks: new Map(), ops: this.ops, clean: this._clean(), ids: [] };
      this.seg.ids.push(w.id);
      const route = this.reasoner.route(w.type);
      const targets = [];
      if (route.world && this.cur?.owners) this.cur.owners.add(route.world);
      if (route.owner) targets.push(this._inst(route.owner));   // the owner's instance is created by its first fact (the others only get what they have)
      for (const id of route.ids) if (id !== route.owner && this.insts.has(id)) targets.push(this.insts.get(id));
      if (route.shared) { this.sharedLog.push({ w, add: ++this.ops, dead: 0 }); this.sharedIds.add(w.id); }
      let ok = true;
      for (const inst of targets) {
        if (!this.seg.marks.has(inst.id)) this.seg.marks.set(inst.id, { mark: inst.world.mark() });
        let r;
        try { r = inst.world.tell([this._wire(w)], { budget: this._limit() }); } catch (e) { r = { ok: false, violations: [{ kind: 'error', why: String(e?.message ?? e) }] }; }
        this._charge(inst.world);
        if (!r.ok) { this.refused.push({ id: w.id, type: w.type, violations: r.violations }); ok = false; }
      }
      if (ok) this.told.push(w.id);
    }
    this._defaults();   // a no-op while no instance has changed since its last completing
    if (session) this._state(session);   // cheap, and the session state may have been put back by a snapshot since
  }

  /** What the matrix declares as a default is applied (tier `default`) once the wires are told, so that an answer resting on it can say so. */
  _defaults() {
    for (const inst of this.insts.values()) {
      const world = inst.world;
      if (world.stamp === inst.completedAt) continue;   // nothing changed since the last completing: it would find nothing to do
      if (!world.canComplete()) { inst.completedAt = world.stamp; continue; }   // no slot is open that completing could fill (library P1: one cheap pass)
      let done = true;
      try { const r = world.complete({ defaults: true, budget: this._limit() }); if (r?.budget) done = false; } catch { done = false; /* a default that cannot be applied stays open */ }
      this._charge(world);
      inst.completedAt = done ? world.stamp : null;   // an incomplete completing is tried again with the next budget
    }
  }

  // ---- turns, undo, rewind ---------------------------------------------------------------------------------------------------------

  /** Marks of the instances as they are now, with the stamp they had. */
  _marks() { const m = new Map(); for (const [id, i] of this.insts) m.set(id, { mark: i.world.mark(), stamp: i.world.stamp }); return m; }
  /** Nothing changed since the turn began (no instance, not the shared log): a statement refused now leaves the turn a no-op. */
  _clean() {
    const c = this.cur;
    if (!c || c.ops !== this.ops) return false;
    for (const [id, i] of this.insts) if (c.marks.get(id)?.stamp !== i.world.stamp) return false;
    return true;
  }
  /** Start of a dialogue turn: the instances as they are now are what the turn can be taken back to. */
  beginTurn(turn) { this.cur = { turn, marks: this._marks(), ops: this.ops, owners: new Set() }; this.seg = null; this.issueSeen = new Set(this._issues().map((i) => i.key)); }
  /**
   * Advice (spec 15): the standing issues of soft rules of common sense (`cs.d.*`) that have not been said yet, as short sentences. An issue is said once while it stands
   * (it is said again only after it went away and came back); the state is never refused for it. Called after the library took a state over.
   */
  _collectAdvice() {
    const now = this._issues().filter(isAdvice);
    const keys = new Set(now.map((i) => i.key));
    for (const k of [...this.advised]) if (!keys.has(k)) this.advised.delete(k);
    for (const i of now) {
      if (this.advised.has(i.key)) continue;
      this.advised.add(i.key);
      const t = unquote(first(i.w.attrs.why) ?? '').trim();
      if (t && !this.advice.includes(t)) this.advice.push(t);
    }
  }
  /** The advice collected since the last call (each sentence once), as an array of sentences. */
  takeAdvice() { const a = this.advice; this.advice = []; return a; }
  /** The standing issues of the instances (or of one): [{ key, w, inst }]; an issue is identified by instance and id. */
  _issues(only = null) {
    const out = [];
    for (const inst of this.insts.values()) {
      if (only && inst !== only) continue;
      for (const w of inst.world.ofType('core.issue')) out.push({ key: `${inst.id}:${w.id}`, w, inst });
    }
    return out;
  }
  _issueInfo(i) { return { why: unquote(first(i.w.attrs.why) ?? ''), key: first(i.w.attrs.key), aboutId: bare(first(i.w.attrs.about)), about: flat(i.inst.world.get(bare(first(i.w.attrs.about)))?.attrs) }; }
  /**
   * A statement that cannot be true (spec 11 section 12, matrix strategy): the library refused the wires of the segment (a deny: the reason is its text) or
   * accepted them and a soft constraint now stands as a new issue (the issue's `why`). The segment's facts are taken back, in the instances it touched (`rewind`
   * to before the segment's tell) and in the session memory, and the reason is returned (capitalised, with a full stop); null when the statements are fine.
   */
  refuseFacts(facts, session) {
    const seg = this.seg;
    this.seg = null;
    if (!seg) return null;
    const ids = new Set(seg.ids);
    const refused = this.refused.find((r) => ids.has(r.id));
    const added = refused ? null : this._issues().find((i) => !this.issueSeen.has(i.key) && !isAdvice(i));
    if (!refused && !added) { for (const i of this._issues()) this.issueSeen.add(i.key); return null; }
    let why = refused ? refused.violations?.[0]?.why : unquote(first(added.w.attrs.why) ?? '');
    this.refused = this.refused.filter((r) => !ids.has(r.id));
    // the world may say it in its own words (the issue and the facts are still in the library: it reads them before they are taken back)
    const ownerId = this.reasoner.ownerOfType(facts.find((w) => !w.type.startsWith('core.'))?.type);
    const hook = this.reasoner.problemOf.get(ownerId);
    if (hook) {
      const inst = this.insts.get(this.reasoner.instKey(ownerId)) ?? added?.inst ?? [...this.insts.values()][0];
      try {
        const issue = added && { why, key: first(added.w.attrs.key), aboutId: bare(first(added.w.attrs.about)), about: flat(added.inst.world.get(bare(first(added.w.attrs.about)))?.attrs) };
        const said = hook({ why, issue, facts: facts.map((w) => ({ type: w.type, attrs: Object.fromEntries(w.entries.map((e) => [keyName(e.key), String(e.value.v)])) })), find: (t) => inst.world.ofType(t), query: (q) => inst.world.query(q), name: (id) => this._nameOf(id, inst), issues: () => this._issues(inst).map((i) => this._issueInfo(i)) });
        if (said) why = said;
      } catch { /* the library's reason stays */ }
    }
    this._back(seg.marks, seg.ops, session, { restart: false });
    for (const id of seg.ids) if (!this._held(id) && session.memory.get(id)) session.memory.retract(id, 'refused');   // a statement the library refused outright (a deny) was never told: the memory forgets it too
    if (seg.clean && this.cur) { for (const [id, i] of this.insts) { const e = this.cur.marks.get(id); if (e) e.stamp = i.world.stamp; } this.cur.ops = this.ops; }   // nothing else changed the library in this turn: the turn is no action to take back
    const t = String(why || 'that cannot be true').trim().replace(/[.!?\s]+$/, '');
    return `${t.charAt(0).toUpperCase()}${t.slice(1)}.`;
  }
  /**
   * The library's warnings (`world.warnings`: an ambiguous short key, an attribute no wire type reads, a deprecated pattern, a word that means nothing) that this
   * session has not reported yet, as `{ world, kind, id, why }`, for the debug trace and the phrase log. The library says them when a matrix is compiled and when
   * facts arrive; nothing here changes an answer.
   */
  newWarnings() {
    const out = [];
    for (const [iid, i] of this.insts) {
      let list = [];
      try { list = [...(this.reasoner.baseOf(iid).warnings ?? []), ...(i.world.warnings ?? [])]; } catch { list = []; }   // a fork starts with none: the base's are the ones said when its matrix was compiled
      for (const w of list) {
        const key = `${iid}|${w.kind}|${w.id ?? ''}|${w.why ?? ''}`;
        if (this.warned.has(key)) continue;
        this.warned.add(key);
        out.push({ world: iid, kind: w.kind, ...(w.id !== undefined ? { id: w.id } : {}), why: w.why ?? '' });
      }
    }
    return out;
  }

  /**
   * The step in progress changed the library? Returns the marks of the instances it moved (what a rewind goes back to), or null for a step that changed nothing.
   */
  _moved(c) {
    let changed = this.ops !== c.ops;
    const marks = new Map();
    for (const [id, e] of c.marks) {
      const inst = this.insts.get(id);
      if (!inst) continue;
      const exempt = this.reasoner.passive.has(id) && !c.owners?.has(id);   // a passive world moved (or created) by another world's request is not a step of this turn
      const moved = inst.world.stamp !== e.stamp && !exempt;
      if (moved) changed = true;
      if (moved || (e.birth && !exempt)) marks.set(id, e);   // an instance created in the turn is taken back to its birth even when nothing was told to it
    }
    return changed ? marks : null;
  }
  /** Keeps the step `c` as an entry of the timeline (UNDO-REDO: an entry is one request of the user; the requests of one message share its `turn`). */
  _keep(c, marks, said) {
    // the worlds the step concerned: the ones whose types it told and the games whose own instance it changed (a game's actions change its instance without a wire of the dialogue)
    const worlds = new Set(c.owners ?? []);
    for (const id of marks.keys()) if (this.reasoner.worlds.includes(id) && !this.reasoner.composites.has(id)) worlds.add(id);
    if (this.ops !== c.ops || [...marks.keys()].some((id) => !this.reasoner.passive.has(id))) this.redos = [];   // a new action makes what was undone final (a visit to another tab, a counter of the help: no action)
    this.turns.push({ turn: c.turn, mark: { marks, ops: c.ops }, worlds: [...worlds], said, ...(c.snap ? { snap: c.snap } : {}), ...(c.orig ? { orig: c.orig } : {}) });
    this.undone = 0;
    if (this.turns.length > 40) this.turns.shift();
  }
  /**
   * UNDO-REDO, one step per request: a message with several requests ("draw a sky and a sun") calls this before each one. What the earlier request changed is kept as
   * its own entry of the timeline (`said` = the words of that request, `orig` as the user wrote them) and the next request starts from the library as it is now, so "undo" takes back the last
   * request, not the whole message. `snap` is the state of the worlds that do not derive it from the library, as it was before this request.
   */
  beginStep(said = null, snap = null, orig = null) {
    const c = this.cur;
    if (!c) return;
    const marks = this._moved(c);
    if (marks) this._keep(c, marks, c.said ?? null);
    this.cur = { turn: c.turn, marks: this._marks(), ops: this.ops, owners: new Set(), said, ...(snap ? { snap } : {}), ...(orig ? { orig } : {}) };
  }
  /** The state of the worlds that do not derive theirs from the library (JSON per world), for `beginStep`. */
  snapOwn(session) { return Object.fromEntries(Object.keys(session.state).filter((w) => !this.reasoner.stateOf.has(w)).map((w) => [w, JSON.stringify(session.state[w])])); }
  /** End of a dialogue turn: a turn that changed the library is kept, with its marks (what "undo that" and the dialogue layer's undo take back). */
  commitTurn(turn, said = null) {
    const c = this.cur;
    this.cur = null;
    if (c?.turn !== turn) return;
    const marks = this._moved(c);
    if (marks) this._keep(c, marks, c.said ?? said);
  }
  /** The library takes statements out (`retract`: what followed from them goes too) and the session memory with them; false (nothing changed) when the library will not. */
  retractFacts(ids, session, why = 'taken back') {
    const held = [...this.insts.values()].filter((i) => ids.some((id) => i.world.has(id)));
    const marks = new Map(held.map((i) => [i, i.world.mark()]));
    const undo = () => { for (const [i, m] of marks) i.world.rewind(m); };
    for (const id of ids) {
      for (const inst of held) {
        if (!inst.world.has(id)) continue;
        let r;
        try { r = inst.world.retract(id, { budget: this._limit() }); } catch { r = { ok: false }; }
        this._charge(inst.world);
        if (r.ok === false || r.violations?.length) { undo(); return false; }
      }
    }
    for (const x of this.sharedLog) if (!x.dead && ids.includes(x.w.id)) { x.dead = ++this.ops; }
    this._rebuildShared();
    this.told = this.told.filter((id) => !ids.includes(id));
    for (const id of ids) session.memory.retract(id, why);
    this.syncTo(session);
    return true;
  }
  /** After a rewind the turn in progress starts again from where the library is: a pure undo then changes nothing (it is not an action to take back), a repair that tells the corrected sentence does. */
  _restart() { if (this.cur) this.cur = { turn: this.cur.turn, marks: this._marks(), ops: this.ops, owners: this.cur.owners }; }
  /**
   * A world's action reports that something happened by itself in the middle of the user's turn: the engine's reply to an earlier move that landed late ("Meanwhile I
   * play ..."). It is not part of the user's step: the step begins again from the library as it is now, and the engine's move stays with the earlier step that caused it
   * (rewinding that step takes it back). So "undo" takes back exactly the user's own move, as the world's own undo does (REGRESSION-AB).
   */
  checkpoint(prefix = null) { if (prefix !== null && this.reasoner.live) this.ckpt = { prefix }; else this._restart(); }
  /** The mark of a turn that changed the library (undefined for a turn that did not). */
  markOf(turn) { return this.turns.find((t) => t.turn === turn)?.mark; }
  /** Is there something told in the last few turns to take back (or, once the user is undoing, anything left)? */
  canUndo(turn) { const t = this.turns.at(-1); return !!t && (this.undone > 0 || turn - t.turn <= 6); }   // in a run of undos (one per message) the history is walked back whatever its age
  /** "Undo that": the instances go back to before the last turn that changed the library (everything that followed from it goes too). Returns the turn's number or null. */
  undo(session, redos = null) {
    const modes = new Map([...this.reasoner.offerOf.keys()].map((id) => [id, session.state[id]?.inputMode ?? null]));
    const done = this._undo(session, redos);
    if (done != null) this._closeOffers(session, modes);
    return done;
  }
  /**
   * An undo of a confirmation (the state before the rewind had no open offer, the state after it has one) goes back to the library as it was when the offer was made,
   * so the offer it answered is open again. The world closes it (`closeOffer`), the instance takes the closed state over, and the turn is no step: "yes" afterwards
   * answers "Yes to what?" in both strategies (Q2 item 5a; dlg.avt#011).
   */
  _closeOffers(session, modes) {
    for (const [id, close] of this.reasoner.offerOf) {
      const st = session.state[id];
      if (modes.get(id) || !st || st.inputMode !== 'confirm') continue;
      try { close(st); } catch { continue; }
      this.adoptState(session, id);
      this._restart();   // the closing is bookkeeping: the undo turn starts from the library as it is now
    }
  }
  _undo(session, redos = null) {
    if (this.cur && !this._clean()) {   // "make it a pie chart then undo": what the same message changed before the undo goes back first, not the turn before
      const marks = new Map();
      for (const [id, e] of this.cur.marks) if (this.insts.get(id) && this.insts.get(id).world.stamp !== e.stamp) marks.set(id, e);
      const redo = this._back(marks, this.cur.ops, session);
      if (redos) redos.push(redo);
      this.undone++;
      return this.cur.turn;
    }
    const t = this.turns.at(-1);
    if (!t) return null;
    const redo = this.rewind(t.mark, session);
    if (redos) redos.push(redo);
    this.undone++;
    return t.turn;
  }
  /**
   * Puts the library back to the mark of a turn (every instance the turn and the turns after it changed goes back to its mark; the shared log with them) and the
   * session memory with it (the dialogue wires the library no longer holds are retracted there), and derives the state and the mirrors again. Returns a
   * function that undoes the rewind (a repair of the dialogue layer gives up with it).
   */
  rewind(mark, session, { restart = true } = {}) {
    const at = this.turns.findIndex((t) => t.mark === mark);
    const dropped = at < 0 ? [] : this.turns.splice(at);
    const group = dropped.length ? dropped.map((t) => t.mark) : [mark];
    const entries = new Map();
    for (const m of group) for (const [id, e] of m.marks) if (!entries.has(id)) entries.set(id, e);   // the earliest mark of each instance
    const redo = this._back(entries, group[0].ops, session, { restart });
    return () => { this.turns.push(...dropped); redo(); };
  }
  /** What `rewind` and `refuseFacts` share: the instances go back to the given marks, the shared log to `ops`; the memory, the state and the mirrors follow. */
  _back(entries, ops, session, { restart = true } = {}) {
    const after = new Map(), born = [];
    for (const [id] of entries) { const i = this.insts.get(id); if (i) after.set(i, i.world.mark()); }
    const log = this.sharedLog.map((x) => ({ ...x })), opsBefore = this.ops;
    this.sharedLog = this.sharedLog.filter((x) => x.add <= ops);
    for (const x of this.sharedLog) if (x.dead > ops) x.dead = 0;
    this.ops = ops;
    this._rebuildShared();
    for (const [id, e] of entries) {
      const i = this.insts.get(id);
      if (!i) continue;
      i.world.rewind(e.mark);
      if (e.birth) born.push(i);
    }
    for (const i of born) {   // back to the base: the wires of the older turns that it knows come from the log
      for (const x of this.sharedLog) {
        if (x.dead || !this.reasoner.knows(i.id, x.w.type) || i.world.has(x.w.id)) continue;
        try { i.world.tell([this._wire(x.w)], { budget: this._limit() }); } catch { /* stays out */ }
        this._charge(i.world);
      }
    }
    for (const id of this.reasoner.adoptOf.keys()) if (session.state[id]) this.written.set(id, this.reasoner.json(id, session.state[id]));   // the library is the record again: a state the operations changed is overwritten by what it says
    const told = this.told, gone = [];
    this.told = told.filter((id) => { if (this._held(id)) return true; const w = session.memory.get(id); if (w) gone.push(w); return false; });
    for (const w of gone) session.memory.retract(w.id, 'taken back');
    if (restart) this._restart();
    this.syncTo(session);
    return () => {
      for (const [i, m] of after) i.world.rewind(m);
      this.sharedLog = log; this.ops = opsBefore; this._rebuildShared();
      this.told = told;
      for (const w of gone) session.memory.own.add(w);
      this._restart();
      this.syncTo(session);
    };
  }

  /** The explanation of a wire as a tree: { wire, via?, told?, from: [...] } (library `explain` of the instance that holds it), or null. */
  explain(id) { return this._holder(id)?.world.explain(id) ?? null; }

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
    for (const id of ids ?? []) { try { walk(this.explain(id), 0); } catch { /* no explanation */ } }
    return [...out.values()].sort((a, b) => (a.seq ?? 1e9) - (b.seq ?? 1e9));
  }

  /** Library budget of the next call: what is left of this turn's budget (our step budget is the library's). */
  _limit() {
    const left = turnBudget.remaining?.('sopworld') ?? Infinity;
    return Number.isFinite(left) ? { steps: Math.max(1, left) } : undefined;
  }
  /** Steps of the last library call of a World are ticks of the turn budget, sites prefixed `sopworld.`; an excess ends the turn like any other. */
  _charge(world) {
    const st = world.stats();
    for (const [site, n] of Object.entries(st.sites ?? {})) if (n > 0) turnBudget.tick(`sopworld.${site}`, n);
  }

  /** Does the library answer this wire (a question of a matrix world's type, or a request of one's action)? */
  owns(wire) {
    const val = (k) => wire.entries.find((e) => e.key === k)?.value?.v;
    const L = this.reasoner.legends;
    if (L.isA(wire.type, 'core.question')) return !!this.reasoner.ownerOfType(val('core.question.type')) && !this.reasoner.opsKeys.has(`${val('core.question.type')}.${keyName(val('core.question.seek') ?? '')}`);
    if (L.isA(wire.type, 'core.request')) { const a = val('core.request.action'); return !!this.reasoner.ownerOfAction(a) && (!!this.reasoner.declOf(a) || this.reasoner.undoOf.has(a) || this.reasoner.redoOf.has(a)); }   // an action the matrix does not declare is the operations' (a world that keeps its state with `adopt`): no instance is made to ask the library
    return false;
  }

  /**
   * Answer a question or request wire in the instance of the world that owns it. Returns an envelope (spec 04) with `via: 'core.matrix'` and, in `vars`, the other
   * keys of the answer wire (or of the wires a refusal rests on) for the templates; or null when the library does not know it (the caller falls back).
   */
  resolve(wire, session = null) {
    const undo = !this.reasoner.legends.isA(wire.type, 'core.question') && this.reasoner.undoOf.get(wire.entries.find((e) => e.key === 'core.request.action')?.value?.v);
    const nArg = Number(wire.entries.find((e) => e.key === 'core.request.arg.n')?.value?.v);
    if (undo && session) return this.undoAction(undo, session, Number.isFinite(nArg) && nArg >= 1 ? Math.floor(nArg) : 1);
    const redo = !this.reasoner.legends.isA(wire.type, 'core.question') && this.reasoner.redoOf.get(wire.entries.find((e) => e.key === 'core.request.action')?.value?.v);
    if (redo && session) return this.redoAction(redo, session);
    const ownerId = this.reasoner.ownerOfWire(wire);
    if (!ownerId) return null;
    const inst = this._inst(ownerId);
    const lw = this._wire(wire);
    const isQuestion = this.reasoner.legends.isA(wire.type, 'core.question');
    const limit = this._limit();
    let r;
    const stamp0 = inst.world.stamp;
    this.reasoner.live = this.live ?? null;   // what the host offers an action while it runs: `request(action, args)` to ask another world (the active tab), `batch`
    this.ckpt = null;
    try {
      r = isQuestion ? inst.world.query(lw, { budget: limit }) : inst.world.act(lw, { budget: limit });
      // the action reported that the engine's late reply landed in it (`live.checkpoint`) and stopped there: that change is committed, the user's step begins after it (a mark cannot be taken in the middle of an action), and the action runs again on the position it left
      if (this.ckpt && !isQuestion) { const c = this.ckpt; this.ckpt = null; this._restart(); this.reasoner.live.carry = c.prefix; try { r = inst.world.act(lw, { budget: limit }); } finally { this.reasoner.live.carry = null; } }
    }
    catch (e) { return { status: 'error', note: `the reasoner failed: ${e?.message ?? e}`, via: 'core.matrix' }; }
    finally { this.reasoner.live = null; }
    this._charge(inst.world);
    if (!isQuestion && this.cur?.owners && inst.world.stamp !== stamp0 && this.reasoner.adoptOf.has(ownerId)) this.cur.owners.add(ownerId);   // an action of a world that takes its state over (`adopt`) changed its wires: a generic "undo that" is said in that world's words
    this.last = { wire: wire.id, result: r, inst };
    if (r.status === 'unsupported' && !r.reason) return null;   // the library does not know this question (a calculation that cannot be done has a reason)
    if (!isQuestion && r.status === 'done' && r.result?.decline === true) return null;   // an action that hands the request back to the world's operations (it changed nothing)
    const env = isQuestion ? this._questionEnvelope(r, lw, inst) : this._actionEnvelope(r, wire.entries.find((e) => e.key === 'core.request.action')?.value?.v);
    const answered = this._voice(wire, env, r, isQuestion, inst);
    if (isQuestion && r.status === 'supported' && !answered.from && r.supposed) this._restsLater(answered, r.supposed, inst);
    if (session) this._state(session, ownerId);
    return answered;
  }

  /** The library World of a matrix world for reading only: this session's instance when it has one, else a fork of the base (the same state: nothing was told). Registers nothing, so it is no change of the session. */
  peek(id) {
    const key = this.reasoner.instKey(id);
    return this.insts.get(key)?.world ?? this.reasoner.baseOf(key).fork();
  }

  /**
   * World-aware reading (spec 16): judge readings against this session's instances without telling anything. `readings` is a list of
   * `{ wires, unused }`: the dialogue wires of one reading and the content words of the message that it leaves out. Each is judged by the
   * library's `score` on the instance of the world that owns its request or question (the session's own instance when it has one, else a fork of
   * the base: the same state, since nothing was told), and the results are put in the library's order (`rank`, one list over all instances).
   * Returns `{ results, order, ranked }`; a result is the library's scored candidate plus `world` and `judged` (false when the library cannot judge the
   * reading: not a request or question of a matrix world, an action the matrix does not declare, undo and redo).
   */
  score(readings) {
    const lib = this.reasoner.lib;
    const peek = (key) => this.peek(key);
    const L = this.reasoner.legends;
    const val = (w, k) => w.entries.find((e) => e.key === k)?.value?.v;
    const results = readings.map((rd, index) => {
      const out = { index, judged: false, ok: true, violations: [], referents: [], lacks: [], assumes: [], world: null };
      const wire = (rd.wires ?? []).find((w) => L.isA(w.type, 'core.request') || L.isA(w.type, 'core.question'));
      if (!wire) return out;
      const isQ = L.isA(wire.type, 'core.question');
      const action = isQ ? null : val(wire, 'core.request.action');
      const ownerId = this.reasoner.ownerOfWire(wire);
      // an action the matrix does not declare is scored too: the library (>= 0.12) judges it by a fallback (referents, slots, denies) and says so in `judgedBy`
      if (!ownerId || (!isQ && (this.reasoner.undoOf.has(action) || this.reasoner.redoOf.has(action)))) return out;
      if (isQ && this.reasoner.opsKeys.has(`${val(wire, 'core.question.type')}.${keyName(val(wire, 'core.question.seek') ?? '')}`)) return out;
      const key = this.reasoner.instKey(ownerId);
      const world = peek(key);
      let cand;
      if (isQ) cand = { question: this._wire(wire) };
      else {
        const args = {};
        for (const e of wire.entries) if (e.key.startsWith('core.request.arg.')) args[e.key.slice('core.request.arg.'.length)] = String(e.value.v);
        cand = { action, args };
      }
      if (rd.unused?.length) cand.unused = [...rd.unused];
      let r;
      this.reasoner.live = null;
      try { r = world.score([cand], { budget: this._limit() }); } catch { return out; }
      this._charge(world);
      const c = r.candidates?.[0];
      if (!c) return out;
      // a reading is judged without the entity wires it mentions (they are only committed when it is acted on): a dangling reference is not an inconsistency
      if (!c.ok && c.violations.length) {
        const real = c.violations.filter((v) => !(v.kind === 'dangling-ref' || (v.kind === 'domain' && /^\$e\./.test(String(v.value ?? '')))));   // an uncommitted entity ($e.ben) is not a refusal
        if (!real.length) { c.ok = true; c.violations = []; } else c.violations = real;
      }
      // `judged` and `judgedBy` are the library's (a declared action, a statement or question, or the fallback for an action the matrix does not declare)
      let veto = null;
      try { veto = world.veto(r); } catch { /* the library's own answer is optional */ }
      return Object.assign(c, { index, world: ownerId, kind: isQ ? 'question' : 'request', actionName: action, libVeto: veto && { answer: veto.answer, reasons: veto.reasons.map((x) => x.reason) } });
    });
    // The order is the library's own (`rank`, RANKING). Since sopworld 0.13.1 (J1) a question given as a wire is understood by `score`, and a computed answer that does not
    // exist yet (a total) is not a lack, so the host no longer zeroes the `lacks` of a question reading. `libraryOrder` stays for the reports of disagreements (now the same).
    const { order, ranked } = lib.rank(results);
    return { results, order, ranked, libraryOrder: order };
  }

  /** An action another world asks for by name and arguments (no wire of the dialogue): its envelope when the library owns the action, else null. */
  request(action, args, session) {
    if (!this.reasoner.ownerOfAction(action) || !this.reasoner.declOf(action)) return null;
    const value = (v) => (/^[\w.-]+$/.test(String(v)) ? atomValue(v) : strValue(v));
    const entries = [{ key: 'core.request.action', value: atomValue(action) }, ...Object.entries(args ?? {}).map(([k, v]) => ({ key: `core.request.arg.${k}`, value: value(v) }))];
    return this.resolve({ id: 'req_via_world', type: 'core.request', entries }, session);
  }

  /**
   * The operations of a world with `adopt` (fns.mjs) changed its session state (an action, the modal input of an interview): the world's instance takes the new
   * state over as wires (`adopt({ state, find })` says which to retract and which to tell), so that undo, the rules and the explanation read what the operations
   * did. A state the rules cannot allow (a deny, a new soft issue) is refused: the instance goes back to before, the state with it, and the reason is returned
   * ({ world, why }); null when the library took the state over (or nothing changed). `adopt` touches only the world's own wires, so only its own instance is read.
   */
  adoptState(session, ownId = null) {
    let refused = null;
    for (const [id, w] of this.reasoner.adoptOf) {
      const cur = session.state[id];
      if (!cur) continue;
      const json = this.reasoner.json(id, cur);
      if ((this.written.get(id) ?? this.reasoner.emptyState(id).json) === json) continue;
      const inst = this._inst(id);
      let plan;
      try { plan = w.adopt({ state: cur, find: (t) => inst.world.ofType(t) }); } catch { plan = null; }
      const clean = this.cur ? inst.world.stamp === this.cur.marks.get(id)?.stamp && this.cur.ops === this.ops : false;
      const mark = inst.world.mark();
      const seen = new Set(this._issues(inst).map((i) => i.key));
      let bad = null;
      if (plan && (plan.retract?.length || plan.tell || plan.sets?.length || plan.replace?.length)) {
        // one transaction: the wires that changed are retracted and told together (a retract and a tell of their own cost a pass of the rules each)
        let r;
        const patch = { retract: (plan.retract ?? []).filter((rid) => inst.world.has(rid)) };
        if (plan.tell) patch.wires = plan.tell;
        if (plan.sets?.length) patch.sets = plan.sets;
        if (plan.replace?.length) patch.replace = plan.replace;   // a wire that changed keeps its id (library R6.9)
        try { r = inst.world.applyPatch(patch, { budget: this._limit() }); } catch (e) { r = { ok: false, violations: [{ kind: 'error', why: String(e?.message ?? e) }] }; }
        this._charge(inst.world);
        if (!r.ok) bad = r.violations?.[0]?.why ?? 'that cannot be true';
        if (!bad) {
          // a new standing issue is a refusal, except the advice of a soft rule of common sense (its rule id starts with `cs.d.`, spec 15 "Advice"): the state is kept and the
          // warning is said once, after what was done (`takeAdvice`)
          const added = this._issues(inst).filter((i) => !seen.has(i.key));
          const hard = added.find((i) => !isAdvice(i));
          if (hard) bad = unquote(first(hard.w.attrs.why) ?? '') || 'that cannot be true';
        }
      }
      if (bad) {
        inst.world.rewind(mark);
        const e = this.cur?.marks.get(id);
        if (clean && e) e.stamp = inst.world.stamp;   // nothing else changed the library in this turn: the turn is no action to take back
        refused = { world: id, why: bad };
      }
      if (!bad && plan?.quiet && clean) { const e = this.cur?.marks.get(id); if (e) e.stamp = inst.world.stamp; }   // bookkeeping only (`quiet`: a counter, a hint that was shown) and nothing else changed in this turn: it is no step to take back, so "undo" goes back over it to the move
      else if (!bad && this.cur?.owners && (plan?.retract?.length || plan?.tell || plan?.sets?.length || plan?.replace?.length) && (!this.reasoner.passive.has(id) || id === ownId)) this.cur.owners.add(id);
      this.written.set(id, json);   // the state is the library's to say again: derived and written back (the refused one is replaced by the one before)
      this._state(session, id);
    }
    if (!refused) this._collectAdvice();
    if (refused) {
      const t = String(refused.why).trim();   // a reason that ends in a question ("Which one is right?") keeps it
      refused.why = `${t.charAt(0).toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? '' : '.'}`;
    }
    return refused;
  }

  /**
   * Before the operations of a world with `guard` (fns.mjs) run: the world asks the rules whether the request's target exists and may be changed
   * (`guard({ action, args, state, check })`, `check({ wires })` is a dry run of the world's rules on its own instance). Returns the refusal
   * ({ status, note, why }) or null. The instance first takes over what changed the state since (`adoptState`); a refusal of that is the answer.
   */
  guardRequest(session, worldId, action, args) {
    const w = this.reasoner.guardOf.get(worldId);
    if (!w || !session.state[worldId]) return null;
    const bad = this.adoptState(session);
    if (bad) return { status: 'conflicting', why: bad.why, note: `That does not add up. ${bad.why}` };
    let held = null;
    const inst = () => (held ??= this._inst(worldId));   // the instance is made when the guard asks the rules, not for a request the guard has nothing to say about
    const check = ({ wires }) => { try { return inst().world.check({ wires }); } catch { return { ok: true }; } };
    let g = null;
    try { g = w.guard({ action, args, state: session.state[worldId], check, find: (ty) => inst().world.ofType(ty) }); } catch { g = null; }
    if (held) this._charge(held.world);
    return g ? { status: g.status ?? 'missing', note: g.note, why: g.why ?? g.note, ...(g.reason ? { reason: g.reason } : {}) } : null;
  }

  /** What a world's `toState` says of its instance now (null for a world without one). */
  stateOfWorld(id) {
    if (!this.reasoner.stateOf.has(id)) return null;
    const inst = this._inst(id);
    return this._toState(id, inst, this._redoCount(id));
  }
  /** How many undos of a world can be taken back (a world's `toState` may show it, the editor's redo button). */
  _redoCount(id) { let n = 0; for (const r of this.redos) if (r.world === id) n++; return n; }
  /**
   * What a world's `toState` says of its instance: a pure function of the instance, so it is computed once per instance state (`stamp`; the library gives a
   * state one stamp) and redo count, and every later reader gets a copy of that (Q2 item 6). `redo` is passed as the callers did: undefined where they gave none.
   */
  _toState(id, inst, redo) {
    const toState = this.reasoner.stateOf.get(id);
    const c = this.stateCache.get(id);
    // a copy keeps the hidden (non-enumerable) properties of the state, which a structured clone drops (ui.shell's `_titles`); they are read only, so they are shared
    const copy = (c) => { const x = structuredClone(c.state); for (const [k, v] of c.hidden) Object.defineProperty(x, k, { value: v, enumerable: false }); return x; };
    if (c && c.world === inst.world && c.stamp === inst.world.stamp && c.redo === redo) { this.stateHits++; return copy(c); }
    const state = toState({ find: (t) => inst.world.ofType(t), query: (q) => inst.world.query(q), redo });
    let keep;
    try { keep = structuredClone(state); } catch { this.stateCache.delete(id); return state; }   // not plain data: not cached
    const hidden = Object.getOwnPropertyNames(state).filter((k) => !Object.prototype.propertyIsEnumerable.call(state, k)).map((k) => [k, state[k]]);
    this.stateCache.set(id, { world: inst.world, stamp: inst.world.stamp, redo, state: keep, hidden });
    return state;
  }
  /**
   * The words of a generic "undo that" in a world's own voice (`undoWords` of its fns.mjs, over the states before and after): null when the world has none or
   * the words say nothing. `said` is the sentence the user had said.
   */
  undoSays(worldId, before, said) { return this.undoPatch(worldId, before, said)?.value ?? null; }
  /** The same with the rest of what the world says ({ value, openTab }), or null when the world has no words or the words say nothing (the state did not change in a way it can tell). */
  undoPatch(worldId, before, said) {
    const w = this.reasoner.wordsOf.get(worldId);
    if (!w) return null;
    try { const p = w.undoWords({ before, after: this.stateOfWorld(worldId), said }); return p?.value ? p : null; } catch { return null; }
  }
  /**
   * "Undo": the newest turn of the session that changed anything goes back, whichever world it belongs to (one timeline across the instances), and the reply names
   * what was taken back: in the words of the world the turn concerned (`undoWords` over its state before and after) or, when that world has none or cannot tell
   * what changed, "OK, I took that back: "<what the user said>"". Returns { turn, value, openTab? }, or null when there is nothing left to take back.
   */
  undoLast(session, said = null) {
    const t = this.turns.at(-1);
    if (!t) return null;
    said ??= t.said ?? null;
    const w = t.worlds.length === 1 && this.reasoner.wordsOf.has(t.worlds[0]) ? t.worlds[0] : null;
    const before = w ? this.stateOfWorld(w) : null;
    const group = [];
    const turn = this.undo(session, group);
    const quote = said ? String(said).replace(/[.!?\s]+$/, '') : '';
    if (group.length) this.redos.push({ world: w, undo: group, said: t.said ?? null, orig: t.orig ?? null, turn });
    const patch = w ? this.undoPatch(w, before, quote || null) : null;
    return { turn, value: patch?.value ?? (quote ? `OK, I took that back: "${quote}".` : 'OK, I took that back.'), quote: patch?.value || !quote ? null : quote, orig: t.orig ?? null, openTab: patch?.openTab };
  }

  // ---- UNDO-REDO: redo, the whole message, a named step -----------------------------------------------------------------------------

  /** The world object that speaks for a world id in undo and redo (`undoWords`), or null. */
  _speaker(id) { return id ? (this.reasoner.wordsOf.get(id) ?? [...this.reasoner.undoOf.values()].find((x) => x.id === id) ?? null) : null; }
  /**
   * "Redo": the library goes forward again to what the last undo took out (the undo of an undo; a new action emptied the list). The reply says what was redone, in the
   * words of the world (`undoWords` with `redo`) or by quoting what the user had said. Null when there is nothing to redo.
   */
  redoLast(session) {
    const r = this.redos.pop();
    if (!r) return null;
    const sp = this._speaker(r.world);
    const before = sp && this.reasoner.stateOf.has(r.world) ? this.stateOfWorld(r.world) : null;
    for (const f of [...r.undo].reverse()) f();
    if (r.world) this._state(session, r.world);
    const quote = r.said ? String(r.said).replace(/[.!?\s]+$/, '') : '';
    let patch = null;
    if (sp?.undoWords && sp.redoAction) { try { patch = sp.undoWords({ before: before ?? {}, after: this.reasoner.stateOf.has(r.world) ? this.stateOfWorld(r.world) : null, redo: true, said: quote || null }); } catch { patch = null; } }
    let value = patch?.value;
    if (!value) value = quote ? `OK, I did it again: "${quote}".` : 'OK, I did it again.';   // a world with no words of its own: the request that came back is quoted
    return { value, quote: quote || null, orig: r.orig ?? null, turn: r.turn ?? null, openTab: patch?.openTab };
  }
  /** The entries of the last message (its requests, last one first): the tail of the timeline that shares the newest turn number. */
  lastMessage() {
    const out = [];
    for (let k = this.turns.length - 1; k >= 0 && this.turns[k].turn === this.turns.at(-1).turn; k--) out.push(this.turns[k]);
    return out;
  }
  /** "Undo the whole message": every request of the last message that changed anything goes back (one redo takes them all out again). */
  undoMessage(session) {
    const g = this.lastMessage();
    if (!g.length) return null;
    const first = g.at(-1);
    const group = [];
    const turn = first.turn;
    const worlds = new Set(g.flatMap((t) => t.worlds));
    const redo = this.rewind(first.mark, session);
    group.push(redo);
    this.undone++;
    this.redos.push({ world: worlds.size === 1 ? [...worlds][0] : null, undo: group, said: g.at(-1).said ?? null, orig: null, turn, whole: g.length });
    return { turn, count: g.length, said: g.map((t) => t.said).reverse().filter(Boolean) };
  }
  /**
   * The earlier step of the timeline a name points at: the newest entry whose request has all the words (a plural matches its singular), or null. `words` are the
   * content words of "undo the sun".
   */
  findStep(words) {
    const norm = (w) => String(w).toLowerCase().replace(/(?:ies)$/, 'y').replace(/(?:es|s)$/, '');
    const want = words.map(norm);
    for (let k = this.turns.length - 1; k >= 0; k--) {
      const have = new Set(String(this.turns[k].said ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(Boolean).flatMap((w) => [w, norm(w)]));
      if (want.every((w) => have.has(w))) return k;
    }
    return -1;
  }
  /** The later steps that rest on step `k`: the entries after it that moved an instance it moved (or the shared log, or a world it concerned). */
  dependents(k) {
    const e = this.turns[k], later = this.turns.slice(k + 1);
    const insts = new Set(e.mark.marks.keys());
    const next = later[0];
    const sharedMoved = !!next && next.mark.ops !== e.mark.ops;   // it told the shared log: the later steps may rest on it
    return later.filter((t) => sharedMoved || [...t.mark.marks.keys()].some((id) => insts.has(id)) || t.worlds.some((w) => e.worlds.includes(w)));
  }
  /**
   * "Undo the X" when step `k` does not touch what the later steps touch: only that step goes back (its instances to its mark), the others stay as they are.
   * Returns { turn, said, orig } and keeps a redo that puts it back in its place.
   */
  undoStep(session, k) {
    const e = this.turns[k];
    const entries = new Map(e.mark.marks);
    const redo = this._back(entries, this.ops, session);
    this.turns.splice(k, 1);
    const again = () => { this.turns.splice(Math.min(k, this.turns.length), 0, e); redo(); };
    this.redos.push({ world: e.worlds.length === 1 ? e.worlds[0] : null, undo: [again], said: e.said ?? null, orig: e.orig ?? null, turn: e.turn });
    this.undone++;
    return { turn: e.turn, said: e.said ?? null, orig: e.orig ?? null };
  }
  /** "Undo the X" when later steps rest on it: step `k` and everything after it go back. */
  undoThrough(session, k) {
    const e = this.turns[k];
    const group = [];
    const redo = this.rewind(e.mark, session);
    group.push(redo);
    this.undone++;
    this.redos.push({ world: null, undo: group, said: e.said ?? null, orig: e.orig ?? null, turn: e.turn });
    return { turn: e.turn, said: e.said ?? null, orig: e.orig ?? null };
  }

  /**
   * A world's own "undo" action (world.sop `undo=`): the library goes back to before the last turn that changed it, `n` times; the world says what that was
   * (`undoWords`). A step that only moved what the user looks at (`isView` of the world: selection, cursor) is not counted: it goes back with the next one.
   * What was taken out is kept for `redoAction`.
   */
  undoAction(world, session, n = 1) {
    if (!world.isView && n <= 1) return this._undoOne(world, session);   // a world without views or counted undos: the session timeline names what it took back
    const inst = this._inst(world.id);
    const stateNow = () => this._toState(world.id, inst, undefined);
    const mine = (t) => t.worlds?.includes(world.id);   // a turn that changed this world (a tab switch of the shell or a turn of another world is not one of its steps)
    const before = this.turns.some(mine) ? stateNow() : null;
    let turn = null, steps = 0, said = null, orig = null;
    const group = [];
    for (let k = 0; this.turns.some(mine) && steps < n && k < 60; k++) {
      const own = mine(this.turns.at(-1));
      if (!own) {   // UNDO-REDO: a step of another world (a tab switch, a request made elsewhere) is a request of its own, never taken back together with this world's: "undo" goes to it
        if (!group.length) return this._undoOne(world, session);
        break;
      }
      const t = this.turns.at(-1);
      const was = world.isView ? stateNow() : null;
      turn = this.undo(session, group);
      const counted = !world.isView?.({ before: was, after: stateNow() });
      if (counted) { steps++; if (said === null) { said = t.said ?? null; orig = t.orig ?? null; } }
    }
    if (group.length) this.redos.push({ world: world.id, undo: group, said, orig, turn });
    const patch = world.undoWords?.({ before, after: before ? stateNow() : null, steps }) ?? (before ? { value: 'OK, I took that back.' } : { status: 'missing', note: 'There is nothing to undo yet.' });
    this._state(session, world.id);
    return { via: 'core.matrix', status: 'supported', ...patch, undoneTurn: turn };
  }
  /** The undo of a world without views: the newest turn of the session goes back and the reply names it (`undoLast`). */
  _undoOne(world, session) {
    const turn = this.turns.at(-1)?.turn;
    if (turn == null) {
      const note = this.undone ? 'There is nothing more to undo.' : (world.undoWords?.({ before: null, after: null })?.note ?? 'There is nothing to undo yet.');
      return { via: 'core.matrix', status: 'missing', note, undoneTurn: null };
    }
    const r = this.undoLast(session);
    this._state(session, world.id);
    return { via: 'core.matrix', status: 'supported', value: r.value, ...(r.openTab ? { openTab: r.openTab } : {}), undoneTurn: r.turn };
  }
  /** A world's own "redo" action: puts back what the last undo took out (the library as it was before it, with the turns), and says what that was. */
  redoAction(world, session) {
    const r = this.redoLast(session);
    if (!r) return { via: 'core.matrix', status: 'missing', note: world.undoWords?.({ before: null, after: null, redo: true })?.note ?? 'There is nothing to redo.' };
    this._state(session, world.id);
    return { via: 'core.matrix', status: 'supported', value: r.value, ...(r.openTab ? { openTab: r.openTab } : {}) };
  }

  /** The owning world's `voice(ctx)` (fns.mjs) puts the words around the numbers on the envelope (`note`, `unit`, `vars`); the templates stay ours. */
  _voice(wire, env, result, isQuestion, inst) {
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
    const issues = () => this._issues(inst).map((i) => this._issueInfo(i));
    let patch;
    try { patch = voice({ kind: isQuestion ? 'question' : 'request', type, action, where, env, supposed, issues, find: (t) => inst.world.ofType(t), name: (id) => this._nameOf(id, inst) }); }
    catch (e) { return { ...env, note: env.note ?? `the reply words failed: ${e?.message ?? e}` }; }
    return patch ? { ...env, ...patch } : env;
  }

  /**
   * A computed answer (a total) is worked out on a supposed wire that the library takes away again, so its `from` is empty. The facts it rests on are
   * found when someone asks ("what did you do?"): the world as it was is forked (nothing is copied) and the supposed wire is told to it again.
   * `env.fromLater()` (not enumerable, so it is not part of the envelope) returns the told dialogue-wire ids, or [].
   */
  _restsLater(env, sup, inst) {
    const snap = inst.world.fork();
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

  _questionEnvelope(r, lw, inst) {
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
    if (r.status === 'supported') this._assumed(env, r.rests, inst);
    return env;
  }

  /**
   * Certainty (spec 15): an answer that rests on a value of tier `default` or `guessed` (`rests` of the library's result) says so once and records it.
   * `env.assumptions` are the cells ("w2.count=1 (default)"), `env.assumed` the sentence ("I assumed 1 ball."). The words of a cell come from the owning
   * world's `assumed(cell)` (fns.mjs): a phrase, or null for a default that is not worth saying; without one, "<key> is <value>".
   */
  _assumed(env, rests, inst) {
    const cells = [], words = [];
    for (const c of rests ?? []) {
      if (c.tier !== 'default' && c.tier !== 'guessed') continue;
      const w = inst.world.get(c.id);
      const cell = { id: c.id, key: keyName(c.key), value: unquote(bare(c.value)), tier: c.tier, type: w?.type ?? null, attrs: flat(w?.attrs), name: (id) => this._nameOf(id, inst) };
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
      const inst = this._instOfType(w.type);
      const lw = inst?.world.get(w.id);
      if (!lw) { out.push(w); continue; }
      const have = new Set(w.entries.map((e) => keyName(e.key)));
      const extra = [];
      for (const [k, v] of Object.entries(lw.attrs ?? {})) {
        turnBudget.tick('sopworld.explain');
        const name = keyName(k);
        if (name.startsWith('core') || have.has(name) || inst.world.tier(lw.id, k) !== 'default') continue;
        const value = unquote(bare(first(v)));
        const hook = this.reasoner.assumedBy.get(this.reasoner.ownerOfType(lw.type));
        let said;
        try { said = hook ? hook({ id: lw.id, key: name, value, tier: 'default', type: lw.type, attrs: flat(lw.attrs), name: (id) => this._nameOf(id, inst) }) : undefined; } catch { said = undefined; }
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
      const decl = this.reasoner.declOf(String(action ?? ''));
      const tpl = key && decl?.[`template.${key}`];
      if (tpl) env.pending = { world: this.reasoner.ownerOfAction(action), key, template: unquote(first(tpl)) };
    } else if (r.status === 'refused') {
      Object.assign(env, { status: 'conflicting', reason: 'precondition_failed', why: r.violations?.[0]?.why });
    } else if (r.status === 'budget') {
      Object.assign(env, { status: 'budget', note: 'compute budget reached' });
    } else Object.assign(env, { status: 'error', note: `the reasoner could not do that (${r.status})` });
    return env;
  }

  /** Display name of an entity for the words of a reply (the `name` of its wire in the instance in use, then in the others, else its id without the prefix). */
  _nameOf(id, inst = null) {
    const key = bare(id);
    let n = inst?.world.get(key)?.attrs?.name?.[0];
    if (n === undefined) for (const i of this.insts.values()) { n = i.world.get(key)?.attrs?.name?.[0]; if (n !== undefined) break; }
    return n ? unquote(n) : String(id).replace(/^e\./, '').replace(/_/g, ' ');
  }

  /**
   * The state ops.mjs would keep (spec 15), derived from the library: the hooks of a world and the dialogue layer's snapshots read it from the session. Like the
   * operations' state it comes into being the first time the world answers (`touched`) or has something to say: a session that never used a world has none of
   * it. A world's state is derived from its own instance only; a world with no instance has the empty state.
   */
  _state(session, touched = null) {
    for (const [id] of this.reasoner.stateOf) {
      try {
        const inst = this.insts.get(this.reasoner.instKey(id));
        let cur = session.state[id];
        if (!inst && !cur && id !== touched) continue;   // a world nobody used: no instance, no state
        const rc = this._redoCount(id);
        const stamp = `${inst ? inst.world.stamp : -1}/${rc}`;
        let d = this.derived.get(id);
        if (d?.stamp !== stamp) { d = { stamp, json: undefined }; this.derived.set(id, d); }   // what toState said of this very instance state (an instance state has one stamp)
        if (cur && this.reasoner.adoptOf.has(id) && this.reasoner.json(id, cur) !== (this.written.get(id) ?? this.reasoner.emptyState(id).json)) continue;   // the operations changed it since the library said it: `adoptState` takes it over first
        if (cur && d.json !== undefined && d.json === this.reasoner.json(id, cur)) { this.written.set(id, d.json); continue; }   // the state already is what the library says
        let next, json;
        if (inst) { next = this._toState(id, inst, rc); json = this.reasoner.json(id, next); }
        else { const e = this.reasoner.emptyState(id); if (e.json === '') continue; next = structuredClone(e.obj); json = e.json; }
        d.json = json;
        if (!cur) {
          if (id !== touched && json === this.reasoner.emptyState(id).json) continue;
          cur = (session.state[id] = {});
        }
        if (json === this.reasoner.json(id, cur)) { this.written.set(id, json); continue; }
        for (const k of Object.keys(cur)) delete cur[k];
        Object.assign(cur, next);
        this.written.set(id, this.reasoner.json(id, cur));
      } catch { /* the state stays as it was */ }
    }
  }

  /**
   * Derives the state of the matrix worlds from the library and copies the wires of the mirrored types (world.sop `mirror=`) from the instance of the world that
   * declares them into the session memory, in our wire shape: what a matrix action wrote is then visible to the worlds that read the memory (charts, documents),
   * as what ops.mjs emitted was. A wire the action removed is retracted there.
   */
  syncTo(session) {
    const L = this.reasoner.legends;
    this._state(session);
    for (const [type, worldId] of this.reasoner.mirrorTypes) {
      const live = new Set();
      for (const w of this.insts.get(this.reasoner.instKey(worldId))?.world.ofType(type) ?? []) {
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
}
