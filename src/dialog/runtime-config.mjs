/**
 * One runtime configuration for every host (spec 03 section 7.14): the webchat and the evaluators build the dispatcher, the validation
 * policy and the normalizer wiring from the same settings object, so their defaults cannot drift apart. Browser-safe: no `node:*` imports.
 * Model loading stays host-specific (onnxruntime-web in the browser, onnxruntime-node in node); the host passes `load` and `normalizer`.
 *
 *   const enc = createRuntime({ engine, settings, load, normalizer, waitForModel });   // encoder strategy, attached and registered
 *   const session = engine.createSession(sessionOptions(settings));
 */
import { createDispatcherFormalizer } from './encoder-dispatch.mjs';

/** The shipped defaults of everything that changes what the pipeline answers (the webchat adds UI-only keys on top). */
export const RUNTIME_DEFAULTS = Object.freeze({
  formalizer: 'encoder',          // the DistilBERT dispatcher validated by the rules; rules answer while it loads or when it cannot load
  encoderAcceptRefused: true,     // accept parses the interpreter refuses by state (for example "move the piece" with no game on)
  partialUnderstanding: true,     // execute what was understood and say what was ignored (7.10)
  normalizer: true,               // seq2seq phrasing normalizer, a fallback only (7.12, 7.13)
  spellcheck: true,               // spell correction against the worlds' vocabulary (7.9)
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
  };
}

/** Options of `engine.createSession` for a settings object. */
export function sessionOptions(settings, extra = {}) {
  return { formalizer: settings.formalizer, spell: settings.spellcheck !== false, partial: settings.partialUnderstanding !== false, ...(settings.fastPath === true ? { fastPath: true } : {}), ...extra };
}

/**
 * The encoder strategy for `engine`, wired from `settings` (pass the live object) and registered as `engine.formalizers.encoder`.
 * `load` loads the dispatcher parts (host specific), `normalizer` is the host's normalizer provider or null.
 */
export function createRuntime({ engine, settings, load, normalizer = null, waitForModel = true, ...rest }) {
  const enc = createDispatcherFormalizer({ load, getPolicy: () => policyFromSettings(settings), normalizer, waitForModel, ...rest });
  enc.attach(engine);
  engine.formalizers.encoder = enc;
  return enc;
}
