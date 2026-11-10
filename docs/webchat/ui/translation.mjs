// SPDX-License-Identifier: AGPL-3.0-only
// Translation strategies for the demo (ADR-002): `rules` (lib/translate), `browser-api` (on-device Translator) or auto.
// The browser API output is generative, so every sentence passes a checker (numbers, names, negation, question form);
// a failure falls back to the rules translator and is recorded in `usage` (shown in the trace).

import { withDeadline } from '../lib/formalizer/guard.mjs';

const NEG_SRC = /\b(nu|nici|niciun|nicio|fara|fără|nimic|niciodata|niciodată|not|no|never|n't)\b/i;
const NEG_EN = /\b(not|no|never|none|nothing|nobody|without|neither|nor|cannot)\b|n't\b/i;
const NEG_RO = /\b(nu|nici|niciun|nicio|fara|fără|nimic|niciodată|niciodata)\b/i;
const WH_EN = /^(what|who|whom|whose|where|when|why|how|which|do|does|did|is|are|am|was|were|can|could|will|would|have|has)\b/i;
const WH_RO = /^(ce|cine|unde|când|cand|de ce|cum|care|câte|cate|câți|cați|cât|cat|este|are|au|poți|poti|ai|sunt|e)\b/i;
const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const numbers = (s) => (String(s).match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.'));
function names(s) {
  const out = [];
  const re = /(^|[.!?]\s+)|(\p{Lu}\p{L}+)/gu;
  let m;
  // bounded: regex exec with the g flag advances lastIndex each pass
  while ((m = re.exec(s))) if (m[2] && m.index > 0 && !/[.!?]\s+$/.test(s.slice(0, m.index))) out.push(m[2]);
  return out;
}

/** Returns null when the translation is acceptable, else the reason it is not. */
export function checkTranslation(src, tgt, { from, to }) {
  if (!tgt || !String(tgt).trim()) return 'empty translation';
  const missing = numbers(src).filter((n) => !numbers(tgt).includes(n));
  if (missing.length) return `numbers not preserved (${missing.join(', ')})`;
  const lostNames = names(src).filter((n) => !fold(tgt).includes(fold(n)));
  if (lostNames.length) return `names not preserved (${lostNames.join(', ')})`;
  const srcNeg = (from === 'ro' ? NEG_RO : NEG_EN).test(src);
  const tgtNeg = (to === 'en' ? NEG_EN : NEG_RO).test(tgt);
  if (srcNeg && !tgtNeg) return 'negation not preserved';
  const srcQ = /\?\s*$/.test(src.trim()) || (from === 'en' ? WH_EN : WH_RO).test(src.trim());
  const tgtQ = /\?\s*$/.test(tgt.trim()) || (to === 'en' ? WH_EN : WH_RO).test(tgt.trim());
  if (srcQ && !tgtQ) return 'question form not preserved';
  return null;
}

/** 'translator' (current API), 'ai' (older Chrome origin-trial API) or null. */
export function browserTranslatorKind() {
  if (typeof self === 'undefined') return null;
  if (typeof self.Translator?.create === 'function') return 'translator';
  if (typeof self.ai?.translator?.create === 'function') return 'ai';
  return null;
}

export async function browserTranslatorAvailability(from = 'ro', to = 'en') {
  const kind = browserTranslatorKind();
  if (!kind) return 'unsupported';
  try {
    if (kind === 'translator') return await self.Translator.availability({ sourceLanguage: from, targetLanguage: to });
    const r = await self.ai.translator.canTranslate({ sourceLanguage: from, targetLanguage: to });
    return r === 'readily' ? 'available' : r === 'after-download' ? 'downloadable' : 'unavailable';
  } catch { return 'unavailable'; }
}

/** 'detector' (current LanguageDetector API), 'ai' (older Chrome origin-trial `ai.languageDetector`) or null. */
export function browserDetectorKind() {
  if (typeof self === 'undefined') return null;
  if (typeof self.LanguageDetector?.create === 'function') return 'detector';
  if (typeof self.ai?.languageDetector?.create === 'function') return 'ai';
  return null;
}

/** 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported' (same words as the Translator API). */
export async function browserDetectorAvailability() {
  const kind = browserDetectorKind();
  if (!kind) return 'unsupported';
  try {
    if (kind === 'detector') return await self.LanguageDetector.availability();
    const r = await self.ai.languageDetector.capabilities();
    const a = r?.available ?? r;
    return a === 'readily' ? 'available' : a === 'after-download' ? 'downloadable' : 'unavailable';
  } catch { return 'unavailable'; }
}

/**
 * Detection confidence below this is reported as 'unknown' (the dialog engine then keeps the session language, default English).
 * Chrome's detector returns about 0.9+ for a clear sentence and 0.3-0.6 for one or two words; 0.5 keeps the clear cases and drops
 * the guesses. Inputs with fewer than MIN_LETTERS letters are left to the rules detector, which knows chat words ("ok", "e", "da").
 */
export const DETECT_MIN_CONFIDENCE = 0.5;
export const MIN_LETTERS = 3;
/** Every browser-API await on the turn path is bounded (a promise that never settles must not hold the chat). */
const AVAILABILITY_TIMEOUT_MS = 1000, DETECT_TIMEOUT_MS = 400, TRANSLATE_TIMEOUT_MS = 400;   // HANG3: an available browser API gets 400 ms per call, then the rules answer
/** A browser translator that failed or timed out is not tried again for this long (the rules translator answers meanwhile). */
const COOLDOWN_MS = 60000;
/** Languages the session understands; any other detected language is 'unknown'. */
const SUPPORTED = new Set(['en', 'ro']);

export function createSwitchTranslator({ rules, getStrategy, getDetectStrategy = () => 'auto' }) {
  const usage = [];
  const detectUsage = [];
  let detectorPromise = null, detectorInstance = null, detectorWait = false;
  /**
   * The detector instance when it is ready, else null. It NEVER waits for `create()`: while the on-device model downloads (which can take minutes, or
   * stall) the rules detect the language. HANG task: an earlier version returned the pending `create()` promise to every later turn, so a download in
   * progress blocked the chat ("thinking..." for ever).
   */
  async function browserDetector() {
    const kind = browserDetectorKind();
    if (!kind) throw new Error('no browser language detector');
    if (detectorInstance) return detectorInstance;
    if (!detectorPromise) {
      const avail = await withDeadline(browserDetectorAvailability(), AVAILABILITY_TIMEOUT_MS, { label: 'detector availability' });
      if (avail === 'unavailable' || avail === 'unsupported') throw new Error(`browser language detector ${avail}`);
      const make = kind === 'detector' ? self.LanguageDetector.create() : self.ai.languageDetector.create();
      detectorPromise = Promise.resolve(make).then((d) => { detectorInstance = d; return d; }, (e) => { detectorPromise = null; throw e; });
      detectorPromise.catch(() => {});
      detectorWait = avail === 'available';   // a model on the device is created in a moment; one that has to be downloaded is never waited for
    }
    if (!detectorWait) return null;   // still being downloaded: the rules detect the language meanwhile
    try { return await withDeadline(detectorPromise, DETECT_TIMEOUT_MS, { label: 'detector creation' }); } catch (e) { if (!detectorInstance) detectorWait = false; throw e; }   // stalled once: do not wait again
  }
  /**
   * The browser translator, bounded like the detector (PERF round 3). A `create()` that has not settled (model downloading or stalled) is never awaited
   * again by every later turn: each turn used to wait the whole TRANSLATE_TIMEOUT_MS (4 s) on it, so every Romanian message cost 4 s and
   * a few ended in the watchdog. Now: only a translator the browser reports as 'available' is waited for (briefly); a pending, failed or timed-out one
   * makes the turn use the rules translator at once, and a timed-out translator is not tried again for COOLDOWN_MS.
   */
  const instances = new Map(), pending = new Map(), cooldown = new Map(), waitedOnce = new Set();
  async function browserTranslate(text, from, to) {
    const kind = browserTranslatorKind();
    if (!kind) throw new Error('no browser translator');
    const key = `${from}>${to}`;
    if ((cooldown.get(key) ?? 0) > Date.now()) throw new Error('browser translator timed out recently');
    let inst = instances.get(key);
    if (!inst) {
      if (!pending.has(key)) {
        const opts = { sourceLanguage: from, targetLanguage: to };
        const avail = await withDeadline(browserTranslatorAvailability(from, to), AVAILABILITY_TIMEOUT_MS, { label: 'translator availability' }).catch(() => 'unavailable');
        if (avail === 'unavailable' || avail === 'unsupported') { cooldown.set(key, Date.now() + COOLDOWN_MS); throw new Error(`browser translator ${avail}`); }
        const make = kind === 'translator' ? self.Translator.create(opts) : self.ai.translator.create(opts);
        const p = Promise.resolve(make).then((t) => { instances.set(key, t); pending.delete(key); return t; }, (e) => { pending.delete(key); cooldown.set(key, Date.now() + COOLDOWN_MS); throw e; });
        p.catch(() => {});
        pending.set(key, p);
        if (avail !== 'available') throw new Error(`browser translator ${avail}: preparing in the background`);
      }
      if (waitedOnce.has(key)) throw new Error('browser translator still preparing');   // one turn waited for it already: later turns do not
      waitedOnce.add(key);
      inst = await withDeadline(pending.get(key), DETECT_TIMEOUT_MS, { label: 'translator creation' }).catch((e) => { throw new Error(`browser translator not ready (${e?.message ?? e})`); });
    }
    try { return await withDeadline(Promise.resolve(inst.translate(text)), TRANSLATE_TIMEOUT_MS, { label: 'browser translation' }); } catch (e) { cooldown.set(key, Date.now() + COOLDOWN_MS); throw e; }
  }
  /** Starts the browser translator (ro > en) in the background when it is downloadable or downloading: never awaited by a turn (HANG3). */
  async function prepareTranslator(from = 'ro', to = 'en') {
    const kind = browserTranslatorKind(), key = `${from}>${to}`;
    if (!kind || instances.has(key) || pending.has(key)) return;
    const avail = await withDeadline(browserTranslatorAvailability(from, to), AVAILABILITY_TIMEOUT_MS, { label: 'translator availability' }).catch(() => 'unavailable');
    if (avail === 'unavailable' || avail === 'unsupported' || pending.has(key) || instances.has(key)) return;
    try {
      const opts = { sourceLanguage: from, targetLanguage: to };
      const p = Promise.resolve(kind === 'translator' ? self.Translator.create(opts) : self.ai.translator.create(opts)).then((t) => { instances.set(key, t); pending.delete(key); return t; }, (e) => { pending.delete(key); cooldown.set(key, Date.now() + COOLDOWN_MS); throw e; });
      p.catch(() => {}); pending.set(key, p);
    } catch { /* needs a user gesture or is not allowed: the rules are used */ }
  }
  /** What Settings > Language shows: the live state of the browser translator (ro > en), or null when nothing is known beyond availability. */
  function translatorState(from = 'ro', to = 'en') {
    const key = `${from}>${to}`;
    if (!browserTranslatorKind()) return 'not supported by this browser';
    if (instances.has(key)) return 'ready';
    if (pending.has(key)) return 'preparing or downloading; the rules translator is used meanwhile';
    if ((cooldown.get(key) ?? 0) > Date.now()) return 'not answering; the rules translator is used for now';
    return null;
  }
  const translator = {
    prepareTranslator, translatorState,
    rules,   // the synchronous rules translator: used by the voice dry run, which must not wait for a browser translator
    usage,
    detectUsage,
    resetUsage() { usage.length = 0; detectUsage.length = 0; },
    async detectLanguage(text) {
      const pref = getDetectStrategy();
      const entry = { requested: pref, strategy: 'rules', fallback: false, reason: null, detected: null, confidence: null };
      detectUsage.push(entry);
      if (pref !== 'rules') {
        try {
          if ((String(text ?? '').match(/\p{L}/gu) ?? []).length < MIN_LETTERS) throw Object.assign(new Error('too short for the browser detector'), { quiet: true });
          const det = await browserDetector();
          if (!det) throw new Error('still downloading');
          const top = (await withDeadline(det.detect(String(text)), DETECT_TIMEOUT_MS, { label: 'language detection' }))?.[0];
          if (!top?.detectedLanguage) throw new Error('empty detection result');
          const code = String(top.detectedLanguage).toLowerCase().split(/[-_]/)[0];
          const confidence = Number(top.confidence) || 0;
          entry.strategy = 'browser-api'; entry.detected = code; entry.confidence = confidence;
          if (!SUPPORTED.has(code) || confidence < DETECT_MIN_CONFIDENCE) return { lang: 'unknown', confidence, detected: code, strategy: 'browser-api' };
          return { lang: code, confidence, strategy: 'browser-api' };
        } catch (e) { entry.strategy = 'rules'; entry.fallback = true; entry.reason = e?.quiet ? 'input too short' : `browser API: ${e?.message ?? e}`; }
      }
      const r = rules.detectLanguage(text);
      entry.detected = r?.lang ?? null; entry.confidence = r?.confidence ?? null;
      return r;
    },
    /** The rules evidence is used with either detector (RD5): the browser detector alone must not flip the session on English with a typo. */
    evidence: (text) => rules.evidence?.(text) ?? null,
    leftovers: (text, lang) => rules.leftovers?.(text, lang) ?? [],
    supports: (f, t) => rules.supports?.(f, t) ?? true,
    async translate(text, opts) {
      const { from, to } = opts;
      const pref = getStrategy();
      const entry = { direction: `${from}->${to}`, requested: pref, strategy: 'rules', fallback: false, reason: null };
      usage.push(entry);
      if (pref !== 'rules' && browserTranslatorKind()) {
        try {
          const out = await browserTranslate(text, from, to);
          const bad = checkTranslation(text, out, { from, to });
          if (!bad) {
            entry.strategy = 'browser-api';
            return { text: out, alignment: text ? [{ src: [0, text.length], tgt: [0, out.length] }] : [], unknown: [], notes: ['translated by the browser on-device Translator API'], confidence: 1, strategy: 'browser-api' };
          }
          entry.fallback = true; entry.reason = `checker failed: ${bad}`;
        } catch (e) { entry.fallback = true; entry.reason = `browser API error: ${e?.message ?? e}`; }
      } else if (pref === 'browser-api') {
        entry.fallback = true; entry.reason = 'browser API not available';
      }
      const r = rules.translate(text, opts);
      return { ...r, strategy: 'rules' };
    },
  };
  return translator;
}
