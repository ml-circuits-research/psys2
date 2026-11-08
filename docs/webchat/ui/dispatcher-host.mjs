// Host side of the Encoder formalizer (spec 06 "Formalizer strategies"): finds the dispatcher model files and loads onnxruntime-web
// (vendor/onnxruntime, WASM backend, single thread, no COOP/COEP needed) lazily. The core (lib/) never imports onnxruntime; this module
// hands the loaded pieces to `createDispatcherFormalizer({ load })` (lib/dialog/encoder-dispatch.mjs).

export const MODEL_DIR = 'models/dispatcher/';

/** The model's meta.json, or null when this build has no dispatcher model (the Encoder option then stays unavailable). */
export async function findDispatcherModel(base) {
  try {
    if (typeof WebAssembly !== 'object') return null;
    const r = await fetch(new URL(`${MODEL_DIR}meta.json`, base));
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function fetchBytes(url, onProgress) {
  const res = await fetch(url);
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
 * Returns the `load` function for createDispatcherFormalizer. `lib` = { createWordPieceTokenizer } of lib/formalizer/wordpiece.mjs;
 * `onProgress(text)` receives short loading messages for the UI.
 */
export function dispatcherLoader({ base, meta, lib, onProgress = () => {} }) {
  return async () => {
    onProgress('loading the runtime…');
    const ort = await import(new URL('vendor/onnxruntime/ort.wasm.bundle.min.mjs', base).href);
    ort.env.wasm.wasmPaths = new URL('vendor/onnxruntime/', base).href;
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    const vocab = await (await fetch(new URL(`${MODEL_DIR}vocab.txt`, base))).text();
    const bytes = await fetchBytes(new URL(`${MODEL_DIR}model.int8.onnx`, base), (got, total) => {
      const mb = (n) => (n / 1048576).toFixed(0);
      onProgress(total ? `downloading the model ${mb(got)} / ${mb(total)} MB` : `downloading the model ${mb(got)} MB`);
    });
    onProgress('starting the model…');
    const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    return { ort, session, tokenizer: lib.createWordPieceTokenizer(vocab), worlds: meta.worlds, useContext: meta.context !== false };
  };
}
