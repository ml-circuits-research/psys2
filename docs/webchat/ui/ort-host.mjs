// The one ORT client of the page (HANG2): a dedicated worker (ui/ort-worker.mjs) shared by the dispatcher and the normalizer, with per-call
// deadlines, cancellation and restart (lib/formalizer/ort-client.mjs). Replaces onnxruntime-web's `proxy = true`.
let client = null;
export async function getOrtClient(base) {
  if (client) return client;
  const { createOrtClient } = await import(new URL('lib/formalizer/ort-client.mjs', base).href);
  const { LIMITS } = await import(new URL('lib/dialog/time-limits.mjs', base).href);
  const url = new URL('ui/ort-worker.mjs', base).href;
  const debug = (() => { try { return globalThis.localStorage?.getItem('psys2.ortlog') === '1' || globalThis.__psys2OrtLog === true; } catch { return false; } })();
  client = createOrtClient({
    graceMs: () => LIMITS.graceMs,
    spawn: () => new Worker(url, { type: 'module' }),
    log: (...a) => { if (debug) console.debug('ORTLOG', ...a); if (a[0] === 'restart') console.warn('ORT worker restarted:', a[1]); },
  });
  client.limits = LIMITS;   // live time limits (Settings › Developer); hosts read them per call
  globalThis.__psys2Ort = client;   // diagnostics: stats, restarts
  return client;
}
