// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Turn guard (spec 06 "Turn lifecycle"): one cooperative cancellation and deadline mechanism for everything a turn does.
 * Browser-safe: no `node:*` imports.
 *
 * `DialogSession.send` installs a guard for the outermost send of a turn (`guard.install({ signal, hardMs, softMs })`).
 * Every stage of the pipeline then calls
 *   guard.check(stage)   throws TurnAborted when the signal fired or the hard deadline passed (sticky: once tripped, every check throws);
 *   guard.soft()         true when the turn is aborted (stopped or hard deadline; no clock of its own): loops that search for a better reading stop and
 *                        keep the best they have ("degrade to best so far");
 *   guard.abortable(p)   races a promise with the signal and the hard deadline, so an await on the turn path always settles.
 * `perf.time` / `perf.timeSync` call `check` on entry and record the current stage, so every timed stage is a cancellation point.
 * Outside a turn (no guard installed) every call is a cheap no-op.
 */
const now = () => globalThis.performance?.now?.() ?? Date.now();

export class TurnAborted extends Error {
  constructor(reason, stage) {
    super(reason === 'stopped' ? 'stopped' : 'time limit');
    this.name = 'TurnAborted';
    this.reason = reason;   // 'stopped' | 'timeout'
    this.stage = stage ?? null;
  }
}

let cur = null;

export const guard = {
  get active() { return cur !== null; },
  get stage() { return cur?.stage ?? null; },
  /** The AbortSignal of the turn in progress (null outside a turn or without one). */
  get signal() { return cur?.signal ?? null; },
  get tripped() { return cur?.tripped ?? null; },
  get trippedStage() { return cur?.trippedStage ?? null; },
  /**
   * Installs a guard unless one is installed already (nested sends: the validator replays earlier messages in scratch sessions) and returns its token,
   * or null when it joined the guard in place. `force` replaces the guard in place (a host turn with its own signal and deadline).
   * The caller of a non-null token must `release(token)`.
   */
  install({ signal = null, hardMs = Infinity, softMs = Infinity, t0 = now(), force = false } = {}) {
    if (cur && !force) return null;
    cur = { signal, hardAt: t0 + hardMs, softAt: t0 + softMs, stage: 'start', tripped: null, trippedStage: null, waiters: new Set() };
    return cur;
  },
  /** Releases the guard of `token` (a no-op when another guard replaced it in the meantime: a stale turn must not release the new turn's guard). */
  release(token) { if (token && cur === token) { cur = null; for (const w of token.waiters) w(); } },
  setStage(stage) { if (cur) cur.stage = stage; },
  /** Throws TurnAborted at a cancellation point. */
  check(stage) {
    const c = cur;
    if (!c) return;
    if (stage) c.stage = stage;
    if (!c.tripped) {
      if (c.signal?.aborted) c.tripped = c.signal.reason?.name === 'TimeoutError' ? 'timeout' : 'stopped';
      else if (now() > c.hardAt) c.tripped = 'timeout';
      if (c.tripped) c.trippedStage = c.stage;
    }
    if (c.tripped) throw new TurnAborted(c.tripped, c.trippedStage);
  },
  /** True when search loops must stop and keep their best result: the turn was stopped or hit the hard deadline. `softMs` of `install` is accepted but no longer used (a clock must not change a reading). */
  soft() {
    const c = cur;
    if (!c) return false;
    return !!c.tripped || !!c.signal?.aborted;   // never the clock: what a search loop keeps must not depend on machine speed (step budgets bound the work)
  },
  /** Remaining milliseconds until the hard deadline (Infinity outside a turn). */
  remaining() { return cur ? cur.hardAt - now() : Infinity; },
  /** `promise` settles with the first of: its own outcome, the abort signal, the hard deadline. */
  abortable(promise, stage) {
    const c = cur;
    if (!c) return promise;
    if (stage) c.stage = stage;
    return new Promise((resolve, reject) => {
      let timer = null;
      const fail = (reason) => { if (!c.tripped) { c.tripped = reason; c.trippedStage = stage ?? c.stage; } cleanup(); reject(new TurnAborted(c.tripped, c.trippedStage)); };
      const onAbort = () => fail(c.signal?.reason?.name === 'TimeoutError' ? 'timeout' : 'stopped');
      const cleanup = () => { clearTimeout(timer); c.signal?.removeEventListener?.('abort', onAbort); c.waiters.delete(cleanup); };
      c.waiters.add(cleanup);
      if (c.signal?.aborted) return onAbort();
      c.signal?.addEventListener?.('abort', onAbort, { once: true });
      if (Number.isFinite(c.hardAt)) timer = setTimeout(() => fail('timeout'), Math.max(0, c.hardAt - now()));
      Promise.resolve(promise).then((v) => { cleanup(); resolve(v); }, (e) => { cleanup(); reject(e); });
    });
  },
};

/**
 * Host helper: a promise that settles within `ms` whatever `promise` does (for host effects, tab applies, browser APIs).
 * Rejects with Error(`${label} timed out`) or with the abort reason of `signal`.
 */
export function withDeadline(promise, ms, { signal = null, label = 'operation' } = {}) {
  return new Promise((resolve, reject) => {
    let timer = null;
    const onAbort = () => { cleanup(); reject(new TurnAborted(signal.reason?.name === 'TimeoutError' ? 'timeout' : 'stopped', guard.active ? guard.stage : label)); };   // the stage the turn was in when it was stopped
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener?.('abort', onAbort); };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener?.('abort', onAbort, { once: true });
    timer = setTimeout(() => { cleanup(); reject(new Error(`${label} timed out after ${ms} ms`)); }, ms);
    Promise.resolve(promise).then((v) => { cleanup(); resolve(v); }, (e) => { cleanup(); reject(e); });
  });
}
