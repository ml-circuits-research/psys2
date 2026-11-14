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
let worldLoader = null, loaders = null, rulesMod = null, wordMod = null, tabWorlds = {}, universe = null;   // LAZY LOADING: the world index, the library modules the loader needs, tab id -> world id, the worlds this page may use (tests)
const loadedIds = new Set();
const allowed = (id) => !universe || id === 'core' || universe.has(id);
const absModule = (path, id, kind) => new URL(path, ROOT).href + (ver[`worlds/${id}/${kind}.mjs`] ? `?v=${ver[`worlds/${id}/${kind}.mjs`]}` : '');
const snaps = new Map();             // undo id -> engine snapshot (a ring: the last SNAP_KEEP)
const SNAP_KEEP = 24;
let lastTurnEnd = 0;
const budgetMod = { createBudget: null };
let btSeq = 0;
const btPending = new Map();         // id -> { resolve, reject } of a call to the page's browser translator / detector
let knowledgeFacts = null;           // the catalog reader (createFacts), once attached
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
  // M4: the engine reads and writes through the candidates (`candidatesViaMT`, `rules.translate`): all carry the fault hook
  for (const owner of [tr, tr?.rules]) for (const k of ['translate', 'candidatesViaMT', 'detectLanguage', 'evidence']) {
    if (typeof owner?.[k] !== 'function') continue;
    const f = owner[k].bind(owner);
    owner[k] = (...a) => { if (faultNow === 'translator') spin(); return f(...a); };
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

const KNOWLEDGE_URL = 'https://ml-circuits-research.github.io/sop-knowledge-worlds/worlds', KNOWLEDGE_FETCH_MS = 8000;
// ---------- boot ----------
async function init(m) {
  Object.assign(ver, m.versions ?? {});
  testHooks = m.testHooks === true;
  settings = { ...(m.settings ?? {}) };
  const imp = (rel) => import(vurl(rel));
  const [dialog, loadersMod, translate, soplang, rc, g, tl, hosts, lang, rulesM, wordIdx, wlMod] = await Promise.all([imp('lib/dialog/index.mjs'), imp('lib/loaders/bundle-loader.mjs'), imp('lib/translate/index.mjs'), imp('lib/soplang/index.mjs'),
    imp('lib/dialog/runtime-config.mjs'), imp('lib/formalizer/guard.mjs'), imp('lib/dialog/time-limits.mjs'), Promise.all([imp('ui/dispatcher-host.mjs'), imp('ui/normalizer-host.mjs'), imp('ui/translation.mjs')]), imp('ui/language.mjs'), imp('lib/formalizer/rules/index.mjs'), imp('lib/worlds/word-index.mjs'), imp('ui/world-loader.mjs')]);
  loaders = loadersMod; rulesMod = rulesM; wordMod = wordIdx;
  tabWorlds = m.tabWorlds ?? {}; universe = m.onlyWorlds ? new Set(m.onlyWorlds) : null;
  const [dh, nh, tr] = hosts;
  try { const b = await imp('lib/dialog/budget.mjs'); budgetMod.createBudget = b.createBudget ?? null; } catch { budgetMod.createBudget = null; }   // agent B's step budget, when this build has it
  mods = { tl, dialog, rc, guard: g.guard, TurnAborted: g.TurnAborted, soplang, lang };
  // the guard reports its stage to the page at once (postMessage from synchronous code is delivered while the loop runs): a killed turn says where it was
  { let last = ''; const report = (stage) => { if (stage && stage !== last) { last = stage; evt('stage', stage); } };   // a few dozen changes per turn
    const gc = g.guard.check.bind(g.guard), gs = g.guard.setStage.bind(g.guard), ga = g.guard.abortable.bind(g.guard);
    g.guard.check = (stage) => { report(stage); return gc(stage); };
    g.guard.setStage = (stage) => { report(stage); return gs(stage); };
    g.guard.abortable = (p, stage) => { report(stage); return ga(p, stage); }; }
  // PROGRESS: the page's start-up steps follow the real order (the page ends none of them itself, so a step that never ends is a bug the progress test catches)
  evt('boot-step', { id: 'worlds', op: 'start' });
  // LAZY LOADING: the small routing index (worlds/index.json) now; a world's files when the world is needed. A start loads the always-loaded worlds (the shell and what reading needs), the open
  // tab's world, and the worlds a restored session has state or memory in. Everything else loads when a tab opens, when the words of a message say so, or when the user names it.
  const fetchJson = async (rel, hash) => { const r = await fetch(abs(rel) + (hash ? `?v=${hash}` : ''), { cache: 'default' }); if (!r.ok) throw new Error(`${rel}: HTTP ${r.status}`); return r.json(); };
  worldLoader = wlMod.createWorldLoader({ indexHash: ver['worlds/index.json'], fetchJson, bag: (text) => new Set([...rulesM.messageBag(text), ...wordIdx.queryWords(text)]) });
  await worldLoader.init();
  // `?psys2lazy=0` (tests, a comparison with the full set) and a saved language other than English: every world is loaded at start (a Romanian message is read through English candidates that a
  // partial world set can mistake for understood: a session that starts in Romanian must read like the full set, from its first message)
  const startIds = (m.lazyWorlds === false || m.settings?.lazyWorlds === false || (m.settings?.language && lang.normalize(m.settings.language) !== 'en') ? worldLoader.ids() : [...worldLoader.startIds({ tabWorld: m.tabWorld ?? null, state: m.restoreState, recent: m.restoreMeta?.memory?.recent ?? [] })]).filter((id) => allowed(id));
  await worldLoader.bundles(startIds);
  for (const id of startIds) loadedIds.add(id);
  const bundle = worldLoader.bundleOf(startIds, absModule);
  const bundleBytes = startIds.reduce((s, id) => s + (worldLoader.info(id)?.bytes ?? 0), 0);
  // The browser Translation API and language detector exist on the page only: the worker asks the page for them, with a deadline (then the rules answer)
  const backend = tr.createRemoteBackend({ kinds: m.browser ?? {}, call: (op, payload) => new Promise((resolve, reject) => { const id = ++btSeq; btPending.set(id, { resolve, reject }); post({ type: 'bt', id, op, ...payload }); }).finally(() => {}) });
  // MT keep-list (spec 05): the app's own words (currency, names, titles, tab names) are placeholders around the model; the engine and session exist by the first call
  { const kl = await imp('lib/translate/keep-list.mjs'); const raw = backend.translate; backend.translate = kl.protectedTranslate(raw, () => (engine ? { keep: kl.keepListOf(engine.set), extra: kl.sessionNames(session) } : null)); }
  const translator = tr.createSwitchTranslator({ rules: translate.createTranslator(), getStrategy: () => settings.translation, getDetectStrategy: () => settings.languageDetection, backend, languages: lang.LANGS });
  evt('boot-step', { id: 'worlds', op: 'end', bytes: bundleBytes, count: startIds.length });
  evt('boot-step', { id: 'reasoner', op: 'start' });
  engine = await dialog.createEngine({ loader: loadersMod.createBundleLoader(bundle), translator, options: { reasoner: settings.reasoner === 'ops' ? 'ops' : 'matrix' } });   // Settings › Developer › Reasoner (spec 15): read when the engine starts
  try { await engine.prepareMeta?.(); } catch { /* the policy router answers alone (spec 20) */ }   // meta.worlds: the default router (C)
  evt('boot-step', { id: 'reasoner', op: 'end' });
  // The knowledge catalog (spec 17): the sop-knowledge-worlds copy on GitHub Pages, read lazily (nothing is fetched until a message needs a thing the board or the
  // lexicons do not have), each file bounded by KNOWLEDGE_FETCH_MS (a slow or offline read counts as unreachable and is asked again after a backoff, see facts.mjs).
  engine.onModelTimeout = (info) => evt('model-timeout', info);   // a model call timed out and the rules answered (spec 06): the debug panel says so once and counts
  // Offline, the objects vendored in the world (things.catalog.mjs) and the bundled subset still work; lookups of other things then answer as unknown.
  try {
    const [{ createFacts }, { createKnowledgeSource }, { createLayeredSource }] = await Promise.all([imp('lib/knowledge/facts.mjs'), imp('lib/loaders/knowledge-source.mjs'), imp('lib/knowledge/bundled-source.mjs')]);
    const { createCachedSource } = await imp('lib/loaders/knowledge-cache.mjs');
    const { knowledgeTimeoutMs } = await imp('lib/loaders/knowledge-source.mjs');
    const src = createCachedSource({ source: createKnowledgeSource(settings.knowledgeUrl || KNOWLEDGE_URL), caches: globalThis.caches, onCacheEvent: (e) => evt('knowledge-cache', e) });
    // the bundled subset (colours, number words, the drawings of the built-in kinds: generated from the catalog) answers for a catalog that cannot be reached; the catalog replaces it when it can
    knowledgeFacts = createFacts({ source: createLayeredSource({ text: (p) => Promise.race([src.text(p).catch(() => null), new Promise((res) => setTimeout(() => res(null), knowledgeTimeoutMs(p) + 2000))]) }) });
    engine.setKnowledge(knowledgeFacts);
    engine.onNotice = (text) => evt('notice', text);   // "Looking up how a pineapple looks..." while a shard loads
  } catch (e) { console.warn('knowledge catalog not attached', e); }
  if (testHooks) installFaults();
  const rules =(engine.precompile?.({ budgetMs: 8, yieldFn: async () => { await sleep(0); while (turnRunning()) await sleep(20); } }) ?? Promise.resolve()).catch(() => {}).then(() => evt('rules-compiled'));
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
  session = engine.createSession({ language: lang.normalize(settings.language) });   // LANG-FIXED: always an explicit 'en' | 'ro', never 'auto'
  applySettings(null);
  if (m.restoreState) restoreStates(m.restoreState, m.restoreMeta);
  if (m.prepareModels && dispatcherEnc && settings.formalizer === 'encoder') dispatcherEnc.prepare().catch(() => {});
  return { worlds: engine.worlds().map((w) => w.id), known: worldLoader.ids(), worldTabs: Object.fromEntries(worldLoader.ids().map((id) => [id, worldLoader.info(id).tab?.id ?? null]).filter(([, v]) => v)), problems: engine.problems?.() ?? [], state: stateOf(), hasDispatcher: !!dispatcherEnc, hasNormalizer: !!normalizerHost, budget: !!budgetMod.createBudget };
}

function restoreStates(state, meta) {
  if (state && typeof state === 'object') {
    session.isession.state = { ...session.isession.state, ...structuredClone(state) };   // over the fresh session's initial states: a world loaded since the record was made has none in it (lazy loading)
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

// ---------- LAZY LOADING (specs/06 "Lazy loading") ----------
const worldLabel = (ids) => { const names = ids.map((id) => worldLoader.info(id)?.label).filter(Boolean); const pick = names.slice(-1)[0] ?? 'next'; return `Loading the ${pick} world${ids.length > 1 && names.length > 1 ? 's' : ''}…`; };
const activeWorld = () => { try { const tab = session.state()['ui.shell']?.activeTab; return tab ? (tabWorlds[tab] ?? worldLoader.ids().find((id) => worldLoader.info(id).tab?.id === tab) ?? null) : null; } catch { return null; } };
const loadedLog = [];   // what was loaded on demand: { ids, why, ms, bytes } (diagnostics and the on-demand report)
/**
 * Adds `ids` (and what they import) to the running engine: fetches their files, replaces the world set (`engine.reload`), and gives the session its state and memory back, as a restart does.
 * Nothing happens when they are all loaded. A failed fetch changes nothing: the engine goes on with the worlds it has (a lazy fetch that fails never changes a reading).
 */
let lockP = Promise.resolve();   // one load at a time (a page request and a turn can ask together)
const ensureWorlds = (ids, why) => { const p = lockP.then(() => ensureRun(ids, why), () => ensureRun(ids, why)); lockP = p.catch(() => {}); return p; };
async function ensureRun(ids, why) {
  const want = worldLoader.closure([...ids].filter((id) => allowed(id) && worldLoader.info(id)));
  const missing = [...want].filter((id) => !loadedIds.has(id));
  if (!missing.length) return [];
  const label = worldLabel(missing), stepId = `world:${missing.join(',')}`, t0 = performance.now();
  evt('world-load', { id: stepId, op: 'start', label, why, ids: missing });
  try {
    try { await worldLoader.bundles(want); } catch (e) { evt('world-load', { id: stepId, op: 'fail', label, message: String(e?.message ?? e) }); return []; }
    const next = [...loadedIds, ...missing];
    await engine.reload(loaders.createBundleLoader(worldLoader.bundleOf(next, absModule)));
    // the session is read HERE, after the awaits and with none between this and the new session: a state the page set while the worlds were loading (a tab click, a setting) is in it, and is not lost
    const st = stateOf(), meta = metaOf();
    const old = session, portable = [...snaps].map(([k, sn]) => { try { return [k, old.portableSnapshot(sn)]; } catch { return null; } }).filter(Boolean);   // the undo snapshots as plain data: they survive the reload
    for (const id of missing) loadedIds.add(id);
    session = engine.createSession({ language: mods.lang.normalize(settings.language) });
    applySettings(null);
    restoreStates(st, meta);
    snaps.clear();
    for (const [k, rec] of portable) { try { snaps.set(k, session.adoptSnapshot(rec)); } catch { /* that turn's undo goes through the page's state record */ } }
    if (testHooks) installFaults();
    Promise.resolve(engine.precompile?.({ budgetMs: 8, yieldFn: async () => { await sleep(0); while (turnRunning()) await sleep(20); } })).catch(() => {});
    const bytes = missing.reduce((s, id) => s + (worldLoader.info(id)?.bytes ?? 0), 0);
    loadedLog.push({ ids: missing, why, ms: Math.round(performance.now() - t0), bytes });
    evt('world-load', { id: stepId, op: 'end', label, bytes, ids: missing });
    evt('worlds-loaded', { ids: missing, all: [...loadedIds], why });
    return missing;
  } catch (e) { evt('world-load', { id: stepId, op: 'fail', label, message: String(e?.message ?? e) }); throw e; }
}
const allLoaded = () => worldLoader.ids().filter(allowed).every((id) => loadedIds.has(id));
/** A reading is complete when something was understood and nothing was left out or guessed: otherwise a world that is not loaded might have read it (the worker then reads it again with every world). */
const incomplete = (reply) => wordMod.readingIncomplete(reply);

// ---------- requests ----------
const handlers = {
  async init(m) { return init(m); },
  async send(m) {
    const ctl = new AbortController();
    active.set(m.id, ctl);
    if (warming) await warming;
    faultNow = testHooks ? (m.fault ?? null) : null;
    if (m.settings) applySettings(m.settings);
    // LAZY LOADING: the open tab's world and the worlds the words of the message say it needs, before the turn is read
    // a message in another language is read through its English candidates, which a partial world set can mistake for understood: every world is loaded for it (the word index is English)
    try { const lang = mods.lang.normalize(m.opts?.language ?? m.settings?.language ?? settings.language); if (lang !== 'en') await ensureWorlds(worldLoader.ids(), 'language'); else { const plan = await worldLoader.plan(m.text); await ensureWorlds([activeWorld(), ...plan.ids].filter(Boolean), 'message'); } } catch (e) { console.warn('world plan failed', e); }
    let snap = session.snapshot();
    if (m.undoId != null) { snaps.set(m.undoId, snap); if (snaps.size > SNAP_KEEP) snaps.delete(snaps.keys().next().value); }
    let budget = null;
    const newBudget = () => (budgetMod.createBudget ? (() => { try { return budgetMod.createBudget(m.limits ?? undefined); } catch { return null; } })() : null);
    budget = newBudget();
    mods.guard.setStage?.('start');
    try {
      const translator = engine.translator; translator.resetUsage?.();
      let reply;
      const read = async () => {
        session.takeMissed?.();
        try { return await session.send(m.text, { ...m.opts, language: mods.lang.normalize(m.opts?.language ?? m.settings?.language), signal: ctl.signal, undo: snap, ...(budget ? { budget } : {}) }); }
        catch (e) { if (e?.name === 'TurnAborted' || e?.name === 'BudgetExceeded' || ctl.signal.aborted) { try { session.restore(snap); } catch { /* keep */ } } if (budget && e && typeof e === 'object') e.bySite = { ...budget.bySite }; throw e; }
      };
      reply = await read();
      // a turn that asked for an action of a world that is not loaded (kids.common asks user.profile to keep a name): load that world and read the turn again
      const lacking = worldLoader.ofActions(session.takeMissed?.()).filter((id) => !loadedIds.has(id) && allowed(id));
      if (lacking.length) {
        try { session.restore(snap); } catch { /* keep */ }
        const added = await ensureWorlds(lacking, 'action');
        if (added.length) { snap = session.snapshot(); if (m.undoId != null) snaps.set(m.undoId, snap); budget = newBudget(); translator.resetUsage?.(); reply = await read(); } else reply = await read();
      }
      if (incomplete(reply) && !allLoaded()) {   // not understood, or understood with words guessed or left out: read it again with every world (the reading is then the one a full start gives)
        try { session.restore(snap); } catch { /* keep */ }
        const added = await ensureWorlds(worldLoader.ids(), 'second reading');
        if (added.length) {
          snap = session.snapshot();
          if (m.undoId != null) snaps.set(m.undoId, snap);
          budget = newBudget();
          translator.resetUsage?.();
          reply = await read();
        } else reply = await read();   // the other worlds could not be fetched: the first reading is read again as it was (nothing changed)
      }
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
      const res = await session.dryRead(m.text, { ...m.opts, language: mods.lang.normalize(m.opts?.language ?? settings.language), signal: ctl.signal, ...(budget ? { budget } : {}) });
      return annotateWires(res);
    } finally { active.delete(m.id); faultNow = null; }
  },
  /** LANG-FIXED: the one use of the language detectors: is this typed message clearly the other language? (the page shows a one-line hint with a button, after the turn) */
  async hint(m) {
    const t = engine.translator;
    return mods.lang.suggestSwitch(m.text, mods.lang.normalize(m.selected), { detect: (x) => t.detectLanguage(x), evidence: (x) => t.evidence(x) });
  },
  async observe(m) {
    const out = await session.observeIn(m.obs, { language: mods.lang.normalize(settings.language) });   // the reaction (the engine's chess move) is shown in the selected language
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
  /** The page needs a world now (its tab opens, the user names it): loads it and answers which worlds are loaded. */
  async ensure(m) { while (turnRunning()) await sleep(20); const added = await ensureWorlds(m.worlds ?? [], m.why ?? 'tab'); return { added, loaded: [...loadedIds], state: stateOf(), log: loadedLog.slice(-20) }; },
  async loaded() { return { loaded: [...loadedIds], log: loadedLog.slice(), loader: worldLoader.stats }; },
  /** Page start-up step and its retries: reads the catalog's index (not the vocabulary: that is read by buckets, when a message needs it); { ok } is false while the catalog cannot be reached (the page asks again; `refresh` skips the backoff). */
  async catalog(m) {
    if (!knowledgeFacts) return { ok: false, bytes: null };
    if (m.refresh) knowledgeFacts.refresh();
    await knowledgeFacts.world?.('k.objects');   // LAZY LOADING: the catalog's index (version-cached), not its 1.3 MB vocabulary: a message reads the buckets of its words
    return { ok: !knowledgeFacts.unreachable(), bytes: knowledgeFacts.stats?.vocabBytes ?? null };
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
