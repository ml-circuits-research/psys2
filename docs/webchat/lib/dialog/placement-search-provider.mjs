// The std.problem provider for placement: Z3 in the browser when the page can run it, else none (the
// library's internal search). The library's browser provider fetches nothing until the first placement
// problem; it then loads Z3 once from the library's site (versioned, immutable URLs kept by the HTTP cache)
// and keeps the context for the session. Never loaded at start-up.
//
// Z3's WebAssembly build needs SharedArrayBuffer, i.e. a cross-origin isolated page (docs/webchat/sw.js adds
// COOP/COEP when ISOLATE is on). Elsewhere, and in Node, no provider is returned and compileRequest stays
// synchronous with the internal search, exactly as before. If Z3 fails to load, the provider declines and the
// internal search answers; the result's provider attribute says which one solved it.
import {z3Provider,z3Supported,z3Version} from '../vendor/sopworld/smt-z3.mjs?v=1b8b1c1205';

export const Z3_BASE=`https://ml-circuits-research.github.io/soplang-words-lib/vendor/z3-solver-${z3Version}/`;
let provider,lastLoad=null;

/** The provider for compileRequest, or undefined when Z3 cannot run here. One instance per realm, created lazily. */
export function placementSearchProvider({supported=z3Supported}={}) {
 if(!supported())return undefined;
 provider??=z3Provider({base:Z3_BASE,onLoad:info=>{lastLoad=info;}});
 return provider;
}

/** What happened to the Z3 load (null before the first placement problem), for traces and inspection. */
export const placementSearchStatus=()=>({supported:z3Supported(),base:Z3_BASE,load:lastLoad});
