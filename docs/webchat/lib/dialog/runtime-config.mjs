/**
 * One runtime configuration for every host (spec 03 section 7.14): the webchat and the evaluators build the dispatcher, the validation
 * policy and the normalizer wiring from the same settings object, so their defaults cannot drift apart. Browser-safe: no `node:*` imports.
 * Model loading stays host-specific (onnxruntime-web in the browser, onnxruntime-node in node); the host passes `load` and `normalizer`.
 *
 *   const enc = createRuntime({ engine, settings, load, normalizer, waitForModel });   // encoder strategy, attached and registered
 *   const session = engine.createSession(sessionOptions(settings));
 */
import { createDispatcherFormalizer } from './encoder-dispatch.mjs?v=3772e22b10';
import { createNxStrategy, DEFAULT_NX_STRATEGY, normalizeNxStrategy } from '../formalizer/nx.mjs?v=c2e3668426';

import { RUNTIME_DEFAULTS } from './runtime-defaults.mjs?v=3a55de5f9e';
export { RUNTIME_DEFAULTS };

/**
 * `routing` (spec 20) is an optional setting outside the shared defaults until the reviewer decides: 'dispatcher' (A) | 'symbolic' (B: meta.worlds,
 * the encoder's world head unread) | 'symbolic+encoder' (C: meta.worlds with the encoder as one prior; the default, also when missing). `sessionOptions` and `createRuntime` read it from the settings object.
 */

/** The named evaluation modes and the settings each one means. `encoder` is the shipped default (2026-11-14: rules read, the encoder segments and hints in the background, no normalizer); `encoder+n1` adds the optional normalizer. */
export const MODES = Object.freeze({
  rules: { ...RUNTIME_DEFAULTS, formalizer: 'rules', normalizer: false },
  encoder: { ...RUNTIME_DEFAULTS, formalizer: 'encoder', normalizer: false },
  'encoder+n1': { ...RUNTIME_DEFAULTS, normalizer: true },
  'encoder+fast': { ...RUNTIME_DEFAULTS, normalizer: false, fastPath: true },
  'encoder+n1+fast': { ...RUNTIME_DEFAULTS, normalizer: true, fastPath: true },
});
export const DEFAULT_MODE = 'encoder';

/** Settings of a mode (a fresh copy). */
export function settingsForMode(mode = DEFAULT_MODE) {
  if (!MODES[mode]) throw new Error(`unknown mode "${mode}" (expected ${Object.keys(MODES).join(' | ')})`);
  return { ...MODES[mode] };
}

/** The runtime part of a settings object (UI-only keys dropped, missing keys defaulted). */
export function runtimeSettings(settings = {}) {
  return Object.fromEntries(Object.keys(RUNTIME_DEFAULTS).map((k) => [k, settings[k] ?? RUNTIME_DEFAULTS[k]]));
}

/** The dispatcher validation policy of a settings object (read on every call, so a live settings object takes effect at once). */
export function policyFromSettings(settings) {
  return {
    acceptRefused: settings.encoderAcceptRefused !== false,
    trySpell: settings.spellcheck !== false,
    acceptPartial: settings.partialUnderstanding !== false,
    tryNormalizer: settings.normalizer !== false,
    trySimplified: settings.editHead === true,
  };
}

/** Options of `engine.createSession` for a settings object. */
export function sessionOptions(settings, extra = {}) {
  return { ...(settings.routing ? { routing: settings.routing } : {}), formalizer: settings.formalizer, nx: normalizeNxStrategy(settings.nxStrategy), spell: settings.spellcheck !== false, partial: settings.partialUnderstanding !== false, bestEffort: settings.bestEffort !== false, suspect: settings.suspectWords !== false, ...(settings.reader && settings.reader !== 'off' ? { reader: settings.reader } : {}), ...(settings.fastPath === true ? { fastPath: true } : {}), ...extra };
}

/**
 * The encoder strategy for `engine`, wired from `settings` (pass the live object) and registered as `engine.formalizers.encoder`.
 * `load` loads the dispatcher parts (host specific), `normalizer` is the host's normalizer provider or null.
 */
export function createRuntime({ engine, settings, load, normalizer = null, waitForModel = true, isPaused = null, ...rest }) {
  const enc = createDispatcherFormalizer({ load, getPolicy: () => policyFromSettings(settings), getRouting: () => settings.routing, normalizer, waitForModel, ...rest });
  enc.attach(engine);
  engine.formalizers.encoder = enc;
  // The NX strategy (ADR-009) shares the dispatcher's passes; it exists once the model is loaded and carries the heads. `isPaused` (the host's ORT
  // client: models paused after repeated worker restarts) switches it off, the rules answer.
  let nx = null;
  const real = () => {
    if (nx) return nx;
    const p = enc.nxParts;
    if (!p) return null;
    nx = createNxStrategy({ runtime: p.runtime, meta: p.meta, available: () => enc.ready() });
    nx.attach(engine);
    return nx;
  };
  const gone = () => { try { return !!isPaused?.(); } catch { return false; } };
  engine.formalizers.nx = {
    id: 'nx',
    get stats() { return real()?.stats ?? {}; },
    available: () => !gone() && !!real()?.available(),
    untrainedReads: (t, o) => real()?.untrainedReads(t, o) ?? false,
    formalize: (t, o) => real().formalize(t, o),
    refine: (r, o) => real().refine(r, o),
  };
  return enc;
}
