/**
 * Per-session state of the rule formalizer: counters, agent entities and mention recency
 * (spec 03 section 3). Browser-safe.
 */
import { makeWire, str, atom } from '../../soplang/index.mjs?v=c57881f705';
import { en } from '../../lang/en.mjs?v=9b3d9a4e48';

const PRONOUNS = en.refers('session.agent');   // pronoun -> what it stands for: m, f, any, user, assistant (handover/lang.en pronouns)

/** Words that are capitalized at sentence start but are never names. */
export const STOP_WORDS = new Set(`a an the and or but then if so how what who whom whose where when which why is are was were be
does do did can could will would shall should may might must has have had get got give gives gave this that these those there here
it its not no yes please hello hi hey thanks thank goodbye bye ok okay well monday tuesday wednesday thursday friday saturday sunday
january february march april may june july august september october november december of in on at to for with from by about`.split(/\s+/));

export class FormSession {
  constructor() {
    this._seq = 0;
    this._ids = 0;
    this.turn = null;        // the dialogue turn that is being read: the ids made in it carry it (`t12_w3`), so two requests never make the same id (spec 15, "Namespaces")
    this.agents = new Map(); // id -> { id, name, gender, special }
    this.recent = [];        // agent ids, most recent last
    this.items = new Map();  // `${lexiconId}\u0000${agentId | '*'}` -> most recently mentioned item (ellipsis, spec 03)
  }

  /** Remember that `item` (a lexicon entry of `lexId`) was just mentioned together with these agents. */
  noteItem(lexId, item, agentIds = []) {
    for (const id of [...agentIds, '*']) this.items.set(lexId + '\u0000' + id, item);
  }

  /** Item most recently mentioned for the agent, else in the session; undefined when none (no guessing). */
  recentItem(lexId, agentId) {
    return (agentId && this.items.get(lexId + '\u0000' + agentId)) || this.items.get(lexId + '\u0000*');
  }

  /** Copy of the mutable state, for trial readings (spec 03 section 1c). */
  snapshot() { return { seq: this._seq, ids: this._ids, turn: this.turn, agents: new Map(this.agents), recent: [...this.recent], items: new Map(this.items) }; }
  restore(s) { this._seq = s.seq; this._ids = s.ids; this.turn = s.turn ?? null; this.agents = new Map(s.agents); this.recent = [...s.recent]; this.items = new Map(s.items); }

  /** Independent copy (agent records are copied too). */
  clone() {
    const f = new FormSession();
    f._seq = this._seq; f._ids = this._ids; f.turn = this.turn; f.recent = [...this.recent]; f.items = new Map(this.items);
    f.agents = new Map([...this.agents].map(([k, v]) => [k, { ...v }]));
    return f;
  }

  nextSeq() { return ++this._seq; }
  /** A new wire id: `w7`, or `t12_w7` while turn 12 is being read (the counter is the session's, so an id is never made twice either way). */
  freshId(prefix = 'w') { const n = ++this._ids; return this.turn == null ? prefix + n : `t${this.turn}_${prefix}${n}`; }

  /** Register the built-in agents e.user and e.assistant; returns their wires. */
  initDefaults({ userName = 'User', assistantName = 'PSys2' } = {}) {
    const wires = [];
    for (const [id, name] of [['e.user', userName], ['e.assistant', assistantName]]) {
      this.agents.set(id, { id, name, gender: undefined, special: true });
      wires.push(makeWire(id, 'core.agent', [['core.agent.name', str(name)]]));
    }
    return wires;
  }

  /** Candidate for a name token (no mutation). */
  candidateForName(raw, gender) {
    const id = 'e.' + raw.toLowerCase();
    const known = this.agents.get(id);
    return known ? { id, name: known.name, gender: known.gender, isNew: false }
      : { id, name: raw.replace(/^\p{Ll}/u, (c) => c.toUpperCase()), gender, isNew: true };
  }

  /** Resolve a pronoun to an existing agent (no mutation); null when it cannot be resolved. */
  resolvePronoun(lower) {
    const kind = PRONOUNS[lower];
    if (!kind) return null;
    if (kind === 'user' || kind === 'assistant') {
      const a = this.agents.get('e.' + kind);
      return a ? { id: a.id, name: a.name, gender: a.gender, isNew: false, pronoun: true } : null;
    }
    for (let k = this.recent.length - 1; k >= 0; k--) {
      const a = this.agents.get(this.recent[k]);
      if (!a || a.special) continue;
      if (kind === 'any' || !a.gender || a.gender === kind) return { id: a.id, name: a.name, gender: a.gender, isNew: false, pronoun: true };
    }
    return null;
  }

  /** Commit a candidate: register if new (returns the entity wire) and mark it most recent. */
  commit(c) {
    let wire = null;
    if (!this.agents.has(c.id)) {
      this.agents.set(c.id, { id: c.id, name: c.name, gender: c.gender, special: false });
      const pairs = [['core.agent.name', str(c.name)]];
      if (c.gender) pairs.push(['core.agent.gender', atom(c.gender)]);
      wire = makeWire(c.id, 'core.agent', pairs);
    }
    const a = this.agents.get(c.id);
    if (!a.special) {
      this.recent = this.recent.filter((x) => x !== c.id);
      this.recent.push(c.id);
    }
    return wire;
  }
}

/** True when the lowercase word is a pronoun the resolver knows. */
export const isPronoun = (lower) => lower in PRONOUNS;
