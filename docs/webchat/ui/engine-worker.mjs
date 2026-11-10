// The dialog engine in a dedicated module worker (COMPUTE-BUDGET item 1, spec 06 "Engine worker"). Everything that can loop or compute for a long time
// runs here: DialogSession, the formalizers, the translators, the interpreter, the world operations, the dispatcher/normalizer runtimes. The page
// thread keeps the UI, speech, effect rendering and storage. A turn that does not answer in time is ended by the page terminating this worker
// (the only way to stop synchronous JavaScript) and starting a new one from the last committed state.
//
// Protocol (structured clone only), see ui/engine-client.mjs:
//   page -> worker: { op, id, ... }   init | send | dry | observe | setWorldState | setStates | restore | settings | abort | prepare | candidates | warm | ort-resume
//   worker -> page: { type: 'res', id, ok, value | error }   answers of the requests above
//                   { type: 'evt', name, data }              ready | stage | dispatcher-status | normalizer-status | model-source | progress | ort | ort-paused | rules-compiled
//                   { type: 'spawn-ort', id, lane, port }    the page owns the ORT workers; this worker talks to them through a MessageChannel it asks for
//
// The worker never touches the DOM or localStorage. The Translation API and the language detector exist on the window only: it asks the page for them
//   worker -> page: { type: 'bt', id, op: 'translate' | 'detect', text, from?, to? }    page -> worker: { type: 'bt-res', id, ok, value | error }   (deadline 700 ms, then the rules)

const HERE = new URL('./', import.meta.url);
const ROOT = new URL('../', HERE);
const abs = (p) => new URL(p, ROOT).href;
// Module versions from the page (build hashes; `window.__psys2Mod`). A worker has no import map. lib/ and worlds/ files are versioned by the build itself: their own relative
// imports carry `?v=<version of the target>` (scripts/build-webchat.mjs versionGraph), so importing one with the page's version for it loads one consistent graph, and the
// same URL strings the page's import map produces. The few ui/ files this worker loads import nothing relative.
const ver = {};
const vurl = (rel) => abs(rel) + (ver[rel] ? `?v=${ver[rel]}` : '');
globalThis.__psys2Url = vurl;   // for ui/ort-host.mjs and the hosts (they resolve lib/ and ui/ URLs through it)

const post = (m, t) => postMessage(m, t ?? []);
const evt = (name, data) => post({ type: 'evt', name, data });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let engine = null, session = null, settings = {}, mods = null, testHooks = false, faultNow = null;
const active = new Map();            // request id -> AbortController of a send or dry read that runs
const turnRunning = () => [...active.values()].some((c) => !c.dry);
let dispatcherEnc = null, normalizerHost = null, dispatcherInfo = null;
const snaps = new Map();             // undo id -> engine snapshot (a ring: the last SNAP_KEEP)
const SNAP_KEEP = 24;
let lastTurnEnd = 0;
const budgetMod = { createBudget: null };
let btSeq = 0;
const btPending = new Map();         // id -> { resolve, reject } of a call to the page's browser translator / detector
let warming = null;                  // the warm-up turn that runs: a user turn waits for it (the turn guard is shared), at most one warm-up turn long
const one = async (s, text, opts) => { const p = s.send(text, opts).catch(() => {}); warming = p; try { await p; } finally { if (warming === p) warming = null; } };

// ---------- test-only fault injection (inert unless the page started with ?psys2test=1) ----------
function spin() { for (;;) { /* test hook: an infinite synchronous loop */ } }   // loop-guard-allow: deliberate fault injection (the page watchdog must end it)
function installFaults() {
  for (const w of engine.set.list()) {
    if (!w.ops || typeof w.ops !== 'object') continue;
    const wrapped = {};
    for (const [k, fn] of Object.entries(w.ops)) wrapped[k] = typeof fn === 'function' ? function (...a) { if (faultNow === 'op') spin(); return fn.apply(this, a); } : fn;
    try { w.ops = wrapped; } catch { /* a frozen world: no op fault */ }
  }
  const rules = engine.formalizers?.rules;
  if (rules?.formalize) { const f = rules.formalize.bind(rules); rules.formalize = (...a) => { if (faultNow === 'matcher') spin(); return f(...a); }; }
  const tr = engine.translator;
  for (const k of ['translate', 'detectLanguage', 'evidence']) {
    if (typeof tr?.[k] !== 'function') continue;
    const f = tr[k].bind(tr);
    tr[k] = (...a) => { if (faultNow === 'translator') spin(); return f(...a); };
  }
}

// ---------- serialization helpers ----------
const errOf = (e) => ({ name: e?.name ?? 'Error', message: String(e?.message ?? e), reason: e?.reason ?? null, stage: e?.stage ?? null, site: e?.site ?? null, ticks: e?.ticks ?? null, bySite: e?.bySite ?? null });

/** Wires get `sk`: their keys in short form (the page serializes them without the legends, which stay here). */
function annotateWires(root) {
  const L = engine.set.legends, seen = new WeakSet();
  const walk = (v, depth) => {   // depth limit 7 and a visited set
    if (!v || typeof v !== 'object' || depth > 7 || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (typeof v.type === 'string' && Array.isArray(v.entries)) { try { v.sk = v.entries.map((e) => L.shortKey(v.type, e.key)); } catch { /* keep the full keys */ } return; }
    for (const k of Object.keys(v)) walk(v[k], depth + 1);
  };
  walk(root, 0);
  return root;
}
const stateOf = () => session.state();
const metaOf = () => ({ msg: session._msg, lang: session._sessionLang, weakRo: session._weakRo, language: session.language, memory: memoryOf() });
/** The discourse / ASTRA memory as JSON, so that a restarted worker gets it back (a failure here must never fail a turn). */
function memoryOf() { try { return session.memoryJSON(); } catch { return null; } }

function applySettings(s, extra) {
  if (s && typeof s === 'object') { for (const k of Object.keys(settings)) if (!(k in s)) delete settings[k]; Object.assign(settings, s); }
  if (!session || !mods) return;
  mods.tl.applyTimeLimits(settings);
  Object.assign(session, mods.rc.sessionOptions(settings));
  session.fastPath = settings.fastPath === true;
  if (session.settings && typeof session.settings === 'object') session.settings.formalizer = settings.formalizer;
  session.setOption?.('formalizer', settings.formalizer);
  if (extra?.prepare && settings.formalizer === 'encoder' && dispatcherEnc) dispatcherEnc.prepare().catch(() => {});
}

// ---------- boot ----------
async function init(m) {
  Object.assign(ver, m.versions ?? {});
  testHooks = m.testHooks === true;
  settings = { ...(m.settings ?? {}) };
  const imp = (rel) => import(vurl(rel));
  const [dialog, loaders, translate, soplang, rc, g, tl, hosts] = await Promise.all([imp('lib/dialog/index.mjs'), imp('lib/loaders/bundle-loader.mjs'), imp('lib/translate/index.mjs'), imp('lib/soplang/index.mjs'),
    imp('lib/dialog/runtime-config.mjs'), imp('lib/formalizer/guard.mjs'), imp('lib/dialog/time-limits.mjs'), Promise.all([imp('ui/dispatcher-host.mjs'), imp('ui/normalizer-host.mjs'), imp('ui/translation.mjs')])]);
  const [dh, nh, tr] = hosts;
  try { const b = await imp('lib/dialog/budget.mjs'); budgetMod.createBudget = b.createBudget ?? null; } catch { budgetMod.createBudget = null; }   // agent B's step budget, when this build has it
  mods = { tl, dialog, rc, guard: g.guard, TurnAborted: g.TurnAborted, soplang };
  // the guard reports its stage to the page at once (postMessage from synchronous code is delivered while the loop runs): a killed turn says where it was
  { let last = ''; const report = (stage) => { if (stage && stage !== last) { last = stage; evt('stage', stage); } };   // a few dozen changes per turn
    const gc = g.guard.check.bind(g.guard), gs = g.guard.setStage.bind(g.guard), ga = g.guard.abortable.bind(g.guard);
    g.guard.check = (stage) => { report(stage); return gc(stage); };
    g.guard.setStage = (stage) => { report(stage); return gs(stage); };
    g.guard.abortable = (p, stage) => { report(stage); return ga(p, stage); }; }
  const res = await fetch(m.worldsUrl, { cache: 'default' });
  if (!res.ok) throw new Error(`worlds/index.json: HTTP ${res.status}`);
  const bundle = await res.json();
  for (const [id, w] of Object.entries(bundle.worlds)) {
    if (m.onlyWorlds && id !== 'core' && !m.onlyWorlds.includes(id)) delete bundle.worlds[id];
    else if (w.opsUrl) w.opsUrl = new URL(w.opsUrl, ROOT).href + (ver[`worlds/${id}/ops.mjs`] ? `?v=${ver[`worlds/${id}/ops.mjs`]}` : '');
  }
  // The browser Translation API and language detector exist on the page only: the worker asks the page for them, with a deadline (then the rules answer)
  const backend = tr.createRemoteBackend({ kinds: m.browser ?? {}, call: (op, payload) => new Promise((resolve, reject) => { const id = ++btSeq; btPending.set(id, { resolve, reject }); post({ type: 'bt', id, op, ...payload }); }).finally(() => {}) });
  const translator = tr.createSwitchTranslator({ rules: translate.createTranslator(), getStrategy: () => settings.translation, getDetectStrategy: () => settings.languageDetection, backend });
  engine = await dialog.createEngine({ loader: loaders.createBundleLoader(bundle), translator });
  if (testHooks) installFaults();
  const rules = (engine.precompile?.({ budgetMs: 8, yieldFn: async () => { await sleep(0); while (turnRunning()) await sleep(20); } }) ?? Promise.resolve()).catch(() => {}).then(() => evt('rules-compiled'));
  rules.catch(() => {});
  // the ORT workers belong to the page: this worker asks for one through a MessagePort per lane
  globalThis.__psys2OrtSpawn = (lane) => {
    const { port1, port2 } = new MessageChannel();
    postMessage({ type: 'spawn-ort', lane, port: port2 }, [port2]);
    const w = { onmessage: null, onerror: null, postMessage: (msg, t) => port1.postMessage(msg, t ?? []), terminate: () => { try { port1.postMessage({ __terminate: true }); port1.close(); } catch { /* gone */ } } };
    port1.onmessage = (ev) => w.onmessage?.(ev);
    return w;
  };
  globalThis.addEventListener('psys2-ort-paused', (e) => { evt('ort-paused', e.detail ?? null); sendOrt(); });
  try {
    const [meta, nzMeta] = [m.dispatcherMeta ?? null, m.normalizerMeta ?? null];
    if (meta) {
      if (nzMeta) {
        const nzrt = await imp('lib/dialog/normalizer-runtime.mjs');
        normalizerHost = nh.createNormalizerHost({ base: ROOT, meta: nzMeta, lib: nzrt, onStatus: (s) => evt('normalizer-status', s) });
      }
      const wp = await imp('lib/formalizer/wordpiece.mjs');
      dispatcherEnc = rc.createRuntime({ engine, settings,
        load: dh.dispatcherLoader({ base: ROOT, meta, lib: wp, onSource: (src) => evt('model-source', src), onProgress: (msg) => evt('progress', msg) }),
        normalizer: normalizerHost?.provider ?? null, waitForModel: false, isPaused: () => !!globalThis.__psys2Ort?.paused });
      dispatcherEnc.onStatus((st) => evt('dispatcher-status', st));
    }
  } catch (e) { console.warn('Encoder formalizer unavailable', e); }
  session = engine.createSession({ language: settings.language ?? 'en' });
  applySettings(null);
  if (m.restoreState) restoreStates(m.restoreState, m.restoreMeta);
  if (m.prepareModels && dispatcherEnc && settings.formalizer === 'encoder') dispatcherEnc.prepare().catch(() => {});
  return { worlds: engine.worlds().map((w) => w.id), problems: engine.problems?.() ?? [], state: stateOf(), hasDispatcher: !!dispatcherEnc, hasNormalizer: !!normalizerHost, budget: !!budgetMod.createBudget };
}

function restoreStates(state, meta) {
  if (state && typeof state === 'object') {
    session.isession.state = structuredClone(state);
    if (meta) {
      session._msg = meta.msg ?? session._msg; session._sessionLang = meta.lang ?? session._sessionLang; session._weakRo = meta.weakRo ?? 0;
      if (meta.memory) { try { session.restoreMemory(meta.memory); } catch (e) { console.warn('memory not restored', e); } }
    }
  }
}

function sendOrt() {
  const o = globalThis.__psys2Ort;
  if (!o) return;
  try { evt('ort', { restarts: o.restarts, stats: JSON.parse(JSON.stringify(o.stats)), paused: o.paused ?? null, speed: o.speed, limits: o.limits ? { ...o.limits } : null,
    lanes: Object.fromEntries([...o.lanes.entries()].map(([k, v]) => [k, { busy: v.pending?.size > 0, queued: v.pending?.size ?? 0 }])) }); } catch { /* diagnostics only */ }
}

// ---------- requests ----------
const handlers = {
  async init(m) { return init(m); },
  async send(m) {
    const ctl = new AbortController();
    active.set(m.id, ctl);
    if (warming) await warming;
    faultNow = testHooks ? (m.fault ?? null) : null;
    if (m.settings) applySettings(m.settings);
    const snap = session.snapshot();
    if (m.undoId != null) { snaps.set(m.undoId, snap); if (snaps.size > SNAP_KEEP) snaps.delete(snaps.keys().next().value); }
    const budget = budgetMod.createBudget ? (() => { try { return budgetMod.createBudget(m.limits ?? undefined); } catch { return null; } })() : null;
    mods.guard.setStage?.('start');
    try {
      const translator = engine.translator; translator.resetUsage?.();
      let reply;
      try { reply = await session.send(m.text, { ...m.opts, signal: ctl.signal, undo: snap, ...(budget ? { budget } : {}) }); }
      catch (e) { if (e?.name === 'TurnAborted' || e?.name === 'BudgetExceeded' || ctl.signal.aborted) { try { session.restore(snap); } catch { /* keep */ } } if (budget && e && typeof e === 'object') e.bySite = { ...budget.bySite }; throw e; }
      annotateWires(reply);
      return { reply, state: stateOf(), meta: metaOf(), usage: (translator.usage ?? []).map((u) => ({ ...u })), detection: (translator.detectUsage ?? []).map((u) => ({ ...u })),
        budget: budget ? { ticks: budget.ticks, bySite: { ...budget.bySite } } : null, ort: true };
    } finally { active.delete(m.id); lastTurnEnd = performance.now(); faultNow = null; sendOrt(); }
  },
  async dry(m) {
    const ctl = new AbortController(); ctl.dry = true;
    active.set(m.id, ctl);
    faultNow = testHooks ? (m.fault ?? null) : null;
    try {
      const budget = budgetMod.createBudget ? (() => { try { return budgetMod.createBudget(m.limits ?? undefined); } catch { return null; } })() : null;
      const res = await session.dryRead(m.text, { ...m.opts, signal: ctl.signal, ...(budget ? { budget } : {}) });
      return annotateWires(res);
    } finally { active.delete(m.id); faultNow = null; }
  },
  async observe(m) {
    const out = await session.observe(m.obs);
    annotateWires(out);
    return { follow: out, state: stateOf() };
  },
  async setWorldState(m) { session.setWorldState(m.worldId, m.patch); return null; },
  async setStates(m) { restoreStates(m.state, m.meta); return { state: stateOf() }; },
  async restore(m) {
    const snap = m.undoId != null ? snaps.get(m.undoId) : null;
    if (snap) session.restore(snap); else if (m.state) restoreStates(m.state, m.meta);
    return { state: stateOf(), meta: metaOf() };
  },
  async settings(m) { applySettings(m.settings, { prepare: m.prepare }); return null; },
  async option(m) { session[m.key] = m.value; if (m.key === 'formalizer') session.setOption?.('formalizer', m.value); return null; },
  async prepare(m) {
    if (m.which === 'normalizer') { if (!normalizerHost) throw new Error('no normalizer'); await normalizerHost.prepare(); }
    else { if (!dispatcherEnc) throw new Error('no dispatcher'); await dispatcherEnc.prepare(); }
    sendOrt();
    return null;
  },
  async candidates() {
    const s = await import(vurl('lib/dialog/surprise.mjs'));
    return s.candidateExamples(engine);
  },
  async warm(m) {
    const opts = { language: 'en', formalizer: 'rules', spell: true, partial: true, fastPath: false };
    const idle = async () => { while (turnRunning() || performance.now() - lastTurnEnd < 500) await sleep(50); };
    const s = engine.createSession({ language: 'en' });
    if (m.phase === 'model') { await idle(); await one(s, 'what is 3 plus 4', { ...opts, formalizer: 'encoder' }); evt('warm', 'dispatcher'); return null; }
    for (const x of ['hello', 'zzq flarb wug', 'spider legs and 3 plus 4']) { await idle(); await one(s, x, opts); await sleep(0); }
    evt('warm', 'rules');
    try {   // the Romanian rules translator (lexicons, phrase tables) and the English-to-Romanian reply tables: a cold first Romanian message took 5-9 s at 4x CPU
      await idle();
      const tr = engine.translator?.rules;
      if (tr) {
        tr.detectLanguage?.('repede: câte zile are iunie?');
        tr.translate('repede: câte zile are iunie?', { from: 'ro', to: 'en' });
        await sleep(0); await idle();
        tr.translate('There are 30 days in June.', { from: 'en', to: 'ro' });
      }
    } catch { /* best effort */ }
    evt('warm', 'translator');
    return null;
  },
  async 'ort-restart'(m) { globalThis.__psys2Ort?.restart?.(m.lane, m.why); sendOrt(); return null; },   // diagnostics and tests
  async 'ort-resume'() { globalThis.__psys2Ort?.resume?.(); sendOrt(); return null; },
};

onmessage = async (ev) => {
  const m = ev.data;
  if (m.type === 'bt-res') { const p = btPending.get(m.id); btPending.delete(m.id); if (p) { if (m.ok) p.resolve(m.value); else p.reject(new Error(m.error ?? 'browser API error')); } return; }
  if (m.op === 'abort') { for (const [id, ctl] of active) if (m.id == null || id === m.id) ctl.abort(new DOMException(m.reason === 'timeout' ? 'turn time limit' : 'stopped', m.reason === 'timeout' ? 'TimeoutError' : 'AbortError')); return; }
  const h = handlers[m.op];
  if (!h) { post({ type: 'res', id: m.id, ok: false, error: { name: 'Error', message: `unknown op ${m.op}` } }); return; }
  try { post({ type: 'res', id: m.id, ok: true, value: await h(m) }); }
  catch (e) { post({ type: 'res', id: m.id, ok: false, error: errOf(e) }); }
};
