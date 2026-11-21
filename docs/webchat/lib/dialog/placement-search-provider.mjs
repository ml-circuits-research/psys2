// The std.problem provider for placement: Z3 in the browser when the page can run it, else none (the
// library's internal search). The library's browser provider loads Z3 once from the library's site (versioned,
// immutable URLs kept by the HTTP cache) and keeps the context for the session. Every placement is a placement
// problem, so the engine worker starts loading Z3 at start-up (warmPlacementSearch, in parallel, never awaited);
// a placement that comes first shares the same load.
//
// Z3's WebAssembly build needs SharedArrayBuffer, i.e. a cross-origin isolated page (docs/webchat/sw.js adds
// COOP/COEP when ISOLATE is on). Elsewhere, and in Node, no provider is returned and compileRequest stays
// synchronous with the internal search, exactly as before. If Z3 fails to load or to solve a model, the provider
// declines and the internal search answers; the result's provider attribute says which one solved it, and
// z3Status() says why Z3 did not.
import {z3Provider,z3Supported,z3Version} from '../vendor/sopworld/smt-z3.mjs?v=014593d224';

export const Z3_BASE=`https://ml-circuits-research.github.io/soplang-words-lib/vendor/z3-solver-${z3Version}/`;
let provider,state='not-loaded',lastLoad=null,lastSolve=null,warmedBy=null,warmStarted=null,failed=null,injected=null;
// Counters for the trace and for evaluation: solves asked, solved by Z3, declined to the internal search (the emergency path:
// Z3 not loadable here, a Z3 error, a timeout of Z3's own budget, or a failed solver), and the most solves asked at once.
const counts={asked:0,z3:0,internal:0,maxConcurrent:0,reasons:{}};
// Z3 runs its solver in pthreads (nested workers) on ONE context per realm. The context is not re-entrant: two solves in flight
// on it at once (a coordinated request places its things in parallel) corrupt it (Z3 assertion violations, "memory access out
// of bounds" in a pthread; measured 2026-11-21). Solves therefore run one at a time, in the order asked.
// A pthread that still crashes leaves the instance unusable; the host reports it (failPlacementSearch) and the internal search
// answers from then on in that realm, each time counted and logged as the emergency path.
const pending=new Set();
let queue=Promise.resolve(),inFlight=0;

// Interaction mode (the chat's Fast | Thinking toggle, settings.interactionMode): 'fast' asks Z3 for the first model that holds the
// hard constraints (no optimisation of the soft ones, one solution); 'thinking' optimises the declared soft constraints.
let mode='fast';
export function setPlacementMode(value){mode=value==='thinking'?'thinking':'fast';return mode;}
export const placementMode=()=>mode;
// Fast is not "any model" (a first model sits in a corner): the declared preferences still choose the place. The soft
// predicates (gap from other objects, not centred on one) are asked to hold as hard ones, and the linear terms (the pull to
// a region's point, minimise/maximise) stay the objective, which Z3 settles quickly; when the predicates cannot all hold,
// the same without them, and only then any model of the hard constraints. No search over which soft predicates to give up.
const linear=c=>['align','minimise','maximise'].includes(c.predicate);
const fastSteps=model=>{const soft=model.soft??[],rules=soft.filter(c=>!linear(c)),terms=soft.filter(linear),base={...model,depth:undefined,count:undefined};
 return [...(rules.length?[{...base,hard:[...model.hard,...rules],soft:terms}]:[]),...(terms.length?[{...base,soft:terms}]:[]),{...base,soft:[]}];};
const forMode=model=>mode==='thinking'||!model?[{...model}]:fastSteps(model);
const isolated=()=>globalThis.crossOriginIsolated===true;
const begin=by=>{if(state==='not-loaded'){state='warming';warmedBy=by;warmStarted=Date.now();}};
const declineTo=(reason)=>{counts.internal++;counts.reasons[reason]=(counts.reasons[reason]??0)+1;try{console.warn('placement: internal search (emergency path):',reason);}catch{/* no console */}return null;};

/**
 * Node and other hosts without the browser build: the caller gives the Z3 solver (for example the npm package z3-solver, the
 * same version the browser loads), so evaluations place with the same solver as the page. `solve(model)` answers like the
 * library provider; `preload()` resolves true when it is ready.
 */
export function usePlacementSolver({solve,preload=async()=>true,label='z3'}={}){
 if(typeof solve!=='function')throw TypeError('usePlacementSolver needs solve(model)');
 injected=Object.assign(solve,{supported:()=>true,preload});provider=undefined;state='not-loaded';failed=null;lastLoad={status:'injected',label};
}

/** The provider for compileRequest, or undefined when Z3 cannot run here. One instance per realm, created lazily. */
export function placementSearchProvider({supported=z3Supported}={}) {
 if(!injected&&!supported()){if(state==='not-loaded')state='unavailable';return undefined;}
 if(!provider){
  const inner=injected??z3Provider({base:Z3_BASE,onLoad:info=>{lastLoad=info;state=info.status==='loaded'?'ready':'unavailable';},onSolve:info=>{lastSolve=info;}});
  // Z3 optimises within half of the declared budget; when it cannot finish (timeout) it declines, and the library's internal search answers the same
  // model with its best result, so a hard soft-constraint optimisation never spends the whole budget for no answer (measured: a three-object group placement
  // timed out twice at 3 s in Chromium, the internal search answers it in well under a second).
  provider=Object.assign(model=>{begin('turn');counts.asked++;if(failed)return declineTo('solver-failed');const budget=Number(model?.budget)>0?Math.max(1,Math.ceil(model.budget/2)):model?.budget;
   // Wall limit of one solve: Z3's own timeout per optimisation (budget/2) for each alternative it is asked for, plus the unsat-core check, plus slack.
   const runs=(mode==='thinking'&&model?.depth==='alternatives'?Number(model.count)||1:1)+1,wallMs=Number(budget)>0?budget*runs+2000:null;
   let settle,timer=null;const declined=new Promise(r=>{settle=r;});pending.add(settle);
   counts.maxConcurrent=Math.max(counts.maxConcurrent,pending.size);
   // One solve at a time on the context; the wall limit starts when this solve starts on a loaded Z3.
   const solve=queue.then(()=>inner.preload()).then(async ready=>{if(failed)return null;if(!ready&&!injected)return null;
    if(wallMs)timer=setTimeout(()=>failPlacementSearch('solve-outlived-budget: no answer within '+wallMs+' ms'),wallMs);
    inFlight++;try{let answer=null;for(const step of forMode(model)){answer=await inner({...step,budget});if(answer?.status!=='unsatisfiable')break;}return answer;}finally{inFlight--;if(state!=='unavailable'&&injected)state='ready';}});
   queue=solve.then(()=>{},()=>{});
   return Promise.race([solve.then(answer=>answer?.status==='budget'?declineTo('z3-budget'):answer?(counts.z3++,answer):declineTo(failed?'solver-failed':'z3-declined'),
     error=>{lastSolve={status:'declined',reason:'error',error:String(error?.message??error)};return declineTo('z3-error');}),declined.then(()=>declineTo('solver-failed'))])
    .finally(()=>{clearTimeout(timer);pending.delete(settle);});},{supported:inner.supported,preload:()=>{begin('idle');return failed?Promise.resolve(false):inner.preload();}});
 }
 return provider;
}

/** How many placement solves are waiting for Z3 now (the host attributes an uncaught error meanwhile to the solver). */
export const placementSearchPending=()=>pending.size;

/** The host reports that Z3 failed (a crashed pthread, a solve without answer): pending solves decline at once, later ones too. */
export function failPlacementSearch(reason){
 if(!failed){failed={reason:String(reason).slice(0,300),at:Date.now()};state='unavailable';}
 for(const settle of [...pending])settle(null);pending.clear();
 return z3Status();
}

/**
 * Start loading Z3 in the background (once per realm; later calls only report). Never on a page that is not
 * cross-origin isolated. Answers the status at once; the load goes on asynchronously and is shared by a turn.
 */
export function warmPlacementSearch({supported=z3Supported,by='idle'}={}) {
 if(state==='not-loaded'){const p=placementSearchProvider({supported});if(p){begin(by);p.preload();}}
 return z3Status();
}

/**
 * The solver status for traces and the Worlds map: state not-loaded | warming | ready | unavailable, the load
 * time (ms from the start of the load to a ready context), what started it (idle warm-up or a turn), and the
 * last problem's outcome ({ status, ms } or status=declined with its reason).
 */
export function z3Status() {
 return {solver:'z3',version:z3Version,state,supported:z3Supported(),isolated:isolated(),base:Z3_BASE,
  loadMs:lastLoad?.ms??null,warmedBy,elapsedMs:state==='warming'&&warmStarted?Date.now()-warmStarted:null,
  error:failed?.reason??lastLoad?.error??null,failed,load:lastLoad,lastSolve,mode,counts:{...counts,reasons:{...counts.reasons}}};
}

/** Resolves with z3Status() once the solver's load (started by warmPlacementSearch) has finished, loaded or not; at once where Z3 cannot run. */
export async function placementSearchReady({supported=z3Supported}={}) {
 const p=placementSearchProvider({supported});
 if(p){begin('startup');try{await p.preload();}catch{/* z3Status() says why */}}
 return z3Status();
}

/** Compatibility name of z3Status(). */
export const placementSearchStatus=z3Status;
