/**
 * One runtime configuration for every host (spec 03 section 7.14): the webchat and the evaluators build the dispatcher, the validation
 * policy and the normalizer wiring from the same settings object, so their defaults cannot drift apart. Browser-safe: no `node:*` imports.
 * Model loading stays host-specific (onnxruntime-web in the browser, onnxruntime-node in node); the host passes `load` and `normalizer`.
 *
 *   const enc = createRuntime({ engine, settings, load, normalizer, waitForModel });   // encoder strategy, attached and registered
 *   const session = engine.createSession(sessionOptions(settings));
 */
import { createDispatcherFormalizer } from './encoder-dispatch.mjs?v=ee0129c696';
import { createNxStrategy, DEFAULT_NX_STRATEGY, normalizeNxStrategy } from '../formalizer/nx.mjs?v=e1e88d78a9';

/** The shipped defaults of everything that changes what the pipeline answers (the webchat adds UI-only keys on top). */
export const RUNTIME_DEFAULTS = Object.freeze({
  formalizer: 'encoder',          // the DistilBERT dispatcher validated by the rules; rules answer while it loads or when it cannot load
  encoderAcceptRefused: true,     // accept parses the interpreter refuses by state (for example "move the piece" with no game on)
  partialUnderstanding: true,     // execute what was understood and say what was ignored (7.10)
  normalizer: true,               // seq2seq phrasing normalizer, a fallback only (7.12, 7.13)
  spellcheck: true,               // spell correction against the worlds' vocabulary (7.9)
  bestEffort: true,               // after everything else failed, execute the most sensible reading of loose words and say what was understood (7.15)
  editHead: false,                // the S1 edit head's simplified text as a candidate reading: OFF in the shipped pipeline (review decision e: 3 recovered against 7 misled); the code stays behind this flag
  nxStrategy: DEFAULT_NX_STRATEGY, // who reads first, ADR-009: 'hybrid' (the rules path as shipped, the model reads what it left unparsed, gated) | 'neural' (model first) | 'rules'; used with the encoder formalizer
  fastPath: false,                // encoder only: skip the model when the rules read the whole message and the interpreter accepts it (PERF; the webchat turns it on)
});

/** The named evaluation modes and the settings each one means. `encoder+n1` is the shipped default. */
export const MODES = Object.freeze({
  rules: { ...RUNTIME_DEFAULTS, formalizer: 'rules', normalizer: false },
  encoder: { ...RUNTIME_DEFAULTS, formalizer: 'encoder', normalizer: false },
  'encoder+n1': { ...RUNTIME_DEFAULTS },
  'encoder+fast': { ...RUNTIME_DEFAULTS, normalizer: false, fastPath: true },
  'encoder+n1+fast': { ...RUNTIME_DEFAULTS, fastPath: true },
});
export const DEFAULT_MODE = 'encoder+n1';

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
  return { formalizer: settings.formalizer, nx: normalizeNxStrategy(settings.nxStrategy), spell: settings.spellcheck !== false, partial: settings.partialUnderstanding !== false, bestEffort: settings.bestEffort !== false, ...(settings.fastPath === true ? { fastPath: true } : {}), ...extra };
}

/**
 * The encoder strategy for `engine`, wired from `settings` (pass the live object) and registered as `engine.formalizers.encoder`.
 * `load` loads the dispatcher parts (host specific), `normalizer` is the host's normalizer provider or null.
 */
export function createRuntime({ engine, settings, load, normalizer = null, waitForModel = true, isPaused = null, ...rest }) {
  const enc = createDispatcherFormalizer({ load, getPolicy: () => policyFromSettings(settings), normalizer, waitForModel, ...rest });
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
