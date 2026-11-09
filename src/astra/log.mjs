/**
 * ASTRA event log (spec 13 section 6): append-only events per chat, plus the execution ids of external effects.
 * Browser-safe, no I/O.
 */
export const LOG_LIMIT = 1000;

export class EventLog {
  constructor() {
    this.events = [];
    this.seq = 0;            // total number of events ever appended (the next event gets seq + 1)
    this.execs = new Map();  // execution id -> seq of the `effect` event that logged it
  }

  get length() { return this.seq; }

  /** Append `{ discussion, instance?, type, msg?, data? }`; returns the stored event. */
  append(ev) {
    const e = { seq: ++this.seq, discussion: ev.discussion ?? null, instance: ev.instance ?? null, type: ev.type, msg: ev.msg ?? null, data: ev.data ?? {} };
    this.events.push(e);
    if (this.events.length > LOG_LIMIT) this.events.splice(0, this.events.length - LOG_LIMIT);
    return e;
  }

  /** Log an external effect by execution id. True the first time (the host may run it), false when it was logged before. */
  effect(exec, info = {}) {
    if (exec == null || this.execs.has(exec)) return false;
    const e = this.append({ discussion: info.discussion ?? null, type: 'effect', msg: info.msg ?? null, data: { exec, name: info.name ?? null } });
    this.execs.set(exec, e.seq);
    return true;
  }

  /** Drop everything after `seq` (an aborted turn). */
  truncate(seq) {
    if (seq >= this.seq) return;
    this.events = this.events.filter((e) => e.seq <= seq);
    this.seq = seq;
    for (const [k, s] of this.execs) if (s > seq) this.execs.delete(k);
  }

  of(discussion) { return this.events.filter((e) => e.discussion === discussion); }
  tail(n = 20) { return this.events.slice(-n); }

  toJSON() { return { seq: this.seq, events: this.events, execs: [...this.execs] }; }

  static fromJSON(j) {
    const l = new EventLog();
    if (!j) return l;
    l.seq = j.seq ?? 0; l.events = Array.isArray(j.events) ? j.events : []; l.execs = new Map(j.execs ?? []);
    return l;
  }
}
