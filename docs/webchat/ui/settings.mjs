// Webchat settings (spec 06 "Webchat settings"): defaults, the version bump and the one-time migration. Pure, no DOM, so node:test can import it.

import { RUNTIME_DEFAULTS } from '../lib/dialog/runtime-config.mjs';
import { normalizeNxStrategy } from '../lib/formalizer/nx.mjs';
import { TIME_LIMIT_DEFAULTS } from '../lib/dialog/time-limits.mjs';
import { normalize as normalizeLanguage, browserLanguage, EN_VARIANTS } from './language.mjs';

/** Bumped whenever a default changes in a way saved settings must follow once. */
export const SETTINGS_VERSION = 4;
export const SETTINGS_KEY = 'psys2.webchat.settings';

export const DEFAULT_SETTINGS = {
  settingsVersion: SETTINGS_VERSION,
  language: 'en',
  ...RUNTIME_DEFAULTS,            // formalizer, encoderAcceptRefused, partialUnderstanding, normalizer, spellcheck: one definition shared with the evaluators (src/dialog/runtime-config.mjs)
  timeLimits: { ...TIME_LIMIT_DEFAULTS },   // ms; clamped on use (src/dialog/time-limits.mjs)
  reasoner: 'matrix',             // Settings › Developer › Reasoner (spec 15): 'matrix' (default; the worlds that ship a matrix answer through the sopworld library) | 'ops' (the fallback); read when the engine starts
  worldAware: 'veto',             // Settings › Developer › World-aware reading (spec 16): 'veto' (default, user decision 2026-11-12) | 'choose' | 'observe' | 'off'
  fastPath: true,                 // webchat: the rules answer at once when they read the whole message (PERF); the model is for the rest
  translation: 'auto', languageDetection: 'auto', englishVariant: 'en-US', voice: '', rate: 1, handsFree: false, keepListening: true, wakeWord: false, speaker: false, showTrace: false, showPerf: false, devMode: false, logPhrases: true, exportButtons: false,
};

/**
 * Bring saved settings up to date.
 *   v1 (no `settingsVersion`): the default formalizer was 'rules'. A saved 'rules' is migrated to 'encoder' once, because it was the
 *   default and not necessarily a choice; every later explicit choice is saved with the current version and respected.
 *   v3 (LANG-FIXED): the language is always 'en' or 'ro': a saved 'auto' (or anything else) becomes the browser language (`ro*` -> ro, otherwise en) and is saved.
 *   v4 (matrix is the default, user decision 2026-11-11): the reasoner was saved as 'ops' by the old default and a saved value cannot tell a choice from that default, so every saved 'ops' becomes 'matrix' once; a later explicit 'ops' is saved with v4 and respected.
 *   The Voice setting `speechLang` is gone: speech follows the selected language; only an English regional variant (en-US / en-GB) is kept, from a saved 'en-GB'.
 * Returns { settings, migrated }.
 */
export function migrateSettings(saved, navLang = globalThis.navigator?.language) {
  const s = { ...DEFAULT_SETTINGS, ...(saved && typeof saved === 'object' ? saved : {}) };
  const from = Number(saved?.settingsVersion) || 1;
  let migrated = false;
  if (from < 2) {
    if (saved && s.formalizer === 'rules') s.formalizer = 'encoder';
    migrated = true;
  }
  s.settingsVersion = SETTINGS_VERSION;
  if (from < 3) migrated = true;
  s.language = normalizeLanguage(s.language, browserLanguage(navLang));
  if (saved?.speechLang === 'en-GB' && !saved.englishVariant) s.englishVariant = 'en-GB';
  if (!EN_VARIANTS.includes(s.englishVariant)) s.englishVariant = 'en-US';
  if ('speechLang' in s) { delete s.speechLang; migrated = true; }
  s.handsFree = false;   // FREEZE: the listening state is never persisted; every page load starts with the microphone off (an older saved `true` no longer starts it)
  if (s.formalizer !== 'rules' && s.formalizer !== 'encoder') s.formalizer = DEFAULT_SETTINGS.formalizer;
  if (from < 4) { if (s.reasoner === 'ops') s.reasoner = 'matrix'; migrated = true; }
  if (s.reasoner !== 'ops') s.reasoner = 'matrix';   // an unknown saved value is the default
  s.nxStrategy = normalizeNxStrategy(s.nxStrategy);   // ADR-009: an unknown saved value falls back to the default
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
