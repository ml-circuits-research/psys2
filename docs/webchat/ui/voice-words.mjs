// SPDX-License-Identifier: AGPL-3.0-only
// Voice words for every language (SETTINGS-COHERENT item 3). The voice layer (end-of-turn, stop-microphone, cancel, address words, the cheap noise check)
// works on a few short word lists (end-of-turn and microphone commands only; no list decides whether a message reaches the engine, ui/voice-noise.mjs). The lists exist in English only (SOURCE below, declared in worlds/app.project/voice-words.sop); for another selected language each entry is translated ONCE by the
// translation layer (browser Translator, else the on-device model) and cached in the browser, so no language, Romanian included, has a hand-written list.
// Pure: no DOM, no node:*; the translator and the storage are passed in.
import { VOICE_SOURCE } from '../lib/dialog/voice-word-lists.mjs';

/** Words that name the app itself. They are never translated. */
export const APP_NAMES = Object.freeze(['psys2', 'psys']);

/** The English source lists (worlds/app.project/voice-words.sop, read by lib/dialog/voice-word-lists.mjs): the English matchers and the text that is translated for another language. */
export const SOURCE = VOICE_SOURCE;
/** The lists whose translated entries are matched on a word stem (inflected languages), not only exactly. */
const STEMMED = new Set(['openVerbs']);
/** Lists of phrases: translated as a whole; every other list is single words. */
const PHRASES = new Set(['stopPhrases']);

export const fold = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s'-]+/gu, ' ').replace(/-+/g, ' ').replace(/\s+/g, ' ').trim();

// ---- the active language's extra words (module state: one selected language at a time) ----
let extra = {};
let extraLang = 'en';
const EMPTY = Object.freeze([]);
/** Extra (translated) entries of a list for the active language, folded; [] for English or before the translation finished. */
export const extraWords = (name) => extra[name] ?? EMPTY;
export const activeLanguage = () => extraLang;
/** Installs the lexicon of a language (an object name -> entries) or clears it (null). */
export function setLexicon(lang, lists) { extraLang = lang ?? 'en'; extra = lists && typeof lists === 'object' ? lists : {}; }

/** The words that address the assistant for the active language: the app name, the English words, the translated words. */
export const addressWords = () => [...new Set([...APP_NAMES, ...SOURCE.address, ...extraWords('address')])];
/** Same, for the Settings text: the words as they are shown (not folded). */
export function addressWordsText(lang = extraLang) {
  const shown = ['PSys2', ...SOURCE.address];
  if (lang && lang !== 'en') for (const w of extraWords('address')) if (!shown.some((x) => fold(x) === w)) shown.push(w);
  return shown;
}

const cleanTranslation = (name, src, out) => {
  const t = fold(out);
  if (!t || t === fold(src) && name !== 'address') return null;
  const words = t.split(' ');
  if (PHRASES.has(name)) return words.length <= 6 ? t : null;
  if (words.length > 2) return null;
  return name === 'openEndings' || name === 'determiners' ? words.at(-1) : words[0];
};

const KEY = (lang) => `psys2.voicewords.v1.${lang}`;
/**
 * Builds the lexicon of `lang` (not English): every SOURCE entry translated by `translate(text, from, to)`. A failed entry is skipped; the result is cached in `storage`
 * under a per-language key and read back on the next page load. Returns { lists, fromCache, translated, failed }. Never throws.
 */
export async function buildLexicon({ lang, translate, storage = null, signal = null, yieldFn = () => new Promise((r) => setTimeout(r, 0)) } = {}) {
  if (!lang || lang === 'en') return { lists: {}, fromCache: false, translated: 0, failed: 0 };
  try { const c = JSON.parse(storage?.getItem(KEY(lang)) ?? 'null'); if (c?.lists) return { lists: c.lists, fromCache: true, translated: 0, failed: 0 }; } catch { /* no cache */ }
  const lists = {};
  let translated = 0, failed = 0;
  for (const [name, entries] of Object.entries(SOURCE)) {
    const out = new Set(), seen = new Set();
    for (const src of entries) {
      if (signal?.aborted) return { lists, fromCache: false, translated, failed, aborted: true };
      let res = null;
      try { res = await translate(src, 'en', lang); } catch { res = null; }
      const one = cleanTranslation(name, src, typeof res === 'string' ? res : res?.text ?? res?.translation ?? '');
      if (one && !seen.has(one)) { seen.add(one); out.add(one); translated++; } else if (!one) failed++;
      await yieldFn();
    }
    lists[name] = [...out];
  }
  // a language the translator could not serve at all (nothing translated) is not cached: it is retried the next time
  if (translated >= 10) { try { storage?.setItem(KEY(lang), JSON.stringify({ at: Date.now(), lists })); } catch { /* storage full */ } }
  return { lists, fromCache: false, translated, failed };
}
/** Word-stem forms of a stemmed list for the cheap check: the word, and for words of 6+ letters the word without its last two letters. */
export const stemsOf = (name) => (STEMMED.has(name) ? extraWords(name).flatMap((w) => (w.length >= 6 ? [w, w.slice(0, -2)] : [w])) : extraWords(name));
