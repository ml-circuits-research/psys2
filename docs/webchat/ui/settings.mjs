// Webchat settings (spec 06 "Webchat settings"): defaults, the version bump and the one-time migration. Pure, no DOM, so node:test can import it.

import { RUNTIME_DEFAULTS } from '../lib/dialog/runtime-config.mjs';

/** Bumped whenever a default changes in a way saved settings must follow once. */
export const SETTINGS_VERSION = 2;
export const SETTINGS_KEY = 'psys2.webchat.settings';

export const DEFAULT_SETTINGS = {
  settingsVersion: SETTINGS_VERSION,
  language: 'en',
  ...RUNTIME_DEFAULTS,            // formalizer, encoderAcceptRefused, partialUnderstanding, normalizer, spellcheck: one definition shared with the evaluators (src/dialog/runtime-config.mjs)
  fastPath: true,                 // webchat: the rules answer at once when they read the whole message (PERF); the model is for the rest
  translation: 'auto', languageDetection: 'auto', speechLang: 'auto', voice: '', rate: 1, handsFree: false, speaker: false, showTrace: false, logPhrases: true, exportButtons: false,
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
