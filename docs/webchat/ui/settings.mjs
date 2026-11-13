// Webchat settings (spec 06 "Webchat settings"): defaults, the version bump and the one-time migration. Pure, no DOM, so node:test can import it.

import { RUNTIME_DEFAULTS } from '../lib/dialog/runtime-config.mjs';
import { normalizeNxStrategy } from '../lib/formalizer/nx.mjs';
import { TIME_LIMIT_DEFAULTS } from '../lib/dialog/time-limits.mjs';
import { normalize as normalizeLanguage, browserLanguage, EN_VARIANTS } from './language.mjs';

/** Bumped whenever a default changes in a way saved settings must follow once. */
export const SETTINGS_VERSION = 5;
export const SETTINGS_KEY = 'psys2.webchat.settings';

/** SETTINGS-COHERENT 2: the one "How I read your messages" choice. The engine still reads `formalizer` and `nxStrategy`; they are derived from `reading`. */
export const READING_VALUES = Object.freeze(['hybrid', 'model', 'rules']);
export const DEFAULT_READING = 'hybrid';
/** The `reading` value an older pair of settings meant (formalizer 'rules' or strategy 'rules' = rules only; strategy 'neural' = model first; anything else hybrid). */
export function readingFrom(s) {
  if (s?.formalizer === 'rules' || s?.nxStrategy === 'rules') return 'rules';
  if (s?.nxStrategy === 'neural') return 'model';
  return 'hybrid';
}
/** Sets `formalizer` and `nxStrategy` from `reading` (in place; returns the object). */
export function applyReading(s) {
  if (!READING_VALUES.includes(s.reading)) s.reading = DEFAULT_READING;
  s.formalizer = s.reading === 'rules' ? 'rules' : 'encoder';
  s.nxStrategy = s.reading === 'model' ? 'neural' : s.reading === 'rules' ? 'rules' : 'hybrid';
  return s;
}

export const DEFAULT_SETTINGS = {
  settingsVersion: SETTINGS_VERSION,
  language: 'en',
  reading: DEFAULT_READING,       // Settings › Reading › How I read your messages: 'hybrid' (default on every device) | 'model' | 'rules'; formalizer and nxStrategy below follow it
  ...RUNTIME_DEFAULTS,            // formalizer, encoderAcceptRefused, partialUnderstanding, normalizer, spellcheck: one definition shared with the evaluators (src/dialog/runtime-config.mjs)
  timeLimits: { ...TIME_LIMIT_DEFAULTS },   // ms; clamped on use (src/dialog/time-limits.mjs)
  reasoner: 'matrix',             // Settings › Developer › Reasoner (spec 15): 'matrix' (default; the worlds that ship a matrix answer through the sopworld library) | 'ops' (the fallback); read when the engine starts
  worldAware: 'veto',             // Settings › Developer › World-aware reading (spec 16): 'veto' (default, user decision 2026-11-12) | 'choose' | 'observe' | 'off'
  fastPath: true,                 // webchat: the rules answer at once when they read the whole message (PERF); the model is for the rest
  translation: 'auto', languageDetection: 'auto', showAllLanguages: false, englishVariant: 'en-US', voice: '', rate: 1, handsFree: false, keepListening: true, wakeWord: false, speaker: false, showTrace: false, showPerf: false, devMode: false, logPhrases: true, exportButtons: false,
};

/**
 * Bring saved settings up to date.
 *   v1 (no `settingsVersion`): the default formalizer was 'rules'. A saved 'rules' is migrated to 'encoder' once, because it was the
 *   default and not necessarily a choice; every later explicit choice is saved with the current version and respected.
 *   v3 (LANG-FIXED): the language is always 'en' or 'ro': a saved 'auto' (or anything else) becomes the browser language (`ro*` -> ro, otherwise en) and is saved.
 *   v4 (matrix is the default, user decision 2026-11-11): the reasoner was saved as 'ops' by the old default and a saved value cannot tell a choice from that default, so every saved 'ops' becomes 'matrix' once; a later explicit 'ops' is saved with v4 and respected.
 *   v5 (SETTINGS-COHERENT): "Formalizer" and "Reading strategy" became one `reading` choice. Two overlapping selects could not be told apart, so a value saved by either cannot be told from a
 *   confused choice: every saved profile is reset to hybrid once; a later explicit choice is saved with v5 and respected (a v5 profile without `reading` takes it from formalizer / nxStrategy).
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
  if (from < 5) { s.reading = READING_VALUES.includes(saved?.reading) ? saved.reading : DEFAULT_READING; migrated = true; }   // `reading` never existed before v5: only a test harness or a hand-edited profile has it
  else if (!READING_VALUES.includes(saved?.reading)) s.reading = readingFrom(s);
  applyReading(s);
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
