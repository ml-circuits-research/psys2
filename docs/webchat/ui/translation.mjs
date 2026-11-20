// SPDX-License-Identifier: AGPL-3.0-only
// The browser side of translation at the interface boundary: the on-device Translator and LanguageDetector of this window and the
// on-device model proxy, with deadlines. English is the only language behind the boundary; there is no rules translator.

// Bounds a promise by a deadline. Its own copy (not lib/dialog/turn-guard.mjs): the engine worker, which has no import map, loads this file and must not pair it with a
// possibly stale cached library file.
function withDeadline(promise, ms, { label = 'operation' } = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    Promise.resolve(promise).then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
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

/** Every browser-API await on the turn path is bounded (a promise that never settles must not hold the chat). */
const AVAILABILITY_TIMEOUT_MS = 1000, DETECT_TIMEOUT_MS = 400, TRANSLATE_TIMEOUT_MS = 400;   // HANG3: an available browser API gets 400 ms per call, then the turn goes on without it
/** A browser translator that failed or timed out is not tried again for this long (the turn goes on without it meanwhile). */
const COOLDOWN_MS = 60000;

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
   * stall) the session language is used. HANG task: an earlier version returned the pending `create()` promise to every later turn, so a download in
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
    if (!detectorWait) return null;   // still being downloaded: the session language is used meanwhile
    try { return await withDeadline(detectorPromise, DETECT_TIMEOUT_MS, { label: 'detector creation' }); } catch (e) { if (!detectorInstance) detectorWait = false; throw e; }   // stalled once: do not wait again
  }
  /**
   * The browser translator, bounded like the detector (PERF round 3). A `create()` that has not settled (model downloading or stalled) is never awaited
   * again by every later turn: each turn used to wait the whole TRANSLATE_TIMEOUT_MS (4 s) on it, so every Romanian message cost 4 s and
   * a few ended in the watchdog. Now: only a translator the browser reports as 'available' is waited for (briefly); a pending, failed or timed-out one
   * makes the turn go on without it at once, and a timed-out translator is not tried again for COOLDOWN_MS.
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
    } catch { /* needs a user gesture or is not allowed: the turn goes on without it */ }
  }
  /** What Settings > Language shows: the live state of the browser translator (ro > en), or null when nothing is known beyond availability. */
  function translatorState(from = 'ro', to = 'en') {
    const key = `${from}>${to}`;
    if (!browserTranslatorKind()) { const lang = from === 'en' ? to : from, st = mt?.has(lang) ? mt.state(lang) : null; return st ? `on-device model: ${st.phase}` : 'not supported by this browser'; }
    if (instances.has(key)) return 'ready';
    if (pending.has(key)) return 'preparing or downloading; translation waits for it';
    if ((cooldown.get(key) ?? 0) > Date.now()) return 'not answering; tried again later';
    return null;
  }
  async function detect(text) {
    const det = await browserDetector();
    if (!det) throw new Error('still downloading');
    return await withDeadline(det.detect(String(text)), DETECT_TIMEOUT_MS, { label: 'language detection' });
  }
  return { translatorKind: () => browserTranslatorKind() ?? (mt ? 'mt' : null), nativeKind: browserTranslatorKind, hasModel: !!mt, detectorKind: browserDetectorKind, translate: browserTranslate, sources, detect, prepare: prepareTranslator, state: translatorState };
}
