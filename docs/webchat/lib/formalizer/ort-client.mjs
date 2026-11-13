// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Client of the dedicated ORT worker (HANG2). Browser-safe: no `node:*` imports; the host passes `spawn()` which returns a Worker-like
 * object running docs/webchat/ui/ort-worker.mjs (tests pass a fake). It replaces onnxruntime-web's own `proxy = true` mode, which we cannot
 * control: its proxy transfers (detaches) the input buffers, so a second `run` that reuses a tensor (the normalizer's decode loop reuses the
 * cross-attention tensors) fails with "An ArrayBuffer is detached", and the proxy then stalls every later call (8 s watchdog on the next turns).
 *
 * What this adds over the proxy:
 *   - inputs are copied (structured clone), never transferred, so a tensor can be fed again;
 *   - every call has a deadline and an optional abort signal; a call that passes either is rejected at once;
 *   - the worker is told to cancel the job; a queued job is dropped; when the running job does not stop within `graceMs` (1500 ms by default; a number or a function read at cancel time, so Settings applies live) the worker is
 *     terminated and re-created, and its sessions are loaded again from their sources (the host's `source()` reads the Cache API), so the next
 *     turn works;
 *   - every request and response is logged (id, time) when `log` is given, and counted in `stats`.
 *
 * Each `opts.lane` (default 'default') has its own worker, so a long session load of one model never blocks the calls of the other.
 *
 * The object `client.ort` has the part of the onnxruntime API that the runtimes use: `Tensor`, `InferenceSession.create(source, opts)` and
 * `session.run(feeds, { signal, deadlineMs, fetch })` (`fetch`: the output names the caller needs; the worker computes and copies only those). `source` is a Uint8Array or a function returning one (or a promise of one); with a function the
 * session survives a restart. `opts.deadlineMs` (a number or a function) is the default deadline of the session's calls; `opts.name` labels the log.
 */

import { guard } from './guard.mjs?v=5528007fa9';
import { budget } from '../dialog/budget.mjs?v=123c3e1329';

export class OrtTimeout extends Error {
  constructor(label, ms) { super(`${label} timed out after ${ms} ms`); this.name = 'OrtTimeout'; this.label = label; }
}
export class OrtAborted extends Error {
  constructor(label) { super(`${label} aborted`); this.name = 'OrtAborted'; this.label = label; }
}

class Tensor {
  constructor(type, data, dims) { this.type = type; this.data = data; this.dims = dims ?? [data.length]; }
}

export class OrtPaused extends Error {
  constructor(reason) { super(`models paused: ${reason}`); this.name = 'OrtPaused'; this.reason = reason; }
}

/**
 * Quick device-speed calibration (FREEZE 5): times a fixed amount of arithmetic on the calling thread and returns a factor >= 1 (1 = a fast desktop core,
 * 4 = a 4x slower or 4x throttled one). The client multiplies its deadlines and grace by it, so a slow or loaded device is not mistaken for a hung worker.
 * The best of three runs is taken (a transient hiccup should not inflate it); the result is clamped to [1, 8].
 */
export const CALIBRATION_REFERENCE_MS = 12;   // time of the loop below on the reference device (about the aarch64 dev machine; a typical desktop core is faster, so it measures 1)
export function measureDeviceSpeed({ now = () => globalThis.performance?.now?.() ?? Date.now(), reference = CALIBRATION_REFERENCE_MS } = {}) {
  let best = Infinity, sink = 0;
  for (let r = 0; r < 3; r++) {
    const t0 = now();
    for (let i = 1; i < 1500000; i++) sink += Math.sqrt(i) % 7;
    best = Math.min(best, now() - t0);
  }
  if (sink < 0) return 1;   // keeps the loop alive
  return Math.min(8, Math.max(1, Math.round((best / reference) * 10) / 10));
}

export function createOrtClient({ spawn, graceMs = 1500, defaultDeadlineMs = 3000, log = null, restartBudget = { max: 2, windowMs: 5 * 60 * 1000 }, speed = 1, onPause = null, now = () => globalThis.performance?.now?.() ?? Date.now() } = {}) {
  if (typeof spawn !== 'function') throw new Error('createOrtClient needs spawn(lane)');
  let seq = 0, sidSeq = 0;
  let paused = null;                   // { reason, at } while the restart budget is spent: no model call is made, the rules answer
  const restartTimes = [];             // times of the restarts inside the budget window
  let speedFactor = speed;             // device-speed factor (measureDeviceSpeed); a number or a function
  const scale = () => Math.max(1, Number(typeof speedFactor === 'function' ? speedFactor() : speedFactor) || 1);
  const lanes = new Map();             // lane name -> { name, worker, generation, pending: Map(id -> { resolve, reject, label, t0, timer, graceTimer, zombie }) }
  const sessions = new Map();          // sid -> { sid, lane, name, source, opts, deadlineMs, ready }
  const stats = { requests: 0, responses: 0, timeouts: 0, aborts: 0, restarts: 0, pauses: 0, cancelled: 0, byLabel: {} };
  const emit = (...a) => { if (log) try { log(...a); } catch { /* logging must not break a call */ } };
  const laneOf = (name) => { let l = lanes.get(name); if (!l) lanes.set(name, l = { name, worker: null, generation: 0, pending: new Map() }); return l; };

  const ensureWorker = (lane) => {
    if (lane.worker) return lane.worker;
    const g = ++lane.generation;
    const w = lane.worker = spawn(lane.name);
    w.onmessage = (ev) => {
      if (g !== lane.generation) return;                // a message of a terminated worker
      const m = ev.data ?? ev;
      const p = lane.pending.get(m.id);
      if (!p) return;
      lane.pending.delete(m.id);
      clearTimeout(p.timer); clearTimeout(p.graceTimer);
      stats.responses++;
      emit('res', m.id, p.label, Math.round(now() - p.t0), m.error ? `error ${m.error}` : m.cancelled ? 'cancelled' : 'ok');
      if (p.zombie) return;                             // already rejected to the caller; this was only the worker finishing or acknowledging the cancel
      if (m.error) p.reject(new Error(String(m.error))); else p.resolve(m);
    };
    w.onerror = (e) => { emit('worker-error', lane.name, String(e?.message ?? e)); };
    return w;
  };
  const post = (lane, msg, transfer) => { const w = ensureWorker(lane); try { w.postMessage(msg, transfer ?? []); } catch (e) { throw new Error(`ORT worker postMessage failed: ${e?.message ?? e}`); } };

  /** Terminates the worker of a lane, fails every call in flight on it and starts loading its sessions again in the background. */
  const restart = (lane, why) => {
    const t = now();
    while (restartTimes.length && t - restartTimes[0] > restartBudget.windowMs) { budget.tick('ort-client.restart'); restartTimes.shift(); }
    const over = restartTimes.length >= restartBudget.max;   // FREEZE 5: a third restart inside the window is a restart spiral; stop reloading ~160 MB of sessions
    if (over) { paused = { reason: `${restartBudget.max} worker restarts within ${Math.round(restartBudget.windowMs / 60000)} minutes (${why})`, at: t }; stats.pauses++; emit('pause', lane.name, paused.reason); try { onPause?.(paused); } catch { /* a listener must not break recovery */ } }
    else { restartTimes.push(t); stats.restarts++; emit('restart', lane.name, why); }
    try { lane.worker?.terminate?.(); } catch { /* already gone */ }
    lane.worker = null; lane.generation++;
    for (const [id, p] of lane.pending) { clearTimeout(p.timer); clearTimeout(p.graceTimer); if (!p.zombie) p.reject(over ? new OrtPaused(paused.reason) : new Error('ORT worker restarted')); lane.pending.delete(id); }
    for (const s of sessions.values()) if (s.lane === lane) { s.ready = null; if (!over && typeof s.source === 'function') s.ready = load(s).catch(() => {}); }
  };

  const request = (lane, label, msg, { deadlineMs, signal, transfer } = {}) => new Promise((resolve, reject) => {
    if (paused) { reject(new OrtPaused(paused.reason)); return; }
    const id = ++seq;
    const t0 = now();
    stats.requests++; stats.byLabel[label] = (stats.byLabel[label] ?? 0) + 1;
    const p = { resolve, reject, label, t0, timer: null, graceTimer: null, zombie: false };
    lane.pending.set(id, p);
    const cancel = (err, kind) => {
      if (p.zombie || !lane.pending.has(id)) return;
      p.zombie = true; stats[kind]++;
      clearTimeout(p.timer);
      emit('cancel', id, label, Math.round(now() - t0), kind);
      reject(err);
      try { post(lane, { op: 'cancel', id }); } catch { /* worker already dead */ }
      const grace = Math.round((typeof graceMs === 'function' ? graceMs() : graceMs) * scale());
      p.graceTimer = setTimeout(() => { if (lane.pending.has(id)) { lane.pending.delete(id); restart(lane, `${label} #${id} did not stop within ${grace} ms`); } }, grace);
    };
    p.cancel = cancel;
    if (signal?.aborted) { cancel(new OrtAborted(label), 'aborts'); return; }
    signal?.addEventListener?.('abort', () => cancel(new OrtAborted(label), 'aborts'), { once: true });
    const ms = (typeof deadlineMs === 'function' ? deadlineMs() : (deadlineMs ?? defaultDeadlineMs)) * scale();
    if (Number.isFinite(ms)) p.timer = setTimeout(() => cancel(new OrtTimeout(label, ms), 'timeouts'), ms);
    emit('req', id, label);
    try { post(lane, { ...msg, id }, transfer); } catch (e) { lane.pending.delete(id); clearTimeout(p.timer); reject(e); }
  });

  const load = (s) => (async () => {
    const bytes = typeof s.source === 'function' ? await s.source() : s.source;
    const fresh = typeof s.source === 'function';      // a source function hands out fresh bytes each time: transfer them (no copy of ~100 MB)
    await request(s.lane, `create ${s.name}`, { op: 'create', sid: s.sid, bytes, opts: s.opts }, { deadlineMs: 60000, transfer: fresh && bytes?.buffer ? [bytes.buffer] : [] });
  })();

  const wrapOut = (outs) => { const o = {}; for (const [k, v] of Object.entries(outs)) o[k] = new Tensor(v.type, v.data, v.dims); return o; };

  const ort = {
    Tensor,
    InferenceSession: {
      async create(source, opts = {}) {
        if (paused) throw new OrtPaused(paused.reason);
        const { name = `session${sidSeq + 1}`, deadlineMs, lane = 'default', ...ortOpts } = opts;
        const s = { sid: ++sidSeq, lane: laneOf(lane), name, source, opts: ortOpts, deadlineMs, ready: null };
        sessions.set(s.sid, s);
        s.ready = load(s);
        await s.ready;
        return {
          name,
          async run(feeds, { signal = null, deadlineMs: d, fetch = null } = {}) {
            if (paused) throw new OrtPaused(paused.reason);
            if (!s.ready) s.ready = load(s);              // after a restart without a source function it loads from the bytes it kept
            await s.ready;
            const f = {};
            for (const [k, t] of Object.entries(feeds)) f[k] = { type: t.type, data: t.data, dims: t.dims };
            // inside a turn the call also ends with the turn: its abort signal and what is left of its hard deadline
            const left = guard.remaining();
            const m = await request(s.lane, name, { op: 'run', sid: s.sid, feeds: f, ...(fetch ? { fetch } : {}) }, { deadlineMs: Math.min(d ?? (typeof s.deadlineMs === 'function' ? s.deadlineMs() : s.deadlineMs) ?? defaultDeadlineMs, Math.max(left, 1)), signal: signal ?? guard.signal });
            return wrapOut(m.outputs);
          },
          release() { sessions.delete(s.sid); try { post(s.lane, { op: 'release', sid: s.sid }); } catch { /* ignore */ } },
        };
      },
    },
  };

  return {
    ort, stats, sessions, lanes,
    get restarts() { return stats.restarts; },
    /** Null, or { reason, at } while the restart budget is spent (models paused, rules answer). */
    get paused() { return paused; },
    /** Lifts the pause (the person asked for the models again) and clears the restart history. */
    resume() { paused = null; restartTimes.length = 0; },
    /** Device-speed factor applied to every deadline and grace period. */
    get speed() { return scale(); },
    set speed(v) { speedFactor = v; },
    /** Calls in flight (all lanes). */
    get inFlight() { let n = 0; for (const l of lanes.values()) for (const p of l.pending.values()) if (!p.zombie) n++; return n; },
    /** Rejects every call in flight; a worker that does not finish its job within the grace period is restarted. */
    cancelAll() { for (const l of lanes.values()) for (const p of [...l.pending.values()]) p.cancel?.(new OrtAborted(p.label), 'cancelled'); },
    restart: (laneName = 'default', why = 'requested') => restart(laneOf(laneName), why),
    terminate() { for (const l of lanes.values()) { try { l.worker?.terminate?.(); } catch { /* ignore */ } l.worker = null; l.generation++; l.pending.clear(); } },
  };
}
