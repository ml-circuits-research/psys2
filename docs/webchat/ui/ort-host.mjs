// The one ORT client of the page (HANG2): a dedicated worker (ui/ort-worker.mjs) shared by the dispatcher and the normalizer, with per-call
// deadlines, cancellation and restart (lib/formalizer/ort-client.mjs). Replaces onnxruntime-web's `proxy = true`.
let client = null;
// a worker has no import map: it resolves versioned URLs itself (`globalThis.__psys2Url`, ui/engine-worker.mjs); the page's import map versions the plain ones
const urlOf = (rel, base) => (globalThis.__psys2Url ? globalThis.__psys2Url(rel) : new URL(rel, base).href);
export async function getOrtClient(base) {
  if (client) return client;
  const { createOrtClient, measureDeviceSpeed } = await import(urlOf('lib/formalizer/ort-client.mjs', base));
  const { LIMITS } = await import(urlOf('lib/dialog/time-limits.mjs', base));
  const wv = globalThis.__psys2Mod?.['ui/ort-worker.mjs'];   // build-hash version (scripts/build-webchat.mjs): a stale cached worker is never paired with a newer client
  const url = new URL('ui/ort-worker.mjs', base).href + (wv ? `?v=${wv}` : '');
  const debug = (() => { try { return globalThis.localStorage?.getItem('psys2.ortlog') === '1' || globalThis.__psys2OrtLog === true; } catch { return false; } })();
  // FREEZE 5: a quick calibration at load scales every model deadline by the measured device speed (a slow or throttled device is not a hung worker);
  // after 2 worker restarts in 5 minutes the models pause and the rules answer (Settings > Models shows why and offers "Resume models").
  let speed = 1;
  try { speed = measureDeviceSpeed(); } catch { /* keep 1 */ }
  client = createOrtClient({
    speed,
    onPause: (p) => { try { globalThis.dispatchEvent?.(new CustomEvent('psys2-ort-paused', { detail: p })); } catch { /* no events */ } },
    graceMs: () => LIMITS.graceMs,
    spawn: globalThis.__psys2OrtSpawn ?? (() => new Worker(url, { type: 'module' })),   // inside the engine worker the page owns the ORT workers (COMPUTE-BUDGET): __psys2OrtSpawn asks it for one over a MessagePort
    log: (...a) => { if (debug) console.debug('ORTLOG', ...a); if (a[0] === 'restart') console.warn('ORT worker restarted:', a[1]); },
  });
  client.limits = LIMITS;   // live time limits (Settings › Developer); hosts read them per call
  globalThis.__psys2Ort = client;   // diagnostics: stats, restarts
  return client;
}
