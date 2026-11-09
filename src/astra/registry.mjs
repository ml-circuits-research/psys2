/**
 * ASTRA registry (spec 13 section 1, ADR-008): chats, discussions and world instances. Browser-safe, no imports from node, no I/O.
 *
 * Worlds keep reading and writing `session.state[worldId]`. The `binding` is the only bridge between that map and the instances:
 *   binding = { get(world) -> state | undefined, set(world, state) (replaces the contents), initial(world) -> fresh state }
 * Per world exactly one instance is live (`live[world]`). Activating a discussion swaps its instances in; worlds it has no instance of are
 * untouched, so the legacy cross-tab behaviour is unchanged.
 */
import { EventLog } from './log.mjs';
import { applyMove } from './moves.mjs';

/** Worlds whose state is the user scope (shared by every discussion, never instanced, never swapped). */
export const USER_SCOPE = new Set(['ui.shell', 'ui.help', 'kids.common', 'core', 'lang.common', 'user.profile']);
export const STATUSES = ['active', 'suspended', 'completed', 'abandoned'];
/** How many acts keep their `before` snapshot for undo. */
export const UNDO_DEPTH = 20;

const clone = (v) => (v === undefined ? undefined : structuredClone(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export class Astra {
  constructor({ binding, tabOf = () => null, titleOf = (w) => w, chatKey = 'default' } = {}) {
    this.binding = binding ?? { get: () => undefined, set() {}, initial: () => ({}) };
    this.tabOf = tabOf;       // world id -> tab id | null
    this.titleOf = titleOf;   // world id -> display title
    this.chatKey = chatKey;
    this.counters = { d: 0, i: 0 };
    this.discussions = new Map();
    this.instances = new Map();
    this.live = {};           // world -> instance id
    this.tabs = {};           // tab -> discussion id the tab resumes
    this.active = null;       // discussion id
    this.log = new EventLog();
    this.acts = [];           // newest first, { msgId, text, discussion, worlds, moves, before } (before only for the newest UNDO_DEPTH)
  }

  // ---- discussions ---------------------------------------------------------------------------------------------------

  discussion(id) { return this.discussions.get(id) ?? null; }
  instance(id) { return this.instances.get(id) ?? null; }
  instancesOf(discId) { return (this.discussion(discId)?.instances ?? []).map((i) => this.instances.get(i)).filter(Boolean); }
  activeDiscussion() { return this.active ? this.discussion(this.active) : null; }

  /** All discussions, optionally of one tab and/or status, newest activity first; the current one of the tab (or the active one) leads. */
  list({ tab, status, world } = {}) {
    let out = [...this.discussions.values()];
    if (tab !== undefined) out = out.filter((d) => d.tab === tab);
    if (status) out = out.filter((d) => d.status === status);
    if (world) out = out.filter((d) => this.instancesOf(d.id).some((i) => i.world === world));
    const lead = tab !== undefined ? this.tabs[tab] : this.active;
    return out.sort((a, b) => (b.id === lead) - (a.id === lead) || b.updated - a.updated || b.created - a.created);
  }

  discussionsOfTab(tab) { return this.list({ tab }); }

  createDiscussion({ title, goal = null, tab = null, world = null, activate = true } = {}) {
    const id = `d${++this.counters.d}`;
    const base = title ?? (world ? this.titleOf(world) : 'Discussion');
    const same_ = [...this.discussions.values()].filter((d) => d.baseTitle === base).length;
    const d = {
      id, title: same_ ? `${base} ${same_ + 1}` : base, baseTitle: base, goal, status: 'suspended', tab, instances: [],
      context: { is: { facts: [], qud: [], commitments: [], proposals: [], moves: [] } }, openQuestions: [], plan: [],
      agenda: { frames: [] }, focus: { stack: [] }, revision: 0, created: 0, updated: 0, lastMsg: null,
    };
    d.created = d.updated = this._tick();
    this.discussions.set(id, d);
    this.log.append({ discussion: id, type: 'discussion', data: { title: d.title, tab } });
    if (activate) this.activate(id);
    return d;
  }

  _setStatus(d, status) {
    if (d.status === status) return;
    d.status = status; d.revision++;
    this.log.append({ discussion: d.id, type: status === 'active' ? 'resume' : 'suspend', data: { status } });
  }

  /** Make `id` the active discussion and the one its tab resumes; its instances are swapped into the binding. */
  activate(id) {
    const d = this.discussion(id);
    if (!d) return null;
    const loaded = [];
    for (const inst of this.instancesOf(id)) if (this._load(inst)) loaded.push(inst.world);
    const prev = d.tab != null ? this.discussion(this.tabs[d.tab]) : null;
    if (prev && prev.id !== id && prev.status === 'active') this._setStatus(prev, 'suspended');
    const before = this.active && this.active !== id ? this.discussion(this.active) : null;
    if (before && before.tab === d.tab && before.status === 'active') this._setStatus(before, 'suspended');
    this._setStatus(d, 'active');
    this.active = id;
    if (d.tab != null) this.tabs[d.tab] = id;
    return { discussion: d, loaded };
  }

  suspend(id) { const d = this.discussion(id); if (!d) return false; for (const i of this.instancesOf(id)) this.saveOut(i); this._setStatus(d, 'suspended'); return true; }
  complete(id) { const d = this.discussion(id); if (!d) return false; for (const i of this.instancesOf(id)) this.saveOut(i); this._setStatus(d, 'completed'); return true; }
  abandon(id) { const d = this.discussion(id); if (!d) return false; for (const i of this.instancesOf(id)) this.saveOut(i); this._setStatus(d, 'abandoned'); return true; }

  /** The host brought a tab forward: resume that tab's discussion (when it has one that is not the active one). */
  onTabChange(tab) {
    const id = this.tabs[tab];
    if (!id || id === this.active) return null;
    const d = this.discussion(id);
    if (!d || d.status === 'completed' || d.status === 'abandoned') return null;
    return this.activate(id);
  }

  // ---- instances -------------------------------------------------------------------------------------------------------

  /**
   * A new instance of `world` in discussion `discId`. Adopting (`adopt: true`) takes the current live state of the world as the
   * instance state; otherwise the live instance of that world is saved out and a fresh initial state is loaded ("a new chess game").
   */
  newInstance(discId, world, { adopt = false } = {}) {
    const d = this.discussion(discId);
    if (!d || USER_SCOPE.has(world)) return null;
    const inst = { id: `i${++this.counters.i}`, world, discussion: discId, version: 0, state: null, links: [] };
    this.instances.set(inst.id, inst);
    d.instances.push(inst.id); d.revision++;
    const cur = this.instances.get(this.live[world]);
    if (adopt) {
      if (cur) this.saveOut(cur);
      inst.state = clone(this.binding.get(world)) ?? clone(this.binding.initial(world)) ?? {};
      this.live[world] = inst.id;
    } else {
      if (cur) this.saveOut(cur);
      inst.state = clone(this.binding.initial(world)) ?? {};
      this.binding.set(world, clone(inst.state));
      this.live[world] = inst.id;
    }
    this.log.append({ discussion: discId, instance: inst.id, type: 'instance', data: { world, adopt } });
    return inst;
  }

  /** Another discussion references the instance (shares it, does not copy it). */
  link(discId, instId) {
    const d = this.discussion(discId), inst = this.instance(instId);
    if (!d || !inst || inst.discussion === discId || inst.links.includes(discId)) return false;
    inst.links.push(discId);
    d.instances.push(inst.id); d.revision++;
    return true;
  }

  /** Copy the live state into the instance record (version +1 when it changed). */
  saveOut(inst) {
    if (!inst || this.live[inst.world] !== inst.id) return false;
    const cur = this.binding.get(inst.world);
    if (cur === undefined) return false;
    if (!same(cur, inst.state)) { inst.state = clone(cur); inst.version++; }
    return true;
  }

  /** Make `inst` the live instance of its world: the live one is saved out, the saved state is loaded. */
  _load(inst) {
    const cur = this.live[inst.world];
    if (cur === inst.id) return false;
    const old = this.instances.get(cur);
    if (old) this.saveOut(old);
    this.binding.set(inst.world, clone(inst.state) ?? clone(this.binding.initial(inst.world)) ?? {});
    this.live[inst.world] = inst.id;
    return true;
  }

  /** Save out every live instance (before a snapshot). */
  saveAll() { for (const id of Object.values(this.live)) this.saveOut(this.instances.get(id)); }

  // ---- turns -------------------------------------------------------------------------------------------------------------

  /**
   * Bookkeeping after a turn (no reading, no I/O). `changed` are the worlds whose state changed, `before` their JSON before the turn
   * (world -> string | undefined), `moves` the typed moves of the turn. Returns the act record, or null when nothing was attributed.
   */
  afterTurn({ msgId, text = '', changed = [], before = {}, tab = null, moves = [] } = {}) {
    const worlds = changed.filter((w) => !USER_SCOPE.has(w) && this.binding.get(w) !== undefined);
    let disc = null;
    const beforeByInst = {};
    for (const w of worlds) {
      let inst = this.instances.get(this.live[w]);
      if (!inst) {
        const wt = this.tabOf(w);
        const host = (wt != null ? this.discussion(this.tabs[wt]) : null)
          ?? this.activeDiscussion()
          ?? this.createDiscussion({ world: w, tab: wt ?? tab, activate: false });
        // a world of another tab never lands in a discussion that is itself about a different tab: it gets its own
        const target = wt != null && host.tab != null && host.tab !== wt ? (this.discussion(this.tabs[wt]) ?? this.createDiscussion({ world: w, tab: wt, activate: false })) : host;
        inst = this.newInstance(target.id, w, { adopt: true });
        if (host.instances.length === 1 && !host.goal && host.baseTitle === 'Discussion') { host.baseTitle = this.titleOf(w); host.title = host.baseTitle; }
      }
      beforeByInst[inst.id] = before[w];
      disc ??= this.discussion(inst.discussion);
    }
    disc ??= this.activeDiscussion();
    if (!disc) return null;
    // the discussion that took the turn is now the active one and its tab's current one (instances already live stay live)
    if (this.active !== disc.id) {
      const prev = this.activeDiscussion();
      if (prev && prev.tab === disc.tab && prev.status === 'active') this._setStatus(prev, 'suspended');
      this.active = disc.id;
    }
    if (disc.tab != null) this.tabs[disc.tab] = disc.id;
    this._setStatus(disc, 'active');
    disc.updated = this._tick();
    disc.lastMsg = msgId ?? null;
    disc.revision++;
    for (const m of moves) applyMove(disc, m);
    const act = { msgId: msgId ?? null, text, discussion: disc.id, worlds, moves: moves.map((m) => m.type), before: beforeByInst };
    this.acts.unshift(act);
    for (let k = UNDO_DEPTH; k < this.acts.length; k++) this.acts[k].before = {};
    if (this.acts.length > 200) this.acts.length = 200;
    this.log.append({ discussion: disc.id, type: 'act', msg: msgId ?? null, data: { text, worlds, moves: act.moves, before: beforeByInst } });
    return act;
  }

  _tick() { this._clock = (this._clock ?? 0) + 1; return this._clock; }

  // ---- undo, effects (log module) -----------------------------------------------------------------------------------

  /** Undo the newest act of `discId` (default: the active discussion) by restoring the instance states it changed. */
  undo(discId = this.active) {
    const k = this.acts.findIndex((a) => a.discussion === discId && Object.keys(a.before).length && !a.undone);
    if (k < 0) return null;
    const act = this.acts[k];
    const restored = [];
    for (const [instId, json] of Object.entries(act.before)) {
      const inst = this.instances.get(instId);
      if (!inst) continue;
      const state = json === undefined ? clone(this.binding.initial(inst.world)) ?? {} : JSON.parse(json);
      inst.state = clone(state); inst.version++;
      if (this.live[inst.world] === inst.id) this.binding.set(inst.world, clone(state));
      restored.push(inst.world);
    }
    act.undone = true;
    this.log.append({ discussion: discId, type: 'undo', msg: act.msgId, data: { worlds: restored } });
    return { act, worlds: restored };
  }

  /** True when the effect with this execution id was not logged yet (and logs it): a restore or a replay never repeats an effect. */
  shouldRun(exec, info = {}) { return this.log.effect(exec, info); }

  // ---- guard integration ------------------------------------------------------------------------------------------------

  /** Cheap capture for the turn guard's undo snapshot: instance states are replaced, never mutated, so they are shared. */
  capture() {
    return {
      counters: { ...this.counters }, discussions: [...this.discussions.values()].map((d) => structuredClone(d)),
      instances: [...this.instances.values()].map((i) => ({ ...i, links: [...i.links] })), live: { ...this.live }, tabs: { ...this.tabs },
      active: this.active, logLen: this.log.length, acts: this.acts.map((a) => ({ ...a })), clock: this._clock ?? 0,
    };
  }

  rollback(c) {
    if (!c) return;
    this.counters = { ...c.counters };
    this.discussions = new Map(c.discussions.map((d) => [d.id, d]));
    this.instances = new Map(c.instances.map((i) => [i.id, i]));
    this.live = { ...c.live }; this.tabs = { ...c.tabs }; this.active = c.active;
    this.log.truncate(c.logLen); this.acts = c.acts; this._clock = c.clock;
  }
}
