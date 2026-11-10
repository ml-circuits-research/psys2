// Page side of the engine worker (COMPUTE-BUDGET items 1 and 3, spec 06 "Engine worker"): starts ui/engine-worker.mjs, gives the host a `session`
// with the methods the UI used to call on the in-page DialogSession, and guards every request:
//   - a turn (or dry read) that does not answer is ended: abort message first, then, after a short grace, the worker is TERMINATED and a new one starts
//     from the last committed world state (the only way to stop synchronous JavaScript; Stop and the watchdog always work);
//   - an input (normalized text + tab) that needed a kill, ended in BudgetExceeded or crashed the worker is remembered for the session and never run
//     again: not by a retry, a dry run, the voice end-of-turn check, the next identical message or a worker restart; the stored outcome is reused;
//   - the page owns the ORT workers (MessageChannel bridge), so they are stopped with the engine worker.
// Browser-safe, no `node:*`. `spawn` and `now` are injectable for tests.
import { TurnAborted } from '../lib/formalizer/guard.mjs';

export const KNOWN_SLOW_TEXT = 'I stopped that same request earlier because it took too long, so I did not try it again. Please word it differently.';
export const TOO_COMPLEX_TEXT = 'That was too complex for me. Try a shorter sentence.';
const ABORT_GRACE_MS = 300;       // a turn that has not answered this long after the abort message is killed
const MAX_BOOT_FAILURES = 3;      // consecutive failed starts, then the engine stays down (no endless restart loop)
const MAX_RESTARTS_PER_TURN = 1;  // a turn is never re-sent by the client; the next message starts a worker if the last one died

export const badKeyOf = (text, tab) => `${String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim()}|${tab ?? ''}`;

export function createEngineClient({ base, versions = {}, getSettings, getTab = () => null, onEvent = () => {}, browserCall = null, spawn = null, testHooks = false, limits = { watchdogMs: 8000 }, log = () => {} }) {
  const stats = { starts: 0, kills: [], crashes: 0, sends: 0, dryRuns: 0, refused: 0, restartsThisTurn: 0, startTimeouts: 0 };
  const bad = new Map();            // badKeyOf -> { reason, stage, at, text, tab, site }
  const cache = { state: {}, meta: null };
  let worker = null, gen = 0, seq = 0, undoSeq = 0, stage = null, bootFailures = 0, down = null;
  let readyP = null, bootInfo = null, booting = false, lastBoot = null;
  const pending = new Map();        // id -> { resolve, reject, op, text, key, kind }
  const ortWorkers = new Set();
  let lastUsage = { usage: [], detection: [] };
  const zombies = new Set();        // ids of requests the host abandoned (Stop, watchdog) that the worker has not settled yet: a new request waits for them
  let restorePending = null, restoreTimer = 0;   // a restore asked while the worker was still busy with an abandoned request
  const options = {};               // local mirror of session options (nx, formalizer)

  const workerUrl = () => new URL('ui/engine-worker.mjs', base).href + (versions['ui/engine-worker.mjs'] ? `?v=${versions['ui/engine-worker.mjs']}` : '');
  const ortUrl = () => new URL('ui/ort-worker.mjs', base).href + (versions['ui/ort-worker.mjs'] ? `?v=${versions['ui/ort-worker.mjs']}` : '');

  function killWorker(why) {
    const w = worker; worker = null; gen++;
    try { w?.terminate?.(); } catch { /* gone */ }
    for (const o of ortWorkers) { try { o.terminate(); } catch { /* gone */ } }
    ortWorkers.clear();
    const err = Object.assign(new Error(`engine worker stopped (${why})`), { name: 'EngineRestarted', reason: why });
    for (const [id, p] of [...pending]) { pending.delete(id); p.reject(err); }
  }

  function bridgeOrt(m) {
    const o = spawn ? null : new Worker(ortUrl(), { type: 'module' });
    if (!o) { m.port.close?.(); return; }
    ortWorkers.add(o);
    const port = m.port;
    port.onmessage = (ev) => {
      const d = ev.data;
      if (d?.__terminate) { try { o.terminate(); } catch { /* gone */ } ortWorkers.delete(o); try { port.close(); } catch { /* gone */ } return; }
      const t = d?.op === 'create' && d.bytes?.buffer instanceof ArrayBuffer ? [d.bytes.buffer] : [];
      try { o.postMessage(d, t); } catch (e) { log('ort-bridge', String(e?.message ?? e)); }
    };
    o.onmessage = (ev) => {
      const d = ev.data;
      const t = d?.outputs ? Object.values(d.outputs).map((x) => x?.data?.buffer).filter((b) => b instanceof ArrayBuffer) : [];
      try { port.postMessage(d, t); } catch { /* port closed */ }
    };
    o.onerror = (e) => log('ort-worker-error', String(e?.message ?? e));
  }

  function onMessage(g, ev) {
    if (g !== gen) return;   // a message of a terminated worker
    const m = ev.data;
    if (m.type === 'res') {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.ok) p.resolve(m.value); else p.reject(Object.assign(new Error(m.error?.message ?? 'engine error'), m.error ?? {}));
    } else if (m.type === 'evt') {
      if (m.name === 'stage') { stage = m.data; return; }
      try { onEvent(m.name, m.data); } catch (e) { log('event-handler', String(e?.message ?? e)); }
    } else if (m.type === 'spawn-ort') bridgeOrt(m);
    else if (m.type === 'bt') {   // the worker asks for the page's on-device translator / language detector (windows only); it waits at most its own deadline for the answer
      const reply = (ok, v) => { if (g === gen) post({ type: 'bt-res', id: m.id, ok, ...(ok ? { value: v } : { error: String(v?.message ?? v) }) }); };
      if (!browserCall) reply(false, 'no browser API'); else Promise.resolve().then(() => browserCall(m.op, m)).then((v) => reply(true, v), (e) => reply(false, e));
    }
  }

  function post(msg, transfer) { worker?.postMessage(msg, transfer ?? []); }
  function rawCall(op, payload = {}, extra = {}) {
    const id = ++seq;
    const { skipPost, ...rest } = extra;
    return { id, promise: new Promise((resolve, reject) => { pending.set(id, { resolve, reject, op, id, ...rest }); try { if (!skipPost) post({ op, id, ...payload }); } catch (e) { pending.delete(id); reject(e); } }) };
  }

  /** Starts a worker (the first one, or the replacement of a killed one) and resolves when it has loaded the worlds. */
  function start(restore = null) {
    if (down) return Promise.reject(down);
    booting = true; stage = null;
    const g = gen;
    const w = spawn ? spawn() : new Worker(workerUrl(), { type: 'module' });
    worker = w; stats.starts++;
    w.onmessage = (ev) => onMessage(g, ev);
    w.onerror = (e) => { if (g !== gen) return; stats.crashes++; log('worker-error', String(e?.message ?? e)); crashed('error', String(e?.message ?? e)); };
    w.onmessageerror = () => { if (g === gen) crashed('messageerror', 'message could not be read'); };
    const init = lastBoot ? { ...lastBoot } : null;
    const payload = { ...(init ?? {}), settings: getSettings(), restoreState: restore?.state ?? null, restoreMeta: restore?.meta ?? null, prepareModels: !!restore && !!lastBoot?.modelsWanted?.() };
    delete payload.modelsWanted;
    const hang = testHooks && !!restore && globalThis.__psys2StartHang === true;   // tests only: the replacement worker never becomes ready (start-limit test)
    const { promise } = rawCall('init', { ...payload, versions, testHooks }, { skipPost: hang });
    // start limit: a worker that is not ready in time is a distinct error (the engine stays down until the page is reloaded), never a chain of kills
    const startMs = limits.startMs ?? 60000;
    const startTimer = setTimeout(() => {
      if (g !== gen || !booting) return;
      stats.startTimeouts++;
      down = Object.assign(new Error(`the engine could not restart in ${Math.round(startMs / 1000)} s`), { name: 'EngineDown', reason: 'start-timeout' });
      log('engine-start-timeout', down.message);
      try { onEvent('engine-down', { reason: 'start-timeout', message: down.message, startMs }); } catch { /* ignore */ }
      killWorker('start-timeout');   // rejects the init request: booting is cleared below
    }, startMs);
    return promise.then((info) => { clearTimeout(startTimer); booting = false; bootFailures = 0; bootInfo = info; cache.state = info.state ?? cache.state; return info; },
      (e) => { clearTimeout(startTimer); booting = false; bootFailures++; if (!down && bootFailures >= MAX_BOOT_FAILURES) down = Object.assign(new Error(`the engine could not start (${e?.message ?? e})`), { name: 'EngineDown' }); throw down ?? e; });
  }
  /** The worker crashed or died by itself: whatever ran is remembered as bad; the next request finds a new worker. */
  function crashed(reason, message) {
    const inflight = [...pending.values()].filter((p) => p.kind === 'send' || p.kind === 'dry');
    for (const p of inflight) rememberBad(p, reason, { message });
    killWorker(reason);
    respawn();
  }
  function rememberBad(p, reason, extra = {}) {
    if (!p?.key) return null;
    const rec = { reason, stage: extra.stage ?? stage ?? null, site: extra.site ?? null, at: Date.now(), text: p.text, tab: p.tab ?? null, kind: p.kind, ...(extra.message ? { message: extra.message } : {}) };
    bad.set(p.key, rec);
    stats.kills.push({ reason, stage: rec.stage, site: rec.site, text: p.text, tab: p.tab ?? null, kind: p.kind, at: new Date(rec.at).toISOString() });
    if (stats.kills.length > 50) stats.kills.shift();
    return rec;
  }
  function respawn(state = cache.state, meta = cache.meta) {
    if (worker || down) return readyP;
    readyP = start({ state, meta });
    readyP.catch(() => {});
    return readyP;
  }
  const ready = async () => { if (!readyP) throw new Error('engine not started'); await readyP; };
  /** True while a request would have to wait: a replacement worker is starting, an abandoned request is still being ended, or no worker runs. */
  const restarting = () => !down && (booting || zombies.size > 0 || !!restorePending || !worker);
  /**
   * Resolves when a worker is ready and nothing abandoned is left to end, so the turn clock can start (COMPUTE-BUDGET E). Rejects with EngineDown when the
   * start limit passed (or the engine is down for good); a missing worker is started here. Bounded: the start limit applies to every start.
   */
  async function settled() {
    for (let i = 0; i < 400 && restarting(); i++) {
      if (!worker && !booting && !down) respawn();
      if (booting && readyP) { try { await readyP; } catch { /* checked below */ } continue; }
      await new Promise((r) => setTimeout(r, 25));
    }
    if (down) throw down;
    if (!readyP) throw new Error('engine not started');
    await readyP;
  }

  async function boot(init) {
    lastBoot = { ...init };
    readyP = start(null);
    return readyP;
  }

  // ---------- turn-level calls ----------
  const dryState = { id: null, timer: 0 };
  /** A request with abort + kill semantics: resolves with the worker's value; rejects TurnAborted when the signal fires (after a cooperative answer or a kill). */
  async function guarded(kind, op, payload, { signal = null, hardMs = null, text = '', key = null, tab = null } = {}) {
    for (let i = 0; i < 60 && (zombies.size || restorePending); i++) await new Promise((r) => setTimeout(r, 25));   // 60 x 25 ms at most; an abandoned request ends by itself or is killed within the abort grace
    await ready();
    if (!worker) throw Object.assign(new Error('engine worker is not running'), { name: 'EngineRestarted' });
    const { id, promise } = rawCall(op, payload, { kind, text, key, tab });
    const p = pending.get(id);
    let killed = null, abortedReason = null, graceTimer = 0, hardTimer = 0;
    const doKill = (reason, extra = {}) => { if (killed || !pending.has(id)) return; killed = reason; rememberBad(p, reason, extra); const g = stage; killWorker(reason); stage = g; respawn(); };
    const onAbort = () => {
      abortedReason = signal.reason?.name === 'TimeoutError' ? 'timeout' : 'stopped';
      if (!pending.has(id)) return;
      zombies.add(id);
      try { post({ op: 'abort', id, reason: abortedReason }); } catch { /* worker gone */ }
      graceTimer = setTimeout(() => doKill(abortedReason), ABORT_GRACE_MS);
    };
    if (signal) { if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true }); }
    if (hardMs) hardTimer = setTimeout(() => { abortedReason ??= 'timeout'; try { post({ op: 'abort', id, reason: 'timeout' }); } catch { /* gone */ } graceTimer = setTimeout(() => doKill('timeout'), ABORT_GRACE_MS); }, hardMs);
    try {
      const v = await promise;
      if (abortedReason) throw new TurnAborted(abortedReason, stage);
      return v;
    } catch (e) {
      if (killed) throw new TurnAborted(killed === 'stopped' ? 'stopped' : 'timeout', stage);
      if (e?.name === 'EngineRestarted') throw new TurnAborted(abortedReason ?? 'timeout', stage ?? e.reason);   // the worker died or was replaced under this request
      if (e?.name === 'TurnAborted') throw new TurnAborted(e.reason ?? abortedReason ?? 'timeout', e.stage ?? stage);
      if (e?.name === 'BudgetExceeded') { rememberBad(p, 'budget', { site: e.site, stage }); throw e; }
      throw e;
    } finally {
      clearTimeout(graceTimer); clearTimeout(hardTimer); signal?.removeEventListener?.('abort', onAbort); zombies.delete(id);
      if (restorePending && !killed && worker && ![...pending.values()].some((q) => q.kind === 'send' || q.kind === 'dry')) {   // it stopped by itself: now it goes back to the snapshot
        const r = restorePending; restorePending = null; clearTimeout(restoreTimer);
        rawCall('restore', { undoId: r.undoId, state: r.state, meta: r.meta }).promise.catch(() => {});
      } else if (killed) { restorePending = null; clearTimeout(restoreTimer); }
    }
  }

  const knownReply = (rec) => ({
    text: rec.reason === 'budget' ? TOO_COMPLEX_TEXT : KNOWN_SLOW_TEXT, lang: 'en', statuses: [], segments: [], effects: [], wires: [], state: {}, operations: [],
    perf: { total: 0, stages: {} }, knownBad: { reason: rec.reason, stage: rec.stage, site: rec.site ?? null, since: new Date(rec.at).toISOString() },
  });
  function applyStateInfo(r) { if (r?.state) cache.state = r.state; if (r?.meta) cache.meta = r.meta; }

  const session = {
    /** One turn. Resolves with the reply; rejects TurnAborted (stopped / timeout) or an error. Known-bad inputs are answered without running them. */
    async send(text, opts = {}) {
      const tab = getTab(), key = badKeyOf(text, tab);
      const known = bad.get(key);
      if (known) { stats.refused++; return knownReply(known); }
      if (dryState.id != null) this.cancelDry();
      const { signal, hardMs, softMs, undo, ...rest } = opts;
      stats.sends++;
      const fault = testHooks ? globalThis.__psys2Fault?.[text] ?? null : null;
      const res = await guarded('send', 'send', { text, opts: { ...rest, hardMs, softMs }, undoId: undo?.id ?? null, settings: getSettings(), fault }, { signal, hardMs: hardMs ? hardMs + 600 : null, text, key, tab });
      applyStateInfo(res);
      lastUsage = { usage: res.usage ?? [], detection: res.detection ?? [] };
      if (res.budget && !res.reply.budget) res.reply.budget = res.budget;
      if (res.reply.budgetExceeded) rememberBad({ key, text, tab, kind: 'send' }, 'budget', { site: res.reply.budgetExceeded.site, stage: res.reply.budgetExceeded.stage });   // a reply that says "too complex" is never recomputed
      return res.reply;
    },
    async dryRead(text, opts = {}) {
      const tab = getTab(), key = badKeyOf(text, tab);
      if (bad.has(key)) { stats.refused++; return { complete: false, segments: 0, reason: 'known-slow' }; }
      if (!worker && !booting) return { complete: false, segments: 0, reason: 'busy' };
      const { signal, ...rest } = opts;
      stats.dryRuns++;
      try {
        const r = await guarded('dry', 'dry', { text, opts: rest, fault: testHooks ? globalThis.__psys2Fault?.[text] ?? null : null }, { signal, hardMs: (rest.deadlineMs ?? 400) * 3 + 1500, text, key, tab });
        if (r?.budgetExceeded) rememberBad({ key, text, tab, kind: 'dry' }, 'budget', { site: r.budgetExceeded.site, stage: r.budgetExceeded.stage });
        return r;
      } catch (e) {
        if (e instanceof TurnAborted) return { complete: false, segments: 0, reason: e.reason === 'stopped' ? 'cancelled' : 'deadline' };
        if (e?.name === 'EngineRestarted' || e?.name === 'BudgetExceeded') return { complete: false, segments: 0, reason: e?.name === 'BudgetExceeded' ? 'budget' : 'busy' };
        throw e;
      }
    },
    cancelDry() { /* the engine cancels an older dry read itself when a newer one starts; a send ends it through the turn guard */ },
    /** Report the outcome of a host effect; resolves with the world's reaction ({ text, state, effects }) or null. */
    async observe(obs) {
      try {
        const r = await guarded('observe', 'observe', { obs }, { hardMs: limits.watchdogMs ?? 8000, text: `observe ${obs?.effect ?? ''}`, key: null });
        if (r?.state) cache.state = r.state;
        return r?.follow ?? null;
      } catch (e) { if (e?.name === 'TurnAborted' || e?.name === 'EngineRestarted') return null; throw e; }
    },
    setWorldState(worldId, patch = {}) {
      cache.state = { ...cache.state, [worldId]: { ...(cache.state[worldId] ?? {}), ...structuredClone(patch) } };
      const send = () => post({ op: 'setWorldState', id: ++seq, worldId, patch });
      if (booting) readyP.then(send, () => {}); else if (worker) send();
      return cache.state[worldId];
    },
    /** The committed state (a plain object; read only). Always the state after the last finished operation, so it is also what a new worker starts from. */
    state(worldId) { return worldId ? (cache.state[worldId] ?? null) : cache.state; },
    snapshot() { return { id: ++undoSeq, state: cache.state, meta: cache.meta }; },
    restore(undo) {
      if (!undo) return;
      cache.state = undo.state ?? cache.state; cache.meta = undo.meta ?? cache.meta;
      const busy = [...pending.values()].filter((p) => p.kind === 'send' || p.kind === 'dry');
      if (busy.length) {   // the host gave the request up (Stop, watchdog) but the worker has not answered: it gets the abort grace to stop by itself, then it is replaced (from the restored state)
        restorePending = { undoId: undo.id, state: undo.state, meta: undo.meta };
        clearTimeout(restoreTimer);
        restoreTimer = setTimeout(() => { if (restorePending) { for (const p of busy) if (pending.has(p.id)) rememberBad(p, 'timeout'); restorePending = null; killWorker('restore'); respawn(); } }, ABORT_GRACE_MS + 500);
        return;
      }
      const go = () => rawCall('restore', { undoId: undo.id, state: undo.state, meta: undo.meta }).promise.then((r) => { if (r?.state && !pending.size) { /* the page state is already the restored one */ } }, () => {});
      if (booting) readyP.then(go, () => {}); else if (worker) go();
    },
    memory() { return null; },
    discussions() { return []; },
    focus() { return {}; },
    context() { return {}; },
    applySettings(settings, { prepare = false } = {}) {
      options.nx = settings.nxStrategy; options.formalizer = settings.formalizer;
      const send = () => rawCall('settings', { settings: getSettings(), prepare }).promise.catch(() => {});
      if (booting) readyP.then(send, () => {}); else if (worker) send();
    },
    get nx() { return options.nx; },
    set nx(v) { options.nx = v; if (worker) rawCall('option', { key: 'nx', value: v }).promise.catch(() => {}); },
    get formalizer() { return options.formalizer; },
    set formalizer(v) { options.formalizer = v; if (worker) rawCall('option', { key: 'formalizer', value: v }).promise.catch(() => {}); },
    get settings() { return { formalizer: options.formalizer }; },
  };

  return {
    session, boot, ready, stats,
    get info() { return bootInfo; },
    get booting() { return booting; },
    get restarting() { return restarting(); },
    settled,
    get down() { return down; },
    get stage() { return stage; },
    get usage() { return lastUsage.usage; }, get detection() { return lastUsage.detection; },
    resetUsage() { lastUsage = { usage: [], detection: [] }; },
    badInputs: () => [...bad.entries()].map(([k, v]) => ({ key: k, ...v })),
    isBad: (text, tab = getTab()) => bad.has(badKeyOf(text, tab)),
    call: (op, payload) => ready().then(() => rawCall(op, payload).promise),
    warm: (payload) => ready().then(() => rawCall('warm', payload).promise),
    /** Test and diagnostics: the current worker (null while a new one starts). */
    get worker() { return worker; },
    kill: (why = 'requested') => { killWorker(why); respawn(); },
    destroy() { killWorker('destroyed'); down = Object.assign(new Error('destroyed'), { name: 'EngineDown' }); },
    MAX_RESTARTS_PER_TURN,
  };
}
