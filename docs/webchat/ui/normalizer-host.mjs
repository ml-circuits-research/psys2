// Host side of the phrasing normalizer (spec 03 section 7.12): a small seq2seq model (FLAN-T5-small, int8, two ONNX graphs) that proposes a simpler phrasing
// of a piece the rules did not read. It is only a fallback: the validation layer asks it when no original or spell-corrected reading validates,
// and accepts a rewrite only if the rules read it and the value checker passes. The core never imports onnxruntime; this module loads it lazily
// (same vendored onnxruntime-web WASM build as the dispatcher), caches every file by sha256 in the Cache API and hands the validator a provider.
//
//   const nz = createNormalizerHost({ base, meta, lib: { createNormalizerRuntime }, onStatus });
//   nz.provider        -> { propose({ world, tab, text, beam }) }   (answers { status: 'not_ready' } while the model is not loaded, and starts loading)

import { getOrtClient } from './ort-host.mjs';

export const MODEL_DIR = 'models/normalizer/';
const CACHE_NAME = 'psys2-normalizer-model';
const keyOf = (base, name, sha) => new URL(`${MODEL_DIR}${name}?sha256=${sha}`, base).href;

/** meta.json of the normalizer (fresh, else the copy in the model cache when offline), or null when this build has none. */
export async function findNormalizerModel(base) {
  try {
    if (typeof WebAssembly !== 'object') return null;
    const url = new URL(`${MODEL_DIR}meta.json`, base);
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (r.ok) {
        const meta = await r.json();
        try { (await caches.open(CACHE_NAME)).put(keyOf(base, 'meta.json', 'latest'), new Response(JSON.stringify(meta))); } catch { /* no Cache API */ }
        return meta;
      }
      if (r.status === 404) return null;
    } catch { /* offline */ }
    const hit = await caches.match(keyOf(base, 'meta.json', 'latest'), { cacheName: CACHE_NAME });
    return hit ? await hit.json() : null;
  } catch { return null; }
}

export const versionLabel = (meta) => (meta?.version ? `v${meta.version.export_date ?? '?'} ${String(meta.version.sha256 ?? '').slice(0, 8)}` : 'unversioned');

async function sha256Hex(bytes) {
  if (!globalThis.crypto?.subtle) return null;
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchBytes(url, onProgress) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url.pathname.split('/').pop()}: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body?.getReader) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  // bounded: reads a finite HTTP body to its end (reader.read returns done)
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    onProgress?.(got, total);
  }
  const out = new Uint8Array(got);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/** All model files of `meta`: from the Cache API when that exact version is cached, else downloaded, checked against the published sha256 and cached (older versions evicted). */
export async function getNormalizerFiles({ base, meta, onProgress = () => {} }) {
  const shas = meta?.version?.files_sha256 ?? {};
  let cache = null;
  try { cache = typeof caches === 'object' ? await caches.open(CACHE_NAME) : null; } catch { cache = null; }
  const files = {};
  let source = 'cache';
  for (const name of meta.files) {
    const sha = shas[name];
    const key = sha && keyOf(base, name, sha);
    let bytes = null;
    if (cache && key) { try { const hit = await cache.match(key); if (hit) bytes = new Uint8Array(await hit.arrayBuffer()); } catch { bytes = null; } }
    if (!bytes) {
      source = 'network';
      bytes = await fetchBytes(new URL(`${MODEL_DIR}${name}`, base), (got, total) => onProgress(`downloading ${name} ${(got / 1048576).toFixed(0)}${total ? ` / ${(total / 1048576).toFixed(0)}` : ''} MB`));
      if (sha) { const got = await sha256Hex(bytes); if (got && got !== sha) throw new Error(`${name} does not match the published version (sha256 ${got.slice(0, 8)} instead of ${sha.slice(0, 8)})`); }
      if (cache && key) { try { await cache.put(key, new Response(bytes)); } catch { /* quota or private mode */ } }
    }
    files[name] = bytes;
  }
  if (cache) {
    try {
      const keep = new Set(meta.files.map((n) => shas[n] && keyOf(base, n, shas[n])).filter(Boolean));
      for (const req of await cache.keys()) if (!keep.has(req.url) && !req.url.includes('meta.json')) await cache.delete(req);
    } catch { /* ignore */ }
  }
  return { files, source };
}

/**
 * The host object: `provider` for createDispatchValidator / createDispatcherFormalizer ({ normalizer }), `prepare()` to load in the background,
 * `status` { state: idle | loading | ready | error, message, ms, source }, `onStatus(fn)`. `lib` = { createNormalizerRuntime } of lib/dialog/normalizer-runtime.mjs.
 */
export function createNormalizerHost({ base, meta, lib, onStatus = () => {}, getOrt = () => getOrtClient(base) }) {
  let status = { state: 'idle', message: '' };
  let runtime = null, loading = null;
  const set = (s) => { status = s; try { onStatus(status); } catch { /* a listener must not break loading */ } };
  const prepare = () => {
    if (runtime) return Promise.resolve(runtime);
    if (!loading) {
      const t0 = performance.now();
      set({ state: 'loading', message: 'loading the phrasing normalizer' });
      loading = (async () => {
        const ortc = await getOrt(), { ort } = ortc;   // ORT runs in a dedicated worker we control (HANG2): deadlines, cancel, restart
        const { files, source } = await getNormalizerFiles({ base, meta, onProgress: (m) => set({ state: 'loading', message: m }) });
        set({ state: 'loading', message: 'starting the normalizer' });
        const again = async (name) => (await getNormalizerFiles({ base, meta })).files[name];   // after a worker restart: from the Cache API
        const src = (name) => { let first = files[name]; return async () => { if (first) { const b = first; first = null; return b; } return again(name); }; };
        const encoder = await ort.InferenceSession.create(src('encoder.int8.onnx'), { name: 'normalizer.encoder', lane: 'normalizer', deadlineMs: () => ortc.limits?.normalizerMs ?? 3000 });
        const decoder = await ort.InferenceSession.create(src('decoder.int8.onnx'), { name: 'normalizer.decoder', lane: 'normalizer', deadlineMs: () => ortc.limits?.normalizerMs ?? 3000 });
        const tokenizer = JSON.parse(new TextDecoder().decode(files['tokenizer.json']));
        runtime = lib.createNormalizerRuntime({ ort, encoder, decoder, tokenizer, config: meta.config });
        set({ state: 'ready', message: 'normalizer ready', ms: Math.round(performance.now() - t0), source });
        return runtime;
      })().catch((e) => { loading = null; set({ state: 'error', message: e?.message ?? String(e) }); throw e; });
    }
    return loading;
  };
  const host = {
    timings: [],
    prepare, meta, get status() { return status; }, label: versionLabel(meta),
    provider: {
      /** Model version and state: the validator drops its memo of rewrites when this changes (loading -> ready, a new model version). */
      stamp: () => `${versionLabel(meta)}|${status.state}`,
      /** Rewrites of a piece the rules did not read, as { status: 'not_ready' | 'error' | 'ready', rewrites }. Not loaded yet: starts loading and answers not_ready (the rules answer meanwhile; the validator does not remember it). */
      async propose(req) {
        if (!runtime) { if (status.state !== 'error') { prepare().catch(() => {}); return { status: 'not_ready', rewrites: [] }; } return { status: 'error', rewrites: [] }; }
        const t0 = performance.now();
        const out = await runtime.propose(req);
        host.timings.push(Math.round(performance.now() - t0));
        console.debug('normalizer propose ms', host.timings[host.timings.length - 1], JSON.stringify(req.text).slice(0, 60));
        return { status: 'ready', rewrites: out };
      },
    },
  };
  return host;
}
