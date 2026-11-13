// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Per-message stage timing (PERF, spec 06 "Webchat" performance). Browser-safe: no `node:*` imports.
 *
 * `DialogSession.send` opens a record (`perf.start()`), the stages add to it, and the reply carries it as `reply.perf`:
 *   { total, stages: { <name>: { n, ms } } }
 * Stages are inclusive (a stage contains the stages that run inside it), so the numbers do not add up to `total`.
 * Nested sends (the validator replays earlier messages in scratch sessions) do not open a record of their own; their time lands in the
 * `seed` stage. Outside a record every call is a no-op, so the cost when nobody looks is a null check.
 */
import { guard } from './guard.mjs?v=eb1a66f556';
const now = () => globalThis.performance?.now?.() ?? Date.now();
let cur = null;

export const perf = {
  get active() { return cur !== null; },
  /** Opens a record unless one is open already; returns true when this call opened it (the caller must `end()`). */
  start() { if (cur) return false; cur = { t0: now(), stages: Object.create(null) }; return true; },
  add(stage, ms, n = 1) {
    if (!cur) return;
    const s = (cur.stages[stage] ??= { n: 0, ms: 0 });
    s.n += n; s.ms += ms;
  },
  /** Counts an event without time. */
  count(stage, n = 1) { this.add(stage, 0, n); },
  async time(stage, fn) {
    guard.check(stage);   // every timed stage is a cancellation point (turn guard)
    if (!cur) return fn();
    const t = now();
    try { return await fn(); } finally { this.add(stage, now() - t); }
  },
  timeSync(stage, fn) {
    guard.check(stage);
    if (!cur) return fn();
    const t = now();
    try { return fn(); } finally { this.add(stage, now() - t); }
  },
  /** Closes the record and returns it (`{ total, stages }`, times rounded to 0.1 ms). */
  end() {
    const c = cur; cur = null;
    if (!c) return null;
    const stages = {};
    for (const [k, v] of Object.entries(c.stages)) stages[k] = { n: v.n, ms: Math.round(v.ms * 10) / 10 };
    return { total: Math.round((now() - c.t0) * 10) / 10, stages };
  },
};
