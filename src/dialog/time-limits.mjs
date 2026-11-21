/**
 * The time limits of a turn, in one place (spec 06 "Turn lifecycle", "Model calls are bounded"). Browser-safe, no `node:*` imports.
 * `LIMITS` is the live object every consumer reads at call time, so changing a value in Settings takes effect on the next call.
 */
export const TIME_LIMIT_SPECS = Object.freeze({
  watchdogMs:   { def: 60000, min: 2000, max: 300000, label: 'Turn limit', note: 'automatic limit from Enter to the answer; it cancels the turn only (the Stop button does the same at any time)' },
  startMs:      { def: 60000, min: 10000, max: 300000, label: 'Engine start limit', note: 'how long a (re)started engine worker may take to become ready; the turn clock starts when it is ready' },
  areaMs:       { def: 30000, min: 2000, max: 300000, label: 'Editor preparation limit', note: 'how long one editor area may take to prepare at start; past it start-up completes without that editor, which is marked unavailable and keeps preparing (and is retried) in the background' },
  dispatcherMs: { def: 2500, min: 500, max: 30000, label: 'Dispatcher call deadline', note: 'one model call of the dispatcher' },
  normalizerMs: { def: 3000, min: 500, max: 30000, label: 'Normalizer call deadline', note: 'one model call of the phrasing normalizer' },
  runawayMs:    { def: 0, min: 0, max: 600000, label: 'Engine runaway limit', note: '0 (default): a stopped turn is never ended by restarting the engine worker; otherwise how long it may keep computing before the worker (and the reader loaded in it) is restarted' },
  graceMs:      { def: 1500, min: 100, max: 10000, label: 'Worker cancel grace', note: 'how long a cancelled model call may keep running before its worker is restarted' },
  effectMs:     { def: 3000, min: 500, max: 30000, label: 'Host effect cap', note: 'one host effect (tab animation, engine move, music start); the tabs are veiled meanwhile' },
  speakBaseMs:  { def: 6000, min: 1000, max: 60000, label: 'Speech veil base', note: 'how long a spoken answer veils the tabs at least (plus a little per character)' },
  speakMaxMs:   { def: 60000, min: 5000, max: 300000, label: 'Speech veil cap', note: 'a spoken answer never veils the tabs longer than this (the speech itself goes on)' },
});
export const TIME_LIMIT_DEFAULTS = Object.freeze(Object.fromEntries(Object.entries(TIME_LIMIT_SPECS).map(([k, s]) => [k, s.def])));

/** A value clamped to the key's range; anything that is not a finite number gives the default. */
export function clampLimit(key, v) {
  const s = TIME_LIMIT_SPECS[key];
  const n = Number(v);
  return Number.isFinite(n) && v !== null && v !== '' ? Math.min(s.max, Math.max(s.min, Math.round(n))) : s.def;
}

/** The live limits (mutated in place by `applyTimeLimits`). */
export const LIMITS = { ...TIME_LIMIT_DEFAULTS };

/** Set the live limits from a settings object (`settings.timeLimits`, partial or missing allowed); returns LIMITS. */
export function applyTimeLimits(settings = {}) {
  const t = settings?.timeLimits ?? {};
  for (const k of Object.keys(TIME_LIMIT_SPECS)) LIMITS[k] = clampLimit(k, t[k]);
  return LIMITS;
}
