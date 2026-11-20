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
import {z3Provider,z3Supported,z3Version} from '../vendor/sopworld/smt-z3.mjs';

export const Z3_BASE=`https://ml-circuits-research.github.io/soplang-words-lib/vendor/z3-solver-${z3Version}/`;
let provider,state='not-loaded',lastLoad=null,lastSolve=null,warmedBy=null,warmStarted=null;

const isolated=()=>globalThis.crossOriginIsolated===true;
const begin=by=>{if(state==='not-loaded'){state='warming';warmedBy=by;warmStarted=Date.now();}};

/** The provider for compileRequest, or undefined when Z3 cannot run here. One instance per realm, created lazily. */
export function placementSearchProvider({supported=z3Supported}={}) {
 if(!supported()){if(state==='not-loaded')state='unavailable';return undefined;}
 if(!provider){
  const inner=z3Provider({base:Z3_BASE,onLoad:info=>{lastLoad=info;state=info.status==='loaded'?'ready':'unavailable';},onSolve:info=>{lastSolve=info;}});
  // Z3 optimises within half of the declared budget; when it cannot finish (timeout) it declines, and the library's internal search answers the same
  // model with its best result, so a hard soft-constraint optimisation never spends the whole budget for no answer (measured: a three-object group placement
  // timed out twice at 3 s in Chromium, the internal search answers it in well under a second).
  provider=Object.assign(model=>{begin('turn');const budget=Number(model?.budget)>0?Math.max(1,Math.ceil(model.budget/2)):model?.budget;
   return Promise.resolve(inner({...model,budget})).then(answer=>answer?.status==='budget'?null:answer);},{supported:inner.supported,preload:()=>{begin('idle');return inner.preload();}});
 }
 return provider;
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
  error:lastLoad?.error??null,load:lastLoad,lastSolve};
}

/** Resolves with z3Status() once the solver's load (started by warmPlacementSearch) has finished, loaded or not; at once where Z3 cannot run. */
export async function placementSearchReady({supported=z3Supported}={}) {
 const p=placementSearchProvider({supported});
 if(p){begin('startup');try{await p.preload();}catch{/* z3Status() says why */}}
 return z3Status();
}

/** Compatibility name of z3Status(). */
export const placementSearchStatus=z3Status;
