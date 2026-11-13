// SPDX-License-Identifier: AGPL-3.0-only
// Translation strategies for the demo (ADR-002): `rules` (lib/translate), `browser-api` (on-device Translator) or auto.
// The browser API output is generative, so every sentence passes a checker (numbers, names, negation, question form);
// a failure falls back to the rules translator and is recorded in `usage` (shown in the trace).

// Bounds a promise by a deadline. Its own copy (not lib/formalizer/guard.mjs): the engine worker, which has no import map, loads this file and must not pair it with a
// possibly stale cached library file.
function withDeadline(promise, ms, { label = 'operation' } = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    Promise.resolve(promise).then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

const NEG_SRC = /\b(nu|nici|niciun|nicio|fara|fără|nimic|niciodata|niciodată|not|no|never|n't)\b/i;
const NEG_EN = /\b(not|no|never|none|nothing|nobody|without|neither|nor|cannot)\b|n't\b/i;
const NEG_RO = /\b(nu|nici|niciun|nicio|fara|fără|nimic|niciodată|niciodata)\b/i;
const WH_EN = /^(what|who|whom|whose|where|when|why|how|which|do|does|did|is|are|am|was|were|can|could|will|would|have|has)\b/i;
// only true question words: "e ora 25" / "are 3 mere" / "ai dreptate" are statements unless they end in "?"
const WH_RO = /^(ce|cine|unde|când|cand|de ce|cum|care|câte|cate|câți|cați|cât|cat)\b/i;
const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const numbers = (s) => (String(s).match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.'));
function names(s) {
  const out = [];
  // Capitalised words that are not the first word of a sentence. (An earlier version had an alternative that matched the empty string at index 0: exec()
  // returned the same empty match for ever and froze the page on the first checked browser translation, which is every Romanian message.)
  const re = /\p{Lu}\p{L}+/gu;
  for (const m of s.matchAll(re)) if (m.index > 0 && !/[.!?]\s+$/.test(s.slice(0, m.index))) out.push(m[0]);
  return out;
}

/** Returns null when the translation is acceptable, else the reason it is not. */
export function checkTranslation(src, tgt, { from, to }) {
  if (!tgt || !String(tgt).trim()) return 'empty translation';
  // the model may mangle a quote ("at' încă"): a source whose quotes are balanced must give a target whose quotes are balanced
  if ((String(src).match(/"/g) ?? []).length % 2 === 0 && (String(tgt).match(/["„”«»]/g) ?? []).length % 2 !== 0) return 'quotes not balanced';
  const missing = numbers(src).filter((n) => !numbers(tgt).includes(n));
  if (missing.length) return `numbers not preserved (${missing.join(', ')})`;
  // a name is kept when the target has it, or a word that starts like it ("Japan" / "Japón", "July" / "julio"); German capitalises every noun and a non-Latin target
  // transliterates names, so for those the check is skipped (the numbers and the "?" are still checked)
  const latin = (String(tgt).match(/\p{Script=Latin}/gu) ?? []).length >= (String(tgt).match(/\p{L}/gu) ?? []).length / 2;
  const tgtWords = fold(tgt).match(/[a-z0-9]+/g) ?? [];
  const keeps = (n) => { const f = fold(n); return fold(tgt).includes(f) || tgtWords.some((w) => w.slice(0, Math.min(4, f.length)) === f.slice(0, Math.min(4, f.length))); };
  // Reply direction (to is not English): the source is our own English reply, the user's names and words are quoted verbatim (never translated), and the app's own
  // capitalised words ("Japan", "Eastern", a song title) are translated or transliterated by the model: only the reading direction checks names
  const reply = to !== 'en';
  // a name written in another script than the target's (Берлин / Berlin, Ана / Ana) is transliterated, so it cannot be compared letter by letter: the check needs the same script on both sides
  const srcLatin = (String(src).match(/\p{Script=Latin}/gu) ?? []).length >= (String(src).match(/\p{L}/gu) ?? []).length / 2;
  const lostNames = reply || from === 'de' || !latin || !srcLatin ? [] : names(src).filter((n) => !keeps(n));
  if (lostNames.length) return `names not preserved (${lostNames.join(', ')})`;
  // negation and question words are known for English and Romanian only; for any other language the "?" and the numbers and names are what is checked
  const negOf = (l) => (l === 'en' ? NEG_EN : l === 'ro' ? NEG_RO : null), whOf = (l) => (l === 'en' ? WH_EN : l === 'ro' ? WH_RO : null);
  const srcNeg = negOf(from)?.test(src) ?? false;
  const tgtNeg = negOf(to)?.test(tgt) ?? true;
  if (srcNeg && !tgtNeg) return 'negation not preserved';
  const srcQ = /\?\s*$/.test(src.trim()) || (!reply && (whOf(from)?.test(src.trim()) ?? false));   // our own replies mark a question with "?" ("would like a speaker" is a statement)
  const tgtQ = /\?\s*$/.test(tgt.trim()) || (whOf(to)?.test(tgt.trim()) ?? true);
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
/** Languages the session understands; any other detected language is 'unknown'. The list is LANGS of ui/language.mjs (the engine worker passes it: this file has no static imports, see the top). */
const DEFAULT_LANGS = ['en', 'ro'];

/**
 * The browser side of the translators: the on-device Translator and LanguageDetector of this window, with the HANG3 rules (never waited for beyond a
 * short deadline, `create()` once per pair, a cooldown after a failure, a background download). Only a window has these APIs. The engine worker (which
 * runs the turn) has none: it gets a remote backend (`createRemoteBackend`) that asks the page, which owns this one, over a message with a deadline.
 *   { translatorKind(), detectorKind(), translate(text, from, to) -> string, detect(text) -> [{ detectedLanguage, confidence }], prepare(from, to), state(from, to) }
 */
export function createBrowserBackend({ mt = null } = {}) {
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
  async function nativeTranslate(text, from, to) {
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
  /**
   * MT-SERIOUS, the order of the translation layer: (a) the browser's own Translator for a pair it supports (availability is asked once per pair, bounded),
   * (b) otherwise the on-device model of ui/mt-host.mjs (`mt`), which only answers when it is READY (it is downloaded when the language is selected, never inside a
   * turn), (c) nothing else: the call fails and the engine says so. A native translator that is still preparing or failed hands over to the model when that is ready.
   */
  const nativePair = new Map();
  async function nativeSupports(from, to) {
    if (!browserTranslatorKind()) return false;
    const key = `${from}>${to}`;
    if (!nativePair.has(key)) nativePair.set(key, withDeadline(browserTranslatorAvailability(from, to), AVAILABILITY_TIMEOUT_MS, { label: 'translator availability' }).then((a) => a !== 'unavailable' && a !== 'unsupported', () => false));
    return nativePair.get(key);
  }
  /** M4: the translators that can answer this pair right now, each one separately: ['native', 'model']. */
  async function sources(from, to) {
    const lang = from === 'en' ? to : from, out = [];
    if (await nativeSupports(from, to)) out.push('native');
    if (mt && mt.has(lang) && mt.state(lang).phase === 'ready') out.push('model');
    return out;
  }
  async function browserTranslate(text, from, to, only = null) {
    const lang = from === 'en' ? to : from;
    const model = mt && mt.has(lang);
    if (only === 'native') return nativeTranslate(text, from, to);   // M4: one candidate per translator
    if (only === 'model') { if (!model) throw new Error('no on-device model'); return mt.translate(text, from, to); }
    if (await nativeSupports(from, to)) {
      try { return await nativeTranslate(text, from, to); } catch (e) { if (!(model && mt.state(lang).phase === 'ready')) throw e; }
    }
    if (model) return mt.translate(text, from, to);
    throw new Error('no translator for this language pair');
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
    if (!browserTranslatorKind()) { const lang = from === 'en' ? to : from, st = mt?.has(lang) ? mt.state(lang) : null; return st ? `on-device model: ${st.phase}` : 'not supported by this browser'; }
    if (instances.has(key)) return 'ready';
    if (pending.has(key)) return 'preparing or downloading; the rules translator is used meanwhile';
    if ((cooldown.get(key) ?? 0) > Date.now()) return 'not answering; the rules translator is used for now';
    return null;
  }
  async function detect(text) {
    const det = await browserDetector();
    if (!det) throw new Error('still downloading');
    return await withDeadline(det.detect(String(text)), DETECT_TIMEOUT_MS, { label: 'language detection' });
  }
  return { translatorKind: () => browserTranslatorKind() ?? (mt ? 'mt' : null), nativeKind: browserTranslatorKind, hasModel: !!mt, detectorKind: browserDetectorKind, translate: browserTranslate, sources, detect, prepare: prepareTranslator, state: translatorState };
}

/** Deadline of a call from the engine worker to the page's browser API: the page itself waits at most 400 ms, this leaves room for the message round trip. */
export const REMOTE_DEADLINE_MS = 700;

/**
 * The browser backend as seen from the engine worker: `kinds` = { translator, detector } (what the page reported at start), `call(op, payload)` posts a
 * request to the page and resolves with its answer. A call that is not answered within REMOTE_DEADLINE_MS rejects, and the switch translator then
 * uses the rules (as it does for a browser API that times out). The page thread is never needed for a turn to finish.
 */
export const REMOTE_MT_DEADLINE_MS = 3500;   // the on-device model (WASM) answers a sentence in 10-300 ms on a phone; its own call deadline is 2.5 s
export function createRemoteBackend({ kinds, call, deadlineMs = kinds?.mt ? REMOTE_MT_DEADLINE_MS : REMOTE_DEADLINE_MS }) {
  const bounded = (op, payload, label) => withDeadline(call(op, payload), deadlineMs, { label });
  return {
    translatorKind: () => kinds.translator ?? null,
    detectorKind: () => kinds.detector ?? null,
    translate: async (text, from, to, only = null) => { if (!kinds.translator) throw new Error('no browser translator'); return bounded('translate', { text, from, to, ...(only ? { only } : {}) }, 'page translation'); },
    sources: async (from, to) => [...((kinds.translator && (!kinds.pairs || kinds.pairs.includes(`${from}>${to}`))) ? ['native'] : []), ...(kinds.mt ? ['model'] : [])],   // M4: the page says what exists; a call that fails is just no candidate
    detect: async (text) => { if (!kinds.detector) throw new Error('no browser language detector'); return bounded('detect', { text }, 'page language detection'); },
    prepare: async () => {},
    supports: (from, to) => !kinds.pairs || kinds.pairs.includes(`${from}>${to}`),
    state: () => (kinds.translator ? kinds.state ?? 'in the page' : 'not supported by this browser'),
  };
}

/**
 * LANG-FIXED: detectLanguage() is NOT part of a turn any more (the selected language is the language of every message). It is used only for the one-line
 * "this looks like English, switch?" hint after a typed message (ui/language.mjs suggestSwitch), through the engine worker's `hint` request.
 */
export function createSwitchTranslator({ rules, getStrategy, getDetectStrategy = () => 'auto', backend = createBrowserBackend(), languages = DEFAULT_LANGS }) {
  const SUPPORTED = new Set(languages);
  const usage = [];
  const detectUsage = [];
  const { prepare: prepareTranslator, state: translatorState } = backend;
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
          const top = (await backend.detect(text))?.[0];
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
    /**
     * M4 is the only translation path (spec 06): strategy 'auto' and 'browser-api' mean 'fallback' (candidates: the browser Translator, the on-device model, the rules; checked);
     * 'rules' never uses a machine translator ('off'). Returns 'fallback' | 'off'.
     */
    fallbackMode() { return getStrategy() === 'rules' ? 'off' : 'fallback'; },
    /** True when a Translator for this pair exists in this window (or the page behind the worker bridge), whatever its model state. */
    canTranslate(from, to) { return getStrategy() !== 'rules' && !!backend.translatorKind() && (backend.supports?.(from, to) ?? true); },
    /** Records the route of a turn in `usage` (trace and phrase log): `via` is 'translator-in' | 'translator-out' | 'rules-translate' | 'ro-generic'. */
    note(via, detail = {}) { usage.push({ direction: detail.direction ?? null, requested: getStrategy(), strategy: detail.strategy ?? 'rules', fallback: !!detail.fallback, reason: detail.reason ?? null, via }); },
    /**
     * M4: one candidate per available machine translator (the browser Translator and the on-device model), each through the checker (numbers, names, negation).
     * [{ source: 'browser' | 'model', text, translation, rejected? }]; never throws; the calls run side by side, each bounded by the backend deadline.
     */
    async candidatesViaMT(text, { from, to }) {
      if (getStrategy() === 'rules' || !backend.translatorKind() || !(backend.supports?.(from, to) ?? true)) return [];
      let srcs = [];
      try { srcs = (await backend.sources?.(from, to)) ?? ['native']; } catch { srcs = []; }
      const via = to === 'en' ? 'translator-in' : 'translator-out';
      const done = await Promise.all(srcs.map(async (src) => {
        const entry = { direction: `${from}->${to}`, requested: getStrategy(), strategy: 'rules', fallback: true, reason: null, via, candidate: src };
        usage.push(entry);
        try {
          const out = await backend.translate(text, from, to, src);
          const bad = checkTranslation(text, out, { from, to });
          if (bad) entry.reason = `checker failed: ${bad}`; else { entry.strategy = 'browser-api'; entry.fallback = false; }
          return { source: src === 'model' ? 'model' : 'browser', text: out, rejected: bad ? `checker: ${bad}` : null, ...(bad && /^names not preserved/.test(bad) && to === 'en' ? { soft: true } : {}),   // reading direction: a name that differs (Parys / Paris) is a warning for M4, not a veto
            translation: { text: out, alignment: text ? [{ src: [0, text.length], tgt: [0, String(out).length] }] : [], unknown: [], notes: [`translated by the ${src === 'model' ? 'on-device model' : 'browser on-device Translator API'} (${via})`], confidence: 1, strategy: 'browser-api', via } };
        } catch (e) { entry.reason = `${src} error: ${e?.message ?? e}`; return null; }
      }));
      return done.filter(Boolean);
    },
    async translate(text, opts) {
      const { from, to } = opts;
      const pref = getStrategy();
      const entry = { direction: `${from}->${to}`, requested: pref, strategy: 'rules', fallback: false, reason: null };
      usage.push(entry);
      if (pref !== 'rules' && backend.translatorKind()) {
        try {
          const out = await backend.translate(text, from, to);
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
