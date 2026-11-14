// SPDX-License-Identifier: AGPL-3.0-only
// MT-SERIOUS: the on-device translation model (bergamot-translator, Mozilla Marian student models) for browsers that have no Translator API
// (Chrome on Android, Firefox, Safari). Spec 06 "On-device translation model".
//
//  - The registry (vendor/bergamot/registry.json, scripts/build-mt-registry.mjs) lists the languages that have BOTH directions with English.
//  - A language is downloaded LAZILY, the first time it is selected (`ensure(lang)`), never on the first-paint path, with progress reported through `onState`.
//    The files are cached by the host's `fetchFile` (the page: Cache Storage; Node tooling: a directory).
//  - The WASM engine runs in its own worker (the vendored translator-worker.js, a classic worker); calls are serialised, each has a deadline, a call that does
//    not finish terminates the worker (WASM cannot be interrupted) and the models are loaded again from the cache on the next `ensure`.
//  - Pure of `node:*` and of the DOM: the host passes `fetchFile(url, { bytes, onProgress }) -> ArrayBuffer` (already gunzipped) and `spawn() -> Worker-like`.
//
//   createMtHost({ registry, fetchFile, spawn, onState?, deadlineMs? }) -> { languages(), has(lang), bytes(lang), flores(lang), state(lang), ensure(lang), translate(text, from, to), reset() }
// State of a language: { phase: 'idle' | 'downloading' | 'loading' | 'ready' | 'error', done, total, error? } (bytes).

export const MT_CALL_DEADLINE_MS = 2500;   // one translation call (a sentence or a short reply) on a throttled phone
export const MT_INIT_DEADLINE_MS = 60000;  // WASM instantiation + loading one direction's model

function withDeadline(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error(`${label} timed out after ${ms} ms`), { timeout: true })), ms);
    Promise.resolve(promise).then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

export function createMtHost({ registry, fetchFile, spawn, onState = () => {}, deadlineMs = MT_CALL_DEADLINE_MS, initDeadlineMs = MT_INIT_DEADLINE_MS }) {
  const langs = registry?.langs ?? {};
  const states = new Map();
  const ensuring = new Map();
  let worker = null, workerReady = null, seq = 0;
  const pending = new Map();
  const loadedModels = new Set();   // 'en>ro'
  let chain = Promise.resolve();    // worker calls are serialised

  const setState = (lang, s) => { const v = { done: 0, total: 0, ...s }; states.set(lang, v); try { onState(lang, v); } catch { /* a listener must not break the host */ } };
  const stateOf = (lang) => states.get(lang) ?? { phase: 'idle', done: 0, total: 0 };

  function startWorker() {
    const w = spawn();
    w.onmessage = (ev) => {
      const { id, result, error } = ev.data ?? {};
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error) p.reject(Object.assign(new Error(error.message ?? 'translation worker error'), { stack: error.stack })); else p.resolve(result);
    };
    w.onerror = (e) => killWorker(`worker error: ${e?.message ?? e}`);
    worker = w;
    workerReady = null;
    loadedModels.clear();
    return w;
  }
  function killWorker(why) {
    const w = worker;
    worker = null; workerReady = null; loadedModels.clear();
    try { w?.terminate?.(); } catch { /* gone */ }
    for (const [, p] of pending) p.reject(new Error(why));
    pending.clear();
    for (const [lang, s] of states) if (s.phase === 'ready') setState(lang, { phase: 'idle' });
  }
  const call = (name, ...args) => new Promise((resolve, reject) => {
    if (!worker) { reject(new Error('translation worker not running')); return; }
    const id = ++seq;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, name, args });
  });
  /** One worker call at a time, bounded; a call that times out ends the worker. */
  function serial(name, args, ms, label) {
    const run = () => withDeadline(call(name, ...args), ms, label).catch((e) => { if (e.timeout) killWorker(`${label} did not finish`); throw e; });
    const p = chain.then(run, run);
    chain = p.catch(() => {});
    return p;
  }
  async function engine() {
    if (!worker) startWorker();
    if (!workerReady) {
      workerReady = call('initialize', { useNativeIntGemm: false, cacheSize: 0 });
      workerReady.catch(() => { workerReady = null; });
    }
    await withDeadline(workerReady, initDeadlineMs, 'translation engine start');
  }

  function filesOf(dir) {
    const f = dir.files, v = f.vocab ? [f.vocab] : [f.srcVocab ?? f.srcvocab, f.trgVocab ?? f.trgvocab].filter(Boolean);
    return { model: f.model, shortlist: f.lexicalShortlist ?? f.lex, vocabs: v };
  }
  async function download(lang, dir, from, to, progress) {
    const spec = filesOf(dir);
    const get = (f) => fetchFile(`${registry.baseUrl}/${f.path}`, { bytes: f.bytes, sha256: f.sha256, onProgress: (n) => progress(f.path, n),
      mirror: f.mirror ? new URL(f.mirror, registry.mirrorBase ?? globalThis.location?.href ?? import.meta.url).href : null });
    const [model, shortlist, ...vocabs] = await Promise.all([get(spec.model), get(spec.shortlist), ...spec.vocabs.map(get)]);
    return { model, shortlist, vocabs };
  }

  async function ensureLang(lang) {
    const L = langs[lang];
    if (!L) throw new Error(`no on-device translation model for "${lang}"`);
    const total = L.bytes, per = new Map();
    const progress = (path, n) => { per.set(path, n); setState(lang, { phase: 'downloading', done: Math.min(total, [...per.values()].reduce((a, b) => a + b, 0)), total }); };
    setState(lang, { phase: 'downloading', done: 0, total });
    const [a, b] = await Promise.all([download(lang, L.fromEn, 'en', lang, progress), download(lang, L.toEn, lang, 'en', progress)]);
    setState(lang, { phase: 'loading', done: total, total });
    await engine();
    for (const [from, to, buffers] of [['en', lang, a], [lang, 'en', b]]) {
      if (!loadedModels.has(`${from}>${to}`)) { await serial('loadTranslationModel', [{ from, to }, buffers], initDeadlineMs, `loading ${from}>${to}`); loadedModels.add(`${from}>${to}`); }
    }
    setState(lang, { phase: 'ready', done: total, total });
  }

  return {
    languages: () => Object.keys(langs),
    has: (lang) => !!langs[lang],
    bytes: (lang) => langs[lang]?.bytes ?? 0,
    flores: (lang) => langs[lang] ? { fromEn: langs[lang].fromEn.flores, toEn: langs[lang].toEn.flores } : null,
    state: stateOf,
    /** Starts (once) the download and load of a language; resolves when both directions are ready, rejects when it failed (the state says why; a later call retries). */
    ensure(lang) {
      if (stateOf(lang).phase === 'ready' && loadedModels.has(`en>${lang}`)) return Promise.resolve();
      if (!ensuring.has(lang)) {
        const p = ensureLang(lang).catch((e) => { setState(lang, { phase: 'error', error: String(e?.message ?? e) }); throw e; }).finally(() => ensuring.delete(lang));
        p.catch(() => {});
        ensuring.set(lang, p);
      }
      return ensuring.get(lang);
    },
    /** Translates; the model must be ready (it never waits for a download). Rejects with a timeout error after `deadlineMs`. */
    async translate(text, from, to, { ms = deadlineMs } = {}) {
      const lang = from === 'en' ? to : from;
      if (stateOf(lang).phase !== 'ready' || !loadedModels.has(`${from}>${to}`)) throw new Error(`the ${lang} translation model is not ready`);
      const out = await serial('translate', [{ models: [{ from, to }], texts: [{ text: String(text), html: false }] }], ms, 'on-device translation');
      return String(out?.[0]?.target?.text ?? '');
    },
    /** Stops the worker (tests, and Settings > Models "free memory"); the cached files stay. */
    reset() { killWorker('reset'); },
    _loaded: () => [...loadedModels],
  };
}

/** Human size, "30 MB". */
export const mbText = (bytes) => `${Math.max(1, Math.round(bytes / 1e6))} MB`;
