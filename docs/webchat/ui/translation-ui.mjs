// SPDX-License-Identifier: AGPL-3.0-only
// MT-SERIOUS: the page side of the translation layer: which languages exist, which engine serves each, the lazy download of the on-device model with a visible
// state, and the gate a message waits at while the model of its language is downloading. Spec 06 "On-device translation model".
//
//   (a) the browser's Translator API for a pair it supports, (b) otherwise the on-device model (ui/mt-host.mjs, bergamot-translator, cached in Cache Storage),
//   downloaded the first time the language is selected, never on the first-paint path, (c) nothing else.
import { createMtHost, mbText } from './mt-host.mjs';
import { langName, registerLanguages, knownLanguages } from './language.mjs';
import { browserTranslatorKind, browserTranslatorAvailability } from './translation.mjs';

const CACHE = 'psys2-mt-v1';
/** A language is listed in the selector only when at least this share of the machine-translated operational sample is read right (scripts/mt-quality.mjs). */
export const QUALITY_GATE = 80;
/** Languages that always are listed: English, and Romanian, which has its own rules and templates besides the model. */
const ALWAYS = ['en', 'ro'];
const DOWNLOAD_LIMIT_MS = 180000;

const isGzip = (u8) => u8.length > 2 && u8[0] === 0x1f && u8[1] === 0x8b;
async function gunzip(buf) {
  const u8 = new Uint8Array(buf);
  if (!isGzip(u8)) return buf;   // a server that already decoded it
  return new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** fetch with progress, kept in Cache Storage (the gzip as downloaded), gunzipped, the model file checked against the registry's sha256. */
export function createCachedFetch({ cacheName = CACHE } = {}) {
  return async function fetchFile(url, { bytes, onProgress, sha256 } = {}) {
    let cache = null;
    try { cache = await globalThis.caches?.open(cacheName); } catch { cache = null; }   // private windows and some embedded browsers have no Cache Storage: downloaded again next time
    let resp = null;
    try { resp = cache ? await cache.match(url) : null; } catch { resp = null; }
    let data;
    if (resp) { data = await resp.arrayBuffer(); onProgress?.(data.byteLength); }
    else {
      const r = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!r.ok) throw new Error(`download failed (${r.status})`);
      const chunks = []; let got = 0;
      const reader = r.body?.getReader?.();
      if (reader) for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; onProgress?.(got); }
      else { const b = new Uint8Array(await r.arrayBuffer()); chunks.push(b); got = b.length; onProgress?.(got); }
      const all = new Uint8Array(got); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
      data = all.buffer;
      try { await cache?.put(url, new Response(data, { headers: { 'content-type': 'application/octet-stream' } })); } catch { /* quota: the model works, it is just downloaded again next time */ }
    }
    const plain = await gunzip(data);
    if (sha256 && globalThis.crypto?.subtle) {
      const h = hex(await crypto.subtle.digest('SHA-256', plain));
      if (h !== sha256) { try { await cache?.delete(url); } catch { /* ignore */ } throw new Error('the downloaded model file is damaged (checksum differs); try again'); }
    }
    return plain;
  };
}

/**
 * `h` creates elements (app.mjs's helper). Options: base (URL of the webchat), note(text) (a chat note), onChange() (the language list or a state changed),
 * spawn (tests), fetchFile (tests).
 */
export function createTranslationLayer({ base, h, note = () => {}, onChange = () => {}, spawn = null, fetchFile = null, nativeKind = browserTranslatorKind, nativeAvailability = browserTranslatorAvailability } = {}) {
  let registry = null, quality = null, host = null, initPromise = null;
  const nativeBoth = new Map();   // code -> 'available' | 'downloadable' | 'downloading' (both directions with English, the browser's own Translator)
  const download = new Map();     // code -> true while a user-visible download runs
  let showAll = false;

  // The proxy goes to createBrowserBackend({ mt }) before the registry is loaded: it knows nothing until `init()` finished.
  const mtProxy = {
    has: (l) => !!host?.has(l), state: (l) => host?.state(l) ?? { phase: 'idle', done: 0, total: 0 },
    translate: (t, f, to, o) => { if (!host) return Promise.reject(new Error('the translation model registry is not loaded')); return host.translate(t, f, to, o); },
  };

  const banner = h('div', { class: 'p2-mt-banner', role: 'status', 'aria-live': 'polite', hidden: true });
  let hideTimer = 0;
  function showBanner(text, { retry = null, progress = null, autoHide = 0 } = {}) {
    clearTimeout(hideTimer);
    banner.replaceChildren(h('span', { class: 'p2-mt-text' }, text),
      ...(progress != null ? [h('progress', { class: 'p2-mt-bar', max: '100', value: String(Math.round(progress)) })] : []),
      ...(retry ? [h('button', { class: 'p2-btn-text', type: 'button', onclick: retry }, 'Retry')] : []));
    banner.hidden = false;
    if (autoHide) hideTimer = setTimeout(() => { banner.hidden = true; }, autoHide);
  }

  async function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const get = (p) => fetch(new URL(p, base)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      [registry, quality] = await Promise.all([get('vendor/bergamot/registry.json'), get('vendor/bergamot/quality.json')]);
      if (globalThis.__psys2MtOff) registry = null;   // tests of the desktop rows (fake browser Translator): the on-device model is not used, nothing is downloaded
      if (registry) {
        host = createMtHost({
          registry, fetchFile: fetchFile ?? createCachedFetch(), onState: (lang, s) => stateChanged(lang, s),
          spawn: spawn ?? (() => new Worker(new URL('vendor/bergamot/translator-worker.js', base))),   // a classic worker (importScripts of the Emscripten glue)
        });
      }
      await probeNative();
      registerLanguages(listed().map((l) => l.code));
      onChange();
    })();
    return initPromise;
  }

  /** The browser Translator: which registry languages it supports in both directions with English (availability per pair, asked once, bounded). */
  async function probeNative() {
    if (!nativeKind()) return;
    const codes = Object.keys(registry?.langs ?? {}).concat(['ro']);
    await Promise.all([...new Set(codes)].map(async (c) => {
      const tag = c === 'zh_hant' ? 'zh-Hant' : c === 'zh' ? 'zh' : c;
      const ok = (a) => a === 'available' || a === 'downloadable' || a === 'downloading';
      const [a, b] = await Promise.all([nativeAvailability('en', tag), nativeAvailability(tag, 'en')]);
      if (ok(a) && ok(b)) nativeBoth.set(c, a === 'available' && b === 'available' ? 'available' : 'downloadable');
    }));
  }

  function qualityOf(code) { const q = quality?.languages?.[code]; return q && typeof q.right === 'number' ? q.right : null; }
  /** The languages the selector offers: English, Romanian, and every registry language that passed the gate (all of them with `showAll`). */
  function listed() {
    const out = [];
    const codes = [...new Set([...ALWAYS, ...Object.keys(registry?.langs ?? {}), ...nativeBoth.keys()])];
    for (const code of codes) {
      const right = qualityOf(code);
      const passes = ALWAYS.includes(code) || (right != null && right >= QUALITY_GATE);
      if (!passes && !showAll) continue;
      out.push({ code, name: langName(code, { own: true }), english: langName(code), right, gated: !passes, engine: engineOf(code), bytes: registry?.langs?.[code]?.bytes ?? 0 });
    }
    const rank = (c) => (c === 'en' ? 0 : c === 'ro' ? 1 : 2);
    return out.sort((a, b) => rank(a.code) - rank(b.code) || a.name.localeCompare(b.name));
  }
  /** 'none' for English; 'translator-api' when the browser's Translator serves both directions; 'on-device-model' when the registry has the language; else 'none'. */
  function engineOf(code) {
    if (code === 'en') return 'none';
    if (nativeBoth.has(code)) return 'translator-api';
    return host?.has(code) ? 'on-device-model' : 'none';
  }
  const needsModel = (code) => code !== 'en' && engineOf(code) === 'on-device-model';

  function stateChanged(lang, s) {
    if (s.phase === 'downloading') showBanner(`Downloading the translation model for ${langName(lang)} (${mbText(s.total)})… ${s.total ? Math.round((100 * s.done) / s.total) : 0}%`, { progress: s.total ? (100 * s.done) / s.total : 0 });
    else if (s.phase === 'loading') showBanner(`Loading the ${langName(lang)} translation model…`);
    else if (s.phase === 'ready' && download.get(lang)) { download.delete(lang); showBanner(`The ${langName(lang)} translation model is ready.`, { autoHide: 3000 }); }
    else if (s.phase === 'error') showBanner(`Could not get the ${langName(lang)} translation model: ${s.error}. Check the connection.`, { retry: () => prepare(lang).catch(() => {}) });
    try { onChange(); } catch { /* a listener must not break the host */ }
  }

  /** Starts what the language needs (the model download, or the browser translator's own), lazily: called when the language is selected. Never throws. */
  async function prepare(code) {
    await init();
    if (code === 'en') { banner.hidden = true; return; }
    if (!needsModel(code)) { banner.hidden = true; return; }   // the browser Translator (prepared by the backend) or nothing: no download here
    download.set(code, true);
    try { await host.ensure(code); } catch { /* the state and the banner say why */ }
  }

  /**
   * A turn in a non-English language waits here while that language's model downloads, so that its first message gets a real answer (the turn clock starts after).
   * Resolves { waited, ok }: ok false when the model could not be made ready (the engine then answers with what it has). `signal` aborts (the Stop button).
   */
  async function whenReady(code, { signal, onWaiting } = {}) {
    if (code === 'en' || !needsModel(code)) return { waited: 0, ok: true };
    const t0 = performance.now();
    if (host.state(code).phase === 'ready') return { waited: 0, ok: true };
    onWaiting?.(host.state(code));
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('the translation model took too long to download')), DOWNLOAD_LIMIT_MS));
    const aborted = new Promise((_, rej) => signal?.addEventListener('abort', () => rej(Object.assign(new Error('stopped'), { aborted: true })), { once: true }));
    try { await Promise.race([prepare(code).then(() => host.ensure(code)), timeout, aborted]); return { waited: performance.now() - t0, ok: true }; }
    catch (e) { if (e.aborted) throw e; return { waited: performance.now() - t0, ok: false, error: String(e?.message ?? e) }; }
  }

  return {
    mtProxy, banner, init, prepare, whenReady, listed, engineOf, qualityOf, needsModel,
    get host() { return host; }, get registry() { return registry; }, get quality() { return quality; },
    setShowAll(v) { showAll = !!v; registerLanguages(listed().map((l) => l.code)); onChange(); },
    get showAll() { return showAll; },
    /** One line per language for Settings > Language / About: engine, size, quality. */
    describe(code) {
      const q = qualityOf(code), e = engineOf(code), size = registry?.langs?.[code]?.bytes;
      return { code, name: langName(code), engine: e, size: size ? mbText(size) : null, right: q, state: host?.state(code)?.phase ?? null, flores: host?.flores(code) ?? null };
    },
    knownLanguages,
  };
}
