// SPDX-License-Identifier: AGPL-3.0-only
// LANG-FIXED: the interface language is the one selected by the person (header selector, Settings > Language, or an explicit "speak Romanian" command)
// and nothing else changes it: not a detection, not a recognized message, not the translator. This module owns it: get(), set(lang, reason), onChange(fn)
// and the BCP-47 tag used by speech recognition and synthesis. app.mjs, speech.mjs, translation.mjs, voice-noise.mjs and the engine client read it from here.
// Pure (no DOM, no node:*): runs in the page and in the engine worker.

export const LANGS = ['en', 'ro'];
/** MT-SERIOUS: every language of the translation engine (ui/mt-host.mjs registry, browser Translator) is registered here by the page; the engine worker accepts any language code. */
const known = new Set(LANGS);
export const registerLanguages = (codes) => { for (const c of codes) if (isCode(c)) known.add(c); return [...known]; };
export const knownLanguages = () => [...known];
const isCode = (c) => typeof c === 'string' && /^[a-z]{2,3}(?:_[a-z]+)?$/i.test(c);
/** Recognition and synthesis tags. English has a regional variant (Settings > Voice); Romanian has one tag; the others use the BCP-47 tag of the language (registry codes `zh_hant`, `nb`, `tl` are mapped). */
export const LANG_TAGS = { en: 'en-US', ro: 'ro-RO', zh: 'zh-CN', zh_hant: 'zh-TW', nb: 'nb-NO', no: 'nb-NO', tl: 'fil-PH', he: 'he-IL', id: 'id-ID', ms: 'ms-MY', ja: 'ja-JP', ko: 'ko-KR', ug: 'ug-CN' };
export const langTag = (lang) => LANG_TAGS[lang] ?? String(lang).replace('_', '-');
/** The display name of a language in its own language and in English ("română"/"Romanian"), through Intl.DisplayNames. */
export function langName(lang, { own = false } = {}) {
  if (LANG_NAMES[lang]) return own ? LANG_NAMES[lang].ro && lang === 'ro' ? 'Română' : LANG_NAMES[lang].en : LANG_NAMES[lang].en;
  const code = lang === 'zh_hant' ? 'zh-Hant' : lang === 'zh' ? 'zh-Hans' : lang;
  try { const n = new Intl.DisplayNames([own ? code : 'en'], { type: 'language' }).of(code); if (n) return own ? n.charAt(0).toLocaleUpperCase(code) + n.slice(1) : n; } catch { /* no Intl names */ }
  return lang;
}
export const EN_VARIANTS = ['en-US', 'en-GB'];
export const LANG_NAMES = { en: { en: 'English', ro: 'engleză' }, ro: { en: 'Romanian', ro: 'română' } };

/** 'en' | 'ro', or `fallback` for anything else (an old saved 'auto', a typo). */
export const normalize = (lang, fallback = 'en') => (isCode(lang) ? lang : fallback);
/** The language of the browser: `ro*` is Romanian, everything else English. The migration of an old saved 'auto' uses it. */
export const browserLanguage = (navLang = globalThis.navigator?.language) => (/^ro\b/i.test(String(navLang ?? '')) ? 'ro' : 'en');
/** The BCP-47 tag of a language; `variant` (en-GB) only applies to English. */
export const tagOf = (lang, variant = '') => (normalize(lang) === 'en' && EN_VARIANTS.includes(variant) ? variant : langTag(normalize(lang)));
/** The other language. */
export const other = (lang) => (normalize(lang) === 'en' ? 'ro' : 'en');   // the hint compares with English or Romanian only (the rules detect those two)

/**
 * The single language holder of one chat. `reason` of set(): 'selector' | 'settings' | 'command' | 'hint' | 'init' ... (kept for the log and the listeners).
 * onChange(fn) returns an unsubscribe function; fn({ lang, previous, reason, tag }) runs only when the language really changes.
 */
export function createLanguage({ initial = 'en', variant = '' } = {}) {
  let lang = normalize(initial), enVariant = EN_VARIANTS.includes(variant) ? variant : 'en-US';
  const listeners = new Set();
  const history = [];
  const emit = (previous, reason) => { for (const fn of [...listeners]) { try { fn({ lang, previous, reason, tag: tagOf(lang, enVariant) }); } catch (e) { console.warn('language listener failed', e); } } };
  return {
    get: () => lang,
    /** Changes the language; false (and no event) when it is the same or not a supported language. */
    set(next, reason = 'selector') {
      if (!known.has(next) || next === lang) return false;
      const previous = lang; lang = next; history.push({ lang, previous, reason });
      if (history.length > 50) history.shift();
      emit(previous, reason);
      return true;
    },
    /** The tag for recognition and speech in the selected language. */
    tag: () => tagOf(lang, enVariant),
    get variant() { return enVariant; },
    setVariant(v) { if (EN_VARIANTS.includes(v) && v !== enVariant) { enVariant = v; emit(lang, 'variant'); } },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    history: () => history.slice(),
  };
}

/** What the one-line hint says, in the selected language ("Pare engleză — schimb limba?"). */
export function hintText(selected, suggested) {
  const s = normalize(suggested);
  return normalize(selected) === 'ro'
    ? { text: `Pare ${LANG_NAMES[s].ro} — schimb limba?`, button: `Treci pe ${LANG_NAMES[s].ro}` }
    : { text: `That looks ${langName(s)} — switch the language?`, button: `Switch to ${langName(s)}` };
}

/**
 * The typed-message hint, the only use of the language detectors: when the message is clearly the other language the person is offered a switch.
 * `detect(text)` -> { lang, confidence } (browser LanguageDetector or the rules), `evidence(text)` -> { strongEn, strongRo } (rules).
 * Returns the suggested language or null. Never for voice, never automatic: the caller shows a button. Resolves null on any failure.
 */
export async function suggestSwitch(text, selected, { detect, evidence } = {}) {
  try {
    const t = String(text ?? '').trim();
    if ((t.match(/\p{L}/gu) ?? []).length < 8 || t.split(/\s+/).length < 3) return null;   // a short or one-word message says nothing about the language
    const target = other(selected);
    const ev = evidence ? await evidence(t) : null;
    if (!ev || !(target === 'en' ? ev.strongEn && !ev.strongRo : ev.strongRo && !ev.strongEn)) return null;
    const d = detect ? await detect(t) : null;
    if (d && d.lang && d.lang !== 'unknown' && d.lang !== target) return null;
    return target;
  } catch { return null; }
}
