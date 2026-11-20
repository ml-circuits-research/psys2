// Browser provider for std.problem: Z3 compiled to WebAssembly, the same contract as node/smt-z3.mjs, loaded
// only when a problem first needs it. The library core does not depend on it: this module and the Z3 files are
// separate assets published next to the bundle (docs/smt-z3.mjs, docs/vendor/z3-solver-<version>/).
//
//   import { z3Provider } from './smt-z3.mjs?v=c3f6f6acff';           // next to sopworld.mjs; fetches nothing yet
//   const provider = z3Provider();
//   const result = await world.compileRequest(problemSop, { provider });   // the first call loads Z3
//
// Z3's WebAssembly build runs its solver in pthreads, so it needs SharedArrayBuffer, which browsers give only
// to cross-origin isolated pages (COOP same-origin with COEP require-corp or credentialless). `z3Supported()`
// says whether this page can run it. Where it cannot, or the files cannot be loaded, the provider declines
// (answers null) and solveProblem answers with its internal search, which reports provider=internal.
//
// The files live in a directory named by the Z3 version, so they never change under one URL and the browser
// cache keeps them. The 39 MB WebAssembly file is stored gzipped (about 9 MB) and inflated with the
// browser's DecompressionStream. One load serves every provider made from the same base.

import { solveWithZ3 } from './z3-translate.mjs?v=5ed3a31d76';

export const z3Version = '5.4.1';
export const z3Base = new URL(`vendor/z3-solver-${z3Version}/`, import.meta.url).href;

/** Whether this page can run Z3: WebAssembly threads need SharedArrayBuffer, given to isolated pages only. */
export function z3Supported() {
  return typeof WebAssembly === 'object' && typeof SharedArrayBuffer === 'function' && typeof DecompressionStream === 'function'
    && typeof Worker === 'function' && globalThis.crossOriginIsolated !== false;
}

const loads = new Map();

/**
 * Load Z3 from `base` once (later calls share the promise) and answer its API (`Context`, `em`, ...). It
 * rejects when the page is not isolated or a file cannot be fetched; a failed load may be retried.
 */
export function loadZ3({ base = z3Base, fetch: get = globalThis.fetch } = {}) {
  base = new URL(base, z3Base).href;
  if (!loads.has(base)) {
    const load = (async () => {
      if (!z3Supported()) throw Error('z3-unsupported: SharedArrayBuffer is not available (the page is not cross-origin isolated)');
      const file = async (name) => { const r = await get(base + name); if (!r.ok) throw Error(`z3-fetch: ${name} ${r.status}`); return r; };
      const [script, wasmBinary, api] = await Promise.all([
        file('z3-built.js').then((r) => r.text()),
        file('z3-built.wasm.gz').then((r) => r.arrayBuffer()).then(inflate),
        import(base + 'z3-api.mjs').then((m) => m.default ?? m),
      ]);
      // Emscripten's loader is a classic script; run it as a function so it works in pages and module
      // workers alike. Its pthread workers run the same text from a blob: URL, because a worker script must
      // be same-origin and the files may come from another origin (the library's site).
      const initZ3 = new Function(script + '\nreturn initZ3;')();
      globalThis.initZ3 = initZ3;
      const threadScript = URL.createObjectURL(new Blob([script], { type: 'text/javascript' }));
      return api.init({ wasmBinary, mainScriptUrlOrBlob: threadScript, locateFile: (name) => base + name });
    })();
    loads.set(base, load);
    load.catch(() => loads.delete(base));
  }
  return loads.get(base);
}

// gzip bytes are inflated here; a server that already removed the encoding hands over the raw module.
async function inflate(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return buffer;
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

/**
 * A std.problem provider backed by Z3, for `solveProblem` and `compileRequest(..., { provider })`. Nothing is
 * fetched until the first problem; the context is then kept for every later one. When Z3 cannot run here the
 * provider answers null, so the internal search answers instead (its result says provider=internal); pass
 * `strict: true` to get the load error instead. `onLoad(info)` is told how the load went, once.
 */
export function z3Provider({ base = z3Base, strict = false, onLoad } = {}) {
  let context;
  const ready = () => {
    if (!context) {
      const started = Date.now();
      context = loadZ3({ base }).then((z3) => new z3.Context('sopworld'));
      context.then(() => onLoad?.({ status: 'loaded', ms: Date.now() - started, base }),
        (error) => { context = undefined; onLoad?.({ status: 'failed', ms: Date.now() - started, base, error: String(error?.message ?? error) }); });
    }
    return context;
  };
  const provider = async (model) => {
    let z;
    try { z = await ready(); } catch (error) { if (strict) throw error; return null; }
    return solveWithZ3(z, model);
  };
  provider.supported = z3Supported;
  /** Start loading now (for example when the user opens a view that will place things); resolves to true when Z3 is ready. */
  provider.preload = () => ready().then(() => true, (error) => { if (strict) throw error; return false; });
  return provider;
}
