// Translation strategies for the demo (ADR-002): `rules` (lib/translate), `browser-api` (on-device Translator) or auto.
// The browser API output is generative, so every sentence passes a checker (numbers, names, negation, question form);
// a failure falls back to the rules translator and is recorded in `usage` (shown in the trace).

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
/** Languages the session understands; any other detected language is 'unknown'. */
const SUPPORTED = new Set(['en', 'ro']);

export function createSwitchTranslator({ rules, getStrategy, getDetectStrategy = () => 'auto' }) {
  const cache = new Map();
  const usage = [];
  const detectUsage = [];
  let detectorPromise = null;
  /** Cached detector instance; null while it is still downloading (a background create() starts the download). */
  async function browserDetector() {
    const kind = browserDetectorKind();
    if (!kind) throw new Error('no browser language detector');
    if (!detectorPromise) {
      const avail = await browserDetectorAvailability();
      if (avail === 'unavailable' || avail === 'unsupported') throw new Error(`browser language detector ${avail}`);
      const make = kind === 'detector' ? self.LanguageDetector.create() : self.ai.languageDetector.create();
      detectorPromise = Promise.resolve(make).catch((e) => { detectorPromise = null; throw e; });
      if (avail !== 'available') { detectorPromise.catch(() => {}); return null; }
    }
    return detectorPromise;
  }
  async function browserTranslate(text, from, to) {
    const kind = browserTranslatorKind();
    if (!kind) throw new Error('no browser translator');
    const key = `${from}>${to}`;
    if (!cache.has(key)) {
      const opts = { sourceLanguage: from, targetLanguage: to };
      cache.set(key, (kind === 'translator' ? self.Translator.create(opts) : self.ai.translator.create(opts)).catch((e) => { cache.delete(key); throw e; }));
    }
    return (await cache.get(key)).translate(text);
  }
  const translator = {
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
          const top = (await det.detect(String(text)))?.[0];
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
