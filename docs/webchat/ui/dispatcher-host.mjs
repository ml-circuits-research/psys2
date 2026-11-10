// Host side of the Encoder formalizer (spec 06 "Formalizer strategies"): finds the dispatcher model files and loads onnxruntime-web
// (vendor/onnxruntime, WASM backend, single thread, no COOP/COEP needed) lazily. The core (lib/) never imports onnxruntime; this module
// hands the loaded pieces to `createDispatcherFormalizer({ load })` (lib/dialog/encoder-dispatch.mjs).

// ort-host is loaded by URL, not by a static import: the engine worker has no import map, so it resolves versioned URLs itself (`globalThis.__psys2Url`, ui/engine-worker.mjs)
const getOrtClient = async (base) => (await import(globalThis.__psys2Url ? globalThis.__psys2Url('ui/ort-host.mjs') : new URL('ui/ort-host.mjs', base).href)).getOrtClient(base);

export const MODEL_DIR = 'models/dispatcher/';

const CACHE_NAME = 'psys2-dispatcher-model';
// synthetic Cache API keys, one set per published sha256 AND output signature (URGENT-FREEZE: a cached model whose outputs differ from what meta.json promises is never reused)
let outSig = '';
const keyOf = (base, name, sha) => new URL(`${MODEL_DIR}${name}?sha256=${sha}${sha === 'latest' || !outSig ? '' : `&out=${outSig}`}`, base).href;

/** The model's meta.json fetched fresh (never from the HTTP cache), or the copy kept in the model cache when offline, or null when this build has no model. */
export async function findDispatcherModel(base) {
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
    } catch { /* offline: try the cached copy */ }
    const hit = await caches.match(keyOf(base, 'meta.json', 'latest'), { cacheName: CACHE_NAME });
    return hit ? await hit.json() : null;
  } catch { return null; }
}

/** Short label of the published version for the status line: "v<export date> <sha8>". */
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

/**
 * The model files for `meta.version.sha256`: from the Cache API when that exact version is cached (instant), else downloaded, checked against
 * the published sha256, cached under it, and every older version evicted. Without a published sha256 (or without the Cache API) it just downloads.
 * Returns { bytes, vocab, source: 'cache' | 'network' }.
 */
export async function getModelFiles({ base, meta, onProgress = () => {} }) {
  const sha = meta?.version?.sha256 ?? null;
  outSig = (meta?.onnx?.outputs ?? []).map((o) => String(o).replace(/_logits$/, '')).join('+');
  let cache = null;
  try { cache = sha && typeof caches === 'object' ? await caches.open(CACHE_NAME) : null; } catch { cache = null; }
  const mKey = sha && keyOf(base, 'model.int8.onnx', sha), vKey = sha && keyOf(base, 'vocab.txt', sha);
  if (cache) {
    try {
      const [m, v] = await Promise.all([cache.match(mKey), cache.match(vKey)]);
      if (m && v) { evictStale(cache, mKey, vKey); onProgress('loading the model from the cache…'); return { bytes: new Uint8Array(await m.arrayBuffer()), vocab: await v.text(), source: 'cache' }; }
    } catch { /* unreadable cache entry: download again */ }
  }
  const vocab = await (await fetch(new URL(`${MODEL_DIR}vocab.txt`, base), { cache: 'no-cache' })).text();
  const bytes = await fetchBytes(new URL(`${MODEL_DIR}model.int8.onnx`, base), (got, total) => {
    const mb = (n) => (n / 1048576).toFixed(0);
    onProgress(total ? `downloading the model ${mb(got)} / ${mb(total)} MB` : `downloading the model ${mb(got)} MB`);
  });
  if (sha) {
    const got = await sha256Hex(bytes);
    if (got && got !== sha) throw new Error(`the downloaded model does not match the published version (sha256 ${got.slice(0, 8)} instead of ${sha.slice(0, 8)}); try again in a few minutes`);
  }
  if (cache) {
    try {
      await cache.put(mKey, new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }));
      await cache.put(vKey, new Response(vocab));
      await evictStale(cache, mKey, vKey);   // evict old versions
    } catch { /* quota exceeded or private mode: the model still works, it is just downloaded next time */ }
  }
  return { bytes, vocab, source: 'network' };
}

/** Deletes every cached model file that is not the current (sha, outputs) pair; never throws. */
async function evictStale(cache, mKey, vKey) {
  try { for (const req of await cache.keys()) if (req.url !== mKey && req.url !== vKey && !req.url.includes('meta.json')) await cache.delete(req); } catch { /* best effort */ }
}

/**
 * Returns the `load` function for createDispatcherFormalizer. `lib` = { createWordPieceTokenizer } of lib/formalizer/wordpiece.mjs;
 * `onProgress(text)` receives short loading messages for the UI; `onSource(source)` is told 'cache' or 'network'.
 */
export function dispatcherLoader({ base, meta, lib, onProgress = () => {}, onSource = () => {} }) {
  return async () => {
    onProgress('loading the runtime…');
    const ortc = await getOrtClient(base), { ort } = ortc;   // ORT runs in a dedicated worker we control (HANG2): deadlines, cancel, restart
    const { bytes, vocab, source } = await getModelFiles({ base, meta, onProgress });
    onSource(source);
    let editTags = null;   // rephraser (edit-tag head): its tag vocabulary sits next to the model
    if (meta.onnx?.outputs?.includes('edit_logits')) editTags = (await (await fetch(new URL(`${MODEL_DIR}edit-vocab.json`, base), { cache: 'no-cache' })).json()).tags;
    onProgress('starting the model…');
    // the session reloads its bytes from the Cache API when the worker is re-created; the first load hands out the bytes already in memory
    let first = bytes;
    const session = await ort.InferenceSession.create(async () => { if (first) { const b = first; first = null; return b; } return (await getModelFiles({ base, meta })).bytes; }, { name: 'dispatcher', lane: 'dispatcher', deadlineMs: () => ortc.limits?.dispatcherMs ?? 2500 });
    return { ort, session, tokenizer: lib.createWordPieceTokenizer(vocab), worlds: meta.worlds, editTags, editTau: meta.edit_threshold ?? 0.5, useContext: meta.context !== false, nx: meta.nx ?? null };
  };
}
