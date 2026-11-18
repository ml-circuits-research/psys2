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
const activityLog=[];let activitySequence=0,executionRequestId=null;
const requestActivities=new Map();
function worldActivity(nodeIds,phase,label,extra={}){const event={id:++activitySequence,nodeIds,phase,label,time:Date.now(),...(executionRequestId==null?{}:{requestId:executionRequestId}),...extra};requestActivities.get(event.requestId)?.push(event);activityLog.push(event);if(activityLog.length>200)activityLog.shift();evt('world-activity',event);}
// Only instrumented RPC boundaries are timed; these events do not infer inner reasoning.
function loadProgress(message,operation){
 const timings=[];let current=null,started=0;
 const correlationId='rpc:'+message.id;
 const close=error=>{if(!current)return;const ms=performance.now()-started;timings.push({stage:current.stage,ms});worldActivity(current.nodeIds,error?'error':'end',current.stage,{operation,requestId:message.id,correlationId,stage:current.stage,durationMs:ms,status:error?'failed':'completed',...(error?{error:String(error?.message??error)}:{})});current=null;};
 return {stage(stage,nodeIds=['runtime:registry']){close();current={stage,nodeIds};started=performance.now();evt('tab-load-progress',{tab:message.tab??(operation==='worldsInspection'?'worlds':null),requestId:message.id,operation,correlationId,stage});worldActivity(nodeIds,'start',stage,{operation,requestId:message.id,correlationId,stage,status:'running'});},finish(error=null){close(error);return timings;}};
}
const knowledgeReadFiles=new Map(),knowledgeReadPurposes=new Map();
let knowledgeInspectionSource=null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let engine = null, session = null, settings = {}, mods = null, testHooks = false, faultNow = null;
const active = new Map();            // request id -> AbortController of a send or dry read that runs
const turnRunning = () => [...active.values()].some((c) => !c.dry);
/**
 * A load that is not the turn's own starts only when no turn runs (owner check 2026-11-15: a Romanian session's background load of every world started during the first turn;
 * reading the worlds' files ticked against the TURN's step budget, "compute budget exceeded at index.readString", and the charts and talk worlds were reported as not loaded).
 * A turn's own loads come before its reading (no budget is installed then) and wait for a load in progress through the one lock.
 */
const turnIdle = async () => { while (turnRunning() || warming) await sleep(20); };   // a warm-up turn holds a step budget too
let reloading = 0;   // a world load in progress: the warm-up turns wait for it (they would read a half-swapped engine and charge their budget)
let dispatcherEnc = null, normalizerHost = null, dispatcherInfo = null;
let projectWorld=null,projectAreas=[];
let worldLoader = null, loaders = null, rulesMod = null, wordMod = null, tabWorlds = {}, universe = null;   // LAZY LOADING: the world index, the library modules the loader needs, tab id -> world id, the worlds this page may use (tests)
const loadedIds = new Set();
const DEFAULT_DICE_WORLD = 'art.draw';
let sampler = null, samplerRun = null;   // the sampler of the session (sopworld std.sample; novelty is kept in it)
const recentWorlds = [];   // worlds the last replies came from, newest first
const noteWorlds = (reply) => { for (const x of (reply?.segments ?? [])) { const id = x.match?.worldId ?? x.world; if (id) { const i = recentWorlds.indexOf(id); if (i >= 0) recentWorlds.splice(i, 1); recentWorlds.unshift(id); } } recentWorlds.length = Math.min(recentWorlds.length, 6); };
const allowed = (id) => !universe || id === 'core' || universe.has(id);
const absModule = (path, id, kind) => new URL(path, ROOT).href + (ver[`worlds/${id}/${kind}.mjs`] ? `?v=${ver[`worlds/${id}/${kind}.mjs`]}` : '');
const snaps = new Map();             // undo id -> engine snapshot (a ring: the last SNAP_KEEP)
const SNAP_KEEP = 24;
let lastTurnEnd = 0;
let readerPrevious=null,readerStatus={state:'unavailable'},readerObservation=null,readerDiagnostics=[],readerReady=null;
const budgetMod = { createBudget: null };
let btSeq = 0;
const btPending = new Map();         // id -> { resolve, reject } of a call to the page's browser translator / detector
let knowledgeFacts = null;           // the catalog reader (createFacts), once attached
let warming = null;                  // the warm-up turn that runs: a user turn waits for it (the turn guard is shared), at most one warm-up turn long
const one = async (s, text, opts) => { const p = s.send(text, opts).catch(() => {}); warming = p; try { await p; } finally { if (warming === p) warming = null; } };

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
const areaForWorld=world=>Object.values(mods?.NATIVE_AREAS??{}).find(area=>area.world===world);
function canonicalStates(state){
 return Object.fromEntries(Object.entries(state??{}).map(([world,value])=>{const area=areaForWorld(world);return [world,value&&area?.canonicalizeState?area.canonicalizeState(value):value];}));
}
function canonicalizeSessionStates(){Object.assign(session.isession.state,canonicalStates(session.isession.state));}
const coreStateOf=()=>{canonicalizeSessionStates();return session.state();};
// Projection is a transport boundary. The session and all undo snapshots keep canonical carriers.
const stateOf=()=>Object.fromEntries(Object.entries(coreStateOf()).map(([world,value])=>{const area=areaForWorld(world);return [world,value&&area?.projectState?area.projectState(value):value];}));
/** Of the before-turn state, the worlds the turn loaded (not in `had`): the page has the others in its own snapshot, so its what-happened diff needs nothing more. */
const loadedBefore = (before, had) => Object.fromEntries(Object.entries(before ?? {}).filter(([id]) => !had.has(id)));   // `had`: the worlds whose state the page holds (it sends their ids)
const metaOf = () => ({ msg: session._msg, lang: session._sessionLang, weakRo: session._weakRo, language: session.language, memory: memoryOf(), readerPrevious });
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

}

const KNOWLEDGE_FETCH_MS = 8000;   // the catalog URL is the pinned one (lib/knowledge/catalog-pin.mjs, P4), read in init
// ---------- boot ----------
async function init(m) {
  Object.assign(ver, m.versions ?? {});
  testHooks = m.testHooks === true;
  settings = { ...(m.settings ?? {}) };
  const imp = (rel) => import(vurl(rel));
  globalThis.__psys2LazyRoEn = true; // prevent eager loading of retired language tables
  const [dialog, loadersMod, soplang, rc, g, tl, lang, wlMod, areaMod] = await Promise.all([
    imp('lib/dialog/index.mjs'), imp('lib/loaders/bundle-loader.mjs'), imp('lib/soplang/index.mjs'),
    imp('lib/dialog/runtime-config.mjs'), imp('lib/formalizer/guard.mjs'), imp('lib/dialog/time-limits.mjs'), imp('ui/language.mjs'), imp('ui/world-loader.mjs'), imp('lib/dialog/app-reader-context.mjs')]);
  loaders = loadersMod;
  tabWorlds = m.tabWorlds ?? {}; universe = m.onlyWorlds ? new Set(m.onlyWorlds) : null;
  try { const b = await imp('lib/dialog/budget.mjs'); budgetMod.createBudget = b.createBudget ?? null; } catch { budgetMod.createBudget = null; }   // agent B's step budget, when this build has it
  mods = { tl, dialog, rc, guard: g.guard, TurnAborted: g.TurnAborted, soplang, lang, ...areaMod };
  Object.assign(mods,await imp('lib/dialog/project-world.mjs'));
  projectAreas=(m.tabBindings??Object.entries(tabWorlds).map(([view,world])=>({view,world,label:view}))).map(area=>({...area,schemaWorld:worldLoader?.info(area.world)?.schemaWorld??null}));projectWorld=mods.createProjectWorld({areas:projectAreas});
  // the guard reports its stage to the page at once (postMessage from synchronous code is delivered while the loop runs): a killed turn says where it was
  { let last = ''; const report = (stage) => { if (stage && stage !== last) { last = stage; evt('stage', stage); worldActivity(['component:reasoner'],'stage',stage); } };   // a few dozen changes per turn
    const gc = g.guard.check.bind(g.guard), gs = g.guard.setStage.bind(g.guard), ga = g.guard.abortable.bind(g.guard);
    g.guard.check = (stage) => { report(stage); return gc(stage); };
    g.guard.setStage = (stage) => { report(stage); return gs(stage); };
    g.guard.abortable = (p, stage) => { report(stage); return ga(p, stage); }; }
  g.guard.setWaitListener?.((op) => evt('turn-wait', { op }));   // LOAD-WAIT: a load inside a turn is not compute (guard.untimed): the page pauses its watchdog meanwhile
  // PROGRESS: the page's start-up steps follow the real order (the page ends none of them itself, so a step that never ends is a bug the progress test catches)
  evt('boot-step', { id: 'worlds', op: 'start' });
  // LAZY LOADING: the small routing index (worlds/index.json) now; a world's files when the world is needed. A start loads the always-loaded worlds (the shell and what reading needs), the open
  // tab's world, and the worlds a restored session has state or memory in. Everything else loads when a tab opens, when the words of a message say so, or when the user names it.
  const fetchJson = async (rel, hash) => { const r = await fetch(abs(rel) + (hash ? `?v=${hash}` : ''), { cache: 'default' }); if (!r.ok) throw new Error(`${rel}: HTTP ${r.status}`); return r.json(); };
  worldLoader = wlMod.createWorldLoader({ indexHash: ver['worlds/index.json'], fetchJson, bag: () => new Set() });
  await worldLoader.init();
  // `?psys2lazy=0` (tests, a comparison with the full set) and a saved language other than English: every world is loaded at start (a Romanian message is read through English candidates that a
  // partial world set can mistake for understood: a session that starts in Romanian must read like the full set, from its first message)
  // BOOT COST (owner export 2026-11-14 22:43: "Starting the reasoner" took 6.3 s on a phone in a Romanian session): a saved language other than English no longer builds the engine on every world at
  // start. It starts on the lazy set like English and the rest loads in the background once the reasoner is up; a Romanian message still waits for every world before it is read (send).
  const startIds = [...worldLoader.startIds({ tabWorld: m.tabWorld ?? null, state: m.restoreState, recent: m.restoreMeta?.memory?.recent ?? [] })].filter((id) => allowed(id));
  await worldLoader.bundles(startIds);
  for (const id of startIds) loadedIds.add(id);
  const bundle = worldLoader.bundleOf(startIds, absModule);
  const bundleBytes = startIds.reduce((s, id) => s + (worldLoader.info(id)?.bytes ?? 0), 0);
  // Host transport only: no legacy translator, dispatcher, normalizer or warm-up reader.
  const browserCall = (op, payload) => new Promise((resolve, reject) => {
    const id = ++btSeq;
    const timer = setTimeout(() => { btPending.delete(id); reject(new Error('browser translation timeout')); }, 10000);
    btPending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    post({ type: 'bt', id, op, ...payload });
  });
  const translator = { usage: [], detectUsage: [], resetUsage() {},
    machineTranslate: (text, { from, to }) => browserCall('translate', { text, from, to }),
    detectInput: text => browserCall('detect', { text }) };
  evt('boot-step', { id: 'worlds', op: 'end', bytes: bundleBytes, count: startIds.length });
  evt('boot-step', { id: 'reasoner', op: 'start' });
  engine = await dialog.createEngine({ loader: loadersMod.createBundleLoader(bundle), translator, options: { reasoner: 'matrix', applicationAreas: worldLoader.index.retiredAreas ?? [] } });   // the product reasoner (spec 15): the page never selects ops, the test oracle
  engine.onWorldActivity=({nodeIds,phase,label,...extra})=>worldActivity(nodeIds,phase,label,extra);
  evt('boot-step', { id: 'reasoner', op: 'end' });
  // The knowledge catalog (spec 17): the sop-knowledge-worlds copy on GitHub Pages, read lazily (nothing is fetched until a message needs a thing the board or the
  // lexicons do not have), each file bounded by KNOWLEDGE_FETCH_MS (a slow or offline read counts as unreachable and is asked again after a backoff, see facts.mjs).
  engine.onModelTimeout = (info) => evt('model-timeout', info);   // a model call timed out and the rules answered (spec 06): the debug panel says so once and counts
  // Offline, the objects vendored in the world (things.catalog.mjs) and the bundled subset still work; lookups of other things then answer as unknown.
  try {
    const [{ createFacts }, { createKnowledgeSource }, { createLayeredSource }] = await Promise.all([imp('lib/knowledge/facts.mjs'), imp('lib/loaders/knowledge-source.mjs'), imp('lib/knowledge/bundled-source.mjs')]);
    const { createCachedSource } = await imp('lib/loaders/knowledge-cache.mjs');
    const { knowledgeTimeoutMs } = await imp('lib/loaders/knowledge-source.mjs');
    const { KNOWLEDGE_URLS } = await imp('lib/knowledge/catalog-pin.mjs');   // the catalog at the pinned commit, not the moving Pages head (P4); its mirrors when one fails
    const src = createCachedSource({ source: createKnowledgeSource(settings.knowledgeUrl || KNOWLEDGE_URLS), caches: globalThis.caches, onCacheEvent: (e) => evt('knowledge-cache', e) });
    // the bundled subset (colours, number words, the drawings of the built-in kinds: generated from the catalog) answers for a catalog that cannot be reached; the catalog replaces it when it can
    const layered = createLayeredSource({ text: (p) => Promise.race([src.text(p).catch(() => null), new Promise((res) => setTimeout(() => res(null), knowledgeTimeoutMs(p) + 2000))]) });
    knowledgeInspectionSource={...layered,async text(path,{purpose='runtime',requestId}={}){const started=performance.now(),activity={operation:purpose==='inspection'?'knowledge.inspect.read':'knowledge.read',stage:'knowledge',path,purpose,...(requestId===undefined?{}:{requestId})};worldActivity(['knowledge:catalog'],'start','Read '+path,activity);try{const text=await layered.text(path);if(typeof text==='string'){knowledgeReadFiles.set(path,text);if(!knowledgeReadPurposes.has(path))knowledgeReadPurposes.set(path,new Set());knowledgeReadPurposes.get(path).add(purpose);}worldActivity(['knowledge:catalog','knowledge-file:'+path],text==null?'unavailable':'end','Read '+path,{...activity,durationMs:performance.now()-started});return text;}catch(error){worldActivity(['knowledge:catalog'],'error','Read '+path,{...activity,durationMs:performance.now()-started,error:String(error?.message??error)});throw error;}}};
    knowledgeFacts=createFacts({source:knowledgeInspectionSource});
    engine.setKnowledge(knowledgeFacts);
    engine.onNotice = (text) => evt('notice', text);   // "Looking up how a pineapple looks..." while a shard loads
  } catch (e) { console.warn('knowledge catalog not attached', e); }

  evt('rules-compiled'); // compatibility progress event; no retired rule compilation
  session = engine.createSession({ language: lang.normalize(settings.language) });   // LANG-FIXED: always an explicit 'en' | 'ro', never 'auto'
  applySettings(null);
  if (m.restoreState) restoreStates(m.restoreState, m.restoreMeta);
  canonicalizeSessionStates();
  // Editor hosts and inspection do not depend on neural session construction.
  readerReady=installSopReader(imp);
  return { retiredAreas: worldLoader.index.retiredAreas ?? [], worlds: engine.worlds().map((w) => w.id), known: worldLoader.ids(), worldTabs: Object.fromEntries(worldLoader.ids().map((id) => [id, worldLoader.info(id).tab?.id ?? null]).filter(([, v]) => v)), problems: engine.problems?.() ?? [], state: stateOf(), hasDispatcher: !!dispatcherEnc, hasNormalizer: !!normalizerHost, budget: !!budgetMod.createBudget, reader: readerStatus };
}

async function installSopReader(imp){
  readerStatus={state:'loading'};evt('sop-reader-status',readerStatus);worldActivity(['component:reader'],'start','Initialize SOP-BERT');
  try{
    const response=await fetch(vurl('models/sop-bert/deployment.json'));if(!response.ok)throw Error('SOP-BERT deployment HTTP '+response.status);
    const deployment=await response.json();if(deployment.format!=='psys2.browser-reader-deployment/1')throw Error('unsupported-reader-deployment');
    const [{createBrowserReaderHost},{createAppReaderContext}]=await Promise.all([imp('lib/dialog/browser-reader-host.mjs'),imp('lib/dialog/app-reader-context.mjs')]);
    const getContext=createAppReaderContext({getState:()=>session.isession.state,getPrevious:()=>readerPrevious,getInstanceId:world=>{session.nativeInstanceIds??={};return session.nativeInstanceIds[world]??=crypto.randomUUID();},onObservation:value=>{readerObservation=value;if(value.contextSelection)worldActivity(['component:reader',...(value.world?['native:'+value.world]:[])],'stage','Select reader context',{operation:'reader.context.select',world:value.world,contextSelection:value.contextSelection});}});
    const host=await createBrowserReaderHost({manifestURL:abs(deployment.manifestPath),manifestSha256:deployment.manifestSha256,tokenizerArtifact:deployment.tokenizerArtifact,bindingsArtifact:deployment.bindingsArtifact,tokenizerConfigArtifact:deployment.tokenizerConfigArtifact,runtimeIdentity:deployment.runtimeIdentity,getContext,resolveURL:rel=>abs(rel),recordDiagnostics:async diagnostic=>{readerDiagnostics.push(diagnostic);if(readerDiagnostics.length>64)readerDiagnostics.shift();const selection=diagnostic.result?.auxiliary?.contextSelection;if(selection)worldActivity(['component:reader'],'stage','Fit reader context to model budget',{operation:'reader.context.fit',contextSelection:selection});}});
    engine.requestReader={...host.provider,async *proposeRequests(text){
      const correlationId='reader:'+crypto.randomUUID(),started=performance.now();let index=0;
      worldActivity(['component:reader'],'start','Read coordinated requests',{operation:'reader.proposeRequests',correlationId,text});
      try{
        for await(const result of host.provider.proposeRequests(text)){
          worldActivity(['component:reader'],'stage','Reader request proposal',{operation:'reader.proposeRequests',correlationId,index:index++,sourceRange:result.composition?.range??null,coverage:result.coverage??null,failures:result.failures??[],proposals:(result.candidates??[]).map(candidate=>({request:candidate.request,wires:candidate.wires}))});
          yield result;
        }
        worldActivity(['component:reader'],'end','Coordinated reading complete',{operation:'reader.proposeRequests',correlationId,requests:index,durationMs:performance.now()-started,timingScope:'iterator lifetime includes execution between request proposals'});
      }catch(error){worldActivity(['component:reader'],'error','Reader failed',{operation:'reader.proposeRequests',correlationId,durationMs:performance.now()-started,error:String(error?.message??error)});throw error;}
    },async propose(text){
      const correlationId='reader:'+crypto.randomUUID(),started=performance.now();
      worldActivity(['component:reader'],'start','Read request',{operation:'reader.propose',correlationId,text});
      try{const result=await host.provider.propose(text);worldActivity(['component:reader'],'end','Reader proposal',{operation:'reader.propose',correlationId,durationMs:performance.now()-started,coverage:result.coverage??null,failures:result.failures??[],proposals:(result.candidates??[]).map(candidate=>({request:candidate.request,wires:candidate.wires}))});return result;}
      catch(error){worldActivity(['component:reader'],'error','Reader failed',{operation:'reader.propose',correlationId,durationMs:performance.now()-started,error:String(error?.message??error)});throw error;}
    }};readerStatus={state:'ready',verified:host.verified,cache:host.browserHost.cache};
  }catch(error){
    const reason=String(error?.message??error);readerStatus={state:'unavailable',reason};
    engine.requestReader={propose:async()=>({candidates:[],coverage:{complete:false,graphProposal:false,executable:false},failures:[{reason:'model-load-failed',detail:reason}]})};
  }
  evt('sop-reader-status',readerStatus);worldActivity(['component:reader'],readerStatus.state==='ready'?'end':'error','Initialize SOP-BERT',{state:readerStatus.state,...(readerStatus.reason?{reason:readerStatus.reason}:{})});
}

async function waitForSopReader(signal=null){
 if(readerStatus.state!=='loading'||!readerReady)return;
 evt('stage','reader-loading');evt('turn-wait',{op:'start',source:'sop-reader'});
 let abort;
 try{
  if(signal?.aborted)throw new mods.TurnAborted(signal.reason?.name==='TimeoutError'?'timeout':'stopped','reader-loading');
  const cancelled=signal?new Promise((_,reject)=>{abort=()=>reject(new mods.TurnAborted(signal.reason?.name==='TimeoutError'?'timeout':'stopped','reader-loading'));signal.addEventListener('abort',abort,{once:true});}):null;
  await (cancelled?Promise.race([readerReady,cancelled]):readerReady);
 }finally{if(abort)signal.removeEventListener('abort',abort);evt('turn-wait',{op:'end',source:'sop-reader'});}
}

function restoreStates(state, meta) {
  if (state && typeof state === 'object') {
    session.isession.state = canonicalStates({ ...session.isession.state, ...structuredClone(state) });
    if (meta) {
      readerPrevious=typeof meta.readerPrevious==='string'?meta.readerPrevious:null;
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
const activeWorld=()=>{
 const started=performance.now();let tab=null;
 try{tab=session.state()['ui.shell']?.activeTab??null;const world=mods.projectDomainForTab(projectWorld,tab)?.world??null;worldActivity(['project:application',...(world?['world:'+world]:[])],'stage','Resolve active capability domain',{operation:'project.domain.resolve',stage:'project.domain.resolve',tab,world,durationMs:performance.now()-started,status:world?'resolved':'unresolved'});return world;}
 catch(error){worldActivity(['project:application'],'error','Resolve active capability domain',{operation:'project.domain.resolve',stage:'project.domain.resolve',tab,world:null,durationMs:performance.now()-started,status:'failed',error:String(error?.message??error)});return null;}
};
const loadedLog = [];   // what was loaded on demand: { ids, why, ms, bytes } (diagnostics and the on-demand report)
/**
 * Adds `ids` (and what they import) to the running engine: fetches their files, replaces the world set (`engine.reload`), and gives the session its state and memory back, as a restart does.
 * Nothing happens when they are all loaded. A failed fetch changes nothing: the engine goes on with the worlds it has (a lazy fetch that fails never changes a reading).
 */
let lockP = Promise.resolve();   // one load at a time (a page request and a turn can ask together)
const ensureWorlds = (ids, why,progress=()=>{}) => { const p = lockP.then(() => ensureRun(ids, why,progress), () => ensureRun(ids, why,progress)); lockP = p.catch(() => {}); return p; };
async function ensureRun(ids, why,progress=()=>{}) {
  progress('Read world dependencies');
  const want = worldLoader.closure([...ids].filter((id) => allowed(id) && worldLoader.info(id)));
  const missing = [...want].filter((id) => !loadedIds.has(id));
  if (!missing.length) {canonicalizeSessionStates();return [];}
  const label = worldLabel(missing), stepId = `world:${missing.join(',')}`, t0 = performance.now();
  evt('world-load', { id: stepId, op: 'start', label, why, ids: missing });
  worldActivity(missing.map(id=>'world:'+id),'start',label,{why});
  try {
    progress('Fetch world bundles');
    try { await worldLoader.bundles(want); } catch (e) { evt('world-load', { id: stepId, op: 'fail', label, message: String(e?.message ?? e) }); return []; }
    progress('Compile world schemas and methods');
    const next = [...loadedIds, ...missing];
    reloading++;
    try { await engine.reload(loaders.createBundleLoader(worldLoader.bundleOf(next, absModule))); } finally { reloading--; }
    // the session is read HERE, after the awaits and with none between this and the new session: a state the page set while the worlds were loading (a tab click, a setting) is in it, and is not lost
    progress('Restore live world state');
    const st = coreStateOf(), meta = metaOf();
    const old = session, portable = [...snaps].map(([k, sn]) => { try { return [k, old.portableSnapshot(sn)]; } catch { return null; } }).filter(Boolean);   // the undo snapshots as plain data: they survive the reload
    for (const id of missing) loadedIds.add(id);
    session = engine.createSession({ language: mods.lang.normalize(settings.language) });
    applySettings(null);
    restoreStates(st, meta);
    snaps.clear();
    for (const [k, rec] of portable) { try { snaps.set(k, session.adoptSnapshot(rec)); } catch { /* that turn's undo goes through the page's state record */ } }

    const bytes = missing.reduce((s, id) => s + (worldLoader.info(id)?.bytes ?? 0), 0);
    loadedLog.push({ ids: missing, why, ms: Math.round(performance.now() - t0), bytes });
    evt('world-load', { id: stepId, op: 'end', label, bytes, ids: missing });
    evt('worlds-loaded', { ids: missing, all: [...loadedIds], why });
    worldActivity(missing.map(id=>'world:'+id),'end','Worlds loaded',{why});
    return missing;
  } catch (e) { evt('world-load', { id: stepId, op: 'fail', label, message: String(e?.message ?? e) }); throw e; }
}
const allLoaded = () => worldLoader.ids().filter(allowed).every((id) => loadedIds.has(id));
/** A reading is complete when something was understood and nothing was left out or guessed: otherwise a world that is not loaded might have read it (the worker then reads it again with every world). */


// ---------- requests ----------
const handlers = {
  async init(m) { return init(m); },
  async send(m) {
    if (samplerRun) await samplerRun;
    const ctl = new AbortController();
    executionRequestId=m.id;
    active.set(m.id, ctl);
    if (warming) await warming;
    faultNow = testHooks ? (m.fault ?? null) : null;
    if (m.settings) applySettings(m.settings);
    const had = new Set(Array.isArray(m.known) ? m.known : loadedIds);   // the page's snapshot has these worlds; a world loaded since (by this turn, or by a background load the page has not seen) is in `before`
    // Load only the selected host; words never dispatch to other worlds.
    await ensureWorlds([activeWorld()].filter(Boolean), 'active host');
    let snap = session.snapshot();
    // TURN BASELINE (reviewer 2026-11-15 03:15 item 5): the state the turn starts from, taken AFTER the lazy loads: a world loaded for this turn is in it with its initial state, so the
    // page's what-happened diff does not list it as changed "(was none)". Taken again whenever the turn loads more worlds and is read again.
    let before = stateOf();
    if (m.undoId != null) { snaps.set(m.undoId, snap); if (snaps.size > SNAP_KEEP) snaps.delete(snaps.keys().next().value); }
    let budget = null;
    const newBudget = () => (budgetMod.createBudget ? (() => { try { return budgetMod.createBudget(m.limits ?? undefined); } catch { return null; } })() : null);
    budget = newBudget();
    mods.guard.setStage?.('start');
    try {
      await waitForSopReader(ctl.signal);
      const translator = engine.translator; translator.resetUsage?.();
      let reply;
      const read = async () => {
        session.takeMissed?.();
        try { return await session.send(m.text, { ...m.opts, language: mods.lang.normalize(m.opts?.language ?? m.settings?.language), signal: ctl.signal, undo: snap, ...(budget ? { budget } : {}) }); }
        catch (e) { if (e?.name === 'TurnAborted' || e?.name === 'BudgetExceeded' || ctl.signal.aborted) { try { session.restore(snap); } catch { /* keep */ } } if (budget && e && typeof e === 'object') e.bySite = { ...budget.bySite }; throw e; }
      };
      readerDiagnostics=[];readerObservation=null;
      worldActivity(['component:reasoner'],'start','Session request');
      reply = await read();
      worldActivity(['component:reasoner'],'end','Session request completed');readerPrevious=m.text;
      reply.trace={...reply.trace,readerHost:{state:readerStatus.state,reason:readerStatus.reason??null,diagnosticCount:readerDiagnostics.length,area:readerObservation?.area??null,contextSelection:readerObservation?.contextSelection??null,modelContexts:readerDiagnostics.filter(diagnostic=>diagnostic.result?.auxiliary?.contextSelection).map(diagnostic=>diagnostic.result.auxiliary.contextSelection)}};
      annotateWires(reply);
      noteWorlds(reply);
      return { reply, before: loadedBefore(before, had), state: stateOf(), meta: metaOf(), usage: (translator.usage ?? []).map((u) => ({ ...u })), detection: (translator.detectUsage ?? []).map((u) => ({ ...u })),
        budget: budget ? { ticks: budget.ticks, bySite: { ...budget.bySite } } : null, ort: true };
    } catch(error){worldActivity(['component:reasoner'],'error','Session request failed',{error:String(error?.message??error)});throw error;} finally { active.delete(m.id); lastTurnEnd = performance.now(); faultNow = null; sendOrt(); }
  },
  async nativeTools(m) {
    const {NATIVE_AREAS,createAreaHost}=await import(vurl('lib/dialog/app-reader-context.mjs'));
    const area=NATIVE_AREAS[m.view];if(!area)throw Error('Unknown area.');
    await ensureWorlds([area.world],'area tools');
    const host=await createAreaHost(area,{state:session.isession.state[area.world],instanceId:(session.nativeInstanceIds??={})[area.world]??=(crypto.randomUUID()),loader:engine.loader,knowledge:engine.knowledge});
    return {operations:host.bindings(),observation:host.observe(),capabilities:host.capabilities?.()??null};
  },
  async snapshotInstances(m) {
    while(turnRunning())await sleep(20);
    const {snapshotNativeInstances}=await import(vurl('lib/dialog/instance-persistence.mjs'));
    return {records:await snapshotNativeInstances(session,{worlds:m.worlds})};
  },
  async restoreInstances(m) {
    while(turnRunning())await sleep(20);
    const {NATIVE_AREAS}=await import(vurl('lib/dialog/app-reader-context.mjs'));
    const known=new Set(Object.values(NATIVE_AREAS).map(area=>area.world));
    if(!Array.isArray(m.records)||m.records.some(record=>!known.has(record?.world)))throw Error('Unknown persisted instance world.');
    await ensureWorlds(m.records.map(record=>record.world),'saved SOP instances');
    const {restoreNativeInstances}=await import(vurl('lib/dialog/instance-persistence.mjs'));
    const restored=await restoreNativeInstances(session,m.records);
    return {...restored,state:stateOf(),meta:metaOf()};
  },
  async worldSources(m){
    while(turnRunning())await sleep(20);
    if(!knowledgeInspectionSource)throw Error('knowledge-source-unavailable');
    const readText=async path=>{
      if(!knowledgeReadFiles.has(path))return knowledgeInspectionSource.text(path,{purpose:'inspection',requestId:m.id});
      if(!knowledgeReadPurposes.has(path))knowledgeReadPurposes.set(path,new Set());knowledgeReadPurposes.get(path).add('inspection');
      worldActivity(['knowledge:catalog','knowledge-file:'+path],'end','Inspect cached source '+path,{operation:'knowledge.inspect.read',purpose:'inspection',requestId:m.id,path,cached:true});
      return knowledgeReadFiles.get(path);
    };
    const indexText=await readText('index.json');if(typeof indexText!=='string')throw Error('knowledge-index-unavailable');
    const {inspectCatalogSources}=await import(vurl('ui/knowledge-source-inspection.mjs'));
    return inspectCatalogSources({nodeId:m.nodeId,offset:m.offset??0,index:JSON.parse(indexText),readText});
  },
  async worldsInspection(m) {
    const progress=loadProgress(m,'worldsInspection');try{progress.stage('Wait for active action');
    while(turnRunning())await sleep(20);
    progress.stage('Read catalog index for inspection');
    if(!knowledgeReadFiles.has('index.json'))await knowledgeInspectionSource?.text('index.json',{purpose:'inspection',requestId:m.id});
    progress.stage('Load inspection modules');canonicalizeSessionStates();
    const [{NATIVE_AREAS},{observeNativeInstanceWorlds},{inspectWorldsRuntime}]=await Promise.all([import(vurl('lib/dialog/app-reader-context.mjs')),import(vurl('lib/dialog/instance-persistence.mjs')),import(vurl('lib/dialog/worlds-inspection.mjs'))]);
    const available=Object.entries(NATIVE_AREAS).filter(([,area])=>loadedIds.has(area.world)&&session.isession.state[area.world]);
    progress.stage('Observe live instance facts');
    const instances=await observeNativeInstanceWorlds(session,{worlds:available.map(([,area])=>area.world),includeHostInterface:true,prepareKnowledge:false});
    progress.stage('Describe observed adapter interfaces');
    const viewByWorld=new Map(available.map(([view,area])=>[area.world,view])),hosts=instances.map(record=>({view:viewByWorld.get(record.world),world:record.world,observation:record.observation,...record.nativeInterface}));
    const {serialize,version,build,SCHEMA_TYPES,STAGES,TURN_STAGES}=await import(vurl('lib/vendor/sopworld/sopworld.mjs'));
    const instanceCaches=Object.entries(session.instanceWorlds??{}).map(([world,cache])=>({world,wireCount:cache.wires?.size??0,wires:serialize([...(cache.wires?.values?.()??[])])}));
    progress.stage('Describe runtime packages');
    const baseGraph=inspectWorldsRuntime({nativePackages:Object.entries(worldLoader.composition?.profiles??{}).filter(([,profile])=>profile.nativeHost||profile.nativeInitializer).map(([id])=>id),index:worldLoader.index,bundle:worldLoader.bundleOf([...loadedIds],absModule),loaded:[...loadedIds],instances,hosts,knowledgeFiles:[...knowledgeReadFiles].map(([path,text])=>({path,text,purposes:[...(knowledgeReadPurposes.get(path)??[])]})),reader:readerStatus,nativeStates:session.isession.state,instanceCaches,sessionMeta:metaOf(),libraryInfo:{version,build,schemaTypes:[...SCHEMA_TYPES],stages:STAGES,turnStages:TURN_STAGES}});
    const {describeWorldsNodes}=await import(vurl('lib/dialog/worlds-node-metadata.mjs'));
    const {inspectExecutionWorlds}=await import(vurl('lib/dialog/execution-world-inspection.mjs'));
    progress.stage('Read execution knowledge and episodes');
    const executionGraph=await inspectExecutionWorlds(session);
    progress.stage('Build project world links');
    projectAreas=projectAreas.map(area=>({...area,schemaWorld:worldLoader.info(area.world)?.schemaWorld??area.schemaWorld}));projectWorld=mods.createProjectWorld({areas:projectAreas,instances});const projectGraph=mods.inspectProjectWorld(projectWorld);
    return {...baseGraph,centralNodeId:'project:application',areas:projectAreas,nodes:describeWorldsNodes([...baseGraph.nodes,...executionGraph.nodes,...projectGraph.nodes]),edges:[...baseGraph.edges,...executionGraph.edges,...projectGraph.edges,...['new-engine','declared-execution'].map(name=>({from:'component:reasoner',to:'execution:module:'+name,label:'dispatches to'}))],activity:activityLog.slice(),timings:progress.finish()};
    }catch(error){progress.finish(error);throw error;}
  },
  async instanceInspection(m) {
    while(turnRunning())await sleep(20);
    const {NATIVE_AREAS,createAreaHost}=await import(vurl('lib/dialog/app-reader-context.mjs'));
    const area=Object.values(NATIVE_AREAS).find(area=>area.world===m.world);
    if(!area)throw Error('Unknown inspected instance world.');
    await ensureWorlds([m.world],'inspecting SOP world');
    const {observeNativeInstanceWorlds}=await import(vurl('lib/dialog/instance-persistence.mjs'));
    const record=(await observeNativeInstanceWorlds(session,{worlds:[m.world],prepareKnowledge:false}))[0];
    if(!record)throw Error('Instance state unavailable.');
    const {inspectInstanceRecord}=await import(vurl('lib/dialog/instance-inspection.mjs'));
    const data=inspectInstanceRecord({...record,wires:record.carrier},{observation:record.observation,...(record.authoritative?{semanticWires:record.wires,interfaceTypeKey:area.stateInterfaceTypeKey??null}:{})});
    return {...data,wires:record.wires,archiveWires:record.carrier};
  },
  async instanceFacts(m) {
    while(turnRunning())await sleep(20);
    const {snapshotNativeInstances}=await import(vurl('lib/dialog/instance-persistence.mjs'));
    const records=await snapshotNativeInstances(session,{worlds:[m.world]});
    return records[0]??null;
  },
  async sampleControl(m) {
    if(samplerRun)await samplerRun.catch(()=>undefined);
    if(turnRunning())return {candidate:null,reason:'busy'};
    const ctl=new AbortController();active.set(m.id,ctl);
    try {
      const [{NATIVE_AREAS,createAreaHost},{sampleNativeControl}]=await Promise.all([import(vurl('lib/dialog/app-reader-context.mjs')),import(vurl('lib/dialog/native-control-sampler.mjs'))]);
      const area=NATIVE_AREAS[m.view];
      if(!area||session.isession.state['ui.shell']?.activeTab!==m.view)return {candidate:null,reason:'active-tab-changed'};
      await ensureWorlds([area.world],'random area action');
      const state=session.isession.state[area.world];
      const createHost=({state})=>createAreaHost(area,{state,instanceId:'random-'+crypto.randomUUID(),loader:engine.loader,knowledge:engine.knowledge});
      const host=await createHost({state});
      return {candidate:await sampleNativeControl({host,createHost,state})};
    }finally{active.delete(m.id);}
  },
  async nativeTool(m) {
    // Background example generation must finish before a user edit, never discard it.
    if(samplerRun)await samplerRun.catch(()=>undefined);
    if(turnRunning())throw Error('An action is already running.');
    executionRequestId=m.id;
    const ctl=new AbortController();active.set(m.id,ctl);
    try{const {NATIVE_AREAS}=await import(vurl('lib/dialog/app-reader-context.mjs'));
      const view=m.view,area=NATIVE_AREAS[view];
      if(!area||(session.isession.state['ui.shell']?.activeTab!==view))throw Error('The active tab changed. Please try again.');
      await ensureWorlds([area.world],'area control');
      const {invokeNativeControl}=await import(vurl('lib/dialog/native-tool-controls.mjs'));
      const result=await invokeNativeControl(session,{view,operation:m.operation,args:m.args});
      return {...result,state:stateOf(),meta:metaOf()};
    }finally{active.delete(m.id);}
  },
  async dry() { return { complete: false, segments: 0, reason: 'unsupported', understood: [], missing: ['declared dry reading'] }; },
  async hint() { return null; },
  async observe() { return { follow: [], state: stateOf(), unsupported: 'No declared observation reaction is bound.' }; },
  async setWorldState(m) {
    const area=areaForWorld(m.worldId);canonicalizeSessionStates();
    if(area?.canonicalizeState){
      const current=session.isession.state[m.worldId]??{},patch=structuredClone(m.patch??{});
      const canonicalPatch=Object.keys(patch).every(key=>Object.hasOwn(current,key));
      const base=canonicalPatch?current:area.projectState?area.projectState(current):current;
      session.setWorldState(m.worldId,area.canonicalizeState({...base,...patch}));
    }else session.setWorldState(m.worldId,m.patch);
    return null;
  },
  async setStates(m) { restoreStates(m.state, m.meta); return { state: stateOf() }; },
  async restore(m) {
    const snap = m.undoId != null ? snaps.get(m.undoId) : null;
    if (snap) session.restore(snap); else if (m.state) restoreStates(m.state, m.meta);
    return { state: stateOf(), meta: metaOf() };
  },
  async settings(m) { applySettings(m.settings, { prepare: m.prepare }); return null; },
  async option(m) { session[m.key] = m.value; if (m.key === 'formalizer') session.setOption?.('formalizer', m.value); return null; },
  async prepare() { await waitForSopReader();return {available:readerStatus.state==='ready',reader:readerStatus}; },
  async sample(m) {
    if (samplerRun || turnRunning() || warming) return { items: [], available: true, reason: 'busy' };
    const run = (async () => {
      const [{NATIVE_AREAS},{createNativeRequestSampler}] = await Promise.all([import(vurl('lib/dialog/app-reader-context.mjs')),import(vurl('lib/dialog/native-request-sampler.mjs'))]);
      const view = m.tab ?? session.isession.state['ui.shell']?.activeTab, area = NATIVE_AREAS[view];
      if (!area || view !== session.isession.state['ui.shell']?.activeTab || readerStatus.state !== 'ready') return { items: [], available: false, reason: 'active-reader-area-unavailable' };
      await ensureWorlds([area.world], 'request sampler');
      const bindings = engine.requestReader.bindings?.();
      if (!bindings) return { items: [], available: false, reason: 'reader-bindings-unavailable' };
      sampler ??= createNativeRequestSampler();
      const host = await area.create({ state: structuredClone(session.isession.state[area.world]), instanceId: 'sampler-'+crypto.randomUUID() });
      const result = await sampler.sample({ session, area: area.area, view, world: area.world, host, createHost: area.create, bindings, mode: m.mode ?? 'one', count: Math.min(4,Math.max(1,Number(m.count)||1)) });
      const language = m.language ?? settings.language ?? 'en';
      if (language !== 'en') for (const item of result.items) {
        try { const translated = await engine.translator.machineTranslate(item.text,{from:'en',to:language}); if (typeof translated === 'string' && translated.trim()) item.text = translated; } catch { /* English remains usable input. */ }
      }
      return result;
    })();
    samplerRun = run;
    try { return await run; } finally { if (samplerRun === run) samplerRun = null; }
  },
  async warm() { return null; },
  /** The page needs a world now (its tab opens, the user names it): loads it and answers which worlds are loaded. */
  async ensure(m) {const progress=loadProgress(m,'ensure');try{progress.stage('Wait for active action');while(turnRunning())await sleep(20);progress.stage('Wait for world loader');const added=await ensureWorlds(m.worlds??[],m.why??'tab',stage=>progress.stage(stage));progress.stage('Project editor state');const state=stateOf();return {added,loaded:[...loadedIds],state,log:loadedLog.slice(-20),timings:progress.finish()};}catch(error){progress.finish(error);throw error;}},
  async loaded() { return { loaded: [...loadedIds], log: loadedLog.slice(), loader: worldLoader.stats }; },
  /** Page start-up step and its retries: reads the catalog's index (not the vocabulary: that is read by buckets, when a message needs it); { ok } is false while the catalog cannot be reached (the page asks again; `refresh` skips the backoff). */
  async catalog(m) {
    if (!knowledgeFacts) return { ok: false, bytes: null };
    if (m.refresh) knowledgeFacts.refresh();
    await knowledgeFacts.world?.('k.objects');   // LAZY LOADING: the catalog's index (version-cached), not its 1.3 MB vocabulary: a message reads the buckets of its words
    return { ok: !knowledgeFacts.unreachable(), bytes: knowledgeFacts.stats?.vocabBytes ?? null };
  },
  /** The parts of a catalog thing as the engine drew it (the drawing tab draws with these: the page never reads a second copy of the catalog that could miss a shard the reply counted). */
  async 'thing-parts'(m) { if (!knowledgeFacts) return null; let th = null; try { th = knowledgeFacts.peek?.(m.name) ?? await knowledgeFacts.thing(m.name); } catch { th = null; } const parts = th?.objects?.[0]?.parts; return parts?.length ? { name: th.name, parts } : null; },
  async 'ort-restart'(m) { globalThis.__psys2Ort?.restart?.(m.lane, m.why); sendOrt(); return null; },   // diagnostics and tests
  async 'ort-resume'() { globalThis.__psys2Ort?.resume?.(); sendOrt(); return null; },
};

onmessage = async (ev) => {
  const m = ev.data;
  if (m.type === 'bt-res') { const p = btPending.get(m.id); btPending.delete(m.id); if (p) { if (m.ok) p.resolve(m.value); else p.reject(new Error(m.error ?? 'browser API error')); } return; }
  if (m.op === 'abort') { for (const [id, ctl] of active) if (m.id == null || id === m.id) ctl.abort(new DOMException(m.reason === 'timeout' ? 'turn time limit' : 'stopped', m.reason === 'timeout' ? 'TimeoutError' : 'AbortError')); return; }
  const h = handlers[m.op];
  if (!h) { post({ type: 'res', id: m.id, ok: false, error: { name: 'Error', message: `unknown op ${m.op}` } }); return; }
  const recordsActivity=['send','nativeTool'].includes(m.op);
  if(recordsActivity)requestActivities.set(m.id,[]);
  try { const value=await h(m);post({type:'res',id:m.id,ok:true,value:recordsActivity?{...value,worldActivity:requestActivities.get(m.id).slice(),activityRequestId:m.id}:value}); }
  catch (e) { post({ type: 'res', id: m.id, ok: false, error: errOf(e) }); }
  finally {if(executionRequestId===m.id)executionRequestId=null;requestActivities.delete(m.id);}
};
