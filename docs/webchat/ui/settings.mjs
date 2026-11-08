// Webchat settings (spec 06 "Webchat settings"): defaults, the version bump and the one-time migration. Pure, no DOM, so node:test can import it.

/** Bumped whenever a default changes in a way saved settings must follow once. */
export const SETTINGS_VERSION = 2;
export const SETTINGS_KEY = 'psys2.webchat.settings';

export const DEFAULT_SETTINGS = {
  settingsVersion: SETTINGS_VERSION,
  language: 'en',
  formalizer: 'encoder',          // the DistilBERT dispatcher validated by the rules; rules answer while it loads or when it cannot load
  encoderAcceptRefused: true,
  partialUnderstanding: true,     // execute what was understood and say what was ignored (spec 03 section 7.10)
  normalizer: true,               // seq2seq phrasing normalizer, a fallback only: original and spell-corrected readings always win (spec 03 section 7.12)
  spellcheck: true,               // spell correction against the worlds' vocabulary (spec 03 section 7.9)
  translation: 'auto', speechLang: 'follow', voice: '', rate: 1, handsFree: false, speaker: false, showTrace: false, logPhrases: true,
};

/**
 * Bring saved settings up to date.
 *   v1 (no `settingsVersion`): the default formalizer was 'rules'. A saved 'rules' is migrated to 'encoder' once, because it was the
 *   default and not necessarily a choice; every later explicit choice is saved with the current version and respected.
 * Returns { settings, migrated }.
 */
export function migrateSettings(saved) {
  const s = { ...DEFAULT_SETTINGS, ...(saved && typeof saved === 'object' ? saved : {}) };
  const from = Number(saved?.settingsVersion) || 1;
  let migrated = false;
  if (from < 2) {
    if (saved && s.formalizer === 'rules') s.formalizer = 'encoder';
    migrated = true;
  }
  s.settingsVersion = SETTINGS_VERSION;
  if (s.formalizer !== 'rules' && s.formalizer !== 'encoder') s.formalizer = DEFAULT_SETTINGS.formalizer;
  return { settings: s, migrated };
}

/** Read the saved settings (migrated); `storage` is localStorage or a stand-in. A migration is written back at once. */
export function loadSettings(persist, storage = globalThis.localStorage) {
  if (!persist) return { ...DEFAULT_SETTINGS };
  let saved = null;
  try { saved = JSON.parse(storage.getItem(SETTINGS_KEY) ?? 'null'); } catch { saved = null; }
  const { settings, migrated } = migrateSettings(saved);
  if (migrated && saved) { try { storage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage unavailable */ } }
  return settings;
}
